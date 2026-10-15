// The EDM Probing Program Generator's sample whole job, as files to download and read:
// SAMPLE-JOB.NC (the program) and SAMPLE-JOB.json (the job, to open in the app with Open job…).
//
//   node examples/edm-sample.js [out-folder]          (default examples/edm)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'EDM Probing Program Generator.html'), 'utf8');
const box = { module: { exports: {} } };
vm.runInNewContext(/<script id="edm-lib">([\s\S]*?)<\/script>/.exec(html)[1], box);
const EDM = box.module.exports;

const out = path.resolve(process.argv[2] || path.join(__dirname, 'edm'));
fs.mkdirSync(out, { recursive: true });
const job = EDM.sampleJob();
fs.writeFileSync(path.join(out, 'SAMPLE-JOB.NC'), EDM.program(job));
fs.writeFileSync(path.join(out, 'SAMPLE-JOB.json'), JSON.stringify(Object.assign({ mach1edm: 1 }, job), null, 1) + '\n');
console.log('wrote ' + path.join(out, 'SAMPLE-JOB.NC') + ' and SAMPLE-JOB.json');
