// node test/edm-test.js
// Loads the library from the single HTML file and checks what it writes.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'EDM Probing Program Generator.html'), 'utf8');
const src = /<script id="edm-lib">([\s\S]*?)<\/script>/.exec(html)[1];
const box = { module: { exports: {} } };
vm.runInNewContext(src, box);
const E = box.module.exports;

let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n  ', e.message); process.exitCode = 1; } };
const job = (ops, extra) => Object.assign(JSON.parse(JSON.stringify(E.DEFAULTS)), { ops }, extra || {});
const op = (type, f) => Object.assign(E.newOp(type), f || {});
const errs = j => JSON.parse(JSON.stringify(E.check(j).filter(m => m.err)));
const lines = t => t.split('\r\n');

/* Command forms the control's own programs already use. */
const FORMS = [
  /^G30X1R-?\d*\.\d*I\d*\.\d*J\d*\.\d*( P\d+)?( ,P\d+)?( ,R\d*\.\d+)?$/,
  /^G29[XY]-?1( P\d+)?( ,P\d+)?( ,R\d*\.\d+)?$/,
  /^G14X\d+Y\d+(P7)?( \(WIRE DIAMETER\))?$/,
  /^G92(X-?(\d*\.\d*|H\d+))?( ?Y-?(\d*\.\d*|H\d+))?$/,
  /^G65 L\d+( [A-Z]-?(\d*\.\d*|\d+))*$/,
  /^H\d+=(H\d+|-?\d*\.\d*|\d+)([-+/](H\d+|\d*\.\d*|\d+))?( \(.*\))?$/,
  /^H\d+=\[H\d+\+1\]$/,
  /^IF\[H\d+(EQ\d+|GTH\d+)\]GOTO\d+( \(.*\))?$/,
  /^GOTO\d+$/, /^N\d+( \(.*\))?$/,
  /^H3000=\d+\(.*\)$/, /^H3006=1\([!-~]{1,30}\)$/,
  /^G54\.1P\d+$/, /^G53G92X0Y0$/, /^G53 G00 G90 [XY]-?\d*\.\d*(Y-?\d*\.\d*)?$/,
  /^G00 G90 (X-?\d*\.\d*)?(Y-?\d*\.\d*)?$/, /^G00 G90 Y-?\d*\.\d*$/, /^X-?\d*\.\d*$/,
  /^G91 G00 [XY]-?(\d*\.\d*|H\d+)$/, /^G90$/,
  /^M20 \(INSERT WIRE\)$/, /^M21 \(CUT WIRE\)$/, /^M91 \(ADAPTIVE OFF\)$/, /^M0[01]( \(.*\))?$/, /^M02 \(PGM END\)$/,
  /^G22 L\d+$/, /^G23$/, /^%$/, /^L\d+\/[ -~]+$/, /^\([ -~]*\)$/, /^$/,
  /^G200A\d+( \(.*\))?$/, /^M(78|80|82|84|90|81|58|93|99|122|121)( \(.*\))?$/, /^M01$/,
  /^G00 G53 [XY]-?\d*\.\d*$/, /^G40G0X0Y0$/, /^G00X-?\d*\.\d*Y-?\d*\.\d*( \(THREAD POINT\))?$/,
  /^N000[123]Z[125]=\d*\.\d*$/, /^G92X-?\d*\.\d*Y-?\d*\.\d*( \(.*\))?$/, /^G92XH\d+ YH\d+$/, /^G14X\d+Y\d+ \(HOLE [12] POSITION\)$/,
];
// pasted cut paths (between the CUT PATH comments) are the user's own code and are not checked
const unknown = text => lines(text.replace(/\r\n$/, '').replace(/\(-- CUT PATH PASTED --\)[\s\S]*?\(-- END OF CUT PATH --\)/g, '')).filter(l => !FORMS.some(r => r.test(l)));
const CUT1 = 'F0.0551E1481\nH1=0.0085\nG42G01X-0.25Y0.969H1\nG01X0.25Y0.969\nG40G01X0.24Y0.92';
const CUT2 = 'F0.0236E1332\nH1=0.0055\nG42G01X-0.2507Y0.969H1\nG01X0.2507Y0.969\nG40X0.245';

ok('every operation writes only known command forms, in inch and mm', () => {
  ['in', 'mm'].forEach(units => E.list().forEach(c => {
    const o = op(c.id);
    if (c.id === 'call') o.l = 1001;
    if (c.id === 'multi') o.pts = '3,3.05\n0,6.1', o.cutL = 1001;
    if (c.id === 'job') Object.assign(o, { pts: '2,0', code1: CUT1, code2: CUT2, on3: true, code3: CUT2, water: true, parkX: 1, parkY: 0, z1: 1, z2: 2, z5: 3 });
    if (c.id === 'fm') Object.keys(E.FM).forEach(k => {
      const f = op('fm', { m: k }); E.FM[k].let.forEach(([a], i) => { f['a' + a] = i + 1; });
      const t = E.program(job([f], { units }));
      assert.deepStrictEqual(unknown(t), [], k);
      assert.ok(t.includes('G65 L' + E.FM[k].l), k);
    });
    const t = E.program(job([o], { units, notch: 6, repeat: 3, tol: 0.0002 }));
    assert.deepStrictEqual(unknown(t), [], c.id + ' ' + units);
  }));
});

ok('every template has no errors and writes known forms', () => {
  E.TEMPLATES.forEach(t => {
    const j = job(E.fromTemplate(t.id).map(o => o.type === 'job' ? Object.assign(o, { code1: CUT1, code2: CUT2, code3: CUT2 }) : o));
    assert.deepStrictEqual(errs(j), [], t.id);
    assert.deepStrictEqual(unknown(E.program(j)), [], t.id);
  });
});

ok('program frame: %, L line, CRLF, M02 or G23', () => {
  const t = E.program(job([op('hole', { coord: 'here' })], { progNo: '5001', name: 'Key 1' }));
  const L = lines(t);
  assert.strictEqual(L[0], '%'); assert.strictEqual(L[1], 'L5001/KEY 1');
  assert.ok(t.endsWith('M02 (PGM END)\r\n%\r\n'));
  assert.ok(!/[^\r]\n/.test(t), 'bare LF');
  assert.ok(E.program(job([], { endCode: 'G23' })).endsWith('G23\r\n%\r\n'));
});

ok('hole centre form', () => {
  const t = E.program(job([op('hole', { coord: 'here', r: 20, i: 0.75, jj: 0.75 })]));
  assert.ok(t.includes('M20 (INSERT WIRE)\r\nG30X1R20.I0.75J0.75\r\nG92X0.Y0.\r\nM21 (CUT WIRE)'));
});

ok('wire radius: typed or read', () => {
  assert.ok(E.program(job([], { wireDia: '0.012' })).includes('H610=0.006 (WIRE RADIUS)'));
  const t = E.program(job([], { wireFrom: 'read' }));
  assert.ok(t.includes('G14X610Y22P7 (WIRE DIAMETER)\r\nH610=H610/2'));
});

ok('edge: face value allows for the wire radius', () => {
  const plus = E.program(job([op('edge', { coord: 'here', axis: 'X', dir: '1' })]));
  assert.ok(plus.includes('G29X1\r\nG92X-H610\r\nG91 G00 X-0.05\r\nG90'));        // centre is r short of the face
  const minus = E.program(job([op('edge', { coord: 'here', axis: 'Y', dir: '-1', face: 1.5 })]));
  assert.ok(minus.includes('G29Y-1\r\nH611=H610+1.5\r\nG92YH611'));                // centre is r past the face
  const plusF = E.program(job([op('edge', { coord: 'here', axis: 'X', dir: '1', face: 2 })]));
  assert.ok(plusF.includes('H611=H610-2.\r\nG92X-H611'));                           // = 2 - r
});

ok('corner: maths gives the X face and Y face the values asked for', () => {
  // simulate: wire radius .005, X face at 10 (touch moving +), Y face at 20 (touch moving +)
  const t = E.program(job([op('corner', { setX: 1, setY: 2 })], { wireDia: '0.010' }));
  const H = {}; H[610] = 0.005;
  const touchX = 10 - 0.005, nowX = 10.25, touchY = 20 - 0.005;
  H[611] = touchX; H[613] = 0; H[612] = nowX; H[614] = touchY;
  lines(t).forEach(l => {
    const m = /^H(\d+)=H(\d+)([-+])(H(\d+)|[\d.]+)$/.exec(l);
    if (m) { const b = m[5] ? H[m[5]] : +m[4]; H[m[1]] = m[3] === '+' ? H[m[2]] + b : H[m[2]] - b; }
  });
  const g92 = lines(t).find(l => l.startsWith('G92X'));
  assert.strictEqual(g92, 'G92XH615 Y-H616');
  assert.ok(Math.abs(H[615] - (1 + (nowX - 10))) < 1e-9, 'X now = setX + distance past the face');
  assert.ok(Math.abs(-H[616] - (2 - 0.005)) < 1e-9, 'Y now = setY - r');
});

ok('width: inside adds two radii, outside takes two off, centre is the average', () => {
  const ins = E.program(job([op('width', { coord: 'here', axis: 'X', kind: 'in' })]));
  assert.ok(ins.includes('H630=H612-H611\r\nH630=H630+H610\r\nH630=H630+H610'));
  assert.ok(ins.includes('H613=H611-H612\r\nH613=H613/2\r\nG91 G00 XH613\r\nG90\r\nG92X0.'));
  const out = E.program(job([op('width', { kind: 'out', axis: 'Y', x: 0, y: 0, w: 1, back: 0.1 })]));
  assert.ok(out.includes('G14X617Y611'), 'Y read into the A variable');
  assert.ok(out.includes('H630=H612-H611\r\nH630=H630-H610\r\nH630=H630-H610'));
  assert.ok(/G29Y1[\s\S]*M21 \(CUT WIRE\)[\s\S]*M20 \(INSERT WIRE\)\r\nG29Y-1/.test(out), 'cut and re-thread between sides');
  assert.ok(out.includes('G92YH613'));
});

ok('width tolerance alarm uses GT only and unique labels', () => {
  const j = job([op('width', { coord: 'here', min: 0.49, max: 0.51 }), op('width', { coord: 'here', axis: 'Y', min: 0.2 })]);
  const t = E.program(j);
  assert.ok(t.includes('IF[H623GTH630]GOTO7000') && t.includes('IF[H630GTH624]GOTO7000'));
  assert.ok(t.includes('H3000=9101') && t.includes('H3000=9102'));
  assert.ok(t.includes('H631=H612-H611'), 'second width stores in the next result variable');
  const labels = lines(t).filter(l => /^N\d+/.test(l)).map(l => /^N(\d+)/.exec(l)[1]);
  assert.strictEqual(new Set(labels).size, labels.length);
});

ok('several parts: counter loop and offsets', () => {
  const j = job(E.fromTemplate('grid'));
  const t = E.program(j);
  assert.ok(t.includes('H620=6 (LAST PART NUMBER)'));
  assert.ok(t.includes('N7001 (PROBE 1)\r\nIF[H622GTH620]GOTO7099'));
  assert.ok(t.includes('G53G92X0Y0\r\nG53 G00 G90 X0.Y0.\r\nG90\r\nG53G92X0Y0\r\nG54.1P1\r\nM20 (INSERT WIRE)\r\nG30X1R0.I0.25J0.25\r\nG92X0.Y0.\r\nM21 (CUT WIRE)'));
  assert.ok(t.includes('N7002 (PROBE 2)\r\nIF[H622GTH620]GOTO7099 (WHEN COUNTER IS GREATER THAN LAST PART NUMBER)\r\nH622=[H622+1]\r\nG53G92X0Y0\r\nG54.1P1\r\nG00 G90 X2.Y0.\r\nG90\r\nG53G92X0Y0\r\nG54.1P2'));
  assert.ok(t.includes('G54.1P6') && !t.includes('G54.1P7'));
  const c = E.program(job([op('multi', { pts: '3,3', cutL: 2000 })]));
  assert.ok(c.includes('N7101 (CUT 1)') && c.includes('G54.1P2\r\nG00 G90 X0.Y0.\r\nG22 L2000'));
});

ok('mm formatting uses 3 places, inch 4', () => {
  assert.ok(E.program(job([op('move', { x: 1.23456, y: 0 })])).includes('G00 G90 X1.2346Y0.'));
  assert.ok(E.program(job([op('move', { x: 1.23456, y: 0 })], { units: 'mm' })).includes('G00 G90 X1.235Y0.'));
  assert.strictEqual(E.fmt(-0.00001, 4), '0.');
  assert.strictEqual(E.fmt(2, 4), '2.');
});

ok('snippet has no program frame', () => {
  const t = E.snippet(job([op('hole', { coord: 'here' })]));
  assert.ok(!/^%|^L\d|M02|G23/m.test(t));
  assert.ok(t.includes('G30X1'));
});

ok('checks', () => {
  const has = (j, re) => E.check(j).some(m => re.test(m.err || m.warn));
  assert.ok(has(job([], { progNo: '9500' }), /L9000 and up/));
  assert.ok(has(job([], { progNo: 'x' }), /whole L number/));
  assert.ok(has(job([], { varBase: '900' }), /overlaps/));
  assert.ok(!has(job([], { varBase: '610' }), /overlaps/));
  assert.ok(has(job([], { alarm: '9001' }), /factory macros use/));
  assert.ok(has(job([op('edge', { coord: 'here', thread: false })]), /No M20/));
  assert.ok(!has(job([op('thread'), op('edge', { coord: 'here', thread: false })]), /No M20/));
  assert.ok(has(job([op('edge', { coord: 'here' }), op('edge', { coord: 'here', thread: false })]), /No M20/), 'first edge cut the wire');
  assert.ok(errs(job([op('hole', { coord: 'here', i: 0 })])).length);
  assert.ok(errs(job([op('width', { kind: 'out', coord: 'here' })])).length);
  assert.ok(errs(job([op('multi', { pts: '3;x' })])).length);
  assert.ok(errs(job([op('fm', { m: '9001', aA: 200 })])).some(m => /−180/.test(m.err)));
  assert.ok(has(job([op('move', { coord: 'mach', x: 0, y: 0 }), op('move', { coord: 'mach', x: 30, y: 0 })]), /MV2400S travel/));
  assert.ok(has(job([op('move', { coord: 'mach', x: 0, y: 0 }), op('move', { coord: 'mach', x: 30, y: 0 })], { machine: 'OTHER', travelX: 600, travelY: 400 }), /table travel/));
  assert.ok(!has(job([op('move', { coord: 'mach', x: 0, y: 0 }), op('move', { coord: 'mach', x: 30, y: 0 })], { machine: 'OTHER' }), /travel/));
  assert.ok(errs(job([op('call')])).length);
});

ok('preview data', () => {
  const j = job(E.fromTemplate('corner'));
  const p = E.plot(j); assert.strictEqual(p[0].touch.length, 2);
  const m = E.moves(j); assert.ok(m.filter(x => x.kind === 'touch').length === 2);
});

ok('whole job: one program, set-up then passes, cuts after the end', () => {
  const o = op('job', { pts: '2,0\n4,0', code1: CUT1, code2: CUT2, tx1: -0.25, ty1: 0.919, water: true });
  const j = job([op('note', { text: 'X' }), o]);
  assert.deepStrictEqual(errs(j), []);
  const t = E.program(j), L = lines(t);
  assert.ok(!/G22|G23/.test(t.replace(/\(.*?\)/g, '')), 'no subprograms');
  assert.strictEqual(L.filter(l => /^M02/.test(l)).length, 1);
  const iEnd = L.findIndex(l => /^M02/.test(l)), iCut = L.findIndex(l => /^N\d+ \(ROUGH CUT\)$/.test(l));
  assert.ok(iCut > iEnd, 'cuts come after the end');
  assert.ok(t.endsWith('GOTO' + (7200 + 200 * 2 + 100) + '\r\n%\r\n'), 'last cut jumps back, then %');
  // every G200A target and every GOTO target exists exactly once
  const labels = L.filter(l => /^N\d+/.test(l)).map(l => +/^N(\d+)/.exec(l)[1]);
  assert.strictEqual(new Set(labels).size, labels.length, 'labels unique');
  [...t.matchAll(/(?:GOTO|G200A)(\d+)/g)].forEach(m => assert.ok(labels.includes(+m[1]), 'missing N' + m[1]));
  assert.ok(t.includes('H620=3 (LAST PART NUMBER)') && t.includes('H626=0 (SKIP ROUGH 1=YES 0=NO)') && t.includes('H629=0 (LEAVE WATER FULL'));
  assert.ok(t.includes('G00X-0.25Y0.919 (THREAD POINT)\r\nM20 (INSERT WIRE)'));
  assert.ok(t.includes('(2. ROUGH EVERY PART, THEN DRAIN AND STOP)'), 'header says what it does');
  assert.ok(t.includes('N7901 (WATER STAYS FULL: RUN AGAIN)\r\nM99') === false, 'labels shifted by the op before');
  assert.ok(t.includes('(WATER STAYS FULL: RUN AGAIN)\r\nM99'));
});

ok('whole job: set-up comments for parts 10 and up name their own offset', () => {
  const pts = Array.from({ length: 11 }, (_, i) => (3 * (i + 1)) + ',0').join('\n');
  const t = E.program(job([op('job', { pts, i: 0.75, jj: 0.75, code1: CUT1, code2: CUT2 })]));
  [10, 11, 12].forEach(k => assert.ok(t.includes('(GO TO PART ' + k + ' FROM PART 1, CENTRE IN ITS HOLE, ZERO G54.1 P' + k + ')'), 'part ' + k));
});

ok('whole job: nominal and fixture set-ups', () => {
  const nom = E.program(job([op('job', { zero: 'nominal', pts: '4,0', on1: false, code2: CUT2 })]));
  assert.ok(nom.includes('(PART 1 = G54.1 P1 AS SET BY HAND)'));
  assert.ok(nom.includes('G54.1P1\r\nG00 G90 X4.Y0.\r\nG90\r\nG53G92X0Y0\r\nG54.1P2\r\nG92X0.Y0.'));
  assert.ok(!nom.includes('G30') && !nom.includes('ROUGH'));
  const one = E.program(job([op('job', { zero: 'fixture', fx: 5, fy: -3, ox: 1, oy: 2, code1: CUT1, code2: CUT2 })]));
  assert.ok(one.includes('G53 G00 G90 X5.Y-3.') && one.includes('G92X-1.Y-2.'), 'one hole: part 1 = hole - offset');
  const two = E.program(job([op('job', { zero: 'fixture', two: true, bx: 2, by: 0, ox: 0, oy: 2, code1: CUT1, code2: CUT2 })]));
  assert.ok(two.includes('G14X611Y612 (HOLE 1 POSITION)') && two.includes('G14X613Y614 (HOLE 2 POSITION)'));
  assert.ok(two.includes('H615=H613-H611\r\nH615=H615/2\r\nH616=H614-H612\r\nH616=H616/2\r\nH616=H616-2.'));
  assert.ok(two.includes('G92XH615 YH616'));
  // simulate: hole 1 at 10,5 hole 2 at 12,5 (read), wire at hole 2: part 1 is midpoint + (0,2) -> wire is at (1,-2) from part 1
  const H = { 611: 10, 612: 5, 613: 12, 614: 5 };
  lines(two).forEach(l => { const m = /^H(\d+)=H(\d+)([-+/])(H(\d+)|[\d.]+)$/.exec(l); if (m) { const b = m[5] ? H[m[5]] : +m[4]; H[m[1]] = m[3] === '+' ? H[m[2]] + b : m[3] === '-' ? H[m[2]] - b : H[m[2]] / b; } });
  assert.strictEqual(H[615], 1); assert.strictEqual(H[616], -2);
});

ok('whole job: checks', () => {
  const has = (j, re) => E.check(j).some(m => re.test(m.err || m.warn));
  assert.ok(has(job([op('job')]), /paste the cut path/));
  assert.ok(has(job([op('job', { code1: CUT1 + '\nM02', code2: CUT2 })]), /has M02/));
  assert.ok(has(job([op('job', { code1: CUT1 + '\nG22 L5', code2: CUT2 })]), /subprogram/));
  assert.ok(has(job([op('job', { code1: CUT1 + '\nM21', code2: CUT2 })]), /threads or cuts the wire/));
  assert.ok(!has(job([op('job', { code1: CUT1, code2: CUT2 })]), /no E condition/));
  assert.ok(has(job([op('job', { code1: 'G01X1.Y1.', code2: CUT2 })]), /no E condition/));
  assert.ok(has(job([op('job', { code1: CUT1, code2: CUT2 }), op('stop')]), /must be the last/));
  assert.ok(has(job([op('job', { on1: false, on2: false })]), /at least one pass/));
  assert.ok(has(job([op('job', { code1: CUT1, code2: CUT2 })], { labelBase: '9500' }), /N9999/));
});

ok('whole job: a tab on each part in pass 1, then the tabs cut off part by part', () => {
  const j = job([op('job', { pts: '2,0\n4,0', code1: CUT1, code2: CUT2, tab1: true, tabLen: 0.2 })]);
  const msgs = JSON.parse(JSON.stringify(E.check(j)));
  assert.deepStrictEqual(msgs.filter(m => m.err), []);
  assert.ok(msgs.some(m => /H94 \/ H95/.test(m.warn)), 'the unproven modes are flagged');
  const t = E.program(j), L = lines(t);
  assert.deepStrictEqual(unknown(t), []);
  assert.ok(t.includes('H96=0.2 (TAB LENGTH: UNCUT / CUT-OFF AMOUNT)') && t.includes('H619=0 (SKIP CUTTING OFF THE TABS 1=YES 0=NO)'));
  assert.ok(t.includes('(3. CUT OFF EACH TAB AND STOP: TAKE OUT THE SLUG, THEN DRAIN AND STOP)') && t.includes('(5. PARK, DRAIN, DOOR DOWN, END)'));
  assert.ok(t.includes('(---- 3. CUT OFF EACH TAB, STOPPING AT ITS M01 TO TAKE OUT THE SLUG ----)') && t.includes('(---- 4. FINISH EVERY PART ----)') && t.includes('(---- 5. END ----)'), 'section numbers');
  // the rough cut: uncut mode around the pasted path, the M01 right before its G40 lead-out
  const r = L.indexOf('N7301 (ROUGH CUT)'), c = L.indexOf('N7903 (CUT OFF THE TAB)');
  assert.ok(r > 0 && c > r, 'both cuts written');
  const rough = L.slice(r, c), off = L.slice(c);
  const seq = blk => blk.filter(l => /^(H9[45]=|M01|G40G01|G42|M21|GOTO)/.test(l));
  assert.deepStrictEqual(seq(rough), ['H94=1 (UNCUT MODE: STOP THE TAB LENGTH SHORT OF THE M01)', 'G42G01X-0.25Y0.969H1', 'M01 (ADDED: THE TAB ENDS HERE)', 'G40G01X0.24Y0.92', 'H94=0 (UNCUT MODE OFF)', 'M21 (CUT WIRE)', 'GOTO7300']);
  assert.deepStrictEqual(seq(off).slice(0, 7), ['H95=1 (CUT-OFF MODE: CUT ONLY THE TAB, THEN STOP AT THE M01)', 'G42G01X-0.25Y0.969H1', 'M01 (ADDED: THE TAB ENDS HERE)', 'G40G01X0.24Y0.92', 'H95=0 (CUT-OFF MODE OFF)', 'M21 (CUT WIRE)', 'GOTO7902']);
  // the cut-off section: after the rough, before the drain; the message; every part; labels all there
  const tabSec = L.indexOf('N7800 (CUT OFF THE TABS)'), roughDone = L.indexOf('N7299 (ROUGH DONE)'), drain = L.indexOf('(PARK, DRAIN AND OPEN THE DOOR: TAKE OUT THE SLUGS)');
  assert.ok(roughDone < tabSec && tabSec < drain, 'order: rough, tabs, drain');
  assert.strictEqual(L[tabSec + 2], 'H3006=1(M01-STOP-ON:TAKE-OUT-SLUGS)');
  assert.strictEqual(L.filter(l => l === 'G200A7903 (CUT OFF THE TAB)').length, 3);
  // no M01 runs with a mode on except the tab's own
  let mode = 0; L.forEach(l => { if (/^H9[45]=1/.test(l)) mode = 1; if (/^H9[45]=0/.test(l)) mode = 0; if (/^M01/.test(l) && mode) assert.ok(/TAB ENDS HERE/.test(l), l); });
  const labels = L.filter(l => /^N\d+/.test(l)).map(l => +/^N(\d+)/.exec(l)[1]);
  assert.strictEqual(new Set(labels).size, labels.length, 'labels unique');
  [...t.matchAll(/(?:GOTO|G200A)(\d+)/g)].forEach(m => assert.ok(labels.includes(+m[1]), 'missing N' + m[1]));
  // a path with its own M01 keeps it, and no M01 is added; a path with no G40 gets the M01 at its end
  const own = E.program(job([op('job', { code1: CUT1.replace('G40', 'M01\nG40'), code2: CUT2, tab1: true, tabLen: 0.2 })]));
  assert.ok(!own.includes('ADDED: THE TAB') && (own.match(/^M01\r$/mg) || []).length >= 2);
  const noG40 = lines(E.program(job([op('job', { code1: 'F0.0551E1481\nH1=0.0085\nG42G01X-0.25Y0.969H1\nG01X0.25Y0.969', code2: CUT2, tab1: true, tabLen: 0.2 })])));
  assert.strictEqual(noG40[noG40.indexOf('G01X0.25Y0.969') + 1], 'M01 (ADDED: THE TAB ENDS HERE)');
  // checks: the length is needed, a short tab is flagged, and no tabs leaves the program as it was
  const err = jj => JSON.parse(JSON.stringify(E.check(jj))).map(m => m.err || m.warn).join(' | ');
  assert.ok(/give the tab length/.test(err(job([op('job', { code1: CUT1, code2: CUT2, tab1: true })]))));
  assert.ok(/is short/.test(err(job([op('job', { code1: CUT1, code2: CUT2, tab1: true, tabLen: 0.01 })]))));
  assert.ok(!/H9[456]=|H3006|\bTABS?\b/.test(E.program(job([op('job', { code1: CUT1, code2: CUT2, tabLen: 0.2 })]))));
});

ok('G30 I / J: a warning when the fast first move comes close to the hole wall', () => {
  const msgs = j => JSON.parse(JSON.stringify(E.check(j))).map(m => m.err || m.warn).join(' | ');
  const near = /close to the hole wall/;
  // 1.000 hole, 0.010 wire: the wall is 0.495 from the centre, the warning starts at 80 % of it (0.396)
  assert.ok(!near.test(msgs(job([op('hole', { coord: 'here', i: 0.3, jj: 0.3 })]))), 'no hole size, no check');
  assert.ok(!near.test(msgs(job([op('hole', { coord: 'here', i: 0.39, jj: 0.3, hd: 1 })]))));
  const w = msgs(job([op('hole', { coord: 'here', i: 0.45, jj: 0.6, hd: 1 })]));
  assert.ok(/G30 I 0\.45 and J 0\.6 come close to the hole wall, 0\.495 from the centre/.test(w) && /22 in\/min/.test(w), w);
  assert.ok(/G30 J 10\.? comes close to the hole wall, 9\.9 from the centre.*\(570 mm\/min\)/.test(msgs(job([op('hole', { coord: 'here', i: 1, jj: 10, hd: 20 })], { units: 'mm', wireDia: '0.2' }))));
  assert.ok(/no bigger than the wire/.test(msgs(job([op('hole', { coord: 'here', hd: 0.008 })]))));
  assert.ok(near.test(msgs(job([op('multi', { pts: '2,0', i: 0.45, hd: 1 })]))), 'several parts');
  assert.ok(near.test(msgs(job([op('job', { code1: CUT1, code2: CUT2, i: 0.45, hd: 1 })]))), 'whole job');
  assert.ok(!near.test(msgs(job([op('job', { zero: 'nominal', code1: CUT1, code2: CUT2, i: 0.45, hd: 1 })]))), 'no G30 in a nominal job');
  assert.ok(!near.test(msgs(E.sampleJob())), 'the sample job');
  // the preview draws the hole at its size, and none when the size isn't given
  assert.strictEqual(E.plot(job([op('hole', { coord: 'here', hd: 1 })]))[0].circles[0][2], 0.5);
  assert.strictEqual(E.plot(job([op('hole', { coord: 'here' })]))[0].circles.length, 0);
});

ok('machine tables: the holes, pieces and travel of each model', () => {
  const count = { MV1200S: 39, MV1200R: 50, MV2400S: 52, MV2400R: 72, MV4800: 68 };
  Object.entries(E.TABLES).forEach(([m, T]) => {
    assert.strictEqual(T.holes.length, count[m], m + ' holes');
    assert.strictEqual(new Set(T.holes.map(h => h.join())).size, T.holes.length, m + ' holes unique');
    const inside = (h, r, g) => h[0] >= r[0] + g && h[0] <= r[2] - g && h[1] >= r[1] + g && h[1] <= r[3] - g;
    T.holes.forEach(h => {
      assert.ok(T.pieces.some(r => inside(h, r, 9)), m + ' hole ' + h + ' on a piece, 9 mm in from its edges');
      if (T.opening) assert.ok(!inside(h, T.opening, -9), m + ' hole ' + h + ' clear of the opening');
      assert.ok(T.holes.some(q => Math.abs(q[0] - (T.w - h[0])) < 1e-9 && q[1] === h[1]), m + ' hole ' + h + ' mirrored about the centre');
    });
    const st = T.stroke;
    assert.strictEqual(st[2] - st[0], T.spec.x, m + ' X travel'); assert.strictEqual(st[3] - st[1], T.spec.y, m + ' Y travel');
    assert.strictEqual(st[0] + st[2], T.w, m + ' travel centred in X');
    assert.ok(st[0] > 0 && st[1] > 0 && st[2] < T.w && st[3] < T.d, m + ' travel over the table');
  });
  assert.strictEqual(E.tableOf('MV4800S'), E.TABLES.MV4800); assert.strictEqual(E.tableOf('MV4800R'), E.TABLES.MV4800);
  assert.strictEqual(E.tableOf('MV2400R'), E.TABLES.MV2400R); assert.strictEqual(E.tableOf('OTHER'), null);
  assert.strictEqual(E.tableDXF('OTHER'), '');
});

ok('machine table DXF: R12, layers, mm or inch, origin at the machine zero or the table corner; the CAD app reads it', () => {
  const IO = require('../lib/cad-io.js');
  const mm = E.tableDXF('MV2400S', { units: 'mm' }), inch = E.tableDXF('MV2400S', { units: 'in' });
  assert.ok(mm.startsWith('0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009') && mm.endsWith('0\r\nEOF\r\n'));
  assert.ok(/\$INSUNITS\r\n70\r\n4\r\n/.test(mm) && /\$INSUNITS\r\n70\r\n1\r\n/.test(inch));
  assert.ok(!/[^\r]\n/.test(mm) && !/[^ -~\r\n]/.test(mm), 'CRLF, ASCII');
  const a = IO.readDXF(mm, 'auto'), b = IO.readDXF(inch, 'auto');
  assert.deepStrictEqual(a.levels.map(l => l.name), ['TABLE', 'M8', 'TRAVEL', 'CENTER', 'ZERO', 'NOTES']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.skipped)), {});
  const circles = r => r.ents.filter(e => e.g.t === 'arc');
  assert.strictEqual(circles(a).length, 52);
  // read back in inches, the mm file and the inch file are the same drawing
  circles(a).forEach((e, i) => { const f = circles(b)[i].g; assert.ok(Math.abs(e.g.c[0] - f.c[0]) < 1e-5 && Math.abs(e.g.c[1] - f.c[1]) < 1e-5 && Math.abs(e.g.r - 4 / 25.4) < 1e-6); });
  // origin at the machine zero: the travel runs X 0 to 600, Y 0 to -400 (mm); at the corner the table is 0..840, 0..560
  const lv = (r, name) => r.ents.filter(e => e.lv === r.levels.find(l => l.name === name).n && e.g.t === 'line');
  const ends = (r, name) => [].concat(...lv(r, name).map(e => [e.g.a, e.g.b])).map(p => p.map(v => Math.round(v * 25.4 * 1000) / 1000));
  const tr = ends(a, 'TRAVEL');
  assert.deepStrictEqual([Math.min(...tr.map(p => p[0])), Math.max(...tr.map(p => p[0])), Math.min(...tr.map(p => p[1])), Math.max(...tr.map(p => p[1]))], [0, 600, -400, 0]);
  const c = IO.readDXF(E.tableDXF('MV2400S', { units: 'mm', origin: 'corner' }), 'auto'), tb = ends(c, 'TABLE');
  assert.deepStrictEqual([Math.min(...tb.map(p => p[0])), Math.max(...tb.map(p => p[0])), Math.min(...tb.map(p => p[1])), Math.max(...tb.map(p => p[1]))], [0, 840, 0, 560]);
  // every model writes, and its notes give the travel and ask for a check on the machine
  Object.keys(E.TABLES).forEach(m => { const t = E.tableDXF(m, { units: 'in' }); assert.ok(t.includes('TRAVEL X ') && t.includes('CHECK A HOLE OR TWO ON THE MACHINE') && t.includes('INCH'), m); });
  assert.ok(mm.includes('ORIGIN: MACHINE X0 Y0, THE WIRE AT THE LEFT-REAR END OF TRAVEL'));
});

ok('code reference: every code the generator writes is in it, marked; nothing marked that it never writes', () => {
  const progs = [E.program(E.sampleJob())];
  const mk = (ops, x) => progs.push(E.program(job(ops, x)));
  E.TEMPLATES.forEach(t => [{}, { endCode: 'G23' }, { units: 'mm', wireFrom: 'read' }].forEach(x =>
    mk(E.fromTemplate(t.id).map(o => o.type === 'job' ? Object.assign(o, { code1: CUT1, code2: CUT2, code3: CUT2, water: true }) : o), x)));
  E.list().forEach(c => mk([c.id === 'job' ? op('job', { code1: CUT1, code2: CUT2 }) : op(c.id, { l: 2000, min: 0.49, max: 0.51 })]));
  mk([op('job', { code1: CUT1, code2: CUT2, tab1: true, tabLen: 0.2 })]);
  const seen = new Set();
  progs.forEach(t => lines(t.replace(/\(-- CUT PATH PASTED --\)[\s\S]*?\(-- END OF CUT PATH --\)/g, '')).forEach(l => {
    l = l.replace(/\([^)]*\)/g, '');
    (l.match(/[GM]\d+(\.\d)?/g) || []).forEach(c => seen.add(c.replace(/^([GM])(\d)$/, '$10$2')));
    if (/^IF\[/.test(l)) seen.add('IF GOTO');
    if (/^H3000=/.test(l)) seen.add('H3000');
    if (/^H3006=/.test(l)) seen.add('H3006');
    const sys = /^(H9[456])=/.exec(l); if (sys) seen.add(sys[1]);
    if (/^H\d+=/.test(l)) seen.add('H');
    if (/^L\d+\//.test(l)) seen.add('L');
    if (/^N\d+/.test(l)) seen.add('N');
    if (l === '%') seen.add('%');
  }));
  progs.forEach(t => { if (/\(/.test(t)) seen.add('( )'); });
  const codes = E.CODES.map(r => r.c);
  assert.strictEqual(new Set(codes).size, codes.length, 'a code twice');
  E.CODES.forEach(r => { assert.ok(r.d && !('src' in r), r.c); assert.ok(/^([GM]\d+(\.\d)?|[A-Z]|IF GOTO|H300[06]|H9[456]|X1 \/ X1\.|\( \)|%|\/)$/.test(r.c), r.c); });
  assert.deepStrictEqual([...seen].filter(c => !codes.includes(c)).sort(), [], 'written but not in the reference');
  assert.deepStrictEqual([...E.CODES.filter(r => seen.has(r.c) !== r.gen).map(r => r.c)], [], 'marked wrong');
});

ok('sample job: no errors, and examples/edm matches the app', () => {
  const j = E.sampleJob();
  assert.deepStrictEqual(errs(j), []);
  const t = E.program(j);
  assert.deepStrictEqual(unknown(t), []);
  assert.ok(t.includes('(SAMPLE PROGRAM: NOT FOR A REAL PART)') && t.includes('H620=4 (LAST PART NUMBER)'));
  const file = path.join(__dirname, '..', 'examples', 'edm', 'SAMPLE-JOB.NC');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), t, 'examples/edm/SAMPLE-JOB.NC is out of date: node examples/edm-sample.js');
});

console.log(n + ' EDM probing tests passed');
