import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { useAuth } from "@/hooks/useAuth";
import {
  useAllNodeMeta,
  useHomeNodeSummaries,
  useNodeStoreStatus,
} from "@/hooks/useNode";
import { useHomepagePingOverview } from "@/hooks/usePingOverview";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { useViewMode } from "@/hooks/useViewMode";
import { formatBytes, formatByteRate, formatByteRateLabel } from "@/utils/format";
import { useHiddenNodeUuids } from "@/hooks/useVisibleNodes";
import { speedRateColor } from "@/utils/metricTone";
import {
  getHomeGroupLabel,
  getHomeGroupOptions,
  getHomeRegionOptions,
  HOME_ALL_GROUP,
  HOME_ALL_REGION,
  sortHomeGroupOptions,
  type HomeRegionOption,
} from "@/utils/homeNodes";
import { getDisplayRegionCode } from "@/utils/geo";
import { useHomeSort } from "@/hooks/useHomeSort";
import { useHomeNodeOrder } from "@/hooks/useHomeNodeOrder";
import { usePacedRate } from "@/hooks/usePacedRate";
import { HomeSortControl } from "./HomeSortControl";
import { CompactNodeCard } from "./CompactNodeCard";
import { MiniNodeCard } from "./MiniNodeCard";
import { NodeCardUuid } from "./NodeCard";
import { NodeListView } from "./NodeListView";
import type { NodeViewMode } from "@/utils/themeSettings";

const GRID_MIN_WIDTH: Record<NodeViewMode, number> = {
  large: 360,
  compact: 340,
  mini: 260,
  list: 0,
};

const UUID_KEY_SEPARATOR = ",";


interface HomeOverview {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  trafficUp: number;
  trafficDown: number;
  netUp: number;
  netDown: number;
}

function formatCompactBytes(value: number): string {
  const [amount, unit = "B"] = formatBytes(value).split(" ");
  return `${amount}${unit[0]}`;
}

function HomeBrand({ siteName }: { siteName: string }) {
  return (
    <header className="home-brand" aria-label="站点名称">
      <h1 className="home-brand-title" title={siteName}>
        {siteName}
      </h1>
    </header>
  );
}

function HomeOverviewCards({
  overview,
  dense,
}: {
  overview: HomeOverview;
  dense: boolean;
}) {
  const [trafficValue, trafficUnit] = formatBytes(overview.trafficUp + overview.trafficDown).split(" ");
  const rate = formatByteRate(overview.netUp + overview.netDown);
  const onlinePct = overview.totalNodes > 0 ? (overview.onlineNodes / overview.totalNodes) * 100 : 0;
  const offlinePct = overview.totalNodes > 0 ? (overview.offlineNodes / overview.totalNodes) * 100 : 0;
  const trafficDetailLabel = `↑ ${formatBytes(overview.trafficUp)} · ↓ ${formatBytes(overview.trafficDown)}`;
  const trafficCompactLabel = `↑${formatCompactBytes(overview.trafficUp)} ↓${formatCompactBytes(overview.trafficDown)}`;
  const bandwidthDetailLabel = `↑ ${formatByteRateLabel(overview.netUp)} · ↓ ${formatByteRateLabel(overview.netDown)}`;
  const bandwidthCompactLabel = `↑${formatCompactBytes(overview.netUp)} ↓${formatCompactBytes(overview.netDown)}`;

  return (
    <section className={`home-overview${dense ? " is-dense" : ""}`} aria-label="首页总览">
      <article className="overview-card" data-metric="online">
        <span className="overview-card-label">在线节点</span>
        <div className="overview-card-main">
          <p className="overview-card-value">
            {overview.onlineNodes}
            <span className="overview-card-unit">/ {overview.totalNodes}</span>
          </p>
        </div>
        {overview.totalNodes >= 5 && overview.totalNodes <= 10 ? (
          <div className="overview-blocks" role="presentation">
            {Array.from({ length: overview.totalNodes }, (_, i) => {
              const cls =
                i < overview.onlineNodes
                  ? "overview-block is-online"
                  : i >= overview.totalNodes - overview.offlineNodes
                    ? "overview-block is-offline"
                    : "overview-block";
              return <span key={i} className={cls} />;
            })}
          </div>
        ) : (
          <div className="overview-bar" role="presentation">
            <span className="overview-bar-online" style={{ width: `${onlinePct}%` }} />
            <span className="overview-bar-offline" style={{ width: `${offlinePct}%` }} />
          </div>
        )}
      </article>

      <article className="overview-card" data-metric="bandwidth">
        <span className="overview-card-label">实时带宽</span>
        <div className="overview-card-main">
          <p className="overview-card-value" style={{ color: speedRateColor(rate.unit) }}>
            {rate.value}
            <span className="overview-card-unit">{rate.unit}</span>
          </p>
        </div>
        <div className="overview-card-footer">
          <p className="overview-card-sub" title={bandwidthDetailLabel}>
            <span className="overview-card-sub-full">{bandwidthDetailLabel}</span>
            <span className="overview-card-sub-compact">{bandwidthCompactLabel}</span>
          </p>
        </div>
      </article>

      <article className="overview-card" data-metric="traffic">
        <div className="overview-card-head">
          <span className="overview-card-label">累计流量</span>
        </div>
        <div className="overview-card-main">
          <p className="overview-card-value">
            {trafficValue}
            <span className="overview-card-unit">{trafficUnit}</span>
          </p>
        </div>
        <div className="overview-card-footer">
          <p className="overview-card-sub" title={trafficDetailLabel}>
            <span className="overview-card-sub-full">{trafficDetailLabel}</span>
            <span className="overview-card-sub-compact">{trafficCompactLabel}</span>
          </p>
        </div>
      </article>
    </section>
  );
}

function GroupTabs({
  groups,
  selectedGroup,
  onSelectGroup,
}: {
  groups: string[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
}) {
  return (
    <div className="home-group-tabs" role="group" aria-label="节点分组">
      <button type="button" aria-pressed={selectedGroup === HOME_ALL_GROUP} data-active={selectedGroup === HOME_ALL_GROUP ? "true" : "false"} onClick={() => onSelectGroup(HOME_ALL_GROUP)}>
        全部
      </button>
      {groups.map((group) => (
        <button key={group} type="button" aria-pressed={selectedGroup === group} data-active={selectedGroup === group ? "true" : "false"} onClick={() => onSelectGroup(group)} title={group}>
          {group}
        </button>
      ))}
    </div>
  );
}

function RegionTabs({
  regions,
  selectedRegion,
  onSelectRegion,
}: {
  regions: HomeRegionOption[];
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
}) {
  return (
    <section className="home-region-bar" aria-label="地区筛选">
      <div className="home-region-chips" role="group">
        {regions.map(({ code, count }) => {
          const active = selectedRegion === code;
          return (
            <button key={code} type="button" className="home-region-chip" data-active={active ? "true" : "false"} aria-pressed={active} onClick={() => onSelectRegion(active ? HOME_ALL_REGION : code)} title={code}>
              <Flag region={code} size={14} />
              <span className="home-region-chip-code">{code}</span>
              <span className="home-region-chip-count">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function NodeGrid() {
  const nodes = useHomeNodeSummaries();
  const hiddenUuids = useHiddenNodeUuids();
  const allMeta = useAllNodeMeta();
  const { hydrated: storeHydrated, nodeInfoError } = useNodeStoreStatus();
  const { data: me } = useAuth();
  const { data: publicConfig } = usePublicConfig();
  const siteName = publicConfig?.sitename?.trim() || "节点概览";
  const themeSettings = useThemeSettings();
  const { mode } = useViewMode();
  const sort = useHomeSort();
  const sortEnabled = themeSettings.isReady && themeSettings.enableHomeSort;
  const sortField = sortEnabled ? sort.field : themeSettings.homeSortField;
  const sortDirection = sortEnabled ? sort.direction : themeSettings.homeSortDirection;
  const [selectedGroup, setSelectedGroup] = useState(HOME_ALL_GROUP);
  const [selectedRegion, setSelectedRegion] = useState(HOME_ALL_REGION);
  useHomepagePingOverview(mode);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => (me?.logged_in === true || !node.hidden) && !hiddenUuids.has(node.uuid)),
    [me?.logged_in, nodes, hiddenUuids],
  );
  const visibleMeta = useMemo(
    () => allMeta.filter((node) => (me?.logged_in === true || !node.hidden) && !hiddenUuids.has(node.uuid)),
    [allMeta, me?.logged_in, hiddenUuids],
  );
  const nameByUuid = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of visibleMeta) map.set(node.uuid, node.name?.trim() || node.uuid);
    return map;
  }, [visibleMeta]);
  const overview = useMemo<HomeOverview>(() => {
    let onlineNodes = 0;
    let offlineNodes = 0;
    let trafficUp = 0;
    let trafficDown = 0;
    let netUp = 0;
    let netDown = 0;
    for (const node of visibleNodes) {
      if (node.online === true) onlineNodes += 1;
      else if (node.online === false) offlineNodes += 1;
      trafficUp += node.trafficUp;
      trafficDown += node.trafficDown;
      netUp += node.netUp;
      netDown += node.netDown;
    }
    return { totalNodes: visibleNodes.length, onlineNodes, offlineNodes, trafficUp, trafficDown, netUp, netDown };
  }, [visibleNodes]);
  const pacedNet = usePacedRate(overview.netUp, overview.netDown);
  const displayOverview = useMemo<HomeOverview>(
    () => ({ ...overview, netUp: pacedNet.up, netDown: pacedNet.down }),
    [overview, pacedNet],
  );
  const showHomeOverview = themeSettings.isReady && themeSettings.showHomeOverview;



  const groupOptions = useMemo(
    () => sortHomeGroupOptions(getHomeGroupOptions(visibleNodes), themeSettings.isReady ? themeSettings.homeGroupOrder : []),
    [visibleNodes, themeSettings.homeGroupOrder, themeSettings.isReady],
  );
  const groupFilteredNodes = useMemo(
    () => (selectedGroup === HOME_ALL_GROUP ? visibleNodes : visibleNodes.filter((node) => getHomeGroupLabel(node.group) === selectedGroup)),
    [visibleNodes, selectedGroup],
  );
  const regionOptions = useMemo(() => getHomeRegionOptions(groupFilteredNodes), [groupFilteredNodes]);
  const filteredNodes = useMemo(
    () => (selectedRegion === HOME_ALL_REGION ? groupFilteredNodes : groupFilteredNodes.filter((node) => getDisplayRegionCode(node.region) === selectedRegion)),
    [groupFilteredNodes, selectedRegion],
  );
  const orderedNodes = useHomeNodeOrder({
    nodes: filteredNodes,
    field: sortField,
    direction: sortDirection,
    nameByUuid,
  });

  useEffect(() => {
    if (selectedGroup !== HOME_ALL_GROUP && !groupOptions.includes(selectedGroup)) {
      setSelectedGroup(HOME_ALL_GROUP);
    }
  }, [groupOptions, selectedGroup]);

  useEffect(() => {
    if (selectedRegion !== HOME_ALL_REGION && !regionOptions.some((option) => option.code === selectedRegion)) {
      setSelectedRegion(HOME_ALL_REGION);
    }
  }, [regionOptions, selectedRegion]);

  useEffect(() => {
    if (!themeSettings.showRegionBar && selectedRegion !== HOME_ALL_REGION) {
      setSelectedRegion(HOME_ALL_REGION);
    }
  }, [themeSettings.showRegionBar, selectedRegion]);

  useEffect(() => {
    if (!themeSettings.showGroupTabs && selectedGroup !== HOME_ALL_GROUP) {
      setSelectedGroup(HOME_ALL_GROUP);
    }
  }, [themeSettings.showGroupTabs, selectedGroup]);

  const uuidsKey = useMemo(() => orderedNodes.map((node) => node.uuid).join(UUID_KEY_SEPARATOR), [orderedNodes]);
  const orderedUuids = useMemo(() => (uuidsKey ? uuidsKey.split(UUID_KEY_SEPARATOR) : []), [uuidsKey]);
  const cards = useMemo(
    () =>
      mode === "list"
        ? null
        : orderedUuids.map((uuid) => (
            <div key={uuid} style={{ minWidth: 0 }}>
              {mode === "mini" ? <MiniNodeCard uuid={uuid} /> : mode === "compact" ? <CompactNodeCard uuid={uuid} /> : <NodeCardUuid uuid={uuid} />}
            </div>
          )),
    [orderedUuids, mode],
  );
  const showGroupTabs = themeSettings.isReady && themeSettings.showGroupTabs && groupOptions.length > 0;
  const showHomeSort = sortEnabled && visibleNodes.length > 1;
  const showRegionBar = themeSettings.isReady && themeSettings.showRegionBar && regionOptions.length > 1;
  const isMini = mode === "mini";
  const isList = mode === "list";
  const minColumnWidth = GRID_MIN_WIDTH[mode];
  // 「几乘几」布局设置：gridColumns > 0 时用固定列数，0 用自动最小列宽自适配。
  const fixedColumns = themeSettings.isReady ? themeSettings.gridColumns : 0;
  const gridStyle = isList
    ? undefined
    : fixedColumns > 0
      ? ({ gridTemplateColumns: `repeat(${fixedColumns}, minmax(0, 1fr))` } as CSSProperties)
      : ({ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumnWidth}px), 1fr))` } as CSSProperties);
  const gridElement = (
    <div className={clsx("node-grid", isMini && "is-mini", isList && "is-list")} style={gridStyle}>
      {cards}
    </div>
  );

  if (!themeSettings.isReady || !storeHydrated) {
    if (!nodeInfoError) return null;
    return (
      <div className="center-box" style={{ minHeight: "40vh" }} aria-live="polite">
        <span>节点数据暂时无法加载</span>
        <span style={{ color: "var(--fg-mid)", fontSize: 12 }}>正在等待后端自动重试</span>
      </div>
    );
  }

  const homeHeader = (
    <>
      <HomeBrand siteName={siteName} />
      {showHomeOverview && (
        <HomeOverviewCards
          overview={displayOverview}
          dense={mode === "mini" || mode === "list"}
        />
      )}
    </>
  );

  if (visibleNodes.length === 0) {
    return (
      <>
        {homeHeader}
        <div className="center-box" style={{ minHeight: "40vh" }}>
          <span>尚未连接到任何节点</span>
          <span style={{ color: "var(--fg-mid)", fontSize: 12 }}>等待后端推送或前往管理后台添加</span>
        </div>
      </>
    );
  }

  return (
    <>
      {homeHeader}
      {(showGroupTabs || showHomeSort) && (
        <div className="home-controls-bar">
          {showGroupTabs && <GroupTabs groups={groupOptions} selectedGroup={selectedGroup} onSelectGroup={setSelectedGroup} />}
          {showHomeSort && <HomeSortControl state={sort} />}
        </div>
      )}
      {showRegionBar && <RegionTabs regions={regionOptions} selectedRegion={selectedRegion} onSelectRegion={setSelectedRegion} />}
      {isList ? <NodeListView uuids={orderedUuids} /> : gridElement}
    </>
  );
}
