// Engagement check for HEM toolpaths: a material-removal simulation at full depth. A grid of material cells; the
// tool disk sweeps the moves in order, and before each step the share of the cutter edge touching material gives
// the engagement angle. Reports a histogram of angles over the travel and the worst spots.
const M = require('path').join(__dirname, '..');
const HEM = require(M + '/lib/hem.js'), Geo = require(M + '/lib/hem-geo.js');
function simulate(r, opts) {
  const K = r.K, R = K.R, res = opts.res || 0.01, z = -K.depth;
  const box = r.stats.box, x0 = box[0] - R - 0.1, y0 = box[1] - R - 0.1, nx = Math.ceil((box[2] - box[0] + 2 * R + 0.2) / res), ny = Math.ceil((box[3] - box[1] + 2 * R + 0.2) / res);
  const mat = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (opts.material([x0 + (i + 0.5) * res, y0 + (j + 0.5) * res])) mat[j * nx + i] = 1;
  const rr = Math.ceil(R / res), disk = [];
  for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) if ((di * res) ** 2 + (dj * res) ** 2 <= R * R) disk.push([di, dj]);
  // cells on the cutter's edge: the share of them in material is the engagement angle
  const ring = []; for (let dj = -rr - 1; dj <= rr + 1; dj++) for (let di = -rr - 1; di <= rr + 1; di++) { const d = Math.hypot(di * res, dj * res); if (d <= R + 0.5 * res && d > R - 1.5 * res) ring.push([di, dj]); }
  const angle = (x, y) => { const ci = Math.floor((x - x0) / res), cj = Math.floor((y - y0) / res); let n = 0; for (const [di, dj] of ring) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < nx && j < ny && mat[j * nx + i]) n++; } return 360 * n / ring.length; };
  const cut = (x, y) => { const ci = Math.floor((x - x0) / res), cj = Math.floor((y - y0) / res); let n = 0; for (const [di, dj] of disk) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue; const k = j * nx + i; if (mat[k]) { mat[k] = 0; n++; } } return n * res * res; };
  // walk the moves at full depth (single level programs), step 0.005
  let p = null, sec = '', out = { total: 0, len: 0, hist: {}, worst: [], plunges: 0, lifts: 0, helixTurns: 0 };
  const step = 0.005, ae = K.ae;
  for (const m of r.moves) {
    if (m.t === 'SEC') { sec = m.name; continue; }
    if (m.x === undefined || isNaN(m.x)) { continue; }
    if (p && !isNaN(p.x)) {
      if (m.t === 'G0' && m.z > p.z + 1e-9) out.lifts++;
      if (m.t === 'G1' && m.z < p.z - 1e-9 && Math.abs(m.x - p.x) < 1e-9 && Math.abs(m.y - p.y) < 1e-9 && m.z <= z + 1e-6) out.plunges++;
      const atDepth = Math.abs(m.z - z) < 1e-6 && Math.abs(p.z - z) < 1e-6;
      if (m.t !== 'G0' && (atDepth || m.k === 'entry')) {
        let pts = [];
        if (m.t === 'G1') { const L = Math.hypot(m.x - p.x, m.y - p.y), n = Math.max(1, Math.ceil(L / step)); for (let i = 1; i <= n; i++) pts.push([p.x + (m.x - p.x) * i / n, p.y + (m.y - p.y) * i / n]); }
        else { const rad = Math.hypot(p.x - m.cx, p.y - m.cy), a0 = Math.atan2(p.y - m.cy, p.x - m.cx), sw = HEM.arcSweep(m, p) * (m.t === 'G3' ? 1 : -1), n = Math.max(1, Math.ceil(Math.abs(sw) * rad / step)); for (let i = 1; i <= n; i++) { const a = a0 + sw * i / n; pts.push([m.cx + rad * Math.cos(a), m.cy + rad * Math.sin(a)]); } if (m.k === 'entry' && !atDepth) out.helixTurns += Math.abs(sw) / (2 * Math.PI); }
        let prev = [p.x, p.y];
        if (!atDepth) { prev = null; }
        for (const q of pts) {
          const th = atDepth && prev ? angle(q[0], q[1]) : 0;
          cut(q[0], q[1]);
          if (atDepth && prev) {
            const d = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
            out.len += d;
            const b = th < 5 ? 'air' : th <= 45 ? '5-45' : th <= 70 ? '45-70' : th <= 100 ? '70-100' : th <= 150 ? '100-150' : '>150';
            out.hist[b] = (out.hist[b] || 0) + d;
            if (th > 70) out.worst.push({ w: th, at: q, k: m.k, sec, mi: r.moves.indexOf(m) });
          }
          prev = q;
        }
      }
    }
    p = m;
  }
  out.worst.sort((a, b) => b.w - a.w);
  // cluster the worst by place
  const spots = [];
  for (const w of out.worst) { if (!spots.some(s => Math.hypot(s.at[0] - w.at[0], s.at[1] - w.at[1]) < 0.3)) spots.push(w); if (spots.length >= 8) break; }
  out.spots = spots;
  let left = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (mat[j * nx + i] && opts.mustCut && opts.mustCut([x0 + (i + 0.5) * res, y0 + (j + 0.5) * res])) left++;
  out.leftArea = left * res * res;
  return out;
}
function report(label, r, opts) {
  const s = simulate(r, opts), K = r.K;
  const pct = k => ((s.hist[k] || 0) / s.len * 100).toFixed(1) + '%';
  console.log('\n== ' + label + ' ==  (tool Ø' + K.D + ', ae ' + K.ae + ', ' + r.stats.minutes.toFixed(1) + ' min, ' + r.moves.length + ' moves)');
  console.log('  down to depth ' + s.plunges + ' · lifts ' + s.lifts + ' · helix turns ' + s.helixTurns.toFixed(1) + ' · warnings ' + r.warn.length + (r.warn.length ? ': ' + r.warn.join(' | ') : ''));
  const target = Math.acos(1 - K.ae / K.R) * 180 / Math.PI;
  console.log('  travel at depth ' + s.len.toFixed(1) + ' in, engagement angle (target ' + target.toFixed(0) + '°): air ' + pct('air') + ' · 5-45° ' + pct('5-45') + ' · 45-70° ' + pct('45-70') + ' · 70-100° ' + pct('70-100') + ' · 100-150° ' + pct('100-150') + ' · >150° ' + pct('>150'));
  console.log('  worst spots: ' + s.spots.map(w => w.w.toFixed(0) + '° ' + w.k + '/' + w.sec + ' @' + w.at.map(v => v.toFixed(2)).join(',')).join('  ·  '));
  console.log('  material left in the wall zone: ' + s.leftArea.toFixed(4) + ' in²   info: ' + r.geo.info.join(' | '));
  return s;
}
module.exports = { simulate, report };
