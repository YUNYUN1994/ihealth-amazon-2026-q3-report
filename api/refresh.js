import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchReportSheets } from '../lib/feishu.mjs';
import { buildReport } from '../lib/report-builder.mjs';

export const maxDuration = 60;

const baselineUrl = new URL('../data/baseline-report.json', import.meta.url);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { ok: false, message: '仅支持 POST 请求' });
  }
  const expectedPassword = process.env.REPORT_REFRESH_PASSWORD;
  if (!expectedPassword) return send(res, 503, { ok: false, message: 'Vercel 尚未配置 REPORT_REFRESH_PASSWORD' });
  const suppliedPassword = String(req.headers['x-refresh-password'] || '');
  if (!safeEqual(suppliedPassword, expectedPassword)) return send(res, 401, { ok: false, message: '刷新密码不正确' });
  try {
    const baseline = JSON.parse(await fs.readFile(fileURLToPath(baselineUrl), 'utf8'));
    const sheets = await fetchReportSheets();
    const data = buildReport(baseline, sheets);
    return send(res, 200, {
      ok: true,
      message: '飞书数据已更新',
      refreshedAt: data.meta?.refreshedAt,
      dataThrough: data.meta?.dataThrough,
      counts: {
        pmRows: sheets.pm.length - 1,
        productRows: sheets.products.length - 1,
        targetRows: sheets.targets.length - 1,
        returnRows: sheets.returns.length - 1,
      },
      data,
    });
  } catch (error) {
    console.error(error);
    return send(res, 500, { ok: false, message: error instanceof Error ? error.message : '更新失败' });
  }
}
