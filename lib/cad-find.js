// The CAD page's search by what you want to do: plain words in, the commands that do it out. For each command it has
// what the command does, in a line, and the words people use for it: synonyms, shop terms and other programs' names.
// The page hands it what can be run (its ribbon, keys and status bar); this ranks them. Nothing is fetched.
//   CADFind.VOCAB[id] = [what, words, name]: words is a list of words and phrases, comma separated; a key's or the
//   status bar's entry (key:… and bar:…) has its name too, as a ribbon command has its button's
//   CADFind.RECIPES: jobs of more than one command, [{id: 'how:…', title, words, steps: [[text, command id or null]]}]
//   CADFind.index(items) → idx; CADFind.search(idx, query, n) → items, best first
//   item: {id, names: [..], place, key, what, words, kind}
(function (root) {
  'use strict';
  const VOCAB = {
    // ---- File
    new: ['Start a new, empty drawing', 'blank, fresh, clear, start over, empty drawing, new file'],
    open: ['Open a drawing: DXF, DWG, the EDM\'s own files, STEP, IGES, STL, OBJ, 3MF, SVG, PDF', 'load, read, open file, dxf, dwg, step, stp, iges, igs, stl, obj, 3mf, svg, pdf, edm file, mitsubishi'],
    import: ['Add a file to the drawing you have: DXF, DWG, STEP, meshes and more', 'merge, insert, bring in, add drawing, add file, another file, combine, into this one, into this drawing, dxf, dwg, step'],
    save: ['Save the drawing as a MACH1 CAD file', 'keep, store, save file, write, mach1cad'],
    saveas: ['Save the drawing under a new name', 'save copy, rename, new name, another name'],
    xdxf: ['Save the 2D drawing as a DXF file', 'export dxf, save dxf, save as dxf, dxf out, laser, waterjet, wire edm, plasma, router, send to machine, r12, autocad'],
    xsvg: ['Save the drawing as an SVG picture', 'export svg, save svg, vector, inkscape, illustrator, web picture'],
    xpdf: ['Save the drawing as a PDF to print', 'export pdf, save pdf, print, printout, paper, drawing sheet'],
    xstep: ['Save the solids as a STEP file', 'export step, save step, stp, 3d model, solid file, send model'],
    xstl: ['Save solids and bodies as an STL mesh, for 3D printing', 'export stl, save stl, 3d print, printer, slicer, mesh'],
    xobj: ['Save solids and bodies as an OBJ mesh', 'export obj, save obj, mesh'],
    x3mf: ['Save solids and bodies as a 3MF file, for 3D printing', 'export 3mf, save 3mf, 3d print, printer, slicer, mesh'],
    shortcuts: ['List the keyboard shortcuts', 'keys, hotkeys, keyboard, shortcut keys, help'],
    about: ['What this page is made with, and the licences', 'version, licence, credits, help'],
    // ---- Home
    undo: ['Take back the last change', 'back, oops, revert, go back, mistake'],
    redo: ['Put back what was undone', 'again, forward, restore'],
    delete: ['Delete what is selected', 'remove, erase, get rid of, rub out, wipe'],
    deldup: ['Remove entities drawn twice, one on top of another', 'duplicates, extra lines, double lines, doubles, overlapping, stacked, clean up, cleanup, tidy, repair dxf, fix dxf'],
    selall: ['Select everything shown', 'all, everything, whole drawing'],
    selby: ['Select by kind, colour, level, style or width', 'filter, only, mask, all circles, all lines, all arcs, by colour, by level, by type, pick by'],
    selinv: ['Select everything that is not selected now', 'invert, reverse selection, opposite, swap selection'],
    sellast: ['Select what the last command made', 'last, latest, newest, just made, previous result'],
    chainsel: ['Select a whole chain of joined entities', 'chain, connected, outline, contour, profile, joined, loop'],
    newplane: ['Make a drawing plane of your own: 3 points, from an entity, turned, or on a face', 'plane, work plane, workplane, construction plane, cplane, tilted, angled, ucs, on a face, side of part, coordinate system'],
    vplane: ['Look square at the active plane', 'plane view, look at plane, normal to plane, square to'],
    chlevel: ['Move or copy what is selected to another level', 'layer, move to layer, copy to layer, level change, put on level'],
    tolevel: ['Put what is selected on the active level', 'layer, active layer, to layer'],
    tocolor: ['Give what is selected the active colour', 'color, change color, recolor, paint'],
    tostyle: ['Give what is selected the active line style and width', 'line style, dashed, dash, hidden line, centre line, phantom, line type, linetype, line width, thickness, thick line, thicker, thinner'],
    tocons: ['Turn what is selected into construction geometry, or back', 'construction, reference, helper, guide line, layout line, not cut'],
    fromEnt: ['Take the level, colour, style, plane and Z from an entity you pick', 'match properties, same as, copy attributes, pick up, eyedropper, set from'],
    // ---- Wireframe: points, lines, arcs, shapes
    point: ['Place points', 'dot, mark, position, location, drill point'],
    bolt: ['Points or circles evenly round a circle', 'bolt circle, bolt pattern, hole pattern, pcd, pitch circle, flange'],
    ctrpts: ['A point at the centre of each selected arc or circle', 'centre point, center points, hole centres, drill points, arc centers'],
    ptsalong: ['Points along a curve, by count or spacing', 'divide, spacing, evenly spaced, along a line, along a curve, pitch'],
    line: ['Draw lines: by ends, or by length and angle', 'straight, segment, polyline, connect points'],
    lpar: ['A line parallel to another, at a distance or through a point', 'parallel, offset line, same angle'],
    lperp: ['A line square to another line or an arc', 'perpendicular, square, 90 degrees, normal, right angle'],
    ltan: ['A line tangent to an arc, from a point or to a second arc', 'tangent, touching, belt'],
    xline: ['An endless construction line: by angle, horizontal, vertical, 2 points, bisector or perpendicular', 'infinite, construction line, xline, ray, reference line, bisector, guide line'],
    circle: ['Draw circles: centre and diameter, 2 points or 3 points', 'hole, diameter, radius, ring'],
    arc: ['Draw arcs: 3 points, ends and radius, centre and angles, or tangent', 'radius, curve, partial circle, bend'],
    ellipse: ['Draw an ellipse, by its radii or by clicks', 'oval, elliptical'],
    closearc: ['Make an arc into a full circle', 'close, complete circle, full circle'],
    rect: ['Draw a rectangle: 2 corners or centre, with rounded corners if you want', 'rectangle, square, box, block, plate, corner radius'],
    obround: ['Draw a slot: a length and a width with round ends', 'slot, obround, keyway, racetrack, oblong'],
    polygon: ['Draw a polygon: sides, to the corners or to the flats', 'hexagon, hex, octagon, triangle, sides, nut'],
    spline: ['Draw a smooth curve through points', 'curve, smooth, freeform, nurbs, bezier'],
    bbox: ['A rectangle or 3D box round the selection, with stock added', 'bounding box, stock, blank, envelope, extents, size of part, raw material, billet'],
    // ---- Wireframe: modify
    fillet: ['Round the corner where two curves meet', 'round, radius, blend, round corner, rounded corner, corner radius, fillet corner'],
    chamfer: ['Bevel the corner where two lines meet', 'bevel, angle corner, cut corner, break corner, 45, champher'],
    cfillet: ['Round every corner of a chain at once', 'round all corners, radius all corners, round corners, fillet all, blend chain'],
    cchamfer: ['Bevel every corner of a chain at once', 'bevel all corners, chamfer all, break corners'],
    trim: ['Cut a curve off where it meets another', 'cut off, cut, clip, shorten, trim to, remove piece, divide'],
    extend: ['Make a line or arc longer or shorter by a length', 'longer, lengthen, shorten, extend line, modify length, stretch end'],
    break: ['Break a curve in two at a point', 'split, cut in two, divide at point'],
    breakx: ['Break curves where they cross each other', 'split at intersections, break at crossings, cut at intersections'],
    breakn: ['Break a curve into equal pieces, by count or length', 'split, pieces, segments, equal parts, divide into'],
    join: ['Join two lines in a row, or two arcs of one circle, into one', 'merge, combine, weld, connect, unite lines, make one'],
    offset: ['A copy of a curve at a distance', 'parallel copy, offset curve, copy at distance'],
    coffset: ['Offset a whole chain at a distance', 'toolpath, tool path, cutter comp, cutter compensation, grow, shrink, outline, contour, profile offset, wall, stock to leave'],
    stretch: ['Move the ends inside a window, stretching what crosses it', 'stretch, lengthen part, make wider, make taller, drag ends'],
    // ---- Solids
    sextrude: ['Make a solid by pulling a closed outline straight up; or cut one, or add to one', 'extrude, 3d, make 3d, part from drawing, solid from drawing, 2d to 3d, pull up, push, thickness, pad, boss, pocket, cut pocket, prism, make solid'],
    srevolve: ['Make a solid by spinning a profile round an axis', 'revolve, spin, turn, lathe, turned part, rotate around axis, shaft, axisymmetric'],
    ssweep: ['Make a solid by moving a profile along a path', 'sweep, along a path, pipe, tube, rail'],
    sloft: ['Make a solid that blends between closed outlines', 'loft, blend, transition, between shapes'],
    sbox: ['A solid box', 'block, cube, cuboid, rectangular solid, stock'],
    scyl: ['A solid cylinder', 'rod, round bar, bar stock, puck, disc, pin'],
    shole: ['Drill holes in a solid at circles: a diameter and depth, or through. A counterbore is a second, wider, shallower hole', 'hole, drill, bore, through hole, blind hole, counterbore, cbore, tap, tapped hole'],
    sfillet: ['Round the edges of a solid', 'round edge, radius edge, blend edge, round solid, edge fillet'],
    schamfer: ['Bevel the edges of a solid', 'bevel edge, break edge, deburr, edge chamfer'],
    sshell: ['Hollow out a solid to a wall thickness, with faces open', 'hollow, shell, wall thickness, cup, box with walls, thin wall'],
    sdraft: ['Taper faces of a solid by an angle', 'draft, taper, mould, mold, casting angle, tapered walls, angle walls'],
    sbool: ['Add solids together, take one from another, or keep what they share', 'boolean, union, subtract, combine, merge solids, cut one from another, intersect, common, difference'],
    sedges: ['Make lines and arcs from a solid\'s edges, flattened or in 3D: so a solid goes out as a DXF', 'solid to dxf, edges, wireframe from solid, outline of solid, 2d from 3d, flat drawing, curves from solid'],
    sfacecurves: ['Make lines and arcs from the edges of one face of a solid', 'face outline, face edges, curves from face'],
    ssection: ['Make lines and arcs where a plane cuts the solids', 'section, cross section, slice, cut through, profile at depth, contour at z'],
    // ---- Drafting
    dimlin: ['A horizontal, vertical or aligned dimension', 'dimension, dim, size, length, linear dimension'],
    dimrad: ['A radius dimension', 'radius dimension, dim, r dimension'],
    dimdia: ['A diameter dimension', 'diameter dimension, dim, hole size'],
    dimang: ['An angle dimension between two lines', 'angle dimension, angular, degrees, dim'],
    dimord: ['Ordinate dimensions from a datum', 'ordinate, datum, baseline, from zero, coordinate dimension'],
    note: ['Put text on the drawing', 'text, label, words, write, engrave, lettering, annotation'],
    leader: ['An arrow with a note', 'arrow, callout, pointer, balloon, label with arrow'],
    ctrmark: ['Centre lines or a mark on circles and arcs', 'centre mark, center line, crosshair, hole centre'],
    hatch: ['Fill a closed area with hatch lines', 'hatch, fill, cross hatch, shading, section lines'],
    explode: ['Turn notes, dimensions and hatches into plain lines, for engraving', 'explode, engrave text, text to lines, text to geometry, outline text, single line font'],
    // ---- Transform
    move: ['Move or copy what is selected', 'translate, move, shift, copy, slide, reposition, drag, move over, move by, nudge, copies, times, multiple copies'],
    rotate: ['Turn what is selected about a point', 'rotate, turn, spin, angle, orient, degrees, turn by, clock, around a point'],
    mirror: ['Flip what is selected about a line, or make a mirrored copy', 'flip, reflect, mirror image, symmetric, opposite hand'],
    scale: ['Make what is selected bigger or smaller', 'resize, enlarge, shrink, bigger, smaller, factor, mm to inch, inch to mm, metric'],
    toorigin: ['Move what is selected so that a point goes to 0,0', 'origin, zero, 0 0, home, datum, set zero, work zero'],
    flatten: ['Lay what is selected flat on the active plane, as seen square to it', 'flatten, project, flat, 2d, squash, z to 0'],
    arect: ['Copies in rows and columns', 'array, grid of copies, rows, columns, pattern, nest, step and repeat, copies, times, repeat'],
    apolar: ['Copies round a centre', 'polar array, circular pattern, copy around, round a circle, radial'],
    // ---- Analyze
    dist: ['Measure the distance between two points', 'measure, how far, far apart, gap, spacing, length between, distance'],
    dist3: ['Measure the distance between two points in 3D', 'measure 3d, how far, distance in space'],
    props: ['Show an entity\'s numbers: ends, length, radius, angle', 'info, properties, inspect, what is it, length, how long, length of, radius, analyze'],
    area: ['The area and perimeter of a closed chain', 'area, perimeter, square inches, how big, size, weight'],
    bodyinfo: ['A body\'s size, volume and area', 'volume, size, weight, mesh info, how big'],
    chainck: ['Find gaps, overlaps, short pieces and open ends in chains', 'gaps, open chain, broken, not closed, check dxf, fix dxf, overlaps, problems, errors'],
    // ---- View
    vtop: ['Look from the top, and draw on the Top plane', 'top view, plan view, from above, xy'],
    vfront: ['Look from the front, and draw on the Front plane', 'front view, elevation, xz'],
    vright: ['Look from the right, and draw on the Right plane', 'right view, side view, yz'],
    viso: ['Look at it from a corner, in 3D', 'iso, isometric, 3d view, perspective, angled view'],
    vback: ['Look from the back', 'back view, rear'],
    vbottom: ['Look from underneath', 'bottom view, underneath, below'],
    vleft: ['Look from the left', 'left view, side view'],
    vprev: ['Go back to the view before', 'previous view, last view, view back'],
    fit: ['Fit the whole drawing on the screen', 'zoom all, zoom extents, see everything, show all, fit screen, extents'],
    zwin: ['Zoom to a window you drag', 'zoom in, zoom window, zoom box, closer, magnify'],
    unzoom: ['Zoom out to half', 'zoom out, further, smaller view'],
    shaded: ['Show solids and bodies shaded', 'shade, solid view, render, colours'],
    edges: ['Show solids and bodies shaded, with their edges', 'shaded edges, outlines, render'],
    wire: ['Show solids and bodies as wireframe', 'wireframe, see through, transparent, lines only'],
    section: ['Cut the view of the solids and bodies at a plane, to see inside', 'section view, cut away, cutaway, see inside, clip'],
    secoff: ['Take the section view away', 'section off, uncut, whole'],
    grid: ['Grid on or off', 'grid, dots, background lines'],
    axes: ['Axes on or off', 'axis, xyz, triad, origin lines'],
    hide: ['Hide all but the selection; again to show everything', 'hide, isolate, blank, unhide, show all, show everything'],
    // ---- keys with no button (the page lists those it has)
    'key:Ctrl+C': ['Copy what is selected', 'copy, clipboard, duplicate', 'Copy'],
    'key:Ctrl+X': ['Cut what is selected, to paste somewhere', 'cut, clipboard', 'Cut'],
    'key:Ctrl+V': ['Paste what was copied, where it was', 'paste, clipboard, duplicate', 'Paste in place'],
    'key:Shift+D': ['Cut out the piece of a curve between two crossings', 'divide, cut out piece, trim between', 'Divide'],
    'key:Alt+S': ['Shading on or off', 'shade, wireframe, toggle shading', 'Shading on or off'],
    'key:Alt+Z': ['Show the levels', 'levels, layers, layer list', 'Levels list'],
    'key:Alt+I': ['Show the solids history', 'history, features, feature tree, solids list, tree', 'Solids history'],
    'key:PageUp': ['Zoom in', 'zoom in, closer, magnify, bigger', 'Zoom in'],
    'key:PageDown': ['Zoom out', 'zoom out, further, smaller', 'Zoom out'],
    'key:F3': ['Draw the screen again', 'redraw, refresh, regen, regenerate', 'Redraw'],
    // ---- the status bar
    'bar:sPlane': ['Pick the plane new entities are drawn on', 'plane, top, front, right, side, drawing plane, cplane, work plane', 'Drawing plane'],
    'bar:sZ': ['The depth new entities are drawn at', 'z, depth, height, level z, elevation, draw at depth', 'Z depth'],
    'bar:sLevel': ['Pick the level new entities go on', 'level, layer, active level, current layer', 'Active level'],
    'bar:sCol': ['Pick the colour new entities are drawn in', 'colour, color, active colour, pen', 'Active colour'],
    'bar:sStyle': ['Pick the line style new entities are drawn in', 'line style, dashed, dash, centre line, hidden line, phantom, solid line, linetype, line type', 'Line style'],
    'bar:sWidth': ['Pick the line width new entities are drawn in', 'line width, thick, thin, medium, weight, lineweight', 'Line width'],
    'bar:sCons': ['Draw new entities as construction geometry, or not', 'construction, reference, helper, guide, layout', 'Construction switch'],
    'bar:snaps': ['Turn snaps on or off: end, mid, centre, intersection, quadrant, near, grid', 'snap, osnap, endpoint, midpoint, intersection, quadrant, nearest, magnet', 'Snaps'],
    'bar:sGrid': ['The grid spacing', 'grid size, grid spacing, step', 'Grid spacing'],
  };

  // ---- jobs that take more than one command: their steps, each with the command that does it (a ribbon id, or a
  // key: or bar: entry above) where there is one
  const RECIPES = [
    { id: 'how:soliddxf', title: 'Make a DXF from a solid', words: 'solid to dxf, 3d to 2d, model to dxf, flat pattern, outline of part, send solid to machine, wire edm, laser', steps: [
      ['Edges, Flattened: click the solid, and its edges are laid on the active plane, duplicates taken away', 'sedges'],
      ['Or Section, for the outline where the active plane at a Z cuts it', 'ssection'],
      ['Save the DXF: the lines and arcs go out, the solid does not', 'xdxf']] },
    { id: 'how:import', title: 'Bring another drawing into this one', words: 'merge, combine drawings, import, insert dxf, add dwg, add step, two files together', steps: [
      ['Import the file: DXF, DWG, STEP, meshes and more. Its levels are matched to yours by name. (Or hold Shift while you drop the file on the drawing.)', 'import'],
      ['Select last selects what came in', 'sellast'],
      ['Translate moves it where you want it', 'move']] },
    { id: 'how:part', title: 'Make a solid part from a 2D drawing', words: '2d to 3d, part from drawing, solid from dxf, plate, make 3d, thickness', steps: [
      ['Draw the outline, or open a DXF of it. It has to be closed: Check chains finds gaps', 'chainck'],
      ['Extrude: pick the outline, and any outlines inside it become holes, then Enter', 'sextrude'],
      ['Hole drills more holes at circles', 'shole'],
      ['Fillet or chamfer its edges', 'sfillet']] },
    { id: 'how:pocket', title: 'Cut a pocket or a slot in a solid', words: 'pocket, cut pocket, slot, recess, counterbore, step, remove material, cut into', steps: [
      ['Draw the pocket\'s outline on the face, at its Z. New plane From a face puts the drawing plane on it', 'newplane'],
      ['Extrude it with Remove, as deep as the pocket: Remove works on the last solid', 'sextrude']] },
    { id: 'how:cleandxf', title: 'Clean up a DXF from someone else', words: 'clean up, fix dxf, repair, broken drawing, double lines, gaps, open chain, will not extrude, will not offset', steps: [
      ['Remove duplicates takes away entities drawn twice', 'deldup'],
      ['Check chains finds gaps, overlaps, short pieces and open ends, and selects them', 'chainck'],
      ['Join makes two lines in a row, or two arcs of one circle, into one', 'join'],
      ['Fillet, with Trim on, joins two lines that stop short of their corner, with a small round', 'fillet']] },
    { id: 'how:bolt', title: 'Lay out a bolt circle and drill it', words: 'bolt pattern, hole pattern, holes round, pcd, flange, drill pattern', steps: [
      ['Bolt circle: the count, the diameter it is on, and circles the hole\'s size', 'bolt'],
      ['Hole: pick the circles on the solid, then Enter', 'shole']] },
    { id: 'how:engrave', title: 'Engrave text', words: 'engrave, lettering, part number, serial number, mark, text to lines, single line text', steps: [
      ['Note puts the text on the drawing', 'note'],
      ['Note to lines makes it into lines and arcs a machine can follow', 'explode'],
      ['Save the DXF', 'xdxf']] },
    { id: 'how:side', title: 'Draw on the side of a part', words: 'side, face, angled face, tilted, draw on face, work plane, other side', steps: [
      ['New plane, From a face: click the face', 'newplane'],
      ['Plane view looks square at it', 'vplane'],
      ['Draw: new entities go on that plane', 'line']] },
    { id: 'how:origin', title: 'Put the part at 0,0', words: 'origin, zero, move to zero, datum, home, corner to zero, centre to zero', steps: [
      ['Select all, or select the part', 'selall'],
      ['To origin: click the point that goes to 0,0 (its corner, or its centre)', 'toorigin']] },
    { id: 'how:mm', title: 'Change millimetres to inches', words: 'mm to inch, metric to inch, millimetres, wrong size, too big, units, convert', steps: [
      ['A DXF that says it is in millimetres is turned into inches when it opens. For one that does not say:', null],
      ['Select all', 'selall'],
      ['Scale with the factor 0.0393701 (1 ÷ 25.4), about 0,0', 'scale']] },
    { id: 'how:cons', title: 'Draw construction geometry', words: 'construction, layout lines, reference lines, helper lines, guide lines, not cut', steps: [
      ['Constr in the status bar: what you draw from then on is construction (dashed, snapped to, left out of chains, solids and files)', 'bar:sCons'],
      ['Endless line: lines with no ends, at an angle, through 2 points, bisecting', 'xline'],
      ['Construction turns what is already drawn into construction, or back', 'tocons']] },
    { id: 'how:back', title: 'Go back several steps', words: 'go back, undo many, history, earlier, before, timeline', steps: [
      ['Click a step on the History timeline along the bottom: the drawing goes back to just after it, and forward again the same way', null],
      ['Or Undo, one step at a time', 'undo']] },
    { id: 'how:pattern', title: 'Repeat a feature in rows, or in a circle', words: 'pattern, array, repeat, copies, rows, grid of holes, step and repeat', steps: [
      ['Rectangular: copies across and up', 'arect'],
      ['Polar: copies round a centre', 'apolar'],
      ['On a solid, Hole drills at the copied circles', 'shole']] },
    { id: 'how:edmfile', title: 'Open the wire EDM\'s drawings', words: 'mitsubishi, edm, wire edm, mswin, dwg from the edm, machine drawing', steps: [
      ['Open the file the EDM saved (it calls it .dwg). The page asks its units, as the file does not say them', 'open'],
      ['Check chains before you cut it', 'chainck']] },
  ];

  // ---- words: lower case, filler dropped, one spelling, a light stem
  const STOP = new Set('a an the to of i im want wanna need how do does can could would will my me this that these those it its is are be on in into for from with and or please some at so just get let lets what which way there here one ones using use thing things put part'.split(' '));
  // verbs that say little on their own (make a circle is about the circle): left out of the scoring, kept for phrases
  // such as make 3d
  const WEAK = new Set(['make', 'draw', 'create', 'build']);
  const SPELL = { colour: 'color', colours: 'colors', centre: 'center', centres: 'centers', metre: 'meter', millimetre: 'millimeter', millimetres: 'millimeters', grey: 'gray', licence: 'license', analyse: 'analyze', mould: 'mold', champher: 'chamfer', hexagon: 'hex', dimension: 'dim', dimensions: 'dim', '3d': '3d', '2d': '2d' };
  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3);
    else if (w.length > 4 && /ies$/.test(w)) w = w.slice(0, -3) + 'y';
    else if (w.length > 4 && /(ss|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 4 && /ed$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz|ff)$/.test(w)) w = w.slice(0, -1);   // trimm → trim
    if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1);   // curve and curved alike
    return w;
  }
  function tokens(text, keepStop) {
    const out = [];
    for (let w of String(text).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/)) {
      if (!w) continue; if (SPELL[w]) w = SPELL[w];
      if (!keepStop && STOP.has(w)) continue;
      out.push(stem(w));
    }
    return out;
  }
  // edits to turn a into b, a letter swap counting one; stops early past the limit
  function near(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    const d = []; for (let i = 0; i <= a.length; i++) { d.push(new Array(b.length + 1).fill(0)); d[i][0] = i; } for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let low = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        low = Math.min(low, d[i][j]);
      }
      if (low > max) return false;
    }
    return d[a.length][b.length] <= max;
  }

  // ---- the index: each item's words, by where they come from (a name counts most)
  const W = { name: 10, words: 7, key: 5, place: 3, what: 2 };
  function index(items) {
    return items.map((it, order) => {
      const phrases = String(it.words || '').split(',').map(p => tokens(p)).filter(p => p.length);
      const f = { name: tokens((it.names || []).join(' ')), words: [].concat(...phrases), key: tokens(String(it.key || '').replace(/\+/g, ' '), true), place: tokens(it.place || ''), what: tokens(it.what || '') };
      return { it, order, f, phrases: phrases.filter(p => p.length > 1).concat(f.name.length > 1 ? [f.name] : []) };
    });
  }
  // how well a word typed fits a word known: 1 the same, less for the start of it or a typo
  function fit(q, t, last) {
    if (q === t) return 1;
    if (t.startsWith(q) && (q.length >= 3 || last && q.length >= 2)) return last ? 0.8 : 0.6;
    if (t.length >= 4 && q.startsWith(t) && q.length - t.length <= 3) return 0.6;   // thicker: thick

    if (q.length >= 4 && t.length >= 4 && q[0] === t[0] && near(q, t, q.length >= 8 ? 2 : 1)) return 0.5;   // a typo, not the first letter
    return 0;
  }
  const seq = (qs, p) => { for (let i = 0; i + p.length <= qs.length; i++) if (p.every((w, j) => qs[i + j] === w)) return true; return false; };
  // A word typed scores by the best place it is found in an item (its name most), times how rare it is among the items:
  // "split a line" is about splitting, as most commands' names say line. Every word found, and a phrase found
  // whole, add to it.
  function search(idx, query, n) {
    const raw = String(query), all = tokens(raw), lastPart = !/\s$/.test(raw), strong = all.filter(w => !WEAK.has(w)), qs = strong.length ? strong : all;
    if (!qs.length) return [];
    const best = qs.map(() => new Float64Array(idx.length)), df = qs.map(() => 0);
    qs.forEach((q, i) => {
      const last = lastPart && i === qs.length - 1;
      idx.forEach((x, j) => { let b = 0; for (const k in W) for (const t of x.f[k]) { const v = W[k] * fit(q, t, last); if (v > b) b = v; } best[i][j] = b; if (b) df[i]++; });
    });
    const N = idx.length, rare = df.map(d => d ? Math.log(1 + N / d) / Math.log(1 + N) : 0), out = [];
    idx.forEach((x, j) => {
      let score = 0, hit = 0;
      qs.forEach((q, i) => { if (best[i][j]) { hit++; score += best[i][j] * rare[i]; } });
      if (!hit) return;
      for (const p of x.phrases) if (seq(all, p)) score += 2 * p.length;
      if (hit === qs.length && qs.length > 1) score += 2;
      // of names that fit as well, the one the words cover most: circle before bolt circle
      const nm = x.f.name; if (nm.length) score += 2 * nm.filter(t => qs.some(q => fit(q, t, false) === 1)).length / nm.length;
      // a recipe comes after a command that fits as well: the command is what was asked for, the recipe the way round
      out.push({ x, score: x.it.kind === 'how' ? score * 0.85 : score });
    });
    out.sort((a, b) => b.score - a.score || a.x.order - b.x.order);
    return out.slice(0, n || 8).map(r => r.x.it);
  }
  // ---- what can be run, from the page's ribbon ({tab: [[group, [[id, label], ..]], ..]}) and these words; a command
  // on two tabs is one item, found by both labels. cmdName(id): the command's own name; keyOf(id): its key.
  function items(ribbon, cmdName, keyOf) {
    const out = [], seen = new Map();
    for (const tab of Object.keys(ribbon)) for (const [grp, bs] of ribbon[tab]) for (const [id, label] of bs) {
      const v = VOCAB[id]; if (!v) continue;
      if (seen.has(id)) { seen.get(id).names.push(label); continue; }
      const nm = cmdName && cmdName(id), it = { id, kind: 'cmd', names: [label].concat(nm && nm !== label ? [nm] : []), label, place: tab + ' › ' + grp, key: keyOf && keyOf(id) || '', what: v[0], words: v[1] };
      seen.set(id, it); out.push(it);
    }
    for (const id of Object.keys(VOCAB)) {
      const m = /^(key|bar):(.+)$/.exec(id); if (!m) continue;
      const v = VOCAB[id];
      out.push(m[1] === 'key' ? { id, kind: 'key', key: m[2], names: [v[2]], label: v[2], place: 'Keys', what: v[0], words: v[1] }
        : { id, kind: 'bar', el: m[2], names: [v[2]], label: v[2], place: 'Status bar', key: '', what: v[0], words: v[1] });
    }
    // the recipes, found by their title and words; what they say is the commands they use
    const named = new Map(out.map(it => [it.id, it]));
    for (const r of RECIPES) {
      const uses = [...new Set(r.steps.map(s => s[1]).filter(Boolean))].map(id => named.get(id)).filter(Boolean).map(it => it.label);
      out.push({ id: r.id, kind: 'how', names: [r.title], label: r.title, place: 'How to', key: '', what: uses.join(', '), words: r.words, steps: r.steps.map(([text, cmd]) => ({ text, cmd: cmd || null, it: cmd ? named.get(cmd) || null : null })) });
    }
    return out;
  }
  // ribbon commands with no words, and words for a command that is not on the ribbon
  function missing(ribbon) {
    const on = new Set(); for (const tab of Object.keys(ribbon)) for (const [, bs] of ribbon[tab]) for (const [id] of bs) on.add(id);
    return { noWords: [...on].filter(id => !VOCAB[id]), notOnRibbon: Object.keys(VOCAB).filter(id => !/^(key|bar):/.test(id) && !on.has(id)),
      badSteps: [].concat(...RECIPES.map(r => r.steps.filter(([, c]) => c && !on.has(c) && !VOCAB[c]).map(([, c]) => r.id + ': ' + c))) };
  }
  const I = { VOCAB, RECIPES, tokens, stem, near, index, search, items, missing };
  if (typeof module !== 'undefined' && module.exports) module.exports = I;
  else root.CADFind = I;
})(this);
