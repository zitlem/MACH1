// G-code interpreter and Mazatrol cutter path tests: known programs give known moves; every EIA program and
// every Mazatrol program of the machines runs without errors, and paths stay finite and inside their shapes.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Maz = require('../src/core.js');
Maz.useSchema(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/schema.json'), 'utf8')));
global.Maz = Maz;
const Plot = require('../src/plot.js');
global.Plot = Plot;
const Paths = require('../src/paths.js');
const G = require('../src/gcode.js');
// the shop's sample and customer programs live outside the repo (see datapaths.js)
const { KETS, KET, kp } = require('./datapaths.js');
let n = 0;
function PROGS_FIRST_MILL() {
  const d = kp('samplemazak/cnc/MILL SMOOHG');
  for (const f of fs.readdirSync(d).sort()) if (/\.PB[DM]$/i.test(f)) { const p = Maz.parse(new Uint8Array(fs.readFileSync(path.join(d, f))), f); if (Maz.programTools(p, 'inch').length > 1) return path.join(d, f); }
}
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.stack.split('\n').slice(0, 3).join('\n  ')); process.exitCode = 1; } };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const end = m => m.pts[m.pts.length - 1];

// ---------------------------------------------------------------- G-code
ok('G-code: rapid, feed, incremental, arcs by I J and by R', () => {
  const r = G.run('T', 'G90 G0 X0 Y0 Z1.\nG1 Z-0.1 F10.\nX1.\nG91 Y1.\nG90 G2 X2. Y2. I0 J1.\nG3 X3. Y1. R1.\nM30\n', {});
  const k = r.moves.map(m => m.kind);
  assert.deepStrictEqual(k, ['rapid', 'feed', 'feed', 'feed', 'feed', 'feed']);
  assert.deepStrictEqual(end(r.moves[3]), [1, 1, -0.1]);
  const arc = r.moves[4];
  assert.ok(arc.arc && arc.pts.length > 10, 'arc points');
  for (const q of arc.pts) assert.ok(near(Math.hypot(q[0] - 1, q[1] - 2), 1, 1e-9), 'on the circle round (1, 2)');
  const arc2 = r.moves[5];
  assert.deepStrictEqual(end(arc2), [3, 1, -0.1]);
  for (const q of arc2.pts) assert.ok(near(Math.hypot(q[0] - 3, q[1] - 2), 1, 1e-6) || near(Math.hypot(q[0] - 2, q[1] - 1), 1, 1e-6), 'R arc');
});
ok('G-code: drilling cycles with pecks, initial and R levels', () => {
  const r = G.run('T', 'G0 X0 Y0 Z1.\nG99 G83 X1. Y1. Z-1. R0.1 Q0.4 F5.\nX2.\nG80\n', {});
  const zs = r.moves.map(m => +end(m)[2].toFixed(4));
  assert.ok(zs.includes(-0.3) && zs.includes(-0.7) && zs.includes(-1), 'pecks of Q from the R level: -0.3, -0.7, then -1');
  assert.ok(r.moves.filter(m => m.kind === 'feed').length === 6, 'three feeds per hole');
  assert.ok(!zs.slice(r.moves.findIndex(m => m.kind === 'feed')).includes(1), 'G99 returns to R, not the initial level');
});
ok('G-code: macro variables, IF/GOTO, WHILE and G65 arguments', () => {
  const text = 'O100\n#1=0\nWHILE[#1LT3]DO1\nG1 X#1 Y[#1*2] F10.\n#1=#1+1\nEND1\nIF[#1EQ3]GOTO20\nG1 X99.\nN20 G65 P200 A5. B2.\nM30\nO200\nG1 X[#1+#2] Y0\nM99\n';
  const r = G.run('T', text, {});
  const xs = r.moves.map(m => end(m)[0]);
  assert.deepStrictEqual(xs, [1, 2, 7], JSON.stringify(xs));            // X0 Y0 is no move; the G65 call gets A=#1=5 B=#2=2
  assert.ok(!xs.includes(99), 'GOTO jumps over the X99 line');
});
ok('G-code: subprograms from other files and M98 repeats', () => {
  const r = G.run('MAIN', 'G0 X0 Y0 Z0\nM98 P1234 L2\nM30\n', { resolve: k => (k === '1234' ? 'O1234\nG91 G1 X1. F10.\nG90\nM99\n' : null) });
  assert.deepStrictEqual(r.moves.map(m => end(m)[0]), [1, 2]);
  assert.deepStrictEqual(r.programs, ['MAIN', '1234']);
  assert.ok(r.moves.every(m => m.prog === 1));
});
ok('G-code: lathe X in diameter, U/W incremental, G71 roughing then G70', () => {
  const od = 'G18 G99\nT0101\nG0 X2.1 Z0.1\nG71 U0.1 R0.02\nG71 P10 Q20 U0.02 W0.005 F0.01\nN10 G0 X1.0\nG1 Z-1.0\nX1.5\nZ-2.0\nN20 X2.0\nG70 P10 Q20\nG0 U1. W1.\nM30\n';
  const r = G.run('OD', od, { lathe: true });
  const feeds = r.moves.filter(m => m.kind === 'feed' && m.line === 4);
  assert.ok(feeds.length >= 5, 'roughing passes');
  const levels = feeds.filter(m => near(m.pts[0][0], end(m)[0])).map(m => +m.pts[0][0].toFixed(4));
  assert.ok(levels.includes(0.95) && levels.includes(0.55), JSON.stringify(levels));
  const fin = r.moves.filter(m => m.line === 10);
  assert.ok(fin.length >= 4 && near(end(fin[fin.length - 1])[0], 1.05), 'G70 runs the shape and goes back to the start');
  assert.ok(!r.trace.some(t => t.line >= 5 && t.line <= 9), 'the shape blocks are not run on their own after G71');
  assert.deepStrictEqual(end(r.moves[r.moves.length - 1]).map(v => +v.toFixed(4)), [1.55, 0, 1.1]);
});
ok('G-code: G68 turns the points about its axis until G69', () => {
  const r = G.run('T', 'G0 X0 Y0 Z0\nG68 X0 Y0 R90.\nG1 X1. F10.\nG69\nG1 X2. Y0\nG68 X0 Y0 Z0 I0 J1. K0 R90.\nG1 X1. Y0 Z0\n', {});
  assert.deepStrictEqual(r.moves.map(m => end(m).map(v => +v.toFixed(9) + 0)), [[0, 1, 0], [2, 0, 0], [0, 0, -1]]);
  // each move starts where the last one ended (the tool does not jump when the rotation changes)
  for (let k = 1; k < r.moves.length; k++) assert.deepStrictEqual(r.moves[k].pts[0].map(v => +v.toFixed(9) + 0), end(r.moves[k - 1]).map(v => +v.toFixed(9) + 0));
});
ok('G-code: describe says what a block does', () => {
  assert.strictEqual(G.describe('N120 G01 X1. Y2.5 F20.', 'mill'), 'N120 · G1 feed · F20 · X1 Y2.5');
  assert.strictEqual(G.describe('T0808 M8', 'lathe'), 'tool 8 offset 8 · M8 coolant on');
  assert.strictEqual(G.describe('G71 U.005 R0.2', 'lathe'), 'G71 rough turning cycle · U0.005 R0.2');
  assert.strictEqual(G.describe('IF[#1EQ#0]GOTO99', 'mill'), 'if [#1EQ#0] go to N99');
});
ok('G-code: machine type guess', () => {
  assert.strictEqual(G.guessType('T0808 M8\nG0 X1. Z0.1\n'), 'lathe');
  assert.strictEqual(G.guessType('T5 M6\nG0 X1. Y1.\n'), 'mill');
  assert.strictEqual(G.guessType('G10.9 X0\nM200\nT014 M6\n'), 'millturn');
});
ok('G-code: times at feed per minute and per revolution', () => {
  const r = G.run('T', 'G94 G0 X0 Y0 Z0\nG1 X10. F100.\nG95 S1000 M3\nG1 X20. F0.01\n', {});
  const t = G.times(r.moves, { units: 'inch' });
  assert.ok(near(t.each[0], 6) && near(t.each[1], 60), JSON.stringify(Array.from(t.each)));
});

// every EIA program of the machines: no errors, finite points
const EIA = [];
const MACHINES = kp('MAZATROL/Smooth');
(function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.EIA$/i.test(e.name)) EIA.push(p); } })(MACHINES);
if (EIA.length) ok('G-code: ' + EIA.length + ' EIA programs of the machines run', () => {
  for (const f of EIA) {
    const m = path.relative(MACHINES, f).split(path.sep)[0], text = fs.readFileSync(f, 'latin1');
    const type = /MCH-C/.test(m) ? 'mill' : /MCH-F/.test(m) ? 'millturn' : 'lathe';
    const r = G.run(path.basename(f), text, { lathe: type === 'lathe', millturn: type === 'millturn', maxBlocks: 50000 });
    for (const mv of r.moves) for (const q of mv.pts) assert.ok(q.every(Number.isFinite), f);
    assert.ok(r.trace.length <= r.blocks);
  }
});

// ---------------------------------------------------------------- Mazatrol cutter paths
const open = f => Maz.parse(new Uint8Array(fs.readFileSync(kp(f))), path.basename(f));
ok('paths: GP-PART7 (mill) has every unit\'s path, steps in machining order', () => {
  const p = open('SLN/Samples/GP-PART7.PBD'), ls = Maz.lines(p), r = Paths.program(p, 'inch', ls);
  assert.ok(r.moves.length > 500, 'moves');
  const units = new Set(r.moves.map(m => m.unit));
  for (const u of [2, 3, 4, 5, 6, 7, 8]) assert.ok(units.has(u), 'unit ' + u + ' has moves');
  for (let k = 1; k < r.steps.length; k++) assert.ok(r.steps[k].at >= r.steps[k - 1].at, 'steps in order');
  // drilling: the DRILL goes 1. deep at both holes, pecking at 1. (so one feed down)
  const drill = r.moves.filter(m => m.rec === 12 || m.rec === 13).filter(m => m.kind === 'feed');
  assert.ok(drill.some(m => near(end(m)[2], -1)), 'drill depth');
  // the LINE OUT E-MILL (1.0) runs 0.5 + FIN-R 0.005 outside the 6 x 4 rectangle, at Z -0.995
  const lo = r.moves.filter(m => m.unit === 2 && m.kind === 'feed');
  const xs = lo.flatMap(m => m.pts.map(q => q[0])), zs = new Set(lo.map(m => +end(m)[2].toFixed(4)));
  assert.ok(near(Math.min(...xs), -0.505, 1e-6) && near(Math.max(...xs), 6.505, 1e-6), [Math.min(...xs), Math.max(...xs)].join());
  assert.deepStrictEqual([...zs], [-0.995]);
  // pockets: every feed point at least the tool radius + FIN-R inside the wall
  const pk = r.moves.filter(m => m.unit === 6 && m.kind === 'feed');
  const wall = [];
  for (const i of [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47]) wall.push([Buffer.from(p.recs[i]).readInt32LE(40) * 1e-5, Buffer.from(p.recs[i]).readInt32LE(44) * 1e-5]);
  for (const m of pk) for (const q of m.pts) {
    let d = Infinity;
    for (let i = 1; i < wall.length; i++) {
      const a = wall[i - 1], b = wall[i], v = [b[0] - a[0], b[1] - a[1]], l2 = v[0] * v[0] + v[1] * v[1];
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1]) / l2));
      d = Math.min(d, Math.hypot(a[0] + t * v[0] - q[0], a[1] + t * v[1] - q[1]));
    }
    assert.ok(d >= 0.19 * 0.97, 'pocket point ' + q + ' is ' + d + ' from the wall');
  }
});
ok('paths: a lathe program roughs, finishes, faces and drills', () => {
  const f = 'MAZATROL/Smooth/MCH-I/MC_Machine Programs/33.MTP';
  if (!fs.existsSync(kp(f))) return;
  const p = open(f), r = Paths.program(p, 'inch');
  // BAR OUT (record 17): passes 0.04 deep (radius) from X2.5 down to X1.476 + 0.01
  const passes = r.moves.filter(m => m.rec === 18 && m.kind === 'feed' && near(m.pts[0][0], end(m)[0]));
  const dias = passes.map(m => +(m.pts[0][0] * 2).toFixed(4));
  assert.ok(dias.includes(2.42) && dias.includes(1.54) && Math.min(...dias) >= 1.476 + 0.01 - 1e-9, JSON.stringify(dias));
  // finishing on the shape: X1.476 from Z0 to Z0.92
  const fin = r.moves.filter(m => m.rec === 20 && m.kind === 'feed');
  assert.ok(fin.some(m => near(end(m)[0] * 2, 1.476) && near(end(m)[2], 0.92)), 'finish pass');
  // T.DRILL to Z1. on the axis
  assert.ok(r.moves.some(m => m.rec === 16 && m.kind === 'feed' && near(end(m)[0], 0) && near(end(m)[2], 1)), 'drill');
  // facing to Z0 across to X0
  assert.ok(r.moves.some(m => m.rec === 13 && m.kind === 'feed' && near(end(m)[0], 0) && near(end(m)[2], 0)), 'facing');
});
ok('paths: offset of a square, inside and outside', () => {
  const sq = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  const inn = Paths.offset(sq, 0.5, true);
  assert.ok(inn.pts.every(q => near(q[0], 0.5) || near(q[0], 1.5) || near(q[1], 0.5) || near(q[1], 1.5)), JSON.stringify(inn.pts));
  const out = Paths.offset(sq, -0.5, true);
  for (const q of out.pts) {
    const dx = Math.max(0 - q[0], 0, q[0] - 2), dy = Math.max(0 - q[1], 0, q[1] - 2);
    assert.ok(near(Math.hypot(dx, dy), 0.5, 1e-9), 'outside offset keeps 0.5 from the square: ' + q);
  }
});
ok('paths: PRG-I — chamfer mills round the counterbore edge, CIRC MIL hole helix at PITCH2, OFFSET units shift, near-closed shapes noted', () => {
  const f = n => kp('prg-i', n);
  if (!fs.existsSync(f('PRG-I-2-OP1.PBD'))) return;
  const p1 = Maz.parse(new Uint8Array(fs.readFileSync(f('PRG-I-2-OP1.PBD'))), 'OP1.PBD'), r1 = Paths.program(p1, 'inch');
  // HOLE-D 99.9 on a chamfer mill is not a hole size: the circle is round the 0.47 counterbore edge
  const cb = r1.moves.filter(m => m.rec === 55 && m.kind === 'feed').map(m => Math.hypot(end(m)[0] - 10.471, end(m)[1] - 1.5));
  assert.ok(near(Math.max(...cb), 0.225, 1e-6), Math.max(...cb));
  for (const m of r1.moves) for (const q of m.pts) assert.ok(Math.hypot(q[0], q[1]) < 20, 'no huge arcs');
  const p2 = Maz.parse(new Uint8Array(fs.readFileSync(f('PRG-I-2-OP2.PBD'))), 'OP2.PBD'), r2 = Paths.program(p2, 'inch');
  // CIRC MIL: the hole's helix is PITCH2 (0.025 over 0.988 deep: about 40 turns of 36 moves per hole), not PITCH1
  // (the chamfer's) and not the tool line's 0.01
  const circ = r2.moves.filter(m => m.unit === 8).length;
  assert.ok(circ > 2000 && circ < 4000, String(circ));
  // OFFSET W 0.1 before the chamfer: it runs 0.1 higher
  const zs = r2.moves.filter(m => m.unit === 11 && m.kind === 'feed').flatMap(m => m.pts.map(q => q[2]));
  assert.ok(near(Math.min(...zs), 0.08, 1e-9), Math.min(...zs));
  assert.ok(r2.notes.some(n => /ends 0\.0020 from where it starts/.test(n)));
  // the shapes are drawn shifted too
  const g = Plot.geometry(p2, 'inch').filter(it => it.unit === 11);
  assert.ok(g.length && g.every(it => !it.z || near(it.z[0], 0.1, 1e-9)), JSON.stringify(g[0] && g[0].z));
});
ok('paths: SUB PRO units run the programs they call; nothing after END is run', () => {
  const f = n => kp('prg-i', n);
  if (!fs.existsSync(f('PRG-I-2-MAIN.PBD'))) return;
  const progs = {};
  for (const n of ['PRG-I-2-OP1', 'PRG-I-2-OP2', 'PRG-I-2-OP3']) progs[n] = Maz.parse(new Uint8Array(fs.readFileSync(f(n + '.PBD'))), n + '.PBD');
  const main = Maz.parse(new Uint8Array(fs.readFileSync(f('PRG-I-2-MAIN.PBD'))), 'MAIN.PBD');
  const alone = Paths.program(main, 'inch');
  assert.ok(!alone.moves.length && alone.notes.some(n => /SUB PRO PRG-I-2-OP1: open that program/.test(n)), alone.notes);
  const r = Paths.program(main, 'inch', null, undefined, { resolve: n => (progs[n] ? { p: progs[n] } : null) });
  const each = Object.values(progs).map(p => Paths.program(p, 'inch'));
  const cutting = x => x.moves.filter(m => m.kind !== 'rapid').length;
  assert.strictEqual(cutting(r), each.reduce((a, x) => a + cutting(x), 0), 'every cutting move of the three programs');
  assert.deepStrictEqual([...new Set(r.moves.map(m => m.unit))].sort(), [2, 3, 4], 'under the SUB PRO units');
  // priority numbers work across the called programs: the 0.75 end mill (No. 5, 6) does OP1 UNo 5-7, then OP3
  // UNo 5-9, before the next tool
  const tname = new Map();
  for (const p of Object.values(progs)) { const t = new Map(); for (const x of Maz.programTools(p, 'inch')) for (const l of x.lines) t.set(l, x.name + ' ' + x.nomText + ' ' + x.sfx); tname.set(p, t); }
  const runs = [];
  for (const m of r.moves) {
    if (m.kind === 'rapid') continue;
    if (m.sub.toolRec < 0) continue;
    const tool = tname.get(m.sub.p).get(m.sub.toolRec), l = runs[runs.length - 1];
    if (!l || l.tool !== tool) runs.push({ tool, units: new Set() });
    runs[runs.length - 1].units.add(m.sub.name.slice(-3) + ' ' + (m.sub.label.match(/UNo (\d+)/) || [])[1]);
  }
  const em = runs.map(x => [...x.units].join(',')).join(' | ');
  assert.ok(/\| OP1 5,OP1 6,OP1 7,OP3 5,OP3 6,OP3 7,OP3 8,OP3 9 \| OP3 10,/.test(em), em);
  assert.strictEqual(runs.length, 17, 'tool loads');
  // a pallet change between them: OP1 finishes before OP3 starts, each in its own priority order
  const pal = { ctl: main.ctl, name: 'PAL.PBD', header: main.header, recs: [main.recs[0], main.recs[1], main.recs[2], main.recs[5], main.recs[4], main.recs[6]].map(x => x.slice()), warnings: [] };
  Maz.renumber(pal);
  const rp = Paths.program(pal, 'inch', null, undefined, { resolve: n => (progs[n] ? { p: progs[n] } : null) });
  const names = rp.moves.filter(m => m.kind !== 'rapid').map(m => m.sub.name);
  assert.ok(names.lastIndexOf('PRG-I-2-OP1') < names.indexOf('PRG-I-2-OP3'), 'nothing crosses the pallet change');
  // a PROC END unit ends a process the same way
  const pe = Object.assign({}, pal, { recs: pal.recs.map(x => x.slice()) });
  pe.recs[3][0] = 0x0b;
  const re = Paths.program(pe, 'inch', null, undefined, { resolve: n => (progs[n] ? { p: progs[n] } : null) });
  const n2 = re.moves.filter(m => m.kind !== 'rapid').map(m => m.sub.name);
  assert.ok(n2.lastIndexOf('PRG-I-2-OP1') < n2.indexOf('PRG-I-2-OP3'), 'nothing crosses PROC END');
  assert.ok(r.steps.some(s => /UNo 3 SUB PRO PRG-I-2-OP2 › UNo 8 CIRC MIL/.test(s.label)));
  assert.strictEqual(r.subs.length, 3);
  // OP1: UNo 21 REAMING comes after END and is not run (or drawn)
  assert.ok(!each[0].moves.some(m => m.unit > 20) && each[0].notes.some(n => /UNo 21–22 come after the END unit/.test(n)));
  assert.ok(!Plot.geometry(progs['PRG-I-2-OP1'], 'inch').some(it => it.unit > 20));
});
ok('paths: priority numbers (No.) set the order: setup units first, then priority lines lowest first, then the rest', () => {
  const f = n => kp('prg-i', n);
  if (!fs.existsSync(f('PRG-I-2-OP3.PBD'))) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f('PRG-I-2-OP3.PBD'))), 'OP3.PBD'), r = Paths.program(p, 'inch');
  // UNo 4's finishing face mill (No. 44) runs after UNo 19 (No. 40) and before UNo 20 (No. 45)
  const at = pred => r.moves.findIndex(pred), lastOf = pred => r.moves.length - 1 - [...r.moves].reverse().findIndex(pred);
  const fin = at(m => m.toolRec === 8);
  assert.ok(fin > lastOf(m => m.unit === 19) && fin < at(m => m.unit === 20), [fin, lastOf(m => m.unit === 19), at(m => m.unit === 20)]);
  assert.ok(r.notes.some(n => /priority numbers/.test(n)));
  for (let i = 1; i < r.steps.length; i++) assert.ok(r.steps[i].at >= r.steps[i - 1].at, 'steps in order');
  // the WPC and MMS units stay ahead of the machining
  const labels = r.steps.map(s => s.label);
  assert.ok(labels.findIndex(l => /UNo 2 MMS|UNo 3 MMS/.test(l)) < labels.findIndex(l => /UNo 4 /.test(l)));
  // OP1: UNo 10's drill (No. 12) runs between UNo 9's two drills (No. 11, No. 13)
  const p1 = Maz.parse(new Uint8Array(fs.readFileSync(f('PRG-I-2-OP1.PBD'))), 'OP1.PBD'), r1 = Paths.program(p1, 'inch');
  const seq = []; for (const m of r1.moves) if (m.toolRec >= 0 && seq[seq.length - 1] !== m.toolRec) seq.push(m.toolRec);
  assert.ok(seq.indexOf(42) < seq.indexOf(47) && seq.indexOf(47) < seq.indexOf(43), seq.join(' '));
});
ok('paths: Smooth programs keep C-SP with 3 decimals (rpm and feed from 540000 = 540 ft/min, not 1000 times that)', () => {
  const f = kp('DIR-A/NUM-A/PRG-D-OP1.PBM');
  if (!fs.existsSync(f)) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'PRG-D-OP1.PBM'), r = Paths.program(p, 'inch');
  const top = Math.max(...r.moves.map(m => m.spindle || 0));
  assert.ok(top > 100 && top < 20000, String(top));
  // fixed times for units that do not cut: MMS per probe line, INDEX, PALT CHG, M-CODE as dwells
  const fx = Paths.program(p, 'inch', null, undefined, { fixed: { mms: 3.5, index: 2.2, pallet: 10.3, mcode: 1.6 } });
  const dw = fx.moves.filter(m => m.kind === 'dwell');
  assert.ok(dw.length > 10 && dw.every(m => m.dwell > 0), String(dw.length));
});
ok('TPC layouts: PRG-J (Matrix Nexus 2, every value changed) reads as on the control\'s screens', () => {
  const f = kp('from-control/PRG-J.PBD');
  if (!fs.existsSync(f)) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'PRG-J.PBD'), ls = Maz.lines(p);
  const tpc = uno => { const u = Maz.structure(p, ls).find(x => Maz.number(p.recs[x.i]) === uno); const i = u.seqs.find(k => p.recs[k][0] >= 0xd0 && p.recs[k][0] < 0xf0);
    const o = {}; for (const x of Maz.tpcFields(p.recs[i]).fields) o[x.d] = x.text; return o; };
  const want = {
    1: { E1: '0.2', E2: '0.1', E5: '0.5', E7: '0.6', E9: '0.9', E17: '2', E92: '11110010', E99: '11111111', E18: '5', E21: '0.03', E22: '99', E23: '2', E24: '10',
      E25: '110', E31: '3', E104: '11111111', E32: '4', E33: '113', E34: '9', E35: '158', E36: '23', E20: '2', E37: '0.025' },
    4: { D1: '0.3', D3: '1', D16: '3', D17: '0.06', D41: '0.3', D42: '0.03', D91: '00000110', D45: '0.02', D46: '0.025', D52: '60', D53: '8', F12: '0.02', D55: '0.05', D54: '44', D58: '55', D59: '25' },
    6: { E2: '0.2', E7: '0.3', E9: '0.1', E17: '6', E22: '2', E23: '33', E30: '0.02', E24: '22', E25: '123', E95: '00100010', E104: '11111111' },
    8: { D16: '3', D17: '0.02', D19: '6', D23: '0.2', D41: '0.3', D42: '3.', D91: '00000110', D92: '11110000', D1: '0.02' },
    10: { E2: '0.23', E8: '0.22', E9: '0.63', E11: '0.2', E17: '2', E95: '00100010', E30: '0.3' },
    12: { E9: '0.23', E12: '0.3', E15: '5', E104: '11111111' },
  };
  for (const [uno, w] of Object.entries(want)) assert.deepStrictEqual(tpc(+uno), w, 'UNo ' + uno);
});
ok('paths: POCKET rings follow E92 bit 0 (1 = outside in, 0 = inside out)', () => {
  const f = kp('MAZATROL/Smooth/MCH-C1/MC_Machine Programs/PRG-C-OP3.MAZ'), g = require('./datapaths.js').CHAT + '/EXTRA-01.MAZ';
  if (!fs.existsSync(f) || !fs.existsSync(g)) return;
  const donor = Maz.parse(new Uint8Array(fs.readFileSync(g)), 'T.MAZ').recs.find(r => r[0] === 0xe8);
  const base = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'S.MAZ');
  const nos = Maz.structure(base, Maz.lines(base)).filter(x => x.code === 0x63).map(x => Maz.number(base.recs[x.i]));
  const first = (no, bit) => {
    const q = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'S.MAZ'), u = Maz.structure(q, Maz.lines(q)).find(x => x.code === 0x63 && Maz.number(q.recs[x.i]) === no), rec = donor.slice();
    rec[42] = (rec[42] & ~1) | bit; q.recs.splice(u.seqs[u.seqs.length - 1] + 1, 0, rec); Maz.renumber(q);
    const l2 = Maz.lines(q), us2 = Maz.structure(q, l2), k = us2.findIndex(x => x.code === 0x63 && Maz.number(q.recs[x.i]) === no);
    const mv = Paths.program(q, 'inch', l2, undefined, { fixed: {} }).moves.filter(m => m.unit === k && m.kind === 'feed').slice(0, 4);
    return mv.reduce((t, m) => t + Math.hypot(m.pts[1][0], m.pts[1][1]), 0) / mv.length;
  };
  // the average distance from the origin of the first cuts differs between the two directions on at least one pocket
  assert.ok(nos.some(no => Math.abs(first(no, 1) - first(no, 0)) > 0.02), 'no pocket changed with E92 bit 0');
});
ok('paths: MMS probe lines draw the probe touches (bore: four, face: one), timed as the unit', () => {
  const f = kp('DIR-A/NUM-A/PRG-D-OP1.PBM');
  if (!fs.existsSync(f)) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'x.PBM'), ls = Maz.lines(p), us = Maz.structure(p, ls);
  const r = Paths.program(p, 'inch', ls, undefined, { fixed: { mms: 3.5, index: 2, pallet: 10, mcode: 1 } });
  const ui = us.findIndex(u => u.code === 8), ms = r.moves.filter(m => m.unit === ui);
  assert.ok(ms.filter(m => m.kind === 'feed').length >= 1 && ms.every(m => m.kind === 'dwell' || m.untimed), ms.map(m => m.kind).join());
  const t = G.times(ms, { units: 'inch' }).total;
  assert.ok(Math.abs(t - 3.5 * us[ui].seqs.length) < 1e-9, String(t));
});
ok('plot: hole patterns follow F (totals), Q (start only positioned), P (corners / chord side) and AN2', () => {
  const r = new Uint8Array(100), put = (o, v) => { r[o] = v & 255; r[o + 1] = (v >> 8) & 255; r[o + 2] = (v >> 16) & 255; r[o + 3] = (v >> 24) & 255; };
  const L = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) * 1e-5, near = (a, b) => Math.abs(a - b) < 1e-6;
  r[8] = 2; put(56, 400000); r[20] = 5; r[9] = 1;                      // LINE, 5 holes, T1 4.0 total
  let h = Plot.holes(r, L); assert.ok(h.length === 5 && near(h[4][0], 4), JSON.stringify(h));
  r[16] = 1; h = Plot.holes(r, L); assert.ok(h.length === 4 && near(h[0][0], 1), 'Q=1 skips the start');
  assert.ok(Plot.holes(r, L, true)[0][2] === true, 'all: the start is marked skipped');
  r.fill(0); r[8] = 3; put(56, 100000); put(60, 100000); put(52, 2700000); r[20] = 3; r[22] = 3; // SQR 3 x 3, AN2 270
  h = Plot.holes(r, L); assert.ok(h.length === 8 && h.some(q => near(q[1], -2)) && !h.some(q => q[1] > 1e-9), JSON.stringify(h));
  r[15] = 1; assert.strictEqual(Plot.holes(r, L).length, 4, 'P=1: no corner holes');
  r.fill(0); r[8] = 7; put(56, 100000); put(60, 100000);              // CHORD radius 1, chord 1, both ends
  h = Plot.holes(r, L); assert.ok(h.length === 2 && near(Math.hypot(h[0][0] - h[1][0], h[0][1] - h[1][1]), 1), JSON.stringify(h));
  r[15] = 1; assert.strictEqual(Plot.holes(r, L).length, 1, 'P=1: one end');
});
ok('gcode: mill-turn turning cycles G271/G270/G290 and lathe G90/G94/G92 are drawn', () => {
  const ig = 'G18 G90 G95\nG0 X2. Z0.1\nG271 U0.05 R0.02\nG271 P10 Q20 U0.01 W0.005 F0.01\nN10 G0 X1.\nG1 Z-1.\nX1.5 Z-1.5\nN20 X2.\nG270 P10 Q20\nG0 X2.2 Z0.1\nG290 X1.8 Z-1. F0.01\nX1.6\nG0 X3.\nM30\n';
  const r = G.run('I', ig, { millturn: true }), f = r.moves.filter(m => m.kind === 'feed');
  assert.ok(f.length >= 15 && !r.notes.length, f.length + ' ' + r.notes.join());
  assert.ok(f.some(m => m.pts.some(q => Math.abs(q[0] - 0.9) < 1e-9 && Math.abs(q[2] + 1) < 1e-9)), 'G290 X1.8 cuts at radius 0.9 ... and Z-1');
  const r2 = G.run('L', 'G0 X2. Z0.1\nG90 X1.8 Z-1. F0.01\nX1.6\nG0 X2.2 Z0.1\nG94 X0.5 Z-0.05 F0.005\nZ-0.1\nG0 X3.\nG50 S2000\nG0 X1.2 Z0.2\nG92 X1. Z-0.5 F0.0625\nM30\n', { lathe: true });
  const f2 = r2.moves.filter(m => m.kind === 'feed');
  assert.strictEqual(f2.length, 2 * 2 + 2 * 2 + 1, f2.length + ' feeds');
  assert.ok(!r2.notes.length, r2.notes.join());
});
ok('gcode: G73 / G74 / G75 / G76 and G87 (and mill-turn G273-G276, G287) are drawn', () => {
  const t = 'G0 X2. Z0.1\nG73 U0.2 W0.1 R3.\nG73 P10 Q20 U0.02 W0.01 F0.01\nN10 G0 X1.\nG1 Z-1.\nN20 X2.\nG0 X1.2 Z0.2\nG76 P021060 R0.002\nG76 X0.9 Z-0.5 P0.0306 Q0.01 F0.05\nG0 X3. Z-1.\nG87 Z-1. X1. R0.1 F0.005\nZ-1.5\nG80\nM30\n';
  const r = G.run('L', t, { lathe: true }), f = r.moves.filter(m => m.kind === 'feed');
  assert.ok(!r.notes.length, r.notes.join());
  const thread = f.filter(m => Math.abs(m.pts[m.pts.length - 1][2] + 0.5) < 1e-9 && m.pts[0][2] > 0.1);
  assert.strictEqual(thread.length, 11, 'G76: 8 passes at d√n, the allowance pass, 2 finishing passes');
  assert.ok(f.filter(m => Math.abs(m.pts[1][0] - 0.5) < 1e-9 && Math.abs(m.pts[1][2] + 1.5) < 1e-9).length === 1, 'G87 drills to X1. at Z-1.5');
  const ri = G.run('I', t.replace(/G7([36])/g, 'G27$1').replace(/G87/g, 'G287'), { millturn: true });
  assert.strictEqual(ri.moves.length, r.moves.length);
});
ok('gcode: the lathe EIA manual\'s G71 / G72 / G73 + G70 sample programs reach their finished shapes', () => {
  const lf = require('./datapaths.js').fixture('lathe_eia_samples.json');
  if (!lf || !fs.existsSync(lf)) return;
  const S = JSON.parse(fs.readFileSync(lf, 'utf8'));
  const want = [[60, -110], [35, -80], [50, -90]];             // smallest diameter and deepest Z of each drawing
  S.forEach((b, k) => {
    const r = G.run('S' + k, b.join('\n') + '\n', { lathe: true }), f = r.moves.filter(m => m.kind === 'feed');
    const xs = f.flatMap(m => m.pts.map(q => q[0] * 2)), zs = f.flatMap(m => m.pts.map(q => q[2]));
    assert.ok(Math.abs(Math.min(...xs) - want[k][0]) < 1e-6 && Math.abs(Math.min(...zs) - want[k][1]) < 1e-6, k + ': ' + Math.min(...xs) + ' ' + Math.min(...zs));
  });
});
ok('paths: lathe milling units (face holes, taps, slots, circle milling) are drawn with sane times; LEAD read as shown', () => {
  const f = kp('samplemazak/cnc/LATHE SMOOTHG/BB-87-0.PBP');
  if (!fs.existsSync(f)) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'x.PBP'), ls = Maz.lines(p), us = Maz.structure(p, ls);
  const r = Paths.program(p, 'inch', ls), tm = G.times(r.moves, { units: 'inch', accel: 80 }), by = {};
  r.moves.forEach((m, i) => { const n = Maz.number(p.recs[us[m.unit].i]); by[n] = (by[n] || 0) + tm.each[i]; });
  for (const n of [9, 18, 21, 23]) assert.ok(by[n] > 1 && by[n] < 600, n + ': ' + by[n]);
  assert.ok(!by[22] && !by[15] && !by[16], 'UNo 15, 16 and 22 are under CONTROL OUT in this program: the control does not run or time them');
  assert.ok(by[17] > 15 && by[17] < 60, 'thread 17 at lead 0.087: ' + by[17]);
});
ok('gcode: G68.2 tilted frame and G12.1 polar interpolation are drawn', () => {
  let r = G.run('T', 'G90 G0 X0 Y0 Z0\nG68.2 X10. Y0 Z0 I0 J90. K0\nG0 X0 Y0 Z5.\nG1 Z0 F100\nX5.\nG69\nM30\n', {});
  const end = r.moves[r.moves.length - 1].pts[1];
  assert.ok(Math.abs(end[0] - 15) < 1e-6 && !r.notes.length, JSON.stringify(end) + r.notes.join());
  r = G.run('P', 'G18 G0 X40. Z0 C0\nG12.1\nG1 X20. C0 F0.1\nC10.\nX-20.\nC-10.\nG13.1\nM30\n', { millturn: true });
  const ys = r.moves.flatMap(m => m.pts.map(q => q[1]));
  assert.ok(Math.max(...ys) === 10 && Math.min(...ys) === -10, JSON.stringify(ys));
});
ok('mill-turn C-axis FACE holes (0x1c0) and shapes (0x1c1) in face X-Y, polar and x / y', () => {
  const rec = (code, at) => { const r = new Uint8Array(Maz.REC); r[0] = code & 0xff; r[1] = code >> 8; for (const [o, v] of at) Buffer.from(r.buffer).writeInt32LE(v, o); return r; };
  const L1 = r => Maz.at('SmoothE', r, 0x20), pts = r => Plot.holes(Plot.faceRec(r, L1(r), 'inch'), (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) * 1e-5);
  // CIR as R and angle: 4 holes round the C axis at R2, from 30 degrees
  const cir = rec(0x1c0, [[4, 0x1886], [36, -100000], [40, 200000], [44, 300000]]); cir[8] = 5; cir[20] = 4;
  const h = pts(cir);
  assert.strictEqual(h.length, 4);
  assert.ok(near(h[0][0], 2 * Math.cos(Math.PI / 6), 1e-4) && near(h[0][1], 1, 1e-4) && near(h[1][0], -1, 1e-4), JSON.stringify(h));
  assert.ok(h.every(q => near(Math.hypot(q[0], q[1]), 2, 1e-4)));
  // PT as x and y (byte 14 = 3)
  const pt = rec(0x1c0, [[4, 0x1806], [36, 300000], [40, -50000], [44, 70000]]); pt[8] = 1; pt[14] = 3;
  assert.ok(/^x/.test(Maz.cellText(L1(pt), L1(pt).lay.cells.findIndex(c => c[0] === 40), { units: 'inch' }).trim()), 'x/y mode');
  assert.deepStrictEqual(pts(pt).map(q => q.map(v => +v.toFixed(4))), [[-0.5, 0.7]]);
  // a square on the face by two corners (x / y)
  const sq = rec(0x1c1, [[4, 0x1e], [36, -40000], [40, -40000], [44, 40000], [48, 40000]]); sq[8] = 0x10; sq[14] = 0x0f;
  const m = Plot.faceRec(sq, Maz.at('SmoothE', sq, 0x44), 'inch');
  assert.strictEqual(m[0], 0xc1);
  assert.ok([36, 40, 44, 48].every((o, k) => Buffer.from(m.buffer).readInt32LE(o) === [-40000, -40000, 40000, 40000][k]));
});
ok('SLOT: the stock top is at Z0 at the highest, so an SRV-Z larger than DEPTH adds no Z level (PRG-D-OP1 UNo 35: 3 levels of 0.79, not 4)', () => {
  const R = kp('MAZATROL/Smooth/MCH-C1/MC_Machine Programs/'), f = fs.existsSync(R) ? fs.readdirSync(R).find(x => /^PRG-D-OP1\./i.test(x)) : null;
  if (!f) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(R + f)), f), ls = Maz.lines(p), us = Maz.structure(p, ls);
  const ui = us.findIndex(u => Maz.number(p.recs[u.i]) === 35), r = Paths.program(p, 'inch', ls);
  const zs = new Set(r.moves.filter(m => m.unit === ui && m.kind === 'feed' && m.pts.length === 2 && m.pts[0][0] === m.pts[1][0] && m.pts[0][1] === m.pts[1][1]).map(m => +m.pts[1][2].toFixed(2)));
  assert.ok(zs.size <= 4 && zs.size >= 3 && ![...zs].some(z => z > 0), [...zs].join(' '));
});
ok('MANL PRG: the blocks are timed at their own S (rpm) and F (per revolution), as the control times them (PRG-D-OP1 UNo 25: 113 s)', () => {
  const R = kp('MAZATROL/Smooth/MCH-C1/MC_Machine Programs/'), f = fs.existsSync(R) ? fs.readdirSync(R).find(x => /^PRG-D-OP1\./i.test(x)) : null;
  if (!f) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(R + f)), f), ls = Maz.lines(p), us = Maz.structure(p, ls);
  const ui = us.findIndex(u => Maz.number(p.recs[u.i]) === 25), r = Paths.program(p, 'inch', ls), tm = G.times(r.moves, { units: 'inch', accel: 80 });
  let s = 0; r.moves.forEach((m, k) => { if (m.unit === ui) s += tm.each[k]; });
  assert.ok(s > 95 && s < 130, s.toFixed(0) + ' s, the control gives 113');
});
ok('open line, cut along a side: it runs on past its ends by the clearance, not by the cutter radius (a 2 in cutter, a 0.5 in line)', () => {
  const R = kp('MAZATROL/Smooth/MCH-C1/MC_Machine Programs/'), f = fs.existsSync(R) ? fs.readdirSync(R).find(x => /^PRG-C-OP3\./i.test(x)) : null;
  if (!f) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(R + f)), f), ls = Maz.lines(p), us = Maz.structure(p, ls);
  const ui = us.findIndex(u => Maz.number(p.recs[u.i]) === 6), r = Paths.program(p, 'inch', ls);
  const feed = r.moves.filter(m => m.unit === ui && m.kind === 'feed'), levels = new Set(feed.map(m => +m.pts[m.pts.length - 1][2].toFixed(3))).size;
  let len = 0; for (const m of feed) for (let i = 1; i < m.pts.length; i++) len += Math.hypot(...m.pts[i].map((v, k) => v - m.pts[i - 1][k]));
  assert.ok(levels >= 15 && len / levels < 2.0, levels + ' levels, ' + (len / levels).toFixed(2) + ' in of feed per level (the line is 0.5 in)');
});
ok('chamfer laps: TPC-P\'s CHMF OUT (size 0.15, WID-R 0.1) cuts three laps at one depth, as the control\'s PATH STEP showed', () => {
  const f = require('./datapaths.js').CHAT + '/EXTRA-19.MAZ';
  if (!fs.existsSync(f)) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'S.MAZ'), ls = Maz.lines(p), us = Maz.structure(p, ls);
  const ui = us.findIndex(u => Maz.number(p.recs[u.i]) === 9), r = Paths.program(p, 'inch', ls);
  const feed = r.moves.filter(m => m.unit === ui && m.kind === 'feed');
  let len = 0; for (const m of feed) for (let i = 1; i < m.pts.length; i++) len += Math.hypot(...m.pts[i].map((v, k) => v - m.pts[i - 1][k]));
  const lap = 2 * Math.PI * 2.2;
  assert.ok(len > 2.8 * lap && len < 3.8 * lap, 'feed length ' + len.toFixed(1) + ' in = ' + (len / lap).toFixed(2) + ' laps');
  assert.strictEqual(new Set(feed.map(m => +m.pts[m.pts.length - 1][2].toFixed(3))).size, 1, 'one depth');
});
ok('MMS: a probe unit takes the control\'s time for what it measures (Paths.MMS_BY); seconds entered replace it', () => {
  const f = kp('DIR-A/NUM-A/PRG-K.PBM');
  if (!fs.existsSync(f)) return;
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), 'PRG-K.PBM'), ls = Maz.lines(p), us = Maz.structure(p, ls);
  const probe = u => u.seqs.map(i => { const L = ls[i], k = L.lay ? L.lay.cells.findIndex((c, j) => Maz.cellLabel(L.lay, j) === 'PTN') : -1; return L.sel.code === 0xa2 && k >= 0 ? Maz.cellText(L, k, {}).trim() : null; }).filter(Boolean);
  const unitTime = (opts, ui) => { const r = Paths.program(p, 'inch', ls, undefined, { fixed: opts }), tm = G.times(r.moves, { units: 'inch', accel: 80 }); let s = 0; r.moves.forEach((m, k) => { if (m.unit === ui) s += tm.each[k]; }); return s; };
  const by = { mms: 3.5, index: 2.2, pallet: 10.3, mcode: 1.6, mmsBy: Paths.MMS_BY }, flat = { mms: 3.5, index: 2.2, pallet: 10.3, mcode: 1.6 };
  let seen = 0;
  us.forEach((u, ui) => {
    if (u.code !== 8 || seen > 4) return;
    const lines = probe(u); if (!lines.length || !lines.every(l => Paths.MMS_BY[l])) return;
    seen++;
    const want = lines.reduce((a, l) => a + Paths.MMS_BY[l], 0);
    assert.ok(near(unitTime(by, ui), want, 1.5), 'UNo ' + Maz.number(p.recs[u.i]) + ' ' + lines.join('+') + ': ' + unitTime(by, ui) + ' want about ' + want);
    assert.ok(near(unitTime(flat, ui), 3.5 * lines.length, 1.5), 'seconds entered: every line takes them');
  });
  assert.ok(seen >= 2, 'probe units to test on');
});
ok('run order: the same as the control\'s (its cutest records are in run order) for most programs of the two horizontals', () => {
  const R = kp('MAZATROL/Smooth/'), machines = ['MCH-C1', 'MCH-C2'].filter(m => fs.existsSync(require('./datapaths.js').machine(m) + '/MC_sdg/cutest'));
  if (!machines.length) return;
  const ebd = f => { const b = fs.readFileSync(f), n = b.readUInt32LE(0), out = []; for (let i = 0; i < n && 16 + 96 * (i + 1) <= b.length; i++) out.push({ uno: b.readUInt16LE(16 + 96 * i + 68), code: b.readUInt16LE(16 + 96 * i + 70) }); return out; };
  let same = 0, diff = 0;
  for (const m of machines) {
    const pd = require('./datapaths.js').machine(m) + '/MC_Machine Programs/', progs = {};
    for (const f of fs.readdirSync(pd)) progs[f.replace(/\.[^.]+$/, '').toUpperCase()] = f;
    for (const f of fs.readdirSync(require('./datapaths.js').machine(m) + '/MC_sdg/cutest')) {
      const name = f.replace(/\.[^.]+$/, '').toUpperCase(), pf = progs[name];
      if (!pf) continue;
      let recs, p;
      try { recs = ebd(require('./datapaths.js').machine(m) + '/MC_sdg/cutest/' + f); p = Maz.parse(new Uint8Array(fs.readFileSync(pd + pf)), pf); } catch (e) { continue; }
      const ls = Maz.lines(p), us = Maz.structure(p, ls), by = {};
      us.forEach(u => { by[Maz.number(p.recs[u.i])] = u; });
      const good = recs.filter(x => by[x.uno] && by[x.uno].code === x.code);
      if (!good.length || recs.length - good.length > good.length * 0.2) continue;       // another version of the program is on the machine
      const ed = (Paths.program(p, 'inch', ls).runs || []).map(x => Maz.number(p.recs[us[x.unit].i])), cs = new Set(good.map(x => x.uno));
      const ctl = good.map(x => x.uno).filter(n => new Set(ed).has(n)), e1 = ed.filter(n => cs.has(n));
      if (!ctl.length) continue;
      if (ctl.join() === e1.join()) same++; else diff++;
    }
  }
  assert.ok(same >= 20 && same >= 0.8 * (same + diff), same + ' programs in the same order, ' + diff + ' different');
});
ok('control out: a controlled-out unit is not run (no moves), not timed, not checked', () => {
  const C = require('../src/checks.js');
  const p = Maz.parse(new Uint8Array(fs.readFileSync(kp('samplemazak/cnc/MILL SMOOHG', fs.readdirSync(kp('samplemazak/cnc/MILL SMOOHG')).filter(f => /\.PBM$/i.test(f)).sort().find(f => { const q = Maz.parse(new Uint8Array(fs.readFileSync(kp('samplemazak/cnc/MILL SMOOHG', f))), f); return Paths.program(q, 'inch').moves.length > 50; })))), 'X.PBM');
  const ls = Maz.lines(p), us = Maz.structure(p, ls), all = Paths.program(p, 'inch', ls);
  const cut = us.findIndex((u, ui) => all.moves.some(m => m.unit === ui && m.kind === 'feed'));
  assert.ok(cut >= 0, 'a unit that cuts');
  const rec = p.recs[us[cut].i]; Maz.setControlOut(rec, true);
  const out = Paths.program(p, 'inch', Maz.lines(p));
  assert.ok(!out.moves.some(m => m.unit === cut), 'no moves in the unit');
  assert.ok(out.moves.length < all.moves.length && out.notes.some(n => /CONTROL OUT/.test(n)));
  assert.ok(!C.check(p, 'inch', { ls: Maz.lines(p) }).some(x => x.rec >= us[cut].i && x.rec <= (us[cut].seqs[us[cut].seqs.length - 1] || us[cut].i) && x.alarm !== 0 && x.alarm !== 647), 'nothing in it is checked');
});
ok('M-codes: M131 high-pressure through-spindle coolant on mills; EIA check warns only for codes not in the list', () => {
  const R = require('../src/reference.js'), C = require('../src/checks.js');
  assert.ok(/High-pressure through-spindle coolant/.test((R.M_FOR('mill').find(x => x[0] === 'M131') || [])[1] || ''));
  const set = new Set(R.M_FOR('mill').flatMap(x => x[0].split('/')));
  const t = C.checkEia('O1\nM131\nM187\nM30\n', { mcodes: set }).map(x => x.alarm + ' ' + x.text);
  assert.ok(t.length === 1 && /661 .*M187/.test(t[0]), JSON.stringify(t));
  for (const [ty, c] of [['lathe', 'M950'], ['lathe', 'M771'], ['millturn', 'M441']]) assert.ok(R.M_FOR(ty).some(x => x[0] === c), ty + ' ' + c);
});
ok('checks: EIA macro statements (brackets, functions, GOTO targets, WHILE / DO / END, calls)', () => {
  const C = require('../src/checks.js');
  const t = C.checkEia('O1000\n#1=SINE[30]\n#2=[#1+2\nIF[#1GT0]GOTO50\nIF[#1GEABS[#2]]GOTO10\nWHILE[#2LT5]DO1\n#2=#2+1\nEND2\nDO3\nEND3\nG65 P9010 A1.\nM98 P1000\nN10 M30\n', {}).map(x => x.text).join('\n');
  for (const want of ['SINE[ ]', 'brackets do not pair', 'GOTO 50', 'END 2 with no', 'DO 1 has no END', 'Calls programs not in this file or open here: 9010']) assert.ok(t.includes(want), want + '\n' + t);
  assert.ok(!/GEABS|DO 3|GOTO 10:|1000/.test(t.replace('O1000', '')), t);
});
ok('checks: tools in the tool data too long or too wide for the magazine', () => {
  const C = require('../src/checks.js');
  const f = PROGS_FIRST_MILL();
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), path.basename(f)), pts = Maz.programTools(p, 'inch');
  const mts = pts.map((pt, i) => ({ tno: i + 1, pocket: 80, type: pt.type, part: pt.part, sfx: pt.sfx, nomRaw: pt.nom, nomTap: pt.nom,
    dia: i === 2 ? 150e6 : 10e6, length: i === 1 ? 510e6 : 100e6 }));
  const t = C.check(p, 'inch', { mts, tools: pts }).map(x => x.text).join('\n');
  assert.ok(pts.length < 3 || /No\. 3\): ACT-D 5\.906 in is over 5\.315 in: leave the pockets next to it empty/.test(t), t);
  assert.ok(pts.length < 2 || /No\. 2\): LENGTH 20\.079 in is longer than the magazine takes/.test(t), t);
  assert.ok(!/No\. ([14-9]|\d\d)\):/.test(t), t);
});
// every Mazatrol program of the machines and samples: no errors, finite points
const PROGS = [];
(function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(MAZ|MTP|MPR|PB[DMFPEN])$/i.test(e.name)) PROGS.push(p); } })(KET);
ok('paths: ' + PROGS.length + ' Mazatrol programs work out their paths', () => {
  for (const f of PROGS) {
    let p;
    try { p = Maz.parse(new Uint8Array(fs.readFileSync(f)), path.basename(f)); } catch (e) { continue; }
    const views = Maz.CONTROLS[p.ctl].type === 'millturn' ? ['mill', 'turn'] : [undefined];
    for (const v of views) {
      const r = Paths.program(p, /-MM|-M\./.test(f) ? 'metric' : 'inch', Maz.lines(p), v);
      for (const m of r.moves) for (const q of m.pts) assert.ok(q.every(Number.isFinite), f);
      assert.ok(r.steps.length > 0 || !Maz.structure(p, Maz.lines(p)).length, f);
    }
  }
});
console.log(n + ' path tests passed' + (process.exitCode ? ' (with failures above)' : ''));
