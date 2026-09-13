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

## 发布前必改

- `src/utils/themeMeta.ts` 的 `THEME_REPO_URL`（主题仓库地址，页脚署名链接）
- `src/services/versionCheck.ts` 的 `THEME_RELEASE_INDEX_URL`（`OWNER` 换成真实 owner，用于「有新版本」提醒）

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

### 部署

- **Worker 托管（主题商店）**：`npm run build`，把 `dist/`（`index.html + assets/`）提交到
  `dist` 分支，或在后台主题商店填目录地址。
- **纯静态托管（GitHub Pages）**：`npm run build:github-page`，`.env` 里配 `API_BASE`。

CI 约定（沿用 LuminaPlus）：`main → dist`、`preview → dist-preview`；产物提交信息 =
`v<package.json version> <更新日志>`。

## 数据来源

| 主题功能 | 后端接口 |
| --- | --- |
| 站点配置、登录态 | `GET /api/config` |
| 节点列表与实时指标 | `GET /api/servers` |
| 实时推送 | `GET /api/ws?subscribe=all` + 通道内 `subscribe` 消息 |
| 详情页历史 / 负载 / 延迟 | `GET /api/history/all` |
| 保存主题配置（登录站长） | `POST /api/theme_options` |

## 待发布前必须改

- `src/services/versionCheck.ts` 里的 `THEME_RELEASE_INDEX_URL` 换成自己的仓库地址。
- `src/components/shell/Footer.tsx` 里的主题仓库链接换成自己的仓库。

## 致谢

- 风格来源：lunar-base（NieR:Automata Bunker Terminal）
- 功能来源：[CFSM-Theme-LuminaPlus](https://github.com/volcano-1025/CFSM-Theme-LuminaPlus)（codex & shark & shanyang）
- 后端：[CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)
