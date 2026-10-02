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
- Files open **view only**. **PROGRAM EDIT** (or Ctrl+E) turns editing on until **PROGRAM COMPLETE** (or Ctrl+E
  again). New programs start in editing.
- Move with the arrows, type a value and press Enter. The line under the program says what the field is and
  offers its menu choices as keys (Alt+1…9). ◆ marks fields that do not apply with the current settings.
- The guidance box under that line (as for EIA programs) explains the line at the cursor, field by field, with the
  field at the cursor highlighted:
  - hole-pattern lines (PT, LINE, SQUARE, GRID, CIRCLE, ARC, CHORD): what each field means for that pattern
    (Q = whether the start point is machined or only positioned; F = pitch or total; P = corner holes / chord
    side / path order; R = return level), and a drawing of the holes in order, skipped ones hollow;
  - tool lines: what the cycle chosen does (DRL T, PCK1–5, AUTO, boring cycles 1–6, TAP / PECK / PLANET ...) and
    what HOLE-D, PRE-DIA, PRE-DEP, DEPTH ... mean for that tool (for a drill PRE-DIA / PRE-DEP are where and how
    much the feed changes near the bottom; for a chamfer cutter HOLE-D 99.9 means nothing in the way);
  - unit lines and the common unit: what the unit does and each of its fields;
  - MANL PRG lines: the block's G-code with each address and its value, and what its M-code does;
  - M fields (tool lines, M-CODE unit): each M-code on the line;
  - lathes and mill-turn: the turning units (MATERIAL, BAR, CPY, CORNER, FACING, THREAD, T.GROOVE, T.DRILL, T.TAP, HEAD,
    TRANSFER, TOOL MES, WORK MES), their tool lines (what PAT. #0–#4 does for that unit, DEP-1/2/3, FIN-X/Z) and shape
    lines (X in diameter), the lathe common unit (OD-MAX, ID-MIN, LENGTH, WORK FACE, RPM), and MODE on milling units.
  Hard-to-read prompts are said plainly (for example OMIT SPT: "the start point (first hole): 0 = machine it,
  1 = only move there").
- Delete clears a field. Ins inserts a line, Ctrl+Del deletes the line or unit, Ctrl+Z / Ctrl+Y undo and redo,
  Ctrl+S saves.
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
  edited in Edit mode. TAPPING, DRILLING, CIRC MIL, LINE LFT, CHMF LFT, FCE MILL and POCKET are decoded (test programs with
  every value changed, on a Smooth and a Matrix mill; both use the same layouts); other
  units' TPC records are shown as stored until they are decoded the same way. On lathes and mill-turn every TPC field of
  the unit is shown with its parameter (TC37 …) named from the machine's parameter list. A unit without a TPC record runs
  with the machine's parameters. **TPC LINES** (program menu, ▶) shows the raw TPC records in the listing.

- **PROGRAM CHECK** (soft key) lists what the control would stop on (mill-turn EIA programs also: Y past the stroke, a
  diameter past the X travel, B outside −30°…210°, for the larger mill-turn models), with its alarm numbers: no END unit (647), priority
  clashes (461, 462), units without shapes (452), FR or NOM-D 0 (621, 635), M-codes that cannot share a block (227),
  repeated shape points (698), SUB PRO programs not open, tools missing from the machine's tool data; for EIA programs,
  G- and M-codes the control does not know (808, 661). Click one to go there.
- **CODES ALARMS** (soft key) opens the reference, searchable: G-codes and M-codes for a mill (Mazak horizontal), a lathe
  (Smooth G) or a mill-turn machine (Smooth Ai) — the program's own machine first; the same lists name the codes
  next to M fields, in MANL PRG and EIA lines, and in the program check; alarms (number, title, how it stops and clears; the cause and
  action load from the control's own alarm help file, iAlarmHelp_NC.txt); every TPC parameter with a drawing of what it
  adjusts (mill), or the machine's user parameters for programming by group (lathe, mill-turn: hole machining, line and face, EIA, system, turning; in our own words). Alarms: the control's list
  with the model's own machine alarms (★) over it for a lathe or mill-turn. The TPC screen shows the same drawing for the field at
  the cursor, with its value.

- **TOOL DEVELOP** (PROGRAM EDIT ▶) fills a DRILLING, RGH CBOR, REAMING or TAPPING unit's tool lines from its data the way
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
  Face milling follows the control's own pass pattern (X/Y, bidirectional or one-way), planetary taps mill the
  thread in one orbit, and rapids allow for acceleration.
  Units that take time without cutting count fixed seconds, set in the Time window: MMS per probe line, INDEX, PALT CHG and
  M-CODE. Defaults come from a Smooth horizontal's own estimates; with them, 42 of its programs total within 1% of the
  control's estimates.
  NOM-D. A chamfer mill uses the middle of its edge, (NOM-D + MIN-D) / 2, from the TOOL FILE (read from a
  machine's m8ysram, a TOOLFILE file, or an opened folder). An end mill whose cutting diameter is not its NOM-D
  takes its actual diameter from the tool data, or the one entered.
- Hole patterns plot as the control machines them: F = 1 makes T1 / T2 (ARC: AN2) totals, Q = 1 leaves the start
  point out, P = 1 leaves out the four corners (SQUARE, GRID), CHORD holes sit at the chord's ends.
- SUB PRO units plot the programs they call (Mazatrol or EIA) when those are open too or are in the opened
  folder, REPEAT times. Units after a program's END unit are not run, and the plot says so.
- EIA programs: every move the program makes (rapid dashed, feed green), with subprograms and macros followed.
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
- **Compare** lists what changed between this program and another open one (for example the shop copy and the
  machine's copy), field by field.
- **Folder** lists every program in the folder with its comment and tool check, and searches every line of every
  program.

## Not done yet

Cutting-condition and parameter files (`CUTCND`, `USRPAR`, `MAHINPAR`), older controls, converting tool data
between Matrix and Smooth. In EIA plots: G68.2 tilted planes and polar interpolation. Converting three-digit G-format text into a MAZATROL program.
