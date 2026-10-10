// Stress test: random typing, soft keys and clearing on every kind of field of real programs (mills,
// lathes, mill-turn). Only validation messages may be thrown; every edit must keep the program parseable,
// printable and convertible.
const fs = require('fs');
const path = require('path');
const Maz = require('../src/core.js');
Maz.useSchema(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/schema.json'), 'utf8')));
// the shop's sample and customer programs live outside the repo (see datapaths.js)
const { KETS, KET, kp } = require('./datapaths.js');
const dirs = ['samplemazak/cnc/MILL MARIX  NEXUS2', 'samplemazak/cnc/MILL SMOOHG', 'samplemazak/cnc/LATHE NEXUS',
  'samplemazak/cnc/LATHE SMOOTHG', 'SLN/Samples', '.'];
// Smooth CAM Ai machine data: every machine's own program files (.MAZ .MTP .MPR)
const MACH = kp('MAZATROL/Smooth');
if (fs.existsSync(MACH)) for (const m of fs.readdirSync(MACH)) dirs.push(path.join('MAZATROL/Smooth', m, 'MC_Machine Programs'));
const files = [];
for (const d of dirs) {
  const full = kp(d);
  if (fs.existsSync(full)) for (const f of fs.readdirSync(full)) if (/\.(PB[DMFPEN]|MAZ|MTP|MPR)$/i.test(f)) files.push(path.join(full, f));
}
let seed = 12345;
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const INPUTS = ['1', '0', '-1.5', '0.0001', '99999', 'X1.5', 'Y-2', 'Z.5', 'F100', 'M8', 'B12', 'G00', 'G01', '?', 'A', 'b', '!C',
  'TAP', 'PECK', 'PLANET', 'CCW', '*CW', 'CTR-D', 'CHAMF', 'CYCLE3', 'FIX', '0.05', '90', '118°', 'PCK2', 'DRL T', 'E-MILL', 'drill',
  '1/4-20', 'M10', '#10-24', 'PT1/8', 'G54', 'G54.1P12', 'OFF', 'ON', '*', 'OPEN', 'CLOSED', 'R', 'F', 'LINE', 'CW', 'PT', 'SQR',
  '0000000011', 'ALUMINUM', 'HELLO WORLD', '', '   ', 'abc', '1e5', '..', '-', '+3', '12345678901', 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
  'GENERAL', 'GROOVE', 'OUT', 'IN', 'EDGE', 'C1 90.', 'x1.5', 'y-2', 'R2.5', 'T.CENTER', '1->2', '[1]', '$4', 'ZC', '[XC]'];
let edits = 0, rejected = 0, crashes = 0;
const crash = (what, f, r, e) => { crashes++; console.log('CRASH', what, path.basename(f), r, e.stack.split('\n').slice(0, 3).join(' | ')); };
for (const f of files) {
  const p = Maz.parse(new Uint8Array(fs.readFileSync(f)), path.basename(f));
  for (let n = 0; n < 400; n++) {
    const ls = Maz.lines(p), r = rnd(p.recs.length), L = ls[r];
    if (!L.lay) continue;
    const cells = Maz.shownCells(L.lay);
    if (!cells.length) continue;
    const i = cells[rnd(cells.length)], units = rnd(2) ? 'inch' : 'metric';
    const q = p.recs[r].slice(), Lq = Maz.at(p.ctl, q, r ? ls[r - 1].sel.parent : 0);
    try {
      const keys = Maz.choices(Lq, i);
      const what = rnd(10);
      if (what === 0) Maz.clear(Lq, i);
      else if (what < 4 && keys.length) Maz.enter(Lq, i, keys[rnd(keys.length)], { units });
      else Maz.enter(Lq, i, INPUTS[rnd(INPUTS.length)], { units });
      p.recs[r] = q;
      edits++;
    } catch (e) {
      if (!(e instanceof Error) || /is not a function|undefined|null|Cannot read|not iterable/.test(e.message)) crash('edit', f, r, e);
      else rejected++;
    }
    try {
      const L2 = Maz.lines(p)[r];
      Maz.lineText(L2, { units });
      if (L2.lay) for (const k of Maz.shownCells(L2.lay)) { Maz.cellLabel(L2.lay, k); Maz.locked(L2, k); Maz.choices(L2, k); }
    } catch (e) { crash('display', f, r, e); }
  }
  try {
    const b = Maz.serialize(p), q = Maz.parse(b, p.name);
    if (Buffer.compare(Buffer.from(Maz.serialize(q)), Buffer.from(b))) { crashes++; console.log('CRASH roundtrip', f); }
    Maz.serialize(Maz.convert(p, Maz.counterpart(p.ctl)));
  } catch (e) { crash('save', f, -1, e); }
}
console.log(`${files.length} files, ${edits} edits applied, ${rejected} rejected with a message, ${crashes} crashes`);
process.exit(crashes ? 1 : 0);
