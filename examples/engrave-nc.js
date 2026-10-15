// Engraving G-code (.nc/.EIA) -> Mazatrol program of MANL PRG units, laid out the way the shop's engraver app
// writes it (that output has run on a Mazak): each unit starts with G0 G90 X Y S M3 and G0 G17 Z<safe>, then the
// strokes (G1 plunges with G94 and F, arcs as G2/G3 with I J). A job too long for one unit carries on in the next.
//
//   node examples/engrave-nc.js engrave.nc [--control SmoothM|MatrixM] [--tool CHAMFER] [--nom 0.25] [--suffix A]
//        [--name NAME] [--safe 0.1] [--rpm 2500] [--coolant] [--out FILE]
//
// The tool is looked up on the machine by type, NOM-D and suffix, like any Mazatrol unit: it must be in TOOL DATA.
const fs = require('fs'), path = require('path');
const MACH1 = require('../mach1.js');
const G = require('../lib/gcode.js');

const args = process.argv.slice(2), opt = {}, files = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { const k = args[i].slice(2); opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; } else files.push(args[i]); }
if (!files.length) { console.log('usage: node engrave-nc.js FILE.nc [--control SmoothM] [--tool CHAMFER] [--nom 0.25] [--suffix A] [--name NAME] [--safe 0.1] [--rpm 2500] [--coolant] [--out FILE]'); process.exit(1); }

const text = fs.readFileSync(files[0], 'latin1');
const run = G.run(path.basename(files[0]), text, {});
if (run.units === 'metric') { console.error('This is a metric (G21) program; MACH1 writes it as metric.'); }
const units = run.units === 'metric' ? 'metric' : 'inch';
const safe = +(opt.safe || (units === 'metric' ? 2.5 : 0.1));
const rpm = +(opt.rpm || run.moves.find(m => m.spindle)?.spindle || 2500);
const name = opt.name || path.basename(files[0]).replace(/\.[^.]*$/, '');
const prog = MACH1.program({ control: opt.control || 'SmoothM', name, units, comment: 'ENGRAVE ' + name, strict: true });
const room = MACH1.core.CONTROLS[prog.control].seqLimit - 4;
const tool = { TOOL: opt.tool || 'CHAMFER', 'NOM-DIA': +(opt.nom || 0.25) };
if (opt.suffix) tool['@11'] = opt.suffix;

prog.common({ 'INITIAL-Z': +(opt.initz || 1), MAT: opt.mat });
// the moves in order, arcs kept as arcs
let unit = null, lines = 0, at = null, fed = false, z = safe;
const r4 = v => Math.round(v * 1e4) / 1e4;
const newUnit = (x, y) => {
  unit = prog.unit('MANL PRG', tool);
  unit.block({ G: [0, 90], X: r4(x), Y: r4(y), S: rpm, M: 3 });
  unit.block({ G: [0, 17], Z: safe });
  lines = 2; fed = false; z = safe;
};
const add = words => {
  if (lines >= room) {                    // full: lift, and start the next unit over the same point
    unit.block({ G: 0, Z: safe });
    newUnit(at[0], at[1]);
    if (at[2] < safe) { unit.block({ G: [1, 94], Z: r4(at[2]), F: words.F || 7 }); lines++; }
  }
  unit.block(words); lines++;
  if (words.Z !== undefined) z = words.Z;
};
for (const m of run.moves) {
  if (m.kind === 'dwell') continue;
  const [a, b] = [m.pts[0], m.pts[m.pts.length - 1]];
  const zOnly = b[0] === a[0] && b[1] === a[1];
  if (!unit) {                           // the first unit starts over the first point the program goes to
    at = b;
    if (m.kind === 'rapid' && zOnly) continue;
    newUnit(m.kind === 'rapid' ? b[0] : a[0], m.kind === 'rapid' ? b[1] : a[1]);
    if (m.kind === 'rapid') continue;
  }
  if (m.kind === 'rapid') {
    if (zOnly) { if (r4(b[2]) !== z) add({ G: 0, Z: r4(b[2]) }); }
    else add({ G: 0, X: r4(b[0]), Y: r4(b[1]) });
  } else if (m.arc && m.plane === 17) {
    const w = { G: m.cw ? 2 : 3, X: r4(b[0]), Y: r4(b[1]), I: r4(m.center[0] - a[0]), J: r4(m.center[1] - a[1]) };
    if (b[2] !== a[2]) w.Z = r4(b[2]);
    add(w);
  } else if (b[0] === a[0] && b[1] === a[1]) {
    const w = { G: [1, 94], Z: r4(b[2]), F: m.feed };
    if (!fed && opt.coolant) { w.S = rpm; w.M = 8; }
    fed = true;
    add(w);
  } else add({ G: 1, X: r4(b[0]), Y: r4(b[1]), ...(b[2] !== a[2] ? { Z: r4(b[2]) } : {}), F: m.feed });
  at = b;
}
if (unit && z !== safe) unit.block({ G: 0, Z: safe });
const out = opt.out || prog.fileName;
fs.writeFileSync(out, prog.save());
console.log(`wrote ${out}: ${prog.structure().length - 2} MANL PRG units` + (run.notes.length ? '\nnotes: ' + run.notes.join('; ') : ''));
