import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.SMOKE_PORT || await getFreePort());
const debugPort = Number(process.env.SMOKE_DEBUG_PORT || (9300 + (process.pid % 500)));
const baseUrl = `http://127.0.0.1:${port}`;
const dataFile = path.join(os.tmpdir(), `xinmeiti-smoke-${process.pid}-${Date.now()}.json`);
const profileDir = path.join(os.tmpdir(), `xinmeiti-edge-${process.pid}-${Date.now()}`);
const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitFor(check, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await sleep(200);
  }
  throw new Error('等待条件超时');
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method) this.events.push(message);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.socket.close();
  }
}

let server;
let edge;
let client;
try {
  let serverExit = null;
  server = spawn(process.execPath, ['apps/web/server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile },
    stdio: 'ignore'
  });

  await waitFor(async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  });

  const edgePath = edgeCandidates.find((candidate) => candidate);
  if (!edgePath) throw new Error('未找到 Edge 可执行文件');
  edge = spawn(edgePath, [
    '--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', '--disable-sync', '--disable-cache', '--disk-cache-size=1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    `${baseUrl}/apps/web/?debug=1&v=0.4.0#data`
  ], { stdio: 'ignore' });

  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json();
    return targets.find((item) => item.type === 'page' && item.url.startsWith(`${baseUrl}/apps/web/`));
  });

  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Runtime.enable');
await client.send('Page.enable');
await client.send('Page.reload', { ignoreCache: true });
  await sleep(2500);

  const expression = `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const pages = {};
    for (const view of ['dashboard', 'campaigns', 'records', 'review', 'data']) {
      location.hash = view;
      await wait(800);
      pages[view] = document.getElementById('app')?.innerText || '';
    }
    const appSource = await fetch('./js/app.js').then((response) => response.text());
    const health = await fetch('/api/health').then((response) => response.json());
    const envelope = await fetch('/api/database').then((response) => response.json());
    return {
      pages,
      href: location.href,
      debugType: typeof window.__XINMEITI_DEBUG__,
      appHasDebug: appSource.includes('__XINMEITI_DEBUG__'),
      scriptSrc: document.querySelector('script[type=module]')?.src,
      runtimeEvents: window.__XINMEITI_RUNTIME_EVENTS__ || [],
      revision: health.revision,
      records: envelope.database?.records?.length || 0,
      snapshots: envelope.database?.snapshots?.length || 0,
      syncVisible: pages.data.includes('服务器同步'),
      chartVisible: pages.review.includes('互动增长') || pages.review.includes('等待更多快照'),
      anomalyVisible: pages.review.includes('异常检查'),
      campaignTrendVisible: pages.campaigns.includes('每周投放节奏'),
      xlsxVisible: pages.data.includes('导出 XLSX'),
      debug: window.__XINMEITI_DEBUG__ ? window.__XINMEITI_DEBUG__() : null
    };
  })()`;

  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  const value = result.result.value;
  value.runtimeEvents = client.events
    .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Runtime.consoleAPICalled')
    .slice(-10);

  const requiredPages = ['dashboard', 'campaigns', 'records', 'review', 'data'];
  for (const page of requiredPages) {
    if (!value.pages[page]) throw new Error(`页面 ${page} 未渲染`);
  }
  if (value.revision < 1 || value.records < 1 || value.snapshots < 1) {
    throw new Error(`服务端同步失败：revision=${value.revision}, records=${value.records}`);
  }
  if (!value.syncVisible || !value.chartVisible || !value.anomalyVisible) {
    throw new Error('关键界面功能未通过烟测');
  }
  if (!value.xlsxVisible || !value.campaignTrendVisible) {
    throw new Error('导出入口或战役趋势未通过烟测');
  }
  if (value.runtimeEvents.length) {
    throw new Error(`浏览器运行异常：${value.runtimeEvents.map((event) => event.params?.exceptionDetails?.exception?.description || event.method).join(' | ')}`);
  }  console.log(JSON.stringify({ revision: value.revision, records: value.records, snapshots: value.snapshots, syncVisible: value.syncVisible, chartVisible: value.chartVisible, anomalyVisible: value.anomalyVisible, xlsxVisible: value.xlsxVisible, campaignTrendVisible: value.campaignTrendVisible, runtimeEvents: value.runtimeEvents, debug: value.debug }, null, 2));
} finally {
  if (client) client.close();
  if (edge && !edge.killed) edge.kill();
  if (server && !server.killed) server.kill();
  await sleep(300);
  await fs.rm(dataFile, { force: true }).catch(() => {});
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}