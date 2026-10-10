// MACH1 probing: spindle-probe programs for a Mazak machining centre.
// Three kinds of program, one job each:
//   ren     Renishaw Inspection Plus macros (G65 P98xx), as an EIA/ISO program, plus a Mazatrol program whose
//           SUB PRO unit (MEASURE MACRO) calls it, so a probe cycle can also update the Mazatrol WPC (S7).
//   mms     Mazatrol's own MMS unit (X-FACE, BORE-XY, ...), as a Mazatrol program.
//   mmseia  Mazak's MMS EIA/ISO macros (G65 P9010-P9020), which run from machine zero, as an EIA/ISO program.
// The argument rules come from the macros on the machines (A-4013-0113-0T, MMS V1.0) and the Renishaw and Mazak
// manuals. PROBE.job() checks a job, PROBE.eia() writes the EIA/ISO text, PROBE.toMazatrol() the Mazatrol program
// (needs MACH1), PROBE.plot() what to draw for each operation.
(function (root) {
  'use strict';

  const SUFFIX = 'ABCDEFGHJKLMNPQRSTUVWXYZ';           // Renishaw T suffixes: A = .01 ... Z = .24, no I or O
  const num = (v, d) => { if (v === '' || v === null || v === undefined) return d; const n = parseFloat(v); return isFinite(n) ? n : d; };
  const has = v => v !== '' && v !== null && v !== undefined && isFinite(parseFloat(v));
  // an argument value: always with a decimal point (Mazak reads a number without one in least increments)
  function fmt(v, dec) {
    const d = dec === undefined ? 5 : dec;          // inch: 0.00001
    let s = (+v).toFixed(d).replace(/0+$/, '');
    if (s === '-0.') s = '0.';
    if (s.startsWith('-0.') && +s === 0) s = '0.';
    return s;
  }
  const word = (a, v) => a + fmt(v);
  // a comment: capitals, plain ASCII, no brackets inside
  const cm = s => '(' + String(s).toUpperCase().replace(/°/g, ' DEG').replace(/[−–]/g, '-').replace(/[()]/g, '').replace(/[^\x20-\x7E]/g, '').slice(0, 60) + ')';

  // ------------------------------------------------------------------ work offsets
  // the active system the program runs in, and the S value that updates it (macro 9732 in the A-4013-0113 pack:
  // S1-6 = G54-G59, S7 = Mazatrol WPC, S101-148 = G54.1 P1-P48, S149-400 = G54.1 P49-P300)
  const WCS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];
  function wcsCode(w) {
    if (WCS.includes(w)) return w;
    const m = /^P(\d+)$/.exec(w || ''); if (m) return 'G54.1 P' + m[1];
    return 'G54';
  }
  function sValue(w) {
    const i = WCS.indexOf(w); if (i >= 0) return i + 1;
    if (w === 'WPC') return 7;
    const m = /^P(\d+)$/.exec(w || ''); if (m && +m[1] >= 1 && +m[1] <= 300) return 100 + +m[1];
    return null;
  }
  const wcsName = w => w === 'WPC' ? 'the Mazatrol WPC' : w === 'active' ? 'the active offset' : wcsCode(w);
  // Renishaw tool number with suffix: 12 + "A" -> 12.01
  function toolT(n, sfx) {
    const i = SUFFIX.indexOf(String(sfx || '').toUpperCase());
    return +n + (i >= 0 ? (i + 1) / 100 : 0);
  }

  // ------------------------------------------------------------------ the field kinds
  const F = (k, label, unit, extra) => Object.assign({ k, label, unit: unit || '' }, extra || {});
  const XY = [F('x', 'X', 'in', { def: 0 }), F('y', 'Y', 'in', { def: 0 })];
  // optional inputs shared by the Renishaw measuring cycles (letters as in the macros)
  const OPT = {
    S: F('upd', 'Update work offset', '', { kind: 'wcs', def: 'active', hint: 'New value = the active offset + the error found. Leave it on the active one.' }),
    T: F('tool', 'Update tool', '', { kind: 'text', def: '', hint: 'Tool number and suffix, e.g. 12A: changes its length (Z) or diameter in TOOL DATA. Not with a work offset.' }),
    H: F('tolH', 'Size tolerance ±', 'in', { hint: 'Stops with OUT OF TOLERANCE (cycle start goes on)' }),
    M: F('tolM', 'Position tolerance (zone Ø)', 'in', { hint: 'True position: stops with OUT OF POSITION' }),
    U: F('tolU', 'Upper limit', 'in', { hint: 'Beyond it: stop, and nothing is updated' }),
    V: F('nullV', 'Null band', 'in', { hint: 'No tool update below this' }),
    F: F('fb', 'Feedback', '0–1', { hint: 'Part of the error put into the tool offset (default 1)' }),
    E: F('exp', 'Experience offset No.', '', { hint: 'Its value is added to the measured size' }),
    Q: F('over', 'Overtravel', 'in', { hint: 'Past the expected surface before PROBE FAIL (default 0.394, 0.197 in Z)' }),
    R: F('clr', 'Radial clearance', 'in', { hint: 'For a boss or web (default 0.197)' }),
    W: F('print', 'Print results', '', { kind: 'sel', def: '', opts: [['', 'No'], ['1', 'W1 next feature'], ['2', 'W2 next part']] }),
    B: F('tolB', 'Angle tolerance ±', '°'),
  };
  // the order the optional inputs are shown and written
  const OPT_ORDER = 'SHMUTVFEBQRW';

  // ------------------------------------------------------------------ the operations
  // each: sys, name, group, macro, info, fields, opt (Renishaw letters), and
  //   start(o)  -> {x, y, z, down}: where the probe goes first (z = level to go down to; down false = stay at clearance)
  //   args(o)   -> [[letter, value], ...] the specific inputs
  //   check(o, job) -> [{err|warn: text}]
  //   geo(o)    -> drawing primitives
  //   mms(o)    -> fields of a Mazatrol MMS line
  const CYC = {};
  const add = (id, d) => { CYC[id] = Object.assign({ id, opt: '', fields: [], check: () => [], args: () => [] }, d); };
  const sideOpts = ax => [['-', 'From the − side (moves +' + ax + ')'], ['+', 'From the + side (moves −' + ax + ')']];
  const levelF = F('z', 'Probing Z', 'in', { def: -0.25, hint: 'Absolute, from Z0' });
  const topF = F('top', 'Top of the feature', 'Z in', { def: 0, hint: 'The probe goes down beside it at the probing Z' });

  // --- Renishaw: positioning, measuring, calibration
  add('surfX', {
    sys: 'ren', group: 'Measure', macro: 9811, name: 'X surface', info: 'Touches one face in X: its position.',
    fields: [F('sx', 'Expected X of the face', 'in', { def: 0 }), F('y', 'Y', 'in', { def: 0 }), levelF, F('side', 'Probe', '', { kind: 'seg', def: '-', opts: sideOpts('X') }), F('app', 'Start this far off the face', 'in', { def: 0.25 })],
    opt: 'SHMUTVFEQW',
    start: o => ({ x: num(o.sx, 0) + (o.side === '+' ? 1 : -1) * Math.abs(num(o.app, 0.25)), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['X', num(o.sx, 0)]],
    geo: o => ({ lines: [[num(o.sx, 0), num(o.y, 0) - 1, num(o.sx, 0), num(o.y, 0) + 1]], touch: [[num(o.sx, 0), num(o.y, 0), o.side === '+' ? -1 : 1, 0]] }),
  });
  add('surfY', {
    sys: 'ren', group: 'Measure', macro: 9811, name: 'Y surface', info: 'Touches one face in Y: its position.',
    fields: [F('x', 'X', 'in', { def: 0 }), F('sy', 'Expected Y of the face', 'in', { def: 0 }), levelF, F('side', 'Probe', '', { kind: 'seg', def: '-', opts: sideOpts('Y') }), F('app', 'Start this far off the face', 'in', { def: 0.25 })],
    opt: 'SHMUTVFEQW',
    start: o => ({ x: num(o.x, 0), y: num(o.sy, 0) + (o.side === '+' ? 1 : -1) * Math.abs(num(o.app, 0.25)), z: num(o.z, 0), down: true }),
    args: o => [['Y', num(o.sy, 0)]],
    geo: o => ({ lines: [[num(o.x, 0) - 1, num(o.sy, 0), num(o.x, 0) + 1, num(o.sy, 0)]], touch: [[num(o.x, 0), num(o.sy, 0), 0, o.side === '+' ? -1 : 1]] }),
  });
  add('surfZ', {
    sys: 'ren', group: 'Measure', macro: 9811, name: 'Z surface', info: 'Touches a face in Z (toward the pallet): its height. With a tool to update, its length.',
    fields: [...XY, F('sz', 'Expected Z of the face', 'in', { def: 0 }), F('app', 'Start this far above it', 'in', { def: 0.25 })],
    opt: 'SHMUTVFEQW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.sz, 0) + Math.abs(num(o.app, 0.25)), down: true }),
    args: o => [['Z', num(o.sz, 0)]],
    geo: o => ({ pts: [[num(o.x, 0), num(o.y, 0), 'Z' + fmt(num(o.sz, 0))]] }),
  });
  add('pocketX', {
    sys: 'ren', group: 'Measure', macro: 9812, name: 'Pocket / slot in X', info: 'Two touches across a slot in X from its middle: centre and width.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), levelF, F('w', 'Width', 'in', { def: 1 })],
    opt: 'SHMUTVFEQW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['X', num(o.w, 1)]],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), h = num(o.w, 1) / 2; return { lines: [[x - h, y - 0.6, x - h, y + 0.6], [x + h, y - 0.6, x + h, y + 0.6]], touch: [[x - h, y, -1, 0], [x + h, y, 1, 0]] }; },
  });
  add('pocketY', {
    sys: 'ren', group: 'Measure', macro: 9812, name: 'Pocket / slot in Y', info: 'Two touches across a slot in Y from its middle: centre and width.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), levelF, F('w', 'Width', 'in', { def: 1 })],
    opt: 'SHMUTVFEQW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['Y', num(o.w, 1)]],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), h = num(o.w, 1) / 2; return { lines: [[x - 0.6, y - h, x + 0.6, y - h], [x - 0.6, y + h, x + 0.6, y + h]], touch: [[x, y - h, 0, -1], [x, y + h, 0, 1]] }; },
  });
  add('webX', {
    sys: 'ren', group: 'Measure', macro: 9812, name: 'Web in X', info: 'A wall or tongue: the probe clears it, comes down on each side in X: centre and width.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), topF, levelF, F('w', 'Width', 'in', { def: 1 })],
    opt: 'SHMUTVFEQRW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.top, 0) + 0.2, down: true }),
    args: o => [['X', num(o.w, 1)], ['Z', num(o.z, 0)]],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), h = num(o.w, 1) / 2; return { rects: [[x - h, y - 0.6, x + h, y + 0.6]], touch: [[x - h, y, 1, 0], [x + h, y, -1, 0]] }; },
  });
  add('webY', {
    sys: 'ren', group: 'Measure', macro: 9812, name: 'Web in Y', info: 'A wall or tongue: the probe clears it, comes down on each side in Y: centre and width.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), topF, levelF, F('w', 'Width', 'in', { def: 1 })],
    opt: 'SHMUTVFEQRW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.top, 0) + 0.2, down: true }),
    args: o => [['Y', num(o.w, 1)], ['Z', num(o.z, 0)]],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), h = num(o.w, 1) / 2; return { rects: [[x - 0.6, y - h, x + 0.6, y + h]], touch: [[x, y - h, 0, 1], [x, y + h, 0, -1]] }; },
  });
  const ring = (o, out) => { const x = num(o.x, 0), y = num(o.y, 0), r = num(o.d, 1) / 2, s = out ? -1 : 1; return { circles: [[x, y, r]], touch: [[x, y + r, 0, s], [x, y - r, 0, -s], [x + r, y, s, 0], [x - r, y, -s, 0]] }; };
  add('bore', {
    sys: 'ren', group: 'Measure', macro: 9814, name: 'Bore', info: 'Four touches inside a hole from near its centre: centre and diameter.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), levelF, F('d', 'Diameter', 'in', { def: 1 })],
    opt: 'SHMUTVFEQW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['D', num(o.d, 1)]],
    geo: o => ring(o, false),
  });
  add('boss', {
    sys: 'ren', group: 'Measure', macro: 9814, name: 'Boss', info: 'Four touches round a boss, coming down outside it: centre and diameter.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), topF, levelF, F('d', 'Diameter', 'in', { def: 1 })],
    opt: 'SHMUTVFEQRW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.top, 0) + 0.2, down: true }),
    args: o => [['D', num(o.d, 1)], ['Z', num(o.z, 0)]],
    geo: o => ring(o, true),
  });
  const quad = [['++', 'Toward +X +Y'], ['-+', 'Toward −X +Y'], ['--', 'Toward −X −Y'], ['+-', 'Toward +X −Y']];
  const qs = o => [(o.q || '++')[0] === '-' ? -1 : 1, (o.q || '++')[1] === '-' ? -1 : 1];
  add('cornerIn', {
    sys: 'ren', group: 'Measure', macro: 9815, name: 'Inside corner', info: 'Finds the corner of a pocket: one touch on each wall from a start inside, near the corner. Two touches on a wall also give its angle.',
    fields: [F('x', 'Corner X', 'in', { def: 0 }), F('y', 'Corner Y', 'in', { def: 0 }), levelF, F('q', 'Start is', '', { kind: 'sel', def: '++', opts: quad, hint: 'Which way from the corner the probe starts (into the pocket)' }), F('app', 'Start this far from each wall', 'in', { def: 0.5 }),
      F('ia', 'Second touch on the Y face, this far along X', 'in', { hint: 'For the wall angle (I)' }), F('ja', 'Second touch on the X face, this far along Y', 'in', { hint: 'For the wall angle (J)' })],
    opt: 'SMUBQW',
    start: o => { const [sx, sy] = qs(o), a = Math.abs(num(o.app, 0.5)); return { x: num(o.x, 0) + sx * a, y: num(o.y, 0) + sy * a, z: num(o.z, 0), down: true }; },
    args: o => [['X', num(o.x, 0)], ['Y', num(o.y, 0)], has(o.ia) ? ['I', num(o.ia)] : null, has(o.ja) ? ['J', num(o.ja)] : null],
    geo: o => { const [sx, sy] = qs(o), x = num(o.x, 0), y = num(o.y, 0), a = Math.abs(num(o.app, 0.5)); return { lines: [[x, y, x + sx * 2 * a, y], [x, y, x, y + sy * 2 * a]], touch: [[x, y + sy * a, -sx, 0], [x + sx * a, y, 0, -sy]] }; },
  });
  add('cornerOut', {
    sys: 'ren', group: 'Measure', macro: 9816, name: 'Outside corner', info: 'Finds the corner of a block from a start outside it, off the corner diagonally: one touch on each face.',
    fields: [F('x', 'Corner X', 'in', { def: 0 }), F('y', 'Corner Y', 'in', { def: 0 }), levelF, F('q', 'Start is', '', { kind: 'sel', def: '++', opts: quad, hint: 'Which way from the corner the probe starts (off the block)' }), F('app', 'Start this far off each face', 'in', { def: 0.5 }),
      F('ia', 'Second touch on the Y face, this far along X', 'in', { hint: 'For the face angle (I)' }), F('ja', 'Second touch on the X face, this far along Y', 'in', { hint: 'For the face angle (J)' })],
    opt: 'SMUBQW',
    start: o => { const [sx, sy] = qs(o), a = Math.abs(num(o.app, 0.5)); return { x: num(o.x, 0) + sx * a, y: num(o.y, 0) + sy * a, z: num(o.z, 0), down: true }; },
    args: o => [['X', num(o.x, 0)], ['Y', num(o.y, 0)], has(o.ia) ? ['I', num(o.ia)] : null, has(o.ja) ? ['J', num(o.ja)] : null],
    geo: o => { const [sx, sy] = qs(o), x = num(o.x, 0), y = num(o.y, 0), a = Math.abs(num(o.app, 0.5)); return { lines: [[x, y, x - sx * 2 * a, y], [x, y, x, y - sy * 2 * a]], touch: [[x - sx * a, y, 0, -sy], [x, y - sy * a, -sx, 0]] }; },
    check: () => [{ warn: '9815 and 9816 are named inside and outside here from the moves in the macros (A-4013-0113). Check the first run single block with the feed held low.' }],
  });
  add('rect', {
    sys: 'ren', group: 'Measure', macro: 9817, name: 'Rectangle (4 sides + angle)', info: 'A rectangular pocket or boss: a touch on each side and a second on one of them. Centre and skew angle.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), F('kind', '', '', { kind: 'seg', def: 'pocket', opts: [['pocket', 'Pocket'], ['boss', 'Boss']] }), F('top', 'Top of the boss', 'Z in', { def: 0, show: o => o.kind === 'boss' }), levelF,
      F('dx', 'Size X', 'in', { def: 2 }), F('dy', 'Size Y', 'in', { def: 1 }), F('side', 'Side with two touches', '', { kind: 'sel', def: '14', opts: [['11', '+X'], ['12', '+Y'], ['13', '−X'], ['14', '−Y']] }), F('sp', 'Spacing of those two touches', 'in', { hint: 'Blank = a quarter of that side' })],
    opt: 'SMUBQRW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: o.kind === 'boss' ? num(o.top, 0) + 0.2 : num(o.z, 0), down: true }),
    args: o => [['D', num(o.dx, 2)], ['E', num(o.dy, 1)], o.kind === 'boss' ? ['Z', num(o.z, 0)] : null, o.side && o.side !== '14' ? ['A', +o.side] : null, has(o.sp) ? ['T', num(o.sp)] : null],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), a = num(o.dx, 2) / 2, b = num(o.dy, 1) / 2, s = o.kind === 'boss' ? -1 : 1; return { rects: [[x - a, y - b, x + a, y + b]], touch: [[x + a, y, s, 0], [x, y + b, 0, s], [x - a, y, -s, 0], [x, y - b, 0, -s]] }; },
    check: o => [{ warn: '9817 (rectangle) is read from the macro; its side codes are not in a manual. Prove it single block.' }],
  });
  add('pcd', {
    sys: 'ren', group: 'Measure', macro: 9819, name: 'Bolt circle (PCD)', info: 'Measures each bore or boss on a bolt circle from its centre: positions, angle and the circle\'s diameter. No offset update.',
    fields: [F('x', 'Circle centre X', 'in', { def: 0 }), F('y', 'Circle centre Y', 'in', { def: 0 }), F('kind', '', '', { kind: 'seg', def: 'bore', opts: [['bore', 'Bores'], ['boss', 'Bosses']] }), F('z', 'Probing Z', 'in', { def: -0.25, hint: 'Bores: the probe goes down to it at each hole. Bosses: the level round each one.' }),
      F('pcd', 'Bolt circle diameter', 'in', { def: 4 }), F('d', 'Hole / boss diameter', 'in', { def: 0.5 }), F('a0', 'First one at', '°', { def: 0, hint: 'From +X, counter-clockwise' }), F('n', 'How many', '', { def: 4 })],
    opt: 'HMUQRW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: null, down: false }),
    args: o => [['C', num(o.pcd, 4)], ['D', num(o.d, 0.5)], ['A', num(o.a0, 0)], ['B', Math.max(1, Math.round(num(o.n, 4)))], o.kind === 'boss' ? ['Z', num(o.z, 0)] : ['K', num(o.z, 0)]],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), R = num(o.pcd, 4) / 2, r = num(o.d, 0.5) / 2, n = Math.max(1, Math.round(num(o.n, 4))), c = []; for (let i = 0; i < n; i++) { const t = (num(o.a0, 0) + 360 * i / n) * Math.PI / 180; c.push([x + R * Math.cos(t), y + R * Math.sin(t), r]); } return { circles: c, dashed: [[x, y, R]] }; },
    check: o => (num(o.n, 4) < 1 ? [{ err: 'At least one hole.' }] : []),
  });
  add('stock', {
    sys: 'ren', group: 'Measure', macro: 9820, name: 'Surface, several points (stock)', info: 'Touches one face at up to 6 points: most and least stock, and the spread (flatness).',
    fields: [F('ax', 'Face is in', '', { kind: 'seg', def: 'Z', opts: [['Z', 'Z'], ['X', 'X'], ['Y', 'Y']] }), F('sv', 'Expected position of the face', 'in', { def: 0 }),
      F('pts', 'Points', 'in', { kind: 'pts', def: '0 0\n1 0\n1 1', hint: 'One a line, the first is where it starts. Z face: X Y. X face: Y Z. Y face: X Z. Up to 6.' }), F('app', 'Start this far off the face', 'in', { def: 0.25 })],
    opt: 'SUQ',
    start: o => { const p = ptList(o.pts)[0] || [0, 0], a = Math.abs(num(o.app, 0.25)), v = num(o.sv, 0);
      return o.ax === 'X' ? { x: v - a, y: p[0], z: p[1], down: true } : o.ax === 'Y' ? { x: p[0], y: v - a, z: p[1], down: true } : { x: p[0], y: p[1], z: v + a, down: true }; },
    args: o => { const p = ptList(o.pts).slice(1), out = [[o.ax || 'Z', num(o.sv, 0)]];
      const [a, b] = o.ax === 'X' ? ['J', 'K'] : o.ax === 'Y' ? ['I', 'K'] : ['I', 'J'];
      p.forEach(q => { out.push([a, q[0]]); out.push([b, q[1]]); }); return out; },
    geo: o => ({ pts: ptList(o.pts).map((p, i) => o.ax === 'Z' || !o.ax ? [p[0], p[1], 'P' + (i + 1)] : o.ax === 'X' ? [num(o.sv, 0), p[0], 'P' + (i + 1)] : [p[0], num(o.sv, 0), 'P' + (i + 1)]) }),
    check: o => { const n = ptList(o.pts).length, e = []; if (n < 1) e.push({ err: 'Give at least one point.' }); if (n > 6) e.push({ err: 'At most 6 points.' });
      if (n === 6 && has(o.over)) e.push({ err: 'With 6 points there is no room for an overtravel (Q is the 5th extra point\'s second value).' });
      if (o.ax === 'X' || o.ax === 'Y') e.push({ warn: 'X and Y faces: the probe starts on the − side of the face (moves +' + o.ax + ').' }); return e; },
  });
  add('angSurf', {
    sys: 'ren', group: 'Measure', macro: 9821, name: 'Angled surface', info: 'Touches a face along a direction in XY: how far it is.',
    fields: [F('x', 'Start X', 'in', { def: 0 }), F('y', 'Start Y', 'in', { def: 0 }), levelF, F('a', 'Probing direction', '°', { def: 45, hint: 'From +X, counter-clockwise' }), F('dist', 'Distance to the face', 'in', { def: 0.5 })],
    opt: 'SHMUTVFEQW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['A', num(o.a, 45)], ['D', num(o.dist, 0.5)]],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), t = num(o.a, 45) * Math.PI / 180, d = num(o.dist, 0.5), px = x + d * Math.cos(t), py = y + d * Math.sin(t), nx = -Math.sin(t) * 0.6, ny = Math.cos(t) * 0.6;
      return { lines: [[px - nx, py - ny, px + nx, py + ny]], touch: [[px, py, Math.cos(t), Math.sin(t)]] }; },
  });
  add('angWeb', {
    sys: 'ren', group: 'Measure', macro: 9822, name: 'Angled web / pocket', info: 'A slot or web at an angle: two touches square to its walls. Centre and width.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), F('kind', '', '', { kind: 'seg', def: 'pocket', opts: [['pocket', 'Pocket / slot'], ['web', 'Web']] }), F('top', 'Top of the web', 'Z in', { def: 0, show: o => o.kind === 'web' }), levelF,
      F('a', 'Walls run at', '°', { def: 30, hint: 'From +X' }), F('w', 'Width', 'in', { def: 1 })],
    opt: 'SHMUTVFEQRW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: o.kind === 'web' ? num(o.top, 0) + 0.2 : num(o.z, 0), down: true }),
    args: o => [['A', num(o.a, 30)], ['D', num(o.w, 1)], o.kind === 'web' ? ['Z', num(o.z, 0)] : null],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), t = num(o.a, 30) * Math.PI / 180, h = num(o.w, 1) / 2, ux = Math.cos(t), uy = Math.sin(t), nx = -uy, ny = ux;
      return { lines: [[x + nx * h - ux * 0.7, y + ny * h - uy * 0.7, x + nx * h + ux * 0.7, y + ny * h + uy * 0.7], [x - nx * h - ux * 0.7, y - ny * h - uy * 0.7, x - nx * h + ux * 0.7, y - ny * h + uy * 0.7]], touch: [[x + nx * h, y + ny * h, nx, ny], [x - nx * h, y - ny * h, -nx, -ny]] }; },
  });
  add('bore3', {
    sys: 'ren', group: 'Measure', macro: 9823, name: '3-point bore / boss', info: 'Three touches at the angles you give: for a hole or boss you can only reach part of.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), F('kind', '', '', { kind: 'seg', def: 'bore', opts: [['bore', 'Bore'], ['boss', 'Boss']] }), F('top', 'Top of the boss', 'Z in', { def: 0, show: o => o.kind === 'boss' }), levelF,
      F('d', 'Diameter', 'in', { def: 1 }), F('a1', 'First touch at', '°', { def: 0 }), F('a2', 'Second', '°', { def: 120 }), F('a3', 'Third', '°', { def: 240 })],
    opt: 'SHMUTVFEQRW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: o.kind === 'boss' ? num(o.top, 0) + 0.2 : num(o.z, 0), down: true }),
    args: o => [['A', num(o.a1, 0)], ['B', num(o.a2, 120)], ['C', num(o.a3, 240)], ['D', num(o.d, 1)], o.kind === 'boss' ? ['Z', num(o.z, 0)] : null],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), r = num(o.d, 1) / 2, s = o.kind === 'boss' ? -1 : 1;
      return { circles: [[x, y, r]], touch: [o.a1, o.a2, o.a3].map(a => { const t = num(a, 0) * Math.PI / 180; return [x + r * Math.cos(t), y + r * Math.sin(t), s * Math.cos(t), s * Math.sin(t)]; }) }; },
  });
  add('angle', {
    sys: 'ren', group: 'Measure', macro: 9843, name: 'Angle of a face (XY)', info: 'Two touches along a face: its angle in XY. Nothing is updated.',
    fields: [F('x', 'Start X', 'in', { def: 0 }), F('y', 'Start Y', 'in', { def: 0 }), levelF, F('ax', 'The face is about', '', { kind: 'seg', def: 'X', opts: [['X', 'Square to X (give its X)'], ['Y', 'Square to Y (give its Y)']] }),
      F('sv', 'Expected X / Y of the face', 'in', { def: 0.5 }), F('sp', 'Distance between the touches', 'in', { def: 2 }), F('a', 'Touches spread along', '°', { hint: 'Default 90 for an X face, 0 for a Y face' })],
    opt: 'BQW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['D', num(o.sp, 2)], [o.ax === 'Y' ? 'Y' : 'X', num(o.sv, 0.5)], has(o.a) ? ['A', num(o.a)] : null],
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), v = num(o.sv, 0.5), h = num(o.sp, 2) / 2;
      return o.ax === 'Y' ? { lines: [[x - h - 0.3, v, x + h + 0.3, v]], touch: [[x - h, v, 0, Math.sign(v - y) || 1], [x + h, v, 0, Math.sign(v - y) || 1]] } : { lines: [[v, y - h - 0.3, v, y + h + 0.3]], touch: [[v, y - h, Math.sign(v - x) || 1, 0], [v, y + h, Math.sign(v - x) || 1, 0]] }; },
  });
  // the B (4th axis) variable of the active work offset: G54-G59 #5224 + 20(n-1), G54.1 Pn #7004 / #70004 + 20(n-1)
  // (as macro 9732 reads and writes it)
  // the X variable of a work offset (Y, Z, B follow): G54-G59 #5221 + 20(n-1), G54.1 Pn #7001 / #70001 + 20(n-1),
  // the Mazatrol WPC #5341 (as macros 9732 and 9733 read and write them)
  function offX(w) {
    if (w === 'WPC') return 5341;
    const i = WCS.indexOf(w); if (i >= 0) return 5221 + 20 * i;
    const m = /^P(\d+)$/.exec(w || ''); if (!m || +m[1] < 1 || +m[1] > 300) return null;
    const n = +m[1]; return (n <= 48 ? 7001 : 70001) + 20 * (n - 1);
  }
  const bVar = w => (w === 'WPC' || offX(w) === null ? null : offX(w) + 3);
  // the probe home, the table to B, across, protected down to the clearance and to the start (x, y, z may be expressions)
  function turnTo(x, b, px, py, pz) {
    x.L.push('G0 G53 Z0 ' + x.cm('PROBE HOME BEFORE THE TABLE TURNS'), 'G0 B' + b, 'G0 X' + px + ' Y' + py, 'G65 P9810 Z' + fmt(x.cz), 'G65 P9810 Z' + pz);
  }
  // a number or an expression for a macro line: negative numbers in brackets
  const ex = v => (typeof v === 'string' ? v : v < 0 ? '[' + fmt(v) + ']' : fmt(v));
  const base = j => Math.round(num(j.varBase, 950));
  // S5 copied straight off the parameter screen is in 0.00001 in: no table centre is 1000 in from machine zero
  const s5Raw = j => [j.tcX, j.tcZ].some(v => has(v) && Math.abs(num(v, 0)) >= 1000);
  // the table centre in the program: read from the control (#50700 X, #50701 Z = parameter S5) or as typed
  const fromCtl = j => j.tcFrom === 'control';
  const cX = j => (fromCtl(j) ? '#50700' : ex(num(j.tcX, 0))), cZ = j => (fromCtl(j) ? '#50701' : ex(num(j.tcZ, 0)));
  const typedOk = j => has(j.tcX) && has(j.tcZ);
  // which operations use S5 (the side 180° away from S5, the centre search)
  const usesS5 = j => (j.ops || []).some(o => (o.type === 'side180' && o.cfrom !== 'measured') || o.type === 'centre180');
  const NEED_S5 = 'Type the table centre (S5 X and Z) under Table, or read it from the control: PARAMETER → MACHINE → ANOTHER (S), address S5.';
  const s5Err = j => ({ err: 'The table centre looks like the number on the parameter screen (0.00001 in): type it in inches, e.g. ' + fmt(num(j.tcX, 0) / 100000) + ' and ' + fmt(num(j.tcZ, 0) / 100000) + '.' });
  add('rotary', {
    sys: 'ren', group: 'Measure', macro: 9818, name: 'Square the B table (set B)', info: 'Turns the table to the index, touches a face twice in Z spread along X, and corrects B so the face is square at that index. Then measures again to check.',
    fields: [F('bi', 'B to measure at', '°', { def: 0, hint: 'The face looks at the spindle here' }), F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Y', 'in', { def: 0 }), F('sz', 'Expected Z of the face', 'in', { def: 0 }),
      F('sp', 'Distance between the touches (X)', 'in', { def: 4 }), F('app', 'Start this far above it', 'in', { def: 0.25 }),
      F('target', 'Set', '', { kind: 'seg', def: 'wcs', opts: [['wcs', 'Work offset B'], ['wpc', 'Mazatrol WPC B']] }),
      F('dir', 'Correction direction', '', { kind: 'seg', def: '+', opts: [['+', '+ (as the macro)'], ['-', '− (reversed)']], hint: 'Not proven on a machine yet: if the check stops with ANGLE OUT OF TOLERANCE, flip this' }),
      F('verify', 'Measure again afterwards to check', '', { kind: 'chk', def: true }),
      F('tolB', 'Check tolerance ±', '°', { def: 0.01, show: o => o.verify })],
    opt: 'QW',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.sz, 0) + Math.abs(num(o.app, 0.25)), down: true }),
    args: o => [['K', 2], ['X', num(o.sp, 4)], ['Z', num(o.sz, 0)]],
    // its own moves: the probe goes to Z home before the table turns
    emit: (o, j, x) => {
      const st = CYC.rotary.start(o, j), call = extra => 'G65 P9818 ' + argStr(CYC.rotary.args(o).concat(extra, optPairs(CYC.rotary, o, j)));
      const go = () => turnTo(x, fmt(num(o.bi, 0)), fmt(st.x), fmt(st.y), fmt(st.z));
      go();
      const minus = o.dir === '-', wpc = o.target === 'wpc';
      if (!wpc && !minus) x.L.push(call([['S', sValue(j.wcs)]]));
      else {
        x.L.push(call([]));
        if (wpc) x.L.push('G65 P9733 B[#5344' + (minus ? '-' : '+') + '#144] ' + x.cm('WPC B'));
        else { const v = bVar(j.wcs); x.L.push('#' + v + '=#' + v + (minus ? '-' : '+') + '#144 ' + x.cm(wcsCode(j.wcs) + ' B')); }
      }
      x.L.push('G65 P9810 Z' + fmt(x.cz));
      if (o.verify) { x.L.push(x.cm('CHECK: STOPS IF B IS STILL OUT')); go(); x.L.push(call([['B', Math.abs(num(o.tolB, 0.01))]])); x.L.push('G65 P9810 Z' + fmt(x.cz)); }
      return 'home';
    },
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), h = num(o.sp, 4) / 2; return { pts: [[x - h, y, 'Z1'], [x + h, y, 'Z2']], lines: [[x - h, y, x + h, y]] }; },
    check: (o, job) => { const e = [];
      if (!(num(o.sp, 4) > 0)) e.push({ err: 'The distance between the touches must be more than 0.' });
      if (o.target !== 'wpc' && bVar(job.wcs) === null) e.push({ err: 'Run the program in G54–G59 or G54.1 to set the work offset\'s B.' });
      if (o.verify && !(Math.abs(num(o.tolB, 0.01)) > 0)) e.push({ err: 'Give the check tolerance.' });
      if (o.target === 'wpc') e.push({ warn: 'Mazatrol WPC B is only written when this runs from the Mazatrol program\'s SUB PRO unit (MEASURE MACRO), after the part\'s WPC unit.' });
      e.push({ warn: 'The table turns to B' + fmt(num(o.bi, 0)) + ' with the probe at Z home: fixtures must clear there. Which way 9818\'s correction goes is not proven on a machine' + (o.verify ? ': the check run stops with ANGLE OUT OF TOLERANCE if B is still out (then flip the direction).' : ': turn the check run on.') });
      return e; },
  });
  const centreOpts = [['typed', 'S5 as typed (Table)'], ['measured', 'The last measured one']];
  add('side180', {
    sys: 'ren', group: 'Other side (180°)', macro: null, name: 'Set the side 180° away', info: 'From this side\'s work zero (set or probed before this) and the table centre, works out the zero of the side 180° away and writes it: no need to probe that side.',
    fields: [F('dx', 'X distance to the other side\'s zero', 'in', { def: 0, hint: 'Measured on the part, in this side\'s X' }), F('dy', 'Y distance', 'in', { def: 0 }),
      F('dz', 'Z distance', 'in', { def: 0, hint: 'In this side\'s Z: a part 3 thick with both zeros on its faces is −3' }),
      F('target', 'Set', '', { kind: 'seg', def: 'wcs', opts: [['wcs', 'EIA work offset'], ['wpc', 'Mazatrol WPC']] }),
      F('to', 'Write the other side into', '', { kind: 'wcsonly', def: 'G55', show: o => o.target !== 'wpc' }),
      F('cfrom', 'Table centre', '', { kind: 'sel', def: 'typed', opts: centreOpts })],
    opt: '', noMove: true,
    start: () => null,
    emit: (o, j, x) => {
      const b = base(j), src = o.target === 'wpc' ? 'WPC' : j.wcs, s = offX(src);
      const t = o.target === 'wpc' ? b : offX(o.to);
      const cx = o.cfrom === 'measured' ? '#' + (b + 4) : cX(j), cz = o.cfrom === 'measured' ? '#' + (b + 5) : cZ(j);
      const plus = (v, d) => (num(d, 0) === 0 ? '#' + v : '[#' + v + (num(d, 0) < 0 ? '-' : '+') + fmt(Math.abs(num(d, 0))) + ']');
      const n = 9100 + x.i;
      x.L.push(x.cm(o.target === 'wpc' ? 'KEPT IN #' + b + '-#' + (b + 3) + ' FOR ' + j.name + '-180' : wcsCode(o.to) + ' = ' + wcsCode(j.wcs) + ' TURNED 180 ABOUT THE TABLE CENTRE'));
      // EIA: the external offset moves both sides too, so it comes off twice (the WPC has none)
      const e = o.target === 'wpc' ? ['', ''] : ['-2*#5201', '-2*#5203'];
      x.L.push('#' + t + '=2*' + cx + '-' + plus(s, o.dx) + e[0], '#' + (t + 1) + '=' + plus(s + 1, o.dy).replace(/^\[(.*)\]$/, '$1'), '#' + (t + 2) + '=2*' + cz + '-' + plus(s + 2, o.dz) + e[1]);
      x.L.push('#' + (t + 3) + '=#' + (s + 3) + '+180.', 'IF[#' + (t + 3) + 'LT360.]GOTO' + n, '#' + (t + 3) + '=#' + (t + 3) + '-360.', 'N' + n);
    },
    geo: o => ({ pts: [[0, 0, 'this side 0'], [num(o.dx, 0), num(o.dy, 0), 'other side 0']], lines: [[0, 0, num(o.dx, 0), num(o.dy, 0)]] }),
    check: (o, job) => { const e = [];
      if (o.cfrom !== 'measured' && !fromCtl(job) && !typedOk(job)) e.push({ err: NEED_S5 });
      else if (o.cfrom !== 'measured' && !fromCtl(job) && s5Raw(job)) e.push(s5Err(job));
      if (o.cfrom === 'measured' && !(job.ops || []).some(p => p.type === 'centre180')) e.push({ warn: 'Uses the centre a "Find the table centre" run left in #' + (base(job) + 4) + ' and #' + (base(job) + 5) + '.' });
      if (o.target !== 'wpc') { if (offX(o.to) === null) e.push({ err: 'Pick the work offset for the other side.' }); else if (o.to === job.wcs) e.push({ err: 'The other side needs its own work offset, not ' + wcsCode(job.wcs) + '.' }); }
      else { e.push({ warn: 'Put the Mazatrol program\'s first SUB PRO after this side\'s WPC (and MMS) units, and its WPC + second SUB PRO (' + job.name + '-180) where the other side starts.' });
        if (String(job.name || '').length > 28) e.push({ err: 'Program name: 28 characters at most (the second program adds -180).' }); }
      e.push({ warn: 'Prove the first part: probe the other side once and compare it with what this writes.' });
      return e; },
  });
  add('centre180', {
    sys: 'ren', group: 'Other side (180°)', macro: null, name: 'Find the table centre', info: 'Probes a block of known thickness: its face and X centre at B, then the opposite face and X centre at B+180. The table centre goes to two variables and shows in a message; compare it with S5.',
    fields: [F('bi', 'B to start at', '°', { def: 0 }), F('x', 'Block centre X', 'in', { def: 0 }), F('y', 'Y to probe at', 'in', { def: 0 }), F('zf', 'Expected Z of the face', 'in', { def: 0 }),
      F('w', 'Block width (X)', 'in', { def: 2 }), F('t', 'Block thickness (Z, face to face)', 'in', { def: 3, hint: 'Measured: the centre\'s Z is only as good as this' }),
      F('dep', 'Probe the sides this far below the face', 'in', { def: 0.25 }), F('app', 'Start this far off the face', 'in', { def: 0.25 }),
      F('target', 'Offsets in use', '', { kind: 'seg', def: 'wcs', opts: [['wcs', 'The job\'s work offset'], ['wpc', 'Mazatrol WPC']] })],
    opt: '', noMove: true,
    start: () => null,
    emit: (o, j, x) => {
      const b = base(j), s = offX(o.target === 'wpc' ? 'WPC' : j.wcs);
      // the work offset plus (for EIA) the external offset: machine = work + these
      const sx = o.target === 'wpc' ? '#' + s : '[#' + s + '+#5201]', sz = o.target === 'wpc' ? '#' + (s + 2) : '[#' + (s + 2) + '+#5203]';
      const zf = num(o.zf, 0), dep = Math.abs(num(o.dep, 0.25)), app = Math.abs(num(o.app, 0.25)), T = Math.abs(num(o.t, 3)), W = Math.abs(num(o.w, 2));
      const A = num(o.bi, 0), B2 = (A + 180) % 360;
      x.L.push(x.cm('SIDE A AT B' + fmt(A)));
      turnTo(x, fmt(A), fmt(num(o.x, 0)), fmt(num(o.y, 0)), fmt(zf + app));
      x.L.push('G65 P9811 Z' + fmt(zf), '#' + (b + 6) + '=#137+' + sz + ' ' + x.cm('FACE A, MACHINE Z'), 'G65 P9810 Z' + fmt(zf + app));
      x.L.push('G65 P9812 X' + fmt(W) + ' Z' + fmt(zf - dep), '#' + (b + 7) + '=#135+' + sx + ' ' + x.cm('CENTRE A, MACHINE X'), 'G65 P9810 Z' + fmt(x.cz));
      // where side B should be, in the same work coordinates, from the typed centre
      x.L.push('#' + (b + 8) + '=2*' + cX(j) + '-#' + (b + 7) + '-' + sx + ' ' + x.cm('B: X EXPECTED'), '#' + (b + 9) + '=2*' + cZ(j) + '+' + fmt(T) + '-#' + (b + 6) + '-' + sz + ' ' + x.cm('B: FACE Z EXPECTED'));
      x.L.push(x.cm('SIDE B AT B' + fmt(B2)));
      turnTo(x, fmt(B2), '#' + (b + 8), fmt(num(o.y, 0)), '[#' + (b + 9) + '+' + fmt(app) + ']');
      x.L.push('G65 P9811 Z#' + (b + 9), '#' + (b + 5) + '=[#' + (b + 6) + '+#137+' + sz + '-' + fmt(T) + ']/2 ' + x.cm('TABLE CENTRE Z'), 'G65 P9810 Z[#' + (b + 9) + '+' + fmt(app) + ']');
      x.L.push('G65 P9812 X' + fmt(W) + ' Z[#' + (b + 9) + '-' + fmt(dep) + ']', '#' + (b + 4) + '=[#' + (b + 7) + '+#135+' + sx + ']/2 ' + x.cm('TABLE CENTRE X'), 'G65 P9810 Z' + fmt(x.cz));
      x.L.push('#3006=1(TABLE CENTRE IN #' + (b + 4) + ' X #' + (b + 5) + ' Z)');
      return 'home';
    },
    geo: o => { const x = num(o.x, 0), y = num(o.y, 0), h = num(o.w, 2) / 2; return { rects: [[x - h, y - 0.6, x + h, y + 0.6]], touch: [[x - h, y, 1, 0], [x + h, y, -1, 0]], pts: [[x, y, 'face']] }; },
    check: (o, job) => { const e = [];
      if (!fromCtl(job) && !typedOk(job)) e.push({ err: NEED_S5 + ' Side B is found from it (roughly is enough).' });
      else if (!fromCtl(job) && s5Raw(job)) e.push(s5Err(job));
      if (!(num(o.t, 3) > 0) || !(num(o.w, 2) > 0)) e.push({ err: 'The block\'s width and thickness must be more than 0.' });
      if (o.target !== 'wpc' && offX(job.wcs) === null) e.push({ err: 'Run the program in G54–G59 or G54.1.' });
      e.push({ warn: 'The table turns with the probe at Z home: fixtures must clear there. The block must be square (B set) for a good X.' });
      return e; },
  });
  add('trueCentre', {
    sys: 'ren', group: 'Measure', macro: 9800, name: 'Bore centre at 0° and 180°', info: 'Measures a bore twice, with the spindle at 0° and at 180°, and averages: the centre without stylus calibration.',
    fields: [F('x', 'Centre X', 'in', { def: 0 }), F('y', 'Centre Y', 'in', { def: 0 }), levelF, F('d', 'Diameter', 'in', { def: 1 })],
    opt: 'SQ',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['D', num(o.d, 1)]],
    geo: o => ring(o, false),
    check: () => [{ warn: '9800 is not a standard Renishaw cycle: it waits for the probe-ready signal and, if that never comes, carries on without measuring and without an alarm. Watch it touch.' }],
  });
  add('f2fStore', {
    sys: 'ren', group: 'Feature to feature', macro: 9834, name: 'Remember the last feature', info: 'Keeps what the cycle before measured, to compare the next one with it.',
    fields: [], opt: '', noMove: true,
    start: () => null, args: () => [], geo: () => ({}),
  });
  add('f2fComp', {
    sys: 'ren', group: 'Feature to feature', macro: 9834, name: 'Compare with the remembered one', info: 'After measuring a second feature: the distance between the two against what it should be.',
    fields: [F('mode', 'Distance as', '', { kind: 'seg', def: 'xy', opts: [['xy', 'X / Y'], ['polar', 'Angle + length'], ['z', 'Z']] }),
      F('dx', 'X distance', 'in', { show: o => o.mode === 'xy' || !o.mode, hint: 'Second feature minus the first. Blank = not checked' }), F('dy', 'Y distance', 'in', { show: o => o.mode === 'xy' || !o.mode }),
      F('a', 'Angle', '°', { def: 0, show: o => o.mode === 'polar' }), F('dist', 'Length', 'in', { def: 1, show: o => o.mode === 'polar' }), F('dz', 'Z distance', 'in', { def: 0, show: o => o.mode === 'z' })],
    opt: 'SHMUTVEBW', noMove: true,
    start: () => null,
    args: o => o.mode === 'polar' ? [['A', num(o.a, 0)], ['D', num(o.dist, 1)]] : o.mode === 'z' ? [['Z', num(o.dz, 0)]] : [has(o.dx) ? ['X', num(o.dx)] : null, has(o.dy) ? ['Y', num(o.dy)] : null],
    geo: () => ({}),
    check: (o, job, i) => { const e = []; if ((o.mode === 'xy' || !o.mode) && !has(o.dx) && !has(o.dy)) e.push({ err: 'Give the X or the Y distance (or both).' });
      if (purposeOf(o) === 'adjust' && o.mode !== 'z' && (o.mode === 'polar' || (has(o.dx) && has(o.dy)))) e.push({ err: 'A tool can only be updated from one axis or Z.' });
      const before = (job.ops || []).slice(0, i).map(p => p.type); if (!before.includes('f2fStore')) e.push({ err: 'Put "Remember the last feature" after the first feature, before this.' }); return e; },
  });
  add('average', {
    sys: 'ren', group: 'Tool offsets', macro: 9835, name: 'Averaged tool update', info: 'Right after a measuring cycle run without a tool: updates the tool from the average of several parts.',
    fields: [F('tool', 'Tool to update', '', { kind: 'text', def: '', hint: 'Number and suffix, e.g. 12A' }), F('store', 'Spare offset No. to keep the sum in', '', { def: 90, hint: 'Uses it and the next one' }),
      F('n', 'Parts to average', '', { def: 3 }), F('len', 'Update', '', { kind: 'seg', def: 'dia', opts: [['dia', 'Diameter'], ['len', 'Length']] })],
    opt: 'VF', noMove: true,
    start: () => null,
    args: o => [['M', num(o.store, 90)], ['T', toolCode(o.tool)], ['C', Math.max(1, Math.round(num(o.n, 3)))], o.len === 'len' ? ['Z', 0] : null],
    geo: () => ({}),
    check: (o, job, i) => { const e = []; if (toolCode(o.tool) === null) e.push({ err: 'Give the tool to update, e.g. 12A.' });
      e.push({ warn: 'The sum is kept in spare offsets ' + num(o.store, 90) + ' and ' + (num(o.store, 90) + 1) + ' (#' + (2000 + num(o.store, 90)) + '): check they are free on this machine.' });
      const prev = (job.ops || [])[i - 1]; if (!prev || !CYC[prev.type] || CYC[prev.type].noMove) e.push({ err: 'Put it straight after the measuring cycle it averages.' }); else if (purposeOf(prev) === 'adjust') e.push({ err: 'The cycle before must not adjust a tool itself.' }); return e; },
  });
  add('move', {
    sys: 'ren', group: 'Move', macro: 9810, name: 'Protected move', info: 'Moves the probe; if it touches anything on the way it stops with PATH OBSTRUCTED.',
    fields: [F('mx', 'X', 'in'), F('my', 'Y', 'in'), F('mz', 'Z', 'in'), F('feed', 'Feed', 'ipm', { hint: 'Blank = the macro\'s fast feed' })],
    opt: '', noMove: true,
    start: () => null,
    args: o => [has(o.mx) ? ['X', num(o.mx)] : null, has(o.my) ? ['Y', num(o.my)] : null, has(o.mz) ? ['Z', num(o.mz)] : null, has(o.feed) ? ['F', num(o.feed)] : null],
    geo: o => (has(o.mx) && has(o.my) ? { pts: [[num(o.mx), num(o.my), 'move']] } : {}),
    check: o => (!has(o.mx) && !has(o.my) && !has(o.mz) ? [{ err: 'Give X, Y or Z.' }] : []),
  });
  // calibration (9801)
  const ballF = F('ball', 'Stylus ball diameter', 'in', { def: 0.236, hint: '6 mm = 0.2362' });
  const probeT = F('ptool', 'Probe in TOOL DATA', '', { kind: 'text', def: '', hint: 'Number and suffix, e.g. 1A. Blank = the probe tool set for the job' });
  add('calRing', {
    sys: 'ren', group: 'Calibrate', macro: 9801, name: 'Stylus in a ring gauge', info: 'XY stylus offsets and radii in a ring gauge (or a bored hole).',
    fields: [F('x', 'Ring centre X', 'in', { def: 0 }), F('y', 'Ring centre Y', 'in', { def: 0 }), F('z', 'Probing Z', 'in', { def: -0.25 }), F('d', 'Ring diameter', 'in', { def: 2 }), ballF,
      F('k', 'Calibrate', '', { kind: 'sel', def: '4', opts: [['4', 'Offsets, radii and vector radii (K4)'], ['3', 'Offsets and radii (K3)'], ['2', 'Offsets only (K2)'], ['-3', 'Radii only (K−3)'], ['-4', 'Radii and vector radii (K−4)']] }),
      F('m180', 'Find the true centre first (0° and 180°)', '', { kind: 'chk', def: true, hint: 'Then the ring does not need centring by hand' }),
      F('copyL', 'Copy offsets and radii to Mazatrol L1–L4', '', { kind: 'chk', def: true, hint: 'So MMS units use the same calibration' })],
    opt: 'Q',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['K', +o.k || 4], ['D', num(o.d, 2)], ['B', num(o.ball, 0.236)], o.m180 ? ['M', 180] : null],
    after: o => (o.copyL && +o.k !== 2 ? ['#5501=#502/25.4 (L1 X OFFSET)', '#5502=#503/25.4 (L2 Y OFFSET)', '#5503=#500/25.4 (L3 X RADIUS)', '#5504=#501/25.4 (L4 Y RADIUS)'] : []),
    geo: o => ring(o, false),
    check: o => (+o.k === 4 || +o.k === -4 ? [{ warn: 'Vector radii are stored in #510–#517. Mazak\'s MMS EIA macros read #510 as their own flag: do not run those macros with H0 after this.' }] : []),
  });
  add('calLen', {
    sys: 'ren', group: 'Calibrate', macro: 9801, name: 'Probe length on a Z face', info: 'Touches a face of known Z (a gauge block, the pallet) and sets the probe\'s length in TOOL DATA.',
    fields: [...XY, F('sz', 'Z of the face', 'in', { def: 0, hint: 'Usually 0: Z0 set on the face with a known tool' }), F('app', 'Start this far above it', 'in', { def: 0.25 }), ballF, probeT],
    opt: 'Q',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.sz, 0) + Math.abs(num(o.app, 0.25)), down: true }),
    args: (o, job) => [['K', 1], ['Z', num(o.sz, 0)], ['B', num(o.ball, 0.236)], ['T', toolCode(o.ptool) !== null ? toolCode(o.ptool) : jobProbeT(job)]],
    geo: o => ({ pts: [[num(o.x, 0), num(o.y, 0), 'Z' + fmt(num(o.sz, 0))]] }),
    check: (o, job) => ((toolCode(o.ptool) === null && jobProbeT(job) === null) ? [{ err: 'Give the probe\'s tool number (here or in Probe).' }] : []),
  });
  add('calBall', {
    sys: 'ren', group: 'Calibrate', macro: 9801, name: 'Everything on a sphere', info: 'Length, offsets, radii and vector radii on a calibration ball (K5).',
    fields: [F('x', 'Ball centre X', 'in', { def: 0 }), F('y', 'Ball centre Y', 'in', { def: 0 }), F('sz', 'Ball centre Z', 'in', { def: 0 }), F('d', 'Ball diameter', 'in', { def: 1 }), ballF, probeT,
      F('m180', 'Find the true centre first (0° and 180°)', '', { kind: 'chk', def: true }),
      F('copyL', 'Copy offsets and radii to Mazatrol L1–L4', '', { kind: 'chk', def: true })],
    opt: 'Q',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.sz, 0) + num(o.d, 1) / 2 + 0.25, down: true }),
    args: (o, job) => [['K', 5], ['Z', num(o.sz, 0)], ['D', num(o.d, 1)], ['B', num(o.ball, 0.236)], ['T', toolCode(o.ptool) !== null ? toolCode(o.ptool) : jobProbeT(job)], o.m180 ? ['M', 180] : null],
    after: o => (o.copyL ? ['#5501=#502/25.4 (L1 X OFFSET)', '#5502=#503/25.4 (L2 Y OFFSET)', '#5503=#500/25.4 (L3 X RADIUS)', '#5504=#501/25.4 (L4 Y RADIUS)'] : []),
    geo: o => ({ circles: [[num(o.x, 0), num(o.y, 0), num(o.d, 1) / 2]] }),
    check: (o, job) => [...((toolCode(o.ptool) === null && jobProbeT(job) === null) ? [{ err: 'Give the probe\'s tool number (here or in Probe).' }] : []),
      { warn: 'Vector radii are stored in #510–#517. Mazak\'s MMS EIA macros read #510 as their own flag: do not run those macros with H0 after this.' }],
  });
  add('calCentre', {
    sys: 'ren', group: 'Calibrate', macro: 9801, name: 'Find a ring\'s true centre', info: 'Measures at 0° and 180° and finds the centre (K0); can set a work offset there.',
    fields: [F('x', 'Ring centre X', 'in', { def: 0 }), F('y', 'Ring centre Y', 'in', { def: 0 }), F('z', 'Probing Z', 'in', { def: -0.25 }), F('d', 'Ring diameter', 'in', { def: 2 }), ballF],
    opt: 'Q',
    start: o => ({ x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), down: true }),
    args: o => [['K', 0], ['D', num(o.d, 2)], ['B', num(o.ball, 0.236)], ['M', 180]],
    geo: o => ring(o, false),
    check: () => [{ warn: 'K0 clears the stored stylus offsets (#502, #503): calibrate them again afterwards.' }],
  });

  // --- Mazatrol MMS unit lines (fields as on the screen: X Y Z start, R, D/L, K)
  const mmsXYZ = [F('x', 'Start X', 'in', { def: 0 }), F('y', 'Start Y', 'in', { def: 0 }), F('z', 'Start Z', 'in', { def: -0.25 })];
  const kF = F('k', 'K: skip feed distance', 'in', { def: 0.3, hint: 'Travel at the touch feed' });
  const mm = (id, ptn, name, info, fields, mms, geo, check) => add(id, { sys: 'mms', group: 'MMS unit', ptn, name, info, fields, mms, geo, check: check || (() => []) });
  mm('mXF', 'X-FACE', 'X face', 'Sets WPC X so the face is at R.', [...mmsXYZ, F('r', 'R: X of the face', 'in', { def: 0.5, hint: 'The probe moves toward it from the start' })],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), R: num(o.r, 0.5) }),
    o => ({ lines: [[num(o.r, 0.5), num(o.y, 0) - 0.8, num(o.r, 0.5), num(o.y, 0) + 0.8]], touch: [[num(o.r, 0.5), num(o.y, 0), Math.sign(num(o.r, 0.5) - num(o.x, 0)) || 1, 0]], start: [num(o.x, 0), num(o.y, 0)] }),
    o => (num(o.r, 0.5) === num(o.x, 0) ? [{ err: 'The start X must be off the face.' }] : []));
  mm('mYF', 'Y-FACE', 'Y face', 'Sets WPC Y so the face is at R.', [...mmsXYZ, F('r', 'R: Y of the face', 'in', { def: 0.5 })],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), R: num(o.r, 0.5) }),
    o => ({ lines: [[num(o.x, 0) - 0.8, num(o.r, 0.5), num(o.x, 0) + 0.8, num(o.r, 0.5)]], touch: [[num(o.x, 0), num(o.r, 0.5), 0, Math.sign(num(o.r, 0.5) - num(o.y, 0)) || 1]], start: [num(o.x, 0), num(o.y, 0)] }),
    o => (num(o.r, 0.5) === num(o.y, 0) ? [{ err: 'The start Y must be off the face.' }] : []));
  mm('mZF', 'Z-FACE', 'Z face', 'Sets WPC Z so the face is at R.', [F('x', 'Start X', 'in', { def: 0 }), F('y', 'Start Y', 'in', { def: 0 }), F('z', 'Start Z', 'in', { def: 0.25, hint: 'Above the face' }), F('r', 'R: Z of the face', 'in', { def: 0 })],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0.25), R: num(o.r, 0) }),
    o => ({ pts: [[num(o.x, 0), num(o.y, 0), 'Z' + fmt(num(o.r, 0))]] }),
    o => (num(o.z, 0.25) <= num(o.r, 0) ? [{ err: 'Start Z must be above the face.' }] : []));
  const mmsPair = (ax, ext) => o => { const x = num(o.x, 0), y = num(o.y, 0), h = num(o.w, 1) / 2, s = ext ? -1 : 1;
    return ax === 'X' ? { [ext ? 'rects' : 'lines']: ext ? [[x - h, y - 0.6, x + h, y + 0.6]] : [[x - h, y - 0.6, x - h, y + 0.6], [x + h, y - 0.6, x + h, y + 0.6]], touch: [[x - h, y, -s, 0], [x + h, y, s, 0]] }
      : { [ext ? 'rects' : 'lines']: ext ? [[x - 0.6, y - h, x + 0.6, y + h]] : [[x - 0.6, y - h, x + 0.6, y - h], [x - 0.6, y + h, x + 0.6, y + h]], touch: [[x, y - h, 0, -s], [x, y + h, 0, s]] }; };
  const wF = F('w', 'D/L: width', 'in', { def: 1 });
  mm('mXG', 'X-GRV', 'X groove', 'Sets WPC X so the groove\'s centre is at X.', [F('x', 'X: groove centre', 'in', { def: 0 }), F('y', 'Start Y', 'in', { def: 0 }), F('z', 'Start Z', 'in', { def: -0.25 }), wF, kF],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), 'D/L': num(o.w, 1), K: num(o.k, 0.3) }), mmsPair('X', false));
  mm('mYG', 'Y-GRV', 'Y groove', 'Sets WPC Y so the groove\'s centre is at Y.', [F('x', 'Start X', 'in', { def: 0 }), F('y', 'Y: groove centre', 'in', { def: 0 }), F('z', 'Start Z', 'in', { def: -0.25 }), wF, kF],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), 'D/L': num(o.w, 1), K: num(o.k, 0.3) }), mmsPair('Y', false));
  mm('mXS', 'X-STP', 'X step (projection)', 'Sets WPC X so the projection\'s centre is at X.', [F('x', 'X: projection centre', 'in', { def: 0 }), F('y', 'Start Y', 'in', { def: 0 }), F('z', 'Probing Z', 'in', { def: -0.25 }), wF, kF],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), 'D/L': num(o.w, 1), K: num(o.k, 0.3) }), mmsPair('X', true));
  mm('mYS', 'Y-STP', 'Y step (projection)', 'Sets WPC Y so the projection\'s centre is at Y.', [F('x', 'Start X', 'in', { def: 0 }), F('y', 'Y: projection centre', 'in', { def: 0 }), F('z', 'Probing Z', 'in', { def: -0.25 }), wF, kF],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), 'D/L': num(o.w, 1), K: num(o.k, 0.3) }), mmsPair('Y', true));
  mm('mBore', 'BORE-XY', 'Bore', 'Sets WPC X and Y so the bore\'s centre is at X, Y.', [F('x', 'X: bore centre', 'in', { def: 0 }), F('y', 'Y: bore centre', 'in', { def: 0 }), F('z', 'Probing Z', 'in', { def: -0.25 }), F('d', 'D/L: diameter', 'in', { def: 1 }), kF],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), 'D/L': num(o.d, 1), K: num(o.k, 0.3) }), o => ring(o, false));
  mm('mBoss', 'XY-BOS', 'Boss', 'Sets WPC X and Y so the boss\'s centre is at X, Y.', [F('x', 'X: boss centre', 'in', { def: 0 }), F('y', 'Y: boss centre', 'in', { def: 0 }), F('z', 'Probing Z', 'in', { def: -0.25 }), F('d', 'D/L: diameter', 'in', { def: 1 }), kF],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), 'D/L': num(o.d, 1), K: num(o.k, 0.3) }), o => ring(o, true));
  mm('mCnr', 'XYA-CNR', 'Corner + angle (XYθ)', 'Sets WPC X, Y and θ from a corner: two touches on one face, one on the other.', [F('x', 'Start X', 'in', { def: 0.5 }), F('y', 'Start Y', 'in', { def: 0.5 }), F('z', 'Probing Z', 'in', { def: -0.25 }), F('r', 'R: distance P1 to P2', 'in', { def: 2, hint: 'Its sign and the start\'s quadrant set the directions (manual 7-15-6)' })],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), R: num(o.r, 2) }),
    o => ({ lines: [[0, 0, 3 * Math.sign(num(o.x, 0.5) || 1), 0], [0, 0, 0, 3 * Math.sign(num(o.y, 0.5) || 1)]], pts: [[num(o.x, 0.5), num(o.y, 0.5), 'start']] }),
    () => [{ warn: 'Check the touch directions for XYA-CNR on the machine\'s MMS screen help: they follow the start quadrant and the sign of R.' }]);
  mm('mCal', 'CAL', 'Calibrate (master hole)', 'Calibrates the probe in a master hole: the corrections go to parameters L1–L4.', [F('x', 'X: hole centre', 'in', { def: 0 }), F('y', 'Y: hole centre', 'in', { def: 0 }), F('z', 'Probing Z', 'in', { def: -0.25 }), F('d', 'D/L: hole diameter', 'in', { def: 2 }), kF],
    o => ({ X: num(o.x, 0), Y: num(o.y, 0), Z: num(o.z, 0), 'D/L': num(o.d, 2), K: num(o.k, 0.3) }), o => ring(o, false));

  // --- Mazak MMS EIA macros (from machine zero; X, Y machine coordinates)
  const mX = F('x', 'X (machine)', 'in', { def: -10, hint: 'From machine zero: negative' }), mY = F('y', 'Y (machine)', 'in', { def: -10 });
  const mQ = F('q', 'Q: stylus infeed below Z0', 'in', { def: -0.25, hint: 'Negative' }), mR = F('r', 'R: initial point above Z0', 'in', { def: 1 });
  const me = (id, macro, name, info, fields, args, geo, check) => add(id, { sys: 'mmseia', group: 'Mazak MMS (EIA)', macro, name, info, fields, args, geo, check: check || (() => []) });
  const travel = (k, ax) => F(k, (k === 'i' ? 'I' : 'J') + ': travel (sign = direction)', 'in', { def: 0.5, hint: 'The probe moves up to twice this along ' + ax });
  me('e9010', 9010, 'Calibrate in a master hole', 'Stylus eccentricity and radii (#550–#554).', [mX, mY, mQ, mR, F('d', 'D: measured hole diameter', 'in', { def: 2 })],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['D', num(o.d)], ['K', 0.08]], o => ring({ x: num(o.x), y: num(o.y), d: num(o.d) }, false));
  me('e9011', 9011, 'X surface', 'Sets the work offset\'s X from a face.', [mX, mY, mQ, mR, travel('i', 'X'), F('sh', 'A: X of the face in the work system', 'in', { hint: 'Blank = the face is X0' })],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['I', num(o.i)], has(o.sh) ? ['A', num(o.sh)] : null], o => ({ touch: [[num(o.x) + num(o.i), num(o.y), Math.sign(num(o.i)) || 1, 0]], start: [num(o.x), num(o.y)] }));
  me('e9012', 9012, 'Y surface', 'Sets the work offset\'s Y from a face.', [mX, mY, mQ, mR, travel('j', 'Y'), F('sh', 'B: Y of the face in the work system', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['J', num(o.j)], has(o.sh) ? ['B', num(o.sh)] : null], o => ({ touch: [[num(o.x), num(o.y) + num(o.j), 0, Math.sign(num(o.j)) || 1]], start: [num(o.x), num(o.y)] }));
  me('e9013', 9013, 'Hole centre', 'Sets the work offset\'s X and Y on a hole\'s centre.', [mX, mY, mQ, mR, F('d', 'D: hole diameter', 'in', { def: 1 }), F('k', 'K: measuring travel', 'in', { def: 0.3, hint: '0.2–0.4' }), F('ax', 'A: X shift', 'in'), F('by', 'B: Y shift', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['D', num(o.d)], ['K', num(o.k)], has(o.ax) ? ['A', num(o.ax)] : null, has(o.by) ? ['B', num(o.by)] : null], o => ring({ x: num(o.x), y: num(o.y), d: num(o.d) }, false),
    o => (num(o.k) < 0.2 || num(o.k) > 0.4 ? [{ err: 'K must be 0.2–0.4.' }] : []));
  me('e9014', 9014, 'Z surface', 'Sets the work offset\'s Z from a face.', [mX, mY, mR, F('k', 'K: measuring travel', 'in', { def: 0.3, hint: '0.2–0.4' }), F('cz', 'C: Z of the face in the work system', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['R', num(o.r)], ['K', num(o.k)], has(o.cz) ? ['C', num(o.cz)] : null], o => ({ pts: [[num(o.x), num(o.y), 'Z']] }),
    o => (num(o.k) < 0.2 || num(o.k) > 0.4 ? [{ err: 'K must be 0.2–0.4.' }] : []));
  me('e9015', 9015, 'X groove', 'Sets X on a groove\'s centre.', [mX, mY, mQ, mR, F('i', 'I: travel', 'in', { def: 0.3 }), F('k', 'K: groove width', 'in', { def: 1 }), F('sh', 'A: shift to X0', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['I', num(o.i)], ['K', num(o.k)], has(o.sh) ? ['A', num(o.sh)] : null], o => mmsPair('X', false)({ x: num(o.x), y: num(o.y), w: num(o.k) }),
    o => (!(num(o.k) > num(o.i) && num(o.i) > 0) ? [{ err: 'Needs width K > travel I > 0.' }] : []));
  me('e9016', 9016, 'Y groove', 'Sets Y on a groove\'s centre.', [mX, mY, mQ, mR, F('j', 'J: travel', 'in', { def: 0.3 }), F('k', 'K: groove width', 'in', { def: 1 }), F('sh', 'B: shift to Y0', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['J', num(o.j)], ['K', num(o.k)], has(o.sh) ? ['B', num(o.sh)] : null], o => mmsPair('Y', false)({ x: num(o.x), y: num(o.y), w: num(o.k) }),
    (o, job) => [...(!(num(o.k) > num(o.j) && num(o.j) > 0) ? [{ err: 'Needs width K > travel J > 0.' }] : []), ...(job.mmsPrint ? [{ err: '9016 with printing on loops for ever in inch (a bug in the macro): turn printing off.' }] : [])]);
  me('e9017', 9017, 'X projection', 'Sets X on a projection\'s centre.', [mX, mY, mQ, mR, F('i', 'I: travel', 'in', { def: 0.3 }), F('k', 'K: projection width', 'in', { def: 1 }), F('sh', 'A: shift to X0', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['I', num(o.i)], ['K', num(o.k)], has(o.sh) ? ['A', num(o.sh)] : null], o => mmsPair('X', true)({ x: num(o.x), y: num(o.y), w: num(o.k) }));
  me('e9018', 9018, 'Y projection', 'Sets Y on a projection\'s centre.', [mX, mY, mQ, mR, F('j', 'J: travel', 'in', { def: 0.3 }), F('k', 'K: projection width', 'in', { def: 1 }), F('sh', 'B: shift to Y0', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['J', num(o.j)], ['K', num(o.k)], has(o.sh) ? ['B', num(o.sh)] : null], o => mmsPair('Y', true)({ x: num(o.x), y: num(o.y), w: num(o.k) }));
  me('e9019', 9019, 'Boss centre', 'Sets X and Y on a boss\'s centre.', [mX, mY, mQ, mR, F('d', 'D: boss diameter', 'in', { def: 1 }), F('k', 'K: travel', 'in', { def: 0.3 }), F('ax', 'A: X shift', 'in'), F('by', 'B: Y shift', 'in')],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['K', num(o.k)], ['D', num(o.d)], has(o.ax) ? ['A', num(o.ax)] : null, has(o.by) ? ['B', num(o.by)] : null], o => ring({ x: num(o.x), y: num(o.y), d: num(o.d) }, true),
    o => (!(num(o.d) > num(o.k) && num(o.k) > 0) ? [{ err: 'Needs diameter D > travel K > 0.' }] : []));
  me('e9020', 9020, 'Inclination (angle)', 'Two touches on a face: the angle, kept for G54–G59 in #121–#126.', [mX, mY, mQ, mR, F('pat', 'I: pattern', '', { kind: 'sel', def: '1', opts: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], hint: 'Which face and direction: see the MMS manual, 4-2-10' }), F('ang', 'J: nominal angle', '°', { def: 0 }), F('sp', 'D: distance first to second start', 'in', { def: 2 }), F('k', 'K: travel to the face', 'in', { def: 0.5 })],
    o => [['X', num(o.x)], ['Y', num(o.y)], ['Q', num(o.q)], ['R', num(o.r)], ['I', +o.pat || 1], ['J', num(o.ang)], ['K', num(o.k)], ['D', num(o.sp)]], o => ({ pts: [[num(o.x), num(o.y), 'P1']] }));

  // ------------------------------------------------------------------ helpers
  function ptList(s) {
    return String(s || '').split(/\n|;/).map(l => l.trim()).filter(Boolean).map(l => l.split(/[\s,]+/).map(Number)).filter(p => p.length >= 2 && isFinite(p[0]) && isFinite(p[1]));
  }
  // "12A" / "12" / "12.01" -> 12.01
  function toolCode(s) {
    const t = String(s || '').trim().toUpperCase(); if (!t) return null;
    let m = /^(\d+)\s*([A-Z])?$/.exec(t); if (m) return m[2] ? (SUFFIX.indexOf(m[2]) < 0 ? null : toolT(+m[1], m[2])) : +m[1];
    m = /^(\d+)\.(\d{1,2})$/.exec(t); if (m) return +t;
    return null;
  }
  const jobProbeT = job => (job && has(job.probeNo) ? toolT(num(job.probeNo, 0), job.probeSfx) : null);

  // ------------------------------------------------------------------ inspecting
  // what each operation reports, and which argument carries its size (moved to the middle of the tolerance band)
  // v = the values printed after the cycle: X Y Z (#135-#137) S size (#138) A angle (#139) B (#144) E size error (#143)
  // P true-position error (#145) C metal condition (#146) F flag (#148)
  const SZ = (item, nom, act, o) => ({ item, nom, act, plus: o.tolP, minus: o.tolN });
  const PS = (item, nom, act) => ({ item, nom, act, pos: true });
  const TP = (o, v) => (has(o.tolM) ? [{ item: 'True position Ø', nom: 0, act: 2 * v.P, plus: o.tolM, minus: 0, tp: true }] : []);
  const ANG = (item, nom, act, o) => ({ item, nom, act, plus: o.tolB, minus: o.tolB, deg: true });
  const centre = (o, v) => [PS('Centre X', num(o.x, 0), v.X), PS('Centre Y', num(o.y, 0), v.Y)];
  const INSP = {
    surfX: { arg: 'X', key: 'sx', rows: (o, v) => [SZ('X of the face', num(o.sx, 0), v.S, o)] },
    surfY: { arg: 'Y', key: 'sy', rows: (o, v) => [SZ('Y of the face', num(o.sy, 0), v.S, o)] },
    surfZ: { arg: 'Z', key: 'sz', rows: (o, v) => [SZ('Z of the face', num(o.sz, 0), v.S, o)] },
    pocketX: { arg: 'X', key: 'w', rows: (o, v) => [SZ('Width', num(o.w, 1), v.S, o), PS('Centre X', num(o.x, 0), v.X), ...TP(o, v)] },
    pocketY: { arg: 'Y', key: 'w', rows: (o, v) => [SZ('Width', num(o.w, 1), v.S, o), PS('Centre Y', num(o.y, 0), v.Y), ...TP(o, v)] },
    webX: { arg: 'X', key: 'w', rows: (o, v) => [SZ('Width', num(o.w, 1), v.S, o), PS('Centre X', num(o.x, 0), v.X), ...TP(o, v)] },
    webY: { arg: 'Y', key: 'w', rows: (o, v) => [SZ('Width', num(o.w, 1), v.S, o), PS('Centre Y', num(o.y, 0), v.Y), ...TP(o, v)] },
    bore: { arg: 'D', key: 'd', rows: (o, v) => [SZ('Ø', num(o.d, 1), v.S, o), ...centre(o, v), ...TP(o, v)] },
    boss: { arg: 'D', key: 'd', rows: (o, v) => [SZ('Ø', num(o.d, 1), v.S, o), ...centre(o, v), ...TP(o, v)] },
    bore3: { arg: 'D', key: 'd', rows: (o, v) => [SZ('Ø', num(o.d, 1), v.S, o), ...centre(o, v), ...TP(o, v)] },
    angSurf: { arg: 'D', key: 'dist', rows: (o, v) => [SZ('Distance to the face', num(o.dist, 0.5), v.S, o)] },
    angWeb: { arg: 'D', key: 'w', rows: (o, v) => [SZ('Width', num(o.w, 1), v.S, o), ...centre(o, v), ...TP(o, v)] },
    cornerIn: { rows: (o, v) => [PS('Corner X', num(o.x, 0), v.X), PS('Corner Y', num(o.y, 0), v.Y), ...TP(o, v), ...(has(o.ia) ? [ANG('Y face angle', 0, v.A, o)] : [])] },
    cornerOut: { rows: (o, v) => [PS('Corner X', num(o.x, 0), v.X), PS('Corner Y', num(o.y, 0), v.Y), ...TP(o, v), ...(has(o.ia) ? [ANG('Y face angle', 0, v.A, o)] : [])] },
    rect: { rows: (o, v) => [...centre(o, v), ...TP(o, v), ANG('Skew', 0, v.A, o)] },
    angle: { rows: (o, v) => [ANG('Angle', has(o.a) ? num(o.a) : o.ax === 'Y' ? 0 : 90, v.A, o)] },
    stock: { rows: (o, v) => [{ item: 'Most stock', act: v.B }, { item: 'Least stock', act: v.P }, { item: 'Spread', act: v.C }] },
    pcd: { arg: 'D', key: 'd', rows: (o, v) => [{ item: 'Bolt circle Ø (last hole)', nom: num(o.pcd, 4), act: v.Z }] },
    f2fComp: { rows: (o, v) => o.mode === 'polar' ? [SZ('Distance', num(o.dist, 1), v.S, o)] : o.mode === 'z' ? [SZ('Z distance', num(o.dz, 0), v.Z, o)]
      : [...(has(o.dx) ? [SZ('X distance', num(o.dx), v.X, o)] : []), ...(has(o.dy) ? [SZ('Y distance', num(o.dy), v.Y, o)] : [])] },
  };
  const FLAG = { 1: 'size out of tolerance', 2: 'out of position', 3: 'beyond the upper limit: not adjusted', 4: 'angle out of tolerance', 5: 'diameter offset too large', 6: 'excess stock' };
  // what an operation can be for: set a work offset, inspect, inspect and adjust a tool
  function purposes(c) {
    if (!c || c.sys !== 'ren' || c.noMove && c.id !== 'f2fComp') return [];
    const p = [];
    if (c.opt.includes('S')) p.push('set');
    if (INSP[c.id]) { p.push('inspect'); if (c.opt.includes('T')) p.push('adjust'); }
    return p;
  }
  // an operation's purpose: given, or (jobs saved before purposes) from its fields
  function purposeOf(o) {
    const ps = purposes(CYC[o.type]); if (!ps.length) return null;
    if (ps.includes(o.purpose)) return o.purpose;
    const guess = String(o.tool || '').trim() && ps.includes('adjust') ? 'adjust' : o.upd === 'none' && ps.includes('inspect') ? 'inspect' : ps[0];
    return ps.includes(guess) ? guess : ps[0];
  }
  const PURPOSE_NAMES = { set: 'Set work offset', inspect: 'Inspect', adjust: 'Inspect + adjust tool' };
  // the fields an inspection shows in the main form (they are kept on the operation like the others)
  function inspectFields(o) {
    const pu = purposeOf(o), c = CYC[o.type], I = INSP[o.type]; if (pu !== 'inspect' && pu !== 'adjust') return [];
    const f = [];
    if (I.key || I.rows.length) {
      f.push(F('tolP', '+ tolerance', 'in', { hint: I.key ? 'Above the nominal. Blank = not judged' : 'Blank = not judged' }), F('tolN', '− tolerance', 'in', { hint: 'Below the nominal, as a positive number' }));
    }
    if (c.opt.includes('M') || /centre|Corner/i.test(String(I.rows({ x: 0, y: 0, d: 1, w: 1, pcd: 4 }, {}).map(r => r.item)))) f.push(F('tolM', 'Position zone Ø', 'in', { hint: pu === 'adjust' ? 'Judged in the report only (the macro cannot check position while adjusting a tool)' : 'True position, as a diameter' }));
    if (c.opt.includes('B') || ['angle', 'rect', 'cornerIn', 'cornerOut'].includes(o.type)) f.push(F('tolB', 'Angle tolerance ±', '°'));
    if (pu === 'adjust') f.push(F('tool', 'Tool to adjust', '', { kind: 'text', hint: 'Number and suffix, e.g. 12A: its length (Z) or diameter in TOOL DATA' }),
      F('fb', 'Feedback', '0–1', { hint: 'Part of the error put into the tool. Blank = 0.8' }), F('tolU', 'Don\'t adjust beyond', 'in', { hint: 'Error above this: stop, no adjustment. Blank = 3× the band' }), F('nullV', 'Null band', 'in', { hint: 'No adjustment below this' }));
    return f;
  }
  // the Options letters shown for an operation: the inspection ones move to the main form
  function optLetters(o) {
    const c = CYC[o.type], pu = purposeOf(o); if (!c) return '';
    if (!pu) return c.opt;
    const drop = pu === 'set' ? 'TFVHU' : 'STFVHUMB';
    return c.opt.split('').filter(L => !drop.includes(L)).join('');
  }
  const band = o => (has(o.tolP) || has(o.tolN) ? Math.abs(num(o.tolP, 0)) + Math.abs(num(o.tolN, 0)) : null);
  const inspecting = (o) => { const pu = purposeOf(o); return pu === 'inspect' || pu === 'adjust'; };

  const DEFAULTS = {
    sys: 'ren', name: 'PROBE1', wcs: 'G54', tcFrom: 'typed', tcX: '', tcZ: '', varBase: 950, endCode: 'auto', defPurpose: 'set', stopOOT: true, nthOn: false, nth: 5, probeNo: '', probeSfx: 'A', toolChange: true, dwell: 5, clearZ: 2, moveG0: true, homeEnd: true, g20: true,
    mmsH: 0, mmsM: 54, mmsPrint: false,
    // Mazatrol
    wrap: true, wpcNo: '1', wpcX: 0, wpcY: 0, wpcTh: 0, wpcZ: 0, probeNom: 0.23, initZ: 2,
    ops: [],
  };
  // a new operation with every field at its default
  function newOp(type, purpose) {
    const c = CYC[type]; if (!c) throw new Error('No operation "' + type + '"');
    const o = { type };
    c.fields.forEach(f => { if (f.def !== undefined) o[f.k] = f.def; });
    for (const L of c.opt) { const f = OPT[L]; if (f.def !== undefined) o[f.k] = f.def; }
    const ps = purposes(c);
    if (ps.length) o.purpose = ps.includes(purpose) ? purpose : ps.includes('inspect') && purpose === 'adjust' ? 'inspect' : ps[0];
    if (o.purpose && o.purpose !== 'set') o.upd = 'none';
    return o;
  }
  const list = sys => Object.values(CYC).filter(c => c.sys === sys);

  // the S value for an operation (null = no update)
  function opS(o, job) {
    if (!o.upd || o.upd === 'none') return null;
    return sValue(o.upd === 'active' ? job.wcs : o.upd);
  }

  // ------------------------------------------------------------------ checking
  // an operation that only works when the program runs from a Mazatrol SUB PRO (MEASURE MACRO)
  const usesWpc = job => (job.ops || []).some(o => o.upd === 'WPC' || ((o.type === 'rotary' || o.type === 'side180' || o.type === 'centre180') && o.target === 'wpc'));
  const nthOf = job => (job.nthOn ? Math.max(1, Math.round(num(job.nth, 1))) : 1);
  const endCode = job => (job.endCode === 'M30' || job.endCode === 'M99' ? job.endCode : usesWpc(job) ? 'M99' : 'M30');
  function check(job) {
    const out = [];
    const put = (i, e) => out.push(Object.assign({ op: i }, e));
    const ops = job.ops || [];
    if (!ops.length) put(-1, { err: 'Add an operation.' });
    if (job.sys !== 'mms') {
      if (job.toolChange && !has(job.probeNo)) put(-1, { err: 'Give the probe\'s tool number (Probe).' });
      if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/i.test(job.name || '')) put(-1, { err: 'Program name: letters, digits, - and _ only (up to 32).' });
    }
    if (job.sys === 'ren') {
      if (!sValue(job.wcs) || job.wcs === 'WPC') put(-1, { err: 'Work offset to run in: G54–G59 or G54.1 P1–P300.' });
      const vb = num(job.varBase, 950); if (!(vb >= 100 && vb <= 988 && !(vb + 11 >= 500 && vb <= 559))) put(-1, { err: 'Variables from #: 100–988 (twelve in a row), clear of #500–#559 (probe and MMS data).' });
      if (job.nthOn && !(num(job.nth, 0) >= 2)) put(-1, { err: 'Every Nth part: N must be 2 or more.' });
      if (ops.some(o => CYC[o.type] && inspecting(o))) put(-1, { warn: 'The results go to print.txt on the control (C:\\ymw\\M8Y\\data\\MC_sdg\\print) when data I/O parameter DPR14 = 4. Open that file under Inspection report.' });
    }
    if (job.sys === 'ren' && fromCtl(job) && usesS5(job)) {
      put(-1, { warn: 'S5 is read from #50700 (X) and #50701 (Z): the manual lists them with Dynamic Offsetting II, an option. The program stops with an alarm if they read empty, 0 or in 0.00001 in' + (typedOk(job) ? ', or differ from the typed centre by more than 0.05' : '') + '.' });
      if (typedOk(job) && s5Raw(job)) put(-1, s5Err(job));
    }
    if (job.sys !== 'mms' && usesWpc(job) && endCode(job) === 'M30') put(-1, { err: 'Something here writes the Mazatrol WPC, so the program runs from a SUB PRO: end it with M99, not M30.' });
    if (job.sys === 'mmseia') {
      put(-1, { warn: 'Mazak\'s MMS EIA macros (9010–9045) must be in the control\'s programs: load them before running this.' });
      if (+job.mmsH === 0) put(-1, { warn: 'H0 = the probe\'s length from TOOL DATA, which these macros only use when #510 = 1. A Renishaw vector calibration also writes #510: check it, or give the probe\'s H number.' });
      if (!(+job.mmsM >= 54 && +job.mmsM <= 59)) put(-1, { err: 'MMS macros update G54–G59 only (M54–M59).' });
    }
    ops.forEach((o, i) => {
      const c = CYC[o.type];
      if (!c) { put(i, { err: 'Unknown operation ' + o.type }); return; }
      if (c.sys !== job.sys) { put(i, { err: c.name + ' belongs to another kind of program.' }); return; }
      for (const f of c.fields) {
        if ((f.kind || 'num') !== 'num' || (f.show && !f.show(o))) continue;
        if (f.def !== undefined && !has(o[f.k])) put(i, { err: f.label + ' is missing.' });
        else if (has(o[f.k]) === false && o[f.k] !== '' && o[f.k] !== undefined) put(i, { err: f.label + ': not a number.' });
      }
      (c.check(o, job, i) || []).forEach(e => put(i, e));
      if (c.sys === 'ren') {
        const pu = purposeOf(o);
        const S = c.opt.includes('S') && (!pu || pu === 'set') ? opS(o, job) : null, T = c.opt.includes('T') && (!pu || pu === 'adjust') ? toolCode(o.tool) : null;
        if (pu === 'adjust' && !String(o.tool || '').trim()) put(i, { err: 'Give the tool to adjust, e.g. 12A.' });
        if (pu === 'adjust' && has(o.tolM)) put(i, { warn: 'The position zone is judged in the report only: the macro cannot check position while it adjusts a tool.' });
        if ((pu === 'inspect' || pu === 'adjust') && has(o.tolP) !== has(o.tolN) && INSP[o.type] && INSP[o.type].key) put(i, { warn: 'Only one side of the tolerance given: the other is taken as 0.' });
        if (o.purpose && purposes(c).length && !purposes(c).includes(o.purpose)) put(i, { err: c.name + ' cannot be used to ' + (PURPOSE_NAMES[o.purpose] || o.purpose).toLowerCase() + '.' });
        if (c.opt.includes('T') && String(o.tool || '').trim() && T === null) put(i, { err: 'Tool to update: a number and suffix, e.g. 12A.' });
        if (S !== null && T !== null) put(i, { err: 'Update a work offset or a tool, not both.' });
        if (S !== null && has(o.tolH) && !pu) put(i, { err: 'A size tolerance cannot go with a work offset update (SH INPUT MIXED).' });
        if (T !== null && has(o.tolM) && !pu) put(i, { err: 'A position tolerance cannot go with a tool update (TM INPUT MIXED).' });
        if (S === 7) put(i, { warn: 'The Mazatrol WPC is only updated when this runs from the Mazatrol program\'s SUB PRO unit (MEASURE MACRO).' });
        else if (o.upd && o.upd !== 'active' && o.upd !== 'none' && o.upd !== job.wcs) put(i, { warn: 'Updating ' + wcsName(o.upd) + ' while running in ' + wcsCode(job.wcs) + ': the new value is ' + wcsCode(job.wcs) + ' + the error.' });
        if ((!pu || pu === 'adjust') && has(o.fb) && (num(o.fb) < 0 || num(o.fb) > 1)) put(i, { err: 'Feedback must be 0–1.' });
        const st = c.start && c.start(o, job);
        if (st && st.down && st.z !== null && st.z >= num(job.clearZ, 2)) put(i, { err: 'The clearance Z (' + fmt(num(job.clearZ, 2)) + ') must be above where this starts (Z' + fmt(st.z) + ').' });
      }
    });
    return out;
  }

  // ------------------------------------------------------------------ EIA/ISO
  function argStr(pairs) {
    // I, J, K must stay in alphabetical order inside a group, so they are only sorted when each appears once
    return pairs.filter(Boolean).map(([a, v]) => word(a, v)).join(' ');
  }
  function optPairs(c, o, job) {
    const p = [], pu = purposeOf(o), stop = job.stopOOT !== false;
    for (const L of OPT_ORDER) {
      if (!c.opt.includes(L)) continue;
      if (pu && (pu !== 'set' || 'TFVHU'.includes(L)) && 'STFVHUMB'.includes(L)) {
        // purposes: set = S only; inspect = H M B (when stopping); adjust = T F U V H (+ B), no M (TM INPUT MIXED)
        if (pu === 'set') continue;
        const bd = band(o);
        if (L === 'H' && stop && bd !== null) p.push(['H', bd / 2]);
        if (L === 'M' && stop && pu === 'inspect' && has(o.tolM)) p.push(['M', num(o.tolM)]);
        if (L === 'B' && stop && has(o.tolB)) p.push(['B', num(o.tolB)]);
        if (pu === 'adjust') {
          if (L === 'T') { const t = toolCode(o.tool); if (t !== null) p.push(['T', t]); }
          if (L === 'F') p.push(['F', has(o.fb) ? num(o.fb) : 0.8]);
          if (L === 'U') { const u = has(o.tolU) ? num(o.tolU) : bd !== null ? 3 * bd : null; if (u) p.push(['U', u]); }
          if (L === 'V' && has(o.nullV)) p.push(['V', num(o.nullV)]);
        }
        continue;
      }
      if (L === 'S') { const s = opS(o, job); if (s !== null) p.push(['S', s]); continue; }
      if (L === 'T') { const t = toolCode(o.tool); if (t !== null) p.push(['T', t]); continue; }
      if (L === 'W') { if (o.print) p.push(['W', +o.print]); continue; }
      const k = OPT[L].k; if (has(o[k])) p.push([L, num(o[k])]);
    }
    return p;
  }
  // the specific arguments, with the size moved to the middle of an uneven tolerance band
  function cycArgs(c, o, job) {
    const a = c.args(o, job), I = INSP[o.type];
    if (!inspecting(o) || !I || !I.arg || !(has(o.tolP) || has(o.tolN))) return a;
    const shift = (Math.abs(num(o.tolP, 0)) - Math.abs(num(o.tolN, 0))) / 2;
    return a.map(w => (w && w[0] === I.arg ? [w[0], w[1] + shift] : w));
  }
  function eia(job) {
    const j = Object.assign({}, DEFAULTS, job), L = [], ops = j.ops || [];
    const T = jobProbeT(j);
    L.push(cm(j.name + ' - MACH1 PROBING'));
    L.push(cm(j.sys === 'mmseia' ? 'MAZAK MMS EIA MACROS 9010-9020' : 'RENISHAW INSPECTION PLUS A-4013-0113'));
    L.push(cm('CHECK SINGLE BLOCK WITH LOW RAPID FIRST'));
    L.push((j.g20 ? 'G20 ' : '') + 'G17 G40 G80 G90 G94');
    if (j.toolChange && T !== null) {
      L.push('G0 G53 G90 Z0');
      L.push('T' + (Number.isInteger(T) ? String(T) : T.toFixed(2)) + ' M6 ' + cm('PROBE'));
      if (num(j.dwell, 0) > 0) L.push('G4 X' + fmt(num(j.dwell, 0), 1) + ' ' + cm('PROBE START SIGNAL'));
    }
    if (j.sys === 'mmseia') {
      ops.forEach((o, i) => {
        const c = CYC[o.type]; if (!c) return;
        L.push(cm((i + 1) + ' ' + c.name));
        // every value with a decimal point except H and M (MMS manual)
        L.push('G65 P' + c.macro + ' ' + argStr(c.args(o, j)) + ' H' + Math.round(num(j.mmsH, 0)) + (j.mmsPrint ? ' S1.' : '') + ' M' + Math.round(num(j.mmsM, 54)));
      });
      L.push('G' + Math.round(num(j.mmsM, 54)));
      if (j.homeEnd) L.push('G0 G91 G28 Z0', 'G90');
      L.push(endCode(j));
      return L.join('\n') + '\n';
    }
    const printing = ops.some(o => o.print), report = ops.some(o => CYC[o.type] && inspecting(o));
    const wc = wcsCode(j.wcs), cz = num(j.clearZ, 2);
    L.push('G90 ' + wc);
    L.push('G65 P9832' + (printing ? ' W1.' : '') + ' ' + cm('PROBE ON, ORIENT'));
    if (report) {
      // the inspection report: a run line, then one result line per feature (read back by PROBE.readPrint)
      const rc = base(j) + 10;
      if (!printing) L.push('POPEN');
      L.push('#' + rc + '=#' + rc + '+1 ' + cm('RUN COUNTER'));
      const run = 'DPRNT[M1RUN*' + String(j.name).toUpperCase().replace(/[^A-Z0-9]/g, '') + '*N#' + rc + '[50]*D#3011[80]*T#3012[60]]';
      // every Nth part: #961 = 0 on parts 1, N+1, 2N+1 ... and the inspections run only then
      if (nthOf(j) > 1) L.push('#' + (rc + 1) + '=[#' + rc + '-1]-FIX[[#' + rc + '-1]/' + nthOf(j) + ']*' + nthOf(j) + ' ' + cm('0 = INSPECT THIS PART, EVERY ' + nthOf(j)), 'IF[#' + (rc + 1) + 'NE0]GOTO9300', run, 'N9300');
      else L.push(run);
    }
    if (fromCtl(j) && usesS5(j)) {
      // S5 from the control: stop unless it reads like a centre in inches (and, if typed too, agrees with it)
      L.push(cm('TABLE CENTRE FROM PARAMETER S5'), 'IF[ABS[#50700]GE1000.]GOTO9190', 'IF[ABS[#50701]GE1000.]GOTO9190', 'IF[[ABS[#50700]+ABS[#50701]]EQ0]GOTO9190');
      if (typedOk(j)) L.push('IF[ABS[#50700-' + ex(num(j.tcX, 0)) + ']GT0.05]GOTO9192', 'IF[ABS[#50701-' + ex(num(j.tcZ, 0)) + ']GT0.05]GOTO9192');
      L.push('GOTO9193', 'N9190 #3000=1(S5 NOT READ - TYPE THE TABLE CENTRE)', 'N9192 #3000=2(S5 READ DIFFERS FROM THE TYPED CENTRE)', 'N9193');
    }
    let at = null;                                   // where the probe is: null = unknown (after the tool change)
    ops.forEach((o, i) => {
      const c = CYC[o.type]; if (!c) return;
      const skip = report && nthOf(j) > 1 && inspecting(o);
      if (skip) L.push('IF[#' + (base(j) + 11) + 'NE0]GOTO' + (9301 + i) + ' ' + cm('NOT THIS PART'));
      L.push(cm((i + 1) + ' ' + c.name));
      if (c.emit) {
        // the operation writes its own moves; 'home' = the probe ends at Z home, so the next one starts like the first
        if (c.emit(o, j, { L, cz, cm, i }) === 'home') at = null; else if (!c.noMove) at = true;
        return;
      }
      const st = c.noMove ? null : c.start(o, j);
      if (st) {
        if (at === null) { L.push('G0 X' + fmt(st.x) + ' Y' + fmt(st.y)); L.push('G65 P9810 Z' + fmt(cz) + ' ' + cm('PROTECTED TO CLEARANCE')); }
        else if (j.moveG0) L.push('G0 X' + fmt(st.x) + ' Y' + fmt(st.y));
        else L.push('G65 P9810 X' + fmt(st.x) + ' Y' + fmt(st.y));
        if (st.down && st.z !== null) L.push('G65 P9810 Z' + fmt(st.z));
        at = st;
      }
      L.push('G65 P' + c.macro + (function () { const a = argStr(cycArgs(c, o, j).concat(optPairs(c, o, j))); return a ? ' ' + a : ''; })());
      if (c.after) c.after(o, j).forEach(s => L.push(s));
      if (inspecting(o)) L.push('DPRNT[M1F' + (i + 1) + '*X#135[44]*Y#136[44]*Z#137[44]*S#138[44]*A#139[34]*B#144[34]*E#143[34]*P#145[34]*C#146[34]*F#148[10]]');
      if (st && st.down && st.z !== null) L.push('G65 P9810 Z' + fmt(cz));
      if (skip) L.push('N' + (9301 + i));
    });
    L.push('G65 P9833' + (printing ? ' W1.' : '') + ' ' + cm('PROBE OFF'));
    if (report && !printing) L.push('PCLOS');
    if (j.homeEnd) L.push('G0 G91 G28 Z0', 'G90');
    L.push(endCode(j));
    return L.join('\n') + '\n';
  }
  // the second program a Mazatrol "side 180° away" needs: run from the other side's SUB PRO, it writes that WPC
  function eia180(job) {
    const j = Object.assign({}, DEFAULTS, job);
    if (j.sys !== 'ren' || !(j.ops || []).some(o => o.type === 'side180' && o.target === 'wpc')) return null;
    const b = base(j);
    return ['(' + (j.name + '-180').toUpperCase() + ' - MACH1 PROBING)', '(WRITES THE OTHER SIDE KEPT BY ' + j.name.toUpperCase() + ' INTO THIS WPC)',
      'G65 P9733 X#' + b + ' Y#' + (b + 1) + ' Z#' + (b + 2) + ' B#' + (b + 3), 'M99'].join('\n') + '\n';
  }

  // ------------------------------------------------------------------ Mazatrol
  // ren / mmseia: a SUB PRO unit (MEASURE MACRO) that calls the EIA program; mms: WPC + MMS unit
  function toMazatrol(job, MACH1, ctl) {
    const j = Object.assign({}, DEFAULTS, job);
    const p = MACH1.program({ control: ctl || 'SmoothM', name: j.name + (j.sys === 'mms' ? '' : '-M'), units: 'inch', comment: ('PROBING ' + j.name).slice(0, 48) });
    p.common({ 'INITIAL-Z': num(j.initZ, 2) });
    if (j.sys === 'mms') {
      p.unit('WPC-', { 'ADD.WPC': String(j.wpcNo || '1'), X: num(j.wpcX, 0), Y: num(j.wpcY, 0), Th: num(j.wpcTh, 0), Z: num(j.wpcZ, 0) });
      const u = p.unit('MMS', { TOOL: 'PROBE', 'NOM-0': num(j.probeNom, 0.23), 'NOM-0#2': String(j.probeSfx || '').toUpperCase() });
      (j.ops || []).forEach(o => { const c = CYC[o.type]; if (c && c.sys === 'mms') u.line('a2', Object.assign({ PTN: c.ptn }, c.mms(o))); });
    } else {
      p.unit('SUB PRO', { WORK: j.name, '@8': '(Meas)' });
      if (eia180(j)) {
        // where the other side starts: its WPC (written by the second program) and the SUB PRO that writes it
        p.unit('WPC-', { 'ADD.WPC': '0', X: 0, Y: 0, Th: 0, Z: 0 });
        p.unit('SUB PRO', { WORK: j.name + '-180', '@8': '(Meas)' });
      }
    }
    return p;
  }

  // ------------------------------------------------------------------ ready-made jobs
  // each: the kind of program and the operations to add (with values to start from)
  const TEMPLATES = [
    { id: 'calRing', name: 'Calibrate the probe: ring gauge + length', sys: 'ren', ops: [['calRing', {}], ['calLen', {}]], info: 'Stylus offsets, radii and vector radii in a ring gauge (copied to L1–L4), then the length on a Z face.' },
    { id: 'calBall', name: 'Calibrate the probe on a sphere', sys: 'ren', ops: [['calBall', {}]], info: 'Length, offsets and radii on a calibration ball in one cycle.' },
    { id: 'viseCorner', name: 'Set up on a vise: top and outside corner', sys: 'ren', ops: [['surfZ', { purpose: 'set', x: 0.5, y: 0.5, sz: 0 }], ['cornerOut', { purpose: 'set', x: 0, y: 0, z: -0.25, q: '++' }]], info: 'Z from the top face, X and Y from the corner. Move the numbers to your part.' },
    { id: 'fixtureBore', name: 'Set up on a fixture bore: top and bore', sys: 'ren', ops: [['surfZ', { purpose: 'set', x: 1, y: 0, sz: 0 }], ['bore', { purpose: 'set', x: 0, y: 0, z: -0.25, d: 1 }]], info: 'Z from a face, X and Y from a bore\'s centre.' },
    { id: 'boreAdjust', name: 'Inspect a bore and adjust its tool', sys: 'ren', ops: [['bore', { purpose: 'adjust', d: 1, tolP: 0.001, tolN: 0.001, tool: '' }]], info: 'Ø ±0.001 into the report; the boring tool corrected toward the middle. Give the tool.' },
    { id: 'squareB', name: 'Square B and set the side 180° away', sys: 'ren', ops: [['rotary', {}], ['side180', {}]], info: 'Squares B on this side\'s face, then works out the other side. Type S5 under Table.' },
    { id: 'mmsBlock', name: 'Mazatrol MMS: top, X and Y faces', sys: 'mms', ops: [['mZF', {}], ['mXF', {}], ['mYF', {}]], info: 'The usual three MMS lines on a block.' },
  ];
  // the operations of a template, made the usual way (newOp) and then given its values
  function fromTemplate(id, job) {
    const t = TEMPLATES.find(x => x.id === id); if (!t) throw new Error('No ready-made job "' + id + '"');
    return { sys: t.sys, ops: t.ops.map(([type, v]) => Object.assign(newOp(type, v.purpose || (job && job.defPurpose)), v)) };
  }

  // ------------------------------------------------------------------ the moves, for the timeline
  // what the probe does, in order: a list of {op, kind, x, y, z, label}. kind: rapid, protected, touch, index, home
  // (X Y in the work coordinates, from the job's numbers; moves the machine works out at run time are approximate)
  function moves(job) {
    const j = Object.assign({}, DEFAULTS, job), M = [], cz = num(j.clearZ, 2);
    if (j.sys !== 'ren') {
      // MMS: each line starts at its point; EIA MMS from machine zero
      (j.ops || []).forEach((o, i) => { const c = CYC[o.type]; if (!c) return; const g = plot({ sys: j.sys, ops: [o] })[0] || {};
        const sx = num(o.x, 0), sy = num(o.y, 0); M.push({ op: i, kind: 'rapid', x: sx, y: sy, z: cz, label: 'to ' + c.name });
        (g.touch || []).forEach((t, k) => { M.push({ op: i, kind: 'touch', x: t[0], y: t[1], z: num(o.z, 0), label: 'touch ' + (k + 1) }); M.push({ op: i, kind: 'protected', x: sx, y: sy, z: num(o.z, 0), label: 'back' }); });
        (g.pts || []).forEach(t => M.push({ op: i, kind: 'touch', x: t[0], y: t[1], z: num(o.z, 0), label: t[2] || 'touch' })); });
      return M;
    }
    let at = null;
    const P = plot(j);
    (j.ops || []).forEach((o, i) => {
      const c = CYC[o.type]; if (!c) return;
      const g = P[i] || {};
      if (o.type === 'rotary' || o.type === 'centre180') {
        const sides = o.type === 'centre180' ? [num(o.bi, 0), (num(o.bi, 0) + 180) % 360] : [num(o.bi, 0)].concat(o.verify ? [num(o.bi, 0)] : []);
        sides.forEach((b, k) => {
          M.push({ op: i, kind: 'home', x: at ? at.x : 0, y: at ? at.y : 0, z: null, label: 'probe home' }, { op: i, kind: 'index', x: at ? at.x : 0, y: at ? at.y : 0, z: null, label: 'table to B' + fmt(b) });
          const x = num(o.x, 0), y = num(o.y, 0), zf = num(o.type === 'rotary' ? o.sz : o.zf, 0);
          M.push({ op: i, kind: 'rapid', x, y, z: null, label: 'across' }, { op: i, kind: 'protected', x, y, z: cz, label: 'down to clearance' }, { op: i, kind: 'protected', x, y, z: zf + 0.25, label: 'down to the face' });
          (g.pts || []).forEach(t => M.push({ op: i, kind: 'touch', x: t[0], y: t[1], z: zf, label: (k ? 'check ' : '') + 'touch ' + t[2] }));
          (g.touch || []).forEach((t, n) => M.push({ op: i, kind: 'touch', x: t[0], y: t[1], z: zf, label: 'side touch ' + (n + 1) }));
          M.push({ op: i, kind: 'protected', x, y, z: cz, label: 'up' });
          at = { x, y };
        });
        at = null; return;
      }
      if (c.noMove || c.emit) { M.push({ op: i, kind: 'calc', x: at ? at.x : 0, y: at ? at.y : 0, z: cz, label: c.name + ' (no moves)' }); return; }
      const st = c.start(o, j);
      if (at === null) M.push({ op: i, kind: 'rapid', x: st.x, y: st.y, z: null, label: 'across (probe at Z home)' }, { op: i, kind: 'protected', x: st.x, y: st.y, z: cz, label: 'down to clearance' });
      else M.push({ op: i, kind: j.moveG0 ? 'rapid' : 'protected', x: st.x, y: st.y, z: cz, label: 'across' });
      const zl = st.down && st.z !== null ? st.z : cz;
      if (st.down && st.z !== null) M.push({ op: i, kind: 'protected', x: st.x, y: st.y, z: st.z, label: 'down to start' });
      const lvl = has(o.z) ? num(o.z) : zl;
      (g.touch || []).forEach((t, k) => { M.push({ op: i, kind: 'touch', x: t[0], y: t[1], z: lvl, label: 'touch ' + (k + 1) }); M.push({ op: i, kind: 'protected', x: st.x, y: st.y, z: zl, label: 'back' }); });
      (g.pts || []).forEach((t, k) => { M.push({ op: i, kind: 'touch', x: t[0], y: t[1], z: o.type === 'surfZ' || o.type === 'calLen' ? num(o.sz, 0) : lvl, label: 'touch ' + (t[2] || k + 1) }); });
      (g.circles || []).length && o.type === 'pcd' && (g.circles || []).forEach((cc, k) => M.push({ op: i, kind: 'touch', x: cc[0], y: cc[1], z: num(o.z, 0), label: 'hole ' + (k + 1) }));
      if (st.down && st.z !== null) M.push({ op: i, kind: 'protected', x: st.x, y: st.y, z: cz, label: 'up to clearance' });
      at = { x: st.x, y: st.y };
    });
    return M;
  }

  // ------------------------------------------------------------------ into a part program
  // the units of a Mazatrol part program, for picking where the probing goes
  function unitsOf(MACH1, bytes, fileName) {
    const p = MACH1.open(bytes, fileName), j = p.toJSON();
    return j.program.map((u, no) => {
      const f = u.fields || {}, n = v => (v === undefined ? '' : v);
      let text = '';
      if (u.unit === 'WPC-') text = 'X' + n(f.X) + ' Y' + n(f.Y) + ' Z' + n(f.Z) + (f['@56'] !== undefined ? ' B' + f['@56'] : '');
      else if (u.unit === 'INDEX') text = 'B' + n(f.ANGLE);
      else if (u.unit === 'SUB PRO') text = n(f.WORK) + (f['@8'] ? ' ' + f['@8'] : '');
      else if (u.unit === 'MMS') text = (u.lines || []).map(l => l.fields && l.fields.PTN).filter(Boolean).join(' ');
      else if (f.TOOL) text = f.TOOL + (f['NOM-0'] || f['NOM-DIA'] ? ' ' + (f['NOM-0'] || f['NOM-DIA']) : '');
      return { no, unit: u.unit === 'WPC-' ? 'WPC-' + n(f['ADD.WPC']) : u.unit, text };
    });
  }
  // where to suggest: after the first WPC unit and the INDEX / MMS / OFFSET units that follow it (the side is then
  // facing the spindle and set), and the same after the second WPC for the other side's SUB PRO
  function suggestPlace(units) {
    const after = w => { let k = w.no; while (units[k + 1] && /^(INDEX|MMS|OFFSET)$/.test(units[k + 1].unit)) k++; return k; };
    const w = units.filter(u => /^WPC-/.test(u.unit));
    return { main: w[0] ? after(w[0]) : Math.max(0, units.length - 2), other: w[1] ? after(w[1]) : null };
  }
  // put the probing into a part program: the SUB PRO(s) that run the EIA programs, or the MMS unit
  function insertInto(job, MACH1, bytes, fileName, place) {
    const j = Object.assign({}, DEFAULTS, job), p = MACH1.open(bytes, fileName), done = [];
    const two = j.sys !== 'mms' && eia180(j);
    if (two && !(place.other > 0)) throw new Error('Pick the other side\'s WPC unit for the second SUB PRO (' + j.name + '-180).');
    const add = (after, what) => {
      if (what === 'mms') {
        const u = p.unit('MMS', { TOOL: 'PROBE', 'NOM-0': num(j.probeNom, 0.23), 'NOM-0#2': String(j.probeSfx || '').toUpperCase() }, { after });
        (j.ops || []).forEach(o => { const c = CYC[o.type]; if (c && c.sys === 'mms') u.line('a2', Object.assign({ PTN: c.ptn }, c.mms(o))); });
        done.push('MMS unit after unit ' + after);
      } else { p.unit('SUB PRO', { WORK: what, '@8': '(Meas)' }, { after }); done.push('SUB PRO ' + what + ' after unit ' + after); }
    };
    // the later position first, so the earlier one's unit number still means the same unit
    const list = [[+place.main, j.sys === 'mms' ? 'mms' : j.name]].concat(two ? [[+place.other, j.name + '-180']] : []).sort((a, b) => b[0] - a[0]);
    list.forEach(([after, what]) => add(after, what));
    return { program: p, fileName, done: done.reverse(), warnings: p.warnings.slice() };
  }

  // ------------------------------------------------------------------ drawing
  // per operation: its geometry plus the probe's start point (for Renishaw jobs)
  function plot(job) {
    const j = Object.assign({}, DEFAULTS, job);
    return (j.ops || []).map((o, i) => {
      const c = CYC[o.type]; if (!c) return { i };
      let g = {}; try { g = c.geo(o, j) || {}; } catch (e) { g = {}; }
      const st = c.sys === 'ren' && !c.noMove ? c.start(o, j) : null;
      return Object.assign({ i, name: c.name, start: st ? [st.x, st.y] : g.start }, g);
    });
  }

  // ------------------------------------------------------------------ reading the results back
  // print.txt from the control: M1RUN lines start a run, M1F<n> lines are operation n's results; anything else is ignored
  function readPrint(text, job) {
    const j = Object.assign({}, DEFAULTS, job), runs = [], warn = [];
    let run = null;
    const nums = s => { const v = {}; const re = /([A-Z])\s*([+-]?\s*\d*\.?\d+)/g; let m; while ((m = re.exec(s))) v[m[1]] = parseFloat(m[2].replace(/\s+/g, '')); return v; };
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      let m = /^M1RUN\s+(\S*)\s+(N.*)$/.exec(line);
      if (m) {
        const v = nums(m[2]);
        run = { name: m[1], n: Math.round(v.N || 0), date: String(Math.round(v.D || 0)), time: String(Math.round(v.T || 0)).padStart(6, '0'), feats: [] };
        runs.push(run);
        const want = String(j.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (m[1] !== want && !warn.some(w => w.includes(m[1]))) warn.push('Results from program ' + m[1] + ', but the job open here is ' + j.name + ': the features are matched by number.');
        continue;
      }
      m = /^M1F(\d+)\s+(.*)$/.exec(line);
      if (m && run) run.feats.push({ op: +m[1] - 1, v: nums(m[2]) });
    }
    // judge each row against the job's tolerances
    for (const r of runs) {
      r.rows = [];
      for (const f of r.feats) {
        const o = (j.ops || [])[f.op], I = o && INSP[o.type];
        const name = (f.op + 1) + ' ' + (o && CYC[o.type] ? CYC[o.type].name : '?');
        if (!I) { r.rows.push({ op: f.op, feature: name, item: 'not in this job', res: '?' }); continue; }
        for (const row of I.rows(o, f.v)) {
          const x = Object.assign({ op: f.op, feature: name }, row);
          if (x.nom !== undefined && isFinite(x.act)) x.dev = x.act - x.nom;
          const hasTol = has(x.plus) || has(x.minus);
          x.res = row.pos ? '' : !hasTol || x.dev === undefined ? 'NO TOL' : (x.dev > Math.abs(num(x.plus, 0)) + 1e-9 || x.dev < -Math.abs(num(x.minus, 0)) - 1e-9) ? 'OUT' : 'OK';
          r.rows.push(x);
        }
        if (purposeOf(o) === 'adjust') r.rows.push({ op: f.op, feature: name, item: 'Error for the tool (' + String(o.tool || '').toUpperCase() + ')', act: f.v.C, res: '' });
        if (f.v.F) r.rows.push({ op: f.op, feature: name, item: 'Machine flag ' + f.v.F, note: FLAG[f.v.F] || '', res: 'OUT' });
      }
      r.out = r.rows.filter(x => x.res === 'OUT').length;
    }
    return { runs, warn };
  }
  // the report as CSV: one row per run and measured item
  function reportCSV(rep) {
    const q = s => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
    const n = v => (v === undefined || v === null || !isFinite(v) ? '' : (+v).toFixed(4));
    const L = ['Part,Date,Time,Feature,Item,Nominal,Actual,Deviation,+Tol,-Tol,Result'];
    for (const r of rep.runs) for (const x of r.rows) L.push([r.n, r.date, r.time, x.feature, x.item + (x.note ? ' (' + x.note + ')' : ''), n(x.nom), n(x.act), n(x.dev), has(x.plus) ? n(num(x.plus)) : '', has(x.minus) ? n(num(x.minus)) : '', x.res].map(q).join(','));
    return L.join('\n') + '\n';
  }

  const PROBE = { TEMPLATES, fromTemplate, moves, unitsOf, suggestPlace, insertInto, readPrint, reportCSV, purposes, purposeOf, inspectFields, optLetters, PURPOSE_NAMES, INSP, CYC, OPT, OPT_ORDER, DEFAULTS, SUFFIX, list, newOp, check, eia, eia180, endCode, offX, toMazatrol, plot, toolCode, sValue, wcsCode, fmt, ptList };
  if (typeof module !== 'undefined' && module.exports) module.exports = PROBE; else root.PROBE = PROBE;
})(this);
