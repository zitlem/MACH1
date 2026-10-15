// Mazatrol Editor UI: the program screen in MazEdit's column layout, field entry with prompts and
// soft keys, unit/line editing with undo, save in place, Matrix <-> Smooth conversion, print listing
// and a plot of the programmed geometry. Program logic lives in core.js (Maz) and plot.js (Plot).
(function () {
  'use strict';
  Maz.useSchema(SCHEMA);

  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const UNDO_MAX = 150;

  const el = {
    screen: $('#screen'), lines: $('#lines'), empty: $('#empty'), tabs: $('#tabs'), input: $('#input'),
    prompt: $('#prompt'), where: $('#where'), msg: $('#msg'), keys: $('#keys'), inKeys: $('#inKeys'), info: $('#info'),
    side: $('#side'), plot: $('#plot'), plotInfo: $('#plotInfo'), unitDrop: $('#unitDrop'), fileInput: $('#fileInput'),
    printArea: $('#printArea'), newDrop: $('#newDrop'), saveasDrop: $('#saveasDrop'),
    toolsSide: $('#toolsSide'), toolsList: $('#toolsList'), toolSrc: $('#toolSrc'), toolsInfo: $('#toolsInfo'),
    cmpSide: $('#cmpSide'), cmpList: $('#cmpList'), cmpWith: $('#cmpWith'), cmpInfo: $('#cmpInfo'),
    folderSide: $('#folderSide'), folderList: $('#folderList'), folderSearch: $('#folderSearch'), folderInfo: $('#folderInfo'),
    folderName: $('#folderName'), dirInput: $('#dirInput'), gtext: $('#gtext'),
  };

  const docs = [];
  let docIds = 0;
  let cur = -1, clip = null, plotOn = store.get('mazed-plot', false), showTpc = store.get('mazed-tpc', false), newCount = 0;
  let toolsOn = !plotOn && store.get('mazed-tools', false), cmpOn = false, folderOn = false, folder = null;
  const doc = () => docs[cur] || null;
  // a program's control, or for a tool-data document its layout's family and machine type
  const C = d => d.t ? toolLabel(d) : d.g ? eiaLabel(d) : Maz.CONTROLS[d.p.ctl];
  const isTool = d => !!(d && d.t);
  const isEia = d => !!(d && d.g);                       // an EIA/ISO (G-code) program, edited as text
  const isProg = d => !!(d && !d.t && !d.g);             // a Mazatrol program
  const eiaLabel = d => ({ label: 'EIA/ISO ' + TOOL_TYPE_LABEL[d.g.type] + ' program', ext: Maz.extOf(d.p.name) || 'EIA', type: d.g.type });
  const TOOL_TYPE_LABEL = { mill: 'mill', lathe: 'lathe', millturn: 'mill-turn' };
  function toolLabel(d) {
    const t = d.t, ext = (t.name.match(/\.([^.]+)$/) || [, t.family === 'Smooth' ? 'DBM' : 'DBD'])[1].toUpperCase();
    if (t.memory) return { label: t.family + ' ' + TOOL_TYPE_LABEL[t.type] + ' machine memory, tool data', ext: 'DBM', type: t.type };
    return { label: t.family + ' ' + TOOL_TYPE_LABEL[t.type] + (t.tool === 'TOOLDATA' ? ' tool data' : ' tool file'), ext, type: t.type };
  }
  // a machine's control memory (Smooth CAM Ai "m8ysram"): its tool data is shown, never changed
  const readOnly = d => !!(d && d.t && d.t.memory);
  // the alarm list for a machine type: the control's, with the model's own machine alarms over it
  const alarmsFor = t => {
    const base = window.MazAlarms || [], over = (window.MazAlarmsBy || {})[t];
    if (!over) return base;
    const m = new Map(base.map(a => [a[0], a]));
    for (const a of over) m.set(a[0], a.concat(['own']));
    return [...m.values()].sort((a, b) => a[0] - b[0]);
  };
  // 'mill', 'lathe' or 'millturn': picks the G- and M-code lists
  const mtype = d => (!d ? 'mill' : d.g ? d.g.type || 'mill' : d.p && Maz.CONTROLS[d.p.ctl] ? Maz.CONTROLS[d.p.ctl].type : 'mill');
  const READ_ONLY = 'This is a machine\'s control memory from Smooth CAM Ai; the editor shows its tool data and does not change it.';
  // files open view-only; the Edit button (Ctrl+E) allows changes until it is turned off again
  let editing = false;
  const VIEW_ONLY = 'View only. Turn on Edit (Ctrl+E) to change the program.';
  const locked = d => { if (editing || !d) return false; note(VIEW_ONLY); return true; };
  function setEditing(on) {
    editing = !!on;
    skMenu = editing ? 'edit' : 'main'; skPage = 0; skStack = [];
    render();
    note(editing ? 'Editing is on: changes go into the program (Undo takes them back).' : 'View only: nothing can be changed until Edit is turned on.', true);
  }

  // ------------------------------------------------------------------ documents
  function makeDoc(p, handle) {
    const d = { id: ++docIds, rev: 0, p, handle: handle || null, dirty: false, undo: [], redo: [], units: store.get('mazed-units', 'inch'), sel: { r: 0, c: -1, a: null }, view: null, ls: null };
    d.sel.c = firstCell(d, 0);
    return d;
  }
  // Tool data (TOOLDATA / TOOLFILE): d.t is the file (core parseToolFile); d.p stands in for the program the
  // rest of the screen code reads (its recs are the displayed lines' records).
  function makeToolDoc(t, handle) {
    const d = { id: ++docIds, rev: 0, t, p: { ctl: t.ctl, name: t.name, recs: [], warnings: t.warnings }, handle: handle || null, dirty: false, undo: [], redo: [],
      units: store.get('mazed-units', 'inch'), sel: { r: 0, c: -1, a: null }, view: null, ls: null };
    d.sel.c = firstCell(d, 0);
    return d;
  }
  // the records in context (layout block, parent unit), recomputed after every change
  function ctx(d) {
    if (d.ls) return d.ls;
    if (d.g) return (d.ls = []);
    if (d.t) {
      d.ls = Maz.toolLines(d.t);
      d.p.ctl = d.t.ctl;
      d.p.recs = d.ls.map(L => L.rec);
      return d.ls;
    }
    return (d.ls = Maz.lines(d.p));
  }
  function addDoc(d) {
    docs.push(d); cur = docs.length - 1;
    const w = d.t ? d.t.warnings.slice() : d.g ? [] : d.p.warnings.concat(Maz.limits(d.p));
    render();
    if (w.length) note(w.join(' '));
  }
  function snapshot(d) {
    if (d.g) return { gtext: d.g.text, sel: d.g.sel.slice() };
    if (d.t) return { trecs: d.t.recs.map(r => r.slice()), type: d.t.type, sel: Object.assign({}, d.sel) };
    return { ctl: d.p.ctl, name: d.p.name, header: d.p.header.slice(), recs: d.p.recs.map(r => r.slice()), sel: Object.assign({}, d.sel) };
  }
  function restore(d, s) {
    if (d.g) { d.g.text = s.gtext; d.g.sel = s.sel; d.g.lastInput = 0; d.g.curLine = lineAt(d, s.sel[0]); eiaVer++; return; }
    if (d.t) {
      if (s.type !== d.t.type) Maz.setToolType(d.t, s.type);
      d.t.recs = s.trecs; d.sel = s.sel; d.ls = null;
      return;
    }
    d.p.ctl = s.ctl; d.p.name = s.name; d.p.header = s.header; d.p.recs = s.recs; d.sel = s.sel; d.ls = null;
  }
  // Run a change with an undo point; the change may throw (nothing is kept then). d: the document (default: the
  // current one; the run order view also changes the programs a SUB PRO unit calls, in their own tabs).
  function edit(fn, d) {
    d = d || doc();
    if (!d) return false;
    const snap = snapshot(d);
    try { fn(d); } catch (e) { restore(d, snap); throw e; }
    d.ls = null;
    d.rev++;
    d.undo.push(snap);
    if (d.undo.length > UNDO_MAX) d.undo.shift();
    d.redo = [];
    d.dirty = true;
    render();
    return true;
  }
  function undo(redo) {
    const d = doc();
    if (!d || locked(d)) return;
    const from = redo ? d.redo : d.undo, to = redo ? d.undo : d.redo;
    if (!from.length) return note(redo ? 'Nothing to redo' : 'Nothing to undo');
    to.push(snapshot(d));
    restore(d, from.pop());
    d.rev++;
    d.dirty = true;
    render();
  }

  // ------------------------------------------------------------------ screen lines
  const unitName = (ctl, c) => Maz.unitName(ctl, c);
  const isFigHead = lay => /^FIG/.test(lay.head);
  const isTpc = L => L.sel.tpc || (!L.lay && L.sel.code >= 0xd0 && L.sel.code <= 0xff);
  function kindClass(ctl, cell, text, L, o) {
    if (text === '<>') return 'k-na';
    if (L && Maz.autoCell(L, o)) return 'k-addr';        // calculated by the control: yellow
    if (/^\*[A-Za-z]/.test(text.trim()) && (cell[2] === 0xe9 || Maz.formatSpec(ctl, cell[2]).kind === 'enum')) return 'k-star';      // the second variant of a menu value (*OUT, *IN, *FCE, *BAK, *CCW): a magenta box on the control
    if (text === '?') return 'k-addr';        // left for the control to work out (AUTO SET): yellow on the control
    const fmt = cell[2];
    if (fmt === 0xf8 || fmt === 0xfa || fmt === 0x109) return 'k-addr';
    const spec = Maz.formatSpec(ctl, fmt);
    if (fmt === 0x117 || fmt === 0x110) return 'k-name';
    if (spec && spec.kind === 'enum') return 'k-name';
    if (spec && spec.kind === 'text') return 'k-text';
    return /\d/.test(text) || !text.trim() ? 'k-num' : 'k-name';     // words such as TAP, CTR-D, *CCW
  }

  // One record as a character line (Maz.printLine) plus a colour class per column.
  function recLine(d, r, print) {
    const L = ctx(d)[r], lay = L.lay;
    const P = Maz.printLine(L, { units: d.units, screen: !print, regions: !print });
    P.cls = P.ch.map((ch, x) => {
      const o = P.own[x];
      if (o >= 0) return lay ? kindClass(d.p.ctl, lay.cells[o], P.texts[o], L, o) : '';
      if (ch === ' ') return '';
      return lay && L.sel.unit && x >= 5 ? 'k-name' : lay ? 'k-no' : 'k-na';
    });
    if (L.sel.inferred && !print) {
      const t = ' (inferred)';
      let end = P.ch.length;
      while (end > 0 && P.ch[end - 1] === ' ') end--;
      for (let i = 0; i < t.length && end + 1 + i < P.ch.length; i++) { P.ch[end + 1 + i] = t[i]; P.cls[end + 1 + i] = 'k-inf'; }
    }
    return P;
  }
  function lineHTML(P, selCell) {
    let end = P.ch.length;
    while (end > 0 && P.ch[end - 1] === ' ' && P.own[end - 1] < 0) end--;
    let html = '', x = 0;
    while (x < end) {
      const o = P.own[x], k = P.cls[x];
      let y = x + 1;
      while (y < end && P.own[y] === o && (P.cls[y] === k || P.ch[y] === ' ')) y++;
      const text = esc(P.ch.slice(x, y).join(''));
      if (o >= 0) html += `<span class="c ${k || 'k-num'}${o === selCell ? ' sel' : ''}" data-c="${o}">${text}</span>`;
      else html += k ? `<span class="${k}">${text}</span>` : text;
      x = y;
    }
    return html || ' ';
  }

  // Display rows: title, then per unit a header + line, and a header before each run of same-kind lines.
  // TPC setting records are hidden unless asked for (MazEdit prints them only with TPCshow).
  function rows(d) {
    if (d.t) return toolRows(d);
    const out = [{ t: 'title' }], p = d.p, ls = ctx(d);
    let hidden = 0;
    Maz.structure(p, ls).forEach(u => {
      out.push({ t: 'gap' });
      const lay = ls[u.i].lay;
      out.push({ t: 'head', text: lay ? lay.head : '' });
      out.push({ t: 'rec', r: u.i });
      let last = null;
      for (const i of u.seqs) {
        const L = ls[i];
        if (isTpc(L) && !showTpc) { hidden++; continue; }
        const key = L.lay ? L.sel.block + '/' + L.lay.head : 'x' + L.sel.code;
        if (key !== last) { out.push({ t: 'head', text: L.lay ? L.lay.head || (isTpc(L) ? 'TPC' : '') : '' }); last = key; }
        out.push({ t: 'rec', r: i });
      }
    });
    d.hiddenTpc = hidden;
    return out;
  }

  // tool data: each page of MazEdit's print (a layout block) with its headings and every used tool
  function toolRows(d) {
    const out = [{ t: 'title' }], ls = ctx(d), S = SCHEMA.controls[d.t.ctl];
    let block = null;
    ls.forEach((L, r) => {
      if (L.sel.block !== block) {
        block = L.sel.block;
        out.push({ t: 'gap' });
        if (d.t.tool === 'TOOLDATA') out.push({ t: 'head', text: 'Tool Data (' + (block + 1) + ')' });
        for (const h of (S.heads && S.heads[block]) || []) out.push({ t: 'head', text: h });
      }
      out.push({ t: 'rec', r });
    });
    d.hiddenTpc = 0;
    return out;
  }
  function titleHTML(d, sel) {
    if (d.t) {
      const empty = d.t.recs.length - ctx(d).filter(L => L.sel.block === ctx(d)[0].sel.block).length;
      return `<span class="k-lbl">${d.t.memory ? 'MACHINE TOOL DATA ' : d.t.tool === 'TOOLDATA' ? 'TOOL DATA ' : 'TOOL FILE '}</span><span class="k-name">${esc(d.t.name.padEnd(16))}</span>` +
        `<span class="k-lbl">${esc(C(d).label)} · ${ctx(d).length ? ctx(d).filter(L => L.sel.block === ctx(d)[0].sel.block).length : 0} tools${empty ? ' · ' + empty + ' empty slots not shown' : ''}</span>`;
    }
    const name = d.p.name.replace(/\.[^.]*$/, ''), cm = Maz.comment(d.p);
    return `<span class="k-lbl">PROGRAM </span><span class="k-name">${esc(name.padEnd(16))}</span>` +
      `<span class="k-lbl">COMMENT </span><span class="c k-text${sel ? ' sel' : ''}" data-c="0">${esc(cm.padEnd(48))}</span>`;
  }

  function renderScreen() {
    const d = doc();
    el.empty.hidden = !!d;
    el.gtext.hidden = !isEia(d);
    el.lines.hidden = isEia(d);
    el.screen.classList.toggle('eia', isEia(d));
    if (!d) { el.lines.innerHTML = ''; return; }
    if (isEia(d)) { el.lines.innerHTML = ''; renderEia(d); return; }
    const range = selRange(d);
    let html = '';
    for (const row of rows(d)) {
      if (row.t === 'gap') html += '<div class="ln gap"></div>';
      else if (row.t === 'head') html += `<div class="ln head">${esc(row.text) || ' '}</div>`;
      else if (row.t === 'title') html += `<div class="ln title${d.sel.r === -1 ? ' cur' : ''}" data-r="-1">${titleHTML(d, d.sel.r === -1)}</div>`;
      else {
        const isCur = row.r === d.sel.r, inRange = range && row.r >= range[0] && row.r <= range[1];
        html += `<div class="ln${isCur ? ' cur' : inRange ? ' rng' : ''}${Maz.controlOut(ctx(d)[row.r]) ? ' co' : ''}" data-r="${row.r}"${Maz.controlOut(ctx(d)[row.r]) ? ' title="Control out: the control skips this unit"' : ''}>${lineHTML(recLine(d, row.r), isCur ? d.sel.c : -2)}</div>`;
      }
    }
    el.lines.innerHTML = html;
  }

  // ------------------------------------------------------------------ selection & navigation
  const visible = (d, r) => r < 0 || d.t || !isTpc(ctx(d)[r]) || showTpc || Maz.structure(d.p, ctx(d)).some(u => u.i === r);
  // cells of a row in screen (column) order
  function rowCells(d, r) {
    if (r < 0) return [0];
    const L = ctx(d)[r];
    if (!L || !L.lay) return [];
    return Maz.shownCells(L.lay).sort((a, b) => L.lay.cells[a][4] - L.lay.cells[b][4] || a - b);
  }
  function firstCell(d, r) { const c = rowCells(d, r); return c.length ? c[0] : -1; }
  const cellCol = (d, r, c) => {
    if (r < 0 || c < 0) return 0;
    const L = ctx(d)[r];
    return L && L.lay && L.lay.cells[c] ? L.lay.cells[c][4] : 0;
  };
  function select(r, c, extend) {
    const d = doc();
    if (!d) return;
    if (isEia(d)) return gotoLine(r);
    ctx(d);
    r = Math.max(d.t ? 0 : -1, Math.min(d.p.recs.length - 1, r));
    const anchor = extend ? (d.sel.a !== null ? d.sel.a : d.sel.r) : null;
    d.sel = { r, c: c === undefined ? firstCell(d, r) : c, a: anchor };
    el.input.value = '';
    note('');
    renderCursor();
  }
  function selRange(d) {
    if (d.sel.a === null || d.sel.a === d.sel.r || d.sel.r < 0 || d.sel.a < 0) return null;
    return [Math.min(d.sel.a, d.sel.r), Math.max(d.sel.a, d.sel.r)];
  }
  function stepRow(d, r, dir) {
    do { r += dir; } while (r >= 0 && r < d.p.recs.length && !visible(d, r));
    return r;
  }
  function moveRow(dr, extend) {
    const d = doc();
    if (!d) return;
    const col = cellCol(d, d.sel.r, d.sel.c);
    let r = d.sel.r;
    for (let k = 0; k < Math.abs(dr); k++) { const n = stepRow(d, r, dr > 0 ? 1 : -1); if (n < -1 || n >= d.p.recs.length) break; r = n; }
    const cells = rowCells(d, r);
    let best = cells.length ? cells[0] : -1, bd = 1e9;
    for (const c of cells) { const dd = Math.abs(cellCol(d, r, c) - col); if (dd < bd) { bd = dd; best = c; } }
    select(r, best, extend);
  }
  function moveCell(dc, editableOnly) {
    const d = doc();
    if (!d) return;
    let r = d.sel.r, cells = rowCells(d, r), k = cells.indexOf(d.sel.c);
    for (let guard = 0; guard < 4000; guard++) {
      k += dc;
      if (k < 0 || k >= cells.length) {
        const nr = stepRow(d, r, dc > 0 ? 1 : -1);
        if (nr < -1 || nr >= d.p.recs.length) return;
        r = nr; cells = rowCells(d, r); k = dc > 0 ? -1 : cells.length;
        continue;
      }
      if (!editableOnly || r < 0 || !Maz.locked(ctx(d)[r], cells[k])) return select(r, cells[k]);
    }
  }
  // The units of the program down the left, as on the control: UNo and name, ⦸ for a unit under control out, + for one
  // with its own TPC; the unit at the cursor is highlighted, a click goes to it. Kept shown or hidden in this browser.
  let unitListOn = store.get('mazed-unitlist', !(window.matchMedia && matchMedia('(max-width: 760px)').matches));
  function renderUnitList() {
    const nav = $('#unitList'), d = doc(), btn = $('#unitListBtn');
    if (btn) btn.classList.toggle('on', !!unitListOn);
    if (!d || !isProg(d) || !unitListOn) { nav.hidden = true; nav.innerHTML = ''; return; }
    const ls = ctx(d), us = Maz.structure(d.p, ls), cur = d.sel.r >= 0 ? unitOf(d, d.sel.r).i : -1, top = nav.scrollTop;
    nav.hidden = false;
    nav.innerHTML = '<div class="ul-head">UNITS</div>' + us.map(u => {
      const co = Maz.controlOut(ls[u.i]), tpc = u.seqs.some(i => isTpc(ls[i]));
      return `<button type="button" class="ul-i${u.i === cur ? ' cur' : ''}${co ? ' co' : ''}" data-ui="${u.i}" title="${[co ? 'Control out: the control skips this unit' : '', tpc ? 'This unit has its own TPC' : ''].filter(Boolean).join(' · ')}"><span class="ul-m">${co ? '⦸' : ''}</span><span class="ul-p">${tpc ? '+' : ''}</span><span class="ul-n">${Maz.number(d.p.recs[u.i])}</span><span class="ul-u">${esc(unitName(d.p.ctl, u.code) || 'COMMON')}</span></button>`;
    }).join('');
    nav.scrollTop = top;
    const at = nav.querySelector('.ul-i.cur');
    if (at) { const a = at.getBoundingClientRect(), b = nav.getBoundingClientRect(); if (a.top < b.top + 22 || a.bottom > b.bottom - 4) at.scrollIntoView({ block: 'nearest' }); }
  }
  function renderCursor() {
    const d = doc();
    if (!d) return renderEntry();
    renderUnitList();
    renderScreen();
    const line = el.lines.querySelector(`.ln[data-r="${d.sel.r}"]`);
    if (line) {
      const s = line.querySelector('.c.sel') || line;
      const box = el.screen.getBoundingClientRect(), lb = line.getBoundingClientRect();
      if (lb.top < box.top + 4 || lb.bottom > box.bottom - 4) line.scrollIntoView({ block: 'nearest' });
      if (s !== line) s.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    renderEntry();
    renderPlotHighlight();
  }

  // ------------------------------------------------------------------ entry line: prompt, soft keys, info
  function unitOf(d, r) {
    const units = Maz.structure(d.p, ctx(d));
    for (let k = units.length - 1; k >= 0; k--) if (units[k].i <= r) return units[k];
    return units[0];
  }
  function renderEntry() {
    const d = doc();
    el.keys.innerHTML = '';
    el.inKeys.innerHTML = '';
    fieldChoices = [];
    el.input.hidden = isEia(d);
    $('#guide').hidden = true;
    if (!d) { el.prompt.textContent = ' '; el.where.textContent = ''; el.info.textContent = ''; renderSoftKeys(); return; }
    if (isEia(d)) {
      el.prompt.textContent = eiaPrompt(d, d.g.curLine) || ' ';
      renderWhere();
      renderInfo();
      renderSoftKeys();
      return;
    }
    const r = d.sel.r;
    let prompt = '', where = '', keys = [], locked = '';
    if (r === -1) {
      where = 'Program comment';
      prompt = 'Program comment (up to 48 characters)';
    } else if (d.t) {
      const L = ctx(d)[r], lay = L.lay;
      where = (d.t.tool === 'TOOLDATA' ? 'Tool Data (' + (L.sel.block + 1) + ')' : 'Tool file') + ' · record ' + (L.ri + 1);
      if (lay && d.sel.c >= 0 && lay.cells[d.sel.c]) {
        const cell = lay.cells[d.sel.c], label = Maz.cellLabel(lay, d.sel.c);
        where += label ? ' · ' + label : '';
        prompt = (window.MazHelp ? MazHelp.clearPrompt(Maz.prompt(cell)) : Maz.prompt(cell)) || label || 'Field';
        locked = Maz.locked(L, d.sel.c);
        if (!locked) keys = Maz.choices(L, d.sel.c);
      }
    } else {
      const L = ctx(d)[r], lay = L.lay, u = unitOf(d, r);
      where = (u.code === 1 ? 'Common unit' : 'UNo ' + Maz.number(d.p.recs[u.i]) + ' ' + unitName(d.p.ctl, u.code));
      if (!L.sel.unit) where += ' · ' + (lay && isFigHead(lay) ? 'FIG ' : 'SNo ') + Maz.number(L.rec);
      if (lay && d.sel.c >= 0 && lay.cells[d.sel.c]) {
        const cell = lay.cells[d.sel.c], label = (L.sel.code === 0xc0 && window.MazHelp && C(d).type === 'mill' && MazHelp.POINT_FIELDS[cell[0]]) || Maz.cellLabel(lay, d.sel.c);
        where += label ? ' · ' + label : '';
        prompt = (window.MazHelp ? MazHelp.clearPrompt(Maz.prompt(cell)) : Maz.prompt(cell)) || label || 'Field';
        locked = Maz.locked(L, d.sel.c);
        if (!locked) keys = Maz.choices(L, d.sel.c);
      } else prompt = lay ? '' : isTpc(L) ? 'TPC setting data, kept as it is.' : 'MazEdit has no layout for this record type; it is kept as it is.';
    }
    // an M field: what its M-code does on this machine
    if (!locked && d && !d.t && !d.g && r >= 0 && window.MazRef) {
      const L = ctx(d)[r], lay = L && L.lay;
      if (lay && d.sel.c >= 0 && isMField(L, d.sel.c)) {
        const v = Maz.cellText(L, d.sel.c, { units: d.units }).trim(), code = v && /^\d+$/.test(v) ? 'M' + v.padStart(2, '0') : '', m = code && MazRef.M_FOR(mtype(d)).find(x => x[0].split('/').includes(code));
        if (m) prompt += ' — ' + code + ': ' + m[1];
        else if (code) prompt += ' — ' + code + ': not in this machine\'s list (an option or machine-builder code)';
      }
    }
    renderMazGuide(d);
    el.prompt.textContent = locked ? prompt + ' — ' + locked : prompt || ' ';
    el.where.textContent = where;
    // a field that cannot be set (◆) leaves the entry line read-only, not disabled: a disabled input loses the focus
    // and the arrow keys with it, so the cursor could not move on from there
    el.input.disabled = false;
    el.input.classList.toggle('locked', !!locked);
    el.input.readOnly = !editing || !!locked;
    el.input.placeholder = locked ? 'not editable' : !editing ? 'view only — turn on Edit (Ctrl+E) to change values' : 'type a value, Enter to set';
    // the field's choices are the soft keys while editing
    const fk = d.id + ':' + r + ':' + d.sel.c;
    if (fk !== fieldKey) { fieldKey = fk; skPage = skField() ? 0 : skPage; }
    fieldChoices = keys;
    if (r >= 0 && d.sel.c >= 0 && !locked) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'clear'; b.textContent = 'Clear field'; b.title = 'Clear this field (Delete)';
      b.onclick = () => { clearField(); el.input.focus(); };
      el.inKeys.appendChild(b);                        // next to the entry line
    }
    if (bitField(d)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'bitsBtn'; b.textContent = 'Bits…'; b.title = 'Show and set this TPC value bit by bit, with notes on what each bit does';
      b.onclick = openBits;
      el.keys.appendChild(b);
    }
    renderInfo();
    renderSoftKeys();
  }
  function renderInfo() {
    const d = doc();
    if (!d) { el.info.textContent = ''; return; }
    const K = C(d), units = d.t || d.g ? 0 : Maz.structure(d.p, ctx(d)).length;
    el.info.textContent = (d.g ? `${K.label} .${K.ext} · ${lineStarts(d).length} lines · ${d.units === 'metric' ? 'mm' : 'inch'}` : d.t ? `${K.label}${readOnly(d) ? '' : ' .' + K.ext} · ${d.t.recs.length} records · ${d.units === 'metric' ? 'mm' : 'inch'}`
      : `${K.label} .${d.p.raw ? K.raw : K.ext} · ${units} units · ${d.p.recs.length} records · ${d.units === 'metric' ? 'mm' : 'inch'}`) +
      (d.hiddenTpc ? ` · ${d.hiddenTpc} TPC records hidden` : '') +
      (readOnly(d) ? ' · read-only' : (editing ? ' · EDITING' : ' · view only') + (d.handle ? ' · saves to the opened file' : ' · saves as a download')) + (d.dirty ? ' · unsaved changes' : '');
    document.title = (d.dirty ? '• ' : '') + d.p.name + ' — Mazatrol Editor';
  }
  let noteTimer = 0;
  function note(text, ok) {
    el.msg.textContent = text || '';
    el.msg.className = 'msg' + (ok ? ' ok' : '');
    clearTimeout(noteTimer);
    if (text && ok) noteTimer = setTimeout(() => { el.msg.textContent = ''; }, 4000);
  }

  // ------------------------------------------------------------------ editing fields
  function enterValue(text) {
    const d = doc();
    if (!d || isEia(d)) return false;
    if (locked(d)) return false;
    if (d.sel.r === -1) {
      if (d.t) return false;
      edit(d => Maz.setComment(d.p, text));
      el.input.value = '';
      if (d.p.raw) note('A .' + C(d).raw + ' file has no comment. Use Save as .' + C(d).ext + ' to keep it.');
      return true;
    }
    const r = d.sel.r, c = d.sel.c;
    if (c < 0) return false;
    if (readOnly(d)) { note(READ_ONLY); return false; }
    const put = v => edit(d => {
      const L = ctx(d)[r], rec = L.rec.slice();
      Maz.enter(Object.assign({}, L, { rec }), c, v, { units: d.units });
      if (d.t) d.t.recs[L.ri] = rec; else d.p.recs[r] = rec;
    });
    let worked = '';
    // * or / first: on the field's value (a plain * is a marker the number reader drops, so it is worked out first)
    const first = /^\s*[*/]/.test(text) ? fieldCalc(d, r, c, text) : null;
    if (first && !first.error) {
      try { put(first.text); worked = first.shown; } catch (e) { note(first.shown + ': ' + e.message); return false; }
    }
    else try { put(text); }
    catch (e) {
      // arithmetic in a number field: worked out and entered (a field that takes text, a tap size such as
      // 3/8-16, has already taken it as typed)
      const calc = fieldCalc(d, r, c, text);
      if (!calc) { note(e.message); return false; }
      if (calc.error) { note(calc.error); return false; }
      try { put(calc.text); } catch (e2) { note(calc.shown + ': ' + e2.message); return false; }
      worked = calc.shown;
    }
    el.input.value = '';
    note(worked, worked ? 'ok' : undefined);
    lastCalc = worked;
    return true;
  }
  let lastCalc = '';
  // Arithmetic typed into a number field: + - * / and brackets, worked out with the field's letter (R, X ...) kept.
  // Starting with * or / takes the field's value first (2.5 there, "/2" gives 1.25). A plain number never comes here.
  function fieldCalc(d, r, c, text) {
    const m = /^\s*([A-Za-z#]?)\s*([-+*/().\d\s]+)$/.exec(text);
    if (!m || !/\d/.test(m[2]) || !/[-+*/]/.test(m[2].replace(/^\s*[-+]/, ''))) return null;
    const L = ctx(d)[r];
    try { Maz.enter(Object.assign({}, L, { rec: L.rec.slice() }), c, '1', { units: d.units }); } catch (e) { return null; }   // not a number field
    let expr = m[2].trim(), pre = m[1];
    if (/^[*/]/.test(expr)) {
      const cur = Maz.cellText(L, c, { units: d.units }).trim(), cm = /^([A-Za-z#]?)\s*([-+]?\d*\.?\d+|\d+\.)$/.exec(cur);
      if (!cm) return { error: 'The field has no value for ' + expr + ' to work on.' };
      pre = pre || cm[1]; expr = cm[2] + expr;
    }
    const v = calcValue(expr);
    if (v === null) return { error: 'Cannot work out ' + text.trim() + ' (use numbers with + - * / and brackets).' };
    const out = String(+v.toFixed(6));
    return { text: pre + out, shown: pre + expr + ' = ' + pre + out };
  }
  // + - * / with brackets and signs, left to right with * / first; null if it does not read or divides by 0
  function calcValue(s) {
    let i = 0;
    const sp = () => { while (s[i] === ' ') i++; };
    const num = () => {
      sp();
      if (s[i] === '(') { i++; const v = sum(); sp(); if (s[i] !== ')') throw 0; i++; return v; }
      if (s[i] === '-' || s[i] === '+') { const neg = s[i++] === '-'; const v = num(); return neg ? -v : v; }
      const mm = /^\d*\.?\d+|^\d+\./.exec(s.slice(i));
      if (!mm) throw 0;
      i += mm[0].length;
      return parseFloat(mm[0]);
    };
    const prod = () => { let v = num(); for (;;) { sp(); const o = s[i]; if (o !== '*' && o !== '/') return v; i++; const w = num(); if (o === '/' && w === 0) throw 0; v = o === '*' ? v * w : v / w; } };
    const sum = () => { let v = prod(); for (;;) { sp(); const o = s[i]; if (o !== '+' && o !== '-') return v; i++; const w = prod(); v = o === '+' ? v + w : v - w; } };
    try { const v = sum(); sp(); return i === s.length && Number.isFinite(v) ? v : null; } catch (e) { return null; }
  }
  function commit(advance) {
    const d = doc();
    if (!d) return;
    const text = el.input.value;
    if (skPending) { runPending(text); return; }
    if (!text.trim()) { if (advance) moveCell(1, true); return; }
    if (enterValue(text) && advance) { moveCell(1, true); if (lastCalc) note(lastCalc, true); }      // the working stays in view
  }
  function clearField() {
    const d = doc();
    if (!d || isEia(d) || d.sel.c < 0 || locked(d)) return;
    if (d.sel.r === -1) { if (!d.t) edit(d => Maz.setComment(d.p, '')); return; }
    if (readOnly(d)) return note(READ_ONLY);
    const r = d.sel.r, c = d.sel.c;
    try {
      edit(d => {
        const L = ctx(d)[r], rec = L.rec.slice();
        Maz.clear(Object.assign({}, L, { rec }), c);
        if (d.t) d.t.recs[L.ri] = rec; else d.p.recs[r] = rec;
      });
    } catch (e) { note(e.message); }
  }

  // ------------------------------------------------------------------ TPC bits
  // A TPC value that the control sets bit by bit (BIT 0 .. BIT 7 on its TPC screen). The meaning of each bit is in
  // Mazak's parameter list, which is not part of any file here; the dialog keeps the notes the user writes for a
  // field (by control family, record code and byte) in this browser, with export and import.
  function bitField(d) {
    if (!d || d.t || d.g || d.sel.r < 0 || d.sel.c < 0) return null;
    const L = ctx(d)[d.sel.r];
    if (!L || !L.lay || !isTpc(L)) return null;
    const cell = L.lay.cells[d.sel.c];
    return cell && (cell[1] === 1 || cell[1] === 2) ? { L, cell } : null;
  }
  const bitsKey = (d, L, cell) => [Maz.CONTROLS[d.p.ctl].family, L.sel.code.toString(16), cell[0]].join('|');
  const bitNotes = () => store.get('mazed-bitnotes', {});
  let bitsState = null;
  function openBits() {
    const d = doc(), f = bitField(d);
    if (!f) return;
    const { L, cell } = f, n = cell[1] * 8, v = Maz.raw(L.rec, cell) & (n === 8 ? 0xff : 0xffff);
    const u = unitOf(d, d.sel.r), notes = bitNotes()[bitsKey(d, L, cell)] || [];
    bitsState = { r: d.sel.r, c: d.sel.c, n, v, orig: v, key: bitsKey(d, L, cell) };
    $('#bitsTitle').textContent = `TPC of UNo ${Maz.number(d.p.recs[u.i])} ${unitName(d.p.ctl, u.code)} · ${Maz.cellLabel(L.lay, d.sel.c).trim() || 'field'} (record 0x${L.sel.code.toString(16)}, byte ${cell[0]})`;
    $('#bitsRows').innerHTML = Array.from({ length: n }, (_, k) => n - 1 - k).map(b =>
      `<tr data-b="${b}"><td class="b"><label><input type="checkbox" data-bit="${b}"> bit ${b}</label></td>` +
      `<td><input type="text" data-note="${b}" value="${esc(notes[b] || '')}" placeholder="what bit ${b} does"></td></tr>`).join('');
    showBits();
    $('#bitsDlg').showModal();
  }
  function showBits() {
    const s = bitsState;
    $('#bitsVal').textContent = s.v;
    $('#bitsHex').textContent = '0x' + s.v.toString(16).toUpperCase().padStart(s.n / 4, '0') + '  ' + s.v.toString(2).padStart(s.n, '0').replace(/(\d{4})(?=\d)/g, '$1 ');
    $('#bitsWas').textContent = s.v !== s.orig ? '(was ' + s.orig + ')' : '';
    document.querySelectorAll('#bitsRows tr').forEach(tr => {
      const b = +tr.dataset.b, on = (s.v >> b) & 1;
      tr.classList.toggle('on', !!on);
      tr.querySelector('input[type=checkbox]').checked = !!on;
    });
  }
  function saveBitNotes() {
    const all = bitNotes(), list = [];
    document.querySelectorAll('#bitsRows input[data-note]').forEach(i => { list[+i.dataset.note] = i.value.trim(); });
    if (list.some(Boolean)) all[bitsState.key] = list; else delete all[bitsState.key];
    store.set('mazed-bitnotes', all);
  }
  function bitsEvents() {
    $('#bitsRows').addEventListener('change', e => {
      const b = e.target.dataset.bit;
      if (b === undefined) return;
      bitsState.v = e.target.checked ? bitsState.v | (1 << +b) : bitsState.v & ~(1 << +b);
      showBits();
    });
    $('#bitsRows').addEventListener('input', e => { if (e.target.dataset.note !== undefined) saveBitNotes(); });
    $('#bitsClose').onclick = () => { saveBitNotes(); $('#bitsDlg').close(); el.input.focus(); };
    $('#bitsApply').onclick = () => {
      saveBitNotes();
      const s = bitsState, d = doc();
      if (d && s.v !== s.orig && !locked(d)) {
        try {
          edit(d => { const L = ctx(d)[s.r], rec = L.rec.slice(); Maz.setCell(rec, L.lay.cells[s.c], s.v); d.p.recs[s.r] = rec; });
          note('Set to ' + s.v + '.', true);
        } catch (e) { note(e.message); }
      }
      $('#bitsDlg').close();
      el.input.focus();
    };
    $('#bitsExport').onclick = () => { saveBitNotes(); download(JSON.stringify(bitNotes(), null, 1), 'tpc-bit-notes.json', 'application/json'); };
    $('#bitsImport').onclick = () => $('#bitsFile').click();
    $('#bitsFile').onchange = async () => {
      const f = $('#bitsFile').files[0];
      $('#bitsFile').value = '';
      if (!f) return;
      try {
        const add = JSON.parse(await f.text());
        store.set('mazed-bitnotes', Object.assign(bitNotes(), add));
        const notes = bitNotes()[bitsState.key] || [];
        document.querySelectorAll('#bitsRows input[data-note]').forEach(i => { i.value = notes[+i.dataset.note] || ''; });
        note('Imported notes for ' + Object.keys(add).length + ' fields.', true);
      } catch (e) { note('Not a notes file: ' + e.message); }
    };
  }

  // ------------------------------------------------------------------ lines and units
  // Records the selection covers: whole units when a unit line is included, else sequence lines.
  function selectionBlock(d) {
    const range = selRange(d) || [d.sel.r, d.sel.r];
    const [a, b] = range;
    if (a < 0) return null;
    const ls = ctx(d);
    const anyUnit = ls.slice(a, b + 1).some(L => L.sel.unit);
    if (!anyUnit) return { a, b, unit: false };
    const units = Maz.structure(d.p, ls);
    const ua = unitOf(d, a), ub = unitOf(d, b);
    const endOf = u => (u.seqs.length ? u.seqs[u.seqs.length - 1] : u.i);
    return { a: ua.i, b: endOf(ub), unit: true, units: units.filter(u => u.i >= ua.i && u.i <= ub.i) };
  }
  // where inserted and pasted units go: above the unit at the cursor (the top one of a selection); on the common
  // unit or the title line, right after the common unit, which stays first
  function insertUnitIndex(d) {
    const range = selRange(d), r = range ? range[0] : d.sel.r;
    const u = unitOf(d, Math.max(0, r));
    if (r < 0 || u.code === 1) return { at: (u.seqs.length ? u.seqs[u.seqs.length - 1] : u.i) + 1, above: false };
    return { at: u.i, above: true };
  }
  // after units went in at record at (n records): where they are, by the unit now below them
  function placeText(d, at, n, above) {
    if (!above) return 'after the common unit';
    const i = at + n, code = Maz.code(d.p.recs[i]);
    return 'above UNo ' + Maz.number(d.p.recs[i]) + ' ' + unitName(d.p.ctl, code);
  }
  function insertUnit(code) {
    let d = doc();
    if (isTool(d)) return note('Units belong to programs, not to tool data');
    if (isEia(d)) return note('EIA programs are edited as text; units belong to Mazatrol programs');
    if (!d) { newProgram('MatrixM'); d = doc(); }
    if (locked(d)) return;
    const { at, above } = insertUnitIndex(d), recs = Maz.newUnit(d.p.ctl, code, { units: d.units });
    edit(d => {
      d.p.recs.splice(at, 0, ...recs);
      Maz.renumber(d.p);
      d.ls = null;
      d.sel = { r: at, c: firstCell(d, at), a: null };
    });
    note('Inserted ' + unitName(d.p.ctl, code) + ' (UNo ' + Maz.number(d.p.recs[at]) + ') ' + placeText(d, at, recs.length, above) +
      '. Fill in the blank fields; more tool lines and shape lines can be added with Insert line.', true);
  }
  function insertLine() {
    const d = doc();
    if (isTool(d)) return note('Tool data records stay in their slots; edit their fields instead');
    if (isEia(d)) return note('EIA programs are edited as text');
    if (locked(d)) return;
    if (!d || d.sel.r < 0) return note('Put the cursor on a unit or line first');
    const r = d.sel.r, L = ctx(d)[r];
    let at, line;
    if (L.sel.unit) {
      const u = unitOf(d, r);
      const first = u.seqs.find(i => !isTpc(ctx(d)[i]));
      const kind = first !== undefined ? Maz.code(d.p.recs[first]) : Maz.shapeCode(d.p.ctl, L.sel.code);
      if (!kind) return note('This unit has no lines');
      line = first !== undefined ? Maz.newLine(d.p.ctl, d.p.recs[first]) : Maz.newRecord(kind, 0);
      at = first !== undefined ? first : r + 1;
    } else {
      line = Maz.newLine(d.p.ctl, L.rec);
      at = (selRange(d) || [r, r])[1] + 1;
    }
    edit(d => {
      d.p.recs.splice(at, 0, line);
      Maz.renumber(d.p);
      d.ls = null;
      d.sel = { r: at, c: firstCell(d, at), a: null };
    });
    const w = Maz.limits(d.p);
    if (w.length) note(w[0]);
  }
  function deleteSelection() {
    const d = doc();
    if (isTool(d)) return note('Tool data records stay in their slots; edit their fields instead');
    if (isEia(d)) return note('EIA programs are edited as text');
    if (!d || locked(d)) return;
    const blk = selectionBlock(d);
    if (!blk) return note('Nothing to delete here');
    if (blk.unit && blk.units.some(u => u.code === 1)) return note('The common unit cannot be deleted');
    const n = blk.b - blk.a + 1;
    edit(d => {
      d.p.recs.splice(blk.a, n);
      Maz.renumber(d.p);
      d.ls = null;
      const r = Math.min(blk.a, d.p.recs.length - 1);
      d.sel = { r, c: firstCell(d, r), a: null };
    });
    note('Deleted ' + (blk.unit ? blk.units.length + (blk.units.length > 1 ? ' units' : ' unit') : n + (n > 1 ? ' lines' : ' line')) + ' (Undo brings it back)', true);
  }
  // CONTROL OUT SET / CANCEL: the units of the selection (or of the line at the cursor) are skipped by the control, or
  // run again. Greyed with a ⦸ mark; not in the TOOL PATH or its time, nothing in them is checked.
  function controlOutSelection(on) {
    const d = doc();
    if (isTool(d)) return note('Tool data has no units');
    if (isEia(d)) return note('EIA programs have no units to control out');
    if (!d || locked(d)) return;
    const range = selRange(d) || [d.sel.r, d.sel.r];
    if (range[0] < 0) return note('Put the cursor on a unit');
    const ls = ctx(d), ua = unitOf(d, range[0]), ub = unitOf(d, range[1]);
    const us = Maz.structure(d.p, ls).filter(u => u.i >= ua.i && u.i <= ub.i && Maz.canControlOut(ls[u.i]));
    if (!us.length) return note(C(d).family !== 'Smooth' ? 'CONTROL OUT is for Smooth programs (a Matrix program has no such flag we know of)' : 'The common unit and END cannot be controlled out');
    const change = us.filter(u => Maz.controlOut(ls[u.i]) !== on);
    if (!change.length) return note(us.length > 1 ? 'Already ' + (on ? 'controlled out' : 'in the program') : 'This unit is already ' + (on ? 'controlled out' : 'in the program'), true);
    edit(d => { for (const u of change) { const rec = d.p.recs[u.i].slice(); Maz.setControlOut(rec, on); d.p.recs[u.i] = rec; } });
    note((on ? 'Control out (⦸): ' : 'Control out cancelled: ') + (change.length > 1 ? change.length + ' units' : 'UNo ' + Maz.number(d.p.recs[change[0].i])) + (on ? ' will not run (Undo brings them back)' : ' run again'), true);
  }
  function copySelection() {
    const d = doc();
    if (isTool(d)) return note('Tool data records stay in their slots; edit their fields instead');
    if (isEia(d)) return note('EIA programs are edited as text');
    if (!d) return;
    const blk = selectionBlock(d);
    if (!blk) return note('Nothing to copy here');
    clip = { ctl: d.p.ctl, unit: blk.unit, recs: d.p.recs.slice(blk.a, blk.b + 1).map(r => r.slice()) };
    note('Copied ' + (blk.unit ? blk.units.length + (blk.units.length > 1 ? ' units' : ' unit') : clip.recs.length + (clip.recs.length > 1 ? ' lines' : ' line')), true);
  }
  function paste() {
    const d = doc();
    if (isTool(d)) return note('Tool data records stay in their slots; edit their fields instead');
    if (isEia(d)) return note('EIA programs are edited as text');
    if (!d || locked(d)) return;
    if (!clip) return note('Copy a line or unit first');
    if (Maz.CONTROLS[clip.ctl].type !== C(d).type) return note('These were copied from a ' + Maz.CONTROLS[clip.ctl].label + ' program; they cannot go into a ' + C(d).label + ' program');
    const recs = clip.recs.map(r => Maz.convertRecord(r, clip.ctl, d.p.ctl));
    let at, above = false;
    if (clip.unit) ({ at, above } = insertUnitIndex(d));          // units go above the unit at the cursor
    else {
      if (d.sel.r < 0) return note('Put the cursor on a unit or line to paste lines after it');
      const u = unitOf(d, d.sel.r), kinds = new Set(u.seqs.map(i => Maz.code(d.p.recs[i])));
      const ulay = ctx(d)[u.i].lay || {};
      [Maz.shapeCode(d.p.ctl, u.code), ulay.tool, 0xc1].forEach(k => k && kinds.add(k));
      if (recs.some(r => !kinds.has(Maz.code(r)))) return note('These lines belong to a different kind of unit');
      at = ctx(d)[d.sel.r].sel.unit ? d.sel.r + 1 : (selRange(d) || [d.sel.r, d.sel.r])[1] + 1;
    }
    edit(d => {
      d.p.recs.splice(at, 0, ...recs);
      Maz.renumber(d.p);
      d.ls = null;
      d.sel = { r: at, c: firstCell(d, at), a: at + recs.length - 1 > at ? at + recs.length - 1 : null };
    });
    const w = Maz.limits(d.p);
    if (w.length) note(w[0]);
    else if (clip.unit) {
      const n = clip.recs.filter((r, k) => ctx(d)[at + k] && ctx(d)[at + k].sel.unit).length;
      note('Pasted ' + n + (n > 1 ? ' units ' : ' unit ') + placeText(d, at, recs.length, above), true);
    }
  }
  // the selected units or lines again, right after them
  function duplicateSelection() {
    const d = doc();
    if (isTool(d)) return note('Tool data records stay in their slots; edit their fields instead');
    if (isEia(d)) return note('EIA programs are edited as text');
    if (!d || locked(d)) return;
    const blk = selectionBlock(d);
    if (!blk) return note('Put the cursor on a unit or line to duplicate it');
    if (blk.unit && blk.units.some(u => u.code === 1 || u.code === 4)) return note('The common unit and END are not duplicated');
    const recs = d.p.recs.slice(blk.a, blk.b + 1).map(r => r.slice()), at = blk.b + 1;
    edit(d => {
      d.p.recs.splice(at, 0, ...recs);
      Maz.renumber(d.p);
      d.ls = null;
      d.sel = { r: at, c: firstCell(d, at), a: recs.length > 1 ? at + recs.length - 1 : null };
    });
    const w = Maz.limits(d.p);
    note(w.length ? w[0] : 'Duplicated ' + (blk.unit ? blk.units.length + (blk.units.length > 1 ? ' units' : ' unit') : recs.length + (recs.length > 1 ? ' lines' : ' line')), !w.length);
  }
  function cutSelection() {
    const d = doc();
    if (!isProg(d)) return copySelection();
    if (locked(d)) return;
    const blk = selectionBlock(d);
    if (blk && blk.unit && blk.units.some(u => u.code === 1)) return note('The common unit cannot be cut');
    copySelection();
    if (clip) deleteSelection();
  }
  // right-click on a unit or line: what can be done with it
  function contextMenu(e) {
    const d = doc(), line = e.target.closest('.ln[data-r]');
    if (!isProg(d) || !line) return;
    e.preventDefault();
    const r = +line.dataset.r, range = selRange(d);
    if (!(range && r >= range[0] && r <= range[1])) select(r);
    const blk = r >= 0 ? selectionBlock(d) : null;
    const fixed = blk && blk.unit && blk.units.some(u => u.code === 1 || u.code === 4);
    const what = !blk ? '' : blk.unit ? (blk.units.length > 1 ? blk.units.length + ' units' : 'unit') : (blk.b > blk.a ? blk.b - blk.a + 1 + ' lines' : 'line');
    const items = [
      ['unit-menu', 'Insert unit above…', ''],
      ['line', 'Insert line', 'Ins', r < 0],
      ['text', 'Edit lines as text…', '', r < 0 || !shapeLinesOf(d, unitOf(d, r)).length],
      null,
      ['dup', 'Duplicate ' + what, 'Ctrl+D', !blk || fixed],
      ['cut', 'Cut ' + what, 'Ctrl+X', !blk || (blk.unit && blk.units.some(u => u.code === 1))],
      ['copy', 'Copy ' + what, 'Ctrl+C', !blk],
      ['paste', 'Paste' + (clip ? (clip.unit ? ' units above' : ' lines after') : ''), 'Ctrl+V', !clip],
      ['delete', 'Delete ' + what, 'Ctrl+Del', !blk || (blk.unit && blk.units.some(u => u.code === 1))],
      null,
      ['coset', 'Control out (⦸)', '', !blk || r < 0 || !Maz.canControlOut(ctx(d)[unitOf(d, r).i])],
      ['cocancel', 'Cancel control out', '', !blk || r < 0 || !Maz.canControlOut(ctx(d)[unitOf(d, r).i])],
      ['up', 'Move up', 'Alt+↑', !blk || fixed],
      ['down', 'Move down', 'Alt+↓', !blk || fixed],
      null,
      ['plotfrom', 'Plot from this unit', '', r < 0],
    ];
    const m = $('#ctxMenu');
    const changes = new Set(['unit-menu', 'line', 'dup', 'cut', 'paste', 'delete', 'up', 'down', 'coset', 'cocancel']);
    m.innerHTML = items.map(it => !it ? '<hr>' : `<button type="button" data-ctx="${it[0]}"${it[3] || (!editing && changes.has(it[0])) ? ' disabled' : ''}><span>${esc(it[1])}</span><kbd>${esc(it[2])}</kbd></button>`).join('');
    m.hidden = false;
    const W = window.innerWidth, H = window.innerHeight, bw = m.offsetWidth, bh = m.offsetHeight;
    m.style.left = Math.min(e.clientX, W - bw - 4) + 'px';
    m.style.top = Math.min(e.clientY, H - bh - 4) + 'px';
  }
  function contextAction(act) {
    $('#ctxMenu').hidden = true;
    if (act === 'unit-menu') {
      const m = $('#ctxMenu');
      popUnits(parseFloat(m.style.left) || 40, parseFloat(m.style.top) || 80);
      return;
    }
    if (act === 'plotfrom') { if (!plotOn) side('plot'); playAction('here'); return; }
    const f = { coset: () => controlOutSelection(true), cocancel: () => controlOutSelection(false), text: openText, line: insertLine, dup: duplicateSelection, cut: cutSelection, copy: copySelection, paste, delete: deleteSelection, up: () => moveSelection(-1), down: () => moveSelection(1) }[act];
    if (f) f();
    el.input.focus();
  }
  function moveSelection(dir) {
    const d = doc();
    if (isTool(d)) return note('Tool data records stay in their slots; edit their fields instead');
    if (isEia(d)) return note('EIA programs are edited as text');
    if (!d || locked(d)) return;
    const blk = selectionBlock(d);
    if (!blk) return;
    const units = Maz.structure(d.p, ctx(d));
    const from = blk.a, to = blk.b;
    let dest;
    if (blk.unit) {
      if (blk.units.some(u => u.code === 1 || u.code === 4)) return note('The common unit and END stay where they are');
      const k0 = units.findIndex(u => u.i === blk.units[0].i), k1 = k0 + blk.units.length - 1;
      const other = units[dir < 0 ? k0 - 1 : k1 + 1];
      if (!other || other.code === 1 || other.code === 4) return;
      const oEnd = other.seqs.length ? other.seqs[other.seqs.length - 1] : other.i;
      dest = dir < 0 ? other.i : oEnd - (to - from);
    } else {
      const u = unitOf(d, from);
      const first = u.seqs[0], last = u.seqs[u.seqs.length - 1];
      if (dir < 0 ? from <= first : to >= last) return;
      dest = from + dir;
    }
    edit(d => {
      const block = d.p.recs.splice(from, to - from + 1);
      d.p.recs.splice(dest, 0, ...block);
      Maz.renumber(d.p);
      d.ls = null;
      const shift = dest - from;
      d.sel = { r: d.sel.r + shift, c: d.sel.c, a: d.sel.a === null ? null : d.sel.a + shift };
    });
  }

  // ------------------------------------------------------------------ EIA/ISO programs
  // G-code programs are edited as text. d.g = {text (lines joined by \n), eol (as read), type (mill, lathe,
  // mill-turn: from the folder's machine or guessed), curLine, sel, scroll}. The plot runs the program
  // (GCode.run) and steps through it block by block.
  const EIA_EXTS = ['EIA', 'NC', 'TAP', 'CNC', 'ISO'];
  const isEiaName = name => EIA_EXTS.includes(Maz.extOf(name));
  const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };
  const latin1Bytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c < 256 ? c : 63; } return b; };
  function makeEiaDoc(text, name, handle, type) {
    const g = { text: text.replace(/\r\n?/g, '\n'), eol: /\r/.test(text) || !/\n/.test(text) ? '\r\n' : '\n', type: type || GCode.guessType(text), curLine: 0, sel: [0, 0], scroll: 0 };
    const d = { id: ++docIds, rev: 0, g, p: { ctl: null, name, recs: [], warnings: [] }, handle: handle || null, dirty: false, undo: [], redo: [],
      units: /\bG21\b/.test(g.text.slice(0, 20000)) ? 'metric' : /\bG20\b/.test(g.text.slice(0, 20000)) ? 'inch' : store.get('mazed-units', 'inch'),
      sel: { r: 0, c: -1, a: null }, view: null, ls: [] };
    return d;
  }
  // line k's text, from start offsets kept per text version
  function lineStarts(d) {
    const g = d.g;
    if (g.starts && g.startsOf === g.text) return g.starts;
    const t = g.text, out = [0];
    for (let i = t.indexOf('\n'); i >= 0; i = t.indexOf('\n', i + 1)) out.push(i + 1);
    g.starts = out; g.startsOf = t;
    return out;
  }
  function eiaLine(d, k) {
    const st = lineStarts(d);
    if (k < 0 || k >= st.length) return '';
    return d.g.text.slice(st[k], k + 1 < st.length ? st[k + 1] - 1 : d.g.text.length);
  }
  const lineAt = (d, offset) => { const st = lineStarts(d); let lo = 0, hi = st.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st[mid] <= offset) lo = mid; else hi = mid - 1; } return lo; };
  // put the cursor on line k (selecting it) and bring it into view
  function gotoLine(k, fromPlay) {
    const d = doc();
    if (!isEia(d)) return;
    const st = lineStarts(d);
    k = Math.max(0, Math.min(st.length - 1, k));
    const a = st[k], b = k + 1 < st.length ? st[k + 1] - 1 : d.g.text.length;
    d.g.curLine = k; d.g.sel = [a, b];
    const ta = el.gtext;
    if (ta.doc === d) {
      if (!fromPlay) ta.focus();
      ta.setSelectionRange(a, b);
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 19, top = k * lh;
      if (top < ta.scrollTop + lh || top > ta.scrollTop + ta.clientHeight - 2 * lh) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
      d.g.scroll = ta.scrollTop;
    }
    renderEntry();
    if (!fromPlay) drawPlot();
  }
  function renderEia(d) {
    const ta = el.gtext;
    if (ta.doc && ta.doc !== d && docs.includes(ta.doc)) { ta.doc.g.sel = [ta.selectionStart, ta.selectionEnd]; ta.doc.g.scroll = ta.scrollTop; }
    if (ta.doc !== d || ta.value !== d.g.text) {
      ta.value = d.g.text;
      ta.doc = d;
      ta.setSelectionRange(d.g.sel[0], d.g.sel[1]);
      ta.scrollTop = d.g.scroll || 0;
    }
  }
  // The guidance box collapses to its title line (▸) or opens in full (▾) on every screen; kept in this browser,
  // collapsed by default on phone-size screens where the full box can cover most of the program.
  let guideMin = store.get('mazed-guide-min', window.matchMedia && matchMedia('(max-width: 760px)').matches);
  function guideChrome() {
    const box = $('#guide'), tog = $('#guideTog');
    box.classList.toggle('gd-min', !!guideMin);
    if (!tog) return;
    tog.hidden = box.hidden || !box.querySelector('.gd-t');
    tog.textContent = guideMin ? '▸ Guide' : '▾ Guide';
    tog.title = guideMin ? 'Show the whole guidance box' : 'Collapse the guidance box to one line';
    tog.setAttribute('aria-expanded', String(!guideMin));
  }
  function guideEvents() {
    const box = $('#guide'), tog = $('#guideTog');
    new MutationObserver(guideChrome).observe(box, { childList: true, attributes: true, attributeFilter: ['hidden'] });
    const flip = () => { guideMin = !guideMin; store.set('mazed-guide-min', guideMin); guideChrome(); };
    tog.addEventListener('mousedown', e => e.preventDefault());          // the cursor stays where it is
    tog.addEventListener('click', flip);
    box.addEventListener('click', e => { if (guideMin && e.target.closest('.gd-t')) flip(); });
    guideChrome();
  }

  // what a block does, for the entry line
  function eiaPrompt(d, k) {
    const text = eiaLine(d, k);
    let words = GCode.describe(text, d.g.type);
    // this machine's M-codes, named (mills)
    if (window.MazRef) {
      const ms = [...String(text).replace(/\([^)]*\)/g, '').matchAll(/(^|[^A-Z#])M\s*(\d+)/gi)].map(m => 'M' + String(+m[2]).padStart(2, '0'));
      const named = ms.map(c => { const r = MazRef.M_FOR(d.g.type).find(x => x[0] === c); return r ? c + ' ' + r[1].toLowerCase() : ''; }).filter(Boolean);
      if (named.length) words = (words ? words + ' · ' : '') + named.join(' · ');
    }
    return words || (GCode.commentOf(text) ? 'comment: ' + GCode.commentOf(text) : '');
  }
  let eiaTimer = 0;
  function eiaEvents() {
    const ta = el.gtext;
    ta.addEventListener('input', () => {
      const d = doc();
      if (!isEia(d) || ta.doc !== d) return;
      const now = Date.now();
      if (!d.g.lastInput || now - d.g.lastInput > 1000) {       // typing within a second is one undo step
        d.undo.push({ gtext: d.g.text, sel: d.g.sel.slice() });
        if (d.undo.length > (d.g.text.length > 1e6 ? 15 : 80)) d.undo.shift();
        d.redo = [];
      }
      d.g.lastInput = now;
      d.g.text = ta.value; d.g.sel = [ta.selectionStart, ta.selectionEnd];
      d.dirty = true; d.rev++; eiaVer++;
      caret();
      renderTabs(); renderInfo();
      clearTimeout(eiaTimer);
      eiaTimer = setTimeout(() => { if (plotOn) renderPlot(); renderTime(); }, d.g.text.length > 500000 ? 1200 : 350);
    });
    const caret = () => {
      const d = doc();
      if (!isEia(d) || ta.doc !== d) return;
      d.g.sel = [ta.selectionStart, ta.selectionEnd];
      const k = lineAt(d, ta.selectionStart);
      if (k !== d.g.curLine) { d.g.curLine = k; renderEntry(); drawPlot(); }
      else renderWhere();
    };
    ['keyup', 'click', 'select'].forEach(ev => ta.addEventListener(ev, caret));
    ta.addEventListener('keydown', e => { if (!editing && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey) note(VIEW_ONLY); });
    ta.addEventListener('scroll', () => { const d = doc(); if (isEia(d) && ta.doc === d) d.g.scroll = ta.scrollTop; });
  }
  // guidance for the EIA block at the cursor: the command's format, each address with its value, what is missing
  // the # variables of a block, named (macro / system variables)
  function varItems(line, t) {
    const seen = new Set(), out = [];
    for (const m of String(line).replace(/\([^)]*\)/g, '').matchAll(/#\s*(\d+)/g)) {
      const n = +m[1];
      if (seen.has(n)) continue;
      seen.add(n);
      const what = MazGuide.varInfo(n, t);
      out.push(`<span class="gd-i set"><b>#${n}</b><small>${esc(what || 'variable')}</small></span>`);
    }
    return out.join('');
  }
  function renderGuide(d, col) {
    const box = $('#guide');
    if (!isEia(d) || !window.MazGuide) { box.hidden = true; return; }
    if (MazGuide.isG3(d.g.text)) {                     // a MAZATROL program written in the three-digit G-format
      const h = MazGuide.g3(eiaLine(d, d.g.curLine));
      if (!h) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = `<div class="gd-t"><b>${esc(h.title)}</b> <span class="tw-dim">· three-digit G-format: a MAZATROL program written as text (units G3xx; tool lines between G424 and G425, shapes G420–G421, TPC G422–G423)</span></div>`;
      return;
    }
    const vars = varItems(eiaLine(d, d.g.curLine), d.g.type);
    if (d.g.type !== 'mill') {                           // lathes / mill-turn: what each G- and M-code of the block is
      const ws = MazGuide.words(eiaLine(d, d.g.curLine)).filter(w => w[0] === 'G' || w[0] === 'M');
      if (!ws.length && vars) { box.hidden = false; box.innerHTML = '<div class="gd-t"><b>Macro variables</b></div><div class="gd-w">' + vars + '</div>'; return; }
      if (!ws.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = `<div class="gd-t"><b>${esc(ws.map(([L, v]) => L + v + ' ' + (codeTitle(L, v) || '?')).join(' · '))}</b> <span class="tw-dim">· ${esc(MazRef.MACHINE[d.g.type] || '')}</span></div>` +
        '<div class="gd-w">' + codeItems(ws.map(w => [w[0], w[1]]), '') + vars + '</div>';
      return;
    }
    const st = lineStarts(d), k = d.g.curLine, lines = [];
    for (let i = Math.max(0, k - 400); i <= k; i++) lines.push(eiaLine(d, i));
    const g = MazGuide.guide(lines, lines.length - 1, col);
    const ms = MazGuide.words(lines[lines.length - 1]).filter(w => w[0] === 'M' && !(g.code && g.code === 'M' + String(parseFloat(w[1])).padStart(2, '0')));
    if (!g.title && !ms.length && !vars) { box.hidden = true; return; }
    box.hidden = false;
    const mAt = g.at === 'M' && ms.length ? 'M' + ms[0][1] : '';
    box.innerHTML = `<div class="gd-t"><b>${esc(g.title || ms.map(([, v]) => 'M' + String(parseFloat(v)).padStart(2, '0') + ' ' + codeTitle('M', v)).join(' · ') || 'Macro variables')}</b>${g.note ? ` <span class="tw-dim">· ${esc(g.note)}</span>` : ''}</div>` +
      '<div class="gd-w">' + g.items.map(it => `<span class="gd-i${it.missing ? ' miss' : ''}${it.L === g.at ? ' at' : ''}${it.value !== '' ? ' set' : ''}" title="${esc(it.desc)}">` +
        `<b>${it.L}</b>${it.value !== '' ? esc(it.value) + diaPill(it.L, it.value, it.desc) : it.need ? '<i>?</i>' : ''}<small>${esc(it.desc)}${it.missing ? ' — missing' : it.need || it.extra || it.value !== '' ? '' : ' (optional)'}</small></span>`).join('') + codeItems(ms, mAt) + vars + '</div>';
  }
  // M-codes and G-codes as guidance items: what each one does (G from the G list, M from the machine's M list)
  const codeTitle = (L, v) => {
    if (!window.MazRef) return '';
    const n = parseFloat(v);
    if (!isFinite(n)) return '';
    const code = L + (String(n).includes('.') ? String(n).replace(/^(\d)\./, '0$1.') : String(n).padStart(2, '0'));
    const x = (L === 'G' ? MazRef.G_FOR(mtype(doc())) : MazRef.M_FOR(mtype(doc()))).find(c => c[0].split('/').includes(code));
    return x ? x[1] : '';
  };
  // a radius in a guide pill gets its diameter beside it: values written R0.2 (corners, polar points; not the hole
  // pattern's R return field), fields the guide calls a radius (arc, circle, nose, cut depth per side), polar radii
  function diaPill(L, v, desc, arc) {
    const val = String(v == null ? '' : v).trim(), d = String(desc || '');
    if (/angle/i.test(d) && !arc) return '';            // a radius or an angle (R/th): a radius only on an arc line
    let num = null;
    const m = /^R\s*(-?\d*\.?\d+)\.?$/i.exec(val);
    if (m && L !== 'R') num = +m[1];
    else if (/^-?\d*\.?\d+\.?$/.test(val) && ((/\bradius\b/i.test(d) && !/offset number|another value/i.test(d)) || /^(SPT-R|RADIUS)$/.test(L))) num = parseFloat(val);
    if (num === null || !Number.isFinite(num) || num === 0) return '';
    return `<i class="gd-dia" title="as a diameter">Ø${+(2 * Math.abs(num)).toFixed(5)}</i>`;
  }
  // an M-code field: headed M (tool lines) or M1 ... M12 (M-CODE unit). Other lines have columns headed M that are
  // counts (a hole pattern's M), not M-codes.
  function isMField(L, k) {
    const lay = L && L.lay;
    if (!lay || !lay.cells[k] || !/^M\d*$/.test(Maz.cellLabel(lay, k))) return false;
    const c = L.sel.code;
    return L.sel.unit ? c === 7 : c >= 0xb0 && c <= 0xb5;
  }
  const codeItems = (ws, at) => ws.map(([L, v]) => { const t = codeTitle(L, v); return `<span class="gd-i set${at === L + v ? ' at' : ''}"><b>${L}</b>${esc(v)}<small>${esc(t || 'not in this machine\'s list')}</small></span>`; }).join('');
  // the same box for a Mazatrol program: on a MANL PRG line, the block's G-code format (as for EIA) and its M-code;
  // on an M field (tool lines, M-CODE unit), what each M-code on the line does
  function renderMazGuide(d) {
    const box = $('#guide');
    box.hidden = true;
    if (d && d.t && d.sel.r >= 0 && window.MazHelp) {    // a tool data line
      const L = ctx(d)[d.sel.r];
      if (!L || !L.lay) return;
      const fields = L.lay.cells.map((x, k) => ({ label: Maz.cellLabel(L.lay, k), value: Maz.cellText(L, k, { units: d.units }).trim(), at: k === d.sel.c }));
      const toolF = fields.find(f => f.label === 'Tool'), h = MazHelp.explainToolData({ fields, tool: toolF && toolF.value, turnTool: d.t.type !== 'mill' && !/MILL|DRILL|TAP|CHAMF|REAM|BOR|CTR/.test(toolF ? toolF.value : '') || /T-DRILL|GNL|GRV|THR/.test(toolF ? toolF.value : '') });
      if (!h.items.length) return;
      box.hidden = false;
      box.innerHTML = `<div class="gd-t"><b>${esc(h.title)}</b></div>` + (h.detail ? `<div class="gd-d">${esc(h.detail)}</div>` : '') +
        '<div class="gd-w">' + h.items.map(it => `<span class="gd-i${it.at ? ' at' : ''}${it.value ? ' set' : ''}" title="${esc(it.L + ': ' + it.desc)}"><b>${esc(it.L)}</b>${esc(it.value)}${diaPill(it.L, it.value, it.desc)}<small>${esc(it.desc)}</small></span>`).join('') + '</div>';
      return;
    }
    if (!isProg(d) || d.sel.r < 0 || !window.MazGuide) return;
    const ls = ctx(d), L = ls[d.sel.r], lay = L && L.lay, c = d.sel.c;
    if (!lay) return;
    const label = c >= 0 && lay.cells[c] ? Maz.cellLabel(lay, c) : '';
    if (L.sel.code === 0xa1 && C(d).type !== 'mill') {
      const ws = MazGuide.words(manlWords(L, d.units)).filter(w => w[0] === 'G' || w[0] === 'M');
      if (!ws.length) return;
      box.hidden = false;
      box.innerHTML = `<div class="gd-t"><b>${esc(ws.map(([X, v]) => X + v + ' ' + (codeTitle(X, v) || '?')).join(' · '))}</b> <span class="tw-dim">· ${esc(manlWords(L, d.units))}</span></div>` +
        '<div class="gd-w">' + codeItems(ws.map(w => [w[0], w[1]]), '') + '</div>';
      return;
    }
    if (L.sel.code === 0xa1) {
      // the MANL PRG lines of this unit up to the cursor (a cycle or G-code stays on from earlier lines)
      const u = unitOf(d, d.sel.r), mine = u.seqs.filter(i => i <= d.sel.r && ls[i].lay && ls[i].sel.code === 0xa1);
      const lines = mine.map(i => manlWords(ls[i], d.units));
      const at = c <= 1 ? 'G' : c >= 15 ? 'M' : c === 14 ? 'S' : (cellOut(L, 2 + 2 * Math.floor((c - 2) / 2), d.units) || '').toUpperCase();
      const g = MazGuide.guide(lines, lines.length - 1, -1), ws = MazGuide.words(lines[lines.length - 1] || '');
      const gs = ws.filter(w => w[0] === 'G'), ms = ws.filter(w => w[0] === 'M');
      if (!g.title && !gs.length && !ms.length) return;
      const title = g.title || gs.map(([, v]) => 'G' + v + ' ' + codeTitle('G', v)).join(' · ') || 'MANL PRG';
      box.hidden = false;
      box.innerHTML = `<div class="gd-t"><b>${esc(title)}</b>${g.note ? ` <span class="tw-dim">· ${esc(g.note)}</span>` : ''} <span class="tw-dim">· ${esc(lines[lines.length - 1])}</span></div>` +
        '<div class="gd-w">' + (g.title && gs.length > 1 ? codeItems(gs.filter(([, v]) => g.code !== 'G' + Math.round(parseFloat(v) * 10) / 10), '') : '') +
        g.items.map(it => `<span class="gd-i${it.missing ? ' miss' : ''}${it.L === at ? ' at' : ''}${it.value !== '' ? ' set' : ''}" title="${esc(it.desc)}">` +
          `<b>${it.L}</b>${it.value !== '' ? esc(it.value) + diaPill(it.L, it.value, it.desc) : it.need ? '<i>?</i>' : ''}<small>${esc(it.desc)}${it.missing ? ' — missing' : it.need || it.extra || it.value !== '' ? '' : ' (optional)'}</small></span>`).join('') +
        (g.title ? '' : codeItems(gs, '')) + codeItems(ms, at === 'M' ? 'M' + (ms[0] || [])[1] : '') + '</div>';
      return;
    }
    if (isMField(L, c) && window.MazRef) {
      // every M field on the line, the one at the cursor marked
      const ms = [];
      lay.cells.forEach((x, k) => {
        if (!isMField(L, k) || Maz.locked(L, k)) return;
        const v = cellOut(L, k, d.units);
        if (/^\d+$/.test(v)) ms.push(['M', v, k]);
      });
      if (!ms.length) return;
      const cur = ms.find(m => m[2] === c);
      box.hidden = false;
      box.innerHTML = `<div class="gd-t"><b>${cur ? esc('M' + cur[1].padStart(2, '0') + ' ' + (codeTitle('M', cur[1]) || '')) : 'M-codes on this line'}</b> <span class="tw-dim">· ${esc(MazRef.M_NOTES_FOR(mtype(d)))}</span></div>` +
        '<div class="gd-w">' + codeItems(ms.map(m => [m[0], m[1]]), cur ? 'M' + cur[1] : '') + '</div>';
      return;
    }
    // any other line: what the unit, tool line, hole pattern or common unit is, field by field (help.js)
    if (!window.MazHelp) return;
    const turn = C(d).type !== 'mill';
    const u = unitOf(d, d.sel.r), code = L.sel.code, uname = unitName(d.p.ctl, u.code);
    const kind = L.sel.unit ? (u.code === 1 ? 'common' : 'unit') : code >= 0xb0 && code <= 0xb5 ? 'tool' : code === 0xc0 && !turn ? 'point'
      : turn && ((code >= 0xa8 && code <= 0xad) || code === 0xb8) ? 'tshape' : '';
    if (!kind) {
      // lines with no explanation of their own (C-axis and Y-axis hole and shape lines of lathes and mill-turn ...):
      // each field with its value and the control's prompt for it, radii with their diameter
      if (isTpc(L)) return;
      const items = [];
      lay.cells.forEach((x, k) => {
        const lab = Maz.cellLabel(lay, k), v = Maz.cellText(L, k, { units: d.units }).trim();
        if (!lab || (k !== c && (v === '' || v === '<>'))) return;
        let desc = Maz.prompt(x).replace(/\s*<[^>]*>/g, '').trim();
        // a borrowed layout (MazEdit has none for the record) keeps its neighbour's prompts: drop one that names
        // another axis than the field's own (X shown with "Final point-Z")
        const ax = /(?:point|coordinate)[- ]([XYZC])\b/i.exec(desc);
        if (ax && !lab.toUpperCase().includes(ax[1].toUpperCase())) desc = '';
        items.push({ L: lab, value: v, desc, at: k === c });
      });
      const arcLine = items.some(it => it.L === 'PTN' && /^(CW|CCW)$/.test(it.value));
      const circle = items.some(it => it.L === 'PTN' && /^CIR/.test(it.value));
      for (const it of items) {
        if (/^R\/[0θ]$/.test(it.L) && !it.desc) it.desc = arcLine ? 'arc radius' : 'angle';
        if (/\/R$/.test(it.L) && /^P3/.test(it.L)) it.desc = circle ? 'circle radius' : 'corner 3';      // P3X/R: corner 3, or a circle's radius
      }
      if (!items.length) return;
      const what = Maz.unitName(d.p.ctl, u.code) + ' · ' + (code === 0xc0 || code === 0x1c0 || (code >= 0x2b8 && code <= 0x2bf) ? 'hole line ' : 'line ') + Maz.number(L.rec);
      box.hidden = false;
      box.innerHTML = `<div class="gd-t"><b>${esc(what)}</b></div>` +
        '<div class="gd-w">' + items.map(it => `<span class="gd-i${it.at ? ' at' : ''}${it.value !== '' ? ' set' : ''}" title="${esc(it.L + ': ' + it.desc)}"><b>${esc(it.L)}</b>${esc(it.value)}${diaPill(it.L, it.value, it.desc, arcLine)}${it.desc ? `<small>${esc(it.desc)}</small>` : ''}</span>`).join('') + '</div>';
      return;
    }
    let fields = lay.cells.map((x, k) => ({ label: Maz.cellLabel(lay, k), value: cellOut(L, k, d.units), off: x[0], at: k === c, locked: !!Maz.locked(L, k) })).filter(f => !f.locked || f.at);
    if (kind !== 'point') {                                  // one item per label (a field can be two cells)
      const by = new Map();
      for (const f of fields) { const o = by.get(f.label); if (o) { o.value = [o.value, f.value].filter(Boolean).join(' '); o.at = o.at || f.at; } else by.set(f.label, Object.assign({}, f)); }
      fields = [...by.values()];
    }
    const tool = kind === 'tool' ? (fields.find(f => f.label === 'TOOL') || {}).value : '';
    const h = MazHelp.explain({ kind, unit: uname, tool, fields, ptn: L.rec[8], turn });
    if (!h) return;
    let svg = '';
    if (!turn && window.MazRef && MazRef.turnDrawing && kind !== 'point') {   // mill: drawings for some fields
      const curF = fields.find(f => f.at), lab = curF ? curF.label : '';
      const key = kind === 'common' ? (/^(INITIAL-Z|PITCH-X|PITCH-Y|MULTI)$/.test(lab) ? 'MCOMMON:' + lab : 'MCOMMON:INITIAL-Z')
        : kind === 'unit' && /^(START|END)$/.test(lab) ? 'OC:' + lab : kind === 'tool' && /^APRCH/.test(lab) ? 'APRCH' : '';
      const pic = key ? MazRef.turnDrawing(key) : null;
      if (pic) svg = '<div class="gd-pic gd-pic-w" title="' + esc(pic.cap) + '">' + pic.svg + '<small>' + esc(pic.cap) + '</small></div>';
    }
    if (turn && window.MazRef && MazRef.turnDrawing) {   // lathe / mill-turn: a drawing of the field at the cursor (or the unit's part)
      const curF = fields.find(f => f.at), lab = curF ? curF.label : '', valOf = l => (fields.find(f => f.label === l) || {}).value || '';
      const pnum = v => (/(\d)/.exec(v || '') || [])[1];
      let key = '';
      if (kind === 'common') key = 'COMMON:' + (lab || 'OD-MAX');
      else if (kind === 'unit') {
        if (lab === 'MODE' || (/^(DRILLING|RGH|REAM|TAPP|CIRC|LINE|CHMF|FCE|POCKET|PCKT|SLOT|STEP|TOP|BORE|BK|CBOR)/.test(uname) && valOf('MODE'))) key = 'MODE:' + valOf('MODE').replace(/[[\]*]/g, '');
        else if (uname === 'T.GROOVE' && lab === 'PAT') key = 'GRV#' + (pnum(valOf('PAT')) || 0);
        else if (/^CPT-/.test(lab)) key = 'INFEED:CPT';
        else if (/^FIN-[XZ]$/.test(lab)) key = 'INFEED:' + lab;
        else if (valOf('PART')) key = 'PART:' + valOf('PART').replace('*', '');
      } else if (kind === 'tool') {
        const pv = pnum(valOf('PAT.'));
        if (/^(BAR|CPY|CORNER|FACING)$/.test(uname) && pv !== undefined) key = 'BAR#' + pv;
        else if (uname === 'THREAD') key = 'THR#' + (pv || 0);
        else if (uname === 'T.DRILL' && pv !== undefined) key = 'DRL#' + pv;
        else if (uname === 'T.GROOVE') { const u0 = ctx(d)[unitOf(d, d.sel.r).i]; const k0 = u0.lay ? u0.lay.cells.findIndex((x, j) => Maz.cellLabel(u0.lay, j) === 'PAT') : -1; key = 'GRV#' + (pnum(k0 >= 0 ? Maz.cellText(u0, k0, {}) : '') || 0); }
      }
      const pic = key ? MazRef.turnDrawing(key) : null;
      if (pic) svg = '<div class="gd-pic gd-pic-w" title="' + esc(pic.cap) + '">' + pic.svg + '<small>' + esc(pic.cap) + '</small></div>';
    }
    if (kind === 'point' && window.Plot) {
      try {
        const S = d.units === 'metric' ? 1e-4 : 1e-5, Lr = (rr, o) => { const v = rr[o] | (rr[o + 1] << 8) | (rr[o + 2] << 16) | (rr[o + 3] << 24); return v * S; };
        const pts = Plot.holes(L.rec, Lr, true), pat = L.rec[8];
        svg = MazHelp.patternSvg(pts, pat >= 5 ? { centre: [Lr(L.rec, 40), Lr(L.rec, 44)], r: Lr(L.rec, 56) } : { noLine: pat === 3 || pat === 4 });
      } catch (e) { svg = ''; }
    }
    box.hidden = false;
    box.innerHTML = (svg ? (/^<div class="gd-pic/.test(svg) ? svg : '<div class="gd-pic">' + svg + '<small>blue = first · hollow = skipped</small></div>') : '') +
      `<div class="gd-t"><b>${esc(h.title)}</b></div>` + (h.detail ? `<div class="gd-d">${esc(h.detail)}</div>` : '') +
      '<div class="gd-w">' + h.items.map(it => `<span class="gd-i${it.at ? ' at' : ''}${it.value !== '' ? ' set' : ''}" title="${esc(it.L + ': ' + (it.desc || ''))}"><b>${esc(it.L)}</b>${esc(it.value)}${diaPill(it.L, it.value, it.desc, h.items.some(x => x.L === 'PTN' && /^(CW|CCW)/.test(x.value)))}${it.desc ? `<small>${esc(it.desc)}</small>` : ''}</span>`).join('') + '</div>';
  }
  function renderWhere() {
    const d = doc();
    if (!isEia(d)) return;
    const col = el.gtext.selectionStart - lineStarts(d)[d.g.curLine];
    renderGuide(d, col);
    el.where.textContent = `Line ${d.g.curLine + 1} of ${lineStarts(d).length}` + (col >= 0 ? `, col ${col + 1}` : '');
  }
  // lines of an EIA text with every word of the query
  function searchText(text, query) {
    const words = query.toUpperCase().split(/\s+/).filter(Boolean), out = [];
    if (!words.length) return out;
    const lines = text.split(/\r\n?|\n/);
    lines.forEach((l, i) => { const u = l.toUpperCase(); if (words.every(w => u.includes(w))) out.push({ i, text: l }); });
    return out;
  }

  // ------------------------------------------------------------------ files
  const EXTS = Object.values(Maz.CONTROLS).flatMap(c => [c.ext].concat(c.exts || [], c.raw ? [c.raw] : [])).concat(['DBD', 'DBM'], EIA_EXTS);
  const PICK_TYPES = [{ description: 'Mazatrol and EIA programs, tool data', accept: { 'application/octet-stream': EXTS.map(e => '.' + e.toLowerCase()) } }];
  async function openFiles() {
    if (window.showOpenFilePicker) {
      try {
        const hs = await window.showOpenFilePicker({ multiple: true, types: PICK_TYPES });
        for (const h of hs) await openHandle(h);
      } catch (e) { if (e.name !== 'AbortError') note(e.message); }
    } else el.fileInput.click();
  }
  async function openHandle(h) {
    for (let k = 0; k < docs.length; k++) {
      if (docs[k].handle && await docs[k].handle.isSameEntry(h)) { cur = k; render(); return note(h.name + ' is already open'); }
    }
    const f = await h.getFile();
    openBytes(new Uint8Array(await f.arrayBuffer()), f.name, h);
  }
  function openBytes(bytes, name, handle, type) {
    if (isEiaName(name)) { addDoc(makeEiaDoc(latin1(bytes), name, handle, type)); return; }
    if (Maz.isMachineMemory(name, bytes)) {
      let t;
      try { t = Maz.parseMachineMemory(bytes, name); } catch (e) { return note(name + ': ' + e.message); }
      const md = makeToolDoc(t, null);
      md.src = bytes;
      addDoc(md);
      return note('Tool data from a machine\'s control memory (' + TOOL_TYPE_LABEL[t.type] + '), shown read-only.', true);
    }
    if (Maz.isToolFile(name)) {
      let t;
      try { t = Maz.parseToolFile(bytes, name, store.get('mazed-tooltype', 'mill')); } catch (e) { return note(name + ': ' + e.message); }
      return addDoc(makeToolDoc(t, handle));
    }
    let p;
    try { p = Maz.parse(bytes, name); } catch (e) { return note(name + ': ' + e.message); }
    addDoc(makeDoc(p, handle));
  }
  // tool data: the machine type picks the layout (edits are kept)
  function setToolType(type) {
    const d = doc();
    if (isEia(d)) { if (d.g.type !== type) { d.g.type = type; d.view = null; d.plotView = null; render(); } return; }
    if (!isTool(d) || d.t.type === type) return;
    if (readOnly(d) || !editing) { Maz.setToolType(d.t, type); d.ls = null; d.sel = { r: 0, c: -1, a: null }; }
    else edit(d => { Maz.setToolType(d.t, type); d.sel = { r: 0, c: -1, a: null }; });
    d.sel.c = firstCell(d, 0);
    if (!readOnly(d)) store.set('mazed-tooltype', type);
    render();
  }
  function newProgram(ctl) {
    newCount++;
    editing = true;
    addDoc(makeDoc(Maz.newProgram(ctl, 'NEW' + newCount)));
    note('New ' + Maz.CONTROLS[ctl].label + ' program. Add units with Insert unit.', true);
  }
  function download(bytes, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: type || 'application/octet-stream' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function writeHandle(h, bytes) {
    if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission to write the file was not given');
    }
    const w = await h.createWritable();
    await w.write(bytes);
    await w.close();
  }
  async function pickSave(name, ctl, d, raw) {
    if (d && d.g) return window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'EIA/ISO program', accept: { 'text/plain': ['.' + C(d).ext.toLowerCase()] } }] });
    const K = d && d.t ? C(d) : Maz.CONTROLS[ctl];
    const ext = raw ? K.raw : K.ext;
    return window.showSaveFilePicker({ suggestedName: name, types: [{ description: K.label + (d && d.t ? '' : raw ? ' machine program' : ' program'), accept: { 'application/octet-stream': ['.' + ext.toLowerCase()] } }] });
  }
  async function save() {
    const d = doc();
    if (!d) return;
    if (readOnly(d)) return note(READ_ONLY);
    const bytes = d.g ? latin1Bytes(d.g.text.replace(/\n/g, d.g.eol)) : d.t ? Maz.serializeToolFile(d.t) : Maz.serialize(d.p);
    if (d.handle && d.handle.createWritable) {
      try { await writeHandle(d.handle, bytes); return saved(d, 'Saved ' + d.p.name); }
      catch (e) { if (e.name === 'AbortError') return; note('Could not write ' + d.p.name + ' (' + e.message + ').'); }
    }
    if (window.showSaveFilePicker) {
      try {
        const h = await pickSave(d.p.name, d.p.ctl, d, !d.t && d.p.raw);
        await writeHandle(h, bytes);
        d.handle = h; d.p.name = h.name;
        if (d.t) d.t.name = h.name;
        return saved(d, 'Saved ' + h.name);
      } catch (e) { if (e.name === 'AbortError') return; note(e.message + ' — downloading instead.'); }
    }
    download(bytes, d.p.name);
    saved(d, 'Downloaded ' + d.p.name);
  }
  function saved(d, text) { d.dirty = false; render(); note(text, true); }
  // raw: save as the control's own program file (.MAZ .MTP .MPR), which has no header and so no comment
  async function saveAs(ctl, raw) {
    const d = doc();
    if (!d) return;
    if (isTool(d)) return note('Tool data is saved in its own format; use Save');
    if (isEia(d)) return note('Use Save for an EIA program');
    let p;
    try {
      p = ctl === d.p.ctl ? { ctl, name: d.p.name, header: d.p.header.slice(), recs: d.p.recs.map(r => r.slice()), warnings: [] } : Maz.convert(d.p, ctl);
    } catch (e) { return note(e.message); }
    const K = Maz.CONTROLS[ctl];
    p.name = p.name.replace(/\.[^.]*$/, '') + '.' + (raw ? K.raw : K.ext);
    if (raw) p.raw = true;
    const bytes = Maz.serialize(p);
    let handle = null;
    if (window.showSaveFilePicker) {
      try {
        handle = await pickSave(p.name, ctl, null, raw);
        await writeHandle(handle, bytes);
        p.name = handle.name;
      } catch (e) { if (e.name === 'AbortError') return; note(e.message + ' — downloading instead.'); handle = null; download(bytes, p.name); }
    } else download(bytes, p.name);
    const warnings = p.warnings;
    const nd = makeDoc(p, handle);
    nd.units = d.units;
    nd.sel = Object.assign({}, d.sel, { a: null });
    p.warnings = [];
    docs.push(nd); cur = docs.length - 1;
    render();
    const w = (ctl === d.p.ctl ? [] : ['Converted to ' + Maz.CONTROLS[ctl].label + ' (' + p.name + ').']).concat(warnings);
    if (raw && Maz.comment(d.p).trim()) w.push('A ' + K.raw + ' file has no room for the program comment; it was left out.');
    note(w.join(' '), warnings.length === 0);
  }
  function closeDoc(k) {
    const d = docs[k];
    if (d.dirty && !confirm(d.p.name + ' has unsaved changes. Close it anyway?')) return;
    docs.splice(k, 1);
    if (cur >= docs.length) cur = docs.length - 1;
    render();
  }

  // ------------------------------------------------------------------ session
  // The open files (with their unsaved changes), the tab at front and the opened folder are kept in this browser
  // (IndexedDB), so a refresh opens them again. File handles are kept too: Save still writes back into the file
  // (the browser asks for permission again). Undo history is not kept.
  const SESSION = { db: null, timer: 0, cache: new WeakMap(), restoring: true, ok: false, dir: null };
  function sessionDb() {
    return SESSION.db || (SESSION.db = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      const q = indexedDB.open('mazed-session', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    }));
  }
  async function sessionGet(k) {
    const db = await sessionDb();
    return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function sessionPut(k, v) {
    const db = await sessionDb();
    return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  }
  // a document as it is now (serialized again only after a change)
  function sessionRow(d) {
    const c = SESSION.cache.get(d);
    let v = c && c.rev === d.rev ? c.v : null;
    if (!v) {
      v = d.g ? { kind: 'eia', text: d.g.text.replace(/\n/g, d.g.eol), type: d.g.type }
        : d.src ? { kind: 'memory', bytes: d.src }
        : d.t ? { kind: 'tool', bytes: Maz.serializeToolFile(d.t), type: d.t.type }
        : { kind: 'prog', bytes: Maz.serialize(d.p) };
      SESSION.cache.set(d, { rev: d.rev, v });
    }
    return Object.assign({ name: d.p.name, handle: d.handle || null, dirty: d.dirty, units: d.units, sel: { r: d.sel.r, c: d.sel.c } }, v);
  }
  function sessionSave(now) {
    if (SESSION.restoring) return;
    clearTimeout(SESSION.timer);
    const go = () => {
      let rows;
      try { rows = docs.map(sessionRow); } catch (e) { return; }
      sessionPut('docs', { rows, cur })
        .catch(() => sessionPut('docs', { rows: rows.map(r => Object.assign({}, r, { handle: null })), cur }))   // a handle that will not store
        .then(() => { SESSION.ok = true; }, () => { SESSION.ok = false; });
    };
    if (now) go(); else SESSION.timer = setTimeout(go, 300);
  }
  async function sessionRestore() {
    try {
      const s = await sessionGet('docs');
      for (const r of (s && s.rows) || []) {
        let d;
        try {
          if (r.kind === 'eia') d = makeEiaDoc(r.text, r.name, r.handle, r.type);
          else if (r.kind === 'memory') { d = makeToolDoc(Maz.parseMachineMemory(r.bytes, r.name), null); d.src = r.bytes; }
          else if (r.kind === 'tool') d = makeToolDoc(Maz.parseToolFile(r.bytes, r.name, r.type), r.handle);
          else d = makeDoc(Maz.parse(r.bytes, r.name), r.handle);
        } catch (e) { continue; }
        d.dirty = !!r.dirty;
        if (r.units) d.units = r.units;
        if (r.sel && !d.g && r.sel.r < ctx(d).length) { d.sel.r = r.sel.r; d.sel.c = r.sel.c; }
        docs.push(d);
      }
      if (docs.length) cur = Math.min(Math.max(0, (s && s.cur) | 0), docs.length - 1);
      const dir = await sessionGet('folder');
      if (dir && dir.queryPermission) {
        if ((await dir.queryPermission({ mode: 'read' })) === 'granted') await readDir(dir, true);
        else SESSION.dir = dir;
      }
    } catch (e) { /* nothing kept, or storage is off */ }
    SESSION.restoring = false;
    SESSION.ok = true;
    render();
    if (docs.length) note('Reopened ' + docs.length + ' file' + (docs.length > 1 ? 's' : '') + ' from before' + (SESSION.dir ? '; PROGRAM FILE opens the folder ' + SESSION.dir.name + ' again' : '') + '.', true);
    else if (SESSION.dir) note('PROGRAM FILE opens the folder ' + SESSION.dir.name + ' again.', true);
  }

  // ------------------------------------------------------------------ print listing
  function listing(d) {
    if (isEia(d)) return `EIA/ISO PROGRAM  ${d.p.name}    ${C(d).label}    ${new Date().toISOString().slice(0, 10)}\n\n` + d.g.text + '\n';
    const K = C(d), out = [];
    out.push(`MAZATROL ${d.t ? (d.t.tool === 'TOOLDATA' ? 'TOOL DATA' : 'TOOL FILE') : 'PROGRAM'}  ${d.p.name}    ${K.label}    ${d.units === 'metric' ? 'mm' : 'inch'}    ${new Date().toISOString().slice(0, 10)}`);
    const cm = d.t ? '' : Maz.comment(d.p);
    if (cm) out.push('COMMENT  ' + cm);
    for (const row of rows(d)) {
      if (row.t === 'gap') out.push('');
      else if (row.t === 'head') out.push(row.text);
      else if (row.t === 'rec') out.push(recLine(d, row.r, true).ch.join('').replace(/\s+$/, ''));
    }
    return out.join('\n') + '\n';
  }
  function printListing() {
    const d = doc();
    if (!d) return;
    el.printArea.textContent = listing(d);
    window.print();
  }
  function saveListing() {
    const d = doc();
    if (!d) return;
    download(listing(d).replace(/\n/g, '\r\n'), d.p.name.replace(/\.[^.]*$/, '') + '.txt', 'text/plain');
  }

  // one side panel at a time: the plot, the tools or the comparison
  function side(which) {
    plotOn = which === 'plot'; toolsOn = which === 'tools'; cmpOn = which === 'compare'; folderOn = which === 'folder';
    store.set('mazed-plot', plotOn); store.set('mazed-tools', toolsOn);
    renderPlot(); renderTools(); renderCompare(); renderFolder();
  }

  // ------------------------------------------------------------------ folders
  // A folder of programs: a machine's data folder from Smooth CAM Ai, its MC_Machine Programs, or the folder of
  // all machines (C:\Users\Public\Documents\MAZATROL\Smooth). A machine is a folder with a machine memory
  // (m8ysram) or a TOOLDATA file; its programs are checked against it. index.tbl gives the comments.
  const PROGRAM_EXT = new RegExp('\\.(' + Object.values(Maz.CONTROLS).flatMap(c => [c.ext].concat(c.exts || [], c.raw ? [c.raw] : [])).join('|') + ')$', 'i');
  const folderWanted = name => PROGRAM_EXT.test(name) || isEiaName(name) || /^m8ysram$/i.test(name) || /^index\.tbl$/i.test(name) || /^TOOLDATA[^\\/]*\.DB[A-Z]$/i.test(name);
  // descend: everything at the top, then only into a machine's program folder
  const folderDescend = (name, depth) => depth === 0 || (depth === 1 && /^MC_Machine Programs$/i.test(name));
  async function openFolder() {
    if (!window.showDirectoryPicker) return el.dirInput.click();
    try {
      const dir = await window.showDirectoryPicker();
      await readDir(dir);
      sessionPut('folder', dir).catch(() => {});
    } catch (e) { if (e.name !== 'AbortError') note(e.message); }
  }
  // PROGRAM FILE: the folder open before a refresh (the browser asks to read it again), else pick one
  async function reopenFolder() {
    const dir = SESSION.dir;
    if (!dir || !dir.requestPermission) return openFolder();
    try {
      if ((await dir.requestPermission({ mode: 'read' })) !== 'granted') return openFolder();
      SESSION.dir = null;
      await readDir(dir);
    } catch (e) { note(e.message); }
  }
  async function readDir(dir, quiet) {
    {
      const entries = [];
      const walk = async (h, prefix, depth) => {
        for await (const [name, x] of h.entries()) {
          if (x.kind === 'file') { if (folderWanted(name)) entries.push({ name, path: prefix + name, handle: x }); }
          else if (folderDescend(name, depth)) await walk(x, prefix + name + '/', depth + 1);
        }
      };
      await walk(dir, '', 0);
      await loadFolder(dir.name, entries, quiet);
    }
  }
  const dirOf = path => path.slice(0, path.lastIndexOf('/') + 1);
  async function loadFolder(name, entries, quiet) {
    const f = { name, machines: [], programs: [], index: {} };
    note('Reading ' + entries.length + ' files…', true);
    const progs = [];
    for (const e of entries) {
      const file = e.handle ? await e.handle.getFile() : e.file;
      const bytes = new Uint8Array(await file.arrayBuffer()), dir = dirOf(e.path);
      if (/^index\.tbl$/i.test(e.name)) {
        f.index[dir] = Object.assign(f.index[dir] || {}, Maz.parseIndexTbl(new TextDecoder('latin1').decode(bytes)));
      } else if (Maz.isMachineMemory(e.name, bytes) || Maz.isToolFile(e.name)) {
        let t = null;
        try { t = Maz.isMachineMemory(e.name, bytes) ? Maz.parseMachineMemory(bytes, e.name) : Maz.parseToolFile(bytes, e.name, store.get('mazed-tooltype', 'mill')); } catch (err) { /* not usable */ }
        if (t && t.tool === 'TOOLDATA' && !f.machines.some(m => m.prefix === dir)) {
          const mname = dir ? dir.replace(/\/$/, '').split('/').pop() : name;
          f.machines.push({ name: mname, prefix: dir, path: e.path, t, mts: Maz.machineTools(t) });
        }
      } else if (isEiaName(e.name)) {
        progs.push({ name: e.name, path: e.path, handle: e.handle || null, bytes, eia: true, text: latin1(bytes) });
      } else {
        try { progs.push({ name: e.name, path: e.path, handle: e.handle || null, bytes, p: Maz.parse(bytes, e.name) }); } catch (err) { /* not a program */ }
      }
    }
    // a program belongs to the machine whose folder holds it (the longest matching folder)
    f.machines.sort((x, y) => x.name.localeCompare(y.name));
    for (const e of progs) {
      e.m = f.machines.filter(m => e.path.startsWith(m.prefix)).sort((x, y) => y.prefix.length - x.prefix.length)[0] || null;
      e.comment = (f.index[dirOf(e.path)] || {})[e.name.toUpperCase()] || (e.eia ? GCode.commentOf(e.text.slice(0, 400).split(/\r?\n|\r/).find(l => /\(/.test(l)) || '') : e.p.raw ? '' : Maz.comment(e.p));
    }
    f.programs = progs.sort((x, y) => (x.m ? x.m.name : '~').localeCompare(y.m ? y.m.name : '~') || x.path.localeCompare(y.path));
    folder = f;
    if (quiet) return renderFolder();
    side('folder');
    note(`${progs.length} programs in ${name}` + (f.machines.length ? `, ${f.machines.length} machine${f.machines.length > 1 ? 's' : ''} with tool data` : ''), true);
  }
  // a program's tool check against a machine (cached per units)
  function machineCheck(e, m, units) {
    if (!m || e.eia || Maz.CONTROLS[e.p.ctl].type !== m.t.type) return null;
    e.checks = e.checks || new Map();
    const key = m.path + '|' + units;
    if (!e.checks.has(key)) {
      const res = Maz.programTools(e.p, units).map(pt => Maz.checkTool(pt, m.mts).status);
      e.checks.set(key, { n: res.length, missing: res.filter(x => x === 'missing').length, suffix: res.filter(x => x === 'suffix').length });
    }
    return e.checks.get(key);
  }
  const checkHtml = c => !c ? '' : c.missing ? `<span class="ck bad">✗ ${c.missing} missing${c.suffix ? ', ' + c.suffix + ' other suffix' : ''} of ${c.n} tools</span>`
    : c.suffix ? `<span class="ck warn">≠ ${c.suffix} other suffix of ${c.n} tools</span>` : `<span class="ck ok">✓ ${c.n} tools</span>`;
  function renderFolder() {
    el.folderSide.hidden = !folderOn;
    if (!folderOn) return;
    if (!folder) {
      el.folderName.textContent = '';
      el.folderInfo.textContent = 'Open a folder of programs with Open folder.';
      el.folderList.innerHTML = '';
      return;
    }
    const q = el.folderSearch.value.trim(), units = store.get('mazed-units', 'inch');
    const key = q + '|' + units + '|' + folder.programs.length;
    if (folder.renderKey === key) return;
    folder.renderKey = key;
    el.folderName.textContent = folder.name;
    const groups = folder.machines.length > 1 || (folder.machines.length > 0 && folder.programs.some(e => !e.m));
    let html = '', shown = 0, lines = 0, group;
    for (const [k, e] of folder.programs.entries()) {
      let hits = null;
      if (q) {
        const ck = q + '|' + units;
        hits = e.hits && e.hitsKey === ck ? e.hits : (e.hitsKey = ck, e.hits = e.eia ? searchText(e.text, q) : Maz.searchProgram(e.p, units, q));
        if (!hits.length) continue;
        lines += hits.length;
      }
      shown++;
      if (groups && e.m !== group) {
        group = e.m;
        html += `<div class="grp">${esc(group ? group.name : 'no machine memory or TOOLDATA file')}` +
          (group ? ` <span>${esc(TOOL_TYPE_LABEL[group.t.type])} · ${group.mts.length} tools</span>` : '') + '</div>';
      }
      html += `<div class="pr" data-p="${k}"><span class="nm">${esc(groups && e.m ? e.path.slice(e.m.prefix.length) : e.path)}</span><span class="cm">${esc(e.comment)}</span>${checkHtml(machineCheck(e, e.m, units))}</div>`;
      if (hits) {
        html += hits.slice(0, 5).map(h => `<div class="hit" data-p="${k}" data-l="${h.i}">${esc(h.text.trim())}</div>`).join('');
        if (hits.length > 5) html += `<div class="more">and ${hits.length - 5} more lines</div>`;
      }
    }
    const ms = folder.machines;
    el.folderInfo.innerHTML = (q ? `<b>${shown}</b> of ${folder.programs.length} programs · <b>${lines}</b> lines found` : `<b>${folder.programs.length}</b> programs`) +
      (ms.length === 1 ? ` · tools checked against ${esc(ms[0].path)} (${esc(TOOL_TYPE_LABEL[ms[0].t.type])}, ${ms[0].mts.length} tools)`
        : ms.length ? ` · ${ms.length} machines, each program checked against its own machine` : ' · no machine memory or TOOLDATA file in the folder');
    el.folderList.innerHTML = '<div class="fl">' + html + '</div>';
  }
  // open a program of the folder (or go to its tab), at a found line
  async function openFromFolder(k, line) {
    const e = folder.programs[k];
    let d = e.doc && docs.indexOf(e.doc) >= 0 ? e.doc : null;
    if (!d) {
      openBytes(e.bytes, e.name, e.handle, e.eia && e.m ? e.m.t.type : undefined);
      d = e.doc = docs[docs.length - 1];
      d.machine = e.m;
    } else { cur = docs.indexOf(d); }
    if (line !== undefined) select(line);
    render();
    el.input.focus();
  }

  // ------------------------------------------------------------------ compare
  // The current program against another open one of the same kind of machine: by default one with the same
  // name (the saved copy and the machine's copy), else the newest other program.
  const baseName = d => d.p.name.replace(/\.[^.]*$/, '').toUpperCase();
  function compareCandidates(d) {
    return docs.filter(x => x !== d && isProg(x) && Maz.CONTROLS[x.p.ctl].type === C(d).type);
  }
  function compareWith(d) {
    const cands = compareCandidates(d);
    if (d.cmpWith && cands.indexOf(d.cmpWith) >= 0) return d.cmpWith;
    return cands.find(x => baseName(x) === baseName(d)) || cands[cands.length - 1] || null;
  }
  const KIND_TEXT = { changed: 'changed', added: 'added', removed: 'removed', hidden: 'changed' };
  function renderCompare() {
    const d = doc();
    el.cmpSide.hidden = !cmpOn || !isProg(d);
    if (el.cmpSide.hidden) return;
    const cands = compareCandidates(d), other = compareWith(d);
    el.cmpWith.innerHTML = cands.length ? cands.map(x => `<option value="${docs.indexOf(x)}"${x === other ? ' selected' : ''}>${esc(x.p.name)} (tab ${docs.indexOf(x) + 1})</option>`).join('')
      : '<option>no other program of this kind is open</option>';
    if (!other) { el.cmpInfo.textContent = 'Open the program to compare with (for example the machine\'s copy).'; el.cmpList.innerHTML = ''; return; }
    // the comparison only changes when either program or the units do (not when the cursor moves)
    const key = [docs.indexOf(other), d.units, d.undo.length, d.redo.length, other.undo.length, other.redo.length, d.dirty, other.dirty].join();
    if (d.cmpKey === key && d.cmpHtml) { el.cmpInfo.innerHTML = d.cmpInfoHtml; if (el.cmpList.innerHTML !== d.cmpHtml) el.cmpList.innerHTML = d.cmpHtml; return; }
    let r;
    try { r = Maz.diffPrograms(other.p, d.p, d.units); } catch (e) { el.cmpInfo.textContent = e.message; el.cmpList.innerHTML = ''; return; }
    d.cmp = r;
    const n = k => r.items.filter(i => i.kind === k).length, hidden = n('hidden');
    const conv = other.p.ctl !== d.p.ctl ? ` (${other.p.name} read as ${Maz.CONTROLS[d.p.ctl].label})` : '';
    el.cmpInfo.innerHTML = r.items.length ? `<b>${n('changed')}</b> changed · <b>${n('added')}</b> added · <b>${n('removed')}</b> removed` +
      (hidden ? ` · ${hidden} changed only in data the screen does not show` : '') + ` · ${r.same} the same${esc(conv)}`
      : `The programs are the same${esc(conv)}.`;
    const lineOf = (p, ls, i) => Maz.printLine(ls[i], { units: d.units }).ch.join('').replace(/\s+$/, '');
    const la = Maz.lines(r.a), lb = ctx(d);
    el.cmpList.innerHTML = '<div class="cmp">' + r.items.map((it, k) => {
      const text = it.ib >= 0 ? lineOf(d.p, lb, it.ib) : lineOf(r.a, la, it.ia);
      const fields = it.kind === 'changed' ? it.fields.map(([f, a, b]) => `<div class="f"><b>${esc(f)}</b>  <span class="was">${esc(a || '(blank)')}</span> → <span class="now">${esc(b || '(blank)')}</span></div>`).join('') : '';
      const where = it.kind === 'removed' ? ' (only in ' + esc(other.p.name) + ')' : it.kind === 'hidden' ? ' (not shown on screen)' : '';
      return `<div class="it ${it.kind}" data-k="${k}"><div class="ln0"><span class="kind">${KIND_TEXT[it.kind]}</span>${esc(text.trim())}${where}</div>${fields}</div>`;
    }).join('') + '</div>';
    d.cmpKey = key; d.cmpHtml = el.cmpList.innerHTML; d.cmpInfoHtml = el.cmpInfo.innerHTML;
  }

  // ------------------------------------------------------------------ tools and setup sheet
  // The program's tools, each checked against the tool data of an open TOOLDATA file or machine memory (the
  // newest one for the same kind of machine, unless another is chosen).
  // open TOOLDATA documents and machine memories, and the machines of the open folder
  const folderSources = () => folder ? folder.machines.map(m => m.src || (m.src = { t: m.t, folderPath: folder.name + '/' + m.path, machine: m })) : [];
  const toolSources = () => docs.filter(x => x.t && x.t.tool === 'TOOLDATA').concat(folderSources());
  function toolSource(d) {
    const srcs = toolSources();
    if (d.toolSrc === 'none') return null;
    if (d.toolSrc && srcs.indexOf(d.toolSrc) >= 0) return d.toolSrc;
    // a program opened from a folder: its own machine
    const own = d.machine && srcs.find(x => x.machine === d.machine);
    if (own) return own;
    return srcs.filter(x => !x.machine && x.t.type === C(d).type).pop() || srcs.filter(x => x.t.type === C(d).type)[0] || null;
  }
  function sourceLabel(s) {
    const n = Maz.machineTools(s.t).length;
    const where = s.folderPath ? 'folder ' + s.folderPath : `${s.t.memory ? 'machine memory ' : ''}${s.t.name} (tab ${docs.indexOf(s) + 1})`;
    return `${where} · ${TOOL_TYPE_LABEL[s.t.type]} · ${n} tools`;
  }
  function toolCheck(d) {
    const src = toolSource(d), mts = src ? Maz.machineTools(src.t) : null;
    const rows = Maz.programTools(d.p, d.units, ctx(d)).map(pt => ({ pt, res: mts ? Maz.checkTool(pt, mts) : null }));
    const n = st => rows.filter(r => r.res && r.res.status === st).length;
    return { src, rows, ok: n('ok'), suffix: n('suffix'), missing: n('missing') };
  }
  const nmText = (d, nm) => (d.units === 'metric' ? Maz.fixed(nm / 1e6, 3) : Maz.fixed(nm / 25.4e6, 4));
  const STATUS = { ok: ['✓', 'found'], suffix: ['≠', 'other suffix'], missing: ['✗', 'missing'] };
  // the machine side of a row: tool numbers, pockets, length and diameter (several when there are sisters)
  function machineCols(d, r) {
    if (!r.res || !r.res.tools.length) return ['', '', '', ''];
    const ts = r.res.tools, other = r.res.status !== 'ok';
    return [ts.map(m => 'T' + m.tno + (other ? ' (' + (m.sfx || 'no sfx') + ')' : '')).join(', '),
      ts.map(m => (m.pocket == null ? '-' : m.pocket)).join(', '),
      ts.map(m => nmText(d, m.length)).join(', '),
      ts.map(m => (r.pt.kind === 'tap' ? '' : nmText(d, m.dia))).join(', ')];
  }
  function renderTools() {
    const d = doc();
    el.toolsSide.hidden = !toolsOn || !isProg(d);
    if (el.toolsSide.hidden) return;
    const srcs = toolSources(), src = toolSource(d);
    el.toolSrc.innerHTML = '<option value="none">no tool data</option>' +
      srcs.map(s => `<option value="${s.machine ? 'm' + folder.machines.indexOf(s.machine) : docs.indexOf(s)}"${s === src ? ' selected' : ''}>${esc(sourceLabel(s))}</option>`).join('');
    if (!src) el.toolSrc.value = 'none';
    const c = toolCheck(d);
    el.toolsInfo.innerHTML = `<b>${c.rows.length}</b> tools` + (c.src
      ? ` · <b>${c.ok}</b> found · <b>${c.suffix}</b> other suffix · <b>${c.missing}</b> missing`
      : srcs.length ? ' · choose the tool data to check against' : ' · open a machine\'s m8ysram or a TOOLDATA file to check them');
    // every machine of the open folder that is the same kind: does it have all the tools?
    const others = folder ? folder.machines.filter(m => m.t.type === C(d).type) : [];
    if (others.length > 1 || (others.length === 1 && (!src || src.machine !== others[0]))) {
      const pts = Maz.programTools(d.p, d.units);
      el.toolsInfo.innerHTML += '<div class="mlist">' + others.map(m => {
        const res = pts.map(pt => Maz.checkTool(pt, m.mts).status);
        const c = { n: res.length, missing: res.filter(x => x === 'missing').length, suffix: res.filter(x => x === 'suffix').length };
        return `<button type="button" class="mach${src && src.machine === m ? ' on' : ''}" data-mach="${folder.machines.indexOf(m)}">${esc(m.name)} ${checkHtml(c)}</button>`;
      }).join('') + '</div>';
    }
    const head = '<tr><th></th><th>Tool</th><th>NOM</th><th>Sfx</th><th>Units</th><th>Machine</th><th>Pocket</th><th class="num">Length</th><th class="num">Dia/Nose</th></tr>';
    el.toolsList.innerHTML = '<table class="tt"><thead>' + head + '</thead><tbody>' + c.rows.map(r => {
      const st = r.res ? r.res.status : '', m = machineCols(d, r);
      return `<tr class="st-${st}" data-line="${r.pt.lines[0]}" title="${esc(st ? STATUS[st][1] : '')}"><td class="st">${st ? STATUS[st][0] : ''}</td>` +
        `<td>${esc(r.pt.name)}</td><td>${esc(r.pt.nomText)}</td><td>${esc(r.pt.sfx)}</td><td>${esc(r.pt.units.join(' '))}</td>` +
        `<td>${esc(m[0])}</td><td>${esc(m[1])}</td><td class="num">${esc(m[2])}</td><td class="num">${esc(m[3])}</td></tr>`;
    }).join('') + '</tbody></table>';
  }
  function setupSheet(d) {
    const c = toolCheck(d), date = new Date().toISOString().slice(0, 10), out = [];
    out.push(`SETUP SHEET   ${d.p.name}    ${C(d).label}    ${d.units === 'metric' ? 'mm' : 'inch'}    ${date}`);
    const cm = Maz.comment(d.p);
    if (cm) out.push('COMMENT  ' + cm);
    out.push(c.src ? 'Tools checked against ' + sourceLabel(c.src) + '.' : 'No tool data open: the tools are listed without a check.');
    out.push('');
    const cols = [['Tool', 16], ['NOM', 10], ['Sfx', 4], ['Units', 14], ['Machine', 16], ['Pocket', 8], ['Length', 10], ['Dia/Nose', 10], ['Status', 12]];
    const line = vals => vals.map((v, k) => String(v).padEnd(cols[k][1])).join(' ').replace(/\s+$/, '');
    out.push(line(cols.map(x => x[0])));
    out.push(line(cols.map(x => '-'.repeat(x[1]))));
    for (const r of c.rows) {
      const m = machineCols(d, r);
      out.push(line([r.pt.name, r.pt.nomText, r.pt.sfx, r.pt.units.join(' '), m[0], m[1], m[2], m[3], r.res ? STATUS[r.res.status][1] : '']));
    }
    out.push('');
    out.push(`${c.rows.length} tools` + (c.src ? `: ${c.ok} found, ${c.suffix} with another suffix, ${c.missing} missing` : ''));
    return out.join('\n') + '\n';
  }
  function printSheet() {
    const d = doc();
    if (!d || isTool(d)) return;
    el.printArea.textContent = setupSheet(d);
    window.print();
  }
  function saveSheet() {
    const d = doc();
    if (!d || isTool(d)) return;
    download(setupSheet(d).replace(/\n/g, '\r\n'), d.p.name.replace(/\.[^.]*$/, '') + '-setup.txt', 'text/plain');
  }

  // ------------------------------------------------------------------ plot
  // Drawn on a canvas: a Mazatrol program's programmed geometry (shapes, holes, MANL moves) with the cutter path
  // worked out for its units, or an EIA program's moves. d.view is the visible window in plot units (y down,
  // like an SVG viewBox). A scene (per program state, units and view) holds the items to draw and the steps to
  // play them back one at a time:
  //   item {kind, pts [[a, b]...], zs? (heights per point), z? ([bottom, top]), rec?, line?, prog?, unit?, step}
  //   step {at: first item, end, rec | line, prog, unit, label, t0, t1 (seconds from the start)}
  let plotFlat = true, lastStats = null, plotFocus = null;   // plotFocus: item indices the time window points at
  const plotCtx = el.plot.getContext('2d');
  // a program with SUB PRO units also depends on the other open programs and the folder
  const callsSubs = d => isProg(d) && d.p.recs.some(r => Maz.code(r) === 5);
  const subsKey = d => (callsSubs(d) ? docs.map(x => x.id + ':' + x.rev).join(',') + '/' + (folder ? folder.programs.length + folder.name : '') : '');
  const diaKey = d => {
    if (!isProg(d)) return '';
    const s = toolSource(d);
    return diaVer + ':' + (!s ? '-' : s.machine ? s.machine.path : s.id + '.' + s.rev) + ':' + JSON.stringify(fixedTimes());
  };
  const sceneKey = d => [d.rev || 0, d.units, d.plotView || '', isEia(d) ? d.g.type : '', isEia(d) ? eiaVersion() : '', subsKey(d), diaKey(d)].join('|');
  function scene(d) {
    const key = sceneKey(d);
    if (d.scene && d.scene.key === key) return d.scene;
    const s = isEia(d) ? eiaScene(d) : mazScene(d);
    s.key = key;
    // step times
    let t = 0;
    for (const st of s.steps) { st.t0 = t; t += st.dt || 0; st.t1 = t; }
    s.time = t;
    // each item's step
    let k = 0;
    s.steps.forEach((st, i) => { const end = i + 1 < s.steps.length ? s.steps[i + 1].at : s.items.length; st.end = end; for (k = Math.max(k, st.at); k < end; k++) s.items[k].step = i; });
    const old = d.scene;
    // fit the view again when the plot was empty or the programs SUB PRO units call have changed
    if (old && (!old.items.length || old.key.split('|')[5] !== key.split('|')[5])) d.view = null;
    d.scene = s; d.proj = null;
    if (!d.play || !old || old.steps.length !== s.steps.length) d.play = { on: false, pos: s.steps.length, from: 0, playing: false };
    return s;
  }
  // a path move as a plot item: lathe (and the mill-turn turning view) Z across and the radius up
  function moveItem(m, turn, feedKind) {
    const kind = m.kind === 'feed' ? feedKind : m.kind;
    const it = { kind, rec: m.rec, line: m.line, prog: m.prog, unit: m.unit, step: -1, move: m };
    if (turn) it.pts = m.pts.map(p => [p[2], p[0]]);
    else { it.pts = m.pts.map(p => [p[0], p[1]]); it.zs = m.pts.map(p => p[2]); }
    return it;
  }
  const plotTurn = d => C(d).type === 'lathe' || (C(d).type === 'millturn' && d.plotView === 'turn');
  function mazScene(d) {
    const millturn = C(d).type === 'millturn', view = millturn ? d.plotView : undefined, turn = plotTurn(d);
    const items = Plot.geometry(d.p, d.units, ctx(d), view).map(it => Object.assign(it, { step: -1 }));
    let path;
    try { path = Paths.program(d.p, d.units, ctx(d), view, { resolve: subResolver(d), toolDia: (p, ti, nom) => toolDia(d, p, ti, nom).dia, fixed: fixedTimes() }); } catch (e) { path = { moves: [], steps: [], notes: ['The cutter path could not be worked out: ' + e.message] }; }
    // the shapes of the programs SUB PRO units call, under the calling unit
    const seen = new Set();
    for (const sp of path.subs || []) {
      if (seen.has(sp.p)) continue;
      seen.add(sp.p);
      for (const it of Plot.geometry(sp.p, d.units, null, view)) items.push(Object.assign(it, { step: -1, unit: sp.unit, rec: sp.rec }));
    }
    const first = items.length;
    for (const m of path.moves) items.push(moveItem(m, turn, 'cut'));
    const tm = GCode.times(path.moves, { units: d.units, accel: d.units === 'metric' ? 2000 : 80 });
    path.moves.forEach((m, k) => { items[first + k].t = tm.each[k]; });
    const steps = path.steps.map((s, i) => {
      const end = i + 1 < path.steps.length ? path.steps[i + 1].at : path.moves.length;
      let dt = 0;
      for (let k = s.at; k < end; k++) dt += tm.each[k];
      return Object.assign({}, s, { at: first + s.at, dt });
    });
    return { items, steps, notes: path.notes || [], turn, eia: false, moves: path.moves.filter(m => m.kind !== 'dwell').length, runs: path.runs || [], first };
  }
  function eiaScene(d) {
    const g = d.g, turn = plotTurn(d);
    let r;
    try {
      r = MazGuide.isG3(g.text) ? { moves: [], trace: [], notes: ['This is a MAZATROL program in the three-digit G-format (text); it is not drawn. The guidance box names each unit.'], programs: [d.p.name] }
        : GCode.run(d.p.name, g.text, { lathe: g.type === 'lathe', millturn: g.type === 'millturn', resolve: eiaResolver(d) });
    } catch (e) { r = { moves: [], trace: [], notes: ['The program could not be read: ' + e.message], programs: [d.p.name] }; }
    if (r.units && r.units !== d.units && !g.unitsSet) { d.units = r.units; g.unitsSet = true; }
    const items = r.moves.map(m => moveItem(m, turn, 'feed'));
    const tm = GCode.times(r.moves, { units: d.units, accel: d.units === 'metric' ? 2000 : 80 });
    r.moves.forEach((m, k) => { items[k].t = tm.each[k]; });
    const steps = r.trace.map((t, i) => {
      const end = i + 1 < r.trace.length ? r.trace[i + 1].at : r.moves.length;
      let dt = 0;
      for (let k = t.at; k < end; k++) dt += tm.each[k];
      return { at: t.at, line: t.line, prog: t.prog, dt };
    });
    return { items, steps, notes: r.notes, turn, eia: true, programs: r.programs, moves: r.moves.filter(m => m.kind !== 'dwell').length };
  }
  // The diameter the control works out rpm from: one entered in the time window (by tool, kept in this browser),
  // else the actual diameter in the machine's tool data (Tools: the tool data the program is checked against),
  // else NOM-D. Returns {dia, from: 'entered' | 'tool data' | 'NOM-D', label}.
  let diaVer = 0;
  // seconds for units that take time without cutting; defaults from a Smooth horizontal's own estimates (2026-10-01:
  // MMS 3.5 s per probe line, INDEX 2.2 s, PALT CHG 10.3 s, M-CODE 1.6 s)
  // MMS: by what each probe line measures (Paths.MMS_BY) unless a time is entered; 3.5 s for a type not in the table
  const FIXED_DEFAULT = { mms: 3.5, index: 2.2, pallet: 10.3, mcode: 1.6 };
  const fixedTimes = () => {
    const s = store.get('mazed-fixed', {}), o = Object.assign({}, FIXED_DEFAULT, s);
    if (!(s.mms > 0)) o.mmsBy = Paths.MMS_BY;
    return o;
  };
  const DIA_KEY = 'mazed-tooldia';
  const ptLines = new WeakMap(), mtsOf = new WeakMap();
  function lineTool(p, i, units) {
    let m = ptLines.get(p);
    if (!m || m.units !== units) { m = new Map(); m.units = units; for (const pt of Maz.programTools(p, units)) for (const l of pt.lines) m.set(l, pt); ptLines.set(p, m); }
    return m.get(i) || null;
  }
  const toolLabelOf = pt => (pt.name + ' ' + pt.nomText + (pt.sfx ? ' ' + pt.sfx : '')).trim();
  function toolDia(d, p, ti, nom) {
    const pt = lineTool(p, ti, d.units);
    if (!pt) return { dia: nom, from: 'NOM-D', label: '' };
    const label = toolLabelOf(pt), o = store.get(DIA_KEY, {})[d.units + ':' + label];
    if (o > 0) return { dia: o, from: 'entered', label };
    const src = toolSource(d), nm = d.units === 'metric' ? 1e6 : 25.4e6;
    // a chamfer mill cuts with the middle of its edge: halfway between NOM-D and the tool file's MIN-D
    if (pt.type === 13) {
      const files = [src && src.t].concat(docs.filter(x => x.t && x.t.tool === 'TOOLFILE').map(x => x.t), folder ? folder.machines.map(m => m.t) : []).filter(Boolean);
      for (const t of files) {
        const e = Maz.findToolFile(pt, Maz.toolFileEntries(t));
        if (e) return { dia: (e.nom + e.min) / 2 / nm, from: 'tool file', label, note: 'middle of ' + Maz.fixed(e.nom / nm, 4) + '–' + Maz.fixed(e.min / nm, 4) };
      }
    }
    if (src) {
      let mts = src.machine ? src.machine.mts : mtsOf.get(src.t);
      if (!mts) mtsOf.set(src.t, mts = Maz.machineTools(src.t));
      const r = Maz.checkTool(pt, mts), act = r.status === 'ok' ? r.tools[0].dia : 0;
      if (act > 0) return { dia: act / nm, from: 'tool data', label };
    }
    return { dia: nom, from: 'NOM-D', label };
  }
  // a tool line's NOM-D (bytes 36-39), the program's own diameter
  const nomDiaOf = (p, i, units) => { const r = p.recs[i]; return (r[36] | (r[37] << 8) | (r[38] << 16) | (r[39] << 24)) * (units === 'metric' ? 1e-4 : 1e-5); };
  function setToolDia(d, label, v) {
    const all = store.get(DIA_KEY, {}), k = d.units + ':' + label;
    if (v > 0) all[k] = v; else delete all[k];
    store.set(DIA_KEY, all);
    diaVer++;
    render();
  }
  // the programs SUB PRO units call, by name: other open programs, then the folder's (same machine first).
  // A Mazatrol program comes back as {p}; an EIA one as {moves}.
  function subResolver(d) {
    const base = n => n.replace(/\.[^.]*$/, '').toUpperCase();
    return name => {
      const want = name.toUpperCase();
      const mine = x => x !== d && base(x.p.name) === want;
      const open = docs.find(x => mine(x) && isProg(x) && Maz.CONTROLS[x.p.ctl].type === C(d).type) || docs.find(x => mine(x) && isEia(x));
      let e = open ? (isEia(open) ? { eia: true, text: open.g.text, name: open.p.name } : { p: open.p }) : null;
      if (!e && folder) {
        const cands = folder.programs.filter(x => base(x.name) === want && (x.eia || Maz.CONTROLS[x.p.ctl].type === C(d).type));
        e = cands.find(x => d.machine && x.m === d.machine) || cands[0] || null;
      }
      if (!e) return null;
      if (e.p) return { p: e.p };
      try { return { moves: GCode.run(e.name, e.text, { resolve: eiaResolver(d) }).moves.filter(m => m.kind !== 'dwell') }; } catch (err) { return null; }
    };
  }
  // subprograms and macros of an EIA program: other open EIA programs, then the folder's (same machine first)
  let eiaVer = 0;
  const eiaVersion = () => eiaVer;
  function eiaResolver(d) {
    const want = k => { const b = String(k).toUpperCase(); return [b, b.replace(/^O0*/, ''), 'O' + b.replace(/^O/, '')]; };
    return key => {
      const names = want(key);
      const open = docs.find(x => x !== d && isEia(x) && names.includes(x.p.name.replace(/\.[^.]*$/, '').toUpperCase()));
      if (open) return open.g.text;
      if (folder) {
        const cands = folder.programs.filter(e => e.eia && names.includes(e.name.replace(/\.[^.]*$/, '').toUpperCase()));
        const e = cands.find(x => d.machine && x.m === d.machine) || cands[0];
        if (e) return e.text;
      }
      return null;
    };
  }

  // the draw list for the current angle: {k: item, kind, pts: [x0, y0, x1, y1 ...] on the plot plane}
  function projected(d, s) {
    const ang = d.ang || (d.ang = { name: 'top', yaw: 0, pitch: 90 });
    const flat = s.turn || ang.name === 'top';
    const key = flat ? 'flat' : ang.yaw + ',' + ang.pitch;
    if (d.proj && d.proj.key === key && d.proj.scene === s) return d.proj;
    const draw = [];
    const flatPts = pts => { const a = new Float64Array(pts.length * 2); pts.forEach((q, i) => { a[2 * i] = q[0]; a[2 * i + 1] = q[1]; }); return a; };
    if (flat) {
      s.items.forEach((it, k) => { if (!it.zOnly && it.kind !== 'dwell') draw.push({ k, kind: it.kind, pts: flatPts(it.pts) }); });
    } else {
      const P = Plot.projector(ang.yaw * Math.PI / 180, ang.pitch * Math.PI / 180);
      const proj = (pts, zf) => { const a = new Float64Array(pts.length * 2); pts.forEach((q, i) => { const [x, y] = P(q[0], q[1], zf(i)); a[2 * i] = x; a[2 * i + 1] = y; }); return a; };
      s.items.forEach((it, k) => {
        if (it.kind === 'dwell') return;
        if (it.kind === 'hole') {
          const [x, y] = it.pts[0], [zb, zt] = it.z || [0, 0];
          draw.push({ k, kind: 'hole', pts: proj([[x, y]], () => zt) });
          if (zt !== zb) draw.push({ k, kind: 'holeline', pts: proj([[x, y], [x, y]], i => (i ? zb : zt)) });
        } else if (it.zs) {
          draw.push({ k, kind: it.kind, pts: proj(it.pts, i => it.zs[i]) });
        } else {
          const [zb, zt] = it.z || [0, 0];
          draw.push({ k, kind: it.kind, pts: proj(it.pts, () => zb) });
          if (zt !== zb) {                               // the stock above the finished shape, and its side edges
            draw.push({ k, kind: it.kind, pts: proj(it.pts, () => zt) });
            const a = it.pts[0], b = it.pts[it.pts.length - 1];
            draw.push({ k, kind: 'edge', pts: proj([a, a], i => (i ? zt : zb)) });
            if (b[0] !== a[0] || b[1] !== a[1]) draw.push({ k, kind: 'edge', pts: proj([b, b], i => (i ? zt : zb)) });
          }
        }
      });
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of draw) for (let i = 0; i < e.pts.length; i += 2) { const x = e.pts[i], y = e.pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    d.proj = { key, scene: s, draw, flat, box: [x0, y0, x1, y1] };
    return d.proj;
  }

  function renderPlot() {
    el.side.hidden = !plotOn;
    const d = doc();
    if (!plotOn) { stopPlay(); return; }
    if (!d || isTool(d)) { el.side.hidden = !!d; el.plotInfo.textContent = ''; lastStats = null; clearPlot(); return; }
    const millturn = C(d).type === 'millturn';
    $('#viewSeg').hidden = !millturn;
    if (millturn && !d.plotView) d.plotView = isEia(d) ? 'mill' : plotViewFor(d);
    document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === d.plotView));
    const s = scene(d), turn = s.turn;
    $('#angSeg').hidden = turn;
    const ang = d.ang || (d.ang = { name: 'top', yaw: 0, pitch: 90 });
    document.querySelectorAll('#angSeg button').forEach(b => b.classList.toggle('on', !turn && b.dataset.ang === ang.name));
    const pr = projected(d, s);
    plotFlat = pr.flat;
    el.plotInfo.textContent = plotInfoText(d, s);
    if (!pr.draw.length) { d.view = d.view || { x: -1, y: -1, w: 2, h: 2 }; drawPlot(); renderPlay(); return; }
    const [x0, y0, x1, y1] = pr.box, span = Math.max(x1 - x0, y1 - y0, 1e-3), pad = span * 0.06;
    if (!d.view) d.view = { x: x0 - pad, y: -(y1 + pad), w: x1 - x0 + 2 * pad || span, h: y1 - y0 + 2 * pad || span };
    d.span = span;
    drawPlot();
    renderPlay();
  }
  function plotInfoText(d, s) {
    const u = d.units === 'metric' ? 'mm' : 'in', f = v => Maz.fixed(v, d.units === 'metric' ? 3 : 4);
    if (!s.items.length) return s.eia ? (s.notes.length ? '' : 'no moves') : 'nothing to plot';
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const it of s.items) {
      if (it.kind === 'dwell') continue;
      for (const [x, y] of it.pts) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
      for (const z of it.zs || it.z || []) { if (z < z0) z0 = z; if (z > z1) z1 = z; }
    }
    if (a0 > a1) return 'no moves';
    const time = s.time > 0 ? ` · ≈ ${clock(s.time)}` : '';
    if (s.turn) return `Z ${f(a0)} … ${f(a1)}   X ${f(2 * b0)} … ${f(2 * b1)} ${u} (diameter)` + time;
    return `X ${f(a0)} … ${f(a1)}   Y ${f(b0)} … ${f(b1)}` + (z0 <= z1 ? `   Z ${f(z0)} … ${f(z1)}` : '') + ` ${u}` + time;
  }
  const clock = t => { t = Math.round(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0'); };
  // mill-turn: start with the turning view when the program has turning shapes and no milling geometry
  function plotViewFor(d) {
    const mill = Plot.geometry(d.p, d.units, ctx(d), 'mill').length, turn = Plot.geometry(d.p, d.units, ctx(d), 'turn').length;
    return turn && !mill ? 'turn' : 'mill';
  }

  // ---- drawing
  const STYLE = {
    rapid: ['#6f7d8a', 1.2, [4, 3]], feed: ['#2fbf5f', 1.2], cut: ['#3fa7ff', 1.2], shape: ['#2f9e55', 1.2], close: ['#2f9e55', 1.2, [2, 3]],
    edge: ['#24613a', 1], holeline: ['#8f7a2a', 1.2], hole: ['#c9a92f', 1.2],
  };
  const UNIT_STYLE = { feed: ['#5dff8f', 2], cut: ['#8fd0ff', 2], shape: ['#5dff8f', 2], close: ['#5dff8f', 2, [2, 3]], edge: ['#3fae6a', 1], holeline: ['#ffe14d', 1.2], hole: ['#ffe14d', 2], rapid: ['#9aa7b3', 1.4, [4, 3]] };
  const CURSOR_STYLE = ['#ffffff', 3];
  function clearPlot() {
    const cv = el.plot, dpr = window.devicePixelRatio || 1;
    plotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    plotCtx.fillStyle = '#05080b';
    plotCtx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  }
  function plotSize() {
    const cv = el.plot, dpr = window.devicePixelRatio || 1, W = Math.max(1, cv.clientWidth), H = Math.max(1, cv.clientHeight);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    return { W, H, dpr };
  }
  // plot units <-> canvas pixels
  function viewMap(d) {
    const { W, H } = plotSize(), v = d.view, s = Math.max(v.w / W, v.h / H);
    const ox = v.x + (v.w - W * s) / 2, oy = v.y + (v.h - H * s) / 2;
    return { s, ox, oy, W, H, X: x => (x - ox) / s, Y: y => (-y - oy) / s };
  }
  function highlightOf(d, s) {
    // the items of the unit (Mazatrol) and the line (both) at the cursor
    if (isEia(d)) return { unit: -1, rec: -2, line: d.g.curLine === undefined ? -1 : d.g.curLine };
    const u = d.sel.r >= 0 ? unitOf(d, d.sel.r).i : -1;
    const uk = Maz.structure(d.p, ctx(d)).findIndex(x => x.i === u);
    return { unit: uk, rec: d.sel.r, line: -2 };
  }
  function drawPlot() {
    const d = doc();
    if (!plotOn || !d || isTool(d) || !d.scene || !d.proj || !d.view) { lastStats = null; cubeHit = null; return; }
    const s = d.scene, pr = d.proj, m = viewMap(d), g = plotCtx, { dpr } = plotSize();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05080b';
    g.fillRect(0, 0, m.W, m.H);
    const span = d.span || 1, stats = { lines: 0, holes: 0, axes: 0, box: [d.view.x, d.view.y, d.view.w, d.view.h].join(' ') };
    // axes through the program origin, or X Y Z from it in the side and 3D views
    if (pr.flat) {
      g.strokeStyle = '#25313b'; g.lineWidth = 1; g.setLineDash([]);
      g.beginPath(); g.moveTo(0, m.Y(0)); g.lineTo(m.W, m.Y(0)); g.moveTo(m.X(0), 0); g.lineTo(m.X(0), m.H); g.stroke();
    } else {
      const ang = d.ang, P = Plot.projector(ang.yaw * Math.PI / 180, ang.pitch * Math.PI / 180), len = span * 0.12;
      g.font = '11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
      for (const [c, v, t] of [['#d65a5a', [len, 0, 0], 'X'], ['#5ad67a', [0, len, 0], 'Y'], ['#5a8ed6', [0, 0, len], 'Z']]) {
        const [sx, sy] = P(v[0], v[1], v[2]);
        g.strokeStyle = c; g.lineWidth = 1.5; g.setLineDash([]);
        g.beginPath(); g.moveTo(m.X(0), m.Y(0)); g.lineTo(m.X(sx), m.Y(sy)); g.stroke();
        g.fillStyle = '#9aa7b3'; g.fillText(t, m.X(sx * 1.12) - 3, m.Y(sy * 1.12) + 4);
        stats.axes++;
      }
    }
    const hl = highlightOf(d, s), play = d.play && d.play.on ? d.play : null;
    const cur = play && play.pos > 0 ? play.pos - 1 : -1;
    // batches by look: [style, alpha] -> entries
    const batches = new Map();
    const add = (key, style, alpha, e) => { let b = batches.get(key); if (!b) batches.set(key, b = { style, alpha, list: [] }); b.list.push(e); };
    const LAYER = { ghost: 0, base: 1, unit: 2, cursor: 3, now: 4 };
    for (const e of pr.draw) {
      const it = s.items[e.k];
      let layer = 'base';
      if (plotFocus) layer = (it.move ? plotFocus.has(e.k) : plotFocus.units.has(it.unit)) ? 'unit' : 'ghost';
      else if (play && it.step >= 0) layer = it.step < play.from || it.step > cur ? 'ghost' : it.step === cur ? 'now' : 'base';
      if (!plotFocus && layer !== 'ghost' && layer !== 'now') {
        if ((it.rec !== undefined && it.rec === hl.rec) || (it.line !== undefined && it.line === hl.line && it.prog === 0)) layer = 'cursor';
        else if (it.unit !== undefined && it.unit === hl.unit) layer = 'unit';
      }
      const style = layer === 'cursor' || layer === 'now' ? CURSOR_STYLE : layer === 'unit' ? (UNIT_STYLE[e.kind] || STYLE[e.kind]) : STYLE[e.kind] || STYLE.feed;
      add(LAYER[layer] + ':' + e.kind + ':' + layer, style, layer === 'ghost' ? 0.13 : 1, e);
      if (e.kind === 'hole') stats.holes++; else stats.lines++;
    }
    const hr = span * 0.008 / m.s;
    for (const key of [...batches.keys()].sort()) {
      const b = batches.get(key), [color, width, dash] = b.style;
      g.globalAlpha = b.alpha; g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []); g.lineJoin = 'round';
      g.beginPath();
      for (const e of b.list) {
        const p = e.pts;
        if (e.kind === 'hole') { const x = m.X(p[0]), y = m.Y(p[1]); g.moveTo(x + Math.max(hr, 2.5), y); g.arc(x, y, Math.max(hr, 2.5), 0, 2 * Math.PI); continue; }
        g.moveTo(m.X(p[0]), m.Y(p[1]));
        for (let i = 2; i < p.length; i += 2) g.lineTo(m.X(p[i]), m.Y(p[i + 1]));
      }
      g.stroke();
    }
    g.globalAlpha = 1; g.setLineDash([]);
    // the tool at the end of the last move played
    if (play && cur >= play.from) {
      const e = lastPoint(d, s, pr, cur);
      if (e) {
        const x = m.X(e[0]), y = m.Y(e[1]);
        g.strokeStyle = '#ffd24d'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 6, 0, 2 * Math.PI); g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.moveTo(x, y - 10); g.lineTo(x, y + 10); g.stroke();
      }
    }
    drawCube(d, s, m);
    lastStats = stats;
  }
  // ---- view cube: the part's orientation in the corner; click a face for that view, a corner for a 3D view
  const CUBE_FACES = [
    ['top', [0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    ['bottom', [0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
    ['front', [0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    ['back', [0, 1, 0], [[1, 1, -1], [-1, 1, -1], [-1, 1, 1], [1, 1, 1]]],
    ['right', [1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    ['left', [-1, 0, 0], [[-1, 1, -1], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1]]],
  ];
  let cubeHit = null;
  function cubeLayout(d, s, m) {
    if (s.turn || !d.ang) return null;
    const yaw = d.ang.yaw * Math.PI / 180, pitch = d.ang.pitch * Math.PI / 180, P = Plot.projector(yaw, pitch);
    const sp = Math.sin(pitch), cp = Math.cos(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // how far a point is toward the viewer (the top view looks down Z, the front view along +Y)
    const toward = (x, y, z) => z * sp - (x * sy + y * cy) * cp;
    const h = 27, ox = m.W - 56, oy = 56;
    const scr = q => { const [a, b] = P(q[0], q[1], q[2]); return [ox + a * h, oy - b * h]; };
    const faces = CUBE_FACES.map(([name, n, vs]) => ({ name, depth: toward(n[0], n[1], n[2]), pts: vs.map(scr) }))
      .filter(f => f.depth > 1e-6).sort((a, b) => a.depth - b.depth);
    const corners = [];
    for (const sx of [-1, 1]) for (const sy2 of [-1, 1]) for (const sz of [-1, 1]) {
      if (toward(sx, sy2, sz) <= 1e-6) continue;
      const [x, y] = scr([sx, sy2, sz]);                // the 3D view turned to look from this corner
      corners.push({ x, y, yaw: Math.atan2(-sx, -sy2) * 180 / Math.PI, pitch: sz * Plot.VIEWS.iso[1] });
    }
    return { faces, corners };
  }
  function drawCube(d, s, m) {
    const c = cubeHit = cubeLayout(d, s, m), g = plotCtx;
    if (!c) return;
    g.save();
    g.lineWidth = 1; g.setLineDash([]); g.lineJoin = 'round';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 10px "Segoe UI", system-ui, sans-serif';
    for (const f of c.faces) {
      g.globalAlpha = 0.92;
      g.fillStyle = f.name === d.ang.name ? '#2f6f3f' : '#1a242d';
      g.strokeStyle = '#6f7d8a';
      g.beginPath(); f.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke();
      if (f.depth > 0.35) {                              // labels on the faces turned well toward the viewer
        const x = f.pts.reduce((a, p) => a + p[0], 0) / 4, y = f.pts.reduce((a, p) => a + p[1], 0) / 4;
        g.globalAlpha = Math.min(1, f.depth * 1.4);
        g.fillStyle = '#d6dde3';
        g.fillText(f.name.toUpperCase(), x, y);
      }
    }
    g.globalAlpha = 0.9; g.fillStyle = '#9aa7b3';
    for (const k of c.corners) { g.beginPath(); g.arc(k.x, k.y, 2.5, 0, 2 * Math.PI); g.fill(); }
    g.restore();
  }
  // the view picked on the cube at canvas point (x, y), or null
  function cubePick(x, y) {
    const c = cubeHit;
    if (!c) return null;
    const k = c.corners.find(k => Math.hypot(k.x - x, k.y - y) <= 7);
    if (k) return { name: 'free', yaw: k.yaw, pitch: k.pitch };
    for (let i = c.faces.length - 1; i >= 0; i--) {
      const p = c.faces[i].pts;
      let inside = false;
      for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
        if ((p[a][1] > y) !== (p[b][1] > y) && x < (p[b][0] - p[a][0]) * (y - p[a][1]) / (p[b][1] - p[a][1]) + p[a][0]) inside = !inside;
      }
      if (inside) { const name = c.faces[i].name, [yaw, pitch] = Plot.VIEWS[name]; return { name, yaw, pitch }; }
    }
    return null;
  }
  function setAng(d, ang) {
    const [iy, ip] = Plot.VIEWS.iso;
    if (Math.abs(ang.yaw - iy) < 1e-6 && Math.abs(ang.pitch - ip) < 1e-6) ang.name = 'iso';
    d.ang = ang; d.view = null;
    renderPlot();
  }
  // the end point on the plot plane of the last drawn move up to step k
  function lastPoint(d, s, pr, k) {
    for (let st = k; st >= 0 && st >= k - 2000; st--) {
      const step = s.steps[st];
      for (let i = step.end - 1; i >= step.at; i--) {
        const it = s.items[i];
        if (it.kind === 'dwell' || it.kind === 'hole') continue;
        const e = pr.draw.find(x => x.k === i && x.kind === it.kind);
        if (e) return [e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]];
      }
    }
    return null;
  }
  // the item nearest to a point on the canvas (within a few pixels)
  function hitTest(d, cx, cy) {
    if (!d.proj || !d.view) return null;
    const m = viewMap(d), span = d.span || 1, hr = Math.max(span * 0.008 / m.s, 2.5);
    let best = null, bd = 7;
    for (const e of d.proj.draw) {
      const p = e.pts;
      if (e.kind === 'hole') { const dd = Math.abs(Math.hypot(m.X(p[0]) - cx, m.Y(p[1]) - cy) - hr); if (dd < bd) { bd = dd; best = e; } continue; }
      for (let i = 2; i < p.length; i += 2) {
        const ax = m.X(p[i - 2]), ay = m.Y(p[i - 1]), bx = m.X(p[i]), by = m.Y(p[i + 1]);
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / L)) : 0;
        const dd = Math.hypot(ax + t * dx - cx, ay + t * dy - cy);
        if (dd < bd) { bd = dd; best = e; }
      }
    }
    return best ? d.scene.items[best.k] : null;
  }
  function renderPlotHighlight() { if (plotOn) drawPlot(); }

  // ---- playback: step one line (EIA block, Mazatrol tool path of a line) at a time, play, restart anywhere
  let playTimer = 0, playClock = 0;
  function renderPlay() {
    const d = doc(), s = d && d.scene;
    const bar = $('#playbar');
    bar.hidden = !s || !s.steps.length;
    if (bar.hidden) { $('#playInfo').textContent = s && s.notes.length ? s.notes.slice(0, 3).join(' · ') : ''; $('#plotNotes').hidden = true; return; }
    const p = d.play, n = s.steps.length;
    const pos = $('#playPos');
    pos.max = n; pos.value = p.on ? p.pos : n;
    $('#playRun').textContent = p.playing ? '⏸' : '▶';
    $('#playRun').classList.toggle('on', p.playing);
    let text;
    if (!p.on) text = `${n} ${s.eia ? 'blocks' : 'steps'} · ${s.moves} moves` + (s.time > 0 ? ` · ≈ ${clock(s.time)}` : '') + (p.from ? ` · restart from step ${p.from + 1}` : '');
    else {
      const k = p.pos - 1, st = s.steps[k];
      text = (k < 0 || !st ? 'start' : `${k + 1}/${n} · ${stepText(d, s, st)}`) + (s.time > 0 ? ` · ${clock(st && k >= 0 ? st.t1 : (s.steps[p.from] || { t0: 0 }).t0)} of ${clock(s.time)}` : '');
    }
    if (s.notes.length) text += ' · ' + s.notes.length + ' note' + (s.notes.length > 1 ? 's' : '');
    $('#playInfo').textContent = text;
    $('#playInfo').title = s.notes.join('\n');
    // what deserves a look (not the standing "approximate" remark): shown under the plot
    const warn = s.notes.filter(n => !/^Cutter paths are worked out here/.test(n));
    $('#plotNotes').hidden = !warn.length;
    $('#plotNotes').innerHTML = warn.map(n => '<div>' + esc(n) + '</div>').join('');
  }
  function stepText(d, s, st) {
    if (s.eia) {
      const name = s.programs[st.prog] || '', text = st.prog === 0 ? eiaLine(d, st.line) : '';
      return (st.prog ? name + ' ' : '') + 'line ' + (st.line + 1) + (text ? ': ' + text.trim().slice(0, 60) : '');
    }
    return st.label || '';
  }
  // go to step position pos (steps done); the cursor follows the line of the step
  function playTo(pos, follow) {
    const d = doc(), s = d && d.scene;
    if (!s) return;
    const p = d.play;
    p.on = true;
    p.pos = Math.max(p.from, Math.min(s.steps.length, pos));
    const st = s.steps[p.pos - 1];
    if (follow !== false && st) {
      if (s.eia) { if (st.prog === 0) gotoLine(st.line, true); }
      else if (st.rec !== undefined && st.rec !== d.sel.r) { d.sel = { r: st.rec, c: firstCell(d, st.rec), a: null }; renderCursor(); }
    }
    drawPlot();
    renderPlay();
  }
  function playAction(what) {
    const d = doc(), s = d && d.scene;
    if (!s || !s.steps.length) return;
    const p = d.play;
    if (what === 'run') { if (p.playing) return stopPlay(); if (!p.on || p.pos >= s.steps.length) { p.on = true; p.pos = p.from; } startPlay(); return; }
    stopPlay();
    if (what === 'first') playTo(p.from);
    else if (what === 'back') playTo((p.on ? p.pos : s.steps.length) - 1);
    else if (what === 'fwd') playTo(p.on ? p.pos + 1 : p.from + 1);
    else if (what === 'last') { p.on = false; p.pos = s.steps.length; drawPlot(); renderPlay(); }
    else if (what === 'here') {
      const k = cursorStep(d, s);
      if (k < 0) return note('Nothing runs at the cursor');
      p.from = k;
      playTo(k, false);
      note('The plot starts again from ' + (s.eia ? 'line ' + (s.steps[k].line + 1) : s.steps[k].label || 'here') + '. Play or step on from there.', true);
    }
  }
  // the first step at the cursor: the line of an EIA program, the unit of a Mazatrol program
  function cursorStep(d, s) {
    if (s.eia) {
      const line = d.g.curLine || 0;
      let k = s.steps.findIndex(st => st.prog === 0 && st.line >= line);
      return k;
    }
    const u = d.sel.r >= 0 ? unitOf(d, d.sel.r).i : 0;
    return s.steps.findIndex(st => st.unitRec >= u);
  }
  function startPlay() {
    const d = doc();
    d.play.playing = true;
    playClock = performance.now();
    renderPlay();
    const tick = now => {
      const d2 = doc();
      if (d2 !== d || !d.play.playing || !plotOn) { d.play.playing = false; renderPlay(); return; }
      const s = d.scene, p = d.play, speed = +$('#playSpeed').value || 20;
      const dt = Math.min(0.25, (now - playClock) / 1000) * speed;
      playClock = now;
      // simulated time: at least a little per step that moves, so steps without feeds still show one by one
      p.budget = (p.budget || 0) + dt;
      let pos = p.pos;
      while (pos < s.steps.length) {
        const st = s.steps[pos], need = Math.max(st.dt || 0, st.end > st.at ? 0.04 * Math.min(speed, 20) / 20 : 0);
        if (p.budget < need) break;
        p.budget -= need;
        pos++;
      }
      if (pos !== p.pos) playTo(pos);
      if (pos >= s.steps.length) { p.playing = false; p.budget = 0; renderPlay(); return; }
      playTimer = requestAnimationFrame(tick);
    };
    playTimer = requestAnimationFrame(tick);
  }
  function stopPlay() {
    cancelAnimationFrame(playTimer);
    const d = doc();
    if (d && d.play && d.play.playing) { d.play.playing = false; d.play.budget = 0; renderPlay(); }
  }

  function plotEvents() {
    let drag = null;
    const pt = e => {
      const d = doc(), m = viewMap(d), b = el.plot.getBoundingClientRect();
      return { x: m.ox + (e.clientX - b.left) * m.s, y: m.oy + (e.clientY - b.top) * m.s, s: m.s };
    };
    el.plot.addEventListener('wheel', e => {
      const d = doc();
      if (!d || !d.view) return;
      e.preventDefault();
      const p = pt(e), k = Math.exp(e.deltaY * 0.0015);
      d.view = { x: p.x - (p.x - d.view.x) * k, y: p.y - (p.y - d.view.y) * k, w: d.view.w * k, h: d.view.h * k };
      drawPlot();
    }, { passive: false });
    el.plot.addEventListener('pointerdown', e => {
      const d = doc();
      if (!d || !d.view) return;
      drag = { x: e.clientX, y: e.clientY, v: Object.assign({}, d.view), moved: false, turn: !plotFlat && !e.shiftKey, ang: Object.assign({}, d.ang) };
      el.plot.setPointerCapture(e.pointerId);
    });
    let turnFrame = 0, panFrame = 0;
    el.plot.addEventListener('pointermove', e => {
      const d = doc();
      if (!drag || !d) return;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
      if (drag.turn) {                                 // half a degree per pixel; the view fits itself again
        if (!drag.moved) return;
        d.ang = { name: 'free', yaw: drag.ang.yaw - (e.clientX - drag.x) * 0.5,
          pitch: Math.max(-90, Math.min(90, drag.ang.pitch + (e.clientY - drag.y) * 0.5)) };
        d.view = null;
        if (!turnFrame) turnFrame = requestAnimationFrame(() => { turnFrame = 0; renderPlot(); });
        return;
      }
      const s = viewMap(d).s, dx = (e.clientX - drag.x) * s, dy = (e.clientY - drag.y) * s;
      d.view = Object.assign({}, drag.v, { x: drag.v.x - dx, y: drag.v.y - dy });
      if (!panFrame) panFrame = requestAnimationFrame(() => { panFrame = 0; drawPlot(); });
    });
    el.plot.addEventListener('pointerup', e => {
      const d = doc();
      if (drag && !drag.moved && d) {
        const b = el.plot.getBoundingClientRect(), view = cubePick(e.clientX - b.left, e.clientY - b.top);
        const it = view ? null : hitTest(d, e.clientX - b.left, e.clientY - b.top);
        if (view) setAng(d, view);
        else if (it) {
          if (isEia(d)) { if (it.prog === 0 && it.line !== undefined) gotoLine(it.line); }
          else if (it.rec !== undefined) { select(it.rec); el.input.focus(); }
        }
      }
      drag = null;
    });
    el.plot.addEventListener('dblclick', () => { const d = doc(); if (d) { d.view = null; renderPlot(); } });
    if (window.ResizeObserver) new ResizeObserver(() => { if (plotOn) drawPlot(); }).observe(el.plot);
    $('#playbar').addEventListener('click', e => { const b = e.target.closest('[data-play]'); if (b) playAction(b.dataset.play); });
    $('#playPos').addEventListener('input', () => { stopPlay(); playTo(+$('#playPos').value); });
  }

  // ------------------------------------------------------------------ TPC screen
  // RELAY POINT: a MANU block of the control's TPC screen is a record (0xf0) with up to three points: X Y Z from byte 36
  // (three i32 each, in the program's length unit), M at 20 / 22 / 24 (u16), S at 72 / 76 / 80 (i32 / 1000); byte 10 says
  // which block: 1 the approach, 2 the escape. A block left on AUTO has no record. Decoded from a POCKET unit with every
  // value set to something different on a control, checked byte for byte.
  // ROTATE POSITION (turning centre, CORNER): an F1 record, byte 10 = 1 ROUGH / 2 FIN. SU10 u32 @12, SU50 @20 and SU51 @24 (u32 /10000),
  // X @52 and Z @60 (u32 /100000), each repeated later in the record (X @76, Z @84). The FIN record is empty in every sample seen.
  function rotateHtml(recs, units, unit) {
    const u32 = (r, o) => (r[o] | r[o + 1] << 8 | r[o + 2] << 16 | r[o + 3] << 24) >>> 0, mm = units === 'metric';
    return recs.map(r => {
      const u16 = o => r[o] | r[o + 1] << 8;
      // MMS and TRANSFER keep their M codes in the first F1 record (u16 at 26 / 28; TRANSFER's second head at 42 / 44)
      if (unit === 'MMS' || unit === 'TRANSFER') {
        if (r[10] === 2) return '';
        const rows = unit === 'MMS' ? [['M CODE', 26], ['M CODE', 28]] : [['HEAD 1 · M CODE', 26], ['HEAD 1 · M CODE', 28], ['HEAD 2 · M CODE', 42], ['HEAD 2 · M CODE', 44]];
        return `<div class="tpcrelay"><b>${unit === 'MMS' ? 'ROTATE POSITION' : 'M-CODE'}</b><table class="tpct"><tbody>${rows.map(([n, o]) => `<tr><td class="tpcd">M</td><td class="tpcn">${n}</td><td class="tpcv">${u16(o) || '—'}</td></tr>`).join('')}</tbody></table></div>`;
      }
      const kind = r[10] === 2 ? 'FIN' : r[10] === 1 ? 'ROUGH' : 'ROTATE ' + r[10], used = r.slice(12, 100).some(x => x);
      const row = (d, name, v) => `<tr><td class="tpcd">${d}</td><td class="tpcn">${name}</td><td class="tpcv">${v}</td></tr>`;
      return `<div class="tpcrelay"><b>${kind} · ROTATE POSITION</b>` + (used ? `<table class="tpct"><tbody>${row('SU10', '', u32(r, 12))}${row('SU50', '', +(u32(r, 20) / (mm ? 1000 : 10000)).toFixed(4))}${row('SU51', '', +(u32(r, 24) / (mm ? 1000 : 10000)).toFixed(4))}${row('X', '', +(u32(r, 52) / (mm ? 1e4 : 1e5)).toFixed(4))}${row('Z', '', +(u32(r, 60) / (mm ? 1e4 : 1e5)).toFixed(4))}</tbody></table>` : '<p class="tw-dim">not used (all zero)</p>') + '</div>';
    }).join('');
  }
  function relayHtml(recs, units) {
    const sc = units === 'metric' ? 1e-4 : 1e-5, i32 = (r, o) => r[o] | r[o + 1] << 8 | r[o + 2] << 16 | r[o + 3] << 24, u16 = (r, o) => r[o] | r[o + 1] << 8;
    const num = v => String(+v.toFixed(units === 'metric' ? 3 : 4));
    return recs.map(r => {
      const kind = u16(r, 10) % 2 === 0 && u16(r, 10) > 0 ? 'ESCAPE' : u16(r, 10) % 2 === 1 ? 'APPROACH' : 'RELAY ' + u16(r, 10);      // 1 / 2 on the mills, 3 / 4 on the turning centre
      const rows = [0, 1, 2].map(k => ({ x: i32(r, 36 + 12 * k), y: i32(r, 40 + 12 * k), z: i32(r, 44 + 12 * k), m: u16(r, 20 + 2 * k), s: i32(r, 72 + 4 * k) }))
        .map((q, k) => Object.assign(q, { n: k + 1, any: q.x || q.y || q.z || q.m || q.s }));
      return `<div class="tpcrelay"><b>${kind} · MANU</b><table class="tpct"><thead><tr><th></th><th>X</th><th>Y</th><th>Z</th><th>M</th><th>S</th></tr></thead><tbody>` +
        rows.map(q => `<tr${q.any ? '' : ' class="na"'}><td class="tpcd">${q.n}</td>` + (q.any ? `<td class="tpcv">${num(q.x * sc)}</td><td class="tpcv">${num(q.y * sc)}</td><td class="tpcv">${num(q.z * sc)}</td><td class="tpcv">${q.m}</td><td class="tpcv">${num(q.s / 1000)}</td>` : '<td colspan="5" class="tw-dim">—</td>') + '</tr>').join('') +
        '</tbody></table></div>';
    }).join('') + '<p class="tw-dim">Shown as the control keeps them; set relay points on the control\'s TPC screen (a block on AUTO has none).</p>';
  }
  // The TPC of the unit at the cursor, laid out like the control's (PARAMETER: D number, name, value; RELAY POINT).
  // Values are edited in place (Edit mode); PREV. UNIT / NEXT UNIT step through the units, TPC CANCEL puts back what
  // the unit's TPC was when the screen opened, TPC END closes it.
  const tpcSt = { d: null, u: null, orig: null };
  function tpcUnits(d) { return Maz.structure(d.p, ctx(d)).filter(u => u.code !== 1 && u.code !== 4); }
  function openTpc(u) {
    const d = doc();
    if (!isProg(d)) return note('TPC is for Mazatrol programs');
    u = u || (d.sel.r >= 0 ? unitOf(d, d.sel.r) : null);
    if (!u || u.code === 1) return note('Put the cursor on a unit first');
    // what each unit's TPC was when the screen opened (TPC CANCEL puts all of them back)
    if (!$('#tpcDlg').open || tpcSt.d !== d) tpcSt.orig = new Map();
    tpcSt.d = d; tpcSt.u = u;
    for (const i of u.seqs) if (d.p.recs[i][0] >= 0xd0 && !tpcSt.orig.has(i)) tpcSt.orig.set(i, d.p.recs[i].slice());
    if (!$('#tpcDlg').open) $('#tpcDlg').showModal();
    renderTpc();
  }
  function renderTpc(tab) {
    const d = tpcSt.d, u = tpcSt.u;
    if (!d || !u) return;
    tab = tab || $('#tpcDlg').dataset.tab || 'param';
    $('#tpcDlg').dataset.tab = tab;
    const tag = 'UNo ' + Maz.number(d.p.recs[u.i]) + ' ' + unitName(d.p.ctl, u.code);
    const recs = u.seqs.filter(i => d.p.recs[i][0] >= 0xd0 && !(d.p.recs[i][1] || d.p.recs[i][2] || d.p.recs[i][3])), main = recs.find(i => Maz.isTpcMain(d.p.recs[i][0])), more = recs.filter(i => Maz.isRelay(d.p.recs[i])), rot = recs.filter(i => d.p.recs[i][0] === 0xf1), extraRec = recs.find(i => d.p.recs[i][0] === 0xf0 && !Maz.isRelay(d.p.recs[i]));
    $('#tpcTitle').textContent = tag + ' · TPC';
    document.querySelectorAll('#tpcDlg [data-tpctab]').forEach(b => b.classList.toggle('on', b.dataset.tpctab === tab));
    const body = $('#tpcBody');
    if (tab === 'relay') {
      body.innerHTML = (rot.length ? rotateHtml(rot.map(i => d.p.recs[i]), d.units, unitName(d.p.ctl, u.code)) : '') +
        (more.length ? relayHtml(more.map(i => d.p.recs[i]), d.units) : rot.length ? '' : '<p class="tw-dim">AUTO: no relay points set for this unit.</p>');
      return;
    }
    const turnTpc = mtype(d) !== 'mill' && recs.some(i => ctx(d)[i].lay);
    if (main === undefined && !turnTpc) {
      body.innerHTML = `<p class="tpcnone">No TPC on this unit: it runs with the machine's parameters (the D values the control's TPC screen shows
        until one is changed).</p>`;
      return;
    }
    const mt = mtype(d), t = main !== undefined ? Maz.tpcFields(d.p.recs[main], mt, Maz.CONTROLS[d.p.ctl].family, d.units) : { known: false, fields: [] };
    if (extraRec !== undefined && t.known && main !== undefined && d.p.recs[main][0] === 0xe8) for (const x of Maz.tpcExtra(d.p.recs[extraRec])) t.fields.push(Object.assign(x, { rec: extraRec }));
    if (turnTpc && !t.known && window.MazParams) {                // lathe / mill-turn: every TPC record's fields as laid out, parameter names
      const fs = [];
      for (const i of recs) { const Lt = ctx(d)[i]; if (!Lt.lay) continue; Lt.lay.cells.forEach((c, k) => {
        const lab = Maz.cellLabel(Lt.lay, k) || '', m = /(TC|SU|D|E|F|TP)\d+/.exec(lab), text = Maz.cellText(Lt, k, { units: d.units }).trim();
        if (!m && !text) return;
        fs.push({ off: c[0], d: m ? m[0] : lab, name: m ? MazParams.name(mt, m[0]) || lab : lab, text: text || '— (machine value)', applies: true, raw: 0 });
      }); }
      if (fs.length) { t.known = true; t.fields = fs; t.turn = true; }
    }
    const can = editing && t.known && !t.turn && (d.units === 'inch' || mt === 'mill');
    const bitTip = f => (f.bits ? '\n' + f.bits.map((b, k) => b && 'bit ' + k + ' ' + (f.raw >> k & 1) + '  ' + b).filter(Boolean).join('\n') : '');
    const bitDef = f => (f.def !== undefined && f.def !== null && f.applies ? f.def : null);
    const bitDiff = f => { const df = bitDef(f); return df === null ? '' : f.bits ? [7, 6, 5, 4, 3, 2, 1, 0].filter(k => ((f.raw ^ df) & ~(f.ign || 0)) >> k & 1).map(k => 'bit ' + k).join(', ') : f.raw !== df ? 'value' : ''; };
    const defText = f => f.bits ? bitDef(f).toString(2).padStart(8, '0') : Maz.tpcText(bitDef(f), f.kind, f.metric);
    const row = f => `<tr class="${f.applies ? '' : 'na'}" title="${esc(f.d + ' ' + f.name + (bitDef(f) !== null ? '\ndefault ' + defText(f) + (bitDiff(f) ? (f.bits ? ' · changed: ' + bitDiff(f) : ' · changed') : ' · as default') : '') + bitTip(f))}"><td class="tpcd">${esc(f.d)}</td><td class="tpcn">${esc(f.name)}</td>` +
      `<td class="tpcv${bitDiff(f) ? ' chg' : ''}">${can && f.applies ? `<input data-tpcoff="${f.off}"${f.rec !== undefined ? ` data-tpcrec="${f.rec}"` : ''} data-tpckind="${f.kind}" data-tpcd="${esc(f.d)}" value="${esc(f.text)}">` :
        f.bits ? `<button type="button" class="tpcbitbtn" data-tpcbits="${esc(f.d)}">${esc(f.text)}</button>` : esc(f.applies ? f.text : '◆')}</td></tr>`;
    // two columns as on the control: D1 ... D32 on the left, D41 on on the right (raw fields: half and half)
    // D layouts in number order (left D1 ... D32, right D41 on, as on the control); E layouts in the control's order
    const dn = f => parseInt(f.d.slice(1)) || 0, byNumber = t.known && t.fields.every(f => f.d[0] === 'D' || f.d[0] === 'F') && t.unit === 'TAPPING';
    const fields = byNumber ? t.fields.slice().sort((a, b) => dn(a) - dn(b)) : t.fields.slice();
    const split = byNumber ? fields.findIndex(f => dn(f) >= 40) : -1, half = split > 0 ? split : Math.ceil(fields.length / 2);
    body.innerHTML = (t.turn ? '<p class="tw-dim">Turning TPC: the fields as the control lays them out, named from the machine\'s parameter list. Values are shown; change them in the listing (TPC LINES).</p>' : '') +
      (t.known ? '' : `<p class="tw-dim">This kind of TPC (record ${d.p.recs[main][0].toString(16).toUpperCase()}) is not decoded yet: its fields are shown as stored.
      Change every value on the control's TPC screen for one such unit, photograph it and send the program to name them.</p>`) +
      (d.units === 'metric' && t.known && mt !== 'mill' ? '<p class="tw-dim">Metric scales were read from a metric mill; the TC fields of a metric turning centre are not checked.</p>' : '') +
      `<div class="tpccols"><table class="tpct"><tbody>${fields.slice(0, half).map(row).join('')}</tbody></table>` +
      `<table class="tpct"><tbody>${fields.slice(half).map(row).join('')}</tbody></table></div>` +
      '<div id="tpcBits"></div>' + (editing ? '' : '<p class="tw-dim">View only: PROGRAM EDIT (Ctrl+E) to change values.</p>');
    tpcSt.fields = t.fields;
    if (tpcSt.bitsOf) showTpcBits(tpcSt.bitsOf);
  }
  // what the parameter adjusts, drawn (current value in the caption)
  function showTpcDraw(dn) {
    const box = $('#tpcDraw'), f = (tpcSt.fields || []).find(x => x.d === dn);
    if (!box || !f) return;
    const pic = window.MazRef ? MazRef.drawing(dn) : '';
    box.innerHTML = `<div class="tpcdrawh"><b>${esc(dn)}</b> ${esc(f.name)} <span class="tpcdrawv">${esc(f.text)}</span></div>` +
      (pic || (f.bits ? '<p class="tw-dim">A set of switches: each bit is listed below the table.</p>' : '<p class="tw-dim">No drawing for this one.</p>'));
  }
  // Reference: G-codes, M-codes, and every TPC parameter with its drawing; searchable
  function openRef(tab) {
    const dlg = $('#refDlg');
    dlg.dataset.tab = tab || dlg.dataset.tab || 'g';
    if (!dlg.open) { dlg.dataset.mt = mtype(doc()); dlg.showModal(); }
    renderRef();
    $('#refFind').focus();
  }
  function renderRef() {
    const dlg = $('#refDlg'), tab = dlg.dataset.tab, q = $('#refFind').value.trim().toLowerCase();
    document.querySelectorAll('#refDlg [data-reftab]').forEach(b => b.classList.toggle('on', b.dataset.reftab === tab));
    const hit = (...s) => !q || s.some(x => String(x).toLowerCase().includes(q));
    let html = '';
    const mt = dlg.dataset.mt || 'mill', Gl = MazRef.G_FOR(mt), Ml = MazRef.M_FOR(mt);
    if (tab === 'g' || tab === 'm' || tab === 'p' || tab === 'a' || tab === 'v') html = '<div class="seg refmt">' + [['mill', 'Mill'], ['lathe', 'Lathe'], ['millturn', 'Mill-turn']].map(([k, n]) => `<button type="button" data-refmt="${k}" class="${k === mt ? 'on' : ''}">${n}</button>`).join('') + '</div>';
    if (tab === 'g') html += '<table class="tt reft"><thead><tr><th>Code</th><th>What it does</th><th>Group</th></tr></thead><tbody>' +
      Gl.filter(r => hit(r[0], r[1])).map(r => `<tr><td class="refc">${esc(r[0])}${r[3] ? ' <span class="tw-dim" title="on at power-up / reset">▲</span>' : ''}</td><td>${esc(r[1])}</td><td class="tw-dim">${r[2] === '00' ? 'one block' : esc(r[2])}</td></tr>`).join('') +
      `</tbody></table><p class="tw-dim">The list of ${esc(MazRef.MACHINE[mt])}. ▲ on at power-up or reset. Codes in the same group replace each other; "one block" codes act only in their block.</p>`;
    else if (tab === 'm') html += '<table class="tt reft"><thead><tr><th>Code</th><th>What it does</th></tr></thead><tbody>' +
      Ml.filter(r => hit(r[0], r[1])).map(r => `<tr><td class="refc">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('') +
      `</tbody></table><p class="tw-dim">The list of ${esc(MazRef.MACHINE[mt])}; options and other models differ. ${esc(MazRef.M_NOTES_FOR(mt))}</p>`;
    else if (tab === 'v') {
      const rows = MazGuide.varsFor(mt).filter(r => hit('#' + r[0], '#' + r[1], r[2]));
      html += '<table class="tt reft"><thead><tr><th>Variables</th><th>What they hold</th></tr></thead><tbody>' +
        rows.map(r => `<tr><td class="refc">#${r[0]}${r[1] !== r[0] ? '–#' + r[1] : ''}</td><td>${esc(r[2])}</td></tr>`).join('') +
        '</tbody></table><p class="tw-dim">Macro and system variables of a Smooth control (EIA programs). Tool offset numbering depends on the offset type the machine uses; the guidance box names each # on the line at the cursor.</p>';
    }
    else if (tab === 'a') {
      const help = alarmHelp(), KIND = { p: 'program / tool data', s: 'system', io: 'external I/O', sv: 'servo', sp: 'spindle', m: 'machine' };
      const STOP = { e: 'emergency stop', f: 'feed hold', b: 'single-block stop', r: 'reset stop', rc: 'reset stop (screen carries on)', c: 'carries on' };
      const CLR = { c: 'clear key', r: 'reset key', er: 'fix the cause, then reset', pw: 'fix the cause, power off and on' };
      const all = alarmsFor(mt), list = all.filter(a => hit(a[0], a[1], KIND[a[2]] || '', help[a[0]] ? help[a[0]].c + ' ' + help[a[0]].a : ''));
      html += `<p class="tw-dim">${all.length} alarms of the Smooth control${mt === 'mill' ? '' : '; ★ = this model\'s own machine alarm (' + esc(MazRef.MACHINE[mt].replace(', upper turret', '')) + ')'}. ${Object.keys(help).length ? 'Causes and actions from your control\'s alarm help (' + Object.keys(help).length + ').' :
        'Causes and actions are in the control\'s own help file: <button type="button" id="alarmLoad">Load alarm help…</button> (iAlarmHelp_NC.txt from the control or Smooth CAM Ai, data/nm64mdata/eng; kept in this browser).'}</p>` +
        '<table class="tt reft"><thead><tr><th>No.</th><th>Alarm</th><th>Kind</th><th>Stops</th><th>Clear with</th></tr></thead><tbody>' +
        list.slice(0, 400).map(a => `<tr><td class="refc">${a[0]}${a[5] === 'own' ? ' ★' : ''}</td><td>${esc(a[1])}${help[a[0]] ? `<div class="refalh"><b>Cause:</b> ${esc(help[a[0]].c)}<br><b>Action:</b> ${esc(help[a[0]].a)}</div>` : window.MazHelp && MazHelp.ALARM_TIPS[a[0]] ? `<div class="refalh"><b>Check:</b> ${esc(MazHelp.ALARM_TIPS[a[0]])}</div>` : ''}</td>` +
          `<td class="tw-dim">${esc(KIND[a[2]] || '')}</td><td class="tw-dim">${esc(STOP[a[3]] || '')}</td><td class="tw-dim">${esc(CLR[a[4]] || '')}</td></tr>`).join('') +
        '</tbody></table>' + (list.length > 400 ? `<p class="tw-dim">${list.length - 400} more: search to narrow.</p>` : '');
    } else if (mt !== 'mill' && window.MazParams) {
      const P = MazParams.P[mt], rows = P.rows.filter(r => hit(r[0], r[1], P.secs[r[2]]));
      html += `<p class="tw-dim">${P.rows.length} user parameters of ${esc(MazRef.MACHINE[mt].replace(', upper turret', ''))} (its parameter list). TC are the turning (and TPC) parameters.</p>` +
        '<table class="tt reft"><thead><tr><th>Address</th><th>What it sets</th><th>Group</th></tr></thead><tbody>' +
        rows.slice(0, 500).map(r => `<tr><td class="refc">${esc(r[0])}</td><td>${esc(r[1])}</td><td class="tw-dim">${esc(P.secs[r[2]])}</td></tr>`).join('') + '</tbody></table>' +
        (rows.length > 500 ? `<p class="tw-dim">${rows.length - 500} more: search to narrow.</p>` : '');
    } else {
      const names = Maz.TPC_NAMES, bits = Maz.TPC_BITS, keys = Object.keys(names).sort((a, b) => a[0].localeCompare(b[0]) || parseInt(a.slice(1)) - parseInt(b.slice(1)));
      html += '<div class="refparams">' + keys.filter(k => hit(k, names[k], ...(bits[k] || []))).map(k =>
        `<div class="refp"><div class="refph"><b>${esc(k)}</b> ${esc(names[k])}</div>${MazRef.drawing(k) ||
        (bits[k] ? '<ol start="0" class="refbits">' + bits[k].map((b, i) => `<li>bit ${i}: ${esc(b || '(not used)')}</li>`).join('') + '</ol>' : '')}</div>`).join('') + '</div>';
      if (window.MazParams && MazParams.P.mill) {         // the mill's other user parameters, by group
        const P = MazParams.P.mill, rows = P.rows.filter(r => !names[r[0]] && hit(r[0], r[1], P.secs[r[2]]));
        html += `<h4 class="refh">All user parameters (${P.rows.length}, the programming groups)</h4><table class="tt reft"><thead><tr><th>Address</th><th>What it sets</th><th>Group</th></tr></thead><tbody>` +
          rows.slice(0, 400).map(r => `<tr><td class="refc">${esc(r[0])}</td><td>${esc(r[1])}</td><td class="tw-dim">${esc(P.secs[r[2]])}</td></tr>`).join('') + '</tbody></table>' +
          (rows.length > 400 ? `<p class="tw-dim">${rows.length - 400} more: search to narrow.</p>` : '');
      }
    }
    $('#refBody').innerHTML = html || '<p class="tw-dim">Nothing matches.</p>';
  }
  // WPC from probed holes. Rigid fit (rotation + shift) of the holes' part-frame positions (n) to the probed
  // machine positions (m); any two or more holes. Th runs CCW from the machine X axis, X/Y is the machine
  // position of the part zero; (ox, oy) moves it within the part frame.
  function fitHoles(rows, ox, oy) {
    const k = rows.length;
    if (k < 2) return null;
    const mean = (g, i) => rows.reduce((s, r) => s + r[g][i], 0) / k;
    const cn = [mean('n', 0), mean('n', 1)], cm = [mean('m', 0), mean('m', 1)];
    let dot = 0, cross = 0, sp = 0;
    for (const r of rows) {
      const px = r.n[0] - cn[0], py = r.n[1] - cn[1], qx = r.m[0] - cm[0], qy = r.m[1] - cm[1];
      dot += px * qx + py * qy; cross += px * qy - py * qx; sp += px * px + py * py;
    }
    if (!(sp > 0) || (dot === 0 && cross === 0)) return null;
    const th = Math.atan2(cross, dot), s = Math.sin(th), c = Math.cos(th);
    const x0 = cm[0] - (c * cn[0] - s * cn[1]), y0 = cm[1] - (s * cn[0] + c * cn[1]);
    let resid = 0;
    for (const r of rows) resid = Math.max(resid, Math.hypot(x0 + c * r.n[0] - s * r.n[1] - r.m[0], y0 + s * r.n[0] + c * r.n[1] - r.m[1]));
    ox = ox || 0; oy = oy || 0;
    return { th: th * 180 / Math.PI, x: x0 + c * ox - s * oy, y: y0 + s * ox + c * oy, resid };
  }
  // two holes on the part's X line, A on the +X side: the part zero is their midpoint
  function wpcFromHoles(a, b, ox, oy) {
    const h = Math.hypot(a[0] - b[0], a[1] - b[1]) / 2;
    return fitHoles([{ n: [h, 0], m: a }, { n: [-h, 0], m: b }], ox, oy);
  }
  // two holes on the part's Y line, A on the +Y side
  function wpcFromHolesY(a, b, ox, oy) {
    const h = Math.hypot(a[0] - b[0], a[1] - b[1]) / 2;
    return fitHoles([{ n: [0, h], m: a }, { n: [0, -h], m: b }], ox, oy);
  }
  // n holes on a circle, hole 1 at a0 degrees, going counter-clockwise (as FIG pattern CIR)
  function boltCircle(cx, cy, r, a0, n) {
    return Array.from({ length: n }, (_, i) => { const a = (a0 + 360 * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  }
  const CALC_HELP = {
    two: 'Probe two holes on the part\'s X line. Hole A is the one on the +X side. The part zero is their midpoint; the optional offsets move it in the part frame.',
    twoY: 'Probe two holes on the part\'s Y line. Hole A is the one on the +Y side. The part zero is their midpoint; the optional offsets move it in the part frame.',
    any: 'Give each hole\'s position from the part zero (the drawing) and where you probed it. Two or more holes, any layout; more holes average out probing error.',
    bolt: 'Describe the bolt circle from the part zero, then probe two or more of its holes and give their hole numbers (hole 1 at the start angle, counter-clockwise).',
  };
  const calcSt = { tab: 'two', rows: { two: [{}, {}], twoY: [{}, {}], any: [{}, {}, {}], bolt: [{}, {}, {}] } };
  const calcNum = t => { t = String(t == null ? '' : t).trim().replace(',', '.'); return t === '' ? NaN : Number(t); };
  const calcOpt = id => { const t = $('#' + id).value.trim(); return t === '' ? 0 : calcNum(t); };
  function calcFit() {
    const tab = calcSt.tab, R = calcSt.rows[tab], ox = calcOpt('calcOffX'), oy = calcOpt('calcOff');
    if (![ox, oy].every(isFinite)) return { err: 'The offsets must be numbers.' };
    if (tab === 'two' || tab === 'twoY') {
      const a = [calcNum(R[0].mx), calcNum(R[0].my)], b = [calcNum(R[1].mx), calcNum(R[1].my)];
      if (![...a, ...b].every(isFinite) || (a[0] === b[0] && a[1] === b[1])) return { err: 'Enter both holes (two different points).' };
      return { r: (tab === 'two' ? wpcFromHoles : wpcFromHolesY)(a, b, ox, oy) };
    }
    let pts = null;
    if (tab === 'bolt') {
      const cx = calcOpt('calcCx'), cy = calcOpt('calcCy'), rad = calcNum($('#calcR').value), a0 = calcOpt('calcA0'), n = calcNum($('#calcN').value);
      if (![cx, cy, a0].every(isFinite) || !(rad > 0) || !(n >= 2) || n !== Math.floor(n)) return { err: 'Enter the bolt circle: radius and number of holes (2 or more).' };
      pts = boltCircle(cx, cy, rad, a0, n);
    }
    const rows = [];
    for (const r of R) {
      const m = [calcNum(r.mx), calcNum(r.my)];
      if (!m.some(isFinite) && !String(r.nx || '') && !String(r.ny || '') && !String(r.no || '')) continue;      // a blank row
      let n;
      if (tab === 'bolt') { const i = calcNum(r.no); if (!(i >= 1 && i <= pts.length && i === Math.floor(i))) return { err: 'Hole numbers run 1 to ' + pts.length + '.' }; n = pts[i - 1]; }
      else n = [calcNum(r.nx), calcNum(r.ny)];
      if (![...n, ...m].every(isFinite)) return { err: 'Fill in every box of each hole, or empty the row.' };
      rows.push({ n, m });
    }
    if (rows.length < 2) return { err: 'Probe at least two holes.' };
    const r = fitHoles(rows, ox, oy);
    return r ? { r } : { err: 'The holes must be at two or more different positions.' };
  }
  function renderCalcRows() {
    const tab = calcSt.tab, R = calcSt.rows[tab];
    const pair = tab === 'two' || tab === 'twoY', cols = pair ? [['', 'Hole'], ['mx', 'Probed X'], ['my', 'Probed Y']] : tab === 'bolt' ? [['no', 'Hole no.'], ['mx', 'Probed X'], ['my', 'Probed Y']] :
      [['nx', 'Part X (drawing)'], ['ny', 'Part Y (drawing)'], ['mx', 'Probed X'], ['my', 'Probed Y']];
    $('#calcHead').innerHTML = '<tr>' + cols.map(c => `<th>${c[1]}</th>`).join('') + (pair ? '' : '<th></th>') + '</tr>';
    $('#calcRows').innerHTML = R.map((r, i) => '<tr>' + cols.map(([k]) => k ? `<td><input data-ci="${i}" data-ck="${k}" value="${esc(r[k] == null ? '' : r[k])}" inputmode="decimal" autocomplete="off"></td>` : `<td class="refc">${tab === 'two' ? (i ? 'B (-X side)' : 'A (+X side)') : (i ? 'B (-Y side)' : 'A (+Y side)')}</td>`).join('') +
      (pair ? '' : `<td><button type="button" data-cdel="${i}" title="Remove this hole">×</button></td>`) + '</tr>').join('');
    $('#calcRowBtns').hidden = pair;
    $('#calcBolt').hidden = tab !== 'bolt';
    $('#calcHelp').textContent = CALC_HELP[tab];
    document.querySelectorAll('#calcDlg [data-calctab]').forEach(b => b.classList.toggle('on', b.dataset.calctab === tab));
  }
  function renderCalc() {
    const d = doc(), metric = !!d && d.units === 'metric', dp = metric ? 4 : 5, f = calcFit(), r = f.r;
    $('#calcTh').textContent = r ? r.th.toFixed(4) : '-';
    $('#calcX').textContent = r ? r.x.toFixed(dp) : '-';
    $('#calcY').textContent = r ? r.y.toFixed(dp) : '-';
    const L = d && isProg(d) && d.sel.r >= 0 ? ctx(d)[d.sel.r] : null, onWpc = !!L && L.sel.code === 2 && L.lay;
    $('#calcApply').disabled = !r || !onWpc || locked(d) || readOnly(d);
    const unit = 'Values in ' + (metric ? 'mm' : 'inches') + ' (the open program\'s units). ';
    $('#calcMsg').textContent = unit + (!r ? f.err : (!['two', 'twoY'].includes(calcSt.tab) ? 'Worst hole misfit: ' + r.resid.toFixed(dp + 1) + '. ' : '') + (onWpc ? '' : 'To apply, close this, put the cursor on a WPC- unit line in Edit mode, and open CALC again.'));
  }
  function openCalc() {
    const dlg = $('#calcDlg');
    if (!dlg.open) dlg.showModal();
    renderCalcRows(); renderCalc();
    const first = $('#calcRows input'); if (first) first.focus();
  }
  function calcEvents() {
    const dlg = $('#calcDlg');
    dlg.addEventListener('input', e => {
      const i = e.target.dataset.ci;
      if (i != null) calcSt.rows[calcSt.tab][+i][e.target.dataset.ck] = e.target.value;
      renderCalc();
    });
    dlg.addEventListener('click', e => {
      const t = e.target.closest('[data-calctab]'), del = e.target.closest('[data-cdel]');
      if (t) { calcSt.tab = t.dataset.calctab; renderCalcRows(); renderCalc(); }
      if (del) { const R = calcSt.rows[calcSt.tab]; R.splice(+del.dataset.cdel, 1); while (R.length < 2) R.push({}); renderCalcRows(); renderCalc(); }
    });
    $('#calcAdd').onclick = () => { calcSt.rows[calcSt.tab].push({}); renderCalcRows(); renderCalc(); const ins = document.querySelectorAll('#calcRows input'); ins[ins.length - (calcSt.tab === 'bolt' ? 3 : 4)].focus(); };
    $('#calcClose').onclick = () => { dlg.close(); el.input.focus(); };
    $('#calcApply').onclick = () => {
      const d = doc(), r = calcFit().r;
      if (!r || !d || !isProg(d) || d.sel.r < 0) return;
      const row = d.sel.r, dp = d.units === 'metric' ? 4 : 5;
      try {
        edit(d => {
          const L = ctx(d)[row], rec = L.rec.slice(), L2 = Object.assign({}, L, { rec });
          for (const [name, val] of [['X', r.x.toFixed(dp)], ['Y', r.y.toFixed(dp)], ['Th', r.th.toFixed(4)]]) {
            const k = L.lay.cells.findIndex((c, j) => Maz.cellLabel(L.lay, j) === name);
            if (k < 0 || Maz.locked(L2, k)) throw new Error('This WPC- unit has no ' + name + ' field to set.');
            Maz.enter(L2, k, val, { units: d.units });
          }
          d.p.recs[row] = rec;
        });
      } catch (e) { return note(e.message); }
      dlg.close();
      note('WPC set: X ' + r.x.toFixed(dp) + '  Y ' + r.y.toFixed(dp) + '  Th ' + r.th.toFixed(4), true);
    };
  }
  // the control's own alarm help (cause, action), read from the user's file and kept in this browser
  let alarmHelpCache = null;
  function alarmHelp() { return alarmHelpCache || (alarmHelpCache = store.get('mazed-alarmhelp', {})); }
  function parseAlarmHelp(text) {
    const out = {}, re = /\[Alarm_(\d+)\]([\s\S]*?)(?=\n\[Alarm_|$)/g;
    let m;
    while ((m = re.exec(text))) {
      const get = k => { const r = new RegExp('^' + k + '="([^"]*)"', 'm').exec(m[2]); return r ? r[1].replace(/\s+/g, ' ').trim() : ''; };
      const c = get('CAUSE'), a = get('ACTION');
      if (c || a) out[+m[1]] = { c, a };
    }
    // the PLC alarm texts of a machine (ENGA0000.ALM, QUICK TURN series): "ALARM No. 200  TITLE", a blank line, the text
    const alm = /ALARM No\.\s*(\d+)[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n\s*ALARM No\.|$)/g;
    while ((m = alm.exec(text))) {
      const body = m[2].split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' ').replace(/\s*\[\d+\]\s*$/, '');
      if (body) out[+m[1]] = { c: body, a: '' };
    }
    return out;
  }
  // mill-turn strokes (the larger models): Y past the stroke about the centre line,
  // a radius past the X travel, B outside -30..210. Work offsets are not known, so Z is not checked.
  function strokeCheck(d) {
    const S = MazRef.STROKES['large'], k = d.units === 'metric' ? 1 : 1 / 25.4, out = [];
    let r;
    try { r = GCode.run(d.p.name, d.g.text, { millturn: true, resolve: eiaResolver(d) }); } catch (e) { return out; }
    let yMax = 0, xMax = 0, yAt = null, xAt = null;
    for (const m of r.moves) for (const q of m.pts) {
      if (Math.abs(q[1]) > yMax) { yMax = Math.abs(q[1]); yAt = m.line; }
      if (q[0] > xMax) { xMax = q[0]; xAt = m.line; }
    }
    const fx = v => +v.toFixed(d.units === 'metric' ? 1 : 3);
    if (yMax > S.y * k + 1e-9) out.push({ alarm: 0, line: yAt, text: 'Line ' + (yAt + 1) + ': Y' + fx(yMax) + ' is past the Y stroke (±' + fx(S.y * k) + ' about the centre line on the larger mill-turn models).', level: 'warn' });
    if (xMax > S.xr * k + 1e-9) out.push({ alarm: 0, line: xAt, text: 'Line ' + (xAt + 1) + ': X' + fx(xMax * 2) + ' (diameter) is past the X travel (' + fx(S.xr * k * 2) + ').', level: 'warn' });
    String(d.g.text).split(/\r?\n|\r/).forEach((l, i) => {
      for (const m of l.replace(/\([^)]*\)/g, '').matchAll(/(^|[^A-Z#])B\s*(-?\d*\.?\d+)/gi)) {
        const b = parseFloat(m[2]);
        if (b < S.b[0] || b > S.b[1]) out.push({ alarm: 0, line: i, text: 'Line ' + (i + 1) + ': B' + b + ' is outside the B-axis range (' + S.b[0] + '° to ' + S.b[1] + '°).', level: 'warn' });
      }
    });
    return out;
  }
  // program check: what the control would stop on (alarm number and title), click to go there
  function programCheck(d) {
    if (isEia(d)) {
      const t = d.g.type || 'mill', set = list => new Set(list.flatMap(r => r[0].split('/')));
      if (MazGuide.isG3(d.g.text)) return [];        // three-digit G-format: not G-code
      const res0 = eiaResolver(d), out = MazCheck.checkEia(d.g.text, { gcodes: set(MazRef.G_FOR(t)), mcodes: set(MazRef.M_FOR(t)), resolve: k => { try { return res0(k); } catch (e) { return null; } } });
      if (t === 'millturn') out.push(...strokeCheck(d));
      return out;
    }
    const s = scene(d), src = toolSource(d);
    let mts = null;
    if (src) mts = src.machine ? src.machine.mts : Maz.machineTools(src.t);
    return MazCheck.check(d.p, d.units, { ls: ctx(d), runs: s.runs, mts, tools: Maz.programTools(d.p, d.units), resolve: subResolver(d) });
  }
  function openCheck() {
    const d = doc();
    if (!d) return;
    const res = programCheck(d), title = n => { const a = alarmsFor(mtype(d)).find(x => x[0] === n); return a ? a[1] : ''; };
    $('#chkTitle').textContent = 'Program check · ' + d.p.name;
    $('#chkBody').innerHTML = !res.length ? '<p class="td-ok">✓ Nothing found that the control would stop on (of the things checked).</p>' :
      `<p class="tw-dim">${res.filter(r => r.level === 'alarm').length} would stop the control, ${res.filter(r => r.level !== 'alarm').length} to look at. Click one to go there.</p>` +
      '<table class="tt reft"><tbody>' + res.map((r, k) => `<tr data-chk="${k}" class="chkrow"><td class="${r.level === 'alarm' ? 'td-bad' : 'td-warn'}">${r.level === 'alarm' ? '✗' : '⚠'}</td>` +
        `<td class="refc">${r.alarm ? r.alarm : ''}</td><td><b>${esc(r.alarm ? title(r.alarm) : r.tool ? 'TOOL DATA' : 'CHECK')}</b><br>${esc(r.text)}` +
        `${r.alarm && window.MazHelp && MazHelp.ALARM_TIPS[r.alarm] ? `<div class="refalh"><b>Check:</b> ${esc(MazHelp.ALARM_TIPS[r.alarm])}</div>` : ''}</td></tr>`).join('') + '</tbody></table>' +
      '<p class="tw-dim">Checked: END unit (647), priority numbers (461, 462), units without shapes (452), FR 0 (621), NOM-D 0 (635), M-codes in one block (227), repeated shape points (698), SUB PRO programs here (405), tools in the machine\'s tool data and their size against the magazine (length, diameter), C-SP 0 (620); turning: DEP-1 (746), thread height and angle (742, 741), shape against the stock (717), inside BAR #2 (719), the tool\'s side, infeed point, thread passes; EIA: G-codes (808), M-codes (661), high-speed mode (G05 P2) commands, mill-turn strokes.</p>';
    $('#chkBody').onclick = e => { const t = e.target.closest('[data-chk]'); if (!t) return; const r = res[+t.dataset.chk]; $('#chkDlg').close(); if (isEia(d)) gotoLine(r.line); else select(r.rec); el.input.focus(); };
    $('#chkDlg').showModal();
  }
  // automatic tool development: the unit's tool lines from its data and the machine's parameters, previewed first
  const devParams = () => Object.assign({}, MazDevelop.DEFAULTS, store.get('mazed-devparams', {}));
  function devTarget() {
    const d = doc();
    if (!isProg(d) || d.sel.r < 0) return null;
    const u = unitOf(d, d.sel.r), ui = Maz.structure(d.p, ctx(d)).findIndex(x => x.i === u.i);
    return { d, u, ui };
  }
  function renderDevelop() {
    const t = devTarget(), box = $('#devPrev');
    if (!t) return;
    const { d, u, ui } = t;
    $('#devTitle').textContent = 'Tool development · UNo ' + Maz.number(d.p.recs[u.i]) + ' ' + unitName(d.p.ctl, u.code);
    let recs = null;
    try { recs = MazDevelop.develop(d.p, ui, d.units, devParams()); }
    catch (e) { box.innerHTML = `<p class="td-bad">${esc(e.message)}</p>`; $('#devApply').disabled = true; return; }
    const q = { ctl: d.p.ctl, name: d.p.name, header: d.p.header, warnings: [], recs: [d.p.recs[u.i]].concat(recs, [Maz.newRecord(4, 0)]) };
    Maz.renumber(q);
    const ql = Maz.lines(q);
    box.innerHTML = '<p class="tw-dim">The tool lines the control would develop from this unit\'s data (they replace the unit\'s tool lines; shape lines stay).</p><pre class="devlist">' +
      esc(ql.filter(L => L.sel.code >= 0xb0 && L.sel.code <= 0xb5).map(L => Maz.printLine(L, { units: d.units }).ch.join('').trimEnd()).join('\n')) + '</pre>' +
      '<p class="tw-dim">Speeds and feeds are left for you (the control takes them from its cutting-condition tables).</p>';
    $('#devApply').disabled = !editing;
    $('#devDlg')._recs = recs;
  }
  function openDevelop() {
    const t = devTarget();
    if (!t) return note('Put the cursor on a DRILLING, RGH CBOR, REAMING or TAPPING unit, or on a lathe a BAR, CPY, CORNER, FACING, THREAD, T.GROOVE, T.DRILL or T.TAP unit');
    const P = devParams();
    if (C(t.d).type !== 'mill' && t.u.code >= 0x30 && t.u.code <= 0x37) {
      $('#devParams').innerHTML = '<b>Turning tools</b><p class="tw-dim">Up to two tools: R roughing and F finishing (only F when the finishing allowance is 0), cutting the side PART says. ' +
        'THREAD, T.DRILL and T.TAP get one tool; T.GROOVE #0 one F tool, #1–#3 R and F. C-SP, FR and DEP-1 come from your control\'s cutting conditions (pick the tool material there).</p>';
      renderDevelop(); $('#devDlg').showModal(); return;
    }
    $('#devParams').innerHTML = '<b>Machine parameters</b> <span class="tw-dim">(kept in this browser; set them as your control has them)</span>' +
      Object.keys(MazDevelop.NAMES).map(k => `<label class="devp"><span>${esc(k.startsWith('D') ? k : '')} ${esc(MazDevelop.NAMES[k])}</span><input type="number" step="0.01" data-devp="${k}" value="${P[k]}"></label>`).join('') +
      '<button type="button" id="devReset">Back to defaults</button>';
    renderDevelop();
    $('#devDlg').showModal();
  }
  function developEvents() {
    $('#devClose').onclick = () => { $('#devDlg').close(); el.input.focus(); };
    $('#devParams').addEventListener('change', e => {
      const k = e.target.dataset.devp; if (!k) return;
      const all = store.get('mazed-devparams', {}); all[k] = +e.target.value; store.set('mazed-devparams', all); renderDevelop();
    });
    $('#devParams').addEventListener('click', e => { if (e.target.id === 'devReset') { store.set('mazed-devparams', {}); openDevelop(); } });
    $('#devApply').onclick = () => {
      const t = devTarget(), recs = $('#devDlg')._recs;
      if (!t || !recs || locked(t.d)) return;
      const { d, u } = t, ls = ctx(d);
      edit(d => {
        const old = u.seqs.filter(i => ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5).sort((a, b) => b - a);
        for (const i of old) d.p.recs.splice(i, 1);
        // after the unit's TPC records, which come straight after the unit line
        let at = u.i + 1;
        while (at < d.p.recs.length && d.p.recs[at][0] >= 0xd0) at++;
        d.p.recs.splice(at, 0, ...recs.map(r => r.slice()));
        Maz.renumber(d.p); d.ls = null; d.sel = { r: at, c: firstCell(d, at), a: null };
      });
      $('#devDlg').close();
      note('Developed ' + recs.length + ' tool lines (Undo takes them back).', true);
      el.input.focus();
    };
  }
  function refEvents() {
    $('#chkClose').onclick = () => { $('#chkDlg').close(); el.input.focus(); };
    $('#refBody').addEventListener('click', e => { if (e.target.id === 'alarmLoad') $('#alarmFile').click(); });
    $('#alarmFile').addEventListener('change', async () => {
      const f = $('#alarmFile').files[0];
      if (!f) return;
      const h = parseAlarmHelp(new TextDecoder('latin1').decode(await f.arrayBuffer()));
      $('#alarmFile').value = '';
      if (!Object.keys(h).length) return note('That file has no alarm help in it (looking for [Alarm_0001] CAUSE=... sections, or ALARM No. 200 text blocks).');
      alarmHelpCache = h; store.set('mazed-alarmhelp', h); renderRef();
    });
    $('#refDlg').addEventListener('click', e => {
      const b = e.target.closest('[data-reftab]'), m = e.target.closest('[data-refmt]');
      if (b) { $('#refDlg').dataset.tab = b.dataset.reftab; renderRef(); }
      if (m) { $('#refDlg').dataset.mt = m.dataset.refmt; renderRef(); }
    });
    $('#refFind').addEventListener('input', renderRef);
    $('#refClose').onclick = () => { $('#refDlg').close(); el.input.focus(); };
  }
  // a bit field's bits, one per line with what a 1 does; ticking one changes the value (Edit mode)
  function showTpcBits(dn) {
    const f = (tpcSt.fields || []).find(x => x.d === dn), box = $('#tpcBits');
    tpcSt.bitsOf = f && f.bits ? dn : null;
    if (!box) return;
    if (!tpcSt.bitsOf) { box.innerHTML = ''; return; }
    const can = editing && !!$('#tpcBody input[data-tpcd="' + dn + '"]'), df = f && f.def !== undefined && f.def !== null ? f.def : null;
    box.innerHTML = `<div class="tpcbits"><b>${esc(f.d)} ${esc(f.name)}</b> <span class="tw-dim">(bit 7 is on the left; 1 does what is written)</span>` +
      (df === null ? '' : `<div class="tw-dim">Default <span class="bitdef">${df.toString(2).padStart(8, '0')}</span> · now <span class="bitdef">${f.raw.toString(2).padStart(8, '0')}</span>${((f.raw ^ df) & ~(f.ign || 0)) === 0 ? ' · as default' : ' · the yellow bits differ'}${f.ign ? ' · bit ' + [7, 6, 5, 4, 3, 2, 1, 0].filter(k => f.ign >> k & 1).join(', ') + ' is the machine\'s own setting' : ''}</div>`) +
      f.bits.map((b, k) => ({ b, k })).reverse().map(({ b, k }) => `<label class="${(b ? '' : 'tw-dim') + (df !== null && (((f.raw ^ df) & ~(f.ign || 0)) >> k & 1) ? ' diff' : '')}"><input type="checkbox" data-tpcbit="${k}"${f.raw >> k & 1 ? ' checked' : ''}${can ? '' : ' disabled'}> bit ${k}  ${esc(b || '(not used)')}${df !== null ? ` <span class="tw-dim">(default ${df >> k & 1})</span>` : ''}</label>`).join('') + '</div>';
  }
  function tpcEvents() {
    const dlg = $('#tpcDlg');
    dlg.addEventListener('focusin', e => { const i = e.target.closest('input[data-tpcd]'); if (i) { showTpcBits(i.dataset.tpcd); showTpcDraw(i.dataset.tpcd); } });
    dlg.addEventListener('mouseover', e => { const r = e.target.closest('#tpcBody tr'); if (r && r.children[0]) showTpcDraw(r.children[0].textContent); });
    dlg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tpcbits) { showTpcBits(b.dataset.tpcbits); return; }
      if (b.dataset.tpctab) return renderTpc(b.dataset.tpctab);
      const d = tpcSt.d;
      if (b.id === 'tpcEnd') { dlg.close(); el.input.focus(); return; }
      if (b.id === 'tpcCancel') {
        const back = d ? [...tpcSt.orig].filter(([i, r]) => d.p.recs[i] && d.p.recs[i].some((v, k) => v !== r[k])) : [];
        if (back.length && !locked(d)) {
          edit(dd => { for (const [i, r] of back) dd.p.recs[i] = r.slice(); }, d);
          note('TPC put back as it was.', true);
        }
        dlg.close(); el.input.focus(); return;
      }
      if (b.id === 'tpcPrev' || b.id === 'tpcNext') {
        const us = tpcUnits(d), k = us.findIndex(u => u.i === tpcSt.u.i), n = us[k + (b.id === 'tpcPrev' ? -1 : 1)];
        if (n) { select(n.i); openTpc(n); }
      }
    });
    dlg.addEventListener('change', e => {
      const cb = e.target.closest('[data-tpcbit]');
      if (cb) {
        const inp = $('#tpcBody input[data-tpcd="' + tpcSt.bitsOf + '"]');
        if (!inp) return;
        const v = parseInt(inp.value, 2) ^ (1 << +cb.dataset.tpcbit);
        inp.value = v.toString(2).padStart(8, '0');
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const inp = e.target.closest('[data-tpcoff]'), d = tpcSt.d;
      if (!inp || !d || locked(d)) return;
      const main = inp.dataset.tpcrec ? +inp.dataset.tpcrec : tpcSt.u.seqs.find(i => Maz.isTpcMain(d.p.recs[i][0]));
      try {
        const rec = d.p.recs[main].slice();
        Maz.tpcSet(rec, +inp.dataset.tpcoff, inp.dataset.tpckind, inp.value, d.units === 'metric');
        edit(dd => { dd.p.recs[main] = rec; }, d);
        tpcSt.u = Maz.structure(d.p, ctx(d)).find(u => u.i === tpcSt.u.i) || tpcSt.u;
        renderTpc();
      } catch (err) { note(err.message); renderTpc(); }
    });
    dlg.addEventListener('close', () => { tpcSt.d = null; tpcSt.bitsOf = null; });
  }

  // ------------------------------------------------------------------ soft keys
  // The bottom row, as on the control: ◀, ten keys, ▶. Menus have pages (◀ ▶ go round; ◀ in a one-page menu goes back up);
  // a key with ▲ opens another menu. While editing, on a field with choices the keys are the choices (◀ shows the
  // menu again until the cursor moves to another field).
  let skMenu = 'main', skPage = 0, skStack = [], skKeys = [], skFieldOff = '', fieldChoices = [], fieldKey = '';
  let skPending = null, lastSearch = '';
  const SK = {};                                         // key id -> {label, sub, on, off, run, title}
  const key = (id, label, run, more) => (SK[id] = Object.assign({ id, label, run }, more || {}));
  const noDoc = () => !doc(), notProg = () => !isProg(doc()), noEdit = () => !editing;
  key('workno', 'WORK\nNo.', () => popWorkNo(), { sub: true, title: 'Another open program', off: () => !docs.length });
  key('search', 'SEARCH', () => skGo('search'), { sub: true, off: notProg, title: 'Find a unit by number or name' });
  key('edit', 'PROGRAM\nEDIT', () => { if (!editing) setEditing(true); skGo('edit', true); }, { sub: true, off: noDoc, title: 'Edit the program (Ctrl+E)' });
  key('tpc', 'TPC', () => openTpc(), { off: notProg, title: 'The TPC of the unit at the cursor (its own values of the machine\'s D parameters)' });
  key('tpcLines', 'TPC\nLINES', () => ACTIONS.tpc(), { on: () => showTpc, off: notProg, title: 'Show the TPC records in the listing' });
  key('plot', 'TOOL\nPATH', () => ACTIONS.plot(), { on: () => plotOn, off: () => isTool(doc()), title: 'The shapes and the tool path; play it back' });
  key('time', 'MACHIN.\nTIME', () => toggleTime(), { on: () => timeOn, off: () => !doc() || isTool(doc()), title: 'Where the time goes: by unit or tool, in machining order' });
  key('layout', 'PROGRAM\nLAYOUT', () => { timeGroup = 'run'; store.set('mazed-tgroup', 'run'); if (!timeOn) toggleTime(true); else renderTime(true); },
    { sub: true, on: () => timeOn && timeGroup === 'run', off: notProg, title: 'The tool lines in the order they run, with their priority numbers' });
  key('help', 'HELP', () => $('#helpDlg').showModal(), { title: 'The keys' });
  key('check', 'PROGRAM\nCHECK', () => openCheck(), { off: () => !isProg(doc()) && !isEia(doc()), title: 'What the control would stop on, with its alarm numbers' });
  key('codes', 'CODES\nALARMS', () => openRef(), { title: 'G-codes, M-codes, alarms, and what each TPC parameter adjusts' });
  key('calc', 'CALC', () => openCalc(), { title: 'Calculator: WPC X, Y and Th from two probed holes' });
  key('file', 'PROGRAM\nFILE', () => (folder ? side(folderOn ? null : 'folder') : reopenFolder()), { sub: true, on: () => folderOn, title: 'The programs of an opened folder' });
  key('tools', 'TOOL\nDATA', () => ACTIONS.tools(), { on: () => toolsOn, off: notProg, title: 'The program\'s tools, checked against tool data' });
  key('compare', 'COMPARE', () => ACTIONS.compare(), { on: () => cmpOn, off: notProg, title: 'Differences from another open program' });
  key('unoSearch', 'UNIT No.\nSEARCH', () => askEntry('uno', 'Unit number to go to, then Enter'), { off: notProg });
  key('unitSearch', 'UNIT\nSEARCH', () => askEntry('unit', 'Unit name (or part of it, e.g. DRILL), then Enter'), { off: notProg });
  key('lastSearch', 'LAST\nSEARCH', () => searchUnit(lastSearch), { off: () => notProg() || !lastSearch, title: 'The next unit with the last name searched' });
  key('unit-menu', 'INSERT\nUNIT', () => popUnits(), { sub: true, off: () => notProg() || noEdit(), title: 'Insert a unit above the one at the cursor' });
  key('line', 'INSERT\nLINE', () => insertLine(), { off: () => notProg() || noEdit(), title: 'Insert a line after the cursor (Ins)' });
  key('delete', 'ERASE', () => deleteSelection(), { off: () => notProg() || noEdit(), title: 'Erase the line, or the unit on a unit line (Ctrl+Del)' });
  key('copy', 'COPY', () => copySelection(), { off: notProg, title: 'Copy the line or unit (Ctrl+C)' });
  key('paste', 'PASTE', () => paste(), { off: () => notProg() || noEdit() || !clip, title: 'Units above the unit at the cursor, lines after the cursor line (Ctrl+V)' });
  key('up', 'MOVE\nUP', () => moveSelection(-1), { off: () => notProg() || noEdit(), title: 'Alt+↑' });
  key('down', 'MOVE\nDOWN', () => moveSelection(1), { off: () => notProg() || noEdit(), title: 'Alt+↓' });
  key('text', 'AS\nTEXT', () => openText(), { off: notProg, title: 'The unit\'s hole, shape or MANL PRG lines as text' });
  key('undo', 'UNDO', () => undo(false), { off: () => noDoc() || noEdit(), title: 'Ctrl+Z' });
  key('redo', 'REDO', () => undo(true), { off: () => noDoc() || noEdit(), title: 'Ctrl+Y' });
  key('develop', 'TOOL\nDEVELOP', () => openDevelop(), { off: () => notProg() || noEdit(), title: 'Fill the unit\'s tool lines from its data, as the control does (DRILLING, RGH CBOR, REAMING, TAPPING; on lathes the turning units)' });
  key('dup', 'DUPLI-\nCATE', () => duplicateSelection(), { off: () => notProg() || noEdit(), title: 'Ctrl+D' });
  key('cut', 'CUT', () => cutSelection(), { off: () => notProg() || noEdit(), title: 'Ctrl+X' });
  key('coset', 'CONTROL\nOUT SET', () => controlOutSelection(true), { off: () => notProg() || noEdit(), title: 'The control skips the unit (and every unit selected): greyed with ⦸, not run, not in the tool path or time' });
  key('cocancel', 'CONTROL\nOUT CANCEL', () => controlOutSelection(false), { off: () => notProg() || noEdit(), title: 'The unit runs again' });
  key('complete', 'PROGRAM\nCOMPLETE', () => { setEditing(false); }, { title: 'Done editing: back to view only (Ctrl+E)' });
  const SK_MENUS = {
    main: [['workno', 'search', 'edit', 'tpc', 'check', 'plot', 'time', 'layout', 'help', 'file'], ['tools', 'compare', 'tpcLines', 'codes', 'calc', 'plot', 'time', 'layout', 'help', 'file']],
    edit: [['unit-menu', 'line', 'delete', 'copy', 'paste', 'up', 'down', 'text', 'undo', 'complete'],
      ['dup', 'cut', 'redo', 'tpc', 'develop', 'plot', 'time', 'layout', 'help', 'complete'],
      ['coset', 'cocancel', null, null, null, 'plot', 'time', 'layout', 'help', 'complete']],
    search: [['unoSearch', 'unitSearch', 'lastSearch', null, null, null, null, 'codes', 'help', null]],
  };
  function skGo(menu, reset) {
    if (reset) skStack = []; else skStack.push([skMenu, skPage]);
    skMenu = menu; skPage = 0;
    renderSoftKeys();
  }
  function skBack() {
    const pages = (SK_MENUS[skMenu] || SK_MENUS.main).length;
    if (skPage > 0) skPage--;
    else if (pages > 1) skPage = pages - 1;                // pages go round: ◀ on the first page shows the last
    else if (skStack.length) [skMenu, skPage] = skStack.pop();
    renderSoftKeys();
  }
  const skField = () => editing && fieldChoices.length && skFieldOff !== fieldKey;
  function renderSoftKeys() {
    const bar = $('#softkeys');
    if (!bar) return;
    let keys, pages, page;
    if (skField()) {
      pages = Math.ceil(fieldChoices.length / 10);
      page = Math.min(skPage, pages - 1);
      keys = fieldChoices.slice(page * 10, page * 10 + 10).map((c, i) => ({ id: 'choice', label: c, choice: c, n: page * 10 + i }));
    } else {
      const menu = SK_MENUS[skMenu] || SK_MENUS.main;
      pages = menu.length; page = Math.min(skPage, pages - 1);
      keys = menu[page].map(id => (id ? SK[id] : null));
    }
    while (keys.length < 10) keys.push(null);
    skKeys = keys;
    skPage = page;
    const atTop = skField() ? false : pages < 2 && !skStack.length;
    const html = (k, i) => {
      if (!k) return '<button type="button" class="sk blank" disabled></button>';
      const off = k.off ? !!k.off() : false, on = k.on ? !!k.on() : false;
      return `<button type="button" class="sk${k.sub ? ' sub' : ''}${on ? ' on' : ''}${k.choice !== undefined ? ' choice' : ''}" data-sk="${k.choice !== undefined ? 'choice' : k.id}" data-ski="${i}"${off ? ' disabled' : ''}` +
        ` title="${esc((k.title || k.label.replace(/\n/g, ' ')) + (i < 10 ? ' (Alt+' + ((i + 1) % 10) + ')' : ''))}">${esc(k.label).replace(/\n/g, '<br>')}</button>`;
    };
    bar.innerHTML = `<button type="button" class="sk nav" data-sknav="-1" title="${skField() ? 'Back to the menu' : 'Previous page / back'}"${atTop ? ' disabled' : ''}>◀</button>` +
      keys.map(html).join('') + `<button type="button" class="sk nav" data-sknav="1" title="Next page"${pages < 2 ? ' disabled' : ''}>▶</button>`;
    bar.classList.toggle('field', !!skField());
  }
  function pressSoftKey(i) {
    const k = skKeys[i];
    if (!k) return;
    closeMenus();
    if (k.choice !== undefined) { enterValue(k.choice); el.input.focus(); return; }
    if (k.off && k.off()) return;
    Promise.resolve(k.run()).catch(err => note(err.message));
    renderSoftKeys();
    if (!$('#txtDlg').open && !$('#helpDlg').open) el.input.focus();
  }
  // a popup above the bottom row (or at a point)
  function popAt(drop, x, y) {
    closeMenus(drop);
    drop.classList.add('open');
    const w = drop.offsetWidth, h = drop.offsetHeight;
    drop.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, x)) + 'px';
    drop.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, y - h)) + 'px';
  }
  const keyPos = id => { const b = document.querySelector(`#softkeys [data-sk="${id}"]`), r = b ? b.getBoundingClientRect() : { left: 20, top: window.innerHeight - 60 }; return [r.left, r.top - 4]; };
  function popUnits(x, y) { buildUnitMenu(); const [kx, ky] = keyPos('unit-menu'); popAt(el.unitDrop, x !== undefined ? x : kx, y !== undefined ? y + el.unitDrop.offsetHeight : ky); }
  function popWorkNo() {
    const pop = $('#skPop');
    pop.innerHTML = docs.map((d, k) => `<button type="button" data-tab="${k}"${k === cur ? ' class="on"' : ''}>${esc(d.p.name)}</button>`).join('') + '<button type="button" data-act="open">Open…</button>';
    const [x, y] = keyPos('workno');
    popAt(pop, x, y);
  }
  // SEARCH: the entry line takes the unit number or name
  function askEntry(kind, prompt) {
    skPending = kind;
    el.prompt.textContent = prompt;
    el.input.value = '';
    el.input.placeholder = prompt;
    el.input.disabled = false; el.input.readOnly = false;
    el.input.focus();
  }
  function runPending(text) {
    const kind = skPending;
    skPending = null;
    el.input.value = '';
    if (kind === 'uno') {
      const d = doc(), n = +text, u = Maz.structure(d.p, ctx(d)).find(x => Maz.number(d.p.recs[x.i]) === n && x.code !== 1);
      if (!u) note('No UNo ' + text); else select(u.i);
    } else if (kind === 'unit') { lastSearch = text.trim(); searchUnit(lastSearch); }
    render();
  }
  function searchUnit(text) {
    const d = doc();
    if (!isProg(d) || !text) return;
    const us = Maz.structure(d.p, ctx(d)), at = d.sel.r, want = text.toUpperCase();
    const hit = us.find(u => u.i > at && unitName(d.p.ctl, u.code).toUpperCase().includes(want)) || us.find(u => unitName(d.p.ctl, u.code).toUpperCase().includes(want));
    if (!hit) return note('No unit called ' + text);
    select(hit.i);
    note('UNo ' + Maz.number(d.p.recs[hit.i]) + ' ' + unitName(d.p.ctl, hit.code) + ' (LAST SEARCH finds the next one)', true);
  }
  function softKeyEvents() {
    $('#softkeys').addEventListener('mousedown', e => e.preventDefault());       // the cursor stays in the entry line
    $('#softkeys').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.sknav) {
        const dir = +b.dataset.sknav;
        if (dir < 0) { if (skField() && skPage === 0) skFieldOff = fieldKey; else if (skField()) skPage--; else return skBack(); }
        else skPage = skPage + 1 >= (skField() ? Math.ceil(fieldChoices.length / 10) : (SK_MENUS[skMenu] || SK_MENUS.main).length) ? 0 : skPage + 1;
        renderSoftKeys();
        return;
      }
      pressSoftKey(+b.dataset.ski);
    });
    $('#helpClose').onclick = () => { $('#helpDlg').close(); el.input.focus(); };
  }

  // ------------------------------------------------------------------ shape lines as text
  // A unit's shape lines (points, figure lines, MANL PRG lines) as text to copy out and paste lists into: one line
  // per row, tab-separated (what Excel copies), commas or spaces also read. "# X Y ..." names the columns the rows
  // hold; fields not named come from the line now in that place (or the last one). MANL PRG lines read as words,
  // "G1 X1. Y2. F10. S2500 M3". Every row is entered field by field as typed in the editor, then the result is
  // checked (and drawn over the old shape) before Apply writes it as one undo step.
  const txt = { d: null, unit: null, kind: 0, old: [], trial: null, timer: 0 };
  const DATA_ADDR = 'XYZIJKRFPQDHLABC';
  function shapeLinesOf(d, u) {
    const ls = ctx(d), tool = (ls[u.i].lay || {}).tool;
    return u.seqs.filter(i => ls[i].lay && !isTpc(ls[i]) && ls[i].sel.code !== tool && !(ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5));
  }
  // column names for a layout: its labels, "N P Q R" split into N, P, Q, R; the figure start mark is START
  function colNames(lay) {
    const labels = lay.cells.map((c, k) => Maz.cellLabel(lay, k) || ''), seen = {}, out = [];
    labels.forEach((l, k) => {
      const group = labels.filter(x => x === l).length, words = l.split(/\s+/).filter(Boolean);
      let name;
      if (!l) name = k === 0 && lay.cells[0][2] === 26 ? 'START' : '';
      else if (group > 1 && words.length === group) { seen[l] = (seen[l] || 0) + 1; name = words[seen[l] - 1]; }
      else if (group > 1) name = l.replace(/\s+/g, '') + (seen[l] = (seen[l] || 0) + 1);
      else name = l.replace(/\s+/g, '').replace(/^RAD\/TH\.?$/i, 'R/TH');
      out.push(name ? name.toUpperCase().replace(/\.$/, '') : '');
    });
    return out;
  }
  const blankText = t => !t || t === '<>' || t === '-' || t === '◆';
  function cellOut(L, k, units) { if (Maz.locked(L, k)) return ''; const t = Maz.cellText(L, k, { units }).trim(); return blankText(t) ? '' : t; }
  // MANL PRG line <-> words
  function manlWords(L, units) {
    const c = L.lay.cells, w = [];
    for (const k of [0, 1]) { const t = cellOut(L, k, units); if (t !== '' && !(k === 1 && t === '0' && false)) w.push('G' + t); }
    for (let s = 0; s < 6; s++) { const a = cellOut(L, 2 + 2 * s, units), v = cellOut(L, 3 + 2 * s, units); if (a) w.push(a + v); }
    const sp = cellOut(L, 14, units); if (sp) w.push('S' + sp);
    const mb = cellOut(L, 15, units), mv = cellOut(L, 16, units); if (mv) w.push((mb || 'M') + mv);
    return w.join(' ');
  }
  function manlEnter(L, row, units) {
    const words = row.toUpperCase().match(/[A-Z]\s*[-+]?[\d.]+/g) || [];
    if (row.replace(/[A-Z]\s*[-+]?[\d.]+/gi, '').trim()) throw new Error('not G-code words: "' + row.replace(/[A-Z]\s*[-+]?[\d.]+/gi, '').trim() + '"');
    const set = (k, v) => { if (v === '') { if (!Maz.locked(L, k)) Maz.clear(L, k); } else Maz.enter(L, k, v, { units }); };
    const g = [], data = [];
    let s = '', m = '';
    for (const w of words) {
      const a = w[0], v = w.slice(1).trim();
      if (a === 'G') g.push(v);
      else if (a === 'S') s = v;
      else if (a === 'M') m = v;
      else if (DATA_ADDR.includes(a)) data.push([a, v]);
      else throw new Error('a MANL PRG line has no ' + a + ' word');
    }
    if (g.length > 2) throw new Error('at most two G codes on a line');
    if (data.length > 6) throw new Error('at most six address words on a line (DATA 1-6)');
    set(0, g[0] || ''); set(1, g[1] || '');
    for (let i = 0; i < 6; i++) { const [a, v] = data[i] || ['', '']; set(2 + 2 * i, a); set(3 + 2 * i, v); }
    set(14, s);
    if (m) { Maz.enter(L, 15, 'M', { units }); set(16, m); } else set(16, '');
  }
  function openText() {
    const d = doc();
    if (!isProg(d)) return note('Shape lines as text are for Mazatrol programs');
    const u = d.sel.r >= 0 ? unitOf(d, d.sel.r) : null;
    const lines = u ? shapeLinesOf(d, u) : [];
    if (!u || !lines.length) return note('Put the cursor on a unit with shape, hole or MANL PRG lines first');
    const ls = ctx(d), kind = ls[lines[0]].sel.code;
    Object.assign(txt, { d, unit: u, kind, old: lines.map(i => ({ i, rec: d.p.recs[i].slice() })) });
    const tag = 'UNo ' + Maz.number(d.p.recs[u.i]) + ' ' + unitName(d.p.ctl, u.code);
    $('#tdTitle').textContent = tag + ' · ' + lines.length + (kind === 0xa1 ? ' MANL PRG lines' : kind === 0xc0 ? ' hole lines' : ' shape lines') + ' as text';
    let text;
    if (kind === 0xa1) text = '# G-code words: G1 G2, up to six of ' + DATA_ADDR.split('').join(' ') + ', S, M\n' + lines.map(i => manlWords(ls[i], d.units)).join('\n');
    else {
      const names = colNames(ls[lines[0]].lay);
      const used = names.map((n, k) => n && lines.some(i => !Maz.locked(ls[i], k)));
      const cols = names.map((n, k) => (used[k] ? k : -1)).filter(k => k >= 0);
      text = '# ' + cols.map(k => names[k]).join('\t') + '\n' + lines.map(i => cols.map(k => cellOut(ls[i], k, d.units)).join('\t')).join('\n');
    }
    $('#tdText').value = text + '\n';
    $('#tdApply').disabled = !editing;
    $('#tdApply').title = editing ? 'Write these lines into the unit (one undo step)' : 'Turn on Edit (Ctrl+E) to write them into the program';
    $('#txtDlg').showModal();
    checkText();
    $('#tdText').focus();
  }
  // the text as records, entered into a copy of the program: {recs, errors: [[row, message]], warnings, trial}
  function parseText(text) {
    const d = txt.d, u = txt.unit, ls = ctx(d), units = d.units, errors = [], recs = [];
    const rows = text.split(/\r?\n|\r/);
    let names = null, cols = null, n = 0;
    const lay0 = ls[txt.old[0].i].lay, all = txt.kind === 0xa1 ? null : colNames(lay0);
    // a trial program with the unit's shape lines replaced by one template line per row
    const body = [];
    rows.forEach((row, r) => {
      const t = row.trim();
      if (!t) return;
      if (t[0] === '#') {
        if (txt.kind === 0xa1) return;
        names = t.slice(1).trim().split(/\t|,|\s+/).map(x => x.trim().toUpperCase().replace(/\.$/, '')).filter(Boolean);
        cols = names.map(nm => all.indexOf(nm === 'RAD/TH' ? 'R/TH' : nm));
        const bad = names.filter((nm, k) => cols[k] < 0);
        if (bad.length) errors.push([r + 1, 'no column ' + bad.join(', ') + ' here (columns: ' + all.filter(Boolean).join(' ') + ')']);
        return;
      }
      body.push({ r: r + 1, row });
    });
    if (!body.length) errors.push([0, 'no lines: a unit needs at least one']);
    if (txt.kind !== 0xa1 && !names) { names = all.filter(Boolean); cols = names.map(nm => all.indexOf(nm)); }
    const tmpl = k => (txt.old[Math.min(k, txt.old.length - 1)] || txt.old[0]).rec.slice();
    const newRecs = body.map((b, k) => tmpl(k));
    const at = txt.old[0].i, keep = d.p.recs.filter((r, i) => !txt.old.some(o => o.i === i));
    const trial = { ctl: d.p.ctl, name: d.p.name, header: d.p.header, raw: d.p.raw, recs: keep.slice(0, at - txt.old.filter(o => o.i < at).length).concat(newRecs, keep.slice(at - txt.old.filter(o => o.i < at).length)), warnings: [] };
    Maz.renumber(trial);
    const tl = Maz.lines(trial);
    body.forEach((b, k) => {
      const i = at + k, L = Object.assign({}, tl[i], { rec: trial.recs[i] });
      try {
        if (txt.kind === 0xa1) { manlEnter(L, b.row, units); return; }
        const sep = b.row.includes('\t') ? '\t' : b.row.includes(',') ? ',' : /\s/;
        const vals = b.row.split(sep).map(x => x.trim());
        if (sep instanceof RegExp) { while (vals.length && vals[0] === '') vals.shift(); }
        if (vals.length > names.length) throw new Error(vals.length + ' values for ' + names.length + ' columns (' + names.join(' ') + ')');
        // in layout order, so the pattern (PTN) is set before the fields it opens up
        const order = cols.map((c, j) => [c, j]).filter(x => x[0] >= 0).sort((a, b2) => a[0] - b2[0]);
        for (const [c, j] of order) {
          const v = vals[j] === undefined ? '' : vals[j];
          try {
            if (blankText(v)) { if (!Maz.locked(L, c)) Maz.clear(L, c); }
            else Maz.enter(L, c, v, { units });
          } catch (e) { throw new Error(names[j] + ' "' + v + '": ' + e.message); }
        }
      } catch (e) { errors.push([b.r, e.message]); }
    });
    return { trial, errors, n: body.length, rows: body };
  }
  // what else looks wrong: the unit's plot notes, the control's line limits, repeated or far-off points
  function textWarnings(res) {
    const d = txt.d, out = [], ui = Maz.structure(d.p, ctx(d)).findIndex(x => x.i === txt.unit.i);
    const tag = 'UNo ' + Maz.number(d.p.recs[txt.unit.i]) + ' ';
    try {
      const r = Paths.program(res.trial, d.units);
      for (const n of r.notes) if (n.startsWith(tag)) out.push(n.slice(tag.length));
    } catch (e) { out.push('the cutter path cannot be worked out: ' + e.message); }
    out.push(...Maz.limits(res.trial));
    let g = [];
    try { g = Plot.geometry(res.trial, d.units).filter(it => it.unit === ui); } catch (e) { out.push('the shape cannot be drawn: ' + e.message); }
    if (txt.kind === 0xc2) {                              // an arc's R must reach from the point before it
      const tl = Maz.lines(res.trial), at = txt.old[0].i, num = t => (t === '' ? null : parseFloat(t));
      let x = null, y = null;
      for (let k = 0; k < res.n; k++) {
        const L = tl[at + k], ptn = cellOut(L, 1, d.units), nx = num(cellOut(L, 2, d.units)), ny = num(cellOut(L, 3, d.units));
        const r = num(cellOut(L, 4, d.units)), ij = cellOut(L, 5, d.units) !== '' || cellOut(L, 6, d.units) !== '';
        const ex = nx === null ? x : nx, ey = ny === null ? y : ny;
        if (/^(CW|CCW)$/.test(ptn) && r !== null && !ij && x !== null && ex !== null) {
          const chord = Math.hypot(ex - x, ey - y);
          if (Math.abs(r) < chord / 2 - 1e-4) out.push('line ' + (k + 1) + ': ' + ptn + ' R' + Maz.fixed(Math.abs(r), 4) + ' cannot reach from X' + Maz.fixed(x, 4) + ' Y' + Maz.fixed(y, 4) + ' to X' + Maz.fixed(ex, 4) + ' Y' + Maz.fixed(ey, 4) + ' (needs at least R' + Maz.fixed(chord / 2, 4) + ')');
        }
        x = ex; y = ey;
      }
    }
    if (txt.kind === 0xc0) {
      const pts = g.filter(it => it.kind === 'hole').map(it => it.pts[0]);
      const key = q => q[0].toFixed(4) + ',' + q[1].toFixed(4), seen = new Map();
      pts.forEach((q, k) => { const s = key(q); if (seen.has(s)) out.push('hole ' + (k + 1) + ' is at the same X Y as hole ' + (seen.get(s) + 1)); else seen.set(s, k); });
      if (pts.length >= 4) {
        const nn = pts.map((q, k) => Math.min(...pts.filter((o, j) => j !== k).map(o => Math.hypot(o[0] - q[0], o[1] - q[1]))));
        const med = nn.slice().sort((a, b) => a - b)[Math.floor(nn.length / 2)];
        nn.forEach((v, k) => { if (med > 0 && v > 6 * med && v > (d.units === 'metric' ? 25 : 1)) out.push('hole ' + (k + 1) + ' is far from all the others (X' + Maz.fixed(pts[k][0], 4) + ' Y' + Maz.fixed(pts[k][1], 4) + '): a typo?'); });
      }
    }
    return { warnings: out, geom: g };
  }
  function checkText() {
    clearTimeout(txt.timer);
    const res = parseText($('#tdText').value);
    txt.res = res;
    const w = res.errors.length ? { warnings: [], geom: [] } : textWarnings(res);
    const old = (() => { try { const ui = Maz.structure(txt.d.p, ctx(txt.d)).findIndex(x => x.i === txt.unit.i); return Plot.geometry(txt.d.p, txt.d.units, ctx(txt.d)).filter(it => it.unit === ui); } catch (e) { return []; } })();
    const box = $('#tdCheck');
    box.innerHTML = (res.errors.length
      ? `<div class="td-bad">✗ ${res.errors.length} line${res.errors.length > 1 ? 's' : ''} cannot be entered:</div>` + res.errors.slice(0, 30).map(([r, m]) => `<div class="td-err" data-row="${r}">line ${r}: ${esc(m)}</div>`).join('')
      : `<div class="td-ok">✓ ${res.n} line${res.n > 1 ? 's' : ''} enter${res.n > 1 ? '' : 's'} cleanly</div>`) +
      w.warnings.map(m => `<div class="td-warn">⚠ ${esc(m)}</div>`).join('');
    $('#tdApply').disabled = !editing || !!res.errors.length;
    drawTextPreview(old, w.geom);
  }
  function drawTextPreview(old, now) {
    const cv = $('#tdPrev'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 220;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05080b'; g.fillRect(0, 0, W, H);
    const all = old.concat(now).flatMap(it => it.pts);
    if (!all.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const pad = 14, s = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-6), (H - 2 * pad) / Math.max(y1 - y0, 1e-6));
    const X = x => pad + (x - x0) * s + ((W - 2 * pad) - (x1 - x0) * s) / 2, Y = y => H - pad - (y - y0) * s - ((H - 2 * pad) - (y1 - y0) * s) / 2;
    const draw = (items, color, wdt) => {
      g.strokeStyle = color; g.lineWidth = wdt;
      for (const it of items) {
        g.beginPath();
        if (it.kind === 'hole') { const [x, y] = it.pts[0]; g.arc(X(x), Y(y), 3.5, 0, 2 * Math.PI); }
        else it.pts.forEach(([x, y], k) => (k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
    };
    draw(old, '#3a444f', 3);
    draw(now, '#5dff8f', 1.5);
    if (now.length) {                                      // where each hole or shape starts
      const p0 = now[0].pts[0];
      g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(X(p0[0]), Y(p0[1]), 3, 0, 2 * Math.PI); g.fill();
    }
  }
  function applyText() {
    const res = txt.res, d = txt.d;
    if (!res || res.errors.length || d !== doc() || locked(d)) return;
    const recs = res.trial.recs.slice(txt.old[0].i, txt.old[0].i + res.n);
    const same = recs.length === txt.old.length && recs.every((r, k) => { const o = d.p.recs[txt.old[k].i]; return r.every((v, j) => (j === 2 || j === 3 ? true : v === o[j])); });
    if (same) { $('#txtDlg').close(); note('No change.', true); el.input.focus(); return; }
    edit(d => {
      const old = txt.old.map(o => o.i).sort((a, b) => b - a);
      for (const i of old) d.p.recs.splice(i, 1);
      d.p.recs.splice(txt.old[0].i, 0, ...recs.map(r => r.slice()));
      Maz.renumber(d.p);
      d.ls = null;
      d.sel = { r: txt.old[0].i, c: firstCell(d, txt.old[0].i), a: null };
    });
    $('#txtDlg').close();
    note('Wrote ' + res.n + ' line' + (res.n > 1 ? 's' : '') + ' into UNo ' + Maz.number(d.p.recs[txt.unit.i]) + ' (Undo takes them back).', true);
    el.input.focus();
  }
  function textEvents() {
    $('#tdText').addEventListener('input', () => { clearTimeout(txt.timer); txt.timer = setTimeout(checkText, 250); });
    $('#tdCancel').onclick = () => { $('#txtDlg').close(); el.input.focus(); };
    $('#tdApply').onclick = applyText;
    $('#tdCopy').onclick = () => { const t = $('#tdText'); t.select(); try { navigator.clipboard.writeText(t.value); note('Copied.', true); } catch (e) { document.execCommand('copy'); } };
    // click a problem: go to its line in the text
    $('#tdCheck').addEventListener('click', e => {
      const r = +((e.target.closest('[data-row]') || {}).dataset || {}).row;
      if (!r) return;
      const ta = $('#tdText'), lines = ta.value.split('\n');
      const a = lines.slice(0, r - 1).reduce((s, l) => s + l.length + 1, 0);
      ta.focus(); ta.setSelectionRange(a, a + (lines[r - 1] || '').length);
    });
    // a Tab key types a tab (columns), not the next button
    $('#tdText').addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const ta = e.target, a = ta.selectionStart; ta.setRangeText('\t', a, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
    });
  }

  // ------------------------------------------------------------------ machining time window
  // Where a program's time goes: by unit (a subprogram's units under its SUB PRO unit) or by tool, a strip of the
  // run in machining order, and the tool changes. Hover shows it on the plot, click goes to its unit (and keeps it
  // shown), double-click plays the path up to its end. It floats over the editor or opens in a window of its own.
  let timeOn = false, timeGroup = store.get('mazed-tgroup', 'unit'), timeSort = { k: 'order', dir: 1 }, timePin = null, timePop = null;
  let timeKey = '', timeRows = new Map();
  const timeOpen = new Set();                            // expanded SUB PRO rows
  const TOOL_COLORS = ['#3fa7ff', '#3ee06a', '#ffb347', '#d77bff', '#ff6b6b', '#35c6f4', '#ffe14d', '#7bd389', '#ff8ad8', '#a0a8ff', '#f4a261', '#4dd0c4'];
  const toolNames = new WeakMap();
  // a tool line's tool as "E-MILL 0.75 A" (programTools names), by program and record
  function toolName(p, rec, units) {
    if (!p || rec < 0) return '';
    let m = toolNames.get(p);
    if (!m || m.units !== units) {
      m = new Map(); m.units = units;
      for (const t of Maz.programTools(p, units)) for (const i of t.lines) m.set(i, (t.name + ' ' + t.nomText + (t.sfx ? ' ' + t.sfx : '')).trim());
      toolNames.set(p, m);
    }
    return m.get(rec) || '';
  }
  function timeModel(d) {
    const s = scene(d);
    if (s.timeModel) return s.timeModel;
    const eia = isEia(d), units = eia ? null : Maz.structure(d.p, ctx(d));
    const top = new Map(), tools = new Map(), strip = [];
    let cut = 0, rapid = 0, changes = 0, lastTool = null, run = -1;
    const row = (map, key, init) => {
      let r = map.get(key);
      if (!r) map.set(key, r = Object.assign({ key, cut: 0, rapid: 0, items: [], tools: new Set(), uidx: new Set(), where: new Set(), order: map.size + 1, kids: null, loads: 0 }, init));
      return r;
    };
    const add = (r, k, t, fast, tool, ui, where) => { r[fast ? 'rapid' : 'cut'] += t; r.items.push(k); if (tool) r.tools.add(tool); r.uidx.add(ui); if (where) r.where.add(where); };
    s.items.forEach((it, k) => {
      const m = it.move;
      if (!m) return;
      const t = it.t || 0, fast = m.kind === 'rapid';
      let tool, tr, leaf = null;
      if (eia) {
        tool = m.tool ? 'T' + m.tool : '';
        if (!fast && tool && tool !== lastTool) run++;
        tr = row(top, 'r' + Math.max(run, 0), { label: (tool || 'start') + ' · from line ' + ((m.line || 0) + 1), line: m.line || 0 });
      } else {
        const u = units[it.unit];
        const subName = u && u.code === 5 ? ' ' + String.fromCharCode(...d.p.recs[u.i].slice(36, 68)).replace(/\0[\s\S]*$/, '').trim() : '';
        tr = row(top, 'u' + it.unit, { label: u ? 'UNo ' + Maz.number(d.p.recs[u.i]) + ' ' + unitName(d.p.ctl, u.code) + subName : 'program', rec: u ? u.i : 0 });
        const sb = m.sub;
        if (sb) {
          tool = sb.eia ? sb.name + ' T' + (sb.tool || 0) : toolName(sb.p, sb.toolRec, d.units);
          const lk = tr.key + '/' + sb.name + '/' + (sb.eia ? 'T' + sb.tool : sb.unit);
          leaf = row(tr.kids || (tr.kids = new Map()), lk, { label: sb.eia ? sb.name + ' T' + (sb.tool || 0) : sb.name + ' › ' + (sb.label || ''),
            short: sb.eia ? 'T' + (sb.tool || 0) : (sb.name.includes(' › ') ? sb.name.slice(sb.name.indexOf(' › ') + 3) + ' › ' : '') + (sb.label || ''), rec: tr.rec, child: true });
        } else tool = toolName(d.p, m.toolRec, d.units);
      }
      const where = leaf ? leaf.label : tr.label;
      // for the tool rows: the program (a called one, or this one) and the UNo
      const uno = ((leaf ? (m.sub.label || '') : tr.label).match(/UNo (\d+)/) || [, ''])[1];
      const wkey = (m.sub ? m.sub.name : '') + '\u0000' + uno;
      add(tr, k, t, fast, tool, it.unit, null);
      if (leaf) add(leaf, k, t, fast, tool, it.unit, null);
      if (fast) rapid += t; else cut += t;
      const tk = tool || '—';
      const trow = row(tools, 'T:' + tk, { label: tk, rec: tr.rec, line: tr.line });
      if (!eia && trow.tline === undefined && !fast) {
        const tp = m.sub ? (m.sub.eia ? null : m.sub.p) : d.p, ti = m.sub ? m.sub.toolRec : m.toolRec;
        if (tp && ti >= 0) { trow.tp = tp; trow.tline = ti; }
      }
      add(trow, k, t, fast, tool, it.unit, fast ? null : wkey);
      // under the tool row (opened with ▸): each unit it works in, with its time
      add(row(trow.kids || (trow.kids = new Map()), trow.key + '/' + wkey, { label: where, rec: tr.rec, line: tr.line, child: true }), k, t, fast, tool, it.unit, null);
      if (!fast && tool && tool !== lastTool) { changes++; trow.loads++; lastTool = tool; }
      // the strip: one piece per run of the same unit (subprogram unit) in machining order
      const sk = (leaf || tr).key, last = strip[strip.length - 1];
      if (last && last.key === sk && (last.tool === tk || fast)) { last.t += t; last.items.push(k); }
      else strip.push({ key: sk, tkey: 'T:' + tk, tool: tk, label: where, t, items: [k] });
    });
    const tlist = [...tools.values()];
    tlist.forEach((r, i) => { r.color = TOOL_COLORS[i % TOOL_COLORS.length]; });
    return (s.timeModel = { top: [...top.values()], tools: tlist, strip, cut, rapid, changes, eia });
  }
  // ---- run order: the tool lines in the order the control runs them, with their priority numbers to change
  // (type a No., drag a row, or ▲▼). Rows above the divider get numbers 1, 2, 3 ... in the order shown; rows
  // below it have none and run after them, top to bottom. Each process (pallet change, PROC END) on its own.
  const unitsOf = new WeakMap();
  function unitOfLine(p, i) {
    let m = unitsOf.get(p);
    if (!m) { m = []; for (const u of Maz.structure(p, Maz.lines(p))) { m[u.i] = u; for (const k of u.seqs) m[k] = u; } unitsOf.set(p, m); }
    return m[i] || null;
  }
  const PRI_CELL = c => c[0] === 22 && c[1] === 2 && c[3] === 2048;
  const progName = p => p.name.replace(/\.[^.]*$/, '');
  function runModel(d) {
    const s = scene(d);
    if (s.runModel) return s.runModel;
    const rows = [];
    (s.runs || []).forEach((r, i) => {
      const u = unitOfLine(r.p, r.line), items = [];
      let t = 0;
      for (let k = s.first + r.at; k < s.first + r.end; k++) { items.push(k); t += s.items[k].t || 0; }
      rows.push({ key: 'R:' + i, i, k: r.k, p: r.p, line: r.line, pri: r.pri, proc: r.proc, unit: u, items, t, cut: t, rapid: 0, uidx: new Set([r.unit]),
        tool: toolName(r.p, r.line, d.units) || '—', prog: r.p === d.p ? '' : progName(r.p),
        where: (u ? 'UNo ' + Maz.number(r.p.recs[u.i]) + ' ' + unitName(r.p.ctl, u.code) : '') + ' · SNo ' + Maz.number(r.p.recs[r.line]),
        rec: r.p === d.p ? r.line : (s.items[s.first + r.at] || {}).rec });
    });
    // what the control would stop with: two tools with one No. in a process (alarm 461), lines of a unit out of order (462)
    for (const r of rows) {
      r.warn = [];
      if (r.pri && rows.some(o => o !== r && o.proc === r.proc && o.pri && o.pri.n === r.pri.n && o.tool !== r.tool)) r.warn.push('No. ' + r.pri.n + ' is also on a different tool in this process (the control stops: alarm 461)');
      const before = rows.find(o => o.i > r.i && o.p === r.p && o.unit === r.unit && o.line < r.line);
      if (before) r.warn.push('runs before SNo ' + Maz.number(r.p.recs[before.line]) + ' of its own unit (the control stops: alarm 462)');
    }
    return (s.runModel = rows);
  }
  // the rows of one process as shown: [rows with numbers ..., 'divider', rows without ...]; * rows are kept apart
  function runList(rows, proc) {
    const mine = rows.filter(r => r.proc === proc && !(r.pri && r.pri.later));
    const lastNum = mine.reduce((a, r, k) => (r.pri ? k : a), -1);
    return mine.slice(0, lastNum + 1).concat(['divider'], mine.slice(lastNum + 1));
  }
  // set priority numbers: [{p, line, n (0 clears)}], each program changed in its own tab with an undo step
  function setPriorities(changes) {
    const d = doc();
    if (!changes.length || !d || locked(d)) return;
    const by = new Map();
    for (const c of changes) { if (!by.has(c.p)) by.set(c.p, []); by.get(c.p).push(c); }
    for (const p of by.keys()) {
      if (!docs.some(x => isProg(x) && x.p === p)) return note(progName(p) + ' is read from the folder: open it (it gets its own tab) to change its priority numbers.');
    }
    try {
      for (const [p, cs] of by) {
        const dd = docs.find(x => isProg(x) && x.p === p);
        edit(dd => {
          for (const c of cs) {
            const L = ctx(dd)[c.line], k = L.lay.cells.findIndex(PRI_CELL), rec = L.rec.slice();
            if (k < 0) throw new Error('This tool line has no priority number field');
            if (c.n > 0) Maz.enter(Object.assign({}, L, { rec }), k, String(c.n), { units: dd.units }); else Maz.clear(Object.assign({}, L, { rec }), k);
            dd.p.recs[c.line] = rec;
          }
        }, dd);
      }
      note('Priority numbers changed' + (by.size > 1 ? ' in ' + [...by.keys()].map(progName).join(', ') : '') + ' (Undo in each program\'s tab).', true);
    } catch (e) { note(e.message); }
  }
  // Put the rows in the order of list. First try changing only the moved row's No.: a number that sorts it into place
  // (the control runs equal numbers in program order) without sharing a No. with another tool; else number the rows
  // above the divider 1, 2, 3 ... and clear the rest (only what changes is written).
  function applyRunList(list, moved) {
    const k = list.indexOf('divider'), changes = [];
    const above = list.slice(0, k);
    if (moved && !above.includes(moved)) {
      if (moved.pri) return setPriorities([{ p: moved.p, line: moved.line, n: 0 }]);
    } else if (moved && above.every(r => r === moved || r.pri)) {
      const want = above.map(r => r.key), others = above.filter(r => r !== moved);
      const fits = n => {
        const got = others.map(r => ({ r, n: r.pri.n })).concat([{ r: moved, n }]).sort((a, b) => a.n - b.n || a.r.k - b.r.k).map(x => x.r.key);
        return got.every((key, i) => key === want[i]) && !others.some(r => r.pri.n === n && r.tool !== moved.tool);
      };
      const cur = moved.pri ? moved.pri.n : 0, ok = [];
      for (let n = 1; n <= 99; n++) if (fits(n)) ok.push(n);
      if (ok.length) {
        // keep its number if it still fits, else the one nearest the row it now follows
        const i = above.indexOf(moved), near = i > 0 ? above[i - 1].pri.n : 1;
        const n = ok.includes(cur) ? cur : ok.sort((a, b) => Math.abs(a - near) - Math.abs(b - near) || a - b)[0];
        if (n !== cur) setPriorities([{ p: moved.p, line: moved.line, n }]);
        return;
      }
    }
    list.forEach((r, i) => {
      if (r === 'divider') return;
      const n = i < k ? i + 1 : 0;
      if ((r.pri ? r.pri.n : 0) !== n) changes.push({ p: r.p, line: r.line, n });
    });
    if (changes.some(c => c.n > 99)) return note('Priority numbers go up to 99.');
    setPriorities(changes);
  }
  function runOrderHtml(d, fmt) {
    const rows = runModel(d), procs = [...new Set(rows.map(r => r.proc))], tcolor = new Map((timeModel(d).tools || []).map(r => [r.label, r.color]));
    if (!rows.length) return '<p class="tw-dim">No tool lines to put in order.</p>';
    let html = '', n = 0, prevTool = null;
    const can = editing;
    for (const proc of procs) {
      if (procs.length > 1) html += `<tr class="tw-proc"><td colspan="7">Process ${procs.indexOf(proc) + 1}${proc ? ' (after a pallet change or PROC END)' : ''}</td></tr>`;
      const list = runList(rows, proc).concat(rows.filter(r => r.proc === proc && r.pri && r.pri.later));
      for (const r of list) {
        if (r === 'divider') {
          html += `<tr class="tw-div" data-divider="${proc}"><td colspan="7">${list.indexOf('divider') ? '▲ these run first, in this order · ' : ''}no priority number: these run after, top to bottom${can ? ' · drag a line above here to number it' : ''}</td></tr>`;
          continue;
        }
        timeRows.set(r.key, r);
        const change = r.tool !== prevTool; prevTool = r.tool; n++;
        const later = r.pri && r.pri.later;
        html += `<tr data-row="${r.key}" class="${change ? 'tw-tc' : ''}${timePin && timePin.key === r.key ? ' tw-pin' : ''}"${can && !later ? ' draggable="true"' : ''}>` +
          `<td class="tw-grip2">${can && !later ? '⋮⋮' : ''}</td><td class="tw-no">${n}</td>` +
          `<td><input class="tw-pri" type="number" min="1" max="99" data-pri="${r.key}" value="${r.pri ? r.pri.n : ''}" placeholder="—"${can && !later ? '' : ' disabled'} title="${can ? 'Priority number (blank: none)' : 'Turn on Edit (Ctrl+E) to change priority numbers'}">${later ? '<span class="tw-dim" title="Marked * : runs after everything else"> *</span>' : ''}</td>` +
          `<td class="tw-name"><span class="tw-sw" style="background:${tcolor.get(r.tool) || '#555'}"></span>${esc(r.tool)}${change && n > 1 ? ' <span class="tw-dim">· tool change</span>' : ''}</td>` +
          `<td class="tw-where">${r.prog ? `<span class="tw-dim">${esc(r.prog)} ›</span> ` : ''}${esc(r.where)}${r.warn.length ? ` <span class="tw-warn" title="${esc(r.warn.join('\n'))}">⚠ ${esc(r.warn[0])}</span>` : ''}</td>` +
          `<td class="num">${fmt(r.t)}</td>` +
          `<td class="tw-mv">${can && !later ? `<button type="button" data-mv="-1" data-key="${r.key}" title="Run earlier">▲</button><button type="button" data-mv="1" data-key="${r.key}" title="Run later">▼</button>` : ''}</td></tr>`;
      }
    }
    return `<div class="tw-scroll"><table class="tt tw-t tw-run"><thead><tr><th></th><th>#</th><th>No.</th><th>Tool</th><th>Program › unit · line</th><th class="num">Time</th><th></th></tr></thead><tbody>${html}</tbody></table></div>`;
  }
  // move a row one place (▲▼) or before another row / the divider (drag), within its process
  function moveRun(key, target) {
    const d = doc(), rows = d ? runModel(d) : [], r = rows.find(x => x.key === key);
    if (!r || locked(d)) return;
    const list = runList(rows, r.proc), from = list.indexOf(r);
    if (from < 0) return;
    list.splice(from, 1);
    let to;
    if (typeof target === 'number') to = Math.max(0, Math.min(list.length, from + target));
    else if (target === 'divider') to = list.indexOf('divider') + (from <= list.indexOf('divider') ? 1 : 0);   // dropped on the divider: it crosses it
    else { const t = rows.find(x => x.key === target); if (!t || t.proc !== r.proc) return note('Lines cannot move to another process (past a pallet change or PROC END).'); to = list.indexOf(t); if (to < 0) return; }
    list.splice(to, 0, r);
    applyRunList(list, r);
  }
  function runEvents(root) {
    root.addEventListener('change', e => {
      const k = e.target.dataset.pri;
      if (k === undefined) return;
      const d = doc(), r = d && runModel(d).find(x => x.key === k);
      if (!r) return;
      const v = e.target.value === '' ? 0 : Math.round(+e.target.value);
      if (v < 0 || v > 99) { note('Priority numbers go from 1 to 99 (blank: none).'); renderTime(true); return; }
      setPriorities([{ p: r.p, line: r.line, n: v }]);
    });
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-mv]');
      if (b) { e.stopPropagation(); moveRun(b.dataset.key, +b.dataset.mv); }
    }, true);
    let dragKey = null;
    root.addEventListener('dragstart', e => { const t = e.target.closest('tr[data-row]'); if (!t) return; dragKey = t.dataset.row; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey); t.classList.add('tw-dragging'); });
    root.addEventListener('dragend', () => { dragKey = null; root.querySelectorAll('.tw-dragging, .tw-over').forEach(x => x.classList.remove('tw-dragging', 'tw-over')); });
    root.addEventListener('dragover', e => {
      const t = e.target.closest('tr[data-row], tr[data-divider]');
      if (!dragKey || !t) return;
      e.preventDefault();
      root.querySelectorAll('.tw-over').forEach(x => x.classList.remove('tw-over'));
      t.classList.add('tw-over');
    });
    root.addEventListener('drop', e => {
      const t = e.target.closest('tr[data-row], tr[data-divider]');
      if (!dragKey || !t) return;
      e.preventDefault();
      const k = dragKey; dragKey = null;
      if (t.dataset.row !== k) moveRun(k, t.dataset.divider !== undefined ? 'divider' : t.dataset.row);
    });
  }
  function timeRoot() { return timePop && !timePop.closed ? timePop.document.getElementById('twRoot') : $('#twRoot'); }
  function renderTime(force) {
    const btn = $('#timeBtn');
    if (btn) btn.classList.toggle('on', timeOn);
    $('#timeWin').hidden = !timeOn || !!(timePop && !timePop.closed);
    if (!timeOn) return;
    const d = doc(), root = timeRoot();
    if (!d || isTool(d)) { root.innerHTML = '<p class="tw-empty">Open a program to see where its time goes.</p>'; timeKey = ''; return; }
    const M = timeModel(d), atc = Math.max(0, +store.get('mazed-atc', 0) || 0);
    const key = [d.id, d.scene.key, timeGroup, timeSort.k, timeSort.dir, [...timeOpen].join(','), atc, timePin ? timePin.key : '', timePop ? 'w' : 'p', editing].join('|');
    if (!force && key === timeKey) return;
    if (timeKey.split('|').slice(0, 2).join('|') !== key.split('|').slice(0, 2).join('|')) { timePin = null; plotFocus = null; }
    timeKey = key;
    timeRows = new Map();
    const total = M.cut + M.rapid + M.changes * atc, pct = v => (total > 0 ? v / total * 100 : 0);
    const tcolor = new Map(M.tools.map(r => [r.key, r.color]));
    const fmt = t => (t < 60 ? (Math.round(t * 10) / 10).toFixed(1) + ' s' : clock(t));
    const byRun = timeGroup === 'run' && !M.eia, byTool = timeGroup === 'tool';
    const sorters = { order: (a, b) => a.order - b.order, name: (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }),
      cut: (a, b) => a.cut - b.cut, rapid: (a, b) => a.rapid - b.rapid, total: (a, b) => (a.cut + a.rapid) - (b.cut + b.rapid) };
    const sortRows = list => list.slice().sort((a, b) => sorters[timeSort.k](a, b) * timeSort.dir || a.order - b.order);
    const big = Math.max(1e-9, ...(byTool ? M.tools : M.top).map(r => r.cut + r.rapid));
    const rowHtml = (r, depth) => {
      timeRows.set(r.key, r);
      const t = r.cut + r.rapid, kids = r.kids && r.kids.size, open = timeOpen.has(r.key);
      const exp = kids ? `<button type="button" class="tw-exp" data-exp="${esc(r.key)}" title="${open ? 'Hide' : 'Show'} ${byTool ? 'the units it works in' : 'the units of the program it calls'}">${open ? '▾' : '▸'}</button>` : '';
      const chip = x => `<span class="tw-chip" style="border-color:${tcolor.get('T:' + x) || '#555'}">${esc(x)}</span>`;
      const toolsCell = r.tools.size > 4 ? `<span class="tw-dim" title="${esc([...r.tools].join(', '))}">${r.tools.size} tools · </span>` + [...r.tools].slice(0, 2).map(chip).join(' ') + ' …'
        : [...r.tools].map(chip).join(' ');
      const sw = byTool ? `<span class="tw-sw" style="background:${r.color}"></span>` : '';
      let h = `<tr data-row="${esc(r.key)}" class="${depth ? 'tw-child' : ''}${timePin && timePin.key === r.key ? ' tw-pin' : ''}">` +
        `<td class="tw-no">${exp}${depth ? '' : r.order}</td><td class="tw-name">${sw}${esc(depth && r.short ? r.short : r.label)}</td><td class="tw-tools">${byTool ? (depth ? '' : usedIn(r)) : toolsCell}</td>` +
        (byTool && !M.eia ? `<td class="tw-dia">${depth || r.tline === undefined ? '' : diaCell(r)}</td>` : '') +
        `<td class="num">${fmt(r.cut)}</td><td class="num">${fmt(r.rapid)}</td><td class="num"><b>${fmt(t)}</b></td>` +
        `<td class="tw-share"><div class="tw-bar"><i class="c" style="width:${r.cut / big * 100}%"></i><i class="r" style="width:${r.rapid / big * 100}%"></i></div><span>${pct(t).toFixed(1)}%</span></td></tr>`;
      if (kids && open) for (const c of [...r.kids.values()]) h += rowHtml(c, 1);
      return h;
    };
    // the diameter rpm comes from, editable: entered here > the tool data's actual diameter > NOM-D
    function diaCell(r) {
      const info = toolDia(d, r.tp, r.tline, nomDiaOf(r.tp, r.tline, d.units));
      const dp = d.units === 'metric' ? 3 : 4;
      return `<input class="tw-diain" type="number" min="0" step="${d.units === 'metric' ? 0.01 : 0.001}" data-dia="${esc(info.label)}" value="${+info.dia.toFixed(dp)}" title="${esc(info.label)}: from ${info.from}${info.note ? ' (' + esc(info.note) + ')' : ''}. Enter the diameter the control uses; clear it to go back.">` +
        `<span class="tw-from ${info.from === 'NOM-D' ? '' : 'set'}">${info.from}</span>`;
    }
    // "9 units · 2× in the spindle" (▸ opens the units); the full list on hover
    function usedIn(r) {
      const by = new Map();
      for (const w of r.where) { const [prog, uno] = w.split('\u0000'); if (!by.has(prog)) by.set(prog, []); if (uno) by.get(prog).push(uno); }
      const all = [...by].map(([prog, unos]) => (prog ? prog + ': ' : '') + (unos.length ? 'UNo ' + unos.join(' ') : '')).join(' · ');
      const n = r.where.size;
      return `<span class="tw-dim" title="${esc(all)}">${n} unit${n === 1 ? '' : 's'}${r.loads ? ' · ' + r.loads + '× in the spindle' : ''}</span>`;
    }
    const rows = sortRows(byTool ? M.tools : M.top).map(r => rowHtml(r, 0)).join('');
    for (const r of M.top) if (r.kids) for (const c of r.kids.values()) timeRows.set(c.key, c);
    for (const r of M.tools) { timeRows.set(r.key, r); if (r.kids) for (const c of r.kids.values()) timeRows.set(c.key, c); }
    const strip = M.strip.map(g => `<div class="tw-sg" data-row="${esc(byTool ? g.tkey : g.key)}" style="flex-grow:${g.t};background:${tcolor.get(g.tkey) || '#555'}" title="${esc(g.label + ' · ' + g.tool + ' · ' + fmt(g.t))}"></div>`).join('');
    const sortMark = k => (timeSort.k === k ? (timeSort.dir > 0 ? ' ▴' : ' ▾') : '');
    root.innerHTML =
      `<div class="tw-sum"><span class="tw-prog">${esc(d.p.name)}</span><span class="tw-total">≈ ${clock(total)}</span>` +
      `<span>cutting <b>${clock(M.cut)}</b></span><span>rapid <b>${clock(M.rapid)}</b></span>` +
      `<span>${M.changes} tool changes × <input id="twAtc" type="number" min="0" step="0.5" value="${atc}" title="Seconds per tool change (chip to chip); 0 leaves them out"> s${atc ? ' = <b>' + clock(M.changes * atc) + '</b>' : ''}</span></div>` +
      (M.eia ? '' : `<div class="tw-fixed" title="Seconds for units that take time without cutting (kept in this browser). Defaults: a Smooth horizontal's own estimates.">` +
        [['mms', 'MMS / probe line'], ['index', 'INDEX'], ['pallet', 'PALT CHG'], ['mcode', 'M-CODE']].map(([k, l]) =>
          `<label>${l} <input type="number" min="0" step="0.1" data-fixed="${k}" value="${k === 'mms' && fixedTimes().mmsBy ? '' : fixedTimes()[k]}"${k === 'mms' ? ' placeholder="by type" title="Blank: by what each probe line measures (Z-FACE 3 s, X-FACE 1.8, Y-FACE 2.1, X-STP and Y-STP 5.2, Y-GRV 3.1, XY-BOS 8.5, BORE-XY 7.1: averages of the times the control gives). Enter seconds to use one time for every line."' : ''}> s</label>`).join('') +
        `<button type="button" data-preset="spec" title="Mazak horizontal spec sheet: tool change 3.5 s chip to chip, pallet change 9 s, index 1.9 s per 90°">Mazak horizontal spec</button>` +
        `<button type="button" data-preset="est" title="Match the control's own TOOL PATH estimate (it leaves tool changes out)">Like the control's estimate</button></div>`) +
      `<div class="tw-strip" title="The run in machining order (priority numbers and subprograms followed), colored by tool">${strip}</div>` +
      `<div class="tw-ctl"><div class="seg"><button type="button" data-tg="unit" class="${byTool ? '' : 'on'}">${M.eia ? 'tool runs' : 'units'}</button><button type="button" data-tg="tool" class="${byTool ? 'on' : ''}">tools</button>${M.eia ? '' : `<button type="button" data-tg="run" class="${byRun ? 'on' : ''}" title="The tool lines in the order they run, with their priority numbers">run order</button>`}</div>` +
      `<span class="tw-dim">${byRun ? (editing ? 'type a No., drag a line or use ▲▼; the order updates as you go' : 'turn on Edit (Ctrl+E) to change priority numbers here') : 'hover: show on the plot · click: go to it and keep it shown · double-click: play up to its end'}</span></div>` +
      (byRun ? runOrderHtml(d, fmt) : `<div class="tw-scroll"><table class="tt tw-t"><thead><tr><th data-sort="order">#${sortMark('order')}</th><th data-sort="name">${byTool ? 'Tool' : M.eia ? 'Tool run' : 'Unit'}${sortMark('name')}</th>` +
      `<th>${byTool ? 'Used in' : 'Tools'}</th>${byTool && !M.eia ? '<th title="The diameter rpm is worked out from: the actual diameter in the tool data, or one you enter here (blank: NOM-D)">Dia for rpm</th>' : ''}<th class="num" data-sort="cut">Cutting${sortMark('cut')}</th><th class="num" data-sort="rapid">Rapid${sortMark('rapid')}</th>` +
      `<th class="num" data-sort="total">Total${sortMark('total')}</th><th data-sort="total">Share</th></tr></thead><tbody>${rows}</tbody></table></div>`) +
      `<p class="tw-dim tw-foot">From the programmed speeds and feeds and the cutter paths worked out here (approximate); rapids at ${d.units === 'metric' ? '25 m' : '1000 in'}/min.</p>`;
    if (timePop && !timePop.closed) timePop.document.title = 'Machining time — ' + d.p.name;
    if (timePin) setFocus(timeRows.get(timePin.key) || null, true);
  }
  function setFocus(r, quiet) {
    plotFocus = r ? Object.assign(new Set(r.items), { units: r.uidx }) : null;
    if (!quiet || plotOn) drawPlot();
  }
  function timeGo(r) {
    const d = doc();
    if (!d || !r) return;
    if (!plotOn) side('plot');
    if (isEia(d)) gotoLine(r.line || 0);
    else if (r.rec !== undefined) select(r.rec);
  }
  function timeEvents(root) {
    runEvents(root);
    root.addEventListener('mouseover', e => { const t = e.target.closest('[data-row]'); if (t) setFocus(timeRows.get(t.dataset.row)); });
    root.addEventListener('mouseleave', () => setFocus(timePin));
    root.addEventListener('mouseout', e => { if (e.target.closest('[data-row]') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-row]'))) setFocus(timePin); });
    root.addEventListener('click', e => {
      if (e.target.closest('input')) return;
      const b = e.target.closest('button, th[data-sort], [data-row]');
      if (!b) return;
      if (b.dataset.preset) {
        const spec = b.dataset.preset === 'spec';
        store.set('mazed-atc', spec ? 3.5 : 0);
        store.set('mazed-fixed', spec ? { pallet: 9, index: 1.9 } : {});
        diaVer++; render(); renderTime(true);
        note(spec ? 'Mazak horizontal spec: tool change 3.5 s, pallet change 9 s, index 1.9 s.' : 'Times set to match the control\'s own estimate.', true);
        return;
      }
      if (b.dataset.tg) { timeGroup = b.dataset.tg; store.set('mazed-tgroup', timeGroup); timeSort = { k: 'order', dir: 1 }; timePin = null; renderTime(); return; }
      if (b.dataset.exp) { if (timeOpen.has(b.dataset.exp)) timeOpen.delete(b.dataset.exp); else timeOpen.add(b.dataset.exp); renderTime(); return; }
      if (b.dataset.sort) { const k = b.dataset.sort; timeSort = timeSort.k === k ? { k, dir: -timeSort.dir } : { k, dir: k === 'order' || k === 'name' ? 1 : -1 }; renderTime(); return; }
      if (b.dataset.row) {
        const r = timeRows.get(b.dataset.row);
        timePin = timePin && timePin.key === b.dataset.row ? null : r;
        timeGo(r);
        renderTime(true);
        setFocus(timePin || r);
      }
    });
    root.addEventListener('dblclick', e => {
      const t = e.target.closest('[data-row]'), d = doc();
      if (!t || !d || !d.scene) return;
      const r = timeRows.get(t.dataset.row);
      let last = -1;
      for (const k of r.items) if (d.scene.items[k].step > last) last = d.scene.items[k].step;
      timePin = null; plotFocus = null;
      if (!plotOn) side('plot');
      stopPlay();
      if (last >= 0) playTo(last + 1);
      renderTime(true);
    });
    root.addEventListener('change', e => {
      if (e.target.id === 'twAtc') { store.set('mazed-atc', Math.max(0, +e.target.value || 0)); renderTime(true); }
      if (e.target.dataset.preset) return;
      if (e.target.dataset.fixed !== undefined) {
        const all = store.get('mazed-fixed', {}), v = e.target.value === '' ? NaN : +e.target.value;
        if (v >= 0) all[e.target.dataset.fixed] = v; else delete all[e.target.dataset.fixed];
        store.set('mazed-fixed', all); diaVer++; render();
      }
      if (e.target.dataset.dia !== undefined) { const d = doc(); if (d) setToolDia(d, e.target.dataset.dia, e.target.value === '' ? 0 : +e.target.value); }
    });
  }
  function toggleTime(on) {
    timeOn = on === undefined ? !timeOn : on;
    if (!timeOn) {
      timePin = null; plotFocus = null;
      if (timePop && !timePop.closed) timePop.close();
      timePop = null;
      if (plotOn) drawPlot();
    } else if (!plotOn) side('plot');
    renderTime(true);
  }
  function popTime() {
    if (timePop && !timePop.closed) { timePop.focus(); return; }
    const w = window.open('', 'mazedTime', 'width=820,height=660');
    if (!w) return note('The browser blocked the new window; allow pop-ups for this page.');
    const css = Array.from(document.querySelectorAll('style')).map(x => x.textContent).join('\n');
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Machining time</title><style>' + css.replace(/<\//g, '<\\/') + '</style></head><body class="twpop"><div class="tw-in" id="twRoot"></div></body></html>');
    w.document.close();
    timePop = w;
    timeEvents(w.document.getElementById('twRoot'));
    w.addEventListener('pagehide', () => { if (timePop === w) { timePop = null; timeKey = ''; if (timeOn) renderTime(true); } });
    renderTime(true);
  }
  function timeWinEvents() {
    const win = $('#timeWin'), head = $('#twHead');
    timeEvents($('#twRoot'));
    $('#twClose').onclick = () => toggleTime(false);
    $('#twPop').onclick = popTime;
    let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const b = win.getBoundingClientRect();
      drag = { x: e.clientX - b.left, y: e.clientY - b.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!drag) return;
      win.style.left = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - drag.x)) + 'px';
      win.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.y)) + 'px';
      win.style.right = 'auto';
    });
    head.addEventListener('pointerup', () => { drag = null; });
    window.addEventListener('beforeunload', () => { if (timePop && !timePop.closed) timePop.close(); });
  }

  // ------------------------------------------------------------------ chrome: tabs, menus, units
  const UNIT_GROUPS = {
    mill: [
      ['Program', [6, 7, 5, 0x17, 4]],
      ['Coordinates', [2, 3, 0xf, 0xc, 8, 0x11, 0x14, 0xa, 0xb]],
      ['Point machining', [0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b]],
      ['Line machining', [0x40, 0x41, 0x42, 0x43, 0x44, 0x50, 0x51, 0x52, 0x53]],
      ['Face machining', [0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x7f]],
    ],
    lathe: [
      ['Program', [6, 7, 5, 0x17, 4, 0x10]],
      ['Turning', [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x39]],
      ['Spindles', [0x12, 0x13, 0x15, 0x16, 2, 0xf, 0xc]],
      ['Point machining', [0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29]],
      ['Line / face machining', [0x40, 0x41, 0x42, 0x43, 0x44, 0x50, 0x51, 0x52, 0x53, 0x60, 0x61, 0x62, 0x63, 0x66]],
    ],
  };
  UNIT_GROUPS.millturn = UNIT_GROUPS.lathe.concat([['Mill-turn', [0x11, 0x14, 8, 0x7f]]]);
  function buildUnitMenu() {
    const d = doc(), ctl = d ? d.p.ctl : 'MatrixM';
    let html = '';
    for (const [g, codes] of UNIT_GROUPS[Maz.CONTROLS[ctl].type]) {
      const items = codes.filter(c => Maz.lines({ ctl, recs: [Maz.newRecord(c, 0)] })[0].lay);
      if (!items.length) continue;
      html += `<div class="gh">${esc(g)}</div>` + items.map(c => `<button type="button" data-unit="${c}">${esc(unitName(ctl, c))}</button>`).join('');
    }
    el.unitDrop.innerHTML = html;
  }
  function buildSaveAsMenu() {
    const d = doc();
    if (!d) { el.saveasDrop.innerHTML = ''; return; }
    const type = C(d).type;
    el.saveasDrop.innerHTML = Object.entries(Maz.CONTROLS).filter(([, K]) => K.type === type)
      .map(([ctl, K]) => `<button type="button" data-act="saveas" data-ctl="${ctl}">${esc(K.label)} .${K.ext}</button>` +
        (K.raw ? `<button type="button" data-act="saveas" data-ctl="${ctl}" data-raw="1" title="The control's own program file, as in Smooth CAM Ai's MC_Machine Programs folder">${esc(K.label)}, machine file .${K.raw}</button>` : '')).join('');
  }
  function buildNewMenu() {
    el.newDrop.innerHTML = Object.entries(Maz.CONTROLS)
      .map(([ctl, K]) => `<button type="button" data-newctl="${ctl}">${esc(K.label)} .${K.ext}</button>`).join('');
  }
  function renderTabs() {
    el.tabs.innerHTML = docs.map((d, k) =>
      `<div class="tab${k === cur ? ' cur' : ''}" data-tab="${k}" title="${esc(d.p.name)} (${esc(C(d).label)})">${d.dirty ? '<span class="dirty">●</span>' : ''}${esc(d.p.name)}` +
      `<button type="button" class="x" data-close="${k}" title="Close">×</button></div>`).join('');
  }
  function renderUnits() {
    const d = doc();
    document.querySelectorAll('#unitsSeg button').forEach(b => b.classList.toggle('on', !!d && b.dataset.units === d.units));
    $('#typeSeg').hidden = !isTool(d) && !isEia(d);
    $('#typeSeg').title = isEia(d) ? 'The machine the EIA program is for: lathes read X as a diameter and have the turning cycles' : $('#typeSeg').dataset.title || $('#typeSeg').title;
    document.querySelectorAll('#typeSeg button').forEach(b => b.classList.toggle('on', (isTool(d) && b.dataset.ttype === d.t.type) || (isEia(d) && b.dataset.ttype === d.g.type)));
  }
  // light (the control's screen colors) or dark (default); kept in this browser
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    store.set('mazed-theme', t);
    const b = $('#themeBtn');
    if (b) { b.textContent = t === 'light' ? 'Dark' : 'Light'; b.title = 'Switch to the ' + (t === 'light' ? 'dark' : 'light') + ' screen'; }
    renderPlot();
  }
  function render() {
    sessionSave();
    renderTabs();
    renderUnits();
    renderUnitList();
    renderScreen();
    renderEntry();
    renderPlot();
    renderTools();
    renderCompare();
    renderFolder();
    const d = doc();
    document.querySelectorAll('[data-need-doc]').forEach(b => { b.disabled = !d; });
    document.querySelectorAll('[data-need-program]').forEach(b => { b.disabled = (!!d && !isProg(d)) || (b.hasAttribute('data-need-doc') && !d); });
    document.querySelectorAll('[data-need-plot]').forEach(b => { b.disabled = isTool(d); });
    document.querySelectorAll('[data-need-edit]').forEach(b => { if (!editing) b.disabled = true; });
    document.body.classList.toggle('viewonly', !editing);
    el.input.readOnly = !editing || el.input.classList.contains('locked');
    el.gtext.readOnly = !editing;
    if (!d) document.title = 'Mazatrol Editor';
    renderTime();
  }
  function closeMenus(except) {
    document.querySelectorAll('.drop.open').forEach(m => { if (m !== except) m.classList.remove('open'); });
  }

  const ACTIONS = {
    theme() { setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); },
    unitlist() { unitListOn = !unitListOn; store.set('mazed-unitlist', unitListOn); renderUnitList(); },
    open: openFiles, save, print: printListing, listing: saveListing, sheet: printSheet, sheettxt: saveSheet,
    plot() { side(plotOn ? null : 'plot'); },
    tools() { side(toolsOn ? null : 'tools'); },
    compare() { side(cmpOn ? null : 'compare'); },
    folder: openFolder,
    edit() { setEditing(!editing); },
    time() { toggleTime(); },
    text: openText,
    tpc() { showTpc = !showTpc; store.set('mazed-tpc', showTpc); render(); },
    line: insertLine, delete: deleteSelection, copy: copySelection, paste, dup: duplicateSelection, cut: cutSelection,
    up: () => moveSelection(-1), down: () => moveSelection(1), undo: () => undo(false), redo: () => undo(true),
  };

  el.toolSrc.addEventListener('change', () => {
    const d = doc();
    if (!d) return;
    const v = el.toolSrc.value;
    d.toolSrc = v === 'none' ? 'none' : v[0] === 'm' ? folderSources()[+v.slice(1)] : docs[+v];
    renderTools();
  });
  let searchTimer = null;
  el.folderSearch.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderFolder, 200); });
  el.folderList.addEventListener('click', e => {
    const x = e.target.closest('[data-p]');
    if (x) openFromFolder(+x.dataset.p, x.dataset.l !== undefined ? +x.dataset.l : undefined);
  });
  el.dirInput.addEventListener('change', async () => {
    const files = Array.from(el.dirInput.files).filter(f => {
      const parts = (f.webkitRelativePath || f.name).split('/');       // root/[dir/[MC_Machine Programs/]]file
      return folderWanted(f.name) && (parts.length <= 3 || (parts.length === 4 && /^MC_Machine Programs$/i.test(parts[2])));
    });
    const root = ((el.dirInput.files[0] && el.dirInput.files[0].webkitRelativePath) || '').split('/')[0] || 'folder';
    const entries = files.map(f => ({ name: f.name, path: (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name, file: f }));
    el.dirInput.value = '';
    await loadFolder(root, entries);
  });
  el.cmpWith.addEventListener('change', () => {
    const d = doc();
    if (!d || !docs[+el.cmpWith.value]) return;
    d.cmpWith = docs[+el.cmpWith.value];
    renderCompare();
  });
  el.cmpList.addEventListener('click', e => {
    const it = e.target.closest('.it[data-k]'), d = doc();
    if (!it || !d || !d.cmp) return;
    const x = d.cmp.items[+it.dataset.k];
    const r = x.ib >= 0 ? x.ib : Math.max(0, Math.min(d.p.recs.length - 1, Math.ceil(x.pos)));
    select(r); el.input.focus();
  });
  el.toolsInfo.addEventListener('click', e => {
    const b = e.target.closest('[data-mach]'), d = doc();
    if (!b || !d) return;
    d.toolSrc = folderSources()[+b.dataset.mach];
    renderTools();
  });
  el.toolsList.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-line]');
    if (tr) { select(+tr.dataset.line); el.input.focus(); }
  });

  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-tab]');
    if (!t) { if (!e.target.closest('.menu')) closeMenus(); return; }
    if (t.dataset.close !== undefined) { e.stopPropagation(); closeDoc(+t.dataset.close); return; }
    if (t.dataset.tab !== undefined) { closeMenus(); cur = +t.dataset.tab; render(); el.input.focus(); return; }
    if (t.dataset.units) {
      const d = doc();
      if (d) { d.units = t.dataset.units; d.view = null; if (d.g) d.g.unitsSet = true; store.set('mazed-units', d.units); render(); }
      return;
    }
    if (t.dataset.ttype) { setToolType(t.dataset.ttype); return; }
    if (t.dataset.ang) {
      const d = doc();
      if (d) { const [yaw, pitch] = Plot.VIEWS[t.dataset.ang]; d.ang = { name: t.dataset.ang, yaw, pitch }; d.view = null; renderPlot(); }
      return;
    }
    if (t.dataset.view) {
      const d = doc();
      if (d) { d.plotView = t.dataset.view; d.view = null; renderPlot(); }
      return;
    }
    if (t.dataset.unit) { closeMenus(); insertUnit(+t.dataset.unit); el.input.focus(); return; }
    if (t.dataset.newctl) { closeMenus(); newProgram(t.dataset.newctl); el.input.focus(); return; }
    if (t.dataset.act === 'saveas') { closeMenus(); saveAs(t.dataset.ctl, !!t.dataset.raw); return; }
    const act = t.dataset.act;
    if (act && /-menu$/.test(act)) {
      const drop = t.parentElement.querySelector('.drop');
      if (act === 'unit-menu') buildUnitMenu();
      if (act === 'saveas-menu') buildSaveAsMenu();
      if (act === 'new-menu') buildNewMenu();
      closeMenus(drop);
      drop.classList.toggle('open');
      return;
    }
    if (act && ACTIONS[act]) {
      closeMenus();
      Promise.resolve(ACTIONS[act]()).catch(err => note(err.message));
      if (act !== 'open' && act !== 'save' && act !== 'print') el.input.focus();
    }
  });

  el.lines.addEventListener('contextmenu', contextMenu);
  $('#ctxMenu').addEventListener('click', e => { const b = e.target.closest('[data-ctx]'); if (b && !b.disabled) contextAction(b.dataset.ctx); });
  document.addEventListener('mousedown', e => { if (!e.target.closest('#ctxMenu')) $('#ctxMenu').hidden = true; }, true);
  window.addEventListener('blur', () => { $('#ctxMenu').hidden = true; });
  $('#unitList').addEventListener('mousedown', e => e.preventDefault());              // the cursor stays in the entry line
  $('#unitList').addEventListener('click', e => { const b = e.target.closest('[data-ui]'); if (b) { select(+b.dataset.ui); el.input.focus(); } });
  el.lines.addEventListener('mousedown', e => {
    const d = doc(), line = e.target.closest('.ln[data-r]');
    if (!d || !line || e.button === 2) return;
    e.preventDefault();
    const r = +line.dataset.r, span = e.target.closest('[data-c]');
    let c;
    if (span) c = +span.dataset.c;
    else {
      // left of the first field (numbers, unit name) or past the end: nearest field by column
      const cells = rowCells(d, r), ch = charWidth(), col = Math.floor((e.clientX - line.getBoundingClientRect().left - 14) / ch);
      let bd = 1e9;
      for (const k of cells) { const dd = Math.abs(cellCol(d, r, k) - col); if (dd < bd) { bd = dd; c = k; } }
    }
    select(r, c, e.shiftKey);
    el.input.focus();
  });
  let cw = 0;
  function charWidth() {
    if (cw) return cw;
    const s = document.createElement('span');
    s.textContent = 'M'.repeat(100);
    s.style.visibility = 'hidden';
    el.lines.appendChild(s);
    cw = s.getBoundingClientRect().width / 100 || 9;
    s.remove();
    return cw;
  }

  el.input.addEventListener('keydown', e => entryKey(e));
  function entryKey(e) {
    const k = e.key, mod = e.ctrlKey || e.metaKey, empty = !el.input.value;
    if (!editing && k.length === 1 && !mod && !e.altKey && doc()) note(VIEW_ONLY);
    if (k === 'Enter') { e.preventDefault(); commit(true); }
    else if (k === 'Escape') { el.input.value = ''; note(''); closeMenus(); }
    else if (k === 'Tab') {
      e.preventDefault();
      if (!empty) { if (!enterValue(el.input.value)) return; }
      moveCell(e.shiftKey ? -1 : 1, true);
    }
    else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      if (e.altKey) moveSelection(k === 'ArrowUp' ? -1 : 1);
      else moveRow(k === 'ArrowUp' ? -1 : 1, e.shiftKey);
    }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && empty) { e.preventDefault(); moveCell(k === 'ArrowLeft' ? -1 : 1); }
    else if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); moveRow((k === 'PageUp' ? -1 : 1) * 20, e.shiftKey); }
    else if ((k === 'Home' || k === 'End') && (empty || mod)) {
      e.preventDefault();
      const d = doc();
      if (!d) return;
      if (mod) select(k === 'Home' ? -1 : d.p.recs.length - 1);
      else { const cells = rowCells(d, d.sel.r); if (cells.length) select(d.sel.r, cells[k === 'Home' ? 0 : cells.length - 1]); }
    }
    else if (k === 'Delete' && mod) { e.preventDefault(); deleteSelection(); }
    else if ((k === 'Delete' || k === 'Backspace') && empty && !mod) { e.preventDefault(); clearField(); }
    else if (k === 'Insert') { e.preventDefault(); insertLine(); }
    else if (e.altKey && /^Digit[0-9]$/.test(e.code)) { e.preventDefault(); pressSoftKey((+e.code.slice(5) + 9) % 10); }
  }
  // keys that move the cursor through the program (not those that type, or press a button: Enter, Space, Tab)
  const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];
  el.input.addEventListener('input', () => { if (el.msg.textContent && !el.msg.classList.contains('ok')) note(''); });

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const inField = e.target === el.input, inText = e.target === el.gtext;
    const textSel = inField && el.input.selectionStart !== el.input.selectionEnd;
    if (mod && k === 'e') { e.preventDefault(); setEditing(!editing); }
    else if (mod && k === 's') { e.preventDefault(); save(); }
    else if (mod && k === 'o') { e.preventDefault(); openFiles(); }
    else if (mod && k === 'p') { e.preventDefault(); printListing(); }
    else if (mod && (k === 'z' || k === 'y') && !(inField && el.input.value)) { e.preventDefault(); undo(k === 'y' || e.shiftKey); }
    else if (mod && k === 'c' && !inText && !textSel && !(inField && el.input.value)) { e.preventDefault(); copySelection(); }
    else if (mod && k === 'v' && !inText && !(inField && el.input.value) && clip) { e.preventDefault(); paste(); }
    else if (mod && k === 'd' && !inText && isProg(doc())) { e.preventDefault(); duplicateSelection(); }
    else if (mod && k === 'x' && !inText && !textSel && !(inField && el.input.value) && isProg(doc())) { e.preventDefault(); cutSelection(); }
    else if (e.key === 'Escape' && !$('#ctxMenu').hidden) { $('#ctxMenu').hidden = true; }
    else if (!inField && !mod && doc() && !isEia(doc()) && NAV_KEYS.includes(e.key) && !e.target.closest('input, textarea, select, dialog, #ctxMenu')) {
      // after a click on a soft key or another button the focus is there: move the cursor all the same
      el.input.focus();
      entryKey(e);
    }
    else if (!inField && !mod && doc() && (e.key.length === 1 || ['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace', 'PageUp', 'PageDown', 'Home', 'End', 'Insert'].includes(e.key))
      && !e.target.closest('input, textarea, select, button')) {
      if (isEia(doc())) el.gtext.focus(); else el.input.focus();      // the key lands in the entry line (EIA: the text)
    }
  });

  el.fileInput.addEventListener('change', async () => {
    for (const f of el.fileInput.files) openBytes(new Uint8Array(await f.arrayBuffer()), f.name, null);
    el.fileInput.value = '';
  });
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', async e => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items || []).filter(i => i.kind === 'file');
    for (const it of items) {
      const h = it.getAsFileSystemHandle ? await it.getAsFileSystemHandle() : null;
      if (h && h.kind === 'file') await openHandle(h);
      else { const f = it.getAsFile(); if (f) openBytes(new Uint8Array(await f.arrayBuffer()), f.name, null); }
    }
  });
  window.addEventListener('beforeunload', e => {
    if (!SESSION.ok && docs.some(d => d.dirty)) { e.preventDefault(); e.returnValue = ''; }   // kept for the next visit otherwise
  });
  window.addEventListener('pagehide', () => sessionSave(true));

  // no accept filter: phones (Android, iOS) do not know .PBM .PBD ... and grey them out; any file can be picked and
  // the ones that are not programs or tool data say so when opened
  buildNewMenu();
  plotEvents();
  bitsEvents();
  eiaEvents();
  timeWinEvents();
  textEvents();
  softKeyEvents();
  guideEvents();
  tpcEvents();
  refEvents();
  developEvents();
  calcEvents();
  render();
  el.input.focus();
  setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  sessionRestore();

  // test hook
  window.MazEditor = { docs, doc, openBytes, select, enterValue, commit, insertUnit, insertLine, deleteSelection, copySelection, paste, moveSelection, undo, saveAs, listing, newProgram, render, ctx, setToolType, toolCheck, setupSheet, side, loadFolder, openFromFolder, folder: () => folder,
    plotStats: () => lastStats, playAction, playTo, gotoLine, scene: () => (doc() ? doc().scene : null), save, duplicateSelection, cutSelection, contextAction,
    setEditing, editing: () => editing, cube: () => cubeHit, openDevelop, openTpc, openRef, openCalc, wpcFromHoles, wpcFromHolesY, fitHoles, boltCircle, parseAlarmHelp, openCheck, programCheck: () => programCheck(doc()), softKey: id => { const k = SK[id]; if (!k || (k.off && k.off())) return false; k.run(); renderSoftKeys(); return true; },
    skOn: id => !!(SK[id].on && SK[id].on()), skOff: id => !!(SK[id].off && SK[id].off()), pressSoftKey,
    guideMin: () => guideMin, setTheme, softKeys: () => skKeys.map(k => (k ? (k.choice !== undefined ? k.choice : k.id) : null)), openText, timeModel: () => timeModel(doc()), toggleTime, plotFocus: () => plotFocus };
})();
