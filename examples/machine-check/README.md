# Machine check for the HEM Toolpath Generator

Five small programs to prove the output on the Mazak before trusting it on parts. Each is here as G-code (`.nc`),
Matrix (`.PBD`) and Smooth (`.PBM`); `programs.md` lists what each does. Remake them with
`node examples/machine-check.js` after changes to the generator.

All of them: **1/2" 3-flute end mill (END MILL, NOM-Ø 0.5, suffix A — it must be in TOOL DATA), 0.100 deep, work
zero at the middle of the part, top of the stock Z0**, clearance plane Z1.0, rapid plane Z0.1, feed overridden to
20–30 in/min so the moves are easy to follow. Aluminium or wax, about 3 × 2 in.

## Order

Run them in this order; stop at the first that is wrong and note the program, the line and what happened.

| # | Program | Checks | What to watch |
|---|---|---|---|
| 1 | MC1-ARCS | Flat G2/G3 arcs with I J (the engraver's proven layout) | Corners round the right way (outside profile, climb = clockwise); no "arc radius" alarm |
| 2 | MC2-HELIX | **Helical G2/G3 (arcs that move in Z) inside MANL PRG** | Tool spirals **down** counter-clockwise from Z0.1 to Z-0.1, about 1 turn per 0.03; then a flat turn, the spiral out and the finish |
| 3 | MC3-OPEN | Coming down in the air past an open edge; passes round an island | First plunge is **below the bottom edge, off the part**; passes grow from the bottom up and go round the round island without touching it |
| 4 | MC4-TROCH | Helix entry on a small loop, then trochoidal loops | Small helix at X-1, then circles marching to X1, all inside a 0.75 slot |
| 5 | MC5-SPLIT | A program too long for one Matrix unit (255 lines) | On the Matrix program the toolpath carries on in unit 2 and 3: at each change the tool lifts to Z1.0 and comes back down where it stopped |

## How

1. **Load and read it on the control.** Check the MANL PRG unit's tool (END MILL 0.5 A) and that the first lines
   are `G0 G90 X Y S M3`, `G0 G17 Z`, `G1 G94 Z F` as the engraver's programs have.
2. **Path check / tool path check** on the control. Compare the plot with the app's preview (open the `.nc`
   in the app with Open .nc… to see it again).
3. **In the air:** shift the work offset up (Z +1.000) or run with the part out. Single block, feed override low,
   through the first plunge and the first few loops; then let it run.
4. **In material** (wax or aluminium) at the real Z.
5. For each: the part should come out as the app shows: MC1 a 2 × 1.25 rectangle with R0.25 corners, MC2 a Ø1.25
   hole, MC3 a pocket open at the bottom with a Ø0.6 boss left standing, MC4 a 0.75 slot 2.75 long, MC5 a 0.75
   groove 5.75 long.

Do the same with the `.nc` files if the machine also runs EIA/ISO programs.

## Results

| Program | Matrix .PBD | Smooth .PBM | G-code .nc | Notes |
|---|---|---|---|---|
| MC1-ARCS | | | | |
| MC2-HELIX | | | | |
| MC3-OPEN | | | | |
| MC4-TROCH | | | | |
| MC5-SPLIT | | | | |
