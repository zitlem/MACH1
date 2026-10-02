// MACH1 bundle: load with <script src="mach1.bundle.js"></script>, then use window.MACH1
(function (module) {
var root = (typeof globalThis !== "undefined" ? globalThis : window);
// Mazatrol program model: read/write Matrix and Smooth programs for mills (.PBD/.PBM), lathes
// (.PBF/.PBP) and mill-turn (.PBE/.PBN), find units and their sequences, and format/edit fields exactly as
// SLN's MazEdit does.
//
// File: fixed header (data length at 0xA0) + 100-byte records. Each record starts with u16 code, u16 number,
// u32 "entered fields" mask. For every control, schema.json holds MazEdit's own table of layout blocks
// (fields, entered bits, columns, prompts), the adjustments MazEdit applies per record variant, and the
// display formats. A record is shown with the block MazEdit picks for it (selection below).
// Cell = [byte, n, fmt, bit, col, wc, prompt].
(function (root) {
  'use strict';

  const REC = 100;
  const CONTROLS = {
    MatrixM: { kind: 0x11, ext: 'PBD', fileKind: 0x25, hdr: 0xFC, sMul: 1, seqLimit: 255, family: 'Matrix', type: 'mill', label: 'Matrix mill' },
    SmoothM: { kind: 0x16, ext: 'PBM', raw: 'MAZ', fileKind: 0x26, hdr: 0x104, sMul: 1000, seqLimit: 999, family: 'Smooth', type: 'mill', label: 'Smooth mill' },
    MatrixT: { kind: 0x12, ext: 'PBF', fileKind: 0x25, hdr: 0xFC, sMul: 1, seqLimit: 255, family: 'Matrix', type: 'lathe', label: 'Matrix lathe' },
    SmoothT: { kind: 0x17, ext: 'PBP', raw: 'MTP', fileKind: 0x26, hdr: 0x104, sMul: 1000, seqLimit: 999, family: 'Smooth', type: 'lathe', label: 'Smooth lathe', exts: ['PBL'] },
    MatrixE: { kind: 0x13, ext: 'PBE', fileKind: 0x25, hdr: 0xFC, sMul: 1, seqLimit: 255, family: 'Matrix', type: 'millturn', label: 'Matrix mill-turn' },
    SmoothE: { kind: 0x18, ext: 'PBN', raw: 'MPR', fileKind: 0x26, hdr: 0x104, sMul: 1000, seqLimit: 999, family: 'Smooth', type: 'millturn', label: 'Smooth mill-turn' },
  };
  // raw: the control's own program files (Smooth CAM Ai's "MC_Machine Programs"): the same records with no header,
  // so no comment either
  // the same kind of machine on the other control family (for Save as)
  const counterpart = ctl => Object.keys(CONTROLS).find(k => k !== ctl && CONTROLS[k].type === CONTROLS[ctl].type);

  // Mazak's own tool names (control screen and SLN), by tool code. MazEdit's print uses short forms.
  const TOOL_NAMES = {
    1: 'CTR-DR', 2: 'DRILL', 3: 'REAMER', 4: 'TAP', 5: 'TAP', 6: 'TAP', 7: 'TAP', 8: 'TAP', 9: 'TAP',
    10: 'BCK FACE', 11: 'BOR BAR', 12: 'B-B BAR', 13: 'CHAMFER', 14: 'FCE MILL', 15: 'END MILL', 16: 'OTHER',
    17: 'CHIP VAC', 18: 'TOL SENS', 19: 'BAL EMIL', 21: 'AM TOOL', 22: 'BARREL',
    33: 'GENERAL', 34: 'GROOVE', 35: 'THREAD', 36: 'T-DRILL', 37: 'T-TAP', 43: 'SPECIAL',
  };
  const PRINT_TOOL_NAMES = {
    1: 'CTR-DR', 2: 'DRILL', 3: 'REAMER', 4: 'TAP-MT', 5: 'TAP-UN', 6: 'TAP-PIPE-PT', 7: 'TAP-PIPE-PF',
    8: 'TAP-PIPE-PS', 9: 'TAP OTHR', 10: 'BSP-FC', 11: 'B-BAR', 12: 'BB-BAR', 13: 'CHMF-M', 14: 'F-MILL',
    15: 'E-MILL', 16: 'OTHER', 17: 'CHP-VAC', 18: 'PROBE', 19: 'BE-MILL', 21: 'AM TOOL', 22: 'BARREL',
  };
  const SUFFIX = ' ABCDEFGHJKLMNPQRSTUVWXYZ';

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  const u32 = (b, o) => i32(b, o) >>> 0;
  const put16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; };
  const put32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >>> 24) & 255; };

  // ---------------------------------------------------------------- schema
  let SCHEMA = null;
  const BLOCKS = {};          // ctl -> {index: block}
  const BY_CODE = {};         // ctl -> {code: first block index}
  const LAYOUTS = new Map();  // `${ctl}/${block}/${variant}` -> merged layout
  const POINT_BITS = { 48: 0x8, 52: 0x10, 15: 0x100, 56: 0x20 };
  function useSchema(s) {
    SCHEMA = s;
    LAYOUTS.clear();
    for (const [ctl, c] of Object.entries(s.controls)) {
      const blocks = BLOCKS[ctl] = {}, byCode = BY_CODE[ctl] = {};
      for (const [idx, ref] of Object.entries(c.blocks)) {
        const bl = JSON.parse(JSON.stringify(s.pool[ref]));
        bl.block = +idx;
        blocks[idx] = bl;
      }
      Object.keys(blocks).map(Number).sort((a, b) => a - b).forEach(i => {
        if (i < 0x7d && blocks[i].code && byCode[blocks[i].code] === undefined) byCode[blocks[i].code] = i;
      });
      // MazEdit shows these point-tool columns only when their entered bit is set, although its layout
      // table does not list the bits: PRE-DIA 0x8, PRE-DEP 0x10, RGH 0x100, DEPTH 0x20 (by byte).
      for (const bl of Object.values(blocks)) {
        if (bl.code !== 0xb0) continue;
        for (const cell of bl.cells) { const bit = POINT_BITS[cell[0]]; if (bit && !cell[3]) cell[3] = bit; }
      }
    }
  }
  function formatSpec(ctl, fmt) { return (SCHEMA.controls[ctl].formats[fmt]) || SCHEMA.formats[fmt] || null; }
  function enumText(ctl, fmt, v) {
    const spec = formatSpec(ctl, fmt);
    if (!spec || !spec.values) return '';
    const t = spec.values[spec.low ? v & 0xff : v];
    return t !== undefined ? t : unknownText(v, spec.unknown);
  }

  // A block adjusted for a record variant (MazEdit 0x597b4b: on a plain mill record the mill-turn C-FACE
  // column goes away; variant 1/2 are mill-turn faces).
  function blockLayout(ctl, block, variant) {
    const key = ctl + '/' + block + '/' + (variant == null ? '' : variant);
    let lay = LAYOUTS.get(key);
    if (lay) return lay;
    const bl = BLOCKS[ctl][block];
    if (!bl) return null;
    const v = variant != null && bl.variants && bl.variants[variant];
    lay = Object.assign({}, bl, { variant });
    if (v) {
      if (v.head !== undefined) lay.head = v.head;
      if (v.cells) lay.cells = bl.cells.map((c, i) => v.cells[i] || c);
    }
    LAYOUTS.set(key, lay);
    return lay;
  }
  const isSeqShape = shape => shape >= 0x8000;       // 0xfffc figure / 0xfffe tool / 0xfffd TPC lines

  // Record types MazEdit has no layout for but whose data clearly matches a neighbour's (lathe C/Y-axis
  // milling shapes: ZC-face points, XC-face points and lines). Shown with that layout, marked inferred.
  const INFERRED = { lathe: { 0x2b8: 0x2ba, 0x2b9: 0x2bb, 0x2c9: 0x2c8 } };

  // MazEdit's choice of layout block for a record, given the unit it belongs to (0x5214cd .. 0x5221fd).
  // Returns {code, block, variant, parent (after this record), unit, inferred, tpc}.
  function selection(ctl, rec, parent) {
    const C = CONTROLS[ctl], blocks = BLOCKS[ctl], byCode = BY_CODE[ctl];
    const code16 = u16(rec, 0), lathe = C.type === 'lathe';
    const c = lathe || (code16 & 0xf0) === 0xc0 || code16 === 0x101 ? code16 : code16 & 0xff;
    let block = byCode[c], inferred = false;
    if (block === undefined) {
      const alias = (INFERRED[C.type] || {})[c];
      if (alias !== undefined && byCode[alias] !== undefined) { block = byCode[alias]; inferred = true; }
      else block = (c >= 0xd0 && c <= 0xff) || c === 0x280 || c === 0x281 || c === 0x101 ? 0x5a : 0;
    }
    const bl = blocks[block];
    const seq = bl && block !== 0 ? isSeqShape(bl.shape) : (c & 0xff) >= 0x80;
    if (c === 1) {
      const b = lathe || rec[8] ? 0x33 : block;
      return { code: c, block: blocks[b] ? b : block, variant: null, parent: 1, unit: true, inferred: false, tpc: false };
    }
    let variant = null;
    if (lathe) {
      if (seq && c === 0xb2) variant = 0;
      if (seq && c === 0xb4 && parent === 0x36 && rec[9] > 0 && rec[9] < 0x20 && blocks[block + 1]) block += 1;
      else if (seq && c === 0xb4 && parent === 0x39 && blocks[0x50]) block = 0x50;
    } else {
      variant = code16 >> 8;
      if (variant && !seq && rec[8] === 2) variant = 2;
      if ((C.kind === 0x13 || C.kind === 0x18) && seq && c === 0xb4) {
        if (parent === 0x36 && rec[9] < 0x20 && blocks[block + 1]) block += 1;
        else if (parent === 0x39 && blocks[0x50]) block = 0x50;
      }
    }
    const unit = !seq;
    return { code: c, block, variant, parent: unit ? c : parent, unit, inferred, tpc: !!(bl && bl.shape === 0xfffd) };
  }

  // A record in its program context: {ctl, rec, sel, lay}. lay is null when MazEdit has no layout.
  function at(ctl, rec, parent) {
    const sel = selection(ctl, rec, parent || 0);
    const lay = sel.block === 0 ? null : blockLayout(ctl, sel.block, sel.variant);
    return { ctl, rec, sel, lay };
  }
  // Every record of a program in context (parent unit tracked the way MazEdit does).
  function lines(p) {
    let parent = 0;
    return p.recs.map(rec => { const L = at(p.ctl, rec, parent); parent = L.sel.parent; return L; });
  }

  // ---------------------------------------------------------------- files
  function controlForExt(ext) {
    const e = (ext || '').toUpperCase();
    return Object.keys(CONTROLS).find(k => CONTROLS[k].ext === e || CONTROLS[k].raw === e || (CONTROLS[k].exts || []).indexOf(e) >= 0);
  }
  const extOf = name => (((name || '').match(/\.([^.]+)$/) || [])[1] || '').toUpperCase();
  const isRaw = name => Object.values(CONTROLS).some(c => c.raw === extOf(name));
  function detect(name, bytes) {
    const ext = ((name || '').match(/\.([^.]+)$/) || [])[1];
    const byExt = controlForExt(ext);
    if (byExt) return byExt;
    for (const [k, c] of Object.entries(CONTROLS)) {
      if (c.type === 'mill' && bytes[0x20] === c.fileKind && (bytes.length - c.hdr) % REC === 0 && u32(bytes, 0xA0) === bytes.length - c.hdr) return k;
    }
    throw new Error('Not a Mazatrol program this editor reads (.PBD .PBM .PBF .PBP .PBE .PBN .MAZ .MTP .MPR)');
  }

  function parse(bytes, name) {
    const ctl = detect(name, bytes), C = CONTROLS[ctl], raw = isRaw(name);
    const hdr = raw ? 0 : C.hdr, body = bytes.length - hdr, warnings = [];
    if (body < 0) throw new Error('File is shorter than a ' + C.label + ' header');
    if (!raw && bytes[0x20] !== C.fileKind) warnings.push('The file header is marked as ' + (bytes[0x20] === 0x25 ? 'Matrix' : bytes[0x20] === 0x26 ? 'Smooth' : 'another control') + '; it is read as ' + C.label + ' because of its extension.');
    if (body % REC) warnings.push('File length is not a whole number of records; the trailing ' + (body % REC) + ' bytes are ignored.');
    if (!raw && u32(bytes, 0xA0) !== body - (body % REC)) warnings.push('Header data length does not match the file; it will be corrected on save.');
    const recs = [];
    for (let o = hdr; o + REC <= bytes.length; o += REC) recs.push(bytes.slice(o, o + REC));
    if (raw && (!recs.length || code(recs[0]) !== 1)) warnings.push('The file does not start with a common unit.');
    const header = raw ? newHeader(ctl) : bytes.slice(0, C.hdr);
    const p = { ctl, name: name || 'PROGRAM.' + C.ext, header, recs, warnings };
    if (raw) p.raw = true;
    const ls = lines(p);
    const unknown = new Set(ls.filter(L => !L.lay).map(L => L.sel.code));
    if (unknown.size) warnings.push('Records MazEdit has no layout for are kept unchanged: ' + [...unknown].map(c => '0x' + c.toString(16)).join(', ') + '.');
    const inferred = new Set(ls.filter(L => L.sel.inferred).map(L => L.sel.code));
    if (inferred.size) warnings.push('MazEdit has no layout for records ' + [...inferred].map(c => '0x' + c.toString(16)).join(', ') + ' (C/Y-axis milling shapes); they are shown with the layout of the matching shape and marked "inferred".');
    return p;
  }

  function serialize(p) {
    if (p.raw) {
      const out = new Uint8Array(p.recs.length * REC);
      p.recs.forEach((r, i) => out.set(r, i * REC));
      return out;
    }
    const C = CONTROLS[p.ctl], out = new Uint8Array(C.hdr + p.recs.length * REC);
    out.set(p.header.subarray(0, C.hdr));
    out[0x20] = C.fileKind;
    put32(out, 0xA0, p.recs.length * REC);
    p.recs.forEach((r, i) => out.set(r, C.hdr + i * REC));
    return out;
  }

  // ---------------------------------------------------------------- tool data files
  // TOOLDATA and TOOLFILE (.DBD Matrix, .DBM Smooth): the program header (0xFC / 0x104 bytes, byte 0x20 = 0x25
  // Matrix / 0x26 Smooth) with the length of each section at 0xA0, 0xA4, ... Tool data holds two pocket tables
  // (48-byte entries, kept as they are) and then the tool records (Matrix 256 bytes, Smooth 384); a tool file
  // is one section of 160-byte records. Records print through MazEdit's own tool-data layouts (schema
  // controls "TD-..." and "TF-..."): tool data as "Tool Data (1)" (block 0: tool set, wear, life) and
  // "Tool Data (2)" (block 1: tool, sizes, angles), a tool file as one line per tool.
  const TOOL_FILES = { TOOLDATA: 'TD', TOOLFILE: 'TF' };
  const TOOL_TYPES = { mill: 'M', lathe: 'T', millturn: 'E' };
  function toolFileKind(name) {
    const m = /(TOOLDATA|TOOLFILE|CUTCND|USRPAR|MAHINPAR)[^\\/]*\.DB[A-Z]$/i.exec(name || '');
    return m ? m[1].toUpperCase() : null;
  }
  const isToolFile = name => !!toolFileKind(name);
  function parseToolFile(bytes, name, type) {
    const kind = toolFileKind(name);
    if (!kind) throw new Error('Not a tool data file (TOOLDATA or TOOLFILE)');
    if (!TOOL_FILES[kind]) throw new Error(kind + ' (cutting conditions and parameters) cannot be opened yet; TOOLDATA and TOOLFILE can.');
    const family = bytes[0x20] === 0x26 ? 'Smooth' : bytes[0x20] === 0x25 ? 'Matrix' : null;
    if (!family) throw new Error('The file header does not say Matrix or Smooth');
    const hdr = family === 'Smooth' ? 0x104 : 0xFC, lens = [];
    for (let k = 0; k < 6; k++) { const l = u32(bytes, 0xA0 + 4 * k); if (!l) break; lens.push(l); }
    const sections = [];
    let off = hdr;
    for (const l of lens) { sections.push(bytes.slice(off, off + l)); off += l; }
    if (off > bytes.length) throw new Error('The file is shorter than its header says');
    const t = { tool: kind, family, name, header: bytes.slice(0, hdr), sections, trailer: bytes.slice(off), warnings: [],
      sec: kind === 'TOOLDATA' ? 2 : 0 };
    if (!sections[t.sec]) throw new Error('This ' + kind + ' file has no tool records');
    setToolType(t, type || 'mill');
    return t;
  }
  // The machine type picks the layout (a lathe tool file differs). Edits are kept when it changes.
  function setToolType(t, type) {
    if (t.recs) flushTool(t);
    t.type = type;
    t.ctl = TOOL_FILES[t.tool] + '-' + t.family + TOOL_TYPES[type];
    const size = SCHEMA.controls[t.ctl].rec, s = t.sections[t.sec];
    t.recs = [];
    for (let o = 0; o + size <= s.length; o += size) t.recs.push(s.slice(o, o + size));
    t.warnings = s.length % size ? ['The tool section is not a whole number of ' + size + '-byte records; its last ' + (s.length % size) + ' bytes are kept as they are.'] : [];
  }
  function flushTool(t) {
    const s = t.sections[t.sec], size = SCHEMA.controls[t.ctl].rec;
    t.recs.forEach((r, i) => s.set(r.subarray(0, size), i * size));
  }
  function serializeToolFile(t) {
    flushTool(t);
    const out = new Uint8Array(t.header.length + t.sections.reduce((a, s) => a + s.length, 0) + t.trailer.length);
    out.set(t.header, 0);
    let off = t.header.length;
    t.sections.forEach((s, k) => { put32(out, 0xA0 + 4 * k, s.length); out.set(s, off); off += s.length; });
    out.set(t.trailer, off);
    return out;
  }
  // the record's tool type (first tool field of the layout); 0 = empty slot
  function toolType(t, rec) {
    for (const b of SCHEMA.controls[t.ctl].lines) {
      const c = blockLayout(t.ctl, b, null).cells.find(x => x[2] === 0x2b || x[2] === 0x28);
      if (c) return rec[c[0]];
    }
    return 1;
  }
  // A Smooth control's memory as Smooth CAM Ai keeps it for every machine (the machine data folder's "m8ysram",
  // 8 MB). Its tool data lies at fixed places in the TOOLDATA layout: the two pocket tables at 0x4a100 and
  // 0x77100 (0x2d000 bytes each) and 4000 tool records of 384 bytes at 0x184160 (the region table in Mazak's
  // m8winprepro.dll; the same in every build). It is shown read-only.
  const SRAM_SIZE = 0x800000, SRAM_TOOLS = [[0x4a100, 0x2d000], [0x77100, 0x2d000], [0x184160, 4000 * 384]];
  const isMachineMemory = (name, bytes) => /^m8ysram/i.test(name || '') && !!bytes && bytes.length === SRAM_SIZE;
  function parseMachineMemory(bytes, name, type) {
    if (!isMachineMemory(name, bytes)) throw new Error('Not a Smooth control memory file (m8ysram, 8 MB)');
    const header = new Uint8Array(0x104);
    header[0x20] = 0x26;
    const t = { tool: 'TOOLDATA', family: 'Smooth', name, header, sections: SRAM_TOOLS.map(([o, n]) => bytes.slice(o, o + n)),
      trailer: new Uint8Array(0), warnings: [], sec: 2, memory: true };
    setToolType(t, 'mill');
    if (!type) {
      // turning tools (codes 33..) say lathe or mill-turn; a turret has at most 24 stations
      const codes = t.recs.map(r => toolType(t, r)).filter(c => c);
      const pockets = t.sections[0].length / 48;
      let used = 0;
      for (let k = 0; k < pockets; k++) if (t.sections[0].subarray(k * 48 + 4, k * 48 + 48).some(x => x)) used++;
      type = !codes.some(c => c >= 33) ? 'mill' : used <= 24 ? 'lathe' : 'millturn';
    }
    if (type !== 'mill') setToolType(t, type);
    t.toolFile = memoryToolFile(bytes);
    return t;
  }
  // The TOOL FILE (the control's list of milling tools: nominal and minimum diameter, material, teeth, depth of
  // cut, angle) is in a Smooth control's memory too, as 160-byte records (TOOLFILE layout) from 0x2FB160; deleted
  // tools leave empty slots.
  const SRAM_TOOLFILE = 0x2fb160, TF_REC = 160, TF_SLOTS = 1000;
  function memoryToolFile(bytes) {
    const out = [];
    for (let k = 0; k < TF_SLOTS; k++) {
      const o = SRAM_TOOLFILE + k * TF_REC;
      if (o + TF_REC > bytes.length) break;
      const nom = i32(bytes, o + 8);
      if (bytes[o + 4] > 0 && bytes[o + 4] < 60 && nom > 0 && nom < 1016000000) out.push(bytes.slice(o, o + TF_REC));
    }
    return out;
  }
  // a tool file's tools (a TOOLFILE document, or the one in a machine's memory): lengths in nanometres
  function toolFileEntries(t) {
    const recs = t.toolFile || (t.tool === 'TOOLFILE' ? t.recs : []);
    return recs.filter(r => r[4]).map(r => ({ type: r[4], sfx: suffixText(r[6], r[7]), nom: i32(r, 8), min: i32(r, 12),
      matl: String.fromCharCode(...r.subarray(16, 24)).replace(/[^\x20-\x7e]/g, '').trim(), teeth: r[24], depth: i32(r, 28), angle: i32(r, 32) / 1e4 }));
  }
  // a program tool's entry in a tool file: same type, nominal size and suffix
  function findToolFile(pt, entries) {
    const same = entries.filter(e => e.type === pt.type && pt.kind === 'len' && Math.abs(e.nom - pt.nom) <= 1300);
    return same.find(e => e.sfx === pt.sfx) || null;
  }

  // Tool ID suffix: 1..24 = A..Z without I and O. The next byte selects the form: 0 upper case, 0x20 "!"
  // prefix, anything else lower case. Other values print as MazEdit does.
  function suffixText(v, f) {
    if (f === 0x20) return '!' + (v === 0 ? '' : v <= 24 ? SUFFIX[v] : '*');
    if (!v) return '';
    if (v <= 24) return f ? SUFFIX[v].toLowerCase() : SUFFIX[v];
    if (v >= 129 && v <= 137) return '*' + SUFFIX[v - 128];
    if (!f && v >= 33 && v <= 56) return '!' + SUFFIX[v - 32];
    if (!f && v >= 138 && v <= 152) return SUFFIX[v - 128].toLowerCase();
    return '*';
  }

  // ---------------------------------------------------------------- tool check
  // The control finds a program's tool in its tool data by type, nominal size and suffix, and for turning tools
  // (and milling tools on lathes) by the part too (OUT, IN, EDGE ...). A program line holds the type in a tool
  // field and the part in the byte after it; the nominal size and the suffix are the next 4-byte field and
  // the next suffix field of the layout. Nominal sizes are lengths (0.0001 mm or 0.00001 in in a program,
  // nanometres in tool data), tap sizes (four bytes) or hundredths for turning tools.
  // Tool data (TOOLDATA layout, every control): type 8, part 9, suffix 10 (form 11), nominal 20, diameter or
  // nose radius 24, length 28; the first pocket table gives each tool's pocket.
  const nomKind = t => (isTap(t) || (t >= 37 && t <= 42) ? 'tap' : hundredths(t) ? 'hund' : 'len');
  const NM = { inch: 254, metric: 100 };            // a program length unit in nanometres
  function programTools(p, units, ls) {
    ls = ls || lines(p);
    const scale = NM[units === 'metric' ? 'metric' : 'inch'], out = new Map(), unitAt = [];
    for (const u of structure(p, ls)) { unitAt[u.i] = u; for (const i of u.seqs) unitAt[i] = u; }
    ls.forEach((L, i) => {
      if (!L.lay || L.sel.tpc) return;
      const cells = L.lay.cells, rec = L.rec;
      cells.forEach((c, k) => {
        if ((c[2] !== 0x2b && c[2] !== 0x35) || c[1] !== 1 || !rec[c[0]]) return;
        if (notApplicable(L.lay, rec, k) || blanked(L.lay, rec, k)) return;
        const rest = cells.slice(k + 1), nc = rest.find(x => x[1] === 4), sc = rest.find(x => x[2] === 0x109);
        if (!nc) return;
        const type = rec[c[0]], part = rec[c[0] + 1], kind = nomKind(type), raw = i32(rec, nc[0]);
        const nom = kind === 'tap' ? Array.from(rec.subarray(nc[0], nc[0] + 4)).join('.') : kind === 'hund' ? raw : raw * scale;
        const sfx = sc ? suffixText(rec[sc[0]], rec[sc[0] + 1]) : '';
        const key = [type, kind === 'len' ? Math.round(nom / 100) : nom, sfx, part].join('|');
        let e = out.get(key);
        if (!e) {
          // turning tools: the part (OUT, IN ...) prints in its own field after the tool
          const nk = cells.indexOf(nc), pk = cells.findIndex(x => x[0] === c[0] + 1 && x[2] === 0xef);
          const name = [cellText(L, k, { units, printNames: true }), pk >= 0 ? cellText(L, pk, { units }) : ''].map(x => x.trim()).filter(Boolean).join(' ');
          out.set(key, e = { key, type, part, kind, nom, sfx, lines: [], units: [], name, nomText: cellText(L, nk, { units }).trim() });
        }
        e.lines.push(i);
        const u = unitAt[i], no = u ? number(p.recs[u.i]) : null;
        if (u && e.units.indexOf(no) < 0) e.units.push(no);
      });
    });
    return [...out.values()];
  }
  // the registered tools of a tool data document (TOOLDATA file or a machine's memory)
  function machineTools(t) {
    const pockets = {}, pt = t.tool === 'TOOLDATA' ? t.sections[0] : null;
    if (pt) for (let o = 0; o + 48 <= pt.length; o += 48) {
      const pocket = u32(pt, o);
      if (pocket) for (let j = 4; j < 48; j += 2) { const ix = u16(pt, o + j); if (ix && pockets[ix] === undefined) pockets[ix] = pocket; }
    }
    const out = [];
    t.recs.forEach((r, i) => {
      if (!r[8] || t.tool !== 'TOOLDATA') return;
      out.push({ tno: i + 1, ri: i, pocket: pockets[i + 1] ?? null, type: r[8], part: r[9], sfx: suffixText(r[10], r[11]),
        nomRaw: i32(r, 20), nomTap: Array.from(r.subarray(20, 24)).join('.'), dia: i32(r, 24), length: i32(r, 28) });
    });
    return out;
  }
  // ok: the machine has the tool; suffix: it has the tool with another suffix; missing: neither
  function checkTool(pt, mts) {
    const same = m => m.type === pt.type && (!pt.part || m.part === pt.part) &&
      (pt.kind === 'tap' ? m.nomTap === pt.nom : pt.kind === 'hund' ? m.nomRaw === pt.nom : Math.abs(m.nomRaw - pt.nom) <= 1300);
    const hits = mts.filter(same), exact = hits.filter(m => m.sfx === pt.sfx);
    if (exact.length) return { status: 'ok', tools: exact };
    return hits.length ? { status: 'suffix', tools: hits } : { status: 'missing', tools: [] };
  }

  // ---------------------------------------------------------------- compare
  // Differences between two programs of the same kind of machine (a Matrix program is compared as its Smooth
  // conversion, or the other way round). Records are matched on their bytes without the unit/sequence number,
  // so inserted units do not make everything after them differ. Unmatched records of the same code between
  // two matches pair up as changed (with the fields that print differently); the rest are added or removed.
  // Result items: {kind: 'changed'|'added'|'removed', ia (record in a, or -1), ib, code, fields: [[label, a, b]]}.
  function diffPrograms(a, b, units) {
    if (a.ctl !== b.ctl) {
      if (CONTROLS[a.ctl].type !== CONTROLS[b.ctl].type) throw new Error('A ' + CONTROLS[a.ctl].label + ' program cannot be compared with a ' + CONTROLS[b.ctl].label + ' program');
      a = convert(a, b.ctl);
    }
    const key = r => { const k = r.slice(); k[2] = 0; k[3] = 0; return Array.from(k).join(','); };
    const ka = a.recs.map(key), kb = b.recs.map(key), n = ka.length, m = kb.length;
    // longest common subsequence (suffix table), then the matched pairs in order
    const T = new Array(n + 1);
    for (let i = n; i >= 0; i--) {
      T[i] = new Uint16Array(m + 1);
      if (i === n) continue;
      for (let j = m - 1; j >= 0; j--) T[i][j] = ka[i] === kb[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    }
    const pairs = [];
    for (let i = 0, j = 0; i < n && j < m;) {
      if (ka[i] === kb[j]) { pairs.push([i, j]); i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) i++; else j++;
    }
    pairs.push([n, m]);
    const la = lines(a), lb = lines(b), out = [], opts = { units, printNames: true };
    const compareLines = (A, B) => {
      const fields = [];
      if (A.lay && B.lay && A.lay.cells.length === B.lay.cells.length) {
        A.lay.cells.forEach((cell, k) => {
          if (cell[0] !== B.lay.cells[k][0]) return;
          const ta = cellText(A, k, opts).trim(), tb = cellText(B, k, opts).trim();
          if (ta !== tb) fields.push([(cellLabel(B.lay, k) || '').trim() || 'field ' + (k + 1), ta, tb]);
        });
      } else {
        const ta = printLine(A, { units }).ch.join('').trim(), tb = printLine(B, { units }).ch.join('').trim();
        if (ta !== tb) fields.push(['line', ta, tb]);
      }
      return fields;
    };
    let pi = 0, pj = 0;
    for (const [qi, qj] of pairs) {
      const da = [], db = [], match = new Map();
      for (let i = pi; i < qi; i++) da.push(i);
      for (let j = pj; j < qj; j++) db.push(j);
      // pair the unmatched records: same code and number first, then same code in order
      const taken = new Set();
      for (const byNumber of [true, false]) {
        for (const i of da) {
          if (match.has(i)) continue;
          const c = code(a.recs[i]);
          const j = db.find(x => !taken.has(x) && code(b.recs[x]) === c && (!byNumber || number(b.recs[x]) === number(a.recs[i])));
          if (j !== undefined) { match.set(i, j); taken.add(j); }
        }
      }
      for (const i of da) {
        if (!match.has(i)) { out.push({ kind: 'removed', ia: i, ib: -1, code: code(a.recs[i]), fields: [], pos: qj - 0.5 }); continue; }
        const j = match.get(i), fields = compareLines(la[i], lb[j]);
        out.push({ kind: fields.length ? 'changed' : 'hidden', ia: i, ib: j, code: code(a.recs[i]), fields, pos: j });
      }
      for (const j of db) if (!taken.has(j)) out.push({ kind: 'added', ia: -1, ib: j, code: code(b.recs[j]), fields: [], pos: j });
      pi = qi + 1; pj = qj + 1;
    }
    out.sort((x, y) => x.pos - y.pos || x.ia - y.ia);
    return { a, b, items: out, same: pairs.length - 1 };
  }

  // ---------------------------------------------------------------- folders
  // Smooth CAM Ai's program folders list names and comments in index.tbl ("NAME.EXT<tab>comment" per line).
  function parseIndexTbl(text) {
    const out = {};
    for (const line of String(text).split(/\r?\n/)) {
      if (!line || line[0] === '#') continue;
      const tab = line.indexOf('\t');
      if (tab > 0) out[line.slice(0, tab).trim().toUpperCase()] = line.slice(tab + 1).trim();
    }
    return out;
  }
  // Lines of a program whose printed text holds every word of the query (any case), e.g. "E-MILL 0.75" or "TAP".
  function searchProgram(p, units, query) {
    const words = String(query).toUpperCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    lines(p).forEach((L, i) => {
      if (!L.lay || L.sel.tpc) return;
      const text = printLine(L, { units }).ch.join('').replace(/\s+$/, '');
      const up = text.toUpperCase();
      if (words.every(w => up.indexOf(w) >= 0)) out.push({ i, text });
    });
    return out;
  }

  // Lines in MazEdit's print order: each page (layout block, lowest first) with every used tool record.
  // L.sel.tool marks a tool-data line; L.ri is the record's index in t.recs.
  function toolLines(t, all) {
    const S = SCHEMA.controls[t.ctl], out = [];
    for (const block of S.lines.slice().sort((a, b) => a - b)) {
      const lay = blockLayout(t.ctl, block, null);
      t.recs.forEach((rec, ri) => {
        if (all || toolType(t, rec)) out.push({ ctl: t.ctl, rec, lay, ri, sel: { code: 0, block, unit: false, parent: 0, variant: null, tool: true } });
      });
    }
    return out;
  }

  // Header comment (MazEdit shows it as the program comment). ASCII, NUL padded, 0x50..0x7F.
  const COMMENT_AT = 0x50, COMMENT_LEN = 48;
  function comment(p) { return ascii(p.header, COMMENT_AT, COMMENT_LEN); }
  function setComment(p, s) {
    p.header.fill(0, COMMENT_AT, COMMENT_AT + COMMENT_LEN);
    const t = cleanText(s).slice(0, COMMENT_LEN);
    for (let i = 0; i < t.length; i++) p.header[COMMENT_AT + i] = t.charCodeAt(i);
  }

  // ---------------------------------------------------------------- structure
  const code = r => u16(r, 0);
  const number = r => u16(r, 2);
  const mask = r => u32(r, 4);

  // [{i, code, seqs:[record indexes]}]: every sequence, shape or TPC record belongs to the unit before it.
  function structure(p, ls) {
    ls = ls || lines(p);
    const units = [];
    ls.forEach((L, i) => {
      if (L.sel.unit || !units.length) units.push({ i, code: L.sel.code, seqs: [] });
      else units[units.length - 1].seqs.push(i);
    });
    return units;
  }

  // Renumber UNo (0 for the common unit, then 1..) and SNo/FIG per record type inside each unit.
  // TPC and other setting records keep their numbers (the control writes 0 there).
  function renumber(p) {
    let uno = 0;
    const ls = lines(p);
    for (const u of structure(p, ls)) {
      const r = p.recs[u.i];
      put16(r, 2, u.code === 1 ? 0 : ++uno);
      if (u.code === 1) uno = 0;
      const counters = {};
      for (const i of u.seqs) {
        const L = ls[i];
        if ((!L.lay && !L.sel.inferred) || L.sel.tpc) continue;
        const c = u16(p.recs[i], 0);
        counters[c] = (counters[c] || 0) + 1;
        put16(p.recs[i], 2, counters[c]);
      }
    }
  }

  // ---------------------------------------------------------------- values
  function ascii(b, o, n) {
    let s = '';
    for (let k = 0; k < n; k++) { const c = b[o + k]; if (!c) break; s += String.fromCharCode(c); }
    return s;
  }
  function raw(rec, cell) {
    const [byte, n] = cell;
    if (n === 1) return rec[byte];
    if (n === 2) return u16(rec, byte);
    if (n === 4) return i32(rec, byte);
    return ascii(rec, byte, n);
  }
  const entered = (rec, cell) => !cell[3] || (mask(rec) & cell[3]) !== 0;
  // Fields that do not apply given another field's value (MULTI MODE OFF hides the pitches, a PT pattern
  // hides the angles, ...): lay.na = {always:[cell], rules:{cell:[[byte, [values that hide it]]]}}.
  // A selector that has not been entered hides nothing.
  // na.all lists fields that every rule must hide (any one selector can show them).
  const ruleHolds = (lay, rec) => ([b, vals, w]) => vals.indexOf(w === 2 ? u16(rec, b) : rec[b]) >= 0 &&
    lay.cells.every(c => c[0] !== b || c[1] !== (w || 1) || entered(rec, c));
  function notApplicable(lay, rec, index) {
    const na = lay.na;
    if (!na) return false;
    if (na.always.indexOf(index) >= 0) return true;
    const rules = na.rules[index];
    if (!rules) return false;
    return na.all && na.all.indexOf(index) >= 0 ? rules.every(ruleHolds(lay, rec)) : rules.some(ruleHolds(lay, rec));
  }
  // Fields MazEdit leaves blank (not "<>") for other fields' values, or never draws (na.blank*).
  function blanked(lay, rec, index) {
    const na = lay.na;
    if (!na) return false;
    if (na.blankalways && na.blankalways.indexOf(index) >= 0) return true;
    const rules = na.blank && na.blank[index];
    if (!rules) return false;
    return na.blankall && na.blankall.indexOf(index) >= 0 ? rules.every(ruleHolds(lay, rec)) : rules.some(ruleHolds(lay, rec));
  }

  // MazEdit's printf("%0.Nf") (Visual C runtime): the value is first written with 17 significant digits,
  // then that decimal string is rounded half-up, so 4.01145 prints 4.0115 where toFixed gives 4.0114.
  function printfFixed(x, dec) {
    const neg = x < 0 || Object.is(x, -0);
    const [m, e] = Math.abs(x).toExponential(16).split('e');      // 17 significant digits
    let digits = m.replace('.', ''), point = +e + 1;               // digits before the decimal point
    if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
    const keep = point + dec;
    if (digits.length > keep) {
      const up = digits.charCodeAt(keep) - 48 >= 5;
      const a = digits.slice(0, keep).split('');
      if (up) {
        let i = a.length - 1;
        for (; i >= 0; i--) { if (a[i] === '9') a[i] = '0'; else { a[i] = String.fromCharCode(a[i].charCodeAt(0) + 1); break; } }
        if (i < 0) { a.unshift('1'); point++; }
      }
      digits = a.join('');
    } else digits = digits.padEnd(keep, '0');
    const ip = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
    return (neg ? '-' : '') + ip + (dec ? '.' + digits.slice(point) : '');
  }
  // The printf of MazEdit's tool-data code: the exact binary value of the double, rounded to N decimals with
  // ties to even (-0.25 prints -0.2, 0.05 prints 0.1 because the double 0.05 is slightly above 0.05).
  function exactFixed(x, dec) {
    const neg = x < 0 || Object.is(x, -0);
    const a = Math.abs(x);
    let digits;
    if (!isFinite(a)) digits = '0';
    else {
      // a = m * 2^e exactly; scaled = a * 10^dec as a fraction of big integers
      const buf = new DataView(new ArrayBuffer(8));
      buf.setFloat64(0, a);
      const hi = buf.getUint32(0), lo = buf.getUint32(4);
      const bexp = (hi >>> 20) & 0x7ff;
      let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo), e = bexp - 1075;
      if (bexp) m |= 1n << 52n; else e = -1074;
      let num = m * 10n ** BigInt(dec), den = 1n;
      if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
      let q = num / den;
      const r2 = (num - q * den) * 2n;
      if (r2 > den || (r2 === den && (q & 1n))) q += 1n;
      digits = q.toString();
    }
    if (dec) {
      digits = digits.padStart(dec + 1, '0');
      return (neg ? '-' : '') + digits.slice(0, -dec) + '.' + digits.slice(-dec);
    }
    return (neg ? '-' : '') + digits;
  }
  // then MazEdit's trim: drop trailing zeros, keep the point ("10.", "-0.")
  function fixed(x, dec) {
    const s = printfFixed(x, dec);
    return (s.indexOf('.') < 0 ? s + '.' : s).replace(/0+$/, '');
  }
  // spec.div: divided by that number (MazEdit's v / 1000000.0); spec.round: first rounded to the last shown digit
  // (tool-data lengths in nanometres, so a tiny negative value prints "0.")
  function num(v, spec) {
    if (spec.dec === 0 && spec.scale === 1 && !spec.round) return String(v);
    let x = spec.div ? v / spec.div : v * spec.scale;
    if (spec.round) {
      const p = Math.pow(10, spec.dec), q = x * p;
      x = (q < 0 ? -Math.floor(-q + 0.5) : Math.floor(q + 0.5)) / p;
      if (x === 0) x = 0;                          // no "-0."
    }
    if (spec.div) {
      const t = exactFixed(x, spec.dec);
      return (t.indexOf('.') < 0 ? t + '.' : t).replace(/0+$/, '');
    }
    return fixed(x, spec.dec);
  }

  const hex = v => (v >>> 0).toString(16).toUpperCase();
  // how MazEdit prints an enum value it has no name for (per format, from schema)
  const unknownText = (v, style) => style === 'blank' ? '' : style === 'q' ? '?' : style === 'qhex' ? '?' + hex(v) : style === 'dec' ? String(v) :
    style === 'hex30' ? hex((v + 0x30) & 0xff) : hex(v);
  const ADDRESS = v => (v >= 4 && v <= 6 ? String(v) : v >= 10 && v <= 35 ? String.fromCharCode(v + 55) : '');
  const DRILL_CYCLES = ['', 'DRL T', 'PCK1', 'PCK2', 'AUTO', 'PCK3', 'PCK4', 'PCK5'];
  const CTR_ANGLES = ['90°', '118°', '60°'];

  // Formats whose text depends on more than the field itself (matched against MazEdit's output).
  const SPECIAL = {
    // not applicable on this machine: MazEdit prints the "<>" marker
    0x8() { return '<>'; },
    // MANL PRG DATA 1..6 (MazEdit 0x59afe7): blank without an address; F with the attribute bit is an
    // integer; rotary addresses 4/5 and metric programs use 0.0001 with 3 decimals, inch 0.00001 with 4
    0xc2(ctx) {
      const a = ctx.lay.cells[ctx.index - 1], addr = a ? ctx.rec[a[0]] : 0;
      if (!addr) return '';
      if (addr === 15 && (attribute(ctx.rec, ctx.code, ctx.ctl) & ctx.cell[5])) return String(ctx.v);
      if (addr === 4 || addr === 5 || ctx.units === 'metric') return fixed(ctx.v * 0.0001, 3);
      return fixed(ctx.v * 0.00001, 4);
    },
    // shape line approach direction P (shown inside a unit; mills UP/DOWN/LEFT/RIGHT, lathes LT/RT/DN/UP)
    // shape direction: named for shape types 32..34, a plain number for 35..37 (MazEdit, every control)
    0x100(ctx) { return numberedShape(ctx.rec) ? String(ctx.v) : shapeDirs(ctx.ctl)[ctx.v] || ''; },
    // shape-line finishing feed (MazEdit 0x52bcf2): -1 rapid, 0 blank on lathes, else a length
    0xc1(ctx) {
      if (ctx.v === 0 && CONTROLS[ctx.ctl].type === 'lathe') return '';
      return ctx.v === -1 ? 'G00' : num(ctx.v, ctx.len());
    },
    // shape-line roughness: a feed length when the attribute flag says so, else 1..9 with MazEdit's
    // triangle marks (v = one triangle); -1 rapid, 0 blank on lathes
    0xc0(ctx) {
      const v = ctx.v;
      if (v === 0 && CONTROLS[ctx.ctl].type === 'lathe') return '';
      if (v === -1) return 'G00';
      if (attribute(ctx.rec, ctx.code, ctx.ctl) & ctx.cell[5]) return num(v, ctx.len());
      if (v >= 1 && v <= 9) return 'v'.repeat(v < 3 ? 1 : v < 5 ? 2 : v < 8 ? 3 : 4).padEnd(5) + v;
      return String(v >>> 0);
    },
    // tool NOM / NOM-DIA: a tap size for taps, hundredths for the turning tools, else a length
    0x11e(ctx) { return nomText(ctx); },
    // corner sizes (MazEdit 0x52bb0b): R with the attribute flag, else C (0xbd: no letter);
    // F-CNR with attribute bit 0x2000 is a count "$n"
    0xbd(ctx) { return cornerText(ctx); },
    0xbe(ctx) { return cornerText(ctx); },
    0xbf(ctx) { return cornerText(ctx); },
    // multi-workpiece flags: the low 10 bits as binary
    0xca(ctx) { return (ctx.v & 0x3ff).toString(2).padStart(10, '0'); },
    // start/end point attributes of line units
    0x13d(ctx) { return ctx.v & 1 ? 'CLOSED' : 'OPEN'; },
    0x13e(ctx) { return ctx.v & 2 ? 'CLOSED' : 'OPEN'; },
    // tool rotation R/F
    0x110(ctx) { return ctx.v & 2 ? 'F' : 'R'; },
    0xf4(ctx) { return ctx.v ? '(Meas)' : ''; },
    // tool ID suffix: 1..24 = A..Z without I and O. The next byte selects the form: 0 upper case,
    // 0x20 "!" prefix, anything else lower case. Other values print as MazEdit does.
    0x109(ctx) { return suffixText(ctx.v, ctx.rec[ctx.cell[0] + 1]); },
    0x120(ctx) { return nomText(ctx); },
    // Smooth keeps cutting speed with 3 decimals; MazEdit shows the whole number
    0x69(ctx) { return CONTROLS[ctx.ctl].family === 'Smooth' ? String(Math.trunc(ctx.v / 1000)) : String(ctx.v); },
    // approach point, shape coordinates: '?' when the attribute bit says automatic
    0x83(ctx) { return approach(ctx); },
    0x8a(ctx) { return approach(ctx); },
    0x8b(ctx) { return approach(ctx); },
    0x8c(ctx) { return approach(ctx); },
    // turning shape R/th: a taper's angle or an arc's radius (see rthMode)
    0xb2(ctx) { return rthMode(ctx.ctl, ctx.code, ctx.rec) === 'ang' ? fixed(ctx.v * 0.0001, 4) : num(ctx.v, ctx.len()); },
    // polar coordinates of C-face lines (0x1cx): R / A, or a cartesian x / y (a length) when byte 14 says so
    0xa5(ctx) { return polar(ctx); },
    0xa6(ctx) { return polar(ctx); },
    0xa8(ctx) { return polar(ctx); },
    0xa9(ctx) { return polar(ctx); },
    0xaa(ctx) { return polar(ctx); },
    // work-piece zero at the turning centre (attribute bit of the axis)
    0x95(ctx) { return attribute(ctx.rec, ctx.code, ctx.ctl) & ctx.cell[5] ? 'T.CENTER' : num(ctx.v, ctx.len()); },
    // MMS measuring direction on lathes: Z, X, or the C angle of the line (C column, 0.0001 degree)
    // (WORK MES line: "***" and Z, X or the number in byte 10)
    0x4d(ctx, opts) {
      const v = ctx.rec[ctx.cell[0]], mms = ctx.code === 0xa2, pre = mms ? '<- ' : '***';
      if (ctx.code !== 0xa2 && ctx.code !== 0xb9) return specText(ctx, opts);
      if (v === 0) return pre + 'Z';
      if (v === 1) return pre + 'X';
      if (!mms) return pre + ctx.rec[10];
      const c = ctx.lay.cells.find(x => x[0] === 72 && x[1] === 4);
      return pre + (c && entered(ctx.rec, c) ? fixed(i32(ctx.rec, 72) * 0.0001, 4) : '0');
    },
    // spindle transfer direction
    0x92(ctx) { return ctx.v === 1 ? '1->2' : ctx.v === 2 ? '2->1' : String(ctx.v); },
    0xf8(ctx) { return ADDRESS(ctx.v); },
    0xfa(ctx) { return ADDRESS(ctx.v); },
    // M or B code type, from the record's attribute word
    0x117(ctx) { return (attribute(ctx.rec, ctx.code, ctx.ctl) & ctx.cell[5]) ? 'M' : 'B'; },
    // tap nominal size
    0x11f(ctx) { return tapSize(ctx.rec, ctx.cell[0]); },
    // priority marker on odd values
    0x48(ctx) { return ctx.v & 1 ? '*' : ''; },
    // comment text, one character per byte
    // (MazEdit prints the next byte too, so an END-line address can be two letters: "C1")
    0x12a(ctx) {
      if (ctx.v < 32) return '';
      const n = ctx.rec[ctx.cell[0] + 1];
      return String.fromCharCode(ctx.v) + (n > 32 && n < 127 ? String.fromCharCode(n) : '');
    },
    // END-line data: rotary addresses A, B, C (and C1, C2) in 0.0001 degrees, others a length
    // (always a 4-byte value, although MazEdit's table gives one field a size of 1)
    0x97(ctx) {
      const a = ctx.lay.cells[ctx.index - 1], addr = a ? ctx.rec[a[0]] : 0, v = i32(ctx.rec, ctx.cell[0]);
      return addr >= 65 && addr <= 67 ? fixed(v * 0.0001, 4) : num(v, ctx.len());
    },
    // turning spindle rotation: CW / CCW, anything else ***
    0x33(ctx) { return ctx.v === 0 ? 'CW' : ctx.v === 1 ? 'CCW' : '***'; },
    // corner types of turning shapes: shown through the corner columns, not by themselves
    0xff() { return ''; },
    // ZFD: G01 / G00 / feed multiplier (tenths); only when entered bit 0x400 is set
    0xf1(ctx) {
      const v = mask(ctx.rec) & 0x400 ? ctx.v : 0;
      if (v === 0) return 'G01';
      if (v === 0x80) return 'G00';
      if (v > 99) return '*.*';
      return (v * 0.1).toFixed(1);
    },
  };
  const isTap = t => t >= 4 && t <= 9;
  // Tool nominal size (MazEdit, same for every control): taps 4..9 and T-TAP 37..42 a tap size; GENERAL,
  // GROOVE, THREAD, SPECIAL and codes 45, 46 in hundredths; anything else a length. The tool is the
  // line's first tool field (byte 9, byte 16 on WORK MES).
  const hundredths = t => (t >= 33 && t <= 35) || t === 43 || t === 45 || t === 46;
  const toolByte = lay => { const c = lay.cells.find(x => x[2] === 0x2b || x[2] === 0x35 || x[2] === 0x28); return c ? c[0] : 9; };
  function nomText(ctx) {
    const t = ctx.rec[toolByte(ctx.lay)];
    if (isTap(t) || (t >= 37 && t <= 42)) return tapSize(ctx.rec, ctx.cell[0], ctx.cell[2] === 0x120);
    if (hundredths(t)) return fixed(ctx.v * 0.01, 2);
    return num(ctx.v, ctx.len());
  }
  // R/th of turning shapes (0xa8 by its shape type, byte 8): TPR (2) an angle, LIN "<>", type 5 nothing,
  // arcs and the rest a radius. The groove line (0xac) keeps an angle on Matrix and has none on Smooth.
  function rthMode(ctl, c, rec) {
    if (c === 0xac) return CONTROLS[ctl].family === 'Smooth' ? 'na' : 'ang';
    if ((rec[8] & 15) === 1) return 'na';
    if ((rec[8] & 15) === 5) return '';
    return rec[8] === 2 ? 'ang' : 'len';
  }
  function approach(ctx) {
    if (attribute(ctx.rec, ctx.code, ctx.ctl) & ctx.cell[5]) return '  ?';
    const spec = formatSpec(ctx.ctl, ctx.cell[2]);
    return num(ctx.v, (spec && spec[ctx.units]) || ctx.len());
  }
  const POLAR = { 0xa5: [1, 'x'], 0xa9: [2, 'y'], 0xa6: [4, 'x'], 0xaa: [8, 'y'], 0xa8: [8, 'x'] };
  function polar(ctx) {
    if (attribute(ctx.rec, ctx.code, ctx.ctl) & ctx.cell[5]) return '  ?';
    const fmt = ctx.cell[2], [bit, letter] = POLAR[fmt];
    if (ctx.rec[14] & bit) return letter + num(ctx.v, ctx.len());
    const sp = (formatSpec(ctx.ctl, fmt) || {})[ctx.units] || ctx.len();
    return (fmt === 0xa8 && ctx.rec[8] === 32 ? '' : sp.prefix || '') + num(ctx.v, sp);
  }
  function cornerText(ctx) {
    const fmt = ctx.cell[2], attr = attribute(ctx.rec, ctx.code, ctx.ctl);
    if (fmt === 0xbf && (attr & 0x2000)) return ' $' + (ctx.v >>> 0);
    const spec = formatSpec(ctx.ctl, fmt), sp = spec && spec[ctx.units] || ctx.len();
    const letter = attr & ctx.cell[5] ? 'R' : fmt === 0xbd ? (sp.prefix || ' ') : 'C';
    return letter + num(ctx.v, sp);
  }
  const shapeDirs = ctl => CONTROLS[ctl].type === 'mill' ? ['', ' UP', ' DOWN', ' LEFT', ' RIGHT'] : ['', ' LT', ' RT', ' DN', ' UP'];
  const numberedShape = rec => rec[8] >= 35 && rec[8] <= 37;

  // MazEdit's per-record attribute word (bits such as M-vs-B, automatic, R/C corner), made of one or two
  // record bytes that depend on the control and record code (probed from MazEdit 0x48188d; schema attr).
  let ATTR_CTL = null;
  function attribute(rec, c, ctl) {
    if (c === undefined) c = code(rec) & 0xff;
    const rules = SCHEMA && (ctl || ATTR_CTL) && SCHEMA.controls[ctl || ATTR_CTL].attr;
    if (rules) {
      const r = rules[c];
      if (!r) return 0;
      let w = 0;
      for (const [b, sh, m] of r) w |= (rec[b] & m) << sh;
      return w;
    }
    if (c === 0xa1 || c === 0xae) return (rec[18] << 8) | rec[19];
    if (c === 0xa5) return (rec[19] << 8) | rec[20];
    if (c >= 0xb1 && c <= 0xb3) return rec[13];
    if (c === 7 || c === 0x38) return rec[17];
    if (c === 2 || (c >= 0x41 && c <= 0x53) || c === 0x63) return rec[11];
    return 0;
  }
  // byte of the attribute word that holds a cell's wc bits (for the formats that keep flags there)
  function attrByte(c, ctl, wc) {
    const rules = SCHEMA && ctl && SCHEMA.controls[ctl].attr && SCHEMA.controls[ctl].attr[c];
    if (rules) {
      const r = rules.find(([b, sh]) => wc >= (1 << sh) && wc < (1 << (sh + 8))) || rules[rules.length - 1];
      return [r[0], r[1]];
    }
    if (c >= 0xb1 && c <= 0xb3) return [13, 0];
    if (c === 0xa1 || c === 0xae) return [19, 0];
    if (c === 0xa5) return [20, 0];
    if (c === 7 || c === 0x38) return [17, 0];
    return [11, 0];
  }

  // Tap size: kind byte, then 1 = metric M (0.1 mm in the next u16), 3 = fraction-TPI, 2/8/9 = number size,
  // 4/5/6 = pipe PT/PF/PS. Fractions keep the numerator and log2 of the denominator.
  // short: the 5-character NOM of tool lines and tool data (format 0x120) leaves out the "UN#" of number sizes
  function tapSize(rec, o, short) {
    const t = rec[o], b1 = rec[o + 1], b2 = rec[o + 2], b3 = rec[o + 3];
    if (!t) return '';
    if (t === 1) return 'M' + fixed(u16(rec, o + 2) / 10, 1);
    // b1 is the denominator's power of two (1..6); MazEdit shows a larger one as "?" and pipe sizes without it
    const den = b1 >= 1 && b1 <= 6 ? '/' + (1 << b1) : '';
    if (t === 3) return b2 + (b1 === 0 ? ' ' : den || '?') + '-' + b3;
    if (t >= 4 && t <= 6) return ['PT', 'PF', 'PS'][t - 4] + b2 + den;
    if (t === 7) return 'OTHER';
    if (b1) return '??';                                  // number sizes (2, 8, 9 and any other kind) have none
    return (short ? '' : 'UN#') + b2 + '-' + b3;
  }

  // Point-machining tool line (0xb0): HOLE-D, HOLE-DEP, PRE-DIA, PRE-DEP, RGH and DEPTH (bytes 40, 44, 48,
  // 52, 15, 56) depend on the tool type (byte 9) and its cycle (byte 14: tap / peck / planet tap, boring
  // cycle, end-mill direction, spot or chamfer), matched against MazEdit over every tool type and cycle.
  const TAP_CYCLES = ['TAP', 'PECK', 'PLANET'];
  const MILL_DIRS = ['CCW', 'CW', '*CCW', '*CW'];
  const SPOT = ['CTR-D', 'CHAMF'];
  const POINT_FIELD = { 40: 'HOLE-D', 44: 'HOLE-DEP', 48: 'PRE-DIA', 52: 'PRE-DEP', 15: 'RGH', 56: 'DEPTH' };
  function pointMode(t, c, byte) {
    if (t === 17) return 'na';
    const tapT = t === 4 || t === 5 || t === 9, pipe = t >= 6 && t <= 8;
    switch (POINT_FIELD[byte]) {
      case 'HOLE-D': return 'len';
      case 'HOLE-DEP': return t === 1 && !c ? 'na' : 'len';
      case 'PRE-DIA':
        if (t === 1) return c ? 'len4' : 'na';
        if (t === 3 || t === 10 || pipe) return 'na';
        if (tapT) return 'tapcycle';
        if (t === 11) return 'borecycle';
        return t === 15 && c >= 2 ? 'na' : 'len4';
      case 'PRE-DEP':
        if (t === 1) return c ? 'len' : 'na';
        if (t === 2) return 'uint';
        if (t === 3 || pipe) return 'na';
        if (tapT) return c === 1 || c === 2 ? 'len' : 'na';
        return t === 15 ? 'milldir' : 'len';
      case 'RGH':
        if (t === 1) return 'ctr';
        if (t === 2) return 'drl';
        if (t === 3 || t === 10 || t === 13) return 'na';
        if (tapT || pipe) return 'tap';
        return t === 0 || t >= 20 ? 'hex' : 'dec';
      case 'DEPTH':
        if (t === 1) return 'spot';
        if (t === 3) return 'reamfeed';
        return t === 10 ? 'na' : 'depth';
    }
    return null;
  }
  // inch depths are squeezed into 5 characters: drop the 0 of 0.x, then decimals (MazEdit)
  function fit5(x, dec) {
    if (x === 0) return '0.';
    let d = dec, t = printfFixed(x, d);
    const squeeze = () => { if (t.length > 5 && t.startsWith('0.')) t = t.slice(1); };
    squeeze();
    while (t.length > 5 && d > 0) { d--; t = printfFixed(x, d); squeeze(); }
    return (t.indexOf('.') < 0 ? t + '.' : t).replace(/0+$/, '');
  }
  function pointText(mode, rec, v, units) {
    const c = rec[14], inch = units !== 'metric', sc = inch ? 1e-5 : 1e-4;
    switch (mode) {
      case 'len': return fixed(v * sc, inch ? 4 : 3);
      case 'len4': return fixed(v * sc, 4);
      case 'depth': return inch ? fit5(v * sc, 4) : fixed(v * sc, 3);
      case 'uint': return String(v >>> 0);
      case 'tapcycle': return TAP_CYCLES[c] || '';
      case 'borecycle': return 'CYCLE' + (c + 1);
      case 'milldir': return MILL_DIRS[c] || '';
      case 'spot': return SPOT[c ? 1 : 0];
      case 'reamfeed': return v === 0 ? 'G01' : (v | 0) === -0x80000000 ? 'G00' : 'F' + (v | 0);
      case 'ctr': return CTR_ANGLES[v] || hex(v);
      case 'drl': return DRILL_CYCLES[v] ?? hex(v);
      case 'tap': return v ? fixed(v * 0.01, 2) : 'FIX';
      case 'hex': return hex(v);
      case 'dec': return ' ' + v;
    }
    return '<>';
  }
  const pointCell = (L, index) => L.sel.code === 0xb0 && POINT_FIELD[L.lay.cells[index][0]] !== undefined;
  // Shape lines of a pocket (POCKET, PCKT MT, PCKT VLY) on mills: the R-FEED column shows whether the side
  // is open (byte 15: 0 CLOSED, 1 OPEN) and RGH becomes the open side's feed length ('<>' on a closed side).
  const POCKETS = new Set([0x63, 0x64, 0x65]);
  function pocketCell(L, index) {
    if (L.sel.code !== 0xc2 || L.sel.unit || !POCKETS.has(L.sel.parent) || CONTROLS[L.ctl].type === 'lathe') return null;
    const b = L.lay.cells[index][0];
    return b === 76 ? 'side' : b === 64 ? 'open' : null;
  }
  const SIDES = ['CLOSED', 'OPEN'];
  // values typed by the user are blank until entered; menu words and fixed texts always show
  const POINT_CHECKS_ENTERED = new Set(['len', 'len4', 'uint', 'depth', 'dec', 'ctr', 'borecycle']);

  // Text MazEdit prints for one cell ('' = nothing drawn). opts.units: 'inch' | 'metric'.
  function cellText(L, index, opts) {
    const { ctl, rec, lay } = L, cell = lay.cells[index], fmt = cell[2];
    if (fmt === 6) return '';
    if (lay.shape === 0xfffd && !(opts && opts.tpc)) return '';     // TPC data: MazEdit prints it only when asked
    const units = (opts && opts.units) || 'inch';
    if (pointCell(L, index)) {
      const mode = pointMode(rec[9], rec[14], cell[0]);
      if (mode === 'na') return '<>';
      if (POINT_CHECKS_ENTERED.has(mode) && !entered(rec, cell)) return '';
      return pointText(mode, rec, raw(rec, cell), units);
    }
    const pk = pocketCell(L, index);
    if (pk === 'side') return SIDES[rec[15]] || '?' + hex(rec[15]);
    if (pk === 'open') {
      if (!rec[15]) return '<>';
      if (!entered(rec, cell)) return '';
      const v = raw(rec, cell);
      return v === -1 ? 'G00' : num(v, formatSpec(ctl, 0x7b)[units]);
    }
    const m = cxMode(L, index);
    if (m !== null) return cxText(L, index, m, opts);
    if (fmt === 0xb2) { const r = rthMode(ctl, L.sel.code, rec); if (r === 'na') return '<>'; if (r === '') return ''; }
    const pc = lay.pctx && !L.sel.unit && lay.pctx[index] && lay.pctx[index][L.sel.parent];
    if (pc !== undefined && pc !== null && pc !== false) return pc === 'na' ? '<>' : pc === '' ? '' : pc.slice(1);
    if (fmt === 8 || notApplicable(lay, rec, index)) return '<>';
    if (blanked(lay, rec, index)) return '';
    return valueText(L, index, opts);
  }
  // A field's value as its format prints it, blank until entered (opts.always: even when not entered).
  function valueText(L, index, opts) {
    const { ctl, rec, lay } = L, cell = lay.cells[index], fmt = cell[2];
    const units = (opts && opts.units) || 'inch';
    if (!entered(rec, cell) && !(opts && opts.always)) return '';
    const ctx = {
      ctl, rec, index, cell, lay, code: L.sel.code, parent: L.sel.unit ? 0 : L.sel.parent, v: raw(rec, cell), units, variant: L.sel.variant,
      len: () => formatSpec(ctl, 0x7b)[units],
    };
    // tool-data layouts keep their own numbers (nanometre lengths) where programs have special rules; a tap's
    // nominal size is still a tap size
    const tool = SCHEMA.controls[ctl].layout, own = tool && formatSpec(ctl, fmt);
    if (own && (fmt === 0x120 || fmt === 0xd6 || fmt === 0x11e)) {
      const t = rec[toolByte(lay)];
      if (isTap(t) || (t >= 37 && t <= 42)) return tapSize(rec, cell[0], fmt === 0x120);
    }
    if (SPECIAL[fmt] && !(own && own.kind === 'num')) return SPECIAL[fmt](ctx, opts);
    return specText(ctx, opts);
  }
  // a value through its format's table entry (numbers, menus, tool names)
  function specText(ctx, opts) {
    const { ctl, rec, cell, units } = ctx, fmt = cell[2];
    const spec = formatSpec(ctl, fmt);
    if (!spec) return String(ctx.v);
    switch (spec.kind) {
      case 'na': return '<>';
      case 'blank': return '';
      case 'num': return spec[units] ? (spec[units].prefix || '') + num(ctx.v, spec[units]) : String(ctx.v);
      case 'int': return String(ctx.v);
      case 'text': return String(ctx.v);
      case 'enum': {
        if (fmt === 0x2b) {
          // tool name; from code 23 on (turning tools and unknown codes) followed by the machining part
          const names = opts && opts.printNames ? PRINT_TOOL_NAMES : TOOL_NAMES;
          const name = (ctx.v < 32 && names[ctx.v]) || (spec.values[ctx.v] !== undefined ? spec.values[ctx.v] : unknownText(ctx.v, spec.unknown));
          if (ctx.v < 23) return name;
          const part = enumText(ctl, 0xef, rec[cell[0] + 1]);
          return part ? name.padEnd(8) + part : name;
        }
        const v = spec.low ? ctx.v & 0xff : ctx.v;      // some menus use only the low byte of their word
        const t = spec.values[v];
        return t !== undefined ? t : unknownText(v, spec.unknown);
      }
      default: return String(ctx.v);
    }
  }

  // Context modes (tools/cx_probe.py, cx_fit.js): how each field of a line prints given its unit and the
  // line's own selector fields (R/F, PAT, ...). lay.cx = {sel: [byte], cls: [per selector: [class: [[lo, hi]]]],
  // pc: {parent: class}, rows: [per parent class: {"c/c": mode row#}], own: [per parent class: {byte:
  // {"*/c": {cell: mode}}}], modes: [[mode per cell]], maps: [{value: text}]}.
  // Modes: 'n' the field's format (blank until entered), 'n!' the same even when not entered, 'na' "<>",
  // '' nothing, '=text' a fixed text, 'd' a decimal number, '[k' 0..k-1 as " n" and k.. as "[n-k]",
  // 'm#' a table of texts; a trailing '?' leaves the field blank until it is entered.
  function classOf(ranges, v) {
    for (let c = 0; c < ranges.length; c++) for (const [lo, hi] of ranges[c]) if (v >= lo && v <= hi) return c;
    return 0;
  }
  function cxMode(L, index) {
    const cx = L.lay && L.lay.cx;
    if (!cx) return null;
    const pc = cx.pc[L.sel.parent] !== undefined ? cx.pc[L.sel.parent] : cx.pc[0];
    if (pc === undefined) return null;
    const cls = cx.sel.map((b, j) => classOf(cx.cls[j], L.rec[b]));
    const cell = L.lay.cells[index], j = cell[1] === 1 ? cx.sel.indexOf(cell[0]) : -1;
    if (j >= 0) {
      const own = cx.own[pc] && cx.own[pc][cell[0]];
      const m = own && own[cls.map((c, k) => (k === j ? '*' : c)).join('/')];
      return m && m[index] !== undefined ? m[index] : null;
    }
    const r = cx.rows[pc] && cx.rows[pc][cls.join('/')];
    return r === undefined ? null : cx.modes[r][index] === undefined ? null : cx.modes[r][index];
  }
  function cxText(L, index, mode, opts) {
    const cell = L.lay.cells[index];
    let m = mode;
    if (m.length > 1 && m[m.length - 1] === '?') {
      if (!entered(L.rec, cell)) return '';
      m = m.slice(0, -1);
    }
    if (m === 'n') return valueText(L, index, opts);
    if (m === 'n!') return valueText(L, index, Object.assign({}, opts, { always: true }));
    if (m === 'na') return '<>';
    if (m === '') return '';
    if (m[0] === '=') return m.slice(1);
    const v = raw(L.rec, cell);
    if (m === 'd') return String(v);
    if (m === 'x') return hex(v);
    if (m[0] === '[') { const k = +m.slice(1); return v < k ? ' ' + v : '[' + (v - k) + ']'; }
    if (m[0] === 'm') { const t = L.lay.cx.maps[+m.slice(1)][v]; return t === undefined ? '' : t; }
    if (m[0] === 'f' || m[0] === 'w') {        // another format's number ('w': squeezed into 5 characters)
      const spec = formatSpec(L.ctl, +m.slice(1)), units = (opts && opts.units) || 'inch', sp = spec && spec[units];
      if (!sp) return String(v);
      const t = (sp.prefix || '') + num(v, sp);
      return m[0] === 'w' && t.length > 5 && t.startsWith('0.') ? t.slice(1) : m[0] === 'w' && t.length > 5 && t.startsWith('-0.') ? '-' + t.slice(2) : t;
    }
    return valueText(L, index, opts);
  }

  // ---------------------------------------------------------------- screen helpers
  // Fields MazEdit never draws for this machine (they stay in the record untouched).
  const HIDDEN_FMT = new Set([6]);
  function shownCells(lay) {
    if (!lay) return [];
    const out = [];
    lay.cells.forEach((x, i) => { if (!HIDDEN_FMT.has(x[2])) out.push(i); });
    return out;
  }
  // The column heading above a cell: header words overlapping the cell's columns.
  function cellLabel(lay, index) {
    const cell = lay.cells[index], col = cell[4];
    if (cell[2] === 0xf8 || cell[2] === 0xfa) {
      const next = lay.cells[index + 1];
      return (next ? cellLabel(lay, index + 1) + ' ' : '') + 'address';
    }
    let end = col + 10;
    for (const i of shownCells(lay)) { const x = lay.cells[i][4]; if (x > col && x < end) end = x; }
    // tool data has several heading lines; the words over the column from each (bottom line first)
    const labels = (lay.heads ? lay.heads.slice().reverse() : [lay.head]).map(h => headWord(h, col, end)).filter(Boolean);
    return [...new Set(labels)].join(' / ');
  }
  function headWord(head, col, end) {
    // header words, with short tokens ("1" of "DATA 1", "C" of "ANGLE C") joined to the word before
    const words = [], re = /\S+/g;
    let m;
    while ((m = re.exec(head || ''))) {
      const last = words[words.length - 1];
      if (last && /^(\d{1,2}|[A-Za-z])$/.test(m[0]) && m.index === last.at + last.text.length + 1)
        last.text += ' ' + m[0];
      else words.push({ at: m.index, text: m[0] });
    }
    const hits = words.filter(w => w.at < end && w.at + w.text.length > col);
    if (!hits.length) return '';
    hits.sort((a, b) => Math.abs(a.at - col) - Math.abs(b.at - col));
    return hits[0].text;
  }
  // prompt text of a field: MazEdit's own, or a description for the fields it leaves without one
  const FORMAT_PROMPTS = {
    0x110: 'Roughing (R) or finishing (F) tool sequence', 0x48: 'Priority mark: * or OFF',
    0xf8: 'Address of the data: X, Y, Z, I, J, K, R, F, ... (type the value with it, e.g. X1.5)',
    0xfa: 'Argument address (type the value with it, e.g. A1.5)',
    0xc2: 'Data value; type the address with it, e.g. X1.5', 0x1a: 'Start point of the shape (*)',
    0x106: 'Corner: R for a radius or C for a chamfer, with its size',
    0x2b: 'Which type of tool <menu>', 0x8a: 'Approach point, or ? for automatic',
  };
  function prompt(cell) { return SCHEMA.prompts[cell[6]] || FORMAT_PROMPTS[cell[2]] || ''; }

  // Unit names as the Mazak control shows them (its own text table), by record code.
  const UNIT_NAMES = {
    2: 'WPC-', 3: 'OFFSET', 4: 'END', 5: 'SUB PRO', 6: 'MANL PRG', 7: 'M-CODE', 8: 'MMS', 0xa: 'PALT CHG', 0xb: 'PROC END',
    0xc: 'INDEX', 0xf: 'WPCSHIFT', 0x10: 'MATERIAL', 0x11: 'WORK MES', 0x12: 'TRANSFER', 0x13: 'HEAD', 0x14: 'TOOL MES',
    0x15: 'SIMULTAN', 0x16: '2 WORKPC', 0x17: 'COMMENT', 0x20: 'DRILLING', 0x21: 'RGH CBOR', 0x22: 'RGH BCB', 0x23: 'REAMING',
    0x24: 'TAPPING', 0x25: 'BK-CBORE', 0x26: 'CIRC MIL', 0x27: 'CBOR-TAP', 0x28: 'BORE T1', 0x29: 'BORE S1', 0x2a: 'BORE T2',
    0x2b: 'BORE S2', 0x30: 'BAR', 0x31: 'CPY', 0x32: 'CORNER', 0x33: 'FACING', 0x34: 'THREAD', 0x35: 'T.GROOVE', 0x36: 'T.DRILL',
    0x37: 'T.TAP', 0x39: 'MILLTURN', 0x40: 'LINE CTR', 0x41: 'LINE RGT', 0x42: 'LINE LFT', 0x43: 'LINE OUT', 0x44: 'LINE IN',
    0x50: 'CHMF RGT', 0x51: 'CHMF LFT', 0x52: 'CHMF OUT', 0x53: 'CHMF IN', 0x60: 'FCE MILL', 0x61: 'TOP EMIL', 0x62: 'STEP',
    0x63: 'POCKET', 0x64: 'PCKT MT', 0x65: 'PCKT VLY', 0x66: 'SLOT', 0x70: 'ROTATE 1', 0x71: 'ROTATE 2', 0x72: 'ROTATE 3',
    0x73: 'ROTATE 4', 0x74: 'PARALL.1', 0x75: 'PARALL.2', 0x76: 'PARALL.3', 0x7f: 'TEXT',
  };
  function unitName(ctl, c) {
    const bl = BLOCKS[ctl] && BLOCKS[ctl][BY_CODE[ctl][c]];
    return UNIT_NAMES[c] !== undefined ? UNIT_NAMES[c] : bl ? bl.name.replace(/^_$/, '') : 'unit 0x' + c.toString(16);
  }

  // One record as a line in MazEdit's print layout: the unit or sequence number, the unit name, then
  // each drawn field at its column (a later field overwrites an earlier one, as in MazEdit).
  // own[x] = index of the field drawing column x, -1 for numbers, names and blanks; with opts.regions
  // the blank columns after a field up to the next one are given to it too (for clicking).
  // opts.units; opts.screen draws the not-applicable marker "<>" as a diamond.
  const LINE_W = 132;
  function printLine(L, opts) {
    opts = opts || {};
    const { rec, lay } = L, W = LINE_W;
    const ch = new Array(W).fill(' '), own = new Array(W).fill(-1), texts = {};
    const put = (t, col, o) => { for (let i = 0; i < t.length && col + i < W; i++) { ch[col + i] = t[i]; own[col + i] = o; } };
    const c = L.sel.code;
    if (!lay) {
      put(String(number(rec)).padStart(4), 0, -1);
      put('record 0x' + code(rec).toString(16) + ' (kept, not shown)', 5, -1);
      return { ch, own, cells: [], texts };
    }
    const shown = shownCells(lay);
    const firstCol = Math.min(99, ...shown.map(i => lay.cells[i][4]).filter(x => x > 0));
    if (!L.sel.tool) {                           // tool-data lines print their own numbers
      put(String(number(rec)).padStart(L.sel.unit ? (c === 1 ? 3 : 4) : firstCol >= 5 ? 4 : 3), 0, -1);
      if (L.sel.unit && c !== 1) put(unitName(L.ctl, c), 5, -1);
    }
    for (const i of shown) {
      let t = cellText(L, i, { units: opts.units, printNames: true }).replace(/ø/g, '°');
      texts[i] = t;
      if (t === '<>' && opts.screen) t = '◆ ';
      put(t, lay.cells[i][4], i);
    }
    if (opts.regions) {
      const starts = shown.map(i => [lay.cells[i][4], i]).sort((a, b) => a[0] - b[0]);
      starts.forEach(([a, i], j) => {
        const b = j + 1 < starts.length ? starts[j + 1][0] : a + 9;
        for (let x = a; x < b && x < W; x++) if (own[x] === -1 && ch[x] === ' ') own[x] = i;
      });
    }
    return { ch, own, cells: shown, texts };
  }
  const lineText = (L, opts) => printLine(L, opts).ch.join('').replace(/\s+$/, '');

  // ---------------------------------------------------------------- editing
  function cleanText(s) { return String(s).toUpperCase().replace(/[^\x20-\x7e]/g, ''); }

  // Flags kept in a few bits of a byte shared with other fields: editing touches only these bits.
  const FLAG_BITS = { 0x48: 1, 0x110: 2, 0x13d: 1, 0x13e: 2, 0x117: 0x80 };
  const FLAG_WORDS = {
    0x48: { '*': 1, ON: 1, OFF: 0, NO: 0, '-': 0 },
    0x110: { R: 0, F: 2 },
    0x13d: { OPEN: 0, CLOSED: 1, CLOSE: 1 },
    0x13e: { OPEN: 0, CLOSED: 2, CLOSE: 2 },
    0x117: { M: 0x80, B: 0 },
  };
  const NUM_RE = /^[-+]?(\d+\.?\d*|\.\d+)$/;
  function parseNum(s) {
    const t = String(s).trim().replace(/^[A-Z#*]+\s*/i, '');
    if (!NUM_RE.test(t)) throw new Error('Enter a number');
    return parseFloat(t);
  }
  function inRange(v, n) {
    const lim = n === 1 ? [0, 255] : n === 2 ? [0, 65535] : [-2147483648, 2147483647];
    if (!Number.isFinite(v) || v < lim[0] || v > lim[1]) throw new Error('Out of range');
    return v;
  }
  const addrCode = ch => (/^[456]$/.test(ch) ? +ch : ch.charCodeAt(0) - 55);
  const TOOL_KEY = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const TOOL_ALIASES = {
    EMILL: 15, ENDMILL: 15, FMILL: 14, FACEMILL: 14, FCEMILL: 14, BALLENDMILL: 19, BALLMILL: 19, BALEMIL: 19, BEMILL: 19,
    CHAMFER: 13, CHMF: 13, CHMFM: 13, CENTERDRILL: 1, CTRDRILL: 1, SPOTDRILL: 1, BORINGBAR: 11, BORBAR: 11, BBAR: 11,
    BACKFACE: 10, BCKFACE: 10, BSPFC: 10, PROBE: 18, TOUCHSENSOR: 18, TOLSENS: 18, CHIPVAC: 17, CHPVAC: 17,
    GENERAL: 33, GROOVE: 34, THREAD: 35, TDRILL: 36, TTAP: 37, SPECIAL: 43,
  };
  function toolCode(text, units) {
    const k = TOOL_KEY(text);
    if (/^\d+$/.test(k)) return +k;
    if (k === 'TAP') return units === 'metric' ? 4 : 5;
    for (const names of [PRINT_TOOL_NAMES, TOOL_NAMES]) for (const [c, n] of Object.entries(names)) if (TOOL_KEY(n) === k) return +c;
    if (TOOL_ALIASES[k] !== undefined) return TOOL_ALIASES[k];
    throw new Error('Unknown tool; e.g. E-MILL, DRILL, CTR-DR, TAP, CHMF-M, F-MILL, GENERAL, GROOVE');
  }
  // "M10", "M6x1", "1/4-20", "1-8", "#10-24", "UN#10-24", "10-24", "PT1/8", "OTHER" -> [kind, b1, b2, b3]
  function parseTap(text) {
    const s = String(text).toUpperCase().replace(/\s+/g, ' ').trim();
    let m;
    const fr = (whole, a, b) => {
      let nu = +a, de = b ? +b : 1;
      if (whole) nu += +whole * de;
      while (de > 1 && nu % 2 === 0) { nu /= 2; de /= 2; }
      const l = Math.log2(de);
      if (!Number.isInteger(l) || l > 6 || nu > 255) throw new Error('Fraction must be over 2, 4, 8, 16, 32 or 64');
      return [l, nu];
    };
    if ((m = s.match(/^M ?(\d+(?:\.\d*)?|\.\d+)(?: ?X ?[\d.]+)?$/))) { const v = inRange(Math.round(+m[1] * 10), 2); return [1, 0, v & 255, v >> 8]; }
    if (s === 'OTHER') return [7, 0, 0, 0];
    if ((m = s.match(/^(?:UN)?# ?(\d+) ?- ?(\d+)$/))) return [2, 0, inRange(+m[1], 1), inRange(+m[2], 1)];
    if ((m = s.match(/^(?:(\d+)[ -])?(\d+)\/(\d+) ?- ?(\d+)$/))) { const [l, nu] = fr(m[1], m[2], m[3]); return [3, l, nu, inRange(+m[4], 1)]; }
    // "10-24" is how tool lines show number size #10-24; whole inches show with a space ("1 -8")
    if ((m = s.match(/^(\d+)-(\d+)$/)) && +m[2] >= 24 && +m[1] <= 12) return [2, 0, +m[1], inRange(+m[2], 1)];
    if ((m = s.match(/^(\d+) ?- ?(\d+)$/))) return [3, 0, inRange(+m[1], 1), inRange(+m[2], 1)];
    if ((m = s.match(/^P([TFS]) ?(?:(\d+)[ -])?(\d+)(?:\/(\d+))?$/))) { const [l, nu] = fr(m[2], m[3], m[4]); return [{ T: 4, F: 5, S: 6 }[m[1]], l, nu, 0]; }
    throw new Error('Tap size like M10, 1/4-20, #10-24 or PT1/8');
  }

  function setRaw(rec, cell, v) {
    const [byte, n] = cell;
    if (n === 1) rec[byte] = v & 255;
    else if (n === 2) put16(rec, byte, v);
    else if (n === 4) put32(rec, byte, v);
    else { rec.fill(0, byte, byte + n); for (let k = 0; k < Math.min(n, v.length); k++) rec[byte + k] = v.charCodeAt(k); }
  }
  const markEntered = (rec, cell) => { if (cell[3]) put32(rec, 4, mask(rec) | cell[3]); };
  function setCell(rec, cell, v) { setRaw(rec, cell, v); markEntered(rec, cell); }

  // Why a field cannot be typed into ('' when it can).
  function locked(L, index) {
    if (!L.lay) return 'This record type is kept as it is but cannot be edited.';
    const { rec, lay } = L, cell = lay.cells[index], fmt = cell[2];
    if (L.sel.inferred) return 'MazEdit has no layout for this record type; it is shown for reading only.';
    if (HIDDEN_FMT.has(fmt)) return 'This field is not shown for this machine.';
    if (pointCell(L, index)) return pointMode(rec[9], rec[14], cell[0]) === 'na' ? 'Not used with this tool (◆).' : '';
    const pk = pocketCell(L, index);
    if (pk) return pk === 'open' && !rec[15] ? 'Used only on an open side (◆).' : '';
    const m = cxMode(L, index);
    if (m !== null) {
      const b = m.length > 1 && m[m.length - 1] === '?' ? m.slice(0, -1) : m;
      if (b === 'na') return 'Not used with this unit and tool sequence (◆).';
      if (b === '' || b[0] === '=') return 'Not used with this unit and tool sequence.';
      return '';
    }
    if (fmt === 8) return 'Not used on this machine (◆).';
    if (fmt === 0xb2 && rthMode(L.ctl, L.sel.code, rec) === 'na') return 'Not used with this shape (◆).';
    if (fmt === 0xb2 && rthMode(L.ctl, L.sel.code, rec) === '') return 'Not used with this shape.';
    if (notApplicable(lay, rec, index)) return 'Not used with the current settings of this line (◆).';
    return '';
  }

  // Soft-key choices for a field (what the user could type), [] for free entry.
  function choices(L, index) {
    const { ctl, rec, lay } = L, cell = lay.cells[index], fmt = cell[2];
    if (pointCell(L, index)) {
      switch (pointMode(rec[9], rec[14], cell[0])) {
        case 'tapcycle': return TAP_CYCLES.slice();
        case 'borecycle': return ['CYCLE1', 'CYCLE2', 'CYCLE3', 'CYCLE4', 'CYCLE5', 'CYCLE6'];
        case 'milldir': return MILL_DIRS.slice();
        case 'spot': return SPOT.slice();
        case 'reamfeed': return ['G01', 'G00'];
        case 'ctr': return CTR_ANGLES.slice();
        case 'drl': return DRILL_CYCLES.slice(1);
        case 'tap': return ['FIX'];
      }
      return [];
    }
    const pk = pocketCell(L, index);
    if (pk) return pk === 'side' ? SIDES.slice() : ['G00'];
    switch (fmt) {
      case 0x2b: {
        const spec = formatSpec(ctl, fmt);
        const turning = L.sel.code === 0xb4 || L.sel.code === 0xb8;
        const codes = turning ? [33, 34, 35, 36, 37, 43] : Object.keys(PRINT_TOOL_NAMES).filter(k => +k <= 19).map(Number);
        return codes.map(k => PRINT_TOOL_NAMES[k] || (spec && spec.values[k] && spec.values[k].trim()) || TOOL_NAMES[k]).filter(Boolean);
      }
      case 0x35: {                               // turning tool line: GNL GRV THR DRL TAP SPL, TOL SENS
        const spec = formatSpec(ctl, fmt);
        return [33, 34, 35, 36, 37, 43, 44].map(k => spec && spec.values[k] && spec.values[k].trim()).filter(Boolean);
      }
      case 0x109: return SUFFIX.slice(1).split('');
      case 0x117: return ['M', 'B'];
      case 0x110: return ['R', 'F'];
      case 0x13d: case 0x13e: return ['OPEN', 'CLOSED'];
      case 0x48: return ['*', 'OFF'];
      case 0xf1: return ['G01', 'G00'];
      case 0xc1: case 0xc0: return ['G00'];
      case 0xf8: case 0xfa: return ['X', 'Y', 'Z', 'I', 'J', 'K', 'R', 'F', 'P', 'Q', 'D', 'H', 'L', 'A', 'B', 'C'];
      case 0x105: return ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];
      case 0x33: return ['CW', 'CCW'];
      case 0x100: return numberedShape(rec) ? [] : shapeDirs(ctl).slice(1).map(t => t.trim());
      case 0x8a: case 0x8b: case 0x8c: return ['?'];
      case 0x83: return (SCHEMA.controls[ctl].attr || {})[L.sel.code] ? ['?'] : [];
      case 0x92: return ['1->2', '2->1'];
      case 0x4d: if (L.sel.code === 0xa2) return ['Z', 'X', 'C']; break;
      case 0x95: return ['T.CENTER'];
    }
    const spec = formatSpec(ctl, fmt);
    if (!spec || spec.kind !== 'enum') return [];
    const seen = new Set(), out = [];
    for (const [k, v] of Object.entries(spec.values)) {
      const s = v.trim();
      if (!s || s === unknownText(+k, spec.unknown).trim() || seen.has(s) || s[0] === '?' || /^[0-9A-F]{1,3}$/.test(s) && +k > 15) continue;
      seen.add(s); out.push(s);
    }
    return out.length > 40 ? [] : out;
  }

  // Store what the user typed into a field. Throws Error(message) when it cannot be used.
  function enter(L, index, text, opts) {
    const units = (opts && opts.units) || 'inch';
    const { ctl, rec, lay } = L, cell = lay.cells[index], fmt = cell[2], n = cell[1];
    const why = locked(L, index);
    if (why) throw new Error(why);
    const t = String(text).trim(), up = t.toUpperCase(), tight = up.replace(/\s+/g, '');
    if (!t) throw new Error('Type a value, or press Delete to clear the field.');
    // typing what the field already shows changes nothing (keeps digits the display rounds away,
    // unusual encodings and padding exactly as they are)
    if (cellText(L, index, { units, printNames: true }).trim() === t || cellText(L, index, { units }).trim() === t) return;
    const len = formatSpec(ctl, 0x7b)[units];
    const set = v => setCell(rec, cell, inRange(v, n));
    const length = s => set(Math.round(parseNum(s) / len.scale));
    const int = s => {
      const m = String(s).trim().toUpperCase().match(/^[A-Z#]*\s*([-+]?\d+)$/);
      if (!m) throw new Error('Enter a whole number');
      set(+m[1]);
    };
    const tool = rec[9];
    if (pointCell(L, index)) return enterPoint(rec, cell, pointMode(tool, rec[14], cell[0]), t, units);
    if (SCHEMA.controls[ctl].layout) {           // tool data: numbers in the field's own units (nanometres ...)
      const own = formatSpec(ctl, fmt), sp = own && own.kind === 'num' && own[units];
      if (sp) {
        const tl = rec[toolByte(lay)];
        if ((fmt === 0x120 || fmt === 0xd6 || fmt === 0x11e) && (isTap(tl) || (tl >= 37 && tl <= 42))) return setTap(rec, cell, parseTap(t));
        const x = parseNum(t);
        return set(Math.round(sp.div ? x * sp.div : x / sp.scale));
      }
    }
    const cm = cxMode(L, index), cb = cm && cm.length > 1 && cm[cm.length - 1] === '?' ? cm.slice(0, -1) : cm;
    if (cb === 'd') return int(t);
    if (cb && cb[0] === '[') {                   // " 1" or "[1]": plain numbers below k, bracketed from k on
      const k = +cb.slice(1), m = tight.match(/^(\[)?(\d+)\]?$/);
      if (!m) throw new Error('A number, or [n] for the bracketed values');
      return set(m[1] ? +m[2] + k : +m[2]);
    }
    if (cb && cb[0] === 'm') {
      const tbl = lay.cx.maps[+cb.slice(1)], hit = Object.keys(tbl).find(v => tbl[v].trim() === t);
      if (hit === undefined) throw new Error('One of: ' + [...new Set(Object.values(tbl).map(x => x.trim()).filter(Boolean))].slice(0, 12).join(', '));
      return set(+hit);
    }
    const pk = pocketCell(L, index);
    if (pk === 'side') {
      const k = SIDES.indexOf(tight === 'CLOSE' ? 'CLOSED' : tight);
      if (k < 0) throw new Error('OPEN or CLOSED');
      rec[15] = k;
      return;
    }
    if (pk === 'open') return tight === 'G00' || tight === 'G0' ? set(-1) : length(t);

    if (FLAG_BITS[fmt] !== undefined) {
      if (fmt === 0x117) {                       // M/B, optionally with the code: "M8"
        const m = tight.match(/^([MB])(\d+)?$/);
        if (!m) throw new Error('M or B, optionally with the code, e.g. M8');
        setFlag(rec, cell, m[1] === 'M' ? 0x80 : 0);
        if (m[2] !== undefined && lay.cells[index + 1]) setCell(rec, lay.cells[index + 1], inRange(+m[2], lay.cells[index + 1][1]));
        return;
      }
      const words = FLAG_WORDS[fmt];
      if (!(tight in words)) throw new Error('Choose ' + Object.keys(words).slice(0, 2).join(' or '));
      setFlag(rec, cell, words[tight]);
      return;
    }
    switch (fmt) {
      case 0xf8: case 0xfa: {                    // address letter, optionally with its value: "X1.5"
        const m = up.match(/^([A-Z]|[456])\s*(.*)$/);
        if (!m || m[1] === 'O') throw new Error('An address letter, e.g. X, or with its value: X1.5');
        setCell(rec, cell, addrCode(m[1]));
        if (m[2]) enter(L, index + 1, m[2], opts);
        return;
      }
      case 0xc2: {                               // MANL PRG data: "X1.5", or "1.5" for the existing address
        const a = lay.cells[index - 1];
        // a plain number is the value ("4.5" is not address 4 with .5; type "4 .5" for that)
        const m = /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(tight) ? [tight, undefined, tight] : up.match(/^([A-Z]|[456])?\s*([-+]?(?:\d+\.?\d*|\.\d+))?$/);
        if (!m || (!m[1] && m[2] === undefined)) throw new Error('A value with its address, e.g. X1.5');
        if (m[1]) setCell(rec, a, addrCode(m[1]));
        const addr = rec[a[0]];
        if (m[2] === undefined) return;
        if (!addr) throw new Error('Give the address with the value, e.g. X' + m[2]);
        const x = parseFloat(m[2]);
        if (addr === 15 && (attribute(rec, L.sel.code, ctl) & cell[5])) return set(Math.round(x));
        return set(Math.round(x / (addr === 4 || addr === 5 || units === 'metric' ? 1e-4 : 1e-5)));
      }
      case 0x92: if (tight === '1->2') return set(1); if (tight === '2->1') return set(2); return int(t);
      case 0x4d: {
        if (L.sel.code !== 0xa2) break;
        const k = ['Z', 'X', 'C'].indexOf(tight.replace(/^<-/, ''));
        if (k < 0) throw new Error('Z, X or C (the C angle of the line)');
        return set(k);
      }
      case 0xb2: return rthMode(ctl, L.sel.code, rec) === 'ang' ? set(Math.round(parseNum(t) / 0.0001)) : length(t);
      case 0x83:
        if (!(SCHEMA.controls[ctl].attr || {})[L.sel.code]) break;   // no automatic flag on this line
      // falls through
      case 0x8b: case 0x8c:
      case 0x8a: {                               // approach point: a value, or ? for automatic
        const [ab, sh] = attrByte(L.sel.code, ctl, cell[5]);
        if (tight === '?' || tight === 'AUTO') { rec[ab] |= cell[5] >> sh; markEntered(rec, cell); return; }
        const v = inRange(Math.round(parseNum(t) / ((formatSpec(ctl, fmt) || {})[units] || len).scale), 4);
        rec[ab] &= ~(cell[5] >> sh);
        return set(v);
      }
      case 0x2b: return set(toolCode(t, units));
      case 0xa5: case 0xa6: case 0xa8: case 0xa9: case 0xaa: {
        // "x1.5" / "y1.5" cartesian, "R1.5" / "A30." polar, or a bare number in the current form
        const [bit, letter] = POLAR[fmt], m = t.match(/^([A-Za-z])?\s*(.*)$/), l = m[1] ? m[1].toLowerCase() : '';
        const cart = l ? l === letter : (rec[14] & bit) !== 0;
        if (l && l !== letter && l !== 'r' && l !== 'a') throw new Error('A value, with ' + letter + ' for a cartesian coordinate');
        const sp = cart ? len : ((formatSpec(ctl, fmt) || {})[units] || len);
        const v = inRange(Math.round(parseNum(m[2]) / sp.scale), 4);
        rec[14] = cart ? rec[14] | bit : rec[14] & ~bit;
        return set(v);
      }
      case 0x95: if (tight === 'T.CENTER' || tight === 'TCENTER') { const [ab, sh] = attrByte(L.sel.code, ctl, cell[5]); rec[ab] |= cell[5] >> sh; return markEntered(rec, cell); }
        { const [ab, sh] = attrByte(L.sel.code, ctl, cell[5]); rec[ab] &= ~(cell[5] >> sh); return length(t); }
      case 0x109: {                              // A..Z; a lower-case letter sets the lower-case form
        const m = t.replace(/\s+/g, '').match(/^(!?)([A-Za-z])$/), k = m ? SUFFIX.indexOf(m[2].toUpperCase()) : -1;
        if (k < 1) throw new Error('A suffix letter A..Z (no I or O)');
        set(k);
        rec[cell[0] + 1] = m[1] ? 0x20 : m[2] !== m[2].toUpperCase() ? 0x80 : 0;
        return;
      }
      case 0x11f: return setTap(rec, cell, parseTap(t));
      case 0x33: if (tight !== 'CW' && tight !== 'CCW') throw new Error('CW or CCW'); return set(tight === 'CW' ? 0 : 1);
      case 0x100: {
        if (numberedShape(rec)) return int(t);
        const k = shapeDirs(ctl).findIndex(d => d.trim() === tight);
        if (k < 1) throw new Error('One of ' + shapeDirs(ctl).slice(1).map(d => d.trim()).join(', '));
        return set(k);
      }
      case 0x11e: case 0x120: {
        const tl = rec[toolByte(lay)];
        if (isTap(tl) || (tl >= 37 && tl <= 42)) return setTap(rec, cell, parseTap(t));
        return hundredths(tl) ? set(Math.round(parseNum(t) * 100)) : length(t);
      }
      case 0x69: return CONTROLS[ctl].family === 'Smooth' ? set(Math.round(parseNum(t) * 1000)) : set(Math.round(parseNum(t)));
      case 0xc1: return tight === 'G00' || tight === 'G0' ? set(-1) : length(t);
      case 0xc0: return tight === 'G00' || tight === 'G0' ? set(-1) : int(tight.replace(/^V+/, ''));
      case 0xca: if (!/^[01]{1,10}$/.test(tight)) throw new Error('Up to 10 digits of 0 and 1, e.g. 0000000011'); return set(parseInt(tight, 2));
      case 0x12a: {
        const next = lay.cells[index + 1];
        if (next && next[2] === 0x97) {           // END-line address, optionally with its value: "C1 90."
          const m = up.match(/^([A-Z][A-Z0-9]?)\s*([-+]?(?:\d+\.?\d*|\.\d+))?$/);
          if (!m) throw new Error('An address such as X, Z, C or C1, optionally with its value: C1 90.');
          set(m[1].charCodeAt(0));
          rec[cell[0] + 1] = m[1].length > 1 ? m[1].charCodeAt(1) : 0;
          if (m[2] !== undefined) enter(L, index + 1, m[2], opts);
          return;
        }
        if (t.length !== 1 || t < ' ' || t > '~') throw new Error('One character');
        return set(t.toUpperCase().charCodeAt(0));
      }
      case 0x97: {
        const a = lay.cells[index - 1], addr = a ? rec[a[0]] : 0;
        const v = inRange(Math.round(parseNum(t) / (addr >= 65 && addr <= 67 ? 0.0001 : len.scale)), 4);
        put32(rec, cell[0], v);
        return markEntered(rec, cell);
      }
      case 0xf1: {
        let v;
        if (tight === 'G01' || tight === 'G1') v = 0;
        else if (tight === 'G00' || tight === 'G0') v = 0x80;
        else { const x = parseNum(t); v = Math.round(x * 10); if (v < 1 || v > 99) throw new Error('G01, G00 or a feed multiplier 0.1 to 9.9'); }
        setCell(rec, cell, v);
        put32(rec, 4, mask(rec) | 0x400);
        return;
      }
    }
    const spec = formatSpec(ctl, fmt) || { kind: 'int' };
    if (spec.kind === 'text' || n > 4) {
      // keep the file's padding: some programs fill text fields with spaces, others with NULs
      const old = rec.subarray(cell[0], cell[0] + n), spaced = old[n - 1] === 0x20;
      const v = cleanText(t).slice(0, n);
      return setCell(rec, cell, spaced ? v.padEnd(n, ' ') : v);
    }
    if (spec.kind === 'enum') {
      for (const [k, v] of Object.entries(spec.values)) {
        const s = v.trim().toUpperCase();
        if (s && (s === up || s.replace(/\s+/g, '') === tight)) return set(spec.low ? (raw(rec, cell) & ~0xff) | +k : +k);
      }
      if (/^\d+$/.test(t)) return set(+t);
      const keys = choices(L, index);
      throw new Error(keys.length ? 'Choose one of: ' + keys.join(', ') : 'Not a value this field accepts');
    }
    if (spec.kind === 'num' && spec[units]) return set(Math.round(parseNum(t) / spec[units].scale));
    return int(t);
  }
  // point-machining tool line fields; the cycle words set byte 14
  function enterPoint(rec, cell, mode, t, units) {
    const tight = t.toUpperCase().replace(/\s+/g, ''), n = cell[1];
    // only fields that show a typed value carry an entered bit; menu words leave the mask alone
    const set = v => { setRaw(rec, cell, inRange(v, n)); if (POINT_CHECKS_ENTERED.has(mode)) markEntered(rec, cell); };
    const word = (list, what) => {
      const k = list.findIndex(w => w.replace(/\s+/g, '') === tight);
      if (k < 0) throw new Error(what + ': ' + list.join(', '));
      rec[14] = k;
    };
    switch (mode) {
      case 'len': case 'len4': case 'depth':
        return set(Math.round(parseNum(t) / (units === 'metric' ? 1e-4 : 1e-5)));
      case 'uint': { const m = tight.match(/^\d+$/); if (!m) throw new Error('Enter a whole number'); return set(+tight >>> 0 | 0); }
      case 'tapcycle': return word(TAP_CYCLES, 'Tapping cycle');
      case 'milldir': return word(MILL_DIRS, 'Direction');
      case 'spot': return word(SPOT, 'Spot drill use');
      case 'borecycle': {
        const m = tight.match(/^(?:CYCLE)?([1-9])$/);
        if (!m) throw new Error('Boring cycle CYCLE1 to CYCLE6');
        rec[14] = +m[1] - 1;
        return markEntered(rec, cell);
      }
      case 'reamfeed': {
        if (tight === 'G01' || tight === 'G1') return set(0);
        if (tight === 'G00' || tight === 'G0') return set(-0x80000000);
        const m = tight.match(/^F?(\d+)$/);
        if (!m) throw new Error('G01, G00, or the feed as F with a number');
        return set(+m[1]);
      }
      case 'ctr': {
        const k = CTR_ANGLES.findIndex(a => a.replace('°', '') === tight.replace(/°|DEG$/g, ''));
        if (k < 0) throw new Error('Tip angle 90, 118 or 60');
        return set(k);
      }
      case 'drl': {
        const k = DRILL_CYCLES.findIndex((a, i) => i && a.replace(/\s/g, '') === tight);
        if (k < 0) throw new Error('One of ' + DRILL_CYCLES.slice(1).join(', '));
        return set(k);
      }
      case 'tap': return tight === 'FIX' ? set(0) : set(Math.round(parseNum(t) * 100));
      case 'hex': { if (!/^[0-9A-F]{1,2}$/.test(tight)) throw new Error('A hexadecimal value'); return set(parseInt(tight, 16)); }
      case 'dec': { if (!/^\d+$/.test(tight)) throw new Error('Enter a whole number'); return set(+tight); }
    }
    throw new Error('Not used with this tool');
  }
  function setFlag(rec, cell, bits) {
    const f = FLAG_BITS[cell[2]];
    rec[cell[0]] = (rec[cell[0]] & ~f) | bits;
    markEntered(rec, cell);
  }
  function setTap(rec, cell, bytes) {
    for (let k = 0; k < 4; k++) rec[cell[0] + k] = bytes[k];
    markEntered(rec, cell);
  }

  // Clear a field: flags lose only their bits; other fields are zeroed and lose their entered bit,
  // together with the fields that share that bit (an address and its value, M/B and its code, ...).
  function clear(L, index) {
    const { rec, lay } = L, cell = lay.cells[index];
    const why = locked(L, index);
    if (why) throw new Error(why);
    if (pocketCell(L, index) === 'side') { rec[15] = 0; return; }
    const zero = c => {
      if (FLAG_BITS[c[2]] !== undefined) rec[c[0]] &= ~FLAG_BITS[c[2]];
      else rec.fill(0, c[0], c[0] + c[1]);
    };
    zero(cell);
    if (cell[2] === 0xf1) put32(rec, 4, mask(rec) & ~0x400);
    if (cell[2] === 0xf8 || cell[2] === 0xfa) { const v = lay.cells[index + 1]; if (v && !v[3]) zero(v); }
    if (cell[3]) {
      lay.cells.forEach((c, i) => { if (i !== index && c[3] === cell[3] && !HIDDEN_FMT.has(c[2])) zero(c); });
      put32(rec, 4, mask(rec) & ~cell[3]);
    }
  }

  // ---------------------------------------------------------------- new records
  function newRecord(c, no) {
    const r = new Uint8Array(REC);
    put16(r, 0, c); put16(r, 2, no || 0);
    return r;
  }
  const hexRec = h => { const r = new Uint8Array(REC); for (let i = 0; i < h.length / 2; i++) r[i] = parseInt(h.substr(i * 2, 2), 16); return r; };
  // Defaults as SLN writes them: MULTI MODE OFF / ATC MODE 0 on the mill common unit; END with
  // CONTI. 0, NUMBER 0, ATC 0, ANGLE 0, NEAR DIR., RETURN HOME. Lathe common unit: ATC-MODE 0.
  const COMMON_DEFAULT = { mill: '01000000c0000000000100', lathe: '0100000080000000', millturn: '01000000c0000000000100' };
  const END_DEFAULT = '040000001f02000002000000010000';

  function newHeader(ctl) {
    const C = CONTROLS[ctl], h = new Uint8Array(C.hdr);
    h[0x20] = C.fileKind; put32(h, 0x2C, 1); put32(h, 0x88, 1);
    return h;
  }
  function newProgram(ctl, name) {
    const C = CONTROLS[ctl];
    const p = { ctl, name: (name || 'NEW') + '.' + C.ext, header: newHeader(ctl), recs: [hexRec(COMMON_DEFAULT[C.type]), hexRec(END_DEFAULT)], warnings: [] };
    renumber(p);
    return p;
  }

  // Tool types SLN starts a new unit with (tool sequence record code comes from the layout).
  const UNIT_TOOLS = {
    0x20: [1, 2], 0x21: [1, 2, 15], 0x22: [1, 2, 10], 0x23: [1, 2, 3], 0x24: [1, 2, 'TAP'], 0x25: [1, 2, 10],
    0x26: [15], 0x27: [1, 2, 15, 'TAP'], 0x28: [1, 2, 11], 0x29: [1, 2, 11], 0x2a: [1, 2, 11, 11], 0x2b: [1, 2, 11, 11],
    0x40: [15], 0x41: [15], 0x42: [15], 0x43: [15], 0x44: [15], 0x50: [13], 0x51: [13], 0x52: [13], 0x53: [13],
    0x60: [14], 0x61: [15], 0x62: [15], 0x63: [15], 0x64: [15], 0x65: [15], 0x66: [15], 0x7f: [15],
    0x30: [33], 0x31: [33], 0x32: [33], 0x33: [33], 0x34: [35], 0x35: [34], 0x36: [36], 0x37: [37], 0x39: [33],
  };
  const TURN_PART = { 0x30: 1, 0x31: 1, 0x32: 1, 0x33: 5, 0x34: 1, 0x35: 1, 0x36: 5, 0x37: 5 };
  const unitBlock = (ctl, unitCode) => BLOCKS[ctl][BY_CODE[ctl][unitCode]];
  // First shape line of a new unit: point (0xc0), figure line (0xc2), text (0xc4) or the unit's own line type.
  function shapeCode(ctl, unitCode) {
    const bl = unitBlock(ctl, unitCode), s = bl && bl.shape;
    if (s === 193 || s === 194) return 0xc2;
    return s && s < 0x200 && BY_CODE[ctl][s] !== undefined ? s : 0;
  }
  // Records for a newly inserted unit: the unit, its tool sequences and one shape line.
  function newUnit(ctl, unitCode, opts) {
    const units = (opts && opts.units) || 'inch', bl = unitBlock(ctl, unitCode), out = [newRecord(unitCode, 0)];
    if (unitCode === 4) return [hexRec(END_DEFAULT)];
    if (unitCode === 1) return [hexRec(COMMON_DEFAULT[CONTROLS[ctl].type])];
    // turning units: PART OUT (FCE for facing, drilling and tapping), their tool on the matching edge
    const part = TURN_PART[unitCode];
    if (part && CONTROLS[ctl].type !== 'mill') out[0][20] = part;
    const toolRec = bl && bl.tool && BY_CODE[ctl][bl.tool] !== undefined ? bl.tool : 0;
    if (toolRec) for (const t of UNIT_TOOLS[unitCode] || [15]) {
      const r = newRecord(toolRec, 0);
      r[9] = t === 'TAP' ? (units === 'metric' ? 4 : 5) : t;
      if (part && toolRec === 0xb4) r[10] = part === 5 ? 3 : 1;          // EDGE or OUT
      out.push(r);
    }
    const s = shapeCode(ctl, unitCode);
    if (s) {
      const r = newRecord(s, 0);
      if (s === 0xc0) { r[8] = 1; put32(r, 4, 0x6); }                 // PT
      if (s === 0xc2) { r[8] = 0x20; r[12] = 1; put32(r, 4, 0x6); }    // start point LINE
      if (s === 0xa8) r[8] = 1;                                         // turning shape LIN
      out.push(r);
    }
    return out;
  }
  // A blank line of the same kind as `like` (a sequence record), for "insert line".
  function newLine(ctl, like) {
    const c = code(like), r = newRecord(c, 0);
    if (c === 0xc0) { r[8] = like[8] || 1; }
    if (c === 0xc2) { r[8] = 0x20; }
    if ((c >= 0xb0 && c <= 0xb5)) { r[9] = like[9]; r[10] = like[10]; }
    if (c === 0xa8) r[8] = 1;                                           // LIN
    return r;
  }

  // ---------------------------------------------------------------- conversion
  // Between the Matrix and Smooth version of the same machine type. The record layouts are the same
  // except for a few fields: spindle speed S and cutting speed C-SP keep 3 decimals on Smooth, and a few
  // Smooth-only fields are removed when going to Matrix.
  const SMOOTH_ONLY = [[1, 11, 1, 0, 'common unit DIS.', 'mill'], [0xf, 60, 4, 128, 'WPC SHIFT-A', 'mill'], [0xb1, 52, 4, 16, 'line milling WID-R', 'mill']];
  const SPEED_FMTS = new Set([0x68, 0x69, 0x6b]);
  function convertRecord(rec, from, to, warn, parent) {
    const q = rec.slice();
    if (from === to) return q;
    const A = CONTROLS[from], B = CONTROLS[to];
    const La = at(from, rec, parent || 0), Lb = at(to, rec, parent || 0);
    const scaleOf = (ctl, cell) => {
      if (cell[2] === 0x69) return CONTROLS[ctl].family === 'Smooth' ? 0.001 : 1;
      const f = formatSpec(ctl, cell[2]);
      return f && f.kind === 'num' && f.inch ? f.inch.scale : null;
    };
    if (La.lay && Lb.lay) {
      for (const ca of La.lay.cells) {
        if (ca[1] !== 4 || !SPEED_FMTS.has(ca[2])) continue;
        if (ca[3] && !(mask(q) & ca[3])) continue;
        const cb = Lb.lay.cells.find(c => c[0] === ca[0] && c[1] === 4 && SPEED_FMTS.has(c[2]));
        if (!cb) continue;
        const sa = scaleOf(from, ca), sb = scaleOf(to, cb);
        if (sa && sb && sa !== sb) put32(q, ca[0], Math.round(i32(q, ca[0]) * sa / sb));
      }
    }
    if (B.family === 'Matrix' && A.family === 'Smooth') {
      const c = La.sel.code;
      for (const [rc, o, n, bit, what, type] of SMOOTH_ONLY) {
        if (c !== rc || A.type !== type) continue;
        let any = false;
        for (let k = 0; k < n; k++) if (q[o + k]) any = true;
        if (any && warn) warn(what);
        q.fill(0, o, o + n);
        if (bit) put32(q, 4, mask(q) & ~bit);
      }
    }
    return q;
  }
  function convert(p, to) {
    const A = CONTROLS[p.ctl], B = CONTROLS[to];
    if (A.type !== B.type) throw new Error('A ' + A.label + ' program cannot be converted to a ' + B.label);
    const header = new Uint8Array(B.hdr);
    header.set(p.header.subarray(0, Math.min(A.hdr, B.hdr)));
    header[0x20] = B.fileKind;
    const dropped = new Set();
    const ls = lines(p);
    const recs = p.recs.map((r, i) => convertRecord(r, p.ctl, to, w => dropped.add(w), i ? ls[i - 1].sel.parent : 0));
    const warnings = [];
    if (dropped.size) warnings.push('Matrix has no ' + [...dropped].join(', ') + '; those values were removed.');
    const out = { ctl: to, name: p.name.replace(/\.[^.]*$/, '') + '.' + B.ext, header, recs, warnings };
    warnings.push(...limits(out));
    return out;
  }

  // Sequence-count limits of the control (MANL PRG lines per unit).
  function limits(p) {
    const C = CONTROLS[p.ctl], out = [];
    structure(p).forEach(u => {
      if (u.code === 6 && u.seqs.length > C.seqLimit) out.push('MANL PRG unit ' + number(p.recs[u.i]) + ' has ' + u.seqs.length + ' lines; a ' + C.label + ' allows ' + C.seqLimit + '.');
    });
    return out;
  }

  // ---------------------------------------------------------------- TPC
  // A unit's TPC record (codes 0xD0-0xFF after the unit's lines) holds its own values of machine parameters (D1 ...):
  // a 32-bit mask at 4 (bit k: field k applies on this machine) and 16-bit fields from byte 8 (field k at 8 + 2k).
  // Layouts found by changing every value on a control's TPC screen and reading the saved program (a
  // Smooth mill, 2026-10-01). Kinds: len2 / len3 lengths in 0.01 / 0.001 (inch), sec2 seconds in 0.01, int,
  // dec (a whole number shown with a point), bits (8 bits as 0/1).
  const TPC_LAYOUTS = {
    0xd4: { unit: 'TAPPING', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'],
      [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'], [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'],
      [28, 'D22', 'TAPPING CYCLE DWELL TIME(SEC)', 'sec2'], [38, 'D29', 'CHIP VACUUM TIME (SEC)', 'int'],
      [30, 'D30', 'NUMBER OF INCOMPLETE THREAD', 'int'], [32, 'D31', 'TAPPER ELONGATION ALLOWANCE', 'int'],
      [34, 'D32', 'TAP ROT. UNTIL SPINDLE STOPS', 'int'], [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'],
      [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'], [54, 'D43', 'INCOMPLETE THREAD NUM (PIPE)', 'int'],
      [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'],
      [36, 'D48', 'PLANET TAP CHAMF.OVERRIDE (%)', 'int'], [40, 'D49', 'PLANET RETRACT BOTTOM (PITCH)', 'dec1'],
      [60, 'D62', 'MAX NUM OF DRILL AUTO PECK.', 'int'], [24, 'D91', 'TOOL PATH PATTERN', 'bits'], [26, 'D92', 'TOOL PATH PATTERN', 'bits'],
    ] },
    // from N123 (a Matrix mill, 2026-10-01): each unit twice, once with every TPC value changed. Names where
    // the control's lists give them; the others show their number only.
    0xd0: { unit: 'DRILLING', fields: [
      [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'], [10, 'D3', 'CENTER DWELL AT HOLE BOTTOM', 'int'],
      [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'], [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'],
      [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'],
      [24, 'D91', 'TOOL PATH PATTERN', 'bits'], [42, 'D45', 'DRILL DECREMENTAL DEP. OF CUT', 'len3'], [44, 'D46', 'DRILL MINIMUM DEPTH OF CUT', 'len3'],
      [28, 'D52', '', 'int'], [30, 'D53', '', 'int'], [32, 'F12', '', 'len5'], [36, 'D55', '', 'len4'],
      [16, 'D54', '', 'int'], [18, 'D58', '', 'int'], [26, 'D59', '', 'int'],
    ] },
    0xd6: { unit: 'CIRC MIL', fields: [
      [12, 'D16', 'CHAMFER DWELL AT HOLE BOTTOM', 'int'], [14, 'D17', 'CHAMFER INTERF. CLEARANCE', 'len2'], [16, 'D19', '', 'int'],
      [18, 'D23', '', 'len1'], [20, 'D41', 'POINT MACH-ING R POINT HEIGHT', 'len1'], [22, 'D42', 'POINT MACHINING 3RD R PT HGT', 'len2'],
      [24, 'D91', 'TOOL PATH PATTERN', 'bits'], [26, 'D92', 'TOOL PATH PATTERN', 'bits'], [8, 'D1', 'POINT MACHINING 2ND R PT HGT', 'len2'],
    ] },
    0xde: { unit: 'LINE LFT', fields: [
      [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'], [18, 'E17', '', 'int'],
      [24, 'E22', '', 'int'], [28, 'E23', '', 'int'], [60, 'E30', '', 'len2'], [32, 'E24', '', 'int'], [36, 'E25', '', 'int'],
      [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [58, 'E104', '', 'bits'],
    ] },
    0xe2: { unit: 'CHMF LFT', fields: [
      [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'], [42, 'E8', '', 'len2'], [16, 'E9', '', 'len2'], [44, 'E11', '', 'len2'],
      [18, 'E17', '', 'int'], [40, 'E95', 'TOOL PATH PATTERN', 'bits'], [60, 'E30', '', 'len2'],
    ] },
    0xe5: { unit: 'FCE MILL', fields: [
      [16, 'E9', '', 'len2'], [40, 'E12', '', 'len2'], [44, 'E15', '', 'int'], [58, 'E104', '', 'bits'],
    ] },
    0xe8: { unit: 'POCKET', fields: [
      [8, 'E1', 'CLOSE PATTERN APPROACH/ESCAPE', 'len2'], [10, 'E2', 'APPROACH/ESCAPE CLEARANCE', 'len2'],
      [12, 'E5', 'APPROACH/ESCAPE 2ND CLEARANCE', 'len2'], [14, 'E7', '', 'len2'], [16, 'E9', '', 'len2'], [18, 'E17', '', 'int'],
      [42, 'E92', 'TOOL PATH PATTERN', 'bits'], [88, 'E99', '', 'bits'], [40, 'E18', '', 'int'], [92, 'E21', '', 'len2'],
      [24, 'E22', '', 'int'], [28, 'E23', '', 'int'], [32, 'E24', '', 'int'], [36, 'E25', '', 'int'], [20, 'E31', '', 'int'],
      [58, 'E104', '', 'bits'], [60, 'E32', '', 'int'], [64, 'E33', '', 'int'], [68, 'E34', '', 'int'], [72, 'E35', '', 'int'],
      [76, 'E36', '', 'int'], [80, 'E20', '', 'int'], [84, 'E37', '', 'len4'],
    ] },
  };
  // Short names and bit meanings of the user parameters a TPC holds, summarised in our own words from the machine's
  // parameter list (Smooth G / Matrix user parameters D = point machining, E = line/face, F = common).
  const TPC_NAMES = {
    D1: '2nd R-point height', D3: 'Dwell at hole bottom, spot (rev)', D16: 'Dwell at hole bottom, chamfer (rev)',
    D17: 'Chamfer cutter interference clearance', D19: 'Dwell at hole bottom, end mill (rev)', D22: 'Tapping dwell time (s)',
    D23: 'Pre-hole clearance, end milling', D29: 'Chip removal time (s)', D30: 'Incomplete threads (tapping)',
    D31: 'Tap holder elongation', D32: 'Spindle revs before reversing (tapping)', D41: 'R-point height',
    D42: '3rd R-point height', D43: 'Incomplete threads (pipe tap)', D45: 'Peck decrement (drilling)',
    D46: 'Minimum peck depth (drilling)', D48: 'Feed override on chamfer, planetary tap (%)', D49: 'Return at bottom, planetary tap (pitch)',
    D52: 'Rapid relief reduction, very deep drilling (%)', D53: 'Pecks before full return, very deep drilling',
    D54: 'Feed reduction at start, very deep drilling (%)', D55: 'Return distance, very deep drilling',
    D58: 'Slow-start distance, very deep drilling (%)', D59: 'Speed reduction at hole end, very deep drilling (%)',
    D62: 'Maximum automatic pecks', F12: 'Peck return, high-speed deep hole',
    D91: 'Point machining options (tapping, R-points)', D92: 'Point machining options 2',
    E1: 'Start/escape point, closed shape', E2: 'Start/escape clearance, 1st (X-Y)', E5: 'Start/escape clearance, 2nd (X-Y)',
    E7: 'Axial start allowance, 2nd clearance', E8: 'Chamfer cutter radial clearance', E9: 'Axial start allowance, 1st clearance',
    E11: 'Chamfer cutter axial clearance', E12: 'Face mill radial clearance', E15: 'Face mill path (reciprocating short)',
    E17: 'Axial feed override (%)', E18: 'Full-width cut override, pocket (%)', E20: 'Axial feed override, Z pecking (%)',
    E21: 'Wall overlap, closed shape', E22: 'Corner override (%)', E23: 'Corner override: max removal', E24: 'Corner override: min removal',
    E25: 'Corner override: max angle', E30: 'Start/escape for CLOSED ends, open line', E31: 'OPEN wall overhang, pocket',
    E32: 'Helical approach radius', E33: 'Helical approach gradient', E34: 'Tapered approach distance', E35: 'Tapered approach gradient',
    E36: 'Tapered escape distance', E37: 'Z peck return, face machining', E92: 'Tool path pattern, pocket', E95: 'Tool path pattern, line',
    E99: 'Line/face options', E104: 'Line/face options 2',
  };
  const TPC_BITS = {           // index = bit (0 = rightmost); what a 1 does
    D91: ['M04 after the dwell at the bottom (tapping)', 'Dwell after M04 at the bottom (tapping)', 'Dwell after returning to the R-point (tapping)',
      'Drill pre-machining in a centre-drill cycle: R-point at D1', 'Shorten the finishing path, true-circle end milling',
      'Shorten the path, true-circle chamfering', 'Pre-machining in the unit: drill R-point at D1 / D42',
      'Chamfer cycle 2 / smooth chamfering: R-point at D42 (0: TC39)'],
    D92: ['Use E17 for the axial feed, true-circle end milling', 'Back spot facer R1-point at D1', 'Reamer R-point at D1 after chamfer pre-machining',
      'Tap R-point at D1 after chamfer pre-machining', 'Check interference at the D17 clearance', 'Dwell time for synchronous tapping valid',
      'Clear chips before threading, planetary tapping', 'Alarm 650 when chamfering cuts air'],
    E92: ['Outside to inside (0: inside to outside)', '', 'R-point at E7 / E9 by pre-machining (0: always E9)',
      'X-Y clearance E5 / E2 by pre-machining (0: always E2)', 'Rapid down to the surface + E9', '', '', ''],
    E95: ['', 'Stop if the approach path collides', '2nd and later cuts go via the approach point', '2nd and later cuts stay down (0: escape to Z initial)',
      'Rapid down to the surface + E9', 'Escape where the tool leaves the allowance', 'R-point at E7 / E9 by pre-machining (0: always E9)',
      'X-Y clearance E5 / E2 by pre-machining, outside/inside (0: always E2)'],
    E99: ['Feed range for shape sequences', 'Pocket: finish bottom and wall together', '', 'Face: check the approach-to-start move',
      'Line: alarm 705 when the last shape move is zero', '', 'Line: start near the automatic approach point', ''],
    E104: ['Cutting method after an automatic approach point', 'Return position, face machining', 'Return position, line machining',
      'Infeed position at a CLOSED wall, line machining', 'Joining shapes, line machining', 'Joining shapes, face wall finishing',
      'ZC feed rate calculation', 'Tool change command output'],
  };
  const TPC_SCALE = { len1: 0.1, len2: 0.01, len3: 0.001, len4: 0.0001, len5: 0.00001, sec2: 0.01, int: 1, dec: 1, dec1: 0.1, bits: 1 };
  // a TPC record's fields: {off, d, name, kind, raw, text, applies}; fields of an unknown layout come as raw words
  function tpcFields(rec) {
    const lay = TPC_LAYOUTS[rec[0]], mask = u32(rec, 4), out = [];
    if (!lay) {
      for (let k = 0; 8 + 2 * k < REC; k++) if (mask & (1 << k) || u16(rec, 8 + 2 * k)) out.push({ off: 8 + 2 * k, d: '', name: 'field ' + (k + 1), kind: 'raw', raw: u16(rec, 8 + 2 * k), text: String(u16(rec, 8 + 2 * k)), applies: !!(mask & (1 << k)) });
      return { known: false, fields: out };
    }
    for (const [off, d, name, kind] of lay.fields) {
      const raw = u16(rec, off), k = (off - 8) / 2;
      out.push({ off, d, name: TPC_NAMES[d] || name, kind, raw, text: tpcText(raw, kind), applies: true, bits: TPC_BITS[d] || null });
    }
    return { known: true, unit: lay.unit, fields: out };
  }
  function tpcText(raw, kind) {
    if (kind === 'bits') return raw.toString(2).padStart(8, '0');
    if (kind === 'dec') return raw + '.';
    if (kind === 'dec1') return raw % 10 ? (raw / 10).toFixed(1) : raw / 10 + '.';
    const sc = TPC_SCALE[kind] || 1;
    return sc === 1 ? String(raw) : fixed(raw * sc, { len1: 1, len3: 3, len4: 4, len5: 5 }[kind] || 2);
  }
  // set one field from what was typed; throws with a message when it does not fit
  function tpcSet(rec, off, kind, text) {
    const t = String(text).trim();
    let v;
    if (kind === 'bits') { if (!/^[01]{1,8}$/.test(t)) throw new Error('Type up to 8 bits as 0 and 1, e.g. 11111001'); v = parseInt(t, 2); }
    else {
      const n = parseFloat(t.replace(/\.$/, ''));
      if (!/^[-+]?\d*\.?\d*$/.test(t) || isNaN(n)) throw new Error('Type a number');
      v = Math.round(n / (TPC_SCALE[kind] || 1));
    }
    if (v < 0 || v > 0xffff) throw new Error('Out of range');
    rec[off] = v & 0xff; rec[off + 1] = v >> 8;
  }

  const api = {
    REC, CONTROLS, TOOL_NAMES, PRINT_TOOL_NAMES, SUFFIX, useSchema, detect, parse, serialize, isRaw, extOf, comment, setComment,
    counterpart, controlForExt, selection, at, lines, blockLayout, structure, formatSpec, prompt, renumber, code, number, mask,
    raw, entered, notApplicable, cellText, valueText, cxMode, cxText, shownCells, cellLabel, locked, choices, enter, clear, setCell, parseTap, toolCode,
    unitName, printLine, lineText, newRecord, newProgram, newUnit, newLine, shapeCode, convert, convertRecord, limits,
    fixed, tapSize, attribute,
    isToolFile, toolFileKind, parseToolFile, serializeToolFile, setToolType, toolLines, toolType, isMachineMemory, parseMachineMemory,
    suffixText, programTools, machineTools, checkTool, toolFileEntries, findToolFile, TPC_LAYOUTS, TPC_NAMES, TPC_BITS, tpcFields, tpcText, tpcSet, diffPrograms, parseIndexTbl, searchProgram,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Maz = api;
})(root);

root.Maz.useSchema({"prompts":["","WorkPiece Material","Initial Point Z (Clearance)","Zero Return <Z.X+Y:0 , X+Y+Z:1>","Multiple WorkPiece Machining Mode","Multi Workpieces <Y:1, N:0>","Distance between WorkPieces X","Distance between WorkPieces Y","WPC Number","WPC No. <menu>","WorkPiece Coordinate, WPC-X","WorkPiece Coordinate, WPC-Y","Angle between Machine Coordinate and WorkPiece Coordinate","WorkPiece Coordinate, WPC-Z","WorkPiece Coordinate, WPC-4","Offset Distance on X Axis","Offset Distance on Y Axis","Angle between Workpiece and Auxiliary Coordinates","Offset Distance on Z Axis","Continue <Y:1, N:0>","Repeat Program how many times","Z Shift Amount of Program Origin","Parts count (Count number of Machined WorkPieces)? <Yes=1,No=0>","ATC Movement at End of Machining <N:0, Y:1,2>","Table angle at end of cycle","Table index direction <Menu>","Return Position <Menu>","Return Pos. Low Turret <Menu>","Next WorkPiece No.","Execute next program <Menu>","Sub Program Workpiece Number","Unit Skip (0-9) / Multi Workpiece Machining (A-D)","Number of Repetitions","Machining Priority No.","Machining Plane <menu>","Which type of tool <menu>","Machining part of tool <menu>","Nominal diameter of tool","Tool ID code","M code","Measure (Execute MMS) <Yes=0,No=1>","Pallet No.","Next Pallet No.","X coordinate of table rotation position","Y coordinate of table rotation position","Z coordinate of table rotation position","B,C-axis Index position W","Indexing Angle","Slant Degree B","C-Axis position","Hole Diameter","Hole Depth","Chamfer Width","CounterBore Diameter","CounterBore Depth","Bottom face roughness code","Chip Vac. Cleaner <Yes=1,No=0>","Actual Diameter of Tap","Thread Pitch","Tapping Depth","Wall Roughness Code","Prepared hole diameter","Type <0:Milling, 1:Tornado, 2:High Accuracy>","Pitch (CHAMFER)","Pitch (HOLE)","Dist: WPC Z0 to finish surface","Z axis stock removal","X/Y axis stock removal","Finish allowance Z (Axial)","Finish allowance R (Radial)","Start point attribute <menu>","End point attribute <menu>","Radius of cylindrical plane","Radial Interference Distance","Z-axis Interference Distance","Slot Width","FIG PATTERN<LINE:0,ARBITRY:1>","Point Cutting Pattern <MENU>","Z Coordinate of Machining Surface","Number of holes to be drilled lastly","Omit SPT Machining <Y:1, N:0>","Return Position <Initial-point=0, R-point=1>","Pattern of Figure <MENU>","Corner 3 coordinate Y (Y diagonal end point)","X Coordinate for End point","Y Coordinate for End point","Finishing FeedRate for Surface Roughness","Feedrate","Feedrate (/Rev) <G00 -> menu>","Multi Offset X","Multi Offset Y","Multi Offset theta","Multi Offset Z","G code (preparatory function)","Data Address","Rotational Speed","M code or B code(2nd auxilary function)","Measuring Pattern","Measuring starting point X (based on Workpiece 0)","Measuring starting point Y (based on Workpiece 0)","Feeler depth point to make measurement","Distance of Workpiece zero at (axis) surface","Inside diameter measurement value","Skip Feed Distance (Distance to move at skip-speed)","Cutting Speed (/min)","Approach Point 1, Auto-><MENU>","Approach Point 2, Auto-><MENU>","Cutting Direction","G-code<Menu>/Multiplier","Cutting Depth (per step)","Radial Cutting Depth per pass","Type of Approach <menu>","Pecking Depth","Address","Max. Outer Dia. of Workpiece","Min. Inner Dia. of Workpiece","Workpiece Length","Stock removal of work face","Max. Spindle RPM limit(min-1)","Section to be Machined","Transfer Pattern","Set-Up No. (Transfer Pos.)","Transfer direction: Head number to transfer to","Spdl. mode in transfer","Transfer/Push Workpiece <0:Yes, 1:No>","Chuck left open <0:Open, 1:Close>","CHUCKING POSITION 1 <TEACH>","CHUCKING POSITION 2 <TEACH>","Z-OFFSET","CHUCKING-C OF HEAD 1","CHUCKING-C OF HEAD 2","C-OFFSET","Escape Position Z","TNo. of Turret Escape Pos.","Type of operation <Menu>","The other Spdl Stop<1>,SYN<0>","X Infeed Point","Z Infeed Point","Finish Allowance-X","Finish Allowance-Z","X Removal Allowance","Cutting Pattern","Chamfer Angle <0:No Chamfer, 1:45 degrees, 2:60 degrees>","Thread Lead","Angle of thread","Number of Entrance Threads (how many thread starts)","Thread Height","Number of Grooves","Grooving Pitch (Spacing Amount of Multiple Grooves)","Width of Groove","Decremental depth of cut (Infeed Decrement)","Length of Cut","Number of cut passes","Minimum Depth of Cut","Depth of first cut","Turning Spindle RPM","Turning Spndl Rotation <Menu>","Compensate data","Shape Pattern","Chamfering(C) vs Rounding(R) at Start point","Starting point-X","Starting point-Z","Final point-X","Final point-Z","Chamfering(C) vs Rounding(R) at End point","Radius of Arc or Taper Angle","Intersect pos of Start point","Intersect pos of Final point","Taper Angle","Shift distance for X","Shift distance for Y","Shift distance for Z","Shift angle","Coordinate, theta","Mirror Image X Axis <Y:1, N:0>","Radius of Arc","Z-CUT LGTH Decrease/Pass","Enter Comment <menu>","Text","Text Height","Text Depth","Starting point X","Starting point Y","Angle from X axis","Text pitch (extra space)","Text pos. CTR:0, TOP:1, BTM:2","Measuring Point No.","Mes.Ref.Point Start<0>,FIN<1>","Type of approach","Start Point <R vs X>","Start Point <A vs Y>","Angle from Z axis","Starting point R","Angle Start Point","Number of holes","Angle to next hole","SHIFT: WPC Z0 TO HOLE","Corner 3 coordinate C","Feedrate (/Rev)","C axis direction vector","Finish Allowance","Select Turret","Return to Tool-Change Position <MENU>","Low Turret Escape Pos.","Machining Method","Measured direction <menu>","Head Angle & Approach/Escape","Lower Turret Safety Diameter","Complex Program Y<1>, N<0> (if second spindle)","Finish Workpiece Length","Plane shift R (Radial shift value from Origin to Oblique plane)","Plane shift Z (Z shift value from Origin to Oblique plane)","Final point-C","B,C-axis Index position X","B,C-axis Index position Y","B,C-axis Index position Z","Up Turret Escape Pos.","Tool return to tool-change position <1:Yes, 0:No>"],"controls":{"MatrixM":{"kind":17,"blocks":{"0":0,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"10":9,"11":10,"12":11,"13":12,"14":13,"15":14,"16":15,"17":16,"18":17,"19":18,"20":19,"21":20,"22":21,"23":22,"24":23,"25":24,"26":25,"27":26,"28":27,"29":28,"30":29,"31":30,"32":31,"33":32,"34":33,"35":34,"36":35,"37":36,"38":37,"39":38,"40":39,"41":40,"42":41,"43":42,"44":43,"45":44,"46":45,"47":46,"48":47,"49":48,"50":49,"51":50,"52":51,"53":52,"55":53,"56":54,"57":55,"58":56,"59":57,"60":58,"61":59,"62":60,"63":61,"64":62,"68":63,"69":64,"70":65,"71":66,"72":67,"73":68,"74":69,"75":70,"76":71,"77":72,"78":73,"79":74,"80":75,"81":76,"82":77,"83":78,"84":79,"85":80,"86":81,"87":82,"88":83,"89":84,"90":85,"91":86,"92":87,"93":88,"94":89,"95":90,"96":91,"97":92,"98":93,"99":94,"100":95,"101":96,"102":97,"103":98,"104":99,"105":100,"106":101,"107":102,"108":103,"109":104},"formats":{"288":{"kind":"num","inch":{"prefix":"","scale":1e-05,"dec":4},"metric":{"prefix":"","scale":0.0001,"dec":3}},"51":{"kind":"enum","values":{"0":"CW","1":"CCW","2":"***","3":"***","4":"***","5":"***","6":"***","7":"***","8":"***","9":"***","10":"***","11":"***","12":"***","13":"***","14":"***","15":"***","16":"***","17":"***","18":"***","19":"***","20":"***","21":"***","22":"***","23":"***","24":"***","25":"***","26":"***","27":"***","28":"***","29":"***","30":"***","31":"***","32":"***","33":"***","34":"***","35":"***","36":"***","37":"***","38":"***","39":"***","40":"***","41":"***","42":"***","43":"***","44":"***","45":"***","46":"***","47":"***","48":"***","49":"***","50":"***","51":"***","52":"***","53":"***","54":"***","55":"***","56":"***","57":"***","58":"***","59":"***","60":"***","61":"***","62":"***","63":"***","64":"***","65":"***","66":"***","67":"***","68":"***","69":"***","70":"***","71":"***","72":"***","73":"***","74":"***","75":"***","76":"***","77":"***","78":"***","79":"***","80":"***","81":"***","82":"***","83":"***","84":"***","85":"***","86":"***","87":"***","88":"***","89":"***","90":"***","91":"***","92":"***","93":"***","94":"***","95":"***","96":"***","97":"***","98":"***","99":"***","100":"***","101":"***","102":"***","103":"***","104":"***","105":"***","106":"***","107":"***","108":"***","109":"***","110":"***","111":"***","112":"***","113":"***","114":"***","115":"***","116":"***","117":"***","118":"***","119":"***","120":"***","121":"***","122":"***","123":"***","124":"***","125":"***","126":"***","127":"***","128":"***","129":"***","130":"***","131":"***","132":"***","133":"***","134":"***","135":"***","136":"***","137":"***","138":"***","139":"***","140":"***","141":"***","142":"***","143":"***","144":"***","145":"***","146":"***","147":"***","148":"***","149":"***","150":"***","151":"***","152":"***","153":"***","154":"***","155":"***","156":"***","157":"***","158":"***","159":"***","160":"***","161":"***","162":"***","163":"***","164":"***","165":"***","166":"***","167":"***","168":"***","169":"***","170":"***","171":"***","172":"***","173":"***","174":"***","175":"***","176":"***","177":"***","178":"***","179":"***","180":"***","181":"***","182":"***","183":"***","184":"***","185":"***","186":"***","187":"***","188":"***","189":"***","190":"***","191":"***","192":"***","193":"***","194":"***","195":"***","196":"***","197":"***","198":"***","199":"***","200":"***","201":"***","202":"***","203":"***","204":"***","205":"***","206":"***","207":"***","208":"***","209":"***","210":"***","211":"***","212":"***","213":"***","214":"***","215":"***","216":"***","217":"***","218":"***","219":"***","220":"***","221":"***","222":"***","223":"***","224":"***","225":"***","226":"***","227":"***","228":"***","229":"***","230":"***","231":"***","232":"***","233":"***","234":"***","235":"***","236":"***","237":"***","238":"***","239":"***","240":"***","241":"***","242":"***","243":"***","244":"***","245":"***","246":"***","247":"***","248":"***","249":"***","250":"***","251":"***","252":"***","253":"***","254":"***","255":"***"},"unknown":"blank"},"77":{"kind":"enum","values":{"0":"***Z","1":"***X","2":"***0","3":"***0","4":"***0","5":"***0","6":"***0","7":"***0","8":"***0","9":"***0","10":"***0","11":"***0","12":"***0","13":"***0","14":"***0","15":"***0","16":"***0","17":"***0","18":"***0","19":"***0","20":"***0","21":"***0","22":"***0","23":"***0","24":"***0","25":"***0","26":"***0","27":"***0","28":"***0","29":"***0","30":"***0","31":"***0","32":"***0","33":"***0","34":"***0","35":"***0","36":"***0","37":"***0","38":"***0","39":"***0","40":"***0","41":"***0","42":"***0","43":"***0","44":"***0","45":"***0","46":"***0","47":"***0","48":"***0","49":"***0","50":"***0","51":"***0","52":"***0","53":"***0","54":"***0","55":"***0","56":"***0","57":"***0","58":"***0","59":"***0","60":"***0","61":"***0","62":"***0","63":"***0","64":"***0","65":"***0","66":"***0","67":"***0","68":"***0","69":"***0","70":"***0","71":"***0","72":"***0","73":"***0","74":"***0","75":"***0","76":"***0","77":"***0","78":"***0","79":"***0","80":"***0","81":"***0","82":"***0","83":"***0","84":"***0","85":"***0","86":"***0","87":"***0","88":"***0","89":"***0","90":"***0","91":"***0","92":"***0","93":"***0","94":"***0","95":"***0","96":"***0","97":"***0","98":"***0","99":"***0","100":"***0","101":"***0","102":"***0","103":"***0","104":"***0","105":"***0","106":"***0","107":"***0","108":"***0","109":"***0","110":"***0","111":"***0","112":"***0","113":"***0","114":"***0","115":"***0","116":"***0","117":"***0","118":"***0","119":"***0","120":"***0","121":"***0","122":"***0","123":"***0","124":"***0","125":"***0","126":"***0","127":"***0","128":"***0","129":"***0","130":"***0","131":"***0","132":"***0","133":"***0","134":"***0","135":"***0","136":"***0","137":"***0","138":"***0","139":"***0","140":"***0","141":"***0","142":"***0","143":"***0","144":"***0","145":"***0","146":"***0","147":"***0","148":"***0","149":"***0","150":"***0","151":"***0","152":"***0","153":"***0","154":"***0","155":"***0","156":"***0","157":"***0","158":"***0","159":"***0","160":"***0","161":"***0","162":"***0","163":"***0","164":"***0","165":"***0","166":"***0","167":"***0","168":"***0","169":"***0","170":"***0","171":"***0","172":"***0","173":"***0","174":"***0","175":"***0","176":"***0","177":"***0","178":"***0","179":"***0","180":"***0","181":"***0","182":"***0","183":"***0","184":"***0","185":"***0","186":"***0","187":"***0","188":"***0","189":"***0","190":"***0","191":"***0","192":"***0","193":"***0","194":"***0","195":"***0","196":"***0","197":"***0","198":"***0","199":"***0","200":"***0","201":"***0","202":"***0","203":"***0","204":"***0","205":"***0","206":"***0","207":"***0","208":"***0","209":"***0","210":"***0","211":"***0","212":"***0","213":"***0","214":"***0","215":"***0","216":"***0","217":"***0","218":"***0","219":"***0","220":"***0","221":"***0","222":"***0","223":"***0","224":"***0","225":"***0","226":"***0","227":"***0","228":"***0","229":"***0","230":"***0","231":"***0","232":"***0","233":"***0","234":"***0","235":"***0","236":"***0","237":"***0","238":"***0","239":"***0","240":"***0","241":"***0","242":"***0","243":"***0","244":"***0","245":"***0","246":"***0","247":"***0","248":"***0","249":"***0","250":"***0","251":"***0","252":"***0","253":"***0","254":"***0","255":"***0"},"unknown":"blank"}},"attr":{"2":[[11,0,255]],"7":[[17,0,255]],"65":[[11,0,255]],"66":[[11,0,255]],"67":[[11,0,255]],"68":[[11,0,255]],"80":[[11,0,255]],"81":[[11,0,255]],"82":[[11,0,255]],"83":[[11,0,255]],"99":[[11,0,255]],"161":[[18,8,255],[19,0,255]],"165":[[19,8,255],[20,0,255]],"168":[[9,8,255],[10,0,255]],"169":[[9,8,255],[10,0,255]],"170":[[9,8,255],[10,0,255]],"172":[[9,8,255],[10,0,255]],"177":[[13,0,255]],"178":[[13,0,255]],"179":[[13,0,255]],"193":[[9,8,255],[10,0,255]],"194":[[9,8,255],[10,0,255]],"196":[[9,8,255],[10,0,255]],"449":[[9,8,255],[10,0,255]],"450":[[9,8,255],[10,0,255]],"451":[[9,8,255],[10,0,255]],"453":[[9,8,255],[10,0,255]],"454":[[9,8,255],[10,0,255]],"455":[[9,8,255],[10,0,255]]}},"SmoothM":{"kind":22,"blocks":{"0":0,"1":105,"2":2,"3":3,"4":106,"5":5,"6":6,"7":7,"8":8,"10":9,"11":10,"12":11,"13":12,"14":13,"15":14,"16":15,"17":16,"18":17,"19":18,"20":19,"21":20,"22":21,"23":22,"24":23,"25":24,"26":25,"27":26,"28":27,"29":28,"30":29,"31":30,"32":31,"33":32,"34":33,"35":34,"36":35,"37":36,"38":37,"39":38,"40":39,"41":40,"42":41,"43":42,"44":43,"45":107,"46":45,"47":46,"48":108,"49":109,"50":49,"51":110,"52":51,"53":52,"55":111,"56":54,"57":55,"58":56,"59":57,"60":58,"61":59,"62":60,"63":61,"64":62,"68":112,"69":113,"70":65,"71":66,"72":67,"73":68,"74":69,"75":114,"76":71,"77":115,"78":73,"79":74,"80":75,"81":76,"82":77,"83":116,"84":79,"85":80,"86":81,"87":82,"88":83,"89":84,"90":85,"91":86,"92":87,"93":88,"94":89,"95":90,"96":91,"97":92,"98":93,"99":94,"100":95,"101":96,"102":117,"103":98,"104":99,"105":100,"106":101,"107":102,"108":103,"109":104},"formats":{"288":{"kind":"num","inch":{"prefix":"","scale":1e-05,"dec":4},"metric":{"prefix":"","scale":0.0001,"dec":3}},"253":{"kind":"enum","values":{"0":"CW","1":"CCW","2":"AUTO"},"unknown":"hex"},"105":{"kind":"ctx"},"51":{"kind":"enum","values":{"0":"CW","1":"CCW","2":"***","3":"***","4":"***","5":"***","6":"***","7":"***","8":"***","9":"***","10":"***","11":"***","12":"***","13":"***","14":"***","15":"***","16":"***","17":"***","18":"***","19":"***","20":"***","21":"***","22":"***","23":"***","24":"***","25":"***","26":"***","27":"***","28":"***","29":"***","30":"***","31":"***","32":"***","33":"***","34":"***","35":"***","36":"***","37":"***","38":"***","39":"***","40":"***","41":"***","42":"***","43":"***","44":"***","45":"***","46":"***","47":"***","48":"***","49":"***","50":"***","51":"***","52":"***","53":"***","54":"***","55":"***","56":"***","57":"***","58":"***","59":"***","60":"***","61":"***","62":"***","63":"***","64":"***","65":"***","66":"***","67":"***","68":"***","69":"***","70":"***","71":"***","72":"***","73":"***","74":"***","75":"***","76":"***","77":"***","78":"***","79":"***","80":"***","81":"***","82":"***","83":"***","84":"***","85":"***","86":"***","87":"***","88":"***","89":"***","90":"***","91":"***","92":"***","93":"***","94":"***","95":"***","96":"***","97":"***","98":"***","99":"***","100":"***","101":"***","102":"***","103":"***","104":"***","105":"***","106":"***","107":"***","108":"***","109":"***","110":"***","111":"***","112":"***","113":"***","114":"***","115":"***","116":"***","117":"***","118":"***","119":"***","120":"***","121":"***","122":"***","123":"***","124":"***","125":"***","126":"***","127":"***","128":"***","129":"***","130":"***","131":"***","132":"***","133":"***","134":"***","135":"***","136":"***","137":"***","138":"***","139":"***","140":"***","141":"***","142":"***","143":"***","144":"***","145":"***","146":"***","147":"***","148":"***","149":"***","150":"***","151":"***","152":"***","153":"***","154":"***","155":"***","156":"***","157":"***","158":"***","159":"***","160":"***","161":"***","162":"***","163":"***","164":"***","165":"***","166":"***","167":"***","168":"***","169":"***","170":"***","171":"***","172":"***","173":"***","174":"***","175":"***","176":"***","177":"***","178":"***","179":"***","180":"***","181":"***","182":"***","183":"***","184":"***","185":"***","186":"***","187":"***","188":"***","189":"***","190":"***","191":"***","192":"***","193":"***","194":"***","195":"***","196":"***","197":"***","198":"***","199":"***","200":"***","201":"***","202":"***","203":"***","204":"***","205":"***","206":"***","207":"***","208":"***","209":"***","210":"***","211":"***","212":"***","213":"***","214":"***","215":"***","216":"***","217":"***","218":"***","219":"***","220":"***","221":"***","222":"***","223":"***","224":"***","225":"***","226":"***","227":"***","228":"***","229":"***","230":"***","231":"***","232":"***","233":"***","234":"***","235":"***","236":"***","237":"***","238":"***","239":"***","240":"***","241":"***","242":"***","243":"***","244":"***","245":"***","246":"***","247":"***","248":"***","249":"***","250":"***","251":"***","252":"***","253":"***","254":"***","255":"***"},"unknown":"blank"},"77":{"kind":"enum","values":{"0":"***Z","1":"***X","2":"***0","3":"***0","4":"***0","5":"***0","6":"***0","7":"***0","8":"***0","9":"***0","10":"***0","11":"***0","12":"***0","13":"***0","14":"***0","15":"***0","16":"***0","17":"***0","18":"***0","19":"***0","20":"***0","21":"***0","22":"***0","23":"***0","24":"***0","25":"***0","26":"***0","27":"***0","28":"***0","29":"***0","30":"***0","31":"***0","32":"***0","33":"***0","34":"***0","35":"***0","36":"***0","37":"***0","38":"***0","39":"***0","40":"***0","41":"***0","42":"***0","43":"***0","44":"***0","45":"***0","46":"***0","47":"***0","48":"***0","49":"***0","50":"***0","51":"***0","52":"***0","53":"***0","54":"***0","55":"***0","56":"***0","57":"***0","58":"***0","59":"***0","60":"***0","61":"***0","62":"***0","63":"***0","64":"***0","65":"***0","66":"***0","67":"***0","68":"***0","69":"***0","70":"***0","71":"***0","72":"***0","73":"***0","74":"***0","75":"***0","76":"***0","77":"***0","78":"***0","79":"***0","80":"***0","81":"***0","82":"***0","83":"***0","84":"***0","85":"***0","86":"***0","87":"***0","88":"***0","89":"***0","90":"***0","91":"***0","92":"***0","93":"***0","94":"***0","95":"***0","96":"***0","97":"***0","98":"***0","99":"***0","100":"***0","101":"***0","102":"***0","103":"***0","104":"***0","105":"***0","106":"***0","107":"***0","108":"***0","109":"***0","110":"***0","111":"***0","112":"***0","113":"***0","114":"***0","115":"***0","116":"***0","117":"***0","118":"***0","119":"***0","120":"***0","121":"***0","122":"***0","123":"***0","124":"***0","125":"***0","126":"***0","127":"***0","128":"***0","129":"***0","130":"***0","131":"***0","132":"***0","133":"***0","134":"***0","135":"***0","136":"***0","137":"***0","138":"***0","139":"***0","140":"***0","141":"***0","142":"***0","143":"***0","144":"***0","145":"***0","146":"***0","147":"***0","148":"***0","149":"***0","150":"***0","151":"***0","152":"***0","153":"***0","154":"***0","155":"***0","156":"***0","157":"***0","158":"***0","159":"***0","160":"***0","161":"***0","162":"***0","163":"***0","164":"***0","165":"***0","166":"***0","167":"***0","168":"***0","169":"***0","170":"***0","171":"***0","172":"***0","173":"***0","174":"***0","175":"***0","176":"***0","177":"***0","178":"***0","179":"***0","180":"***0","181":"***0","182":"***0","183":"***0","184":"***0","185":"***0","186":"***0","187":"***0","188":"***0","189":"***0","190":"***0","191":"***0","192":"***0","193":"***0","194":"***0","195":"***0","196":"***0","197":"***0","198":"***0","199":"***0","200":"***0","201":"***0","202":"***0","203":"***0","204":"***0","205":"***0","206":"***0","207":"***0","208":"***0","209":"***0","210":"***0","211":"***0","212":"***0","213":"***0","214":"***0","215":"***0","216":"***0","217":"***0","218":"***0","219":"***0","220":"***0","221":"***0","222":"***0","223":"***0","224":"***0","225":"***0","226":"***0","227":"***0","228":"***0","229":"***0","230":"***0","231":"***0","232":"***0","233":"***0","234":"***0","235":"***0","236":"***0","237":"***0","238":"***0","239":"***0","240":"***0","241":"***0","242":"***0","243":"***0","244":"***0","245":"***0","246":"***0","247":"***0","248":"***0","249":"***0","250":"***0","251":"***0","252":"***0","253":"***0","254":"***0","255":"***0"},"unknown":"blank"}},"attr":{"2":[[10,0,255]],"7":[[17,0,255]],"65":[[11,0,255]],"66":[[11,0,255]],"67":[[11,0,255]],"68":[[11,0,255]],"80":[[11,0,255]],"81":[[11,0,255]],"82":[[11,0,255]],"83":[[11,0,255]],"99":[[11,0,255]],"161":[[18,8,255],[19,0,255]],"165":[[19,8,255],[20,0,255]],"168":[[9,8,255],[10,0,255]],"169":[[9,8,255],[10,0,255]],"170":[[9,8,255],[10,0,255]],"172":[[9,8,255],[10,0,255]],"177":[[13,0,255]],"178":[[13,0,255]],"179":[[13,0,255]],"193":[[9,8,255],[10,0,255]],"194":[[9,8,255],[10,0,255]],"196":[[9,8,255],[10,0,255]],"449":[[9,8,255],[10,0,255]],"450":[[9,8,255],[10,0,255]],"451":[[9,8,255],[10,0,255]],"453":[[9,8,255],[10,0,255]],"454":[[9,8,255],[10,0,255]],"455":[[9,8,255],[10,0,255]]}},"MatrixT":{"kind":18,"blocks":{"0":0,"1":118,"2":2,"3":3,"4":119,"5":120,"6":121,"7":122,"8":123,"10":9,"11":10,"12":124,"13":125,"14":126,"15":127,"16":128,"17":129,"18":130,"19":131,"20":132,"21":133,"22":134,"23":135,"24":136,"25":137,"26":138,"27":139,"28":140,"29":141,"30":142,"31":143,"32":144,"33":145,"34":146,"35":147,"36":148,"37":149,"38":150,"39":151,"40":152,"41":153,"42":154,"43":155,"44":43,"45":44,"46":156,"47":157,"48":158,"49":159,"50":49,"51":160,"52":51,"53":52,"55":161,"56":54,"57":162,"58":163,"59":164,"60":165,"61":166,"62":167,"63":168,"64":169,"68":170,"69":171,"70":172,"71":66,"72":67,"73":68,"74":69,"75":70,"76":71,"77":173,"78":73,"79":174,"80":175,"81":76,"82":77,"83":176,"84":177,"85":80,"86":178,"87":179,"88":180,"89":84,"90":85,"91":86,"92":87,"93":88,"94":89,"101":181,"102":182,"103":183,"104":184,"106":185,"107":186,"108":187,"109":188},"formats":{"261":{"kind":"enum","values":{"0":"***P-16","1":"G54","2":"G55","3":"G56","4":"G57","5":"G58","6":"G59","7":"A","8":"B","9":"C","10":"D","11":"E","12":"F","13":"G","14":"H","15":"J","16":"K","17":"G54.1P1","18":"G54.1P2","19":"G54.1P3","20":"G54.1P4","21":"G54.1P5","22":"G54.1P6","23":"G54.1P7","24":"G54.1P8","25":"G54.1P9","26":"G54.1P10","27":"G54.1P11","28":"G54.1P12","29":"G54.1P13","30":"G54.1P14","31":"G54.1P15","32":"G54.1P16","33":"G54.1P17","34":"G54.1P18","35":"G54.1P19","36":"G54.1P20","37":"G54.1P21","38":"G54.1P22","39":"G54.1P23","40":"G54.1P24","41":"G54.1P25","42":"G54.1P26","43":"G54.1P27","44":"G54.1P28","45":"G54.1P29","46":"G54.1P30","47":"G54.1P31","48":"G54.1P32","49":"G54.1P33","50":"G54.1P34","51":"G54.1P35","52":"G54.1P36","53":"G54.1P37","54":"G54.1P38","55":"G54.1P39","56":"G54.1P40","57":"G54.1P41","58":"G54.1P42","59":"G54.1P43","60":"G54.1P44","61":"G54.1P45","62":"G54.1P46","63":"G54.1P47","64":"G54.1P48","65":"G54.1P49","66":"***P50","67":"***P51","68":"***P52","69":"***P53","70":"***P54","71":"***P55","72":"***P56","73":"***P57","74":"***P58","75":"***P59","76":"***P60","77":"***P61","78":"***P62","79":"***P63","80":"***P64","81":"***P65","82":"***P66","83":"***P67","84":"***P68","85":"***P69","86":"***P70","87":"***P71","88":"***P72","89":"***P73","90":"***P74","91":"***P75","92":"***P76","93":"***P77","94":"***P78","95":"***P79","96":"***P80","97":"***P81","98":"***P82","99":"***P83","100":"***P84","101":"***P85","102":"***P86","103":"***P87","104":"***P88","105":"***P89","106":"***P90","107":"***P91","108":"***P92","109":"***P93","110":"***P94","111":"***P95","112":"***P96","113":"***P97","114":"***P98","115":"***P99","116":"***P100","117":"***P101","118":"***P102","119":"***P103","120":"***P104","121":"***P105","122":"***P106","123":"***P107","124":"***P108","125":"***P109","126":"***P110","127":"***P111","128":"***P112","129":"***P113","130":"***P114","131":"***P115","132":"***P116","133":"***P117","134":"***P118","135":"***P119","136":"***P120","137":"***P121","138":"***P122","139":"***P123","140":"***P124","141":"***P125","142":"***P126","143":"***P127","144":"***P128","145":"***P129","146":"***P130","147":"***P131","148":"***P132","149":"***P133","150":"***P134","151":"***P135","152":"***P136","153":"***P137","154":"***P138","155":"***P139","156":"***P140","157":"***P141","158":"***P142","159":"***P143","160":"***P144","161":"***P145","162":"***P146","163":"***P147","164":"***P148","165":"***P149","166":"***P150","167":"***P151","168":"***P152","169":"***P153","170":"***P154","171":"***P155","172":"***P156","173":"***P157","174":"***P158","175":"***P159","176":"***P160","177":"***P161","178":"***P162","179":"***P163","180":"***P164","181":"***P165","182":"***P166","183":"***P167","184":"***P168","185":"***P169","186":"***P170","187":"***P171","188":"***P172","189":"***P173","190":"***P174","191":"***P175","192":"***P176","193":"***P177","194":"***P178","195":"***P179","196":"***P180","197":"***P181","198":"***P182","199":"***P183","200":"***P184","201":"***P185","202":"***P186","203":"***P187","204":"***P188","205":"***P189","206":"***P190","207":"***P191","208":"***P192","209":"***P193","210":"***P194","211":"***P195","212":"***P196","213":"***P197","214":"***P198","215":"***P199","216":"***P200","217":"***P201","218":"***P202","219":"***P203","220":"***P204","221":"***P205","222":"***P206","223":"***P207","224":"***P208","225":"***P209","226":"***P210","227":"***P211","228":"***P212","229":"***P213","230":"***P214","231":"***P215","232":"***P216","233":"***P217","234":"***P218","235":"***P219","236":"***P220","237":"***P221","238":"***P222","239":"***P223","240":"***P224","241":"***P225","242":"***P226","243":"***P227","244":"***P228","245":"***P229","246":"***P230","247":"***P231","248":"***P232","249":"***P233","250":"***P234","251":"***P235","252":"***P236","253":"***P237","254":"***P238","255":"***P239"},"unknown":"blank","low":true},"288":{"kind":"num","inch":{"prefix":"","scale":1e-05,"dec":4},"metric":{"prefix":"","scale":0.0001,"dec":3}}},"attr":{"2":[[10,0,255]],"7":[[17,0,255]],"65":[[11,0,255]],"66":[[11,0,255]],"67":[[11,0,255]],"68":[[11,0,255]],"80":[[11,0,255]],"81":[[11,0,255]],"82":[[11,0,255]],"83":[[11,0,255]],"99":[[11,0,255]],"161":[[18,8,255],[19,0,255]],"165":[[19,8,255],[20,0,255]],"168":[[9,8,255],[10,0,255]],"169":[[9,8,255],[10,0,255]],"170":[[9,8,255],[10,0,255]],"172":[[9,8,255],[10,0,255]],"177":[[13,0,255]],"178":[[13,0,255]],"699":[[14,0,255]],"704":[[9,8,255],[10,0,255]],"711":[[9,8,255],[10,0,255]],"712":[[9,8,255],[10,0,255]],"713":[[9,8,255],[10,0,255]],"714":[[9,8,255],[10,0,255]],"719":[[9,8,255],[10,0,255]]}},"SmoothT":{"kind":23,"blocks":{"0":0,"1":118,"2":2,"3":3,"4":189,"5":5,"6":190,"7":7,"8":8,"10":9,"11":10,"12":124,"13":125,"14":126,"15":127,"16":128,"17":129,"18":130,"19":131,"20":132,"21":133,"22":134,"23":135,"24":136,"25":137,"26":138,"27":139,"28":140,"29":141,"30":142,"31":143,"32":144,"33":145,"34":146,"35":147,"36":148,"37":149,"38":150,"39":151,"40":152,"41":153,"42":154,"43":155,"44":43,"45":107,"46":156,"47":191,"48":192,"49":193,"50":49,"51":194,"52":51,"53":52,"55":161,"56":54,"57":55,"58":56,"59":195,"60":58,"61":196,"62":60,"63":61,"64":197,"68":198,"69":199,"70":200,"71":66,"72":67,"73":68,"74":69,"75":114,"76":71,"77":173,"78":73,"79":74,"80":201,"81":76,"82":77,"83":202,"84":203,"85":80,"86":178,"87":82,"88":180,"89":84,"90":85,"91":86,"92":87,"93":88,"94":89,"101":181,"102":182,"103":183,"104":184,"106":185,"107":186,"108":187,"109":188},"formats":{"261":{"kind":"enum","values":{"0":"***P-16","1":"G54","2":"G55","3":"G56","4":"G57","5":"G58","6":"G59","7":"A","8":"B","9":"C","10":"D","11":"E","12":"F","13":"G","14":"H","15":"J","16":"K","17":"G54.1P1","18":"G54.1P2","19":"G54.1P3","20":"G54.1P4","21":"G54.1P5","22":"G54.1P6","23":"G54.1P7","24":"G54.1P8","25":"G54.1P9","26":"G54.1P10","27":"G54.1P11","28":"G54.1P12","29":"G54.1P13","30":"G54.1P14","31":"G54.1P15","32":"G54.1P16","33":"G54.1P17","34":"G54.1P18","35":"G54.1P19","36":"G54.1P20","37":"G54.1P21","38":"G54.1P22","39":"G54.1P23","40":"G54.1P24","41":"G54.1P25","42":"G54.1P26","43":"G54.1P27","44":"G54.1P28","45":"G54.1P29","46":"G54.1P30","47":"G54.1P31","48":"G54.1P32","49":"G54.1P33","50":"G54.1P34","51":"G54.1P35","52":"G54.1P36","53":"G54.1P37","54":"G54.1P38","55":"G54.1P39","56":"G54.1P40","57":"G54.1P41","58":"G54.1P42","59":"G54.1P43","60":"G54.1P44","61":"G54.1P45","62":"G54.1P46","63":"G54.1P47","64":"G54.1P48","65":"G54.1P49","66":"***P50","67":"***P51","68":"***P52","69":"***P53","70":"***P54","71":"***P55","72":"***P56","73":"***P57","74":"***P58","75":"***P59","76":"***P60","77":"***P61","78":"***P62","79":"***P63","80":"***P64","81":"***P65","82":"***P66","83":"***P67","84":"***P68","85":"***P69","86":"***P70","87":"***P71","88":"***P72","89":"***P73","90":"***P74","91":"***P75","92":"***P76","93":"***P77","94":"***P78","95":"***P79","96":"***P80","97":"***P81","98":"***P82","99":"***P83","100":"***P84","101":"***P85","102":"***P86","103":"***P87","104":"***P88","105":"***P89","106":"***P90","107":"***P91","108":"***P92","109":"***P93","110":"***P94","111":"***P95","112":"***P96","113":"***P97","114":"***P98","115":"***P99","116":"***P100","117":"***P101","118":"***P102","119":"***P103","120":"***P104","121":"***P105","122":"***P106","123":"***P107","124":"***P108","125":"***P109","126":"***P110","127":"***P111","128":"***P112","129":"***P113","130":"***P114","131":"***P115","132":"***P116","133":"***P117","134":"***P118","135":"***P119","136":"***P120","137":"***P121","138":"***P122","139":"***P123","140":"***P124","141":"***P125","142":"***P126","143":"***P127","144":"***P128","145":"***P129","146":"***P130","147":"***P131","148":"***P132","149":"***P133","150":"***P134","151":"***P135","152":"***P136","153":"***P137","154":"***P138","155":"***P139","156":"***P140","157":"***P141","158":"***P142","159":"***P143","160":"***P144","161":"***P145","162":"***P146","163":"***P147","164":"***P148","165":"***P149","166":"***P150","167":"***P151","168":"***P152","169":"***P153","170":"***P154","171":"***P155","172":"***P156","173":"***P157","174":"***P158","175":"***P159","176":"***P160","177":"***P161","178":"***P162","179":"***P163","180":"***P164","181":"***P165","182":"***P166","183":"***P167","184":"***P168","185":"***P169","186":"***P170","187":"***P171","188":"***P172","189":"***P173","190":"***P174","191":"***P175","192":"***P176","193":"***P177","194":"***P178","195":"***P179","196":"***P180","197":"***P181","198":"***P182","199":"***P183","200":"***P184","201":"***P185","202":"***P186","203":"***P187","204":"***P188","205":"***P189","206":"***P190","207":"***P191","208":"***P192","209":"***P193","210":"***P194","211":"***P195","212":"***P196","213":"***P197","214":"***P198","215":"***P199","216":"***P200","217":"***P201","218":"***P202","219":"***P203","220":"***P204","221":"***P205","222":"***P206","223":"***P207","224":"***P208","225":"***P209","226":"***P210","227":"***P211","228":"***P212","229":"***P213","230":"***P214","231":"***P215","232":"***P216","233":"***P217","234":"***P218","235":"***P219","236":"***P220","237":"***P221","238":"***P222","239":"***P223","240":"***P224","241":"***P225","242":"***P226","243":"***P227","244":"***P228","245":"***P229","246":"***P230","247":"***P231","248":"***P232","249":"***P233","250":"***P234","251":"***P235","252":"***P236","253":"***P237","254":"***P238","255":"***P239"},"unknown":"blank","low":true},"288":{"kind":"num","inch":{"prefix":"","scale":1e-05,"dec":4},"metric":{"prefix":"","scale":0.0001,"dec":3}},"105":{"kind":"ctx"}},"attr":{"2":[[10,0,255]],"7":[[17,0,255]],"65":[[11,0,255]],"66":[[11,0,255]],"67":[[11,0,255]],"68":[[11,0,255]],"80":[[11,0,255]],"81":[[11,0,255]],"82":[[11,0,255]],"83":[[11,0,255]],"99":[[11,0,255]],"161":[[18,8,255],[19,0,255]],"165":[[19,8,255],[20,0,255]],"168":[[9,8,255],[10,0,255]],"169":[[9,8,255],[10,0,255]],"170":[[9,8,255],[10,0,255]],"172":[[9,8,255],[10,0,255]],"177":[[13,0,255]],"178":[[13,0,255]],"699":[[14,0,255]],"704":[[9,8,255],[10,0,255]],"711":[[9,8,255],[10,0,255]],"712":[[9,8,255],[10,0,255]],"713":[[9,8,255],[10,0,255]],"714":[[9,8,255],[10,0,255]],"719":[[9,8,255],[10,0,255]]}},"MatrixE":{"kind":19,"blocks":{"0":0,"1":1,"2":204,"3":3,"4":189,"5":5,"6":6,"7":7,"8":8,"10":9,"11":10,"12":205,"13":12,"14":13,"15":14,"16":15,"17":16,"18":17,"19":18,"20":19,"21":20,"22":21,"23":22,"24":23,"25":24,"26":25,"27":26,"28":27,"29":28,"30":29,"31":30,"32":31,"33":32,"34":33,"35":34,"36":35,"37":36,"38":37,"39":38,"40":39,"41":40,"42":41,"43":42,"44":43,"45":44,"46":156,"47":46,"48":206,"49":207,"50":49,"51":208,"52":51,"53":209,"55":53,"56":54,"57":55,"58":56,"59":195,"60":58,"61":196,"62":60,"63":61,"64":197,"68":210,"69":211,"70":212,"71":66,"72":67,"73":68,"74":69,"75":70,"76":71,"77":213,"78":73,"79":74,"80":214,"81":76,"82":77,"83":78,"84":79,"85":80,"86":215,"87":82,"88":180,"89":84,"90":85,"91":86,"92":87,"93":88,"94":89,"95":90,"96":91,"97":92,"98":93,"99":94,"100":95,"101":96,"102":216,"103":98,"104":99,"105":100,"106":101,"107":102,"108":103,"109":104},"formats":{"288":{"kind":"num","inch":{"prefix":"","scale":1e-05,"dec":4},"metric":{"prefix":"","scale":0.0001,"dec":3}}},"attr":{"2":[[10,0,255]],"7":[[17,0,255]],"65":[[11,0,255]],"66":[[11,0,255]],"67":[[11,0,255]],"68":[[11,0,255]],"80":[[11,0,255]],"81":[[11,0,255]],"82":[[11,0,255]],"83":[[11,0,255]],"99":[[11,0,255]],"161":[[18,8,255],[19,0,255]],"165":[[19,8,255],[20,0,255]],"168":[[9,8,255],[10,0,255]],"169":[[9,8,255],[10,0,255]],"170":[[9,8,255],[10,0,255]],"172":[[9,8,255],[10,0,255]],"177":[[13,0,255]],"178":[[13,0,255]],"179":[[13,0,255]],"193":[[9,8,255],[10,0,255]],"194":[[9,8,255],[10,0,255]],"196":[[9,8,255],[10,0,255]],"449":[[9,8,255],[10,0,255]],"450":[[9,8,255],[10,0,255]],"451":[[9,8,255],[10,0,255]],"453":[[9,8,255],[10,0,255]],"454":[[9,8,255],[10,0,255]],"455":[[9,8,255],[10,0,255]]}},"SmoothE":{"kind":24,"blocks":{"0":0,"1":1,"2":204,"3":3,"4":189,"5":5,"6":217,"7":7,"8":8,"10":9,"11":10,"12":205,"13":12,"14":13,"15":14,"16":15,"17":16,"18":17,"19":18,"20":19,"21":20,"22":21,"23":22,"24":23,"25":24,"26":25,"27":26,"28":27,"29":28,"30":29,"31":30,"32":31,"33":32,"34":218,"35":219,"36":220,"37":221,"38":222,"39":223,"40":224,"41":40,"42":41,"43":42,"44":43,"45":107,"46":156,"47":46,"48":225,"49":226,"50":49,"51":227,"52":51,"53":209,"55":53,"56":54,"57":55,"58":56,"59":195,"60":58,"61":196,"62":60,"63":61,"64":197,"68":228,"69":229,"70":212,"71":66,"72":67,"73":68,"74":69,"75":114,"76":71,"77":213,"78":73,"79":74,"80":214,"81":76,"82":77,"83":116,"84":79,"85":80,"86":215,"87":82,"88":180,"89":84,"90":85,"91":86,"92":87,"93":88,"94":89,"95":230,"96":91,"97":92,"98":93,"99":94,"100":95,"101":96,"102":216,"103":98,"104":99,"105":100,"106":101,"107":102,"108":103,"109":104},"formats":{"288":{"kind":"num","inch":{"prefix":"","scale":1e-05,"dec":4},"metric":{"prefix":"","scale":0.0001,"dec":3}},"105":{"kind":"ctx"}},"attr":{"2":[[10,0,255]],"7":[[17,0,255]],"65":[[11,0,255]],"66":[[11,0,255]],"67":[[11,0,255]],"68":[[11,0,255]],"80":[[11,0,255]],"81":[[11,0,255]],"82":[[11,0,255]],"83":[[11,0,255]],"99":[[11,0,255]],"161":[[18,8,255],[19,0,255]],"165":[[19,8,255],[20,0,255]],"168":[[9,8,255],[10,0,255]],"169":[[9,8,255],[10,0,255]],"170":[[9,8,255],[10,0,255]],"172":[[9,8,255],[10,0,255]],"177":[[13,0,255]],"178":[[13,0,255]],"179":[[13,0,255]],"193":[[9,8,255],[10,0,255]],"194":[[9,8,255],[10,0,255]],"196":[[9,8,255],[10,0,255]],"449":[[9,8,255],[10,0,255]],"450":[[9,8,255],[10,0,255]],"451":[[9,8,255],[10,0,255]],"453":[[9,8,255],[10,0,255]],"454":[[9,8,255],[10,0,255]],"455":[[9,8,255],[10,0,255]]}},"TD-MatrixM":{"kind":17,"blocks":{"0":231,"1":232},"formats":{"6":{"kind":"ctx"}},"attr":{},"layout":"tooldata","rec":256,"lines":[1,0],"heads":{"0":["         TOOL SET       WEAR COMP.    MAX WEAR    LIFE      USED    TL EYE COMP.","TNo.    X        Z       X      Z      X    Z   TIME NUM. TIME NUM.   X     Z","--- -------- -------- ------- ------ ----- ---- ---- ---  ---- ---  ------ ------"],"1":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","      ---------    --------  ----- ------  ------ --------- ------- --- ------ --------"]}},"TF-MatrixM":{"kind":17,"blocks":{"0":233},"formats":{},"attr":{},"layout":"toolfile","rec":160,"lines":[0],"heads":{"0":["No. Tool      Nom-Dia      Matl.    Depth    Min-Dia. Teeth  Angle"]}},"TD-SmoothM":{"kind":22,"blocks":{"0":231,"1":234},"formats":{"6":{"kind":"ctx"}},"attr":{},"layout":"tooldata","rec":384,"lines":[1,0],"heads":{"0":["         TOOL SET       WEAR COMP.    MAX WEAR    LIFE      USED    TL EYE COMP.","TNo.    X        Z       X      Z      X    Z   TIME NUM. TIME NUM.   X     Z","--- -------- -------- ------- ------ ----- ---- ---- ---  ---- ---  ------ ------"],"1":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","      ---------    --------  ----- ------  ------ --------- ------- --- ------ --------"]}},"TF-SmoothM":{"kind":22,"blocks":{"0":233},"formats":{},"attr":{},"layout":"toolfile","rec":160,"lines":[0],"heads":{"0":["No. Tool      Nom-Dia      Matl.    Depth    Min-Dia. Teeth  Angle"]}},"TD-MatrixT":{"kind":18,"blocks":{"0":235,"1":232},"formats":{"6":{"kind":"ctx"},"215":{"kind":"num","inch":{"prefix":"","scale":3.937007874015748e-08,"dec":4},"metric":{"prefix":"","scale":1e-06,"dec":3}}},"attr":{},"layout":"tooldata","rec":256,"lines":[1,0],"heads":{"0":["        -TOOL SET-     -WEAR COMP.-  MAX WEAR   CONS. COMP     LIFE     USED    Comments","PKNo    X        Z       X      Z    X    Z      X      Z    TIME NUM.TIME NUM. IDNo.","--- -------- -------- ------ ------ ---- ----- ------ ------ ---- --- ---- ---  ------------"],"1":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","      ---------    --------  ----- ------  ------ --------- ------- --- ------ --------"]}},"TF-MatrixT":{"kind":18,"blocks":{"0":236},"formats":{},"attr":{},"layout":"toolfile","rec":160,"lines":[0],"heads":{"0":["TNo. Tool    Nom. Dia     Mat.    Depth   No.  |      Angle","---  ------  ---------  -------  ------  ----- | -------------"]}},"TD-SmoothT":{"kind":23,"blocks":{"0":235,"1":234},"formats":{"6":{"kind":"ctx"},"215":{"kind":"num","inch":{"prefix":"","scale":3.937007874015748e-08,"dec":4},"metric":{"prefix":"","scale":1e-06,"dec":3}}},"attr":{},"layout":"tooldata","rec":384,"lines":[1,0],"heads":{"0":["        -TOOL SET-     -WEAR COMP.-  MAX WEAR   CONS. COMP     LIFE     USED    Comments","PKNo    X        Z       X      Z    X    Z      X      Z    TIME NUM.TIME NUM. IDNo.","--- -------- -------- ------ ------ ---- ----- ------ ------ ---- --- ---- ---  ------------"],"1":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","      ---------    --------  ----- ------  ------ --------- ------- --- ------ --------"]}},"TF-SmoothT":{"kind":23,"blocks":{"0":236},"formats":{},"attr":{},"layout":"toolfile","rec":160,"lines":[0],"heads":{"0":["TNo. Tool    Nom. Dia     Mat.    Depth   No.  |      Angle","---  ------  ---------  -------  ------  ----- | -------------"]}},"TD-MatrixE":{"kind":19,"blocks":{"0":231,"1":232},"formats":{"6":{"kind":"ctx"}},"attr":{},"layout":"tooldata","rec":256,"lines":[1,0],"heads":{"0":["         TOOL SET       WEAR COMP.    MAX WEAR    LIFE      USED    TL EYE COMP.","TNo.    X        Z       X      Z      X    Z   TIME NUM. TIME NUM.   X     Z","--- -------- -------- ------- ------ ----- ---- ---- ---  ---- ---  ------ ------"],"1":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","      ---------    --------  ----- ------  ------ --------- ------- --- ------ --------"]}},"TF-MatrixE":{"kind":19,"blocks":{"0":233},"formats":{},"attr":{},"layout":"toolfile","rec":160,"lines":[0],"heads":{"0":["No. Tool      Nom-Dia      Matl.    Depth    Min-Dia. Teeth  Angle"]}},"TD-SmoothE":{"kind":24,"blocks":{"0":231,"1":234},"formats":{"6":{"kind":"ctx"}},"attr":{},"layout":"tooldata","rec":384,"lines":[1,0],"heads":{"0":["         TOOL SET       WEAR COMP.    MAX WEAR    LIFE      USED    TL EYE COMP.","TNo.    X        Z       X      Z      X    Z   TIME NUM. TIME NUM.   X     Z","--- -------- -------- ------- ------ ----- ---- ---- ---  ---- ---  ------ ------"],"1":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","      ---------    --------  ----- ------  ------ --------- ------- --- ------ --------"]}},"TF-SmoothE":{"kind":24,"blocks":{"0":233},"formats":{},"attr":{},"layout":"toolfile","rec":160,"lines":[0],"heads":{"0":["No. Tool      Nom-Dia      Matl.    Depth    Min-Dia. Teeth  Angle"]}}},"formats":{"100":{"inch":{"dec":4,"prefix":"","round":true,"scale":3.937007874015748e-08},"kind":"num","metric":{"dec":3,"prefix":"","round":true,"scale":1e-06}},"102":{"inch":{"dec":4,"prefix":"","round":true,"scale":3.937007874015748e-08},"kind":"num","metric":{"dec":3,"prefix":"","round":true,"scale":1e-06}},"104":{"inch":{"dec":0,"prefix":"","scale":1},"kind":"num","metric":{"dec":0,"prefix":"","scale":1}},"105":{"inch":{"dec":0,"prefix":"","scale":1},"kind":"num","metric":{"dec":0,"prefix":"","scale":1}},"107":{"inch":{"dec":3,"prefix":"","scale":0.001},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.001}},"112":{"inch":{"dec":4,"prefix":"","scale":0.0001},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.001}},"118":{"inch":{"dec":4,"prefix":"","scale":0.0001},"kind":"num","metric":{"dec":4,"prefix":"","scale":0.0001}},"119":{"inch":{"dec":4,"prefix":"","scale":0.0001},"kind":"num","metric":{"dec":4,"prefix":"","scale":0.0001}},"123":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"124":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"125":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"126":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"127":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"128":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"131":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"133":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"134":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"135":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"136":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"137":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"138":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"139":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"141":{"inch":{"dec":6,"prefix":"","scale":1e-06},"kind":"num","metric":{"dec":5,"prefix":"","scale":1e-05}},"142":{"inch":{"dec":6,"prefix":"","scale":1e-06},"kind":"num","metric":{"dec":5,"prefix":"","scale":1e-05}},"143":{"kind":"ctx"},"144":{"kind":"enum","low":true,"unknown":"hex30","values":{"0":"","1":"CHK","2":"BAR","208":"","3":"MOV","4":"*CHK","5":"NO MOV"}},"145":{"kind":"enum","unknown":"hex","values":{"1":"SINGLE","2":"SYNC","3":"CROS","4":"SWISS"}},"146":{"kind":"int"},"149":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"151":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"160":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"161":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"165":{"inch":{"dec":4,"prefix":"R","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"R","scale":0.0001}},"166":{"inch":{"dec":4,"prefix":"R","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"R","scale":0.0001}},"168":{"inch":{"dec":4,"prefix":"R","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"R","scale":0.0001}},"169":{"inch":{"dec":3,"prefix":"A","scale":0.0001},"kind":"num","metric":{"dec":3,"prefix":"A","scale":0.0001}},"170":{"inch":{"dec":3,"prefix":"A","scale":0.0001},"kind":"num","metric":{"dec":3,"prefix":"A","scale":0.0001}},"172":{"inch":{"dec":3,"prefix":"A","scale":0.0001},"kind":"num","metric":{"dec":3,"prefix":"A","scale":0.0001}},"178":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":4,"prefix":"","scale":0.0001}},"181":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"188":{"kind":"ctx"},"189":{"inch":{"dec":4,"prefix":" ","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":" ","scale":0.0001}},"190":{"inch":{"dec":4,"prefix":"C","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"C","scale":0.0001}},"191":{"inch":{"dec":4,"prefix":"C","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"C","scale":0.0001}},"192":{"kind":"ctx"},"193":{"kind":"ctx"},"194":{"kind":"ctx"},"202":{"kind":"enum","unknown":"blank","values":{"0":"0000000000","1":"0000000001","10":"0000001010","100":"0001100100","101":"0001100101","102":"0001100110","103":"0001100111","104":"0001101000","105":"0001101001","106":"0001101010","107":"0001101011","108":"0001101100","109":"0001101101","11":"0000001011","110":"0001101110","111":"0001101111","112":"0001110000","113":"0001110001","114":"0001110010","115":"0001110011","116":"0001110100","117":"0001110101","118":"0001110110","119":"0001110111","12":"0000001100","120":"0001111000","121":"0001111001","122":"0001111010","123":"0001111011","124":"0001111100","125":"0001111101","126":"0001111110","127":"0001111111","128":"0010000000","129":"0010000001","13":"0000001101","130":"0010000010","131":"0010000011","132":"0010000100","133":"0010000101","134":"0010000110","135":"0010000111","136":"0010001000","137":"0010001001","138":"0010001010","139":"0010001011","14":"0000001110","140":"0010001100","141":"0010001101","142":"0010001110","143":"0010001111","144":"0010010000","145":"0010010001","146":"0010010010","147":"0010010011","148":"0010010100","149":"0010010101","15":"0000001111","150":"0010010110","151":"0010010111","152":"0010011000","153":"0010011001","154":"0010011010","155":"0010011011","156":"0010011100","157":"0010011101","158":"0010011110","159":"0010011111","16":"0000010000","160":"0010100000","161":"0010100001","162":"0010100010","163":"0010100011","164":"0010100100","165":"0010100101","166":"0010100110","167":"0010100111","168":"0010101000","169":"0010101001","17":"0000010001","170":"0010101010","171":"0010101011","172":"0010101100","173":"0010101101","174":"0010101110","175":"0010101111","176":"0010110000","177":"0010110001","178":"0010110010","179":"0010110011","18":"0000010010","180":"0010110100","181":"0010110101","182":"0010110110","183":"0010110111","184":"0010111000","185":"0010111001","186":"0010111010","187":"0010111011","188":"0010111100","189":"0010111101","19":"0000010011","190":"0010111110","191":"0010111111","192":"0011000000","193":"0011000001","194":"0011000010","195":"0011000011","196":"0011000100","197":"0011000101","198":"0011000110","199":"0011000111","2":"0000000010","20":"0000010100","200":"0011001000","201":"0011001001","202":"0011001010","203":"0011001011","204":"0011001100","205":"0011001101","206":"0011001110","207":"0011001111","208":"0011010000","209":"0011010001","21":"0000010101","210":"0011010010","211":"0011010011","212":"0011010100","213":"0011010101","214":"0011010110","215":"0011010111","216":"0011011000","217":"0011011001","218":"0011011010","219":"0011011011","22":"0000010110","220":"0011011100","221":"0011011101","222":"0011011110","223":"0011011111","224":"0011100000","225":"0011100001","226":"0011100010","227":"0011100011","228":"0011100100","229":"0011100101","23":"0000010111","230":"0011100110","231":"0011100111","232":"0011101000","233":"0011101001","234":"0011101010","235":"0011101011","236":"0011101100","237":"0011101101","238":"0011101110","239":"0011101111","24":"0000011000","240":"0011110000","241":"0011110001","242":"0011110010","243":"0011110011","244":"0011110100","245":"0011110101","246":"0011110110","247":"0011110111","248":"0011111000","249":"0011111001","25":"0000011001","250":"0011111010","251":"0011111011","252":"0011111100","253":"0011111101","254":"0011111110","255":"0011111111","256":"0100000000","257":"0100000001","258":"0100000010","259":"0100000011","26":"0000011010","260":"0100000100","261":"0100000101","262":"0100000110","263":"0100000111","264":"0100001000","265":"0100001001","266":"0100001010","267":"0100001011","268":"0100001100","269":"0100001101","27":"0000011011","270":"0100001110","271":"0100001111","272":"0100010000","273":"0100010001","274":"0100010010","275":"0100010011","276":"0100010100","277":"0100010101","278":"0100010110","279":"0100010111","28":"0000011100","280":"0100011000","281":"0100011001","282":"0100011010","283":"0100011011","284":"0100011100","285":"0100011101","286":"0100011110","287":"0100011111","288":"0100100000","289":"0100100001","29":"0000011101","290":"0100100010","291":"0100100011","292":"0100100100","293":"0100100101","294":"0100100110","295":"0100100111","296":"0100101000","297":"0100101001","298":"0100101010","299":"0100101011","3":"0000000011","30":"0000011110","300":"0100101100","301":"0100101101","302":"0100101110","303":"0100101111","304":"0100110000","305":"0100110001","306":"0100110010","307":"0100110011","308":"0100110100","309":"0100110101","31":"0000011111","310":"0100110110","311":"0100110111","312":"0100111000","313":"0100111001","314":"0100111010","315":"0100111011","316":"0100111100","317":"0100111101","318":"0100111110","319":"0100111111","32":"0000100000","320":"0101000000","321":"0101000001","322":"0101000010","323":"0101000011","324":"0101000100","325":"0101000101","326":"0101000110","327":"0101000111","328":"0101001000","329":"0101001001","33":"0000100001","330":"0101001010","331":"0101001011","332":"0101001100","333":"0101001101","334":"0101001110","335":"0101001111","336":"0101010000","337":"0101010001","338":"0101010010","339":"0101010011","34":"0000100010","340":"0101010100","341":"0101010101","342":"0101010110","343":"0101010111","344":"0101011000","345":"0101011001","346":"0101011010","347":"0101011011","348":"0101011100","349":"0101011101","35":"0000100011","350":"0101011110","351":"0101011111","352":"0101100000","353":"0101100001","354":"0101100010","355":"0101100011","356":"0101100100","357":"0101100101","358":"0101100110","359":"0101100111","36":"0000100100","360":"0101101000","361":"0101101001","362":"0101101010","363":"0101101011","364":"0101101100","365":"0101101101","366":"0101101110","367":"0101101111","368":"0101110000","369":"0101110001","37":"0000100101","370":"0101110010","371":"0101110011","372":"0101110100","373":"0101110101","374":"0101110110","375":"0101110111","376":"0101111000","377":"0101111001","378":"0101111010","379":"0101111011","38":"0000100110","380":"0101111100","381":"0101111101","382":"0101111110","383":"0101111111","384":"0110000000","385":"0110000001","386":"0110000010","387":"0110000011","388":"0110000100","389":"0110000101","39":"0000100111","390":"0110000110","391":"0110000111","392":"0110001000","393":"0110001001","394":"0110001010","395":"0110001011","396":"0110001100","397":"0110001101","398":"0110001110","399":"0110001111","4":"0000000100","40":"0000101000","400":"0110010000","41":"0000101001","42":"0000101010","43":"0000101011","44":"0000101100","45":"0000101101","46":"0000101110","47":"0000101111","48":"0000110000","49":"0000110001","5":"0000000101","50":"0000110010","51":"0000110011","52":"0000110100","53":"0000110101","54":"0000110110","55":"0000110111","56":"0000111000","57":"0000111001","58":"0000111010","59":"0000111011","6":"0000000110","60":"0000111100","61":"0000111101","62":"0000111110","63":"0000111111","64":"0001000000","65":"0001000001","66":"0001000010","67":"0001000011","68":"0001000100","69":"0001000101","7":"0000000111","70":"0001000110","71":"0001000111","72":"0001001000","73":"0001001001","74":"0001001010","75":"0001001011","76":"0001001100","77":"0001001101","78":"0001001110","79":"0001001111","8":"0000001000","80":"0001010000","81":"0001010001","82":"0001010010","83":"0001010011","84":"0001010100","85":"0001010101","86":"0001010110","87":"0001010111","88":"0001011000","89":"0001011001","9":"0000001001","90":"0001011010","91":"0001011011","92":"0001011100","93":"0001011101","94":"0001011110","95":"0001011111","96":"0001100000","97":"0001100001","98":"0001100010","99":"0001100011"}},"206":{"kind":"int"},"207":{"kind":"int"},"209":{"kind":"int"},"211":{"kind":"enum","unknown":"q","values":{"0":"ToolChg","1":"HOME","2":"FixedPt","3":"ARB PT","4":"ESC 1","5":"ESC 2"}},"212":{"kind":"ctx"},"214":{"inch":{"dec":2,"prefix":"","scale":3.937007874015748e-08},"kind":"num","metric":{"dec":1,"div":1000000,"prefix":"","scale":1e-06}},"215":{"inch":{"dec":4,"prefix":"","scale":0.0001},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.001}},"216":{"kind":"ctx"},"220":{"kind":"int"},"222":{"kind":"enum","unknown":"hex","values":{"0":"^","1":"^","10":"^","100":"^","1000":"^","12":"^","123":"^","2":"^","255":"^","3":"^","32767":"^","5":"^","8":"^","9":"^","99":"^","999":"^","9999":"^"}},"228":{"kind":"int"},"233":{"kind":"enum","low":true,"unknown":"hex","values":{"1":" OUT","17":" OUT","18":"*OUT","19":" IN","2":"*OUT","20":"*IN","21":" FCE","22":"*FCE","23":" BAK","24":"*BAK","3":" IN","33":" out","34":"*out","37":" fce","38":"*fce","39":" bak","4":"*IN","40":"*bak","5":" FCE","6":"*FCE","7":" BAK","8":"*BAK"}},"237":{"kind":"enum","unknown":"hex","values":{}},"238":{"kind":"enum","unknown":"blank","values":{"1":"DRILL","2":"BORE","3":"END MILL"}},"239":{"kind":"enum","unknown":"blank","values":{"1":" OUT","112":"000","113":"001","114":"002","115":"003","116":"004","117":"005","118":"006","119":"007","120":"008","121":"009","122":"010","123":"011","124":"012","125":"013","126":"014","127":"015","144":"000","145":"001","146":"002","147":"003","148":"004","149":"005","150":"006","151":"007","152":"008","153":"009","154":"010","155":"011","156":"012","157":"013","158":"014","159":"015","16":"000","17":"001","176":"000","177":"001","178":"002","179":"003","18":"002","180":"004","181":"005","182":"006","183":"007","184":"008","185":"009","186":"010","187":"011","188":"012","189":"013","19":"003","190":"014","191":"015","2":" IN","20":"004","208":"000","209":"001","21":"005","210":"002","211":"003","212":"004","213":"005","214":"006","215":"007","216":"008","217":"009","218":"010","219":"011","22":"006","220":"012","221":"013","222":"014","223":"015","23":"007","24":"008","240":"000","241":"001","242":"002","243":"003","244":"004","245":"005","246":"006","247":"007","248":"008","249":"009","25":"009","250":"010","251":"011","252":"012","253":"013","254":"014","255":"015","26":"010","27":"011","28":"012","29":"013","3":"EDGE","30":"014","31":"015","4":"*IN","48":"000","49":"001","5":"*EDG","50":"002","51":"003","52":"004","53":"005","54":"006","55":"007","56":"008","57":"009","58":"010","59":"011","6":"*OUT","60":"012","61":"013","62":"014","63":"015","80":"000","81":"001","82":"002","83":"003","84":"004","85":"005","86":"006","87":"007","88":"008","89":"009","90":"010","91":"011","92":"012","93":"013","94":"014","95":"015"}},"241":{"kind":"enum","unknown":"blank","values":{"0":"G01","1":"0.1","10":"1.0","100":"*.*","101":"*.*","102":"*.*","103":"*.*","104":"*.*","105":"*.*","106":"*.*","107":"*.*","108":"*.*","109":"*.*","11":"1.1","110":"*.*","111":"*.*","112":"*.*","113":"*.*","114":"*.*","115":"*.*","116":"*.*","117":"*.*","118":"*.*","119":"*.*","12":"1.2","120":"*.*","121":"*.*","122":"*.*","123":"*.*","124":"*.*","125":"*.*","126":"*.*","127":"*.*","128":"G00","129":"*.*","13":"1.3","130":"*.*","131":"*.*","132":"*.*","133":"*.*","134":"*.*","135":"*.*","136":"*.*","137":"*.*","138":"*.*","139":"*.*","14":"1.4","140":"*.*","141":"*.*","142":"*.*","143":"*.*","144":"*.*","145":"*.*","146":"*.*","147":"*.*","148":"*.*","149":"*.*","15":"1.5","150":"*.*","151":"*.*","152":"*.*","153":"*.*","154":"*.*","155":"*.*","156":"*.*","157":"*.*","158":"*.*","159":"*.*","16":"1.6","160":"*.*","161":"*.*","162":"*.*","163":"*.*","164":"*.*","165":"*.*","166":"*.*","167":"*.*","168":"*.*","169":"*.*","17":"1.7","170":"*.*","171":"*.*","172":"*.*","173":"*.*","174":"*.*","175":"*.*","176":"*.*","177":"*.*","178":"*.*","179":"*.*","18":"1.8","180":"*.*","181":"*.*","182":"*.*","183":"*.*","184":"*.*","185":"*.*","186":"*.*","187":"*.*","188":"*.*","189":"*.*","19":"1.9","190":"*.*","191":"*.*","192":"*.*","193":"*.*","194":"*.*","195":"*.*","196":"*.*","197":"*.*","198":"*.*","199":"*.*","2":"0.2","20":"2.0","200":"*.*","201":"*.*","202":"*.*","203":"*.*","204":"*.*","205":"*.*","206":"*.*","207":"*.*","208":"*.*","209":"*.*","21":"2.1","210":"*.*","211":"*.*","212":"*.*","213":"*.*","214":"*.*","215":"*.*","216":"*.*","217":"*.*","218":"*.*","219":"*.*","22":"2.2","220":"*.*","221":"*.*","222":"*.*","223":"*.*","224":"*.*","225":"*.*","226":"*.*","227":"*.*","228":"*.*","229":"*.*","23":"2.3","230":"*.*","231":"*.*","232":"*.*","233":"*.*","234":"*.*","235":"*.*","236":"*.*","237":"*.*","238":"*.*","239":"*.*","24":"2.4","240":"*.*","241":"*.*","242":"*.*","243":"*.*","244":"*.*","245":"*.*","246":"*.*","247":"*.*","248":"*.*","249":"*.*","25":"2.5","250":"*.*","251":"*.*","252":"*.*","253":"*.*","254":"*.*","255":"*.*","26":"2.6","27":"2.7","28":"2.8","29":"2.9","3":"0.3","30":"3.0","31":"3.1","32":"3.2","33":"3.3","34":"3.4","35":"3.5","36":"3.6","37":"3.7","38":"3.8","39":"3.9","4":"0.4","40":"4.0","41":"4.1","42":"4.2","43":"4.3","44":"4.4","45":"4.5","46":"4.6","47":"4.7","48":"4.8","49":"4.9","5":"0.5","50":"5.0","51":"5.1","52":"5.2","53":"5.3","54":"5.4","55":"5.5","56":"5.6","57":"5.7","58":"5.8","59":"5.9","6":"0.6","60":"6.0","61":"6.1","62":"6.2","63":"6.3","64":"6.4","65":"6.5","66":"6.6","67":"6.7","68":"6.8","69":"6.9","7":"0.7","70":"7.0","71":"7.1","72":"7.2","73":"7.3","74":"7.4","75":"7.5","76":"7.6","77":"7.7","78":"7.8","79":"7.9","8":"0.8","80":"8.0","81":"8.1","82":"8.2","83":"8.3","84":"8.4","85":"8.5","86":"8.6","87":"8.7","88":"8.8","89":"8.9","9":"0.9","90":"9.0","91":"9.1","92":"9.2","93":"9.3","94":"9.4","95":"9.5","96":"9.6","97":"9.7","98":"9.8","99":"9.9"}},"242":{"kind":"enum","unknown":"q","values":{"0":"","1":"TAPR","2":"HELC","3":"PECK","4":"HELC2"}},"244":{"kind":"enum","unknown":"blank","values":{"1":"(Meas)","10":"(Meas)","100":"(Meas)","101":"(Meas)","102":"(Meas)","103":"(Meas)","104":"(Meas)","105":"(Meas)","106":"(Meas)","107":"(Meas)","108":"(Meas)","109":"(Meas)","11":"(Meas)","110":"(Meas)","111":"(Meas)","112":"(Meas)","113":"(Meas)","114":"(Meas)","115":"(Meas)","116":"(Meas)","117":"(Meas)","118":"(Meas)","119":"(Meas)","12":"(Meas)","120":"(Meas)","121":"(Meas)","122":"(Meas)","123":"(Meas)","124":"(Meas)","125":"(Meas)","126":"(Meas)","127":"(Meas)","128":"(Meas)","129":"(Meas)","13":"(Meas)","130":"(Meas)","131":"(Meas)","132":"(Meas)","133":"(Meas)","134":"(Meas)","135":"(Meas)","136":"(Meas)","137":"(Meas)","138":"(Meas)","139":"(Meas)","14":"(Meas)","140":"(Meas)","141":"(Meas)","142":"(Meas)","143":"(Meas)","144":"(Meas)","145":"(Meas)","146":"(Meas)","147":"(Meas)","148":"(Meas)","149":"(Meas)","15":"(Meas)","150":"(Meas)","151":"(Meas)","152":"(Meas)","153":"(Meas)","154":"(Meas)","155":"(Meas)","156":"(Meas)","157":"(Meas)","158":"(Meas)","159":"(Meas)","16":"(Meas)","160":"(Meas)","161":"(Meas)","162":"(Meas)","163":"(Meas)","164":"(Meas)","165":"(Meas)","166":"(Meas)","167":"(Meas)","168":"(Meas)","169":"(Meas)","17":"(Meas)","170":"(Meas)","171":"(Meas)","172":"(Meas)","173":"(Meas)","174":"(Meas)","175":"(Meas)","176":"(Meas)","177":"(Meas)","178":"(Meas)","179":"(Meas)","18":"(Meas)","180":"(Meas)","181":"(Meas)","182":"(Meas)","183":"(Meas)","184":"(Meas)","185":"(Meas)","186":"(Meas)","187":"(Meas)","188":"(Meas)","189":"(Meas)","19":"(Meas)","190":"(Meas)","191":"(Meas)","192":"(Meas)","193":"(Meas)","194":"(Meas)","195":"(Meas)","196":"(Meas)","197":"(Meas)","198":"(Meas)","199":"(Meas)","2":"(Meas)","20":"(Meas)","200":"(Meas)","201":"(Meas)","202":"(Meas)","203":"(Meas)","204":"(Meas)","205":"(Meas)","206":"(Meas)","207":"(Meas)","208":"(Meas)","209":"(Meas)","21":"(Meas)","210":"(Meas)","211":"(Meas)","212":"(Meas)","213":"(Meas)","214":"(Meas)","215":"(Meas)","216":"(Meas)","217":"(Meas)","218":"(Meas)","219":"(Meas)","22":"(Meas)","220":"(Meas)","221":"(Meas)","222":"(Meas)","223":"(Meas)","224":"(Meas)","225":"(Meas)","226":"(Meas)","227":"(Meas)","228":"(Meas)","229":"(Meas)","23":"(Meas)","230":"(Meas)","231":"(Meas)","232":"(Meas)","233":"(Meas)","234":"(Meas)","235":"(Meas)","236":"(Meas)","237":"(Meas)","238":"(Meas)","239":"(Meas)","24":"(Meas)","240":"(Meas)","241":"(Meas)","242":"(Meas)","243":"(Meas)","244":"(Meas)","245":"(Meas)","246":"(Meas)","247":"(Meas)","248":"(Meas)","249":"(Meas)","25":"(Meas)","250":"(Meas)","251":"(Meas)","252":"(Meas)","253":"(Meas)","254":"(Meas)","255":"(Meas)","26":"(Meas)","27":"(Meas)","28":"(Meas)","29":"(Meas)","3":"(Meas)","30":"(Meas)","31":"(Meas)","32":"(Meas)","33":"(Meas)","34":"(Meas)","35":"(Meas)","36":"(Meas)","37":"(Meas)","38":"(Meas)","39":"(Meas)","4":"(Meas)","40":"(Meas)","41":"(Meas)","42":"(Meas)","43":"(Meas)","44":"(Meas)","45":"(Meas)","46":"(Meas)","47":"(Meas)","48":"(Meas)","49":"(Meas)","5":"(Meas)","50":"(Meas)","51":"(Meas)","52":"(Meas)","53":"(Meas)","54":"(Meas)","55":"(Meas)","56":"(Meas)","57":"(Meas)","58":"(Meas)","59":"(Meas)","6":"(Meas)","60":"(Meas)","61":"(Meas)","62":"(Meas)","63":"(Meas)","64":"(Meas)","65":"(Meas)","66":"(Meas)","67":"(Meas)","68":"(Meas)","69":"(Meas)","7":"(Meas)","70":"(Meas)","71":"(Meas)","72":"(Meas)","73":"(Meas)","74":"(Meas)","75":"(Meas)","76":"(Meas)","77":"(Meas)","78":"(Meas)","79":"(Meas)","8":"(Meas)","80":"(Meas)","81":"(Meas)","82":"(Meas)","83":"(Meas)","84":"(Meas)","85":"(Meas)","86":"(Meas)","87":"(Meas)","88":"(Meas)","89":"(Meas)","9":"(Meas)","90":"(Meas)","91":"(Meas)","92":"(Meas)","93":"(Meas)","94":"(Meas)","95":"(Meas)","96":"(Meas)","97":"(Meas)","98":"(Meas)","99":"(Meas)"}},"246":{"kind":"enum","unknown":"hex","values":{"1":"  OFF","2":"  5*2","3":"  OFS TYPE"}},"248":{"kind":"enum","unknown":"blank","values":{"10":"A","11":"B","12":"C","13":"D","14":"E","15":"F","16":"G","17":"H","18":"I","19":"J","20":"K","21":"L","22":"M","23":"N","24":"O","25":"P","26":"Q","27":"R","28":"S","29":"T","30":"U","31":"V","32":"W","33":"X","34":"Y","35":"Z","4":"4","5":"5","6":"6"}},"250":{"kind":"enum","unknown":"blank","values":{"10":"A","11":"B","12":"C","13":"D","14":"E","15":"F","16":"G","17":"H","18":"I","19":"J","20":"K","21":"L","22":"M","23":"N","24":"O","25":"P","26":"Q","27":"R","28":"S","29":"T","30":"U","31":"V","32":"W","33":"X","34":"Y","35":"Z","4":"4","5":"5","6":"6"}},"252":{"kind":"enum","unknown":"hex","values":{"1":"X-FACE","10":"XYA-CNR","11":"CAL","12":"Y-IN.","13":"Z-IN.","14":"C-FACE","15":"C-GRV","16":"C-STP","17":"Z-GRV","18":"Z-STP","19":"YZ-BORE","2":"Y-FACE","20":"YZ-BOSS","21":"YZth-CNR","22":"C-INCL","3":"Z-FACE","4":"X-GRV","5":"Y-GRV","6":"X-STP","7":"Y-STP","8":"BORE-XY","9":"XY-BOS"}},"253":{"kind":"enum","unknown":"hex","values":{"0":"CW","1":"CCW","2":"NEAR DIR."}},"255":{"kind":"int"},"256":{"kind":"int"},"259":{"kind":"enum","unknown":"hex","values":{"1":"R1","2":"R1-F2","3":"R1-F2-F3","4":"F1","5":"F1-F2"}},"26":{"kind":"enum","unknown":"blank","values":{"1":"*"}},"261":{"kind":"enum","unknown":"hex","values":{"0":"***P-16","1":"G54","10":"D","100":"G54.1P84","101":"G54.1P85","102":"G54.1P86","103":"G54.1P87","104":"G54.1P88","105":"G54.1P89","106":"G54.1P90","107":"G54.1P91","108":"G54.1P92","109":"G54.1P93","11":"E","110":"G54.1P94","111":"G54.1P95","112":"G54.1P96","113":"G54.1P97","114":"G54.1P98","115":"G54.1P99","116":"G54.1P100","117":"G54.1P101","118":"G54.1P102","119":"G54.1P103","12":"F","120":"G54.1P104","121":"G54.1P105","122":"G54.1P106","123":"G54.1P107","124":"G54.1P108","125":"G54.1P109","126":"G54.1P110","127":"G54.1P111","128":"G54.1P112","129":"G54.1P113","13":"G","130":"G54.1P114","131":"G54.1P115","132":"G54.1P116","133":"G54.1P117","134":"G54.1P118","135":"G54.1P119","136":"G54.1P120","137":"G54.1P121","138":"G54.1P122","139":"G54.1P123","14":"H","140":"G54.1P124","141":"G54.1P125","142":"G54.1P126","143":"G54.1P127","144":"G54.1P128","145":"G54.1P129","146":"G54.1P130","147":"G54.1P131","148":"G54.1P132","149":"G54.1P133","15":"J","150":"G54.1P134","151":"G54.1P135","152":"G54.1P136","153":"G54.1P137","154":"G54.1P138","155":"G54.1P139","156":"G54.1P140","157":"G54.1P141","158":"G54.1P142","159":"G54.1P143","16":"K","160":"G54.1P144","161":"G54.1P145","162":"G54.1P146","163":"G54.1P147","164":"G54.1P148","165":"G54.1P149","166":"G54.1P150","167":"G54.1P151","168":"G54.1P152","169":"G54.1P153","17":"G54.1P1","170":"G54.1P154","171":"G54.1P155","172":"G54.1P156","173":"G54.1P157","174":"G54.1P158","175":"G54.1P159","176":"G54.1P160","177":"G54.1P161","178":"G54.1P162","179":"G54.1P163","18":"G54.1P2","180":"G54.1P164","181":"G54.1P165","182":"G54.1P166","183":"G54.1P167","184":"G54.1P168","185":"G54.1P169","186":"G54.1P170","187":"G54.1P171","188":"G54.1P172","189":"G54.1P173","19":"G54.1P3","190":"G54.1P174","191":"G54.1P175","192":"G54.1P176","193":"G54.1P177","194":"G54.1P178","195":"G54.1P179","196":"G54.1P180","197":"G54.1P181","198":"G54.1P182","199":"G54.1P183","2":"G55","20":"G54.1P4","200":"G54.1P184","201":"G54.1P185","202":"G54.1P186","203":"G54.1P187","204":"G54.1P188","205":"G54.1P189","206":"G54.1P190","207":"G54.1P191","208":"G54.1P192","209":"G54.1P193","21":"G54.1P5","210":"G54.1P194","211":"G54.1P195","212":"G54.1P196","213":"G54.1P197","214":"G54.1P198","215":"G54.1P199","216":"G54.1P200","217":"G54.1P201","218":"G54.1P202","219":"G54.1P203","22":"G54.1P6","220":"G54.1P204","221":"G54.1P205","222":"G54.1P206","223":"G54.1P207","224":"G54.1P208","225":"G54.1P209","226":"G54.1P210","227":"G54.1P211","228":"G54.1P212","229":"G54.1P213","23":"G54.1P7","230":"G54.1P214","231":"G54.1P215","232":"G54.1P216","233":"G54.1P217","234":"G54.1P218","235":"G54.1P219","236":"G54.1P220","237":"G54.1P221","238":"G54.1P222","239":"G54.1P223","24":"G54.1P8","240":"G54.1P224","241":"G54.1P225","242":"G54.1P226","243":"G54.1P227","244":"G54.1P228","245":"G54.1P229","246":"G54.1P230","247":"G54.1P231","248":"G54.1P232","249":"G54.1P233","25":"G54.1P9","250":"G54.1P234","251":"G54.1P235","252":"G54.1P236","253":"G54.1P237","254":"G54.1P238","255":"G54.1P239","256":"G54.1P240","257":"G54.1P241","258":"G54.1P242","259":"G54.1P243","26":"G54.1P10","260":"G54.1P244","261":"G54.1P245","262":"G54.1P246","263":"G54.1P247","264":"G54.1P248","265":"G54.1P249","266":"G54.1P250","267":"G54.1P251","268":"G54.1P252","269":"G54.1P253","27":"G54.1P11","270":"G54.1P254","271":"G54.1P255","272":"G54.1P256","273":"G54.1P257","274":"G54.1P258","275":"G54.1P259","276":"G54.1P260","277":"G54.1P261","278":"G54.1P262","279":"G54.1P263","28":"G54.1P12","280":"G54.1P264","281":"G54.1P265","282":"G54.1P266","283":"G54.1P267","284":"G54.1P268","285":"G54.1P269","286":"G54.1P270","287":"G54.1P271","288":"G54.1P272","289":"G54.1P273","29":"G54.1P13","290":"G54.1P274","291":"G54.1P275","292":"G54.1P276","293":"G54.1P277","294":"G54.1P278","295":"G54.1P279","296":"G54.1P280","297":"G54.1P281","298":"G54.1P282","299":"G54.1P283","3":"G56","30":"G54.1P14","300":"G54.1P284","301":"G54.1P285","302":"G54.1P286","303":"G54.1P287","304":"G54.1P288","305":"G54.1P289","306":"G54.1P290","307":"G54.1P291","308":"G54.1P292","309":"G54.1P293","31":"G54.1P15","310":"G54.1P294","311":"G54.1P295","312":"G54.1P296","313":"G54.1P297","314":"G54.1P298","315":"G54.1P299","316":"G54.1P300","317":"G54.1P301","32":"G54.1P16","33":"G54.1P17","34":"G54.1P18","35":"G54.1P19","36":"G54.1P20","37":"G54.1P21","38":"G54.1P22","39":"G54.1P23","4":"G57","40":"G54.1P24","41":"G54.1P25","42":"G54.1P26","43":"G54.1P27","44":"G54.1P28","45":"G54.1P29","46":"G54.1P30","47":"G54.1P31","48":"G54.1P32","49":"G54.1P33","5":"G58","50":"G54.1P34","51":"G54.1P35","52":"G54.1P36","53":"G54.1P37","54":"G54.1P38","55":"G54.1P39","56":"G54.1P40","57":"G54.1P41","58":"G54.1P42","59":"G54.1P43","6":"G59","60":"G54.1P44","61":"G54.1P45","62":"G54.1P46","63":"G54.1P47","64":"G54.1P48","65":"G54.1P49","66":"G54.1P50","67":"G54.1P51","68":"G54.1P52","69":"G54.1P53","7":"A","70":"G54.1P54","71":"G54.1P55","72":"G54.1P56","73":"G54.1P57","74":"G54.1P58","75":"G54.1P59","76":"G54.1P60","77":"G54.1P61","78":"G54.1P62","79":"G54.1P63","8":"B","80":"G54.1P64","81":"G54.1P65","82":"G54.1P66","83":"G54.1P67","84":"G54.1P68","85":"G54.1P69","86":"G54.1P70","87":"G54.1P71","88":"G54.1P72","89":"G54.1P73","9":"C","90":"G54.1P74","91":"G54.1P75","92":"G54.1P76","93":"G54.1P77","94":"G54.1P78","95":"G54.1P79","96":"G54.1P80","97":"G54.1P81","98":"G54.1P82","99":"G54.1P83"}},"262":{"inch":{"dec":4,"prefix":"R ","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"R ","scale":0.0001}},"264":{"kind":"enum","unknown":"blank","values":{"1":"A","10":"K","100":"!*","101":"!*","102":"!*","103":"!*","104":"!*","105":"!*","106":"!*","107":"!*","108":"!*","109":"!*","11":"L","110":"!*","111":"!*","112":"!*","113":"!*","114":"!*","115":"!*","116":"!*","117":"!*","118":"!*","119":"!*","12":"M","120":"!*","121":"!*","122":"!*","123":"!*","124":"!*","125":"!*","126":"!*","127":"!*","129":"a","13":"N","130":"b","131":"c","132":"d","133":"e","134":"f","135":"g","136":"h","137":"j","138":"k","139":"l","14":"P","140":"m","141":"n","142":"p","143":"q","144":"r","145":"s","146":"t","147":"u","148":"v","149":"w","15":"Q","150":"x","151":"y","152":"z","153":"*","154":"*","155":"*","156":"*","157":"*","158":"*","159":"*","16":"R","161":"a","162":"b","163":"c","164":"d","165":"e","166":"f","167":"g","168":"h","169":"j","17":"S","170":"k","171":"l","172":"m","173":"n","174":"p","175":"q","176":"r","177":"s","178":"t","179":"u","18":"T","180":"v","181":"w","182":"x","183":"y","184":"z","185":"*","186":"*","187":"*","188":"*","189":"*","19":"U","190":"*","191":"*","192":"*","193":"*","194":"*","195":"*","196":"*","197":"*","198":"*","199":"*","2":"B","20":"V","200":"*","201":"*","202":"*","203":"*","204":"*","205":"*","206":"*","207":"*","208":"*","209":"*","21":"W","210":"*","211":"*","212":"*","213":"*","214":"*","215":"*","216":"*","217":"*","218":"*","219":"*","22":"X","220":"*","221":"*","222":"*","223":"*","224":"*","225":"*","226":"*","227":"*","228":"*","229":"*","23":"Y","230":"*","231":"*","232":"*","233":"*","234":"*","235":"*","236":"*","237":"*","238":"*","239":"*","24":"Z","240":"*","241":"*","242":"*","243":"*","244":"*","245":"*","246":"*","247":"*","248":"*","249":"*","25":"*","250":"*","251":"*","252":"*","253":"*","254":"*","255":"*","26":"*","27":"*","28":"*","29":"*","3":"C","30":"*","31":"*","32":"!","33":"!A","34":"!B","35":"!C","36":"!D","37":"!E","38":"!F","39":"!G","4":"D","40":"!H","41":"!J","42":"!K","43":"!L","44":"!M","45":"!N","46":"!P","47":"!Q","48":"!R","49":"!S","5":"E","50":"!T","51":"!U","52":"!V","53":"!W","54":"!X","55":"!Y","56":"!Z","57":"!*","58":"!*","59":"!*","6":"F","60":"!*","61":"!*","62":"!*","63":"!*","64":"*","65":"*","66":"*","67":"*","68":"*","69":"*","7":"G","70":"*","71":"*","72":"*","73":"*","74":"*","75":"*","76":"*","77":"*","78":"*","79":"*","8":"H","80":"*","81":"*","82":"*","83":"*","84":"*","85":"*","86":"*","87":"*","88":"*","89":"*","9":"J","90":"*","91":"*","92":"*","93":"*","94":"*","95":"*","96":"!*","97":"!*","98":"!*","99":"!*"}},"265":{"kind":"enum","unknown":"blank","values":{"1":"A","10":"K","100":"*","101":"*","102":"*","103":"*","104":"*","105":"*","106":"*","107":"*","108":"*","109":"*","11":"L","110":"*","111":"*","112":"*","113":"*","114":"*","115":"*","116":"*","117":"*","118":"*","119":"*","12":"M","120":"*","121":"*","122":"*","123":"*","124":"*","125":"*","126":"*","127":"*","128":"*","129":"*A","13":"N","130":"*B","131":"*C","132":"*D","133":"*E","134":"*F","135":"*G","136":"*H","137":"*J","138":"k","139":"l","14":"P","140":"m","141":"n","142":"p","143":"q","144":"r","145":"s","146":"t","147":"u","148":"v","149":"w","15":"Q","150":"x","151":"y","152":"z","153":"*","154":"*","155":"*","156":"*","157":"*","158":"*","159":"*","16":"R","160":"*","161":"*","162":"*","163":"*","164":"*","165":"*","166":"*","167":"*","168":"*","169":"*","17":"S","170":"*","171":"*","172":"*","173":"*","174":"*","175":"*","176":"*","177":"*","178":"*","179":"*","18":"T","180":"*","181":"*","182":"*","183":"*","184":"*","185":"*","186":"*","187":"*","188":"*","189":"*","19":"U","190":"*","191":"*","192":"*","193":"*","194":"*","195":"*","196":"*","197":"*","198":"*","199":"*","2":"B","20":"V","200":"*","201":"*","202":"*","203":"*","204":"*","205":"*","206":"*","207":"*","208":"*","209":"*","21":"W","210":"*","211":"*","212":"*","213":"*","214":"*","215":"*","216":"*","217":"*","218":"*","219":"*","22":"X","220":"*","221":"*","222":"*","223":"*","224":"*","225":"*","226":"*","227":"*","228":"*","229":"*","23":"Y","230":"*","231":"*","232":"*","233":"*","234":"*","235":"*","236":"*","237":"*","238":"*","239":"*","24":"Z","240":"*","241":"*","242":"*","243":"*","244":"*","245":"*","246":"*","247":"*","248":"*","249":"*","25":"*","250":"*","251":"*","252":"*","253":"*","254":"*","255":"*","26":"*","27":"*","28":"*","29":"*","3":"C","30":"*","31":"*","32":"*","33":"!A","34":"!B","35":"!C","36":"!D","37":"!E","38":"!F","39":"!G","4":"D","40":"!H","41":"!J","42":"!K","43":"!L","44":"!M","45":"!N","46":"!P","47":"!Q","48":"!R","49":"!S","5":"E","50":"!T","51":"!U","52":"!V","53":"!W","54":"!X","55":"!Y","56":"!Z","57":"*","58":"*","59":"*","6":"F","60":"*","61":"*","62":"*","63":"*","64":"*","65":"*","66":"*","67":"*","68":"*","69":"*","7":"G","70":"*","71":"*","72":"*","73":"*","74":"*","75":"*","76":"*","77":"*","78":"*","79":"*","8":"H","80":"*","81":"*","82":"*","83":"*","84":"*","85":"*","86":"*","87":"*","88":"*","89":"*","9":"J","90":"*","91":"*","92":"*","93":"*","94":"*","95":"*","96":"*","97":"*","98":"*","99":"*"}},"268":{"kind":"enum","unknown":"qhex","values":{"0":"","1":"<-R","2":"R->","3":"<-L","4":"L->","5":"<--","6":"-->","7":"<-AN","8":"AN->"}},"271":{"kind":"enum","unknown":"hex","values":{}},"272":{"kind":"enum","unknown":"hex","values":{"0":"R","1":"R","10":"F","100":"R","101":"R","102":"F","103":"F","104":"R","105":"R","106":"F","107":"F","108":"R","109":"R","11":"F","110":"F","111":"F","112":"R","113":"R","114":"F","115":"F","116":"R","117":"R","118":"F","119":"F","12":"R","120":"R","121":"R","122":"F","123":"F","124":"R","125":"R","126":"F","127":"F","128":"R","129":"R","13":"R","130":"F","131":"F","132":"R","133":"R","134":"F","135":"F","136":"R","137":"R","138":"F","139":"F","14":"F","140":"R","141":"R","142":"F","143":"F","144":"R","145":"R","146":"F","147":"F","148":"R","149":"R","150":"F","151":"F","152":"R","153":"R","154":"F","155":"F","156":"R","157":"R","158":"F","159":"F","16":"R","160":"R","161":"R","162":"F","163":"F","164":"R","165":"R","166":"F","167":"F","168":"R","169":"R","17":"R","170":"F","171":"F","172":"R","173":"R","174":"F","175":"F","176":"R","177":"R","178":"F","179":"F","18":"F","180":"R","181":"R","182":"F","183":"F","184":"R","185":"R","186":"F","187":"F","188":"R","189":"R","19":"F","190":"F","191":"F","192":"R","193":"R","194":"F","195":"F","196":"R","197":"R","198":"F","199":"F","2":"F","20":"R","200":"R","201":"R","202":"F","203":"F","204":"R","205":"R","206":"F","207":"F","208":"R","209":"R","21":"R","210":"F","211":"F","212":"R","213":"R","214":"F","215":"F","216":"R","217":"R","218":"F","219":"F","22":"F","220":"R","221":"R","222":"F","223":"F","224":"R","225":"R","226":"F","227":"F","228":"R","229":"R","23":"F","230":"F","231":"F","232":"R","233":"R","234":"F","235":"F","236":"R","237":"R","238":"F","239":"F","24":"R","240":"R","241":"R","242":"F","243":"F","244":"R","245":"R","246":"F","247":"F","248":"R","249":"R","25":"R","250":"F","251":"F","252":"R","253":"R","254":"F","255":"F","26":"F","27":"F","28":"R","29":"R","3":"F","30":"F","31":"F","32":"R","33":"R","34":"F","35":"F","36":"R","37":"R","38":"F","39":"F","4":"R","40":"R","41":"R","42":"F","43":"F","44":"R","45":"R","46":"F","47":"F","48":"R","49":"R","5":"R","50":"F","51":"F","52":"R","53":"R","54":"F","55":"F","56":"R","57":"R","58":"F","59":"F","6":"F","60":"R","61":"R","62":"F","63":"F","64":"R","65":"R","66":"F","67":"F","68":"R","69":"R","7":"F","70":"F","71":"F","72":"R","73":"R","74":"F","75":"F","76":"R","77":"R","78":"F","79":"F","8":"R","80":"R","81":"R","82":"F","83":"F","84":"R","85":"R","86":"F","87":"F","88":"R","89":"R","9":"R","90":"F","91":"F","92":"R","93":"R","94":"F","95":"F","96":"R","97":"R","98":"F","99":"F"}},"274":{"kind":"enum","unknown":"hex","values":{"1":"FACE","2":"CYLIND","3":"SLANT","4":"FACE Y"}},"277":{"kind":"enum","unknown":"hex","values":{"1":"X-BI","16":"CW","17":"CCW","18":"CW CLN","19":"CCW CLN","2":"Y-BI","3":"X-UN","32":"IPMCW","33":"IPMCCW","4":"Y-UN","5":"X-SH","6":"Y-SH","7":"XB-AS","8":"YB-AS"}},"278":{"kind":"enum","unknown":"hex","values":{"1":"//-1","16":"*BI","17":"*BN","18":"*YBN","2":"J-1","3":"//-2","4":"J-2","5":"XBI","6":"YBI","7":"XBN","8":"YBN","9":"*XBI"}},"279":{"kind":"enum","unknown":"hex","values":{"0":"B","1":"B","10":"B","100":"B","101":"B","102":"B","103":"B","104":"B","105":"B","106":"B","107":"B","108":"B","109":"B","110":"B","111":"B","112":"B","113":"B","114":"B","115":"B","116":"B","117":"B","118":"B","119":"B","12":"B","120":"B","121":"B","122":"B","123":"B","124":"B","125":"B","126":"B","127":"B","128":"M","129":"M","13":"B","130":"M","131":"M","132":"M","133":"M","134":"M","135":"M","136":"M","137":"M","138":"M","139":"M","14":"B","140":"M","141":"M","142":"M","143":"M","144":"M","145":"M","146":"M","147":"M","148":"M","149":"M","15":"B","150":"M","151":"M","152":"M","153":"M","154":"M","155":"M","156":"M","157":"M","158":"M","159":"M","16":"B","160":"M","161":"M","162":"M","163":"M","164":"M","165":"M","166":"M","167":"M","168":"M","169":"M","17":"B","170":"M","171":"M","172":"M","173":"M","174":"M","175":"M","176":"M","177":"M","178":"M","179":"M","18":"B","180":"M","181":"M","182":"M","183":"M","184":"M","185":"M","186":"M","187":"M","188":"M","189":"M","19":"B","190":"M","191":"M","192":"M","193":"M","194":"M","195":"M","196":"M","197":"M","198":"M","199":"M","2":"B","20":"B","200":"M","201":"M","202":"M","203":"M","204":"M","205":"M","206":"M","207":"M","208":"M","209":"M","21":"B","210":"M","211":"M","212":"M","213":"M","214":"M","215":"M","216":"M","217":"M","218":"M","219":"M","22":"B","220":"M","221":"M","222":"M","223":"M","224":"M","225":"M","226":"M","227":"M","228":"M","229":"M","23":"B","230":"M","231":"M","232":"M","233":"M","234":"M","235":"M","236":"M","237":"M","238":"M","239":"M","24":"B","240":"M","241":"M","242":"M","243":"M","244":"M","245":"M","246":"M","247":"M","248":"M","249":"M","25":"B","250":"M","251":"M","252":"M","253":"M","254":"M","255":"M","26":"B","27":"B","28":"B","29":"B","3":"B","30":"B","31":"B","32":"B","33":"B","34":"B","35":"B","36":"B","37":"B","38":"B","39":"B","4":"B","40":"B","41":"B","42":"B","43":"B","44":"B","45":"B","46":"B","47":"B","48":"B","49":"B","5":"B","50":"B","51":"B","52":"B","53":"B","54":"B","55":"B","56":"B","57":"B","58":"B","59":"B","6":"B","60":"B","61":"B","62":"B","63":"B","64":"B","65":"B","66":"B","67":"B","68":"B","69":"B","7":"B","70":"B","71":"B","72":"B","73":"B","74":"B","75":"B","76":"B","77":"B","78":"B","79":"B","8":"B","80":"B","81":"B","82":"B","83":"B","84":"B","85":"B","86":"B","87":"B","88":"B","89":"B","9":"B","90":"B","91":"B","92":"B","93":"B","94":"B","95":"B","96":"B","97":"B","98":"B","99":"B"}},"286":{"inch":{"dec":4,"prefix":"","scale":1e-05},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.0001}},"287":{"kind":"ctx"},"288":{"inch":{"dec":2,"prefix":"","scale":3.937007874015748e-08},"kind":"num","metric":{"dec":1,"div":1000000,"prefix":"","scale":1e-06}},"293":{"kind":"blank"},"298":{"kind":"enum","unknown":"blank","values":{"100":"d","101":"e","102":"f","103":"g","104":"h","105":"i","106":"j","107":"k","108":"l","109":"m","110":"n","111":"o","112":"p","113":"q","114":"r","115":"s","116":"t","117":"u","118":"v","119":"w","120":"x","121":"y","122":"z","123":"{","124":"|","125":"}","126":"~","127":"\u007f","128":"\u0080","129":"\u0081","130":"\u0082","131":"\u0083","132":"\u0084","134":"\u0086","135":"\u0087","136":"\u0088","137":"\u0089","138":"\u008a","139":"\u008b","140":"\u008c","141":"\u008d","142":"\u008e","143":"\u008f","144":"\u0090","145":"\u0091","146":"\u0092","147":"\u0093","148":"\u0094","149":"\u0095","150":"\u0096","151":"\u0097","152":"\u0098","153":"\u0099","154":"\u009a","155":"\u009b","156":"\u009c","157":"\u009d","158":"\u009e","159":"\u009f","161":"\u00a1","162":"\u00a2","163":"\u00a3","164":"\u00a4","165":"\u00a5","166":"\u00a6","167":"\u00a7","168":"\u00a8","169":"\u00a9","170":"\u00aa","171":"\u00ab","172":"\u00ac","173":"\u00ad","174":"\u00ae","175":"\u00af","176":"\u00b0","177":"\u00b1","178":"\u00b2","179":"\u00b3","180":"\u00b4","181":"\u00b5","182":"\u00b6","183":"\u00b7","184":"\u00b8","185":"\u00b9","186":"\u00ba","187":"\u00bb","188":"\u00bc","189":"\u00bd","190":"\u00be","191":"\u00bf","192":"\u00c0","193":"\u00c1","194":"\u00c2","195":"\u00c3","196":"\u00c4","197":"\u00c5","198":"\u00c6","199":"\u00c7","200":"\u00c8","201":"\u00c9","202":"\u00ca","203":"\u00cb","204":"\u00cc","205":"\u00cd","206":"\u00ce","207":"\u00cf","208":"\u00d0","209":"\u00d1","210":"\u00d2","211":"\u00d3","212":"\u00d4","213":"\u00d5","214":"\u00d6","215":"\u00d7","216":"\u00d8","217":"\u00d9","218":"\u00da","219":"\u00db","220":"\u00dc","221":"\u00dd","222":"\u00de","223":"\u00df","224":"\u00e0","225":"\u00e1","226":"\u00e2","227":"\u00e3","228":"\u00e4","229":"\u00e5","230":"\u00e6","231":"\u00e7","232":"\u00e8","233":"\u00e9","234":"\u00ea","235":"\u00eb","236":"\u00ec","237":"\u00ed","238":"\u00ee","239":"\u00ef","240":"\u00f0","241":"\u00f1","242":"\u00f2","243":"\u00f3","244":"\u00f4","245":"\u00f5","246":"\u00f6","247":"\u00f7","248":"\u00f8","249":"\u00f9","250":"\u00fa","251":"\u00fb","252":"\u00fc","253":"\u00fd","254":"\u00fe","255":"\u00ff","33":"!","34":"\"","35":"#","36":"$","37":"%","38":"&","39":"'","40":"(","41":")","42":"*","43":"+","44":",","45":"-","46":".","47":"/","48":"0","49":"1","50":"2","51":"3","52":"4","53":"5","54":"6","55":"7","56":"8","57":"9","58":":","59":";","60":"<","61":"=","62":">","63":"?","64":"@","65":"A","66":"B","67":"C","68":"D","69":"E","70":"F","71":"G","72":"H","73":"I","74":"J","75":"K","76":"L","77":"M","78":"N","79":"O","80":"P","81":"Q","82":"R","83":"S","84":"T","85":"U","86":"V","87":"W","88":"X","89":"Y","90":"Z","91":"[","92":"\\","93":"]","94":"^","95":"_","96":"`","97":"a","98":"b","99":"c"}},"30":{"kind":"int"},"301":{"kind":"text"},"303":{"kind":"text"},"304":{"kind":"text"},"305":{"kind":"text"},"31":{"kind":"int"},"312":{"kind":"enum","unknown":"qhex","values":{"0":"YES","1":"NO"}},"313":{"kind":"enum","unknown":"qhex","values":{"0":"YES","1":"NO"}},"314":{"kind":"enum","unknown":"qhex","values":{"0":"DIAMETER","1":"LENGTH"}},"315":{"kind":"enum","unknown":"blank","values":{}},"317":{"kind":"enum","unknown":"blank","values":{"0":"OPEN","1":"CLOSED","10":"OPEN","100":"OPEN","101":"CLOSED","102":"OPEN","103":"CLOSED","104":"OPEN","105":"CLOSED","106":"OPEN","107":"CLOSED","108":"OPEN","109":"CLOSED","11":"CLOSED","110":"OPEN","111":"CLOSED","112":"OPEN","113":"CLOSED","114":"OPEN","115":"CLOSED","116":"OPEN","117":"CLOSED","118":"OPEN","119":"CLOSED","12":"OPEN","120":"OPEN","121":"CLOSED","122":"OPEN","123":"CLOSED","124":"OPEN","125":"CLOSED","126":"OPEN","127":"CLOSED","128":"OPEN","129":"CLOSED","13":"CLOSED","130":"OPEN","131":"CLOSED","132":"OPEN","133":"CLOSED","134":"OPEN","135":"CLOSED","136":"OPEN","137":"CLOSED","138":"OPEN","139":"CLOSED","14":"OPEN","140":"OPEN","141":"CLOSED","142":"OPEN","143":"CLOSED","144":"OPEN","145":"CLOSED","146":"OPEN","147":"CLOSED","148":"OPEN","149":"CLOSED","15":"CLOSED","150":"OPEN","151":"CLOSED","152":"OPEN","153":"CLOSED","154":"OPEN","155":"CLOSED","156":"OPEN","157":"CLOSED","158":"OPEN","159":"CLOSED","16":"OPEN","160":"OPEN","161":"CLOSED","162":"OPEN","163":"CLOSED","164":"OPEN","165":"CLOSED","166":"OPEN","167":"CLOSED","168":"OPEN","169":"CLOSED","17":"CLOSED","170":"OPEN","171":"CLOSED","172":"OPEN","173":"CLOSED","174":"OPEN","175":"CLOSED","176":"OPEN","177":"CLOSED","178":"OPEN","179":"CLOSED","18":"OPEN","180":"OPEN","181":"CLOSED","182":"OPEN","183":"CLOSED","184":"OPEN","185":"CLOSED","186":"OPEN","187":"CLOSED","188":"OPEN","189":"CLOSED","19":"CLOSED","190":"OPEN","191":"CLOSED","192":"OPEN","193":"CLOSED","194":"OPEN","195":"CLOSED","196":"OPEN","197":"CLOSED","198":"OPEN","199":"CLOSED","2":"OPEN","20":"OPEN","200":"OPEN","201":"CLOSED","202":"OPEN","203":"CLOSED","204":"OPEN","205":"CLOSED","206":"OPEN","207":"CLOSED","208":"OPEN","209":"CLOSED","21":"CLOSED","210":"OPEN","211":"CLOSED","212":"OPEN","213":"CLOSED","214":"OPEN","215":"CLOSED","216":"OPEN","217":"CLOSED","218":"OPEN","219":"CLOSED","22":"OPEN","220":"OPEN","221":"CLOSED","222":"OPEN","223":"CLOSED","224":"OPEN","225":"CLOSED","226":"OPEN","227":"CLOSED","228":"OPEN","229":"CLOSED","23":"CLOSED","230":"OPEN","231":"CLOSED","232":"OPEN","233":"CLOSED","234":"OPEN","235":"CLOSED","236":"OPEN","237":"CLOSED","238":"OPEN","239":"CLOSED","24":"OPEN","240":"OPEN","241":"CLOSED","242":"OPEN","243":"CLOSED","244":"OPEN","245":"CLOSED","246":"OPEN","247":"CLOSED","248":"OPEN","249":"CLOSED","25":"CLOSED","250":"OPEN","251":"CLOSED","252":"OPEN","253":"CLOSED","254":"OPEN","255":"CLOSED","26":"OPEN","27":"CLOSED","28":"OPEN","29":"CLOSED","3":"CLOSED","30":"OPEN","31":"CLOSED","32":"OPEN","33":"CLOSED","34":"OPEN","35":"CLOSED","36":"OPEN","37":"CLOSED","38":"OPEN","39":"CLOSED","4":"OPEN","40":"OPEN","41":"CLOSED","42":"OPEN","43":"CLOSED","44":"OPEN","45":"CLOSED","46":"OPEN","47":"CLOSED","48":"OPEN","49":"CLOSED","5":"CLOSED","50":"OPEN","51":"CLOSED","52":"OPEN","53":"CLOSED","54":"OPEN","55":"CLOSED","56":"OPEN","57":"CLOSED","58":"OPEN","59":"CLOSED","6":"OPEN","60":"OPEN","61":"CLOSED","62":"OPEN","63":"CLOSED","64":"OPEN","65":"CLOSED","66":"OPEN","67":"CLOSED","68":"OPEN","69":"CLOSED","7":"CLOSED","70":"OPEN","71":"CLOSED","72":"OPEN","73":"CLOSED","74":"OPEN","75":"CLOSED","76":"OPEN","77":"CLOSED","78":"OPEN","79":"CLOSED","8":"OPEN","80":"OPEN","81":"CLOSED","82":"OPEN","83":"CLOSED","84":"OPEN","85":"CLOSED","86":"OPEN","87":"CLOSED","88":"OPEN","89":"CLOSED","9":"CLOSED","90":"OPEN","91":"CLOSED","92":"OPEN","93":"CLOSED","94":"OPEN","95":"CLOSED","96":"OPEN","97":"CLOSED","98":"OPEN","99":"CLOSED"}},"318":{"kind":"enum","unknown":"blank","values":{"0":"OPEN","1":"OPEN","10":"CLOSED","100":"OPEN","101":"OPEN","102":"CLOSED","103":"CLOSED","104":"OPEN","105":"OPEN","106":"CLOSED","107":"CLOSED","108":"OPEN","109":"OPEN","11":"CLOSED","110":"CLOSED","111":"CLOSED","112":"OPEN","113":"OPEN","114":"CLOSED","115":"CLOSED","116":"OPEN","117":"OPEN","118":"CLOSED","119":"CLOSED","12":"OPEN","120":"OPEN","121":"OPEN","122":"CLOSED","123":"CLOSED","124":"OPEN","125":"OPEN","126":"CLOSED","127":"CLOSED","128":"OPEN","129":"OPEN","13":"OPEN","130":"CLOSED","131":"CLOSED","132":"OPEN","133":"OPEN","134":"CLOSED","135":"CLOSED","136":"OPEN","137":"OPEN","138":"CLOSED","139":"CLOSED","14":"CLOSED","140":"OPEN","141":"OPEN","142":"CLOSED","143":"CLOSED","144":"OPEN","145":"OPEN","146":"CLOSED","147":"CLOSED","148":"OPEN","149":"OPEN","15":"CLOSED","150":"CLOSED","151":"CLOSED","152":"OPEN","153":"OPEN","154":"CLOSED","155":"CLOSED","156":"OPEN","157":"OPEN","158":"CLOSED","159":"CLOSED","16":"OPEN","160":"OPEN","161":"OPEN","162":"CLOSED","163":"CLOSED","164":"OPEN","165":"OPEN","166":"CLOSED","167":"CLOSED","168":"OPEN","169":"OPEN","17":"OPEN","170":"CLOSED","171":"CLOSED","172":"OPEN","173":"OPEN","174":"CLOSED","175":"CLOSED","176":"OPEN","177":"OPEN","178":"CLOSED","179":"CLOSED","18":"CLOSED","180":"OPEN","181":"OPEN","182":"CLOSED","183":"CLOSED","184":"OPEN","185":"OPEN","186":"CLOSED","187":"CLOSED","188":"OPEN","189":"OPEN","19":"CLOSED","190":"CLOSED","191":"CLOSED","192":"OPEN","193":"OPEN","194":"CLOSED","195":"CLOSED","196":"OPEN","197":"OPEN","198":"CLOSED","199":"CLOSED","2":"CLOSED","20":"OPEN","200":"OPEN","201":"OPEN","202":"CLOSED","203":"CLOSED","204":"OPEN","205":"OPEN","206":"CLOSED","207":"CLOSED","208":"OPEN","209":"OPEN","21":"OPEN","210":"CLOSED","211":"CLOSED","212":"OPEN","213":"OPEN","214":"CLOSED","215":"CLOSED","216":"OPEN","217":"OPEN","218":"CLOSED","219":"CLOSED","22":"CLOSED","220":"OPEN","221":"OPEN","222":"CLOSED","223":"CLOSED","224":"OPEN","225":"OPEN","226":"CLOSED","227":"CLOSED","228":"OPEN","229":"OPEN","23":"CLOSED","230":"CLOSED","231":"CLOSED","232":"OPEN","233":"OPEN","234":"CLOSED","235":"CLOSED","236":"OPEN","237":"OPEN","238":"CLOSED","239":"CLOSED","24":"OPEN","240":"OPEN","241":"OPEN","242":"CLOSED","243":"CLOSED","244":"OPEN","245":"OPEN","246":"CLOSED","247":"CLOSED","248":"OPEN","249":"OPEN","25":"OPEN","250":"CLOSED","251":"CLOSED","252":"OPEN","253":"OPEN","254":"CLOSED","255":"CLOSED","26":"CLOSED","27":"CLOSED","28":"OPEN","29":"OPEN","3":"CLOSED","30":"CLOSED","31":"CLOSED","32":"OPEN","33":"OPEN","34":"CLOSED","35":"CLOSED","36":"OPEN","37":"OPEN","38":"CLOSED","39":"CLOSED","4":"OPEN","40":"OPEN","41":"OPEN","42":"CLOSED","43":"CLOSED","44":"OPEN","45":"OPEN","46":"CLOSED","47":"CLOSED","48":"OPEN","49":"OPEN","5":"OPEN","50":"CLOSED","51":"CLOSED","52":"OPEN","53":"OPEN","54":"CLOSED","55":"CLOSED","56":"OPEN","57":"OPEN","58":"CLOSED","59":"CLOSED","6":"CLOSED","60":"OPEN","61":"OPEN","62":"CLOSED","63":"CLOSED","64":"OPEN","65":"OPEN","66":"CLOSED","67":"CLOSED","68":"OPEN","69":"OPEN","7":"CLOSED","70":"CLOSED","71":"CLOSED","72":"OPEN","73":"OPEN","74":"CLOSED","75":"CLOSED","76":"OPEN","77":"OPEN","78":"CLOSED","79":"CLOSED","8":"OPEN","80":"OPEN","81":"OPEN","82":"CLOSED","83":"CLOSED","84":"OPEN","85":"OPEN","86":"CLOSED","87":"CLOSED","88":"OPEN","89":"OPEN","9":"OPEN","90":"CLOSED","91":"CLOSED","92":"OPEN","93":"OPEN","94":"CLOSED","95":"CLOSED","96":"OPEN","97":"OPEN","98":"CLOSED","99":"CLOSED"}},"319":{"kind":"enum","unknown":"qhex","values":{"0":"RETURN","1":"NO-RETURN","11":"USER-1","12":"USER-2","5":"HOME","6":"FIXED PT"}},"32":{"kind":"int"},"320":{"kind":"enum","unknown":"qhex","values":{"0":"NO MOVE","1":"TOOL CHG","2":"HOME","3":"USER"}},"321":{"kind":"enum","unknown":"qhex","values":{"0":"BEFORE TRANS.","1":"AFTER TRANS."}},"322":{"kind":"enum","unknown":"qhex","values":{"0":"FLOAT","1":"FIX"}},"34":{"kind":"int"},"37":{"kind":"int"},"38":{"kind":"int"},"40":{"kind":"enum","unknown":"qhex","values":{"49":"CTR-DR","50":"DRILL","51":"REAMER","52":"TAP-MT","53":"TAP-UN","54":"TAP-PIPE-PT","55":"TAP-PIPE-PF","56":"TAP-PIPE-PS","57":"TAP OTHR","58":"BSP-FC","59":"B-BAR","60":"BB-BAR","61":"CHF-C","62":"F-MILL","63":"E-MILL","64":"OTHER","65":"CHP-VAC","66":"PROBE","67":"BE-MILL"}},"43":{"kind":"enum","unknown":"qhex","values":{"0":"0","1":"CTR-DR","10":"BSP-FC","11":"B-BAR","12":"BB-BAR","13":"CHMF-M","14":"F-MILL","15":"E-MILL","16":"OTHER","17":"CHP-VAC","18":"PROBE","19":"BE-MILL","2":"DRILL","21":"AM TOOL","22":"BARREL","3":"REAMER","32":"***","33":"GENERAL","34":"GROOVE","35":"THREAD","36":"T-DRILL","37":"T.TAP","38":"T.TAP","39":"T.TAP","4":"TAP-MT","40":"T.TAP","41":"T.TAP","42":"T.TAP","43":"SPECIAL","44":"TOL SENS","5":"TAP-UN","6":"TAP-PIPE-PT","7":"TAP-PIPE-PF","8":"TAP-PIPE-PS","9":"TAP OTHR"}},"48":{"kind":"enum","unknown":"blank","values":{"0":"FWD","1":"REV","10":"REV","100":"REV","101":"REV","102":"REV","103":"REV","104":"REV","105":"REV","106":"REV","107":"REV","108":"REV","109":"REV","11":"REV","110":"REV","111":"REV","112":"REV","113":"REV","114":"REV","115":"REV","116":"REV","117":"REV","118":"REV","119":"REV","12":"REV","120":"REV","121":"REV","122":"REV","123":"REV","124":"REV","125":"REV","126":"REV","127":"REV","128":"REV","129":"REV","13":"REV","130":"REV","131":"REV","132":"REV","133":"REV","134":"REV","135":"REV","136":"REV","137":"REV","138":"REV","139":"REV","14":"REV","140":"REV","141":"REV","142":"REV","143":"REV","144":"REV","145":"REV","146":"REV","147":"REV","148":"REV","149":"REV","15":"REV","150":"REV","151":"REV","152":"REV","153":"REV","154":"REV","155":"REV","156":"REV","157":"REV","158":"REV","159":"REV","16":"REV","160":"REV","161":"REV","162":"REV","163":"REV","164":"REV","165":"REV","166":"REV","167":"REV","168":"REV","169":"REV","17":"REV","170":"REV","171":"REV","172":"REV","173":"REV","174":"REV","175":"REV","176":"REV","177":"REV","178":"REV","179":"REV","18":"REV","180":"REV","181":"REV","182":"REV","183":"REV","184":"REV","185":"REV","186":"REV","187":"REV","188":"REV","189":"REV","19":"REV","190":"REV","191":"REV","192":"REV","193":"REV","194":"REV","195":"REV","196":"REV","197":"REV","198":"REV","199":"REV","2":"REV","20":"REV","200":"REV","201":"REV","202":"REV","203":"REV","204":"REV","205":"REV","206":"REV","207":"REV","208":"REV","209":"REV","21":"REV","210":"REV","211":"REV","212":"REV","213":"REV","214":"REV","215":"REV","216":"REV","217":"REV","218":"REV","219":"REV","22":"REV","220":"REV","221":"REV","222":"REV","223":"REV","224":"REV","225":"REV","226":"REV","227":"REV","228":"REV","229":"REV","23":"REV","230":"REV","231":"REV","232":"REV","233":"REV","234":"REV","235":"REV","236":"REV","237":"REV","238":"REV","239":"REV","24":"REV","240":"REV","241":"REV","242":"REV","243":"REV","244":"REV","245":"REV","246":"REV","247":"REV","248":"REV","249":"REV","25":"REV","250":"REV","251":"REV","252":"REV","253":"REV","254":"REV","255":"REV","26":"REV","27":"REV","28":"REV","29":"REV","3":"REV","30":"REV","31":"REV","32":"REV","33":"REV","34":"REV","35":"REV","36":"REV","37":"REV","38":"REV","39":"REV","4":"REV","40":"REV","41":"REV","42":"REV","43":"REV","44":"REV","45":"REV","46":"REV","47":"REV","48":"REV","49":"REV","5":"REV","50":"REV","51":"REV","52":"REV","53":"REV","54":"REV","55":"REV","56":"REV","57":"REV","58":"REV","59":"REV","6":"REV","60":"REV","61":"REV","62":"REV","63":"REV","64":"REV","65":"REV","66":"REV","67":"REV","68":"REV","69":"REV","7":"REV","70":"REV","71":"REV","72":"REV","73":"REV","74":"REV","75":"REV","76":"REV","77":"REV","78":"REV","79":"REV","8":"REV","80":"REV","81":"REV","82":"REV","83":"REV","84":"REV","85":"REV","86":"REV","87":"REV","88":"REV","89":"REV","9":"REV","90":"REV","91":"REV","92":"REV","93":"REV","94":"REV","95":"REV","96":"REV","97":"REV","98":"REV","99":"REV"}},"49":{"kind":"enum","unknown":"blank","values":{"0":"START","1":"END","10":"END","100":"END","101":"END","102":"END","103":"END","104":"END","105":"END","106":"END","107":"END","108":"END","109":"END","11":"END","110":"END","111":"END","112":"END","113":"END","114":"END","115":"END","116":"END","117":"END","118":"END","119":"END","12":"END","120":"END","121":"END","122":"END","123":"END","124":"END","125":"END","126":"END","127":"END","128":"END","129":"END","13":"END","130":"END","131":"END","132":"END","133":"END","134":"END","135":"END","136":"END","137":"END","138":"END","139":"END","14":"END","140":"END","141":"END","142":"END","143":"END","144":"END","145":"END","146":"END","147":"END","148":"END","149":"END","15":"END","150":"END","151":"END","152":"END","153":"END","154":"END","155":"END","156":"END","157":"END","158":"END","159":"END","16":"END","160":"END","161":"END","162":"END","163":"END","164":"END","165":"END","166":"END","167":"END","168":"END","169":"END","17":"END","170":"END","171":"END","172":"END","173":"END","174":"END","175":"END","176":"END","177":"END","178":"END","179":"END","18":"END","180":"END","181":"END","182":"END","183":"END","184":"END","185":"END","186":"END","187":"END","188":"END","189":"END","19":"END","190":"END","191":"END","192":"END","193":"END","194":"END","195":"END","196":"END","197":"END","198":"END","199":"END","2":"END","20":"END","200":"END","201":"END","202":"END","203":"END","204":"END","205":"END","206":"END","207":"END","208":"END","209":"END","21":"END","210":"END","211":"END","212":"END","213":"END","214":"END","215":"END","216":"END","217":"END","218":"END","219":"END","22":"END","220":"END","221":"END","222":"END","223":"END","224":"END","225":"END","226":"END","227":"END","228":"END","229":"END","23":"END","230":"END","231":"END","232":"END","233":"END","234":"END","235":"END","236":"END","237":"END","238":"END","239":"END","24":"END","240":"END","241":"END","242":"END","243":"END","244":"END","245":"END","246":"END","247":"END","248":"END","249":"END","25":"END","250":"END","251":"END","252":"END","253":"END","254":"END","255":"END","26":"END","27":"END","28":"END","29":"END","3":"END","30":"END","31":"END","32":"END","33":"END","34":"END","35":"END","36":"END","37":"END","38":"END","39":"END","4":"END","40":"END","41":"END","42":"END","43":"END","44":"END","45":"END","46":"END","47":"END","48":"END","49":"END","5":"END","50":"END","51":"END","52":"END","53":"END","54":"END","55":"END","56":"END","57":"END","58":"END","59":"END","6":"END","60":"END","61":"END","62":"END","63":"END","64":"END","65":"END","66":"END","67":"END","68":"END","69":"END","7":"END","70":"END","71":"END","72":"END","73":"END","74":"END","75":"END","76":"END","77":"END","78":"END","79":"END","8":"END","80":"END","81":"END","82":"END","83":"END","84":"END","85":"END","86":"END","87":"END","88":"END","89":"END","9":"END","90":"END","91":"END","92":"END","93":"END","94":"END","95":"END","96":"END","97":"END","98":"END","99":"END"}},"50":{"kind":"enum","unknown":"blank","values":{"0":" UPPR/LOWR","1":"LOWR/UPPR","10":"LOWR/UPPR","100":"LOWR/UPPR","101":"LOWR/UPPR","102":"LOWR/UPPR","103":"LOWR/UPPR","104":"LOWR/UPPR","105":"LOWR/UPPR","106":"LOWR/UPPR","107":"LOWR/UPPR","108":"LOWR/UPPR","109":"LOWR/UPPR","11":"LOWR/UPPR","110":"LOWR/UPPR","111":"LOWR/UPPR","112":"LOWR/UPPR","113":"LOWR/UPPR","114":"LOWR/UPPR","115":"LOWR/UPPR","116":"LOWR/UPPR","117":"LOWR/UPPR","118":"LOWR/UPPR","119":"LOWR/UPPR","12":"LOWR/UPPR","120":"LOWR/UPPR","121":"LOWR/UPPR","122":"LOWR/UPPR","123":"LOWR/UPPR","124":"LOWR/UPPR","125":"LOWR/UPPR","126":"LOWR/UPPR","127":"LOWR/UPPR","128":"LOWR/UPPR","129":"LOWR/UPPR","13":"LOWR/UPPR","130":"LOWR/UPPR","131":"LOWR/UPPR","132":"LOWR/UPPR","133":"LOWR/UPPR","134":"LOWR/UPPR","135":"LOWR/UPPR","136":"LOWR/UPPR","137":"LOWR/UPPR","138":"LOWR/UPPR","139":"LOWR/UPPR","14":"LOWR/UPPR","140":"LOWR/UPPR","141":"LOWR/UPPR","142":"LOWR/UPPR","143":"LOWR/UPPR","144":"LOWR/UPPR","145":"LOWR/UPPR","146":"LOWR/UPPR","147":"LOWR/UPPR","148":"LOWR/UPPR","149":"LOWR/UPPR","15":"LOWR/UPPR","150":"LOWR/UPPR","151":"LOWR/UPPR","152":"LOWR/UPPR","153":"LOWR/UPPR","154":"LOWR/UPPR","155":"LOWR/UPPR","156":"LOWR/UPPR","157":"LOWR/UPPR","158":"LOWR/UPPR","159":"LOWR/UPPR","16":"LOWR/UPPR","160":"LOWR/UPPR","161":"LOWR/UPPR","162":"LOWR/UPPR","163":"LOWR/UPPR","164":"LOWR/UPPR","165":"LOWR/UPPR","166":"LOWR/UPPR","167":"LOWR/UPPR","168":"LOWR/UPPR","169":"LOWR/UPPR","17":"LOWR/UPPR","170":"LOWR/UPPR","171":"LOWR/UPPR","172":"LOWR/UPPR","173":"LOWR/UPPR","174":"LOWR/UPPR","175":"LOWR/UPPR","176":"LOWR/UPPR","177":"LOWR/UPPR","178":"LOWR/UPPR","179":"LOWR/UPPR","18":"LOWR/UPPR","180":"LOWR/UPPR","181":"LOWR/UPPR","182":"LOWR/UPPR","183":"LOWR/UPPR","184":"LOWR/UPPR","185":"LOWR/UPPR","186":"LOWR/UPPR","187":"LOWR/UPPR","188":"LOWR/UPPR","189":"LOWR/UPPR","19":"LOWR/UPPR","190":"LOWR/UPPR","191":"LOWR/UPPR","192":"LOWR/UPPR","193":"LOWR/UPPR","194":"LOWR/UPPR","195":"LOWR/UPPR","196":"LOWR/UPPR","197":"LOWR/UPPR","198":"LOWR/UPPR","199":"LOWR/UPPR","2":"LOWR/UPPR","20":"LOWR/UPPR","200":"LOWR/UPPR","201":"LOWR/UPPR","202":"LOWR/UPPR","203":"LOWR/UPPR","204":"LOWR/UPPR","205":"LOWR/UPPR","206":"LOWR/UPPR","207":"LOWR/UPPR","208":"LOWR/UPPR","209":"LOWR/UPPR","21":"LOWR/UPPR","210":"LOWR/UPPR","211":"LOWR/UPPR","212":"LOWR/UPPR","213":"LOWR/UPPR","214":"LOWR/UPPR","215":"LOWR/UPPR","216":"LOWR/UPPR","217":"LOWR/UPPR","218":"LOWR/UPPR","219":"LOWR/UPPR","22":"LOWR/UPPR","220":"LOWR/UPPR","221":"LOWR/UPPR","222":"LOWR/UPPR","223":"LOWR/UPPR","224":"LOWR/UPPR","225":"LOWR/UPPR","226":"LOWR/UPPR","227":"LOWR/UPPR","228":"LOWR/UPPR","229":"LOWR/UPPR","23":"LOWR/UPPR","230":"LOWR/UPPR","231":"LOWR/UPPR","232":"LOWR/UPPR","233":"LOWR/UPPR","234":"LOWR/UPPR","235":"LOWR/UPPR","236":"LOWR/UPPR","237":"LOWR/UPPR","238":"LOWR/UPPR","239":"LOWR/UPPR","24":"LOWR/UPPR","240":"LOWR/UPPR","241":"LOWR/UPPR","242":"LOWR/UPPR","243":"LOWR/UPPR","244":"LOWR/UPPR","245":"LOWR/UPPR","246":"LOWR/UPPR","247":"LOWR/UPPR","248":"LOWR/UPPR","249":"LOWR/UPPR","25":"LOWR/UPPR","250":"LOWR/UPPR","251":"LOWR/UPPR","252":"LOWR/UPPR","253":"LOWR/UPPR","254":"LOWR/UPPR","255":"LOWR/UPPR","26":"LOWR/UPPR","27":"LOWR/UPPR","28":"LOWR/UPPR","29":"LOWR/UPPR","3":"LOWR/UPPR","30":"LOWR/UPPR","31":"LOWR/UPPR","32":"LOWR/UPPR","33":"LOWR/UPPR","34":"LOWR/UPPR","35":"LOWR/UPPR","36":"LOWR/UPPR","37":"LOWR/UPPR","38":"LOWR/UPPR","39":"LOWR/UPPR","4":"LOWR/UPPR","40":"LOWR/UPPR","41":"LOWR/UPPR","42":"LOWR/UPPR","43":"LOWR/UPPR","44":"LOWR/UPPR","45":"LOWR/UPPR","46":"LOWR/UPPR","47":"LOWR/UPPR","48":"LOWR/UPPR","49":"LOWR/UPPR","5":"LOWR/UPPR","50":"LOWR/UPPR","51":"LOWR/UPPR","52":"LOWR/UPPR","53":"LOWR/UPPR","54":"LOWR/UPPR","55":"LOWR/UPPR","56":"LOWR/UPPR","57":"LOWR/UPPR","58":"LOWR/UPPR","59":"LOWR/UPPR","6":"LOWR/UPPR","60":"LOWR/UPPR","61":"LOWR/UPPR","62":"LOWR/UPPR","63":"LOWR/UPPR","64":"LOWR/UPPR","65":"LOWR/UPPR","66":"LOWR/UPPR","67":"LOWR/UPPR","68":"LOWR/UPPR","69":"LOWR/UPPR","7":"LOWR/UPPR","70":"LOWR/UPPR","71":"LOWR/UPPR","72":"LOWR/UPPR","73":"LOWR/UPPR","74":"LOWR/UPPR","75":"LOWR/UPPR","76":"LOWR/UPPR","77":"LOWR/UPPR","78":"LOWR/UPPR","79":"LOWR/UPPR","8":"LOWR/UPPR","80":"LOWR/UPPR","81":"LOWR/UPPR","82":"LOWR/UPPR","83":"LOWR/UPPR","84":"LOWR/UPPR","85":"LOWR/UPPR","86":"LOWR/UPPR","87":"LOWR/UPPR","88":"LOWR/UPPR","89":"LOWR/UPPR","9":"LOWR/UPPR","90":"LOWR/UPPR","91":"LOWR/UPPR","92":"LOWR/UPPR","93":"LOWR/UPPR","94":"LOWR/UPPR","95":"LOWR/UPPR","96":"LOWR/UPPR","97":"LOWR/UPPR","98":"LOWR/UPPR","99":"LOWR/UPPR"}},"51":{"kind":"ctx"},"53":{"kind":"enum","unknown":"qhex","values":{"0":"","2":"DRILL","32":"***","33":"GNL","34":"GRV","35":"THR","36":"DRL","37":"TAP","38":"TAP","39":"TAP","40":"TAP","41":"TAP","42":"TAP","43":"SPL","44":"TOL SENS"}},"54":{"kind":"enum","unknown":"hex","values":{"1":"PT","2":"LINE","3":"SQR","4":"GRD","5":"CIR","6":"ARC","7":"CHORD"}},"55":{"kind":"enum","unknown":"hex","values":{"16":"SQR","17":"CIR"}},"57":{"kind":"enum","unknown":"hex","values":{"32":"LINE","33":"CW","34":"CCW","35":"FIG-SH","36":"CW-SH","37":"CCW-SH","38":"REP-END"}},"58":{"kind":"enum","unknown":"hex","values":{"1":"LINE","2":"CW","3":"CCW","4":"FIG-SH","5":"CW-SH","6":"CCW-SH","7":"REP-END"}},"6":{"kind":"int"},"64":{"kind":"enum","unknown":"blank","values":{"1":" LIN","100":" \\_/","101":" CTR","113":" LIN","114":" TPR","115":" /^\\","116":" \\_/","117":" CTR","129":" LIN","130":" TPR","131":" /^\\","132":" \\_/","133":" CTR","145":" LIN","146":" TPR","147":" /^\\","148":" \\_/","149":" CTR","161":" LIN","162":" TPR","163":" /^\\","164":" \\_/","165":" CTR","17":" LIN","177":" LIN","178":" TPR","179":" /^\\","18":" TPR","180":" \\_/","181":" CTR","19":" /^\\","193":" LIN","194":" TPR","195":" /^\\","196":" \\_/","197":" CTR","2":" TPR","20":" \\_/","209":" LIN","21":" CTR","210":" TPR","211":" /^\\","212":" \\_/","213":" CTR","225":" LIN","226":" TPR","227":" /^\\","228":" \\_/","229":" CTR","241":" LIN","242":" TPR","243":" /^\\","244":" \\_/","245":" CTR","3":" /^\\","33":" LIN","34":" TPR","35":" /^\\","36":" \\_/","37":" CTR","4":" \\_/","49":" LIN","5":" CTR","50":" TPR","51":" /^\\","52":" \\_/","53":" CTR","65":" LIN","66":" TPR","67":" /^\\","68":" \\_/","69":" CTR","81":" LIN","82":" TPR","83":" /^\\","84":" \\_/","85":" CTR","97":" LIN","98":" TPR","99":" /^\\"}},"65":{"kind":"enum","unknown":"blank","values":{"1":" LIN","2":" TPR","3":" /^\\","4":" \\_/","5":" CTR"}},"66":{"kind":"enum","low":true,"unknown":"blank","values":{"1":" OUT","10":"A","11":"B","12":"C","13":"D","14":"E","15":"F","16":"10","17":" OUT","18":"*OUT","19":" IN","2":"*OUT","20":"*IN","21":" FCE","22":"*FCE","23":" BAK","24":"*BAK","25":"19","26":"1A","27":"1B","28":"1C","29":"1D","3":" IN","30":"1E","31":"1F","32":"20","33":" out","34":"*out","35":"23","36":"24","37":" fce","38":"*fce","39":" bak","4":"*IN","40":"*bak","41":"29","42":"2A","43":"2B","44":"2C","45":"2D","46":"2E","47":"2F","5":" FCE","6":"*FCE","65":"ZC","66":"XC","67":"[XC]","68":"ZY","69":"XY","7":" BAK","70":"[XY]","71":"/C","72":"[/C]","73":"/Y","74":"[/Y]","8":"*BAK","9":"9"}},"67":{"kind":"enum","unknown":"hex","values":{"1":"OUTER X","10":"Z WIDTH","11":"+X STEP","12":"-X STEP","13":"+Y STEP","14":"-Y STEP","15":"+Z STEP","16":"-Z STEP","17":"INR WDTH","18":"INR GRV","19":"EXT MIL","2":"OUTER Y","20":"EXT TURN","3":"INNER X","4":"INNER Y","5":"X GROOVE","6":"Y GROOVE","7":"Z GROOVE","8":"X WIDTH","9":"Y WIDTH"}},"68":{"kind":"enum","unknown":"hex","values":{"1":"LASER MSR","2":"TOOL EYE #1","3":"TOOL EYE #2","4":"TOOL EYE #3","5":"TOOL EYE #4"}},"69":{"kind":"int"},"72":{"kind":"enum","unknown":"blank","values":{"1":"*","101":"*","103":"*","105":"*","107":"*","109":"*","11":"*","111":"*","113":"*","115":"*","117":"*","119":"*","121":"*","123":"*","125":"*","127":"*","129":"*","13":"*","131":"*","133":"*","135":"*","137":"*","139":"*","141":"*","143":"*","145":"*","147":"*","149":"*","15":"*","151":"*","153":"*","155":"*","157":"*","159":"*","161":"*","163":"*","165":"*","167":"*","169":"*","17":"*","171":"*","173":"*","175":"*","177":"*","179":"*","181":"*","183":"*","185":"*","187":"*","189":"*","19":"*","191":"*","193":"*","195":"*","197":"*","199":"*","201":"*","203":"*","205":"*","207":"*","209":"*","21":"*","211":"*","213":"*","215":"*","217":"*","219":"*","221":"*","223":"*","225":"*","227":"*","229":"*","23":"*","231":"*","233":"*","235":"*","237":"*","239":"*","241":"*","243":"*","245":"*","247":"*","249":"*","25":"*","251":"*","253":"*","255":"*","27":"*","29":"*","3":"*","31":"*","33":"*","35":"*","37":"*","39":"*","41":"*","43":"*","45":"*","47":"*","49":"*","5":"*","51":"*","53":"*","55":"*","57":"*","59":"*","61":"*","63":"*","65":"*","67":"*","69":"*","7":"*","71":"*","73":"*","75":"*","77":"*","79":"*","81":"*","83":"*","85":"*","87":"*","89":"*","9":"*","91":"*","93":"*","95":"*","97":"*","99":"*"}},"77":{"kind":"enum","unknown":"blank","values":{"0":"<- Z","1":"<- X","10":"<- 0.","100":"<- 0.","101":"<- 0.","102":"<- 0.","103":"<- 0.","104":"<- 0.","105":"<- 0.","106":"<- 0.","107":"<- 0.","108":"<- 0.","109":"<- 0.","11":"<- 0.","110":"<- 0.","111":"<- 0.","112":"<- 0.","113":"<- 0.","114":"<- 0.","115":"<- 0.","116":"<- 0.","117":"<- 0.","118":"<- 0.","119":"<- 0.","12":"<- 0.","120":"<- 0.","121":"<- 0.","122":"<- 0.","123":"<- 0.","124":"<- 0.","125":"<- 0.","126":"<- 0.","127":"<- 0.","128":"<- 0.","129":"<- 0.","13":"<- 0.","130":"<- 0.","131":"<- 0.","132":"<- 0.","133":"<- 0.","134":"<- 0.","135":"<- 0.","136":"<- 0.","137":"<- 0.","138":"<- 0.","139":"<- 0.","14":"<- 0.","140":"<- 0.","141":"<- 0.","142":"<- 0.","143":"<- 0.","144":"<- 0.","145":"<- 0.","146":"<- 0.","147":"<- 0.","148":"<- 0.","149":"<- 0.","15":"<- 0.","150":"<- 0.","151":"<- 0.","152":"<- 0.","153":"<- 0.","154":"<- 0.","155":"<- 0.","156":"<- 0.","157":"<- 0.","158":"<- 0.","159":"<- 0.","16":"<- 0.","160":"<- 0.","161":"<- 0.","162":"<- 0.","163":"<- 0.","164":"<- 0.","165":"<- 0.","166":"<- 0.","167":"<- 0.","168":"<- 0.","169":"<- 0.","17":"<- 0.","170":"<- 0.","171":"<- 0.","172":"<- 0.","173":"<- 0.","174":"<- 0.","175":"<- 0.","176":"<- 0.","177":"<- 0.","178":"<- 0.","179":"<- 0.","18":"<- 0.","180":"<- 0.","181":"<- 0.","182":"<- 0.","183":"<- 0.","184":"<- 0.","185":"<- 0.","186":"<- 0.","187":"<- 0.","188":"<- 0.","189":"<- 0.","19":"<- 0.","190":"<- 0.","191":"<- 0.","192":"<- 0.","193":"<- 0.","194":"<- 0.","195":"<- 0.","196":"<- 0.","197":"<- 0.","198":"<- 0.","199":"<- 0.","2":"<- 0.","20":"<- 0.","200":"<- 0.","201":"<- 0.","202":"<- 0.","203":"<- 0.","204":"<- 0.","205":"<- 0.","206":"<- 0.","207":"<- 0.","208":"<- 0.","209":"<- 0.","21":"<- 0.","210":"<- 0.","211":"<- 0.","212":"<- 0.","213":"<- 0.","214":"<- 0.","215":"<- 0.","216":"<- 0.","217":"<- 0.","218":"<- 0.","219":"<- 0.","22":"<- 0.","220":"<- 0.","221":"<- 0.","222":"<- 0.","223":"<- 0.","224":"<- 0.","225":"<- 0.","226":"<- 0.","227":"<- 0.","228":"<- 0.","229":"<- 0.","23":"<- 0.","230":"<- 0.","231":"<- 0.","232":"<- 0.","233":"<- 0.","234":"<- 0.","235":"<- 0.","236":"<- 0.","237":"<- 0.","238":"<- 0.","239":"<- 0.","24":"<- 0.","240":"<- 0.","241":"<- 0.","242":"<- 0.","243":"<- 0.","244":"<- 0.","245":"<- 0.","246":"<- 0.","247":"<- 0.","248":"<- 0.","249":"<- 0.","25":"<- 0.","250":"<- 0.","251":"<- 0.","252":"<- 0.","253":"<- 0.","254":"<- 0.","255":"<- 0.","26":"<- 0.","27":"<- 0.","28":"<- 0.","29":"<- 0.","3":"<- 0.","30":"<- 0.","31":"<- 0.","32":"<- 0.","33":"<- 0.","34":"<- 0.","35":"<- 0.","36":"<- 0.","37":"<- 0.","38":"<- 0.","39":"<- 0.","4":"<- 0.","40":"<- 0.","41":"<- 0.","42":"<- 0.","43":"<- 0.","44":"<- 0.","45":"<- 0.","46":"<- 0.","47":"<- 0.","48":"<- 0.","49":"<- 0.","5":"<- 0.","50":"<- 0.","51":"<- 0.","52":"<- 0.","53":"<- 0.","54":"<- 0.","55":"<- 0.","56":"<- 0.","57":"<- 0.","58":"<- 0.","59":"<- 0.","6":"<- 0.","60":"<- 0.","61":"<- 0.","62":"<- 0.","63":"<- 0.","64":"<- 0.","65":"<- 0.","66":"<- 0.","67":"<- 0.","68":"<- 0.","69":"<- 0.","7":"<- 0.","70":"<- 0.","71":"<- 0.","72":"<- 0.","73":"<- 0.","74":"<- 0.","75":"<- 0.","76":"<- 0.","77":"<- 0.","78":"<- 0.","79":"<- 0.","8":"<- 0.","80":"<- 0.","81":"<- 0.","82":"<- 0.","83":"<- 0.","84":"<- 0.","85":"<- 0.","86":"<- 0.","87":"<- 0.","88":"<- 0.","89":"<- 0.","9":"<- 0.","90":"<- 0.","91":"<- 0.","92":"<- 0.","93":"<- 0.","94":"<- 0.","95":"<- 0.","96":"<- 0.","97":"<- 0.","98":"<- 0.","99":"<- 0."}},"8":{"kind":"int"},"95":{"inch":{"dec":4,"prefix":"","scale":0.0001},"kind":"num","metric":{"dec":3,"prefix":"","scale":0.001}}},"pool":[{"code":0,"name":"???","head":"UNo. UNIT","shape":255,"tool":0,"cells":[]},{"code":1,"name":"_","head":"UNo. MAT      INITIAL-Z ATC-MODE MULTI-MODE  MULTI FLAG  PITCH-X  PITCH-Y","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,1,13,0,0],[40,4,123,2,17,0,2],[10,1,31,128,26,0,3],[9,1,246,64,33,0,4],[20,2,202,32,45,0,5],[48,4,135,8,57,0,6],[52,4,135,16,66,0,7]],"na":{"always":[],"rules":{"5":[[9,[1,3]]],"6":[[9,[1,3]]],"7":[[9,[1,3]]]},"all":[5,6,7]}},{"code":2,"name":"WPC-","head":"UNo. UNIT   ADD.WPC      X         Y        Th         Z         \u0001         C","shape":255,"tool":0,"cells":[[8,1,30,0,9,0,8],[20,2,261,256,13,0,9],[36,4,149,1,23,1,10],[40,4,149,2,33,2,11],[44,4,118,4,43,0,12],[48,4,149,8,53,8,13],[56,4,118,64,64,0,14],[60,4,118,128,74,0,14]]},{"code":3,"name":"OFFSET","head":"UNo. UNIT        U(X)        V(Y)       D(th)          W(Z)","shape":255,"tool":0,"cells":[[36,4,123,1,17,0,15],[40,4,123,2,27,0,16],[44,4,118,4,40,0,17],[48,4,123,8,54,0,18]]},{"code":4,"name":"END","head":"UNo. UNIT CONTI. NUMBER ATC ANGLE  DIR.    RETURN             Work-No.                   EXECTE","shape":166,"tool":0,"cells":[[9,1,31,2,11,0,19],[24,2,6,32,17,0,20],[68,4,6,128,23,0,21],[10,1,30,4,18,0,22],[11,1,32,8,25,0,23],[72,4,118,512,27,0,24],[8,1,253,1,35,0,25],[12,1,211,16,45,0,26],[13,1,6,256,52,0,27],[36,29,304,64,61,0,28],[14,1,312,0,91,0,29]]},{"code":5,"name":"SUB-PROG","head":"UNo. UNIT     WORK No.                              $  REPEAT   No.","shape":165,"tool":0,"cells":[[36,32,304,1,13,0,30],[8,1,244,0,46,0,0],[26,1,30,512,52,0,31],[9,1,264,1024,53,0,31],[24,2,207,2,55,0,32],[13,1,72,2048,64,0,0],[22,2,69,2048,65,0,33]]},{"code":6,"name":"MANL-PRG","head":"UNo. UNIT           TOOL             NOM-DIA      No.","shape":161,"tool":0,"cells":[[8,1,6,0,13,0,34],[9,1,43,0,20,0,35],[10,1,6,0,32,0,36],[36,4,288,1,37,0,37],[11,1,265,0,44,0,38],[8,1,72,2048,50,0,0],[22,2,69,2048,51,0,33]]},{"code":7,"name":"M-CODE","head":"UNo. MODE  No.    M1   M2   M3   M4     M5   M6   M7   M8     M9   M10  M11  M12","shape":255,"tool":0,"cells":[[8,1,72,2048,11,0,0],[22,2,69,2048,12,0,33],[36,2,207,1,18,0,39],[38,2,207,2,23,0,39],[40,2,207,4,28,0,39],[42,2,220,8,33,1,39],[44,2,207,16,40,0,39],[46,2,207,32,45,0,39],[48,2,207,64,50,0,39],[50,2,220,128,55,2,39],[52,2,207,65536,62,0,39],[54,2,207,131072,67,0,39],[56,2,207,262144,72,0,39],[58,2,220,524288,77,4,39]]},{"code":8,"name":"MMS","head":"UNo. UNIT     TOOL         NOM-0    No.     U.SKIP       $","shape":162,"tool":0,"cells":[[9,1,43,0,14,0,0],[36,4,123,1,26,0,37],[11,1,265,0,31,0,38],[8,1,72,2048,35,0,0],[22,2,69,2048,36,0,33],[13,1,30,0,47,0,40],[49,1,8,0,57,0,0]],"na":{"always":[6],"rules":{}}},{"code":10,"name":"PALLET-CHANGE","head":"UNo. UNIT          PALLET No.","shape":255,"tool":0,"cells":[[26,1,30,1,23,0,41],[7,1,6,2,33,0,42]]},{"code":11,"name":"PROC-END","head":"UNo. UNIT","shape":255,"tool":0,"cells":[]},{"code":12,"name":"INDEX","head":"UNo. UNIT   TURN POS X   TURN POS Y    TURN POS Z   ANGLE \u0001  ANGLE C  TURN DIR.","shape":255,"tool":0,"cells":[[48,4,123,16,15,0,43],[52,4,123,32,28,0,44],[56,4,123,64,42,0,45],[60,4,6,128,52,0,46],[40,4,118,4,52,0,47],[44,4,118,8,61,0,0],[8,1,253,1,71,0,25]]},{"code":32,"name":"DRILLING","head":"UNo. UNIT    C-FACE     DIA       DEPTH      CHMF","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,25,0,49],[36,4,123,1,24,0,50],[40,4,123,2,34,0,51],[44,4,123,4,45,0,52]],"variants":{"0":{"head":"UNo. UNIT               DIA       DEPTH      CHMF","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":33,"name":"RGH CBOR","head":"UNo. UNIT    C-FACE   CB-DIA    CB-DEP     CHMF  BTM  DIA       DEPTH","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,25,0,49],[56,4,123,8,23,0,53],[60,4,123,16,33,0,54],[44,4,123,4,43,0,52],[11,1,30,32,50,0,55],[36,4,123,1,54,0,50],[40,4,123,2,64,0,51]],"variants":{"0":{"head":"UNo. UNIT             CB-DIA    CB-DEP     CHMF  BTM  DIA       DEPTH","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":34,"name":"RGH BCB","head":"UNo. UNIT    C-FACE     CB-DIA    CB-DEP     DIA     DEPTH    CHMF","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,25,0,49],[56,4,123,1,25,0,53],[60,4,123,2,35,0,54],[36,4,123,4,45,0,50],[40,4,123,8,53,0,51],[44,4,123,16,63,0,52]],"variants":{"0":{"head":"UNo. UNIT               CB-DIA    CB-DEP     DIA     DEPTH    CHMF","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":35,"name":"REAMING","head":"UNo. UNIT    C-FACE   DIA    DEPTH  CHAMFER  PRE-REAM   CHP","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,25,0,49],[36,4,123,1,22,0,50],[40,4,123,2,29,0,51],[44,4,123,4,37,0,52],[18,1,238,8,45,0,0],[19,1,30,0,56,0,56]],"variants":{"0":{"head":"UNo. UNIT             DIA    DEPTH  CHAMFER  PRE-REAM   CHP","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":36,"name":"TAPPING","head":"UNo. UNIT    NOM    C-FACE     MAJOR-0     PITCH     TAP-DEPTH  CHMF   CHP","shape":192,"tool":176,"cells":[[36,4,287,1,13,0,37],[8,1,274,0,22,0,34],[40,4,123,2,32,0,57],[44,4,123,4,43,0,58],[48,4,123,8,54,0,59],[52,4,123,16,64,0,52],[19,1,30,0,73,0,56]],"variants":{"0":{"head":"UNo. UNIT    NOM               MAJOR-0     PITCH     TAP-DEPTH  CHMF   CHP","cells":{"1":[8,1,6,0,22,0,34]}}}},{"code":37,"name":"BK-CBORE","head":"UNo. UNIT    C-FACE  DIA    DEPTH   BTM WAL   PRE-DIA   PRE-DEP  CHMF   WAL","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,25,0,49],[36,4,123,1,21,0,50],[40,4,123,2,29,0,51],[9,1,30,64,37,0,55],[10,1,30,32,41,0,60],[56,4,123,8,46,0,61],[60,4,123,16,56,0,0],[44,4,123,4,65,0,52],[12,1,30,128,72,0,60]],"variants":{"0":{"head":"UNo. UNIT            DIA    DEPTH   BTM WAL   PRE-DIA   PRE-DEP  CHMF   WAL","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":38,"name":"CIRC-MIL","head":"UNo. UNIT  C-FACE TORNA. DIA   DEPTH  CHMF  BTM PRE-DIA  CHMF PITCH1 PITCH2","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,17,0,48],[96,4,6,4096,24,0,49],[13,1,37,0,21,0,62],[36,4,123,1,25,0,50],[40,4,123,2,32,0,51],[44,4,123,4,39,0,52],[9,1,30,32,45,0,55],[56,4,123,8,48,0,61],[64,4,123,16,57,0,52],[48,4,123,64,62,0,63],[52,4,123,128,69,0,64]],"na":{"always":[],"rules":{"8":[[13,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128]]],"9":[[13,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128]]],"10":[[13,[0]]],"11":[[13,[0]]]},"all":[8,9]},"variants":{"0":{"head":"UNo. UNIT         TORNA. DIA   DEPTH  CHMF  BTM PRE-DIA  CHMF PITCH1 PITCH2","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":39,"name":"CBOR-TAP","head":"UNo. UNIT    NOM    C-FACE MAJOR   PITCH  TAP-DEP  CHMF  CB-DIA  CB-DEP  CHMF BTM CHP","shape":192,"tool":176,"cells":[[36,4,287,1,13,0,37],[8,1,274,0,21,0,34],[40,4,123,2,28,0,57],[44,4,123,4,35,0,58],[48,4,123,8,42,0,59],[52,4,123,16,51,0,52],[56,4,123,32,57,0,53],[60,4,123,64,65,0,54],[64,4,123,128,73,0,52],[11,1,30,256,79,0,55],[19,1,30,0,82,0,56]],"variants":{"0":{"head":"UNo. UNIT    NOM           MAJOR   PITCH  TAP-DEP  CHMF  CB-DIA  CB-DEP  CHMF BTM CHP","cells":{"1":[8,1,6,0,21,0,34]}}}},{"code":40,"name":"BORE-T1","head":"UNo. UNIT    C-FACE    DIA       DEPTH     CHMF    WAL","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,26,0,49],[36,4,123,1,23,0,50],[40,4,123,2,33,0,51],[44,4,123,4,43,0,52],[10,1,30,8,52,0,60]],"variants":{"0":{"head":"UNo. UNIT              DIA       DEPTH     CHMF    WAL","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":41,"name":"BORE-S1","head":"UNo. UNIT    C-FACE    DIA       DEPTH     CHMF    BTM WAL  PRE-DIA","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,26,0,49],[36,4,123,1,23,0,50],[40,4,123,2,33,0,51],[44,4,123,4,43,0,52],[9,1,30,16,52,0,55],[10,1,30,32,56,0,60],[48,4,123,8,60,0,61]],"variants":{"0":{"head":"UNo. UNIT              DIA       DEPTH     CHMF    BTM WAL  PRE-DIA","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":42,"name":"BOR-T2","head":"UNo. UNIT    C-FACE CB-DIA   CB-DEP   CHMF   BTM WAL DIA     DEPTH   CHMF  WAL","shape":192,"tool":176,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,25,0,49],[56,4,123,1,21,0,53],[60,4,123,2,29,0,54],[64,4,123,4,38,0,52],[11,1,30,128,46,0,55],[12,1,30,256,50,0,60],[36,4,123,8,53,0,50],[40,4,123,16,62,0,51],[44,4,123,32,70,0,52],[10,1,30,64,76,0,60]],"variants":{"0":{"head":"UNo. UNIT           CB-DIA   CB-DEP   CHMF   BTM WAL DIA     DEPTH   CHMF  WAL","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":43,"name":"BOR-S2","head":"UNo. UNIT    C-FACE CB-DIA CB-DEP CHMF BtmWal PRE-DIA  DIA    DEPTH   CHMF BtmWal","shape":192,"tool":176,"cells":[[8,1,274,0,12,0,34],[92,4,6,2048,16,0,48],[96,4,6,4096,23,0,49],[56,4,123,1,19,0,53],[60,4,123,2,27,0,54],[64,4,123,4,35,0,52],[11,1,30,512,40,0,55],[12,1,30,1024,43,0,60],[48,4,123,8,46,0,61],[36,4,123,16,54,0,50],[40,4,123,32,62,0,51],[44,4,123,64,70,0,52],[9,1,30,128,76,0,55],[10,1,30,256,79,0,60]],"variants":{"0":{"head":"UNo. UNIT           CB-DIA CB-DEP CHMF BtmWal PRE-DIA  DIA    DEPTH   CHMF BtmWal","cells":{"0":[8,1,6,0,12,0,34]}}}},{"code":64,"name":"LINE-CTR","head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z            START  END","shape":194,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,49],[36,4,135,1,22,0,65],[40,4,123,2,30,0,66],[44,4,123,4,38,0,67],[17,1,38,16,47,0,0],[48,4,6,0,50,0,0],[52,4,123,32,50,0,68],[56,4,6,0,58,0,69],[18,1,317,0,66,0,70],[18,1,318,0,73,0,71]],"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z            START  END","cells":{"0":[8,1,6,0,14,0,34]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z            START  END","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":65,"name":"LINE-RGT","head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START   END  INTER-R  CHMF","shape":194,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,49],[36,4,135,1,22,0,65],[40,4,123,2,30,0,66],[44,4,123,4,38,0,67],[17,1,38,16,47,0,0],[48,4,6,0,50,0,0],[52,4,123,32,50,0,68],[56,4,123,64,58,0,69],[18,1,317,0,66,0,70],[18,1,318,0,73,0,71],[64,4,123,256,80,0,73],[48,4,189,512,88,1,52]],"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START  END   INTER-R  CHMF","cells":{"0":[8,1,6,0,14,0,34]}},"1":{"head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START  END   INTER-R  CHMF"},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START  END   INTER-R  CHMF","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":66,"name":"LINE-LFT","head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START   END  INTER-R  CHMF","shape":194,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,49],[36,4,135,1,22,0,65],[40,4,123,2,30,0,66],[44,4,123,4,38,0,67],[17,1,38,16,47,0,0],[48,4,6,0,50,0,0],[52,4,123,32,50,0,68],[56,4,123,64,58,0,69],[18,1,317,0,66,0,70],[18,1,318,0,73,0,71],[64,4,123,256,80,0,73],[48,4,189,512,88,1,52]],"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START  END   INTER-R  CHMF","cells":{"0":[8,1,6,0,14,0,34]}},"1":{"head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START  END   INTER-R  CHMF"},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R    START  END   INTER-R  CHMF","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":67,"name":"LINE OUT","head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R                 INTER-R  CHMF","shape":193,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,49],[36,4,135,1,22,0,65],[40,4,123,2,30,0,66],[44,4,123,4,38,0,67],[17,1,38,16,47,0,0],[48,4,6,0,50,0,0],[52,4,123,32,50,0,68],[56,4,123,64,58,0,69],[64,4,123,256,80,0,73],[48,4,189,512,89,1,52]],"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R                 INTER-R  CHMF","cells":{"0":[8,1,6,0,14,0,34]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R                 INTER-R  CHMF","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":68,"name":"LINE-IN","head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R                 INTER-R  CHMF","shape":193,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,49],[36,4,135,1,22,0,65],[40,4,123,2,30,0,66],[44,4,123,4,38,0,67],[17,1,38,16,47,0,0],[48,4,6,0,50,0,0],[52,4,123,32,50,0,68],[56,4,123,64,58,0,69],[64,4,123,256,80,0,73],[48,4,189,512,89,1,52]],"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R                 INTER-R  CHMF","cells":{"0":[8,1,6,0,14,0,34]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R                 INTER-R  CHMF","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":80,"name":"CHMF RGT","head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF          START   END","shape":194,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,0],[36,4,135,1,22,0,65],[40,4,123,2,32,0,74],[44,4,123,4,42,0,73],[17,1,6,16,46,0,0],[48,4,189,8,52,1,52],[18,1,317,0,66,0,70],[18,1,318,0,73,0,71]],"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF          START   END","cells":{"0":[8,1,6,0,14,0,34]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF          START   END","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":81,"name":"CHMF LFT","head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF          START   END","shape":194,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,0],[36,4,135,1,22,0,65],[40,4,123,2,32,0,74],[44,4,123,4,42,0,73],[17,1,6,16,46,0,0],[48,4,189,8,52,1,52],[18,1,317,0,66,0,70],[18,1,318,0,73,0,71]],"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF          START   END","cells":{"0":[8,1,6,0,14,0,34]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF          START   END","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":82,"name":"CHMF OUT","head":"UNo. UNIT    C-FACE   DEPTH     INTER-Z   INTER-R   CHMF","shape":193,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,0],[36,4,135,1,22,0,65],[40,4,123,2,32,0,74],[44,4,123,4,42,0,73],[17,1,6,16,46,0,0],[48,4,189,8,52,1,52]],"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[8,1,6,0,14,0,34]}},"1":{"head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF"},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":83,"name":"CHMF IN","head":"UNo. UNIT    C-FACE   DEPTH     INTER-Z   INTER-R   CHMF","shape":193,"tool":177,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,18,0,48],[96,4,6,4096,0,0,0],[36,4,135,1,22,0,65],[40,4,123,2,32,0,74],[44,4,123,4,42,0,73],[17,1,6,16,46,0,0],[48,4,189,8,52,1,52]],"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[8,1,6,0,14,0,34]}},"1":{"head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF"},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF","cells":{"3":[36,4,135,1,22,0,72]}}}},{"code":96,"name":"FCE-MILL","head":"UNo. UNIT     DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,6,0,13,0,34],[36,4,135,1,14,0,65],[40,4,123,2,24,0,66],[26,4,6,0,32,0,0],[9,1,38,8,41,0,55],[10,1,8,0,45,0,0],[52,4,123,64,49,0,68],[56,4,8,0,59,0,0]],"na":{"always":[5,7],"rules":{}}},{"code":97,"name":"TOP-EMILL","head":"UNo. UNIT     DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,6,0,14,0,34],[36,4,135,1,14,0,65],[40,4,123,2,24,0,66],[26,4,6,4,32,0,0],[9,1,38,8,41,0,55],[10,1,8,16,45,0,0],[52,4,123,64,49,0,68],[56,4,8,128,58,0,0]],"na":{"always":[5,7],"rules":{}}},{"code":98,"name":"STEP","head":"UNo. UNIT     DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,6,0,13,0,34],[36,4,135,1,14,0,65],[40,4,123,2,24,0,66],[26,4,6,4,33,0,0],[9,1,38,8,41,0,55],[10,1,38,16,45,0,60],[52,4,123,64,49,0,68],[56,4,123,128,58,0,69]]},{"code":99,"name":"POCKET","head":"UNo. UNIT     DEPTH    SRV-Z   BTM WAL FIN-Z    FIN-R    INTER-R  CHMF","shape":193,"tool":178,"cells":[[8,1,6,0,13,0,34],[36,4,135,1,14,0,65],[40,4,123,2,23,0,66],[26,4,6,0,31,0,0],[9,1,38,8,32,0,55],[10,1,38,16,36,0,60],[52,4,123,64,39,0,68],[56,4,123,128,48,0,69],[44,4,123,256,57,0,73],[48,4,189,512,65,1,52]]},{"code":100,"name":"PCKT MTN","head":"UNo. UNIT     DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,6,0,13,0,34],[36,4,135,1,14,0,65],[40,4,123,2,24,0,66],[26,4,6,0,32,0,0],[9,1,38,8,41,0,55],[10,1,38,16,45,0,60],[52,4,123,64,49,0,68],[56,4,123,128,58,0,69]]},{"code":101,"name":"PCKT VLY","head":"UNo. UNIT     DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,6,0,13,0,34],[36,4,135,1,14,0,65],[40,4,123,2,24,0,66],[26,4,6,0,32,0,0],[9,1,38,8,41,0,55],[10,1,38,16,45,0,60],[52,4,123,64,49,0,68],[56,4,123,128,58,0,69]]},{"code":102,"name":"SLOT","head":"UNo. UNIT     DEPTH    SRV-Z   S-WIDTH  BTM WAL  FIN-Z    FIN-R","shape":194,"tool":178,"cells":[[8,1,6,0,13,0,34],[36,4,135,1,14,0,65],[40,4,123,2,23,0,66],[60,4,123,4,32,0,75],[9,1,38,8,41,0,55],[10,1,38,16,45,0,60],[52,4,123,64,49,0,68],[56,4,123,128,58,0,69],[19,1,6,65536,67,0,76]]},{"code":192,"name":"","head":"FIG PTN    Z        X        Y        AN1     AN2     T1      T2      F  M  N P Q R","shape":65532,"tool":0,"cells":[[8,1,54,0,4,0,77],[36,4,127,2048,10,0,78],[40,4,123,2,19,0,0],[44,4,123,4,28,0,0],[48,4,118,8,38,0,0],[52,4,118,16,46,0,0],[56,4,123,32,54,0,0],[60,4,123,64,62,0,0],[9,1,30,96,70,0,0],[20,1,30,128,72,0,0],[22,1,30,256,75,0,79],[15,1,32,512,78,0,0],[16,1,31,1024,80,0,80],[17,1,31,4096,82,0,81]],"na":{"always":[],"rules":{"4":[[8,[1]]],"5":[[8,[1,2,5,7]]],"6":[[8,[1]]],"7":[[8,[1,2,5,6]]],"8":[[8,[1,5,7]]],"9":[[8,[1,7]]],"10":[[8,[1,2,5,6,7]]],"11":[[8,[2,5,6]]],"12":[[8,[5,7]]]},"all":[4,5,6,7,8,9,10]}},{"code":193,"name":"","head":"FIG PTN     P1X/CX   P1Y/CY   P3X/R    P3Y     CN1      CN2      CN3      CN4","shape":65532,"tool":0,"cells":[[8,1,55,0,4,0,82],[36,4,123,2,12,0,0],[40,4,123,4,21,0,0],[44,4,123,8,30,0,0],[48,4,123,16,38,0,83],[52,4,262,32,46,256,0],[56,4,262,64,55,512,0],[60,4,262,128,64,1024,0],[64,4,262,256,73,2048,0]],"na":{"always":[],"rules":{"4":[[8,[17]]],"5":[[8,[17]]],"6":[[8,[17]]],"7":[[8,[17]]],"8":[[8,[17]]]}},"variants":{"0":{"head":"FIG PTN     P1X/CX   P1Y/CY   P3X/R   P3Y    CN1      CN2      CN3      CN4"},"1":{"head":"FIG PTN   P1Rx/CRx P1thy/Cthy P3Rx/R P3thy   CN1      CN2      CN3      CN4"},"2":{"head":"FIG PTN   P1Rx/CRx P1thy/Cthy P3Rx/R P3thy   CN1      CN2      CN3      CN4"}}},{"code":194,"name":"","head":"FIG  PTN      X         Y        Rad/Th.   I       J         P      CNR       R-FEED  RGH","shape":65532,"tool":0,"cells":[[12,1,26,0,3,0,0],[8,1,57,0,4,0,82],[40,4,131,2,13,1,84],[44,4,131,4,23,2,85],[48,4,181,8,33,4,0],[52,4,131,16,42,8,0],[56,4,131,32,51,16,0],[13,1,256,0,61,0,0],[60,4,262,64,66,256,0],[76,4,193,32768,76,0,86],[64,4,192,128,83,32768,87]],"na":{"always":[],"rules":{"2":[[8,[35,36,37,38]]],"3":[[8,[35,36,37,38]]],"4":[[8,[35,38]]],"5":[[8,[35,38]]],"6":[[8,[35,38]]],"7":[[8,[38]]],"8":[[8,[35,36,37,38]]],"9":[[8,[35,36,37,38]]],"10":[[8,[35,36,37,38]]]},"blank":{"7":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[7]},"pctx":{"9":{"99":"=CLOSED","100":"=CLOSED","101":"=CLOSED"},"10":{"99":"na","100":"na","101":"na"}},"variants":{"0":{"head":"FIG  PTN      X         Y        Rad/Th.   I       J         P      CNR     R-FEED  RGH","cells":{"9":[76,4,193,32768,76,0,88],"10":[64,4,192,128,83,32768,86]}},"1":{"head":"FIG  PTN      X         Y        Rad/Th.   I       J         P      CNR     R-FEED  RGH","cells":{"9":[76,4,193,32768,76,0,88],"10":[64,4,192,128,83,32768,86]}},"2":{"head":"FIG  PTN      X         Y        Rad/Th.   I       J         P      CNR     R-FEED  RGH","cells":{"9":[76,4,193,32768,76,0,88],"10":[64,4,192,128,83,32768,86]}}}},{"code":160,"name":"OFS-TYPE","head":"OFS                    X         Y       THETA         Z","shape":65532,"tool":0,"cells":[[36,4,124,1,23,0,89],[40,4,123,2,33,0,90],[44,4,118,4,43,0,91],[48,4,123,8,54,0,92]]},{"code":161,"name":"","head":"SNo. G1  G2  DATA 1    DATA 2    DATA 3    DATA 4    DATA 5    DATA 6     S    M/B","shape":65532,"tool":0,"cells":[[20,1,34,1,5,64,93],[22,1,34,2,9,64,93],[8,1,248,0,12,0,94],[36,4,194,0,14,64,0],[9,1,248,0,22,0,94],[40,4,194,0,24,64,0],[10,1,248,0,32,0,94],[44,4,194,0,34,64,0],[11,1,248,0,42,0,94],[48,4,194,0,44,64,0],[12,1,248,0,52,0,94],[52,4,194,0,54,64,0],[13,1,248,0,62,0,94],[56,4,194,0,64,64,0],[60,4,104,4,73,0,95],[19,1,279,8,79,128,96],[24,2,207,8,80,0,0]],"na":{"always":[],"rules":{},"blank":{"3":[[8,[0]]],"5":[[9,[0]]],"7":[[10,[0]]],"9":[[11,[0]]],"11":[[12,[0]]],"13":[[13,[0]]]}}},{"code":162,"name":"","head":"SNo PTN       X       Y       Z       \u0001        5        R       D/L       K","shape":65532,"tool":0,"cells":[[8,1,252,0,4,0,97],[36,4,123,1,14,0,98],[40,4,123,2,22,0,99],[44,4,123,4,30,0,100],[68,4,118,512,38,0,0],[64,4,118,512,47,0,0],[52,4,123,16,56,0,101],[56,4,123,32,64,0,102],[60,4,123,64,74,0,103],[10,1,6,16777216,80,0,0]],"na":{"always":[],"rules":{"6":[[8,[4,5,6,7,8,9,11,17,18,20]]],"7":[[8,[1,2,3,10]]],"8":[[8,[1,2,3,10,14]]]},"all":[7,8]}},{"code":176,"name":"","head":"SNo  TOOL   NOM-D No   HOLE-D HOLE-DEP PRE-DIA PRE-DEP RGH DEPTH C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,288,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,123,2,24,0,0],[44,4,123,4,31,0,0],[48,4,188,0,40,0,0],[52,4,143,0,47,0,0],[15,1,271,0,54,0,0],[56,4,212,0,59,0,0],[60,4,105,64,65,0,104],[64,4,125,128,70,0,87],[24,2,207,512,77,0,39],[26,2,207,1024,81,0,39],[32,2,207,536870912,85,0,39]],"na":{"always":[],"rules":{"6":[[9,[17]]],"7":[[9,[1,17]]],"8":[[9,[1,3,6,7,8,10,17]]],"9":[[9,[1,3,4,5,6,7,8,9,17]]],"10":[[9,[3,10,13,17]]],"11":[[9,[10,17]]],"12":[[9,[17]]],"13":[[9,[17]]]},"all":[7,8,9]},"pctx":{"14":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"}}},{"code":177,"name":"","head":"SNo  TOOL  NOM-D  No.   APRCH-X  APRCH-Y TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,24,1,105],[44,4,138,4,33,2,106],[15,1,277,128,41,0,107],[14,1,241,0,46,0,108],[48,4,123,8,50,0,109],[52,4,8,16,57,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"na":{"always":[12],"rules":{"11":[[9,[1]]]},"all":[11]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":4,"98":4,"99":4,"100":4,"101":4,"102":2,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0":0,"0/1":1,"0/2":0,"1/0":0,"1/1":1,"1/2":0},{"0/0":2,"0/1":3,"0/2":3,"1/0":3,"1/1":3,"1/2":3},{"0/0":0,"0/1":1,"0/2":1,"1/0":1,"1/1":1,"1/2":1},{"0/0":4,"0/1":5,"0/2":4,"1/0":5,"1/1":5,"1/2":5},{"0/0":0,"0/1":1,"0/2":0,"1/0":1,"1/1":1,"1/2":1}],"own":[{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n","n","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","na","n!","n","n","n","n","n"]]}},{"code":178,"name":"","head":"SNo  TOOL  NOM-D  No APRCH-X  APRCH-Y TYPE ZFD TYPE PK-DEP DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,23,1,105],[44,4,138,4,32,2,106],[15,1,277,128,40,0,107],[14,1,241,0,45,0,108],[16,1,242,0,49,0,111],[76,4,123,268435456,54,0,112],[48,4,123,8,61,0,109],[52,4,128,16,68,0,110],[60,4,105,32,74,0,104],[64,4,125,64,80,0,87],[24,2,207,256,87,0,39],[26,2,207,512,91,0,39],[32,2,207,536870912,95,0,39]],"na":{"always":[],"rules":{"14":[[9,[1,13]]],"11":[[9,[13]],[14,[128]]],"13":[[9,[1,13]]],"12":[[16,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[12,13,14]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"13":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"14":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9,14,16],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]],[[[0,127],[129,255]],[[128,128]]],[[[0,2],[4,255]],[[3,3]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":2,"98":2,"99":2,"100":2,"101":2,"102":4,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":0,"1/0/0/1":1,"1/0/1/0":0,"1/0/1/1":0,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":4,"0/0/0/1":5,"0/0/1/0":4,"0/0/1/1":4,"0/1/0/0":6,"0/1/0/1":7,"0/1/1/0":6,"0/1/1/1":6,"0/2/0/0":6,"0/2/0/1":6,"0/2/1/0":6,"0/2/1/1":6,"1/0/0/0":8,"1/0/0/1":9,"1/0/1/0":8,"1/0/1/1":8,"1/1/0/0":6,"1/1/0/1":7,"1/1/1/0":6,"1/1/1/1":6,"1/2/0/0":6,"1/2/0/1":6,"1/2/1/0":6,"1/2/1/1":6},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":10,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":1,"0/1/0/0":2,"0/1/0/1":2,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":11,"1/1/0/0":2,"1/1/0/1":2,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":12,"0/0/0/1":13,"0/0/1/0":12,"0/0/1/1":12,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":2,"1/0/0/1":3,"1/0/1/0":2,"1/0/1/1":2,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2}],"own":[{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"na"},"0/0/*/1":{"10":"na"},"0/1/*/0":{"10":"na"},"0/1/*/1":{"10":"na"},"0/2/*/0":{"10":"na"},"0/2/*/1":{"10":"na"},"1/0/*/0":{"10":"na"},"1/0/*/1":{"10":"na"},"1/1/*/0":{"10":"na"},"1/1/*/1":{"10":"na"},"1/2/*/0":{"10":"na"},"1/2/*/1":{"10":"na"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"n"},"0/1/0/*":{"11":"na"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"n"},"1/1/0/*":{"11":"na"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","na","n","n","n","n","n"]]}},{"code":165,"name":"","head":"SNo    #1        #2        #3        #4        #5        #6","shape":65532,"tool":0,"cells":[[8,1,250,4,5,0,113],[36,4,118,4,7,1,0],[9,1,248,8,15,0,113],[40,4,118,8,17,2,0],[10,1,248,16,25,0,113],[44,1,118,16,27,4,0],[11,1,248,32,35,0,113],[48,4,118,32,37,8,0],[12,1,248,64,45,0,113],[52,4,118,64,47,16,0],[13,1,248,128,55,0,113],[56,4,118,128,57,32,0]]},{"code":1,"name":"_","head":"UNo. MAT.    TYPE      OD-MAX  ID-MIN  LENGTH   WORK-FACE  ATC-MODE  RPM","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,0,13,0,0],[64,4,123,256,23,0,114],[68,4,123,512,31,0,115],[72,4,123,1024,40,0,116],[76,4,135,2048,50,0,117],[10,1,31,128,62,0,3],[22,2,207,65536,68,0,118]]},{"code":16,"name":"MATERIAL","head":"UNo. MODE","shape":184,"tool":0,"cells":[[20,2,233,0,13,0,119]]},{"code":22,"name":"2 WORKPC","head":"UNo. UNIT     PAT.     SP1 / SP2","shape":255,"tool":0,"cells":[[8,1,49,1,14,0,0],[9,1,50,2,23,0,0]],"na":{"always":[],"rules":{"1":[[8,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[1]}},{"code":18,"name":"TRANSFER","head":"UNo. UNIT   PAT HEAD SPDL PUSH CHUCK  W1     W2    MOVEMENT  C1      C2    MOVE-C","shape":255,"tool":0,"cells":[[20,2,144,0,13,0,120],[30,2,6,32,19,0,121],[22,2,146,2,17,0,122],[24,2,228,4,22,0,123],[26,2,207,8,28,0,124],[28,2,207,16,32,0,125],[36,4,123,256,35,0,126],[40,4,123,512,44,0,127],[52,4,123,4096,53,0,128],[44,4,118,1024,61,0,129],[48,4,118,2048,70,0,130],[64,4,118,8192,77,0,131],[60,4,6,32768,85,0,132],[30,2,6,64,95,0,133]],"na":{"always":[],"rules":{"2":[[20,[3,5,259,261],2]],"3":[[20,[3,5,259,261],2]],"4":[[20,[2,3,5,258,259,261],2]],"5":[[20,[1,3,5,257,259,261],2]],"6":[[20,[3,5,259,261],2]],"7":[[20,[5,261],2]],"9":[[20,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,261,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]],"10":[[20,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,261,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]],"11":[[20,[0,1,2,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]]},"all":[5,9,10,11]}},{"code":19,"name":"HEAD","head":"UNo. UNIT   PAT.   HEAD   SPDL","shape":255,"tool":0,"cells":[[20,2,145,4,12,0,134],[22,2,209,2,20,0,0],[24,2,222,0,27,0,135]],"na":{"always":[],"rules":{"2":[[20,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]]},"all":[2]}},{"code":48,"name":"BAR","head":"UNo. UNIT    PART           CPT-X    CPT-Z      FIN-X      FIN-Z","shape":168,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,6,2048,19,0,48],[36,4,123,64,28,0,136],[40,4,123,128,38,0,137],[52,4,123,65536,48,0,138],[56,4,123,131072,59,0,139]]},{"code":49,"name":"CPY","head":"UNo. UNIT    PART           CPT-X   CPT-Z    SRV-X   SRV-Z    FIN-X     FIN-Z","shape":168,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,6,2048,19,0,48],[36,4,123,64,28,0,136],[40,4,123,128,36,0,137],[44,4,123,256,45,0,140],[48,4,123,512,53,0,66],[52,4,123,65536,62,0,138],[56,4,123,131072,72,0,139]]},{"code":54,"name":"T.DRILL","head":"UNo. UNIT    PART              DIA","shape":173,"tool":180,"cells":[[20,2,8,0,13,0,119],[92,4,6,2048,19,0,48],[8,2,6,2,23,0,141],[36,4,123,64,31,0,50]],"na":{"always":[0],"rules":{}}},{"code":50,"name":"CORNER","head":"UNo. UNIT    PART                FIN-X     FIN-Z","shape":169,"tool":180,"cells":[[20,2,233,0,13,0,0],[92,4,6,2048,19,0,48],[52,4,123,65536,33,0,138],[56,4,123,131072,43,0,139]]},{"code":51,"name":"FACING","head":"UNo. UNIT    PART            FIN-Z","shape":170,"tool":180,"cells":[[20,2,8,0,13,0,119],[92,4,6,2048,19,0,48],[56,4,123,131072,29,0,139]],"na":{"always":[0],"rules":{}}},{"code":52,"name":"THREAD","head":"UNo. MODE    PART           CHAMF  LEAD    ANG  MULTI  HGT","shape":171,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,6,2048,19,0,48],[8,2,6,2,15,0,141],[24,2,207,4,30,0,142],[56,4,141,134217728,34,0,143],[36,4,104,64,43,0,144],[26,2,207,8,49,0,145],[40,4,123,128,55,256,146]]},{"code":53,"name":"T.GROOVE","head":"UNo. UNIT    PART             PAT   No.  PITCH    WIDTH    FINISH","shape":172,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,6,2048,19,0,48],[22,2,206,2,31,0,141],[24,2,207,4,37,0,147],[40,4,123,128,41,0,148],[36,4,123,64,51,0,149],[52,4,123,65536,60,0,0]],"na":{"always":[],"rules":{"5":[[22,[4,5],2]],"6":[[22,[0],2]]}}},{"code":55,"name":"T.TAP","head":"UNo. UNIT    PART             NOM-DIA       PITCH","shape":173,"tool":180,"cells":[[20,2,8,0,13,0,119],[92,4,6,2048,19,0,48],[36,4,287,64,31,0,37],[56,4,142,134217728,44,512,58]],"na":{"always":[0],"rules":{}}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3 FIN-X  FIN-Z  C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,7,0,36],[36,4,286,1,12,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,0],[48,4,125,65536,33,0,0],[52,4,123,131072,41,0,150],[76,4,123,2097152,41,0,151],[28,2,207,16777216,46,0,152],[56,4,123,262144,49,0,153],[68,4,123,524288,56,0,138],[72,4,123,1048576,63,0,139],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"pctx":{"7":{"49":"na","51":"na","53":"na","55":"na"},"11":{"48":"","49":"","50":"","51":"","52":"na","53":"","54":"","55":""},"12":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","55":"na"},"13":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"14":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"8":{"48":"na","49":"na","50":"na","51":"na","52":"na","55":"na"},"9":{"49":"na","50":"na","51":"na","52":"","53":"na","55":"na"},"10":{"49":"","50":"","51":"","52":"","53":"","54":"","55":""},"16":{"52":"na","55":"na"}}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3  RPM SPDL-ROT C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,9,0,36],[36,4,286,1,14,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,141],[48,4,125,65536,33,0,154],[52,4,123,131072,41,0,150],[76,4,6,2097152,41,0,151],[28,2,6,16777216,46,0,152],[56,4,123,262144,49,0,153],[34,2,207,1073741824,57,0,155],[16,1,48,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}}},{"code":17,"name":"WORK MES","head":"UNo. UNIT COMPENSATE   OFS-TOOL      COMP.DATA  SNS-TOOL          No.  INTERVAL OUTPUT","shape":185,"tool":0,"cells":[[28,1,313,0,14,0,0],[16,1,43,2,20,0,35],[17,1,6,2,24,0,0],[40,4,286,2,29,0,37],[18,1,265,2,35,0,38],[15,1,314,0,38,0,157],[9,1,43,0,48,0,0],[10,1,6,0,56,0,0],[36,4,286,1,59,0,37],[11,1,265,1,64,0,38],[8,1,72,2048,66,0,0],[22,2,69,2048,67,0,33],[24,2,207,65536,73,0,0],[13,1,30,0,83,0,0]],"na":{"always":[],"rules":{"3":[[28,[1]]],"5":[[28,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[3,5],"blank":{"1":[[28,[1]]],"4":[[28,[1]]]},"blankall":[1,4]}},{"code":168,"name":"","head":"FIG PTN S-CNR    SPT-X    SPT-Z    FPT-X   FPT-Z    F-CNR/$    R/th       RGH","shape":65532,"tool":0,"cells":[[8,1,64,1,3,0,158],[52,4,190,1024,8,2048,159],[36,4,161,64,18,1,160],[40,4,161,128,26,2,161],[44,4,160,256,35,4,162],[48,4,160,512,43,8,163],[56,4,191,2048,52,4096,164],[60,4,178,4096,62,0,165],[13,1,255,2,63,0,166],[14,1,255,4,69,0,167],[64,4,192,8192,74,32768,86]],"na":{"always":[],"rules":{"1":[[8,[5,21,37,53,69,85,101,117,133,149,165,181,197,213,229,245]]],"2":[[8,[1,17,33,49,65,81,97,113,129,145,161,177,193,209,225,241]]],"3":[[8,[1,17,33,49,65,81,97,113,129,145,161,177,193,209,225,241]]],"4":[[8,[5,21,37,53,69,85,101,117,133,149,165,181,197,213,229,245]]],"5":[[8,[5,21,37,53,69,85,101,117,133,149,165,181,197,213,229,245]]],"6":[[8,[5,21,37,53,69,85,101,117,133,149,165,181,197,213,229,245]]],"7":[[8,[1,17,33,49,65,81,97,113,129,145,161,177,193,209,225,241]]]},"all":[2,3,7],"blank":{"8":[[8,[0,1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,33,34,35,36,37,49,50,51,52,53,64,65,66,67,68,69,81,82,83,84,85,97,98,99,100,101,113,114,115,116,117,128,129,130,131,132,133,145,146,147,148,149,161,162,163,164,165,177,178,179,180,181,193,194,195,196,197,209,210,211,212,213,225,226,227,228,229,241,242,243,244,245]]],"9":[[8,[0,1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,33,34,35,36,37,49,50,51,52,53,64,65,66,67,68,69,81,82,83,84,85,97,98,99,100,101,113,114,115,116,117,128,129,130,131,132,133,145,146,147,148,149,161,162,163,164,165,177,178,179,180,181,193,194,195,196,197,209,210,211,212,213,225,226,227,228,229,241,242,243,244,245]]],"10":[[8,[5,21,37,53,69,85,101,117,133,149,165,181,197,213,229,245]]],"7":[[8,[5,21,37,53,69,85,101,117,133,149,165,181,197,213,229,245]]]},"blankall":[8,9]}},{"code":169,"name":"","head":"FIG              SPT-X     SPT-Z     FPT-X     FPT-Z      F-CNR/$          RGH","shape":65532,"tool":1,"cells":[[36,4,123,64,17,1,160],[40,4,123,128,27,2,161],[44,4,123,256,37,4,162],[48,4,123,512,47,8,163],[56,4,191,2048,57,4096,164],[56,4,6,4096,63,0,0],[64,4,192,8192,74,32768,86]]},{"code":170,"name":"","head":"FIG              SPT-X     SPT-Z     FPT-X     FPT-Z                       RGH","shape":65532,"tool":1,"cells":[[36,4,131,64,17,1,160],[40,4,131,128,27,2,161],[44,4,131,256,37,4,162],[48,4,131,512,47,8,163],[64,4,192,8192,74,32768,86]]},{"code":171,"name":"","head":"FIG              SPT-x     SPT-z     FPT-x     FPT-z","shape":65532,"tool":0,"cells":[[36,4,134,64,17,1,160],[40,4,123,128,27,2,161],[44,4,133,256,37,4,162],[48,4,123,512,47,8,163]]},{"code":172,"name":"","head":"FIG     S-CNR    SPT-X     SPT-Z     FPT-X     FPT-Z    F-CNR    ANGLE     RGH","shape":65532,"tool":1,"cells":[[52,4,190,1024,7,2048,159],[36,4,131,64,17,1,160],[40,4,131,128,27,2,161],[44,4,131,256,37,4,162],[48,4,137,512,47,8,163],[56,4,190,2048,56,4096,164],[60,4,178,4096,65,0,168],[64,4,192,8192,74,32768,86]],"na":{"always":[4],"rules":{}}},{"code":173,"name":"","head":"FIG                        SPT-Z               FPT-Z","shape":65532,"tool":1,"cells":[[40,4,131,128,27,2,161],[48,4,131,512,47,8,163]]},{"code":15,"name":"WPCSHIFT","head":"UNo. UNIT     SHIFT-X   SHIFT-Y   SHIFT-Z    SHIFT-\u0001          COORD.th","shape":255,"tool":0,"cells":[[36,4,123,1,15,0,169],[40,4,123,2,25,0,170],[48,4,123,8,35,0,171],[56,4,118,64,45,0,172],[60,4,6,128,54,0,172],[44,4,118,4,64,0,173],[8,1,30,65536,76,0,174]]},{"code":184,"name":"","head":"FIG PTN          SPT-X     SPT-Z     FPT-X     FPT-Z              RADIUS","shape":65532,"tool":0,"cells":[[8,2,65,1,4,0,158],[36,4,123,64,17,0,160],[40,4,123,128,27,0,161],[44,4,123,256,37,0,162],[48,4,123,512,47,0,163],[60,4,123,4096,67,0,175]],"na":{"always":[],"rules":{"1":[[8,[1],2]],"2":[[8,[1],2]],"3":[[8,[5],2]],"4":[[8,[5],2]],"5":[[8,[1,2,5],2]]},"all":[1,2,5]}},{"code":57,"name":"MILLTURN","head":"UNo. UNIT                 CPT-X    CPT-Z      FIN-X      FIN-Z    SHIFT-Y","shape":168,"tool":180,"cells":[[20,2,6,0,10,0,119],[92,4,6,2048,18,0,48],[36,4,123,64,26,0,136],[40,4,123,128,36,0,137],[52,4,123,65536,46,0,138],[56,4,123,131072,57,0,139],[68,4,123,1048576,67,0,170]]},{"code":180,"name":"","head":"SNo TOOL        NOM-Dia No.  PAT. DEP-1     Z-DEC        RPM          C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,43,0,4,0,35],[10,1,239,0,11,0,36],[36,4,286,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,24,0,0],[22,2,69,2048,25,0,33],[16,1,51,0,30,0,156],[48,4,123,65536,34,0,0],[52,4,123,131072,43,0,176],[76,4,6,2097152,43,0,151],[28,2,6,16777216,46,0,152],[56,4,6,262144,49,0,153],[34,4,207,1073741824,57,0,155],[16,1,6,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[],"rules":{},"blank":{"3":[[9,[4,5,6,7,8,9,37,38,39,40,41,42]]]}}},{"code":23,"name":"COMMENT","head":"UNo. UNIT","shape":255,"tool":0,"cells":[[8,48,305,1,13,0,177]]},{"code":166,"name":"","head":"SNo. DATA 1    DATA 2    DATA 3    DATA 4    DATA 5    DATA 6    DATA 7    DATA 8    DATA 9","shape":65532,"tool":1,"cells":[[8,1,298,0,4,0,113],[36,4,151,1,7,0,0],[10,1,298,0,14,0,113],[40,4,151,2,17,0,0],[12,1,298,0,24,0,113],[44,1,151,4,27,0,0],[14,1,298,0,34,0,113],[48,4,151,8,37,0,0],[16,1,298,0,44,0,113],[52,4,151,16,47,0,0],[18,1,298,0,54,0,113],[56,4,151,32,57,0,0],[20,1,298,0,64,0,113],[60,4,151,64,67,0,0],[22,1,298,0,74,0,113],[64,4,151,128,77,0,0],[24,1,298,0,84,0,113],[68,4,151,256,87,0,0]]},{"code":127,"name":"TEXT","head":"UNo. UNIT     C-FACE     TEXT                                            HGT       DEPTH","shape":196,"tool":181,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,12,0,48],[96,4,6,4096,18,0,49],[36,40,305,1,25,0,178],[76,4,123,2,73,0,179],[80,4,123,4,83,0,180]]},{"code":181,"name":"","head":"SNo  TOOL  NOM-D  No.   APRCH-X  APRCH-Y TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,8,2,24,1,105],[44,4,8,4,33,2,106],[15,1,8,128,41,0,107],[14,1,241,0,46,0,108],[48,4,8,8,50,0,109],[52,4,8,16,57,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"na":{"always":[7,8,9,11,12],"rules":{}},"pctx":{"10":{"96":"na"}}},{"code":196,"name":"","head":"FIG PTN    Z        X        Y       RADIUS   ANGLE   PITCH    Q","shape":65532,"tool":1,"cells":[[8,1,58,0,4,0,77],[36,4,127,2048,10,0,78],[40,4,123,2,19,0,181],[44,4,123,4,28,0,182],[52,4,123,8,38,0,175],[48,4,118,16,46,0,183],[56,4,123,32,54,0,184],[16,1,32,1024,63,0,185]],"na":{"always":[],"rules":{"2":[[8,[4,5,6,7]]],"3":[[8,[4,5,6,7]]],"4":[[8,[4,7]]],"5":[[8,[4,7]]],"6":[[8,[4,7]]],"7":[[8,[7]]]}}},{"code":185,"name":"","head":"SNo. PTN      SPT-X  SPT-Y  SPT-Z  FPT-X  FPT-Y  FPT-Z  LIM+   LIM-   BASE DIR.","shape":65532,"tool":1,"cells":[[8,2,67,0,4,0,0],[12,1,30,0,12,0,0],[11,1,315,0,14,0,0],[36,4,123,1,14,0,0],[22,1,30,33554432,21,0,186],[40,4,123,2,21,0,0],[72,4,123,512,28,0,0],[44,4,123,4,28,0,0],[76,4,6,1024,36,0,0],[48,4,123,8,35,0,0],[52,4,123,16,42,0,0],[56,4,123,32,49,0,0],[60,4,123,64,56,0,0],[64,4,123,128,63,0,0],[10,1,30,131072,70,0,187],[20,1,77,0,77,0,188]],"na":{"always":[],"rules":{"3":[[8,[19],2]],"9":[[8,[19,20],2]],"10":[[8,[19,20],2]],"11":[[8,[19,20],2]],"14":[[8,[19,20],2]],"15":[[8,[19,20],2]]},"blank":{"1":[[8,[0,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"2":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"3":[[8,[20],2]],"4":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"5":[[8,[19,20],2]],"6":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"7":[[8,[19,20],2]]},"blankall":[2,4,6]}},{"code":20,"name":"TOOL-MES","head":"UNo. UNIT    COMPENSATE   OFS-TOOL            No.    INTERVAL  OUTPUT","shape":186,"tool":0,"cells":[[28,1,312,0,16,0,0],[9,1,43,0,23,0,35],[10,1,239,0,31,0,0],[36,4,286,1,36,0,37],[11,1,265,0,41,0,38],[8,1,72,2048,46,0,0],[22,2,69,2048,47,0,33],[24,2,207,65536,55,0,0],[13,1,30,0,64,0,0]],"na":{"always":[],"rules":{},"blank":{"2":[[9,[23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]}}},{"code":186,"name":"","head":"SNo. PTN        TOOL.LENGTH/X       TOOL.DIA./Z      UNIT    DIR.","shape":65532,"tool":1,"cells":[[8,2,68,0,4,0,0],[60,4,123,64,19,0,0],[64,4,123,128,38,0,0],[11,2,207,262144,54,0,0]]},{"code":455,"name":"","head":"FIG PTN    SPT-R         SPT-th          SPT-Z      PITCH   ANG     Q","shape":65532,"tool":1,"cells":[[8,1,58,0,4,0,0],[40,4,123,2,12,0,189],[44,4,118,4,26,0,190],[36,4,123,2048,41,0,161],[60,4,123,64,52,0,184],[56,4,118,32,60,0,191],[16,1,32,1024,68,0,185]],"na":{"always":[],"rules":{"2":[[8,[4,5,6,7]]],"3":[[8,[4,5,6,7]]],"4":[[8,[4,7]]],"5":[[8,[4,7]]],"6":[[8,[4,7]]]}}},{"code":208,"name":"","head":"TPC Clearance TC37   TC38      TC39      TC40   TC62  Parameters","shape":65533,"tool":0,"cells":[[46,2,95,0,10,0,0],[48,2,95,0,20,0,0],[50,2,95,0,30,0,0],[52,2,95,0,40,0,0],[56,2,207,0,50,0,0],[26,4,6,16,91,0,0],[30,4,6,64,101,0,0],[34,4,6,256,111,0,0],[38,4,6,512,121,0,0],[42,4,6,1024,131,0,0],[46,4,6,2048,141,0,0],[12,2,207,0,55,0,0],[8,2,207,0,60,0,0],[10,2,207,0,65,0,0],[14,2,207,0,70,0,0],[16,2,207,0,75,0,0],[18,2,207,0,80,0,0],[20,2,207,0,85,0,0],[22,2,207,0,90,0,0],[24,2,207,0,95,0,0]]},{"code":240,"name":"","head":"","shape":65533,"tool":0,"cells":[[36,4,123,1,7,0,0],[40,4,123,2,15,0,0],[44,4,123,4,24,0,0],[48,4,123,8,41,0,0],[52,4,123,16,49,0,0],[56,4,123,32,57,0,0],[60,4,123,64,74,0,0],[64,4,123,128,82,0,0],[68,4,123,256,90,0,0],[20,2,207,65536,32,0,0],[22,2,207,131072,65,0,0],[24,2,207,262144,98,0,0],[72,2,207,524288,36,0,0],[76,2,207,1048576,69,0,0],[80,2,207,2097152,102,0,0]]},{"code":241,"name":"","head":"Tur Rot Pos.Ruf=SU10 SU50   SU51      X         Z    Fin=SU10 SU50   SU51      X         Z","shape":65533,"tool":0,"cells":[[12,1,30,1,17,0,0],[20,2,95,4,19,0,0],[24,2,95,16,26,0,0],[52,4,123,1024,35,0,0],[60,4,123,4096,45,0,0],[18,2,6,1,57,0,0],[22,2,6,4,62,0,0],[26,2,6,16,67,0,0],[30,2,6,64,73,0,0],[16,1,30,65536,59,0,0],[36,2,95,262144,61,0,0],[40,2,95,1048576,68,0,0],[76,4,112,67108864,77,0,0],[84,4,112,268435456,87,0,0],[20,2,6,2,136,0,0],[24,2,6,8,143,0,0],[28,2,6,32,148,0,0],[32,2,6,128,154,0,0]]},{"code":21,"name":"SIMULTAN","head":"UNo. UNIT     No.   Simul.No.          RPM","shape":255,"tool":0,"cells":[[8,1,72,2048,13,0,0],[22,2,69,2048,14,0,33],[19,1,30,134217728,22,0,0],[24,2,207,65536,39,0,0]]},{"code":451,"name":"","head":"FIG PTN    SPT-R/x       SPT-th/y        SPT-Z      PITCH   ANG     Q","shape":65532,"tool":1,"cells":[[8,1,58,0,4,0,0],[40,4,165,2,12,0,189],[44,4,169,4,26,0,190],[36,4,123,2048,41,0,161],[60,4,123,64,52,0,184],[56,4,118,32,60,0,183],[16,1,32,1024,68,0,185]],"na":{"always":[],"rules":{"2":[[8,[4,5,6,7]]],"3":[[8,[4,5,6,7]]],"4":[[8,[4,7]]],"5":[[8,[4,7]]],"6":[[8,[4,7]]]}}},{"code":452,"name":"","head":"FIG PTN    SPT-R     SPT-th    SPT-X                NUM     ANG     Q  R","shape":65532,"tool":0,"cells":[[8,1,54,0,4,0,0],[40,4,123,2,12,0,192],[44,4,118,4,22,0,193],[36,4,123,2048,32,0,160],[48,4,6,8,42,0,182],[20,2,207,128,52,0,194],[56,4,118,32,60,0,195],[16,1,30,1024,68,0,80],[17,1,30,4096,71,0,81]],"na":{"always":[],"rules":{"5":[[8,[1]]],"6":[[8,[1,5]]],"7":[[8,[1,5]]]},"all":[5,6,7]}},{"code":456,"name":"","head":"FIG PTN    SPT-R         SPT-th          SHIFT      NUM   ANG       Q  R","shape":65532,"tool":0,"cells":[[8,1,54,0,4,0,0],[40,4,123,2,12,0,192],[44,4,118,4,26,0,193],[36,4,123,2048,42,0,196],[20,2,207,128,52,0,194],[56,4,118,32,59,0,195],[16,1,30,1024,68,0,80],[17,1,30,4096,71,0,81]],"na":{"always":[],"rules":{"4":[[8,[1]]],"5":[[8,[1,5]]],"6":[[8,[1,5]]]},"all":[4,5,6]}},{"code":448,"name":"","head":"FIG PTN    SPT-R/x       SPT-th/y        SPT-Z      NUM     ANG     Q  R","shape":65532,"tool":0,"cells":[[8,1,54,0,4,0,0],[40,4,165,2,12,0,189],[44,4,169,4,26,0,190],[36,4,123,2048,41,0,161],[20,2,207,128,52,0,194],[56,4,118,32,60,0,195],[16,1,30,1024,68,0,80],[17,1,30,4096,71,0,81]],"na":{"always":[],"rules":{"4":[[8,[1]]],"5":[[8,[1,5]]],"6":[[8,[1,5]]]},"all":[4,5,6]}},{"code":449,"name":"","head":"FIG PTN  P1Rx/CRx P1thy/Cthy P3Rx/R  P3thy      CN1      CN2      CN3      CN4","shape":65532,"tool":0,"cells":[[8,1,55,0,4,0,0],[36,4,165,2,9,0,0],[40,4,169,4,18,0,0],[44,4,166,8,28,0,0],[48,4,170,16,38,0,83],[52,4,262,32,47,256,0],[56,4,262,64,56,512,0],[60,4,262,128,65,1024,0],[64,4,262,256,74,2048,0]],"na":{"always":[],"rules":{"4":[[8,[17]]],"5":[[8,[17]]],"6":[[8,[17]]],"7":[[8,[17]]],"8":[[8,[17]]]}}},{"code":453,"name":"","head":"FIG PTN  P1X/CX   P1th/Cth  P3X/R    P3th       CN1      CN2      CN3      CN4","shape":65532,"tool":0,"cells":[[8,1,55,0,4,0,0],[36,4,123,2,9,0,0],[40,4,118,4,18,0,0],[44,4,123,8,28,0,0],[48,4,118,16,38,0,197],[52,4,262,32,47,256,0],[56,4,262,64,56,512,0],[60,4,262,128,65,1024,0],[64,4,262,256,74,2048,0]],"na":{"always":[],"rules":{"4":[[8,[17]]],"5":[[8,[17]]],"6":[[8,[17]]],"7":[[8,[17]]],"8":[[8,[17]]]}}},{"code":450,"name":"","head":"FIG  PTN     R/x       th/y      Rad/th.    I       J         P    CNR      R-FEED  RGH","shape":65532,"tool":0,"cells":[[12,1,26,0,3,0,0],[8,1,57,0,4,0,0],[40,4,165,2,13,1,84],[44,4,169,4,23,2,85],[48,4,181,8,33,4,0],[52,4,168,16,42,8,0],[56,4,172,32,51,16,0],[13,1,256,0,61,0,0],[60,4,262,64,66,256,0],[76,4,193,32768,76,0,198],[64,4,192,128,84,32768,86]],"na":{"always":[],"rules":{"2":[[8,[35,36,37,38]]],"3":[[8,[35,36,37,38]]],"4":[[8,[35,38]]],"5":[[8,[35,38]]],"6":[[8,[35,38]]],"7":[[8,[38]]],"8":[[8,[35,36,37,38]]],"9":[[8,[35,36,37,38]]],"10":[[8,[35,36,37,38]]]},"blank":{"7":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[7]}},{"code":454,"name":"","head":"FIG  PTN     X         th        Rad/th.    I       J         P    CNR    R-FEED  RGH","shape":65532,"tool":0,"cells":[[12,1,26,0,3,0,0],[8,1,57,0,4,0,0],[40,4,131,2,13,1,84],[44,4,119,4,23,2,49],[48,4,181,8,33,4,0],[52,4,131,16,43,8,0],[56,4,119,32,52,16,199],[13,1,256,0,61,0,0],[60,4,262,64,66,256,0],[76,4,193,32768,76,0,198],[64,4,192,128,84,32768,86]],"na":{"always":[],"rules":{"2":[[8,[35,36,37,38]]],"3":[[8,[35,36,37,38]]],"4":[[8,[35,38]]],"5":[[8,[35,38]]],"6":[[8,[35,38]]],"7":[[8,[38]]],"8":[[8,[35,36,37,38]]],"9":[[8,[35,36,37,38]]],"10":[[8,[35,36,37,38]]]},"blank":{"7":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[7]},"variants":{"0":{"head":"FIG  PTN     X         th        Rad/th.    I       J         P    CNR      R-FEED  RGH"},"1":{"head":"FIG  PTN     X         th        Rad/th.    I       J         P    CNR      R-FEED  RGH"},"2":{"head":"FIG  PTN     X         th        Rad/th.    I       J         P    CNR      R-FEED  RGH"}}},{"code":179,"name":"","head":"SNO  TOOL  NOM-D  NO  APRCH-X  APRCH-Y TYPE  DEPTH  #T PITCH  C-SP   FR   M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,24,1,105],[44,4,138,4,33,2,106],[15,1,278,0,39,0,107],[48,4,123,8,45,0,108],[14,1,30,1024,53,0,109],[56,4,123,8,55,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}}},{"code":112,"name":"ROTATE-1  0-1","head":"UNo. UNIT    GL-FL    ROT.AXIS      DIST/0     MAT.HIGH     FIN     CUT-PROC","shape":128,"tool":179,"cells":[[36,4,118,1,36,0,0],[40,4,123,2,47,0,0],[44,4,123,4,60,0,200],[11,1,259,8,70,0,0]]},{"code":113,"name":"ROTATE-2  0-2","head":"UNo. UNIT    GL-FL    ROT.AXIS      DIST/0     MAT.HIGH     FIN     CUT-PROC","shape":128,"tool":179,"cells":[[36,4,118,1,36,0,0],[40,4,123,2,47,0,0],[44,4,123,4,60,0,200],[11,1,259,8,70,0,0]]},{"code":114,"name":"ROTATE-3  1-1","head":"UNo. UNIT    GL-FL    ROT.AXIS      DIST/0     MAT.HIGH     FIN     CUT-PROC","shape":128,"tool":179,"cells":[[36,4,8,1,36,0,0],[40,4,123,2,47,0,0],[44,4,123,4,60,0,200],[11,1,259,8,70,0,0]],"na":{"always":[0],"rules":{}}},{"code":115,"name":"ROTATE-4  1-2","head":"UNo. UNIT    GL-FL    ROT.AXIS      DIST/0     MAT.HIGH     FIN     CUT-PROC","shape":128,"tool":179,"cells":[[36,4,8,1,36,0,0],[40,4,123,2,47,0,0],[44,4,123,4,60,0,200],[11,1,259,8,70,0,0]],"na":{"always":[0],"rules":{}}},{"code":116,"name":"PARALL-1  0-1","head":"UNo. UNIT    GL-FL    ROT.AXIS      DIST/0     MAT.HIGH     FIN     CUT-PROC","shape":128,"tool":179,"cells":[[18,4,123,1,36,0,0],[40,4,123,2,47,0,0],[44,4,123,4,60,0,200],[11,1,259,8,70,0,0]]},{"code":117,"name":"PARALL-2  0-2","head":"UNo. UNIT    GL-FL    ROT.AXIS      DIST/0     MAT.HIGH     FIN     CUT-PROC","shape":128,"tool":179,"cells":[[18,4,123,1,36,0,0],[40,4,123,2,47,0,0],[44,4,123,4,60,0,200],[11,1,259,8,70,0,0]]},{"code":118,"name":"PARALL-3  1-1","head":"UNo. UNIT    GL-FL    ROT.AXIS      DIST/0     MAT.HIGH     FIN     CUT-PROC","shape":128,"tool":179,"cells":[[18,4,8,1,36,0,0],[40,4,123,2,47,0,0],[44,4,123,4,60,0,200],[11,1,259,8,70,0,0]],"na":{"always":[0],"rules":{}}},{"code":1,"name":"_","head":"UNo. MAT      INITIAL-Z ATC-MODE MULTI-MODE  MULTI FLAG  PITCH-X  PITCH-Y  DIS.","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,1,13,0,0],[40,4,123,2,17,0,2],[10,1,31,128,26,0,3],[9,1,246,64,33,0,4],[20,2,202,32,45,0,5],[48,4,135,8,57,0,6],[52,4,135,16,66,0,7],[11,1,30,0,76,0,0]],"na":{"always":[],"rules":{"5":[[9,[1,3]]],"6":[[9,[1,3]]],"7":[[9,[1,3]]]},"all":[5,6,7]}},{"code":4,"name":"END","head":"UNo. UNIT CONTI. REPEAT SHIFT  NUMBER ATC  RETURN             Work-No.                   EXECTE","shape":166,"tool":0,"cells":[[9,1,31,2,11,0,19],[24,2,6,32,17,0,20],[68,4,6,128,23,0,21],[10,1,30,4,32,0,22],[11,1,32,8,39,0,23],[72,4,6,512,27,0,24],[8,1,6,1,35,0,25],[12,1,211,16,43,0,26],[13,1,6,256,52,0,27],[36,29,304,64,61,0,28],[14,1,312,0,91,0,29]]},{"code":161,"name":"","head":"SNo. G1  G2  DATA 1    DATA 2    DATA 3    DATA 4    DATA 5    DATA 6     S    M/B","shape":65532,"tool":0,"cells":[[20,1,34,1,5,64,93],[22,1,34,2,9,64,93],[8,1,248,0,12,0,94],[36,4,194,0,14,64,0],[9,1,248,0,22,0,94],[40,4,194,0,24,64,0],[10,1,248,0,32,0,94],[44,4,194,0,34,64,0],[11,1,248,0,42,0,94],[48,4,194,0,44,64,0],[12,1,248,0,52,0,94],[52,4,194,0,54,64,0],[13,1,248,0,62,0,94],[56,4,194,0,64,64,0],[60,4,107,4,73,0,95],[19,1,279,8,79,128,96],[24,2,207,8,80,0,0]],"na":{"always":[],"rules":{},"blank":{"3":[[8,[0]]],"5":[[9,[0]]],"7":[[10,[0]]],"9":[[11,[0]]],"11":[[12,[0]]],"13":[[13,[0]]]}}},{"code":177,"name":"","head":"SNo  TOOL  NOM-D  No.   APRCH-X  APRCH-Y TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,24,1,105],[44,4,138,4,33,2,106],[15,1,277,128,41,0,107],[14,1,241,0,46,0,108],[48,4,123,8,50,0,109],[52,4,126,16,57,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"na":{"always":[],"rules":{"11":[[9,[1]]]},"all":[11]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,14],[16,18],[20,255]],[[1,1]],[[13,13]],[[15,15]],[[19,19]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":2,"66":2,"67":3,"68":3,"80":2,"81":2,"82":3,"83":3,"96":4,"97":5,"98":5,"99":5,"100":5,"101":5,"102":6,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0":0,"0/1":1,"0/2":0,"0/3":0,"0/4":0,"1/0":0,"1/1":1,"1/2":0,"1/3":0,"1/4":0},{"0/0":2,"0/1":3,"0/2":3,"0/3":4,"0/4":4,"1/0":3,"1/1":3,"1/2":3,"1/3":5,"1/4":5},{"0/0":2,"0/1":3,"0/2":3,"0/3":2,"0/4":4,"1/0":3,"1/1":3,"1/2":3,"1/3":3,"1/4":5},{"0/0":0,"0/1":1,"0/2":1,"0/3":0,"0/4":6,"1/0":1,"1/1":1,"1/2":1,"1/3":1,"1/4":7},{"0/0":8,"0/1":9,"0/2":8,"0/3":8,"0/4":8,"1/0":9,"1/1":9,"1/2":9,"1/3":9,"1/4":9},{"0/0":0,"0/1":1,"0/2":0,"0/3":0,"0/4":0,"1/0":1,"1/1":1,"1/2":1,"1/3":1,"1/4":1},{"0/0":6,"0/1":7,"0/2":7,"0/3":6,"0/4":6,"1/0":7,"1/1":7,"1/2":7,"1/3":7,"1/4":7}],"own":[{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n","n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","na","n","n","n","n","n","n"]]}},{"code":178,"name":"","head":"SNo  TOOL  NOM-D  No APRCH-X  APRCH-Y TYPE ZFD TYPE PK-DEP DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,23,1,105],[44,4,138,4,32,2,106],[15,1,277,128,40,0,107],[14,1,241,0,45,0,108],[16,1,242,0,49,0,111],[76,4,123,268435456,54,0,112],[48,4,123,8,61,0,109],[52,4,128,16,68,0,0],[60,4,105,32,74,0,104],[64,4,125,64,80,0,87],[24,2,207,256,87,0,39],[26,2,207,512,91,0,39],[32,2,207,536870912,95,0,39]],"na":{"always":[],"rules":{"14":[[9,[1,13]]],"11":[[9,[13]],[14,[128]]],"13":[[9,[1,13]]],"12":[[16,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[12,13,14]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"13":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"14":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9,14,16],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]],[[[0,127],[129,255]],[[128,128]]],[[[0,2],[4,255]],[[3,3]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":2,"98":2,"99":2,"100":2,"101":2,"102":4,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":0,"1/0/0/1":1,"1/0/1/0":0,"1/0/1/1":0,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":4,"0/0/0/1":5,"0/0/1/0":4,"0/0/1/1":4,"0/1/0/0":6,"0/1/0/1":7,"0/1/1/0":6,"0/1/1/1":6,"0/2/0/0":6,"0/2/0/1":6,"0/2/1/0":6,"0/2/1/1":6,"1/0/0/0":8,"1/0/0/1":9,"1/0/1/0":8,"1/0/1/1":8,"1/1/0/0":6,"1/1/0/1":7,"1/1/1/0":6,"1/1/1/1":6,"1/2/0/0":6,"1/2/0/1":6,"1/2/1/0":6,"1/2/1/1":6},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":10,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":1,"0/1/0/0":2,"0/1/0/1":2,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":11,"1/1/0/0":2,"1/1/0/1":2,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":12,"0/0/0/1":13,"0/0/1/0":12,"0/0/1/1":12,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":2,"1/0/0/1":3,"1/0/1/0":2,"1/0/1/1":2,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2}],"own":[{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"na"},"0/0/*/1":{"10":"na"},"0/1/*/0":{"10":"na"},"0/1/*/1":{"10":"na"},"0/2/*/0":{"10":"na"},"0/2/*/1":{"10":"na"},"1/0/*/0":{"10":"na"},"1/0/*/1":{"10":"na"},"1/1/*/0":{"10":"na"},"1/1/*/1":{"10":"na"},"1/2/*/0":{"10":"na"},"1/2/*/1":{"10":"na"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"n"},"0/1/0/*":{"11":"na"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"n"},"1/1/0/*":{"11":"na"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","na","n","n","n","n","n"]]}},{"code":1,"name":"_","head":"UNo. MAT.    TYPE      OD-MAX  ID-MIN  LENGTH   WORK-FACE  ATC-MODE  RPM","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,0,13,0,0],[64,4,123,256,23,0,114],[68,4,123,512,31,0,115],[72,4,123,1024,40,0,116],[76,4,135,2048,50,0,117],[10,1,31,128,62,0,3],[60,4,107,65536,68,0,118]]},{"code":18,"name":"TRANSFER","head":"UNo. MODE   PAT HEAD SPDL PUSH CHUCK  W1      W2       MOVEMENT  C1      C2","shape":255,"tool":0,"cells":[[20,2,144,0,13,0,120],[30,2,6,32,19,0,121],[22,2,146,2,17,0,122],[24,2,228,4,22,0,123],[26,2,207,8,28,0,124],[28,2,207,16,32,0,125],[36,4,123,256,35,0,126],[40,4,123,512,44,0,127],[52,4,123,4096,53,0,128],[44,4,118,1024,61,0,129],[48,4,118,2048,70,0,130],[64,4,118,8192,77,0,131],[60,4,6,32768,85,0,132],[30,2,6,64,95,0,133]],"na":{"always":[],"rules":{"2":[[20,[3,5,259,261],2]],"3":[[20,[3,5,259,261],2]],"4":[[20,[2,3,5,258,259,261],2]],"5":[[20,[1,3,5,257,259,261],2]],"6":[[20,[3,5,259,261],2]],"7":[[20,[5,261],2]],"9":[[20,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,261,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]],"10":[[20,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,261,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]],"11":[[20,[0,1,2,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]]},"all":[5,9,10,11]}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3 FIN-X  FIN-Z  C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,7,0,36],[36,4,286,1,12,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,0],[48,4,125,65536,33,0,0],[52,4,123,131072,41,0,150],[76,4,123,2097152,41,0,151],[28,2,207,16777216,46,0,152],[56,4,123,262144,49,0,153],[68,4,123,524288,56,0,138],[72,4,123,1048576,63,0,139],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"pctx":{"7":{"49":"na","51":"na","55":"na"},"11":{"48":"","49":"","50":"","51":"","52":"na","53":"","54":"","55":""},"12":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","55":"na"},"13":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"14":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"8":{"48":"na","49":"na","50":"na","51":"na","52":"na","55":"na"},"9":{"49":"na","50":"na","51":"na","52":"","53":"na","55":"na"},"10":{"49":"","50":"","51":"","52":"","53":"","54":"","55":""},"16":{"52":"na","55":"na"}}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3  RPM SPDL-ROT C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,9,0,36],[36,4,286,1,14,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,141],[48,4,125,65536,33,0,154],[52,4,123,131072,41,0,150],[76,4,6,2097152,41,0,151],[28,2,6,16777216,46,0,152],[56,4,123,262144,49,0,153],[84,4,107,1073741824,57,0,155],[16,1,48,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}}},{"code":172,"name":"","head":"FIG     S-CNR    SPT-X     SPT-Z     FPT-X     FPT-Z    F-CNR    ANGLE     RGH","shape":65532,"tool":1,"cells":[[52,4,190,1024,7,2048,159],[36,4,131,64,17,1,160],[40,4,131,128,27,2,161],[44,4,131,256,37,4,162],[48,4,137,512,47,8,163],[56,4,190,2048,56,4096,164],[60,4,178,4096,65,0,168],[64,4,192,8192,74,32768,86]],"na":{"always":[4,5,6],"rules":{}}},{"code":15,"name":"WPCSHIFT","head":"UNo. UNIT     SHIFT-X   SHIFT-Y   SHIFT-Z    SHIFT-\u0001  SHIFT-A COORD.th","shape":255,"tool":0,"cells":[[36,4,123,1,15,0,169],[40,4,123,2,25,0,170],[48,4,123,8,35,0,171],[56,4,118,64,45,0,172],[60,4,118,128,54,0,172],[44,4,118,4,64,0,173],[8,1,30,65536,76,0,174]]},{"code":127,"name":"TEXT","head":"UNo. UNIT     C-FACE     TEXT                                            HGT       DEPTH","shape":196,"tool":181,"cells":[[8,1,274,0,14,0,34],[92,4,6,2048,12,0,48],[96,4,6,4096,18,0,49],[36,40,305,1,25,0,178],[76,4,123,2,73,0,179],[80,4,123,4,83,0,180]],"variants":{"0":{"head":"UNo. UNIT                TEXT                                            HGT       DEPTH","cells":{"0":[8,1,6,0,14,0,34]}}}},{"code":179,"name":"","head":"SNO  TOOL  NOM-D  NO  APRCH-X  APRCH-Y TYPE  DEPTH  #T PITCH  C-SP   FR   M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,24,1,105],[44,4,138,4,33,2,106],[15,1,278,0,39,0,107],[48,4,123,8,45,0,108],[14,1,30,1024,53,0,109],[56,4,123,8,55,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"64":"na","102":"na"},"10":{"96":"na"}}},{"code":1,"name":"_","head":"UNo. MAT      INITIAL-Z ATC-MODE MULTI-MODE  MULTI FLAG  PITCH-X  PITCH-Y","shape":255,"tool":0,"cells":[[84,8,301,0,4,0,1],[8,1,6,1,13,0,0],[40,4,123,2,17,0,2],[10,1,31,128,26,0,3],[9,1,246,64,33,0,4],[20,2,202,32,45,0,5],[48,4,135,8,57,0,6],[52,4,135,16,66,0,7]],"na":{"always":[],"rules":{"5":[[9,[1,3]]],"6":[[9,[1,3]]],"7":[[9,[1,3]]]},"all":[5,6,7]}},{"code":4,"name":"END","head":"UNo. UNIT CONTI. REPEAT SHIFT  NUMBER ATC  RETURN             Work-No.                   EXECTE","shape":166,"tool":0,"cells":[[9,1,31,2,11,0,19],[24,2,207,32,17,0,20],[68,4,123,128,23,0,21],[10,1,30,4,32,0,22],[11,1,32,8,39,0,23],[72,4,6,512,27,0,24],[8,1,6,1,35,0,25],[12,1,211,16,43,0,26],[13,1,6,256,52,0,27],[36,29,304,0,61,0,28],[14,1,312,0,91,0,29]]},{"code":5,"name":"SUB-PROG","head":"UNo. UNIT     WORK No.                              $  REPEAT","shape":165,"tool":0,"cells":[[36,32,304,1,13,0,30],[8,1,244,0,46,0,0],[26,1,30,512,52,0,31],[9,1,264,1024,53,0,31],[24,2,207,2,55,0,32]]},{"code":6,"name":"MANL-PRG","head":"UNo. UNIT           TOOL             NOM-DIA      No.       POS-B      CHANGE-PT","shape":161,"tool":0,"cells":[[20,1,6,0,13,0,34],[9,1,43,0,20,0,35],[10,1,6,0,32,0,36],[36,4,288,1,37,0,37],[11,1,265,0,44,0,38],[8,1,72,2048,50,0,0],[22,2,69,2048,51,0,33],[18,1,6,0,55,0,201],[19,1,6,134217728,56,0,0],[92,4,118,65536,60,0,48],[24,1,319,0,72,0,202]]},{"code":7,"name":"M-CODE","head":"UNo. MODE  No.    M1   M2   M3   M4     M5   M6   M7   M8     M9   M10  M11  M12","shape":255,"tool":0,"cells":[[8,1,72,2048,11,0,0],[22,2,69,2048,12,0,33],[18,2,6,0,14,0,201],[36,2,207,1,18,0,39],[38,2,207,2,23,0,39],[40,2,207,4,28,0,39],[42,2,220,8,33,1,39],[44,2,207,16,40,0,39],[46,2,207,32,45,0,39],[48,2,207,64,50,0,39],[50,2,220,128,55,2,39],[52,2,207,65536,62,0,39],[54,2,207,131072,67,0,39],[56,2,207,262144,72,0,39],[58,2,220,524288,77,4,39]]},{"code":8,"name":"MMS","head":"UNo. UNIT     TOOL         NOM-0    No.     U.SKIP       $","shape":162,"tool":0,"cells":[[9,1,43,0,14,0,0],[36,4,123,1,26,0,37],[11,1,265,0,31,0,38],[8,1,72,2048,35,0,0],[22,2,69,2048,36,0,33],[18,1,6,0,40,0,201],[19,1,6,134217728,41,0,203],[13,1,30,0,47,0,40],[49,1,8,0,57,0,0]],"na":{"always":[8],"rules":{}}},{"code":12,"name":"INDEX","head":"UNo. UNIT   TURN POS X   TURN POS Y    TURN POS Z   ANGLE \u0001  ANGLE C","shape":255,"tool":0,"cells":[[48,4,123,16,15,0,43],[52,4,123,32,28,0,44],[56,4,123,64,42,0,45],[60,4,6,128,52,0,46],[40,4,118,4,52,0,47],[44,4,118,8,61,0,0]]},{"code":32,"name":"DRILLING","head":"UNo. UNIT    MODE  POS-B  POS-C     DIA       DEPTH      CHMF","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,25,0,49],[36,4,123,1,36,0,50],[40,4,123,2,46,0,51],[44,4,123,4,57,0,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT          POS-B  POS-C     DIA       DEPTH      CHMF","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACEPOS-B  POS-C     DIA       DEPTH      CHMF","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACEPOS-B  POS-C     DIA       DEPTH      CHMF","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":33,"name":"RGH CBOR","head":"UNo. UNIT    MODE  POS-B  POS-C   CB-DIA    CB-DEP     CHMF  BTM  DIA      DEPTH","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,25,0,49],[56,4,123,8,35,0,53],[60,4,123,16,45,0,54],[44,4,123,4,55,0,52],[11,1,30,32,62,0,55],[36,4,123,1,66,0,50],[40,4,123,2,76,0,51]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT          POS-B  POS-C   CB-DIA    CB-DEP     CHMF  BTM  DIA      DEPTH","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACEPOS-B  POS-C   CB-DIA    CB-DEP     CHMF  BTM  DIA      DEPTH","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACEPOS-B  POS-C   CB-DIA    CB-DEP     CHMF  BTM  DIA      DEPTH","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":34,"name":"RGH BCB","head":"UNo. UNIT    MODE POS-B  POS-C      CB-DIA    CB-DEP     DIA     DEPTH    CHMF","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,25,0,49],[56,4,123,1,37,0,53],[60,4,123,2,47,0,54],[36,4,123,4,57,0,50],[40,4,123,8,65,0,51],[44,4,123,16,75,0,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT          OS-B  POS-C      CB-DIA    CB-DEP     DIA     DEPTH    CHMF","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACEOS-B  POS-C      CB-DIA    CB-DEP     DIA     DEPTH    CHMF","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACEOS-B  POS-C      CB-DIA    CB-DEP     DIA     DEPTH    CHMF","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":35,"name":"REAMING","head":"UNo. UNIT   MODE   POS-B  POS-C   DIA    DEPTH  CHAMFER  PRE-REAM","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,25,0,49],[36,4,123,1,34,0,50],[40,4,123,2,41,0,51],[44,4,123,4,49,0,52],[18,1,238,8,57,0,0],[19,1,6,0,68,0,56]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT   M      POS-B  POS-C   DIA    DEPTH  CHAMFER  PRE-REAM","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT   MC-FACEPOS-B  POS-C   DIA    DEPTH  CHAMFER  PRE-REAM","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT   MC-FACEPOS-B  POS-C   DIA    DEPTH  CHAMFER  PRE-REAM","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":36,"name":"TAPPING","head":"UNo. UNIT  MODE   POS-B   POS-C   NOM-    MAJOR-0   PITCH  TAP-DEP   CHMF","shape":192,"tool":176,"cells":[[20,2,66,0,12,0,204],[92,4,118,2048,16,0,48],[96,4,118,4096,25,0,49],[36,4,287,1,33,0,37],[40,4,123,2,42,0,57],[44,4,123,4,51,0,58],[48,4,123,8,59,0,59],[52,4,123,16,68,0,52],[19,1,6,0,73,0,0]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT  MODE   PO      POS-C   NOM-    MAJOR-0   PITCH  TAP-DEP   CHMF","cells":{"1":[92,4,6,2048,16,0,48]}},"1":{"head":"UNo. UNIT  MODE   POC-FACEPOS-C   NOM-    MAJOR-0   PITCH  TAP-DEP   CHMF","cells":{"1":[92,4,274,2048,16,0,48]}},"2":{"head":"UNo. UNIT  MODE   POC-FACEPOS-C   NOM-    MAJOR-0   PITCH  TAP-DEP   CHMF","cells":{"1":[92,4,274,2048,16,0,48]}}}},{"code":37,"name":"BK-CBORE","head":"UNo. UNIT    MODE POS-B  POS-C   DIA    DEPTH   BTM WAL   PRE-DIA   PRE-DEP  CHMF  WAL","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,25,0,49],[36,4,123,1,33,0,50],[40,4,123,2,41,0,51],[9,1,30,64,49,0,55],[10,1,30,32,53,0,60],[56,4,123,8,58,0,61],[60,4,123,16,68,0,0],[44,4,123,4,77,0,52],[12,1,30,128,84,0,60]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT          OS-B  POS-C   DIA    DEPTH   BTM WAL   PRE-DIA   PRE-DEP  CHMF  WAL","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACEOS-B  POS-C   DIA    DEPTH   BTM WAL   PRE-DIA   PRE-DEP  CHMF  WAL","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACEOS-B  POS-C   DIA    DEPTH   BTM WAL   PRE-DIA   PRE-DEP  CHMF  WAL","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":38,"name":"CIRC-MIL","head":"UNo. UNIT  MODE  POS-B  POS-C TORNA. DIA   DEPTH  CHMF BTM PRE-DIA  CHMF PITCH1 PITCH2","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,17,0,48],[96,4,118,4096,24,0,49],[13,1,37,0,32,0,62],[36,4,123,1,36,0,50],[40,4,123,2,43,0,51],[44,4,123,4,50,0,52],[9,1,30,32,56,0,55],[56,4,123,8,59,0,61],[64,4,123,16,68,0,52],[48,4,123,64,73,0,63],[52,4,123,128,80,0,64]],"na":{"always":[],"rules":{"8":[[13,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128]]],"9":[[13,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128]]],"10":[[13,[0]]],"11":[[13,[0]]],"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]},"all":[8,9]},"variants":{"0":{"head":"UNo. UNIT        POS-B  POS-C TORNA. DIA   DEPTH  CHMF BTM PRE-DIA  CHMF PITCH1 PITCH2","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT  C-FACEPOS-B  POS-C TORNA. DIA   DEPTH  CHMF BTM PRE-DIA  CHMF PITCH1 PITCH2","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT  C-FACEPOS-B  POS-C TORNA. DIA   DEPTH  CHMF BTM PRE-DIA  CHMF PITCH1 PITCH2","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":39,"name":"CBOR-TAP","head":"UNo. UNIT  MODE  POS-B POS-C NOM-  MAJOR-0 PITCH TAP-DEP CHM CB-DIA CB-DP   CHM  BTM","shape":192,"tool":176,"cells":[[20,2,66,0,12,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,22,0,49],[36,4,287,1,28,0,37],[40,4,123,2,36,0,57],[44,4,123,4,43,0,58],[48,4,123,8,50,0,59],[52,4,123,16,57,0,52],[56,4,123,32,62,0,53],[60,4,123,64,68,0,54],[64,4,123,128,76,0,52],[11,2,207,256,82,0,55]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT  MODE  POS      -C NOM-  MAJOR-0 PITCH TAP-DEP CHM CB-DIA CB-DP   CHM  BTM","cells":{"1":[92,4,6,2048,18,0,48]}},"1":{"head":"UNo. UNIT  MODE  POSC-FACE-C NOM-  MAJOR-0 PITCH TAP-DEP CHM CB-DIA CB-DP   CHM  BTM","cells":{"1":[92,4,274,2048,18,0,48]}},"2":{"head":"UNo. UNIT  MODE  POSC-FACE-C NOM-  MAJOR-0 PITCH TAP-DEP CHM CB-DIA CB-DP   CHM  BTM","cells":{"1":[92,4,274,2048,18,0,48]}}}},{"code":40,"name":"BORE-T1","head":"UNo. UNIT   MODE  POS-B   POS-C    DIA       DEPTH     CHMF    WAL","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,49],[36,4,123,1,35,0,50],[40,4,123,2,45,0,51],[44,4,123,4,55,0,52],[10,1,30,8,64,0,60]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT   M      OS-B   POS-C    DIA       DEPTH     CHMF    WAL","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT   MC-FACEOS-B   POS-C    DIA       DEPTH     CHMF    WAL","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT   MC-FACEOS-B   POS-C    DIA       DEPTH     CHMF    WAL","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":41,"name":"BORE-S1","head":"UNo. UNIT   MODE  POS-B   POS-C    DIA       DEPTH     CHMF    BTM WAL  PRE-DIA","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,49],[36,4,123,1,35,0,50],[40,4,123,2,45,0,51],[44,4,123,4,55,0,52],[9,1,30,16,64,0,55],[10,1,30,32,68,0,60],[48,4,123,8,72,0,61]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT   M      OS-B   POS-C    DIA       DEPTH     CHMF    BTM WAL  PRE-DIA","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT   MC-FACEOS-B   POS-C    DIA       DEPTH     CHMF    BTM WAL  PRE-DIA","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT   MC-FACEOS-B   POS-C    DIA       DEPTH     CHMF    BTM WAL  PRE-DIA","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":42,"name":"BOR-T2","head":"UNo. UNIT  MODE  POS-B  POS-C  CB-DIA  CB-DEP  CHMF   BTM WAL DIA    DEPTH   CHMF  WAL","shape":192,"tool":176,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,25,0,49],[56,4,123,1,32,0,53],[60,4,123,2,39,0,54],[64,4,123,4,48,0,52],[11,1,30,128,55,0,55],[12,1,30,256,59,0,60],[36,4,123,8,62,0,50],[40,4,123,16,70,0,51],[44,4,123,32,78,0,52],[10,1,30,64,84,0,60]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT  MO      S-B  POS-C  CB-DIA  CB-DEP  CHMF   BTM WAL DIA    DEPTH   CHMF  WAL","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT  MOC-FACES-B  POS-C  CB-DIA  CB-DEP  CHMF   BTM WAL DIA    DEPTH   CHMF  WAL","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT  MOC-FACES-B  POS-C  CB-DIA  CB-DEP  CHMF   BTM WAL DIA    DEPTH   CHMF  WAL","cells":{"0":[20,2,274,0,13,0,204]}}}},{"code":43,"name":"BOR-S2","head":"UNo. UNIT  MODE  POS-B  POS-C  CB-DIA  CB-DEP CHMF BtmWal PRE-DIA  DIA    DEPTH   CHMF BtmWal","shape":192,"tool":176,"cells":[[20,2,66,0,11,0,204],[92,4,118,2048,16,0,48],[96,4,118,4096,23,0,49],[56,4,123,1,31,0,53],[60,4,123,2,39,0,54],[64,4,123,4,47,0,52],[11,1,30,512,52,0,55],[12,1,30,1024,55,0,60],[48,4,123,8,58,0,61],[36,4,123,16,66,0,50],[40,4,123,32,74,0,51],[44,4,123,64,82,0,52],[9,1,30,128,88,0,55],[10,1,30,256,91,0,60]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT  MO      S-B  POS-C  CB-DIA  CB-DEP CHMF BtmWal PRE-DIA  DIA    DEPTH   CHMF BtmWal","cells":{"0":[20,2,6,0,11,0,204]}},"1":{"head":"UNo. UNIT  MOC-FACES-B  POS-C  CB-DIA  CB-DEP CHMF BtmWal PRE-DIA  DIA    DEPTH   CHMF BtmWal","cells":{"0":[20,2,274,0,11,0,204]}},"2":{"head":"UNo. UNIT  MOC-FACES-B  POS-C  CB-DIA  CB-DEP CHMF BtmWal PRE-DIA  DIA    DEPTH   CHMF BtmWal","cells":{"0":[20,2,274,0,11,0,204]}}}},{"code":64,"name":"LINE-CTR","head":"UNo. UNIT    MODE POS-B   POS-C    SRV-Z   SRV-R   RGH FIN-A            START  END","shape":194,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,49],[36,4,6,1,27,0,65],[40,4,123,2,35,0,66],[44,4,123,4,43,0,67],[17,1,38,16,52,0,0],[48,4,6,0,55,0,0],[52,4,123,32,55,0,68],[56,4,6,0,63,0,69],[18,1,317,0,71,0,70],[18,1,318,0,78,0,71]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":65,"name":"LINE-RGT","head":"UNo. UNIT    MODE POS-B   POS-C    SRV-Z   SRV-R   RGH FIN-A   FIN-R    START   END  INTER-R  CHMF","shape":194,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,49],[36,4,6,1,27,0,65],[40,4,123,2,35,0,66],[44,4,123,4,43,0,67],[17,1,38,16,52,0,0],[48,4,6,0,55,0,0],[52,4,123,32,55,0,68],[56,4,123,64,63,0,69],[18,1,317,0,71,0,70],[18,1,318,0,78,0,71],[64,4,123,256,85,0,73],[48,4,189,512,93,1,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":66,"name":"LINE-LFT","head":"UNo. UNIT    MODE POS-B   POS-C    SRV-Z   SRV-R   RGH FIN-A   FIN-R    START   END  INTER-R  CHMF","shape":194,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,49],[36,4,6,1,27,0,65],[40,4,123,2,35,0,66],[44,4,123,4,43,0,67],[17,1,38,16,52,0,0],[48,4,6,0,55,0,0],[52,4,123,32,55,0,68],[56,4,123,64,63,0,69],[18,1,317,0,71,0,70],[18,1,318,0,78,0,71],[64,4,123,256,85,0,73],[48,4,189,512,93,1,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":67,"name":"LINE OUT","head":"UNo. UNIT    MODE POS-B   POS-C    SRV-A   SRV-R   RGH FIN-A   FIN-R                 INTER-R  CHMF","shape":193,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,49],[36,4,6,1,27,0,65],[40,4,123,2,35,0,66],[44,4,123,4,43,0,67],[17,1,38,16,52,0,0],[48,4,6,0,55,0,0],[52,4,123,32,55,0,68],[56,4,123,64,63,0,69],[64,4,123,256,85,0,73],[48,4,189,512,94,1,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":68,"name":"LINE-IN","head":"UNo. UNIT    MODE POS-B   POS-C    SRV-A   SRV-R   RGH FIN-A   FIN-R                 INTER-R  CHMF","shape":193,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,49],[36,4,6,1,27,0,65],[40,4,123,2,35,0,66],[44,4,123,4,43,0,67],[17,1,38,16,52,0,0],[48,4,6,0,55,0,0],[52,4,123,32,55,0,68],[56,4,123,64,63,0,69],[64,4,123,256,85,0,73],[48,4,189,512,94,1,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT     C-FACE  DEPTH   SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT     C-FACE  CYLIN.R SRV-Z   SRV-R   RGH FIN-Z   FIN-R","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":80,"name":"CHMF RGT","head":"UNo. UNIT    MODE POS-B   POS-C      INTER-Z   INTER-R   CHMF          START   END","shape":194,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,0],[36,4,6,1,27,0,65],[40,4,123,2,37,0,74],[44,4,123,4,47,0,73],[17,1,6,16,51,0,0],[48,4,189,8,57,1,52],[18,1,317,0,71,0,70],[18,1,318,0,78,0,71]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":81,"name":"CHMF LFT","head":"UNo. UNIT    MODE POS-B   POS-C      INTER-Z   INTER-R   CHMF          START   END","shape":194,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,0],[36,4,6,1,27,0,65],[40,4,123,2,37,0,74],[44,4,123,4,47,0,73],[17,1,6,16,51,0,0],[48,4,189,8,57,1,52],[18,1,317,0,71,0,70],[18,1,318,0,78,0,71]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":82,"name":"CHMF OUT","head":"UNo. UNIT    MODE  POS-B  POS-C      INTER-Z   INTER-R   CHMF","shape":193,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,0],[36,4,6,1,27,0,65],[40,4,123,2,37,0,74],[44,4,123,4,47,0,73],[17,1,6,16,51,0,0],[48,4,189,8,57,1,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":83,"name":"CHMF IN","head":"UNo. UNIT    MODE  POS-B  POS-C      INTER-Z   INTER-R   CHMF","shape":193,"tool":177,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,26,0,0],[36,4,6,1,27,0,65],[40,4,123,2,37,0,74],[44,4,123,4,47,0,73],[17,1,6,16,51,0,0],[48,4,189,8,57,1,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}},"variants":{"0":{"head":"UNo. UNIT             DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,6,0,13,0,204]}},"1":{"head":"UNo. UNIT    C-FACE   DEPTH    INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  INTER-Z    INTER-R   CHMF","cells":{"0":[20,2,274,0,13,0,204],"3":[36,4,6,1,27,0,72]}}}},{"code":96,"name":"FCE-MILL","head":"UNo. UNIT    MODE POS-B    POS-C     SRV-A           BTM WAL  FIN-A    FIN-R","shape":193,"tool":178,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,27,0,0],[40,4,123,2,37,0,66],[26,4,6,0,45,0,0],[9,1,38,8,54,0,55],[10,1,8,0,58,0,0],[52,4,123,64,62,0,68],[56,4,8,0,72,0,0]],"na":{"always":[6,8],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":97,"name":"TOP-EMILL","head":"UNo. UNIT      MODE POS-B   POS-C    SRV-A           BTM WAL  FIN-A    FIN-R","shape":193,"tool":178,"cells":[[20,2,66,0,15,0,204],[92,4,118,2048,20,0,48],[96,4,118,4096,28,0,0],[40,4,123,2,37,0,66],[26,4,6,4,45,0,0],[9,1,38,8,54,0,55],[10,1,8,16,58,0,0],[52,4,123,64,62,0,68],[56,4,8,128,71,0,0]],"na":{"always":[6,8],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":98,"name":"STEP","head":"UNo. UNIT    MODE POS-B    POS-C     SRV-A           BTM WAL  FIN-A    FIN-R","shape":193,"tool":178,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,27,0,0],[40,4,123,2,37,0,66],[26,4,6,4,46,0,0],[9,1,38,8,54,0,55],[10,1,38,16,58,0,60],[52,4,123,64,62,0,68],[56,4,123,128,71,0,69]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":99,"name":"POCKET","head":"UNo. UNIT    MODE POS-B    POS-C    SRV-A   BTM WAL FIN-A    FIN-R    INTER-R  CHMF","shape":193,"tool":178,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,27,0,49],[40,4,123,2,36,0,66],[26,4,6,0,44,0,0],[9,1,38,8,45,0,55],[10,1,38,16,49,0,60],[52,4,123,64,52,0,68],[56,4,123,128,61,0,69],[44,4,123,256,70,0,73],[48,4,189,512,78,1,52]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":100,"name":"PCKT MTN","head":"UNo. UNIT    MODE POS-B    POS-C     SRV-A           BTM WAL  FIN-A    FIN-R","shape":193,"tool":178,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,27,0,0],[40,4,123,2,37,0,66],[26,4,6,0,45,0,0],[9,1,38,8,54,0,55],[10,1,38,16,58,0,60],[52,4,123,64,62,0,68],[56,4,123,128,71,0,69]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":101,"name":"PCKT VLY","head":"UNo. UNIT    MODE POS-B    POS-C     SRV-A           BTM WAL  FIN-A    FIN-R","shape":193,"tool":178,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,27,0,0],[40,4,123,2,37,0,66],[26,4,6,0,45,0,0],[9,1,38,8,54,0,55],[10,1,38,16,58,0,60],[52,4,123,64,62,0,68],[56,4,123,128,71,0,69]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":102,"name":"SLOT","head":"UNo. UNIT    MODE POS-B    POS-C    SRV-A   S-WIDTH  BTM WAL  FIN-A    FIN-R   PAT.","shape":194,"tool":178,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,18,0,48],[96,4,118,4096,27,0,0],[40,4,123,2,36,0,66],[60,4,123,4,45,0,75],[9,1,38,8,54,0,55],[10,1,38,16,58,0,60],[52,4,123,64,62,0,68],[56,4,123,128,71,0,69],[19,1,31,65536,80,0,76]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":192,"name":"","head":"FIG PTN    Z        X        Y        AN1     AN2     T1      T2      F  M  N P Q R","shape":65532,"tool":0,"cells":[[8,1,54,0,4,0,77],[36,4,127,2048,10,0,78],[40,4,123,2,19,0,0],[44,4,123,4,28,0,0],[48,4,118,8,38,0,0],[52,4,118,16,46,0,0],[56,4,123,32,54,0,0],[60,4,123,64,62,0,0],[9,1,30,96,70,0,0],[20,1,30,128,72,0,0],[22,1,30,256,75,0,79],[15,1,32,512,78,0,0],[16,1,31,1024,80,0,80],[17,1,31,4096,82,0,81]]},{"code":193,"name":"","head":"FIG PTN     P1X/CX   P1Y/CY   P3X/R    P3Y     CN1      CN2      CN3      CN4","shape":65532,"tool":0,"cells":[[8,1,55,0,4,0,82],[36,4,123,2,12,0,0],[40,4,123,4,21,0,0],[44,4,123,8,30,0,0],[48,4,123,16,38,0,83],[52,4,262,32,46,256,0],[56,4,262,64,55,512,0],[60,4,262,128,64,1024,0],[64,4,262,256,73,2048,0]],"na":{"always":[],"rules":{"8":[[8,[17]]],"5":[[8,[17]]],"6":[[8,[17]]],"7":[[8,[17]]]}},"variants":{"0":{"head":"FIG PTN     P1X/CX   P1Y/CY   P3X/R   P3Y    CN1      CN2      CN3      CN4"},"1":{"head":"FIG PTN   P1Rx/CRx P1thy/Cthy P3Rx/R P3thy   CN1      CN2      CN3      CN4"},"2":{"head":"FIG PTN   P1Rx/CRx P1thy/Cthy P3Rx/R P3thy   CN1      CN2      CN3      CN4"}}},{"code":194,"name":"","head":"FIG  PTN      X         Y        Rad/Th.   I       J         P       CNR      R-FEED","shape":65532,"tool":0,"cells":[[12,1,26,0,3,0,0],[8,1,57,0,4,0,82],[40,4,131,2,13,1,84],[44,4,131,4,23,2,85],[48,4,181,8,33,4,0],[52,4,131,16,42,8,0],[56,4,131,32,51,16,0],[13,1,256,0,61,0,0],[60,4,262,64,66,256,0],[76,4,6,32768,76,0,86],[64,4,192,128,76,32768,87]],"na":{"always":[],"rules":{"3":[[8,[35,36,37,38]]],"4":[[8,[35,36,37,38]]],"5":[[8,[35,38]]],"6":[[8,[35,38]]],"7":[[8,[35,38]]],"8":[[8,[38]]],"10":[[8,[35,36,37,38]]]},"blank":{"7":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[7]}},{"code":162,"name":"","head":"SNo PTN       X       Y       Z       C       DIR       R       D/L       K    DIR.","shape":65532,"tool":0,"cells":[[8,1,252,0,4,0,97],[36,4,123,1,14,0,98],[40,4,123,2,22,0,99],[44,4,123,4,30,0,100],[72,4,118,512,38,0,0],[9,4,51,65536,47,0,205],[52,4,123,16,56,0,101],[56,4,123,32,64,0,102],[60,4,123,64,74,0,103],[20,1,77,256,80,0,206]],"na":{"always":[],"rules":{"6":[[8,[4,5,6,7,8,9,11,17,18,20]]],"7":[[8,[1,2,3,10]]],"8":[[8,[1,2,3,10,14]]]},"all":[7,8]}},{"code":176,"name":"","head":"SNo  TOOL       NOM-D   No.    HOLE-D HOLE-DEP PRE-DIA PRE-DEP RGH DEPTH C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,288,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[18,1,6,0,28,0,201],[19,1,6,134217728,29,0,0],[40,4,123,2,32,0,0],[44,4,123,4,39,0,0],[48,4,188,0,48,0,0],[52,4,143,0,55,0,0],[15,1,271,0,62,0,0],[56,4,212,0,67,0,0],[60,4,105,64,73,0,104],[64,4,125,128,78,0,87],[24,2,207,512,85,0,39],[26,2,207,1024,89,0,39],[32,2,207,536870912,93,0,39]],"na":{"always":[],"rules":{"8":[[9,[17]]],"9":[[9,[1,17]]],"10":[[9,[1,3,6,7,8,10,17]]],"11":[[9,[1,3,4,5,6,7,8,9,17]]],"12":[[9,[3,10,13,17]]],"13":[[9,[10,17]]],"14":[[9,[17]]],"15":[[9,[17]]]},"all":[9,10,11]},"pctx":{"16":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"}}},{"code":177,"name":"","head":"SNo  TOOL       NOM-D  No.      APRCH-1  APRCH-2 TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[18,1,6,0,26,0,201],[19,1,6,134217728,27,0,0],[40,4,138,2,32,1,105],[44,4,139,4,41,2,106],[15,1,277,128,49,0,107],[14,1,241,0,54,0,108],[48,4,123,8,58,0,109],[52,4,8,16,65,0,110],[60,4,105,32,71,0,104],[64,4,125,64,77,0,87],[24,2,207,256,84,0,39],[26,2,207,512,88,0,39],[32,2,207,536870912,92,0,39]],"na":{"always":[14],"rules":{"13":[[9,[1]]]},"all":[13]},"pctx":{"11":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"13":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"96":"na"}},"cx":{"sel":[8,9],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":4,"98":4,"99":4,"100":4,"101":4,"102":2,"127":0},"rows":[{"0/0":0,"0/1":1,"0/2":0,"1/0":0,"1/1":1,"1/2":0},{"0/0":2,"0/1":3,"0/2":3,"1/0":3,"1/1":3,"1/2":3},{"0/0":0,"0/1":1,"0/2":1,"1/0":1,"1/1":1,"1/2":1},{"0/0":4,"0/1":5,"0/2":4,"1/0":5,"1/1":5,"1/2":5},{"0/0":0,"0/1":1,"0/2":0,"1/0":1,"1/1":1,"1/2":1}],"own":[{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}}],"modes":[[null,null,"","n","n",null,"n","","","n","n","n","n","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n","n","na","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na","n","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na","n","na","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n","na","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n","na","na","n!","n","n","n","n","n"]]}},{"code":178,"name":"","head":"SNo  TOOL  NOM-D  No APRCH-X  APRCH-Y TYPE ZFD TYPE PK-DEP DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[18,1,6,0,26,0,201],[19,1,6,134217728,27,0,0],[40,4,138,2,31,1,105],[44,4,139,4,40,2,106],[15,1,277,128,48,0,107],[14,1,241,0,53,0,108],[16,1,242,0,57,0,111],[76,4,123,268435456,62,0,112],[48,4,123,8,69,0,109],[52,4,128,16,76,0,110],[60,4,105,32,82,0,104],[64,4,125,64,88,0,87],[24,2,207,256,95,0,39],[26,2,207,512,99,0,39],[32,2,207,536870912,103,0,39]],"na":{"always":[],"rules":{"16":[[9,[1,13]]],"13":[[9,[13]],[14,[128]]],"15":[[9,[1,13]]],"14":[[16,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[14,15,16]},"pctx":{"11":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"16":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"15":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"96":"na"}},"cx":{"sel":[8,9,14,16],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]],[[[0,127],[129,255]],[[128,128]]],[[[0,2],[4,255]],[[3,3]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":2,"98":2,"99":2,"100":2,"101":2,"102":4,"127":0},"rows":[{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":0,"1/0/0/1":1,"1/0/1/0":0,"1/0/1/1":0,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":4,"0/0/0/1":5,"0/0/1/0":4,"0/0/1/1":4,"0/1/0/0":6,"0/1/0/1":7,"0/1/1/0":6,"0/1/1/1":6,"0/2/0/0":6,"0/2/0/1":6,"0/2/1/0":6,"0/2/1/1":6,"1/0/0/0":8,"1/0/0/1":9,"1/0/1/0":8,"1/0/1/1":8,"1/1/0/0":6,"1/1/0/1":7,"1/1/1/0":6,"1/1/1/1":6,"1/2/0/0":6,"1/2/0/1":6,"1/2/1/0":6,"1/2/1/1":6},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":10,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":1,"0/1/0/0":2,"0/1/0/1":2,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":11,"1/1/0/0":2,"1/1/0/1":2,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":12,"0/0/0/1":13,"0/0/1/0":12,"0/0/1/1":12,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":2,"1/0/0/1":3,"1/0/1/0":2,"1/0/1/1":2,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2}],"own":[{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"12":"n"},"0/0/*/1":{"12":"n"},"0/1/*/0":{"12":"n"},"0/1/*/1":{"12":"n"},"0/2/*/0":{"12":"n"},"0/2/*/1":{"12":"n"},"1/0/*/0":{"12":"n"},"1/0/*/1":{"12":"n"},"1/1/*/0":{"12":"n"},"1/1/*/1":{"12":"n"},"1/2/*/0":{"12":"n"},"1/2/*/1":{"12":"n"}},"16":{"0/0/0/*":{"13":"n"},"0/0/1/*":{"13":"na"},"0/1/0/*":{"13":"n"},"0/1/1/*":{"13":"na"},"0/2/0/*":{"13":"na"},"0/2/1/*":{"13":"na"},"1/0/0/*":{"13":"n"},"1/0/1/*":{"13":"na"},"1/1/0/*":{"13":"n"},"1/1/1/*":{"13":"na"},"1/2/0/*":{"13":"na"},"1/2/1/*":{"13":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"12":"n"},"0/0/*/1":{"12":"n"},"0/1/*/0":{"12":"n"},"0/1/*/1":{"12":"n"},"0/2/*/0":{"12":"n"},"0/2/*/1":{"12":"n"},"1/0/*/0":{"12":"n"},"1/0/*/1":{"12":"n"},"1/1/*/0":{"12":"n"},"1/1/*/1":{"12":"n"},"1/2/*/0":{"12":"n"},"1/2/*/1":{"12":"n"}},"16":{"0/0/0/*":{"13":"n"},"0/0/1/*":{"13":"na"},"0/1/0/*":{"13":"n"},"0/1/1/*":{"13":"na"},"0/2/0/*":{"13":"na"},"0/2/1/*":{"13":"na"},"1/0/0/*":{"13":"n"},"1/0/1/*":{"13":"na"},"1/1/0/*":{"13":"n"},"1/1/1/*":{"13":"na"},"1/2/0/*":{"13":"na"},"1/2/1/*":{"13":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"12":"n"},"0/0/*/1":{"12":"n"},"0/1/*/0":{"12":"n"},"0/1/*/1":{"12":"n"},"0/2/*/0":{"12":"n"},"0/2/*/1":{"12":"n"},"1/0/*/0":{"12":"n"},"1/0/*/1":{"12":"n"},"1/1/*/0":{"12":"n"},"1/1/*/1":{"12":"n"},"1/2/*/0":{"12":"n"},"1/2/*/1":{"12":"n"}},"16":{"0/0/0/*":{"13":"n"},"0/0/1/*":{"13":"na"},"0/1/0/*":{"13":"n"},"0/1/1/*":{"13":"na"},"0/2/0/*":{"13":"na"},"0/2/1/*":{"13":"na"},"1/0/0/*":{"13":"n"},"1/0/1/*":{"13":"na"},"1/1/0/*":{"13":"n"},"1/1/1/*":{"13":"na"},"1/2/0/*":{"13":"na"},"1/2/1/*":{"13":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"12":"na"},"0/0/*/1":{"12":"na"},"0/1/*/0":{"12":"na"},"0/1/*/1":{"12":"na"},"0/2/*/0":{"12":"na"},"0/2/*/1":{"12":"na"},"1/0/*/0":{"12":"na"},"1/0/*/1":{"12":"na"},"1/1/*/0":{"12":"na"},"1/1/*/1":{"12":"na"},"1/2/*/0":{"12":"na"},"1/2/*/1":{"12":"na"}},"16":{"0/0/0/*":{"13":"n"},"0/0/1/*":{"13":"n"},"0/1/0/*":{"13":"na"},"0/1/1/*":{"13":"na"},"0/2/0/*":{"13":"na"},"0/2/1/*":{"13":"na"},"1/0/0/*":{"13":"n"},"1/0/1/*":{"13":"n"},"1/1/0/*":{"13":"na"},"1/1/1/*":{"13":"na"},"1/2/0/*":{"13":"na"},"1/2/1/*":{"13":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"12":"n"},"0/0/*/1":{"12":"n"},"0/1/*/0":{"12":"n"},"0/1/*/1":{"12":"n"},"0/2/*/0":{"12":"n"},"0/2/*/1":{"12":"n"},"1/0/*/0":{"12":"n"},"1/0/*/1":{"12":"n"},"1/1/*/0":{"12":"n"},"1/1/*/1":{"12":"n"},"1/2/*/0":{"12":"n"},"1/2/*/1":{"12":"n"}},"16":{"0/0/0/*":{"13":"n"},"0/0/1/*":{"13":"na"},"0/1/0/*":{"13":"n"},"0/1/1/*":{"13":"na"},"0/2/0/*":{"13":"na"},"0/2/1/*":{"13":"na"},"1/0/0/*":{"13":"n"},"1/0/1/*":{"13":"na"},"1/1/0/*":{"13":"n"},"1/1/1/*":{"13":"na"},"1/2/0/*":{"13":"na"},"1/2/1/*":{"13":"na"}}}],"modes":[[null,null,"","n","n",null,"n","","","n","n","n",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","na",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n",null,null,"na","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","","","n","n","n",null,null,"n","n","na","n","n","n","n","n"]]}},{"code":1,"name":"_","head":"UNo. MAT.              OD-MAX  ID-MIN  LENGTH   WORK-FACE  ATC-MODE  RPM","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,0,13,0,0],[64,4,123,256,23,0,114],[68,4,123,512,31,0,115],[72,4,123,1024,40,0,116],[76,4,135,2048,50,0,117],[10,1,31,128,62,0,3],[22,2,207,65536,68,0,118],[92,4,6,32768,76,0,207],[12,2,6,2097152,76,0,208],[80,4,6,4096,80,0,209]]},{"code":18,"name":"TRANSFER","head":"UNo. UNIT   PAT HEAD SPDL PUSH CHUCK  W1     W2    Z-OFFSET  C1      C2    C-OFFSET","shape":255,"tool":0,"cells":[[20,2,144,0,13,0,120],[30,2,6,32,19,0,121],[22,2,146,2,17,0,122],[24,2,228,4,22,0,123],[26,2,207,8,28,0,124],[28,2,207,16,32,0,125],[36,4,123,256,35,0,126],[40,4,123,512,44,0,127],[52,4,123,4096,53,0,128],[44,4,118,1024,61,0,129],[48,4,118,2048,70,0,130],[64,4,118,8192,77,0,131],[60,4,6,32768,85,0,132],[30,2,6,64,95,0,133]],"na":{"always":[],"rules":{"2":[[20,[3,5,259,261],2]],"3":[[20,[3,5,259,261],2]],"4":[[20,[2,3,5,258,259,261],2]],"5":[[20,[1,3,5,257,259,261],2]],"6":[[20,[2,3,5,259,261],2]],"7":[[20,[5,261],2]],"9":[[20,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,261,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]],"10":[[20,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,261,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]],"11":[[20,[0,1,2,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,257,258,260,262,263,264,265,266,267,268,269,270,271,272],2],[24,[0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,64,128],2]]},"all":[5,9,10,11]},"cx":{"sel":[20,22,24],"cls":[[[[0,0],[4,4],[6,255]],[[1,1]],[[2,2]],[[3,3]],[[5,5]]],[[[0,0],[3,255]],[[1,1]],[[2,2]]],[[[0,2],[5,255]],[[3,4]]]],"pc":{"0":0},"rows":[{"0/0/0":0,"0/0/1":1,"0/1/0":2,"0/1/1":3,"0/2/0":2,"0/2/1":3,"1/0/0":4,"1/0/1":5,"1/1/0":4,"1/1/1":5,"1/2/0":4,"1/2/1":5,"2/0/0":6,"2/0/1":7,"2/1/0":8,"2/1/1":9,"2/2/0":10,"2/2/1":11,"3/0/0":12,"3/0/1":12,"3/1/0":12,"3/1/1":12,"3/2/0":12,"3/2/1":12,"4/0/0":13,"4/0/1":13,"4/1/0":13,"4/1/1":13,"4/2/0":13,"4/2/1":13}],"own":[{"20":{"*/0/0":{},"*/0/1":{},"*/1/0":{},"*/1/1":{},"*/2/0":{},"*/2/1":{}},"22":{"0/*/0":{},"0/*/1":{},"1/*/0":{},"1/*/1":{},"2/*/0":{},"2/*/1":{},"3/*/0":{},"3/*/1":{},"4/*/0":{},"4/*/1":{}},"24":{"0/0/*":{},"0/1/*":{},"0/2/*":{},"1/0/*":{},"1/1/*":{},"1/2/*":{},"2/0/*":{},"2/1/*":{},"2/2/*":{},"3/0/*":{},"3/1/*":{},"3/2/*":{},"4/0/*":{},"4/1/*":{},"4/2/*":{}}}],"modes":[["n","","n","n","n","n","n","n","n","na","na","na","",null],["n","","n","n","n","n","n","n","n","n","n","n","",null],["n","","d?","n","n","n","n","n","n","na","na","na","",null],["n","","d?","n","n","n","n","n","n","n","n","n","",null],["n","","n","n","n","na","n","n","n","na","na","na","",null],["n","","n","n","n","na","n","n","n","n","n","n","",null],["n","","n","n","na","n","n","n","n","na","na","na","",null],["n","","n","n","na","n","n","n","n","n","n","n","",null],["n","","d?","n","na","n","na","n","n","na","na","na","",null],["n","","d?","n","na","n","na","n","n","n","n","n","",null],["n","","d?","n","na","n","n","na","na","na","na","na","",null],["n","","d?","n","na","n","n","na","na","n","n","n","",null],["n","","na","na","na","na","na","n","n","n","n","n","",null],["n","","na","na","na","na","na","na","n","na","na","n","",null]]}},{"code":48,"name":"BAR","head":"UNo. UNIT    PART  POS-B    CPT-X    CPT-Z      FIN-X      FIN-Z","shape":168,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,118,2048,19,0,48],[36,4,123,64,28,0,136],[40,4,123,128,38,0,137],[52,4,123,65536,48,0,138],[56,4,123,131072,59,0,139]]},{"code":49,"name":"CPY","head":"UNo. UNIT    PART  POS-B    CPT-X   CPT-Z    SRV-X   SRV-Z    FIN-X     FIN-Z","shape":168,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,118,2048,19,0,48],[36,4,123,64,28,0,136],[40,4,123,128,36,0,137],[44,4,123,256,45,0,140],[48,4,123,512,53,0,66],[52,4,123,65536,62,0,138],[56,4,123,131072,72,0,139]]},{"code":54,"name":"T.DRILL","head":"UNo. UNIT    PART  POS-B       DIA","shape":173,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,118,2048,19,0,48],[8,2,6,2,23,0,141],[36,4,123,64,31,0,50]]},{"code":50,"name":"CORNER","head":"UNo. UNIT    PART  POS-B         FIN-X     FIN-Z","shape":169,"tool":180,"cells":[[20,2,233,0,13,0,0],[92,4,118,2048,19,0,48],[52,4,123,65536,33,0,138],[56,4,123,131072,43,0,139]]},{"code":51,"name":"FACING","head":"UNo. UNIT    PART  POS-B     FIN-Z","shape":170,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,118,2048,19,0,48],[56,4,123,131072,29,0,139]]},{"code":52,"name":"THREAD","head":"UNo. MODE    PART  POS-B    CHAMF  LEAD    ANG  MULTI  HGT","shape":171,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,118,2048,19,0,48],[8,2,6,2,15,0,141],[24,2,207,4,30,0,142],[56,4,141,134217728,34,0,143],[36,4,104,64,43,0,144],[26,2,207,8,49,0,145],[40,4,123,128,55,256,146]]},{"code":53,"name":"T.GROOVE","head":"UNo. UNIT    PART  POS-B      PAT   No.  PITCH    WIDTH    FINISH","shape":172,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,118,2048,19,0,48],[22,2,206,2,31,0,141],[24,2,207,4,37,0,147],[40,4,123,128,41,0,148],[36,4,123,64,51,0,149],[52,4,123,65536,60,0,0]],"na":{"always":[],"rules":{"5":[[22,[4,5],2]],"6":[[22,[0],2]]}}},{"code":55,"name":"T.TAP","head":"UNo. UNIT    PART  POS-B      NOM-DIA       PITCH","shape":173,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,118,2048,19,0,48],[36,4,287,64,31,0,37],[56,4,142,134217728,44,512,58]]},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3 FIN-X  FIN-Z  C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,7,0,36],[36,4,286,1,12,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[18,1,6,0,25,0,201],[19,1,6,134217728,26,0,0],[15,1,237,128,29,0,0],[48,4,125,65536,33,0,0],[52,4,123,131072,41,0,150],[76,4,123,2097152,41,0,151],[28,2,207,16777216,46,0,152],[56,4,123,262144,49,0,153],[68,4,123,524288,56,0,138],[72,4,123,1048576,63,0,139],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[9],"rules":{}},"pctx":{"10":{"48":"na","49":"na","50":"na","51":"na","52":"na","55":"na"},"11":{"49":"na","50":"na","51":"na","52":"","53":"na","55":"na"},"12":{"49":"","50":"","51":"","52":"","53":"","54":"","55":""},"13":{"48":"","49":"","50":"","51":"","52":"na","53":"","54":"","55":""},"14":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","55":"na"},"9":{"49":"na","51":"na","53":"na","55":"na"},"15":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"16":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"18":{"52":"na","55":"na"}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[32,255]],[[1,31]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":1,"49":2,"50":3,"51":4,"52":5,"53":6,"54":7,"55":8,"64":0,"65":0,"66":0,"67":0,"68":0,"80":0,"81":0,"82":0,"83":0,"96":0,"97":0,"98":0,"99":0,"100":0,"101":0,"102":0,"127":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0},{"0/0/0":1,"0/0/1":1,"0/0/2":2,"0/0/3":2,"0/1/0":1,"0/1/1":1,"0/1/2":2,"0/1/3":2,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":5,"1/0/1":5,"1/0/2":5,"1/0/3":5,"1/1/0":5,"1/1/1":5,"1/1/2":5,"1/1/3":5},{"0/0/0":6,"0/0/1":7,"0/0/2":6,"0/0/3":7,"0/1/0":6,"0/1/1":7,"0/1/2":6,"0/1/3":7,"1/0/0":6,"1/0/1":7,"1/0/2":6,"1/0/3":7,"1/1/0":6,"1/1/1":7,"1/1/2":6,"1/1/3":7},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":4,"1/0/1":4,"1/0/2":4,"1/0/3":4,"1/1/0":4,"1/1/1":4,"1/1/2":4,"1/1/3":4},{"0/0/0":8,"0/0/1":8,"0/0/2":8,"0/0/3":8,"1/0/0":8,"1/0/1":8,"1/0/2":8,"1/0/3":8},{"0/0/0":9,"0/0/1":9,"0/0/2":9,"0/0/3":9,"0/1/0":9,"0/1/1":9,"0/1/2":9,"0/1/3":9,"1/0/0":9,"1/0/1":9,"1/0/2":9,"1/0/3":9,"1/1/0":9,"1/1/1":9,"1/1/2":9,"1/1/3":9}],"own":[{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"na"},"0/1/*":{"9":"na"},"1/0/*":{"9":"na"},"1/1/*":{"9":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"d?"},"0/1/*":{"9":"d?"},"1/0/*":{"9":"na"},"1/1/*":{"9":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"na"},"0/1/*":{"9":"na"},"1/0/*":{"9":"na"},"1/1/*":{"9":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"d?"},"0/1/*":{"9":"d?"},"1/0/*":{"9":"na"},"1/1/*":{"9":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"na"},"0/1/*":{"9":"na"},"1/0/*":{"9":"na"},"1/1/*":{"9":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"[3?"},"0/1/*":{"9":"[3?"},"1/0/*":{"9":"[3?"},"1/1/*":{"9":"[3?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"na"},"0/1/*":{"9":"na"},"1/0/*":{"9":"na"},"1/1/*":{"9":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"[5?"},"1/0/*":{"9":"[5?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"9":"na"},"0/1/*":{"9":"na"},"1/0/*":{"9":"na"},"1/1/*":{"9":"na"}}}],"modes":[[null,null,"n","n","n",null,"n","","",null,"n","n","n","n","n","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"n","","na","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"n","","n","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"na","na","","","na","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"n","na","","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"na","na","","","na","na","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"na","","","n","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"n","","","na","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"n","n","","","n","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n","","",null,"na","na","","","na","na","na","n","na","n","n","n"]]}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3  RPM SPDL-ROT C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,9,0,36],[36,4,286,1,14,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[18,1,6,0,25,0,201],[19,1,6,0,26,0,0],[15,1,237,128,29,0,141],[48,4,125,65536,33,0,154],[52,4,123,131072,41,0,150],[76,4,6,2097152,41,0,151],[28,2,6,16777216,46,0,152],[56,4,123,262144,49,0,153],[34,2,207,1073741824,57,0,155],[16,1,48,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[9],"rules":{}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[32,255]],[[1,31]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"54":0},"rows":[{"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0}],"own":[{"8":{"*/1/0":{"0":"","5":"n"},"*/1/1":{"0":"","5":"n"},"*/1/2":{"0":"","5":"n"},"*/1/3":{"0":"","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/1/*":{"9":"[5?"},"1/1/*":{"9":"[5?"}}}],"modes":[[null,null,"n","n","n",null,"n","","",null,"n","n","","","n","n","n","n","n","n","n","n"]]}},{"code":17,"name":"WORK MES","head":"UNo. UNIT COMPENSATE   OFS-TOOL      COMP.DATA  SNS-TOOL          No.  INTERVAL OUTPUT","shape":185,"tool":0,"cells":[[28,1,313,0,14,0,0],[16,1,43,0,20,0,35],[17,1,6,2,24,0,0],[40,4,286,2,29,0,37],[18,1,265,2,35,0,38],[27,2,6,0,36,0,201],[15,1,314,0,38,0,157],[9,1,43,0,48,0,0],[10,1,6,0,56,0,0],[36,4,286,1,59,0,37],[11,1,265,1,64,0,38],[8,1,72,2048,66,0,0],[22,2,69,2048,67,0,33],[30,1,6,0,70,0,203],[24,2,207,65536,73,0,0],[13,1,30,0,83,0,0]],"na":{"always":[],"rules":{"3":[[28,[1]]],"6":[[28,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blank":{"1":[[28,[1]]],"4":[[28,[1]]]}}},{"code":15,"name":"WPCSHIFT","head":"UNo. UNIT     SHIFT-X   SHIFT-Y   SHIFT-Z    SHIFT-\u0001          COORD.th   MIRROR","shape":255,"tool":0,"cells":[[36,4,123,1,15,0,169],[40,4,123,2,25,0,170],[48,4,123,8,35,0,171],[56,4,118,64,45,0,172],[60,4,6,128,54,0,172],[44,4,118,4,64,0,173],[8,1,30,65536,76,0,174]]},{"code":57,"name":"MILLTURN","head":"UNo. UNIT         POS-B   CPT-X    CPT-Z      FIN-X      FIN-Z    SHIFT-Y","shape":168,"tool":180,"cells":[[20,2,6,0,10,0,119],[92,4,118,2048,18,0,48],[36,4,123,64,26,0,136],[40,4,123,128,36,0,137],[52,4,123,65536,46,0,138],[56,4,123,131072,57,0,139],[68,4,123,1048576,67,0,170]]},{"code":180,"name":"","head":"SNo TOOL        NOM-Dia No.  PAT. DEP-1     Z-DEC        RPM          C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,43,0,4,0,35],[10,1,239,0,11,0,36],[36,4,286,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,24,0,0],[22,2,69,2048,25,0,33],[18,1,6,0,26,0,201],[19,1,6,134217728,27,0,0],[16,1,51,0,30,0,156],[48,4,123,65536,34,0,0],[52,4,123,131072,43,0,176],[76,4,6,2097152,43,0,151],[28,2,6,16777216,46,0,152],[56,4,6,262144,49,0,153],[34,4,207,1073741824,57,0,155],[16,1,6,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[],"rules":{},"blank":{"3":[[9,[4,5,6,7,8,9,37,38,39,40,41,42]]]}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[32,255]],[[1,31]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"57":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0}],"own":[{"8":{"*/0/0":{"0":"","5":"n"},"*/0/1":{"0":"","5":"n"},"*/0/2":{"0":"","5":"n"},"*/0/3":{"0":"","5":"n"},"*/1/0":{"0":"","5":"n"},"*/1/1":{"0":"","5":"n"},"*/1/2":{"0":"","5":"n"},"*/1/3":{"0":"","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{},"0/1/*":{},"1/0/*":{},"1/1/*":{}}}],"modes":[[null,null,"n","n","n",null,"n","","","n","n","n","","","","=0?","","n","n","n","n","n"]]}},{"code":127,"name":"TEXT","head":"UNo. UNIT     C-FACE     TEXT                                            HGT       DEPTH","shape":196,"tool":181,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,12,0,48],[96,4,118,4096,18,0,49],[36,40,305,1,25,0,178],[76,4,123,2,73,0,179],[80,4,123,4,83,0,180]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":181,"name":"","head":"SNo  TOOL       NOM-D  No.      APRCH-1  APRCH-2 TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[18,1,6,0,26,0,201],[19,1,6,134217728,27,0,0],[40,4,8,2,32,1,105],[44,4,8,4,41,2,106],[15,1,8,128,49,0,107],[14,1,241,0,54,0,108],[48,4,8,8,58,0,109],[52,4,8,16,65,0,110],[60,4,105,32,71,0,104],[64,4,125,64,77,0,87],[24,2,207,256,84,0,39],[26,2,207,512,88,0,39],[32,2,207,536870912,92,0,39]],"na":{"always":[9,10,11,13,14],"rules":{}},"pctx":{"12":{"96":"na"}}},{"code":185,"name":"","head":"SNo. PTN      SPT-X  SPT-Y  SPT-Z   SPT-C   FPT-X  FPT-Y  FPT-Z  LIM+   LIM-   BASE DIR.","shape":65532,"tool":1,"cells":[[8,2,67,0,4,0,0],[12,1,30,0,12,0,0],[11,1,315,0,14,0,0],[36,4,123,1,14,0,0],[22,1,30,33554432,21,0,186],[40,4,123,2,21,0,0],[72,4,123,512,28,0,0],[44,4,123,4,28,0,0],[76,4,118,1024,36,0,0],[48,4,123,8,44,0,0],[52,4,123,16,51,0,0],[56,4,123,32,58,0,0],[60,4,123,64,65,0,0],[64,4,123,128,72,0,0],[10,1,30,131072,79,0,187],[20,1,77,256,86,0,188]],"na":{"always":[],"rules":{"3":[[8,[19],2]],"8":[[8,[19,20],2]],"9":[[8,[19,20],2]],"10":[[8,[19,20],2]],"11":[[8,[19,20],2]],"14":[[8,[19,20],2]],"15":[[8,[19,20],2]]},"blank":{"1":[[8,[0,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"2":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"3":[[8,[20],2]],"4":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"5":[[8,[19,20],2]],"6":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"7":[[8,[19,20],2]]},"blankall":[2,4,6]}},{"code":20,"name":"TOOL-MES","head":"UNo. UNIT    COMPENSATE   OFS-TOOL            No.    INTERVAL  OUTPUT","shape":186,"tool":0,"cells":[[28,1,312,0,16,0,0],[9,1,43,0,23,0,35],[10,1,239,0,31,0,0],[36,4,286,1,36,0,37],[11,1,265,0,41,0,38],[8,1,72,2048,46,0,0],[22,2,69,2048,47,0,33],[18,1,6,0,51,0,201],[19,1,6,134217728,52,0,203],[24,2,207,65536,55,0,0],[13,1,30,0,64,0,0]],"na":{"always":[],"rules":{},"blank":{"2":[[9,[23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]}}},{"code":186,"name":"","head":"SNo. PTN        TOOL.LENGTH/X       TOOL.DIA./Z      UNIT    DIR.","shape":65532,"tool":1,"cells":[[8,2,68,0,4,0,0],[60,4,123,64,19,0,0],[64,4,123,128,38,0,0],[11,2,207,262144,54,0,0],[68,4,118,256,61,0,0]]},{"code":704,"name":"","head":"FIG PTN SHIFT-R  P1Z/CZ    P1C/CC    P3Z/R     P3C        CNR","shape":65532,"tool":0,"cells":[[8,1,55,1,4,0,82],[72,4,123,64,8,0,210],[36,4,123,128,17,0,0],[40,4,118,256,27,0,0],[44,4,123,512,37,0,0],[48,4,118,1024,47,0,197],[52,4,262,2048,57,256,0]],"na":{"always":[],"rules":{"5":[[8,[17]]],"6":[[8,[17]]]}}},{"code":703,"name":"","head":"FIG SHP SHIFT-Z  SHIFT-R  SPT-X   SPT-Y   CX/PX  CY/PY     F M  N  ANGLE  P Q R","shape":65532,"tool":0,"cells":[[8,1,54,1,4,0,77],[44,4,123,256,9,0,211],[48,4,123,512,17,0,210],[36,4,123,64,25,0,160],[40,4,123,128,34,0,182],[56,4,123,2048,42,0,0],[60,4,123,4096,50,0,0],[9,1,30,32768,59,0,0],[20,2,207,2,61,0,0],[22,2,207,4,64,0,79],[52,4,118,1024,68,0,195],[15,1,32,8,74,0,0],[16,1,31,16,76,0,80],[17,1,31,32,78,0,81]],"na":{"always":[],"rules":{"5":[[8,[1]]],"6":[[8,[1,2]]],"7":[[8,[1,2,6]]],"8":[[8,[1]]],"9":[[8,[1,2,6]]],"10":[[8,[1,3,4,5]]],"11":[[8,[2,6]]],"12":[[8,[1]]]},"all":[5,6,7,8,9,10,12]}},{"code":698,"name":"","head":"FIG SHP  SPT-Z    SPT-Y    SPT-R    CZ/PZ   CY/PY  F  M  N  ANGLE P  Q  R","shape":65532,"tool":0,"cells":[[8,1,54,1,4,0,77],[36,4,123,64,9,0,161],[40,4,123,128,18,0,182],[48,4,123,512,27,0,192],[56,4,123,2048,36,0,0],[60,4,123,4096,44,0,0],[9,1,30,32768,51,0,0],[20,2,207,2,54,0,0],[22,2,207,4,57,0,79],[52,4,118,1024,60,0,195],[15,1,32,8,66,0,0],[16,1,31,16,69,0,80],[17,1,31,32,72,0,81]],"na":{"always":[],"rules":{"4":[[8,[1]]],"5":[[8,[1,2]]],"6":[[8,[1,2,6]]],"7":[[8,[1]]],"8":[[8,[1,2,6]]],"9":[[8,[1,3,4,5]]],"10":[[8,[2,6]]],"11":[[8,[1]]]},"all":[4,5,6,7,8,9,11]}},{"code":699,"name":"","head":"FIG SHP  SPT-R/x  SPT-C/y  SPT-Z    CX/PX   CY/PY  F  M  N  ANGLE P  Q  R","shape":65532,"tool":0,"cells":[[8,1,54,1,4,0,77],[36,4,165,64,9,0,189],[40,4,169,128,18,0,190],[44,4,123,256,27,0,161],[56,4,123,2048,36,0,0],[60,4,123,4096,44,0,0],[9,1,30,32768,51,0,0],[20,2,207,2,54,0,0],[22,2,207,4,57,0,79],[52,4,118,1024,60,0,195],[15,1,32,8,66,0,0],[16,1,31,16,69,0,80],[17,1,31,32,72,0,81]],"na":{"always":[],"rules":{"4":[[8,[1]]],"5":[[8,[1,2]]],"6":[[8,[1,2,6]]],"7":[[8,[1]]],"8":[[8,[1,2,6]]],"9":[[8,[1,3,4,5]]],"10":[[8,[2,6]]],"11":[[8,[1]]]},"all":[4,5,6,7,8,9,11]}},{"code":711,"name":"","head":"FIG PTN SHIFT-Z  SHIFT-R  P1X/CX   P1Y/CY   P3X/R      P3Y     CNR","shape":65532,"tool":0,"cells":[[8,1,55,1,4,0,82],[68,4,123,32,8,0,211],[72,4,123,64,17,0,210],[36,4,123,128,26,0,0],[40,4,123,256,35,0,0],[44,4,123,512,44,0,0],[48,4,123,1024,53,0,83],[52,4,262,2048,62,256,0]],"na":{"always":[],"rules":{"6":[[8,[17]]],"7":[[8,[17]]]}}},{"code":719,"name":"","head":"FIG  PTN  SHIFT-Z SHIFT-R  X       Y     RADIUS/0   I       J      P   CNR     RGH","shape":65532,"tool":0,"cells":[[12,1,26,0,3,0,0],[8,1,57,1,4,0,82],[68,4,123,256,10,0,211],[72,4,123,512,18,0,210],[40,4,131,64,26,1,84],[44,4,131,128,34,2,85],[48,4,181,1024,42,4,0],[52,4,131,2048,50,8,0],[56,4,131,4096,58,16,0],[13,1,256,2,66,0,0],[60,4,262,8192,70,256,0],[76,4,6,32768,79,0,198],[64,4,192,16384,79,32768,86]],"na":{"always":[],"rules":{"4":[[8,[35,36,37,38]]],"5":[[8,[35,36,37,38]]],"6":[[8,[35,38]]],"7":[[8,[35,38]]],"8":[[8,[35,38]]],"9":[[8,[38]]],"10":[[8,[35,36,37,38]]]},"blank":{"9":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[9]}},{"code":712,"name":"","head":"FIG  PTN  SHIFT-R   Z        C         R/0       I        J       P    CNR     RGH","shape":65532,"tool":0,"cells":[[12,1,26,0,3,0,0],[8,1,57,1,4,0,82],[72,4,123,512,11,0,210],[40,4,131,64,19,1,163],[44,4,118,128,28,2,212],[48,4,181,1024,38,4,0],[52,4,131,2048,48,8,0],[56,4,119,4096,57,16,0],[13,1,256,2,66,0,0],[60,4,262,8192,70,256,0],[76,4,6,32768,79,0,198],[64,4,192,16384,79,32768,86]],"na":{"always":[],"rules":{"3":[[8,[35,36,37,38]]],"4":[[8,[35,36,37,38]]],"5":[[8,[35,38]]],"6":[[8,[35,38]]],"7":[[8,[35,38]]],"8":[[8,[38]]],"9":[[8,[35,36,37,38]]],"11":[[8,[35]]]},"blank":{"8":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[8]}},{"code":714,"name":"","head":"FIG  PTN  SHIFT-R   Z        Y         R/0       I        J       P    CNR     RGH","shape":65532,"tool":0,"cells":[[12,1,26,0,3,0,0],[8,1,57,1,4,0,82],[72,4,123,512,11,0,0],[40,4,131,64,19,1,163],[44,4,131,128,28,2,85],[48,4,181,1024,38,4,0],[52,4,131,2048,48,8,0],[56,4,131,4096,57,16,0],[13,1,256,2,66,0,0],[60,4,262,8192,70,256,0],[76,4,6,32768,79,0,198],[64,4,192,16384,79,32768,86]],"na":{"always":[],"rules":{"3":[[8,[35,36,37,38]]],"4":[[8,[35,36,37,38]]],"5":[[8,[35,38]]],"6":[[8,[35,38]]],"7":[[8,[35,38]]],"8":[[8,[38]]],"9":[[8,[35,36,37,38]]],"11":[[8,[35]]]},"blank":{"8":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[8]}},{"code":4,"name":"END","head":"UNo. UNIT CONTI. REPEAT SHIFT  NUMBER ATC  RETURN             Work-No.                   EXECTE","shape":166,"tool":0,"cells":[[9,1,31,2,11,0,19],[24,2,207,32,17,0,20],[68,4,123,128,23,0,21],[10,1,30,4,32,0,22],[11,1,32,8,39,0,23],[72,4,6,512,27,0,24],[8,1,6,1,35,0,25],[12,1,211,16,43,0,26],[13,1,6,256,52,0,27],[36,29,304,64,61,0,28],[14,1,312,0,91,0,29]]},{"code":6,"name":"MANL-PRG","head":"UNo. UNIT           TOOL             NOM-DIA      No.                  CHANGE-PT","shape":161,"tool":0,"cells":[[20,1,6,0,13,0,34],[9,1,43,0,20,0,35],[10,1,6,0,32,0,36],[36,4,288,1,37,0,37],[11,1,265,0,44,0,38],[8,1,72,2048,50,0,0],[22,2,69,2048,51,0,33],[18,1,6,0,55,0,201],[19,1,6,134217728,56,0,0],[92,4,6,65536,60,0,48],[24,1,319,0,72,0,202]]},{"code":176,"name":"","head":"SNo  TOOL       NOM-D   No.    HOLE-D HOLE-DEP PRE-DIA PRE-DEP RGH DEPTH C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,288,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[40,4,123,2,32,0,0],[44,4,123,4,39,0,0],[48,4,188,0,48,0,0],[52,4,143,0,55,0,0],[15,1,271,0,62,0,0],[56,4,212,0,67,0,0],[60,4,105,64,73,0,104],[64,4,125,128,78,0,87],[24,2,207,512,85,0,39],[26,2,207,1024,89,0,39],[32,2,207,536870912,93,0,39]],"na":{"always":[],"rules":{"6":[[9,[17]]],"7":[[9,[1,17]]],"8":[[9,[1,3,6,7,8,10,17]]],"9":[[9,[1,3,4,5,6,7,8,9,17]]],"10":[[9,[3,10,13,17]]],"11":[[9,[10,17]]],"12":[[9,[17]]],"13":[[9,[17]]]},"all":[7,8,9]},"pctx":{"14":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"}}},{"code":177,"name":"","head":"SNo  TOOL       NOM-D  No.      APRCH-1  APRCH-2 TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[40,4,138,2,32,1,105],[44,4,139,4,41,2,106],[15,1,277,128,49,0,107],[14,1,241,0,54,0,108],[48,4,123,8,58,0,109],[52,4,126,16,65,0,110],[60,4,105,32,71,0,104],[64,4,125,64,77,0,87],[24,2,207,256,84,0,39],[26,2,207,512,88,0,39],[32,2,207,536870912,92,0,39]],"na":{"always":[],"rules":{"11":[[9,[1]]]},"all":[11]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,14],[16,18],[20,255]],[[1,1]],[[13,13]],[[15,15]],[[19,19]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":2,"66":2,"67":3,"68":3,"80":2,"81":2,"82":3,"83":3,"96":4,"97":5,"98":5,"99":5,"100":5,"101":5,"102":6,"127":0},"rows":[{"0/0":0,"0/1":1,"0/2":0,"0/3":0,"0/4":0,"1/0":0,"1/1":1,"1/2":0,"1/3":0,"1/4":0},{"0/0":2,"0/1":3,"0/2":3,"0/3":4,"0/4":4,"1/0":3,"1/1":3,"1/2":3,"1/3":5,"1/4":5},{"0/0":2,"0/1":3,"0/2":3,"0/3":2,"0/4":4,"1/0":3,"1/1":3,"1/2":3,"1/3":3,"1/4":5},{"0/0":0,"0/1":1,"0/2":1,"0/3":0,"0/4":6,"1/0":1,"1/1":1,"1/2":1,"1/3":1,"1/4":7},{"0/0":8,"0/1":9,"0/2":8,"0/3":8,"0/4":8,"1/0":9,"1/1":9,"1/2":9,"1/3":9,"1/4":9},{"0/0":0,"0/1":1,"0/2":0,"0/3":0,"0/4":0,"1/0":1,"1/1":1,"1/2":1,"1/3":1,"1/4":1},{"0/0":6,"0/1":7,"0/2":7,"0/3":6,"0/4":6,"1/0":7,"1/1":7,"1/2":7,"1/3":7,"1/4":7}],"own":[{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n","n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","na","n","n","n","n","n","n"]]}},{"code":178,"name":"","head":"SNo  TOOL  NOM-D  No APRCH-X  APRCH-Y TYPE ZFD TYPE PK-DEP DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[40,4,138,2,31,1,105],[44,4,139,4,40,2,106],[15,1,277,128,48,0,107],[14,1,241,0,53,0,108],[16,1,242,0,57,0,111],[76,4,123,268435456,62,0,112],[48,4,123,8,69,0,109],[52,4,128,16,76,0,0],[60,4,105,32,82,0,104],[64,4,125,64,88,0,87],[24,2,207,256,95,0,39],[26,2,207,512,99,0,39],[32,2,207,536870912,103,0,39]],"na":{"always":[],"rules":{"14":[[9,[1,13]]],"11":[[9,[13]],[14,[128]]],"13":[[9,[1,13]]],"12":[[16,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[12,13,14]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"13":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"14":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9,14,16],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]],[[[0,127],[129,255]],[[128,128]]],[[[0,2],[4,255]],[[3,3]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":2,"98":2,"99":2,"100":2,"101":2,"102":4,"127":0},"rows":[{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":0,"1/0/0/1":1,"1/0/1/0":0,"1/0/1/1":0,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":4,"0/0/0/1":5,"0/0/1/0":4,"0/0/1/1":4,"0/1/0/0":6,"0/1/0/1":7,"0/1/1/0":6,"0/1/1/1":6,"0/2/0/0":6,"0/2/0/1":6,"0/2/1/0":6,"0/2/1/1":6,"1/0/0/0":8,"1/0/0/1":9,"1/0/1/0":8,"1/0/1/1":8,"1/1/0/0":6,"1/1/0/1":7,"1/1/1/0":6,"1/1/1/1":6,"1/2/0/0":6,"1/2/0/1":6,"1/2/1/0":6,"1/2/1/1":6},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":10,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":1,"0/1/0/0":2,"0/1/0/1":2,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":11,"1/1/0/0":2,"1/1/0/1":2,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":12,"0/0/0/1":13,"0/0/1/0":12,"0/0/1/1":12,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":2,"1/0/0/1":3,"1/0/1/0":2,"1/0/1/1":2,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2}],"own":[{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"na"},"0/0/*/1":{"10":"na"},"0/1/*/0":{"10":"na"},"0/1/*/1":{"10":"na"},"0/2/*/0":{"10":"na"},"0/2/*/1":{"10":"na"},"1/0/*/0":{"10":"na"},"1/0/*/1":{"10":"na"},"1/1/*/0":{"10":"na"},"1/1/*/1":{"10":"na"},"1/2/*/0":{"10":"na"},"1/2/*/1":{"10":"na"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"n"},"0/1/0/*":{"11":"na"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"n"},"1/1/0/*":{"11":"na"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","na","n","n","n","n","n"]]}},{"code":1,"name":"_","head":"UNo. MAT.              OD-MAX  ID-MIN  LENGTH   WORK-FACE  ATC-MODE  RPM","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,0,13,0,0],[64,4,123,256,23,0,114],[68,4,123,512,31,0,115],[72,4,123,1024,40,0,116],[76,4,135,2048,50,0,117],[10,1,31,128,62,0,3],[60,4,107,65536,68,0,118],[92,4,6,32768,76,0,207],[12,2,6,2097152,76,0,208],[80,4,6,4096,80,0,209]]},{"code":54,"name":"T.DRILL","head":"UNo. UNIT    PART              DIA","shape":173,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,6,2048,19,0,48],[8,2,6,2,23,0,141],[36,4,123,64,31,0,50]]},{"code":51,"name":"FACING","head":"UNo. UNIT    PART            FIN-Z","shape":170,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,6,2048,19,0,48],[56,4,123,131072,29,0,139]]},{"code":55,"name":"T.TAP","head":"UNo. UNIT    PART             NOM-DIA       PITCH","shape":173,"tool":180,"cells":[[20,2,233,0,13,0,119],[92,4,6,2048,19,0,48],[36,4,287,64,31,0,37],[56,4,142,134217728,44,512,58]]},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3 FIN-X  FIN-Z  C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,7,0,36],[36,4,286,1,12,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,0],[48,4,125,65536,33,0,0],[52,4,123,131072,41,0,150],[76,4,123,2097152,41,0,151],[28,2,207,16777216,46,0,152],[56,4,123,262144,49,0,153],[68,4,123,524288,56,0,138],[72,4,123,1048576,63,0,139],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"pctx":{"7":{"49":"na","51":"na","55":"na"},"11":{"48":"","49":"","50":"","51":"","52":"na","53":"","54":"","55":""},"12":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","55":"na"},"13":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"14":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"8":{"48":"na","49":"na","50":"na","51":"na","52":"na","55":"na"},"9":{"49":"na","50":"na","51":"na","52":"","53":"na","55":"na"},"10":{"49":"","50":"","51":"","52":"","53":"","54":"","55":""},"16":{"52":"na","55":"na"}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[32,255]],[[1,31]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":1,"49":2,"50":3,"51":4,"52":5,"53":6,"54":7,"55":8,"64":0,"65":0,"66":0,"67":0,"68":0,"80":0,"81":0,"82":0,"83":0,"96":0,"97":0,"98":0,"99":0,"100":0,"101":0,"102":0,"127":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0},{"0/0/0":1,"0/0/1":1,"0/0/2":2,"0/0/3":2,"0/1/0":1,"0/1/1":1,"0/1/2":2,"0/1/3":2,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":5,"1/0/1":5,"1/0/2":5,"1/0/3":5,"1/1/0":5,"1/1/1":5,"1/1/2":5,"1/1/3":5},{"0/0/0":6,"0/0/1":7,"0/0/2":6,"0/0/3":7,"0/1/0":6,"0/1/1":7,"0/1/2":6,"0/1/3":7,"1/0/0":6,"1/0/1":7,"1/0/2":6,"1/0/3":7,"1/1/0":6,"1/1/1":7,"1/1/2":6,"1/1/3":7},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":4,"1/0/1":4,"1/0/2":4,"1/0/3":4,"1/1/0":4,"1/1/1":4,"1/1/2":4,"1/1/3":4},{"0/0/0":8,"0/0/1":8,"0/0/2":8,"0/0/3":8,"1/0/0":8,"1/0/1":8,"1/0/2":8,"1/0/3":8},{"0/0/0":9,"0/0/1":9,"0/0/2":9,"0/0/3":9,"0/1/0":9,"0/1/1":9,"0/1/2":9,"0/1/3":9,"1/0/0":9,"1/0/1":9,"1/0/2":9,"1/0/3":9,"1/1/0":9,"1/1/1":9,"1/1/2":9,"1/1/3":9}],"own":[{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"[3?"},"0/1/*":{"7":"[3?"},"1/0/*":{"7":"[3?"},"1/1/*":{"7":"[3?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"[5?"},"1/0/*":{"7":"[5?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}}],"modes":[[null,null,"n","n","n",null,"n",null,"n","n","n","n","n","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","na","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","n","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","na","","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","na","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","","","n","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","","na","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","n","","","n","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","na","na","n","na","n","n","n"]]}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3  RPM SPDL-ROT C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,9,0,36],[36,4,286,1,14,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,141],[48,4,125,65536,33,0,154],[52,4,123,131072,41,0,150],[76,4,6,2097152,41,0,151],[28,2,6,16777216,46,0,152],[56,4,123,262144,49,0,153],[84,4,107,1073741824,57,0,155],[16,1,48,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[32,255]],[[1,31]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"54":0},"rows":[{"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0}],"own":[{"8":{"*/1/0":{"0":"","5":"n"},"*/1/1":{"0":"","5":"n"},"*/1/2":{"0":"","5":"n"},"*/1/3":{"0":"","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/1/*":{"7":"[5?"},"1/1/*":{"7":"[5?"}}}],"modes":[[null,null,"n","n","n",null,"n",null,"n","n","","","n","n","n","n","n","n","n","n"]]}},{"code":17,"name":"WORK MES","head":"UNo. UNIT COMPENSATE   OFS-TOOL      COMP.DATA  SNS-TOOL          No.  INTERVAL OUTPUT","shape":185,"tool":0,"cells":[[28,1,313,0,14,0,0],[16,1,43,0,20,0,35],[17,1,6,2,24,0,0],[40,4,286,2,29,0,37],[18,1,265,2,35,0,38],[27,2,6,0,36,0,201],[15,1,314,0,38,0,157],[9,1,43,0,48,0,0],[10,1,6,0,56,0,0],[36,4,286,1,59,0,37],[11,1,265,1,64,0,38],[8,1,72,2048,66,0,0],[22,2,69,2048,67,0,33],[24,2,207,65536,73,0,0],[13,1,30,0,83,0,0]],"na":{"always":[],"rules":{"3":[[28,[1]]],"6":[[28,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blank":{"1":[[28,[1]]],"4":[[28,[1]]]}}},{"code":180,"name":"","head":"SNo TOOL        NOM-Dia No.  PAT. DEP-1     Z-DEC        RPM          C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,43,0,4,0,35],[10,1,239,0,11,0,36],[36,4,286,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,24,0,0],[22,2,69,2048,25,0,33],[16,1,51,0,30,0,156],[48,4,123,65536,34,0,0],[52,4,123,131072,43,0,176],[76,4,6,2097152,43,0,151],[28,2,6,16777216,46,0,152],[56,4,6,262144,49,0,153],[34,4,207,1073741824,57,0,155],[16,1,6,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[],"rules":{},"blank":{"3":[[9,[4,5,6,7,8,9,37,38,39,40,41,42]]]}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[32,255]],[[1,31]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"57":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0}],"own":[{"8":{"*/0/0":{"0":"","5":"n"},"*/0/1":{"0":"","5":"n"},"*/0/2":{"0":"","5":"n"},"*/0/3":{"0":"","5":"n"},"*/1/0":{"0":"","5":"n"},"*/1/1":{"0":"","5":"n"},"*/1/2":{"0":"","5":"n"},"*/1/3":{"0":"","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{},"0/1/*":{},"1/0/*":{},"1/1/*":{}}}],"modes":[[null,null,"n","n","n",null,"n","n","n","n","","","","=0?","","n","n","n","n","n"]]}},{"code":127,"name":"TEXT","head":"UNo. UNIT    MODE POS-C  TEXT                                            HGT       DEPTH","shape":196,"tool":181,"cells":[[20,2,66,0,13,0,204],[92,4,118,2048,12,0,48],[96,4,118,4096,18,0,49],[36,40,305,1,25,0,178],[76,4,123,2,73,0,179],[80,4,123,4,83,0,180]],"na":{"always":[],"rules":{"1":[[20,[65,66,67,68,69,70],2]],"2":[[20,[65,66,67,71,72],2]]}}},{"code":181,"name":"","head":"SNo  TOOL       NOM-D  No.      APRCH-1  APRCH-2 TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,23,0,0],[22,2,69,2048,24,0,33],[40,4,8,2,32,1,105],[44,4,8,4,41,2,106],[15,1,8,128,49,0,107],[14,1,241,0,54,0,108],[48,4,8,8,58,0,109],[52,4,8,16,65,0,110],[60,4,105,32,71,0,104],[64,4,125,64,77,0,87],[24,2,207,256,84,0,39],[26,2,207,512,88,0,39],[32,2,207,536870912,92,0,39]],"na":{"always":[7,8,9,11,12],"rules":{}},"pctx":{"10":{"96":"na"}}},{"code":2,"name":"WPC-","head":"UNo. UNIT   ADD.WPC      X         Y        Th         Z                   C","shape":255,"tool":0,"cells":[[8,1,30,0,9,0,8],[20,2,261,256,13,0,9],[36,4,149,1,23,1,10],[40,4,149,2,33,2,11],[44,4,118,4,43,0,12],[48,4,149,8,53,8,13],[56,4,6,64,64,0,14],[60,4,118,128,74,0,14]]},{"code":12,"name":"INDEX","head":"UNo. UNIT   TURN POS X   TURN POS Y    TURN POS Z   ANGLE B  ANGLE C","shape":255,"tool":0,"cells":[[48,4,123,16,15,0,213],[52,4,123,32,28,0,214],[56,4,123,64,42,0,215],[60,4,6,128,52,0,46],[40,4,118,4,52,0,47],[44,4,118,8,61,0,0]]},{"code":177,"name":"","head":"SNo  TOOL  NOM-D  No.   APRCH-X  APRCH-Y TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,24,1,105],[44,4,139,4,33,2,106],[15,1,277,128,41,0,107],[14,1,241,0,46,0,108],[48,4,123,8,50,0,109],[52,4,8,16,57,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"na":{"always":[12],"rules":{"11":[[9,[1]]]},"all":[11]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":4,"98":4,"99":4,"100":4,"101":4,"102":2,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0":0,"0/1":1,"0/2":0,"1/0":0,"1/1":1,"1/2":0},{"0/0":2,"0/1":3,"0/2":3,"1/0":3,"1/1":3,"1/2":3},{"0/0":0,"0/1":1,"0/2":1,"1/0":1,"1/1":1,"1/2":1},{"0/0":4,"0/1":5,"0/2":4,"1/0":5,"1/1":5,"1/2":5},{"0/0":0,"0/1":1,"0/2":0,"1/0":1,"1/1":1,"1/2":1}],"own":[{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n","n","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","n","n!","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","na","n!","n","n","n","n","n"]]}},{"code":178,"name":"","head":"SNo  TOOL  NOM-D  No APRCH-X  APRCH-Y TYPE ZFD TYPE PK-DEP DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,23,1,105],[44,4,139,4,32,2,106],[15,1,277,128,40,0,107],[14,1,241,0,45,0,108],[16,1,242,0,49,0,111],[76,4,123,268435456,54,0,112],[48,4,123,8,61,0,109],[52,4,128,16,68,0,110],[60,4,105,32,74,0,104],[64,4,125,64,80,0,87],[24,2,207,256,87,0,39],[26,2,207,512,91,0,39],[32,2,207,536870912,95,0,39]],"na":{"always":[],"rules":{"14":[[9,[1,13]]],"11":[[9,[13]],[14,[128]]],"13":[[9,[1,13]]],"12":[[16,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[12,13,14]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"13":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"14":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9,14,16],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]],[[[0,127],[129,255]],[[128,128]]],[[[0,2],[4,255]],[[3,3]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":2,"98":2,"99":2,"100":2,"101":2,"102":4,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":0,"1/0/0/1":1,"1/0/1/0":0,"1/0/1/1":0,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":4,"0/0/0/1":5,"0/0/1/0":4,"0/0/1/1":4,"0/1/0/0":6,"0/1/0/1":7,"0/1/1/0":6,"0/1/1/1":6,"0/2/0/0":6,"0/2/0/1":6,"0/2/1/0":6,"0/2/1/1":6,"1/0/0/0":8,"1/0/0/1":9,"1/0/1/0":8,"1/0/1/1":8,"1/1/0/0":6,"1/1/0/1":7,"1/1/1/0":6,"1/1/1/1":6,"1/2/0/0":6,"1/2/0/1":6,"1/2/1/0":6,"1/2/1/1":6},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":10,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":1,"0/1/0/0":2,"0/1/0/1":2,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":11,"1/1/0/0":2,"1/1/0/1":2,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":12,"0/0/0/1":13,"0/0/1/0":12,"0/0/1/1":12,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":2,"1/0/0/1":3,"1/0/1/0":2,"1/0/1/1":2,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2}],"own":[{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"na"},"0/0/*/1":{"10":"na"},"0/1/*/0":{"10":"na"},"0/1/*/1":{"10":"na"},"0/2/*/0":{"10":"na"},"0/2/*/1":{"10":"na"},"1/0/*/0":{"10":"na"},"1/0/*/1":{"10":"na"},"1/1/*/0":{"10":"na"},"1/1/*/1":{"10":"na"},"1/2/*/0":{"10":"na"},"1/2/*/1":{"10":"na"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"n"},"0/1/0/*":{"11":"na"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"n"},"1/1/0/*":{"11":"na"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","na","n","n","n","n","n"]]}},{"code":1,"name":"_","head":"UNo. MAT.              OD-MAX  ID-MIN  LENGTH   WORK-FACE  ATC-MODE  RPM","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,0,13,0,0],[64,4,123,256,23,0,114],[68,4,123,512,31,0,115],[72,4,123,1024,40,0,116],[76,4,135,2048,50,0,117],[10,1,31,128,62,0,3],[22,2,207,65536,68,0,118]]},{"code":22,"name":"2 WORKPC","head":"UNo. UNIT     PAT.     SP1 / SP2  UTUR-ESC  LTUR-ESC     WPC","shape":255,"tool":0,"cells":[[8,1,49,1,14,0,0],[9,1,50,2,23,0,0],[12,1,320,4,34,0,216],[13,1,320,8,44,0,203],[10,1,321,16,54,0,0]],"na":{"always":[],"rules":{"1":[[8,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]],"2":[[8,[0]]],"3":[[8,[0]]],"4":[[8,[0]]]},"all":[1]}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3 FIN-X  FIN-Z  C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,7,0,36],[36,4,286,1,12,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,0],[48,4,125,65536,33,0,0],[52,4,123,131072,41,0,150],[76,4,123,2097152,41,0,151],[28,2,207,16777216,46,0,152],[56,4,123,262144,49,0,153],[68,4,123,524288,56,0,138],[72,4,123,1048576,63,0,139],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"pctx":{"7":{"49":"na","51":"na","53":"na","55":"na"},"11":{"48":"","49":"","50":"","51":"","52":"na","53":"","54":"","55":""},"12":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","55":"na"},"13":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"14":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"8":{"48":"na","49":"na","50":"na","51":"na","52":"na","55":"na"},"9":{"49":"na","50":"na","51":"na","52":"","53":"na","55":"na"},"10":{"49":"","50":"","51":"","52":"","53":"","54":"","55":""},"16":{"52":"na","55":"na"}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,31]],[[32,255]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":1,"49":2,"50":3,"51":4,"52":5,"53":6,"54":7,"55":8,"64":0,"65":0,"66":0,"67":0,"68":0,"80":0,"81":0,"82":0,"83":0,"96":0,"97":0,"98":0,"99":0,"100":0,"101":0,"102":0,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0},{"0/0/0":1,"0/0/1":1,"0/0/2":2,"0/0/3":2,"0/1/0":1,"0/1/1":1,"0/1/2":2,"0/1/3":2,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":5,"1/0/1":5,"1/0/2":5,"1/0/3":5,"1/1/0":5,"1/1/1":5,"1/1/2":5,"1/1/3":5},{"0/0/0":6,"0/0/1":7,"0/0/2":6,"0/0/3":7,"0/1/0":6,"0/1/1":7,"0/1/2":6,"0/1/3":7,"1/0/0":6,"1/0/1":7,"1/0/2":6,"1/0/3":7,"1/1/0":6,"1/1/1":7,"1/1/2":6,"1/1/3":7},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":4,"1/0/1":4,"1/0/2":4,"1/0/3":4,"1/1/0":4,"1/1/1":4,"1/1/2":4,"1/1/3":4},{"0/1/0":8,"0/1/1":8,"0/1/2":8,"0/1/3":8,"1/1/0":8,"1/1/1":8,"1/1/2":8,"1/1/3":8},{"0/0/0":9,"0/0/1":9,"0/0/2":9,"0/0/3":9,"0/1/0":9,"0/1/1":9,"0/1/2":9,"0/1/3":9,"1/0/0":9,"1/0/1":9,"1/0/2":9,"1/0/3":9,"1/1/0":9,"1/1/1":9,"1/1/2":9,"1/1/3":9}],"own":[{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"[3?"},"0/1/*":{"7":"[3?"},"1/0/*":{"7":"[3?"},"1/1/*":{"7":"[3?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/1/*":{"7":"[5?"},"1/1/*":{"7":"[5?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}}],"modes":[[null,null,"n","n","n",null,"n",null,"n","n","n","n","n","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","na","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","n","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","na","","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","na","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","","","n","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","","na","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","n","","","n","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","na","na","n","na","n","n","n"]]}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3  RPM SPDL-ROT C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,9,0,36],[36,4,286,1,14,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,141],[48,4,125,65536,33,0,154],[52,4,123,131072,41,0,150],[76,4,6,2097152,41,0,151],[28,2,6,16777216,46,0,152],[56,4,123,262144,49,0,153],[34,2,207,1073741824,57,0,155],[16,1,48,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,31]],[[32,255]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"54":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0}],"own":[{"8":{"*/0/0":{"0":"","5":"n"},"*/0/1":{"0":"","5":"n"},"*/0/2":{"0":"","5":"n"},"*/0/3":{"0":"","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"[5?"},"1/0/*":{"7":"[5?"}}}],"modes":[[null,null,"n","n","n",null,"n",null,"n","n","","","n","n","n","n","n","n","n","n"]]}},{"code":17,"name":"WORK MES","head":"UNo. UNIT COMPENSATE   OFS-TOOL      COMP.DATA  SNS-TOOL          No.  INTERVAL OUTPUT","shape":185,"tool":0,"cells":[[28,1,313,0,14,0,0],[16,1,43,2,20,0,35],[17,1,6,2,24,0,0],[40,4,286,2,29,0,37],[18,1,265,2,35,0,38],[27,2,6,0,36,0,201],[15,1,314,0,38,0,157],[9,1,43,0,48,0,0],[10,1,6,0,56,0,0],[36,4,286,1,59,0,37],[11,1,265,1,64,0,38],[8,1,72,2048,66,0,0],[22,2,69,2048,67,0,33],[24,2,207,65536,73,0,0],[13,1,30,0,83,0,0]],"na":{"always":[],"rules":{"3":[[28,[1]]],"6":[[28,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blank":{"1":[[28,[1]]],"4":[[28,[1]]]}}},{"code":15,"name":"WPCSHIFT","head":"UNo. UNIT     SHIFT-X   SHIFT-Y   SHIFT-Z    SHIFT-C          COORD.th   MIRROR","shape":255,"tool":0,"cells":[[36,4,123,1,15,0,169],[40,4,123,2,25,0,170],[48,4,123,8,35,0,171],[60,4,118,128,45,0,172],[60,4,6,128,54,0,172],[44,4,118,4,64,0,173],[8,1,30,65536,76,0,174]]},{"code":180,"name":"","head":"SNo TOOL        NOM-Dia No.  PAT. DEP-1     Z-DEC        RPM          C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,43,0,4,0,35],[10,1,239,0,11,0,36],[36,4,286,1,16,0,37],[11,1,265,0,22,0,38],[8,1,72,2048,24,0,0],[22,2,69,2048,25,0,33],[16,1,51,0,30,0,156],[48,4,123,65536,34,0,0],[52,4,123,131072,43,0,176],[76,4,6,2097152,43,0,151],[28,2,6,16777216,46,0,152],[56,4,6,262144,49,0,153],[34,4,207,1073741824,57,0,155],[16,1,6,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[],"rules":{},"blank":{"3":[[9,[4,5,6,7,8,9,37,38,39,40,41,42]]]}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,31]],[[32,255]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"57":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0}],"own":[{"8":{"*/0/0":{"0":"","5":"n"},"*/0/1":{"0":"","5":"n"},"*/0/2":{"0":"","5":"n"},"*/0/3":{"0":"","5":"n"},"*/1/0":{"0":"","5":"n"},"*/1/1":{"0":"","5":"n"},"*/1/2":{"0":"","5":"n"},"*/1/3":{"0":"","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{},"0/1/*":{},"1/0/*":{},"1/1/*":{}}}],"modes":[[null,null,"n","n","n",null,"n","n","n","n","","","","=0?","","n","n","n","n","n"]]}},{"code":185,"name":"","head":"SNo. PTN      SPT-X  SPT-Y  SPT-Z  FPT-X  FPT-Y  FPT-Z  LIM+   LIM-   BASE DIR.","shape":65532,"tool":1,"cells":[[8,2,67,0,4,0,0],[12,1,30,0,12,0,0],[11,1,315,0,14,0,0],[36,4,123,1,14,0,0],[22,1,30,33554432,21,0,186],[40,4,123,2,21,0,0],[72,4,123,512,28,0,0],[44,4,123,4,28,0,0],[76,4,6,1024,36,0,0],[48,4,123,8,35,0,0],[52,4,123,16,42,0,0],[56,4,123,32,49,0,0],[60,4,123,64,56,0,0],[64,4,123,128,63,0,0],[10,1,30,131072,70,0,187],[20,1,77,256,77,0,188]],"na":{"always":[],"rules":{"3":[[8,[19],2]],"9":[[8,[19,20],2]],"10":[[8,[19,20],2]],"11":[[8,[19,20],2]],"14":[[8,[19,20],2]],"15":[[8,[19,20],2]]},"blank":{"1":[[8,[0,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"2":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"3":[[8,[20],2]],"4":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"5":[[8,[19,20],2]],"6":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271],2]],"7":[[8,[19,20],2]]},"blankall":[2,4,6]}},{"code":179,"name":"","head":"SNO  TOOL  NOM-D  NO  APRCH-X  APRCH-Y TYPE  DEPTH  #T PITCH  C-SP   FR   M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,24,1,105],[44,4,139,4,33,2,106],[15,1,278,0,39,0,107],[48,4,123,8,45,0,108],[14,1,30,1024,53,0,109],[56,4,123,8,55,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}}},{"code":6,"name":"MANL-PRG","head":"UNo. UNIT           TOOL             NOM-DIA      No.                  CHANGE-PT","shape":161,"tool":0,"cells":[[8,1,6,0,13,0,34],[9,1,43,0,20,0,35],[10,1,6,0,32,0,36],[36,4,288,1,37,0,37],[11,1,265,0,44,0,38],[8,1,72,2048,50,0,0],[22,2,69,2048,51,0,33],[18,1,6,0,55,0,201],[19,1,6,134217728,56,0,0],[92,4,6,65536,60,0,48],[24,1,319,0,72,0,217]]},{"code":96,"name":"FCE-MILL","head":"UNo. UNIT    C-FACE   DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,274,0,13,0,34],[36,4,135,1,22,0,65],[40,4,123,2,32,0,66],[26,4,6,0,40,0,0],[9,1,38,8,49,0,55],[10,1,8,0,53,0,0],[52,4,123,64,57,0,68],[56,4,8,0,67,0,0]],"na":{"always":[5,7],"rules":{}},"variants":{"0":{"head":"UNo. UNIT             DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"0":[8,1,6,0,13,0,34],"2":[40,4,123,2,32,0,65]}},"1":{"cells":{"2":[40,4,123,2,32,0,65]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R   SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"2":[40,4,123,2,32,0,72]}}}},{"code":97,"name":"TOP-EMILL","head":"UNo. UNIT    C-FACE   DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,274,0,14,0,34],[36,4,135,1,22,0,65],[40,4,123,2,32,0,66],[26,4,6,4,40,0,0],[9,1,38,8,49,0,55],[10,1,8,16,53,0,0],[52,4,123,64,57,0,68],[56,4,8,128,66,0,0]],"na":{"always":[5,7],"rules":{}},"variants":{"0":{"head":"UNo. UNIT             DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"0":[8,1,6,0,14,0,34],"2":[40,4,123,2,32,0,65]}},"1":{"cells":{"2":[40,4,123,2,32,0,65]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R   SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"2":[40,4,123,2,32,0,72]}}}},{"code":98,"name":"STEP","head":"UNo. UNIT    C-FACE   DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,274,0,13,0,34],[36,4,135,1,22,0,65],[40,4,123,2,32,0,66],[26,4,6,4,41,0,0],[9,1,38,8,49,0,55],[10,1,38,16,53,0,60],[52,4,123,64,57,0,68],[56,4,123,128,66,0,69]],"variants":{"0":{"head":"UNo. UNIT             DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"0":[8,1,6,0,13,0,34],"2":[40,4,123,2,32,0,65]}},"1":{"cells":{"2":[40,4,123,2,32,0,65]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R   SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"2":[40,4,123,2,32,0,72]}}}},{"code":99,"name":"POCKET","head":"UNo. UNIT    C-FACE   DEPTH    SRV-Z   BTM WAL FIN-Z    FIN-R    INTER-R  CHMF","shape":193,"tool":178,"cells":[[8,1,274,0,13,0,34],[36,4,135,1,22,0,65],[40,4,123,2,31,0,66],[26,4,6,0,39,0,0],[9,1,38,8,40,0,55],[10,1,38,16,44,0,60],[52,4,123,64,47,0,68],[56,4,123,128,56,0,69],[44,4,123,256,65,0,73],[48,4,189,512,73,1,52]],"variants":{"0":{"head":"UNo. UNIT             DEPTH    SRV-Z   BTM WAL FIN-Z    FIN-R    INTER-R  CHMF","cells":{"0":[8,1,6,0,13,0,34],"2":[40,4,123,2,31,0,65]}},"1":{"cells":{"2":[40,4,123,2,31,0,65]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  SRV-Z   BTM WAL FIN-Z    FIN-R    INTER-R  CHMF","cells":{"2":[40,4,123,2,31,0,72]}}}},{"code":100,"name":"PCKT MTN","head":"UNo. UNIT    C-FACE   DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,274,0,13,0,34],[36,4,135,1,22,0,65],[40,4,123,2,32,0,66],[26,4,6,0,40,0,0],[9,1,38,8,49,0,55],[10,1,38,16,53,0,60],[52,4,123,64,57,0,68],[56,4,123,128,66,0,69]],"variants":{"0":{"head":"UNo. UNIT             DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"0":[8,1,6,0,13,0,34],"2":[40,4,123,2,32,0,65]}},"1":{"cells":{"2":[40,4,123,2,32,0,65]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R   SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"2":[40,4,123,2,32,0,72]}}}},{"code":101,"name":"PCKT VLY","head":"UNo. UNIT    C-FACE   DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","shape":193,"tool":178,"cells":[[8,1,274,0,13,0,34],[36,4,135,1,22,0,65],[40,4,123,2,32,0,66],[26,4,6,0,40,0,0],[9,1,38,8,49,0,55],[10,1,38,16,53,0,60],[52,4,123,64,57,0,68],[56,4,123,128,66,0,69]],"variants":{"0":{"head":"UNo. UNIT             DEPTH     SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"0":[8,1,6,0,13,0,34],"2":[40,4,123,2,32,0,65]}},"1":{"cells":{"2":[40,4,123,2,32,0,65]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R   SRV-Z           BTM WAL  FIN-Z    FIN-R","cells":{"2":[40,4,123,2,32,0,72]}}}},{"code":102,"name":"SLOT","head":"UNo. UNIT    C-FACE   DEPTH    SRV-Z   S-WIDTH  BTM WAL  FIN-Z    FIN-R","shape":194,"tool":178,"cells":[[8,1,274,0,13,0,34],[36,4,135,1,22,0,65],[40,4,123,2,31,0,66],[60,4,123,4,40,0,75],[9,1,38,8,49,0,55],[10,1,38,16,53,0,60],[52,4,123,64,57,0,68],[56,4,123,128,66,0,69],[19,1,6,65536,75,0,76]],"variants":{"0":{"head":"UNo. UNIT             DEPTH    SRV-Z   S-WIDTH  BTM WAL  FIN-Z    FIN-R","cells":{"0":[8,1,6,0,13,0,34],"2":[40,4,123,2,31,0,65]}},"1":{"cells":{"2":[40,4,123,2,31,0,65]}},"2":{"head":"UNo. UNIT    C-FACE   CYLIN.R  SRV-Z   S-WIDTH  BTM WAL  FIN-Z    FIN-R","cells":{"2":[40,4,123,2,31,0,72]}}}},{"code":177,"name":"","head":"SNo  TOOL  NOM-D  No.   APRCH-X  APRCH-Y TYPE ZFD DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,24,1,105],[44,4,139,4,33,2,106],[15,1,277,128,41,0,107],[14,1,241,0,46,0,108],[48,4,123,8,50,0,109],[52,4,126,16,57,0,110],[60,4,105,32,63,0,104],[64,4,125,64,69,0,87],[24,2,207,256,76,0,39],[26,2,207,512,80,0,39],[32,2,207,536870912,84,0,39]],"na":{"always":[],"rules":{"11":[[9,[1]]]},"all":[11]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"11":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"12":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,14],[16,18],[20,255]],[[1,1]],[[13,13]],[[15,15]],[[19,19]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":2,"66":2,"67":3,"68":3,"80":2,"81":2,"82":3,"83":3,"96":4,"97":5,"98":5,"99":5,"100":5,"101":5,"102":6,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0":0,"0/1":1,"0/2":0,"0/3":0,"0/4":0,"1/0":0,"1/1":1,"1/2":0,"1/3":0,"1/4":0},{"0/0":2,"0/1":3,"0/2":3,"0/3":4,"0/4":4,"1/0":3,"1/1":3,"1/2":3,"1/3":5,"1/4":5},{"0/0":2,"0/1":3,"0/2":3,"0/3":2,"0/4":4,"1/0":3,"1/1":3,"1/2":3,"1/3":3,"1/4":5},{"0/0":0,"0/1":1,"0/2":1,"0/3":0,"0/4":6,"1/0":1,"1/1":1,"1/2":1,"1/3":1,"1/4":7},{"0/0":8,"0/1":9,"0/2":8,"0/3":8,"0/4":8,"1/0":9,"1/1":9,"1/2":9,"1/3":9,"1/4":9},{"0/0":0,"0/1":1,"0/2":0,"0/3":0,"0/4":0,"1/0":1,"1/1":1,"1/2":1,"1/3":1,"1/4":1},{"0/0":6,"0/1":7,"0/2":7,"0/3":6,"0/4":6,"1/0":7,"1/1":7,"1/2":7,"1/3":7,"1/4":7}],"own":[{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}},{"8":{"*/0":{"0":"n","5":"n"},"*/1":{"0":"n","5":"n"},"*/2":{"0":"n","5":"n"},"*/3":{"0":"n","5":"n"},"*/4":{"0":"n","5":"n"}},"9":{"0/*":{"1":"n"},"1/*":{"1":"n"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n","n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na","n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n","na","na","n","n","n","n","n","n"]]}},{"code":178,"name":"","head":"SNo  TOOL  NOM-D  No APRCH-X  APRCH-Y TYPE ZFD TYPE PK-DEP DEP-Z  WID-R C-SP  FR     M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,43,0,4,0,35],[10,1,6,0,11,0,36],[36,4,136,1,11,0,37],[11,1,265,0,17,0,38],[8,1,72,2048,18,0,0],[22,2,69,2048,19,0,33],[40,4,138,2,23,1,105],[44,4,139,4,32,2,106],[15,1,277,128,40,0,107],[14,1,241,0,45,0,108],[16,1,242,0,49,0,111],[76,4,123,268435456,54,0,112],[48,4,123,8,61,0,109],[52,4,128,16,68,0,0],[60,4,105,32,74,0,104],[64,4,125,64,80,0,87],[24,2,207,256,87,0,39],[26,2,207,512,91,0,39],[32,2,207,536870912,95,0,39]],"na":{"always":[],"rules":{"14":[[9,[1,13]]],"11":[[9,[13]],[14,[128]]],"13":[[9,[1,13]]],"12":[[16,[0,1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"all":[12,13,14]},"pctx":{"9":{"64":"na","65":"na","66":"na","80":"na","81":"na"},"13":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","96":"na","97":"na","98":"na","99":"na","100":"na","101":"na","102":"na"},"14":{"64":"na","65":"na","66":"na","67":"na","68":"na","80":"na","81":"na","82":"na","83":"na","102":"na"},"10":{"96":"na"}},"cx":{"sel":[8,9,14,16],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,0],[2,12],[14,255]],[[1,1]],[[13,13]]],[[[0,127],[129,255]],[[128,128]]],[[[0,2],[4,255]],[[3,3]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"57":0,"64":1,"65":1,"66":1,"67":2,"68":2,"80":1,"81":1,"82":2,"83":2,"96":3,"97":2,"98":2,"99":2,"100":2,"101":2,"102":4,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":0,"1/0/0/1":1,"1/0/1/0":0,"1/0/1/1":0,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":4,"0/0/0/1":5,"0/0/1/0":4,"0/0/1/1":4,"0/1/0/0":6,"0/1/0/1":7,"0/1/1/0":6,"0/1/1/1":6,"0/2/0/0":6,"0/2/0/1":6,"0/2/1/0":6,"0/2/1/1":6,"1/0/0/0":8,"1/0/0/1":9,"1/0/1/0":8,"1/0/1/1":8,"1/1/0/0":6,"1/1/0/1":7,"1/1/1/0":6,"1/1/1/1":6,"1/2/0/0":6,"1/2/0/1":6,"1/2/1/0":6,"1/2/1/1":6},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":0,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":10,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":0,"0/0/0/1":1,"0/0/1/0":0,"0/0/1/1":1,"0/1/0/0":2,"0/1/0/1":2,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":10,"1/0/0/1":11,"1/0/1/0":10,"1/0/1/1":11,"1/1/0/0":2,"1/1/0/1":2,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2},{"0/0/0/0":12,"0/0/0/1":13,"0/0/1/0":12,"0/0/1/1":12,"0/1/0/0":2,"0/1/0/1":3,"0/1/1/0":2,"0/1/1/1":2,"0/2/0/0":2,"0/2/0/1":2,"0/2/1/0":2,"0/2/1/1":2,"1/0/0/0":2,"1/0/0/1":3,"1/0/1/0":2,"1/0/1/1":2,"1/1/0/0":2,"1/1/0/1":3,"1/1/1/0":2,"1/1/1/1":2,"1/2/0/0":2,"1/2/0/1":2,"1/2/1/0":2,"1/2/1/1":2}],"own":[{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"na"},"0/0/*/1":{"10":"na"},"0/1/*/0":{"10":"na"},"0/1/*/1":{"10":"na"},"0/2/*/0":{"10":"na"},"0/2/*/1":{"10":"na"},"1/0/*/0":{"10":"na"},"1/0/*/1":{"10":"na"},"1/1/*/0":{"10":"na"},"1/1/*/1":{"10":"na"},"1/2/*/0":{"10":"na"},"1/2/*/1":{"10":"na"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"n"},"0/1/0/*":{"11":"na"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"n"},"1/1/0/*":{"11":"na"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}},{"8":{"*/0/0/0":{"0":"n","5":"n"},"*/0/0/1":{"0":"n","5":"n"},"*/0/1/0":{"0":"n","5":"n"},"*/0/1/1":{"0":"n","5":"n"},"*/1/0/0":{"0":"n","5":"n"},"*/1/0/1":{"0":"n","5":"n"},"*/1/1/0":{"0":"n","5":"n"},"*/1/1/1":{"0":"n","5":"n"},"*/2/0/0":{"0":"n","5":"n"},"*/2/0/1":{"0":"n","5":"n"},"*/2/1/0":{"0":"n","5":"n"},"*/2/1/1":{"0":"n","5":"n"}},"9":{"0/*/0/0":{"1":"n"},"0/*/0/1":{"1":"n"},"0/*/1/0":{"1":"n"},"0/*/1/1":{"1":"n"},"1/*/0/0":{"1":"n"},"1/*/0/1":{"1":"n"},"1/*/1/0":{"1":"n"},"1/*/1/1":{"1":"n"}},"14":{"0/0/*/0":{"10":"n"},"0/0/*/1":{"10":"n"},"0/1/*/0":{"10":"n"},"0/1/*/1":{"10":"n"},"0/2/*/0":{"10":"n"},"0/2/*/1":{"10":"n"},"1/0/*/0":{"10":"n"},"1/0/*/1":{"10":"n"},"1/1/*/0":{"10":"n"},"1/1/*/1":{"10":"n"},"1/2/*/0":{"10":"n"},"1/2/*/1":{"10":"n"}},"16":{"0/0/0/*":{"11":"n"},"0/0/1/*":{"11":"na"},"0/1/0/*":{"11":"n"},"0/1/1/*":{"11":"na"},"0/2/0/*":{"11":"na"},"0/2/1/*":{"11":"na"},"1/0/0/*":{"11":"n"},"1/0/1/*":{"11":"na"},"1/1/0/*":{"11":"n"},"1/1/1/*":{"11":"na"},"1/2/0/*":{"11":"na"},"1/2/1/*":{"11":"na"}}}],"modes":[[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","n","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","na",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","na","n","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"na","n","na","n","n","n","n","n"],[null,null,"","n","n",null,"n","n","n","n",null,null,"n","n","na","n","n","n","n","n"]]}},{"code":1,"name":"_","head":"UNo. MAT.              OD-MAX  ID-MIN  LENGTH   WORK-FACE  ATC-MODE  RPM","shape":255,"tool":0,"cells":[[84,8,301,1,4,0,1],[8,1,6,0,13,0,0],[64,4,123,256,23,0,114],[68,4,123,512,31,0,115],[72,4,123,1024,40,0,116],[76,4,135,2048,50,0,117],[10,1,31,128,62,0,3],[60,4,107,65536,68,0,118]]},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3 FIN-X  FIN-Z  C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,272,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,7,0,36],[36,4,286,1,12,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,0],[48,4,125,65536,33,0,0],[52,4,123,131072,41,0,150],[76,4,123,2097152,41,0,151],[28,2,207,16777216,46,0,152],[56,4,123,262144,49,0,153],[68,4,123,524288,56,0,138],[72,4,123,1048576,63,0,139],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"pctx":{"7":{"49":"na","51":"na","55":"na"},"11":{"48":"","49":"","50":"","51":"","52":"na","53":"","54":"","55":""},"12":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","55":"na"},"13":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"14":{"48":"na","49":"na","50":"na","51":"na","52":"na","53":"na","54":"na","55":"na"},"8":{"48":"na","49":"na","50":"na","51":"na","52":"na","55":"na"},"9":{"49":"na","50":"na","51":"na","52":"","53":"na","55":"na"},"10":{"49":"","50":"","51":"","52":"","53":"","54":"","55":""},"16":{"52":"na","55":"na"}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,31]],[[32,255]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"0":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"10":0,"11":0,"12":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"48":1,"49":2,"50":3,"51":4,"52":5,"53":6,"54":7,"55":8,"64":0,"65":0,"66":0,"67":0,"68":0,"80":0,"81":0,"82":0,"83":0,"96":0,"97":0,"98":0,"99":0,"100":0,"101":0,"102":0,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"127":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"0/1/0":0,"0/1/1":0,"0/1/2":0,"0/1/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0,"1/1/0":0,"1/1/1":0,"1/1/2":0,"1/1/3":0},{"0/0/0":1,"0/0/1":1,"0/0/2":2,"0/0/3":2,"0/1/0":1,"0/1/1":1,"0/1/2":2,"0/1/3":2,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":3,"1/0/1":3,"1/0/2":3,"1/0/3":3,"1/1/0":3,"1/1/1":3,"1/1/2":3,"1/1/3":3},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":5,"1/0/1":5,"1/0/2":5,"1/0/3":5,"1/1/0":5,"1/1/1":5,"1/1/2":5,"1/1/3":5},{"0/0/0":6,"0/0/1":7,"0/0/2":6,"0/0/3":7,"0/1/0":6,"0/1/1":7,"0/1/2":6,"0/1/3":7,"1/0/0":6,"1/0/1":7,"1/0/2":6,"1/0/3":7,"1/1/0":6,"1/1/1":7,"1/1/2":6,"1/1/3":7},{"0/0/0":4,"0/0/1":4,"0/0/2":4,"0/0/3":4,"0/1/0":4,"0/1/1":4,"0/1/2":4,"0/1/3":4,"1/0/0":4,"1/0/1":4,"1/0/2":4,"1/0/3":4,"1/1/0":4,"1/1/1":4,"1/1/2":4,"1/1/3":4},{"0/1/0":8,"0/1/1":8,"0/1/2":8,"0/1/3":8,"1/1/0":8,"1/1/1":8,"1/1/2":8,"1/1/3":8},{"0/0/0":9,"0/0/1":9,"0/0/2":9,"0/0/3":9,"0/1/0":9,"0/1/1":9,"0/1/2":9,"0/1/3":9,"1/0/0":9,"1/0/1":9,"1/0/2":9,"1/0/3":9,"1/1/0":9,"1/1/1":9,"1/1/2":9,"1/1/3":9}],"own":[{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"[3?"},"0/1/*":{"7":"[3?"},"1/0/*":{"7":"[3?"},"1/1/*":{"7":"[3?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"d?"},"0/1/*":{"7":"d?"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}},{"8":{"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/1/*":{"7":"[5?"},"1/1/*":{"7":"[5?"}}},{"8":{"*/0/0":{"0":"n","5":"n"},"*/0/1":{"0":"n","5":"n"},"*/0/2":{"0":"n","5":"n"},"*/0/3":{"0":"n","5":"n"},"*/1/0":{"0":"n","5":"n"},"*/1/1":{"0":"n","5":"n"},"*/1/2":{"0":"n","5":"n"},"*/1/3":{"0":"n","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"na"},"0/1/*":{"7":"na"},"1/0/*":{"7":"na"},"1/1/*":{"7":"na"}}}],"modes":[[null,null,"n","n","n",null,"n",null,"n","n","n","n","n","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","na","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","n","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","n","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","na","","","na","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","na","n","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","","","n","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","","","na","na","na","na","n","na","n","n","n"],[null,null,"n","n","n",null,"n",null,"n","n","","","n","na","na","n","n","n","n","n"],[null,null,"n","n","n",null,"n",null,"na","na","","","na","na","na","n","na","n","n","n"]]}},{"code":180,"name":"","head":"SNo TOOL     NOM.    No.    PAT. DEP-1  DEP-2/NUM DEP-3  RPM SPDL-ROT C-SP  FR    M   M   M","shape":65534,"tool":0,"cells":[[8,1,6,0,0,0,0],[9,1,53,0,4,0,35],[10,1,239,0,9,0,36],[36,4,286,1,14,0,37],[11,1,265,0,20,0,38],[8,1,72,2048,21,0,0],[22,2,69,2048,22,0,33],[15,1,237,128,29,0,141],[48,4,125,65536,33,0,154],[52,4,123,131072,41,0,150],[76,4,6,2097152,41,0,151],[28,2,6,16777216,46,0,152],[56,4,123,262144,49,0,153],[84,4,107,1073741824,57,0,155],[16,1,48,0,63,0,156],[60,4,105,32,70,0,104],[64,4,125,64,75,0,87],[24,2,207,256,82,0,39],[26,2,207,512,86,0,39],[32,2,207,536870912,90,0,39]],"na":{"always":[7],"rules":{}},"cx":{"sel":[8,9,15],"cls":[[[[0,1],[4,5],[8,9],[12,13],[16,17],[20,21],[24,25],[28,29],[32,33],[36,37],[40,41],[44,45],[48,49],[52,53],[56,57],[60,61],[64,65],[68,69],[72,73],[76,77],[80,81],[84,85],[88,89],[92,93],[96,97],[100,101],[104,105],[108,109],[112,113],[116,117],[120,121],[124,125],[128,129],[132,133],[136,137],[140,141],[144,145],[148,149],[152,153],[156,157],[160,161],[164,165],[168,169],[172,173],[176,177],[180,181],[184,185],[188,189],[192,193],[196,197],[200,201],[204,205],[208,209],[212,213],[216,217],[220,221],[224,225],[228,229],[232,233],[236,237],[240,241],[244,245],[248,249],[252,253]],[[2,3],[6,7],[10,11],[14,15],[18,19],[22,23],[26,27],[30,31],[34,35],[38,39],[42,43],[46,47],[50,51],[54,55],[58,59],[62,63],[66,67],[70,71],[74,75],[78,79],[82,83],[86,87],[90,91],[94,95],[98,99],[102,103],[106,107],[110,111],[114,115],[118,119],[122,123],[126,127],[130,131],[134,135],[138,139],[142,143],[146,147],[150,151],[154,155],[158,159],[162,163],[166,167],[170,171],[174,175],[178,179],[182,183],[186,187],[190,191],[194,195],[198,199],[202,203],[206,207],[210,211],[214,215],[218,219],[222,223],[226,227],[230,231],[234,235],[238,239],[242,243],[246,247],[250,251],[254,255]]],[[[0,31]],[[32,255]]],[[[0,0]],[[1,2]],[[3,3]],[[4,255]]]],"pc":{"54":0},"rows":[{"0/0/0":0,"0/0/1":0,"0/0/2":0,"0/0/3":0,"1/0/0":0,"1/0/1":0,"1/0/2":0,"1/0/3":0}],"own":[{"8":{"*/0/0":{"0":"","5":"n"},"*/0/1":{"0":"","5":"n"},"*/0/2":{"0":"","5":"n"},"*/0/3":{"0":"","5":"n"}},"9":{"0/*/0":{"1":"n"},"0/*/1":{"1":"n"},"0/*/2":{"1":"n"},"0/*/3":{"1":"n"},"1/*/0":{"1":"n"},"1/*/1":{"1":"n"},"1/*/2":{"1":"n"},"1/*/3":{"1":"n"}},"15":{"0/0/*":{"7":"[5?"},"1/0/*":{"7":"[5?"}}}],"modes":[[null,null,"n","n","n",null,"n",null,"n","n","","","n","n","n","n","n","n","n","n"]]}},{"code":452,"name":"","head":"FIG PTN    SPT-R     SPT-th    SPT-X     SPT-Y      NUM     ANG     Q  R","shape":65532,"tool":0,"cells":[[8,1,54,0,4,0,0],[40,4,123,2,12,0,192],[44,4,118,4,22,0,193],[36,4,123,2048,32,0,160],[48,4,123,8,42,0,182],[20,2,207,128,52,0,194],[56,4,118,32,60,0,195],[16,1,30,1024,68,0,80],[17,1,30,4096,71,0,81]],"na":{"always":[],"rules":{"5":[[8,[1]]],"6":[[8,[1,5]]],"7":[[8,[1,5]]]},"all":[5,6,7]}},{"code":0,"name":"","head":"TNo.    X        Z       X      Z      X    Z   TIME NUM. TIME NUM.   X     Z","shape":0,"tool":0,"cells":[[16,1,30,0,0,0,0],[10,1,264,0,2,0,0],[192,4,100,0,4,0,0],[200,4,100,0,13,0,0],[132,4,100,0,22,0,0],[136,4,100,0,29,0,0],[140,4,6,0,29,0,0],[144,4,100,0,36,0,0],[148,4,100,0,42,0,0],[152,4,6,0,46,0,0],[168,4,100,0,48,0,0],[172,4,100,0,55,0,0],[176,4,100,0,60,0,0],[120,2,207,0,67,0,0],[122,2,207,0,74,0,0],[100,8,301,0,78,0,0]],"cx":{"sel":[],"cls":[],"pc":{"0":0},"rows":[{"":0}],"own":[{}],"modes":[["n","n","n","n","n","n","","n","n","","n","n","n","n","n","n"]]},"heads":["         TOOL SET       WEAR COMP.    MAX WEAR    LIFE      USED    TL EYE COMP.","TNo.    X        Z       X      Z      X    Z   TIME NUM. TIME NUM.   X     Z"]},{"code":0,"name":"","head":"        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","shape":0,"tool":0,"cells":[[16,1,293,0,0,0,0],[68,1,6,0,3,0,0],[8,1,43,0,6,0,0],[20,4,288,1,20,0,0],[10,1,265,0,28,0,0],[44,1,268,0,30,0,0],[24,4,100,0,35,0,0],[28,4,100,0,43,0,0],[48,4,215,16777216,52,0,0],[52,4,216,33554432,60,0,0],[96,1,30,0,70,0,0],[56,4,100,0,72,0,0],[60,8,301,0,79,0,0],[100,8,303,0,88,0,0],[13,1,322,0,94,0,0],[36,4,102,0,95,0,0]],"na":{"always":[],"rules":{"8":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13]]]},"all":[8],"blank":{"15":[[8,[0,4,5,6,7,8,9,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]],"8":[[8,[35]]],"14":[[8,[0,1,2,3,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[14],"blankalways":[0]},"cx":{"sel":[8],"cls":[[[[0,0]],[[1,1]],[[2,2]],[[3,3]],[[4,4]],[[5,5]],[[6,6]],[[7,7]],[[8,8]],[[9,9]],[[10,10]],[[11,11]],[[12,12]],[[13,13]],[[14,14]],[[15,15]],[[16,16]],[[17,17]],[[18,18]],[[19,19]],[[20,20]],[[21,21]],[[22,22]],[[23,23]],[[24,24]],[[25,25]],[[26,26]],[[27,27]],[[28,28]],[[29,29]],[[30,30]],[[31,31]],[[32,32]],[[33,33]],[[34,34]],[[35,35]],[[36,36]],[[37,37]],[[38,38]],[[39,39]],[[40,40]],[[41,41]],[[42,42]],[[43,43]],[[44,44]],[[45,45]],[[46,46]],[[47,47]],[[48,48]],[[49,49]],[[50,50]],[[51,51]],[[52,52]],[[53,53]],[[54,54]],[[55,55]],[[56,56]],[[57,57]],[[58,58]],[[59,59]],[[60,60]],[[61,61]],[[62,62]],[[63,63]],[[64,255]]]],"pc":{"0":0},"rows":[{"0":0,"1":1,"2":1,"3":1,"4":2,"5":2,"6":2,"7":2,"8":2,"9":2,"10":1,"11":1,"12":1,"13":3,"14":4,"15":4,"16":5,"17":5,"18":5,"19":5,"20":5,"21":5,"22":5,"23":5,"24":5,"25":5,"26":5,"27":5,"28":5,"29":5,"30":5,"31":5,"32":6,"33":7,"34":8,"35":9,"36":7,"37":10,"38":10,"39":10,"40":10,"41":10,"42":11,"43":7,"44":6,"45":6,"46":6,"47":6,"48":7,"49":7,"50":7,"51":7,"52":7,"53":12,"54":12,"55":7,"56":6,"57":6,"58":6,"59":6,"60":6,"61":6,"62":6,"63":6,"64":6}],"own":[{"8":{"*":{"2":"n"}}}],"modes":[["n","",null,"n","n","n","n","n","na?","f95?","n","n","n","n","",""],["n","",null,"n","n","n","n","n","na?","f95?","n","n","n","n","","n"],["n","",null,"f214?","n","n","n","n","na?","f95?","n","n","n","n","n",""],["n","",null,"n","n","n","n","n","na?","n","n","n","n","n","","n"],["n","",null,"n","n","n","n","n","n","n","n","n","n","n","","n"],["n","",null,"n","n","n","n","n","n","f95?","n","n","n","n","","n"],["n","",null,"n","n","n","n","n","x?","f95?","n","n","n","n","",""],["n","",null,"n","n","n","n","n","n","f95?","n","n","n","n","",""],["n","",null,"n","n","n","n","n","n","f100?","n","n","n","n","",""],["n","",null,"n","n","n","n","n","","f95?","n","n","n","n","",""],["n","",null,"f214?","n","n","n","n","n","f95?","n","n","n","n","",""],["n","",null,"f214?","n","n","n","n","x?","f95?","n","n","n","n","",""],["n","",null,"n","n","n","n","n","d?","f95?","n","n","n","n","",""]]},"heads":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float"]},{"code":0,"name":"","head":"No. Tool      Nom-Dia      Matl.    Depth    Min-Dia. Teeth  Angle","shape":0,"tool":0,"cells":[[4,1,43,0,5,0,0],[8,4,214,0,14,0,0],[6,1,264,0,24,0,0],[16,8,301,0,27,0,0],[28,4,100,0,37,0,0],[12,4,100,0,46,0,0],[24,1,30,0,56,0,0],[32,4,118,0,62,0,0]],"cx":{"sel":[4],"cls":[[[[0,0]],[[1,1]],[[2,2]],[[3,3]],[[4,4]],[[5,5]],[[6,6]],[[7,7]],[[8,8]],[[9,9]],[[10,10]],[[11,11]],[[12,12]],[[13,13]],[[14,14]],[[15,15]],[[16,16]],[[17,17]],[[18,18]],[[19,19]],[[20,20]],[[21,21]],[[22,22]],[[23,23]],[[24,24]],[[25,25]],[[26,26]],[[27,27]],[[28,28]],[[29,29]],[[30,30]],[[31,31]],[[32,32]],[[33,33]],[[34,34]],[[35,35]],[[36,36]],[[37,37]],[[38,38]],[[39,39]],[[40,40]],[[41,41]],[[42,42]],[[43,43]],[[44,44]],[[45,45]],[[46,46]],[[47,47]],[[48,48]],[[49,49]],[[50,50]],[[51,51]],[[52,52]],[[53,53]],[[54,54]],[[55,55]],[[56,56]],[[57,57]],[[58,58]],[[59,59]],[[60,60]],[[61,61]],[[62,62]],[[63,63]],[[64,255]]]],"pc":{"0":0},"rows":[{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":1,"38":1,"39":1,"40":1,"41":1,"42":1,"43":0,"44":0,"45":0,"46":0,"47":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"56":0,"57":0,"58":0,"59":0,"60":0,"61":0,"62":0,"63":0,"64":0}],"own":[{"4":{"*":{"0":"n"}}}],"modes":[[null,"n","n","n","n","n","n","n"],[null,"f214","n","n","n","n","n","n"]]},"heads":["No. Tool      Nom-Dia      Matl.    Depth    Min-Dia. Teeth  Angle"]},{"code":0,"name":"","head":"        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float","shape":0,"tool":0,"cells":[[16,1,293,0,0,0,0],[68,1,6,0,3,0,0],[8,1,43,0,6,0,0],[20,4,288,1,20,0,0],[10,1,265,0,28,0,0],[44,1,268,0,30,0,0],[24,4,100,0,35,0,0],[28,4,100,0,43,0,0],[48,4,215,16777216,52,0,0],[52,4,216,33554432,60,0,0],[96,1,30,0,70,0,0],[56,4,100,0,72,0,0],[60,8,301,0,79,0,0],[100,8,303,0,88,0,0],[13,1,322,0,94,0,0],[36,4,102,0,95,0,0],[216,16,301,0,98,0,0]],"na":{"always":[],"rules":{"8":[[8,[0,1,2,3,4,5,6,7,8,9,10,11,12,13]]]},"all":[8],"blank":{"15":[[8,[0,4,5,6,7,8,9,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]],"8":[[8,[35]]],"14":[[8,[0,1,2,3,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]]]},"blankall":[14],"blankalways":[0]},"cx":{"sel":[8],"cls":[[[[0,0]],[[1,1]],[[2,2]],[[3,3]],[[4,4]],[[5,5]],[[6,6]],[[7,7]],[[8,8]],[[9,9]],[[10,10]],[[11,11]],[[12,12]],[[13,13]],[[14,14]],[[15,15]],[[16,16]],[[17,17]],[[18,18]],[[19,19]],[[20,20]],[[21,21]],[[22,22]],[[23,23]],[[24,24]],[[25,25]],[[26,26]],[[27,27]],[[28,28]],[[29,29]],[[30,30]],[[31,31]],[[32,32]],[[33,33]],[[34,34]],[[35,35]],[[36,36]],[[37,37]],[[38,38]],[[39,39]],[[40,40]],[[41,41]],[[42,42]],[[43,43]],[[44,44]],[[45,45]],[[46,46]],[[47,47]],[[48,48]],[[49,49]],[[50,50]],[[51,51]],[[52,52]],[[53,53]],[[54,54]],[[55,55]],[[56,56]],[[57,57]],[[58,58]],[[59,59]],[[60,60]],[[61,61]],[[62,62]],[[63,63]],[[64,255]]]],"pc":{"0":0},"rows":[{"0":0,"1":1,"2":1,"3":1,"4":2,"5":2,"6":2,"7":2,"8":2,"9":2,"10":1,"11":1,"12":1,"13":3,"14":4,"15":4,"16":5,"17":5,"18":5,"19":5,"20":5,"21":5,"22":5,"23":5,"24":5,"25":5,"26":5,"27":5,"28":5,"29":5,"30":5,"31":5,"32":6,"33":7,"34":8,"35":9,"36":7,"37":10,"38":10,"39":10,"40":10,"41":10,"42":11,"43":7,"44":6,"45":6,"46":6,"47":6,"48":7,"49":7,"50":7,"51":7,"52":7,"53":12,"54":12,"55":7,"56":6,"57":6,"58":6,"59":6,"60":6,"61":6,"62":6,"63":6,"64":6}],"own":[{"8":{"*":{"2":"n"}}}],"modes":[["n","",null,"n","n","n","n","n","na?","f95?","n","n","n","n","","","n"],["n","",null,"n","n","n","n","n","na?","f95?","n","n","n","n","","n","n"],["n","",null,"f214?","n","n","n","n","na?","f95?","n","n","n","n","n","","n"],["n","",null,"n","n","n","n","n","na?","n","n","n","n","n","","n","n"],["n","",null,"n","n","n","n","n","n","n","n","n","n","n","","n","n"],["n","",null,"n","n","n","n","n","n","f95?","n","n","n","n","","n","n"],["n","",null,"n","n","n","n","n","x?","f95?","n","n","n","n","","","n"],["n","",null,"n","n","n","n","n","n","f95?","n","n","n","n","","","n"],["n","",null,"n","n","n","n","n","n","f100?","n","n","n","n","","","n"],["n","",null,"n","n","n","n","n","","f95?","n","n","n","n","","","n"],["n","",null,"f214?","n","n","n","n","n","f95?","n","n","n","n","","","n"],["n","",null,"f214?","n","n","n","n","x?","f95?","n","n","n","n","","","n"],["n","",null,"n","n","n","n","n","d?","f95?","n","n","n","n","","","n"]]},"heads":["                                                    Depth","                    Nom.     FW/RV Act-Dia         Grv-Dep  Tip-Wid                           Len-Comp","        Tool       Nom-Dia    R/L  Nose-R  Length Cut-Angle Edg-Ang Hldr Width  Mat'l         Tap Fix/Float"]},{"code":0,"name":"","head":"PKNo    X        Z       X      Z    X    Z      X      Z    TIME NUM.TIME NUM. IDNo.","shape":0,"tool":0,"cells":[[16,1,30,0,0,0,0],[10,1,264,0,2,0,0],[192,4,100,0,4,0,0],[200,4,100,0,13,0,0],[132,4,100,0,22,0,0],[136,4,100,0,29,0,0],[140,4,6,0,29,0,0],[144,4,100,0,36,0,0],[148,4,100,0,42,0,0],[152,4,6,0,46,0,0],[168,4,100,0,48,0,0],[172,4,100,0,55,0,0],[176,4,100,0,60,0,0],[120,2,207,0,67,0,0],[122,2,207,0,74,0,0],[100,8,301,0,78,0,0]],"cx":{"sel":[],"cls":[],"pc":{"0":0},"rows":[{"":0}],"own":[{}],"modes":[["n","n","n","n","n","n","","n","n","","n","n","n","n","n","n"]]},"heads":["        -TOOL SET-     -WEAR COMP.-  MAX WEAR   CONS. COMP     LIFE     USED    Comments","PKNo    X        Z       X      Z    X    Z      X      Z    TIME NUM.TIME NUM. IDNo."]},{"code":0,"name":"","head":"TNo. Tool    Nom. Dia     Mat.    Depth   No.  |      Angle","shape":0,"tool":0,"cells":[[4,1,40,0,5,0,0],[8,4,288,0,14,0,0],[5,1,264,0,21,0,0],[16,8,301,0,24,0,0],[28,4,112,0,34,0,0],[24,1,30,0,43,0,0],[32,4,112,0,52,0,0]],"cx":{"sel":[4],"cls":[[[[0,0]],[[1,1]],[[2,2]],[[3,3]],[[4,4]],[[5,5]],[[6,6]],[[7,7]],[[8,8]],[[9,9]],[[10,10]],[[11,11]],[[12,12]],[[13,13]],[[14,14]],[[15,15]],[[16,16]],[[17,17]],[[18,18]],[[19,19]],[[20,20]],[[21,21]],[[22,22]],[[23,23]],[[24,24]],[[25,25]],[[26,26]],[[27,27]],[[28,28]],[[29,29]],[[30,30]],[[31,31]],[[32,32]],[[33,33]],[[34,34]],[[35,35]],[[36,36]],[[37,37]],[[38,38]],[[39,39]],[[40,40]],[[41,41]],[[42,42]],[[43,43]],[[44,44]],[[45,45]],[[46,46]],[[47,47]],[[48,48]],[[49,49]],[[50,50]],[[51,51]],[[52,52]],[[53,53]],[[54,54]],[[55,55]],[[56,56]],[[57,57]],[[58,58]],[[59,59]],[[60,60]],[[61,61]],[[62,62]],[[63,63]],[[64,255]]]],"pc":{"0":0},"rows":[{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0,"32":0,"33":0,"34":0,"35":0,"36":1,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"44":0,"45":0,"46":0,"47":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"56":0,"57":0,"58":0,"59":0,"60":0,"61":0,"62":0,"63":0,"64":0}],"own":[{"4":{"*":{"0":"n"}}}],"modes":[[null,"n","n","n","n","n","n"],[null,"f123","n","n","n","n","n"]]},"heads":["TNo. Tool    Nom. Dia     Mat.    Depth   No.  |      Angle"]}]});
// G-code (EIA/ISO) programs: reading them the way the control does, for the plot, stepping and cycle time.
// A Fanuc-style interpreter with the codes Mazak uses: modal G groups, absolute/incremental, arcs (I J K or R)
// in any plane, canned drilling cycles, dwell, subprograms (M98/M99) and macro calls (G65) with custom macro
// variables, IF/GOTO/WHILE and the usual functions; on lathes X in diameter, U/W incremental, feed per minute
// or per revolution (G98/G99) and the roughing and finishing cycles G71/G72/G70.
// Every move keeps the program and line it came from, and every block run is kept in order (the trace) so a
// plot can step through the program block by block.
// What only the machine knows (reference and machine positions for G28/G30/G53, probe results, system
// variables) is not drawn: those moves are skipped and noted. Numbers are read as written (a number without
// a decimal point is a whole unit, as with calculator-type input).
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- lines and words
  // A program's lines with the O numbers and N sequence numbers they hold (for M98/M99, GOTO and G65).
  function parseProgram(name, text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const labels = new Map(), subs = new Map();
    lines.forEach((l, i) => {
      const code = stripComments(l);
      const n = /^\s*\/?\s*N\s*(\d+)/i.exec(code);
      if (n && !labels.has(+n[1])) labels.set(+n[1], i);
      const o = /^\s*O\s*(\d+)/i.exec(code);
      if (o && !subs.has(+o[1])) subs.set(+o[1], i);
    });
    return { name, lines, labels, subs };
  }
  function stripComments(l) {
    let out = '', depth = 0;
    for (const ch of l) {
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth) depth--; }
      else if (!depth) { if (ch === ';') break; out += ch; }
    }
    return out;
  }
  const commentOf = l => { const m = /\(([^)]*)\)/.exec(l); return m ? m[1].trim() : ''; };

  // ---------------------------------------------------------------- expressions
  const DEG = Math.PI / 180;
  const FUNCS = {
    SIN: x => Math.sin(x * DEG), COS: x => Math.cos(x * DEG), TAN: x => Math.tan(x * DEG),
    ASIN: x => Math.asin(x) / DEG, ACOS: x => Math.acos(x) / DEG, ATAN: x => Math.atan(x) / DEG,
    SQRT: Math.sqrt, SQR: Math.sqrt, ABS: Math.abs, ROUND: x => Math.sign(x) * Math.round(Math.abs(x)), RND: x => Math.sign(x) * Math.round(Math.abs(x)),
    FIX: x => Math.trunc(x), FUP: x => (x < 0 ? Math.floor(x) : Math.ceil(x)), LN: Math.log, EXP: Math.exp,
    BIN: x => x, BCD: x => x, ADP: x => x,
  };
  class Expr {
    constructor(s, vars) { this.s = s.toUpperCase(); this.i = 0; this.vars = vars; }
    ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
    peek(re) { this.ws(); re.lastIndex = this.i; const m = re.exec(this.s); return m && m.index === this.i ? m : null; }
    take(re) { const m = this.peek(re); if (m) this.i += m[0].length; return m; }
    logic() {
      let v = this.cmp();
      for (let m; (m = this.take(/OR|XOR|AND/y));) {
        const r = this.cmp();
        v = m[0] === 'AND' ? (v && r ? 1 : 0) : m[0] === 'OR' ? (v || r ? 1 : 0) : ((!!v) !== (!!r) ? 1 : 0);
      }
      return v;
    }
    cmp() {
      const v = this.add(), m = this.take(/EQ|NE|GT|GE|LT|LE/y);
      if (!m) return v;
      const r = this.add(), a = v === null ? 0 : v, b = r === null ? 0 : r;
      // a vacant variable (#0) equals only another vacant one for EQ/NE
      if (m[0] === 'EQ') return (v === null || r === null) ? (v === r ? 1 : 0) : (a === b ? 1 : 0);
      if (m[0] === 'NE') return (v === null || r === null) ? (v !== r ? 1 : 0) : (a !== b ? 1 : 0);
      return { GT: a > b, GE: a >= b, LT: a < b, LE: a <= b }[m[0]] ? 1 : 0;
    }
    add() {
      let v = this.mul();
      for (let m; (m = this.take(/[+-]/y));) { const r = this.mul(); v = (v || 0) + (m[0] === '+' ? 1 : -1) * (r || 0); }
      return v;
    }
    mul() {
      let v = this.unary();
      for (let m; (m = this.take(/\*|\/|MOD/y));) {
        const r = this.unary() || 0;
        v = m[0] === '*' ? (v || 0) * r : m[0] === '/' ? (r ? (v || 0) / r : 0) : (r ? (v || 0) % r : 0);
      }
      return v;
    }
    unary() {
      if (this.take(/-/y)) { const v = this.unary(); return v === null ? null : -v; }
      if (this.take(/\+/y)) return this.unary();
      return this.atom();
    }
    atom() {
      if (this.take(/\[/y)) { const v = this.logic(); this.take(/\]/y); return v; }
      if (this.take(/#/y)) {
        const n = this.peek(/\[/y) ? this.atom() : this.number();
        return this.vars.get(Math.round(n || 0));
      }
      const f = this.take(/[A-Z]{2,5}(?=\s*\[)/y);
      if (f) {
        const name = f[0], fn = FUNCS[name];
        this.take(/\[/y);
        const a = this.logic();
        let b = null;
        if (this.take(/,/y)) b = this.logic();
        this.take(/\]/y);
        if (name === 'ATAN' && b !== null) return Math.atan2(a || 0, b || 0) / DEG;
        if (name === 'POW' || name === 'POWER') return Math.pow(a || 0, b || 0);
        return fn ? fn(a || 0) : 0;
      }
      return this.number();
    }
    number() {
      const m = this.take(/[0-9]*\.?[0-9]*/y);
      if (!m || m[0] === '' || m[0] === '.') throw new Error('number expected at "' + this.s.slice(this.i, this.i + 12) + '"');
      return parseFloat(m[0]);
    }
  }
  const evaluate = (s, vars) => new Expr(s, vars).logic();

  // one word's value: a number, #n, -#n, #[..] or [..]
  function wordValue(e) {
    if (e.peek(/\[/y)) return e.atom();
    if (e.peek(/-?#/y)) { const neg = !!e.take(/-/y); const v = e.atom(); return v === null ? null : neg ? -v : v; }
    if (e.peek(/-\s*\[/y)) { e.take(/-/y); const v = e.atom(); return v === null ? null : -v; }
    const m = e.take(/[+-]?\s*[0-9]*\.?[0-9]*/y);
    if (!m || /^[+-]?\s*\.?$/.test(m[0])) throw new Error('value expected');
    return parseFloat(m[0].replace(/\s+/g, ''));
  }

  // A block as the control sees it: a macro statement (#n=, IF, WHILE, GOTO, DO, END) or words.
  function parseBlock(code, vars) {
    const out = { words: [], assign: [], goto: null, ifCond: null, whileCond: null, doLabel: null, endLabel: null, del: false };
    let s = code.toUpperCase().trim();
    if (s.startsWith('/')) { out.del = true; s = s.slice(1).trim(); }
    s = s.replace(/^N\s*\d+\s*/, '');
    if (/^%/.test(s)) return out;
    const e = new Expr(s, vars);
    if (e.take(/IF(?=\s*\[)/y)) {
      e.ws();
      const start = e.i;
      e.atom();
      out.ifCond = s.slice(start, e.i);
      if (e.take(/GOTO/y)) { out.goto = s.slice(e.i).trim(); return out; }
      if (e.take(/THEN/y)) { out.then = s.slice(e.i).trim(); return out; }
      return out;
    }
    if (e.take(/WHILE(?=\s*\[)/y)) {
      e.ws();
      const start = e.i;
      e.atom();
      out.whileCond = s.slice(start, e.i);
      if (e.take(/DO/y)) out.doLabel = Math.round(wordValue(e));
      return out;
    }
    if (e.take(/GOTO/y)) { out.goto = s.slice(e.i).trim(); return out; }
    if (e.take(/DO(?=\s*\d)/y)) { out.doLabel = Math.round(wordValue(e)); out.whileCond = '1'; return out; }
    if (e.take(/END(?=\s*\d)/y)) { out.endLabel = Math.round(wordValue(e)); return out; }
    const asg = /^#\s*(\d+|\[[^=]*\])\s*=\s*(.+)$/.exec(s);
    if (asg) { out.assign.push([asg[1], asg[2]]); return out; }
    while (e.i < s.length) {
      e.ws();
      if (e.i >= s.length) break;
      const L = e.take(/[A-Z]/y);
      if (!L) { e.i++; continue; }
      let v;
      try { v = wordValue(e); } catch (err) { v = null; }
      out.words.push([L[0], v]);
      e.take(/,/y);
    }
    return out;
  }

  // ---------------------------------------------------------------- the interpreter
  // G65 argument letters -> local variables (argument specification I)
  const ARGS = { A: 1, B: 2, C: 3, I: 4, J: 5, K: 6, D: 7, E: 8, F: 9, H: 11, M: 13, Q: 17, R: 18, S: 19, T: 20, U: 21, V: 22, W: 23, X: 24, Y: 25, Z: 26 };
  const PLANES = { 17: ['X', 'Y', 'Z', 'I', 'J'], 18: ['Z', 'X', 'Y', 'K', 'I'], 19: ['Y', 'Z', 'X', 'J', 'K'] };
  // fixed cycles (machining-center list): drilling, tapping (G84.2/84.3 synchronous), boring (G75–G79, G85–G89), back
  // spot facing (G77) and back boring (G87), chamfering cutter (G71.1 CW, G72.1 CCW)
  const CYCLES = new Set([71.1, 72.1, 73, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 84.2, 84.3, 85, 86, 87, 88, 89]);
  // codes that set modes the plot does not need (work offsets, compensation, smoothing, Mazak mode switches)
  const QUIET = new Set([5, 5.1, 5.2, 7.1, 8, 9, 10, 11, 13.1, 15, 16, 22, 23, 40, 43, 43.4, 43.5, 44, 49, 50, 50.1, 51.1, 52.5, 53.5,
    54, 55, 56, 57, 58, 59, 54.1, 61, 61.1, 62, 63, 64, 69, 109, 110, 111, 122, 123, 299]);

  // opts: resolve(name) -> program text (subprograms and macros by number or name); lathe (X is a diameter,
  // U/W incremental, G98/G99 feed per minute/revolution, the ZX plane); millturn (X a diameter until G10.9 X0);
  // maxBlocks. Returns {moves, trace, events, notes, units, blocks, programs}.
  // A move: {prog (index into programs), line, kind 'rapid'|'feed'|'dwell', pts [[x, y, z]...] (X a radius
  // when programmed in diameter), feed, feedMode 'min'|'rev', spindle, css, tool, dwell (s)}.
  // trace: {prog, line, at} per block run (at = the first move of the block).
  function run(name, text, opts) {
    opts = opts || {};
    const maxBlocks = opts.maxBlocks || 200000, lathe = !!opts.lathe, turnish = lathe || !!opts.millturn;
    const progs = new Map(), progNames = [], notes = [], noteSet = new Set();
    const note = s => { if (!noteSet.has(s)) { noteSet.add(s); notes.push(s); } };
    const load = (key, t) => { const p = parseProgram(key, t); p.index = progNames.length; progNames.push(key); progs.set(key, p); return p; };
    const main = load(name, text);
    const common = new Map();
    const st = { X: 0, Y: 0, Z: 0, abs: true, plane: lathe ? 18 : 17, motion: 0, feed: 0, feedMode: lathe ? 'rev' : 'min', spindle: 0, css: false,
      tool: 0, nextTool: 0, cycle: 0, tcyc: 0, tcStart: null, xcyc: 0, xInit: 0, c73: [0, 0, 1], c74: 0, c76: [1, 0, 60, 0], retInit: true, R: null, Q: null, P: 0, initZ: null, cycZ: null, units: null, diam: turnish, roughD: 0, roughE: 0 };
    let vars, prog = main, pc = 0, blocks = 0;
    const makeVars = locals => ({
      get(n) {
        if (n === 0) return null;
        if (n >= 1 && n <= 33) return locals.has(n) ? locals.get(n) : null;
        if (common.has(n)) return common.get(n);
        if (n >= 5001 && n <= 5003) return [st.X * (st.diam ? 2 : 1), st.Y, st.Z][n - 5001];     // block end position
        if (n === 4001 || n === 4101) return st.motion;
        return null;
      },
      set(n, v) {
        if (n >= 1 && n <= 33) locals.set(n, v);
        else if (n === 3000) note('The program raises an alarm (#3000) at line ' + (pc + 1) + ' of ' + prog.name + '; the machine would stop there');
        else common.set(n, v);
      },
    });
    vars = makeVars(new Map());
    const moves = [], trace = [], events = [];
    const stack = [], loops = [];
    const find = key => {
      if (progs.has(key)) return progs.get(key);
      const t = opts.resolve ? opts.resolve(key) : null;
      return t == null ? null : load(key, t);
    };
    const callTarget = num => {
      for (const p of [prog, main]) if (p.subs.has(num)) return { p, line: p.subs.get(num) + 1 };
      for (const key of [String(num), 'O' + num, String(num).padStart(4, '0'), 'O' + String(num).padStart(4, '0')]) {
        const p = find(key);
        if (p) return { p, line: p.subs.size ? p.subs.values().next().value + 1 : 0 };
      }
      return null;
    };
    const goLabel = n => {
      const i = prog.labels.get(n);
      if (i === undefined) { note('GOTO ' + n + ' in ' + prog.name + ': no such sequence number'); return false; }
      pc = i;
      return true;
    };
    let capture = null;                               // G70/G71/G72: the finished shape is read, not drawn
    // G68 coordinate rotation: the program's points turned about an axis through a centre (drawn where they are)
    let rot = null;
    const turned = q => {
      if (!rot) return q;
      const [m, c] = rot, x = q[0] - c[0], y = q[1] - c[1], z = q[2] - c[2];
      return [c[0] + m[0] * x + m[1] * y + m[2] * z, c[1] + m[3] * x + m[4] * y + m[5] * z, c[2] + m[6] * x + m[7] * y + m[8] * z];
    };
    const rotation = (axis, deg) => {
      const l = Math.hypot(axis[0], axis[1], axis[2]) || 1, [x, y, z] = axis.map(v => v / l), a = deg * DEG, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
      return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    };
    const pushMove = (kind, pts, extra) => {
      (capture || moves).push(Object.assign({ prog: prog.index, line: pc, kind, pts: rot && !capture ? pts.map(turned) : pts, feed: st.feed, feedMode: st.feedMode, spindle: st.spindle, css: st.css, tool: st.tool }, extra || {}));
    };
    const lineTo = (kind, x, y, z) => {
      if (x === st.X && y === st.Y && z === st.Z) return;
      pushMove(kind, [[st.X, st.Y, st.Z], [x, y, z]]);
      st.X = x; st.Y = y; st.Z = z;
    };
    const arcTo = (cw, x, y, z, ctr) => {
      const [a1, a2, a3] = PLANES[st.plane];
      const P = { X: st.X, Y: st.Y, Z: st.Z }, E = { X: x, Y: y, Z: z };
      const cu = ctr[0], cv = ctr[1], r = Math.hypot(P[a1] - cu, P[a2] - cv), r1 = Math.hypot(E[a1] - cu, E[a2] - cv);
      const t0 = Math.atan2(P[a2] - cv, P[a1] - cu), t1 = Math.atan2(E[a2] - cv, E[a1] - cu);
      let sw = cw ? t0 - t1 : t1 - t0;
      while (sw <= 1e-9) sw += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(sw / (Math.PI / 36))), pts = [];
      for (let k = 0; k <= n; k++) {
        const t = t0 + (cw ? -1 : 1) * sw * k / n, rr = r + (r1 - r) * k / n, q = {};
        q[a1] = cu + rr * Math.cos(t); q[a2] = cv + rr * Math.sin(t); q[a3] = P[a3] + (E[a3] - P[a3]) * k / n;
        pts.push([q.X, q.Y, q.Z]);
      }
      pts[pts.length - 1] = [x, y, z];
      pushMove('feed', pts, { arc: true, cw, center: [cu, cv], plane: st.plane });
      st.X = x; st.Y = y; st.Z = z;
    };
    const dwell = t => { (capture || moves).push({ prog: prog.index, line: pc, kind: 'dwell', pts: [turned([st.X, st.Y, st.Z])], dwell: t, tool: st.tool }); };
    // canned drilling cycle at (x, y): rapid over the hole, rapid to R, feed (with pecks) to Z, back up
    const cycle = (x, y) => {
      const zTop = st.initZ !== null ? st.initZ : st.Z, r = st.R !== null ? st.R : zTop, zb = st.cycZ;
      if (zb === null) { note('Drilling cycle without a Z depth'); return; }
      lineTo('rapid', x, y, st.Z);
      lineTo('rapid', x, y, r);
      const q = Math.abs(st.Q || 0);
      if ((st.cycle === 73 || st.cycle === 83) && q > 0) {
        let z = r;
        while (z - q > zb + 1e-9) {
          z -= q;
          lineTo('feed', x, y, z);
          if (st.cycle === 83) { lineTo('rapid', x, y, r); lineTo('rapid', x, y, z + Math.min(q, 0.04)); }
          else lineTo('rapid', x, y, z + Math.min(q * 0.1, 0.02));
        }
      }
      const c = st.cycle;
      if (c === 87 || c === 77) {                         // back boring / back spot facing: from below, cut upward
        lineTo('rapid', x, y, r);
        lineTo('feed', x, y, zb);
        if (st.P) dwell(st.P / 1000);
        lineTo('rapid', x, y, r);
        lineTo('rapid', x, y, zTop);
        return;
      }
      lineTo('feed', x, y, zb);
      if (c === 71.1 || c === 72.1) {                    // chamfering cutter: one circle of radius Q at the bottom
        const rad = Math.abs(st.Q || 0);
        if (rad > 0) {
          const pts = [];
          for (let k = 0; k <= 36; k++) { const a = (c === 71.1 ? -1 : 1) * 2 * Math.PI * k / 36; pts.push([x + rad * Math.cos(a), y + rad * Math.sin(a), zb]); }
          lineTo('feed', x + rad, y, zb);
          pushMove('feed', pts); st.X = pts[36][0]; st.Y = pts[36][1];
          lineTo('feed', x, y, zb);
        }
      }
      if (st.P) dwell(st.P / 1000);
      if (c === 76 && st.Q) lineTo('rapid', x + Math.abs(st.Q), y, zb);   // fine boring: shift off the wall first
      const feedOut = c === 84 || c === 84.2 || c === 84.3 || c === 74 || c === 85 || c === 89 || c === 75;
      lineTo(feedOut ? 'feed' : 'rapid', st.X, y, r);
      if (st.retInit && zTop > r) lineTo('rapid', st.X, y, zTop);
      if (st.X !== x) lineTo('rapid', x, y, st.retInit && zTop > r ? zTop : r);
    };
    // run the blocks from line a to line b of this program without drawing them: the shape of a cycle
    const shapeOf = (a, b) => {
      const save = { X: st.X, Y: st.Y, Z: st.Z, pc, motion: st.motion, feed: st.feed, abs: st.abs };
      capture = [];
      pc = a;
      for (let guard = 0; guard < 5000 && pc <= b && pc < prog.lines.length; guard++) step(true);
      const got = capture;
      capture = null;
      Object.assign(st, { X: save.X, Y: save.Y, Z: save.Z, motion: save.motion, feed: save.feed, abs: save.abs });
      pc = save.pc;
      return got;
    };
    // G71 (turning) / G72 (facing) rough cutting: passes of depth d parallel to Z (G72: to X) up to the finished
    // shape moved by the finishing allowances, then one pass along that shape, back to the start point.
    const roughCycle = (face, d, e, shape, du, dw) => {
      // (a, b): a = the axis the passes step along (X for G71), b = the axis they cut along
      const S = face ? [st.Z, st.X] : [st.X, st.Z];
      const pts = [];
      for (const m of shape) for (const q of m.pts.slice(1)) pts.push(face ? [q[2] + dw, q[0] + du] : [q[0] + du, q[2] + dw]);
      if (pts.length < 2 || !(d > 0)) { note('G7' + (face ? 2 : 1) + ': no finished shape between P and Q'); return; }
      const a0 = pts[0][0], s = a0 > S[0] ? 1 : -1, y = st.Y;
      const go = (kind, a, b) => (face ? lineTo(kind, b, y, a) : lineTo(kind, a, y, b));
      for (let a = S[0] + s * d; s * (a0 - a) > 1e-9; a += s * d) {
        // the pass ends where the shape comes back to this level
        let bEnd = pts[pts.length - 1][1];
        for (let k = 1; k < pts.length; k++) {
          const p = pts[k - 1], q = pts[k];
          if (s * (q[0] - a) <= 0 && s * (p[0] - a) > 0) { bEnd = p[1] + (q[1] - p[1]) * (p[0] - a) / (p[0] - q[0]); break; }
        }
        const bs = S[1], dirB = Math.sign(bEnd - bs) || -1;
        go('rapid', a, bs);
        go('feed', a, bEnd);
        go('rapid', a - s * e, bEnd - dirB * e);
        go('rapid', a - s * e, bs);
      }
      go('rapid', a0, S[1]);
      for (const q of pts) go('feed', q[0], q[1]);
      go('rapid', S[0], S[1]);
    };

    // one block; dry: a shape being read (no calls, no cycles). false at the end of the program.
    function step(dry) {
      if (pc >= prog.lines.length) {
        if (!stack.length || dry) return false;
        const f = stack.pop();
        prog = f.prog; pc = f.pc; vars = f.vars;
        return true;
      }
      const code = stripComments(prog.lines[pc]).trim();
      if (!code || /^%/.test(code) || /^O\s*\d/i.test(code)) { pc++; return true; }
      blocks++;
      if (!dry) trace.push({ prog: prog.index, line: pc, at: moves.length });
      let b;
      try { b = parseBlock(code, vars); } catch (err) { note('Line ' + (pc + 1) + ' of ' + prog.name + ': ' + err.message); pc++; return true; }
      const fail = err => note('Line ' + (pc + 1) + ' of ' + prog.name + ': ' + err.message);
      const assign = (lhs, rhs) => vars.set(Math.round(/^\d+$/.test(lhs) ? +lhs : evaluate(lhs, vars)), evaluate(rhs, vars));
      if (b.assign.length) {
        for (const [lhs, rhs] of b.assign) { try { assign(lhs, rhs); } catch (err) { fail(err); } }
        pc++; return true;
      }
      if (b.ifCond !== null) {
        let ok = 0;
        try { ok = evaluate(b.ifCond, vars); } catch (err) { fail(err); }
        if (ok && b.goto !== null) { let n = 0; try { n = Math.round(evaluate(b.goto, vars)); } catch (err) { fail(err); } if (goLabel(n)) return true; }
        if (ok && b.then) { const m = /^#\s*(\d+|\[[^=]*\])\s*=\s*(.+)$/.exec(b.then); if (m) { try { assign(m[1], m[2]); } catch (err) { fail(err); } } }
        pc++; return true;
      }
      if (b.whileCond !== null) {
        let ok = 0;
        try { ok = evaluate(b.whileCond, vars); } catch (err) { fail(err); }
        if (ok) { loops.push({ label: b.doLabel, start: pc, prog }); pc++; return true; }
        let depth = 0, i = pc + 1;
        for (; i < prog.lines.length; i++) {
          const c = stripComments(prog.lines[i]).toUpperCase();
          if (/WHILE\s*\[.*\]\s*DO\s*\d/.test(c) || /^\s*(N\d+\s*)?DO\s*\d/.test(c)) depth++;
          else if (new RegExp('END\\s*' + b.doLabel + '(?!\\d)').test(c)) { if (!depth) break; depth--; }
        }
        pc = i + 1; return true;
      }
      if (b.endLabel !== null) {
        const lp = loops.length ? loops.pop() : null;
        if (lp && lp.prog === prog) { pc = lp.start; return true; }
        pc++; return true;
      }
      if (b.goto !== null) { let n = 0; try { n = Math.round(evaluate(b.goto, vars)); } catch (err) { fail(err); } if (!goLabel(n)) pc++; return true; }

      const W = {}, Gs = [], Ms = [];
      for (const [L, v] of b.words) {
        if (L === 'G') { if (v !== null) Gs.push(Math.round(v * 10) / 10); }
        else if (L === 'M') { if (v !== null) Ms.push(Math.round(v)); }
        else if (!(L in W)) W[L] = v;
      }
      const has = L => L in W && W[L] !== null;
      let motionNow = null, special = null;
      // turning cycles: a lathe's G70-G76 / G83-G89 / G90 G92 G94, an mill-turn machine's G270-G276 / G283-G289 / G290 G292 G294
      // (its G71-G89 are the milling cycles)
      const turnCycle = g => {
        const t = lathe ? g : opts.millturn && g >= 270 && g <= 294.9 ? Math.round((g - 200) * 10) / 10 : 0;
        return [70, 71, 72, 73, 74, 75, 76, 83, 84, 84.2, 85, 87, 88, 88.2, 89, 90, 92, 94].includes(t) ? t : 0;
      };
      for (const g of Gs) {
        const tc = turnCycle(g);
        if (tc === 70 || tc === 71 || tc === 72) { special = tc; continue; }
        if (tc >= 73 && tc <= 76) { special = 'c' + tc; continue; }
        if (tc === 90 || tc === 92 || tc === 94) { st.tcyc = tc; st.tcStart = null; st.cycle = 0; motionNow = -2; continue; }
        if (tc >= 87 && tc <= 89) { st.cycle = 0; st.xcyc = tc; st.xInit = st.X; motionNow = -3; continue; }
        if (tc >= 83 && tc <= 85) { st.cycle = tc === 85 ? 85 : tc === 84.2 ? 84.2 : tc; st.initZ = st.Z; motionNow = -1; continue; }
        if (lathe && g === 50) { special = 'g50'; continue; }
        if (g === 0 || g === 1 || g === 2 || g === 3 || g === 32 || g === 33) { st.motion = g >= 32 ? 1 : g; motionNow = st.motion; st.cycle = 0; st.tcyc = 0; st.xcyc = 0; }
        else if (g === 17 || g === 18 || g === 19) st.plane = g;
        else if (g === 90) st.abs = true;
        else if (g === 91) st.abs = false;
        else if (g === 20) st.units = 'inch';
        else if (g === 21) st.units = 'metric';
        else if (g === 94 && !lathe) st.feedMode = 'min';
        else if (g === 95 && !lathe) st.feedMode = 'rev';
        else if (g === 98) { if (lathe) st.feedMode = 'min'; else st.retInit = true; }
        else if (g === 99) { if (lathe) st.feedMode = 'rev'; else st.retInit = false; }
        else if (g === 96) st.css = true;
        else if (g === 97) st.css = false;
        else if (g === 80) { st.cycle = 0; st.initZ = null; st.tcyc = 0; st.xcyc = 0; }
        else if (g === 10.9) { if (has('X')) st.diam = W.X !== 0; special = 'modeset'; }
        else if (CYCLES.has(g)) { st.cycle = g; st.initZ = st.Z; motionNow = -1; }
        else if (g === 4 || g === 28 || g === 30 || g === 53 || g === 27 || g === 29 || g === 31 || g === 92 || g === 65 || g === 66 || g === 67) special = g;
        else if (g === 41 || g === 42) note('Cutter compensation (G41/G42) is drawn on the programmed path');
        else if (g === 68) special = 68;
        else if (g === 69) { if (rot) { const a = turned([st.X, st.Y, st.Z]); rot = null; st.X = a[0]; st.Y = a[1]; st.Z = a[2]; } }
        else if (g === 68.2) note('Tilted work plane (G68.2) is not applied');
        else if (g === 51) note('Scaling (G51) is not applied');
        else if (g === 12.1) note('Polar coordinate interpolation (G12.1) is not drawn');
        else if (g === 52) special = 'skip';
        else if (!QUIET.has(g)) note('G' + g + ' is not simulated');
      }
      if (special === 'modeset') { pc++; return true; }
      if (special === 68) {                             // G68 X Y (Z) R in the plane, or about the axis I J K
        const v = L => (has(L) ? (L === 'X' && st.diam ? W.X / 2 : W[L]) : 0);
        const axis = has('I') || has('J') || has('K') ? [v('I'), v('J'), v('K')] : st.plane === 17 ? [0, 0, 1] : st.plane === 18 ? [0, 1, 0] : [1, 0, 0];
        // the tool stays where it is: its position is taken into the turned coordinates
        const a = turned([st.X, st.Y, st.Z]), m = rotation(axis, has('R') ? W.R : 0), c = [v('X'), v('Y'), v('Z')];
        rot = [m, c];
        const x = a[0] - c[0], y = a[1] - c[1], z = a[2] - c[2];
        st.X = c[0] + m[0] * x + m[3] * y + m[6] * z; st.Y = c[1] + m[1] * x + m[4] * y + m[7] * z; st.Z = c[2] + m[2] * x + m[5] * y + m[8] * z;
        pc++; return true;
      }
      if (has('F') && special !== 65) st.feed = W.F;
      if (has('S') && special !== 65) st.spindle = W.S;
      if (has('T') && special !== 65) st.nextTool = W.T;
      // macro and subprogram calls
      if (special === 65 && !dry) {
        const num = Math.round(W.P || 0), tgt = callTarget(num);
        if (!tgt) { note('G65 P' + num + ': the macro program is not open'); pc++; return true; }
        const locals = new Map();
        for (const [L, v] of b.words) if (ARGS[L] && v !== null) locals.set(ARGS[L], v);
        const times = Math.max(1, Math.round(W.L || 1));
        stack.push({ prog, pc: pc + 1, vars });
        for (let k = 1; k < times; k++) stack.push({ prog: tgt.p, pc: tgt.line, vars: makeVars(new Map(locals)) });
        prog = tgt.p; pc = tgt.line; vars = makeVars(locals);
        return true;
      }
      if (Ms.includes(98) && !dry) {
        let num = Math.round(W.P || 0), times = Math.max(1, Math.round(W.L || W.K || 1));
        if (!has('L') && !has('K') && num > 9999) { times = Math.floor(num / 10000); num %= 10000; }     // P(times)(number)
        const tgt = callTarget(num);
        if (!tgt) { note('M98 P' + num + ': the subprogram is not open'); pc++; return true; }
        stack.push({ prog, pc: pc + 1, vars });
        for (let k = 1; k < times; k++) stack.push({ prog: tgt.p, pc: tgt.line, vars });
        prog = tgt.p; pc = tgt.line;
        return true;
      }
      if (Ms.includes(99) && !dry) {
        if (!stack.length) { if (has('P') && goLabel(Math.round(W.P))) return true; pc = prog.lines.length; return true; }
        const f = stack.pop();
        prog = f.prog; pc = f.pc; vars = f.vars;
        if (has('P')) goLabel(Math.round(W.P));
        return true;
      }
      if (!dry) {
        if (Ms.includes(6) || (lathe && has('T'))) {
          st.tool = st.nextTool;
          events.push({ prog: prog.index, line: pc, kind: 'tool', tool: st.tool, at: moves.length });
        }
        if ((Ms.includes(30) || Ms.includes(2)) && !stack.length) { pc = prog.lines.length; return true; }
      }

      // target position (X kept as a radius when programmed in diameter)
      const xs = v => (st.diam ? v / 2 : v);
      const axis = (L, cur) => (has(L) ? (st.abs ? (L === 'X' ? xs(W[L]) : W[L]) : cur + (L === 'X' ? xs(W[L]) : W[L])) : cur);
      let x = axis('X', st.X), y = axis('Y', st.Y), z = axis('Z', st.Z);
      if (turnish && special !== 4) {
        if (has('U')) x = st.X + xs(W.U);
        if (has('W') && !(special === 28 || special === 30)) z = st.Z + W.W;
        if (has('V')) y = st.Y + W.V;
      }
      const moving = has('X') || has('Y') || has('Z') || (turnish && (has('U') || has('W') || has('V')));
      if (special === 'skip') { pc++; return true; }
      if (special === 4) { dwell(has('X') ? W.X : has('U') ? W.U : has('P') ? W.P / 1000 : 0); pc++; return true; }
      if (special === 'g50') {                          // lathe G50: X Z set the position; S alone is the top speed
        if (moving) { st.X = x; st.Y = y; st.Z = z; note('G50 sets the position; the moves after it are drawn from there'); }
        pc++; return true;
      }
      if (special === 92) { st.X = x; st.Y = y; st.Z = z; note('G92 sets the position; the moves after it are drawn from there'); pc++; return true; }
      if (special === 28 || special === 30) {
        if (moving) lineTo('rapid', x, y, z);
        note('G28/G30 go on to the machine\'s reference position; the plot stops at the intermediate point');
        pc++; return true;
      }
      if (special === 53 || special === 27 || special === 29) { if (special === 53 && moving) note('G53 moves in machine coordinates are not drawn'); pc++; return true; }
      if (special === 31) { if (moving) lineTo('feed', x, y, z); note('G31 (skip) is drawn to its end point'); pc++; return true; }
      if (special === 70 || special === 71 || special === 72) {
        if (dry) { pc++; return true; }
        if (special === 70 || has('P')) {
          const a = has('P') ? prog.labels.get(Math.round(W.P)) : undefined, q = has('Q') ? prog.labels.get(Math.round(W.Q)) : undefined;
          if (a === undefined || q === undefined) { note('G' + special + ': P or Q sequence number not found'); pc++; return true; }
          const shape = shapeOf(a, q).filter(m => m.kind !== 'dwell');
          if (special === 70) {
            const S = [st.X, st.Y, st.Z];
            for (const m of shape) { pushMove(m.kind, m.pts, m.arc ? { arc: true } : null); const e = m.pts[m.pts.length - 1]; st.X = e[0]; st.Y = e[1]; st.Z = e[2]; }
            lineTo('rapid', S[0], S[1], S[2]);
          } else {
            roughCycle(special === 72, st.roughD, st.roughE, shape, has('U') ? xs(W.U) : 0, has('W') ? W.W : 0);
            pc = Math.max(pc, q);                     // the finished shape's blocks are not run again
          }
        } else {                                      // the first line: depth of cut and retract
          if (special === 71 && has('U')) st.roughD = Math.abs(W.U);
          if (special === 72 && has('W')) st.roughD = Math.abs(W.W);
          if (has('R')) st.roughE = Math.abs(W.R);
        }
        pc++; return true;
      }
      // G73 pattern repeating: the finished shape (P..Q) run d times, moved in from (i, k) to the finishing allowance
      if (special === 'c73') {
        if (!dry) {
          if (!has('P')) { st.c73 = [has('U') ? Math.abs(W.U) : st.c73[0], has('W') ? Math.abs(W.W) : st.c73[1], has('R') ? Math.max(1, Math.round(W.R)) : st.c73[2]]; }
          else {
            const a = prog.labels.get(Math.round(W.P)), q = has('Q') ? prog.labels.get(Math.round(W.Q)) : undefined;
            if (a === undefined || q === undefined) note('G73: P or Q sequence number not found');
            else {
              const shape = shapeOf(a, q).filter(m => m.kind !== 'dwell'), S = [st.X, st.Y, st.Z], [ci, ck, n] = st.c73;
              const u = has('U') ? xs(W.U) : 0, w = has('W') ? W.W : 0;
              for (let j = n - 1; j >= 0; j--) {
                const f = n > 1 ? j / (n - 1) : 0, dx = u / 2 + ci * f * Math.sign(u || 1), dz = w + ck * f * Math.sign(w || 1);
                let first = true;
                for (const m of shape) for (const q2 of m.pts.slice(1)) { lineTo(first ? 'rapid' : 'feed', q2[0] + dx, q2[1], q2[2] + dz); first = false; }
                lineTo('rapid', S[0], S[1], S[2]);
              }
              pc = Math.max(pc, q);
            }
          }
        }
        pc++; return true;
      }
      // G74 (pecks along Z, steps in X) / G75 (pecks along X, steps in Z): grooving and cut-off, back e between pecks
      if (special === 'c74' || special === 'c75') {
        if (!dry) {
          if (!moving) { if (has('R')) st.c74 = Math.abs(W.R); }
          else {
            const z74 = special === 'c74', S = [st.X, st.Y, st.Z], e = st.c74 || 0.02;
            const peck = Math.abs(z74 ? (has('Q') ? W.Q : 0) : (has('P') ? xs(W.P) * 2 / 2 : 0)) || Infinity;
            const step = Math.abs(z74 ? (has('P') ? xs(W.P) : 0) : (has('Q') ? W.Q : 0));
            const [a0, a1] = z74 ? [S[2], z] : [S[0], x], [b0, b1] = z74 ? [S[0], x] : [S[2], z];
            const sa = Math.sign(a1 - a0) || -1, sb = Math.sign(b1 - b0);
            const go = (kind, a, b) => (z74 ? lineTo(kind, b, S[1], a) : lineTo(kind, a, S[1], b));
            for (let b = b0, guard = 0; guard < 500; guard++) {
              go('rapid', a0, b);
              for (let a = a0; sa * (a1 - a) > 1e-9;) { const nx = sa * (a1 - (a + sa * peck)) > 0 ? a + sa * peck : a1; go('feed', nx, b); if (nx !== a1) go('rapid', nx - sa * e, b); a = nx; }
              go('rapid', a0, b);
              if (!step || !sb || sb * (b1 - b) <= 1e-9) break;
              b = sb * (b1 - (b + sb * step)) > 0 ? b + sb * step : b1;
            }
            go('rapid', a0, b0);
          }
        }
        pc++; return true;
      }
      // G76 compound threading: passes at d·√n to the thread height k (less the finishing allowance), then m finishing passes
      if (special === 'c76') {
        if (!dry) {
          if (!moving) {
            if (has('P')) { const pv = Math.round(W.P); st.c76[0] = Math.max(1, Math.floor(pv / 10000)); }
            if (has('R')) st.c76[3] = Math.abs(W.R);
          } else {
            const S = [st.X, st.Y, st.Z], k = has('P') ? Math.abs(W.P) : 0, d1 = has('Q') ? Math.abs(W.Q) : k / 4, fin = st.c76[3], r = has('R') ? W.R : 0;
            const sx = Math.sign(S[0] - x) || 1, passes = [];
            for (let n = 1, dep = d1; dep < k - fin - 1e-9 && n < 200; n++, dep = d1 * Math.sqrt(n)) passes.push(dep);
            passes.push(k - fin); for (let m = 0; m < st.c76[0]; m++) passes.push(k);
            for (const dep of passes) {
              const xp = x + sx * (k - dep);
              lineTo('rapid', xp + r, S[1], S[2]); lineTo('feed', xp, S[1], z); lineTo('rapid', S[0], S[1], z); lineTo('rapid', S[0], S[1], S[2]);
            }
          }
        }
        pc++; return true;
      }
      // G87 (drill) / G88 (tap) / G89 (bore) from the outside: down X to the hole bottom at each Z (C) position, back out
      if (st.xcyc && (motionNow === -3 || (motionNow === null && moving))) {
        if (!dry && (has('Z') || has('W') || has('X') || has('U') || has('C'))) {
          if (has('X') || has('U')) st.xBottom = x;
          const bottom = st.xBottom !== undefined ? st.xBottom : x, top = st.xInit;
          if (has('Z') || has('W')) lineTo('rapid', top, y, z);
          lineTo('feed', bottom, y, z); lineTo('rapid', top, y, z);
        }
        pc++; return true;
      }
      // single turning cycles from the start point: G90 (along Z) and G92 (threading) cut X then Z, back; G94 cuts
      // the face: Z then X, back. R tapers (radius). Repeated by the blocks after with new X / Z.
      if (st.tcyc && (motionNow === -2 || (motionNow === null && moving))) {
        if (!dry) {
          if (motionNow === -2 || !st.tcStart) { st.tcStart = [st.X, st.Y, st.Z]; st.tcEnd = null; }
          if (moving) {
            const [sx, sy, sz] = st.tcStart, r = has('R') ? W.R : 0, e = st.tcEnd;
            // a block after the first gives only what changes: the other end coordinate stays
            if (e && !has('X') && !has('U')) x = e[0];
            if (e && !has('Z') && !has('W')) z = e[1];
            st.tcEnd = [x, z];
            if (st.tcyc === 94) { lineTo('rapid', sx, sy, z + r); lineTo('feed', x, sy, z); lineTo('feed', x, sy, sz); lineTo('rapid', sx, sy, sz); }
            else { lineTo('rapid', x + r, sy, sz); lineTo('feed', x, sy, z); lineTo(st.tcyc === 92 ? 'rapid' : 'feed', sx, sy, z); lineTo('rapid', sx, sy, sz); }
          }
        }
        pc++; return true;
      }
      if ((st.cycle && motionNow === null) || motionNow === -1) {
        if (has('R')) st.R = st.abs ? W.R : (st.initZ !== null ? st.initZ : st.Z) + W.R;
        if (has('Z')) st.cycZ = st.abs ? W.Z : (st.R !== null ? st.R : st.Z) + W.Z;
        if (has('Q')) st.Q = W.Q;
        if (has('P')) st.P = W.P;
        if (has('X') || has('Y') || motionNow === -1) {
          const times = has('K') ? Math.max(0, Math.round(W.K)) : has('L') ? Math.max(0, Math.round(W.L)) : 1;
          const dx = x - st.X, dy = y - st.Y;
          for (let k = 0; k < times; k++) cycle(k && !st.abs ? st.X + dx : x, k && !st.abs ? st.Y + dy : y);
        }
        pc++; return true;
      }
      if (moving) {
        const m = motionNow !== null && motionNow >= 0 ? motionNow : st.motion;
        if (m === 0) lineTo('rapid', x, y, z);
        else if (m === 1) lineTo('feed', x, y, z);
        else {
          const [a1, a2, , i1, i2] = PLANES[st.plane];
          const P = { X: st.X, Y: st.Y, Z: st.Z }, E = { X: x, Y: y, Z: z };
          let ctr = null;
          if (has(i1) || has(i2)) ctr = [P[a1] + (has(i1) ? W[i1] : 0), P[a2] + (has(i2) ? W[i2] : 0)];
          else if (has('R')) {
            const ax = E[a1] - P[a1], ay = E[a2] - P[a2], dd = Math.hypot(ax, ay), r = W.R;
            if (dd > 0) {
              const h = Math.sqrt(Math.max(r * r - dd * dd / 4, 0)), s = (m === 2 ? -1 : 1) * (r > 0 ? 1 : -1);
              ctr = [P[a1] + ax / 2 + s * h * -ay / dd, P[a2] + ay / 2 + s * h * ax / dd];
            }
          }
          if (ctr) arcTo(m === 2, x, y, z, ctr);
          else lineTo('feed', x, y, z);
        }
      }
      pc++;
      return true;
    }

    while (blocks < maxBlocks && step(false)) { /* next block */ }
    if (blocks >= maxBlocks) note('Stopped after ' + maxBlocks + ' blocks (a loop that waits for the machine?)');
    return { moves, trace, events, notes, units: st.units, blocks, programs: progNames };
  }

  // ---------------------------------------------------------------- times
  // Seconds per move: feed moves at their feed (per minute, or per revolution with the spindle speed; with
  // constant surface speed the speed at the move's diameter, up to maxRpm), rapids at the rapid rate, dwells as
  // written. Lengths and feeds in program units per minute; surface speed in feet (inch) or metres per minute.
  function times(moves, o) {
    o = o || {};
    const rapid = o.rapid || (o.units === 'metric' ? 25000 : 1000), maxRpm = o.maxRpm || 4000, inch = o.units !== 'metric';
    let total = 0;
    const each = new Float64Array(moves.length);
    moves.forEach((m, k) => {
      let t = 0;
      if (m.untimed) t = 0;
      else if (m.kind === 'dwell') t = m.dwell || 0;
      else {
        let len = 0;
        for (let i = 1; i < m.pts.length; i++) len += Math.hypot(m.pts[i][0] - m.pts[i - 1][0], m.pts[i][1] - m.pts[i - 1][1], m.pts[i][2] - m.pts[i - 1][2]);
        if (m.kind === 'rapid') {
          // o.accel (units/s²): a rapid speeds up and slows down, so short moves never reach full rapid
          const v = rapid / 60, acc = o.accel || 0;
          t = !acc || !len ? len / v : len > v * v / acc ? len / v + v / acc : 2 * Math.sqrt(len / acc);
        }
        else {
          let f = m.feed || 0;
          if (m.feedMode === 'rev' && m.css) {
            // constant surface speed: the rpm follows the diameter along the move (capped at the maximum), so the
            // time is summed in short pieces, each at the rpm of its middle
            const mx = m.maxRpm || maxRpm, k = (inch ? 12 : 1000) * (m.spindle || 0) / Math.PI;
            for (let i = 1; i < m.pts.length; i++) {
              const a = m.pts[i - 1], b = m.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.min(40, Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 0.05)));
              for (let j = 0; j < n; j++) {
                const x = Math.abs(a[0] + (b[0] - a[0]) * (j + 0.5) / n), rpm = Math.min(mx, k / Math.max(2 * x, 1e-3)), fr = f * rpm;
                if (fr > 0) t += l / n / fr * 60;
              }
            }
          } else {
            if (m.feedMode === 'rev') f *= m.spindle || 0;
            t = f > 0 ? len / f * 60 : 0;
          }
        }
      }
      each[k] = t;
      total += t;
    });
    return { total, each };
  }

  // A guess at the machine a program is for when nothing else says: lathes call tools as T0101 without M6,
  // mill-turn programs switch modes (G10.9, M200) or turn a B axis.
  function guessType(text) {
    const s = String(text).slice(0, 200000).replace(/\([^)\n]*\)/g, '');
    if (/\bG10\.9|\bM200\b/.test(s) && /\bM0?6\b/.test(s)) return 'millturn';
    if (/(^|[^#\w])T\d{4}\b/m.test(s) && !/\bM0?6\b/.test(s)) return 'lathe';
    return 'mill';
  }

  // ---------------------------------------------------------------- what a block says
  const G_TEXT = {
    0: 'rapid', 1: 'feed', 2: 'arc CW', 3: 'arc CCW', 4: 'dwell', 9: 'exact stop', 10: 'data setting', 10.9: 'diameter/radius mode',
    11: 'data setting off', 12.1: 'polar interpolation', 13.1: 'polar interpolation off', 17: 'XY plane', 18: 'ZX plane', 19: 'YZ plane',
    20: 'inch', 21: 'metric', 28: 'reference return', 30: '2nd reference return', 31: 'skip (probe)', 32: 'thread cutting', 40: 'cutter comp off',
    41: 'cutter comp left', 42: 'cutter comp right', 43: 'tool length comp', 43.4: 'tool tip control', 44: 'tool length comp -', 49: 'length comp off',
    52: 'local coordinates', 53: 'machine coordinates', 54: 'work offset 1', 55: 'work offset 2', 56: 'work offset 3', 57: 'work offset 4',
    58: 'work offset 5', 59: 'work offset 6', 54.1: 'extra work offset', 61: 'exact stop mode', 61.1: 'geometry compensation', 64: 'cutting mode',
    65: 'macro call', 66: 'modal macro call', 67: 'modal macro call off', 68: 'coordinate rotation', 68.2: 'tilted work plane', 69: 'rotation off',
    80: 'cycle off', 81: 'drill cycle', 82: 'drill cycle with dwell', 83: 'peck drill cycle', 84: 'tap cycle', 85: 'bore cycle (feed out)',
    86: 'bore cycle (spindle stop)', 87: 'back bore cycle', 88: 'bore cycle', 89: 'bore cycle with dwell', 90: 'absolute', 91: 'incremental',
    92: 'set position', 94: 'feed per minute', 95: 'feed per revolution', 96: 'constant surface speed', 97: 'constant rpm',
    98: 'return to initial level', 99: 'return to R level',
  };
  const G_LATHE = { 50: 'spindle speed limit / set position', 70: 'finishing cycle', 71: 'rough turning cycle', 72: 'rough facing cycle',
    73: 'pattern repeat cycle', 74: 'face peck cycle', 75: 'groove peck cycle', 76: 'threading cycle', 98: 'feed per minute', 99: 'feed per revolution' };
  const G_MILL = { 50: 'scaling off', 51: 'scaling', 73: 'high-speed peck cycle', 74: 'left-hand tap cycle', 76: 'fine bore cycle' };
  const M_TEXT = { 0: 'program stop', 1: 'optional stop', 2: 'program end', 3: 'spindle CW', 4: 'spindle CCW', 5: 'spindle stop', 6: 'tool change',
    8: 'coolant on', 9: 'coolant off', 19: 'spindle orient', 30: 'program end, rewind', 98: 'subprogram call', 99: 'subprogram end / return' };
  function describe(line, type) {
    const code = stripComments(line).trim();
    if (!code) return '';
    let b;
    try { b = parseBlock(code, { get: () => null, set() {} }); } catch (e) { return ''; }
    const n = /^\/?\s*N\s*(\d+)/i.exec(code), pre = n ? 'N' + n[1] + ' · ' : '';
    if (b.assign.length) return pre + 'sets #' + b.assign[0][0].replace(/^\[|\]$/g, '') + ' = ' + b.assign[0][1];
    if (b.ifCond !== null) return pre + 'if ' + b.ifCond + (b.goto !== null ? ' go to N' + b.goto : b.then ? ' then ' + b.then : '');
    if (b.whileCond !== null) return pre + (b.doLabel !== null ? 'loop ' + b.doLabel + ' while ' + b.whileCond : 'while ' + b.whileCond);
    if (b.endLabel !== null) return pre + 'end of loop ' + b.endLabel;
    if (b.goto !== null) return pre + 'go to N' + b.goto;
    const lathe = type === 'lathe', out = [], axes = [], fmt = v => (v === null ? '#?' : String(+v.toFixed(5)));
    for (const [L, v] of b.words) {
      if (L === 'G' && v !== null) { const g = Math.round(v * 10) / 10; out.push('G' + g + ' ' + ((lathe ? G_LATHE : G_MILL)[g] || G_TEXT[g] || '?')); }
      else if (L === 'M' && v !== null) out.push('M' + v + (M_TEXT[v] ? ' ' + M_TEXT[v] : ''));
      else if (L === 'T') out.push(lathe && v >= 100 && v === Math.round(v) ? 'tool ' + Math.floor(v / 100) + ' offset ' + v % 100 : 'tool ' + fmt(v));
      else if (L === 'S') out.push('S' + fmt(v));
      else if (L === 'F') out.push('F' + fmt(v));
      else if (L !== 'N' && L !== 'O') axes.push(L + fmt(v));
    }
    return pre + out.concat(axes.length ? [axes.join(' ')] : []).join(' · ');
  }

  const api = { parseProgram, stripComments, commentOf, evaluate, parseBlock, run, times, guessType, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GCode = api;
})(root);

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
})(root);

})();
