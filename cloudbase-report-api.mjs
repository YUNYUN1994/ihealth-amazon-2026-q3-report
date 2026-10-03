import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchReportSheets } from './lib/feishu.mjs';
import { buildReport } from './lib/report-builder.mjs';

const baselineUrl = new URL('./data/baseline-report.json', import.meta.url);

const corsHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function response(statusCode, payload) {
  return { statusCode, headers: corsHeaders, isBase64Encoded: false, body: JSON.stringify(payload) };
}

function normalizeEvent(input) {
  if (typeof input !== 'string') return input || {};
  try { return JSON.parse(input); } catch { return {}; }
}

function methodOf(event) {
  return String(event.httpMethod || event.requestContext?.http?.method || event.requestContext?.httpMethod || event.method || 'GET').toUpperCase();
}

function pathOf(event) {
  const raw = event.path || event.rawPath || event.requestContext?.http?.path || event.requestContext?.path || event.url || '/';
  try { return new URL(raw, 'https://cloudbase.local').pathname.replace(/\/+$/, '') || '/'; }
  catch { return String(raw).split('?')[0].replace(/\/+$/, '') || '/'; }
}

async function refreshReport() {
  const baseline = JSON.parse(await fs.readFile(fileURLToPath(baselineUrl), 'utf8'));
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

export async function main(input = {}, context = {}) {
  const event = normalizeEvent(input);
  const method = methodOf(event);
  const path = pathOf(event);
  if (method === 'OPTIONS') return response(204, {});

  if (path === '/api/health' || path === '/health') {
    if (method !== 'GET') return response(405, { ok: false, message: '仅支持 GET 请求' });
    return response(200, {
      ok: true,
      service: 'iHealth Amazon Q3 report',
      platform: 'Tencent CloudBase',
      feishuConfigured: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
      refreshPasswordRequired: false,
      now: new Date().toISOString(),
    });
  }

  if (path === '/api/refresh' || path === '/refresh') {
    if (method !== 'POST') return response(405, { ok: false, message: '仅支持 POST 请求' });
    try { return response(200, await refreshReport()); }
    catch (error) {
      console.error(error);
      return response(500, { ok: false, message: error instanceof Error ? error.message : '更新失败' });
    }
  }

  return response(404, { ok: false, message: '接口不存在' });
}
