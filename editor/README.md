# Mazatrol Editor

A browser editor for Mazak Mazatrol programs. It handles these program types:

| Machine  | Matrix | Smooth |
|----------|--------|--------|
| Mill     | `.PBD` | `.PBM` |
| Lathe    | `.PBF` | `.PBP` (`.PBL`) |
| Integrex | `.PBE` | `.PBN` |

It also opens:

- tool data: `TOOLDATA` and `TOOLFILE` (`.DBD` Matrix, `.DBM` Smooth);
- the Smooth controls' own program files, as Smooth CAM Ai keeps them in each machine's `MC_Machine Programs`
  folder: `.MAZ` (mill), `.MTP` (lathe), `.MPR` (Integrex). They are the records of a `.PBM`/`.PBP`/`.PBN`
  without its header, so they have no program comment;
- a machine's control memory, `m8ysram` from the Smooth CAM Ai machine data folder. The editor shows the
  machine's tool data from it, read-only;
- EIA/ISO (G-code) programs: `.EIA`, `.NC`, `.TAP`, `.CNC`, `.ISO`.

It is one offline HTML file, `../apps/Mazatrol Editor.html` (build it with `python3 editor/build.py`). Open it in Chrome or Edge. Those browsers can save
back into the file you opened; other browsers save as a download.

- **Screen**: the program in MazEdit's column layout.
- **Editing**: every field of every unit and sequence line, with prompts and menu soft keys. ◆ marks fields
  that do not apply with the current settings, and those fields cannot be typed into.
- **Units and lines**: insert unit, insert line, delete, duplicate (Ctrl+D), cut/copy/paste (also between
  programs and between Matrix and Smooth) and move, with undo/redo. Right-click a unit or line for all of them.
  Inserted and pasted units go above the unit at the cursor (on the common unit, right after it); pasted lines go
  after the cursor line.
- **TPC bits**: on a TPC value that the control sets bit by bit, the Bits… key shows each bit with a box to note
  what it does. The notes are kept in the browser per field, and Export / Import share them.
- **EIA/ISO programs** open as text: edit, undo, save (the line ends are kept as CR LF). The entry line says what
  the block at the cursor does. The program is run for the plot the way the control reads it:
  - modal G codes, absolute and incremental, arcs by I J K or R in any plane, G68 rotation;
  - drilling cycles (G73 G81–G89, pecks, G98/G99 levels);
  - subprograms and macros: M98/M99, G65 with arguments, #variables, IF/GOTO, WHILE/DO/END and the usual
    functions. Called programs are looked up among the open programs and the open folder;
  - lathes: X in diameter, U/W incremental, feed per minute or revolution (G98/G99), G71/G72 rough cutting and
    G70 finishing; Integrex: G10.9 diameter/radius;
  - what only the machine knows (reference positions, G53, probing results, system variables) is not drawn, and
    the plot says so.

  The machine type (mill, lathe, Integrex) comes from the folder's machine, or a guess from the program; the
  mill/lathe/Integrex buttons change it.
- **Save as**: converts between Matrix and Smooth of the same machine type, or saves a Smooth program as the
  control's own file (`.MAZ` `.MTP` `.MPR`).
- **Print listing**: printed, or saved as .txt.
- **Plot** (drawn on a canvas, fast with large programs):
  - Mazatrol programs show their cutter paths (blue): point machining (spot, drill with pecks, ream, tap,
    bore, circular milling), line units right/left/outside/inside/on the shape with Z and radial passes,
    chamfers, face milling, pockets with islands (zigzag, then the wall), slots; on lathes bar roughing and
    finishing, facing, grooving, threading, centre drilling and tapping; MANL PRG moves. The paths are worked
    out here from the units and are approximate: the control works out its own from its parameters.
  - EIA programs show their moves: rapid (grey dashed) and feed (green).
  - **Playback**: ⏮ ◀ ▶ ▶| ⏭ and the slider step through the program one line at a time (an EIA block, a
    Mazatrol tool line and each shape or hole line it machines), or play it at 1× to 1000× machine time. The
    cursor follows the line being run, and the entry line says what it does. **From cursor** restarts the plot
    at the unit (Mazatrol) or line (EIA) at the cursor; right-click ▸ Plot from this unit does the same.
  - The heading shows the range and an estimated cycle time (feeds from the tool lines or F words, a nominal
    rapid rate).
  - mills also show shapes, hole patterns and MANL PRG moves. They can be seen from the top, front, right or in 3D;
    in the side and 3D views, drag to turn the part (Shift+drag pans).
    - Shapes stand at their unit's depth, with the stock above it (DEPTH and SRV-Z).
    - Holes go down from their Z by the unit's depth, and MANL PRG moves use their Z.
    - The heading shows the program's X, Y and Z range;
  - lathes show the turning shapes in Z–X, drawn as radius;
  - Integrex switches between the two views.
- **TPC**: shows or hides the TPC setting records. MazEdit hides them.
- **Tool data**: `TOOLDATA` shows every used tool on MazEdit's two print pages:
  - Tool Data (1): tool set, wear, life;
  - Tool Data (2): tool, nominal size, lengths, angles, material.

  `TOOLFILE` shows one line per tool. Every field can be edited. The files keep lengths in nanometres, and they show in inch or mm.

  The file does not say which machine it is for; choose mill, lathe or Integrex. Empty tool slots are not shown, and the pocket tables are kept as they are.
- **Machine tool data**: opening a machine's `m8ysram` shows its registered tools on the same two pages. The
  editor picks mill, lathe or Integrex from the tools and pockets it finds.
- **Tools**: lists every tool the program uses (type, nominal size, suffix, the units that use it) and checks each
  one against an open machine memory or TOOLDATA file. It uses the newest one for the same kind of machine, or
  the one you pick.
  - A tool counts as found when the tool data has the same type, nominal size and suffix. Turning tools must
    also match the part (OUT, IN, EDGE ...), and taps the exact thread code. That is how the control looks
    tools up.
  - Found tools show their tool number, pocket (from the pocket table), length and diameter. Tools that exist
    with another suffix, and tools that are missing, are marked.
  - Print ▸ Print setup sheet prints the same table; it can also be saved as .txt.
- **Open folder** (Chrome/Edge; other browsers pick the folder through a file dialog) reads every program in a
  folder. It works with:
  - one machine's data folder from Smooth CAM Ai (`C:\Users\Public\Documents\MAZATROL\Smooth\<machine>`, its
    programs being in `MC_Machine Programs`);
  - the folder of all machines (`...\MAZATROL\Smooth`);
  - any folder of programs.
  - The Folder panel lists the programs with their comments (from `index.tbl` for machine files), grouped by
    machine.
  - A machine is a folder with a machine memory (`m8ysram`) or a TOOLDATA file. Each program shows its tool check
    against its own machine.
  - The Tools panel can use every machine of the folder. For the current program, it shows for each machine of
    the same kind how many tools it lacks; click one to check against it.
  - The search box finds lines in every program that contain all the words typed, such as `E-MILL 0.75`. Click
    a program or a found line to open it there. Programs opened from the folder save back into it.
- **Compare**: the differences between this program and another open one of the same kind of machine, for
  example a shop copy and the machine's `.MAZ`. It picks the program with the same name by default.
  - Records are matched on their contents, so inserted or deleted units do not shift the rest.
  - A changed line lists each field that prints differently (old → new). Added and removed lines are listed
    too. A Matrix program is compared as its Smooth conversion.
  - Click a change to go to it.

## Build and test

The tests name shop programs by aliases (PRG-A ...); the real names go in `tests/names.local.json` (not in git: alias to real name, plus an `_env` entry with MAZ_DATA, MAZ_FIXTURES and MAZ_CHAT) and `-r ./tests/names.js` swaps them in. Run from `editor/`, with `MAZ_CHAT` set for the extra test programs.

```
python3 build.py                     # src/* -> ../Mazatrol Editor.html
node -r ./tests/names.js tests/test_core.js              # file round trips, Matrix<->Smooth, field entry
node -r ./tests/names.js tests/test_render.js            # 228,000 random fields vs MazEdit's own formatting code
node -r ./tests/names.js tests/test_render.js tool       # the same for the tool-data layouts
node -r ./tests/names.js tests/test_lines.js             # whole lines vs MazEdit: SLN samples, shop programs, the machines' own programs
node -r ./tests/names.js tests/test_paths.js             # G-code interpreter and Mazatrol cutter paths, every program of the machines
node -r ./tests/names.js tests/fuzz_edit.js              # random edits on every program: no crashes, files stay valid
node -r ./tests/names.js tests/browser_test.js           # the built page in headless Chrome
```

## Where the formats come from

`src/schema.json` holds, for every control and every unit and sequence record, three things:

- the field layout, entered bits, columns and prompts;
- the display rules;
- the rules for which fields show `<>` (◆) or nothing.

The schema (`src/schema.json`) was produced outside this repository, and the tooling that produced it is not part of it.
`tests/test_lines.js` and `tests/test_render.js` compare the editor's printed lines with recorded outputs of the original
program; those recordings are not in the repository either (set `MAZ_FIXTURES` to a folder that has them; without them
those two tests have nothing to compare and pass trivially).

What is here: `src/` (the editor's sources), `build.py` (assembles them into one HTML file), `tests/` and `tools/` (the
calibration scripts that compare the cutter-path times with the control's own).

Rules that MazEdit's layout table does not describe are coded in `src/core.js`. For example:

- **Point-machining tool line**: the columns depend on the tool type and its cycle.
- **Pocket shape lines**: OPEN or CLOSED sides, and the open side's feed.
- **Turning shapes**: R/th is a taper angle or an arc radius.
- **END line**: rotary addresses are in degrees.
- **C-face lines**: coordinates are polar or cartesian.
- **Tool names**: turning tools show the machining part.
- **Tool NOM**: shown as a tap size, in hundredths or as a length, depending on the tool.

Unit names on the screen are the names the Mazak control itself uses. They come from the control's text
tables in `DMLauncherM8Y/MazatrolViewer/Data`.

## Not yet

- Cutting conditions and parameter files (`CUTCND`, `USRPAR`, `MAHINPAR`).
- Converting tool data between Matrix and Smooth.
- A few tool-data columns print slightly differently from MazEdit for unusual values (99.40% of random fields
  match). One example is a column that MazEdit squeezes to five characters.
- Mazatrol cutter paths are approximate: approach points, clearances, cutting patterns and the order of
  pockets and islands follow the plan the manuals describe, not the control's parameters, and there is no Mazak
  output to check them against yet (EIA/ISO CONVERT output from Smooth CAM Ai would give one). Corner R/C,
  tool nose and cutter compensation are not applied; INDEX units are drawn in each face's own coordinates;
  milling units on lathes are not drawn.
- EIA: G68.2 tilted planes, polar interpolation (G12.1), scaling and the lathe cycles G73–G76 are not drawn.
- Cycle times use a nominal rapid rate (1000 in/min) and no acceleration, so they read short.
- Machine tool data pages show the record's own PKNo (0, as MazEdit prints it). The Tools panel and setup sheet
  show the pocket from the pocket table.
- Older controls.
- The WORK MES / MMS direction column prints like MazEdit only for the common cases.
- In the plot, hole patterns other than PT, corner rounding and lathe milling units are only approximate or not drawn.
