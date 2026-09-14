import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useCarrierNames, usePublicConfig } from "@/hooks/usePublicConfig";
import { useLocalThemeSettings } from "@/hooks/useThemeSettings";
import { usePreferences } from "@/hooks/usePreferences";
import { useLanguage } from "@/hooks/useLanguage";
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

/** 表格（LIST 视图）可开关的列；节点列始终显示。 */
const LIST_COLUMN_OPTIONS = [
  { key: "os", label: "系统" },
  { key: "cpu", label: "CPU" },
  { key: "mem", label: "内存" },
  { key: "disk", label: "磁盘" },
  { key: "load", label: "负载" },
  { key: "live", label: "实时" },
  { key: "traffic", label: "流量" },
  { key: "net", label: "网络" },
  { key: "life", label: "运行" },
] as const;

const GRID_COLUMN_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const;

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
  // 卡片布局：先选列数、点确认才写入草稿。
  const [pendingColumns, setPendingColumns] = useState<number>(() => sourceSettings.gridColumns);
  // 草稿列数被重置/回流时同步待选值。
  useEffect(() => {
    setPendingColumns(draft.gridColumns);
  }, [draft.gridColumns]);
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
      <div className="theme-masthead-topline" style={{ marginTop: 16 }}>
        <Link className="instance-page-back" to="/">{t("common.backHome")}</Link>
        <div className="theme-manage-toolbar-actions">
          <button type="button" className="theme-manage-button" onClick={handleReset} disabled={!isDirty || saving} title="撤销未保存的改动">重置</button>
          <button type="button" className="theme-manage-button" onClick={handleRestoreSiteDefaults} disabled={saving} title="丢弃本机设置，改用后端配置">改用后端配置</button>
          <button type="button" className="theme-manage-button" onClick={handleCopyJson} disabled={saving} title="导出完整配置 JSON，粘到后台主题自定义配置">复制配置 JSON</button>
          <button type="button" className="theme-manage-button is-primary" onClick={() => void handleSaveLocal()} disabled={saving} aria-busy={saving}>
            {saving ? "保存中…" : "保存到本机"}
          </button>
          {canSaveToSite && (
            <button type="button" className="theme-manage-button is-primary" onClick={() => void handleSaveToSite()} disabled={savingSite} aria-busy={savingSite} title="直接写到后端 theme_options，所有访客生效">
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
        <h2 className="bracket-header" style={{ fontSize: 14 }}>首页排序</h2>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>默认排序</span>
          <div className="tab-bar">
            {HOME_SORT_FIELDS.map((option) => (
              <button key={option} type="button" className={clsx("tab-btn", draft.homeSortField === option && "active")} onClick={() => patch("homeSortField", option)}>
                {HOME_SORT_FIELD_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase" }}>默认方向</span>
          <div className="tab-bar">
            <button type="button" className={clsx("tab-btn", draft.homeSortDirection === "asc" && "active")} onClick={() => patch("homeSortDirection", "asc")}>
              ↑ 升序
            </button>
            <button type="button" className={clsx("tab-btn", draft.homeSortDirection === "desc" && "active")} onClick={() => patch("homeSortDirection", "desc")}>
              ↓ 降序
            </button>
          </div>
        </div>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>首页显示</h2>
        <ToggleRow label="显示总览" desc="在线/离线/总带宽汇总面板" checked={draft.showHomeOverview} onPatch={(v) => patch("showHomeOverview", v)} />
        <ToggleRow label="显示分组页签" desc="按节点分组切换" checked={draft.showGroupTabs} onPatch={(v) => patch("showGroupTabs", v)} />
        <ToggleRow label="显示地区统计" desc="按地区聚合" checked={draft.showRegionBar} onPatch={(v) => patch("showRegionBar", v)} />
        <ToggleRow label="卡片显示分组" checked={draft.showCardGroup} onPatch={(v) => patch("showCardGroup", v)} />
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>卡片布局</h2>
        <div className="tab-bar">
          {GRID_COLUMN_OPTIONS.map((count) => (
            <button key={count} type="button" className={clsx("tab-btn", pendingColumns === count && "active")} onClick={() => setPendingColumns(count)}>
              {count === 0 ? "自动" : `${count} 列`}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="theme-manage-button is-compact"
            onClick={() => {
              patch("gridColumns", pendingColumns);
              // 确认即持久化到本机，刷新页面后布局仍生效。
              const current = getLocalThemeSettings() as Record<string, unknown>;
              saveLocalThemeSettings({ ...current, gridColumns: pendingColumns } as Parameters<typeof saveLocalThemeSettings>[0]);
            }}
          >
            确认
          </button>
          <span style={{ fontSize: 11, color: "var(--fg-mid)" }}>
            {draft.gridColumns === pendingColumns ? "已应用" : "尚未应用，点击确认后生效"}
          </span>
        </div>
        <p style={{ fontSize: 11, color: "var(--fg-mid)", marginTop: 8 }}>
          「自动」按卡片最小宽度自适配列数；选固定列数后，首页大/小/迷你卡片都按该列数排列。
        </p>
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>分组顺序（拖动排序）</h2>
        {orderedGroups.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--fg-mid)", margin: 0 }}>节点还没有配置分组。</p>
        ) : (
          <div className="group-order-list">
            {orderedGroups.map((group) => (
              <div
                key={group}
                className="group-order-item"
                draggable
                onDragStart={() => setDragGroup(group)}
                onDragEnd={() => setDragGroup(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropGroupOn(group)}
              >
                <span className="group-order-handle" aria-hidden>≡</span>
                <span>{group}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>小卡片与列表</h2>
        <ToggleRow label="小卡显示累计流量" checked={draft.compactShowTrafficTotal} onPatch={(v) => patch("compactShowTrafficTotal", v)} />
        <ToggleRow label="小卡显示在线时长" checked={draft.compactShowUptime} onPatch={(v) => patch("compactShowUptime", v)} />
        <ToggleRow label="显示连接数" desc="TCP/UDP（需探针上报）" checked={draft.showConnections} onPatch={(v) => patch("showConnections", v)} />
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>表格列（LIST 视图）</h2>
        {LIST_COLUMN_OPTIONS.map((column) => (
          <ToggleRow
            key={column.key}
            label={column.label}
            checked={draft.listColumns[column.key] !== false}
            onPatch={(v) => patch("listColumns", { ...draft.listColumns, [column.key]: v })}
          />
        ))}
      </div>

      <div className="panel panel-corners" style={{ marginTop: 16 }}>
        <h2 className="bracket-header" style={{ fontSize: 14 }}>延迟线路</h2>
        <ToggleRow label="多线路模式" desc="大/小卡片显示多条线路对比；关闭后单线路" checked={draft.enableHomepageMultiPing} onPatch={(v) => patch("enableHomepageMultiPing", v)} />
        <ToggleRow label="未绑定节点模拟数据" desc="访客看到的模拟延迟由站长显式开启" checked={draft.fakePingForUnbound} onPatch={(v) => patch("fakePingForUnbound", v)} />
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
        <h2 className="bracket-header" style={{ fontSize: 14 }}>其他</h2>
        <ToggleRow label="显示管理后台入口" desc="顶栏 ADMIN 按钮" checked={draft.enableAdminButton} onPatch={(v) => patch("enableAdminButton", v)} />
        <ToggleRow label="详情页显示 Ping 图表" checked={draft.showPingChart} onPatch={(v) => patch("showPingChart", v)} />
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>隐藏节点（每行一个名称或 UUID）</label>
          <textarea
            value={hiddenText}
            onChange={(e) => { setHiddenText(e.target.value); patch("hiddenNodes", normalizeCostIgnoredNodes(e.target.value.split("\n"))); }}
            rows={3}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-cream)", border: "var(--border-thin)", color: "var(--fg-dark)", padding: "8px 10px" }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>卡片不透明度（{draft.surfaceOpacity}%）</label>
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
          <p style={{ margin: 0, fontSize: 12 }}>登录站长可用「保存到后端」把当前配置直接写到站点 theme_options（所有访客生效）；未登录时用「复制配置 JSON」粘到后台「外观设置 → 主题自定义配置」。</p>
        </div>
      )}
    </div>
  );
}
