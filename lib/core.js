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
})(this);
