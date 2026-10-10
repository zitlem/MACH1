"""Build the single-file editor: inline the stylesheet, schema and scripts into src/index.html.

usage: python3 editor/build.py [OUT.html]      (default: apps/Mazatrol Editor.html in this repository)
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'apps', 'Mazatrol Editor.html')


def read(name):
    return open(os.path.join(SRC, name), encoding='utf-8').read()


def safe_js(s):
    # nothing inside a <script> may close it
    assert '</script' not in s.lower(), 'script text contains </script'
    return s


page = read('index.html')
schema = json.dumps(json.load(open(os.path.join(SRC, 'schema.json'))), separators=(',', ':'))
parts = {
    '/*APP_CSS*/': read('app.css'),
    '/*SCHEMA*/null': safe_js(schema.replace('</', '<\\/')),
    '/*CORE_JS*/': safe_js(read('core.js')),
    '/*PLOT_JS*/': safe_js(read('plot.js')),
    '/*GCODE_JS*/': safe_js(read('gcode.js')),
    '/*PATHS_JS*/': safe_js(read('paths.js')),
    '/*ALARMS_JS*/': safe_js(read('alarms.js')),
    '/*REF_JS*/': safe_js(read('reference.js')),
    '/*CHECKS_JS*/': safe_js(read('checks.js')),
    '/*GUIDE_JS*/': safe_js(read('guide.js')),
    '/*HELP_JS*/': safe_js(read('help.js')),
    '/*PARAMS_JS*/': safe_js(read('params.js')),
    '/*DEVELOP_JS*/': safe_js(read('develop.js')),
    '/*APP_JS*/': safe_js(read('app.js')),
}
for k, v in parts.items():
    assert page.count(k) == 1, k
    page = page.replace(k, v)
open(out, 'w', encoding='utf-8').write(page)
print('wrote', os.path.abspath(out), len(page.encode('utf-8')), 'bytes')
