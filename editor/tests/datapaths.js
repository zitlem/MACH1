// Where the shop's sample and customer programs live (outside the repo) and how the tests name them.
// Data roots, first match wins: MAZ_DATA, the folder beside the editor project (tests/data).
// Test code asks for the old relative names (MAZATROL/Smooth/<machine>/..., DIR-A/NUM-A/..., SLN/..., prg-i/...); this file maps
// them to the by-machine layout under Jobs (Machines/, Software/, Manuals/), so tests do not care where a folder sits.
const path = require('path'), fs = require('fs');
const KETS = [process.env.MAZ_DATA, path.join(__dirname, 'data')].filter(Boolean);
// the original MazEdit program's outputs the tests compare with (not in git): MAZ_FIXTURES or tests/fixtures
const FIXTURES = [process.env.MAZ_FIXTURES, path.join(__dirname, 'fixtures')].filter(Boolean).find(d => fs.existsSync(d)) || null;
const fixture = name => FIXTURES ? path.join(FIXTURES, name) : null;
const KET = KETS[0];
// extra test programs made on the machines (not in git): MAZ_CHAT
const CHAT = process.env.MAZ_CHAT || path.join(__dirname, 'extra');
const ALIAS = [   // longest first
  ['MAZATROL/Smooth/MCH-C1', 'Machines/MCH-C'], ['MAZATROL/Smooth', 'Machines'], ['DIR-A/NUM-A', 'Machines/MCH-K/programs'], ['DIR-A/MCH-K', 'Machines/MCH-K/cab'], ['DIR-A/Manuals', 'Manuals/Mazak manuals'],
  ['MCH-G2/MCH-G2', 'Machines/MCH-B'], ['MCH-G2/MCH-G1', 'Machines/MCH-A'], ['from-control', 'Machines/PRG-J Nexus'],
  ['prg-i-timing', 'Machines/PRG-I/prg-i-timing'], ['prg-i', 'Machines/PRG-I/prg-i'], ['MCH-D1', 'Machines/MCH-D/MCH-D1'], ['MCH-D2', 'Machines/MCH-D/MCH-D2'],
  ['samplemazak/cnc/MILL SMOOHG', 'Machines/MCH-C/Exported programs/MILL SMOOHG'], ['samplemazak/cnc/LATHE SMOOTHG', 'Machines/MCH-H/Exported programs/LATHE SMOOTHG'],
  ['samplemazak/cnc/LATHE NEXUS', 'Machines/MCH-H2/Exported programs/LATHE NEXUS'], ['samplemazak/cnc/MILL MARIX  NEXUS2', 'Machines/MCH-D/Exported programs/MILL MARIX  NEXUS2'],
  ['samplemazak/iy344', 'Machines/MCH-K/Exported programs/iy344'], ['samplemazak/oj3', 'Machines/MCH-H/Exported programs/oj3'], ['samplemazak/bb12', 'Machines/MCH-D/Exported programs/bb12'],
  ['SLN', 'Software/SLN'], ['ymw', 'Software/ymw'], ['manuals-text', 'Manuals/manuals-text'],
];
function mapped(rel) {
  for (const [o, n] of ALIAS) if (rel === o || rel.startsWith(o + '/')) return n + rel.slice(o.length);
  return rel;
}
// The horizontal mill is one folder, Machines/MCH-C (the newer backup, 2026-06). The older backup (2025-12) kept only what differs,
// in 'older snapshot 2025-12'. The tests that used the two as separate machines ('MCH-C1' and 'MCH-C2') get the old second one
// as a view: the merged folder with the older files laid over it (symlinks in the temp folder, built on first use).
const MAIN_DIR = 'MCH-C', SNAP = 'older snapshot 2025-12';
let view2 = null;
function olderView() {
  if (view2) return view2;
  const root = path.join(KETS[0], 'Machines', MAIN_DIR);
  if (!fs.existsSync(root)) return (view2 = path.join(root, '-missing-'));
  view2 = path.join(require('os').tmpdir(), 'maz-older-view');
  fs.rmSync(view2, { recursive: true, force: true });
  const link = (src, rel) => { const d = path.join(view2, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.rmSync(d, { force: true }); fs.symlinkSync(src, d); };
  const walk = (dir, rel, skip) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store' || (skip && rel === '' && e.name === SNAP)) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, skip); else link(path.join(dir, e.name), r); } };
  walk(root, '', true); walk(path.join(root, SNAP), '', false);
  return view2;
}
// folder of a machine as the tests name it
const machine = m => m === 'MCH-C2' ? olderView() : path.join(KETS[0], 'Machines', m === 'MCH-C1' ? MAIN_DIR : m);
const kp = (...a) => {
  if (path.isAbsolute(a[0])) return a[0];
  let rel = path.join(...a);
  const m2 = /^(MAZATROL\/Smooth\/)?MCH-C2(\/|$)/.exec(rel);
  if (m2) return path.join(olderView(), rel.slice(m2[0].length));
  const m = mapped(rel);
  for (const d of KETS) for (const r of [m, rel]) { const p = path.join(d, r); if (fs.existsSync(p)) return p; }
  return path.join(KETS[0], m);
};
module.exports = { machine, CHAT, KETS, KET, kp, mapped, FIXTURES, fixture };
