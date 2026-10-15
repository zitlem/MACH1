# Mazatrol Editor

`apps/Mazatrol Editor.html` edits Mazak Mazatrol programs in a browser, laid out the way the control and MazEdit
show them. It is one offline file: open it in Chrome or Edge (they can save back into the file you opened; other
browsers save as a download).

## Files it opens

| Machine  | Matrix | Smooth | Smooth machine file |
|----------|--------|--------|---------------------|
| Mill     | `.PBD` | `.PBM` | `.MAZ` |
| Lathe    | `.PBF` | `.PBP` | `.MTP` |
| Mill-turn | `.PBE` | `.PBN` | `.MPR` |

Also tool data (`TOOLDATA`, `TOOLFILE`: `.DBD` Matrix, `.DBM` Smooth), a Smooth machine's control memory
`m8ysram` (its tool data, read-only), and EIA/ISO programs (`.EIA` `.NC` `.TAP` `.CNC` `.ISO`).

Open files stay open when the page is refreshed or opened again, with their unsaved changes (kept in this
browser, not uploaded; undo history is not kept). Save still writes into the file it came from. The opened folder
comes back too; if the browser asks again, PROGRAM FILE opens it.

Drop files on the window, use Open, or start with New. **Open folder** reads a whole folder, for example a Smooth
CAM Ai machine folder (`C:\Users\Public\Documents\MAZATROL\Smooth\<machine>`) or the folder of all machines.

## Editing

- The top row has the file keys (New, Open, Open folder, Save, Save as, Print) and Light / Dark (the screen colors; dark
  by default, the light one is the control's white screen; remembered in this browser). The bottom row is soft keys,
  as on the control: ◀, ten keys, ▶ (◀ ▶ page through a menu, ◀ on its first page goes back up; ▲ opens another
  menu). Program menu: WORK No. (another open program), SEARCH (UNIT No. SEARCH, UNIT SEARCH, LAST SEARCH),
  PROGRAM EDIT, TPC, TOOL PATH (plot), MACHIN. TIME, PROGRAM LAYOUT (run order and priority numbers), HELP,
  PROGRAM FILE (the opened folder); ▶ TOOL DATA, COMPARE. PROGRAM EDIT turns editing on and shows INSERT UNIT,
  INSERT LINE, ERASE, COPY, PASTE, MOVE UP / DOWN, AS TEXT, UNDO, PROGRAM COMPLETE (ends editing); ▶ DUPLICATE,
  CUT, REDO .... While editing, a field's choices (PTN, tools, directions ...) are the soft keys (Alt+1 ... Alt+0).
- **Colours on the program screen** follow the control: white is a value the user typed, yellow is one the control worked out
  (an approach point set by AUTO SET, a `?` left for it, and always the priority number column), green is fixed text such as
  unit and tool names, and a magenta box marks the second variant of a menu value. Per the programming manuals the second key of
  each pair means: PART *OUT, *IN, *FCE, *BAK = the "middle type" (cutting starts from the middle of the outer / inner periphery or
  of the front / back face, not from the open end); a lathe tool's section *IN, *EDG = the back-side (BAK) tool; *CCW and *CW on a
  circular-milling tool line = the direction of the circular tornado cycle (unit TORNA. 1; in the sample data all 49 lines with
  TORNA. 1 are starred, those with 0 are plain). Typing a value over a calculated one makes it white.
- **Unit list** (left of the program, as on the control; the Units button at the top shows or hides it, kept in this
  browser; hidden by default on a phone): UNo and name of every unit, ⦸ for control out, + for a unit with its own TPC,
  the unit at the cursor highlighted. Click one to go to it.
- Files open **view only**. **PROGRAM EDIT** (or Ctrl+E) turns editing on until **PROGRAM COMPLETE** (or Ctrl+E
  again). New programs start in editing.
- Move with the arrows, type a value and press Enter. A number field also takes arithmetic, worked out for you:
  `2.5/2`, `1.5+0.03`, `(3-0.25)*2`; starting with `*` or `/` works on the field's value (`/2` turns a diameter into
  its radius), and a letter in front is kept (`R2/4` gives R0.5). The message line shows the working. Fields that take
  text, such as a tap size (3/8-16), take it as typed. The line under the program says what the field is and
  offers its menu choices as keys (Alt+1…9). ◆ marks fields that do not apply with the current settings.
- The guidance box under that line (as for EIA programs) explains the line at the cursor, field by field, with the
  field at the cursor highlighted (the Guide button at the right of the line above it collapses it to its title line
  and the pill of the field at the cursor, or opens it again, as does a tap on the title; it starts collapsed on a phone and remembers your choice):
  - hole-pattern lines (PT, LINE, SQUARE, GRID, CIRCLE, ARC, CHORD): what each field means for that pattern
    (Q = whether the start point is machined or only positioned; F = pitch or total; P = corner holes / chord
    side / path order; R = return level), and a drawing of the holes in order, skipped ones hollow;
  - tool lines: what the cycle chosen does (DRL T, PCK1–5, AUTO, boring cycles 1–6, TAP / PECK / PLANET ...) and
    what HOLE-D, PRE-DIA, PRE-DEP, DEPTH ... mean for that tool (for a drill PRE-DIA / PRE-DEP are where and how
    much the feed changes near the bottom; for a chamfer cutter HOLE-D 99.9 means nothing in the way);
  - unit lines and the common unit: what the unit does and each of its fields;
  - MANL PRG lines: the block's G-code with each address and its value, and what its M-code does;
  - M fields (tool lines, M-CODE unit): each M-code on the line (one that is not in the machine's list says so: an option
    or a machine-builder code);
  - drawings on mill lines too: START / END (OPEN, CLOSE) of line milling, the approach point, INITIAL-Z and the
    multi-workpiece pitch;
  - tool data: each field of the line (nose radius or actual diameter, wear, tool set, life …);
  - lathes and mill-turn, with a drawing of the field at the cursor (PART, the BAR / groove / thread / drill patterns,
    MODE of milling units, the stock sizes, the infeed point, the finishing allowances): the turning units (MATERIAL, BAR, CPY, CORNER, FACING, THREAD, T.GROOVE, T.DRILL, T.TAP, HEAD,
    TRANSFER, TOOL MES, WORK MES), their tool lines (what PAT. #0–#4 does for that unit, DEP-1/2/3, FIN-X/Z) and shape
    lines (X in diameter), the lathe common unit (OD-MAX, ID-MIN, LENGTH, WORK FACE, RPM), and MODE on milling units.
  A radius shows its diameter beside it (Ø): corner and arc radii, a circle pattern's radius, polar R/θ points, the
  lathe's cut depths per side, EIA G02/G03 R (an R level, an offset number or a taper angle does not). Lines with no
  explanation of their own (C- and Y-axis hole and shape lines) list their fields with the control's prompts.
  Hard-to-read prompts are said plainly (for example OMIT SPT: "the start point (first hole): 0 = machine it,
  1 = only move there").
- Delete (or Clear field, next to the entry line) clears a field. Ins inserts a line, Ctrl+Del deletes the line or unit, Ctrl+Z / Ctrl+Y undo and redo,
  Ctrl+S saves.
- **Control out**: **CONTROL OUT SET** / **CANCEL** (PROGRAM EDIT, third page of keys, or right-click) make the units of
  the selection (or the unit at the cursor) run again or be skipped by the control, as on the machine: greyed with a
  ⦸ mark, not in the tool path or its time, and not checked. It is one byte of the unit (byte 87), so nothing else in
  the program changes. Smooth programs only; the common unit and END cannot be controlled out.
- **Units**: Insert unit (above the unit at the cursor), Duplicate (Ctrl+D), Cut / Copy / Paste (Ctrl+X/C/V;
  units paste above the unit at the cursor, lines after the cursor line; also between programs and between Matrix
  and Smooth), move up and down (Alt+↑↓). Shift+click or Shift+arrows select several. **Right-click** a unit or
  line for all of these.
- **Save as** converts between Matrix and Smooth of the same machine, or saves a Smooth program as the control's
  own `.MAZ` `.MTP` `.MPR`.
- **TPC** shows the TPC setting records. On a TPC value the control sets bit by bit, **Bits…** shows each bit
  with a box to note what it does (kept in the browser; Export / Import share the notes).
- **Print**: the listing, or a setup sheet of the program's tools; both can also be saved as text.

- **As text…** (or right-click a unit: *Edit lines as text…*) shows the unit's hole, shape or MANL PRG lines as
  text: one line per row, tab-separated (as Excel copies; commas or spaces also work). Copy them out, or paste a
  list of any length. The `#` line names the columns the rows hold: give fewer (`# X Y`) and the other fields come
  from the lines there now. MANL PRG lines read as words (`G1 X1. Y2. F10. S2500 M3`). Every row is entered as if
  typed and checked before Apply: bad values (with the line and column), a shape that does not close, an arc that
  cannot reach its end point, repeated or far-off holes, too many lines. A preview draws the new lines over the
  old. Apply (Edit mode) writes them as one undo step.

- **TPC** (soft key) opens the TPC screen of the unit at the cursor, laid out like the control's: D number, name and
  value (PARAMETER), and RELAY POINT; PREV. UNIT / NEXT UNIT, TPC CANCEL (back to how it was), TPC END. Values are
  edited in Edit mode. TAPPING, DRILLING, REAMING, BORE T1, S1, T2 and S2, RGH CBOR, STEP, TOP EMIL, PCKT MT, PCKT VLY, CHMF RGT, CIRC MIL, SLOT, FCE MILL, POCKET, the LINE units (LFT, RGT, IN, OUT, CTR) and CHMF LFT, IN and OUT
  are decoded on the mills, and on a turning centre BAR, CORNER, CPY, FACING, THREAD, T.GROOVE, T.DRILL, T.TAP and TRANSFER (TC fields) and the lathe point units (CBOR-TAP, RGH BCB, BK-CBORE too); CORNER's rotate positions and the M codes of MMS and TRANSFER show on the RELAY POINT tab
  (test programs with every value changed, edited on the control; Smooth and Matrix mills share the layouts; metric programs store lengths with one decimal fewer, read on a metric mill); other
  units' TPC records are shown as stored until they are decoded the same way. Every field the control shows a default for is compared
  with it: a changed value turns yellow, and on a bit field (D91, D92, E92 ... E104) the panel lists each bit with its default and marks only the bits that
  differ; bits nobody has identified say "To be determined". The **RELAY POINT** tab shows a unit's relay
  points when the control has them on MANU: the approach and the escape, each with up to three points (X Y Z, M, S). Units whose layout is not decoded
  on lathes and mill-turn show every TPC field with its parameter (TC37 …) named from the machine's parameter list. A unit without a TPC record runs
  with the machine's parameters (record layouts, bit meanings and defaults: [TPC.md](TPC.md)). **TPC LINES** (program menu, ▶) shows the raw TPC records in the listing.

- **PROGRAM CHECK** (soft key) lists what the control would stop on, each with what to check (mill-turn EIA programs also: Y past the stroke, a
  diameter past the X travel, B outside −30°…210°, for the larger mill-turn models), with its alarm numbers: no END unit (647), priority
  clashes (461, 462), units without shapes (452), FR or NOM-D 0 (621, 635), M-codes that cannot share a block (227),
  repeated shape points (698), SUB PRO programs not open, tools missing from the machine's tool data, and tools too big
  for the magazine (50-taper horizontal: longer than 500 mm / 19.69 in from the taper face, wider than 260 mm, or over
  125 mm on a 43/60-tool magazine or 135 mm on an 80-tool or larger magazine, which needs the pockets next to it empty;
  the 30 kg tool mass is not in the tool data, so it isn't checked); for EIA programs, G- and M-codes the control does not
  know (808, 661), and macro statements: unpaired brackets, unknown functions, GOTO targets that aren't there, WHILE /
  DO / END pairs, and called programs that aren't open. Click one to go there.
- **CODES ALARMS** (soft key) opens the reference, searchable: G-codes and M-codes for a mill (Mazak horizontal), a lathe
  (Smooth G) or a mill-turn machine (Smooth Ai) — the program's own machine first; the same lists name the codes
  next to M fields, in MANL PRG and EIA lines, and in the program check; alarms (number, title, how it stops and clears; the cause and
  action load from the control's own alarm help file, iAlarmHelp_NC.txt, or a machine's PLC alarm texts such as ENGA0000.ALM); every TPC parameter with a drawing of what it
  adjusts (mill), or the machine's user parameters for programming by group (lathe, mill-turn: hole machining, line and face, EIA, system, turning; in our own words). Alarms: the control's list
  with the model's own machine alarms (★) over it for a lathe or mill-turn, and for common program alarms what to check.
  Variables: the macro and system variables (#1–#33 arguments, #100 / #500 common, #3000 alarms, #5001 positions, #5221 work
  offsets, tool offsets …); the guidance box names each # on an EIA line, and for the measuring macros (G65 P9010–P9020:
  probe calibration, work zero from a face, hole, groove, projection or boss, measuring the part) it shows the macro and what each argument is. The TPC screen shows the same drawing for the field at
  the cursor, with its value.

- **TOOL DEVELOP** (PROGRAM EDIT ▶) fills a DRILLING, RGH CBOR, REAMING or TAPPING unit's tool lines (on lathes and mill-turn also
  BAR, CPY, CORNER, FACING, THREAD, T.GROOVE, T.DRILL and T.TAP: R and F tools for the side PART cuts) from its data the way
  the control's automatic tool development does (spot drill, drills by hole size, peck cycle by depth, chamfer cutter,
  end mill, reamer, tap). The machine parameters it uses (D2, D4, D6–D15) are shown and can be set to your control's
  values; speeds and feeds are left to you.

## EIA/ISO programs

G-code programs open as text: edit, undo, save. The line at the bottom says what the block at the cursor does, and
the guidance box under it shows the command's format: each address with its meaning and the value the block gives,
required ones that are missing in red, other words the block gives, what each M-code does, and for a line with only X/Y/Z inside a canned cycle, that it is the next hole.
The mill / lathe / mill-turn buttons set the machine type (lathes read X as a diameter and have G71/G70).

## Plot

- Mazatrol programs: the shapes, hole patterns and MANL PRG moves, and the cutter path of each unit (blue).
  Mills: top, front, right or 3D (drag to turn, Shift+drag pans, wheel zooms, double-click fits). The view cube
  in the corner shows which way the part faces: click a face for that view, a corner dot for a 3D view from that corner. Lathes: Z across,
  radius up. Mill-turn: turning or milling view.
- Tool lines with priority numbers (No.) run in that order, as on the control: top to bottom up to the first
  one, then all of them lowest number first, then the rest of the program top to bottom (lines marked * last).
  An MMS unit's own No. counts too (its tool is on the unit line). Checked against the control's own order (its time records
  are in run order): the same for 39 of the 45 programs of the two horizontals that could be compared.
  This reaches across the programs SUB PRO units call (one tool can do OP1 and then OP3 before it changes), but
  not out of a process: a pallet change (PALT CHG) or a PROC END unit ends one.
- **Time** opens the machining time window: where the time goes by unit (a called program's units under its SUB
  PRO unit) or by tool, a strip of the run in machining order colored by tool, and tool changes (enter seconds per
  change to add them). Hover a row or a piece of the strip to see it on the plot, click to go to the unit, double-
  click to play the path up to its end; sort by any column. ⧉ opens it in a window of its own.
  **Run order** lists every tool line in the order it will run (called programs included) with its priority No.
  With Edit on: type a No., drag a line, or use ▲▼. A move changes only that line's No. when one number puts it
  there (without sharing a No. with another tool); otherwise the lines above the divider are numbered 1, 2, 3 ....
  Dropping a line on the divider moves it across: below it, a line has no No. and runs after the numbered ones.
  Changes go into each program (a called program must be open in its own tab) with Undo there. It warns where
  the control would stop: one No. on two tools in a process (alarm 461), a unit's lines out of order (alarm 462).
  Times use rpm from the tool's **actual** diameter, as the control does: the diameter in the tool data the
  program is checked against (Tools), or one entered in **Dia for rpm** (tools view; kept in this browser), else
  MANL PRG blocks are timed at their own S (rpm) and F (G94 per minute, G95 per revolution, none given: per revolution below 1): within
  3% of the control's for the 7 manual units of the two horizontals it timed.
  An open line (START / END open) runs on past its ends by the cutter's radius when it is cut along its centre, and by the clearance
  alone along a side. Fitted to the control's own times for 755 units of the two horizontals: the whole set comes to within 3%
  of the control's (868 against 843 minutes).
  Face milling follows the control's own pass pattern (X/Y, bidirectional or one-way), planetary taps mill the
  thread in one orbit, and rapids allow for acceleration.
  Units that take time without cutting count fixed seconds, set in the Time window: INDEX, PALT CHG and M-CODE, and for MMS
  by what each probe line measures (Z-FACE 3 s, X-FACE 1.8, Y-FACE 2.1, X-STP and Y-STP 5.2, Y-GRV 3.1, XY-BOS 8.5,
  BORE-XY 7.1: a fit to the 190 MMS units of two horizontals that the control timed; a total within 1%), or the seconds
  you enter there for every probe line. Units under control out are not run, so they take no time. Defaults come from a Smooth horizontal's own estimates; with them, 42 of its programs total within 1% of the
  control's estimates.
  NOM-D. A chamfer mill uses the middle of its edge, (NOM-D + MIN-D) / 2, from the TOOL FILE (read from a
  machine's m8ysram, a TOOLFILE file, or an opened folder). An end mill whose cutting diameter is not its NOM-D
  takes its actual diameter from the tool data, or the one entered.
- Hole patterns plot as the control machines them: F = 1 makes T1 / T2 (ARC: AN2) totals, Q = 1 leaves the start
  point out, P = 1 leaves out the four corners (SQUARE, GRID), CHORD holes sit at the chord's ends.
- Lathe and mill-turn turning units follow the programming manual: BAR PAT. #1 pulls out at 45°, #3 / #4 stop the feed
  every DEP-2 for the chip to break; T.DRILL #0–#4 (feed or rapid out, back off, reamer, shorter pecks); THREAD with
  its NUM passes, standard or constant depth, LEAD as shown; T.GROOVE forms #1–#3 leave FINISH for the F tool; a
  shape line's RGH given as a feed is the finishing feed there. Milling units on a lathe (MODE XC face holes along Z,
  ZC holes in X, line milling along Z at C, XC / XY line milling across the face at its SHIFT-Z) are drawn in the
  turning view with their times. Face grooves cut to the FPT-Z the file keeps (the screen shows it blank). Mill-turn
  C-axis FACE units (DRILLING FACE, CIRC MIL FACE, LINE IN FACE ...) are drawn in the milling view, their holes and
  shapes given as R and angle round the C axis or as x and y on the face (PT, CIR and ARC holes; squares and circles). A C-SP under 1 is timed
  at the common unit's top speed.
- SUB PRO units plot the programs they call (Mazatrol or EIA) when those are open too or are in the opened
  folder, REPEAT times. Units after a program's END unit are not run, and the plot says so.
- EIA programs: every move the program makes (rapid dashed, feed green), with subprograms and macros followed;
  G68 / G68.2 (tilted frame, Euler angles I J K) and G12.1 polar interpolation (C as the face's second axis) are drawn.
  Lathes: G70/G71/G72 finishing and roughing, G73 pattern repeating, G74/G75 peck grooving and cut-off, G76 threading,
  G90/G92/G94 single cycles, G83-G85 face drilling, G87-G89 drilling along X. Mill-turn: the same as G270-G276,
  G283-G289, G290/G292/G294 (its G71.1-G89 are the milling cycles). The lathe manual's G71/G72/G73 sample programs
  are tests. A MAZATROL program written in the three-digit G-format ("(MG3-…)") opens as text: the guidance box names
  each unit block (G300 common unit, G320 BAR …, G424/G425 tool lines); it is not drawn.
- **Playback**: ⏮ ◀ ▶ ▶| ⏭ and the slider step one line at a time (an EIA block; a Mazatrol tool line and each
  shape or hole line it machines) or play at 1× to 1000×. The cursor follows. **From cursor** (or right-click ▸
  Plot from this unit) restarts at the unit or line at the cursor.
- The heading shows the range and an estimated cycle time.

The Mazatrol cutter paths are worked out by the editor and are approximate; the control works out its own from
its parameters. Cycle times use a nominal rapid rate.

## Tools, Compare, Folder

- **Tools** lists the program's tools and looks each one up in a machine's tool data (an open `m8ysram` or
  TOOLDATA file, or the folder's machine) the way the control does: by type, nominal size and suffix (and part,
  for turning tools). It shows the tool number, pocket, length and diameter, or that the tool is missing.
- **Compare** lists what changed between this program and another open one (for example the saved copy and the
  machine's copy), field by field.
- **Folder** lists every program in the folder with its comment and tool check, and searches every line of every
  program.

## Not done yet

Cutting-condition and parameter files (`CUTCND`, `USRPAR`, `MAHINPAR`), older controls, converting tool data
between Matrix and Smooth. Converting three-digit G-format text into a MAZATROL program.
