# Probing Program Generator

`apps/Probing Program Generator.html` writes spindle-probe programs for a Mazak machining centre. Its cycle inputs follow the macro packs it was written
for (Renishaw Inspection Plus, Mazak MMS). It is one offline file; open it in Chrome or Edge.

Pick a kind of program, add operations in the order they run, fill in each feature, and download. A preview shows
each feature from above, where the probe starts and which way each touch goes. The job (settings and operations)
is kept in the browser, and **Save job** / **Open job…** store it as a `.json` file.

## How the probe runs

The switch at the top left picks how the probe is run; under it, **You get** lists the files that makes.

| | Files | Updates |
|---|---|---|
| **Renishaw cycles** (G65 P98xx) | `NAME.EIA`, the probing program, and `NAME-M.PBM`, a Mazatrol program with one SUB PRO unit (MEASURE MACRO) that runs it; `NAME-180.EIA` too when the side 180° away is set in a Mazatrol WPC | G54–G59, G54.1 P1–P300, the Mazatrol WPC, or a tool's length or diameter |
| **Mazatrol MMS unit** | `NAME.PBM`: a WPC unit and an MMS unit | the WPC unit before it |
| **Mazak MMS macros** (G65 P90xx) | `NAME.EIA`, and an optional `NAME-M.PBM` SUB PRO that runs it | G54–G59 |

**Files for the machine** shows them, one tab per file named by its file name. Under the tabs, a line says what the
shown file is and where it goes, next to its own Download button; **Download all** saves every file.

Each kind keeps its own list of operations; switching between them does not lose any.

### Renishaw Inspection Plus

The program changes to the probe (`T1.01 M6` is tool 1, suffix A), waits for the probe to switch on, selects the
work offset and runs `G65 P9832` (probe on, spindle oriented). For each operation it rapids across at the
clearance Z (or uses protected moves, if you untick the rapid), makes a protected move (`P9810`) down to where the
cycle starts, runs the cycle, and makes a protected move back up. It ends with `G65 P9833` and `G91 G28 Z0`. Every
argument has a decimal point, as Renishaw's own calibration programs write them.

| Group | Operations (macro) |
|---|---|
| Measure | X, Y or Z surface (9811) · pocket/slot or web in X or Y (9812) · bore, boss (9814) · inside corner (9815) · outside corner (9816) · rectangle, 4 sides and angle (9817) · bolt circle (9819) · a face at up to 6 points (9820) · angled surface (9821) · angled web/pocket (9822) · 3-point bore/boss (9823) · angle of a face in XY (9843) · square the B table (9818) · bore centre at 0° and 180° (9800) |
| Feature to feature | remember the last feature, then compare the next with it (9834) |
| Tool offsets | averaged tool update over several parts (9835) |
| Move | a protected move (9810) |
| Calibrate | stylus in a ring gauge, K2/K3/K4 or radii only (9801) · probe length on a Z face (K1) · everything on a sphere (K5) · a ring's true centre (K0) |

**Options** on each measuring operation take the cycle's optional inputs: the work offset to update (S), a tool
to update (T, as `12A`), size, position and angle tolerances (H, M, B), an upper limit (U), null band (V),
feedback (F), an experience offset (E), overtravel (Q), clearance (R) and printing (W).

- **Work offset**: the new value is the *active* offset plus the error the cycle finds, so leave it on the
  active one. Updating another works, but relative to the active one (the app warns). The S numbers written are
  1–6 for G54–G59, 101–400 for G54.1 P1–P300 and 7 for the Mazatrol WPC. The macros write other numbers into the
  wrong variables, so the app never writes them.
- **Mazatrol WPC (S7)** only takes effect when the EIA program runs from the Mazatrol SUB PRO unit with MEASURE
  MACRO set: put the downloaded SUB PRO unit in your part program after its WPC unit.
- **Tool**: number and suffix. The macros change the tool's *geometry* length (cycles that probe in Z) or
  diameter in TOOL DATA, not the wear.
- The checks stop the combinations the macros alarm on: a work offset with a tool or a size tolerance, a tool with
  a position tolerance, two touches that leave no argument room, and a clearance Z below a start.
- Tolerance stops are message stops: cycle start carries on and the offset is still updated. Only the upper limit
  (U) skips the update. The settings macro (9724) in this pack turns flag-only mode off at every call.
- **Calibration** can copy the stylus offsets and radii into Mazatrol's L1–L4, as Renishaw's calibration program
  for Mazak does, so MMS units use the same numbers.

### Squaring the B table

**Square the B table (set B)** sets B so a face is square to the spindle at the index you give. The probe goes to
Z home (`G0 G53 Z0`), the table turns to that B, and 9818 touches the face twice in Z, spread along X. B is
corrected by the angle found:

- **Work offset B**: the active offset's B (G54–G59, G54.1 Pn). 9818 writes it itself (`S`), or the program
  writes `#5224=#5224-#144` (G54) when the direction is reversed.
- **Mazatrol WPC B**: the B column of the WPC unit, written with `G65 P9733 B[#5344+#144]`. 9818's own `S7` only
  writes the WPC's X, Y and Z, so it never set B. This only works when the program runs from the Mazatrol SUB
  PRO unit (MEASURE MACRO), after the part's WPC unit.

Which way 9818's correction goes is set in the macro and has not been proven on a machine. Leave **Measure again
afterwards** on: the table turns to the corrected B and the face is measured again against the check tolerance. A
stop with ANGLE OUT OF TOLERANCE there means B is still out: if the error doubled, flip **Correction direction**;
if it is unchanged, nothing was written (for the WPC, run it from the SUB PRO).

### The side 180° away

**Set the side 180° away** works out the work zero of the side 180° from this one (0 and 180, 90 and 270, 45 and
225 …), so only one side is probed. Put it after the operations that set this side.

Turning the table exactly 180° about its centre takes a point at X to 2·Xc − X and Z to 2·Zc − Z, whichever way B
turns, which is why it works for any two sides 180° apart (other angles would need the direction of rotation). So:

- other side X = 2·Xc − (this side's X + dx), Z = 2·Zc − (this side's Z + dz), Y = this side's Y + dy, B = this
  side's B + 180 (kept within 0–360);
- (dx, dy, dz) is the distance from this side's zero to the other side's zero, measured on the part in this side's
  axes. A part 3 thick with each zero on its own face has dz = −3;
- Xc, Zc is the table's centre of rotation in machine coordinates: parameter **S5**, typed under **Table**, or the
  last measured centre. On the control: **PARAMETER → MACHINE → ANOTHER (S)** tab, address **S5**, the X and Z
  columns. The screen shows it in 0.00001 in (−1115000 is −11.15); type it in inches. The app refuses a number that
  looks like it was copied straight off the screen.
  Or pick **Read from the control**: the program reads S5 from `#50700` (X) and `#50701` (Z), the variables the
  EIA manual gives for it (in its Dynamic Offsetting II chapter, an option). It stops with an alarm if they read
  empty, 0 or in 0.00001 in, and, when you also type S5, if the two differ by more than 0.05.

Where it goes:

- **EIA work offset**: another offset, e.g. G54 → G55, written straight away (the external offset is allowed for).
- **Mazatrol WPC**: a WPC holds machine coordinates with the table at that side's index; the control does not turn
  it. The values are kept in #950–#953, and a second program, `<name>-180`, writes them into the other side's WPC.
  The Mazatrol `.PBM` has both SUB PRO units (MEASURE MACRO) and a WPC unit: the first SUB PRO goes after this side's
  WPC and MMS units, the WPC unit and the second SUB PRO where the other side starts.

**Find the table centre** checks S5: it probes a block of known thickness, its face and X centre at B and the
opposite face and X centre at B+180, puts the centre in #954 (X) and #955 (Z) and stops with a message to read them.
Side B is found from the typed S5, so a rough value is enough. The Z is only as good as the thickness you give.

Programs run from a Mazatrol SUB PRO must end with **M99** (M30 would end the part program): **End with** picks it,
and Auto uses M99 whenever something writes the Mazatrol WPC.

### Inspecting and adjusting tools

Each measuring operation has a **Purpose**:

- **Set work offset**: the cycle updates the work offset (as described above).
- **Inspect**: nothing on the machine changes. The result goes into the inspection report.
- **Inspect + adjust tool**: the result goes into the report, and the tool you give (number and suffix, e.g. `12A`)
  is corrected in TOOL DATA: its length for a Z face, otherwise its diameter (the geometry value, not the wear).

**New operations are for** (under **Inspection**) picks the purpose new operations start with.

Inspecting adds **+ tolerance** and **− tolerance** for the size (or the face's position), a **position zone Ø**
(true position) and an angle tolerance where the cycle measures one. Adjusting adds **Feedback** (blank = 0.8 of the
error), **Don't adjust beyond** (blank = 3× the tolerance band: a bigger error stops without adjusting) and a
**Null band** (smaller errors are left alone).

- An uneven tolerance is sent to the macro as its middle: a 1.000 bore +0.002/−0.0005 is probed as `D1.00075 H0.00125`,
  so the tool is aimed at the middle of the band. The report still compares with 1.000.
- **Stop the machine when out of tolerance** (on by default) passes the tolerances to the macro, which then stops with
  OUT OF TOLERANCE or OUT OF POSITION (cycle start carries on). Off: nothing stops and the report judges each feature.
- The macros cannot check position while adjusting a tool (TM INPUT MIXED): with a tool, the position zone is judged
  in the report only.

**The report.** The program prints a run line (a counter in #960, the date and time) and, after each inspected
feature, one line of results. They go to `C:\ymw\M8Y\data\MC_sdg\print\print.txt` on the control when data I/O
parameter **DPR14 = 4**; the file keeps growing. Copy it off the control (USB or the network) and **Open print.txt…**
under **Inspection report**, with the job that made the program open: features are matched by number. Other printouts
in the file (Mazatrol measuring reports and so on) are skipped. Each part gets a table of nominal, actual, deviation,
tolerances and OK / OUT, with the tool error and the machine's out-of-tolerance flag; several parts also get a summary
(count, out, min, max, mean). **Download CSV** gives one row per part and item; **Print** prints the report.

### Ready-made jobs, the timeline, part programs

- **Add a ready-made job…** (next to Add) appends a set of operations to start from: probe calibration in a ring
  gauge or on a sphere, a vise set-up (top and outside corner), a fixture-bore set-up, inspecting a bore and adjusting
  its tool, squaring B and setting the side 180° away, and the usual three MMS lines. Move the numbers to your part.
- **The timeline** under the preview follows the probe move by move: drag the bar or press ▶. The preview draws the
  path so far (rapids dashed, protected moves, touches in red) and where the probe is; the line under it says the
  operation, the move and X Y Z; the operation's lines are lit in the EIA listing. Moves the machine works out while it
  runs (the 180° side, the table centre) are drawn where the job's numbers put them.
- **Inspect every Nth part only** (under Inspection): the inspections run on parts 1, N+1, 2N+1 …; set-ups run every
  time. The part count is #960; set it to 0 on the control to start again.
- **Put it into a part program**: open the Mazatrol program (.MAZ, .PBM or .PBD) and the units this job needs go
  straight into it — the SUB PRO that runs the probing (and the second one for the side 180° away), or the MMS unit.
  The app suggests after each side's WPC unit and the INDEX / MMS units that follow it; pick others from the list.
  The download keeps the file's name and type: keep a copy of the original and check it in the Mazatrol Editor
  before running.

### Mazatrol MMS unit

X face, Y face, Z face, X/Y groove, X/Y step (projection), bore, boss, corner and angle (XYA-CNR) and calibration
(CAL), with the fields as on the MMS screen (start X Y Z, R, D/L, K). The program holds a WPC unit (give its
machine coordinates roughly) and the MMS unit with `TOOL PROBE`, NOM-Ø and suffix. Copy the units into a part
program in the Mazatrol Editor, or run it as it is to set the WPC.

### Mazak MMS EIA

Mazak's EIA/ISO measuring macros: calibrate in a master hole (9010), X/Y/Z surface (9011, 9012, 9014), hole centre
(9013), X/Y groove (9015, 9016), X/Y projection (9017, 9018), boss (9019), inclination (9020). They start and end at
machine zero and take **machine** coordinates for X and Y (negative). M picks the work offset (G54–G59), H the
probe's length offset (0 = TOOL DATA). They must be in the control's programs: load them before running one.

## Things to know before the first run

- Run a new probing program single block with the rapid and feed overrides low, and watch the first touches.
- **#510**: a Renishaw vector calibration (K4, K5) stores a radius in #510. The MMS EIA macros read #510 as "use
  the TOOL DATA length", so after one, an MMS macro with H0 can run with no length offset. Check #510 or give H.
- 9815 is the inside corner and 9816 the outside corner, read from what the macros in this pack do.
  Renishaw's own naming may be the other way round.
- The rectangle cycle (9817) and the B table cycle (9818) are read from the macro code, not a manual. Prove them
  single block.
- 9800 waits for the probe-ready signal and, if it never comes, carries on without measuring and without an alarm.
- 9016 (MMS Y groove) loops for ever in inch with printing on; the app refuses that combination.
- The Renishaw tool-setter macros found with this pack (9750–9759, 9855–9859) were written for a 5-axis vertical mill
  (arm M33/M34, `G53 B90.`) and are left out.
