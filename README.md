# iHealth Amazon 2026 Q3 汇报

网页版经营汇报，包含总览、硬件和测试盒两条业务线。项目可部署到 Vercel，并通过飞书开放平台 API 在线刷新数据。

## 架构

- `index.html`：静态汇报页面及图表交互。
- `api/refresh.js`：Vercel Node.js Function，实时读取飞书数据并返回最新汇报 JSON。
- `lib/feishu.mjs`：飞书 tenant token 和电子表格范围读取。
- `lib/report-builder.mjs`：按照现有报表口径重算总览、测试盒、硬件、SKU、退货和目标达成率。
- `data/baseline-report.json`：首次打开页面时使用的发布快照，也是在线重算时保留页面结构与静态配置的基线。

## 必需的 Vercel 环境变量

| 变量 | 说明 |
|---|---|
| `FEISHU_APP_ID` | 飞书企业自建应用 App ID |
| `FEISHU_APP_SECRET` | 飞书企业自建应用 App Secret |
| `FEISHU_SPREADSHEET_TOKEN` | 电子表格 Token，当前默认值为 `R4Bks0mjWhnjDbtYmwdcffFsnZd`，建议仍显式配置 |

可选变量用于覆盖工作表 ID 或读取范围：

- `FEISHU_PRODUCTS_SHEET_ID`，默认 `0AyhfQ`
- `FEISHU_TARGETS_SHEET_ID`，默认 `5IvgIM`
- `FEISHU_PM_SHEET_ID`，默认 `1rDHzo`
- `FEISHU_RETURNS_SHEET_ID`，默认 `yi4iux`
- `FEISHU_PRODUCTS_RANGE`
- `FEISHU_TARGETS_RANGE`
- `FEISHU_PM_RANGE`
- `FEISHU_RETURNS_RANGE`

## 飞书权限

飞书自建应用至少需要电子表格只读权限 `sheets:spreadsheet:readonly`。应用发布后，还需要让该应用能够访问目标表格；建议在表格分享/协作者设置中添加此应用。不要把 App Secret 或飞书账号密码提交到 GitHub。

## 在线刷新流程

1. 用户点击“刷新飞书数据”。
2. Vercel Function 使用 App ID 和 App Secret 获取 `tenant_access_token`。
3. Function 读取以下工作表：
   - 所有产品对应表
   - 硬件_2026年目标数据
   - PM_年月数据
   - 退货-汇报用
4. 服务端重新计算汇报数据并返回浏览器。
5. 浏览器保存最新数据并立即重新渲染页面。

当前方案不使用后台数据库。在线刷新时，Vercel Function 会直接读取飞书并返回完整报表；刷新结果保存在当前浏览器的 `localStorage`。不同浏览器首次打开使用仓库中的发布快照，点击刷新后即可获取飞书最新数据。页面带缓存版本与完整性校验，旧版或缺少硬件/测试盒数据的缓存不会再被载入。若需要“所有访问者自动共享同一份最新缓存”，可再接入 Vercel KV/Blob。

## 接口检查

部署后访问：

- `/api/health`：检查 Vercel Function 是否运行、必需环境变量是否配置。
- `/api/refresh`：接受网页按钮发起的 POST 请求并在线读取飞书数据。

## 本地检查

```powershell
node --check api/refresh.js
node --check api/health.js
node --check lib/feishu.mjs
node --check lib/report-builder.mjs
```
