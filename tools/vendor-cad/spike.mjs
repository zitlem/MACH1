// M0 spike: one offline page with three.js, the kernel in a Blob worker and the wasm inlined as gzip+base64.
// Builds a box with a hole, fillets its vertical edges, shows it, and offers its STEP. Not part of the app.
// usage: node spike.mjs <out.html>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), v = path.resolve(here, '../../vendor/cad');
const rd = f => fs.readFileSync(path.join(v, f));
const safe = s => { if (/<\/script|<!--/i.test(s)) throw new Error('script text would end the tag early'); return s; };
const worker = `
self.onmessage = async e => {
  const t0 = performance.now(), log = [];
  try {
    const res = await fetch('data:application/gzip;base64,' + e.data.wasm);
    const bin = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const t1 = performance.now(), mod = await WebAssembly.compile(bin), t2 = performance.now();
    const oc = await MACH1_KERNEL.init({ instantiateWasm: (imp, cb) => { WebAssembly.instantiate(mod, imp).then(i => cb(i, mod)); return {}; }, print: () => {}, printErr: () => {} });
    const t3 = performance.now(), R = MACH1_KERNEL.replicad; R.setOC(oc);
    const s = R.makeBaseBox(2, 1, 0.5).cut(R.makeCylinder(0.125, 2, [0, 0, -0.5])).fillet(0.1, e => e.inDirection('Z'));
    const m = s.mesh({ tolerance: 0.001, angularTolerance: 0.1 }), ed = s.meshEdges({ tolerance: 0.001, angularTolerance: 0.1 });
    const step = await s.clone().scale(25.4, [0, 0, 0]).blobSTEP().text();
    self.postMessage({ ok: true, vol: R.measureVolume(s), m: { v: m.vertices, n: m.normals, t: m.triangles }, edges: ed.lines, step,
      ms: { unzip: t1 - t0, compile: t2 - t1, init: t3 - t2, model: performance.now() - t3 } });
  } catch (err) { self.postMessage({ ok: false, err: String(err && err.stack || err) }); }
};`;
const page = `<!doctype html><html><head><meta charset="utf-8"><title>CAD spike</title>
<style>body{margin:0;font:14px system-ui;background:#1d2a33;color:#eee}#s{position:fixed;left:8px;top:8px;white-space:pre}canvas{display:block}</style></head>
<body><div id="s">loading…</div><a id="dl" download="spike.step" style="position:fixed;right:8px;top:8px;color:#fc6" hidden>STEP</a>
<script>${safe(rd('three.iife.js').toString())}</script>
<script type="text/plain" id="lib-kernel">${safe(rd('kernel.iife.js').toString())}</script>
<script type="text/plain" id="wasm-kernel">${rd('replicad_single.wasm.gz').toString('base64')}</script>
<script type="text/plain" id="worker">${safe(worker)}</script>
<script>
const T = THREE, st = document.getElementById('s'), W = innerWidth, H = innerHeight;
const gl2 = !!document.createElement('canvas').getContext('webgl2');
const r = new T.WebGLRenderer({ antialias: true }); r.setSize(W, H); document.body.appendChild(r.domElement);
const sc = new T.Scene(); sc.background = new T.Color(0x2b3a44);
const cam = new T.PerspectiveCamera(35, W / H, 0.01, 100); cam.up.set(0, 0, 1); cam.position.set(2.5, -3, 2.2);
const ctl = new T.OrbitControls(cam, r.domElement); ctl.target.set(0, 0, 0.25); ctl.update();
sc.add(new T.HemisphereLight(0xffffff, 0x445566, 2.2)); const dl = new T.DirectionalLight(0xffffff, 1.5); dl.position.set(3, -2, 5); sc.add(dl);
const t0 = performance.now();
const code = document.getElementById('lib-kernel').textContent + '\\n' + document.getElementById('worker').textContent;
const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
w.onmessage = e => {
  const d = e.data; window.SPIKE = d; window.SPIKE.gl2 = gl2; window.SPIKE.total = performance.now() - t0;
  if (!d.ok) { st.textContent = 'ERROR ' + d.err; return; }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(d.m.v, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(d.m.n, 3)); g.setIndex(d.m.t);
  sc.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x9fb3c2, metalness: 0.2, roughness: 0.55 })));
  const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.Float32BufferAttribute(d.edges, 3)); sc.add(new T.LineSegments(eg, new T.LineBasicMaterial({ color: 0x111111 })));
  const a = document.getElementById('dl'); a.href = URL.createObjectURL(new Blob([d.step])); a.hidden = false;
  st.textContent = 'WebGL2 ' + gl2 + '\\nvolume ' + d.vol.toFixed(10) + '\\n' + Object.entries(d.ms).map(([k, v]) => k + ' ' + v.toFixed(0) + ' ms').join('\\n') + '\\ntotal ' + window.SPIKE.total.toFixed(0) + ' ms';
};
w.postMessage({ wasm: document.getElementById('wasm-kernel').textContent });
(function loop() { r.render(sc, cam); requestAnimationFrame(loop); })();
</script></body></html>`;
fs.writeFileSync(process.argv[2], page);
console.log('wrote', process.argv[2], page.length, 'bytes');
