import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchReportSheets, loadFeishuConfig } from './lib/feishu.mjs';
import { buildReport } from './lib/report-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(__dirname, 'data', 'baseline-report.json');
const indexPath = path.join(__dirname, 'index.html');
const appSlug = process.env.APP_SLUG || 'ihealth-report';
const dataDir = process.env.APP_DATA_DIR || path.join(__dirname, 'data');
const dataPath = path.join(dataDir, 'current-report.json');
const statusPath = path.join(dataDir, 'refresh-status.json');
const port = Number(process.env.PORT || 8775);
const host = process.env.HOST || '127.0.0.1';
const basePath = process.env.APP_BASE_PATH || '/apps/' + appSlug + '/';
const maxBodyBytes = 1024 * 1024;
const securityHeaders = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': 'strict-origin-when-cross-origin' };
let currentData;
let refreshInFlight = null;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { ...securityHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}
function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { ...securityHeaders, 'content-type': contentType, 'cache-control': 'no-store, max-age=0', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}
async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  await fs.writeFile(tmp, value, 'utf8');
  await fs.rename(tmp, file);
}
async function writeStatus(status) { await atomicWrite(statusPath, JSON.stringify({ appSlug, ...status }, null, 2) + '\n'); }
async function loadData() {
  try { currentData = JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch { currentData = JSON.parse(await fs.readFile(baselinePath, 'utf8')); }
  return currentData;
}
async function readStatus() { try { return JSON.parse(await fs.readFile(statusPath, 'utf8')); } catch { return { appSlug, ok: true, state: 'initial' }; } }
async function refreshReport() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const startedAt = new Date().toISOString();
    await writeStatus({ state: 'running', startedAt });
    try {
      const baseline = currentData || await loadData();
      const sheets = await fetchReportSheets();
      const data = buildReport(baseline, sheets);
      await atomicWrite(dataPath, JSON.stringify(data));
      currentData = data;
      const result = { ok: true, appSlug, message: '飞书数据已更新', refreshedAt: data.meta?.refreshedAt, dataThrough: data.meta?.dataThrough, sourceConfigVersion: sheets.sourceConfigVersion, counts: { pmRows: Math.max(0, sheets.pm.length - 1), productRows: Math.max(0, sheets.products.length - 1), targetRows: Math.max(0, sheets.targets.length - 1), returnRows: Math.max(0, sheets.returns.length - 1), hardwareRows: data.rawCounts?.hardwareRows || 0, testkitRows: data.rawCounts?.testkitRows || 0, unclassifiedRows: data.rawCounts?.unclassifiedRows || 0 }, data };
      await writeStatus({ state: 'success', finishedAt: new Date().toISOString(), refreshedAt: result.refreshedAt, dataThrough: result.dataThrough, counts: result.counts });
      return result;
    } catch (error) {
      await writeStatus({ state: 'error', finishedAt: new Date().toISOString(), message: error instanceof Error ? error.message : '更新失败' });
      throw error;
    } finally { refreshInFlight = null; }
  })();
  return refreshInFlight;
}
function renderPage(data) {
  const html = requirePageTemplate;
  const embedded = JSON.stringify(data).replace(/</g, '\\u003c');
  return html.replace(/const EMBEDDED_DATA=.+?;const REPORT_CACHE_KEY=/, 'const EMBEDDED_DATA=' + embedded + ';const REPORT_CACHE_KEY=');
}
let requirePageTemplate = '';
async function loadTemplate() { if (!requirePageTemplate) requirePageTemplate = await fs.readFile(indexPath, 'utf8'); return requirePageTemplate; }
function requestPath(req) { return new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost')).pathname.replace(/\/+$/, '') || '/'; }
function readBody(req) { return new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on('data', (chunk) => { size += chunk.length; if (size > maxBodyBytes) { reject(Object.assign(new Error('请求体过大'), { statusCode: 413 })); req.destroy(); return; } chunks.push(chunk); }); req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject); }); }
async function handle(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, securityHeaders); return res.end(); }
  const pathname = requestPath(req);
  if (pathname === '/healthz' || pathname === '/api/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
    const config = await loadFeishuConfig();
    const status = await readStatus();
    return sendJson(res, 200, { ok: true, appSlug, platform: 'Tencent Cloud Lighthouse', basePath, port, sourceConfigVersion: config.version, sourceCount: config.sources.length, status: status.state, dataThrough: currentData?.meta?.dataThrough || null, now: new Date().toISOString() });
  }
  if (pathname === '/api/data') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
    return sendJson(res, 200, { ok: true, appSlug, data: currentData || await loadData() });
  }
  if (pathname === '/api/refresh/status') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
    return sendJson(res, 200, await readStatus());
  }
  if (pathname === '/api/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
    try { await readBody(req); return sendJson(res, 200, await refreshReport()); }
    catch (error) { return sendJson(res, Number(error?.statusCode) || 500, { ok: false, appSlug, message: error instanceof Error ? error.message : '更新失败', retainedData: Boolean(currentData) }); }
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (pathname === '/' || pathname === '/index.html' || !pathname.startsWith('/api/')) {
      try { const html = renderPage(currentData || await loadData()); res.writeHead(200, { ...securityHeaders, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache, must-revalidate', 'content-length': Buffer.byteLength(html) }); return req.method === 'HEAD' ? res.end() : res.end(html); }
      catch (error) { return sendText(res, 500, '页面加载失败'); }
    }
  }
  return sendJson(res, 404, { ok: false, message: '页面或接口不存在' });
}
export function createServer() { return http.createServer((req, res) => { handle(req, res).catch((error) => { console.error('[server]', error); if (!res.headersSent) sendJson(res, 500, { ok: false, message: '服务器内部错误' }); else res.destroy(); }); }); }
await loadData();
await loadTemplate();
const server = createServer();
server.listen(port, host, () => console.log('iHealth app ' + appSlug + ' listening on http://' + host + ':' + port));
function shutdown(signal) { console.log(signal + ' received, shutting down...'); server.close(() => process.exit()); setTimeout(() => process.exit(1), 10000).unref(); }
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
