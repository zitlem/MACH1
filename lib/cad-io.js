// Files for the CAD app: DXF in (ASCII: lines, arcs, circles, points, polylines with bulges, splines, ellipses, blocks,
// layers, colours and units, entities in any of the three planes) and out (R12), SVG in and out, and PDF out.
// Entities come back as lib/cad-geom.js geometry with the plane, depth, level and colour they belong on; everything
// in inches. Works in the browser (window.CADIO, after CADGeom) and in Node (require('./lib/cad-io.js')).
(function (root) {
  'use strict';
  const G = root.CADGeom || (typeof require !== 'undefined' ? require('./cad-geom.js') : null);
  const D = () => root.CADDraft || (typeof require !== 'undefined' ? require('./cad-draft.js') : null);
  // DXF's special characters in text: %%c Ø, %%d °, %%p ±; MTEXT's formatting codes taken out
  const dxfText = t => String(t || '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%');
  const mtext = t => dxfText(String(t || '').replace(/\\P/g, ' ').replace(/\\~/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, ''));
  const toDxfText = t => String(t).replace(/Ø/g, '%%c').replace(/°/g, '%%d').replace(/±/g, '%%p');
  const PI = Math.PI, deg = r => r * 180 / PI, rad = d => d * PI / 180;
  const MAXENTS = 2e6;             // the most entities read from one file
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const PLANES = {
    top: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
    front: { x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] },
    right: { x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] },
  };
  // AutoCAD colour index → colour (the common ones; the rest grey)
  const ACI = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#e8e8e8', 8: '#808080', 9: '#c0c0c0', 30: '#ff7f00', 250: '#333333', 251: '#505050', 252: '#696969', 253: '#828282', 254: '#bebebe', 255: '#ffffff' };
  const aciColor = n => ACI[Math.abs(n)] || '#9aa6ae';
  function colorAci(hex) {
    const h = String(hex || '').toLowerCase();
    for (const [k, v] of Object.entries(ACI)) if (v === h) return +k;
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(h); if (!m) return 7;
    const c = [m[1], m[2], m[3]].map(x => parseInt(x, 16));
    let best = 7, bd = Infinity; for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 30]) { const q = ACI[k].slice(1).match(/../g).map(x => parseInt(x, 16)), d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } }
    return best;
  }
  // inches per drawing unit for $INSUNITS
  const DXF_UNITS = { 1: 1, 2: 12, 3: 63360, 4: 1 / 25.4, 5: 1 / 2.54, 6: 1000 / 25.4, 8: 1e-6, 9: 0.001, 10: 36, 13: 1 / 25400, 14: 1 / 254 };

  // ================================================================ DXF in
  function dxfPairs(text) {
    const L = String(text).split(/\r?\n/), out = [];
    for (let i = 0; i + 1 < L.length; i += 2) { const c = parseInt(L[i].trim(), 10); if (!isFinite(c)) { i--; continue; } out.push([c, L[i + 1].replace(/\s+$/, '')]); }
    return out;
  }
  // the arbitrary axis algorithm: the x and y of an entity's own coordinate system (OCS) for its extrusion n
  function ocs(n) {
    n = norm3(n);
    const ax = Math.abs(n[0]) < 1 / 64 && Math.abs(n[1]) < 1 / 64 ? norm3(cross3([0, 1, 0], n)) : norm3(cross3([0, 0, 1], n));
    return { x: ax, y: norm3(cross3(n, ax)), n };
  }
  // the plane a normal belongs to (or null when it is tilted)
  function planeOf(n) {
    const a = norm3(n);
    if (Math.abs(Math.abs(a[2]) - 1) < 1e-9) return 'top';
    if (Math.abs(Math.abs(a[1]) - 1) < 1e-9) return 'front';
    if (Math.abs(Math.abs(a[0]) - 1) < 1e-9) return 'right';
    return null;
  }
  // geometry drawn in a coordinate system (axes ax, ay, normal n, at elevation z) moved onto a plane: [geometry, depth]
  function ontoPlane(g, sys, z, pl) {
    const P = PLANES[pl];
    const m = [dot3(sys.x, P.x), dot3(sys.x, P.y), dot3(sys.y, P.x), dot3(sys.y, P.y), z * dot3(sys.n, P.x), z * dot3(sys.n, P.y)];
    return [G.transform(g, m), z * dot3(sys.n, P.n)];
  }
  const WCS = { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] };

  // Read an ASCII DXF. units: 'auto' ($INSUNITS, inches when it does not say), 'in' or 'mm'.
  // Returns {ents: [{g, pl, z, lv, col}], levels: [{n, name, vis}], units, scale, skipped: {TYPE: count}, notes: []}
  function readDXF(text, units) {
    if (/^AutoCAD Binary DXF/.test(String(text).slice(0, 22))) throw new Error('This is a binary DXF. Save it as an ASCII DXF, or open it as a DWG.');
    const pairs = dxfPairs(text), skipped = {}, notes = [], layers = new Map(), blocks = new Map();
    let ins = null;
    // ---- split into sections, and the entity lists
    let i = 0, section = null;
    const ents = [];
    const readEntity = () => {          // pairs[i] is the 0/TYPE pair; returns {type, codes: [[c, v]...]}
      const type = pairs[i][1], codes = []; i++;
      while (i < pairs.length && pairs[i][0] !== 0) { codes.push(pairs[i]); i++; }
      return { type, codes };
    };
    let block = null;
    while (i < pairs.length) {
      const [c, v] = pairs[i];
      if (c === 0 && v === 'SECTION') { section = pairs[i + 1] && pairs[i + 1][1]; i += 2; continue; }
      if (c === 0 && v === 'ENDSEC') { section = null; i++; continue; }
      if (c === 0 && v === 'EOF') break;
      if (section === 'HEADER') { if (c === 9 && v === '$INSUNITS' && pairs[i + 1]) ins = parseInt(pairs[i + 1][1], 10); i++; continue; }
      if (section === 'TABLES') {
        if (c === 0 && v === 'LAYER') { const e = readEntity(), g = k => (e.codes.find(p => p[0] === k) || [])[1]; const name = g(2); if (name !== undefined) layers.set(name, { name, color: parseInt(g(62) || '7', 10), off: parseInt(g(62) || '7', 10) < 0, ls: lineStyle(g(6)), lw: lineWidth(g(370)) }); continue; }
        i++; continue;
      }
      if (section === 'BLOCKS') {
        if (c === 0 && v === 'BLOCK') { const e = readEntity(), g = k => (e.codes.find(p => p[0] === k) || [])[1]; block = { name: g(2), base: [+g(10) || 0, +g(20) || 0, +g(30) || 0], ents: [] }; blocks.set(block.name, block); continue; }
        if (c === 0 && v === 'ENDBLK') { block = null; readEntity(); continue; }
        if (c === 0 && block) { block.ents.push(readEntity()); continue; }
        i++; continue;
      }
      if (section === 'ENTITIES' && c === 0) { ents.push(readEntity()); continue; }
      i++;
    }
    const scale = units === 'in' ? 1 : units === 'mm' ? 1 / 25.4 : DXF_UNITS[ins] || 1;
    // ---- levels: one per layer, in the order the table lists them (then any others met)
    const levelOf = new Map(), levels = [];
    const level = name => {
      name = name || '0';
      if (!levelOf.has(name)) { const n = levels.length + 1, L = layers.get(name); levelOf.set(name, n); levels.push({ n, name, vis: !(L && L.off) }); }
      return levelOf.get(name);
    };
    for (const name of layers.keys()) level(name);
    const out = [], flat = { n: 0 }, over = { n: 0 };
    // Entities tilted (their extrusion along none of X, Y and Z) go onto planes of the drawing's own, one for each
    // tilt, in their own coordinate system: found first, so lines lying in one go onto it too
    const tilted = [];
    const tiltOf = n => { const s = ocs(n); let t = tilted.find(q => Math.abs(q.n[0] - s.n[0]) + Math.abs(q.n[1] - s.n[1]) + Math.abs(q.n[2] - s.n[2]) < 1e-9); if (!t) { t = { key: 'd' + (tilted.length + 1), name: 'Tilted ' + (tilted.length + 1), o: [0, 0, 0], x: s.x, y: s.y, n: s.n }; tilted.push(t); } return t; };
    for (const e of ents) { const g = k => { const p = e.codes.find(q => q[0] === k); return p ? +p[1] : undefined; }, n = [g(210) || 0, g(220) || 0, g(230) === undefined ? 1 : g(230)]; if (Math.hypot(...n) > 1e-12 && !planeOf(n)) tiltOf(n); }
    // ---- one entity, under a block transform m (2D, in the top plane) — inserts in other planes are rare and kept as is
    // a damaged file can hold numbers that are not finite or are absurdly large, or blocks inserted millions of
    // times: such entities are left out and counted, and reading stops at MAXENTS
    const emit = (g, pl, z, codes) => {
      if (out.length >= MAXENTS) { over.n++; return; }
      if (!G.sane(g) || !G.sane(z)) { skip('damaged (numbers out of range)'); return; }
      const get = k => { const p = codes.find(q => q[0] === k); return p ? p[1] : undefined; };
      const lay = get(8), ci = get(62), L = layers.get(lay || '0'), aci = ci !== undefined && +ci !== 256 && +ci !== 0 ? +ci : L ? L.color : 7;
      // the line type and width: the entity's own, or its layer's (BYLAYER, or none given)
      const lt = get(6), lwt = get(370), ls = lt === undefined || /^BY(LAYER|BLOCK)$/i.test(lt) ? L && L.ls : lineStyle(lt), lw = lwt === undefined || +lwt < 0 ? L && L.lw : lineWidth(lwt);
      const o = { g, pl, z, lv: level(lay), col: aciColor(aci) }; if (ls) o.ls = ls; if (lw) o.lw = lw; if (g.t === 'xline') o.cons = true; out.push(o);
    };
    const put = (g, sys, z, codes, M) => {
      const pl = planeOf(sys.n);
      let gg, zz, p2 = pl;
      if (pl) [gg, zz] = ontoPlane(g, sys, z, pl);
      else if (!M) { gg = g; zz = z; p2 = tiltOf(sys.n).key; }
      else { flat.n++; [gg, zz] = ontoPlane(g, sys, z, 'top'); p2 = 'top'; }
      if (M) { gg = G.transform(gg, M.m); zz += M.dz; }
      emit(scaleG(gg, scale), p2, zz * scale, codes);
    };
    const scaleG = (g, k) => k === 1 ? g : G.transform(g, [k, 0, 0, k, 0, 0]);
    // world points (LINE, POINT, SPLINE): their plane from which coordinate is the same throughout
    const putWorld = (make, pts3, codes, M) => {
      const same = k => pts3.every(p => Math.abs(p[k] - pts3[0][k]) < 1e-9);
      let pl = 'top', z = pts3[0][2], P = PLANES.top;
      if (!same(2)) {
        const t = !M && tilted.find(q => pts3.every(p => Math.abs(dot3(p, q.n) - dot3(pts3[0], q.n)) < 1e-9));
        if (same(1)) { pl = 'front'; z = -pts3[0][1]; } else if (same(0)) { pl = 'right'; z = pts3[0][0]; } else if (t) { pl = t.key; z = dot3(pts3[0], t.n); } else flat.n++;
        P = PLANES[pl] || t;
      }
      const to2 = p => [dot3(p, P.x), dot3(p, P.y)];
      let g = make(to2);
      if (M && pl === 'top') { g = G.transform(g, M.m); z += M.dz; }
      emit(scaleG(g, scale), pl, z * scale, codes);
    };
    const handle = (e, M, depth) => {
      const codes = e.codes, get = (k, d) => { const p = codes.find(q => q[0] === k); return p ? +p[1] : d; };
      const all = k => codes.filter(q => q[0] === k).map(q => +q[1]);
      const ext = [get(210, 0), get(220, 0), get(230, 1)], sys = ext[0] === 0 && ext[1] === 0 && ext[2] === 1 ? WCS : ocs(ext);
      switch (e.type) {
        case 'LINE': { const a = [get(10, 0), get(20, 0), get(30, 0)], b = [get(11, 0), get(21, 0), get(31, 0)]; if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-12) putWorld(f => G.line(f(a), f(b)), [a, b], codes, M); return; }
        case 'POINT': { const a = [get(10, 0), get(20, 0), get(30, 0)]; putWorld(f => G.pt(f(a)), [a], codes, M); return; }
        // endless lines and rays (R13 on): a point and a direction; they come in as construction
        case 'XLINE': case 'RAY': {
          const a = [get(10, 0), get(20, 0), get(30, 0)], d = [get(11, 1), get(21, 0), get(31, 0)], b = [a[0] + d[0], a[1] + d[1], a[2] + d[2]];
          if (Math.hypot(d[0], d[1], d[2]) > 1e-12) putWorld(f => { const p = f(a), q = f(b); return G.xline(p, [q[0] - p[0], q[1] - p[1]], e.type === 'RAY'); }, [a, b], codes, M); return;
        }
        case 'CIRCLE': put(G.circle([get(10, 0), get(20, 0)], get(40, 0)), sys, get(30, 0), codes, M); return;
        case 'ARC': { const a0 = rad(get(50, 0)), a1 = rad(get(51, 0)), sw = G.sweepCCW(a1 - a0); put(G.arc([get(10, 0), get(20, 0)], get(40, 0), a0, sw), sys, get(30, 0), codes, M); return; }
        case 'ELLIPSE': {
          const c = [get(10, 0), get(20, 0), get(30, 0)], mj = [get(11, 0), get(21, 0), get(31, 0)], ratio = get(40, 1), t0 = get(41, 0), t1 = get(42, 2 * PI);
          // the ellipse is in world coordinates, in the plane of its extrusion
          const ax = sys === WCS ? WCS : sys, mx = dot3(mj, ax.x), my = dot3(mj, ax.y), cz = dot3(c, ax.n);
          const rx = Math.hypot(mx, my), rot = Math.atan2(my, mx), sw = G.sweepCCW(t1 - t0);
          const g = G.ellipse([dot3(c, ax.x), dot3(c, ax.y)], rx, rx * ratio, rot, t0, sw);
          put(g, ax, cz, codes, M); return;
        }
        case 'LWPOLYLINE': {
          const closed = (get(70, 0) & 1) === 1, elev = get(38, 0), V = [];
          for (const [k, v] of codes) { if (k === 10) V.push([+v, 0, 0]); else if (k === 20 && V.length) V[V.length - 1][1] = +v; else if (k === 42 && V.length) V[V.length - 1][2] = +v; }
          bulgeSegs(V, closed).forEach(g => put(g, sys, elev, codes, M)); return;
        }
        case 'SPLINE': {
          const p = get(71, 3), kn = all(40), w = all(41), cp = [], fit = [];
          for (let j = 0; j < codes.length; j++) { const [k, v] = codes[j]; if (k === 10) cp.push([+v, 0, 0]); else if (k === 20 && cp.length) cp[cp.length - 1][1] = +v; else if (k === 30 && cp.length) cp[cp.length - 1][2] = +v; else if (k === 11) fit.push([+v, 0, 0]); else if (k === 21 && fit.length) fit[fit.length - 1][1] = +v; else if (k === 31 && fit.length) fit[fit.length - 1][2] = +v; }
          if (cp.length >= 2 && kn.length === cp.length + p + 1) {
            const rational = w.length === cp.length && w.some(x => Math.abs(x - 1) > 1e-12);
            putWorld(f => ({ t: 'spline', deg: p, kn: kn.slice(), cp: cp.map(f), w: rational ? w.slice() : null }), cp, codes, M);
          } else if (fit.length >= 2) putWorld(f => G.splineThrough(fit.map(f)), fit, codes, M);
          else skip('SPLINE (no points)');
          return;
        }
        case 'INSERT': {
          const b = blocks.get((codes.find(q => q[0] === 2) || [])[1]);
          if (!b || depth > 8) { skip('INSERT'); return; }
          const sx = get(41, 1), sy = get(42, 1), rot = rad(get(50, 0)), ip = [get(10, 0), get(20, 0), get(30, 0)];
          const cols = Math.max(1, get(70, 1)), rows = Math.max(1, get(71, 1)), dc = get(44, 0), dr = get(45, 0);
          const mirror = ext[2] < 0 ? -1 : 1;
          for (let r = 0; r < rows && out.length < MAXENTS; r++) for (let q = 0; q < cols && out.length < MAXENTS; q++) {
            // block point → (minus base) → scale → rotate → array offset (rotated) → insertion point (in the insert's OCS)
            const co = Math.cos(rot), si = Math.sin(rot), ox = q * dc * co - r * dr * si, oy = q * dc * si + r * dr * co;
            let m = [sx * co, sx * si, -sy * si, sy * co, 0, 0];
            m[4] = -(m[0] * b.base[0] + m[2] * b.base[1]) + ip[0] + ox; m[5] = -(m[1] * b.base[0] + m[3] * b.base[1]) + ip[1] + oy;
            if (mirror < 0) m = [-m[0], m[1], -m[2], m[3], -m[4], m[5]];
            const MM = M ? { m: compose(M.m, m), dz: M.dz + ip[2] } : { m, dz: ip[2] };
            for (const be of b.ents) handle(be, MM, depth + 1);
          }
          return;
        }
        case 'TEXT': case 'ATTRIB': {
          const s = dxfText((codes.find(q => q[0] === 1) || [])[1]); if (!s.trim()) return;
          const hj = get(72, 0), at = hj ? [get(11, get(10, 0)), get(21, get(20, 0))] : [get(10, 0), get(20, 0)];
          put({ t: 'text', s, p: at, h: get(40, 0.125), a: rad(get(50, 0)), align: hj === 1 || hj === 4 ? 'center' : hj === 2 ? 'right' : undefined }, sys, get(30, 0), codes, M); return;
        }
        case 'MTEXT': {
          const s = mtext(codes.filter(q => q[0] === 3).map(q => q[1]).join('') + ((codes.find(q => q[0] === 1) || [])[1] || '')); if (!s.trim()) return;
          const h = get(40, 0.125), att = get(71, 1), ang = codes.some(q => q[0] === 11) ? Math.atan2(get(21, 0), get(11, 1)) : get(50, 0);
          // its point is a corner or middle of the text box (71): move to the baseline's left end, roughly
          const col = (att - 1) % 3, row = Math.floor((att - 1) / 3), w = D().textWidth(s, h), dx = -col * w / 2, dy = row === 0 ? -h : row === 1 ? -h / 2 : 0;
          const p0 = [get(10, 0), get(20, 0), get(30, 0)], c = Math.cos(ang), sn = Math.sin(ang);
          const sysW = sys === WCS ? WCS : sys, q = [dot3(p0, sysW.x), dot3(p0, sysW.y)];
          put({ t: 'text', s, p: [q[0] + dx * c - dy * sn, q[1] + dx * sn + dy * c], h, a: ang }, sysW, dot3(p0, sysW.n), codes, M); return;
        }
        case 'DIMENSION': {
          // a dimension is drawn by its own block: its lines and text come in as they look
          const b = blocks.get((codes.find(q => q[0] === 2) || [])[1]);
          if (!b || depth > 8) { skip('DIMENSION'); return; }
          for (const be of b.ents) handle(be, M, depth + 1);
          return;
        }
        case 'POLYLINE': skip('POLYLINE'); return;     // handled with its VERTEX list below
        default: skip(e.type);
      }
    };
    const skip = t => { skipped[t] = (skipped[t] || 0) + 1; };
    // POLYLINE / VERTEX / SEQEND come as separate entities: join them first
    const joined = joinPolylines(ents, skip);
    for (const e of joined) {
      if (e.type === 'POLY2') { const ext = [e.get(210, 0), e.get(220, 0), e.get(230, 1)], sys = ext[0] === 0 && ext[1] === 0 && ext[2] === 1 ? WCS : ocs(ext); bulgeSegs(e.V, e.closed).forEach(g => put(g, sys, e.elev, e.codes, null)); }
      else if (e.type === 'POLY3') { for (let k = 1; k < e.V.length + (e.closed ? 1 : 0); k++) { const a = e.V[k - 1], b = e.V[k % e.V.length]; putWorld(f => G.line(f(a), f(b)), [a, b], e.codes, null); } }
      else handle(e, null, 0);
    }
    if (over.n) notes.push('Reading stopped at ' + MAXENTS.toLocaleString('en-US') + ' entities: ' + over.n.toLocaleString('en-US') + ' more were left out.');
    if (flat.n) notes.push(flat.n + ' entities were not in the top, front or side plane: they were laid flat onto the top plane.');
    if (!ins && units !== 'mm' && units !== 'in') notes.push('The file does not say its units: read as inches.');
    const usedT = tilted.filter(t => out.some(e => e.pl === t.key));
    if (usedT.length) notes.push(usedT.length + (usedT.length === 1 ? ' tilted plane was' : ' tilted planes were') + ' made for what is drawn on them.');
    return { ents: out, levels, planes: usedT, units: units === 'mm' || (units !== 'in' && ins === 4) ? 'mm' : 'in', scale, skipped, notes };
  }
  // affine 2D: a then b (x' = b(a(x)))
  function compose(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
  // polyline vertices [x, y, bulge] as lines and arcs
  function bulgeSegs(V, closed) {
    const out = [], n = V.length;
    for (let k = 0; k < (closed ? n : n - 1); k++) {
      const a = V[k], b = V[(k + 1) % n], bu = a[2] || 0;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-12) continue;
      if (Math.abs(bu) < 1e-12) { out.push(G.line([a[0], a[1]], [b[0], b[1]])); continue; }
      // bulge = tan(sweep / 4); + counter-clockwise
      const sw = 4 * Math.atan(bu), ch = Math.hypot(b[0] - a[0], b[1] - a[1]), r = ch / (2 * Math.sin(Math.abs(sw) / 2));
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], u = [(b[0] - a[0]) / ch, (b[1] - a[1]) / ch], h = r * Math.cos(sw / 2) * Math.sign(bu);
      // the centre is to the left of the chord for a positive bulge under 180° (cos turns negative past 180°)
      const cc = [m[0] - u[1] * h, m[1] + u[0] * h];
      out.push(G.arc(cc, r, Math.atan2(a[1] - cc[1], a[0] - cc[0]), sw));
    }
    return out;
  }
  function joinPolylines(ents, skip) {
    const out = [];
    for (let k = 0; k < ents.length; k++) {
      const e = ents[k];
      if (e.type !== 'POLYLINE') { if (e.type !== 'VERTEX' && e.type !== 'SEQEND') out.push(e); continue; }
      const get = (c, d) => { const p = e.codes.find(q => q[0] === c); return p ? +p[1] : d; }, flags = get(70, 0);
      const V = []; k++;
      while (k < ents.length && ents[k].type === 'VERTEX') {
        const g = (c, d) => { const p = ents[k].codes.find(q => q[0] === c); return p ? +p[1] : d; };
        if (!(g(70, 0) & 16)) V.push([g(10, 0), g(20, 0), (flags & 8) ? g(30, 0) : g(42, 0)]);   // control-frame points of a fitted curve are left out
        k++;
      }
      if (flags & (16 | 64)) { skip('POLYLINE mesh'); continue; }
      out.push({ type: flags & 8 ? 'POLY3' : 'POLY2', V, closed: !!(flags & 1), elev: get(30, 0), codes: e.codes, get });
    }
    return out;
  }

  // line types by name, as the page's styles (most CAD systems name them alike; ACAD_ISO02W100 and the like too)
  function lineStyle(name) {
    const n = String(name || '').toUpperCase();
    if (!n || n === 'CONTINUOUS' || /^BY/.test(n)) return undefined;
    if (/HIDDEN/.test(n)) return 'hidden';
    if (/PHANTOM|DIVIDE|ISO0?5|ISO0?9|ISO1[1-5]/.test(n)) return 'phantom';
    if (/CENT|DASHDOT|ISO0?4|ISO0?8|ISO10/.test(n)) return 'center';
    if (/DASH|DOT|ISO0?2|ISO0?3|ISO0?6|ISO0?7/.test(n)) return 'dash';
    return undefined;
  }
  // a line weight (code 370, hundredths of a millimetre): up to 0.30 mm thin, up to 0.55 medium, more thick
  function lineWidth(v) { const n = parseInt(v, 10); return !(n > 30) ? undefined : n <= 55 ? 'med' : 'thick'; }
  // the line types written: name, description, and the dashes (inches; a negative is a gap)
  const LTYPES = [['DASHED', 'Dashed __ __ __', [0.5, -0.25]], ['HIDDEN', 'Hidden _ _ _ _', [0.25, -0.125]], ['CENTER', 'Center ____ _ ____ _', [1.25, -0.25, 0.25, -0.25]], ['PHANTOM', 'Phantom ____ _ _ ____', [1.25, -0.25, 0.25, -0.25, 0.25, -0.25]]];
  const LTNAME = { dash: 'DASHED', hidden: 'HIDDEN', center: 'CENTER', phantom: 'PHANTOM' };
  // on paper (SVG, PDF): the dashes in inches, and the widths as a multiple of the thin line
  const PAPER_DASH = { dash: [0.125, 0.0625], hidden: [0.0625, 0.03125], center: [0.3125, 0.0625, 0.0625, 0.0625], phantom: [0.3125, 0.0625, 0.0625, 0.0625, 0.0625, 0.0625] };
  const PAPER_W = { med: 1.8, thick: 2.8 };

  // ================================================================ DXF out (R12, which every CAD system reads)
  // ents: [{g, pl, z, lv, col, ls}], levels: [{n, name}]. Arcs and circles off the top plane are written in their own
  // coordinate system (extrusion), splines as arcs and lines fitted within tol (R12 has no SPLINE). Line styles go out
  // as line types; R12 has no line widths, so those are kept only in the page's own file.
  const cadLib = () => root.CAD || (typeof require !== 'undefined' ? (() => { try { return require('./cad.js'); } catch (e) { return null; } })() : null);
  // a spline as arcs and lines within tol, end to end from its start; null when the fitter is not loaded
  function splineArcs(g, tol) {
    const CAD = cadLib(); if (!CAD) return null;
    const P = G.flatten(g, tol / 4), out = []; let last = P[0];
    for (const s of CAD.fitPath(P, tol)) {
      const b = [s.x, s.y];
      if (s.t === 'A') {
        const c = [s.cx, s.cy], a0 = Math.atan2(last[1] - c[1], last[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
        out.push(G.arc(c, Math.hypot(last[0] - c[0], last[1] - c[1]), a0, s.ccw ? G.sweepCCW(a1 - a0) : -G.sweepCCW(a0 - a1)));
      } else out.push(G.line([last[0], last[1]], b));
      last = b;
    }
    return out.length ? out : null;
  }
  function writeDXF(ents, levels, opts) {
    const o = opts || {}, tol = o.tol || 0.0002, L = [], own = o.planes ? (o.planes.get ? k => o.planes.get(k) : k => o.planes[k]) : () => null;
    const w = (c, v) => L.push(String(c), String(v));
    const f = v => { const s = (+v).toPrecision(15); return String(+s); };
    const lname = n => { const l = (levels || []).find(x => x.n === n); return safeName(l && l.name ? l.name : n === 1 ? '0' : 'LEVEL' + n); };
    const used = [...new Set(ents.map(e => e.lv || 1))];
    w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSBASE'); w(10, 0); w(20, 0); w(30, 0); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'TABLES');
    w(0, 'TABLE'); w(2, 'LTYPE'); w(70, 1 + LTYPES.length); w(0, 'LTYPE'); w(2, 'CONTINUOUS'); w(70, 0); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, 0);
    for (const [nm, about, d] of LTYPES) { w(0, 'LTYPE'); w(2, nm); w(70, 0); w(3, about); w(72, 65); w(73, d.length); w(40, f(d.reduce((a, b) => a + Math.abs(b), 0))); for (const x of d) w(49, f(x)); }
    w(0, 'ENDTAB');
    const names = [...new Set(['0', ...used.map(lname)])];
    w(0, 'TABLE'); w(2, 'LAYER'); w(70, names.length);
    for (const nm of names) { w(0, 'LAYER'); w(2, nm); w(70, 0); w(62, 7); w(6, 'CONTINUOUS'); }
    w(0, 'ENDTAB'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'BLOCKS'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'ENTITIES');
    const flat = [];
    for (const e of ents) { const A = e.g.t === 'spline' ? splineArcs(e.g, tol) : null; if (A) for (const g of A) flat.push(Object.assign({}, e, { g })); else flat.push(e); }
    for (const e of flat) {
      if (e.g.t === 'xline') continue;             // endless lines are construction (R12 has no XLINE)
      const pl = PLANES[e.pl] || own(e.pl) ? e.pl : 'top', g = e.g, z = e.z || 0, P = PLANES[pl] || own(pl), O = P.o || [0, 0, 0], lay = lname(e.lv || 1), col = colorAci(e.col);
      const W = p => [0, 1, 2].map(k => O[k] + P.x[k] * p[0] + P.y[k] * p[1] + P.n[k] * z);
      const head = t => { w(0, t); w(8, lay); if (LTNAME[e.ls] && !G.isAnno(g)) w(6, LTNAME[e.ls]); w(62, col); };
      if (g.t === 'pt') { const p = W(g.p); head('POINT'); w(10, f(p[0])); w(20, f(p[1])); w(30, f(p[2])); }
      else if (g.t === 'line') { const a = W(g.a), b = W(g.b); head('LINE'); w(10, f(a[0])); w(20, f(a[1])); w(30, f(a[2])); w(11, f(b[0])); w(21, f(b[1])); w(31, f(b[2])); }
      else if (g.t === 'arc') {
        // into the OCS of the plane's normal, counter-clockwise
        const s = pl === 'top' ? WCS : ocs(P.n), O = p => { const q = W(p); return [dot3(q, s.x), dot3(q, s.y), dot3(q, s.n)]; };
        const c = O(g.c), p0 = O(G.start(g)), p1 = O(G.end(g)), pm = O(G.mid(g));
        const ccw = (pm[0] - p0[0]) * (p1[1] - pm[1]) - (pm[1] - p0[1]) * (p1[0] - pm[0]) > 0 || (G.isCircle(g) && true);
        const ext = s === WCS ? null : s.n;
        const ang = p => deg(Math.atan2(p[1] - c[1], p[0] - c[0]));
        if (G.isCircle(g)) { head('CIRCLE'); w(10, f(c[0])); w(20, f(c[1])); w(30, f(c[2])); w(40, f(g.r)); }
        else { head('ARC'); w(10, f(c[0])); w(20, f(c[1])); w(30, f(c[2])); w(40, f(g.r)); w(50, f(ccw ? ang(p0) : ang(p1))); w(51, f(ccw ? ang(p1) : ang(p0))); }
        if (ext) { w(210, f(ext[0])); w(220, f(ext[1])); w(230, f(ext[2])); }
      } else if (g.t === 'text' || g.t === 'dim' || g.t === 'hatch') {
        const s = pl === 'top' ? WCS : ocs(P.n), O = p => { const q = W(p); return [dot3(q, s.x), dot3(q, s.y), dot3(q, s.n)]; };
        // a hatch goes out as its lines (R12 has no HATCH)
        const parts = g.t === 'text' ? { lines: [], texts: [g] } : g.t === 'hatch' ? { lines: D().hatchLines(g), texts: [] } : D().dimParts(g);
        for (const L2 of parts.lines) for (let k = 1; k < L2.length; k++) { const a = W(L2[k - 1]), b = W(L2[k]); head('LINE'); w(10, f(a[0])); w(20, f(a[1])); w(30, f(a[2])); w(11, f(b[0])); w(21, f(b[1])); w(31, f(b[2])); }
        for (const t of parts.texts) {
          const p = O(t.p), dirP = [t.p[0] + Math.cos(t.a || 0), t.p[1] + Math.sin(t.a || 0)], q = O(dirP), ang = deg(Math.atan2(q[1] - p[1], q[0] - p[0]));
          head('TEXT'); w(10, f(p[0])); w(20, f(p[1])); w(30, f(p[2])); w(40, f(t.h || 0.125)); w(1, toDxfText(t.s)); if (Math.abs(ang) > 1e-9) w(50, f(ang));
          const hj = t.align === 'center' ? 1 : t.align === 'right' ? 2 : 0; if (hj) { w(72, hj); w(11, f(p[0])); w(21, f(p[1])); w(31, f(p[2])); }
          if (s !== WCS) { w(210, f(s.n[0])); w(220, f(s.n[1])); w(230, f(s.n[2])); }
        }
      } else if (g.t === 'spline') {               // only when the arc fitter is not loaded
        const pts = G.flatten(g, tol).map(W);
        head('POLYLINE'); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, 8);
        for (const p of pts) { w(0, 'VERTEX'); w(8, lay); w(10, f(p[0])); w(20, f(p[1])); w(30, f(p[2])); w(70, 32); }
        w(0, 'SEQEND'); w(8, lay);
      }
    }
    w(0, 'ENDSEC'); w(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }
  const safeName = s => String(s).replace(/[<>/\\":;?*|=,`]/g, '_').slice(0, 31) || '0';

  // ================================================================ SVG in
  // a small XML reader: elements with attributes and children (enough for SVG drawings)
  function parseXML(text) {
    const rootEl = { name: '#root', attrs: {}, kids: [] }, stack = [rootEl];
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) { while (stack.length > 1 && stack.pop().name !== m[1]); continue; }
      if (!m[2]) continue;
      const attrs = {}, ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let a;
      while ((a = ar.exec(m[3] || ''))) attrs[a[1]] = (a[2] !== undefined ? a[2] : a[3]).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      const el = { name: m[2].replace(/^svg:/, ''), attrs, kids: [] };
      stack[stack.length - 1].kids.push(el);
      if (!m[4]) stack.push(el);
    }
    return rootEl;
  }
  const UNIT_IN = { in: 1, mm: 1 / 25.4, cm: 1 / 2.54, pt: 1 / 72, pc: 1 / 6, px: 1 / 96, '': 1 / 96 };
  const lenIn = s => { const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(String(s || '')); return m && UNIT_IN[m[2].toLowerCase()] !== undefined ? +m[1] * UNIT_IN[m[2].toLowerCase()] : null; };
  const nums = s => (String(s || '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
  function parseTransform(s) {
    let m = [1, 0, 0, 1, 0, 0];
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let t;
    while ((t = re.exec(s || ''))) {
      const v = nums(t[2]); let k;
      if (t[1] === 'matrix') k = v.slice(0, 6);
      else if (t[1] === 'translate') k = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
      else if (t[1] === 'scale') k = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
      else if (t[1] === 'rotate') { const a = rad(v[0] || 0), c = Math.cos(a), si = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; k = [c, si, -si, c, cx - c * cx + si * cy, cy - si * cx - c * cy]; }
      else if (t[1] === 'skewX') k = [1, 0, Math.tan(rad(v[0])), 1, 0, 0];
      else k = [1, Math.tan(rad(v[0])), 0, 1, 0, 0];
      m = compose(m, k);
    }
    return m;
  }
  // Read an SVG: paths, rectangles, circles, ellipses, lines, polylines and polygons, through their transforms, in
  // inches (from the drawing's width/height and viewBox; plain numbers are pixels, 96 to the inch), Y up.
  function readSVG(text) {
    const doc = parseXML(String(text)), svg = findEl(doc, 'svg');
    if (!svg) throw new Error('Not an SVG drawing');
    const vb = nums(svg.attrs.viewBox), wIn = lenIn(svg.attrs.width), hIn = lenIn(svg.attrs.height);
    let sx = 1 / 96, sy = 1 / 96, ox = 0, oy = 0;
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { ox = -vb[0]; oy = -vb[1]; if (wIn) sx = wIn / vb[2]; if (hIn) sy = hIn / vb[3]; else if (wIn) sy = sx; if (!wIn && hIn) sx = sy; }
    else { if (/%/.test(svg.attrs.width || '')) sx = sy = 1 / 96; }
    const H = vb.length === 4 ? vb[3] : 0;
    // user units → inches, Y flipped so up is up
    const base = compose([sx, 0, 0, -sy, 0, H * sy], [1, 0, 0, 1, ox, oy]);
    const out = [], skipped = {};
    const walk = (el, M, stroke) => {
      if (/^(defs|clipPath|mask|symbol|marker|pattern|title|desc|metadata|style|text|image|linearGradient|radialGradient|filter)$/.test(el.name)) { if (/^(text|image)$/.test(el.name)) skipped[el.name] = (skipped[el.name] || 0) + 1; return; }
      if (el.attrs.display === 'none') return;
      const m = el.attrs.transform ? compose(M, parseTransform(el.attrs.transform)) : M;
      const st = strokeOf(el) || stroke;
      const geoms = shapeGeoms(el);
      for (const g of geoms) out.push({ g: G.transform(g, m), pl: 'top', z: 0, lv: 1, col: st || '#e8e8e8' });
      if (el.name === 'use') skipped.use = (skipped.use || 0) + 1;
      for (const k of el.kids) walk(k, m, st);
    };
    walk(svg, base, null);
    return { ents: out.filter(e => e.g && (e.g.t !== 'line' || G.length(e.g) > 1e-12)), levels: [{ n: 1, name: 'SVG', vis: true }], units: 'in', skipped, notes: [] };
  }
  const findEl = (el, name) => { if (el.name === name) return el; for (const k of el.kids) { const f = findEl(k, name); if (f) return f; } return null; };
  function strokeOf(el) {
    let s = el.attrs.stroke; const st = /(?:^|;)\s*stroke\s*:\s*([^;]+)/.exec(el.attrs.style || ''); if (st) s = st[1].trim();
    if (!s || s === 'none' || /^url/.test(s)) return null;
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map(c => c + c).join('');
    if (!/^#[0-9a-f]{6}$/i.test(s)) return null;
    // black on paper is the screen's default colour here (the drawing area is dark)
    return /^#(000000|0[0-9a-f]0[0-9a-f]0[0-9a-f])$/i.test(s) ? null : s.toLowerCase();
  }
  function shapeGeoms(el) {
    const a = el.attrs, N = k => +(nums(a[k])[0] || 0);
    switch (el.name) {
      case 'line': return [G.line([N('x1'), N('y1')], [N('x2'), N('y2')])];
      case 'polyline': case 'polygon': { const v = nums(a.points), P = []; for (let k = 0; k + 1 < v.length; k += 2) P.push([v[k], v[k + 1]]); const o = []; for (let k = 1; k < P.length; k++) o.push(G.line(P[k - 1], P[k])); if (el.name === 'polygon' && P.length > 2) o.push(G.line(P[P.length - 1], P[0])); return o; }
      case 'circle': return N('r') > 0 ? [G.circle([N('cx'), N('cy')], N('r'))] : [];
      case 'ellipse': return N('rx') > 0 && N('ry') > 0 ? [Math.abs(N('rx') - N('ry')) < 1e-12 ? G.circle([N('cx'), N('cy')], N('rx')) : G.ellipse([N('cx'), N('cy')], N('rx'), N('ry'), 0, 0, 2 * PI)] : [];
      case 'rect': {
        const x = N('x'), y = N('y'), w = N('width'), h = N('height'); if (!(w > 0 && h > 0)) return [];
        let rx = a.rx !== undefined ? N('rx') : a.ry !== undefined ? N('ry') : 0, ry = a.ry !== undefined ? N('ry') : rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (!(rx > 0 && ry > 0)) return [G.line([x, y], [x + w, y]), G.line([x + w, y], [x + w, y + h]), G.line([x + w, y + h], [x, y + h]), G.line([x, y + h], [x, y])];
        const corner = (cx, cy, a0) => Math.abs(rx - ry) < 1e-12 ? G.arc([cx, cy], rx, a0, PI / 2) : G.ellipse([cx, cy], rx, ry, 0, a0, PI / 2);
        const o = [G.line([x + rx, y], [x + w - rx, y]), corner(x + w - rx, y + ry, -PI / 2), G.line([x + w, y + ry], [x + w, y + h - ry]), corner(x + w - rx, y + h - ry, 0),
          G.line([x + w - rx, y + h], [x + rx, y + h]), corner(x + rx, y + h - ry, PI / 2), G.line([x, y + h - ry], [x, y + ry]), corner(x + rx, y + ry, PI)];
        return o.filter(e => e.t !== 'line' || G.length(e) > 1e-12);
      }
      case 'path': return pathGeoms(a.d || '');
      default: return [];
    }
  }
  // the SVG path mini-language as entities: Béziers become exact splines, arcs exact arcs (or elliptical splines)
  function pathGeoms(d) {
    const toks = String(d).match(/[a-df-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [], out = [];
    let i = 0, cmd = '', cur = [0, 0], startP = [0, 0], lastC = null, lastQ = null;
    const isCmd = t => /^[a-df-z]$/i.test(t), num = () => +toks[i++];
    const flag = () => { // arc flags may be written without separators ("a5 5 0 011 0")
      const t = toks[i]; if (t === '0' || t === '1') { i++; return +t; }
      const c = t[0]; toks[i] = t.slice(1); if (toks[i] === '') i++; return +c;
    };
    while (i < toks.length) {
      if (isCmd(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), P = (x, y) => rel ? [cur[0] + x, cur[1] + y] : [x, y];
      if (C === 'Z') { if (Math.hypot(cur[0] - startP[0], cur[1] - startP[1]) > 1e-12) out.push(G.line(cur, startP)); cur = startP.slice(); lastC = lastQ = null; continue; }
      if (i >= toks.length || isCmd(toks[i])) { if (!isCmd(toks[i] || 'z')) i++; continue; }
      if (C === 'M') { cur = P(num(), num()); startP = cur.slice(); cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
      if (C === 'L') { const p = P(num(), num()); out.push(G.line(cur, p)); cur = p; lastC = lastQ = null; continue; }
      if (C === 'H') { const x = num(), p = [rel ? cur[0] + x : x, cur[1]]; out.push(G.line(cur, p)); cur = p; lastC = lastQ = null; continue; }
      if (C === 'V') { const y = num(), p = [cur[0], rel ? cur[1] + y : y]; out.push(G.line(cur, p)); cur = p; lastC = lastQ = null; continue; }
      if (C === 'C' || C === 'S') {
        const c1 = C === 'C' ? P(num(), num()) : lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur.slice();
        const c2 = P(num(), num()), p = P(num(), num());
        out.push(G.bezier([cur, c1, c2, p])); lastC = c2; lastQ = null; cur = p; continue;
      }
      if (C === 'Q' || C === 'T') {
        const c1 = C === 'Q' ? P(num(), num()) : lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur.slice();
        const p = P(num(), num()); out.push(G.bezier([cur, c1, p])); lastQ = c1; lastC = null; cur = p; continue;
      }
      if (C === 'A') {
        let rx = Math.abs(num()), ry = Math.abs(num()); const phi = rad(num()), fa = flag(), fs = flag(), p = P(num(), num());
        const e = svgArc(cur, p, rx, ry, phi, fa, fs); if (e) out.push(e); cur = p; lastC = lastQ = null; continue;
      }
      i++;
    }
    return out.filter(e => e.t !== 'line' || G.length(e) > 1e-12);
  }
  // SVG's endpoint arc as centre form (SVG 1.1, F.6.5)
  function svgArc(p1, p2, rx, ry, phi, fa, fs) {
    if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 1e-12) return null;
    if (!(rx > 0 && ry > 0)) return G.line(p1, p2);
    const co = Math.cos(phi), si = Math.sin(phi), dx = (p1[0] - p2[0]) / 2, dy = (p1[1] - p2[1]) / 2;
    const x1 = co * dx + si * dy, y1 = -si * dx + co * dy;
    const lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num_ = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num_ / den));
    const cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx;
    const c = [co * cx1 - si * cy1 + (p1[0] + p2[0]) / 2, si * cx1 + co * cy1 + (p1[1] + p2[1]) / 2];
    const ang = (u, v) => Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
    const t1 = ang([1, 0], [(x1 - cx1) / rx, (y1 - cy1) / ry]);
    let dt = ang([(x1 - cx1) / rx, (y1 - cy1) / ry], [(-x1 - cx1) / rx, (-y1 - cy1) / ry]);
    if (!fs && dt > 0) dt -= 2 * PI; else if (fs && dt < 0) dt += 2 * PI;
    if (Math.abs(rx - ry) < 1e-12 * Math.max(1, rx)) return G.arc(c, rx, t1 + phi, dt);
    return G.ellipse(c, rx, ry, phi, t1, dt);
  }

  // ================================================================ SVG out
  // the top-plane entities (others are left out and counted), in inches, Y up turned back to SVG's Y down
  function writeSVG(ents, opts) {
    const o = opts || {}, top = ents.filter(e => (e.pl || 'top') === 'top' && e.g.t !== 'xline'), boxes = top.map(e => G.bbox(e.g));
    const b = boxes.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    if (!isFinite(b[0])) { b[0] = b[1] = 0; b[2] = b[3] = 1; }
    const m = o.margin === undefined ? 0.25 : o.margin, W = b[2] - b[0] + 2 * m, H = b[3] - b[1] + 2 * m, f = v => String(+(+v).toFixed(9));
    const X = x => f(x - b[0] + m), Y = y => f(b[3] + m - y);
    const sw = o.stroke || 0.01, parts = [];
    const look = e => (PAPER_DASH[e.ls] && !G.isAnno(e.g) ? ` stroke-dasharray="${PAPER_DASH[e.ls].join(' ')}"` : '') + (PAPER_W[e.lw] ? ` stroke-width="${f(sw * PAPER_W[e.lw])}"` : '');
    for (const e of top) {
      const g = e.g, col = e.col && /^#/.test(e.col) && e.col.toLowerCase() !== '#e8e8e8' ? e.col : '#000000';
      let d = '';
      if (g.t === 'line') d = 'M' + X(g.a[0]) + ' ' + Y(g.a[1]) + 'L' + X(g.b[0]) + ' ' + Y(g.b[1]);
      else if (g.t === 'arc' && G.isCircle(g)) { parts.push(`<circle cx="${X(g.c[0])}" cy="${Y(g.c[1])}" r="${f(g.r)}" stroke="${col}"${look(e)}/>`); continue; }
      else if (g.t === 'arc') { const p0 = G.start(g), p1 = G.end(g); d = 'M' + X(p0[0]) + ' ' + Y(p0[1]) + 'A' + f(g.r) + ' ' + f(g.r) + ' 0 ' + (Math.abs(g.sw) > PI ? 1 : 0) + ' ' + (g.sw > 0 ? 0 : 1) + ' ' + X(p1[0]) + ' ' + Y(p1[1]); }
      else if (g.t === 'spline') d = G.flatten(g, o.tol || 0.0002).map((p, k) => (k ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join('');
      else if (g.t === 'pt') { parts.push(`<circle cx="${X(g.p[0])}" cy="${Y(g.p[1])}" r="${f(sw)}" fill="${col}" stroke="none"/>`); continue; }
      else if (G.isAnno(g)) d = D().strokes(g).map(P => P.map((p, k) => (k ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join('')).join('');
      parts.push(`<path d="${d}" stroke="${col}"${look(e)}/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}in" height="${f(H)}in" viewBox="0 0 ${f(W)} ${f(H)}">\n<g fill="none" stroke-width="${f(sw)}" stroke-linecap="round">\n${parts.join('\n')}\n</g>\n</svg>\n`;
  }

  // ================================================================ PDF out
  // a one-page PDF at full size (the page fits the drawing plus a margin), top-plane entities as vector lines
  function writePDF(ents, opts) {
    const o = opts || {}, top = ents.filter(e => (e.pl || 'top') === 'top' && e.g.t !== 'xline'), boxes = top.map(e => G.bbox(e.g));
    const b = boxes.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    if (!isFinite(b[0])) { b[0] = b[1] = 0; b[2] = b[3] = 1; }
    const m = o.margin === undefined ? 0.5 : o.margin, k = 72, f = v => (+v).toFixed(3).replace(/\.?0+$/, '') || '0';
    const X = x => f((x - b[0] + m) * k), Y = y => f((y - b[1] + m) * k);
    const W = (b[2] - b[0] + 2 * m) * k, H = (b[3] - b[1] + 2 * m) * k, s = ['0.5 w 1 J 1 j'];
    for (const e of top) {
      const g = e.g, c = /^#([0-9a-f]{6})$/i.exec(e.col || ''), rgb = c && e.col.toLowerCase() !== '#e8e8e8' ? c[1].match(/../g).map(h => (parseInt(h, 16) / 255).toFixed(3)) : ['0', '0', '0'];
      s.push(rgb.join(' ') + ' RG ' + f(0.5 * (PAPER_W[e.lw] || 1)) + ' w [' + (PAPER_DASH[e.ls] && !G.isAnno(g) ? PAPER_DASH[e.ls].map(v => f(v * k)).join(' ') : '') + '] 0 d');
      if (g.t === 'line') s.push(X(g.a[0]) + ' ' + Y(g.a[1]) + ' m ' + X(g.b[0]) + ' ' + Y(g.b[1]) + ' l S');
      else if (g.t === 'arc') {
        // as cubic Béziers, a quarter turn at most each
        const n = Math.max(1, Math.ceil(Math.abs(g.sw) / (PI / 2) - 1e-9)), d = g.sw / n, kk = 4 / 3 * Math.tan(d / 4), p0 = G.start(g);
        let q = X(p0[0]) + ' ' + Y(p0[1]) + ' m';
        for (let j = 0; j < n; j++) {
          const a0 = g.a0 + d * j, a1 = a0 + d, P0 = [g.c[0] + g.r * Math.cos(a0), g.c[1] + g.r * Math.sin(a0)], P3 = [g.c[0] + g.r * Math.cos(a1), g.c[1] + g.r * Math.sin(a1)];
          const P1 = [P0[0] - kk * g.r * Math.sin(a0), P0[1] + kk * g.r * Math.cos(a0)], P2 = [P3[0] + kk * g.r * Math.sin(a1), P3[1] - kk * g.r * Math.cos(a1)];
          q += ' ' + [P1, P2, P3].map(p => X(p[0]) + ' ' + Y(p[1])).join(' ') + ' c';
        }
        s.push(q + ' S');
      } else if (g.t === 'spline') s.push(G.flatten(g, 0.0005).map((p, j) => X(p[0]) + ' ' + Y(p[1]) + (j ? ' l' : ' m')).join(' ') + ' S');
      else if (g.t === 'pt') s.push(X(g.p[0]) + ' ' + Y(g.p[1]) + ' m ' + X(g.p[0]) + ' ' + Y(g.p[1]) + ' l S');
      else if (G.isAnno(g)) for (const P of D().strokes(g)) s.push(P.map((p, j) => X(p[0]) + ' ' + Y(p[1]) + (j ? ' l' : ' m')).join(' ') + ' S');
    }
    const content = s.join('\n'), objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Contents 4 0 R /Resources << >> >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      `<< /Producer (MACH1 CAD) /Title (${String(o.title || 'Drawing').replace(/[()\\]/g, '')}) >>`,
    ];
    let pdf = '%PDF-1.4\n', offs = [];
    objs.forEach((ob, j) => { offs.push(pdf.length); pdf += (j + 1) + ' 0 obj\n' + ob + '\nendobj\n'; });
    const xref = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(x => String(x).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return pdf;
  }

  // ================================================================ PDF in (from pdf.js's operator list)
  // A page's drawing as pdf.js lists it: {fnArray, argsArray}, with its OPS numbers. Paths (stroked or filled) come in
  // through every transform, in inches (72 points to the inch), Y up as in PDF. Cubic Béziers that are circular arcs
  // become exact arcs, and the arcs of one circle in a row are joined. Text is counted, not read.
  function readPDFOps(list, OPS, opts) {
    const o = opts || {}, k = 1 / 72, out = [], stack = [], skipped = {};
    let m = [1, 0, 0, 1, 0, 0];
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const T = (x, y) => [(m[0] * x + m[2] * y + m[4]) * k, (m[1] * x + m[3] * y + m[5]) * k];
    const paints = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(x => x !== undefined));
    const textOps = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText].filter(x => x !== undefined));
    for (let i = 0; i < list.fnArray.length; i++) {
      const fn = list.fnArray[i], args = list.argsArray[i];
      if (fn === OPS.save) stack.push(m);
      else if (fn === OPS.restore) { if (stack.length) m = stack.pop(); }
      else if (fn === OPS.transform) m = mul(m, args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(m); if (args && args[0]) m = mul(m, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) m = stack.pop(); }
      else if (textOps.has(fn)) skipped.text = (skipped.text || 0) + 1;
      else if (fn === OPS.constructPath) {
        const paint = args[0], data = args[1] && args[1][0];
        if (!data || (paints.size && !paints.has(paint) && paint !== undefined && !o.allPaths)) continue;
        const path = [];
        let cur = null, start = null;
        for (let j = 0; j < data.length;) {
          const op = data[j++];
          if (op === 0) { cur = T(data[j], data[j + 1]); start = cur; j += 2; }
          else if (op === 1) { const p = T(data[j], data[j + 1]); j += 2; if (cur && G.dist(cur, p) > 1e-9) path.push(G.line(cur, p)); cur = p; }
          else if (op === 2) { const c1 = T(data[j], data[j + 1]), c2 = T(data[j + 2], data[j + 3]), p = T(data[j + 4], data[j + 5]); j += 6; if (cur) path.push(bezierOrArc([cur, c1, c2, p])); cur = p; }
          else if (op === 3) { const c1 = T(data[j], data[j + 1]), p = T(data[j + 2], data[j + 3]); j += 4; if (cur) path.push(G.bezier([cur, c1, p])); cur = p; }
          else if (op === 4) { if (cur && start && G.dist(cur, start) > 1e-9) path.push(G.line(cur, start)); cur = start; }
          else break;
        }
        for (const g of joinArcs(path)) out.push({ g, pl: 'top', z: 0, lv: 1, col: '#e8e8e8' });
      }
    }
    return { ents: out, levels: [{ n: 1, name: 'PDF', vis: true }], units: 'in', skipped, notes: [] };
  }
  // a cubic Bézier that lies on a circle (as drawing programs write arcs) as that arc, else as the spline
  function bezierOrArc(P) {
    const b = G.bezier(P), mid = G.at(b, 0.5), a = G.arc3(P[0], mid, P[3]);
    if (!a || a.r > 1e4) return b;
    const tol = Math.max(1e-6, a.r * 5e-4);          // a cubic is within 0.027% of a quarter circle
    for (const t of [0.15, 0.3, 0.7, 0.85]) if (Math.abs(G.dist(G.at(b, t), a.c) - a.r) > tol) return b;
    return a;
  }
  // arcs in a row on one circle as one arc (a full circle when they close)
  function joinArcs(path) {
    const out = [];
    for (const g of path) {
      const l = out[out.length - 1];
      // PDF coordinates are rounded (often to 0.001 pt), so the pieces of one circle differ a little
      if (l && l.t === 'arc' && g.t === 'arc' && G.dist(l.c, g.c) < 2e-4 && Math.abs(l.r - g.r) < 2e-4 && Math.sign(l.sw) === Math.sign(g.sw) && G.dist(G.end(l), G.start(g)) < 2e-4) {
        const sw = l.sw + g.sw; out[out.length - 1] = Math.abs(sw) >= 2 * PI - 1e-3 ? G.circle(l.c, l.r) : G.arc(l.c, l.r, l.a0, sw);
      } else out.push(g);
    }
    return out;
  }

  // ================================================================ files compressed with Unix compress (.Z)
  // Some machine controls save their files this way (an EDM's "DWG" can be one). LZW with 9 to 16 bit codes, read
  // as compress writes them: in groups of 8 codes, a group cut short where the code width grows or the table clears.
  const isCompressed = b => b && b.length > 3 && b[0] === 0x1f && b[1] === 0x9d;
  function unlzw(src) {
    if (!isCompressed(src)) throw new Error('This is not a compressed (.Z) file');
    const maxbits = src[2] & 0x1f, block = (src[2] & 0x80) !== 0;
    if (maxbits < 9 || maxbits > 16) throw new Error('This compressed file uses ' + maxbits + '-bit codes, which compress never writes');
    const maxmax = 1 << maxbits, prefix = new Uint16Array(maxmax), suffix = new Uint8Array(maxmax), stack = new Uint8Array(maxmax);
    for (let c = 0; c < 256; c++) suffix[c] = c;
    let out = new Uint8Array(Math.max(1024, src.length * 4)), n = 0;
    const put = v => { if (n >= out.length) { const o = new Uint8Array(out.length * 2); o.set(out); out = o; } out[n++] = v; };
    const total = src.length * 8;
    let nbits = 9, maxcode = 511, free = block ? 257 : 256, pos = 24, seg = 24, old = -1, fin = 0;
    // to the end of the group of 8 codes that pos is in (counted from where this width began)
    const align = () => { const N = nbits * 8, r = (pos - seg) % N; if (r) pos += N - r; };
    for (;;) {
      // the table has outgrown the width: one bit wider (as compress itself does, even past a 9-bit limit to 10)
      if (free > maxcode) { align(); seg = pos; nbits++; maxcode = nbits === maxbits ? maxmax : (1 << nbits) - 1; }
      if (pos + nbits > total) break;
      const i = pos >> 3, code = ((src[i] | (src[i + 1] << 8) | ((src[i + 2] || 0) << 16)) >>> (pos & 7)) & ((1 << nbits) - 1); pos += nbits;
      if (old === -1) { if (code >= 256) throw new Error('This compressed file is damaged'); fin = old = code; put(code); continue; }
      if (code === 256 && block) { free = 256; align(); seg = pos; nbits = 9; maxcode = 511; continue; }
      let c = code, sp = 0;
      if (c >= free) { if (c > free) throw new Error('This compressed file is damaged'); stack[sp++] = fin; c = old; }
      while (c >= 256) { stack[sp++] = suffix[c]; c = prefix[c]; }
      fin = suffix[c]; stack[sp++] = fin;
      while (sp) put(stack[--sp]);
      if (free < maxmax) { prefix[free] = old; suffix[free] = fin; free++; }
      old = code;
    }
    return out.subarray(0, n);
  }

  // ================================================================ what a file is, from its first bytes
  // 'mswin' (a Mitsubishi EDM's own drawing), 'dwg', 'dxf' or null; a compressed file is unpacked first (see unlzw)
  function sniff(b) {
    const head = String.fromCharCode.apply(null, b.subarray(0, Math.min(64, b.length)));
    if (/MSWIN/.test(head)) return 'mswin';
    if (/^AC10\d\d/.test(head)) return 'dwg';
    if (/^AutoCAD Binary DXF/.test(head) || /^\s*(0|999)\s*\r?\n/.test(head)) return 'dxf';
    return null;
  }

  // ================================================================ Mitsubishi EDM drawings (MSWIN V4.0)
  // The Mitsubishi wire EDMs' CAD saves its drawings in a format of its own (often named .dwg, though AutoCAD's it is
  // not). It is a stream of typed values: 01 <field> marks a field, then 18 a 32-bit integer, 1e a double, 1f a string
  // (32-bit length, then the bytes), 04 a byte, 17 a 16-bit integer, 19 and 1a 32-bit tags, 02 a byte. Groups (field
  // 14) hold a name (field 2); the first, 'root', holds the drawing. An entity runs from field 0f to field 13: its
  // kind in field 0e (the low 6 bits), its numbers in field 12:
  //   1 point (x y) · 3 line (start end, then its length and normal) · 6 arc (start end, signed sweep, centre, radius;
  //   a full circle sweeps 2π) · 7 a curve by name: the group of that name holds a NURBS curve, field 15 records 201
  //   (degree), 202 (a control point x y and weight), 203 (a knot) and 204 (the knots' range). Such a group also holds
  //   the arcs the machine fits to the curve; the curve itself is taken, exact.
  // The file says nothing of its units: the caller gives them (the numbers are read as inches, and units 'mm' scales).
  // Returns {ents, levels, skipped, notes, extent (the biggest number, as read)}.
  function readMSWIN(bytes, units) {
    const b = bytes, toks = [], SIZE = { 0x18: 4, 0x1e: 8, 0x04: 1, 0x17: 2, 0x19: 4, 0x1a: 4, 0x02: 1 };
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let i = String.fromCharCode.apply(null, b.subarray(0, 32)).indexOf('MSWIN') - 5; if (i < 0) throw new Error('This is not a Mitsubishi EDM drawing');
    while (i < b.length) {
      const t = b[i];
      if (t === 0x01) { toks.push(['F', b[i + 1]]); i += 2; }
      else if (t === 0x1f) { const n = dv.getUint32(i + 1, true); if (i + 5 + n > b.length) throw new Error('This EDM drawing is cut short'); let s = ''; for (let k = 0; k < n; k++) { const c = b[i + 5 + k]; if (c) s += String.fromCharCode(c); } toks.push(['S', s]); i += 5 + n; }
      else if (SIZE[t]) { const k = SIZE[t]; if (i + 1 + k > b.length) throw new Error('This EDM drawing is cut short'); toks.push([t, t === 0x1e ? dv.getFloat64(i + 1, true) : k === 4 ? dv.getUint32(i + 1, true) : k === 2 ? dv.getUint16(i + 1, true) : b[i + 1]]); i += 1 + k; }
      else throw new Error('This EDM drawing has something this page cannot read (byte ' + t.toString(16) + ' at ' + i + ')');
    }
    // groups and their entities; and each group's curve
    const groups = [], skipped = {}, skip = what => { skipped[what] = (skipped[what] || 0) + 1; };
    let g = { name: 'root', ents: [], curve: null }, e = null, field = null, rec = null; groups.push(g);
    for (let k = 0; k < toks.length; k++) {
      const [t, v] = toks[k];
      if (t === 'F') {
        field = v;
        if (v === 0x14) { g = { name: '', ents: [], curve: null }; groups.push(g); e = null; }
        else if (v === 0x0f) { e = { kind: 0, nums: [], name: null }; }
        else if (v === 0x13) { if (e) g.ents.push(e); e = null; }
        else if (v === 0x15 && !e) rec = { id: null, vals: [] };
        continue;
      }
      if (field === 0x02 && t === 'S' && !e && !g.name) g.name = v;
      else if (e && field === 0x0e && t === 0x04) e.kind = v & 0x3f;
      else if (e && field === 0x12) { if (t === 0x1e) e.nums.push(v); else if (t === 'S') e.name = v; }
      else if (!e && field === 0x15) {
        // a group's record: the first value says which
        if (rec.id === null) { rec.id = v; const c = g.curve || (g.curve = { deg: 3, cp: [], w: [], kn: [] }); rec.c = c; continue; }
        if (rec.id === 201 && t === 0x18) rec.c.deg = v;
        else if (rec.id === 202 && t === 0x1e) { rec.vals.push(v); if (rec.vals.length === 3) { rec.c.cp.push([rec.vals[0], rec.vals[1]]); rec.c.w.push(rec.vals[2]); rec.vals = []; } }
        else if (rec.id === 203 && t === 0x1e) rec.c.kn.push(v);
      }
    }
    const byName = new Map(groups.map(q => [q.name, q])), k0 = units === 'mm' ? 1 / 25.4 : 1, S = p => [p[0] * k0, p[1] * k0], out = [];
    let extent = 0; const seen = p => { extent = Math.max(extent, Math.abs(p[0]), Math.abs(p[1])); return p; };
    const n = { pt: 0, line: 0, arc: 0, spline: 0 };
    for (const en of byName.get('root').ents) {
      const a = en.nums;
      if (en.kind === 1 && a.length >= 2) { out.push(G.pt(S(seen([a[0], a[1]])))); n.pt++; }
      else if (en.kind === 3 && a.length >= 4) { const p = seen([a[0], a[1]]), q = seen([a[2], a[3]]); if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-12) { out.push(G.line(S(p), S(q))); n.line++; } }
      else if (en.kind === 6 && a.length >= 8) {
        const p = seen([a[0], a[1]]), q = [a[2], a[3]], sw = a[4], c = seen([a[5], a[6]]), r = Math.abs(a[7]);
        if (!(r > 1e-12)) { skip('arc (no radius)'); continue; }
        // a full turn, or the arc from its start round its centre the way its sweep goes
        if (Math.abs(Math.abs(sw) - 2 * Math.PI) < 1e-9 || Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-12 && Math.abs(sw) > 1) out.push(G.circle(S(c), r * k0));
        else out.push(G.arcCenter(S(c), S(p), S(q), sw > 0));
        n.arc++;
      } else if (en.kind === 7 && en.name) {
        const q = byName.get(en.name), c = q && q.curve;
        if (!c || c.cp.length < 2 || c.kn.length !== c.cp.length + c.deg + 1) { skip('curve (' + en.name + ' not found)'); continue; }
        c.cp.forEach(seen);
        out.push({ t: 'spline', deg: c.deg, kn: c.kn.slice(), cp: c.cp.map(S), w: c.w.some(x => Math.abs(x - 1) > 1e-12) ? c.w.slice() : null }); n.spline++;
      } else skip('entity of kind ' + en.kind);
    }
    const what = [['line', 'line', 'lines'], ['arc', 'arc or circle', 'arcs and circles'], ['spline', 'spline', 'splines'], ['pt', 'point', 'points']].filter(([k]) => n[k]).map(([k, one, many]) => n[k] + ' ' + (n[k] === 1 ? one : many)).join(', ');
    return { ents: out.map(g2 => ({ g: g2, pl: 'top', z: 0, lv: 1, col: '#e8e8e8' })), levels: [{ n: 1, name: 'EDM', vis: true }], units: units || 'in', skipped, extent,
      notes: ['Read as a Mitsubishi EDM drawing: ' + (what || 'nothing') + '.' + (n.spline ? ' The splines are exact; the arcs the machine fits to them were left out.' : '')] };
  }

  // ================================================================ DWG (through LibreDWG's reader)
  // LibreDWG's drawing (header, layers, block records, model-space entities, as libredwg-web gives them) written out
  // as DXF text, so readDXF does the rest: planes, blocks, units and layers come in exactly as from a DXF.
  function dwgToDXF(db) {
    const L = [], w = (c, v) => L.push(String(c), String(v));
    const f = v => { const x = +v; return isFinite(x) ? String(+x.toPrecision(15)) : '0'; };
    const P = (c, p) => { p = p || {}; w(c, f(p.x)); w(c + 10, f(p.y)); w(c + 20, f(p.z)); };
    const deg = r => f(+r * 180 / PI);
    const ext = d => { if (!d || (!d.x && !d.y && !d.z) || (Math.abs(d.x) < 1e-12 && Math.abs(d.y) < 1e-12 && Math.abs(d.z - 1) < 1e-12)) return; w(210, f(d.x)); w(220, f(d.y)); w(230, f(d.z)); };
    const head = (t, e) => { w(0, t); w(8, e.layer || '0'); if (e.colorIndex !== undefined && e.colorIndex !== 256 && e.colorIndex !== 0) w(62, e.colorIndex); };
    const ent = e => {
      switch (e.type) {
        case 'LINE': head('LINE', e); P(10, e.startPoint); P(11, e.endPoint); ext(e.extrusionDirection); return;
        case 'POINT': head('POINT', e); P(10, e.position); return;
        case 'CIRCLE': head('CIRCLE', e); P(10, e.center); w(40, f(e.radius)); ext(e.extrusionDirection); return;
        case 'ARC': head('ARC', e); P(10, e.center); w(40, f(e.radius)); w(50, deg(e.startAngle)); w(51, deg(e.endAngle)); ext(e.extrusionDirection); return;
        case 'ELLIPSE': head('ELLIPSE', e); P(10, e.center); P(11, e.majorAxisEndPoint); w(40, f(e.axisRatio)); w(41, f(e.startAngle)); w(42, f(e.endAngle)); ext(e.extrusionDirection); return;
        case 'LWPOLYLINE': case 'POLYLINE2D': {
          const V = e.vertices || []; head('LWPOLYLINE', e); w(90, V.length); w(70, (e.flag & 1) ? 1 : 0); w(38, f(e.elevation || 0));
          for (const v of V) { w(10, f(v.x)); w(20, f(v.y)); if (v.bulge) w(42, f(v.bulge)); }
          ext(e.extrusionDirection); return;
        }
        case 'POLYLINE3D': {
          head('POLYLINE', e); w(66, 1); w(70, 8 | ((e.flag & 1) ? 1 : 0));
          for (const v of e.vertices || []) { w(0, 'VERTEX'); w(8, e.layer || '0'); P(10, v); w(70, 32); }
          w(0, 'SEQEND'); return;
        }
        case 'SPLINE': {
          const kn = e.knots || [], cp = e.controlPoints || [], fp = e.fitPoints || [], wt = e.weights || [];
          head('SPLINE', e); w(70, e.flag || 0); w(71, e.degree || 3); w(72, kn.length); w(73, cp.length); w(74, fp.length);
          for (const k of kn) w(40, f(k)); if (wt.length === cp.length) for (const x of wt) w(41, f(x));
          for (const p of cp) P(10, p); for (const p of fp) P(11, p); return;
        }
        case 'INSERT': {
          head('INSERT', e); w(2, e.name); P(10, e.insertionPoint); w(41, f(e.xScale === undefined ? 1 : e.xScale)); w(42, f(e.yScale === undefined ? 1 : e.yScale)); w(43, f(e.zScale === undefined ? 1 : e.zScale)); w(50, deg(e.rotation || 0));
          if (e.columnCount > 1) { w(70, e.columnCount); w(44, f(e.columnSpacing)); } if (e.rowCount > 1) { w(71, e.rowCount); w(45, f(e.rowSpacing)); }
          ext(e.extrusionDirection); return;
        }
        default: head(e.type || 'UNKNOWN', e);          // counted as not read
      }
    };
    w(0, 'SECTION'); w(2, 'HEADER'); if (db.header && db.header.INSUNITS !== undefined) { w(9, '$INSUNITS'); w(70, db.header.INSUNITS); } w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER');
    for (const l of db.layers || []) { w(0, 'LAYER'); w(2, l.name); w(70, 0); w(62, (l.off ? -1 : 1) * Math.abs(l.colorIndex || 7)); }
    w(0, 'ENDTAB'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'BLOCKS');
    for (const b of db.blocks || []) {
      if (/^\*(Model|Paper)_Space/i.test(b.name)) continue;
      w(0, 'BLOCK'); w(8, '0'); w(2, b.name); w(70, 0); P(10, b.basePoint);
      for (const e of b.entities || []) ent(e);
      w(0, 'ENDBLK'); w(8, '0');
    }
    w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'ENTITIES'); for (const e of db.entities || []) if (!e.isInPaperSpace) ent(e); w(0, 'ENDSEC'); w(0, 'EOF');
    return L.join('\n') + '\n';
  }

  const api = { readPDFOps, dwgToDXF, readDXF, readMSWIN, unlzw, isCompressed, sniff, writeDXF, readSVG, writeSVG, writePDF, parseXML, pathGeoms, ocs, planeOf, aciColor, colorAci, DXF_UNITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CADIO = api;
})(this);
