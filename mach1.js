// MACH1: make, read and change Mazatrol programs by name instead of by byte.
//
//   const MACH1 = require('./mach1.js');                 // Node; in a browser load dist/mach1.bundle.js
//   const p = MACH1.program({ control: 'SmoothM', name: 'PLATE', units: 'inch', comment: 'TEST PLATE' });
//   p.common({ MAT: 'AL', 'INITIAL-Z': 1 });
//   const u = p.unit('DRILLING', { DIA: 0.25, DEPTH: 0.5, CHMF: 0 });
//   u.tool({ TOOL: 'CTR-DR', 'NOM-D': 0.5, 'C-SP': 75, FR: 0.003 });
//   u.tool({ TOOL: 'DRILL', 'NOM-D': 0.25, 'HOLE-D': 0.25, 'HOLE-DEP': 0.5, RGH: 'PCK1', DEPTH: 0.1, 'C-SP': 60, FR: 0.004 });
//   u.line('FIG', { PTN: 'PT', Z: 0, X: 1, Y: 1 });
//   fs.writeFileSync(p.fileName, p.save());
//
// Fields are named as the Mazatrol screen heads them (DIA, DEPTH, TOOL, NOM-D, APRCH-X ...), values are typed as on
// the screen (numbers in the program's units, menu words such as PCK1 or CW). A name used twice on one line gets
// #2, #3 (M, M#2, M#3); every field can also be named by its byte position, @36. FIELDS.md lists them all.
// Programs also go to and from JSON (toJSON / fromJSON) so any language can write them.
(function (root) {
  'use strict';
  const Maz = root.Maz || (typeof require !== 'undefined' ? require('./lib/core.js') : null);
  if (!Maz) throw new Error('MACH1 needs lib/core.js');
  if (typeof require !== 'undefined' && !root.Maz && !Maz.__mach1) { Maz.useSchema(require('./lib/schema.json')); Maz.__mach1 = true; }

  const CONTROLS = Maz.CONTROLS;
  const norm = s => String(s).toUpperCase().replace(/[\s_.-]+/g, '');
  const hex = r => Array.from(r, b => b.toString(16).padStart(2, '0')).join('');
  const unhex = h => { const r = new Uint8Array(Maz.REC); for (let i = 0; i < Maz.REC && 2 * i < h.length; i++) r[i] = parseInt(h.substr(2 * i, 2), 16); return r; };

  // ---------------------------------------------------------------- names
  function control(c) {
    if (CONTROLS[c]) return c;
    const n = norm(c || 'SmoothM');
    const hit = Object.keys(CONTROLS).find(k => norm(k) === n || norm(CONTROLS[k].label) === n || norm(CONTROLS[k].ext) === n);
    if (!hit) throw new Error('Unknown control "' + c + '". Use one of: ' + Object.keys(CONTROLS).join(', '));
    return hit;
  }
  // unit name -> code for a control ('COMMON' is the common unit)
  const unitCodes = {}, unitNames = {};
  // the units each kind of machine offers (as the editor's Insert unit menu); files may hold others, kept by code
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  const MILL_UNITS = [6, 7, 5, 0x17, 2, 3, 0xf, 0xc, 8, 0x11, 0x14, 0xa, 0xb].concat(range(0x20, 0x2b), range(0x40, 0x44), range(0x50, 0x53), range(0x60, 0x66), [0x7f]);
  const LATHE_UNITS = [6, 7, 5, 0x17, 0x10].concat(range(0x30, 0x37), [0x39, 0x12, 0x13, 0x15, 0x16, 2, 0xf, 0xc], range(0x20, 0x29), range(0x40, 0x44), range(0x50, 0x53), [0x60, 0x61, 0x62, 0x63, 0x66]);
  const OFFERED = { mill: new Set(MILL_UNITS), lathe: new Set(LATHE_UNITS), millturn: new Set(LATHE_UNITS.concat([0x11, 0x14, 8, 0x7f])) };
  function unitCode(ctl, name) {
    if (typeof name === 'number') return name;
    if (!unitCodes[ctl]) {
      const m = unitCodes[ctl] = { COMMON: 1 }, names = unitNames[ctl] = ['COMMON'];
      for (let c = 2; c < 0x80; c++) {
        if (c !== 4 && !OFFERED[CONTROLS[ctl].type].has(c)) continue;
        const L = Maz.at(ctl, Maz.newRecord(c, 0), 0);
        if (L.lay && L.sel.unit) { const nm = Maz.unitName(ctl, c); if (nm && !/^unit 0x/.test(nm)) { m[norm(nm)] = c; names.push(nm); } }
      }
    }
    const c = unitCodes[ctl][norm(name)];
    if (c === undefined) throw new Error('No unit "' + name + '" on a ' + CONTROLS[ctl].label + '. Units: ' + unitList(ctl).join(', '));
    return c;
  }
  const unitList = ctl => { unitCode(ctl, 'COMMON'); return unitNames[ctl].slice(); };
  // the fields of a line in its current layout: [{name, index, byte}]
  function fields(L) {
    if (!L.lay) return [];
    const seen = {}, out = [];
    for (const i of Maz.shownCells(L.lay)) {
      const cell = L.lay.cells[i];
      let name = Maz.cellLabel(L.lay, i).replace(/[^\x21-\x7e ]/g, '').replace(/\s+/g, ' ').trim() || '@' + cell[0];
      seen[name] = (seen[name] || 0) + 1;
      if (seen[name] > 1) name += '#' + seen[name];
      out.push({ name, index: i, byte: cell[0] });
    }
    return out;
  }
  function findField(L, name) {
    const fs = fields(L), n = String(name);
    if (/^@\d+$/.test(n)) return fs.find(f => f.byte === +n.slice(1));
    return fs.find(f => f.name === n) || fs.find(f => norm(f.name) === norm(n));
  }
  // kinds of lines, by record code
  function lineType(code) {
    if (code >= 0xb0 && code <= 0xb8) return 'TOOL';
    if (code === 0xc0) return 'FIG';
    if (code === 0xc1) return 'PATTERN';
    if (code === 0xc2 || (code >= 0xa8 && code <= 0xad)) return 'SHAPE';
    if (code === 0xa1) return 'MANL';
    if (code >= 0xd0 && code <= 0xff) return 'TPC';
    return 'LINE';
  }

  // ---------------------------------------------------------------- programs
  class Program {
    constructor(p, units) { this.p = p; this.units = units || 'inch'; this.warnings = []; }
    get control() { return this.p.ctl; }
    get name() { return this.p.name.replace(/\.[^.]*$/, ''); }
    set name(n) { this.p.name = String(n).toUpperCase().replace(/[^A-Z0-9_.-]/g, '').slice(0, 31) + '.' + (this.p.raw ? CONTROLS[this.p.ctl].raw : CONTROLS[this.p.ctl].ext); }
    get fileName() { return this.p.name; }
    get comment() { return Maz.comment(this.p); }
    set comment(c) { Maz.setComment(this.p, String(c).toUpperCase()); }
    ctx() { return Maz.lines(this.p); }
    structure() { return Maz.structure(this.p, this.ctx()); }
    // the common unit's fields
    common(values) { const u = this.structure().find(x => x.code === 1); if (u) this._set(u.i, values); return this; }
    // add a unit (before END) with its fields; returns a Unit to add its lines to.
    // opts.template: start with the tool lines and shape line the editor puts in a new unit
    unit(name, values, opts) {
      const code = unitCode(this.p.ctl, name);
      if (code === 1 || code === 4) throw new Error('The common unit and END are always there; use common() for the common unit');
      const recs = opts && opts.template ? Maz.newUnit(this.p.ctl, code, { units: this.units }) : [Maz.newRecord(code, 0)];
      const end = this.structure().find(x => x.code === 4), at = end ? end.i : this.p.recs.length;
      this.p.recs.splice(at, 0, ...recs);
      Maz.renumber(this.p);
      this._set(at, values);
      return new Unit(this, at);
    }
    // enter values into record i by field name; fields that only open up after others are set are retried
    _set(i, values) {
      if (!values) return;
      let todo = Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== '');
      for (let pass = 0; pass < 3 && todo.length; pass++) {
        const left = [];
        for (const [k, v] of todo) {
          const L = this.ctx()[i], f = findField(L, k);
          if (!f) { left.push([k, v, 'no field "' + k + '" on this line (fields: ' + fields(L).map(x => x.name).join(', ') + ')']); continue; }
          try { Maz.enter(L, f.index, typeof v === 'number' ? fmtNum(v) : String(v), { units: this.units }); }
          catch (e) { left.push([k, v, k + ' = ' + v + ': ' + e.message]); }
        }
        if (left.length === todo.length) { for (const x of left) this._warn(i, x[2]); return; }
        todo = left;
      }
      for (const x of todo) this._warn(i, x[2]);
    }
    _warn(i, text) {
      const L = this.ctx()[i], msg = (L.sel.unit ? Maz.unitName(this.p.ctl, L.sel.code) : 'line ' + Maz.number(L.rec)) + ': ' + text;
      if (this.strict) throw new Error(msg);
      this.warnings.push(msg);
    }
    // the file's bytes (.PBM/.PBD... or the machine file .MAZ/.MTP/.MPR when opened as one)
    save() { return Maz.serialize(this.p); }
    listing() { return this.ctx().map(L => Maz.lineText(L, { units: this.units })).join('\n') + '\n'; }
    check() { return Maz.limits(this.p).concat(this.warnings); }
    // Readable JSON: every unit with its fields and lines. It gives the file back unchanged: bytes the fields do
    // not show are kept in "keep" (the record with its fields' bytes blanked); a record whose fields cannot be
    // typed back exactly is kept whole in "hex" (its fields still listed; changing one changes the record).
    // opts.exact: every record in "hex". opts.fieldsOnly: no keep/hex (a clean template to build from).
    toJSON(opts) {
      opts = opts || {};
      const ls = this.ctx(), units = this.units, out = { mach1: 1, control: this.p.ctl, name: this.name, fileName: this.fileName, comment: this.comment, units, program: [] };
      if (this.p.raw) out.machineFile = true;             // .MAZ .MTP .MPR: records only, no header
      else if (!opts.fieldsOnly) {                          // the header's other bytes (MazEdit/SLN keep settings there)
        const h = this.p.header.slice(), fresh = Maz.newProgram(this.p.ctl, 'X').header;
        Maz.setComment({ header: h }, '');
        if (hex(h) !== hex(fresh)) out.header = hex(h);
      }
      const codes = this.p.recs.map(r => Maz.code(r));
      if (!codes.length || codes[0] !== 1 || codes.indexOf(4) < 0) out.asIs = true;
      let cur = null, parent = 0;
      ls.forEach((L, i) => {
        const item = {};
        if (L.sel.unit) item.unit = L.sel.code === 1 ? 'COMMON' : Maz.unitName(this.p.ctl, L.sel.code);
        else item.line = lineType(L.sel.code);
        item.code = Maz.code(L.rec).toString(16);                 // with its variant byte (mill-turn FACE/OD units)
        const vals = {};
        for (const f of fields(L)) {
          const t = Maz.cellText(L, f.index, { units, printNames: true }).trim();
          if (t && t !== '<>' && !Maz.locked(L, f.index)) vals[f.name] = t;
        }
        if (Object.keys(vals).length) item.fields = vals;
        if (!L.lay || opts.exact || item.line === 'TPC') item.hex = hex(L.rec);
        else if (!opts.fieldsOnly) {
          const keep = blanked(L);
          const back = rebuild(this.p.ctl, keep, parent, vals, units);
          if (back) { back[2] = L.rec[2]; back[3] = L.rec[3]; }
          if (back && hex(back) === hex(L.rec)) { if (/[^0]/.test(hex(keep).slice(8)) || L.sel.code === 1 || L.sel.code === 4) item.keep = hex(keep); }      // COMMON/END would start from defaults
          else item.hex = hex(L.rec);
        }
        if (L.sel.unit) parent = L.sel.code;
        if (L.sel.unit) { cur = item; item.lines = []; out.program.push(item); }
        else if (cur) cur.lines.push(item);
        else out.program.push(item);
      });
      for (const u of out.program) if (u.lines && !u.lines.length) delete u.lines;
      return out;
    }
  }
  // a record with the bytes of its shown fields, its number and their entered bits cleared
  function blanked(L) {
    const r = Uint8Array.from(L.rec);
    r[2] = r[3] = 0;
    let mask = (r[4] | (r[5] << 8) | (r[6] << 16) | (r[7] << 24)) >>> 0;
    for (const f of fields(L)) {
      const cell = L.lay.cells[f.index];
      if (Maz.locked(L, f.index)) continue;
      for (let k = 0; k < cell[1]; k++) r[cell[0] + k] = 0;
      if (cell[3]) mask &= ~cell[3];
    }
    r[4] = mask & 255; r[5] = (mask >>> 8) & 255; r[6] = (mask >>> 16) & 255; r[7] = mask >>> 24;
    return r;
  }
  // a record from kept bytes and field values (null when a value does not go in)
  function rebuild(ctl, keep, parent, vals, units) {
    const r = Uint8Array.from(keep);
    let todo = Object.entries(vals);
    for (let pass = 0; pass < 3 && todo.length; pass++) {
      const left = [];
      for (const [k, v] of todo) {
        const L = Maz.at(ctl, r, parent), f = findField(L, k);
        try { if (!f) throw new Error(); Maz.enter(L, f.index, v, { units }); } catch (e) { left.push([k, v]); }
      }
      if (left.length === todo.length) return null;
      todo = left;
    }
    return todo.length ? null : r;
  }
  class Unit {
    constructor(prog, i) { this.prog = prog; this.rec = prog.p.recs[i]; }
    get index() { return this.prog.p.recs.indexOf(this.rec); }
    get code() { return Maz.code(this.rec); }
    set(values) { this.prog._set(this.index, values); return this; }
    // add a line: type TOOL, FIG (hole pattern), PATTERN (square/circle), SHAPE, MANL (manual program block),
    // or a record code such as 'b0'
    line(type, values) {
      const p = this.prog, ctl = p.p.ctl, code = lineCode(ctl, this.code, type);
      const u = p.structure().find(x => x.i === this.index);
      const at = (u.seqs.length ? u.seqs[u.seqs.length - 1] : u.i) + 1;
      const r = Maz.newRecord(code, 0);
      if (code === 0xc0) { r[8] = 1; }
      if (code === 0xc2) r[8] = 0x20;
      if (code === 0xa8) r[8] = 1;
      p.p.recs.splice(at, 0, r);
      Maz.renumber(p.p);
      p._set(at, values);
      return this;
    }
    tool(values) { return this.line('TOOL', values); }
    fig(values) { return this.line('FIG', values); }
    shape(values) { return this.line('SHAPE', values); }
    // a MANL PRG block from G-code-like words: {G: 1, X: 1.5, Y: 2, F: 20} (up to six addresses)
    block(words) {
      const w = Object.assign({}, words), v = {};
      const g = [].concat(w.G === undefined ? [] : w.G); delete w.G;
      if (g[0] !== undefined) v.G1 = String(g[0]);
      if (g[1] !== undefined) v.G2 = String(g[1]);
      const addrs = Object.entries(w).filter(([k]) => /^[A-Z]$/.test(k) && k !== 'M' && k !== 'S');
      if (addrs.length > 6) throw new Error('A MANL PRG line holds six addresses');
      addrs.forEach(([k, val], n) => { v['DATA ' + (n + 1) + ' address'] = k + fmtNum(val); });
      if (w.S !== undefined) v.S = w.S;
      if (w.M !== undefined) v['M/B'] = 'M' + w.M;
      return this.line('MANL', v);
    }
  }
  const fmtNum = v => (typeof v === 'number' ? String(+v.toFixed(6)) : String(v));
  // the record code for a line type in a unit
  function lineCode(ctl, unit, type) {
    if (/^[0-9a-f]{2,3}$/i.test(type) && !/^(FIG|TOOL)$/i.test(type)) return parseInt(type, 16);
    const t = norm(type);
    if (t === 'MANL' || t === 'BLOCK') return 0xa1;
    if (t === 'PATTERN') return 0xc1;
    const tmpl = Maz.newUnit(ctl, unit, {}).slice(1);
    if (t === 'TOOL') { const r = tmpl.find(x => lineType(Maz.code(x)) === 'TOOL'); if (r) return Maz.code(r); }
    if (t === 'FIG' || t === 'SHAPE') { const s = Maz.shapeCode(ctl, unit); if (s) return s; }
    throw new Error('A ' + Maz.unitName(ctl, unit) + ' unit has no ' + type + ' lines');
  }

  // ---------------------------------------------------------------- entry points
  function program(o) {
    o = o || {};
    const ctl = control(o.control), p = new Program(Maz.newProgram(ctl, 'NEW'), o.units || 'inch');
    p.name = o.name || 'NEW';
    if (o.comment) p.comment = o.comment;
    p.strict = !!o.strict;
    return p;
  }
  // open a file's bytes (.PBD .PBM .PBF .PBP .PBE .PBN, .MAZ .MTP .MPR)
  function open(bytes, fileName, units) { return new Program(Maz.parse(Uint8Array.from(bytes), fileName), units || 'inch'); }
  // JSON (from toJSON, or written by hand) -> Program. Records with hex start from those bytes.
  function fromJSON(j, o) {
    if (typeof j === 'string') j = JSON.parse(j);
    const ctl = control(j.control), prog = program({ control: ctl, name: j.name, units: j.units, strict: o && o.strict });
    if (j.header) { const h = prog.p.header; for (let i = 0; i < h.length && 2 * i < j.header.length; i++) h[i] = parseInt(j.header.substr(2 * i, 2), 16); }
    if (j.machineFile) { prog.p.raw = true; prog.name = prog.name; }
    if (j.comment) prog.comment = j.comment;
    if (j.fileName) prog.p.name = String(j.fileName);
    prog.p.recs = [];
    const add = (item, parent) => {
      let rec;
      if (item.hex) rec = unhex(item.hex);
      else if (item.keep) rec = unhex(item.keep);
      else if (item.unit !== undefined) {
        const code = item.code ? parseInt(item.code, 16) : unitCode(ctl, item.unit);
        rec = code === 1 || code === 4 ? Maz.newUnit(ctl, code, {})[0] : Maz.newRecord(code, 0);
      } else {
        const code = item.code ? parseInt(item.code, 16) : lineCode(ctl, parent, item.line || 'LINE');
        rec = Maz.newRecord(code, 0);
        if (code === 0xc0) rec[8] = 1;
        if (code === 0xc2) rec[8] = 0x20;
        if (code === 0xa8) rec[8] = 1;
      }
      prog.p.recs.push(rec);
      Maz.renumber(prog.p);
      prog._set(prog.p.recs.length - 1, item.fields);
      return Maz.code(rec);
    };
    for (const u of j.program || []) {
      const code = add(u, 0);
      for (const l of u.lines || []) add(l, code);
    }
    if (!j.asIs) {                                   // a program starts with the common unit and has an END
      if (!prog.p.recs.length || Maz.code(prog.p.recs[0]) !== 1) prog.p.recs.unshift(Maz.newUnit(ctl, 1, {})[0]);
      if (!prog.p.recs.some(r => Maz.code(r) === 4)) prog.p.recs.push(Maz.newUnit(ctl, 4, {})[0]);
    }
    Maz.renumber(prog.p);
    return prog;
  }
  // the fields of every unit and line of a control, for documentation and for checking names
  function describe(ctlName) {
    const ctl = control(ctlName), out = [];
    for (const name of unitList(ctl)) {
      const code = unitCode(ctl, name), recs = code === 1 || code === 4 ? Maz.newUnit(ctl, code, {}) : Maz.newUnit(ctl, code, {});
      const ls = Maz.lines({ ctl, recs }), seen = new Set(), item = { unit: code === 1 ? 'COMMON' : Maz.unitName(ctl, code), code, fields: fields(ls[0]).map(f => f.name), lines: [] };
      for (const L of ls.slice(1)) {
        const k = L.sel.code;
        if (seen.has(k)) continue;
        seen.add(k);
        item.lines.push({ line: lineType(k), code: k, fields: fields(L).map(f => f.name) });
      }
      for (const [type, k] of [['PATTERN', 0xc1], ['MANL', 0xa1]]) {
        if (seen.has(k)) continue;
        try { if (lineCode(ctl, code, type) && (type === 'MANL' ? code === 6 : Maz.shapeCode(ctl, code) === 0xc2)) { const L = Maz.at(ctl, Maz.newRecord(k, 0), code); if (L.lay) item.lines.push({ line: type, code: k, fields: fields(L).map(f => f.name) }); } } catch (e) { /* not in this unit */ }
      }
      out.push(item);
    }
    return out;
  }

  const api = { program, open, fromJSON, describe, controls: () => Object.keys(CONTROLS), units: ctl => unitList(control(ctl)), core: Maz, version: '0.1' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MACH1 = api;
})(this);
