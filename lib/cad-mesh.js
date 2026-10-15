// Triangle meshes for the CAD app: STL (binary and ASCII), OBJ and 3MF in and out, and a mesh's size, area and
// volume. A mesh is {pos: Float32Array of triangles (x y z × 3 per triangle), name}. Lengths in inches; files with no
// units (STL, OBJ) are read in the units asked for. 3MF is a zip: reading needs an inflate (raw deflate) function
// (Node's zlib.inflateRawSync, or the browser's DecompressionStream wrapped); writing stores the parts uncompressed.
// Works in the browser (window.CADMesh) and in Node (require('./lib/cad-mesh.js')).
(function (root) {
  'use strict';
  const UNIT_IN = { in: 1, inch: 1, mm: 1 / 25.4, millimeter: 1 / 25.4, cm: 1 / 2.54, centimeter: 1 / 2.54, m: 1000 / 25.4, meter: 1000 / 25.4, micron: 1 / 25400, ft: 12, foot: 12 };
  const td = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  const text = u8 => td ? td.decode(u8) : Buffer.from(u8).toString('utf8');
  const u8 = x => x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x.buffer, x.byteOffset, x.byteLength);

  // ---------------------------------------------------------------- STL
  function readSTL(data, units) {
    const b = u8(data), k = UNIT_IN[units || 'mm'] || 1;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const binary = b.length >= 84 && 84 + dv.getUint32(80, true) * 50 === b.length;
    let pos;
    if (binary) {
      const n = dv.getUint32(80, true); pos = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) pos[i * 9 + j] = dv.getFloat32(84 + i * 50 + 12 + j * 4, true) * k;
    } else {
      const s = text(b), v = []; const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g; let m;
      while ((m = re.exec(s))) v.push(+m[1] * k, +m[2] * k, +m[3] * k);
      if (!v.length) throw new Error('No triangles in this STL');
      pos = new Float32Array(v.length - v.length % 9); pos.set(v.slice(0, pos.length));
    }
    return { pos, name: '' };
  }
  function writeSTL(mesh, units) {
    const k = 1 / (UNIT_IN[units || 'mm'] || 1), p = mesh.pos, n = p.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
    const head = 'MACH1 CAD ' + (units || 'mm'); for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
    dv.setUint32(80, n, true);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50, t = p.subarray(i * 9, i * 9 + 9), nn = normal(t);
      for (let j = 0; j < 3; j++) dv.setFloat32(o + j * 4, nn[j], true);
      for (let j = 0; j < 9; j++) dv.setFloat32(o + 12 + j * 4, t[j] * k, true);
    }
    return new Uint8Array(buf);
  }
  function normal(t) {
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l];
  }

  // ---------------------------------------------------------------- OBJ
  function readOBJ(data, units) {
    const s = typeof data === 'string' ? data : text(u8(data)), k = UNIT_IN[units || 'mm'] || 1, V = [], out = [];
    for (const raw of s.split(/\r?\n/)) {
      const l = raw.trim(); if (!l || l[0] === '#') continue;
      const w = l.split(/\s+/);
      if (w[0] === 'v') V.push([+w[1] * k, +w[2] * k, +w[3] * k]);
      else if (w[0] === 'f') {
        const idx = w.slice(1).map(x => { const i = parseInt(x, 10); return i < 0 ? V.length + i : i - 1; });
        for (let j = 1; j + 1 < idx.length; j++) for (const q of [idx[0], idx[j], idx[j + 1]]) { const v = V[q]; if (!v) throw new Error('A face uses a vertex that is not there'); out.push(v[0], v[1], v[2]); }
      }
    }
    if (!out.length) throw new Error('No faces in this OBJ');
    return { pos: new Float32Array(out), name: '' };
  }
  function writeOBJ(mesh, units) {
    const k = 1 / (UNIT_IN[units || 'mm'] || 1), { idx, verts } = weld(mesh.pos), L = ['# MACH1 CAD, ' + (units || 'mm'), 'o ' + (mesh.name || 'body').replace(/\s+/g, '_')];
    for (let i = 0; i < verts.length; i += 3) L.push('v ' + num(verts[i] * k) + ' ' + num(verts[i + 1] * k) + ' ' + num(verts[i + 2] * k));
    for (let i = 0; i < idx.length; i += 3) L.push('f ' + (idx[i] + 1) + ' ' + (idx[i + 1] + 1) + ' ' + (idx[i + 2] + 1));
    return L.join('\n') + '\n';
  }
  const num = v => String(+(+v).toPrecision(9));
  // Shared vertices (exact matches, -0 the same as 0): idx, a vertex number for each corner, and verts, x y z of each.
  // Typed arrays and an open-addressed hash on the floats' bits, as a million triangles have three million corners.
  function weld(pos) {
    const nv = pos.length / 3, B = new Uint32Array(pos.length), F = new Float32Array(B.buffer);
    for (let i = 0; i < pos.length; i++) { F[i] = pos[i]; if (B[i] === 0x80000000) B[i] = 0; }
    let size = 16; while (size < nv * 2) size *= 2;
    const table = new Int32Array(size).fill(-1), idx = new Uint32Array(nv), firstOf = new Uint32Array(nv), mask = size - 1;
    let n = 0;
    for (let i = 0; i < nv; i++) {
      const a = B[3 * i], b = B[3 * i + 1], c = B[3 * i + 2];
      let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & mask;
      for (;;) {
        const k = table[h];
        if (k < 0) { table[h] = n; firstOf[n] = i; idx[i] = n++; break; }
        const j = firstOf[k]; if (B[3 * j] === a && B[3 * j + 1] === b && B[3 * j + 2] === c) { idx[i] = k; break; }
        h = (h + 1) & mask;
      }
    }
    const verts = new Float32Array(n * 3); for (let k = 0; k < n; k++) { const j = firstOf[k]; verts[3 * k] = F[3 * j]; verts[3 * k + 1] = F[3 * j + 1]; verts[3 * k + 2] = F[3 * j + 2]; }
    return { idx, verts };
  }

  // ---------------------------------------------------------------- zip (for 3MF)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = s => typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : new Uint8Array(Buffer.from(s, 'utf8'));
  // files {name: Uint8Array} → a zip with nothing compressed
  function zip(files) {
    const parts = [], cen = []; let off = 0;
    for (const [name, data] of Object.entries(files)) {
      const nm = enc(name), c = crc32(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      const d = new DataView(new ArrayBuffer(46));
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint32(16, c, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, nm.length, true); d.setUint32(42, off, true);
      cen.push(new Uint8Array(d.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const cs = cen.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22)), n = Object.keys(files).length;
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, n, true); e.setUint16(10, n, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
    const all = parts.concat(cen, [new Uint8Array(e.buffer)]), out = new Uint8Array(all.reduce((s, x) => s + x.length, 0)); let p = 0;
    for (const x of all) { out.set(x, p); p += x.length; }
    return out;
  }
  // a zip's files: {name: Uint8Array}; inflate(rawDeflateBytes) → bytes (may return a promise)
  async function unzip(data, inflate) {
    const b = u8(data), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Not a zip file');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = text(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = b.subarray(ds, ds + csize);
      if (method === 0) out[name] = raw.slice();
      else if (method === 8) { if (!inflate) throw new Error('This page cannot unpack the 3MF file'); out[name] = u8(await inflate(raw)); }
      else throw new Error('A 3MF part is packed in a way this page does not know (method ' + method + ')');
    }
    return out;
  }

  // ---------------------------------------------------------------- 3MF
  async function read3MF(data, inflate) {
    const files = await unzip(data, inflate), key = Object.keys(files).find(k => /\.model$/i.test(k) && /3d\//i.test(k)) || Object.keys(files).find(k => /\.model$/i.test(k));
    if (!key) throw new Error('No 3D model in this 3MF file');
    const s = text(files[key]), unit = (/<model[^>]*\sunit="([^"]+)"/.exec(s) || [])[1] || 'millimeter', k = UNIT_IN[unit] || 1 / 25.4;
    // objects: their own triangles, or components (other objects with transforms)
    const objs = new Map(), ore = /<object\b([^>]*)>([\s\S]*?)<\/object>/g; let m;
    const attr = (a, n) => (new RegExp('\\b' + n + '="([^"]*)"').exec(a) || [])[1];
    while ((m = ore.exec(s))) {
      const id = attr(m[1], 'id'), body = m[2], V = [], tris = [], comps = [];
      const vre = /<vertex\b([^>]*)\/?>/g; let v; while ((v = vre.exec(body))) V.push([+attr(v[1], 'x'), +attr(v[1], 'y'), +attr(v[1], 'z')]);
      const tre = /<triangle\b([^>]*)\/?>/g; let t; while ((t = tre.exec(body))) tris.push([+attr(t[1], 'v1'), +attr(t[1], 'v2'), +attr(t[1], 'v3')]);
      const cre = /<component\b([^>]*)\/?>/g; let c; while ((c = cre.exec(body))) comps.push({ id: attr(c[1], 'objectid'), tf: tfOf(attr(c[1], 'transform')) });
      objs.set(id, { V, tris, comps, name: attr(m[1], 'name') || '' });
    }
    const out = [];
    const emit = (id, tf, depth) => {
      const o = objs.get(id); if (!o || depth > 16) return;
      for (const tr of o.tris) for (const q of tr) { const p = apply(tf, o.V[q]); out.push(p[0] * k, p[1] * k, p[2] * k); }
      for (const c of o.comps) emit(c.id, mulTf(tf, c.tf), depth + 1);
    };
    const ire = /<item\b([^>]*)\/?>/g; let it, items = 0;
    while ((it = ire.exec(s))) { items++; emit(attr(it[1], 'objectid'), tfOf(attr(it[1], 'transform')), 0); }
    if (!items) for (const id of objs.keys()) emit(id, tfOf(null), 0);
    if (!out.length) throw new Error('No triangles in this 3MF file');
    return { pos: new Float32Array(out), name: [...objs.values()][0].name, units: unit };
  }
  // 3MF transforms: 12 numbers, column-major 3×4 (m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32) applied as p·M
  const tfOf = s => { const v = (s || '').trim().split(/\s+/).map(Number); return v.length === 12 && v.every(isFinite) ? v : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; };
  const apply = (m, p) => [p[0] * m[0] + p[1] * m[3] + p[2] * m[6] + m[9], p[0] * m[1] + p[1] * m[4] + p[2] * m[7] + m[10], p[0] * m[2] + p[1] * m[5] + p[2] * m[8] + m[11]];
  // a then b (a component's transform within its parent's)
  const mulTf = (parent, child) => { const r = []; for (let i = 0; i < 4; i++) { const row = i < 3 ? [child[i * 3], child[i * 3 + 1], child[i * 3 + 2]] : [child[9], child[10], child[11]]; for (let j = 0; j < 3; j++) r.push(row[0] * parent[j] + row[1] * parent[3 + j] + row[2] * parent[6 + j] + (i === 3 ? parent[9 + j] : 0)); } return r; };
  function write3MF(meshes, units) {
    const u = units || 'mm', k = 1 / (UNIT_IN[u] || 1), unit = { mm: 'millimeter', in: 'inch' }[u] || 'millimeter';
    let objs = '', items = '';
    meshes.forEach((me, n) => {
      const { idx, verts } = weld(me.pos), V = [], Tr = [];
      for (let i = 0; i < verts.length; i += 3) V.push(`<vertex x="${num(verts[i] * k)}" y="${num(verts[i + 1] * k)}" z="${num(verts[i + 2] * k)}"/>`);
      for (let i = 0; i < idx.length; i += 3) Tr.push(`<triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}"/>`);
      objs += `<object id="${n + 1}" type="model" name="${String(me.name || 'body ' + (n + 1)).replace(/[<>&"]/g, '')}"><mesh><vertices>${V.join('')}</vertices><triangles>${Tr.join('')}</triangles></mesh></object>`;
      items += `<item objectid="${n + 1}"/>`;
    });
    return zip({
      '[Content_Types].xml': enc('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
      '_rels/.rels': enc('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
      '3D/3dmodel.model': enc(`<?xml version="1.0" encoding="UTF-8"?><model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objs}</resources><build>${items}</build></model>`),
    });
  }

  // ---------------------------------------------------------------- measuring
  // size, surface area and enclosed volume (for a closed mesh; signed sum of tetrahedra from the origin); closed may
  // be given when it is already known
  function info(mesh, closed) {
    const p = mesh.pos, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let area = 0, vol = 0;
    for (let i = 0; i < p.length; i += 9) {
      for (let j = 0; j < 9; j += 3) for (let a = 0; a < 3; a++) { const v = p[i + j + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
      const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5], cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return { tris: p.length / 9, min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], area, volume: Math.abs(vol), closed: closed === undefined ? isClosed(p) : closed };
  }
  // ---------------------------------------------------------------- big meshes: edges, normals, picking
  // The edges of a mesh as pairs of vertex numbers, once each: for each, how many triangles use it, the first two of
  // them, and the balance of its two directions (+1 one way, -1 the other). Keys are lo × n + hi in a hash.
  function edgeTable(idx, nverts) {
    const T = idx.length / 3; let size = 16; while (size < T * 3 * 1.5) size *= 2;
    const keys = new Float64Array(size).fill(-1), cnt = new Uint32Array(size), t1 = new Int32Array(size).fill(-1), t2 = new Int32Array(size).fill(-1), bal = new Int32Array(size), mask = size - 1;
    for (let t = 0; t < T; t++) for (let j = 0; j < 3; j++) {
      const a = idx[3 * t + j], b = idx[3 * t + (j + 1) % 3]; if (a === b) continue;
      const lo = a < b ? a : b, hi = a < b ? b : a, key = lo * nverts + hi;
      let h = (Math.imul(lo, 73856093) ^ Math.imul(hi, 19349663)) & mask;
      while (keys[h] !== -1 && keys[h] !== key) h = (h + 1) & mask;
      if (keys[h] === -1) { keys[h] = key; t1[h] = t; } else if (t2[h] < 0) t2[h] = t;
      cnt[h]++; bal[h] += a < b ? 1 : -1;
    }
    return { keys, cnt, t1, t2, bal, size };
  }
  // one normal per triangle, given to each of its corners (flat shading)
  function faceNormals(pos) {
    const nrm = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 9) {
      const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
      let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      for (let k = 0; k < 9; k += 3) { nrm[i + k] = x; nrm[i + k + 1] = y; nrm[i + k + 2] = z; }
    }
    return nrm;
  }
  // what the screen needs of a mesh: normals, its sharp edges (where the faces meet at more than angle degrees, and
  // its open edges) as line pairs, whether it is closed, and a box tree for picking
  function prep(pos, angle) {
    const { idx, verts } = weld(pos), n = verts.length / 3, E = edgeTable(idx, n), nrm = faceNormals(pos), cosA = Math.cos((angle === undefined ? 28 : angle) * Math.PI / 180);
    const lines = []; let closed = true;
    for (let h = 0; h < E.size; h++) {
      if (E.keys[h] === -1) continue;
      if (E.bal[h] !== 0) closed = false;
      const a = E.t1[h], b = E.t2[h];
      if (E.cnt[h] === 2 && b >= 0 && nrm[9 * a] * nrm[9 * b] + nrm[9 * a + 1] * nrm[9 * b + 1] + nrm[9 * a + 2] * nrm[9 * b + 2] > cosA) continue;
      const lo = Math.floor(E.keys[h] / n), hi = E.keys[h] - lo * n;
      lines.push(verts[3 * lo], verts[3 * lo + 1], verts[3 * lo + 2], verts[3 * hi], verts[3 * hi + 1], verts[3 * hi + 2]);
    }
    return { nrm, edges: new Float32Array(lines), closed, bvh: bvh(pos) };
  }
  // A box tree over the triangles (index: corners as vertex numbers into pos; without it, pos is plain triangles):
  // nodes' boxes (6 floats each) and, per node, its first triangle in order and count (a leaf) or its first child
  // (count 0, the second child follows it).
  function bvh(pos, index) {
    const T = index ? index.length / 3 : pos.length / 9, at = index ? (t, k, c) => pos[3 * index[3 * t + k] + c] : (t, k, c) => pos[9 * t + 3 * k + c];
    const lo = new Float32Array(T * 3), hi = new Float32Array(T * 3), cen = new Float32Array(T * 3), order = new Uint32Array(T);
    for (let t = 0; t < T; t++) { order[t] = t; for (let c = 0; c < 3; c++) { const a = at(t, 0, c), b = at(t, 1, c), d = at(t, 2, c); lo[3 * t + c] = Math.min(a, b, d); hi[3 * t + c] = Math.max(a, b, d); cen[3 * t + c] = (a + b + d) / 3; } }
    const maxN = 2 * Math.ceil(T / 2) + 2, box = new Float32Array(maxN * 6), meta = new Uint32Array(maxN * 2); let nodes = 1;
    const stack = [[0, 0, T]];
    while (stack.length) {
      const [nd, s, e] = stack.pop();
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, c0 = [Infinity, Infinity, Infinity], c1 = [-Infinity, -Infinity, -Infinity];
      for (let i = s; i < e; i++) { const t = order[i]; x0 = Math.min(x0, lo[3 * t]); y0 = Math.min(y0, lo[3 * t + 1]); z0 = Math.min(z0, lo[3 * t + 2]); x1 = Math.max(x1, hi[3 * t]); y1 = Math.max(y1, hi[3 * t + 1]); z1 = Math.max(z1, hi[3 * t + 2]); for (let c = 0; c < 3; c++) { c0[c] = Math.min(c0[c], cen[3 * t + c]); c1[c] = Math.max(c1[c], cen[3 * t + c]); } }
      box.set([x0, y0, z0, x1, y1, z1], nd * 6);
      if (e - s <= 8) { meta[2 * nd] = s; meta[2 * nd + 1] = e - s; continue; }
      const ax = c1[0] - c0[0] >= c1[1] - c0[1] && c1[0] - c0[0] >= c1[2] - c0[2] ? 0 : c1[1] - c0[1] >= c1[2] - c0[2] ? 1 : 2, mid = (s + e) >> 1;
      select(order, s, e - 1, mid, t => cen[3 * t + ax]);
      const l = nodes; nodes += 2; meta[2 * nd] = l; meta[2 * nd + 1] = 0;
      stack.push([l, s, mid], [l + 1, mid, e]);
    }
    return { box: box.slice(0, nodes * 6), meta: meta.slice(0, nodes * 2), order };
  }
  // order[k] becomes the one that would be there were order[s..e] sorted by key (and smaller ones before it)
  function select(a, s, e, k, key) {
    while (e > s) {
      const pv = key(a[(s + e) >> 1]); let i = s, j = e;
      while (i <= j) { while (key(a[i]) < pv) i++; while (key(a[j]) > pv) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } }
      if (k <= j) e = j; else if (k >= i) s = i; else return;
    }
  }
  // the first triangle a ray o + t d (t > 0) meets, through the box tree; accept(t) may turn a hit down (a section).
  // {t, tri} or null
  function raycast(B, pos, index, o, d, accept) {
    const at = index ? (t, k, c) => pos[3 * index[3 * t + k] + c] : (t, k, c) => pos[9 * t + 3 * k + c];
    const inv = [1 / d[0], 1 / d[1], 1 / d[2]], stack = [0]; let best = null;
    const slab = nd => { let t0 = 0, t1 = best ? best.t : Infinity; for (let c = 0; c < 3; c++) { let a = (B.box[6 * nd + c] - o[c]) * inv[c], b = (B.box[6 * nd + 3 + c] - o[c]) * inv[c]; if (a > b) { const x = a; a = b; b = x; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; } return true; };
    while (stack.length) {
      const nd = stack.pop(); if (!slab(nd)) continue;
      const first = B.meta[2 * nd], count = B.meta[2 * nd + 1];
      if (!count) { stack.push(first, first + 1); continue; }
      for (let i = first; i < first + count; i++) {
        const t = B.order[i], ax = at(t, 0, 0), ay = at(t, 0, 1), az = at(t, 0, 2);
        const e1x = at(t, 1, 0) - ax, e1y = at(t, 1, 1) - ay, e1z = at(t, 1, 2) - az, e2x = at(t, 2, 0) - ax, e2y = at(t, 2, 1) - ay, e2z = at(t, 2, 2) - az;
        const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-20) continue;
        const f = 1 / det, sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az, u = (sx * px + sy * py + sz * pz) * f; if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * f; if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * f;
        if (tt > 0 && (!best || tt < best.t) && (!accept || accept(tt))) best = { t: tt, tri: t };
      }
    }
    return best;
  }
  // every edge used twice (once each way): a watertight mesh
  function isClosed(p) {
    if (!p.length) return false;
    const { idx, verts } = weld(p), E = edgeTable(idx, verts.length / 3);
    for (let h = 0; h < E.size; h++) if (E.keys[h] !== -1 && E.bal[h] !== 0) return false;
    return true;
  }
  // a 4×4 (column-major, like three.js) applied to every vertex
  function transform(mesh, m) {
    const p = mesh.pos, q = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1], z = p[i + 2]; q[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; q[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; q[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
    const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    if (det < 0) for (let i = 0; i < q.length; i += 9) for (let j = 0; j < 3; j++) { const t = q[i + 3 + j]; q[i + 3 + j] = q[i + 6 + j]; q[i + 6 + j] = t; }   // a mirror turns the triangles inside out: swap two corners back
    return Object.assign({}, mesh, { pos: q });
  }
  // points (x y z after x y z) moved by a 4×4, as for a body's edges
  function transformPts(p, m) {
    const q = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1], z = p[i + 2]; q[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; q[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; q[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
    return q;
  }
  // the mesh as text for a project file (base64 of the floats) and back
  function toB64(f32) { const b = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); if (typeof Buffer !== 'undefined') return Buffer.from(b).toString('base64'); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function fromB64(s) { const b = typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), c => c.charCodeAt(0)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
  // a box as a mesh (for tests)
  function box(x0, y0, z0, x1, y1, z1) {
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    return { pos: new Float32Array(F.flatMap(f => f.flatMap(i => P[i]))), name: 'box' };
  }

  const api = { readSTL, writeSTL, readOBJ, writeOBJ, read3MF, write3MF, info, isClosed, transform, weld, faceNormals, prep, bvh, raycast, transformPts, zip, unzip, crc32, toB64, fromB64, box, UNIT_IN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CADMesh = api;
})(this);
