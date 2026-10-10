// Compare the editor's cycle times with a Smooth control's own estimates, unit by unit and tool line by tool line.
// The control writes its estimate of every program it has checked to MC_sdg/cutest/<name>.ebd (16-byte header, u32 @0 =
// records of the latest run; 96-byte records: ms @20, UNo @68, unit code @70) and actual run times to cutres/*.rbd
// (0.1 s). Programs are matched by name; only those whose unit numbers and codes match the estimate are used.
//
// usage: node tools/calibrate_mill.js <backup folder (with MC_sdg/cutest, m8ysram)> <program folder> [more program folders]
//        env RAPID (in/min, default 1000) and ACCEL (in/s², default 80). Writes rows.json, progs.json, tools.json next
//        to this script's output folder (OUT, default the current folder) and prints a summary.
const fs = require('fs'), path = require('path');
const E = require('path').join(__dirname, '../src/');
const Maz = require(E + 'core.js'); Maz.useSchema(JSON.parse(fs.readFileSync(E + 'schema.json'))); global.Maz = Maz;
global.Plot = require(E + 'plot.js'); const Paths = require(E + 'paths.js'); const G = require(E + 'gcode.js');
const X = process.argv[2], OUT = process.env.OUT || process.cwd();
if (!X) { console.log('usage: node tools/calibrate_mill.js <backup folder> <program folder> ...'); process.exit(1); }
const srcDirs = [X + '/MC_Machine Programs'].concat(process.argv.slice(3));
const mem = Maz.parseMachineMemory(new Uint8Array(fs.readFileSync(X + '/m8ysram')), 'm8ysram');
const mts = Maz.machineTools(mem), tf = Maz.toolFileEntries(mem);
const lab = new Map();
const toolDia = (p, ti, nom) => {
  let m = lab.get(p); if (!m) { m = new Map(); for (const t of Maz.programTools(p, 'inch')) for (const l of t.lines) m.set(l, t); lab.set(p, m); }
  const pt = m.get(ti); if (!pt) return nom;
  if (pt.type === 13) { const e = Maz.findToolFile(pt, tf); if (e) return (e.nom + e.min) / 2 / 25.4e6; }
  const r = Maz.checkTool(pt, mts); if (r.status === 'ok' && r.tools[0].dia > 0) return r.tools[0].dia / 25.4e6;
  return nom;
};
function ebd(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(0), out = [];
  for (let k = 0; k < n && 16 + (k + 1) * 96 <= b.length; k++) {
    const o = 16 + k * 96;
    out.push({ uno: b.readUInt16LE(o + 68), code: b.readUInt16LE(o + 70), ms: b.readUInt32LE(o + 20), ttype: b.readUInt16LE(o + 2), nom: b.readInt32LE(o + 12), w0: b.readUInt16LE(o) });
  }
  return out;
}
const rows = [], progs = [], toolRows = [];
let tried = 0, matched = 0;
for (const f of fs.readdirSync(X + '/MC_sdg/cutest')) {
  const name = f.replace(/\.[^.]*$/, '').toUpperCase(), recs = ebd(X + '/MC_sdg/cutest/' + f);
  if (!recs.length) continue;
  for (const d of srcDirs) {
    if (!fs.existsSync(d)) continue;
    const pf = fs.readdirSync(d).find(x => x.replace(/\.[^.]*$/, '').toUpperCase() === name && /\.(MAZ|PBM)$/i.test(x));
    if (!pf) continue;
    tried++;
    let p; try { p = Maz.parse(new Uint8Array(fs.readFileSync(d + '/' + pf)), pf); } catch (e) { continue; }
    const ls = Maz.lines(p), us = Maz.structure(p, ls), byNo = new Map(us.map(u => [Maz.number(p.recs[u.i]), u]));
    // same version: every estimate record's UNo exists with the same unit code
    if (!recs.every(r => byNo.get(r.uno) && byNo.get(r.uno).code === r.code)) continue;
    matched++;
    let r; try { r = Paths.program(p, 'inch', ls, undefined, { toolDia }); } catch (e) { continue; }
    const tm = G.times(r.moves, { units: 'inch', rapid: +(process.env.RAPID || 1000), accel: +(process.env.ACCEL || 80) });
    const ours = {}, oursCut = {}, tools = {};
    r.moves.forEach((m, i) => { const n = Maz.number(p.recs[us[m.unit].i]); ours[n] = (ours[n] || 0) + tm.each[i]; if (m.kind !== 'rapid') oursCut[n] = (oursCut[n] || 0) + tm.each[i]; if (m.toolRec >= 0 && m.kind !== 'rapid') (tools[n] = tools[n] || new Set()).add(m.toolRec); });
    // per tool line: our time by tool line (in the order the unit lists them) against the control's records of the unit in order
    const perTool = {};
    r.moves.forEach((m, i) => { if (m.toolRec >= 0) { const n = Maz.number(p.recs[us[m.unit].i]); (perTool[n] = perTool[n] || new Map()).set(m.toolRec, (perTool[n].get(m.toolRec) || 0) + tm.each[i]); } });
    const perStat = {};
    r.moves.forEach((m, i) => { if (m.toolRec < 0) return; const n = Maz.number(p.recs[us[m.unit].i]), k = n + ':' + m.toolRec, o = perStat[k] || (perStat[k] = { feed: 0, rapid: 0, nr: 0, nf: 0, dz: 0 });
      if (m.kind === 'rapid') { o.rapid += tm.each[i]; o.nr++; } else { o.feed += tm.each[i]; const pr = i ? r.moves[i - 1] : null; if (!pr || pr.kind === 'rapid') o.nf++; } });
    for (const u of us) {
      const uno = Maz.number(p.recs[u.i]), rs = recs.filter(x => x.uno === uno);
      const tls = u.seqs.filter(i => ls[i].lay && ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5);
      if (!rs.length || rs.length !== tls.length) continue;
      let holes = 0;
      for (const i of u.seqs) if (ls[i].sel.code === 0xc0) { try { holes += Plot.holes(p.recs[i], (r, o) => (r[o] | (r[o + 1] << 8) | (r[o + 2] << 16) | (r[o + 3] << 24)) * 1e-5).length; } catch (e) { } }
      const ur = p.recs[u.i];
      tls.forEach((ti, k) => toolRows.push({ holes, depth: ((ur[40] | (ur[41] << 8) | (ur[42] << 16) | (ur[43] << 24)) * 1e-5), rgh: p.recs[ti][15], hdep: ((p.recs[ti][44] | (p.recs[ti][45] << 8) | (p.recs[ti][46] << 16) | (p.recs[ti][47] << 24)) * 1e-5), per: ((p.recs[ti][56] | (p.recs[ti][57] << 8) | (p.recs[ti][58] << 16) | (p.recs[ti][59] << 24)) * 1e-5), prog: name, uno, uname: Maz.unitName(p.ctl, u.code), ttype: p.recs[ti][9], ctlType: rs[k].ttype, tname: Maz.TOOL_NAMES[p.recs[ti][9]] || p.recs[ti][9], ctl: rs[k].ms / 1000, ours: (perTool[uno] && perTool[uno].get(ti)) || 0, line: ti, st: perStat[uno + ':' + ti] || { feed: 0, rapid: 0, nr: 0, nf: 0 } }));
    }
    const agg = new Map();
    for (const x of recs) { const a = agg.get(x.uno) || { code: x.code, ms: 0, n: 0 }; a.ms += x.ms; a.n++; agg.set(x.uno, a); }
    for (const [uno, a] of agg) {
      const u = byNo.get(uno);
      const toolLines = u.seqs.filter(i => ls[i].lay && ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5).length;
      const figs = u.seqs.filter(i => ls[i].lay && (ls[i].sel.code === 0xc0 || ls[i].sel.code === 0xc2 || ls[i].sel.code === 0xa1 || ls[i].sel.code === 0xa2)).length;
      rows.push({ prog: name, src: path.basename(d), uno, code: a.code, uname: Maz.unitName(p.ctl, a.code), ctl: a.ms / 1000, nrec: a.n, ours: ours[uno] || 0, oursCut: oursCut[uno] || 0, toolLines, usedTools: tools[uno] ? tools[uno].size : 0, figs });
    }
    progs.push({ name, src: path.basename(d), ctl: recs.reduce((s, x) => s + x.ms, 0) / 1000, ours: tm.total });
    break;
  }
}
fs.writeFileSync(OUT + '/rows.json', JSON.stringify(rows));
fs.writeFileSync(OUT + '/progs.json', JSON.stringify(progs));
fs.writeFileSync(OUT + '/tools.json', JSON.stringify(toolRows));
console.log('estimate files tried with a program', tried, 'same version', matched, 'unit rows', rows.length);

// summary: per unit type and per tool type, control vs ours
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const by = {}; for (const t of toolRows) (by[t.tname] = by[t.tname] || []).push(t);
console.log('median error per tool line', (med(toolRows.map(t => Math.abs(t.ours - t.ctl) / Math.max(t.ctl, 1))) * 100).toFixed(0) + '%');
for (const [k, a] of Object.entries(by)) if (a.length >= 3) console.log('  ', String(k).padEnd(10), String(a.length).padStart(4), (med(a.map(t => Math.abs(t.ours - t.ctl) / Math.max(t.ctl, 1))) * 100).toFixed(0) + '%');
