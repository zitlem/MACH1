// Stress test of the built CAD page in headless Chrome: big drawings, big meshes, a big STEP file, corrupt files and
// runaway counts, each timed on the page's main thread (DevTools TaskDuration, and the longest task) against a budget.
// The data is made in the page, so nothing large is kept in the repo. A step that hangs is stopped after a time limit
// and reported as frozen.
// usage: node test/cad-stress.js [apps/CAD.html] [results.json] [--only=id,id]
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const args = process.argv.slice(2).filter(a => !a.startsWith('--')), only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const page = path.resolve(args[0] || path.join(__dirname, '../apps/CAD.html')), out = args[1];
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-stress-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--enable-unsafe-swiftshader', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1400,900', '--no-first-run', '--js-flags=--expose-gc', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];

(async () => {
  let t; for (let i = 0; i < 60; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (e) { await sleep(200); } }
  let ws, id = 0, pend = {}; const errors = [];
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  // a tab of its own; a tab that crashed (out of memory) or stops answering is replaced by a new one
  async function connect(url) {
    ws = new WebSocket(url); pend = {}; await new Promise(r => { ws.onopen = r; });
    ws.onmessage = m => {
      const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
      if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    };
    await send('Runtime.enable'); await send('Page.enable'); await send('Performance.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lt=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(e.duration))).observe({type:'longtask',buffered:true})}catch(e){}` });
  }
  const newTab = async () => { try { ws.close(); } catch (e) { } const n = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); await connect(n.webSocketDebuggerUrl); };
  const timed = (ms, p) => Promise.race([p, sleep(ms).then(() => { throw new Error('no answer'); })]);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 80) + ': ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; };
  const metrics = async () => { const r = await send('Performance.getMetrics'); const m = {}; for (const x of r.result.metrics) m[x.name] = x.value; return m; };
  const frame = () => ev('new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)))');
  // a step that does not finish in time: stop the page's script and say so
  class Frozen extends Error {}
  const within = (ms, p) => Promise.race([p, sleep(ms).then(() => { throw new Frozen('frozen'); })]);
  async function unfreeze() {
    try { await timed(3000, send('Runtime.terminateExecution')); await sleep(300); await timed(20000, load()); }
    catch (e) { console.log('  (the tab stopped answering, or crashed: opening a new one)'); await newTab(); await load(); }
  }
  // main-thread busy time (ms) and the longest task while fn runs
  async function busy(fn, limit = 15000) {
    await ev('window.__lt=[]'); const a = await metrics(), t0 = Date.now();
    await within(limit, (async () => { await fn(); await frame(); })());
    const b = await metrics();
    return { task: (b.TaskDuration - a.TaskDuration) * 1000, wall: Date.now() - t0, longest: await ev('Math.max(0,...window.__lt)') };
  }
  const vpBox = () => ev(`(()=>{const r=document.getElementById('vp').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()`);
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', Object.assign({ type, x, y }, extra));
  // mouse moves over the drawing along a line across the middle; the busy time per move
  async function hover(n = 20, opts = {}) {
    const [l, tp, w, h] = await vpBox(), per = [];
    for (let k = 0; k < n; k++) {
      const x = l + w * (0.15 + 0.7 * k / (n - 1)), y = tp + h * (0.3 + 0.4 * ((k * 7) % n) / n);
      per.push((await busy(() => mouse('mouseMoved', x, y), opts.limit || 10000)).task);
    }
    per.sort((a, b) => a - b);
    return { mean: per.reduce((s, v) => s + v, 0) / n, p95: per[Math.floor(n * 0.95) - 1] || per[n - 1], max: per[n - 1] };
  }
  // a fresh page with an empty drawing (#fresh: not the one autosaved by the scenario before)
  async function load() {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(100);
    await send('Page.navigate', { url: 'file://' + page + '#fresh' }); await sleep(800);
    for (let i = 0; i < 50 && !(await ev('!!window.CADAPP').catch(() => false)); i++) await sleep(100);
  }
  const fresh = () => ev(`CADAPP.openFile(new File([JSON.stringify({mach1cad:1,ents:[],levels:[{n:1,name:'Main',vis:true}]})],'stress.mach1cad'))`);
  const allSnaps = () => ev(`document.querySelectorAll('#snaps button').forEach(b=>{if(!b.classList.contains('on'))b.click()})`);
  // a result: value against its budget (lower is better)
  const put = (sc, what, value, budget, unit = 'ms', note = '') => { results.push({ sc, what, value, budget, unit, ok: value !== null && value <= budget, note }); console.log(`${(value !== null && value <= budget) ? 'ok  ' : 'OVER'} ${sc} · ${what}: ${value === null ? 'frozen' : (+value).toFixed(1) + ' ' + unit} (budget ${budget} ${unit})${note ? ' — ' + note : ''}`); };
  const frozen = (sc, what, budget, limit) => { results.push({ sc, what, value: null, budget, unit: 'ms', ok: false, note: 'stopped after ' + limit / 1000 + ' s' }); console.log(`OVER ${sc} · ${what}: frozen (stopped after ${limit / 1000} s)`); };
  // run a scenario; a freeze anywhere in it is reported and the page reloaded
  async function scenario(name, fn) {
    if (only.length && !only.includes(name)) return;
    try { await fn(); } catch (e) { if (e instanceof Frozen) { console.log('  (' + name + ': the page froze; reloading)'); await unfreeze(); } else { console.log('ERROR in ' + name + ': ' + e.message); results.push({ sc: name, what: 'error', value: null, budget: 0, ok: false, note: e.message }); await load(); } }
  }
  async function tryStep(sc, what, budget, limit, fn) {
    try { return await fn(); } catch (e) { if (e instanceof Frozen) { frozen(sc, what, budget, limit); await unfreeze(); return null; } throw e; }
  }

  await connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
  await load(); await ev('localStorage.clear()'); await load();

  // ---- 1. Extrude and Revolve on 400 closed squares
  await scenario('squares', async () => {
    await fresh();
    await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;d.batch('t',()=>{for(let i=0;i<20;i++)for(let j=0;j<20;j++){const x=i*1.5,y=j*1.5;d.add([G.line([x,y],[x+1,y]),G.line([x+1,y],[x+1,y+1]),G.line([x+1,y+1],[x,y+1]),G.line([x,y+1],[x,y])])}});CADAPP.fit()})()`);
    for (const c of ['sextrude', 'srevolve']) {
      await ev(`CADAPP.startCmd('${c}')`);
      const r = await tryStep('squares', 'hover in ' + c, 16, 10000, () => hover(10));
      if (r) put('squares', 'hover in ' + c + ' (mean per move)', r.mean, 16);
      await ev('CADAPP.endCmd()').catch(() => {});
    }
  });

  // ---- 2. a 20,000-entity DXF
  const bigDXF = `(()=>{const G=CADGeom,d=CADModel.create();d.levels=new Map([[1,{n:1,name:'A',vis:true}],[2,{n:2,name:'B',vis:true}]]);const C=CADModel.COLORS;let k=0;
    for(let i=0;i<100;i++)for(let j=0;j<100;j++){const x=i*0.6,y=j*0.6,c=C[(i+j)%C.length],lv=1+(i%2);
      d.add([G.line([x,y],[x+0.7,y+0.35])],{col:c,lv}); d.add([(i*j)%3?G.arc([x+0.3,y+0.3],0.22,0.3,4):G.circle([x+0.3,y+0.3],0.2)],{col:c,lv});}
    return CADIO.writeDXF(d.visible(),[...d.levels.values()])})()`;
  await scenario('dxf20k', async () => {
    await fresh(); await allSnaps();
    const r = await tryStep('dxf20k', 'open', 1000, 60000, () => busy(() => ev(`(async()=>{const t=${bigDXF};await CADAPP.openFile(new File([t],'big.dxf'))})()`), 60000));
    if (!r) return;
    put('dxf20k', 'open: longest main-thread task', r.longest, 1000, 'ms', 'wall ' + r.wall + ' ms, ' + await ev('CADAPP.doc.list().length') + ' entities');
    const h = await tryStep('dxf20k', 'hover (select)', 16, 10000, () => hover(20)); if (h) put('dxf20k', 'hover, nothing running (p95)', h.p95, 16);
    await ev(`CADAPP.startCmd('line')`);
    const hp = await tryStep('dxf20k', 'hover (line, all snaps)', 16, 10000, () => hover(20)); if (hp) put('dxf20k', 'hover in Line with all snaps (p95)', hp.p95, 16);
    await ev('CADAPP.endCmd()');
    // pan: a right drag; zoom: the wheel
    const [l, tp, w, hh] = await vpBox(), cx = l + w / 2, cy = tp + hh / 2;
    const pan = await tryStep('dxf20k', 'pan', 33, 20000, () => busy(async () => { await mouse('mousePressed', cx, cy, { button: 'right', buttons: 2, clickCount: 1 }); for (let k = 1; k <= 10; k++) { await mouse('mouseMoved', cx + k * 8, cy + k * 3, { buttons: 2 }); await frame(); } await mouse('mouseReleased', cx + 80, cy + 30, { button: 'right', clickCount: 1 }); }, 20000));
    if (pan) put('dxf20k', 'pan (per frame)', pan.task / 10, 33);
    const zoom = await tryStep('dxf20k', 'zoom', 33, 20000, () => busy(async () => { for (let k = 0; k < 10; k++) { await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: k < 5 ? -120 : 120 }); await frame(); } }, 20000));
    if (zoom) put('dxf20k', 'zoom (per frame)', zoom.task / 10, 33);
    await ev('CADAPP.fit()');
    // an edit and its undo, with the autosave after it
    const ed = await tryStep('dxf20k', 'edit', 100, 20000, () => busy(async () => { await ev(`(()=>{const d=CADAPP.doc,e=d.list().find(x=>x.g.t==='line');d.update(e.id,{g:CADGeom.line(e.g.a,[e.g.b[0]+0.1,e.g.b[1]])},'Edit')})()`); await sleep(2000); }, 20000));
    if (ed) put('dxf20k', 'an edit, with its autosave (busy)', ed.task, 100, 'ms', 'longest task ' + ed.longest.toFixed(0) + ' ms');
    const un = await tryStep('dxf20k', 'undo', 100, 20000, () => busy(async () => { await ev(`CADAPP.ACTIONS.undo()`); await sleep(2000); }, 20000));
    if (un) put('dxf20k', 'undo, with its autosave (busy)', un.task, 100);
    // a window round the left half, from empty space
    const ws0 = await ev(`(()=>{CADAPP.updProj();return [CADAPP.toScreen([-1,-1,0]),CADAPP.toScreen([30,61,0])]})()`);
    const win = await tryStep('dxf20k', 'window select', 150, 20000, () => busy(async () => { await mouse('mousePressed', l + ws0[0][0], tp + ws0[0][1], { button: 'left', buttons: 1, clickCount: 1 }); for (let k = 1; k <= 4; k++) await mouse('mouseMoved', l + ws0[0][0] + (ws0[1][0] - ws0[0][0]) * k / 4, tp + ws0[0][1] + (ws0[1][1] - ws0[0][1]) * k / 4, { buttons: 1 }); await mouse('mouseReleased', l + ws0[1][0], tp + ws0[1][1], { button: 'left', clickCount: 1 }); }, 20000));
    if (win) put('dxf20k', 'window select', win.task, 150, 'ms', (await ev('CADAPP.sel.size')) + ' selected');
    // moving the selection: the preview on each mouse move
    await ev(`CADAPP.startCmd('move')`); await ev(`CADAPP.finishCmd()`);
    await ev(`(()=>{CADAPP.updProj();})()`);
    const mv = await tryStep('dxf20k', 'move preview', 33, 10000, async () => { const [a] = await ev(`[CADAPP.toScreen([10,10,0])]`); await mouse('mouseMoved', l + a[0], tp + a[1]); await mouse('mousePressed', l + a[0], tp + a[1], { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', l + a[0], tp + a[1], { button: 'left', clickCount: 1 }); return hover(10); });
    if (mv) put('dxf20k', 'Translate preview of ~10,000 selected (mean per move)', mv.mean, 33);
    await ev('CADAPP.endCmd()').catch(() => {});
    // Remove duplicates over the whole drawing, pieces lying on others too
    const dd = await tryStep('dxf20k', 'remove duplicates', 300, 20000, () => busy(() => ev(`(()=>{CADAPP.sel=new Set();CADAPP.startCmd('deldup');const c=document.querySelector('#panel [data-f="over"]');if(!c.checked)c.click();CADAPP.finishCmd();return document.getElementById('toast').textContent})()`), 20000));
    if (dd) put('dxf20k', 'Remove duplicates, all 20,000 (busy)', dd.task, 300, 'ms', 'longest task ' + dd.longest.toFixed(0) + ' ms');
  });

  // ---- 3. 300 splines crossing each other, Int snap on
  await scenario('splines', async () => {
    await load(); await fresh(); await allSnaps();
    await ev(`(()=>{const d=CADAPP.doc,G=CADGeom;let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647*10;d.batch('t',()=>{for(let i=0;i<300;i++)d.add([G.splineThrough([[r(),r()],[r(),r()],[r(),r()],[r(),r()],[r(),r()],[r(),r()]])])});CADAPP.fit()})()`);
    await ev(`CADAPP.startCmd('line')`);
    const a = await tryStep('splines', 'hover (first pass)', 30, 20000, () => hover(10, { limit: 20000 }));
    if (!a) return; put('splines', 'hover in Line, first pass (mean)', a.mean, 1e9, 'ms', 'no budget: the first pass works the crossings out');
    const b = await tryStep('splines', 'hover (second pass)', 30, 20000, () => hover(10, { limit: 20000 }));
    if (b) put('splines', 'hover in Line, same places again (mean)', b.mean, 30);
    await ev('CADAPP.endCmd()').catch(() => {});
  });

  // ---- 4. a 1,000,000-triangle STL
  await scenario('stl1m', async () => {
    await load(); await fresh();
    await ev(`(()=>{const N=500,M=1000,pos=new Float32Array(N*M*18);let o=0;const z=(i,j)=>Math.sin(i*0.05)*Math.cos(j*0.03)*20;
      for(let i=0;i<N;i++)for(let j=0;j<M;j++){const a=[i,j,z(i,j)],b=[i+1,j,z(i+1,j)],c=[i+1,j+1,z(i+1,j+1)],e=[i,j+1,z(i,j+1)];for(const p of [a,b,c,a,c,e]){pos[o++]=p[0]*0.2;pos[o++]=p[1]*0.2;pos[o++]=p[2]*0.2}}
      window.__stl=CADMesh.writeSTL({pos},'mm');return pos.length/9})()`);
    const r = await tryStep('stl1m', 'open', 500, 60000, () => busy(async () => {
      await ev(`window.__open=CADAPP.openFile(new File([window.__stl],'big.stl'));0`);
      for (let i = 0; i < 50 && !(await ev(`!!document.querySelector('#dlg[open] [data-u="mm"]')`)); i++) await sleep(100);
      await ev(`document.querySelector('#dlg [data-u="mm"]').click()`); await ev('window.__open');
    }, 60000));
    if (!r) return;
    put('stl1m', 'open: longest main-thread task', r.longest, 500, 'ms', 'wall ' + r.wall + ' ms');
    const h = await tryStep('stl1m', 'hover', 16, 20000, () => hover(10, { limit: 20000 })); if (h) put('stl1m', 'hover over the body (mean)', h.mean, 16);
    await ev(`CADAPP.sel=new Set([...CADAPP.doc.bodies.keys()])`);
    const mv = await tryStep('stl1m', 'move', 300, 30000, () => busy(async () => { await ev(`(()=>{CADAPP.startCmd('move');const s=(k,v)=>{const i=document.querySelector('#panel [data-f="'+k+'"]');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))};s('dx','1');CADAPP.finishCmd()})()`); }, 30000));
    if (mv) put('stl1m', 'move the body', mv.task, 300);
    const as = await tryStep('stl1m', 'autosave', 100, 30000, () => busy(() => sleep(1500), 30000));
    if (as) put('stl1m', 'autosave after the move: longest task', as.longest, 100);
  });

  // ---- 5. a 20 MB STEP file and 20 edits of a feature after it
  await scenario('step20', async () => {
    await load(); await fresh();
    await ev(`(async()=>{await CADAPP.kernel();CADAPP.doc.setFeats([{id:1,type:'box',c1:[0,0,0],c2:[4,3,1],op:'new'}]);for(let i=0;i<200&&!CADAPP.solids.length;i++)await new Promise(r=>setTimeout(r,100));const t=(await CADAPP.kcall('step',{})).text;
      const NL=String.fromCharCode(10),pad=[];for(let i=0;i<400000;i++)pad.push('#'+(1000000+i)+"=CARTESIAN_POINT('',("+i+".,0.,0.));");window.__step=t.replace('DATA;','DATA;'+NL+pad.join(NL));return window.__step.length})()`);
    await fresh();
    await within(120000, ev(`CADAPP.openFile(new File([window.__step],'big.step'))`));
    const sz = await ev(`(CADAPP.doc.blobs ? [...CADAPP.doc.blobs.values()].map(t=>t.length) : CADAPP.doc.feats.filter(f=>f.type==='step').map(f=>f.text.length)).join(',')`);
    if (!sz) throw new Error('the STEP file did not open: ' + await ev(`document.getElementById('toast').textContent`));
    const waitBuilt = () => ev(`(async()=>{for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,100));if(CADAPP.featStatus.size===CADAPP.doc.feats.length&&!document.getElementById('kstat').textContent.startsWith('Building'))return true}return false})()`);
    await waitBuilt();
    await send('HeapProfiler.collectGarbage'); const h0 = (await send('Runtime.getHeapUsage')).result.usedSize;
    const per = [];
    for (let k = 0; k < 20; k++) {
      const b = await tryStep('step20', 'edit ' + k, 50, 30000, () => busy(async () => { await ev(`(()=>{const d=CADAPP.doc,f=d.feats.filter(f=>f.type!=='hole');d.setFeats(f.concat([{id:99,type:'hole',pts:[[2,1.5,1]],dir:[0,0,-1],dia:0.2+${k}*0.01,depth:0.5,through:false}]),'Edit')})()`); await sleep(1600); }, 30000));
      if (!b) return; per.push(b.task);
    }
    await waitBuilt(); await send('HeapProfiler.collectGarbage'); const h1 = (await send('Runtime.getHeapUsage')).result.usedSize;
    put('step20', 'a feature edit after a 20 MB STEP (mean busy, with autosave)', per.reduce((s, v) => s + v, 0) / per.length, 50, 'ms', 'max ' + Math.max(...per).toFixed(0) + ' ms');
    put('step20', 'heap growth over 20 edits', (h1 - h0) / 1e6, 100, 'MB');
  });

  // ---- 5b. a solid with 400 holes: picking its edges for a fillet, and hovering over it
  await scenario('solid', async () => {
    await load(); await fresh();
    await ev(`(async()=>{await CADAPP.kernel();const pts=[];for(let i=0;i<20;i++)for(let j=0;j<20;j++)pts.push([0.5+i,0.5+j,1]);CADAPP.doc.setFeats([{id:1,type:'box',c1:[0,0,0],c2:[20,20,1],op:'new'},{id:2,type:'hole',pts,dir:[0,0,-1],dia:0.3,through:true}])})()`);
    const ok1 = await within(180000, ev(`(async()=>{for(let i=0;i<1800;i++){await new Promise(r=>setTimeout(r,100));if(CADAPP.solids.length===1&&!document.getElementById('kstat').textContent.startsWith('Building'))return true}return false})()`));
    if (!ok1) throw new Error('the solid did not build');
    await ev(`CADAPP.setView('iso')`); await sleep(300);
    put('solid', 'its triangles', await ev(`CADAPP.solids[0].mesh.t.length/3`), 1e9, 'tris', 'no budget: for the record');
    const h = await tryStep('solid', 'hover', 16, 20000, () => hover(10, { limit: 20000 })); if (h) put('solid', 'hover over the solid (mean)', h.mean, 16);
    await ev(`CADAPP.startCmd('sfillet')`);
    const f = await tryStep('solid', 'fillet hover', 16, 20000, () => hover(10, { limit: 20000 })); if (f) put('solid', 'hover in Fillet, picking edges (mean)', f.mean, 16);
    await ev('CADAPP.endCmd()').catch(() => {});
  });

  // ---- 6. corrupt DXFs: an arc whose end angle is huge; a circle with an enormous radius
  const dxf = body => `0\\nSECTION\\n2\\nENTITIES\\n${body}0\\nENDSEC\\n0\\nEOF\\n`;
  for (const [name, body] of [['bad-angle', '0\\nARC\\n8\\n0\\n10\\n0\\n20\\n0\\n30\\n0\\n40\\n1\\n50\\n0\\n51\\n-1e300\\n'], ['huge-radius', '0\\nCIRCLE\\n8\\n0\\n10\\n0\\n20\\n0\\n30\\n0\\n40\\n1e20\\n']]) {
    await scenario(name, async () => {
      await load(); await fresh();
      const r = await tryStep(name, 'open', 1000, 10000, () => busy(() => ev(`CADAPP.openFile(new File(["${dxf(body)}"],'bad.dxf'))`), 10000));
      if (r) put(name, 'opening a corrupt DXF', r.wall, 1000, 'ms', await ev(`document.getElementById('toast').textContent`));
    });
  }

  // ---- 7. a runaway count: a 1000 × 1000 rectangular array of one line
  await scenario('array', async () => {
    await load(); await fresh();
    await ev(`(()=>{const d=CADAPP.doc;const [id]=d.add([CADGeom.line([0,0],[1,0])]);CADAPP.sel=new Set([id]);CADAPP.startCmd('arect')})()`);
    const r = await tryStep('array', 'array 1000 x 1000', 1000, 10000, () => busy(() => ev(`(()=>{const s=(k,v)=>{const i=document.querySelector('#panel [data-f="'+k+'"]');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))};s('nx','1000');s('ny','1000')})()`), 10000));
    if (r) put('array', 'typing 1000 × 1000 into a rectangular array', r.wall, 1000, 'ms', await ev(`document.getElementById('toast').textContent`));
  });

  // ---- 8. the solids kernel busy for good, then crashing: Stop shows, and solids build again after each
  await scenario('kernel', async () => {
    await load(); await fresh();
    const built = n => ev(`(async()=>{for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,100));if(CADAPP.solids.length===${n}&&!document.getElementById('kstat').textContent.startsWith('Building'))return true}return false})()`);
    await ev(`(async()=>{await CADAPP.kernel();CADAPP.doc.setFeats([{id:1,type:'box',c1:[0,0,0],c2:[1,1,1],op:'new'}])})()`);
    if (!(await built(1))) throw new Error('the first box did not build');
    await ev(`CADAPP.kcall('spin',{ms:60000}).catch(()=>{});0`);
    const t0 = Date.now(); let shown = false;
    while (Date.now() - t0 < 8000) { if (await ev(`!document.getElementById('kstop').hidden`)) { shown = true; break; } await sleep(200); }
    put('kernel', 'Stop offered while the kernel is busy', shown ? Date.now() - t0 : null, 5000, 'ms');
    if (!shown) return;
    await ev(`document.getElementById('kstop').click()`);
    await ev(`CADAPP.doc.setFeats(CADAPP.doc.feats.concat([{id:2,type:'box',c1:[2,0,0],c2:[3,1,1],op:'new'}]))`);
    const t1 = Date.now(), ok1 = await built(2);
    put('kernel', 'solids build again after Stop', ok1 ? Date.now() - t1 : null, 30000, 'ms');
    await ev(`CADAPP.kcall('crash',{}).catch(()=>{});0`);
    const t2 = Date.now(); await sleep(300);
    const ok2 = await built(2);
    put('kernel', 'solids build again after a crash', ok2 ? Date.now() - t2 : null, 30000, 'ms', await ev(`document.getElementById('kstat').textContent`));
  });

  const bad = results.filter(r => !r.ok);
  if (out) fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), page, results, errors }, null, 1));
  console.log(results.length - bad.length + ' of ' + results.length + ' within budget' + (errors.length ? '; page errors: ' + errors.slice(0, 5).join(' | ') : ''));
  chrome.kill(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('ERROR', e.stack); chrome.kill(); process.exit(2); });
