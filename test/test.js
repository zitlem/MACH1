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
ok('describe lists every unit of every control', () => {
  for (const c of M.controls()) assert.ok(M.describe(c).length > 20, c);
});
console.log(`readable JSON: ${same}/${total} programs and ${recSame}/${recs} records come back byte for byte`, bad.length ? '\n  e.g. ' + bad.join(', ') : '');
console.log(n + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
