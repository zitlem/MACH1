
const u16=(r,o)=>r[o]|r[o+1]<<8, fixed=(v,d)=>v.toFixed(d);
  const TURN_COMMON = [
    [46, 'TC37', 'SAFETY CLEARANCE OUT (RADIUS)', 'len4'], [48, 'TC38', 'SAFETY CLEARANCE IN (RADIUS)', 'len4'], [50, 'TC39', 'SAFETY CONTOUR CLEARANCE FACE', 'len4'],
    [52, 'TC40', 'SAFETY CONTOUR CLEARANCE BAK', 'len4'], [56, 'TC62', 'MILL SPINDLE INDEX POSITION', 'int'], [96, 'TC45', 'TOOL Z CLEARANCE AFTER FACING', 'len4'],
  ];
  const TURN_POINT = TURN_COMMON.slice(0, 5);       // the point-machining units on a turning machine show these five
  const TPC_LAYOUTS = {
    0xd4: { unit: 'TAPPING', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'],
      [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'], [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'],
      [28, 'D22', 'TAPPING CYCLE DWELL TIME(SEC)', 'sec2'], [38, 'D29', 'CHIP VACUUM TIME (SEC)', 'int'],
      [30, 'D30', 'NUMBER OF INCOMPLETE THREAD', 'int'], [32, 'D31', 'TAPPER ELONGATION ALLOWANCE', 'int'],
      [34, 'D32', 'TAP ROT. UNTIL SPINDLE STOPS', 'int'], [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'],
      [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [54, 'D43', 'INCOMPLETE THREAD NUM (PIPE)', 'int'],
      [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'],
      [36, 'D48', 'PLANET TAP CHAMF.OVERRIDE (%)', 'int'], [40, 'D49', 'PLANET RETRACT BOTTOM (PITCH)', 'dec1'],
      [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'], [26, 'D92', 'TOOL PATH PATTERN', 'bits'],
    ] },
    // from PRG-J (a Matrix mill, 2026-10-01): each unit twice, once with every TPC value changed. Names where
    // the control's lists give them; the others show their number only.
    0xd0: { unit: 'DRILLING', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'],
      [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'], [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'],
      [24, 'D91', 'TOOL PATH PATTERN', 'bits'], [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'],
      [28, 'D52', '', 'int'], [30, 'D53', '', 'int'], [32, 'F12', '', 'len5'], [36, 'D55', '', 'len4'],
      [16, 'D54', '', 'int'], [18, 'D58', '', 'int'], [26, 'D59', '', 'int'],
      [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int', 'S'], [64, 'D66', 'APPROACH RAPID FEED RATE(%)', 'int', 'S'], [68, 'D130', '', 'len2', 'S'], [72, 'D141', '', 'bits', 'S'],      // 'S': Smooth controls only
    ] },
    0xd6: { unit: 'CIRC MIL', fields: [
      [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'], [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [16, 'D19', '', 'int'],
      [18, 'D23', '', 'len1'], [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'],
      [24, 'D91', 'TOOL PATH PATTERN', 'bits'], [26, 'D92', 'TOOL PATH PATTERN', 'bits'], [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'],
    ] },
    0xde: { unit: 'LINE LFT', fields: [
      [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'], [18, 'E17', '', 'int'],
      [24, 'E22', '', 'int'], [28, 'E23', '', 'int'], [60, 'E30', '', 'len2'], [32, 'E24', '', 'int'], [36, 'E25', '', 'int'],
      [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [58, 'E104', '', 'bits'],
    ] },
    0xe2: { unit: 'CHMF LFT', fields: [
      [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [42, 'E8', '', 'len2'], [16, 'E9', '', 'len2'], [44, 'E11', '', 'len2'],
      [18, 'E17', '', 'int'], [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [60, 'E30', '', 'len2'],
    ] },
    // from a copy of a program on a Smooth control (2026-10-08): each unit edited with every TPC value typed as something
    // different, the saved files compared byte for byte (E17 holds one digit; a unit with no TPC gets the record, and two
    // relay point records, when its first value is accepted)
    0xd1: { unit: 'RGH CBOR', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'], [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'],
      [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [16, 'D19', 'ENDMILL DWELL AT HOLE BOTTOM', 'int'], [18, 'D23', 'E-MILL PRE-DIA CLEARANCE', 'len1'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'],
      [26, 'D92', 'TOOL PATH PATTERN', 'bits'], [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'],
      [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'],
    ] },
    0xeb: { unit: 'SLOT', fields: [
      [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'], [18, 'E17', '', 'int'], [80, 'E20', 'OVERRIDE FOR PECKING (%)', 'int'], [20, 'E21', '', 'len2'],
      [60, 'E32', '', 'int'], [64, 'E33', '', 'int'], [68, 'E34', '', 'int'], [72, 'E35', '', 'int'], [76, 'E36', '', 'int'], [84, 'E37', 'RETRACT DIST. FOR PECKING', 'len4'],
      [44, 'E96', 'TOOL PATH PATTERN', 'bits'], [58, 'E104', '', 'bits'], [90, 'E129', 'RADIAL OVERLAP VALUE', 'int'],
    ] },
    0xe0: { unit: 'LINE IN', fields: [
      [8, 'E1', '', 'len2'], [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [12, 'E5', '', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'],
      [18, 'E17', '', 'int'], [20, 'E21', '', 'len2'], [24, 'E22', '', 'int'], [28, 'E23', '', 'int'], [32, 'E24', '', 'int'], [36, 'E25', '', 'int'],
      [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [58, 'E104', '', 'bits'],
    ] },
    0xdd: { unit: 'LINE RGT', fields: [
      [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'], [18, 'E17', '', 'int'],
      [24, 'E22', '', 'int'], [28, 'E23', '', 'int'], [32, 'E24', '', 'int'], [36, 'E25', '', 'int'], [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [58, 'E104', '', 'bits'],
    ] },
    0xdf: { unit: 'LINE OUT', fields: [
      [8, 'E1', '', 'len2'], [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [12, 'E5', '', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'],
      [18, 'E17', '', 'int'], [20, 'E21', '', 'len2'], [24, 'E22', '', 'int'], [28, 'E23', '', 'int'], [32, 'E24', '', 'int'], [36, 'E25', '', 'int'],
      [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [58, 'E104', '', 'bits'],
    ] },
    0xd3: { unit: 'REAMING', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'], [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'],
      [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [28, 'D18', 'REAMER,BORING RETURN FEEDRATE', 'int'], [16, 'D19', 'ENDMILL DWELL AT HOLE BOTTOM', 'int'],
      [18, 'D23', 'E-MILL PRE-DIA CLEARANCE', 'len1'], [30, 'D24', 'BORING DWELL AT HOLE BOTTOM', 'int'], [32, 'D25', 'BORING TOOL EDGE RELIEF', 'len2'],
      [34, 'D26', 'BORING RETRACT FEEDRATE DIST.', 'len2'], [36, 'D28', 'BORING BOTTOM FIN. ALLOWANCE', 'len2'], [38, 'D29', 'CHIP VACUUM TIME (SEC)', 'int'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'],
      [26, 'D92', 'TOOL PATH PATTERN', 'bits'],
      [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'], [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'],
    ] },
    // BORE T1 / S1 / T2 / S2: REAMING's layout without D29 (the counterbore sizes stay in the unit's own record)
    0xd8: { unit: 'BORE T1', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'], [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'],
      [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [28, 'D18', 'REAMER,BORING RETURN FEEDRATE', 'int'], [16, 'D19', 'ENDMILL DWELL AT HOLE BOTTOM', 'int'],
      [18, 'D23', 'E-MILL PRE-DIA CLEARANCE', 'len1'], [30, 'D24', 'BORING DWELL AT HOLE BOTTOM', 'int'], [32, 'D25', 'BORING TOOL EDGE RELIEF', 'len2'],
      [34, 'D26', 'BORING RETRACT FEEDRATE DIST.', 'len2'], [36, 'D28', 'BORING BOTTOM FIN. ALLOWANCE', 'len2'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'],
      [26, 'D92', 'TOOL PATH PATTERN', 'bits'],
      [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'], [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'],
    ] },
    0xd9: { unit: 'BORE S1', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'], [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'],
      [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [28, 'D18', 'REAMER,BORING RETURN FEEDRATE', 'int'], [16, 'D19', 'ENDMILL DWELL AT HOLE BOTTOM', 'int'],
      [18, 'D23', 'E-MILL PRE-DIA CLEARANCE', 'len1'], [30, 'D24', 'BORING DWELL AT HOLE BOTTOM', 'int'], [32, 'D25', 'BORING TOOL EDGE RELIEF', 'len2'],
      [34, 'D26', 'BORING RETRACT FEEDRATE DIST.', 'len2'], [36, 'D28', 'BORING BOTTOM FIN. ALLOWANCE', 'len2'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'],
      [26, 'D92', 'TOOL PATH PATTERN', 'bits'],
      [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'], [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'],
    ] },
    0xda: { unit: 'BORE T2', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'], [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'],
      [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [28, 'D18', 'REAMER,BORING RETURN FEEDRATE', 'int'], [16, 'D19', 'ENDMILL DWELL AT HOLE BOTTOM', 'int'],
      [18, 'D23', 'E-MILL PRE-DIA CLEARANCE', 'len1'], [30, 'D24', 'BORING DWELL AT HOLE BOTTOM', 'int'], [32, 'D25', 'BORING TOOL EDGE RELIEF', 'len2'],
      [34, 'D26', 'BORING RETRACT FEEDRATE DIST.', 'len2'], [36, 'D28', 'BORING BOTTOM FIN. ALLOWANCE', 'len2'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'],
      [26, 'D92', 'TOOL PATH PATTERN', 'bits'],
      [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'], [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'],
    ] },
    0xdb: { unit: 'BORE S2', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'], [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'],
      [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [28, 'D18', 'REAMER,BORING RETURN FEEDRATE', 'int'], [16, 'D19', 'ENDMILL DWELL AT HOLE BOTTOM', 'int'],
      [18, 'D23', 'E-MILL PRE-DIA CLEARANCE', 'len1'], [30, 'D24', 'BORING DWELL AT HOLE BOTTOM', 'int'], [32, 'D25', 'BORING TOOL EDGE RELIEF', 'len2'],
      [34, 'D26', 'BORING RETRACT FEEDRATE DIST.', 'len2'], [36, 'D28', 'BORING BOTTOM FIN. ALLOWANCE', 'len2'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'],
      [26, 'D92', 'TOOL PATH PATTERN', 'bits'],
      [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'], [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'],
    ] },
    // turning centre (read from a program edited on Smooth CAM Ai): the common fields sit at the same bytes in every unit;
    // TC45 is not on the point units' screens
    0xf5: { unit: 'BAR', fields: [
      [8, 'TC67', 'ROUGHING WALL RELIEF-X RADIUS', 'len4'], [10, 'TC68', 'ROUGHING WALL RELIEF-Z', 'len4'], [12, 'TC1', 'ROUGHING INFEED DAMPING RATIO', 'int'],
      [14, 'TC5', '45° FEEDRATE DECELERATION (%)', 'int'], [16, 'TC6', '90° FEEDRATE DECELERATION (%)', 'int'], [18, 'TC71', 'FEED PAUSE DWELL (ROTATION)', 'int'],
      [20, 'TC13', 'FEEDRATE% REDUCE AT START CUT', 'int'], [22, 'TC15', 'FEEDRATE REDUCE DISTANCE', 'len4'],
      [60, 'TC54', 'INNER CYCLE DIVIDED CUT WIDTH', 'len4'], [62, 'TC155', 'OUTER CYCLE DIVIDED CUT WIDTH', 'len4'],
    ].concat(TURN_COMMON) },
    0xf6: { unit: 'CPY', fields: [
      [8, 'TC7', 'FEEDRATE ACCELERATION (%)', 'int'], [20, 'TC13', 'FEEDRATE% REDUCE AT START CUT', 'int'], [22, 'TC15', 'FEEDRATE REDUCE DISTANCE', 'len4'],
    ].concat(TURN_COMMON) },
    0xf7: { unit: 'CORNER', fields: [
      [8, 'TC67', 'ROUGHING WALL RELIEF-X RADIUS', 'len4'], [10, 'TC68', 'ROUGHING WALL RELIEF-Z', 'len4'], [12, 'TC1', 'ROUGHING INFEED DAMPING RATIO', 'int'],
    ].concat(TURN_COMMON) },
    0xf8: { unit: 'FACING', fields: [
      [12, 'TC56', 'DISTANCE PAST FINAL POINT', 'len4'], [14, 'TC76', 'EDGE RELIEF', 'len4'],
    ].concat(TURN_COMMON) },
    0xf9: { unit: 'THREAD', fields: [
      [10, 'TC41', 'THREADING CLEARANCE (RADIUS)', 'len4'], [12, 'TC77', 'MAXIMUM ACCELERATION DISTANCE', 'len1'], [14, 'TC78', 'THREAD FINISHING ALLOWANCE', 'len4'],
      [18, 'TC82', 'THREAD CHAMFERING STROKE', 'len1'], [24, 'TC290', 'TOOL PATH PATTERN', 'bits'],
    ].concat(TURN_COMMON) },
    0xfa: { unit: 'T.GROOVE', fields: [
      [10, 'TC42', 'X-AXIS GROOVE CLEARANCE (DIA)', 'len4'], [12, 'TC43', 'Z-AXIS GROOVE CLEARANCE', 'len4'], [8, 'TC52', 'DWELL AT GROOVE BOTTOM (rev)', 'int'],
      [20, 'TC69', 'FEED PAUSE DWELL (ROTATION)', 'int'], [14, 'TC73', 'GROOVE RECIPROCATING FEEDRATE', 'len4'], [16, 'TC74', 'GROOVE RELIEF (PECKING)', 'len4'],
      [18, 'TC75', 'GROOVE MINIMUM OVERLAP', 'len4'], [22, 'TC156', 'CUTTING LOAD REDUCTION WIDTH', 'len4'], [60, 'TC158', 'WIDTH DIR. CUT. OVERRIDE(%)', 'int'],
      [62, 'TC159', 'CUTTING LOAD REDUCTION HEIGHT', 'len4'], [64, 'TC160', 'WALL RELIEF-X FOR BI-DIR.', 'len4'], [66, 'TC161', 'WALL RELIEF-Z FOR BI-DIR.', 'len4'], [24, 'TC290', 'TOOL PATH PATTERN', 'bits'],
    ].concat(TURN_COMMON) },
    0xfb: { unit: 'T.DRILL', fields: [
      [8, 'TC47', 'DRILL RELIEF', 'len4'], [10, 'TC20', 'REAMER RECIPROCATING RATE (%)', 'int'], [12, 'TC11', 'START PT. F/R DECEL. RATIO', 'int'],
      [14, 'TC12', 'FINAL PT. F/R DECEL. RATIO', 'int'],
    ].concat(TURN_COMMON) },
    0xfc: { unit: 'T.TAP', fields: [
      [8, 'TC21', 'NUMBER OF INCOMPLETE THREADS', 'len1'], [10, 'TC22', 'TAPPER ELONGATION ALLOWANCE', 'len1'],
    ].concat(TURN_COMMON) },
    0xdc: { unit: 'LINE CTR', fields: [
      [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'], [18, 'E17', '', 'int'], [60, 'E30', '', 'len2'],
      [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [58, 'E104', '', 'bits'],
    ] },
    0xe4: { unit: 'CHMF IN', fields: [
      [8, 'E1', '', 'len2'], [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [42, 'E8', '', 'len2'], [16, 'E9', '', 'len2'], [44, 'E11', '', 'len2'],
      [18, 'E17', '', 'int'], [20, 'E21', '', 'len2'], [40, 'E95', 'TOOL PATH PATTERN', 'bits'],
    ] },
    0xe3: { unit: 'CHMF OUT', fields: [
      [8, 'E1', '', 'len2'], [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [42, 'E8', '', 'len2'], [16, 'E9', '', 'len2'], [44, 'E11', '', 'len2'],
      [18, 'E17', '', 'int'], [20, 'E21', '', 'len2'], [40, 'E95', 'TOOL PATH PATTERN', 'bits'],
    ] },
    0xe5: { unit: 'FCE MILL', fields: [
      [16, 'E9', '', 'len2'], [40, 'E12', '', 'len2'], [44, 'E15', '', 'int'], [58, 'E104', '', 'bits'],
    ] },
    0xe8: { unit: 'POCKET', fields: [
      [8, 'E1', 'CLOSE PATTERN APPROACH/ESCAPE', 'len2'], [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'],
      [12, 'E5', 'APPROACH/ESCAPE 2ND CLEARANCE', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'], [18, 'E17', '', 'int'],
      [42, 'E92', 'TOOL PATH PATTERN', 'bits'], [88, 'E99', '', 'bits'], [40, 'E18', '', 'int'], [20, 'E21', '', 'len2'],
      [24, 'E22', '', 'int'], [28, 'E23', '', 'int'], [32, 'E24', '', 'int'], [36, 'E25', '', 'int'], [92, 'E31', '', 'int'],
      [58, 'E104', '', 'bits'], [60, 'E32', '', 'int'], [64, 'E33', '', 'int'], [68, 'E34', '', 'int'], [72, 'E35', '', 'int'],
      [76, 'E36', '', 'int'], [80, 'E20', '', 'int'], [84, 'E37', '', 'len4'],
    ] },
  };
  // Short names and bit meanings of the user parameters a TPC holds, summarised in our own words from the machine's
  // parameter list (Smooth G / Matrix user parameters D = point machining, E = line/face, F = common).
  const TPC_NAMES = {
    D1: '2nd R-point height', D3: 'Dwell at hole bottom, spot (rev)', D16: 'Dwell at hole bottom, chamfer (rev)',
    D17: 'Chamfer cutter interference clearance', D19: 'Dwell at hole bottom, end mill (rev)', D22: 'Tapping dwell time (s)',
    D23: 'Pre-hole clearance, end milling', D29: 'Chip removal time (s)', D30: 'Incomplete threads (tapping)',
    D31: 'Tap holder elongation', D32: 'Spindle revs before reversing (tapping)', D41: 'R-point height',
    D42: '3rd R-point height', D43: 'Incomplete threads (pipe tap)', D45: 'Peck decrement (drilling)',
    D46: 'Minimum peck depth (drilling)', D48: 'Feed override on chamfer, planetary tap (%)', D49: 'Return at bottom, planetary tap (pitch)',
    D52: 'Rapid relief reduction, very deep drilling (%)', D53: 'Pecks before full return, very deep drilling',
    D54: 'Feed reduction at start, very deep drilling (%)', D55: 'Return distance, very deep drilling',
    D58: 'Slow-start distance, very deep drilling (%)', D59: 'Speed reduction at hole end, very deep drilling (%)',
    D62: 'Maximum automatic pecks', F12: 'Peck return, high-speed deep hole',
    D91: 'Point machining options (tapping, R-points)', D92: 'Point machining options 2',
    E1: 'Start/escape point, closed shape', E2: 'Start/escape clearance, 1st (X-Y)', E5: 'Start/escape clearance, 2nd (X-Y)',
    E7: 'Axial start allowance, 2nd clearance', E8: 'Chamfer cutter radial clearance', E9: 'Axial start allowance, 1st clearance',
    E11: 'Chamfer cutter axial clearance', E12: 'Face mill radial clearance', E15: 'Face mill path (reciprocating short)',
    E17: 'Axial feed override (%)', E18: 'Full-width cut override, pocket (%)', E20: 'Axial feed override, Z pecking (%)',
    E21: 'Wall machining overlap amount', E22: 'Corner override (%)', E23: 'Corner override: max removal', E24: 'Corner override: min removal',
    E25: 'Corner override: max angle', E30: 'Approach/escape clearance, closed ends', E31: 'Non-cutting tool R depth (one digit)',
    E32: 'Helical approach radius', E33: 'Helical approach gradient', E34: 'Tapered approach distance', E35: 'Tapered approach gradient',
    E36: 'Tapered escape distance', E37: 'Z peck return, face machining', E92: 'Tool path pattern, pocket', E95: 'Tool path pattern, line',
    E99: 'Line/face options', E104: 'Line/face options 2',
  };
  // what the control shows before anything is changed (read from its TPC screens); a changed field turns yellow there
  // what a new program shows on the control (read from its TPC screens, view mode, on a horizontal mill).
  // Stored values; E-line fields are the same in every unit, D fields are per unit.
  const TPC_BIT_DEFAULT = { D91: 0xF9, D92: 0x0F, D141: 0x02, E91: 0x9F, E92: 0x0D, E93: 0x0F, E94: 0x1E, E95: 0xDD, E96: 0x06, E97: 0x14, E98: 0x00, E99: 0x00, E104: 0x00, TC290: 0x00 };
  // bits whose default is the machine's own setting (D92 bit 5, synchronous tapping dwell: 0 on the horizontal mills,
  // 1 on the lathe programs): never marked as changed
  const TPC_BIT_IGNORE = { D92: 0x30, E99: 0x70 };      // D92 bit 5: lathe, bit 4: the mill-turn (00011111); E99 00000000 on the horizontal mill, 00110000 on the mill-turn, 01000000 on a metric machine
  const TPC_DEFAULT_E = { E1: 8, E2: 12, E5: 2, E7: 2, E8: 4, E9: 12, E11: 4, E12: 20, E13: 2, E15: 1, E16: 10, E17: 4, E18: 8, E20: 0, E21: 4, E22: 70, E23: 70,
    E24: 25, E25: 150, E30: 12, E31: 6, E32: 5, E33: 200, E34: 10, E35: 200, E36: 10, E37: 787, E129: 0 };
  const D_BASE = { D1: 12, D3: 2, D16: 2, D17: 4, D19: 2, D23: 1, D41: 1, D42: 0, D45: 39, D46: 39, D62: 0 };
  const TPC_DEFAULT_D = {
    'RGH CBOR': D_BASE, 'CIRC MIL': D_BASE,
    DRILLING: Object.assign({}, D_BASE, { D52: 50, D53: 3, D54: 50, D58: 50, D59: 50, D66: 0, D130: 0 }),
    TAPPING: Object.assign({}, D_BASE, { D22: 0, D29: 3, D30: 3, D31: 2, D32: 3, D43: 2, D48: 70, D49: 1 }),
    REAMING: Object.assign({}, D_BASE, { D18: 4, D24: 2, D25: 2, D26: 1, D28: 2, D29: 3 }),
    'BORE T1': Object.assign({}, D_BASE, { D18: 4, D24: 2, D25: 2, D26: 1, D28: 2 }), 'BORE S1': Object.assign({}, D_BASE, { D18: 4, D24: 2, D25: 2, D26: 1, D28: 2 }),
    'BORE T2': Object.assign({}, D_BASE, { D18: 4, D24: 2, D25: 2, D26: 1, D28: 2 }), 'BORE S2': Object.assign({}, D_BASE, { D18: 4, D24: 2, D25: 2, D26: 1, D28: 2 }),
  };
  // turning TPC (the 350): TC fields are the same in every unit that has them; stored values
  const TPC_DEFAULT_TC = { TC37: 394, TC38: 394, TC39: 787, TC40: 787, TC62: 0, TC45: 79, TC1: 100, TC5: 50, TC6: 50, TC7: 200, TC11: 50, TC12: 70, TC13: 100, TC15: 0,
    TC20: 200, TC21: 10, TC22: 30, TC41: 787, TC42: 236, TC43: 400, TC47: 79, TC52: 3, TC54: 19690, TC155: 11811, TC56: 394, TC67: 394, TC68: 394, TC69: 1,
    TC71: 0, TC73: 394, TC74: 39, TC75: 197, TC76: 394, TC77: 60, TC78: 10, TC82: 5, TC156: 39, TC158: 0, TC159: 39, TC160: 0, TC161: 0 };
  // what differs on the mill-turn (read from a mill-turn's CAM data)
  const TPC_DEFAULT_MT = { TC62: 6, TC45: 1000, TC71: 1, TC54: 11811, D141: 0xD2, E99: 0x30 };
  function tpcDefault(unit, d, type, metric, kind) {
    if (metric) {                                              // lengths differ; the rest (counts, percentages, bits) are the same
      if (TPC_DEFAULT_MM[d] !== undefined) return TPC_DEFAULT_MM[d];
      if (TPC_SCALE_MM[kind] !== undefined || d.slice(0, 2) === 'TC') return null;
    }
    if (type === 'millturn' && TPC_DEFAULT_MT[d] !== undefined) return TPC_DEFAULT_MT[d];
    if (TPC_BIT_DEFAULT[d] !== undefined) return TPC_BIT_DEFAULT[d];
    if (d.slice(0, 2) === 'TC') return TPC_DEFAULT_TC[d] !== undefined ? TPC_DEFAULT_TC[d] : null;
    if (d === 'D49' && type && type !== 'mill') return 0;                  // planet retract: 1 on the horizontal mill, 0 on the lathe
    if (d[0] === 'E' && TPC_DEFAULT_E[d] !== undefined) return TPC_DEFAULT_E[d];
    const u = TPC_DEFAULT_D[unit];
    return u && u[d] !== undefined ? u[d] : null;
  }
  const TPC_BITS = {           // index = bit (0 = rightmost); what a 1 does
    D91: ['M04 after the dwell at the bottom (tapping)', 'Dwell after M04 at the bottom (tapping)', 'Dwell after returning to the R-point (tapping)',
      'Drill pre-machining in a centre-drill cycle: R-point at D1', 'Shorten the finishing path, true-circle end milling',
      'Shorten the path, true-circle chamfering', 'Pre-machining in the unit: drill R-point at D1 / D42',
      'Chamfer cycle 2 / smooth chamfering: R-point at D42 (0: TC39)'],
    D92: ['Use E17 for the axial feed, true-circle end milling', 'Back spot facer R1-point at D1', 'Reamer R-point at D1 after chamfer pre-machining',
      'Tap R-point at D1 after chamfer pre-machining', 'Check interference at the D17 clearance', 'Dwell time for synchronous tapping valid',
      'Clear chips before threading, planetary tapping', 'Alarm 650 when chamfering cuts air'],
    TC290: ['To be determined (not in the manuals)', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)'],
    D141: ['Chip ejection, deep-hole drilling', 'Feed-in, deep-hole boring', 'Circular milling: circular processing selection method',
      'Gundrill / longdrill: spindle rotation direction entering guide holes', 'Gundrill: orientation after approach', 'Gundrill / longdrill: coolant ON/OFF timing',
      'Gundrill: spindle rotation entering guide holes', 'Gundrill: spindle stop position after machining'],
    E92: ['Outside to inside (0: inside to outside)', 'To be determined (not in the manuals)', 'R-point at E7 / E9 by pre-machining (0: always E9)',
      'X-Y clearance E5 / E2 by pre-machining (0: always E2)', 'Rapid down to the surface + E9', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)', 'To be determined (not in the manuals)'],
    E95: ['To be determined (no change seen in the control\'s time)', 'Stop if the approach path collides', '2nd and later cuts go via the approach point', '2nd and later cuts stay down (0: escape to Z initial)',
      'Rapid down to the surface + E9', 'Escape where the tool leaves the allowance', 'R-point at E7 / E9 by pre-machining (0: always E9)',
      'X-Y clearance E5 / E2 by pre-machining, outside/inside (0: always E2)'],
    E96: ['To be determined (not in the manuals)', 'R-point height, slot', 'Approach method on the 2nd and later rounds, slot', 'To be determined (not in the manuals)', 'Approach point on the 2nd and later rounds, slot',
      'Return feed override, slot', 'To be determined (not in the manuals)', 'Smooth chamfering, slot: limits by the chamfer tool edge angle'],
    E99: ['Feed range for shape sequences', 'Pocket: finish bottom and wall together', 'To be determined (not in the manuals)', 'Face: check the approach-to-start move',
      'Line: alarm 705 when the last shape move is zero', 'To be determined (not in the manuals)', 'Line: start near the automatic approach point', 'To be determined (not in the manuals)'],
    E104: ['Cutting method after an automatic approach point', 'Return position, face machining', 'Return position, line machining',
      'Infeed position at a CLOSED wall, line machining', 'Joining shapes, line machining', 'Joining shapes, face wall finishing',
      'ZC feed rate calculation', 'Tool change command output'],
  };
  const TPC_SCALE = { len1: 0.1, len2: 0.01, len3: 0.001, len4: 0.0001, len5: 0.00001, sec2: 0.01, int: 1, dec: 1, dec1: 0.1, bits: 1 };
  // a metric program stores its lengths with one decimal fewer (a metric sample machine): E1 3.5 mm is 35, D45 1. is 100, F12 0.1 is 1000
  const TPC_SCALE_MM = { len1: 1, len2: 0.1, len3: 0.01, len4: 0.001, len5: 0.0001 };
  const TPC_DIGITS = { len1: 1, len2: 2, len3: 3, len4: 4, len5: 5 }, TPC_DIGITS_MM = { len1: 0, len2: 1, len3: 2, len4: 3, len5: 4 };
  // the control's metric defaults (stored values)
  const TPC_DEFAULT_MM = { E1: 20, E2: 30, E5: 5, E7: 5, E9: 30, E21: 10, E37: 2000, D1: 30, D17: 10, D41: 3, D45: 100, D46: 100, D55: 200, F12: 1000 };
  // a TPC record's fields: {off, d, name, kind, raw, text, applies}; fields of an unknown layout come as raw words
  function tpcFields(rec, type, family, units) {
    // parameter records start xx 00 00 00; a record that starts E8 02 01 00 (two in the second lathe's programs) is something else
    // that shares the code: its fields do not fit the POCKET layout, so it is shown as stored
    const lay = rec[1] || rec[2] || rec[3] ? undefined : TPC_LAYOUTS[rec[0]], mask = u32(rec, 4), out = [];
    if (!lay) {
      for (let k = 0; 8 + 2 * k < REC; k++) if (mask & (1 << k) || u16(rec, 8 + 2 * k)) out.push({ off: 8 + 2 * k, d: '', name: 'field ' + (k + 1), kind: 'raw', raw: u16(rec, 8 + 2 * k), text: String(u16(rec, 8 + 2 * k)), applies: !!(mask & (1 << k)) });
      return { known: false, fields: out };
    }
    const fl = (type && type !== 'mill' && rec[0] < 0xf0 ? lay.fields.concat(TURN_POINT) : lay.fields).filter(x => x[4] !== 'S' || family === 'Smooth');      // a turning machine's point units also show TC37-TC40, TC62
    for (const [off, d, name, kind] of fl) {
      const raw = u16(rec, off), k = (off - 8) / 2;
      out.push({ off, d, name: TPC_NAMES[d] || name, kind, raw, text: tpcText(raw, kind, units === 'metric'), applies: true, bits: TPC_BITS[d] || null, def: tpcDefault(lay.unit, d, type, units === 'metric', kind), ign: TPC_BIT_IGNORE[d] || 0, metric: units === 'metric' });
    }
    return { known: true, unit: lay.unit, fields: out };
  }
  function tpcText(raw, kind, metric) {
    if (kind === 'bits') return raw.toString(2).padStart(8, '0');
    if (kind === 'dec') return raw + '.';
    if (kind === 'dec1') return raw % 10 ? (raw / 10).toFixed(1) : raw / 10 + '.';
    if (metric && TPC_SCALE_MM[kind] !== undefined) return fixed(raw * TPC_SCALE_MM[kind], TPC_DIGITS_MM[kind]);
    const sc = TPC_SCALE[kind] || 1;
    return sc === 1 ? String(raw) : fixed(raw * sc, TPC_DIGITS[kind] || 2);
  }
  // set one field from what was typed; throws with a message when it does not fit
  function tpcSet(rec, off, kind, text, metric) {
    const t = String(text).trim();
    let v;
    if (kind === 'bits') { if (!/^[01]{1,8}$/.test(t)) throw new Error('Type up to 8 bits as 0 and 1, e.g. 11111001'); v = parseInt(t, 2); }
    else {
      const n = parseFloat(t.replace(/\.$/, ''));
      if (!/^[-+]?\d*\.?\d*$/.test(t) || isNaN(n)) throw new Error('Type a number');
      v = Math.round(n / ((metric && TPC_SCALE_MM[kind] !== undefined ? TPC_SCALE_MM[kind] : TPC_SCALE[kind]) || 1));
    }
    if (v < 0 || v > 0xffff) throw new Error('Out of range');
    rec[off] = v & 0xff; rec[off + 1] = v >> 8;
  }

  // parameter records are 0xD0-0xEF and 0xF5-0xFF; 0xF0 is a relay point, 0xF1 a rotate position
  const isTpcMain = c => c >= 0xd0 && (c < 0xf0 || c >= 0xf5);
  const isRelay = r => r[0] === 0xf0 && r[4] === 0xff && r[5] === 1;        // F0 00 00 00 FF 01 3F 00 ...: a relay point; any other F0 record carries more fields
  // the second record of a POCKET on the mill-turn: E40 / E41 (helical approach 2)
  const TPC_EXTRA = [[84, 'E40', 'RAD. FOR HELICAL APPROACH2', 'len2'], [88, 'E41', 'DEPTH FOR HELICAL APPROACH2', 'len2']];
  function tpcExtra(rec) {
    return TPC_EXTRA.map(([off, d, name, kind]) => ({ off, d, name, kind, raw: u16(rec, off), text: tpcText(u16(rec, off), kind), applies: true, def: 0 }));
  }

const out={
 version:1,
 source:'lib/core.js (same tables as Mazatrol Editor.html), exported '+new Date().toISOString().slice(0,10),
 description:'TPC parameter record layouts and tables of the Mazatrol Editor. Each layout: record code (first byte) -> unit name and fields [byte offset, parameter, name, kind]; value = little-endian u16 at the offset, shown with the kind scale. A field flagged "S" (5th element) only exists on Smooth controls.',
 record_classes:{param:'code 0xD0-0xEF and 0xF5-0xFF',relay:'code 0xF0 with bytes 4-5 = FF 01 (byte 10: 01/02 approach/escape on mills, 03/04 on the turning centre)',rotate:'code 0xF1 (turning centre, CORNER ROUGH/FIN rotate position)',extra:'any other 0xF0 record (mill-turn POCKET: E40@84, E41@88, len2)'},
 kinds:{scale_inch:TPC_SCALE,scale_metric:TPC_SCALE_MM,digits_inch:TPC_DIGITS,digits_metric:TPC_DIGITS_MM,notes:{bits:'8-char binary, bit 0 rightmost',dec:'raw + "."',dec1:'raw/10, one decimal','int':'integer'}},
 turn_common:TURN_COMMON,
 turn_point_added_on_non_mill:TURN_POINT.map(x=>x[1]),
 layouts:Object.fromEntries(Object.entries(TPC_LAYOUTS).map(([k,v])=>['0x'+(+k).toString(16).toUpperCase(),{unit:v.unit,fields:v.fields.map(f=>({offset:f[0],param:f[1],name:f[2]||TPC_NAMES[f[1]]||'',kind:f[3],smooth_only:f[4]==='S'||undefined}))}])),
 names:TPC_NAMES,
 bit_labels:TPC_BITS,
 defaults:{bits:Object.fromEntries(Object.entries(TPC_BIT_DEFAULT).map(([k,v])=>[k,v.toString(2).padStart(8,'0')])),
   bit_ignore_mask:Object.fromEntries(Object.entries(TPC_BIT_IGNORE).map(([k,v])=>[k,v.toString(2).padStart(8,'0')])),
   E:TPC_DEFAULT_E,D_by_unit:TPC_DEFAULT_D,TC:TPC_DEFAULT_TC,mill_turn_overrides:TPC_DEFAULT_MT,metric:TPC_DEFAULT_MM,notes:'stored (raw) values; bits are binary; machine-dependent bits: D92 bits 4/5, E99 bits 4-6, D141, TC62, TC45'},
 extra_record_fields:TPC_EXTRA
};
require('fs').writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(Object.keys(out.layouts).length,'layouts');
