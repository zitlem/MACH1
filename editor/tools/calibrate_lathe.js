// Compare lathe / mill-turn unit times with the control's own estimates (see calibrate_mill.js for the file format).
// usage: node tools/calibrate_lathe.js <machine folder> [more machine folders]   (each with MC_sdg/cutest and MC_Machine Programs)
const fs = require('fs');
const E = require('path').join(__dirname, '../src/');
const Maz = require(E + 'core.js'); Maz.useSchema(JSON.parse(fs.readFileSync(E + 'schema.json'))); global.Maz = Maz;
global.Plot = require(E + 'plot.js'); const Paths = require(E + 'paths.js'); const G = require(E + 'gcode.js');
const rows = [];
for (const m of process.argv.slice(2)) {
  const dir = m + '/MC_sdg/cutest', pd = m + '/MC_Machine Programs';
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const b = fs.readFileSync(dir + '/' + f), n = b.readUInt32LE(0), recs = [];
    for (let k = 0; k < n && 16 + (k + 1) * 96 <= b.length; k++) { const o = 16 + k * 96; recs.push({ uno: b.readUInt16LE(o + 68), code: b.readUInt16LE(o + 70), ms: b.readUInt32LE(o + 20) }); }
    const name = f.replace(/\.[^.]*$/, '').toUpperCase();
    const pf = fs.existsSync(pd) && fs.readdirSync(pd).find(x => x.replace(/\.[^.]*$/, '').toUpperCase() === name && /\.(MTP|MPR|MAZ)$/i.test(x));
    if (!pf || !recs.length) continue;
    let p; try { p = Maz.parse(new Uint8Array(fs.readFileSync(pd + '/' + pf)), pf); } catch (e) { continue; }
    const ls = Maz.lines(p), us = Maz.structure(p, ls), byNo = new Map(us.map(u => [Maz.number(p.recs[u.i]), u]));
    if (!recs.every(r => byNo.get(r.uno) && byNo.get(r.uno).code === r.code)) continue;
    const views = Maz.CONTROLS[p.ctl].type === 'millturn' ? ['turn', 'mill'] : [undefined];
    const ours = {};
    for (const v of views) {
      let r; try { r = Paths.program(p, 'inch', ls, v); } catch (e) { continue; }
      const tm = G.times(r.moves, { units: 'inch', accel: 80 });
      r.moves.forEach((mv, i) => { const no = Maz.number(p.recs[us[mv.unit].i]); ours[no] = (ours[no] || 0) + tm.each[i]; });
    }
    const agg = new Map();
    for (const x of recs) { const a = agg.get(x.uno) || { code: x.code, ms: 0, n: 0 }; a.ms += x.ms; a.n++; agg.set(x.uno, a); }
    for (const [uno, a] of agg) rows.push({ m, prog: name, uno, uname: Maz.unitName(p.ctl, a.code), ctl: a.ms / 1000, ours: ours[uno] || 0, n: a.n });
  }
}
fs.writeFileSync((process.env.OUT || process.cwd()) + '/lathe.json', JSON.stringify(rows));
const by = {}; for (const r of rows) (by[r.uname] = by[r.uname] || []).push(r);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
console.log('rows', rows.length, 'programs', new Set(rows.map(r => r.m + r.prog)).size);
for (const [k, a] of Object.entries(by).sort((x, y) => y[1].length - x[1].length))
  console.log(k.padEnd(10), String(a.length).padStart(3), 'ctl', a.reduce((s, r) => s + r.ctl, 0).toFixed(0).padStart(6), 'ours', a.reduce((s, r) => s + r.ours, 0).toFixed(0).padStart(6), 'med ratio', med(a.filter(r => r.ours > 0.5).map(r => r.ctl / r.ours)).toFixed(2));
