// High-efficiency milling (HEM) toolpaths: light radial stepover, full flute depth, constant engagement, climb
// milling, with speeds and feeds worked out from surface speed, chip load and radial chip thinning.
// Three operations, inch:
//   profile  outside of a rectangle (with corner radius) or a circle, from rectangular or even stock
//   pocket   circular pocket: helix down at the centre, spiral out, finish the wall
//   slot     trochoidal slot between two points, open ended or started with a helix
// Every toolpath is a list of moves (G0 / G1 / G2 / G3 with absolute arc centres) that is written out as G-code
// (toGcode) or as a Mazatrol program of MANL PRG units through MACH1 (toMazatrol), laid out the way the engraving
// app writes them: each unit starts with G0 G90 X Y S M3, G0 G17 Z and a G1 G94 Z F, arcs stay G2/G3 with I J,
// and a job too long for one unit carries on in the next over the same point.
(function (root) {
  'use strict';

  const num = (v, d = 0) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const TAU = 2 * Math.PI;

  // ---------------------------------------------------------------- materials
  // The numbers come from the Feeds and Speeds library (lib/feeds.js): solid carbide end mills (surface speed, chip
  // as a fraction of D, unit power), its finish factors and its coatings. Without it, these starting points.
  const Feeds = () => root.FEEDS || (typeof require !== 'undefined' ? (() => { try { return require('./feeds.js'); } catch (e) { return null; } })() : null);
  const LOCAL_MATERIALS = {
    a36:    { name: 'A36 / 1018 mild steel',     sfmR: 500,  sfmF: 450,  k: 0.006,  hp: 1.0 },
    s1045:  { name: '1045 medium carbon steel',  sfmR: 450,  sfmF: 400,  k: 0.0055, hp: 1.1 },
    s4140:  { name: '4140 prehard (~30 HRC)',    sfmR: 350,  sfmF: 320,  k: 0.005,  hp: 1.3 },
    ss304:  { name: '304 / 316 stainless',       sfmR: 350,  sfmF: 300,  k: 0.0045, hp: 1.4 },
    ci:     { name: 'Gray cast iron',            sfmR: 450,  sfmF: 400,  k: 0.006,  hp: 0.6 },
    al6061: { name: '6061 aluminum',             sfmR: 1200, sfmF: 1200, k: 0.009,  hp: 0.3 },
    ti64:   { name: 'Ti-6Al-4V titanium',        sfmR: 200,  sfmF: 180,  k: 0.004,  hp: 1.2 },
  };
  // name -> {name, sfmR, sfmF, k, kF, hp} (k, kF: rough and finish chip per tooth as a fraction of D)
  const MATERIALS = (() => {
    const F = Feeds(); if (!F) { const o = {}; for (const [k, m] of Object.entries(LOCAL_MATERIALS)) o[k] = Object.assign({ kF: 0.003 / 0.75 }, m); return o; }
    const o = {}; for (const [k, m] of Object.entries(F.MATERIALS)) o[k] = { name: m.name, sfmR: m.em.sfm, sfmF: Math.round(m.em.sfm * F.OPS.finish.sfm), k: m.em.k, kF: m.em.k * F.OPS.finish.k, hp: m.hp };
    return o;
  })();
  const COATINGS = (() => { const F = Feeds(); return F ? F.COATINGS : { auto: { name: 'Best for the material', f: { st: 1, ss: 1, ci: 1, al: 1, ti: 1 } } }; })();
  // the numbers for a material, tool diameter and coating (blank fields in the settings use these)
  function matNumbers(c, D) {
    const F = Feeds(), m = MATERIALS[c.mat] || MATERIALS.a36, group = F && F.GROUP[c.mat] || 'st';
    const coat = (COATINGS[c.coating] || COATINGS.auto || { f: {} }).f[group] || 1;
    return { sfmR: Math.round(m.sfmR * coat), sfmF: Math.round(m.sfmF * coat), fzR: +(m.k * D).toFixed(5), fzF: +(m.kF * D).toFixed(5), hp: m.hp, coat };
  }

  const DEFAULTS = {
    op: 'profile',
    // outside profile
    shape: 'rect', partW: '4', partH: '3', cornerR: '0.25', partD: '3', cx: '0', cy: '0',
    // stockType: even = passes around the part, from the stock per side in to the wall (the default);
    // rect = clear a rectangular block, corners and all
    stockType: 'even', stockX: '5', stockY: '4', stockW: '0.5',
    // circular pocket
    pocketD: '3', helixD: '0.375', ramp: '2',
    // trochoidal slot
    x1: '-3', y1: '0', x2: '3', y2: '0', slotW: '1', slotEntry: 'open',
    // depth
    depth: '2.375', apMax: '0',
    // tool
    toolD: '0.75', flutes: '5', loc: '2.5', stick: '2.625', toolNo: '1',
    // cutting data
    // blank = from the material and coating (lib/feeds.js); a number overrides
    mat: 'a36', coating: 'auto', sfmR: '', fzR: '', thin: true, sfmF: '', fzF: '', unitHp: '',
    rpmR: '', feedR: '', rpmF: '', feedF: '',
    // toolpath
    // passes: both (rough + finish) | rough (rough only, cut to size) | finish (finish only, part already roughed)
    passes: 'both',
    // where the passes start: off = automatic; on = each loop starts at its point nearest (entryX, entryY)
    entryOn: false, entryX: '0', entryY: '0',
    ae: '0.06', finish: true, finStock: '0.012', spring: false, dir: 'climb', leadR: '0.25',
    link: 'depth', lift: '0.02', rampPct: '50', airFeed: '50',
    // trochoidal loops: the back half of each loop runs through ground already cut, at this % of the roughing feed
    retPct: '200',
    // lower the feed where the cutter wraps more of the cut than the stepover intends (simulated)
    slowDown: true,
    // machine and output
    maxRpm: '10000', hp: '20', rapid: '1000',
    prog: '1000', wcs: 'G54', cool: 'M8', toolChange: true, home: true, lineNums: false, dec: '4',
    // safeZ: clearance plane (in and out, above clamps); rapidZ: rapid plane (rapid down to it, then feed);
    // retract: between cuts the tool lifts to the rapid plane or all the way to the clearance plane
    safeZ: '1', rapidZ: '0.1', retract: 'rapid', fileName: '',
    // Mazatrol
    // your own shapes: points [x, y, fillet r]; cop: outside | pocket | path
    shapes: [{ closed: true, pts: [[-2, -1.5, 0.25], [2, -1.5, 0.25], [2, 0, 0.25], [0.5, 0, 0.25], [0.5, 1.5, 0.25], [-2, 1.5, 0.25]] }],
    // construction geometry (never machined): {t: 'point', x, y} | {t: 'line', x, y, a} through a point at a|
    // {t: 'line2', x1, y1, x2, y2} through two points | {t: 'circle', x, y, d}
    cons: [],
    cop: 'outside', strategy: 'offset', pocketStrategy: 'auto',
    // open profile: the path is the finished wall; openSide: which side of it (along its direction) the stock is on
    openSide: 'left', openStock: '0.5', openExt: '', openDir: 'oneway',
    // outside profile, offset loops: pieces of loops between stretches of air, zigzag (no lifts) or one way (all climb)
    pieceDir: 'zigzag', stockM: '0.5', smoothR: '0.15', trochD: '0.375', dxfUnits: 'auto',
    mazCtl: 'MatrixM', mazName: '', mazTool: 'END MILL', mazNom: '', mazSuf: 'A', mazMat: 'CBN STL', mazInitZ: '1',
  };

  const OPS = { profile: 'OUTSIDE PROFILE', pocket: 'CIRCULAR POCKET', slot: 'TROCHOIDAL SLOT', custom: 'CUSTOM SHAPE' };

  // ---------------------------------------------------------------- speeds and feeds
  // Radial chip thinning: below half the diameter the chip is thinner than the feed per tooth, so the programmed
  // feed per tooth is raised by D / (2·sqrt(D·ae − ae²)) to keep the real chip at the target.
  function rctf(D, ae) { return ae > 0 && ae < D / 2 ? D / (2 * Math.sqrt(D * ae - ae * ae)) : 1; }

  function calc(c) {
    const D = Math.max(0.001, Math.abs(num(c.toolD, 0.75))), R = D / 2;
    const Z = Math.max(1, Math.round(num(c.flutes, 4)));
    const depth = Math.abs(num(c.depth, 0.5));
    const apMax = Math.abs(num(c.apMax, 0));
    const levels = apMax > 0 && apMax < depth - 1e-9 ? Math.ceil(depth / apMax - 1e-9) : 1;
    const ap = depth / levels;
    const ae = Math.min(D, Math.max(0.001, Math.abs(num(c.ae, 0.1 * D))));
    const maxRpm = Math.max(1, num(c.maxRpm, 10000));
    const thin = c.thin ? rctf(D, ae) : 1;
    const side = (sfm, fz, rpmO, feedO, factor) => {
      const want = sfm * 12 / (Math.PI * D);
      const rpmSet = num(rpmO, 0) > 0 ? Math.round(num(rpmO)) : Math.round(Math.min(want, maxRpm));
      const fzProg = fz * factor;
      const feedSet = num(feedO, 0) > 0 ? num(feedO) : rpmSet * Z * fzProg;
      return { rpm: rpmSet, rpmWant: Math.round(want), clamped: !(num(rpmO, 0) > 0) && want > maxRpm, sfm: rpmSet * Math.PI * D / 12,
        fzProg: feedSet / (rpmSet * Z), fzReal: feedSet / (rpmSet * Z) / factor, feed: Math.round(feedSet * 10) / 10 };
    };
    const auto = matNumbers(c, D), over = v => num(v, 0) > 0 ? num(v, 0) : null;
    const sfmR = over(c.sfmR) || auto.sfmR, sfmF = over(c.sfmF) || auto.sfmF;
    const r = side(sfmR, Math.abs(over(c.fzR) || auto.fzR), c.rpmR, c.feedR, thin);
    const fin = Math.abs(num(c.finStock, 0));
    const f = side(sfmF, Math.abs(over(c.fzF) || auto.fzF), c.rpmF, c.feedF, 1);
    const unitHp = Math.max(0, over(c.unitHp) || auto.hp);
    const mrr = ae * ap * r.feed, hpNeed = mrr * unitHp;
    return {
      D, R, Z, depth, levels, ap, ae, thin, maxRpm, rough: r, fin: f, auto, finStock: c.finish ? fin : 0,
      mrr, hpNeed, hpMachine: Math.max(0, num(c.hp, 0)), unitHp,
      mrrFin: fin * depth * f.feed,
      airFeed: Math.max(0.1, num(c.airFeed, 50)),
      helixFeed: Math.round(r.feed * Math.min(100, Math.max(5, num(c.rampPct, 50)))) / 100,
      retFeed: Math.round(r.feed * Math.min(500, Math.max(100, num(c.retPct, 200))) / 10) / 10,
      safeZ: num(c.safeZ, 1), rapidZ: Math.min(num(c.rapidZ, 0.1), num(c.safeZ, 1)), rapid: Math.max(1, num(c.rapid, 1000)),
      retractZ: c.retract === 'clear' ? num(c.safeZ, 1) : Math.min(num(c.rapidZ, 0.1), num(c.safeZ, 1)),
      loc: Math.abs(num(c.loc, 0)), stick: Math.abs(num(c.stick, 0)), toolNo: Math.max(0, Math.round(num(c.toolNo, 1))),
    };
  }

  // ---------------------------------------------------------------- path builder
  // Moves: {t:'G0'|'G1'|'G2'|'G3', x, y, z, f, k} with arc centre cx, cy; {t:'SEC', name, rpm}; {t:'C', s}.
  // k: rapid, air (feed moves in the clear), entry (helix and lead arcs), rough, link, finish.
  function builder() {
    const m = [];
    let P = { x: NaN, y: NaN, z: NaN };
    const eq = (a, b) => Math.abs(a - b) < 1e-9;
    const B = {
      m,
      pos: () => P,
      note: s => m.push({ t: 'C', s }),
      sec: (name, rpm) => m.push({ t: 'SEC', name, rpm }),
      g0(x, y, z, flag) {
        x = x == null ? P.x : x; y = y == null ? P.y : y; z = z == null ? P.z : z;
        if (eq(x, P.x) && eq(y, P.y) && eq(z, P.z)) return;
        m.push({ t: 'G0', x, y, z, k: 'rapid', flag }); P = { x, y, z };
      },
      g1(x, y, z, f, k) {
        x = x == null ? P.x : x; y = y == null ? P.y : y; z = z == null ? P.z : z;
        if (eq(x, P.x) && eq(y, P.y) && eq(z, P.z)) return;
        m.push({ t: 'G1', x, y, z, f, k }); P = { x, y, z };
      },
      arc(ccw, x, y, cx, cy, z, f, k) {       // 180° or less
        z = z == null ? P.z : z;
        m.push({ t: ccw ? 'G3' : 'G2', x, y, z, cx, cy, f, k }); P = { x, y, z };
      },
      // turn about a centre from where the tool is by sweep radians, in pieces of 180° or less, with Z going
      // evenly to zEnd (a helix when it changes)
      turn(ccw, cx, cy, sweep, zEnd, f, k) {
        const r = Math.hypot(P.x - cx, P.y - cy), a0 = Math.atan2(P.y - cy, P.x - cx), z0 = P.z;
        if (zEnd == null) zEnd = z0;
        const n = Math.max(1, Math.ceil(sweep / Math.PI - 1e-9)), full = Math.abs(sweep / TAU - Math.round(sweep / TAU)) < 1e-9;
        const x0 = P.x, y0 = P.y;
        for (let i = 1; i <= n; i++) {
          const a = a0 + (ccw ? 1 : -1) * sweep * i / n, last = i === n && full;   // whole turns end exactly where they began
          B.arc(ccw, last ? x0 : cx + r * Math.cos(a), last ? y0 : cy + r * Math.sin(a), cx, cy, z0 + (zEnd - z0) * i / n, f, k);
        }
      },
      // moves worked out on another builder, taken over as they are
      append(ms) { for (const mv of ms) { m.push(mv); if (mv.x !== undefined) P = { x: mv.x, y: mv.y, z: mv.z }; } },
      run(prims, z, f, k) {
        for (const p of prims) {
          if (p.t === 'L') B.g1(p.x, p.y, z, f, k);
          else B.arc(p.ccw, p.x, p.y, p.cx, p.cy, z, f, k);
        }
      },
    };
    return B;
  }

  // A rounded rectangle about (cx, cy): half sizes A, B, corner radius rho, clockwise from the middle of the right
  // side. With A = B = rho it is a circle (four quarter arcs).
  function rrLoop(cx, cy, A, B, rho, ccw) {
    rho = Math.max(0, Math.min(rho, A, B));
    const e = 1e-9, sx = A - rho, sy = B - rho, P = [];
    const L = (x, y) => P.push({ t: 'L', x, y }), Ar = (x, y, ax, ay) => P.push({ t: 'A', ccw: false, x, y, cx: ax, cy: ay });
    if (sy > e) L(cx + A, cy - sy);
    if (rho > e) Ar(cx + sx, cy - B, cx + sx, cy - sy);
    if (sx > e) L(cx - sx, cy - B);
    if (rho > e) Ar(cx - A, cy - sy, cx - sx, cy - sy);
    if (sy > e) L(cx - A, cy + sy);
    if (rho > e) Ar(cx - sx, cy + B, cx - sx, cy + sy);
    if (sx > e) L(cx + sx, cy + B);
    if (rho > e) Ar(cx + A, cy + sy, cx + sx, cy + sy);
    if (sy > e) L(cx + A, cy);
    if (!ccw) return P;
    // the same loop counter-clockwise, still starting and ending at (cx + A, cy)
    const pts = [[cx + A, cy]].concat(P.map(p => [p.x, p.y])), out = [];
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i], to = pts[i];
      out.push(p.t === 'L' ? { t: 'L', x: to[0], y: to[1] } : { t: 'A', ccw: true, x: to[0], y: to[1], cx: p.cx, cy: p.cy });
    }
    return out;
  }

  // A loop of lines and arcs (starting at p0) turned to start at its point nearest q: {S, d (direction there), prims}
  function startNear(prims, p0, q) {
    let best = null, from = p0;
    prims.forEach((pr, i) => {
      const a = from, b = [pr.x, pr.y];
      let pt;
      if (pr.t === 'L') {
        const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2)) : 0;
        pt = [a[0] + t * vx, a[1] + t * vy];
      } else {
        const r = Math.hypot(a[0] - pr.cx, a[1] - pr.cy), dir = pr.ccw ? 1 : -1, a0 = Math.atan2(a[1] - pr.cy, a[0] - pr.cx);
        let sw = ((Math.atan2(b[1] - pr.cy, b[0] - pr.cx) - a0) * dir % TAU + TAU) % TAU; if (sw < 1e-9) sw = TAU;
        const rel = ((Math.atan2(q[1] - pr.cy, q[0] - pr.cx) - a0) * dir % TAU + TAU) % TAU;
        pt = rel <= sw ? [pr.cx + r * Math.cos(a0 + dir * rel), pr.cy + r * Math.sin(a0 + dir * rel)] : (Math.hypot(q[0] - a[0], q[1] - a[1]) < Math.hypot(q[0] - b[0], q[1] - b[1]) ? a : b);
      }
      const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
      if (!best || d < best.d - 1e-12) best = { i, pt, d, a };
      from = b;
    });
    const i = best.i, pr = prims[i], S = best.pt, tail = { ...pr }, head = { ...pr, x: S[0], y: S[1] };
    const same = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 1e-9;
    const out = [];
    if (!same(S, [pr.x, pr.y])) out.push(tail);                       // S on to the end of its piece
    out.push(...prims.slice(i + 1), ...prims.slice(0, i));
    if (!same(best.a, S)) out.push(head);                              // the start of its piece up to S
    let d;
    if (pr.t === 'L') { const l = Math.hypot(pr.x - best.a[0], pr.y - best.a[1]) || 1; d = [(pr.x - best.a[0]) / l, (pr.y - best.a[1]) / l]; }
    else { const r = Math.hypot(S[0] - pr.cx, S[1] - pr.cy) || 1, ux = (S[0] - pr.cx) / r, uy = (S[1] - pr.cy) / r; d = pr.ccw ? [-uy, ux] : [uy, -ux]; }
    return { S, d, prims: out };
  }
  // distance from a rounded rectangle's edge (positive outside)
  function rrDist(p, cx, cy, A, Bh, r) {
    r = Math.max(0, Math.min(r, A, Bh));
    const dx = Math.abs(p[0] - cx) - (A - r), dy = Math.abs(p[1] - cy) - (Bh - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  }

  // Conventional milling: the climb path mirrored across the shape's axis of symmetry (the point p0, direction u),
  // which runs every loop the other way round over the same ground.
  function mirror(moves, p0, u) {
    const ref = (x, y) => { const dx = x - p0[0], dy = y - p0[1], d = dx * u[0] + dy * u[1]; return [p0[0] + 2 * d * u[0] - dx, p0[1] + 2 * d * u[1] - dy]; };
    for (const m of moves) {
      if (m.x === undefined || isNaN(m.x)) continue;
      [m.x, m.y] = ref(m.x, m.y);
      if (m.cx !== undefined) { [m.cx, m.cy] = ref(m.cx, m.cy); m.t = m.t === 'G2' ? 'G3' : 'G2'; }
    }
  }

  function levelsZ(K) { const z = []; for (let i = 1; i <= K.levels; i++) z.push(-K.depth * i / K.levels); return z; }

  // between cuts: up to the retract height (rapid plane or clearance plane), across, rapid down to the rapid plane
  function hop(B, K, x, y) {
    B.g0(null, null, Math.max(K.retractZ, B.pos().z));
    B.g0(x, y);
    B.g0(null, null, K.rapidZ);
  }
  // start of the program: over the first point, down to the clearance plane (tool length offset there), then the rapid plane
  function start(B, K, x, y) {
    B.g0(x, y);
    B.g0(null, null, K.safeZ, 'tlo');
    B.g0(null, null, K.rapidZ);
  }

  // to the start of the finish pass: across at depth after roughing, or in from the top for a finish-only program
  // (the part is already roughed there, so it feeds straight down in the clear)
  function approach(B, K, p, z, fr) {
    if (isNaN(B.pos().x)) { start(B, K, p[0], p[1]); B.g1(null, null, z, K.airFeed, 'air'); }
    else B.g1(p[0], p[1], z, fr, 'link');
  }

  // ---------------------------------------------------------------- outside profile
  function genProfile(c, K, B, W, G) {
    const cx = num(c.cx), cy = num(c.cy), R = K.R, a = K.finStock;
    let hx, hy, rc;
    if (c.shape === 'circle') { hx = hy = rc = Math.abs(num(c.partD, 3)) / 2; }
    else { hx = Math.abs(num(c.partW, 4)) / 2; hy = Math.abs(num(c.partH, 3)) / 2; rc = Math.min(Math.abs(num(c.cornerR, 0)), hx, hy); }
    if (!(hx > 0 && hy > 0)) { W.push('Enter the part size.'); return; }
    let A0, B0, r0;
    if (c.stockType === 'rect') { A0 = Math.abs(num(c.stockX, 0)) / 2 + R; B0 = Math.abs(num(c.stockY, 0)) / 2 + R; r0 = R; }
    else { const w = Math.abs(num(c.stockW, 0)); A0 = hx + w + R; B0 = hy + w + R; r0 = rc + w + R; }
    G.part = { t: 'rr', cx, cy, A: hx, B: hy, r: rc };
    G.stock = { t: 'rr', cx, cy, A: A0 - R, B: B0 - R, r: r0 - R };
    const Aa = hx + R + a, Ba = hy + R + a, ra = rc + R + a;
    const dA = A0 - Aa, dB = B0 - Ba;
    if (dA < -1e-9 || dB < -1e-9) W.push('The stock is smaller than the part plus finish stock on ' + (dA < -1e-9 && dB < -1e-9 ? 'both axes' : dA < -1e-9 ? 'X' : 'Y') + '.');
    const N = Math.max(0, Math.ceil(Math.max(dA, dB, 0) / K.ae - 1e-6));
    const rings = [];
    for (let k = 1; k <= N; k++) {
      const t = k / N, A = A0 + (Aa - A0) * t, Bb = B0 + (Ba - B0) * t, rho = Math.min(r0 + (ra - r0) * t, A, Bb);
      rings.push({ A, B: Bb, r: rho });
    }
    const stepX = N ? Math.max(dA, 0) / N : 0, stepY = N ? Math.max(dB, 0) / N : 0, step = Math.max(stepX, stepY);
    // radial engagement where the loop turns a corner: the corner's outermost point moves in by this much per loop
    const dr = N ? (ra - r0) / N : 0, corner = N ? ((stepX + stepY + 2 * dr) / Math.SQRT2 - dr) : 0;
    G.info.push(N ? N + ' roughing loop' + (N === 1 ? '' : 's') + ' per level, stepover ' + fx(stepX) + (Math.abs(stepX - stepY) > 1e-6 ? ' in X, ' + fx(stepY) + ' in Y' : '') +
      ', about ' + fx(corner) + ' at the corners' : 'No roughing: the stock is already at the finish size.');
    if (corner > 1.6 * K.ae && N) W.push('Engagement at the stock corners is about ' + fx(corner) + ' (' + Math.round(corner / K.D * 100) + '% of the tool). Round stock corners, even stock or a smaller stepover bring it down.');
    let Lr = Math.max(0.01, Math.abs(num(c.leadR, 0.25)));
    const need = Math.max(step, a) * 1.05;
    if (Lr < need) { W.push('Lead radius raised to ' + fx(need) + ' so every loop starts in the clear (it must be more than the stepover).'); Lr = need; }
    const zs = levelsZ(K), fr = K.rough.feed, air = K.airFeed, lift = Math.abs(num(c.lift, 0.02));
    let started = false, moved = 0;
    // where each loop starts: the middle of the right side, or the point nearest the chosen entry (the conventional
    // program is this one mirrored, so the entry is mirrored first to land where it was asked for)
    const E = c.entry ? (c.dir === 'conv' ? [c.entry[0], 2 * cy - c.entry[1]] : c.entry) : null;
    const plan = (A, Bh, rho, clear) => {
      const loop = rrLoop(cx, cy, A, Bh, rho), p0 = [cx + A, cy];
      const lead = st => { const nl = [-st.d[1], st.d[0]], C = [st.S[0] + nl[0] * Lr, st.S[1] + nl[1] * Lr]; return { ...st, C, L: [C[0] - st.d[0] * Lr, C[1] - st.d[1] * Lr], E: [C[0] + st.d[0] * Lr, C[1] + st.d[1] * Lr] }; };
      const std = lead({ S: p0, d: [0, -1], prims: loop });
      if (!E) return std;
      const at = lead(startNear(loop, p0, E));
      if (clear(at.L)) return at;
      moved++; return std;
    };
    const emit = (P, z, f, k, twice) => {
      B.arc(true, P.S[0], P.S[1], P.C[0], P.C[1], z, f, k === 'finish' ? 'finish' : 'entry');
      B.run(P.prims, z, f, k); if (twice) B.run(P.prims, z, f, k);
      B.arc(true, P.E[0], P.E[1], P.C[0], P.C[1], z, f, k === 'finish' ? 'finish' : 'entry');
    };
    // the lead-in starts in the clear: outside the stock for the first loop, outside the loop before for the rest
    const plans = rings.map((g, j) => plan(g.A, g.B, g.r, j === 0 ? L => rrDist(L, cx, cy, A0, B0, r0) >= -1e-9 : L => rrDist(L, cx, cy, rings[j - 1].A, rings[j - 1].B, rings[j - 1].r) >= -1e-9));
    if (rings.length && c.rough) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        plans.forEach((P, j) => {
          if (j === 0) {
            if (!started) { start(B, K, P.L[0], P.L[1]); started = true; } else hop(B, K, P.L[0], P.L[1]);
            B.g1(null, null, z, air, 'air');
          } else if (c.link === 'lift') { B.g0(null, null, z + lift); B.g0(P.L[0], P.L[1]); B.g1(null, null, z, air, 'air'); }
          else B.g1(P.L[0], P.L[1], z, fr, 'link');
          emit(P, z, fr, 'rough');
        });
      });
    }
    if (c.finish) {
      const Af = hx + R, Bf = hy + R, rf = rc + R, z = -K.depth;
      const P = plan(Af, Bf, rf, L => rrDist(L, cx, cy, hx + R + a, hy + R + a, rc + R + a) >= -1e-9 || !c.rough);
      B.sec('FINISH', K.fin.rpm);
      if (!started) { start(B, K, P.L[0], P.L[1]); started = true; } else hop(B, K, P.L[0], P.L[1]);
      B.g1(null, null, z, air, 'air');
      emit(P, z, K.fin.feed, 'finish', c.spring);
    }
    if (E && moved) W.push(moved + ' pass' + (moved > 1 ? 'es start' : ' starts') + ' at the middle of the right side instead: at the chosen entry the lead-in would begin on stock.');
    if (started) B.g0(null, null, K.safeZ);
    G.axis = [[cx, cy], [1, 0]];
    G.climbNote = 'Outside profile: climb is clockwise with the spindle in M3.';
  }

  // ---------------------------------------------------------------- circular pocket
  function genPocket(c, K, B, W, G) {
    const cx = num(c.cx), cy = num(c.cy), R = K.R, a = K.finStock, Dp = Math.abs(num(c.pocketD, 3));
    G.part = { t: 'circle', cx, cy, r: Dp / 2, hole: true };
    const Rf = Dp / 2 - R, Ra = Rf - a;
    if (!(Ra > 0.001)) { W.push('The pocket is too small for this tool: it must be larger than the tool diameter plus twice the finish stock.'); return; }
    let rh = Math.abs(num(c.helixD, 0.5 * K.D)) / 2;
    if (rh > Ra) { rh = Ra; W.push('Helix diameter cut to ' + fx(2 * rh) + ' to fit the pocket.'); }
    if (rh < 0.01) { rh = Math.min(Ra, 0.1 * K.D); W.push('Helix diameter raised to ' + fx(2 * rh) + ': a helix needs some diameter.'); }
    const ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180, drop = TAU * rh * Math.tan(ramp);
    G.info.push('Helix Ø' + fx(2 * rh) + ' (bores Ø' + fx(2 * rh + K.D) + ') at ' + fx(ramp * 180 / Math.PI) + '°: ' + fx(drop) + ' down per turn');
    const zs = levelsZ(K), fr = K.rough.feed, hf = K.helixFeed;
    const n = Math.max(0, Math.ceil((Ra - rh) / K.ae - 1e-6)), s = n ? (Ra - rh) / n : 0;
    if (n) G.info.push(n + ' spiral turn' + (n === 1 ? '' : 's') + ' per level at ' + fx(s) + ' stepover');
    if (c.rough) B.sec('ROUGH', K.rough.rpm), start(B, K, cx + rh, cy);
    let zTop = K.rapidZ;
    if (c.rough) zs.forEach((z, li) => {
      B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
      if (li) B.g1(cx + rh, cy, null, fr, 'link');
      const turns = Math.max(1, Math.ceil((zTop - z) / drop - 1e-9));
      B.turn(true, cx, cy, turns * TAU, z, hf, 'entry');
      B.turn(true, cx, cy, TAU, z, hf, 'entry');                          // flat turn to clean the helix floor
      let r = rh;
      for (let i = 0; i < n; i++) {                                       // half circles about two centres: +s a turn
        B.arc(true, cx - r, cy, cx, cy, z, fr, 'rough');
        B.arc(true, cx + r + s, cy, cx + s / 2, cy, z, fr, 'rough');
        r += s;
      }
      if (n) B.turn(true, cx, cy, TAU, z, fr, 'rough');
      zTop = z;
    });
    if (c.finish) {
      const z = -K.depth, Lr = Math.max(a * 1.05, Math.min(Math.abs(num(c.leadR, 0.25)), Rf / 2)), Sx = cx + Rf;
      B.sec('FINISH', K.fin.rpm);
      approach(B, K, [Sx - Lr, cy - Lr], z, fr);
      B.arc(true, Sx, cy, Sx - Lr, cy, z, K.fin.feed, 'finish');
      B.turn(true, cx, cy, TAU, z, K.fin.feed, 'finish');
      if (c.spring) B.turn(true, cx, cy, TAU, z, K.fin.feed, 'finish');
      B.arc(true, Sx - Lr, cy + Lr, Sx - Lr, cy, z, K.fin.feed, 'finish');
    }
    B.g0(null, null, K.safeZ);
    G.axis = [[cx, cy], [1, 0]];
    G.climbNote = 'Pocket: climb is counter-clockwise with the spindle in M3.';
  }

  // ---------------------------------------------------------------- trochoidal slot
  function genSlot(c, K, B, W, G) {
    const P1 = [num(c.x1), num(c.y1)], P2 = [num(c.x2), num(c.y2)], R = K.R, a = K.finStock, Ws = Math.abs(num(c.slotW, 1));
    let L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
    const u = L > 1e-9 ? [(P2[0] - P1[0]) / L, (P2[1] - P1[1]) / L] : [1, 0], nv = [-u[1], u[0]];
    if (L <= 1e-9) L = 0;
    G.part = { t: 'slot', p1: P1, p2: P2, w: Ws };
    const hw = Ws / 2 - R;
    let r = hw - a;
    if (!(r > 0.02 * K.D)) { W.push('The slot must be wider than the tool (plus twice the finish stock) to cut it trochoidally. For a slot the width of the tool, slot it conventionally at a reduced depth.'); return; }
    const n = L ? Math.max(1, Math.ceil(L / K.ae - 1e-6)) : 0, s = n ? L / n : 0;
    r = trochR(r, s || K.ae);                                  // the return half circles reach sqrt(r² + s²/4)
    const at = (k, off) => [P1[0] + k * s * u[0] + off * nv[0], P1[1] + k * s * u[1] + off * nv[1]];
    G.info.push('Loop Ø' + fx(2 * r) + ' (cuts ' + fx(2 * r + K.D) + ' wide), ' + (n + 1) + ' loops at ' + fx(s) + ' apart' + (Ws / K.D < 1.3 ? '. A slot less than about 1.3× the tool is tight for trochoidal milling.' : ''));
    if (Ws / K.D < 1.2) W.push('Slot width is only ' + (Ws / K.D).toFixed(2) + '× the tool diameter: the loops are small and the engagement will run high. A smaller tool suits this slot better.');
    const helix = c.slotEntry === 'helix', ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180, drop = TAU * r * Math.tan(ramp);
    if (helix) G.info.push('Helix entry Ø' + fx(2 * r) + ' at ' + fx(ramp * 180 / Math.PI) + '°: ' + fx(drop) + ' down per turn');
    else G.info.push('Open entry: start (X1, Y1) must be off the part by at least half the slot width plus the tool radius');
    const zs = levelsZ(K), fr = K.rough.feed, air = K.airFeed;
    const B0 = at(0, -r);
    if (c.rough) B.sec('ROUGH', K.rough.rpm);
    let zTop = K.rapidZ;
    if (c.rough) zs.forEach((z, li) => {
      B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
      if (!li) start(B, K, B0[0], B0[1]); else hop(B, K, B0[0], B0[1]);
      if (helix) {
        if (li) B.g1(null, null, zTop, air, 'air');
        const turns = Math.max(1, Math.ceil((zTop - z) / drop - 1e-9));
        const c0 = at(0, 0);
        B.turn(true, c0[0], c0[1], turns * TAU, z, K.helixFeed, 'entry');
        B.turn(true, c0[0], c0[1], TAU, z, K.helixFeed, 'entry');
      } else B.g1(null, null, z, air, 'air');
      for (let k = 0; k <= n; k++) {
        const ck = at(k, 0), Ak = at(k, r);
        B.arc(true, Ak[0], Ak[1], ck[0], ck[1], z, fr, 'rough');           // front half: the cut
        if (k < n) { const Bn = at(k + 1, -r), m = at(k + 0.5, 0); B.arc(true, Bn[0], Bn[1], m[0], m[1], z, K.retFeed, 'link'); }   // back half: the return, over cut ground
        else { const Bk = at(k, -r); B.arc(true, Bk[0], Bk[1], ck[0], ck[1], z, K.retFeed, 'link'); }
      }
      zTop = z;
    });
    if (c.finish) {
      const z = -K.depth, Lr = Math.max(a * 1.05, Math.min(Math.abs(num(c.leadR, 0.25)), hw / 2));
      const M = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2], S = [M[0] - hw * nv[0], M[1] - hw * nv[1]];
      const Lc = [S[0] + Lr * nv[0], S[1] + Lr * nv[1]];
      B.sec('FINISH', K.fin.rpm);
      approach(B, K, [Lc[0] - Lr * u[0], Lc[1] - Lr * u[1]], z, fr);
      B.arc(true, S[0], S[1], Lc[0], Lc[1], z, K.fin.feed, 'finish');
      const e0 = at(n, -hw), e1 = at(n, hw), s1 = at(0, hw), s0 = at(0, -hw), cN = at(n, 0), c0 = at(0, 0);
      const loop = () => {
        B.g1(e0[0], e0[1], z, K.fin.feed, 'finish');
        B.arc(true, e1[0], e1[1], cN[0], cN[1], z, K.fin.feed, 'finish');
        B.g1(s1[0], s1[1], z, K.fin.feed, 'finish');
        B.arc(true, s0[0], s0[1], c0[0], c0[1], z, K.fin.feed, 'finish');
        B.g1(S[0], S[1], z, K.fin.feed, 'finish');
      };
      loop(); if (c.spring) loop();
      B.arc(true, Lc[0] + Lr * u[0], Lc[1] + Lr * u[1], Lc[0], Lc[1], z, K.fin.feed, 'finish');
    }
    B.g0(null, null, K.safeZ);
    G.axis = [P1, u];
    G.climbNote = 'Slot: climb is counter-clockwise loops with the spindle in M3.';
  }

  // ---------------------------------------------------------------- your own shapes
  // Closed shapes (drawn, typed or from a DXF) as an outside profile or a pocket (shapes inside shapes are
  // islands), or any path as a trochoidal groove. Offsets come from Clipper (hem-geo.js); loops are fitted back
  // to lines and arcs. Every move is checked: links at depth only cross ground that is already cut, and leads
  // only start in the clear; otherwise the tool lifts and comes down in the clear.
  const Geo = () => root.HEMGeo || (typeof require !== 'undefined' ? require('./hem-geo.js') : null);
  const CUSTOM_OPS = { outside: 'OUTSIDE PROFILE', open: 'OPEN PROFILE', pocket: 'POCKET', path: 'TROCHOIDAL GROOVE' };

  function genCustom(c, K, B, W, G) {
    const H = Geo();
    // shapes marked CAD only (cut: false) stay in the drawing but are not machined
    const shapes = (Array.isArray(c.shapes) ? c.shapes : []).filter(s => s.cut !== false).map(s => ({ closed: !!s.closed, pts: H.filleted(s) })).filter(s => s.pts.length >= (s.closed ? 3 : 2));
    G.custom = true;
    const x = { c, K, B, W, G, H, R: K.R, a: K.finStock, zs: levelsZ(K), fr: K.rough.feed, ff: K.fin.feed, air: K.airFeed, sg: c.dir === 'conv' ? -1 : 1, tol: 0.0002 };
    const cop = CUSTOM_OPS[c.cop] ? c.cop : 'outside';
    if (!shapes.length && (c.shapes || []).some(sh => sh.cut === false)) { W.push('Every shape is marked CAD only: tick Machine on the ones to cut.'); return; }
    if (cop === 'open') {
      const open = shapes.filter(s => !s.closed);
      if (!open.length) { W.push('Draw an open path along the finished wall (Draw path; double-click or Enter to finish), then pick the side the stock is on.'); return; }
      if (open.length < shapes.length) G.info.push((shapes.length - open.length) + ' closed shape' + (shapes.length - open.length > 1 ? 's are' : ' is') + ' left out: an open profile follows open paths.');
      return customOpen(x, open.map(s => s.pts));
    }
    if (cop === 'path') {
      if (!shapes.length) { W.push('Draw a path for the groove to follow: click points on the preview, double-click to finish.'); return; }
      return customPath(x, shapes);
    }
    const closed = shapes.filter(s => s.closed).map(s => s.pts), open = shapes.length - closed.length;
    if (!closed.length) { W.push('Draw a closed shape: click points on the preview and click the first point again to close it.'); return; }
    if (open) G.info.push(open + ' open path' + (open > 1 ? 's are' : ' is') + ' left out: ' + (cop === 'pocket' ? 'pockets' : 'profiles') + ' use closed shapes.');
    const rawClosed = (Array.isArray(c.shapes) ? c.shapes : []).filter(s => s.cut !== false && s.closed && (s.pts || []).length >= 2);
    if (cop === 'pocket' && rawClosed.some(s => s.pts.some(p => +p[4]))) customPocketOpen(x, rawClosed);
    else if (cop === 'pocket') customPocket(x, closed); else customOutside(x, closed);
  }

  // A closed loop with arcs on and off. pts in travel order; side +1: the cleared side is left of travel, -1 right.
  // ok(L, arcPts) says whether a lead fits there. With near (where the tool is), the loop starts as close to it
  // as a lead fits, so one loop runs into the next without lifting; otherwise on the longest side. Larger lead
  // radii first, down to LrMin.
  function planLoop(H, pts, side, LrWant, LrMin, ok, near) {
    const n = pts.length, sides = [];
    for (let i = 0; i < n; i++) { const len = H.dist(pts[i], pts[(i + 1) % n]); if (len >= 1e-6) sides.push({ i, len }); }
    const radii = []; for (let r = LrWant; r > LrMin * 1.001; r /= 2) radii.push(r); radii.push(LrMin);
    const make = (sd, Lr) => {
      const p = pts[sd.i], q = pts[(sd.i + 1) % n];
      const d = [(q[0] - p[0]) / sd.len, (q[1] - p[1]) / sd.len], mid = sd.len >= 2 * Lr, S = mid ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] : p;
      const nl = [-d[1] * side, d[0] * side], Cc = [S[0] + nl[0] * Lr, S[1] + nl[1] * Lr];
      return { sd, mid, S, Cc, L: [Cc[0] - d[0] * Lr, Cc[1] - d[1] * Lr], E: [Cc[0] + d[0] * Lr, Cc[1] + d[1] * Lr], Lr };
    };
    const fits = P => {
      const aS = Math.atan2(P.S[1] - P.Cc[1], P.S[0] - P.Cc[0]), arc = [];
      for (let k = 0; k <= 8; k++) { const t = Math.PI / 2 * k / 8; for (const a of [aS - side * t, aS + side * t]) arc.push([P.Cc[0] + P.Lr * Math.cos(a), P.Cc[1] + P.Lr * Math.sin(a)]); }
      return ok(P.L, arc);
    };
    let best = null;
    for (const Lr of radii) {
      let cands = sides.map(sd => make(sd, Lr));
      if (near) cands.sort((u, v) => H.dist(u.L, near) - H.dist(v.L, near));
      else cands.sort((u, v) => v.sd.len - u.sd.len);
      const hit = cands.slice(0, near ? 60 : 16).find(fits);
      if (!hit) continue;
      if (!near) { best = hit; break; }
      // nearest start wins; a larger lead only if it is about as near
      if (!best || H.dist(hit.L, near) < H.dist(best.L, near) - 0.5 * Lr) best = hit;
    }
    if (!best) return null;
    const ring = [best.S]; for (let k = 1; k <= n; k++) ring.push(pts[(best.sd.i + k) % n]); if (best.mid) ring.push(best.S);
    return { L: best.L, S: best.S, E: best.E, Cc: best.Cc, Lr: best.Lr, ccw: side > 0, ring };
  }
  function emitLoop(x, P, z, f, k, twice) {
    const { B, H, tol } = x;
    B.arc(P.ccw, P.S[0], P.S[1], P.Cc[0], P.Cc[1], z, f, k === 'finish' ? 'finish' : 'entry');
    const prims = H.fitPath(H.removeDup(P.ring), tol);
    B.run(prims, z, f, k); if (twice) B.run(prims, z, f, k);
    B.arc(P.ccw, P.E[0], P.E[1], P.Cc[0], P.Cc[1], z, f, k === 'finish' ? 'finish' : 'entry');
  }
  const segOk = (a, b, ok) => { const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.01)); for (let i = 0; i <= n; i++) if (!ok([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n])) return false; return true; };
  // come down at p: from where the tool is, lift to the rapid plane, rapid over, feed down in the clear
  function comeDown(x, p, z) {
    const { B, K } = x, P = B.pos();
    if (isNaN(P.x)) start(B, K, p[0], p[1]);
    else hop(B, K, p[0], p[1]);
    B.g1(null, null, z, x.air, 'air');
  }
  // finish loops: loops in climb order already (material on the right); conventional reverses them
  function finishLoops(x, loops, okLead) {
    const { c, K, B, W, sg } = x, z = -K.depth;
    if (!loops.length) return;
    B.sec('FINISH', K.fin.rpm);
    const LrMin = Math.max(0.005, x.a * 1.1);
    for (const lp of loops) {
      const pts = sg > 0 ? lp : lp.slice().reverse();
      const here = B.pos(), near = c.entry || (isNaN(here.x) ? null : [here.x, here.y]);
      const P = planLoop(x.H, pts, sg, Math.max(LrMin, Math.abs(num(c.leadR, 0.25))), LrMin, okLead, near);
      if (!P) { W.push('No room for a lead arc on one finish loop; it was left out. Check that shape.'); continue; }
      comeDown(x, P.L, z);
      emitLoop(x, P, z, x.ff, 'finish', c.spring);
    }
  }

  function customOutside(x, polys) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x;
    const part = H.union(polys, false), partLoops = H.loops(part), outer = partLoops.filter(l => !l.hole).map(l => l.pts);
    const partC = H.union(outer, false);
    G.part = { t: 'polys', loops: partLoops.map(l => l.pts) };
    let stock;
    if (c.stockType === 'rect') {
      const m = Math.abs(num(c.stockM, 0.5)), bx = [Infinity, Infinity, -Infinity, -Infinity];
      outer.forEach(L => L.forEach(p => { bx[0] = Math.min(bx[0], p[0]); bx[1] = Math.min(bx[1], p[1]); bx[2] = Math.max(bx[2], p[0]); bx[3] = Math.max(bx[3], p[1]); }));
      stock = [[bx[0] - m, bx[1] - m], [bx[2] + m, bx[1] - m], [bx[2] + m, bx[3] + m], [bx[0] - m, bx[3] + m]];
      stock = [stock];
    } else stock = H.loops(H.offset(partC, Math.abs(num(c.stockW, 0.5)))).filter(l => !l.hole).map(l => l.pts);
    G.stock = { t: 'polys', loops: stock };
    const stockC = H.union(stock, false);
    // distance from the part (negative inside it)
    const dPart = p => H.inside(p, partC) ? -H.edgeDist(p, outer) : H.edgeDist(p, outer);
    let Hmax = 0;
    for (const L of stock) for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length], n = Math.max(1, Math.ceil(H.dist(p, q) / 0.05)); for (let k = 0; k < n; k++) Hmax = Math.max(Hmax, dPart([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n])); }
    if (!(Hmax > a + 1e-4)) { W.push('The stock is no bigger than the part plus finish stock: nothing to rough.'); }
    const envC = H.offset(stockC, R);                        // the tool touches the stock only with its centre in here
    const inAir = p => !H.inside(p, envC);
    if (!c.rough) { /* finish only */ }
    else if (c.strategy === 'troch') customOutsideTroch(x, partC, outer, stockC, dPart, Hmax, inAir);
    else if (Hmax > a + 1e-4) {
      const J = Math.ceil((Hmax - a) / K.ae - 1e-6), step = (Hmax - a) / J, rho = Math.max(0, num(c.smoothR, 0));
      G.info.push(J + ' offset loops per level at ' + fx(step) + ' stepover' + (rho ? ', inside corners of the roughing loops rounded to R' + fx(rho) : ''));
      const LrMin = step * 1.05, LrWant = Math.max(LrMin, Math.abs(num(c.leadR, 0.25)));
      B.sec('ROUGH', K.rough.rpm);
      const rings = [];
      for (let j = J - 1; j >= 0; j--) {
        const o = R + a + j * step;
        let reg = H.offset(partC, o);
        // inside corners rounded, except the last loop of a rough-only program: that one is the finished size
        if (rho > 0 && !(j === 0 && !c.finish)) reg = H.offset(H.offset(reg, rho), -rho);
        const lps = H.loops(reg).filter(l => !l.hole).map(l => l.pts).filter(L => L.some(p => !inAir(p)));
        rings.push({ o, loops: lps.map(L => sg > 0 ? L.slice().reverse() : L) });
      }
      let lost = 0;
      const envCut = H.offset(stockC, R + 0.002);               // loops are cut only where they come near the stock
      // The work: whole loops (over stock all round) and pieces of loops (over stock between stretches of air).
      const items = [];
      rings.forEach((rg, ri) => rg.loops.forEach(L => {
        if (L.some(p => !H.inside(p, envCut))) H.clipLoop(L, envCut).filter(pc => H.polyLen(pc, false) >= 1e-3).forEach(pc => items.push({ ri, o: rg.o, closed: false, pts: pc.slice(), loop: L, s0: pc.s0, s1: pc.s1 }));
        else items.push({ ri, o: rg.o, closed: true, pts: L, loop: L });
      }));
      const samp = P => { const o = [P[0]]; let acc = 0; for (let i = 1; i < P.length; i++) { acc += H.dist(P[i - 1], P[i]); if (acc >= 0.1) { o.push(P[i]); acc = 0; } } o.push(P[P.length - 1]); return o; };
      items.forEach(it => { it.sp = samp(it.pts); it.box = it.sp.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]); });
      const touches = (u, v, d) => {
        if (u.box[0] - d > v.box[2] || v.box[0] - d > u.box[2] || u.box[1] - d > v.box[3] || v.box[1] - d > u.box[3]) return false;
        for (const p of u.sp) for (const q of v.sp) if (Math.abs(p[0] - q[0]) < d && Math.abs(p[1] - q[1]) < d && H.dist(p, q) < d) return true;
        return false;
      };
      // Each piece waits for the pieces of the next loop out that it borders, so every area of stock is cleared
      // outside-in on its own and the tool finishes one area before crossing to the next.
      const byRing = []; items.forEach(it => (byRing[it.ri] = byRing[it.ri] || []).push(it));
      items.forEach(it => { it.deps = (byRing[it.ri - 1] || []).filter(o => touches(it, o, 2.5 * step + 0.1)); });
      const zig = c.pieceDir !== 'oneway';
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        const done = new Set(); let last = null;
        const hopTime = d => (K.rapidZ - z) / x.air + d / K.rapid + 0.03;          // up, across, down in the clear
        while (done.size < items.length) {
          let avail = items.filter(it => !done.has(it) && it.deps.every(d => done.has(d)));
          if (!avail.length) avail = items.filter(it => !done.has(it));
          const here = B.pos(), cp = !isNaN(here.x) && Math.abs(here.z - z) < 1e-9 ? [here.x, here.y] : null;
          // where each could start: an open piece at its start (or its end, zigzag), a whole loop anywhere
          const entries = it => it.closed ? [{ p: cp ? it.sp.reduce((q, p) => (H.dist(p, cp) < H.dist(q, cp) ? p : q), it.sp[0]) : it.pts[0], back: false }]
            : [{ p: it.pts[0], back: false }].concat(zig ? [{ p: it.pts[it.pts.length - 1], back: true }] : []);
          const cands = [];
          for (const it of avail) for (const e of entries(it)) cands.push({ it, e, d: cp ? H.dist(cp, e.p) : 0 });
          cands.sort((u, v) => u.d - v.d);
          let best = null;
          for (const cd of cands.slice(0, 8)) {
            const { it, e, d } = cd;
            let t = hopTime(d), how = 'hop', gap = null;
            // on round the same loop through the air, going its way
            if (cp && !it.closed && last && !last.closed && last.loop === it.loop && last.back === e.back) {
              gap = e.back ? H.loopSlice(it.loop, it.s1, last.s0).reverse() : H.loopSlice(it.loop, last.s1, it.s0);
              const tg = H.polyLen(gap, false) / fr; if (tg < t) { t = tg; how = 'gap'; }
            }
            // straight across: all in open air, or a short way over ground this loop's outer neighbour has cut
            if (cp && d / fr < t) {
              const ok = q => inAir(q) || (d < 1.0 && dPart(q) >= Math.min(it.o + step - 1e-4, it.o + 0.5 * step) && dPart(q) >= R + a);
              if (segOk(cp, e.p, ok)) { t = d / fr; how = 'straight'; }
            }
            if (!best || t < best.t) best = { it, e, t, how, gap };
          }
          const { it, e } = best;
          if (it.closed) {
            const okLead = (Lp, arc) => (inAir(Lp) || dPart(Lp) >= it.o + step - 1e-4) && arc.every(p => dPart(p) >= it.o - 1e-4);
            const P = planLoop(H, it.pts, sg, LrWant, LrMin, okLead, c.entry || cp);
            if (!P) { lost++; done.add(it); continue; }
            const okL = q => inAir(q) || (dPart(q) >= Math.min(it.o + step - 1e-4, it.o + 0.5 * step) && dPart(q) >= R + a);
            if (cp && H.dist(cp, P.L) < 1.5 && segOk(cp, P.L, okL)) {
              if (c.link === 'lift') { const lift = Math.abs(num(c.lift, 0.02)); B.g0(null, null, z + lift); B.g0(P.L[0], P.L[1]); B.g1(null, null, z, x.air, 'air'); }
              else B.g1(P.L[0], P.L[1], z, fr, 'link');
            } else comeDown(x, P.L, z);
            emitLoop(x, P, z, fr, 'rough');
            it.back = false;
          } else {
            const pts = e.back ? it.pts.slice().reverse() : it.pts;
            if (best.how === 'straight') B.g1(pts[0][0], pts[0][1], z, fr, 'link');
            else if (best.how === 'gap') B.run(H.fitPath(H.removeDup(best.gap), x.tol), z, fr, 'link');
            else comeDown(x, pts[0], z);
            B.run(H.fitPath(H.removeDup(pts), x.tol), z, fr, 'rough');
            it.back = e.back;
          }
          done.add(it); last = it;
        }
      });
      if (lost) W.push(lost / zs.length + ' roughing loop' + (lost / zs.length > 1 ? 's were' : ' was') + ' left out: no room for a lead arc. Try a smaller lead radius or stepover.');
    }
    if (c.finish) finishLoops(x, H.loops(H.offset(partC, R)).filter(l => !l.hole).map(l => l.pts.slice().reverse()),
      (Lp, arc) => dPart(Lp) >= R + a - 1e-4 && arc.every(p => dPart(p) >= R - 1e-4));
    B.g0(null, null, K.safeZ);
  }

  // ---- trochoidal loops along guide paths
  // Loop centres go at every corner of the guide (any turn over 2°) and evenly between, no more than the stepover
  // apart. Each loop is a full circle about its centre (front half cutting, back half in the cut), and the tool
  // steps to the next loop along the edge of the channel. Every move stays within the loop radius of the guide.
  const trochR = (r, s) => r > s ? Math.sqrt(r * r - s * s / 4) - 1e-4 : r * 0.85;
  function loopCentres(H, pts, closed, s) {
    const P = closed ? pts.concat([pts[0]]) : pts.slice(), n = P.length, out = [P[0]];
    const turn = k => { if (k <= 0 || k >= n - 1) return Math.PI; const a = P[k - 1], b = P[k], c = P[k + 1]; const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); };
    let from = 0;
    for (let k = 1; k < n; k++) {
      if (k < n - 1 && turn(k) < 2 * Math.PI / 180) continue;
      const piece = P.slice(from, k + 1), cum = H.cumLen(piece, false), L = cum[cum.length - 1], m = Math.max(1, Math.ceil(L / s - 1e-9));
      for (let i = 1; i < m; i++) out.push(H.at(piece, false, L * i / m, cum).p);
      out.push(P[k]); from = k;
    }
    return out;
  }
  function trochAlong(x, pts, closed, r, s, z, first) {
    const { B, H, sg, fr } = x, C = loopCentres(H, pts, closed, s), ccw = sg > 0, n = C.length;
    let p = null;
    for (let i = 0; i < n; i++) {
      p = C[i];
      const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)], L = H.dist(a, b) || 1;
      const nv = [-(b[1] - a[1]) / L * sg, (b[0] - a[0]) / L * sg];
      const Bi = [p[0] - r * nv[0], p[1] - r * nv[1]], Ai = [p[0] + r * nv[0], p[1] + r * nv[1]];
      if (i === 0 && first) first(p, Bi); else B.g1(Bi[0], Bi[1], z, fr, 'link');
      B.arc(ccw, Ai[0], Ai[1], p[0], p[1], z, fr, 'rough');
      B.arc(ccw, Bi[0], Bi[1], p[0], p[1], z, x.K.retFeed, 'link');                 // the back half, over ground just cut
    }
    return p;
  }
  // guides: [{pts, closed, r?}] in cutting order (r: that guide's own loop radius); allowedFor(rr).test(p): a loop
  // of radius rr about p stays in bounds; air(p): the tool can come straight down at p (else it helixes in)
  function runTroch(x, guides, r, allowedFor, air, open) {
    const { c, K, B, zs, sg, H } = x, s = K.ae;
    const ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180;
    B.sec('ROUGH', K.rough.rpm);
    let bad = 0, skipped = 0;
    zs.forEach((z, li) => {
      B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
      const zAbove = li ? zs[li - 1] : K.rapidZ;
      let pc = null, pr = r;
      const cutAt = [];                                    // loop centres cut so far at this depth
      guides.forEach(g0 => {
        const rr = g0.r || r;
        let pts = g0.pts;
        const ref = pc || c.entry;
        if (ref) {                                          // start the guide at the point nearest the tool (or the chosen entry)
          if (g0.closed) { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = H.dist(p, ref); if (d < bd) { bd = d; bi = i; } }); pts = pts.slice(bi).concat(pts.slice(0, bi)); }
          else if (H.dist(pts[pts.length - 1], ref) < H.dist(pts[0], ref)) pts = pts.slice().reverse();
        }
        const p0 = pts[0];
        const enter = (p, Bp) => {
          if (air(p)) comeDown(x, Bp, z);
          else {
            comeDown(x, Bp, zAbove);
            const drop = TAU * rr * Math.tan(ramp), turns = Math.max(1, Math.ceil((zAbove - z) / drop - 1e-9));
            B.turn(sg > 0, p[0], p[1], turns * TAU, z, K.helixFeed, 'entry');
            B.turn(sg > 0, p[0], p[1], TAU, z, K.helixFeed, 'entry');
          }
        };
        let first = enter;
        const lr = Math.min(rr, pr);
        if (pc && H.dist(pc, p0) <= 1e-6) first = null;
        else if (pc && open && segOk(pc, p0, open)) { B.g1(p0[0], p0[1], z, x.fr, 'link'); first = null; }   // across open air: no loops needed
        else if (pc && segOk(pc, p0, allowedFor(lr).test)) { trochAlong(x, [pc, p0], false, lr, s, z, null); first = null; }
        else if (pc) {
          // come down over ground already cut at this depth and link in from there
          const test = allowedFor(lr).test, near = cutAt.map(q => [H.dist(q, p0), q]).sort((u, v) => u[0] - v[0]).slice(0, 60);
          const hit = near.find(([, q]) => segOk(q, p0, test));
          if (hit) { comeDown(x, hit[1], z); trochAlong(x, [hit[1], p0], false, lr, s, z, null); first = null; }
          else if (g0.rest) { skipped++; return; }        // a small corner loop not worth a helix of its own
          else bad++;
        }
        if (!g0.rest) for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 200))) cutAt.push(pts[i]);
        pc = trochAlong(x, pts, g0.closed, rr, s, z, first); pr = rr;
      });
    });
    if (skipped) x.W.push(skipped / zs.length + ' corner loop' + (skipped / zs.length > 1 ? 's' : '') + ' could not be reached without leaving the cut and ' + (skipped / zs.length > 1 ? 'were' : 'was') + ' left out; the finish pass takes that material.');
    if (bad) x.G.info.push('The tool lifts and comes down again ' + bad / zs.length + ' time' + (bad / zs.length > 1 ? 's' : '') + ' per level where a link would leave the cut.');
  }
  // bounds for loop centres by loop radius, cached: test(p) and the boundary loops (a hair inside) to snap to
  function bounds(make) {
    const memo = {};
    return rr => { const k = rr.toFixed(5); return memo[k] || (memo[k] = make(rr)); };
  }
  // Material the loop paths miss (in corners, and where offsets meet in a cusp): each piece gets a loop of its
  // own, as large as fits, until the bands cover it. cut: the region to clear (Clipper paths).
  function restGuides(x, cut, guides, r, allowedFor) {
    const { H, K, W } = x, reachOf = rr => rr + K.R - 0.0005, bands = [];
    guides.forEach(g => bands.push(...H.buffer(g.pts, g.closed, reachOf(g.r || r))));
    let left = H.bool('diff', cut, H.union(bands.map(H.fromC), false));
    const extra = [], radii = [r, r * 0.6, r * 0.35, r * 0.2, r * 0.1, 0.01, 0.003].filter((v, i, A) => v >= 0.01 - 1e-9 || i >= A.length - 2);
    const nearest = (m, lps) => { let best = null, bd = Infinity; for (const L of lps) for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy, t = l ? Math.max(0, Math.min(1, ((m[0] - a[0]) * vx + (m[1] - a[1]) * vy) / l)) : 0, q = [a[0] + t * vx, a[1] + t * vy], d = H.dist(q, m); if (d < bd) { bd = d; best = q; } } return best; };
    for (let pass = 0; pass < 60 && left.length; pass++) {
      const pieces = H.loops(left).filter(l => !l.hole && l.area > 2e-6);
      if (!pieces.length) break;
      const add = [];
      for (const pc of pieces) {
        const m = pc.pts.reduce((s, p) => [s[0] + p[0] / pc.pts.length, s[1] + p[1] / pc.pts.length], [0, 0]);
        let pick = null, fallback = null;
        for (const rr of radii) {
          const A = allowedFor(rr), cen = A.test(m) ? m : nearest(m, A.loops);
          if (!cen) continue;
          const far = Math.max(...pc.pts.map(p => H.dist(p, cen))), over = far - reachOf(rr);
          if (over <= 0) { pick = { c: cen, rr }; break; }
          if (!fallback || over < fallback.over) fallback = { c: cen, rr, over };
        }
        const g = pick || fallback;
        if (g) add.push({ pts: [g.c], closed: false, r: g.rr, rest: true });
      }
      if (!add.length) break;
      extra.push(...add);
      const nb = []; add.forEach(g => nb.push(...H.buffer([g.pts[0], [g.pts[0][0] + 1e-5, g.pts[0][1]]], false, reachOf(g.r))));
      const before = H.loops(left).reduce((s, l) => s + (l.hole ? -l.area : l.area), 0);
      left = H.bool('diff', left, H.union(nb.map(H.fromC), false));
      const after = H.loops(left).reduce((s, l) => s + (l.hole ? -l.area : l.area), 0);
      if (before - after < 1e-7) break;                    // no progress
    }
    // slivers thinner than 0.006 (2·area/perimeter) are the finish pass's: say nothing about those
    const miss = H.loops(left).filter(l => !l.hole && l.area > 2e-5 && 2 * l.area / H.polyLen(l.pts, true) > 0.006);
    if (miss.length) W.push('Some material between the loop paths is left for the finish pass (' + miss.length + ' spot' + (miss.length > 1 ? 's' : '') + '). A smaller loop diameter or stepover clears it.');
    if (extra.length) x.G.info.push(extra.length + ' extra loop' + (extra.length > 1 ? 's' : '') + ' for corners and material where the loop paths meet');
    // cut them in a sensible order: nearest next
    const out = []; let at = guides.length ? guides[guides.length - 1].pts[0] : [0, 0];
    const todo = extra.slice();
    while (todo.length) { let bi = 0, bd = Infinity; todo.forEach((g, i) => { const d = H.dist(g.pts[0], at); if (d < bd) { bd = d; bi = i; } }); const g = todo.splice(bi, 1)[0]; out.push(g); at = g.pts[0]; }
    return out;
  }

  function customOutsideTroch(x, partC, outer, stockC, dPart, Hmax, inAir) {
    const { c, K, W, G, H, R, a } = x;
    const r0 = Math.max(0.05 * K.D, Math.abs(num(c.trochD, 0.5 * K.D)) / 2), r = r0;
    const cs = 2 * r + 2 * R - 0.1 * K.D, guides = [];
    if (r0 < 1.5 * K.ae) W.push('Trochoid loops this small for the stepover cut unevenly: make the loop diameter at least 3× the stepover.');
    const reach = H.offset(stockC, R + r + 0.002);            // loop centres out here cannot touch the stock
    for (let j = 0; a + j * cs < Hmax; j++) {
      const lps = H.loops(H.offset(partC, R + a + r + 0.001 + j * cs)).filter(l => !l.hole).map(l => l.pts);
      lps.forEach(L => {
        if (!L.some(p => !H.inside(p, reach))) { guides.push({ pts: L, closed: true, j }); return; }
        H.clipLoop(L, reach).filter(pc => H.polyLen(pc, false) > 1e-3).forEach(pc => guides.push({ pts: pc.slice(), closed: false, j }));
      });
    }
    guides.sort((p, q) => q.j - p.j);
    G.info.push(guides.length + ' trochoidal loop paths per level, loops Ø' + fx(2 * r) + ' advancing ' + fx(K.ae) + ', channels ' + fx(cs) + ' apart');
    const allowedFor = bounds(rr => { const k = H.offset(partC, R + a + rr - 1e-4); return { test: p => !H.inside(p, k), loops: H.loops(H.offset(partC, R + a + rr + 0.001)).map(l => l.pts) }; });
    const stockHit = H.offset(stockC, R + r);
    const cut = H.bool('diff', stockC, H.offset(H.offset(partC, R + a + 0.004), -R));
    guides.push(...restGuides(x, cut, guides, r, allowedFor));
    runTroch(x, guides, r, allowedFor, p => !H.inside(p, stockHit), p => !H.inside(p, reach) && allowedFor(r).test(p));
  }

  function customPocket(x, polys, force) {
    const { c, K, W, G, H, R, a, sg } = x;
    const region = H.union(polys, true), rl = H.loops(region);
    G.part = { t: 'polys', loops: rl.map(l => l.pts), pocket: true };
    const T = H.offset(region, -(R + a));
    if (!T.length) { W.push('The pocket is too small for this tool.'); return; }
    const how = force || (c.pocketStrategy === 'offset' || c.pocketStrategy === 'troch' ? c.pocketStrategy : 'auto');
    if (how === 'offset') return customPocketPeel(x, region, T);
    if (how === 'auto') {
      // both ways, on builders of their own; the faster one is kept
      const tries = ['offset', 'troch'].map(way => {
        const y = Object.assign({}, x, { B: builder(), W: [], G: Object.assign({}, G, { info: [] }) });
        if (way === 'offset') customPocketPeel(y, region, T); else customPocket(y, polys, 'troch');
        return { way, y, min: measure(y.B.m, K).minutes };
      });
      const best = tries[0].min <= tries[1].min ? tries[0] : tries[1], other = best === tries[0] ? tries[1] : tries[0];
      x.B.append(best.y.B.m); W.push(...best.y.W); G.info.push(...best.y.G.info);
      G.info.push('Auto: ' + (best.way === 'offset' ? 'offset loops' : 'trochoidal') + ' (' + best.min.toFixed(1) + ' min) is faster here than ' + (other.way === 'offset' ? 'offset loops' : 'trochoidal') + ' (' + other.min.toFixed(1) + ' min)');
      return;
    }
    let r0 = Math.max(0.05 * K.D, Math.abs(num(c.trochD, 0.5 * K.D)) / 2), r = r0, TT = H.offset(T, -r - 0.001);
    while (!TT.length && r0 > 0.05 * K.D) { r0 /= 2; r = r0; TT = H.offset(T, -r - 0.001); }
    if (!TT.length) { W.push('The pocket is too narrow for trochoidal loops with this tool. A smaller tool suits it better.'); return; }
    if (r0 < 1.5 * K.ae) W.push('Trochoid loops this small for the stepover cut unevenly: make the loop diameter at least 3× the stepover, or the stepover smaller.');
    const cs = 2 * r + 2 * R - 0.1 * K.D, levels = [];
    let cur = TT;
    for (let guard = 0; cur.length && guard < 500; guard++) {
      levels.push(H.loops(cur).map(l => l.pts));
      let nx = H.offset(cur, -cs);
      if (!nx.length) nx = H.offset(cur, -cs / 2);
      cur = nx;
    }
    const guides = [];
    levels.reverse().forEach(ls => ls.forEach(L => guides.push({ pts: L, closed: true })));
    G.info.push(guides.length + ' trochoidal loop paths per level from the middle out, loops Ø' + fx(2 * r) + ' advancing ' + fx(K.ae) + ', ' + fx(cs) + ' apart');
    const allowedFor = bounds(rr => { const k = H.offset(T, -rr + 1e-4); return { test: p => H.inside(p, k), loops: H.loops(H.offset(T, -rr - 0.001)).map(l => l.pts) }; });
    if (c.rough) {
      guides.push(...restGuides(x, H.offset(T, R - 0.004), guides, r, allowedFor));
      runTroch(x, guides, r, allowedFor, () => false);
    }
    if (c.finish) {
      const wall = H.loops(H.offset(region, -R)).map(l => l.pts), wallIn = H.offset(region, -R + 1e-4);
      finishLoops(x, wall, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
    }
    x.B.g0(null, null, K.safeZ);
  }


  // Pocket by peeling: offset loops of the tool-centre region, from the middle out, each a stepover further out
  // than the last. Every area starts with a small trochoidal core (loops along its innermost offset), then the
  // loops peel outward with arcs on from the cut side; loops run into each other at depth where the way across is
  // already cut. Engagement stays at the stepover on the straights and falls at the corners.
  function customPocketPeel(x, region, T) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x, s0 = K.ae;
    const regs = [];
    for (let k = 0; k < 4000; k++) { const rg = H.offset(T, -k * s0); if (!rg.length) break; regs.push(rg); }
    const rt = Math.max(0.05 * K.D, Math.abs(num(c.trochD, 0.5 * K.D)) / 2);
    // the plan, the same at every depth: cores and rings, each with the ground already safe for the tool centre
    const plan = [];
    let safe = [];
    const comps = paths => {                     // outer loops with the holes inside them
      const L = H.loops(paths), outs = L.filter(l => !l.hole), holes = L.filter(l => l.hole);
      return outs.map(o => { const oc = [H.toC(o.pts)]; return { outer: o.pts, holes: holes.filter(h => H.inside(h.pts[0], oc)).map(h => h.pts) }; });
    };
    // a thin area's core runs one way along it: split its loop at the two points farthest apart, keep the longer half
    const halfLoop = L => {
      let bi = 0, bj = 0, bd = -1; const n = L.length, st = Math.max(1, Math.floor(n / 150));
      for (let i = 0; i < n; i += st) for (let j = i + 1; j < n; j += st) { const d = H.dist(L[i], L[j]); if (d > bd) { bd = d; bi = i; bj = j; } }
      const A = L.slice(bi, bj + 1), Bh = L.slice(bj).concat(L.slice(0, bi + 1));
      return H.polyLen(A, false) >= H.polyLen(Bh, false) ? A : Bh;
    };
    let cores = 0;
    for (let k = regs.length - 1; k >= 0; k--) {
      const d = k * s0, r = Math.max(0.01, Math.min(rt, d) - 0.001);
      // ground at this offset that no loop has come near yet: a new area, or a new branch of one, gets a core first,
      // however small (the very middle of an area is small)
      const fresh = safe.length ? H.bool('diff', regs[k], H.offset(safe, 1.5 * s0)) : regs[k];
      for (const cp of comps(fresh)) {
        const cpC = [H.toC(cp.outer)].concat(cp.holes.map(H.toC)), area = H.loops(cpC).reduce((t, l) => t + (l.hole ? -l.area : l.area), 0);
        if (area < 1e-7) continue;
        // thin (it vanishes within a stepover or two): one way along it; otherwise around its loops
        const thin = !cp.holes.length && !H.offset(cpC, -1.5 * s0).length;
        const guides = thin ? [{ pts: halfLoop(cp.outer), closed: false }] : [cp.outer].concat(cp.holes).map(L => ({ pts: L, closed: true }));
        plan.push({ t: 'core', guides, r, safe: safe.slice() });
        safe = H.bool('union', safe, H.offset(cpC, 0.9 * r));       // the core leaves the ground around it cut
        cores++;
      }
      // the loops at this offset; ground counts as cut only where a loop (or a core) actually went
      for (const cp of comps(regs[k])) {
        const cpC = [H.toC(cp.outer)].concat(cp.holes.map(H.toC));
        const loops = [cp.outer].concat(cp.holes).filter(L => H.polyLen(L, true) > 2 * s0);
        for (const L of loops) plan.push({ t: 'ring', pts: L, k, safe: safe.slice() });
        if (loops.length || H.bool('diff', cpC, safe).length === 0) safe = H.bool('union', safe, cpC);
      }
    }
    G.info.push(regs.length + ' offset loops from the middle out at ' + fx(s0) + ' stepover, ' + cores + ' trochoidal core' + (cores === 1 ? '' : 's') + ' (loops Ø' + fx(2 * rt) + ') to start from');
    const ringIn = regs.map(rg => H.offset(rg, 1e-4));
    const LrMin = s0 * 1.05, LrWant = Math.max(LrMin, Math.min(Math.abs(num(c.leadR, 0.25)), 2 * s0 + 0.05));
    const ramp = Math.min(30, Math.max(0.2, num(c.ramp, 2))) * Math.PI / 180;
    let lost = 0;
    if (c.rough) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        const zAbove = li ? zs[li - 1] : K.rapidZ;
        let first = true;
        for (const op of plan) {
          const here = B.pos(), atDepth = !first && !isNaN(here.x) && Math.abs(here.z - z) < 1e-9, pc = atDepth ? [here.x, here.y] : null;
          if (op.t === 'core') {
            const inT = H.offset(T, -op.r + 1e-4), okT = p => H.inside(p, inT);
            op.guides.forEach((g0, gi) => {
              let pts = g0.pts;
              const at = B.pos(), p = !isNaN(at.x) && Math.abs(at.z - z) < 1e-9 ? [at.x, at.y] : null;
              if (p && g0.closed) { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = H.dist(q, p); if (d < bd) { bd = d; bi = i; } }); pts = pts.slice(bi).concat(pts.slice(0, bi)); }
              else if (p && H.dist(pts[pts.length - 1], p) < H.dist(pts[0], p)) pts = pts.slice().reverse();
              const p0 = pts[0];
              let enter = (q, Bp) => {
                comeDown(x, Bp, zAbove);
                const drop = TAU * op.r * Math.tan(ramp), turns = Math.max(1, Math.ceil((zAbove - z) / drop - 1e-9));
                B.turn(sg > 0, q[0], q[1], turns * TAU, z, K.helixFeed, 'entry');
                B.turn(sg > 0, q[0], q[1], TAU, z, K.helixFeed, 'entry');
              };
              if (p && H.dist(p, p0) > 1e-6 && segOk(p, p0, okT)) { trochAlong(x, [p, p0], false, op.r, s0, z, null); enter = null; }
              else if (p && H.dist(p, p0) <= 1e-6) enter = null;
              else if (op.safe.length) {
                // come down over ground already cut at this depth and loop in from there, rather than a helix
                const edge = H.loops(H.offset(op.safe, -0.002)).map(l => l.pts), cand = [];
                for (const L of edge) for (let i = 0; i < L.length; i += Math.max(1, Math.floor(L.length / 200))) cand.push(L[i]);
                cand.sort((u, v) => H.dist(u, p0) - H.dist(v, p0));
                const q = cand.slice(0, 60).find(qq => okT(qq) && segOk(qq, p0, okT));
                if (q) { comeDown(x, q, z); trochAlong(x, [q, p0], false, op.r, s0, z, null); enter = null; }
              }
              trochAlong(x, pts, g0.closed, op.r, s0, z, enter);
            });
          } else {
            const safeIn = H.offset(op.safe, 1e-4), okSafe = p => H.inside(p, safeIn), ring = ringIn[op.k];
            const okLead = (Lp, arc) => okSafe(Lp) && arc.every(p => H.inside(p, ring));
            const pts = sg > 0 ? op.pts : op.pts.slice().reverse();
            const P = planLoop(H, pts, sg, LrWant, LrMin, okLead, c.entry || pc);
            if (P) {
              if (pc && segOk(pc, P.L, okSafe)) B.g1(P.L[0], P.L[1], z, fr, 'link');
              else comeDown(x, P.L, z);
              emitLoop(x, P, z, fr, 'rough');
            } else {
              // no room for an arc: in straight from a point on the cut side, a stepover in from the loop
              const n = pts.length, order = pts.map((q, i) => [pc ? H.dist(q, pc) : 0, i]).sort((u, v) => u[0] - v[0]).slice(0, 80);
              let done = false;
              for (const [, i] of order) {
                const q = pts[i], nx = pts[(i + 1) % n], len = H.dist(q, nx); if (len < 1e-6) continue;
                const nl = [-(nx[1] - q[1]) / len * sg, (nx[0] - q[0]) / len * sg], Q = [q[0] + nl[0] * s0 * 1.05, q[1] + nl[1] * s0 * 1.05];
                if (!okSafe(Q)) continue;
                if (pc && segOk(pc, Q, okSafe)) B.g1(Q[0], Q[1], z, fr, 'link'); else comeDown(x, Q, z);
                B.g1(q[0], q[1], z, fr, 'entry');
                const ring = [q]; for (let k2 = 1; k2 <= n; k2++) ring.push(pts[(i + k2) % n]);
                B.run(H.fitPath(H.removeDup(ring), x.tol), z, fr, 'rough');
                B.g1(Q[0], Q[1], z, fr, 'entry');
                done = true; break;
              }
              if (!done && H.polyLen(pts, true) > 4 * s0) lost++;   // a loop this small sits in ground the core already cleared
            }
          }
          first = false;
        }
      });
    }
    if (lost) W.push(lost / zs.length + ' pocket loop' + (lost / zs.length > 1 ? 's' : '') + ' had no room for a lead arc and were left out; the finish pass takes that material. A smaller stepover helps.');
    if (c.finish) {
      const wall = H.loops(H.offset(region, -R)).map(l => l.pts), wallIn = H.offset(region, -R + 1e-4);
      finishLoops(x, wall, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
    }
    B.g0(null, null, K.safeZ);
  }


  // Open profile: each open path is a finished wall with stock on one side (openSide, looking along the path).
  // Passes run parallel to it at the stepover, from the stock edge in to the wall, at full depth, starting and
  // ending past the path's ends in the clear (extended straight on by openExt). One way: every pass climb, back to
  // the start above the part. Zigzag: every other pass comes back the other way (conventional) without lifting.
  function customOpen(x, paths) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x;
    const Wst = Math.abs(num(c.openStock, 0.5)), side = c.openSide === 'right' ? -1 : 1;
    const ext = String(c.openExt).trim() === '' ? R + 0.1 : Math.abs(num(c.openExt, R + 0.1));
    G.part = { t: 'lines', lines: paths };
    const bands = [];
    paths.forEach(P => { const far = H.sideOffset(P, Wst, side); if (far) bands.push(P.concat(far.slice().reverse())); });
    G.stock = { t: 'polys', loops: bands };
    if (!(Wst > a + 1e-4) && c.rough) W.push('The stock to remove is no more than the finish stock: nothing to rough.');
    const extend = (P, e) => { const [d0, d1] = H.endDirs(P); return [[P[0][0] - d0[0] * e, P[0][1] - d0[1] * e]].concat(P, [[P[P.length - 1][0] + d1[0] * e, P[P.length - 1][1] + d1[1] * e]]); };
    // climb (spindle M3): the wall on the right of travel, which is along the path when the stock is on its left
    const forward = side * sg > 0;
    const passAt = (P, o) => { const q = H.sideOffset(P, o, side); if (!q || q.length < 2) return null; const e = extend(q, ext); return forward ? e : e.slice().reverse(); };
    const N = Math.max(0, Math.ceil((Wst - a) / K.ae - 1e-6)), step = N ? (Wst - a) / N : 0;
    if (c.rough && N) G.info.push(N + ' pass' + (N > 1 ? 'es' : '') + ' per level at ' + fx(step) + ' stepover, ' + (c.openDir === 'zigzag' ? 'zigzag (every other pass conventional, no lifts)' : 'one way, climb, lifting back to the start') + '; passes run ' + fx(ext) + ' past each end');
    G.info.push('Stock on the ' + (side > 0 ? 'left' : 'right') + ' of the path, looking along it from its first point: ' + fx(Wst) + ' to remove');
    G.info.push('Each pass comes down ' + fx(ext) + ' past the start of the path and feeds in from there: the path must run to the edge of the stock (or its ends be in the clear), or the tool comes down on material.');
    const cut = (pass, z, f, k, reverse) => { const q = reverse ? pass.slice().reverse() : pass; B.run(H.fitPath(H.removeDup(q), x.tol), z, f, k); };
    const goStart = (pt, z) => { const P = B.pos(); if (isNaN(P.x)) start(B, K, pt[0], pt[1]); else hop(B, K, pt[0], pt[1]); B.g1(null, null, z, x.air, 'air'); };
    if (c.rough && N) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        paths.forEach(P => {
          let back = false, prevEnd = null;
          for (let j = N - 1; j >= 0; j--) {
            const pass = passAt(P, R + a + j * step); if (!pass) continue;
            const q = back ? pass.slice().reverse() : pass;
            if (c.openDir === 'zigzag' && prevEnd && H.dist(prevEnd, q[0]) < 2 * step + 0.05) B.g1(q[0][0], q[0][1], z, fr, 'link');   // over past the end, in the clear
            else goStart(q[0], z);
            cut(q, z, fr, 'rough');
            prevEnd = q[q.length - 1];
            if (c.openDir === 'zigzag') back = !back;
          }
        });
      });
    }
    if (c.finish) {
      const z = -K.depth;
      B.sec('FINISH', K.fin.rpm);
      paths.forEach(P => {
        const pass = passAt(P, R); if (!pass) return;
        goStart(pass[0], z);
        cut(pass, z, K.fin.feed, 'finish');
        if (c.spring) { hop(B, K, pass[0][0], pass[0][1]); B.g1(null, null, z, x.air, 'air'); cut(pass, z, K.fin.feed, 'finish'); }
      });
    }
    B.g0(null, null, K.safeZ);
  }


  // A pocket with open edges: the area between the walls (edges not marked open) and any islands, open to the air
  // along the edges marked open. It is cut from the open side in: each pass takes one stepover off the front of the
  // material, the front growing a stepover at a time around the islands (never through them), and each pass only
  // where there is material in reach. The tool comes down in the air past the open edges, never on material.
  function customPocketOpen(x, shapes) {
    const { c, K, B, W, G, H, R, a, zs, fr, sg } = x, s0 = K.ae;
    const region = H.union(shapes.map(sh => H.filleted(sh)), true);
    G.part = { t: 'polys', loops: H.loops(region).map(l => l.pts), pocket: true };
    // the air past each open edge: a band on its outer side, wide enough for the tool to come down and run past
    const bands = [], walls = [], opens = [];
    for (const sh of shapes) {
      const ccw = H.area(H.filleted(sh)) > 0, runs = H.edgeRuns(sh);
      runs.walls.forEach(w => walls.push(w));
      runs.open.forEach(o => { opens.push(o); const far = H.sideOffset(o, 2 * R + 0.2, ccw ? -1 : 1); if (far && far.length > 1) bands.push(o.concat(far.slice().reverse())); });
    }
    G.open = opens;
    const air = H.union(bands, false), whole = H.bool('union', region, air);
    G.air = { t: 'polys', loops: H.loops(air).map(l => l.pts) };
    const T = H.offset(whole, -(R + a)), Tn = H.offset(T, 1e-4);                 // where the tool centre may go
    const M = H.bool('union', H.offset(whole, -a), air);                         // what may be cut: all but the finish stock
    if (!T.length) { W.push('The area is too small for this tool.'); return; }
    // the fronts: cleared ground growing a stepover at a time from the air, only through what may be cut
    // (the front already lies in M, so growing it and keeping what is in M is the new front; its points are kept
    // few, to 0.0005, since the passes follow it and the walls come from M itself)
    const fronts = [air];
    let F = air, area = t => H.loops(t).reduce((q, l) => q + (l.hole ? -l.area : l.area), 0), last = area(F);
    for (let j = 0; j < 3000; j++) {
      const nf = H.clean(H.bool('and', H.offset(F, s0, 0.0005), M), 0.0002), na = area(nf);
      if (na - last < 1e-6) break;
      fronts.push(nf); F = nf; last = na;
    }
    // what is left, less hairline slivers where the front (kept to 0.0005) meets the exact boundary
    const unslivered = t => H.offset(H.offset(t, -0.002, 0.0005), 0.002, 0.0005);
    const left = H.loops(unslivered(H.bool('diff', M, F))).filter(l => !l.hole && l.area > 1e-4);
    if (left.length) W.push(left.length + ' area' + (left.length > 1 ? 's' : '') + ' cannot be reached from the open side and ' + (left.length > 1 ? 'are' : 'is') + ' left: give ' + (left.length > 1 ? 'them' : 'it') + ' an open edge, or cut ' + (left.length > 1 ? 'them' : 'it') + ' as a pocket.');
    // each pass: the tool centre a radius inside the new front, only where there was material within reach
    const passes = [];
    for (let j = 1; j < fronts.length; j++) {
      const rem = unslivered(H.bool('diff', M, fronts[j - 1])), near = H.bool('and', Tn, H.offset(rem, R + 0.001, 0.0005));
      const pcs = [];
      for (const L of H.loops(H.offset(fronts[j], -R, 0.0002)).map(l => l.pts)) {
        const P = sg > 0 ? L : L.slice().reverse();
        if (!P.some(p => !H.inside(p, near))) pcs.push({ pts: P.concat([P[0]]), j });
        else H.clipLoop(P, near).filter(pc => H.polyLen(pc, false) > 1e-3).forEach(pc => pcs.push({ pts: pc.slice(), j }));
      }
      passes.push(pcs);
    }
    G.info.push(passes.length + ' passes from the open side in at ' + fx(s0) + ' stepover' + (c.pieceDir === 'oneway' ? ', one way (all climb)' : ', zigzag (every other pass back conventional)'));
    const zig = c.pieceDir !== 'oneway';
    // coming down: in the air or on cut ground; a pass that starts against material steps in from the nearest cut spot
    const safes = fronts.map(Fr => H.offset(Fr, -R + 1e-4, 0.0005)), edges = [];
    const edgeOf = j => edges[j] || (edges[j] = H.loops(H.offset(fronts[j], -R - 0.002, 0.0005)).map(l => l.pts));
    const downAt = (p, j, z) => {
      if (H.inside(p, safes[j - 1])) { comeDown(x, p, z); return; }
      let best = null, bd = Infinity;
      for (const L of edgeOf(j - 1)) for (const q of L) { const d = H.dist(q, p); if (d < bd) { bd = d; best = q; } }
      if (best) { comeDown(x, best, z); B.g1(p[0], p[1], z, fr, 'entry'); } else comeDown(x, p, z);
    };
    // From the end of one piece to the start of the next without lifting: along the edge of the ground cut before
    // this pass (a hair inside it), the shorter way round, when that is quicker than lifting over. The steps on and
    // off that edge are short and over ground this pass has just cut, or into the front (a stepover at most).
    const hopTime = (d, z) => (K.rapidZ - z) / x.air + d / K.rapid + 0.008;
    const roundCut = (from, to, j, z) => {
      const E = edgeOf(j - 1); if (!E.length) return false;
      let best = null;
      for (const L of E) {
        let ia = -1, da = Infinity, ib = -1, db = Infinity;
        L.forEach((q, i) => { const d1 = H.dist(q, from), d2 = H.dist(q, to); if (d1 < da) { da = d1; ia = i; } if (d2 < db) { db = d2; ib = i; } });
        if (da > 2 * s0 + 0.05 || db > 2 * s0 + 0.05) continue;
        const cum = H.cumLen(L, true), Ln = cum[cum.length - 1], s1 = cum[ia], s2 = cum[ib];
        const fwd = ((s2 - s1) % Ln + Ln) % Ln, back = Ln - fwd;
        const path = fwd <= back ? H.loopSlice(L, s1, s2) : H.loopSlice(L, s2, s1).reverse();
        const len = Math.min(fwd, back) + da + db;
        if (!best || len < best.len) best = { path, len };
      }
      if (!best || best.len / fr > hopTime(H.dist(from, to), z)) return false;
      B.g1(best.path[0][0], best.path[0][1], z, fr, 'link');
      B.run(H.fitPath(H.removeDup(best.path), x.tol), z, fr, 'link');
      B.g1(to[0], to[1], z, fr, 'link');
      return true;
    };
    if (c.rough) {
      B.sec('ROUGH', K.rough.rpm);
      zs.forEach((z, li) => {
        B.note('LEVEL ' + (li + 1) + ' OF ' + zs.length + ' Z' + fx(z));
        passes.forEach((pcs, pi) => {
          const j = pi + 1, okLink = p => H.inside(p, safes[j]);          // across ground cut by this pass or before
          const todo = pcs.slice();
          while (todo.length) {
            const here = B.pos(), cp = !isNaN(here.x) && Math.abs(here.z - z) < 1e-9 ? [here.x, here.y] : null;
            let bi = 0, back = false, bd = Infinity;
            todo.forEach((pc, i) => { const P = pc.pts; for (const [e, bk] of [[P[0], false]].concat(zig ? [[P[P.length - 1], true]] : [])) { const d = cp ? H.dist(cp, e) : 0; if (d < bd) { bd = d; bi = i; back = bk; } } });
            const pc = todo.splice(bi, 1)[0], P = back ? pc.pts.slice().reverse() : pc.pts;
            if (cp && segOk(cp, P[0], okLink)) B.g1(P[0][0], P[0][1], z, fr, 'link');
            else if (!(cp && roundCut(cp, P[0], j, z))) downAt(P[0], j, z);
            B.run(H.fitPath(H.removeDup(P), x.tol), z, fr, 'rough');
          }
        });
      });
    }
    if (c.finish) {
      // the walls and islands, a tool radius off: whole loops round islands, pieces along the walls (in from the air)
      const wallNear = H.union(walls.map(w => H.fromC(H.buffer(w, false, R + a + 0.05)[0] || [])).filter(p => p.length > 2), false);
      const loops = H.loops(H.offset(whole, -R)).map(l => l.pts), closedL = [], pieces = [];
      for (const L of loops) {
        if (!L.some(p => !H.inside(p, wallNear))) closedL.push(L);
        else H.clipLoop(L, wallNear).filter(pc => H.polyLen(pc, false) > 1e-3).forEach(pc => pieces.push(pc.slice()));
      }
      const wallIn = H.offset(whole, -R + 1e-4);
      finishLoops(x, closedL, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
      if (pieces.length) {
        if (!closedL.length) B.sec('FINISH', K.fin.rpm);
        const z = -K.depth;
        for (const pc of pieces) {
          const P = sg > 0 ? pc : pc.slice().reverse();
          comeDown(x, P[0], z);
          B.run(H.fitPath(H.removeDup(P), x.tol), z, K.fin.feed, 'finish');
          if (c.spring) { comeDown(x, P[0], z); B.run(H.fitPath(H.removeDup(P), x.tol), z, K.fin.feed, 'finish'); }
        }
      }
    }
    B.g0(null, null, K.safeZ);
  }

  function customPath(x, shapes) {
    const { c, K, W, G, H, R, a } = x, Ws = Math.abs(num(c.slotW, 1));
    const hw = Ws / 2 - R, r0 = hw - a;
    const regionLoops = [];
    shapes.forEach(s => H.loops(H.buffer(s.pts, s.closed, Ws / 2)).forEach(l => regionLoops.push(l.pts)));
    G.part = { t: 'polys', loops: regionLoops, pocket: true };
    if (!(r0 > 0.02 * K.D)) { W.push('The groove must be wider than the tool plus twice the finish stock to cut it trochoidally.'); return; }
    const r = r0 - 1e-4;
    G.info.push('Loops Ø' + fx(2 * r) + ' (cut ' + fx(2 * r + K.D) + ' wide) advancing ' + fx(K.ae) + '; ' + (c.slotEntry === 'helix' ? 'helix entry' : 'open entry: start each path off the part'));
    if (c.rough) runTroch(x, shapes.map(s => ({ pts: s.pts, closed: s.closed })), r, () => ({ test: () => false }), () => c.slotEntry !== 'helix');
    if (c.finish) {
      shapes.forEach(s => {
        const walls = H.loops(H.buffer(s.pts, s.closed, hw)).map(l => l.pts), T = H.buffer(s.pts, s.closed, hw - a + 1e-4), wallIn = H.buffer(s.pts, s.closed, hw + 1e-4);
        finishLoops(x, walls, (Lp, arc) => H.inside(Lp, T) && arc.every(p => H.inside(p, wallIn)));
      });
    }
    x.B.g0(null, null, K.safeZ);
  }

  const fx = v => { let s = (+v).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); if (s === '-0') s = '0'; return s; };

  // the material the roughing cuts, for the engagement check: stock less part for outside profiles, the inside for
  // pockets, slots and grooves, the stock band for open profiles
  const Engage = () => root.ENGAGE || (typeof require !== 'undefined' ? require('./engage.js') : null);
  function materialOf(G, K) {
    const H = Geo(), g = G.part, st = G.stock;
    const test = d => {
      if (!d) return null;
      if (d.t === 'rr') return p => rrDist(p, d.cx, d.cy, d.A, d.B, d.r) <= 0;
      if (d.t === 'circle') return p => Math.hypot(p[0] - d.cx, p[1] - d.cy) <= d.r;
      if (d.t === 'slot') return p => { const a = d.p1, b = d.p2, vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy) <= d.w / 2; };
      if (d.t === 'polys') { const P = H.union(d.loops, true); return p => H.inside(p, P); }
      return null;
    };
    if (!g) return null;
    if (st) { const inS = test(st); if (!inS) return null; if (g.t === 'lines') return inS; const inP = test(g); return inP ? p => inS(p) && !inP(p) : inS; }
    return test(g);
  }

  // ---------------------------------------------------------------- generate
  function generate(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    // passes, with settings saved before it existed read from the finish box
    if (!['both', 'rough', 'finish'].includes(c.passes)) c.passes = c.finish === false ? 'rough' : 'both';
    if (cfg && cfg.passes === undefined && cfg.finish === false) c.passes = 'rough';
    c.finish = c.passes !== 'rough'; c.rough = c.passes !== 'finish';
    c.entry = c.entryOn && isFinite(parseFloat(c.entryX)) && isFinite(parseFloat(c.entryY)) ? [parseFloat(c.entryX), parseFloat(c.entryY)] : null;
    const K = calc(c), B = builder(), W = [], G = { info: [] };
    if (c.op === 'custom') genCustom(c, K, B, W, G);
    else if (c.op === 'pocket') genPocket(c, K, B, W, G);
    else if (c.op === 'slot') genSlot(c, K, B, W, G);
    else genProfile(c, K, B, W, G);
    if (c.dir === 'conv' && G.axis && c.op !== 'custom') mirror(B.m, G.axis[0], G.axis[1]);
    checks(c, K, W);
    let stats = measure(B.m, K);
    if (c.slowDown !== false && c.rough) {
      const E = Engage(), mat = materialOf(G, K);
      if (E && mat && B.m.some(m => m.t === 'G1' || m.t === 'G2' || m.t === 'G3')) {
        const ang = E.angles(B.m, K.R, stats.box, mat);
        if (ang) {
          const sd = E.slowDown(B.m, K, ang);
          if (sd.n) { G.info.push('Feed lowered on ' + sd.n + ' move' + (sd.n > 1 ? 's' : '') + ' where the cutter wraps up to ' + Math.round(sd.worst) + '° of the cut (the stepover gives ' + Math.round(sd.target) + '°), down to ' + Math.round(sd.lowest * 100) + '% of the feed'); stats = measure(B.m, K); }
          G.engage = { worst: ang.reduce((a, b) => Math.max(a, b), 0), target: sd.target, slowed: sd.n };
        } else G.info.push('Too large to check the engagement along the toolpath; feeds are not lowered in corners.');
      }
    }
    return { cfg: c, K, moves: B.m, warn: W, geo: G, stats };
  }

  function checks(c, K, W) {
    const finDepth = c.finish ? K.depth : 0;
    if (c.rough && K.loc > 0 && K.ap > K.loc + 1e-9) W.push('Each roughing level cuts ' + fx(K.ap) + ' deep but the flutes are only ' + fx(K.loc) + ' long. Set Max depth per level to ' + fx(K.loc) + ' or less, or use a longer tool.');
    else if (K.loc > 0 && finDepth > K.loc + 1e-9) W.push('The finish pass is ' + fx(finDepth) + ' deep, more than the ' + fx(K.loc) + ' flute length.');
    if (K.stick > 0 && K.stick < K.depth + 0.05) W.push('Stick-out ' + fx(K.stick) + ' is not enough to reach ' + fx(K.depth) + ' deep: the holder would hit the part.');
    if (K.stick > 0 && K.stick / K.D > 4) W.push('Stick-out is ' + (K.stick / K.D).toFixed(1) + '× the tool diameter: expect deflection and chatter. Shorten it, or cut speeds 20–30%.');
    if (c.rough && K.rough.clamped) W.push('Roughing speed wants ' + K.rough.rpmWant + ' RPM but the spindle tops out at ' + K.maxRpm + '; it runs at ' + Math.round(K.rough.sfm) + ' SFM.');
    if (c.finish && K.fin.clamped) W.push('Finishing speed wants ' + K.fin.rpmWant + ' RPM, limited to ' + K.maxRpm + '.');
    if (c.rough && K.hpMachine > 0 && K.hpNeed > 0.8 * K.hpMachine) W.push('Roughing needs about ' + K.hpNeed.toFixed(1) + ' hp at the spindle, ' + Math.round(K.hpNeed / K.hpMachine * 100) + '% of the machine\'s ' + K.hpMachine + ' hp. Lower the stepover.');
    if (c.rough && K.ae > 0.3 * K.D) W.push('A stepover of ' + Math.round(K.ae / K.D * 100) + '% of the tool is heavy for full-depth HEM; 5–15% is typical.');
    if (c.rough && K.thin > 3) W.push('Chip thinning raises the feed ' + K.thin.toFixed(1) + '× at this light stepover. Check the programmed chip load (' + K.rough.fzProg.toFixed(4) + ') against the tool maker\'s maximum.');
    if (num(c.rapidZ, 0.1) > num(c.safeZ, 1)) W.push('The rapid plane (' + fx(num(c.rapidZ)) + ') is above the clearance plane (' + fx(num(c.safeZ)) + '): the program rapids down only to the clearance plane.');
    if (!(K.rapidZ > 0)) W.push('The rapid plane is at or below the top of the part (Z0): the tool would rapid into the stock. Set it above zero, e.g. 0.1.');
    if (!(K.safeZ > 0)) W.push('The clearance plane is at or below the top of the part (Z0). Set it above your clamps and fixtures.');
    const F = Feeds();
    if (F && c.coating && c.coating !== 'auto') { try { F.calc({ tool: 'endmill', mat: c.mat, coating: c.coating, D: K.D, toolMat: 'carbide' }).warnings.filter(w => /coating|sticks|heat breaks|HSS-era/i.test(w)).forEach(w => W.push(w)); } catch (e) { } }
    if (!c.rough && !(K.finStock > 0)) W.push('Finish only with no finish stock: the pass would cut nothing. Enter what roughing left on the wall.');
  }

  // ---------------------------------------------------------------- lengths and time
  function arcSweep(m, from) {
    const a0 = Math.atan2(from.y - m.cy, from.x - m.cx), a1 = Math.atan2(m.y - m.cy, m.x - m.cx);
    let s = m.t === 'G3' ? a1 - a0 : a0 - a1;
    s = ((s % TAU) + TAU) % TAU;
    if (s < 1e-9) s = TAU;
    return s;
  }
  function measure(moves, K) {
    let p = null, feedLen = 0, rapidLen = 0, time = 0;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = (x, y) => { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); };
    for (const m of moves) {
      if (m.x === undefined) continue;
      if (p && !isNaN(p.x)) {
        let d;
        if (m.t === 'G2' || m.t === 'G3') {
          const r = Math.hypot(p.x - m.cx, p.y - m.cy), sw = arcSweep(m, p), a0 = Math.atan2(p.y - m.cy, p.x - m.cx), dir = m.t === 'G3' ? 1 : -1;
          d = Math.hypot(r * sw, m.z - p.z);
          // the arc's own extent: its ends (grown below) and the quadrant points it passes
          for (let q = 0; q < 4; q++) { const t = q * Math.PI / 2, rel = (((t - a0) * dir) % TAU + TAU) % TAU; if (rel <= sw + 1e-12) grow(m.cx + r * Math.cos(t), m.cy + r * Math.sin(t)); }
        }
        else d = Math.hypot(m.x - p.x, m.y - p.y, isNaN(p.z) || isNaN(m.z) ? 0 : m.z - p.z);
        if (m.t === 'G0') { rapidLen += d; time += d / K.rapid; } else { feedLen += d; time += d / m.f; }
      }
      if (!isNaN(m.x)) grow(m.x, m.y);
      p = m;
    }
    return { feedLen, rapidLen, minutes: time, box };
  }

  // ---------------------------------------------------------------- output helpers
  const numFmt = dec => v => { const s = (+v).toFixed(dec).replace(/0+$/, ''); return s === '-0.' ? '0.' : s; };
  const feedFmt = v => String(Math.round(v * 10) / 10);
  // Arc centre from the rounded end points: moved onto the bisector of the rounded chord, so the start and end
  // radii agree at the output resolution and the control does not alarm.
  function arcCentre(S, E, C) {
    const vx = E[0] - S[0], vy = E[1] - S[1], L = Math.hypot(vx, vy);
    if (L < 1e-7) return C;
    const mx = (S[0] + E[0]) / 2, my = (S[1] + E[1]) / 2, nx = -vy / L, ny = vx / L, h = (C[0] - mx) * nx + (C[1] - my) * ny;
    return [mx + h * nx, my + h * ny];
  }
  const clean = s => String(s).replace(/[()]/g, '').replace(/[^\x20-\x7E]/g, '').toUpperCase();
  function fileBase(c) {
    let b = String(c.fileName || '').trim().replace(/\.(nc|ngc|tap|txt|eia|pbd|pbm)$/i, '').replace(/[\\/:*?"<>|\x00-\x1F]+/g, '-').trim();
    if (!b) {
      const K = calc(c);
      b = c.op === 'custom' ? 'hem-' + (CUSTOM_OPS[c.cop] ? c.cop : 'outside') + '-shape' : c.op === 'pocket' ? 'hem-pocket-' + fx(num(c.pocketD)) : c.op === 'slot' ? 'hem-slot-' + fx(num(c.slotW)) + 'w' :
        'hem-profile-' + (c.shape === 'circle' ? fx(num(c.partD)) + 'dia' : fx(num(c.partW)) + 'x' + fx(num(c.partH)));
      b += '-' + fx(K.depth) + 'deep' + (c.passes === 'finish' ? '-finish' : c.passes === 'rough' || c.finish === false ? '-rough' : '-rough-finish');
    }
    return b;
  }
  // Mazatrol names hold 31 characters. A name made from the settings is shortened so its end (which passes: -RF
  // rough + finish, -R rough only, -F finish only) survives; a name that was typed in is only cut.
  function mazName(c) {
    const typed = String(c.mazName || '').trim() || String(c.fileName || '').trim();
    const clean = b => b.toUpperCase().replace(/\.(PBD|PBM|NC)$/, '').replace(/[^A-Z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
    let b = clean(typed || fileBase(c));
    if (!typed && b.length > 31) {
      b = b.replace(/^HEM-/, '').replace(/-ROUGH-FINISH$/, '-RF').replace(/-ROUGH$/, '-R').replace(/-FINISH$/, '-F').replace(/DEEP(?=-|$)/, 'D')
        .replace(/(^|-)PROFILE-/, '$1PROF-').replace(/(^|-)(OUTSIDE|POCKET|OPEN)-SHAPE/, '$1$2').replace(/(^|-)PATH-SHAPE/, '$1GROOVE');
      if (b.length > 31) { const tail = (b.match(/-(RF|R|F)$/) || [''])[0]; b = b.slice(0, 31 - tail.length).replace(/[-_]+$/, '') + tail; }
    }
    return b.slice(0, 31) || 'HEM';
  }
  function coolM(c) { const m = /M?\s*(\d+)/i.exec(String(c.cool || '')); return m ? +m[1] : null; }

  function describeLines(r) {
    const c = r.cfg, K = r.K, f = fx;
    const L = ['HEM ' + OPS[c.op] + ' ' + (c.dir === 'conv' ? 'CONVENTIONAL' : 'CLIMB')];
    if (c.op === 'profile') L.push('PART ' + (c.shape === 'circle' ? 'DIA ' + f(num(c.partD)) : f(num(c.partW)) + ' X ' + f(num(c.partH)) + ' CORNER R' + f(num(c.cornerR))) + ' CENTER X' + f(num(c.cx)) + ' Y' + f(num(c.cy)),
      'STOCK ' + (c.stockType === 'rect' ? f(num(c.stockX)) + ' X ' + f(num(c.stockY)) : f(num(c.stockW)) + ' PER SIDE'));
    if (c.op === 'pocket') L.push('POCKET DIA ' + f(num(c.pocketD)) + ' CENTER X' + f(num(c.cx)) + ' Y' + f(num(c.cy)));
    if (c.op === 'custom') L.push((CUSTOM_OPS[c.cop] || CUSTOM_OPS.outside) + ' OF ' + (c.shapes || []).length + ' SHAPE' + ((c.shapes || []).length === 1 ? '' : 'S') + (c.cop === 'path' ? ' ' + f(num(c.slotW)) + ' WIDE' : c.cop === 'pocket' || c.strategy === 'troch' ? ' TROCHOIDAL LOOPS DIA ' + f(num(c.trochD)) : ' OFFSET LOOPS') + (c.cop === 'outside' ? ' STOCK ' + (c.stockType === 'rect' ? f(num(c.stockM)) + ' AROUND' : f(num(c.stockW)) + ' PER SIDE') : ''));
    if (c.op === 'slot') L.push('SLOT ' + f(num(c.slotW)) + ' WIDE FROM X' + f(num(c.x1)) + ' Y' + f(num(c.y1)) + ' TO X' + f(num(c.x2)) + ' Y' + f(num(c.y2)) + ' ' + (c.slotEntry === 'helix' ? 'HELIX' : 'OPEN') + ' ENTRY');
    L.push('DEPTH ' + f(K.depth) + ' IN ' + K.levels + ' LEVEL' + (K.levels > 1 ? 'S' : '') + ' OF ' + f(K.ap) + '  Z0 = TOP OF PART',
      'CLEARANCE PLANE Z' + f(K.safeZ) + '  RAPID PLANE Z' + f(K.rapidZ) + '  BETWEEN CUTS LIFT TO ' + (c.retract === 'clear' ? 'CLEARANCE' : 'RAPID') + ' PLANE',
      'TOOL T' + K.toolNo + ' DIA ' + f(K.D) + ' ' + K.Z + 'FL  LOC ' + f(K.loc) + '  STICKOUT ' + f(K.stick),
      'MATERIAL ' + clean((MATERIALS[c.mat] || { name: 'CUSTOM' }).name) + (c.coating && c.coating !== 'auto' && COATINGS[c.coating] ? '  COATING ' + clean(COATINGS[c.coating].name.split(':')[0]) : ''),
      c.passes === 'finish' ? 'NO ROUGHING' : 'ROUGH ' + K.rough.rpm + ' RPM ' + Math.round(K.rough.sfm) + ' SFM  AE ' + f(K.ae) + '  AP ' + f(K.ap) + '  F' + feedFmt(K.rough.feed) + '  FZ ' + K.rough.fzProg.toFixed(4) + ' PROGRAMMED',
      c.finish ? 'FINISH ' + K.fin.rpm + ' RPM  STOCK ' + f(K.finStock) + '  F' + feedFmt(K.fin.feed) + (c.spring ? '  + SPRING PASS' : '') : 'NO FINISH PASS',
      (c.passes === 'finish' ? 'MRR ' + K.mrrFin.toFixed(2) + ' CU IN/MIN  ABOUT ' + (K.mrrFin * K.unitHp).toFixed(1) : 'MRR ' + K.mrr.toFixed(2) + ' CU IN/MIN  ABOUT ' + K.hpNeed.toFixed(1)) + ' HP  CYCLE ABOUT ' + r.stats.minutes.toFixed(1) + ' MIN');
    return L.map(clean);
  }

  // ---------------------------------------------------------------- what the program does
  // From the moves themselves: which sections actually cut. 'ROUGH + FINISH', 'ROUGH ONLY', 'FINISH ONLY' or ''.
  function passes(r) {
    let sec = '', rough = false, fin = false;
    for (const m of r.moves) {
      if (m.t === 'SEC') { sec = m.name; continue; }
      if (m.t === 'G1' || m.t === 'G2' || m.t === 'G3') { if (sec === 'FINISH') fin = true; else rough = true; }
    }
    return { rough, finish: fin, label: rough && fin ? 'ROUGH + FINISH' : rough ? 'ROUGH ONLY' : fin ? 'FINISH ONLY' : '' };
  }
  const opName = c => c.op === 'custom' ? (CUSTOM_OPS[c.cop] || CUSTOM_OPS.outside) : OPS[c.op];

  // ---------------------------------------------------------------- G-code
  function toGcode(r, extraLines) {
    const c = r.cfg, K = r.K, dec = Math.max(2, Math.min(6, Math.round(num(c.dec, 4)))), f = numFmt(dec), rd = v => +(+v).toFixed(dec);
    const L = []; let n = 0;
    const add = s => { if (c.lineNums && s[0] !== '(' && s !== '%') { n += 10; L.push('N' + n + ' ' + s); } else L.push(s); };
    const cool = String(c.cool || '').trim().toUpperCase(), coolOff = cool ? 'M9' : '';
    add('%');
    add('O' + String(Math.max(0, Math.round(num(c.prog, 1000)))).padStart(4, '0') + ' (' + clean(fileBase(c)).slice(0, 40) + ')');
    const P = passes(r);
    if (P.label) add('(TOOLPATH: ' + P.label + (P.rough && !P.finish ? ' - ROUGHED TO SIZE, NO FINISH PASS' : P.finish && !P.rough ? ' - PART MUST ALREADY BE ROUGHED, ' + fx(r.K.finStock) + ' LEFT ON THE WALL' : '') + ')');
    describeLines(r).forEach(s => add('(' + s + ')'));
    add('G20 G17 G40 G49 G80 G90 G94');
    if (c.toolChange) add('T' + K.toolNo + ' M6');
    add(String(c.wcs || 'G54').toUpperCase().trim());
    let pos = { x: NaN, y: NaN, z: NaN }, lastF = null, spin = false;
    for (const m of r.moves) {
      if (m.t === 'C') { add('(' + clean(m.s) + ')'); continue; }
      if (m.t === 'SEC') { add('(===== ' + (m.name === 'FINISH' ? 'FINISH PASS' : 'ROUGHING') + ' =====)'); add('S' + m.rpm + (spin ? '' : ' M3')); spin = true; continue; }
      const w = [];
      const X = rd(m.x), Y = rd(m.y), Zv = rd(m.z);
      if (m.t === 'G0') {
        if (X !== rd(pos.x)) w.push('X' + f(X));
        if (Y !== rd(pos.y)) w.push('Y' + f(Y));
        if (!isNaN(m.z) && Zv !== rd(pos.z)) w.push('Z' + f(Zv));
        if (m.flag === 'tlo') { add('G0 G43 H' + K.toolNo + ' ' + w.join(' ')); if (cool) add(cool); }
        else if (w.length) add('G0 ' + w.join(' '));
      } else if (m.t === 'G1') {
        if (X !== rd(pos.x)) w.push('X' + f(X));
        if (Y !== rd(pos.y)) w.push('Y' + f(Y));
        if (Zv !== rd(pos.z)) w.push('Z' + f(Zv));
        if (!w.length) { pos = m; continue; }
        if (m.f !== lastF) { w.push('F' + feedFmt(m.f)); lastF = m.f; }
        add('G1 ' + w.join(' '));
      } else {
        const S = [rd(pos.x), rd(pos.y)], E = [X, Y], C = arcCentre(S, E, [m.cx, m.cy]);
        w.push('X' + f(X), 'Y' + f(Y));
        if (Zv !== rd(pos.z)) w.push('Z' + f(Zv));
        w.push('I' + f(rd(C[0] - S[0])), 'J' + f(rd(C[1] - S[1])));
        if (m.f !== lastF) { w.push('F' + feedFmt(m.f)); lastF = m.f; }
        add(m.t + ' ' + w.join(' '));
      }
      pos = m;
    }
    if (coolOff) add(coolOff);
    if (spin) add('M5');
    if (c.home) { add('G91 G28 Z0.'); add('G90'); }
    add('M30');
    (extraLines || []).forEach(s => L.push(s));
    L.push('%');
    return L.join('\n') + '\n';
  }

  // ---------------------------------------------------------------- Mazatrol (MANL PRG units through MACH1)
  // Each unit starts with G0 G90 X Y S M3 / G0 G17 Z / G1 G94 Z F (S M8 with coolant) so absolute, XY plane and
  // feed per minute hold whatever state the control was left in. A new spindle speed (roughing → finishing)
  // starts a new unit; a unit that fills up retracts and the next starts over the same point.
  function toMazatrol(r, MACH1) {
    const c = r.cfg, K = r.K, ctl = c.mazCtl === 'SmoothM' ? 'SmoothM' : 'MatrixM';
    const dec = Math.max(2, Math.min(5, Math.round(num(c.dec, 4)))), rd = v => +(+v).toFixed(dec);
    const name = mazName(c);
    const p = MACH1.program({ control: ctl, name, units: 'inch', comment: clean('HEM ' + opName(c) + (passes(r).label ? ' - ' + passes(r).label : '')).slice(0, 48) });
    p.common({ MAT: String(c.mazMat || '').toUpperCase().slice(0, 8) || undefined, 'INITIAL-Z': num(c.mazInitZ, 1) });
    const nom = num(c.mazNom, 0) > 0 ? num(c.mazNom) : K.D;
    const tool = { TOOL: c.mazTool || 'END MILL', 'NOM-DIA': rd(nom) };
    const suf = String(c.mazSuf || '').trim().toUpperCase();
    if (suf) tool['@11'] = suf;
    const lim = MACH1.core.CONTROLS[ctl].seqLimit - 2;               // leave room for the unit's closing retract
    const cm = coolM(c), safe = rd(K.safeZ), rz = rd(K.rapidZ);
    let u = null, count = 0, pos = { x: NaN, y: NaN, z: NaN }, lastF = null, rpm = K.rough.rpm, units = 0, seqs = 0, lastWasSafe = false;
    const blk = w => { u.block(w); count++; seqs++; lastWasSafe = w.G === 0 && w.Z === safe && w.X === undefined; };
    // next: the move that opens the unit; a straight plunge becomes the unit's G1 G94 line itself
    const open = next => {
      u = p.unit('MANL PRG', tool); units++; count = 0;
      const plunge = next && next.t === 'G1' && rd(next.x) === rd(pos.x) && rd(next.y) === rd(pos.y);
      const zTo = plunge ? next.z : pos.z, fTo = plunge ? next.f : K.airFeed;
      blk({ G: [0, 90], X: rd(pos.x), Y: rd(pos.y), S: rpm, M: 3 });
      blk({ G: [0, 17], Z: rd(Math.max(pos.z, rz)) });
      blk(Object.assign({ G: [1, 94], Z: rd(zTo), F: +feedFmt(fTo) }, cm != null ? { S: rpm, M: cm } : {}));
      lastF = fTo;
      return plunge;
    };
    const close = () => { if (u && !lastWasSafe) blk({ G: 0, Z: safe }); u = null; };
    for (const m of r.moves) {
      if (m.t === 'C') continue;
      if (m.t === 'SEC') { rpm = m.rpm; close(); continue; }
      if (m.t === 'G0') {
        if (u) {
          if (count + 1 > lim) close();
          else {
            const w = { G: 0 };
            if (rd(m.x) !== rd(pos.x)) w.X = rd(m.x);
            if (rd(m.y) !== rd(pos.y)) w.Y = rd(m.y);
            if (!isNaN(m.z) && rd(m.z) !== rd(pos.z)) w.Z = rd(m.z);
            if (Object.keys(w).length > 1) blk(w);
          }
        }
        pos = m; continue;
      }
      if (!u || count + 1 > lim) { close(); if (open(m)) { pos = m; continue; } }
      const w = {};
      if (m.t === 'G1') {
        w.G = 1;
        if (rd(m.x) !== rd(pos.x)) w.X = rd(m.x);
        if (rd(m.y) !== rd(pos.y)) w.Y = rd(m.y);
        if (rd(m.z) !== rd(pos.z)) w.Z = rd(m.z);
        if (Object.keys(w).length === 1) { pos = m; continue; }
      } else {
        const S = [rd(pos.x), rd(pos.y)], E = [rd(m.x), rd(m.y)], C = arcCentre(S, E, [m.cx, m.cy]);
        w.G = m.t === 'G2' ? 2 : 3; w.X = E[0]; w.Y = E[1];
        if (rd(m.z) !== rd(pos.z)) w.Z = rd(m.z);
        w.I = +(C[0] - S[0]).toFixed(dec); w.J = +(C[1] - S[1]).toFixed(dec);
      }
      if (m.f !== lastF) { w.F = +feedFmt(m.f); lastF = m.f; }
      blk(w);
      pos = m;
    }
    close();
    const warn = p.check().slice();
    const nRec = p.p.recs.length;
    if (nRec > 2000) warn.push(nRec + ' records: MazaCAM warns that programs over 2,000 records may not fit in the control. Use fewer levels, a larger stepover or Smooth (.PBM).');
    if (!units) warn.push('Nothing to cut.');
    return { prog: p, units, seqs, nRec, warn, fileName: p.fileName, bytes: () => p.save(), listing: () => p.listing() };
  }

  // ---------------------------------------------------------------- settings in the G-code
  // JSON, UTF-8, base32 (A-Z 2-7, safe in any control's comments) in (CFG ...) lines after a
  // (SETTINGS DATA V1 <bytes> BYTES CHECK <fnv-1a>) line, after M30. Same scheme as the engraving app.
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32enc(bytes) { let o = '', bits = 0, v = 0; for (const b of bytes) { v = ((v & 0xFF) << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; o += B32[(v >>> bits) & 31]; } } if (bits > 0) o += B32[(v << (5 - bits)) & 31]; return o; }
  function b32dec(s) { const o = []; let bits = 0, v = 0; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) throw new Error('bad character'); v = ((v & 0x7F) << 5) | i; bits += 5; if (bits >= 8) { bits -= 8; o.push((v >>> bits) & 255); } } return new Uint8Array(o); }
  function fnvHex(bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).toUpperCase().padStart(8, '0'); }
  const enc = s => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8')));
  const dec8 = b => (typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(b) : Buffer.from(b).toString('utf8'));
  // Every setting, twice, in comments after M30:
  //  - readable: (SET key=value ...) lines and the shapes' points, for people and as a fallback;
  //  - exact: JSON, UTF-8, base32 in (CFG ...) lines after a (HEM SETTINGS DATA V2 <bytes> BYTES CHECK <fnv-1a>) line.
  // Open reads the exact copy; if an editor or control has damaged it (upper-cased text, cut lines), it falls
  // back to the readable one. Settings saved as (SETTINGS DATA V1 ...) before are read too.
  const ENUMS = { op: ['profile', 'pocket', 'slot', 'custom'], shape: ['rect', 'circle'], stockType: ['rect', 'even'], cop: ['outside', 'pocket', 'path'],
    strategy: ['offset', 'troch'], slotEntry: ['open', 'helix'], dir: ['climb', 'conv'], link: ['depth', 'lift'], passes: ['both', 'rough', 'finish'],
    mat: Object.keys(MATERIALS).concat(['custom']), dxfUnits: ['auto', 'in', 'mm'], mazCtl: ['MatrixM', 'SmoothM'], coating: Object.keys(COATINGS), retract: ['rapid', 'clear'], openSide: ['left', 'right'], openDir: ['oneway', 'zigzag'], pieceDir: ['zigzag', 'oneway'], pocketStrategy: ['auto', 'offset', 'troch'] };
  const cmt = v => String(v).replace(/[()]/g, '').replace(/[^\x20-\x7E]/g, '?');
  function settingsLines(cfg, when) {
    const keep = {}; for (const k of Object.keys(DEFAULTS)) keep[k] = cfg[k];
    const d = when || new Date(), p2 = n => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
    const out = ['(===== HEM TOOLPATH SETTINGS, SAVED ' + stamp + ' =====)', '(OPEN THIS FILE WITH OPEN .NC IN THE HEM TOOLPATH GENERATOR TO GET THEM ALL BACK)'];
    // readable: key=value, quoted when there is a space, packed into lines of about 70
    let line = '';
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'shapes' || k === 'cons') continue;       // written on their own lines below
      let v = keep[k]; v = typeof v === 'boolean' ? (v ? 'ON' : 'OFF') : cmt(v == null ? '' : v);
      const w = k + '=' + (/[\s=]/.test(v) || v === '' ? '"' + v.replace(/"/g, "'") + '"' : v);
      if (line && line.length + w.length > 66) { out.push('(SET ' + line + ')'); line = ''; }
      line += (line ? ' ' : '') + w;
    }
    if (line) out.push('(SET ' + line + ')');
    const shapes = Array.isArray(keep.shapes) ? keep.shapes : [], nPts = shapes.reduce((n, sh) => n + (sh.pts || []).length, 0);
    if (nPts <= 3000) shapes.forEach((sh, i) => {
      out.push('(SHAPE ' + (i + 1) + ' ' + (sh.closed ? 'CLOSED' : 'OPEN') + ' ' + sh.pts.length + ' POINTS X,Y,FILLET,ARC' + (sh.pts.some(q => +q[4]) ? ',OPEN EDGE' : '') + (sh.cut === false ? ' CAD ONLY' : '') + ')');
      let l = '';
      for (const q of sh.pts) { const w = [q[0], q[1], q[2] || 0, q[3] || 0].concat(+q[4] ? [1] : []).map(v => fx(+v || 0)).join(','); if (l && l.length + w.length > 66) { out.push('(PT ' + l + ')'); l = ''; } l += (l ? ' ' : '') + w; }
      if (l) out.push('(PT ' + l + ')');
    });
    (Array.isArray(keep.cons) ? keep.cons : []).forEach(g => out.push('(CONS ' + String(g.t).toUpperCase() + Object.keys(g).filter(k => k !== 't').map(k => ' ' + k.toUpperCase() + '=' + fx(+g[k] || 0)).join('') + ')'));
    if (nPts > 3000) out.push('(SHAPES: ' + shapes.length + ' WITH ' + nPts + ' POINTS, SAVED IN THE DATA BELOW ONLY)');
    // exact
    const bytes = enc(JSON.stringify({ app: 'hem', cfg: keep })), s = b32enc(bytes);
    out.push('(HEM SETTINGS DATA V2 ' + bytes.length + ' BYTES CHECK ' + fnvHex(bytes) + ')');
    for (let i = 0; i < s.length; i += 64) out.push('(CFG ' + s.slice(i, i + 64) + ')');
    out.push('(===== END OF SETTINGS =====)');
    return out;
  }
  // {cfg, from: 'data' | 'text', note} or null when the text has no saved settings
  function openSettings(text) {
    const lines = String(text).split(/\r?\n/).map(l => l.replace(/^\s*N\d+\s*/, '').trim());
    // the exact copy
    let head = null, data = '', why = '';
    for (const s of lines) {
      let m = s.match(/^\((?:HEM )?SETTINGS DATA V(\d+) (\d+) BYTES CHECK ([0-9A-F]{8})\)$/i);
      if (m) { head = { n: +m[2], h: m[3].toUpperCase() }; data = ''; continue; }
      m = s.match(/^\(CFG ([A-Z2-7]+)\)$/i); if (m && head) data += m[1].toUpperCase();
    }
    if (head) {
      try {
        const bytes = b32dec(data);
        if (bytes.length !== head.n || fnvHex(bytes) !== head.h) throw new Error('its check failed');
        const o = JSON.parse(dec8(bytes));
        if (!o || typeof o.cfg !== 'object') throw new Error('no settings inside');
        if (o.app !== 'hem') throw new Error('these settings are from another app');
        return { cfg: o.cfg, from: 'data' };
      } catch (e) { why = e.message; }
    }
    // the readable copy
    const byLower = {}; for (const k of Object.keys(DEFAULTS)) byLower[k.toLowerCase()] = k;
    const cfg = {}, shapes = [], cons = []; let found = 0;
    for (const s of lines) {
      let m = s.match(/^\(SET (.*)\)$/i);
      if (m) {
        for (const w of m[1].matchAll(/([A-Za-z0-9]+)=("([^"]*)"|\S*)/g)) {
          const k = byLower[w[1].toLowerCase()]; if (!k || k === 'shapes' || k === 'cons') continue;
          let v = w[3] !== undefined ? w[3] : w[2];
          if (typeof DEFAULTS[k] === 'boolean') v = /^(ON|TRUE|1)$/i.test(v);
          else if (ENUMS[k]) { const hit = ENUMS[k].find(o => o.toLowerCase() === String(v).toLowerCase()); if (!hit) continue; v = hit; }
          cfg[k] = v; found++;
        }
        continue;
      }
      m = s.match(/^\(SHAPE \d+ (CLOSED|OPEN)\b/i);
      if (m) { const sh = { closed: /CLOSED/i.test(m[1]), pts: [] }; if (/CAD ONLY/i.test(s)) sh.cut = false; shapes.push(sh); continue; }
      m = s.match(/^\(CONS (POINT|LINE2|LINE|CIRCLE)((?:\s+[A-Z0-9]+=[-\d.]+)*)\)$/i);
      if (m) { const g = { t: m[1].toLowerCase() }; for (const w of m[2].matchAll(/([A-Z0-9]+)=([-\d.]+)/gi)) g[w[1].toLowerCase()] = +w[2]; cons.push(g); found++; continue; }
      m = s.match(/^\(PT (.*)\)$/i);
      if (m && shapes.length) for (const w of m[1].trim().split(/\s+/)) { const q = w.split(',').map(Number); if (q.length >= 2 && q.every(isFinite)) shapes[shapes.length - 1].pts.push([q[0], q[1], q[2] || 0, q[3] || 0].concat(q[4] ? [1] : [])); }
    }
    if (!found) { if (head) throw new Error('the saved settings are damaged (' + why + ') and there is no readable copy'); return null; }
    if (shapes.length) cfg.shapes = shapes;
    cfg.cons = cons;                                        // the readable copy lists every construction item (none = none)
    return { cfg, from: 'text', note: head ? 'The exact copy was damaged (' + why + '), so the readable copy was used.' : 'Read from the readable copy.' };
  }
  function readSettings(text) { const o = openSettings(text); return o ? o.cfg : null; }

  // Move work zero to (x, y) of the current coordinates: every point and every coordinate setting shifts by
  // (-x, -y), so nothing moves relative to the part. Returns the new settings.
  function moveOrigin(cfg, x, y) {
    const c = Object.assign({}, cfg), G = Geo();
    const shift = (k, d) => { if (c[k] !== undefined && String(c[k]).trim() !== '') c[k] = String(+(num(c[k], 0) - d).toFixed(5)); };
    if (Array.isArray(c.shapes)) c.shapes = G.moveShapes(c.shapes, -x, -y);
    shift('cx', x); shift('cy', y); shift('x1', x); shift('y1', y); shift('x2', x); shift('y2', y); shift('entryX', x); shift('entryY', y);
    if (Array.isArray(c.cons)) c.cons = c.cons.map(g => { const h = { ...g }; for (const [kx, ky] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) if (h[kx] !== undefined) { h[kx] = +(h[kx] - x).toFixed(5); h[ky] = +(h[ky] - y).toFixed(5); } return h; });
    return c;
  }

  const api = { COATINGS, matNumbers, moveOrigin, openSettings, passes, CUSTOM_OPS, DEFAULTS, MATERIALS, OPS, calc, rctf, generate, toGcode, toMazatrol, settingsLines, readSettings, fileBase, mazName, arcSweep, describeLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HEM = api;
})(this);
