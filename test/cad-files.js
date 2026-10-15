// Read real CAD files in place (they are never copied): every .dxf, .svg, .dwg (AutoCAD's, or a Mitsubishi EDM's), .z, .stl, .obj, .3mf, .step/.stp and
// .igs/.iges under MACH1_CAD_FILES, with the readers the page uses. Reports what came in, what was left out and how
// long it took, and fails on any file that throws or comes in empty.
// usage: MACH1_CAD_FILES=<folder> node test/cad-files.js
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const IO = require('../lib/cad-io.js'), ME = require('../lib/cad-mesh.js'), G = require('../lib/cad-geom.js');
const dir = process.env.MACH1_CAD_FILES && path.resolve(process.env.MACH1_CAD_FILES.replace(/^~(?=$|\/)/, require('os').homedir()));
if (!dir) { console.log('Set MACH1_CAD_FILES to a folder of drawings to read them in place.'); process.exit(0); }
const V = path.join(__dirname, '../vendor/cad/');
const sandbox = file => { const c = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, TextDecoder, TextEncoder, WebAssembly, URL, Blob, performance, crypto: globalThis.crypto, location: { href: 'file:///x/w.js' }, importScripts() {} }; c.self = c; c.globalThis = c; c.WorkerGlobalScope = function () {}; vm.createContext(c); for (const f of [].concat(file)) vm.runInContext(fs.readFileSync(f, 'utf8'), c); return c; };
const gunzip = f => zlib.gunzipSync(fs.readFileSync(V + f));
let kernel = null, dwg = null, iges = null;
async function getKernel() {
  if (kernel) return kernel;
  const c = sandbox([V + 'kernel.iife.js', path.join(__dirname, '../lib/cad-kernel.js')]), mod = await WebAssembly.compile(gunzip('replicad_single.wasm.gz'));
  const oc = await c.MACH1_KERNEL.init({ instantiateWasm: (imp, cb) => { WebAssembly.instantiate(mod, imp).then(i => cb(i, mod)); return {}; }, print() {}, printErr() {} });
  c.MACH1_KERNEL.replicad.setOC(oc); kernel = { K: c.CADKernel.create(c.MACH1_KERNEL.replicad), R: c.MACH1_KERNEL.replicad }; return kernel;
}
async function getDwg() { if (dwg) return dwg; const c = sandbox(V + 'dwg.iife.js'), inst = await c.MACH1_DWG.createModule({ wasmBinary: gunzip('libredwg-web.wasm.gz'), print() {}, printErr() {} }); dwg = c.MACH1_DWG.LibreDwg.createByWasmInstance(inst); return dwg; }
async function getIges() { if (iges) return iges; const c = sandbox(V + 'iges.js'); iges = await c.occtimportjs({ wasmBinary: gunzip('occt-import-js.wasm.gz'), print() {}, printErr() {} }); return iges; }
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(dxf|svg|dwg|z|stl|obj|3mf|step|stp|igs|iges)$/i.test(e.name)) files.push(f); } })(dir);
(async () => {
  let bad = 0;
  for (const f of files) {
    const x = path.extname(f).slice(1).toLowerCase(), t = Date.now(); let what = '', skipped = {};
    try {
      if (x === 'dxf' || x === 'svg' || x === 'dwg' || x === 'z') {
        let r;
        // as the page does: what the file holds decides (a Mitsubishi EDM's ".dwg" is its own drawing, often compressed)
        let raw = new Uint8Array(fs.readFileSync(f)); if (IO.isCompressed(raw)) raw = IO.unlzw(raw);
        const kind = x === 'svg' ? 'svg' : IO.sniff(raw);
        if (kind === 'mswin') { const peek = IO.readMSWIN(raw, 'in'), u = peek.extent > 12 ? 'mm' : 'in'; r = IO.readMSWIN(raw, u); r.notes.push('Units guessed: ' + u + '.'); }
        else if (kind === 'dxf') r = IO.readDXF(new TextDecoder().decode(raw), 'auto');
        else if (x === 'dwg' && kind !== 'dwg') throw new Error('neither an AutoCAD DWG nor a drawing this page reads');
        else if (x === 'dwg') { const D = await getDwg(), b = fs.readFileSync(f), d = D.dwg_read_data(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), 0); if (d == null) throw new Error('LibreDWG could not read it'); const db = D.convert(d); D.dwg_free(d); r = IO.readDXF(IO.dwgToDXF({ header: db.header, layers: db.tables.LAYER.entries, blocks: db.tables.BLOCK_RECORD.entries, entities: db.entities }), 'auto'); }
        else r = x === 'svg' ? IO.readSVG(fs.readFileSync(f, 'utf8')) : IO.readDXF(fs.readFileSync(f, 'utf8'), 'auto');
        if (!r.ents.length) throw new Error('nothing came in');
        const kinds = {}; for (const e of r.ents) kinds[e.g.t] = (kinds[e.g.t] || 0) + 1;
        const box = r.ents.map(e => G.bbox(e.g)).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
        if (!box.every(isFinite)) throw new Error('the extents are not finite');
        what = r.ents.length + ' entities ' + JSON.stringify(kinds) + ', ' + r.levels.length + ' levels, ' + r.units + ', ' + (box[2] - box[0]).toFixed(2) + ' × ' + (box[3] - box[1]).toFixed(2) + ' in'; skipped = r.skipped;
      } else if (x === 'stl' || x === 'obj' || x === '3mf') {
        const m = x === '3mf' ? await ME.read3MF(fs.readFileSync(f), raw => zlib.inflateRawSync(raw)) : x === 'stl' ? ME.readSTL(fs.readFileSync(f), 'mm') : ME.readOBJ(fs.readFileSync(f, 'utf8'), 'mm');
        const I = ME.info(m); if (!I.tris || !I.size.every(isFinite)) throw new Error('no triangles');
        what = I.tris + ' triangles, ' + I.size.map(v => v.toFixed(3)).join(' × ') + ' in' + (x !== '3mf' ? ' (as mm)' : '') + (I.closed ? ', closed' : ', open');
      } else if (x === 'step' || x === 'stp') {
        const { K, R } = await getKernel(), s = await K.readSTEP(fs.readFileSync(f, 'utf8')), b = s.boundingBox.bounds;
        what = 'solid, ' + R.measureVolume(s).toFixed(4) + ' in³, ' + [0, 1, 2].map(k => (b[1][k] - b[0][k]).toFixed(3)).join(' × ') + ' in';
      } else {
        const r = (await getIges()).ReadIgesFile(new Uint8Array(fs.readFileSync(f)), { linearUnit: 'inch' });
        if (!r.success || !r.meshes.length) throw new Error('no surfaces or solids');
        what = r.meshes.length + ' bodies, ' + r.meshes.reduce((a, m) => a + m.index.array.length / 3, 0) + ' triangles';
      }
      const sk = Object.entries(skipped).map(([k, v]) => v + ' ' + k).join(', ');
      console.log('ok  ', path.relative(dir, f), '·', what, sk ? '· not read: ' + sk : '', '·', Date.now() - t, 'ms');
    } catch (e) { bad++; console.log('FAIL', path.relative(dir, f), '·', e.message); }
  }
  console.log(files.length + ' files, ' + (files.length - bad) + ' read' + (bad ? ', ' + bad + ' failed' : ''));
  process.exitCode = bad ? 1 : 0;
})();
