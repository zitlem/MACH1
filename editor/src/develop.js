// Automatic tool development for point units (DRILLING, RGH CBOR, REAMING, TAPPING), following the machining-center
// programming manual's rules (7-6-3): which tools a unit gets from its own data, decided by the machine's user
// parameters (D2 spot tool, D4 spot-chamfer limit, D6/D7 drilling cycle by depth / diameter, D8-D10 drills by
// diameter, D11 through overshoot, D12 stop-hole clearance, D13 spot hole size, D14/D15 peck depth).
// The parameters are the machine's; defaults below are fitted to this shop's programs (inch) and can be changed.
// develop(p, unitIndex, units, params) -> [records] the unit's new tool lines, or throws with the reason (alarm 416).
(function (root) {
  'use strict';
  const Maz = root.Maz || (typeof require !== 'undefined' ? require('./core.js') : null);
  const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  // inch defaults (mm values = ×25.4 where lengths)
  const DEFAULTS = { D2: 0.5, D4: 0.1, D6: 3, D7: 6, D8: 1.25, D9: 2, D10: 3, D11: 0.1, D12: 0.04, D13: 0.3, D14: 0.7, D15: 0.5,
    tapDrill: 1, reamStock: 0.015, cbStock: 0, chamfer: 1.15 };
  const NAMES = {
    D2: 'Spot drill nominal diameter', D4: 'Spot-chamfer limit (hole up to D2 − D4 is chamfered by the spot drill)',
    D6: 'Depth / diameter up to which: plain drilling', D7: 'Depth / diameter up to which: high-speed peck (PCK1); above: deep peck (PCK2)',
    D8: 'Largest hole for one drill', D9: 'Largest hole for two drills', D10: 'Largest hole for three drills (above: alarm 416)',
    D11: 'Through-hole overshoot', D12: 'Stop-hole bottom clearance', D13: 'Spot hole size when not chamfering',
    D14: 'Peck depth / hole diameter, aluminium', D15: 'Peck depth / hole diameter, other materials', chamfer: 'Chamfer cutter nominal diameter',
    reamStock: 'Reamer stock (pre-drill = DIA − this)',
  };

  function develop(p, ui, units, params) {
    const P = Object.assign({}, DEFAULTS, params || {}), inch = units !== 'metric', k = inch ? 1 : 25.4, S = inch ? 1e-5 : 1e-4;
    const ls = Maz.lines(p), us = Maz.structure(p, ls), u = us[ui], r0 = p.recs[u.i], code = u.code;
    const L = o => i32(r0, o) * S, mat = (Maz.lines(p)[0] && Maz.cellText(Maz.lines(p)[0], 0, { units }) || '').trim();
    const alu = /^AL/i.test(mat);
    const tools = [];                                       // [type text, {label: value}]
    const fix = v => String(+v.toFixed(inch ? 4 : 3));
    const spot = (hole, ch) => {                            // centre drill: chamfers the hole edge when it can
      const edge = hole + 2 * ch, spotCh = ch > 0 && edge <= (P.D2 - P.D4) * k;
      tools.push(['CTR-DR', { 'NOM-D': fix(P.D2 * k), 'HOLE-D': fix(spotCh ? hole : P.D13 * k), RGH: '90°' }]);
      return spotCh;
    };
    const drills = (dia, depth, through) => {
      if (dia <= 0) throw new Error('416 AUTO PROCESS IMPOSSIBLE: DIA is 0');
      if (dia > P.D10 * k) throw new Error('416 AUTO PROCESS IMPOSSIBLE: DIA is over D10 (' + fix(P.D10 * k) + ')');
      const n = dia <= P.D8 * k ? 1 : dia <= P.D9 * k ? 2 : 3;
      const ratio = depth / dia, cyc = ratio <= P.D6 ? 'DRL T' : ratio <= P.D7 ? 'PCK1' : 'PCK2';
      const dep = depth + (through ? P.D11 * k : 0);
      for (let j = 1; j <= n; j++) {
        const d = dia * j / n, q = d * (alu ? P.D14 : P.D15);
        tools.push(['DRILL', { 'NOM-D': fix(d), 'HOLE-D': fix(d), 'HOLE-DEP': fix(dep), RGH: cyc, DEPTH: fix(q) }]);
      }
    };
    const chamfer = (hole, ch, depth) => { if (ch > 0) tools.push(['CHMF-M', { 'NOM-D': fix(P.chamfer * k), 'HOLE-D': '99.9', 'PRE-DIA': fix(hole), 'PRE-DEP': fix(depth), DEPTH: fix(ch) }]); };
    if (code === 0x20) {                                    // DRILLING: DIA DEPTH CHMF
      const dia = L(36), depth = L(40), ch = L(44);
      if (depth < ch) throw new Error('416 AUTO PROCESS IMPOSSIBLE: DEPTH is less than CHMF');
      const spotCh = spot(dia, ch);
      drills(dia, depth, false);
      if (!spotCh) chamfer(dia, ch, depth);
    } else if (code === 0x21) {                             // RGH CBOR: CB-DIA CB-DEP CHMF … DIA DEPTH
      const cb = L(56), cbDep = L(60), ch = L(44), dia = L(36), depth = L(40);
      if (cb < dia) throw new Error('416 AUTO PROCESS IMPOSSIBLE: CB-DIA is less than DIA');
      if (depth < cbDep) throw new Error('416 AUTO PROCESS IMPOSSIBLE: DEPTH is less than CB-DEP');
      spot(dia, 0);
      drills(dia, depth, false);
      tools.push(['E-MILL', { 'NOM-D': fix(Math.min(cb, dia * 1.5)), 'HOLE-D': fix(cb), 'HOLE-DEP': fix(cbDep), 'PRE-DIA': fix(dia) }]);
      chamfer(cb, ch, cbDep);
    } else if (code === 0x23) {                             // REAMING: DIA DEPTH CHAMFER
      const dia = L(36), depth = L(40), ch = L(44), pre = dia - P.reamStock * k;
      const spotCh = spot(pre, ch);
      drills(pre, depth, false);
      tools.push(['REAMER', { 'NOM-D': fix(dia), 'HOLE-D': fix(dia), 'HOLE-DEP': fix(depth) }]);
      if (!spotCh) chamfer(dia, ch, depth);
    } else if (code === 0x24) {                             // TAPPING: NOM MAJOR PITCH TAP-DEPTH CHMF
      const major = L(40), pitch = L(44), depth = L(48), ch = L(52);
      if (major <= 0 || pitch <= 0) throw new Error('416 AUTO PROCESS IMPOSSIBLE: MAJOR-φ and PITCH are needed');
      const tapDrill = major - pitch * P.tapDrill;          // ≈ the usual tap drill (major − pitch)
      const spotCh = spot(major, ch);
      drills(tapDrill, depth + 3 * pitch, false);
      const u0 = ls[u.i], nk = u0.lay.cells.findIndex((c, q) => Maz.cellLabel(u0.lay, q) === 'NOM'), nom = nk >= 0 ? Maz.cellText(u0, nk, { units }).trim() : '';
      tools.push([/^M/i.test(nom) || !inch ? 'TAP-MT' : 'TAP-UN', { 'NOM-D': nom, 'HOLE-D': fix(major), 'HOLE-DEP': fix(depth) }]);
      if (!spotCh) chamfer(major, ch, depth);
    } else if (Maz.CONTROLS[p.ctl].type !== 'mill' && code >= 0x30 && code <= 0x37) {
      turnTools(p, u, ls, units, inch, fix, tools);
    } else throw new Error('Automatic tool development is for DRILLING, RGH CBOR, REAMING and TAPPING units, and on lathes BAR, CPY, CORNER, FACING, THREAD, T.GROOVE, T.DRILL and T.TAP');
    // the records, filled field by field as typed
    const turnLine = Maz.CONTROLS[p.ctl].type !== 'mill' && code >= 0x30 && code <= 0x37;
    const recs = [], tmpl = Maz.newRecord(turnLine ? 0xb4 : 0xb0, 0);
    const trial = { ctl: p.ctl, name: p.name, header: p.header, warnings: [], recs: p.recs.slice(0, u.i + 1).concat(tools.map(() => tmpl.slice()), [Maz.newRecord(4, 0)]) };
    Maz.renumber(trial);
    const tl = Maz.lines(trial);
    tools.forEach(([type, vals], j) => {
      const i = u.i + 1 + j, rec = trial.recs[i];
      const Lr = () => Object.assign({}, Maz.lines(trial)[i], { rec });
      // a label, or label@offset for a field that shares its label (a turning tool's name and the side it cuts)
      const set = (label, v) => {
        const L1 = Lr(), [lab, off] = label.split('@');
        const c = L1.lay.cells.findIndex((x, q) => Maz.cellLabel(L1.lay, q) === lab && (off ? x[0] === +off : (lab !== 'NOM-D' || x[1] === 4)));
        if (c >= 0 && !Maz.locked(L1, c)) Maz.enter(L1, c, v, { units });
      };
      if (vals['SNo']) { set('SNo', vals['SNo']); }
      set(vals['TOOL@9'] ? 'TOOL@9' : 'TOOL', vals['TOOL@9'] || type);
      for (const [lab, v] of Object.entries(vals)) { if (lab === 'SNo' || lab === 'TOOL@9') continue; try { set(lab, v); } catch (e) { /* a field this tool does not use */ } }
      recs.push(rec);
    });
    void tl;
    return recs;
  }
  // Turning units (turning manual 7-6): up to two tools, R roughing and F finishing (only F when the finishing
  // allowance is 0); the side the tool cuts follows PART (OUT, IN; FACE: EDGE; BACK: the back-edge tool). THREAD one
  // threading tool; T.GROOVE #0 one F tool, #1-#3 R and F; T.DRILL a drill of DIA; T.TAP a tap of NOM-DIA.
  // Speeds, feeds and DEP-1 come from the control's cutting conditions (its tool material menu): left to set.
  function turnTools(p, u, ls, units, inch, fix, tools) {
    const r0 = p.recs[u.i], code = u.code, U = ls[u.i], S = inch ? 1e-5 : 1e-4;
    const txt = name => { const k = U.lay.cells.findIndex((c, j) => Maz.cellLabel(U.lay, j) === name); return k < 0 ? '' : Maz.cellText(U, k, { units }).trim(); };
    const num = name => parseFloat(txt(name)) || 0;
    const part = txt('PART').replace('*', ''), side = { OUT: 'OUT', IN: 'IN', FCE: 'EDGE', FACE: 'EDGE', BAK: '*EDG', BACK: '*EDG' }[part] || 'OUT';
    const two = (name, finAllow) => { if (finAllow > 0) tools.push(['GNL', { SNo: 'R', 'TOOL@9': name, 'TOOL@10': side }]); tools.push(['GNL', { SNo: 'F', 'TOOL@9': name, 'TOOL@10': side }]); };
    if (code === 0x30 || code === 0x31 || code === 0x32) two('GNL', num('FIN-X') + num('FIN-Z'));
    else if (code === 0x33) two('GNL', num('FIN-Z'));
    else if (code === 0x34) tools.push(['THR', { SNo: 'F', 'TOOL@9': 'THR', 'TOOL@10': side }]);
    else if (code === 0x35) { const pat = parseInt(txt('PAT')) || 0; if (pat >= 1 && pat <= 3) tools.push(['GRV', { SNo: 'R', 'TOOL@9': 'GRV', 'TOOL@10': side }]); tools.push(['GRV', { SNo: 'F', 'TOOL@9': 'GRV', 'TOOL@10': side }]); }
    else if (code === 0x36) tools.push(['DRL', { SNo: 'R', 'TOOL@9': 'DRL', 'NOM.': fix(num('DIA')) }]);
    else if (code === 0x37) tools.push(['TAP', { SNo: 'F', 'TOOL@9': 'TAP', 'NOM.': txt('NOM-DIA') }]);
    void r0; void S;
  }
  const api = { develop, DEFAULTS, NAMES };
  root.MazDevelop = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
