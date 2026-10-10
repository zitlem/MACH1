// MACH1 tests: every program in reach goes to JSON and back; building by name gives the same bytes as the editor.
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = require('../mach1.js');
// Real programs to round-trip come from outside the repository (shop programs are not kept in it): the folder in
// MACH1_PROGRAMS, or else the folder two up from here. With none found the round-trip checks are skipped, and said so.
const KET = process.env.MACH1_PROGRAMS ? path.resolve(process.env.MACH1_PROGRAMS.replace(/^~(?=$|\/)/, require('os').homedir())) : path.join(__dirname, '../..');
let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } };
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|MACH1/.test(p)) walk(p); } else if (/\.(PB[DMFPEN]|MAZ|MTP|MPR)$/i.test(e.name)) files.push(p); } })(KET);
const hex = b => Buffer.from(b).toString('hex');
let same = 0, exact = 0, total = 0, recs = 0, recSame = 0;
const bad = [];
for (const f of files) {
  let p;
  try { p = M.open(fs.readFileSync(f), path.basename(f), /-MM|-M\./i.test(f) ? 'metric' : 'inch'); } catch (e) { continue; }
  total++;
  const want = p.save();
  // exact JSON (with bytes) must give the file back unchanged
  const q = M.fromJSON(JSON.stringify(p.toJSON({ exact: true })));
  if (hex(q.save()) === hex(want) && q.fileName === p.fileName) exact++;
  // readable JSON (fields only): count records that come back byte for byte
  const r = M.fromJSON(p.toJSON());
  if (hex(r.save()) !== hex(want)) bad.push(path.basename(f) + ' file');
  const a = p.p.recs, b = r.p.recs;
  let k = 0;
  for (let i = 0; i < a.length; i++) { recs++; if (b[i] && hex(a[i]) === hex(b[i])) { recSame++; k++; } }
  if (k === a.length && a.length === b.length && hex(r.save()) === hex(want)) same++; else if (bad.length < 8) bad.push(path.basename(f) + ' ' + k + '/' + a.length);
}
if (!total) console.log('NOTE no shop programs found under ' + KET + ': the round-trip checks were skipped. Set MACH1_PROGRAMS to a folder of .PBM/.PBD/... files.');
else ok('exact JSON round trip: ' + exact + '/' + total + ' programs', () => assert.strictEqual(exact, total));
if (total) ok('readable JSON round trip: ' + same + '/' + total + ' programs', () => assert.strictEqual(same, total));

// building by name
ok('build a drilling program by field names', () => {
  const p = M.program({ control: 'SmoothM', name: 'plate 1', comment: 'test plate', strict: true });
  p.common({ MAT: 'AL', 'INITIAL-Z': 1 });
  p.unit('DRILLING', { DIA: 0.25, DEPTH: 0.5, CHMF: 0 })
    .tool({ TOOL: 'CTR-DR', 'NOM-D': 0.5, 'C-SP': 75, FR: 0.003 })
    .tool({ TOOL: 'DRILL', 'NOM-D': 0.25, 'HOLE-D': 0.25, 'HOLE-DEP': 0.5, RGH: 'PCK1', DEPTH: 0.1, 'C-SP': 60, FR: 0.004 })
    .fig({ PTN: 'PT', Z: 0, X: 1.5, Y: -2 });
  assert.strictEqual(p.fileName, 'PLATE1.PBM');
  assert.strictEqual(p.comment, 'TEST PLATE');
  const q = M.open(p.save(), p.fileName), L = q.listing();
  assert.ok(/DRILLING\s+0\.25\s+0\.5/.test(L) && /CTR-DR 0\.5/.test(L) && /DRILL\s+0\.25\s+0\.25\s+0\.5\s+PCK1/.test(L) && /PT\s+0\.\s+1\.5\s+-2\./.test(L), L);
  const r = q.p.recs[4];                                            // the FIG line: X 1.5 in at byte 40, Y -2 at 44
  assert.strictEqual(Buffer.from(r).readInt32LE(40), 150000);
  assert.strictEqual(Buffer.from(r).readInt32LE(44), -200000);
});
ok('MANL PRG blocks from words', () => {
  const p = M.program({ control: 'MatrixM', name: 'M', strict: true });
  p.unit('MANL PRG', { TOOL: 'CHAMFER', 'NOM-DIA': 0.25 }).block({ G: [0, 90], X: 4.1923, Y: 4.6883, S: 2500, M: 3 }).block({ G: [1, 94], Z: -0.01, F: 7 }).block({ G: 2, X: 1, Y: 1, I: 0.5, J: 0 });
  const t = p.listing();
  assert.ok(/0\s+90 X 4\.1923\s+Y 4\.6883.*2500\.? +M3/.test(t) && /1\s+94 Z -0\.01\s+F 7\./.test(t) && /2\s+X 1\.\s+Y 1\.\s+I 0\.5\s+J 0\./.test(t), t);
});
ok('unknown fields and bad values are reported (and thrown in strict mode)', () => {
  const p = M.program({ control: 'SmoothM' });
  p.unit('DRILLING', { DIA: 'abc', NOPE: 1 });
  assert.strictEqual(p.warnings.length, 2, p.warnings.join('; '));
  assert.throws(() => M.program({ control: 'SmoothM', strict: true }).unit('DRILLING', { NOPE: 1 }), /no field "NOPE"/);
  assert.throws(() => M.program({ control: 'SmoothM' }).unit('BAR', {}), /No unit "BAR"/);
});
ok('hand-written JSON', () => {
  const p = M.fromJSON({ control: 'MatrixT', name: 'SHAFT', program: [
    { unit: 'COMMON', fields: { 'OD-MAX': 2, LENGTH: 3, 'WORK-FACE': 0.05 } },
    { unit: 'BAR', fields: { PART: 'OUT', 'CPT-X': 2, 'CPT-Z': 0, 'FIN-X': 0.01, 'FIN-Z': 0.005 }, lines: [
      { line: 'TOOL', fields: { TOOL: 'GNL', 'TOOL#2': 'OUT', 'NOM.': 4, 'DEP-1': 0.05, 'C-SP': 500, FR: 0.01 } },
      { line: 'SHAPE', fields: { PTN: 'LIN', 'FPT-X': 1.5, 'FPT-Z': 2 } }] }] }, { strict: true });
  const t = p.listing();
  assert.ok(/BAR\s+OUT\s+2\.\s+0\./.test(t) && /LIN .*1\.5\s+2\./.test(t) && /END/.test(t), t);
});
ok('lathe face milling shapes MazEdit has no layout for: XY and XC lines, XC pattern', () => {
  const Maz = M.core, rec = (code, at) => { const r = new Uint8Array(Maz.REC); r[0] = code & 0xff; r[1] = code >> 8; for (const [o, v] of at) Buffer.from(r.buffer).writeInt32LE(v, o); return r; };
  const show = L => Object.fromEntries(L.lay.cells.map((c, k) => [Maz.cellLabel(L.lay, k), Maz.cellText(L, k, { units: 'inch' }).trim()]));
  // XY line (LINE LFT, MODE XY): X at 40, Y at 44, SHIFT-Z at 68 (entered bits 0x40, 0x80, 0x100)
  const xy = rec(0x2cb, [[4, 0x1c1], [40, 50000], [44, -120000], [68, 20000]]); xy[8] = 0x20; xy[12] = 1;
  let L = Maz.at('SmoothT', xy, 0x42), f = show(L);
  assert.ok(L.sel.inferred && f.X === '0.5' && f.Y === '-1.2' && f['SHIFT-Z'] === '0.2', JSON.stringify(f));
  // XC line: X (radius) and C
  const xc = rec(0x2c9, [[4, 0x1c1], [40, 100000], [44, 450000], [68, 10000]]); xc[8] = 0x20; xc[12] = 1;
  f = show(Maz.at('SmoothT', xc, 0x40));
  assert.ok(f.X === '1.' && f.C === '45.' && f['SHIFT-Z'] === '0.1', JSON.stringify(f));
  // XC pattern: a circle on the face, centre X / C, radius, at SHIFT-Z
  const pc = rec(0x2c1, [[4, 0x3a1], [44, 30000], [68, 200000]]); pc[8] = 0x11;
  f = show(Maz.at('SmoothT', pc, 0x53));
  assert.ok(f['P1C/CC'] === '0.' && f['P3X/R'] === '0.3' && f['SHIFT-Z'] === '2.', JSON.stringify(f));
});
ok('SLOT tool line names over their own columns (lathes: NOM-D, C-SP, FR were read off the mill heading)', () => {
  for (const ctl of ['SmoothT', 'MatrixT', 'SmoothM', 'MatrixM', 'SmoothE']) {
    const slot = M.describe(ctl).find(u => u.unit === 'SLOT'), tool = slot && slot.lines.find(l => l.code === 0xb2);
    assert.ok(tool, ctl);
    const f = tool.fields;
    for (const n of ['NOM-D', 'No', 'No#2', 'APRCH-X', 'APRCH-Y', 'DEP-Z', 'WID-R', 'C-SP', 'FR', 'M', 'M#2', 'M#3']) assert.ok(f.includes(n), ctl + ' ' + n + ': ' + f.join(', '));
    assert.ok(f.indexOf('C-SP') < f.indexOf('FR') && f.indexOf('FR') < f.indexOf('M'), ctl + ': ' + f.join(', '));
  }
});
ok('control out is byte 87 of a unit record (Smooth programs; not the common unit or END)', () => {
  const p = M.program({ control: 'SmoothM', name: 'CO', strict: true });
  p.common({ MAT: 'AL', 'INITIAL-Z': 1 });
  p.unit('DRILLING', { DIA: 0.25, DEPTH: 0.5 }).tool({ TOOL: 'DRILL', 'NOM-D': 0.25, 'C-SP': 60, FR: 0.004 }).fig({ PTN: 'PT', Z: 0, X: 1, Y: 1 });
  const Maz = M.core, q = M.open(p.save(), p.fileName), ls = Maz.lines(q.p), us = Maz.structure(q.p, ls);
  const drill = us.find(u => u.code === 0x20), common = us.find(u => u.code === 1), end = us.find(u => u.code === 4);
  assert.ok(Maz.canControlOut(ls[drill.i]) && !Maz.canControlOut(ls[common.i]) && !Maz.canControlOut(ls[end.i]));
  assert.ok(!Maz.controlOut(ls[drill.i]));
  const before = Buffer.from(q.p.recs[drill.i]).toString('hex');
  Maz.setControlOut(q.p.recs[drill.i], true);
  const on = Buffer.from(q.p.recs[drill.i]).toString('hex');
  assert.ok(Maz.controlOut(Maz.lines(q.p)[drill.i]));
  assert.deepStrictEqual([...Buffer.from(before, 'hex')].map((b, i) => b !== Buffer.from(on, 'hex')[i] ? i : -1).filter(i => i >= 0), [87]);   // only byte 87
  const r2 = M.open(q.save(), q.fileName);                                     // survives a save and read
  assert.ok(Maz.controlOut(Maz.lines(r2.p)[drill.i]));
  Maz.setControlOut(r2.p.recs[drill.i], false);
  assert.strictEqual(Buffer.from(r2.p.recs[drill.i]).toString('hex'), before);
  const m = M.program({ control: 'MatrixM', name: 'CM', strict: true });
  m.unit('DRILLING', { DIA: 0.25, DEPTH: 0.5 });
  const lm = Maz.lines(m.p); assert.ok(lm.every(L => !Maz.canControlOut(L)), 'a Matrix program has no such flag we know of');
});
ok('describe lists every unit of every control', () => {
  for (const c of M.controls()) assert.ok(M.describe(c).length > 20, c);
});
console.log(`readable JSON: ${same}/${total} programs and ${recSame}/${recs} records come back byte for byte`, bad.length ? '\n  e.g. ' + bad.join(', ') : '');
console.log(n + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
