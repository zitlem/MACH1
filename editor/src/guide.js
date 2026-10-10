// EIA guidance line (in the spirit of a conversational editor's guidance): for the block at the cursor, the command's
// format with every address explained, the values the block gives, and what is missing; a block that only moves
// (X/Y/Z) while a canned cycle is on is shown as the next hole of that cycle. Our own wording. Machining-center codes.
(function (root) {
  'use strict';
  // code: [title, words (letters in format order; '?' optional), meaning per letter, note]
  const W = {
    X: 'X position', Y: 'Y position', Z: 'Z position', F: 'feed', R: 'R level (where feeding starts)', P: 'dwell at the bottom (ms, or s with a point)',
    Q: 'peck depth', K: 'repeats (number of holes on the same spot)', S: 'spindle speed (rpm)', T: 'tool', L: 'repeats', I: 'X offset / arc centre X', J: 'Y offset / arc centre Y', D: 'offset number', H: 'tool length offset number',
  };
  const CYCLE = (title, words, extra, note) => [title, words, Object.assign({ Z: 'hole bottom', R: 'R level (feeding starts here)' }, extra || {}), note];
  const G = {
    0: ['Rapid to a position', 'X? Y? Z?', {}, 'Moves at rapid; give at least one axis.'],
    1: ['Feed in a straight line', 'X? Y? Z? F', { F: 'feed (needed once, then it stays)' }, ''],
    2: ['Arc clockwise', 'X? Y? Z? I? J? R? F', { R: 'arc radius (instead of I J)', I: 'arc centre, X distance from the start', J: 'arc centre, Y distance from the start' }, 'Give I J or R.'],
    3: ['Arc counter-clockwise', 'X? Y? Z? I? J? R? F', { R: 'arc radius (instead of I J)', I: 'arc centre, X distance from the start', J: 'arc centre, Y distance from the start' }, 'Give I J or R.'],
    4: ['Dwell', 'P? X?', { P: 'time in ms (P1000 = 1 s)', X: 'time in seconds' }, 'Give P or X.'],
    10: ['Data setting', 'L P X? Y? Z? R?', { L: 'what to set: L2 work offset, L10–L13 tool offsets, L20 extra work offsets', P: 'which one (work offset number or tool number)', R: 'offset value' }, ''],
    28: ['Return to the reference point', 'X? Y? Z?', { X: 'via this X', Y: 'via this Y', Z: 'via this Z' }, 'Usually G91 G28 Z0.'],
    40: ['Cutter comp off', '', {}, ''], 41: ['Cutter comp left', 'D', { D: 'radius offset number' }, 'Turn it on with a straight move.'],
    42: ['Cutter comp right', 'D', { D: 'radius offset number' }, 'Turn it on with a straight move.'],
    43: ['Tool length offset +', 'H Z?', { H: 'length offset number (usually = tool)', Z: 'move to this Z with the offset' }, ''],
    49: ['Tool length offset off', '', {}, ''], 52: ['Local coordinate system', 'X? Y? Z?', { X: 'shift X', Y: 'shift Y', Z: 'shift Z' }, 'G52 X0 Y0 Z0 cancels it.'],
    53: ['Machine coordinates (this block)', 'X? Y? Z?', {}, ''],
    54: ['Work offset 1', '', {}, ''], 55: ['Work offset 2', '', {}, ''], 56: ['Work offset 3', '', {}, ''], 57: ['Work offset 4', '', {}, ''], 58: ['Work offset 5', '', {}, ''], 59: ['Work offset 6', '', {}, ''],
    54.1: ['Extra work offset', 'P', { P: 'which one (P1 …)' }, ''],
    65: ['Macro call', 'P A? B? C? D? E? F? H? I? J? K?', { P: 'program number', A: 'argument #1', B: 'argument #2', C: 'argument #3', D: 'argument #7', E: 'argument #8', F: 'argument #9', H: 'argument #11', I: 'argument #4', J: 'argument #5', K: 'argument #6' }, ''],
    68: ['Rotate coordinates', 'X? Y? R', { X: 'centre X', Y: 'centre Y', R: 'angle (degrees)' }, 'G69 cancels it.'],
    69: ['Rotation off', '', {}, ''],
    71.1: CYCLE('Chamfering cutter, clockwise', 'X? Y? Z R Q F K?', { Q: 'radius of the circle round the hole', Z: 'depth of the chamfer' }),
    72.1: CYCLE('Chamfering cutter, counter-clockwise', 'X? Y? Z R Q F K?', { Q: 'radius of the circle round the hole', Z: 'depth of the chamfer' }),
    75: CYCLE('Boring 1', 'X? Y? Z R P? F K?', { P: 'dwell' }), 77: CYCLE('Back spot facing', 'X? Y? Z R P? F K?', { Z: 'top of the spot face', R: 'start below the part', P: 'dwell' }),
    78: CYCLE('Boring 3', 'X? Y? Z R P? F K?', { P: 'dwell' }), 79: CYCLE('Boring 4', 'X? Y? Z R P? F K?', { P: 'dwell' }),
    84.3: CYCLE('Synchronous reverse tapping', 'X? Y? Z R P? F K?', { F: 'feed = pitch × rpm (or pitch with G95)' }),
    73: CYCLE('High-speed peck drilling', 'X? Y? Z R Q F K?', { Q: 'peck depth (short retract between pecks)' }),
    74: CYCLE('Reverse tapping (left-hand)', 'X? Y? Z R F K?', { F: 'feed = pitch × rpm' }, 'Spindle runs reverse in; forward out.'),
    76: CYCLE('Fine boring', 'X? Y? Z R Q? P? F K?', { Q: 'shift off the wall at the bottom', P: 'dwell at the bottom' }, 'Spindle orients and the bar backs off the wall before coming out.'),
    80: ['Cycle off', '', {}, 'Ends G73–G89.'],
    81: CYCLE('Drilling', 'X? Y? Z R F K?', {}), 82: CYCLE('Drilling with a dwell', 'X? Y? Z R P F K?', { P: 'dwell at the bottom' }),
    83: CYCLE('Deep-hole peck drilling', 'X? Y? Z R Q F K?', { Q: 'peck depth (full retract to R between pecks)' }),
    84: CYCLE('Tapping', 'X? Y? Z R P? F K?', { F: 'feed = pitch × rpm', P: 'dwell at the bottom' }, 'Feed hold and override are off while tapping.'),
    84.2: CYCLE('Synchronous (rigid) tapping', 'X? Y? Z R P? F K?', { F: 'feed = pitch × rpm (or pitch with G95)' }),
    85: CYCLE('Reaming (feed out)', 'X? Y? Z R F K?', {}), 86: CYCLE('Boring (spindle stop, rapid out)', 'X? Y? Z R P? F K?', { P: 'dwell' }),
    87: CYCLE('Back boring', 'X? Y? Z R Q? P? F K?', { Q: 'shift', Z: 'top of the back bore', R: 'start below the part' }),
    88: CYCLE('Boring (dwell, stop)', 'X? Y? Z R P? F K?', { P: 'dwell' }), 89: CYCLE('Boring (dwell, feed out)', 'X? Y? Z R P F K?', { P: 'dwell' }),
    90: ['Absolute positions', '', {}, ''], 91: ['Incremental moves', '', {}, ''],
    94: ['Feed per minute', '', {}, ''], 95: ['Feed per revolution', '', {}, ''],
    98: ['Cycles return to the initial level', '', {}, ''], 99: ['Cycles return to the R level', '', {}, ''],
  };
  const M = { 6: ['Tool change', 'T', { T: 'tool to load' }, 'T on the same line or before.'], 98: ['Subprogram call', 'P L?', { P: 'program number', L: 'times to run' }, ''], 99: ['End of subprogram', '', {}, ''] };
  // Measuring macros (G65 P9010–P9020; measuring-system manual, EIA): X Y are machine coordinates of the start (or the
  // nominal centre), Q the stylus depth below Z0, R the initial height, H the probe's length offset, S 1 = print,
  // M the work offset to set (54–59). Our wording.
  const MX = { X: 'start X (machine coordinates, from machine zero)', Y: 'start Y (machine coordinates)', Q: 'stylus depth below Z0 (negative)', R: 'initial height (positive)', H: 'length offset No. of the probe', S: '1 = print the results', M: 'work offset to set (54–59)' };
  const MEAS = {
    9010: ['Probe calibration in a master hole', 'X Y Q R D K H M S', { X: 'master hole centre X (machine)', Y: 'master hole centre Y (machine)', D: 'measured diameter of the master hole', K: 'measuring move (2 mm / 0.08 in)', M: 'work offset the master is set in' }, 'Sets the stylus offset and radius (#550–#554). Do it for a new probe or stylus.'],
    9011: ['Set work zero X from a face', 'X Y Q R I H S M A?', { I: 'travel toward the face', A: 'shift from the face to work zero X' }, ''],
    9012: ['Set work zero Y from a face', 'X Y Q R J H S M B?', { J: 'travel toward the face', B: 'shift from the face to work zero Y' }, ''],
    9013: ['Set work zero X Y at a hole centre', 'X Y Q R D K H S M A? B?', { X: 'about the hole centre X (machine)', Y: 'about the hole centre Y (machine)', D: 'hole diameter', K: 'measuring move', A: 'shift X from the centre', B: 'shift Y from the centre' }, 'Touches the hole at four points.'],
    9014: ['Set work zero Z from the top face', 'X Y R H K M S C?', { K: 'measuring move (5–10 mm / 0.2–0.4 in)', C: 'shift from the face to work zero Z' }, ''],
    9015: ['Set work zero X at a groove centre', 'X Y Q R I K H S M A?', { I: 'measuring move', K: 'groove width', A: 'shift from the groove centre to work zero' }, ''],
    9016: ['Set work zero Y at a groove centre', 'X Y Q R J K H S M B?', { J: 'measuring move', K: 'groove width', B: 'shift from the groove centre to work zero' }, ''],
    9017: ['Set work zero X at the centre of a projection', 'X Y Q R I K H S M A?', { I: 'measuring move', K: 'projection width', A: 'shift from its centre to work zero' }, ''],
    9018: ['Set work zero Y at the centre of a projection', 'X Y Q R J K H S M B?', { J: 'measuring move', K: 'projection width', B: 'shift from its centre to work zero' }, ''],
    9019: ['Set work zero X Y at a boss centre', 'X Y Q R K D H S M A? B?', { D: 'boss diameter', K: 'measuring move', A: 'shift X from the centre', B: 'shift Y from the centre' }, 'Touches the boss at four points.'],
    9020: ['Measure the part\'s angle (inclination)', 'X Y Q R I J K D H S M', { I: 'pattern 1–4 (which side and direction)', J: 'expected angle', D: 'distance between the two touch points', K: 'measuring move' }, 'Sets the work offset\'s rotation.'],
  };
  const CYCLES = new Set([71.1, 72.1, 73, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 84.2, 84.3, 85, 86, 87, 88, 89]);

  // the words of a block: [[letter, text]] (comments, block skip and N left out)
  function words(line) {
    const s = String(line).replace(/\([^)]*\)/g, '').replace(/;.*$/, '').replace(/^\s*\//, '');
    return [...s.matchAll(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+)|#\d+|\[[^\]]*\])/gi)].map(m => [m[1].toUpperCase(), m[2], m.index]);
  }
  const num = t => parseFloat(t);
  // the canned cycle on before this line (looking back), or null
  function modalCycle(lines, k) {
    for (let i = k - 1; i >= 0 && i >= k - 400; i--) {
      for (const [L, v] of words(lines[i]).reverse()) {
        if (L !== 'G') continue;
        const g = Math.round(num(v) * 10) / 10;
        if (g === 80 || (g >= 0 && g <= 3)) return null;
        if (CYCLES.has(g)) return g;
      }
    }
    return null;
  }
  // guidance for line k: {title, items: [{L, desc, value, need, missing}], note, at (the word under the caret)}
  function guide(lines, k, col) {
    const ws = words(lines[k] || ''), gs = ws.filter(w => w[0] === 'G').map(w => Math.round(num(w[1]) * 10) / 10), ms = ws.filter(w => w[0] === 'M').map(w => num(w[1]));
    let def = null, code = '';
    // the most specific command on the line: a cycle, then other G with a format, then M
    const pick = gs.find(g => CYCLES.has(g)) ?? gs.find(g => G[g] && G[g][1]) ?? gs.find(g => G[g]);
    if (pick !== undefined && G[pick]) { def = G[pick]; code = 'G' + pick; }
    else { const m = ms.find(v => M[v]); if (m !== undefined) { def = M[m]; code = 'M' + String(m).padStart(2, '0'); } }
    let cont = false;
    if (!def && ws.some(w => 'XYZ'.includes(w[0]))) {
      const c = modalCycle(lines, k);
      if (c !== null) { def = G[c]; code = 'G' + c; cont = true; }
    }
    // a measuring macro call: its own format
    if (code === 'G65') {
      const pv = ws.find(w => w[0] === 'P'), m = pv && MEAS[Math.round(num(pv[1]))];
      if (m) { def = [m[0] + ' (G65 P' + Math.round(num(pv[1])) + ')', m[1], Object.assign({}, MX, m[2]), m[3]]; code = 'G65'; }
    }
    const at = (() => { const w = ws.find(w => col >= w[2] && col <= w[2] + 1 + w[1].length); return w ? w[0] : null; })();
    if (!def) return { title: '', items: [], note: '', at, code: '' };
    const measuring = /\(G65 P90/.test(def[0]);
    const given = new Map(ws.map(w => [w[0], w[1]]));
    const items = def[1].split(/\s+/).filter(Boolean).map(t => {
      const L = t[0], opt = t.endsWith('?'), value = given.get(L);
      return { L, desc: def[2][L] || W[L] || '', value: value === undefined ? '' : value, need: !opt, missing: !opt && value === undefined && !cont && !(L === 'F') };
    });
    // words the block gives that the format does not list (not G, M, N, O)
    for (const [L, v] of ws) if (!'GMNO'.includes(L) && !items.some(it => it.L === L)) items.push({ L, desc: code === 'G65' && L === 'P' ? 'macro program No.' : W[L] || '', value: v, need: false, missing: false, extra: true });
    return { title: (measuring ? '' : code + ' ') + def[0] + (cont ? ' — next hole of the cycle' : ''), items, note: def[3] || '', at, code };
  }
  // Three-digit G-format (a MAZATROL program written as text, identifier "(MG3-...)"; manuals H749PA 14, H747PA 16):
  // each unit is a G3xx block, tool lines sit between G424 and G425, shapes between G420 and G421, TPC between G422 and G423.
  const G3 = {
    300: 'Common unit', 301: 'END unit', 302: 'M-CODE unit', 303: 'SUB PRO unit', 304: 'MMS (coordinates measuring) unit', 305: 'MANL PRG unit',
    307: 'MATERIAL (stock shape) unit', 308: 'WORK MES (workpiece measuring) unit', 309: 'TRANSFER unit', 310: 'HEAD (head selection) unit',
    311: 'TOOL MES (tool measuring) unit', 313: '2 WORKPC (two-workpiece) unit', 316: 'Round-bar milling unit', 317: 'TEXT (engraving) unit',
    320: 'BAR unit', 321: 'CPY (copy turning) unit', 322: 'CORNER unit', 323: 'EDGE / FACING unit', 324: 'THREAD unit', 325: 'T.GROOVE unit',
    326: 'T.DRILL unit', 327: 'T.TAP unit', 328: 'Mill-turning unit',
    329: 'C-axis DRILLING unit', 330: 'C-axis RGH CBOR unit', 331: 'C-axis RGH BCB unit', 332: 'C-axis REAMING unit', 333: 'C-axis TAPPING unit',
    334: 'C-axis BK CBOR unit', 335: 'C-axis CIRC MIL unit', 336: 'C-axis CBOR TAP unit', 337: 'C-axis BORING T1 unit', 338: 'C-axis BORING S1 unit',
    339: 'C-axis BORING T2 unit', 340: 'C-axis BORING S2 unit', 341: 'C-axis LINE CTR unit', 342: 'C-axis LINE RGT unit', 343: 'C-axis LINE LFT unit',
    344: 'C-axis LINE OUT unit', 345: 'C-axis LINE IN unit', 346: 'C-axis CHMF RGT unit', 347: 'C-axis CHMF LFT unit',
    350: 'DRILLING unit', 351: 'RGH CBOR unit', 352: 'RGH BCB unit', 353: 'REAMING unit', 354: 'TAPPING unit', 355: 'BK CBOR (back boring) unit',
    356: 'CIRC MIL unit', 357: 'CBOR-TAP unit', 358: 'BORE T1 (through hole boring) unit', 359: 'BORE S1 (blind hole boring) unit',
    360: 'BORE T2 (stepped through) unit', 361: 'BORE S2 (stepped blind) unit', 362: 'LINE CTR unit', 363: 'LINE RGT unit', 364: 'LINE LFT unit',
    365: 'LINE OUT unit', 366: 'LINE IN unit', 367: 'CHMF RGT unit', 368: 'CHMF LFT unit', 369: 'CHMF OUT unit', 370: 'CHMF IN unit',
    371: 'FCE MILL unit', 372: 'TOP EMIL unit', 373: 'STEP unit', 374: 'POCKET unit', 375: 'PCKT MT (pocket, islands) unit', 376: 'PCKT VLY unit',
    377: 'SLOT unit', 379: 'WPC (basic coordinates) unit', 380: 'OFFSET (auxiliary coordinates) unit', 382: 'INDEX unit', 385: 'PROC END unit',
    386: '3-D unit (ROTATE 1)', 387: '3-D unit (ROTATE 2)', 388: '3-D unit (ROTATE 3)', 389: '3-D unit (ROTATE 4)', 390: '3-D unit (PARALL. 1)',
    391: '3-D unit (PARALL. 2)', 392: '3-D unit (PARALL. 3)', 393: '3-D unit (PARALL. 4)', 394: '3-D unit (NORMAL 1)', 395: '3-D unit (NORMAL 2)',
    396: '3-D unit (RULED-S.)', 397: '3-D plane definition', 398: '3-D coordinates transfer', 399: '3-D processing area',
    420: 'start of the shape lines', 421: 'end of the shape lines', 422: 'start of the TPC data', 423: 'end of the TPC data',
    424: 'start of the tool lines', 425: 'end of the tool lines',
  };
  const isG3 = text => /\(\s*MG\s*\d\s*-\s*\d+/i.test(String(text).slice(0, 600));
  // what a block of a three-digit G-format file is
  function g3(line) {
    const g = words(line).filter(w => w[0] === 'G').map(w => Math.round(parseFloat(w[1])))[0];
    if (g === undefined) return /^\s*N\d+/.test(line) ? { title: 'a tool, shape or TPC line of the unit above', code: '' } : null;
    if (G3[g]) return { title: 'G' + g + ' ' + G3[g], code: 'G' + g };
    if (g === 10) return { title: 'G10 data (tool data, offsets, parameters …)', code: 'G10' };
    return { title: 'G' + g + ' (three-digit G-format code)', code: 'G' + g };
  }
  // Macro (system) variables of a Smooth control (EIA programming manuals, macro chapter); our wording. Ranges:
  // [from, to, meaning, (n) => detail]; t: 'mill' | 'lathe' | 'millturn'
  const AXES = ['X', 'Y', 'Z', '4th', '5th', '6th'];
  const ax = (base, n) => AXES[n - base - 1] || 'axis ' + (n - base);
  const ARG = { 1: 'A', 2: 'B', 3: 'C', 4: 'I', 5: 'J', 6: 'K', 7: 'D', 8: 'E', 9: 'F', 11: 'H', 13: 'M', 17: 'Q', 18: 'R', 19: 'S', 20: 'T', 21: 'U', 22: 'V', 23: 'W', 24: 'X', 25: 'Y', 26: 'Z' };
  const WCS = ['shift (external)', 'G54', 'G55', 'G56', 'G57', 'G58', 'G59'];
  function varsFor(t) {
    const turn = t !== 'mill';
    const off = turn ? ['geometry Z', 'wear Z', 'geometry nose R', 'wear nose R'] : ['geometry (length)', 'wear (length)', 'geometry (radius)', 'wear (radius)'];
    return [
      [1, 33, 'local variable of this macro', n => (ARG[n] ? 'argument ' + ARG[n] + ' of G65 / G66' : '')],
      [100, 199, 'common variable (cleared at power off)'], [500, 999, 'common variable (kept at power off)'],
      [1000, 1035, 'macro interface input (signal from the machine, read only)'], [1100, 1135, 'macro interface output (signal to the machine)'],
      [2001, 2200, 'tool offset: ' + off[0], n => 'offset No. ' + (n - 2000)], [2201, 2400, 'tool offset: ' + off[1], n => 'offset No. ' + (n - 2200)],
      [2401, 2600, 'tool offset: ' + off[2], n => 'offset No. ' + (n - 2400)], [2601, 2800, 'tool offset: ' + off[3], n => 'offset No. ' + (n - 2600)],
      [3000, 3000, 'raise an alarm: #3000 = n (message) stops with that alarm'],
      [3001, 3001, 'timer 1 (ms, counts while powered)'], [3002, 3002, 'timer 2 (ms, counts during automatic operation)'],
      [3003, 3003, 'single block stop / M-code finish wait off (1, 2, 3) or on (0)'], [3004, 3004, 'feed hold, feed override, exact stop off (bits) or on (0)'],
      [3006, 3006, 'program stop with a message: #3006 = 1 (message)'], [3007, 3007, 'mirror image state (bits per axis)'],
      [3009, 3010, 'message box / answer to it'], [3011, 3011, 'date (YYYYMMDD)'], [3012, 3012, 'time (HHMMSS)'],
      [3020, 3020, 'TOOL DATA line of the tool in the spindle'], [3022, 3023, 'tool data index numbers'],
      [3071, 3089, 'measuring parameters (tolerances, skip and approach feeds)'],
      [3901, 3901, 'parts count: machined'], [3902, 3902, 'parts count: target'],
      [4001, 4026, 'modal G-code of the block read ahead', n => 'group ' + (n - 4000)], [4101, 4130, 'modal B D E F H M N O S T of the block read ahead'],
      [4201, 4226, 'modal G-code of the block running', n => 'group ' + (n - 4200)], [4301, 4330, 'modal B D E F H M N O S T of the block running'],
      [5001, 5016, 'end point of the last block (work coordinates)', n => ax(5000, n)], [5021, 5036, 'machine position', n => ax(5020, n)],
      [5041, 5056, 'work position', n => ax(5040, n)], [5061, 5076, 'skip position (G31)', n => ax(5060, n)],
      [5081, 5096, 'tool offset now applied', n => ax(5080, n)], [5101, 5116, 'servo deviation', n => ax(5100, n)],
      [5201, 5336, 'work offset', n => { const k = Math.floor((n - 5201) / 20); return (WCS[k] || '') + ' ' + ax(5200 + k * 20, n); }],
      [5501, 5504, 'touch probe stylus (eccentricity X / Y, ball radius X / Y)'],
      [10001, 18999, 'tool offset (last three digits = offset No.): ' + (turn ? 'geometry Z, wear Z, geometry X, wear X, Y …, nose R by thousands' : 'by type of offset')],
      [40001, 44999, 'EIA tool data (length offset, radius, life and damage flags, by thousands)'],
      [51999, 51999, 'tool number in the spindle'], [60001, 68999, 'MAZATROL tool data (length, diameter, life / damage flag, wear X Y Z, group, length B by thousands)'],
      [100001, 184000, 'tool offset (last four digits = offset No.)'], [400001, 449999, 'EIA tool data (4000 tools)'], [600001, 689999, 'MAZATROL tool data (4000 tools)'],
    ];
  }
  function varInfo(n, t) {
    for (const [a, b, what, fn] of varsFor(t || 'mill')) if (n >= a && n <= b) { const d = fn ? fn(n) : ''; return what + (d ? ' — ' + d : ''); }
    return '';
  }
  const api = { MEAS, guide, words, modalCycle, G3, isG3, g3, varsFor, varInfo };
  root.MazGuide = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
