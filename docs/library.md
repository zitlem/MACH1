# The MACH1 library

A JavaScript library for making, reading and changing Mazak Mazatrol programs by name instead of by byte. It
writes the same files the controls read: Matrix and Smooth mill (`.PBD` `.PBM`), lathe (`.PBF` `.PBP`) and
Mill-turn (`.PBE` `.PBN`), and opens the Smooth machine files (`.MAZ` `.MTP` `.MPR`).

It comes from the Mazatrol Editor: the same file format code, with a simpler way in for people who want to write
their own generators (engraving, bolt circles, fixtures, programs from a spreadsheet or a CAM system).

## Start

Node (no packages needed):

```js
const fs = require('fs');
const MACH1 = require('./mach1.js');

const p = MACH1.program({ control: 'SmoothM', name: 'PLATE', units: 'inch', comment: 'TEST PLATE' });
p.common({ MAT: 'AL', 'INITIAL-Z': 1 });
p.unit('DRILLING', { DIA: 0.25, DEPTH: 0.5, CHMF: 0 })
  .tool({ TOOL: 'CTR-DR', 'NOM-D': 0.5, 'C-SP': 75, FR: 0.003 })
  .tool({ TOOL: 'DRILL', 'NOM-D': 0.25, 'HOLE-D': 0.25, 'HOLE-DEP': 0.5, RGH: 'PCK1', DEPTH: 0.1, 'C-SP': 60, FR: 0.004 })
  .fig({ PTN: 'PT', Z: 0, X: 1.5, Y: -2 });
fs.writeFileSync(p.fileName, p.save());          // PLATE.PBM
console.log(p.listing());                         // the program as the Mazatrol screen shows it
```

Browser: `python3 build.py` writes `dist/mach1.bundle.js`; load it with a `<script>` tag and use `window.MACH1`.
`examples/browser.html` makes a bolt circle and downloads it.

## How fields are named

Units, tool lines and shape lines are filled in with the names the Mazatrol screen puts over their columns
(`DIA`, `DEPTH`, `TOOL`, `NOM-D`, `HOLE-DEP`, `APRCH-X`, `FPT-Z` ...), and values are what you would type on the
screen: numbers in the program's units, and menu words such as `PCK1`, `CW`, `LIN`, `OUT`. Case, spaces, dots
and dashes in names do not matter (`nom-d`, `NOM D`).

- A heading used twice on one line gets `#2`, `#3` (`M`, `M#2`, `M#3`).
- A field without a heading is named by its byte, such as `@11` (the tool suffix, A, B ... on most tool lines).
  Any field can be named by its byte.
- [FIELDS.md](FIELDS.md) lists every unit and line of every control with its field names. `MACH1.describe('SmoothM')`
  gives the same as data.
- Some fields only apply with certain tools or patterns; on the screen they show ◆. Setting one, an unknown name
  or a value that does not go in is recorded in `p.warnings` (or thrown, with `strict: true`).

## API

| | |
|---|---|
| `MACH1.program({control, name, units, comment, strict})` | a new program with its common unit and END. `control`: `SmoothM` `MatrixM` `SmoothT` `MatrixT` `SmoothE` `MatrixE` (or `.PBM` etc.); `units`: `inch` (default) or `metric` — files do not record it |
| `MACH1.open(bytes, fileName, units)` | read a program file |
| `MACH1.fromJSON(json, {strict})` | a program from JSON (below) |
| `MACH1.describe(control)`, `MACH1.units(control)`, `MACH1.controls()` | what exists |
| `p.common(fields)` | fill in the common unit |
| `p.unit(name, fields, {template})` | add a unit before END; returns the unit. `template: true` starts with the tool and shape lines the editor gives a new unit |
| `u.tool(fields)`, `u.fig(fields)`, `u.shape(fields)`, `u.line(type, fields)` | add a line to the unit. Types: `TOOL`, `FIG` (hole pattern), `SHAPE`, `PATTERN` (square or circle), `MANL`, or a record code |
| `u.block({G, X, Y, Z, I, J, F, S, M ...})` | a MANL PRG line from G-code words; `G: [1, 94]` fills both G columns; up to six addresses |
| `u.set(fields)` | change the unit's fields |
| `p.save()` | the file's bytes; `p.fileName` is the name with the right extension |
| `p.listing()`, `p.check()`, `p.warnings` | the program as text; problems found |
| `p.toJSON({exact, fieldsOnly})` | the program as JSON |
| `p.name`, `p.comment` | can be set |
| `MACH1.core` | the file-format layer underneath, for anything the names do not cover |

## JSON

Any language can write a program as JSON and let MACH1 turn it into a file (`node examples/json.js PART.json`):

```json
{ "control": "MatrixT", "name": "SHAFT", "units": "inch",
  "program": [
    { "unit": "COMMON", "fields": { "OD-MAX": 2, "LENGTH": 3, "WORK-FACE": 0.05 } },
    { "unit": "BAR", "fields": { "PART": "OUT", "CPT-X": 2, "CPT-Z": 0, "FIN-X": 0.01, "FIN-Z": 0.005 },
      "lines": [
        { "line": "TOOL", "fields": { "TOOL": "GNL", "TOOL#2": "OUT", "NOM.": 4, "DEP-1": 0.05, "C-SP": 500, "FR": 0.01 } },
        { "line": "SHAPE", "fields": { "PTN": "LIN", "FPT-X": 1.5, "FPT-Z": 2 } } ] } ] }
```

`p.toJSON()` writes the same shape from any program (`node examples/json.js PART.PBM`), plus the file name and
the file header's other bytes. It gives the file back unchanged: bytes the screen does not show are kept in `keep`, and a record whose fields cannot be typed back
exactly is kept whole in `hex` (its fields are still listed; change one and the record changes). `fieldsOnly`
leaves those out, for a clean template; `exact` keeps every record's bytes.

## Examples

- `examples/engrave-nc.js`: engraving G-code (`.nc`, `.EIA`) to a Mazatrol program of MANL PRG units, laid out
  the way a shop's engraving app writes them (that layout has run on a Mazak mill): each unit starts with
  `G0 G90 X Y S M3` and `G0 G17 Z`, plunges are `G1 G94 Z F`, arcs stay `G2/G3` with I J, and long jobs carry on in
  the next unit. `node examples/engrave-nc.js text.nc --control MatrixM --tool CHAMFER --nom 0.25 --suffix A`
- `examples/bolt-circle.js`: a tapped bolt circle (CTR-DR, DRILL, TAP on a CIR hole pattern).
- `examples/json.js`: program ↔ JSON.
- `examples/browser.html`: a bolt circle made and downloaded in the browser.
- `lib/gcode.js` reads G-code (arcs, cycles, macros, subprograms) into moves, for converters like the engraving one.

## How far to trust it

- `test/test.js` opens every program it finds in the folder named by `MACH1_PROGRAMS` (shop programs are kept
  outside the repository), for example `MACH1_PROGRAMS=~/shop-programs node test/test.js` (386 shop programs of
  all six controls in our runs); with none found it says the round-trip checks were skipped, writes each to JSON and back, and gets every file back byte for byte, both ways.
  It also builds programs by name and checks the stored values.
- The format layer (`lib/core.js`, `lib/schema.json`) is the Mazatrol Editor's, which prints 17,765 of 17,765
  lines of real programs exactly as MazEdit does.
- What MACH1 does not know is how the machine will cut: it writes what you ask for. A tool must be in the
  machine's TOOL DATA with the same type, nominal size and suffix. **Check every program on the machine's screen
  (and in its path check) before running it.**

## Files

`mach1.js` the library · `lib/cad.js` drawing geometry (shapes, construction, dimensions, DXF) · `lib/hem-geo.js`
toolpath geometry · `lib/engage.js` engagement simulation · `lib/hem.js` HEM toolpaths · `lib/feeds.js` feeds and speeds · `lib/core.js` `lib/schema.json` the Mazatrol format (from the Mazatrol Editor) ·
`lib/gcode.js` G-code reader · `dist/mach1.bundle.js` one file for browsers · `docs/FIELDS.md` field names ·
`examples/` · `test/test.js` · `tools/fields.js` writes docs/FIELDS.md · `build.py` refreshes `lib/` and `apps/`
from the folders next door and writes the bundle and docs/FIELDS.md.
