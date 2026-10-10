// Probing: every operation writes a G65 call the macros accept, the checks catch the input
// combinations the macros alarm on, and the Mazatrol programs read back.
const assert = require('assert');
const P = require('../lib/probe.js');
const MACH1 = require('../mach1.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } };
const job = (sys, ops, extra) => Object.assign({}, P.DEFAULTS, { sys, probeNo: 1, probeSfx: 'A', ops }, extra || {});
const op = (type, f) => Object.assign(P.newOp(type), f || {});
const errs = j => P.check(j).filter(m => m.err).map(m => m.err);
const calls = text => text.split('\n').filter(l => /^G65 P/.test(l));

ok('every operation has its default inputs and writes its macro', () => {
  for (const sys of ['ren', 'mmseia']) for (const c of P.list(sys)) {
    const o = op(c.id, { tool: c.id === 'average' ? '12A' : undefined, dx: c.id === 'f2fComp' ? 1 : undefined, mx: c.id === 'move' ? 1 : undefined });
    const text = P.eia(job(sys, [o], { tcX: 0, tcZ: 0 }));
    assert.ok(c.macro ? text.includes('G65 P' + c.macro) : /^#\d+=/m.test(text), c.id);
    // every argument value carries a decimal point (Mazak reads one without it in least increments), except MMS H and M
    for (const l of calls(text)) for (const w of l.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(2)) {
      if (/^[HM]\d+$/.test(w) && sys === 'mmseia') continue;
      assert.ok(/^[A-Z](-?\d*\.\d*|#\d+|\[.*\])$/.test(w), c.id + ': ' + w + ' in ' + l);   // a number with its point, a variable or an expression
    }
  }
});
ok('a bore: tool change, probe on, protected down, measure, protected up, probe off', () => {
  const t = P.eia(job('ren', [op('bore', { x: 2, y: -1.5, z: -0.4, d: 1.25 })], { clearZ: 1.5 })).split('\n');
  const i = k => t.findIndex(l => l.startsWith(k));
  assert.ok(i('T1.01 M6') > i('G0 G53 G90 Z0') && i('G90 G54') > i('T1.01') && i('G65 P9832') > i('G90 G54'));
  assert.deepStrictEqual(t.slice(i('G0 X2.'), i('G0 X2.') + 5), ['G0 X2. Y-1.5', 'G65 P9810 Z1.5 (PROTECTED TO CLEARANCE)', 'G65 P9810 Z-0.4', 'G65 P9814 D1.25 S1.', 'G65 P9810 Z1.5']);
  assert.ok(i('G65 P9833') > i('G65 P9814') && t[t.length - 2] === 'M30');
});
ok('work offsets: S1-6, S101+ for G54.1 Pn, S7 for the Mazatrol WPC, none', () => {
  const s = (wcs, upd) => calls(P.eia(job('ren', [op('surfZ', { upd })], { wcs }))).find(l => l.includes('P9811'));
  assert.ok(s('G56', 'active').endsWith('S3.'));
  assert.ok(s('P12', 'active').endsWith('S112.') && P.eia(job('ren', [op('surfZ')], { wcs: 'P12' })).includes('G90 G54.1 P12'));
  assert.ok(s('G54', 'P300').endsWith('S400.'));
  assert.ok(s('G54', 'WPC').endsWith('S7.'));
  assert.ok(s('G54', 'none') === 'G65 P9811 Z0.');
  assert.ok(P.check(job('ren', [op('surfZ', { upd: 'G55' })])).some(m => /G54 \+ the error/.test(m.warn || '')));
});
ok('purposes keep apart what the macros refuse together (S+T, S+H, T+M)', () => {
  const line = o => calls(P.eia(job('ren', [o]))).find(l => l.includes('P9814'));
  // set: S only, a tool or size tolerance left over from before is not written
  assert.strictEqual(line(op('bore', { purpose: 'set', tool: '5B', tolH: 0.001 })), 'G65 P9814 D1. S1.');
  // inspect: no S, no T; H and M when stopping
  assert.strictEqual(line(op('bore', { purpose: 'inspect', tolP: 0.001, tolN: 0.001, tolM: 0.002 })), 'G65 P9814 D1. H0.001 M0.002');
  assert.strictEqual(line(op('bore', { purpose: 'inspect', tolP: 0.001, tolN: 0.001, tolM: 0.002 })), 'G65 P9814 D1. H0.001 M0.002');
  // adjust: T F U (V), never M (TM INPUT MIXED): the zone is judged in the report only
  const j = job('ren', [op('bore', { purpose: 'adjust', tool: '5B', tolP: 0.001, tolN: 0.001, tolM: 0.002, nullV: 0.0002 })]);
  assert.strictEqual(calls(P.eia(j)).find(l => l.includes('P9814')), 'G65 P9814 D1. H0.001 U0.006 T5.02 V0.0002 F0.8');
  assert.ok(P.check(j).some(m => /report only/.test(m.warn || '')));
  assert.ok(errs(job('ren', [op('bore', { purpose: 'adjust' })])).some(e => /tool to adjust/.test(e)));
  assert.ok(errs(job('ren', [op('bore', { purpose: 'adjust', tool: '5I' })])).length, 'no I suffix');
  assert.ok(errs(job('ren', [op('bore', { z: 3 })], { clearZ: 2 })).some(e => /clearance/.test(e)));
  assert.ok(errs(job('ren', [op('bore')], { probeNo: '' })).some(e => /tool number/.test(e)));
});
ok('tool to update: number and suffix to the Renishaw code (A = .01, no I or O)', () => {
  assert.strictEqual(P.toolCode('12A'), 12.01); assert.strictEqual(P.toolCode('3J'), 3.09); assert.strictEqual(P.toolCode('7Z'), 7.24);
  assert.strictEqual(P.toolCode('7O'), null); assert.strictEqual(P.toolCode('4'), 4); assert.strictEqual(P.toolCode('1.01'), 1.01);
  assert.ok(calls(P.eia(job('ren', [op('bore', { purpose: 'adjust', tool: '12B' })]))).find(l => l.includes('P9814')).includes('T12.02'));
});
ok('calibration: ring gauge K4 with M180 and the L1-L4 copy, length K1 with the probe tool', () => {
  const t = P.eia(job('ren', [op('calRing', { d: 2.0001 }), op('calLen')]));
  assert.ok(t.includes('G65 P9801 K4. D2.0001 B0.236 M180.') && t.includes('#5503=#500/25.4') && t.includes('G65 P9801 K1. Z0. B0.236 T1.01'));
  assert.ok(errs(job('ren', [op('calLen')], { probeNo: '', toolChange: false })).some(e => /probe/.test(e)));
});
ok('multi-point stock: extra points as repeated I J (argument specification II)', () => {
  const l = calls(P.eia(job('ren', [op('stock', { pts: '0 0\n1 2\n-1 3' })]))).find(x => x.includes('P9820'));
  assert.ok(l.startsWith('G65 P9820 Z0. I1. J2. I-1. J3.'), l);
  assert.ok(errs(job('ren', [op('stock', { pts: '0 0\n1 1\n2 2\n3 3\n4 4\n5 5', over: 0.3 })])).some(e => /overtravel/.test(e)));
});
ok('feature to feature needs the stored feature first; averaging follows a cycle without a tool', () => {
  assert.ok(errs(job('ren', [op('bore'), op('f2fComp', { dx: 2 })])).some(e => /Remember/.test(e)));
  assert.deepStrictEqual(errs(job('ren', [op('bore'), op('f2fStore'), op('bore', { x: 2 }), op('f2fComp', { dx: 2 })])), []);
  assert.ok(errs(job('ren', [op('average', { tool: '3A' })])).some(e => /straight after/.test(e)));
  assert.deepStrictEqual(errs(job('ren', [op('bore', { upd: 'none' }), op('average', { tool: '3A' })])), []);
});
ok('MMS EIA: machine coordinates, H and M without a decimal point, 9016 printing refused', () => {
  const l = calls(P.eia(job('mmseia', [op('e9013', { x: -582 / 25.4, y: -354 / 25.4 })], { mmsH: 1, mmsM: 55 })))[0];
  assert.ok(/^G65 P9013 X-22\.91339 Y-13\.93701 Q-0\.25 R1\. D1\. K0\.3 H1 M55$/.test(l), l);
  assert.ok(errs(job('mmseia', [op('e9016')], { mmsPrint: true })).some(e => /loops/.test(e)));
  assert.ok(errs(job('mmseia', [op('e9013', { k: 0.5 })])).some(e => /0\.2–0\.4/.test(e)));
});
ok('Mazatrol: the MMS unit lines read back as written; the SUB PRO calls the EIA program with MEASURE MACRO', () => {
  const j = job('mms', [op('mZF', { x: 1, y: 2, z: 0.3, r: 0.05 }), op('mXS', { w: 2.73, k: 0.2 }), op('mBore', { d: 2.4 })], { wpcX: -13.5, wpcY: -24.5, wpcZ: -27.25 });
  const p = P.toMazatrol(j, MACH1), back = MACH1.open(p.save(), p.fileName).toJSON().program;
  const wpc = back.find(u => u.unit === 'WPC-'), mms = back.find(u => u.unit === 'MMS');
  assert.ok(p.fileName === 'PROBE1.PBM' && wpc.fields.X === '-13.5' && mms.fields.TOOL === 'PROBE' && mms.fields['NOM-0'] === '0.23');
  assert.deepStrictEqual(mms.lines.map(l => l.fields.PTN), ['Z-FACE', 'X-STP', 'BORE-XY']);
  assert.ok(mms.lines[0].fields.R === '0.05' && mms.lines[1].fields['D/L'] === '2.73' && mms.lines[2].fields['D/L'] === '2.4');
  const s = P.toMazatrol(job('ren', [op('bore')], { name: 'PRB7' }), MACH1);
  const u = MACH1.open(s.save(), s.fileName).toJSON().program.find(x => x.unit === 'SUB PRO');
  assert.ok(u.fields.WORK === 'PRB7' && u.fields['@8'] === '(Meas)', JSON.stringify(u.fields));
});
ok('square the B table: index after Z home, work offset or WPC B, either direction, a check run', () => {
  const r = (f, extra) => P.eia(job('ren', [op('rotary', Object.assign({ bi: 90 }, f)), op('bore')], extra)).split('\n');
  let t = r({});
  const i = k => t.findIndex(l => l.startsWith(k));
  assert.ok(i('G0 G53 Z0 (PROBE') < i('G0 B90.') && i('G0 B90.') < i('G65 P9818'));
  assert.ok(t.includes('G65 P9818 K2. X4. Z0. S1.') && t.includes('G65 P9818 K2. X4. Z0. B0.01'));
  // the next operation starts like the first: across, then protected down to the clearance Z
  const b = t.findIndex(l => l.startsWith('(2 BORE')); assert.ok(t[b + 2].startsWith('G65 P9810 Z2. (PROTECTED TO CLEARANCE)'), t[b + 2]);
  t = r({ dir: '-' }); assert.ok(t.includes('#5224=#5224-#144 (G54 B)') && !t.some(l => /P9818.*S/.test(l)));
  t = r({ dir: '-' }, { wcs: 'P12' }); assert.ok(t.includes('#7224=#7224-#144 (G54.1 P12 B)'), t.join('|'));
  t = r({ dir: '-' }, { wcs: 'P60' }); assert.ok(t.includes('#71184=#71184-#144 (G54.1 P60 B)'));
  t = r({ target: 'wpc' }); assert.ok(t.includes('G65 P9733 B[#5344+#144] (WPC B)'));
  t = r({ target: 'wpc', dir: '-' }); assert.ok(t.includes('G65 P9733 B[#5344-#144] (WPC B)'));
  t = r({ verify: false }); assert.ok(!t.some(l => /B0\.01/.test(l)));
  assert.ok(!P.CYC.rotary.opt.includes('S'), 'no S7 for B');
});
// a tiny evaluator for the generated #-variable lines (assignments, + - * / and brackets, IF[..LT..]GOTO / N)
function run(text, vars) {
  const L = text.split('\n').map(l => l.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
  const val = e => Function('v', 'return ' + e.replace(/ABS/g, 'Math.abs').replace(/FIX/g, 'Math.trunc').replace(/\[/g, '(').replace(/\]/g, ')').replace(/#(\d+)/g, '(v[$1]||0)'))(vars);
  const cmp = { LT: (a, b) => a < b, LE: (a, b) => a <= b, GT: (a, b) => a > b, GE: (a, b) => a >= b, EQ: (a, b) => a === b, NE: (a, b) => a !== b };
  // to the line before the label, so its statement runs next; an unknown label is an error, not a loop
  const jump = n => { const i = L.findIndex(l => l === 'N' + n || l.startsWith('N' + n + ' ')); if (i < 0) throw new Error('no N' + n); return i - 1; };
  for (let k = 0; k < L.length; k++) {
    let l = L[k].replace(/^N\d+ /, '');
    let m = /^#3000=(\d+)/.exec(l); if (m) { vars[3000] = +m[1]; return vars; }   // an alarm stops the program
    m = /^#(\d+)=(.*)$/.exec(l); if (m) { vars[+m[1]] = val(m[2]); continue; }
    m = /^GOTO(\d+)$/.exec(l); if (m) { k = jump(m[1]); continue; }
    m = /^IF\[(.*)(LT|LE|GT|GE|EQ|NE)(.*)\]GOTO(\d+)$/.exec(l); if (m && cmp[m[2]](val(m[1]), val(m[3]))) k = jump(m[4]);
  }
  return vars;
}
ok('the side 180° away: EIA offset = turned 180 about the table centre, B + 180 wrapped; WPC via a second program', () => {
  const j = job('ren', [op('side180', { dx: 0.5, dy: 0.25, dz: -3, to: 'G55' })], { tcX: -11.15, tcZ: -26 });
  assert.deepStrictEqual(errs(j), []);
  const v = run(P.eia(j), { 5221: -11.1058, 5222: -21.476, 5223: -24.8775, 5224: 270.047, 5201: 0, 5203: 0 });
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(v[5241], 2 * -11.15 - (-11.1058 + 0.5)) && near(v[5242], -21.226) && near(v[5243], 2 * -26 - (-24.8775 - 3)) && near(v[5244], 90.047), JSON.stringify(v));
  // the external offset moves both sides: still the same machine point
  const w = run(P.eia(j), { 5221: -11.2058, 5222: -21.476, 5223: -24.8775, 5224: 0, 5201: 0.1, 5203: 0 });
  assert.ok(near(w[5241] + 0.1, 2 * -11.15 - (-11.1058 + 0.5)) && near(w[5244], 180));
  assert.ok(P.eia(job('ren', [op('side180', { to: 'P12' })], { tcX: 0, tcZ: 0 })).includes('#7221=2*0.-#5221-2*#5201'));
  assert.ok(errs(job('ren', [op('side180', { to: 'G54' })], { tcX: 0, tcZ: 0 })).some(e => /its own work offset/.test(e)));
  assert.ok(errs(job('ren', [op('side180')])).some(e => /S5/.test(e) && /ANOTHER/.test(e)));
  assert.ok(errs(job('ren', [op('side180')], { tcX: -1115000, tcZ: -2600000 })).some(e => /-11\.15 and -26\./.test(e)));
  assert.ok(errs(job('ren', [op('centre180')], { tcX: -1115000, tcZ: -26 })).some(e => /0\.00001 in/.test(e)));
  // S5 read by the program: #50700 / #50701, with the guards, and checked against a typed value
  const c = job('ren', [op('side180', { to: 'G55' })], { tcFrom: 'control', tcX: -11.15, tcZ: -26 });
  assert.deepStrictEqual(errs(job('ren', [op('side180', { to: 'G55' })], { tcFrom: 'control' })), []);
  const ct = P.eia(c);
  assert.ok(ct.includes('#5241=2*#50700-#5221-2*#5201') && ct.includes('#5243=2*#50701-#5223-2*#5203') && ct.includes('IF[ABS[#50700-[-11.15]]GT0.05]GOTO9192') && ct.indexOf('N9193') < ct.indexOf('#5241'));
  // the guard lines alone: #3000 is the alarm they raise
  const guard = ct.split('\n').filter(l => /^IF\[\[?ABS|^GOTO9193|^N919/.test(l)).join('\n');
  assert.strictEqual(run(guard, { 50700: -11.16, 50701: -26 })[3000], undefined, 'a centre within 0.05 passes');
  assert.strictEqual(run(guard, { 50700: -11.3, 50701: -26 })[3000], 2, 'differs from the typed one');
  assert.strictEqual(run(guard, { 50700: -1115000, 50701: -2600000 })[3000], 1, 'raw 0.00001 in');
  assert.strictEqual(run(guard, {})[3000], 1, 'not readable');
  // Mazatrol: kept in #950-#953 from the WPC, written by NAME-180 with M99; the program itself ends with M99
  const m = job('ren', [op('side180', { target: 'wpc', dz: -3 })], { tcX: -11.15, tcZ: -26, name: 'PRB7' });
  const t = P.eia(m);
  assert.ok(t.includes('#950=2*[-11.15]-#5341') && t.includes('#952=2*[-26.]-[#5343-3.]') && t.includes('#953=#5344+180.') && t.trim().endsWith('M99'), t);
  assert.ok(P.eia180(m) === '(PRB7-180 - MACH1 PROBING)\n(WRITES THE OTHER SIDE KEPT BY PRB7 INTO THIS WPC)\nG65 P9733 X#950 Y#951 Z#952 B#953\nM99\n');
  assert.ok(errs(Object.assign(m, { endCode: 'M30' })).some(e => /M99/.test(e)));
  const back = MACH1.open(P.toMazatrol(Object.assign(m, { endCode: 'auto' }), MACH1).save(), 'PRB7-M.PBM').toJSON().program.map(u => u.unit + (u.fields && u.fields.WORK ? ' ' + u.fields.WORK : ''));
  assert.deepStrictEqual(back.slice(1, -1), ['SUB PRO PRB7', 'WPC-', 'SUB PRO PRB7-180']);
  assert.strictEqual(P.eia180(job('ren', [op('bore')])), null);
});
ok('find the table centre: B and B+180, face and X centre each, centre from the block thickness', () => {
  const j = job('ren', [op('centre180', { bi: 90, t: 3, w: 2, zf: 0 })], { tcX: -11, tcZ: -26 });
  const t = P.eia(j);
  assert.ok(t.indexOf('G0 B90.') < t.indexOf('G0 B270.') && t.includes('G0 X#958 Y0.') && t.includes('#3006=1(TABLE CENTRE IN #954 X #955 Z)'));
  // a machine where the centre is (-11.2, -26.1): side A face at machine Z -24.6 (r = 1.5), X centre -10.9; side B at -11.5, -24.6
  const v = run(t.split('\n').filter(l => /^#9|^#3006/.test(l) === false || /^#9/.test(l)).join('\n')
    .replace(/#956=#137/, '#956=-24.6-[#5223+#5203]+#137').replace(/#957=#135/, '#957=-10.9-[#5221+#5201]+#135'), { 5221: 0, 5223: 0, 5201: 0, 5203: 0, 135: 0, 137: 0 });
  assert.ok(Math.abs(v[958] - (2 * -11 + 10.9)) < 1e-9 && Math.abs(v[959] - (2 * -26 + 3 + 24.6)) < 1e-9, JSON.stringify(v));
  const w = run('#956=-24.6\n#957=-10.9\n' + t.split('\n').filter(l => /^#95[45]/.test(l)).join('\n').replace(/#137/, '[-24.6]').replace(/#135/, '[-11.5]'), { 5221: 0, 5223: 0, 5201: 0, 5203: 0 });
  assert.ok(Math.abs(w[954] - -11.2) < 1e-9 && Math.abs(w[955] - -26.1) < 1e-9, JSON.stringify(w));
});
ok('comments are plain ASCII', () => {
  for (const c of P.list('ren')) for (const l of P.eia(job('ren', [op(c.id, { tool: c.id === 'average' ? '1A' : undefined })], { tcX: 0, tcZ: 0 })).split('\n')) assert.ok(/^[\x20-\x7E]*$/.test(l), c.id + ': ' + l);
});
ok('inspect: uneven tolerances aim the macro at mid-band; POPEN, a run line, a result line per feature, PCLOS', () => {
  const j = job('ren', [op('bore', { purpose: 'inspect', d: 1, tolP: 0.002, tolN: 0.0005 }), op('surfZ', { purpose: 'set' })]);
  const t = P.eia(j).split('\n');
  assert.ok(t.includes('G65 P9814 D1.00075 H0.00125'), t.join('|'));
  const i = k => t.findIndex(l => l.startsWith(k));
  assert.ok(i('G65 P9832') < i('POPEN') && i('POPEN') < i('#960=#960+1') && i('DPRNT[M1RUN*PROBE1*N#960[50]*D#3011[80]*T#3012[60]]') > 0);
  assert.ok(i('DPRNT[M1F1*X#135[44]') === i('G65 P9814') + 1 && i('DPRNT[M1F2') < 0, 'a result line after the inspected bore only');
  assert.ok(i('PCLOS') > i('G65 P9833'));
  // without stopping: no H, but the band still moves the nominal; no report: no POPEN
  assert.ok(P.eia(Object.assign(j, { stopOOT: false })).includes('G65 P9814 D1.00075\n'));
  assert.ok(!P.eia(job('ren', [op('bore')])).includes('POPEN'));
  // printing with W too: 9832 W1. opens the port, no second POPEN
  const w = P.eia(job('ren', [op('bore', { purpose: 'inspect', print: '1' })]));
  assert.ok(w.includes('G65 P9832 W1.') && !w.includes('POPEN') && !w.includes('PCLOS') && w.includes('G65 P9833 W1.'));
});
ok('jobs saved before purposes open with the right one', () => {
  assert.strictEqual(P.purposeOf({ type: 'bore', upd: 'active' }), 'set');
  assert.strictEqual(P.purposeOf({ type: 'bore', upd: 'none' }), 'inspect');
  assert.strictEqual(P.purposeOf({ type: 'bore', upd: 'none', tool: '3A' }), 'adjust');
  assert.strictEqual(P.purposeOf({ type: 'pcd' }), 'inspect');
  assert.strictEqual(P.purposeOf({ type: 'rotary' }), null);
  assert.deepStrictEqual(P.purposes(P.CYC.angle), ['inspect']);
  assert.strictEqual(P.newOp('pcd', 'set').purpose, 'inspect');
});
ok('reading print.txt: runs, features matched by number, judged against the job, other printouts ignored, CSV', () => {
  const j = job('ren', [op('bore', { purpose: 'inspect', x: 1, y: 2, d: 1, tolP: 0.002, tolN: 0.0005, tolM: 0.004 }), op('surfZ', { purpose: 'set' }), op('boss', { purpose: 'adjust', tool: '12A', d: 2, tolP: 0.001, tolN: 0.001 })]);
  const txt = ['          *** MEASURING PRINT OUT (TOOL MES) ***', 'TARGET   DATA   X -  21.85380',
    'M1RUN PROBE1 N    1 D20261010 T 93015',
    'M1F1 X   1.0010 Y   2.0000 Z  -0.2500 S   1.0015 A  0.0000 B  0.0000 E  0.0008 P  0.0010 C  0.0004 F0',
    'M1F3 X   0.0000 Y   0.0000 Z  -0.2500 S   2.0003 A  0.0000 B  0.0000 E  0.0003 P  0.0000 C -0.0002 F0',
    'M1RUN PROBE1 N    2 D20261010 T101500',
    'M1F1 X   1.0030 Y   2.0000 Z  -0.2500 S   1.0026 A  0.0000 B  0.0000 E  0.0018 P  0.0030 C  0.0013 F1'].join('\r\n');
  const r = P.readPrint(txt, j);
  assert.strictEqual(r.runs.length, 2); assert.deepStrictEqual(r.warn, []);
  const [a, b] = r.runs;
  assert.ok(a.n === 1 && a.date === '20261010' && a.time === '093015' && a.out === 0, JSON.stringify(a));
  const dia = a.rows.find(x => x.item === 'Ø' && x.op === 0);
  assert.ok(Math.abs(dia.dev - 0.0015) < 1e-9 && dia.res === 'OK');
  assert.ok(a.rows.some(x => x.item === 'True position Ø' && Math.abs(x.act - 0.002) < 1e-9 && x.res === 'OK'));
  assert.ok(a.rows.some(x => /Error for the tool \(12A\)/.test(x.item) && x.act === -0.0002));
  assert.ok(b.out === 3 && b.rows.find(x => x.item === 'Ø').res === 'OUT' && b.rows.find(x => x.item === 'True position Ø').res === 'OUT' && b.rows.some(x => /Machine flag 1/.test(x.item)), JSON.stringify(b.rows));
  const csv = P.reportCSV(r).split('\n');
  assert.strictEqual(csv[0], 'Part,Date,Time,Feature,Item,Nominal,Actual,Deviation,+Tol,-Tol,Result');
  assert.ok(csv.includes('1,20261010,093015,1 Bore,Ø,1.0000,1.0015,0.0015,0.0020,0.0005,OK'), csv.join('\n'));
  assert.ok(P.readPrint(txt.replace(/PROBE1/g, 'OTHER'), j).warn.length === 1);
});
ok('into a part program: the SUB PROs go after the picked units (suggested after each WPC and its INDEX/MMS), MMS unit too', () => {
  // a synthetic two-side part program: WPC, INDEX, MMS, a drilling unit, then the other side's WPC and INDEX
  const part = MACH1.program({ control: 'SmoothM', name: 'PART1' });
  part.unit('WPC-', { 'ADD.WPC': '1', X: -11, Y: -21, Th: 0, Z: -25 }); part.unit('INDEX', { ANGLE: 0 });
  part.unit('MMS', { TOOL: 'PROBE', 'NOM-0': 0.23, 'NOM-0#2': 'A' }).line('a2', { PTN: 'Z-FACE', X: 0, Y: 0, Z: 0.25, R: 0 });
  part.unit('DRILLING', { DIA: 0.25, DEPTH: 0.5 }, { template: true });
  part.unit('WPC-', { 'ADD.WPC': '2', X: -11, Y: -21, Th: 0, Z: -27 }); part.unit('INDEX', { ANGLE: 180 });
  const bytes = part.save();
  const units = P.unitsOf(MACH1, bytes, 'PART1.PBM');
  assert.deepStrictEqual(units.map(u => u.unit), ['COMMON', 'WPC-1', 'INDEX', 'MMS', 'DRILLING', 'WPC-2', 'INDEX', 'END']);
  const place = P.suggestPlace(units);
  assert.deepStrictEqual(place, { main: 3, other: 6 });
  const j = job('ren', [op('bore', { purpose: 'set' }), op('side180', { target: 'wpc' })], { tcX: -11, tcZ: -26, name: 'PRB1' });
  const r = P.insertInto(j, MACH1, bytes, 'PART1.PBM', place);
  const back = MACH1.open(r.program.save(), 'PART1.PBM').toJSON().program.map(u => u.unit + (u.fields && u.fields.WORK ? ' ' + u.fields.WORK : ''));
  assert.deepStrictEqual(back, ['COMMON', 'WPC-', 'INDEX', 'MMS', 'SUB PRO PRB1', 'DRILLING', 'WPC-', 'INDEX', 'SUB PRO PRB1-180', 'END']);
  assert.throws(() => P.insertInto(j, MACH1, bytes, 'PART1.PBM', { main: 3, other: null }), /other side/);
  // MMS: the MMS unit with its lines
  const m = P.insertInto(job('mms', [op('mXF'), op('mBore')]), MACH1, bytes, 'PART1.PBM', { main: 2 });
  const mu = MACH1.open(m.program.save(), 'PART1.PBM').toJSON().program;
  assert.ok(mu[3].unit === 'MMS' && mu[3].lines.map(l => l.fields.PTN).join() === 'X-FACE,BORE-XY', JSON.stringify(mu[3]));
});
ok('every Nth part: parts 1, N+1 ... inspected, set-ups every time', () => {
  const t = P.eia(job('ren', [op('surfZ', { purpose: 'set' }), op('bore', { purpose: 'inspect' })], { nthOn: true, nth: 4 }));
  assert.ok(t.includes('#961=[#960-1]-FIX[[#960-1]/4]*4') && t.includes('IF[#961NE0]GOTO9300') && t.includes('IF[#961NE0]GOTO9302 (NOT THIS PART)') && t.includes('\nN9302\n'));
  assert.ok(!/GOTO9301/.test(t), 'the set-up is not skipped');
  // run the skip logic: parts 1 and 5 inspect, 2-4 not
  const lines = t.split('\n').filter(l => /^#961=|^IF\[#961NE0\]GOTO9302|^N9302|^DPRNT\[M1F2/.test(l)).map(l => l.replace(/^DPRNT.*/, '#999=1').replace(/ \(.*\)$/, ''));
  const hits = [1, 2, 3, 4, 5].map(n => run(lines.join('\n'), { 960: n })[999] === 1);
  assert.deepStrictEqual(hits, [true, false, false, false, true]);
  assert.ok(errs(job('ren', [op('bore', { purpose: 'inspect' })], { nthOn: true, nth: 1 })).some(e => /N must be 2/.test(e)));
});
ok('ready-made jobs and the move timeline', () => {
  for (const T of P.TEMPLATES) {
    const f = P.fromTemplate(T.id, {}), j = job(f.sys, f.ops.map(o => Object.assign(o, o.purpose === 'adjust' ? { tool: '7A' } : {})), { tcX: -11, tcZ: -26 });
    assert.deepStrictEqual(errs(j), [], T.id);
    assert.ok(P.moves(j).length > 0, T.id);
  }
  const mv = P.moves(job('ren', [op('bore', { x: 2, y: 1, d: 1 }), op('rotary', { bi: 90 })]));
  assert.deepStrictEqual(mv.slice(0, 3).map(m => m.kind), ['rapid', 'protected', 'protected']);
  assert.strictEqual(mv.filter(m => m.op === 0 && m.kind === 'touch').length, 4);
  assert.ok(mv.some(m => m.kind === 'index' && /B90/.test(m.label)) && mv.filter(m => m.kind === 'index').length === 2, 'B turns, then turns again for the check');
});
ok('every operation draws something or nothing, never throws', () => {
  for (const sys of ['ren', 'mms', 'mmseia']) P.plot(job(sys, P.list(sys).map(c => op(c.id)))).forEach(g => assert.ok(g && typeof g === 'object'));
});
console.log(n + ' probing tests passed' + (process.exitCode ? ' (with failures)' : ''));
