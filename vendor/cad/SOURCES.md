# Third-party code in the CAD app

`tools/vendor-cad/build.mjs` makes these files from the npm packages pinned in `tools/vendor-cad/package-lock.json`.
`apps/CAD.html` inlines them. Their licences are in `LICENSES/`, and the page shows them under About.

| File | From (npm) | Licence | Source |
|---|---|---|---|
| `three.iife.js` | three 0.180.0 (with its OrbitControls, STL/OBJ/3MF loaders, STL/OBJ exporters, Line2, and the fflate copy it ships) | MIT | https://github.com/mrdoob/three.js (tag r180) |
| `kernel.iife.js` | replicad 1.1.0, flatbush 4.6.2, opentype.js 1.3.4, and the loader of replicad-opencascadejs 1.1.0 | MIT, ISC, MIT, LGPL-2.1 | https://github.com/sgenoud/replicad (v1.1.0) |
| `replicad_single.wasm.gz` | replicad-opencascadejs 1.1.0: Open CASCADE Technology built with emscripten for replicad | LGPL-2.1 (OCCT: LGPL-2.1 with the OCCT exception) | https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs (build files), https://github.com/Open-Cascade-SAS/OCCT (the OCCT version named there) |

| `dwg.iife.js` | @mlightcad/libredwg-web 0.7.14: the reader wrapper and the emscripten loader | GPL-3.0 | https://github.com/mlightcad/libredwg-web (v0.7.14), built from LibreDWG https://github.com/LibreDWG/libredwg |
| `libredwg-web.wasm.gz` | @mlightcad/libredwg-web 0.7.14: LibreDWG built with emscripten (reading only) | GPL-3.0 | as above |
| `iges.js` | occt-import-js 0.0.23, as it ships | LGPL-2.1 | https://github.com/kovacsv/occt-import-js (v0.0.23) |
| `occt-import-js.wasm.gz` | occt-import-js 0.0.23: Open CASCADE Technology built with emscripten | LGPL-2.1 (OCCT: LGPL-2.1 with the OCCT exception) | as above, and https://github.com/Open-Cascade-SAS/OCCT |

| `pdf.iife.js` | pdfjs-dist 5.7.284 (legacy build), with its worker code run in the page; the page holds it gzipped | Apache-2.0 | https://github.com/mozilla/pdf.js (v5.7.284) |

The wasm files are the packages' own builds, unmodified, gzipped with no time stamp.

To relink against another build of OCCT, as the LGPL allows:
1. Put its `replicad_single.wasm` and `replicad_single.js` in `tools/vendor-cad/node_modules/replicad-opencascadejs/dist`.
2. Run `node build.mjs`.
3. Run `python3 build.py`.

MACH1 is under the GPL v3. LibreDWG is under the GPL v3 too. The LGPL-2.1 (§3), ISC and MIT licences allow the other parts inside it.
