// Feeds and speeds: the formulas give the textbook numbers, and every tool and material gives finite results.
const assert = require('assert');
const F = require('../lib/feeds.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

ok('end mill HEM: RPM from SFM, chip thinning at the stepover', () => {
  const r = F.calc({ tool: 'endmill', mat: 'a36', D: 0.5, Z: 4, op: 'hem', ap: 0.5 });
  assert.strictEqual(r.rpm, Math.round(575 * 12 / Math.PI / 0.5));
  assert.ok(near(r.ae, 0.075, 1e-9), r.ae);                                       // 15% at 1×D deep
  assert.ok(near(r.thin, 0.5 / (2 * Math.sqrt(0.5 * r.ae - r.ae * r.ae)), 1e-9));
  assert.ok(near(r.feed, r.rpm * 4 * 0.0042 * 0.5 * r.thin, 0.06), r.feed);
  assert.ok(near(r.mrr, r.ae * r.ap * r.feed, 0.01));
});
ok('HEM stepover gets lighter with depth: 15% at 1×D, 7% past 3×D', () => {
  const a = F.calc({ tool: 'endmill', D: 0.75, Z: 5, ap: 0.75 }), b = F.calc({ tool: 'endmill', D: 0.75, Z: 5, ap: 2.4, loc: 2.5, stick: 2.75 });
  assert.ok(near(a.ae / 0.75, 0.15, 1e-9) && b.ae / 0.75 < 0.08 && b.ae / 0.75 >= 0.06, [a.ae, b.ae]);
  assert.ok(b.warnings.some(w => /Chatter/.test(w)));
});
ok('HEM A36 3/4 5-flute 2.4 deep lands near published starting points (2900 RPM, 0.05 WOC, ~80 IPM)', () => {
  const r = F.calc({ tool: 'endmill', mat: 'a36', D: 0.75, Z: 5, ap: 2.4, loc: 2.5, stick: 2.75 });
  assert.ok(near(r.rpm, 2900, 100) && near(r.ae, 0.05, 0.01) && near(r.feed, 80, 12), JSON.stringify([r.rpm, r.ae, r.feed]));
});
ok('finish pass: light stock, faster, spring pass explained', () => {
  const r = F.calc({ tool: 'endmill', mat: 'a36', D: 0.75, Z: 5, op: 'finish', ap: 2.375, loc: 2.5, stick: 2.75 });
  assert.ok(near(r.ae, 0.012, 1e-9) && near(r.sfm, 650, 10) && r.fzProg < 0.006 && r.how.some(h => /Spring pass/.test(h)), JSON.stringify([r.ae, r.sfm, r.fzProg]));
});
ok('helix into a bore: centre feed = edge feed × path ÷ hole, step down from the ramp angle, G-code reaches depth', () => {
  const G = require('../lib/gcode.js');
  const r = F.calc({ tool: 'helix', mat: 'a36', D: 0.75, Z: 5, bore: 1.03, depth: 2.4, loc: 2.5, stick: 2.75 });
  assert.ok(near(r.Dc, 0.28, 1e-9));
  assert.ok(near(r.feed, r.edgeFeed * 0.28 / 1.03, 0.06), [r.feed, r.edgeFeed]);
  assert.ok(near(r.pitch, Math.PI * 0.28 * Math.tan(1.5 * Math.PI / 180), 1e-6) && near(r.ipr, 0.0035, 0.0006) && near(r.rpm, 2300, 60), JSON.stringify([r.pitch, r.ipr, r.rpm]));
  assert.ok(r.warnings.some(w => /centre-cutting/.test(w)));
  const run = G.run('H', F.gcode(r).join('\n'), {});
  const zs = run.moves.map(m => m.pts[m.pts.length - 1][2]);
  assert.ok(near(Math.min(...zs), -2.4, 1e-9) && !run.notes.length, run.notes.join());
  for (const m of run.moves) if (m.arc) for (const q of m.pts) assert.ok(near(Math.hypot(q[0], q[1]), 0.14, 1e-6));
  const big = F.calc({ tool: 'helix', D: 0.5, bore: 1.25, depth: 1 });
  assert.ok(big.warnings.some(w => /core/.test(w)));
});
ok('circular finish at full depth from a pre-hole', () => {
  const r = F.calc({ tool: 'helix', mat: 'a36', D: 0.75, Z: 5, bore: 1.03, pre: 1.005, depth: 2.4, hmode: 'circle', finish: true });
  assert.ok(near(r.ae, 0.0125, 1e-9) && r.feed > 0 && /spring pass/.test(F.gcode(r).join('\n')));
});
ok('chamfer mill: chip thins by sin(90° − edge angle), lighter with more edge in the cut', () => {
  const a = F.calc({ tool: 'chamfer', mat: 'a36', D: 1.02, Z: 3, angle: 15, maxap: 0.305, ap: 0.15 });
  const b = F.calc({ tool: 'chamfer', mat: 'a36', D: 1.02, Z: 3, angle: 15, maxap: 0.305, ap: 0.3 });
  assert.ok(near(a.Dmax, 1.02 + 2 * 0.15 * Math.tan(15 * Math.PI / 180), 1e-9) && near(a.thin, 1 / Math.sin(75 * Math.PI / 180), 1e-9));
  assert.ok(near(a.fzProg, 0.005, 0.001) && near(b.fzProg, 0.004, 0.0008) && b.fzProg < a.fzProg, [a.fzProg, b.fzProg]);
  const sh = F.calc({ tool: 'chamfer', mat: 'a36', D: 1.02, Z: 3, angle: 15, maxap: 0.305, ap: 0.25, ae: 0.25 });
  assert.ok(sh.warnings.some(w => /chatter/i.test(w)));
});
ok('the spindle limit caps RPM and says so', () => {
  const r = F.calc({ tool: 'endmill', mat: 'al6061', D: 0.125, Z: 3, maxRpm: 10000 });
  assert.strictEqual(r.rpm, 10000);
  assert.ok(r.warnings.some(w => /tops out at 10000/.test(w)));
});
ok('slotting slows down and full width has no thinning', () => {
  const r = F.calc({ tool: 'endmill', mat: 'a36', D: 0.5, Z: 4, op: 'slot' });
  assert.ok(near(r.ae, 0.5, 1e-9) && r.thin === 1 && r.rpm < F.calc({ tool: 'endmill', mat: 'a36', D: 0.5, op: 'hem' }).rpm);
});
ok('ball end mill runs at its effective diameter', () => {
  const r = F.calc({ tool: 'ball', mat: 's4140', D: 0.25, Z: 2, ap: 0.02 });
  assert.ok(near(r.Deff, 2 * Math.sqrt(0.02 * 0.23), 1e-9) && r.rpm > F.calc({ tool: 'endmill', mat: 's4140', D: 0.25, Z: 2, op: 'hem' }).rpm);
});
ok('high-feed mill: feed per tooth = chip ÷ sin(lead)', () => {
  const r = F.calc({ tool: 'feedmill', mat: 's4140', D: 2, Z: 4, lead: 15, ae: 1.5 });
  assert.ok(near(r.fzProg, 0.005 / Math.sin(15 * Math.PI / 180), 2e-5), r.fzProg);
});
ok('drill: G83 when deep, point length added', () => {
  const r = F.calc({ tool: 'drill', mat: 'a36', D: 0.25, depth: 2, toolMat: 'carbide', point: 135 });
  assert.ok(r.peck > 0 && near(r.tip, 0.125 / Math.tan(67.5 * Math.PI / 180), 1e-9));
  assert.ok(/G83/.test(F.gcode(r).join('\n')));
});
ok('tap: feed = RPM × pitch, 75% cut-tap drill for 1/4-20 is #7, 65% form-tap drill is #1', () => {
  const r = F.calc({ tool: 'tap', mat: 'a36', thread: '1/4-20' });
  assert.ok(near(r.feed, r.rpm / 20, 0.001));
  assert.ok(r.drills.some(d => d.name === '#7'), JSON.stringify(r.drills));
  const f = F.calc({ tool: 'tap', mat: 'al6061', thread: '1/4-20', tapType: 'form' });
  assert.ok(f.drills.some(d => d.name === '#1'), JSON.stringify(f.drills));
  const m = F.calc({ tool: 'tap', mat: 'a36', thread: 'M8x1.25' });
  assert.ok(m.drills.some(d => d.name === '6.8 mm'), JSON.stringify(m.drills));
  assert.ok(F.thread('3/8-16').major === 0.375 && F.thread('M10x1.5').pmm === 1.5 && F.thread('#10-32').tpi === 32);
});
ok('3/8-16 cut tap drill is 5/16', () => assert.ok(F.calc({ tool: 'tap', thread: '3/8-16' }).drills.some(d => d.name === '5/16')));
ok('reamer leaves stock for the reamer and picks a drill under it', () => {
  const r = F.calc({ tool: 'reamer', mat: 'a36', D: 0.375 });
  assert.ok(r.pre && r.pre.d < 0.375 && r.pre.left >= 0.008 && r.pre.left <= 0.03, JSON.stringify(r.pre));
});
ok('overrides replace the calculated values', () => {
  const r = F.calc({ tool: 'endmill', mat: 'a36', D: 0.5, Z: 4, rpm: 3000, feed: 50 });
  assert.strictEqual(r.rpm, 3000); assert.strictEqual(r.feed, 50);
});
ok('coatings change the surface speed and warn when wrong for the material', () => {
  const base = F.calc({ tool: 'endmill', mat: 'a36', D: 0.5 }), none = F.calc({ tool: 'endmill', mat: 'a36', D: 0.5, coating: 'none' });
  assert.ok(near(none.sfm / base.sfm, 0.75, 0.01), [none.sfm, base.sfm]);
  assert.ok(F.calc({ tool: 'endmill', mat: 'al6061', D: 0.5, coating: 'altin' }).warnings.some(w => /sticks/.test(w)));
  assert.ok(F.calc({ tool: 'drill', mat: 'a36', D: 0.25, coating: 'diamond' }).warnings.some(w => /for aluminium/.test(w)));
  assert.strictEqual(F.calc({ tool: 'facemill', mat: 'a36', D: 3, coating: 'none' }).coatF, 1);          // inserts: their own grade
});
ok('tapered end mill: RPM from the widest diameter in the cut; ball tip at shallow depth', () => {
  const r = F.calc({ tool: 'taper', mat: 'a36', D: 0.125, Z: 3, taper: 3, ap: 1, op: 'finish', loc: 1.5, stick: 2 });
  assert.ok(near(r.Dtop, 0.125 + 2 * Math.tan(3 * Math.PI / 180), 1e-9) && near(r.rpm, 575 * 1.13 * 12 / Math.PI / r.Dtop, 2), JSON.stringify([r.Dtop, r.rpm]));
  const b = F.calc({ tool: 'taper', mat: 'a36', D: 0.125, taper: 1, tip: 'ball', ap: 0.02, ae: 0.01, maxRpm: 40000 });
  assert.ok(near(b.Dtop, 2 * Math.sqrt(0.02 * (0.125 - 0.02)), 1e-9), String(b.Dtop));
});
ok('every tool with every material gives finite numbers', () => {
  for (const tool of Object.keys(F.TOOLS)) for (const mat of Object.keys(F.MATERIALS)) for (const toolMat of ['carbide', 'hss']) for (const coating of Object.keys(F.COATINGS)) {
    const r = F.calc({ tool, mat, toolMat, coating, D: 0.5, thread: '1/2-13', bore: 1 });
    for (const k of ['rpm', 'feed', 'sfm']) assert.ok(Number.isFinite(r[k]) && r[k] > 0, tool + ' ' + mat + ' ' + k + '=' + r[k]);
    F.gcode(r);
  }
});
console.log(n + ' feeds tests passed' + (process.exitCode ? ' (with failures)' : ''));
