// Exact 2D geometry for the CAD app: points, lines, arcs (circles are full arcs) and NURBS splines in a plane, kept
// exact rather than as polylines. Intersections, nearest points, splitting, trimming and extending, fillets and
// chamfers between entities, offsets, chaining, areas and transforms, and the way to and from lib/cad.js shapes.
// Inch, radians. Works in the browser (window.CADGeom) and in Node (require('./lib/cad-geom.js')).
//
//   {t:'pt', p:[x,y]}
//   {t:'line', a:[x,y], b:[x,y]}
//   {t:'arc', c:[x,y], r, a0, sw}            start angle a0, signed sweep sw (+ counter-clockwise); a circle has |sw| = 2π
//   {t:'spline', deg, kn:[...], cp:[[x,y]...], w:[...] | null}    clamped NURBS
//   {t:'xline', p:[x,y], d:[ux,uy], ray?: true}  an endless construction line through p along d (a ray: from p on)
//
// A parameter t runs 0 → 1 along every entity. Functions return new entities; the ones passed in are not changed.
// An endless line goes through the maths as a stand-in: a line XL inches either way of p (a ray: from p), its t
// running along that. A result that reaches a stand-in's far end runs on for ever again: trimming an endless line
// once gives a ray, and twice a plain line.
(function (root) {
  'use strict';
  const PI = Math.PI, TAU = 2 * PI, EPS = 1e-9, TOL = 1e-6;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1], cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = a => Math.hypot(a[0], a[1]), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const unit = a => { const l = len(a); return l > EPS ? [a[0] / l, a[1] / l] : [1, 0]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const same = (a, b, tol) => dist(a, b) <= (tol || TOL);
  const norm2pi = a => { a %= TAU; return a < 0 ? a + TAU : a; };
  // the counter-clockwise sweep from one angle to another, in (0, 2π] (equal angles: a full turn); NaN for numbers that
  // are not finite. Modulo, not a loop: a loop adding 2π never ends for a huge or infinite angle in a damaged file
  const sweepCCW = d => { const s = norm2pi(d); return s > 1e-12 ? s : s === s ? TAU : NaN; };
  // every number in an entity finite and within a billion inches: anything else is a damaged file
  const sane = e => { const ok = v => typeof v === 'number' ? isFinite(v) && Math.abs(v) < 1e9 : Array.isArray(v) ? v.every(ok) : v && typeof v === 'object' ? Object.values(v).every(ok) : true; return ok(e); };
  // the most points one entity is drawn with (a huge circle would otherwise need millions)
  const MAXPTS = 4096;
  const polar = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];

  // notes, dimensions and hatches (lib/cad-draft.js) are entities too, for drawing, boxes and moving; they take no part
  // in intersections, trims or chains
  const isAnno = e => e && (e.t === 'text' || e.t === 'dim' || e.t === 'hatch');
  const isCurve = e => e && (e.t === 'line' || e.t === 'arc' || e.t === 'spline');
  const isXL = e => e && e.t === 'xline';
  // what can be crossed, trimmed and broken: curves and endless lines (chains take curves only)
  const isWire = e => isCurve(e) || isXL(e);
  const draft = () => root.CADDraft || (typeof require !== 'undefined' ? require('./cad-draft.js') : null);

  // ---------------------------------------------------------------- making entities
  const pt = p => ({ t: 'pt', p: [p[0], p[1]] });
  const line = (a, b) => ({ t: 'line', a: [a[0], a[1]], b: [b[0], b[1]] });
  const arc = (c, r, a0, sw) => ({ t: 'arc', c: [c[0], c[1]], r, a0, sw });
  const circle = (c, r) => arc(c, r, 0, TAU);
  const xline = (p, d, ray) => { const o = { t: 'xline', p: [p[0], p[1]], d: unit(d) }; if (ray) o.ray = true; return o; };
  const XL = 1e6;
  const proxy = e => isXL(e) ? line(e.ray ? e.p : sub(e.p, mul(e.d, XL)), add(e.p, mul(e.d, XL))) : e;
  // a line cut from src's stand-in, as what it is: an end at the stand-in's far end runs on for ever
  function unproxy(g, src) {
    if (!isXL(src) || !g || g.t !== 'line') return g;
    const P = proxy(src), far = q => same(q, P.b, 1e-6) || (!src.ray && same(q, P.a, 1e-6)), oa = far(g.a), ob = far(g.b);
    if (oa && ob) return xline(src.p, src.d);
    if (ob) return xline(g.a, sub(g.b, g.a), true);
    if (oa) return xline(g.b, sub(g.a, g.b), true);
    return g;
  }
  const isCircle = e => e.t === 'arc' && Math.abs(Math.abs(e.sw) - TAU) < 1e-9;
  // arc from a to b round centre c, counter-clockwise or not
  function arcCenter(c, a, b, ccw) {
    const r = dist(c, a), a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    let sw = ccw ? norm2pi(a1 - a0) : -norm2pi(a0 - a1);
    if (Math.abs(sw) < 1e-12) sw = ccw ? TAU : -TAU;
    return arc(c, r, a0, sw);
  }
  // arc through three points (a to c by way of b); null when they are in a line
  function arc3(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-12) return null;
    const a2 = dot(a, a), b2 = dot(b, b), c2 = dot(c, c);
    const o = [(a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d];
    return arcCenter(o, a, c, cross(sub(b, a), sub(c, b)) > 0);
  }
  // circle through three points
  function circle3(a, b, c) { const e = arc3(a, b, c); return e ? circle(e.c, e.r) : null; }
  // arc from a to b of radius r (the short way unless big), counter-clockwise or not
  function arcRadius(a, b, r, ccw, big) {
    const ch = dist(a, b); if (ch < EPS || r < ch / 2 - 1e-9) return null;
    const h = Math.sqrt(Math.max(0, r * r - ch * ch / 4)), m = lerp(a, b, 0.5), u = unit(sub(b, a)), n = [-u[1], u[0]];
    const s = (ccw ? 1 : -1) * (big ? -1 : 1);
    return arcCenter(add(m, mul(n, h * s)), a, b, ccw);
  }
  // arc leaving a in direction d (unit) and ending at b; null when b is straight ahead
  function arcTangent(a, d, b) {
    const v = sub(b, a), nl = [-d[1], d[0]], h = dot(v, nl);
    if (Math.abs(h) < 1e-12) return null;
    const r = dot(v, v) / (2 * h), c = add(a, mul(nl, r));
    return arcCenter(c, a, b, r > 0);
  }

  // ---------------------------------------------------------------- NURBS
  const spDomain = s => [s.kn[s.deg], s.kn[s.cp.length]];
  const spU = (s, t) => { const [u0, u1] = spDomain(s); return u0 + (u1 - u0) * Math.min(1, Math.max(0, t)); };
  function spSpan(s, u) {
    const n = s.cp.length - 1, p = s.deg, U = s.kn;
    if (u >= U[n + 1]) return n;
    if (u <= U[p]) return p;
    let lo = p, hi = n + 1, mid = (lo + hi) >> 1;
    while (u < U[mid] || u >= U[mid + 1]) { if (u < U[mid]) hi = mid; else lo = mid; mid = (lo + hi) >> 1; }
    return mid;
  }
  // homogeneous control points [x w, y w, w]
  const spH = s => s.cp.map((p, i) => { const w = s.w ? s.w[i] : 1; return [p[0] * w, p[1] * w, w]; });
  function spEval(s, t) {
    const u = spU(s, t), p = s.deg, k = spSpan(s, u), U = s.kn, H = spH(s), d = [];
    for (let j = 0; j <= p; j++) d.push(H[k - p + j].slice());
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const i = k - p + j, den = U[i + p - r + 1] - U[i], a = den > 0 ? (u - U[i]) / den : 0;
      for (let c = 0; c < 3; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
    return [d[p][0] / d[p][2], d[p][1] / d[p][2]];
  }
  // insert knot u once (Boehm), in homogeneous space
  function spInsert(s, u) {
    const p = s.deg, k = spSpan(s, u), U = s.kn, H = spH(s), Q = [];
    for (let i = 0; i <= k - p; i++) Q.push(H[i]);
    for (let i = k - p + 1; i <= k; i++) { const a = (u - U[i]) / (U[i + p] - U[i]); Q.push([0, 1, 2].map(c => (1 - a) * H[i - 1][c] + a * H[i][c])); }
    for (let i = k; i < H.length; i++) Q.push(H[i]);
    const kn = U.slice(0, k + 1).concat([u], U.slice(k + 1));
    return fromH(p, kn, Q, !!s.w);
  }
  function fromH(deg, kn, H, rational) {
    const cp = H.map(h => [h[0] / h[2], h[1] / h[2]]), w = H.map(h => h[2]);
    return { t: 'spline', deg, kn, cp, w: rational || w.some(x => Math.abs(x - 1) > 1e-12) ? w : null };
  }
  // split a spline at t into two clamped splines (knot insertion to full multiplicity)
  function spSplit(s, t) {
    const u = spU(s, t), p = s.deg;
    let mult = s.kn.filter(k => Math.abs(k - u) < 1e-12).length, q = s;
    for (let i = mult; i < p; i++) q = spInsert(q, u);
    let k = -1; for (let i = 0; i < q.kn.length; i++) if (Math.abs(q.kn[i] - u) < 1e-12) k = i;
    const H = spH(q), left = fromH(p, q.kn.slice(0, k + 1).concat([u]), H.slice(0, k - p + 1), !!s.w);
    const right = fromH(p, [u].concat(q.kn.slice(k - p + 1)), H.slice(k - p), !!s.w);
    return [left, right];
  }
  // the spline as points with their t, the chord within tol of the curve
  // Kept per spline and tolerance (entities are never changed in place, so a spline object always has the same
  // points); the arrays handed out are shared and must not be changed. At most 50,000 points: a damaged spline that
  // never settles within tol stops there instead of running on.
  const spMemo = new WeakMap();
  function spFlatten(s, tol) {
    tol = tol || 0.0001;
    let memo = spMemo.get(s); if (!memo) spMemo.set(s, memo = new Map());
    if (memo.has(tol)) return memo.get(tol);
    const [u0, u1] = spDomain(s), spans = new Set();
    for (let i = s.deg; i < s.cp.length; i++) if (s.kn[i + 1] > s.kn[i]) spans.add(i);
    const out = [];
    const tAt = u => (u - u0) / (u1 - u0);
    const rec = (ta, pa, tb, pb, depth) => {
      const tm = (ta + tb) / 2, pm = spEval(s, tm), q1 = spEval(s, (ta + tm) / 2), q2 = spEval(s, (tm + tb) / 2);
      const dev = Math.max(segDist(pm, pa, pb), segDist(q1, pa, pb), segDist(q2, pa, pb));
      if (depth < 16 && out.length < 50000 && (dev > tol || depth < 2)) { rec(ta, pa, tm, pm, depth + 1); rec(tm, pm, tb, pb, depth + 1); }
      else out.push({ t: tb, p: pb });
    };
    out.push({ t: 0, p: spEval(s, 0) });
    for (const i of [...spans].sort((a, b) => a - b)) {
      const ta = tAt(s.kn[i]), tb = tAt(s.kn[i + 1]);
      rec(ta, spEval(s, ta), tb, spEval(s, tb), 0);
    }
    memo.set(tol, out);
    return out;
  }
  // ∫ f(t, point, derivative) dt over the spline, by 16-point Gauss–Legendre on each knot span (for lengths and areas)
  const GL = (() => { const x = [0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438, 0.7554044083550030, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499], w = [0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767, 0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541]; return { x: x.concat(x.map(v => -v)), w: w.concat(w) }; })();
  function spIntegrate(s, f) {
    const [u0, u1] = spDomain(s), tAt = u => (u - u0) / (u1 - u0); let sum = 0;
    for (let i = s.deg; i < s.cp.length; i++) {
      if (!(s.kn[i + 1] > s.kn[i])) continue;
      const a = tAt(s.kn[i]), b = tAt(s.kn[i + 1]), h = (b - a) / 2, m = (a + b) / 2;
      for (let k = 0; k < 16; k++) {
        const t = m + h * GL.x[k], e = 1e-7 * (b - a), p = spEval(s, t), d = mul(sub(spEval(s, Math.min(1, t + e)), spEval(s, Math.max(0, t - e))), 1 / (Math.min(1, t + e) - Math.max(0, t - e)));
        sum += GL.w[k] * h * f(t, p, d);
      }
    }
    return sum;
  }
  // a cubic Bézier (SVG) or quadratic as an exact spline
  const bezier = pts => ({ t: 'spline', deg: pts.length - 1, kn: Array(pts.length).fill(0).concat(Array(pts.length).fill(1)), cp: pts.map(p => [p[0], p[1]]), w: null });
  // an exact rational quadratic spline for an ellipse (or its arc): centre, semi-axes, rotation, start, sweep
  function ellipse(c, rx, ry, rot, a0, sw) {
    const n = Math.max(1, Math.ceil(Math.abs(sw) / (PI / 2) - 1e-9)), d = sw / n, wm = Math.cos(d / 2), cp = [], w = [], kn = [0, 0, 0];
    const P = a => { const x = rx * Math.cos(a), y = ry * Math.sin(a); return [c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot)]; };
    const M = a => { const x = rx * Math.cos(a) / wm, y = ry * Math.sin(a) / wm; return [c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot)]; };
    for (let i = 0; i < n; i++) {
      const a = a0 + d * i; if (i === 0) { cp.push(P(a)); w.push(1); }
      cp.push(M(a + d / 2)); w.push(wm); cp.push(P(a + d)); w.push(1);
      if (i < n - 1) kn.push((i + 1) / n, (i + 1) / n);
    }
    kn.push(1, 1, 1);
    return { t: 'spline', deg: 2, kn, cp, w };
  }
  // a spline through points (chord-length cubic interpolation with natural ends); used for fit-point splines
  function splineThrough(P) {
    if (P.length < 2) return null;
    if (P.length === 2) return line(P[0], P[1]);
    const n = P.length - 1, d = [0]; for (let i = 1; i <= n; i++) d.push(d[i - 1] + Math.max(EPS, dist(P[i], P[i - 1])));
    const u = d.map(x => x / d[n]);
    // knots: clamped cubic with the interior knots at the parameters (averaged)
    const kn = [0, 0, 0, 0]; for (let j = 1; j <= n - 1; j++) kn.push(u[j]); kn.push(1, 1, 1, 1);
    // unknown control points n+3: Q0 = P0, Qn+2 = Pn, end tangents set so the second derivative is ~0 (two extra rows)
    const m = n + 3, A = Array.from({ length: m }, () => Array(m).fill(0)), bx = Array(m).fill(0), by = Array(m).fill(0);
    const s = { t: 'spline', deg: 3, kn, cp: Array(m).fill([0, 0]), w: null };
    const basis = uu => { const r = []; for (let i = 0; i < m; i++) { const cp = Array(m).fill(0).map((_, k) => [k === i ? 1 : 0, 0]); r.push(spEval({ ...s, cp }, uu)[0]); } return r; };
    for (let i = 0; i <= n; i++) { const B = basis(u[i]); A[i] = B; bx[i] = P[i][0]; by[i] = P[i][1]; }
    // natural ends: Q0 - 2Q1 + Q2 = 0 and the same at the other end
    A[n + 1] = Array(m).fill(0); A[n + 1][0] = 1; A[n + 1][1] = -2; A[n + 1][2] = 1;
    A[n + 2] = Array(m).fill(0); A[n + 2][m - 1] = 1; A[n + 2][m - 2] = -2; A[n + 2][m - 3] = 1;
    const X = solve(A.map(r => r.slice()), bx), Y = solve(A.map(r => r.slice()), by);
    if (!X || !Y) return null;
    return { t: 'spline', deg: 3, kn, cp: X.map((x, i) => [x, Y[i]]), w: null };
  }
  function solve(A, b) {
    const n = b.length; b = b.slice();
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
      if (Math.abs(A[p][i]) < 1e-14) return null;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; if (!f) continue; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return x;
  }

  // ---------------------------------------------------------------- evaluating
  function at(e, t) {
    if (e.t === 'pt') return e.p.slice();
    if (isXL(e)) return at(proxy(e), t);
    if (e.t === 'line') return lerp(e.a, e.b, t);
    if (e.t === 'arc') return polar(e.c, e.r, e.a0 + e.sw * t);
    return spEval(e, t);
  }
  const start = e => at(e, 0), end = e => at(e, 1), mid = e => at(e, 0.5);
  // unit tangent in the direction of travel
  function tangent(e, t) {
    if (e.t === 'line') return unit(sub(e.b, e.a));
    if (isXL(e)) return e.d.slice();
    if (e.t === 'arc') { const a = e.a0 + e.sw * t, s = Math.sign(e.sw); return [-Math.sin(a) * s, Math.cos(a) * s]; }
    if (e.t === 'spline') { const h = 1e-6, a = at(e, Math.max(0, t - h)), b = at(e, Math.min(1, t + h)); return unit(sub(b, a)); }
    return [1, 0];
  }
  function length(e) {
    if (e.t === 'line') return dist(e.a, e.b);
    if (isXL(e)) return length(proxy(e));
    if (e.t === 'arc') return Math.abs(e.sw) * e.r;
    if (e.t === 'spline') return spIntegrate(e, (t, p, d) => len(d));
    return 0;
  }
  // points along the entity for drawing: the chord within tol
  function flatten(e, tol) {
    tol = tol || 0.0005;
    if (e.t === 'pt') return [e.p.slice()];
    if (e.t === 'line') return [e.a.slice(), e.b.slice()];
    if (isXL(e)) return flatten(proxy(e));
    if (e.t === 'arc') {
      const step = e.r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / e.r)) : PI / 4, n = Math.min(MAXPTS, Math.max(2, Math.ceil(Math.abs(e.sw) / step) || MAXPTS));
      const o = []; for (let i = 0; i <= n; i++) o.push(at(e, i / n)); return o;
    }
    return spFlatten(e, tol).map(q => q.p);
  }
  function bbox(e) {
    if (isAnno(e)) return draft().bbox(e);
    if (e.t === 'arc') {
      const ps = [start(e), end(e)];
      for (let k = 0; k < 4; k++) { const a = k * PI / 2; if (onArcAngle(e, a)) ps.push(polar(e.c, e.r, a)); }
      return boxOf(ps);
    }
    if (e.t === 'spline') return boxOf(e.cp.length < 64 ? flatten(e, 0.001) : e.cp);
    return boxOf(flatten(e));
  }
  const boxOf = ps => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of ps) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); } return b; };
  // the t of angle a on an arc (may be outside 0..1 for points off the arc: < 0 before the start, > 1 after the end,
  // taking whichever is nearer)
  function arcT(e, a) {
    const s = Math.sign(e.sw) || 1, u = norm2pi((a - e.a0) * s), sw = Math.abs(e.sw);
    if (u <= sw + 1e-12) return u / sw;
    return (u - sw) < (TAU - u) ? u / sw : (u - TAU) / sw;
  }
  const onArcAngle = (e, a) => { const t = arcT(e, a); return t >= -1e-12 && t <= 1 + 1e-12; };

  // ---------------------------------------------------------------- nearest point
  function segDist(p, a, b) { const ab = sub(b, a), L2 = dot(ab, ab); const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0; return dist(p, lerp(a, b, t)); }
  // nearest point on the entity: {t, p, d}; with ext, a line runs on for ever and an arc is its full circle
  function nearest(e, p, ext) {
    if (e.t === 'pt') return { t: 0, p: e.p.slice(), d: dist(p, e.p) };
    if (isXL(e)) return nearest(proxy(e), p, ext);
    if (e.t === 'line') {
      const ab = sub(e.b, e.a), L2 = dot(ab, ab); let t = L2 > 0 ? dot(sub(p, e.a), ab) / L2 : 0;
      if (!ext) t = Math.max(0, Math.min(1, t));
      const q = lerp(e.a, e.b, t); return { t, p: q, d: dist(p, q) };
    }
    if (e.t === 'arc') {
      const a = dist(p, e.c) < EPS ? e.a0 : Math.atan2(p[1] - e.c[1], p[0] - e.c[0]);
      let t = arcT(e, a);
      if (!ext && (t < 0 || t > 1)) { const d0 = dist(p, start(e)), d1 = dist(p, end(e)); t = d0 <= d1 ? 0 : 1; }
      const q = at(e, t); return { t, p: q, d: dist(p, q) };
    }
    // spline: the nearest flattened point, then refined by golden search on t
    const f = spFlatten(e, 0.001); let bi = 0, bd = Infinity;
    for (let i = 0; i < f.length; i++) { const d = dist(p, f[i].p); if (d < bd) { bd = d; bi = i; } }
    let lo = f[Math.max(0, bi - 1)].t, hi = f[Math.min(f.length - 1, bi + 1)].t;
    const g = (Math.sqrt(5) - 1) / 2, D = t => dist(p, spEval(e, t));
    for (let k = 0; k < 60; k++) { const x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo); if (D(x1) < D(x2)) hi = x2; else lo = x1; }
    const t = (lo + hi) / 2, q = spEval(e, t); return { t, p: q, d: dist(p, q) };
  }

  // ---------------------------------------------------------------- intersections
  // where two entities cross: [{p, t1, t2}]. ext: treat lines as endless and arcs as full circles (for trimming to
  // where something would meet); the t of a point off the entity is then outside 0..1
  function intersect(e1, e2, ext) {
    if (isXL(e1) || isXL(e2)) return isWire(e1) && isWire(e2) ? intersect(proxy(e1), proxy(e2), ext) : [];
    if (!isCurve(e1) || !isCurve(e2)) return [];
    let out;
    if (e1.t === 'line' && e2.t === 'line') out = llx(e1, e2);
    else if (e1.t === 'line' && e2.t === 'arc') out = lax(e1, e2);
    else if (e1.t === 'arc' && e2.t === 'line') out = lax(e2, e1).map(h => ({ p: h.p, t1: h.t2, t2: h.t1 }));
    else if (e1.t === 'arc' && e2.t === 'arc') out = aax(e1, e2);
    else out = curvex(e1, e2);
    const ok = t => ext || (t >= -1e-9 && t <= 1 + 1e-9);
    return out.filter(h => ok(h.t1) && ok(h.t2)).map(h => ({ p: h.p, t1: ext ? h.t1 : clamp01(h.t1), t2: ext ? h.t2 : clamp01(h.t2) }));
  }
  const clamp01 = t => Math.max(0, Math.min(1, t));
  function llx(a, b) {
    const r = sub(a.b, a.a), s = sub(b.b, b.a), den = cross(r, s);
    if (Math.abs(den) < 1e-14) return [];
    const q = sub(b.a, a.a), t = cross(q, s) / den, u = cross(q, r) / den;
    return [{ p: lerp(a.a, a.b, t), t1: t, t2: u }];
  }
  function lax(l, c) {
    const d = sub(l.b, l.a), f = sub(l.a, c.c), A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - c.r * c.r;
    if (A < EPS * EPS) return [];
    let disc = B * B - 4 * A * C;
    if (disc < -1e-12 * A * Math.max(1, c.r * c.r)) return [];
    disc = Math.max(0, disc);
    const sq = Math.sqrt(disc), ts = sq < 1e-12 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
    return ts.map(t => { const p = lerp(l.a, l.b, t); return { p, t1: t, t2: arcT(c, Math.atan2(p[1] - c.c[1], p[0] - c.c[0])) }; });
  }
  function aax(a, b) {
    const d = dist(a.c, b.c);
    if (d < EPS || d > a.r + b.r + 1e-12 || d < Math.abs(a.r - b.r) - 1e-12) return [];
    const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - x * x)), u = unit(sub(b.c, a.c)), m = add(a.c, mul(u, x));
    const ps = h < 1e-12 ? [m] : [add(m, mul([-u[1], u[0]], h)), add(m, mul([u[1], -u[0]], h))];
    return ps.map(p => ({ p, t1: arcT(a, Math.atan2(p[1] - a.c[1], p[0] - a.c[0])), t2: arcT(b, Math.atan2(p[1] - b.c[1], p[0] - b.c[0])) }));
  }
  // with a spline: crossings of the flattened curves, then refined
  function curvex(e1, e2) {
    const P = e => e.t === 'spline' ? spFlatten(e, 0.00005) : e.t === 'line' ? [{ t: 0, p: e.a }, { t: 1, p: e.b }] : flatten(e, 0.00005).map((p, i, A) => ({ t: i / (A.length - 1), p }));
    const A = P(e1), B = P(e2), out = [];
    // runs of 32 segments with their boxes: only runs whose boxes overlap are tried segment by segment
    const runs = Q => { const R = []; for (let i = 1; i < Q.length; i += 32) { const j1 = Math.min(Q.length - 1, i + 31); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let k = i - 1; k <= j1; k++) { const q = Q[k].p; if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } R.push({ i, j1, b: [x0 - 1e-9, y0 - 1e-9, x1 + 1e-9, y1 + 1e-9] }); } return R; };
    const RA = runs(A), RB = runs(B);
    for (const ra of RA) for (const rb of RB) {
      if (ra.b[0] > rb.b[2] || rb.b[0] > ra.b[2] || ra.b[1] > rb.b[3] || rb.b[1] > ra.b[3]) continue;
      for (let i = ra.i; i <= ra.j1; i++) for (let j = rb.i; j <= rb.j1; j++) {
        const r = sub(A[i].p, A[i - 1].p), s = sub(B[j].p, B[j - 1].p), den = cross(r, s); if (Math.abs(den) < 1e-16) continue;
        const q = sub(B[j - 1].p, A[i - 1].p), t = cross(q, s) / den, u = cross(q, r) / den;
        if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
        let t1 = A[i - 1].t + (A[i].t - A[i - 1].t) * t, t2 = B[j - 1].t + (B[j].t - B[j - 1].t) * u;
        // refine: alternate nearest points a few times
        let p = at(e1, t1);
        for (let k = 0; k < 8; k++) { const n2 = nearest(e2, p); t2 = n2.t; const n1 = nearest(e1, n2.p); t1 = n1.t; p = n1.p; }
        if (!out.some(h => same(h.p, p, 1e-6))) out.push({ p, t1, t2 });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- pieces
  // the entity from t0 to t1 (t may run past 0 and 1 for lines and arcs: that extends them)
  function piece(e, t0, t1) {
    if (e.t === 'line') return line(lerp(e.a, e.b, t0), lerp(e.a, e.b, t1));
    if (isXL(e)) return unproxy(piece(proxy(e), t0, t1), e);
    if (e.t === 'arc') return arc(e.c, e.r, e.a0 + e.sw * t0, e.sw * (t1 - t0));
    if (e.t === 'spline') {
      if (t0 <= 1e-12 && t1 >= 1 - 1e-12) return copy(e);
      if (t0 < -1e-9 || t1 > 1 + 1e-9) throw new Error('A spline cannot be extended');
      let s = e; if (t1 < 1 - 1e-12) s = spSplit(s, t1)[0];
      if (t0 > 1e-12) s = spSplit(s, t1 < 1 - 1e-12 ? t0 / t1 : t0)[1];
      return s;
    }
    return copy(e);
  }
  // split at the given t's (sorted, inside 0..1): the pieces in order
  function splitAt(e, ts) {
    if (e.t === 'pt') return [copy(e)];
    const cut = [...new Set(ts.filter(t => t > 1e-9 && t < 1 - 1e-9).map(t => +t.toFixed(12)))].sort((a, b) => a - b);
    if (isCircle(e) && cut.length) {
      // a circle opens at the first cut and runs round to it again
      const T = cut.concat([cut[0] + 1]), out = [];
      for (let i = 1; i < T.length; i++) out.push(arc(e.c, e.r, e.a0 + e.sw * T[i - 1], e.sw * (T[i] - T[i - 1])));
      return out;
    }
    const T = [0, ...cut, 1], out = [];
    for (let i = 1; i < T.length; i++) out.push(piece(e, T[i - 1], T[i]));
    return out;
  }
  const reverse = e => e.t === 'line' ? line(e.b, e.a) : e.t === 'arc' ? arc(e.c, e.r, e.a0 + e.sw, -e.sw) : isXL(e) && !e.ray ? xline(e.p, mul(e.d, -1))
    : e.t === 'spline' ? { t: 'spline', deg: e.deg, kn: e.kn.map(k => e.kn[0] + e.kn[e.kn.length - 1] - k).reverse(), cp: e.cp.slice().reverse().map(p => p.slice()), w: e.w ? e.w.slice().reverse() : null } : copy(e);
  const copy = e => JSON.parse(JSON.stringify(e));

  // ---------------------------------------------------------------- trim, extend, break
  // keep the part of e on pick's side of the point at t (the boundary): e's end nearer the cut moves to it; past the
  // ends (t < 0 or > 1) the entity is extended. A circle becomes the arc from the cut round to the cut... so trimming a
  // circle needs two cuts (trimBetween).
  function trimAt(e, t, pickT) {
    if (isCircle(e)) throw new Error('Trim a circle against two entities, or break it first');
    if (pickT >= t) return piece(e, t, Math.max(1, t));
    return piece(e, Math.min(0, t), t);
  }
  // trim (or extend) e to where it meets boundary b, keeping the side of pick; the crossing nearest the pick is used
  function trim1(e, b, pick) {
    const hs = intersect(e, b, true).filter(h => e.t !== 'spline' || (h.t1 >= -1e-9 && h.t1 <= 1 + 1e-9));
    if (!hs.length) throw new Error('They do not meet');
    const pt = nearest(e, pick, e.t !== 'spline').t;
    hs.sort((x, y) => Math.abs(x.t1 - pt) - Math.abs(y.t1 - pt));
    return trimAt(e, hs[0].t1, pt);
  }
  // trim (or extend) two entities to where they meet, keeping each one's picked side; the crossing nearest the picks
  function trim2(e1, e2, pick1, pick2) {
    const hs = intersect(e1, e2, true).filter(h => (e1.t !== 'spline' || (h.t1 >= -1e-9 && h.t1 <= 1 + 1e-9)) && (e2.t !== 'spline' || (h.t2 >= -1e-9 && h.t2 <= 1 + 1e-9)));
    if (!hs.length) throw new Error('They do not meet');
    const m = lerp(pick1, pick2, 0.5); hs.sort((a, b) => dist(a.p, m) - dist(b.p, m));
    const h = hs[0], t1 = nearest(e1, pick1, e1.t !== 'spline').t, t2 = nearest(e2, pick2, e2.t !== 'spline').t;
    return [trimAt(e1, h.t1, t1), trimAt(e2, h.t2, t2)];
  }
  // the piece of e between its nearest cuts by the others either side of pick (what "divide" removes), and the rest
  function divide(e, others, pick) {
    const ts = []; for (const o of others) for (const h of intersect(e, o)) ts.push(h.t1);
    const pt = nearest(e, pick).t;
    if (isCircle(e)) {
      if (ts.length < 2) throw new Error('A circle needs two crossings to divide');
      const parts = splitAt(e, ts), hit = parts.reduce((b, p, i) => { const d = nearest(p, pick).d; return d < b.d ? { i, d } : b; }, { i: 0, d: Infinity });
      return { removed: parts[hit.i], kept: parts.filter((_, i) => i !== hit.i) };
    }
    const lo = Math.max(0, ...ts.filter(t => t < pt - 1e-9)), hi = Math.min(1, ...ts.filter(t => t > pt + 1e-9));
    const kept = []; if (lo > 1e-9) kept.push(piece(e, 0, lo)); if (hi < 1 - 1e-9) kept.push(piece(e, hi, 1));
    return { removed: piece(e, lo, hi), kept };
  }
  // trim e between two boundaries: keep the piece that holds pick (for circles and closed shapes)
  function trimBetween(e, b1, b2, pick) {
    const ts = []; for (const b of [b1, b2]) for (const h of intersect(e, b)) ts.push(h.t1);
    const parts = splitAt(e, ts);
    return parts.reduce((b, p) => { const d = nearest(p, pick).d; return d < b.d ? { p, d } : b; }, { p: null, d: Infinity }).p;
  }
  // make a line or arc longer (or shorter, with a negative length) at its start or end
  function extend(e, atEnd, by) {
    if (e.t === 'line') { const L = length(e); return atEnd ? piece(e, 0, 1 + by / L) : piece(e, -by / L, 1); }
    if (e.t === 'arc') { if (isCircle(e)) return copy(e); const dt = by / length(e); return atEnd ? piece(e, 0, 1 + dt) : piece(e, -dt, 1); }
    throw new Error('Only lines and arcs can be extended');
  }
  // break e where the others cross it: the pieces
  function breakAtCrossings(e, others) {
    const ts = []; for (const o of others) if (o !== e) for (const h of intersect(e, o)) ts.push(h.t1);
    return splitAt(e, ts);
  }

  // ---------------------------------------------------------------- fillet and chamfer
  // which side of e a point is: for a line, left (+1) or right (-1) of its direction; for an arc, outside (+1) or in
  function side(e, p) {
    if (e.t === 'line') return Math.sign(cross(sub(e.b, e.a), sub(p, e.a))) || 1;
    if (isXL(e)) return Math.sign(cross(e.d, sub(p, e.p))) || 1;
    if (e.t === 'arc') return Math.sign(dist(p, e.c) - e.r) || 1;
    const n = nearest(e, p), tg = tangent(e, n.t); return Math.sign(cross(tg, sub(p, n.p))) || 1;
  }
  // the curves r away from e (both sides), endless lines and full circles
  function offsetsOf(e, r) {
    if (isXL(e)) return offsetsOf(proxy(e), r);
    if (e.t === 'line') { const u = unit(sub(e.b, e.a)), n = [-u[1], u[0]]; return [1, -1].map(s => ({ s, e: line(add(e.a, mul(n, r * s)), add(e.b, mul(n, r * s))) })); }
    if (e.t === 'arc') return [1, -1].map(s => ({ s, e: e.r + r * s > EPS ? circle(e.c, e.r + r * s) : null })).filter(o => o.e);
    return [];
  }
  // A fillet of radius r between lines and arcs e1 and e2, on the side the picks show (the parts kept are where you
  // clicked). Returns {arc, e1, e2}: the fillet and the two entities trimmed to it (trim false: e1 and e2 unchanged).
  // keep: other points for the parts to keep when trimming (the picks still choose which fillet)
  function fillet(e1, e2, r, pick1, pick2, trim, keep) {
    if (!(r > 0)) throw new Error('Give a radius');
    if (!/^(line|arc|xline)$/.test(e1.t) || !/^(line|arc|xline)$/.test(e2.t)) throw new Error('Fillets join lines and arcs');
    const cands = [];
    for (const o1 of offsetsOf(e1, r)) for (const o2 of offsetsOf(e2, r)) for (const h of intersect(o1.e, o2.e, true)) {
      const c = h.p, q1 = nearest(e1, c, true), q2 = nearest(e2, c, true);
      // the centre sits on the side of each entity where the other one's kept part is
      if (side(e1, c) !== side(e1, pick2) || side(e2, c) !== side(e2, pick1)) continue;
      cands.push({ c, q1, q2, score: dist(q1.p, pick1) + dist(q2.p, pick2) });
    }
    if (!cands.length) throw new Error('No fillet of R' + r + ' fits there');
    cands.sort((a, b) => a.score - b.score);
    const { c, q1, q2 } = cands[0];
    // the short way round from the first tangent point to the second
    const ccw = cross(sub(q1.p, c), sub(q2.p, c)) > 0, f = arcCenter(c, q1.p, q2.p, ccw);
    if (trim === false) return { arc: f, e1: copy(e1), e2: copy(e2) };
    const k1 = nearest(e1, keep ? keep[0] : pick1, true).t, k2 = nearest(e2, keep ? keep[1] : pick2, true).t;
    // a full circle is left whole (it has no end to move)
    return { arc: f, e1: isCircle(e1) ? copy(e1) : trimAt(e1, q1.t, k1), e2: isCircle(e2) ? copy(e2) : trimAt(e2, q2.t, k2) };
  }
  // a chamfer between two lines: d1 along e1 and d2 along e2 from where they meet, keeping the picked parts
  function chamfer(e1, e2, d1, d2, pick1, pick2, trim) {
    if (!/^(line|xline)$/.test(e1.t) || !/^(line|xline)$/.test(e2.t)) throw new Error('Chamfers join two lines');
    const h = intersect(e1, e2, true)[0]; if (!h) throw new Error('The lines are parallel');
    const k1 = nearest(e1, pick1, true).t, k2 = nearest(e2, pick2, true).t;
    const L1 = length(e1), L2 = length(e2), t1 = h.t1 + (k1 > h.t1 ? 1 : -1) * d1 / L1, t2 = h.t2 + (k2 > h.t2 ? 1 : -1) * (d2 === undefined ? d1 : d2) / L2;
    const p1 = at(e1, t1), p2 = at(e2, t2);
    return { line: line(p1, p2), e1: trim === false ? copy(e1) : trimAt(e1, t1, k1), e2: trim === false ? copy(e2) : trimAt(e2, t2, k2) };
  }

  // ---------------------------------------------------------------- offset
  // e moved d to the side of p (lines and arcs exactly; splines as a spline through offset points)
  function offset(e, d, p) {
    const s = side(e, p);
    if (isXL(e)) return xline(add(e.p, mul([-e.d[1], e.d[0]], d * s)), e.d, e.ray);
    if (e.t === 'line') { const u = unit(sub(e.b, e.a)), n = mul([-u[1], u[0]], d * s); return line(add(e.a, n), add(e.b, n)); }
    if (e.t === 'arc') { const r = e.r + d * s; if (r <= EPS) throw new Error('Too far in: the arc would vanish'); return { ...copy(e), r }; }
    if (e.t === 'spline') {
      const f = spFlatten(e, 0.0002), P = f.map(q => { const tg = tangent(e, q.t); return add(q.p, mul([-tg[1], tg[0]], d * s)); });
      const step = Math.max(1, Math.floor(P.length / 60)), Q = P.filter((_, i) => i % step === 0 || i === P.length - 1);
      return splineThrough(Q);
    }
    return copy(e);
  }

  // ---------------------------------------------------------------- shapes that keep their sizes
  // rect {c, w, h, r (corner radius), ang} · slot {c, len (overall), w, ang} · poly {c, n (sides), R (to the corners),
  // ang}: their entities from the numbers, so a shape can be drawn again when one of its numbers changes
  function shape(type, p) {
    const a = p.ang || 0, m = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), p.c[0], p.c[1]], put = gs => gs.map(g => transform(g, m));
    if (type === 'rect') {
      const w = +p.w, h = +p.h; if (!(w > EPS && h > EPS)) return [];
      const r = Math.min(Math.max(0, +p.r || 0), w / 2 - 1e-9, h / 2 - 1e-9), x0 = -w / 2, y0 = -h / 2;
      return put(fromShapes([{ closed: true, pts: [[x0, y0, r], [x0 + w, y0, r], [x0 + w, y0 + h, r], [x0, y0 + h, r]] }]));
    }
    if (type === 'slot') {
      const w = +p.w, L = +p.len; if (!(w > EPS && L > w + 1e-9)) return [];
      const e = (L - w) / 2, r = w / 2;
      return put(fromShapes([{ closed: true, pts: [[-e, -r, 0, 0], [e, -r, 0, r], [e, r, 0, 0], [-e, r, 0, r]] }]));
    }
    if (type === 'ellipse') { const rx = +p.rx, ry = +p.ry; return rx > EPS && ry > EPS ? [ellipse(p.c, rx, ry, a, 0, TAU)] : []; }
    // a bolt circle: n points (or holes of diameter hd) on a circle of diameter D, the first at angle ang
    if (type === 'bolt') { const n = Math.round(+p.n), R = +p.D / 2; if (!(n >= 1 && n <= 10000 && R > EPS)) return []; const out = []; for (let k = 0; k < n; k++) { const q = polar(p.c, R, a + k * TAU / n); out.push(p.hd > EPS ? circle(q, p.hd / 2) : pt(q)); } return out; }
    if (type === 'poly') {
      const n = Math.round(+p.n), R = +p.R; if (!(n >= 3 && n <= 1000 && R > EPS)) return [];
      const V = []; for (let k = 0; k < n; k++) V.push(polar(p.c, R, a + k * TAU / n));
      return V.map((v, k) => line(v, V[(k + 1) % n]));
    }
    return [];
  }
  // a shape's numbers after a move, turn or scale by m (null for a mirror or a stretch: it is a shape no longer)
  function shapeMove(type, p, m) {
    const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]), det = m[0] * m[3] - m[1] * m[2];
    if (det <= 0 || Math.abs(sx - sy) > 1e-9 * Math.max(1, sx) || Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-9 * Math.max(1, sx * sx)) return null;
    const q = Object.assign({}, p, { c: [m[0] * p.c[0] + m[2] * p.c[1] + m[4], m[1] * p.c[0] + m[3] * p.c[1] + m[5]], ang: (p.ang || 0) + Math.atan2(m[1], m[0]) });
    for (const k of ['w', 'h', 'r', 'len', 'R', 'rx', 'ry', 'D', 'hd']) if (q[k] !== undefined) q[k] = q[k] * sx;
    return q;
  }

  // ---------------------------------------------------------------- along a curve
  // the t at distance s along e from its start (lines and arcs exactly; splines through their points, closely)
  function tAtLength(e, s) {
    const L = length(e); if (!(L > EPS)) return 0;
    if (e.t !== 'spline') return Math.max(0, Math.min(1, s / L));
    const f = spFlatten(e, 1e-5); let run = 0;
    for (let i = 1; i < f.length; i++) { const d = dist(f[i - 1].p, f[i].p); if (run + d >= s) return f[i - 1].t + (f[i].t - f[i - 1].t) * (d > 0 ? (s - run) / d : 0); run += d; }
    return 1;
  }
  // the t's that cut e into n pieces of equal length (n − 1 of them; a circle n, from its start)
  function equalTs(e, n) { const L = length(e), out = []; for (let k = isCircle(e) ? 0 : 1; k < n; k++) out.push(isCircle(e) ? k / n : tAtLength(e, L * k / n)); return out; }

  // ---------------------------------------------------------------- whole chains: fillets, chamfers, stretch
  // Every corner of a chain (list: its entities in order, end to end) rounded with radius r (fillet) or cut at d
  // (chamfer). which: 'all', 'in' or 'out' (the corners that turn into or out of a closed chain). Returns {ents: the
  // entities trimmed (one for each in list), adds: [{at: the index of the entity before it, g}], tight: corners that
  // took no fillet or chamfer (too tight, a spline, or two entities in a row)}.
  function cornerChain(list, closed, size, which, chamf) {
    const cur = list.map(copy), adds = [], n = cur.length, turn = closed ? Math.sign(chainArea(cur)) || 1 : 1;
    let tight = 0;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = (i + 1) % n, a = cur[i], b = cur[j];
      if (a.t === 'pt' || b.t === 'pt' || n < 2 || (i === j)) continue;
      const ta = tangent(a, 1), tb = tangent(b, 0), x = cross(ta, tb);
      if (Math.abs(x) < 1e-9 && dot(ta, tb) > 0) continue;              // smooth: no corner
      if (which !== 'all' && closed && (x * turn > 0 ? 'out' : 'in') !== which) continue;
      // a corner takes it only when it lands inside both entities: each keeps its far end (its start, before the
      // corner; its end, after it), and is shorter than it was
      const within = (was, now, far) => now && length(now) > 1e-9 && length(now) < length(was) - 1e-9 && same(far(now), far(was), 1e-9) && (was.t !== 'arc' || Math.sign(was.sw) === Math.sign(now.sw));
      try {
        const r = chamf ? chamfer(a, b, size, size, start(a), end(b)) : fillet(a, b, size, mid(a), mid(b), true, [start(a), end(b)]);
        if (!within(a, r.e1, start) || !within(b, r.e2, end)) throw new Error('too tight');
        cur[i] = r.e1; cur[j] = r.e2; adds.push({ at: i, g: chamf ? r.line : r.arc });
      } catch (err) { tight++; }
    }
    return { ents: cur, adds, tight };
  }
  const filletChain = (list, closed, r, which) => cornerChain(list, closed, r, which || 'all', false);
  const chamferChain = (list, closed, d, which) => cornerChain(list, closed, d, which || 'all', true);
  // e stretched by d: what of it is inside (a test on points) moves. Wholly inside, it moves whole; a line's end, an
  // arc's end (the arc drawn again through its other end and its middle moved half way) or a spline's control points
  // move on their own. null: nothing of it is inside.
  function stretch(e, inside, d) {
    const mv = p => add(p, d), by = () => transform(e, [1, 0, 0, 1, d[0], d[1]]);
    if (isAnno(e)) {
      if (e.t === 'hatch') return null;
      const keys = ['p', 'p1', 'p2', 'at', 'c', 'o'].filter(k => Array.isArray(e[k]) && e[k].length === 2), hit = keys.filter(k => inside(e[k]));
      if (!hit.length) return null; if (hit.length === keys.length) return by();
      const o = copy(e); for (const k of hit) o[k] = mv(o[k]); return o;
    }
    if (e.t === 'pt' || isXL(e)) return inside(e.p) ? by() : null;
    if (e.t === 'line') { const ia = inside(e.a), ib = inside(e.b); return ia && ib ? by() : ia ? line(mv(e.a), e.b) : ib ? line(e.a, mv(e.b)) : null; }
    if (e.t === 'arc') {
      if (isCircle(e)) return inside(e.c) ? by() : null;
      const s0 = start(e), s1 = end(e), i0 = inside(s0), i1 = inside(s1);
      if (i0 && i1) return by(); if (!i0 && !i1) return null;
      return arc3(i0 ? mv(s0) : s0, add(mid(e), mul(d, 0.5)), i1 ? mv(s1) : s1);
    }
    if (e.t === 'spline') { const hit = e.cp.map(p => inside(p)); if (!hit.some(Boolean)) return null; return { ...copy(e), cp: e.cp.map((p, i) => hit[i] ? mv(p) : p.slice()) }; }
    return null;
  }

  // ---------------------------------------------------------------- grips: the points of an entity to drag
  // [{k, p}]: a line's ends and middle; an arc's ends, middle and centre; a circle's centre and quarter points; a
  // spline's control points; a point, a note's place, an endless line's point
  function grips(g) {
    if (g.t === 'pt' || g.t === 'text' || isXL(g)) return [{ k: 'p', p: g.p.slice() }];
    if (g.t === 'line') return [{ k: 'a', p: g.a.slice() }, { k: 'b', p: g.b.slice() }, { k: 'mid', p: mid(g) }];
    if (g.t === 'arc' && isCircle(g)) return [{ k: 'c', p: g.c.slice() }, ...[0, 1, 2, 3].map(i => ({ k: 'q' + i, p: polar(g.c, g.r, g.a0 + i * PI / 2) }))];
    if (g.t === 'arc') return [{ k: 'start', p: start(g) }, { k: 'end', p: end(g) }, { k: 'mid', p: mid(g) }, { k: 'c', p: g.c.slice() }];
    if (g.t === 'spline') return g.cp.map((p, i) => ({ k: 'cp' + i, p: p.slice() }));
    return [];
  }
  // the grips at an entity's ends (what follows when something joined to it is dragged)
  function endGrips(g) {
    if (g.t === 'line') return grips(g).slice(0, 2);
    if (g.t === 'arc' && !isCircle(g)) return grips(g).slice(0, 2);
    if (g.t === 'spline') return [{ k: 'cp0', p: g.cp[0].slice() }, { k: 'cp' + (g.cp.length - 1), p: g.cp[g.cp.length - 1].slice() }];
    if (isXL(g) && g.ray) return [{ k: 'p', p: g.p.slice() }];
    return [];
  }
  // e with grip k dragged to q: an end moves (an arc's end: the arc through its other end, its middle and q, so what is
  // joined there stays joined); an arc's middle bends it; a centre or a line's middle moves it whole; a circle's
  // quarter point sets its radius. null when nothing sensible comes of it (an arc pulled straight, a line of no length)
  function moveGrip(g, k, q) {
    const by = d => transform(g, [1, 0, 0, 1, d[0], d[1]]);
    if (g.t === 'pt') return pt(q);
    if (g.t === 'text' || isXL(g)) return Object.assign(copy(g), { p: [q[0], q[1]] });
    if (g.t === 'line') { const r = k === 'a' ? line(q, g.b) : k === 'b' ? line(g.a, q) : by(sub(q, mid(g))); return dist(r.a, r.b) > EPS ? r : null; }
    if (g.t === 'arc' && isCircle(g)) { if (k === 'c') return by(sub(q, g.c)); const r = dist(q, g.c); return r > EPS ? circle(g.c, r) : null; }
    if (g.t === 'arc') { const s0 = start(g), s1 = end(g), m0 = mid(g); return k === 'start' ? arc3(q, m0, s1) : k === 'end' ? arc3(s0, m0, q) : k === 'mid' ? arc3(s0, q, s1) : by(sub(q, g.c)); }
    if (g.t === 'spline') { const i = +k.slice(2), r = copy(g); if (!(i >= 0 && i < r.cp.length)) return null; r.cp[i] = [q[0], q[1]]; return r; }
    return null;
  }

  // ---------------------------------------------------------------- duplicates
  // the same entity within tol, either way round: lines by their ends, arcs by their ends and middle, circles by centre
  // and radius, splines by points along them, endless lines by their line (rays by their start too)
  function sameGeom(a, b, tol) {
    tol = tol || TOL;
    if (a.t !== b.t) return false;
    const sm = (p, q) => dist(p, q) <= tol;
    if (a.t === 'pt') return sm(a.p, b.p);
    if (a.t === 'line') return sm(a.a, b.a) && sm(a.b, b.b) || sm(a.a, b.b) && sm(a.b, b.a);
    if (a.t === 'arc') {
      if (isCircle(a) || isCircle(b)) return isCircle(a) && isCircle(b) && sm(a.c, b.c) && Math.abs(a.r - b.r) <= tol;
      return sm(mid(a), mid(b)) && (sm(start(a), start(b)) && sm(end(a), end(b)) || sm(start(a), end(b)) && sm(end(a), start(b)));
    }
    if (a.t === 'spline') { const n = 8, f = k => at(a, k / n), g = k => at(b, k / n); let fw = true, bw = true; for (let k = 0; k <= n && (fw || bw); k++) { if (!sm(f(k), g(k))) fw = false; if (!sm(f(k), g(n - k))) bw = false; } return fw || bw; }
    if (isXL(a)) return !!a.ray === !!b.ray && Math.abs(cross(a.d, b.d)) <= tol && Math.abs(cross(a.d, sub(b.p, a.p))) <= tol && (!a.ray || sm(a.p, b.p) && dot(a.d, b.d) > 0);
    return JSON.stringify(a) === JSON.stringify(b);
  }
  // Which of items ({g, grp}: entities that may match only within the same grp) repeat one before them, and with over,
  // which lie wholly on another: a line inside a longer line in a row with it, an arc inside an arc or circle of the
  // same centre and radius. {remove: [index], over: how many of those lay on another}. Matches are found through a grid
  // of cells, so a big drawing takes a moment, not minutes.
  function duplicates(items, opts) {
    const o = opts || {}, tol = o.tol || 1e-4, cell = Math.max(tol * 4, 1e-6), drop = new Set();
    const keyPt = g => isXL(g) ? sub(g.p, mul(g.d, dot(g.p, g.d))) : g.t === 'arc' && isCircle(g) ? g.c : g.t === 'pt' ? g.p : (b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2])(bbox(g));
    const grid = new Map(), ck = (grp, x, y) => grp + '|' + x + '|' + y;
    items.forEach((it, i) => {
      const p = keyPt(it.g), cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const L = grid.get(ck(it.grp, cx + dx, cy + dy)); if (L && L.some(j => sameGeom(items[j].g, it.g, tol))) { drop.add(i); return; } }
      const k = ck(it.grp, cx, cy); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    });
    let over = 0;
    if (o.over) {
      // lines grouped by their direction (0 to π) and how far their line runs from the origin; arcs by centre and radius
      const lines = new Map(), arcs = new Map(), aq = Math.max(tol, 1e-9);
      items.forEach((it, i) => {
        if (drop.has(i)) return; const g = it.g;
        if (g.t === 'line') { const u0 = unit(sub(g.b, g.a)), u = u0[1] < 0 || (u0[1] === 0 && u0[0] < 0) ? mul(u0, -1) : u0, th = Math.atan2(u[1], u[0]), off = cross(u, g.a), s0 = dot(u, g.a), s1 = dot(u, g.b);
          const k = it.grp + '|' + Math.round(th / aq) + '|' + Math.round(off / tol); if (!lines.has(k)) lines.set(k, []); lines.get(k).push({ i, lo: Math.min(s0, s1), hi: Math.max(s0, s1) }); }
        else if (g.t === 'arc') { const k = it.grp + '|' + Math.round(g.c[0] / tol) + '|' + Math.round(g.c[1] / tol) + '|' + Math.round(g.r / tol); if (!arcs.has(k)) arcs.set(k, []); arcs.get(k).push(i); }
      });
      for (const L of lines.values()) { L.sort((a, b) => a.lo - b.lo || b.hi - a.hi); let reach = null; for (const s of L) { if (reach && s.hi <= reach.hi + tol && s.lo >= reach.lo - tol) { drop.add(s.i); over++; } else if (!reach || s.hi > reach.hi) reach = s; } }
      for (const L of arcs.values()) for (const i of L) {
        const a = items[i].g; if (isCircle(a)) continue;
        const on = j => { const b = items[j].g; if (isCircle(b)) return true; const t = q => arcT(b, Math.atan2(q[1] - b.c[1], q[0] - b.c[0])), ok = v => v >= -1e-9 && v <= 1 + 1e-9; return Math.abs(a.sw) <= Math.abs(b.sw) + 1e-9 && ok(t(start(a))) && ok(t(mid(a))) && ok(t(end(a))); };
        if (L.some(j => j !== i && !drop.has(j) && on(j))) { drop.add(i); over++; }
      }
    }
    return { remove: [...drop].sort((a, b) => a - b), over };
  }

  // ---------------------------------------------------------------- chains
  // Order entities end to end: [{items: [{i, rev}], closed}], i the index into ents. Entities that branch start new
  // chains. tol: how close ends must be.
  function chains(ents, tol) {
    tol = tol || 1e-4;
    const n = ents.length, used = Array(n).fill(false), ends = ents.map(e => isCurve(e) ? [start(e), end(e)] : [[NaN, NaN], [NaN, NaN]]), out = [];
    // the ends in a grid of cells at least tol across, so a match is in the same cell or one next to it
    const cell = Math.max(tol * 2, 1e-12), grid = new Map(), cx = v => Math.floor(v / cell);
    for (let i = 0; i < n; i++) if (isCurve(ents[i])) for (const p of ends[i]) { if (!isFinite(p[0]) || !isFinite(p[1])) continue; const k = cx(p[0]) + ',' + cx(p[1]); const L = grid.get(k); if (L) L.push(i); else grid.set(k, [i]); }
    // the unused entity with the lowest index that starts or ends at p (as a scan of them all in order would find)
    const near = p => {
      let best = null; const x = cx(p[0]), y = cx(p[1]);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const L = grid.get((x + dx) + ',' + (y + dy)); if (!L) continue;
        for (const i of L) {
          if (used[i] || (best && i >= best.i)) continue;
          if (same(ends[i][0], p, tol)) best = { i, rev: false }; else if (same(ends[i][1], p, tol)) best = { i, rev: true };
        }
      }
      return best;
    };
    for (let s = 0; s < n; s++) {
      if (used[s] || !isCurve(ents[s])) continue;
      used[s] = true;
      if (isCircle(ents[s])) { out.push({ items: [{ i: s, rev: false }], closed: true }); continue; }
      const items = [{ i: s, rev: false }], back = [];
      // forward from the end, then backward from the start (gathered in reverse, then put in front)
      let p = ends[s][1];
      for (;;) { const k = near(p); if (!k) break; used[k.i] = true; items.push(k); p = k.rev ? ends[k.i][0] : ends[k.i][1]; if (same(p, ends[s][0], tol)) break; }
      const closed = items.length > 1 && same(p, ends[s][0], tol);
      if (!closed) {
        let q = ends[s][0];
        for (;;) { const k = near(q); if (!k) break; used[k.i] = true; back.push({ i: k.i, rev: !k.rev }); q = k.rev ? ends[k.i][0] : ends[k.i][1]; }
      }
      out.push({ items: back.reverse().concat(items), closed });
    }
    return out;
  }
  // the entities of a chain in order and direction
  const chainEnts = (ents, ch) => ch.items.map(it => it.rev ? reverse(ents[it.i]) : copy(ents[it.i]));
  // signed area of a closed chain (+ counter-clockwise), exact for lines and arcs
  function chainArea(list) {
    let a = 0;
    for (const e of list) {
      if (e.t === 'arc') { const p0 = start(e), p1 = end(e); a += cross(p0, p1) / 2 + e.r * e.r / 2 * (e.sw - Math.sin(e.sw)); }
      else if (e.t === 'line') a += cross(e.a, e.b) / 2;
      else if (e.t === 'spline') a += spIntegrate(e, (t, p, d) => cross(p, d) / 2);
    }
    return a;
  }
  const chainLength = list => list.reduce((s, e) => s + length(e), 0);

  // ---------------------------------------------------------------- transforms
  // m = [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. Uniform scale, rotation, mirror and moves keep arcs
  // as arcs; any other matrix turns them into splines.
  function transform(e, m) {
    const T = p => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
    if (isAnno(e)) return draft().transform(e, m);
    if (e.t === 'pt') return pt(T(e.p));
    if (e.t === 'line') return line(T(e.a), T(e.b));
    if (isXL(e)) { const q = T(e.p); return xline(q, sub(T(add(e.p, e.d)), q), e.ray); }
    if (e.t === 'spline') return { ...copy(e), cp: e.cp.map(T) };
    const det = m[0] * m[3] - m[1] * m[2], sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
    const conformal = Math.abs(sx - sy) < 1e-12 * Math.max(1, sx) && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-12 * Math.max(1, sx * sx);
    if (conformal) {
      const flip = det < 0, rot = Math.atan2(m[1], m[0]);
      return arc(T(e.c), e.r * sx, flip ? -(e.a0) + rot : e.a0 + rot, flip ? -e.sw : e.sw);
    }
    const s = ellipse(e.c, e.r, e.r, 0, e.a0, e.sw); return { ...s, cp: s.cp.map(T) };
  }
  const translate = (dx, dy) => [1, 0, 0, 1, dx, dy];
  const rotate = (ang, c) => { const co = Math.cos(ang), si = Math.sin(ang), cx = c ? c[0] : 0, cy = c ? c[1] : 0; return [co, si, -si, co, cx - co * cx + si * cy, cy - si * cx - co * cy]; };
  const scale = (k, c) => { const cx = c ? c[0] : 0, cy = c ? c[1] : 0; return [k, 0, 0, k, cx - k * cx, cy - k * cy]; };
  // mirror about the line through a and b
  const mirror = (a, b) => { const u = unit(sub(b, a)), c2 = u[0] * u[0] - u[1] * u[1], s2 = 2 * u[0] * u[1]; return [c2, s2, s2, -c2, a[0] - c2 * a[0] - s2 * a[1], a[1] - s2 * a[0] + c2 * a[1]]; };

  // ---------------------------------------------------------------- lib/cad.js shapes
  // a chain (entities in order) as a cad.js shape {closed, pts: [[x, y, 0, arcR]]}: arcs over 180° in two, splines as
  // lines and arcs fitted within tol
  function toShape(list, closed, tol) {
    const pts = [], CAD = cadLib();
    const push = (p, r) => pts.push([p[0], p[1], 0, r || 0]);
    for (const e of list) {
      if (e.t === 'line') push(e.a, 0);
      else if (e.t === 'arc') { const n = Math.abs(e.sw) > PI + 1e-9 ? 2 : 1; for (let k = 0; k < n; k++) push(at(e, k / n), Math.sign(e.sw) * e.r); }
      else if (e.t === 'spline') {
        const P = flatten(e, 0.00005), segs = CAD ? CAD.fitPath(P, tol || 0.0002) : P.slice(1).map(p => ({ t: 'L', x: p[0], y: p[1] }));
        let last = P[0];
        for (const s of segs) { const r = s.t === 'A' ? (s.ccw ? 1 : -1) * Math.hypot(last[0] - s.cx, last[1] - s.cy) : 0; push(last, r); last = [s.x, s.y]; }
      }
    }
    if (!closed && list.length) push(end(list[list.length - 1]), 0);
    return { closed: !!closed, pts };
  }
  // cad.js shapes (with fillets and arcs) as entities, in order
  function fromShapes(shapes) {
    const out = [], CAD = cadLib();
    for (const sh of shapes) {
      const P = (sh.pts || []).map(p => [+p[0], +p[1], Math.abs(+p[2] || 0), +p[3] || 0]), n = P.length, closed = !!sh.closed;
      if (n < 2) continue;
      // segment i runs from point i to the next; fil[i] is the fillet at the start of segment i
      const segs = [], fil = [];
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = P[i], b = P[(i + 1) % n];
        if (dist(a, b) < 1e-9) continue;
        segs.push(a[3] && CAD ? (A => arc(A.c, A.R, A.a0, A.sweep))(CAD.arcSeg(a, b, a[3])) : line(a, b)); fil.push(a[2]);
      }
      const m = segs.length, arcsAfter = Array(m).fill(null);
      for (let j = 0; j < m; j++) {
        const i = j - 1; if (!fil[j] || (i < 0 && !closed)) continue;
        const k = (i + m) % m, e1 = segs[k], e2 = segs[j];
        if (e1.t !== 'line' || e2.t !== 'line') continue;
        try { const f = fillet(e1, e2, fil[j], lerp(e1.a, e1.b, 0.1), lerp(e2.a, e2.b, 0.9)); segs[k] = f.e1; segs[j] = f.e2; arcsAfter[k] = f.arc; } catch (e) { /* too big a fillet: left sharp */ }
      }
      for (let j = 0; j < m; j++) { out.push(segs[j]); if (arcsAfter[j]) out.push(arcsAfter[j]); }
    }
    return out;
  }
  const cadLib = () => root.CAD || (typeof require !== 'undefined' ? (() => { try { return require('./cad.js'); } catch (e) { return null; } })() : null);

  const api = {
    EPS, TOL, MAXPTS, XL, norm2pi, sweepCCW, sane, isAnno, isCurve, isXL, isWire, pt, line, arc, circle, xline, isCircle, arcCenter, arc3, circle3, arcRadius, arcTangent, bezier, ellipse, splineThrough,
    spEval, spSplit, spFlatten, at, start, end, mid, tangent, length, flatten, bbox, arcT, nearest, intersect, piece, splitAt,
    reverse, copy, sameGeom, duplicates, shape, shapeMove, grips, endGrips, moveGrip, tAtLength, equalTs, filletChain, chamferChain, stretch, trimAt, trim1, trim2, divide, trimBetween, extend, breakAtCrossings, side, fillet, chamfer, offset, chains,
    chainEnts, chainArea, chainLength, transform, translate, rotate, scale, mirror, toShape, fromShapes, dist, segDist,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CADGeom = api;
})(this);
