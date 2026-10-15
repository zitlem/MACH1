# HEM Toolpath Generator

`apps/HEM Toolpath Generator.html` writes high-efficiency milling (HEM) toolpaths: a light radial stepover at the
full flute length, with the engagement held steady so the tool can run 2–5× the feed of conventional roughing.
It is one offline file; open it in Chrome or Edge. Inch.

## Operations

- **Outside profile**: a rectangle (with corner radius) or a circle, from a rectangular block or even stock.
  Evenly spaced loops step in from the stock to the finish size. Each loop arcs on and off from outside, and
  loops link at depth in the clear (or with a small lift). The status line gives the stepover and the higher
  engagement at the stock corners.
- **Circular pocket**: a helix down at the centre (diameter and ramp angle), a flat turn, then a spiral out
  that grows by the stepover each turn (half circles about two centres, so it stays in arcs).
- **Trochoidal slot**: loops advancing along the slot from start to end, cutting on the front half and
  returning on the back half. Open-ended (start off the part) or started with a helix.

- **Your shape**: draw on the preview, type or paste points (X, Y and a fillet radius per corner), or import
  an ASCII DXF (lines, arcs, circles, polylines, splines, ellipses, blocks). Then cut it as:
  - **Outside profile**: closed shapes are the part. **Passes around the part** (the default): loops that follow
    the part all the way round, from the stock per side in to the wall. **Clear a rectangular block**: the whole
    block (the shape's extents plus the stock per side) down to the part, corners and all. **Offset loops** follow the shape at the stepover, with inside corners of the roughing
    loops rounded so the tool does not wrap into them. Loops are cut only where they meet stock, coming in and
    out from the air; with a block, each area of stock is cleared outside-in before the next, and **Where loops
    cross open air** picks **Zigzag** (every other piece conventional, no lifts; the default) or **One way** (all
    climb, lifting back after each piece). **Trochoidal** runs circular loops along paths, only where they can reach stock (straight across open air),
    so engagement stays low in any corner.
  - **Open profile**: an open path is the finished wall (a step, an edge, one side of a part), with the stock on
    its left or right looking along it from its first point (an arrow on the preview shows which way it runs,
    and the stock band is shaded). Passes run alongside it at the stepover from the stock edge in to the wall, at
    full depth, starting and ending past the path's ends (**Run past the ends**, blank = tool radius + 0.1).
    **One way**: every pass climbs and the tool lifts back to the start. **Zigzag**: every other pass comes back
    conventional without lifting. The path must run to the edge of the stock, since each pass comes down past
    its start.
  - **Pocket**: closed shapes are walls; a shape inside another is an island. **Offset loops**: small trochoidal
    cores in the middle of each area (and in each new branch as the loops grow into it), then loops peeling
    outward at the stepover. **Trochoidal**: circular loops everywhere, then smaller loops for corners and where
    the loop paths meet; more air cutting, lowest engagement in narrow gaps. **Auto** (the default) works out both
    and keeps the one with the shorter cycle time.
  - **Pocket with open edges**: tick **Open** on an edge in the points table (drawn dashed orange) for a side with
    air beyond it, such as the area between a boss and the edge of the part. Only the area between the walls and
    any islands is cut. Passes start from the open side and work in, a stepover at a time, growing round the
    islands (never through them) up to the walls. The tool comes down in the air past the open edges, so there is
    no helix. **Zigzag** (the default) or **One way**. The finish pass follows the walls and islands only.
  - **Groove along path**: trochoidal loops along each path, open or closed, at the groove width.

  Drawing: **Draw closed** (click the first point to close) or **Draw path** (double-click or Enter to finish),
  **Select / move** to drag points, Alt+click an edge to insert one, Delete to remove the selected point. Snap
  to 0.01, 1/16, 1/8, 1/4 or 1/2 in. Drag empty space to pan (or with the right button), wheel to zoom.

  **Editing a segment or point.** With Select / move, click a segment (it turns orange) or a point: a box under
  the preview gives its numbers. For a segment: its two ends (X Y), its length and angle (they move the end
  point; for an arc they are the chord's), **Straight / Arc ↺ G3 / Arc ↻ G2** and the radius, and on a closed
  shape **Open edge**. For a point: X, Y and the fillet radius. Numbers take effect on Enter or on leaving the
  box; Esc deselects. **Delete** (the key or the button) removes the selected point or segment: deleting a
  segment of a closed shape opens it there (it becomes an open path from one side of the gap round to the
  other); on an open path it splits the path in two.

  **Right-click** (Ctrl+click on a Mac trackpad) anything on the preview for a menu:
  - a **segment**: edit, insert a point there, make straight / make arc / flip the arc, open edge, delete;
  - a **point**: edit, set the fillet, start the shape here, open the shape here (closed) or split the path
    here (open path), delete;
  - a **shape** (also inside a closed one): add to the bulk selection, CAD only / machine it, close or open,
    reverse direction, edit as text, delete;
  - empty space: fit view, point numbers, measure from here; while drawing: finish, undo last point, cancel.

  The toolpath is worked out in the background (a Web Worker), so the page keeps responding with many shapes;
  **Working…** shows beside the badge until the new toolpath is in, and an edit made meanwhile replaces the
  one being worked out. Points being dragged update the drawing at once and the toolpath when you let go.

Every operation has: depth (Z0 at the top of the part) in one level or several (**Max depth per level**), climb
or conventional, and **Passes**: **Rough + finish** (roughing leaves the finish stock, the finish pass cuts it to
size at full depth), **Rough only** (roughing cuts straight to size) or **Finish only** (just the finish pass, for
a part already roughed with the finish stock left on the wall; the tool comes straight down in the cleared area).
The finish pass has a lead arc and an optional spring pass. Which passes a program makes is shown as a badge on
the preview, in the G-code header (`(TOOLPATH: ROUGH + FINISH)`), in the Mazatrol program comment and in the
default file name (`-rough-finish`, `-rough`, `-finish`).

## Drawing exactly, dimensions and drawing only

- **Typed points**: with a drawing tool (shapes, construction, Measure), type in the box above the preview and press
  Enter: `x,y` from work zero, `@dx,dy` from the last point, or `@length<angle` (degrees). The same as a click there.
- **Segments**: **Line (L)**, **Arc 3-point (A)**, or **Tangent arc (T)**: an arc leaving the last point the way the
  drawing was going, ending where you click or type.
- **Snapping**: to construction points, centres and crossings, to your shapes' points and to the **middle of each
  segment** (on the arc for an arc), then onto construction lines and circles, then the grid.
- **Offset (new shapes)**, **Extend ends** and **Trim ends** in the Move / rotate / scale panel: offset makes new
  shapes out (+) or in (−) (open paths: to the left or right), with arcs kept as arcs; extend and trim run the end
  segments of open paths on to, or back to, the nearest construction line, circle or shape.
- **Measure**: click two points (they snap) for the distance, angle, ΔX and ΔY. **Numbers** labels every point
  shape.point, as in the tables.
- **Dimensions** tab: every point from work zero, every segment (length and angle; for arcs the radius, centre,
  direction and sweep, and the radius asked for when it was too small for the chord), every fillet (radius, centre,
  where it starts and ends), each shape's size, perimeter and area, the construction geometry and where it crosses.
  **Download CSV**, or **Print** a sheet with the numbered drawing and the tables.
- **Drawing only** (header): just the drawing — the shapes, construction geometry, work zero and the Dimensions tab;
  the machining settings and the toolpath are hidden, and no toolpath is worked out.

## Editing shapes together, and work zero

- **CAD only**: untick **Machine** on a shape to keep it in the drawing (and in the points, the text and the saved
  settings) but leave it out of every toolpath. It is drawn grey and dashed.
- **Construction geometry**: points, endless lines (through a point at an angle, or through two points) and circles,
  typed in the **Construction geometry** list or placed with the **+ Point / + Line / + Circle** tools above the
  preview. Never machined; drawn light blue. While drawing or dragging, points snap first to construction points,
  centres and crossings (and to your shapes' points), then onto the lines and circles, then to the grid; an orange
  diamond shows a snap. Moving work zero moves them too.
  Tools: **+ Point**, **+ Line** (two points), **+ Horizontal** and **+ Vertical** (one click, the point it passes
  through), **+ At angle** (type the angle, then click the point), **+ Circle** (centre, then a point on it).
  With Select / move, **click** a construction item to select it (orange) and edit its numbers in the box under
  the preview; there it can also make a **parallel line** at a distance (+ left, − right), a **perpendicular
  line** through its point, or a **concentric circle**. **Delete** (the key or the button) removes it.
  **Right-click** one for the same, plus **Delete all construction**; right-click a shape's segment for a
  **construction line along it** (or a circle on an arc).
- **Length and angle**: while drawing (and for + Line), the **Length** and **Angle** boxes add the next point that
  far from the last one at that angle (0° = +X, 90° = +Y); Enter in either box adds it, **Finish** / **Close** ends
  the shape. Click the start point first (it snaps to points and crossings), or type it. Hold **Shift** while
  moving to lock the angle to 15° steps. The line under the preview shows the length and angle from the last
  point as you move.
- **Undo / Redo**: Ctrl+Z / ⌘Z and Ctrl+Shift+Z / ⌘⇧Z (or the buttons) step back and forward through changes to
  the shapes and construction geometry (200 steps). A dragged point is one step.
- **Points as text**: **Edit all shapes as text** (or **Text** on one shape) shows the points one per line —
  `X, Y, fillet R, arc R, open` (only X and Y are needed; open is 1 for an edge with air beyond it). Type, or paste
  straight from a spreadsheet (tabs) or a CAD point list (commas or spaces); a header row is skipped, and a line
  such as `# shape 2 open` (or a blank line) starts the next shape. **Apply** replaces the points; if any line can't
  be read it says which, and nothing changes. **Copy** takes them out, e.g. into a spreadsheet.
- **Move / rotate / scale**: tick shapes in the list (or Shift+click them on the preview, or **Select all**); they show purple.
  Then **Move** by X and Y, **Duplicate** (copies moved by X and Y), **Rotate** by an angle or **Scale** about their
  common centre, **Flip left–right / up–down**, **Set on every corner** a fillet radius, or **Delete**. Arcs and
  fillets follow: a flip turns each arc the other way (+R ↔ −R) so it stays the same curve, and scaling scales the
  radii.
- **Work zero (X0 Y0)**: put X0 Y0 at a corner, edge middle or the centre of your shapes' extents (the 3×3 grid),
  at a typed X and Y, or **Pick it on the preview**. Every point and every position (part centre, slot ends, start
  point) shifts so that spot becomes X0 Y0; the toolpath is the same on the part, just measured from the new zero.

## Where passes start

**Choose where passes start** (profiles, your shapes' outside profiles and pockets): type X and Y, or **Pick the start
on the preview** and click. Every pass, and the finish pass, leads in at its point nearest there, as long as the lead
arc starts in the clear (outside the stock for the first pass, over the previous pass for the rest); a pass where it
would not falls back to the automatic start, and the app says so. Pockets still open up in the middle first; their
loops and finish pass start by the point. **Automatic** turns it off.

## Heights

- **Clearance plane**: above clamps and fixtures. The tool comes in and leaves here, and each Mazatrol unit starts
  and ends here.
- **Rapid plane**: just above the part. The tool rapids down to it, then feeds.
- **Between cuts lift to**: the rapid plane (fastest) or the clearance plane (safest when clamps stand above the
  part). Every move across from one cut to another goes at that height.

Loops that follow the shape start next to where the last one ended, so one runs into the next at depth without
lifting.

## Engagement and loop returns

- **Lower the feed where the cutter wraps more of the cut** (on by default): the roughing is simulated along the
  whole toolpath (`lib/engage.js`, a grid about ten cells to a tool radius, fresh for each depth level), and where
  more of the cutter is in the material than the stepover gives — tight corners, narrow gaps, the front of small
  trochoid loops — the feed on those moves drops by sin(the stepover's angle) ÷ sin(the angle there), and a further
  90° ÷ angle past 90°, so the chip stays the same. The toolpath is not changed, only those feeds; the status says
  how many moves and how far.
- **Trochoid loop return feed** (200% by default): the back half of each trochoidal loop runs over ground just cut.

## Speeds and feeds

The material and coating numbers come from the Feeds and Speeds library (`lib/feeds.js`, the same numbers as the Feeds
and Speeds app): surface speed, chip load (a fraction of the tool diameter), finish factors and unit power, and each
coating's speed factor for the material, with its warnings (for example aluminium-based coatings in aluminium).
The fields are blank by default and show those numbers in grey; type a number to use your own. **From the Feeds and
Speeds tool list** takes an end mill saved there (diameter, flutes, flute length, stick-out, material, coating)
when both apps are opened from the same place in the same browser.
RPM = SFM × 3.82 ÷ D, capped at the spindle's maximum. With **chip thinning** on, the chip load is raised by
D ÷ (2·√(D·ae − ae²)) so the real chip stays at the target at a light stepover. Feed = RPM × flutes × chip load.
Metal removal = ae × ap × feed, and spindle power = removal × unit power. Overrides replace the calculated RPM
or feed. The app warns when a level is deeper than the flutes, the stick-out cannot reach, the stick-out is
over 4× D, the power is over 80% of the spindle, or the stepover is too heavy for HEM.

## Output

- **G-code `.nc`**: `T M6`, work offset, `G43 H`, coolant, arcs as G2/G3 with I J (centres adjusted to the
  rounded end points so the radii agree), optional line numbers and `G91 G28 Z0`. Every setting,
  your shapes included, is saved in comments after `M30`, twice: in plain words (`(SET depth=2.375 ...)`,
  `(SHAPE 1 CLOSED ...)` and `(PT x,y,fillet,arc ...)` lines) and as exact data (`(HEM SETTINGS DATA V2 ...)` and
  `(CFG ...)` lines, safe in upper case). **Open .nc…**, or dropping the file on the page, brings them all back. If
  the data has been damaged (a control or editor cut lines), the plain copy is used instead, and the message
  says so.
- **Mazatrol, both kinds**: Matrix (`.PBD`, 255 lines a unit) and Smooth (`.PBM`, 999 lines a unit), each
  with its own download button, from the same toolpath. MANL PRG units written with MACH1, in the engraving app's layout. Each unit starts
  with `G0 G90 X Y S M3`, `G0 G17 Z` and `G1 G94 Z F` (with the coolant M code). Finishing starts a new unit at
  its own speed, and a full unit retracts and carries on over the same point. The tool (type, NOM-Ø, suffix)
  must be in the machine's TOOL DATA.

## Library

`lib/hem.js` works in Node too:

```js
const HEM = require('./lib/hem.js'), MACH1 = require('./mach1.js');
const r = HEM.generate({ op: 'profile', partW: 6, partH: 4, stockX: 7, stockY: 5, depth: 1.5, mat: 'a36' });
require('fs').writeFileSync('part.nc', HEM.toGcode(r));
const m = HEM.toMazatrol(r, MACH1);
require('fs').writeFileSync(m.fileName, m.bytes());
```

In a browser, load `dist/mach1.bundle.js` and `dist/hem.bundle.js` (Clipper, `hem-geo.js` and `hem.js` in one file,
written by `build.py`) and use `window.HEM`.

The drawing geometry (shapes, arcs, fillets, construction, text, transforms, dimensions, DXF) is `lib/cad.js`; the toolpath geometry on Clipper is `lib/hem-geo.js`, which hands out both.

Your shapes use `lib/hem-geo.js` (offsets and clipping with Clipper, `lib/clipper.js`, Boost licence; arc fitting
and DXF import from the engraving app).

`node test/hem-test.js --quick` skips the slow checks (about 45 s instead of about 3½ min).

`test/engagement.js` simulates the material removed at full depth and measures the cutter's contact angle along
the whole toolpath (at the stepover the target is about 33° for a 3/4 tool at 0.06); the tests use it to check that
pockets never slot.

`test/hem-test.js` reads every toolpath back through `lib/gcode.js` and checks the cutter never comes closer
to the part than its radius (or past the pocket or slot wall), reaches full depth, and that the Mazatrol program
saves, reopens and lists the same arcs as the G-code. For drawn shapes it also checks that every bit of stock
the tool can reach is cleared at full depth.

The source is `hem/app.html`; `python3 build.py` inlines Clipper, the MACH1 bundle, `lib/hem-geo.js` and `lib/hem.js`
into the app.

**Check every program on the machine's screen and in its path check before running it.** The numbers are
starting points for coated carbide; compare them with your tool maker's recommendations.
