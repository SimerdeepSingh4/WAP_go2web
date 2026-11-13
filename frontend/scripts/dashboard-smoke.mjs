// Production-build browser checks using an installed Chromium browser and CDP.
// All API traffic is intercepted with test fixtures. No production records are changed.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.qa');
await mkdir(output, { recursive: true });
const browserPath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert(existsSync(browserPath), 'Set BROWSER_PATH to an installed Chromium browser.');
assert(existsSync(join(root, 'dist/index.html')), 'Run npm run build first.');
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, 'dist', '.' + pathname);
    if (!file.startsWith(resolve(root, 'dist'))) { res.writeHead(403).end(); return; }
    const target = extname(file) ? file : join(root, 'dist/index.html');
    const body = await readFile(target);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png' })[extname(target)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'go2web-browser-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws;
let role = 'Super Admin', mode = 'normal', preview = false, failSubmit = false;
const mutations = [], failures = [], results = [], runtimeErrors = [];
const owner = { _id: 'user-1', username: 'Test user with a long account name for layout verification', email: 'user@example.test', role: 'User', status: 'active', ratePerMsg: 2.5 };
const reseller = { _id: 'reseller-1', username: 'Test reseller', email: 'reseller@example.test', role: 'Reseller', status: 'active', ratePerMsg: 2.5 };
const campaigns = Array.from({ length: 13 }, (_, i) => ({ _id: `campaign-${i}`, campaignTitle: i === 0 ? 'November customer update with a long campaign title for layout verification' : `Test campaign ${i + 1}`, campaignDescription: 'Browser test fixture', messageBody: '<p>Hello <strong>customer</strong>.</p><p>Your update is ready.</p>', userId: owner, totalRecipients: 20, creditsDeducted: 50, status: i % 2 ? 'completed' : 'pending', createdAt: '2026-11-03T06:00:00Z', schedule: 'now', images: ['https://example.test/image.png'], documents: ['https://example.test/brief.pdf'], campaignSummary: i % 2 ? { reportedAt: '2026-11-03T07:00:00Z', sent: 20, delivered: 18, read: 10, failed: 2 } : {} }));
function fixture(url, method) {
  const path = new URL(url).pathname.replace(/^.*\/api/, '');
  const user = { ...(role === 'User' ? owner : reseller), role, id: role === 'User' ? 'user-1' : 'reseller-1', isPreview: preview, originalAdmin: preview ? { role: 'Super Admin' } : null };
  if (path === '/auth/me') return { user };
  if (path === '/notifications') return { items: [], unreadCount: 0, attentionCount: 0 };
  if (method !== 'GET' && method !== 'OPTIONS') { mutations.push({ path, method }); return { success: true, message: 'Test server accepted the request', data: campaigns[0] }; }
  if (path === '/credits/balance') return { wallet: { balance: 1000, ratePerMsg: 2.5, isLocked: mode === 'locked', expiresAt: null } };
  if (path === '/users/me') return { user };
  if (path === '/users') return { users: mode === 'empty' ? [] : [owner, reseller, { ...reseller, _id: 'admin-1', role: 'Super Admin' }] };
  if (path === '/campaigns') return { data: mode === 'empty' ? [] : campaigns };
  if (/^\/campaigns\/[^/]+\/tracked-numbers$/.test(path)) return { data: { rows: [], totalUserCampaigns: 1, baseline: true, submitted: true, username: owner.username } };
  if (path.startsWith('/campaigns/')) return { data: campaigns.find(c => path.endsWith(c._id)) || campaigns[0] };
  if (path === '/credits/transactions') return { transactions: mode === 'empty' ? [] : [{ _id: 'tx-1', type: 'ALLOCATE', amount: 1000, fromUser: reseller, toUser: owner, performedBy: reseller, balanceAfterTo: 1000, createdAt: '2026-11-03T06:00:00Z', notes: 'Test allocation' }], pagination: { total: mode === 'empty' ? 0 : 1, totalPages: 1 } };
  if (path === '/auth/sessions') return { sessions: [{ id: 'session-1', userAgent: 'Test browser on Windows', isCurrentDevice: true, ip: '127.0.0.1', createdAt: '2026-11-03T06:00:00Z' }, { id: 'session-2', userAgent: 'Test browser on mobile', isCurrentDevice: false }], activeCount: 2, maxAllowedDevices: 3 };
  if (path === '/contacts') return { contacts: mode === 'empty' ? [] : [{ _id: 'contact-1', name: 'Test contact', phoneNumber: '919876543210', email: 'contact@example.test', groupId: { _id: 'group-1', name: 'Customers' } }] };
  if (path === '/dashboard/stats') return { stats: { campaigns: { totalCampaigns: 13 }, accounts: { activeResellers: 1, totalResellers: 1, totalUsers: 1 }, credits: { totalCreditsInCirculation: 1000, creditsAllocatedThisMonth: 1000, creditsPurchasedThisMonth: 1000 } } };
  return { success: true, data: [], users: [] };
}
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); } }
  assert(port, 'Browser did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, reject) => { ws.onopen = r; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000); pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params })); }); }
  ws.onmessage = async e => {
    const msg = JSON.parse(e.data);
    if (msg.id) { const p = pending.get(msg.id); if (!p) return; clearTimeout(p.timeout); pending.delete(msg.id); msg.error ? p.reject(Error(msg.error.message)) : p.resolve(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') runtimeErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params;
      try {
        if (request.url.startsWith(origin) && !new URL(request.url).pathname.startsWith('/api/')) { await send('Fetch.continueRequest', { requestId }); return; }
        if (!request.url.includes('/api/')) { await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
        const isAuth = request.url.includes('/auth/me');
        if (mode === 'loading' && !isAuth) await delay(1200);
        const failed = (mode === 'error' && !isAuth) || (failSubmit && request.method === 'POST' && request.url.endsWith('/campaigns'));
        const body = failed ? { message: 'Test service unavailable' } : fixture(request.url, request.method);
        await send('Fetch.fulfillRequest', { requestId, responseCode: failed ? 503 : 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Credentials', value: 'true' }, { name: 'Access-Control-Allow-Headers', value: 'content-type,authorization' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
      } catch (err) { if (!String(err).includes('Invalid InterceptionId')) failures.push(String(err)); }
    }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*socket.io*'] });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const waitFor = async expression => { for (let i = 0; i < 75; i++) { if (await evaluate(expression)) return; await delay(80); } throw Error(`Timed out: ${expression}`); };
  const click = async text => { const found = await evaluate(`(() => { const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)} && e.getClientRects().length); if(!b)return false; b.click();return true; })()`); assert(found, `Missing control: ${text}`); await delay(100); };
  const setValue = (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('Missing field'); Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  async function navigate(path, width = 1280) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const target = origin + path + (path.includes('?') ? '&' : '?') + '_qa=' + Date.now();
    await send('Page.navigate', { url: target });
    await waitFor(`(location.href === ${JSON.stringify(target)} || ${JSON.stringify(path === '/admin' && role === 'User')} && location.pathname === '/user') && document.readyState !== 'loading'`);
    await waitFor("Boolean(document.querySelector('h1'))");
    if (mode !== 'loading') await waitFor("!document.querySelector('[aria-label=\"Loading records\"]')");
    await delay(120);
  }
  async function check(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message }); failures.push(`${name}: ${error.message}`); } }
  const routes = {
    'Super Admin': ['/admin', '/admin/campaigns', '/admin/reports', '/admin/resellers', '/admin/users', '/admin/administrators', '/admin/credits', '/admin/activity', '/admin/settings', '/admin/contacts', '/admin/campaigns/campaign-0'],
    Reseller: ['/reseller', '/reseller/users', '/reseller/campaigns', '/reseller/reports', '/reseller/credits', '/reseller/activity', '/reseller/settings', '/reseller/campaigns/create'],
    User: ['/user', '/user/campaigns', '/user/credits', '/user/activity', '/user/settings', '/user/campaigns/create'],
  };
  for (const [r, paths] of Object.entries(routes)) {
    role = r;
    for (const width of (process.argv.includes('--targeted') ? [768] : [320, 390, 768, 1280])) for (const path of (process.argv.includes('--targeted') ? paths.filter(p => p.endsWith('/create') || p.endsWith('/settings') || p === '/admin/campaigns/campaign-0') : paths)) await check(`${r} ${path} @${width}`, async () => {
      await navigate(path, width);
      const dimensions = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.textContent,main:Boolean(document.querySelector('main')),errors:document.body.innerText.includes('Unexpected Application Error')})`);
      assert(dimensions.main && !dimensions.errors, 'Page failed to render');
      if (dimensions.scroll > width + 1) {
        const overflow = await evaluate("[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth).slice(0,8).map(e=>({tag:e.tagName,css:e.className,text:e.textContent.slice(0,60)}))");
        throw Error(`Horizontal overflow: ${dimensions.scroll}px ${JSON.stringify(overflow)}`);
      }
      if (path === paths[0] && [390, 1280].includes(width)) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, `${r.replaceAll(' ', '-')}-${width}.png`), Buffer.from(shot.data, 'base64')); }
    });
    console.log(`${r}: layout checks complete`);
  }
  role = 'User';
  await check('User detail is read-only', async () => { await navigate('/user/campaigns?campaign=campaign-0', 390); await waitFor("Boolean(document.querySelector('[role=dialog]'))"); const text=await evaluate('document.body.innerText'); assert(!text.includes('Change status') && !text.includes('Publish report')); });
  await check('Mobile navigation', async () => { await navigate('/user', 390); await evaluate("document.querySelector('[aria-label=\"Toggle navigation\"]').click()"); await waitFor("Boolean(document.querySelector('[role=dialog]'))"); await click('Campaigns'); await waitFor("location.pathname==='/user/campaigns'"); });
  await check('Campaign review, failed submit recovery, success redirect', async () => {
    await navigate('/user/campaigns/create'); await setValue('#title', 'Review test'); await setValue('#description', 'Test submission'); await setValue('#recipients', '919876543210\n919876543211');
    await evaluate("(()=>{const e=document.querySelector('.ql-editor');e.innerHTML='<p>Test message</p>';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await click('Review campaign'); await waitFor("Boolean(document.querySelector('[role=dialog]'))");
    assert((await evaluate("document.querySelector('[role=dialog]').innerText")).includes('5 credits'), 'Review must use 2.5 credits per recipient');
    await click('Back to edit'); assert.equal(await evaluate("document.querySelector('#title').value"), 'Review test'); await click('Review campaign');
    failSubmit = true; await click('Submit campaign'); await waitFor("document.body.innerText.includes('Test service unavailable')"); failSubmit = false; await click('Submit campaign'); await waitFor("location.pathname==='/user/campaigns'");
  });
  await check('Credit request review and confirmation', async () => { await navigate('/user/credits?request=new',390); await setValue('#request-amount', '50'); await click('Review request'); await click('Submit request'); await waitFor("!new URLSearchParams(location.search).has('request') && ![...document.querySelectorAll('[role=dialog]')].some(dialog => dialog.textContent.includes('Review credit request'))"); assert(mutations.some(m=>m.path==='/credits/request')); });
  for (const state of ['empty','error','loading']) await check(`${state} state`, async () => { mode=state; await navigate('/user/campaigns'); await waitFor(state==='empty'?"document.body.innerText.includes('No campaigns yet')":state==='error'?"document.body.innerText.includes('Unable to load')":"Boolean(document.querySelector('[aria-label=\"Loading records\"]'))"); });
  mode='normal';
  await check('Preview blocks submission', async () => { preview=true; await navigate('/user/campaigns/create'); assert(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Review campaign'))?.disabled")); preview=false; });
  await check('User cannot enter admin panel', async () => { await navigate('/admin'); const text=await evaluate('document.body.innerText'); assert(!text.includes('Credits in circulation')); });
  assert.equal(runtimeErrors.length,0, runtimeErrors.join('\n'));
} catch(error) { failures.push(error.stack); }
finally {
  if(ws) { ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); await delay(200); ws.close(); } browser.kill(); server.closeAllConnections(); server.close();
  await writeFile(join(output,'results.json'),JSON.stringify({results,failures,runtimeErrors,mutations},null,2));
}
console.log(`${results.filter(r=>r.passed).length}/${results.length} checks passed`);
if(failures.length) { console.error(failures.join('\n')); process.exitCode=1; }
