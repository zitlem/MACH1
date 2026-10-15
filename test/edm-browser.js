// End-to-end check of the EDM Probing Program Generator in headless Chrome (DevTools protocol, no packages):
// the page loads, operations and templates add through the page, typing keeps focus, the listing updates,
// errors block the download, and the page throws nothing.
// usage: node test/edm-browser.js [screenshot dir]
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const page = path.resolve(__dirname, '..', 'apps', 'EDM Probing Program Generator.html');
const shots = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'edm-shots-'));
fs.mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'edm-prof-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=' + (process.env.W || 1400) + ',1000', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const addOp = async v => { await ev(`(()=>{const s=document.getElementById('addSel');s.value=${JSON.stringify(v)};document.getElementById('addBtn').click()})()`); await sleep(80); };
  const field = (i, k) => `document.querySelector('#ops [data-o="${i}"][data-k="${k}"]')`;
  const typeIn = async (sel, v) => { await ev(`(()=>{const i=${sel};i.focus();i.value=${JSON.stringify(v)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(80); };
  const listing = () => ev(`document.getElementById('listing').textContent`);

  await send('Runtime.enable'); await send('Page.enable');
  // downloads land in the screenshot folder, not the user's Downloads
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: shots });
  await send('Page.navigate', { url: 'file://' + page }); await sleep(1200);
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1200);
  check('loads', await ev('!!window.EDM && document.querySelectorAll("#addSel option").length > 8'));

  for (const o of ['hole', 'edge', 'corner', 'width', 'fm']) await addOp(o);
  check('5 operations', await ev(`document.querySelectorAll('#ops .op').length`) === 5);
  await typeIn(field(0, 'i'), '0.75');
  check('focus kept while typing', await ev(`document.activeElement === ${field(0, 'i')}`));
  check('G30 in the listing', (await listing()).includes('G30X1R0.I0.75J0.15'));
  check('corner in the listing', /G29X1\nG14X611Y613/.test(await listing()));
  check('factory macro call', (await listing()).includes('G65 L99990317'));
  check('tabs', await ev(`[...document.querySelectorAll('#tabs button')].map(b=>b.textContent).join('|')`) === 'SETUP.NC|SETUP-SETUP.NC');
  await ev(`document.querySelector('#tabs [data-tab="1"]').click()`); await sleep(80);
  check('setup block has no frame', !(await listing()).includes('M02') && (await listing()).includes('PASTE ABOVE THE CUT'));
  await ev(`document.querySelector('#tabs [data-tab="0"]').click()`); await sleep(80);

  await ev(`document.getElementById('tl').value=3;document.getElementById('tl').dispatchEvent(new Event('input'))`); await sleep(80);
  check('timeline lights the listing', await ev(`document.querySelectorAll('#listing .hl').length`) > 0);
  await shot('ops.png');

  await typeIn(field(0, 'i'), '0');
  check('error shown and download blocked', await ev(`document.querySelector('#ops .op.bad') !== null && document.getElementById('dlAll').disabled`));
  await typeIn(field(0, 'i'), '0.15');
  check('error clears', await ev(`!document.getElementById('dlAll').disabled`));
  await typeIn(field(0, 'hd'), '0.3');
  check('G30 warns when I comes close to the hole wall', (await ev(`document.querySelector('#ops .op').textContent`)).includes('close to the hole wall') && !await ev(`document.getElementById('dlAll').disabled`));
  check('the preview draws the hole at its diameter', await ev(`document.querySelectorAll('#plot circle[stroke="var(--part)"]').length`) === 1);
  await typeIn(field(0, 'hd'), '');
  check('no hole size, no warning', !(await ev(`document.querySelector('#ops .op').textContent`)).includes('close to the hole wall'));

  await ev(`(()=>{const s=document.getElementById('tpl');s.value='grid';s.dispatchEvent(new Event('change'))})()`); await sleep(150);
  check('grid template', (await listing()).includes('G54.1P6'));
  await ev(`(()=>{const s=document.querySelector('#settings [data-j="units"]');s.value='mm';s.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(150);
  check('mm switch', (await listing()).includes('EDM PROBING MV2400S MM'));
  await shot('grid.png');

  await ev(`document.getElementById('newJob').onclick=null;localStorage.clear()`);
  await ev(`(()=>{window.confirm=()=>true})()`);
  await ev(`(()=>{const s=document.getElementById('tpl');s.value='job-g30';s.dispatchEvent(new Event('change'))})()`); await sleep(150);
  const ji = await ev(`document.querySelectorAll('#ops .op').length - 1`);
  check('whole job asks for the cut path', (await ev(`document.getElementById('jobMsgs').textContent + [...document.querySelectorAll('.msgs')].map(e=>e.textContent).join('')`)).includes('paste the cut path'));
  check('section headings shown', await ev(`document.querySelectorAll('#ops .op[data-i="${ji}"] .sub-h').length`) >= 4);
  // remove the other operations so the job is last
  while (await ev(`document.querySelectorAll('#ops .op').length`) > 1) { await ev(`document.querySelector('#ops button[data-act="del"]').click()`); await sleep(60); }
  await typeIn(field(0, 'code1'), 'F0.0551E1481\nH1=0.0085\nG42G01X-0.25Y0.969H1\nG40X0.24');
  await typeIn(field(0, 'code2'), 'F0.0236E1332\nH1=0.0055\nG42G01X-0.25Y0.969H1\nG40X0.245');
  check('focus kept in the cut box', await ev(`document.activeElement === ${field(0, 'code2')}`));
  const jl = await listing();
  check('whole job: one file only', await ev(`document.querySelectorAll('#tabs button').length`) === 1);
  check('whole job listing', jl.includes('ONE PROGRAM, NO SUBPROGRAMS') && jl.includes('G200A') && jl.includes('F0.0236E1332') && !await ev(`document.getElementById('dlAll').disabled`), jl.slice(0, 300));
  await shot('job.png');
  try { fs.unlinkSync(path.join(shots, 'SAMPLE-JOB.NC')); } catch (e) { /* not there */ }
  await ev(`document.getElementById('sampleDl').click()`);
  for (let i = 0; i < 30 && !fs.existsSync(path.join(shots, 'SAMPLE-JOB.NC')); i++) await sleep(100);
  check('sample download button saves SAMPLE-JOB.NC', fs.existsSync(path.join(shots, 'SAMPLE-JOB.NC')) && fs.readFileSync(path.join(shots, 'SAMPLE-JOB.NC'), 'utf8').startsWith('%\r\nL5000/SAMPLE-JOB'));

  // G and M code reference
  await ev(`document.getElementById('refBtn').click()`); await sleep(150);
  check('code reference opens with the search focused', await ev(`document.getElementById('ref').open && document.activeElement === document.getElementById('refQ')`));
  check('code reference lists every code, in groups', await ev(`document.querySelectorAll('#refBody tr[data-code]').length === EDM.CODES.length && document.querySelectorAll('#refBody tr.grp').length >= 10`));
  await ev(`document.documentElement.dataset.theme='light';document.querySelector('#ref details').open=true`); await sleep(100);
  await shot('codes.png');
  await ev(`delete document.documentElement.dataset.theme;document.querySelector('#ref details').open=false`);
  await typeIn(`document.getElementById('refQ')`, 'drain');
  check('code search: drain finds M57 and M58', await ev(`[...document.querySelectorAll('#refBody tr[data-code]')].map(r=>r.dataset.code).join(' ')`) === 'M57 M58');
  await typeIn(`document.getElementById('refQ')`, 'g4');
  check('code search: a code typed short comes first', await ev(`document.querySelector('#refBody tr[data-code]').dataset.code`) === 'G04');
  await typeIn(`document.getElementById('refQ')`, 'xyzzy');
  check('code search: nothing matches', (await ev(`document.getElementById('refBody').textContent`)).includes('Nothing matches'));
  await typeIn(`document.getElementById('refQ')`, '');
  await ev(`(()=>{const s=document.getElementById('refKind');s.value='gen';s.dispatchEvent(new Event('input'))})()`); await sleep(80);
  check('code filter: written by this generator', await ev(`[...document.querySelectorAll('#refBody tr[data-code]')].length === EDM.CODES.filter(r=>r.gen).length && !!document.querySelector('#refBody tr[data-code="M84"]') && !document.querySelector('#refBody tr[data-code="M85"]')`));
  await ev(`(()=>{const s=document.getElementById('refKind');s.value='';s.dispatchEvent(new Event('input'))})()`); await sleep(80);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150);
  check('Escape closes the code reference', await ev(`!document.getElementById('ref').open`));

  // machine table drawing
  await ev(`document.getElementById('tblBtn').click()`); await sleep(150);
  check('machine table opens on the job\'s machine, with every M8 hole drawn', await ev(`document.getElementById('tbl').open && document.getElementById('tblModel').value === 'MV2400S' && document.querySelectorAll('#tblSvg circle').length === EDM.TABLES.MV2400S.holes.length`));
  await ev(`(()=>{const s=document.getElementById('tblModel');s.value='MV4800';s.dispatchEvent(new Event('input'))})()`); await sleep(100);
  check('machine table: another model', await ev(`document.querySelectorAll('#tblSvg circle').length === 68 && document.getElementById('tblTitle').textContent.startsWith('MV4800')`));
  await ev(`(()=>{const s=document.getElementById('tblModel');s.value='MV2400S';s.dispatchEvent(new Event('input'))})()`); await sleep(100);
  await ev(`document.documentElement.dataset.theme='light'`); await sleep(80); await shot('table.png'); await ev(`delete document.documentElement.dataset.theme`);
  try { fs.unlinkSync(path.join(shots, 'MV2400S-TABLE-INCH.dxf')); } catch (e) { /* not there */ }
  await ev(`(()=>{const s=document.getElementById('tblUnits');s.value='in';s.dispatchEvent(new Event('input'))})()`); await sleep(80);
  await ev(`document.getElementById('tblDl').click()`);
  for (let i = 0; i < 30 && !fs.existsSync(path.join(shots, 'MV2400S-TABLE-INCH.dxf')); i++) await sleep(100);
  check('machine table DXF downloads', fs.existsSync(path.join(shots, 'MV2400S-TABLE-INCH.dxf')) && /\$INSUNITS\r\n70\r\n1\r\n/.test(fs.readFileSync(path.join(shots, 'MV2400S-TABLE-INCH.dxf'), 'utf8')));
  await ev(`document.getElementById('tblClose').click()`); await sleep(80);
  check('machine table closes', await ev(`!document.getElementById('tbl').open`));
  await ev(`document.documentElement.dataset.theme='dark'`); await sleep(100); await shot('dark.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true }); await sleep(200);
  check('no sideways scroll on a phone', await ev(`document.documentElement.scrollWidth <= 391`), await ev(`document.documentElement.scrollWidth`));
  await shot('phone.png');
  await ev(`document.getElementById('refBtn').click()`); await sleep(200);
  check('code reference fits a phone', await ev(`(()=>{const b=document.getElementById('refBody'), d=document.getElementById('ref').getBoundingClientRect();return b.scrollWidth <= b.clientWidth + 1 && d.left >= 0 && d.right <= 391})()`), await ev(`[document.getElementById('refBody').scrollWidth, document.getElementById('refBody').clientWidth]`));
  await shot('codes-phone.png');
  await ev(`document.getElementById('ref').close()`);
  await ev(`document.getElementById('tblBtn').click()`); await sleep(200);
  check('machine table fits a phone', await ev(`(()=>{const d=document.getElementById('tbl').getBoundingClientRect();return d.left >= 0 && d.right <= 391 && document.documentElement.scrollWidth <= 391})()`));
  await shot('table-phone.png');
  await ev(`document.getElementById('tbl').close()`);

  check('no page errors', errors.length === 0, errors);
  console.log(passes + ' passed, ' + fails + ' failed. Screenshots: ' + shots);
  chrome.kill(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); chrome.kill(); process.exit(1); });
