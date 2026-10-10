// Program model tests: file round trips, Matrix<->Smooth conversion against SLN's own pair, and field
// entry: typing back what a field shows must store the same bytes.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Maz = require('../src/core.js');
Maz.useSchema(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/schema.json'), 'utf8')));
// the shop's sample and customer programs live outside the repo (see datapaths.js)
const { KETS, KET, kp } = require('./datapaths.js');
const read = f => new Uint8Array(fs.readFileSync(path.isAbsolute(f) ? f : kp(f)));
const SAMPLES = ['SAMPLE1.PBD', 'SAMPLE1.PBM', 'SLN/Samples/GP-PART7.PBD', 'SLN/Samples/GP-PART7-M.PBD',
  'SLN/Samples/LATHEPART-MM.PBP', 'SLN/Samples/LIVE-TOOLING-MM.PBN'];
const SHOP = [];
for (const d of ['MILL MARIX  NEXUS2', 'MILL SMOOHG', 'LATHE NEXUS', 'LATHE SMOOTHG']) {
  const full = kp('samplemazak/cnc', d);
  if (fs.existsSync(full)) for (const f of fs.readdirSync(full).sort()) if (/\.PB[DMFP]$/i.test(f)) SHOP.push(path.join(full, f));
}
let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } };
const hex = b => Buffer.from(b).toString('hex');
const metric = f => /-M\.|-MM\./.test(f);

for (const f of SAMPLES.concat(SHOP)) ok('roundtrip ' + path.basename(f), () => {
  const b = read(f), p = Maz.parse(b, path.basename(f));
  assert.strictEqual(hex(Maz.serialize(p)), hex(b));
});

// The Smooth controls' own program files (Smooth CAM Ai machine data, MC_Machine Programs): .MAZ .MTP .MPR are
// the records of a .PBM .PBP .PBN with no header.
const MACHINE_FILES = [];
const MACHINES = kp('MAZATROL/Smooth'), { machine } = require('./datapaths.js');
if (fs.existsSync(MACHINES)) for (const m of fs.readdirSync(MACHINES).sort()) {
  const dir = path.join(machine(m), 'MC_Machine Programs');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).sort()) if (/\.(MAZ|MTP|MPR)$/i.test(f)) MACHINE_FILES.push(path.join(dir, f));
}
ok('machine files: ' + MACHINE_FILES.length + ' open and save unchanged, lines render', () => {
  for (const f of MACHINE_FILES) {
    const b = read(f), p = Maz.parse(b, path.basename(f));
    assert.ok(p.raw, f);
    assert.strictEqual(p.ctl, { MAZ: 'SmoothM', MTP: 'SmoothT', MPR: 'SmoothE' }[f.slice(-3).toUpperCase()], f);
    assert.strictEqual(hex(Maz.serialize(p)), hex(b), f);
    assert.ok(!p.warnings.some(w => /common unit|whole number/.test(w)), f + ': ' + p.warnings.join(' '));
    for (const L of Maz.lines(p)) if (L.lay) Maz.printLine(L);
  }
});
// Tool check: a program's tools against a machine's tool data (its control memory)
if (fs.existsSync(machine('MCH-C2'))) ok('tool check against the MCH-C2 and the MCH-H', () => {
  const mem = m => Maz.parseMachineMemory(read(path.join(machine(m), 'm8ysram')), 'm8ysram');
  const prog = (m, f) => Maz.parse(read(path.join(machine(m), 'MC_Machine Programs', f)), f);
  const table = (p, t) => {
    const mts = Maz.machineTools(t);
    return Maz.programTools(p, 'inch').map(pt => {
      const r = Maz.checkTool(pt, mts);
      return `${pt.name} ${pt.nomText} ${pt.sfx}`.trim() + ' ' + r.status + (r.tools.length ? ' ' + r.tools.map(x => 'T' + x.tno).join(',') : '');
    });
  };
  assert.deepStrictEqual(table(prog('MCH-C2', 'PRG-A.MAZ'), mem('MCH-C2')), [
    'PROBE 0.23 A ok T2', 'F-MILL 6. b ok T19', 'DRILL 1.93 missing', 'E-MILL 0.75 A ok T69', 'E-MILL 0.75 C ok T67',
    'E-MILL 0.75 B ok T23', 'CHMF-M 1.15 A ok T1', 'E-MILL 1.25 A missing', 'DRILL 0.25 A ok T57', 'DRILL 0.62 C missing']);
  // the same program on the MCH-C1: its 1.25 end mill is there with suffix C only
  assert.ok(table(prog('MCH-C2', 'PRG-A.MAZ'), mem('MCH-C1')).includes('E-MILL 1.25 A suffix T79'));
  // turning tools match with their part (OUT, IN, ...) and nominal in hundredths
  const lathe = table(prog('MCH-H', 'PRG-F-OP2.MTP'), mem('MCH-H'));
  assert.strictEqual(lathe[0], 'GNL OUT 5. A ok T8', lathe[0]);
  assert.ok(lathe.some(x => /^TAP-UN 1\/2-13 A missing/.test(x)), lathe.join(' | '));
  // pockets come from the first pocket table
  const m1 = Maz.machineTools(mem('MCH-C1'));
  assert.strictEqual(m1.find(x => x.tno === 2).pocket, 1);
});
if (fs.existsSync(machine('MCH-C2'))) ok('compare the shop copies with the machines\' copies', () => {
  const shop = f => Maz.parse(read(kp('samplemazak', f)), path.basename(f));
  const mach = (m, f) => Maz.parse(read(path.join(machine(m), 'MC_Machine Programs', f)), f);
  const count = r => { const c = {}; r.items.forEach(i => { c[i.kind] = (c[i.kind] || 0) + 1; }); return c; };
  const r = Maz.diffPrograms(shop('cnc/MILL SMOOHG/PRG-B.PBM'), mach('MCH-C2', 'PRG-B.MAZ'), 'inch');
  assert.deepStrictEqual(count(r), { changed: 25, added: 15, hidden: 2 });
  assert.deepStrictEqual(r.items[0].fields, [['INITIAL-Z', '4.', '8.'], ['DIS.', '0', '1']]);
  // three work offsets were remeasured at the machine
  const r2 = Maz.diffPrograms(shop('iy344/PRG-C-OP5.PBM'), mach('MCH-C1', 'PRG-C-OP5.MAZ'), 'inch');
  assert.deepStrictEqual(r2.items.map(i => i.kind + ' ' + i.ib), ['changed 3', 'changed 18', 'changed 43']);
  assert.deepStrictEqual(Maz.diffPrograms(shop('cnc/MILL SMOOHG/PRG-A.PBM'), mach('MCH-C1', 'PRG-A.MAZ'), 'inch').items, []);
  // a Matrix program is compared as its Smooth conversion
  const r3 = Maz.diffPrograms(shop('cnc/LATHE NEXUS/PRG-G.PBF'), mach('MCH-H2', 'PRG-G.MTP'), 'inch');
  assert.strictEqual(r3.a.ctl, 'SmoothT');
  assert.ok(r3.items.some(i => i.kind === 'changed' && i.fields.some(f => f[0] === 'RPM' && f[2] === '700.')));
  assert.throws(() => Maz.diffPrograms(shop('cnc/MILL SMOOHG/PRG-B.PBM'), mach('MCH-H2', 'PRG-G.MTP'), 'inch'), /cannot be compared/);
});
ok('compare: inserted units do not shift the rest', () => {
  const P0 = Maz.parse(read('SAMPLE1.PBM'), 'SAMPLE1.PBM');
  const P1 = Object.assign({}, P0, { recs: P0.recs.map(r => r.slice()) });
  const extra = P1.recs[1].slice();
  P1.recs.splice(1, 0, extra);                   // the same unit twice: one added
  Maz.renumber(P1);
  const r = Maz.diffPrograms(P0, P1, 'inch');
  assert.deepStrictEqual(r.items.map(i => i.kind), ['added']);
});
ok('tool check rules', () => {
  // a tap matches on its size bytes, a length within a micrometre, a turning tool on part and hundredths
  const T = (type, part, sfx, nomRaw, nomTap) => ({ tno: 1, type, part, sfx, nomRaw, nomTap: nomTap || '0.0.0.0', length: 0, dia: 0 });
  const tap = { type: 5, part: 0, kind: 'tap', nom: '3.1.1.13', sfx: 'A' };
  assert.strictEqual(Maz.checkTool(tap, [T(5, 0, 'A', 0, '3.1.1.13')]).status, 'ok');
  assert.strictEqual(Maz.checkTool(tap, [T(5, 0, 'A', 0, '3.2.1.13')]).status, 'missing');
  const em = { type: 15, part: 0, kind: 'len', nom: 75000 * 254, sfx: 'A' };
  assert.strictEqual(Maz.checkTool(em, [T(15, 0, 'A', 19050000)]).status, 'ok');
  assert.strictEqual(Maz.checkTool(em, [T(15, 0, 'B', 19050000)]).status, 'suffix');
  assert.strictEqual(Maz.checkTool(em, [T(15, 0, 'A', 19100000)]).status, 'missing');
  const gnl = { type: 33, part: 1, kind: 'hund', nom: 500, sfx: 'A' };
  assert.strictEqual(Maz.checkTool(gnl, [T(33, 2, 'A', 500)]).status, 'missing');
  assert.strictEqual(Maz.checkTool(gnl, [T(33, 1, 'A', 500)]).status, 'ok');
  assert.deepStrictEqual([Maz.suffixText(2, 0), Maz.suffixText(2, 128), Maz.suffixText(2, 0x20), Maz.suffixText(0, 0)], ['B', 'b', '!B', '']);
});
ok('a .MAZ holds the records of its .PBM', () => {
  let same = 0;
  for (const f of SHOP.filter(f => /\.PBM$/i.test(f))) {
    const m = MACHINE_FILES.find(g => path.basename(g, '.MAZ') === path.basename(f, '.PBM'));
    if (!m) continue;
    const pbm = read(f), maz = read(m);
    if (hex(pbm.subarray(0x104)) !== hex(maz)) continue;         // edited at the machine since
    same++;
    const a = Maz.parse(pbm, path.basename(f)), b = Maz.parse(maz, path.basename(m));
    assert.deepStrictEqual(Maz.lines(b).map(L => L.lay && Maz.printLine(L)), Maz.lines(a).map(L => L.lay && Maz.printLine(L)));
    const back = Maz.serialize(Object.assign({}, b, { raw: false }));
    assert.strictEqual(hex(back.subarray(0x104)), hex(pbm.subarray(0x104)));
    assert.strictEqual(back[0x20], 0x26);
  }
  if (MACHINE_FILES.length) assert.ok(same >= 5, 'only ' + same + ' matching pairs');
});

ok('SAMPLE1.PBD -> Smooth equals SAMPLE1.PBM', () => {
  const p = Maz.convert(Maz.parse(read('SAMPLE1.PBD'), 'SAMPLE1.PBD'), 'SmoothM');
  assert.strictEqual(hex(Maz.serialize(p)), hex(read('SAMPLE1.PBM')));
  assert.strictEqual(p.name, 'SAMPLE1.PBM');
});
ok('SAMPLE1.PBM -> Matrix equals SAMPLE1.PBD', () => {
  const p = Maz.convert(Maz.parse(read('SAMPLE1.PBM'), 'SAMPLE1.PBM'), 'MatrixM');
  assert.strictEqual(hex(Maz.serialize(p)), hex(read('SAMPLE1.PBD')));
});
// Matrix -> Smooth -> Matrix must give the program back exactly. Smooth -> Matrix loses what Matrix cannot
// hold (cutting speed decimals, Smooth-only fields), so the way back may differ only there.
for (const f of SHOP) ok('convert there and back ' + path.basename(f), () => {
  const p = Maz.parse(read(f), path.basename(f));
  const other = Maz.counterpart(p.ctl);
  const back = Maz.convert(Maz.convert(p, other), p.ctl);
  if (Maz.CONTROLS[p.ctl].family === 'Matrix') {
    assert.strictEqual(hex(Maz.serialize(back)), hex(Maz.serialize(p)));
    return;
  }
  const ls = Maz.lines(p), bad = [];
  p.recs.forEach((r, i) => {
    const q = back.recs[i];
    for (let k = 0; k < 100; k++) {
      if (r[k] === q[k]) continue;
      const cell = ls[i].lay && ls[i].lay.cells.find(c => k >= c[0] && k < c[0] + c[1]);
      const code = ls[i].sel.code;
      const smoothOnly = code === 1 && k === 11 || code === 0xf && k >= 60 && k < 64;
      const lossy = k >= 4 && k < 8 || smoothOnly || cell && (cell[2] === 0x69 && Math.abs(Maz.raw(r, cell) - Maz.raw(q, cell)) < 1000 || cell[2] === 0x7e);
      if (!lossy) { bad.push('rec ' + i + ' byte ' + k); break; }
    }
  });
  assert.deepStrictEqual(bad, []);
});
ok('mill cannot become a lathe', () => {
  assert.throws(() => Maz.convert(Maz.parse(read('SAMPLE1.PBD'), 'SAMPLE1.PBD'), 'SmoothT'), /cannot be converted/);
});

// fields whose display drops digits (inch depths squeezed into 5 characters) cannot round-trip exactly
const lossy = (L, i, units) => L.sel.code === 0xb0 && L.lay.cells[i][0] === 56 && units === 'inch';

// CAM-written values can carry more digits than the display (5th decimal); re-typing then rounds them
const belowDisplay = (L, q, i) => {
  const c = L.lay.cells[i];
  if (c[1] !== 4) return false;
  const a = Maz.raw(L.rec, c), b = Maz.raw(q, c);
  return Math.abs(a - b) < 10 && Buffer.compare(Buffer.from(L.rec.subarray(0, c[0])), Buffer.from(q.subarray(0, c[0]))) === 0 &&
    Buffer.compare(Buffer.from(L.rec.subarray(c[0] + 4)), Buffer.from(q.subarray(c[0] + 4))) === 0 || (c[2] === 0x69 && Math.abs(a - b) < 1000);
};

// Typing what a field shows stores the same value (for every editable, non-blank field of every program).
for (const f of SAMPLES.concat(SHOP)) ok('re-enter shown values ' + path.basename(f), () => {
  const units = metric(f) ? 'metric' : 'inch';
  const p = Maz.parse(read(f), path.basename(f));
  const bad = [];
  Maz.lines(p).forEach((L, r) => {
    if (!L.lay || L.sel.inferred) return;
    for (const i of Maz.shownCells(L.lay)) {
      const text = Maz.cellText(L, i, { units, printNames: true });
      if (!text.trim() || text === '<>' || Maz.locked(L, i)) continue;
      const q = L.rec.slice(), Lq = Object.assign({}, L, { rec: q });
      try { Maz.enter(Lq, i, text, { units }); } catch (e) { bad.push(`rec ${r} code ${L.sel.code.toString(16)} cell ${i} "${text}": ${e.message}`); continue; }
      const again = Maz.cellText(Lq, i, { units, printNames: true });
      if (again !== text) bad.push(`rec ${r} code ${L.sel.code.toString(16)} cell ${i} "${text}" -> "${again}"`);
      else if (hex(q) !== hex(L.rec) && !lossy(L, i, units) && !belowDisplay(L, q, i)) {
        const d = []; for (let k = 0; k < 100; k++) if (q[k] !== L.rec[k]) d.push(k + ':' + L.rec[k] + '>' + q[k]);
        bad.push(`rec ${r} code ${L.sel.code.toString(16)} cell ${i} "${text}" bytes ${d.join(' ')}`);
      }
    }
  });
  assert.deepStrictEqual(bad.slice(0, 12), []);
});

// Specific entries
const P = Maz.parse(read('SAMPLE1.PBD'), 'SAMPLE1.PBD');
const Ls = Maz.lines(P);
const L = (r, rec) => Object.assign({}, Ls[r], { rec });
const show = (Lx, i, units = 'inch') => Maz.cellText(Lx, i, { units, printNames: true });
ok('MANL PRG data with address', () => {
  const l = L(2, P.recs[2].slice());          // SNo 1: G0 X0.1
  Maz.enter(l, 5, 'Y-1.25', { units: 'inch' });     // DATA 2
  assert.strictEqual(show(l, 4), 'Y'); assert.strictEqual(show(l, 5), '-1.25');
  Maz.enter(l, 3, '2.5', { units: 'inch' });        // value only keeps X
  assert.strictEqual(show(l, 2), 'X'); assert.strictEqual(show(l, 3), '2.5');
  assert.throws(() => Maz.enter(l, 7, '3', { units: 'inch' }), /address/);
  Maz.enter(l, 8, 'z.5', { units: 'inch' });        // address cell with value
  assert.strictEqual(show(l, 8), 'Z'); assert.strictEqual(show(l, 9), '0.5');
  Maz.enter(l, 15, 'M9', { units: 'inch' });
  assert.strictEqual(show(l, 15), 'M'); assert.strictEqual(show(l, 16), '9');
  Maz.enter(l, 14, '2500', { units: 'inch' });
  assert.strictEqual(show(l, 14), '2500');
  Maz.clear(l, 16);
  assert.strictEqual(show(l, 15), ''); assert.strictEqual(show(l, 16), '');
});
ok('tool, suffix, tap sizes', () => {
  const l = L(1, P.recs[1].slice());          // MANL PRG unit
  Maz.enter(l, 1, 'drill', {}); assert.strictEqual(show(l, 1), 'DRILL');
  Maz.enter(l, 1, 'END MILL', {}); assert.strictEqual(show(l, 1), 'E-MILL');
  Maz.enter(l, 4, 'b', {}); assert.strictEqual(show(l, 4), 'b'); assert.strictEqual(l.rec[12], 0x80);
  Maz.enter(l, 4, 'B', {}); assert.strictEqual(show(l, 4), 'B'); assert.strictEqual(l.rec[12], 0);
  assert.throws(() => Maz.enter(l, 4, 'I', {}));
  Maz.enter(l, 1, 'TAP', { units: 'inch' }); assert.strictEqual(show(l, 1), 'TAP-UN');
  // this NOM (format 0x120) shows number sizes without "UN#", as MazEdit does; typing that text back keeps them
  for (const [t, want] of [['1/4-20', '1/4-20'], ['M10', 'M10.'], ['#10-24', '10-24'], ['10-24', '10-24'], ['6-32', '6-32'],
    ['1-8', '1 -8'], ['2/4-13', '1/2-13'], ['PT1/8', 'PT1/8'], ['1 1/8-7', '9/8-7'], ['other', 'OTHER']]) {
    Maz.enter(l, 3, t, {}); assert.strictEqual(show(l, 3), want, t);
  }
  assert.deepStrictEqual([...l.rec.subarray(36, 40)], [7, 0, 0, 0]);
});
ok('WPC and enums', () => {
  const G = Maz.parse(read('SLN/Samples/GP-PART7.PBD'), 'GP-PART7.PBD');
  const w = Object.assign({}, Maz.lines(G)[1]);
  w.rec = w.rec.slice();
  Maz.enter(w, 1, 'g57', {}); assert.strictEqual(Maz.cellText(w, 1, {}), 'G57');
  Maz.enter(w, 1, 'G54.1P12', {}); assert.strictEqual(Maz.cellText(w, 1, {}), 'G54.1P12');
  const e = L(5, P.recs[5].slice());
  Maz.enter(e, 7, 'ToolChg', {}); assert.strictEqual(show(e, 7), 'ToolChg');
  assert.throws(() => Maz.enter(e, 7, 'bogus', {}), /Choose one of/);
});
ok('mill point units have no C-FACE (MazEdit hides it on mills)', () => {
  const G = Maz.parse(read('SLN/Samples/GP-PART7.PBD'), 'GP-PART7.PBD');
  const d = Maz.lines(G).find(l => l.sel.code === 0x20);
  assert.ok(!/C-FACE/.test(d.lay.head), d.lay.head);
  assert.strictEqual(Maz.lineText(d, {}).slice(0, 24), '   3 DRILLING           ');
});
ok('new program is valid and renumbers', () => {
  for (const ctl of ['MatrixM', 'SmoothM']) {
    const p = Maz.newProgram(ctl, 'X');
    assert.strictEqual(p.recs.length, 2);
    const u = Maz.newUnit(ctl, 0x20, { units: 'inch' });
    p.recs.splice(1, 0, ...u); Maz.renumber(p);
    assert.deepStrictEqual(p.recs.map(r => [Maz.code(r), Maz.number(r)]), [[1, 0], [0x20, 1], [0xb0, 1], [0xb0, 2], [0xc0, 1], [4, 2]]);
    const b = Maz.serialize(p), q = Maz.parse(b, 'X.' + Maz.CONTROLS[ctl].ext);
    assert.strictEqual(hex(Maz.serialize(q)), hex(b));
    assert.strictEqual(Maz.cellText(Maz.lines(q)[2], 0, { printNames: true }), 'CTR-DR');
  }
});
ok('lathe program: common unit, turning tool lines, TPC records keep their numbers', () => {
  const f = SHOP.find(x => /BB-87-0\.PBP$/.test(x));
  if (!f) return;
  const p = Maz.parse(read(f), 'BB-87-0.PBP'), ls = Maz.lines(p);
  assert.strictEqual(ls[0].lay.head.slice(0, 20), 'UNo. MAT.           ');
  assert.ok(ls.some(l => l.sel.code === 0xb4 && /FIN-X/.test(l.lay.head)));
  const before = p.recs.map(r => Maz.number(r)).join(',');
  Maz.renumber(p);
  assert.strictEqual(p.recs.map(r => Maz.number(r)).join(','), before);
});
ok('Smooth C-SP and S convert', () => {
  const G = Maz.parse(read('SLN/Samples/GP-PART7.PBD'), 'GP-PART7.PBD');
  const S = Maz.convert(G, 'SmoothM'), M = Maz.convert(S, 'MatrixM');
  assert.strictEqual(hex(Maz.serialize(M)), hex(Maz.serialize(G)));
  const i = G.recs.findIndex(r => Maz.code(r) === 0xb0);
  assert.strictEqual(Maz.cellText(Maz.lines(S)[i], 12, {}), Maz.cellText(Maz.lines(G)[i], 12, {}));
});
// tool data files (TOOLDATA / TOOLFILE): byte-exact round trips, and entry in the files' nanometre lengths
const TOOLS = [];
for (const d of fs.existsSync(kp('SLN/Samples')) ? fs.readdirSync(kp('SLN/Samples')) : []) {
  const full = kp('SLN/Samples', d);
  if (fs.statSync(full).isDirectory()) for (const f of fs.readdirSync(full)) if (/^TOOL(DATA|FILE)\.DB[DM]$/i.test(f)) TOOLS.push(path.join(full, f));
}
for (const f of TOOLS) ok('tool data roundtrip ' + f, () => {
  const b = read(f), t = Maz.parseToolFile(b, f, /mill-turn/.test(f) ? 'millturn' : 'mill');
  assert.strictEqual(hex(Maz.serializeToolFile(t)), hex(b));
  const ls = Maz.toolLines(t);
  assert.ok(ls.length > 0, 'shows the used tools');
  for (const L of ls) Maz.lineText(L, { units: 'inch' });
  Maz.setToolType(t, 'lathe');                       // another layout for the same records
  assert.strictEqual(hex(Maz.serializeToolFile(t)), hex(b));
});
ok('tool data length entry is in nanometres', () => {
  const f = TOOLS.find(x => /Mill ToolData INCH.TOOLDATA/.test(x));
  if (!f) return;
  const t = Maz.parseToolFile(read(f), f, 'mill');
  const L = Maz.toolLines(t).find(x => x.sel.block === 1);
  const k = L.lay.cells.findIndex(c => c[0] === 28);                // Length
  Maz.enter(L, k, '6.5', { units: 'inch' });
  assert.strictEqual(Buffer.from(L.rec).readInt32LE(28), 165100000);
  assert.strictEqual(Maz.cellText(L, k, { units: 'inch' }), '6.5');
  Maz.enter(L, k, '100', { units: 'metric' });
  assert.strictEqual(Buffer.from(L.rec).readInt32LE(28), 100000000);
  assert.strictEqual(Maz.cellText(L, k, { units: 'inch' }), '3.937');
});
// POCKET TPC, from a copy of a program with every value typed on the control as something different (the file is on
// the shared drive, where the Smooth CAM Ai PC put it; skipped when it is not there)
const POCKET = require('./datapaths.js').CHAT + '/EXTRA-01.MAZ';
if (fs.existsSync(POCKET)) ok('POCKET TPC: E21 is the length at byte 20, E31 the digit at byte 92, relay point records are 0xf0', () => {
  const p = Maz.parse(new Uint8Array(fs.readFileSync(POCKET)), 'T.MAZ');
  const main = p.recs.findIndex(r => r[0] === 0xe8), f = Maz.tpcFields(p.recs[main]).fields, text = d => (f.find(x => x.d === d) || {}).text;
  assert.deepStrictEqual(['E1', 'E2', 'E5', 'E7', 'E9', 'E17', 'E18', 'E21', 'E22', 'E31', 'E32', 'E37', 'E92'].map(text), ['0.11', '0.13', '0.15', '0.17', '0.19', '1', '3', '0.27', '12', '2', '22', '0.31', '00001100']);
  assert.strictEqual(f.find(x => x.d === 'E21').off, 20); assert.strictEqual(f.find(x => x.d === 'E31').off, 92);
  const relay = p.recs.filter(r => r[0] === 0xf0), i32 = (r, o) => r[o] | r[o + 1] << 8 | r[o + 2] << 16 | r[o + 3] << 24;
  assert.strictEqual(relay.length, 2);
  assert.deepStrictEqual(relay.map(r => r[10]), [1, 2]);                                   // approach, escape
  assert.deepStrictEqual([36, 40, 44, 48, 52, 56, 60, 64, 68].map(o => i32(relay[0], o) / 1e5), [1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3]);
  assert.deepStrictEqual([20, 22, 24].map(o => relay[1][o] | relay[1][o + 1] << 8), [17, 37, 57]);
  assert.deepStrictEqual([72, 76, 80].map(o => i32(relay[0], o) / 1000), [8, 28, 48]);
});
// LINE IN, LINE CTR, CHMF IN and CHMF OUT TPC, the same way (the two saves are on the shared drive)
const TPC2 = require('./datapaths.js').CHAT + '/EXTRA-02.MAZ';
if (fs.existsSync(TPC2)) ok('TPC of LINE IN, LINE CTR, CHMF IN and CHMF OUT: every typed value reads back', () => {
  const p = Maz.parse(new Uint8Array(fs.readFileSync(TPC2)), 'T.MAZ');
  const read = code => { const t = Maz.tpcFields(p.recs.find(r => r[0] === code)); return t.unit + ': ' + t.fields.map(f => f.d + '=' + f.text).join(' '); };
  assert.strictEqual(read(0xe0), 'LINE IN: E1=0.11 E2=0.15 E5=0.19 E7=0.23 E9=0.27 E17=3 E21=0.17 E22=21 E23=25 E24=29 E25=31 E95=11011101 E104=00000000');
  assert.strictEqual(read(0xdc), 'LINE CTR: E2=0.11 E7=0.13 E9=0.15 E17=7 E30=0.17 E95=11011101 E104=00000000');
  assert.strictEqual(read(0xe4), 'CHMF IN: E1=0.11 E2=0.13 E8=0.15 E9=0.17 E11=0.19 E17=5 E21=0.21 E95=11011101');
  assert.strictEqual(read(0xe3), 'CHMF OUT: E1=0.31 E2=0.33 E8=0.35 E9=0.37 E11=0.39 E17=6 E21=0.41 E95=11011101');
  assert.strictEqual(p.recs.filter(r => r[0] === 0xf0).length, 8);                       // two relay point records per edited unit
});
// RGH CBOR and SLOT TPC (a copy of PRG-K on the Smooth CAM Ai PC: every typed value, record by record)
const TPC3 = require('./datapaths.js').CHAT + '/EXTRA-03.MAZ';
if (fs.existsSync(TPC3)) ok('TPC of RGH CBOR and SLOT: every typed value reads back (E96 is at byte 44)', () => {
  const p = Maz.parse(new Uint8Array(fs.readFileSync(TPC3)), 'T.MAZ');
  const read = code => { const t = Maz.tpcFields(p.recs.find(r => r[0] === code)); return t.unit + ': ' + t.fields.map(f => f.d + '=' + f.text).join(' '); };
  assert.strictEqual(read(0xd1), 'RGH CBOR: D1=0.11 D3=3 D16=4 D17=0.15 D19=5 D23=0.3 D41=0.4 D42=0.21 D91=11111001 D92=00001111 D45=0.23 D46=0.25 D62=6');
  assert.strictEqual(read(0xeb), 'SLOT: E7=0.11 E9=0.13 E17=3 E20=5 E21=0.15 E32=21 E33=23 E34=25 E35=27 E36=29 E37=0.0123 E96=00000110 E104=00000000 E129=1');
  assert.strictEqual(p.recs.filter(r => r[0] === 0xf0).length, 4);
});
// LINE RGT, LINE OUT and REAMING TPC (copies of programs of the MCH-K edited on the Smooth CAM Ai PC)
const TPC4 = [require('./datapaths.js').CHAT + '/EXTRA-04.MAZ', require('./datapaths.js').CHAT + '/EXTRA-05.MAZ'];
if (TPC4.every(f => fs.existsSync(f))) ok('TPC of LINE RGT, LINE OUT and REAMING: every typed value reads back', () => {
  const read = (file, code) => { const p = Maz.parse(new Uint8Array(fs.readFileSync(file)), 'T.MAZ'), t = Maz.tpcFields(p.recs.find(r => r[0] === code)); return t.unit + ': ' + t.fields.map(f => f.d + '=' + f.text).join(' '); };
  assert.strictEqual(read(TPC4[0], 0xdd), 'LINE RGT: E2=0.11 E7=0.13 E9=0.15 E17=5 E22=21 E23=23 E24=29 E25=27 E95=11011101 E104=00000000');
  assert.strictEqual(read(TPC4[1], 0xdf), 'LINE OUT: E1=0.11 E2=0.13 E5=0.15 E7=0.17 E9=0.19 E17=5 E21=0.21 E22=23 E23=27 E24=29 E25=31 E95=11011101 E104=00000000');
  assert.strictEqual(read(TPC4[1], 0xd3), 'REAMING: D1=0.11 D3=3 D16=4 D17=0.13 D18=5 D19=6 D23=0.4 D24=7 D25=0.15 D26=0.17 D28=0.19 D29=8 D41=0.3 D42=0.21 D91=11111001 D92=00001111 D45=0.039 D46=0.039 D62=0');
});
// turning TPC (MCH-G2, program edited on the Smooth CAM Ai PC, every value different)
const TPCT = require('./datapaths.js').CHAT + '/EXTRA-06.MTP';
if (fs.existsSync(TPCT)) ok('TPC of the turning units and the lathe point units: every typed value reads back', () => {
  const p = Maz.parse(new Uint8Array(fs.readFileSync(TPCT)), 'T.MTP'), fam = Maz.CONTROLS[p.ctl].family, ty = Maz.CONTROLS[p.ctl].type;
  const read = code => { const t = Maz.tpcFields(p.recs.find(r => r[0] === code), ty, fam); return t.unit + ': ' + t.fields.map(f => f.d + '=' + f.text).join(' '); };
  assert.strictEqual(read(0xf5), 'BAR: TC67=0.0713 TC68=0.0813 TC1=95 TC5=45 TC6=55 TC71=3 TC13=90 TC15=0.0613 TC54=1.5 TC155=1.2 TC37=0.0113 TC38=0.0213 TC39=0.0313 TC40=0.0413 TC62=5 TC45=0.0513');
  assert.strictEqual(read(0xfa), 'T.GROOVE: TC42=0.0246 TC43=0.0545 TC52=4 TC69=2 TC73=0.0494 TC74=0.0049 TC75=0.0297 TC156=0.0059 TC158=20 TC159=0.0069 TC160=0.0079 TC161=0.0089 TC290=00000000 TC37=0.0181 TC38=0.0282 TC39=0.0383 TC40=0.0484 TC62=9 TC45=0.0585');
  assert.strictEqual(read(0xf9), 'THREAD: TC41=0.0197 TC77=5. TC78=0.002 TC82=0.4 TC290=00000000 TC37=0.0191 TC38=0.0292 TC39=0.0393 TC40=0.0494 TC62=3 TC45=0.0595');
  assert.ok(/D62=9 D66=55 D130=0.25 D141=00000010 TC37=0.0121 TC38=0.0222 TC39=0.0323 TC40=0.0424 TC62=6$/.test(read(0xd0)), read(0xd0));
  assert.ok(Maz.isTpcMain(0xf5) && Maz.isTpcMain(0xd4) && !Maz.isTpcMain(0xf0) && !Maz.isTpcMain(0xf1));
});
// BORE T2 / S2 (MCH-K) and the mill-turn's POCKET / TC290 (350): every typed value reads back
const TPC5 = [require('./datapaths.js').CHAT + '/EXTRA-07.MAZ', require('./datapaths.js').CHAT + '/EXTRA-08.MPR', require('./datapaths.js').CHAT + '/EXTRA-09.MTP'];
if (TPC5.every(f => fs.existsSync(f))) ok('TPC of BORE T2 / S2, the mill-turn POCKET with E40 / E41, and TC290', () => {
  const rd = (file, code, ext) => { const p = Maz.parse(new Uint8Array(fs.readFileSync(file)), 'x.' + ext), r = p.recs.find(q => q[0] === code), t = Maz.tpcFields(r, Maz.CONTROLS[p.ctl].type, Maz.CONTROLS[p.ctl].family); return { p, t, text: t.unit + ': ' + t.fields.map(f => f.d + '=' + f.text).join(' ') }; };
  assert.strictEqual(rd(TPC5[0], 0xda, 'MAZ').text, 'BORE T2: D1=0.18 D3=6 D16=7 D17=0.19 D18=8 D19=9 D23=0.8 D24=4 D25=0.28 D26=0.29 D28=0.31 D41=0.7 D42=0.32 D91=11111001 D92=00001111 D45=0.37 D46=0.38 D62=5');
  assert.strictEqual(rd(TPC5[0], 0xdb, 'MAZ').text.slice(0, 16), 'BORE S2: D1=0.15');
  const pk = rd(TPC5[1], 0xe8, 'MPR'), ex = pk.p.recs.find(r => r[0] === 0xf0 && !Maz.isRelay(r));
  assert.ok(/E92=00001101 E99=00110000/.test(pk.text) && /E31=7/.test(pk.text) && ex);
  assert.strictEqual(Maz.tpcExtra(ex).map(f => f.d + '=' + f.text).join(' '), 'E40=0.23 E41=0.25');
  assert.ok(/TC290=01001101/.test(rd(TPC5[2], 0xfa, 'MTP').text) && /TC290=10110010/.test(rd(TPC5[2], 0xf9, 'MTP').text));
  const mtp = Maz.parse(new Uint8Array(fs.readFileSync(TPC5[2])), 'x.MTP');
  assert.ok(mtp.recs.filter(r => r[0] === 0xf0).every(r => Maz.isRelay(r)) && mtp.recs.some(r => r[0] === 0xf0));
});
// metric TPC (a metric sample machine): lengths are stored with one decimal fewer than inch
const TPCM = require('./datapaths.js').CHAT + '/EXTRA-10.MAZ';
if (fs.existsSync(TPCM)) ok('metric TPC: E1 3.5, E7 4.5, E9 5.5, D1 2.5 read back; defaults in mm', () => {
  const p = Maz.parse(new Uint8Array(fs.readFileSync(TPCM)), 'x.MAZ'), rd = code => { const t = Maz.tpcFields(p.recs.find(r => r[0] === code), 'mill', 'Smooth', 'metric'); return t.fields.map(f => f.d + '=' + f.text).join(' '); };
  assert.ok(/^E1=3\.5 E2=3\. E5=0\.5 E7=4\.5 E9=5\.5 E17=4 E92=00001101 E99=01000000 E18=8 E21=1\./.test(rd(0xe8)), rd(0xe8));
  assert.ok(/^D1=2\.5 D3=2 D16=2 D17=1\. D41=3\. D42=0\./.test(rd(0xd0)) && /D45=1\. D46=1\./.test(rd(0xd0)) && /F12=0\.1 D55=0\.2/.test(rd(0xd0)), rd(0xd0));
  const r = new Uint8Array(100); Maz.tpcSet(r, 8, 'len2', '3.5', true); assert.strictEqual(r[8], 35); Maz.tpcSet(r, 8, 'len2', '0.12', false); assert.strictEqual(r[8], 12);
});
// STEP, TOP EMIL, PCKT MT / VLY, CHMF RGT (MCH-K) and the 350's CBOR-TAP, RGH BCB, BK-CBORE, TRANSFER (edited on the control): every typed value reads back
const TPC6 = ['EXTRA-11.MAZ', 'EXTRA-12.MAZ', 'EXTRA-13.MTP', 'EXTRA-14.MTP'].map(f => require('./datapaths.js').CHAT + '/' + f);
if (TPC6.every(f => fs.existsSync(f))) ok('TPC of STEP, TOP EMIL, PCKT MT / VLY, CHMF RGT, CBOR-TAP, RGH BCB, BK-CBORE and TRANSFER', () => {
  const rd = (file, code, ty) => { const p = Maz.parse(new Uint8Array(fs.readFileSync(file)), 'x' + file.slice(-4)), t = Maz.tpcFields(p.recs.find(r => r[0] === code), ty, 'Smooth', 'inch'); return t.unit + ': ' + t.fields.map(f => f.d + '=' + f.text).join(' '); };
  assert.strictEqual(rd(TPC6[0], 0xe7, 'mill'), 'STEP: E1=0.41 E2=0.43 E5=0.45 E7=0.47 E9=0.49 E17=7 E21=0.51 E22=51 E23=52 E24=28 E25=141 E32=8 E33=221 E34=31 E35=222 E36=32 E20=35 E37=0.0345 E16=12 E91=10011111 E98=00000000 E104=00000000');
  assert.strictEqual(rd(TPC6[0], 0xe6, 'mill'), 'TOP EMIL: E7=0.31 E9=0.33 E17=6 E13=5 E97=00010100 E104=00000000');
  assert.ok(/^PCKT MT: E1=0\.21 .* E18=7 E93=00001111 E31=8 E99=00000000 E104=00000000$/.test(rd(TPC6[0], 0xe9, 'mill')) && /^PCKT VLY: E1=0\.11 .* E18=6 E94=00011110 E31=7 E98=00000000 E99=00000000 E104=00000000$/.test(rd(TPC6[0], 0xea, 'mill')));
  assert.strictEqual(rd(TPC6[1], 0xe1, 'mill'), 'CHMF RGT: E2=0.11 E9=0.15 E17=6 E95=11011101 E8=0.13 E11=0.17 E30=0.19');
  assert.ok(/^CBOR-TAP: D1=0\.13 D3=6 D16=7 D17=0\.14 D19=8 D23=0\.9 D41=0\.7 D42=0\.15 D91=11111001 D92=00101111 D22=0\.5 D30=1 D31=5 D32=6 D48=65 D29=9 D49=0\.5 D45=0\.041 D46=0\.043 D43=8 D62=3 TC37=0\.0111/.test(rd(TPC6[2], 0xd7, 'lathe')));
  assert.ok(/^RGH BCB: .* D5=8 D40=3 D45=0\.051 D46=0\.053 D62=5 TC37=/.test(rd(TPC6[2], 0xd2, 'lathe')) && /^BK-CBORE: .* D33=0\.32 D45=0\.34 D46=0\.035 D62=6 TC37=/.test(rd(TPC6[2], 0xd5, 'lathe')));
  assert.strictEqual(rd(TPC6[3], 0xf4, 'lathe'), 'TRANSFER: TC44=0.05 TC57=4.5 TC59=0.0456 TC58=1100 TC104=1.5');
});
// yellow vs white approach point: byte 13 bit 2 = APRCH-X, bit 3 = APRCH-Y calculated by the control
const CA = ['EXTRA-15.MAZ', 'EXTRA-16.MAZ'].map(f => require('./datapaths.js').CHAT + '/' + f);
if (CA.every(f => fs.existsSync(f))) ok('approach point: calculated values are yellow, a typed X is white', () => {
  const st = file => { const p = Maz.parse(new Uint8Array(fs.readFileSync(file)), 'x.MAZ'), ls = Maz.lines(p), out = [];
    ls.forEach((L, i) => { if (L.lay && L.sel.code >= 0xb0 && L.sel.code <= 0xb5) { const k = n => L.lay.cells.findIndex((c, j) => Maz.cellLabel(L.lay, j) === n); if (k('APRCH-X') >= 0) out.push((Maz.autoCell(L, k('APRCH-X')) ? 'X' : 'x') + (Maz.autoCell(L, k('APRCH-Y')) ? 'Y' : 'y')); } });
    return out.join(' '); };
  assert.strictEqual(st(CA[0]), 'XY XY');
  assert.strictEqual(st(CA[1]), 'xY XY');
  // typing a new X into a calculated cell clears its flag, a value equal to the shown one changes nothing
  const p = Maz.parse(new Uint8Array(fs.readFileSync(CA[0])), 'x.MAZ'), ls = Maz.lines(p), i = ls.findIndex(L => L.lay && L.sel.code >= 0xb0 && L.sel.code <= 0xb5 && L.lay.cells.some((c, j) => Maz.cellLabel(L.lay, j) === 'APRCH-X'));
  const L = ls[i], kx = L.lay.cells.findIndex((c, j) => Maz.cellLabel(L.lay, j) === 'APRCH-X'), ky = L.lay.cells.findIndex((c, j) => Maz.cellLabel(L.lay, j) === 'APRCH-Y');
  Maz.enter(L, ky, Maz.cellText(L, ky, { units: 'inch' }).trim()); assert.ok(Maz.autoCell(L, ky), 'same value keeps it calculated');
  Maz.enter(L, kx, '0.25'); assert.ok(!Maz.autoCell(L, kx) && Maz.autoCell(L, ky));
});
// pocket tool line direction: the second cleaning pass values (the control's menu has CW CL2 / CCW CL2)
ok('pocket direction menu has CW CL2 and CCW CL2', () => {
  const spec = Maz.formatSpec('SmoothM', 277);
  assert.strictEqual(spec.values[19], 'CCW CLN'); assert.strictEqual(spec.values[20], 'CW CL2'); assert.strictEqual(spec.values[21], 'CCW CL2');
  const p = Maz.newProgram('SmoothM', 'T'); p.recs.splice(1, 0, ...Maz.newUnit('SmoothM', 0x63, { units: 'inch' })); Maz.renumber(p);
  const ls = Maz.lines(p), i = ls.findIndex(L => L.lay && L.sel.code === 0xb2);
  const L = ls[i], k = L.lay.cells.findIndex(c => c[2] === 277);
  assert.ok(k >= 0, 'the tool line has a format 277 cell');
  for (const [name, v] of [['CW CL2', 20], ['CCW CL2', 21]]) {
    Maz.enter(L, k, name, { units: 'inch' });
    assert.ok(Maz.cellText(L, k, { units: 'inch' }).trim() === name, name + ' reads back as ' + Maz.cellText(L, k, { units: 'inch' }));
  }
});
console.log(n + ' core tests passed' + (process.exitCode ? ' (with failures above)' : ''));
