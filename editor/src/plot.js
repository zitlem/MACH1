// Programmed geometry for the plot: manual-program moves, shape lines, pattern shapes and hole positions,
// in program coordinates. Each item keeps the record index it came from so the plot can select it.
// This draws what the program describes (tool centre for MANL PRG, part edge for shapes), not a
// simulated cutter path.
// Milling items also carry their heights for the side and 3D views: MANL PRG moves their Z (zs, per point),
// shapes the Z range of their unit (z: [bottom, top], from DEPTH and SRV-Z), holes the Z of the hole top and
// the unit's hole depth.
(function (root) {
  'use strict';
  const Maz = root.Maz || (typeof require !== 'undefined' ? require('./core.js') : null);

  const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  const u32 = (b, o) => i32(b, o) >>> 0;
  const ARC_STEP = Math.PI / 36;

  // a->b arc around c; cw = clockwise. Returns polyline including both ends.
  function arcPts(a, b, c, cw) {
    const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
    let a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    let sw = cw ? a0 - a1 : a1 - a0;
    while (sw <= 1e-9) sw += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(sw / ARC_STEP)), out = [];
    for (let k = 0; k <= n; k++) {
      const t = a0 + (cw ? -1 : 1) * sw * k / n;
      out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
    }
    out[out.length - 1] = b.slice();
    return out;
  }
  // center of an arc a->b with radius r (r > 0: minor arc)
  function centerR(a, b, r, cw) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (!L) return null;
    const h = Math.sqrt(Math.max(r * r - L * L / 4, 0)), s = (cw ? -1 : 1) * (r > 0 ? 1 : -1);
    return [mx + s * h * -dy / L, my + s * h * dx / L];
  }

  // view: 'turn' draws the turning shapes (Z-X), 'mill' the milling geometry (X-Y); a lathe always turns.
  function geometry(p, units, ls, view) {
    ls = ls || Maz.lines(p);
    if (Maz.CONTROLS[p.ctl].type === 'lathe' || view === 'turn') return latheGeometry(p, units, ls);
    const S = units === 'metric' ? 1e-4 : 1e-5;
    const L = (r, o) => i32(r, o) * S;
    const out = [], units_ = Maz.structure(p, ls);
    // OFFSET units shift (and turn) the units after them; a WPC unit starts again from zero
    let off = null;
    const shift = (it, from) => {
      if (!off) return;
      const c = Math.cos(off.rot), s = Math.sin(off.rot);
      for (let k = from; k < out.length; k++) {
        const x = out[k];
        x.pts = x.pts.map(([a, b]) => [a * c - b * s + off.x, a * s + b * c + off.y]);
        if (x.zs) x.zs = x.zs.map(z => z + off.z);
        if (x.z) x.z = x.z.map(z => z + off.z);
      }
    };
    for (let ui = 0; ui < units_.length; ui++) {
      const first = out.length;
      const u = units_[ui], ucode = ls[u.i].sel.code, uz = unitZ(ucode, p.recs[u.i], L);
      if (ucode === 4) break;                            // nothing after the END unit is run
      if (ucode === 3) { const r0 = p.recs[u.i]; off = { x: L(r0, 36), y: L(r0, 40), rot: i32(r0, 44) * 1e-4 * Math.PI / 180, z: L(r0, 48) }; continue; }
      if (ucode === 2) off = null;
      let pos = { X: null, Y: null, Z: null }, g = 0, figStart = null, figPrev = null;
      const zRange = uz && uz.bottom !== undefined ? [uz.bottom, uz.top] : [0, 0];
      for (const i of u.seqs) {
        const fr = faceRec(p.recs[i], ls[i], units), r = fr || p.recs[i], c = fr ? fr[0] : ls[i].sel.code, m = u32(r, 4);
        if (c === 0xa1) {                                   // manual program move
          if (m & 1) { const v = r[20] | (r[21] << 8); if (v <= 3) g = v; }
          const words = {};
          for (let k = 0; k < 6; k++) {
            const a = r[8 + k];
            if (a >= 10 && a <= 35) words[String.fromCharCode(a + 55)] = L(r, 36 + 4 * k);
          }
          const next = { X: 'X' in words ? words.X : pos.X, Y: 'Y' in words ? words.Y : pos.Y, Z: 'Z' in words ? words.Z : pos.Z };
          if (pos.X !== null && pos.Y !== null && next.X !== null && next.Y !== null && (next.X !== pos.X || next.Y !== pos.Y)) {
            const a = [pos.X, pos.Y], b = [next.X, next.Y];
            let pts = [a, b];
            if (g === 2 || g === 3) {
              const cc = 'I' in words || 'J' in words ? [a[0] + (words.I || 0), a[1] + (words.J || 0)]
                : 'R' in words ? centerR(a, b, words.R, g === 2) : null;
              if (cc) pts = arcPts(a, b, cc, g === 2);
            }
            const za = pos.Z === null ? 0 : pos.Z, zb = next.Z === null ? za : next.Z;
            out.push({ rec: i, unit: ui, kind: g === 0 ? 'rapid' : 'feed', pts, zs: pts.map((q, k) => za + (zb - za) * k / Math.max(1, pts.length - 1)) });
          }
          else if (pos.X !== null && pos.Y !== null && pos.Z !== null && next.Z !== null && next.Z !== pos.Z) {
            out.push({ rec: i, unit: ui, kind: g === 0 ? 'rapid' : 'feed', pts: [[pos.X, pos.Y], [pos.X, pos.Y]], zs: [pos.Z, next.Z], zOnly: true });
          }
          pos = next;
        } else if (c === 0xc2) {                           // shape line: 0x20 LINE / 0x21 CW / 0x22 CCW to (X,Y)
          if (!(m & 6) || r[8] > 0x22) continue;
          const pat = r[8] - 0x20, b = [(m & 2) || !figPrev ? L(r, 40) : figPrev[0], (m & 4) || !figPrev ? L(r, 44) : figPrev[1]];
          if (figPrev && r[12] !== 1) {
            let pts = [figPrev, b];
            if ((pat === 1 || pat === 2) && (m & (8 | 16 | 32))) {
              const cw = pat === 1;
              const cc = m & (16 | 32) ? [L(r, 52), L(r, 56)] : centerR(figPrev, b, L(r, 48), cw);
              if (cc) pts = arcPts(figPrev, b, cc, cw);
            }
            out.push({ rec: i, unit: ui, kind: 'shape', pts, z: zRange });
          } else {
            if (figStart && figPrev && closeFig(figStart, figPrev, ucode)) out.push({ rec: i, unit: ui, kind: 'close', pts: [figPrev, figStart], z: zRange });
            figStart = b;
          }
          figPrev = b;
        } else if (c === 0xc1) {                           // pattern shapes: 0x10 square by two corners / 0x11 circle
          const pat = r[8], x1 = L(r, 36), y1 = L(r, 40), x3 = L(r, 44), y3 = L(r, 48);
          if (pat === 0x11) out.push({ rec: i, unit: ui, kind: 'shape', pts: arcPts([x1 + x3, y1], [x1 + x3, y1], [x1, y1], false), z: zRange });
          else out.push({ rec: i, unit: ui, kind: 'shape', pts: [[x1, y1], [x3, y1], [x3, y3], [x1, y3], [x1, y1]], z: zRange });
        } else if (c === 0xc0) {                           // hole patterns: Z of the hole top, then the unit's depth
          const zt = L(r, 36), dep = uz && uz.hole !== undefined ? uz.hole : 0;
          for (const h of holes(r, L)) out.push({ rec: i, unit: ui, kind: 'hole', pts: [h], z: [zt - dep, zt] });
        }
      }
      if (figStart && figPrev && closeFig(figStart, figPrev, ucode)) {
        out.push({ rec: u.seqs[u.seqs.length - 1], unit: ui, kind: 'close', pts: [figPrev, figStart], z: zRange });
      }
      shift(null, first);
    }
    return out;
  }

  // Lathe: turning shapes in the Z-X plane, drawn as Z across and the radius (X/2) up: the finished shape of bar,
  // copy and corner units, the finished face of facing units, the thread, groove and centre-drilled hole.
  function latheGeometry(p, units, ls) {
    const S = units === 'metric' ? 1e-4 : 1e-5, L = (r, o) => i32(r, o) * S;
    const out = [], units_ = Maz.structure(p, ls);
    for (let ui = 0; ui < units_.length; ui++) {
      const u = units_[ui], r0 = p.recs[u.i], code = ls[u.i].sel.code;
      if (code === 4) break;
      const shapes = u.seqs.filter(i => ls[i].lay && ls[i].sel.code >= 0xa8 && ls[i].sel.code <= 0xad);
      if (!shapes.length) continue;
      const ent = (r, bit) => (u32(r, 4) & bit) !== 0;
      if (code >= 0x30 && code <= 0x32) {
        const prof = turnProfile(p, shapes, L, r0);
        for (let k = 1; k < prof.pts.length; k++) {
          const a = prof.pts[k - 1], b = prof.pts[k], rec = prof.recs[k - 1], last = out[out.length - 1];
          if (last && last.rec === rec && last.unit === ui) last.pts.push([b[1], b[0]]);
          else out.push({ rec, unit: ui, kind: 'shape', pts: [[a[1], a[0]], [b[1], b[0]]] });
        }
        continue;
      }
      for (const i of shapes) {
        const r = p.recs[i], sx = L(r, 36) / 2, sz = L(r, 40), fx = L(r, 44) / 2, fz = L(r, 48);
        if (code === 0x33) out.push({ rec: i, unit: ui, kind: 'shape', pts: [[fz, sx], [fz, ent(r, 0x100) ? fx : 0]] });
        else if (code === 0x34) out.push({ rec: i, unit: ui, kind: 'close', pts: [[sz, sx], [fz, fx]] });
        else if (code === 0x35) out.push({ rec: i, unit: ui, kind: 'shape', pts: [[sz, sx], [sz, fx], [ent(r, 0x200) ? fz : sz, fx], [ent(r, 0x200) ? fz : sz, sx]] });
        else if (code === 0x36 || code === 0x37) out.push({ rec: i, unit: ui, kind: 'shape', pts: [[sz, 0], [fz, 0]] });
      }
    }
    return out;
  }
  // The finished shape of a BAR / CPY / CORNER unit as [x radius, z] points with the record of each segment.
  // LIN lines go along one axis: to the end point's X at the current Z, then along Z (a face, then a diameter);
  // a first line without a start point begins at the unit's CPT-Z; TPR runs straight from its start (or the last
  // end) to its end; arcs by their radius.
  function turnProfile(p, shapes, L, r0) {
    const pts = [], recs = [], x2r = v => v / 2, cptZ = L(r0, 40);
    let prev = null;
    for (const si of shapes) {
      const s = p.recs[si], m = u32(s, 4), pat = s[8] & 0x0f;
      const has = bit => (m & bit) !== 0;
      const sx = has(0x40) && pat !== 1 ? x2r(L(s, 36)) : null, sz = has(0x80) && pat !== 1 ? L(s, 40) : null;
      const fx = has(0x100) ? x2r(L(s, 44)) : null, fz = has(0x200) ? L(s, 48) : null;
      const a = [sx !== null ? sx : prev ? prev[0] : fx, sz !== null ? sz : prev ? prev[1] : cptZ];
      if (a[0] === null || a[1] === null) continue;
      const b = [fx !== null ? fx : a[0], fz !== null ? fz : a[1]];
      if (!prev) pts.push(a);
      else if (Math.abs(prev[0] - a[0]) > 1e-9 || Math.abs(prev[1] - a[1]) > 1e-9) { pts.push(a); recs.push(si); }
      let seg = [a, b];
      const rad = L(s, 60);
      if ((pat === 3 || pat === 4) && rad > 0) {
        const A = [a[1], a[0]], B = [b[1], b[0]], cc = centerR(A, B, rad, pat === 3);
        if (cc) seg = arcPts(A, B, cc, pat === 3).map(q => [q[1], q[0]]);
      } else if (pat === 1 && a[0] !== b[0] && a[1] !== b[1]) seg = [a, [b[0], a[1]], b];
      for (let k = 1; k < seg.length; k++) { pts.push(seg[k]); recs.push(si); }
      prev = b;
    }
    return { pts, recs };
  }

  // A milling unit's heights (the same bytes on every control): line and face units have DEPTH (36, down from
  // program zero) and SRV-Z (40, the stock above it); chamfer units a DEPTH; point units the hole depth
  // (DEPTH 40, or TAP-DEPTH 48 for tapping).
  function unitZ(code, r, L) {
    if ((code >= 0x40 && code <= 0x44) || (code >= 0x60 && code <= 0x66)) { const d = L(r, 36); return { bottom: -d, top: -d + Math.max(0, L(r, 40)) }; }
    if (code >= 0x50 && code <= 0x53) { const d = L(r, 36); return { bottom: -d, top: -d }; }
    if (code >= 0x20 && code <= 0x2b) return { hole: Math.max(0, code === 0x24 || code === 0x27 ? L(r, 48) : L(r, 40)) };
    return null;
  }
  // Orthographic view: turn the part by yaw about Z, then tilt it by pitch (90 degrees looks straight down).
  // Returns (x, y, z) -> [across, up] on the screen.
  function projector(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return (x, y, z) => { const x1 = x * cy - y * sy, y1 = x * sy + y * cy; return [x1, z * cp + y1 * sp]; };
  }
  const VIEWS = { top: [0, 90], front: [0, 0], right: [-90, 0], iso: [-45, 35.264], bottom: [0, -90], back: [180, 0], left: [90, 0] };

  // closed shapes (line out/in, face units) end back at their start point
  const closeFig = (a, b, ucode) => (ucode === 0x43 || ucode === 0x44 || (ucode >= 0x52 && ucode <= 0x53) || (ucode >= 0x60 && ucode <= 0x65)) &&
    (a[0] !== b[0] || a[1] !== b[1]);

  // Point patterns (byte 8): 1 PT, 2 LINE, 3 SQR, 4 GRD, 5 CIR, 6 ARC, 7 CHORD (programming manual 7-6-8).
  // X,Y start/centre, AN1/AN2 angles, T1/T2 pitches or radius; M (byte 20) holes, N (byte 22) holes on the second
  // line; F (byte 9) 1: T1/T2 (ARC: AN2) are totals, not pitches; P (byte 15) SQR/GRD 1: no holes at the four
  // corners, CHORD 0 both ends / 1 right / 2 left; Q (byte 16) 1: the start point is only positioned, not machined.
  // holes(r, L) -> [[x, y]] the holes machined; holes(r, L, true) -> [[x, y, skip]] every position, in order.
  // Mill-turn C-axis FACE units (unit code + 0x100: DRILLING FACE, LINE IN FACE ...) keep their holes in 0x1c0 lines
  // (PTN, SPT-R/x and SPT-th/y at 40 / 44, SPT-Z at 36, NUM at 20, ANG at 56) and their squares and circles in 0x1c1
  // lines (P1 at 36 / 40, P3 or R at 44 / 48), as R and angle round the C axis or as x and y on the face, as the cell
  // shows (R / A or x / y). faceRec gives the same holes or shape as a mill record (0xc0 / 0xc1) in face X-Y, so the
  // mill drawing and paths take them; null for any other line. PT, CIR (NUM round the C axis from the start point,
  // ANG apart or evenly) and ARC (ANG apart) are drawn; the other patterns only at their start point.
  function faceRec(r, L1, units) {
    const code = r[0] | r[1] << 8;
    if ((code !== 0x1c0 && code !== 0x1c1) || !L1 || !L1.lay) return null;
    const S = units === 'metric' ? 1e-4 : 1e-5, L = o => i32(r, o) * S, deg = Math.PI / 180;
    const cellAt = off => L1.lay.cells.findIndex(c => c[0] === off);
    const polar = off => { const k = cellAt(off); return k < 0 || !/^x/i.test(Maz.cellText(L1, k, { units }).trim()); };
    const put = (b, o, v) => { const n = Math.round(v / S); b[o] = n & 0xff; b[o + 1] = n >> 8 & 0xff; b[o + 2] = n >> 16 & 0xff; b[o + 3] = n >> 24 & 0xff; };
    const putA = (b, o, a) => { const n = Math.round(a / deg * 1e4); b[o] = n & 0xff; b[o + 1] = n >> 8 & 0xff; b[o + 2] = n >> 16 & 0xff; b[o + 3] = n >> 24 & 0xff; };
    const out = new Uint8Array(r.length);
    // a point as R and angle (polar) or x and y
    const pt = (o1, o2, pol) => pol ? [L(o1), i32(r, o2) * 1e-4 * deg] : [Math.hypot(L(o1), L(o2)), Math.atan2(L(o2), L(o1))];
    if (code === 0x1c0) {
      const pat = r[8], [R, th] = pt(40, 44, polar(40)), n = Math.max(1, Math.min(r[20] || 1, 999)), ang = i32(r, 56) * 1e-4 * deg;
      out[0] = 0xc0; out[20] = n;
      put(out, 36, L(36));
      if (pat === 5 || pat === 6) {                     // round the C axis: centre 0, radius R, from the start angle
        out[8] = pat; put(out, 56, R); putA(out, 48, th);
        if (pat === 6) putA(out, 52, ang);
        else if (ang) { out[8] = 6; putA(out, 52, ang); }
      } else { out[8] = 1; put(out, 40, R * Math.cos(th)); put(out, 44, R * Math.sin(th)); }
      return out;
    }
    const pat = r[8], pol = polar(36);
    out[0] = 0xc1; out[8] = pat;
    const [r1, a1] = pt(36, 40, pol);
    put(out, 36, r1 * Math.cos(a1)); put(out, 40, r1 * Math.sin(a1));
    if (pat === 0x11) put(out, 44, L(44));               // circle: centre, then its radius
    else { const [r3, a3] = pt(44, 48, polar(44)); put(out, 44, r3 * Math.cos(a3)); put(out, 48, r3 * Math.sin(a3)); }
    return out;
  }

  function holes(r, L, all) {
    const pat = r[8], x = L(r, 40), y = L(r, 44), deg = Math.PI / 180;
    const an1 = i32(r, 48) * 1e-4 * deg, an2v = i32(r, 52) * 1e-4 * deg;
    const t1 = L(r, 56), t2 = L(r, 60), cnt = v => Math.max(1, Math.min(v || 1, 999)), n = cnt(r[20]), mm = cnt(r[22]);
    const total = r[9] === 1, P = r[15], skipStart = r[16] === 1 && pat !== 5, out = [];
    const pitch = (t, k) => (total ? (k > 1 ? t / (k - 1) : 0) : t);
    const add = (px, py, skip) => out.push([px, py, !!skip]);
    switch (pat) {
      case 2: { const d = pitch(t1, n); for (let k = 0; k < n; k++) add(x + k * d * Math.cos(an1), y + k * d * Math.sin(an1)); break; }
      case 3: case 4: {                                    // SQR: the holes round the edge; GRD: all of them
        const an2 = an2v || Math.PI / 2, d1 = pitch(t1, n), d2 = pitch(t2, mm);
        for (let b = 0; b < mm; b++) for (let a = 0; a < n; a++) {
          const edge = a === 0 || b === 0 || a === n - 1 || b === mm - 1, corner = (a === 0 || a === n - 1) && (b === 0 || b === mm - 1);
          if (pat === 3 && !edge) continue;
          add(x + a * d1 * Math.cos(an1) + b * d2 * Math.cos(an1 + an2), y + a * d1 * Math.sin(an1) + b * d2 * Math.sin(an1 + an2), corner && P === 1);
        }
        break;
      }
      case 5: for (let k = 0; k < n; k++) { const t = an1 + 2 * Math.PI * k / n; add(x + t1 * Math.cos(t), y + t1 * Math.sin(t)); } break;
      case 6: { const d = total ? (n > 1 ? an2v / (n - 1) : 0) : an2v; for (let k = 0; k < n; k++) { const t = an1 + k * d; add(x + t1 * Math.cos(t), y + t1 * Math.sin(t)); } break; }
      case 7: {                                            // the two ends of a chord square to AN1 (half length T2 on one side)
        const half = P === 1 || P === 2 ? t2 : t2 / 2, da = t1 > 0 ? Math.asin(Math.min(1, Math.abs(half / t1))) : 0;
        add(x + t1 * Math.cos(an1 + da), y + t1 * Math.sin(an1 + da), P === 2);       // right (CCW side)
        add(x + t1 * Math.cos(an1 - da), y + t1 * Math.sin(an1 - da), P === 1);       // left
        break;
      }
      default: add(x, y);
    }
    if (skipStart && out.length && pat !== 7) out[0][2] = true;
    return all ? out : out.filter(h => !h[2]).map(h => [h[0], h[1]]);
  }

  const api = { geometry, holes, faceRec, arcPts, centerR, projector, VIEWS, unitZ, turnProfile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Plot = api;
})(this);
