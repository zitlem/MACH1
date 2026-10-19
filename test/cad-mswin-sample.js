// A Mitsubishi EDM drawing (MSWIN V4.0) made up for the tests, in millimetres: a line, an arc each way and a spline
// (from a named group, which also holds the arcs the machine fits to it) make a closed outline; a point and a
// circle besides. test/cad-test.js reads it; test/cad-browser.js opens it in the page.
// mswin(entities as [kind, numbers or a curve's name], curves as named groups {name, deg, cp, kn, fit}); fit: the arcs
// the machine fits, which a reader takes in place of the curve when they run from its start to its end
function mswin(ents, curves) {
  const out = [], u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return [...b]; }, f64 = v => { const b = Buffer.alloc(8); b.writeDoubleLE(v); return [...b]; };
  const F = id => out.push(1, id), I = v => out.push(0x18, ...u32(v)), D = v => out.push(0x1e, ...f64(v)), S = s => out.push(0x1f, ...u32(s.length + 1), ...Buffer.from(s, 'latin1'), 0), T = () => out.push(0x19, ...u32(4096));
  const ent = (kind, nums, name) => { F(0x0f); I(1); F(0x11); I(0); F(0x0e); out.push(4, kind); F(0x10); out.push(0x17, 3, 0); F(0x12); if (name) { S(name); I(0xffffffff); } else nums.forEach(D); F(0x13); };
  out.push(...Buffer.from('904f1191fc4a448e5d2c11cf0d3d6301', 'hex')); S('MSWIN'); S('V4.0'); F(1); I(16); F(2); S('root'); F(9); I(0); F(5); out.push(4, 48);
  for (const [kind, nums] of ents) typeof nums === 'string' ? ent(kind, [], nums) : ent(kind, nums);
  for (const c of curves) {
    F(0x14); F(1); I(16); F(2); S(c.name); F(9); I(0); F(0x0a); T(); F(0x15); I(201); I(c.deg); D(0.01);
    c.cp.forEach((p, i) => { F(i ? 0x0c : 0x0d); T(); F(0x15); I(202); D(p[0]); D(p[1]); D(1); }); c.cp.forEach(() => F(0x18));
    c.kn.forEach((k, i) => { F(i ? 0x0c : 0x0d); T(); F(0x15); I(203); D(k); }); F(0x0d); T(); F(0x15); I(204); D(c.kn[0]); D(c.kn[c.kn.length - 1]);
    for (const nums of c.fit) ent(0xc6, nums);
  }
  return new Uint8Array(out);
}
// the arcs fitted to a curve (in its own numbers), as the machine keeps them: start, end, signed sweep, centre, radius
function fitArcs(c, n = 8) {
  const G = require('../lib/cad-geom.js'), sp = { t: 'spline', deg: c.deg, kn: c.kn, cp: c.cp, w: null }, out = [];
  for (let i = 0; i < n; i++) {
    const g = G.arc3(G.at(sp, i / n), G.at(sp, (i + 0.5) / n), G.at(sp, (i + 1) / n)), p = G.start(g), q = G.end(g);
    out.push([p[0], p[1], q[0], q[1], g.sw, g.c[0], g.c[1], g.r]);
  }
  return out;
}
const CURVE = { name: '@BSCV1', deg: 3, cp: [[50.8, 50.8], [25.4, 76.2], [0, 50.8], [0, 0]], kn: [0, 0, 0, 0, 1.5, 1.5, 1.5, 1.5] };
// fit: 'arcs' (the machine's arcs, end to end), 'none', or 'off' (an arc that does not follow the curve)
const EDM = (fit = 'arcs') => mswin([
  [1, [25.4, -25.4]],                                                                                   // a point (a start hole)
  [0xc3, [0, 0, 50.8, 0, 50.8, 0, -1, 0]],                                                             // a line
  [0xc6, [50.8, 0, 76.2, 25.4, Math.PI / 2, 50.8, 25.4, 25.4]],                                         // a quarter arc, anticlockwise
  [0xc6, [76.2, 25.4, 50.8, 50.8, -Math.PI / 2, 76.2, 50.8, -25.4]],                                     // and one clockwise
  [7, '@BSCV1'],                                                                                        // a curve, by name
  [6, [50.8, 101.6, 50.8, 101.6, 2 * Math.PI, 25.4, 101.6, 25.4]],                                      // a circle
], [Object.assign({ fit: fit === 'arcs' ? fitArcs(CURVE) : fit === 'off' ? [[50.8, 50.8, 0, 0, 1, 0, 0, 30]] : [] }, CURVE)]);
module.exports = { mswin, EDM };
