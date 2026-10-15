// Program checks: things in a program that the control would stop on, each with the alarm number it would show.
// check(p, units, opts) -> [{alarm, rec, unit, text, level: 'alarm' | 'warn'}]
// opts: ls (lines), runs (Paths runs, for priority checks), mts (machine tools, for the tool check), gcodes / mcodes
// (sets of known codes, for EIA text), resolve (SUB PRO names).
(function (root) {
  'use strict';
  const Maz = root.Maz || (typeof require !== 'undefined' ? require('./core.js') : null);
  const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  const u32 = (b, o) => i32(b, o) >>> 0;
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const TOOL_LINE = c => c >= 0xb0 && c <= 0xb5;
  const SHAPE_LINE = c => c === 0xc0 || c === 0xc2 || (c >= 0xa8 && c <= 0xad) || (c >= 0x1b8 && c <= 0x2cf);   // and lathe / mill-turn milling shapes
  // M-codes that may not share a block (alarm 227)
  const M_CLASH_MILL = [[8, 9], [3, 4, 5, 19], [23, 24], [33, 34], [48, 49], [15, 33], [6, 149], [71, 72, 73, 74, 75, 76, 77, 78, 79, 80]];
  // lathes / mill-turn (their M-code lists): spindle, milling spindle, chuck, tailstock, parts catcher and other on / off pairs
  // tool sizes the magazine takes (mm; 50-taper horizontal, our reading of its spec table): diameter with the pockets next
  // to it full / empty, by magazine size (43/60 tools, 80 and over), the longest tool from the taper face, the heaviest
  const MAGAZINE = { full: [125, 135], empty: [250, 260], length: 500, mass: 30 };
  const M_CLASH_TURN = [[8, 9], [3, 4, 5], [203, 204, 205], [303, 304, 305], [206, 207], [306, 307], [31, 32], [33, 34], [48, 49], [200, 202], [300, 302], [231, 232], [248, 249]];

  function check(p, units, opts) {
    opts = opts || {};
    const ls = opts.ls || Maz.lines(p), us = Maz.structure(p, ls), out = [];
    const add = (alarm, rec, text, level) => out.push({ alarm, rec, text, level: level || 'alarm' });
    const tag = u => 'UNo ' + Maz.number(p.recs[u.i]) + ' ' + Maz.unitName(p.ctl, u.code);
    const turn = Maz.CONTROLS[p.ctl].type !== 'mill';
    // 647: a program must end with an END unit
    if (p.recs.length && !us.some(u => u.code === 4)) add(647, Math.max(0, p.recs.length - 1), 'No END unit: the control will not run the program.');
    // tools in the tool data too big for the magazine (once per tool)
    const sized = new Set(), big = (opts.mts || []).reduce((n, m) => Math.max(n, m.pocket || 0), 0) > 60 ? 1 : 0;   // 43 / 60-tool magazine, or 80 and over
    const mm = v => units === 'metric' ? v.toFixed(1) + ' mm' : (v / 25.4).toFixed(3) + ' in';
    function sizeCheck(m, name, ti) {
      if (sized.has(m.tno)) return;
      sized.add(m.tno);
      const len = m.length / 1e6, dia = m.dia / 1e6, who = name + ' (tool data No. ' + m.tno + ')';
      if (len > MAGAZINE.length) out.push({ alarm: 0, rec: ti, text: who + ': LENGTH ' + mm(len) + ' is longer than the magazine takes (' + mm(MAGAZINE.length) + ' from the taper face).', level: 'warn' });
      if (dia > MAGAZINE.empty[big]) out.push({ alarm: 0, rec: ti, text: who + ': ACT-D ' + mm(dia) + ' is wider than the magazine takes (' + mm(MAGAZINE.empty[big]) + ').', level: 'warn' });
      else if (dia > MAGAZINE.full[big]) out.push({ alarm: 0, rec: ti, text: who + ': ACT-D ' + mm(dia) + ' is over ' + mm(MAGAZINE.full[big]) + ': leave the pockets next to it empty.', level: 'warn' });
    }
    for (const u of us) {
      if (Maz.controlOut(ls[u.i])) continue;                    // CONTROL OUT: the control skips it, so nothing in it can stop it
      const seqs = u.seqs.filter(i => ls[i].lay);
      const sc = Maz.shapeCode(p.ctl, u.code);
      const tools = seqs.filter(i => TOOL_LINE(ls[i].sel.code)), shapes = seqs.filter(i => SHAPE_LINE(ls[i].sel.code) || (sc && ls[i].sel.code === sc) || /^\s*FIG/.test(ls[i].lay.head || ''));
      const anyShape = shapes.length || u.seqs.some(i => !ls[i].lay && SHAPE_LINE(ls[i].sel.code));   // shape lines with no screen layout still count
      // 641: a machining unit with no tool line and no shape line at all (JAWSTURNMAIN's UNo 4 BAR stops the control with MISSING INPUT DATA)
      if (u.code >= 0x20 && u.code <= 0x7f && u.code !== 0x7f && !tools.length && !anyShape) add(641, u.i, tag(u) + ': no tool and no shape lines (MISSING INPUT DATA).');
      // 452: a machining unit with tool lines but no shape or hole lines
      if (u.code >= 0x20 && u.code <= 0x7f && tools.length && !anyShape && u.code !== 0x7f) add(452, u.i, tag(u) + ': no shape or hole lines.');
      for (const ti of tools) {
        const L = ls[ti], r = L.rec, cells = L.lay.cells, lab = k => Maz.cellLabel(L.lay, k);
        const get = name => { const k = cells.findIndex((c, j) => lab(j) === name && c[1] === 4); return k < 0 ? null : { k, c: cells[k], v: i32(r, cells[k][0]), on: !cells[k][3] || (u32(r, 4) & cells[k][3]) !== 0 }; };
        const sno = 'SNo ' + Maz.number(r), what = tag(u) + ' ' + sno;
        const nom = get('NOM-D'), fr = get('FR'), csp = get('C-SP');
        // 635: tool diameter zero (milling tools)
        if (!turn && nom && nom.on && nom.v === 0 && r[9] && r[9] < 30) add(635, ti, what + ': NOM-D is 0.');
        // C-SP under 1 on a turning or milling tool: the spindle would hardly turn
        if (csp && csp.on && !(L.rec[9] === 0) && Math.abs(parseFloat(Maz.cellText(L, csp.k, { units }).trim()) || 0) < 1 && (csp.v !== 0 || turn)) add(620, ti, what + ': C-SP is 0 (CUTTING SPEED ZERO).');
        // 621: feed zero when the tool has a speed but no feed
        if (fr && fr.on && fr.v === 0 && csp && csp.on && csp.v > 0) add(621, ti, what + ': FR is 0.');
        // 227: M-codes on one tool line that cannot go together
        const ms = cells.filter((c, j) => lab(j) === 'M' && c[1] === 2 && (!c[3] || (u32(r, 4) & c[3]))).map(c => u16(r, c[0])).filter(v => v);
        for (const g of turn ? M_CLASH_TURN : M_CLASH_MILL) { const hit = ms.filter(m => g.includes(m)); if (hit.length > 1) add(227, ti, what + ': M' + hit.join(' and M') + ' cannot be in one block.'); }
        if (ms.length > 4) add(227, ti, what + ': more than four M-codes.', 'warn');
        // tool data: the machine has no such tool
        if (opts.mts) {
          const pt = (opts.tools || []).find(t => t.lines.includes(ti));
          if (pt) {
            const res = Maz.checkTool(pt, opts.mts), name = pt.name + ' ' + pt.nomText + ' ' + pt.sfx;
            if (res.status === 'ok' && !turn) sizeCheck(res.tools[0], name, ti);
            if (res.status === 'missing') {
              const old = out.find(o => o.tool === name);
              if (old) { if (!old.where.includes(tag(u))) old.where.push(tag(u)); old.text = name + ' is not in the machine\'s tool data (' + old.where.join(', ') + ').'; }
              else out.push({ alarm: 0, rec: ti, tool: name, where: [tag(u)], text: name + ' is not in the machine\'s tool data (' + tag(u) + ').', level: 'warn' });
            }
          }
        }
      }
      if (turn && u.code >= 0x30 && u.code <= 0x37) turnChecks(p, u, ls, units, tag(u), add);
      // 698: two shape points the same in a row
      let prev = null;
      for (const si of shapes) {
        const L = ls[si];
        if (L.sel.code !== 0xc2) { prev = null; continue; }
        const x = i32(L.rec, 40), y = i32(L.rec, 44);
        if (prev && prev[0] === x && prev[1] === y && L.rec[8] >= 0x20 && L.rec[8] <= 0x22) add(698, si, tag(u) + ' FIG ' + Maz.number(L.rec) + ': the same point as the line before.', 'warn');
        prev = [x, y];
      }
      // 405: a SUB PRO unit's program is not here (warning only: it may be on the machine)
      if (u.code === 5 && opts.resolve) {
        const name = String.fromCharCode(...p.recs[u.i].slice(36, 68)).replace(/\0[\s\S]*$/, '').trim();
        if (name && !opts.resolve(name)) add(405, u.i, tag(u) + ' ' + name + ': not open here (make sure it is on the machine).', 'warn');
      }
    }
    // 461 / 462: priority numbers (from the run order)
    if (opts.runs) {
      const rows = opts.runs, toolKey = r => { const t = r.p.recs[r.line]; return t[9] + ':' + i32(t, 36) + ':' + t[10]; };
      const seen = new Set();
      for (const r of rows) {
        if (!r.pri || r.p !== p) continue;
        const clash = rows.find(o => o !== r && o.proc === r.proc && o.pri && o.pri.n === r.pri.n && toolKey(o) !== toolKey(r));
        const k = r.pri.n + ':' + r.proc;
        if (clash && !seen.has(k)) { seen.add(k); add(461, r.line, 'No. ' + r.pri.n + ' is on two different tools in one process.'); }
        const back = rows.find(o => o.k > r.k && o.p === r.p && o.unit === r.unit && o.line < r.line && o.p === p);
        if (back) add(462, r.line, 'This tool line runs before an earlier line of its own unit.');
      }
    }
    return out;
  }
  // Turning units (turning manual 7-6, the alarm list): what the control would stop on, or what is likely a slip
  function turnChecks(p, u, ls, units, tagU, add) {
    const U = ls[u.i], val = (L, name) => { if (!L.lay) return ''; const k = L.lay.cells.findIndex((c, j) => Maz.cellLabel(L.lay, j) === name); return k < 0 || Maz.locked(L, k) ? '' : Maz.cellText(L, k, { units }).trim(); };
    const num = (L, name) => { const v = parseFloat(val(L, name).replace(/^[A-Za-z]/, '')); return isFinite(v) ? v : null; };
    const part = val(U, 'PART').replace('*', ''), code = u.code;
    const tools = u.seqs.filter(i => ls[i].lay && ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5);
    const shapes = u.seqs.filter(i => ls[i].lay && ls[i].sel.code >= 0xa8 && ls[i].sel.code <= 0xad);
    const common = ls.find(L => L.lay && L.sel.unit && L.rec[0] === 1) || ls[0];
    const od = num(common, 'OD-MAX'), id = num(common, 'ID-MIN'), len = num(common, 'LENGTH');
    // the manual's usual tools by PART (a * on the tool only marks the other turret / spindle)
    const sideOK = { OUT: ['OUT'], IN: ['IN'], FCE: ['EDGE', 'EDG', 'OUT'], BAK: ['EDGE', 'EDG', 'OUT'] };
    for (const ti of tools) {
      const L = ls[ti], sno = 'SNo ' + Maz.number(L.rec), cells = L.lay.cells.map((c, k) => [Maz.cellLabel(L.lay, k), k]);
      const tool = cells.filter(([l]) => l === 'TOOL').map(([, k]) => Maz.cellText(L, k, { units }).trim());
      const rough = val(L, 'SNo') === 'R';
      // 746: a roughing tool of BAR, CPY, CORNER, FACING needs DEP-1
      if (rough && code >= 0x30 && code <= 0x33 && !(num(L, 'DEP-1') > 0)) add(746, ti, tagU + ' ' + sno + ': no DEP-1 (NO DEPTH OF CUT INFO).');
      // the side the tool cuts against PART (the manual's usual tools)
      if (tool[1] && (part === 'OUT' || part === 'IN') && code !== 0x36 && code !== 0x37 && !sideOK[part].includes(tool[1].replace(/[\s*]/g, ''))) add(0, ti, tagU + ' ' + sno + ': a ' + tool[1].trim() + ' tool on a ' + part + ' unit — check the side it cuts.', 'warn');
      // threading: at least three passes
      if (code === 0x34) { const n = num(L, 'DEP-2/NUM'); if (n !== null && n > 0 && n < 3) add(0, ti, tagU + ' ' + sno + ': ' + n + ' threading passes; the control wants at least 3.', 'warn'); }
      // T.DRILL: the drill against DIA
      if (code === 0x36 && num(U, 'DIA') === 0) add(635, u.i, tagU + ': DIA is 0.');
      // BAR #2 inside: not for a bore that gets bigger deeper in (alarm 719)
      if (code === 0x30 && part === 'IN' && (L.rec[15] & 0x7f) === 2) {
        let prev = null, grows = false;
        for (const si of shapes) { const x = num(ls[si], 'FPT-X'); if (x !== null) { if (prev !== null && x > prev + 1e-9) grows = true; prev = x; } }
        if (grows) add(719, ti, tagU + ' ' + sno + ': PAT. #2 inside on a bore that widens with depth (REVERSE SHAPE CONTOUR).');
      }
    }
    if (code === 0x34) {
      const hgt = num(U, 'HGT'), ang = num(U, 'ANG'), lead = num(U, 'LEAD');
      if (!(hgt > 0)) add(742, u.i, tagU + ': HGT is 0 (ILLEGAL THREAD HEIGHT).');
      if (ang !== null && (ang < 0 || ang >= 90)) add(741, u.i, tagU + ': ANG ' + ang + ' (ILLEGAL THREAD ANGLE).');
      if (!(lead > 0)) add(0, u.i, tagU + ': LEAD is 0.', 'warn');
    }
    // the shape against the stock in the common unit (alarm 717), and the infeed point outside the shape
    if (shapes.length && od) {
      const xs = [], zs = [];
      for (const si of shapes) for (const n of ['SPT-X', 'FPT-X', 'SPT-x', 'FPT-x']) { const v = num(ls[si], n); if (v !== null) xs.push(v); }
      for (const si of shapes) for (const n of ['SPT-Z', 'FPT-Z', 'SPT-z', 'FPT-z']) { const v = num(ls[si], n); if (v !== null) zs.push(v); }
      // a groove opens at SPT-X, often a little above the stock (a part-off from just outside the bar runs): only its
      // bottom has to be inside the stock
      const reach = code === 0x35 ? Math.min(...xs) : Math.max(...xs);
      if (code !== 0x33 && code !== 0x36 && xs.length && reach > od + 1e-6) add(717, shapes[0], tagU + ': the ' + (code === 0x35 ? 'groove bottom is at' : 'shape reaches') + ' X' + reach + ', past OD-MAX ' + od + ' (SHAPE EXCEEDS MATERIAL SIZE).');
      if (code !== 0x33 && code !== 0x36 && xs.length && id > 0 && Math.min(...xs) < id - 1e-6 && part !== 'FCE' && part !== 'BAK') add(717, shapes[0], tagU + ': the shape reaches X' + Math.min(...xs) + ', inside ID-MIN ' + id + '.', 'warn');
      void zs; void len;
      const cpt = num(U, 'CPT-X');
      if (code === 0x30 && cpt !== null && xs.length && ((part === 'OUT' && cpt < Math.max(...xs) - 1e-6) || (part === 'IN' && cpt > Math.min(...xs) + 1e-6))) add(0, u.i, tagU + ': the infeed point CPT-X ' + cpt + ' is inside the finished shape.', 'warn');
    }
  }
  // EIA text: G-codes and M-codes the control does not know (808 MIS-SET G CODE / 661 ILLEGAL M CODE)
  function checkEia(text, opts) {
    const out = [], g = opts.gcodes, m = opts.mcodes, lines = String(text).split(/\r?\n|\r/);
    let hsm = false;
    const NOT_HSM = new Set([28, 30, 53, 53.1, 54.2, 65, 68, 92, 270, 271, 272, 276, 283, 284, 285, 287, 288, 289, 290, 292, 294, 71.1, 72.1, 73, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89]);
    lines.forEach((l, i) => {
      const s = l.replace(/\([^)]*\)/g, '').replace(/;.*$/, '');
      // high-speed machining mode (G05 P2): some commands may not be given in it (machine maker's post data)
      if (opts.millturn !== false) {
        const gs = [...s.matchAll(/(^|[^A-Z#])G\s*(\d+(?:\.\d)?)/gi)].map(m => parseFloat(m[2]));
        if (gs.includes(5)) { const pm = /P\s*(\d+)/i.exec(s); if (pm) hsm = +pm[1] === 2; }
        else if (hsm) { const bad = gs.find(g => NOT_HSM.has(g)); if (bad !== undefined) out.push({ alarm: 0, line: i, text: 'Line ' + (i + 1) + ': G' + bad + ' is not allowed in high-speed machining mode (G05 P2); end it with G05 P0 first.', level: 'warn' }); }
      }
      for (const w of s.matchAll(/(^|[^A-Z#])([GM])\s*(\d+(?:\.\d)?)/gi)) {
        const code = w[2].toUpperCase() + String(parseFloat(w[3])).replace(/^(\d)$/, '0$1').replace(/^(\d)\./, '0$1.');
        if (w[2].toUpperCase() === 'G' && g && !g.has(code)) out.push({ alarm: 808, line: i, text: 'Line ' + (i + 1) + ': ' + code + ' is not a G-code of this control.', level: 'alarm' });
        if (w[2].toUpperCase() === 'M' && m && !m.has(code) && parseFloat(w[3]) < 200) out.push({ alarm: 661, line: i, text: 'Line ' + (i + 1) + ': ' + code + ' is not in this machine\'s M-code list.', level: 'warn' });
      }
    });
    // macro statements (EIA programming manual, user macros): brackets, functions, GOTO targets, WHILE / END pairs,
    // and calls to programs that are neither in this file nor open
    const FUNCS = new Set(['SIN', 'COS', 'TAN', 'ATAN', 'ATN', 'ACOS', 'ASIN', 'SQRT', 'SQR', 'ABS', 'BIN', 'BCD', 'ROUND', 'RND', 'FIX', 'FUP', 'LN', 'EXP', 'IF', 'WHILE', 'POPEN', 'PCLOS', 'DPRNT', 'BPRNT']);
    const seqs = new Set(), progs = new Set(), loops = [], missing = new Map();
    lines.forEach(l => { const m = /^\s*N\s*(\d+)/i.exec(l); if (m) seqs.add(+m[1]); const o = /^\s*O\s*(\d+)/i.exec(l); if (o) progs.add(+o[1]); });
    lines.forEach((l, i) => {
      const s = l.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').toUpperCase();
      if (!/[#\[]|GOTO|WHILE|END|DO|G65|M98/.test(s)) return;
      const at = 'Line ' + (i + 1) + ': ';
      let depth = 0, bad = false;
      for (const ch of s) { if (ch === '[') depth++; else if (ch === ']') { depth--; if (depth < 0) bad = true; } }
      if (depth !== 0 || bad) out.push({ alarm: 0, line: i, text: at + 'the [ ] brackets do not pair up.', level: 'alarm' });
      for (const m of s.matchAll(/([A-Z]{2,})\s*\[/g)) if (!FUNCS.has(m[1].replace(/^(EQ|NE|GT|LT|GE|LE|AND|OR|XOR|MOD)/, '')) && !/^(EQ|NE|GT|LT|GE|LE|AND|OR|XOR|MOD|GOTO|THEN|DO)$/.test(m[1]))
        out.push({ alarm: 0, line: i, text: at + m[1] + '[ ] is not a macro function of the control (SIN, COS, TAN, ATAN, ACOS, SQRT, ABS, ROUND, FIX, FUP, LN, EXP, BIN, BCD …).', level: 'warn' });
      const g = /GOTO\s*(\d+)\b/.exec(s);
      if (g && !seqs.has(+g[1])) out.push({ alarm: 0, line: i, text: at + 'GOTO ' + g[1] + ': there is no N' + g[1] + ' in this program.', level: 'warn' });
      const w = /WHILE\s*\[.*\]\s*DO\s*(\d+)/.exec(s) || /^\s*(?:N\d+\s*)?DO\s*(\d+)/.exec(s);   // WHILE […] DO m, or a bare DO m (loops for ever)
      if (w) loops.push([+w[1], i]);
      const e = /(^|[^A-Z])END\s*(\d+)/.exec(s);
      if (e) { const k = loops.map(x => x[0]).lastIndexOf(+e[2]); if (k < 0) out.push({ alarm: 0, line: i, text: at + 'END ' + e[2] + ' with no WHILE … DO ' + e[2] + ' before it.', level: 'warn' }); else loops.splice(k, 1); }
      const call = /(G\s*65|M\s*98)[^P]*P\s*(\d+)/.exec(s);
      if (call) {
        let n = +call[2];
        if (/M/.test(call[1]) && !/[LK]/.test(s) && n > 9999) n %= 10000;
        if (!progs.has(n) && !(opts.resolve && (opts.resolve(String(n)) || opts.resolve('O' + n) || opts.resolve(String(n).padStart(4, '0')) || opts.resolve('O' + String(n).padStart(4, '0')))))
          missing.has(n) || missing.set(n, i);
      }
    });
    if (missing.size) out.push({ alarm: 0, line: missing.values().next().value, text: 'Calls programs not in this file or open here: ' + [...missing.keys()].slice(0, 12).join(', ') + (missing.size > 12 ? ' …' : '') + ' (make sure they are on the machine).', level: 'warn' });
    for (const [id, i] of loops) out.push({ alarm: 0, line: i, text: 'Line ' + (i + 1) + ': WHILE … DO ' + id + ' has no END ' + id + '.', level: 'warn' });
    return out;
  }
  const api = { check, checkEia };
  root.MazCheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
