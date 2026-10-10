// Engagement: how much of the cutter touches material along a toolpath, from a material-removal simulation on a
// grid (a tool radius is about ten cells). The material is where material(p) is true; the tool sweeps the moves in
// order and before each step the share of the cutter's edge touching material is its engagement angle. Each depth
// level (a 'LEVEL' note) starts again from the full material. Moves that change Z (plunges, helixes) cut but are
// not measured.
//
//   ENGAGE.angles(moves, R, box, material)  -> per move, the largest engagement angle in degrees (0 when not measured)
//   ENGAGE.slowDown(moves, K, angles)        -> lowers the feed of roughing moves whose angle runs over the stepover's
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;
  function sweep(m, from) {
    const a0 = Math.atan2(from.y - m.cy, from.x - m.cx), a1 = Math.atan2(m.y - m.cy, m.x - m.cx);
    let s = ((m.t === 'G3' ? a1 - a0 : a0 - a1) % TAU + TAU) % TAU; if (s < 1e-9) s = TAU; return s;
  }
  function angles(moves, R, box, material, opts) {
    const res = Math.max(0.004, (opts && opts.res) || R / 10);
    const x0 = box[0] - R - res, y0 = box[1] - R - res, nx = Math.max(1, Math.ceil((box[2] - box[0] + 2 * R + 2 * res) / res)), ny = Math.max(1, Math.ceil((box[3] - box[1] + 2 * R + 2 * res) / res));
    if (nx * ny > 4e6) return null;                                   // too big to simulate here
    const start = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (material([x0 + (i + 0.5) * res, y0 + (j + 0.5) * res])) start[j * nx + i] = 1;
    let mat = start.slice();
    const rr = Math.ceil(R / res), disk = [], ring = [];
    for (let dj = -rr - 1; dj <= rr + 1; dj++) for (let di = -rr - 1; di <= rr + 1; di++) {
      const d = Math.hypot(di * res, dj * res);
      if (d <= R) disk.push(dj * nx + di);
      if (d <= R && d > R - 1.5 * res) ring.push([di, dj]);          // the cutter's edge, inside it: only what is really cut
    }
    const cell = (x, y) => [Math.floor((x - x0) / res), Math.floor((y - y0) / res)];
    const angle = (x, y) => { const [ci, cj] = cell(x, y); let n = 0; for (const [di, dj] of ring) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < nx && j < ny && mat[j * nx + i]) n++; } return 360 * n / ring.length; };
    const cut = (x, y) => { const [ci, cj] = cell(x, y); if (ci < rr || cj < rr || ci >= nx - rr || cj >= ny - rr) { for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < nx && j < ny && Math.hypot(di, dj) * res <= R) mat[j * nx + i] = 0; } return; } const k0 = cj * nx + ci; for (const o of disk) mat[k0 + o] = 0; };
    const out = new Float32Array(moves.length);
    let p = null;
    moves.forEach((m, mi) => {
      if (m.t === 'C' && /^LEVEL /.test(m.s)) { mat = start.slice(); return; }
      if (m.x === undefined || isNaN(m.x)) return;
      if (p && !isNaN(p.x) && m.t !== 'G0') {
        const flat = Math.abs(m.z - p.z) < 1e-9, pts = [];
        if (m.t === 'G1') { const L = Math.hypot(m.x - p.x, m.y - p.y), n = Math.max(1, Math.ceil(L / res)); for (let i = 1; i <= n; i++) pts.push([p.x + (m.x - p.x) * i / n, p.y + (m.y - p.y) * i / n]); }
        else { const r = Math.hypot(p.x - m.cx, p.y - m.cy), a0 = Math.atan2(p.y - m.cy, p.x - m.cx), sw = sweep(m, p) * (m.t === 'G3' ? 1 : -1), n = Math.max(1, Math.ceil(Math.abs(sw) * r / res)); for (let i = 1; i <= n; i++) { const a = a0 + sw * i / n; pts.push([m.cx + r * Math.cos(a), m.cy + r * Math.sin(a)]); } }
        let worst = 0;
        for (const q of pts) { if (flat) worst = Math.max(worst, angle(q[0], q[1])); cut(q[0], q[1]); }
        out[mi] = worst;
      } else if (m.t === 'G0' && p && !isNaN(p.x)) { /* rapids cut nothing */ }
      p = m;
    });
    return out;
  }
  // The chip a programmed feed gives grows with the engagement up to 90°: over the stepover's own angle the feed
  // comes down by sin(target) / sin(angle), and past 90° (the tool wrapped in the cut) by a further 90 / angle.
  function slowDown(moves, K, ang, opts) {
    const target = Math.acos(Math.max(-1, Math.min(1, 1 - Math.min(K.ae, K.R) / K.R))) * 180 / Math.PI;
    const floor = (opts && opts.floor) || 0.3, rad = Math.PI / 180;
    let sec = '', n = 0, worst = 0, lowest = 1;
    moves.forEach((m, i) => {
      if (m.t === 'SEC') { sec = m.name; return; }
      if (sec !== 'ROUGH' || !(m.t === 'G1' || m.t === 'G2' || m.t === 'G3') || !m.f) return;
      const a = ang[i]; if (!(a > target * 1.25 + 5)) return;
      const f = Math.max(floor, Math.sin(Math.max(target, 1) * rad) / Math.sin(Math.min(a, 90) * rad) * (a > 90 ? 90 / a : 1));
      if (f > 0.95) return;
      m.f = Math.round(m.f * f * 10) / 10; m.slowed = Math.round(a); n++; worst = Math.max(worst, a); lowest = Math.min(lowest, f);
    });
    return { n, worst, lowest, target };
  }
  const api = { angles, slowDown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ENGAGE = api;
})(this);
