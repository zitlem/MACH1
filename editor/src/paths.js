// Cutter paths of Mazatrol units, worked out here from each unit and its tool and shape lines. The control
// works out its own paths from its parameters (clearances, approach and cutting patterns); these follow the
// same plan and are approximate: point machining (spot, drill with pecks, ream, tap, bore, circular milling),
// line milling on, right, left, outside and inside a shape, chamfers, face milling, pockets (with islands),
// slots, and on lathes bar roughing and finishing, facing, grooving, threading, centre drilling and tapping,
// plus manual-program moves.
// Every move keeps the record it comes from; the steps follow the machining order line by line (each tool
// line, then the shape or hole lines it machines), so the plot can play a program back one line at a time.
(function (root) {
  'use strict';
  const Maz = root.Maz || (typeof require !== 'undefined' ? require('./core.js') : null);
  const Plot = root.Plot || (typeof require !== 'undefined' ? require('./plot.js') : null);

  const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  const u32 = (b, o) => i32(b, o) >>> 0;
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const DEG = Math.PI / 180;
  // a tool line's priority number (No., bytes 22-23; entered flag 0x800) and its * mark (byte 8, odd: after the others)
  const priority = r => ((i32(r, 4) & 0x800) && u16(r, 22) > 0 ? { n: u16(r, 22), later: (r[8] & 1) === 1 } : null);

  // ---------------------------------------------------------------- plane geometry
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = v => Math.hypot(v[0], v[1]);
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  function area(pts) { let s = 0; for (let i = 0; i < pts.length - 1; i++) s += cross(pts[i], pts[i + 1]); return s / 2; }
  // drop repeated points (keeping the record of each segment)
  function clean(pts, recs) {
    const P = [pts[0]], R = [];
    for (let i = 1; i < pts.length; i++) if (!same(pts[i], P[P.length - 1])) { P.push(pts[i]); R.push(recs ? recs[i - 1] : 0); }
    return { pts: P, recs: R };
  }
  // A polyline moved sideways by d (left of the travel direction for d > 0): offset segments, joined where
  // they meet on the inside of a turn and by an arc round the corner on the outside.
  function offset(pts0, d, closed, recs0) {
    const c = clean(pts0, recs0), pts = c.pts, recs = c.recs;
    if (pts.length < 2 || !d) return { pts: pts.slice(), recs: recs.slice() };
    const n = pts.length - 1, segs = [];
    for (let i = 0; i < n; i++) {
      const v = sub(pts[i + 1], pts[i]), l = len(v), u = [v[0] / l, v[1] / l], nn = [-u[1] * d, u[0] * d];
      segs.push({ a: [pts[i][0] + nn[0], pts[i][1] + nn[1]], b: [pts[i + 1][0] + nn[0], pts[i + 1][1] + nn[1]], u, nn, rec: recs[i] });
    }
    const out = [], orec = [];
    const add = (q, rec) => { if (!out.length || !same(q, out[out.length - 1])) { if (out.length) orec.push(rec); out.push(q); } };
    const join = (s0, s1, vtx) => {
      const turn = cross(s0.u, s1.u);
      if (Math.abs(turn) < 1e-9 && s0.u[0] * s1.u[0] + s0.u[1] * s1.u[1] > 0) { add(s1.a, s0.rec); return; }
      if (turn * d > 0) {                                  // inside of the turn: where the offset lines meet
        const den = cross(s0.u, s1.u), w = sub(s1.a, s0.a), t = cross(w, s1.u) / den;
        const q = [s0.a[0] + s0.u[0] * t, s0.a[1] + s0.u[1] * t];
        if (Math.abs(t) < 1e6) { add(q, s0.rec); return; }
        add(s0.b, s0.rec); add(s1.a, s1.rec);
        return;
      }
      // outside: an arc round the corner
      const a0 = Math.atan2(s0.nn[1], s0.nn[0]), a1 = Math.atan2(s1.nn[1], s1.nn[0]), r = Math.abs(d), ccw = turn > 0;
      let sw = ccw ? a1 - a0 : a0 - a1;
      while (sw < 0) sw += 2 * Math.PI;
      const k = Math.max(1, Math.ceil(sw / (Math.PI / 18)));
      add(s0.b, s0.rec);
      for (let j = 1; j <= k; j++) { const t = a0 + (ccw ? 1 : -1) * sw * j / k; add([vtx[0] + r * Math.cos(t), vtx[1] + r * Math.sin(t)], s0.rec); }
    };
    if (closed) {
      join(segs[n - 1], segs[0], pts[0]);
      const start = out.length ? out[out.length - 1] : segs[0].a;
      out.length = 0; orec.length = 0;
      out.push(start);
      for (let i = 0; i < n - 1; i++) join(segs[i], segs[i + 1], pts[i + 1]);
      join(segs[n - 1], segs[0], pts[0]);
      if (!same(out[out.length - 1], start)) { orec.push(segs[n - 1].rec); out.push(start); }
    } else {
      add(segs[0].a, segs[0].rec);
      for (let i = 0; i < n - 1; i++) join(segs[i], segs[i + 1], pts[i + 1]);
      add(segs[n - 1].b, segs[n - 1].rec);
    }
    return { pts: out, recs: orec };
  }
  // The parts of an offset path where a tool of radius rad fits (no nearer than rad to any edge of the shapes):
  // an offset of a shape with gaps narrower than the tool folds over itself there, and those parts are dropped.
  // Returns a list of {pts, recs} chains.
  function fitting(o, polys, rad) {
    const edges = [];
    for (const P of polys) for (let i = 0; i < P.length - 1; i++) edges.push([P[i], P[i + 1]]);
    const near = q => {
      let best = Infinity;
      for (const [a, b] of edges) {
        const v = sub(b, a), l2 = v[0] * v[0] + v[1] * v[1], t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1]) / l2)) : 0;
        const d = Math.hypot(a[0] + t * v[0] - q[0], a[1] + t * v[1] - q[1]);
        if (d < best) best = d;
      }
      return best;
    };
    const tol = rad * 0.02 + 1e-6, chains = [];
    let cur = null;
    const keep = (q, rec) => {
      if (near(q) >= rad - tol) { if (!cur) { cur = { pts: [q], recs: [] }; chains.push(cur); } else { cur.pts.push(q); cur.recs.push(rec); } }
      else cur = null;
    };
    keep(o.pts[0], o.recs[0]);
    for (let i = 1; i < o.pts.length; i++) {
      const a = o.pts[i - 1], b = o.pts[i], n = Math.max(1, Math.ceil(len(sub(b, a)) / (rad / 3 || 1)));
      for (let k = 1; k <= n; k++) keep([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], o.recs[i - 1]);
    }
    // a closed path cut somewhere: the last chain runs on into the first
    if (chains.length > 1 && same(o.pts[0], o.pts[o.pts.length - 1]) && same(chains[0].pts[0], o.pts[0]) && same(chains[chains.length - 1].pts[chains[chains.length - 1].pts.length - 1], o.pts[0])) {
      const last = chains.pop();
      chains[0] = { pts: last.pts.concat(chains[0].pts.slice(1)), recs: last.recs.concat(chains[0].recs) };
    }
    return chains.filter(ch => ch.pts.length > 1);
  }
  // Where a tool of radius rad can be with its centre on the line y = y0: inside the outer shapes and outside the
  // islands (even-odd over all polygons), at least rad from every edge. Returns sorted [x0, x1] intervals.
  function scan(polys, y0, rad) {
    const xs = [];
    for (const P of polys) for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if ((a[1] <= y0) !== (b[1] <= y0)) xs.push(a[0] + (y0 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    let inside = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] > xs[i]) inside.push([xs[i], xs[i + 1]]);
    if (!rad) return inside;
    const bad = [];
    for (const P of polys) for (let i = 0; i < P.length - 1; i++) { const iv = capsule(P[i], P[i + 1], rad, y0); if (iv) bad.push(iv); }
    bad.sort((p, q) => p[0] - q[0]);
    for (const [b0, b1] of bad) {
      const next = [];
      for (const [a0, a1] of inside) {
        if (b1 <= a0 || b0 >= a1) { next.push([a0, a1]); continue; }
        if (b0 > a0) next.push([a0, b0]);
        if (b1 < a1) next.push([b1, a1]);
      }
      inside = next;
    }
    return inside.filter(([a, b]) => b - a > 1e-6);
  }
  // the x range of points within r of segment ab on the line y = y0 (the segment's capsule cut by the line)
  function capsule(a, b, r, y0) {
    let lo = Infinity, hi = -Infinity;
    for (const c of [a, b]) { const dy = y0 - c[1]; if (Math.abs(dy) <= r) { const h = Math.sqrt(r * r - dy * dy); lo = Math.min(lo, c[0] - h); hi = Math.max(hi, c[0] + h); } }
    const v = sub(b, a), l = len(v);
    if (l > 0) {
      const nx = -v[1] / l * r, ny = v[0] / l * r, Q = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
      for (let i = 0; i < 4; i++) {
        const p = Q[i], q = Q[(i + 1) % 4];
        if ((p[1] - y0) * (q[1] - y0) <= 0 && p[1] !== q[1]) { const x = p[0] + (y0 - p[1]) * (q[0] - p[0]) / (q[1] - p[1]); lo = Math.min(lo, x); hi = Math.max(hi, x); }
        else if (p[1] === y0 && q[1] === y0) { lo = Math.min(lo, p[0], q[0]); hi = Math.max(hi, p[0], q[0]); }
      }
    }
    return lo <= hi ? [lo, hi] : null;
  }
  // can the tool centre be at q: inside the shapes (even-odd) and at least rad from every edge
  function fits(polys, q, rad) {
    let inside = false, best = Infinity;
    for (const P of polys) for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if ((a[1] <= q[1]) !== (b[1] <= q[1]) && q[0] < a[0] + (q[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) inside = !inside;
      const v = sub(b, a), l2 = v[0] * v[0] + v[1] * v[1], t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1]) / l2)) : 0;
      best = Math.min(best, Math.hypot(a[0] + t * v[0] - q[0], a[1] + t * v[1] - q[1]));
    }
    return inside && best >= rad * 0.98 - 1e-6;
  }
  // zigzag clearing: scan lines step apart, joined into runs where the tool can go straight from the end of one
  // row to the start of the next; returns a list of runs, each a polyline to feed along (the tool lifts between)
  function zigzag(polys, rad, step, bbox) {
    const [x0, y0, x1, y1] = bbox, runs = [];
    if (!(step > 0)) return runs;
    const links = (a, b) => {
      const n = Math.max(2, Math.ceil(len(sub(b, a)) / Math.max(rad / 2, 1e-3)));
      for (let k = 1; k < n; k++) if (!fits(polys, [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], rad)) return false;
      return true;
    };
    let open = [];
    const n = Math.max(1, Math.ceil((y1 - y0 - 2 * rad) / step));
    for (let k = 0; k <= n; k++) {
      const y = Math.min(y0 + rad + k * step, y1 - rad) + (k === 0 ? 1e-7 : k === n ? -1e-7 : 0);
      const ivs = scan(polys, y, rad), next = [];
      for (const iv of ivs) {
        const j = open.findIndex(o => o.last[0] < iv[1] && o.last[1] > iv[0] && links(o.pts[o.pts.length - 1], o.dir > 0 ? [iv[0], y] : [iv[1], y]));
        let run;
        if (j >= 0) { run = open[j]; open.splice(j, 1); } else { run = { pts: [], dir: 1 }; runs.push(run); }
        const a = run.dir > 0 ? [iv[0], y] : [iv[1], y], b = run.dir > 0 ? [iv[1], y] : [iv[0], y];
        run.pts.push(a, b);
        run.dir = -run.dir; run.last = iv;
        next.push(run);
      }
      open = next;
    }
    return runs.map(r => r.pts);
  }
  const bboxOf = polys => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const P of polys) for (const [x, y] of P) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); } return [a, b, c, d]; };

  // ---------------------------------------------------------------- the program
  // program(p, units, ls, view) -> {moves, steps, notes}
  //   move {kind 'rapid'|'feed', pts [[x, y, z]...] (turning: [x radius, 0, z]), rec, unit, feed, feedMode, spindle, css, maxRpm}
  //   step {at (first move), rec, unit (index), unitRec, label}
  // opts.resolve(name): the program a SUB PRO unit calls, as {p} (Mazatrol) or {moves} (an EIA program's moves), or null;
  // opts.toolDia(p, toolLine, nomD): the diameter to work out rpm with (the tool's actual one), or null for NOM-D;
  // opts.fixed {mms (per probe line), index, pallet, mcode}: seconds for units that take time without cutting
  // The control's time for a probe line, by what it measures: a least-squares fit over the 190 MMS units of the two
  // horizontals that the control timed (cutest records): the units' total comes out within 1% and a unit is about 1.5 s
  // out. Z-FACE runs from 1.2 to 7.3 s on the control (the travel to the probe point counts), so a typical unit is
  // shorter than these averages. X-GRV (2 units) takes Y-GRV's; types not in the table (CAL) take the fallback seconds
  // per line, as every line does when seconds are entered in the time window.
  const MMS_BY = { 'Z-FACE': 3.0, 'X-FACE': 1.8, 'Y-FACE': 2.1, 'X-STP': 5.2, 'Y-STP': 5.2, 'X-GRV': 3.1, 'Y-GRV': 3.1, 'XY-BOS': 8.5, 'BORE-XY': 7.1 };
  function mmsSeconds(seqs, fixed, ptnOf) {
    if (!fixed.mmsBy) return fixed.mms * Math.max(1, seqs.length);
    return seqs.length ? seqs.reduce((a, i) => { const s = fixed.mmsBy[ptnOf(i)]; return a + (s != null ? s : fixed.mms); }, 0) : fixed.mms;
  }
  function program(p, units, ls, view, opts) {
    ls = ls || Maz.lines(p);
    opts = opts || {};
    const type = Maz.CONTROLS[p.ctl].type, turn = type === 'lathe' || view === 'turn';
    const inch = units !== 'metric', S = inch ? 1e-5 : 1e-4, L = (r, o) => i32(r, o) * S;
    const cspScale = Maz.CONTROLS[p.ctl].family === 'Smooth' ? 0.001 : 1;
    const ent = (r, bit) => (u32(r, 4) & bit) !== 0;
    const CLR = inch ? 0.1 : 2.5, SAFE = inch ? 1 : 25;
    const out = { moves: [], steps: [], notes: [], subs: [] };
    const note = s => { if (!out.notes.includes(s)) out.notes.push(s); };
    const us = Maz.structure(p, ls);
    const cu = us.find(u => u.code === 1), crec = cu ? p.recs[cu.i] : null;
    const zInit = crec && !turn && ent(crec, 2) ? Math.max(L(crec, 40), CLR) : SAFE;
    const maxRpm = crec && turn && i32(crec, 60) > 0 ? i32(crec, 60) * cspScale : 4000;
    const stock = crec && turn ? { od: i32(crec, 64) * S, id: i32(crec, 68) * S, face: i32(crec, 76) * S } : null;
    // turning: where the turret waits between units (above the stock, in front of it)
    const home = turn ? [(stock && stock.od > 0 ? stock.od / 2 : SAFE) + 2 * CLR, 0, -Math.max(stock ? stock.face : 0, 0) - 2 * CLR] : null;

    // pos: where the tool is in the unit's own coordinates; posT: on the machine (after an OFFSET unit's shift)
    let pos = null, posT = null, off = { x: 0, y: 0, z: 0, rot: 0 };
    const T = q => {
      if (turn || (!off.x && !off.y && !off.z && !off.rot)) return q;
      const cr = Math.cos(off.rot), sr = Math.sin(off.rot);
      return [q[0] * cr - q[1] * sr + off.x, q[0] * sr + q[1] * cr + off.y, q[2] + off.z];
    };
    const cur = { unit: 0, unitRec: 0, rec: 0, feed: 0, feedMode: 'min', spindle: 0, css: false, toolRec: -1 };
    const push = (kind, pts) => out.moves.push({ kind, pts, rec: cur.rec, unit: cur.unit, feed: cur.feed, feedMode: cur.feedMode, spindle: cur.spindle, css: cur.css, maxRpm, toolRec: cur.toolRec });
    const go = (kind, x, y, z) => {
      const q = [x, y, z];
      if (!pos) { pos = q; posT = T(q); return; }
      if (Math.abs(pos[0] - x) < 1e-9 && Math.abs(pos[1] - y) < 1e-9 && Math.abs(pos[2] - z) < 1e-9) return;
      const qT = T(q);
      push(kind, [posT, qT]);
      pos = q; posT = qT;
    };
    const along = (kind, pts3) => { for (const q of pts3) go(kind, q[0], q[1], q[2]); };
    const step = (rec, label) => { cur.rec = rec; out.steps.push({ at: out.moves.length, rec, unit: cur.unit, unitRec: cur.unitRec, label }); };
    const up = () => { if (pos) go('rapid', pos[0], pos[1], turn ? pos[2] : zInit); };
    // spindle and feed of a tool line: C-SP (ft or m per minute), FR (per revolution) and the tool diameter
    // priority machining: each tool line's moves are a block; a unit's first block starts at the unit line
    const blocks = [];
    const speeds = (r, dia, pitch) => {
      const ti = p.recs.indexOf(r);
      if (ti !== cur.toolRec) {
        cur.toolRec = ti;                             // the tool line the moves after this are cut with
        const pri = priority(r), b = blocks[blocks.length - 1];
        if (b && b.unit === cur.unit && b.tool < 0) Object.assign(b, { tool: ti, pri, p });
        else {
          let k = out.steps.length - 1;
          while (k > 0 && out.steps[k].rec !== ti && out.steps[k].unit === cur.unit) k--;
          if (out.steps[k] && out.steps[k].rec === ti && k > b.step) blocks.push({ step: k, unit: cur.unit, tool: ti, pri, p });
        }
      }
      // the control turns C-SP into rpm with the tool's actual diameter (its tool data), not NOM-D
      if (dia > 0 && opts.toolDia) dia = opts.toolDia(p, ti, dia) || dia;
      const fr = pitch || Math.max(0, i32(r, 64)) * S;
      // C-SP: Smooth programs keep 3 decimals (540 ft/min is stored 540000), Matrix programs whole numbers
      const csp = Math.max(0, i32(r, 60)) * cspScale;
      // a C-SP under 1 is as good as unset: the time is taken at the common unit's top speed (the check flags it)
      if (turn && csp < 1) { cur.feedMode = 'rev'; cur.css = false; cur.spindle = maxRpm || 0; cur.feed = fr; return; }
      if (turn) { cur.feedMode = 'rev'; cur.css = true; cur.spindle = csp; cur.feed = fr; return; }
      const rpm = dia > 0 ? csp * (inch ? 12 : 1000) / (Math.PI * dia) : 0;
      cur.feedMode = 'min'; cur.css = false; cur.spindle = rpm; cur.feed = fr * rpm;
    };

    // the program stops at its first END unit; units after it are not run
    const endAt = us.findIndex(u => ls[u.i].sel.code === 4);
    if (endAt >= 0 && endAt < us.length - 1) {
      const a = Maz.number(p.recs[us[endAt + 1].i]), b = Maz.number(p.recs[us[us.length - 1].i]);
      note('UNo ' + (a === b ? a : a + '–' + b) + ' come' + (a === b ? 's' : '') + ' after the END unit (UNo ' + Maz.number(p.recs[us[endAt].i]) + ') and ' + (a === b ? 'is' : 'are') + ' not run.');
    }
    const skippedOut = [];
    us.forEach((u, ui) => {
      if (endAt >= 0 && ui > endAt) return;
      if (Maz.controlOut(ls[u.i])) { skippedOut.push(Maz.number(p.recs[u.i])); return; }      // CONTROL OUT: the control does not run it
      cur.unit = ui; cur.unitRec = u.i; cur.toolRec = ls[u.i].sel.code === 6 ? u.i : -1;   // MANL PRG: its tool is on the unit line
      // priority numbers work within one process: nothing moves across a PALT CHG or a PROC END unit
      // an MMS unit carries its priority No. on the unit line, and the control runs it as a process of its own: it takes its
      // place in the order by that number (it is not in the list of tool lines, which are the tool lines)
      blocks.push({ step: out.steps.length, unit: ui, tool: -1, pri: !turn && ls[u.i].sel.code === 8 ? priority(p.recs[u.i]) : null, fixed: ls[u.i].sel.code === 0x0a || ls[u.i].sel.code === 0x0b });
      const r0 = p.recs[u.i], code = ls[u.i].sel.code, uno = Maz.number(r0), uname = Maz.unitName(p.ctl, code);
      const tag = code === 1 ? 'common unit' : 'UNo ' + uno + ' ' + uname;
      step(u.i, tag);
      if (code === 5) { subProgram(u, ui, r0, tag); return; }
      const seqs = u.seqs.filter(i => ls[i].lay && !(ls[i].sel.code >= 0xd0 && ls[i].sel.code <= 0xff));
      // units that take time without cutting (opts.fixed: seconds; MMS per probe line), as dwells at the tool's place
      const fx = opts.fixed && !turn ? { 8: mmsSeconds(seqs, opts.fixed, i => { const L1 = ls[i], k = L1.lay ? L1.lay.cells.findIndex((c, j) => Maz.cellLabel(L1.lay, j) === 'PTN') : -1; return k < 0 ? '' : Maz.cellText(L1, k, {}).trim(); }), 0x0c: opts.fixed.index, 0x0a: opts.fixed.pallet, 7: opts.fixed.mcode }[code] : opts.fixed && turn ? { 0x12: opts.fixed.transfer || 17, 4: 1.5 }[code] : 0;      // lathe: TRANSFER 16-18 s, END 0.7-2.4 s (350 and mill-turn programs)
      // MMS: the probe's moves for each measuring line (programming manual 7-15-6), drawn; the unit's time stays the
      // calibrated time per probe line, the moves' own time taken out of it
      if (!turn && code === 8) {
        const m0 = out.moves.length;
        for (const i of seqs) { step(i, tag + ' · line ' + Maz.number(p.recs[i])); if (ls[i].sel.code === 0xa2) probeLine(p.recs[i], ls[i]); }
        if (fx > 0) {
          for (let k = m0; k < out.moves.length; k++) out.moves[k].untimed = true;      // the time is the unit's
          out.moves.push({ kind: 'dwell', pts: [posT || [0, 0, zInit]], dwell: fx, rec: u.i, unit: ui, feed: 0, feedMode: 'min', spindle: 0, toolRec: -1 });
        }
        return;
      }
      if (fx > 0) {
        const at = posT || [0, 0, zInit];
        out.moves.push({ kind: 'dwell', pts: [at], dwell: fx, rec: u.i, unit: ui, feed: 0, feedMode: 'min', spindle: 0, toolRec: -1 });
        for (const i of seqs) step(i, tag);
        return;
      }
      const dwell = t => { if (pos && t > 0) out.moves.push({ kind: 'dwell', pts: [posT], dwell: t, rec: cur.rec, unit: cur.unit, feed: cur.feed, feedMode: cur.feedMode, spindle: cur.spindle, css: cur.css, maxRpm, toolRec: cur.toolRec }); };
      const ctx = { p, ls, u, r0, code, seqs, tag, L, ent, S, inch, CLR, zInit, turn, step, go, along, up, speeds, note, cur, home, stock, cspScale, dwell,
        get pos() { return pos; } };
      if (!turn && code === 3) {                       // OFFSET: U(X) V(Y) D(th) W(Z) for the units after it
        off = { x: L(r0, 36), y: L(r0, 40), rot: i32(r0, 44) * 1e-4 * DEG, z: L(r0, 48) };
        for (const i of seqs) step(i, tag);
        return;
      }
      if (!turn && code === 2) off = { x: 0, y: 0, z: 0, rot: 0 };     // a new work offset starts unshifted
      try {
        if (code === 6) manual(ctx);
        else if (!turn && code >= 0x20 && code <= 0x2b) pointUnit(ctx);
        else if (!turn && ((code >= 0x40 && code <= 0x44) || (code >= 0x50 && code <= 0x53))) lineUnit(ctx);
        else if (!turn && code >= 0x60 && code <= 0x66) faceUnit(ctx);
        else if (turn && code >= 0x30 && code <= 0x37) turnUnit(ctx);
        else if (turn && Maz.CONTROLS[p.ctl].type === 'lathe' && ((code >= 0x20 && code <= 0x2b) || (code >= 0x40 && code <= 0x53))) turnMill(ctx);
        else for (const i of seqs) step(i, tag + ' · line ' + Maz.number(p.recs[i]));
      } catch (e) {
        note(tag + ': ' + e.message);
      }
    });
    if (skippedOut.length) note('UNo ' + skippedOut.join(', ') + (skippedOut.length > 1 ? ' are' : ' is') + ' under CONTROL OUT (⦸): not run, as on the control.');
    // a called program's tool lines are put in order with the calling program's (it hands its blocks up)
    if (opts.depth > 0) out.blocks = blocks; else byPriority();
    if (out.moves.length) note('Cutter paths are worked out here and are approximate; the machine works out its own.');
    return out;

    // The program runs top to bottom up to the first tool line with a priority number (No.); there the lines with
    // priority numbers all run, lowest number first (the same number in program order); then everything else top
    // to bottom; then the lines marked * last.
    // out.runs: the tool lines in the order they run, {p (their program), line, pri, unit (of this program), proc, k (place in
    // the program, called programs' lines in place), at, end (moves)}
    function byPriority() {
      const steps = out.steps, moves = out.moves, order = [], procs = [];
      const span = k => [blocks[k].step, k + 1 < blocks.length ? blocks[k + 1].step : steps.length];
      const mspan = k => { const [s0, s1] = span(k); return [s0 < steps.length ? steps[s0].at : moves.length, s1 < steps.length ? steps[s1].at : moves.length]; };
      // each process (between pallet changes and PROC END units) is ordered on its own
      let run = [], proc = 0;
      const flush = () => {
        const first = run.find(k => blocks[k].pri && !blocks[k].pri.later);
        const rank = k => (first !== undefined && k < first && !blocks[k].pri ? -1 : !blocks[k].pri ? 1 : blocks[k].pri.later ? 2 : 0);
        run.sort((a, b) => rank(a) - rank(b) || (Math.abs(rank(a)) !== 1 ? blocks[a].pri.n - blocks[b].pri.n : 0) || a - b);
        order.push(...run); run = [];
      };
      blocks.forEach((b, k) => { if (b.fixed) { flush(); order.push(k); proc++; } else run.push(k); procs[k] = proc; });
      flush();
      const runOf = (k, at, end) => ({ p: blocks[k].p || p, line: blocks[k].tool, pri: blocks[k].pri, unit: blocks[k].unit, proc: procs[k], k, at, end });
      out.runs = [];
      if (order.every((k, i) => k === i)) {
        order.forEach(k => { if (blocks[k].tool >= 0) { const [a, e] = mspan(k); out.runs.push(runOf(k, a, e)); } });
        return;
      }
      const ns = [], nm = [];
      let last = null;
      for (const k of order) {
        const [s0, s1] = span(k);
        if (s0 === s1) continue;
        const m0 = steps[s0].at, m1 = s1 < steps.length ? steps[s1].at : moves.length;
        let first = moves[m0];
        const at = nm.length, off = last && first && Math.hypot(last[0] - first.pts[0][0], last[1] - first.pts[0][1], last[2] - first.pts[0][2]) > 1e-9;
        // the block's first rapid now starts where the block before it ended; or a rapid joins them
        if (off && first.kind === 'rapid') { first = Object.assign({}, first, { pts: [last].concat(first.pts.slice(1)) }); moves[m0] = first; }
        else if (off) {
          nm.push({ kind: 'rapid', pts: [last, first.pts[0]], rec: steps[s0].rec, unit: steps[s0].unit, feed: 0, feedMode: 'min', spindle: 0, toolRec: first.toolRec });
        }
        const base = nm.length;                          // the joining rapid belongs to the block's first step
        for (let s = s0; s < s1; s++) ns.push(Object.assign({}, steps[s], { at: s === s0 ? at : base + steps[s].at - m0 }));
        for (let i = m0; i < m1; i++) nm.push(moves[i]);
        if (m1 > m0) { const lp = moves[m1 - 1].pts; last = lp[lp.length - 1]; }
        if (blocks[k].tool >= 0) out.runs.push(runOf(k, at, nm.length));
      }
      out.steps = ns; out.moves = nm;
      if (blocks.some(b => b.pri)) note('Tool lines run in the order of their priority numbers (No.), as the control does.');
    }

    // one MMS measuring line: X Y Z the start point, R the surface (or centre) position, D/L the width or diameter
    function probeLine(r, Lr) {
      const ptn = (Maz.cellText(Lr, 0, { units }) || '').trim(), x = L(r, 36), y = L(r, 40), z = L(r, 44), R = L(r, 52), D = Math.abs(L(r, 56));
      const sk = inch ? 40 : 1000, keep = cur.feed;
      cur.feed = sk; cur.feedMode = 'min';
      const touch = (from, to) => { go('rapid', from[0], from[1], from[2]); go('feed', to[0], to[1], to[2]); go('rapid', from[0], from[1], from[2]); };
      const over = 0.2 * (inch ? 1 : 25.4);
      go('rapid', x, y, zInit);
      go('rapid', x, y, z);
      if (/^X-FACE/.test(ptn)) touch([x, y, z], [R, y, z]);
      else if (/^Y-FACE/.test(ptn)) touch([x, y, z], [x, R, z]);
      else if (/^Z-FACE/.test(ptn)) touch([x, y, z], [x, y, R]);
      else if (/^X-(GRV|STP)/.test(ptn) || /^Y-(GRV|STP)/.test(ptn)) {
        const ax = ptn[0] === 'X' ? 0 : 1, grv = /GRV/.test(ptn), p0 = [x, y, z];
        for (const sgn of [-1, 1]) {
          const t = p0.slice(); t[ax] = R + sgn * D / 2;
          if (grv) touch(p0, t);
          else { const s0 = p0.slice(); s0[ax] = R + sgn * (D / 2 + over); go('rapid', x, y, zInit); go('rapid', s0[0], s0[1], zInit); touch(s0, t); go('rapid', s0[0], s0[1], zInit); }
        }
      } else if (/^BORE/.test(ptn)) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) touch([x, y, z], [x + dx * D / 2, y + dy * D / 2, z]);
      } else if (/BOS/.test(ptn)) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const s0 = [x + dx * (D / 2 + over), y + dy * (D / 2 + over), z];
          go('rapid', pos[0], pos[1], zInit); go('rapid', s0[0], s0[1], zInit); touch(s0, [x + dx * D / 2, y + dy * D / 2, z]);
        }
      }
      go('rapid', pos[0], pos[1], zInit);
      cur.feed = keep;
    }
    // SUB PRO: the called program's moves REPEAT times, its steps under this unit (the cursor stays on it)
    function subProgram(u, ui, r0, tag) {
      const name = String.fromCharCode(...r0.slice(36, 68)).replace(/\0[\s\S]*$/, '').trim(), times = Math.max(1, u16(r0, 24) || 1);
      if (!name) return;
      const depth = opts.depth || 0;
      const found = depth < 8 && opts.resolve ? opts.resolve(name) : null;
      if (!found) { note(tag + ' ' + name + ': open that program too (or open its folder) to plot it here.'); return; }
      let sp;
      if (found.p) {
        try { sp = program(found.p, units, null, view, { resolve: opts.resolve, toolDia: opts.toolDia, fixed: opts.fixed, depth: depth + 1 }); } catch (e) { note(tag + ' ' + name + ': ' + e.message); return; }
        sp.notes.filter(n => !/^Cutter paths are worked out/.test(n)).forEach(n => note(name + ': ' + n));
        out.subs.push({ p: found.p, unit: ui, rec: u.i });
        for (const s2 of sp.subs) out.subs.push({ p: s2.p, unit: ui, rec: u.i });
      } else sp = { moves: found.moves || [], steps: [] };
      if (!sp.moves.length) return;
      // where each move comes from in the called program: its unit (label), shape line and tool line
      const ulabel = {};
      for (const st of sp.steps) if (!(st.unit in ulabel)) ulabel[st.unit] = st.label;
      const from = m => (m.sub ? Object.assign({}, m.sub, { name: name + ' › ' + m.sub.name })
        : found.p ? { p: found.p, name, unit: m.unit, rec: m.rec, toolRec: m.toolRec, label: ulabel[m.unit] || '' }
          : { name, eia: true, tool: m.tool, line: m.line, prog: m.prog });
      for (let n = 0; n < times; n++) {
        const at = out.moves.length;
        if (posT) out.moves.push({ kind: 'rapid', pts: [posT, sp.moves[0].pts[0]], rec: u.i, unit: ui, feed: 0, feedMode: 'min', spindle: 0 });
        for (const m of sp.moves) out.moves.push(Object.assign({}, m, { rec: u.i, unit: ui, toolRec: -1, sub: from(m) }));
        const base = out.moves.length - sp.moves.length;
        const label = tag + ' ' + name + (times > 1 ? ' (' + (n + 1) + '/' + times + ')' : ''), s0 = out.steps.length;
        if (!sp.steps.length) out.steps.push({ at, rec: u.i, unit: ui, unitRec: u.i, label });
        sp.steps.forEach((st, k) => out.steps.push({ at: k ? base + st.at : at, rec: u.i, unit: ui, unitRec: u.i, label: label + ' › ' + st.label }));
        // its tool lines join this program's priority order (each repeat its own blocks)
        for (const b of sp.blocks || []) if (b.step < sp.steps.length) blocks.push(Object.assign({}, b, { step: s0 + b.step, unit: ui }));
        const last = sp.moves[sp.moves.length - 1].pts;
        pos = posT = last[last.length - 1].slice();
      }
    }
  }

  // ---------------------------------------------------------------- manual program
  function manual(c) {
    const { p, seqs, L, go, step, tag, turn, cur, cspScale } = c;
    let g = 0, X = null, Y = null, Z = null, perMin = null, fv = null;
    const P = () => c.pos;
    for (const i of seqs) {
      const r = p.recs[i];
      step(i, tag + ' · line ' + Maz.number(r));
      if (c.ls[i].sel.code !== 0xa1) continue;
      if (u32(r, 4) & 1) { const v = r[20] | (r[21] << 8); if (v <= 3) g = v; }
      const w = {};
      for (let k = 0; k < 6; k++) { const a = r[8 + k]; if (a >= 10 && a <= 35) w[String.fromCharCode(a + 55)] = L(r, 36 + 4 * k); }
      // the block's own S (rpm, byte 60) and F (G94: per minute, G95: per revolution; none given: per revolution below 1),
      // modal, so the moves are timed at the program's own feed
      if (!turn) {
        const sv = i32(r, 60) * cspScale;
        if (sv > 0) cur.spindle = sv;
        const g2 = r[22] | (r[23] << 8);
        if (g2 === 94) perMin = true; else if (g2 === 95) perMin = false;
        if ('F' in w) fv = w.F;
        if (fv !== null && (fv > 0 || 'F' in w)) {
          const mn = perMin !== null ? perMin : fv >= 1;
          cur.feedMode = 'min'; cur.css = false;
          cur.feed = mn ? fv : fv * (cur.spindle || 0);
        }
      }
      if (turn) {
        const x = 'X' in w ? w.X / 2 : 'U' in w ? (X || 0) + w.U / 2 : X, z = 'Z' in w ? w.Z : 'W' in w ? (Z || 0) + w.W : Z;
        if (x === null || z === null) { X = x; Z = z; continue; }
        if (X === null || Z === null || !P()) { X = x; Z = z; go('rapid', x, 0, z); continue; }
        moveTo(c, g, [X, Z], [x, z], w, ([a, b]) => [a, 0, b], 'K', 'I', true);
        X = x; Z = z;
      } else {
        const x = 'X' in w ? w.X : X, y = 'Y' in w ? w.Y : Y, z = 'Z' in w ? w.Z : Z;
        if (x === null || y === null) { X = x; Y = y; Z = z; continue; }
        if (!P() || X === null || Y === null) { X = x; Y = y; Z = z; go('rapid', x, y, z === null ? c.zInit : z); continue; }
        const za = Z === null ? z : Z, zb = z === null ? za : z;
        if (x === X && y === Y) go(g === 0 ? 'rapid' : 'feed', x, y, zb === null ? c.zInit : zb);
        else moveTo(c, g, [X, Y], [x, y], w, ([a, b], t) => [a, b, (za === null ? c.zInit : za) + ((zb === null ? c.zInit : zb) - (za === null ? c.zInit : za)) * t], 'I', 'J', false);
        X = x; Y = y; Z = z;
      }
    }
  }
  // a G0/G1/G2/G3 move in a plane (turning: Z across, X radius up; arc centre I/K given as radius values)
  function moveTo(c, g, a, b, w, to3, ia, ja, lathe) {
    if (g === 0 || g === 1) { const q = to3(b, 1); c.go(g === 0 ? 'rapid' : 'feed', q[0], q[1], q[2]); return; }
    let cc = null;
    if (lathe) {
      if ('K' in w || 'I' in w) cc = [a[1] + (w.K || 0), a[0] + (w.I || 0)];       // (z, x)
      const A = [a[1], a[0]], B = [b[1], b[0]];
      if (!cc && 'R' in w) cc = Plot.centerR(A, B, w.R, g === 2);
      const pts = cc ? Plot.arcPts(A, B, cc, g === 2) : [A, B];
      pts.forEach((q, k) => { const t = to3([q[1], q[0]], k / (pts.length - 1)); c.go('feed', t[0], t[1], t[2]); });
      return;
    }
    if (ia in w || ja in w) cc = [a[0] + (w[ia] || 0), a[1] + (w[ja] || 0)];
    else if ('R' in w) cc = Plot.centerR(a, b, w.R, g === 2);
    const pts = cc ? Plot.arcPts(a, b, cc, g === 2) : [a, b];
    pts.forEach((q, k) => { const t = to3(q, k / (pts.length - 1)); c.go('feed', t[0], t[1], t[2]); });
  }

  // ---------------------------------------------------------------- point machining
  // For each tool line in order, every hole of every hole pattern line: over the hole, down to the R point,
  // the tool's cycle to its depth, back up.
  const TOOL = { CTR: 1, DRILL: 2, REAMER: 3, BCK: 10, BORE: 11, BBORE: 12, CHAMFER: 13, EMILL: 15 };
  const isTap = t => t >= 4 && t <= 9;
  function pointUnit(c) {
    const { p, ls, r0, code, seqs, L, S, CLR, zInit, step, go, up, tag, speeds } = c;
    const tools = seqs.filter(i => ls[i].sel.code === 0xb0), figs = seqs.filter(i => ls[i].sel.code === 0xc0 || ls[i].sel.code === 0x1c0);
    const holeD = L(r0, 36), unitDepth = L(r0, 40), chmf = code === 0x20 || code === 0x21 || code === 0x23 || code === 0x26 || code === 0x27 ? L(r0, 44) : 0;
    // counterbore units: the counterbore's diameter (CB-DIA) is the edge a chamfer goes round
    const cbD = (code === 0x21 || code === 0x22 || code === 0x27) && L(r0, 56) > 0 ? L(r0, 56) : 0;
    // CIRC MIL: PITCH2 is the hole's helix pitch per turn (PITCH1 is the chamfer's)
    const circPitch = code === 0x26 && (r0[13] & 1) ? (L(r0, 52) > 0 ? L(r0, 52) : L(r0, 48) > 0 ? L(r0, 48) : 0) : 0;      // byte 13 bit 0: PITCH entered (blank shows 0.03 in the record)
    const pitch = code === 0x24 || code === 0x27 ? L(r0, 44) : 0;
    for (const ti of tools) {
      const t = p.recs[ti], ty = t[9], nom = isTap(ty) ? L(t, 40) : L(t, 36);
      const name = (Maz.TOOL_NAMES[ty] || 'tool') + ' ' + (isTap(ty) ? '' : +nom.toFixed(4));
      step(ti, tag + ' · ' + name);
      // planetary tapping (PRE-DIA column PLANET, byte 14 = 2): a thread-milling tap; rpm from the tap's major diameter
      const planet = isTap(ty) && t[14] === 2, major = L(r0, 40) > 0 ? L(r0, 40) : L(t, 40);
      speeds(t, planet ? major : isTap(ty) ? L(t, 40) : nom, isTap(ty) && !planet ? (L(t, 64) || pitch) : 0);
      if (isTap(ty) && !planet && c.cur.spindle) c.cur.feed = (L(t, 64) || pitch) * c.cur.spindle;
      const hd0 = L(t, 40), hd = hd0 > 0 && hd0 < (c.inch ? 50 : 1250) ? hd0 : holeD, hdep = L(t, 44), per = L(t, 56), rgh = t[15];
      let depth, pecks = 0, feedOut = false, circle = 0;
      if (ty === TOOL.CTR) {
        const ang = [90, 118, 60][i32(t, 15) & 0xff] || 90, spot = (hd / 2 + chmf) / Math.tan(ang / 2 * DEG);
        depth = t[14] ? Math.max(hdep, 0) || spot : spot;
      } else if (ty === TOOL.DRILL) { depth = hdep || unitDepth; pecks = rgh >= 2 && rgh <= 7 && per > 0 && per < depth ? per : 0; }      // RGH: the PCK cycles peck
      else if (isTap(ty)) { depth = hdep || L(r0, 48); feedOut = true; }
      else if (ty === TOOL.BORE || ty === TOOL.BBORE) {
        // programming manual 7-6-7 (boring tool): CYCLE 1/2/4/5 come back out at rapid (1 and 4 after orienting the
        // spindle), only CYCLE 3/6 feed back out; byte 14 holds the cycle (0 = CYCLE1)
        depth = hdep || unitDepth; feedOut = t[14] === 2 || t[14] === 5;
      } else if (ty === TOOL.REAMER || ty === TOOL.BCK) { depth = hdep || unitDepth; feedOut = true; }
      else if (ty === TOOL.EMILL || ty === TOOL.CHAMFER) {
        depth = hdep || unitDepth;
        circle = Math.max(0, (hd - nom) / 2);
        pecks = per > 0 && per < depth ? per : 0;
        // the tool line's DEPTH is not always a pitch (0.01 on a CIRC MIL tool): keep that to 60 turns at most;
        // CIRC MIL's own PITCH2 is the real helix pitch
        if (pecks > 0 && pecks < depth / 60) pecks = depth / 60;
        if (circPitch) pecks = circPitch;
        if (ty === TOOL.CHAMFER) {
          // a 90° chamfer mill: tip just below the chamfer size, centre on a circle just inside the edge
          const pre = L(t, 48), edge = pre > 0 && pre < (c.inch ? 50 : 1250) ? pre : cbD || holeD;
          const ch = per > 0 && per < (c.inch ? 1 : 25) ? per : chmf, cc = Math.min(c.inch ? 0.01 : 0.25, edge / 8);
          depth = Math.max(ch, 0) + cc; circle = Math.max(0, edge / 2 - cc); pecks = 0;
          // programming manual 7-6-7 (chamfering cycle): when the cutter covers the whole chamfered edge it only plunges
          // (cycle 1), down to where its 90° cone meets the edge; otherwise it mills round the hole (cycle 2)
          if (edge + 2 * Math.max(ch, 0) <= nom) { depth = edge / 2 + Math.max(ch, 0); circle = 0; }
        }
      } else depth = hdep || unitDepth;
      for (const fi of figs) {
        const f = Plot.faceRec(p.recs[fi], ls[fi], c.inch ? 'inch' : 'metric') || p.recs[fi];
        step(fi, tag + ' · ' + name + ' · FIG ' + Maz.number(p.recs[fi]));
        const zt = L(f, 36);
        for (const [x, y] of Plot.holes(f, L)) {
          go('rapid', x, y, zInit);
          go('rapid', x, y, zt + CLR);
          const zb = zt - Math.max(depth, 0);
          if (planet) {
            // programming manual 7-6-7 (planetary tapping): down to the bottom at the pre-hole feed (PRE-DEP per rev),
            // back up D49 pitches, then one G03 orbit round the thread, back to the centre and up
            const thread = c.cur.feed, rpm = c.cur.spindle, ph = Math.max(L(t, 40), major), pt = pitch || L(t, 56);
            const orbit = Math.max(ph - major, ph * 0.15) / 2;
            c.cur.feed = Math.max(0, L(t, 52)) * rpm || thread;
            go('feed', x, y, zb);
            c.cur.feed = thread;
            const z1 = zb + pt;
            go('feed', x + orbit, y, z1 - pt / 4);
            for (let k = 1; k <= 36; k++) { const a = 2 * Math.PI * k / 36; go('feed', x + orbit * Math.cos(a), y + orbit * Math.sin(a), z1 - pt / 4 + pt * k / 36); }
            go('feed', x, y, z1 + pt * 0.75);
            go('rapid', x, y, zt + CLR);
          } else if (circle > 0) {                                 // helical milling round the hole wall, level by level
            // an end mill's direction (PRE-DEP column): CCW, CW, *CCW, *CW
            const dir = ty === TOOL.EMILL && t[14] % 2 === 1 ? -1 : 1;
            const turn = (z0, z1) => { for (let k = 1; k <= 36; k++) { const a = dir * 2 * Math.PI * k / 36; go('feed', x + circle * Math.cos(a), y + circle * Math.sin(a), z0 + (z1 - z0) * k / 36); } };
            if (ty === TOOL.CHAMFER) {                     // chamfering cycle 2: down at the centre, one circle, back
              go('feed', x, y, zb);
              go('feed', x + circle, y, zb);
              turn(zb, zb);
              go('feed', x, y, zb);
              go('rapid', x, y, zt + CLR);
              go('rapid', x, y, zInit);
              continue;
            }
            const pre = ty === TOOL.EMILL && !circPitch ? L(t, 48) : 0, r0p = (pre - nom) / 2;
            if (pre > nom && r0p < circle - 1e-9 && per > 0) {
              // pre-bored hole (tool PRE-DIA entered): rings from the pre-bore out to the wall, DEPTH T apart radially, in
              // equal axial levels (the control's PATH STEP: 44 rings at two levels for 1.75 deep; the depth is not in the time)
              const nr = Math.ceil((circle - r0p) / per - 1e-9) + 1, nl = Math.max(1, Math.ceil(depth / (c.inch ? 1 : 25) - 1e-9));
              for (let lv = 1; lv <= nl; lv++) {
                const zl = zt - depth * lv / nl;
                go('feed', x + r0p, y, zl);
                for (let k = 0; k < nr; k++) { const rr = r0p + (circle - r0p) * k / Math.max(1, nr - 1); go('feed', x + rr, y, zl); turn(zl, zl); }
                go('feed', x, y, zl);
              }
              go('rapid', x, y, zt + CLR);
              go('rapid', x, y, zInit);
              continue;
            }
            let z = zt;
            const lev = pecks || depth;
            go('feed', x + circle, y, zt);
            while (z > zb + 1e-9) { const z1 = Math.max(zb, z - lev); turn(z, z1); z = z1; }
            turn(zb, zb);
            go('feed', x, y, z);
          } else if (pecks > 0) {
            let z = zt;
            while (z - pecks > zb + 1e-9) {
              z -= pecks;
              go('feed', x, y, z);
              go('rapid', x, y, zt + CLR);
              go('rapid', x, y, z + CLR / 4);
            }
            go('feed', x, y, zb);
          } else go('feed', x, y, zb);
          // the return: reamers (and boring CYCLE 3/6) by the DEPTH column: G00 rapid, a number its feed per minute,
          // G01 parameter D18 (not in the program: taken as 3x the cutting feed, which matches the control's estimates)
          const retR = (ty === TOOL.REAMER || ty === TOOL.BORE || ty === TOOL.BBORE) && feedOut ? i32(t, 56) : null;
          if (retR === -0x80000000) go('rapid', x, y, zt + CLR);
          else if (retR !== null) {
            const f0 = c.cur.feed;
            c.cur.feed = retR > 0 && ty === TOOL.REAMER ? retR * (c.inch ? 0.01 : 1) : f0 * 3;
            go('feed', x, y, zt + CLR);
            c.cur.feed = f0;
          } else go(feedOut ? 'feed' : 'rapid', x, y, zt + CLR);
          go('rapid', x, y, zInit);
        }
      }
      up();
    }
  }

  // ---------------------------------------------------------------- shapes of a milling unit
  // The unit's figures from its shape lines (LINE / CW / CCW to X Y; a line marked * starts a figure) and
  // pattern shapes (square by two corners, circle): {pts, recs (record of each segment), closed}.
  function figures(c, closeAll) {
    const { p, ls, seqs, L } = c, figs = [];
    let fig = null, prev = null;
    const end = () => { if (fig && fig.pts.length > 1) figs.push(fig); fig = null; };
    for (const i of seqs) {
      const fr = Plot.faceRec(p.recs[i], ls[i], c.inch ? 'inch' : 'metric'), r = fr || p.recs[i], code = fr ? fr[0] : ls[i].sel.code, m = u32(r, 4);
      if (code === 0xc2) {
        if (!(m & 6) || r[8] > 0x22) continue;
        const pat = r[8] - 0x20, b = [(m & 2) || !prev ? L(r, 40) : prev[0], (m & 4) || !prev ? L(r, 44) : prev[1]];
        if (prev && fig && r[12] !== 1) {
          let pts = [prev, b];
          if ((pat === 1 || pat === 2) && (m & (8 | 16 | 32))) {
            const cw = pat === 1, cc = m & (16 | 32) ? [L(r, 52), L(r, 56)] : Plot.centerR(prev, b, L(r, 48), cw);
            if (cc) pts = Plot.arcPts(prev, b, cc, cw);
          }
          for (let k = 1; k < pts.length; k++) { fig.pts.push(pts[k]); fig.recs.push(i); }
        } else { end(); fig = { pts: [b], recs: [], closed: false, first: i }; }
        prev = b;
      } else if (code === 0xc1) {
        end();
        const pat = r[8], x1 = L(r, 36), y1 = L(r, 40), x3 = L(r, 44), y3 = L(r, 48);
        const pts = pat === 0x11 ? Plot.arcPts([x1 + x3, y1], [x1 + x3, y1], [x1, y1], false) : [[x1, y1], [x3, y1], [x3, y3], [x1, y3], [x1, y1]];
        figs.push({ pts, recs: pts.slice(1).map(() => i), closed: true, first: i });
        prev = null;
      }
    }
    end();
    if (closeAll) for (const f of figs) if (!f.closed) { if (!same(f.pts[0], f.pts[f.pts.length - 1])) { f.pts.push(f.pts[0]); f.recs.push(f.recs[f.recs.length - 1]); } f.closed = true; }
    return figs;
  }
  // Z levels from the stock top down to the bottom, at most dz apart (the last one is the bottom)
  function levels(top, bottom, dz) {
    if (!(top > bottom + 1e-9) || !(dz > 0)) return [bottom];
    const n = Math.ceil((top - bottom) / dz - 1e-9), out = [];
    for (let k = 1; k <= n; k++) out.push(Math.max(bottom, top - (top - bottom) * k / n));
    return out;
  }
  // tool lines of line and face units: R (roughing) or F (finishing)
  const toolLines = c => c.seqs.filter(i => { const k = c.ls[i].sel.code; return k === 0xb1 || k === 0xb2; });
  const isFinish = r => (r[8] & 2) !== 0;           // SNo: R (roughing) or F (finishing)

  // ---------------------------------------------------------------- line and chamfer units
  // The tool centre follows the shape moved by the tool radius (LINE RGT right of the shape, LFT left, OUT
  // outside, IN inside, CTR on it), the roughing tool leaving the finishing allowances, in Z steps of DEP-Z
  // from the stock top; chamfer units run the chamfering tool round the edge.
  function lineUnit(c) {
    const { p, r0, code, L, CLR, zInit, step, go, up, tag, speeds } = c;
    const chamfer = code >= 0x50;
    const kind = chamfer ? code - 0x50 : code - 0x40;          // chamfer: 0 RGT 1 LFT 2 OUT 3 IN; line: 0 CTR 1 RGT 2 LFT 3 OUT 4 IN
    const side = chamfer ? ['right', 'left', 'out', 'in'][kind] : ['ctr', 'right', 'left', 'out', 'in'][kind];
    const closed = side === 'out' || side === 'in';
    const figs = figures(c, closed);
    if (!figs.length) { for (const i of c.seqs) step(i, tag + ' · line ' + Maz.number(p.recs[i])); return; }
    const depth = L(r0, 36), bottom = -depth;
    const srvZ = chamfer ? 0 : Math.max(0, L(r0, 40)), srvR = chamfer ? 0 : Math.max(0, L(r0, 44));
    const finZ = chamfer ? 0 : Math.max(0, L(r0, 52)), finR = chamfer || code === 0x40 ? 0 : Math.max(0, L(r0, 56));
    const csize = chamfer ? Math.max(0, L(r0, 48)) : 0;
    // a shape that ends a hair from where it starts was meant to close: say so
    for (const f of figs) {
      const a = f.pts[0], b = f.pts[f.pts.length - 1], gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (gap > 1e-6 && gap < (c.inch ? 0.02 : 0.5)) c.note(tag + ': the shape ends ' + gap.toFixed(4) + ' from where it starts (X' + a[0].toFixed(4) + ' Y' + a[1].toFixed(4) + ' and X' + b[0].toFixed(4) + ' Y' + b[1].toFixed(4) + '). A typo?');
    }
    for (const ti of toolLines(c)) {
      const t = p.recs[ti], dia = L(t, 36), rad = dia / 2, fin = isFinish(t);
      step(ti, tag + ' · ' + (fin ? 'F ' : 'R ') + (Maz.TOOL_NAMES[t[9]] || 'tool') + ' ' + +dia.toFixed(4));
      speeds(t, dia);
      const dz = L(t, 48), wid = L(t, 52), cw = (t[15] & 1) === 0;       // TYPE: CW / CCW
      // APRCH-X / APRCH-Y: where the tool comes down before it starts on the shape (? = the control picks)
      const apx = u32(t, 4) & 2 ? L(t, 40) : null, apy = u32(t, 4) & 4 ? L(t, 44) : null;
      const approach = apx !== null && apy !== null && Math.abs(apx) < (c.inch ? 400 : 10000) && Math.abs(apy) < (c.inch ? 400 : 10000) ? [apx, apy] : null;
      // the Z of each pass; roughing stops FIN-Z above the bottom
      let zs;
      if (chamfer) zs = [bottom - csize - (c.inch ? 0.01 : 0.25)];
      else zs = fin ? [bottom] : levels(bottom < 0 ? Math.min(bottom + Math.max(srvZ, 0), 0) : bottom + Math.max(srvZ, 0), bottom + finZ, dz);
      // radial passes: roughing works in from SRV-R in steps of WID-R, leaving FIN-R
      const leave = fin ? 0 : finR, radial = [];
      if (!fin && srvR > 0 && wid > 0 && side !== 'ctr') { for (let s = srvR - wid; s > 1e-9; s -= wid) radial.push(s); }
      // a chamfer cuts as laps at one depth: one lap when its size fits within WID-R, otherwise ceil(size / WID-R) rough laps and
      // a finishing lap, the first furthest from the shape. Read from a sample program's CHMF OUT (size 0.15, WID-R 0.1: 3 laps
      // stepping in by 0.036 and 0.028) and the 12 units of the two horizontals where the size is WID-R (one lap each).
      if (chamfer && csize > 0 && wid > 0 && csize > wid + 1e-9) {
        const laps = Math.ceil(csize / wid - 1e-9) + 1;
        for (let k = 0; k < laps - 1; k++) radial.push((laps - 1 - k) * 0.42 * csize / (laps - 1));
      }
      radial.push(0);
      // a chamfer cutter is a cone: its centre sits (cutter radius - depth) off the edge, the depth being the chamfer plus a little
      // (read from PATH STEP: CHMF OUT 0.15 at Z -0.1875, CHMF IN 0.05 at Z -0.1375 with a 1.15 cutter: centre 0.3875 / 0.4375 off the edge)
      const off = chamfer ? Math.max(0, rad - csize - (c.inch ? (side === 'in' ? 0.0875 : 0.0375) : (side === 'in' ? 2.2 : 0.95))) : rad;
      for (const f of figs) {
        let pts = f.pts, recs = f.recs;
        // closed shapes run the way TYPE says (CW or CCW)
        if (closed && (area(pts) > 0) === cw) { pts = pts.slice().reverse(); recs = recs.slice().reverse(); }
        const inner = closed ? (side === 'in') === (area(pts) > 0) : false;       // is the inside on the left?
        const sign = side === 'left' ? 1 : side === 'right' ? -1 : side === 'ctr' ? 0 : inner ? 1 : -1;
        for (const z of zs) {
          for (const extra of radial) {
            const d = sign * (off + leave + extra);
            const o0 = offset(pts, d, closed, recs);
            if (o0.pts.length < 2) continue;
            const chains = closed && side === 'in' && !chamfer ? fitting(o0, [pts], Math.abs(d)) : [o0];
            if (!closed && chains.length === 1 && o0.pts.length > 1) {          // START / END open: run on past the ends
              // START / END open: a centre-line cut runs on by the cutter's radius (and the clearance), a cut along a side by the
              // clearance alone (fitted to the control's times for 70 open line units of the two horizontals: LFT / RGT total
              // 1.36 -> 1.09 of the control's, CTR stays at 1.09)
              const run = (side === 'ctr' ? rad : 0) + CLR, P = o0.pts, n = P.length;
              const ext = (a, b) => { const v = sub(a, b), l = len(v); return l > 1e-9 ? [a[0] + v[0] / l * run, a[1] + v[1] / l * run] : a; };
              if (!(r0[18] & 1)) { o0.pts = [ext(P[0], P[1])].concat(o0.pts); o0.recs = [o0.recs[0]].concat(o0.recs); }
              if (!(r0[18] & 2)) { o0.pts = o0.pts.concat([ext(P[n - 1], P[n - 2])]); o0.recs = o0.recs.concat([o0.recs[o0.recs.length - 1]]); }
            }
            for (const o of chains) {
            const s0 = o.pts[0], ap = approach && z === zs[0] && extra === radial[0] ? approach : null;
            const a0 = ap || s0;
            go('rapid', a0[0], a0[1], c.pos ? c.pos[2] : zInit);
            go('rapid', a0[0], a0[1], zInit);
            go('rapid', a0[0], a0[1], z + (chamfer ? 0 : srvZ) + CLR);
            go('feed', a0[0], a0[1], z);
            if (ap) go('feed', s0[0], s0[1], z);
            let lastRec = -1;
            for (let k = 1; k < o.pts.length; k++) {
              const rec = o.recs[k - 1];
              if (rec !== lastRec && z === zs[zs.length - 1] && extra === 0) { step(rec, tag + ' · ' + (fin ? 'F' : 'R') + ' · shape line ' + Maz.number(p.recs[rec])); lastRec = rec; }
              go('feed', o.pts[k][0], o.pts[k][1], z);
            }
            go('rapid', c.pos[0], c.pos[1], z + (chamfer ? 0 : srvZ) + CLR);
            }
          }
        }
      }
      up();
    }
  }

  // ---------------------------------------------------------------- face units
  // FCE MILL and TOP EMIL face the shape in passes; POCKET (and PCKT MT / VLY with their islands) is cleared in
  // a zigzag inside the wall, then the wall is finished; STEP clears the shape's inside up to its open sides;
  // SLOT runs the tool along the slot's centre line.
  function faceUnit(c) {
    const { p, r0, code, L, CLR, zInit, step, go, up, tag, speeds } = c;
    const figs = figures(c, code !== 0x66);
    if (!figs.length) { for (const i of c.seqs) step(i, tag + ' · line ' + Maz.number(p.recs[i])); return; }
    const depth = L(r0, 36), bottom = -depth, srvZ = Math.max(0, L(r0, 40)), finZ = Math.max(0, L(r0, 52)), finR = code === 0x60 ? 0 : Math.max(0, L(r0, 56));
    // the stock starts at Z0 at the highest: a SRV-Z larger than DEPTH (SLOT 2.32 deep, SRV-Z 2.38) adds no level above it
    const top = bottom < 0 ? Math.min(bottom + srvZ, 0) : bottom + srvZ;
    // the outer shape is the biggest figure; the others are islands (pockets) or more faces
    const polys = figs.map(f => f.pts);
    for (const ti of toolLines(c)) {
      const t = p.recs[ti], dia = L(t, 36), rad = dia / 2, fin = isFinish(t);
      step(ti, tag + ' · ' + (fin ? 'F ' : 'R ') + (Maz.TOOL_NAMES[t[9]] || 'tool') + ' ' + +dia.toFixed(4));
      speeds(t, dia);
      const dz = L(t, 48), wid = L(t, 52) > 0 ? L(t, 52) : dia * (code === 0x60 ? 0.7 : 0.5);
      const zs = fin ? [bottom] : levels(top, bottom + finZ, dz);
      if (code === 0x66) {                                  // slot: along the centre line, both walls
        const sw = Math.max(L(r0, 60), dia);
        for (const f of figs) {
          for (const z of zs) {
            const extra = Math.max(0, sw / 2 - rad - (fin ? 0 : finR));
            for (const d of extra > 1e-6 ? [0, extra, -extra] : [0]) {
              const o = offset(f.pts, d, false, f.recs);
              go('rapid', o.pts[0][0], o.pts[0][1], zInit);
              go('rapid', o.pts[0][0], o.pts[0][1], top + CLR);
              go('feed', o.pts[0][0], o.pts[0][1], z);
              for (let k = 1; k < o.pts.length; k++) go('feed', o.pts[k][0], o.pts[k][1], z);
              go('rapid', c.pos[0], c.pos[1], top + CLR);
            }
          }
        }
        up();
        continue;
      }
      const facing = code === 0x60 || code === 0x61;
      if (facing) { facePasses(c, t, ti, polys, rad, wid, zs, top, fin); continue; }
      // pockets keep the tool inside the wall
      const keep = rad + (fin ? 0 : finR);
      const bb = bboxOf(polys);
      // pockets (POCKET E92, mountain E93, valley E94): bit 0 is the direction of the rings, 1 = outside in (default 1, 1, 0). The rings
      // follow the wall in steps of WID-R, linked at the feed; with islands, or when a ring splits, the zigzag is used
      const pd = { 0x63: ['E92', 1], 0x64: ['E93', 1], 0x65: ['E94', 0] }[code];
      let ringRuns = null;
      if (pd && !fin && figs.length === 1) {
        const raw = tpcRaw(c, pd[0]), outsideIn = ((raw === null ? pd[1] : raw & 1)) === 1;
        const f0 = figs[0], pts = area(f0.pts) > 0 ? f0.pts : f0.pts.slice().reverse(), recs0 = area(f0.pts) > 0 ? f0.recs : f0.recs.slice().reverse();
        const rings = [];
        for (let k = 1; k < 400; k++) {
          const o = offset(pts, keep + k * wid * 0.5, true, recs0)      // ring spacing fitted to the control's times (single-shape pockets);
          if (o.pts.length < 3 || area(o.pts) <= 1e-9 || (rings.length && Math.abs(area(o.pts)) >= Math.abs(area(rings[rings.length - 1])) - 1e-9)) break;
          rings.push(o.pts);
        }
        if (rings.length) { const seq = outsideIn ? rings : rings.slice().reverse(); ringRuns = [[].concat(...seq.map(r => r))]; }
      }
      for (const z of zs) {
        const runs = ringRuns || zigzag(polys, keep, wid, bb);
        step(ti, tag + ' · ' + (fin ? 'F' : 'R') + ' · Z ' + +z.toFixed(4));
        for (const run of runs) {
          go('rapid', run[0][0], run[0][1], c.pos ? Math.max(c.pos[2], top + CLR) : zInit);
          go('rapid', run[0][0], run[0][1], top + CLR);
          go('feed', run[0][0], run[0][1], z);
          for (let k = 1; k < run.length; k++) go('feed', run[k][0], run[k][1], z);
          go('rapid', c.pos[0], c.pos[1], top + CLR);
        }
        // the wall (and round the islands) after clearing each level
        if (!facing && code !== 0x62) {
          figs.forEach((f, k) => {
            const outer = k === 0 || Math.abs(area(f.pts)) === Math.max(...figs.map(g => Math.abs(area(g.pts))));
            const pts = area(f.pts) > 0 ? f.pts : f.pts.slice().reverse(), recs = area(f.pts) > 0 ? f.recs : f.recs.slice().reverse();
            const o0 = offset(pts, (outer ? 1 : -1) * keep, true, recs);
            if (o0.pts.length < 3) return;
            for (const o of fitting(o0, polys, keep)) {
              go('rapid', o.pts[0][0], o.pts[0][1], top + CLR);
              go('feed', o.pts[0][0], o.pts[0][1], z);
              let last = -1;
              for (let j = 1; j < o.pts.length; j++) {
                if (o.recs[j - 1] !== last && z === zs[zs.length - 1]) { last = o.recs[j - 1]; step(last, tag + ' · ' + (fin ? 'F' : 'R') + ' · wall, shape line ' + Maz.number(p.recs[last])); }
                go('feed', o.pts[j][0], o.pts[j][1], z);
              }
              go('rapid', c.pos[0], c.pos[1], top + CLR);
            }
          });
        }
      }
      up();
    }
  }
  // Face milling (programming manual 7-10-3): passes along X or Y (tool line TYPE: 1 X-BI, 2 Y-BI, 3 X-UN, 4 Y-UN,
  // 5/6 X/Y-SH, 7/8 XB/YB-AS), WID-R apart over the shape, each from the tool clear of the shape by E12 to E12 past it.
  // The tool rapids to E9 above the face, then down outside the work; BI-DIR steps over at feed, UNI-DIR rapids up
  // to the initial point and back for each pass. E9/E12 come from the unit's TPC, else the usual defaults.
  function faceRuns(polys, rad, wid, bb, over) {
    const runs = [], [, y0, , y1] = bb, h = Math.max(0, y1 - y0), n = Math.max(1, Math.ceil(h / wid - 1e-9));
    for (let k = 0; k < n; k++) {
      const y = y0 + (k + 0.5) * h / n;
      let lo = Infinity, hi = -Infinity;
      for (const dy of [-rad, -rad / 2, 0, rad / 2, rad]) for (const [a, b] of scan(polys, y + dy, 0)) { lo = Math.min(lo, a); hi = Math.max(hi, b); }
      if (lo > hi) continue;
      runs.push([[lo - rad - over, y], [hi + rad + over, y]]);
    }
    return runs;
  }
  function tpcValue(c, d, inch, dflt) {
    const i = c.u.seqs.find(k => Maz.isTpcMain(c.p.recs[k][0]));
    if (i === undefined || !Maz.tpcFields) return dflt;
    const f = Maz.tpcFields(c.p.recs[i], Maz.CONTROLS[c.p.ctl].type, Maz.CONTROLS[c.p.ctl].family).fields.find(x => x.d === d);
    return f && f.applies ? parseFloat(f.text) * (inch ? 1 : 1) : dflt;
  }
  // the stored value of a TPC field of this unit (null when the unit has no TPC record or the field is not in it)
  function tpcRaw(c, d) {
    const i = c.u.seqs.find(k => Maz.isTpcMain ? Maz.isTpcMain(c.p.recs[k][0]) : (c.p.recs[k][0] >= 0xd0 && c.p.recs[k][0] < 0xf0));
    if (i === undefined || !Maz.tpcFields) return null;
    const f = Maz.tpcFields(c.p.recs[i], Maz.CONTROLS[c.p.ctl].type, Maz.CONTROLS[c.p.ctl].family).fields.find(x => x.d === d);
    return f && f.applies ? f.raw : null;
  }
  function facePasses(c, t, ti, polys, rad, wid, zs, top, fin) {
    const { go, step, tag, inch, zInit } = c;
    const type = t[15] || 1, alongY = type % 2 === 0 && type <= 8, uni = type === 3 || type === 4;
    const e9 = tpcValue(c, 'E9', inch, inch ? 0.12 : 3), e12 = tpcValue(c, 'E12', inch, inch ? 0.2 : 5);
    const sw = q => (alongY ? [q[1], q[0]] : q);                     // passes along Y: work with X and Y swapped
    const ps = polys.map(pl => pl.map(sw)), bb = bboxOf(ps);
    for (const z of zs) {
      step(ti, tag + ' · ' + (fin ? 'F' : 'R') + ' · Z ' + +z.toFixed(4));
      const runs = faceRuns(ps, rad, wid, bb, e12);
      runs.forEach((run, k) => {
        const flip = !uni && k % 2 === 1, a = sw(flip ? run[1] : run[0]), b = sw(flip ? run[0] : run[1]);
        if (k === 0 || uni) {
          go('rapid', a[0], a[1], c.pos ? Math.max(c.pos[2], zInit) : zInit);
          go('rapid', a[0], a[1], top + e9);
          go('rapid', a[0], a[1], z);
        } else go('feed', a[0], a[1], z);                           // BI-DIR: step over at feed, off the work
        go('feed', b[0], b[1], z);
        if (uni) go('rapid', b[0], b[1], zInit);
      });
    }
    c.up();
  }

  // ---------------------------------------------------------------- turning
  // Positions are [x radius, 0, z] with Z as the program has it (0 at the finished face, up into the part).
  function turnUnit(c) {
    const { p, ls, r0, code, seqs, L, CLR, step, go, tag, speeds, home } = c;
    const tools = seqs.filter(i => ls[i].sel.code === 0xb4), shapes = seqs.filter(i => ls[i].sel.code >= 0xa8 && ls[i].sel.code <= 0xad);
    const part = u16(r0, 20);                              // 0 OUT, 1 IN, 2 FACE (FCE), 3 BACK
    const isIn = part === 3 || part === 4, x2r = v => v / 2;     // PART: 1 OUT, 3 IN, 5 FCE
    const toHome = () => {                               // away from the part: bores out along Z first, else up in X
      if (c.pos && isIn) go('rapid', c.pos[0], 0, home[2]);
      else if (c.pos) go('rapid', home[0], 0, c.pos[2]);
      go('rapid', home[0], 0, home[2]);
    };
    if (code === 0x36 || code === 0x37) {                  // centre drilling / tapping on the axis
      for (const ti of tools) {
        const t = p.recs[ti];
        step(ti, tag + ' · ' + (Maz.TOOL_NAMES[t[9]] || 'tool'));
        speeds(t, 0);
        c.cur.css = false; c.cur.spindle = Math.max(0, i32(t, 60)) * c.cspScale * (c.inch ? 12 : 1000) / (Math.PI * Math.max(L(t, 36) || L(r0, 36), 1e-3));
        if (code === 0x37) { c.cur.feedMode = 'rev'; c.cur.feed = L(r0, 56); }
        for (const si of shapes) {
          const s = p.recs[si], z0 = L(s, 40), z1 = L(s, 48);
          step(si, tag + ' · Z ' + +z0.toFixed(4) + ' to ' + +z1.toFixed(4));
          toHome();
          go('rapid', 0, 0, home[2]);
          go('rapid', 0, 0, z0 - CLR);
          // T.DRILL PAT. (manual 7-6-9): #0 drill, feed back out after each peck; #1 deep hole, rapid out after each
          // peck; #2 high speed, back off TC47 at feed; #3 reamer, feed in and out; #4 pecks shorter by DEP-2 each
          // time down to DEP-3, rapid out. DEP-1 is the peck (#4: the first peck).
          const pat = t[15] & 0x7f, pk = L(t, 48), dec = L(t, 52), pmin = L(t, 56), tc47 = c.inch ? 0.04 : 1;
          if (code === 0x36 && pat !== 3 && pk > 0 && pk < z1 - z0) {
            let z = z0, d = pk;
            while (z + d < z1 - 1e-9) {
              z += d;
              go('feed', 0, 0, z);
              if (pat === 2) go('feed', 0, 0, z - tc47);
              else { go(pat === 0 ? 'feed' : 'rapid', 0, 0, z0 - CLR); go('rapid', 0, 0, z - CLR / 4); }
              if (pat === 4) d = Math.max(pmin > 0 ? pmin : d / 4, d - (dec > 0 ? dec : 0));
            }
          }
          go('feed', 0, 0, z1);
          go(code === 0x37 || pat === 3 || pat === 0 ? 'feed' : 'rapid', 0, 0, z0 - CLR);
        }
        toHome();
      }
      return;
    }
    if (code === 0x33) {                                   // facing: passes down the face
      const finZ = Math.max(0, L(r0, 56));
      for (const ti of tools) {
        const t = p.recs[ti], fin = isFinish(t);
        step(ti, tag + ' · ' + (fin ? 'F ' : 'R ') + (Maz.TOOL_NAMES[t[9]] || 'tool'));
        speeds(t, 0);
        for (const si of shapes) {
          const s = p.recs[si], xa = x2r(L(s, 36)), za = L(s, 40), zb = L(s, 48);
          // the face ends at the material's bore (common unit ID), not the centre, when the stock is a tube
          const xb = Math.max(x2r(L(s, 44)), c.stock && c.stock.id > 0 ? c.stock.id / 2 : 0);
          const zFace = zb, zStock = zb - Math.abs(za - zb), dz = L(t, 48);
          step(si, tag + ' · face');
          const zs = fin ? [zFace] : levels(-zStock, -(zFace - finZ), dz).map(v => -v);
          toHome();
          for (const z of zs) {
            go('rapid', Math.max(xa, xb) + CLR, 0, z - CLR);
            go('rapid', Math.max(xa, xb) + CLR, 0, z);
            go('feed', Math.min(xa, xb), 0, z);
            go('rapid', Math.min(xa, xb) + CLR / 2, 0, z - CLR);
          }
        }
        toHome();
      }
      return;
    }
    if (code === 0x34) {                                   // threading: passes of falling depth along the thread
      // LEAD keeps one more decimal than other lengths: read it as the control shows it
      const leadCell = ls[c.u.i].lay ? ls[c.u.i].lay.cells.findIndex((x, j) => Maz.cellLabel(ls[c.u.i].lay, j) === 'LEAD') : -1;
      const hgt = Math.max(L(r0, 40), 0), lead = leadCell >= 0 ? parseFloat(Maz.cellText(ls[c.u.i], leadCell, { units: c.inch ? 'inch' : 'metric' })) || L(r0, 56) : L(r0, 56);
      for (const ti of tools) {
        const t = p.recs[ti];
        step(ti, tag + ' · THREAD');
        speeds(t, 0);
        c.cur.feedMode = 'rev'; c.cur.feed = lead;
        // THREAD PAT. (manual 7-6-7): #0 standard, the same area each pass (depth √(k/N)); #1 the same depth each pass;
        // DEP-2/NUM. passes (at least 3); without it, passes of DEP-1 √k to the height
        const d1 = Math.max(L(t, 48), hgt / 8 || 0.01), num = u16(t, 28), constDepth = (t[15] & 0x7f) === 1;
        for (const si of shapes) {
          const s = p.recs[si], xa = x2r(L(s, 36)), za = L(s, 40), xb = x2r(L(s, 44)), zb = L(s, 48);
          step(si, tag + ' · thread Z ' + +za.toFixed(4) + ' to ' + +zb.toFixed(4));
          toHome();
          const sgn = isIn ? 1 : -1, passes = [];
          if (num >= 1 && num < 200) for (let k = 1; k <= num; k++) passes.push(hgt * (constDepth ? k / num : Math.sqrt(k / num)));
          else for (let k = 1; ; k++) { const dd = Math.min(hgt, d1 * Math.sqrt(k)); passes.push(dd); if (dd >= hgt - 1e-9 || k > 60) break; }
          for (const dd of passes) {
            go('rapid', xa - sgn * CLR, 0, za - CLR * 2);
            go('rapid', xa + sgn * dd, 0, za - CLR * 2);
            go('feed', xb + sgn * dd, 0, zb);
            go('rapid', xb - sgn * CLR, 0, zb);
          }
        }
        toHome();
      }
      return;
    }
    if (code === 0x35) {                                   // grooving: plunges across the groove width
      const width = Math.max(L(r0, 36), 0), count = Math.max(1, u16(r0, 24) || 1), pitchZ = L(r0, 40);
      for (const ti of tools) {
        const t = p.recs[ti], tw = Math.max(L(t, 36) > 0 && L(t, 36) < 1 ? L(t, 36) : 0, c.inch ? 0.06 : 1.5);
        step(ti, tag + ' · ' + (Maz.TOOL_NAMES[t[9]] || 'tool'));
        speeds(t, 0);
        for (const si of shapes) {
          const s = p.recs[si], xa = x2r(L(s, 36)), za = L(s, 40), xb = x2r(L(s, 44));
          const zbRaw = u32(s, 4) & 0x200 ? L(s, 48) : za + Math.max(width, tw) - tw;
          step(si, tag + ' · groove at Z ' + +za.toFixed(4));
          toHome();
          // groove forms #1-#3 leave FINISH on the walls and bottom for the finishing tool line (manual 7-6-8): the
          // roughing tool plunges short of it, the finishing tool goes down one wall, across the bottom, up the other
          const gpat = u16(r0, 22), fin = isFinish(t) && gpat >= 1 && gpat <= 3 && L(r0, 52) > 0, allow = gpat >= 1 && gpat <= 3 ? Math.max(0, L(r0, 52)) : 0;
          const out1 = xa + (isIn ? -CLR : CLR), xin = v => v + (isIn ? -allow : allow);
          // FACE / BACK grooves (manual 7-6-8): the depth runs along Z, SPT-Z on the face to FPT-Z at the bottom, and
          // WIDTH along X from SPT-X toward the axis; the tool plunges in Z
          const partTxt = (() => { const U = ls[c.u.i], k = U.lay ? U.lay.cells.findIndex((x, j) => Maz.cellLabel(U.lay, j) === 'PART') : -1; return k < 0 ? '' : Maz.cellText(U, k, {}).replace(/[*\s]/g, ''); })();
          const faceG = partTxt === 'FCE' || partTxt === 'FACE' || partTxt === 'BAK' || partTxt === 'BACK';
          if (faceG) {
            const SL = ls[si], kz = SL.lay ? SL.lay.cells.findIndex((x, j) => Maz.cellLabel(SL.lay, j) === 'FPT-Z') : -1;
            const zt = kz >= 0 && !Maz.locked(SL, kz) ? Maz.cellText(SL, kz, { units: c.inch ? 'inch' : 'metric' }).trim() : '';
            // the screen shows FPT-Z blank on face grooves (as MazEdit does) while the file keeps the depth there
            // with its entered bit (0x200): use that when the cell gives nothing
            const zFace = za, zBot = /^-?[\d.]+$/.test(zt) ? parseFloat(zt) : u32(s, 4) & 0x200 ? L(s, 48) : null;
            if (zBot === null || Math.abs(zBot - zFace) < 1e-9) c.note(tag + ': a face groove with no FPT-Z (depth): drawn as an outside groove; its depth comes from the control');
            const dirZ = Math.sign((zBot || 0) - zFace), xTop = xa, xEnd = xa - Math.max(width, tw);
            for (let g = 0; g < count && zBot !== null && dirZ; g++) {
              const sh = g * pitchZ;
              if (fin) { go('rapid', xTop, 0, zFace - dirZ * CLR); go('feed', xTop, 0, zBot); go('feed', xTop - Math.max(width, tw) + tw, 0, zBot); go('feed', xTop - Math.max(width, tw) + tw, 0, zFace - dirZ * CLR); continue; }
              for (let x = xTop - allow; x >= xEnd + tw + allow - 1e-9; x -= Math.max(tw * 0.8, 1e-3)) {
                go('rapid', x - sh, 0, zFace - dirZ * CLR);
                go('feed', x - sh, 0, zBot - dirZ * allow);
                go('rapid', x - sh, 0, zFace - dirZ * CLR);
              }
            }
            if (zBot !== null && dirZ) continue;
          }
          for (let g = 0; g < count; g++) {
            const z0 = za + g * pitchZ, z1 = Math.max(z0, zbRaw + g * pitchZ);
            if (fin) {
              go('rapid', out1, 0, z0); go('feed', xb, 0, z0); go('feed', xb, 0, z1); go('feed', out1, 0, z1);
              continue;
            }
            const zA = Math.min(z0 + allow, z1), zB = Math.max(z1 - allow, zA);
            for (let z = zA; z <= zB + 1e-9; z += Math.max(tw * 0.8, 1e-3)) {
              go('rapid', out1, 0, Math.min(z, zB));
              go('feed', xin(xb), 0, Math.min(z, zB));
              go('rapid', out1, 0, Math.min(z, zB));
            }
          }
        }
        toHome();
      }
      return;
    }
    // BAR, CPY and CORNER: the finished shape from the shape lines
    const prof = Plot.turnProfile(p, shapes, L, r0);
    if (prof.pts.length < 2) { for (const i of seqs) step(i, tag + ' · line ' + Maz.number(p.recs[i])); return; }
    const cptX = x2r(L(r0, 36)), cptZ = L(r0, 40), finX = x2r(Math.max(0, L(r0, 52))), finZ = Math.max(0, L(r0, 56));
    const outside = !isIn;
    for (const ti of tools) {
      const t = p.recs[ti], fin = isFinish(t);
      step(ti, tag + ' · ' + (fin ? 'F ' : 'R ') + (Maz.TOOL_NAMES[t[9]] || 'tool') + ' ' + (outside ? 'OUT' : 'IN'));
      speeds(t, 0);
      toHome();
      if (!fin) {
        // roughing: passes along Z at falling (OUT) or rising (IN) X, cutting where the shape (plus allowance) is
        // below the pass (OUT) or above it (IN)
        const d = L(t, 48) > 0 ? L(t, 48) : (c.inch ? 0.08 : 2);
        // PAT. (manual 7-6-3): #0 straight in, square out; #1 pulls out at 45° (high-speed roughing); #3 / #4 as #0 /
        // #1 with the feed stopped every DEP-2 of travel for the chip to break (TC71 spindle turns, taken as 1)
        const bpat = t[15] & 0x7f, diag = bpat === 1 || bpat === 4, brk = (bpat === 3 || bpat === 4) ? L(t, 52) : 0;
        const sh = prof.pts.map(([x, z]) => [x + (outside ? finX : -finX), z]);
        const xs = sh.map(q => q[0]), xLim = outside ? Math.min(...xs) : Math.max(...xs);
        const start = cptX || (outside ? Math.max(...xs) + d : Math.min(...xs) - d);
        const zStart = code === 0x31 ? Math.min(cptZ, sh[0][1]) : cptZ;
        const zEnd = sh[sh.length - 1][1];
        for (let x = start + (outside ? -d : d); outside ? x > xLim + 1e-9 : x < xLim - 1e-9; x += outside ? -d : d) {
          for (const [za, zb] of cutSpans(sh, x, outside, zStart, zEnd)) {
            go('rapid', x + (outside ? CLR : -CLR), 0, za - CLR);
            go('rapid', x, 0, za - CLR);
            if (brk > 0) {
              for (let z = za - CLR + brk; z < zb - 1e-9; z += brk) {
                go('feed', x, 0, z);
                const rpm = c.cur.css ? c.cur.spindle * (c.inch ? 12 : 1000) / (2 * Math.PI * Math.max(x, 1e-3)) : c.cur.spindle;
                c.dwell(rpm > 0 ? 60 / Math.min(rpm, 5000) : 0);
              }
            }
            go('feed', x, 0, zb);
            if (diag) go('feed', x + (outside ? d : -d), 0, zb - d);
            go('rapid', x + (outside ? CLR : -CLR), 0, zb - CLR / 2);
          }
        }
        // last pass along the shape with the allowance left on it
        go('rapid', sh[0][0] + (outside ? CLR : -CLR), 0, sh[0][1] - CLR);
        for (const q of sh) go('feed', q[0], 0, q[1] - (q === sh[0] ? 0 : finZ));
        go('rapid', c.pos[0] + (outside ? CLR : -CLR), 0, c.pos[2]);
      } else {
        // finishing: along the finished shape, line by line
        const q0 = prof.pts[0];
        go('rapid', q0[0] + (outside ? CLR : -CLR), 0, q0[1] - CLR);
        go('feed', q0[0], 0, q0[1] - CLR / 2);
        let last = -1;
        const fr0 = c.cur.feed;
        prof.pts.forEach((q, k) => {
          const rec = prof.recs[Math.max(0, k - 1)];
          if (k && rec !== last) {
            last = rec; step(rec, tag + ' · F · shape line ' + Maz.number(p.recs[rec]));
            // a shape line's RGH given as a feed is the finishing feed for that element (manual 7-6-3 [9])
            const rf = rghFeed(ls[rec], c.inch);
            c.cur.feed = rf > 0 ? rf : fr0;
          }
          go('feed', q[0], 0, q[1]);
        });
        c.cur.feed = fr0;
        go('rapid', c.pos[0] + (outside ? CLR : -CLR), 0, c.pos[2]);
      }
      toHome();
    }
  }
  // Milling units on a lathe, drawn in the turning view (X radius, Z) (manual 7-3, 7-4): MODE says where the cut is.
  // XC / [XC] on the face: holes along Z at radius R (or x, y); ZC / ZY on the diameter: holes in X at Z; line
  // milling along the shape's Z at its C angle, DEP-Z a pass, down through SRV-Z. Milling spindle in rpm from C-SP.
  function turnMill(c) {
    const { p, ls, u, r0, code, seqs, L, CLR, step, go, tag, speeds, home } = c;
    const cell = (L1, name) => { const k = L1.lay ? L1.lay.cells.findIndex((x, j) => Maz.cellLabel(L1.lay, j) === name) : -1; return k < 0 ? '' : Maz.cellText(L1, k, { units: c.inch ? 'inch' : 'metric' }).trim(); };
    const mode = cell(ls[u.i], 'MODE').replace(/[[\]]/g, ''), face = /^X/.test(mode);
    const tools = seqs.filter(i => ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5), shapes = seqs.filter(i => !(ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5) && ls[i].lay && p.recs[i][0] < 0xd0);
    const rpmOf = (t, dia) => { speeds(t, dia); const csp = c.cur.spindle; c.cur.css = false; c.cur.spindle = dia > 0 ? csp * (c.inch ? 12 : 1000) / (Math.PI * dia) : 0; c.cur.feedMode = 'min'; c.cur.feed *= c.cur.spindle; };
    const toHome = () => { if (c.pos) go('rapid', home[0], 0, c.pos[2]); go('rapid', home[0], 0, home[2]); };
    if (code < 0x40) {                                   // holes
      const holes = [];
      for (const si of shapes) {
        const L1 = ls[si], rx = cell(L1, 'SPT-R/x'), zt = parseFloat(cell(L1, 'SPT-Z')) || 0, n = Math.max(1, parseInt(cell(L1, 'M')) || 1);
        let r = parseFloat(rx.replace(/^[A-Za-z]/, '')) || 0;
        if (/^x/i.test(rx)) r = Math.hypot(r, parseFloat(cell(L1, 'SPT-C/y').replace(/^[A-Za-z]/, '')) || 0);
        const rr = !face ? (parseFloat(cell(L1, 'SPT-R')) || r) : r;
        for (let k = 0; k < n; k++) holes.push({ si, r: rr, z: zt });
      }
      for (const ti of tools) {
        const t = p.recs[ti], isTapT = /TAP/.test(Maz.TOOL_NAMES[t[9]] || ''), dia = isTapT ? L(t, 40) : (L(t, 36) || L(t, 40)), dep = Math.max(L(t, 44), 0);   // a tap's NOM is its thread name: HOLE-D
        step(ti, tag + ' · ' + (Maz.TOOL_NAMES[t[9]] || 'tool') + ' · ' + (mode || 'XC'));
        rpmOf(t, dia);
        const isTap = /TAP/.test(Maz.TOOL_NAMES[t[9]] || ''), planet = isTap && t[14] === 2;
        // CIRC MIL: the tool's HOLE-D against its own diameter gives the circle; PITCH2 (else PITCH1) of the unit the helix pitch
        const hd = L(t, 40), hr = code === 0x26 && hd > dia ? (hd - dia) / 2 : 0, circ = (code === 0x26 && (r0[13] & 1)) ? (L(r0, 52) > 0 ? L(r0, 52) : L(r0, 48)) : 0;
        if (isTap) { c.cur.feed = L(t, 64) * c.cur.spindle; }
        const pk = isTap ? 0 : Math.max(L(t, 56), 0);
        let last = -1;
        toHome();
        for (const h of holes) {
          if (h.si !== last) { last = h.si; step(h.si, tag + ' · hole line ' + Maz.number(p.recs[h.si])); }
          // face: along +Z into the part from the surface Z; diameter: radially in from the surface radius
          const a0 = face ? h.z - CLR : h.r + CLR, a1 = face ? h.z + dep : h.r - dep, dir = face ? 1 : -1;
          const at = v => go('feed', face ? h.r : v, 0, face ? v : h.z);
          if (face) { go('rapid', h.r, 0, home[2]); go('rapid', h.r, 0, a0); } else { go('rapid', home[0], 0, h.z); go('rapid', a0, 0, h.z); }
          // after each peck the drill goes out to the clearance and back in at rapid to just above the last depth (as the milling
          // side does); only the new peck is cut at the feed. The control's 71 s for 1.2 deep with 0.08 pecks needs this.
          const back = v => go('rapid', face ? h.r : v, 0, face ? v : h.z);
          let prev = a0;
          if (pk > 0 && pk < dep) for (let v = a0 + dir * (CLR + pk); dir * (a1 - v) > 1e-9; v += dir * pk) {
            at(v); if (face) go('rapid', h.r, 0, a0); else go('rapid', a0, 0, h.z);
            prev = v; back(v - dir * CLR / 4);
          }
          if (circ > 0 && hr > 0) {                      // circular milling: helix at PITCH2 (else one turn) round the hole wall, then one full circle
            const turn = (v0, v1, n) => { for (let k = 1; k <= n; k++) { const a = 2 * Math.PI * k / 36, v = v0 + (v1 - v0) * k / n; go('feed', face ? h.r + hr * Math.cos(a) : v, face ? hr * Math.sin(a) : hr * Math.sin(a), face ? v : h.z + hr * Math.cos(a)); } };
            const span = Math.abs(a1 - a0), turns = Math.max(1, Math.ceil(span / circ - 1e-9));
            turn(a0, a1, 36 * turns);
            turn(a1, a1, 36);
            if (face) go('rapid', h.r, 0, a0); else go('rapid', a0, 0, h.z);
            continue;
          }
          at(a1);
          if (planet) {                                  // planetary tap: in at the pre-hole feed, one thread orbit at pitch x rpm, out at rapid
            const f0 = c.cur.feed, ph = Math.max(L(t, 40), 0), orbit = Math.max(ph * 0.15, 0) / 2;
            c.cur.feed = (Math.max(L(t, 56), 0) || 0.02) * c.cur.spindle;
            for (let k = 1; k <= 36; k++) { const a = 2 * Math.PI * k / 36; go('feed', (face ? h.r : a1) + (face ? orbit * Math.cos(a) : 0), orbit * Math.sin(a), face ? a1 : h.z + orbit * Math.cos(a)); }
            c.cur.feed = f0;
            if (face) go('rapid', h.r, 0, a0); else go('rapid', a0, 0, h.z);
            continue;
          }
          if (face) go(isTap ? 'feed' : 'rapid', h.r, 0, a0); else go(isTap ? 'feed' : 'rapid', a0, 0, h.z);
        }
        toHome();
      }
      return;
    }
    // line milling along Z on the diameter at C, or across the face
    const srv = Math.max(L(r0, 40), 0);
    const num = s => parseFloat(String(s).replace(/^[A-Za-z]/, '')) || 0;
    if (face) {
      // on the face (XC: X is the radius at C; XY: x, y): passes at SHIFT-Z into the face over the radii the shape
      // spans, drawn in the turning view as a line across the radius
      let zf = 0, rmin = Infinity, rmax = -Infinity;
      for (const i of shapes) {
        const L1 = ls[i], sz = cell(L1, 'SHIFT-Z');
        if (sz !== '' && zf === 0) zf = num(sz);
        const cx = cell(L1, 'P1X/CX'), rr = cell(L1, 'P3X/R');
        if (cx !== '' || rr !== '') {                  // square or circle pattern: centre and radius, or two corners
          const c0 = Math.hypot(num(cx), /XY/.test(mode) ? num(cell(L1, 'P1Y/CY')) : 0), rad = num(rr);
          rmin = Math.min(rmin, Math.max(0, c0 - rad)); rmax = Math.max(rmax, c0 + rad);
          continue;
        }
        const x = cell(L1, 'X');
        if (x === '') continue;
        const r = /XY/.test(mode) ? Math.hypot(num(x), num(cell(L1, 'Y'))) : Math.abs(num(x));
        rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
      }
      for (const ti of tools) {
        const t = p.recs[ti], dia = L(t, 36), depZ = Math.max(L(t, 48), 0);
        step(ti, tag + ' · ' + (Maz.TOOL_NAMES[t[9]] || 'tool') + ' · ' + mode);
        rpmOf(t, dia);
        toHome();
        if (!(rmax >= rmin)) continue;
        const passes = depZ > 0 && srv > 0 ? Math.ceil(srv / depZ - 1e-9) : 1;
        go('rapid', rmax + CLR, 0, zf - CLR);
        for (let k = 1; k <= passes; k++) {
          const z = zf + Math.min(srv, k * (srv > 0 ? srv / passes : 0));
          go('feed', rmax, 0, z);
          if (k === passes) for (const i of shapes) step(i, tag + ' · shape line ' + Maz.number(p.recs[i]));
          go('feed', rmin, 0, z); go('rapid', rmin, 0, zf - CLR); go('rapid', rmax, 0, zf - CLR);
        }
        toHome();
      }
      return;
    }
    const pts = shapes.map(i => ({ i, z: num(cell(ls[i], 'Z')) })).filter(q => isFinite(q.z));
    for (const ti of tools) {
      const t = p.recs[ti], dia = L(t, 36), depZ = Math.max(L(t, 48), 0), ax = L(t, 40);
      step(ti, tag + ' · ' + (Maz.TOOL_NAMES[t[9]] || 'tool') + ' · ' + (mode || 'XC'));
      rpmOf(t, dia);
      const r0x = ax > 0 ? ax / 2 : home[0], passes = depZ > 0 && srv > 0 ? Math.ceil(srv / depZ - 1e-9) : 1;
      toHome();
      if (pts.length < 2) continue;
      for (let k = 1; k <= passes; k++) {
        const r = r0x - Math.min(srv, k * (srv > 0 ? srv / passes : 0));
        go('rapid', r0x + CLR, 0, pts[0].z); go('feed', r, 0, pts[0].z);
        for (let j = 1; j < pts.length; j++) { if (k === passes) step(pts[j].i, tag + ' · shape line ' + Maz.number(p.recs[pts[j].i])); go('feed', r, 0, pts[j].z); }
        go('rapid', r0x + CLR, 0, pts[pts.length - 1].z);
      }
      toHome();
    }
  }
  // a turning shape line's RGH as a feed per revolution (0 when it is a roughness code or blank)
  function rghFeed(L, inch) {
    if (!L || !L.lay) return 0;
    const k = L.lay.cells.findIndex((c, j) => Maz.cellLabel(L.lay, j) === 'RGH');
    if (k < 0 || Maz.locked(L, k)) return 0;
    const t = Maz.cellText(L, k, { units: inch ? 'inch' : 'metric' }).trim();
    return /^[\d.]+$/.test(t) ? parseFloat(t) : 0;
  }
  // the Z spans of a roughing pass at X = x: where the shape is below x (outside) or above it (inside)
  function cutSpans(sh, x, outside, zStart, zEnd) {
    const below = q => (outside ? q[0] < x - 1e-9 : q[0] > x + 1e-9);
    const zs = [];
    for (let k = 1; k < sh.length; k++) {
      const a = sh[k - 1], b = sh[k];
      if ((a[0] - x) * (b[0] - x) < 0) zs.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
      else if (a[0] === x && b[0] !== x) zs.push(a[1]);
    }
    // cut from the start of the region to the first crossing, then between crossings where the shape is below
    const pts = [zStart].concat(zs.filter(z => z > zStart + 1e-9 && z < zEnd - 1e-9).sort((p, q) => p - q), [zEnd]);
    const spans = [];
    const xAt = z => {
      for (let k = 1; k < sh.length; k++) { const a = sh[k - 1], b = sh[k]; if ((a[1] - z) * (b[1] - z) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]); }
      return z < sh[0][1] ? (outside ? -Infinity : Infinity) : sh[sh.length - 1][0];
    };
    for (let k = 1; k < pts.length; k++) {
      const zm = (pts[k - 1] + pts[k]) / 2, xm = xAt(zm);
      if (outside ? xm < x : xm > x) {
        if (spans.length && Math.abs(spans[spans.length - 1][1] - pts[k - 1]) < 1e-9) spans[spans.length - 1][1] = pts[k];
        else spans.push([pts[k - 1], pts[k]]);
      }
    }
    return spans;
  }
  const api = { program, offset, fitting, scan, zigzag, levels, cutSpans, MMS_BY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Paths = api;
})(this);
