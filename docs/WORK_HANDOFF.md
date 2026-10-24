# iHealth Amazon Report：工作交接

本文件记录项目背景、核验证据、部署与发布流程，供 Codex/Claude 等编码代理接手。它是起点，不是当前状态的证明：每次操作前都要重新核验本地、GitHub 和腾讯云生产。

## 0. 证据来源标记

本文每条事实尽量标注来源：

| 标记 | 含义 | 日期 |
| --- | --- | --- |
| **[本轮核验]** | Claude 在 2026-10-24 会话中直接检查得到（本地 Git/文件、只读 SSH、服务器侧 curl） | 2026-10-24，约 19:50–20:20 CST |
| **[Codex 交接]** | 本文件初版由 Codex 写入的内容 | 文件写入于 2026-10-24 19:47 本地时间；其中观察的具体时间未知 |
| **[用户说明]** | 用户在 2026-10-24 对话中粘贴的接手说明和历史需求清单 | 2026-10-24 粘贴；需求本身提出日期未知 |
| **[此前报告，未复核]** | 来自此前报告，本轮没有独立复核 | 见具体条目 |

说明：用户第二次粘贴的“核验报告”（本地/GitHub `04e2f0c`、生产约 `393fbde` 等）就是 Claude 同一会话第一轮的输出。第二轮（约 20:10–20:20）已重新只读连接生产复核，结果一致，因此下面标为 [本轮核验]。

> ⚠️ 标有“操作前需重新核验”的内容会随时间变化（HEAD、生产代码版本、服务状态、数据截止日期、备份、计划任务等），不能当成永久事实。

## 1. 项目身份

- 用途：交互式 2026 Q3 亚马逊美国经营汇报网页，包含总览、市场大盘、硬件（年度/季度/月度、SKU、目标达成）、测试盒（年度对比、各 SKU、目标达成）等板块。[Codex 交接][本轮核验：`index.html` 中可见对应板块标题]
- 本地仓库：`C:\codex\数据计算\ihealth-amazon-2026-q3-report`
- GitHub：`https://github.com/YUNYUN1994/ihealth-amazon-2026-q3-report.git`，主分支 `main`
- 正式地址：<https://ihealth-dashboard.duckdns.org/apps/ihealth-report/>；应用标识 `APP_SLUG=ihealth-report`
- 旧路径 `/apps/ihealth-q3-report/` 由 Nginx 308/301 重定向到新路径。[本轮核验]

## 2. 目录结构与代码地图（[本轮核验]，按 `git ls-files`）

| 路径 | 说明 |
| --- | --- |
| `index.html` | 全部标记、样式、交互和渲染，约 373 KB，有超长行；服务端会把报表数据注入 `const EMBEDDED_DATA=…` |
| `server.mjs` | Node 原生 HTTP 服务。环境变量：`APP_SLUG`（默认 `ihealth-report`）、`APP_BASE_PATH`、`APP_DATA_DIR`（默认 `./data`）、`HOST`（默认 `127.0.0.1`）、`PORT`（默认 `8775`） |
| `lib/report-builder.mjs` | 报表计算：总览、测试盒、硬件、SKU、退货、目标达成率、市场大盘 |
| `lib/feishu.mjs` | 飞书读取：用 `FEISHU_SOURCES_FILE` 配置数据源；只 POST 获取 tenant token，表格只用 GET 读取（v3 sheets/query、v2 values）；未见写表调用 |
| `data/baseline-report.json` | 发布快照，是应用数据，不得手改 |
| `tests/report-builder.test.mjs` | Node 自动测试 |
| `deploy/`、`README.md`、`ecosystem.config.cjs` | ⚠️ 过时的通用模板（见 §8） |
| `.env.example` | 只有变量名，没有真实值 |

**服务端接口**（[本轮核验] 读 `server.mjs`）：
- `GET /healthz`、`GET /api/health`：健康状态、数据截止、数据源数量
- `GET /api/data`：当前报表数据
- `GET /api/refresh/status`：读取 `refresh-status.json`
- `POST /api/refresh`：实时读飞书 → 重算 → 原子写入 `APP_DATA_DIR/current-report.json` 和 `refresh-status.json`
- 其他非 `/api/` 的 GET/HEAD 都返回渲染后的页面，所以 `/hardware` 等嵌套路由刷新可用

**数据加载顺序**：服务端优先读 `APP_DATA_DIR/current-report.json`，不存在时用 `data/baseline-report.json`。浏览器端还有 `localStorage` 缓存（键 `ihealth-q3-report-cache-v2`），刷新成功后写入，缓存无效时自动清除。

## 3. 本地运行、检查与测试（[本轮核验]）

- 本机 PATH 里没有 git 和 node。可用版本：
  - `%LOCALAPPDATA%\Programs\GitForClaude\cmd\git.exe`（`core.autocrlf=true`，工作区是 CRLF）
  - `%LOCALAPPDATA%\Programs\NodeForClaude\node-v24.22.0-win-x64\`
  - gh 在 `%LOCALAPPDATA%\Programs\GitHubCLI\bin\`；ssh 用系统 OpenSSH
- `npm run check`：对三个 `.mjs` 做语法检查。2026-10-24 通过。
- `npm test`：2026-10-24 共 11 项，全部通过。
- `npm start`：读取 `.env`（本地当前没有该文件），监听 `127.0.0.1:8775`，访问 `http://127.0.0.1:8775/apps/ihealth-report/` 或根路径。没有飞书配置时，`/api/health` 和 refresh 会报错，页面仍可用 baseline 数据显示。
- 本机直接访问正式 HTTPS 地址会超时（2026-10-24）。从服务器侧 curl 正常，判断是本机网络问题。浏览器验证前要先确认本机网络，或改用其他验证手段。

## 4. 生产部署架构（[本轮核验] 2026-10-24 ~20:15 CST；操作前需重新核验）

- 服务器：腾讯云 Lighthouse `43.159.43.55`，SSH 用户 `ubuntu`，端口 22。私钥路径见上级 `C:\codex\数据计算\CLAUDE.md`，不得输出私钥内容。
- 服务器上的应用登记表 `/etc/ihealth-apps/registry.json` 中，本应用条目为：

| 项 | 值 |
| --- | --- |
| appSlug / path | `ihealth-report` / `/apps/ihealth-report/` |
| 端口 | 8775（只监听 127.0.0.1） |
| 代码目录 | `/opt/ihealth-apps/ihealth-q3-report/`（root 所有，没有 `.git`） |
| 数据目录 | `/var/lib/ihealth-apps/ihealth-q3-report/`（`current-report.json`、`refresh-status.json`、`deploy-backups/`） |
| 服务 | `ihealth-ihealth-q3-report.service`，运行用户 `ihealth-ihealth-q3-report`，`ProtectSystem=strict`，只有数据目录可写 |
| Nginx | `/etc/nginx/ihealth-apps.d/ihealth-q3-report.conf`，`proxy_pass http://127.0.0.1:8775/`，并设置 `X-Forwarded-Prefix` |
| env 文件 | `/etc/ihealth-apps/ihealth-q3-report.env`（存在；只确认过变量名，与 `.env.example` 一致，值未读取） |
| 飞书数据源配置 | `/etc/ihealth-apps/ihealth-q3-report.feishu.json`（存在，内容未读取） |
| 更新计划 | registry 中 `schedule: manual-only`；服务器上没有本应用的 systemd timer 或 cron |
| Node | v22.22.1 |

- 同机其他应用：`amazon-dashboard.service`（带 `amazon-dashboard-refresh.timer`，每天 12:00 和 18:00 自动刷新）、`ihealth-review-appeals.service`。2026-10-24 两者都是 active，不得改动。
- 共享部署锁：`/run/lock/ihealth-apps-deploy.lock`。
- 部署方式：生产不是 git 拉取，而是把文件复制到代码目录（依据：没有 `.git`、`.deployed-commit` 标记文件、按时间戳命名的备份目录）。

## 5. GitHub、本地与生产的版本关系（操作前需重新核验）

**[本轮核验] 2026-10-24：**
- 本地 `main` = `origin/main` = GitHub `refs/heads/main` = `04e2f0c64b5ab885a26b3c631acba8486c4c0973`，ahead/behind 为 0/0，没有修改过的已跟踪文件。GitHub 上只有 `main` 一个分支。
- 本地还有 `codex/expand-overview-quarter`、`codex/period-table-transposed`（各有 worktree，在 `C:\codex\数据计算\worktrees\` 下）、`codex/landscape-period-overviews`。三者都落后 main 46～48 个提交、没有领先提交。另有 `codex/pre-publish-backup-20261002`（领先 45、落后 99 个提交，是 10 月初的备份）。这些分支都只在本地。
- **生产实际代码**（去掉 CR 后的 sha256 与 Git 对象比对）：

| 文件 | 生产对应版本 |
| --- | --- |
| `index.html` | `393fbde`（不含 `04e2f0c`） |
| `server.mjs`、`lib/feishu.mjs`、`lib/report-builder.mjs`、`package.json`、`data/baseline-report.json` | 与 `393fbde` 和 `04e2f0c` 都一致（两者间这些文件没变） |
| `tests/report-builder.test.mjs` | 旧版，等于 `34d4f5e` 时的内容（不影响运行） |

  - 结论：生产运行代码 ≈ `393fbde`。`393fbde..04e2f0c` 之间只改了 `index.html` 一行（年度对比表头的高亮列），尚未发布。生产上没有本地缺失的独有运行代码修改。
- **⚠️ 冲突 / 版本标记不一致：**
  - registry 记录 `codeVersion: 393fbde`（updatedAt `2026-10-13T01:25:38Z`），与文件哈希一致。
  - 代码目录的 `.deployed-commit` 内容是 `e443e1a`（文件时间 10/13 08:29），本地仓库所有对象里都没有这个提交，来源不明。以文件哈希为准，不要采信这个标记。
  - 服务启动时间 2026-10-13 09:10:45 CST，此后重启 0 次；生产 `index.html` 的修改时间也是 10/13 09:10。
- 代码目录里有历史残留：`index.html.orig`、`lib/report-builder.mjs.bak-*`（3 个，10/04）。不属于运行代码，没有处理。
- 本地根目录的 `.production-*.mjs/html` 是 10/13 凌晨的生产旧快照。它们与当前文件哈希不同，主要是 CRLF/LF 差异，不能作为当前生产的依据。

**[Codex 交接]**（观察时间未知，已被上面的本轮核验取代）：交接时 HEAD 为 `04e2f0c`，已跟踪文件没有修改，当时没有核验生产。

## 6. 生产运行状态（[本轮核验] 2026-10-24 ~20:15 CST；操作前需重新核验）

- `/api/health`：`ok: true`，`status: success`，`sourceCount: 1`，`dataThrough: 2026年9月`。
- 最近一次刷新：`refreshedAt`/`finishedAt` 都是 `2026-10-13T14:20:35Z`，`state: success`；`current-report.json` 修改于 2026-10-13 22:20 CST。
- 从服务器侧 curl 正式 HTTPS：`/` 200（432651 B）、`/api/health` 200、`/api/data` 200（225876 B）、`/api/refresh/status` 200、`/hardware` 200（嵌套路由）。
- 本轮**没有**做真实浏览器交互、视觉或关键数值核验。
- 备份位置（root 权限、非公网，只列了名称）：
  - `/var/backups/ihealth-apps/ihealth-report/`：最新一批是 `20261013T011045Z`、`20261013T004829Z` 等
  - `/var/backups/ihealth-apps/ihealth-q3-report/`：`20261012-170004` 等
  - `/var/backups/ihealth-apps/ihealth-report-20261004-*` 等更早的备份
  - `/var/lib/ihealth-apps/ihealth-q3-report/deploy-backups/20261004-222624-9007b76`
  - 各目录的具体内容本轮未检查。

## 7. 产品要求与实现状态

用户长期要求来自 [用户说明] 和 [Codex 交接]。“代码可见”表示本轮在本地 `04e2f0c` 源码中找到了对应实现，但**没有做浏览器视觉验证**；“生产”一列按 §5 的结论推断。

### 7.1 在代码中可见实现

| 要求 | 证据 | 是否在生产 |
| --- | --- | --- |
| 年度数据标注为“2025年截止Q3 / 2026年截止Q3”，各板块标题为“2026年截止Q3_…” | `index.html` 表头和标题文本；提交 `666c178` | 是（早于 393fbde） |
| 目标进度行标为“目标_截止2026年Q3 / 实际_截止2026年Q3” | `index.html` 渲染代码 | 是 |
| 测试盒目标：Test 数 4,800,000、总回款 $26,700,000 | `index.html` 中的 `testkitTargetRows` | 是 |
| 硬件与测试盒都有销量、总回款、利润指标；部分表格有回款同比、利润同比、CPA 同比 | 表头文本；提交 `36536e8`、`2827b37`、`0d83a3e` | 是 |
| 同比放在主数值下方（不撑高主行） | 提交 `28dfe66`；视觉效果未复核 | 是 |
| 硬件分类 550BT / PT3 / BG5S100 / 血糖试纸 / 新品 / 其他硬件，“其他硬件”排除前面已命名的类别 | `lib/report-builder.mjs` 中的 `hardwareAnnualCategory`；提交 `fe959fd` | 是 |
| 删除硬件明细里的 PO1 SKU 行 | 提交 `be30ecd` | 是 |
| 年度 SKU/硬件明细表适配桌面宽度 | 提交 `5294581`；1024–1920 宽度下的效果未复核 | 是 |
| 板块备注：每个小板块右上角可编辑、保存，备注显示在板块下方 | `index.html` 的 `#section-notes-script`；提交 `393fbde` | 是 |
| 年度对比表头的三个高亮列更醒目 | 提交 `04e2f0c` | **否**（只在本地和 GitHub） |

### 7.2 需要注意或尚未确认

- **备注只存在当前浏览器里**：保存在浏览器 `localStorage`（键 `ihealth-q3-report-notes-v1`），不上传服务器，不能跨设备或跨用户共享，清除浏览器数据就会丢失。这是否符合用户预期**未确认**。
- **AK 列口径**：用户纠正过“硬件分类按飞书 AK 列映射”。代码按表头名称“分类2 / 做表分类2”定位这一列，找不到时回退到列索引 8，再走 SKU/负责人/新旧品等兜底规则。这一列是否就是飞书 AK 列，取决于生产数据源配置里的读取范围；本轮没有读取该配置，所以**未确认**。不得擅自改动。
- 表格统一黑底白字表头、数据字体缩小、表头相对放大：CSS 有多层覆盖，本轮没有做视觉核验，**状态未确认**。
- 同比用颜色和布局突出、不在每个数字旁重复“同比”二字：**状态未确认**（未做视觉核验）。
- 硬件目标进度只显示整体达成率（不按分类），含销量、总回款、利润：有相关提交 `598478f`，但本轮没有视觉核验，**状态未确认**。
- 测试盒广告费和 CPA：表头中能看到 CPA 相关字段，但完整性**未确认**。
- 在相关对比表中，指标作列、目标/实际期间作行；在常用桌面宽度下尽量不出现横向滚动：**状态未确认**。
- 早先针对截图提出的个别视觉调整（某些列高亮、删除某行等），需要对照当前页面判断哪些仍然适用。

### 7.3 PPT（不属于网页代码）

- 可编辑 PPT：`C:\codex\数据计算\outputs\ihealth-amazon-2026-q3-report-editable-ppt\ihealth-amazon-2026-q3-report-editable-reference-ui-v2.pptx`。本轮确认文件存在，内容未复核。
- 来源说明 [Codex 交接]：可编辑表格，每页一个表，参考 2025 年度报告 PPT 的样式。
- 仓库内的 `.ppt-build/`（构建脚本、截图、校验 JSON）和 `.codex-finalizer/*.pptx` 都是生成产物或工具产物，未跟踪，不提交（除非用户要求）。

## 8. 已知问题与过时文档

1. 生产落后 GitHub 一个提交（`04e2f0c`，只涉及 `index.html`）。是否发布由用户决定。
2. 生产 `.deployed-commit`（`e443e1a`）与 registry 和实际代码都不一致，见 §5。
3. **README 和 `deploy/` 已过时**：它们写的是端口 3000、`/opt/ihealth-amazon-2026-q3-report`、`/etc/ihealth-amazon-report.env`、`FEISHU_SPREADSHEET_TOKEN`、`git pull` 发布、`rm sites-enabled/default` 等。这些都与实际不符，照做会破坏多应用 Nginx 配置。`ecosystem.config.cjs`（PM2，端口 3000）也不是生产所用方式。修改这些文件需要用户要求。
4. 生产上的测试文件是旧版（`34d4f5e`），只影响在服务器上跑测试。
5. 本机 PATH 没有 git/node；本机访问正式 HTTPS 会超时。
6. 在 PowerShell 里执行 `ssh "...含双引号..."` 时，双引号会被剥掉。不加 `-n`、或通过 stdin 喂脚本时出现过挂起。可行做法：`ssh -n`，远端命令用单引号包住，避免嵌套双引号，每条命令加 `timeout`，并拆成短命令执行。
7. 仓库根目录有约 190 个未跟踪文件（截图、`.tmp-*`、`.production-*`、`.ppt-build/`、`.codex-finalizer/`、`outputs/`、只含空 `.ppt-build` 的嵌套目录 `ihealth-amazon-2026-q3-report/`）。保留不动，不提交。
8. 代码中没有显式拦截 WOOT 或“引用表-不读取”，读取范围完全由生产数据源配置决定；改动该配置要用户明确授权。

## 9. 发布流程（每次都要执行）

1. **只读核验**：读 `C:\codex\数据计算\outputs\腾讯云多应用部署规划与提示词.md`；检查 registry、systemd、Nginx、代码文件哈希（去掉 CR 后与 Git 对象比对）、数据目录、env 路径（只看是否存在和变量名）、timer/cron；比较本地、GitHub、生产。生产若有独有修改，先合并回本地。
2. **隔离开发与测试**：在本地分支或 worktree 修改；`npm run check`、`npm test`；本地启动后在浏览器验证子路径和嵌套路由。需要真实数据时只用只读副本；测试环境不启定时任务、不触发 refresh。
3. **备份**：拉起锁之前，把本次要替换的代码文件备份到 `/var/backups/ihealth-apps/ihealth-report/<UTC 时间戳>/`（root、非公网）。不备份或覆盖数据目录。
4. **加锁再核验**：`sudo flock /run/lock/ihealth-apps-deploy.lock <部署脚本>`，持锁后重新比对生产哈希；发现新改动就中止并合并。
5. **只发布必要文件**：通常只有 `index.html` 和/或 `server.mjs`、`lib/*`，保持 root 所有、644 权限。不碰 `/var/lib/...` 数据、env、飞书数据源配置、Nginx。同步更新 registry 的 `codeVersion`/`updatedAt` 和 `.deployed-commit`，要写真实提交号。
6. **重启**：只在必要时 `systemctl restart ihealth-ihealth-q3-report.service`（只改 `index.html` 时也需要重启，因为模板在启动时缓存）。Nginx 只在必须时改，先 `nginx -t` 再 reload。
7. **上线验证**：
   - 子路径首页、`/apps/ihealth-report`（无斜杠）跳转、旧路径重定向、嵌套路由刷新（如 `/hardware`）
   - `/api/health`、`/api/data` 非空，`dataThrough` 正确，`/api/refresh/status`
   - 关键指标与发布前一致，真实浏览器交互（筛选、排序、备注、下载如有）
   - 重启后数据持久（`current-report.json` 仍在，修改时间不变）
   - 计划任务仍是 manual-only
   - `amazon-dashboard`、`review-appeals` 仍是 active
8. **回滚**：从第 3 步的备份恢复本次替换的代码文件，然后重启本应用。不得用旧备份覆盖数据目录或发布期间产生的新业务数据。
9. **记录**：更新本文件：日期、发布的提交、生产文件哈希、备份路径、验证结果、未完成项。

## 10. 刷新（`POST /api/refresh`）注意事项

- 刷新会读飞书并写入 `current-report.json` 和 `refresh-status.json`，属于生产业务写入。
- 只有确认只读取授权数据源、只更新本应用缓存、不写回飞书，并经用户同意后，才能做端到端刷新测试。

## 11. 下一步建议（待用户决定）

1. 是否把 `04e2f0c`（年度对比表头高亮）发布到生产，让三方一致。
2. 是否提交本文件和 `CLAUDE.md` 到 GitHub（目前都是未跟踪文件）。
3. 是否修正过时的 README、`deploy/` 模板，以及生产 `.deployed-commit` 标记。
4. 确认备注只存本地浏览器的行为是否符合预期。
5. 用真实浏览器在 1024/1280/1440/1920 宽度下逐项核验 §7.2 中未确认的视觉要求。

## 12. 更新记录

- 2026-10-24（Codex）：创建初版交接。
- 2026-10-24（Claude）：完成只读接手核验，重写本文件并按来源标注事实；没有修改代码，没有发布、提交或推送。
