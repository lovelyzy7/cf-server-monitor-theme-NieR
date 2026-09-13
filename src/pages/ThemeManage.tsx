import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { useCarrierNames, usePublicConfig } from "@/hooks/usePublicConfig";
import { useLocalThemeSettings } from "@/hooks/useThemeSettings";
import { usePreferences } from "@/hooks/usePreferences";
import { useLanguage } from "@/hooks/useLanguage";
import { saveThemeOptions } from "@/services/api";
import { getJwtToken } from "@/services/cfsm/config";
import { ApiRequestError } from "@/services/cfsm/http";
import { carrierPingTasks } from "@/services/cfsm/mappers";
import {
  getLocalThemeSettings,
  resetLocalThemeSettings,
  saveLocalThemeSettings,
} from "@/services/themeSettingsStore";
import { copyText } from "@/utils/clipboard";
import {
  normalizeCostIgnoredNodes,
  normalizeCostRateApiUrl,
} from "@/utils/cost";
import { normalizeThemeSettings, withPreferredAppearance, type ResolvedThemeSettings } from "@/utils/themeSettings";
import type { ThemeSettings } from "@/types/cfsm";

const APPEARANCE_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "system", label: "跟随系统" },
  { value: "dark", label: "深色" },
] as const;
const VIEW_MODE_OPTIONS = [
  { value: "large", label: "大卡片" },
  { value: "compact", label: "小卡片" },
  { value: "mini", label: "迷你卡片" },
  { value: "list", label: "列表" },
] as const;

/** 本页管理的设置键（草稿与签名都从它派生）。 */
function pickDraft(s: ResolvedThemeSettings) {
  return {
    defaultAppearance: s.defaultAppearance,
    desktopNodeViewMode: s.desktopNodeViewMode,
    mobileNodeViewMode: s.mobileNodeViewMode,
    enableHomepageMultiPing: s.enableHomepageMultiPing,
    homepageDefaultPingTaskId: s.homepageDefaultPingTaskId,
    showHomeOverview: s.showHomeOverview,
    showGroupTabs: s.showGroupTabs,
    showRegionBar: s.showRegionBar,
    showCardGroup: s.showCardGroup,
    showCardPrice: s.showCardPrice,
    showCostSummary: s.showCostSummary,
    showCostSummaryFloatingButton: s.showCostSummaryFloatingButton,
    costRateApiUrl: s.costRateApiUrl,
    costIgnoredNodes: s.costIgnoredNodes,
  };
}
type Draft = ReturnType<typeof pickDraft>;

function ToggleRow({ label, desc, checked, onPatch }: { label: string; desc?: string; checked: boolean; onPatch: (v: boolean) => void }) {
  return (
    <label className="row-checkbox" style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--bg-cream-dark)", cursor: "var(--cur-pointer)" }}>
      <span>
        <span style={{ display: "block", color: "var(--fg-dark)" }}>{label}</span>
        {desc && <span style={{ display: "block", fontSize: 11, color: "var(--fg-mid)" }}>{desc}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onPatch(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
    </label>
  );
}

export function ThemeManage() {
  const { data: config, refetch: refetchConfig } = usePublicConfig();
  const carrierNames = useCarrierNames();
  const { appearance } = usePreferences();
  const { t } = useLanguage();
  const localThemeSettings = useLocalThemeSettings();

  const sourceSettings = useMemo(
    () => normalizeThemeSettings(
      withPreferredAppearance(config?.preferredAppearance, {
        ...(config?.theme_settings ?? {}),
        ...localThemeSettings,
      }),
    ),
    [config?.preferredAppearance, config?.theme_settings, localThemeSettings],
  );

  const [draft, setDraft] = useState<Draft>(() => pickDraft(sourceSettings));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingSite, setSavingSite] = useState(false);
  const canSaveToSite = useMemo(() => Boolean(getJwtToken()), []);

  const sourceSignature = useMemo(() => JSON.stringify(pickDraft(sourceSettings)), [sourceSettings]);
  const draftSignature = useMemo(() => JSON.stringify(draft), [draft]);
  const isDirty = draftSignature !== sourceSignature;

  const patch = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => (Object.is(prev[key], value) ? prev : { ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (isDirty) setMessage(null);
  }, [isDirty]);

  const seed = useCallback((s: ResolvedThemeSettings) => setDraft(pickDraft(s)), []);
  useEffect(() => {
    if (!isDirty) seed(sourceSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  const pingTasks = useMemo(() => carrierPingTasks(carrierNames), [carrierNames]);

  const draftThemeSettings = useMemo<ThemeSettings>(() => ({
    ...draft,
    costIgnoredNodes: normalizeCostIgnoredNodes(draft.costIgnoredNodes),
    costRateApiUrl: normalizeCostRateApiUrl(draft.costRateApiUrl),
  }), [draft]);

  const handleSaveLocal = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      saveLocalThemeSettings({ ...getLocalThemeSettings(), ...draftThemeSettings });
      setMessage("主题设置已保存到本机浏览器");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const siteDefaults = useMemo(() => {
    const merged = {
      ...(config?.theme_settings ?? {}),
      ...localThemeSettings,
      ...draftThemeSettings,
    } as ThemeSettings & Record<string, unknown>;
    return normalizeThemeSettings(merged);
  }, [config?.theme_settings, localThemeSettings, draftThemeSettings]);

  const siteDefaultsJson = useMemo(() => JSON.stringify(siteDefaults, null, 2), [siteDefaults]);

  const handleCopyJson = async () => {
    setError(null);
    if (await copyText(siteDefaultsJson)) {
      setMessage("配置 JSON 已复制，粘贴到后台「外观设置 → 主题自定义配置」保存即可成为所有设备的默认值");
    } else {
      setMessage(null);
      setError("复制失败，请检查浏览器的剪贴板权限");
    }
  };

  const handleSaveToSite = async () => {
    setError(null);
    setMessage(null);
    setSavingSite(true);
    try {
      await saveThemeOptions(siteDefaults as unknown as Record<string, unknown>);
      resetLocalThemeSettings();
      seed(normalizeThemeSettings(siteDefaults as unknown as ThemeSettings & Record<string, unknown>));
      void refetchConfig();
      setMessage("已保存到后端：所有设备与访客都会以这套配置为默认值");
    } catch (saveError) {
      if (saveError instanceof ApiRequestError && saveError.status === 401) {
        setError("登录态已失效，请到 /admin 重新登录后再保存到后端（本机设置不受影响）");
      } else if (saveError instanceof ApiRequestError && saveError.status === 403) {
        void refetchConfig();
        setError("本站需要人机验证：完成弹出的验证后，再点一次「保存到后端」");
      } else if (saveError instanceof ApiRequestError && saveError.status === 400) {
        setError("配置格式被后端拒绝（invalidThemeOptionsFormat），请把这条信息反馈给作者");
      } else {
        setError(saveError instanceof Error ? saveError.message : "保存到后端失败");
      }
    } finally {
      setSavingSite(false);
    }
  };

  const handleReset = () => {
    seed(sourceSettings);
    setMessage(null);
    setError(null);
  };

  const handleRestoreSiteDefaults = () => {
    resetLocalThemeSettings();
    seed(normalizeThemeSettings(withPreferredAppearance(config?.preferredAppearance, config?.theme_settings ?? {})));
    setMessage("已丢弃本机设置，改用后端当前的配置");
    setError(null);
  };

  // 忽略节点草稿用文本域编辑，提交时归一化回数组。
  const [ignoredText, setIgnoredText] = useState(() => sourceSettings.costIgnoredNodes.join("\n"));
  useEffect(() => {
    if (!isDirty) setIgnoredText(sourceSettings.costIgnoredNodes.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  return (
    <div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link className="button" to="/">{t("common.backHome")}</Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={handleReset} disabled={!isDirty || saving} title="撤销未保存的改动">重置</button>
          <button type="button" onClick={handleRestoreSiteDefaults} disabled={saving} title="丢弃本机设置，改用后端配置">改用后端配置</button>
          <button type="button" onClick={handleCopyJson} disabled={saving} title="导出完整配置 JSON，粘到后台主题自定义配置">复制配置 JSON</button>
          <button type="button" onClick={() => void handleSaveLocal()} disabled={saving} aria-busy={saving}>
            {saving ? "保存中…" : "保存到本机"}
          </button>
          {canSaveToSite && (
            <button type="button" onClick={() => void handleSaveToSite()} disabled={savingSite} aria-busy={savingSite} title="直接写到后端 theme_options，所有访客生效">
              {savingSite ? "发布中…" : "保存到后端"}
            </button>
          )}
        </div>
      </div>

      <h1 className="bracket-header">{t("title.settings")}</h1>

      {message && <div className="banner success">&gt; {message}</div>}
      {error && <div className="banner error">&gt; ERROR :: {error}</div>}

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>默认外观</h2>
        <div className="tab-bar">
          {APPEARANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={clsx("tab-btn", draft.defaultAppearance === option.value && "active")}
              aria-pressed={draft.defaultAppearance === option.value}
              onClick={() => patch("defaultAppearance", option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--fg-mid)", marginTop: 8 }}>
          当前设备正在使用：{appearance === "light" ? "浅色" : appearance === "dark" ? "深色" : "跟随系统"}（点上方「保存到本机」后新外观才写入本机偏好）
        </p>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>卡片视图</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>桌面</span>
            <div className="tab-bar">
              {VIEW_MODE_OPTIONS.map((option) => (
                <button key={option.value} type="button" className={clsx("tab-btn", draft.desktopNodeViewMode === option.value && "active")} onClick={() => patch("desktopNodeViewMode", option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>移动端</span>
            <div className="tab-bar">
              {VIEW_MODE_OPTIONS.filter((o) => o.value !== "list").map((option) => (
                <button key={option.value} type="button" className={clsx("tab-btn", draft.mobileNodeViewMode === option.value && "active")} onClick={() => patch("mobileNodeViewMode", option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>首页显示</h2>
        <ToggleRow label="显示总览" desc="在线/离线/总带宽汇总面板" checked={draft.showHomeOverview} onPatch={(v) => patch("showHomeOverview", v)} />
        <ToggleRow label="显示分组页签" desc="按节点分组切换" checked={draft.showGroupTabs} onPatch={(v) => patch("showGroupTabs", v)} />
        <ToggleRow label="显示地区统计" desc="按地区聚合" checked={draft.showRegionBar} onPatch={(v) => patch("showRegionBar", v)} />
        <ToggleRow label="卡片显示分组" checked={draft.showCardGroup} onPatch={(v) => patch("showCardGroup", v)} />
        <ToggleRow label="卡片显示价格" checked={draft.showCardPrice} onPatch={(v) => patch("showCardPrice", v)} />
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>延迟线路</h2>
        <ToggleRow label="多线路模式" desc="大/小卡片显示多条线路对比；关闭后单线路" checked={draft.enableHomepageMultiPing} onPatch={(v) => patch("enableHomepageMultiPing", v)} />
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>默认线路</span>
          <div className="tab-bar">
            {pingTasks.map((task) => (
              <button key={task.id} type="button" className={clsx("tab-btn", draft.homepageDefaultPingTaskId === task.id && "active")} onClick={() => patch("homepageDefaultPingTaskId", task.id)}>
                {task.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>费用与资产</h2>
        <ToggleRow label="启用资产统计页" desc="/assets 路由入口" checked={draft.showCostSummary} onPatch={(v) => patch("showCostSummary", v)} />
        <ToggleRow label="首页显示资产浮动入口" checked={draft.showCostSummaryFloatingButton} onPatch={(v) => patch("showCostSummaryFloatingButton", v)} />
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>汇率源 URL</label>
          <input type="text" value={draft.costRateApiUrl} onChange={(e) => patch("costRateApiUrl", e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>忽略节点（每行一个名称或 UUID）</label>
          <textarea
            value={ignoredText}
            onChange={(e) => { setIgnoredText(e.target.value); patch("costIgnoredNodes", normalizeCostIgnoredNodes(e.target.value.split("\n"))); }}
            rows={4}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-cream)", border: "var(--border-thin)", color: "var(--fg-dark)", padding: "8px 10px" }}
          />
        </div>
      </div>

      {canSaveToSite && (
        <div className="panel inverse" style={{ marginTop: 16 }}>
          <p style={{ margin: 0, fontSize: 12 }}>登录站长可用「保存到后端」把当前配置直接写到站点 theme_options（所有访客生效）；未登录时用「复制配置 JSON」粘到后台「外观设置 → 主题自定义配置」。</p>
        </div>
      )}
    </div>
  );
}
