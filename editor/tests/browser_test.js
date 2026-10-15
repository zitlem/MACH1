// End-to-end test of the built editor in headless Chrome (DevTools protocol, no extra packages):
// open the sample programs, compare the print listing with MazEdit's own print lines, then edit with
// real key presses and check the stored bytes, undo, units, copy/paste, conversion and the plot.
//
// usage: node tests/browser_test.js [path/to/Mazatrol Editor.html] [screenshot dir]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// the shop's sample and customer programs live outside the repo (see datapaths.js)
const { KETS, KET, kp } = require('./datapaths.js');
const page = path.resolve(process.argv[2] || path.join(os.homedir(), 'Documents/GitHub/MACH1/apps/Mazatrol Editor.html'));
const shots = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'mazed-shots-'));
fs.mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'mazed-prof-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1500,950',
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { fixture } = require('./datapaths.js');
const FIX = fixture('print_lines.json') && fs.existsSync(fixture('print_lines.json')) ? JSON.parse(fs.readFileSync(fixture('print_lines.json'), 'utf8')) : {};

let failures = 0, passes = 0, MazEditor_n = 0;
const check = (name, cond, detail) => {
  if (cond) passes++;
  else { failures++; console.log('FAIL', name, detail !== undefined ? '\n   ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''); }
};

(async () => {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (e) { await sleep(200); } }
  const ws = new WebSocket(targets.find(x => x.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0;
  const pend = {}, errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + ': ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
    return r.result.result.value;
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, name), Buffer.from(r.result.data, 'base64'));
  };
  const key = async (k, extra = {}) => {
    const codes = { Enter: 13, Tab: 9, Delete: 46, Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Insert: 45, Escape: 27, Home: 36, End: 35 };
    const base = { key: k, code: k, windowsVirtualKeyCode: codes[k] || k.toUpperCase().charCodeAt(0), ...extra };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(30);
  };
  const type = async text => { await send('Input.insertText', { text }); await sleep(20); };
  const open = async (f, units) => {
    const b64 = fs.readFileSync(kp(f)).toString('base64');
    await ev(`(()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));MazEditor.openBytes(b,${JSON.stringify(path.basename(f))},null);` +
      (units ? `document.querySelector('[data-units="${units}"]').click();` : '') + '})()');
  };
  const rec = r => ev(`Array.from(MazEditor.doc().p.recs[${r}]).map(x=>x.toString(16).padStart(2,'0')).join('')`);

  await send('Runtime.enable');
  await send('Page.enable');
  // downloads the page makes (the Save-as test) go to the temp folder, not ~/Downloads
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: require('os').tmpdir() });
  await send('Page.navigate', { url: 'file://' + page });
  for (let i = 0; i < 60; i++) { await sleep(150); if (await ev('!!window.MazEditor').catch(() => false)) break; }

  // 0. files open view-only: nothing changes until Edit is on (Ctrl+E)
  {
    const f0 = Object.keys(FIX)[0];
    await open(f0, FIX[f0].units);
    const before = await ev('JSON.stringify(Array.from(MazEditor.doc().p.recs[2]))');
    const r = await ev(`(()=>{MazEditor.select(2);const d=MazEditor.doc();d.sel.c=MazEditor.ctx(d)[2].lay?0:-1;return MazEditor.enterValue('1');})()`);
    MazEditor_n = await ev('MazEditor.doc().p.recs.length');
    await ev('MazEditor.insertLine(); MazEditor.deleteSelection(); MazEditor.duplicateSelection()');
    check('view-only by default', !(await ev('MazEditor.editing()')) && /view only/.test(await ev(`document.getElementById('info').textContent`)) && (await ev('MazEditor.softKeys()')).includes('edit'));
    check('view-only blocks field entry', r === false && before === await ev('JSON.stringify(Array.from(MazEditor.doc().p.recs[2]))'));
    check('view-only blocks line and unit changes', MazEditor_n === await ev('MazEditor.doc().p.recs.length') && !(await ev('MazEditor.doc().dirty')));
    check('view-only says how to edit', /Ctrl\+E/.test(await ev(`document.querySelector('#msg').textContent`)));
    check('view-only: no editing soft keys, and they do nothing', await ev(`['line','delete','paste','dup','undo'].every(a => MazEditor.skOff(a) && !MazEditor.softKeys().includes(a))`));
    await key('e', { modifiers: 2 });
    check('Ctrl+E turns editing on', await ev('MazEditor.editing()') && !(await ev(`document.querySelector('#softkeys [data-sk="line"]').disabled`)) && (await ev('MazEditor.softKeys()')).includes('complete'));
    await key('e', { modifiers: 2 });
    check('Ctrl+E turns it off again', !(await ev('MazEditor.editing()')));
    await ev('MazEditor.setEditing(true)');
    await ev(`document.querySelector('[data-close="0"]').click()`);
    check('the view-only test file is closed again', (await ev('MazEditor.docs.length')) === 0);
  }

  // 1. print lines match MazEdit's print (every character MazEdit draws; our UNo/SNo and unit names are
  //    added in front). Mills must match exactly; lathe and mill-turn files report their share.
  for (const [f, fx] of Object.entries(FIX)) {
    await open(f, fx.units);
    const got = await ev(`(()=>{const d=MazEditor.doc();return MazEditor.ctx(d).map(L=>{const P=Maz.printLine(L,{units:d.units});return [P.ch.join(''),P.own.map(o=>o>=0?'1':'0').join('')];});})()`);
    let n = 0;
    const bad = [];
    fx.lines.forEach((want, k) => {
      if (want === null) return;
      n++;
      const [line, own] = got[k];
      for (let x = 0; x < Math.max(want.length, line.trimEnd().length); x++) {
        const w = want[x] || ' ', g = line[x] || ' ';
        if ((w !== ' ' && w !== g) || (w === ' ' && g !== ' ' && own[x] === '1')) { bad.push(`line ${k} col ${x}: want ${JSON.stringify(want)}\n     got  ${JSON.stringify(line.trimEnd())}`); break; }
      }
    });
    const mill = /\.PB[DM]$/i.test(f);
    if (mill) check('print lines match MazEdit: ' + f, !bad.length, bad.slice(0, 4).join('\n   '));
    else console.log(`   ${f}: ${n - bad.length}/${n} lines match MazEdit`);
    const text = await ev('MazEditor.listing(MazEditor.doc())');
    check('listing has title and lines: ' + f, /^MAZATROL PROGRAM/.test(text) && text.split('\n').length > fx.lines.length, text.slice(0, 80));
  }
  await ev('document.querySelectorAll("[data-close]").forEach(()=>{}); MazEditor.docs.length');
  check('no JS errors after opening', !errors.length, errors);

  // 2. screen of SAMPLE1.PBD (first tab)
  await ev(`document.querySelector('[data-tab="0"]').click()`);
  await sleep(100);
  await shot('testt.png');
  const screen = await ev(`Array.from(document.querySelectorAll('#lines .ln')).map(l=>l.textContent)`);
  check('screen shows MANL PRG and END', screen.some(l => /^ +1 MANL PRG/.test(l)) && screen.some(l => /^ +2 END/.test(l)), screen);
  check('screen numbers the common unit', screen.some(l => /^  0 ALY STL/.test(l)), screen.slice(0, 4));
  check('screen draws not-applicable as diamonds', screen.some(l => l.includes('◆')), screen);

  // guidance box on a Mazatrol MANL PRG line: the block's words explained
  await ev('MazEditor.select(2, 3)');
  const mg = await ev(`(() => { const b = document.getElementById('guide'); return { hidden: b.hidden, text: b.textContent }; })()`);
  check('MANL PRG line shows the guidance box', !mg.hidden && mg.text.length > 5, mg);
  await shot('manl-guide.png');

  // 3. edit with keys: go to MANL PRG line 1 DATA 1 value, type Y-1.25, Enter
  await ev('MazEditor.select(2, 3)');
  await ev('document.getElementById("input").focus()');
  await type('Y-1.25');
  await key('Enter');
  let h = await rec(2);
  check('typed Y-1.25 stored as address 34 and -125000', h.slice(16, 18) === '22' && h.slice(72, 80) === 'b817feff', h);
  const sel = await ev('JSON.stringify(MazEditor.doc().sel)');
  check('Enter advanced the cursor', JSON.parse(sel).c !== 3, sel);
  check('tab shows unsaved marker', await ev(`!!document.querySelector('.tab.cur .dirty')`));
  // undo / redo
  await key('z', { modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
  h = await rec(2);
  check('undo restores the line', h.slice(16, 18) === '21', h);
  await key('y', { modifiers: 2, key: 'y', code: 'KeyY', windowsVirtualKeyCode: 89 });
  h = await rec(2);
  check('redo re-applies', h.slice(16, 18) === '22', h);
  // soft keys: tool of the MANL PRG unit
  await ev('MazEditor.select(1, 1)');
  // the field's choices are the soft keys, ten to a page (▶ for more)
  const keys = await ev(`(() => { const out = []; for (let p = 0; p < 6; p++) { out.push(...Array.from(document.querySelectorAll('#softkeys .sk.choice')).map(b => b.textContent));
    const nx = document.querySelector('#softkeys [data-sknav="1"]'); if (nx.disabled) break; nx.click(); }
    while (!document.querySelector('#softkeys [data-sknav="-1"]').disabled && document.querySelector('#softkeys .sk.choice') && !Array.from(document.querySelectorAll('#softkeys .sk.choice')).some(b => b.textContent === 'DRILL')) document.querySelector('#softkeys [data-sknav="-1"]').click();
    return out; })()`);
  check('tool soft keys listed', keys.some(k => /DRILL/.test(k)) && keys.some(k => /E-MILL/.test(k)), keys);
  await ev(`Array.from(document.querySelectorAll('#softkeys .sk.choice')).find(b=>/DRILL$/.test(b.textContent)).click()`);
  h = await rec(1);
  check('soft key set the tool to DRILL', h.slice(18, 20) === '02', h);
  // clear a field with Delete
  await ev('MazEditor.select(1, 3); document.getElementById("input").focus()');
  await key('Delete');
  h = await rec(1);
  check('Delete cleared NOM-DIA and its entered bit', h.slice(72, 80) === '00000000' && (parseInt(h.slice(8, 10), 16) & 1) === 0, h);
  // bad input shows a message and changes nothing
  await ev('MazEditor.select(3, 14); document.getElementById("input").focus()');
  const before = await rec(3);
  await type('abc');
  await key('Enter');
  const msg = await ev(`document.getElementById('msg').textContent`);
  check('bad input gives a message', /number/i.test(msg), msg);
  check('bad input changes nothing', (await rec(3)) === before);
  await key('Escape');

  // 4. insert a DRILLING unit before END, insert a line, delete it, move, copy/paste a unit
  await ev('MazEditor.select(5)');                       // END
  await ev(`MazEditor.softKey('unit-menu')`);
  await ev(`document.querySelector('[data-unit="32"]').click()`);
  let codes = await ev(`MazEditor.doc().p.recs.map(r=>r[0]|(r[1]<<8)).map(c=>c.toString(16)).join(' ')`);
  check('DRILLING unit inserted before END', codes === '1 6 a1 a1 a1 20 b0 b0 c0 4', codes);
  const nums = await ev(`MazEditor.doc().p.recs.map(r=>r[2]|(r[3]<<8)).join(' ')`);
  check('units renumbered', nums === '0 1 1 2 3 2 1 2 1 3', nums);
  await ev('MazEditor.select(8)');                       // FIG 1 point
  await key('Insert');
  codes = await ev(`MazEditor.doc().p.recs.map(r=>r[0]|(r[1]<<8)).map(c=>c.toString(16)).join(' ')`);
  check('Insert adds a point line', codes === '1 6 a1 a1 a1 20 b0 b0 c0 c0 4', codes);
  // type X/Y of the new point
  await ev('MazEditor.select(9, 2); document.getElementById("input").focus()');
  await type('1.5'); await key('Tab'); await type('2.25'); await key('Enter');
  h = await rec(9);
  check('point X1.5 Y2.25 stored', h.slice(80, 88) === 'f0490200' && h.slice(88, 96) === 'e86e0300', h);
  await key('Delete', { modifiers: 2 });
  codes = await ev(`MazEditor.doc().p.recs.map(r=>r[0]|(r[1]<<8)).map(c=>c.toString(16)).join(' ')`);
  check('Ctrl+Del deletes the line', codes === '1 6 a1 a1 a1 20 b0 b0 c0 4', codes);
  await ev('MazEditor.select(5)');                       // DRILLING unit line
  await ev('MazEditor.copySelection()');
  await ev('MazEditor.paste()');
  codes = await ev(`MazEditor.doc().p.recs.map(r=>r[0]|(r[1]<<8)).map(c=>c.toString(16)).join(' ')`);
  check('copy/paste a unit', codes === '1 6 a1 a1 a1 20 b0 b0 c0 20 b0 b0 c0 4', codes);
  await ev('MazEditor.select(9)');
  await ev('MazEditor.moveSelection(-1)');
  codes = await ev(`MazEditor.doc().p.recs.map(r=>r[0]|(r[1]<<8)).map(c=>c.toString(16)).join(' ')`);
  check('move a unit up past the previous unit', codes === '1 6 a1 a1 a1 20 b0 b0 c0 20 b0 b0 c0 4' && (await ev('MazEditor.doc().sel.r')) === 5, codes);
  await ev('MazEditor.select(3)');
  await ev('MazEditor.moveSelection(1)');
  const m1 = await ev(`MazEditor.doc().p.recs.slice(2,5).map(r=>r[2]).join(' ')`);
  check('move a MANL PRG line down keeps numbering', m1 === '1 2 3', m1);
  await shot('edited.png');

  // 5. units toggle changes the display only
  await ev(`document.querySelector('[data-units="metric"]').click()`);
  const lm = await ev(`document.querySelector('#lines .ln[data-r="0"]').textContent`);
  check('metric display of common unit', /100\./.test(lm), lm);
  await ev(`document.querySelector('[data-units="inch"]').click()`);

  // 6. conversion: SAMPLE1.PBD saved as Smooth equals SAMPLE1.PBM (fresh copy of the file)
  await open('SAMPLE1.PBD');
  await ev('window.showSaveFilePicker = undefined');   // headless Chrome cancels pickers; use the download path
  await ev(`MazEditor.saveAs('SmoothM')`);
  await sleep(300);
  const conv = await ev(`(()=>{const d=MazEditor.doc();return d.p.name+' '+Array.from(Maz.serialize(d.p)).map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
  const want = 'SAMPLE1.PBM ' + fs.readFileSync(kp('SAMPLE1.PBM')).toString('hex');
  check('Save as Smooth converts SAMPLE1.PBD to SAMPLE1.PBM', conv === want, conv.slice(0, 40));

  // 7. plot of GP-PART7
  await ev(`document.querySelector('[data-tab="2"]').click()`);
  await ev(`MazEditor.softKey('plot')`);
  await sleep(200);
  const plot = await ev(`({lines: MazEditor.plotStats().lines, holes: MazEditor.plotStats().holes, info: document.getElementById('plotInfo').textContent})`);
  check('plot draws shapes and holes', plot.lines >= 30 && plot.holes >= 8, plot);
  // other sides: the front view shows the shapes' heights and the holes' depths; 3D turns by dragging
  const face = async a => {
    await ev(`document.querySelector('[data-ang="${a}"]').click()`);
    await sleep(120);
    return ev(`({lines: MazEditor.plotStats().lines, holes: MazEditor.plotStats().holes,
      axes: MazEditor.plotStats().axes, box: MazEditor.plotStats().box,
      info: document.getElementById('plotInfo').textContent, on: document.querySelector('#angSeg .on') && document.querySelector('#angSeg .on').dataset.ang})`);
  };
  check('plot offers top, front, right and 3D for a mill', await ev(`!document.getElementById('angSeg').hidden && document.querySelectorAll('#angSeg button').length === 4`));
  const top = await face('top'), front = await face('front'), right = await face('right'), iso = await face('iso');
  check('the plot shows the Z range of the program and its cutter paths', /Z -1\.1808 … 0\.13 in/.test(top.info), top.info);
  check('side views draw heights: stock tops, side edges and hole depths', front.lines > top.lines + 30 && front.axes === 3 && front.on === 'front', [top.lines, front.lines, front.axes]);
  check('each view looks at the part from its side', new Set([top.box, front.box, right.box, iso.box]).size === 4, [top.box, front.box, right.box, iso.box]);
  const b = await ev(`(() => { const r = document.getElementById('plot').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b[0], y: b[1], button: 'left', clickCount: 1 });
  for (let k = 1; k <= 6; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b[0] + k * 12, y: b[1] - k * 5, button: 'left', buttons: 1 }); await sleep(20); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b[0] + 72, y: b[1] - 30, button: 'left', clickCount: 1 });
  await sleep(150);
  const turned = await ev(`MazEditor.doc().ang`);
  check('dragging turns the 3D view', turned.name === 'free' && Math.abs(turned.yaw - (-45 - 36)) < 2 && Math.abs(turned.pitch - (35.264 - 15)) < 2, turned);
  await shot('plot3d.png');
  // the view cube: click a face for that view, a corner for a 3D view from that corner
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(150);
  };
  const cubeAt = async pick => ev(`(() => { const c = MazEditor.cube(), r = document.getElementById('plot').getBoundingClientRect(); ${pick} })()`);
  await face('iso');
  const isoFaces = await ev(`MazEditor.cube().faces.map(f => f.name).sort().join()`);
  check('the 3D view cube shows the top, front and right faces', isoFaces === 'front,right,top', isoFaces);
  let p = await cubeAt(`const f = c.faces.find(f => f.name === 'right'); return [r.left + f.pts.reduce((a, q) => a + q[0], 0) / 4, r.top + f.pts.reduce((a, q) => a + q[1], 0) / 4];`);
  await click(p[0], p[1]);
  check('clicking the cube\'s RIGHT face shows the right view', (await ev('MazEditor.doc().ang.name')) === 'right' && (await ev(`document.querySelector('#angSeg .on').dataset.ang`)) === 'right');
  p = await cubeAt(`const k = c.corners.reduce((a, k) => (k.x - k.y > a.x - a.y ? k : a)); return [r.left + k.x, r.top + k.y];`);
  await click(p[0], p[1]);
  const corner = await ev('MazEditor.doc().ang');
  check('clicking a cube corner turns to a 3D view from it', Math.abs(Math.abs(corner.pitch) - 35.264) < 0.01 && corner.name !== 'right', corner);
  p = await cubeAt(`const f = c.faces.find(f => f.name === 'top'); return f ? [r.left + f.pts.reduce((a, q) => a + q[0], 0) / 4, r.top + f.pts.reduce((a, q) => a + q[1], 0) / 4] : null;`);
  if (p) await click(p[0], p[1]);
  check('clicking TOP on the cube gives the flat top view', (await ev('MazEditor.doc().ang.name')) === 'top' && (await ev('MazEditor.cube().faces.map(f => f.name).join()')) === 'top');
  await face('top');
  await ev('MazEditor.select(30)');
  await shot('plot.png');
  // lathe program: screen and turning-shape plot
  await ev(`document.querySelector('[data-tab="4"]').click()`);
  await sleep(200);
  const lplot = await ev(`({name: MazEditor.doc().p.name, lines: MazEditor.plotStats().lines, info: document.getElementById('plotInfo').textContent})`);
  check('lathe plot draws the turning shapes', /LATHEPART/.test(lplot.name) && lplot.lines >= 2, lplot);
  check('lathe plot has no turning/milling switch', await ev(`getComputedStyle(document.getElementById('viewSeg')).display === 'none'`));
  await ev('MazEditor.select(3)');
  await shot('lathe.png');
  // mill-turn program: milling and turning views of the plot
  await ev(`document.querySelector('[data-tab="5"]').click()`);
  await sleep(200);
  check('mill-turn plot offers turning and milling views', await ev(`!document.getElementById('viewSeg').hidden`));
  await shot('millturn.png');
  await ev(`document.querySelector('[data-view="turn"]').click()`);
  await sleep(150);
  const iplot = await ev(`({lines: MazEditor.plotStats().lines, info: document.getElementById('plotInfo').textContent})`);
  check('mill-turn turning view draws the turning shapes', iplot.lines >= 10 && /diameter/.test(iplot.info), iplot);
  await shot('millturn_turn.png');
  // 8. tool data: open, read MazEdit's layouts, edit a field, undo
  await open('SLN/Samples/Matrix Mill ToolData INCH/TOOLDATA.DBD', 'inch');
  const td = await ev(`(()=>{const d=MazEditor.doc();const ls=MazEditor.ctx(d);return {tool: d.t && d.t.tool, lines: ls.length, recs: d.t.recs.length,
    screen: Array.from(document.querySelectorAll('#lines .ln')).slice(0, 12).map(l=>l.textContent)}})()`);
  check('tool data opens as a tool document', td.tool === 'TOOLDATA' && td.recs === 700 && td.lines === 70, td);   // 35 tools, 2 pages
  check('tool data shows MazEdit headings and tools', td.screen.some(l => /Tool Data \(1\)/.test(l)) && td.screen.some(l => /TNo\./.test(l)), td.screen);
  const l2 = await ev(`MazEditor.ctx(MazEditor.doc()).findIndex(L=>L.sel.block===1)`);
  await ev(`MazEditor.select(${l2}, 7); document.getElementById('input').focus()`);     // Length of the first tool
  const tdBefore = await ev(`Array.from(MazEditor.doc().t.recs[0].slice(28, 32))`);
  await type('6.5'); await key('Enter');
  const after = await ev(`({bytes: Array.from(MazEditor.doc().t.recs[0].slice(28, 32)), line: document.querySelector('#lines .ln[data-r="${l2}"]').textContent, msg: document.getElementById('msg').textContent})`);
  const nm = Buffer.from(after.bytes).readInt32LE(0);
  check('tool length typed in inch is stored in nanometres', nm === 165100000, after);
  check('program-only buttons are disabled for tool data', await ev(`MazEditor.skOff('line') && MazEditor.skOff('unit-menu')`));
  await shot('tooldata.png');
  await key('z', { modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
  const undone = await ev(`Array.from(MazEditor.doc().t.recs[0].slice(28, 32))`);
  check('undo restores the tool record', JSON.stringify(undone) === JSON.stringify(tdBefore), undone);
  const saved = await ev(`(()=>{const d=MazEditor.doc();return Array.from(Maz.serializeToolFile(d.t)).map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
  check('unchanged tool data saves byte for byte', saved === fs.readFileSync(kp('SLN/Samples/Matrix Mill ToolData INCH/TOOLDATA.DBD')).toString('hex'));
  await open('SLN/Samples/Matrix Mill ToolData INCH/TOOLFILE.DBD', 'inch');
  const tf = await ev(`Array.from(document.querySelectorAll('#lines .ln')).slice(0, 6).map(l=>l.textContent)`);
  check('tool file shows its heading and tools', tf.some(l => /Nom-Dia/.test(l)) && tf.some(l => /E-MILL/.test(l)), tf);
  await shot('toolfile.png');
  // 8b. TPC bits: a TPC value shown and set bit by bit, with notes kept per field
  await open('samplemazak/cnc/LATHE SMOOTHG/BB-87-0.PBP', 'inch');
  if (!(await ev(`MazEditor.skOn('tpcLines')`))) await ev(`MazEditor.softKey('tpcLines')`);
  await ev(`MazEditor.select(16, 12)`);                          // BAR TPC (0xf5), the parameter at byte 8
  const bitsBtn = await ev(`!!document.querySelector('#keys .bitsBtn')`);
  check('a TPC field offers a bits dialog', bitsBtn);
  const before8 = await ev(`MazEditor.doc().p.recs[16][8] | (MazEditor.doc().p.recs[16][9] << 8)`);
  await ev(`document.querySelector('#keys .bitsBtn').click()`);
  const dlg = await ev(`({open: document.getElementById('bitsDlg').open, title: document.getElementById('bitsTitle').textContent, rows: document.querySelectorAll('#bitsRows tr').length, val: document.getElementById('bitsVal').textContent})`);
  check('the bits dialog shows the field and its 16 bits', dlg.open && dlg.rows === 16 && +dlg.val === before8 && /byte 8/.test(dlg.title), dlg);
  await ev(`(() => { const c = document.querySelector('#bitsRows input[data-bit="3"]'); c.checked = !c.checked; c.dispatchEvent(new Event('change', {bubbles: true}));
    const t = document.querySelector('#bitsRows input[data-note="3"]'); t.value = 'test note for bit 3'; t.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  await ev(`document.getElementById('bitsApply').click()`);
  const after8 = await ev(`MazEditor.doc().p.recs[16][8] | (MazEditor.doc().p.recs[16][9] << 8)`);
  check('setting a bit changes only that bit', after8 === (before8 ^ 8), [before8, after8]);
  await ev(`document.querySelector('#keys .bitsBtn').click()`);
  const kept = await ev(`document.querySelector('#bitsRows input[data-note="3"]').value`);
  check('bit notes are kept for the field', kept === 'test note for bit 3', kept);
  await ev(`document.getElementById('bitsClose').click()`);
  await shot('bits.png');

  // 9. Smooth CAM Ai machine data: a machine's own program file and its control memory
  const machine = kp('MAZATROL/Smooth/MCH-C2');
  if (fs.existsSync(machine)) {
    const mf = 'MAZATROL/Smooth/MCH-C2/MC_Machine Programs/PRG-A.MAZ';
    await open(mf, 'inch');
    const mz = await ev(`(()=>{const d=MazEditor.doc();return {ctl: d.p.ctl, raw: !!d.p.raw, n: d.p.recs.length,
      bytes: Array.from(Maz.serialize(d.p)).map(x=>x.toString(16).padStart(2,'0')).join(''),
      screen: Array.from(document.querySelectorAll('#lines .ln')).slice(0, 4).map(l=>l.textContent)}})()`);
    check('a .MAZ machine file opens as a Smooth mill program', mz.ctl === 'SmoothM' && mz.raw && mz.n === fs.statSync(kp(mf)).size / 100, mz.ctl);
    check('the .MAZ saves unchanged', mz.bytes === fs.readFileSync(kp(mf)).toString('hex'));
    check('the .MAZ program shows its units', mz.screen.some(l => /^ +0 /.test(l)), mz.screen);
    // control memory: only the tool data regions are sent; the page rebuilds the 8 MB file around them
    const mem = fs.readFileSync(path.join(machine, 'm8ysram'));
    const parts = [[0x4a100, 0x2d000], [0x77100, 0x2d000], [0x184160, 100 * 384]].map(([o, n]) => [o, mem.subarray(o, o + n).toString('base64')]);
    await ev(`(()=>{const b=new Uint8Array(0x800000);for(const [o,s] of ${JSON.stringify(parts)}){const x=Uint8Array.from(atob(s),c=>c.charCodeAt(0));b.set(x,o);}
      MazEditor.openBytes(b,'m8ysram',null);document.querySelector('[data-units="inch"]').click();})()`);
    await sleep(150);
    const mm = await ev(`(()=>{const d=MazEditor.doc();const ls=MazEditor.ctx(d);return {memory: !!(d.t&&d.t.memory), type: d.t&&d.t.type,
      tools: ls.filter(L=>L.sel.block===1).length, title: document.querySelector('#lines .ln').textContent,
      screen: Array.from(document.querySelectorAll('#lines .ln')).map(l=>l.textContent)}})()`);
    check('machine memory opens as the machine\'s tool data', mm.memory && mm.type === 'mill' && mm.tools === 53 && /MACHINE TOOL DATA/.test(mm.title), mm.title + ' ' + mm.type + ' ' + mm.tools);
    check('machine tool data shows its tools', mm.screen.some(l => /E-MILL/.test(l)) && mm.screen.some(l => /Tool Data \(2\)/.test(l)), mm.screen.slice(0, 8));
    const l3 = await ev(`MazEditor.ctx(MazEditor.doc()).findIndex(L=>L.sel.block===1)`);
    await ev(`MazEditor.select(${l3}, 7); document.getElementById('input').focus()`);
    const memBefore = await ev(`Array.from(MazEditor.doc().t.recs[MazEditor.ctx(MazEditor.doc())[${l3}].ri])`);
    await type('9.9'); await key('Enter');
    const memAfter = await ev(`({rec: Array.from(MazEditor.doc().t.recs[MazEditor.ctx(MazEditor.doc())[${l3}].ri]), msg: document.getElementById('msg').textContent, dirty: MazEditor.doc().dirty})`);
    check('machine memory is read-only', JSON.stringify(memAfter.rec) === JSON.stringify(memBefore) && /does not change it/.test(memAfter.msg) && !memAfter.dirty, memAfter.msg);
    await shot('machine_tools.png');
    // tool check: the program's tools against this machine's tool data, and the setup sheet
    const tab = await ev(`MazEditor.docs.findIndex(d => d.p.name === 'PRG-A.MAZ')`);
    await ev(`document.querySelector('[data-tab="${tab}"]').click()`);
    await ev(`MazEditor.softKey('tools')`);
    await sleep(150);
    const tp = await ev(`({shown: !document.getElementById('toolsSide').hidden, info: document.getElementById('toolsInfo').textContent,
      src: document.getElementById('toolSrc').selectedOptions[0].textContent,
      rows: Array.from(document.querySelectorAll('#toolsList tbody tr')).map(r => r.className + ' ' + r.textContent)})`);
    check('tools panel lists the program\'s tools', tp.shown && tp.rows.length === 10, tp.rows.length);
    check('tools are checked against the open machine memory', /machine memory m8ysram/.test(tp.src) && /7 found/.test(tp.info) && /3 missing/.test(tp.info), tp.info + ' | ' + tp.src);
    check('a missing tool is marked', tp.rows.some(r => /^st-missing/.test(r) && /E-MILL1\.25A/.test(r.replace(/\s/g, ''))), tp.rows);
    check('a found tool shows its pocket and length', tp.rows.some(r => /^st-ok/.test(r) && /T69/.test(r) && /7\.6786/.test(r)), tp.rows);
    await ev(`Array.from(document.querySelectorAll('#toolsList tbody tr')).find(r => /1\.25/.test(r.textContent)).click()`);
    const selr = await ev(`MazEditor.doc().sel.r`), want = await ev(`MazEditor.toolCheck(MazEditor.doc()).rows.find(r => r.pt.nomText === '1.25').pt.lines[0]`);
    check('clicking a tool goes to its line', selr === want, selr + ' vs ' + want);
    const sheet = await ev(`MazEditor.setupSheet(MazEditor.doc())`);
    check('setup sheet lists tools with their check', /^SETUP SHEET   PRG-A\.MAZ/.test(sheet) && /E-MILL +0\.75 +A .*T69 +69 +7\.6786/.test(sheet) && /10 tools: 7 found, 0 with another suffix, 3 missing/.test(sheet), sheet.slice(0, 600));
    await shot('tools.png');
    // compare: the shop copy against the machine's copy (opened second, so it is the current program)
    await open('samplemazak/cnc/MILL SMOOHG/PRG-B.PBM', 'inch');
    await open('MAZATROL/Smooth/MCH-C2/MC_Machine Programs/PRG-B.MAZ', 'inch');
    await ev(`MazEditor.softKey('compare')`);
    await sleep(150);
    const cp = await ev(`({shown: !document.getElementById('cmpSide').hidden, tools: document.getElementById('toolsSide').hidden,
      info: document.getElementById('cmpInfo').textContent, with: document.getElementById('cmpWith').selectedOptions[0].textContent,
      items: Array.from(document.querySelectorAll('#cmpList .it')).map(x => x.className + ' | ' + x.textContent)})`);
    check('compare opens instead of the tools panel', cp.shown && cp.tools, cp);
    check('compare picks the copy with the same name', /^PRG-B\.PBM/.test(cp.with), cp.with);
    check('compare counts the changes', /25 changed · 15 added · 0 removed/.test(cp.info), cp.info);
    check('compare shows what changed', /INITIAL-Z\s+4\.\s*→\s*8\./.test(cp.items[0]), cp.items[0]);
    await ev(`document.querySelectorAll('#cmpList .it')[3].click()`);
    const cr = await ev(`MazEditor.doc().sel.r`);
    check('clicking a change goes to its line', cr === 4, cr);
    await shot('compare.png');
    // a folder: some of the MCH-C1's programs, its index.tbl and its machine memory
    const fdir = kp('MAZATROL/Smooth/MCH-C1');
    const pick = ['PRG-A.MAZ', 'PRG-C-OP5.MAZ', 'PRG-D-M.MAZ', 'PRG-E.MAZ', 'index.tbl'];
    const files = pick.map(f => [f, fs.readFileSync(path.join(fdir, 'MC_Machine Programs', f)).toString('base64')]);
    const fmem = fs.readFileSync(path.join(fdir, 'm8ysram'));
    const fparts = [[0x4a100, 0x2d000], [0x77100, 0x2d000], [0x184160, 100 * 384]].map(([o, n]) => [o, fmem.subarray(o, o + n).toString('base64')]);
    await ev(`(async () => {
      const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      const entries = ${JSON.stringify(files)}.map(([n, s]) => ({ name: n, path: 'MC_Machine Programs/' + n, file: new File([b64(s)], n) }));
      const mem = new Uint8Array(0x800000);
      for (const [o, s] of ${JSON.stringify(fparts)}) mem.set(b64(s), o);
      entries.push({ name: 'm8ysram', path: 'm8ysram', file: new File([mem], 'm8ysram') });
      await MazEditor.loadFolder('MCH-C1', entries);
    })()`);
    await sleep(200);
    const fp = await ev(`({shown: !document.getElementById('folderSide').hidden, info: document.getElementById('folderInfo').textContent,
      rows: Array.from(document.querySelectorAll('#folderList .pr')).map(x => x.textContent)})`);
    check('folder lists its programs with comments', fp.shown && fp.rows.length === 4 && fp.rows.some(r => /PRG-C-OP5\.MAZ/.test(r)), fp.rows);
    check('folder checks every program\'s tools against its machine memory', /tools checked against m8ysram \(mill, 26 tools\)/.test(fp.info) &&
      fp.rows.some(r => /PRG-A\.MAZ.*✗ 6 missing, 1 other suffix of 10 tools/.test(r)), fp.info + ' | ' + fp.rows.join(' | '));
    await ev(`document.getElementById('folderSearch').value = 'E-MILL 0.75'; document.getElementById('folderSearch').dispatchEvent(new Event('input'))`);
    await sleep(400);
    const fs1 = await ev(`({info: document.getElementById('folderInfo').textContent, hits: Array.from(document.querySelectorAll('#folderList .hit')).map(x => x.textContent)})`);
    check('folder search finds lines in every program', /programs · \d+ lines found/.test(fs1.info) && fs1.hits.length > 0 && fs1.hits.every(h => /E-MILL 0\.75/.test(h)), fs1);
    await ev(`document.querySelector('#folderList .hit').click()`);
    await sleep(150);
    const fo = await ev(`({name: MazEditor.doc().p.name, r: MazEditor.doc().sel.r, line: document.querySelector('#lines .ln.cur, #lines .ln .sel') ? 1 : 0})`);
    const want1 = await ev(`+document.querySelector('#folderList .hit').dataset.l`);
    check('clicking a found line opens the program there', /\.MAZ$/.test(fo.name) && fo.r === want1, fo);
    await ev(`MazEditor.side('tools')`);
    const tsrc = await ev(`document.getElementById('toolSrc').selectedOptions[0].textContent`);
    check('the Tools panel uses the folder\'s machine memory', /^folder MCH-C1\/m8ysram/.test(tsrc), tsrc);
    await ev(`MazEditor.side('folder')`);
    await shot('folder.png');
    // the folder of all machines: each machine's programs against its own memory, and which machines have the tools
    const two = ['MCH-C1', 'MCH-C2'].map(m => {
      const md = kp('MAZATROL/Smooth', m), mem = fs.readFileSync(path.join(md, 'm8ysram'));
      return { m, progs: ['PRG-A.MAZ', 'index.tbl'].map(f => [f, fs.readFileSync(path.join(md, 'MC_Machine Programs', f)).toString('base64')]),
        parts: [[0x4a100, 0x2d000], [0x77100, 0x2d000], [0x184160, 100 * 384]].map(([o, n]) => [o, mem.subarray(o, o + n).toString('base64')]) };
    });
    await ev(`(async () => {
      const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), entries = [];
      for (const x of ${JSON.stringify(two)}) {
        for (const [n, s] of x.progs) entries.push({ name: n, path: x.m + '/MC_Machine Programs/' + n, file: new File([b64(s)], n) });
        const mem = new Uint8Array(0x800000);
        for (const [o, s] of x.parts) mem.set(b64(s), o);
        entries.push({ name: 'm8ysram', path: x.m + '/m8ysram', file: new File([mem], 'm8ysram') });
      }
      document.getElementById('folderSearch').value = '';
      await MazEditor.loadFolder('Smooth', entries);
    })()`);
    await sleep(200);
    const mm2 = await ev(`({info: document.getElementById('folderInfo').textContent, groups: Array.from(document.querySelectorAll('#folderList .grp')).map(x => x.textContent),
      rows: Array.from(document.querySelectorAll('#folderList .pr')).map(x => x.textContent)})`);
    check('a folder of machines groups the programs by machine', mm2.groups.length === 2 && /2 machines, each program checked against its own machine/.test(mm2.info), mm2);
    check('each machine\'s copy is checked against its own memory', mm2.rows.some(r => /6 missing, 1 other suffix of 10/.test(r)) && mm2.rows.some(r => /3 missing of 10/.test(r)), mm2.rows);
    await ev(`document.querySelectorAll('#folderList .pr')[1].click()`);
    await sleep(100);
    await ev(`MazEditor.side('tools')`);
    const mb = await ev(`Array.from(document.querySelectorAll('#toolsInfo .mach')).map(b => b.className + ' ' + b.textContent)`);
    check('the Tools panel shows which machines have the program\'s tools', mb.length === 2 && mb.some(b => /on/.test(b) && /MCH-C2/.test(b)) && mb.some(b => /MCH-C1.*6 missing/.test(b)), mb);
    await ev(`document.querySelector('#toolsInfo .mach:not(.on)').click()`);
    const src2 = await ev(`document.getElementById('toolSrc').selectedOptions[0].textContent`);
    check('choosing a machine checks against it', /^folder Smooth\/MCH-C1\/m8ysram/.test(src2), src2);
    await shot('machines.png');
  }
  // 11. EIA (G-code) programs: text editing, the plot, stepping block by block, restart from a line
  {
    const mc = 'MAZATROL/Smooth/MCH-C1/MC_Machine Programs/';
    if (fs.existsSync(kp(mc, '607810.EIA'))) {
      await open(mc + '607810.EIA');
      await sleep(150);
      const want = fs.readFileSync(kp(mc, '607810.EIA'), 'latin1').replace(/\r\n?/g, '\n');
      const ed = await ev(`({eia: !!MazEditor.doc().g, text: document.getElementById('gtext').value, shown: !document.getElementById('gtext').hidden,
        lines: document.getElementById('lines').hidden, info: document.getElementById('info').textContent, type: MazEditor.doc().g.type,
        unitDisabled: MazEditor.skOff('unit-menu'), plotDisabled: MazEditor.skOff('plot')})`);
      check('an EIA program opens as text', ed.eia && ed.shown && ed.lines && ed.text === want && /EIA\/ISO mill program/.test(ed.info), { info: ed.info, len: ed.text.length });
      check('Mazatrol-only buttons are off for EIA; the plot is on', ed.unitDisabled && !ed.plotDisabled, ed);
      await ev(`MazEditor.side('plot')`);
      await sleep(250);
      const ep = await ev(`({stats: MazEditor.plotStats(), info: document.getElementById('plotInfo').textContent, steps: MazEditor.scene().steps.length,
        bar: !document.getElementById('playbar').hidden, pinfo: document.getElementById('playInfo').textContent})`);
      check('the EIA program is plotted in 3D moves with a cycle time', ep.stats && ep.stats.lines > 300 && /X .* Y .* Z .* in · ≈ \d+:\d\d/.test(ep.info), ep);
      check('the plot offers playback by block', ep.bar && ep.steps > 300 && /blocks · \d+ moves/.test(ep.pinfo), ep.pinfo);
      await ev(`document.querySelector('[data-play="first"]').click()`);
      for (let k = 0; k < 40; k++) await ev(`document.querySelector('[data-play="fwd"]').click()`);
      const st = await ev(`(() => { const d = MazEditor.doc(), s = MazEditor.scene(), p = d.play, t = document.getElementById('gtext');
        return {pos: p.pos, on: p.on, line: s.steps[p.pos - 1].line, cur: d.g.curLine, selLine: t.value.slice(0, t.selectionStart).split('\\n').length - 1,
          info: document.getElementById('playInfo').textContent, prompt: document.getElementById('prompt').textContent}; })()`);
      check('stepping runs one block at a time and the cursor follows', st.on && st.pos === 40 && st.cur === st.line && st.selLine === st.line && /^40\/\d+ · line \d+/.test(st.info), st);
      check('the entry line says what the block does', st.prompt.trim().length > 0, st.prompt);
      await ev(`document.querySelector('[data-play="back"]').click()`);
      check('stepping back', await ev(`MazEditor.doc().play.pos`) === 39);
      await shot('eia_step.png');
      // restart from a line in the middle, then play a little
      await ev(`MazEditor.gotoLine(200); document.querySelector('[data-play="here"]').click()`);
      const rs = await ev(`(() => { const d = MazEditor.doc(), s = MazEditor.scene(); return {from: d.play.from, line: s.steps[d.play.from].line, pos: d.play.pos}; })()`);
      check('restart from the cursor line', rs.line >= 200 && rs.pos === rs.from && rs.from > 0, rs);
      await ev(`document.getElementById('playSpeed').value = '1000'; document.querySelector('[data-play="run"]').click()`);
      await sleep(700);
      const pl = await ev(`({pos: MazEditor.doc().play.pos, from: MazEditor.doc().play.from})`);
      check('play runs on from the restart point', pl.pos > pl.from, pl);
      await ev(`document.querySelector('[data-play="run"]').click()`);
      await shot('eia_restart.png');
      await ev(`document.querySelector('[data-play="last"]').click()`);
      // edit the text: dirty, re-plotted, undo
      const before = await ev(`MazEditor.scene().steps.length`);
      await ev(`(() => { const t = document.getElementById('gtext'), at = t.value.split('\\n').slice(0, 99).join('\\n').length + 1; t.focus(); t.setSelectionRange(at, at); })()`);
      await type('G0 X5. Y5. Z1.\n');
      await sleep(600);
      const edt = await ev(`({dirty: MazEditor.doc().dirty, steps: MazEditor.scene().steps.length, tab: document.querySelector('.tab.cur').textContent})`);
      check('typing in the EIA text marks it changed and re-runs the plot', edt.dirty && edt.steps === before + 1 && /●/.test(edt.tab), [before, edt]);
      await key('z', { modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
      await sleep(500);
      check('undo takes the typing back', await ev(`document.getElementById('gtext').value`) === want);
    }
    const lf = 'MAZATROL/Smooth/MCH-J/MC_Machine Programs/BROACHKH6183.EIA';
    if (fs.existsSync(kp(lf))) {
      await open(lf);
      await sleep(300);
      const lp = await ev(`({type: MazEditor.doc().g.type, info: document.getElementById('plotInfo').textContent, moves: MazEditor.scene().moves, ang: document.getElementById('angSeg').hidden})`);
      check('a lathe EIA program plots Z across, diameter up, with its G71 roughing passes', lp.type === 'lathe' && /diameter/.test(lp.info) && lp.moves > 100 && lp.ang, lp);
      await shot('eia_lathe.png');
    }
  }
  // 12. Mazatrol playback: one line at a time, restart from a unit
  await ev(`document.querySelector('[data-tab="2"]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-play="first"]').click()`);
  for (let k = 0; k < 5; k++) await ev(`document.querySelector('[data-play="fwd"]').click()`);
  const mp = await ev(`(() => { const d = MazEditor.doc(), s = MazEditor.scene(); return {name: d.p.name, pos: d.play.pos, r: d.sel.r, rec: s.steps[d.play.pos - 1].rec}; })()`);
  check('Mazatrol playback steps line by line with the cursor', /GP-PART7/.test(mp.name) && mp.pos === 5 && mp.r === mp.rec, mp);
  await ev(`MazEditor.select(18); document.querySelector('[data-play="here"]').click()`);
  const mr = await ev(`(() => { const d = MazEditor.doc(), s = MazEditor.scene(), st = s.steps[d.play.from]; return {from: d.play.from, unitRec: st.unitRec, label: st.label}; })()`);
  check('restart from the unit at the cursor', mr.unitRec === 18 && /TAPPING/.test(mr.label), mr);
  await ev(`document.querySelector('[data-play="last"]').click()`);
  const cp = await ev(`(() => { const s = MazEditor.scene(); return {moves: s.moves, cut: s.items.filter(i => i.kind === 'cut').length, time: s.time, legend: document.querySelector('.legend').textContent}; })()`);
  check('the Mazatrol plot has the units\' cutter paths and a cycle time', cp.moves > 500 && cp.cut > 300 && cp.time > 0 && /cutter path/.test(cp.legend), cp);
  // 13. units: duplicate, cut and paste, and the right-click menu
  const units0 = await ev(`Maz.structure(MazEditor.doc().p, MazEditor.ctx(MazEditor.doc())).length`);
  await ev(`MazEditor.select(9)`);                                  // DRILLING unit
  await key('d', { modifiers: 2, key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  const dup = await ev(`(() => { const d = MazEditor.doc(), us = Maz.structure(d.p, MazEditor.ctx(d)); const u = us.find(x => x.i === d.sel.r);
    return {n: us.length, code: u && u.code, sel: d.sel.r, lines: u && u.seqs.length, no: Maz.number(d.p.recs[d.sel.r]), msg: document.getElementById('msg').textContent}; })()`);
  check('Ctrl+D duplicates the unit right after it, renumbered', dup.n === units0 + 1 && dup.code === 0x20 && dup.sel === 14 && dup.lines === 4 && dup.no === 4 && /Duplicated 1 unit/.test(dup.msg), [units0, dup]);
  await key('z', { modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
  check('undo takes the copy back', await ev(`Maz.structure(MazEditor.doc().p, MazEditor.ctx(MazEditor.doc())).length`) === units0);
  // right-click a unit line: the menu, then Duplicate from it
  const box = await ev(`(() => { const r = document.querySelector('#lines .ln[data-r="14"]').getBoundingClientRect(); return [r.left + 40, r.top + r.height / 2]; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box[0], y: box[1], button: 'right', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box[0], y: box[1], button: 'right', clickCount: 1 });
  await sleep(150);
  const cm = await ev(`({shown: !document.getElementById('ctxMenu').hidden, items: Array.from(document.querySelectorAll('#ctxMenu button')).map(b => (b.disabled ? '-' : '+') + b.textContent), sel: MazEditor.doc().sel.r})`);
  check('right-click shows the unit menu', cm.shown && cm.sel === 14 && cm.items.some(t => /^\+Duplicate unit/.test(t)) && cm.items.some(t => /^\+Delete unit/.test(t)) && cm.items.some(t => /^\+Plot from this unit/.test(t)), cm);
  await shot('context_menu.png');
  await ev(`document.querySelector('#ctxMenu [data-ctx="dup"]').click()`);
  check('Duplicate from the menu', await ev(`Maz.structure(MazEditor.doc().p, MazEditor.ctx(MazEditor.doc())).length`) === units0 + 1 && await ev(`document.getElementById('ctxMenu').hidden`));
  // cut the copy and paste it above the last POCKET
  await key('x', { modifiers: 2, key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88 });
  check('Ctrl+X cuts the unit', await ev(`Maz.structure(MazEditor.doc().p, MazEditor.ctx(MazEditor.doc())).length`) === units0);
  const pk0 = await ev(`Maz.number(MazEditor.doc().p.recs[59])`);
  await ev(`MazEditor.select(61)`);                                 // a shape line of that POCKET
  await key('v', { modifiers: 2, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 });
  const pasted = await ev(`(() => { const d = MazEditor.doc(), us = Maz.structure(d.p, MazEditor.ctx(d)); return {n: us.length, codes: us.map(u => u.code).slice(-3), sel: d.sel.r,
    no: Maz.number(d.p.recs[59]), msg: document.getElementById('msg').textContent}; })()`);
  check('paste puts the cut unit (CIRC MIL) above the unit at the cursor', pasted.n === units0 + 1 && pasted.codes[0] === 0x26 && pasted.codes[1] === 0x63 && pasted.codes[2] === 4 &&
    pasted.sel === 59 && pasted.no === pk0 && new RegExp('Pasted 1 unit above UNo ' + (pk0 + 1) + ' POCKET').test(pasted.msg), [pk0, pasted]);
  // pasted on the END unit: above END
  await ev(`MazEditor.select(MazEditor.doc().p.recs.length - 1); MazEditor.paste()`);
  const pastedEnd = await ev(`(() => { const d = MazEditor.doc(), us = Maz.structure(d.p, MazEditor.ctx(d)); return us.map(u => u.code).slice(-3); })()`);
  check('paste on END goes above END', pastedEnd[1] === 0x26 && pastedEnd[2] === 4, pastedEnd);
  await key('z', { modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
  // Insert unit goes above the unit at the cursor (here from a tool line of TAPPING), renumbering the rest
  const tap0 = await ev(`Maz.number(MazEditor.doc().p.recs[18])`);
  await ev(`MazEditor.select(20)`);
  await ev(`MazEditor.softKey('unit-menu')`);
  await ev(`document.querySelector('[data-unit="32"]').click()`);
  const ins = await ev(`(() => { const d = MazEditor.doc(), us = Maz.structure(d.p, MazEditor.ctx(d)), k = us.findIndex(u => u.i === 18);
    return {sel: d.sel.r, code: us[k].code, no: Maz.number(d.p.recs[18]), next: us[k + 1].code, nextNo: Maz.number(d.p.recs[us[k + 1].i]), msg: document.getElementById('msg').textContent}; })()`);
  check('Insert unit goes above the unit at the cursor', ins.sel === 18 && ins.code === 0x20 && ins.no === tap0 && ins.next === 0x24 && ins.nextNo === tap0 + 1 &&
    new RegExp('Inserted DRILLING \\(UNo ' + tap0 + '\\) above UNo ' + (tap0 + 1) + ' TAPPING').test(ins.msg), [tap0, ins]);
  await key('z', { modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
  // on the common unit it goes right after it (the common unit stays first)
  await ev(`MazEditor.select(0); MazEditor.insertUnit(32)`);
  const ins0 = await ev(`(() => { const d = MazEditor.doc(), us = Maz.structure(d.p, MazEditor.ctx(d)); return {codes: us.slice(0, 3).map(u => u.code), sel: d.sel.r}; })()`);
  check('Insert unit on the common unit goes right after it', ins0.codes[0] === 1 && ins0.codes[1] === 0x20 && ins0.sel === 1, ins0);
  await key('z', { modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
  // the common unit cannot be duplicated
  await ev(`MazEditor.select(0); MazEditor.duplicateSelection()`);
  check('the common unit is not duplicated', /not duplicated/.test(await ev(`document.getElementById('msg').textContent`)));
  // a program of SUB PRO units plots the programs it calls once they are open too
  if (fs.existsSync(kp('prg-i/PRG-I-2-MAIN.PBD'))) {
    await open('prg-i/PRG-I-2-MAIN.PBD', 'inch');
    if (!(await ev('MazEditor.skOn("plot")'))) await ev(`MazEditor.softKey('plot')`);
    await sleep(150);
    const before = await ev('MazEditor.scene().moves');
    const mainTab = await ev('MazEditor.docs.length - 1');
    for (const n of ['OP1', 'OP2', 'OP3']) await open('prg-i/PRG-I-2-' + n + '.PBD', 'inch');
    await ev(`document.querySelector('[data-tab="${mainTab}"]').click()`);
    await sleep(300);
    const sub = await ev(`({moves: MazEditor.scene().moves, notes: document.getElementById('plotNotes').textContent, info: document.getElementById('plotInfo').textContent})`);
    check('SUB PRO units plot the programs they call once those are open', before === 0 && sub.moves > 8000 && /≈ \d+:\d\d:\d\d|≈ \d+:\d\d/.test(sub.info), [before, sub]);
    check('units after an END unit are noted as not run', /PRG-I-2-OP1: UNo 21–22 come after the END unit/.test(sub.notes), sub.notes);
    await shot('subpro.png');
    // the machining time window: units (subprograms under their SUB PRO unit) and tools, hover shows it on the plot
    await ev(`MazEditor.softKey('time')`);
    await sleep(200);
    const tw = await ev(`(() => { const M = MazEditor.timeModel(), rows = document.querySelectorAll('#twRoot tr[data-row]');
      return { open: !document.getElementById('timeWin').hidden, rows: rows.length, segs: document.querySelectorAll('#twRoot .tw-sg').length,
        total: document.querySelector('#twRoot .tw-total').textContent, cut: M.cut, rapid: M.rapid, tools: M.tools.length, changes: M.changes,
        scene: MazEditor.scene().time, kids: M.top.filter(r => r.kids).map(r => r.kids.size) }; })()`);
    check('the time window lists the SUB PRO units, with their units under them, and adds up to the plot time',
      tw.open && tw.rows === 5 && tw.kids.length === 3 && tw.kids.every(n => n > 5) && Math.abs(tw.cut + tw.rapid - tw.scene) < 1e-6 && tw.segs > 30 && tw.tools > 5, tw);
    await ev(`document.querySelector('#twRoot [data-exp]').click()`);
    await sleep(100);
    const child = await ev(`document.querySelectorAll('#twRoot tr.tw-child').length`);
    check('a SUB PRO row opens to the units of the program it calls', child > 5, child);
    await ev(`Array.from(document.querySelectorAll('#twRoot tr.tw-child')).find(r => /LINE/.test(r.textContent)).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
    const foc = await ev(`(() => { const f = MazEditor.plotFocus(); return f ? f.size : 0; })()`);
    check('hovering a unit in the time window shows its moves on the plot', foc > 10, foc);
    await shot('time.png');
    await ev(`document.querySelector('#twRoot [data-tg="tool"]').click()`);
    await sleep(100);
    const trows = await ev(`Array.from(document.querySelectorAll('#twRoot tr[data-row]')).map(r => r.querySelector('.tw-name').textContent)`);
    check('grouped by tool: one row per tool', trows.length === tw.tools && trows.some(t => /CHMF-M/.test(t)), trows);
    // "Used in" is a count; ▸ opens the units the tool works in, with their times
    const used = await ev(`document.querySelector('#twRoot tr[data-row] .tw-tools').textContent`);
    check('a tool row says how many units it works in', /^\d+ units?/.test(used), used);
    await ev(`(() => { const r = Array.from(document.querySelectorAll('#twRoot tr[data-row]')).find(r => /CHMF-M 0.44/.test(r.textContent)); r.querySelector('[data-exp]').click(); })()`);
    await sleep(100);
    const kids = await ev(`(() => { const t = MazEditor.timeModel().tools.find(r => /CHMF-M 0.44/.test(r.label));
      return { shown: Array.from(document.querySelectorAll('#twRoot tr.tw-child .tw-name')).map(x => x.textContent), n: t.kids.size,
        sum: [...t.kids.values()].reduce((a, c) => a + c.cut + c.rapid, 0), total: t.cut + t.rapid }; })()`);
    check('▸ on a tool shows each unit it works in, adding up to the tool', kids.shown.length === kids.n && kids.n >= 9 && Math.abs(kids.sum - kids.total) < 1e-6 && kids.shown.some(x => /PRG-I-2-OP3 › UNo 14/.test(x)), kids);
    await ev(`document.querySelector('#twRoot th[data-sort="total"]').click()`);
    await sleep(100);
    const totals = await ev(`MazEditor.timeModel().tools.slice().sort((a,b)=>(b.cut+b.rapid)-(a.cut+a.rapid))[0].label === document.querySelector('#twRoot tr[data-row] .tw-name').textContent`);
    check('clicking Total sorts the longest first', totals);
    // Dia for rpm: the control works out rpm from the tool's actual diameter; entering 0.14 for the E-MILL 0.4
    // brings OP3 UNo 18 from about 3:10 to about 1:06 (the control's time)
    const before18 = await ev(`MazEditor.scene().time`);
    await ev(`(() => { const i = document.querySelector('#twRoot input[data-dia="E-MILL 0.4 A"]'); i.value = '0.14'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(300);
    const dia = await ev(`(() => { const i = document.querySelector('#twRoot input[data-dia="E-MILL 0.4 A"]'); const r = MazEditor.timeModel().top.find(r => /OP3/.test(r.label));
      const u = r && [...r.kids.values()].find(c => /UNo 18 /.test(c.label)); return { time: MazEditor.scene().time, from: i.nextElementSibling.textContent, u18: u ? u.cut + u.rapid : -1 }; })()`);
    check('entering a tool\'s actual diameter speeds up its units to the control\'s time', dia.from === 'entered' && before18 - dia.time > 100 && Math.abs(dia.u18 - 66) < 8, [before18, dia]);
    await ev(`(() => { const i = document.querySelector('#twRoot input[data-dia="E-MILL 0.4 A"]'); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(300);
    check('clearing it goes back to NOM-D', Math.abs((await ev('MazEditor.scene().time')) - before18) < 1e-6);
    await shot('time-tools.png');
    // with the machine's memory open, chamfer mills take the middle of their edge from its tool file
    if (fs.existsSync(kp('MAZATROL/Smooth/MCH-C2/m8ysram'))) {
      const tBefore = await ev('MazEditor.scene().time');
      await open('MAZATROL/Smooth/MCH-C2/m8ysram');
      await ev(`document.querySelector('[data-tab="${mainTab}"]').click()`);
      await sleep(400);
      const tf = await ev(`(() => { const g = l => { const i = document.querySelector('#twRoot input[data-dia="' + l + '"]'); return i ? i.value + ' ' + i.nextElementSibling.textContent : ''; };
        return { big: g('CHMF-M 2.1 A'), small: g('CHMF-M 0.44 A'), time: MazEditor.scene().time }; })()`);
      check('chamfer mills use the middle of their edge from the tool file in the machine\'s memory', tf.big === '1.675 tool file' && tf.small === '0.22 tool file' && tf.time < tBefore - 200, [tBefore, tf]);
      await ev(`document.querySelector('[data-close="' + (MazEditor.docs.length - 1) + '"]').click()`);
      await ev(`document.querySelector('[data-tab="${mainTab}"]').click()`);
      await sleep(300);
    }
    // run order: the tool lines in the order they run; ▲ renumbers the priority lines 1, 2, 3 ... in the new order
    await ev(`document.querySelector('#twRoot [data-tg="run"]').click()`);
    await sleep(150);
    const ro = await ev(`(() => { const rows = Array.from(document.querySelectorAll('#twRoot .tw-run tr[data-row]'));
      return { n: rows.length, first: rows[0].querySelector('.tw-name').textContent, no: rows[0].querySelector('.tw-pri').value,
        div: document.querySelectorAll('#twRoot .tw-run tr[data-divider]').length, warn: document.querySelectorAll('#twRoot .tw-warn').length, edit: !rows[0].querySelector('.tw-pri').disabled }; })()`);
    check('run order lists every tool line in the order it runs, with its No.', ro.n === 44 && /F-MILL 3\./.test(ro.first) && ro.no === '3' && ro.div === 1 && ro.warn === 0 && ro.edit, ro);
    await shot('runorder.png');
    // move the second line (OP1 E-MILL 0.75, No. 5) above the first (OP3 F-MILL, No. 3): only the moved line's No. changes
    const op1 = await ev(`MazEditor.docs.findIndex(x => x.p.name === 'PRG-I-2-OP1.PBD')`), op3 = await ev(`MazEditor.docs.findIndex(x => x.p.name === 'PRG-I-2-OP3.PBD')`);
    const revs = await ev(`[MazEditor.docs[${op1}].rev, MazEditor.docs[${op3}].rev]`);
    await ev(`document.querySelectorAll('#twRoot .tw-run tr[data-row]')[1].querySelector('[data-mv="-1"]').click()`);
    await sleep(300);
    const ro2 = await ev(`(() => { const rows = Array.from(document.querySelectorAll('#twRoot .tw-run tr[data-row]'));
      return { first: rows[0].querySelector('.tw-name').textContent + ' ' + rows[0].textContent.includes('PRG-I-2-OP1'), nos: rows.slice(0, 6).map(r => r.querySelector('.tw-pri').value).join(','),
        revs: [MazEditor.docs[${op1}].rev, MazEditor.docs[${op3}].rev] }; })()`);
    check('▲ moves a line earlier by changing only its own No.', /E-MILL 0\.75 A true/.test(ro2.first) && /^[12],3,5,5,6,6$/.test(ro2.nos) && ro2.revs[0] === revs[0] + 1 && ro2.revs[1] === revs[1], [revs, ro2]);
    // drag the F-MILL line below the divider: its No. is cleared and it runs after the numbered lines
    await ev(`(() => { const rows = document.querySelectorAll('#twRoot .tw-run tr[data-row]'), src = rows[1], dst = document.querySelector('#twRoot .tw-run tr[data-divider]'), dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); })()`);
    await sleep(300);
    const ro4 = await ev(`(() => { const rows = Array.from(document.querySelectorAll('#twRoot .tw-run tbody tr')); const div = rows.findIndex(r => r.dataset.divider !== undefined);
      const f = rows.findIndex(r => r.querySelector('.tw-name') && /^F-MILL 3\. G/.test(r.querySelector('.tw-name').textContent)); return { div, f, no: rows[f].querySelector('.tw-pri').value, op3: MazEditor.docs[${op3}].rev }; })()`);
    check('dragging a line below the divider clears its No. (it runs after the numbered lines)', ro4.f === ro4.div + 1 && ro4.no === '' && ro4.op3 === revs[1] + 1, ro4);
    await shot('runorder2.png');
    // undo in each program brings the order back
    for (const k of [op1, op3]) { await ev(`document.querySelector('[data-tab="${k}"]').click()`); await ev('MazEditor.undo()'); }
    await ev(`document.querySelector('[data-tab="${mainTab}"]').click()`);
    await sleep(300);
    const ro3 = await ev(`document.querySelectorAll('#twRoot .tw-run tr[data-row]')[0].querySelector('.tw-pri').value`);
    check('undo in each program brings the old numbers back', ro3 === '3', ro3);
    await ev(`document.querySelector('#twRoot [data-tg="unit"]').click()`);
    // its own window: the panel hides and the window shows the same table
    await send('Runtime.evaluate', { expression: `document.getElementById('twPop').click()`, userGesture: true });
    await sleep(400);
    const pop = await ev(`(() => { const w = window.open('', 'mazedTime'); const r = w && w.document.getElementById('twRoot');
      return { panelHidden: document.getElementById('timeWin').hidden, rows: r ? r.querySelectorAll('tr[data-row]').length : -1, title: w ? w.document.title : '' }; })()`);
    check('the time window opens in a window of its own', pop.panelHidden && pop.rows > 5 && /PRG-I-2-MAIN/.test(pop.title), pop);
    await ev(`document.querySelector('#twRoot [data-tg="unit"]') && document.querySelector('#twRoot [data-tg="unit"]').click(); MazEditor.softKey('time')`);
    await sleep(100);
    check('turning Time off closes its window', await ev(`(() => { const w = window.open('', 'mazedTime'); if (!w) return true; const gone = !w.document.getElementById('twRoot'); w.close(); return gone; })()`));
    await ev(`MazEditor.softKey('time'); document.querySelector('#twRoot [data-tg="unit"]').click(); document.getElementById('twClose').click()`);
    check('closing the time window clears the plot focus', !(await ev('MazEditor.plotFocus()')) && (await ev(`document.getElementById('timeWin').hidden`)));
  }
  // shape lines as text: copy out, paste a list in, checked, written as one undo step
  if (fs.existsSync(kp('prg-i/PRG-I-2-OP1.PBD'))) {
    await open('prg-i/PRG-I-2-OP1.PBD', 'inch');
    // the bottom soft keys: PROGRAM EDIT opens the edit menu, PROGRAM COMPLETE closes it, a field's choices take the
    // keys while editing (◀ brings the menu back), SEARCH finds a unit by number
    await ev('MazEditor.setEditing(false)');
    const sk0 = await ev('MazEditor.softKeys()');
    check('the program menu: WORK No., SEARCH, PROGRAM EDIT, TPC, TOOL PATH, MACHIN. TIME, PROGRAM LAYOUT, HELP, PROGRAM FILE',
      ['workno', 'search', 'edit', 'tpc', 'plot', 'time', 'layout', 'help', 'file'].every(k => sk0.includes(k)) && sk0.length === 10, sk0);
    await ev(`document.querySelector('#softkeys [data-sk="edit"]').click()`);
    const sk1 = await ev('MazEditor.softKeys()');
    check('PROGRAM EDIT turns editing on and shows the edit keys', (await ev('MazEditor.editing()')) && ['unit-menu', 'line', 'delete', 'copy', 'paste', 'undo', 'complete'].every(k => sk1.includes(k)), sk1);
    await ev('MazEditor.select(44, 0)');
    const sk2 = await ev('MazEditor.softKeys()');
    check('on a field with choices the keys are the choices', sk2[0] === 'PT' && sk2.includes('CIR'), sk2);
    await shot('softkeys-field.png');
    await ev(`document.querySelector('#softkeys [data-sknav="-1"]').click()`);
    check('◀ brings the menu back', (await ev('MazEditor.softKeys()')).includes('complete'));
    await ev(`document.querySelector('#softkeys [data-sk="complete"]').click()`);
    check('PROGRAM COMPLETE ends editing and goes back to the program menu', !(await ev('MazEditor.editing()')) && (await ev('MazEditor.softKeys()')).includes('edit'));
    await ev(`document.querySelector('#softkeys [data-sk="search"]').click(); document.querySelector('#softkeys [data-sk="unoSearch"]').click()`);
    await ev(`document.getElementById('input').focus()`);
    await type('13'); await key('Enter');
    const found = await ev(`(() => { const d = MazEditor.doc(); return Maz.number(d.p.recs[d.sel.r]) + ' ' + MazEditor.ctx(d)[d.sel.r].sel.unit; })()`);
    check('SEARCH › UNIT No. SEARCH goes to the unit', found === '13 true', found);
    await ev(`document.querySelector('#softkeys [data-sknav="-1"]').click()`);
    await shot('softkeys.png');
    await ev('MazEditor.setEditing(true)');
    await ev('MazEditor.setEditing(true)');
    const T = async (rec, text) => {
      await ev(`MazEditor.select(${rec}); MazEditor.openText()`);
      if (text !== undefined) await ev(`(() => { const t = document.getElementById('tdText'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input')); })()`);
      await sleep(450);
      return ev(`({ text: document.getElementById('tdText').value, check: document.getElementById('tdCheck').textContent, title: document.getElementById('tdTitle').textContent, apply: !document.getElementById('tdApply').disabled })`);
    };
    const close = () => ev(`document.getElementById('tdCancel').click()`);
    let t = await T(44);
    check('a drilling unit\'s holes come out as text with a column line', /UNo 9 DRILLING · 2 hole lines/.test(t.title) && /^# PTN\tZ\tX\tY/.test(t.text) && t.text.split('\n').filter(l => l && l[0] !== '#').length === 2 && /✓ 2 lines/.test(t.check), t);
    t = await T(44, '# X Y\n1 2\n3,4\n5\t6\n');
    check('a pasted X Y list (spaces, commas or tabs) checks out', /✓ 3 lines/.test(t.check) && t.apply, t.check);
    const before = await ev('MazEditor.doc().p.recs.length');
    await ev(`document.getElementById('tdApply').click()`);
    await sleep(200);
    const got = await ev(`(() => { const d = MazEditor.doc(), ls = MazEditor.ctx(d); return [44, 45, 46].map(i => Maz.cellText(ls[i], 2, { units: 'inch' }).trim() + ' ' + Maz.cellText(ls[i], 3, { units: 'inch' }).trim() + ' ' + Maz.cellText(ls[i], 0, { units: 'inch' }).trim()).join(' | '); })()`);
    check('Apply writes the lines, other fields from the old lines', got === '1. 2. PT | 3. 4. PT | 5. 6. PT' && (await ev('MazEditor.doc().p.recs.length')) === before + 1, got);
    await ev('MazEditor.undo()');
    check('Undo takes them back', (await ev('MazEditor.doc().p.recs.length')) === before);
    t = await T(44, '# X Y\n1 abc\n');
    check('a bad value is caught with its line and column', /line 2: Y "abc"/.test(t.check) && !t.apply, t.check);
    t = await T(44, '# X Y\n0 0\n1 0\n0 1\n1 1\n40 40\n1 1\n');
    check('the check flags far-off and repeated holes', /hole 5 is far from all the others/.test(t.check) && /hole 6 is at the same X Y as hole 4/.test(t.check), t.check);
    await shot('astext.png');
    await close();
    // a figure: an arc too small to reach its end point is flagged
    const fig = await ev(`(() => { const d = MazEditor.doc(), ls = MazEditor.ctx(d); return ls.findIndex(L => L.lay && L.sel.code === 0xc2); })()`);
    t = await T(fig, '# PTN X Y R/TH\nLINE 0 0\nLINE 5 0\nCW 9 0 1.5\n');
    check('an arc whose R cannot reach is flagged', /line 3: CW R1\.5 cannot reach from X5\. Y0\. to X9\. Y0\. \(needs at least R2\.\)/.test(t.check), t.check);
    await close();
    // unchanged text writes back the same bytes: every unit with shape lines in the PRG-I programs
    const rt = [];
    let units = 0;
    for (const f of ['PRG-I-2-OP1', 'PRG-I-2-OP2', 'PRG-I-2-OP3']) {
      await open('prg-i/' + f + '.PBD', 'inch');
      const recs = await ev(`(() => { const d = MazEditor.doc(), ls = MazEditor.ctx(d); return Maz.structure(d.p, ls).filter(u => u.seqs.some(i => ls[i].lay && [0xa1, 0xc0, 0xc2].includes(ls[i].sel.code))).map(u => u.seqs.find(i => [0xa1, 0xc0, 0xc2].includes(ls[i].sel.code))); })()`);
      for (const r of recs) {
        const b0 = await ev('Array.from(MazEditor.doc().p.recs).map(r => Array.from(r).join(",")).join(";")');
        const x = await T(r);
        units++;
        await ev(`document.getElementById('tdApply').click()`);
        await sleep(100);
        const b1 = await ev('Array.from(MazEditor.doc().p.recs).map(r => Array.from(r).join(",")).join(";")');
        if (b0 !== b1 || !/✓/.test(x.check)) rt.push(f + ' rec ' + r + ': ' + x.check.slice(0, 160));
        if (b0 !== b1) await ev('MazEditor.undo()');
        await close();
      }
    }
    check('every PRG-I shape, hole and MANL PRG unit reads back as text without a change', !rt.length && units > 40, [units, rt]);
  }
  // the TPC screen: unit 72 of PRG-K has its TPC changed on the control (values as on its screen), unit 73 has none
  if (fs.existsSync(kp('DIR-A/NUM-A/PRG-K.PBM'))) {
    await open('DIR-A/NUM-A/PRG-K.PBM', 'inch');
    await ev('MazEditor.setEditing(true); MazEditor.select(199); MazEditor.softKey("tpc")');
    await sleep(150);
    const tv = await ev(`(() => { const o = {}; document.querySelectorAll('#tpcBody tr').forEach(r => { const c = r.children, i = c[2].querySelector('input'); o[c[0].textContent] = i ? i.value : c[2].textContent; }); return { title: document.getElementById('tpcTitle').textContent, o }; })()`);
    const want = { D1: '0.1', D3: '3', D16: '0', D17: '0.4', D22: '0.5', D29: '6', D30: '7', D31: '8', D32: '9', D41: '0.2', D42: '0.6', D43: '1', D45: '0.06', D46: '0.07', D48: '90', D49: '2.', D62: '9', D91: '00000110', D92: '00001111' };
    check('TPC screen: unit 72 TAPPING shows the values set on the control', /UNo 72 TAPPING/.test(tv.title) && Object.entries(want).every(([k, v]) => tv.o[k] === v), tv);
    // names from the parameter list, and D91's bits with what each does; ticking a bit changes the value
    await ev(`document.querySelector('#tpcBody input[data-tpcd="D91"]').focus()`);
    await sleep(100);
    const bits = await ev(`({ n: document.querySelectorAll('#tpcBits input[data-tpcbit]').length, text: document.getElementById('tpcBits').textContent, name: Array.from(document.querySelectorAll('#tpcBody tr')).find(r => r.children[0].textContent === 'D22').children[1].textContent })`);
    check('TPC: parameter names and D91 bit meanings', bits.n === 8 && /M04 after the dwell/.test(bits.text) && /Tapping dwell time/.test(bits.name), bits);
    await ev(`(() => { const c = document.querySelector('#tpcBits input[data-tpcbit="0"]'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(150);
    check('ticking D91 bit 0 sets it in the record (00000110 -> 00000111)', (await ev('MazEditor.doc().p.recs[200][24]')) === 7);
    const df = await ev(`({ diff: document.querySelectorAll('#tpcBits label.diff').length, text: document.getElementById('tpcBits').textContent, chg: !!document.querySelector('#tpcBody td.chg') })`);
    check('TPC: default bits shown, only the differing bits marked (D91 00000111 vs 11111001: 7 of 8)', df.diff === 7 && /Default 11111001/.test(df.text) && /\(default 1\)/.test(df.text) && df.chg, df);
    await shot('tpc.png');
    // the drawing of what a parameter adjusts follows the cursor (and the row under the mouse: park the mouse outside)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    await ev(`document.querySelector('#tpcBody input[data-tpcd="D41"]').focus()`);
    await sleep(100);
    const dr = await ev(`({ svg: !!document.querySelector('#tpcDraw svg'), head: document.querySelector('#tpcDraw .tpcdrawh').textContent })`);
    check('TPC: a drawing of the parameter at the cursor, with its value', dr.svg && /D41.*R-point height.*0\.2/.test(dr.head), dr);
    await shot('tpc-draw.png');
    await ev(`(() => { const i = document.querySelector('#tpcBody input[data-tpcoff="10"]'); i.value = '4'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(100);
    check('editing a TPC value writes it into the record', (await ev('MazEditor.doc().p.recs[200][10]')) === 4);
    await ev(`document.getElementById('tpcNext').click()`);
    await sleep(100);
    const t73 = await ev(`document.getElementById('tpcTitle').textContent + ' | ' + document.getElementById('tpcBody').textContent`);
    check('NEXT UNIT: unit 73 has no TPC (machine parameters)', /UNo 73 TAPPING/.test(t73) && /No TPC on this unit/.test(t73), t73);
    await ev(`document.getElementById('tpcPrev').click()`);
    await sleep(100);
    await ev(`document.getElementById('tpcCancel').click()`);
    await sleep(100);
    check('TPC CANCEL puts the unit\'s TPC back', (await ev('MazEditor.doc().p.recs[200][10]')) === 3 && !(await ev(`document.getElementById('tpcDlg').open`)));
  }
  // the reference: G-codes, M-codes, parameters with drawings, searchable
  await ev(`document.querySelectorAll('dialog[open]').forEach(d => d.close()); MazEditor.openRef('g')`);
  await sleep(100);
  const ref = await ev(`(() => { const f = document.getElementById('refFind'); f.value = 'G83'; f.dispatchEvent(new Event('input')); const g = document.querySelector('#refBody tbody').textContent;
    document.querySelector('[data-reftab="m"]').click(); f.value = 'coolant'; f.dispatchEvent(new Event('input')); const m = document.querySelectorAll('#refBody tbody tr').length;
    document.querySelector('[data-reftab="p"]').click(); f.value = ''; f.dispatchEvent(new Event('input')); const p = document.querySelectorAll('#refBody .refp').length, d = document.querySelectorAll('#refBody .refp svg').length;
    return { g, m, p, d }; })()`);
  check('reference: G-code search, M-codes, every parameter with a drawing or its bits', /G83.*deep-hole/.test(ref.g) && ref.m >= 5 && ref.p >= 55 && ref.d >= 50, ref);
  await shot('reference.png');
  // alarms: number and title built in; the cause and action come from the control's own help file
  await ev(`(() => { document.querySelector('[data-reftab="a"]').click(); const f = document.getElementById('refFind'); f.value = '461'; f.dispatchEvent(new Event('input')); })()`);
  const al = await ev(`document.querySelector('#refBody tbody').textContent`);
  check('reference: alarms by number with title and how to clear', /461PRIORITY No\. OVERLAP(Check: One priority No\.[^]*?)?program \/ tool datacarries onclear key/.test(al) && /Check: One priority No\./.test(al), al);
  const helpFile = kp('MAZATROL/Smooth/MCH-J/nm64mdata/eng/iAlarmHelp_NC.txt');
  if (fs.existsSync(helpFile)) {
    const n = await ev(`(() => { const h = MazEditor.parseAlarmHelp(${JSON.stringify(fs.readFileSync(helpFile, 'latin1'))}); localStorage.setItem('mazed-alarmhelp', JSON.stringify(h)); return Object.keys(h).length; })()`);
    check('the control\'s alarm help file reads in (cause and action per alarm)', n > 800, n);
  }
  await ev(`document.getElementById('refClose').click()`);
  // program check: a priority clash written into a copy is found with the control's alarm number
  if (fs.existsSync(kp('from-control/PRG-J.PBD'))) {
    await open('from-control/PRG-J.PBD', 'inch');
    const c0 = await ev("MazEditor.programCheck().filter(r => r.level === 'alarm').length");
    await ev(`(() => { const d = MazEditor.doc(); MazEditor.setEditing(true); const r = d.p.recs.findIndex((x, i) => i > 5 && x[0] === 0xc0) ; d.p.recs.splice(d.p.recs.length - 1, 1); d.ls = null; MazEditor.render(); })()`);
    const c1 = await ev(`MazEditor.programCheck().map(r => r.alarm).join(',')`);
    check('program check: clean program, then a missing END unit gives alarm 647', c0 === 0 && /647/.test(c1), [c0, c1]);
    await ev('MazEditor.openCheck()');
    await sleep(100);
    await shot('check.png');
    await ev(`document.getElementById('chkClose').click()`);
  }
  // EIA guidance: the block's format, its values, what is missing; a bare X/Y is the next hole of the cycle
  await ev(`(() => { const t = 'O1234\\nG90 G54 G17\\nT5 M06\\nG43 H5 Z1.\\nG99 G83 X1. Y2. Z-.5 R.1 Q.1 F5.\\nX3.\\nG81 X1. Y1. R.1\\nG80\\nG65 P9010 X1. Y2. D1.\\nM30\\n'; MazEditor.openBytes(new TextEncoder().encode(t), 'GUIDE.EIA', null); })()`);
  await sleep(200);
  const gd = async line => { await ev(`MazEditor.gotoLine(${line})`); await sleep(80); return ev(`({ hidden: document.getElementById('guide').hidden, text: document.getElementById('guide').textContent, miss: document.querySelectorAll('#guide .gd-i.miss').length })`); };
  let gg = await gd(4);
  check('EIA guidance: G83 with each address and its value', !gg.hidden && /G83 Deep-hole peck drilling/.test(gg.text) && /Q\.1peck depth/.test(gg.text) && gg.miss === 0, gg);
  await shot('guide.png');
  gg = await gd(5);
  check('EIA guidance: a bare X is the next hole of the cycle', /next hole of the cycle/.test(gg.text), gg);
  gg = await gd(6);
  check('EIA guidance: a missing Z is flagged', /G81 Drilling/.test(gg.text) && gg.miss === 1, gg);
  gg = await gd(8);
  check('EIA guidance: G65 P9010 is the probe calibration macro with its arguments', /Probe calibration in a master hole/.test(gg.text) && /D1\.measured diameter/.test(gg.text) && /macro program No/.test(gg.text), gg);
  // automatic tool development: a new DRILLING unit with DIA 0.5 DEPTH 1.2 CHMF 0.02 gets spot drill, drill, chamfer cutter
  await ev(`(() => { MazEditor.newProgram('MatrixM'); MazEditor.insertUnit(0x20); const d = MazEditor.doc(), i = d.p.recs.findIndex(r => r[0] === 0x20);
    MazEditor.select(i); const L = MazEditor.ctx(d)[i]; const set = (off, v) => { d.sel.c = MazEditor.ctx(d)[i].lay.cells.findIndex(c => c[0] === off && c[1] === 4); MazEditor.enterValue(v); };
    set(36, '0.5'); set(40, '1.2'); set(44, '0.02'); MazEditor.select(i); MazEditor.openDevelop(); })()`);
  await sleep(150);
  const dv = await ev(`document.querySelector('#devPrev pre') ? document.querySelector('#devPrev pre').textContent : document.getElementById('devPrev').textContent`);
  check('tool development: spot drill, drill and chamfer cutter from the unit data', /CTR-DR/.test(dv) && /DRILL\s+0\.5/.test(dv) && /CHMF-M/.test(dv), dv);
  await shot('develop.png');
  await ev(`document.getElementById('devApply').click()`);
  const nt = await ev(`MazEditor.doc().p.recs.filter(r => r[0] === 0xb0).length`);
  check('Apply writes the developed tool lines', nt === 3, nt);
  check('no JS errors', !errors.length, errors);

  if (fs.existsSync(kp('MAZATROL/Smooth/MCH-C2/MC_Machine Programs/PRG-H.MAZ'))) {      // needs the machine data (not on every machine)
  // guidance box on a hole-pattern line: the pattern's fields, a picture, and the clearer Q prompt
  await open('MAZATROL/Smooth/MCH-C2/MC_Machine Programs/PRG-H.MAZ', 'inch');
  await sleep(200);
  const hp = await ev(`(() => { const d = MazEditor.doc(), ls = MazEditor.ctx(d); const r = ls.findIndex(L => L.lay && L.sel.code === 0xc0 && L.rec[8] === 3);
    const k = ls[r].lay.cells.findIndex(c => c[0] === 16); MazEditor.select(r, k); const g = document.getElementById('guide');
    return { hidden: g.hidden, title: g.querySelector('.gd-t').textContent, svg: g.querySelectorAll('.gd-svg circle').length, prompt: document.getElementById('prompt').textContent }; })()`);
  check('hole pattern line: SQUARE explained with a picture of its holes', !hp.hidden && /^SQUARE/.test(hp.title) && hp.svg >= 4, hp);
  check('the OMIT SPT prompt reads plainly', /start point/.test(hp.prompt) && /only move there/.test(hp.prompt), hp.prompt);
  await shot('pattern-guide.png');

  // lathe and mill-turn G / M lists
  await open('samplemazak/cnc/LATHE SMOOTHG/BB-87-0.PBP', 'inch');
  const lr = await ev(`(() => { document.getElementById('refFind').value = ''; MazEditor.openRef('m'); const dlg = document.getElementById('refDlg'), t = dlg.textContent; const out = { mt: dlg.dataset.mt, tail: /Tailstock advance/.test(t) };
    document.querySelector('[data-refmt=millturn]').click(); document.querySelector('[data-reftab=g]').click(); out.g271 = /G271/.test(dlg.textContent); dlg.close(); return out; })()`);
  check('reference: a lathe program opens the lathe M list; mill-turn G list has G271', lr.mt === 'lathe' && lr.tail && lr.g271, lr);

  // lathe lines explained; lathe parameters and machine alarms in the reference
  await open('samplemazak/cnc/LATHE SMOOTHG/IY-532-0.PBP', 'inch');
  const lt = await ev(`(() => { const d = MazEditor.doc(), ls = MazEditor.ctx(d), us = Maz.structure(d.p, ls);
    const u = us.find(u => Maz.unitName(d.p.ctl, u.code) === 'BAR'), t = u.seqs.find(i => ls[i].lay && ls[i].sel.code >= 0xb0 && ls[i].sel.code <= 0xb5);
    MazEditor.select(t, ls[t].lay.cells.findIndex((c, j) => Maz.cellLabel(ls[t].lay, j) === 'PAT.'));
    const g = document.getElementById('guide').textContent;
    document.getElementById('refFind').value = 'TC37'; MazEditor.openRef('p'); const p = document.getElementById('refDlg').textContent;
    document.getElementById('refFind').value = '200'; MazEditor.openRef('a'); const a = document.getElementById('refDlg').textContent;
    document.getElementById('refFind').value = ''; document.getElementById('refDlg').close();
    return { g: /BAR/.test(g) && /straight-in passes/.test(g), p: /Safety clearance outside the shape/.test(p), a: /THERMAL TRIP/.test(a) }; })()`);
  check('lathe: BAR tool PAT. explained, TC37 named, lathe machine alarm 200', lt.g && lt.p && lt.a, lt);

  // the guidance box collapses to its title line and opens again; the choice is kept
  const gt = await ev(`(async () => {
    const g = document.getElementById('guide'), wait = () => new Promise(r => setTimeout(r, 50));
    const tog = document.getElementById('guideTog');
    await wait(); const open0 = !g.classList.contains('gd-min') && !tog.hidden && !g.querySelector('button.gd-tog, #guideTog');
    tog.click(); await wait();
    // collapsed: the title, and only the pill at the cursor (when there is one); drawings, details and other pills hidden
    const shown = e => getComputedStyle(e).display !== 'none' && (!e.parentElement || e.parentElement === g || shown(e.parentElement));
    const pills = [...g.querySelectorAll('.gd-i')].filter(shown), at = g.querySelector('.gd-i.at');
    const min = g.classList.contains('gd-min'), chipsHidden = [...g.children].filter(c => !c.classList.contains('gd-t') && !c.classList.contains('gd-w')).every(c => !shown(c))
      && (at ? pills.length === 1 && pills[0] === at : pills.length === 0);
    const kept = localStorage.getItem('mazed-guide-min') === 'true';
    tog.click(); await wait();
    return { open0, min, chipsHidden, kept, back: !g.classList.contains('gd-min') };
  })()`);
  check('guidance box: ▾ collapses it to the title line and the pill at the cursor (kept), ▸ opens it again', gt.open0 && gt.min && gt.chipsHidden && gt.kept && gt.back, gt);

  // arrow keys: they move on from a field that cannot be set (◆), and still move the cursor when a button has the focus
  {
    const sel = () => ev(`(()=>{const d=MazEditor.doc();return {r:d.sel.r,c:d.sel.c,focus:document.activeElement===document.getElementById('input')}})()`);
    const at = await ev(`(()=>{const d=MazEditor.doc(),ls=MazEditor.ctx(d);for(let i=0;i<ls.length-1;i++){const L=ls[i];if(!L.lay)continue;const k=Maz.shownCells(L.lay).find(k=>Maz.locked(L,k));if(k!==undefined){MazEditor.select(i,k);document.getElementById('input').focus();return [i,k]}}return null})()`);
    if (at) {
      await key('ArrowDown');
      const s1 = await sel();
      await ev(`MazEditor.select(${at[0]},${at[1]});document.getElementById('guideTog').focus()`);
      await key('ArrowDown');
      const s2 = await sel();
      check('arrow keys: off a ◆ field, and with a button focused', s1.r !== at[0] && s1.focus && s2.r !== at[0] && s2.focus, { at, s1, s2 });
    } else check('arrow keys: a program with a ◆ field to test on', false);
  }

  // arithmetic in a number field is worked out: 150/2, /2 on the field's value, letters kept; text fields take text
  {
    await open('SLN/Samples/GP-PART7.PBD', 'inch');
    const at = await ev(`(()=>{const d=MazEditor.doc(),ls=MazEditor.ctx(d);for(let i=0;i<ls.length;i++){const L=ls[i];if(!L.lay||L.sel.code!==0xb0)continue;const k=L.lay.cells.findIndex((c,j)=>Maz.cellLabel(L.lay,j)==='C-SP'&&!Maz.locked(L,j));if(k>=0)return [i,k]}return null})()`);
    if (at) {
      const val = () => ev(`(()=>{const d=MazEditor.doc();return Maz.cellText(MazEditor.ctx(d)[${at[0]}],${at[1]},{units:d.units}).trim()})()`);
      const put = async s => { await ev(`MazEditor.setEditing(true);MazEditor.select(${at[0]},${at[1]});document.getElementById('input').focus()`); await type(s); await key('Enter'); };
      const before = await val();
      await put('150/2'); const a = await val(), m = await ev(`document.getElementById('msg').textContent`);
      await put('/3'); const b = await val();
      await put('2+'); const c = await val();
      await put(before);
      check('field arithmetic: 150/2, /3 on the value, a bad sum refused', a === '75' && /150\/2 = 75/.test(m) && b === '25' && c === '25', { a, m, b, c });
    } else check('field arithmetic: a tool line to test on', false);
  }

  // a radius in the guide box shows its diameter (a lathe corner R0.2 -> Ø0.4); a chamfer does not
  {
    await open('SLN/Samples/LATHEPART-MM.PBP', 'metric');
    const g = await ev(`(async()=>{const d=MazEditor.doc(),ls=MazEditor.ctx(d),w=()=>new Promise(r=>setTimeout(r,0));let r=null,ch=null;
      for(let i=0;i<ls.length&&!(r&&ch);i++){const L=ls[i];if(!L.lay||L.sel.code<0xa8||L.sel.code>0xad)continue;for(const k of Maz.shownCells(L.lay)){const v=Maz.cellText(L,k,{units:d.units}).trim();if(!/^[RC]\\d/.test(v))continue;MazEditor.select(i,k);await w();
        const p=document.querySelector('#guide .gd-i.at');if(!p)continue;const dia=p.querySelector('.gd-dia');if(v[0]==='R'&&!r)r=[v,dia&&dia.textContent];if(v[0]==='C'&&!ch)ch=[v,dia&&dia.textContent];}}
      return {r,ch}})()`);
    check('guide: a radius shows its diameter, a chamfer does not', g.r && g.r[1] === 'Ø' + +(2 * parseFloat(g.r[0].slice(1))).toFixed(5) && (!g.ch || g.ch[1] === null), g);
  }

  // control out: the soft keys set and clear byte 87 of the unit; the row is greyed with ⦸; undo takes it back
  {
    await open('SLN/Samples/GP-PART7.PBD', 'inch');
    await open('DIR-A/NUM-A/PRG-L.PBM', 'inch').catch(() => {});
    const has = await ev(`MazEditor.doc().p.ctl`);
    const r = await ev(`(()=>{const d=MazEditor.doc(),ls=MazEditor.ctx(d);return ls.findIndex((L,i)=>L.sel.unit&&L.sel.code!==1&&L.sel.code!==4)})()`);
    if (/^Smooth/.test(has) && r >= 0) {
      await ev(`MazEditor.setEditing(true);MazEditor.select(${r});document.getElementById('input').focus()`);
      const press = id => ev(`(()=>{for(let i=0;i<4;i++){const b=document.querySelector('#softkeys [data-sk="${id}"]');if(b&&!b.disabled){b.click();return true}const n=[...document.querySelectorAll('#softkeys button')].find(x=>/▶/.test(x.textContent)&&!x.disabled);if(!n)return false;n.click()}return false})()`);
      await press('coset');
      const on = await ev(`(()=>{const d=MazEditor.doc();return {co:!!document.querySelector('#lines .ln.co[data-r="${r}"]'),b:d.p.recs[${r}][87]}})()`);
      await ev(`MazEditor.undo ? MazEditor.undo(false) : 0`);
      const off = await ev(`(()=>{const d=MazEditor.doc();return {co:!!document.querySelector('#lines .ln.co[data-r="${r}"]'),b:d.p.recs[${r}][87]}})()`);
      check('control out: CONTROL OUT SET greys the unit (byte 87 = 1), Undo takes it back', on.co && on.b === 1 && !off.co && off.b === 0, { on, off });
    } else console.log('   control out: skipped (no Smooth sample program open)');
  }

  // the unit list at the left: one entry per unit, ⦸ and + marks, the unit at the cursor highlighted, a click goes there
  {
    await open('DIR-A/NUM-A/PRG-K.PBM', 'inch').catch(() => {});
    const u = await ev(`(()=>{const d=MazEditor.doc(),ls=MazEditor.ctx(d),us=Maz.structure(d.p,ls),n=document.getElementById('unitList');
      const items=[...n.querySelectorAll('.ul-i')],last=us[us.length-1];if(!items.length)return null;
      const tgt=items[Math.min(5,items.length-1)];tgt.click();
      return {shown:!n.hidden,count:items.length,units:us.length,out:items.filter(e=>e.classList.contains('co')).length,plus:items.filter(e=>e.querySelector('.ul-p').textContent==='+').length,
        clicked:d.sel.r===+tgt.dataset.ui,cur:[...n.querySelectorAll('.ul-i.cur')].length}})()`);
    if (u) check('unit list: every unit, ⦸ and + marks, click goes to the unit', u.shown && u.count === u.units && u.clicked && u.cur === 1 && u.out === 4 && u.plus === 1, u);
    else console.log('   unit list: skipped (the sample is not open)');
  }

  // the RELAY POINT tab of a TPC: approach and escape points as the control keeps them (a POCKET with every value set)
  if (fs.existsSync(require('./datapaths.js').CHAT + '/EXTRA-01.MAZ')) {
    const b64 = fs.readFileSync(require('./datapaths.js').CHAT + '/EXTRA-01.MAZ').toString('base64');
    await ev(`(()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));MazEditor.openBytes(b,'TPCT.MAZ',null);})()`);
    await sleep(150);
    const rl = await ev(`(async()=>{const d=MazEditor.doc(),ls=MazEditor.ctx(d);const i=ls.findIndex((L,k)=>L.sel.unit&&Maz.number(d.p.recs[k])===19);MazEditor.select(i);MazEditor.softKey('tpc');await new Promise(r=>setTimeout(r,200));
      document.querySelector('[data-tpctab="relay"]').click();await new Promise(r=>setTimeout(r,150));
      const t=[...document.querySelectorAll('#tpcBody .tpcrelay')].map(e=>e.innerText.replace(/\\s+/g,' '));document.getElementById('tpcDlg').close();return t})()`);
    check('TPC relay points: approach and escape, X Y Z M S', rl.length === 2 && /APPROACH.*1 1\.1 1\.2 1\.3 7 8 2 3\.1 3\.2 3\.3 27 28 3 5\.1 5\.2 5\.3 47 48/.test(rl[0]) && /ESCAPE.*1 2\.1 2\.2 2\.3 17 18/.test(rl[1]), rl);
  }

  // a refresh opens the same files again, unsaved changes and the tab at front included
  const rlBefore = await ev(`(() => { const d = MazEditor.doc(); return { n: MazEditor.docs.length, names: MazEditor.docs.map(x => x.p.name), cur: d.p.name, dirty: d.dirty, recs: d.p.recs.length }; })()`);
  await sleep(800);
  await send('Page.reload', {});
  await sleep(2500);
  const rlAfter = await ev(`(() => { const d = MazEditor.doc(); return d ? { n: MazEditor.docs.length, names: MazEditor.docs.map(x => x.p.name), cur: d.p.name, dirty: d.dirty, recs: d.p.recs.length } : null; })()`);
  check('refresh reopens the open files with their unsaved changes', JSON.stringify(rlAfter) === JSON.stringify(rlBefore), { rlBefore, rlAfter });

  const TPCT = require('./datapaths.js').CHAT + '/EXTRA-06.MTP';
  if (fs.existsSync(TPCT)) {
    // turning centre TPC: the unit's own fields with the common TC ones, edited in the record
    await open(TPCT);
    await ev('MazEditor.setEditing(true); document.querySelector(\'[data-units="inch"]\').click()');
    const row = await ev('Array.from(MazEditor.doc().p.recs).findIndex(r => r[0] === 0xf5)');
    await ev(`MazEditor.select(${row}); MazEditor.softKey("tpc")`);
    await sleep(200);
    const tt = await ev(`(() => { const o = {}; document.querySelectorAll('#tpcBody tr').forEach(r => { const c = r.children, i = c[2].querySelector('input'); o[c[0].textContent] = (i ? i.value : c[2].textContent) + (c[2].classList.contains('chg') ? '*' : ''); }); return { title: document.getElementById('tpcTitle').textContent, o }; })()`);
    check('turning TPC: BAR shows its TC fields from the record, changed ones marked', /BAR/.test(tt.title) && tt.o.TC54 === '1.5*' && tt.o.TC1 === '95*' && tt.o.TC62 === '5*' && tt.o.TC45 === '0.0513*', tt);
    await ev(`(() => { const i = document.querySelector('#tpcBody input[data-tpcd="TC54"]'); i.value = '1.969'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(100);
    check('editing a turning TPC value writes it into the record', (await ev(`MazEditor.doc().p.recs[${row}][60] | MazEditor.doc().p.recs[${row}][61] << 8`)) === 19690);
    // CORNER: ROTATE POSITION (rough read, fin empty) and the relay points on the RELAY POINT tab
    const crow = await ev('Array.from(MazEditor.doc().p.recs).findIndex(r => r[0] === 0xf7)');
    await ev(`MazEditor.select(${crow}); MazEditor.softKey("tpc")`);
    await sleep(150);
    await ev(`document.querySelector('#tpcDlg [data-tpctab="relay"]').click()`);
    await sleep(150);
    const rt = await ev(`document.getElementById('tpcBody').textContent`);
    check('turning TPC: CORNER shows ROUGH rotate position values, FIN not used, and the relay points', /ROUGH · ROTATE POSITION/.test(rt) && /SU50\s*0\.0555/.test(rt) && /X\s*7\.1/.test(rt) && /FIN · ROTATE POSITION\s*not used/.test(rt) && /APPROACH · MANU/.test(rt), rt.slice(0, 300));
    // the second variant of a menu value (*OUT) is drawn on a magenta box, the plain one is not
    const PU = require('./datapaths.js').CHAT + '/EXTRA-17.MTP', PL = require('./datapaths.js').CHAT + '/EXTRA-18.MTP';
    if (fs.existsSync(PU) && fs.existsSync(PL)) {
      await open(PU); await sleep(200);
      const star1 = await ev(`Array.from(document.querySelectorAll('.k-star')).map(e => e.textContent.trim()).join(',')`);
      await open(PL); await sleep(200);
      const star2 = await ev(`Array.from(document.querySelectorAll('.k-star')).map(e => e.textContent.trim()).join(',')`);
      check('PART *OUT is a magenta box, plain OUT is not', /\*OUT/.test(star1) && !/OUT/.test(star2), { star1, star2 });
    }
    // TRANSFER (0079): its own fields, and the head M codes on the RELAY POINT tab
    const TPCX = require('./datapaths.js').CHAT + '/EXTRA-14.MTP';
    if (fs.existsSync(TPCX)) {
      await open(TPCX);
      await ev('MazEditor.setEditing(true); document.querySelector(\'[data-units="inch"]\').click()');
      const trow = await ev('Array.from(MazEditor.doc().p.recs).findIndex(r => r[0] === 0xf4)');
      await ev(`MazEditor.select(${trow}); MazEditor.softKey("tpc")`);
      await sleep(150);
      await ev(`document.querySelector('#tpcDlg [data-tpctab="param"]').click()`);
      await sleep(100);
      const tx = await ev(`(() => { const o = {}; document.querySelectorAll('#tpcBody tr').forEach(r => { const c = r.children, i = c[2].querySelector('input'); o[c[0].textContent] = (i ? i.value : c[2].textContent); }); return o; })()`);
      await ev(`document.querySelector('#tpcDlg [data-tpctab="relay"]').click()`);
      await sleep(150);
      const tm = await ev(`document.getElementById('tpcBody').textContent`);
      check('TRANSFER TPC: TC44 0.05, TC57 4.5, TC58 1100 and the head M codes 41 42 51 52', tx.TC44 === '0.05' && tx.TC57 === '4.5' && tx.TC58 === '1100' && tx.TC104 === '1.5' && /HEAD 1 · M CODE41/.test(tm) && /HEAD 2 · M CODE52/.test(tm), { tx, tm: tm.slice(0, 200) });
    }
  }
  }
  console.log(`${passes} passed, ${failures} failed; screenshots in ${shots}`);
  ws.close();
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold files */ }
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); chrome.kill(); process.exit(2); });
