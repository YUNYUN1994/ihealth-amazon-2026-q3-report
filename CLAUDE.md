# Claude 项目规则（iHealth Amazon 2026 Q3 Report）

本仓库是生产中的 iHealth 亚马逊 2026 Q3 经营汇报网页。每次进入先读 [`docs/WORK_HANDOFF.md`](docs/WORK_HANDOFF.md)：它记录背景、核验证据、部署与发布流程。交接文档只是线索，不能代替对本地、GitHub、生产的实际核验。上级目录 `C:\codex\数据计算\CLAUDE.md` 的通用约定同样适用。

## 项目与关键文件

- 页面入口：`index.html`（标记、样式、交互、渲染全在此文件，体积大，避免整行输出）。
- 服务：`server.mjs`（Node.js 原生 HTTP，默认 `127.0.0.1:8775`，子路径 `/apps/ihealth-report/`）。
- 计算：`lib/report-builder.mjs`；飞书只读集成：`lib/feishu.mjs`；测试：`tests/`。
- 发布快照：`data/baseline-report.json` 是应用数据，不得手改或随意重新生成。
- 检查：`npm run check`、`npm test`（Node ≥ 22）。本机 PATH 可能没有 git/node，使用 `%LOCALAPPDATA%\Programs\GitForClaude`、`NodeForClaude` 下的版本。
- 正式地址：<https://ihealth-dashboard.duckdns.org/apps/ihealth-report/>。页面资源、API、下载、嵌套路由都必须保持 `/apps/ihealth-report/` 前缀。
- `README.md` 和 `deploy/` 是过时的通用模板，不代表生产实际部署。

## 每次任务开始

- 确认仓库根目录、当前分支、`HEAD`、跟踪远端、`git status`；需要比较 GitHub 时先 `git fetch`。
- 保护用户已有修改和所有未跟踪文件（截图、`.tmp-*`、`.production-*`、`.ppt-build/`、`.codex-finalizer/`、`outputs/` 等）：不 reset、不 clean、不覆盖、不删除。
- 先看相关实现和测试再改行为，只改用户要求的范围。
- 只暂存本任务文件，禁止 `git add .`；不提交截图、临时验证文件、PPT、生产快照、数据、缓存、日志、备份、凭据或环境变量。
- 用户没要求就不提交、不推送、不发布。

## 生产与数据红线

- 改生产前必须先核验正在运行的生产版本（registry、systemd、Nginx、代码文件哈希、数据目录、env 路径、计划任务），再与本地/GitHub 做差异比较。生产目录没有 `.git`，以去掉 CR 后的文件哈希为准；`.deployed-commit` 和 registry 的版本字段可能不准。不得用可能过期的本地版本直接覆盖生产。
- 不读取 WOOT 数据，不读取飞书“引用表-不读取”，不写入飞书原表。
- 未经明确要求，不改飞书数据源、字段映射、计算口径、去重规则、数据截止规则、自动更新计划。
- 不清空、初始化、替换或覆盖生产数据、缓存、数据目录和生产 env；不打印、不记录、不提交任何凭据、私钥、环境变量值。
- 不影响其他应用：不修改或重启其他服务，不重启整机，不开放内部端口，不新建子域名，不部署到 Vercel。
- 刷新（`POST /api/refresh`）会写入生产数据目录；只有确认仅读授权数据源、只更新本应用缓存、不写回飞书，并经用户同意后才能触发。

## 发布

- 严格按 `docs/WORK_HANDOFF.md`“发布流程”执行：私有备份 → 持有 `flock /run/lock/ihealth-apps-deploy.lock` 后再次核验 → 只发布本应用变更文件 → 只在必要时重启本应用 → Nginx 仅在必须时改且先 `nginx -t`。
- 发布前后都要验证子路径页面、嵌套路由刷新、静态资源、API、非空数据、关键指标、浏览器交互、重启后数据持久、计划任务和其他应用状态；HTTP 200 不是充分依据。
- 失败时恢复本次发布前代码，不用旧备份覆盖发布期间产生的新业务数据。

## 汇报与记录

- 分别说明本地、GitHub、生产的状态，写明提交号/文件哈希、测试内容、备份位置、更新计划状态和剩余问题；没实际完成或未验证的不能说已完成。
- 每次实质性任务结束后更新 `docs/WORK_HANDOFF.md`：写日期、证据来源、未完成项；会变化的事实标注“操作前需重新核验”；不写秘密。
