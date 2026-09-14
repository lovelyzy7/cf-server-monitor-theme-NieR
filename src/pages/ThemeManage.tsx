import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useCarrierNames, usePublicConfig } from "@/hooks/usePublicConfig";
import { useLocalThemeSettings } from "@/hooks/useThemeSettings";
import { clearViewModeOverride } from "@/hooks/useViewMode";
import { usePreferences } from "@/hooks/usePreferences";
import { useLanguage, type I18nKey } from "@/hooks/useLanguage";
import { getNodes, saveThemeOptions } from "@/services/api";
import { getJwtToken } from "@/services/cfsm/config";
import { ApiRequestError } from "@/services/cfsm/http";
import { carrierPingTasks } from "@/services/cfsm/mappers";
import {
  getLocalThemeSettings,
  resetLocalThemeSettings,
  saveLocalThemeSettings,
} from "@/services/themeSettingsStore";
import { copyText } from "@/utils/clipboard";
import { normalizeCostIgnoredNodes } from "@/utils/cost";
import { dedupeGroupLabels, normalizeHomeGroupOrder, sortHomeGroupOptions } from "@/utils/homeNodes";
import { normalizeThemeSettings, withPreferredAppearance, type ResolvedThemeSettings } from "@/utils/themeSettings";
import { HOME_SORT_FIELDS, HOME_SORT_FIELD_LABELS } from "@/utils/homeSort";
import type { ThemeSettings } from "@/types/cfsm";

const APPEARANCE_OPTIONS = [
  { value: "light", label: "appearance.light" },
  { value: "system", label: "appearance.system" },
  { value: "dark", label: "appearance.dark" },
] as const;
const VIEW_MODE_OPTIONS = [
  { value: "large", label: "view.large" },
  { value: "compact", label: "view.compact" },
  { value: "mini", label: "view.mini" },
  { value: "list", label: "view.list" },
] as const;

/** 表格（LIST 视图）可开关的列；节点列始终显示。 */
const LIST_COLUMN_OPTIONS = [
  { key: "os", label: "list.os" },
  { key: "cpu", label: "detail.cpu" },
  { key: "mem", label: "list.mem" },
  { key: "disk", label: "list.disk" },
  { key: "load", label: "list.load" },
  { key: "live", label: "list.live" },
  { key: "traffic", label: "list.traffic" },
  { key: "net", label: "list.net" },
  { key: "life", label: "list.uptime" },
] as const;

/** 平方数分布：N 个按钮排进 ceil(√N) 列（如 4→2×2、7→3×3）。 */
function squareGridColumns(count: number): CSSProperties {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return { gridTemplateColumns: `repeat(${columns}, 1fr)` };
}

/** 本页管理的设置键（草稿与签名都从它派生）。 */
function pickDraft(s: ResolvedThemeSettings) {
  return {
    defaultAppearance: s.defaultAppearance,
    desktopNodeViewMode: s.desktopNodeViewMode,
    mobileNodeViewMode: s.mobileNodeViewMode,
    enableAdminButton: s.enableAdminButton,
    showPingChart: s.showPingChart,
    enableHomepageMultiPing: s.enableHomepageMultiPing,
    homepageDefaultPingTaskId: s.homepageDefaultPingTaskId,
    fakePingForUnbound: s.fakePingForUnbound,
    showHomeOverview: s.showHomeOverview,
    showGroupTabs: s.showGroupTabs,
    showRegionBar: s.showRegionBar,
    showCardGroup: s.showCardGroup,
    showCardPrice: s.showCardPrice,
    compactShowTrafficTotal: s.compactShowTrafficTotal,
    compactShowUptime: s.compactShowUptime,
    showConnections: s.showConnections,
    enableHomeSort: s.enableHomeSort,
    homeSortField: s.homeSortField,
    homeSortDirection: s.homeSortDirection,
    homeGroupOrder: s.homeGroupOrder,
    gridColumns: s.gridColumns,
    listColumns: s.listColumns,
    hiddenNodes: s.hiddenNodes,
    surfaceOpacity: s.surfaceOpacity,
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

  /** 卡片视图（桌面/移动端合并）：切换即持久化到本机并清掉会话 override，首页立即生效。 */
  const applyNodeViewMode = useCallback(
    (value: Draft["desktopNodeViewMode"]) => {
      patch("desktopNodeViewMode", value);
      patch("mobileNodeViewMode", value);
      const current = getLocalThemeSettings() as Record<string, unknown>;
      saveLocalThemeSettings({
        ...current,
        desktopNodeViewMode: value,
        mobileNodeViewMode: value,
      } as Parameters<typeof saveLocalThemeSettings>[0]);
      clearViewModeOverride("desktop");
      clearViewModeOverride("mobile");
    },
    [patch],
  );

  useEffect(() => {
    if (isDirty) setMessage(null);
  }, [isDirty]);

  const seed = useCallback((s: ResolvedThemeSettings) => setDraft(pickDraft(s)), []);
  useEffect(() => {
    if (!isDirty) seed(sourceSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  const pingTasks = useMemo(() => carrierPingTasks(carrierNames), [carrierNames]);

  // 分组顺序拖拽：从节点元数据里取分组列表。
  const { data: nodeMeta } = useQuery({
    queryKey: ["theme-manage", "node-meta"],
    queryFn: ({ signal }) => getNodes({ signal }),
    staleTime: 60_000,
    retry: 1,
  });
  const availableGroups = useMemo(
    () => dedupeGroupLabels((nodeMeta ?? []).map((node) => node.group)),
    [nodeMeta],
  );
  const orderedGroups = useMemo(
    () => sortHomeGroupOptions(availableGroups, draft.homeGroupOrder),
    [availableGroups, draft.homeGroupOrder],
  );
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  // 草稿列数被重置/回流时同步待选值。
  const dropGroupOn = (target: string) => {
    if (!dragGroup || dragGroup === target) return;
    const next = [...draft.homeGroupOrder];
    const fromIndex = next.indexOf(dragGroup);
    if (fromIndex >= 0) next.splice(fromIndex, 1);
    const toIndex = next.indexOf(target);
    if (toIndex >= 0) next.splice(toIndex, 0, dragGroup);
    else next.push(dragGroup);
    patch("homeGroupOrder", next);
    setDragGroup(null);
  };

  const draftThemeSettings = useMemo<ThemeSettings>(() => ({
    ...draft,
    hiddenNodes: normalizeCostIgnoredNodes(draft.hiddenNodes),
    homeGroupOrder: normalizeHomeGroupOrder(draft.homeGroupOrder),
  }), [draft]);

  const handleSaveLocal = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      saveLocalThemeSettings({ ...getLocalThemeSettings(), ...draftThemeSettings });
      setMessage(t("manage.saveLocalDone"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("manage.saveFail"));
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
      setMessage(t("manage.copyDone"));
    } else {
      setMessage(null);
      setError(t("manage.copyFail"));
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
      setMessage(t("manage.saveSiteDone"));
    } catch (saveError) {
      if (saveError instanceof ApiRequestError && saveError.status === 401) {
        setError(t("manage.loginExpired"));
      } else if (saveError instanceof ApiRequestError && saveError.status === 403) {
        void refetchConfig();
        setError(t("manage.turnstile"));
      } else if (saveError instanceof ApiRequestError && saveError.status === 400) {
        setError(t("manage.invalidFormat"));
      } else {
        setError(saveError instanceof Error ? saveError.message : t("manage.saveFail"));
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
    setMessage(t("manage.restoreDone"));
    setError(null);
  };

  // 隐藏节点草稿用文本域编辑，提交时归一化回数组。
  const [hiddenText, setHiddenText] = useState(() => sourceSettings.hiddenNodes.join("\n"));
  useEffect(() => {
    if (!isDirty) {
      setHiddenText(sourceSettings.hiddenNodes.join("\n"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  return (
    <div className="theme-manage">
      <div className="page-sticky-bar theme-manage-topbar theme-masthead-topline">
        <Link className="instance-page-back" to="/">{t("common.backHome")}</Link>
        <div className="theme-manage-toolbar-actions">
          <button type="button" className="theme-manage-button" onClick={handleReset} disabled={!isDirty || saving} title={t("manage.resetHint")}>{t("manage.reset")}</button>
          <button type="button" className="theme-manage-button" onClick={handleRestoreSiteDefaults} disabled={saving} title={t("manage.restoreSiteHint")}>{t("manage.restoreSite")}</button>
          <button type="button" className="theme-manage-button" onClick={handleCopyJson} disabled={saving} title={t("manage.copyJsonHint")}>{t("manage.copyJson")}</button>
          <button type="button" className="theme-manage-button is-primary" onClick={() => void handleSaveLocal()} disabled={saving} aria-busy={saving}>
            {saving ? t("manage.saving") : t("manage.saveLocal")}
          </button>
          {canSaveToSite && (
            <button type="button" className="theme-manage-button is-primary" onClick={() => void handleSaveToSite()} disabled={savingSite} aria-busy={savingSite} title={t("manage.saveSiteHint")}>
              {savingSite ? t("manage.publishing") : t("manage.saveSite")}
            </button>
          )}
        </div>
      </div>

      <h1 className="bracket-header">{t("title.settings")}</h1>

      {message && <div className="banner success">&gt; {message}</div>}
      {error && <div className="banner error">&gt; ERROR :: {error}</div>}

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.defaultAppearance")}</h2>
        <div className="tab-bar" style={squareGridColumns(APPEARANCE_OPTIONS.length)}>
          {APPEARANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={clsx("tab-btn", draft.defaultAppearance === option.value && "active")}
              aria-pressed={draft.defaultAppearance === option.value}
              onClick={() => patch("defaultAppearance", option.value)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--fg-mid)", marginTop: 8 }}>
          {t("manage.currentUsing")}{appearance === "light" ? t("appearance.light") : appearance === "dark" ? t("appearance.dark") : t("appearance.system")}（{t("manage.saveLocalHint")}）
        </p>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.cardView")}</h2>
        {/* 桌面端与移动端合并为一组：四个选项对称分布；移动端选到 LIST 时自动回退小卡片。 */}
        <div className="tab-bar" style={squareGridColumns(VIEW_MODE_OPTIONS.length)}>
          {VIEW_MODE_OPTIONS.map((option) => (
            <button key={option.value} type="button" className={clsx("tab-btn", draft.desktopNodeViewMode === option.value && "active")} onClick={() => applyNodeViewMode(option.value)}>
              {t(option.label)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--fg-mid)", marginTop: 8 }}>{t("settings.cardViewHint")}</p>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.homeSort")}</h2>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("settings.defaultSort")}</span>
          <div className="tab-bar" style={squareGridColumns(HOME_SORT_FIELDS.length)}>
            {HOME_SORT_FIELDS.map((option) => (
              <button key={option} type="button" className={clsx("tab-btn", draft.homeSortField === option && "active")} onClick={() => patch("homeSortField", option)}>
                {t(HOME_SORT_FIELD_LABELS[option] as I18nKey)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("settings.defaultDir")}</span>
          <div className="tab-bar" style={squareGridColumns(2)}>
            <button type="button" className={clsx("tab-btn", draft.homeSortDirection === "asc" && "active")} onClick={() => patch("homeSortDirection", "asc")}>
              {t("sort.asc")}
            </button>
            <button type="button" className={clsx("tab-btn", draft.homeSortDirection === "desc" && "active")} onClick={() => patch("homeSortDirection", "desc")}>
              {t("sort.desc")}
            </button>
          </div>
        </div>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.homeShow")}</h2>
        <ToggleRow label={t("settings.showOverview")} desc={t("settings.showOverviewDesc")} checked={draft.showHomeOverview} onPatch={(v) => patch("showHomeOverview", v)} />
        <ToggleRow label={t("settings.showGroupTabs")} desc={t("settings.showGroupTabsDesc")} checked={draft.showGroupTabs} onPatch={(v) => patch("showGroupTabs", v)} />
        <ToggleRow label={t("settings.showRegionBar")} desc={t("settings.showRegionBarDesc")} checked={draft.showRegionBar} onPatch={(v) => patch("showRegionBar", v)} />
        <ToggleRow label={t("settings.showCardGroup")} checked={draft.showCardGroup} onPatch={(v) => patch("showCardGroup", v)} />
      </div>


      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.groupOrder")}</h2>
        {orderedGroups.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--fg-mid)", margin: 0 }}>{t("settings.noGroups")}</p>
        ) : (
          <div className="group-order-list" role="list">
            {orderedGroups.map((group, index) => (
              <div
                key={group}
                role="listitem"
                className="group-order-item"
                draggable
                data-dragging={dragGroup === group ? "true" : undefined}
                onDragStart={() => setDragGroup(group)}
                onDragEnd={() => setDragGroup(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropGroupOn(group)}
              >
                <span className="group-order-handle" aria-hidden>⠿</span>
                <span className="group-order-index tabular">{String(index + 1).padStart(2, "0")}</span>
                <span className="group-order-name">{group}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.compactList")}</h2>
        <ToggleRow label={t("settings.compactTraffic")} checked={draft.compactShowTrafficTotal} onPatch={(v) => patch("compactShowTrafficTotal", v)} />
        <ToggleRow label={t("settings.compactUptime")} checked={draft.compactShowUptime} onPatch={(v) => patch("compactShowUptime", v)} />
        <ToggleRow label={t("settings.showConnections")} desc={t("settings.showConnectionsDesc")} checked={draft.showConnections} onPatch={(v) => patch("showConnections", v)} />
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.listCols")}</h2>
        {LIST_COLUMN_OPTIONS.map((column) => (
          <ToggleRow
            key={column.key}
            label={t(column.label)}
            checked={draft.listColumns[column.key] !== false}
            onPatch={(v) => patch("listColumns", { ...draft.listColumns, [column.key]: v })}
          />
        ))}
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.pingLines")}</h2>
        <ToggleRow label={t("settings.multiPing")} desc={t("settings.multiPingDesc")} checked={draft.enableHomepageMultiPing} onPatch={(v) => patch("enableHomepageMultiPing", v)} />
        <ToggleRow label={t("settings.fakePing")} desc={t("settings.fakePingDesc")} checked={draft.fakePingForUnbound} onPatch={(v) => patch("fakePingForUnbound", v)} />
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t("settings.defaultLine")}</span>
          <div className="tab-bar" style={squareGridColumns(pingTasks.length)}>
            {pingTasks.map((task) => (
              <button key={task.id} type="button" className={clsx("tab-btn", draft.homepageDefaultPingTaskId === task.id && "active")} onClick={() => patch("homepageDefaultPingTaskId", task.id)}>
                {task.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>{t("settings.other")}</h2>
        <ToggleRow label={t("settings.adminBtn")} desc={t("settings.adminBtnDesc")} checked={draft.enableAdminButton} onPatch={(v) => patch("enableAdminButton", v)} />
        <ToggleRow label={t("settings.pingChart")} checked={draft.showPingChart} onPatch={(v) => patch("showPingChart", v)} />
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("settings.hiddenNodes")}</label>
          <textarea
            value={hiddenText}
            onChange={(e) => { setHiddenText(e.target.value); patch("hiddenNodes", normalizeCostIgnoredNodes(e.target.value.split("\n"))); }}
            rows={3}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-cream)", border: "var(--border-thin)", color: "var(--fg-dark)", padding: "8px 10px" }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{t("settings.surface")}（{draft.surfaceOpacity}%）</label>
          <input
            type="range"
            min="40"
            max="100"
            step="1"
            value={draft.surfaceOpacity}
            onChange={(e) => patch("surfaceOpacity", Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
        </div>
      </div>

      {canSaveToSite && (
        <div className="panel inverse" style={{ marginTop: 16 }}>
          <p style={{ margin: 0, fontSize: 12 }}>{t("manage.siteHint")}</p>
        </div>
      )}
    </div>
  );
}
