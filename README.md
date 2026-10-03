# iHealth Amazon 2026 Q3 汇报

网页版经营汇报，包含总览、硬件和测试盒两条业务线。生产部署目标为腾讯云轻量应用服务器（Lighthouse），不使用 CloudBase、Vercel 或后台数据库。

## 当前架构

- index.html：静态汇报页面及图表交互。
- server.mjs：Node.js 原生 HTTP 服务，提供网页、/api/health 和 /api/refresh。
- lib/feishu.mjs：读取飞书 tenant token 和电子表格范围。
- lib/report-builder.mjs：按照现有报表口径重算总览、测试盒、硬件、SKU、退货和目标达成率。
- data/baseline-report.json：首次打开页面使用的发布快照。点击刷新时，服务器实时读取飞书并返回最新报表数据，浏览器将结果保存到当前浏览器缓存。
- ecosystem.config.cjs：可选的 PM2 进程配置。
- deploy/：systemd 和 Nginx 配置模板。

项目不使用后台数据库：点击刷新时，轻量服务器直接读取飞书并返回完整报表。刷新成功后前端显示 Toast，3 秒后自动重新载入页面。

## 在腾讯云轻量服务器上部署

以下以 Ubuntu 22.04/24.04 为例。服务器防火墙/安全组需要放行 80 端口；如果暂时不配置 Nginx，也可放行 3000 端口直接测试。

### 1. 连接服务器并安装运行环境

在腾讯云轻量服务器控制台点击“登录”进入 WebShell，或使用 SSH 连接：

    ssh root@你的服务器公网IP

安装 Node.js 22 或更高版本、Git、Nginx：

    apt update
    apt install -y git curl nginx
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
    node -v
    npm -v

### 2. 拉取 GitHub 代码

    mkdir -p /opt
    git clone https://github.com/YUNYUN1994/ihealth-amazon-2026-q3-report.git /opt/ihealth-amazon-2026-q3-report
    cd /opt/ihealth-amazon-2026-q3-report
    npm run check

后续更新代码：

    cd /opt/ihealth-amazon-2026-q3-report
    git pull origin main

### 3. 配置飞书环境变量

不要把 App Secret 提交到 GitHub。创建只保存在服务器上的环境变量文件：

    nano /etc/ihealth-amazon-report.env

填入：

    FEISHU_APP_ID=你的飞书App_ID
    FEISHU_APP_SECRET=你的飞书App_Secret
    FEISHU_SPREADSHEET_TOKEN=R4Bks0mjWhnjDbtYmwdcffFsnZd

保存后执行：

    chmod 600 /etc/ihealth-amazon-report.env

飞书自建应用需要有电子表格只读权限，并且已添加为以下表格协作者：

- 所有产品对应表
- 硬件_2026年目标数据
- PM_年月数据
- 退货-汇报用

### 4. 创建系统服务并启动

    id ihealth >/dev/null 2>&1 || useradd --system --home /opt/ihealth-amazon-2026-q3-report --shell /usr/sbin/nologin ihealth
    chown -R ihealth:ihealth /opt/ihealth-amazon-2026-q3-report
    cp deploy/ihealth-amazon-report.service /etc/systemd/system/ihealth-amazon-report.service
    systemctl daemon-reload
    systemctl enable --now ihealth-amazon-report
    systemctl status ihealth-amazon-report --no-pager

### 5. 配置 Nginx 访问网页

    cp deploy/nginx.conf /etc/nginx/sites-available/ihealth-amazon-report
    ln -sf /etc/nginx/sites-available/ihealth-amazon-report /etc/nginx/sites-enabled/ihealth-amazon-report
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx

然后访问：http://你的服务器公网IP

健康检查：

    curl http://127.0.0.1/api/health

返回中应包含 platform: Tencent Cloud Lighthouse 和 feishuConfigured: true。

### 6. 更新发布

每次 GitHub 有新代码时，在服务器执行：

    cd /opt/ihealth-amazon-2026-q3-report
    git pull origin main
    npm run check
    systemctl restart ihealth-amazon-report

## 本地运行

Node.js 22 推荐使用：

    cd C:\codex\数据计算\ihealth-amazon-2026-q3-report
    Copy-Item .env.example .env
    # 编辑 .env，填入真实飞书 App ID 和 App Secret
    npm run check
    npm start

本地打开 http://localhost:3000。如果只想运行生产模式：

    npm run start:prod

## 接口

- GET /api/health：检查服务器和飞书环境变量是否已配置。
- POST /api/refresh：重新读取飞书并返回最新报表数据。

## 安全说明

- 飞书 App Secret 只放在轻量服务器的 /etc/ihealth-amazon-report.env，不要提交到 GitHub。
- 腾讯云轻量服务器安全组只开放必要端口：80（以及 SSH 管理端口 22）。
- 当前刷新接口不需要额外网页密码，符合现有需求；如需公网长期开放，建议后续增加登录或 VPN 访问控制。
