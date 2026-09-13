import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { useNodeCardModel } from "@/hooks/useNodeCardModel";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { usePreferences } from "@/hooks/usePreferences";
import { useMetricColorsVersion } from "@/hooks/useMetricColors";
import { formatBytes } from "@/utils/format";
import { speedRateColor } from "@/utils/metricTone";
import { CanvasStrip } from "./CanvasStrip";
import { fillRoundedRect, safeCanvasColor } from "@/utils/canvasColor";
import { LatencyBars } from "./LatencyBars";
import { HealthBucketTooltip } from "./HealthBucketTooltip";
import { formatOsLabel, joinTagTitle, nodeDetailLinkLabels } from "./nodeCardShared";
import { formatHealthBucketTooltip } from "./pingBucketText";
import type { PingOverviewTaskLoadState } from "@/types/cfsm";
import { HOMEPAGE_PING_BUCKET_COUNT } from "@/hooks/usePingOverview";

const GAUGE_SEGMENTS = 14;

/* ---- 可拖拽调整的列宽 ---- */
const DEFAULT_LIST_COLS = [220, 130, 100, 100, 100, 90, 110, 130, 100, 120];
const LIST_COLS_STORAGE_KEY = "cfsm-nier:list-cols:v1";
const MIN_COL_WIDTH = 56;
/** 列定义：key 对应主题设置 listColumns，lc 对应列宽变量 --lcN。节点列不可隐藏。 */
const LIST_COLUMNS = [
  { key: "os", label: "系统", className: "col-os", lc: 1, def: 130 },
  { key: "cpu", label: "CPU", className: "col-metric", lc: 2, def: 100 },
  { key: "mem", label: "内存", className: "col-metric", lc: 3, def: 100 },
  { key: "disk", label: "磁盘", className: "col-metric", lc: 4, def: 100 },
  { key: "load", label: "负载", className: "col-load", lc: 5, def: 90 },
  { key: "live", label: "实时", className: "col-live", lc: 6, def: 110 },
  { key: "traffic", label: "流量", className: "col-traffic", lc: 7, def: 130 },
  { key: "net", label: "网络", className: "col-net", lc: 8, def: 100 },
  { key: "life", label: "在线 / 到期", className: "col-life", lc: 9, def: 120 },
] as const;

type ListColumn = (typeof LIST_COLUMNS)[number];

export function isListColumnVisible(
  listColumns: Record<string, boolean>,
  key: string,
): boolean {
  return listColumns[key] !== false;
}

function readListCols(): number[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LIST_COLS_STORAGE_KEY) ?? "null");
    if (Array.isArray(parsed) && parsed.length === DEFAULT_LIST_COLS.length) {
      const nums = parsed.map((value) => Number(value));
      if (nums.every((value) => Number.isFinite(value) && value >= MIN_COL_WIDTH)) {
        return nums;
      }
    }
  } catch {
    // 落到默认列宽。
  }
  return DEFAULT_LIST_COLS;
}

function writeListCols(cols: number[]) {
  try {
    window.localStorage.setItem(LIST_COLS_STORAGE_KEY, JSON.stringify(cols));
  } catch {
    // 持久化失败时本次会话内仍生效。
  }
}

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function pctText(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value >= 10 ? Math.round(value).toString() : value.toFixed(1);
}

type ListPingState = PingOverviewTaskLoadState | "unconfigured";

export function resolveListPingState(
  loadState: PingOverviewTaskLoadState | undefined,
  hasRealHomepagePingBinding: boolean,
  pingIsAssigned: boolean,
): ListPingState {
  if (!hasRealHomepagePingBinding && !pingIsAssigned) return "unconfigured";
  return loadState ?? (pingIsAssigned ? "ready" : "pending");
}

export function formatListPingStatus(latency: number | null, state: ListPingState) {
  const roundedLatency = latency == null ? null : Math.round(latency);
  const value = roundedLatency == null ? null : `${roundedLatency} 毫秒`;
  if (value != null) {
    if (state === "error") {
      return { visibleText: `${roundedLatency}`, title: "首页 Ping 刷新失败，显示上次数据", ariaText: `${value}，首页 Ping 刷新失败，显示上次数据` };
    }
    if (state === "pending") {
      return { visibleText: `${roundedLatency}`, title: "首页 Ping 正在刷新，显示上次数据", ariaText: `${value}，首页 Ping 正在刷新，显示上次数据` };
    }
    return { visibleText: `${roundedLatency}`, title: `${value}`, ariaText: value };
  }

  switch (state) {
    case "unconfigured":
      return { visibleText: "未配置", title: "未配置首页 Ping", ariaText: "未配置首页 Ping" };
    case "pending":
      return { visibleText: "加载中", title: "正在加载首页 Ping", ariaText: "首页 Ping 加载中" };
    case "error":
      return { visibleText: "加载失败", title: "首页 Ping 加载失败", ariaText: "首页 Ping 加载失败" };
    default:
      return { visibleText: "无样本", title: "暂无有效 Ping 样本", ariaText: "无样本" };
  }
}

function ListGauge({
  value,
  fraction,
  paint,
  redrawKey,
  unit = "%",
}: {
  value: string;
  fraction: number;
  paint: string;
  redrawKey: string;
  unit?: string;
}) {
  const activeSegments = clamp01(fraction) * GAUGE_SEGMENTS;
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const inactive = safeCanvasColor("var(--progress-bg)");
      const active = safeCanvasColor(paint);
      const gap = 2;
      const segWidth = Math.max(1, (width - gap * (GAUGE_SEGMENTS - 1)) / GAUGE_SEGMENTS);
      for (let i = 0; i < GAUGE_SEGMENTS; i += 1) {
        const x = i * (segWidth + gap);
        const fill = Math.max(0, Math.min(1, activeSegments - i));
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = inactive;
        fillRoundedRect(ctx, x, 0, segWidth, height, 0);
        if (fill > 0) {
          ctx.globalAlpha = 0.42 + fill * 0.56;
          ctx.fillStyle = active;
          fillRoundedRect(ctx, x, 0, segWidth, height, 0);
        }
      }
      ctx.globalAlpha = 1;
    },
    [activeSegments, paint],
  );
  return (
    <div className="node-list-gauge">
      <span className="node-list-gauge-value tabular">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      <CanvasStrip className="node-list-gauge-track" height={8} redrawKey={redrawKey} draw={draw} />
    </div>
  );
}

function StackLine({ icon, value, unit, color }: { icon?: React.ReactNode; value: string; unit?: string; color?: string }) {
  return (
    <span className="node-list-line" style={color ? { color } : undefined}>
      {icon && <span aria-hidden>{icon}</span>}
      <span className="tabular">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </span>
  );
}

function ListLatency({
  latency,
  loadState,
  hasRealHomepagePingBinding,
  pingIsAssigned,
  latencyColor,
  buckets,
  redrawKey,
}: {
  latency: number | null;
  loadState: PingOverviewTaskLoadState | undefined;
  hasRealHomepagePingBinding: boolean;
  pingIsAssigned: boolean;
  latencyColor: string;
  buckets: Parameters<typeof LatencyBars>[0]["buckets"];
  redrawKey: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const state = resolveListPingState(loadState, hasRealHomepagePingBinding, pingIsAssigned);
  const status = formatListPingStatus(latency, state);
  const hoveredBucket = hoveredIndex == null ? null : (buckets[hoveredIndex] ?? null);
  const tooltip = hoveredBucket ? formatHealthBucketTooltip(hoveredBucket, "latency") : null;

  return (
    <div className="node-list-latency" data-ping-state={state} aria-label={`网络延迟 ${status.ariaText}`}>
      <span className="node-list-latency-value tabular" style={{ color: latencyColor }} title={status.title}>
        {status.visibleText}
        {latency != null && <small>ms</small>}
      </span>
      <span className="node-list-latency-bars">
        <LatencyBars buckets={buckets} redrawKey={redrawKey} height={14} onHoverIndex={setHoveredIndex} />
        <HealthBucketTooltip text={tooltip} index={hoveredIndex} count={buckets.length} />
      </span>
    </div>
  );
}

const NodeRow = memo(function NodeRow({ uuid, hiddenKeys }: { uuid: string; hiddenKeys: ReadonlySet<string> }) {
  const { resolvedAppearance } = usePreferences();
  const colorsVersion = useMetricColorsVersion();
  const redrawKey = `${resolvedAppearance}:${colorsVersion}`;
  const model = useNodeCardModel(uuid, { pingBucketCount: HOMEPAGE_PING_BUCKET_COUNT });

  if (!model.node) {
    return <div className="node-list-row" aria-busy style={{ minHeight: 40 }} />;
  }

  const {
    node,
    traffic,
    ping,
    pingBuckets,
    footerTags,
    expire,
    expireColor,
    uptime,
    renewalPrice,
    latencyColor,
    hasRealHomepagePingBinding,
    loadFraction,
    upRate,
    downRate,
    isOffline,
    osName,
  } = model;
  const listPingState = resolveListPingState(ping.loadState, hasRealHomepagePingBinding, ping.isAssigned);
  const listPingStatus = formatListPingStatus(ping.lastValue, listPingState);
  const detailLabels = nodeDetailLinkLabels(node.name, osName);
  const usedPct = `${Math.round(clamp01(traffic.fraction) * 100)}%`;
  const rowLabel = [
    node.name,
    `系统 ${formatOsLabel(osName, node.os)}`,
    `CPU ${pctText(node.cpuPct)}`,
    `内存 ${pctText(node.ramPct)}`,
    `磁盘 ${pctText(node.diskPct)}`,
    `负载 ${node.load1.toFixed(2)}`,
    `上行 ${upRate.value}${upRate.unit}`,
    `下行 ${downRate.value}${downRate.unit}`,
    `流量使用 ${usedPct}`,
    `网络延迟 ${listPingStatus.ariaText}`,
    node.online === true ? "在线" : node.online === false ? "离线" : "状态未知",
    `运行 ${uptime.value}${uptime.unit}`,
    `到期 ${expire.value}${expire.unit}`,
    "查看详情",
  ].join("，");

  return (
    <Link
      to={`/server/${encodeURIComponent(uuid)}`}
      className={clsx("node-list-row", isOffline && "is-offline")}
      title={detailLabels.title}
      aria-label={rowLabel}
    >
      <div className="node-list-node">
        <div className="node-list-node-text">
          <div className="node-list-node-head">
            <Flag region={node.region} size={14} />
            <span className="node-list-name" title={node.name}>
              {node.name}
            </span>
          </div>
          {(renewalPrice || footerTags.length > 0) && (
            <div className="node-list-chips" title={footerTags.length > 0 ? joinTagTitle(footerTags) : undefined}>
              {renewalPrice && (
                <span className="dstatus-price-chip">
                  <span aria-hidden>¥</span>
                  {renewalPrice}
                </span>
              )}
              {footerTags.map((tag, index) => (
                <span key={`${tag.label}-${index}`} className="dstatus-tag-chip" data-tag={tag.color} style={{ background: "var(--tag-bg)", color: "var(--tag-fg)" }}>
                  {tag.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {!hiddenKeys.has("os") && (
        <div className="col-os">
          <OsLogo value={node.os} size={16} />
          <span className="node-list-os-name" title={node.os || osName}>
            {formatOsLabel(osName, node.os)}
          </span>
        </div>
      )}

      {!hiddenKeys.has("cpu") && (
        <div className="col-metric">
          <ListGauge value={pctText(node.cpuPct)} fraction={node.cpuPct / 100} paint="var(--progress-cpu)" redrawKey={redrawKey} />
        </div>
      )}
      {!hiddenKeys.has("mem") && (
        <div className="col-metric">
          <ListGauge value={pctText(node.ramPct)} fraction={node.ramPct / 100} paint="var(--progress-memory)" redrawKey={redrawKey} />
        </div>
      )}
      {!hiddenKeys.has("disk") && (
        <div className="col-metric">
          <ListGauge value={pctText(node.diskPct)} fraction={node.diskPct / 100} paint="var(--progress-disk)" redrawKey={redrawKey} />
        </div>
      )}

      {!hiddenKeys.has("load") && (
        <div className="col-load">
          <ListGauge value={node.load1.toFixed(2)} unit="" fraction={loadFraction} paint="var(--progress-load)" redrawKey={redrawKey} />
        </div>
      )}

      {!hiddenKeys.has("live") && (
        <div className="col-live node-list-stack">
          <StackLine icon="↑" value={upRate.value} unit={upRate.unit} color={speedRateColor(upRate.unit)} />
          <StackLine icon="↓" value={downRate.value} unit={downRate.unit} color={speedRateColor(downRate.unit)} />
        </div>
      )}

      {!hiddenKeys.has("traffic") && (
        <div className="col-traffic" title={`剩余 ${traffic.remainingLabel} · ${traffic.detail}`}>
          <div className="node-list-traffic-rows">
            <StackLine icon="↑" value={formatBytes(node.trafficUp)} />
            <StackLine icon="↓" value={formatBytes(node.trafficDown)} />
          </div>
          <span className="node-list-traffic-quota" style={{ color: traffic.color }}>
            {usedPct}
          </span>
        </div>
      )}

      {!hiddenKeys.has("net") && (
        <div className="col-net">
          <ListLatency
            latency={ping.lastValue}
            loadState={ping.loadState}
            hasRealHomepagePingBinding={hasRealHomepagePingBinding}
            pingIsAssigned={ping.isAssigned}
            latencyColor={latencyColor}
            buckets={pingBuckets}
            redrawKey={redrawKey}
          />
        </div>
      )}

      {!hiddenKeys.has("life") && (
        <div className="col-life node-list-stack">
          <StackLine value={uptime.value} unit={uptime.unit} color="var(--progress-cpu)" />
          <StackLine value={expire.value} unit={expire.unit} color={expireColor} />
        </div>
      )}
    </Link>
  );
});

export function NodeListView({ uuids }: { uuids: string[] }) {
  const themeSettings = useThemeSettings();
  const [cols, setCols] = useState<number[]>(readListCols);
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const dragRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const visibleColumns = useMemo<ListColumn[]>(
    () => LIST_COLUMNS.filter((column) => isListColumnVisible(themeSettings.listColumns, column.key)),
    [themeSettings.listColumns],
  );
  const hiddenKeys = useMemo(() => {
    const set = new Set<string>();
    for (const column of LIST_COLUMNS) {
      if (!isListColumnVisible(themeSettings.listColumns, column.key)) set.add(column.key);
    }
    return set;
  }, [themeSettings.listColumns]);

  const colVars = useMemo(() => {
    const vars: Record<string, string> = {};
    cols.forEach((width, index) => {
      vars[`--lc${index}`] = `${width}px`;
    });
    // 列模板由可见列拼出（节点列始终在），隐藏列不占轨道。
    const parts = ["var(--lc0, 220px)"];
    for (const column of visibleColumns) {
      parts.push(`var(--lc${column.lc}, ${column.def}px)`);
    }
    vars["--node-list-template"] = parts.join(" ");
    return vars as CSSProperties;
  }, [cols, visibleColumns]);

  const onHandlePointerDown = (index: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 指针已结束时忽略。
    }
    dragRef.current = { index, startX: event.clientX, startWidth: cols[index] ?? MIN_COL_WIDTH };
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const nextWidth = Math.max(MIN_COL_WIDTH, Math.round(drag.startWidth + dx));
    setCols((prev) => prev.map((width, index) => (index === drag.index ? nextWidth : width)));
  };

  const onHandlePointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    writeListCols(colsRef.current);
  };

  return (
    <div className="node-list-scroll">
      <div className="node-list" style={colVars}>
        <div className="node-list-row node-list-head" aria-hidden>
          <div className="node-list-cell node-list-head-cell">节点</div>
          {visibleColumns.map((column) => (
            <div key={column.key} className={`node-list-cell node-list-head-cell ${column.className}`}>
              {column.label}
              <span
                className="node-list-resize-handle"
                role="separator"
                aria-orientation="vertical"
                title={`拖拽调整「${column.label}」列宽`}
                onPointerDown={onHandlePointerDown(column.lc)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
              />
            </div>
          ))}
        </div>
        {uuids.map((uuid) => (
          <NodeRow key={uuid} uuid={uuid} hiddenKeys={hiddenKeys} />
        ))}
      </div>
    </div>
  );
}
