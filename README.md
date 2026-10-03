# iHealth Amazon 2026 Q3 汇报

网页版经营汇报，包含总览、硬件和测试盒两条业务线。生产部署目标为**腾讯云 CloudBase**，不再依赖 Vercel。

## 当前架构

- `index.html`：静态汇报页面及图表交互。
- CloudBase 静态托管：承载 `index.html`。
- `cloudbase-report-api.mjs`：CloudBase 云函数入口，提供 `/api/health` 和 `/api/refresh`。
- `lib/feishu.mjs`：飞书 tenant token 和电子表格范围读取。
- `lib/report-builder.mjs`：按照现有报表口径重算总览、测试盒、硬件、SKU、退货和目标达成率。
- `data/baseline-report.json`：首次打开页面使用的发布快照，也是在线重算时保留页面结构与静态配置的基线。
- `cloudbaserc.json`：腾讯云 CloudBase 声明式部署配置，包含静态托管、云函数和网关路由。

项目不使用后台数据库：点击刷新时，CloudBase 云函数直接读取飞书并返回完整报表，浏览器将最新结果保存到当前浏览器的 `localStorage`。这与此前 Vercel 方案的行为一致；不同浏览器首次访问使用 GitHub 中的发布快照。

## 腾讯云部署

### 1. 安装并登录 CloudBase CLI

需要 Node.js 22 或更高版本，以及腾讯云 CloudBase CLI：

```powershell
npm install -g @cloudbase/cli
tcb login
```

也可以使用腾讯云 API 密钥登录，但推荐在本机完成 CLI 登录，不要把 `SecretKey` 写进 GitHub。

### 2. 设置本地部署变量

复制 `.env.example` 为 `.env`，填写以下变量。`.env` 已被 `.gitignore` 忽略，不会提交到仓库。CloudBase CLI 部署前需要把变量加载到当前 PowerShell 会话：

```powershell
$env:TCB_ENV_ID = '你的CloudBase环境ID'
$env:TCB_REGION = 'ap-guangzhou'
$env:FEISHU_APP_ID = '你的飞书App ID'
$env:FEISHU_APP_SECRET = '你的飞书App Secret'
$env:FEISHU_SPREADSHEET_TOKEN = 'R4Bks0mjWhnjDbtYmwdcffFsnZd'
```

其中 `TCB_ENV_ID` 和 `TCB_REGION` 会被 `cloudbaserc.json` 引用，飞书变量会注入 CloudBase 云函数。可选的表格 ID 和读取范围也可以按 `.env.example` 覆盖。

### 3. 本地检查并部署

```powershell
npm run check
tcb deploy --yes
```

部署命令会按 `cloudbaserc.json` 完成：

1. 上传 CloudBase 静态网站；
2. 部署 `ihealth-amazon-report-api` 云函数；
3. 配置 `/api/refresh`、`/api/health` 网关路由；
4. 输出 CloudBase 网站访问地址。

### 4. 验证

将部署输出的网站地址保存为：

```powershell
$env:REPORT_URL = 'https://你的CloudBase网站地址'
Invoke-RestMethod "$env:REPORT_URL/api/health"
```

健康检查应返回 `platform: "Tencent CloudBase"` 和 `feishuConfigured: true`。打开网站点击“刷新飞书数据”，成功后页面会显示“刷新飞书数据成功”Toast，并在 3 秒后自动重新载入。

## 飞书权限

飞书自建应用至少需要电子表格只读权限 `sheets:spreadsheet:readonly`。应用发布后，还需要在表格分享/协作者设置中添加此应用，使其可以访问以下工作表：

- 所有产品对应表
- 硬件_2026年目标数据
- PM_年月数据
- 退货-汇报用

不要把飞书 App Secret、腾讯云 SecretId 或 SecretKey 提交到 GitHub。

## 接口

- `GET /api/health`：检查 CloudBase 云函数及飞书环境变量是否已注入。
- `POST /api/refresh`：重新读取飞书并返回最新报表数据。

## 本地检查

```powershell
node --check cloudbase-report-api.mjs
node --check lib/feishu.mjs
node --check lib/report-builder.mjs
```

## 发布约定

本地开发完成后，提交并推送到 GitHub：

```powershell
git add .
git commit -m "Update Tencent CloudBase deployment"
git push origin main
```

本地工作区和 GitHub `origin/main` 应保持一致；生产环境由 CloudBase CLI 根据同一份仓库代码部署。
