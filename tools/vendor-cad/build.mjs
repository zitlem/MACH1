// Bundles the third-party code the CAD app inlines, into ../../vendor/cad:
//   three.iife.js    three.js and the addons the app uses, as window.THREE (classic script, no modules)
//   kernel.iife.js   replicad + its OpenCascade build, as self.MACH1_KERNEL = { init, replicad } (for a worker)
//   dwg.iife.js      LibreDWG's reader (libredwg-web), as self.MACH1_DWG = { createModule, LibreDwg } (for a worker)
//   pdf.iife.js      pdf.js with its worker code run in the page (no worker file), as self.MACH1_PDF
//   iges.js          occt-import-js as it ships (a classic script: self.occtimportjs), for IGES files
//   *.wasm.gz        the WebAssembly, gzipped with no time stamp so a rebuild gives the same bytes
//   LICENSES/        each package's licence text
// usage: npm ci && node build.mjs   (needs the network once, for npm ci; the output is committed)
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../vendor/cad');
const nm = p => path.join(here, 'node_modules', p);
fs.mkdirSync(path.join(out, 'LICENSES'), { recursive: true });

// the emscripten loaders read import.meta.url to find their .wasm; the page hands the wasm over itself, so any URL
// will do, and a classic script has no import.meta
const noImportMeta = {
  name: 'no-import-meta',
  setup(b) {
    b.onLoad({ filter: /\.(m?js)$/ }, async a => {
      const src = await fs.promises.readFile(a.path, 'utf8');
      return src.includes('import.meta.url') ? { contents: src.replaceAll('import.meta.url', '"file:///mach1/"'), loader: 'js' } : undefined;
    });
  },
};
const common = { bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, legalComments: 'eof', external: ['node:*'], plugins: [noImportMeta], logLevel: 'warning' };

const entry = (name, code) => { const f = path.join(here, '.entry-' + name + '.js'); fs.writeFileSync(f, code); return f; };
await esbuild.build({
  ...common,
  entryPoints: [entry('three', `
    import * as T from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
    import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
    import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
    import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
    import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
    import { Line2 } from 'three/examples/jsm/lines/Line2.js';
    import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
    import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
    import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
    import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
    import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
    self.THREE = Object.assign({}, T, { OrbitControls, STLLoader, OBJLoader, ThreeMFLoader, STLExporter, OBJExporter, Line2, LineSegments2, LineMaterial, LineGeometry, LineSegmentsGeometry, zipSync, strToU8 });
  `)],
  outfile: path.join(out, 'three.iife.js'),
});
await esbuild.build({
  ...common,
  entryPoints: [entry('kernel', `
    import init from ${JSON.stringify(nm('replicad-opencascadejs/dist/replicad_single.js'))};
    import * as replicad from 'replicad';
    self.MACH1_KERNEL = { init, replicad };
  `)],
  outfile: path.join(out, 'kernel.iife.js'),
});
await esbuild.build({
  ...common,
  entryPoints: [entry('dwg', `
    import { LibreDwg, createModule } from ${JSON.stringify(nm('@mlightcad/libredwg-web/lib/libredwg.js'))};
    self.MACH1_DWG = { createModule, LibreDwg };
  `)],
  external: ['node:*', 'module', 'fs', 'path', 'url', 'crypto', 'worker_threads', 'os', 'util'],
  outfile: path.join(out, 'dwg.iife.js'),
});
fs.copyFileSync(nm('occt-import-js/dist/occt-import-js.js'), path.join(out, 'iges.js'));
await esbuild.build({
  ...common, target: 'es2022',
  entryPoints: [entry('pdf', `
    import * as pdfjs from ${JSON.stringify(nm('pdfjs-dist/legacy/build/pdf.mjs'))};
    import * as worker from ${JSON.stringify(nm('pdfjs-dist/legacy/build/pdf.worker.mjs'))};
    // pdf.js runs its worker code in the page when it finds it here (its "fake worker"), so no file is fetched
    globalThis.pdfjsWorker = worker;
    self.MACH1_PDF = pdfjs;
  `)],
  outfile: path.join(out, 'pdf.iife.js'),
});
for (const f of fs.readdirSync(here)) if (f.startsWith('.entry-')) fs.unlinkSync(path.join(here, f));

const gz = (src, name) => {
  const raw = fs.readFileSync(src), z = zlib.gzipSync(raw, { level: 9 });   // node writes mtime 0: the same bytes every time
  fs.writeFileSync(path.join(out, name), z);
  return [name, raw.length, z.length];
};
const sizes = [gz(nm('replicad-opencascadejs/dist/replicad_single.wasm'), 'replicad_single.wasm.gz'), gz(nm('@mlightcad/libredwg-web/wasm/libredwg-web.wasm'), 'libredwg-web.wasm.gz'), gz(nm('occt-import-js/dist/occt-import-js.wasm'), 'occt-import-js.wasm.gz')];

const lic = { 'three': 'three/LICENSE', 'replicad': 'replicad/LICENSE', 'replicad-opencascadejs': 'replicad-opencascadejs/LICENSE', 'flatbush': 'flatbush/LICENSE', 'opentype.js': 'opentype.js/LICENSE', 'occt-import-js': 'occt-import-js/LICENSE.md', 'occt-import-js-occt': 'occt-import-js/dist/license.occt.txt', 'pdfjs-dist': 'pdfjs-dist/LICENSE' };
for (const [k, f] of Object.entries(lic)) if (fs.existsSync(nm(f))) fs.copyFileSync(nm(f), path.join(out, 'LICENSES', k + '.txt'));
// libredwg-web ships no licence file: it is under the GPL v3 (its package.json), the same text as MACH1's own
fs.copyFileSync(path.resolve(here, '../../LICENSE'), path.join(out, 'LICENSES', 'libredwg-web.txt'));

const versions = {};
for (const p of ['three', 'replicad', 'replicad-opencascadejs', 'flatbush', 'opentype.js', 'occt-import-js', '@mlightcad/libredwg-web', 'pdfjs-dist', 'esbuild']) versions[p] = JSON.parse(fs.readFileSync(nm(p + '/package.json'))).version;
fs.writeFileSync(path.join(out, 'versions.json'), JSON.stringify(versions, null, 1) + '\n');
for (const f of ['three.iife.js', 'kernel.iife.js', 'dwg.iife.js', 'iges.js', 'pdf.iife.js']) sizes.push([f, fs.statSync(path.join(out, f)).size]);
for (const s of sizes) console.log(s.join('  '));
