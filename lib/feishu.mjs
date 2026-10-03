const FEISHU_API = 'https://open.feishu.cn/open-apis';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`环境变量 ${name} 尚未配置`);
  return value;
}

async function readJson(response, label) {
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(`${label}返回了无法解析的内容（HTTP ${response.status}）`); }
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail = payload.msg || payload.message || `HTTP ${response.status}`;
    throw new Error(`${label}失败：${detail}${payload.code ? `（code ${payload.code}）` : ''}`);
  }
  return payload;
}

export async function getTenantAccessToken() {
  const response = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: required('FEISHU_APP_ID'), app_secret: required('FEISHU_APP_SECRET') }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await readJson(response, '获取飞书 tenant_access_token');
  if (!payload.tenant_access_token) throw new Error('飞书未返回 tenant_access_token');
  return payload.tenant_access_token;
}

async function readRange(token, spreadsheetToken, range, label) {
  const endpoint = `${FEISHU_API}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${encodeURIComponent(range)}`;
  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(25000),
  });
  const payload = await readJson(response, `读取飞书表格“${label}”`);
  const values = payload.data?.valueRange?.values;
  if (!Array.isArray(values) || values.length < 2) throw new Error(`飞书表格“${label}”没有返回有效数据`);
  return values;
}

export async function fetchReportSheets() {
  const spreadsheetToken = process.env.FEISHU_SPREADSHEET_TOKEN || 'R4Bks0mjWhnjDbtYmwdcffFsnZd';
  const ids = {
    products: process.env.FEISHU_PRODUCTS_SHEET_ID || '0AyhfQ',
    targets: process.env.FEISHU_TARGETS_SHEET_ID || '5IvgIM',
    pm: process.env.FEISHU_PM_SHEET_ID || '1rDHzo',
    returns: process.env.FEISHU_RETURNS_SHEET_ID || 'yi4iux',
  };
  const ranges = {
    products: process.env.FEISHU_PRODUCTS_RANGE || `${ids.products}!A1:O1000`,
    targets: process.env.FEISHU_TARGETS_RANGE || `${ids.targets}!A1:AE1500`,
    pm: process.env.FEISHU_PM_RANGE || `${ids.pm}!A1:AM3000`,
    returns: process.env.FEISHU_RETURNS_RANGE || `${ids.returns}!A1:N500`,
  };
  const token = await getTenantAccessToken();
  const [products, targets, pm, returns] = await Promise.all([
    readRange(token, spreadsheetToken, ranges.products, '所有产品对应表'),
    readRange(token, spreadsheetToken, ranges.targets, '硬件_2026年目标数据'),
    readRange(token, spreadsheetToken, ranges.pm, 'PM_年月数据'),
    readRange(token, spreadsheetToken, ranges.returns, '退货-汇报用'),
  ]);
  return { products, targets, pm, returns, spreadsheetToken, fetchedAt: new Date().toISOString() };
}

