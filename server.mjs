import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchReportSheets } from './lib/feishu.mjs';
import { buildReport } from './lib/report-builder.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baselinePath = path.join(__dirname, 'data', 'baseline-report.json');
const indexPath = path.join(__dirname, 'index.html');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const maxBodyBytes = 1024 * 1024;

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...securityHeaders,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    ...securityHeaders,
    'content-type': contentType,
    'cache-control': 'no-store, max-age=0',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function allowCors(req, res) {
  const origin = req.headers.origin;
  if (origin) res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function refreshReport() {
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  const sheets = await fetchReportSheets();
  const data = buildReport(baseline, sheets);
  return {
    ok: true,
    message: '飞书数据已更新',
    refreshedAt: data.meta?.refreshedAt,
    dataThrough: data.meta?.dataThrough,
    counts: {
      pmRows: Math.max(0, sheets.pm.length - 1),
      productRows: Math.max(0, sheets.products.length - 1),
      targetRows: Math.max(0, sheets.targets.length - 1),
      returnRows: Math.max(0, sheets.returns.length - 1),
      hardwareRows: data.rawCounts?.hardwareRows || 0,
      testkitRows: data.rawCounts?.testkitRows || 0,
      unclassifiedRows: data.rawCounts?.unclassifiedRows || 0,
    },
    data,
  };
}

async function handleRequest(req, res) {
  allowCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, securityHeaders);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  const pathname = requestUrl.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/api/health' || pathname === '/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
    return sendJson(res, 200, {
      ok: true,
      service: 'iHealth Amazon Q3 report',
      platform: 'Tencent Cloud Lighthouse',
      feishuConfigured: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
      refreshPasswordRequired: false,
      now: new Date().toISOString(),
    });
  }

  if (pathname === '/api/refresh' || pathname === '/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
    try {
      await readRequestBody(req);
      return sendJson(res, 200, await refreshReport());
    } catch (error) {
      console.error('[refresh]', error);
      const statusCode = Number(error?.statusCode) || 500;
      return sendJson(res, statusCode, { ok: false, message: error instanceof Error ? error.message : '更新失败' });
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (pathname === '/' || pathname === '/index.html') {
      try {
        const html = await fs.readFile(indexPath);
        res.writeHead(200, { ...securityHeaders, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache, must-revalidate', 'content-length': html.length });
        if (req.method === 'HEAD') return res.end();
        return res.end(html);
      } catch (error) {
        console.error('[static]', error);
        return sendText(res, 500, '页面加载失败');
      }
    }
  }

  return sendJson(res, 404, { ok: false, message: '页面或接口不存在' });
}

export function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('[server]', error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: '服务器内部错误' });
      else res.destroy();
    });
  });
}

const server = createServer();
server.listen(port, host, () => console.log('iHealth Amazon Q3 report listening on http://' + host + ':' + port));

function shutdown(signal) {
  console.log(signal + ' received, shutting down...');
  server.close((error) => {
    if (error) { console.error(error); process.exitCode = 1; }
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
