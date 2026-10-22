// End-to-end check of the built HEM Toolpath Generator in headless Chrome (DevTools protocol, no packages): the cone
// operation's fields, plan view, section and Macro tab, inside and outside, and the page throws nothing.
// usage: node test/hem-browser.js [screenshot dir]
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const page = path.resolve(__dirname, '../apps/HEM Toolpath Generator.html'), shots = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'hem-shots-'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'hem-prof-')), port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1500,1100', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0, passes = 0;
const check = (n, c, d) => { if (c) passes++; else { fails++; console.log('FAIL', n, d === undefined ? '' : JSON.stringify(d)); } };
(async () => {
  let t; for (let i = 0; i < 60; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (e) { await sleep(200); } }
  const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
  let id = 0; const pend = {}, errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 80) + ': ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(shots, n), Buffer.from(r.result.data, 'base64')); };
  const seg = (k, v) => ev(`document.querySelector('#form [data-k="${k}"] [data-v="${v}"]').click()`);
  const typeIn = (k, v) => ev(`(()=>{const i=document.querySelector('#form input[data-k="${k}"]');i.value=${JSON.stringify(v)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const waitDone = async () => { for (let i = 0; i < 100; i++) { await sleep(150); if (await ev(`document.getElementById('busy').hidden`)) return; } };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'file://' + page }); await sleep(1500);
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1500);
  check('loads', await ev('!!window.HEM && !!window.MACH1'));
  await seg('op', 'cone'); await waitDone(); await sleep(400);
  check('cone fields shown', await ev(`!!document.querySelector('#form input[data-k="coneTopD"]') && !!document.querySelector('#form input[data-k="coneCR"]') && !!document.querySelector('#form input[data-k="coneStep"]')`));
  check('section shown', await ev(`!document.getElementById('sectWrap').hidden && document.querySelectorAll('#sect path').length > 4`));
  check('angle hint', (await ev(`document.querySelector('[data-hint="coneBotD"]').textContent`)).includes('° a side'));
  check('macro tab', await ev(`[...document.querySelectorAll('#tabs button')].map(b=>b.textContent).join('|')`) === 'G-code|Mazatrol|Macro|Cutting data|Dimensions');
  await ev(`document.querySelector('#tabs [data-t="mac"]').click()`); await sleep(200);
  const mac = await ev(`document.querySelector('#out pre').textContent`);
  check('macro listing', /WHILE\[#152LE#167\]DO1/.test(mac) && /M99\n%/.test(mac));
  check('SUB PRO listing', /SUB PRO\s+HEM-CONE|SUB PRO\s+CONE/.test(await ev(`document.querySelectorAll('#out pre')[1].textContent`)), await ev(`document.querySelectorAll('#out pre')[1].textContent`));
  check('download buttons', /^Download .+\.EIA\|Copy\|SUB PRO \.PBD\|SUB PRO \.PBM$/.test(await ev(`[...document.querySelectorAll('#dls button')].map(b=>b.textContent).join('|')`)));
  await shot('inside.png');
  await seg('coneSide', 'outside'); await waitDone(); await sleep(400);
  check('swapped to suit outside', await ev(`[document.querySelector('#form input[data-k="coneTopD"]').value, document.querySelector('#form input[data-k="coneBotD"]').value].join()`) === '1,2');
  check('stock field outside', await ev(`!!document.querySelector('#form input[data-k="stockW"]') && !document.querySelector('#form [data-k="stockType"]')`));
  check('no warnings outside', await ev(`document.getElementById('warn').textContent`).then(t => !/stock|cone/i.test(t)), await ev(`document.getElementById('warn').textContent`));
  await typeIn('coneCR', '0.125'); await waitDone(); await sleep(300);
  await ev(`(()=>{const s=document.getElementById('scrub'); s.value=Math.round(s.max*0.8); s.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(300);
  await shot('outside.png');
  await ev(`document.querySelector('#tabs [data-t="g"]').click()`); await sleep(100);
  await seg('op', 'pocket'); await waitDone(); await sleep(300);
  check('section hidden for a pocket', await ev(`document.getElementById('sectWrap').hidden`));
  check('macro tab gone', !(await ev(`[...document.querySelectorAll('#tabs button')].map(b=>b.textContent).join('|')`)).includes('Macro'));
  check('no page errors', errors.length === 0, errors);
  console.log(passes + ' passed, ' + fails + ' failed'); ws.close(); chrome.kill(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); chrome.kill(); process.exit(1); });
