import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { useNodeCardModel } from "@/hooks/useNodeCardModel";
import { useLanguage, type I18nKey } from "@/hooks/useLanguage";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { usePreferences } from "@/hooks/usePreferences";
import { getLocalThemeSettings, saveLocalThemeSettings } from "@/services/themeSettingsStore";
import { useMetricColorsVersion } from "@/hooks/useMetricColors";
import { HOMEPAGE_PING_BUCKET_COUNT } from "@/hooks/usePingOverview";
import { setListNodeOrder } from "@/services/listNodeOrderStore";
import { useNieRHoverLabel } from "@/components/ui/NieRHoverLabel";
import { formatBytes } from "@/utils/format";
import { speedRateColor } from "@/utils/metricTone";
import { CanvasStrip } from "./CanvasStrip";
import { fillRoundedRect, safeCanvasColor } from "@/utils/canvasColor";
import { LatencyBars } from "./LatencyBars";
import { HealthBucketTooltip } from "./HealthBucketTooltip";
import { formatOsLabel, joinTagTitle, nodeDetailLinkLabels } from "./nodeCardShared";
import { formatHealthBucketTooltip } from "./pingBucketText";
import type { PingOverviewTaskLoadState } from "@/types/cfsm";


const GAUGE_SEGMENTS = 14;

/* ---- 可拖拽调整的列宽 ---- */
const DEFAULT_LIST_COLS = [220, 130, 100, 100, 100, 90, 110, 130, 120, 120];
const LIST_COLS_STORAGE_KEY = "cfsm-nier:list-cols:v1";
const MIN_COL_WIDTH = 56;
/** 列定义：key 对应主题设置 listColumns，lc 对应列宽变量 --lcN。节点列不可隐藏。 */
const LIST_COLUMNS = [
  { key: "os", i18n: "list.os", className: "col-os", lc: 1, def: 130 },
  { key: "cpu", i18n: "detail.cpu", className: "col-metric", lc: 2, def: 100 },
  { key: "mem", i18n: "list.mem", className: "col-metric", lc: 3, def: 100 },
  { key: "disk", i18n: "list.disk", className: "col-metric", lc: 4, def: 100 },
  { key: "load", i18n: "list.load", className: "col-load", lc: 5, def: 90 },
  { key: "live", i18n: "list.live", className: "col-live", lc: 6, def: 110 },
  { key: "traffic", i18n: "list.traffic", className: "col-traffic", lc: 7, def: 130 },
  { key: "net", i18n: "list.net", className: "col-net", lc: 8, def: 120 },
  { key: "life", i18n: "list.uptime", className: "col-life", lc: 9, def: 120 },
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

export function formatListPingStatus(latency: number | null, state: ListPingState, t: (key: I18nKey) => string) {
  const roundedLatency = latency == null ? null : Math.round(latency);
  const value = roundedLatency == null ? null : `${roundedLatency} ms`;
  if (value != null) {
    if (state === "error") {
      return { visibleText: `${roundedLatency}`, title: t("card.homePing.refreshFail"), ariaText: `${value}, ${t("card.homePing.refreshFail")}` };
    }
    if (state === "pending") {
      return { visibleText: `${roundedLatency}`, title: t("card.homePing.refreshing"), ariaText: `${value}, ${t("card.homePing.refreshing")}` };
    }
    return { visibleText: `${roundedLatency}`, title: `${value}`, ariaText: value };
  }

  switch (state) {
    case "unconfigured":
      return { visibleText: t("common.unconfigured"), title: t("card.homePing.unconfigured"), ariaText: t("card.homePing.unconfigured") };
    case "pending":
      return { visibleText: t("common.loading"), title: t("card.homePing.loading"), ariaText: t("card.homePing.loading") };
    case "error":
      return { visibleText: t("common.failed"), title: t("card.homePing.fail"), ariaText: t("card.homePing.fail") };
    default:
      return { visibleText: t("card.noSamples"), title: t("card.noValidPing"), ariaText: t("card.noSamples") };
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
  const { t } = useLanguage();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const state = resolveListPingState(loadState, hasRealHomepagePingBinding, pingIsAssigned);
  const status = formatListPingStatus(latency, state, t);
  const hoveredBucket = hoveredIndex == null ? null : (buckets[hoveredIndex] ?? null);
  const tooltip = hoveredBucket ? formatHealthBucketTooltip(hoveredBucket, "latency", t) : null;

  return (
    <div className="node-list-latency" data-ping-state={state} aria-label={`${t("ping.latency")} ${status.ariaText}`}>
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

const NodeRow = memo(function NodeRow({
  uuid,
  hiddenKeys,
  dragReorderEnabled,
  dragUuid,
  onDragStartRow,
  onDragEndRow,
  onDragOverRow,
  onDropRow,
}: {
  uuid: string;
  hiddenKeys: ReadonlySet<string>;
  dragReorderEnabled: boolean;
  dragUuid: string | null;
  onDragStartRow: (uuid: string, event: ReactDragEvent<HTMLAnchorElement>) => void;
  onDragEndRow: () => void;
  onDragOverRow: (uuid: string, event: ReactDragEvent<HTMLAnchorElement>) => void;
  onDropRow: (uuid: string, event: ReactDragEvent<HTMLAnchorElement>) => void;
}) {
  const { t } = useLanguage();
  const hoverLabel = useNieRHoverLabel();
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
  const listPingStatus = formatListPingStatus(ping.lastValue, listPingState, t);
  const detailLabels = nodeDetailLinkLabels(node.name, osName, t);
  const usedPct = `${Math.round(clamp01(traffic.fraction) * 100)}%`;
  const rowLabel = [
    node.name,
    `${t("list.os")} ${formatOsLabel(osName, node.os)}`,
    `CPU ${pctText(node.cpuPct)}`,
    `${t("list.mem")} ${pctText(node.ramPct)}`,
    `${t("list.disk")} ${pctText(node.diskPct)}`,
    `${t("list.load")} ${node.load1.toFixed(2)}`,
    `${t("card.liveUp")} ${upRate.value}${upRate.unit}`,
    `${t("card.liveDown")} ${downRate.value}${downRate.unit}`,
    `${t("card.traffic")} ${usedPct}`,
    `${t("ping.latency")} ${listPingStatus.ariaText}`,
    node.online === true ? t("list.online") : node.online === false ? t("list.offline") : t("list.unknown"),
    `${t("card.uptime")} ${uptime.value}${uptime.unit ? t(uptime.unit) : ""}`,
    t("card.viewDetail"),
  ].join("，");

  return (
    <Link
      to={`/server/${encodeURIComponent(uuid)}`}
      className={clsx("node-list-row", isOffline && "is-offline", dragReorderEnabled && "is-reorderable")}
      aria-label={rowLabel}
      draggable={dragReorderEnabled}
      data-dragging={dragUuid === uuid ? "true" : undefined}
      data-drop-target={dragUuid != null && dragUuid !== uuid ? "true" : undefined}
      onDragStart={(event) => onDragStartRow(uuid, event)}
      onDragEnd={onDragEndRow}
      onDragOver={(event) => onDragOverRow(uuid, event)}
      onDrop={(event) => onDropRow(uuid, event)}
      onPointerEnter={(event) => hoverLabel.show(event, detailLabels.title)}
      onPointerMove={hoverLabel.move}
      onPointerLeave={hoverLabel.hide}
    >
      {hoverLabel.node}
      <div className="node-list-node">
        {dragReorderEnabled && <span className="node-list-drag-handle" aria-hidden>⠿</span>}
        <div className="node-list-node-text">
          <div className="node-list-node-head">
            <Flag region={node.region} size={14} />
            <span className="node-list-name">
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
          <StackLine value={uptime.value} unit={uptime.unit ? t(uptime.unit) : undefined} color="var(--progress-cpu)" />
        </div>
      )}
    </Link>
  );
});

export function NodeListView({ uuids, dragReorderEnabled }: { uuids: string[]; dragReorderEnabled: boolean }) {
  const { t } = useLanguage();
  const themeSettings = useThemeSettings();
  const [dragUuid, setDragUuid] = useState<string | null>(null);

  const handleDragStart = useCallback((uuid: string, event: ReactDragEvent<HTMLAnchorElement>) => {
    // 只允许从首列（节点名）发起拖动，行内其它区域保持正常点选。
    if (!(event.target as HTMLElement).closest(".node-list-node")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    // Firefox 必须 setData 才会启动拖拽。
    event.dataTransfer.setData("text/plain", uuid);
    setDragUuid(uuid);
  }, []);

  const handleDragEnd = useCallback(() => setDragUuid(null), []);

  const handleDragOver = useCallback((uuid: string, event: ReactDragEvent<HTMLAnchorElement>) => {
    if (dragUuid != null && dragUuid !== uuid) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }, [dragUuid]);

  const handleDrop = useCallback((targetUuid: string, event: ReactDragEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const current = dragUuid;
    if (!current || current === targetUuid) {
      setDragUuid(null);
      return;
    }
    const next = [...uuids];
    const fromIndex = next.indexOf(current);
    const toIndex = next.indexOf(targetUuid);
    if (fromIndex < 0 || toIndex < 0) {
      setDragUuid(null);
      return;
    }
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, current);
    setListNodeOrder(next);
    setDragUuid(null);
  }, [dragUuid, uuids]);
  const [cols, setCols] = useState<number[]>(readListCols);
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const dragRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);
  const [draggingCol, setDraggingCol] = useState<number | null>(null);

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
    setDraggingCol(index);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    // 4px 吸附，拖动更跟手；列宽实时生效，内容（延迟柱）随宽度自适应。
    const nextWidth = Math.max(MIN_COL_WIDTH, Math.round((drag.startWidth + dx) / 4) * 4);
    setCols((prev) => prev.map((width, index) => (index === drag.index ? nextWidth : width)));
  };

  const onHandlePointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDraggingCol(null);
    writeListCols(colsRef.current);
  };

  /** 样式重置：恢复默认列宽，并恢复全部列可见。 */
  const resetTableStyle = () => {
    setCols(DEFAULT_LIST_COLS);
    writeListCols(DEFAULT_LIST_COLS);
    const current = getLocalThemeSettings() as Record<string, unknown>;
    if (current.listColumns != null) {
      const next = { ...current };
      delete next.listColumns;
      saveLocalThemeSettings(next as Parameters<typeof saveLocalThemeSettings>[0]);
    }
  };

  return (
    <div>
      <div className="node-list-toolbar">
        <button type="button" className="cost-summary-action" onClick={resetTableStyle} title={t("list.restoreCols")}>
          <span aria-hidden>↺</span> {t("list.resetStyle")}
        </button>
      </div>
      <div className="node-list-scroll">
        <div className="node-list" style={colVars}>
        <div className="node-list-row node-list-head" aria-hidden>
          <div className="node-list-cell node-list-head-cell">
            {t("list.node")}
            {dragReorderEnabled && (
              <span className="node-list-drag-handle" aria-hidden title={t("list.dragRowsHint")}>⠿</span>
            )}
          </div>
          {visibleColumns.map((column) => (
            <div key={column.key} className={`node-list-cell node-list-head-cell ${column.className}`}>
              {t(column.i18n)}
              <span
                className={`node-list-resize-handle${draggingCol === column.lc ? " is-dragging" : ""}`}
                role="separator"
                aria-orientation="vertical"
                title={`${t("list.dragHint")}「${t(column.i18n)}」`}
                onPointerDown={onHandlePointerDown(column.lc)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
              />
            </div>
          ))}
        </div>
        {uuids.map((uuid) => (
          <NodeRow
            key={uuid}
            uuid={uuid}
            hiddenKeys={hiddenKeys}
            dragReorderEnabled={dragReorderEnabled}
            dragUuid={dragUuid}
            onDragStartRow={handleDragStart}
            onDragEndRow={handleDragEnd}
            onDragOverRow={handleDragOver}
            onDropRow={handleDrop}
          />
        ))}
      </div>
      </div>
    </div>
  );
}
