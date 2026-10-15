// The CAD app's ribbon icons, drawn for this page: 24 × 24, in lines of the text colour, blue for what a command makes
// and red for what it takes away, with light fills for solids. Nothing is fetched and there is no icon set to license.
// CADIcons[commandId] is the inside of an <svg viewBox="0 0 24 24" class="ico">; the classes are styled by the page:
//   a: blue line · r: red line · f: a dot (filled) · fa: a blue dot · fb: a blue-tinted face · t, l, k: the light,
//   middle and darker faces of a solid · dash: a hidden or dashed line
(function (root) {
  'use strict';
  const dot = (x, y, c) => `<circle class="${c || 'f'}" cx="${x}" cy="${y}" r="1.7"/>`;
  // a solid block seen from above and to the side: top, left and right faces
  const block = (x, y, s) => { s = s || 1; const P = (a, b) => (x + a * s).toFixed(2) + ' ' + (y + b * s).toFixed(2);
    return `<path class="t" d="M${P(0, -9)}L${P(8, -4.5)}L${P(0, 0)}L${P(-8, -4.5)}Z"/><path class="l" d="M${P(-8, -4.5)}L${P(0, 0)}L${P(0, 9)}L${P(-8, 4.5)}Z"/><path class="k" d="M${P(8, -4.5)}L${P(0, 0)}L${P(0, 9)}L${P(8, 4.5)}Z"/>`; };
  const cube = block(12, 12);
  // a box in oblique view, its hidden edges dashed and one face picked out: for the named views
  const FACES = { top: 'M4 8h12l4-4H8z', front: 'M4 8h12v12H4z', right: 'M16 8l4-4v12l-4 4z', back: 'M8 4h12v12H8z', bottom: 'M4 20h12l4-4H8z', left: 'M4 8l4-4v12l-4 4z' };
  const view = f => `<path class="fb" d="${FACES[f]}"/><path d="M4 8h12v12H4zM16 8l4-4M4 8l4-4h12v12l-4 4"/><path class="dash" d="M8 4v12h12M8 16l-4 4"/>`;
  // a sheet of paper, and one with an arrow leaving it (saving a file)
  const sheet = '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/>';
  const out = (x, y) => `<path class="a" d="M${x} ${y}h7M${x + 4} ${y - 3}l3 3-3 3"/>`;
  const I = {
    // ---- files
    new: sheet + '<path class="a" d="M12 11v7M8.5 14.5h7"/>',
    open: '<path d="M3 19V5h6l2 2h8v4"/><path class="a" d="M3 19l3.5-8H22l-3.5 8z"/>',
    import: '<path d="M3 19V5h6l2 2h10v12z"/><path class="a" d="M12 9.5v7M9 13.5l3 3 3-3"/>',
    save: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 4v5h7V4"/><path class="a" d="M8 13h8v7H8z"/>',
    saveas: '<path d="M3 4h11l3 3v4"/><path d="M3 4v15h8"/><path d="M7 4v4h6V4"/><path class="a" d="M13 21l1-3.5 6-6 2.5 2.5-6 6z"/>',
    xdxf: '<path d="M4 3h8l4 4v5"/><path d="M4 3v18h7"/><path d="M7 10h5M7 13l3 3h-3"/>' + out(13, 18),
    xsvg: '<path d="M4 3h8l4 4v5"/><path d="M4 3v18h7"/><path d="M7 15c2-5 4 1 6-5"/>' + out(13, 18),
    xpdf: '<path d="M4 3h8l4 4v5"/><path d="M4 3v18h7"/><path d="M7 9h6M7 12h6M7 15h3"/>' + out(13, 18),
    xstep: block(9, 12, 0.72) + out(13, 18),
    xstl: '<path d="M2.5 17L9 4l6.5 13zM9 4v13M2.5 17l6.5-5 6.5 5"/>' + out(13, 19),
    xobj: '<path d="M3 9l6-5 6 5v7l-6 4-6-4zM3 9l6 4 6-4M9 13v7"/>' + out(13, 19),
    x3mf: block(9, 12, 0.72) + '<path class="dash" d="M3.2 8.7l5.8 3.3 5.8-3.3"/>' + out(13, 18),
    shortcuts: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6.5 14h11"/>',
    about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/>' + dot(12, 7.6),
    // ---- edit
    undo: '<path d="M8.5 5L4 9.5 8.5 14"/><path class="a" d="M4 9.5h10a5.5 5.5 0 0 1 0 11h-4"/>',
    redo: '<path d="M15.5 5L20 9.5 15.5 14"/><path class="a" d="M20 9.5H10a5.5 5.5 0 0 0 0 11h4"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path class="r" d="M10 11v6M14 11v6"/>',
    selall: '<rect class="dash" x="3" y="3" width="18" height="18" rx="1"/><path class="a" d="M7 16l3.5-6 3 4 2-2.5 2 4.5"/>',
    chainsel: '<path class="a" d="M5 19V9l7-5 7 5v10"/><path class="a" d="M16 16l3 3 3-3"/>' + dot(5, 19),
    chlevel: '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 3-1.5"/><path d="M3 16.5L12 21l3-1.5"/><path class="a" d="M19 12v9M16.5 18.5L19 21l2.5-2.5"/>',
    tolevel: '<path class="fb" d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5L12 21l9-4.5"/>',
    tocolor: '<path class="fb" d="M12 3.5s6 6.8 6 10.8a6 6 0 0 1-12 0c0-4 6-10.8 6-10.8z"/>',
    bolt: '<circle class="dash" cx="12" cy="12" r="7.5"/>' + [0, 1, 2, 3, 4, 5].map(k => `<circle class="a" cx="${(12 + 7.5 * Math.cos(k * Math.PI / 3)).toFixed(2)}" cy="${(12 + 7.5 * Math.sin(k * Math.PI / 3)).toFixed(2)}" r="1.8"/>`).join('') + dot(12, 12),
    ctrpts: '<circle cx="8" cy="9" r="5"/><circle cx="17" cy="16" r="3.5"/><path class="a" d="M6.5 9h3M8 7.5v3M15.5 16h3M17 14.5v3"/>',
    ptsalong: '<path d="M3 17c4-9 8-9 9-4s5 5 9-4"/>' + dot(3, 17, 'fa') + dot(8.4, 10.5, 'fa') + dot(12.4, 14.6, 'fa') + dot(16.5, 15.4, 'fa') + dot(21, 9, 'fa'),
    bbox: '<path class="a dash" d="M3 3h18v18H3z"/><path d="M7 16l3-8 4 3 3-5"/>' + dot(7, 16) + dot(17, 6),
    ellipse: '<ellipse class="a" cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-20 12 12)"/>' + dot(12, 12),
    closearc: '<path d="M4.5 15a8 8 0 0 1 15 0"/><path class="a dash" d="M19.5 15a8 8 0 0 1-15 0"/>' + dot(12, 12),
    cfillet: '<path d="M6 4h12M20 6v12M18 20H6M4 18V6"/><path class="a" d="M4 6a2 2 0 0 1 2-2M18 4a2 2 0 0 1 2 2M20 18a2 2 0 0 1-2 2M6 20a2 2 0 0 1-2-2"/>',
    cchamfer: '<path d="M7 4h10M20 7v10M17 20H7M4 17V7"/><path class="a" d="M4 7l3-3M17 4l3 3M20 17l-3 3M7 20l-3-3"/>',
    breakn: '<path d="M2 12h4.5M8.5 12h3M13.5 12h3M18.5 12H22"/>' + dot(7.5, 12, 'fa') + dot(12.5, 12, 'fa') + dot(17.5, 12, 'fa'),
    stretch: '<path class="dash" d="M10 4h11v16H10z"/><path d="M3 18V8h10"/><path class="a" d="M3 18h16V8h-6"/><path class="a" d="M15 14l3-3-3-3" style="stroke-width:1.3"/>',
    toorigin: '<path d="M4 20V4M4 20h16"/><rect class="dash" x="12" y="5" width="7" height="6"/><path class="a" d="M12 11L6 17"/><path class="a" d="M6 13v4h4"/>' + dot(4, 20, 'fa'),
    chainck: '<path d="M4 17V6h13l3 4v7H11"/><circle class="r" cx="8.5" cy="17" r="2.5"/><path class="a" d="M14 19.5l2 2 4-5"/>',
    newplane: '<path class="fb" d="M3 15l7-8h11l-7 8z"/><path class="a" d="M10 11v-8M10 11l6 0"/>' + dot(10, 11, 'fa'),
    vplane: '<path d="M4 6h16v12H4z"/><path class="a" d="M8 14V9M8 14h6"/><circle cx="12" cy="12" r="1.2" class="f"/>',
    ssweep: '<path class="dash" d="M4 18c4 0 6-12 16-12"/><ellipse class="a" cx="4.5" cy="16" rx="1.6" ry="3"/><ellipse class="a" cx="19.5" cy="6" rx="1.6" ry="3"/><path d="M4.5 13c4 0 6-10 15-10M4.5 19c4.5 0 6.5-10 15-10"/>',
    sloft: '<path class="a" d="M3 19h10l3-3H6z"/><path class="a" d="M8 6h6l2-2h-6z"/><path d="M3 19L8 6M13 19l1-13M16 16l2-12M6 16l4-12"/>',
    sshell: block(12, 12) + '<path class="r" d="M12 5.5l5.2 3-5.2 3-5.2-3z" style="fill:#fff"/>',
    sdraft: '<path class="t" d="M7 6h10l3 13H4z" style="stroke:currentColor"/><path class="dash" d="M4 6v13M20 6v13"/><path class="a" d="M2 19h20"/>',
    // the history's own: the start, a grip dragged, numbers typed, a level, a solid's feature, a paste, any other step
    start: '<path d="M6 21V4"/><path class="a" d="M6 4h11l-2.5 3.5L17 11H6"/>',
    drag: '<path d="M4 18L14 8"/><path class="a dash" d="M14 8l5-3"/><rect class="fa" x="17" y="3" width="4" height="4"/><rect class="f" x="12.2" y="6.2" width="3.6" height="3.6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path class="a" d="M13 7l4 4"/><path d="M14 20h6"/>',
    level: '<path class="fb" d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>',
    feat: block(12, 12) + '<path class="a" d="M17 3.5l3.5 3.5-7 7H10v-3.5z" style="fill:#fff"/>',
    paste: '<path d="M8 5H5v16h14V5h-3"/><rect x="8" y="3" width="8" height="4" rx="1"/><path class="a" d="M8 12h8M8 16h5"/>',
    step: dot(12, 12, 'fa') + '<circle cx="12" cy="12" r="6"/>',
    sedges: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z" style="stroke-dasharray:0"/><path class="a" d="M4 8l8 4 8-4M12 12v8"/>',
    sfacecurves: block(12, 12) + '<path class="a" d="M12 3l8 4.5-8 4.5-8-4.5z" style="stroke-width:2"/>',
    ssection: block(12, 13) + '<path class="a" d="M2 11.5h20" style="stroke-width:2"/><path class="dash" d="M2 11.5l3-3"/>',
    flatten: '<path class="dash" d="M5 4l7-2 7 2-7 3z"/><path d="M12 7v9M9 13l3 3 3-3"/><path class="a" d="M3 20h18"/>',
    deldup: '<path d="M4 8h12"/><path class="r" d="M7 12h12"/><path class="r" d="M15 16l5 5M20 16l-5 5"/>',
    selby: '<path d="M5 3l9 9-4 .8 2.5 5-2 1-2.5-5L5 16z"/><path class="a" d="M15 5h6M15 8.5h6M17 12h4"/>',
    selinv: '<rect class="fb" x="3" y="3" width="9" height="9"/><rect x="12" y="12" width="9" height="9"/><path class="a" d="M16 4.5a5 5 0 0 1 4 4M20 8.5l.2-2.8M20 8.5l-2.7-.3M8 19.5a5 5 0 0 1-4-4M4 15.5l-.2 2.8M4 15.5l2.7.3"/>',
    sellast: '<path d="M4 18l6-9 5 5 5-8"/><path class="a" d="M15 14l5-8" style="stroke-width:2.6"/>' + dot(20, 6, 'fa'),
    lsel: '<path d="M6 3l11 11-5 1 3 6-2.5 1.2-3-6L6 19z"/>',
    ldel: '<path class="r" d="M6 6l12 12M18 6L6 18" style="stroke-width:2.2"/>',
    xline: '<path class="a dash" d="M1 19.5L23 4.5"/><path d="M5 12h14"/>' + dot(12, 12, 'fa'),
    tostyle: '<path class="dash" d="M3 6h18"/><path d="M3 12h3.5m2 0h1.5m2 0h3.5m2 0h1.5"/><path class="a" d="M3 18h18" style="stroke-width:3"/>',
    tocons: '<path class="dash" d="M3 20L21 4"/><path d="M5 12h14"/>' + dot(12, 12, 'fa'),
    fromEnt: '<path d="M15 3.5l5.5 5.5M18 6.5L8 16.5 5 17.5l1-3 10-10"/><path class="a" d="M5 17.5l-2 3"/>' + dot(3.5, 20.5, 'fa'),
    // ---- wireframe: points, lines and arcs
    point: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle class="fa" cx="12" cy="12" r="2.4"/>',
    line: '<path class="a" d="M5 19L19 5"/>' + dot(5, 19) + dot(19, 5),
    lpar: '<path d="M3.5 14.5L14.5 3.5"/><path class="a" d="M9.5 20.5l11-11"/><path class="dash" d="M9 9l6 6"/>',
    lperp: '<path d="M3 19h18"/><path class="a" d="M12 19V4"/><path d="M12 15h4v4"/>',
    ltan: '<circle cx="11" cy="14" r="6"/><path class="a" d="M3 8h18"/>' + dot(11, 8),
    circle: '<circle class="a" cx="12" cy="12" r="8"/>' + dot(12, 12),
    arc: '<path class="a" d="M4 18a9 9 0 0 1 16 0"/>' + dot(4, 18) + dot(20, 18) + dot(12, 13.1),
    rect: '<path class="a" d="M4 6h16v12H4z"/>' + dot(4, 18) + dot(20, 6),
    obround: '<path class="a" d="M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z"/>' + dot(8, 12) + dot(16, 12),
    polygon: '<path class="a" d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>' + dot(12, 12),
    spline: '<path class="a" d="M3 18C6 5 10 19 14 11s5-5 7-5"/>' + dot(3, 18) + dot(9.6, 12.7) + dot(21, 6),
    // ---- wireframe: changing entities
    fillet: '<path class="dash" d="M5 12v8h8"/><path d="M5 4v8M13 20h7"/><path class="a" d="M5 12a8 8 0 0 0 8 8"/>',
    chamfer: '<path class="dash" d="M5 14v6h6"/><path d="M5 4v10M11 20h9"/><path class="a" d="M5 14l6 6"/>',
    trim: '<path d="M3 12h11M14 4v16"/><path class="r dash" d="M15.5 12h5.5"/>' + dot(14, 12, 'fa'),
    extend: '<path d="M3 14h9M19 4v16"/><path class="a" d="M12 14h7"/><path class="a" d="M15 11l3 3-3 3"/>',
    break: '<path d="M3 19l7.4-5.8M13.6 10.8L21 5"/>' + dot(12, 12, 'fa'),
    breakx: '<path d="M3 6l18 12M3 18L21 6"/>' + dot(12, 12, 'fa') + '<circle class="a" cx="12" cy="12" r="4"/>',
    join: '<path d="M3 17h7M14 17h7"/><path class="a" d="M3 8h18"/><path class="a dash" d="M10 17h4"/>',
    offset: '<path d="M4 20A16 16 0 0 1 20 4"/><path class="a" d="M9 20A11 11 0 0 1 20 9"/>',
    coffset: '<rect x="3" y="4" width="18" height="16" rx="3"/><rect class="a" x="7" y="8" width="10" height="8" rx="1"/>',
    // ---- solids
    sextrude: '<path class="fb" d="M3 16.5l9 4.5 9-4.5-9-4.5z"/><path class="dash" d="M3 16.5V10M21 16.5V10M12 21v-6.5"/><path d="M3 10l9 4.5 9-4.5-9-4.5z"/><path class="a" d="M12 10V2.5M9.5 5L12 2.5 14.5 5"/>',
    srevolve: '<path class="dash" d="M12 2v20"/><path class="fb" d="M13 5h5v10h-5z"/><path class="a" d="M20 17.5A8 2.6 0 0 1 4 17.5M4 17.5l.4-3M4 17.5l3 .8"/>',
    sbox: cube,
    scyl: '<path class="l" d="M5 6.5v11a7 3 0 0 0 14 0v-11"/><ellipse class="t" cx="12" cy="6.5" rx="7" ry="3"/>',
    shole: cube + '<ellipse class="r" cx="12" cy="7.5" rx="3.6" ry="1.9"/><path class="r dash" d="M8.4 7.5v6M15.6 7.5v6"/>',
    sfillet: cube + '<path class="a" d="M10.6 11.2Q12 13 13.4 11.2" stroke-width="2.4"/><path class="a" d="M12 12.5V21" stroke-width="2.6"/>',
    schamfer: '<path class="t" d="M12 6L18 3.4 20 7.5 12 12 4 7.5 6 3.4z"/><path class="fb" d="M6 3.4l6-2.6 6 2.6-6 2.6z"/><path class="l" d="M4 7.5L12 12v9l-8-4.5z"/><path class="k" d="M20 7.5L12 12v9l8-4.5z"/>',
    sbool: '<circle class="t" cx="9" cy="12" r="6.5"/><circle class="l" cx="15" cy="12" r="6.5"/><path class="a" d="M12 6.2a6.5 6.5 0 0 1 0 11.6 6.5 6.5 0 0 1 0-11.6z"/>',
    // ---- drafting
    dimlin: '<path d="M5 5v10M19 5v10"/><path class="a" d="M5 12h14M5 12l3-2M5 12l3 2M19 12l-3-2M19 12l-3 2"/><path d="M8 19h8"/>',
    dimrad: '<path d="M4 20A12 12 0 0 1 16 8"/>' + dot(16, 20) + '<path class="a" d="M16 20L7.6 11.6M7.6 11.6l.6 3.4M7.6 11.6l3.4.6"/><path d="M18 5v5M18 5h2.5a1.5 1.5 0 0 1 0 3H18M20 8l1.8 2"/>',
    dimdia: '<circle cx="12" cy="12" r="8"/><path class="a" d="M6.3 17.7L17.7 6.3M6.3 17.7l.6-3.4M6.3 17.7l3.4-.6M17.7 6.3l-.6 3.4M17.7 6.3l-3.4.6"/>',
    dimang: '<path d="M4 20h16M4 20L14 5"/><path class="a" d="M15 20a11 11 0 0 0-4.8-9.1M15 20l-1.8-2.6M15 20l1.8-2.6"/>',
    dimord: '<path d="M4 20V4M4 20h16"/><path class="a" d="M10 20V8M16 20v-6"/>' + dot(10, 8) + dot(16, 14) + '<path d="M8.5 5.5h3M14.5 11.5h3"/>',
    leader: '<path class="a" d="M4 19l7-8h6"/><path class="a" d="M4 19l1-3.6M4 19l3.6-1"/><path d="M18 8.5h3M18 12h3"/>',
    ctrmark: '<circle cx="12" cy="12" r="7"/><path class="a dash" d="M2 12h20M12 2v20"/>',
    hatch: '<path d="M4 4h16v16H4z"/><path class="a" d="M4 10l6-6M4 16L16 4M8 20L20 8M14 20l6-6"/>',
    explode: '<path d="M3.5 19L8 6l4.5 13M5.2 14.5h5.6"/><path class="a" d="M15 7l3 3M18 10l3-3M15 17h6"/>',
    note: '<path d="M3.5 19L8 6l4.5 13M5.2 14.5h5.6"/><path class="a" d="M15 9h6M15 13h6M15 17h4"/>',
    // ---- transforms
    move: '<rect class="dash" x="3" y="12" width="8" height="8"/><rect class="a" x="13" y="4" width="8" height="8"/><path d="M9 14l4.5-4.5M10 9.5h3.5V13"/>',
    rotate: '<path d="M19.5 9A8 8 0 1 0 20 14"/><path d="M20 4v5h-5"/><path class="a" d="M12 7.5l4.5 4.5-4.5 4.5-4.5-4.5z"/>',
    mirror: '<path class="dash" d="M12 2.5v19"/><path d="M10 6L3.5 18H10z"/><path class="a" d="M14 6l6.5 12H14z"/>',
    scale: '<path d="M3 13h8v8H3z"/><path class="a" d="M3 13V3h18v18H11"/><path d="M11 13l6.5-6.5M13 6.5h4.5V11"/>',
    arect: '<path d="M3 4h5v5H3z"/><path class="a" d="M10 4h5v5h-5zM17 4h4v5h-4zM3 11h5v5H3zM10 11h5v5h-5zM17 11h4v5h-4zM3 18h5v3H3zM10 18h5v3h-5z"/>',
    apolar: '<circle class="dash" cx="12" cy="12" r="7"/><circle cx="12" cy="5" r="2"/><circle class="a" cx="18.1" cy="8.5" r="2"/><circle class="a" cx="18.1" cy="15.5" r="2"/><circle class="a" cx="12" cy="19" r="2"/><circle class="a" cx="5.9" cy="15.5" r="2"/><circle class="a" cx="5.9" cy="8.5" r="2"/>' + dot(12, 12),
    // ---- analysis
    dist: dot(5, 18) + dot(19, 6) + '<path class="a dash" d="M5 18L19 6"/><path d="M3.5 13.5l4-4.5M15 21l4.5-4"/>',
    dist3: block(10, 13, 0.75) + '<path class="a" d="M4 6l16 12"/>' + dot(4, 6) + dot(20, 18),
    props: '<circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/><path class="a" d="M6.5 12l2-4 2.5 3 2-2"/>',
    area: '<path class="fb" d="M4 18l3-12 10 2 3 10z"/><path class="a" d="M7.5 17l5-8M11.5 17.3l4.5-7M15.5 17.5l2.7-4.5"/>',
    bodyinfo: block(10, 12, 0.8) + '<circle cx="17" cy="16" r="4" fill="#fff"/><path d="M17 15.5v3"/>' + '<circle class="f" cx="17" cy="13.9" r="0.9"/>',
    // ---- view
    vtop: view('top'), vfront: view('front'), vright: view('right'), vback: view('back'), vbottom: view('bottom'), vleft: view('left'),
    viso: '<path class="t" d="M12 3l8 4.5-8 4.5-8-4.5z"/><path class="fb" d="M4 7.5l8 4.5v9l-8-4.5z"/><path class="k" d="M20 7.5l-8 4.5v9l8-4.5z"/>',
    vprev: '<path d="M6 11h12v10H6z"/><path class="a" d="M8.5 2.5L5 6l3.5 3.5"/><path class="a" d="M5 6h10a4 4 0 0 1 4 4"/>',
    fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path class="a" d="M8 8h8v8H8z"/>',
    zwin: '<rect class="dash" x="3" y="3" width="11" height="9"/><circle class="a" cx="15" cy="15" r="4.5"/><path class="a" d="M18.3 18.3L21.5 21.5"/>',
    unzoom: '<circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/><path class="a" d="M7 10h6"/>',
    shaded: '<path class="l" d="M12 3l8 4.5-8 4.5-8-4.5z" stroke="none"/><path class="k" d="M4 7.5l8 4.5v9l-8-4.5z" stroke="none"/><path d="M20 7.5l-8 4.5v9l8-4.5z" fill="#8193a3" stroke="none"/>',
    edges: cube,
    wire: '<path d="M12 3l8 4.5-8 4.5-8-4.5zM4 7.5v9l8 4.5 8-4.5v-9M12 12v9"/><path class="dash" d="M12 3v9"/>',
    section: cube + '<path class="r" d="M2.5 12.5l9.5-5.3 9.5 5.3-9.5 5.3z"/>',
    secoff: '<path d="M12 3l8 4.5-8 4.5-8-4.5zM4 7.5v9l8 4.5 8-4.5v-9M12 12v9"/><path class="r" d="M3 21L21 3"/>',
    grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
    axes: '<path class="r" d="M6 18h14M17 15l3 3-3 3"/><path class="g" d="M6 18V4M3 7l3-3 3 3"/><path class="a" d="M6 18l6-6"/>' + dot(6, 18),
    hide: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="r" d="M4 20L20 4"/>',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = I;
  else root.CADIcons = I;
})(this);
