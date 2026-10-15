// Quick reference: G-codes and M-codes of the Smooth G machining-center control, and a drawing for each TPC parameter
// showing what it adjusts. Wording is our own short summary; the drawings are our own, modelled on the figures of the
// machine's programming manual and parameter list. M-codes are a Mazak horizontal's list (other machines differ).
(function (root) {
  'use strict';

  // [code, function, modal group ('00' = one block only), default ('*' = on at power-up / reset)]
  const G = [
    ['G00', 'Rapid positioning', '01'], ['G01', 'Linear feed', '01'], ['G02', 'Arc clockwise', '01'], ['G03', 'Arc counter-clockwise', '01'],
    ['G02.1', 'Spiral, clockwise', '01'], ['G03.1', 'Spiral, counter-clockwise', '01'], ['G02.2', 'Involute, clockwise', '01'], ['G03.2', 'Involute, counter-clockwise', '01'],
    ['G04', 'Dwell (P or X seconds)', '00'], ['G05', 'High-speed machining mode', '00'], ['G06.1', 'Fine spline interpolation', '01'], ['G06.2', 'NURBS interpolation', '01'],
    ['G07', 'Virtual-axis interpolation', '00'], ['G07.1', 'Cylindrical interpolation', '00'], ['G09', 'Exact stop (this block)', '00'],
    ['G10', 'Data setting (offsets, parameters) on', '00'], ['G10.1', 'Command address off', '00'], ['G11', 'Data setting off', '00'],
    ['G17', 'XY plane', '02'], ['G17.1', 'Five-surface: top', '19', '*'], ['G17.2', 'Five-surface: 0° face', '19'], ['G17.3', 'Five-surface: 90° face', '19'],
    ['G17.4', 'Five-surface: 180° face', '19'], ['G17.5', 'Five-surface: 270° face', '19'], ['G17.9', 'Five-surface off', '19'],
    ['G18', 'ZX plane', '02'], ['G19', 'YZ plane', '02'], ['G20', 'Inch input', '06'], ['G21', 'Metric input', '06'],
    ['G22', 'Stroke check before move on', '04'], ['G23', 'Stroke check before move off', '04', '*'],
    ['G27', 'Reference point check', '00'], ['G28', 'Return to reference point', '00'], ['G29', 'Return from reference point', '00'],
    ['G30', 'Return to 2nd/3rd/4th reference point', '00'], ['G31', 'Skip (probe) move', '00'], ['G31.1', 'Multi-step skip 1', '00'],
    ['G31.2', 'Multi-step skip 2', '00'], ['G31.3', 'Multi-step skip 3', '00'], ['G33', 'Thread cutting', '01'], ['G34', 'Variable-lead thread cutting', '01'],
    ['G34.1', 'Hole pattern on a circle', '00'], ['G35', 'Hole pattern on a line', '00'], ['G36', 'Hole pattern on an arc', '00'], ['G37.1', 'Hole pattern on a grid', '00'],
    ['G37', 'Automatic tool length measurement', '00'], ['G38', 'Cutter comp vector selection', '00'], ['G39', 'Cutter comp corner arc', '00'],
    ['G40', 'Cutter radius comp off', '07', '*'], ['G41', 'Cutter radius comp left', '07'], ['G42', 'Cutter radius comp right', '07'],
    ['G43', 'Tool length offset +', '08'], ['G44', 'Tool length offset −', '08'], ['G45', 'Tool position offset, extend', '00'],
    ['G46', 'Tool position offset, reduce', '00'], ['G47', 'Tool position offset, double extend', '00'], ['G48', 'Tool position offset, double reduce', '00'],
    ['G49', 'Tool length offset off', '08', '*'], ['G50', 'Scaling off', '11', '*'], ['G51', 'Scaling on', '11'],
    ['G50.1', 'Mirror image off', '19', '*'], ['G51.1', 'Mirror image on', '19'], ['G52', 'Local coordinate system', '00'], ['G53', 'Machine coordinates (this block)', '00'],
    ['G54', 'Work offset 1', '12', '*'], ['G55', 'Work offset 2', '12'], ['G56', 'Work offset 3', '12'], ['G57', 'Work offset 4', '12'], ['G58', 'Work offset 5', '12'],
    ['G59', 'Work offset 6', '12'], ['G54.1', 'Additional work offsets (P1…)', '12'], ['G54.2', 'Fixture offset', '23'],
    ['G60', 'One-way positioning', '00'], ['G61', 'Exact stop mode', '13'], ['G61.1', 'High-accuracy mode (geometry compensation)', '13'],
    ['G61.2', 'Modal spline interpolation', '13'], ['G62', 'Automatic corner override', '13'], ['G63', 'Tapping mode', '13'], ['G64', 'Cutting mode', '13', '*'],
    ['G65', 'Macro call (one block)', '00'], ['G66', 'Macro modal call A', '14'], ['G66.1', 'Macro modal call B', '14'], ['G67', 'Macro modal call off', '14', '*'],
    ['G68', 'Coordinate rotation / 3-D conversion on', '16'], ['G68.2', 'Inclined-plane machining on', '16'],
    ['G68.3', 'Inclined plane by tool-axis direction', '16'], ['G68.4', 'Incremental inclined-plane coordinates', '16'], ['G69', 'Rotation / 3-D conversion off', '16', '*'],
    ['G71.1', 'Cycle: chamfering cutter 1 (CW)', '09'], ['G72.1', 'Cycle: chamfering cutter 2 (CCW)', '09'], ['G73', 'Cycle: high-speed peck drilling', '09'],
    ['G74', 'Cycle: reverse tapping', '09'], ['G75', 'Cycle: boring 1', '09'], ['G76', 'Cycle: boring 2 (fine boring)', '09'], ['G77', 'Cycle: back spot facing', '09'],
    ['G78', 'Cycle: boring 3', '09'], ['G79', 'Cycle: boring 4', '09'], ['G80', 'Cycle off', '09', '*'], ['G81', 'Cycle: spot drilling', '09'], ['G82', 'Cycle: drilling with dwell', '09'],
    ['G83', 'Cycle: deep-hole peck drilling', '09'], ['G84', 'Cycle: tapping', '09'], ['G84.2', 'Cycle: synchronous tapping', '09'], ['G84.3', 'Cycle: synchronous reverse tapping', '09'],
    ['G85', 'Cycle: reaming', '09'], ['G86', 'Cycle: boring 5', '09'], ['G87', 'Cycle: back boring', '09'], ['G88', 'Cycle: boring 6', '09'], ['G89', 'Cycle: boring 7', '09'],
    ['G90', 'Absolute', '03'], ['G91', 'Incremental', '03'], ['G92', 'Set coordinate system / spindle speed limit', '00'], ['G92.5', 'Work coordinate rotation', '00'],
    ['G93', 'Inverse time feed', '05'], ['G94', 'Feed per minute', '05'], ['G95', 'Feed per revolution', '05'],
    ['G98', 'Cycles return to the initial level', '10', '*'], ['G99', 'Cycles return to the R level', '10'],
    ['G136', 'Measuring macro (workpiece / coordinates)', ''], ['G137', 'Compensation macro', ''], ['G140', 'Engraving', ''],
    ['G148', 'Orbit machining mode on', '00'], ['G149', 'Orbit machining mode off', '00'],
  ];
  const M = [
    ['M00', 'Program stop (spindle stops)'], ['M01', 'Optional stop (when OPTIONAL STOP is on)'], ['M02', 'End of program'],
    ['M03', 'Spindle forward'], ['M04', 'Spindle reverse'], ['M05', 'Spindle stop'], ['M06', 'Tool change (T next to it: tool to load)'],
    ['M07', 'Mist coolant on (option)'], ['M08', 'Flood coolant on'], ['M09', 'All coolant and air blast off'], ['M10', 'Tool clamp'], ['M11', 'Tool unclamp'],
    ['M17', 'ATC shifter to magazine'], ['M18', 'ATC shifter to spindle'], ['M19', 'Spindle orient'], ['M23', 'Exact stop (error detect) on'], ['M24', 'Exact stop off'],
    ['M30', 'End of program, reset and rewind'], ['M33', 'Tool length measuring arm out (option)'], ['M34', 'Tool length measuring arm in (option)'],
    ['M35', 'Tool breakage check at next tool change (Mazatrol, option)'], ['M42', 'Index table reverse turn (with B)'],
    ['M46', '4th axis unclamp (option)'], ['M47', '4th axis clamp (option)'], ['M48', 'Overrides back on (cancel M49)'], ['M49', 'Feed and spindle overrides off'],
    ['M50', 'Air blast on (option)'], ['M51', 'Through-spindle coolant on (option)'], ['M52', 'Tap coolant on (option)'], ['M58', 'Tool life check (stop if expired)'],
    ['M68', 'Pallet clamp'], ['M69', 'Pallet unclamp'], ['M71', 'Select pallet 1'], ['M72', 'Select pallet 2'], ['M73', 'Select pallet 3 (6PC)'], ['M74', 'Select pallet 4 (6PC)'],
    ['M75', 'Select pallet 5 (6PC)'], ['M76', 'Select pallet 6 (6PC)'], ['M90', 'Mirror image off'], ['M91', 'X mirror image on'], ['M92', 'Y mirror image on'],
    ['M93', '4th axis mirror image on (option)'], ['M98', 'Subprogram call'], ['M99', 'Return from subprogram'],
    ['M100', 'High-pressure coolant pressure 1 (M100–M106: steps 1–7, for M131)'], ['M101', 'High-pressure coolant pressure 2'], ['M102', 'High-pressure coolant pressure 3'],
    ['M103', 'High-pressure coolant pressure 4'], ['M104', 'High-pressure coolant pressure 5'], ['M105', 'High-pressure coolant pressure 6'], ['M106', 'High-pressure coolant pressure 7'],
    ['M119', 'Spindle orient to angle (with S, option)'],
    ['M120', 'Automatic power off'], ['M122', 'Gap eliminator on (faster air cutting, option)'], ['M123', 'Gap eliminator off'],
    ['M130', 'NIAGARA coolant on (option)'], ['M131', 'High-pressure through-spindle coolant on (option; pressure step M100–M106, off M09)'], ['M132', 'Through-spindle air on (option)'], ['M134', 'Read pallet ID at IN station (option)'],
    ['M137', 'Write pallet ID at IN station (option)'], ['M138', 'Write all pallet IDs at OUT station (option)'], ['M139', 'Heavy tool mode off'],
    ['M140', 'Heavy tool mode on'], ['M149', 'Index magazine to tool (with T)'], ['M155', 'Stop thermal compensation updates'],
    ['M160', 'Spindle "at speed" at 85% (cancel M161/M162)'], ['M161', 'Spindle "at speed" at 70%'], ['M162', 'Spindle "at speed" at 50%'],
    ['M169', 'AFC on (cancel M170)'], ['M170', 'AFC off'], ['M173', 'Dynamic offsetting on (rotary table, option)'], ['M174', 'Dynamic offsetting off'],
    ['M178', 'Index table to 0°'], ['M179', 'Magazine to its reference pocket'], ['M180', 'Next-tool indexing back on (cancel M181)'], ['M181', 'Skip next-tool indexing'],
    ['M195', 'Tool breakage check cycle (option, set by M35)'], ['M196', 'Tool length measuring mode on (option)'], ['M197', 'Tool length measuring mode off (option)'],
    ['M198', 'Semi-automatic tool length measuring'], ['M199', 'Fully automatic tool length measuring (option)'],
    ['M911', 'Select pallet 1'], ['M912', 'Select pallet 2'], ['M998', 'Program chain: reset, search and cycle start'], ['M999', 'Program chain: reset and search'],
  ];
  const M_NOTES = 'At most four M-codes in a block. Spindle codes (M03 M04 M05 M19) and opposing pairs (M23/M24, M33/M34, M48/M49, M06/M149, pallet selections) may not share a block (alarm 227). Put a coolant-on code in a block before M09, not after it. High-pressure coolant (M131) runs at the pressure step chosen with M100–M106: give the step before or with M131.';

  // ---------------------------------------------------------------- drawings
  // Each drawing: a small SVG (400 × 200) and a caption. Labels sit beside what they name, with a dark outline so they
  // stay readable over lines; the parameter shown is drawn in orange; long explanations go in the caption.
  const C = { part: '#40505e', fill: '#1b2731', tool: '#c9d4dc', rapid: '#8a99a8', feed: '#5dff8f', hi: '#ffb347', txt: '#d6dde3', dim: '#7d8b98', bg: '#0b0f13' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const W = 400, H = 200;
  const svg = body => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif" font-size="11.5">` +
    `<defs><marker id="ah" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0.5L8 4L0 7.5z" fill="context-stroke"/></marker></defs>${body}</svg>`;
  const line = (x1, y1, x2, y2, c = C.dim, w = 1.2, dash = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  const move = (x1, y1, x2, y2, kind = 'feed', on = false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? C.hi : kind === 'feed' ? C.feed : C.rapid}" stroke-width="${on ? 2.6 : 1.7}"${kind === 'rapid' ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#ah)"/>`;
  const label = (x, y, s, on = false, anchor = 'start', c) =>
    `<text x="${x}" y="${y}" fill="${c || (on ? C.hi : C.txt)}" text-anchor="${anchor}" dominant-baseline="middle" stroke="${C.bg}" stroke-width="3.5" paint-order="stroke"${on ? ' font-weight="700"' : ''}>${esc(s)}</text>`;
  // dimensions: arrows inside when there is room, from outside when short; the label beside, never on the line
  function dimV(x, y1, y2, s, on, side = 'right') {
    const c = on ? C.hi : C.dim, w = on ? 2 : 1, top = Math.min(y1, y2), bot = Math.max(y1, y2), short = bot - top < 16;
    const tick = (y) => line(x - 5, y, x + 5, y, c, w);
    const body = short
      ? `<line x1="${x}" y1="${top - 12}" x2="${x}" y2="${top}" stroke="${c}" stroke-width="${w}" marker-end="url(#ah)"/><line x1="${x}" y1="${bot + 12}" x2="${x}" y2="${bot}" stroke="${c}" stroke-width="${w}" marker-end="url(#ah)"/>` + line(x, top, x, bot, c, w)
      : `<line x1="${x}" y1="${top}" x2="${x}" y2="${bot}" stroke="${c}" stroke-width="${w}" marker-start="url(#ah)" marker-end="url(#ah)"/>`;
    return tick(top) + tick(bot) + body + label(side === 'right' ? x + 8 : x - 8, (top + bot) / 2, s, on, side === 'right' ? 'start' : 'end', on ? null : C.dim);
  }
  function dimH(x1, x2, y, s, on, below = true) {
    const c = on ? C.hi : C.dim, w = on ? 2 : 1, l = Math.min(x1, x2), r = Math.max(x1, x2), short = r - l < 18;
    const tick = (x) => line(x, y - 5, x, y + 5, c, w);
    const body = short
      ? `<line x1="${l - 12}" y1="${y}" x2="${l}" y2="${y}" stroke="${c}" stroke-width="${w}" marker-end="url(#ah)"/><line x1="${r + 12}" y1="${y}" x2="${r}" y2="${y}" stroke="${c}" stroke-width="${w}" marker-end="url(#ah)"/>` + line(l, y, r, y, c, w)
      : `<line x1="${l}" y1="${y}" x2="${r}" y2="${y}" stroke="${c}" stroke-width="${w}" marker-start="url(#ah)" marker-end="url(#ah)"/>`;
    return tick(l) + tick(r) + body + label((l + r) / 2, below ? y + 13 : y - 11, s, on, 'middle', on ? null : C.dim);
  }
  const level = (y, s, x1 = 30, x2 = 300) => line(x1, y, x2, y, C.dim, 1, '3 3') + label(x2 + 6, y, s, false, 'start', C.dim);
  const block = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>`;
  // a part (section) with a hole from the top at x cx, width hw, depth hd; cone: drill point at the bottom
  const holePart = (top, cx, hw, hd, cone = true) =>
    `<path d="M20 ${top} H${cx - hw / 2} V${top + hd}${cone ? ` L${cx} ${top + hd + hw / 3} L${cx + hw / 2} ${top + hd}` : ` H${cx + hw / 2}`} V${top} H300 V${H - 8} H20 Z" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>`;
  const drill = (cx, tip, w = 16, h = 44, c = C.tool) => `<path d="M${cx - w / 2} ${tip - h} V${tip - w / 2} L${cx} ${tip} L${cx + w / 2} ${tip - w / 2} V${tip - h}" fill="${C.bg}" stroke="${c}" stroke-width="1.6"/>`;
  const spin = (cx, cy, r = 16, on = true) => `<path d="M${cx - r} ${cy} A${r} ${r / 2.6} 0 1 0 ${cx} ${cy + r / 2.6}" fill="none" stroke="${on ? C.hi : C.dim}" stroke-width="2" marker-end="url(#ah)"/>`;
  const out = (body, cap) => ({ svg: svg(body), cap });

  function pointHeights(k) {
    const top = 140, cx = 110;
    let b = holePart(top, cx, 30, 34) + level(26, 'Initial point') + drill(cx, 64) + move(cx, 22, cx, 60, 'rapid') + move(cx - 26, 66, cx - 26, 170, 'feed');
    const ys = { D1: 54, D41: 76, D42: 98 }, xs = { D1: 300, D41: 210, D42: 255 };
    for (const d of ['D41', 'D42', 'D1']) b += line(cx + 10, ys[d], xs[d], ys[d], C.dim, 1, '2 3') + dimV(xs[d], ys[d], top, d, k === d);
    return out(b, { D41: 'R point: the tool rapids down to here, then feeds. It also comes back up to here.', D1: '2nd R point: used instead of D41 when the hole was spotted or pre-machined (D91/D92 bits).', D42: '3rd R point: used after a pre-drill, and for chamfer cycle 2 (D91 bits 6, 7).' }[k]);
  }
  function dwell(k) {
    const top = 70, cx = 140;
    const what = { D3: 'spot drill, revolutions', D16: 'chamfering, revolutions', D19: 'end mill, revolutions', D22: 'tapping cycle, seconds', D29: 'chip removal, seconds', D32: 'revolutions before reversing' }[k] || '';
    const b = holePart(top, cx, 40, 80) + drill(cx, 160, 26, 70) + spin(cx, 150, 22) + label(195, 140, k + ' dwell', true) + label(195, 157, what);
    return out(b, k === 'D32' ? 'The tap keeps turning this many revolutions at the bottom before the spindle reverses.' : 'The tool stays at the hole bottom this long before coming back up.');
  }
  function pecking(k) {
    const top = 46, cx = 100, R = 28, bots = [80, 108, 130, 146];
    let b = holePart(top, cx, 26, 120, false) + level(R, 'R point');
    let prev = R;
    bots.forEach((y, i) => {
      const x = cx - 9 + i * 6, onFeed = (k === 'D54' || k === 'D58') && i === 0 || k === 'D59' && i === bots.length - 1;
      b += move(x, prev === R ? R : prev - 4, x, y, 'feed', onFeed);
      if (i < bots.length - 1) {
        const back = k === 'F12' || k === 'D55' ? y - 12 : R;
        b += move(x + 3, y, x + 3, back, 'rapid', k === 'D52');
        prev = back === R ? y : back + 4;
        if ((k === 'F12' || k === 'D55') && i === 1) b += dimV(150, y - 12, y, k + ' return', true);
      }
    });
    b += dimV(235, top, bots[0], 'q (DEPTH)', false) + dimV(235, bots[0], bots[1], 'q − D45', k === 'D45') + dimV(290, bots[2], bots[3], 'D46 minimum', k === 'D46');
    if (k === 'D53' || k === 'D62') b += label(140, 172, k === 'D53' ? 'pecks before a full return: D53' : 'at most D62 automatic pecks', true);
    const cap = { D45: 'Each peck is D45 shorter than the one before…', D46: '…but never shorter than D46.', F12: 'High-speed peck: after each peck the drill backs off only F12.',
      D55: 'Very deep drilling: the back-off between pecks.', D52: 'Very deep drilling: rapid out slowed to D52 %.', D53: 'Very deep drilling: pecks between full returns to the top.',
      D54: 'Very deep drilling: feed slowed to D54 % as the drill starts each cut.', D58: 'Very deep drilling: how far (as % of the depth) the slow start lasts.',
      D59: 'Very deep drilling: surface speed slowed to D59 % near the bottom.', D62: 'Most pecks the control adds by itself in Mazatrol programs.' }[k];
    return out(b, cap);
  }
  function tapping(k) {
    const top = 70, cx = 120;
    let b = holePart(top, cx, 30, 96, false) + level(44, 'R point', 30, 230) + `<rect x="${cx - 18}" y="10" width="36" height="20" fill="${C.bg}" stroke="${k === 'D31' ? C.hi : C.tool}" stroke-width="1.6"/>` +
      `<path d="M${cx - 8} 30 V150 M${cx + 8} 30 V150" stroke="${C.tool}" stroke-width="1.6"/>`;
    for (let y = 78; y < 150; y += 9) b += line(cx - 15, y, cx - 8, y + 4, C.dim) + line(cx + 8, y + 4, cx + 15, y, C.dim);
    b += line(cx + 18, 132, 200, 132, C.dim, 1, '2 3') + dimV(200, 132, 158, k === 'D43' ? 'D43 (pipe)' : 'D30 threads', k === 'D30' || k === 'D43');
    b += dimV(260, 10, 30, 'D31 holder stretch', k === 'D31');
    if (k === 'D48' || k === 'D49') b += spin(cx, 150, 20) + label(165, 110, k === 'D48' ? 'planetary: chamfer at D48 %' : 'planetary: back up D49 ÷ 10 threads', true);
    return out(b, { D30: 'The tap goes past the full thread by D30 threads (incomplete threads at the tap end).', D43: 'The same for pipe taps.',
      D31: 'Allowance for the floating tap holder stretching.', D48: 'Planetary tapping: the chamfer is cut at the pre-hole feed × D48 %.', D49: 'Planetary tapping: the tool backs up D49 ÷ 10 threads from the bottom before threading.' }[k]);
  }
  function chamferClear(k) {
    const top = 110, cx = 150, hw = 64;
    let b = holePart(top, cx, hw, 70, false);
    const wall = cx - hw / 2;
    b += `<path d="M${wall - 34} 30 V64 L${wall - 14} 92 L${wall + 8} 64 V30" fill="${C.bg}" stroke="${C.tool}" stroke-width="1.6"/>`;
    b += line(wall, top, wall - 12, top - 12, C.feed, 2.4);
    b += dimH(wall - 4, wall + 10, 160, k === 'E8' ? 'E8 radial' : 'D17 clearance', k === 'D17' || k === 'E8');
    b += line(wall - 14, 92, 230, 92, C.dim, 1, '2 3') + dimV(230, 92, top, 'E11 axial', k === 'E11');
    return out(b, { D17: 'Room the chamfer cutter keeps from the wall (point machining).', E8: 'Radial room the chamfer cutter keeps (line chamfering).', E11: 'Axial room the chamfer cutter keeps from the floor.' }[k]);
  }
  function approach(k) {
    let b = block(160, 40, 170, 100) + label(245, 90, 'shape', false, 'middle', C.dim);
    b += `<circle cx="96" cy="122" r="16" fill="none" stroke="${C.tool}" stroke-width="1.5"/>` + move(112, 122, 158, 122, 'feed');
    b += dimH(112, 160, 150, 'E2 1st', k === 'E2') + dimH(80, 160, 174, 'E5 2nd', k === 'E5');
    if (k === 'E1') b += `<circle cx="245" cy="70" r="14" fill="none" stroke="${C.hi}" stroke-width="2.2"/>` + label(245, 52, 'E1', true, 'middle');
    if (k === 'E21') b += line(160, 40, 205, 40, C.hi, 5) + label(182, 28, 'E21', true, 'middle');
    if (k === 'E30') b += line(330, 40, 330, 140, C.hi, 4) + label(322, 118, 'CLOSED end', true, 'end');
    return out(b, { E2: 'Top view. The tool starts (and escapes) this far off the shape.', E5: 'Used instead of E2 after pre-machining (E92/E95 bits).',
      E1: 'Where the tool starts and escapes inside a closed shape.', E21: 'Overlap where a closed wall pass meets itself.',
      E30: 'Start / escape distance where an open line meets a CLOSED end.' }[k]);
  }
  function axialStart(k) {
    const top = 130;
    let b = block(20, top, 280, 62) + level(30, 'Initial point', 20, 300) + `<rect x="90" y="78" width="26" height="38" fill="${C.bg}" stroke="${C.tool}" stroke-width="1.6"/>` +
      move(103, 32, 103, 76, 'rapid') + move(118, 112, 190, 112, 'feed');
    b += line(116, 116, 230, 116, C.dim, 1, '2 3') + dimV(230, 116, top, 'E9 1st', k === 'E9');
    b += line(116, 92, 285, 92, C.dim, 1, '2 3') + dimV(285, 92, top, 'E7 2nd', k === 'E7');
    return out(b, k === 'E9' ? 'The tool rapids down to this height above the face, then feeds.' : 'Used instead of E9 after pre-machining (E92/E95 bits).');
  }
  function overrideFeed(k) {
    const what = { E17: 'feeding down into the work (axial)', E18: 'full-width cuts in a pocket', E20: 'Z feed when face milling pecks down', E16: 'outer pass, mountain unit', E19: 'return pass, two-way slot' }[k] || '';
    const b = block(20, 130, 280, 62) + `<rect x="120" y="50" width="30" height="50" fill="${C.bg}" stroke="${C.tool}" stroke-width="1.6"/>` +
      move(135, 102, 135, 140, 'feed', true) + label(170, 110, k + ' %', true) + label(170, 126, 'of the programmed feed');
    return out(b, 'Feed used for ' + what + '.');
  }
  function corner(k) {
    let b = `<path d="M40 160 L230 160 L230 30" fill="none" stroke="${C.part}" stroke-width="10"/>` + `<path d="M40 142 L212 142 L212 30" fill="none" stroke="${C.feed}" stroke-width="2"/>`;
    b += `<path d="M175 142 L212 142 L212 105" fill="none" stroke="${C.hi}" stroke-width="3.6"/>`;
    const t = { E22: 'feed × E22 % here', E23: 'only if the cut here ≤ E23', E24: 'only if the cut here ≥ E24', E25: 'only if the corner < E25°' };
    b += label(250, 120, t[k] || t.E22, true);
    return out(b, 'Automatic corner override: the feed slows through inside corners (E22 %), when the cut is between E24 and E23 deep and the corner angle is under E25.');
  }
  function rampIn(k) {
    const helix = k === 'E32' || k === 'E33';
    let b = block(20, 140, 280, 52);
    if (helix) {
      for (let i = 0; i < 3; i++) b += `<ellipse cx="150" cy="${82 + i * 20}" rx="44" ry="9" fill="none" stroke="${C.feed}" stroke-width="1.6"/>`;
      b += dimH(150, 194, 60, 'E32 radius', k === 'E32', false) + label(205, 112, 'E33 slope', k === 'E33');
    } else {
      b += `<path d="M60 70 L250 136" stroke="${C.feed}" stroke-width="2" marker-end="url(#ah)"/>` + dimH(60, 250, 168, 'E34 ramp length', k === 'E34' || k === 'E36') +
        label(160, 88, k === 'E36' ? 'E36: the same, ramping out' : 'E35 slope', k === 'E35' || k === 'E36');
    }
    return out(b, helix ? 'Helical entry: the tool spirals down at this radius and slope.' : 'Tapered entry: the tool ramps down over this length at this slope (E36: on the way out).');
  }
  function faceMill(k) {
    let b = block(110, 50, 170, 100);
    [70, 100, 130].forEach((y, i) => { b += move(i % 2 ? 320 : 70, y, i % 2 ? 70 : 320, y, 'feed'); });
    b += line(280, 50, 280, 170, C.dim, 1, '2 3') + dimH(280, 320, 178, 'E12', k === 'E12');
    if (k === 'E37') b += label(195, 32, 'E37: back-off between Z pecks', true, 'middle');
    if (k === 'E15') b += label(195, 32, 'E15: short reciprocating path', true, 'middle');
    return out(b, { E12: 'Face milling, top view: each pass runs from E12 off the shape to E12 past it.', E15: 'Face mill path setting for short reciprocating passes.', E37: 'How far the face mill backs off between Z pecks.' }[k]);
  }
  function preHole(k) {
    const top = 70, cx = 150;
    const b = holePart(top, cx, 90, 100, false) + `<rect x="${cx - 14}" y="30" width="28" height="70" fill="${C.bg}" stroke="${C.tool}" stroke-width="1.6"/>` +
      line(cx + 14, 100, 240, 100, C.dim, 1, '2 3') + dimV(240, top, 100, 'D23', true);
    return out(b, 'End milling in a pre-drilled hole: the tool rapids this far into it before feeding.');
  }
  // ---------------------------------------------------------------- turning drawings (lathe, mill-turn)
  // A half section above the spindle axis: chuck on the left, the part out to its face on the right (Z0), X up.
  const AXY = 178, FACEX = 330, CHX = 52;
  const axis = () => line(16, AXY, 392, AXY, C.dim, 1, '8 4 2 4') + label(388, AXY + 11, 'spindle axis', false, 'end', C.dim);
  const chuck = (top = 70) => `<rect x="18" y="${top - 6}" width="${CHX - 18}" height="${AXY - top + 6}" fill="#26313b" stroke="${C.part}"/>` + label(35, top - 14, 'chuck', false, 'middle', C.dim);
  // the stock: outer radius at y = od, bore (if any) at y = id
  const stock = (od = 64, id = 0, x2 = FACEX) => `<path d="M${CHX} ${od} H${x2} V${id || AXY} H${CHX} Z" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>`;
  const cutArea = (x1, y1, x2, y2) => `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" fill="${C.hi}" fill-opacity="0.28" stroke="${C.hi}" stroke-width="1.6"/>`;
  const insert = (x, y, ang = 0) => `<g transform="translate(${x} ${y}) rotate(${ang})"><path d="M0 0 L14 -8 L22 -30 L8 -30 Z" fill="${C.bg}" stroke="${C.tool}" stroke-width="1.6"/></g>`;
  function turnPart(k) {
    const part = k.split(':')[1];
    let b = axis() + chuck();
    if (part === 'OUT') b += stock(64) + cutArea(230, 64, FACEX, 100) + insert(FACEX + 4, 98) + label(240, 50, 'OUT: outside diameter', true);
    else if (part === 'IN') b += stock(64, 140) + cutArea(250, 112, FACEX, 140) + insert(FACEX + 18, 116, 180) + label(150, 50, 'IN: inside diameter (bore)', true);
    else if (part === 'FCE' || part === 'FACE') b += stock(64, 0, FACEX + 18) + cutArea(FACEX, 64, FACEX + 18, AXY) + insert(FACEX + 26, 70, 90) + label(200, 50, 'FACE: the end face (Z0 side)', true);
    else b += `<path d="M${CHX + 50} 64 H${FACEX} V${AXY} H${CHX + 50} Z" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>` + cutArea(CHX + 50, 64, CHX + 68, 150) + insert(CHX + 40, 70, -90) + label(150, 50, 'BACK: the face toward the chuck', true);
    return out(b, 'PART: which part of the work the unit cuts. OUT outside diameter, IN bore, FACE (FCE) the end face, BACK the back face; the middle-start forms (in the menu with a bar) start partway along instead of from the end.');
  }
  // BAR / CPY roughing patterns: passes along Z from the face toward the chuck, retracting as the pattern says
  function barPat(k) {
    const n = +k.slice(-1), top = 64, rows = [82, 100, 118], x0 = FACEX + 10, ends = [170, 200, 230];
    let b = axis() + chuck() + stock(top) + `<path d="M${CHX} 136 H160 V118 H190 V100 H220 V82 H${FACEX}" fill="none" stroke="${C.tool}" stroke-width="1.6"/>` + label(120, 150, 'finished shape', false, 'middle', C.dim);
    rows.forEach((y, i) => {
      const xe = ends[i];
      b += move(x0, y, xe, y, 'feed', true);
      if (n === 1 || n === 4) b += move(xe, y, xe + 14, y - 14, 'feed', true) + move(xe + 14, y - 14, x0, y - 14, 'rapid');
      else b += move(xe, y, xe, y - 12, 'rapid') + move(xe, y - 12, x0, y - 12, 'rapid');
      if (n === 3 || n === 4) for (let x = x0 - 30; x > xe + 6; x -= 30) b += `<circle cx="${x}" cy="${y}" r="3" fill="${C.hi}"/>`;
    });
    if (n === 2) b += line(250, top, 250, AXY - 40, C.hi, 1.2, '4 3') + line(290, top, 290, AXY - 40, C.hi, 1.2, '4 3') + label(310, 150, '1', true, 'middle') + label(270, 150, '2', true, 'middle') + label(220, 150, '3', true, 'middle');
    const cap = ['#0: each pass straight along Z, then straight up and back (the usual roughing).',
      '#1: each pass pulls out at 45° at its end (high-speed roughing: less time in the air).',
      '#2: cuts in sections from the open end (1, 2, 3 …) so chips leave deep bores; OUT or IN only.',
      '#3: as #0, with the feed stopped every DEP-2 of travel (dots) for TC71 spindle turns so the chip breaks.',
      '#4: as #1, with the chip-break stops of #3.'][n] || '';
    return out(b, 'BAR / CPY PAT. ' + cap);
  }
  function groove(k) {
    const n = +k.slice(-1), y0 = 70, d = 56, x = 200, w = 46;
    let b = axis() + chuck() + stock(y0);
    const shapes = [
      `M${x} ${y0} V${y0 + d} H${x + w} V${y0}`, `M${x - 12} ${y0} L${x} ${y0 + d} H${x + w} L${x + w + 12} ${y0}`,
      `M${x} ${y0} V${y0 + d} H${x + w} L${x + w + 16} ${y0}`, `M${x - 16} ${y0} L${x} ${y0 + d} H${x + w} V${y0}`,
      `M${x} ${y0} V${AXY} M${x} ${y0} H${x + 14} L${x + 26} ${y0 + 12}`, `M${x + w} ${y0} V${AXY} M${x + w} ${y0} H${x + w - 14} L${x + w - 26} ${y0 + 12}`];
    b += `<path d="${shapes[n] || shapes[0]}" fill="${n >= 4 ? 'none' : C.bg}" stroke="${C.hi}" stroke-width="2.2"/>`;
    if (n <= 3) b += dimH(x, x + w, y0 + d + 18, 'WIDTH', false);
    const cap = ['#0: a square groove (or one with sloping walls given in the shape).', '#1: a groove with both walls sloping (isosceles trapezoid).',
      '#2: right wall sloping (right taper).', '#3: left wall sloping (left taper).', '#4: cut-off with the corner on the right side; OUT only (feed slowed per TC50).',
      '#5: cut-off with the corner on the left side; OUT only.'][n] || '';
    return out(b, 'T.GROOVE PAT ' + cap + (n >= 1 && n <= 3 ? ' An R tool roughs it leaving FINISH; the F tool finishes walls and bottom.' : ''));
  }
  function threadPat(k) {
    const n = +k.slice(-1), x = 200, y = 70, h = 70, N = 6;
    let b = `<path d="M${x - 60} ${y} L${x} ${y + h} L${x + 60} ${y}" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>` + label(x, y - 14, 'thread form (one tooth space)', false, 'middle', C.dim);
    for (let i = 1; i <= N; i++) {
      const dd = h * (n === 1 ? i / N : Math.sqrt(i / N)), ww = 60 * dd / h;
      b += line(x - ww, y + dd, x + ww, y + dd, i === N ? C.hi : C.feed, i === N ? 2 : 1.2);
      if (i === 1 || i === N) b += label(x + 70, y + dd, i === N ? 'last pass: full height' : 'pass 1', i === N, 'start', i === N ? null : C.dim);
    }
    return out(b, n === 1 ? 'THREAD PAT. #1: the same depth every pass — later passes take more metal.' : 'THREAD PAT. #0 (standard): every pass takes the same area — the passes get shallower as the tool goes deeper. DEP-2/NUM. sets how many (at least 3).');
  }
  function drillPat(k) {
    const n = +k.slice(-1), cx = 200, top = 60, bot = 170, pk = [100, 132, bot];
    let b = `<path d="M60 ${top} H${cx - 14} V${bot} L${cx} ${bot + 10} L${cx + 14} ${bot} V${top} H340 V192 H60 Z" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>`;
    let prev = top - 16;
    const depths = n === 4 ? [104, 140, 160, bot] : pk;
    depths.forEach((dpt, i) => {
      const xi = cx - 36 + i * 18;
      b += move(xi, Math.max(prev - (n === 2 ? 8 : 0), top - 16), xi, dpt, 'feed', true);
      if (n === 2) b += move(xi, dpt, xi + 6, dpt - 10, 'feed');
      else if (n === 0 || n === 3) b += move(xi, dpt, xi + 9, top - 16, 'feed');
      else b += move(xi, dpt, xi + 9, top - 16, 'rapid');
      prev = dpt;
    });
    const cap = ['#0: drilling — each peck, back out to the start at the feed.', '#1: deep hole — each peck, rapid back out to clear the chips.',
      '#2: high speed — after each peck it backs off TC47 at the feed and carries on (chips break, stay in the hole).', '#3: reaming — feed in and feed out.',
      '#4: pecks that get shorter: DEP-1 first, less DEP-2 each time, not under DEP-3.'][n] || '';
    return out(b, 'T.DRILL PAT. ' + cap);
  }
  function millMode(k) {
    const m = k.split(':')[1];
    let b = axis() + chuck() + stock(64, 0, 300) + `<ellipse cx="300" cy="121" rx="14" ry="57" fill="#22303b" stroke="${C.part}"/>`;
    if (m === 'XC') b += drill(300, 112, 12, 34, C.hi).replace(/M(\d+)/, 'M$1') + `<circle cx="300" cy="100" r="5" fill="${C.hi}"/>` + spin(300, 40, 20) + label(280, 40, 'C turns the part', true, 'end');
    else if (m === 'ZC') b += `<g transform="rotate(0)">${drill(220, 64, 12, 34, C.hi)}</g>` + `<circle cx="220" cy="64" r="5" fill="${C.hi}"/>` + spin(150, 40, 20) + label(240, 40, 'tool in X onto the diameter', true);
    else if (m === 'XY') b += drill(300, 92, 12, 34, C.hi) + line(300, 92, 300, 140, C.hi, 1.4, '4 3') + label(280, 40, 'tool on the face, moving in X and Y', true, 'end');
    else b += `<rect x="150" y="60" width="110" height="10" fill="${C.hi}" fill-opacity="0.35" stroke="${C.hi}"/>` + drill(205, 60, 12, 30, C.hi) + label(120, 22, 'a flat on the side, tool moving in Z and Y', true);
    const cap = { XC: 'MODE XC: on the end face; the C-axis turns the part to each angle (holes along Z at radius R).',
      ZC: 'MODE ZC: on the outside diameter; holes in X, lines along Z, the C-axis turning the part.',
      XY: 'MODE XY: on the end face with the Y-axis (flats and pockets not centred on the axis).',
      ZY: 'MODE ZY: on the side with the Y-axis (flats along Z).' }[m] || '';
    return out(b, cap + ' [ ] around the mode: the path is interpolated with C.');
  }
  function commonTurn(k) {
    const f = k.split(':')[1];
    let b = axis() + chuck() + `<path d="M${CHX} 54 H340 V150 H${CHX} Z" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>` + `<path d="M${CHX} 150 H340 V${AXY} H${CHX} Z" fill="#0d151b" stroke="${C.part}" stroke-dasharray="3 3"/>`;
    b += line(326, 54, 326, AXY, C.dim, 1, '2 3');
    b += dimV(356, 54, AXY, 'OD-MAX', f === 'OD-MAX', 'left');
    b += dimV(70, 150, AXY, 'ID-MIN', f === 'ID-MIN', 'right');
    b += dimH(CHX, 340, 30, 'LENGTH', f === 'LENGTH', false);
    b += dimH(326, 340, 46, 'WORK FACE', f === 'WORK-FACE' || f === 'WORK FACE', false);
    return out(b, 'The stock: OD-MAX its largest diameter, ID-MIN the bore it already has (0 solid), LENGTH, and WORK FACE the stock left on the end face beyond Z0 (dotted).');
  }
  function safety(k) {
    const on = { TC37: 'o', TC38: 'i', TC39: 'f', TC40: 'b' }[k];
    let b = axis() + chuck() + stock(80, 140, 300);
    b += `<path d="M${CHX + 30} 64 H316 V156 H${CHX + 30}" fill="none" stroke="${C.feed}" stroke-dasharray="5 4" stroke-width="1.4"/>`;
    b += dimV(200, 64, 80, 'TC37 outside', on === 'o', 'right') + dimV(130, 140, 156, 'TC38 inside', on === 'i', 'right') + dimH(300, 316, 110, 'TC39 front', on === 'f') + dimH(CHX + 30, CHX + 50, 110, 'TC40 back', on === 'b');
    return out(b, 'Safety contour (dashed): how far outside the stock the tool rapids before and after cutting. TC37 outside diameter and TC38 inside (radius), TC39 in front of the face, TC40 behind the back face.');
  }
  const DRAW = {
    TC37: safety, TC38: safety, TC39: safety, TC40: safety,
    D1: pointHeights, D41: pointHeights, D42: pointHeights,
    D3: dwell, D16: dwell, D19: dwell, D22: dwell, D29: dwell, D32: dwell,
    D45: pecking, D46: pecking, F12: pecking, D55: pecking, D52: pecking, D53: pecking, D54: pecking, D58: pecking, D59: pecking, D62: pecking,
    D30: tapping, D31: tapping, D43: tapping, D48: tapping, D49: tapping,
    D17: chamferClear, E8: chamferClear, E11: chamferClear, D23: preHole,
    E1: approach, E2: approach, E5: approach, E21: approach, E30: approach,
    E7: axialStart, E9: axialStart, E12: faceMill, E15: faceMill, E37: faceMill,
    E16: overrideFeed, E17: overrideFeed, E18: overrideFeed, E19: overrideFeed, E20: overrideFeed,
    E22: corner, E23: corner, E24: corner, E25: corner, E32: rampIn, E33: rampIn, E34: rampIn, E35: rampIn, E36: rampIn,
  };
  // the drawing of what a parameter adjusts and its caption, as HTML, or '' (bit fields are listed bit by bit instead)
  function drawing(d) {
    const f = DRAW[d];
    if (!f) return '';
    const r = f(d);
    return r.svg + (r.cap ? `<p class="refcap">${esc(r.cap)}</p>` : '');
  }


  // Lathe (Smooth G) and mill-turn (Smooth Ai) G- and M-code lists: the codes and groups from their manuals, our wording.
  const G_LATHE = [["G00", "Rapid to a position", "01", ""], ["G01", "Straight line at the feed", "01", ""], ["G01.1", "Thread along a line with C-axis interpolation", "01", ""], ["G02", "Arc clockwise", "01", ""], ["G03", "Arc counter-clockwise", "01", ""], ["G02.1", "Spiral clockwise", "01", ""], ["G03.1", "Spiral counter-clockwise", "01", ""], ["G02.2", "Involute curve clockwise", "01", ""], ["G03.2", "Involute curve counter-clockwise", "01", ""], ["G04", "Dwell", "00", ""], ["G05", "High-speed machining mode", "00", ""], ["G06.1", "Fine spline through the points", "01", ""], ["G06.2", "NURBS curve", "01", ""], ["G07", "Virtual-axis interpolation", "00", ""], ["G07.1", "Cylinder interpolation (cut on a cylinder surface)", "00", ""], ["G08.5", "Oscillating cut (chip breaking)", "00", ""], ["G09", "Exact stop in this block", "00", ""], ["G10", "Data setting (G10) on", "00", ""], ["G11", "Data setting off", "00", ""], ["G12.1", "Polar coordinate interpolation on (X-C as X-Y)", "26", ""], ["G13.1", "Polar coordinate interpolation off", "26", "▲"], ["G17", "Work in the XY plane", "02", ""], ["G18", "Work in the ZX plane", "02", ""], ["G19", "Work in the YZ plane", "02", ""], ["G20", "Inch input", "06", ""], ["G21", "Metric input", "06", ""], ["G22", "Stroke check before moving on", "04", ""], ["G23", "Stroke check before moving off", "04", "▲"], ["G27", "Check the reference point", "00", ""], ["G28", "Go to the reference point", "00", ""], ["G29", "Come back from the reference point", "00", ""], ["G30", "Go to the 2nd, 3rd or 4th reference point", "00", ""], ["G30.1", "Go to the floating reference point", "00", ""], ["G31", "Skip (stop the move on a signal)", "00", ""], ["G31.1", "Skip, step 1", "00", ""], ["G31.2", "Skip, step 2", "00", ""], ["G31.3", "Skip, step 3", "00", ""], ["G32/G33", "Thread cutting, straight or taper", "01", ""], ["G34", "Thread cutting with a changing lead", "01", ""], ["G234.1", "Holes on a circle", "00", ""], ["G235", "Holes on a line", "00", ""], ["G236", "Holes on an arc", "00", ""], ["G237.1", "Holes on a grid", "00", ""], ["G40", "Nose / tool radius compensation off", "07", "▲"], ["G41", "Nose / tool radius compensation, tool on the left", "07", ""], ["G42", "Nose / tool radius compensation, tool on the right", "07", ""], ["G50", "Set the coordinate system / top spindle speed", "00", ""], ["G50.2", "Polygon turning off", "23", "▲"], ["G51.2", "Polygon turning on", "23", ""], ["G52", "Local coordinate system", "00", ""], ["G52.5", "Leave the MAZATROL coordinate system", "00", ""], ["G53", "Machine coordinates (this block)", "00", ""], ["G53.5", "Use the MAZATROL coordinate system", "00", ""], ["G54", "Work offset 1", "12", "▲"], ["G54.4", "Correct for the part's setup error", "27", ""], ["G55", "Work offset 2", "12", ""], ["G56", "Work offset 3", "12", ""], ["G57", "Work offset 4", "12", ""], ["G58", "Work offset 5", "12", ""], ["G59", "Work offset 6", "12", ""], ["G54.1", "Extra work offsets", "12", ""], ["G60", "Position from one direction", "00", ""], ["G61", "Exact stop mode", "13", ""], ["G62", "Automatic corner override", "13", ""], ["G63", "Tapping mode", "13", ""], ["G64", "Cutting mode", "13", "▲"], ["G65", "Macro call (once)", "00", ""], ["G66", "Macro call after every move (A)", "14", ""], ["G66.1", "Macro call after every block (B)", "14", ""], ["G67", "Modal macro call off", "14", "▲"], ["G68.5", "3-D coordinate conversion on", "16", ""], ["G69.5", "3-D coordinate conversion off", "16", "▲"], ["G70", "Finishing pass along the shape (P to Q)", "09", ""], ["G71", "Rough turning along Z (P to Q)", "09", ""], ["G72", "Rough facing along X (P to Q)", "09", ""], ["G73", "Roughing that follows the shape (P to Q)", "09", ""], ["G74", "Peck cut-off / grooving along Z", "09", ""], ["G75", "Peck cut-off / grooving along X", "09", ""], ["G76", "Threading in several passes", "09", ""], ["G80", "Fixed cycle off", "09", "▲"], ["G83", "Drilling on the face", "09", ""], ["G84", "Tapping on the face", "09", ""], ["G84.2", "Synchronous tapping on the face", "09", ""], ["G85", "Boring on the face", "09", ""], ["G87", "Drilling from the outside (along X)", "09", ""], ["G88", "Tapping from the outside", "09", ""], ["G88.2", "Synchronous tapping from the outside", "09", ""], ["G89", "Boring from the outside", "09", ""], ["G90", "Turning cycle along Z (one pass)", "09", ""], ["G92", "Threading cycle (one pass)", "09", ""], ["G94", "Facing cycle along X (one pass)", "09", ""], ["G96", "Constant surface speed on", "17", ""], ["G97", "Constant surface speed off (S = rpm)", "17", ""], ["G98", "Feed per minute", "05", ""], ["G99", "Feed per revolution", "05", ""], ["G109", "One program for several processes", "00", ""], ["G110", "Cross machining: choose the axis", "20", ""], ["G111", "Cross machining off", "20", ""], ["G112", "Send M, S, T, B to the other system", "00", ""], ["G113", "Hob milling off", "23", ""], ["G114.3", "Hob milling on", "23", ""], ["G117/G118", "M / S / T codes while the axes move", "00", ""], ["G122", "Polar coordinate input on", "18", ""], ["G123", "Polar coordinate input off", "18", ""], ["G122.1", "X input as a radius on", "00", ""], ["G123.1", "X input as a radius off", "00", "▲"], ["G130", "Tornado cycle", "", ""], ["G136", "Measuring macro", "", ""], ["G137", "Compensation macro", "", ""], ["G140", "Engraving", "", ""]];
  const G_MILLTURN = [["G00", "Rapid to a position", "01", ""], ["G01", "Straight line at the feed", "01", ""], ["G01.1", "Thread along a line with C-axis interpolation", "01", ""], ["G02", "Arc clockwise", "01", ""], ["G03", "Arc counter-clockwise", "01", ""], ["G02.1", "Spiral clockwise", "01", ""], ["G03.1", "Spiral counter-clockwise", "01", ""], ["G02.2", "Involute curve clockwise", "01", ""], ["G03.2", "Involute curve counter-clockwise", "01", ""], ["G04", "Dwell", "00", ""], ["G05", "High-speed machining mode", "00", ""], ["G06.1", "Fine spline through the points", "01", ""], ["G06.2", "NURBS curve", "01", ""], ["G07", "Virtual-axis interpolation", "00", ""], ["G07.1", "Cylinder interpolation (cut on a cylinder surface)", "00", ""], ["G08.5", "Oscillating cut (chip breaking)", "00", ""], ["G09", "Exact stop in this block", "00", ""], ["G10", "Data setting (G10) on", "00", ""], ["G11", "Data setting off", "00", ""], ["G12", "Full circle, clockwise", "00", ""], ["G13", "Full circle, counter-clockwise", "00", ""], ["G12.1", "Polar coordinate interpolation on (X-C as X-Y)", "26", ""], ["G13.1", "Polar coordinate interpolation off", "26", "▲"], ["G17", "Work in the XY plane", "02", ""], ["G18", "Work in the ZX plane", "02", ""], ["G19", "Work in the YZ plane", "02", ""], ["G20", "Inch input", "06", ""], ["G21", "Metric input", "06", ""], ["G22", "Stroke check before moving on", "04", ""], ["G23", "Stroke check before moving off", "04", "▲"], ["G27", "Check the reference point", "00", ""], ["G28", "Go to the reference point", "00", ""], ["G29", "Come back from the reference point", "00", ""], ["G30", "Go to the 2nd, 3rd or 4th reference point", "00", ""], ["G31", "Skip (stop the move on a signal)", "00", ""], ["G31.1", "Skip, step 1", "00", ""], ["G31.2", "Skip, step 2", "00", ""], ["G31.3", "Skip, step 3", "00", ""], ["G32/G33", "Thread cutting, straight or taper", "01", ""], ["G34", "Thread cutting with a changing lead", "01", ""], ["G34.1", "Holes on a circle", "00", ""], ["G35", "Holes on a line", "00", ""], ["G36", "Holes on an arc", "00", ""], ["G37.1", "Holes on a grid", "00", ""], ["G37", "Measure the tool length", "00", ""], ["G38", "Radius compensation: direction vector", "00", ""], ["G39", "Radius compensation: arc at a corner", "00", ""], ["G40", "Nose / tool radius compensation off", "07", "▲"], ["G41", "Nose / tool radius compensation, tool on the left", "07", ""], ["G41.2/G41.5", "Five-axis radius compensation, tool on the left", "07", ""], ["G42", "Nose / tool radius compensation, tool on the right", "07", ""], ["G42.2/G42.5", "Five-axis radius compensation, tool on the right", "07", ""], ["G43", "Tool length offset +", "08", ""], ["G43.1", "Tool length offset along the tool axis", "08", ""], ["G43.4", "Tool tip point control (type 1) on", "08", ""], ["G43.5", "Tool tip point control (type 2) on", "08", ""], ["G43.8", "Cutting point command (type 1) on", "08", ""], ["G43.9", "Cutting point command (type 2) on", "08", ""], ["G44", "Tool length offset −", "08", ""], ["G45", "Tool position offset: longer", "00", ""], ["G46", "Tool position offset: shorter", "00", ""], ["G47", "Tool position offset: twice longer", "00", ""], ["G48", "Tool position offset: twice shorter", "00", ""], ["G49", "Tool position offset off", "08", "▲"], ["G92", "Set the coordinate system / top spindle speed", "00", ""], ["G50", "Scaling off", "11", "▲"], ["G51", "Scaling on", "11", ""], ["G50.1", "Mirror image off", "19", "▲"], ["G51.1", "Mirror image on", "19", ""], ["G50.2", "Polygon turning off", "23", "▲"], ["G51.2", "Polygon turning on", "23", ""], ["G52", "Local coordinate system", "00", ""], ["G53", "Machine coordinates (this block)", "00", ""], ["G53.1", "Tool-axis direction control", "00", ""], ["G54", "Work offset 1", "12", "▲"], ["G54.4", "Correct for the part's setup error", "27", ""], ["G55", "Work offset 2", "12", ""], ["G56", "Work offset 3", "12", ""], ["G57", "Work offset 4", "12", ""], ["G58", "Work offset 5", "12", ""], ["G59", "Work offset 6", "12", ""], ["G54.1", "Extra work offsets", "12", ""], ["G54.2", "Fixture offset", "23", ""], ["G60", "Position from one direction", "00", ""], ["G61", "Exact stop mode", "13", ""], ["G61.1", "High-accuracy mode (geometry compensation)", "13", ""], ["G61.2", "Spline through the points (modal)", "13", ""], ["G62", "Automatic corner override", "13", ""], ["G63", "Tapping mode", "13", ""], ["G64", "Cutting mode", "13", "▲"], ["G65", "Macro call (once)", "00", ""], ["G66", "Macro call after every move (A)", "14", ""], ["G66.1", "Macro call after every block (B)", "14", ""], ["G67", "Modal macro call off", "14", "▲"], ["G68", "Turn the coordinates / 3-D coordinate conversion on", "16", ""], ["G69", "Coordinate rotation, 3-D conversion and inclined plane off", "16", "▲"], ["G68.2", "Inclined-plane machining on", "16", ""], ["G68.3", "Inclined-plane machining on (by the tool axis direction)", "16", ""], ["G68.4", "Incremental coordinates for inclined-plane machining", "16", ""], ["G180", "Energy saving level", "", ""], ["G270", "Finishing pass along the shape (P to Q)", "09", ""], ["G271", "Rough turning along Z (P to Q)", "09", ""], ["G272", "Rough facing along X (P to Q)", "09", ""], ["G273", "Roughing that follows the shape (P to Q)", "09", ""], ["G274", "Peck cut-off / grooving along Z", "09", ""], ["G275", "Peck cut-off / grooving along X", "09", ""], ["G276", "Threading in several passes", "09", ""], ["G80", "Fixed cycle off", "09", "▲"], ["G283", "Drilling on the face", "09", ""], ["G284", "Tapping on the face", "09", ""], ["G284.2", "Synchronous tapping on the face", "09", ""], ["G285", "Boring on the face", "09", ""], ["G287", "Drilling from the outside (along X)", "09", ""], ["G288", "Tapping from the outside", "09", ""], ["G288.2", "Synchronous tapping from the outside", "09", ""], ["G289", "Boring from the outside", "09", ""], ["G290", "Turning cycle along Z (one pass)", "09", ""], ["G292", "Threading cycle (one pass)", "09", ""], ["G294", "Facing cycle along X (one pass)", "09", ""], ["G71.1", "Chamfer cutter cycle, clockwise", "09", ""], ["G72.1", "Chamfer cutter cycle, counter-clockwise", "09", ""], ["G73", "High-speed peck drilling", "09", ""], ["G74", "Reverse (left-hand) tapping", "09", ""], ["G75", "Boring cycle 1", "09", ""], ["G76", "Boring cycle 2", "09", ""], ["G77", "Back spot facing", "09", ""], ["G78", "Boring cycle 3", "09", ""], ["G79", "Boring cycle 4", "09", ""], ["G81", "Spot drilling", "09", ""], ["G82", "Drilling (with dwell)", "09", ""], ["G82.2", "Peck drilling", "09", ""], ["G83", "Deep-hole peck drilling", "09", ""], ["G84", "Tapping", "09", ""], ["G84.2", "Synchronous tapping", "09", ""], ["G84.3", "Synchronous reverse tapping", "09", ""], ["G85", "Reaming", "09", ""], ["G86", "Boring cycle 5", "09", ""], ["G87", "Back boring", "09", ""], ["G88", "Boring cycle 6", "09", ""], ["G89", "Boring cycle 7", "09", ""], ["G90", "Absolute positions", "03", ""], ["G91", "Incremental moves", "03", ""], ["G92.5", "Turn the work coordinates", "00", ""], ["G93", "Inverse time feed", "05", ""], ["G96", "Constant surface speed on", "17", ""], ["G97", "Constant surface speed off (S = rpm)", "17", ""], ["G94", "Feed per minute", "05", ""], ["G95", "Feed per revolution", "05", ""], ["G98", "Cycles return to the initial level", "10", "▲"], ["G99", "Cycles return to the R level", "10", ""], ["G117/G118", "M / S / T codes while the axes move", "00", ""], ["G109", "One program for several processes", "00", ""], ["G110", "Cross machining: choose the axis", "20", ""], ["G111", "Cross machining: cancel the axis", "20", ""], ["G112", "Send M, S, T, B to the other system", "00", ""], ["G113", "Hob milling off", "23", ""], ["G114.3", "Hob milling on", "23", ""], ["G16", "Polar coordinate input on", "18", ""], ["G15", "Polar coordinate input off", "18", ""], ["G10.9", "Diameter or radius input", "", ""], ["G130", "Tornado cycle", "", ""], ["G136", "Measuring macro", "", ""], ["G137", "Compensation macro", "", ""], ["G140", "Engraving", "", ""], ["G148", "Orbit machining on", "00", ""], ["G149", "Orbit machining off", "00", ""]];
  const M_LATHE = [["M00", "Program stop"], ["M01", "Optional stop"], ["M02", "End of program"], ["M03", "Spindle forward"], ["M04", "Spindle reverse"], ["M05", "Spindle stop"], ["M08", "Coolant on"], ["M09", "Coolant and air blast off"], ["M16", "Spindle orient 0° (option)"], ["M17", "Spindle orient 120° (option)"], ["M18", "Spindle orient 240° (option)"], ["M19", "Spindle orient to S angle, 0.1° units (option)"], ["M20", "Robot service request 1 (M20–M29: 1–10)"], ["M21", "Robot service request 2"], ["M22", "Robot service request 3"], ["M23", "Robot service request 4"], ["M24", "Robot service request 5"], ["M25", "Robot service request 6"], ["M26", "Robot service request 7"], ["M27", "Robot service request 8"], ["M28", "Robot service request 9"], ["M29", "Robot service request 10"], ["M30", "End of program, reset and rewind"], ["M31", "Tailstock advance (presses at slow speed to position 1)"], ["M32", "Tailstock retract"], ["M33", "Chuck pressure low"], ["M34", "Chuck pressure high"], ["M45", "Turret air blast on (off: M09)"], ["M48", "Parts catcher advance"], ["M49", "Parts catcher retract"], ["M51", "Error detection off (exact stop off)"], ["M52", "Error detection on (exact stop mode)"], ["M53", "Thread chamfering (pull-out) off"], ["M54", "Thread chamfering (pull-out) on"], ["M56", "Front door open"], ["M57", "Front door close"], ["M58", "Chuck air blast on (spindle turns about 45 min⁻¹, timer)"], ["M68", "Bar feeder call 1"], ["M69", "Bar feeder call 2"], ["M72", "Chuck inner (ID) gripping"], ["M73", "Chuck outer (OD) gripping"], ["M74", "Work rest connected to the turret"], ["M75", "Work rest disconnected from the turret"], ["M81", "Workpiece measurement start"], ["M82", "Workpiece measurement end"], ["M83", "Tool measurement start (tool eye arm out)"], ["M84", "Tool measurement end (tool eye arm in)"], ["M86", "Work rest arm unclamp (open)"], ["M87", "Work rest arm clamp (close)"], ["M90", "Parts catcher advance (no end check)"], ["M91", "Parts catcher retract (no end check)"], ["M96", "User macro interrupt on"], ["M97", "User macro interrupt off"], ["M98", "Subprogram call"], ["M99", "End of subprogram"], ["M123", "Barrier cancel (chuck / tailstock)"], ["M124", "Cancel M123"], ["M130", "Spindle cooling fan stop"], ["M131", "Cancel M130"], ["M160", "Shower coolant on"], ["M161", "Shower coolant off"], ["M169", "High-pressure coolant on (off: M09)"], ["M198", "EIA-MAZATROL repeat on"], ["M199", "EIA-MAZATROL repeat off"], ["M200", "C-axis connect / milling mode"], ["M201", "C-axis connect / milling mode (same as M200)"], ["M202", "C-axis disconnect / turning mode"], ["M203", "Milling spindle forward"], ["M204", "Milling spindle reverse"], ["M205", "Milling spindle stop"], ["M206", "Spindle chuck open"], ["M207", "Spindle chuck close"], ["M210", "C-axis clamp"], ["M211", "C-axis brake"], ["M212", "C-axis unclamp"], ["M213", "C-axis brake only (M210 brakes instead)"], ["M214", "C-axis unclamp only (M210/M211 unclamp instead)"], ["M215", "Cancel M214 / M216"], ["M216", "C-axis unclamp ignore mode (M212 ignored)"], ["M230", "Grinder mode on (turning and milling spindle together)"], ["M248", "Spindle speed reached check"], ["M249", "Turret unclamp during axis move (tool change preparation)"], ["M260", "Polygon mode on"], ["M261", "Polygon mode off"], ["M262", "Hobbing mode on"], ["M263", "Hobbing mode off"], ["M268", "Yt-axis on"], ["M269", "Cancel M268"], ["M274", "Work rest coolant on (with M08 / M09)"], ["M275", "Work rest coolant off"], ["M292", "Spindle 2 chuck inner (ID) gripping"], ["M293", "Spindle 2 chuck outer (OD) gripping"], ["M300", "Spindle 2 point milling start (C-axis connect)"], ["M301", "Spindle 2 line milling start (C-axis connect)"], ["M302", "Spindle 2 milling end (turning mode)"], ["M303", "Spindle 2 forward"], ["M304", "Spindle 2 reverse"], ["M305", "Spindle 2 stop"], ["M306", "Spindle 2 chuck open"], ["M307", "Spindle 2 chuck close"], ["M310", "C2-axis clamp"], ["M311", "C2-axis brake"], ["M312", "C2-axis unclamp"], ["M313", "C2-axis brake only"], ["M314", "C2-axis unclamp only"], ["M315", "Cancel M314"], ["M316", "Spindle 2 orient 0°"], ["M317", "Spindle 2 orient 120°"], ["M318", "Spindle 2 orient 240°"], ["M319", "Spindle 2 orient to S angle"], ["M331", "Spindle winding: high speed"], ["M332", "Cancel M331"], ["M351", "M248 (spindle speed check) off"], ["M352", "M248 (spindle speed check) on"], ["M353", "M249 off"], ["M354", "M249 on"], ["M355", "Tool change complete after turret clamp"], ["M356", "Tool change complete with the clamp command"], ["M358", "Spindle 2 chuck air blast"], ["M370", "Axis load detection off (A***: axis)"], ["M371", "Axis load detection on (A***: table and axis)"], ["M372", "Axis load detection paused"], ["M373", "Axis load detection restart"], ["M374", "On overload: feed hold"], ["M375", "On overload: feed hold and spindle stop"], ["M376", "Overload detection level % (A***)"], ["M377", "Overload detection time (A***)"], ["M378", "Overload peak % / detection count (A***)"], ["M379", "Store M376–M378 under table No. (A***)"], ["M398", "Mist collector on"], ["M399", "Mist collector off"], ["M400", "External M-code 1"], ["M401", "External M-code 2"], ["M402", "External M-code 3"], ["M403", "External M-code 4"], ["M500", "Chuck/spindle interlock off (spindle may turn with the chuck open)"], ["M501", "Chuck/spindle interlock on"], ["M502", "Spindle linked mode start"], ["M503", "Cancel M504"], ["M504", "W-axis (tailstock) thrust control mode"], ["M505", "Spindle linked mode end"], ["M506", "Receiving chuck closes, then transferring chuck opens"], ["M507", "Transferring chuck closes, then receiving chuck opens"], ["M508", "Pressing (workpiece push) start"], ["M509", "Pressing end"], ["M511", "Spindle sync on (master spindle 1)"], ["M512", "Spindle sync on (master spindle 2)"], ["M513", "Spindle sync off"], ["M531", "Spindle 2 high-speed winding"], ["M532", "Cancel M531"], ["M540", "Transfer check mode on (TRS-CHK)"], ["M541", "Transfer check mode off"], ["M542", "Transfer bar mode on (TRS-BAR)"], ["M543", "Transfer bar mode off"], ["M544", "SEP-CROSS mode start"], ["M545", "SEP-CROSS mode end"], ["M546", "Hold the spindle during transfer (TRS)"], ["M550", "High-pressure coolant pressure 1 (M550–M556: 1–7)"], ["M551", "High-pressure coolant pressure 2"], ["M552", "High-pressure coolant pressure 3"], ["M553", "High-pressure coolant pressure 4"], ["M554", "High-pressure coolant pressure 5"], ["M555", "High-pressure coolant pressure 6"], ["M556", "High-pressure coolant pressure 7"], ["M557", "High-pressure coolant pressure select cancel"], ["M564", "Bar feeder call 1 (YMC compatible)"], ["M565", "Bar feeder call 2 (YMC compatible)"], ["M610", "Turning and milling spindle together"], ["M612", "Cancel M610"], ["M718", "Hydraulic unit: no intermittent operation"], ["M719", "Cancel M718"], ["M731", "Tailstock thrust 1"], ["M732", "Tailstock thrust 2"], ["M733", "Tailstock thrust 3"], ["M734", "Tailstock thrust 4"], ["M735", "Tailstock thrust 5"], ["M736", "Tailstock thrust 6"], ["M737", "Tailstock thrust 7"], ["M738", "Tailstock thrust 8"], ["M739", "Tailstock thrust 9"], ["M740", "Tailstock thrust from S, 0.1 kN units"], ["M741", "Tailstock to position 1 and press"], ["M742", "Tailstock to position 2 and press"], ["M743", "Tailstock back to the escape position"], ["M744", "Spindle may turn at the user tailstock position"], ["M745", "Cancel M744"], ["M770", "Tailstock position control mode on"], ["M771", "Tailstock position control mode off"], ["M901", "Spindle 1 side (turret works on spindle 1)"], ["M902", "Spindle 2 side (turret works on spindle 2)"], ["M950", "Standby M-code"], ["M998", "Program chain: next program, cycle start"], ["M999", "Program chain: next program, stop"]];
  const M_MILLTURN = [["M00", "Program stop"], ["M01", "Optional stop"], ["M02", "End of program"], ["M03", "Milling spindle forward"], ["M04", "Milling spindle reverse"], ["M05", "Milling spindle stop"], ["M06", "Tool change (M06 T** [next T])"], ["M08", "Flood coolant on"], ["M09", "All coolants off"], ["M19", "Milling spindle orient"], ["M23", "Error detect (exact stop) on"], ["M24", "Error detect off"], ["M30", "Reset and rewind"], ["M48", "Overrides on (cancel M49)"], ["M49", "Feed and spindle overrides off"], ["M51", "Through-spindle coolant on"], ["M58", "Tool life check (stop if expired)"], ["M98", "Subprogram call"], ["M99", "Return from subprogram"], ["M100", "High-pressure coolant pressure 1 (M100–M106: 1–7)"], ["M101", "High-pressure coolant pressure 2"], ["M102", "High-pressure coolant pressure 3"], ["M103", "High-pressure coolant pressure 4"], ["M104", "High-pressure coolant pressure 5"], ["M105", "High-pressure coolant pressure 6"], ["M106", "High-pressure coolant pressure 7"], ["M107", "B-axis clamp"], ["M108", "B-axis unclamp"], ["M110", "Milling spindle clamp"], ["M111", "Milling spindle unclamp"], ["M120", "Automatic power off"], ["M129", "Flood air blast on"], ["M131", "High-pressure coolant on (pressure step M100–M106, off M09)"], ["M132", "Through-spindle air on"], ["M139", "Heavy tool mode off"], ["M140", "Heavy tool mode on"], ["M149", "Magazine to pocket (M149 T)"], ["M162", "HD1 rechucking"], ["M163", "Through-spindle coolant / air off"], ["M169", "AFC on (cancel M170)"], ["M170", "AFC off"], ["M173", "Dynamic offset on"], ["M174", "Dynamic offset off"], ["M193", "V-axis connect"], ["M194", "V-axis disconnect"], ["M200", "Spindle 1 C-axis connect / milling mode"], ["M202", "Spindle 1 C-axis disconnect / turning mode"], ["M203", "Spindle 1 forward"], ["M204", "Spindle 1 reverse"], ["M205", "Spindle 1 stop"], ["M206", "Spindle 1 chuck open"], ["M207", "Spindle 1 chuck close"], ["M210", "Spindle 1 C-axis clamp"], ["M211", "Spindle 1 C-axis brake"], ["M212", "Spindle 1 C-axis unclamp"], ["M213", "Spindle 1 C-axis brake only"], ["M214", "Spindle 1 C-axis unclamp only"], ["M215", "Cancel M214 / M216"], ["M216", "Spindle 1 C-axis unclamp ignore mode"], ["M219", "Spindle 1 orient"], ["M230", "Spindle 1 rechuck (open and close)"], ["M231", "Tailstock forward"], ["M232", "Tailstock back"], ["M233", "Spindle 1 chuck pressure low"], ["M234", "Spindle 1 chuck pressure high"], ["M244", "Spindle 1 workpiece wash coolant on"], ["M245", "Spindle 1 workpiece wash coolant off"], ["M248", "Parts catcher in"], ["M249", "Parts catcher out"], ["M250", "Spindle speed reached check"], ["M253", "Thread chamfering off"], ["M254", "Thread chamfering on"], ["M256", "Front door open"], ["M258", "Spindle 1 chuck air blast (spindle turns about 50 min⁻¹)"], ["M264", "Spindle 1 chuck jaw coolant on"], ["M265", "Spindle 1 chuck jaw coolant off"], ["M266", "Spindle 1 shower coolant on"], ["M267", "Spindle 1 shower coolant off"], ["M268", "Spindle 1 through-spindle coolant on"], ["M269", "Spindle 1 through-spindle coolant off"], ["M270", "Spindle 1 through-spindle air on"], ["M271", "Spindle 1 through-spindle air off"], ["M272", "Spindle 1 chuck inner (ID) gripping"], ["M273", "Spindle 1 chuck outer (OD) gripping"], ["M281", "Touch sensor on"], ["M282", "Touch sensor off"], ["M283", "Tool measurement start (tool eye arm out)"], ["M284", "Tool measurement end (tool eye arm in)"], ["M285", "Work rest coolant on"], ["M286", "Work rest coolant off"], ["M289", "Flood coolant / air blast off"], ["M292", "Work rest open"], ["M293", "Work rest close"], ["M300", "Spindle 2 C-axis connect / milling mode"], ["M302", "Spindle 2 C-axis disconnect / turning mode"], ["M303", "Spindle 2 forward"], ["M304", "Spindle 2 reverse"], ["M305", "Spindle 2 stop"], ["M306", "Spindle 2 chuck open"], ["M307", "Spindle 2 chuck close"], ["M310", "Spindle 2 C-axis clamp"], ["M311", "Spindle 2 C-axis brake"], ["M312", "Spindle 2 C-axis unclamp"], ["M313", "Spindle 2 C-axis brake only"], ["M314", "Spindle 2 C-axis unclamp only"], ["M315", "Cancel M314 / M316"], ["M316", "Spindle 2 C-axis unclamp ignore mode"], ["M319", "Spindle 2 orient"], ["M330", "Spindle 2 rechuck"], ["M333", "Spindle 2 chuck pressure low"], ["M334", "Spindle 2 chuck pressure high"], ["M344", "Spindle 2 workpiece wash coolant on"], ["M345", "Spindle 2 workpiece wash coolant off"], ["M354", "Front door half open"], ["M358", "Spindle 2 chuck air blast"], ["M364", "Spindle 2 chuck jaw coolant on"], ["M365", "Spindle 2 chuck jaw coolant off"], ["M366", "Spindle 2 shower coolant on"], ["M367", "Spindle 2 shower coolant off"], ["M368", "Spindle 2 through-spindle coolant on"], ["M369", "Spindle 2 through-spindle coolant off"], ["M370", "Spindle 2 through-spindle air on"], ["M371", "Spindle 2 through-spindle air off"], ["M372", "Spindle 2 chuck inner (ID) gripping"], ["M373", "Spindle 2 chuck outer (OD) gripping"], ["M400", "External M-code output 1 (M400–M419: 1–20)"], ["M401", "External M-code output 2"], ["M402", "External M-code output 3"], ["M403", "External M-code output 4"], ["M404", "External M-code output 5"], ["M405", "External M-code output 6"], ["M406", "External M-code output 7"], ["M407", "External M-code output 8"], ["M408", "External M-code output 9"], ["M409", "External M-code output 10"], ["M410", "External M-code output 11"], ["M411", "External M-code output 12"], ["M412", "External M-code output 13"], ["M413", "External M-code output 14"], ["M414", "External M-code output 15"], ["M415", "External M-code output 16"], ["M416", "External M-code output 17"], ["M417", "External M-code output 18"], ["M418", "External M-code output 19"], ["M419", "External M-code output 20"], ["M422", "Z2-axis thrust control mode on"], ["M423", "Z2-axis thrust control mode off"], ["M428", "Z2-axis thrust control: HD1 side"], ["M429", "Z2-axis thrust control: HD2 side"], ["M438", "Z2-axis pressing mode start, HD1 side"], ["M439", "Z2-axis pressing mode start, HD2 side"], ["M440", "Cancel M438 (HD1 side pressing)"], ["M441", "Cancel M439 (HD2 side pressing)"], ["M503", "Tailstock thrust control off"], ["M504", "Tailstock thrust control on"], ["M508", "Pressing setup (workpiece push between spindles)"], ["M509", "Pressing cancel"], ["M511", "Spindle sync on (master spindle 1)"], ["M512", "Spindle sync on (master spindle 2)"], ["M513", "Spindle sync off"], ["M540", "Transfer mode on"], ["M541", "Transfer mode off"], ["M542", "Transfer bar mode on"], ["M543", "Transfer bar mode off"], ["M557", "High-pressure coolant pressure cancel"], ["M560", "Pinch cutting: upper and lower turret together (start)"], ["M561", "Pinch cutting end"], ["M562", "Balance cut start"], ["M563", "Balance cut end"], ["M584", "Cover coolant on"], ["M585", "Cover coolant off"], ["M610", "Grinder mode on"], ["M611", "Grinder milling spindle speed (M611 S)"], ["M612", "Grinder mode off"], ["M613", "Mist collector on"], ["M614", "Mist collector off"], ["M619", "Milling spindle orient at low speed (work chuck hand)"], ["M660", "ISS off"], ["M662", "Stock model cutting off (3D monitor)"], ["M664", "Machine interference check off"], ["M665", "Cancel M664"], ["M666", "Stock model interference check off"], ["M667", "Cancel M666"], ["M668", "Fixture model interference check off"], ["M669", "Cancel M668"], ["M670", "Tool model interference check off"], ["M671", "Cancel M670"], ["M687", "Cancel M688 / M689"], ["M688", "Wait for next tool indexing before cutting (coolant on)"], ["M689", "Wait for next tool indexing before cutting (coolant off)"], ["M699", "Tool after next to the carrier (M699 T)"], ["M703", "Chip removal: milling spindle forward"], ["M704", "Chip removal: milling spindle reverse"], ["M706", "Work chuck hand open"], ["M707", "Work chuck hand close"], ["M720", "Robot workpiece service request (M720–M729)"], ["M721", "Robot workpiece service request"], ["M722", "Robot workpiece service request"], ["M723", "Robot workpiece service request"], ["M724", "Robot workpiece service request"], ["M725", "Robot workpiece service request"], ["M726", "Robot workpiece service request"], ["M727", "Robot workpiece service request"], ["M728", "Robot workpiece service request"], ["M729", "Robot workpiece service request"], ["M730", "Milling spindle to the robot wait position"], ["M731", "W-axis to the robot wait position"], ["M734", "GL control axis interlock on"], ["M735", "GL control axis interlock release"], ["M755", "Spare send signal to the bar feeder"], ["M768", "Bar feeder call 1"], ["M769", "Bar feeder call 2"], ["M814", "B-axis unclamp mode"], ["M815", "Cancel M814 / M816"], ["M816", "B-axis unclamp ignore mode"], ["M831", "Tailstock thrust 1"], ["M832", "Tailstock thrust 2"], ["M833", "Tailstock thrust 3"], ["M834", "Tailstock thrust 4"], ["M835", "Tailstock thrust 5"], ["M838", "Thermal correction update stop"], ["M839", "Cancel M838"], ["M840", "Tailstock thrust from S, 0.1 kN units"], ["M841", "Tailstock to position 1"], ["M842", "Tailstock to position 2"], ["M843", "Tailstock back 50 mm"], ["M844", "Spindle may turn wherever the tailstock is"], ["M845", "Cancel M844"], ["M846", "Cancel M847"], ["M847", "Barrier cancel (tool / chuck / tailstock)"], ["M870", "Axis load detection off (A***)"], ["M871", "Axis load detection on (A***)"], ["M872", "Axis load detection paused"], ["M873", "Axis load detection restart"], ["M874", "On overload: feed hold"], ["M875", "On overload: feed hold and spindle stop"], ["M876", "Overload detection level % (A***)"], ["M877", "Overload detection time, 0.1 s (A***)"], ["M878", "Overload peak % / detection count (A***)"], ["M879", "Store M876–M878 under table No. (A***)"], ["M894", "Clear the spindle tool number memory"], ["M901", "HD1 spindle selection"], ["M902", "HD2 spindle selection"], ["M950", "Standby code (M950–M997: wait for the other turret)"], ["M951", "Standby code (wait for the other turret)"], ["M952", "Standby code (wait for the other turret)"], ["M953", "Standby code (wait for the other turret)"], ["M954", "Standby code (wait for the other turret)"], ["M955", "Standby code (wait for the other turret)"], ["M956", "Standby code (wait for the other turret)"], ["M957", "Standby code (wait for the other turret)"], ["M958", "Standby code (wait for the other turret)"], ["M959", "Standby code (wait for the other turret)"], ["M960", "Standby code (wait for the other turret)"], ["M961", "Standby code (wait for the other turret)"], ["M962", "Standby code (wait for the other turret)"], ["M963", "Standby code (wait for the other turret)"], ["M964", "Standby code (wait for the other turret)"], ["M965", "Standby code (wait for the other turret)"], ["M966", "Standby code (wait for the other turret)"], ["M967", "Standby code (wait for the other turret)"], ["M968", "Standby code (wait for the other turret)"], ["M969", "Standby code (wait for the other turret)"], ["M970", "Standby code (wait for the other turret)"], ["M971", "Standby code (wait for the other turret)"], ["M972", "Standby code (wait for the other turret)"], ["M973", "Standby code (wait for the other turret)"], ["M974", "Standby code (wait for the other turret)"], ["M975", "Standby code (wait for the other turret)"], ["M976", "Standby code (wait for the other turret)"], ["M977", "Standby code (wait for the other turret)"], ["M978", "Standby code (wait for the other turret)"], ["M979", "Standby code (wait for the other turret)"], ["M980", "Standby code (wait for the other turret)"], ["M981", "Standby code (wait for the other turret)"], ["M982", "Standby code (wait for the other turret)"], ["M983", "Standby code (wait for the other turret)"], ["M984", "Standby code (wait for the other turret)"], ["M985", "Standby code (wait for the other turret)"], ["M986", "Standby code (wait for the other turret)"], ["M987", "Standby code (wait for the other turret)"], ["M988", "Standby code (wait for the other turret)"], ["M989", "Standby code (wait for the other turret)"], ["M990", "Standby code (wait for the other turret)"], ["M991", "Standby code (wait for the other turret)"], ["M992", "Standby code (wait for the other turret)"], ["M993", "Standby code (wait for the other turret)"], ["M994", "Standby code (wait for the other turret)"], ["M995", "Standby code (wait for the other turret)"], ["M996", "Standby code (wait for the other turret)"], ["M997", "Standby code (wait for the other turret)"], ["M998", "Program chain: next program, cycle start"], ["M999", "Program chain: next program, stop"]];
  // the lists for a machine type ('mill', 'lathe', 'millturn')
  const G_FOR = t => (t === 'lathe' ? G_LATHE : t === 'millturn' ? G_MILLTURN : G);
  const M_FOR = t => (t === 'lathe' ? M_LATHE : t === 'millturn' ? M_MILLTURN : M);
  const M_NOTES_TURN = 'At most four M-codes in a block; codes that cannot work together (spindle forward / reverse / stop, on / off pairs) stop the machine with alarm 227 SIMULTANEOUS M CODE OPERATION.';
  const M_NOTES_FOR = t => (t === 'mill' ? M_NOTES : M_NOTES_TURN);
  const MACHINE = { mill: 'a Mazak horizontal (Smooth G)', lathe: 'a lathe (Smooth G)', millturn: 'a mill-turn machine (Smooth Ai), upper turret' };
  // Mill-turn strokes (from the machine maker's post processor data), mm: Y about the spindle centre
  // line, X: the spindle centre is this far below the X home (so a radius past it cannot be reached), B in degrees.
  const STROKES = {
    'small': { y: 105, xr: 485, b: [-30, 210] }, 'large': { y: 150, xr: 570, b: [-30, 210] },
  };
  // ---------------------------------------------------------------- more unit drawings (mill line units, common units, turning infeed)
  function openClose(k) {
    const which = k.split(':')[1];          // START or END
    // seen from above: a wall line along the shape; OPEN ends run off the part, CLOSE ends stop at a wall
    let b = `<rect x="40" y="40" width="320" height="120" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>`;
    b += `<rect x="40" y="40" width="40" height="120" fill="#26313b" stroke="${C.part}"/>` + label(60, 30, 'wall', false, 'middle', C.dim);
    b += line(80, 100, 360, 100, C.tool, 2) + label(220, 116, 'shape line', false, 'middle', C.dim);
    b += move(96, 82, 340, 82, 'feed', which === 'START');
    b += `<circle cx="96" cy="82" r="9" fill="none" stroke="${which === 'START' ? C.hi : C.tool}" stroke-width="1.6"/>` + label(96, 62, 'CLOSE: stops at the wall', which === 'START', 'middle');
    b += `<circle cx="378" cy="82" r="9" fill="none" stroke="${which === 'END' ? C.hi : C.tool}" stroke-width="1.6"/>` + move(340, 82, 378, 82, 'feed', which === 'END') + label(330, 62, 'OPEN: runs off the part', which === 'END', 'middle');
    return out(b, (which === 'START' ? 'START' : 'END') + ': OPEN when that end of the shape is open (the tool comes in or leaves off the part, past the end by its radius); CLOSE when it meets a wall (the tool stops short by its radius).');
  }
  function approachPt(k) {
    let b = `<rect x="80" y="60" width="240" height="110" rx="4" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>` + label(200, 115, 'pocket / shape', false, 'middle', C.dim);
    b += `<circle cx="120" cy="40" r="6" fill="${C.hi}"/>` + label(132, 36, 'APRCH-X, APRCH-Y', true);
    b += move(120, 40, 120, 76, 'rapid') + move(120, 76, 280, 76, 'feed');
    return out(b, 'APRCH-X / APRCH-Y: the point the tool comes down at before it starts cutting. ? lets the control pick it (from E1 / E2 / E5 clearances).');
  }
  function millCommon(k) {
    const f = k.split(':')[1];
    let b;
    if (f === 'MULTI' || f === 'PITCH-X' || f === 'PITCH-Y') {
      b = '';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b += `<rect x="${110 + i * 95}" y="${50 + j * 70}" width="60" height="40" fill="${C.fill}" stroke="${i === 0 && j === 0 ? C.hi : C.part}" stroke-width="1.4"/>`;
      b += dimH(110, 205, 40, 'PITCH-X', f === 'PITCH-X', false) + dimV(96, 50, 120, 'PITCH-Y', f === 'PITCH-Y', 'left');
      return out(b, 'Multi-workpiece: the same program runs on several parts set PITCH-X and PITCH-Y apart; MULTI marks which ones run (1).');
    }
    b = `<rect x="60" y="120" width="240" height="60" fill="${C.fill}" stroke="${C.part}" stroke-width="1.4"/>` + `<rect x="40" y="96" width="30" height="84" fill="#26313b" stroke="${C.part}"/>` + label(55, 88, 'clamp', false, 'middle', C.dim);
    b += level(120, 'Z0') + line(30, 60, 300, 60, C.hi, 1.6, '5 4') + label(306, 60, 'INITIAL-Z', true);
    b += move(150, 60, 150, 110, 'rapid') + move(150, 60, 250, 60, 'rapid') + drill(150, 110, 14, 40);
    b += dimV(380, 60, 120, '', f === 'INITIAL-Z', 'right');
    return out(b, 'INITIAL-Z: the height the tool travels at between holes and units — above the part and the clamps, measured from Z0.');
  }
  function infeed(k) {
    const f = k.split(':')[1];
    let b = axis() + chuck() + stock(64);
    b += `<path d="M${CHX} 136 H160 V118 H230 V100 H${FACEX - 20} L${FACEX} 90" fill="none" stroke="${C.tool}" stroke-width="1.6"/>` + label(110, 150, 'finished shape', false, 'middle', C.dim);
    if (f === 'CPT') {
      b += `<circle cx="${FACEX + 14}" cy="64" r="6" fill="${C.hi}"/>` + label(FACEX + 4, 44, 'CPT-X, CPT-Z: infeed point', true, 'end') + move(FACEX + 14, 64, 230, 64, 'feed');
      return out(b, 'CPT-X / CPT-Z: the infeed point — where the tool starts cutting (X as a diameter). Usually just outside the stock at the face; the shape and this point set the area roughed.');
    }
    b += `<path d="M${CHX} 128 H156 V110 H226 V92 H${FACEX - 24} L${FACEX - 4} 82" fill="none" stroke="${C.hi}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    b += dimV(250, 92, 100, 'FIN-X', f === 'FIN-X' || f === 'FIN', 'right') + dimH(226, 230, 74, 'FIN-Z', f === 'FIN-Z' || f === 'FIN', false);
    return out(b, 'FIN-X / FIN-Z: stock the roughing leaves on the shape (dashed) for the finishing tool — FIN-X on the diameter, FIN-Z on the faces.');
  }
  // turning drawings by key: PART:OUT … , BAR#0 … , GRV#0 … , THR#0 / #1, DRL#0 … , MODE:XC … , COMMON:OD-MAX …
  function turnDrawing(key) {
    const f = /^OC:/.test(key) ? openClose : key === 'APRCH' ? approachPt : /^MCOMMON:/.test(key) ? millCommon : /^INFEED:/.test(key) ? infeed : /^PART:/.test(key) ? turnPart : /^BAR#\d$/.test(key) ? barPat : /^GRV#\d$/.test(key) ? groove : /^THR#\d$/.test(key) ? threadPat
      : /^DRL#\d$/.test(key) ? drillPat : /^MODE:/.test(key) ? millMode : /^COMMON:/.test(key) ? commonTurn : null;
    if (!f) return null;
    try { return f(key); } catch (e) { return null; }
  }
  const api = { turnDrawing, STROKES, G, M, M_NOTES, G_LATHE, G_MILLTURN, M_LATHE, M_MILLTURN, G_FOR, M_FOR, M_NOTES_FOR, MACHINE, drawing, has: d => !!DRAW[d] };
  root.MazRef = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
