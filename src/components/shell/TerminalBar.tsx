import { Link, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
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
import type { Appearance, NodeViewMode } from "@/utils/themeSettings";

const APPEARANCE_OPTIONS: Array<{ value: Appearance; label: string; title: string }> = [
  { value: "light", label: "LIGHT", title: "浅色" },
  { value: "system", label: "SYSTEM", title: "跟随系统" },
  { value: "dark", label: "DARK", title: "深色" },
];

const VIEW_MODE_OPTIONS: Array<{ value: NodeViewMode; label: string }> = [
  { value: "large", label: "LARGE" },
  { value: "compact", label: "COMPACT" },
  { value: "mini", label: "MINI" },
  { value: "list", label: "LIST" },
];

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

function ViewModeDropdown() {
  const { mode, setMode } = useViewMode();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const current = VIEW_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "LARGE";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="terminal-view-mode" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="control-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="切换卡片视图"
        onClick={() => setOpen((value) => !value)}
      >
        {current} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div id={panelId} className="home-sort-panel" role="group" aria-label="卡片视图">
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="home-sort-item"
              data-active={mode === option.value ? "true" : "false"}
              aria-current={mode === option.value ? "true" : undefined}
              onClick={() => {
                setMode(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span className="home-sort-item-label">{option.label}</span>
              {mode === option.value && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 顶部「Bunker Terminal」状态栏 + 主导航。
 *
 * 左侧：YoRHa · Bunker Terminal · 站点标题 + 在线读数。
 * 右侧：外观三键 / 视图下拉 / 配色 / 刷新延迟 / 主题设置 / 后台 / 语言，终端胶囊按钮。
 */
export function TerminalBar({ pingRefresh }: { pingRefresh: PingHistoryRefreshState }) {
  const { data: config } = usePublicConfig();
  const { data: me } = useAuth();
  const { appearance, setAppearance } = usePreferences();
  const { lang, setLang, t } = useLanguage();
  const themeSettings = useThemeSettings();
  // 初始化（config 未到）时先显示，避免底部后台按钮闪没；配置到达后按开关决定。
  const showAdmin = !themeSettings.isReady || themeSettings.enableAdminButton;
  const [colorsOpen, setColorsOpen] = useState(false);
  const [colorsMounted, setColorsMounted] = useState(false);
  const colorsRootRef = useRef<HTMLDivElement | null>(null);
  const colorsButtonRef = useRef<HTMLButtonElement | null>(null);
  const summaries = useHomeNodeSummaries();
  const storeStatus = useNodeStoreStatus();
  const location = useLocation();

  // COLORS 面板：点击外部 / Esc 关闭。
  useEffect(() => {
    if (!colorsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (colorsRootRef.current?.contains(target)) return;
      if (colorsButtonRef.current?.contains(target)) return;
      setColorsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setColorsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [colorsOpen]);

  const siteTitle = config?.sitename?.trim() || "CF-Server-Monitor";
  const online = summaries.filter((s) => s.online).length;
  const total = summaries.length;
  const refreshTitle = buildRefreshTitle(pingRefresh);
  const refreshActive = pingRefresh.status === "loading";

  const isThemeManageView =
    location.pathname === "/" && location.search.includes("theme-manage");

  const navLink = (to: string, label: string, isActive?: () => boolean) => {
    const path = to.split("?")[0] ?? to;
    const active = isActive ? isActive() : location.pathname === path;
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
          <div className="control-group" role="group" aria-label="外观选择">
            {APPEARANCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={clsx("control-button", appearance === option.value && "is-active")}
                aria-pressed={appearance === option.value}
                title={option.title}
                onClick={() => setAppearance(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <ViewModeDropdown />
          <button
            ref={colorsButtonRef}
            type="button"
            className={clsx("control-button", colorsOpen && "is-active")}
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
            className="control-button"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label="切换语言"
            title="切换语言 / Switch language"
          >
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </div>
      <nav className="primary">
        {navLink("/", t("nav.status"), () => location.pathname === "/" && !isThemeManageView)}
        {navLink("/traffic", t("nav.traffic"))}
      </nav>
      <nav className="mobile-nav" aria-label="移动端导航">
        <Link to="/" className={location.pathname === "/" && !isThemeManageView ? "active" : undefined}>
          <span aria-hidden>▣</span>
          <span>{t("nav.status")}</span>
        </Link>
        <Link to="/traffic" className={location.pathname === "/traffic" ? "active" : undefined}>
          <span aria-hidden>≋</span>
          <span>{t("nav.traffic")}</span>
        </Link>
        <Link to="/?view=theme-manage" className={isThemeManageView ? "active" : undefined}>
          <span aria-hidden>▤</span>
          <span>{t("nav.settings")}</span>
        </Link>
        {showAdmin && (
          <a href={getAdminUrl()}>
            <span aria-hidden>⌘</span>
            <span>{t("nav.admin")}</span>
          </a>
        )}
      </nav>
      {colorsMounted && (
        <Suspense fallback={null}>
          <div className="terminal-bar-picker" ref={colorsRootRef}>
            <MetricColorPicker hidden={!colorsOpen} />
          </div>
        </Suspense>
      )}
    </div>
  );
}
