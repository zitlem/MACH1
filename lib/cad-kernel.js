// The CAD app's solids: the feature history (lib/cad-model.js keeps it as doc.feats) replayed on replicad and its
// OpenCascade kernel. It runs in a Web Worker in the page and in Node for the tests. Inches throughout. STEP files are
// written in millimetres and read back to inches, so the part keeps its size in any other CAD.
//
// A feature is plain data, in world coordinates:
//   {id, type: 'extrude', loops, dir: [x,y,z], dist, both, op, target}    loops: closed curves (below); the first
//                                                                           outer, any inside it holes
//   {id, type: 'revolve', loops, axis: {p, d}, angle, op, target}
//   {id, type: 'box', c1, c2, op, target} · {id, type: 'cyl', p, d, r, h, op, target}
//   {id, type: 'hole', pts, dir, dia, depth, through, target}             drilled along dir from each point
//   {id, type: 'fillet' | 'chamfer', target, r, picks: [[x,y,z]...]}       an edge is matched by a point on it
//   {id, type: 'bool', op, target, tool}                                   tool is used up
//   {id, type: 'step', blob, name}                                         an imported solid (STEP in millimetres), read
//                                                                           first with readSTEP(text, blob); or {text}
//   {id, type: 'xform', target, m: [a11 a12 a13 a14 a21 … a34], copy}      moved, turned, mirrored or scaled by the matrix
//                                                                           (rows); copy: a new solid, named 'S' + id
//   {id, type: 'shell', target, t, picks}                                  hollowed to wall t (t > 0 inward, < 0 outward),
//                                                                           the faces at the picks taken away
//   {id, type: 'draft', target, angle, picks, plane: {o, n}}               the faces at the picks tilted by angle (°)
//                                                                           about where they meet the plane
//   {id, type: 'sweep', loops, path, corner: 'right' | 'round', frenet, op, target}   the profile along the path
//   {id, type: 'loft', sections: [[curves]...], ruled, op, target}         through closed sections, in order
//   op: 'new' (a new solid, named 'S' + id), 'add', 'cut' or 'common' with the solid named by target (default:
//   the last solid made). suppressed: true leaves a feature out.
// A curve: {t: 'line', a, b} · {t: 'arc', a, m, b} (through m) · {t: 'circle', c, r, n} (normal n).
//
//   const K = CADKernel.create(replicad);           // replicad with setOC done
//   const r = K.build(feats);                       // {solids: [{key, shape, volume, area}], status: [{id, ok, err}]}
//   K.mesh(shape); K.stepOf(shapes)
(function (root) {
  'use strict';
  function create(R) {
    const V = p => [p[0], p[1], p[2]];
    // a curve as an OpenCascade edge
    const edgeOf = c => {
      if (c.t === 'line') return R.makeLine(V(c.a), V(c.b));
      if (c.t === 'arc') return R.makeThreePointArc(V(c.a), V(c.m), V(c.b));
      if (c.t === 'circle') return R.makeCircle(c.r, V(c.c), V(c.n));
      throw new Error('Unknown curve ' + c.t);
    };
    // closed loops as faces: the biggest is the outside, the others holes in it. The holes come back as faces of
    // their own, to be swept the same way and cut out (so the way round each loop runs does not matter)
    function faceOf(loops) {
      if (!loops || !loops.length) throw new Error('No closed chain to make a face from');
      const faces = loops.map(L => R.makeFace(R.assembleWire(L.map(edgeOf)))), areas = faces.map(f => R.measureArea(f));
      let outer = 0; areas.forEach((a, i) => { if (a > areas[outer]) outer = i; });
      return { outer: faces[outer], holes: faces.filter((_, i) => i !== outer) };
    }
    const sweep = (F, make) => { let s = make(F.outer); for (const h of F.holes) s = s.cut(make(h)); return s; };
    const vec = (d, k) => new R.Vector([d[0] * k, d[1] * k, d[2] * k]);
    // a tool solid from a feature (before it is joined to anything)
    function toolOf(f) {
      if (f.type === 'extrude') {
        const face = faceOf(f.loops), L = Math.hypot(f.dir[0], f.dir[1], f.dir[2]) || 1, d = f.dir.map(v => v / L), dist = +f.dist;
        if (!(dist > 0)) throw new Error('Give a distance');
        return sweep(face, fc => R.basicFaceExtrusion(f.both ? fc.clone().translate(d.map(v => -v * dist / 2)) : fc, vec(d, dist)));
      }
      if (f.type === 'revolve') {
        const face = faceOf(f.loops), ang = +f.angle || 360;
        return sweep(face, fc => R.revolution(fc, V(f.axis.p), V(f.axis.d), ang));
      }
      if (f.type === 'sweep') {
        // the profile's loops as wires, the biggest the outside; each swept along the path, the others cut out
        const wires = (f.loops || []).map(L => R.assembleWire(L.map(edgeOf))), areas = wires.map(w => R.measureArea(R.makeFace(w)));
        if (!wires.length) throw new Error('No profile to sweep');
        let outer = 0; areas.forEach((a, i) => { if (a > areas[outer]) outer = i; });
        const spine = () => R.assembleWire((f.path || []).map(edgeOf)), one = w => R.genericSweep(w, spine(), { transitionMode: f.corner === 'round' ? 'round' : 'right', frenet: !!f.frenet }, false);
        if (!(f.path || []).length) throw new Error('No path to sweep along');
        let s = one(wires[outer]); wires.forEach((w, i) => { if (i !== outer) s = s.cut(one(w)); });
        return s;
      }
      if (f.type === 'loft') {
        const secs = (f.sections || []).map(L => R.assembleWire(L.map(edgeOf))); if (secs.length < 2) throw new Error('A loft needs two sections at least');
        return R.loft(secs, { ruled: !!f.ruled }, false);
      }
      if (f.type === 'box') return R.makeBox(V(f.c1), V(f.c2));
      if (f.type === 'cyl') return R.makeCylinder(+f.r, +f.h, V(f.p), V(f.d));
      if (f.type === 'hole') {
        const L = Math.hypot(...f.dir) || 1, d = f.dir.map(v => v / L), dep = f.through ? 1e3 : +f.depth;
        if (!(+f.dia > 0) || !(dep > 0)) throw new Error('Give the hole a diameter and a depth');
        let t = null;
        for (const p of f.pts) { const c = R.makeCylinder(+f.dia / 2, dep + (f.through ? 1e3 : 0), [p[0] - d[0] * (f.through ? 1e3 : 0), p[1] - d[1] * (f.through ? 1e3 : 0), p[2] - d[2] * (f.through ? 1e3 : 0)], V(d)); t = t ? t.fuse(c) : c; }
        return t;
      }
      throw new Error('Unknown feature ' + f.type);
    }
    // the edges of a shape that a feature's picks name: the nearest edge to each pick, within tol
    function edgesAt(shape, picks, tol) {
      const edges = shape.edges, found = [];
      for (const p of picks) {
        const v = R.makeVertex(V(p)); let best = null, bd = Infinity;
        for (const e of edges) { const d = R.measureDistanceBetween(e, v); if (d < bd) { bd = d; best = e; } }
        if (!best || bd > tol) throw new Error('An edge picked for this ' + 'feature is not there any more');
        if (!found.some(e => e.isSame(best))) found.push(best);
      }
      return found;
    }
    // the faces of a shape that picks name: the nearest face to each pick, within tol
    function facesAt(shape, picks, tol) {
      const faces = shape.faces, found = [];
      for (const p of picks) {
        const v = R.makeVertex(V(p)); let best = null, bd = Infinity;
        for (const fc of faces) { const d = R.measureDistanceBetween(fc, v); if (d < bd) { bd = d; best = fc; } }
        if (!best || bd > tol) throw new Error('A face picked for this feature is not there any more');
        if (!found.some(x => x.isSame(best))) found.push(best);
      }
      return found;
    }
    // replay the history
    function build(feats) {
      const solids = new Map(), status = [], order = [];
      let last = null;
      const put = (k, s) => { if (!solids.has(k)) order.push(k); solids.set(k, s); last = k; };
      for (const f of feats || []) {
        if (f.suppressed) { status.push({ id: f.id, ok: true, skipped: true }); continue; }
        try {
          const target = f.target && solids.has(f.target) ? f.target : last;
          if (f.type === 'fillet' || f.type === 'chamfer') {
            if (!target) throw new Error('No solid to ' + f.type);
            const s = solids.get(target), es = edgesAt(s, f.picks || [], 0.002), r = +f.r;
            if (!(r > 0)) throw new Error('Give a size');
            const want = e => es.some(x => x.isSame(e)) ? r : null;
            put(target, f.type === 'fillet' ? s.fillet(want) : s.chamfer(want));
          } else if (f.type === 'bool') {
            const a = solids.get(f.target), b = solids.get(f.tool);
            if (!a || !b || f.target === f.tool) throw new Error('Pick two solids');
            put(f.target, f.op === 'cut' ? a.cut(b) : f.op === 'common' ? a.intersect(b) : a.fuse(b));
            solids.delete(f.tool); order.splice(order.indexOf(f.tool), 1);
          } else if (f.type === 'xform') {
            const s = solids.get(f.target); if (!s) throw new Error('The solid to move is not there');
            const m = (f.m || []).map(Number); if (m.length !== 12 || !m.every(isFinite)) throw new Error('No move given');
            const tr = new R.Transformation(); tr.wrapped.SetValues(...m);
            const moved = R.cast(tr.transform(s.wrapped)); tr.delete && tr.delete();
            put(f.copy ? 'S' + f.id : f.target, moved);
          } else if (f.type === 'shell' || f.type === 'draft') {
            if (!target) throw new Error('No solid to ' + f.type);
            const s = solids.get(target), fs = facesAt(s, f.picks || [], 0.002 + 2 * meshTol(s));
            if (!fs.length) throw new Error('Pick the faces');
            if (f.type === 'shell') { const t = +f.t; if (!t) throw new Error('Give the wall'); put(target, s.shell(t, x => x.inList(fs))); }
            else { const a = +f.angle; if (!a) throw new Error('Give the angle'); const pl = f.plane || { o: [0, 0, 0], n: [0, 0, 1] }; put(target, s.draft(a, x => x.inList(fs), new R.Plane(V(pl.o), null, V(pl.n)))); }
          } else if (f.type === 'step') {
            put('S' + f.id, stepIn(f.blob || f.text));
          } else {
            const tool = toolOf(f), op = f.type === 'hole' ? 'cut' : f.op || 'new';
            if (op === 'new' || !target) { if (op === 'cut' || op === 'common') throw new Error('No solid to ' + op); put('S' + f.id, tool); }
            else { const s = solids.get(target); put(target, op === 'cut' ? s.cut(tool) : op === 'common' ? s.intersect(tool) : s.fuse(tool)); }
          }
          status.push({ id: f.id, ok: true });
        } catch (err) { status.push({ id: f.id, ok: false, err: String(err && err.message || err) }); }
      }
      return { solids: order.map(k => ({ key: k, shape: solids.get(k), volume: R.measureVolume(solids.get(k)), area: R.measureArea(solids.get(k)) })), status };
    }
    // Triangles and edges for the screen, within a tolerance that grows with the part (a ten-thousandth of its
    // diagonal, from 0.0005 to 0.02 in): a fixed fine one gives a big part millions of triangles.
    const meshTol = shape => { let d = 0; try { const b = shape.boundingBox.bounds; d = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]); } catch (e) { } return Math.min(0.02, Math.max(0.0005, d * 1e-4 || 0)); };
    function mesh(shape, tol) {
      tol = tol || meshTol(shape);
      const m = shape.mesh({ tolerance: tol, angularTolerance: 0.15 }), e = shape.meshEdges({ tolerance: tol, angularTolerance: 0.15 });
      return { v: new Float32Array(m.vertices), n: new Float32Array(m.normals), t: new Uint32Array(m.triangles), faces: m.faceGroups, lines: new Float32Array(e.lines), edges: e.edgeGroups };
    }
    // STEP in millimetres (the solids' own size), and back
    async function stepOf(shapes) {
      const s = shapes.length === 1 ? shapes[0] : R.makeCompound(shapes);
      return await s.clone().scale(25.4, [0, 0, 0]).blobSTEP().text();
    }
    // read STEP files by their key (the text itself when there is none)
    let stepCache = new Map();
    function stepIn(key) {
      if (stepCache.has(key)) return stepCache.get(key);
      throw new Error('This STEP file has not been read yet');
    }
    // STEP reading is asynchronous in replicad: read once, then features use the result
    async function readSTEP(text, key) {
      key = key || text;
      if (stepCache.has(key)) return stepCache.get(key);
      let raw; try { raw = await R.importSTEP(new Blob([text])); } catch (e) { raw = null; }
      // an assembly that points to its parts in other files comes in empty
      if (!raw || !raw.faces || !raw.faces.length) throw new Error(/DOCUMENT_FILE|EXTERNAL/.test(text) ? 'This STEP file holds no solids: it is an assembly whose parts are saved in other STEP files. Open the part files.' : 'This STEP file holds no solids or surfaces that could be read');
      const s = raw.scale(1 / 25.4, [0, 0, 0]);
      stepCache.set(key, s); return s;
    }
    const hasSTEP = key => stepCache.has(key);
    // ---- a solid's edges as curves, exact, in the world (inches), for wireframe: every edge (mode 'all'), the edges of
    // the face at a point (mode 'face', pick), or where a plane cuts the solid (mode 'section', plane {o, n, x}).
    //   {t: 'line', a, b} · {t: 'circle', c, n, r} · {t: 'arc', a, m, b, c, n, r} (through m)
    //   {t: 'nurbs', deg, cp, w | null, kn (each knot as often as it counts), t0, t1 (the edge's part of it)}
    //   {t: 'poly', pts} (any other kind of curve, as points along it, closely)
    // each with n: the normal of the plane it lies in (null for one in no plane). A planar face also gives its plane.
    function curvesOf(shape, opts) {
      const o = opts || {}, oc = R.getOC(), V3 = v => [v.x, v.y, v.z], T3 = p => p.toTuple ? p.toTuple() : V3(p);
      let edges, plane = null;
      if (o.mode === 'face') {
        const f = facesAt(shape, [o.pick], 0.002 + 2 * meshTol(shape))[0]; edges = f.edges;
        if (f.geomType === 'PLANE') { const n = f.normalAt(o.pick ? V(o.pick) : undefined); plane = { o: T3(f.center), n: V3(n) }; }
      } else if (o.mode === 'section') {
        // a square of the plane, bigger than the solid, kept where the solid is
        const P = o.plane, b = shape.boundingBox.bounds, size = 2 * Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) + 1;
        const y = [P.n[1] * P.x[2] - P.n[2] * P.x[1], P.n[2] * P.x[0] - P.n[0] * P.x[2], P.n[0] * P.x[1] - P.n[1] * P.x[0]], at = (u, v) => [0, 1, 2].map(k => P.o[k] + P.x[k] * u + y[k] * v);
        const cut = shape.intersect(R.makePolygon([at(-size, -size), at(size, -size), at(size, size), at(-size, size)]));
        edges = cut.edges; plane = { o: P.o.slice(), n: P.n.slice() };
      } else edges = shape.edges;
      // the plane a set of points lies in: its normal, or null
      const planeOfPts = pts => {
        if (pts.length < 3) return null; const p0 = pts[0]; let n = null, best = 0;
        for (let i = 1; i < pts.length; i++) for (let j = i + 1; j < pts.length; j += Math.max(1, Math.floor(pts.length / 8))) {
          const a = pts[i].map((v, k) => v - p0[k]), c = pts[j].map((v, k) => v - p0[k]), x = [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]], l = Math.hypot(...x);
          if (l > best) { best = l; n = x.map(v => v / l); }
        }
        if (!n || best < 1e-12) return null;
        const size = Math.max(...pts.map(p => Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2])));
        return pts.every(p => Math.abs(n[0] * (p[0] - p0[0]) + n[1] * (p[1] - p0[1]) + n[2] * (p[2] - p0[2])) < 1e-7 * Math.max(1, size)) ? n : null;
      };
      const out = [];
      for (const e of edges) {
        const ty = e.geomType, a = new oc.BRepAdaptor_Curve(e.wrapped);
        try {
          if (ty === 'LINE') { const p = T3(e.startPoint), q = T3(e.endPoint); if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 1e-9) out.push({ t: 'line', a: p, b: q }); }
          else if (ty === 'CIRCLE') {
            const c = a.Circle(), l = c.Location(), ax = c.Axis().Direction(), C = [l.X(), l.Y(), l.Z()], n = [ax.X(), ax.Y(), ax.Z()], r = c.Radius();
            if (Math.abs(a.LastParameter() - a.FirstParameter() - 2 * Math.PI) < 1e-9) out.push({ t: 'circle', c: C, n, r });
            else out.push({ t: 'arc', a: T3(e.startPoint), m: T3(e.pointAt(0.5)), b: T3(e.endPoint), c: C, n, r });
          } else if (ty === 'BSPLINE_CURVE' && !a.IsPeriodic()) {
            const c = a.BSpline(), np = c.NbPoles(), cp = [], w = [], kn = [];
            for (let i = 1; i <= np; i++) { const q = c.Pole(i); cp.push([q.X(), q.Y(), q.Z()]); w.push(c.Weight(i)); }
            for (let i = 1; i <= c.NbKnots(); i++) for (let k = 0; k < c.Multiplicity(i); k++) kn.push(c.Knot(i));
            out.push({ t: 'nurbs', deg: c.Degree(), cp, w: c.IsRational() ? w : null, kn, t0: a.FirstParameter(), t1: a.LastParameter(), n: planeOfPts(cp) });
          } else {
            // anything else (an ellipse, a Bézier, an offset curve…): points along it
            const pts = []; for (let i = 0; i <= 96; i++) pts.push(T3(e.pointAt(i / 96)));
            out.push({ t: 'poly', pts, n: planeOfPts(pts) });
          }
        } finally { a.delete(); }
      }
      // lines lie in the plane of their face (or section); circles and arcs in their own
      for (const c of out) if (c.t === 'line') c.n = plane ? plane.n : null; else if (plane && c.n === undefined) c.n = plane.n;
      return { curves: out, plane };
    }
    return { build, mesh, meshTol, stepOf, readSTEP, hasSTEP, faceOf, edgesAt, facesAt, curvesOf };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CADKernel = api;
})(this);
