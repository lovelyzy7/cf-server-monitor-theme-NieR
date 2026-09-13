# CFSM-Theme-Nier

[CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 的第三方主题。

- **风格**：NieR:Automata「Bunker Terminal」终端美学（米白/炭黑、等宽数值、角括号面板、网格覆盖层、整套 NieR 光标），移植自 lunar-base 的 `automata.css`。
- **功能**：移植自 [CFSM-Theme-LuminaPlus](https://github.com/volcano-1025/CFSM-Theme-LuminaPlus) 的数据层与交互（四种卡片、实时推送 + 轮询兜底、详情页负载/延迟图表、流量/资产统计、主题设置、Turnstile 门禁、实时连接超时提示、版本检查）。

设计文档见 [DESIGN.md](DESIGN.md)。

## 当前进度

- ✅ 完整 NieR 设计系统 `src/styles/automata.css`（含整套光标）+ `theme.css`（深色模式 + 监控组件）
- ✅ 数据层 `services/` `hooks/` `utils/` `types/`（从 LuminaPlus 原样移植，465 个测试全过）
- ✅ 外壳：TerminalBar（顶栏 + 导航）、AppShell、Footer、TurnstileGate、RealtimeSessionPrompt、ErrorBoundary
- ✅ 首页：总览 + 大/小/迷你/列表四种卡片 + 延迟/丢包柱状图
- ✅ 详情页：信息面板 + 指标条 + 负载图表 + Ping 图表（延迟 + 丢包色带）
- ✅ 流量页：今日总流量 + 上下行峰值 + 速率明细图
- ✅ 资产页：剩余价值/年化/月均/溢价/到期提醒/汇率
- ✅ 主题设置页：外观/视图/首页开关/线路/费用，保存到本机、登录站长保存到后端、复制配置 JSON、改用后端配置
- ✅ 首页多线路切换（PingLineSwitcher）：卡片上点线路名换行、逐节点换线、恢复默认
- ✅ 打磨：中/英语言切换（顶栏 `EN/中文` 按钮）、焦点/选中/滚动条 NieR 样式、页脚与版本检查的仓库地址统一到 `utils/themeMeta.ts`

## 发布前必改（仓库已确定，首次推送前改好）

- `src/utils/themeMeta.ts` 的 `THEME_REPO_URL`：`https://github.com/lovelyzy7/cf-server-monitor-theme-NieR`
- `src/services/versionCheck.ts` 的 `THEME_RELEASE_INDEX_URL`：`https://raw.githubusercontent.com/lovelyzy7/cf-server-monitor-theme-NieR/dist/index.html`

## 怎么用

### 本地开发

```bash
npm install        # 已配置 .npmrc legacy-peer-deps
npm run dev        # http://localhost:5173
npm run typecheck  # tsc -b
npm run lint       # eslint
npm test           # vitest
npm run build      # 产物只有 index.html + assets/
```

手边没有后端时，用 `http://localhost:5173/?mock=1` 打开内置假数据。

连线上后端：根目录建 `.env` 写 `API_BASE=https://你的后端`，并把 dev 地址
`http://localhost:5173` 加进后端 Workers 的 `CORS_ALLOWED_ORIGINS`。

### 部署：发布到本仓库并应用到 CF-Server-Monitor

#### 原理

第三方主题由 Worker **从 GitHub 反代**，浏览器始终只和你的 Worker 同源通信：

1. 后台填的 URL 必须是 `https://github.com/<owner>/<repo>/tree/<ref>` 格式；
2. Worker 据此抓取 `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/index.html` 与 `.../assets/*`；
3. 所以 **`<ref>`（分支或 commit）根目录下必须有构建好的 `index.html + assets/`**；
4. 旗帜 `/flags/*.svg`、OS 图标 `/os-icons/*` 走 Worker 内置皮肤的静态文件，主题仓库不用带；
5. 缓存：`<ref>` 是分支名（如 `dist`）→ Worker 缓存约 1 小时；是 40 位 commit SHA → 缓存 1 天 + 浏览器 immutable。

后台「应用」时会先校验 URL 格式并抓取 `.../index.html` 确认存在（不存在返回 `invalidThemeUrl`），
**所以必须先发布产物，再填 URL**。

#### 第一步：把主题发布到本仓库

CI 已配好（`.github/workflows/build-theme.yml`）：推 `main` → 自动构建并发布到 **`dist` 分支**；
推 `preview` → 发布到 `dist-preview`。

```bash
cd cf-server-monitor-theme-NieR
git init
git add .
git commit -m "NieR:Automata theme for CF-Server-Monitor"
git branch -M main
git remote add origin https://github.com/lovelyzy7/cf-server-monitor-theme-NieR.git
git push -u origin main
```

推送后到仓库 Actions 页等 `Build theme` 跑完（npm ci → typecheck → lint → test → build → 发布到 dist）。

**手动发布（不用 CI）**：

```bash
npm install && npm run build   # 产出 dist/index.html + dist/assets/
git checkout --orphan dist
git rm -rf .
cp -R dist/. .
git add . && git commit -m "v1.0.0 NieR theme build"
git push origin dist
```

#### 第二步：后台应用

1. 打开 `https://<你的-worker域名>/admin#admin` 登录；
2. 进入 **主题商店（Theme Store）** 标签页；
3. 在 **「自定义主题 URL」** 输入框填（二选一）：

   ```
   # 跟随 dist 分支（更新约 1 小时后生效）
   https://github.com/lovelyzy7/cf-server-monitor-theme-NieR/tree/dist

   # 锁定某次构建的 commit（稳定，永久不变）
   https://github.com/lovelyzy7/cf-server-monitor-theme-NieR/tree/<40位commitSHA>
   ```

4. 先点 **👁 预览** 新窗口验证，再点 **⇄ 应用/切换**。回内置主题点「使用内置主题」。

#### 自定义主题 URL 严格格式

- 必须是 `https://github.com/<owner>/<repo>/tree/<ref>`；第 3 段必须是 `tree`；
  `owner`/`repo`/`ref` 只允许 `[A-Za-z0-9._-]`；不能带 query / hash / 尾随用户名密码。
- ❌ `.../blob/dist`、❌ `.../raw/...`、❌ `.../releases/...`。

#### 注意事项

- 分支地址有约 1 小时缓存：急着看新版就把地址临时换成新 commit 的 40 位 SHA。
- 无需配置 CORS / CSP：主题由 Worker 同源反代，`raw.githubusercontent.com` 与 Turnstile 域名已在后端 CSP 白名单。
- API 走同源：构建 `base: "./"`、`apiBase` meta 留空，前端用 `window.location.origin` 调 `/api/*`。
- 非公开站点：登录态靠 Worker 的 `cfsm_auth` Cookie（同域），无需额外配置。

### 纯静态托管（GitHub Pages，可选）

`npm run build:github-page`（`.env` 配 `API_BASE`），并在每个 Workers 的
`CORS_ALLOWED_ORIGINS` 里加静态站域名。

## 数据来源

| 主题功能 | 后端接口 |
| --- | --- |
| 站点配置、登录态 | `GET /api/config` |
| 节点列表与实时指标 | `GET /api/servers` |
| 实时推送 | `GET /api/ws?subscribe=all` + 通道内 `subscribe` 消息 |
| 详情页历史 / 负载 / 延迟 | `GET /api/history/all` |
| 保存主题配置（登录站长） | `POST /api/theme_options` |

## 致谢

- 风格来源：lunar-base（NieR:Automata Bunker Terminal）
- 功能来源：[CFSM-Theme-LuminaPlus](https://github.com/volcano-1025/CFSM-Theme-LuminaPlus)（codex & shark & shanyang）
- 后端：[CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)
