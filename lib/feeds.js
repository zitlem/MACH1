// Feeds and speeds for high-efficiency machining: end mills (HEM, profiling, slotting), ball end mills, high-feed
// mills, face mills, drills, taps and reamers. Inch. Numbers are starting points for the material and tool; every
// one can be overridden. Works in the browser (window.FEEDS) and in Node (require('./lib/feeds.js')).
//
//   const r = FEEDS.calc({ tool: 'endmill', mat: 'a36', D: 0.5, Z: 4, op: 'hem' });
//   r.rpm, r.feed, r.fzProg, r.hp, r.warnings ...
(function (root) {
  'use strict';
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const PI = Math.PI;
  const SFM_RPM = 12 / PI;                     // rpm = SFM × 3.82 / D

  // Starting points per material.
  //   hp    horsepower per cubic inch per minute at the cutter (unit power)
  //   em    solid carbide end mills: sfm (HEM), k = real chip per tooth as a fraction of D (HEM roughing)
  //   ind   indexable carbide inserts (face and high-feed mills): sfm, hex = actual chip thickness
  //   drill sfm, carbide and HSS; fd scales the feed per rev (carbide 0.0015 + 0.015 D, HSS 0.001 + 0.012 D)
  //   tap   HSS cut-tap sfm (form taps +25%, carbide ×2); form: whether forming is advised
  //   ream  carbide reamer sfm and feed per rev as a fraction of D
  const MATERIALS = {
    a36:    { name: 'A36 / 1018 mild steel',      hp: 1.0, em: { sfm: 575, k: 0.0042 },  ind: { sfm: 800, hex: 0.006 },  drill: { sfm: 300, sfmHss: 90, fd: 1.0 },  tap: { sfm: 40, form: true },  ream: { sfm: 150, kr: 0.02 } },
    s1045:  { name: '1045 medium carbon steel',   hp: 1.1, em: { sfm: 480, k: 0.004 }, ind: { sfm: 700, hex: 0.0055 }, drill: { sfm: 260, sfmHss: 75, fd: 0.9 },  tap: { sfm: 30, form: true },  ream: { sfm: 130, kr: 0.018 } },
    s4140:  { name: '4140 prehard (~30 HRC)',     hp: 1.3, em: { sfm: 380, k: 0.0036 },  ind: { sfm: 600, hex: 0.005 },  drill: { sfm: 220, sfmHss: 60, fd: 0.8 },  tap: { sfm: 25, form: true },  ream: { sfm: 110, kr: 0.016 } },
    tool:   { name: 'Tool steel, annealed (A2, D2)', hp: 1.4, em: { sfm: 300, k: 0.0032 }, ind: { sfm: 450, hex: 0.005 }, drill: { sfm: 180, sfmHss: 50, fd: 0.7 }, tap: { sfm: 15, form: false }, ream: { sfm: 90, kr: 0.014 } },
    ss304:  { name: '304 / 316 stainless',        hp: 1.4, em: { sfm: 350, k: 0.0032 }, ind: { sfm: 500, hex: 0.005 },  drill: { sfm: 180, sfmHss: 45, fd: 0.7 },  tap: { sfm: 15, form: true },  ream: { sfm: 90, kr: 0.014 } },
    ci:     { name: 'Gray cast iron',             hp: 0.6, em: { sfm: 450, k: 0.0042 },  ind: { sfm: 700, hex: 0.007 },  drill: { sfm: 300, sfmHss: 80, fd: 1.1 },  tap: { sfm: 40, form: false }, ream: { sfm: 150, kr: 0.022 } },
    al6061: { name: '6061 aluminum',              hp: 0.3, em: { sfm: 1200, k: 0.007 }, ind: { sfm: 2500, hex: 0.006 }, drill: { sfm: 600, sfmHss: 250, fd: 1.4 }, tap: { sfm: 60, form: true },  ream: { sfm: 300, kr: 0.025 } },
    brass:  { name: 'Brass / bronze',             hp: 0.5, em: { sfm: 900, k: 0.006 },  ind: { sfm: 1200, hex: 0.006 }, drill: { sfm: 400, sfmHss: 150, fd: 1.1 }, tap: { sfm: 80, form: false }, ream: { sfm: 250, kr: 0.022 } },
    ti64:   { name: 'Ti-6Al-4V titanium',         hp: 1.2, em: { sfm: 200, k: 0.003 },  ind: { sfm: 200, hex: 0.004 },  drill: { sfm: 120, sfmHss: 30, fd: 0.6 },  tap: { sfm: 10, form: false }, ream: { sfm: 60, kr: 0.012 } },
  };
  // Coatings: surface speed factors against the coating these numbers assume (AlTiN in steels, stainless, cast iron
  // and titanium; ZrN or polished uncoated in aluminium and brass). Material groups: st steel, ss stainless, ci cast
  // iron, al aluminium and brass, ti titanium.
  const GROUP = { a36: 'st', s1045: 'st', s4140: 'st', tool: 'st', ss304: 'ss', ci: 'ci', al6061: 'al', brass: 'al', ti64: 'ti' };
  // name: shown in the list; full: what it is and its colour; aka: names tool makers sell it under
  const COATINGS = {
    auto:    { name: 'Best for the material', full: 'The numbers\' baseline: AlTiN in steels, stainless, cast iron and titanium; ZrN or polished uncoated in aluminium and brass', aka: '',
               f: { st: 1, ss: 1, ci: 1, al: 1, ti: 1 } },
    none:    { name: 'Uncoated: bare carbide (bright)', full: 'Bare polished carbide', aka: 'bright, polished, uncoated',
               f: { st: 0.75, ss: 0.7, ci: 0.8, al: 1, ti: 0.75 } },
    tin:     { name: 'TiN: titanium nitride (gold)', full: 'Titanium nitride, gold', aka: 'Balinit A, "gold" coating',
               f: { st: 0.8, ss: 0.8, ci: 0.85, al: 0.95, ti: 0.8 } },
    ticn:    { name: 'TiCN: titanium carbonitride (blue-grey)', full: 'Titanium carbonitride, blue-grey to violet', aka: 'Balinit B',
               f: { st: 0.9, ss: 0.85, ci: 0.95, al: 0.95, ti: 0.85 } },
    tialn:   { name: 'TiAlN: titanium aluminum nitride (violet-grey)', full: 'Titanium aluminium nitride, violet-grey', aka: 'Balinit Futura Nano',
               f: { st: 0.95, ss: 0.95, ci: 1, al: 0.8, ti: 0.95 } },
    altin:   { name: 'AlTiN: aluminum titanium nitride (black)', full: 'Aluminium titanium nitride (more aluminium than TiAlN, for more heat), black', aka: 'Balinit X.CEED, "AlTiN Nano", black coating',
               f: { st: 1, ss: 1, ci: 1, al: 0.8, ti: 1 } },
    alcrn:   { name: 'AlCrN: aluminum chromium nitride (blue-grey)', full: 'Aluminium chromium nitride, blue-grey', aka: 'Balinit Alcrona Pro',
               f: { st: 1.05, ss: 1.05, ci: 1, al: 0.8, ti: 1.05 } },
    zrn:     { name: 'ZrN: zirconium nitride (pale gold)', full: 'Zirconium nitride, pale gold', aka: '',
               f: { st: 0.8, ss: 0.75, ci: 0.8, al: 1.1, ti: 0.8 } },
    tib2:    { name: 'TiB2: titanium diboride (silver)', full: 'Titanium diboride, silver-grey; slick, for aluminium and magnesium', aka: '',
               f: { st: 0.75, ss: 0.7, ci: 0.8, al: 1.15, ti: 0.75 } },
    dlc:     { name: 'DLC: diamond-like carbon (dark grey)', full: 'Diamond-like carbon, dark grey to black; for aluminium, brass, plastics', aka: 'Balinit C (WC/C), amorphous diamond, ta-C',
               f: { st: 0.6, ss: 0.6, ci: 0.6, al: 1.2, ti: 0.7 } },
    diamond: { name: 'CVD diamond: diamond grown on the carbide (matte grey)', full: 'Polycrystalline diamond grown on the carbide (CVD); for aluminium, graphite, composites', aka: 'Balinit Diamant, CVD diamond',
               f: { st: 0.5, ss: 0.5, ci: 0.5, al: 1.35, ti: 0.5 } },
  };
  const TOOLS = { endmill: 'End mill', ball: 'Ball end mill', taper: 'Tapered end mill', helix: 'Helix / bore', feedmill: 'High-feed mill', facemill: 'Face mill', chamfer: 'Chamfer mill', drill: 'Drill', tap: 'Tap', reamer: 'Reamer' };
  // end mill operations: radial and axial engagement (fractions of D, aluminium in brackets), speed and chip factors
  const OPS = {
    hem:     { name: 'HEM (light stepover, full flute)', ae: 0.10, aeAl: 0.15, ap: 2.0, sfm: 1.0, k: 1.0 },
    profile: { name: 'Profile / side milling',          ae: 0.30, aeAl: 0.40, ap: 1.0, sfm: 0.85, k: 0.9 },
    slot:    { name: 'Slotting (full width)',           ae: 1.00, aeAl: 1.00, ap: 0.5, apAl: 1.0, sfm: 0.7, k: 0.75 },
    finish:  { name: 'Finish wall (and spring pass)',   ae: 0, aeAl: 0, ap: 2.0, sfm: 1.13, k: 0.35 },
  };

  // ---------------------------------------------------------------- threads and drills
  const UNC = [['#2-56', 0.086, 56], ['#4-40', 0.112, 40], ['#6-32', 0.138, 32], ['#8-32', 0.164, 32], ['#10-24', 0.19, 24], ['#12-24', 0.216, 24],
    ['1/4-20', 0.25, 20], ['5/16-18', 0.3125, 18], ['3/8-16', 0.375, 16], ['7/16-14', 0.4375, 14], ['1/2-13', 0.5, 13], ['9/16-12', 0.5625, 12],
    ['5/8-11', 0.625, 11], ['3/4-10', 0.75, 10], ['7/8-9', 0.875, 9], ['1-8', 1, 8], ['1 1/8-7', 1.125, 7], ['1 1/4-7', 1.25, 7], ['1 1/2-6', 1.5, 6]];
  const UNF = [['#4-48', 0.112, 48], ['#6-40', 0.138, 40], ['#8-36', 0.164, 36], ['#10-32', 0.19, 32], ['1/4-28', 0.25, 28], ['5/16-24', 0.3125, 24],
    ['3/8-24', 0.375, 24], ['7/16-20', 0.4375, 20], ['1/2-20', 0.5, 20], ['9/16-18', 0.5625, 18], ['5/8-18', 0.625, 18], ['3/4-16', 0.75, 16],
    ['7/8-14', 0.875, 14], ['1-12', 1, 12], ['1-14', 1, 14]];
  const MET = [['M3x0.5', 3, 0.5], ['M4x0.7', 4, 0.7], ['M5x0.8', 5, 0.8], ['M6x1', 6, 1], ['M8x1.25', 8, 1.25], ['M8x1', 8, 1], ['M10x1.5', 10, 1.5],
    ['M10x1.25', 10, 1.25], ['M12x1.75', 12, 1.75], ['M12x1.25', 12, 1.25], ['M14x2', 14, 2], ['M16x2', 16, 2], ['M16x1.5', 16, 1.5], ['M20x2.5', 20, 2.5], ['M24x3', 24, 3]];
  // name -> {major (in), pitch (in), tpi}
  const THREADS = {};
  for (const [n, d, t] of UNC.concat(UNF)) THREADS[n] = { name: n, major: d, pitch: 1 / t, tpi: t, metric: false };
  for (const [n, d, p] of MET) THREADS[n] = { name: n, major: d / 25.4, pitch: p / 25.4, tpi: 25.4 / p, metric: true, mm: d, pmm: p };
  function thread(name) {
    if (THREADS[name]) return THREADS[name];
    const s = String(name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    let m = /^M\s*([\d.]+)\s*[X×]\s*([\d.]+)$/.exec(s);
    if (m) return { name: 'M' + m[1] + 'x' + m[2], major: m[1] / 25.4, pitch: m[2] / 25.4, tpi: 25.4 / m[2], metric: true, mm: +m[1], pmm: +m[2] };
    m = /^([\d./ #]+)-(\d+)$/.exec(s);
    if (m) {
      let d = m[1].trim();
      const nb = /^#(\d+)$/.exec(d);
      if (nb) d = 0.06 + 0.013 * +nb[1];
      else { const f = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(d); d = f ? (+(f[1] || 0) + f[2] / f[3]) : parseFloat(d); }
      if (d > 0) return { name: s, major: d, pitch: 1 / m[2], tpi: +m[2], metric: false };
    }
    return null;
  }
  // standard drills: fractions to 1-1/2 by 64ths, number drills #1-#60, letters A-Z, metric 1-20 mm by 0.1 to 10, 0.5 above
  const DRILLS = [];
  const NUMBER = [0.228, 0.221, 0.213, 0.209, 0.2055, 0.204, 0.201, 0.199, 0.196, 0.1935, 0.191, 0.189, 0.185, 0.182, 0.18, 0.177, 0.173, 0.1695, 0.166, 0.161,
    0.159, 0.157, 0.154, 0.152, 0.1495, 0.147, 0.144, 0.1405, 0.136, 0.1285, 0.12, 0.116, 0.113, 0.111, 0.11, 0.1065, 0.104, 0.1015, 0.0995, 0.098,
    0.096, 0.0935, 0.089, 0.086, 0.082, 0.081, 0.0785, 0.076, 0.073, 0.07, 0.067, 0.0635, 0.0595, 0.055, 0.052, 0.0465, 0.043, 0.042, 0.041, 0.04];
  NUMBER.forEach((d, i) => DRILLS.push({ name: '#' + (i + 1), d }));
  const LETTER = [0.234, 0.238, 0.242, 0.246, 0.25, 0.257, 0.261, 0.266, 0.272, 0.277, 0.281, 0.29, 0.295, 0.302, 0.316, 0.323, 0.332, 0.339, 0.348, 0.358,
    0.368, 0.377, 0.386, 0.397, 0.404, 0.413];
  LETTER.forEach((d, i) => DRILLS.push({ name: String.fromCharCode(65 + i), d }));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  for (let k = 1; k <= 96; k++) { const g = gcd(k, 64), w = Math.floor(k / 64), r = k % 64; DRILLS.push({ name: (w ? w + (r ? ' ' : '') : '') + (r ? (r / gcd(r, 64)) + '/' + (64 / gcd(r, 64)) : ''), d: k / 64 }); void g; }
  for (let mm = 1; mm <= 20.001; mm += mm < 10 ? 0.1 : 0.5) DRILLS.push({ name: (+mm.toFixed(1)) + ' mm', d: +(mm / 25.4).toFixed(5), metric: true });
  DRILLS.sort((a, b) => a.d - b.d);
  // the standard drills nearest to d, below and above
  function nearDrills(d, metric) {
    const list = DRILLS.filter(x => (metric === undefined ? true : !!x.metric === metric));
    let lo = null, hi = null;
    for (const x of list) { if (x.d <= d + 1e-6) lo = x; else if (!hi) hi = x; }
    return { lo, hi };
  }
  // % of thread from the hole: UN/ISO 60° threads, full thread depth 0.6495 × pitch on the diameter (cut) or
  // 0.3248 for forming (the metal flows up, so the hole is larger)
  const threadPct = (t, hole, form) => ((t.major - hole) / ((form ? 0.68 : 1.299) * t.pitch)) * 100;
  const holeFor = (t, pct, form) => t.major - (form ? 0.68 : 1.299) * t.pitch * pct / 100;

  // ---------------------------------------------------------------- the calculation
  // radial chip thinning: below half the diameter the chip is thinner than the feed per tooth
  const rctf = (D, ae) => (ae > 0 && ae < D / 2 ? D / (2 * Math.sqrt(D * ae - ae * ae)) : 1);
  const DEFAULTS = {
    tool: 'endmill', mat: 'a36', toolMat: 'carbide', D: '0.5', Z: '4', op: 'hem', ae: '', ap: '', loc: '1.25', stick: '1.5',
    bore: '1', pre: '', hmode: 'helix', ramp: '', finish: false, angle: '45', maxap: '0.3', coating: 'auto', taper: '3', tip: 'square', tipR: '',
    thin: true, lead: '', insertZ: '', thread: '1/4-20', tapType: 'cut', pct: '', depth: '', point: '135',
    sfm: '', fz: '', rpm: '', feed: '',
    maxRpm: '12000', hp: '25', maxFeed: '1000', tapRpm: '2000', eff: '80',
  };
  function calc(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const M = MATERIALS[c.mat] || MATERIALS.a36, tool = TOOLS[c.tool] ? c.tool : 'endmill';
    const W = [], how = [];
    const machine = { maxRpm: Math.max(1, num(c.maxRpm, 12000)), hp: Math.max(0.1, num(c.hp, 25)), maxFeed: Math.max(1, num(c.maxFeed, 1000)),
      tapRpm: Math.max(1, num(c.tapRpm, 2000)), eff: Math.min(1, Math.max(0.3, num(c.eff, 80) / 100)) };
    let D = Math.max(0.001, Math.abs(num(c.D, 0.5)));
    const r = { tool, toolName: TOOLS[tool], mat: c.mat, matName: M.name, D, machine, warnings: W, how };
    const hss = c.toolMat === 'hss' || c.toolMat === 'cobalt';
    // coating: a surface speed factor for solid tools (inserts carry their own grade)
    const group = GROUP[c.mat] || 'st', coating = COATINGS[c.coating] ? c.coating : 'auto';
    const solid = !(tool === 'feedmill' || tool === 'facemill' || tool === 'chamfer');
    const cf = solid ? COATINGS[coating].f[group] : 1;
    r.coating = solid ? coating : null; r.coatF = cf;
    if (solid && cf !== 1) how.push(COATINGS[coating].name + ' coating in ' + M.name + ': surface speed × ' + cf);
    if (solid && (coating === 'altin' || coating === 'tialn' || coating === 'alcrn') && group === 'al') W.push('Aluminium sticks to aluminium-based coatings (' + COATINGS[coating].name + '): use ZrN, TiB2, DLC, diamond or polished uncoated.');
    if (solid && (coating === 'dlc' || coating === 'diamond') && group !== 'al') W.push(COATINGS[coating].name + ' is for aluminium, brass and plastics: in ' + M.name + ' the heat breaks it down. Use AlTiN or AlCrN.');
    if (solid && coating !== 'auto') r.coatText = COATINGS[coating].full + (COATINGS[coating].aka ? ' · also sold as ' + COATINGS[coating].aka : '');
    if (solid && coating === 'tin' && !hss) W.push('TiN is an HSS-era coating; on carbide in ' + M.name + ' AlTiN or AlCrN run faster and last longer.');
    // spindle speed from surface speed at diameter d, capped at the machine (or the override)
    const speed = (sfmWant, d, cap, label) => {
      const want = sfmWant * SFM_RPM / d, over = num(c.rpm, 0);
      let rpm = over > 0 ? over : Math.min(want, cap);
      rpm = Math.round(rpm);
      if (!(over > 0) && want > cap) W.push((label || 'The speed') + ' wants ' + Math.round(want) + ' RPM; the ' + (cap === machine.tapRpm ? 'tapping limit' : 'spindle') + ' tops out at ' + Math.round(cap) + ', so it runs at ' + Math.round(rpm * d / SFM_RPM) + ' SFM.');
      return { rpm, want: Math.round(want), sfm: rpm * d / SFM_RPM };
    };
    const feedCap = (f, over) => {
      const o = num(over, 0);
      if (o > 0) return o;
      if (f > machine.maxFeed) { W.push('Feed ' + f.toFixed(1) + ' in/min is over the machine\'s ' + machine.maxFeed + '; capped.'); return machine.maxFeed; }
      return f;
    };
    const power = (mrr, rpm, sfm) => {
      const hpCut = mrr * M.hp, hpSp = hpCut / machine.eff;
      r.mrr = mrr; r.hpCut = hpCut; r.hp = hpSp; r.hpPct = hpSp / machine.hp * 100;
      r.torque = rpm > 0 ? hpCut * 5252 / rpm : 0;                  // ft·lb at the cutter
      r.force = sfm > 0 ? hpCut * 33000 / sfm : 0;                    // lbf, tangential
      if (r.hpPct > 80) W.push('Spindle power ' + hpSp.toFixed(1) + ' hp is ' + Math.round(r.hpPct) + '% of the machine\'s ' + machine.hp + ' hp. Take less, or check the spindle\'s power at ' + rpm + ' RPM (it is lower at low speed).');
    };

    if (tool === 'endmill' || tool === 'ball' || tool === 'taper') {
      const Z = Math.max(1, Math.round(num(c.Z, 4))), op = OPS[c.op] || OPS.hem, al = c.mat === 'al6061' || c.mat === 'brass';
      const loc = Math.max(0.01, num(c.loc, 2.5 * D)), stick = Math.max(0.01, num(c.stick, loc + 0.25));
      let ap = num(c.ap, 0) > 0 ? num(c.ap, 0) : Math.min(loc, D * (al && op.apAl ? op.apAl : op.ap));
      // a tapered tool is sized by its diameter halfway up the cut (stepover, chip, reach)
      const ta = Math.tan(Math.min(30, Math.max(0, num(c.taper, 3))) * PI / 180), Dr = tool === 'taper' ? D + ap * ta : D;
      // HEM: the deeper (and so the longer the reach), the lighter the stepover: 15% of D at 1×D deep, 7% past 3×D
      const hemAe = Math.min(0.15, Math.max(0.06, 0.15 - 0.035 * (ap / Dr - 1))) + (al ? 0.05 : 0);
      let ae = num(c.ae, 0) > 0 ? num(c.ae, 0) : c.op === 'finish' ? Math.min(0.012, Dr * 0.03) : c.op === 'hem' || !(c.op in OPS) ? Dr * hemAe : Dr * (al ? op.aeAl : op.ae);
      if (tool === 'ball') { if (!(num(c.ap, 0) > 0)) ap = Math.min(ap, D * 0.1); if (!(num(c.ae, 0) > 0)) ae = Math.min(ae, D * 0.1); }
      ae = Math.min(ae, Dr);
      // a ball cuts at a smaller diameter at shallow depth; a tapered tool is widest at the top of the cut
      const tipR = tool === 'taper' && c.tip === 'ball' ? Math.min(D / 2, num(c.tipR, 0) > 0 ? num(c.tipR, 0) : D / 2) : 0;
      let Deff = tool === 'ball' && ap < D / 2 ? 2 * Math.sqrt(ap * (D - ap)) : D;
      if (tool === 'taper') {
        Deff = tipR && ap < tipR * (1 - Math.sin(Math.atan(ta))) ? 2 * Math.sqrt(ap * (2 * tipR - ap)) : D + 2 * Math.max(0, ap - tipR) * ta;
        r.Dtop = Deff; r.Dmid = D + Math.max(0, ap - tipR) * ta; r.taper = Math.atan(ta) * 180 / PI; r.tipR = tipR;
      }
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.em.sfm * op.sfm * (hss ? 0.3 : 1) * cf;
      const S = speed(sfmBase, Deff, machine.maxRpm, 'The surface speed');
      const actual = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.em.k * Dr * op.k * (hss ? 0.8 : 1);
      const thin = c.thin ? rctf(tool === 'taper' ? r.Dmid : D, ae) * (tool === 'ball' ? D / Deff : 1) : 1;
      const fzProg = actual * thin;
      const feed = feedCap(S.rpm * Z * fzProg, c.feed);
      Object.assign(r, { Z, op: c.op in OPS ? c.op : 'hem', ae, ap, loc, stick, Deff, sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, fzActual: feed / (S.rpm * Z) / thin, fzProg: feed / (S.rpm * Z), thin, feed, ipr: feed / S.rpm });
      power(ae * ap * feed, S.rpm, S.sfm);
      // bending of the tool: a cantilever of the fluted core (about 0.8 D) under the tangential force
      // a taper's core grows along the flutes: take the section halfway up the stick-out
      const Dcore = tool === 'taper' ? D + stick * ta : D;
      const E = hss ? 30e6 : 90e6, I = PI * Math.pow(0.8 * Dcore, 4) / 64;
      r.deflection = r.force * Math.pow(Math.max(stick - ap / 2, 0.01), 3) / (3 * E * I);      // force at mid-depth of the cut
      if (tool === 'taper') {
        how.push('Tapered ' + r.taper.toFixed(1) + '° per side from Ø' + D + (tipR ? ' (ball tip R' + tipR.toFixed(4) + ')' : '') + ': Ø' + Deff.toFixed(4) + ' at the top of the cut, so the RPM comes from there to keep the surface speed');
        if (Deff > D * 1.8) W.push('The cut is ' + (Deff / D).toFixed(1) + '× the tip diameter at the top: the tip runs at only ' + Math.round(S.sfm * D / Deff) + ' SFM. Fine for finishing walls; for roughing, a straight tool is faster.');
      }
      how.push('RPM = SFM × 3.82 ÷ ' + (tool === 'ball' && Deff < D ? 'effective D ' + Deff.toFixed(4) : 'D') + ' = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + Deff.toFixed(4) + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      if (thin > 1.0001) how.push('Chip thinning at ' + ae.toFixed(4) + ' stepover' + (tool === 'ball' && Deff < D ? ' and ' + ap.toFixed(4) + ' depth' : '') + ': × ' + thin.toFixed(2) + ', so ' + actual.toFixed(4) + ' real chip is programmed as ' + fzProg.toFixed(4) + ' per tooth');
      how.push('Feed = RPM × flutes × chip = ' + S.rpm + ' × ' + Z + ' × ' + (feed / (S.rpm * Z)).toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min');
      how.push('Removal = stepover × depth × feed = ' + ae.toFixed(4) + ' × ' + ap.toFixed(4) + ' × ' + feed.toFixed(1) + ' = ' + r.mrr.toFixed(2) + ' in³/min');
      if (ap > loc + 1e-9) W.push('Depth ' + ap.toFixed(3) + ' is deeper than the flutes (' + loc + ').');
      if (stick > 4 * (tool === 'taper' ? D + stick * ta : D)) W.push('Stick-out ' + stick + ' is over 4× the diameter; drop the chip load or the stepover, or use a shorter holder.');
      if (r.deflection > 0.001) W.push('The tool bends about ' + r.deflection.toFixed(4) + ' in under this cut. Over 0.001 hurts finish and tool life: shorten the stick-out or lighten the cut.');
      if (c.op === 'hem' && ae > 0.2 * Dr) W.push('A stepover of ' + (ae / Dr * 100).toFixed(0) + '% of D is heavy for HEM (usually 5–15%, up to 20% in aluminium).');
      if (c.op === 'slot' && ap > (al ? 1 : 0.5) * D + 1e-9) W.push('Slotting deeper than ' + (al ? '1×' : '0.5×') + ' D in this material is hard on the tool; take it in levels or use HEM (trochoidal).');
      if (thin > 3 && c.op !== 'finish') W.push('Chip thinning raises the feed ' + thin.toFixed(1) + '× at this light stepover; check ' + r.fzProg.toFixed(4) + ' per tooth against the tool maker\'s maximum.');
      if (c.op === 'finish') {
        how.push('Finish: ' + ae.toFixed(4) + ' stock on the wall at full depth, ' + Math.round(op.sfm * 100 - 100) + '% faster surface speed and a light chip. Spring pass: the same path again with no offset change, at the same speed and feed, to take off what the tool sprang away from.');
        if (ae > 0.02) W.push('Finish stock ' + ae.toFixed(3) + ' is heavy for a finish pass at ' + (ap / D).toFixed(1) + '× D deep; 0.010–0.015 per side (0.006–0.008 if the wall comes out tapered).');
      }
      if (ap > 2.5 * Dr && c.op !== 'finish') W.push('Chatter at ' + (ap / Dr).toFixed(1) + '× D deep: first drop the stepover to about 5% of D (0.035–0.040 on a 3/4 tool) keeping the chip load, then try 10–15% more or less RPM, and if it still sings take the depth in two levels. Use a shrink-fit or hydraulic holder with the least stick-out.');
    } else if (tool === 'helix') {
      // helical interpolation into a hole (or circular interpolation at full depth from a pre-drilled hole)
      const Z = Math.max(1, Math.round(num(c.Z, 4))), al = c.mat === 'al6061' || c.mat === 'brass';
      const Dh = Math.max(0.001, num(c.bore, 1)), depth = Math.max(0, num(c.depth, D)), pre = Math.max(0, num(c.pre, 0));
      const loc = Math.max(0.01, num(c.loc, 2.5 * D)), stick = Math.max(0.01, num(c.stick, loc + 0.25));
      const Dc = Dh - D, circle = c.hmode === 'circle', fin = !!c.finish, solid = !(pre > 0);
      r.bore = Dh; r.Dc = Dc; r.pre = pre; r.depth = depth; r.hmode = circle ? 'circle' : 'helix'; r.Z = Z; r.loc = loc; r.stick = stick;
      if (Dc <= 0) { W.push('The tool (' + D + ') is as big as the hole (' + Dh + '): use a smaller tool or drill it.'); Object.assign(r, { rpm: 0, feed: 0, sfm: 0, ipr: 0 }); return r; }
      if (circle && solid) W.push('Circular interpolation at full depth needs a pre-drilled or roughed hole; enter its diameter (or use Helix down).');
      // radial cut: into solid the tool takes the whole hole; from a pre-hole, the stock on the side. Round an inside
      // arc the tool is wrapped in more of the cut than a straight wall at the same stock.
      const stock = solid ? Math.min(D, Dh / 2) : Math.max(0, (Dh - pre) / 2);
      const aeEff = Math.min(D, solid ? D : stock * (Dh - stock) / Dc);
      const heavy = aeEff >= D * 0.5;
      const sf = fin ? 1.13 : heavy ? 0.78 : 1, kf = fin ? 0.35 : heavy ? 0.8 : 1;
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.em.sfm * sf * (hss ? 0.3 : 1) * cf;
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const actual = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.em.k * D * kf * (hss ? 0.8 : 1);
      const thin = c.thin ? rctf(D, aeEff) : 1;
      const edge = S.rpm * Z * actual * thin;                        // feed at the cutting edge
      const center = feedCap(edge * Dc / Dh, c.feed);                // what the program feeds: the tool centre
      const ramp = Math.min(10, Math.max(0.2, num(c.ramp, 0) > 0 ? num(c.ramp, 0) : al ? 3 : c.mat === 'ss304' || c.mat === 'ti64' || c.mat === 'tool' ? 1 : 1.5));
      const pitch = circle ? 0 : Math.min(PI * Dc * Math.tan(ramp * PI / 180), D * 0.1);
      const revs = circle ? 1 : pitch > 0 ? depth / pitch : 0;
      const lap = PI * Dc, minutes = (revs + 1) * lap / Math.max(center, 1e-6);
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, feed: center, ipr: center / S.rpm, edgeFeed: center * Dh / Dc, edgeIpr: center * Dh / Dc / S.rpm,
        fzProg: center * Dh / Dc / (S.rpm * Z), fzActual: center * Dh / Dc / (S.rpm * Z) / thin, thin, ae: stock, aeEff, ap: circle ? depth : pitch, pitch, ramp: circle ? 0 : Math.atan(pitch / lap) * 180 / PI, revs, minutes, finish: fin });
      const vol = PI / 4 * (Dh * Dh - pre * pre) * depth;
      power(minutes > 0 ? vol / minutes : 0, S.rpm, S.sfm);
      const E = hss ? 30e6 : 90e6, I = PI * Math.pow(0.8 * D, 4) / 64;
      r.deflection = r.force * Math.pow(Math.max(stick - (circle ? depth / 2 : 0), 0.01), 3) / (3 * E * I);
      how.push('Tool centre path Ø = hole − tool = ' + Dh + ' − ' + D + ' = ' + Dc.toFixed(4));
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : '') + (heavy && !fin ? ' (slower: the tool is ' + (solid ? 'in solid, nearly full width' : 'deep in the cut') + ')' : ''));
      how.push('Feed at the cutting edge = RPM × flutes × chip = ' + S.rpm + ' × ' + Z + ' × ' + r.fzProg.toFixed(4) + ' = ' + r.edgeFeed.toFixed(1) + ' in/min' + (thin > 1.0001 ? ' (chip thinning × ' + thin.toFixed(2) + ' on ' + aeEff.toFixed(4) + ' effective stepover)' : ''));
      how.push('Programmed feed (tool centre) = edge feed × path Ø ÷ hole Ø = ' + r.edgeFeed.toFixed(1) + ' × ' + Dc.toFixed(4) + ' ÷ ' + Dh + ' = ' + center.toFixed(1) + ' in/min = ' + r.ipr.toFixed(4) + ' in/rev. Program this unless the control corrects arc feeds itself (then program the edge feed).');
      if (!circle) how.push('Step down per turn = π × path Ø × tan(ramp ' + ramp + '°) = ' + pitch.toFixed(4) + '; ' + revs.toFixed(0) + ' turns to ' + depth + ' deep, plus a flat turn at the bottom, about ' + (minutes).toFixed(1) + ' min');
      else how.push('One turn at full depth ' + depth + ', ' + (lap / center).toFixed(2) + ' min' + (fin ? '; spring pass: the same turn again at the same speed and feed' : ''));
      if (solid && Dh > 2 * D) W.push('The hole is more than twice the tool: helixing into solid leaves a core Ø' + (Dh - 2 * D).toFixed(3) + ' in the middle. Drill it first, or step out in rings.');
      if (solid && !circle) W.push('Into solid the tool cuts on its end: it must be centre-cutting. At ' + (depth / Dh).toFixed(1) + '× the hole deep chips pack: blow or flood them out, or drill first (' + (Dh - D * 0.3).toFixed(3) + ' or so) and circular-interpolate to size, which is usually quicker.');
      if ((circle ? depth : 0) > loc + 1e-9) W.push('Depth ' + depth + ' is deeper than the flutes (' + loc + ').');
      if (r.deflection > 0.001) W.push('The tool bends about ' + r.deflection.toFixed(4) + ' in: expect a tapered bore. Leave 0.006–0.008 per side for the finish, and take a spring pass.');
    } else if (tool === 'chamfer') {
      // indexable chamfer mill: D is the smallest diameter, the edge at `angle` from the axis, up to maxap deep
      const Z = Math.max(1, Math.round(num(c.Z, 3))), alpha = Math.min(80, Math.max(5, num(c.angle, 45))), maxap = Math.max(0.01, num(c.maxap, 0.3));
      const ap = num(c.ap, 0) > 0 ? num(c.ap, 0) : Math.min(maxap * 0.8, 0.25), ta = Math.tan(alpha * PI / 180);
      const chamferW = ap * ta, ae = num(c.ae, 0) > 0 ? num(c.ae, 0) : chamferW;
      const Davg = D + ap * ta, Dmax = D + 2 * ap * ta, kappa = 90 - alpha;
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.ind.sfm;
      const S = speed(sfmBase, Davg, machine.maxRpm, 'The surface speed');
      // the more of the edge in the cut, the lighter the chip
      const use = ap / maxap, fe = use <= 0.5 ? 0.85 : Math.max(0.6, 0.85 - 0.4 * (use - 0.5));
      const hex = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.ind.hex * fe;
      const thin = 1 / Math.sin(kappa * PI / 180);
      const feed = feedCap(S.rpm * Z * hex * thin, c.feed);
      Object.assign(r, { Z, alpha, maxap, ap, ae, Davg, Dmax, lead: kappa, sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, feed, ipr: feed / S.rpm, fzProg: feed / (S.rpm * Z), fzActual: feed / (S.rpm * Z) / thin, thin, shoulder: num(c.ae, 0) > chamferW + 1e-9 });
      power((r.shoulder ? ae * ap : ap * chamferW / 2) * feed, S.rpm, S.sfm);
      how.push('Diameter in the cut: ' + D + ' at the tip to ' + Dmax.toFixed(4) + ' at ' + ap + ' deep (edge ' + alpha + '° from the axis); RPM from the middle, ' + Davg.toFixed(4) + ': ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + Davg.toFixed(4) + ' = ' + S.want);
      how.push('Chip ' + hex.toFixed(4) + (fe < 0.85 ? ' (lighter: ' + Math.round(use * 100) + '% of the edge is in the cut)' : '') + ' ÷ sin(' + kappa + '°) = ' + r.fzProg.toFixed(4) + ' per tooth; feed = ' + S.rpm + ' × ' + Z + ' × ' + r.fzProg.toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min (' + r.ipr.toFixed(4) + ' in/rev)');
      if (ap > maxap + 1e-9) W.push('Depth ' + ap + ' is past the insert edge (' + maxap + ').');
      if (r.shoulder && use > 0.6) W.push('An angled shoulder with ' + Math.round(use * 100) + '% of the edge in the cut is loud (chatter): rough the bulk with an end mill leaving about 0.030 on the wall, or step down 0.150–0.200 instead; climb mill, keep the feed up (slowing makes it rub), and try 10–15% more or less RPM.');
      else if (r.shoulder && ae > 0.15) W.push('Wide shoulder cuts with a chamfer mill chatter easily: keep the width to 0.100–0.150 at a time.');
      how.push('For roughing, about 80% of the edge (' + (maxap * 0.8).toFixed(3) + ') leaves margin on the insert; the full edge (' + maxap + ') works but at a lighter chip.');
    } else if (tool === 'feedmill' || tool === 'facemill') {
      const Z = Math.max(1, Math.round(num(c.Z, tool === 'feedmill' ? 4 : 5)));
      const lead = Math.min(90, Math.max(5, num(c.lead, tool === 'feedmill' ? 15 : 45)));
      const ae = Math.min(D, num(c.ae, 0) > 0 ? num(c.ae, 0) : D * (tool === 'feedmill' ? 0.65 : 0.7));
      const ap = num(c.ap, 0) > 0 ? num(c.ap, 0) : tool === 'feedmill' ? Math.min(0.06, D * 0.04) : Math.min(0.1, D * 0.05);
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.ind.sfm * (tool === 'feedmill' ? 0.9 : 1);
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const hex = num(c.fz, 0) > 0 ? num(c.fz, 0) : M.ind.hex;
      // the chip is thinner by sin(lead angle); a light radial cut thins it further
      const axial = 1 / Math.sin(lead * PI / 180), radial = c.thin ? rctf(D, ae) : 1, thin = axial * radial;
      const feed = feedCap(S.rpm * Z * hex * thin, c.feed);
      Object.assign(r, { Z, lead, ae, ap, sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, fzActual: feed / (S.rpm * Z) / thin, fzProg: feed / (S.rpm * Z), thin, feed, ipr: feed / S.rpm });
      power(ae * ap * feed, S.rpm, S.sfm);
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Lead angle ' + lead + '°: the chip is thinner by sin ' + lead + '° = ' + Math.sin(lead * PI / 180).toFixed(3) + ', so ' + hex.toFixed(4) + ' chip is ' + (hex * axial).toFixed(4) + ' per tooth' + (radial > 1.0001 ? ', × ' + radial.toFixed(2) + ' for the light radial cut = ' + (hex * thin).toFixed(4) : ''));
      how.push('Feed = RPM × inserts × feed per tooth = ' + S.rpm + ' × ' + Z + ' × ' + r.fzProg.toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min');
      how.push('Removal = width × depth × feed = ' + ae.toFixed(3) + ' × ' + ap.toFixed(3) + ' × ' + feed.toFixed(1) + ' = ' + r.mrr.toFixed(2) + ' in³/min');
      if (tool === 'feedmill' && ap > D * 0.08) W.push('High-feed mills take shallow cuts; ' + ap.toFixed(3) + ' deep is more than most allow (check the insert\'s maximum, often 0.04–0.08).');
      if (tool === 'facemill' && ae > 0.8 * D) W.push('A face mill cutting ' + Math.round(ae / D * 100) + '% of its width: 60–75% is kinder to the inserts (enter and leave the cut thin).');
    } else if (tool === 'drill') {
      const carb = !hss, depth = Math.max(0, num(c.depth, 3 * D)), point = Math.min(180, Math.max(60, num(c.point, carb ? 135 : 118)));
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : (carb ? M.drill.sfm : M.drill.sfmHss * (c.toolMat === 'cobalt' ? 1.15 : 1)) * cf;
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const base = carb ? 0.0015 + 0.015 * D : 0.001 + 0.012 * D;
      const ipr = num(c.fz, 0) > 0 ? num(c.fz, 0) : Math.min(0.03, Math.max(0.0005, base * M.drill.fd));
      const feed = feedCap(S.rpm * ipr, c.feed);
      const ratio = depth / D, tip = D / 2 / Math.tan(point / 2 * PI / 180);
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, ipr: feed / S.rpm, fzProg: feed / S.rpm / 2, feed, depth, point, tip, ratio });
      power(PI * D * D / 4 * feed, S.rpm, S.sfm);
      r.peck = ratio <= (carb ? 5 : 3) ? 0 : ratio <= 8 ? D : D * 0.5;
      r.cycle = r.peck ? (carb ? 'G83 peck ' : 'G83 peck ') + r.peck.toFixed(3) : carb ? 'G81 (no peck)' : ratio > 2 ? 'G73 chip break' : 'G81';
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Feed per rev = (' + (carb ? '0.0015 + 0.015' : '0.001 + 0.012') + ' × D) × ' + M.drill.fd + ' for the material = ' + ipr.toFixed(4) + '; feed = ' + S.rpm + ' × ' + ipr.toFixed(4) + ' = ' + feed.toFixed(1) + ' in/min');
      how.push('Point ' + point + '° adds ' + tip.toFixed(4) + ' to the depth for the full diameter; hole ' + ratio.toFixed(1) + '× D deep');
      if (carb && ratio > 5) W.push('A hole ' + ratio.toFixed(1) + '× D deep: use a through-coolant drill (or a longer series, with a pilot hole) and peck.');
      if (!carb && ratio > 3) W.push('A hole ' + ratio.toFixed(1) + '× D deep with an HSS drill: peck to clear chips.');
    } else if (tool === 'tap') {
      const t = thread(c.thread) || THREADS['1/4-20'], form = c.tapType === 'form';
      D = t.major;
      r.D = D; r.thread = t;
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.tap.sfm * (form ? 1.25 : 1) * (c.toolMat === 'carbide' ? 2 : 1) * cf;
      const S = speed(sfmBase, D, Math.min(machine.tapRpm, machine.maxRpm), 'Tapping');
      const feed = S.rpm * t.pitch;
      const pct = num(c.pct, 0) > 0 ? num(c.pct, 0) : form ? 65 : 75;
      const hole = holeFor(t, pct, form), near = nearDrills(hole, !!t.metric);
      const pick = [near.lo, near.hi].filter(Boolean).map(x => ({ name: x.name, d: x.d, pct: threadPct(t, x.d, form) }));
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, feed, ipr: t.pitch, pitch: t.pitch, tpi: t.tpi, form, pct, hole, drills: pick, depth: num(c.depth, 0) });
      r.mrr = 0; r.hp = r.hpPct = r.torque = 0;
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D.toFixed(4) + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Feed = RPM × pitch = ' + S.rpm + ' × ' + t.pitch.toFixed(5) + ' = ' + feed.toFixed(2) + ' in/min (G84 F' + feed.toFixed(2) + ', or F' + t.pitch.toFixed(5) + ' per rev with G95)');
      how.push('Hole for ' + pct + '% thread (' + (form ? 'form tap: D − 0.68 × pitch × %' : 'cut tap: D − 1.299 × pitch × %') + ') = ' + hole.toFixed(4));
      if (form && !M.tap.form) W.push('Form taps are not advised in ' + M.name + '; use a cut tap.');
      if (!form && pct > 80) W.push(pct + '% thread is hard on cut taps and adds little strength; 65–75% is usual.');
    } else if (tool === 'reamer') {
      const sfmBase = num(c.sfm, 0) > 0 ? num(c.sfm, 0) : M.ream.sfm * (hss ? 0.35 : 1) * cf;
      const S = speed(sfmBase, D, machine.maxRpm, 'The surface speed');
      const ipr = num(c.fz, 0) > 0 ? num(c.fz, 0) : Math.min(0.04, M.ream.kr * D + 0.002);
      const feed = feedCap(S.rpm * ipr, c.feed);
      const stock = D <= 0.25 ? 0.008 : D <= 0.5 ? 0.012 : D <= 1 ? 0.016 : 0.025;
      const pre = nearDrills(D - stock, false);
      Object.assign(r, { sfm: S.sfm, rpm: S.rpm, rpmWant: S.want, ipr: feed / S.rpm, feed, stock, pre: pre.lo ? { name: pre.lo.name, d: pre.lo.d, left: D - pre.lo.d } : null });
      power(PI / 4 * (D * D - Math.pow(D - stock, 2)) * feed, S.rpm, S.sfm);
      how.push('RPM = SFM × 3.82 ÷ D = ' + Math.round(sfmBase) + ' × 3.82 ÷ ' + D + ' = ' + S.want + (S.want !== S.rpm ? ' (runs at ' + S.rpm + ')' : ''));
      how.push('Feed = ' + S.rpm + ' × ' + ipr.toFixed(4) + ' per rev = ' + feed.toFixed(1) + ' in/min; leave ' + stock.toFixed(3) + ' on the diameter for the reamer');
    }
    if (typeof r.rpm === 'number') r.rpm = Math.round(r.rpm);
    if (typeof r.feed === 'number') r.feed = +r.feed.toFixed(r.tool === 'tap' ? 3 : 1);
    return r;
  }

  // G-code lines for the result (what to put in the program)
  function gcode(r, cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {}), f = (v, d) => (+v).toFixed(d).replace(/0+$/, '').replace(/\.$/, '.');
    const L = ['S' + r.rpm + ' M3'];
    if (r.tool === 'drill') {
      const z = '-' + f(r.depth + r.tip, 4);
      L.push(r.peck ? 'G98 G83 X_ Y_ Z' + z + ' R0.1 Q' + f(r.peck, 4) + ' F' + f(r.feed, 1) : (r.cycle.indexOf('G73') === 0 ? 'G98 G73 X_ Y_ Z' + z + ' R0.1 Q' + f(Math.max(r.D, 0.05), 4) + ' F' + f(r.feed, 1) : 'G98 G81 X_ Y_ Z' + z + ' R0.1 F' + f(r.feed, 1)));
    } else if (r.tool === 'tap') {
      L[0] = 'S' + r.rpm;
      L.push('M29 S' + r.rpm + ' (rigid tapping, if the machine needs it)');
      L.push('G98 G84 X_ Y_ Z-' + f(Math.max(num(c.depth, 0), 0) || 0.5, 4) + ' R0.2 F' + f(r.feed, 3));
    } else if (r.tool === 'reamer') {
      L.push('G98 G85 X_ Y_ Z-_ R0.1 F' + f(r.feed, 1) + ' (feeds in and out)');
    } else if (r.tool === 'helix' && r.Dc > 0) {
      const R = f(r.Dc / 2, 4), F = f(r.feed, 1);
      L.push('(hole centre at X0 Y0; ' + (r.hmode === 'circle' ? 'one turn at full depth' : 'helix down ' + f(r.pitch, 4) + ' per turn') + '; F is at the tool centre)');
      L.push('G90 G0 X' + R + ' Y0');
      if (r.hmode === 'circle') {
        L.push('G0 Z0.1', 'G1 Z-' + f(r.depth, 4) + ' F' + F + ' (into the pre-drilled hole)', 'G3 X' + R + ' Y0 I-' + R + ' J0 F' + F);
        if (r.finish) L.push('G3 X' + R + ' Y0 I-' + R + ' J0 (spring pass)');
      } else {
        L.push('G0 Z0.05', '#100=0.05', 'WHILE[#100GT-' + f(r.depth, 4) + ']DO1', '#100=#100-' + f(r.pitch, 4), 'IF[#100LT-' + f(r.depth, 4) + ']THEN#100=-' + f(r.depth, 4),
          'G3 X' + R + ' Y0 I-' + R + ' J0 Z#100 F' + F, 'END1', 'G3 X' + R + ' Y0 I-' + R + ' J0 (flat turn at the bottom)');
      }
      L.push('G1 X0 Y0', 'G0 Z1.');
    } else L.push('G1 ... F' + f(r.feed, 1));
    return L;
  }

  const api = { calc, gcode, MATERIALS, COATINGS, GROUP, TOOLS, OPS, THREADS, thread, DRILLS, nearDrills, threadPct, holeFor, rctf, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FEEDS = api;
})(this);
