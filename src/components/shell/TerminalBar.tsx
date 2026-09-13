import { Link, useLocation } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useViewMode } from "@/hooks/useViewMode";
import { useHomeNodeSummaries, useNodeStoreStatus } from "@/hooks/useNode";
import { type PingHistoryRefreshState } from "@/hooks/usePingHistoryRefresh";
import { useLanguage } from "@/hooks/useLanguage";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { getAdminUrl } from "@/services/cfsm/config";
import { clsx } from "clsx";
import type { Appearance } from "@/utils/themeSettings";
import type { NodeViewMode } from "@/utils/themeSettings";

const APPEARANCE_NEXT: Record<Appearance, Appearance> = {
  light: "system",
  system: "dark",
  dark: "light",
};
const APPEARANCE_LABEL: Record<Appearance, string> = {
  light: "LIGHT",
  system: "SYSTEM",
  dark: "DARK",
};

const VIEW_MODE_LABEL: Record<NodeViewMode, string> = {
  large: "LARGE",
  compact: "COMPACT",
  mini: "MINI",
  list: "LIST",
};

function buildRefreshTitle(state: PingHistoryRefreshState): string {
  if (state.status === "loading") return `正在拉取 ${state.nodeCount} 台节点最近 1 小时的延迟历史…`;
  if (state.status === "warn") return "30 分钟内已经刷新过；确实要再拉一次就再点一下";
  if (state.status === "error") return "刷新失败，点击重试";
  const base = `刷新延迟数据：拉取 ${state.nodeCount} 台节点最近 1 小时的真实采样`;
  if (state.lastRefreshedAt == null) return base;
  const at = new Date(state.lastRefreshedAt).toLocaleTimeString("zh-CN", { hour12: false });
  return `${base}\n上次刷新 ${at}`;
}

const MetricColorPicker = lazy(() =>
  import("@/components/shell/MetricColorPicker").then((module) => ({ default: module.MetricColorPicker })),
);

/**
 * 顶部「Bunker Terminal」状态栏 + 主导航。
 *
 * 左侧：YoRHa · Bunker Terminal · 站点标题 + 在线读数。
 * 右侧：外观 / 视图 / 配色 / 刷新延迟 / 主题设置 / 后台，终端胶囊按钮。
 */
export function TerminalBar({ pingRefresh }: { pingRefresh: PingHistoryRefreshState }) {
  const { data: config } = usePublicConfig();
  const { data: me } = useAuth();
  const { appearance, setAppearance } = usePreferences();
  const { mode, nextMode, toggleMode } = useViewMode();
  const { lang, setLang, t } = useLanguage();
  const themeSettings = useThemeSettings();
  const showAdmin = themeSettings.isReady && themeSettings.enableAdminButton;
  const [colorsOpen, setColorsOpen] = useState(false);
  const [colorsMounted, setColorsMounted] = useState(false);
  const summaries = useHomeNodeSummaries();
  const storeStatus = useNodeStoreStatus();
  const location = useLocation();

  const siteTitle = config?.sitename?.trim() || "CF-Server-Monitor";
  const online = summaries.filter((s) => s.online).length;
  const total = summaries.length;
  const viewLabel = VIEW_MODE_LABEL[mode];
  const viewNextLabel = VIEW_MODE_LABEL[nextMode];
  const refreshTitle = buildRefreshTitle(pingRefresh);
  const refreshActive = pingRefresh.status === "loading";

  const navLink = (to: string, label: string) => {
    const path = to.split("?")[0] ?? to;
    const active = location.pathname === path;
    return (
      <Link key={to} to={to} className={active ? "active" : undefined}>
        {label}
      </Link>
    );
  };

  return (
    <div className="top-sticky">
      <div className="terminal-bar">
        <div className="left">
          <span>YoRHa</span>
          <span>Bunker Terminal</span>
          <span style={{ opacity: 0.85 }}>{siteTitle}</span>
        </div>
        <div className="right">
          {storeStatus.hydrated && total > 0 && (
            <span className="user-pill">
              NODES {online}/{total}
            </span>
          )}
          <button
            type="button"
            className="control-button"
            onClick={() => pingRefresh.refresh()}
            disabled={pingRefresh.nodeCount === 0 || refreshActive}
            aria-busy={refreshActive}
            title={refreshTitle}
          >
            <span className={clsx(refreshActive && "spin")}>⟳</span> REFRESH
          </button>
          <button
            type="button"
            className="control-button"
            onClick={() => setAppearance(APPEARANCE_NEXT[appearance])}
            title="切换外观（明 / 跟随系统 / 暗）"
          >
            {APPEARANCE_LABEL[appearance]}
          </button>
          <button
            type="button"
            className="control-button"
            onClick={toggleMode}
            title={`切换卡片视图，点击后变为 ${viewNextLabel}`}
          >
            {viewLabel}
          </button>
          <button
            type="button"
            className="control-button"
            aria-pressed={colorsOpen}
            title="卡片配色"
            onClick={() => {
              setColorsMounted(true);
              setColorsOpen((value) => !value);
            }}
          >
            COLORS
          </button>
          <Link to="/?view=theme-manage" className="control-button" title="主题设置">
            SETTINGS
          </Link>
          {showAdmin && (
            <a
              href={getAdminUrl()}
              className="control-button"
              title={me?.logged_in ? "管理后台" : "后台登录"}
            >
              ADMIN
            </a>
          )}
          <button
            type="button"
            className="lang-toggle"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label="切换语言"
            title="切换语言 / Switch language"
          >
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </div>
      <nav className="primary">
        {navLink("/", t("nav.status"))}
        {navLink("/assets", t("nav.assets"))}
        {navLink("/traffic", t("nav.traffic"))}
      </nav>
      {colorsMounted && (
        <Suspense fallback={null}>
          <div className="terminal-bar-picker">
            <MetricColorPicker hidden={!colorsOpen} />
          </div>
        </Suspense>
      )}
    </div>
  );
}
