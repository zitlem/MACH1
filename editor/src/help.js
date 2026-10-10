// What a Mazatrol field does, for the guidance box: hole patterns (field by field, per pattern), tool lines (cycles,
// and what HOLE-D / PRE-DIA / DEPTH ... mean for each tool), units, the common unit, special units, and clearer
// wording for the prompts that are hard to read. Our own wording, following the machining-center programming
// manual (7-6 point machining, 7-12 END unit). Mill programs; other machines get the prompt only.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- prompts said more plainly
  const CLEAR = {
    'Omit SPT Machining <Y:1, N:0>': 'Q — the start point (first hole): 0 = machine it, 1 = only move there, no hole',
    'Number of holes to be drilled lastly': 'N — holes on the second side (SQUARE, GRID)',
    'Return Position <Initial-point=0, R-point=1>': 'R — between holes, go up to: 0 = the initial point (INITIAL-Z), 1 = the R point just above the surface',
    'Zero Return <Z.X+Y:0 , X+Y+Z:1>': 'ATC-MODE — going to a tool change: 0 = Z up first, then X and Y; 1 = X, Y and Z together',
    'Measure (Execute MMS) <Yes=0,No=1>': 'Measure with the probe: 0 = measure, 1 = skip this measurement',
    'ATC Movement at End of Machining <N:0, Y:1,2>': 'ATC at the end: 0 = leave the tool in the spindle; 1 = put the tool away, then move to RETURN; 2 = move to RETURN, then put the tool away (blank = 1)',
    'Continue <Y:1, N:0>': 'CONTI. — 1 = start the program again after END (continuous running); 0 = stop',
    'Parts count (Count number of Machined WorkPieces)? <Yes=1,No=0>': 'NUMBER — 1 = count this program on the parts counter (POSITION screen); 0 = do not count',
    'Dist: WPC Z0 to finish surface': 'DEPTH — Z of the finished surface (the bottom of the cut), from workpiece Z0',
    'Z axis stock removal': 'SRV-Z — how much material comes off in Z, measured up from DEPTH',
    'X/Y axis stock removal': 'SRV-R — how much material comes off sideways (radially)',
    'G-code<Menu>/Multiplier': 'ZFD — how the tool goes down in Z: G00 rapid, G01 at the feed, or a number = that many times FR',
    'Approach Point 1, Auto-><MENU>': 'APRCH-X — X where the tool comes down (? = the control picks it)',
    'Approach Point 2, Auto-><MENU>': 'APRCH-Y — Y where the tool comes down (? = the control picks it)',
    'Point Cutting Pattern <MENU>': 'PTN — hole pattern: PT one hole, LINE, SQUARE (holes round a rectangle), GRID, CIRCLE, ARC, CHORD',
    'Start point attribute <menu>': 'START — OPEN: the path starts off the part (the tool comes in from outside); CLOSE: it starts at a wall',
    'End point attribute <menu>': 'END — OPEN: the path runs off the part at the end; CLOSE: it stops at a wall',
    'Finishing FeedRate for Surface Roughness': 'RGH — finish of this side (1–9, higher = finer), or a feed for it',
    'Radial Interference Distance': 'INTER-R — room beside the edge (to a wall) the tool must stay out of',
    'Z-axis Interference Distance': 'INTER-Z — room below the edge the tool must stay out of',
    'Unit Skip (0-9) / Multi Workpiece Machining (A-D)': '$ — unit skip: the unit runs only when this skip number is on (0–9), or only for workpieces A–D',
    'Machining Priority No.': 'No. — priority: tools with a number run first, lowest first (across units); * = run after everything else',
    'Priority mark: * or OFF': 'Priority mark: * = run this tool line after everything else in the process',
    'Chip Vac. Cleaner <Yes=1,No=0>': 'CHP — 1 = run the chip vacuum with this unit',
    'Table index direction <Menu>': 'TURN — which way the table turns to the angle (AUTO = the shorter way)',
    'Prepared hole diameter': 'PRE-DIA — the hole already there before this unit (0 = solid)',
  };
  const clearPrompt = p => CLEAR[p] || p;

  // ---------------------------------------------------------------- hole patterns (shape lines of point units)
  // byte offsets of the fields (same on Matrix and Smooth mills)
  const POINT_FIELDS = { 8: 'PTN', 36: 'Z', 40: 'X', 44: 'Y', 48: 'AN1', 52: 'AN2', 56: 'T1', 60: 'T2', 9: 'F', 20: 'M', 22: 'N', 15: 'P', 16: 'Q', 17: 'R' };
  const PATTERNS = { 1: 'PT', 2: 'LINE', 3: 'SQUARE', 4: 'GRID', 5: 'CIRCLE', 6: 'ARC', 7: 'CHORD' };
  const ZR = { Z: 'Z of the surface the holes start from (from workpiece Z0)', R: '0 = up to the initial point between holes, 1 = only up to the R point' };
  const Q = 'start point: 0 = machine it, 1 = only move there (no hole)';
  const ROWS = {
    1: ['One hole at X Y.', { Z: ZR.Z, X: 'X of the hole', Y: 'Y of the hole', P: 'how the tool gets there: 0 = X and Y together, 1 = Y then X, 2 = X then Y', Q, R: ZR.R }],
    2: ['Holes in a straight line from X Y.', { Z: ZR.Z, X: 'X of the first hole', Y: 'Y of the first hole', AN1: 'angle of the line from +X (CCW +)', T1: 'pitch between holes (F = 1: first to last hole)', F: '0 = T1 is the pitch, 1 = T1 is the total length', M: 'number of holes', Q, R: ZR.R }],
    3: ['Holes round the edge of a parallelogram (no holes inside).', { Z: ZR.Z, X: 'X of the start corner', Y: 'Y of the start corner', AN1: 'angle of the first side from +X', AN2: 'angle from the first side to the second (90 = square corner; 270 = the other way)', T1: 'pitch on the first side (F = 1: its length)', T2: 'pitch on the second side (F = 1: its length)', F: '0 = T1 T2 are pitches, 1 = lengths', M: 'holes on the first side', N: 'holes on the second side', P: '0 = holes at the four corners too, 1 = no corner holes', Q, R: ZR.R }],
    4: ['Every hole of a grid.', { Z: ZR.Z, X: 'X of the start corner', Y: 'Y of the start corner', AN1: 'angle of the first row from +X', AN2: 'angle from the first row to the columns (90 = square)', T1: 'pitch along the rows (F = 1: row length)', T2: 'pitch along the columns (F = 1: column length)', F: '0 = T1 T2 are pitches, 1 = lengths', M: 'holes in each row', N: 'number of rows', P: '0 = holes at the four corners too, 1 = no corner holes', Q, R: ZR.R }],
    5: ['Holes evenly spaced round a full circle.', { Z: ZR.Z, X: 'X of the circle centre', Y: 'Y of the circle centre', AN1: 'angle of the first hole from +X', T1: 'radius of the circle', M: 'number of holes', R: ZR.R }],
    6: ['Holes on an arc.', { Z: ZR.Z, X: 'X of the arc centre', Y: 'Y of the arc centre', AN1: 'angle of the first hole from +X', AN2: 'angle between holes (F = 1: first to last hole), CCW +', T1: 'radius of the arc', F: '0 = AN2 is the pitch angle, 1 = the total angle', M: 'number of holes', Q, R: ZR.R }],
    7: ['Holes at the ends of a chord of a circle.', { Z: ZR.Z, X: 'X of the circle centre', Y: 'Y of the circle centre', AN1: 'angle of the line through the middle of the chord, from +X', T1: 'radius of the circle', T2: 'chord length (P = 1 or 2: half of it, one side)', P: '0 = both ends, 1 = right end only, 2 = left end only', R: ZR.R }],
  };

  // ---------------------------------------------------------------- tool lines
  const CYCLES = {
    'DRL T': 'Drilling cycle: feeds to the bottom in one go, rapids out.',
    PCK1: 'High-speed peck: feeds DEPTH at a time and backs off a little to break the chip (stays in the hole).',
    PCK2: 'Deep-hole peck: feeds DEPTH at a time and rapids out to R between pecks to clear the chips.',
    PCK3: 'Very deep hole (cycle 3): pecks, with the depth, speed and feed changed as the hole gets deeper (parameters D55–D57).',
    PCK4: 'Very deep hole (cycle 4): as PCK3 with its own parameter set.', PCK5: 'Very deep hole (cycle 5): as PCK3 with its own parameter set.',
    AUTO: 'Auto-peck: watches the drill load and pecks only when it needs to (option).',
    CYCLE1: 'Boring cycle 1: bores to depth, spindle orients, the bar shifts off the wall and rapids out.',
    CYCLE2: 'Boring cycle 2: bores to depth and rapids out (G00) — may leave a line on the wall.',
    CYCLE3: 'Boring cycle 3: bores to depth and feeds out (G01).',
    CYCLE4: 'Boring cycle 4: bores in steps of PK-DEP, orients and shifts off the wall to come out.',
    CYCLE5: 'Boring cycle 5: bores in steps of PK-DEP, rapids out.', CYCLE6: 'Boring cycle 6: bores in steps of PK-DEP, feeds out.',
    TAP: 'Tapping cycle: in at feed = pitch × rpm, spindle reverses, out.',
    PECK: 'Peck tapping: taps DEPTH at a time and backs out between pecks.',
    PLANET: 'Planetary tapping: a thread mill orbits the hole once on a helix (HOLE-DEP = the cutter\'s edge length).',
    'CTR-D': 'Centre-drilling cycle: spots the hole.', CHAMF: 'Chamfer cycle: the spot drill also chamfers the hole edge.',
    FIX: 'Dwell at the bottom of the tap: fixed (from the parameter).',
    'CW CUT': 'Cuts clockwise round the hole.', 'CCW CUT': 'Cuts counter-clockwise round the hole.',
    G00: 'The reamer comes out at rapid.', G01: 'The reamer comes out at a feed (parameter D18).',
  };
  const cycleOf = v => { const t = String(v || '').trim().toUpperCase().replace(/\s+/g, ' '); return CYCLES[t] || CYCLES[t.replace(/\s/g, '')] || ''; };
  // field meanings on a tool line; per tool where they differ
  const TOOL_FIELDS = {
    '*': {
      TOOL: 'tool type', 'NOM-D': 'nominal diameter (finds the tool in the tool data / tool file)', 'NOM-0': 'nominal diameter',
      No: 'priority No.: numbered tools run first, lowest first; * = after everything else', 'No.': 'priority No.: numbered tools run first, lowest first; * = after everything else',
      'HOLE-D': 'diameter this tool makes', 'HOLE-DEP': 'depth this tool goes to', 'PRE-DIA': 'hole already there before this tool', 'PRE-DEP': 'depth of the hole already there',
      RGH: 'finish (1–9) or cycle', DEPTH: 'cut per pass', 'C-SP': 'cutting speed (sets the rpm from the diameter)', FR: 'feed per tooth / per rev', M: 'M-code with this tool',
      'APRCH-X': 'X where the tool comes down (? = automatic)', 'APRCH-Y': 'Y where the tool comes down (? = automatic)', TYPE: 'cutting direction / pattern',
      ZFD: 'Z down-feed: G00, G01 or × FR', 'DEP-Z': 'depth of each Z step', 'WID-R': 'width of each radial step', SNo: 'R = roughing tool, F = finishing tool',
    },
    DRILL: { 'PRE-DIA': 'distance from the bottom where the feed changes (0 = no change)', 'PRE-DEP': 'feed for that last part, % of FR', RGH: 'drilling cycle', DEPTH: 'peck depth (0 = no pecking)' },
    'CTR-DR': { 'HOLE-D': 'twice the distance from the hole centre to anything in the way (99.9 = nothing)', RGH: 'tip angle', DEPTH: 'cycle: centre-drill or chamfer' },
    CHAMFER: { 'HOLE-D': 'twice the distance from the hole centre to anything in the way (99.9 = nothing)', 'PRE-DEP': 'how deep the cutter may go without hitting (interference depth)', DEPTH: 'chamfer size' },
    'CHMF-M': { 'HOLE-D': 'twice the distance from the hole centre to anything in the way (99.9 = nothing)', 'PRE-DEP': 'interference depth', DEPTH: 'chamfer size' },
    TAP: { 'PRE-DIA': 'tapping cycle: TAP, PECK or PLANET', RGH: 'dwell at the bottom', DEPTH: 'thread pitch (PECK: peck depth)' },
    'BOR BAR': { 'PRE-DIA': 'boring cycle', 'PRE-DEP': 'depth of a faced hole (0 for through / blind)', DEPTH: 'radial cut per pass' },
    REAMER: { DEPTH: 'how it comes out: G00 rapid, G01 / a feed' },
    'END MILL': { 'PRE-DEP': 'cut direction (CW / CCW) round the hole', RGH: 'finish of the bottom (circle milling)' },
  };

  // ---------------------------------------------------------------- units
  const U = (text, fields) => [text, fields || {}];
  const LINE_F = { DEPTH: 'Z of the bottom, from workpiece Z0', 'SRV-Z': 'material in Z above DEPTH', 'SRV-R': 'material sideways', RGH: 'finish (1–9; finer makes a finishing pass)', 'FIN-Z': 'stock left on the bottom for finishing', 'FIN-R': 'stock left on the wall for finishing', START: 'OPEN: comes in from off the part; CLOSE: starts at a wall', END: 'OPEN: runs off the part; CLOSE: stops at a wall', 'INTER-R': 'room to the next wall', CHMF: 'chamfer on the edge' };
  const POCK_F = { DEPTH: 'Z of the bottom, from workpiece Z0', 'SRV-Z': 'material in Z above DEPTH', BTM: 'bottom finish (1–9)', WAL: 'wall finish (1–9)', 'FIN-Z': 'stock left on the bottom for finishing', 'FIN-R': 'stock left on the wall for finishing', 'INTER-R': 'room to the next wall', CHMF: 'chamfer on the edge', 'S-WIDTH': 'slot width' };
  const CHMF_F = { DEPTH: 'Z of the edge, from workpiece Z0', 'INTER-Z': 'room below the edge', 'INTER-R': 'room beside the edge', CHMF: 'chamfer size', START: 'OPEN / CLOSE start', END: 'OPEN / CLOSE end' };
  const HOLE_F = { DIA: 'hole diameter', DEPTH: 'hole depth', CHMF: 'chamfer on the hole edge (0 = none)', CHAMFER: 'chamfer on the hole edge (0 = none)', BTM: 'bottom finish', WAL: 'wall finish', 'PRE-DIA': 'hole already there (0 = solid)', CHP: 'chip vacuum' };
  const UNITS = {
    WPC: U('Workpiece zero: X Y Z of the part zero from machine zero, Th turns the program, 4th axis angle. ADD.WPC uses a stored offset (G54…) instead.', { 'ADD.WPC': 'stored work offset to use (blank = the values here)', X: 'X of part zero', Y: 'Y of part zero', Z: 'Z of part zero', Th: 'rotation of the part', C: '4th axis' }),
    OFFSET: U('Shifts the program zero by U V W and turns it by D, for the units after it.', { 'U(X)': 'shift in X', 'V(Y)': 'shift in Y', 'W(Z)': 'shift in Z', 'D(th)': 'rotation' }),
    WPCSHIFT: U('Shifts the workpiece zero for the units after it.'),
    END: U('End of the program.', { 'CONTI.': '1 = start again (continuous), 0 = stop', NUMBER: '1 = count parts', ATC: '0 = tool stays; 1 = tool away, then RETURN; 2 = RETURN, then tool away', RETURN: 'where the axes go: HOME, FIXED PT (parameter M5), ARB PT (given below)', 'Work-No.': 'program to run next', EXECTE: 'run that program next', REPEAT: 'run the program this many times', SHIFT: 'Z shift each repeat' }),
    'SUB PRO': U('Runs another program here (its units run as if they were in this one; priority numbers carry across).', { WORK: 'program to run', REPEAT: 'times to run it', 'No.': 'priority / PROC END: ends a process here', $: 'unit skip' }),
    'MANL PRG': U('G-code lines for this tool (put the cursor on a line to see what it does).', { TOOL: 'tool', 'NOM-DIA': 'nominal diameter', 'No.': 'priority No.' }),
    'M-CODE': U('M-codes run in order (M1 first) before the next unit.'),
    MMS: U('Measures with the probe and sets the zero / offset from it.', { 'U.SKIP': '0 = measure, 1 = skip' }),
    INDEX: U('Turns the table to ANGLE (the time counts as a fixed index time).', { 'POS X': 'X to go to before turning', 'POS Y': 'Y before turning', 'POS Z': 'Z before turning', ANGLE: 'table angle', TURN: 'direction (AUTO = shorter way)' }),
    'PALT CHG': U('Pallet change. Priority numbers do not reach past it.', { 'No.': 'pallet to load' }),
    'PROC END': U('End of a process: priority numbers do not reach past it.'),
    COMMENT: U('A comment line; the control does nothing with it.'),
    DRILLING: U('Drilled holes. Tools: spot drill, drill(s), chamfer cutter.', HOLE_F),
    'RGH CBOR': U('Counterbored holes, rough.', Object.assign({ 'CB-DIA': 'counterbore diameter', 'CB-DEP': 'counterbore depth' }, HOLE_F)),
    REAMING: U('Reamed holes.', Object.assign({ 'PRE-REAM': 'how the hole is made before reaming: DRILL, BORING, END MILL' }, HOLE_F)),
    TAPPING: U('Tapped holes.', { NOM: 'thread size', 'MAJOR-0': 'major diameter', MAJOR: 'major diameter', PITCH: 'thread pitch', 'TAP-DEPTH': 'thread depth', 'TAP-DEP': 'thread depth', CHMF: 'chamfer on the hole edge', CHP: 'chip vacuum' }),
    'CBOR-TAP': U('Counterbore then tap.', { NOM: 'thread size', MAJOR: 'major diameter', PITCH: 'pitch', 'TAP-DEP': 'thread depth', CHMF: 'chamfer', 'CB-DIA': 'counterbore diameter', 'CB-DEP': 'counterbore depth', BTM: 'bottom finish', CHP: 'chip vacuum' }),
    'BORE T1': U('Through hole, bored.', HOLE_F), 'BORE S1': U('Blind hole, bored.', HOLE_F), 'BORE T2': U('Stepped through hole, bored.', HOLE_F), 'BORE S2': U('Stepped blind hole, bored.', HOLE_F),
    'CIRC MIL': U('A hole milled with an end mill round its circle (or a tornado / high-accuracy path).', Object.assign({ 'TORNA.': '0 milling, 1 tornado, 2 high accuracy', PITCH1: 'helix pitch for the chamfer', PITCH2: 'helix pitch for the hole' }, HOLE_F)),
    'LINE CTR': U('Mills along the shape with the tool centre on the line.', LINE_F), 'LINE RGT': U('Mills along the shape with the tool to the right of it.', LINE_F),
    'LINE LFT': U('Mills along the shape with the tool to the left of it.', LINE_F), 'LINE OUT': U('Mills round the outside of a closed shape.', LINE_F),
    'LINE IN': U('Mills round the inside of a closed shape.', LINE_F),
    'CHMF RGT': U('Chamfers along the shape, tool to the right.', CHMF_F), 'CHMF LFT': U('Chamfers along the shape, tool to the left.', CHMF_F),
    'CHMF OUT': U('Chamfers round the outside of a closed shape.', CHMF_F), 'CHMF IN': U('Chamfers round the inside of a closed shape.', CHMF_F),
    'FCE MILL': U('Faces the area of the shape.', POCK_F), 'TOP EMIL': U('Faces with an end mill.', POCK_F),
    POCKET: U('Clears a pocket inside the shape.', POCK_F), 'PCKT MT': U('Clears round islands (the first shape is the outside).', POCK_F),
    'PCKT VLY': U('Clears a pocket with an island in it.', POCK_F), SLOT: U('Cuts a slot along the shape.', POCK_F), STEP: U('Mills a step along the shape.', POCK_F),
  };
  const COMMON = {
    MAT: 'workpiece material (sets the automatic speeds and feeds)', 'INITIAL-Z': 'Z the tool rapids at between holes and units (clear of the part and clamps), from workpiece Z0',
    'ATC-MODE': 'tool change: 0 = Z up first, then X Y; 1 = X Y Z together', 'MULTI-MODE': 'multi-workpiece machining: OFF, 5 × 2, 10 × 1 or an offset table',
    MULTI: 'which workpieces run (1 = yes)', 'PITCH-X': 'distance between workpieces in X', 'PITCH-Y': 'distance between workpieces in Y',
  };

  // ---------------------------------------------------------------- lathes and mill-turn (turning manual 7-6, 7-12)
  const PART = 'what is cut: OUT outside, IN inside, FACE front face, BACK back face (the middle-start forms start partway along)';
  const TURN_COMMON = {
    'MAT.': 'workpiece material (sets the automatic speeds and feeds)', 'OD-MAX': 'largest outside diameter of the stock', 'ID-MIN': 'bore of the stock (0 = solid)',
    LENGTH: 'length of the stock', 'WORK-FACE': 'stock left on the front face', 'WORK FACE': 'stock left on the front face', 'ATC-MODE': 'tool change position / mode',
    RPM: 'top spindle speed for the whole program (constant surface speed is held under it)', LTUR: 'lower turret', DIA: 'lower turret: diameter it stays clear of',
  };
  const TURN_UNITS = {
    MATERIAL: U('The stock shape (OUT outside / IN inside), for the roughing passes and the plot.', { PTN: 'LIN straight, TPR taper, arcs', 'SPT-X': 'start X (diameter)', 'SPT-Z': 'start Z', 'FPT-X': 'end X (diameter)', 'FPT-Z': 'end Z', RADIUS: 'arc radius' }),
    BAR: U('Roughs (and finishes) a turned shape from bar stock, parallel to Z (OUT / IN) or to X (FACE / BACK).', { PART, 'CPT-X': 'infeed point X: where the tool starts cutting (diameter)', 'CPT-Z': 'infeed point Z', 'FIN-X': 'finish stock left in X (on the diameter)', 'FIN-Z': 'finish stock left in Z' }),
    CPY: U('Copy turning: the passes follow the shape (for castings and forgings that are already near shape).', { PART, 'CPT-X': 'infeed point X (diameter)', 'CPT-Z': 'infeed point Z', 'SRV-X': 'material to remove in X', 'SRV-Z': 'material to remove in Z', 'FIN-X': 'finish stock X', 'FIN-Z': 'finish stock Z' }),
    CORNER: U('Cuts what is left in a corner by the units before.', { PART, 'FIN-X': 'finish stock X', 'FIN-Z': 'finish stock Z' }),
    FACING: U('Faces the end of the part.', { PART, 'FIN-Z': 'finish stock left on the face' }),
    THREAD: U('Single-point threading.', { PART: 'OUT outside (male), IN inside (female), FACE / BACK', CHAMF: 'thread run-out chamfer: 0 none, 1 = 45°, 2 = 60°', LEAD: 'lead = pitch × starts', ANG: 'infeed angle (a few degrees under the tool angle; 0 = straight in)', MULTI: 'number of starts', HGT: 'thread height (depth)' }),
    'T.GROOVE': U('Grooves (one, or several at a pitch).', { PART, PAT: 'groove form #0–#5 (#0 straight or angled; #1–#3 rough then finish)', 'No.': 'number of grooves', PITCH: 'spacing (minus = the other way)', WIDTH: 'groove width', FINISH: 'finish stock (#1–#3)' }),
    'T.DRILL': U('Drills on the spindle centre with the part turning.', { PART: 'FACE front, BACK back', DIA: 'hole diameter', 'POS-B': 'B-axis angle' }),
    'T.TAP': U('Taps on the spindle centre.', { PART: 'FACE front, BACK back', 'NOM-DIA': 'thread size', PITCH: 'pitch' }),
    'EDG CUT': U('Cut-off / edge cutting.'),
    HEAD: U('Which headstock the next units work on.', { 'PAT.': 'SINGLE, or both spindles', HEAD: 'headstock 1 or 2', SPDL: 'the other spindle: stop (1) or turn in sync (0)' }),
    TRANSFER: U('Hands the part from one spindle to the other.', { PAT: 'transfer pattern', HEAD: 'from → to', SPDL: 'spindle mode during the transfer', PUSH: 'push the part (0 yes, 1 no)', CHUCK: 'chuck left open or closed', W1: 'W-axis position 1', W2: 'W-axis position 2', 'Z-OFFSET': 'Z offset of the second spindle', MOVEMENT: 'distance moved', C1: 'C position spindle 1', C2: 'C position spindle 2' }),
    'TOOL MES': U('Measures a tool with the tool eye.', { COMPENSATE: 'update the tool data', 'OFS-TOOL': 'tool measured', INTERVAL: 'measure every n parts', OUTPUT: 'output' }),
    'WORK MES': U('Measures the part with the probe and corrects a tool.', { COMPENSATE: 'correct the tool', 'OFS-TOOL': 'tool to correct', 'COMP.DATA': 'what is corrected', 'SNS-TOOL': 'probe', INTERVAL: 'measure every n parts', OUTPUT: 'output' }),
    'M-CODE': UNITS['M-CODE'], END: UNITS.END, 'SUB PRO': UNITS['SUB PRO'], 'MANL PRG': UNITS['MANL PRG'], COMMENT: UNITS.COMMENT, 'PROC END': UNITS['PROC END'],
  };
  // milling units on a lathe / mill-turn: the mill fields plus where the cut is
  const MODE = { MODE: 'where: XC face (C-axis, polar), ZC outside diameter (Z-C, cylinder), XY face with Y, ZY side with Y; [ ] = C-axis interpolated', 'POS-B': 'B-axis angle', 'POS-C': 'C-axis position', 'SHIFT-R': 'radial shift to the plane' };
  const TURN_TOOL = {
    SNo: 'R roughing, F finishing', TOOL: 'tool and the side it cuts: OUT, IN, EDGE (face), (BAK) back', 'NOM.': 'nominal size (nose radius or another value, as in the tool data)',
    'No.': 'priority No.', '#': 'simultaneous machining No. / lower turret', 'PAT.': 'machining pattern', 'DEP-1': 'deepest cut per roughing pass (radius)',
    'DEP-2/NUM': 'length cut per pass before the chip-break stop (#3, #4)', 'DEP-3': '—', 'FIN-X': 'stock left for the next finishing tool (X)', 'FIN-Z': 'stock left for the next finishing tool (Z)',
    'C-SP': 'surface speed', FR: 'feed per revolution', M: 'M-code when this tool is indexed',
  };
  const TURN_PAT = {
    BAR: { '0': 'straight-in passes', '1': 'angled passes (fast roughing)', '2': 'cuts in from the open end (deep bores: chips clear)', '3': 'straight-in passes with chip-break stops (TC71 revs)', '4': 'angled passes with chip-break stops' },
    THREAD: { '0': 'standard (equal area per pass)', '1': 'constant depth per pass' },
    'T.GROOVE': { '0': 'standard', '1': 'both directions' },
    'T.DRILL': { '0': 'drill in one go, feed back out (blind)', '1': 'deep hole: rapid out after each peck', '2': 'high speed: back off TC47 after each peck', '3': 'reaming', '4': 'pecks that get shorter' },
  };
  TURN_PAT.CPY = TURN_PAT.BAR; TURN_PAT.CORNER = TURN_PAT.BAR; TURN_PAT.FACING = TURN_PAT.BAR; TURN_PAT['T.TAP'] = TURN_PAT['T.DRILL'];
  const TURN_TOOL_UNIT = {
    THREAD: { 'DEP-1': 'first cut depth (radius)', 'DEP-2/NUM': 'number of passes (at least 3)', 'C-SP': 'surface speed', 'PAT.': 'infeed: #0 standard, #1 constant depth; 1–5 threading order' },
    'T.DRILL': { 'NOM.': 'drill diameter', 'DEP-1': 'peck depth (#4: first peck)', 'DEP-2/NUM': '#4: how much each peck gets shorter', 'DEP-3': '#4: shortest peck' },
    'T.GROOVE': { 'DEP-1': 'deepest cut per pass', 'FIN-X': 'finish stock for the next tool' },
  };
  const TSHAPE = {
    PTN: 'LIN straight (start found from the line before), TPR taper, arcs (radius in R/th)', 'S-CNR': 'start corner: C chamfer or R radius, with its size',
    'SPT-X': 'start X (diameter)', 'SPT-Z': 'start Z', 'FPT-X': 'end X (diameter)', 'FPT-Z': 'end Z', 'F-CNR/$': 'end corner: C / R, or $1–$6 undercut (sizes in TC27–TC34)',
    'F-CNR': 'end corner: C / R', 'R/th': 'arc radius, or taper angle when one point is ?', RGH: 'finish of this element (code ▽) or a feed per rev', ANGLE: 'groove wall angle',
    'SPT-x': 'thread start X (diameter)', 'SPT-z': 'thread start Z', 'FPT-x': 'thread end X', 'FPT-z': 'thread end Z', RADIUS: 'arc radius',
  };

  // ---------------------------------------------------------------- tool data (TOOL DATA screen, machine memory or TOOLDATA file)
  // headings pair two meanings (turning / milling or two rows); turn: a turning tool line
  const TOOLDATA = {
    'PKNo': 'pocket (turret station) No. and its suffix letter', 'TNo.': 'tool No. and its suffix letter',
    'X/TOOL': 'tool set X: the tool tip from the machine reference in X', 'X/-TOOL': 'tool set X: the tool tip from the machine reference in X',
    'Z/SET': 'tool set Z (tool length)', 'Z/SET-': 'tool set Z (tool length)',
    'X/WEAR': 'wear compensation X', 'X/-WEAR': 'wear compensation X', 'Z/COMP.': 'wear compensation Z', 'Z/COMP.-': 'wear compensation Z',
    'X/MAX': 'most wear allowed in X (tool life by wear)', 'Z/WEAR': 'most wear allowed in Z', 'X/CONS.': 'compensation consolidated X', 'Z/COMP': 'compensation Z',
    'TIME/LIFE': 'tool life: time allowed', 'NUM.TIME/USED': 'time used', 'NUM./USED': 'count used (parts or uses)', 'NUM.': 'tool life: count allowed', 'TIME/USED': 'time used',
    'IDNo./Comments': 'ID No. / comment', 'X/TL': 'tool life flag',
    'Tool': 'tool type and the side it cuts (turning: OUT, IN, EDGE; * the other side)', 'Nom-Dia/Nom.': 'nominal size, as programs name the tool',
    'FW/RV': 'suffix / spindle direction', 'R/L/FW/RV': 'hand (right / left) or spindle direction (the arrow: the way it cuts)',
    'Nose-R/Act-Dia': ['nose radius (turning)', 'actual cutting diameter (milling; the rpm is worked out from it)'],
    'Length/Grv-Dep': ['groove depth the tool can cut', 'tool length'], 'Cut-Angle/Grv-Dep/Depth': ['cutting edge angle', 'depth'],
    'Edg-Ang/Tip-Wid': ['tip angle, or the tip width of a groove tool', 'edge angle'], 'Hldr': 'holder type', 'Width': 'tool width',
    "Mat'l": 'tool material (picks the cutting conditions)', 'Tap/Len-Comp': 'tap: length compensation', 'Fix/Float/Len-Comp': 'tap holder: fixed or floating',
  };
  function explainToolData(info) {
    const items = info.fields.filter(f => f.label).map(f => {
      const key = f.label.replace(/\s+/g, ''), d = TOOLDATA[key];
      return { L: f.label, value: f.value, desc: Array.isArray(d) ? d[info.turnTool ? 0 : 1] : d || '', at: f.at };
    }).filter(it => it.desc);
    const cur = items.find(it => it.at);
    return { title: (info.tool || 'Tool data') + ' — tool data line', items, detail: cur ? cur.L + ': ' + cur.desc : '' };
  }

  // ---------------------------------------------------------------- what to check for common program alarms (our notes)
  const ALARM_TIPS = {
    227: 'Two M-codes on one line that cannot work together (spindle forward / reverse / stop, on / off pairs). Move one to its own block or an M-CODE unit.',
    405: 'A SUB PRO unit or M98 calls a program that is not in memory. Check WORK No. and load the program.',
    416: 'Automatic tool development could not choose tools: the hole is bigger than the drills allowed (D8–D10), or DEPTH is less than the chamfer. Check DIA, DEPTH and CHMF.',
    420: 'That value is already used: a priority No. given twice in a process, or a name that exists.',
    421: 'The program, tool or data asked for is not there. Check the number or name.',
    423: 'More tools than the program or magazine allows. Combine tool lines or split the program.',
    430: 'The tool line names a tool the unit cannot use (e.g. a turning tool in a milling unit). Pick a tool from the menu.',
    434: 'The tool (type, nominal size, suffix) is not in the TOOL FILE. Add it to the tool file or change NOM-D.',
    452: 'A machining unit with tool lines but no shape or hole lines. Add the shape (FIG) lines.',
    453: 'Shape copy found nothing to copy. Check the unit it copies from.',
    461: 'One priority No. on two different tools in the same process. Give each tool its own No.',
    462: 'Priority numbers make a unit\'s tool lines run out of order (e.g. the tap before its drill). Renumber them.',
    605: 'A machining unit has no tool lines. Add them or use TOOL DEVELOP.',
    610: 'A hole unit\'s tool line is missing data (NOM-D, HOLE-D, HOLE-DEP …). Fill the blank fields.',
    611: 'A line milling unit\'s tool line is missing data. Fill the blank fields.',
    612: 'A face milling unit\'s tool line is missing data. Fill the blank fields.',
    617: 'The control cannot work out this unit\'s path with the data given. Check the unit and its shape.',
    618: 'A hole machining parameter (D) is out of range. Check the TPC / D parameters.',
    619: 'A line / face parameter (E) is out of range. Check the TPC / E parameters.',
    620: 'C-SP is 0 or blank: the spindle would not turn. Set the surface speed.',
    621: 'FR is 0 or blank on a tool that cuts. Set the feed.',
    625: 'The end mill is too big for the shape or hole (e.g. bigger than the hole in CIRC MIL). Use a smaller tool.',
    626: 'The tool asked for is not in the tool data. Load or register it.',
    628: 'The tool is not in the TOOL FILE. Add it.',
    630: 'The Z cut per pass is more than the tool allows (its tool file depth of cut). Lower DEP-Z.',
    632: 'Radial cut (WID-R) is 0. Set it, or leave it for the control to work out.',
    633: 'Z cut (DEP-Z) is 0. Set it.',
    634: 'Finishing stock is 0 where a finishing pass needs it. Set FIN-Z / FIN-R.',
    635: 'Tool diameter (NOM-D) is 0. Set it.',
    638: 'The radial cut is more than the tool allows. Lower WID-R.',
    644: 'NOM-D is not a size in the tool file for that tool type.',
    647: 'No END unit: the program never ends. Add an END unit last.',
    650: 'The chamfer cutter would cut air (the chamfer is too small for the cutter or the hole). Check CHMF, the cutter size and D17.',
    658: 'INITIAL-Z in the common unit is below the top of the part. Raise it.',
    684: 'A hole pattern line is missing data or has impossible values (count, pitch, angles). Check the pattern\'s fields.',
    693: 'Too many shape lines in one unit. Split the unit.',
    698: 'Two shape points in a row are the same. Delete one.',
    701: 'The shape is too small for the tool. Use a smaller tool or check the shape.',
    704: 'The tool would hit the part or the shape (wall too close for the tool). Check the tool size, INTER-R / INTER-Z and the shape.',
    707: 'The chamfer cutter would hit a wall. Check INTER-R / INTER-Z, HOLE-D (99.9 if nothing is in the way).',
    709: 'Depth or radial cut does not fit (check DEP-R / WID-R against the tool).',
    716: 'The cutting start point is illegal: the infeed point (CPT-X / CPT-Z) or the approach point is inside the shape. Move it outside.',
    717: 'The shape is bigger than the stock in the common unit (OD-MAX, ID-MIN, LENGTH). Fix the shape or the stock size.',
    718: 'The cutting direction is not defined (e.g. an open shape with no direction, or START / END not set).',
    719: 'The shape runs the wrong way for the cut (e.g. an inside BAR #2 on a bore that gets bigger deeper in). Change the pattern or the shape order.',
    720: 'The shape crosses itself or doubles back. Check the shape lines.',
    725: 'The common unit\'s radial data (OD-MAX / ID-MIN) does not fit the units. Check them.',
    729: 'CORNER: the shape given is not a corner the unit can cut.',
    730: 'EDGE / FACING: the shape given is not one the unit can cut.',
    733: 'T.GROOVE: the groove shape does not fit the pattern or the tool. Check WIDTH, the tool width and the shape.',
    741: 'Thread ANG is out of range (it should be a few degrees under the tool angle, 0 for straight in).',
    742: 'Thread HGT is 0 or too big. Set the thread height (AUTO SET works it out).',
    746: 'A turning roughing tool has no DEP-1. Set the cut per pass (or pick the tool material to set it).',
    753: 'The tool is too small for the job (e.g. groove tool narrower than the unit expects).',
    754: 'The tool is too big for the job (e.g. groove tool wider than the groove).',
    755: 'The radial pitch (step) is too small. Increase it.',
    756: 'The Z pitch (step) is too small. Increase it.',
    808: 'A G-code this control does not have, or an option it does not have. Check the code against the machine\'s list.',
    661: 'An M-code this machine does not have. Check the machine\'s M-code list.',
    816: 'A feed move with no feed (F not given yet). Give an F before the first G01 / G02 / G03.',
  };

  // ---------------------------------------------------------------- the box for a line
  // info: {kind: 'point' | 'tool' | 'unit' | 'common' | 'shape', unit (name), tool (name), fields: [{label, value, off, at, off}], ptn, rec}
  function explain(info) {
    const fieldItems = (map, fallback) => info.fields.filter(f => f.label).map(f => ({ L: f.label, value: f.value, desc: map[f.label] || (fallback && fallback[f.label]) || '', at: f.at }));
    if (info.kind === 'point') {
      const row = ROWS[info.ptn];
      if (!row) return null;
      const ptnText = 'the pattern: PT, LINE, SQUARE, GRID, CIRCLE, ARC, CHORD (each uses its own fields)';
      row[1].PTN = ptnText;
      const items = info.fields.filter(f => POINT_FIELDS[f.off] && row[1][POINT_FIELDS[f.off]] && f.off !== 8).map(f => ({ L: POINT_FIELDS[f.off], value: f.value, desc: row[1][POINT_FIELDS[f.off]], at: f.at }));
      const cur = info.fields.find(f => f.at), cl = cur && POINT_FIELDS[cur.off];
      return { title: (PATTERNS[info.ptn] || 'Hole pattern') + ' — ' + row[0], items, detail: cl && row[1][cl] ? cl + ': ' + row[1][cl] : cl ? cl + ' is not used by this pattern.' : '' };
    }
    if (info.turn) return explainTurn(info, fieldItems);
    if (info.kind === 'tool') {
      const t = (info.tool || '').toUpperCase(), map = Object.assign({}, TOOL_FIELDS['*'], TOOL_FIELDS[t] || {});
      const items = fieldItems(map).map(it => (cycleOf(it.value) ? Object.assign(it, { desc: cycleOf(it.value) }) : it));
      const cur = items.find(it => it.at);
      return { title: (info.tool || 'Tool') + ' — tool line of ' + (info.unit || 'the unit'), items, detail: cur ? cur.L + ': ' + (cur.desc || '') : '' };
    }
    if (info.kind === 'common') {
      const items = fieldItems(COMMON), cur = items.find(it => it.at);
      return { title: 'Common unit — settings for the whole program', items, detail: cur && cur.desc ? cur.L + ': ' + cur.desc : '' };
    }
    if (info.kind === 'unit') {
      const u = UNITS[info.unit] || UNITS[String(info.unit || '').replace(/-$/, '')];
      if (!u) return null;
      const items = fieldItems(u[1]), cur = items.find(it => it.at);
      return { title: info.unit + ' — ' + u[0], items: items.filter(it => it.desc), detail: cur && cur.desc ? cur.L + ': ' + cur.desc : '' };
    }
    return null;
  }

  // a lathe / mill-turn line: turning units by their own tables, milling units by the mill's plus MODE
  function explainTurn(info, fieldItems) {
    const un = info.unit || '', cur = items => items.find(it => it.at), det = c => (c && c.desc ? c.L + ': ' + c.desc : '');
    const turning = !!TURN_UNITS[un];
    if (info.kind === 'common') { const items = fieldItems(TURN_COMMON); return { title: 'Common unit — the stock and settings for the whole program', items, detail: det(cur(items)) }; }
    if (info.kind === 'unit') {
      const u = TURN_UNITS[un] || UNITS[un];
      if (!u) return null;
      const items = fieldItems(Object.assign({}, turning ? {} : MODE, u[1])).filter(it => it.desc);
      return { title: un + ' — ' + u[0], items, detail: det(cur(items)) };
    }
    if (info.kind === 'tool') {
      if (!turning) return explain(Object.assign({}, info, { turn: false }));
      const map = Object.assign({}, TURN_TOOL, TURN_TOOL_UNIT[un] || {});
      const items = fieldItems(map).map(it => {
        if (it.L === 'PAT.' && TURN_PAT[un]) { const m = /#?\s*(\d)/.exec(it.value || ''); if (m && TURN_PAT[un][m[1]]) it.desc = '#' + m[1] + ': ' + TURN_PAT[un][m[1]]; }
        return it;
      }).filter(it => it.desc && it.desc !== '—');
      return { title: (info.tool || 'Tool') + ' — tool line of ' + un, items, detail: det(cur(items)) };
    }
    if (info.kind === 'tshape') {
      const items = fieldItems(TSHAPE).filter(it => it.desc);
      return { title: 'Shape of ' + un + ' — X in diameter, Z along the spindle', items, detail: det(cur(items)) };
    }
    return null;
  }

  // a small drawing of a hole-pattern line: every position, numbered in order, the skipped ones hollow
  function patternSvg(pts, opts) {
    if (!pts || !pts.length) return '';
    opts = opts || {};
    const W = 170, H = 112, pad = 14;
    let x0 = Math.min(0, ...pts.map(p => p[0])), x1 = Math.max(0, ...pts.map(p => p[0])), y0 = Math.min(0, ...pts.map(p => p[1])), y1 = Math.max(0, ...pts.map(p => p[1]));
    if (opts.centre) { x0 = Math.min(x0, opts.centre[0]); x1 = Math.max(x1, opts.centre[0]); y0 = Math.min(y0, opts.centre[1]); y1 = Math.max(y1, opts.centre[1]); }
    const span = Math.max(x1 - x0, y1 - y0, 1e-6), k = Math.min((W - 2 * pad) / Math.max(x1 - x0, span * 0.2), (H - 2 * pad) / Math.max(y1 - y0, span * 0.2));
    const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    const X = x => (ox + (x - x0) * k).toFixed(1), Y = y => (H - oy - (y - y0) * k).toFixed(1);
    let s = `<svg class="gd-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${+X(0) + 16}" y2="${Y(0)}" class="ax"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${+Y(0) - 16}" class="ax"/><text x="${+X(0) + 18}" y="${+Y(0) + 4}" class="axl">X</text><text x="${+X(0) - 3}" y="${+Y(0) - 19}" class="axl">Y</text>`;
    if (opts.centre && opts.r) s += `<circle cx="${X(opts.centre[0])}" cy="${Y(opts.centre[1])}" r="${(opts.r * k).toFixed(1)}" class="pc"/><circle cx="${X(opts.centre[0])}" cy="${Y(opts.centre[1])}" r="2" class="pcc"/>`;
    if (pts.length > 1 && !opts.centre && !opts.noLine) s += `<polyline points="${pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" class="po"/>`;
    const many = pts.length > 40;
    pts.forEach((p, i) => {
      s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${many ? 2.5 : 4}" class="${p[2] ? 'hs' : i === 0 ? 'h0' : 'h'}"/>`;
      if (!many) s += `<text x="${+X(p[0]) + 5}" y="${+Y(p[1]) - 5}" class="hn">${i + 1}</text>`;
    });
    return s + '</svg>';
  }

  const api = { ALARM_TIPS, TOOLDATA, explainToolData, TURN_UNITS, TURN_TOOL, TURN_PAT, TSHAPE, CLEAR, clearPrompt, POINT_FIELDS, PATTERNS, ROWS, CYCLES, cycleOf, TOOL_FIELDS, UNITS, COMMON, explain, patternSvg };
  root.MazHelp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
