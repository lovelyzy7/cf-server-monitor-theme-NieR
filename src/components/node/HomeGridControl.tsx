import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { getJwtToken } from "@/services/cfsm/config";
import { saveThemeOptions } from "@/services/api";
import {
  getLocalThemeSettings,
  resetLocalThemeSettings,
  saveLocalThemeSettings,
} from "@/services/themeSettingsStore";
import { normalizeThemeSettings } from "@/utils/themeSettings";

/** 首页网格布局（几乘几）选项：0 = 自动，1~6 = 固定列数。 */
const GRID_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * 首页排序按钮左侧的「九宫格」布局下拉栏。
 * 选择后立即生效：配置保存到本机；已登录时同步保存到后端。
 */
export function HomeGridControl() {
  const { t } = useLanguage();
  const themeSettings = useThemeSettings();
  const { data: config, refetch: refetchConfig } = usePublicConfig();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

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

  const current = themeSettings.isReady ? themeSettings.gridColumns : 0;

  const apply = async (value: number) => {
    setOpen(false);
    const next = { ...getLocalThemeSettings(), gridColumns: value };
    saveLocalThemeSettings(next);
    // 已登录站长：同步保存到后端（失败静默，本机已生效）。
    if (getJwtToken()) {
      try {
        const merged = { ...(config?.theme_settings ?? {}), ...next };
        await saveThemeOptions(normalizeThemeSettings(merged) as unknown as Record<string, unknown>);
        resetLocalThemeSettings();
        void refetchConfig();
        queryClient.invalidateQueries({ queryKey: ["site-config"] });
      } catch {
        // 后端保存失败不打断本机已生效的布局。
      }
    }
  };

  return (
    <div className="home-grid-control" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="home-sort-trigger home-grid-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={t("home.gridColumns")}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="grid-icon" aria-hidden>
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} />
          ))}
        </span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div id={panelId} className="home-sort-panel home-grid-panel" role="group" aria-label={t("home.gridColumns")}>
          {GRID_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              data-active={current === count ? "true" : "false"}
              aria-current={current === count ? "true" : undefined}
              className="home-sort-item"
              onClick={() => void apply(count)}
            >
              <span className="home-sort-item-label">
                {count === 0 ? t("settings.auto") : `${count} ${t("settings.cols")}`}
              </span>
              {current === count && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
