"""MACH1 build: refresh lib/ from the Mazatrol Editor's sources (editor/src) and write dist/mach1.bundle.js (one file
for browsers: core, schema, gcode and MACH1), dist/hem.bundle.js, the HEM, Feeds and Probing apps, and docs/FIELDS.md.

The Mazatrol Editor page itself is built first, by python3 editor/build.py (it writes apps/Mazatrol Editor.html).
The engraving app, apps/Engrave Point Generator.html, is kept as it is.

usage: python3 editor/build.py && python3 build.py
"""
import json, os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
EDITOR = os.path.join(HERE, 'editor', 'src')
LIB = os.path.join(HERE, 'lib')
if os.path.isdir(EDITOR):
    for f in ('core.js', 'schema.json', 'gcode.js'):
        shutil.copy(os.path.join(EDITOR, f), os.path.join(LIB, f))
    print('lib/ refreshed from', EDITOR)
else:
    print('no Mazatrol Editor sources in', EDITOR + ': using lib/ as it is')
APPS = os.path.join(HERE, 'apps')
os.makedirs(APPS, exist_ok=True)
read = lambda f: open(os.path.join(LIB, f), encoding='utf-8').read()
schema = json.dumps(json.load(open(os.path.join(LIB, 'schema.json'))), separators=(',', ':'))
bundle = ('// MACH1 bundle: load with <script src="mach1.bundle.js"></script>, then use window.MACH1\n'
          '(function (module) {\nvar root = (typeof globalThis !== "undefined" ? globalThis : window);\n'
          + read('core.js').replace('})(this);', '})(root);') + '\nroot.Maz.useSchema(' + schema + ');\n'
          + read('gcode.js').replace('})(this);', '})(root);') + '\n'
          + open(os.path.join(HERE, 'mach1.js'), encoding='utf-8').read().replace('})(this);', '})(root);')
          + '\n})();\n')
os.makedirs(os.path.join(HERE, 'dist'), exist_ok=True)
open(os.path.join(HERE, 'dist', 'mach1.bundle.js'), 'w', encoding='utf-8').write(bundle)
print('wrote dist/mach1.bundle.js', len(bundle), 'bytes')
# HEM for browsers: Clipper, hem-geo and hem in one file (load after mach1.bundle.js for Mazatrol output)
hem_bundle = ('// HEM bundle: Clipper (Boost licence), hem-geo and hem. Load with <script src="hem.bundle.js"></script>, then use\n'
              '// window.HEM (and window.HEMGeo); load mach1.bundle.js too for HEM.toMazatrol(result, MACH1).\n'
              + read('clipper.js') + '\n' + read('feeds.js') + '\n' + read('cad.js') + '\n' + read('hem-geo.js') + '\n' + read('engage.js') + '\n' + read('hem.js') + '\n')
open(os.path.join(HERE, 'dist', 'hem.bundle.js'), 'w', encoding='utf-8').write(hem_bundle)
print('wrote dist/hem.bundle.js', len(hem_bundle), 'bytes')
# the HEM toolpath app: hem/app.html with Clipper, the MACH1 bundle, lib/hem-geo.js and lib/hem.js inlined, one offline file
page = open(os.path.join(HERE, 'hem', 'app.html'), encoding='utf-8').read()
inline = lambda js: js.replace('</script', '<\\/script')
for mark, js in (('/*@@CLIPPER@@*/', read('clipper.js')), ('/*@@MACH1@@*/', bundle), ('/*@@HEMGEO@@*/', read('feeds.js') + '\n' + read('cad.js') + '\n' + read('hem-geo.js') + '\n' + read('engage.js')), ('/*@@HEM@@*/', read('hem.js'))):
    page = page.replace(mark, inline(js), 1)
open(os.path.join(APPS, 'HEM Toolpath Generator.html'), 'w', encoding='utf-8').write(page)
print('wrote apps/HEM Toolpath Generator.html', len(page), 'bytes')
# the feeds and speeds app: feeds/app.html with lib/feeds.js inlined
page = open(os.path.join(HERE, 'feeds', 'app.html'), encoding='utf-8').read().replace('/*@@FEEDS@@*/', inline(read('feeds.js')), 1)
open(os.path.join(APPS, 'Feeds and Speeds.html'), 'w', encoding='utf-8').write(page)
print('wrote apps/Feeds and Speeds.html', len(page), 'bytes')
# the probing app: probe/app.html with the MACH1 bundle and lib/probe.js inlined
page = open(os.path.join(HERE, 'probe', 'app.html'), encoding='utf-8').read()
for mark, js in (('/*@@MACH1@@*/', bundle), ('/*@@PROBE@@*/', read('probe.js'))):
    page = page.replace(mark, inline(js), 1)
open(os.path.join(APPS, 'Probing Program Generator.html'), 'w', encoding='utf-8').write(page)
print('wrote apps/Probing Program Generator.html', len(page), 'bytes')
# the CAD app: cad/app.html with three.js (vendor/cad, made by tools/vendor-cad) and the CAD libraries inlined
VENDOR = os.path.join(HERE, 'vendor', 'cad')
def vread(f): return open(os.path.join(VENDOR, f), encoding='utf-8').read()
BOOST = """Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization obtaining a copy of the software and
accompanying documentation covered by this license (the "Software") to use, reproduce, display, distribute, execute,
and transmit the Software, and to prepare derivative works of the Software, and to permit third-parties to whom the
Software is furnished to do so, all subject to the following:

The copyright notices in the Software and this entire statement, including the above license grant, this
restriction and the following disclaimer, must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative works are solely in the form of
machine-executable object code generated by a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE."""
versions = json.load(open(os.path.join(VENDOR, 'versions.json')))
licences = {
    'MACH1': {'what': 'this page', 'lic': 'GNU GPL v3', 'text': 'MACH1 is free software under the GNU General Public License version 3 (the LICENSE file in its source). Its source is at https://github.com/zitlem/MACH1.'},
    'three.js ' + versions['three']: {'what': 'drawing in 3D (WebGL)', 'lic': 'MIT', 'text': vread('LICENSES/three.txt')},
    'Clipper 6.4.2 (Angus Johnson)': {'what': 'offsets', 'lic': 'Boost Software License 1.0', 'text': BOOST},
    'replicad ' + versions['replicad']: {'what': 'solid modelling on OpenCascade', 'lic': 'MIT', 'text': vread('LICENSES/replicad.txt')},
    'Open CASCADE Technology (replicad-opencascadejs ' + versions['replicad-opencascadejs'] + ')': {'what': 'the solids kernel, built as WebAssembly; source and the relinking steps: vendor/cad/SOURCES.md in MACH1', 'lic': 'LGPL-2.1', 'text': vread('LICENSES/replicad-opencascadejs.txt')},
    'flatbush ' + versions['flatbush']: {'what': 'spatial index (inside replicad)', 'lic': 'ISC', 'text': vread('LICENSES/flatbush.txt')},
    'opentype.js ' + versions['opentype.js']: {'what': 'font reading (inside replicad)', 'lic': 'MIT', 'text': vread('LICENSES/opentype.js.txt')},
    'LibreDWG (libredwg-web ' + versions['@mlightcad/libredwg-web'] + ')': {'what': 'reading DWG files, built as WebAssembly; source: https://github.com/mlightcad/libredwg-web and https://github.com/LibreDWG/libredwg', 'lic': 'GNU GPL v3', 'text': vread('LICENSES/libredwg-web.txt')},
    'pdf.js (pdfjs-dist ' + versions['pdfjs-dist'] + ')': {'what': 'reading PDF drawings', 'lic': 'Apache-2.0', 'text': vread('LICENSES/pdfjs-dist.txt')},
    'occt-import-js ' + versions['occt-import-js']: {'what': 'reading IGES files (Open CASCADE inside, as WebAssembly); source: https://github.com/kovacsv/occt-import-js', 'lic': 'LGPL-2.1', 'text': vread('LICENSES/occt-import-js.txt') + '\n\n' + vread('LICENSES/occt-import-js-occt.txt')},
}
def safe(js, what):
    # the browser ends a <script> at "</script" (escaped below) and treats "<!--" with "<script" inside it specially
    if '<!--' in js and '<script' in js.lower():
        raise SystemExit(what + ' holds "<!--" and "<script": it would break the page')
    return inline(js)
cad_libs = (read('clipper.js') + '\n' + read('cad.js') + '\n' + read('hem-geo.js') + '\n' + read('cad-geom.js') + '\n' + read('cad-draft.js') + '\n'
            + read('cad-model.js') + '\n' + read('cad-io.js') + '\n' + read('cad-mesh.js') + '\n' + read('cad-icons.js') + '\n' + read('cad-find.js') + '\nwindow.CAD_LICENSES = ' + json.dumps(licences) + ';\n')
page = open(os.path.join(HERE, 'cad', 'app.html'), encoding='utf-8').read()
import base64, gzip
kernel_txt = vread('kernel.iife.js') + '\n' + read('cad-kernel.js')
b64 = lambda f: base64.b64encode(open(os.path.join(VENDOR, f), 'rb').read()).decode('ascii')
for mark, js, what in (('/*@@THREE@@*/', vread('three.iife.js'), 'three.js'), ('/*@@CAD@@*/', cad_libs, 'the CAD libraries'),
                       ('/*@@MESH@@*/', read('cad-mesh.js'), 'the mesh library (for the mesh worker)'),
                       ('/*@@KERNEL@@*/', kernel_txt, 'the solids kernel'), ('/*@@KERNELWASM@@*/', b64('replicad_single.wasm.gz'), 'the kernel wasm'),
                       ('/*@@DWG@@*/', vread('dwg.iife.js'), 'the DWG reader'), ('/*@@DWGWASM@@*/', b64('libredwg-web.wasm.gz'), 'the DWG wasm'),
                       ('/*@@IGES@@*/', vread('iges.js'), 'the IGES reader'), ('/*@@IGESWASM@@*/', b64('occt-import-js.wasm.gz'), 'the IGES wasm'),
                       ('/*@@PDFGZ@@*/', base64.b64encode(gzip.compress(vread('pdf.iife.js').encode('utf-8'), 9, mtime=0)).decode('ascii'), 'pdf.js')):
    page = page.replace(mark, safe(js, what), 1)
out = os.path.join(APPS, 'CAD.html')
# written only when it changed, so a rebuild leaves git nothing new to store
if not os.path.exists(out) or open(out, encoding='utf-8').read() != page:
    open(out, 'w', encoding='utf-8').write(page)
print('wrote apps/CAD.html', len(page), 'bytes')
subprocess.run(['node', os.path.join(HERE, 'tools', 'fields.js')], check=True)
