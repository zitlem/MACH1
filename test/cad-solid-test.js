// Solids: the feature history on the OpenCascade kernel, run from the very files the page inlines (vendor/cad's
// bundle and wasm, in a bare sandbox like the page's worker). Volumes are checked against exact formulas.
const assert = require('assert'), vm = require('vm'), fs = require('fs'), zlib = require('zlib'), path = require('path');
const V = path.join(__dirname, '../vendor/cad/');
let n = 0;
const near = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const { PI } = Math;

(async () => {
  const ctx = { console: { log() {}, warn() {}, error: console.error }, setTimeout, clearTimeout, TextDecoder, TextEncoder, WebAssembly, URL, Blob, performance, crypto: globalThis.crypto };
  ctx.self = ctx; ctx.globalThis = ctx; ctx.WorkerGlobalScope = function () {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(V + 'kernel.iife.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/cad-kernel.js'), 'utf8'), ctx);
  const mod = await WebAssembly.compile(zlib.gunzipSync(fs.readFileSync(V + 'replicad_single.wasm.gz')));
  const oc = await ctx.MACH1_KERNEL.init({ instantiateWasm: (imp, cb) => { WebAssembly.instantiate(mod, imp).then(i => cb(i, mod)); return {}; }, print() {}, printErr() {} });
  const R = ctx.MACH1_KERNEL.replicad; R.setOC(oc);
  const K = ctx.CADKernel.create(R);
  const ok = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', String(e.stack || e).split('\n').slice(0, 3).join('\n  ')); process.exitCode = 1; } };
  const rect = (x0, y0, x1, y1, z) => [{ t: 'line', a: [x0, y0, z], b: [x1, y0, z] }, { t: 'line', a: [x1, y0, z], b: [x1, y1, z] }, { t: 'line', a: [x1, y1, z], b: [x0, y1, z] }, { t: 'line', a: [x0, y1, z], b: [x0, y0, z] }];
  const block = { id: 1, type: 'extrude', loops: [rect(0, 0, 2, 1, 0)], dir: [0, 0, 1], dist: 0.5, op: 'new' };
  const hole = { id: 2, type: 'hole', pts: [[1, 0.5, 0.5]], dir: [0, 0, -1], dia: 0.25, through: true };
  const vEdges = [[0, 0, 0.25], [2, 0, 0.25], [2, 1, 0.25], [0, 1, 0.25]];
  const vol = r => r.solids.reduce((s, x) => s + x.volume, 0);

  await ok('extrude a rectangle: 2 × 1 × 0.5', () => { const r = K.build([block]); assert.ok(r.status[0].ok && near(vol(r), 1), JSON.stringify(r.status) + ' ' + vol(r)); });
  await ok('a through hole', () => { const r = K.build([block, hole]); assert.ok(near(vol(r), 1 - PI * 0.125 ** 2 * 0.5), vol(r)); });
  await ok('fillet the four upright edges, found from points on them', () => {
    const r = K.build([block, hole, { id: 3, type: 'fillet', r: 0.1, picks: vEdges }]);
    assert.ok(r.status.every(s => s.ok), JSON.stringify(r.status));
    assert.ok(near(vol(r), 1 - PI * 0.125 ** 2 * 0.5 - 4 * 0.01 * (1 - PI / 4) * 0.5), vol(r));
  });
  await ok('replaying gives the same solid; an edge that is gone fails that feature only', () => {
    const a = vol(K.build([block, hole])), b = vol(K.build([block, hole]));
    assert.ok(a === b);
    const r = K.build([block, { id: 3, type: 'fillet', r: 0.1, picks: [[5, 5, 5]] }, hole]);
    assert.ok(!r.status[1].ok && /not there/.test(r.status[1].err) && r.status[2].ok && near(vol(r), 1 - PI * 0.125 ** 2 * 0.5), JSON.stringify(r.status));
  });
  await ok('chamfer a top edge', () => {
    const r = K.build([block, { id: 3, type: 'chamfer', r: 0.1, picks: [[1, 0, 0.5]] }]);
    assert.ok(near(vol(r), 1 - 0.1 * 0.1 / 2 * 2), vol(r));
  });
  await ok('a pocket: a chain inside another is a hole; both ways and cut', () => {
    const circ = [{ t: 'circle', c: [1, 0.5, 0], r: 0.25, n: [0, 0, 1] }];
    const r = K.build([{ id: 1, type: 'extrude', loops: [rect(0, 0, 2, 1, 0), circ], dir: [0, 0, 1], dist: 0.5, op: 'new' }]);
    assert.ok(near(vol(r), 1 - PI * 0.0625 * 0.5), 'pocket ' + vol(r));
    const b = K.build([{ id: 1, type: 'extrude', loops: [rect(0, 0, 2, 1, 0)], dir: [0, 0, 1], dist: 1, both: true, op: 'new' }]);
    assert.ok(near(vol(b), 2) && near(b.solids[0].shape.boundingBox.bounds[0][2], -0.5), 'both ways');
    const c = K.build([block, { id: 2, type: 'extrude', loops: [rect(0.5, 0.25, 1.5, 0.75, 0.5)], dir: [0, 0, -1], dist: 0.2, op: 'cut' }]);
    assert.ok(near(vol(c), 1 - 0.5 * 0.2), vol(c));
  });
  await ok('revolve a profile on the front plane round Z: a ring', () => {
    const prof = rect(1, 0, 2, 1, 0).map(c => ({ t: 'line', a: [c.a[0], 0, c.a[1]], b: [c.b[0], 0, c.b[1]] }));
    const r = K.build([{ id: 1, type: 'revolve', loops: [prof], axis: { p: [0, 0, 0], d: [0, 0, 1] }, angle: 360, op: 'new' }]);
    assert.ok(near(vol(r), PI * (4 - 1) * 1), vol(r));
  });
  await ok('arcs in a profile, boxes, cylinders and booleans', () => {
    // a 2 × 1 slot (two half circles) extruded 1
    const slot = [{ t: 'line', a: [0, 0, 0], b: [1, 0, 0] }, { t: 'arc', a: [1, 0, 0], m: [1.5, 0.5, 0], b: [1, 1, 0] }, { t: 'line', a: [1, 1, 0], b: [0, 1, 0] }, { t: 'arc', a: [0, 1, 0], m: [-0.5, 0.5, 0], b: [0, 0, 0] }];
    assert.ok(near(vol(K.build([{ id: 1, type: 'extrude', loops: [slot], dir: [0, 0, 1], dist: 1, op: 'new' }])), 1 + PI * 0.25));
    const r = K.build([{ id: 1, type: 'box', c1: [0, 0, 0], c2: [1, 1, 1], op: 'new' }, { id: 2, type: 'cyl', p: [0.5, 0.5, -1], d: [0, 0, 1], r: 0.25, h: 3, op: 'new' }, { id: 3, type: 'bool', op: 'cut', target: 'S1', tool: 'S2' }]);
    assert.ok(r.solids.length === 1 && near(vol(r), 1 - PI * 0.0625), vol(r));
  });
  await ok('STEP out in millimetres and back in inches, same volume', async () => {
    const r = K.build([block, hole]), txt = await K.stepOf([r.solids[0].shape]);
    assert.ok(/MILLI/.test(txt) && /CARTESIAN_POINT\('',\(50\.8,/.test(txt), 'mm coordinates');
    const s = await K.readSTEP(txt), back = K.build([{ id: 9, type: 'step', text: txt }]);
    assert.ok(near(R.measureVolume(s), vol(r)) && near(vol(back), vol(r)), vol(back));
    // kept by a key, as the page keeps the text once in the drawing's blobs
    await K.readSTEP(txt, 'b1');
    assert.ok(K.hasSTEP('b1') && near(vol(K.build([{ id: 9, type: 'step', blob: 'b1' }])), vol(r)) && !K.build([{ id: 9, type: 'step', blob: 'b2' }]).status[0].ok);
  });
  await ok('meshes for the screen', () => {
    const m = K.mesh(K.build([block, hole]).solids[0].shape);
    assert.ok(m.t.length > 30 && m.v.length === m.n.length && m.lines.length > 0 && m.edges.length >= 12 && m.faces.length >= 7, m.edges.length + ' edges, ' + m.faces.length + ' faces');
  });
  await ok('the screen mesh is as fine as the part needs: a ten-thousandth of its size', () => {
    const big = K.build([{ id: 1, type: 'cyl', p: [0, 0, 0], d: [0, 0, 1], r: 20, h: 10, op: 'new' }]).solids[0].shape, small = K.build([{ id: 1, type: 'cyl', p: [0, 0, 0], d: [0, 0, 1], r: 0.5, h: 0.25, op: 'new' }]).solids[0].shape;
    assert.ok(near(K.meshTol(big), Math.hypot(40, 40, 10) * 1e-4) && K.meshTol(small) === 0.0005, K.meshTol(big) + ' ' + K.meshTol(small));
    const fine = K.mesh(big, 0.0005).t.length / 3, now = K.mesh(big).t.length / 3;
    assert.ok(now < fine / 3, now + ' triangles, against ' + fine + ' at 0.0005');
  });
  // moving and copying solids, shells, drafts, sweeps and lofts
  const box2 = { id: 1, type: 'extrude', loops: [rect(0, 0, 2, 2, 0)], dir: [0, 0, 1], dist: 1, op: 'new' }, bb = r => r.shape.boundingBox.bounds;
  await ok('a solid moved and turned by a matrix keeps its volume and goes where it should; a copy is a second solid', () => {
    // a quarter turn about Z, then 5 along X and 2 up
    const mv = { id: 2, type: 'xform', target: 'S1', m: [0, -1, 0, 5, 1, 0, 0, 0, 0, 0, 1, 2] }, r = K.build([box2, mv]);
    const b = bb(r.solids[0]); assert.ok(r.status.every(x => x.ok) && near(vol(r), 4) && near(b[0][0], 3) && near(b[1][0], 5) && near(b[0][2], 2), JSON.stringify(b));
    const c = K.build([box2, Object.assign({}, mv, { copy: true })]); assert.ok(c.solids.length === 2 && near(vol(c), 8) && c.solids[1].key === 'S2', 'the copy');
    const m = K.build([box2, { id: 2, type: 'xform', target: 'S1', m: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] }]); assert.ok(near(vol(m), 4) && near(bb(m.solids[0])[0][0], -2), 'a mirror: inside out it is not');
    const sc = K.build([box2, { id: 2, type: 'xform', target: 'S1', m: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0] }]); assert.ok(near(vol(sc), 32), 'scaled twice');
  });
  await ok('shell: a 2 × 2 × 1 box, its top taken away, walls 0.1 inward', () => {
    const r = K.build([box2, { id: 2, type: 'shell', t: 0.1, picks: [[1, 1, 1]] }]); assert.ok(r.status.every(x => x.ok) && near(vol(r), 4 - 1.8 * 1.8 * 0.9), JSON.stringify(r.status) + ' ' + vol(r));
    // outward, the outside's edges and corners come out round (radius 0.1): four side walls and the bottom, quarter
    // rounds along the four upright and four bottom edges, eighth balls at the bottom corners
    const o = K.build([box2, { id: 2, type: 'shell', t: -0.1, picks: [[1, 1, 1]] }]); assert.ok(near(vol(o), 0.8 + 0.4 + PI * 0.01 * 3 + PI * 0.001 * 2 / 3), 'outward: ' + vol(o));
    const gone = K.build([box2, { id: 2, type: 'shell', t: 0.1, picks: [[9, 9, 9]] }]); assert.ok(!gone.status[1].ok && /not there/.test(gone.status[1].err));
  });
  await ok('draft: the four sides at 5°, about the bottom: a frustum', () => {
    const r = K.build([box2, { id: 2, type: 'draft', angle: 5, picks: [[1, 0, 0.5], [2, 1, 0.5], [1, 2, 0.5], [0, 1, 0.5]], plane: { o: [0, 0, 0], n: [0, 0, 1] } }]);
    const a = 2 - 2 * Math.tan(5 * PI / 180), want = (4 + a * a + 2 * a) / 3;
    assert.ok(r.status.every(x => x.ok) && near(vol(r), want, 1e-6), JSON.stringify(r.status) + ' ' + vol(r) + ' want ' + want);
  });
  await ok('sweep: a circle along a line, and along a quarter circle (Pappus)', () => {
    const disc = (c, n) => [{ t: 'circle', c, r: 0.25, n }];
    const a = K.build([{ id: 1, type: 'sweep', loops: [disc([0, 0, 0], [1, 0, 0])], path: [{ t: 'line', a: [0, 0, 0], b: [2, 0, 0] }], op: 'new' }]);
    assert.ok(a.status[0].ok && near(vol(a), PI * 0.0625 * 2, 1e-6), JSON.stringify(a.status) + ' ' + vol(a));
    const q = K.build([{ id: 1, type: 'sweep', loops: [disc([2, 0, 0], [0, 1, 0])], path: [{ t: 'arc', a: [2, 0, 0], m: [Math.SQRT2, Math.SQRT2, 0], b: [0, 2, 0] }], corner: 'round', frenet: true, op: 'new' }]);
    assert.ok(q.status[0].ok && near(vol(q), PI * 0.0625 * PI, 1e-5), JSON.stringify(q.status) + ' ' + vol(q));
  });
  await ok('loft: a 2 × 2 square to a 1 × 1 one an inch up, ruled: 7/3', () => {
    const r = K.build([{ id: 1, type: 'loft', sections: [rect(-1, -1, 1, 1, 0), rect(-0.5, -0.5, 0.5, 0.5, 1)], ruled: true, op: 'new' }]);
    assert.ok(r.status[0].ok && near(vol(r), 7 / 3, 1e-6), JSON.stringify(r.status) + ' ' + vol(r));
    const c = K.build([{ id: 1, type: 'loft', sections: [[{ t: 'circle', c: [0, 0, 0], r: 1, n: [0, 0, 1] }], [{ t: 'circle', c: [0, 0, 2], r: 0.5, n: [0, 0, 1] }]], ruled: true, op: 'new' }]);
    assert.ok(near(vol(c), PI * 2 / 3 * (1 + 0.25 + 0.5), 1e-4), 'a cone frustum: ' + vol(c));
  });
  // a solid's edges as wireframe: all of them, a face's, and a section
  await ok('curves from a solid: every edge, the edges of a face, and a section, exact', () => {
    // a 2 × 1 × 0.5 block, its upright edges filleted R0.1, a Ø0.5 hole through it
    const r = K.build([{ id: 1, type: 'box', c1: [0, 0, 0], c2: [2, 1, 0.5], op: 'new' }, { id: 2, type: 'hole', pts: [[1, 0.5, 0.5]], dir: [0, 0, -1], dia: 0.5, through: true },
      { id: 3, type: 'fillet', r: 0.1, picks: [[0, 0, 0.25], [2, 0, 0.25], [2, 1, 0.25], [0, 1, 0.25]] }]), s = r.solids[0].shape;
    const kinds = L => L.reduce((o, c) => (o[c.t] = (o[c.t] || 0) + 1, o), {});
    const all = K.curvesOf(s, { mode: 'all' }).curves;
    assert.deepStrictEqual(kinds(all), { line: 17, arc: 8, circle: 2 }, JSON.stringify(kinds(all)));
    assert.ok(all.filter(c => c.t === 'arc').every(c => near(c.r, 0.1) && Math.abs(Math.abs(c.n[2]) - 1) < 1e-9) && all.filter(c => c.t === 'circle').every(c => near(c.r, 0.25)), 'the fillets and the hole, at their sizes');
    const top = K.curvesOf(s, { mode: 'face', pick: [1.5, 0.2, 0.5] });
    assert.deepStrictEqual(kinds(top.curves), { line: 4, arc: 4, circle: 1 }); assert.ok(near(top.plane.n[2], 1) && near(top.plane.o[2], 0.5), 'the top face and its plane');
    assert.ok(top.curves.every(c => (c.a || c.c)[2] === undefined || near((c.a || c.c)[2], 0.5)), 'all at its height');
    const sec = K.curvesOf(s, { mode: 'section', plane: { o: [0, 0, 0.3], n: [0, 0, 1], x: [1, 0, 0] } });
    assert.deepStrictEqual(kinds(sec.curves), { line: 4, arc: 4, circle: 1 }); assert.ok(sec.curves.every(c => near((c.a || c.c)[2], 0.3)), 'the section, at z 0.3');
    // a spline edge: a loft from a circle to a square has none; a sweep along an S of arcs is planar
    const sw = K.build([{ id: 1, type: 'sweep', loops: [[{ t: 'circle', c: [0, 0, 0], r: 0.1, n: [1, 0, 0] }]], path: [{ t: 'line', a: [0, 0, 0], b: [1, 0, 0] }], op: 'new' }]).solids[0].shape;
    const sc = K.curvesOf(sw, { mode: 'all' }).curves; assert.ok(sc.length >= 2 && sc.every(c => c.t !== 'poly'), JSON.stringify(kinds(sc)));
  });
  console.log(n + ' solid tests passed' + (process.exitCode ? ' (with failures)' : ''));
})().catch(e => { console.log('ERROR', e.stack); process.exit(2); });
