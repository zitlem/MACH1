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
      tool: 0, nextTool: 0, cycle: 0, polar: false, tcyc: 0, tcStart: null, xcyc: 0, xInit: 0, c73: [0, 0, 1], c74: 0, c76: [1, 0, 60, 0], retInit: true, R: null, Q: null, P: 0, initZ: null, cycZ: null, units: null, diam: turnish, roughD: 0, roughE: 0 };
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
    // rot = [matrix, centre, frame]: G68 turns points about the centre; G68.2 (frame) places the program's coordinates
    // in a tilted frame whose origin is the centre
    const turned = q => {
      if (!rot) return q;
      const [m, c, frame] = rot, x = q[0] - (frame ? 0 : c[0]), y = q[1] - (frame ? 0 : c[1]), z = q[2] - (frame ? 0 : c[2]);
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
        else if (g === 68.2) special = 68.2;
        else if (g === 51) note('Scaling (G51) is not applied');
        else if (g === 12.1) { st.polar = true; note('Polar coordinate interpolation (G12.1): C is drawn as the second axis on the face (milling view)'); }
        else if (g === 13.1) st.polar = false;
        else if (g === 52) special = 'skip';
        else if (!QUIET.has(g)) note('G' + g + ' is not simulated');
      }
      if (special === 'modeset') { pc++; return true; }
      if (special === 68.2) {                          // G68.2 X Y Z I J K: a frame at X Y Z turned by the Euler angles I J K (Z, X, Z)
        const v = L => (has(L) ? (L === 'X' && st.diam ? W.X / 2 : W[L]) : 0), mul = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
        const m = mul(mul(rotation([0, 0, 1], v('I')), rotation([1, 0, 0], v('J'))), rotation([0, 0, 1], v('K'))), c = [v('X'), v('Y'), v('Z')];
        const a = turned([st.X, st.Y, st.Z]), d0 = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
        rot = [m, c, true];
        st.X = m[0] * d0[0] + m[3] * d0[1] + m[6] * d0[2]; st.Y = m[1] * d0[0] + m[4] * d0[1] + m[7] * d0[2]; st.Z = m[2] * d0[0] + m[5] * d0[1] + m[8] * d0[2];
        pc++; return true;
      }
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
      if (st.polar && has('C')) y = st.abs ? W.C : st.Y + W.C;     // G12.1: C is the face's second axis
      if (st.polar && has('H')) y = st.Y + W.H;
      if (turnish && special !== 4) {
        if (has('U')) x = st.X + xs(W.U);
        if (has('W') && !(special === 28 || special === 30)) z = st.Z + W.W;
        if (has('V')) y = st.Y + W.V;
      }
      const moving = has('X') || has('Y') || has('Z') || (turnish && (has('U') || has('W') || has('V'))) || (st.polar && (has('C') || has('H')));
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
})(this);
