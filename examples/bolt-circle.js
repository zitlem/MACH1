// A drilled and tapped bolt circle: CTR-DR, DRILL and TAP on a circle of holes (FIG pattern CIR).
//   node examples/bolt-circle.js [holes] [circle diameter] [--control SmoothM]
const fs = require('fs');
const MACH1 = require('../mach1.js');
const [holes = 6, dia = 4] = process.argv.slice(2).filter(a => !a.startsWith('--')).map(Number);
const control = (process.argv.find(a => a.startsWith('--control=')) || '--control=SmoothM').split('=')[1];

const p = MACH1.program({ control, name: 'BOLTCIRCLE', units: 'inch', comment: holes + ' HOLES ON ' + dia + ' BC', strict: true });
p.common({ MAT: 'AL', 'INITIAL-Z': 1 });
p.unit('WPC', { X: 0, Y: 0, Th: 0, Z: 0 });
p.unit('TAPPING', { NOM: '1/4-20', 'MAJOR-0': 0.25, PITCH: 0.05, 'TAP-DEPTH': 0.5, CHMF: 0.01 })
  .tool({ TOOL: 'CTR-DR', 'NOM-D': 0.5, 'HOLE-D': 0.25, 'C-SP': 75, FR: 0.003 })
  .tool({ TOOL: 'DRILL', 'NOM-D': 0.201, 'HOLE-D': 0.201, 'HOLE-DEP': 0.6, RGH: 'PCK2', DEPTH: 0.2, 'C-SP': 130, FR: 0.004 })
  .tool({ TOOL: 'TAP', 'NOM-D': '1/4-20', 'HOLE-D': 0.25, 'HOLE-DEP': 0.5, 'C-SP': 65, FR: 0.05 })
  .fig({ PTN: 'CIR', Z: 0, X: 0, Y: 0, AN1: 0, T1: dia / 2, M: holes });
fs.writeFileSync(p.fileName, p.save());
console.log(p.listing());
if (p.check().length) console.log('warnings:', p.check());
console.log('wrote', p.fileName);
