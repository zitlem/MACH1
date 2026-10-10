# MACH1 field names

The names MACH1 uses for every field, per control. They are the screen's column headings; a heading used twice on
a line gets #2, #3. Fields with no heading are named by byte, such as @11 (the tool suffix on many tool lines).
Any field can also be named by its byte (@36). Some fields only apply for certain tools or patterns; the
screen shows those as ◆ and MACH1 reports them if you set them.

## Matrix mill (MatrixM, .PBD)

### COMMON

- unit: MAT, INITIAL-Z, ATC-MODE, MULTI-MODE, MULTI, PITCH-X, PITCH-Y

### WPC-

- unit: ADD.WPC, ADD.WPC#2, X, Y, Th, Z, @56, C

### OFFSET

- unit: U(X), V(Y), D(th), W(Z)

### END

- unit: CONTI., NUMBER, ATC, ANGLE, DIR., RETURN, Work-No., EXECTE

### SUB PRO

- unit: WORK, @8, $, @9, REPEAT, No., No.#2
- LINE (code a5): #1 address, #1, #2 address, #2, #3 address, #3, #4 address, #4, #5 address, #5, #6 address, #6

### MANL PRG

- unit: TOOL, NOM-DIA, @11, No., No.#2
- MANL (code a1): G1, G2, DATA 1 address, DATA 1, DATA 2 address, DATA 2, DATA 3 address, DATA 3, DATA 4 address, DATA 4, DATA 5 address, DATA 5, DATA 6 address, DATA 6, S, M/B, M/B#2

### M-CODE

- unit: No., No.#2, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12

### MMS

- unit: TOOL, NOM-0, NOM-0#2, @8, No., U.SKIP, $
- LINE (code a2): PTN, X, Y, Z, @68, 5, R, D/L, K

### PALT CHG

- unit: No.

### PROC END

- unit: (none)

### INDEX

- unit: POS X, POS Y, POS Z, ANGLE, ANGLE C, TURN

### WPCSHIFT

- unit: SHIFT-X, SHIFT-Y, SHIFT-Z, SHIFT-, COORD.th, @8

### WORK MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, COMP.DATA, COMP.DATA#2, SNS-TOOL, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code b9): PTN, @12, SPT-X, SPT-X#2, SPT-Y, SPT-Y#2, SPT-Z, SPT-Z#2, FPT-X, FPT-Y, FPT-Z, LIM+, LIM-, BASE, DIR.

### TOOL MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code ba): PTN, TOOL.LENGTH/X, TOOL.DIA./Z, UNIT

### COMMENT

- unit: @8

### DRILLING

- unit: DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH CBOR

- unit: CB-DIA, CB-DEP, CHMF, BTM, DIA, DEPTH
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH BCB

- unit: CB-DIA, CB-DEP, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### REAMING

- unit: DIA, DEPTH, CHAMFER, PRE-REAM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### TAPPING

- unit: NOM, MAJOR-0, PITCH, TAP-DEPTH, CHMF, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BK-CBORE

- unit: DIA, DEPTH, BTM, WAL, PRE-DIA, PRE-DEP, CHMF, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CIRC MIL

- unit: TORNA., DIA, DEPTH, CHMF, BTM, PRE-DIA, CHMF#2, PITCH1, PITCH2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CBOR-TAP

- unit: NOM, MAJOR, PITCH, TAP-DEP, CHMF, CB-DIA, CB-DEP, CHMF#2, BTM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T1

- unit: DIA, DEPTH, CHMF, WAL
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S1

- unit: DIA, DEPTH, CHMF, BTM, WAL, PRE-DIA
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T2

- unit: CB-DIA, CB-DEP, CHMF, BTM, WAL, DIA, DEPTH, CHMF#2, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S2

- unit: CB-DIA, CB-DEP, CHMF, BtmWal, BtmWal#2, PRE-DIA, DIA, DEPTH, CHMF#2, BtmWal#3, BtmWal#4
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### LINE CTR

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE RGT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE LFT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE OUT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE IN

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF RGT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF LFT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF OUT

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF IN

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### FCE MILL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TOP EMIL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### STEP

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### POCKET

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### PCKT MT

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### PCKT VLY

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### SLOT

- unit: DEPTH, SRV-Z, S-WIDTH, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TEXT

- unit: C-FACE, TEXT, HGT, DEPTH
- TOOL (code b5): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- LINE (code c4): PTN, Z, X, Y, RADIUS, ANGLE, PITCH, Q

## Smooth mill (SmoothM, .PBM)

### COMMON

- unit: MAT, INITIAL-Z, ATC-MODE, MULTI-MODE, MULTI, PITCH-X, PITCH-Y, DIS.

### WPC-

- unit: ADD.WPC, ADD.WPC#2, X, Y, Th, Z, @56, C

### OFFSET

- unit: U(X), V(Y), D(th), W(Z)

### END

- unit: CONTI., NUMBER, ATC, RETURN, Work-No., EXECTE

### SUB PRO

- unit: WORK, @8, $, @9, REPEAT, No., No.#2
- LINE (code a5): #1 address, #1, #2 address, #2, #3 address, #3, #4 address, #4, #5 address, #5, #6 address, #6

### MANL PRG

- unit: TOOL, NOM-DIA, @11, No., No.#2
- MANL (code a1): G1, G2, DATA 1 address, DATA 1, DATA 2 address, DATA 2, DATA 3 address, DATA 3, DATA 4 address, DATA 4, DATA 5 address, DATA 5, DATA 6 address, DATA 6, S, M/B, M/B#2

### M-CODE

- unit: No., No.#2, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12

### MMS

- unit: TOOL, NOM-0, NOM-0#2, @8, No., U.SKIP, $
- LINE (code a2): PTN, X, Y, Z, @68, 5, R, D/L, K

### PALT CHG

- unit: No.

### PROC END

- unit: (none)

### INDEX

- unit: POS X, POS Y, POS Z, ANGLE, ANGLE C, TURN

### WPCSHIFT

- unit: SHIFT-X, SHIFT-Y, SHIFT-Z, SHIFT-, SHIFT-A, COORD.th, @8

### WORK MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, COMP.DATA, COMP.DATA#2, SNS-TOOL, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code b9): PTN, @12, SPT-X, SPT-X#2, SPT-Y, SPT-Y#2, SPT-Z, SPT-Z#2, FPT-X, FPT-Y, FPT-Z, LIM+, LIM-, BASE, DIR.

### TOOL MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code ba): PTN, TOOL.LENGTH/X, TOOL.DIA./Z, UNIT

### COMMENT

- unit: @8

### DRILLING

- unit: DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH CBOR

- unit: CB-DIA, CB-DEP, CHMF, BTM, DIA, DEPTH
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH BCB

- unit: CB-DIA, CB-DEP, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### REAMING

- unit: DIA, DEPTH, CHAMFER, PRE-REAM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### TAPPING

- unit: NOM, MAJOR-0, PITCH, TAP-DEPTH, CHMF, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BK-CBORE

- unit: DIA, DEPTH, BTM, WAL, PRE-DIA, PRE-DEP, CHMF, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CIRC MIL

- unit: TORNA., DIA, DEPTH, CHMF, BTM, PRE-DIA, CHMF#2, PITCH1, PITCH2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CBOR-TAP

- unit: NOM, MAJOR, PITCH, TAP-DEP, CHMF, CB-DIA, CB-DEP, CHMF#2, BTM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T1

- unit: DIA, DEPTH, CHMF, WAL
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S1

- unit: DIA, DEPTH, CHMF, BTM, WAL, PRE-DIA
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T2

- unit: CB-DIA, CB-DEP, CHMF, BTM, WAL, DIA, DEPTH, CHMF#2, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S2

- unit: CB-DIA, CB-DEP, CHMF, BtmWal, BtmWal#2, PRE-DIA, DIA, DEPTH, CHMF#2, BtmWal#3, BtmWal#4
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### LINE CTR

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE RGT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE LFT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE OUT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE IN

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF RGT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF LFT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF OUT

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF IN

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### FCE MILL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TOP EMIL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### STEP

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### POCKET

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### PCKT MT

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### PCKT VLY

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### SLOT

- unit: DEPTH, SRV-Z, S-WIDTH, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TEXT

- unit: TEXT, HGT, DEPTH
- TOOL (code b5): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- LINE (code c4): PTN, Z, X, Y, RADIUS, ANGLE, PITCH, Q

## Matrix lathe (MatrixT, .PBF)

### COMMON

- unit: MAT., OD-MAX, ID-MIN, LENGTH, WORK-FACE, ATC-MODE, RPM

### WPC-

- unit: ADD.WPC, ADD.WPC#2, X, Y, Th, Z, @56, C

### END

- unit: CONTI., REPEAT, SHIFT, NUMBER, ATC, RETURN, Work-No., EXECTE

### SUB PRO

- unit: WORK, @8, $, @9, REPEAT
- LINE (code a5): #1 address, #1, #2 address, #2, #3 address, #3, #4 address, #4, #5 address, #5, #6 address, #6

### MANL PRG

- unit: TOOL, NOM-DIA, @11, No., No.#2, POS-B, CHANGE-PT
- MANL (code a1): G1, G2, DATA 1 address, DATA 1, DATA 2 address, DATA 2, DATA 3 address, DATA 3, DATA 4 address, DATA 4, DATA 5 address, DATA 5, DATA 6 address, DATA 6, S, M/B, M/B#2

### M-CODE

- unit: No., No.#2, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12

### INDEX

- unit: POS X, POS Y, POS Z, ANGLE, ANGLE C

### WPCSHIFT

- unit: SHIFT-X, SHIFT-Y, SHIFT-Z, SHIFT-, COORD.th, MIRROR

### MATERIAL

- unit: @20
- TOOL (code b8): PTN, SPT-X, SPT-Z, FPT-X, FPT-Z, RADIUS

### TRANSFER

- unit: PAT, HEAD, SPDL, PUSH, CHUCK, W1, W2, Z-OFFSET, C1, C2, C-OFFSET

### HEAD

- unit: PAT., HEAD, SPDL

### SIMULTAN

- unit: @8, No., Simul.No., RPM

### 2 WORKPC

- unit: PAT., SP1

### COMMENT

- unit: @8

### DRILLING

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH CBOR

- unit: MODE, POS-B, POS-C, CB-DIA, CB-DEP, CHMF, BTM, DIA, DEPTH
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH BCB

- unit: MODE, POS-B, POS-C, CB-DIA, CB-DEP, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### REAMING

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHAMFER, PRE-REAM
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### TAPPING

- unit: MODE, POS-B, POS-C, NOM-, MAJOR-0, PITCH, TAP-DEP, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BK-CBORE

- unit: MODE, POS-B, POS-C, DIA, DEPTH, BTM, WAL, PRE-DIA, PRE-DEP, CHMF, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CIRC MIL

- unit: MODE, POS-B, POS-C, TORNA., DIA, DEPTH, CHMF, BTM, PRE-DIA, CHMF#2, PITCH1, PITCH2
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CBOR-TAP

- unit: MODE, POS-B, POS-C, NOM-, MAJOR-0, PITCH, TAP-DEP, CHM, CB-DIA, CB-DP, CHM#2, BTM
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T1

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHMF, WAL
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S1

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHMF, BTM, WAL, PRE-DIA
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BAR

- unit: PART, POS-B, CPT-X, CPT-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CPY

- unit: PART, POS-B, CPT-X, CPT-Z, SRV-X, SRV-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CORNER

- unit: PART, POS-B, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a9): SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, RGH

### FACING

- unit: PART, POS-B, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code aa): SPT-X, SPT-Z, FPT-X, FPT-Z, RGH

### THREAD

- unit: PART, POS-B, CHAMF, LEAD, ANG, MULTI, HGT
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ab): SPT-x, SPT-z, FPT-x, FPT-z

### T.GROOVE

- unit: PART, POS-B, PAT, No., PITCH, WIDTH, FINISH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ac): S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR, ANGLE, RGH

### T.DRILL

- unit: PART, POS-B, DIA
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### T.TAP

- unit: PART, POS-B, NOM-DIA, PITCH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### MILLTURN

- unit: POS-B, CPT-X, CPT-Z, FIN-X, FIN-Z, SHIFT-Y
- TOOL (code b4): TOOL, @10, NOM-Dia, NOM-Dia#2, No., No.#2, PAT., DEP-1, Z-DEC, RPM, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### LINE CTR

- unit: MODE, POS-B, POS-C, SRV-Z, SRV-R, RGH, FIN-A, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE RGT

- unit: MODE, POS-B, POS-C, SRV-Z, SRV-R, RGH, FIN-A, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE LFT

- unit: MODE, POS-B, POS-C, SRV-Z, SRV-R, RGH, FIN-A, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE OUT

- unit: MODE, POS-B, POS-C, SRV-A, SRV-R, RGH, FIN-A, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE IN

- unit: MODE, POS-B, POS-C, SRV-A, SRV-R, RGH, FIN-A, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF RGT

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF LFT

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF OUT

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF IN

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### FCE MILL

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TOP EMIL

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### STEP

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### POCKET

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R, INTER-R, CHMF
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### SLOT

- unit: MODE, POS-B, POS-C, SRV-A, S-WIDTH, BTM, WAL, FIN-A, FIN-R, PAT.
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

## Smooth lathe (SmoothT, .PBP)

### COMMON

- unit: MAT., OD-MAX, ID-MIN, LENGTH, WORK-FACE, ATC-MODE, RPM

### WPC-

- unit: ADD.WPC, ADD.WPC#2, X, Y, Th, Z, @56, C

### END

- unit: CONTI., REPEAT, SHIFT, NUMBER, ATC, RETURN, Work-No., EXECTE

### SUB PRO

- unit: WORK, @8, $, @9, REPEAT, No., No.#2
- LINE (code a5): #1 address, #1, #2 address, #2, #3 address, #3, #4 address, #4, #5 address, #5, #6 address, #6

### MANL PRG

- unit: TOOL, NOM-DIA, @11, No., No.#2, CHANGE-PT
- MANL (code a1): G1, G2, DATA 1 address, DATA 1, DATA 2 address, DATA 2, DATA 3 address, DATA 3, DATA 4 address, DATA 4, DATA 5 address, DATA 5, DATA 6 address, DATA 6, S, M/B, M/B#2

### M-CODE

- unit: No., No.#2, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12

### INDEX

- unit: POS X, POS Y, POS Z, ANGLE, ANGLE C

### WPCSHIFT

- unit: SHIFT-X, SHIFT-Y, SHIFT-Z, SHIFT-, COORD.th, MIRROR

### MATERIAL

- unit: @20
- TOOL (code b8): PTN, SPT-X, SPT-Z, FPT-X, FPT-Z, RADIUS

### TRANSFER

- unit: PAT, HEAD, SPDL, PUSH, CHUCK, W1, W2, Z-OFFSET, C1, C2, C-OFFSET

### HEAD

- unit: PAT., HEAD, SPDL

### SIMULTAN

- unit: @8, No., Simul.No., RPM

### 2 WORKPC

- unit: PAT., SP1

### COMMENT

- unit: @8

### DRILLING

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH CBOR

- unit: MODE, POS-B, POS-C, CB-DIA, CB-DEP, CHMF, BTM, DIA, DEPTH
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH BCB

- unit: MODE, POS-B, POS-C, CB-DIA, CB-DEP, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### REAMING

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHAMFER, PRE-REAM
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### TAPPING

- unit: MODE, POS-B, POS-C, NOM-, MAJOR-0, PITCH, TAP-DEP, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BK-CBORE

- unit: MODE, POS-B, POS-C, DIA, DEPTH, BTM, WAL, PRE-DIA, PRE-DEP, CHMF, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CIRC MIL

- unit: MODE, POS-B, POS-C, TORNA., DIA, DEPTH, CHMF, BTM, PRE-DIA, CHMF#2, PITCH1, PITCH2
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CBOR-TAP

- unit: MODE, POS-B, POS-C, NOM-, MAJOR-0, PITCH, TAP-DEP, CHM, CB-DIA, CB-DP, CHM#2, BTM
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T1

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHMF, WAL
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S1

- unit: MODE, POS-B, POS-C, DIA, DEPTH, CHMF, BTM, WAL, PRE-DIA
- TOOL (code b0): TOOL, NOM-D, @11, @8, No., HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BAR

- unit: PART, CPT-X, CPT-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CPY

- unit: PART, CPT-X, CPT-Z, SRV-X, SRV-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CORNER

- unit: PART, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a9): SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, RGH

### FACING

- unit: PART, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code aa): SPT-X, SPT-Z, FPT-X, FPT-Z, RGH

### THREAD

- unit: PART, CHAMF, LEAD, ANG, MULTI, HGT
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ab): SPT-x, SPT-z, FPT-x, FPT-z

### T.GROOVE

- unit: PART, PAT, No., PITCH, WIDTH, FINISH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ac): S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR, ANGLE, RGH

### T.DRILL

- unit: PART, DIA
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### T.TAP

- unit: PART, NOM-DIA, PITCH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### MILLTURN

- unit: CPT-X, CPT-Z, FIN-X, FIN-Z, SHIFT-Y
- TOOL (code b4): TOOL, @10, NOM-Dia, NOM-Dia#2, No., No.#2, PAT., DEP-1, Z-DEC, RPM, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### LINE CTR

- unit: MODE, POS-B, POS-C, SRV-Z, SRV-R, RGH, FIN-A, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE RGT

- unit: MODE, POS-B, POS-C, SRV-Z, SRV-R, RGH, FIN-A, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE LFT

- unit: MODE, POS-B, POS-C, SRV-Z, SRV-R, RGH, FIN-A, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE OUT

- unit: MODE, POS-B, POS-C, SRV-A, SRV-R, RGH, FIN-A, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE IN

- unit: MODE, POS-B, POS-C, SRV-A, SRV-R, RGH, FIN-A, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF RGT

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF LFT

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF OUT

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF IN

- unit: MODE, POS-B, POS-C, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-1, APRCH-2, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### FCE MILL

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TOP EMIL

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### STEP

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### POCKET

- unit: MODE, POS-B, POS-C, SRV-A, BTM, WAL, FIN-A, FIN-R, INTER-R, CHMF
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### SLOT

- unit: MODE, POS-B, POS-C, SRV-A, S-WIDTH, BTM, WAL, FIN-A, FIN-R, PAT.
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

## Matrix mill-turn (MatrixE, .PBE)

### COMMON

- unit: MAT, INITIAL-Z, ATC-MODE, MULTI-MODE, MULTI, PITCH-X, PITCH-Y

### WPC-

- unit: ADD.WPC, ADD.WPC#2, X, Y, Th, Z, C

### END

- unit: CONTI., REPEAT, SHIFT, NUMBER, ATC, RETURN, Work-No., EXECTE

### SUB PRO

- unit: WORK, @8, $, @9, REPEAT, No., No.#2
- LINE (code a5): #1 address, #1, #2 address, #2, #3 address, #3, #4 address, #4, #5 address, #5, #6 address, #6

### MANL PRG

- unit: TOOL, NOM-DIA, @11, No., No.#2
- MANL (code a1): G1, G2, DATA 1 address, DATA 1, DATA 2 address, DATA 2, DATA 3 address, DATA 3, DATA 4 address, DATA 4, DATA 5 address, DATA 5, DATA 6 address, DATA 6, S, M/B, M/B#2

### M-CODE

- unit: No., No.#2, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12

### MMS

- unit: TOOL, NOM-0, NOM-0#2, @8, No., U.SKIP, $
- LINE (code a2): PTN, X, Y, Z, C, DIR, R, D/L, K, DIR.

### INDEX

- unit: POS X, POS Y, POS Z, ANGLE B, ANGLE C

### WPCSHIFT

- unit: SHIFT-X, SHIFT-Y, SHIFT-Z, SHIFT-C, COORD.th, MIRROR

### MATERIAL

- unit: @20
- TOOL (code b8): PTN, SPT-X, SPT-Z, FPT-X, FPT-Z, RADIUS

### WORK MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, COMP.DATA, COMP.DATA#2, SNS-TOOL, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code b9): PTN, @12, SPT-X, SPT-X#2, SPT-Y, SPT-Y#2, SPT-Z, SPT-Z#2, FPT-X, FPT-Y, FPT-Z, LIM+, LIM-, BASE, DIR.

### TRANSFER

- unit: PAT, HEAD, SPDL, PUSH, CHUCK, W1, W2, MOVEMENT, C1, C2, MOVE-C

### HEAD

- unit: PAT., HEAD, SPDL

### TOOL MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code ba): PTN, TOOL.LENGTH/X, TOOL.DIA./Z, UNIT, DIR.

### SIMULTAN

- unit: @8, No., Simul.No., RPM

### 2 WORKPC

- unit: PAT., SP1, UTUR-ESC, LTUR-ESC, WPC

### COMMENT

- unit: @8

### DRILLING

- unit: DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH CBOR

- unit: CB-DIA, CB-DEP, CHMF, BTM, DIA, DEPTH
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH BCB

- unit: CB-DIA, CB-DEP, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### REAMING

- unit: DIA, DEPTH, CHAMFER, PRE-REAM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### TAPPING

- unit: NOM, MAJOR-0, PITCH, TAP-DEPTH, CHMF, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BK-CBORE

- unit: DIA, DEPTH, BTM, WAL, PRE-DIA, PRE-DEP, CHMF, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CIRC MIL

- unit: TORNA., DIA, DEPTH, CHMF, BTM, PRE-DIA, CHMF#2, PITCH1, PITCH2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CBOR-TAP

- unit: NOM, MAJOR, PITCH, TAP-DEP, CHMF, CB-DIA, CB-DEP, CHMF#2, BTM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T1

- unit: DIA, DEPTH, CHMF, WAL
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S1

- unit: DIA, DEPTH, CHMF, BTM, WAL, PRE-DIA
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BAR

- unit: PART, CPT-X, CPT-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CPY

- unit: PART, CPT-X, CPT-Z, SRV-X, SRV-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CORNER

- unit: PART, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a9): SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, RGH

### FACING

- unit: PART, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code aa): SPT-X, SPT-Z, FPT-X, FPT-Z, RGH

### THREAD

- unit: PART, CHAMF, LEAD, ANG, MULTI, HGT
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ab): SPT-x, SPT-z, FPT-x, FPT-z

### T.GROOVE

- unit: PART, PAT, No., PITCH, WIDTH, FINISH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ac): S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR, ANGLE, RGH

### T.DRILL

- unit: PART, DIA
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### T.TAP

- unit: PART, NOM-DIA, PITCH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### MILLTURN

- unit: CPT-X, CPT-Z, FIN-X, FIN-Z, SHIFT-Y
- TOOL (code b4): TOOL, @10, NOM-Dia, NOM-Dia#2, No., No.#2, PAT., DEP-1, Z-DEC, RPM, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### LINE CTR

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE RGT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE LFT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE OUT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE IN

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF RGT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF LFT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF OUT

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF IN

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### FCE MILL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TOP EMIL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### STEP

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### POCKET

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### SLOT

- unit: DEPTH, SRV-Z, S-WIDTH, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TEXT

- unit: C-FACE, TEXT, HGT, DEPTH
- TOOL (code b5): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- LINE (code c4): PTN, Z, X, Y, RADIUS, ANGLE, PITCH, Q

## Smooth mill-turn (SmoothE, .PBN)

### COMMON

- unit: MAT, INITIAL-Z, ATC-MODE, MULTI-MODE, MULTI, PITCH-X, PITCH-Y

### WPC-

- unit: ADD.WPC, ADD.WPC#2, X, Y, Th, Z, C

### END

- unit: CONTI., REPEAT, SHIFT, NUMBER, ATC, RETURN, Work-No., EXECTE

### SUB PRO

- unit: WORK, @8, $, @9, REPEAT, No., No.#2
- LINE (code a5): #1 address, #1, #2 address, #2, #3 address, #3, #4 address, #4, #5 address, #5, #6 address, #6

### MANL PRG

- unit: TOOL, NOM-DIA, @11, No., No.#2, CHANGE-PT
- MANL (code a1): G1, G2, DATA 1 address, DATA 1, DATA 2 address, DATA 2, DATA 3 address, DATA 3, DATA 4 address, DATA 4, DATA 5 address, DATA 5, DATA 6 address, DATA 6, S, M/B, M/B#2

### M-CODE

- unit: No., No.#2, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12

### MMS

- unit: TOOL, NOM-0, NOM-0#2, @8, No., U.SKIP, $
- LINE (code a2): PTN, X, Y, Z, C, DIR, R, D/L, K, DIR.

### INDEX

- unit: POS X, POS Y, POS Z, ANGLE B, ANGLE C

### WPCSHIFT

- unit: SHIFT-X, SHIFT-Y, SHIFT-Z, SHIFT-C, COORD.th, MIRROR

### MATERIAL

- unit: @20
- TOOL (code b8): PTN, SPT-X, SPT-Z, FPT-X, FPT-Z, RADIUS

### WORK MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, COMP.DATA, COMP.DATA#2, SNS-TOOL, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code b9): PTN, @12, SPT-X, SPT-X#2, SPT-Y, SPT-Y#2, SPT-Z, SPT-Z#2, FPT-X, FPT-Y, FPT-Z, LIM+, LIM-, BASE, DIR.

### TRANSFER

- unit: PAT, HEAD, SPDL, PUSH, CHUCK, W1, W2, MOVEMENT, C1, C2, MOVE-C

### HEAD

- unit: PAT., HEAD, SPDL

### TOOL MES

- unit: COMPENSATE, OFS-TOOL, OFS-TOOL#2, @36, @11, No., No.#2, INTERVAL, OUTPUT
- LINE (code ba): PTN, TOOL.LENGTH/X, TOOL.DIA./Z, UNIT, DIR.

### SIMULTAN

- unit: @8, No., Simul.No., RPM

### 2 WORKPC

- unit: PAT., SP1, UTUR-ESC, LTUR-ESC, WPC

### COMMENT

- unit: @8

### DRILLING

- unit: DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH CBOR

- unit: CB-DIA, CB-DEP, CHMF, BTM, DIA, DEPTH
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### RGH BCB

- unit: CB-DIA, CB-DEP, DIA, DEPTH, CHMF
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### REAMING

- unit: DIA, DEPTH, CHAMFER, PRE-REAM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### TAPPING

- unit: NOM, MAJOR-0, PITCH, TAP-DEPTH, CHMF, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BK-CBORE

- unit: DIA, DEPTH, BTM, WAL, PRE-DIA, PRE-DEP, CHMF, WAL#2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CIRC MIL

- unit: TORNA., DIA, DEPTH, CHMF, BTM, PRE-DIA, CHMF#2, PITCH1, PITCH2
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### CBOR-TAP

- unit: NOM, MAJOR, PITCH, TAP-DEP, CHMF, CB-DIA, CB-DEP, CHMF#2, BTM, CHP
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE T1

- unit: DIA, DEPTH, CHMF, WAL
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BORE S1

- unit: DIA, DEPTH, CHMF, BTM, WAL, PRE-DIA
- TOOL (code b0): TOOL, NOM-D, @11, No, No#2, HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH, DEPTH, C-SP, FR, M, M#2, M#3
- FIG (code c0): PTN, Z, X, Y, AN1, AN2, T1, T2, F, M, N P Q R, N P Q R#2, N P Q R#3, N P Q R#4

### BAR

- unit: PART, CPT-X, CPT-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CPY

- unit: PART, CPT-X, CPT-Z, SRV-X, SRV-Z, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### CORNER

- unit: PART, FIN-X, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code a9): SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, RGH

### FACING

- unit: PART, FIN-Z
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code aa): SPT-X, SPT-Z, FPT-X, FPT-Z, RGH

### THREAD

- unit: PART, CHAMF, LEAD, ANG, MULTI, HGT
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ab): SPT-x, SPT-z, FPT-x, FPT-z

### T.GROOVE

- unit: PART, PAT, No., PITCH, WIDTH, FINISH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ac): S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR, ANGLE, RGH

### T.DRILL

- unit: PART, DIA
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### T.TAP

- unit: PART, NOM-DIA, PITCH
- TOOL (code b4): SNo, TOOL, TOOL#2, NOM., @11, No., No.#2, PAT., DEP-1, DEP-2/NUM, DEP-2/NUM#2, DEP-2/NUM#3, DEP-3, FIN-X, FIN-Z, C-SP, FR, M, M#2, M#3
- SHAPE (code ad): SPT-Z, FPT-Z

### MILLTURN

- unit: CPT-X, CPT-Z, FIN-X, FIN-Z, SHIFT-Y
- TOOL (code b4): TOOL, @10, NOM-Dia, NOM-Dia#2, No., No.#2, PAT., DEP-1, Z-DEC, RPM, C-SP, FR, M, M#2, M#3
- SHAPE (code a8): PTN, S-CNR, SPT-X, SPT-Z, FPT-X, FPT-Z, F-CNR/$, @60, R/th, @14, RGH

### LINE CTR

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE RGT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE LFT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, START, END, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE OUT

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### LINE IN

- unit: DEPTH, SRV-Z, SRV-R, RGH, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF RGT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF LFT

- unit: DEPTH, INTER-Z, INTER-R, CHMF, START, END
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF OUT

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### CHMF IN

- unit: DEPTH, INTER-Z, INTER-R, CHMF
- TOOL (code b1): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### FCE MILL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TOP EMIL

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### STEP

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### POCKET

- unit: DEPTH, SRV-Z, BTM, WAL, FIN-Z, FIN-R, INTER-R, CHMF
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### SLOT

- unit: DEPTH, SRV-Z, S-WIDTH, BTM, WAL, FIN-Z, FIN-R
- TOOL (code b2): SNo, TOOL, NOM-D, @11, No, No#2, APRCH-X, APRCH-Y, TYPE, ZFD, TYPE#2, PK-DEP, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- SHAPE (code c2): @12, PTN, X, Y, Rad/Th., I, J, P, CNR, R-FEED, RGH
- PATTERN (code c1): PTN, P1X/CX, P1Y/CY, P3X/R, P3Y, CN1, CN2, CN3, CN4

### TEXT

- unit: TEXT, HGT, DEPTH
- TOOL (code b5): SNo, TOOL, NOM-D, @11, No., No.#2, APRCH-X, APRCH-Y, TYPE, ZFD, DEP-Z, WID-R, C-SP, FR, M, M#2, M#3
- LINE (code c4): PTN, Z, X, Y, RADIUS, ANGLE, PITCH, Q
