# Engrave Point Generator

`apps/Engrave Point Generator.html` makes engraving programs. It is one offline file; open it in Chrome or Edge.
Inch.

## What it engraves

- **Text**: single-line styles, or **TrueType** outlines. Ten fonts are built in (Arial Bold, Arial, Arial Narrow
  Bold, Arial Narrow, Arial Black, Verdana Bold, Tahoma Bold, Trebuchet MS Bold, Courier New Bold, Times New Roman
  Bold); **Load other .ttf…** adds any font (remembered in that browser). Size, spacing, rotation, placement from
  work zero, and text on an arc.
- **Place on a circle**: text centred between an inner and an outer diameter at an angle (clockwise from 12
  o'clock), straight or curved along the circle, with tops out, tops in, Readable (flips on the bottom half) or
  Level. Copies at a step angle, with `{n}` replaced by a running number (start, step, digits), for serial rings.
  A status line gives the clearance to both circles.
- **DXF import**: lines, arcs, circles, polylines, splines, ellipses and blocks from an ASCII DXF, placed by its
  origin or centre with X/Y, rotation and scale, cut as centre lines after the text.
- **Reference geometry**: points, lines, circles and arcs drawn in blue on the preview and printout to check
  placement. They are never cut.

## Machining

Cut depth and depth per pass, Safe Z (lift between strokes) and Rapid plane (rapid down to it, then feed to
depth), feed and plunge feed, spindle, coolant, decimals. **Cut twice** cuts each stroke at full depth and again
back to its start.

## Output

- **G-code `.nc`**. The file carries all the settings in comments; **Open .nc…** reads them back.
- **Mazatrol `.PBD` (Matrix mill) or `.PBM` (Smooth mill)**: MANL PRG units with the chosen tool (type, NOM-Ø,
  suffix; the tool must be in the machine's TOOL DATA). Each unit starts with `G0 G90 X Y S M3` and
  `G0 G17 Z`; long jobs carry on in further units.
- **Point table** (`.csv`) and a **printout** with the preview, settings and points.

File names follow the text unless a file name is typed. Mazatrol output from this app has run on a Mazak
mill; still check each program on the machine before running it.

To make engraving programs from your own code instead, see `examples/engrave-nc.js` in the library, which turns
engraving G-code into the same Mazatrol layout.
