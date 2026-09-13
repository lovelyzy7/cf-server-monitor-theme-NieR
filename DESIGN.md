# CFSM-Theme-Nier 设计文档

> CF-Server-Monitor 第三方主题
> 风格：完全遵循 `/home/pi_agent_project/lunar-base`（NieR:Automata Bunker Terminal）
> 功能：完全遵循 `/home/pi_agent_project/CFSM-Theme-LuminaPlus`
> 主题代号：**YoRHa**（页脚署名 `Nier`）

---

## 0. 目标与原则

1. **功能 1:1 复刻 LuminaPlus**：数据层、路由、交互、后台契约全部沿用，不删功能、不改行为语义。
2. **视觉 1:1 复刻 lunar-base**：配色、字体、边框、角标、光标、排版全部取自 lunar-base 的 `automata.css`。
3. **分离清晰**：`services/` `hooks/` `utils/` `types/` 只做「名字去 Lumina 化」，逻辑不动；
   `styles/` 与所有组件的 `className` 全部换成 NieR 语义类。
4. **遵守主题契约**（`theme-develop.md`）：产物仅 `index.html + assets/`；旗帜走 `/flags/`、
   OS 图标走 `/os-icons/`；管理入口跳 `/admin#admin`；页脚 `Powered by CF-Server-Monitor`；
   hash 路由 `/#/` 与 `/#/server/:id`。

---

## 1. 两个参考源的关键结论

### 1.1 lunar-base —— 风格来源

核心文件 `web/static/css/automata.css` + `web/templates/base.html` + `web/static/js/i18n.js`。

**设计语言（Bunker Terminal）**：

| 元素 | 取值 |
| --- | --- |
| 背景 | 米白 `#cfc7b0`，body 叠加 4px 网格线（`rgba(0,0,0,0.03)`） |
| 面板 | `#d8d1bb`，2px 实线 `#1a1814` 边框，四角有「角括号」装饰 |
| 反色面板 | 炭黑底 `#2c2922` / 米白字 `#d8d1bb` |
| 主文字 | `#2c2922`；次级 `#57523f` |
| 强调色 | `#1a1814`（炭黑，用于顶栏/按钮/边框） |
| 危险 | `#6b0a0a` / hover `#8a1414` |
| 成功 | 鼠尾草绿 `#3a4d24` |
| UI 字体 | `"Segoe UI", "Tahoma", "Verdana", sans-serif` |
| 数据/代码字体 | `"Consolas", "Courier New", monospace` |
| 顶栏 | 炭黑底、米白字、`letter-spacing: .25em`、大写、左右两栏 |
| 标题 | `[ 标题 ]` + 右侧延伸一条底线（`.bracket-header::before/::after`） |
| 按钮 | 炭黑实底 + 米白字、大写、`letter-spacing: .2em`、hover 反转描边 |
| 状态胶囊 | `ONLINE`（绿）/ `WARN`（红）/ `OFFLINE`（灰），10px 大写 |
| 表格 | 表头大写、11px、灰底；行 hover 变 `#b8b099`；等宽字体 |
| 光标 | **整套 NieR 光标**（12 个 data-URI PNG，白底描边，见 automata.css `--cur-*`） |
| 页脚 | `End of transmission // Glory to mankind`，顶部 4px 双线 |
| 语言 | 中/英切换，localStorage `lb_lang`，`data-i18n` 属性驱动 |

### 1.2 LuminaPlus —— 功能来源

React 19 + TS + Vite + Tailwind4 + react-query + zod + uPlot + react-router（hash）。

**功能清单（必须全部保留）**：

- 路由：`/`（首页）、`/server/:id`（详情）、`/assets`（资产）、`/traffic`（流量）、
  `/?view=theme-manage`（主题设置）、`/404`；兼容 `#/instance/:id` 旧链接跳转。
- 首页：大卡 / 小卡 / 迷你 / 列表四种视图；总览（在线/离线/总带宽）；分组 Tab；地区统计条；
  卡片组；**首页延迟柱状图**（多线路，逐节点换线，整轮超时红格）；手动刷新延迟（并发 4，
  30 分钟提醒）；费用摘要与浮动入口。
- 详情页：实例信息（内核版本替代虚拟化）；负载图（CPU/内存/Swap/磁盘/网络/连接数/负载）；
  Ping 图（延迟 + 丢包色带，前四条线路）；时间范围档位（访客 ≤24h，登录 ≤168h）；
  详情页只订阅单台。
- 流量页：今日总流量 + 上下行峰值（历史采样积分）；桌面表格 / 移动卡片；速率明细图。
- 资产页：剩余价值 / 年化 / 月均 / 溢价 / 汇率；到期提醒；忽略节点；溢价录入（收购价/日期）。
- 主题设置：外观、视图模式、线路绑定、多线路开关、分组排序、费用摘要开关、隐藏/忽略节点、
  溢价、汇率源、卡片不透明度；**保存到本机** / 登录站长**保存到后端**（`POST /api/theme_options`）/
  **复制配置 JSON** / **改用后端配置**。
- 悬浮控制：外观切换、视图切换、配色、主题设置、后台登录、延迟刷新（含状态提示）。
- Turnstile 门禁、私有站点门禁、实时连接超时提示（`frontend_ws_timeout_minutes`）。
- WebSocket 实时 + 5s 轮询兜底 + 30s 后台隐藏断开 + 60s 全量对齐 + 匀速回放 + 在线重算。
- 页脚：`Powered by CF-Server-Monitor` + 主题署名 + 版本号悬停提示 + 登录站长「新版」标签。

---

## 2. 技术选型

**直接 fork LuminaPlus**（同一架构，最省事且行为 100% 一致），做两件事：

1. 删掉视觉层：`tailwindcss`、`tokens.css`、`surface.css`、`home.css`、`node-card.css`、
   `compact-node-card.css`、`mini-node-card.css`、`node-list.css`、`cost-summary.css`、
   `traffic-stats.css`、`numeric.css`、`os-logo.css`、`site-footer.css`、`lucide-react` 图标。
2. 换成 NieR 视觉层：`src/styles/automata.css`（从 lunar-base 移植）+ 组件 `className` 改写为
   NieR 语义类；图标用 CSS 绘制 / 纯字符（`[ ]`、`>`、`▲▼`、`+`），不引入图标库。

保留不变：`react` / `react-dom` / `react-router-dom` / `@tanstack/react-query` / `zod` /
`uplot` / `uplot-react` / `vite` / `vitest` / `typescript`。

---

## 3. NieR 设计系统（`automata.css`）

### 3.1 CSS 变量（明暗两套）

```css
:root, :root[data-appearance="light"] {
  /* 画布与表面 */
  --bg-0: #cfc7b0;            /* 米白画布（lunar-base --bg-cream） */
  --surface: #d8d1bb;         /* 面板（--panel） */
  --surface-elev: #d8d1bb;
  --surface-sunken: #b8b099;  /* 沉底/表头底（--bg-cream-dark） */
  --bg-scrim: transparent;

  /* 文字 */
  --text-primary: #2c2922;    /* --fg-dark */
  --text-secondary: #57523f;  /* --fg-mid */
  --text-tertiary: #57523f;
  --text-on-strong: #d8d1bb;  /* 炭黑底上的米白字 */

  /* 边框与线 */
  --border: rgba(26,24,20,.55);
  --border-subtle: rgba(26,24,20,.35);
  --border-strong: #1a1814;
  --hairline: rgba(26,24,20,.35);
  --accent-500: #1a1814;      /* 品牌 = 炭黑 */
  --accent-strong: #2c2922;
  --fill-secondary: rgba(26,24,20,.10);
  --fill-tertiary: rgba(26,24,20,.05);
  --hover-bg: #b8b099;
  --ring: rgba(26,24,20,.35);

  /* 状态 */
  --status-success: #3a4d24;  /* 鼠尾草绿 */
  --status-warning: #a1762b;  /* 琥珀（新增，NieR 无，保留告警语义） */
  --status-error: #6b0a0a;    /* 深红 */
  --status-info: #57523f;
  --status-online: #3a4d24;
  --status-offline: #6b0a0a;

  /* 指标进度（CPU/内存/Swap/磁盘/网络/负载）—— 保持可分辨的哑光色 */
  --progress-bg: #b8b099;
  --progress-cpu: #8a5a2b;
  --progress-memory: #6b4c2a;
  --progress-swap: #4f4a35;
  --progress-disk: #8a1414;
  --progress-network: #3a4d24;
  --progress-load: #57523f;

  /* 延迟阶梯（绿→黄→红，哑光） */
  --latency-excellent: #3a4d24;
  --latency-good: #7a7a35;
  --latency-moderate: #a1762b;
  --latency-elevated: #8a5a2b;
  --latency-critical: #6b0a0a;

  /* 速率四档 */
  --speed-idle: #3a4d24; --speed-low: #a1762b; --speed-high: #8a5a2b; --speed-max: #6b0a0a;
  --traffic-up: #2c2922; --traffic-down: #57523f;

  /* 标签 pill */
  --tag-red-bg: #d8c9c9; --tag-red-fg: #6b0a0a;
  --tag-gray-bg: #b8b099; --tag-gray-fg: #2c2922;
  --canvas-glow: none;
}

:root[data-appearance="dark"] {
  /* 深色 = lunar-base 的「反色面板」世界：炭黑底 + 米白字 */
  --bg-0: #211f1a;
  --surface: #2c2922;
  --surface-elev: #2c2922;
  --surface-sunken: #1a1814;
  --text-primary: #d8d1bb;
  --text-secondary: #b8b099;
  --text-tertiary: #8f8871;
  --text-on-strong: #1a1814;
  --border: rgba(216,209,187,.4);
  --border-subtle: rgba(216,209,187,.25);
  --border-strong: #d8d1bb;
  --hairline: rgba(216,209,187,.25);
  --accent-500: #d8d1bb;      /* 深色下强调色反转为米白（顶栏仍用炭黑+米白字） */
  --accent-strong: #cfc7b0;
  --fill-secondary: rgba(216,209,187,.14);
  --fill-tertiary: rgba(216,209,187,.06);
  --hover-bg: #3a362c;
  --ring: rgba(216,209,187,.35);

  --status-success: #7a9a5b;
  --status-warning: #c9a24a;
  --status-error: #c96a5a;
  --status-info: #b8b099;
  --status-online: #7a9a5b;
  --status-offline: #c96a5a;

  --progress-bg: #3a362c;
  --progress-cpu: #c99a6b;
  --progress-memory: #b08a6b;
  --progress-swap: #9a9178;
  --progress-disk: #c96a5a;
  --progress-network: #7a9a5b;
  --progress-load: #b8b099;

  --latency-excellent: #7a9a5b;
  --latency-good: #b8b05a;
  --latency-moderate: #c9a24a;
  --latency-elevated: #c98a4a;
  --latency-critical: #c96a5a;

  --speed-idle: #7a9a5b; --speed-low: #c9a24a; --speed-high: #c98a4a; --speed-max: #c96a5a;
  --traffic-up: #d8d1bb; --traffic-down: #b8b099;

  --tag-red-bg: #4a3330; --tag-red-fg: #e0b0a8;
  --tag-gray-bg: #3a362c; --tag-gray-fg: #d8d1bb;
  --canvas-glow: none;
}
```

### 3.2 字体

```css
--font-sans: "Segoe UI", Tahoma, Verdana, "PingFang SC", "Microsoft YaHei", sans-serif;
--font-mono: "Consolas", "Courier New", ui-monospace, monospace;
```
- UI 文案用 `--font-sans`；**所有数值/标签/单位一律 `--font-mono` + `tabular-nums`**（NieR 的关键质感）。

### 3.3 标志性组件（从 lunar-base 移植）

| 类 | 用途 |
| --- | --- |
| `.terminal-bar` | 顶部状态栏：炭黑底、米白字、`.25em` 字距、大写；左「YoRHa · Bunker Terminal · 站点标题」右「在线数 / 语言切换 / 后台」 |
| `nav.primary` | 主导航：炭黑底；大写字距链接；hover/active 反转 |
| `.bracket-header` | `[ 标题 ]` 尾部延伸底线 |
| `.panel` / `.panel.inverse` / `.panel-corners` | 面板 + 角括号装饰 |
| `.kv` | `dt(标签 200px, 大写 11px) + dd(值, 等宽)` 键值网格 |
| `.status-pill`（`.online/.warn/.offline`） | 状态胶囊 |
| `.banner`（`.success/.error`） | `> 提示` / `> ERROR ::` |
| `table` 系列 | 大写表头 + 等宽 + hover 行 |
| `.button` / `button.danger` | 炭黑实底按钮、大写、hover 反转描边 |
| `.tab-bar > .tab-btn` | 分段/页签 |
| `.app-modal-overlay/.app-modal-box` | 页内确认弹窗 |
| `.back-to-top` | 回顶按钮（CSS 三角箭头） |
| `body::before` | 4px 网格覆盖层 |
| `--cur-*` | **整套 NieR 光标**（原样复制 data-URI，含 `--cur-default/pointer/text/wait/progress/cross/move/na/ew/ns/nesw/nwse/help`） |
| `footer` | `End of transmission // Glory to mankind` |

### 3.4 指标条 / 延迟柱 / 图表

- **进度条**：直角（无圆角）、2px 边框、`--progress-bg` 底、`--progress-*` 填充；
  数值用等宽字体，右侧对齐。
- **延迟柱**：直角方柱；柱色按 `--latency-*` 阶梯；整轮超时柱涂红；节点掉线后柱转红；
  悬浮显示时间段与数值；移动端点按出气泡。
- **uPlot 图表**：主题色收敛为炭黑/米白；轴线、刻度用 `--font-mono`；网格线用 `--hairline`；
  曲线用 `--progress-*` / `--latency-*`；丢包带用 `--status-error` 半透明。
- **流量热力条**：用离散哑光阶梯替代 LuminaPlus 的 oklch 渐变（绿→琥珀→橙→红）。

---

## 4. 功能 → 视觉映射

### 4.1 布局骨架（原 `AppShell.tsx`）

```
┌────────────────────────────────────────────┐
│ .terminal-bar   YoRHa · Bunker Terminal · {站点标题} │ 在线数 · 语言 · 后台 │
├────────────────────────────────────────────┤
│ (首页) nav.primary：状态 / 资产 / 流量 / 主题设置   │
├────────────────────────────────────────────┤
│ main:  [ 系统状态 ]  bracket-header           │
│   .panel.panel-corners ×N（节点卡片）          │
│   ...                                       │
├────────────────────────────────────────────┤
│ footer: End of transmission // Glory to mankind │
│         Powered by CF-Server-Monitor · Theme by Nier │
└────────────────────────────────────────────┘
```

- `BackgroundLayer`：`--surface-alpha` 驱动卡片不透明度（逻辑保留），背景图仍由后台注入。
- `TurnstileGate`：改为 `.panel.panel-corners` + `[ 身份验证 ]` 标题 + Turnstile 组件。
- `PrivateSiteGate`：`.panel.inverse` + `[ 访问受限 ]` + `前往登录` 按钮（跳 `/admin#admin`）。
- `RealtimeSessionPrompt`：底部 `.banner` + `.app-modal` 询问是否继续连接。

### 4.2 首页（原 `Home.tsx` + `NodeGrid` + 四类卡片 + 总览 + 分组 + 延迟条）

| LuminaPlus 组件 | NieR 呈现 |
| --- | --- |
| `NodeGrid` 容器 | `main` 内 `.bracket-header [ 服务器节点 ]` + 卡片网格 |
| 总览（在线/离线/总带宽） | `.panel.inverse.panel-corners` 内 `.kv` 三组：`ONLINE`/`OFFLINE`/`THROUGHPUT`，等宽数值 |
| 分组 Tab / 地区条 | `nav` 风格 `.tab-bar > .tab-btn`；地区条用 `.status-pill` 聚合 |
| 大卡 `NodeCard` | `.panel.panel-corners`；`.bracket-header`=节点名 + 状态胶囊；`.kv` 行展示 CPU/RAM/Swap/Disk/网络/负载/连接数；底部延迟柱 |
| 小卡 `CompactNodeCard` | `.panel`（无角标）紧凑 `.kv`；右侧分段流量条 |
| 迷你 `MiniNodeCard` | `.panel` 最小化：名称 + 状态 + CPU/RAM/网络三行 |
| 列表 `NodeListView` | NieR 表格：大写表头，逐节点一行，内联迷你进度条 |
| 延迟条 `LatencyBars`/`PingLineSwitcher` | 直角柱；线路名按钮（hover 反转）；逐节点换线菜单走 `.app-modal` |
| 手动刷新（`FloatingControls` 刷新钮） | 顶栏右侧按钮 `REFRESH`，完成态转绿、提醒态转琥珀（逻辑与 30 分钟阈值照旧） |

### 4.3 详情页（原 `Instance.tsx` + `InstanceDetails` + `LoadChart` + `PingChart`）

- 顶部 `.bracket-header [ 节点名 ]` + `.status-pill`；返回链接 `← 返回`。
- 实例信息 = `.panel` + `.kv`（CPU 型号/核心/架构/OS/内核版本/GPU/内存/磁盘/在线时长/上报间隔/Agent 版本/IPv4·IPv6 可达性/到期/价格）。
- 负载/Ping 切换 = `.tab-bar`；时间档位 = `.tab-bar .tab-btn`（分段）。
- 图表区 = `.panel`，uPlot 重样式；Ping 图例用线路名（`custom_*_name`/`node_N_name`）+ 等宽。
- 详情页只订阅单台（`useRealtimeFocus` 逻辑照旧）。

### 4.4 流量页 / 资产页（原 `Traffic.tsx` / `Assets.tsx`）

- 汇总卡 = `.panel.inverse.panel-corners` + `.kv` 大数值（等宽，货币分 `¥`/整数/小数三级）。
- 明细 = NieR 表格（大写表头、等宽、hover 行、可排序表头带 `▲▼`）。
- 移动端 = 卡片列表 `.panel` 堆叠。
- 汇率/溢价录入 = `.kv` + `input[type=number]`（等宽，右侧对齐）+ `.tab-bar`。

### 4.5 主题设置页（原 `ThemeManage.tsx`）

- 整页 `.panel` 分区，`.bracket-header` 作分节标题；开关行用 `.row-checkbox`；线路绑定、
  分组排序、溢价录入复用 `.kv`/表格/`.tab-bar`。
- 顶部操作条：`重置` / `保存到本机` / `保存到后端`(登录站长) / `复制配置 JSON` / `改用后端配置`
  —— 全部 `.button`（`保存到后端` 用 `button.danger` 视觉上不是危险操作，改用 `.button` 主色）。

### 4.6 悬浮控制（原 `FloatingControls.tsx`）

- 改为顶栏 `.terminal-bar .right` 里的按钮组：`[外观]`(明/系统/暗) `[视图]`(大/小/迷你/列表)
  `[配色]` `[设置]` `[后台]` `[刷新]`；用 `.lang-toggle` 同款胶囊按钮。
- 配色选择器 `MetricColorPicker` 改为 `.panel` 弹层，保留全部数据色可调。

### 4.7 页脚（原 `SiteFooter.tsx`）

```
End of transmission // Glory to mankind
Powered by CF-Server-Monitor v2.7.12 · Theme by Nier v1.0.0   [新版 vX 标签]
```
- 版本悬停提示保留（`title` 或自绘气泡）；登录站长显示后端/主题「新版」标签（逻辑照旧）。

---

## 5. 数据层（原样复用，仅改名）

| 文件 | 内容 | 改动 |
| --- | --- | --- |
| `services/cfsm/config.ts` | apiBase meta / JWT / Turnstile 凭证 | 无（`localStorage` 键不变） |
| `services/cfsm/http.ts` | fetch 封装、错误体、多后端并发、`saveThemeOptions` | 无 |
| `services/cfsm/wsClient.ts` | `/api/ws` 订阅、重连、1008 降级 | 无 |
| `services/cfsm/mappers.ts` | Server/历史行 → NodeInfo/NodeMetrics/线路表/单位换算 | 无 |
| `services/api.ts` | 查询函数、历史缓存、回灌、今日流量积分 | 无 |
| `services/wsStore.ts` | 状态 store + WS 回放 + 轮询兜底 + 可见性暂停 + 会话超时 | 无 |
| `services/pingLiveStore.ts` | 首页延迟条数据源（窗口 + 实测缓冲） | 无 |
| `services/themeSettingsStore.ts` / `queryClient.ts` / `versionCheck.ts` | 设置/查询/版本 | 无 |
| `types/cfsm.ts` | zod schema + 展示模型 + 线路表 | 无 |

> 结论：数据层**零逻辑改动**。这是「功能按 LuminaPlus」最可靠的保证。

---

## 6. 项目结构

```
cf-server-monitor-theme-nier/
├── index.html                     # meta apiBase / theme-version=Nier vX / 首帧外观缓存脚本
├── package.json                   # 去掉 tailwind/lucide，其余同 LuminaPlus
├── vite.config.ts                 # base:"./", 目标 es2022/chrome111, manualChunks 去 charts/query
├── tsconfig*.json
├── vitest.config.ts / vitest.setup.ts
├── .env.example                   # API_BASE / TITLE / BACKGROUND_IMAGE
├── scripts/build-static.mjs       # build:github-page（原样）
├── .github/workflows/build-theme.yml  # main→dist / preview→dist-preview（原样）
├── CHANGELOG.md / README.md / docs/
└── src/
    ├── main.tsx / App.tsx / router.tsx          # 同 LuminaPlus，去掉 mock 之外保留
    ├── styles/
    │   ├── automata.css           # NieR 设计系统（第 3 节，含 --cur-* 光标集）
    │   └── theme.css              # 指标条/延迟柱/图表/页脚等监控专属补充
    ├── types/cfsm.ts              # 复用
    ├── services/…                 # 复用（见第 5 节）
    ├── hooks/…                    # 复用
    ├── utils/…                    # 复用
    ├── components/
    │   ├── shell/  AppShell, TerminalBar, Footer, TurnstileGate,
    │   │           PrivateSiteGate, RealtimeSessionPrompt, FloatingControls,
    │   │           MetricColorPicker, ErrorBoundary, BackgroundLayer
    │   ├── node/   NodeGrid, NodeCard, CompactNodeCard, MiniNodeCard, NodeListView,
    │   │           LatencyBars, PingLineSwitcher, MetricBar, QualityBars, …
    │   ├── instance/ InstanceDetails, InstancePanel, LoadChart, PingChart, …
    │   ├── traffic/ TrafficRateChart
    │   ├── ui/     Flag, OsLogo, Spinner(换成 NieR 旋转方框), …
    │   └── charts/ (uPlot 封装，NieR 主题)
    └── pages/ Home, Instance, Traffic, Assets, ThemeManage, NotFound
```

---

## 7. 构建与部署

- `npm run dev`：本地 `http://localhost:5173`，`?mock=1` 用假数据。
- `npm run build`：产物仅 `index.html + assets/`（`base:"./"`）。
- `npm run build:github-page`：写 `<meta name="apiBase">`，供纯静态托管。
- CI：`main→dist`、`preview→dist-preview`；产物提交信息 = 版本 + 更新日志（沿用 LuminaPlus 规范）。
- `index.html` 写入 `<meta name="theme-version" content="Nier v1.0.0">`。

---

## 8. 实施阶段

1. **骨架**：fork → 删 Tailwind/lucide → 建 `automata.css`（第 3 节完整设计系统）→ 改
   `index.html` 首帧脚本（外观/表面透明度键名改为 `cfsm-nier:*`）→ `AppShell`/`TerminalBar`/`Footer`。
2. **首页**：总览、四类卡片、延迟柱、分组/地区、悬浮控制。
3. **详情页**：信息面板 + 负载/Ping 图（uPlot 重样式）。
4. **流量/资产页**：表格 + 汇总 + 录入。
5. **主题设置页**：全部分区 + 保存到本机/后端/复制 JSON。
6. **门禁与提示**：Turnstile / 私有站点 / 实时超时 / 版本检查。
7. **打磨**：光标、网格、响应式、中英文案（`data-i18n` 或 React 内文案表）、`?mock=1`。

---

## 9. 风险与注意事项

- **光标 data-URI**：从 lunar-base 原样复制；注意 `automata.css` 里 `.cur-*` 工具类与
  `body [title]` 的 help 光标优先级，需在 React 组件里对应加上 `data-title`/显式类。
- **中文字体**：NieR 用的是西文窄字距；中文下 `.25em` 字距会过散，顶栏/按钮的中文文案
  需单独调小 `letter-spacing`（如 `.08em`），数值区保持等宽。
- **可读性**：米白底 + 炭黑字对比足够，但深色模式下 `--status-warning` 琥珀需偏亮，否则发灰。
- **图表**：uPlot 默认样式偏现代圆角，必须显式覆盖为直角、等宽刻度、`--hairline` 网格。
- **功能回归**：`services/` `hooks/` `utils/` 尽量零改动，只有改到 `className` 的组件需要
  重写，逻辑文件不动即可保行为一致。
