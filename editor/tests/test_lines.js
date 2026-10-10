// Whole print lines against MazEdit's own output (rendered by MazEdit's code in an emulator) for the
// SLN samples and, when present, the shop's programs. Our line adds the UNo/SNo and unit name, which
// MazEdit prints elsewhere; every character MazEdit draws must match.
// usage: node tests/test_lines.js [fixture.json ...]   (default: fixtures/print_lines*.json)
const fs = require('fs');
const path = require('path');
const Maz = require('../src/core.js');
Maz.useSchema(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/schema.json'), 'utf8')));
// the shop's sample and customer programs live outside the repo (see datapaths.js)
const { KETS, KET, kp } = require('./datapaths.js');
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : (require('./datapaths.js').FIXTURES ? fs.readdirSync(require('./datapaths.js').FIXTURES).filter(f => /^print_lines.*\.json$/.test(f)).map(f => path.join(require('./datapaths.js').FIXTURES, f)) : []);
let lines = 0, bad = 0;
const byCell = {};
for (const fx of files) {
  for (const [f, v] of Object.entries(JSON.parse(fs.readFileSync(fx, 'utf8')))) {
    const full = path.isAbsolute(f) ? f : kp(f);
    if (!fs.existsSync(full)) continue;
    const p = Maz.parse(new Uint8Array(fs.readFileSync(full)), path.basename(f));
    const ctx = Maz.lines(p);
    v.lines.forEach((want, k) => {
      if (want === null) return;                   // MazEdit has no layout for it either
      lines++;
      const Lr = ctx[k], L = Maz.printLine(Lr, { units: v.units }), got = L.ch.join('');
      const c = Lr.sel.code;
      for (let x = 0; x < Math.max(want.length, got.trimEnd().length); x++) {
        const w = want[x] || ' ', g = got[x] || ' ';
        const ours = L.own[x] >= 0 || w !== ' ';
        if ((w !== ' ' && w !== g) || (w === ' ' && g !== ' ' && ours)) {
          bad++;
          const own = L.own[x] >= 0 ? L.own[x] : (() => { for (let y = x; y >= 0; y--) if (L.own[y] >= 0) return L.own[y]; return -1; })();
          const lay = Lr.lay;
          const key = p.ctl + ' ' + c.toString(16) + ' cell ' + own + (lay && own >= 0 ? ' fmt ' + lay.cells[own][2].toString(16) : '');
          (byCell[key] = byCell[key] || []).push(`${path.basename(f)}#${k}\n      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got.trimEnd())}`);
          break;
        }
      }
    });
  }
}
for (const [k, v] of Object.entries(byCell).sort((a, b) => b[1].length - a[1].length)) console.log(`${k}: ${v.length} lines\n   ${v.slice(0, 2).join('\n   ')}`);
console.log(`${lines - bad}/${lines} lines match MazEdit`);
process.exit(bad ? 1 : 0);
