// Preload for the tests: node -r ./names.js test_core.js
// The test sources name shop programs by neutral aliases (PRG-A ...). The real names live in names.local.json (not in git);
// this swaps them back into the test sources as they load. Without that file the tests simply do not find those programs.
const fs = require('fs'), path = require('path'), Module = require('module');
let map = {};
try { map = JSON.parse(fs.readFileSync(path.join(__dirname, 'names.local.json'), 'utf8')); } catch (e) {}
for (const [k, v] of Object.entries(map._env || {})) if (!process.env[k]) process.env[k] = v;   // MAZ_DATA, MAZ_FIXTURES, MAZ_CHAT
delete map._env;
const keys = Object.keys(map).sort((a, b) => b.length - a.length);
const orig = Module.prototype._compile;
Module.prototype._compile = function (src, file) {
  if (keys.length && [__dirname, path.join(__dirname, '..', 'tools')].includes(path.dirname(file))) for (const k of keys) src = src.split(k).join(map[k]);
  return orig.call(this, src, file);
};
