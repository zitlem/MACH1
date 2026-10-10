# MACH1

Tools for Mazak Mazatrol programs that run in a web browser or Node, with nothing to install.

**Use them online:** https://zitlem.github.io/MACH1/ (the apps open in the browser; files you open stay on your computer).

| | |
|---|---|
| `apps/Mazatrol Editor.html` | Open, edit, check and plot Mazatrol and EIA/ISO programs, laid out with the control's soft keys. Cutter paths and cycle times checked against a Smooth control's own estimates; priority-number run order; subprograms; TPC with every parameter named and drawn; program check by alarm number; tool development; G/M-code and alarm reference; a guidance line for EIA blocks; edit lists of points or shapes as text. One offline file: open it in Chrome or Edge. [Guide](docs/editor.md) |
| `apps/Engrave Point Generator.html` | Engraving text, circles of serial numbers and DXF artwork, written as G-code or a Mazatrol program. [Guide](docs/engraver.md) |
| `apps/HEM Toolpath Generator.html` | High-efficiency milling toolpaths (profiles, pockets with islands, slots and grooves, on built-in shapes or ones you draw or import from DXF) with speeds and feeds, written as G-code or Mazatrol Matrix and Smooth programs. [Guide](docs/hem.md) |
| `apps/Probing Program Generator.html` | Spindle-probe programs for a Mazak machining centre: Renishaw Inspection Plus cycles (surfaces, bores, bosses, webs, corners, bolt circles, angles, feature to feature, calibration, the side 180° away) as EIA/ISO with a Mazatrol SUB PRO that runs them; inspection with tolerances, tool adjustment and a report read back from the control's print file; Mazatrol MMS units, or Mazak's MMS EIA macros. Checks the input combinations the macros alarm on. [Guide](docs/probe.md) |
| `apps/Feeds and Speeds.html` | Speeds and feeds for HEM and every tool type (end mills incl. finish and spring passes, ball and tapered mills, any coating, helix/circular bores, high-feed, face and chamfer mills, drills, taps, reamers) with chip thinning, power, deflection, chatter tips and tap drills. [Guide](docs/feeds.md) |
| `mach1.js` | A JavaScript library for writing your own program generators: build Mazatrol programs by field name, or from JSON. [Guide](docs/library.md) |

```js
const MACH1 = require('./mach1.js');
const p = MACH1.program({ control: 'SmoothM', name: 'PLATE' });
p.unit('DRILLING', { DIA: 0.25, DEPTH: 0.5 })
 .tool({ TOOL: 'DRILL', 'NOM-D': 0.25, 'HOLE-DEP': 0.5, RGH: 'PCK1' })
 .fig({ PTN: 'PT', Z: 0, X: 1.5, Y: -2 });
require('fs').writeFileSync(p.fileName, p.save());
```

## Proving the output on a machine

`examples/machine-check/` has five small programs (G-code, Matrix and Smooth) and a checklist for the first runs on
the Mazak; `node examples/machine-check.js` remakes them.

## Docs

- [docs/editor.md](docs/editor.md): the Mazatrol Editor
- [docs/engraver.md](docs/engraver.md): the Engrave Point Generator
- [docs/hem.md](docs/hem.md): the HEM Toolpath Generator
- [docs/feeds.md](docs/feeds.md): Feeds and Speeds
- [docs/probe.md](docs/probe.md): the Probing Program Generator
- [docs/library.md](docs/library.md): the MACH1 library, JSON format, examples
- [docs/FIELDS.md](docs/FIELDS.md): every unit's and line's field names, per control
- [docs/publishing.md](docs/publishing.md): checklist before sharing MACH1

## Folders

`apps/` the browser apps · `hem/`, `feeds/`, `probe/` their sources · `mach1.js`, `lib/`, `dist/` the library · `examples/` generators to start from ·
`test/` · `docs/` · `tools/` · `editor/` (the Mazatrol Editor's sources, tests and tools: `python3 editor/build.py` writes
`apps/Mazatrol Editor.html`) · `build.py` (refreshes `lib/` from `editor/src` and writes `dist/`, the apps and `docs/FIELDS.md`).

## License

GNU General Public License v3.0 (see [LICENSE](LICENSE)). You may use, change and share MACH1; programs that include
it or are built from it must be shared under the same license, with their source.

**Always check a program on the machine's screen and in its path check before running it.** These tools write
what you ask for; they do not know your machine, fixtures or tools.
