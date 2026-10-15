// Toolpath geometry for the HEM toolpaths on shapes the user draws or imports (the drawing geometry is in cad.js): filleted polylines, regions with islands,
// offsets (Clipper, round joins), distances, arc fitting (lines and arcs back from a polyline, as the engraving app
// does) and ASCII DXF import (from the engraving app).
// Inch. Polylines are [[x, y], ...]; closed ones do not repeat the first point. Loops come back with outer
// boundaries counter-clockwise and holes clockwise (y up).
(function (root) {
  'use strict';
  const C = root.ClipperLib || (typeof require !== 'undefined' ? require('./clipper.js') : null);
  if (!C) throw new Error('hem-geo needs lib/clipper.js');
  // the drawing geometry (shapes, arcs, fillets, text, construction, DXF) lives in cad.js; this file adds the
  // toolpath geometry on Clipper and hands out both
  const CAD = root.CAD || (typeof require !== 'undefined' ? require('./cad.js') : null);
  if (!CAD) throw new Error('hem-geo needs lib/cad.js');
  const { area, dist, filleted, segDist, cumLen, at, removeDup } = CAD;
  const S = 1e5;                         // Clipper works in integers: 0.00001 in
  const ARC_TOL = 0.0001;                // how far round joins may stray from the true arc

  const toC = pts => pts.map(p => ({ X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }));
  const fromC = path => path.map(p => [p.X / S, p.Y / S]);

  function union(polys, evenOdd) {
    const c = new C.Clipper(), sol = new C.Paths();
    c.AddPaths(polys.filter(p => p.length >= 3).map(toC), C.PolyType.ptSubject, true);
    const ft = evenOdd ? C.PolyFillType.pftEvenOdd : C.PolyFillType.pftNonZero;
    c.Execute(C.ClipType.ctUnion, sol, ft, ft);
    return sol;
  }
  function offset(paths, d, tol) {
    if (!paths.length) return [];
    const co = new C.ClipperOffset(2, (tol || ARC_TOL) * S), sol = new C.Paths();
    co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    co.Execute(sol, d * S);
    return sol;
  }
  // fewer points: drop ones within d of the line through their neighbours
  function clean(paths, d) { return C.Clipper.CleanPolygons(paths, (d || 0.0002) * S); }
  // boolean of two regions: 'union' | 'diff' | 'and'
  function bool(op, a, b) {
    const c = new C.Clipper(), sol = new C.Paths();
    c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true);
    c.Execute(op === 'diff' ? C.ClipType.ctDifference : op === 'and' ? C.ClipType.ctIntersection : C.ClipType.ctUnion, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    return sol;
  }
  // The parts of a closed loop inside a region, each running the same way as the loop, in order along it.
  function clipLoop(pts, region) {
    const n = pts.length, cum = cumLen(pts, true), path = toC(pts.concat([pts[0]]));
    const c = new C.Clipper(), tree = new C.PolyTree();
    c.AddPath(path, C.PolyType.ptSubject, false); c.AddPaths(region, C.PolyType.ptClip, true);
    c.Execute(C.ClipType.ctIntersection, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    // arc length along the loop of a point on it
    const sAt = p => { let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], d = segDist(p, a, b); if (d < bd) { bd = d; const vx = b[0] - a[0], vy = b[1] - a[1], l = Math.hypot(vx, vy) || 1; best = cum[i] + Math.max(0, Math.min(l, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)); } } return best; };
    const L = cum[cum.length - 1];
    let pieces = C.Clipper.OpenPathsFromPolyTree(tree).map(fromC).filter(P => P.length >= 2).map(P => {
      const s0 = sAt(P[0]), s1 = sAt(P[P.length - 1]), mid = sAt(P[Math.floor(P.length / 2)]);
      const fwd = ((mid - s0 + L) % L) <= ((s1 - s0 + L) % L) + 1e-9;   // the middle comes after the start going forward
      if (!fwd) P = P.slice().reverse();
      return { pts: P, s: fwd ? s0 : s1, e: fwd ? s1 : s0 };
    });
    pieces.sort((a, b) => a.s - b.s);
    // a piece that runs through the loop's start comes back in two halves: join them
    if (pieces.length > 1) { const a = pieces[pieces.length - 1], b = pieces[0]; if (dist(a.pts[a.pts.length - 1], b.pts[0]) < 1e-5) { pieces[0] = { pts: a.pts.concat(b.pts.slice(1)), s: a.s, e: b.e }; pieces.pop(); } }
    // each piece's points, with where it starts and ends along the loop (s0, s1)
    return pieces.map(p => Object.assign(p.pts, { s0: p.s, s1: p.e }));
  }
  // the part of a closed loop from arc length s0 to s1 going forward (round past the start if s1 < s0)
  function loopSlice(pts, s0, s1) {
    const cum = cumLen(pts, true), L = cum[cum.length - 1], n = pts.length, out = [at(pts, true, s0, cum).p];
    let span = ((s1 - s0) % L + L) % L; if (span < 1e-9) return [out[0]];
    for (let i = 1; i <= n; i++) { const s = cum[i % (n + 1)] !== undefined ? cum[i] : L; const d = ((s - s0) % L + L) % L; if (d > 1e-9 && d < span - 1e-9) out.push({ d, p: pts[i % n] }); }
    const mids = out.slice(1).sort((u, v) => u.d - v.d).map(o => o.p);
    return [out[0]].concat(mids, [at(pts, true, s1, cum).p]);
  }
  // One side of an open polyline, d away: side +1 left of its direction, -1 right. Built from Clipper's flat-ended
  // buffer (so tight turns are handled), keeping the run of that buffer on the chosen side, in the path's direction.
  function sideOffset(pts, d, side) {
    const co = new C.ClipperOffset(2, ARC_TOL * S), sol = new C.Paths();
    co.AddPath(toC(pts), C.JoinType.jtRound, C.EndType.etOpenButt); co.Execute(sol, d * S);
    if (!sol.length) return null;
    const loop = fromC(sol.reduce((a, b) => (Math.abs(C.Clipper.Area(b)) > Math.abs(C.Clipper.Area(a)) ? b : a)));
    const cum = cumLen(pts, false), L = cum[cum.length - 1], n = pts.length;
    // for each vertex: which side of the path it is on, and how far along the path its nearest point is
    const info = loop.map(q => {
      let best = Infinity, bi = 0, bt = 0;
      for (let i = 0; i < n - 1; i++) { const a = pts[i], b = pts[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2)) : 0; const dd = Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy); if (dd < best - 1e-12) { best = dd; bi = i; bt = t; } }
      const a = pts[bi], b = pts[bi + 1], cross = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      return { on: Math.sign(cross) === side, s: cum[bi] + bt * (cum[bi + 1] - cum[bi]) };
    });
    // the longest run of vertices on the chosen side, going round the loop
    const m = loop.length; let bestRun = null;
    for (let st = 0; st < m; st++) {
      if (!info[st].on || info[(st - 1 + m) % m].on) continue;
      const run = []; for (let k = 0; k < m && info[(st + k) % m].on; k++) run.push(st + k);
      if (!bestRun || run.length > bestRun.length) bestRun = run;
    }
    if (!bestRun) { if (info.every(i => i.on)) bestRun = loop.map((_, i) => i); else return null; }
    let out = bestRun.map(i => loop[i % m]);
    if (info[bestRun[0] % m].s > info[bestRun[bestRun.length - 1] % m].s) out.reverse();
    return removeDup(out);
  }
  // an open path's own direction at its ends
  function endDirs(pts) {
    const n = pts.length, u = (a, b) => { const l = dist(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    return [u(pts[0], pts[1]), u(pts[n - 2], pts[n - 1])];
  }

  // an open polyline (or a closed one as a line) grown by d on both sides, with round ends
  function buffer(pts, closed, d) {
    const co = new C.ClipperOffset(2, ARC_TOL * S), sol = new C.Paths();
    co.AddPath(toC(pts), C.JoinType.jtRound, closed ? C.EndType.etClosedLine : C.EndType.etOpenRound);
    co.Execute(sol, d * S);
    return sol;
  }
  // Clipper paths -> [{pts, hole}] in inches, outer counter-clockwise, holes clockwise
  function loops(paths) {
    return paths.map(fromC).filter(p => p.length >= 3).map(pts => ({ pts, hole: area(pts) < 0, area: Math.abs(area(pts)) }));
  }
  function inside(p, paths) {             // inside a region with holes (even-odd)
    const q = { X: Math.round(p[0] * S), Y: Math.round(p[1] * S) };
    let k = 0; for (const path of paths) if (C.Clipper.PointInPolygon(q, path) !== 0) k++;
    return k % 2 === 1;
  }
  // distance from a point to the edges of closed loops (arrays of points)
  function edgeDist(p, lps) {
    let m = Infinity;
    for (const L of lps) for (let i = 0, n = L.length; i < n; i++) { const d = segDist(p, L[i], L[(i + 1) % n]); if (d < m) m = d; }
    return m;
  }
  // Shapes offset by d (+ outward / to the left of an open path, − inward / to the right): new shapes, with arcs
  // fitted back as arcs. A closed shape can come back as several (or none, when it shrinks away).
  function offsetShapes(shapes, d) {
    // a polyline fitted to lines and arcs, as points with the arc radius on the point it starts from
    const asPts = P => {
      const prims = CAD.fitPath(P, 0.0002), pts = [[+P[0][0].toFixed(5), +P[0][1].toFixed(5), 0, 0]];
      let cur = P[0];
      for (const pr of prims) {
        if (pr.t === 'A') { const R = Math.hypot(cur[0] - pr.cx, cur[1] - pr.cy); pts[pts.length - 1][3] = +(pr.ccw ? R : -R).toFixed(5); }
        pts.push([+pr.x.toFixed(5), +pr.y.toFixed(5), 0, 0]); cur = [pr.x, pr.y];
      }
      return pts;
    };
    const res = [];
    for (const sh of shapes) {
      if (sh.closed) {
        for (const L of loops(offset(union([CAD.filleted(sh)], false), d)).map(l => l.pts)) {
          const pts = asPts(L.concat([L[0]]));
          if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-4) pts.pop();          // closed: no repeat of the first point
          res.push({ closed: true, pts });
        }
      } else {
        const q = sideOffset(CAD.filleted(sh), Math.abs(d), d >= 0 ? 1 : -1);
        if (q && q.length > 1) res.push({ closed: false, pts: asPts(q) });
      }
    }
    return res;
  }

  const api = Object.assign({}, CAD, { offsetShapes, clean, loopSlice, sideOffset, endDirs, clipLoop, bool, S, toC, fromC, union, offset, buffer, loops, inside, edgeDist, C });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HEMGeo = api;
})(this);
