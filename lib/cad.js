// CAD geometry for MACH1: shapes (points with fillets and arcs, open edges), construction geometry, changing shapes
// (move, rotate, scale, mirror), shapes as text, dimensions, arc fitting and ASCII DXF import. Inch. No Clipper here:
// the toolpath geometry (offsets, clipping) is in hem-geo.js, which hands these out too.
// Polylines are [[x, y], ...]; closed ones do not repeat the first point.
(function (root) {
  'use strict';
  function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  // ---------------------------------------------------------------- shapes: lines, arcs, fillets
  // A shape is {closed, pts: [[x, y, fillet, arc], ...]}. arc is the segment from this point to the next:
  // 0 = straight, otherwise its radius, + counter-clockwise (G3) or − clockwise (G2), the shorter way round
  // (180° at most; a longer arc is two segments). fillet rounds the corner at a point between two straight segments.

  // the arc from a to b with signed radius r: centre, radius (at least half the chord), sweep (signed, radians)
  function arcSeg(a, b, r) {
    const c = dist(a, b), ccw = r > 0;
    let R = Math.abs(r); if (R < c / 2) R = c / 2;
    const h = Math.sqrt(Math.max(0, R * R - c * c / 4)), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ux = (b[0] - a[0]) / (c || 1), uy = (b[1] - a[1]) / (c || 1), sg = ccw ? 1 : -1;
    const ctr = [m[0] - uy * h * sg, m[1] + ux * h * sg];
    const sweep = 2 * Math.asin(Math.min(1, c / (2 * R))) * sg;
    return { c: ctr, R, sweep, a0: Math.atan2(a[1] - ctr[1], a[0] - ctr[0]) };
  }
  // points strictly between a and b along the arc
  // the angle step that keeps a chord within SAG of the true arc (and no coarser than step)
  const SAG = 0.00005;
  const arcStep = (R, step) => Math.min(step, R > SAG ? 2 * Math.acos(1 - SAG / R) : step);
  function arcInner(a, b, r, step) {
    const A = arcSeg(a, b, r), k = Math.max(1, Math.ceil(Math.abs(A.sweep) / arcStep(A.R, step))), o = [];
    for (let j = 1; j < k; j++) { const t = A.a0 + A.sweep * j / k; o.push([A.c[0] + A.R * Math.cos(t), A.c[1] + A.R * Math.sin(t)]); }
    return o;
  }
  // The arc from a through m to b: its signed radius, and the points to put between a and b so each piece is
  // 180° or less (a midpoint when the arc goes the long way round). null when the three points are in a line.
  function arcThrough(a, m, b) {
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    if (Math.abs(d) < 1e-12 || dist(a, b) < 1e-9) return null;
    const a2 = a[0] * a[0] + a[1] * a[1], m2 = m[0] * m[0] + m[1] * m[1], b2 = b[0] * b[0] + b[1] * b[1];
    const c = [(a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d, (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d];
    const R = dist(a, c), ccw = (m[0] - a[0]) * (b[1] - m[1]) - (m[1] - a[1]) * (b[0] - m[0]) > 0;
    const ang = p => Math.atan2(p[1] - c[1], p[0] - c[0]);
    let sw = ang(b) - ang(a); if (ccw) { while (sw <= 0) sw += 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; }
    const r = ccw ? R : -R;
    if (Math.abs(sw) <= Math.PI + 1e-9) return { r, mids: [] };
    const t = ang(a) + sw / 2;
    return { r, mids: [[c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]] };
  }
  // A shape as a polyline: arcs sampled, fillets rounded off.
  function filleted(shape, stepDeg) {
    const P = (shape.pts || []).map(p => [+p[0], +p[1], Math.abs(+p[2] || 0), +p[3] || 0]).filter(p => isFinite(p[0]) && isFinite(p[1]));
    const pts = [];
    for (const p of P) { const l = pts[pts.length - 1]; if (!l || dist(l, p) > 1e-7) pts.push(p); else if (p[3]) l[3] = p[3]; }
    if (shape.closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-7) pts.pop();
    const n = pts.length, closed = !!shape.closed && n >= 2, out = [], step = (stepDeg || 1) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const p = pts[i], r = p[2], prev = pts[(i - 1 + n) % n];
      const hasP = closed || i > 0, hasN = closed || i < n - 1;
      const lines = hasP && hasN && !prev[3] && !p[3];              // fillets only between two straight segments
      if (!r || !lines) out.push([p[0], p[1]]);
      else {
        const a = prev, b = pts[(i + 1) % n];
        const u1 = [(p[0] - a[0]) / dist(a, p), (p[1] - a[1]) / dist(a, p)], u2 = [(b[0] - p[0]) / dist(p, b), (b[1] - p[1]) / dist(p, b)];
        const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]);   // signed turn angle
        if (Math.abs(turn) < 1e-6 || Math.abs(Math.abs(turn) - Math.PI) < 1e-6) out.push([p[0], p[1]]);
        else {
          let t = r * Math.tan(Math.abs(turn) / 2);
          const room = Math.min(dist(a, p), dist(p, b)) * (closed || (i > 1 && i < n - 2) ? 0.5 : 1);
          let rr = r;
          if (t > room) { t = room; rr = t / Math.tan(Math.abs(turn) / 2); }
          const s0 = [p[0] - u1[0] * t, p[1] - u1[1] * t], sg = Math.sign(turn);
          const nrm = [-u1[1] * sg, u1[0] * sg], c = [s0[0] + nrm[0] * rr, s0[1] + nrm[1] * rr];
          const a0 = Math.atan2(s0[1] - c[1], s0[0] - c[0]), k = Math.max(2, Math.ceil(Math.abs(turn) / arcStep(rr, step)));
          for (let j = 0; j <= k; j++) { const ang = a0 + turn * j / k; out.push([c[0] + rr * Math.cos(ang), c[1] + rr * Math.sin(ang)]); }
        }
      }
      if (p[3] && hasN) out.push(...arcInner(p, pts[(i + 1) % n], p[3], step));
    }
    return out;
  }

  // A closed shape's edges as polylines, split by whether they are marked open (pts[i][4]): {open: [...], walls: [...]}.
  // Each edge is from point i to point i+1 (a line or its arc); runs of neighbouring edges of the same kind are joined.
  function edgeRuns(shape) {
    const P = (shape.pts || []).map(p => [+p[0], +p[1], +p[2] || 0, +p[3] || 0, +p[4] ? 1 : 0]), n = P.length, out = { open: [], walls: [] };
    if (!shape.closed || n < 2) return out;
    const edge = i => { const a = P[i], b = P[(i + 1) % n]; return [[a[0], a[1]]].concat(a[3] ? arcInner(a, b, a[3], Math.PI / 180) : [], [[b[0], b[1]]]); };
    let start = 0; while (start < n && P[(start - 1 + n) % n][4] === P[start][4]) start++;
    if (start === n) { out[P[0][4] ? 'open' : 'walls'].push(filleted(shape).concat([filleted(shape)[0]])); return out; }
    let cur = null, kind = null;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n, kd = P[i][4] ? 'open' : 'walls';
      if (kd !== kind) { if (cur) out[kind].push(cur); cur = edge(i); kind = kd; } else cur = cur.concat(edge(i).slice(1));
    }
    if (cur) out[kind].push(cur);
    return out;
  }

  function segDist(p, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)) : 0;
    return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
  }
  function polyLen(P, closed) { let s = 0; for (let i = 1; i < P.length; i++) s += dist(P[i - 1], P[i]); if (closed) s += dist(P[P.length - 1], P[0]); return s; }
  // point and unit direction at arc length s along a polyline
  function at(P, closed, s, cum) {
    const n = P.length, m = closed ? n : n - 1, L = cum[cum.length - 1];
    if (closed) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
    let lo = 0, hi = m - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = P[lo], b = P[(lo + 1) % n], seg = cum[lo + 1] - cum[lo] || 1e-12, t = (s - cum[lo]) / seg;
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg] };
  }
  function cumLen(P, closed) { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + dist(P[i - 1], P[i])); if (closed) c.push(c[c.length - 1] + dist(P[P.length - 1], P[0])); return c; }
  // the direction at s, smoothed over a window so a trochoid turns gently at polyline corners
  function dirAt(P, closed, s, cum, w) {
    const a = at(P, closed, s - w, cum).p, b = at(P, closed, s + w, cum).p, L = dist(a, b);
    return L > 1e-9 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : at(P, closed, s, cum).d;
  }
  function removeDup(P) { const o = []; for (const p of P) { const l = o[o.length - 1]; if (!l || dist(l, p) > 1e-6) o.push(p); } return o; }

  // ---------------------------------------------------------------- shapes as text
  // One point per line: X, Y and then, if wanted, fillet R, arc R (+ counter-clockwise, − clockwise) and open (1 or
  // "open": the edge to the next point has air beyond it). Commas, tabs (a spreadsheet paste), spaces or semicolons.
  // A line starting with # (or naming a shape: "shape 2 closed", "open path") starts a new shape; a blank line does
  // too. A header row of words is skipped.
  function shapesToText(shapes) {
    const n = v => String(+(+v || 0).toFixed(5));
    return shapes.map((sh, i) => '# shape ' + (i + 1) + ' ' + (sh.closed ? 'closed' : 'open') + (sh.cut === false ? ' cad only' : '') + '\n' +
      sh.pts.map(p => { const row = [n(p[0]), n(p[1])]; const f = +p[2] || 0, a = +p[3] || 0, o = +p[4] ? 1 : 0; if (f || a || o) row.push(n(f)); if (a || o) row.push(n(a)); if (o) row.push('1'); return row.join(', '); }).join('\n')).join('\n\n') + '\n';
  }
  // -> {shapes, errors: [{line, text}]}; closed: what a shape is when nothing says (true, or false for paths)
  function shapesFromText(text, closed) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n'), shapes = [], errors = [];
    let cur = null;
    const begin = c => { cur = { closed: c === undefined ? closed !== false : c, pts: [] }; shapes.push(cur); };
    lines.forEach((raw, li) => {
      const line = raw.trim();
      if (!line) { if (cur && cur.pts.length) cur = null; return; }
      const head = /^#|^(shape|path|closed|open)\b/i.test(line) && !/^[-+.\d]/.test(line);
      if (head) { const c = /\bopen\b/i.test(line) && !/\bclosed\b/i.test(line) ? false : /\bclosed\b/i.test(line) ? true : undefined; begin(c); if (/\bcad\b|no cut|not? machin/i.test(line)) cur.cut = false; return; }
      // tabs or commas keep their empty cells in place (a blank fillet column); otherwise spaces separate
      const cells = /\t/.test(raw) ? raw.trim().split('\t').map(x => x.trim()) : /[,;]/.test(line) ? line.split(/[,;]/).map(x => x.trim()) : line.split(/\s+/);
      if (!cells.some(x => x !== '')) return;
      // a header row of words (X Y Fillet ...) is skipped
      if (cells.every(x => x === '' || !isFinite(parseFloat(x)))) return;
      const nums = cells.slice(0, 4).map(x => (x === '' ? 0 : parseFloat(x)));
      if (nums.length < 2 || !isFinite(nums[0]) || !isFinite(nums[1]) || nums.slice(2).some(v => !isFinite(v))) { errors.push({ line: li + 1, text: raw }); return; }
      const open = cells[4] !== undefined && (/^(1|open|o|yes|y|true)$/i.test(cells[4]));
      if (!cur) begin();
      const p = [nums[0], nums[1], Math.abs(nums[2] || 0), nums[3] || 0];
      if (open) p.push(1);
      cur.pts.push(p);
    });
    const out = shapes.filter(s => s.pts.length);
    out.forEach(s => { if (s.closed && s.pts.length < 3 && !s.pts.some(p => p[3])) s.closed = false; });
    return { shapes: out, errors };
  }

  // ---------------------------------------------------------------- construction geometry
  // {t:'point', x, y} | {t:'line', x, y, a} (endless, through the point at a degrees) | {t:'line2', x1, y1, x2, y2}
  // (endless, through both) | {t:'circle', x, y, d}. Lines come back as a point and a unit direction.
  function consParts(cons) {
    const pts = [], lines = [], circles = [];
    for (const g of cons || []) {
      if (g.t === 'point') pts.push([+g.x, +g.y]);
      else if (g.t === 'line') { const a = (+g.a || 0) * Math.PI / 180; lines.push({ p: [+g.x, +g.y], u: [Math.cos(a), Math.sin(a)] }); pts.push([+g.x, +g.y]); }
      else if (g.t === 'line2') { const L = Math.hypot(g.x2 - g.x1, g.y2 - g.y1); if (L > 1e-9) { lines.push({ p: [+g.x1, +g.y1], u: [(g.x2 - g.x1) / L, (g.y2 - g.y1) / L] }); pts.push([+g.x1, +g.y1], [+g.x2, +g.y2]); } }
      else if (g.t === 'circle') { const r = Math.abs(+g.d) / 2; if (r > 0) { circles.push({ c: [+g.x, +g.y], r }); pts.push([+g.x, +g.y]); } }
    }
    return { pts, lines, circles };
  }
  // where construction lines and circles cross each other
  function consCrossings(cons) {
    const { lines, circles } = consParts(cons), out = [];
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j], den = a.u[0] * b.u[1] - a.u[1] * b.u[0]; if (Math.abs(den) < 1e-12) continue;
      const t = ((b.p[0] - a.p[0]) * b.u[1] - (b.p[1] - a.p[1]) * b.u[0]) / den; out.push([a.p[0] + a.u[0] * t, a.p[1] + a.u[1] * t]);
    }
    for (const l of lines) for (const c of circles) {
      const dx = l.p[0] - c.c[0], dy = l.p[1] - c.c[1], b = dx * l.u[0] + dy * l.u[1], q = b * b - (dx * dx + dy * dy - c.r * c.r);
      if (q < -1e-12) continue; const sq = Math.sqrt(Math.max(0, q));
      for (const t of q < 1e-12 ? [-b] : [-b - sq, -b + sq]) out.push([l.p[0] + l.u[0] * t, l.p[1] + l.u[1] * t]);
    }
    for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
      const A = circles[i], Bc = circles[j], d = dist(A.c, Bc.c); if (d < 1e-12 || d > A.r + Bc.r + 1e-9 || d < Math.abs(A.r - Bc.r) - 1e-9) continue;
      const a = (A.r * A.r - Bc.r * Bc.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)), mx = A.c[0] + a * (Bc.c[0] - A.c[0]) / d, my = A.c[1] + a * (Bc.c[1] - A.c[1]) / d;
      out.push([mx + h * (Bc.c[1] - A.c[1]) / d, my - h * (Bc.c[0] - A.c[0]) / d]); if (h > 1e-9) out.push([mx - h * (Bc.c[1] - A.c[1]) / d, my + h * (Bc.c[0] - A.c[0]) / d]);
    }
    return out;
  }
  // The point to snap p to, within tol: a construction point, centre or crossing, or a shape's point, first;
  // otherwise the nearest point on a construction line or circle. null when nothing is near.
  function consSnap(p, cons, shapes, tol) {
    const { pts, lines, circles } = consParts(cons);
    let best = null, bd = tol;
    const cand = pts.concat(consCrossings(cons));
    for (const sh of shapes || []) {
      const P = sh.pts, n = P.length;
      for (const q of P) cand.push([+q[0], +q[1]]);
      // the middle of each segment (on the arc for an arc)
      for (let j = 0; j < (sh.closed ? n : n - 1); j++) { const a = P[j], b = P[(j + 1) % n]; if (+a[3]) { const A = arcSeg([+a[0], +a[1]], [+b[0], +b[1]], +a[3]), t = A.a0 + A.sweep / 2; cand.push([A.c[0] + A.R * Math.cos(t), A.c[1] + A.R * Math.sin(t)]); } else cand.push([(+a[0] + +b[0]) / 2, (+a[1] + +b[1]) / 2]); }
    }
    for (const q of cand) { const d = dist(p, q); if (d < bd) { bd = d; best = { p: q, kind: 'point' }; } }
    if (best) return best;
    bd = tol;
    for (const l of lines) { const t = (p[0] - l.p[0]) * l.u[0] + (p[1] - l.p[1]) * l.u[1], q = [l.p[0] + l.u[0] * t, l.p[1] + l.u[1] * t], d = dist(p, q); if (d < bd) { bd = d; best = { p: q, kind: 'line' }; } }
    for (const c of circles) { const d0 = dist(p, c.c); if (d0 < 1e-12) continue; const q = [c.c[0] + (p[0] - c.c[0]) / d0 * c.r, c.c[1] + (p[1] - c.c[1]) / d0 * c.r], d = Math.abs(d0 - c.r); if (d < bd) { bd = d; best = { p: q, kind: 'circle' }; } }
    return best;
  }

  // ---------------------------------------------------------------- changing shapes
  // Every point of the shapes through f([x, y]) -> [x, y]. Radii (fillet, arc) are scaled by k; a mirror (flip)
  // turns each arc the other way, so it stays the same curve. Open-edge flags go with their points.
  const r5 = v => Math.round(v * 1e5) / 1e5;
  function mapShapes(shapes, f, k, flip) {
    return shapes.map(sh => ({ ...sh, pts: sh.pts.map(p => {
      const q = f([+p[0], +p[1]]), out = [r5(q[0]), r5(q[1]), r5(Math.abs(+p[2] || 0) * (k || 1)), r5((+p[3] || 0) * (k || 1) * (flip ? -1 : 1))];
      if (+p[4]) out.push(1);
      return out;
    }) }));
  }
  const moveShapes = (shapes, dx, dy) => mapShapes(shapes, p => [p[0] + dx, p[1] + dy]);
  function rotateShapes(shapes, deg, c) {
    const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    return mapShapes(shapes, p => [c[0] + (p[0] - c[0]) * co - (p[1] - c[1]) * si, c[1] + (p[0] - c[0]) * si + (p[1] - c[1]) * co]);
  }
  const scaleShapes = (shapes, k, c) => mapShapes(shapes, p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k], Math.abs(k));
  // axis 'x': flip left-right (about the vertical line through c); 'y': flip up-down
  const mirrorShapes = (shapes, axis, c) => mapShapes(shapes, p => axis === 'x' ? [2 * c[0] - p[0], p[1]] : [p[0], 2 * c[1] - p[1]], 1, true);
  // the extents of shapes as drawn (arcs and fillets included): [minX, minY, maxX, maxY], or null
  function shapesBox(shapes) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const sh of shapes) for (const p of filleted(sh)) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
    return isFinite(b[0]) ? b : null;
  }

  // ---------------------------------------------------------------- arc fitting (from the engraving app)
  function circ3(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null;
    const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return [x, y, Math.hypot(a[0] - x, a[1] - y)];
  }
  function lineOk(P, i, j, tol) {
    const a = P[i], b = P[j], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 1e-9) return false; let lt = -1e-9;
    for (let k = i + 1; k < j; k++) { const t = ((P[k][0] - a[0]) * dx + (P[k][1] - a[1]) * dy) / L; if (t < lt - 1e-9 || t > L + 1e-9) return false; lt = t; if (Math.abs((P[k][0] - a[0]) * dy - (P[k][1] - a[1]) * dx) / L > tol) return false; }
    return true;
  }
  function arcOk(P, i, j, tol) {
    const m = (i + j) >> 1, c = circ3(P[i], P[m], P[j]); if (!c || c[2] > 50) return null;
    const ccw = (P[m][0] - P[i][0]) * (P[j][1] - P[m][1]) - (P[m][1] - P[i][1]) * (P[j][0] - P[m][0]) > 0;
    let sweep = 0, prev = Math.atan2(P[i][1] - c[1], P[i][0] - c[0]);
    for (let k = i + 1; k <= j; k++) {
      if (Math.abs(Math.hypot(P[k][0] - c[0], P[k][1] - c[1]) - c[2]) > tol) return null;
      const a = Math.atan2(P[k][1] - c[1], P[k][0] - c[0]); let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (ccw ? d <= 0 : d >= 0) return null; if (Math.abs(d) > Math.PI / 2) return null;
      const mx = (P[k][0] + P[k - 1][0]) / 2, my = (P[k][1] + P[k - 1][1]) / 2, sag = c[2] - Math.hypot(mx - c[0], my - c[1]); if (sag > tol * 4) return null;
      sweep += Math.abs(d); prev = a;
    }
    if (sweep > 175 * Math.PI / 180) return null;
    return { c: [c[0], c[1]], r: c[2], ccw };
  }
  // polyline -> [{t:'L', x, y} | {t:'A', ccw, x, y, cx, cy}] from P[0]
  function fitPath(P, tol) {
    const segs = [], n = P.length; let i = 0;
    while (i < n - 1) {
      let jl = i + 1; while (jl + 1 < n && jl - i < 400 && lineOk(P, i, jl + 1, tol)) jl++;
      let ja = -1, arc = null; for (let j = i + 2; j < n && j - i < 400; j++) { const a = arcOk(P, i, j, tol); if (!a) break; ja = j; arc = a; }
      if (arc && ja > jl) { segs.push({ t: 'A', ccw: arc.ccw, x: P[ja][0], y: P[ja][1], cx: arc.c[0], cy: arc.c[1] }); i = ja; }
      else { segs.push({ t: 'L', x: P[jl][0], y: P[jl][1] }); i = jl; }
    }
    return segs;
  }

  // ---------------------------------------------------------------- DXF (from the engraving app)
  // Entities become paths [x,y,bulge, x,y,bulge, ...] in drawing units; bulge = tan(angle/4). Joined end to end.
  const DXF_UNITS = { 1: 1, 2: 12, 4: 1 / 25.4, 5: 1 / 2.54, 6: 1000 / 25.4, 8: 1e-6, 9: 0.001, 10: 36 };
  function dxfArcPts(x1, y1, x2, y2, b, stepDeg) {
    const th = 4 * Math.atan(b), dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (Math.abs(b) < 1e-12 || L < 1e-12) return [[x2, y2]];
    const d = L / 2 / Math.tan(th / 2), cx = (x1 + x2) / 2 - dy / L * d, cy = (y1 + y2) / 2 + dx / L * d, r = Math.hypot(x1 - cx, y1 - cy), a0 = Math.atan2(y1 - cy, x1 - cx);
    const n = Math.max(1, Math.ceil(Math.abs(th) * 180 / Math.PI / stepDeg - 1e-9)), o = [];
    for (let k = 1; k < n; k++) { const a = a0 + th * k / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    o.push([x2, y2]); return o;
  }
  function dxfPathPts(p, stepDeg) { const o = [[p[0], p[1]]]; for (let i = 0; i + 3 < p.length; i += 3) o.push(...dxfArcPts(p[i], p[i + 1], p[i + 3], p[i + 4], p[i + 2], stepDeg)); return o; }
  function parseDXF(txt) {
    const s = String(txt);
    if (/^AutoCAD Binary DXF/.test(s)) throw new Error('This is a binary DXF. Save it as an ASCII DXF and import that.');
    const L = s.split(/\r\n|\r|\n/), P = [];
    for (let i = 0; i + 1 < L.length; i += 2) { const k = L[i].trim(); if (k === '' && i >= L.length - 2) break; if (!/^-?\d+$/.test(k)) throw new Error('This is not a DXF file this app can read.'); P.push([+k, L[i + 1].trim()]); }
    let units = 0, sec = '', blk = null, i = 0; const blocks = {}, ents = [];
    const take = () => { const e = { t: P[i][1], g: [] }; i++; while (i < P.length && P[i][0] !== 0) { e.g.push(P[i]); i++; } return e; };
    while (i < P.length) {
      const [k, v] = P[i];
      if (k === 0 && v === 'SECTION') { sec = P[i + 1] && P[i + 1][0] === 2 ? P[i + 1][1] : ''; i += 2; continue; }
      if (k === 0 && v === 'ENDSEC') { sec = ''; i++; continue; }
      if (k === 0 && v === 'EOF') break;
      if (sec === 'HEADER') { if (k === 9 && v === '$INSUNITS' && P[i + 1] && P[i + 1][0] === 70) units = parseInt(P[i + 1][1], 10) || 0; i++; continue; }
      if (sec === 'BLOCKS' && k === 0) { const e = take(); if (e.t === 'BLOCK') blk = { name: gs(e, 2), bx: gf(e, 10), by: gf(e, 20), ents: [] }; else if (e.t === 'ENDBLK') { if (blk) blocks[blk.name] = blk; blk = null; } else if (blk) blk.ents.push(e); continue; }
      if (sec === 'ENTITIES' && k === 0) { ents.push(take()); continue; }
      i++;
    }
    function gs(e, c) { const g = e.g.find(q => q[0] === c); return g ? g[1] : ''; }
    function gf(e, c, d = 0) { const g = e.g.find(q => q[0] === c); const n = g ? parseFloat(g[1]) : NaN; return isFinite(n) ? n : d; }
    const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
    const I = [1, 0, 0, 1, 0, 0], tr = (x, y) => [1, 0, 0, 1, x, y], rotm = r => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0], scl = (x, y) => [x, 0, 0, y, 0, 0];
    const skipped = {}, paths = []; let nEnt = 0;
    const cnt = t => { skipped[t] = (skipped[t] || 0) + 1; };
    const mir = (p, e) => { if (gf(e, 230, 1) >= 0) return p; const o = []; for (let j = 0; j < p.length; j += 3) o.push(-p[j], p[j + 1], -p[j + 2]); return o; };
    function xform(p, M) {
      if (M === I) return p;
      const det = M[0] * M[3] - M[1] * M[2], ap = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]], o = [];
      const sim = Math.abs(M[0] * M[2] + M[1] * M[3]) < 1e-9 && Math.abs(M[0] * M[0] + M[1] * M[1] - M[2] * M[2] - M[3] * M[3]) < 1e-9;
      if (sim) { for (let j = 0; j < p.length; j += 3) { const [x, y] = ap(p[j], p[j + 1]); o.push(x, y, det < 0 ? -p[j + 2] : p[j + 2]); } return o; }
      dxfPathPts(p, 3).forEach(([x, y]) => { const [a, b] = ap(x, y); o.push(a, b, 0); }); return o;
    }
    function entPaths(e, list, j) {
      const T = e.t;
      if (T === 'LINE') return { ps: [[gf(e, 10), gf(e, 20), 0, gf(e, 11), gf(e, 21), 0]] };
      if (T === 'CIRCLE') { const x = gf(e, 10), y = gf(e, 20), r = gf(e, 40); if (!(r > 0)) return null; return { ps: [mir([x + r, y, 1, x - r, y, 1, x + r, y, 0], e)] }; }
      if (T === 'ARC') {
        const x = gf(e, 10), y = gf(e, 20), r = gf(e, 40), a0 = gf(e, 50) * Math.PI / 180; let sw = ((gf(e, 51) - gf(e, 50)) % 360 + 360) % 360; if (sw < 1e-9) sw = 360; if (!(r > 0)) return null;
        const a1 = a0 + sw * Math.PI / 180, pt = a => [x + r * Math.cos(a), y + r * Math.sin(a)];
        if (sw >= 360) { const [p1, p2] = [pt(a0), pt(a0 + Math.PI)]; return { ps: [mir([p1[0], p1[1], 1, p2[0], p2[1], 1, p1[0], p1[1], 0], e)] }; }
        const [s1, s2] = pt(a0), [e1, e2] = pt(a1); return { ps: [mir([s1, s2, Math.tan(sw * Math.PI / 720), e1, e2, 0], e)] };
      }
      if (T === 'LWPOLYLINE') {
        const v = []; e.g.forEach(([c, val]) => { if (c === 10) v.push([parseFloat(val), 0, 0]); else if (c === 20 && v.length) v[v.length - 1][1] = parseFloat(val); else if (c === 42 && v.length) v[v.length - 1][2] = parseFloat(val) || 0; });
        if (v.length < 2) return null; if (gf(e, 70, 0) & 1) v.push([v[0][0], v[0][1], 0]); else v[v.length - 1][2] = 0; return { ps: [mir(v.flat(), e)] };
      }
      if (T === 'POLYLINE') {
        const vs = []; let k = j; while (k + 1 < list.length && list[k + 1].t === 'VERTEX') vs.push(list[++k]); if (k + 1 < list.length && list[k + 1].t === 'SEQEND') k++;
        const fl = gf(e, 70, 0); if (fl & (16 | 64)) { cnt('POLYLINE MESH'); return { ps: [], skip: k }; }
        const v = vs.filter(q => !(gf(q, 70, 0) & 16)).map(q => [gf(q, 10), gf(q, 20), fl & 8 ? 0 : gf(q, 42, 0)]);
        if (v.length < 2) return { ps: [], skip: k }; if (fl & 1) v.push([v[0][0], v[0][1], 0]); else v[v.length - 1][2] = 0; return { ps: [mir(v.flat(), e)], skip: k };
      }
      if (T === 'SPLINE') {
        const deg = gf(e, 71, 3), kn = e.g.filter(q => q[0] === 40).map(q => +q[1]), w = e.g.filter(q => q[0] === 41).map(q => +q[1]);
        const pairs = (cx, cy) => { const o = []; let cur = null; e.g.forEach(([c, v]) => { if (c === cx) { cur = [parseFloat(v), 0]; o.push(cur); } else if (c === cy && cur) cur[1] = parseFloat(v); }); return o; };
        const cp = pairs(10, 20), fp = pairs(11, 21); let pts = [];
        if (cp.length > deg && kn.length === cp.length + deg + 1) {
          const W = w.length === cp.length ? w : cp.map(() => 1), n = cp.length;
          const atU = u => {
            let k = deg; while (k < n - 1 && !(u < kn[k + 1])) k++; const d = [];
            for (let q = 0; q <= deg; q++) { const c = cp[k - deg + q], ww = W[k - deg + q]; d.push([c[0] * ww, c[1] * ww, ww]); }
            for (let r = 1; r <= deg; r++) for (let q = deg; q >= r; q--) { const a0 = kn[k - deg + q], a1 = kn[k + 1 + q - r], al = a1 > a0 ? (u - a0) / (a1 - a0) : 0; d[q] = [0, 1, 2].map(z => (1 - al) * d[q - 1][z] + al * d[q][z]); }
            return [d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]];
          };
          for (let k = deg; k < n; k++) { const u0 = kn[k], u1 = kn[k + 1]; if (!(u1 > u0)) continue; for (let q = pts.length ? 1 : 0; q <= 32; q++) pts.push(atU(u0 + (u1 - u0) * q / 32)); }
        } else if (fp.length >= 2) pts = fp;
        if (pts.length < 2) return null; return { ps: [pts.flatMap(q => [q[0], q[1], 0])] };
      }
      if (T === 'ELLIPSE') {
        const x = gf(e, 10), y = gf(e, 20), mx = gf(e, 11), my = gf(e, 21), k = gf(e, 40, 1), zs = gf(e, 230, 1) < 0 ? -1 : 1; let t0 = gf(e, 41, 0), t1 = gf(e, 42, 2 * Math.PI); if (t1 <= t0 + 1e-12) t1 += 2 * Math.PI;
        const nx = -my * k * zs, ny = mx * k * zs, n = Math.max(8, Math.ceil((t1 - t0) / (2 * Math.PI) * 180)), o = [];
        for (let q = 0; q <= n; q++) { const a = t0 + (t1 - t0) * q / n; o.push(x + mx * Math.cos(a) + nx * Math.sin(a), y + my * Math.cos(a) + ny * Math.sin(a), 0); } return { ps: [o] };
      }
      return null;
    }
    const walk = (list, M, depth) => {
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (['VERTEX', 'SEQEND', 'ATTRIB', 'ATTDEF'].includes(e.t)) continue;
        if (e.t === 'INSERT') {
          const b = blocks[gs(e, 2)]; if (!b || depth >= 8) { cnt('INSERT'); continue; }
          let N = mul(mul(tr(gf(e, 10), gf(e, 20)), rotm(gf(e, 50) * Math.PI / 180)), mul(scl(gf(e, 41, 1), gf(e, 42, 1)), tr(-b.bx, -b.by)));
          if (gf(e, 230, 1) < 0) N = mul(scl(-1, 1), N); walk(b.ents, M === I ? N : mul(M, N), depth + 1); continue;
        }
        const r = entPaths(e, list, j); if (!r) { cnt(e.t); continue; }
        if (r.skip != null) j = r.skip; nEnt++; r.ps.forEach(p => paths.push(xform(p, M)));
      }
    };
    walk(ents, I, 0);
    return { units, n: nEnt, skipped, paths: dxfChain(paths) };
  }
  function dxfChain(paths) {
    const eps = 1e-5, near = (a, b) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
    const st = p => [p[0], p[1]], en = p => [p[p.length - 3], p[p.length - 2]];
    const rev = p => { const n = p.length / 3, o = []; for (let i = n - 1; i >= 0; i--) o.push(p[3 * i], p[3 * i + 1], i > 0 ? -p[3 * (i - 1) + 2] : 0); return o; };
    const join = (a, b) => [...a.slice(0, -3), ...b];
    const open = [], out = []; paths.forEach(p => { if (p.length < 6) return; (p.length >= 9 && near(st(p), en(p)) ? out : open).push(p); });
    if (open.length > 3000) return [...out, ...open];
    const used = open.map(() => false);
    for (let i = 0; i < open.length; i++) {
      if (used[i]) continue; used[i] = true; let cur = open[i], grew = true;
      while (grew && !near(st(cur), en(cur))) {
        grew = false;
        for (let j = 0; j < open.length; j++) {
          if (used[j]) continue; const q = open[j];
          if (near(en(cur), st(q))) cur = join(cur, q); else if (near(en(cur), en(q))) cur = join(cur, rev(q));
          else if (near(st(cur), en(q))) cur = join(q, cur); else if (near(st(cur), st(q))) cur = join(rev(q), cur); else continue;
          used[j] = true; grew = true;
        }
      }
      out.push(cur);
    }
    return out;
  }
  // DXF text -> shapes {closed, pts:[[x,y,0]]} in inches (units: 'auto' | 'in' | 'mm')
  function dxfShapes(text, units) {
    const D = parseDXF(text), k = units === 'in' ? 1 : units === 'mm' ? 1 / 25.4 : (DXF_UNITS[D.units] || 1);
    const r5 = v => +v.toFixed(5);
    const shapes = D.paths.map(p => {
      // [x, y, bulge] triples -> points with the arc on the segment that starts there; bulge = tan(sweep / 4)
      const pts = [];
      for (let i = 0; i + 2 < p.length; i += 3) {
        const a = [p[i] * k, p[i + 1] * k], b = i + 5 < p.length ? [p[i + 3] * k, p[i + 4] * k] : null, bu = b ? p[i + 2] : 0;
        const l = pts[pts.length - 1];
        if (l && dist(l, a) < 1e-7) { if (bu) l[3] = 0; } else pts.push([r5(a[0]), r5(a[1]), 0, 0]);
        if (!b || Math.abs(bu) < 1e-9 || dist(a, b) < 1e-9) continue;
        const th = 4 * Math.atan(Math.abs(bu)), c = dist(a, b), R = c / (2 * Math.sin(th / 2)), sg = bu > 0 ? 1 : -1;
        if (th <= Math.PI + 1e-9) { pts[pts.length - 1][3] = r5(sg * R); continue; }
        // longer than a half circle: split at its middle
        const A = arcSeg(a, b, sg * R);   // the short way; the long way's centre is on the other side of the chord
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cc = [2 * m[0] - A.c[0], 2 * m[1] - A.c[1]];
        const a0 = Math.atan2(a[1] - cc[1], a[0] - cc[0]), mid = [cc[0] + R * Math.cos(a0 + sg * th / 2), cc[1] + R * Math.sin(a0 + sg * th / 2)];
        pts[pts.length - 1][3] = r5(sg * R);
        pts.push([r5(mid[0]), r5(mid[1]), 0, r5(sg * R)]);
      }
      const closed = pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-4;
      if (closed) pts.pop();
      return { closed, pts };
    }).filter(s => s.pts.length >= 2);
    return { shapes, skipped: D.skipped, units: D.units, n: D.n };
  }

  // ---------------------------------------------------------------- dimensions
  // The numbers of a drawing, from work zero: every point; every segment (length, angle, and for an arc its radius,
  // centre, direction and sweep); every fillet (radius, centre, where it starts and ends); each shape's size,
  // perimeter and area; the construction geometry and where it crosses. Degrees counter-clockwise from +X.
  const deg = a => { let d = a * 180 / Math.PI; while (d <= -180) d += 360; while (d > 180) d -= 360; return d; };
  // the fillet at p between a and b (both straight): {r, c, t1, t2} (t1 on the way in, t2 on the way out), or null
  function filletAt(a, p, b, r, room) {
    const la = dist(a, p), lb = dist(p, b); if (!(r > 0) || la < 1e-9 || lb < 1e-9) return null;
    const u1 = [(p[0] - a[0]) / la, (p[1] - a[1]) / la], u2 = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]);
    if (Math.abs(turn) < 1e-6 || Math.abs(Math.abs(turn) - Math.PI) < 1e-6) return null;
    let t = r * Math.tan(Math.abs(turn) / 2), rr = r;
    if (t > room) { t = room; rr = t / Math.tan(Math.abs(turn) / 2); }
    const sg = Math.sign(turn), t1 = [p[0] - u1[0] * t, p[1] - u1[1] * t], t2 = [p[0] + u2[0] * t, p[1] + u2[1] * t];
    return { r: rr, asked: r, c: [t1[0] - u1[1] * sg * rr, t1[1] + u1[0] * sg * rr], t1, t2, ccw: sg > 0 };
  }
  function dimensions(shapes, cons) {
    const out = { points: [], segments: [], fillets: [], shapes: [], cons: [], crossings: [] };
    (shapes || []).forEach((sh, si) => {
      const P = (sh.pts || []).map(p => [+p[0], +p[1], Math.abs(+p[2] || 0), +p[3] || 0, +p[4] ? 1 : 0]), n = P.length, closed = !!sh.closed && n >= 2;
      P.forEach((p, j) => out.points.push({ s: si + 1, n: j + 1, x: p[0], y: p[1], fillet: p[2], open: !!p[4], cut: sh.cut !== false }));
      const segs = closed ? n : n - 1;
      for (let j = 0; j < segs; j++) {
        const a = P[j], b = P[(j + 1) % n], seg = { s: si + 1, from: j + 1, to: (j + 1) % n + 1, open: !!a[4] };
        if (a[3]) {
          const A = arcSeg(a, b, a[3]);
          Object.assign(seg, { kind: 'arc', asked: Math.abs(a[3]), r: A.R, cx: A.c[0], cy: A.c[1], dir: a[3] > 0 ? 'CCW' : 'CW', sweep: Math.abs(A.sweep) * 180 / Math.PI, length: A.R * Math.abs(A.sweep), chord: dist(a, b), angle: deg(Math.atan2(b[1] - a[1], b[0] - a[0])) });
        } else Object.assign(seg, { kind: 'line', length: dist(a, b), angle: deg(Math.atan2(b[1] - a[1], b[0] - a[0])), dx: b[0] - a[0], dy: b[1] - a[1] });
        out.segments.push(seg);
      }
      // fillets: between two straight segments, as the drawing rounds them
      for (let j = 0; j < n; j++) {
        const p = P[j], prev = P[(j - 1 + n) % n];
        if (!p[2] || (!closed && (j === 0 || j === n - 1)) || prev[3] || p[3]) continue;
        const room = Math.min(dist(prev, p), dist(p, P[(j + 1) % n])) * (closed || (j > 1 && j < n - 2) ? 0.5 : 1);
        const f = filletAt(prev, p, P[(j + 1) % n], p[2], room);
        if (f) out.fillets.push({ s: si + 1, n: j + 1, r: f.r, asked: f.asked, cx: f.c[0], cy: f.c[1], x1: f.t1[0], y1: f.t1[1], x2: f.t2[0], y2: f.t2[1] });
      }
      const poly = filleted(sh), b = poly.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
      out.shapes.push({ s: si + 1, closed, cut: sh.cut !== false, points: n, minX: b[0], minY: b[1], maxX: b[2], maxY: b[3], width: b[2] - b[0], height: b[3] - b[1], perimeter: polyLen(poly, closed), area: closed ? Math.abs(area(poly)) : null });
    });
    (cons || []).forEach((g, i) => out.cons.push(Object.assign({ n: i + 1 }, g)));
    // crossings, without repeats
    for (const p of consCrossings(cons)) if (!out.crossings.some(q => dist(q, p) < 1e-6)) out.crossings.push(p);
    return out;
  }
  // a CSV of the dimensions (one table after another)
  function dimensionsCSV(d) {
    const f = v => (v === null || v === undefined ? '' : typeof v === 'number' ? String(+v.toFixed(5)) : String(v));
    const rows = [['Points'], ['Shape', 'Point', 'X', 'Y', 'Fillet R', 'Open edge after', 'Machined']];
    d.points.forEach(p => rows.push([p.s, p.n, p.x, p.y, p.fillet || '', p.open ? 'yes' : '', p.cut ? 'yes' : 'CAD only']));
    rows.push([], ['Segments'], ['Shape', 'From', 'To', 'Kind', 'Length', 'Angle', 'Radius', 'Centre X', 'Centre Y', 'Direction', 'Sweep']);
    d.segments.forEach(g => rows.push([g.s, g.from, g.to, g.kind, g.length, g.angle, g.r, g.cx, g.cy, g.dir, g.sweep]));
    if (d.fillets.length) { rows.push([], ['Fillets'], ['Shape', 'Point', 'Radius', 'Centre X', 'Centre Y', 'Start X', 'Start Y', 'End X', 'End Y']); d.fillets.forEach(q => rows.push([q.s, q.n, q.r, q.cx, q.cy, q.x1, q.y1, q.x2, q.y2])); }
    rows.push([], ['Shapes'], ['Shape', 'Closed', 'Width', 'Height', 'Min X', 'Min Y', 'Max X', 'Max Y', 'Perimeter', 'Area']);
    d.shapes.forEach(q => rows.push([q.s, q.closed ? 'yes' : 'no', q.width, q.height, q.minX, q.minY, q.maxX, q.maxY, q.perimeter, q.area]));
    if (d.cons.length) { rows.push([], ['Construction'], ['#', 'Kind', 'X', 'Y', 'Angle', 'X2', 'Y2', 'Diameter']); d.cons.forEach(g => rows.push([g.n, g.t, g.x ?? g.x1, g.y ?? g.y1, g.a, g.x2, g.y2, g.d])); }
    if (d.crossings.length) { rows.push([], ['Construction crossings'], ['#', 'X', 'Y']); d.crossings.forEach((p, i) => rows.push([i + 1, p[0], p[1]])); }
    return rows.map(r => r.map(f).map(v => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(',')).join('\n') + '\n';
  }
  // distance, offsets and angle from a to b
  function measure(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; return { d: Math.hypot(dx, dy), dx, dy, angle: deg(Math.atan2(dy, dx)) }; }

  // ---------------------------------------------------------------- drawing exactly
  // A typed point: "x,y" (absolute), "@dx,dy" (from the last point) or "@length<angle" (degrees). null if unreadable.
  function parsePoint(text, last) {
    const t = String(text).trim().replace(/\s+/g, '');
    let m = /^@(-?[\d.]+)<(-?[\d.]+)$/.exec(t);
    if (m && last) { const L = +m[1], a = +m[2] * Math.PI / 180; return [last[0] + L * Math.cos(a), last[1] + L * Math.sin(a)]; }
    m = /^@(-?[\d.]+)[,;](-?[\d.]+)$/.exec(t);
    if (m && last) return [last[0] + +m[1], last[1] + +m[2]];
    m = /^(-?[\d.]+)[,;](-?[\d.]+)$/.exec(t);
    if (m) return [+m[1], +m[2]];
    return null;
  }
  // The arc from p0 that leaves in direction d (unit) and ends at p1: its signed radius (+ CCW) and the points to put
  // between when it goes past 180°. null when p1 is straight ahead (no arc).
  function tangentArc(p0, d, p1) {
    const v = [p1[0] - p0[0], p1[1] - p0[1]], nl = [-d[1], d[0]], h = v[0] * nl[0] + v[1] * nl[1];
    if (Math.abs(h) < 1e-9) return null;
    const r = (v[0] * v[0] + v[1] * v[1]) / (2 * h), c = [p0[0] + nl[0] * r, p0[1] + nl[1] * r], R = Math.abs(r);
    // a point on the arc a little way along, to pick the right way round (the way it leaves)
    const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), dir = r > 0 ? 1 : -1, a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    let sw = (a1 - a0) * dir; while (sw <= 0) sw += 2 * Math.PI; while (sw > 2 * Math.PI) sw -= 2 * Math.PI;
    const mid = a0 + dir * sw / 2, T = arcThrough(p0, [c[0] + R * Math.cos(mid), c[1] + R * Math.sin(mid)], p1);
    return T;
  }
  // the direction a shape leaves its last point (open) or the tangent at the end of its last segment
  function endDir(pts) {
    const n = pts.length; if (n < 2) return null;
    const a = pts[n - 2], b = pts[n - 1];
    if (+a[3]) { const A = arcSeg(a, b, +a[3]), t = A.a0 + A.sweep, u = [-Math.sin(t), Math.cos(t)]; return A.sweep > 0 ? u : [-u[0], -u[1]]; }
    const L = dist(a, b); return L > 1e-12 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : null;
  }
  // where a ray (from p, direction u) meets construction lines and circles and the outlines of shapes: distances t
  function rayHits(p, u, cons, polylines) {
    const { lines, circles } = consParts(cons), out = [];
    for (const l of lines) { const den = u[0] * l.u[1] - u[1] * l.u[0]; if (Math.abs(den) < 1e-12) continue; out.push(((l.p[0] - p[0]) * l.u[1] - (l.p[1] - p[1]) * l.u[0]) / den); }
    for (const c of circles) { const dx = p[0] - c.c[0], dy = p[1] - c.c[1], b = dx * u[0] + dy * u[1], q = b * b - (dx * dx + dy * dy - c.r * c.r); if (q < 0) continue; const sq = Math.sqrt(q); out.push(-b - sq, -b + sq); }
    for (const P of polylines) for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], e = [b[0] - a[0], b[1] - a[1]], den = u[0] * e[1] - u[1] * e[0]; if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - p[0]) * e[1] - (a[1] - p[1]) * e[0]) / den, s = ((a[0] - p[0]) * u[1] - (a[1] - p[1]) * u[0]) / den;
      if (s >= -1e-9 && s <= 1 + 1e-9) out.push(t);
    }
    return out;
  }
  // Extend (or trim) both ends of an open path along its end segments to the nearest crossing with the construction
  // geometry or the other shapes. Straight end segments only. Returns the new shape (unchanged ends where nothing is met).
  function extendEnds(shape, others, cons, trim) {
    if (shape.closed || shape.pts.length < 2) return shape;
    const polys = others.map(o => { const f = filleted(o); return o.closed ? f.concat([f[0]]) : f; });
    const pts = shape.pts.map(p => p.slice());
    const fix = (endI, prevI) => {
      const a = pts[prevI], b = pts[endI]; if (+pts[Math.min(endI, prevI)][3]) return;       // an arc at the end: left as it is
      const L = dist(a, b); if (L < 1e-9) return;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], hits = rayHits([b[0], b[1]], u, cons, polys);
      const t = trim ? Math.max(-Infinity, ...hits.filter(h => h < -1e-6 && h > -L + 1e-6)) : Math.min(Infinity, ...hits.filter(h => h > 1e-6));
      if (isFinite(t)) { b[0] = +(b[0] + u[0] * t).toFixed(5); b[1] = +(b[1] + u[1] * t).toFixed(5); }
    };
    fix(pts.length - 1, pts.length - 2); fix(0, 1);
    return { ...shape, pts };
  }

  // ---- editing one segment or point of a shape. A point is [x, y, fillet R, arc R, open]: the arc R and the open flag
  // belong to the segment from that point to the next. Each returns new shapes; the one passed in is not changed.
  const cp = sh => ({ ...sh, pts: sh.pts.map(p => p.slice()) });
  const segEnd = (sh, j) => (j + 1) % sh.pts.length;
  // segment j: its ends, straight length or arc length, chord angle (degrees), arc radius (0 straight)
  function segInfo(sh, j) {
    const a = sh.pts[j], b = sh.pts[segEnd(sh, j)], r = +a[3] || 0, A = [+a[0], +a[1]], B = [+b[0], +b[1]], chord = dist(A, B);
    const arc = r ? arcSeg(A, B, r) : null;
    return { a: A, b: B, chord, len: arc ? arc.R * Math.abs(arc.sweep) : chord, angle: deg(Math.atan2(B[1] - A[1], B[0] - A[0])), r, tooSmall: !!r && Math.abs(r) < chord / 2 - 1e-9 };
  }
  // Delete segment j: a closed shape opens there (it now starts after the gap and ends before it); an open path
  // splits in two (a piece left with a single point goes). Returns the shapes that replace it (0, 1 or 2).
  function deleteSegment(sh, j) {
    const n = sh.pts.length, P = sh.pts.map(p => p.slice());
    if (sh.closed) {
      const pts = P.slice(j + 1).concat(P.slice(0, j + 1)); const l = pts[pts.length - 1]; l.length = Math.min(l.length, 3);
      pts.forEach(p => { if (p.length > 4) p.length = 4; });                 // open edges are for closed shapes
      return pts.length >= 2 ? [{ ...sh, closed: false, pts }] : [];
    }
    if (j < 0 || j >= n - 1) return [cp(sh)];
    const A = P.slice(0, j + 1), B = P.slice(j + 1); const l = A[A.length - 1]; l.length = Math.min(l.length, 3);
    return [A, B].filter(q => q.length >= 2).map(pts => ({ ...sh, pts }));
  }
  // Split an open path at point j into two paths that share it; a closed shape opens at point j instead
  function splitAt(sh, j) {
    const P = sh.pts.map(p => p.slice());
    if (sh.closed) { const pts = P.slice(j).concat(P.slice(0, j)), f = pts[0].slice(0, 3); pts.push(f); pts.forEach(p => { if (p.length > 4) p.length = 4; }); return [{ ...sh, closed: false, pts }]; }
    if (j <= 0 || j >= P.length - 1) return [cp(sh)];
    const A = P.slice(0, j + 1), B = P.slice(j).map(p => p.slice()); A[A.length - 1] = A[A.length - 1].slice(0, 3);
    return [{ ...sh, pts: A }, { ...sh, pts: B }];
  }
  // a closed shape starting at point j (same outline)
  function startAt(sh, j) { const s = cp(sh); if (sh.closed) s.pts = s.pts.slice(j).concat(s.pts.slice(0, j)); return s; }
  // the same outline run the other way: arcs change sign, and each segment's arc R / open flag moves to its new start
  function reverseShape(sh) {
    const P = sh.pts, n = P.length, out = [];
    for (let k = n - 1; k >= 0; k--) {
      const p = P[k], q = [+p[0], +p[1], +p[2] || 0, 0];
      const seg = sh.closed ? P[(k - 1 + n) % n] : k > 0 ? P[k - 1] : null;   // the segment that now leaves this point
      if (seg) { q[3] = -(+seg[3] || 0) || 0; if (+seg[4]) q[4] = 1; }
      out.push(q);
    }
    if (sh.closed) out.unshift(out.pop());                                    // keep the same first point
    return { ...sh, pts: out };
  }
  // move segment j's end point so the segment is L long (straight) or its chord is (arc), keeping its angle
  function setSegLength(sh, j, L) {
    const s = cp(sh), I = segInfo(sh, j); if (!(L > 0) || I.chord < 1e-12) return s;
    const b = s.pts[segEnd(sh, j)], k = L / I.chord;
    b[0] = +(I.a[0] + (I.b[0] - I.a[0]) * k).toFixed(6); b[1] = +(I.a[1] + (I.b[1] - I.a[1]) * k).toFixed(6);
    return s;
  }
  // turn segment j about its start so its chord runs at ang degrees
  function setSegAngle(sh, j, ang) {
    const s = cp(sh), I = segInfo(sh, j), t = ang * Math.PI / 180, b = s.pts[segEnd(sh, j)];
    b[0] = +(I.a[0] + I.chord * Math.cos(t)).toFixed(6); b[1] = +(I.a[1] + I.chord * Math.sin(t)).toFixed(6);
    return s;
  }
  // insert a point on segment j at its middle (on the arc for an arc; the arc stays one arc of the same radius)
  function insertMid(sh, j) {
    const s = cp(sh), a = s.pts[j], b = s.pts[segEnd(sh, j)], r = +a[3] || 0;
    let m = [(+a[0] + +b[0]) / 2, (+a[1] + +b[1]) / 2];
    if (r) { const A = arcSeg([+a[0], +a[1]], [+b[0], +b[1]], r), t = A.a0 + A.sweep / 2; m = [A.c[0] + A.R * Math.cos(t), A.c[1] + A.R * Math.sin(t)]; }
    const q = [+m[0].toFixed(6), +m[1].toFixed(6), 0, r ? Math.sign(r) * arcSeg([+a[0], +a[1]], [+b[0], +b[1]], r).R : 0];
    if (+a[4]) q[4] = 1;
    if (r) a[3] = q[3];
    s.pts.splice(j + 1, 0, q);
    return s;
  }

  const api = { segInfo, deleteSegment, splitAt, startAt, reverseShape, setSegLength, setSegAngle, insertMid, parsePoint, tangentArc, endDir, rayHits, extendEnds, filletAt, dimensions, dimensionsCSV, measure, area, dist, arcSeg, arcInner, arcThrough, filleted, edgeRuns, segDist, polyLen, at, cumLen, dirAt, removeDup, shapesToText, shapesFromText, consParts, consCrossings, consSnap, mapShapes, moveShapes, rotateShapes, scaleShapes, mirrorShapes, shapesBox, fitPath, parseDXF, dxfShapes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CAD = api;
})(this);
