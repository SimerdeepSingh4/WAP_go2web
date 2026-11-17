// Production-build browser checks using an installed Chromium browser and CDP.
// All API traffic is intercepted with test fixtures. No production records are changed.
// Run after npm run build: node scripts/auth-session-smoke.mjs
// Waits beyond the former 30-second signed-out polling interval.
// Set AUTH_SMOKE_ORIGIN to a running Vite URL to also check development/StrictMode.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.env.AUTH_SMOKE_ORIGIN ? '.qa/auth-session-loop-dev' : '.qa/auth-session-loop');
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
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' })[extname(target)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = process.env.AUTH_SMOKE_ORIGIN || `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'go2web-browser-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws;
const mediaRequests = [];
const authRequests = [];
let authenticated = false, rejectLogin = false, loginVersion = 0;
let role = 'Super Admin', mode = 'normal', preview = false, failSubmit = false;
const mutations = [], failures = [], results = [], runtimeErrors = [];
const owner = { _id: 'user-1', username: 'Test user with a long account name for layout verification', email: 'user@example.test', role: 'User', status: 'active', ratePerMsg: 2.5 };
const reseller = { _id: 'reseller-1', username: 'Test reseller', email: 'reseller@example.test', role: 'Reseller', status: 'active', ratePerMsg: 2.5 };
Object.assign(owner, { featureAccess: { campaignDp: true, campaignNumber: true, campaignLink: true }, dp_img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aogAAAABJRU5ErkJggg==' });
const campaigns = Array.from({ length: 13 }, (_, i) => ({ _id: `campaign-${i}`, campaignTitle: i === 0 ? 'November customer update with a long campaign title for layout verification' : `Test campaign ${i + 1}`, campaignDescription: 'Browser test fixture', messageBody: '<p>Hello <strong>customer</strong>.</p><p>Your update is ready.</p>', userId: owner, totalRecipients: 20, creditsDeducted: 50, status: i % 2 ? 'completed' : 'pending', createdAt: '2026-11-03T06:00:00Z', schedule: 'now', images: ['https://example.test/image.png'], documents: ['https://example.test/brief.pdf'], campaignSummary: i % 2 ? { reportedAt: '2026-11-03T07:00:00Z', sent: 20, delivered: 18, read: 10, failed: 2 } : {} }));
function fixture(url, method) {
  const path = new URL(url).pathname.replace(/^.*\/api/, '');
  const user = { ...(role === 'User' ? owner : reseller), role, id: role === 'User' ? 'user-1' : 'reseller-1', isPreview: preview, originalAdmin: preview ? { role: 'Super Admin' } : null };
  if (path === '/review-pins') return { pins: [] };
  if (path === '/settings/media-limits') return { effective: { imageMB: 3, videoMB: 3, pdfMB: 3 }, defaults: { imageMB: 3, videoMB: 3, pdfMB: 3 } };
  if (path === '/campaigns/daily-usage') return { isUnlimited: true, remainingToday: 10 };
  if (path === '/auth/me') return { user, currentSession: { id: 'session-' + loginVersion } };
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
    if (msg.method === 'Page.javascriptDialogOpening' && msg.params.type === 'beforeunload') {
      await send('Page.handleJavaScriptDialog', { accept: true });
    }
    if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params;
      try {
        if (request.url.startsWith(origin) && !new URL(request.url).pathname.startsWith('/api/')) { await send('Fetch.continueRequest', { requestId }); return; }
        if (!request.url.includes('/api/')) { await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
        if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/api/campaigns')) mediaRequests.push(request.postData || '');
        
        const authPath=new URL(request.url).pathname.replace(/^.*\/api/,'');
        const responseHeaders=[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:origin},{name:'Access-Control-Allow-Credentials',value:'true'},{name:'Access-Control-Allow-Headers',value:'content-type,authorization,x-app-request,x-account-context,x-expected-account,x-expected-session'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PATCH,DELETE,OPTIONS'}];
        const controlResponse=async(status,body)=>send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders,body:Buffer.from(JSON.stringify(body)).toString('base64')});
        if(request.method==='OPTIONS'){await controlResponse(200,{});return;}
        authRequests.push({path:authPath,method:request.method,authenticated});
        if(authPath==='/auth/login'&&request.method==='POST'){
          if(rejectLogin){await controlResponse(401,{message:'Invalid credentials',isLoggedOut:true});return;}
          authenticated=true;loginVersion++;
          await controlResponse(200,{success:true,...fixture(request.url.replace('/auth/login','/auth/me'),'GET'),currentSession:{id:'session-'+loginVersion}});return;
        }
        if(!authenticated){await controlResponse(401,{success:false,isLoggedOut:true,message:'Not authenticated'});return;}
        const isAuth = request.url.includes('/auth/me');
        if (mode === 'loading' && !isAuth) await delay(1200);
        const failed = (mode === 'error' && !isAuth) || (failSubmit && request.method === 'POST' && request.url.endsWith('/campaigns'));
        const body = failed ? { message: 'Test service unavailable' } : fixture(request.url, request.method);
        await send('Fetch.fulfillRequest', { requestId, responseCode: failed ? 503 : 200, responseHeaders, body: Buffer.from(JSON.stringify(body)).toString('base64') });
      } catch (err) { if (!String(err).includes('Invalid InterceptionId')) failures.push(String(err)); }
    }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*socket.io*'] });
  if (process.env.AUTH_SMOKE_ORIGIN) {
    // Mock sign-ins have no real server cookie. Isolate Socket.IO from the real
    // backend, while preserving Vite's own development WebSocket connection.
    const socketStub = `ws://127.0.0.1:${server.address().port}`;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const NativeWebSocket=window.WebSocket;window.WebSocket=class extends NativeWebSocket{constructor(url,protocols){const original=String(url);const target=original.includes('/socket.io/')?${JSON.stringify(socketStub)}+new URL(original).pathname+new URL(original).search:url;super(target,protocols??[]);}};})()` });
  }
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const waitFor = async expression => { for (let i = 0; i < (process.env.AUTH_SMOKE_ORIGIN ? 375 : 75); i++) { if (await evaluate(expression)) return; await delay(80); } throw Error(`Timed out: ${expression}`); };
  const click = async text => { const found = await evaluate(`(() => { const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)} && e.getClientRects().length); if(!b)return false; b.click();return true; })()`); assert(found, `Missing control: ${text}`); await delay(100); };
  const setValue = (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw Error('Missing field'); Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  async function navigate(path, width = 1280) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const target = origin + path + (path.includes('?') ? '&' : '?') + '_qa=' + Date.now();
    await send('Page.navigate', { url: target });
    await waitFor(`(location.href === ${JSON.stringify(target)} || ${JSON.stringify(path === '/admin' && role === 'User')} && location.pathname === '/user') && document.readyState !== 'loading'`);
    await waitFor("Boolean(document.querySelector('h1'))");
    await waitFor("!document.querySelector('[data-tour-loading=\"true\"]')");
    if (mode !== 'loading') await waitFor("!document.querySelector('[aria-label=\"Loading records\"]')");
    await delay(120);
  }
  async function check(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { const page = await evaluate("({path:location.pathname,text:document.body.innerText.slice(0,1200)})").catch(()=>null); results.push({ name, passed: false, error: error.message, page }); failures.push(`${name}: ${error.message}${page ? '\n'+JSON.stringify(page) : ''}`); } }



  role='User';
  const counts=()=>({me:authRequests.filter(r=>r.path==='/auth/me').length,pins:authRequests.filter(r=>r.path==='/review-pins').length});
  const goLogin=async path=>{await send('Page.navigate',{url:origin+path});await waitFor("Boolean(document.querySelector('#identifier')) && location.pathname==='/login'");await delay(200);};
  const observe=()=>evaluate("window.__sessionScreens=0;window.__loginInput=document.querySelector('#identifier');window.__authObserver?.disconnect();window.__authObserver=new MutationObserver(()=>{if(document.body.textContent.includes('Updating your browser session'))window.__sessionScreens++;});window.__authObserver.observe(document.body,{subtree:true,childList:true,characterData:true});");
  const stableLogin=async()=>{assert(await evaluate("location.pathname==='/login' && document.querySelector('#identifier')===window.__loginInput && !document.body.textContent.includes('Updating your browser session')"));assert.equal(await evaluate('window.__sessionScreens'),0);};
  await goLogin('/login');await observe();
  await check('Signed-out login sends no protected review-pin requests',async()=>{
    await delay(1800);const c=counts();assert(c.me>=1&&c.me<=2,JSON.stringify(c));assert.equal(c.pins,0);await stableLogin();assert.equal(await evaluate("Boolean(document.querySelector('.skiper46-dock'))"),false);
  });
  await check('Repeated unauthorized events cannot restart a signed-out session',async()=>{
    const before=counts();await evaluate("for(let i=0;i<12;i++)window.dispatchEvent(new CustomEvent('auth:unauthorized'))");await delay(300);assert.deepEqual(counts(),before);await stableLogin();
  });
  await check('Repeated focus and visibility events leave signed-out pages idle',async()=>{
    const before=counts();await evaluate("for(let i=0;i<20;i++){window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));}");await delay(400);assert.deepEqual(counts(),before);await stableLogin();
  });
  if(process.env.AUTH_SMOKE_ORIGIN)await check('Direct pin API calls are blocked locally without a verified session',async()=>{
    const before=counts();const code=await evaluate("(async()=>{const {default:api}=await import('/src/api/client.js');try{await api.get('/review-pins',{params:{page:'/'}});}catch(error){return error.code;}})()");assert.equal(code,'AUTH_REQUIRED');assert.deepEqual(counts(),before);await stableLogin();
  });
  await check('Signed-out sessions do not poll auth after the old 30-second interval',async()=>{
    const before=counts();await delay(Number(process.env.AUTH_SMOKE_IDLE_MS)||32_000);assert.deepEqual(counts(),before);await stableLogin();
  });
  await check('Opening the root route settles on login without a request loop',async()=>{
    const before=counts();await goLogin('/');await observe();await delay(1000);const after=counts();assert(after.me-before.me<=2,JSON.stringify({before,after}));assert.equal(after.pins,0);await stableLogin();
  });
  await check('Invalid credentials stay on the same login form without session refresh',async()=>{
    rejectLogin=true;const before=counts();await setValue('#identifier','user@example.test');await setValue('#password','test-only-password');await click('Sign in');await waitFor("document.querySelector('#login-error')?.textContent.includes('Invalid credentials')");await delay(300);assert.deepEqual(counts(),before);await stableLogin();rejectLogin=false;
  });
  await check('Successful login enables review pins only after authentication',async()=>{
    await click('Sign in');await waitFor("location.pathname==='/user' && Boolean(document.querySelector('.overview-metric-card'))");await waitFor("Boolean(document.querySelector('.skiper46-dock'))");await delay(300);
    assert(authRequests.some(r=>r.path==='/review-pins'));assert(authRequests.filter(r=>r.path==='/review-pins').every(r=>r.authenticated));await delay(600);await waitFor("Boolean(document.querySelector('a[href=\"/user/credits\"]'))");
  });
  await check('A rejected session returns to login without another auth request',async()=>{
    authenticated=false;const before=counts();
    if(process.env.AUTH_SMOKE_ORIGIN)await evaluate("(async()=>{const {default:api}=await import('/src/api/client.js');try{await api.get('/review-pins',{params:{page:'/user/credits'}});}catch{}})()");
    else await evaluate("window.dispatchEvent(new CustomEvent('auth:unauthorized'))");
    await waitFor("Boolean(document.querySelector('#identifier')) && location.pathname==='/login'");await delay(500);await observe();const after=counts();assert.equal(after.me,before.me,JSON.stringify({before,after}));
    await delay(1500);assert.deepEqual(counts(),after);await stableLogin();assert.equal(await evaluate("Boolean(document.querySelector('.skiper46-dock'))"),false);
  });
  await check('Refocusing login after expiry makes no additional auth requests',async()=>{
    const before=counts();await evaluate("window.dispatchEvent(new Event('focus'))");await delay(400);assert.deepEqual(counts(),before);await stableLogin();
  });
  await check('Browser-session notifications still synchronize external sign-in and sign-out',async()=>{
    authenticated=true;await evaluate("window.dispatchEvent(new CustomEvent('auth:session-changed'))");await waitFor("location.pathname==='/user' && Boolean(document.querySelector('.overview-metric-card'))");
    authenticated=false;await evaluate("window.dispatchEvent(new CustomEvent('auth:session-changed'))");await waitFor("Boolean(document.querySelector('#identifier')) && location.pathname==='/login'");await observe();const before=counts();await delay(800);assert.deepEqual(counts(),before);await stableLogin();
  });
  assert.equal(runtimeErrors.length,0,runtimeErrors.join('\n'));

} catch(error) { failures.push(error.stack); }
finally {
  if(ws) { ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); await delay(200); ws.close(); } browser.kill(); server.closeAllConnections(); server.close();
  await writeFile(join(output,'results.json'),JSON.stringify({results,failures,runtimeErrors,mutations,authRequests},null,2));
}
console.log(`${results.filter(r=>r.passed).length}/${results.length} checks passed`);
if(failures.length) { console.error(failures.join('\n')); process.exitCode=1; }
