// CAD geometry and files: known answers for the 2D entity maths (intersections, trim, fillet, chamfer, offset,
// chains, areas, splines, transforms) and exact round trips through the file formats.
const assert = require('assert');
const G = require('../lib/cad-geom.js');
const M = require('../lib/cad-model.js');
const IO = require('../lib/cad-io.js');
const ME = require('../lib/cad-mesh.js');
const DR = require('../lib/cad-draft.js');
const FIND = require('../lib/cad-find.js');
const zlib = require('zlib'), fs = require('fs'), path = require('path');
let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.stack.split('\n').slice(0, 3).join('\n  ')); process.exitCode = 1; } };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const nearP = (p, q, tol = 1e-9) => near(p[0], q[0], tol) && near(p[1], q[1], tol);
const P = p => '[' + p.map(v => +v.toFixed(6)).join(', ') + ']';
const { PI } = Math;

ok('lines meet; arcs and circles meet lines and each other', () => {
  const h = G.intersect(G.line([0, 0], [2, 2]), G.line([0, 2], [2, 0]));
  assert.ok(h.length === 1 && nearP(h[0].p, [1, 1]) && near(h[0].t1, 0.5));
  assert.strictEqual(G.intersect(G.line([0, 0], [1, 1]), G.line([2, 0], [3, -1])).length, 0, 'apart');
  assert.strictEqual(G.intersect(G.line([0, 0], [1, 1]), G.line([2, 0], [3, -1]), true).length, 1, 'extended');
  const c = G.circle([0, 0], 1), lc = G.intersect(G.line([-2, 0], [2, 0]), c);
  assert.ok(lc.length === 2 && lc.some(x => nearP(x.p, [-1, 0])) && lc.some(x => nearP(x.p, [1, 0])));
  assert.strictEqual(G.intersect(G.line([-2, 1], [2, 1]), c).length, 1, 'tangent once');
  const top = G.arc([0, 0], 1, 0, PI);               // upper half only
  assert.strictEqual(G.intersect(G.line([0, -2], [0, 2]), top).length, 1);
  const cc = G.intersect(G.circle([0, 0], 1), G.circle([1, 0], 1));
  assert.ok(cc.length === 2 && cc.some(x => nearP(x.p, [0.5, Math.sqrt(3) / 2])));
  assert.strictEqual(G.intersect(G.circle([0, 0], 1), G.circle([3, 0], 1)).length, 0);
});
ok('arcs from 3 points, a radius and a tangent', () => {
  const a = G.arc3([1, 0], [0, 1], [-1, 0]);
  assert.ok(nearP(a.c, [0, 0]) && near(a.r, 1) && near(a.sw, PI), JSON.stringify(a));
  const cw = G.arc3([-1, 0], [0, 1], [1, 0]); assert.ok(near(cw.sw, -PI));
  const r = G.arcRadius([0, 0], [2, 0], 1, true); assert.ok(nearP(r.c, [1, 0]) && near(Math.abs(r.sw), PI));
  assert.strictEqual(G.arcRadius([0, 0], [2, 0], 0.9, true), null, 'too small');
  const t = G.arcTangent([0, 0], [1, 0], [1, 1]);   // leaves along +X, ends a quarter round
  assert.ok(nearP(t.c, [0, 1]) && near(t.sw, PI / 2), JSON.stringify(t));
  assert.ok(nearP(G.tangent(t, 0), [1, 0]));
});
ok('nearest point, length, bounding box', () => {
  assert.ok(nearP(G.nearest(G.line([0, 0], [2, 0]), [1, 5]).p, [1, 0]));
  assert.ok(nearP(G.nearest(G.line([0, 0], [2, 0]), [5, 5]).p, [2, 0]));
  const q = G.arc([0, 0], 1, 0, PI / 2);
  assert.ok(nearP(G.nearest(q, [1, 1]).p, [Math.SQRT1_2, Math.SQRT1_2]));
  assert.ok(near(G.length(q), PI / 2) && near(G.length(G.circle([0, 0], 2)), 4 * PI));
  assert.deepStrictEqual(G.bbox(G.arc([0, 0], 1, -PI / 4, PI / 2)).map(v => +v.toFixed(9)), [0.707106781, -0.707106781, 1, 0.707106781]);
});
ok('splines: Béziers exact, split keeps the curve, ellipses exact, through points', () => {
  const b = G.bezier([[0, 0], [1, 2], [3, 2], [4, 0]]);
  const B = t => [3 * (1 - t) ** 2 * t * 1 + 3 * (1 - t) * t * t * 3 + t ** 3 * 4, 3 * (1 - t) ** 2 * t * 2 + 3 * (1 - t) * t * t * 2];
  for (const t of [0.1, 0.37, 0.8]) assert.ok(nearP(G.spEval(b, t), B(t)), 't ' + t);
  const [l, r] = G.spSplit(b, 0.3);
  assert.ok(nearP(G.end(l), B(0.3)) && nearP(G.start(r), B(0.3)) && nearP(G.at(r, 0.5), B(0.65)), P(G.at(r, 0.5)) + ' vs ' + P(B(0.65)));
  const e = G.ellipse([1, 2], 3, 1, PI / 6, 0, 2 * PI);
  for (const t of [0, 0.13, 0.5, 0.77]) {
    const p = G.at(e, t), x = p[0] - 1, y = p[1] - 2, c = Math.cos(-PI / 6), s = Math.sin(-PI / 6), u = x * c - y * s, v = x * s + y * c;
    assert.ok(near(u * u / 9 + v * v, 1, 1e-9), 'on the ellipse at ' + t);
  }
  const pts = [[0, 0], [1, 1], [2, 0], [3, 1.5], [4, 0.5]], s = G.splineThrough(pts);
  for (const p of pts) assert.ok(G.nearest(s, p).d < 1e-7, 'passes ' + p);
});
ok('split, divide and trim', () => {
  const parts = G.splitAt(G.line([0, 0], [4, 0]), [0.75, 0.25]);
  assert.deepStrictEqual(parts.map(e => G.end(e)[0]), [1, 3, 4]);
  const halves = G.splitAt(G.circle([0, 0], 1), [0.25, 0.75]);
  assert.ok(halves.length === 2 && near(Math.abs(halves[0].sw) + Math.abs(halves[1].sw), 2 * PI) && nearP(G.start(halves[0]), [0, 1]));
  // trim a line to a wall, and extend another up to it
  const wall = G.line([2, -5], [2, 5]);
  assert.ok(nearP(G.end(G.trim1(G.line([0, 0], [3, 0]), wall, [0.5, 0])), [2, 0]));
  assert.ok(nearP(G.end(G.trim1(G.line([0, 1], [1, 1]), wall, [0.5, 1])), [2, 1]), 'extended');
  assert.ok(nearP(G.start(G.trim1(G.line([0, 0], [3, 0]), wall, [2.8, 0])), [2, 0]), 'kept the far side');
  // two crossing lines trimmed to a corner
  const [a, b] = G.trim2(G.line([-1, 0], [3, 0]), G.line([1, -1], [1, 3]), [2.5, 0], [1, 2.5]);
  assert.ok(nearP(G.start(a), [1, 0]) && nearP(G.end(a), [3, 0]) && nearP(G.start(b), [1, 0]) && nearP(G.end(b), [1, 3]));
  // divide: the middle of a line between two crossers goes
  const d = G.divide(G.line([0, 0], [6, 0]), [G.line([2, -1], [2, 1]), G.line([4, -1], [4, 1])], [3, 0]);
  assert.ok(d.kept.length === 2 && nearP(G.end(d.kept[0]), [2, 0]) && nearP(G.start(d.kept[1]), [4, 0]) && near(G.length(d.removed), 2));
  // a circle trimmed between two lines keeps the picked side
  const k = G.trimBetween(G.circle([0, 0], 1), G.line([-2, 0.5], [2, 0.5]), G.line([-2, -0.5], [2, -0.5]), [1, 0]);
  assert.ok(G.nearest(k, [1, 0]).d < 1e-9 && G.nearest(k, [-1, 0]).d > 0.5);
  assert.ok(near(G.length(G.extend(G.line([0, 0], [1, 0]), true, 0.5)), 1.5) && near(G.length(G.extend(G.arc([0, 0], 2, 0, 1), false, 1)), 3));
});
ok('fillets between lines and arcs, on the side picked', () => {
  const r = 0.25, f = G.fillet(G.line([-1, 0], [3, 0]), G.line([0, -1], [0, 3]), r, [2, 0], [0, 2]);
  assert.ok(nearP(f.arc.c, [r, r]) && near(f.arc.r, r) && near(Math.abs(f.arc.sw), PI / 2), JSON.stringify(f.arc));
  assert.ok(nearP(G.start(f.e1), [r, 0]) && nearP(G.end(f.e1), [3, 0]) && nearP(G.start(f.e2), [0, r]) && nearP(G.end(f.e2), [0, 3]));
  const g = G.fillet(G.line([-1, 0], [3, 0]), G.line([0, -1], [0, 3]), r, [-0.8, 0], [0, -0.8]);
  assert.ok(nearP(g.arc.c, [-r, -r]), 'the other corner');
  // line and circle: a fillet outside a Ø2 circle sitting on a line
  const h = G.fillet(G.line([-3, 0], [3, 0]), G.circle([0, 1], 1), 0.5, [-2, 0], [-1, 1]);
  assert.ok(near(h.arc.r, 0.5) && near(G.dist(h.arc.c, [0, 1]), 1.5) && near(h.arc.c[1], 0.5), JSON.stringify(h.arc));
  assert.ok(G.nearest(G.line([-3, 0], [3, 0]), G.start(h.arc)).d < 1e-9 && near(G.dist(G.end(h.arc), [0, 1]), 1));
  assert.throws(() => G.fillet(G.line([0, 0], [1, 0]), G.line([0, 1], [1, 1]), 5, [0.5, 0], [0.5, 1]));
});
ok('chamfer and offset', () => {
  const c = G.chamfer(G.line([-1, 0], [3, 0]), G.line([0, -1], [0, 3]), 0.5, 0.25, [2, 0], [0, 2]);
  assert.ok(nearP(G.start(c.line), [0.5, 0]) && nearP(G.end(c.line), [0, 0.25]) && nearP(G.start(c.e1), [0.5, 0]));
  const o = G.offset(G.line([0, 0], [2, 0]), 0.1, [1, 1]);
  assert.ok(nearP(o.a, [0, 0.1]) && nearP(o.b, [2, 0.1]));
  assert.ok(near(G.offset(G.circle([0, 0], 1), 0.25, [0, 0]).r, 0.75) && near(G.offset(G.circle([0, 0], 1), 0.25, [5, 0]).r, 1.25));
});
ok('chains: out of order and reversed, closed, with exact areas', () => {
  const rect = [G.line([2, 1], [2, 0]), G.line([0, 0], [2, 0]), G.line([0, 1], [0, 0]), G.line([0, 1], [2, 1])];
  const ch = G.chains(rect); assert.ok(ch.length === 1 && ch[0].closed && ch[0].items.length === 4);
  assert.ok(near(Math.abs(G.chainArea(G.chainEnts(rect, ch[0]))), 2) && near(G.chainLength(G.chainEnts(rect, ch[0])), 6));
  assert.ok(near(G.chainArea([G.circle([5, 5], 1)]), PI));
  // a slot: two lines and two half circles
  const slot = [G.line([0, 0], [2, 0]), G.arc([2, 0.5], 0.5, -PI / 2, PI), G.line([2, 1], [0, 1]), G.arc([0, 0.5], 0.5, PI / 2, PI)];
  assert.ok(near(G.chainArea(slot), 2 + PI * 0.25), G.chainArea(slot));
  const open = G.chains([G.line([0, 0], [1, 0]), G.line([1, 0], [1, 1]), G.line([5, 5], [6, 6])]);
  assert.strictEqual(open.length, 2); assert.ok(!open[0].closed && open[0].items.length === 2);
});
ok('moves, turns, mirrors and scales keep arcs; a stretch makes a spline', () => {
  const a = G.arc([1, 0], 1, 0, PI / 2);
  const r = G.transform(a, G.rotate(PI / 2, [0, 0])); assert.ok(nearP(r.c, [0, 1]) && nearP(G.start(r), G.transform(G.pt(G.start(a)), G.rotate(PI / 2)).p));
  const m = G.transform(a, G.mirror([0, 0], [0, 1])); assert.ok(m.t === 'arc' && nearP(m.c, [-1, 0]) && near(m.sw, -PI / 2) && nearP(G.start(m), [-2, 0]) && nearP(G.end(m), [-1, 1]));
  const s = G.transform(a, G.scale(2, [0, 0])); assert.ok(near(s.r, 2) && nearP(s.c, [2, 0]));
  const st = G.transform(G.circle([0, 0], 1), [2, 0, 0, 1, 0, 0]); assert.ok(st.t === 'spline' && nearP(G.at(st, 0), [2, 0]) && nearP(G.at(st, 0.25), [0, 1], 1e-9));
});
ok('to and from lib/cad.js shapes: a filleted rectangle keeps its area', () => {
  const sh = { closed: true, pts: [[0, 0, 0.25], [3, 0, 0.25], [3, 2, 0.25], [0, 2, 0.25]] };
  const ents = G.fromShapes([sh]), ch = G.chains(ents);
  assert.ok(ch.length === 1 && ch[0].closed && ents.length === 8, ents.length + ' entities, ' + ch.length + ' chains');
  const A = G.chainArea(G.chainEnts(ents, ch[0]));
  assert.ok(near(Math.abs(A), 6 - 4 * 0.0625 * (1 - PI / 4)), A);
  const back = G.toShape(G.chainEnts(ents, ch[0]), true);
  assert.ok(back.closed && back.pts.length === 8 && back.pts.filter(p => p[3]).length === 4);
});
ok('the document: add, change, delete, undo and redo in steps, levels, and the project file', () => {
  const d = M.create(), seen = [];
  d.onChange(w => seen.push(w));
  const [a] = d.add([G.line([0, 0], [1, 0])]);
  d.setActive({ lv: 2, pl: 'front', z: 1.5 });
  const [b] = d.add([G.circle([0, 0], 1)]);
  assert.ok(d.get(b).lv === 2 && d.get(b).pl === 'front' && d.get(b).z === 1.5);
  d.batch('Trim', () => { d.replace([a], [G.line([0, 0], [0.5, 0]), G.line([0.6, 0], [1, 0])]); d.update(b, { col: '#ff0000' }); });
  assert.strictEqual(d.list().length, 3);
  d.undo(); assert.ok(d.list().length === 2 && d.get(a) && d.get(b).col !== '#ff0000', 'one undo takes the whole batch back');
  d.redo(); assert.ok(d.list().length === 3 && d.get(b).col === '#ff0000');
  d.setLevel(2, { name: 'Holes', vis: false });
  assert.ok(d.visible().every(e => e.lv !== 2));
  const back = M.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
  assert.deepStrictEqual(back.toJSON(), d.toJSON());
  const [c] = back.add([G.pt([1, 1])]); assert.ok(!d.get(c) || c >= d.nextId - 0, 'new ids carry on');
  assert.deepStrictEqual(M.toWorld('front', [1, 2], 3), [1, -3, 2]);
  assert.deepStrictEqual(M.fromWorld('right', M.toWorld('right', [1, 2], 3)), [1, 2, 3]);
  assert.throws(() => M.fromJSON({ foo: 1 }));
  assert.ok(seen.length >= 5);
});
const geomSame = (g, h, tol = 1e-9) => {
  if (g.t !== h.t) return false;
  if (g.t === 'arc') return nearP(G.start(g), G.start(h), tol) && nearP(G.end(g), G.end(h), tol) && nearP(G.mid(g), G.mid(h), tol) && near(g.r, h.r, tol);
  return [0, 0.3, 0.5, 1].every(t => nearP(G.at(g, t), G.at(h, t), tol));
};
const findSame = (list, e) => list.find(f => (f.pl || 'top') === (e.pl || 'top') && near(f.z || 0, e.z || 0, 1e-9) && (geomSame(f.g, e.g) || geomSame(f.g, G.reverse(e.g))));
ok('DXF out and back in: lines, arcs both ways, circles and points, on all three planes, with layers', () => {
  const ents = [
    { g: G.line([0, 0], [3, 1]), pl: 'top', z: 0, lv: 1, col: '#ff0000' },
    { g: G.arc([1, 1], 0.5, 0.2, 2), pl: 'top', z: 0.25, lv: 2, col: '#00ff00' },
    { g: G.arc([1, 1], 0.75, 1, -1.5), pl: 'top', z: 0, lv: 1 },
    { g: G.circle([-2, 1], 0.375), pl: 'top', z: -1, lv: 2 },
    { g: G.pt([4, 4]), pl: 'top', z: 0, lv: 1 },
    { g: G.arc([0.5, 0.25], 1, 0.3, 1.2), pl: 'front', z: 2, lv: 1 },
    { g: G.circle([1, 2], 0.5), pl: 'right', z: -0.5, lv: 1 },
    { g: G.line([0, 0], [1, 1]), pl: 'right', z: 3, lv: 1 },
  ];
  const txt = IO.writeDXF(ents, [{ n: 1, name: 'PART' }, { n: 2, name: 'HOLES' }]);
  const r = IO.readDXF(txt, 'in');
  assert.strictEqual(r.ents.length, ents.length, JSON.stringify(r.skipped));
  for (const e of ents) assert.ok(findSame(r.ents, e), 'came back: ' + e.g.t + ' on ' + e.pl + ' ' + JSON.stringify(e.g));
  assert.deepStrictEqual(r.levels.map(l => l.name).sort(), ['0', 'HOLES', 'PART']);
  assert.strictEqual(r.ents.find(e => e.g.t === 'line' && e.pl === 'top').col, '#ff0000');
});
ok('chains: walked back from the first piece through pieces either way round', () => {
  const c = G.chains([G.line([1, 0], [2, 0]), G.line([3, 0], [2, 0]), G.line([1, 0], [0, 0]), G.line([-1, 0], [0, 0])]);
  assert.ok(c.length === 1 && c[0].items.length === 4, JSON.stringify(c));
});
ok('DXF out: a spline goes out as a few arcs and lines, end to end, within the tolerance', () => {
  const sp = G.splineThrough([[0, 0], [1, 0.6], [2, 0.4], [3, 1.2], [4, 0.2], [5, 0.9]]);
  const r = IO.readDXF(IO.writeDXF([{ g: sp, pl: 'top', z: 0, lv: 1 }], []), 'in'), P = r.ents.map(e => e.g);
  assert.ok(P.length > 0 && P.length < 60 && P.every(g => g.t === 'arc' || g.t === 'line') && P.some(g => g.t === 'arc'), P.length + ' ' + P.map(g => g.t));
  assert.ok(G.chains(P).length === 1 && G.chains(P)[0].items.length === P.length, 'one chain');
  for (let i = 0; i <= 400; i++) { const p = G.at(sp, i / 400), d = Math.min(...P.map(g => { const q = G.nearest(g, p).p; return Math.hypot(q[0] - p[0], q[1] - p[1]); })); assert.ok(d <= 0.00021, 'off by ' + d); }
});
ok('DXF in: bulges, millimetres, ellipses, splines, mirrored circles, rotated blocks, old polylines', () => {
  const D = (...p) => p.join('\n');
  const txt = D('0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'PEG', '70', '0', '10', '0', '20', '0', '30', '0', '0', 'CIRCLE', '8', '0', '10', '25.4', '20', '0', '30', '0', '40', '2.54', '0', 'ENDBLK', '8', '0', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    // a 50.8 × 25.4 slot-ish shape: line, half circle by bulge 1, line, half circle
    '0', 'LWPOLYLINE', '8', 'A', '90', '4', '70', '1', '10', '0', '20', '0', '10', '50.8', '20', '0', '42', '1', '10', '50.8', '20', '25.4', '10', '0', '20', '25.4', '42', '1',
    '0', 'ELLIPSE', '8', 'A', '10', '0', '20', '0', '30', '0', '11', '50.8', '21', '0', '31', '0', '40', '0.5', '41', '0', '42', '6.283185307179586',
    '0', 'SPLINE', '8', 'A', '70', '8', '71', '3', '72', '8', '73', '4', '40', '0', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1', '40', '1',
    '10', '0', '20', '0', '30', '0', '10', '25.4', '20', '50.8', '30', '0', '10', '76.2', '20', '50.8', '30', '0', '10', '101.6', '20', '0', '30', '0',
    '0', 'CIRCLE', '8', 'B', '10', '25.4', '20', '0', '30', '0', '40', '12.7', '210', '0', '220', '0', '230', '-1',
    '0', 'INSERT', '8', 'B', '2', 'PEG', '10', '0', '20', '0', '30', '0', '41', '2', '42', '2', '50', '90',
    '0', 'POLYLINE', '8', 'C', '66', '1', '70', '0', '0', 'VERTEX', '8', 'C', '10', '0', '20', '0', '0', 'VERTEX', '8', 'C', '10', '25.4', '20', '25.4', '0', 'SEQEND',
    '0', 'TEXT', '8', 'C', '10', '0', '20', '0', '40', '3', '1', 'HI',
    '0', 'ENDSEC', '0', 'EOF');
  const r = IO.readDXF(txt, 'auto');
  assert.strictEqual(r.units, 'mm');
  const A = r.ents.filter(e => r.levels[e.lv - 1].name === 'A');
  const slot = A.filter(e => e.g.t !== 'spline' || e.g.deg !== 2).slice(0, 4).map(e => e.g), ch = G.chains(slot);
  assert.ok(ch.length === 1 && ch[0].closed, 'the polyline closes');
  assert.ok(near(Math.abs(G.chainArea(G.chainEnts(slot, ch[0]))), 2 + PI * 0.25, 1e-9), 'slot area ' + G.chainArea(G.chainEnts(slot, ch[0])));
  const el = A.find(e => e.g.t === 'spline' && e.g.deg === 2);
  assert.ok(el && nearP(G.at(el.g, 0), [2, 0]) && near(Math.abs(G.chainArea([el.g])), PI * 2 * 1, 1e-6), 'ellipse 2 × 1 in');
  const sp = A.find(e => e.g.t === 'spline' && e.g.deg === 3);
  assert.ok(sp && nearP(G.end(sp.g), [4, 0]) && sp.pl === 'top');
  const mir = r.ents.find(e => G.isCircle(e.g) && near(e.g.r, 0.5));
  assert.ok(mir && nearP(mir.g.c, [-1, 0]) && mir.pl === 'top' && near(mir.z, 0), 'the 230 = −1 circle is mirrored: ' + JSON.stringify(mir && mir.g));
  const peg = r.ents.find(e => e.g.t === 'arc' && near(e.g.r, 0.2));
  assert.ok(peg && nearP(peg.g.c, [0, 2]), 'block turned 90° and doubled: ' + JSON.stringify(peg && peg.g.c));
  assert.ok(r.ents.some(e => e.g.t === 'line' && nearP(G.end(e.g), [1, 1])), 'old POLYLINE');
  assert.ok(r.ents.some(e => e.g.t === 'text' && e.g.s === 'HI' && near(e.g.h, 3 / 25.4)), 'TEXT comes in as a note');
});
ok('SVG out and back in, exactly', () => {
  const ents = [{ g: G.line([0, 0], [2, 1]) }, { g: G.arc([1, 1], 0.5, 0.3, 2.2) }, { g: G.arc([1, 1], 0.6, 2, -2.5) }, { g: G.circle([3, 0], 0.25) }].map(e => Object.assign({ pl: 'top', z: 0, lv: 1 }, e));
  const r = IO.readSVG(IO.writeSVG(ents, { margin: 0 }));
  assert.strictEqual(r.ents.length, 4);
  // SVG has no origin: compare after moving both to the same corner
  const box = L => L.map(e => G.bbox(e.g)).reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1])], [Infinity, Infinity]);
  const b0 = box(ents), b1 = box(r.ents), mv = G.translate(b0[0] - b1[0], b0[1] - b1[1]);
  for (const e of ents) assert.ok(r.ents.some(f => geomSame(G.transform(f.g, mv), e.g, 1e-8) || geomSame(G.transform(f.g, mv), G.reverse(e.g), 1e-8)), 'came back: ' + JSON.stringify(e.g));
});
ok('SVG in: millimetre drawing, transforms, rounded rectangles, curves and arcs in short form', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
    <g transform="translate(10,5)"><rect x="0" y="0" width="25.4" height="12.7" rx="2.54" stroke="#f00" fill="none"/></g>
    <path d="M0,50 l25.4,0 c0,-10 10,-10 10,0 a5 5 0 011 0 z" stroke="#00f"/>
    <circle cx="50" cy="25" r="12.7" transform="scale(1)"/><text x="0" y="0">x</text></svg>`;
  const r = IO.readSVG(svg);
  const rect = r.ents.filter(e => e.col === '#ff0000').map(e => e.g), ch = G.chains(rect);
  assert.ok(ch.length === 1 && ch[0].closed && rect.length === 8, rect.length + ' parts');
  assert.ok(near(Math.abs(G.chainArea(G.chainEnts(rect, ch[0]))), 0.5 - 4 * 0.01 * (1 - PI / 4), 1e-9), 'rounded 1 × 0.5 in');
  const c = r.ents.find(e => e.g.t === 'arc' && G.isCircle(e.g));
  assert.ok(c && near(c.g.r, 0.5) && nearP(c.g.c, [50 / 25.4, 25 / 25.4]), 'circle, Y up');
  const p = r.ents.filter(e => e.col === '#0000ff');
  assert.ok(p.some(e => e.g.t === 'spline' && e.g.deg === 3) && p.some(e => e.g.t === 'arc') && nearP(G.start(p[0].g), [0, 0]), 'path ' + p.map(e => e.g.t));
  assert.strictEqual(r.skipped.text, 1);
});
ok('PDF in (pdf.js operator lists): transforms, lines, Bézier arcs made exact and joined into circles', () => {
  const OPS = { save: 10, restore: 11, transform: 12, constructPath: 91, stroke: 20, fill: 22, showText: 44 };
  // a 2 in square in points, under a move of 72 × 72, and a Ø1 circle drawn as four Béziers
  const k = 4 / 3 * Math.tan(PI / 8), c = [144, 144], r = 36, q = [];
  for (let j = 0; j < 4; j++) { const a0 = j * PI / 2, a1 = a0 + PI / 2, P0 = [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], P3 = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
    if (!j) q.push(0, P0[0], P0[1]); q.push(2, P0[0] - k * r * Math.sin(a0), P0[1] + k * r * Math.cos(a0), P3[0] + k * r * Math.sin(a1), P3[1] - k * r * Math.cos(a1), P3[0], P3[1]); }
  const list = { fnArray: [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath, OPS.showText],
    argsArray: [null, [1, 0, 0, 1, 72, 72], [OPS.stroke, [new Float32Array([0, 0, 0, 1, 144, 0, 1, 144, 144, 1, 0, 144, 4])]], null, [OPS.fill, [new Float32Array(q)]], ['hi'] ] };
  const r2 = IO.readPDFOps(list, OPS), L = r2.ents.map(e => e.g);
  const lines = L.filter(g => g.t === 'line'), circ = L.filter(g => g.t === 'arc' && G.isCircle(g));
  assert.ok(lines.length === 4 && nearP(lines[0].a, [1, 1], 1e-6) && nearP(lines[1].b, [3, 3], 1e-6), 'square moved 1 in: ' + JSON.stringify(lines.map(g => g.a)));
  assert.ok(circ.length === 1 && nearP(circ[0].c, [2, 2], 1e-5) && near(circ[0].r, 0.5, 1e-4), 'circle: ' + JSON.stringify(L.filter(g => g.t !== 'line')));
  assert.strictEqual(r2.skipped.text, 1);
});
ok('drafting: notes, and dimensions that measure and move', () => {
  const t = { t: 'text', p: [1, 1], s: 'HOLE Ø0.250', h: 0.25, a: 0 }, b = G.bbox(t);
  assert.ok(near(b[0], 1, 1e-9) && near(b[1], 1, 0.03) && near(b[3] - b[1], 0.25, 0.06) && b[2] > 3, 'text box ' + b);          // Ø dips below the line
  assert.ok(DR.strokes(t).length > 15 && DR.strokes(t).every(P => P.every(p => isFinite(p[0]) && isFinite(p[1]))));
  const h = { t: 'dim', kind: 'h', p1: [0, 0], p2: [3, 1], at: [1, -0.5], dec: 3, h: 0.125 }, v = { t: 'dim', kind: 'v', p1: [0, 0], p2: [3, 1], at: [4, 0], dec: 4 };
  assert.ok(DR.value(h) === 3 && DR.value(v) === 1 && near(DR.value({ t: 'dim', kind: 'al', p1: [0, 0], p2: [3, 4] }), 5));
  assert.strictEqual(DR.dimParts(h).texts[0].s, '3.000');
  assert.strictEqual(DR.dimParts({ t: 'dim', kind: 'dia', c: [0, 0], r: 0.125, at: [1, 1], dec: 3 }).texts[0].s, 'Ø0.250');
  assert.strictEqual(DR.dimParts({ t: 'dim', kind: 'rad', c: [0, 0], r: 0.5, at: [1, 1], dec: 2, s: '<> TYP' }).texts[0].s, 'R0.50 TYP');
  assert.strictEqual(DR.dimParts({ t: 'dim', kind: 'ang', c: [0, 0], a1: 0, a2: PI / 4, r: 1, dec: 1 }).texts[0].s, '45.0°');
  const moved = G.transform(h, G.rotate(PI / 2, [0, 0]));
  assert.ok(moved.kind === 'al' && near(DR.value(moved), G.dist([0, 0], [3, 1])), 'a turned horizontal dimension measures along its points');
  const mir = G.transform({ t: 'dim', kind: 'ang', c: [0, 0], a1: 0, a2: PI / 4, r: 1 }, G.mirror([0, 0], [0, 1]));
  assert.ok(near(DR.value(mir), 45, 1e-9), 'mirrored angle ' + DR.value(mir));
  assert.strictEqual(G.intersect(t, G.line([0, 0], [5, 5])).length, 0, 'notes take no part in intersections');
  assert.strictEqual(G.chains([t, G.line([0, 0], [1, 0])]).length, 1);
});
ok('drafting in DXF: notes as TEXT, dimensions as lines and TEXT; MTEXT and DIMENSION blocks read', () => {
  const ents = [{ g: { t: 'text', p: [1, 2], s: 'Ø0.5 THRU', h: 0.2, a: 0 }, pl: 'top', z: 0, lv: 1 }, { g: { t: 'dim', kind: 'h', p1: [0, 0], p2: [3, 0], at: [1.5, -0.6], dec: 3, h: 0.125 }, pl: 'top', z: 0, lv: 1 }];
  const r = IO.readDXF(IO.writeDXF(ents, []), 'in'), T = r.ents.filter(e => e.g.t === 'text');
  assert.ok(T.some(e => e.g.s === 'Ø0.5 THRU' && nearP(e.g.p, [1, 2], 1e-9) && near(e.g.h, 0.2)), 'note back: ' + JSON.stringify(T.map(e => e.g)));
  assert.ok(T.some(e => e.g.s === '3.000' && e.g.align === 'center'), 'dimension text');
  assert.ok(r.ents.filter(e => e.g.t === 'line').length >= 4, 'dimension lines');
  const D2 = (...q) => q.join('\n');
  const txt = D2('0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', '*D1', '10', '0', '20', '0', '0', 'LINE', '8', '0', '10', '0', '20', '-1', '11', '3', '21', '-1', '0', 'TEXT', '8', '0', '10', '1.2', '20', '-0.9', '40', '0.125', '1', '3.000', '0', 'ENDBLK', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', '0', 'DIMENSION', '8', 'DIM', '2', '*D1', '0', 'MTEXT', '8', 'NOTE', '10', '0', '20', '5', '40', '0.25', '71', '7', '1', '{\\fArial|b1;DRILL}\\PTHRU %%c0.25', '0', 'ENDSEC', '0', 'EOF');
  const q = IO.readDXF(txt, 'in'), M2 = q.ents.find(e => e.g.t === 'text' && /DRILL/.test(e.g.s));
  assert.ok(M2 && M2.g.s === 'DRILL THRU Ø0.25' && nearP(M2.g.p, [0, 5], 1e-9), 'MTEXT: ' + JSON.stringify(M2 && M2.g));
  assert.ok(q.ents.some(e => e.g.t === 'line') && q.ents.some(e => e.g.t === 'text' && e.g.s === '3.000') && !q.skipped.DIMENSION, 'DIMENSION drawn from its block');
  const svg = IO.writeSVG(ents), pdf = IO.writePDF(ents);
  assert.ok((svg.match(/<path/g) || []).length === 2 && /L/.test(svg) && / l S/.test(pdf));
});
ok('PDF out: a well-formed file at full size', () => {
  const pdf = IO.writePDF([{ g: G.line([0, 0], [4, 0]), pl: 'top' }, { g: G.circle([2, 1], 1), pl: 'top' }]);
  assert.ok(/^%PDF-1\.4/.test(pdf) && /%%EOF\n$/.test(pdf));
  const xref = +/startxref\n(\d+)/.exec(pdf)[1]; assert.ok(pdf.slice(xref).startsWith('xref'));
  const offs = pdf.slice(xref).split('\n').slice(3, 8).map(l => +l.slice(0, 10));
  offs.forEach((o, k) => assert.ok(pdf.slice(o).startsWith((k + 1) + ' 0 obj'), 'object ' + (k + 1)));
  assert.ok(/MediaBox \[0 0 360 216\]/.test(pdf), 'page 4 + 1 by 2 + 1 in: ' + /MediaBox[^\]]*\]/.exec(pdf)[0]);
});
ok('damaged numbers never hang: sweeps by modulo, flattening capped, bad entities left out', () => {
  assert.ok(near(G.sweepCCW(-PI / 2), 1.5 * PI) && near(G.sweepCCW(0), 2 * PI) && near(G.sweepCCW(2 * PI + 0.1), 0.1) && isNaN(G.sweepCCW(-Infinity)));
  assert.ok(isFinite(G.sweepCCW(-1e300)), 'a huge angle comes back at once');
  assert.ok(G.flatten(G.circle([0, 0], 1e20), 0.0002).length <= G.MAXPTS + 1 && G.flatten(G.circle([0, 0], 1), 0.0002).length > 100);
  assert.ok(G.sane(G.line([0, 0], [1, 2])) && !G.sane(G.circle([0, 0], 1e20)) && !G.sane(G.line([0, NaN], [1, 1])));
  const dxf = b => '0\nSECTION\n2\nENTITIES\n' + b + '0\nENDSEC\n0\nEOF\n';
  const r = IO.readDXF(dxf('0\nARC\n8\n0\n10\n0\n20\n0\n30\n0\n40\n1\n50\n0\n51\n-1e300\n0\nCIRCLE\n8\n0\n10\n0\n20\n0\n30\n0\n40\n1e20\n0\nARC\n8\n0\n10\n0\n20\n0\n30\n0\n40\n1\n50\n0\n51\n-90\n'), 'auto');
  assert.ok(r.ents.length === 2 && r.skipped['damaged (numbers out of range)'] === 1 && near(r.ents[1].g.sw, 1.5 * PI), JSON.stringify(r.skipped));
});
ok('chains: an open run gathered both ways, a closed loop, a circle; 20,000 lines quickly', () => {
  const L = [G.line([1, 0], [2, 0]), G.line([0, 0], [1, 0]), G.line([2, 0], [3, 0]), G.circle([5, 5], 1), G.line([0, 2], [1, 2]), G.line([1, 2], [1, 3]), G.line([1, 3], [0, 2])];
  const ch = G.chains(L);
  assert.deepStrictEqual(ch.map(c => [c.closed, c.items.map(it => it.i + (it.rev ? 'r' : ''))]), [[false, ['1', '0', '2']], [true, ['3']], [true, ['4', '5', '6']]]);
  const big = []; for (let k = 0; k < 20000; k++) big.push(G.line([k % 200, Math.floor(k / 200)], [k % 200 + 1, Math.floor(k / 200)]));
  const t0 = Date.now(), cs = G.chains(big);
  assert.ok(cs.length === 100 && cs.every(c => c.items.length === 200) && Date.now() - t0 < 1000, (Date.now() - t0) + ' ms');
});
ok('spline crossings found the same with the pruned search', () => {
  const a = G.splineThrough([[0, 0], [1, 2], [2, -1], [3, 1], [4, 0]]), b = G.splineThrough([[0, 0.5], [2, 0.4], [4, 0.6]]);
  const h = G.intersect(a, b);
  assert.ok(h.length >= 4 && h.every(x => G.nearest(a, x.p).d < 1e-7 && G.nearest(b, x.p).d < 1e-7), h.length);
});
ok('big meshes: welded edges, the closed check, sharp edges and the box tree against testing every triangle', () => {
  const b = ME.box(0, 0, 0, 2, 1, 0.5), P = ME.prep(b.pos);
  assert.ok(P.closed && P.edges.length === 12 * 6 && P.nrm.length === b.pos.length, 'a box: closed, its 12 edges');
  const open = { pos: b.pos.slice(0, b.pos.length - 9) };
  assert.ok(!ME.isClosed(open.pos) && ME.isClosed(b.pos) && !ME.prep(open.pos).closed);
  const w = ME.weld(new Float32Array([0, 0, 0, -0, 0, 0, 1, 2, 3]));
  assert.deepStrictEqual([...w.idx], [0, 0, 1], '-0 welds to 0');
  // a wavy sheet of 20,000 triangles, and 300 rays straight down and slanted
  const N = 100, pos = new Float32Array(N * N * 18); let o = 0; const z = (i, j) => Math.sin(i * 0.3) * Math.cos(j * 0.2);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (const [a, c] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) { pos[o++] = a * 0.1; pos[o++] = c * 0.1; pos[o++] = z(a, c); }
  const B = ME.bvh(pos); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const brute = (org, d) => { let best = null; for (let t = 0; t < pos.length / 9; t++) { const h = ME.raycast({ box: new Float32Array([-1e9, -1e9, -1e9, 1e9, 1e9, 1e9]), meta: new Uint32Array([0, 1]), order: new Uint32Array([t]) }, pos, null, org, d); if (h && (!best || h.t < best.t)) best = h; } return best; };
  for (let k = 0; k < 300; k++) {
    const org = [r() * 10, r() * 10, 5], d = k % 2 ? [0, 0, -1] : (v => { const l = Math.hypot(...v); return v.map(x => x / l); })([r() - 0.5, r() - 0.5, -1]);
    const a = ME.raycast(B, pos, null, org, d), c = brute(org, d);
    assert.ok((!a && !c) || (a && c && Math.abs(a.t - c.t) < 1e-9), k + ': ' + JSON.stringify([a, c]));
  }
  // indexed, as the solids come
  const ix = new Uint32Array(pos.length / 3).map((_, i) => i), Bi = ME.bvh(pos, ix), h1 = ME.raycast(Bi, pos, ix, [5.05, 5.05, 5], [0, 0, -1]), h0 = ME.raycast(B, pos, null, [5.05, 5.05, 5], [0, 0, -1]);
  assert.ok(h1 && h0 && h1.tri === h0.tri && Math.abs(h1.t - h0.t) < 1e-12);
  const t0 = Date.now(); ME.prep(pos); assert.ok(Date.now() - t0 < 2000, 'prep of 20,000 triangles ' + (Date.now() - t0) + ' ms');
});
ok('the drawing keeps a STEP text once; old files move it there; undo keeps about 250 MB at most', () => {
  const old = { mach1cad: 1, ents: [], levels: [{ n: 1, name: 'Main', vis: true }], feats: [{ id: 1, type: 'step', text: 'ISO-10303-21; big', name: 'p' }, { id: 2, type: 'hole', dia: 1 }] };
  const d = M.fromJSON(old), f = d.feats[0];
  assert.ok(!f.text && f.blob === M.blobKey('ISO-10303-21; big') && d.blobs.get(f.blob) === 'ISO-10303-21; big' && d.feats[1].dia === 1);
  d.addBlob('unused text');
  const j = d.toJSON(); assert.deepStrictEqual(Object.keys(j.blobs), [f.blob], 'only the texts in use are saved');
  assert.ok(M.fromJSON(JSON.parse(JSON.stringify(j))).blobs.get(f.blob) === 'ISO-10303-21; big', 'and read back');
  const u = M.create(), big = new Float32Array(9e6);           // 36 MB of triangles
  for (let k = 0; k < 12; k++) u.addBody({ kind: 'mesh', pos: big.slice(0, 9e6 - k) });
  assert.ok(u.undoBytes <= 250e6 && u.undoStack.length < 12 && u.undoStack.length >= 6, u.undoStack.length + ' steps, ' + u.undoBytes);
  const n0 = u.undoStack.length; u.undo(); u.redo(); assert.ok(u.undoStack.length === n0 && u.undoBytes <= 250e6);
});
ok('line styles, widths and construction: kept by the drawing, copies and replacements, and DXF', () => {
  const d = M.create(); d.active.ls = 'center'; d.active.lw = 'thick'; d.active.cons = true;
  const [a] = d.add([G.line([0, 0], [1, 0])]), e = d.get(a);
  assert.ok(e.ls === 'center' && e.lw === 'thick' && e.cons === true, 'the active style');
  const [b] = d.replace([a], [G.line([0, 0], [2, 0])]); assert.ok(d.get(b).ls === 'center' && d.get(b).cons, 'a replacement keeps it');
  d.update(b, { ls: null, cons: null }); assert.ok(!('ls' in d.get(b)) && !('cons' in d.get(b)) && d.get(b).lw === 'thick', 'null takes it away');
  d.undo(); assert.ok(d.get(b).ls === 'center', 'undo');
  d.active = { lv: 1, col: '#e8e8e8', pl: 'top', z: 0 }; const [c] = d.add([G.line([0, 1], [1, 1])]);
  assert.ok(!('ls' in d.get(c)) && !('lw' in d.get(c)) && !('cons' in d.get(c)), 'plain lines stay as they were');
  assert.deepStrictEqual(M.attrs(d.get(b)), { lv: 1, col: '#e8e8e8', pl: 'top', z: 0, ls: 'center', lw: 'thick', cons: true });
  const back = M.fromJSON(JSON.parse(JSON.stringify(d.toJSON()))); assert.ok(back.get(b).ls === 'center' && back.get(b).cons, 'project file');
  // DXF: each style goes out as a line type and comes back; a layer's line type and weight are taken by BYLAYER
  const ents = ['dash', 'center', 'hidden', 'phantom', undefined].map((ls, i) => ({ g: G.line([0, i], [1, i]), pl: 'top', z: 0, lv: 1, col: '#e8e8e8', ls }));
  const txt = IO.writeDXF(ents, [{ n: 1, name: '0' }]);
  const lines = txt.split('\r\n'); assert.strictEqual(lines.filter((v, i) => v === 'LTYPE' && lines[i - 1] === '0').length, 5, 'five line types in the table');
  const r = IO.readDXF(txt);
  assert.deepStrictEqual(r.ents.map(e => e.ls), ['dash', 'center', 'hidden', 'phantom', undefined]);
  const lay = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '0', 'LAYER', '2', 'CL', '62', '1', '6', 'ACAD_ISO04W100', '370', '70', '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', 'CL', '10', '0', '20', '0', '11', '1', '21', '0', '0', 'LINE', '8', 'CL', '6', 'CONTINUOUS', '370', '25', '10', '0', '20', '1', '11', '1', '21', '1',
    '0', 'LINE', '8', 'CL', '6', 'HIDDEN2', '370', '50', '10', '0', '20', '2', '11', '1', '21', '2', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const q = IO.readDXF(lay).ents;
  assert.ok(q[0].ls === 'center' && q[0].lw === 'thick', 'BYLAYER: ' + JSON.stringify(q[0]));
  assert.ok(q[1].ls === undefined && q[1].lw === undefined, 'its own: continuous and thin');
  assert.ok(q[2].ls === 'hidden' && q[2].lw === 'med', 'its own: hidden, medium');
  // paper: dashes and widths in SVG and PDF
  assert.ok(IO.writeSVG([{ g: G.line([0, 0], [1, 0]), pl: 'top', z: 0, col: '#e8e8e8', ls: 'dash', lw: 'thick' }]).includes('stroke-dasharray="0.125 0.0625"'));
  assert.ok(/\[9 4\.5\] 0 d/.test(IO.writePDF([{ g: G.line([0, 0], [1, 0]), pl: 'top', z: 0, col: '#e8e8e8', ls: 'dash' }])));
});

ok('endless lines: crossings, trims to rays and lines, breaks, moves, nearest and parallels', () => {
  const x = G.xline([1, 1], [Math.cos(PI / 6), Math.sin(PI / 6)]), up = G.line([3, -5], [3, 5]);
  const h = G.intersect(x, up); assert.ok(h.length === 1 && nearP(h[0].p, [3, 1 + 2 * Math.tan(PI / 6)], 1e-8), 'with a line: ' + P(h[0].p));
  assert.strictEqual(G.intersect(x, G.circle([0, 0], 2)).length, 2, 'with a circle');
  const sh = G.intersect(G.xline([2, -10], [0, 1]), G.splineThrough([[0, 3], [2, 4], [4, 3]])); assert.ok(sh.length === 1 && near(sh[0].p[1], 4, 1e-7), 'with a spline');
  assert.ok(nearP(G.intersect(x, G.xline([0, 0], [1, 0]))[0].p, [1 - 1 / Math.tan(PI / 6), 0], 1e-8), 'with another endless line');
  const ray = G.xline([0, 0], [1, 0], true);
  assert.ok(G.intersect(ray, G.line([-1, -1], [-1, 1])).length === 0 && G.intersect(ray, G.line([1, -1], [1, 1])).length === 1, 'a ray only one way');
  // trim once: a ray from the crossing, on the side kept; again: a plain line between the two crossings
  const t1 = G.trim1(x, up, [0, 0]); assert.ok(t1.t === 'xline' && t1.ray && nearP(t1.p, h[0].p, 1e-8) && t1.d[0] < 0, 'trim 1 gives a ray');
  const t2 = G.trim1(t1, G.line([-5, 0], [5, 0]), [2, 1]); assert.ok(t2.t === 'line' && nearP(t2.a, h[0].p, 1e-8) && near(t2.b[1], 0, 1e-8), 'trimming the ray gives a line');
  const d = G.divide(x, [up], [0, 0]); assert.ok(d.removed.ray && d.kept.length === 1 && d.kept[0].ray, 'divide: a ray taken out, a ray kept');
  const b = G.splitAt(x, [G.nearest(x, [3, 2]).t]); assert.ok(b.length === 2 && b.every(g => g.t === 'xline' && g.ray), 'break: two rays');
  const between = G.piece(x, G.intersect(x, up)[0].t1, G.intersect(x, G.line([-5, 0], [5, 0]), true)[0].t1);
  assert.ok(between.t === 'line', 'trim 3: the piece between two crossings is a line');
  const r = G.transform(x, G.rotate(PI / 2, [0, 0])); assert.ok(r.t === 'xline' && nearP(r.p, [-1, 1]) && nearP(r.d, [-Math.sin(PI / 6), Math.cos(PI / 6)]), 'turned');
  assert.ok(near(G.nearest(G.xline([0, 0], [1, 0]), [5, 3]).d, 3) && near(G.nearest(ray, [-5, 3]).d, Math.hypot(5, 3)), 'nearest');
  const o = G.offset(G.xline([0, 0], [1, 0]), 2, [0, 5]); assert.ok(o.t === 'xline' && nearP(o.p, [0, 2]), 'parallel');
  assert.ok(G.isWire(x) && !G.isCurve(x) && G.chains([x, up]).every(c => c.items.every(it => it.i === 1)), 'never in a chain');
  const f = G.fillet(G.xline([0, 0], [1, 0]), G.xline([0, 0], [0, 1]), 0.5, [2, 0], [0, 2]); assert.ok(f.e1.ray && f.e2.ray && near(f.arc.r, 0.5), 'a fillet makes rays');
  // DXF: XLINE and RAY come in as construction
  const dx = ['0', 'SECTION', '2', 'ENTITIES', '0', 'XLINE', '8', '0', '10', '1', '20', '2', '30', '0', '11', '0', '21', '1', '31', '0', '0', 'RAY', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const q = IO.readDXF(dx, 'in').ents; assert.ok(q.length === 2 && q[0].g.t === 'xline' && !q[0].g.ray && q[1].g.ray && q.every(e => e.cons) && nearP(q[0].g.d, [0, 1]), JSON.stringify(q));
  assert.ok(!/XLINE|LINE/.test(IO.writeDXF([{ g: x, pl: 'top', z: 0, lv: 1 }], []).split('ENTITIES')[1]), 'not written to DXF');
});

ok('duplicates: either way round, within a tolerance, matching or not, and pieces lying on others', () => {
  const L = G.line([0, 0], [2, 0]), g = [L, G.reverse(L), G.line([0.5, 0], [1.5, 0]), G.circle([5, 5], 1), G.circle([5, 5], 1), G.arc([5, 5], 1, 0, 1), G.arc([5, 5], 1, 1, -1), G.arc([5, 5], 1, 0.2, 0.3),
    G.xline([0, 1], [1, 0]), G.xline([3, 1], [-1, 0]), G.line([0, 5e-5], [2, 0]), G.splineThrough([[0, 3], [1, 4], [2, 3]]), G.reverse(G.splineThrough([[0, 3], [1, 4], [2, 3]])), G.pt([9, 9]), G.pt([9, 9])];
  const items = g.map(x => ({ g: x, grp: 'a' }));
  assert.deepStrictEqual(G.duplicates(items, { tol: 1e-4 }).remove, [1, 4, 6, 9, 10, 12, 14]);
  const o = G.duplicates(items, { tol: 1e-4, over: true }); assert.deepStrictEqual([o.remove, o.over], [[1, 2, 4, 5, 6, 7, 9, 10, 12, 14], 3]);
  assert.deepStrictEqual(G.duplicates(items.map((it, i) => ({ g: it.g, grp: i === 1 ? 'b' : 'a' })), { tol: 1e-4 }).remove, [4, 6, 9, 10, 12, 14], 'another group (colour, level) is not a duplicate');
  assert.deepStrictEqual(G.duplicates([{ g: L, grp: 'a' }, { g: G.line([0, 0], [2, 0.01]), grp: 'a' }], { tol: 1e-4 }).remove, [], 'not within the tolerance');
  // many: a grid of 10,000 lines, each twice, found in a moment
  const many = []; for (let i = 0; i < 10000; i++) { const a = G.line([i % 100, Math.floor(i / 100)], [i % 100 + 0.5, Math.floor(i / 100)]); many.push({ g: a, grp: 'a' }, { g: G.reverse(a), grp: 'a' }); }
  const t0 = Date.now(), r = G.duplicates(many, { tol: 1e-4, over: true }); assert.ok(r.remove.length === 10000 && Date.now() - t0 < 2000, r.remove.length + ' in ' + (Date.now() - t0) + ' ms');
});
ok('history: going back and forward several steps at once', () => {
  const d = M.create(); let told = 0; d.onChange(() => told++);
  for (let i = 0; i < 5; i++) d.add([G.line([i, 0], [i, 1])], null, 'Line ' + i);
  told = 0; assert.strictEqual(d.goTo(2), 3); assert.ok(d.list().length === 2 && d.redoStack.length === 3 && told === 1, 'back three, told once');
  assert.strictEqual(d.goTo(4), 2); assert.ok(d.list().length === 4 && d.undoStack[3].label === 'Line 3');
  assert.strictEqual(d.goTo(0), 4); assert.strictEqual(d.list().length, 0); assert.strictEqual(d.goTo(9), 5, 'past the end: as far as there is');
});

ok('shapes from their numbers, moved with them; grips that move ends, bend arcs and size circles', () => {
  const area = gs => { const c = G.chains(gs); assert.ok(c.length === 1 && c[0].closed, 'one closed chain'); return G.chainArea(G.chainEnts(gs, c[0])); };
  assert.ok(near(area(G.shape('rect', { c: [1, 0.5], w: 3, h: 2, r: 0.25, ang: 0 })), 6 - (1 - PI / 4) * 0.25, 1e-9), 'rectangle');
  assert.ok(near(area(G.shape('rect', { c: [0, 0], w: 3, h: 2, r: 0, ang: 0.4 })), 6, 1e-9), 'turned');
  assert.ok(near(area(G.shape('slot', { c: [0, 0], len: 3, w: 1, ang: 0.3 })), 2 + PI / 4, 1e-9), 'slot');
  assert.ok(near(area(G.shape('poly', { c: [0, 0], n: 6, R: 1, ang: 0 })), 3 * Math.sqrt(3) / 2, 1e-9), 'hexagon');
  assert.deepStrictEqual(G.shape('slot', { c: [0, 0], len: 1, w: 1 }), [], 'a slot no longer than it is wide');
  const p = { c: [1, 0.5], w: 2, h: 1, r: 0.25, ang: 0 }, m = G.rotate(PI / 2, [0, 0]), q = G.shapeMove('rect', p, m);
  const moved = G.shape('rect', p).map(g => G.transform(g, m)), again = G.shape('rect', q);
  assert.ok(moved.every(g => again.some(h => G.sameGeom(g, h, 1e-9))), 'a turned rectangle is the rectangle of its turned numbers');
  assert.ok(near(G.shapeMove('rect', p, G.scale(2, [0, 0])).w, 4) && G.shapeMove('rect', p, G.mirror([0, 0], [1, 0])) === null, 'scaled; a mirror is no longer the shape');
  // grips
  assert.deepStrictEqual(G.grips(G.line([0, 0], [2, 0])).map(q => q.k), ['a', 'b', 'mid']);
  assert.ok(nearP(G.moveGrip(G.line([0, 0], [2, 0]), 'b', [3, 1]).b, [3, 1]) && nearP(G.moveGrip(G.line([0, 0], [2, 0]), 'mid', [1, 1]).a, [0, 1]));
  const a = G.arc([0, 0], 1, 0, PI / 2), a2 = G.moveGrip(a, 'end', [-1, 0]);
  assert.ok(nearP(G.start(a2), [1, 0]) && nearP(G.end(a2), [-1, 0]) && nearP(G.mid(a2), [0, 1]) && near(a2.r, 1), 'an arc end: through the other end and the middle');
  const b = G.moveGrip(a, 'mid', [0.6, 0.6]); assert.ok(nearP(G.start(b), [1, 0]) && nearP(G.end(b), [0, 1]) && nearP(G.mid(b), [0.6, 0.6]), 'bent');
  assert.strictEqual(G.moveGrip(a, 'mid', [0.5, 0.5]), null, 'pulled straight');
  assert.ok(near(G.moveGrip(G.circle([0, 0], 1), 'q0', [3, 0]).r, 3) && nearP(G.moveGrip(G.circle([0, 0], 1), 'c', [2, 2]).c, [2, 2]), 'circle');
  assert.strictEqual(G.moveGrip(G.line([0, 0], [1, 0]), 'b', [0, 0]), null, 'a line of no length');
  const sp = G.splineThrough([[0, 0], [1, 1], [2, 0]]), sp2 = G.moveGrip(sp, 'cp0', [-1, 0]); assert.ok(nearP(G.start(sp2), [-1, 0]), 'a spline end');
  assert.deepStrictEqual(G.endGrips(G.circle([0, 0], 1)), [], 'a circle has no ends');
});

ok('shop wireframe: chain fillets and chamfers, equal pieces, stretch, bolt circles and ellipses', () => {
  const r = G.shape('rect', { c: [1.5, 1], w: 3, h: 2, r: 0, ang: 0 }), L = G.chainEnts(r, G.chains(r)[0]);
  const whole = x => { const all = x.ents.concat(x.adds.map(a => a.g)), c = G.chains(all); assert.ok(c.length === 1 && c[0].closed, 'still one closed chain'); return G.chainArea(G.chainEnts(all, c[0])); };
  const f = G.filletChain(L, true, 0.25); assert.ok(f.adds.length === 4 && !f.tight && near(Math.abs(whole(f)), 6 - (1 - PI / 4) * 0.25, 1e-9), 'fillet chain');
  const c = G.chamferChain(L, true, 0.25); assert.ok(c.adds.length === 4 && near(Math.abs(whole(c)), 6 - 4 * 0.25 * 0.25 / 2, 1e-9), 'chamfer chain');
  assert.strictEqual(G.filletChain(L, true, 2).tight, 4, 'too big a radius for every corner');
  // an L shape: one corner turns in; only it is rounded with "in"
  const Lsh = [G.line([0, 0], [3, 0]), G.line([3, 0], [3, 1]), G.line([3, 1], [1, 1]), G.line([1, 1], [1, 3]), G.line([1, 3], [0, 3]), G.line([0, 3], [0, 0])];
  assert.strictEqual(G.filletChain(Lsh, true, 0.1, 'in').adds.length, 1); assert.strictEqual(G.filletChain(Lsh, true, 0.1, 'out').adds.length, 5);
  const sp = G.splineThrough([[0, 0], [1, 1], [2, 0], [3, 1]]), pieces = G.splitAt(sp, G.equalTs(sp, 4)).map(G.length);
  assert.ok(pieces.length === 4 && pieces.every(l => near(l, G.length(sp) / 4, 1e-4)), 'equal pieces of a spline: ' + pieces);
  assert.ok(near(G.tAtLength(G.arc([0, 0], 1, 0, PI), PI / 2), 0.5), 'half way round an arc');
  const inside = p => p[0] > 1.5;
  assert.ok(nearP(G.stretch(G.line([0, 0], [2, 0]), inside, [1, 0]).b, [3, 0]) && G.stretch(G.line([0, 0], [1, 0]), inside, [1, 0]) === null, 'a line end');
  assert.ok(nearP(G.stretch(G.line([2, 0], [3, 1]), inside, [1, 1]).a, [3, 1]), 'a line wholly inside moves whole');
  const sa = G.stretch(G.arc([1, 0], 1, PI, -PI), inside, [1, 0]); assert.ok(nearP(G.start(sa), [0, 0]) && nearP(G.end(sa), [3, 0]), 'an arc end');
  const bolt = G.shape('bolt', { c: [0, 0], n: 8, D: 4, ang: 0 }); assert.ok(bolt.length === 8 && bolt.every(g => g.t === 'pt' && near(Math.hypot(...g.p), 2)), 'bolt points');
  const holes = G.shape('bolt', { c: [1, 1], n: 3, D: 2, ang: PI / 2, hd: 0.25 }); assert.ok(holes.every(g => G.isCircle(g) && near(g.r, 0.125)) && nearP(holes[0].c, [1, 2]), 'bolt holes');
  const el = G.shape('ellipse', { c: [0, 0], rx: 2, ry: 1, ang: 0 })[0]; assert.ok(nearP(G.at(el, 0), [2, 0]) && near(Math.abs(G.chainArea([el])), 2 * PI, 1e-9), 'an ellipse of area π·rx·ry');
});

ok('drafting extras: hatch lines, holes left open, ordinates, leaders, and DXF out', () => {
  const sq = G.shape('rect', { c: [0.5, 0.5], w: 1, h: 1, r: 0, ang: 0 }), H = { t: 'hatch', loops: [sq], ang: 0, sp: 0.1 };
  const hl = DR.hatchLines(H), total = hl.reduce((a, L) => a + G.dist(L[0], L[1]), 0);
  assert.ok(hl.length === 10 && near(total, 10, 1e-9), 'a 1 × 1 square at 0.1: 10 lines, as long as the area over the spacing: ' + hl.length + ' ' + total);
  const holed = DR.hatchLines({ t: 'hatch', loops: [sq, [G.circle([0.5, 0.5], 0.25)]], ang: PI / 4, sp: 0.05 });
  assert.ok(holed.length > 0 && !holed.some(L => G.dist([(L[0][0] + L[1][0]) / 2, (L[0][1] + L[1][1]) / 2], [0.5, 0.5]) < 0.24), 'no line through the hole');
  assert.strictEqual(DR.hatchLines({ t: 'hatch', loops: [sq], ang: 0, sp: 0.1, pat: 'cross' }).length, 20, 'cross hatch both ways');
  const moved = DR.transform(H, G.rotate(PI / 2, [0, 0])); assert.ok(near(moved.ang, PI / 2) && nearP(DR.bbox(moved).slice(0, 2), [-1, 0]) && near(DR.hatchLines(moved).reduce((a, L) => a + G.dist(L[0], L[1]), 0), 10, 1e-9), 'turned with its boundary');
  assert.ok(G.isAnno(H) && !G.isCurve(H) && G.intersect(H, G.line([0, 0], [1, 1])).length === 0, 'a hatch takes no part in crossings');
  const o = { t: 'dim', kind: 'ordx', o: [1, 1], p: [3.25, 2], at: [3.25, 4], dec: 3, h: 0.125 };
  assert.ok(near(DR.value(o), 2.25) && DR.dimParts(o).texts[0].s === '2.250' && near(DR.dimParts(o).texts[0].a, PI / 2), 'ordinate X, written upright');
  assert.strictEqual(DR.dimParts({ t: 'dim', kind: 'ordy', o: [0, 0], p: [5, -1.5], at: [6, -1.5], dec: 2, h: 0.1 }).texts[0].s, '-1.50', 'ordinate Y, signed');
  const ld = DR.dimParts({ t: 'dim', kind: 'lead', pts: [[0, 0], [1, 1]], s: 'DRILL THRU', h: 0.125 });
  assert.ok(ld.texts[0].s === 'DRILL THRU' && ld.lines.length === 3, 'leader: the line, its arrow, its shelf');
  const dx = IO.writeDXF([{ g: H, pl: 'top', z: 0, lv: 1, col: '#e8e8e8' }], []), L = dx.split('\r\n');
  assert.strictEqual(L.filter((v, i) => v === 'LINE' && L[i - 1] === '0').length, 10, 'a hatch goes to DXF as its lines');
});

ok('planes of the drawing\'s own: turned and moved, undone, saved, and through DXF both ways', () => {
  const P = M.planeFrom([1, 2, 3], [1, 1, 0], [0, 0, 10]);
  assert.ok(P && near(Math.hypot(...P.x), 1) && near(P.x[0] * P.y[0] + P.x[1] * P.y[1] + P.x[2] * P.y[2], 0) && near(P.n[0] * P.x[0] + P.n[1] * P.x[1] + P.n[2] * P.x[2], 0), 'square axes');
  const w = M.toWorld(P, [0.5, -2], 0.75), back = M.fromWorld(P, w);
  assert.ok(near(back[0], 0.5) && near(back[1], -2) && near(back[2], 0.75), 'there and back: ' + back);
  assert.ok(nearP(M.toWorld(P, [0, 0], 0), [1, 2]) && near(M.toWorld(P, [0, 0], 0)[2], 3), 'its origin');
  assert.strictEqual(M.planeFrom([0, 0, 0], [1, 0, 0], [2, 0, 0]), null, 'three points in a line');
  const d = M.create(); d.setPlane('c1', Object.assign({ name: 'Angle' }, P)); assert.ok(d.plane('c1').name === 'Angle' && d.plane('top').key === 'top' && d.plane('nope').key === 'top');
  d.add([G.circle([0, 0], 1)], { pl: 'c1', z: 0 });
  const j = M.fromJSON(JSON.parse(JSON.stringify(d.toJSON()))); assert.ok(j.planes.get('c1').name === 'Angle' && j.list()[0].pl === 'c1', 'saved with the drawing');
  d.undo(); d.undo(); assert.ok(!d.planes.has('c1'), 'undone'); d.redo(); assert.ok(d.planes.has('c1'));
  // DXF: a circle and an arc on a tilted plane go out in their own coordinate system and come back to the same world
  const T = M.planeFrom([0, 0, 0], [1, 0, 0], [0, 1, 1]), ents = [{ g: G.circle([1, 1], 0.5), pl: 'c1', z: 0.25, lv: 1 }, { g: G.arc([0, 0], 2, 0.2, 1.1), pl: 'c1', z: 0.25, lv: 1 }, { g: G.line([0, 0], [3, 0]), pl: 'c1', z: 0.25, lv: 1 }];
  const txt = IO.writeDXF(ents, [], { planes: { c1: T } }), r = IO.readDXF(txt, 'in');
  assert.strictEqual(r.planes.length, 1, 'one tilted plane made: ' + JSON.stringify(r.notes));
  const world = (e, Pl) => G.flatten(e.g, 0.001).filter((_, i, A) => i % Math.max(1, Math.floor(A.length / 4)) === 0).map(p => M.toWorld(Pl, p, e.z));
  // (the line lies level too, so it may come back on Top at its height: the same place)
  ents.forEach((e, i) => { const q = r.ents[i], a = world(e, T), b = world(q, r.planes.find(t => t.key === q.pl) || q.pl); assert.ok(a.every((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1], p[2] - b[k][2]) < 1e-9), 'entity ' + i + ' at the same place'); });
  assert.ok(r.ents[0].pl === r.planes[0].key && r.ents[1].pl === r.planes[0].key, 'the circle and arc on the tilted plane');
});

ok('the history is saved: in a file (the latest 100 steps, triangles kept once) and as it is for the browser', () => {
  const d = M.create(); let ids = [];
  for (let i = 0; i < 3; i++) ids = ids.concat(d.add([G.line([i, 0], [i, 1])], null, 'Line ' + i));
  d.batch('Trim', () => d.update(ids[0], { g: G.line([0, 0], [0, 0.5]) }), 'trim');
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), bid = d.addBody({ kind: 'mesh', pos, name: 'tri' });
  d.updateBody(bid, { pos: new Float32Array([5, 0, 0, 6, 0, 0, 5, 1, 0]) }, 'Move');
  d.undo();                                                       // one step undone, to redo
  const j = JSON.parse(JSON.stringify(d.toJSON())), b = M.fromJSON(j);
  assert.deepStrictEqual(b.undoStack.map(x => x.label), ['Line 0', 'Line 1', 'Line 2', 'Trim', 'Add body']);
  assert.deepStrictEqual(b.redoStack.map(x => x.label), ['Move']);
  assert.ok(b.undoStack[3].icon === 'trim' && b.undoStack.every(x => x.t > 0), 'icons and times');
  assert.strictEqual(j.history.meshes.length, 1, 'the body in the drawing by its id, the moved triangles once');
  assert.ok(b.undoStack[4].ops[0].b.pos === b.bodies.get(bid).pos, 'shared with the body, as before');
  b.redo(); assert.ok(b.bodies.get(bid).pos[0] === 5, 'redo after opening'); b.undo(); b.undo(); assert.ok(!b.bodies.has(bid));
  b.undo(); assert.ok(near(G.length(b.get(ids[0]).g), 1), 'undo the trim after opening');
  b.goTo(0); assert.strictEqual(b.list().length, 0, 'back to the start');
  // many steps: a file keeps the latest 100, the browser's copy all of them
  const m = M.create(); for (let i = 0; i < 150; i++) m.add([G.pt([i, 0])]);
  assert.strictEqual(M.fromJSON(JSON.parse(JSON.stringify(m.toJSON()))).undoStack.length, 100);
  assert.strictEqual(M.fromJSON(m.toJSON(true)).undoStack.length, 150);
  // an older file has none, and a damaged history drops only the history
  assert.strictEqual(M.fromJSON({ mach1cad: 1, ents: [] }).undoStack.length, 0);
  const bad = Object.assign(JSON.parse(JSON.stringify(m.toJSON())), { history: { undo: [{ label: 'x', ops: [{ k: 'body', before: { pos: { m: 7 } } }] }], meshes: ['@@'] } });
  assert.ok(M.fromJSON(bad).list().length === 150, 'the drawing still opens');
});

const { EDM } = require('./cad-mswin-sample.js');
ok('files compressed with Unix compress: 9, 12 and 16 bit codes, as compress itself writes them', () => {
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, L = [];
  for (let i = 0; i < 800; i++) L.push(['LINE', 'ARC', 'CIRCLE', 'POINT'][Math.floor(r() * 4)] + ' ' + i + ' ' + (r() * 100).toFixed(4) + ' ' + (r() * 100).toFixed(4) + '\n');
  const want = Buffer.from(L.join(''));
  for (const b of [9, 12, 16]) { const z = new Uint8Array(fs.readFileSync(path.join(__dirname, 'data/cad/lzw-b' + b + '.Z'))); assert.ok(IO.isCompressed(z) && Buffer.compare(Buffer.from(IO.unlzw(z)), want) === 0, b + ' bits'); }
  const dx = IO.unlzw(new Uint8Array(fs.readFileSync(path.join(__dirname, 'data/cad/rect-dxf.Z'))));
  assert.ok(IO.sniff(dx) === 'dxf' && IO.readDXF(Buffer.from(dx).toString(), 'in').ents.length === 4, 'a compressed DXF');
  assert.throws(() => IO.unlzw(new Uint8Array([0x1f, 0x9d, 0x90, 0xff, 0xff, 0xff])), /damaged/);
  assert.ok(IO.sniff(new Uint8Array(Buffer.from('AC1032xxxx'))) === 'dwg' && IO.sniff(new Uint8Array(Buffer.from('hello'))) === null && IO.sniff(EDM()) === 'mswin');
});
ok('a Mitsubishi EDM drawing: points, lines, arcs both ways, circles and exact splines, in millimetres or inches', () => {
  const r = IO.readMSWIN(EDM(), 'mm'), gs = r.ents.map(e => e.g);
  assert.deepStrictEqual(gs.map(g => g.t), ['pt', 'line', 'arc', 'arc', 'spline', 'arc'], 'the fitted arc left out');
  assert.ok(nearP(gs[0].p, [1, -1]) && near(G.length(gs[1]), 2), 'millimetres made inches');
  assert.ok(gs[2].sw > 0 && near(gs[2].r, 1) && nearP(G.end(gs[2]), [3, 1]) && gs[3].sw < 0 && near(gs[3].r, 1) && nearP(G.end(gs[3]), [2, 2]), 'arcs: anticlockwise and clockwise, ending where they say');
  assert.ok(G.isCircle(gs[5]) && nearP(gs[5].c, [1, 4]), 'a circle');
  assert.ok(gs[4].deg === 3 && gs[4].kn.length === 8 && nearP(G.start(gs[4]), [2, 2]) && nearP(G.end(gs[4]), [0, 0]), 'the curve, from its own group');
  const ch = G.chains(gs.slice(1, 5)); assert.ok(ch.length === 1 && ch[0].closed, 'the outline closes');
  assert.ok(near(r.extent, 101.6) && r.units === 'mm' && r.notes[0] === 'Read as a Mitsubishi EDM drawing: 1 line, 3 arcs and circles, 1 spline, 1 point. The splines are exact; the arcs the machine fits to them were left out.', r.notes[0]);
  assert.ok(nearP(IO.readMSWIN(EDM(), 'in').ents[0].g.p, [25.4, -25.4]), 'as inches, the numbers as they are');
  assert.throws(() => IO.readMSWIN(EDM().subarray(0, 300), 'mm'), /cut short/);
});

// the search by what you want to do, over the page's own ribbon (read from cad/app.html) and its words
ok('the search: plain words find the command', () => {
  const page = fs.readFileSync(path.join(__dirname, '../cad/app.html'), 'utf8');
  const ribbon = Function('return ' + page.match(/const RIBBON = (\{[\s\S]*?\n\});/)[1])();
  assert.deepStrictEqual(FIND.missing(ribbon), { noWords: [], notOnRibbon: [], badSteps: [] }, 'every ribbon command has words, every word list a command, and every recipe\'s steps are commands');
  assert.deepStrictEqual(FIND.tokens('I want to round the corners'), ['round', 'corner'], 'filler words dropped, plurals stemmed');
  assert.deepStrictEqual(FIND.tokens('Colour centre'), FIND.tokens('color center'), 'one spelling');
  assert.deepStrictEqual(FIND.tokens('rounded rounding'), ['round', 'round']);
  assert.deepStrictEqual(FIND.tokens('trimmed trimming curves curved'), ['trim', 'trim', 'curv', 'curv']);
  assert.ok(FIND.near('mirorr', 'mirror', 1) && FIND.near('filet', 'fillet', 1) && !FIND.near('line', 'lathe', 1), 'a typo or a swap is one');
  const idx = FIND.index(FIND.items(ribbon, () => '', () => ''));
  // the query, then what must come first (a !) or among the first three
  const want = [
    ['round the corners', 'fillet!'], ['make the corners round', 'fillet cfillet'], ["round a solid's edge", 'sfillet!'], ['drill a hole', 'shole!'],
    ['I want to put a hole in my part', 'shole!'], ['counterbore', 'shole!'], ['make it 3d', 'sextrude!'], ['pull up a shape', 'sextrude!'],
    ['spin it around an axis', 'srevolve!'], ['save as dxf', 'xdxf!'], ['turn my solid into a dxf', 'how:soliddxf! sedges'], ['add a drawing to this one', 'import!'],
    ['merge dxf', 'import!'], ['how far apart', 'dist!'], ['measure', 'dist!'], ['cut off the end', 'trim!'], ['make it longer', 'extend!'],
    ['copy around a circle', 'apolar!'], ['flip', 'mirror!'], ['move to 0,0', 'toorigin how:origin'], ['remove double lines', 'deldup!'], ['find gaps', 'chainck!'],
    ['cutter comp', 'coffset!'], ['toolpath', 'coffset!'], ['hollow it out', 'sshell!'], ['taper the walls', 'sdraft!'],
    ['subtract one solid from another', 'sbool!'], ['dashed line', 'tostyle bar:sStyle'], ['make lines thicker', 'tostyle bar:sWidth'],
    ['paste', 'key:Ctrl+V!'], ['filet', 'fillet!'], ['chamfr', 'chamfer!'], ['mirorr', 'mirror!'], ['centre mark', 'ctrmark!'], ['center mark', 'ctrmark!'],
    ['extr', 'sextrude extend'], ['make a circle', 'circle!'], ['draw an arc', 'arc!'], ['draw a hexagon', 'polygon!'], ['make a slot', 'obround!'],
    ['split a line', 'break breakn'], ['join lines', 'join!'], ['turn it 45 degrees', 'rotate!'], ['copy it 5 times', 'move arect'], ['go back', 'undo how:back'],
    ['zoom all', 'fit!'], ['bolt pattern', 'bolt!'], ['select all circles', 'selby!'], ['change the colour', 'tocolor! bar:sCol'],
    ['put it on another layer', 'chlevel!'], ['hide everything else', 'hide!'], ['cross section', 'ssection section'], ['engrave text', 'explode note'],
    ['3d print', 'xstl x3mf'], ['snap to midpoint', 'bar:snaps!'], ['isometric', 'viso!'], ['round', 'fillet!'],
    // jobs of more than one command: their recipe
    ['solid to dxf', 'how:soliddxf!'], ['clean up dxf', 'how:cleandxf deldup'], ['engrave a part number', 'how:engrave!'], ['cut a pocket', 'how:pocket sextrude'],
    ['merge two drawings', 'how:import import'], ['draw on the side of the part', 'how:side newplane'], ['mm to inch', 'scale how:mm'],
    ['go back several steps', 'how:back undo'], ['make a part from a drawing', 'how:part sextrude'], ['open edm file', 'open how:edmfile'],
  ];
  const wrong = [];
  for (const [q, w] of want) {
    const got = FIND.search(idx, q, 5).map(i => i.id);
    if (!w.split(' ').some(x => got.slice(0, x.endsWith('!') ? 1 : 3).includes(x.replace('!', '')))) wrong.push(q + ' → ' + got.join(' ') + ' (wanted ' + w + ')');
  }
  assert.deepStrictEqual(wrong, []);
  assert.strictEqual(FIND.search(idx, 'xyzzy').length, 0, 'nothing for words it does not know');
  const how = idx.map(x => x.it).find(it => it.id === 'how:soliddxf');
  assert.deepStrictEqual(how.steps.map(s => s.it && s.it.id), ['sedges', 'ssection', 'xdxf'], 'a recipe\'s steps run its commands');
  assert.ok(FIND.RECIPES.every(r => r.steps.length >= 2), 'a recipe has more than one step');
  assert.strictEqual(FIND.search(idx, '   ').length, 0);
  // fast enough to search at every key typed
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 50; i++) FIND.search(idx, 'make the corners round ' + i); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
  assert.ok(ms < 2, 'a search took ' + ms.toFixed(2) + ' ms');
});

const meshTests = (async () => {
  const b = ME.box(0, 0, 0, 2, 1, 0.5), I = ME.info(b);
  assert.ok(near(I.volume, 1, 1e-6) && near(I.area, 2 * (2 + 1 + 0.5), 1e-6) && I.closed && I.tris === 12, JSON.stringify(I));
  const s = ME.readSTL(ME.writeSTL(b, 'mm'), 'mm'); assert.ok(near(ME.info(s).volume, 1, 1e-5), 'binary STL');
  const ascii = 'solid x\n' + Array.from({ length: 12 }, (_, i) => 'facet normal 0 0 0\nouter loop\n' + [0, 1, 2].map(j => 'vertex ' + [0, 1, 2].map(k => b.pos[i * 9 + j * 3 + k] * 25.4).join(' ')).join('\n') + '\nendloop\nendfacet').join('\n') + '\nendsolid x\n';
  assert.ok(near(ME.info(ME.readSTL(Buffer.from(ascii), 'mm')).volume, 1, 1e-5), 'ASCII STL in mm');
  assert.ok(near(ME.info(ME.readSTL(Buffer.from(ascii), 'in')).volume, 25.4 ** 3, 1e-1), 'the same read as inches');
  const o = ME.readOBJ(ME.writeOBJ(b, 'mm'), 'mm'); assert.ok(near(ME.info(o).volume, 1, 1e-5) && ME.info(o).closed, 'OBJ');
  const z = ME.write3MF([b, ME.transform(b, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1])], 'mm');
  const t = await ME.read3MF(z, raw => zlib.inflateRawSync(raw));
  assert.ok(near(ME.info(t).volume, 2, 1e-5) && near(ME.info(t).max[0], 7, 1e-5), '3MF with two bodies');
  // a deflated 3MF, as other programs write it, with a component moved by a transform
  const model = `<?xml version="1.0"?><model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>
    <object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices>
    <triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="0" v2="3" v3="2"/></triangles></mesh></object>
    <object id="2" type="model"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></components></object></resources><build><item objectid="2"/></build></model>`;
  const files = { '3D/3dmodel.model': Buffer.from(model) }, parts = [], cen = []; let off = 0;
  for (const [nm, data] of Object.entries(files)) {
    const d = zlib.deflateRawSync(data), n = Buffer.from(nm), h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(ME.crc32(data), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, d); const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(ME.crc32(data), 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42); cen.push(c, n); off += 30 + n.length + d.length;
  }
  const cs = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cs.length, 12); e.writeUInt32LE(off, 16);
  const tet = await ME.read3MF(Buffer.concat([...parts, cs, e]), raw => zlib.inflateRawSync(raw));
  const TI = ME.info(tet);
  assert.ok(near(TI.volume, 1 / 6, 1e-6) && near(TI.min[0], 10, 1e-6) && TI.closed, 'deflated, inch, moved component: ' + JSON.stringify(TI));
  // a mirror keeps the triangles facing out
  assert.ok(ME.info(ME.transform(b, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).closed);
  assert.ok(near(ME.info({ pos: ME.fromB64(ME.toB64(b.pos)) }).volume, 1, 1e-6), 'base64 for project files');
  // bodies in the document: undo, and the project file keeps their triangles
  const d = M.create(), bid = d.addBody({ kind: 'mesh', pos: b.pos, name: 'box' });
  d.remove([bid]); assert.ok(!d.bodies.has(bid)); d.undo(); assert.ok(d.bodies.get(bid).pos === b.pos, 'undo shares the triangles');
  const back = M.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
  assert.ok(near(ME.info(back.bodies.get(bid)).volume, 1, 1e-6) && back.nextId > bid, 'project file');
  n++;
})().catch(e => { console.log('FAIL meshes\n  ', e.stack.split('\n').slice(0, 3).join('\n  ')); process.exitCode = 1; });
meshTests.then(() => console.log(n + ' CAD tests passed' + (process.exitCode ? ' (with failures)' : '')));
