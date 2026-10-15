# EDM Probing Program Generator

`apps/EDM Probing Program Generator.html` writes wire-touch set-up programs for a Mitsubishi
MV-series wire EDM (MV1200S/R, MV2400S/R, MV4800S/R). It is one offline file: open it in Chrome or Edge. Nothing is installed and
nothing is sent anywhere.

Pick ready-made jobs or add operations in the order they run, fill in each one, and download. A preview shows each
operation from above: where the wire starts and which way each touch goes. The job is kept in the browser, and
**Save job** / **Open job…** store it as a `.json` file.

Every command the generator writes is a form the control's own programs already use. Where what a word does isn't
certain, this guide says so.

## What you get

| File | What it is | Where it goes |
|---|---|---|
| `NAME.NC` | The whole set-up program: `%`, `L<number>/<NAME>`, the probing, `M02` (or `G23`), `%` | Load it into the control. Run it on its own (end **M02**), or call it from a cut program with `G22 L<number>` (end **G23**). |
| `NAME-SETUP.NC` | (Not made for a whole job.) The probing block only, no `%`, L line or end | Paste it at the top of an existing cut program, after its L line. |

Both use CRLF line ends and upper-case ASCII, like the control's own programs. Errors (✕) block the download; warnings (!) don't.

## Job settings

- **Program number (L)**: below 9000. L9000 and up hold the control's own macros.
- **Machine**: only used to warn when moves spread wider than the table travel (MV1200 400 × 300, MV2400
  600 × 400, MV4800 800 × 600 mm). Pick **Other** and type the travel, or leave it blank for no check.
- **Units**: the units the machine is set to. The program does not switch units. Numbers are written with 4
  places in inch and 3 in mm.
- **Wire diameter**: typed, or **read from the control** with `G14 X<v> Y22 P7`, which is how the factory macros read
  it. The program keeps the *radius* in the first H-variable (`H610=0.005 (WIRE RADIUS)`).
- **Touch speed notch (P), repeat count (,P), repeat tolerance (,R)**: added to every G29 / G30. Blank leaves them
  out, so the machine uses its own settings. That is how G30 is usually run. Each operation can override them
  under **Touch settings**.
- **H-variables from**: the program uses 40 H-variables from here (default **H610 – H649**). The control's built-in
  programs don't use them. The app warns if the block you pick overlaps one that's used.
- **N labels from**: each operation that jumps gets 200 labels from here (default N7000). They must not clash with
  labels in a cut program you paste the set-up into.
- **Alarm number**: what a width out of tolerance sets `H3000` to (9101, 9102 …). The factory macros use 1 – 40 and
  9001 – 9003.

## Operations

### Hole centre (G30)

Your current method: thread in a start hole, centre, zero.

```
G54.1P1            (if an offset is given)
M20 (INSERT WIRE)
G30X1R0.I0.15J0.15
G92X0.Y0.
M21 (CUT WIRE)
```

What the words mean:
- `X1`: only the sign counts. It says which way the search starts.
- `R`: tilts the search from the axes (R0 is along X and Y).
- `I`, `J`: a fast first move in X and in Y, at 570 mm/min (22 in/min), before the slow touch. Keep them well short
  of the wall. Bigger holes allow bigger values.

Give the **hole diameter** and the app warns when I or J comes within 80 % of the wall, measured from the centre less
the wire radius; the wire may start off centre. The preview then draws the hole at that size. Leave it blank for no check.
The same field is on **Several parts** and the **Whole job** with G30.

### Edge in X or Y (G29)

Moves along one axis until the wire touches, then sets that axis so the **face** reads the value you give:

```
M20 (INSERT WIRE)
G29X1              (move X+ until contact)
G92X-H610          (wire centre is one radius short of the face: face = 0)
G91 G00 X-0.05     (back off)
G90
M21 (CUT WIRE)
```

`G29X1` / `G29X-1` give the direction. The factory macros write the same move as `G29 X-0.001` and `G29X-1`, so the
number is only a direction. The wire stops with its **surface** on the face, so the centre is one radius away; the
program allows for it.

### Corner (G29 in X, then Y)

Touches the X face, backs off, goes round to the Y face (**Y first, then X**) and touches it. Then it sets both axes
so the corner reads the values you give. `G14` saves where the wire stopped each time:

```
G29X1
G14X611Y613        (X and Y at the first touch into H611, H613)
G91 G00 X-0.05
G90
G00 G90 Y-0.1
X0.25
G29Y1
G14X612Y614
H615=H611+H610     (X face = first touch + radius)
H615=H612-H615     (how far past the X face the wire is now)
G92XH615 Y-H610
```

Only *differences* between two `G14` readings are used, so it does not matter whether G14 reads work or machine
positions. Pick the two start points so the move between them stays clear of the part. The preview draws it.

### Width / centre in X or Y

- **Inside (slot, bore)**: from the middle, touches one wall then the other, moves to the centre and sets it with
  G92. Width = distance between the two touches + 2 × radius.
- **Outside (web, part)**: touches one side, **cuts the wire**, rapids past the far side, **re-threads** in the air
  and touches back. It doesn't move to the centre, because the part is in the way. It sets the current position so
  the centre reads the value you give. Width = distance − 2 × radius.

The width goes in an H-variable (H630 for the first, H631 for the next, or one you choose). It's written in a
comment so you can read it on the variable screen. With **Alarm if width under / over**, the program compares it and
stops with the alarm number:

```
H623=0.49
IF[H623GTH630]GOTO7000
H624=0.51
IF[H630GTH624]GOTO7000
GOTO7001
N7000
H3000=9101(X WIDTH OUT OF TOL)
M00
N7001
```

Only `EQ` and `GT` are used in `IF`, because those are the only ones the control's programs use.

### Several parts: hole centre each (G30 + G54.1 Pn)

A counter loop over several parts:
- Part 1 is reached in machine coordinates and picked up into the first offset.
- Each next part is reached from part 1 (positions in part 1's coordinates, one `X,Y` per line) and picked up into
  its own offset: P2, P3 ….
- At the top, `H620` is the last part and `H621` the part to start from. Change them on the control to rerun some
  of the parts.

```
N7002 (PROBE 2)
IF[H622GTH620]GOTO7099 (WHEN COUNTER IS GREATER THAN LAST PART NUMBER)
H622=[H622+1]
G53G92X0Y0
G54.1P1
G00 G90 X2.Y0.
G90
G53G92X0Y0
G54.1P2
M20 (INSERT WIRE)
G30X1R0.I0.25J0.25
G92X0.Y0.
M21 (CUT WIRE)
```

Give **Cut program** an L number and a second loop runs it on each part: `G54.1Pn`, `G00 G90 X0.Y0.`,
`G22 L<n>`. The cut program must end with `G23`.

### Whole job (one program, no subprograms)

Writes a complete program in the style of a multi-part keyway job:

1. **Set-up loop**: each part's zero goes into its own work offset, G54.1 P1, P2 …. Pick how the zero is found:
   - **G30 in each part's hole**: part 1 is reached in machine coordinates, the others from part 1. The wire
     threads in each hole and centres.
   - **Nominal spacing**: part 1's offset is set by hand. The others are placed at the spacing you give, with no
     touches.
   - **Probe the fixture**: centre in one fixture hole, or two and use the midpoint. Part 1 is then placed at the
     offset you give from that zero, and the others at nominal spacing.
2. **Up to three passes** (rough, finish, skim; you name them). Each one runs over every part: select its offset,
   go to X0 Y0, jump to the cut. A pass can end by parking, draining and opening the door with an M01, so the
   slugs can come out before the next pass.
3. **End**: park, fluid off, drain, door down, M93, M02. With **leave water full** offered, the operator can set
   a flag so the program ends with M99 instead and runs again.
4. **The cuts**, after the end. Each pasted cut path is written once:
   - It is reached with `G200A<label>` and goes back to the loop with `GOTO<label>`.
   - The program wraps your pasted moves: go to the thread point, M20, fill the tank, fluid, wire and machining on,
     adaptive on. After the moves it cuts the wire, turns adaptive off and goes back to X0 Y0.

At the top, the program lists in comments what it will do. Then come the H-variables the operator edits on the
control:

```
H620=12 (LAST PART NUMBER)
H621=1 (START FROM PART NUMBER)
H625=0 (SKIP SET-UP 1=YES 0=NO)
H626=0 (SKIP ROUGH 1=YES 0=NO)
H627=0 (SKIP FINISH 1=YES 0=NO)
```

**Start from part** works in every section: after a wire break in part 7, set H621=7 and skip the passes that
are done. Each section starts with an M01, and there's another before each part (optional), so turn optional stop
on to check each pickup before it cuts.

**What to paste**: only the cutting moves of one part, in that part's coordinates, the way your CAM or an existing
program has them: the condition (`F…E…`), the offset (`H1=…`), the `G41`/`G42` lead-in, the moves and the `G40`
lead-out. The app refuses `%`, an L line, M02, M30, M99, G22 and G23 in a paste. It warns about M20/M21 (the
program threads and cuts the wire itself), jumps, and a path with no E condition. The **thread point** is where the
wire threads for that pass, from the part's zero.

The whole job uses 1000 N labels (N7000 – N7999 by default) and must be the last operation. Optional Z1, Z2 and
Z5 lines can go at the top. Notes for the operator (setup, run times) become comment lines in the header.

**Tabs** (pass 1, *Leave a tab on each part*): the slugs stay held while every part is roughed, then come out one
at a time. This uses the threader's M01 uncut and cut-off modes.
1. **Rough, leaving a tab.** The rough cut runs with `H94=1` (uncut mode). The control cuts the wire the tab
   length (`H96`) short of the M01 after the shape, and goes on to the next part. That M01 is added before the cut
   path's G40 lead-out, or at its end if there is no G40. If the path has its own M01, that one is used.
2. **Cut off the tabs.** A new section runs the same path on every part with `H95=1` (cut-off mode). The control
   skips to the tab, cuts only that length, then stops at the M01 so the slug can come out. The section starts by
   stopping with a message (`H3006`): turn the M01 stop switch **on** for it, and keep it **off** for the rough.
3. The later passes then run on parts with no slugs in them.

`H96` (the tab length) and a skip flag for the cut-off section are at the top with the others. `H94` and `H95` are
set to 0 there, and around each cut, so no other M01 in the job leaves a tab. Keep the tab over 0.5 mm (0.02 in).
The program takes 1 in H94 / H95 as on, so prove it on one part, single block, before a full job.

### Sample program

**Download sample program** (top of the app) saves `SAMPLE-JOB.NC`: a complete whole job to read before writing
your own. It is 4 parts 2.0 apart in X, each a 0.250 wide keyway to Y0.625 in a 1.000 bore, with G30 in each part,
then rough and finish. **Add a ready-made job → Sample** loads the same job into the app to change.

The same files are in the repository: [`examples/edm/SAMPLE-JOB.NC`](../examples/edm/SAMPLE-JOB.NC) and
`SAMPLE-JOB.json`, which you open in the app with **Open job…**. `node examples/edm-sample.js` remakes them.

It is a sample, not a part: the E conditions (`E1481`, `E1332`), the H1 offsets and part 1's machine position are
placeholders. Set your own for your wire, material and fixture before running anything like it.

### Mitsubishi measuring macros (G65 L)

These are the measuring macros already on the control. Their argument letters are read from each macro's comment
header. Blank letters are left out.

| Macro | What it does | Letters | Answer in |
|---|---|---|---|
| L99990311 – 314 | Edge on the X+, X−, Y+ or Y− face | X/A, U/D, Y/B, V/E (point), Z, Q, S, T, W | H21050 – H21053 |
| L99990315 / 316 | Width in X / Y | both face points, Z, M, Q, S, T, W | H21050/51, H21052/53 |
| L99990317 | Hole centre | X, A (start), Z, Q, S, T, W | H21050 = X, H21052 = Y |
| L99990303 | Hole centre from 3 surface points | X A, Y B, U D, K R (finish), Q S T | — |
| L99990300 / 301 / 302 | Set-up from 2 / 3 / 4 faces (position and rotation) | H, the face points, K R, Q S T (W) | — |
| L99999001 | 3-point centre inside a bore | A B C (angles −180…180), R (radius), F | H921 X, H922 Y, H923 R |
| L99999002 | 3-point centre outside a boss | as 001, plus D (pitch, wire cut) | H921 X, H922 Y, H923 R |

Q is the speed notch (the G29 `P`), S the repeat count (`,P`), T the tolerance (`,R`), W the pallet rotation. The
macros also read set-up parameters from the control: wire diameter **H21041**, edging distance **H21043**,
speed **H20040**. They are set on the machine's set-up (Setting Parameter) screens. They belong to the control's
pallet and automatic set-up system, so try them from those screens first.

### Program operations

Select work offset (`G54.1Pn`), rapid move (`G00 G90` or `G53 G00 G90`), thread wire (`M20`), cut wire (`M21`),
optional stop (`M01`), run cut program (`G22 L<n>`), comment.

## Command reference

| Command | Use | Example |
|---|---|---|
| `G30` | Hole centre | `G30X1R20.I.75J.75`, `G30 X0.001 P6 ,P5 ,R0.005` |
| `G29` | Edge find: move along one axis until contact | `G29X-1`, `G29 X-0.001 P6 ,P3 ,R0.005` |
| `G14` | Read into H-variables | `G14X180` (X), `G14X910Y912` (X and Y), `G14 X911 Y912 P0`, `G14X912Y914P1 (machine position)`, `G14X904Y22P7 (wire diameter)` |
| `G92` | Set the current position | `G92X0.0Y0.0`, `G92XH611 YH612` |
| `G54.1 Pn` | Work offset n | `G54.1P12` |
| `G53` | Machine coordinates | `G53 G00 G90 X10.Y-5.`, `G53G92X0Y0` |
| `G22 L` / `G23` | Call a program / return | `G22 L2000`, `G23` |
| `G65 L` | Call a macro with arguments | `G65 L99990317 X0 A0 Q6 S5 T0.005` |
| `H` | Variables | `H622=[H622+1]`, `H615=H612-H611` |
| `IF … GOTO` | Jump | `IF[H622GTH620]GOTO7099`, `IF[H622EQ1]GOTO7001` |
| `H3000=n` | Macro alarm | `H3000=9101(X WIDTH OUT OF TOL)` |
| `M20` / `M21` | Thread / cut wire | |
| `M91` / `M90` | Adaptive off / on | |

The factory macros also use `G201`–`G203` (jumps on a test), `G43.1`/`G44.1` (write/read parameters) and
`G106`–`G111` (maths: square root, sin, cos, arc tangent, the centre of three points). The generator doesn't write
those. The reference below lists them.

### Machine table drawing

**Machine table** in the header shows the machine's work table from above and saves it as a DXF to lay parts and
fixtures out on in CAD. The drawing has:
- the table's pieces (or the square table and its opening);
- every M8 tapped hole, drawn Ø8;
- the wire's X / Y travel, dashed;
- the centrelines and the machine zero;
- notes: the table size, the X / Y / Z and U / V travel, the largest workpiece and its weight, and the taper limit.

It covers the MV1200S and MV2400S (U type, split), the MV1200R and MV2400R (square), and the MV4800. It opens on the
job's machine.

| Choice | What it does |
|---|---|
| mm / Inch | The DXF's units (`$INSUNITS` says which). |
| Origin: machine X0 Y0 | 0,0 is the machine zero: the wire at the left-rear end of travel. X runs 0 to + the travel and Y 0 to − the travel, as `G53` moves do, so a part drawn on the table reads in machine coordinates. |
| Origin: table front-left corner | 0,0 is the table's front-left corner. |

The DXF is AutoCAD R12, which every CAD program opens, including MACH1's CAD page. Its layers are `TABLE`, `M8`,
`TRAVEL`, `CENTER`, `ZERO` and `NOTES`.

The counterbored holes that fix the table down are left out. Check a hole or two on the machine before you rely on
the drawing.

### G / M codes in the page

**G / M codes** in the header opens a reference to read while writing or checking a program: the control's G and M
codes, in our own words, and the other words (decimal point, E, F, H, IF … GOTO, H3000, H3006, H94 – H96, L, N, A,
K, S, comments, %, /). There are about 150 rows, in groups:
moves, zero return, touch and read, wire offset and taper, coordinates, rotate / scale / mirror, settings, program
flow, maths; program, wire, tank and fluid, machining, outputs, pallet and scrap. Each row gives what the code does,
an example and any note. Type in the search box (*drain*, *offset*, *G92*, or a short form such as *G4*) or pick G
codes, M codes, other words, or only the codes this generator writes. Escape closes it.

Some codes need an option your machine may not have. Prove a code single block on the machine before you rely on it.

## Things to know before the first run

- **Prove each new program single block**, with machining **off**, the tank empty or with only wire contact, and the
  rapid override low.
- **The wire senses by electrical contact.** Touch clean, bare metal: scale, oil, rust or anodising give a late
  touch or none. Hold the part so it is in contact with the table.
- **Allow for the wire radius.** G29 stops with the wire's surface on the face. The program allows for it with the
  wire diameter you give, so give the real wire size, or read it from the control and check H610 at the first run.
- **G30 centring needs no radius correction**: it touches opposite sides.
- **What the words the generator writes do**:
  - G29 / G30: only the sign of `X` or `Y` counts, so `X1` just says which way. `R` tilts the search (R0 is
    straight along the axis). `I` and `J` are a first stretch at the fast 570 mm/min before the slow search, so keep
    them short of the wall (give the hole diameter for a warning). `P` is the speed notch, `,P` the repeats and `,R`
    the scatter allowed.
  - G14: the program position is read with `P0`. The generator uses plain `G14 X… Y…`, as the factory macros do,
    and only the difference between two readings, so prove that the readings change as the wire moves at the first
    run.
  - The wire diameter is read with `G14 X… Y22 P7`, as the factory macros do.
  - `IF […] GOTO` works only with the control's **variable type 2** setting on (bit 3 of `G14 X… Y20 P7` shows it);
    the older conventional mode has only G200 – G203. A control where IF … GOTO already runs has it on.
  - `M99`, used by the whole job's "run again" ending, is the usual subprogram end.
  - M02 sets G91 (incremental) as the default; every program the generator writes says G90 itself.
- **The factory macros' arguments** are read from their code. They also depend on the set-up
  parameters on the control.
- **Outside widths re-thread the wire** in the air past the part. Make sure the auto-threader can thread there.
- Keep the H-variable block (H610 – H649) and the N labels (N7000 up) clear of anything your cut programs use.

## Tests

- `node test/edm-test.js`: checks the program text. Every line must match a known command form. It also
  checks the wire-radius maths, the multi-part loop and the warnings, and that every code the generator writes is
  in the G / M code reference, marked as one it writes (and no other code is marked).
- `node test/edm-browser.js [shot dir]`: drives the page in headless Chrome and takes screenshots.
