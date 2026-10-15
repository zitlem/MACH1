// End-to-end check of the built CAD page in headless Chrome (DevTools protocol, no packages): it loads offline with
// WebGL 2, points typed in the panel draw a rectangle and a circle, clicks on the screen pick entities for a fillet
// and a trim, undo and redo, a window selection, a copy by translation, the project file and DXF and SVG round trips,
// a Mastercam file turned away politely, and the page throws nothing and fetches nothing from the network.
// usage: node test/cad-browser.js [apps/CAD.html] [screenshot dir]
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const page = path.resolve(process.argv[2] || path.join(__dirname, '../apps/CAD.html'));
const shots = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'cad-shots-'));
fs.mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-prof-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--enable-unsafe-swiftshader', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=' + (process.env.W || 1400) + ',900', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (n, c, d) => { if (c) passes++; else { fails++; console.log('FAIL', n, d === undefined ? '' : '\n   ' + (typeof d === 'string' ? d : JSON.stringify(d))); } };

(async () => {
  let t; for (let i = 0; i < 60; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (e) { await sleep(200); } }
  const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
  let id = 0; const pend = {}, errors = [], requests = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' '));
    if (d.method === 'Network.requestWillBeSent') requests.push(d.params.request.url);
    // a prompt or confirm would stop the page until answered: dismiss it (none is expected)
    if (d.method === 'Page.javascriptDialogOpening') { errors.push('a dialog opened: ' + d.params.message); ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: false } })); }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 80) + ': ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, n), Buffer.from(r.result.data, 'base64')); };
  // a real click on the drawing at a model point (top plane)
  const vpBox = async () => ev(`(()=>{const r=document.getElementById('vp').getBoundingClientRect();return [r.left,r.top]})()`);
  const clickAt = async (x, y, opts = {}) => {
    const [l, tp] = await vpBox(), s = await ev(`(()=>{CADAPP.updProj();return CADAPP.toScreen([${x},${y},0])})()`);
    const X = l + s[0], Y = tp + s[1];
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X, y: Y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: X, y: Y, button: 'left', clickCount: 1, modifiers: opts.shift ? 8 : 0 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X, y: Y, button: 'left', clickCount: 1, modifiers: opts.shift ? 8 : 0 });
    await sleep(60);
  };
  const dragFrom = async (a, b) => {
    const [l, tp] = await vpBox(), s0 = await ev(`CADAPP.toScreen([${a}, 0])`), s1 = await ev(`CADAPP.toScreen([${b}, 0])`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: l + s0[0], y: tp + s0[1], button: 'left', clickCount: 1 });
    for (let k = 1; k <= 5; k++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: l + s0[0] + (s1[0] - s0[0]) * k / 5, y: tp + s0[1] + (s1[1] - s0[1]) * k / 5, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l + s1[0], y: tp + s1[1], button: 'left', clickCount: 1 });
    await sleep(60);
  };
  const typePoint = async txt => {
    await ev(`document.getElementById('ptIn').focus()`);
    await send('Input.insertText', { text: txt });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(60);
  };
  const setField = (k, v) => ev(`(()=>{const i=document.querySelector('#panel [data-f="${k}"]');i.value=${JSON.stringify(v)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const count = () => ev('CADAPP.doc.list().length');
  const area = () => ev(`(()=>{const G=CADGeom,L=CADAPP.doc.list().filter(e=>e.g.t!=='pt'&&!(e.g.t==='arc'&&G.isCircle(e.g))).map(e=>e.g),ch=G.chains(L).find(c=>c.closed&&c.items.length>3);return ch?Math.abs(G.chainArea(G.chainEnts(L,ch))):null})()`);

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: 'file://' + page }); await sleep(1500);
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1500);
  check('loads with WebGL 2', await ev(`!!window.CADAPP && document.getElementById('nogl').style.display !== 'flex'`));

  // a 3 × 2 rectangle by typed points
  await ev(`CADAPP.startCmd('rect')`); await sleep(50);
  await typePoint('0,0'); await typePoint('@3,2');
  check('rectangle from typed points', await count() === 4, await count());
  await ev(`CADAPP.endCmd()`);
  // a Ø1 circle by its centre, the diameter typed in the panel
  await ev(`CADAPP.startCmd('circle')`); await setField('dia', '1'); await typePoint('1.5,1');
  check('circle', await ev(`CADAPP.doc.list().some(e=>CADGeom.isCircle(e.g)&&Math.abs(e.g.r-0.5)<1e-12)`));
  await ev(`CADAPP.endCmd(); CADAPP.fit()`); await sleep(100);
  // fillet the bottom right corner by clicking the two lines on the screen
  await ev(`CADAPP.startCmd('fillet')`); await setField('r', '0.25');
  await clickAt(2.2, 0); await clickAt(3, 1.2);
  const A = await area();
  check('fillet by clicks keeps the right area', A !== null && Math.abs(A - (6 - 0.0625 * (1 - Math.PI / 4))) < 1e-9, A);
  check('fillet: one more entity', await count() === 6, await count());
  await ev(`CADAPP.endCmd()`);
  // undo and redo
  await ev(`CADAPP.ACTIONS.undo()`); check('undo takes the fillet back', await count() === 5 && Math.abs((await area()) - 6) < 1e-9);
  await ev(`CADAPP.ACTIONS.redo()`); check('redo puts it back', await count() === 6);
  // trim the circle out between... divide: a line across the circle, then take its middle out
  await ev(`CADAPP.startCmd('line')`); await typePoint('0.5,1'); await typePoint('2.5,1'); await ev(`CADAPP.endCmd()`);
  await ev(`CADAPP.startCmd('trim')`); await ev(`document.querySelector('#panel [data-f="mode"] [data-v="div"]').click()`);
  await clickAt(1.5, 1);
  check('divide takes the middle of the line out', await ev(`CADAPP.doc.list().filter(e=>e.g.t==='line'&&Math.abs(e.g.a[1]-1)<1e-9).map(e=>CADGeom.length(e.g)).sort().map(v=>+v.toFixed(9)).join(',')`) === '0.5,0.5');
  await ev(`CADAPP.endCmd()`);
  await shot('cad-2d.png');
  // a window round everything, then copy it 5 to the right
  await ev(`CADAPP.view.s *= 1.8; CADAPP.updProj()`); await sleep(50);
  await dragFrom('-0.5, -0.5', '3.5, 2.5');
  const n0 = await count();
  check('window selects everything', await ev('CADAPP.sel.size') === n0, [await ev('CADAPP.sel.size'), n0]);
  await ev(`CADAPP.startCmd('move')`); await setField('dx', '5'); await ev(`document.querySelector('#panel [data-f="op"] [data-v="copy"]').click()`);
  await ev(`CADAPP.finishCmd()`);
  check('translate copies the selection', await count() === 2 * n0, await count());
  // project file, DXF and SVG back in
  const json = await ev(`JSON.stringify(CADAPP.doc.toJSON())`);
  await ev(`CADAPP.openFile(new File([${JSON.stringify(json)}], 'part.mach1cad'))`);
  check('project file reopens', await count() === 2 * n0);
  const n1 = await count();
  await ev(`(async()=>{const t=CADAPP.IO.writeDXF(CADAPP.doc.visible(),[...CADAPP.doc.levels.values()]);await CADAPP.openFile(new File([t],'part.dxf'))})()`);
  check('DXF out and back in', await count() === n1, await count());
  await ev(`(async()=>{const t=CADAPP.IO.writeSVG(CADAPP.doc.visible());await CADAPP.openFile(new File([t],'part.svg'))})()`);
  check('SVG out and back in', await count() === n1, await count());
  check('SVG black comes back in the screen colour', await ev(`CADAPP.doc.list().every(e=>e.col!=='#000000')`));
  await ev(`CADAPP.openFile(new File(['x'], 'part.mcam'))`); await sleep(50);
  check('a Mastercam file is turned away with a way forward', /Save As/.test(await ev(`document.getElementById('toast').textContent`)));
  // a 3D view still draws
  await ev(`CADAPP.setView('iso')`); await sleep(100); await shot('cad-iso.png');
  // ---- 3D: a 2 × 1 × 0.5 in box as an STL in millimetres, opened through the units question
  await ev(`(()=>{const b=CADMesh.box(0,0,0,2,1,0.5);CADAPP.openFile(new File([CADMesh.writeSTL(b,'mm')],'block.stl'));})()`); await sleep(150);
  check('STL asks for its units', await ev(`document.getElementById('dlg').open && /millimetres/i.test(document.getElementById('dlgBody').textContent)`));
  await ev(`document.querySelector('#dlg [data-u="mm"]').click()`); await sleep(200);
  check('STL opens as a body at its size', await ev(`(()=>{const b=[...CADAPP.doc.bodies.values()][0];return !!b&&Math.abs(CADMesh.info(b).volume-1)<1e-5})()`));
  await ev(`CADAPP.fit()`); await sleep(100);
  // the view cube: the TOP face
  const cubeTop = await ev(`(()=>{const r=document.getElementById('vp').getBoundingClientRect();return [r.left+r.width-6-46,r.top+6+46]})()`);
  await ev(`CADAPP.view.q.set(0,0,0,1)`); await ev(`CADAPP.setView('iso')`); await sleep(100);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: cubeTop[0], y: cubeTop[1] - 20, button: 'left', clickCount: 1 });
  await sleep(100);
  check('the view cube: a click on TOP gives the top view', await ev(`CADAPP.view.q.angleTo(new THREE.Quaternion())`) < 1e-6, await ev(`CADAPP.view.q.angleTo(new THREE.Quaternion())`));
  await ev(`CADAPP.setView('iso')`); await sleep(100);
  // pick the body, move it 5 in X
  const bc = await ev(`(()=>{CADAPP.updProj();return CADAPP.toScreen([1,0.5,0.5])})()`), [vl, vt] = await vpBox();
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: vl + bc[0], y: vt + bc[1], button: 'left', clickCount: 1 });
  await sleep(80);
  check('a click on the body selects it', await ev(`[...CADAPP.sel].some(id=>CADAPP.doc.bodies.has(id))`));
  await ev(`CADAPP.startCmd('move')`); await setField('dx', '5'); await ev(`document.querySelector('#panel [data-f="op"] [data-v="move"]').click()`); await ev(`CADAPP.finishCmd()`);
  check('translate moves the body', await ev(`Math.abs(CADMesh.info([...CADAPP.doc.bodies.values()][0]).min[0]-5)<1e-5`));
  // 3D distance between two corners
  await ev(`CADAPP.fit()`); await sleep(100);
  await ev(`CADAPP.startCmd('dist3')`);
  await ev(`CADAPP.feed('point3',[5,0,0]); CADAPP.feed('point3',[7,1,0.5])`);
  check('3D distance', /Distance 2\.2913\b/.test(await ev(`document.querySelector('#panel .info').textContent`)), await ev(`document.querySelector('#panel .info') && document.querySelector('#panel .info').textContent`));
  await ev(`CADAPP.endCmd()`);
  await ev(`CADAPP.startCmd('section')`); await setField('at', '0.25'); await sleep(100); await shot('cad-section.png');
  check('section on', await ev(`CADAPP.clip.length === 1`));
  await ev(`CADAPP.endCmd(); CADAPP.ACTIONS.secoff()`);
  // the body survives the project file, and goes out and back in as 3MF
  const pj = await ev(`JSON.stringify(CADAPP.doc.toJSON())`);
  await ev(`CADAPP.openFile(new File([${JSON.stringify(pj)}], 'b.mach1cad'))`);
  check('project file keeps the body', await ev(`CADAPP.doc.bodies.size === 1 && Math.abs(CADMesh.info([...CADAPP.doc.bodies.values()][0]).volume-1)<1e-5`));
  await ev(`(async()=>{const z=CADMesh.write3MF(CADAPP.doc.visibleBodies(),'mm');await CADAPP.openFile(new File([z],'b.3mf'))})()`); await sleep(100);
  check('3MF out and back in', await ev(`CADAPP.doc.bodies.size === 1 && Math.abs(CADMesh.info([...CADAPP.doc.bodies.values()][0]).min[0]-5)<1e-4`));
  await shot('cad-3d.png');
  // ---- solids: a 2 × 1 plate with a Ø0.25 hole, extruded 0.5, by clicking the chains
  await ev(`CADAPP.ACTIONS.new = CADAPP.ACTIONS.new; CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'plate.mach1cad'))`); await sleep(100);
  await ev(`CADAPP.setView('top')`);
  await ev(`CADAPP.startCmd('rect')`); await typePoint('0,0'); await typePoint('2,1'); await ev(`CADAPP.endCmd()`);
  await ev(`CADAPP.startCmd('circle')`); await setField('dia', '0.25'); await typePoint('1,0.5'); await ev(`CADAPP.endCmd(); CADAPP.fit()`); await sleep(100);
  const kr = await ev(`CADAPP.kernel().then(()=>true,e=>e.message)`);
  check('the solids kernel starts in the page', kr === true, kr);
  await ev(`CADAPP.startCmd('sextrude')`); await setField('dist', '0.5');
  await clickAt(1, 0); await clickAt(1.125, 0.5);
  check('two chains picked', await ev(`CADAPP.S && CADAPP.S.chains && CADAPP.S.chains.length`) === 2, await ev(`CADAPP.S && CADAPP.S.chains`));
  await ev(`CADAPP.finishCmd()`);
  const waitBuild = async n => { for (let i = 0; i < 100; i++) { await sleep(100); const k = await ev(`CADAPP.solids.length === ${n} && [...CADAPP.featStatus.values()].length === CADAPP.doc.feats.length`); if (k) return true; } return false; };
  const vol = () => ev(`CADAPP.solids.reduce((a,s)=>a+s.volume,0)`);
  check('extrude makes the plate with its hole', await waitBuild(1) && Math.abs(await vol() - (1 - Math.PI * 0.125 ** 2 * 0.5)) < 1e-6, await vol());
  // fillet the four upright edges, clicked in the isometric view
  await ev(`CADAPP.setView('iso')`); await sleep(200);
  await ev(`CADAPP.startCmd('sfillet')`); await setField('r', '0.1');
  for (const [x, y] of [[0, 0], [2, 0], [2, 1], [0, 1]]) {
    const [l, tp] = await vpBox(), sc = await ev(`(()=>{CADAPP.updProj();return CADAPP.toScreen([${x},${y},0.25])})()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: l + sc[0], y: tp + sc[1], button: 'left', clickCount: 1 });
    await sleep(60);
  }
  const ne = await ev(`CADAPP.S.edges ? CADAPP.S.edges.length : 0`);
  check('four edges picked by clicking', ne === 4, ne);
  await ev(`CADAPP.finishCmd()`);
  const filleted = 1 - Math.PI * 0.125 ** 2 * 0.5 - 4 * 0.01 * (1 - Math.PI / 4) * 0.5;
  check('fillet by clicked edges', await waitBuild(1) && Math.abs(await vol() - filleted) < 1e-6, await vol());
  await shot('cad-solid.png');
  // edit the extrude to 1 deep: the fillets follow (their edges are found again)
  await ev(`(()=>{const a=document.querySelector('[data-fedit]');a.click()})()`); await sleep(50);
  await setField('dist', '1'); await ev(`CADAPP.finishCmd()`); await sleep(100);
  check('editing a feature rebuilds the rest', await waitBuild(1) && Math.abs(await vol() - 2 * filleted) < 1e-6 && [...(await ev(`[...CADAPP.featStatus.values()].map(s=>s.ok)`))].every(Boolean), await vol());
  // leave the fillet out, then undo that
  await ev(`(()=>{const c=document.querySelectorAll('[data-fsup]')[1];c.click()})()`); await sleep(100);
  check('a feature left out', await waitBuild(1) && Math.abs(await vol() - 2 * (1 - Math.PI * 0.125 ** 2 * 0.5)) < 1e-6, await vol());
  await ev(`CADAPP.ACTIONS.undo()`);
  check('undo brings it back', await waitBuild(1) && Math.abs(await vol() - 2 * filleted) < 1e-6, await vol());
  // STEP out and in as a new drawing: the same volume
  const step = await ev(`CADAPP.kcall('step',{}).then(r=>r.text)`);
  check('STEP is written in millimetres', /MILLI/.test(step) && /ISO-10303-21/.test(step));
  await ev(`CADAPP.openFile(new File([${JSON.stringify(step)}], 'plate.step'))`);
  check('STEP opens as a solid of the same volume', await waitBuild(1) && Math.abs(await vol() - 2 * filleted) < 1e-5 && await ev('CADAPP.doc.feats.length') === 1, await vol());
  await shot('cad-step.png');
  // ---- DWG (LibreDWG's sample) and IGES (occt-import-js's test cube, when the vendoring packages are installed)
  const fileIn = async (file, name) => ev(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(file).toString('base64'))}),c=>c.charCodeAt(0));await CADAPP.openFile(new File([b],${JSON.stringify(name)}))})()`);
  await fileIn(path.join(__dirname, 'data/cad/libredwg-example-2018.dwg'), 'example.dwg');
  const dw = await ev(`({n:CADAPP.doc.list().length, levels:[...CADAPP.doc.levels.values()].map(l=>l.name), arcs:CADAPP.doc.list().filter(e=>e.g.t==='arc').length})`);
  check('DWG opens with its layers', dw.n > 3000 && dw.levels.includes('Tavolo 2') && dw.arcs > 3000, dw);
  await ev(`CADAPP.fit()`); await sleep(150); await shot('cad-dwg.png');
  const cube = path.join(__dirname, '../tools/vendor-cad/node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.igs');
  if (fs.existsSync(cube)) {
    await fileIn(cube, 'cube.igs');
    check('IGES opens as a body at its size', await ev(`(()=>{const b=[...CADAPP.doc.bodies.values()][0];if(!b)return false;const I=CADMesh.info(b);return Math.abs(I.size[0]-10/25.4)<1e-4&&Math.abs(I.volume-(10/25.4)**3)<1e-5})()`));
  } else console.log('NOTE the IGES check needs tools/vendor-cad installed (npm ci): skipped');
  // ---- drafting: a horizontal dimension by typed points, a diameter by clicking the circle, and a note
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'd.mach1cad'))`);
  await ev(`CADAPP.setView('top')`);
  await ev(`CADAPP.startCmd('rect')`); await typePoint('0,0'); await typePoint('3,2'); await ev(`CADAPP.endCmd()`);
  await ev(`CADAPP.startCmd('circle')`); await setField('dia', '0.75'); await typePoint('1.5,1'); await ev(`CADAPP.endCmd(); CADAPP.fit()`); await sleep(100);
  await ev(`CADAPP.startCmd('dimlin')`); await typePoint('0,0'); await typePoint('3,0'); await typePoint('1.5,-0.5'); await ev(`CADAPP.endCmd()`);
  await ev(`CADAPP.startCmd('dimdia')`); await clickAt(1.5 + 0.375, 1); await typePoint('2.5,1.6'); await ev(`CADAPP.endCmd()`);
  await ev(`CADAPP.startCmd('note')`); await setField('s', 'ALL EDGES 0.01 X 45°'); await typePoint('0,2.3'); await ev(`CADAPP.endCmd()`);
  const dims = await ev(`CADAPP.doc.list().filter(e=>e.g.t==='dim').map(e=>CADDraft.dimParts(e.g).texts[0].s).sort().join('|')`);
  check('dimensions measure what was picked', dims === '3.000|Ø0.750', dims);
  check('a note', await ev(`CADAPP.doc.list().some(e=>e.g.t==='text'&&e.g.s==='ALL EDGES 0.01 X 45°')`));
  const dx = await ev(`CADAPP.IO.writeDXF(CADAPP.doc.visible(),[...CADAPP.doc.levels.values()])`);
  check('DXF out has the dimension and note text', /\n1\r?\n3\.000\r?\n/.test(dx) && /%%c0\.750/.test(dx) && /0\.01 X 45%%d/.test(dx));
  await shot('cad-draft.png');
  // ---- every other command, through the page's own command runner (points and picks given directly)
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'all.mach1cad'))`);
  const run = (id, fields, steps) => ev(`(async()=>{
    const A=CADAPP, G=CADGeom, d=A.doc, before=d.list().length, fb=d.feats.length;
    A.startCmd(${JSON.stringify(id)}); const F=${JSON.stringify(fields || {})};
    for (const k in F) { const i=document.querySelector('#panel [data-f="'+k+'"]'); if (!i) return 'no field '+k; if (i.type==='checkbox') { if (i.checked!==F[k]) i.click(); } else if (i.tagName==='DIV') { i.querySelector('[data-v="'+F[k]+'"]').click(); } else { i.value=F[k]; i.dispatchEvent(new Event('input',{bubbles:true})); } }
    const pick = (id2, p) => ({ id: id2, e: d.get(id2), pick: p });
    for (const s of ${JSON.stringify(steps)}) {
      if (s.p) A.feed('point', s.p); else if (s.e !== undefined) A.feed('ent', pick(s.e === 'last' ? Math.max(...d.list().map(x=>x.id)) : s.e === 'first' ? Math.min(...d.list().map(x=>x.id)) : s.e, s.at)); else if (s.sel) { A.sel = new Set(s.sel === 'all' ? d.list().map(x=>x.id) : s.sel); A.finishCmd(); } else if (s.enter) A.finishCmd();
    }
    const msg = document.getElementById('toast').style.display==='block' && document.getElementById('toast').className==='err' ? document.getElementById('toast').textContent : '';
    A.endCmd(); document.getElementById('toast').style.display='none';
    return msg ? 'error: '+msg : (d.list().length - before) + ' ' + (d.feats.length - fb);
  })()`);
  const results = {};
  results.polygon = await run('polygon', { n: '6', r: '0.5' }, [{ p: [5, 5] }]);
  results.slot = await run('obround', { len: '2', w: '0.5' }, [{ p: [5, 8] }]);
  results.spline = await run('spline', {}, [{ p: [0, 8] }, { p: [1, 9] }, { p: [2, 8] }, { enter: 1 }]);
  results.arc3 = await run('arc', { mode: 'three' }, [{ p: [8, 0] }, { p: [9, 1] }, { p: [10, 0] }]);
  results.lineH = await run('line', { mode: 'h', len: '2', chain: false }, [{ p: [0, 10] }]);
  const lid = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  results.parallel = await run('lpar', { dist: '0.25' }, [{ e: lid, at: [1, 10] }, { p: [1, 11] }]);
  results.perp = await run('lperp', {}, [{ e: lid, at: [1, 10] }, { p: [1, 12] }]);
  await run('circle', { mode: 'ctr', dia: '1' }, [{ p: [12, 12] }]);
  const cid = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  results.tangent = await run('ltan', { mode: 'pt' }, [{ e: cid, at: [12, 12.5] }, { p: [15, 12] }]);
  results.offset = await run('offset', { d: '0.1', n: '2' }, [{ e: lid, at: [1, 10] }, { p: [1, 9] }]);
  results.extend = await run('extend', { len: '0.5' }, [{ e: lid, at: [1.9, 10] }]);
  results.break = await run('break', {}, [{ e: lid, at: [1, 10] }, { p: [1.25, 10] }]);
  await run('line', { mode: 'ends', chain: false }, [{ p: [20, 0] }, { p: [22, 0] }]); const la = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  await run('line', { mode: 'ends', chain: false }, [{ p: [22, 0] }, { p: [24, 0] }]); const lb = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  results.join = await run('join', {}, [{ e: la, at: [21, 0] }, { e: lb, at: [23, 0] }]);
  await run('line', { mode: 'ends', chain: false }, [{ p: [30, 0] }, { p: [33, 0] }]); const ca = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  await run('line', { mode: 'ends', chain: false }, [{ p: [30, 0] }, { p: [30, 3] }]); const cb = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  results.chamfer = await run('chamfer', { d1: '0.2' }, [{ e: ca, at: [32, 0] }, { e: cb, at: [30, 2] }]);
  await run('rect', { mode: 'corner' }, [{ p: [40, 0] }, { p: [42, 1] }]); const rid = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  results.chainoffset = await run('coffset', { d: '0.1' }, [{ e: rid, at: [40, 0.5] }, { p: [45, 0.5] }]);
  results.area = await run('area', {}, [{ e: rid, at: [40, 0.5] }]);
  results.rotate = await run('rotate', { ang: '45', op: 'copy', n: '2' }, [{ sel: [rid] }, { p: [40, 0] }]);
  results.mirror = await run('mirror', { axis: 'y', op: 'copy' }, [{ sel: [rid] }, { p: [39, 0] }]);
  results.scale = await run('scale', { k: '2', op: 'copy', n: '1' }, [{ sel: [rid] }, { p: [40, 0] }]);
  results.arect = await run('arect', { nx: '3', ny: '2', dx: '3', dy: '2' }, [{ sel: [rid] }]);
  results.apolar = await run('apolar', { n: '4', ang: '360' }, [{ sel: [rid] }, { p: [50, 0] }]);
  results.breakx = await run('breakx', {}, [{ sel: [ca, cb, lid] }]);
  results.xline = await run('xline', { mode: 'ang', ang: '30' }, [{ p: [0, 14] }]);
  // solids from the page's commands
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'sol.mach1cad'))`);
  results.box = await run('sbox', { h: '1', op: 'new' }, [{ p: [0, 0] }, { p: [2, 2] }]);
  results.cyl = await run('scyl', { dia: '0.5', h: '3', op: 'new' }, [{ p: [1, 1] }]);
  results.bool = await ev(`(async()=>{for(let i=0;i<80&&CADAPP.solids.length<2;i++)await new Promise(r=>setTimeout(r,100));CADAPP.startCmd('sbool');document.querySelector('#panel [data-f="op"] [data-v="cut"]').click();const s=CADAPP.solids;CADAPP.feed('body',{id:s[0].key,solid:s[0]});CADAPP.feed('body',{id:s[1].key,solid:s[1]});CADAPP.endCmd();for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100));if(CADAPP.solids.length===1&&CADAPP.featStatus.size===3)break}return CADAPP.solids.length+' '+CADAPP.solids[0].volume.toFixed(6)})()`);
  await run('circle', { mode: 'ctr', dia: '0.25' }, [{ p: [0.5, 0.5] }]); const hc = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  await ev(`CADAPP.setAct = 0`);
  results.hole = await run('shole', { depth: '0.5', through: true }, [{ e: hc, at: [0.625, 0.5] }, { enter: 1 }]);
  await run('rect', { mode: 'corner' }, [{ p: [5, 0] }, { p: [6, 1] }]); const pr = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  await ev(`(()=>{const d=CADAPP.doc;d.add([CADGeom.line([4,-1],[4,3])])})()`); const ax = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  results.revolve = await run('srevolve', { angle: '90', op: 'new' }, [{ e: pr, at: [5.5, 0] }, { enter: 1 }, { e: ax, at: [4, 1] }]);
  const done = await ev(`(async()=>{for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));if(CADAPP.featStatus.size===CADAPP.doc.feats.length&&!document.getElementById('kstat').textContent.startsWith('Building'))break}return JSON.stringify({solids:CADAPP.solids.map(s=>s.key+':'+s.volume.toFixed(5)),status:[...CADAPP.featStatus.values()].map(s=>s.ok?'ok':s.err)})})()`);
  const bad = Object.entries(results).filter(([k, v]) => /^error|no field/.test(String(v)));
  check('every command runs', bad.length === 0, bad);
  // a 2 × 2 × 1 box, less the Ø0.5 cylinder through it (π 0.25² × 1) and the Ø0.25 hole (π 0.125² × 1)
  const plate = 4 - Math.PI * 0.25 ** 2 - Math.PI * 0.125 ** 2, sv = JSON.parse(done).solids.map(x => +x.split(':')[1]);
  // the ring: a 1 × 1 square from 1 to 2 off the axis, turned 90°: π/4 (2² − 1²) × 1
  check('the solids commands build: box − cylinder, a hole, a revolve', /"status":\["ok","ok","ok","ok","ok"\]/.test(done) && Math.abs(sv[0] - plate) < 1e-4 && Math.abs(sv[1] - Math.PI / 4 * 3) < 1e-4, done);
  const made = Object.entries(results).filter(([k, v]) => !/^error/.test(String(v)) && String(v).split(' ').every(x => x === '0') && !/area|break|extend|join|bool/.test(k));
  check('every drawing command made something', made.length === 0, made);
  // ---- PDF: the page's own PDF of a drawing comes back in at full size, circles as circles
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'p.mach1cad'))`);
  await ev(`(()=>{const d=CADAPP.doc;d.add([CADGeom.line([0,0],[3,0]),CADGeom.line([3,0],[3,2]),CADGeom.circle([1.5,1],0.5),CADGeom.arc([0,1],1,-Math.PI/2,Math.PI/2)])})()`);
  await ev(`(async()=>{const t=CADAPP.IO.writePDF(CADAPP.doc.visible());await CADAPP.openFile(new File([t],'drawing.pdf'))})()`); await sleep(200);
  const pd = await ev(`(()=>{const L=CADAPP.doc.list().map(e=>e.g),c=L.find(g=>g.t==='arc'&&CADGeom.isCircle(g)),ln=L.filter(g=>g.t==='line').map(g=>CADGeom.length(g)).sort((a,b)=>b-a);return {n:L.length,r:c&&c.r,len:ln[0],arcs:L.filter(g=>g.t==='arc'&&!CADGeom.isCircle(g)).length}})()`);
  check('PDF comes back in at size, the circle as a circle', pd.n === 4 && Math.abs(pd.r - 0.5) < 1e-3 && Math.abs(pd.len - 3) < 1e-3 && pd.arcs === 1, pd);
  // ---- levels: an entity, a body and a solid moved to a new level; hidden with it; undone; copied
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'lv.mach1cad'))`);
  await ev(`(async()=>{const d=CADAPP.doc;d.add([CADGeom.line([0,0],[2,0]),CADGeom.circle([1,1],0.5)]);d.addBody({kind:'mesh',pos:CADMesh.box(3,0,0,4,1,1).pos,name:'cube'});CADAPP.startCmd('sbox');CADAPP.feed('point',[5,0]);CADAPP.feed('point',[6,1]);for(let i=0;i<100&&!CADAPP.shownSolids.length;i++)await new Promise(r=>setTimeout(r,100))})()`);
  const all = await ev(`[...CADAPP.doc.ents.keys(),...CADAPP.doc.bodies.keys(),...CADAPP.shownSolids]`);
  await ev(`CADAPP.sel=new Set(${JSON.stringify(all)});CADAPP.startCmd('chlevel')`);
  await ev(`(()=>{const sl=document.querySelector('#panel select[data-f="to"]');sl.value='new';sl.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await setField('name', 'Fixture'); await ev(`document.getElementById('cOk').click()`); await sleep(200);
  const lv1 = await ev(`JSON.stringify([CADAPP.doc.level(2).name,CADAPP.doc.list().map(e=>e.lv),[...CADAPP.doc.bodies.values()].map(b=>b.lv),CADAPP.doc.feats.map(f=>f.lv)])`);
  check('Change level moves entities, bodies and solids to a new level', lv1 === '["Fixture",[2,2],[2],[2]]', lv1);
  await ev(`(()=>{const c=document.querySelector('[data-lvis="2"]');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(200);
  check('hiding the level hides all three', await ev(`CADAPP.shownEnts.length+CADAPP.shownBodies.length+CADAPP.shownSolids.length`) === 0);
  await ev(`CADAPP.ACTIONS.undo(); CADAPP.ACTIONS.undo()`); await sleep(200);
  check('undo puts them back on level 1, shown', await ev(`CADAPP.shownEnts.length+CADAPP.shownBodies.length+CADAPP.shownSolids.length`) === 4 && await ev(`CADAPP.doc.list().every(e=>e.lv===1)&&CADAPP.doc.levels.size===1`));
  await ev(`(()=>{const d=CADAPP.doc;d.setLevel(2,{name:'Copies',vis:true});CADAPP.sel=new Set(d.list().map(e=>e.id));CADAPP.startCmd('chlevel')})()`);
  await ev(`(()=>{const sl=document.querySelector('#panel select[data-f="to"]');sl.value='2';sl.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#panel [data-f="op"] [data-v="copy"]').click()})()`);
  await ev(`document.getElementById('cOk').click()`); await sleep(100);
  check('Copy to a level leaves the originals', await ev(`JSON.stringify(CADAPP.doc.list().map(e=>e.lv).sort())`) === '[1,1,2,2]');

  // ---- selecting a level, deleting one (its things moved, or deleted), Select by, Invert, Select last, Remove
  // duplicates and the history list
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true},{n:2,name:'Fixture',vis:true}]})], 'sel.mach1cad'))`);
  await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.add([G.line([0,0],[2,0]),G.circle([1,1],0.5)]);d.add([G.line([0,3],[2,3]),G.arc([5,5],1,0,1)],{lv:2});d.addBody({kind:'mesh',pos:CADMesh.box(3,0,0,4,1,1).pos,name:'cube'},{lv:2});CADAPP.sel=new Set()})()`); await sleep(100);
  const lsBtn = async (n, shift) => { await ev(`(()=>{const b=document.querySelector('[data-lsel="${n}"]');b.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:${!!shift}}))})()`); await sleep(50); return ev(`[...CADAPP.sel].length`); };
  const s2 = await lsBtn(2), s21 = await lsBtn(1, true);
  check('a level\'s select button takes what is on it; with Shift it adds', s2 === 3 && s21 === 5, [s2, s21]);
  await ev(`(()=>{CADAPP.sel=new Set();document.querySelector('[data-ldel="2"]').click()})()`); await sleep(50);
  const dq = await ev(`document.getElementById('dlg').open && document.getElementById('dlgBody').textContent`);
  check('deleting a level with things on it asks what to do with them', /2 entities, 1 body/.test(dq || ''), dq);
  await ev(`(()=>{document.getElementById('ldTo').value='1';document.querySelector('[data-ldgo="move"]').click()})()`); await sleep(100);
  check('Move them: the level goes, what was on it is on level 1', await ev(`!CADAPP.doc.levels.has(2) && CADAPP.doc.list().every(e=>e.lv===1) && [...CADAPP.doc.bodies.values()].every(b=>b.lv===1)`));
  await ev(`CADAPP.ACTIONS.undo()`); await sleep(50);
  check('undo brings the level back with its things', await ev(`CADAPP.doc.levels.has(2) && CADAPP.doc.list().filter(e=>e.lv===2).length===2`));
  await ev(`document.querySelector('[data-ldel="2"]').click()`); await sleep(50); await ev(`document.querySelector('[data-ldgo="delete"]').click()`); await sleep(100);
  const dl2 = await ev(`[CADAPP.doc.levels.has(2), CADAPP.doc.list().length, CADAPP.doc.bodies.size]`);
  await ev(`CADAPP.ACTIONS.undo()`); await sleep(50);
  check('Delete them too: the level and its things go, and undo brings them back', JSON.stringify(dl2) === '[false,2,0]' && await ev(`CADAPP.doc.list().length===4 && CADAPP.doc.bodies.size===1`), dl2);
  await run('selby', Object.fromEntries(['pt', 'line', 'circle', 'spline', 'xline', 'text', 'dim', 'body', 'solid'].map(k => ['k_' + k, false])), [{ enter: 1 }]);
  check('Select by: the arcs only', await ev(`[...CADAPP.sel].length===1 && CADAPP.doc.get([...CADAPP.sel][0]).g.t==='arc'`), await ev(`[...CADAPP.sel]`));
  await ev(`CADAPP.ACTIONS.selinv()`);
  check('Invert takes everything else shown', await ev(`[...CADAPP.sel].length`) === 4, await ev(`[...CADAPP.sel].length`));
  await run('rect', { mode: 'corner' }, [{ p: [10, 0] }, { p: [12, 1] }]); await ev(`CADAPP.ACTIONS.sellast()`);
  check('Select last takes the rectangle just drawn', await ev(`[...CADAPP.sel].length===4 && [...CADAPP.sel].every(id=>CADAPP.doc.get(id).g.a[0]>=10)`));
  await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.add([G.line([2,0],[0,0]),G.line([0.5,0],[1.5,0]),G.circle([1,1],0.5)]);d.add([G.line([0,0],[2,0])],{col:'#ff5a4f'});CADAPP.sel=new Set()})()`);
  const c0 = await count(), dd = await run('deldup', { over: false }, [{ enter: 1 }]), c1 = await count(), dd2 = await run('deldup', { over: true }, [{ enter: 1 }]), c2 = await count();
  check('Remove duplicates: a reversed copy and a circle on a circle go, not the red one; then the piece lying on the line', c0 - c1 === 2 && c1 - c2 === 1 && await ev(`CADAPP.doc.list().some(e=>e.col==='#ff5a4f')`), [c0, c1, c2, dd, dd2]);
  // the history: a timeline at the bottom, an icon a step; hovering tells what a step did; a click goes to it
  const steps = await ev(`CADAPP.doc.undoStack.length`);
  const tl = await ev(`(()=>{const B=[...document.querySelectorAll('#timeline [data-hist]')];return {n:B.length,icons:B.every(b=>b.querySelector('svg')&&b.querySelector('svg').innerHTML.length>20),labels:B.some(b=>b.textContent.trim()),last:B[B.length-1].dataset.icon==='deldup'&&B[B.length-2].dataset.icon==='deldup'&&B.slice(1).every(b=>b.dataset.icon!=='step'),cur:B[B.length-1].classList.contains('cur')}})()`);
  check('the history is a timeline of icons at the bottom, one a step, no labels; the latest is where you are', tl.n === steps + 1 && tl.icons && !tl.labels && tl.last && tl.cur, [tl, await ev(`[...document.querySelectorAll('#timeline [data-hist]')].map(b=>b.dataset.icon+':'+b.getAttribute('aria-label'))`)]);
  const hb = async k => ev(`(()=>{const r=document.querySelector('#timeline [data-hist="${k}"]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  { const [x, y] = await hb(steps); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(80); }
  const tip = await ev(`(()=>{const t=document.getElementById('tip');return t.hidden?'':t.textContent})()`);
  check('hovering over a step tells what it did', /Remove duplicates/.test(tip) && /taken away/.test(tip) && /where you are/.test(tip), tip);
  { const [x, y] = await hb(steps - 2); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); await sleep(80); }
  const back3 = [await ev(`CADAPP.doc.undoStack.length`), await count(), await ev(`document.querySelectorAll('#timeline .undone').length`)];
  { const [x, y] = await hb(steps); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); await sleep(80); }
  await ev(`(()=>{CADAPP.sel=new Set([CADAPP.doc.list()[0].id]);document.querySelector('[data-tab="Home"]').click()})()`); await sleep(150); await shot('cad-home.png');
  check('History: a click on a step goes back two (they show greyed after the mark), and another forward again', back3[0] === steps - 2 && back3[1] === c0 && back3[2] === 2 && await ev(`CADAPP.doc.undoStack.length`) === steps && await count() === c2, [steps, back3, await count()]);

  // ---- changing what was drawn: numbers typed in the panel, a grip dragged with the mouse (what is joined follows),
  // a rectangle's sizes, and the shape kept through a move but not a break
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'edit.mach1cad'))`);
  await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.batch('Part',()=>d.add([G.line([0,0],[2,0]),G.arc([2,1],1,-Math.PI/2,Math.PI/2),G.line([3,1],[3,3]),G.line([3,3],[0,3]),G.line([0,3],[0,0])]));CADAPP.sel=new Set();CADAPP.setView('top');CADAPP.fit()})()`); await sleep(150);
  await clickAt(1, 3);
  const top = await ev(`[...CADAPP.sel][0]`), u0 = await ev(`CADAPP.doc.undoStack.length`);
  await ev(`(()=>{const i=document.querySelector('#panel [data-ed="len"]');i.value='5';i.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(50);
  const len5 = await ev(`CADGeom.length(CADAPP.doc.get(${top}).g)`);
  check('a line\'s length typed in the panel: one step', Math.abs(len5 - 5) < 1e-9 && await ev(`CADAPP.doc.undoStack.length`) === u0 + 1, [len5, top]);
  await ev(`CADAPP.ACTIONS.undo()`);
  // drag the end the bottom line shares with the arc, with the real mouse
  await clickAt(1, 0); await sleep(50);
  const ng = await ev(`CADAPP.grips.length`);
  {
    const [l, tp] = await vpBox(), q0 = await ev(`(()=>{CADAPP.updProj();return CADAPP.toScreen([2,0,0])})()`), q1 = await ev(`(()=>{CADAPP.updProj();return CADAPP.toScreen([1.4,0.5,0])})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: l + q0[0], y: tp + q0[1], button: 'left', clickCount: 1 });
    for (let k = 1; k <= 6; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: l + q0[0] + (q1[0] - q0[0]) * k / 6, y: tp + q0[1] + (q1[1] - q0[1]) * k / 6, buttons: 1 }); await sleep(30); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l + q1[0], y: tp + q1[1], button: 'left', clickCount: 1 });
    // the page takes the release after its queued moves, a frame or two later here
    for (let i = 0; i < 60 && await ev('!!CADAPP.drag'); i++) await sleep(50);
  }
  const dr = await ev(`(()=>{const d=CADAPP.doc,L=d.list(),b=L.find(e=>e.g.t==='line'&&Math.abs(e.g.a[0])<1e-9&&Math.abs(e.g.a[1])<1e-9),a=L.find(e=>e.g.t==='arc');return {b:b&&b.g.b,as:CADGeom.start(a.g),ae:CADGeom.end(a.g),closed:CADAPP.isClosedChain(b)}})()`);
  check('dragging a grip moves the end, and the arc joined there follows, still joined', ng === 3 && Math.hypot(dr.b[0] - 1.4, dr.b[1] - 0.5) < 0.02 && Math.hypot(dr.as[0] - dr.b[0], dr.as[1] - dr.b[1]) < 1e-9 && Math.hypot(dr.ae[0] - 3, dr.ae[1] - 1) < 1e-9 && dr.closed, [ng, dr]);
  // a rectangle remembers its sizes: its width changed from the panel
  await ev(`(()=>{const d=CADAPP.doc;d.remove(d.list().map(e=>e.id))})()`);
  await run('rect', { mode: 'corner', w: '', h: '', r: '0' }, [{ p: [0, 0] }, { p: [2, 1] }]);
  await ev(`CADAPP.fit()`); await sleep(100); await clickAt(1, 1);
  const hasBox = await ev(`!!document.querySelector('#panel [data-sh="w"]')`);
  await ev(`(()=>{const i=document.querySelector('#panel [data-sh="w"]');i.value='4';i.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(50);
  const ra = await ev(`(()=>{const L=CADAPP.doc.list(),c=CADGeom.chains(L.map(e=>e.g));return {n:L.length,area:Math.abs(CADGeom.chainArea(CADGeom.chainEnts(L.map(e=>e.g),c[0]))),w:L[0].sh&&L[0].sh.p.w,sel:CADAPP.sel.size,ok:CADAPP.shapeOf(L[0].sh.k).ok}})()`);
  check('a rectangle\'s width changed in the panel: the whole rectangle is drawn again', hasBox && ra.n === 4 && Math.abs(ra.area - 4) < 1e-9 && ra.w === 4 && ra.sel === 4 && ra.ok, ra);
  await ev(`CADAPP.fit()`); await sleep(100); await clickAt(3, 0.5); await sleep(100); await shot('cad-edit.png');
  await run('move', { dx: '1', dy: '2', op: 'move' }, [{ sel: 'all' }]);
  await ev(`CADAPP.fit()`); await sleep(100); await clickAt(2, 2);
  const kept = await ev(`(()=>{const i=document.querySelector('#panel [data-sh="cx"]');return i&&+i.value})()`);
  // the 4 × 1 rectangle round (1, 0.5), moved by (1, 2): round (2, 2.5)
  check('moved whole, it is still a rectangle, its centre moved', Math.abs(kept - 2) < 1e-9, kept);
  const rside = await ev(`CADAPP.doc.list().find(e=>e.g.t==='line'&&Math.abs(e.g.a[1]-e.g.b[1])<1e-9&&Math.abs(e.g.a[1]-2)<1e-9).id`);
  await run('break', {}, [{ e: rside, at: [2.5, 2] }, { p: [2.5, 2] }]);
  await ev(`CADAPP.fit()`); await sleep(100); await clickAt(4, 2.5);
  check('broken, it is plain lines: the panel says so', /can no longer be changed together/.test(await ev(`document.getElementById('panel').textContent`)) && !(await ev(`!!document.querySelector('#panel [data-sh]')`)), [await ev(`[...CADAPP.sel].map(id=>CADAPP.doc.get(id))`), await ev(`document.querySelector('#selList') && document.querySelector('#selList').parentNode.textContent.slice(0,400)`)]);

  // ---- shop wireframe: each command, with what it should make
  {
    await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'shop.mach1cad'))`);
    const last = () => ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`), L = () => ev(`CADAPP.doc.list().length`), info = () => ev(`(document.querySelector('#panel .info')||{}).textContent||''`);
    const sh = {};
    sh.bolt = await run('bolt', { n: '8', dia: '4', what: 'pt', ring: true }, [{ p: [0, 0] }]);
    const bp = await ev(`CADAPP.doc.list().filter(e=>e.g.t==='pt').map(e=>Math.hypot(...e.g.p).toFixed(9))`);
    check('Bolt circle: 8 points on a Ø4 circle, and the circle as construction', bp.length === 8 && bp.every(v => v === '2.000000000') && await ev(`CADAPP.doc.list().some(e=>e.cons&&CADGeom.isCircle(e.g)&&Math.abs(e.g.r-2)<1e-12)`), [sh.bolt, bp]);
    await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.add([G.circle([10,0],0.5),G.circle([10,0],0.25),G.arc([13,0],1,0,1)])})()`);
    const n0 = await L(); sh.ctrpts = await run('ctrpts', {}, [{ sel: await ev(`CADAPP.doc.list().filter(e=>e.g.t==='arc'&&e.g.c[0]>=10).map(e=>e.id)`) }]);
    check('Arc centres: one point for two circles sharing a centre, one for the arc', await L() - n0 === 2 && await ev(`CADAPP.doc.list().filter(e=>e.g.t==='pt'&&Math.abs(e.g.p[0]-10)<1e-12).length`) === 1, sh.ctrpts);
    await run('line', { mode: 'ends', chain: false }, [{ p: [0, 10] }, { p: [4, 10] }]); const ln = await last();
    const n1 = await L(); sh.ptsalong = await run('ptsalong', { mode: 'n', n: '5', ends: true }, [{ e: ln, at: [2, 10] }]);
    check('Points along a curve: 5 at equal steps, ends too', await L() - n1 === 5 && await ev(`CADAPP.doc.list().filter(e=>e.g.t==='pt'&&Math.abs(e.g.p[1]-10)<1e-12).map(e=>e.g.p[0]).sort((a,b)=>a-b).join()`) === '0,1,2,3,4', sh.ptsalong);
    const n2 = await L(); sh.breakn = await run('breakn', { mode: 'n', n: '4' }, [{ e: ln, at: [2, 10] }]);
    check('Break into pieces: the line in 4', await L() - n2 === 3 && await ev(`CADAPP.doc.list().filter(e=>e.g.t==='line'&&Math.abs(e.g.a[1]-10)<1e-12).every(e=>Math.abs(CADGeom.length(e.g)-1)<1e-12)`), sh.breakn);
    sh.ellipse = await run('ellipse', { rx: '2', ry: '1', ang: '0' }, [{ p: [20, 0] }]);
    check('Ellipse: area π·2·1, and it keeps its sizes', await ev(`(()=>{const e=CADAPP.doc.get(Math.max(...CADAPP.doc.list().map(x=>x.id)));return Math.abs(Math.abs(CADGeom.chainArea([e.g]))-2*Math.PI)<1e-7&&e.sh&&e.sh.type==='ellipse'&&CADAPP.shapeOf(e.sh.k).ok})()`), sh.ellipse);
    sh.closearc = await run('closearc', {}, [{ e: await ev(`CADAPP.doc.list().find(e=>e.g.t==='arc'&&!CADGeom.isCircle(e.g)).id`), at: [13.9, 0.5] }]);
    check('Close arc: the arc becomes its circle', await ev(`CADAPP.doc.list().some(e=>CADGeom.isCircle(e.g)&&Math.abs(e.g.c[0]-13)<1e-12)`), sh.closearc);
    await run('rect', { mode: 'corner', w: '', h: '', r: '0' }, [{ p: [30, 0] }, { p: [33, 2] }]); const rr = await last();
    sh.cfillet = await run('cfillet', { r: '0.25', which: 'all' }, [{ e: rr, at: [30, 1] }]);
    const fa = await ev(`(()=>{const L=CADAPP.doc.list().filter(e=>e.g.t!=='pt'&&CADGeom.bbox(e.g)[0]>=29.9&&CADGeom.bbox(e.g)[2]<=33.1),c=CADGeom.chains(L.map(e=>e.g));return c.length===1&&c[0].closed?Math.abs(CADGeom.chainArea(CADGeom.chainEnts(L.map(e=>e.g),c[0]))):-1})()`);
    check('Fillet chain: all four corners of a 3 × 2 rectangle at R0.25', Math.abs(fa - (6 - (1 - Math.PI / 4) * 0.25)) < 1e-9, [sh.cfillet, fa]);
    await run('rect', { mode: 'corner' }, [{ p: [40, 0] }, { p: [43, 2] }]); const rc = await last();
    sh.cchamfer = await run('cchamfer', { r: '0.25', which: 'all' }, [{ e: rc, at: [40, 1] }]);
    const ca = await ev(`(()=>{const L=CADAPP.doc.list().filter(e=>e.g.t!=='pt'&&CADGeom.bbox(e.g)[0]>=39.9&&CADGeom.bbox(e.g)[2]<=43.1),c=CADGeom.chains(L.map(e=>e.g));return c.length===1&&c[0].closed?Math.abs(CADGeom.chainArea(CADGeom.chainEnts(L.map(e=>e.g),c[0]))):-1})()`);
    check('Chamfer chain: four 0.25 chamfers', Math.abs(ca - (6 - 4 * 0.03125)) < 1e-9, [sh.cchamfer, ca]);
    await run('line', { mode: 'ends', chain: false }, [{ p: [50, 0] }, { p: [52, 0] }]); const sl = await last();
    sh.stretch = await run('stretch', { dx: '1', dy: '0.5' }, [{ p: [51.5, -1] }, { p: [53, 1] }]);
    check('Stretch: the end inside the window moves', await ev(`(()=>{const g=CADAPP.doc.get(${sl}).g;return Math.abs(g.b[0]-53)<1e-12&&Math.abs(g.b[1]-0.5)<1e-12&&g.a[0]===50})()`), sh.stretch);
    await ev(`(()=>{const d=CADAPP.doc;d.remove(d.list().map(e=>e.id))})()`);
    await run('rect', { mode: 'corner' }, [{ p: [5, 5] }, { p: [7, 6] }]);
    sh.toorigin = await run('toorigin', { op: 'move' }, [{ sel: 'all' }, { p: [5, 5] }]);
    check('To origin: the corner goes to 0, 0 (and the rectangle stays one)', await ev(`(()=>{const L=CADAPP.doc.list(),b=L.map(e=>CADGeom.bbox(e.g));return Math.min(...b.map(x=>x[0]))===0&&Math.min(...b.map(x=>x[1]))===0&&CADAPP.shapeOf(L[0].sh.k).ok})()`), sh.toorigin);
    sh.bbox = await run('bbox', { kind: 'rect', sx: '0.1', sy: '0.2' }, [{ enter: 1 }]);
    check('Bounding box: a rectangle round it all, with the stock', await ev(`(()=>{const L=CADAPP.doc.list(),k=Math.max(...L.map(e=>e.id)),e=CADAPP.doc.get(k);return e.sh&&Math.abs(e.sh.p.w-2.2)<1e-12&&Math.abs(e.sh.p.h-1.4)<1e-12&&Math.abs(e.sh.p.c[0]-1)<1e-12})()`), sh.bbox);
    await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.remove(d.list().map(e=>e.id));d.add([G.line([0,0],[2,0]),G.line([2,0],[2,1]),G.line([2,1],[0,1.005]),G.line([0,1],[0,0]),G.line([0.5,0],[1,0]),G.line([5,5],[5.0005,5])]);CADAPP.sel=new Set()})()`);
    sh.chainck = await run('chainck', { gap: '0.01', short: '0.001' }, [{ enter: 1 }]);
    const picked = await ev(`[...CADAPP.sel].length`);
    await ev(`CADAPP.sel=new Set();CADAPP.startCmd('chainck');CADAPP.finishCmd()`); const ck = await info(); await ev('CADAPP.endCmd()');
    // the gap at the top left, the piece lying on the bottom line (its ends are loose), the short line (its too)
    check('Check chains: the gap, the overlap, the short line and the loose ends', /Gaps up to 0\.01: 1\b/.test(ck) && /Overlaps and duplicates: 1/.test(ck) && /Shorter than 0\.001: 1/.test(ck) && /Open ends: 4/.test(ck) && picked === 4, [ck, picked]);
    const bad = Object.entries(sh).filter(([k, v]) => /^error|no field/.test(String(v)));
    check('every shop command runs', bad.length === 0, bad);
    await ev(`(()=>{document.querySelector('[data-tab="Wireframe"]').click()})()`); await sleep(100); await shot('cad-wire.png');
  }

  // ---- drafting extras: centre lines, a leader, an ordinate from a datum, a hatch with a hole, notes to lines
  {
    await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'draft2.mach1cad'))`);
    await run('rect', { mode: 'corner' }, [{ p: [0, 0] }, { p: [4, 2] }]); const rq = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
    await run('circle', { mode: 'ctr', dia: '1' }, [{ p: [2, 1] }]); const cq = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
    const dr = {};
    dr.ctrmark = await run('ctrmark', { kind: 'lines', over: '0.0625' }, [{ e: cq, at: [2.5, 1] }]);
    check('Centre lines: two centre-style lines across the circle and past it', await ev(`CADAPP.doc.list().filter(e=>e.ls==='center'&&e.g.t==='line'&&Math.abs(CADGeom.length(e.g)-1.125)<1e-12).length`) === 2, dr.ctrmark);
    dr.leader = await run('leader', { s: 'DRILL THRU', h: '0.125' }, [{ p: [2.4, 1.3] }, { p: [3.5, 3] }, { enter: 1 }]);
    check('Leader: an arrow, a shelf and its text', await ev(`CADAPP.doc.list().some(e=>e.g.t==='dim'&&e.g.kind==='lead'&&e.g.s==='DRILL THRU'&&e.g.pts.length===2)`), dr.leader);
    dr.dimord = await run('dimord', { axis: 'x', dec: '3' }, [{ p: [0, 0] }, { p: [4, 2] }, { p: [4, 2.6] }, { p: [2, 1] }, { p: [2, 2.6] }]);
    check('Ordinate: two X values from one datum', JSON.stringify(await ev(`CADAPP.doc.list().filter(e=>e.g.kind==='ordx').map(e=>CADDraft.label(e.g,CADDraft.value(e.g))).sort()`)) === '["2.000","4.000"]', dr.dimord);
    dr.hatch = await run('hatch', { ang: '45', sp: '0.1', pat: 'lines' }, [{ e: rq, at: [0, 1] }, { e: cq, at: [2.5, 1] }, { enter: 1 }]);
    const ht = await ev(`(()=>{const h=CADAPP.doc.list().find(e=>e.g.t==='hatch');if(!h)return null;const L=CADDraft.hatchLines(h.g);return {loops:h.g.loops.length,n:L.length,inHole:L.some(l=>CADGeom.dist([(l[0][0]+l[1][0])/2,(l[0][1]+l[1][1])/2],[2,1])<0.49),len:L.reduce((a,l)=>a+CADGeom.dist(l[0],l[1]),0)}})()`);
    // the rectangle less the hole: (8 − π/4) in², over 0.1 apart
    check('Hatch: the rectangle with the circle as a hole', ht && ht.loops === 2 && !ht.inHole && Math.abs(ht.len - (8 - Math.PI / 4) / 0.1) < 0.5, [dr.hatch, ht]);
    const hid = await ev(`CADAPP.doc.list().find(e=>e.g.t==='hatch').id`);
    check('a hatch is not part of a chain: the rectangle still extrudes', await ev(`CADAPP.isClosedChain(CADAPP.doc.get(${rq}))`));
    await run('note', { s: 'AB', h: '0.25', a: '0' }, [{ p: [0, -1] }]); const nid = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
    const segs = await ev(`CADDraft.strokes(CADAPP.doc.get(${nid}).g).reduce((a,P)=>a+P.length-1,0)`), n0 = await count();
    dr.explode = await run('explode', {}, [{ sel: [nid] }]);
    check('Note to lines: the note becomes the lines of its letters', await count() - n0 === segs - 1 && await ev(`!CADAPP.doc.get(${nid})`), [dr.explode, segs]);
    const bad = Object.entries(dr).filter(([k, v]) => /^error|no field/.test(String(v)));
    check('every drafting command runs', bad.length === 0, bad);
    await ev(`(()=>{CADAPP.fit();document.querySelector('[data-tab="Drafting"]').click()})()`); await sleep(150); await shot('cad-draft2.png');
  }

  // ---- planes of the drawing's own: one through 3 points, drawn on and extruded, looked along, picked up with Alt+X,
  // and out to DXF in its own coordinate system
  {
    await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'planes.mach1cad'))`);
    await ev(`(()=>{CADAPP.startCmd('newplane');const n=document.querySelector('#panel [data-f="name"]');n.value='Angle';n.dispatchEvent(new Event('input',{bubbles:true}));CADAPP.feed('point3',[0,0,0]);CADAPP.feed('point3',[1,0,0]);CADAPP.feed('point3',[0,1,1])})()`); await sleep(50);
    const pq = await ev(`(()=>{const d=CADAPP.doc,q=[...d.planes.values()][0];return q&&{key:q.key,name:q.name,n:q.n.map(v=>+v.toFixed(6)),act:d.active.pl}})()`);
    check('New plane through 3 points: named, square to them, and active', pq && pq.name === 'Angle' && pq.act === pq.key && Math.abs(pq.n[1] + Math.SQRT1_2) < 1e-6 && Math.abs(pq.n[2] - Math.SQRT1_2) < 1e-6, pq);
    await run('circle', { mode: 'ctr', dia: '1' }, [{ p: [1, 1] }]); const pc = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
    check('a circle drawn on it is on it', await ev(`CADAPP.doc.get(${pc}).pl`) === pq.key);
    await run('sextrude', { dist: '0.5', dir: '+', op: 'new' }, [{ e: pc, at: [1.5, 1] }, { enter: 1 }]);
    const okB = await waitBuild(1), pv = await vol();
    // the circle's centre: (1, 1) on the plane, so (1, 1/√2, 1/√2) in the world; the solid runs 0.5 along the normal
    const ctr = await ev(`(()=>{const s=CADAPP.solids[0];const m=s&&s.mesh;if(!m)return null;let c=[0,0,0];const v=m.v;for(let i=0;i<v.length;i+=3){c[0]+=v[i];c[1]+=v[i+1];c[2]+=v[i+2]}return c.map(x=>x/(v.length/3))})()`);
    const want = [1, Math.SQRT1_2 - 0.25 * Math.SQRT1_2, Math.SQRT1_2 + 0.25 * Math.SQRT1_2];
    check('extruded from that plane: the volume, along its normal', okB && Math.abs(pv - Math.PI * 0.25 * 0.5) < 1e-6 && ctr && Math.hypot(ctr[0] - want[0], ctr[1] - want[1], ctr[2] - want[2]) < 0.02, [okB, pv, ctr]);
    await ev(`CADAPP.ACTIONS.vplane()`); await sleep(50);
    const look = await ev(`new THREE.Vector3(0,0,1).applyQuaternion(CADAPP.view.q).toArray().map(v=>+v.toFixed(6))`);
    check('Plane view looks straight at it', Math.abs(look[1] + Math.SQRT1_2) < 1e-6 && Math.abs(look[2] - Math.SQRT1_2) < 1e-6, look);
    await ev(`(()=>{const s=document.getElementById('sPlane');s.value='top';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await run('fromEnt', {}, [{ e: pc, at: [1.5, 1] }]);
    check('Alt+X on the circle makes its plane active again', await ev(`CADAPP.doc.active.pl`) === pq.key);
    await ev(`(()=>{window.__blob=null;const u=URL.createObjectURL,c=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.__blob=b;return 'about:blank'};HTMLAnchorElement.prototype.click=function(){};CADAPP.ACTIONS.xdxf();URL.createObjectURL=u;HTMLAnchorElement.prototype.click=c})()`);
    const pd = await ev(`window.__blob.text().then(t=>CADAPP.IO.readDXF(t,'in')).then(r=>({planes:r.planes.length,on:r.ents.filter(e=>e.pl===r.planes[0].key).length}))`);
    check('DXF out and back: the circle on a tilted plane again', pd.planes === 1 && pd.on === 1, pd);
    await ev(`CADAPP.ACTIONS.viso()`); await sleep(150); await shot('cad-plane.png'); await ev(`CADAPP.setView('top')`);
  }

  // ---- solids: moved and copied by Transform, shelled by clicking a face, lofted and swept
  {
    await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'solids2.mach1cad'))`); await ev(`CADAPP.setView('top')`);
    await run('sbox', { h: '1', op: 'new' }, [{ p: [0, 0] }, { p: [2, 2] }]); await waitBuild(1);
    const minX = () => ev(`(()=>{const v=CADAPP.solids[0].mesh.v;let m=Infinity;for(let i=0;i<v.length;i+=3)m=Math.min(m,v[i]);return m})()`);
    const so = {};
    so.move = await run('move', { dx: '5', dy: '0', op: 'move' }, [{ sel: ['S1'] }]);
    const okM = await waitBuild(1);
    check('Translate moves a solid: a Move feature in its history', okM && Math.abs(await minX() - 5) < 1e-6 && Math.abs(await vol() - 4) < 1e-6 && await ev(`CADAPP.doc.feats.some(f=>f.type==='xform'&&!f.copy)`), [so.move, await minX()]);
    so.copy = await run('move', { dx: '0', dy: '3', op: 'copy', n: '1' }, [{ sel: ['S1'] }]);
    const okC = await waitBuild(2);
    check('Translate with Copy makes a second solid', okC && Math.abs(await vol() - 8) < 1e-6, [so.copy, await vol()]);
    await ev(`(()=>{CADAPP.sel=new Set();CADAPP.fit();CADAPP.startCmd('sshell');const i=document.querySelector('#panel [data-f="t"]');i.value='0.1';i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(150);
    await clickAt(6, 1); await sleep(100);
    const nf = await ev(`CADAPP.S && CADAPP.S.faces ? CADAPP.S.faces.length : 0`);
    await ev(`CADAPP.finishCmd()`); const okS = await waitBuild(2);
    check('Shell: the top face clicked, walls 0.1 in', nf === 1 && okS && Math.abs(await vol() - (4 + 4 - 1.8 * 1.8 * 0.9)) < 1e-6, [nf, await vol(), await ev(`[...CADAPP.featStatus.values()]`)]);
    await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.remove(d.list().map(e=>e.id));d.setFeats([]);d.add(G.shape('rect',{c:[0,0],w:2,h:2,r:0,ang:0}),{z:0});d.add(G.shape('rect',{c:[0,0],w:1,h:1,r:0,ang:0}),{z:1})})()`);
    const [ra, rb] = await ev(`[CADAPP.doc.list().find(e=>e.z===0).id,CADAPP.doc.list().find(e=>e.z===1).id]`);
    so.loft = await run('sloft', { ruled: true, op: 'new' }, [{ e: ra, at: [0, -1] }, { e: rb, at: [0, -0.5] }, { enter: 1 }]);
    const okL = await waitBuild(1);
    check('Loft: a 2 × 2 square to a 1 × 1 one an inch up, ruled: 7/3', okL && Math.abs(await vol() - 7 / 3) < 1e-6, [so.loft, await vol()]);
    await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.remove(d.list().map(e=>e.id));d.setFeats([]);d.add([G.circle([0,0],0.25)],{pl:'right',z:0});d.add([G.line([0,0],[2,0])],{pl:'top',z:0})})()`);
    const [pc, pp] = await ev(`[CADAPP.doc.list().find(e=>e.pl==='right').id,CADAPP.doc.list().find(e=>e.g.t==='line').id]`);
    so.sweep = await run('ssweep', { corner: 'right', op: 'new' }, [{ e: pc, at: [0.25, 0] }, { enter: 1 }, { e: pp, at: [1, 0] }]);
    const okW = await waitBuild(1);
    check('Sweep: a Ø0.5 circle along a 2 in line', okW && Math.abs(await vol() - Math.PI * 0.0625 * 2) < 1e-6, [so.sweep, await vol()]);
    const bad = Object.entries(so).filter(([k, v]) => /^error|no field/.test(String(v)));
    check('every new solids command runs', bad.length === 0, bad);
    await ev(`(()=>{CADAPP.setView('iso');document.querySelector('[data-tab="Solids"]').click()})()`); await sleep(200); await shot('cad-solids2.png'); await ev(`CADAPP.setView('top')`);
  }

  // ---- wireframe from a solid: its edges, then flattened (as in Mastercam), a face's edges, a section; out to DXF
  {
    await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'edges.mach1cad'))`); await ev(`CADAPP.setView('top')`);
    await ev(`CADAPP.doc.setFeats([{id:1,type:'box',c1:[0,0,0],c2:[2,1,0.5],op:'new'},{id:2,type:'hole',pts:[[1,0.5,0.5]],dir:[0,0,-1],dia:0.5,through:true},{id:3,type:'fillet',r:0.1,picks:[[0,0,0.25],[2,0,0.25],[2,1,0.25],[0,1,0.25]]}])`);
    await waitBuild(1);
    const waitN = async n => { for (let i = 0; i < 100 && await ev('CADAPP.doc.list().length') < n; i++) await sleep(100); return ev('CADAPP.doc.list().length'); };
    const kinds = () => ev(`(()=>{const o=CADAPP.doc.list().reduce((o,e)=>{const k=CADGeom.isCircle(e.g)?'circle':e.g.t;o[k]=(o[k]||0)+1;return o},{});return JSON.stringify(Object.fromEntries(['line','arc','circle','spline','pt'].filter(k=>o[k]).map(k=>[k,o[k]])))})()`);
    await ev(`(()=>{CADAPP.startCmd('sedges');document.querySelector('#panel [data-f="how"] [data-v="3d"]').click();const s=CADAPP.solids[0];CADAPP.feed('body',{id:s.key,solid:s})})()`);
    const ne = await waitN(27), k1 = await kinds();
    check('Edges to wireframe, in 3D: every edge of the solid, exact (17 lines, 8 fillet arcs, 2 hole circles), selected', ne === 27 && k1 === '{"line":17,"arc":8,"circle":2}' && await ev('CADAPP.sel.size') === 27, [ne, k1]);
    const fl = await run('flatten', { z: '0', op: 'move', dup: true }, [{ sel: 'all' }]);
    const k2 = await kinds(), out = await ev(`(()=>{const L=CADAPP.doc.list(),gs=L.map(e=>e.g),c=CADGeom.chains(gs).filter(c=>c.closed);return {top:L.every(e=>e.pl==='top'&&e.z===0),closed:c.length,areas:c.map(x=>+Math.abs(CADGeom.chainArea(CADGeom.chainEnts(gs,x))).toFixed(6)).sort()}})()`);
    // the outline: 2 × 1 less the four fillets' corners; and the hole
    check('Flatten: all on Top at Z 0, the edges seen end on gone, top and bottom one, an outline that closes', k2 === '{"line":4,"arc":4,"circle":1}' && out.top && out.closed === 2 && Math.abs(out.areas[1] - (2 - 4 * 0.01 * (1 - Math.PI / 4))) < 1e-6 && Math.abs(out.areas[0] - Math.PI * 0.0625) < 1e-6, [fl, k2, out]);
    await ev(`(()=>{window.__blob=null;const u=URL.createObjectURL,c=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.__blob=b;return 'about:blank'};HTMLAnchorElement.prototype.click=function(){};CADAPP.ACTIONS.xdxf();URL.createObjectURL=u;HTMLAnchorElement.prototype.click=c})()`);
    check('and out to DXF', await ev(`window.__blob.text().then(t=>CADAPP.IO.readDXF(t,'in').ents.length)`) === 9);
    await ev(`(()=>{const d=CADAPP.doc;d.remove(d.list().map(e=>e.id));CADAPP.startCmd('sedges');document.querySelector('#panel [data-f="how"] [data-v="flat"]').click();const i=document.querySelector('#panel [data-f="z"]');i.value='-1';i.dispatchEvent(new Event('input',{bubbles:true}));const s=CADAPP.solids[0];CADAPP.feed('body',{id:s.key,solid:s})})()`);
    const n1 = await waitN(9); await sleep(300);
    check('Edges, flattened at once: the same outline on Top at Z −1, no planes made', n1 === 9 && await kinds() === '{"line":4,"arc":4,"circle":1}' && await ev(`CADAPP.doc.list().every(e=>e.pl==='top'&&e.z===-1)&&CADAPP.doc.planes.size===0`), [n1, await kinds()]);
    await ev(`(()=>{const d=CADAPP.doc;d.remove(d.list().map(e=>e.id));CADAPP.startCmd('sfacecurves');CADAPP.feed('face',{key:CADAPP.solids[0].key,gi:0,p:[1.5,0.2,0.5]})})()`);
    const nf = await waitN(9), fz = await ev(`CADAPP.doc.list().every(e=>e.pl==='top'&&Math.abs(e.z-0.5)<1e-9)`); await ev('CADAPP.endCmd()');
    check('Face curves: the top face\'s outline and hole, on Top at its height', nf === 9 && fz && await kinds() === '{"line":4,"arc":4,"circle":1}', [nf, await kinds()]);
    await ev(`(()=>{const d=CADAPP.doc;d.remove(d.list().map(e=>e.id))})()`);
    const sc = await run('ssection', { z: '0.3' }, [{ enter: 1 }]); const ns = await waitN(9);
    check('Section: the outline where Top at Z 0.3 cuts the solid', ns === 9 && await ev(`CADAPP.doc.list().every(e=>e.pl==='top'&&Math.abs(e.z-0.3)<1e-9)`) && await kinds() === '{"line":4,"arc":4,"circle":1}', [sc, ns, await kinds()]);
  }

  // ---- line styles, widths and construction: from the status bar, drawn in their own blocks, left out of chains and
  // files
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'styles.mach1cad'))`);
  await ev(`(()=>{const pick=(id,v)=>{const s=document.getElementById(id);s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))};pick('sStyle','center');pick('sWidth','thick')})()`);
  await run('line', { mode: 'ends', chain: false }, [{ p: [0, 3] }, { p: [4, 3] }]);
  const st1 = await ev(`(()=>{const e=CADAPP.doc.list()[0];return JSON.stringify([e.ls,e.lw,!!e.cons,CADAPP.blockKeys.some(k=>/\\|L\\|center\\|thick$/.test(k))])})()`);
  check('a line drawn with Centre and Thick set in the status bar has them, and is drawn in its own block', st1 === '["center","thick",false,true]', st1);
  await ev(`(()=>{const pick=(id,v)=>{const s=document.getElementById(id);s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))};pick('sStyle','');pick('sWidth','')})()`);
  await run('rect', { mode: 'corner' }, [{ p: [0, 0] }, { p: [2, 1] }]);
  const side = await ev(`CADAPP.doc.list().filter(e=>e.g.t==='line'&&!e.ls)[0].id`);
  const closed0 = await ev(`CADAPP.isClosedChain(CADAPP.doc.get(${side}))`);
  await ev(`CADAPP.sel=new Set([${side}]);CADAPP.ACTIONS.tocons()`); await sleep(50);
  const closed1 = await ev(`CADAPP.doc.list().filter(e=>e.g.t==='line'&&!e.ls&&!e.cons).some(e=>CADAPP.isClosedChain(e))`);
  check('making a side of a rectangle construction opens its chain', closed0 === true && closed1 === false && await ev(`CADAPP.doc.get(${side}).cons===true`), [closed0, closed1]);
  await ev(`(()=>{window.__blob=null;const u=URL.createObjectURL,c=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.__blob=b;return 'about:blank'};HTMLAnchorElement.prototype.click=function(){};CADAPP.ACTIONS.xdxf();URL.createObjectURL=u;HTMLAnchorElement.prototype.click=c})()`);
  const dxc = await ev(`window.__blob.text().then(t=>{const L=t.split('\\r\\n');return JSON.stringify([L.filter((v,i)=>v==='LINE'&&L[i-1]==='0').length,L.filter((v,i)=>v==='CENTER'&&L[i-1]==='6').length])})`);
  check('DXF out leaves construction out and writes the line type', dxc === '[4,1]', dxc);
  await ev(`document.getElementById('sCons').click()`); await run('line', { mode: 'ends', chain: false }, [{ p: [0, 5] }, { p: [3, 5] }]); await ev(`document.getElementById('sCons').click()`);
  check('the Constr switch draws new entities as construction, dashed', await ev(`(()=>{const e=CADAPP.doc.list().find(e=>e.g.t==='line'&&Math.abs(e.g.a[1]-5)<1e-9);return !!e&&e.cons===true&&CADAPP.blockKeys.some(k=>/\\|L\\|cons\\|$/.test(k))&&!CADAPP.doc.active.cons})()`));
  await ev(`CADAPP.sel=new Set();CADAPP.fit()`); await sleep(200); await shot('cad-styles.png');

  // ---- endless lines: drawn across the view, left out of fit, snapped to where they cross, picked after a pan,
  // trimmed to a ray, left out of DXF
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'xl.mach1cad'))`);
  await run('xline', { mode: 'ang', ang: '30', ray: false }, [{ p: [1, 1] }]);
  const xid = await ev(`CADAPP.doc.list()[0].id`);
  await run('line', { mode: 'ends', chain: false }, [{ p: [3, -1] }, { p: [3, 3] }]);
  const vid = await ev(`Math.max(...CADAPP.doc.list().map(x=>x.id))`);
  await ev(`CADAPP.fit()`); await sleep(100);
  check('an endless line is construction, and fit leaves it out', await ev(`CADAPP.doc.get(${xid}).cons===true && CADAPP.view.s < 0.02`), await ev('CADAPP.view.s'));
  const ix = [3, 1 + 2 * Math.tan(Math.PI / 6)];
  const sn = await ev(`(()=>{CADAPP.updProj();const q=CADAPP.toScreen([${ix}, 0]);const s=CADAPP.snapAt(q[0]+3,q[1]+2);return {k:s.kind,p:s.p}})()`);
  check('the crossing of an endless line snaps as Int', sn.k === 'Int' && Math.hypot(sn.p[0] - ix[0], sn.p[1] - ix[1]) < 1e-6, sn);
  {
    await ev(`CADAPP.view.target.x += 1.5; CADAPP.setView && 0; CADAPP.fit && 0`); await ev(`CADAPP.sel=new Set()`); await sleep(100);
    const [l, tp] = await vpBox(), q = await ev(`(()=>{CADAPP.updProj();return CADAPP.toScreen([5, 1 + 4 * Math.tan(Math.PI / 6), 0])})()`);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: l + q[0], y: tp + q[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await sleep(100);
    check('after a pan, a click on the endless line picks it', await ev(`CADAPP.sel.has(${xid})`), await ev(`[...CADAPP.sel]`));
  }
  const tr = await run('trim', { mode: '1' }, [{ e: xid, at: [0, 1 - Math.tan(Math.PI / 6)] }, { e: vid, at: [3, 0] }]);
  check('trimmed to a line, it becomes a ray from the crossing', await ev(`(()=>{const g=CADAPP.doc.get(${xid}).g;return g.t==='xline'&&g.ray&&Math.abs(g.p[0]-3)<1e-6&&g.d[0]<0})()`), [tr, await ev(`CADAPP.doc.get(${xid})`)]);
  await ev(`(()=>{window.__blob=null;const u=URL.createObjectURL,c=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.__blob=b;return 'about:blank'};HTMLAnchorElement.prototype.click=function(){};CADAPP.ACTIONS.xdxf();URL.createObjectURL=u;HTMLAnchorElement.prototype.click=c})()`);
  const xdx = await ev(`window.__blob.text().then(t=>{const L=t.split('\\r\\n');return L.filter((v,i)=>(v==='LINE'||v==='XLINE'||v==='RAY')&&L[i-1]==='0').length})`);
  check('DXF out leaves the endless line out', xdx === 1, xdx);
  await ev(`CADAPP.fit()`); await sleep(150); await shot('cad-xline.png');

  // ---- keys: every one in the table through real key events (Alt = 1, Ctrl = 2, Shift = 8), then some by what they do
  const key = async combo => {
    const parts = combo.split('+'), k = parts.pop(), mod = (parts.includes('Alt') ? 1 : 0) | (parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0);
    const code = /^\d$/.test(k) ? 'Digit' + k : /^[A-Z]$/.test(k) ? 'Key' + k : /^(Left|Right|Up|Down)$/.test(k) ? 'Arrow' + k : k;
    const vk = /^\d$/.test(k) ? 48 + +k : /^[A-Z]$/.test(k) ? k.charCodeAt(0) : /^F\d+$/.test(k) ? 111 + +k.slice(1) : { Left: 37, Up: 38, Right: 39, Down: 40, PageUp: 33, PageDown: 34, Delete: 46, Backspace: 8, Escape: 27, Enter: 13, NumpadEnter: 13 }[k];
    const keyv = /^[A-Z]$/.test(k) ? (mod & 8 ? k : k.toLowerCase()) : code.startsWith('Arrow') ? code : k === 'NumpadEnter' ? 'Enter' : k;
    for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, code, key: keyv, modifiers: mod, windowsVirtualKeyCode: vk });
    await sleep(40);
  };
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'keys.mach1cad'))`);
  await ev(`(()=>{const d=CADAPP.doc;d.add([CADGeom.line([0,0],[2,0]),CADGeom.circle([1,1],0.5),CADGeom.line([0,2],[2,2])]);CADAPP.fit();document.getElementById('vp').focus()})()`);
  const combos = await ev(`CADAPP.KEYS.map(k=>k.k).filter(k=>!/^Ctrl\\+(O|S|Shift\\+S)$/.test(k))`), errs0 = errors.length;
  for (const c of combos) { await key(c); await ev(`(()=>{const d=document.getElementById('dlg');if(d.open)d.close();CADAPP.endCmd()})()`); await key('Escape'); }
  check('every key in the table runs without an error', errors.length === errs0, errors.slice(errs0));
  // the loop turned shading, the grid and the axes on and off: start again from the usual settings
  await ev(`localStorage.removeItem('mach1-cad-ui-v1')`); await send('Page.navigate', { url: 'about:blank' }); await sleep(100); await send('Page.navigate', { url: 'file://' + page + '#fresh' }); await sleep(1500);
  await ev(`(()=>{const d=CADAPP.doc;for(const id of [...d.ents.keys()])d.remove([id]);d.add([CADGeom.line([0,0],[2,0]),CADGeom.circle([1,1],0.5),CADGeom.line([0,2],[2,2])]);CADAPP.sel=new Set();CADAPP.setView('top');document.getElementById('vp').focus()})()`);
  const qv = () => ev(`CADAPP.view.q.toArray().map(v=>+v.toFixed(3)).join(',')`), views = {};
  for (const [k, n] of [['2', 'front'], ['3', 'back'], ['4', 'bottom'], ['5', 'right'], ['6', 'left'], ['7', 'iso'], ['1', 'top']]) { await key('Alt+' + k); views[n] = await qv(); }
  check('Alt+1 to Alt+7: seven different views; Alt+2 puts the drawing plane on Front', new Set(Object.values(views)).size === 7 && views.top === '0,0,0,1', views);
  await key('Alt+2'); const fpl = await ev('CADAPP.doc.active.pl'); await key('Alt+1'); await key('Alt+P');
  check('Alt+P goes back to the view before', fpl === 'front' && await qv() === views.front);
  await key('Alt+1');
  await ev(`CADAPP.sel=new Set([CADAPP.doc.list()[1].id])`); await key('Alt+E'); const hid = await ev('CADAPP.shownEnts.length'); await key('Alt+E');
  check('Alt+E hides all but the selection, and again shows everything', hid === 1 && await ev('CADAPP.shownEnts.length') === 3, hid);
  await key('Alt+S'); const sh1 = await ev(`document.querySelector('[data-cmd="wire"]')?.classList.contains('on') ?? JSON.parse(localStorage.getItem('mach1-cad-ui-v1')).shade==='wire'`); await key('Alt+S');
  check('Alt+S turns shading off and on', sh1 && JSON.parse(await ev(`localStorage.getItem('mach1-cad-ui-v1')`)).shade !== 'wire');
  await ev(`CADAPP.sel=new Set([CADAPP.doc.list()[0].id])`); await key('Ctrl+C'); await key('Ctrl+V');
  check('Ctrl+C, Ctrl+V pastes a copy in place, selected', await ev('CADAPP.doc.list().length') === 4 && await ev('CADAPP.sel.size') === 1);
  await key('F5'); check('F5 deletes what is selected', await ev('CADAPP.doc.list().length') === 3);
  await key('Shift+T'); check('Shift+T starts Trim', await ev(`document.querySelector('#panel h2').textContent`) === 'Trim'); await key('Escape');
  check('ribbon buttons show their key', await ev(`document.querySelector('[data-cmd="trim"]') ? 1 : 1`) && /\(Alt\+1\)/.test(await ev(`(CADAPP.ACTIONS && (()=>{const b=document.querySelector('[data-tab="View"]');b.click();return document.querySelector('[data-cmd="vtop"]').title})())`)));

  // ---- the mouse wheel: held and dragged turns the view, with Shift pans, with Ctrl zooms; turned, it zooms with
  // Shift or Ctrl held as well (Shift + wheel comes as a sideways scroll)
  {
    const [l, tp] = await vpBox(), cx = l + 500, cy = tp + 300, st = () => ev(`JSON.stringify({q:CADAPP.view.q.toArray().map(v=>+v.toFixed(4)),t:CADAPP.view.target.toArray().map(v=>+v.toFixed(4)),s:+CADAPP.view.s.toPrecision(6)})`);
    const mdrag = async (mod, dx, dy) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'middle', buttons: 4, clickCount: 1, modifiers: mod }); for (let k = 1; k <= 5; k++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + dx * k / 5, y: cy + dy * k / 5, buttons: 4, modifiers: mod }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + dx, y: cy + dy, button: 'middle', clickCount: 1, modifiers: mod }); await sleep(80); };
    await ev(`CADAPP.setView('top')`); await sleep(50);
    let a = JSON.parse(await st()); await mdrag(0, 60, 30); let b = JSON.parse(await st());
    check('wheel held and dragged turns the view', a.q.join() !== b.q.join() && a.s === b.s, [a, b]);
    a = b; await mdrag(8, 60, 30); b = JSON.parse(await st());
    check('Shift + wheel dragged pans', a.q.join() === b.q.join() && a.t.join() !== b.t.join() && a.s === b.s, [a, b]);
    a = b; await mdrag(2, 0, -60); b = JSON.parse(await st());
    check('Ctrl + wheel dragged zooms (up: in)', a.q.join() === b.q.join() && b.s < a.s * 0.8, [a, b]);
    for (const [mod, dx, dy, what] of [[0, 0, -120, 'the wheel'], [8, -120, 0, 'Shift + wheel'], [2, 0, -120, 'Ctrl + wheel']]) {
      a = JSON.parse(await st()); await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: dx, deltaY: dy, modifiers: mod }); await sleep(80); b = JSON.parse(await st());
      check(what + ' zooms in', b.s < a.s * 0.9, [a, b]);
    }
    check('Ctrl + wheel does not zoom the page itself', await ev('Math.round(visualViewport.scale*100)') === 100);
  }

  // ---- the search: a right-click on the drawing opens it at the cursor, and a right-drag still pans; the wheel zooms
  // with it open, over the drawing and over the box; plain words find commands, which run as their buttons do
  {
    const [l, tp] = await vpBox(), cx = l + 400, cy = tp + 250;
    const st = () => ev(`JSON.stringify({t:CADAPP.view.target.toArray().map(v=>+v.toFixed(6)),s:+CADAPP.view.s.toPrecision(8)})`);
    const mouse = (type, x, y, button, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
    const rclick = async (x, y) => { await mouse('mousePressed', x, y, 'right', 2); await mouse('mouseMoved', x + 2, y + 1, 'right', 2); await mouse('mouseReleased', x + 2, y + 1, 'right', 0); await sleep(100); };
    const lclick = async (x, y) => { await mouse('mousePressed', x, y, 'left', 1); await mouse('mouseReleased', x, y, 'left', 0); await sleep(100); };
    const wheel = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: -120 }); await sleep(100); };
    const box = () => ev(`(()=>{const b=document.getElementById('find');if(b.hidden)return null;const r=b.getBoundingClientRect(),v=document.getElementById('vp').getBoundingClientRect();return {x:r.left,y:r.top,r:r.right,b:r.bottom,vl:v.left,vt:v.top,vr:v.right,vb:v.bottom,focus:document.activeElement.id==='findIn',rows:[...document.querySelectorAll('#findList .fr b')].map(e=>e.textContent),where:[...document.querySelectorAll('#findList .fr')].map(r=>(r.querySelector('.where,.how')||{}).textContent),head:(document.querySelector('#findList .fh')||{}).textContent||'',none:!!document.querySelector('#findList .none')}})()`);
    const type = async s => { await send('Input.insertText', { text: s }); await sleep(80); };
    const h2 = () => ev(`(document.querySelector('#panel h2')||{}).textContent`);
    await ev(`(()=>{CADAPP.endCmd();CADAPP.sel=new Set();CADAPP.setView('top');CADAPP.fit();document.getElementById('vp').focus()})()`); await sleep(80);

    let a = await st(); await rclick(cx, cy); let b = await box();
    check('a right-click on the drawing opens the search at the cursor, ready to type in', b && Math.abs(b.x - cx) < 3 && Math.abs(b.y - cy) < 3 && b.focus, b);
    check('… and leaves the view as it was (no pan)', await st() === a, [a, await st()]);
    // the wheel, with the search open and closed: the same zoom
    a = JSON.parse(await st()); await wheel(cx + 250, cy + 120); let c = JSON.parse(await st()); const open1 = await box();
    check('with the search open, the wheel over the drawing still zooms, and the search stays open', c.s < a.s * 0.9 && open1 && open1.focus, [a, c]);
    a = c; await wheel(cx + 30, cy + 15); c = JSON.parse(await st());
    check('the wheel over the search itself zooms the drawing too, and the page does not scroll', c.s < a.s * 0.9 && !!(await box()) && await ev('window.scrollY + document.scrollingElement.scrollTop') === 0, [a, c]);
    const kOpen = a.s / c.s; await key('Escape');
    check('Escape closes the search and hands the keys back to the drawing', !(await box()) && await ev(`document.activeElement.id`) === 'vp');
    a = JSON.parse(await st()); await wheel(cx + 30, cy + 15); c = JSON.parse(await st());
    check('the wheel zooms by the same amount with the search open as closed', Math.abs(a.s / c.s / kOpen - 1) < 1e-6, [kOpen, a.s / c.s]);
    // a right-drag pans, and opens nothing
    a = JSON.parse(await st()); await mouse('mousePressed', cx, cy, 'right', 2); for (let k = 1; k <= 6; k++) await mouse('mouseMoved', cx + k * 10, cy + k * 5, 'right', 2); await mouse('mouseReleased', cx + 60, cy + 30, 'right', 0); await sleep(100); c = JSON.parse(await st());
    check('a right-drag still pans, and does not open the search', a.t.join() !== c.t.join() && a.s === c.s && !(await box()), [a, c]);
    await key('Ctrl+F'); b = await box();
    check('Ctrl+F opens the search', b && b.focus, b); await key('Escape');
    // before typing: what was run last, newest first
    await ev(`(()=>{CADAPP.startCmd('circle');CADAPP.endCmd();CADAPP.startCmd('rect');CADAPP.endCmd()})()`);
    await rclick(cx, cy); b = await box();
    check('before typing, the search lists what was run last, newest first', b && b.head === 'Recent' && b.rows[0] === 'Rectangle' && b.rows[1] === 'Circle', b);
    await type('round the corners'); b = await box();
    check('"round the corners" finds Fillet first, and says where it is', b && b.rows[0] === 'Fillet' && /^Wireframe › Modify/.test(b.where[0]), b);
    await ev(`(()=>{document.querySelector('[data-tab="View"]').click()})()`); await key('Enter');
    const ran = await ev(`({h:(document.querySelector('#panel h2')||{}).textContent,tab:document.querySelector('#tabs .on').textContent,flash:document.querySelector('#ribbon [data-cmd="fillet"]').classList.contains('flash'),open:!document.getElementById('find').hidden})`);
    check('Enter runs it as its button would: Fillet runs (Enter did not finish it), the ribbon is on its tab and its button flashes', ran.h === 'Fillet' && ran.tab === 'Wireframe' && ran.flash && !ran.open, ran);
    // mid-command: picking another ends this one
    await rclick(cx, cy); await type('circle'); await key('Enter');
    check('a right-click mid-command, then Circle: Fillet ends and Circle starts', await h2() === 'Circle'); await ev(`CADAPP.endCmd()`);
    // the arrow keys
    await rclick(cx, cy); await type('line'); const third = await ev(`CADAPP.find.search('line')[2].id`); await key('Down'); await key('Down'); await key('Enter');
    check('↓ ↓ Enter runs the third result', await ev(`!!document.querySelector('#ribbon [data-cmd="${third}"].on')`), third); await ev(`CADAPP.endCmd()`);
    // a click in the box selects nothing under it (a line is put right under its text box); a click on the drawing
    // closes it, and the same click there then selects the line
    await ev(`(()=>{CADAPP.sel=new Set();CADAPP.fit()})()`); await sleep(60);
    await rclick(cx - 100, cy - 60); b = await box();
    const ix = b.x + 60, iy = b.y + 15, lid = await ev(`(()=>{const p=CADAPP.snapAt(${ix - l},${iy - tp}).p;return CADAPP.doc.add([CADGeom.line([p[0]-0.5,p[1]],[p[0]+0.5,p[1]])])[0]})()`); await sleep(80);
    await lclick(ix, iy);
    const clk = { sel: await ev('CADAPP.sel.size'), box: !!(await box()) };
    check('a click in the search selects nothing in the drawing under it, and leaves it open', clk.sel === 0 && clk.box, clk);
    await key('Escape'); await lclick(ix, iy);
    check('… where, with it closed, the same click selects the line', await ev(`CADAPP.sel.has(${lid})`)); await ev(`(()=>{CADAPP.doc.remove([${lid}]);CADAPP.sel=new Set()})()`);
    await rclick(cx, cy);
    await lclick(l + 30, tp + 30);
    check('a click on the drawing closes the search', !(await box()));
    // a status-bar control, and a key with no button
    await rclick(cx, cy); await type('active level'); b = await box(); await key('Enter'); await sleep(60);
    check('"active level" finds the status bar\'s Level list, and goes to it', b && b.rows[0] === 'Active level' && await ev('document.activeElement.id') === 'sLevel', b);
    await ev(`document.getElementById('vp').focus()`);
    const n0 = await ev('CADAPP.doc.list().length'); await ev(`CADAPP.sel=new Set([CADAPP.doc.list()[0].id])`); await key('Ctrl+C');
    await rclick(cx, cy); await type('paste'); await key('Enter');
    check('"paste" runs Ctrl+V, a key with no button', await ev('CADAPP.doc.list().length') === n0 + 1);
    await rclick(cx, cy); await type('xyzzy'); b = await box();
    check('words it does not know: it says so', b && b.none && !b.rows.length, b); await key('Escape');
    // kept inside the drawing near its edges
    const [vr, vb] = await ev(`(()=>{const r=document.getElementById('vp').getBoundingClientRect();return [r.right,r.bottom]})()`);
    await rclick(vr - 12, vb - 12); await type('e'); b = await box();
    check('opened by the drawing\'s bottom right corner, the search stays inside it', b && b.r <= b.vr && b.b <= b.vb && b.x >= b.vl && b.y >= b.vt, b); await key('Escape');
    // every ribbon command has words, every word list is for a command, and the keys and status bar it names exist
    const cover = await ev(`(()=>{const m=CADAPP.find.missing(),it=CADAPP.find.items;return {m,bar:it.filter(i=>i.kind==='bar'&&!document.getElementById(i.el)).map(i=>i.id),keys:Object.keys(CADFind.VOCAB).filter(k=>k.startsWith('key:')).length-it.filter(i=>i.kind==='key').length}})()`);
    check('every ribbon command has words, and the keys and status-bar controls named exist', !cover.m.noWords.length && !cover.m.notOnRibbon.length && !cover.bar.length && cover.keys === 0, cover);
    // a recipe: its steps, and a step's button runs its command
    await rclick(cx, cy); await type('solid to dxf'); b = await box();
    const ri = b ? b.where.findIndex(w => w === 'How to') : -1;
    check('"solid to dxf" finds the How to recipe among the first three', ri >= 0 && ri < 3, b);
    for (let k = 0; k < ri; k++) await key('Down'); await key('Enter'); await sleep(60);
    const dl = await ev(`({open:document.getElementById('dlg').open,steps:[...document.querySelectorAll('#dlgBody ol.how li')].length,btns:[...document.querySelectorAll('#dlgBody [data-how]')].map(b=>b.dataset.how)})`);
    check('… which shows its steps, each with its command', dl.open && dl.steps === 3 && dl.btns.join() === 'sedges,ssection,xdxf', dl);
    await shot('find-how.png');
    await ev(`document.querySelector('#dlgBody [data-how="sedges"]').click()`); await sleep(60);
    check('… and a step\'s button closes it and runs that command, on its tab', !(await ev(`document.getElementById('dlg').open`)) && await h2() === 'Edges to wireframe' && await ev(`document.querySelector('#tabs .on').textContent`) === 'Solids');
    await ev(`CADAPP.endCmd()`);
    await rclick(cx, cy); await type('make the corners round'); await shot('find.png'); await key('Escape');
  }

  // ---- icons: every button on every tab of the ribbon has one, and so do the buttons at the top
  const noIcon = await ev(`(()=>{const out=[];for(const t of document.querySelectorAll('#tabs [data-tab]')){t.click();for(const b of document.querySelectorAll('#ribbon .rb'))if(!b.querySelector('svg.ico')||!b.querySelector('svg.ico').childElementCount)out.push(t.dataset.tab+':'+b.dataset.cmd)}for(const b of document.querySelectorAll('.top [data-cmd]'))if(!b.querySelector('svg.ico'))out.push('top:'+b.dataset.cmd);document.querySelector('[data-tab="Wireframe"]').click();return out})()`);
  check('every ribbon button has its icon', noIcon.length === 0, noIcon);

  // ---- files by what they hold: a Mitsubishi EDM drawing named .dwg (its units asked, millimetres offered), a
  // compressed DXF named .dwg, and a file that is none of them
  {
    const edm = Buffer.from(require('./cad-mswin-sample.js').EDM()).toString('base64'), rz = fs.readFileSync(path.join(__dirname, 'data/cad/rect-dxf.Z')).toString('base64');
    await ev(`(()=>{const b=Uint8Array.from(atob('${edm}'),c=>c.charCodeAt(0));window.__open=CADAPP.openFile(new File([b],'part.dwg'))})()`); await sleep(200);
    const q = await ev(`(()=>{const d=document.getElementById('dlg');return d.open?{text:document.getElementById('dlgBody').textContent,first:(document.querySelector('#dlgBody .btn.primary')||{}).textContent}:null})()`);
    check('a Mitsubishi EDM drawing asks its units, offering millimetres', q && /Mitsubishi EDM/.test(q.text) && q.first === 'Millimetres', q);
    await ev(`document.querySelector('#dlgBody [data-u="mm"]').click()`); await ev(`window.__open`); await sleep(200);
    const ed = await ev(`(()=>{const L=CADAPP.doc.list();return {kinds:L.map(e=>e.g.t).join(','),len:CADGeom.length(L.find(e=>e.g.t==='line').g),toast:document.getElementById('toast').textContent}})()`);
    check('it opens: a point, a line, two arcs, a spline and a circle, in inches', ed.kinds === 'pt,line,arc,arc,spline,arc' && Math.abs(ed.len - 2) < 1e-9 && /Mitsubishi EDM drawing/.test(ed.toast), ed);
    await ev(`(()=>{const b=Uint8Array.from(atob('${rz}'),c=>c.charCodeAt(0));return CADAPP.openFile(new File([b],'rect.dwg'))})()`); await sleep(100);
    check('a compressed DXF named .dwg opens as the DXF it is', await ev(`CADAPP.doc.list().length`) === 4);
    await ev(`CADAPP.openFile(new File([new Uint8Array([1,2,3,4,5,6,7,8])],'junk.dwg'))`); await sleep(50);
    check('a .dwg that is none of them says so', /not a DXF, an AutoCAD DWG or a Mitsubishi EDM drawing/.test(await ev(`document.getElementById('toast').textContent`)));
  }

  // ---- autosave: the drawing, a mesh body and a STEP solid come back after the page is opened again
  await ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})], 'auto.mach1cad'))`);
  await ev(`(()=>{const d=CADAPP.doc;d.add([CADGeom.line([0,0],[2,0]),CADGeom.circle([1,1],0.5)]);d.addBody({kind:'mesh',pos:CADMesh.box(0,0,0,1,1,1).pos,name:'cube'})})()`);
  const stepTxt = await ev(`(async()=>{CADAPP.doc.setFeats([{id:1,type:'box',c1:[0,0,0],c2:[1,2,3],op:'new'}]);for(let i=0;i<100&&!CADAPP.solids.length;i++)await new Promise(r=>setTimeout(r,100));return (await CADAPP.kcall('step',{})).text})()`);
  await ev(`CADAPP.openFile(new File([${JSON.stringify(stepTxt)}],'part.step'),true)`); await sleep(2500);
  const hist0 = await ev(`CADAPP.doc.undoStack.map(s=>s.label)`);
  // the project file as Save writes it
  await ev(`(()=>{window.__blob=null;const u=URL.createObjectURL,c=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.__blob=b;return 'about:blank'};HTMLAnchorElement.prototype.click=function(){};CADAPP.ACTIONS.save();URL.createObjectURL=u;HTMLAnchorElement.prototype.click=c})()`);
  const savedFile = await ev(`window.__blob.text()`);
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await send('Page.navigate', { url: 'file://' + page }); await sleep(2500);
  const back = await ev(`(async()=>{for(let i=0;i<100&&!CADAPP.solids.length;i++)await new Promise(r=>setTimeout(r,100));const d=CADAPP.doc;return {n:d.list().length,b:d.bodies.size,blobs:d.blobs.size,steps:d.feats.filter(f=>f.type==='step'&&f.blob&&!f.text).length,vol:CADAPP.solids.map(s=>+s.volume.toFixed(6)).sort().join(',')}})()`);
  check('autosave brings back the drawing, a body and a STEP solid (kept once, by its key)', back.n === 2 && back.b === 1 && back.blobs === 1 && back.steps === 1 && back.vol === '6,6', back);
  const hist1 = await ev(`CADAPP.doc.undoStack.map(s=>s.label)`), tl1 = await ev(`document.querySelectorAll('#timeline [data-hist]').length`);
  await ev(`CADAPP.ACTIONS.undo()`); const undone = await ev(`CADAPP.doc.feats.length`);
  check('and its history: the same steps on the timeline, and undo still works', hist0.length >= 4 && JSON.stringify(hist1) === JSON.stringify(hist0) && tl1 === hist0.length + 1 && undone === 1, [hist0, hist1, tl1, undone]);
  await ev(`CADAPP.openFile(new File([${JSON.stringify(savedFile)}], 'saved.mach1cad'))`); await sleep(300);
  const hist2 = await ev(`CADAPP.doc.undoStack.map(s=>s.label)`), red2 = await ev(`CADAPP.doc.redoStack.length`);
  check('a saved project file opens with its history too', JSON.stringify(hist2) === JSON.stringify(hist0) && red2 === 0 && /"history"/.test(savedFile), [hist2, red2]);
  check('fetches nothing from the network', requests.every(u => /^(file|data|blob):/.test(u)), requests.filter(u => !/^(file|data|blob):/.test(u)));
  check('no page errors', errors.length === 0, errors);
  console.log(passes + ' CAD browser checks passed' + (fails ? ', ' + fails + ' failed' : '') + ' (screenshots in ' + shots + ')');
  chrome.kill(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); chrome.kill(); process.exit(2); });
