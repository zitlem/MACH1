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
subprocess.run(['node', os.path.join(HERE, 'tools', 'fields.js')], check=True)
