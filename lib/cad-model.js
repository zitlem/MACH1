// The CAD app's document: wireframe entities (lib/cad-geom.js geometry on a plane, at a depth, on a level, in a
// colour), bodies (triangle meshes read from STL/OBJ/3MF; their triangles are never copied, only shared), the levels,
// the solids' feature list, and undo/redo kept as small changes rather than whole copies.
// Works in the browser (window.CADModel) and in Node (require('./lib/cad-model.js')).
//
//   const d = CADModel.create();
//   const [id] = d.add([CADGeom.line([0, 0], [1, 0])]);       // on the active level, plane, depth and colour
//   d.undo(); d.redo(); const json = d.toJSON(); const d2 = CADModel.fromJSON(json);
(function (root) {
  'use strict';
  const copy = o => JSON.parse(JSON.stringify(o));
  // the construction planes: x and y axes in the world, and the normal the depth runs along (right-handed: x × y = n)
  const PLANES = {
    top: { name: 'Top', x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
    front: { name: 'Front', x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] },
    right: { name: 'Right', x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] },
  };
  // a plane point (x, y) at depth z as a world point, and back. pl: a plane's key, or the plane itself
  // ({x, y, n, o}: a plane of the drawing's own, its origin o)
  const planeOf = pl => pl && typeof pl === 'object' ? pl : PLANES[pl] || PLANES.top;
  function toWorld(pl, p, z) { const P = planeOf(pl), x = P.x, y = P.y, n = P.n, d = z || 0, o = P.o || [0, 0, 0]; return [o[0] + x[0] * p[0] + y[0] * p[1] + n[0] * d, o[1] + x[1] * p[0] + y[1] * p[1] + n[1] * d, o[2] + x[2] * p[0] + y[2] * p[1] + n[2] * d]; }
  function fromWorld(pl, w) { const P = planeOf(pl), o = P.o || [0, 0, 0], q = [w[0] - o[0], w[1] - o[1], w[2] - o[2]], d = v => v[0] * q[0] + v[1] * q[1] + v[2] * q[2]; return [d(P.x), d(P.y), d(P.n)]; }
  // a plane through o with x along ax and the point py on its y side: the axes made square and right-handed
  function planeFrom(o, ax, py) {
    const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? v.map(c => c / l) : null; }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const x = nrm(ax); if (!x) return null; const v = [py[0] - o[0], py[1] - o[1], py[2] - o[2]], n = nrm(cr(x, v)); if (!n) return null;
    return { o: o.slice(), x, y: cr(n, x), n };
  }
  // the three every drawing has, as planes of the drawing (a key, a name and an origin)
  const BUILT = {}; for (const k of Object.keys(PLANES)) BUILT[k] = Object.freeze(Object.assign({ key: k, o: [0, 0, 0] }, PLANES[k]));
  const COLORS = ['#e8e8e8', '#ff5a4f', '#ffd23f', '#3ccf6e', '#38c6f4', '#4f7bff', '#d65cff', '#ff9a3a', '#9aa6ae'];
  const DEFAULT_LEVEL = { n: 1, name: 'Main', vis: true };
  // an entity's attributes (everything but its id and geometry), for a copy or a replacement to take
  function attrs(e) { const o = { lv: e.lv, col: e.col, pl: e.pl, z: e.z }; if (e.ls) o.ls = e.ls; if (e.lw) o.lw = e.lw; if (e.cons) o.cons = true; return o; }

  function create(opts) {
    const o = opts || {};
    const doc = {
      units: o.units || 'in', name: o.name || 'Untitled',
      ents: new Map(), bodies: new Map(), levels: new Map([[1, copy(DEFAULT_LEVEL)]]), feats: [],
      // the drawing's own planes (Top, Front and Right are always there): key → {key, name, o, x, y, n}
      planes: new Map(),
      // big texts the solids refer to (a STEP file read in): kept once here, never changed, so neither the history
      // of features nor undo copies them
      blobs: new Map(),
      active: { lv: 1, col: COLORS[0], pl: 'top', z: 0 },
      nextId: 1, undoStack: [], redoStack: [], group: null, listeners: [], undoBytes: 0, iconHint: null,
    };
    // ---- the change log: every edit is a list of ops, each one undoable. Entities are never changed in place (an
    // edit puts a new object in), so an added entity is the op's own object, shared with the drawing, not copied again
    const apply = (op, fwd) => {
      if (op.k === 'add' || op.k === 'rm') { const adding = (op.k === 'add') === fwd; if (adding) doc.ents.set(op.e.id, op.e); else doc.ents.delete(op.e.id); }
      else if (op.k === 'ent') doc.ents.set(op.id, copy(fwd ? op.after : op.before));
      else if (op.k === 'addb' || op.k === 'rmb') { if ((op.k === 'addb') === fwd) doc.bodies.set(op.b.id, op.b); else doc.bodies.delete(op.b.id); }
      else if (op.k === 'body') doc.bodies.set(op.id, fwd ? op.after : op.before);
      else if (op.k === 'level') { const v = fwd ? op.after : op.before; if (v) doc.levels.set(op.n, copy(v)); else doc.levels.delete(op.n); }
      else if (op.k === 'plane') { const v = fwd ? op.after : op.before; if (v) doc.planes.set(op.key, copy(v)); else doc.planes.delete(op.key); }
      else if (op.k === 'feats') doc.feats = copy(fwd ? op.after : op.before);
      else if (op.k === 'active') doc.active = copy(fwd ? op.after : op.before);
    };
    const emit = what => doc.listeners.forEach(f => f(what));
    // Undo keeps up to 500 steps and, roughly, 250 MB: a step that moves a big mesh or many entities keeps their
    // copies, and the oldest steps go first
    const opBytes = op => op.k === 'add' || op.k === 'rm' ? 200 + (op.e.g.cp ? op.e.g.cp.length * 48 : 0) : op.k === 'ent' ? 400 + (op.after.g && op.after.g.cp ? op.after.g.cp.length * 96 : 0)
      : op.k === 'addb' || op.k === 'rmb' ? 200 + (op.b.pos ? op.b.pos.byteLength : 0) : op.k === 'body' ? 200 + (op.after.pos !== op.before.pos ? op.after.pos.byteLength : 0) : 200;
    // each step also keeps when it was made, and what made it (icon: a command's id, from batch or from iconHint, which
    // the page sets while a one-click action runs), for the history
    const push = step => {
      step.bytes = step.ops.reduce((n, op) => n + opBytes(op), 0); step.t = Date.now(); if (!step.icon && doc.iconHint) step.icon = doc.iconHint;
      doc.undoStack.push(step); doc.undoBytes += step.bytes;
      while (doc.undoStack.length > 500 || (doc.undoBytes > 250e6 && doc.undoStack.length > 1)) doc.undoBytes -= doc.undoStack.shift().bytes;
      doc.redoStack = [];
    };
    const record = (ops, label) => {
      if (!ops.length) return;
      ops.forEach(op => apply(op, true));
      if (doc.group) doc.group.ops.push(...ops);
      else { push({ label, ops }); emit(label); }
    };
    // ---- edits
    // a new entity's attributes: the active ones. Line style (ls: dash, center, hidden, phantom), width (lw: med,
    // thick) and construction (cons) are left off when they are the plain kind, so older files and drawings match
    const defaults = () => { const a = doc.active, e = { id: doc.nextId++, lv: a.lv, col: a.col, pl: a.pl, z: a.z }; if (a.ls) e.ls = a.ls; if (a.lw) e.lw = a.lw; if (a.cons) e.cons = true; return e; };
    doc.add = (geoms, props, label) => {
      const ids = [], ops = [];
      for (const g of geoms) {
        const e = Object.assign(defaults(), props || {}, { g: copy(g) });
        ids.push(e.id); ops.push({ k: 'add', e });
      }
      record(ops, label || 'Add'); return ids;
    };
    // many entities at once, from a file just read: [{g, props}], the geometry taken as it is (not copied)
    doc.addMany = (items, label) => {
      const ids = [], ops = [];
      for (const it of items) { const e = Object.assign(defaults(), it.props || {}, { g: it.g }); ids.push(e.id); ops.push({ k: 'add', e }); }
      record(ops, label || 'Add'); return ids;
    };
    doc.remove = (ids, label) => record(ids.filter(id => doc.ents.has(id) || doc.bodies.has(id)).map(id => doc.ents.has(id) ? { k: 'rm', e: copy(doc.ents.get(id)) } : { k: 'rmb', b: doc.bodies.get(id) }), label || 'Delete');
    // a body: {kind: 'mesh', pos: Float32Array, name} (the array is kept as it is, not copied)
    doc.addBody = (body, props, label) => {
      const b = Object.assign({ id: doc.nextId++, lv: doc.active.lv, col: '#9fb3c2', name: '' }, props || {}, body);
      record([{ k: 'addb', b }], label || 'Add body'); return b.id;
    };
    doc.updateBody = (id, patch, label) => { const b = doc.bodies.get(id); if (!b) return; record([{ k: 'body', id, before: b, after: Object.assign({}, b, patch) }], label || 'Change'); };
    // swap entities for new geometry; the new ones take the first one's level, plane, depth, colour and style
    doc.replace = (ids, geoms, label) => {
      const first = doc.ents.get(ids[0]), props = first ? attrs(first) : {};
      let out; doc.batch(label || 'Change', () => { doc.remove(ids); out = doc.add(geoms, props); }); return out;
    };
    // change an entity's level, colour, plane, depth or geometry
    // (a null in the patch takes that attribute away: ls: null makes a line solid again). An entity of a shape that
    // keeps its sizes (sh: a rectangle, slot or polygon) is a plain entity again once its geometry is changed by
    // anything that does not say how the shape changes with it
    doc.update = (id, patch, label) => { const e = doc.ents.get(id); if (!e) return; const after = Object.assign(copy(e), copy(patch)); if (patch.g && !('sh' in patch)) delete after.sh; for (const k of Object.keys(after)) if (after[k] === null) delete after[k]; record([{ k: 'ent', id, before: copy(e), after }], label || 'Change'); };
    doc.setLevel = (n, v, label) => record([{ k: 'level', n, before: doc.levels.has(n) ? copy(doc.levels.get(n)) : null, after: v ? Object.assign({ n }, copy(v)) : null }], label || 'Level');
    doc.setPlane = (key, v, label) => record([{ k: 'plane', key, before: doc.planes.has(key) ? copy(doc.planes.get(key)) : null, after: v ? Object.assign(copy(v), { key }) : null }], label || 'Plane');
    // a plane by its key: one of the drawing's own, or Top, Front or Right (an unknown key: Top)
    doc.plane = pl => doc.planes.get(pl) || BUILT[pl] || BUILT.top;
    doc.setFeats = (list, label) => record([{ k: 'feats', before: copy(doc.feats), after: copy(list) }], label || 'Solids');
    doc.setActive = (patch, label) => record([{ k: 'active', before: copy(doc.active), after: Object.assign(copy(doc.active), patch) }], label || 'Settings');
    // several edits as one undo step
    doc.batch = (label, fn, icon) => {
      if (doc.group) return fn();
      doc.group = { label, ops: [], icon };
      let r; try { r = fn(); } catch (e) { const g = doc.group; doc.group = null; g.ops.slice().reverse().forEach(op => apply(op, false)); throw e; }
      const g = doc.group; doc.group = null;
      if (g.ops.length) { push(g); emit(label); }
      return r;
    };
    const back = () => { const s = doc.undoStack.pop(); if (!s) return null; doc.undoBytes -= s.bytes || 0; s.ops.slice().reverse().forEach(op => apply(op, false)); doc.redoStack.push(s); return s; };
    const fwd = () => { const s = doc.redoStack.pop(); if (!s) return null; s.ops.forEach(op => apply(op, true)); doc.undoStack.push(s); doc.undoBytes += s.bytes || 0; return s; };
    doc.undo = () => { const s = back(); if (!s) return null; emit('undo'); return s.label; };
    doc.redo = () => { const s = fwd(); if (!s) return null; emit('redo'); return s.label; };
    // back or forward until n steps are done (the history list: click a step to go to it), telling the page once
    doc.goTo = n => { let k = 0; while (doc.undoStack.length > n && back()) k++; while (doc.undoStack.length < n && fwd()) k++; if (k) emit('history'); return k; };
    // a big text kept once (see blobs): its key, made from the text itself, so the same text has the same key in any
    // drawing (the solids kernel keeps what it has read by these keys)
    doc.addBlob = text => { const k = blobKey(text); if (!doc.blobs.has(k)) doc.blobs.set(k, text); return k; };
    doc.onChange = f => { doc.listeners.push(f); return () => { doc.listeners = doc.listeners.filter(g => g !== f); }; };
    // ---- reading
    doc.get = id => doc.ents.get(id);
    doc.list = filter => [...doc.ents.values()].filter(e => !filter || filter(e));
    doc.visible = () => doc.list(e => { const l = doc.levels.get(e.lv); return !l || l.vis; });
    doc.visibleBodies = () => [...doc.bodies.values()].filter(b => { const l = doc.levels.get(b.lv); return !l || l.vis; });
    doc.level = n => doc.levels.get(n) || { n, name: '', vis: true };
    // ---- files
    // raw: bodies' triangles kept as arrays (for the browser's own storage) rather than base64 text (for a file)
    // ---- the history, saved too: the latest steps and those undone (to redo), up to a count and a size (in a file 100
    // steps, in the browser's own storage all 500; about 30 MB either way, so a step that moved a big mesh, and those
    // before it, stay behind rather than slowing every save); a STEP file a step needs goes with it
    const HIST = { file: { steps: 100, bytes: 30e6 }, raw: { steps: 500, bytes: 30e6 } };
    const histSteps = raw => {
      const room = Object.assign({}, HIST[raw ? 'raw' : 'file']), take = L => { const out = []; for (let i = L.length - 1; i >= 0 && room.steps > 0; i--) { if ((L[i].bytes || 0) > room.bytes) break; room.bytes -= L[i].bytes || 0; room.steps--; out.unshift(L[i]); } return out; };
      const undo = take(doc.undoStack), redo = take(doc.redoStack); return { undo, redo };
    };
    // in a file, a body's triangles in a step are kept once: a body still in the drawing by its id, others as base64
    function histOut(raw) {
      const { undo, redo } = histSteps(raw), meshes = [], mi = new Map(), inDoc = new Map(); for (const b of doc.bodies.values()) if (b.pos) inDoc.set(b.pos, b.id);
      const pos = p => { if (!p || raw) return p; if (inDoc.has(p)) return { b: inDoc.get(p) }; if (!mi.has(p)) { mi.set(p, meshes.length); meshes.push(b64(p)); } return { m: mi.get(p) }; };
      const bOut = b => b && b.pos ? Object.assign({}, b, { pos: pos(b.pos) }) : b;
      const opOut = op => op.k === 'addb' || op.k === 'rmb' ? Object.assign({}, op, { b: bOut(op.b) }) : op.k === 'body' ? Object.assign({}, op, { before: bOut(op.before), after: bOut(op.after) }) : op;
      const stOut = st => ({ label: st.label, icon: st.icon, t: st.t, ops: st.ops.map(opOut) });
      return { undo: undo.map(stOut), redo: redo.map(stOut), meshes };
    }
    // back from a file or the browser: the steps as they were (a step that cannot be read drops the history, not the file)
    doc.loadHistory = (h, raw) => {
      try {
        const meshes = (h.meshes || []).map(unb64), pos = p => !p || ArrayBuffer.isView(p) ? p : p.b !== undefined ? (doc.bodies.get(p.b) || {}).pos : p.m !== undefined ? meshes[p.m] : typeof p === 'string' ? unb64(p) : p;
        const bIn = b => b && b.pos ? Object.assign({}, b, { pos: pos(b.pos) }) : b;
        const opIn = op => op.k === 'addb' || op.k === 'rmb' ? Object.assign({}, op, { b: bIn(op.b) }) : op.k === 'body' ? Object.assign({}, op, { before: bIn(op.before), after: bIn(op.after) }) : op;
        const stIn = st => { const o = { label: String(st.label || 'Step'), icon: st.icon, ops: (st.ops || []).map(opIn) }; o.bytes = o.ops.reduce((n, op) => n + opBytes(op), 0); o.t = st.t; return o; };
        doc.undoStack = (h.undo || []).map(stIn); doc.redoStack = (h.redo || []).map(stIn); doc.undoBytes = doc.undoStack.reduce((n, x) => n + x.bytes, 0);
      } catch (e) { doc.undoStack = []; doc.redoStack = []; doc.undoBytes = 0; }
    };
    doc.toJSON = raw => {
      const hist = histOut(raw === true), used = new Set(doc.feats.map(f => f.blob).filter(Boolean)), blobs = {};
      for (const st of hist.undo.concat(hist.redo)) for (const op of st.ops) if (op.k === 'feats') for (const f of op.before.concat(op.after)) if (f.blob) used.add(f.blob);
      for (const k of used) if (doc.blobs.has(k)) blobs[k] = doc.blobs.get(k);
      return { mach1cad: 1, units: doc.units, name: doc.name, active: doc.active, nextId: doc.nextId, levels: [...doc.levels.values()], planes: [...doc.planes.values()], ents: [...doc.ents.values()], feats: doc.feats, blobs,
        bodies: [...doc.bodies.values()].map(b => raw === true ? b : Object.assign({}, b, b.pos ? { pos: b64(b.pos) } : {})), history: hist };
    };
    return doc;
  }
  function fromJSON(j) {
    if (!j || j.mach1cad !== 1) throw new Error('Not a MACH1 CAD file');
    const d = create({ units: j.units, name: j.name });
    d.levels = new Map((j.levels || [DEFAULT_LEVEL]).map(l => [l.n, copy(l)]));
    d.planes = new Map((j.planes || []).map(p => [p.key, copy(p)]));
    for (const e of j.ents || []) d.ents.set(e.id, copy(e));
    d.feats = copy((j.feats || []).map(f => f.type === 'step' && f.text !== undefined ? Object.assign({}, f, { text: undefined }) : f));
    for (const k of Object.keys(j.blobs || {})) d.blobs.set(k, j.blobs[k]);
    // older files kept a STEP file's text in its feature: it moves to the blobs
    (j.feats || []).forEach((f, i) => { if (f.type === 'step' && typeof f.text === 'string') { d.feats[i].blob = d.addBlob(f.text); delete d.feats[i].text; } });
    for (const b of j.bodies || []) d.bodies.set(b.id, Object.assign({}, b, typeof b.pos === 'string' ? { pos: unb64(b.pos) } : {}));
    d.active = Object.assign(d.active, copy(j.active || {}));
    d.nextId = Math.max(j.nextId || 1, ...[...d.ents.keys(), ...d.bodies.keys()].map(k => k + 1));
    if (j.history) d.loadHistory(j.history);
    return d;
  }

  // FNV-1a of the text, with its length
  function blobKey(t) { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return 't' + t.length.toString(36) + '.' + (h >>> 0).toString(36); }
  // triangles in project files: base64 of the floats
  function b64(f32) { const b = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); if (typeof Buffer !== 'undefined') return Buffer.from(b).toString('base64'); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const b = typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), c => c.charCodeAt(0)); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }

  const api = { create, fromJSON, blobKey, attrs, PLANES, toWorld, fromWorld, planeFrom, COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CADModel = api;
})(this);
