// load the editor's non-UI modules from the built app into a vm context
const fs = require('fs'), vm = require('vm');
module.exports = function load(html) {
  const t = fs.readFileSync(html, 'utf8');
  const blocks = [...t.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const ctx = { console, Math, JSON, Date, Uint8Array, Int32Array, Float64Array, ArrayBuffer, DataView, TextDecoder, TextEncoder, Map, Set, Symbol, Number, String, Array, Object, Error, RegExp, isNaN, parseFloat, parseInt, Infinity, NaN, Promise, setTimeout };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  // block 0 is the theme, 1 the schema, 2.. modules, last is the UI
  vm.runInContext(blocks[1].replace(/^const SCHEMA =/, 'var SCHEMA ='), ctx);
  for (let i = 2; i < blocks.length - 1; i++) vm.runInContext(blocks[i], ctx, { filename: 'block' + i });
  ctx.Maz.useSchema(ctx.SCHEMA);
  return ctx;
};
