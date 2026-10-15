# CAD

`apps/CAD.html` is 2D and 3D CAD that runs in the browser. It is one offline file: open it in Chrome or Edge.
Nothing is uploaded. It works in inches. The layout follows the usual CAD pattern: a ribbon of commands across the
top, levels on the left, the drawing in the middle, and a status bar at the bottom with the cursor position, plane,
depth, level, colour, snaps and grid.

This page draws and edits geometry; it makes no toolpaths.

## The screen

- **Ribbon tabs:** File, Home, Wireframe, Solids, Drafting, Transform, Analyze and View. Each command has an icon
  over its name, and its tooltip shows its key (see Keys).
- **The panel on the left** lists the solids and the levels when no command is running (see Levels). New entities
  go on the active level, plane, depth, colour, line style and width shown in the status bar.
- **While a command runs,** the panel shows:
  - the command's fields;
  - what it is asking for next, in the blue box;
  - a box for typing points: `x,y`, `@dx,dy` (from the last point) or `@length<angle`.

  Typing a number while a point is wanted goes straight to that box. Enter finishes a spline, a selection or a
  typed point. Escape first clears what you have given, and a second Escape ends the command.
- **Mouse:**

  | Action | What it does |
  |---|---|
  | Wheel (also with Shift or Ctrl held) | zooms about the cursor |
  | Right drag, or Shift (or Alt) + wheel held and dragged | pans |
  | Wheel held and dragged | turns the view |
  | Ctrl + wheel held and dragged | zooms: up in, down out |
  | Right-click (press and let go in place) | opens the search, there (see Finding a command) |
  | Double-click on empty space | fits the drawing |
  | Click | selects one entity; Shift-click adds to the selection |
  | Drag left to right | selects what is inside the window |
  | Drag right to left | selects what the window touches, a line that only passes through it too |

- **Snaps** (status bar): End, Mid, Centre, Intersection, Quadrant, Near and Grid. The snapped kind shows by the
  cursor. The origin always snaps.
- **Planes:** Top, Front and Right, and planes of your own (see Planes), with a Z depth along the plane's normal.
  The View tab's Top, Front and Right buttons also set the plane. Isometric, Back, Bottom and Left only turn the view.
- **View → Zoom:** Fit, Window (drag round what to zoom to) and Unzoom. **Previous** goes back to the view before.

## Line styles and construction geometry

- **Style and Width** in the status bar set how new entities are drawn:
  - styles: solid, dashed, centre, hidden or phantom;
  - widths: thin, medium or thick.

  Dashes are sized on the screen, so they look the same at any zoom.
- **Constr** in the status bar draws new entities as construction geometry. Construction is drawn short-dashed and
  dimmed, and you can snap to it, trim it and measure it. It is never part of a chain, so Extrude, Revolve, Chain
  offset, Chain area and Select chain go past it. It is left out of DXF, SVG and PDF files; the page says how many
  were left out.
- **Home → To active style** gives the selection the status bar's style and width.
- **Home → Construction** makes the selection construction, or makes it normal geometry again when all of it is
  construction already.
- **Set from entity** (Alt+X) takes the style and width too.

## Levels

- Tick a level to show or hide it, click its number to make it the active level, or type to rename it.
- **Select** (the arrow on its row) selects everything shown on the level: entities, bodies and solids. Shift-click
  adds to the selection.
- **Delete** (the red ✕; level 1 has none) removes the level. An empty level just goes. If it holds anything, hidden
  or not, the page asks:
  - **Delete them too:** the level and everything on it go. Deleting a solid takes the features that made it.
  - **Move them to level…:** they go to the level you pick, and the level goes.

  Either way it is one undo step, and the active level falls back to the one they moved to (or level 1).
- **Home → Change level** moves or copies what is selected to a level, or to a new one you name. It takes
  entities, bodies and solids, and it is one undo step.
- While something is selected, each level has a **move here** button.
- **To active level** and **To active colour** change the selection to the status bar's level or colour.
- **Set from entity** (Alt+X) makes an entity's level, colour, plane and Z the active ones.
- A solid belongs to the level that was active when it was made, and hides with it. Solids can be moved to a level
  but not copied.
- **Hide / unhide** (Alt+E) hides everything but the selection for a while; Alt+E again shows it all. It is not
  saved and is not an undo step, and what you draw meanwhile is shown.

## Changing what you drew

- **Its numbers:** select one entity and the panel shows them. Type a new number, then Enter or Tab, and the entity
  changes; each change is one undo step.
  - **Line:** its two ends, its length and its angle. A new length or angle keeps the start where it is.
  - **Arc:** its centre, radius or diameter, start angle and sweep.
  - **Circle:** its centre and diameter or radius.
  - **Point:** X and Y.
  - **Endless line:** its point and angle.
  - **Note:** its text, height, angle and place.
  - **Dimension:** its text (`<>` is the measurement), decimals and text height.
  - **Spline:** shown, not typed; drag its control points.
- **Its attributes:** level, colour, style, width, Z and construction, for one entity or for all that is selected
  (bodies and solids take level and colour). A box shows — where the selection differs.
- **Grips:** what is selected (up to 100 entities) shows blue squares when no command runs. Drag one, with the
  snaps working as you go:
  - a line's or arc's end moves that end; the ends of other entities joined there (same plane and depth) follow, so
    a closed chain stays closed. Hold Shift as you start the drag to move the end on its own;
  - an arc's middle bends it; its centre, or a line's middle, moves it whole;
  - a circle's quarter points set its size;
  - a spline's control points move.

  Escape lets go of a drag. A click on a grip, without dragging, selects as a click does.
- **Shapes keep their sizes:** a rectangle, slot or polygon remembers how it was made. Select it (or one of its sides)
  and change its width, height, corner radius, angle or centre; a slot's length and width; a polygon's sides, radius
  to the corners or across the flats. It is drawn again as one undo step. Translate, Rotate and Scale keep a whole
  shape a shape. Trimming, breaking, dragging or typing into one of its sides, or mirroring it, makes it plain
  entities, and the panel says so.

## Planes

Besides Top, Front and Right you can make planes of your own, at any angle and with an origin anywhere: for a
tilted face, a hole at an angle, or a part set up on a fixture.

- **Home → New plane:**
  - **3 points:** the origin, a point along its X, and a point on its Y side. Snaps, a body's or solid's corners and
    points on its faces all work.
  - **From an entity:** an arc or circle gives its plane, with the origin at its centre; a line gives a plane with X
    along it, lying on the line's plane or standing up on the line.
  - **Turned:** the active plane turned about its X, its Y or its normal, by an angle, round its origin.
  - **From a face:** a flat face of a body or solid; X as near the world's X as it can be.

  The new plane becomes the active one: what you draw goes onto it, at a Z along its normal, and the grid, its axes
  and its origin (which snaps) show on it. Extrude, Revolve and Hole run along its normal; a Box on it is an
  extruded rectangle.
- **Home → Plane view** looks straight at the active plane, X to the right.
- **The panel's Planes list:** pick a plane to make it active, rename it, look straight at it, or delete it (only
  when nothing is drawn on it). The status bar's Plane list has them too. They are saved with the drawing, and making
  or deleting one is an undo step.
- **DXF:** entities on your planes are written in their own coordinate system, as AutoCAD does, so they come in at
  the right place elsewhere. An opened DXF whose arcs and circles are drawn tilted gets a plane for each tilt, and
  lines lying in one go onto it too; they are no longer laid flat onto the top plane.

## Selecting

- Click selects one thing; Shift-click adds or takes away; a window selects what is inside (left to right) or what it
  touches (right to left).
- **Home → Select:**
  - **Select all.**
  - **Select by:** tick the kinds to take (points, lines, arcs, circles, splines, endless lines, notes, dimensions,
    bodies, solids), and narrow them by colour, level, style, width and construction. **Select** replaces the
    selection, **Add** joins it, **Take away** takes the matches out of it. Only what is shown is selected.
  - **Invert:** everything shown that was not selected.
  - **Select last:** what the latest step that made something made, as far as it is still there.
  - **Select chain.**
- **Home → Remove duplicates** looks through what is selected, or everything shown when nothing is:
  - An entity the same as another within the tolerance (0.0001 in at first), either way round, on the same plane
    and depth, goes; the first one drawn stays. Construction only matches construction.
  - **Colour and style must match** and **Level must match** (both on at first): untick them to match across them.
  - **Also remove pieces lying on another:** a line inside a longer line in a row with it, and an arc lying on
    another arc or circle of the same centre and radius.
  - It is one undo step, and says how many went.

## History

The **history** is a timeline along the bottom, above the status bar: one icon for each step, oldest on the left,
the icon of the command that made it. The red mark is where you are.
- Hover over a step to see what it was, what it did (entities added, taken away or changed; bodies; solids' features;
  levels and planes), when, and its number.
- Click a step to go back to just after it. The steps you went back past stay after the mark, greyed; click one to
  go forward to it again. Drawing anything new drops them, as undo does.
- The flag at the start undoes everything kept (up to 500 steps). The wheel scrolls the timeline sideways.
- **It is saved:** in the `.mach1cad` file (the latest 100 steps, with those undone) and in the browser's own copy of
  the drawing (all of them), so it is there again when you open the file or the page. Either way it keeps about
  30 MB of changes at most: a step that moved a big mesh, and the steps before it, stay behind (the drawing itself is
  always saved whole). Files from before this keep no history, and DXF, STEP and the others start with none.

(This is undo and redo shown as a timeline; a solid's own history of features is under Solids.)

## Finding a command

Right-click the drawing, or press Ctrl+F, and type what you want to do in plain words: *round the corners*, *drill a
hole*, *make it 3d*, *save as dxf*, *add a drawing to this one*, *how far apart*, *cutter comp*.

- **What it finds:**
  - every ribbon command;
  - the keys that have no button, such as paste;
  - the status bar's controls, such as the line style or the active level.

  Each result shows its icon, where it is on the ribbon (Wireframe › Modify), its key, and a line on what it does.
- **The words it knows:** each command has a list of the words people use for it, shop terms and other programs'
  names among them. The list is in `lib/cad-find.js`.
  - Plurals and endings don't matter: *holes*, *rounded*.
  - Colour and color are the same, and so are centre and center.
  - A word half typed counts.
  - A one-letter slip is forgiven: *filet*, *mirorr*.
- **How to:** jobs that take more than one command have a recipe, tagged *How to*. Picking one lists its steps,
  each with a button that runs its command. There are 14:
  - make a DXF from a solid;
  - bring another drawing into this one;
  - make a solid part from a 2D drawing;
  - cut a pocket or a slot;
  - clean up a DXF from someone else;
  - lay out a bolt circle and drill it;
  - engrave text;
  - draw on the side of a part;
  - put the part at 0,0;
  - change millimetres to inches;
  - draw construction geometry;
  - go back several steps;
  - repeat a feature in rows or in a circle;
  - open the wire EDM's drawings.

  A command that fits the words as well as a recipe comes first.
- **Before you type:** the box lists the last six commands you ran, so a right-click repeats one.
- **Keys:** ↑ and ↓ pick, and Enter or a click runs. The command runs as its button would, and the ribbon goes to its
  tab and flashes the button, so you see where it lives. Escape closes the box.
- **Status-bar results:** the box goes to that control, and Construction switches on or off.
- **The mouse:** a right-drag still pans, and opens nothing. The wheel still zooms with the box open, over the box
  too. A click on the drawing closes it.
- **When nothing matches:** it says so. Words it should know can be added to its list.

## Keys

The keys most CAD programs use (Mastercam's among them), where this page has the same thing. Help → Keyboard
shortcuts (Alt+H) lists them. On a Mac,
Option is Alt and Command is Ctrl.

| Keys | What they do |
|---|---|
| Alt+1 … Alt+7 | Top, Front, Back, Bottom, Right, Left and Isometric views; Alt+P the view before |
| Alt+F1 · F1 · F2 · Alt+F2 | fit · zoom to a window · unzoom to half · unzoom to 80% |
| Page Up / Page Down · arrows · Alt+arrows | zoom · pan · turn the view 15° |
| Alt+S · Alt+E · Alt+G · F9 · F3 | shading on or off · hide / unhide · grid · axes · draw again |
| Alt+Z · Alt+I · Alt+L | the levels · the solids history · the plane box |
| F4 · F5 (or Delete) | analyze an entity · delete |
| Shift+T · Shift+D · Shift+E | trim · divide · extend |
| Alt+X | set the level, colour, plane and Z from an entity |
| Ctrl+S · Ctrl+Shift+S · Ctrl+O | save · save as · open |
| Ctrl+Z · Ctrl+Y · Ctrl+A | undo · redo · select all |
| Ctrl+C · Ctrl+X · Ctrl+V | copy · cut · paste in place (the pasted copies are selected) |
| Enter · Escape | finish · step back, then close the command |
| Ctrl+F | find a command by what you want to do (as a right-click on the drawing does) |
| Alt+H · Alt+V | the keys · about |

The browser keeps a few keys for itself: Alt+F4, and Ctrl+N, Ctrl+T and Ctrl+W.

## Wireframe

Lines, arcs and splines are kept exact (a line is its two ends, an arc its centre, radius and angles, a spline its
NURBS control points). They are not stored as strings of short segments. Circles are full arcs.

**Drawing:**
- **Point**
- **Bolt circle:** points, or holes of a diameter, round a centre: how many, the bolt circle's diameter and the angle
  of the first. It can draw the bolt circle too, as construction. It remembers its numbers, like a rectangle.
- **Arc centres:** a point at the centre of each selected arc and circle (one where several share a centre), for
  drilling.
- **Points along a curve:** a number of them at equal lengths (the ends too, or not), or one every so far.
- **Line:** endpoints, polar (length and angle), horizontal or vertical. Keep going joins lines end to end.
- **Endless line:** a construction line that runs right across the drawing, for laying a part out. It goes:
  - through a point at an angle;
  - level or upright through a point;
  - through 2 points;
  - halving the angle between two lines (click each on its side of the angle);
  - square to a line or arc, through a point.

  **One way only** makes a ray instead. Endless lines snap where they cross things (Int) and can be trimmed: trimmed
  once an endless line becomes a ray, and trimmed again a plain line. Break makes two rays. Fit leaves them out,
  and files leave them out. DXF XLINE and RAY entities come in as endless lines.
- **Parallel** at a distance or through a point, **Perpendicular** from a point to a line or arc, and **Tangent**
  from a point to a circle or between two circles. Click near where it should touch.
- **Circle:** centre and diameter, 2 points or 3 points.
- **Arc:** 3 points, ends and radius, centre and angles, or tangent from the end of a line or arc.
- **Rectangle** (2 corners, or centre with an angle; width and height; corner radius), **Slot** (centre, overall
  length, width, angle) and **Polygon** (sides, to the corners or the flats). All three remember their sizes (see
  Changing what you drew).
- **Spline** through the points you click; Enter or a double-click finishes it.
- **Ellipse:** its two radii and angle, or click the centre, the end of one axis and a point it goes through. It is an
  exact NURBS, and remembers its radii.
- **Bounding box:** a rectangle round what is selected (or everything shown), square to the active plane, bodies and
  solids included, with stock added each side; or a 3D box of lines, with stock in Z too. A point at the centre if
  wanted. The rectangle remembers its sizes.

**Changing entities:**
- **Fillet** and **Chamfer:** click each entity on the part to keep.
- **Fillet chain** and **Chamfer chain:** click a chain, and every corner of it is rounded (or chamfered, between
  lines) at once: all of them, or only those turning in or out of a closed chain. A corner too tight for the size is
  left as it is and counted.
- **Close arc:** an arc becomes its full circle.
- **Break into pieces:** a line, arc, circle or spline broken into a number of pieces of equal length, or into pieces
  of a length (the last takes what is left).
- **Stretch:** give a window, then the distance (or click from and to). Ends inside the window move; entities wholly
  inside move whole. An arc with one end inside is drawn again through its other end.
- **Trim:** 1 entity (click the part to keep, then what to trim it to), 2 entities (to where they meet), 3
  entities, or Divide, which takes out the part between the nearest crossings.
- **Extend** a line or arc by a length.
- **Break** at a point, or **Break at crossings** for a selection.
- **Join** two lines in a row, or two arcs of one circle.
- **Offset** an entity, and **Chain offset** a whole chain. The chain offset is fitted with lines and arcs within
  0.0002.

## Solids

Solids are real B-rep solids, not meshes. They are built on the OpenCascade kernel, which runs inside the page,
and kept as a history of features you can change. The kernel starts a few seconds after the page opens, or when a
solid is first needed; the status bar shows its state.

**Making solids (Solids tab):**
- **Extrude:** pick closed chains, then Enter. A chain inside another makes a hole. Give the distance and the way
  to go: along the plane's normal, against it, or both ways. Choose a new solid, or add, remove or common with
  the last solid.
- **Revolve:** pick the closed profile chains, Enter, then pick the line to turn them about. Give the angle.
- **Box:** two corners on the active plane, plus a height.
- **Cylinder:** a centre, a diameter and a height.
- **Sweep:** pick the closed profile chains (one inside another makes a hole), Enter, then the path: a line, arc,
  spline or a chain of them, open or closed. Sharp or round corners; **Follow the path's turns** for helixes and
  twisting paths. Draw the profile at the start of the path, square to it (a plane of your own helps).
- **Loft:** pick closed sections in order, then Enter: a solid through them, smooth or straight between them
  (ruled). They must not be on the same plane and depth one after another. Start them at matching corners, or the
  loft twists.
- **Hole:** pick circles, then Enter. Each is drilled at its centre against the plane's normal from its depth, to
  a depth or through everything. A blank diameter uses each circle's own.

**Changing solids:**
- **Fillet** and **Chamfer:** click edges (a click adds or takes one away), then Enter. The edges are remembered by
  a point on each. When an earlier feature changes, they are found again, and a fillet whose edge has gone shows
  as failed instead of rounding the wrong edge.
- **Boolean:** add, remove or common one solid with another; the tool is used up.
- **Shell:** click the faces to take away (each click adds or takes one away; the face under the mouse shows blue),
  then Enter: the solid is hollowed to the wall, inward or outward. Outward, its outside edges come out round.
- **Draft:** click faces, then Enter: they tilt by the angle about where they meet the active plane at its Z, which
  stays put. **The other way** tilts them the other way.
- **Moving, turning and copying:** select solids (with entities and bodies or not) and use Transform: Translate,
  Rotate, Mirror, Scale, the arrays and To origin all take them. Each becomes a feature in the history (Move S1, or
  Copy of S1 for a new solid), so undo, leaving it out and editing what comes before all work. At most 100 copies of
  solids at once. A copy follows its solid's history up to the move; deleting the solid deletes its copies too.
- Faces picked for Shell and Draft are remembered by a point on each, like fillet edges, and found again when an
  earlier feature changes.

**When the kernel takes long:**
- A solid that takes more than 4 seconds to build shows **Stop** in the status bar. Stop restarts the kernel and
  leaves out the feature changed last, so the rest builds; tick it again to try it again.
- If the kernel stops by itself (out of memory, say), it is started again and the solids are rebuilt, once.
- Solids are drawn as finely as their size needs (a ten-thousandth of their diagonal, from 0.0005 to 0.02 in), so a
  big part does not come out as millions of triangles.

**The history** is in the panel on the left, under Solids:
- The tick says whether the feature built; a ✗ shows why it didn't.
- Untick a feature to leave it out, or click its name to change its numbers. Everything after it is rebuilt.
- Undo and redo cover the history too.
- Deleting a selected solid removes the features that made it.
- Analyze → Body gives a solid's size, volume and area.

**Wireframe from solids** (Solids → Wireframe), to send a solid out as a DXF (for an EDM, say). The curves are the
solid's own, exact: lines, arcs and circles, and its splines as the NURBS they are. They are not traced from the
triangles on the screen.
- **Edges:** click a solid and every edge of it becomes wireframe.
  - **Flattened** (at first): the edges are laid on the active plane at the Z given, as seen square to it. An edge
    seen end on goes; a top edge and the bottom edge under it become one. The result is ready for a DXF. This is
    Mastercam's "edges, then flatten" in one go.
  - **In 3D:** each edge goes on the plane it lies in, and a plane is made for each tilt. An edge that lies in no
    plane (a curve round a chamfer, say) is laid on the active plane. Flatten them later.
- **Face curves:** click a face and its edges come out. A flat face gives them on its own plane, at its height, so
  the top face of a part gives its outline ready to save.
- **Section:** where the active plane, at the Z given, cuts the solids shown: their outline at that depth, closed.
  It is the cleanest way to get a profile from a part with chamfers or steps.

The new curves are selected, ready for Flatten or Delete.

**STEP:**
- STEP files open as solids, and can be moved, turned and copied like any other.
- **File → Export 3D → STEP** writes them in millimetres, at their true size; every CAD system reads that,
  Mastercam included.
- STL, OBJ and 3MF exports include the solids' triangles.

## 3D: bodies

STL, OBJ and 3MF files open as bodies: triangle meshes that are shaded, picked and measured. They are not edited
face by face.

- **The view cube**, top right: click a face to look at it. Top, Front and Right also set the drawing plane.
  Middle drag turns the view freely.
- **View → Bodies:** Shaded, Shaded + edges (the sharp edges drawn), or Wireframe.
- **Section** cuts the bodies at a plane square to X, Y or Z. The inside shows red where it is cut. Keep the
  other side flips it. It stays on until View → Section off.
- **Analyze:**
  - **3D distance** between two points. A point can be a wireframe snap, a body's corner (within 12 pixels of
    the click) or a point on a face.
  - **Body** gives the triangles, size, extents, volume and surface area, and whether the mesh is closed. A mesh
    with holes has no real volume.
- **Transform:** Translate, Rotate, Mirror, Scale and the arrays move bodies too, in the active plane.
- Click a body to select it, or take it in a window. Delete removes it.

**Units:** STL and OBJ do not record their units, so the page asks: millimetres or inches. It remembers the last
answer. 3MF records its own. Bodies are saved as STL, OBJ or 3MF in millimetres, all visible bodies in one file.
They are kept in the `.mach1cad` project file too.

## Drafting

**Dimensions and notes** (Drafting tab) are drawn with a single-line font, so they are plain lines on the screen
and in SVG and PDF.

- **Linear:** horizontal, vertical or aligned. Click two points, then where the dimension line goes.
- **Radius** and **Diameter:** pick an arc or circle, then where the text goes.
- **Angle:** pick two lines on the sides to measure, then where the arc goes.
- **Ordinate:** X or Y from a datum. Click the datum (zero) once, then for each point the point and where its text
  goes; the values are signed. Escape starts again with a new datum.
- **Note:** type the text, its height and angle, then click where it starts.
- **Leader:** type the text, then click where the arrow points and the points the leader goes through; Enter
  finishes it with a shelf and the text.
- **Centre mark:** click arcs and circles: a small cross at the centre, or centre lines (the centre line style)
  across the circle and a little past it.
- **Hatch:** pick closed chains, then Enter. Lines at the angle and spacing fill them; a chain inside another is a
  hole. **Cross** hatches both ways. The hatch keeps its own copy of the boundary: change the chains later and it
  stays as it was (delete it and hatch again). It is never part of a chain, so the part still extrudes. Its angle
  and spacing can be changed in the panel. At most 50,000 lines.
- **Note to lines:** select notes, dimensions, leaders or hatches, then Enter: each becomes the lines it is drawn
  with, for engraving or for another program.

**Settings:**
- Decimals, text height, and typed text in place of the measurement (`<>` stands for the measurement, as in
  `<> TYP`).
- The font covers capitals, digits, Ø ° ± and common signs. Lower case shows as small capitals.

Hatches go to DXF as plain lines (R12 has no hatch). Dimensions are not tied to the geometry: they measure the
points they were given. They move, turn and scale with
a transform.

## Transform and Analyze

**Transform** works on the selection, in the active plane:
- **Translate** (X and Y, or from a point to a point), **Rotate**, **Mirror** (about X, Y or two points) and
  **Scale**, each as a move or a copy (with several copies);
- **Rectangular** and **Polar** arrays.
- **To origin:** click a point of the selection; the selection moves so the point is at X 0, Y 0.
- **Flatten:** lays the selection on the active plane at a Z, as seen square to it (Mastercam's Project), moved or
  copied:
  - an arc on a tilted plane comes out the exact ellipse (a spline), and splines stay exact;
  - something seen edge on becomes the line it shows as, and something seen end on goes;
  - then (at first) the duplicates this makes are taken away, pieces lying on others too.

  Planes that Edges made, and that are now empty, go as well.

If nothing is selected, the command asks you to select first. Entities on other planes are left as they are. Solids
are moved too, as features in their history (see Solids).

**Analyze:**
- **Distance:** dX, dY, length and angle.
- **Entity:** type, ends, centre, radius, sweep and length.
- **Chain area:** area and length of the chain an entity is in.
- **Check chains** looks through what is selected (or everything shown) before you make a solid or send a part out,
  and lists, with where they are, marked red on the drawing:
  - **gaps** up to a size (0.01 in at first) between ends that nearly meet;
  - **open ends**, and **branches** where three or more ends meet;
  - **overlaps and duplicates**, and entities **shorter** than a size.

  It selects what is wrong, ready to delete or fix.

## Files

| | Open | Save |
|---|---|---|
| MACH1 CAD (`.mach1cad`) | yes | yes: the whole drawing, levels, planes and the history included |
| DXF | yes (ASCII) | yes (R12, inches); a solid goes out through Solids → Wireframe first |
| SVG | yes | yes (Top plane only, with the dashes and widths) |
| PDF | yes: the first page's lines and curves, at full size | yes: one page at full size (Top plane only, with the dashes and widths) |
| STL (binary or ASCII), OBJ, 3MF | yes, as bodies | yes, in millimetres |
| STEP (`.step`, `.stp`) | yes, as solids | yes, in millimetres |
| DWG (AutoCAD, any version LibreDWG reads) | yes, like DXF | no: save DXF |
| Mitsubishi EDM drawings (what the machine saves as `.dwg`) | yes: lines, arcs, circles, points and exact splines | no: save DXF |
| Files compressed with Unix `compress` (`.Z`) | yes: unpacked, then read as what they hold | no |
| IGES (`.igs`, `.iges`) | yes, as bodies to look at and measure | no: save STEP |
| Mastercam `.mcam` | no | no |

**Opening and importing:**
- **Open** starts a new drawing from the file. **Import** adds the file to the one you have, matching levels by
  name. You can also drop a file on the drawing.
- The drawing is also kept in the browser, so it is still there when you open the page again. It is saved a
  second after each change, when the page is idle, to the browser's own database (IndexedDB), meshes and STEP files
  included. Open the page as `CAD.html#fresh` to start with an empty drawing.
- A STEP file's text is kept once in the drawing, not copied into the solids history or into undo.
- **Mastercam files cannot be read** by anything but Mastercam: the format is closed. In Mastercam use File → Save
  As → STEP or DXF, and open that here.

**DXF in:**
- Reads lines, arcs, circles, points, polylines (bulges become exact arcs), splines, ellipses (as exact NURBS),
  blocks (moved, turned, scaled and arrayed), layers (as levels), colours and `$INSUNITS` (millimetre files are
  turned into inches).
- Entities drawn in the front or side plane (their extrusion direction) go onto that plane. Tilted ones go onto a
  plane of their own (see Planes). Only what is tilted inside a block is still laid flat onto Top, and the page says
  so.
- TEXT and MTEXT come in as notes (MTEXT's formatting is taken out). Dimensions come in as the lines and text
  their blocks draw.
- Line types (an entity's own, or its layer's) come in as line styles, and line weights as widths: up to 0.30 mm
  thin, up to 0.55 mm medium, more thick.
- Hatches and the rest are counted and left out.
- An entity with numbers that are not finite, or larger than a billion inches, comes from a damaged file: it is left
  out and counted. Reading stops at 2,000,000 entities.

**PDF in:**
- The first page's paths (stroked or filled) come in at full size, 72 points to the inch, through the PDF's own
  transforms.
- Béziers that are circular arcs become exact arcs, and the pieces of one circle become a circle.
- Text is counted and left out. A scanned drawing has no lines to read.
- pdf.js reads the file inside the page; it is loaded the first time a PDF is opened.

**Which reader:** what a DXF, DWG or `.Z` file holds decides how it is read, not its name. A file compressed with
Unix `compress` is unpacked first. A file that is none of these says so.

**Mitsubishi EDM drawings in:** the CAD on Mitsubishi wire EDMs saves drawings in a format of its own (it starts
`MSWIN V4.0`), compressed, and names them `.dwg` though they are not AutoCAD's. The page reads them:
- lines, arcs and circles exactly, points (start holes), and the curves (a gear's involute flanks, say) as the exact
  NURBS splines they are drawn with. The arcs the machine fits to each curve are left out.
- The files do not say their units, so the page asks: millimetres or inches. It offers the likely one from how big
  the numbers are (a part over 12 units across is taken as millimetres).
- Gaps the drawing has (a tab the slug hangs on, say) stay gaps: Check chains finds them.
- The format is not published: it was worked out from the machine's own files, and has been checked on gear
  profiles of lines, arcs and splines. Something else in a drawing (text, say) is counted as not read.

**DWG in:**
- Read with LibreDWG inside the page, then taken in exactly as a DXF would be: layers, blocks, planes and
  `$INSUNITS`.
- What it does not read (text, dimensions, hatches, tables, 3D faces and solids, viewports) is listed when the
  file opens.
- Saving DWG is not offered: LibreDWG's writer is not reliable. Save DXF, which every CAD program opens.

**IGES in:**
- Comes in as bodies (triangles) at its true size: you can see it, section it, measure it and snap to it.
- The solids kernel in this page cannot read IGES. For a solid you can change, save the part as STEP instead.

**STEP assemblies** whose parts are saved in separate files hold no geometry of their own. The page says so; open
the part files.

**DXF out:** R12, which every CAD program reads, in inches:
- Arcs and circles on the Front or Right plane are written in their own coordinate system.
- Splines become 3D polylines within 0.0002.
- Notes are written as TEXT. Dimensions are written as their lines plus TEXT, so other CAD programs show them as
  drawn, though not as dimensions they can edit.
- Levels become layers.
- Line styles become the line types DASHED, CENTER, HIDDEN and PHANTOM. R12 has no line widths, so widths are kept
  only in the `.mach1cad` file.
- Construction geometry is left out.

**SVG in:**
- Reads paths (Béziers as exact splines, arcs exact), rectangles (rounded too), circles, ellipses, lines, polylines
  and polygons, through their transforms.
- Sizes come from the drawing's width, height and viewBox, so millimetre drawings come in at size. Plain numbers
  are pixels, 96 to the inch.
- Black lines come in in the screen's colour.

## Big drawings

The page is built to stay quick with tens of thousands of entities, meshes of a million triangles and STEP files of
tens of megabytes:
- Entities are drawn in blocks of 2,000 per level and colour, and picked through boxes on the screen.
- Chains are worked out once after each change. Spline crossings are found once and kept.
- A transform's preview moves one picture of the selection rather than making it again.
- Meshes are read, and their edges and picking trees worked out, in a worker of their own. The solids kernel runs
  in another.
- Undo keeps up to 500 steps and about 250 MB; the oldest go first.

**Limits on what one command makes:** 1000 copies (Offset, Translate, Rotate), a polygon of 1000 sides, 10,000
copies in a rectangular array, 3600 in a polar one, and 200,000 new entities at once. Asking for more says so.

`node test/cad-stress.js` measures these against time budgets (see Tests).


## Library

The page is built from these files:

| File | What it holds |
|---|---|
| `lib/cad-geom.js` (`CADGeom`) | the exact 2D geometry: intersections, nearest points, trim, extend, divide, fillets, chamfers, offsets, chains, areas, transforms, NURBS (evaluation, splitting, ellipses, splines through points) |
| `lib/cad-model.js` (`CADModel`) | the drawing: entities, levels, planes, undo as small changes, the `.mach1cad` file |
| `lib/cad-draft.js` (`CADDraft`) | notes and dimensions, and the single-line font |
| `lib/cad-io.js` (`CADIO`) | DXF, DWG (through DXF), SVG and PDF |
| `lib/cad-kernel.js` (`CADKernel`) | the solids: the feature history replayed on replicad and OpenCascade, edges found again from points, meshes for the screen, STEP in and out |
| `lib/cad-mesh.js` (`CADMesh`) | STL, OBJ and 3MF (its own small zip reader and writer), mesh size, area, volume and closed check, transforms; welding, sharp edges, normals and a box tree for picking, with typed arrays for big meshes |
| `lib/cad-icons.js` (`CADIcons`) | the ribbon's icons, drawn for the page |

All three run in Node too: see `test/cad-test.js`.

## Size

The page is about 19 MB. It holds:
- three.js;
- the OpenCascade kernel as WebAssembly (7 MB packed);
- LibreDWG for DWG (2 MB);
- a second, smaller OpenCascade build for IGES (3 MB).

It opens in a moment. The kernel unpacks in the background. The DWG and IGES readers start only for their files
and are closed afterwards. Nothing is fetched: the page works from a USB stick or a shared folder.
Every third-party part and its licence is listed under File → About and licences, and in `vendor/cad/SOURCES.md`.

## Tests

- `MACH1_CAD_FILES=<folder> node test/cad-files.js` reads every drawing in a folder in place, with the page's own
  readers. It reports what came in, what was left out and how long it took. Use it on your own files: they are
  never copied.

- `node test/cad-test.js` checks the geometry and the files against known answers, with exact round trips: among
  them, files compressed by `compress` with 9, 12 and 16-bit codes, and a made-up Mitsubishi EDM drawing
  (`test/cad-mswin-sample.js`). It also checks the search: about 60 plain-language queries (*round the corners*,
  *put a hole in my part*, *cutter comp*, typos too) each find the right command or recipe, first or among the first
  three, and every recipe step names a real command.
- `node test/cad-solid-test.js` runs the solids on the same kernel files the page inlines. It checks extrude,
  holes, pockets, fillets and chamfers found from points, revolve, primitives, booleans, replaying, a fillet whose
  edge is gone, STEP out and back, moves, copies, mirrors and scales by a matrix, shells inward and outward,
  drafts, sweeps along a line and an arc, and lofts, all against exact volumes; and a solid's edges, a face's edges
  and a section as exact curves.
- `node test/cad-browser.js` builds nothing; it drives `apps/CAD.html` in headless Chrome. It:
  - types points and clicks entities;
  - fillets, divides, undoes, window-selects and copies;
  - round-trips the project file, DXF and SVG;
  - opens an STL (answering the units question), picks it, moves it, measures it, sections it and round-trips it
    through 3MF and the project file;
  - extrudes a plate with a hole by clicking its chains and fillets four edges by clicking them, checking exact
    volumes; then edits the extrude depth, leaves the fillet out and undoes that, and round-trips STEP;
  - opens a Mitsubishi EDM drawing named `.dwg` (answering its units question), a compressed DXF named `.dwg`,
    and refuses a `.dwg` that is neither;
  - opens LibreDWG's sample DWG (`test/data/cad`) with its layers, and an IGES cube when `tools/vendor-cad` is
    installed;
  - moves an entity, a body and a solid to a new level, hides it, undoes, and copies to a level;
  - selects a level (and adds one with Shift), deletes a level both ways and undoes, runs Select by, Invert, Select
    last and Remove duplicates, and goes back and forward through the history timeline with real clicks, after
    hovering over a step;
  - presses every key in the keys table, and checks what the main ones do;
  - right-clicks the drawing to open the search, and checks that a right-drag still pans and the wheel still zooms
    with it open (by the same amount, over the box too); finds Fillet from "round the corners" and runs it with
    Enter; picks a result mid-command, with the arrow keys, from the status bar and from the keys; checks that a click
    in the box selects nothing under it, and that every ribbon command has its words; opens a How to recipe, and
    runs a step from it;
  - moves and copies a solid with Translate, shells it by clicking its top face, lofts two squares and sweeps a
    circle along a line, checking the volumes;
  - takes a filleted, drilled block's edges in 3D and flattens them (a closed outline of the right area, out to DXF),
    takes them flattened at once, its top face's curves, and a section;
  - makes a plane through 3 points, draws a circle on it and extrudes it (the volume, along its normal), looks along
    it, takes it again with Alt+X, and sends it to DXF and back;
  - draws centre lines, a leader, two ordinates from one datum, a hatch with a hole (no line in it, the right total
    length), and turns a note into lines;
  - runs each shop command (bolt circle, arc centres, points along, break into pieces, ellipse, close arc, fillet and
    chamfer chains, stretch, to origin, bounding box, check chains) and checks what it made;
  - types a line's length, drags a grip with the mouse (the arc joined there follows), changes a rectangle's width,
    moves it (it stays a rectangle) and breaks it (it does not);
  - draws an endless line, snaps to where it crosses a line, clicks it after a pan, trims it to a ray, and checks
    that fit and DXF out leave it out;
  - draws with a line style and width from the status bar, makes a side of a rectangle construction (its chain opens),
    and checks DXF out leaves construction out and writes the line type;
  - checks every ribbon button has an icon;
  - reopens the page and finds the drawing, a body and a STEP solid autosaved, with the same history (undo still
    works), and opens the project file Save wrote with its history;
  - checks the page throws nothing and fetches nothing from the network.
- `node test/cad-stress.js` drives the page with big drawings it makes itself and times the main thread against
  budgets:
  - 400 closed squares in Extrude and Revolve;
  - a 20,000-entity DXF (open, hover, pan, zoom, edit, undo, window select, a big Translate preview, Remove
    duplicates);
  - 300 crossing splines, a 1,000,000-triangle STL, a 20 MB STEP with 20 edits, and a solid with 400 holes;
  - damaged DXFs, a 1000 × 1000 array, and the kernel stuck and crashing.

  A step that hangs is stopped and reported as frozen.
