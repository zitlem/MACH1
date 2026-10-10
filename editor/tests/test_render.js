// Differential test: core.js must print every cell exactly like MazEdit (fixtures rendered by MazEdit's
// own code in an emulator: random records for every layout block of every control, pristine blocks).
// usage: node tests/test_render.js [CTL... | tool]
const fs = require('fs');
const path = require('path');
const Maz = require('../src/core.js');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/schema.json'), 'utf8'));
Maz.useSchema(SCHEMA);
// program controls; "tool" checks the tool-data layouts instead (TD- tool data, TF- tool file)
const arg = process.argv.slice(2);
const ctls = arg[0] === 'tool' ? Object.keys(SCHEMA.controls).filter(k => /^T[DF]-/.test(k))
  : arg.length ? arg : Object.keys(Maz.CONTROLS);
let total = 0, bad = 0;
const byFmt = {};
for (const ctl of ctls) {
  const file = (require('./datapaths.js').fixture('oracle_' + ctl + '.json')) || '';
  if (!fs.existsSync(file)) continue;
  const F = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [units, cases] of Object.entries(F)) {
    for (const c of cases) {
      const rec = Uint8Array.from(Buffer.from(c.rec, 'hex'));
      const lay = Maz.blockLayout(ctl, c.block, null);
      const L = { ctl, rec, lay, sel: { code: lay.code, block: c.block, variant: null } };
      c.texts.forEach((want, i) => {
        total++;
        const cell = lay.cells[i];
        let got;
        try { got = Maz.cellText(L, i, { units, printNames: true }); } catch (e) { got = '<' + e.message + '>'; }
        want = (want || '').replace(/\s+$/, '').replace(/ø/g, '°');   // MazEdit's code-page 0xF8 is the degree sign
        if (got.trim() !== want.trim()) {
          bad++;
          const k = ctl + ' fmt ' + cell[2].toString(16);
          (byFmt[k] = byFmt[k] || []).push({ code: lay.code.toString(16), block: c.block, byte: cell[0], raw: Maz.raw(rec, cell), want, got });
        }
      });
    }
  }
}
const keys = Object.keys(byFmt).sort((a, b) => byFmt[b].length - byFmt[a].length);
for (const k of keys.slice(0, 40)) {
  const ex = byFmt[k].slice(0, 3).map(e => `[${e.code}#${e.block}@${e.byte} raw=${e.raw}] want ${JSON.stringify(e.want)} got ${JSON.stringify(e.got)}`);
  console.log(`${k}: ${byFmt[k].length} mismatches\n   ` + ex.join('\n   '));
}
console.log(`${total - bad}/${total} cells match (${(100 * (total - bad) / total).toFixed(2)}%)`);
process.exit(bad ? 1 : 0);
