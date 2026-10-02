export default function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    ok: true,
    service: 'iHealth Amazon Q3 report',
    feishuConfigured: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
    refreshPasswordRequired: false,
    now: new Date().toISOString(),
  });
}
