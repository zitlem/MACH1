// End-to-end check of the built Probing Program Generator in headless Chrome (DevTools protocol, no packages):
// operations added through the page, typing keeps focus, the checks show, the B-table, 180° and inspection
// operations write their lines, a print.txt loads into the report, and the page throws nothing.
// usage: node test/probe-browser.js [apps/Probing Program Generator.html] [screenshot dir]
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const page = path.resolve(process.argv[2] || path.join(__dirname, '../apps/Probing Program Generator.html'));
const shots = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'probe-shots-'));
fs.mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-prof-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=' + (process.env.W || 1500) + ',1100', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (n, c, d) => { if (c) passes++; else { fails++; console.log('FAIL', n, d === undefined ? '' : '\n   ' + (typeof d === 'string' ? d : JSON.stringify(d))); } };

(async () => {
  let t; for (let i = 0; i < 60; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (e) { await sleep(200); } }
  const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
  let id = 0; const pend = {}, errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 80) + ': ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(shots, n), Buffer.from(r.result.data, 'base64')); };
  const typeIn = (elId, v) => ev(`(()=>{const i=document.getElementById(${JSON.stringify(elId)});i.value=${JSON.stringify(v)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const addOp = async v => { await ev(`(()=>{const s=document.getElementById('addSel');s.value=${JSON.stringify(v)};document.getElementById('addBtn').click()})()`); await sleep(80); };
  const listing = () => ev(`document.querySelector('#out pre') ? document.querySelector('#out pre').textContent : document.getElementById('out').textContent`);
  const segClick = (i, k, v) => ev(`document.querySelector('#ops .op[data-i="${i}"] [data-k="${k}"] [data-v="${v}"]').click()`);
  const last = () => ev(`document.querySelectorAll('#ops .op').length - 1`);

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'file://' + page }); await sleep(1500);
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1500);
  check('loads', await ev('!!window.PROBE && !!window.MACH1'));

  // Renishaw: a few operations, typing, checks
  await typeIn('j_probeNo', '1'); await sleep(80);
  for (const o of ['calRing', 'calLen', 'surfZ', 'bore', 'boss', 'cornerOut', 'pcd']) await addOp(o);
  check('7 operations', await ev(`document.querySelectorAll('#ops .op').length`) === 7);
  await ev(`document.querySelector('#ops .op[data-i="3"] .hd').click()`); await sleep(80);
  await ev(`document.getElementById('o3_d').focus()`); await typeIn('o3_d', '1.25'); await sleep(80);
  check('focus kept while typing', await ev(`document.activeElement && document.activeElement.id`) === 'o3_d');
  check('bore in the program', (await listing()).includes('G65 P9814 D1.25 S1.'));
  await ev(`document.querySelector('#tabs [data-t="maz"]').click()`); await sleep(80);
  check('Mazatrol SUB PRO listing', (await listing()).includes('(Meas)'));
  check('tabs named by file, one download for the shown file', await ev(`[...document.querySelectorAll('#tabs button')].map(b=>b.textContent).join('|')`) === 'PROBE1.EIA|PROBE1-M.PBM' && await ev(`document.getElementById('dlCur').textContent`) === 'Download PROBE1-M.PBM');
  check('You get lists the files', /You get:.*PROBE1\.EIA.*PROBE1-M\.PBM/.test(await ev(`document.getElementById('youGet').textContent`)));
  check('the shown file says where it goes', (await ev(`document.getElementById('fileRole').textContent`)).includes('after its WPC unit'));
  await ev(`document.querySelector('#tabs [data-t="eia"]').click()`); await sleep(80);

  // inspection: the bore to Inspect + adjust
  await segClick(3, 'purpose', 'adjust'); await sleep(100);
  await typeIn('o3_tolP', '0.002'); await typeIn('o3_tolN', '0.0005'); await typeIn('o3_tool', '12A'); await sleep(100);
  const t3 = await listing();
  check('adjust and result lines', t3.includes('G65 P9814 D1.25075 H0.00125 U0.0075 T12.01 F0.8') && t3.includes('DPRNT[M1F4*X#135[44]') && t3.includes('POPEN'), t3.split('\n').filter(l => /P9814|M1F|POPEN/.test(l)).join(' | '));
  check('purpose tag', await ev(`document.querySelector('#ops .op[data-i="3"] .tag').textContent`) === 'Inspect + adjust');
  const pt = ['junk line', 'M1RUN PROBE1 N    1 D20261010 T 93015', 'M1F4 X   0.0000 Y   0.0000 Z  -0.2500 S   1.2540 A 0 B 0 E 0.0033 P  0.0010 C  0.0040 F1'].join('\r\n');
  await ev(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(pt)}],'print.txt'));const i=document.getElementById('openPrint');i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  await sleep(300);
  const rp = await ev(`document.getElementById('rep').textContent`);
  check('report: part, OUT, tool row', rp.includes('Part 1') && rp.includes('OUT') && rp.includes('Error for the tool (12A)') && await ev(`document.querySelectorAll('#rep td.out').length`) >= 1, rp.slice(0, 300));
  check('report CSV button on', !(await ev(`document.getElementById('repCsv').disabled`)));
  await shot('inspect.png');

  // B table to the Mazatrol WPC, reversed
  await addOp('rotary'); let n = await last();
  await segClick(n, 'target', 'wpc'); await sleep(80); await segClick(n, 'dir', '-'); await sleep(80);
  const tb = await listing();
  check('B square: WPC reversed with a check run', tb.includes('G65 P9733 B[#5344-#144]') && tb.includes('G0 B0.') && tb.includes('B0.01'));

  // the side 180° away, EIA then Mazatrol
  await typeIn('j_tcX', '-11.15'); await typeIn('j_tcZ', '-26'); await sleep(80);
  await addOp('centre180'); await addOp('side180'); n = await last();
  const t2 = await listing();
  check('180 deg: G55 and the centre', t2.includes('#5241=2*[-11.15]') && t2.includes('#3006=1(TABLE CENTRE'), t2.slice(-900));
  await segClick(n, 'target', 'wpc'); await sleep(100);
  check('ends with M99 (auto)', /M99\s*$/.test(await listing()));
  check('180 deg: its own tab and Download all', await ev(`!!document.querySelector('#tabs [data-t="e180"]')`) && !(await ev(`document.getElementById('dlAll').disabled`)) && /all 3/.test(await ev(`document.getElementById('dlAll').textContent`)));
  await ev(`document.querySelector('#tabs [data-t="e180"]').click()`); await sleep(80);
  check('180 deg: second program in its tab', (await listing()).includes('G65 P9733 X#950') && (await ev(`document.getElementById('youGet').textContent`)).includes('PROBE1-180.EIA'));
  await ev(`document.querySelector('#tabs [data-t="eia"]').click()`); await sleep(80);
  await shot('ren.png');

  // the timeline: seek to a touch, readout, the listing block lit
  const nMoves = +(await ev(`document.getElementById('tlSeek').max`));
  check('timeline has moves', nMoves > 20, nMoves);
  await ev(`(()=>{const r=document.getElementById('tlSeek');r.value=6;r.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(100);
  check('timeline readout and listing highlight', /^1 Stylus in a ring gauge/.test(await ev(`document.getElementById('tlRead').textContent`)) && await ev(`!!document.querySelector('#out pre .hl')`), await ev(`document.getElementById('tlRead').textContent`));
  check('timeline draws the probe', await ev(`document.querySelectorAll('#plot circle[r="7"]').length`) === 1);

  // every Nth part
  await ev(`document.querySelector('[data-j="nthOn"]').click()`); await sleep(100);
  check('every Nth part in the program', (await listing()).includes('FIX[[#960-1]/5]*5'));
  await ev(`document.querySelector('[data-j="nthOn"]').click()`); await sleep(100);

  // a ready-made job appends its operations
  const before = await ev(`document.querySelectorAll('#ops .op').length`);
  await ev(`(()=>{const s=document.getElementById('tplSel');s.value='fixtureBore';s.dispatchEvent(new Event('change'))})()`); await sleep(150);
  check('ready-made job adds 2 operations', await ev(`document.querySelectorAll('#ops .op').length`) === before + 2);

  // into a part program: a two-side program made in the page
  await ev(`(()=>{const p=MACH1.program({control:'SmoothM',name:'PART1'});p.unit('WPC-',{'ADD.WPC':'1',X:-11,Y:-21,Th:0,Z:-25});p.unit('INDEX',{ANGLE:0});p.unit('WPC-',{'ADD.WPC':'2',X:-11,Y:-21,Th:0,Z:-27});p.unit('INDEX',{ANGLE:180});
    const dt=new DataTransfer();dt.items.add(new File([p.save()],'PART1.PBM'));const i=document.getElementById('openPart');i.files=dt.files;i.dispatchEvent(new Event('change'))})()`); await sleep(300);
  check('part program units listed with suggested places', (await ev(`document.getElementById('plMain').value`)) === '2' && (await ev(`document.getElementById('plOther').value`)) === '4');
  check('download with probing enabled', !(await ev(`document.getElementById('insDl').disabled`)));
  await shot('more.png');

  // Mazatrol MMS and Mazak MMS EIA
  await ev(`document.querySelector('[data-j="sys"] [data-v="mms"]').click()`); await sleep(100);
  for (const o of ['mZF', 'mXS', 'mYS', 'mBore']) await addOp(o);
  check('MMS listing', /BORE-XY/.test(await listing()));
  check('MMS: one file', await ev(`[...document.querySelectorAll('#tabs button')].map(b=>b.textContent).join('|')`) === 'PROBE1.PBM' && !(await ev(`document.getElementById('dlAll')`)));
  await ev(`document.querySelector('[data-j="sys"] [data-v="mmseia"]').click()`); await sleep(100);
  for (const o of ['e9013', 'e9014', 'e9016']) await addOp(o);
  await ev(`document.querySelector('[data-j="mmsPrint"]').click()`); await sleep(100);
  check('9016 printing refused', (await ev('document.body.textContent')).includes('loops for ever'));
  await ev(`document.querySelector('[data-j="sys"] [data-v="ren"]').click()`); await sleep(100);
  check('Renishaw operations kept when switching back', await ev(`document.querySelectorAll('#ops .op').length`) === 12);

  check('no page errors', errors.length === 0, errors);
  console.log(passes + ' browser checks passed' + (fails ? ', ' + fails + ' failed' : '') + ' (screenshots in ' + shots + ')');
  chrome.kill(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); chrome.kill(); process.exit(2); });
