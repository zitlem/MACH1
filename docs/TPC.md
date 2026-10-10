# TPC (tool path control) records of Mazatrol programs

What each TPC record holds, as read from programs edited on Smooth CAM Ai and from the machines' own parameter lists. Generated from the editor's tables (`lib/core.js`); the editor reads, shows and edits all of it (**TPC** soft key).

## Records

| Class | Record code | Notes |
|---|---|---|
| parameter | `0xD0`-`0xEF`, `0xF4`-`0xFF` | `xx 00 00 00` header; fields are little-endian u16 (a few u32) at fixed offsets per code |
| relay point | `0xF0`, bytes 4-5 = `FF 01` | approach / escape; byte 10 = 01 / 02 on mills, 03 / 04 on the turning centre; M u16 @20/22/24, X Y Z u32 /100000 @36..68, S u32 /1000 @72/76/80 |
| rotate position | `0xF1` | CORNER (ROUGH byte 10 = 1, FIN = 2, always empty); MMS and TRANSFER keep their M codes in the first one (u16 @26/28, TRANSFER head 2 @42/44) |
| extra fields | other `0xF0` | mill-turn POCKET: E40 @84, E41 @88 (len2) |

A unit without a TPC record runs on the machine's parameters. Editing a unit creates the record (a parameter-only edit adds one record; relay points add two).

## Scales

| kind | inch | metric (one decimal fewer) |
|---|---|---|
| len1 | /10 | /1 |
| len2 | /100 | /10 |
| len3 | /1000 | /100 |
| len4 | /10000 | /1000 |
| len5 | /100000 | /10000 |
| int | integer | integer |
| sec2 | /100 | |
| dec, dec1 | raw + ".", raw / 10 | |
| bits | 8 binary digits, bit 0 rightmost | |

## Layouts

### 0xD0 DRILLING

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D54 | Feed reduction at start, very deep drilling (%) | int | 50 |
| 18 | D58 | Slow-start distance, very deep drilling (%) | int | 50 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D59 | Speed reduction at hole end, very deep drilling (%) | int | 50 |
| 28 | D52 | Rapid relief reduction, very deep drilling (%) | int | 50 |
| 30 | D53 | Pecks before full return, very deep drilling | int | 3 |
| 32 | F12 | Peck return, high-speed deep hole | len5 |  |
| 36 | D55 | Return distance, very deep drilling | len4 |  |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int (Smooth) | 0 |
| 64 | D66 | APPROACH RAPID FEED RATE(%) | int (Smooth) | 0 |
| 68 | D130 |  | len2 (Smooth) | 0.00 |
| 72 | D141 |  | bits (Smooth) | 00000010 |

### 0xD1 RGH CBOR

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xD2 RGH BCB

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D5 | BK-SPOT PRE-HOLE THROUGH FEED | int | 0 |
| 30 | D40 | BK-SPOT DWELL AT HOLE BOTTOM | int | 2 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xD3 REAMING

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D18 | REAMER,BORING RETURN FEEDRATE | int | 4 |
| 30 | D24 | BORING DWELL AT HOLE BOTTOM | int | 2 |
| 32 | D25 | BORING TOOL EDGE RELIEF | len2 | 0.02 |
| 34 | D26 | BORING RETRACT FEEDRATE DIST. | len2 | 0.01 |
| 36 | D28 | BORING BOTTOM FIN. ALLOWANCE | len2 | 0.02 |
| 38 | D29 | CHIP VACUUM TIME (SEC) | int | 3 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xD4 TAPPING

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D22 | TAPPING CYCLE DWELL TIME(SEC) | sec2 | 0.00 |
| 30 | D30 | NUMBER OF INCOMPLETE THREAD | int | 3 |
| 32 | D31 | TAPPER ELONGATION ALLOWANCE | int | 2 |
| 34 | D32 | TAP ROT. UNTIL SPINDLE STOPS | int | 3 |
| 36 | D48 | PLANET TAP CHAMF.OVERRIDE (%) | int | 70 |
| 38 | D29 | CHIP VACUUM TIME (SEC) | int | 3 |
| 40 | D49 | PLANET RETRACT BOTTOM (PITCH) | dec1 | 0.1 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 54 | D43 | INCOMPLETE THREAD NUM (PIPE) | int | 2 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xD5 BK-CBORE

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D18 | REAMER,BORING RETURN FEEDRATE | int | 4 |
| 30 | D24 | BORING DWELL AT HOLE BOTTOM | int | 2 |
| 32 | D25 | BORING TOOL EDGE RELIEF | len2 | 0.02 |
| 34 | D26 | BORING RETRACT FEEDRATE DIST. | len2 | 0.01 |
| 36 | D28 | BORING BOTTOM FIN. ALLOWANCE | len2 | 0.02 |
| 38 | D33 | BACK BORING TOOL EDGE RELIEF | len2 | 0.02 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xD6 CIRC MIL

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | Dwell at hole bottom, end mill (rev) | int | 2 |
| 18 | D23 | Pre-hole clearance, end milling | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |

### 0xD7 CBOR-TAP

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D22 | TAPPING CYCLE DWELL TIME(SEC) | sec2 | 0.00 |
| 30 | D30 | NUMBER OF INCOMPLETE THREAD | int | 1 |
| 32 | D31 | TAPPER ELONGATION ALLOWANCE | int | 2 |
| 34 | D32 | TAP ROT. UNTIL SPINDLE STOPS | int | 3 |
| 36 | D48 | PLANET TAP CHAMF.OVERRIDE (%) | int | 70 |
| 38 | D29 | CHIP VACUUM TIME (SEC) | int | 3 |
| 40 | D49 | PLANET RETRACT BOTTOM (PITCH) | dec1 |  |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 54 | D43 | INCOMPLETE THREAD NUM (PIPE) | int | 2 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xD8 BORE T1

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D18 | REAMER,BORING RETURN FEEDRATE | int | 4 |
| 30 | D24 | BORING DWELL AT HOLE BOTTOM | int | 2 |
| 32 | D25 | BORING TOOL EDGE RELIEF | len2 | 0.02 |
| 34 | D26 | BORING RETRACT FEEDRATE DIST. | len2 | 0.01 |
| 36 | D28 | BORING BOTTOM FIN. ALLOWANCE | len2 | 0.02 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xD9 BORE S1

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D18 | REAMER,BORING RETURN FEEDRATE | int | 4 |
| 30 | D24 | BORING DWELL AT HOLE BOTTOM | int | 2 |
| 32 | D25 | BORING TOOL EDGE RELIEF | len2 | 0.02 |
| 34 | D26 | BORING RETRACT FEEDRATE DIST. | len2 | 0.01 |
| 36 | D28 | BORING BOTTOM FIN. ALLOWANCE | len2 | 0.02 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xDA BORE T2

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D18 | REAMER,BORING RETURN FEEDRATE | int | 4 |
| 30 | D24 | BORING DWELL AT HOLE BOTTOM | int | 2 |
| 32 | D25 | BORING TOOL EDGE RELIEF | len2 | 0.02 |
| 34 | D26 | BORING RETRACT FEEDRATE DIST. | len2 | 0.01 |
| 36 | D28 | BORING BOTTOM FIN. ALLOWANCE | len2 | 0.02 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xDB BORE S2

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | D1 | POINT MACHINING 2ND R PT HGT | len2 | 0.12 |
| 10 | D3 | CENTER DWELL AT HOLE BOTTOM | int | 2 |
| 12 | D16 | CHAMFER DWELL AT HOLE BOTTOM | int | 2 |
| 14 | D17 | CHAMFER INTERF. CLEARANCE | len2 | 0.04 |
| 16 | D19 | ENDMILL DWELL AT HOLE BOTTOM | int | 2 |
| 18 | D23 | E-MILL PRE-DIA CLEARANCE | len1 | 0.1 |
| 20 | D41 | POINT MACH-ING R POINT HEIGHT | len1 | 0.1 |
| 22 | D42 | POINT MACHINING 3RD R PT HGT | len2 | 0.00 |
| 24 | D91 | TOOL PATH PATTERN | bits | 11111001 |
| 26 | D92 | TOOL PATH PATTERN | bits | 00001111 |
| 28 | D18 | REAMER,BORING RETURN FEEDRATE | int | 4 |
| 30 | D24 | BORING DWELL AT HOLE BOTTOM | int | 2 |
| 32 | D25 | BORING TOOL EDGE RELIEF | len2 | 0.02 |
| 34 | D26 | BORING RETRACT FEEDRATE DIST. | len2 | 0.01 |
| 36 | D28 | BORING BOTTOM FIN. ALLOWANCE | len2 | 0.02 |
| 42 | D45 | DRILL DECREMENTAL DEP. OF CUT | len3 | 0.039 |
| 44 | D46 | DRILL MINIMUM DEPTH OF CUT | len3 | 0.039 |
| 60 | D62 | MAX NUM OF DRILL AUTO PECK. | int | 0 |

### 0xDC LINE CTR

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |
| 60 | E30 | Approach/escape clearance, closed ends | len2 | 0.12 |

### 0xDD LINE RGT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |

### 0xDE LINE LFT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |
| 60 | E30 | Approach/escape clearance, closed ends | len2 | 0.12 |

### 0xDF LINE OUT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | Start/escape point, closed shape | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 12 | E5 | Start/escape clearance, 2nd (X-Y) | len2 | 0.02 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |

### 0xE0 LINE IN

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | Start/escape point, closed shape | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 12 | E5 | Start/escape clearance, 2nd (X-Y) | len2 | 0.02 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |

### 0xE1 CHMF RGT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 42 | E8 | Chamfer cutter radial clearance | len2 | 0.04 |
| 44 | E11 | Chamfer cutter axial clearance | len2 | 0.04 |
| 60 | E30 | Approach/escape clearance, closed ends | len2 | 0.12 |

### 0xE2 CHMF LFT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 42 | E8 | Chamfer cutter radial clearance | len2 | 0.04 |
| 44 | E11 | Chamfer cutter axial clearance | len2 | 0.04 |
| 60 | E30 | Approach/escape clearance, closed ends | len2 | 0.12 |

### 0xE3 CHMF OUT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | Start/escape point, closed shape | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 42 | E8 | Chamfer cutter radial clearance | len2 | 0.04 |
| 44 | E11 | Chamfer cutter axial clearance | len2 | 0.04 |

### 0xE4 CHMF IN

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | Start/escape point, closed shape | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 40 | E95 | TOOL PATH PATTERN | bits | 11011101 |
| 42 | E8 | Chamfer cutter radial clearance | len2 | 0.04 |
| 44 | E11 | Chamfer cutter axial clearance | len2 | 0.04 |

### 0xE5 FCE MILL

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 40 | E12 | Face mill radial clearance | len2 | 0.20 |
| 44 | E15 | Face mill path (reciprocating short) | int | 1 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |

### 0xE6 TOP EMIL

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 40 | E13 |  | int | 2 |
| 44 | E97 | TOOL PATH PATTERN | bits | 00010100 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |

### 0xE7 STEP

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | Start/escape point, closed shape | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 12 | E5 | Start/escape clearance, 2nd (X-Y) | len2 | 0.02 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E16 | OUTER CIRC. CUT FEED OVERRIDE | int | 10 |
| 42 | E98 | TYPE OF CUTTING | bits | 00000000 |
| 44 | E91 | TOOL PATH PATTERN | bits | 10011111 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |
| 60 | E32 | Helical approach radius | int | 5 |
| 64 | E33 | Helical approach gradient | int | 200 |
| 68 | E34 | Tapered approach distance | int | 10 |
| 72 | E35 | Tapered approach gradient | int | 200 |
| 76 | E36 | Tapered escape distance | int | 10 |
| 80 | E20 | Axial feed override, Z pecking (%) | int | 0 |
| 84 | E37 | Z peck return, face machining | len4 | 0.0787 |

### 0xE8 POCKET

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | CLOSE PATTERN APPROACH/ESCAPE | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 12 | E5 | APPROACH/ESCAPE 2ND CLEARANCE | len2 | 0.02 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E18 | Full-width cut override, pocket (%) | int | 8 |
| 42 | E92 | TOOL PATH PATTERN | bits | 00001101 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |
| 60 | E32 | Helical approach radius | int | 5 |
| 64 | E33 | Helical approach gradient | int | 200 |
| 68 | E34 | Tapered approach distance | int | 10 |
| 72 | E35 | Tapered approach gradient | int | 200 |
| 76 | E36 | Tapered escape distance | int | 10 |
| 80 | E20 | Axial feed override, Z pecking (%) | int | 0 |
| 84 | E37 | Z peck return, face machining | len4 | 0.0787 |
| 88 | E99 | Line/face options | bits | 00000000 |
| 92 | E31 | Non-cutting tool R depth (one digit) | int | 6 |

### 0xE9 PCKT MT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | Start/escape point, closed shape | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 12 | E5 | Start/escape clearance, 2nd (X-Y) | len2 | 0.02 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E18 | Full-width cut override, pocket (%) | int | 8 |
| 42 | E93 | TOOL PATH PATTERN | bits | 00001111 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |
| 60 | E32 | Helical approach radius | int | 5 |
| 64 | E33 | Helical approach gradient | int | 200 |
| 68 | E34 | Tapered approach distance | int | 10 |
| 72 | E35 | Tapered approach gradient | int | 200 |
| 76 | E36 | Tapered escape distance | int | 10 |
| 80 | E20 | Axial feed override, Z pecking (%) | int | 0 |
| 84 | E37 | Z peck return, face machining | len4 | 0.0787 |
| 88 | E99 | Line/face options | bits | 00000000 |
| 92 | E31 | Non-cutting tool R depth (one digit) | int | 6 |

### 0xEA PCKT VLY

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | E1 | Start/escape point, closed shape | len2 | 0.08 |
| 10 | E2 | APPROACH/ESCAPE CLEARANCE | len2 | 0.12 |
| 12 | E5 | Start/escape clearance, 2nd (X-Y) | len2 | 0.02 |
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 24 | E22 | Corner override (%) | int | 70 |
| 28 | E23 | Corner override: max removal | int | 70 |
| 32 | E24 | Corner override: min removal | int | 25 |
| 36 | E25 | Corner override: max angle | int | 150 |
| 40 | E18 | Full-width cut override, pocket (%) | int | 8 |
| 42 | E98 | TYPE OF CUTTING | bits | 00000000 |
| 44 | E94 | TOOL PATH PATTERN | bits | 00011110 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |
| 60 | E32 | Helical approach radius | int | 5 |
| 64 | E33 | Helical approach gradient | int | 200 |
| 68 | E34 | Tapered approach distance | int | 10 |
| 72 | E35 | Tapered approach gradient | int | 200 |
| 76 | E36 | Tapered escape distance | int | 10 |
| 80 | E20 | Axial feed override, Z pecking (%) | int | 0 |
| 84 | E37 | Z peck return, face machining | len4 | 0.0787 |
| 88 | E99 | Line/face options | bits | 00000000 |
| 92 | E31 | Non-cutting tool R depth (one digit) | int | 6 |

### 0xEB SLOT

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 14 | E7 | Axial start allowance, 2nd clearance | len2 | 0.02 |
| 16 | E9 | Axial start allowance, 1st clearance | len2 | 0.12 |
| 18 | E17 | Axial feed override (%) | int | 4 |
| 20 | E21 | Wall machining overlap amount | len2 | 0.04 |
| 44 | E96 | TOOL PATH PATTERN | bits | 00000110 |
| 58 | E104 | Line/face options 2 | bits | 00000000 |
| 60 | E32 | Helical approach radius | int | 5 |
| 64 | E33 | Helical approach gradient | int | 200 |
| 68 | E34 | Tapered approach distance | int | 10 |
| 72 | E35 | Tapered approach gradient | int | 200 |
| 76 | E36 | Tapered escape distance | int | 10 |
| 80 | E20 | OVERRIDE FOR PECKING (%) | int | 0 |
| 84 | E37 | RETRACT DIST. FOR PECKING | len4 | 0.0787 |
| 90 | E129 | RADIAL OVERLAP VALUE | int | 0 |

### 0xF4 TRANSFER

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 10 | TC44 | APPROACH PT. CLEARANCE(CHUCK) | len4 | 0.0400 |
| 12 | TC57 | TRANSFER/PUSH SPEED (/min) | len1 | 3.9 |
| 14 | TC59 | PUSH-PAST DISTANCE | len4 | 0.0394 |
| 16 | TC58 | SPDL.SPEED IN TRANSFER(min-1) | int | 1000 |
| 20 | TC104 | APPROACH PT. CLEARANCE(BAR) | len4 | 0.0000 |

### 0xF5 BAR

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | TC67 | ROUGHING WALL RELIEF-X RADIUS | len4 | 0.0394 |
| 10 | TC68 | ROUGHING WALL RELIEF-Z | len4 | 0.0394 |
| 12 | TC1 | ROUGHING INFEED DAMPING RATIO | int | 100 |
| 14 | TC5 | 45° FEEDRATE DECELERATION (%) | int | 50 |
| 16 | TC6 | 90° FEEDRATE DECELERATION (%) | int | 50 |
| 18 | TC71 | FEED PAUSE DWELL (ROTATION) | int | 0 |
| 20 | TC13 | FEEDRATE% REDUCE AT START CUT | int | 100 |
| 22 | TC15 | FEEDRATE REDUCE DISTANCE | len4 | 0.0000 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 60 | TC54 | INNER CYCLE DIVIDED CUT WIDTH | len4 | 1.9690 |
| 62 | TC155 | OUTER CYCLE DIVIDED CUT WIDTH | len4 | 1.1811 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

### 0xF6 CPY

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | TC7 | FEEDRATE ACCELERATION (%) | int | 200 |
| 20 | TC13 | FEEDRATE% REDUCE AT START CUT | int | 100 |
| 22 | TC15 | FEEDRATE REDUCE DISTANCE | len4 | 0.0000 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

### 0xF7 CORNER

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | TC67 | ROUGHING WALL RELIEF-X RADIUS | len4 | 0.0394 |
| 10 | TC68 | ROUGHING WALL RELIEF-Z | len4 | 0.0394 |
| 12 | TC1 | ROUGHING INFEED DAMPING RATIO | int | 100 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

### 0xF8 FACING

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 12 | TC56 | DISTANCE PAST FINAL POINT | len4 | 0.0394 |
| 14 | TC76 | EDGE RELIEF | len4 | 0.0394 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

### 0xF9 THREAD

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 10 | TC41 | THREADING CLEARANCE (RADIUS) | len4 | 0.0787 |
| 12 | TC77 | MAXIMUM ACCELERATION DISTANCE | len1 | 6.0 |
| 14 | TC78 | THREAD FINISHING ALLOWANCE | len4 | 0.0010 |
| 18 | TC82 | THREAD CHAMFERING STROKE | len1 | 0.5 |
| 24 | TC290 | TOOL PATH PATTERN | bits | 00000000 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

### 0xFA T.GROOVE

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | TC52 | DWELL AT GROOVE BOTTOM (rev) | int | 3 |
| 10 | TC42 | X-AXIS GROOVE CLEARANCE (DIA) | len4 | 0.0236 |
| 12 | TC43 | Z-AXIS GROOVE CLEARANCE | len4 | 0.0400 |
| 14 | TC73 | GROOVE RECIPROCATING FEEDRATE | len4 | 0.0394 |
| 16 | TC74 | GROOVE RELIEF (PECKING) | len4 | 0.0039 |
| 18 | TC75 | GROOVE MINIMUM OVERLAP | len4 | 0.0197 |
| 20 | TC69 | FEED PAUSE DWELL (ROTATION) | int | 1 |
| 22 | TC156 | CUTTING LOAD REDUCTION WIDTH | len4 | 0.0039 |
| 24 | TC290 | TOOL PATH PATTERN | bits | 00000000 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 60 | TC158 | WIDTH DIR. CUT. OVERRIDE(%) | int | 0 |
| 62 | TC159 | CUTTING LOAD REDUCTION HEIGHT | len4 | 0.0039 |
| 64 | TC160 | WALL RELIEF-X FOR BI-DIR. | len4 | 0.0000 |
| 66 | TC161 | WALL RELIEF-Z FOR BI-DIR. | len4 | 0.0000 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

### 0xFB T.DRILL

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | TC47 | DRILL RELIEF | len4 | 0.0079 |
| 10 | TC20 | REAMER RECIPROCATING RATE (%) | int | 200 |
| 12 | TC11 | START PT. F/R DECEL. RATIO | int | 50 |
| 14 | TC12 | FINAL PT. F/R DECEL. RATIO | int | 70 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

### 0xFC T.TAP

| offset | parameter | name | kind | default |
|---|---|---|---|---|
| 8 | TC21 | NUMBER OF INCOMPLETE THREADS | len1 | 1.0 |
| 10 | TC22 | TAPPER ELONGATION ALLOWANCE | len1 | 3.0 |
| 46 | TC37 | SAFETY CLEARANCE OUT (RADIUS) | len4 | 0.0394 |
| 48 | TC38 | SAFETY CLEARANCE IN (RADIUS) | len4 | 0.0394 |
| 50 | TC39 | SAFETY CONTOUR CLEARANCE FACE | len4 | 0.0787 |
| 52 | TC40 | SAFETY CONTOUR CLEARANCE BAK | len4 | 0.0787 |
| 56 | TC62 | MILL SPINDLE INDEX POSITION | int | 0 |
| 96 | TC45 | TOOL Z CLEARANCE AFTER FACING | len4 | 0.0079 |

Turning units (`0xF5`-`0xFC`) also end with TC37-TC40 @46..52, TC62 @56, TC45 @96; on a turning machine the point units add TC37-TC40 and TC62.

## Bit fields (bit 0 rightmost; 1 does what is written)

**D91** (default 11111001)

- bit 0: M04 after the dwell at the bottom (tapping)
- bit 1: Dwell after M04 at the bottom (tapping)
- bit 2: Dwell after returning to the R-point (tapping)
- bit 3: Drill pre-machining in a centre-drill cycle: R-point at D1
- bit 4: Shorten the finishing path, true-circle end milling
- bit 5: Shorten the path, true-circle chamfering
- bit 6: Pre-machining in the unit: drill R-point at D1 / D42
- bit 7: Chamfer cycle 2 / smooth chamfering: R-point at D42 (0: TC39)

**D92** (default 00001111)

- bit 0: Use E17 for the axial feed, true-circle end milling
- bit 1: Back spot facer R1-point at D1
- bit 2: Reamer R-point at D1 after chamfer pre-machining
- bit 3: Tap R-point at D1 after chamfer pre-machining
- bit 4: Check interference at the D17 clearance
- bit 5: Dwell time for synchronous tapping valid
- bit 6: Clear chips before threading, planetary tapping
- bit 7: Alarm 650 when chamfering cuts air

**E91** (default 10011111)

- bit 0: Outside to inside (0: inside to outside)
- bit 1: Fixed cutting direction (0: direction reversing)
- bit 2: R-point at E7 / E9 by pre-machining (0: always E9)
- bit 3: X-Y clearance E5 / E2 by pre-machining (0: always E2)
- bit 4: To be determined (not in the manuals)
- bit 5: To be determined (not in the manuals)
- bit 6: To be determined (not in the manuals)
- bit 7: Machining from the outside: path along an outside form (0: inside form)

**E98** (default 00000000)

- bit 0: To be determined (not in the manuals)
- bit 1: To be determined (not in the manuals)
- bit 2: To be determined (not in the manuals)
- bit 3: To be determined (not in the manuals)
- bit 4: To be determined (not in the manuals)
- bit 5: To be determined (not in the manuals)
- bit 6: To be determined (not in the manuals)
- bit 7: To be determined (not in the manuals)

**E93** (default 00001111)

- bit 0: Outside to inside (0: inside to outside)
- bit 1: Fixed cutting direction (0: direction reversing); no change seen on a circular island
- bit 2: R-point at E7 / E9 by pre-machining (0: always E9); changes the finish pass
- bit 3: X-Y clearance E5 / E2 by pre-machining (0: always E2); changes the finish pass
- bit 4: Finish time 2.3 s shorter when 1, same picture
- bit 5: To be determined (no change seen in the time or the picture)
- bit 6: To be determined (no change seen in the time or the picture)
- bit 7: To be determined (no change seen in the time or the picture)

**E94** (default 00011110)

- bit 0: Outside to inside (0: inside to outside)
- bit 1: Fixed cutting direction (0: direction reversing)
- bit 2: R-point at E7 / E9 by pre-machining (0: always E9)
- bit 3: X-Y clearance E5 / E2 by pre-machining (0: always E2)
- bit 4: To be determined (not in the manuals)
- bit 5: To be determined (not in the manuals)
- bit 6: To be determined (not in the manuals)
- bit 7: To be determined (not in the manuals)

**E97** (default 00010100)

- bit 0: To be determined (not in the manuals)
- bit 1: To be determined (not in the manuals)
- bit 2: R-point at E7 / E9 by pre-machining (0: always E9)
- bit 3: To be determined (not in the manuals)
- bit 4: To be determined (not in the manuals)
- bit 5: To be determined (not in the manuals)
- bit 6: To be determined (not in the manuals)
- bit 7: To be determined (not in the manuals)

**TC290** (default 00000000)

- bit 0: To be determined (no change seen in the time or the picture)
- bit 1: To be determined (no change seen in the time or the picture)
- bit 2: To be determined (no change seen in the time or the picture)
- bit 3: To be determined (no change seen in the time or the picture)
- bit 4: To be determined (no change seen in the time or the picture)
- bit 5: To be determined (no change seen in the time or the picture)
- bit 6: To be determined (no change seen in the time or the picture)
- bit 7: To be determined (no change seen in the time or the picture)

**D141** (default 00000010)

- bit 0: Chip ejection, deep-hole drilling
- bit 1: Feed-in, deep-hole boring
- bit 2: Circular milling: circular processing selection method
- bit 3: Gundrill / longdrill: spindle rotation direction entering guide holes
- bit 4: Gundrill: orientation after approach
- bit 5: Gundrill / longdrill: coolant ON/OFF timing
- bit 6: Gundrill: spindle rotation entering guide holes
- bit 7: Gundrill: spindle stop position after machining

**E92** (default 00001101)

- bit 0: Outside to inside (0: inside to outside)
- bit 1: To be determined (no change seen in the time or the picture)
- bit 2: R-point at E7 / E9 by pre-machining (0: always E9)
- bit 3: X-Y clearance E5 / E2 by pre-machining (0: always E2)
- bit 4: Rapid down to the surface + E9
- bit 5: To be determined (no change seen in the time or the picture)
- bit 6: To be determined (no change seen in the time or the picture)
- bit 7: To be determined (no change seen in the time or the picture)

**E95** (default 11011101)

- bit 0: To be determined (no change seen in the control's time)
- bit 1: Stop if the approach path collides
- bit 2: 2nd and later cuts go via the approach point
- bit 3: 2nd and later cuts stay down (0: escape to Z initial)
- bit 4: Rapid down to the surface + E9
- bit 5: Escape where the tool leaves the allowance
- bit 6: R-point at E7 / E9 by pre-machining (0: always E9)
- bit 7: X-Y clearance E5 / E2 by pre-machining, outside/inside (0: always E2)

**E96** (default 00000110)

- bit 0: To be determined (not in the manuals)
- bit 1: R-point height, slot
- bit 2: Approach method on the 2nd and later rounds, slot
- bit 3: To be determined (not in the manuals)
- bit 4: Approach point on the 2nd and later rounds, slot
- bit 5: Return feed override, slot
- bit 6: To be determined (not in the manuals)
- bit 7: Smooth chamfering, slot: limits by the chamfer tool edge angle

**E99** (default 00000000)

- bit 0: Feed range for shape sequences
- bit 1: Pocket: finish bottom and wall together
- bit 2: To be determined (not in the manuals)
- bit 3: Face: check the approach-to-start move
- bit 4: Line: alarm 705 when the last shape move is zero
- bit 5: To be determined (not in the manuals)
- bit 6: Line: start near the automatic approach point
- bit 7: To be determined (not in the manuals)

**E104** (default 00000000)

- bit 0: Cutting method after an automatic approach point
- bit 1: Return position, face machining
- bit 2: Return position, line machining
- bit 3: Infeed position at a CLOSED wall, line machining
- bit 4: Joining shapes, line machining
- bit 5: Joining shapes, face wall finishing
- bit 6: ZC feed rate calculation
- bit 7: Tool change command output

Findings from flipping bits on the control (time and tool path picture): D92 bit 3 shortens the tap and changes the path; E93 bits 2 and 3 change the finish pass and bit 4 shortens it by 2.3 s; E104 bit 7 adds 14 ms; E92 bits 1/5/6/7, E95 bits 0/1/5, E104 bits 0-6, TC290 bits 0-7, D91 bits 3/5 and D92 bits 2/4/7 showed no change on the cases tried.

## Defaults

Stored values; what the control shows in a new program on a horizontal mill. Machine-dependent: **D92** 0F (horizontal mill), 2F (lathe), 1F (mill-turn); **E99** 00 (horizontal mill), 30 (mill-turn), 40 (metric machine); **D141** 02 (mill, lathe), D2 (mill-turn); **TC62** 0 / 6, **TC45** 0.0079 / 0.1 (350 / mill-turn). The editor never marks bits D92 4-5 and E99 4-6 as changed.

```
E: {"E1":8,"E2":12,"E5":2,"E7":2,"E8":4,"E9":12,"E11":4,"E12":20,"E13":2,"E15":1,"E16":10,"E17":4,"E18":8,"E20":0,"E21":4,"E22":70,"E23":70,"E24":25,"E25":150,"E30":12,"E31":6,"E32":5,"E33":200,"E34":10,"E35":200,"E36":10,"E37":787,"E129":0}
TC: {"TC44":400,"TC57":39,"TC58":1000,"TC59":394,"TC104":0,"TC37":394,"TC38":394,"TC39":787,"TC40":787,"TC62":0,"TC45":79,"TC1":100,"TC5":50,"TC6":50,"TC7":200,"TC11":50,"TC12":70,"TC13":100,"TC15":0,"TC20":200,"TC21":10,"TC22":30,"TC41":787,"TC42":236,"TC43":400,"TC47":79,"TC52":3,"TC54":19690,"TC155":11811,"TC56":394,"TC67":394,"TC68":394,"TC69":1,"TC71":0,"TC73":394,"TC74":39,"TC75":197,"TC76":394,"TC77":60,"TC78":10,"TC82":5,"TC156":39,"TC158":0,"TC159":39,"TC160":0,"TC161":0}
mill-turn: {"TC62":6,"TC45":1000,"TC71":1,"TC54":11811,"D141":210,"E99":48}
metric: {"E1":20,"E2":30,"E5":5,"E7":5,"E9":30,"E21":10,"E37":2000,"D1":30,"D17":10,"D41":3,"D45":100,"D46":100,"D55":200,"F12":1000}
```

## Colours on the control's program screen

- white = typed by the user; yellow = worked out by the control (AUTO SET) or a `?` left for it, and always the priority number column; green = fixed text (unit, tool, figure names); magenta box = the second variant of a menu value. Meaning (programming manuals): PART `*OUT` `*IN` `*FCE` `*BAK` = "middle type" (cut from the middle of the periphery / face); lathe tool section `*IN` `*EDG` = the back-side (BAK) tool; `*CCW` `*CW` on CIRC MIL = direction of the circular tornado cycle (TORNA. 1). Face-milling TYPE `*XBI` ... and PAT `*CHK`: not found in the manuals (the TYPE ones are probably the SHORT / ARCSHORT variants).
- Tool line byte 13: bit 2 (0x04) APRCH-X calculated, bit 3 (0x08) APRCH-Y calculated, bits 0 / 1 = `?` for X / Y. Typing a value clears the flag. Typing the value already shown changes nothing.
- Turning PART (unit byte 20): 1 OUT, 2 *OUT, 3 IN, 4 *IN, 5 FCE, 6 *FCE, 7 BAK, 8 *BAK.
