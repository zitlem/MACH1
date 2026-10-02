// Program <-> JSON.
//   node examples/json.js PROGRAM.PBM [--units metric] [--exact] [--fields]   -> PROGRAM.json
//   node examples/json.js PROGRAM.json [--out FILE]                         -> the program file
// --fields writes only the fields (a clean template to build from; bytes the screen does not show are dropped).
const fs = require('fs'), path = require('path');
const MACH1 = require('../mach1.js');
const args = process.argv.slice(2), f = args.find(a => !a.startsWith('--')), val = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
if (!f) { console.log('usage: node json.js PROGRAM.PBM|PROGRAM.json [--units metric] [--exact] [--fields] [--out FILE]'); process.exit(1); }
if (/\.json$/i.test(f)) {
  const p = MACH1.fromJSON(fs.readFileSync(f, 'utf8'));
  const out = val('--out') || p.fileName;
  fs.writeFileSync(out, p.save());
  if (p.warnings.length) console.log('warnings:\n  ' + p.warnings.join('\n  '));
  console.log('wrote', out);
} else {
  const p = MACH1.open(fs.readFileSync(f), path.basename(f), val('--units') || 'inch');
  const out = val('--out') || f.replace(/\.[^.]*$/, '') + '.json';
  fs.writeFileSync(out, JSON.stringify(p.toJSON({ exact: args.includes('--exact'), fieldsOnly: args.includes('--fields') }), null, 1));
  console.log('wrote', out);
}
