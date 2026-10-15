// HEM toolpath tests: every operation, climb and conventional, one level and several. The G-code is read back
// with lib/gcode.js (the Mazatrol Editor's interpreter) and every point the cutter centre passes is checked
// against the finished part: never closer than the tool radius (outside profile), never past the wall (pocket,
// slot). The Mazatrol program must save and list without warnings and hold the same moves.
const assert = require('assert');
const HEM = require('../lib/hem.js'), MACH1 = require('../mach1.js'), G = require('../lib/gcode.js');
// --quick (or QUICK=1): skip the slow checks (stock coverage grids, engagement simulations, the 27" part in a block)
const QUICK = process.argv.includes('--quick') || !!process.env.QUICK;
let n = 0, skipped = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.stack.split('\n').slice(0, 3).join('\n  ')); process.exitCode = 1; } };

// distance from a point to a rounded rectangle's edge (positive outside)
function rrDist(x, y, g) {
  const sx = g.A - g.r, sy = g.B - g.r, dx = Math.max(Math.abs(x - g.cx) - sx, 0), dy = Math.max(Math.abs(y - g.cy) - sy, 0);
  if (Math.abs(x - g.cx) <= sx || Math.abs(y - g.cy) <= sy) return Math.max(Math.abs(x - g.cx) - g.A, Math.abs(y - g.cy) - g.B);
  return Math.hypot(dx, dy) - g.r;
}
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}
// every feed point of the G-code, arcs sampled, below the top of the part
function cutPoints(text) {
  const run = G.run('T.nc', text, {}), pts = [];
  for (const m of run.moves) if (m.kind !== 'rapid') for (const p of m.pts) if (p[2] < -1e-6) pts.push(p);
  return { run, pts };
}
function check(cfg, label) {
  const r = HEM.generate(cfg), K = r.K, tol = 2e-4;
  const text = HEM.toGcode(r, HEM.settingsLines(r.cfg));
  const { run, pts } = cutPoints(text);
  ok(label + ': G-code reads back (' + run.moves.length + ' moves)', () => { assert(run.moves.length > 5); assert.strictEqual(run.notes.filter(x => /error|unknown/i.test(x)).length, 0, run.notes.join('; ')); });
  ok(label + ': reaches full depth', () => { const zmin = Math.min(...pts.map(p => p[2])); assert(Math.abs(zmin + K.depth) < 1e-3, 'deepest ' + zmin); });
  const g = r.geo.part;
  if (g.t === 'rr') ok(label + ': never cuts into the part', () => {
    let worst = Infinity; for (const p of pts) worst = Math.min(worst, rrDist(p[0], p[1], g));
    assert(worst > K.R - tol, 'closest ' + worst.toFixed(5) + ' < R ' + K.R);
    if (r.cfg.finish) assert(Math.abs(worst - K.R) < 1e-3, 'finish pass should touch the wall: closest ' + worst.toFixed(5));
  });
  if (g.t === 'circle') ok(label + ': stays inside the pocket', () => {
    let far = 0; for (const p of pts) far = Math.max(far, Math.hypot(p[0] - g.cx, p[1] - g.cy));
    assert(far < g.r - K.R + tol, 'farthest ' + far.toFixed(5));
    if (r.cfg.finish) assert(Math.abs(far - (g.r - K.R)) < 1e-3);
  });
  if (g.t === 'slot') ok(label + ': stays inside the slot', () => {
    let far = 0; for (const p of pts) far = Math.max(far, segDist(p, g.p1, g.p2));
    assert(far < g.w / 2 - K.R + tol, 'farthest ' + far.toFixed(5));
  });
  ok(label + ': settings read back', () => { const s = HEM.readSettings(text); assert.deepStrictEqual(s, Object.fromEntries(Object.keys(HEM.DEFAULTS).map(k => [k, r.cfg[k]]))); });
  for (const ctl of ['MatrixM', 'SmoothM']) ok(label + ': Mazatrol ' + ctl, () => {
    const M = HEM.toMazatrol(Object.assign({}, r, { cfg: Object.assign({}, r.cfg, { mazCtl: ctl }) }), MACH1);
    assert.deepStrictEqual(M.warn.filter(w => !/2,000 records/.test(w)), []);
    const back = MACH1.open(M.bytes(), M.fileName, 'inch');
    assert.strictEqual(back.listing(), M.listing());
    const lim = MACH1.core.CONTROLS[ctl].seqLimit;
    for (const u of back.structure()) assert(u.seqs.length <= lim, 'unit with ' + u.seqs.length + ' lines');
    // same number of cutting moves (G1 with X/Y and arcs) as the G-code, give or take the unit restarts
    const arcsG = (text.match(/^G[23] /gm) || []).length, arcsM = (M.listing().match(/^\s+\d+ [23] /gm) || []).length;
    assert.strictEqual(arcsM, arcsG, 'arcs ' + arcsM + ' vs ' + arcsG);
  });
  return r;
}

const base = { op: 'profile' };
check(base, 'profile rect, passes around the part');
check({ ...base, stockType: 'rect' }, 'profile rect, rectangular block');
check({ ...base, dir: 'conv' }, 'profile conventional');
check({ ...base, apMax: '1' }, 'profile 3 levels');
check({ ...base, link: 'lift', apMax: '1.2' }, 'profile lift links');
check({ ...base, stockType: 'even', stockW: '0.3' }, 'profile even stock');
check({ ...base, shape: 'circle', partD: '3', stockX: '3.6', stockY: '3.6', cx: '1', cy: '-2' }, 'profile circle, square stock');
check({ ...base, cornerR: '0', spring: true }, 'profile sharp corners + spring');
check({ ...base, finish: false }, 'profile no finish');
check({ op: 'pocket' }, 'pocket');
check({ op: 'pocket', dir: 'conv', apMax: '0.8', cx: '2', cy: '1' }, 'pocket conventional 3 levels');
check({ op: 'slot' }, 'slot open');
check({ op: 'slot', slotEntry: 'helix', apMax: '1', x1: '0', y1: '0', x2: '3', y2: '2', dir: 'conv' }, 'slot helix, angled, conventional');

// speeds and feeds from the conversation: 3/4 5-flute in A36, 500 SFM, 0.0045 chip, 0.06 stepover
ok('A36 numbers (typed: 500 SFM, 0.0045 chip)', () => {
  const K = HEM.calc({ ...HEM.DEFAULTS, sfmR: '500', fzR: '0.0045' });
  assert.strictEqual(K.rough.rpm, 2546);
  assert(Math.abs(HEM.rctf(0.75, 0.06) - 1.842) < 0.01);
  assert(K.rough.feed > 100 && K.rough.feed < 110, 'feed ' + K.rough.feed);
  assert(K.hpNeed > 13 && K.hpNeed < 16, 'hp ' + K.hpNeed);
});
ok('flute length warning', () => { const r = HEM.generate({ loc: '2' }); assert(r.warn.some(w => /flutes are only/.test(w))); });


// ---------------------------------------------------------------- your own shapes
const Geo = require('../lib/hem-geo.js');
// feed segments at full depth, from the G-code as the control reads it
function floorSegs(text, depth) {
  const run = G.run('T.nc', text, {}), segs = [];
  for (const m of run.moves) if (m.kind !== 'rapid') {
    let P = m.pts;
    if (m.arc && m.plane === 17 && m.center) {                // the reader samples an arc with a fixed count: redo it finely
      const a = P[0], b = P[P.length - 1], c = m.center, r = Math.hypot(a[0] - c[0], a[1] - c[1]);
      const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]); let sw = Math.atan2(b[1] - c[1], b[0] - c[0]) - a0;
      if (m.cw) { while (sw >= -1e-12) sw -= 2 * Math.PI; } else { while (sw <= 1e-12) sw += 2 * Math.PI; }
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9 && Math.abs(Math.abs(sw) - 2 * Math.PI) < 1e-9) sw = 0;
      const k = Math.max(2, Math.ceil(Math.abs(sw) / 0.002));
      P = []; for (let i = 0; i <= k; i++) { const t = a0 + sw * i / k; P.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), a[2] + (b[2] - a[2]) * i / k]); }
    }
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (Math.abs(a[2] + depth) < 1e-4 && Math.abs(b[2] + depth) < 1e-4) segs.push([a, b]);
    }
  }
  return { run, segs };
}
function customCheck(cfg, label, grid) {
  const r = HEM.generate(cfg), K = r.K, text = HEM.toGcode(r);
  const { pts } = cutPoints(text), { segs } = floorSegs(text, K.depth);
  const shapes = r.cfg.shapes.map(s => ({ closed: s.closed, pts: Geo.filleted(s) }));
  ok(label + ': no warnings', () => assert.deepStrictEqual(r.warn, []));
  ok(label + ': reaches full depth', () => assert(segs.length > 10));
  let keepOut, mustCut;                    // keepOut(p): the cutter centre may not be here; mustCut(p): material to remove
  if (r.cfg.cop === 'outside') {
    const part = Geo.union(shapes.filter(s => s.closed).map(s => s.pts), false), outer = Geo.loops(part).filter(l => !l.hole).map(l => l.pts), pc = Geo.union(outer, false);
    const d = p => Geo.inside(p, pc) ? -Geo.edgeDist(p, outer) : Geo.edgeDist(p, outer);
    keepOut = p => d(p) < K.R - 2e-4;
    const st = r.geo.stock.loops, sc = Geo.union(st, false);
    const reach = Geo.offset(Geo.offset(pc, K.R + K.finStock + 0.004), -K.R);   // a tool can reach outside this
    mustCut = p => Geo.inside(p, sc) && !Geo.inside(p, reach);
  } else if (r.cfg.cop === 'pocket') {
    const reg = Geo.union(shapes.filter(s => s.closed).map(s => s.pts), true), inner = Geo.offset(reg, -K.R + 2e-4), fin = Geo.offset(Geo.offset(reg, -(K.R + K.finStock + 0.004)), K.R);
    keepOut = p => !Geo.inside(p, inner);
    mustCut = p => Geo.inside(p, fin);
  } else {
    const W2 = +r.cfg.slotW / 2, inner = shapes.map(s => Geo.buffer(s.pts, s.closed, W2 - K.R + 2e-4)), fin = shapes.map(s => Geo.offset(Geo.offset(Geo.buffer(s.pts, s.closed, W2), -(K.R + K.finStock + 0.004)), K.R));
    keepOut = p => !inner.some(b => Geo.inside(p, b));
    mustCut = p => fin.some(b => Geo.inside(p, b));
  }
  ok(label + ': never cuts past the finished wall', () => {
    const bad = pts.filter(p => keepOut(p));
    assert.strictEqual(bad.length, 0, bad.length + ' points, first at ' + (bad[0] || []).map(v => v.toFixed(4)));
  });
  if (QUICK) skipped++;
  else if (r.cfg.passes !== 'finish') ok(label + ': clears all the stock at full depth', () => {
    const bx = r.stats.box, miss = [];
    // the cut segments in grid cells a tool radius across, so each point only looks at its neighbours
    const cs = K.R, cell = new Map(), key = (i, j) => i + ',' + j;
    for (const sg of segs) {
      const [a, b] = sg, i0 = Math.floor(Math.min(a[0], b[0]) / cs), i1 = Math.floor(Math.max(a[0], b[0]) / cs), j0 = Math.floor(Math.min(a[1], b[1]) / cs), j1 = Math.floor(Math.max(a[1], b[1]) / cs);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(sg); }
    }
    for (let x = bx[0]; x <= bx[2]; x += grid) for (let y = bx[1]; y <= bx[3]; y += grid) {
      const p = [x, y]; if (!mustCut(p)) continue;
      const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
      let m = Infinity;
      for (let i = ci - 1; i <= ci + 1 && m > K.R; i++) for (let j = cj - 1; j <= cj + 1 && m > K.R; j++) for (const [a, b] of cell.get(key(i, j)) || []) { const dd = Geo.segDist(p, a, b); if (dd < m) { m = dd; if (m <= K.R) break; } }
      if (m > K.R) miss.push(p);
    }
    assert.strictEqual(miss.length, 0, miss.length + ' uncut points, first at ' + (miss[0] || []).map(v => v.toFixed(3)));
  });
  for (const ctl of ['MatrixM', 'SmoothM']) ok(label + ': Mazatrol ' + ctl, () => {
    const M = HEM.toMazatrol(Object.assign({}, r, { cfg: Object.assign({}, r.cfg, { mazCtl: ctl }) }), MACH1);
    assert.deepStrictEqual(M.warn.filter(w => !/2,000 records/.test(w)), []);
    assert.strictEqual(MACH1.open(M.bytes(), M.fileName, 'inch').listing(), M.listing());
  });
  return r;
}
const L_SHAPE = HEM.DEFAULTS.shapes;
const circle = (cx, cy, d) => ({ closed: true, pts: [[cx - d / 2, cy - d / 2, d / 2], [cx + d / 2, cy - d / 2, d / 2], [cx + d / 2, cy + d / 2, d / 2], [cx - d / 2, cy + d / 2, d / 2]] });
const cust = { op: 'custom', depth: '1', finStock: '0.012' };
customCheck({ ...cust, cop: 'outside' }, 'custom outside offset, L shape', 0.05);
customCheck({ ...cust, cop: 'outside', dir: 'conv', stockType: 'even', stockW: '0.4', apMax: '0.5' }, 'custom outside offset, conventional, even stock', 0.05);
customCheck({ ...cust, cop: 'outside', finish: false, smoothR: '0' }, 'custom outside offset, no smoothing, no finish', 0.05);
customCheck({ ...cust, cop: 'outside', strategy: 'troch' }, 'custom outside trochoidal', 0.05);
customCheck({ ...cust, cop: 'pocket', shapes: [{ closed: true, pts: [[-2.5, -1.5, 0.4], [2.5, -1.5, 0.4], [2.5, 1.5, 0.4], [-2.5, 1.5, 0.4]] }, circle(0.8, 0.2, 1)] }, 'custom pocket with an island', 0.05);
customCheck({ ...cust, cop: 'pocket', dir: 'conv', apMax: '0.6', shapes: L_SHAPE }, 'custom pocket L shape, conventional, 2 levels', 0.05);
customCheck({ ...cust, cop: 'path', slotW: '1', shapes: [{ closed: false, pts: [[-3, -1, 0], [0, -1, 0.5], [0, 1, 0.5], [3, 1, 0]] }] }, 'custom groove, open path', 0.04);
customCheck({ ...cust, cop: 'path', slotW: '1.1', slotEntry: 'helix', shapes: [circle(0, 0, 4)] }, 'custom groove, closed ring, helix', 0.04);

// arcs in shapes: [x, y, fillet, arc R ±] — a D-shaped boss, an arc-sided pocket with a round island, an S groove
const D_SHAPE = [{ closed: true, pts: [[-2, -1.5, 0.3, 0], [0.5, -1.5, 0, 1.5], [0.5, 1.5, 0, 0], [-2, 1.5, 0.3, 0]] }];
customCheck({ ...cust, cop: 'outside', shapes: D_SHAPE }, 'arc shape: outside offset', 0.05);
customCheck({ ...cust, cop: 'outside', strategy: 'troch', shapes: D_SHAPE }, 'arc shape: outside trochoidal', 0.05);
customCheck({ ...cust, cop: 'pocket', shapes: [{ closed: true, pts: [[-2.5, -1.2, 0, -4], [2.5, -1.2, 0, 1.2], [2.5, 1.2, 0, -4], [-2.5, 1.2, 0, 1.2]] }, { closed: true, pts: [[-0.4, 0, 0, 0.5], [0.6, 0, 0, 0.5]] }] }, 'arc shape: pocket with round island', 0.05);
customCheck({ ...cust, cop: 'path', slotW: '1', shapes: [{ closed: false, pts: [[-3, 0, 0, -1.5], [0, 0, 0, 1.5], [3, 0, 0, 0]] }] }, 'arc shape: S groove', 0.04);
ok('DXF arcs stay arcs', () => {
  const dxf = '0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n10\n0\n20\n0\n40\n1\n0\nARC\n10\n5\n20\n0\n40\n1\n50\n0\n51\n270\n0\nENDSEC\n0\nEOF\n';
  const d = Geo.dxfShapes(dxf, 'in');
  assert.strictEqual(d.shapes[0].pts.length, 2); assert(d.shapes[0].closed);
  assert(Math.abs(Math.abs(Geo.area(Geo.filleted(d.shapes[0]))) - Math.PI) < 1e-3);
  assert.strictEqual(d.shapes[1].pts.length, 3);                                  // 270° split in two
  assert(Math.abs(Geo.polyLen(Geo.filleted(d.shapes[1]), false) - 1.5 * Math.PI) < 1e-3);
});
ok('arc through three points', () => {
  assert.strictEqual(Geo.arcThrough([1, 0], [0, 1], [-1, 0]).r, 1);
  assert.strictEqual(Geo.arcThrough([1, 0], [0, -1], [-1, 0]).r, -1);
  assert.strictEqual(Geo.arcThrough([1, 0], [-0.8, 0.6], [0, -1]).mids.length, 1);
  assert.strictEqual(Geo.arcThrough([0, 0], [1, 0], [2, 0]), null);
});

// finish only: just the finish pass, on every operation, still never past the wall
for (const [c, l] of [[{}, 'profile'], [{ op: 'pocket' }, 'pocket'], [{ op: 'slot' }, 'slot'], [{ op: 'slot', slotEntry: 'helix', dir: 'conv' }, 'slot conventional']]) {
  const r = check({ ...c, passes: 'finish' }, 'finish only: ' + l);
  ok('finish only: ' + l + ': no roughing moves', () => { assert.strictEqual(HEM.passes(r).label, 'FINISH ONLY'); assert(!r.moves.some(m => m.t === 'SEC' && m.name === 'ROUGH')); });
}
for (const cop of ['outside', 'pocket', 'path']) {
  const r = customCheck({ ...cust, cop, passes: 'finish', shapes: cop === 'path' ? [{ closed: false, pts: [[-3, -1, 0, 0], [0, -1, 0.5, 0], [0, 1, 0, 0]] }] : L_SHAPE }, 'finish only: custom ' + cop, 0.05);
  ok('finish only: custom ' + cop + ': only the finish', () => assert.strictEqual(HEM.passes(r).label, 'FINISH ONLY'));
}
ok('rough only and old settings', () => {
  assert.strictEqual(HEM.passes(HEM.generate({ passes: 'rough' })).label, 'ROUGH ONLY');
  assert.strictEqual(HEM.passes(HEM.generate({ finish: false })).label, 'ROUGH ONLY');       // saved before passes existed
  assert.strictEqual(HEM.passes(HEM.generate({})).label, 'ROUGH + FINISH');
});

// settings saved in the G-code come back: exactly, after a control upper-cases the file, from the readable copy
// when the exact one is damaged, and from files saved the old way
{
  const keys = Object.keys(HEM.DEFAULTS);
  // points compare as [x, y, fillet, arc] numbers: [x, y, r] and [x, y, r, 0] are the same point
  const norm = (k, v) => k === 'shapes' ? (v || []).map(sh => ({ closed: !!sh.closed, pts: sh.pts.map(q => [0, 1, 2, 3].map(i => +q[i] || 0)) })) : v;
  const same = (a, b, skip) => keys.filter(k => !(skip || []).includes(k) && JSON.stringify(norm(k, a[k])) !== JSON.stringify(norm(k, b[k])));
  const cases = [{}, { op: 'pocket', passes: 'finish', pocketD: '2.5', dir: 'conv' }, { op: 'slot', slotEntry: 'helix', x2: '4', lineNums: true },
    { op: 'custom', cop: 'pocket', mazMat: 'ALY STL', fileName: 'bracket rev B', shapes: [{ closed: true, pts: [[-2, -1, 0.25, 0], [2, -1, 0, 1.5], [2, 1, 0, 0], [-2, 1, 0.1, 0]] }, { closed: true, pts: [[-0.4, 0, 0, 0.5], [0.6, 0, 0, 0.5]] }] },
    { op: 'custom', cop: 'path', slotW: '0.9', shapes: [{ closed: false, pts: [[-3, 0, 0, -1.5], [0, 0, 0, 1.5], [3, 0, 0, 0]] }] }];
  cases.forEach((c, i) => {
    const r = HEM.generate(c), text = HEM.toGcode(r, HEM.settingsLines(r.cfg));
    ok('settings ' + (i + 1) + ': every setting back exactly', () => { const o = HEM.openSettings(text); assert.strictEqual(o.from, 'data'); assert.deepStrictEqual(same(o.cfg, r.cfg), []); });
    ok('settings ' + (i + 1) + ': survive upper-casing', () => { const o = HEM.openSettings(text.toUpperCase()); assert.deepStrictEqual(same(o.cfg, r.cfg), []); });
    ok('settings ' + (i + 1) + ': readable copy when the data is damaged', () => {
      const bad = text.split('\n').map(l => l.startsWith('(CFG') ? l.slice(0, -3) + ')' : l).join('\n');
      const o = HEM.openSettings(bad); assert.strictEqual(o.from, 'text'); assert(/damaged/.test(o.note));
      assert.deepStrictEqual(same(o.cfg, r.cfg), []);
    });
    ok('settings ' + (i + 1) + ': readable copy alone, upper-cased', () => {
      const only = text.split('\n').filter(l => !/^\((CFG|HEM SETTINGS DATA)/.test(l)).join('\n').toUpperCase();
      const o = HEM.openSettings(only); assert.strictEqual(o.from, 'text');
      assert.deepStrictEqual(same(o.cfg, r.cfg, ['fileName', 'mazName', 'mazSuf', 'cool', 'wcs', 'mazMat', 'mazTool']), []);   // free text comes back upper-case
    });
    ok('settings ' + (i + 1) + ': the toolpath from the reopened settings is the same', () => assert.strictEqual(HEM.toGcode(HEM.generate(HEM.readSettings(text))), HEM.toGcode(r)));
  });
  ok('settings: files saved the old way (V1) still open', () => {
    const r = HEM.generate({ partW: '6' }), v2 = HEM.settingsLines(r.cfg).filter(l => /^\((CFG|HEM SETTINGS DATA)/.test(l));
    const v1 = v2.map(l => l.replace('(HEM SETTINGS DATA V2', '(SETTINGS DATA V1')).join('\n');
    assert.strictEqual(HEM.readSettings(v1).partW, '6');
  });
  ok('settings: none in plain G-code', () => assert.strictEqual(HEM.openSettings('G0 X1\nM30\n'), null));
}

// a long curved part (from a shop file): every loop must run into the next at depth, not lift and cross to the
// far end because the two ends are about the same length
{
  const BANANA = [{ closed: true, pts: [[-11.7703, -1.6488, 0, 0], [-13.5577, 0.1385, 0, -20.2746], [13.5577, 0.1385, 0, 0], [11.7703, -1.6488, 0, 17.7509]] }];
  if (!QUICK) for (const passes of ['rough', 'both']) {
    const r = customCheck({ op: 'custom', cop: 'outside', stockType: 'even', stockW: '0.5', smoothR: '0.2', depth: '2.375', passes, shapes: BANANA }, 'long curved part, ' + passes, 0.08);
    ok('long curved part, ' + passes + ': no lifts between loops', () => {
      const g = HEM.toGcode(r), downs = g.split('\n').filter(l => /^G1 Z-/.test(l)).length;
      assert.strictEqual(downs, passes === 'both' ? 2 : 1, downs + ' times down to depth');     // once to rough, once to finish
    });
  }
}

// pockets: peeling (the default) and trochoidal; the material-removal simulation measures the cutter's contact
{
  const { simulate } = require('./engagement.js');
  const circleS = (cx, cy, d) => ({ closed: true, pts: [[cx - d / 2, cy, 0, d / 2], [cx + d / 2, cy, 0, d / 2]] });
  const ISLAND = [{ closed: true, pts: [[-2.5, -1.5, 0.4, 0], [2.5, -1.5, 0.4, 0], [2.5, 1.5, 0.4, 0], [-2.5, 1.5, 0.4, 0]] }, circleS(0.8, 0.2, 1)];
  customCheck({ ...cust, cop: 'pocket', pocketStrategy: 'troch', shapes: ISLAND }, 'trochoidal pocket with an island', 0.05);
  customCheck({ ...cust, cop: 'pocket', pocketStrategy: 'offset', shapes: ISLAND }, 'offset-loop pocket with an island', 0.05);
  for (const [label, shapes] of [['L', L_SHAPE], ['island', ISLAND]]) {
    const peel = HEM.generate({ ...cust, cop: 'pocket', pocketStrategy: 'offset', shapes }), troch = HEM.generate({ ...cust, cop: 'pocket', pocketStrategy: 'troch', shapes }), auto = HEM.generate({ ...cust, cop: 'pocket', shapes });
    const reg = Geo.union(shapes.map(s => Geo.filleted(s)), true);
    if (QUICK) { skipped++; ok('pocket ' + label + ': auto takes the faster way', () => assert(Math.abs(auto.stats.minutes - Math.min(peel.stats.minutes, troch.stats.minutes)) < 1e-9)); continue; }
    const sim = simulate(peel, { material: p => Geo.inside(p, reg) });
    ok('peeled pocket ' + label + ': never slots, contact under 120°', () => {
      assert(!(sim.hist['>150'] > 0), 'slotting for ' + sim.hist['>150'] + ' in');
      assert(!sim.worst.length || sim.worst[0].w < 120, 'peak ' + (sim.worst[0] || {}).w);
      assert((sim.hist['100-150'] || 0) / sim.len < 0.005);
    });
    ok('pocket ' + label + ': auto takes the faster way', () => assert(Math.abs(auto.stats.minutes - Math.min(peel.stats.minutes, troch.stats.minutes)) < 1e-9, auto.stats.minutes + ' vs ' + peel.stats.minutes + ' / ' + troch.stats.minutes));
  }
}

// open profiles: the path is the wall, stock on one side; passes never cross the wall and clear the whole band
function openCheck(cfg, label) {
  const r = HEM.generate({ op: 'custom', cop: 'open', depth: '1', ...cfg }), K = r.K, text = HEM.toGcode(r);
  const P = Geo.filleted(r.cfg.shapes[0]), side = r.cfg.openSide === 'right' ? -1 : 1, Wst = +r.cfg.openStock;
  const cum = Geo.cumLen(P, false), L = cum[cum.length - 1];
  // signed distance from the wall (+ on the stock side) and whether the nearest point is inside the path's length
  const near = q => { let best = Infinity, bi = 0, bt = 0; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2)) : 0, d = Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy); if (d < best) { best = d; bi = i; bt = t; } }
    const a = P[bi], b = P[bi + 1], cr = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]), s = cum[bi] + bt * (cum[bi + 1] - cum[bi]);
    return { d: Math.sign(cr) === side ? best : -best, inside: s > 1e-6 && s < L - 1e-6 }; };
  ok(label + ': no warnings', () => assert.deepStrictEqual(r.warn, []));
  const { pts } = cutPoints(text), { segs } = floorSegs(text, K.depth);
  ok(label + ': never past the wall', () => { const bad = pts.filter(q => { const n = near(q); return n.d < K.R - 2e-4; }); assert.strictEqual(bad.length, 0, bad.length + ' points, first ' + (bad[0] || []).map(v => v.toFixed(4))); });
  if (r.cfg.passes !== 'finish' && !QUICK) ok(label + ': clears the stock band', () => {
    const bx = r.stats.box, miss = [];
    for (let x = bx[0]; x <= bx[2]; x += 0.04) for (let y = bx[1]; y <= bx[3]; y += 0.04) {
      const n = near([x, y]); if (!n.inside || n.d > Wst || n.d < K.finStock + 0.004) continue;
      let m = Infinity; for (const [a, b] of segs) { m = Math.min(m, Geo.segDist([x, y], a, b)); if (m <= K.R) break; }
      if (m > K.R) miss.push([x, y]);
    }
    assert.strictEqual(miss.length, 0, miss.length + ' uncut, first ' + (miss[0] || []).map(v => v.toFixed(3)));
  });
  for (const ctl of ['MatrixM', 'SmoothM']) ok(label + ': Mazatrol ' + ctl, () => { const M = HEM.toMazatrol(Object.assign({}, r, { cfg: Object.assign({}, r.cfg, { mazCtl: ctl }) }), MACH1); assert.deepStrictEqual(M.warn, []); });
  return r;
}
const OPEN_L = [{ closed: false, pts: [[-3, 0, 0, 0], [0, 0, 0.5, 0], [0, 2, 0, 0]] }];
const OPEN_ARC = [{ closed: false, pts: [[-3, -1, 0, -2.5], [0, 0.5, 0, 2.5], [3, -1, 0, 0]] }];
openCheck({ shapes: OPEN_L }, 'open profile L, stock left, one way');
openCheck({ shapes: OPEN_L, openSide: 'right', openDir: 'zigzag' }, 'open profile L, stock right, zigzag');
openCheck({ shapes: OPEN_ARC, dir: 'conv', apMax: '0.5' }, 'open profile arcs, conventional, 2 levels');
openCheck({ shapes: OPEN_ARC, openSide: 'right', passes: 'finish', spring: true }, 'open profile arcs, finish only + spring');
ok('open profile: climb keeps the wall on the right', () => {
  const r = HEM.generate({ op: 'custom', cop: 'open', depth: '1', shapes: [{ closed: false, pts: [[0, 0, 0, 0], [4, 0, 0, 0]] }] });
  const cutsX = r.moves.filter(m => m.k === 'rough' && m.t === 'G1');
  assert(cutsX.every(m => m.y > 0), 'passes are above the wall');                // stock on the left of +X = above
  assert(r.moves.filter(m => m.k === 'rough').every((m, i, A) => i === 0 || m.x >= A[i - 1].x - 1e-9 || m.y !== A[i - 1].y), 'each pass runs +X');
});

// outside profile of a long curved part inside a rectangular block: every strategy clears the block without
// gouging, never slots, and does not lift and plunge between every piece
{
  const { simulate } = require('./engagement.js');
  const BANANA_S = [{ closed: true, pts: [[-11.7703, -1.6488, 0, 0], [-13.5577, 0.1385, 0, -20.2746], [13.5577, 0.1385, 0, 0], [11.7703, -1.6488, 0, 17.7509]] }];
  if (!QUICK) for (const [strategy, pieceDir, maxDowns] of [['offset', 'zigzag', 20], ['offset', 'oneway', 400], ['troch', 'zigzag', 20]]) {
    const label = 'block around a curved part, ' + strategy + ' ' + pieceDir;
    const r = customCheck({ op: 'custom', cop: 'outside', strategy, pieceDir, stockType: 'rect', stockM: '0.5', depth: '1', passes: 'rough', shapes: BANANA_S }, label, 0.1);
    ok(label + ': comes down at most ' + maxDowns + ' times', () => { const n = HEM.toGcode(r).split('\n').filter(l => /^G1 Z-/.test(l)).length; assert(n <= maxDowns, n + ' times'); });
    const part = Geo.union([Geo.filleted(BANANA_S[0])], false), stock = Geo.union(r.geo.stock.loops, false);
    const sim = simulate(r, { material: p => Geo.inside(p, stock) && !Geo.inside(p, part), res: 0.02 });
    ok(label + ': never slots', () => assert(!((sim.hist['>150'] || 0) + (sim.hist['100-150'] || 0) > 0.05), JSON.stringify(sim.hist)));
  }
}

// entry point: every loop starts at its point nearest the chosen entry, still in the clear and never past the wall
{
  const leadsNear = (r, e, tol) => {
    // the start of every lead-in arc (the move before an 'entry' arc that follows a non-entry move)
    const starts = []; let prev = null;
    for (const m of r.moves) { if (m.x === undefined) continue; if (m.k === 'entry' && prev && prev.k !== 'entry' && (m.t === 'G2' || m.t === 'G3') && Math.abs(m.z - prev.z) < 1e-9) starts.push([prev.x, prev.y]); prev = m; }
    return starts.length && starts.every(p => Math.hypot(p[0] - e[0], p[1] - e[1]) < tol);
  };
  for (const [c, e, label] of [[{ stockType: 'even' }, [0, -5], 'below'], [{ stockType: 'rect' }, [-5, 5], 'top-left, block'], [{ shape: 'circle', partD: '3', stockW: '0.4' }, [-3, 1], 'circle'], [{ dir: 'conv' }, [1, 3], 'conventional']]) {
    const r = check({ op: 'profile', entryOn: true, entryX: String(e[0]), entryY: String(e[1]), ...c }, 'entry ' + label);
    ok('entry ' + label + ': the loops start by it', () => assert(leadsNear(r, e, Math.hypot(e[0], e[1]) + 0.5) && r.warn.length === 0, r.warn.join(' ')));
  }
  customCheck({ ...cust, cop: 'outside', entryOn: true, entryX: '-3', entryY: '2' }, 'entry your shape, outside offset', 0.05);
  customCheck({ ...cust, cop: 'outside', strategy: 'troch', entryOn: true, entryX: '-3', entryY: '2' }, 'entry your shape, outside trochoidal', 0.05);
  customCheck({ ...cust, cop: 'pocket', entryOn: true, entryX: '-2', entryY: '1.5' }, 'entry your shape, pocket', 0.05);
  ok('entry your shape: outside loops start by it', () => {
    const r = HEM.generate({ ...cust, cop: 'outside', entryOn: true, entryX: '-3', entryY: '2' });
    const lead = r.moves.filter((m, i) => m.k === 'entry' && r.moves[i - 1] && r.moves[i - 1].k !== 'entry').map((m, i, A) => m);
    assert(lead.length > 3 && lead.every(m => Math.hypot(m.x + 3, m.y - 2) < 1.6), lead.map(m => m.x.toFixed(2) + ',' + m.y.toFixed(2)).join(' '));
  });
  ok('entry: saved and reopened', () => { const r = HEM.generate({ entryOn: true, entryX: '1', entryY: '2' }); const o = HEM.readSettings(HEM.toGcode(r, HEM.settingsLines(r.cfg))); assert(o.entryOn === true && o.entryX === '1' && o.entryY === '2'); });
}

// pockets with open edges: the area between the walls and an island, open along the edges marked open
{
  const { simulate } = require('./engagement.js');
  const OPEN_U = [{ closed: true, pts: [[-2, -1.5, 0, 0, 1], [2, -1.5, 0, 0, 0], [2, 1.5, 0.3, 0, 0], [-2, 1.5, 0.3, 0, 0]] }, { closed: true, pts: [[-0.5, 0.2, 0, 0.5], [0.5, 0.2, 0, 0.5]] }];
  const OPEN_2 = [{ closed: true, pts: [[0, 0, 0, 0, 1], [5, 0, 0, 0, 1], [5, 2, 0, 0, 0], [0, 2, 0, 0, 0]] }];      // open along the bottom and the right
  const cases = [[OPEN_U, {}, 'U with island, zigzag'], [OPEN_U, { pieceDir: 'oneway', dir: 'conv' }, 'U with island, one way, conventional'], [OPEN_2, { apMax: '0.5' }, 'open two sides, 2 levels'], [OPEN_U, { passes: 'finish' }, 'U finish only']];
  for (const [shapes, extra, label] of cases) {
    const r = HEM.generate({ op: 'custom', cop: 'pocket', depth: '1', finStock: '0.012', shapes, ...extra }), K = r.K, text = HEM.toGcode(r);
    // the region, and the air past the open edges, built the same way as a check
    const region = Geo.union(shapes.map(sh => Geo.filleted(sh)), true), bands = [];
    shapes.forEach(sh => { const ccw = Geo.area(Geo.filleted(sh)) > 0; Geo.edgeRuns(sh).open.forEach(o => { const far = Geo.sideOffset(o, 2 * K.R + 0.2, ccw ? -1 : 1); bands.push(o.concat(far.slice().reverse())); }); });
    const whole = Geo.bool('union', region, Geo.union(bands, false)), inWhole = Geo.offset(whole, -K.R + 2e-4);
    ok('open pocket ' + label + ': no warnings', () => assert.deepStrictEqual(r.warn, []));
    const { pts } = cutPoints(text);
    ok('open pocket ' + label + ': never past a wall or into the island', () => { const bad = pts.filter(p => !Geo.inside(p, inWhole)); assert.strictEqual(bad.length, 0, bad.length + ' points, first ' + (bad[0] || []).map(v => v.toFixed(4))); });
    ok('open pocket ' + label + ': no helix', () => assert(!r.moves.some(m => m.k === 'entry' && (m.t === 'G2' || m.t === 'G3') && r.moves[r.moves.indexOf(m) - 1] && Math.abs(r.moves[r.moves.indexOf(m) - 1].z - m.z) > 1e-9)));
    if (r.cfg.passes !== 'finish' && !QUICK) {
      const { segs } = floorSegs(text, K.depth), reach = Geo.bool('and', Geo.offset(Geo.offset(whole, -(K.R + K.finStock + 0.004)), K.R), region);
      ok('open pocket ' + label + ': clears the area', () => {
        const bx = r.stats.box, miss = [];
        for (let x = bx[0]; x <= bx[2]; x += 0.05) for (let y = bx[1]; y <= bx[3]; y += 0.05) { if (!Geo.inside([x, y], reach)) continue; let m = Infinity; for (const [a, b] of segs) { m = Math.min(m, Geo.segDist([x, y], a, b)); if (m <= K.R) break; } if (m > K.R) miss.push([x, y]); }
        assert.strictEqual(miss.length, 0, miss.length + ' uncut, first ' + (miss[0] || []).map(v => v.toFixed(3)));
      });
      const sim = simulate(r, { material: p => Geo.inside(p, region), res: 0.015 });
      ok('open pocket ' + label + ': never slots', () => assert(!(sim.hist['>150'] > 0.02), JSON.stringify(sim.hist)));
    }
    for (const ctl of ['MatrixM', 'SmoothM']) ok('open pocket ' + label + ': Mazatrol ' + ctl, () => assert.deepStrictEqual(HEM.toMazatrol(Object.assign({}, r, { cfg: Object.assign({}, r.cfg, { mazCtl: ctl }) }), MACH1).warn, []));
  }
  ok('open edges: saved and reopened, exact and readable', () => {
    const r = HEM.generate({ op: 'custom', cop: 'pocket', shapes: OPEN_U }), t = HEM.toGcode(r, HEM.settingsLines(r.cfg));
    assert.strictEqual(+HEM.readSettings(t).shapes[0].pts[0][4], 1);
    const only = t.split('\n').filter(l => !/^\((CFG|HEM SETTINGS DATA)/.test(l)).join('\n');
    const o = HEM.openSettings(only); assert.strictEqual(o.from, 'text'); assert.strictEqual(+o.cfg.shapes[0].pts[0][4], 1); assert(!o.cfg.shapes[0].pts[1][4]);
  });
}

// changing shapes: move, rotate, scale and mirror keep the curve (arcs and fillets), a new work zero moves nothing
// relative to the part
{
  const D = [{ closed: true, pts: [[-2, -1.5, 0.3, 0], [0.5, -1.5, 0, 1.5], [0.5, 1.5, 0, 0], [-2, 1.5, 0.3, 0, 1]] }];
  const area = sh => Math.abs(Geo.area(Geo.filleted(sh[0])));
  // a shape and its transform must match point for point along the drawn outline (sampled)
  const sameOutline = (a, b, f) => { const A = Geo.filleted(a[0]).map(f), Bp = Geo.filleted(b[0]); return A.every(p => Bp.some((q, i) => Geo.segDist(p, q, Bp[(i + 1) % Bp.length]) < 1e-4)); };
  ok('shapes: move keeps the outline', () => assert(sameOutline(D, Geo.moveShapes(D, 3, -1), p => [p[0] + 3, p[1] - 1])));
  ok('shapes: rotate keeps the outline', () => { const a = 0.6, co = Math.cos(a), si = Math.sin(a); assert(sameOutline(D, Geo.rotateShapes(D, a * 180 / Math.PI, [1, 1]), p => [1 + (p[0] - 1) * co - (p[1] - 1) * si, 1 + (p[0] - 1) * si + (p[1] - 1) * co])); });
  ok('shapes: scale keeps the outline', () => assert(sameOutline(D, Geo.scaleShapes(D, 1.7, [0.5, 0]), p => [0.5 + (p[0] - 0.5) * 1.7, p[1] * 1.7])));
  ok('shapes: mirror keeps the outline (arcs turn the other way)', () => { assert(sameOutline(D, Geo.mirrorShapes(D, 'x', [1, 0]), p => [2 - p[0], p[1]])); assert(sameOutline(D, Geo.mirrorShapes(D, 'y', [0, 2]), p => [p[0], 4 - p[1]])); });
  ok('shapes: area and open edges kept', () => { assert(Math.abs(area(Geo.scaleShapes(D, 2, [0, 0])) - 4 * area(D)) < 1e-3); assert.strictEqual(Geo.rotateShapes(D, 30, [0, 0])[0].pts[3][4], 1); });
  ok('new work zero: the toolpath moves with the part', () => {
    const cfg = { op: 'custom', cop: 'outside', depth: '1', shapes: D, entryOn: true, entryX: '-3', entryY: '1' };
    const a = HEM.generate(cfg), b = HEM.generate(HEM.moveOrigin(cfg, -2, -1.5));
    const pa = a.moves.filter(m => m.x !== undefined && !isNaN(m.x)), pb = b.moves.filter(m => m.x !== undefined && !isNaN(m.x));
    assert.strictEqual(pa.length, pb.length);
    pa.forEach((m, i) => { assert(Math.abs(m.x - (pb[i].x - 2)) < 2e-4 && Math.abs(m.y - (pb[i].y - 1.5)) < 2e-4, 'move ' + i); });
  });
}

// shapes as text: out and back in unchanged; a spreadsheet paste (tabs, a header row) reads; bad lines are named
{
  const SH = [{ closed: true, pts: [[-2, -1.5, 0.3, 0], [0.5, -1.5, 0, 1.5], [0.5, 1.5, 0, 0, 1], [-2, 1.5, 0.3, 0]] }, { closed: false, pts: [[0, 0, 0, -0.5], [1, 0, 0, 0]] }, { closed: true, pts: [[3, 0, 0, 0.25], [3.5, 0, 0, 0.25]] }];
  const norm = shs => shs.map(sh => ({ closed: !!sh.closed, pts: sh.pts.map(q => [0, 1, 2, 3, 4].map(i => +q[i] || 0)) }));
  ok('shapes as text: out and back', () => { const r = Geo.shapesFromText(Geo.shapesToText(SH)); assert.deepStrictEqual(r.errors, []); assert.deepStrictEqual(norm(r.shapes), norm(SH)); });
  ok('shapes as text: a spreadsheet paste', () => {
    const r = Geo.shapesFromText('X\tY\tFillet\tArc\tOpen\n0\t0\n4\t0\t0.25\n4\t2\t\t\t1\n0\t2\n');
    assert.strictEqual(r.shapes.length, 1); assert(r.shapes[0].closed); assert.strictEqual(r.shapes[0].pts.length, 4);
    assert.deepStrictEqual(r.shapes[0].pts[1], [4, 0, 0.25, 0]); assert.strictEqual(r.shapes[0].pts[2][4], 1);
  });
  ok('shapes as text: spaces, semicolons, blank lines split shapes', () => { const r = Geo.shapesFromText('0 0\n1 0\n1 1\n\n5;5\n6;5\n6;6\n', true); assert.strictEqual(r.shapes.length, 2); });
  ok('shapes as text: two points are a path unless an arc makes them a circle', () => { assert(!Geo.shapesFromText('0,0\n1,0').shapes[0].closed); assert(Geo.shapesFromText('0,0,0,0.5\n1,0,0,0.5').shapes[0].closed); });
  ok('shapes as text: bad lines are named', () => { const r = Geo.shapesFromText('0,0\n1,abc\n2,2\n'); assert.deepStrictEqual(r.errors.map(e => e.line), [2]); });
}

// CAD-only shapes and construction geometry: kept and saved, never machined
{
  const L = HEM.DEFAULTS.shapes, extra = { closed: true, cut: false, pts: [[3, 3, 0, 0], [4, 3, 0, 0], [4, 4, 0, 0]] };
  const CONS = [{ t: 'point', x: 1, y: 2 }, { t: 'line', x: 0, y: 0, a: 30 }, { t: 'line2', x1: -1, y1: -1, x2: 2, y2: 0.5 }, { t: 'circle', x: 0.5, y: 0.5, d: 1.25 }];
  for (const cop of ['outside', 'pocket', 'path']) ok('CAD-only shape leaves the ' + cop + ' toolpath alone', () => {
    const a = HEM.toGcode(HEM.generate({ op: 'custom', cop, depth: '1', shapes: L })), b = HEM.toGcode(HEM.generate({ op: 'custom', cop, depth: '1', shapes: L.concat([extra]), cons: CONS }));
    const body = t => t.split('\n').filter(l => !/^\(/.test(l)).join('\n');
    assert.strictEqual(body(b), body(a));
  });
  ok('every shape CAD only: says so', () => assert(HEM.generate({ op: 'custom', cop: 'outside', shapes: [{ ...L[0], cut: false }] }).warn.some(w => /CAD only/.test(w))));
  ok('CAD-only and construction geometry: saved and reopened (exact and readable)', () => {
    const r = HEM.generate({ op: 'custom', shapes: L.concat([extra]), cons: CONS }), t = HEM.toGcode(r, HEM.settingsLines(r.cfg));
    const o = HEM.readSettings(t); assert.strictEqual(o.shapes[1].cut, false); assert.deepStrictEqual(o.cons, CONS);
    const only = t.split('\n').filter(l => !/^\((CFG|HEM SETTINGS DATA)/.test(l)).join('\n').toUpperCase(), q = HEM.openSettings(only);
    assert.strictEqual(q.from, 'text'); assert.strictEqual(q.cfg.shapes[1].cut, false); assert.deepStrictEqual(q.cfg.cons, CONS);
  });
  ok('CAD only in the points text', () => { const r = Geo.shapesFromText(Geo.shapesToText([extra])); assert.strictEqual(r.shapes[0].cut, false); });
  ok('new work zero moves construction geometry too', () => { const c = HEM.moveOrigin({ cons: CONS }, 1, 1); assert.deepStrictEqual(c.cons.map(g => [g.x ?? g.x1, g.y ?? g.y1]), [[0, 1], [-1, -1], [-2, -2], [-0.5, -0.5]]); assert.strictEqual(c.cons[1].a, 30); });
  ok('construction crossings', () => { const X = Geo.consCrossings([{ t: 'line', x: 0, y: 0, a: 0 }, { t: 'line', x: 1, y: 0, a: 90 }, { t: 'circle', x: 0, y: 0, d: 2 }]); assert(X.some(p => Math.hypot(p[0] - 1, p[1]) < 1e-9) && X.some(p => Math.hypot(p[0] + 1, p[1]) < 1e-9)); });
}

// dimensions: every point, segment, fillet and shape, and construction crossings; the CSV; measure
{
  const CAD = require('../lib/cad.js');
  const D = [{ closed: true, pts: [[0, 0, 0, 0], [4, 0, 0.5, 0], [4, 2, 0, 1.5], [0, 2, 0.25, 0]] }, { closed: false, cut: false, pts: [[5, 0, 0, 0], [7, 2, 0, 0]] }];
  const d = CAD.dimensions(D, [{ t: 'line', x: 0, y: 0, a: 45 }, { t: 'circle', x: 0, y: 0, d: 2 }]);
  const near = (a, b) => Math.abs(a - b) < 1e-4;
  ok('dimensions: points', () => { assert.strictEqual(d.points.length, 6); assert(d.points[5].x === 7 && d.points[5].y === 2 && d.points[5].cut === false); });
  ok('dimensions: segments', () => {
    assert(near(d.segments[0].length, 4) && near(d.segments[0].angle, 0) && near(d.segments[1].angle, 90));
    const arc = d.segments[2]; assert(arc.kind === 'arc' && near(arc.r, 2) && arc.asked === 1.5 && arc.dir === 'CCW' && near(arc.sweep, 180) && near(arc.cx, 2) && near(arc.cy, 2));
    assert(near(d.segments[4].length, Math.hypot(2, 2)) && near(d.segments[4].angle, 45));
  });
  ok('dimensions: fillet (only between straight segments)', () => { assert.strictEqual(d.fillets.length, 1); const f = d.fillets[0]; assert(f.n === 2 && near(f.cx, 3.5) && near(f.cy, 0.5) && near(f.x1, 3.5) && near(f.y1, 0) && near(f.x2, 4) && near(f.y2, 0.5)); });
  ok('dimensions: shape size, perimeter and area', () => { const q = d.shapes[0]; assert(near(q.width, 4) && near(q.height, 4) && Math.abs(q.area - (8 - 0.25 * (1 - Math.PI / 4) + 2 * Math.PI)) < 2e-3); assert.strictEqual(d.shapes[1].area, null); });
  ok('dimensions: construction crossings', () => { assert.strictEqual(d.crossings.length, 2); assert(d.crossings.some(p => near(p[0], Math.SQRT1_2) && near(p[1], Math.SQRT1_2))); });
  ok('dimensions: CSV', () => { const t = CAD.dimensionsCSV(d); assert(/^Points\n/.test(t) && /\nSegments\n/.test(t) && /\nFillets\n/.test(t) && /\nConstruction crossings\n/.test(t) && /CAD only/.test(t)); });
  ok('measure', () => { const m = CAD.measure([1, 1], [4, 5]); assert(near(m.d, 5) && near(m.dx, 3) && near(m.dy, 4) && near(m.angle, 53.1301)); });
}

// feeds lowered where the cutter wraps more of the cut (engagement simulated along the toolpath)
{
  const paths = r => r.moves.filter(m => m.x !== undefined && !isNaN(m.x)).map(m => [m.t, +m.x.toFixed(5), +m.y.toFixed(5), +m.z.toFixed(5)]);
  ok('slow-down: a steady profile is left alone', () => { const a = HEM.generate({ slowDown: false }), b = HEM.generate({}); assert.strictEqual(HEM.toGcode(b), HEM.toGcode(a)); });
  ok('slow-down: trochoidal slot corners slowed, path unchanged', () => {
    const a = HEM.generate({ op: 'slot', slowDown: false }), b = HEM.generate({ op: 'slot' });
    assert.deepStrictEqual(paths(b), paths(a));
    const slow = b.moves.filter(m => m.slowed); assert(slow.length > 5);
    slow.forEach(m => { const i = b.moves.indexOf(m); assert(m.f < a.moves[i].f && m.f >= 0.3 * a.moves[i].f - 0.1, 'feed ' + m.f + ' vs ' + a.moves[i].f); });
    assert(b.moves.filter((m, i) => !m.slowed && m.f !== a.moves[i].f).length === 0, 'only the slowed moves change');
  });
  ok('slow-down: only roughing', () => { const b = HEM.generate({ op: 'slot' }); let sec = ''; b.moves.forEach(m => { if (m.t === 'SEC') sec = m.name; else if (m.slowed) assert.strictEqual(sec, 'ROUGH'); }); });
  ok('slow-down: reported', () => assert(HEM.generate({ op: 'slot' }).geo.info.some(t => /Feed lowered on \d+ move/.test(t))));
  ok('loop returns at the return feed', () => { const b = HEM.generate({ op: 'slot', slowDown: false, retPct: '250' }), K = b.K; assert(b.moves.some(m => m.k === 'link' && (m.t === 'G2' || m.t === 'G3') && Math.abs(m.f - Math.round(K.rough.feed * 25) / 10) < 0.11)); });
}

// material numbers and coatings come from the Feeds and Speeds library
{
  const F = require('../lib/feeds.js');
  ok('materials from feeds.js', () => { assert.deepStrictEqual(Object.keys(HEM.MATERIALS).sort(), Object.keys(F.MATERIALS).sort()); const K = HEM.calc(HEM.DEFAULTS); assert(Math.abs(K.rough.sfm - F.MATERIALS.a36.em.sfm) < 1); assert(Math.abs(K.rough.fzReal - F.MATERIALS.a36.em.k * 0.75) < 2e-5); });
  ok('coating factor applied to blank speeds', () => { const a = HEM.calc({ ...HEM.DEFAULTS, coating: 'none' }), b = HEM.calc(HEM.DEFAULTS); assert(Math.abs(a.rough.sfm / b.rough.sfm - F.COATINGS.none.f.st) < 0.01); });
  ok('typed speed wins over material and coating', () => { const K = HEM.calc({ ...HEM.DEFAULTS, coating: 'none', sfmR: '400' }); assert(Math.abs(K.rough.sfm - 400) < 1); });
  ok('coating warnings', () => { assert(HEM.generate({ mat: 'al6061', coating: 'altin' }).warn.some(w => /sticks/i.test(w))); assert(HEM.generate({ mat: 'ss304', coating: 'dlc' }).warn.some(w => /heat breaks/i.test(w))); });
}

// drawing exactly: typed points, tangent arcs, offset, extend and trim, snapping to midpoints
{
  const near = (a, b, t) => Math.abs(a - b) < (t || 1e-6);
  ok('typed points', () => { assert.deepStrictEqual(Geo.parsePoint('2, 3', null), [2, 3]); assert.deepStrictEqual(Geo.parsePoint('@1,-1', [2, 3]), [3, 2]); const p = Geo.parsePoint('@2<90', [1, 1]); assert(near(p[0], 1) && near(p[1], 3)); assert.strictEqual(Geo.parsePoint('abc', [0, 0]), null); assert.strictEqual(Geo.parsePoint('@1,1', null), null); });
  ok('tangent arc', () => { const a = Geo.tangentArc([0, 0], [1, 0], [1, 1]); assert(near(a.r, 1) && !a.mids.length); const b = Geo.tangentArc([0, 0], [1, 0], [0, -2]); assert(near(b.r, -1)); const c = Geo.tangentArc([0, 0], [1, 0], [-1, 1]); assert(c.mids.length === 1 && c.r > 0); assert.strictEqual(Geo.tangentArc([0, 0], [1, 0], [3, 0]), null); });
  ok('tangent arc leaves along the direction', () => { const sh = { closed: false, pts: [[0, 0, 0, 0], [2, 0, 0, 0]] }, d = Geo.endDir(sh.pts), a = Geo.tangentArc([2, 0], d, [3, 1]); const pts = sh.pts.concat([[3, 1, 0, 0]]); pts[1][3] = a.r; const f = Geo.filleted({ closed: false, pts }); const i = f.findIndex(p => near(p[0], 2) && near(p[1], 0)); assert(Math.abs(f[i + 1][1] - f[i][1]) < 0.05 * (f[i + 1][0] - f[i][0]) + 1e-9); });
  ok('offset a closed shape out and in', () => { const sq = { closed: true, pts: [[0, 0, 0, 0], [2, 0, 0, 0], [2, 1, 0, 0], [0, 1, 0, 0]] }; const o = Geo.offsetShapes([sq], 0.25)[0], i = Geo.offsetShapes([sq], -0.25)[0]; assert(near(Math.abs(Geo.area(Geo.filleted(o))), 2.5 * 1.5 - (4 - Math.PI) * 0.0625, 2e-3)); assert(near(Math.abs(Geo.area(Geo.filleted(i))), 1.5 * 0.5, 2e-3)); assert(o.pts.some(p => p[3])); assert.strictEqual(Geo.offsetShapes([sq], -0.6).length, 0); });
  ok('offset an open path to the side', () => { const o = Geo.offsetShapes([{ closed: false, pts: [[0, 0, 0, 0], [3, 0, 0, 0]] }], 0.5)[0]; assert(o.pts.every(p => near(p[1], 0.5, 1e-4))); });
  ok('extend and trim open ends', () => { const c = [{ t: 'line', x: 3, y: 0, a: 90 }, { t: 'line', x: -2, y: 0, a: 90 }]; assert.deepStrictEqual(Geo.extendEnds({ closed: false, pts: [[0, 0, 0, 0], [1, 0, 0, 0]] }, [], c).pts.map(p => p.slice(0, 2)), [[-2, 0], [3, 0]]); assert.deepStrictEqual(Geo.extendEnds({ closed: false, pts: [[-3, 0, 0, 0], [3, 0, 0, 0]] }, [], [{ t: 'line', x: 1, y: 0, a: 90 }, { t: 'line', x: -1, y: 0, a: 90 }], true).pts.map(p => p.slice(0, 2)), [[-1, 0], [1, 0]]); });
  ok('extend to another shape', () => { const e = Geo.extendEnds({ closed: false, pts: [[0, 0.5, 0, 0], [1, 0.5, 0, 0]] }, [{ closed: true, pts: [[2, 0, 0, 0], [3, 0, 0, 0], [3, 1, 0, 0], [2, 1, 0, 0]] }], []); assert(near(e.pts[1][0], 2)); });
  // editing one segment or point
  const SQ = { closed: true, pts: [[0, 0, 0, 0], [2, 0, 0, 1, 1], [2, 2, 0.1, 0], [0, 2, 0, 0]] };
  ok('delete a segment of a closed shape: it opens there', () => { const r = Geo.deleteSegment(SQ, 1); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].closed, false); assert.deepStrictEqual(r[0].pts.map(p => p.slice(0, 2)), [[2, 2], [0, 2], [0, 0], [2, 0]]); assert(!r[0].pts[3][3] && r[0].pts.every(p => !p[4])); assert.strictEqual(SQ.pts.length, 4); });
  ok('delete a segment of an open path: it splits; a lone point goes', () => { assert.strictEqual(Geo.deleteSegment({ closed: false, pts: [[0, 0], [1, 0], [2, 0], [3, 0]] }, 1).length, 2); const r = Geo.deleteSegment({ closed: false, pts: [[0, 0], [1, 0], [2, 0]] }, 0); assert.deepStrictEqual(r.map(s => s.pts.length), [2]); });
  ok('split a path at a point; open a closed shape at a point', () => { const r = Geo.splitAt({ closed: false, pts: [[0, 0, 0, 0], [1, 0, 0, 0.6], [2, 0, 0, 0]] }, 1); assert.deepStrictEqual(r.map(s => s.pts.length), [2, 2]); assert.strictEqual(r[1].pts[0][3], 0.6); const o = Geo.splitAt(SQ, 2)[0]; assert(!o.closed && o.pts.length === 5 && o.pts[0][0] === 2 && o.pts[4][1] === 2); });
  ok('reverse keeps the outline, flips arcs, and twice is the same', () => { const r = Geo.reverseShape(SQ); assert(near(Geo.area(Geo.filleted(r)), -Geo.area(Geo.filleted(SQ)), 1e-9)); assert.deepStrictEqual(Geo.reverseShape(r).pts, SQ.pts); });
  ok('start a closed shape at another point', () => { const r = Geo.startAt(SQ, 2); assert.deepStrictEqual(r.pts[0], SQ.pts[2]); assert(near(Geo.area(Geo.filleted(r)), Geo.area(Geo.filleted(SQ)), 1e-9)); });
  ok('segment length, angle and arc length', () => { const I = Geo.segInfo(SQ, 1); assert(near(I.len, Math.PI) && near(I.angle, 90) && I.r === 1); const L = Geo.setSegLength(SQ, 0, 3); assert.deepStrictEqual(L.pts[1].slice(0, 2), [3, 0]); const A = Geo.setSegAngle(SQ, 0, 90); assert(near(A.pts[1][0], 0, 1e-6) && near(A.pts[1][1], 2, 1e-6)); });
  ok('insert a point in the middle of an arc keeps the outline', () => { const r = Geo.insertMid(SQ, 1); assert.strictEqual(r.pts.length, 5); assert(near(r.pts[2][0], 3, 1e-6) && near(r.pts[2][1], 1, 1e-6)); assert(near(Geo.area(Geo.filleted(r)), Geo.area(Geo.filleted(SQ)), 1e-3)); assert.strictEqual(r.pts[2][4], 1); });
  ok('snap to the middle of a segment and of an arc', () => { const sq = { closed: false, pts: [[0, 0, 0, -1], [2, 0, 0, 0]] }; assert.deepStrictEqual(Geo.consSnap([1.01, 0.02], [], [{ closed: true, pts: [[0, 0, 0, 0], [2, 0, 0, 0], [2, 1, 0, 0]] }], 0.05).p, [1, 0]); const s2 = Geo.consSnap([1.01, 1.02], [], [sq], 0.05); assert(s2 && near(s2.p[0], 1, 1e-6) && near(s2.p[1], 1, 1e-6), JSON.stringify(s2)); });
}
ok('fillets and DXF', () => {
  const f = Geo.filleted({ closed: true, pts: [[0, 0, 0.5], [2, 0, 0.5], [2, 2, 0.5], [0, 2, 0.5]] });
  assert(Math.abs(Math.abs(Geo.area(f)) - (4 - (4 - Math.PI) * 0.25)) < 0.002);
  const dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n2\n21\n0\n0\nLINE\n10\n2\n20\n0\n11\n2\n21\n1\n0\nARC\n10\n1\n20\n1\n40\n1\n50\n0\n51\n180\n0\nLINE\n10\n0\n20\n1\n11\n0\n21\n0\n0\nENDSEC\n0\nEOF\n';
  const d = Geo.dxfShapes(dxf, 'in');
  assert.strictEqual(d.shapes.length, 1); assert(d.shapes[0].closed);
});

console.log(n + ' checks passed' + (process.exitCode ? ', some FAILED' : '') + (QUICK ? ' (quick: the slow ones skipped; run without --quick for all)' : ''));
