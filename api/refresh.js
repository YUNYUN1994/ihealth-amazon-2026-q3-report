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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { ok: false, message: '仅支持 POST 请求' });
  }
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
