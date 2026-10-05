const FEISHU_API = 'https://open.feishu.cn/open-apis';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('环境变量 ' + name + ' 尚未配置');
  return value;
}
function clean(value) { return String(value ?? '').trim(); }
function normalizeHeader(value) { return clean(value).replace(/[\s（）()_\-&]/g, '').toLowerCase(); }
async function readJson(response, label) {
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(label + '返回了无法解析的内容（HTTP ' + response.status + '）'); }
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail = payload.msg || payload.message || ('HTTP ' + response.status);
    throw new Error(label + '失败：' + detail + (payload.code ? '（code ' + payload.code + '）' : ''));
  }
  return payload;
}
async function getTenantAccessToken() {
  const response = await fetch(FEISHU_API + '/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: required('FEISHU_APP_ID'), app_secret: required('FEISHU_APP_SECRET') }),
    signal: AbortSignal.timeout(Number(process.env.FEISHU_TIMEOUT_MS || 30000)),
  });
  const payload = await readJson(response, '获取飞书 tenant_access_token');
  if (!payload.tenant_access_token) throw new Error('飞书未返回 tenant_access_token');
  return payload.tenant_access_token;
}
async function readSourcesConfig() {
  const file = required('FEISHU_SOURCES_FILE');
  let config;
  try { config = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8')); }
  catch (error) { throw new Error('读取 FEISHU_SOURCES_FILE 失败：' + error.message); }
  if (!config || config.version !== 1 || !Array.isArray(config.sources) || !config.sources.length) throw new Error('FEISHU_SOURCES_FILE 格式无效：缺少 version 或 sources');
  const appSlug = required('APP_SLUG');
  if (config.appSlug !== appSlug) throw new Error('数据源配置 appSlug 不匹配：期望 ' + appSlug + '，实际 ' + (config.appSlug || '空'));
  const denied = new Set((config.denyList || []).map((item) => clean(item.title)));
  const seen = new Set();
  for (const source of config.sources) {
    if (!source.sourceKey || !source.spreadsheetToken || /^replace_/i.test(source.spreadsheetToken)) throw new Error('FEISHU_SOURCES_FILE 含有无效 spreadsheetToken');
    if (!Array.isArray(source.sheets) || !source.sheets.length) throw new Error('数据源 ' + source.sourceKey + ' 未配置工作表');
    for (const sheet of source.sheets) {
      if (!sheet.sourceKey || !sheet.sheetId || !sheet.expectedTitle || /^replace_/i.test(sheet.sheetId) || /^精确的/.test(sheet.expectedTitle)) throw new Error('数据源 ' + source.sourceKey + ' 含有无效工作表配置');
      if (denied.has(sheet.expectedTitle)) throw new Error('工作表“' + sheet.expectedTitle + '”在 denyList 中，禁止读取');
      if (seen.has(sheet.sourceKey)) throw new Error('工作表 sourceKey 重复：' + sheet.sourceKey);
      seen.add(sheet.sourceKey);
    }
  }
  return config;
}
async function querySheets(token, spreadsheetToken) {
  const endpoint = FEISHU_API + '/sheets/v3/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/sheets/query?page_size=100';
  const response = await fetch(endpoint, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(Number(process.env.FEISHU_TIMEOUT_MS || 30000)) });
  const payload = await readJson(response, '读取飞书工作表元数据');
  return payload.data?.sheets || [];
}
async function readRange(token, spreadsheetToken, sheet, label) {
  const range = sheet.range || (sheet.sheetId + '!A1:ZZ5000');
  const endpoint = FEISHU_API + '/sheets/v2/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/values/' + encodeURIComponent(range);
  const response = await fetch(endpoint, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(Number(process.env.FEISHU_TIMEOUT_MS || 30000)) });
  const payload = await readJson(response, '读取飞书表格“' + label + '”');
  const values = payload.data?.valueRange?.values;
  if (!Array.isArray(values) || values.length < Number(sheet.minRows || 2)) throw new Error('飞书表格“' + label + '”数据为空或行数不足');
  const width = Math.max(...values.map((row) => Array.isArray(row) ? row.length : 0), 0);
  if (width < Number(sheet.minCols || 2)) throw new Error('飞书表格“' + label + '”列数不足');
  const requiredHeaders = sheet.requiredHeaders || [];
  if (requiredHeaders.length) {
    const headerSet = new Set((values[0] || []).map(normalizeHeader));
    const missing = requiredHeaders.filter((item) => Array.isArray(item) ? !item.some((alias) => headerSet.has(normalizeHeader(alias))) : !headerSet.has(normalizeHeader(item)));
    if (missing.length) throw new Error('飞书表格“' + label + '”缺少必需字段：' + missing.map((item) => Array.isArray(item) ? item.join('/') : item).join('、'));
  }
  return values;
}
export async function loadFeishuConfig() { return readSourcesConfig(); }
export async function fetchReportSheets() {
  const config = await readSourcesConfig();
  const token = await getTenantAccessToken();
  const output = { products: null, targets: null, pm: null, returns: null, market: null, fetchedAt: new Date().toISOString(), sourceConfigVersion: config.version };
  for (const source of config.sources) {
    const metadata = await querySheets(token, source.spreadsheetToken);
    for (const sheet of source.sheets) {
      const actual = metadata.find((item) => clean(item.sheet_id || item.sheetId) === clean(sheet.sheetId));
      if (!actual) throw new Error('飞书工作表不存在：' + sheet.expectedTitle + '（sheetId ' + sheet.sheetId + '）');
      const actualTitle = clean(actual.title);
      if (actualTitle !== clean(sheet.expectedTitle)) throw new Error('飞书工作表名称不匹配：sheetId ' + sheet.sheetId + ' 期望“' + sheet.expectedTitle + '”，实际“' + actualTitle + '”');
      const values = await readRange(token, source.spreadsheetToken, sheet, sheet.expectedTitle);
      if (!(sheet.sourceKey in output)) throw new Error('不支持的报表数据源 sourceKey：' + sheet.sourceKey);
      output[sheet.sourceKey] = values;
    }
  }
  for (const key of ['products', 'targets', 'pm', 'returns', 'market']) if (!Array.isArray(output[key])) throw new Error('FEISHU_SOURCES_FILE 未配置必需数据源：' + key);
  return output;
}
