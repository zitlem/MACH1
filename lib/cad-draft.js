// Drafting for the CAD app: notes and dimensions, drawn with a small single-stroke font so they are plain lines on
// the screen and in DXF, SVG and PDF. Inch, radians. Works in the browser (window.CADDraft, after CADGeom) and in
// Node (require('./lib/cad-draft.js')).
//
//   {t: 'text', p: [x, y], s: 'NOTE', h: 0.125, a: 0}                  left end of the baseline, height, angle
//   {t: 'dim', kind: 'h' | 'v' | 'al', p1, p2, at, dec, h, s}          linear: the two points, where the line goes
//   {t: 'dim', kind: 'rad' | 'dia', c, r, at, dec, h, s}               to an arc or circle, the text at 'at'
//   {t: 'dim', kind: 'ang', c, a1, a2, r, dec, h, s}                   between two directions from c, the arc at r
//   {t: 'dim', kind: 'ordx' | 'ordy', o, p, at, dec, h, s}             ordinate: p's X (or Y) from the datum o
//   {t: 'dim', kind: 'lead', pts: [tip, ...], s, h}                    a leader: an arrow at the tip, a shelf, the text
//   {t: 'hatch', loops: [[geometry...]...], ang, sp, pat}              lines at ang, sp apart, inside the loops (a loop
//                                                                       inside another is a hole); pat 'cross': both ways
// s, when given, replaces the measured text (<> in it stands for the measurement).
(function (root) {
  'use strict';
  const G = root.CADGeom || (typeof require !== 'undefined' ? require('./cad-geom.js') : null);
  const PI = Math.PI;

  // ---------------------------------------------------------------- the font
  // each glyph: strokes of points on a grid 0..4 wide, 0..6 tall (baseline 0, cap height 6), and its advance
  const F = {
    '0': [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[0, 1], [4, 5]]],
    '1': [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
    '2': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
    '3': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
    '4': [[[3, 0], [3, 6], [0, 2], [4, 2]]],
    '5': [[[4, 6], [0, 6], [0, 3.5], [3, 3.5], [4, 2.5], [4, 1], [3, 0], [1, 0], [0, 1]]],
    '6': [[[3.5, 6], [1.5, 6], [0, 4], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
    '7': [[[0, 6], [4, 6], [1.5, 0]]],
    '8': [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
    '9': [[[4, 2.5], [1, 2.5], [0, 3.5], [0, 5], [1, 6], [3, 6], [4, 5], [4, 2], [2.5, 0], [0.5, 0]]],
    '.': [[[1.8, 0], [2.2, 0], [2.2, 0.4], [1.8, 0.4], [1.8, 0]]],
    ',': [[[2.2, 0.4], [2.2, 0], [1.5, -1]]],
    '-': [[[0.5, 3], [3.5, 3]]],
    '+': [[[0.5, 3], [3.5, 3]], [[2, 1.5], [2, 4.5]]],
    '=': [[[0.5, 2], [3.5, 2]], [[0.5, 4], [3.5, 4]]],
    '/': [[[0, 0], [4, 6]]],
    '(': [[[3, 6.5], [1.5, 5], [1.5, 1], [3, -0.5]]],
    ')': [[[1, 6.5], [2.5, 5], [2.5, 1], [1, -0.5]]],
    ':': [[[2, 1], [2, 1.4]], [[2, 4], [2, 4.4]]],
    '°': [[[1.5, 6], [2.5, 6], [3, 5.5], [3, 4.5], [2.5, 4], [1.5, 4], [1, 4.5], [1, 5.5], [1.5, 6]]],
    'Ø': [[[1, 0.5], [3, 0.5], [4, 1.5], [4, 4.5], [3, 5.5], [1, 5.5], [0, 4.5], [0, 1.5], [1, 0.5]], [[0, -0.5], [4, 6.5]]],
    '±': [[[0.5, 3.5], [3.5, 3.5]], [[2, 2], [2, 5]], [[0.5, 0.5], [3.5, 0.5]]],
    '"': [[[1.5, 6], [1.5, 4.5]], [[2.5, 6], [2.5, 4.5]]],
    "'": [[[2, 6], [2, 4.5]]],
    '#': [[[1, 0], [1.5, 6]], [[2.5, 0], [3, 6]], [[0, 2], [4, 2]], [[0, 4], [4, 4]]],
    '%': [[[0, 0], [4, 6]], [[0.5, 6], [1, 5.5], [0.5, 5], [0, 5.5], [0.5, 6]], [[3.5, 1], [4, 0.5], [3.5, 0], [3, 0.5], [3.5, 1]]],
    '<': [[[3.5, 5], [0.5, 3], [3.5, 1]]],
    '>': [[[0.5, 5], [3.5, 3], [0.5, 1]]],
    'A': [[[0, 0], [2, 6], [4, 0]], [[0.7, 2], [3.3, 2]]],
    'B': [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
    'C': [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
    'D': [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
    'E': [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
    'F': [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
    'G': [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
    'H': [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    'I': [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
    'J': [[[3, 6], [3, 1], [2, 0], [1, 0], [0, 1]]],
    'K': [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1.3, 3.3], [4, 0]]],
    'L': [[[0, 6], [0, 0], [4, 0]]],
    'M': [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
    'N': [[[0, 0], [0, 6], [4, 0], [4, 6]]],
    'O': [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
    'P': [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
    'Q': [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.5, 1.5], [4, 0]]],
    'R': [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
    'S': [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
    'T': [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
    'U': [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
    'V': [[[0, 6], [2, 0], [4, 6]]],
    'W': [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
    'X': [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
    'Y': [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
    'Z': [[[0, 6], [4, 6], [0, 0], [4, 0]]],
    '?': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [2, 2.5], [2, 1.5]], [[2, 0.2], [2, 0]]],
  };
  // lower case is drawn as small capitals
  const ADV = 5.2;
  function glyphs(ch) { return F[ch] || F[ch.toUpperCase()] && F[ch.toUpperCase()].map(s => s.map(p => [p[0], p[1] * (ch === ch.toUpperCase() ? 1 : 0.75)])) || (ch === ' ' ? [] : F['?']); }
  // a string as polylines: from p (left end of the baseline), h tall, at angle a
  function textStrokes(s, p, h, a, align) {
    const k = h / 6, co = Math.cos(a || 0), si = Math.sin(a || 0), w = textWidth(s, h);
    const dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0, out = [];
    let x = 0;
    for (const ch of String(s)) {
      for (const st of glyphs(ch)) out.push(st.map(q => { const u = (x + q[0]) * k + dx, v = q[1] * k; return [p[0] + u * co - v * si, p[1] + u * si + v * co]; }));
      x += ADV;
    }
    return out;
  }
  const textWidth = (s, h) => Math.max(0, String(s).length * ADV - (ADV - 4)) * h / 6;

  // ---------------------------------------------------------------- dimensions
  const fmtV = (v, dec) => { const s = (+v).toFixed(dec === undefined ? 3 : dec); return s; };
  // the measurement as text (with its R or Ø); typed text replaces it, with <> standing for the measurement
  const label = (d, v, pre) => { const m = (pre || '') + fmtV(v, d.dec); return d.s ? String(d.s).replace('<>', m) : m; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], addv = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
  const len = a => Math.hypot(a[0], a[1]), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  // an arrowhead at p pointing along u (unit), size s
  const arrow = (p, u, s) => { const n = [-u[1], u[0]], b = sub(p, mul(u, s)); return [[addv(b, mul(n, s * 0.3)), p, sub(b, mul(n, s * 0.3))]]; };
  // what the dimension measures
  function value(d) {
    if (d.kind === 'h') return Math.abs(d.p2[0] - d.p1[0]);
    if (d.kind === 'v') return Math.abs(d.p2[1] - d.p1[1]);
    if (d.kind === 'al') return G.dist(d.p1, d.p2);
    if (d.kind === 'rad') return d.r;
    if (d.kind === 'dia') return 2 * d.r;
    if (d.kind === 'ang') { let a = d.a2 - d.a1; if (a < 0 || a > 2 * PI) a = G.norm2pi(a); return a * 180 / PI; }
    if (d.kind === 'ordx') return d.p[0] - d.o[0];
    if (d.kind === 'ordy') return d.p[1] - d.o[1];
    return 0;
  }
  // the dimension as polylines (extension lines, dimension line, arrows) and its text: {lines, texts}
  function dimParts(d) {
    const h = d.h || 0.125, ar = h * 1.1, gap = h * 0.5, out = [], texts = [];
    const text = (s, p, a, align) => texts.push({ t: 'text', s, p, h, a, align });
    if (d.kind === 'h' || d.kind === 'v' || d.kind === 'al') {
      const dir = d.kind === 'h' ? [1, 0] : d.kind === 'v' ? [0, 1] : unit(sub(d.p2, d.p1)), n = [-dir[1], dir[0]];
      const off = (p) => (d.at[0] - p[0]) * n[0] + (d.at[1] - p[1]) * n[1];
      const q1 = addv(d.p1, mul(n, off(d.p1))), q2 = addv(d.p2, mul(n, off(d.p2)));
      const sg = o => Math.sign(o) || 1;
      out.push([addv(d.p1, mul(n, sg(off(d.p1)) * gap * 0.5)), addv(q1, mul(n, sg(off(d.p1)) * gap))]);
      out.push([addv(d.p2, mul(n, sg(off(d.p2)) * gap * 0.5)), addv(q2, mul(n, sg(off(d.p2)) * gap))]);
      const u = unit(sub(q2, q1)), txt = label(d, value(d));
      // the text over the middle of the line, upright as far as it can be
      let a = Math.atan2(u[1], u[0]); if (a > PI / 2 + 1e-9 || a < -PI / 2 + 1e-9) a += PI;
      const mid = mul(addv(q1, q2), 0.5), up = [-Math.sin(a), Math.cos(a)];
      out.push([q1, q2]); out.push(...arrow(q1, mul(u, -1), ar), ...arrow(q2, u, ar));
      text(txt, addv(mid, mul(up, gap * 0.6)), a, 'center');
      return { lines: out, texts };
    }
    if (d.kind === 'rad' || d.kind === 'dia') {
      const u = unit(sub(d.at, d.c)), edge = addv(d.c, mul(u, d.r)), txt = label(d, value(d), d.kind === 'rad' ? 'R' : 'Ø');
      if (d.kind === 'dia') { const far = sub(d.c, mul(u, d.r)); out.push([far, d.at]); out.push(...arrow(far, mul(u, -1), ar)); }
      else out.push([d.c, d.at]);
      out.push(...arrow(edge, u, ar));
      const right = d.at[0] >= d.c[0], shelf = addv(d.at, [right ? h * 1.2 : -h * 1.2, 0]);
      out.push([d.at, shelf]);
      text(txt, addv(shelf, [right ? gap * 0.5 : -gap * 0.5, -h / 2]), 0, right ? 'left' : 'right');
      return { lines: out, texts };
    }
    if (d.kind === 'ang') {
      const sw = G.norm2pi(d.a2 - d.a1);
      const arc = G.arc(d.c, d.r, d.a1, sw), pts = G.flatten(arc, 0.0005);
      out.push(pts);
      const t1 = [-Math.sin(d.a1), Math.cos(d.a1)], t2 = [-Math.sin(d.a2), Math.cos(d.a2)];
      out.push(...arrow(G.start(arc), mul(t1, -1), ar), ...arrow(G.end(arc), t2, ar));
      const mid = G.mid(arc), am = d.a1 + sw / 2, txt = label(d, value(d)) + '°';
      text(txt, addv(mid, [Math.cos(am) * gap, Math.sin(am) * gap]), 0, Math.cos(am) >= 0 ? 'left' : 'right');
      return { lines: out, texts };
    }
    if (d.kind === 'ordx' || d.kind === 'ordy') {
      // a leader from the point square to the axis measured, with a jog when the text is set aside, then the value
      const x = d.kind === 'ordx', k = x ? 1 : 0, j = 1 - k, sg = Math.sign(d.at[k] - d.p[k]) || 1, txt = label(d, value(d));
      const P = (along, across) => { const q = [0, 0]; q[k] = along; q[j] = across; return q; };
      const start = P(d.p[k] + sg * gap * 0.5, d.p[j]), end = d.at;
      if (Math.abs(d.at[j] - d.p[j]) < 1e-9 || Math.abs(d.at[k] - d.p[k]) < 4 * h) out.push([start, end]);
      else { const b1 = P(d.at[k] - sg * 3 * h, d.p[j]), b2 = P(d.at[k] - sg * 1.5 * h, d.at[j]); out.push([start, b1, b2, end]); }
      const a = x ? PI / 2 : 0, flip = sg < 0;
      text(txt, addv(end, mul(x ? [0, 1] : [1, 0], sg * gap * 0.5)).map((v, i) => v + (i === j ? (x ? h / 2 : -h / 2) : 0)), a, flip ? 'right' : 'left');
      return { lines: out, texts };
    }
    if (d.kind === 'lead') {
      const P = d.pts || []; if (P.length < 2) return { lines: out, texts };
      out.push(P.map(p => p.slice())); out.push(...arrow(P[0], unit(sub(P[0], P[1])), ar));
      const end = P[P.length - 1], right = end[0] >= P[P.length - 2][0], shelf = addv(end, [right ? h * 1.2 : -h * 1.2, 0]);
      out.push([end, shelf]);
      if (d.s) text(String(d.s), addv(shelf, [right ? gap * 0.5 : -gap * 0.5, -h / 2]), 0, right ? 'left' : 'right');
      return { lines: out, texts };
    }
    return { lines: out, texts };
  }
  // ---------------------------------------------------------------- hatching
  // The lines of a hatch: scan lines at multiples of the spacing (so hatches side by side line up), cut where they
  // cross the loops and kept between alternate crossings, so a loop inside another stays open. At most MAXH lines.
  const MAXH = 50000;
  function hatchLines(g) {
    const sp = +g.sp, out = []; if (!(sp > 0)) return out;
    const polys = (g.loops || []).map(L => { const pts = []; for (const e of L) { const f = G.flatten(e, 0.0005); for (let i = pts.length ? 1 : 0; i < f.length; i++) pts.push(f[i]); } return pts; }).filter(P => P.length > 2);
    for (const a of g.pat === 'cross' ? [g.ang || 0, (g.ang || 0) + PI / 2] : [g.ang || 0]) {
      const c = Math.cos(a), s = Math.sin(a), rot = p => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c], back = p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
      const R = polys.map(P => P.map(rot)); let y0 = Infinity, y1 = -Infinity; for (const P of R) for (const p of P) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      if (!isFinite(y0)) continue;
      for (let k = Math.ceil(y0 / sp); k * sp <= y1; k++) {
        const y = k * sp, xs = [];
        for (const P of R) for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; if ((p[1] <= y) !== (q[1] <= y)) xs.push(p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0])); }
        xs.sort((u, v) => u - v);
        for (let i = 0; i + 1 < xs.length; i += 2) { if (xs[i + 1] - xs[i] < 1e-9) continue; out.push([back([xs[i], y]), back([xs[i + 1], y])]); if (out.length >= MAXH) return out; }
      }
    }
    return out;
  }
  function dimStrokes(d) { const r = dimParts(d); return r.lines.concat(...r.texts.map(t => textStrokes(t.s, t.p, t.h, t.a, t.align))); }
  // any drafting entity as polylines
  function strokes(g) {
    if (g.t === 'text') return textStrokes(g.s, g.p, g.h || 0.125, g.a || 0, g.align);
    if (g.t === 'dim') return dimStrokes(g);
    if (g.t === 'hatch') return hatchLines(g);
    return [];
  }
  const isAnno = g => g && (g.t === 'text' || g.t === 'dim' || g.t === 'hatch');
  function bbox(g) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    if (g.t === 'hatch') { for (const L of g.loops || []) for (const e of L) { const q = G.bbox(e); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); } return b; }
    for (const P of strokes(g)) for (const p of P) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
    return b;
  }
  // a 2D matrix applied (moves, turns, mirrors and scales)
  function transform(g, m) {
    const T = p => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]], k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])), rot = Math.atan2(m[1], m[0]);
    const o = JSON.parse(JSON.stringify(g));
    for (const key of ['p', 'p1', 'p2', 'at', 'c', 'o']) if (o[key]) o[key] = T(o[key]);
    if (o.pts) o.pts = o.pts.map(T);
    if (o.t === 'hatch') { o.loops = g.loops.map(L => L.map(e => G.transform(e, m))); const a = g.ang || 0; o.ang = Math.atan2(m[1] * Math.cos(a) + m[3] * Math.sin(a), m[0] * Math.cos(a) + m[2] * Math.sin(a)); o.sp = g.sp * k; return o; }
    if (o.h) o.h *= k; if (o.r) o.r *= k;
    if (o.t === 'text') o.a = (o.a || 0) + rot;
    if (o.kind === 'ang') { const flip = m[0] * m[3] - m[1] * m[2] < 0; const a1 = Math.atan2(m[1] * Math.cos(g.a1) + m[3] * Math.sin(g.a1), m[0] * Math.cos(g.a1) + m[2] * Math.sin(g.a1)), a2 = Math.atan2(m[1] * Math.cos(g.a2) + m[3] * Math.sin(g.a2), m[0] * Math.cos(g.a2) + m[2] * Math.sin(g.a2)); o.a1 = flip ? a2 : a1; o.a2 = flip ? a1 : a2; }
    if (o.kind === 'h' || o.kind === 'v') { if (Math.abs(Math.sin(rot)) > 1e-9) o.kind = 'al'; }
    return o;
  }
  const api = { textStrokes, textWidth, strokes, dimStrokes, dimParts, hatchLines, MAXH, value, label, bbox, transform, isAnno, FONT: F };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CADDraft = api;
})(this);
