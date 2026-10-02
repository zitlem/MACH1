// Programs to prove the HEM output on the machine, each as G-code (.nc) and Mazatrol Matrix (.PBD) and Smooth (.PBM):
// small, shallow (0.100 deep), 1/2" end mill, in aluminium or wax. Every one checks one thing; see
// examples/machine-check/README.md for the order and what to look for.
//
//   node examples/machine-check.js [out-folder]          (default examples/machine-check)
const fs = require('fs'), path = require('path');
const HEM = require('../lib/hem.js'), MACH1 = require('../mach1.js');

const out = path.resolve(process.argv[2] || path.join(__dirname, 'machine-check'));
fs.mkdirSync(out, { recursive: true });

// common: 1/2 3-flute end mill, aluminium, 0.100 deep, clearance 1.0, rapid plane 0.1; a light stepover and slow feed
// override so the moves are easy to watch
const common = {
  toolD: '0.5', flutes: '3', loc: '1', stick: '1.25', toolNo: '1', mat: 'al6061', sfmR: '600', fzR: '0.003', sfmF: '600', fzF: '0.002',
  depth: '0.1', apMax: '0', ae: '0.05', finStock: '0.01', safeZ: '1', rapidZ: '0.1', maxRpm: '8000', feedR: '30', feedF: '20', airFeed: '20',
  cool: '', mazTool: 'END MILL', mazNom: '0.5', mazSuf: 'A', mazMat: 'AL', dec: '4',
};
const circle = (cx, cy, d) => ({ closed: true, pts: [[cx - d / 2, cy, 0, d / 2], [cx + d / 2, cy, 0, d / 2]] });
const CHECKS = [
  ['MC1-ARCS', 'Flat arcs: outside profile of a 2 x 1.25 rectangle with R0.25 corners, passes around it and a finish',
    { op: 'profile', shape: 'rect', partW: '2', partH: '1.25', cornerR: '0.25', stockType: 'even', stockW: '0.15' }],
  ['MC2-HELIX', 'Helix: round pocket Ø1.25, helix down from the rapid plane (G2/G3 moving in Z), spiral out, finish',
    { op: 'pocket', pocketD: '1.25', helixD: '0.3', ramp: '2' }],
  ['MC3-OPEN', 'Open-edge pocket: 2.5 x 1.5 area open along the bottom edge, with a Ø0.6 island; comes down in the air',
    { op: 'custom', cop: 'pocket', shapes: [{ closed: true, pts: [[-1.25, -0.75, 0, 0, 1], [1.25, -0.75, 0, 0], [1.25, 0.75, 0.2, 0], [-1.25, 0.75, 0.2, 0]] }, circle(0, 0.1, 0.6)] }],
  ['MC4-TROCH', 'Trochoidal slot 0.75 wide from X-1 to X1 with a helix entry',
    { op: 'slot', x1: '-1', y1: '0', x2: '1', y2: '0', slotW: '0.75', slotEntry: 'helix' }],
  ['MC5-SPLIT', 'Unit split: a long trochoidal groove, more lines than one Matrix MANL PRG unit holds (255), so it carries on in the next',
    { op: 'custom', cop: 'path', slotW: '0.75', slotEntry: 'open', shapes: [{ closed: false, pts: [[-2.5, 0, 0, 0], [2.5, 0, 0, 0]] }] }],
];

const lines = [];
for (const [name, what, cfg] of CHECKS) {
  const r = HEM.generate({ ...common, ...cfg, fileName: name, mazName: name });
  if (r.warn.length) console.log(name + ' warnings: ' + r.warn.join(' | '));
  fs.writeFileSync(path.join(out, name + '.nc'), HEM.toGcode(r, HEM.settingsLines(r.cfg)));
  const units = {};
  for (const ctl of ['MatrixM', 'SmoothM']) {
    const M = HEM.toMazatrol({ ...r, cfg: { ...r.cfg, mazCtl: ctl } }, MACH1);
    fs.writeFileSync(path.join(out, M.fileName), Buffer.from(M.bytes()));
    units[ctl] = M.units + ' unit' + (M.units > 1 ? 's' : '') + ', ' + M.seqs + ' lines';
  }
  const helix = r.moves.some((m, i) => (m.t === 'G2' || m.t === 'G3') && r.moves[i - 1] && Math.abs(m.z - r.moves[i - 1].z) > 1e-9);
  lines.push('| ' + name + ' | ' + what + ' | ' + r.stats.minutes.toFixed(1) + ' min | ' + (helix ? 'yes' : 'no') + ' | ' + units.MatrixM + ' | ' + units.SmoothM + ' |');
  console.log('wrote ' + name + ' (.nc, .PBD, .PBM)');
}
fs.writeFileSync(path.join(out, 'programs.md'), '| Program | What it checks | Cycle | Helix | Matrix .PBD | Smooth .PBM |\n|---|---|---|---|---|---|\n' + lines.join('\n') + '\n');
console.log('wrote ' + path.join(out, 'programs.md'));
