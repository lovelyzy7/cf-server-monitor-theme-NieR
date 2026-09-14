import { Fragment, lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { Spinner } from "@/components/ui/Spinner";
import { useMinuteClock } from "@/hooks/useClock";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTodayTrafficStats } from "@/hooks/useTodayTrafficStats";
import { useVisibleNodes } from "@/hooks/useVisibleNodes";
import { useHomeNodeSummaries } from "@/hooks/useNode";
import { usePacedRate } from "@/hooks/usePacedRate";
import { NieRDatePicker, fromDateInputValue, localDayMs, toDateInputValue as pickerToDateInput } from "@/components/traffic/NieRDatePicker";
import { useLanguage, type I18nKey } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { clearHistoryCache, getLoadRecords } from "@/services/api";
import { formatByteRateLabel, formatBytes } from "@/utils/format";
import { speedRateColor } from "@/utils/metricTone";
import {
  buildTodayTrafficRecordSamples,
  summarizeTodayTrafficRecords,
  type TodayTrafficStat,
} from "@/utils/trafficStats";
import type { NodeInfo } from "@/types/cfsm";

const DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" });
const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const TRAFFIC_MOBILE_QUERY = "(max-width: 720px)";
const DAY_MS = 24 * 60 * 60 * 1000;

const TrafficRateChart = lazy(() =>
  import("@/components/traffic/TrafficRateChart").then((module) => ({ default: module.TrafficRateChart })),
);

interface TrafficDetail {
  node: NodeInfo;
  stat: TodayTrafficStat;
  total: number;
}

type TrafficSortField = "name" | "total" | "peakUp" | "peakDown";
type TrafficSortDirection = "asc" | "desc";

const TRAFFIC_TABLE_COLUMNS: Array<{ field: TrafficSortField; label: I18nKey; numeric?: boolean }> = [
  { field: "name", label: "traffic.columnNode" },
  { field: "total", label: "traffic.columnTotal", numeric: true },
  { field: "peakUp", label: "traffic.columnPeakUp", numeric: true },
  { field: "peakDown", label: "traffic.columnPeakDown", numeric: true },
];

const NATURAL_DIRECTION: Record<TrafficSortField, TrafficSortDirection> = {
  name: "asc",
  total: "desc",
  peakUp: "desc",
  peakDown: "desc",
};

function localDayStart(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** 后端支持的时长档位；给区间前后各留 1 小时采样基准。 */
function hoursTierForRange(startMs: number, endMs: number): number {
  const elapsedHours = Math.max(1, Math.ceil((endMs - startMs) / 3_600_000) + 1);
  const tiers = [24, 48, 96, 168, 336];
  return tiers.find((hours) => hours >= elapsedHours) ?? 336;
}

function sortDetailValue(detail: TrafficDetail, field: TrafficSortField): number | string {
  switch (field) {
    case "name": return detail.node.name;
    case "total": return detail.total;
    case "peakUp": return detail.stat.peakUp;
    case "peakDown": return detail.stat.peakDown;
  }
}

function toDateInputValue(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatPeakTime(timeMs: number | null, value: number) {
  return timeMs != null && value > 0 ? TIME_FORMATTER.format(timeMs) : "—";
}

function TrafficSortControl({
  field,
  direction,
  onSelect,
}: {
  field: TrafficSortField;
  direction: TrafficSortDirection;
  onSelect: (field: TrafficSortField) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const labels: Record<TrafficSortField, string> = {
    name: t("traffic.columnNode"),
    total: t("traffic.columnTotal"),
    peakUp: t("traffic.columnPeakUp"),
    peakDown: t("traffic.columnPeakDown"),
  };

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
    <div className="home-sort" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="home-sort-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={`${t("sort.mode")}：${labels[field]}（${direction === "asc" ? t("sort.ascText") : t("sort.descText")}）`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>{direction === "asc" ? "↑" : "↓"}</span>
        <span>{labels[field]}</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div id={panelId} className="home-sort-panel" role="group" aria-label={t("sort.mode")}>
          {(Object.keys(labels) as TrafficSortField[]).map((option) => {
            const active = option === field;
            return (
              <button
                key={option}
                type="button"
                aria-current={active ? "true" : undefined}
                data-active={active ? "true" : "false"}
                className="home-sort-item"
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className="home-sort-item-label">{labels[option]}</span>
                {active && <span aria-hidden>{direction === "asc" ? "↑" : "↓"}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeakValue({ value, timeMs }: { value: number; timeMs: number | null }) {
  return (
    <span className="traffic-peak-value">
      <strong>{formatByteRateLabel(value)}</strong>
      <small>{formatPeakTime(timeMs, value)}</small>
    </span>
  );
}

function PeakSummaryRow({ direction, detail }: { direction: "up" | "down"; detail: TrafficDetail | null }) {
  const { t } = useLanguage();
  const value = direction === "up" ? detail?.stat.peakUp ?? 0 : detail?.stat.peakDown ?? 0;
  const timeMs = direction === "up" ? detail?.stat.peakUpAt ?? null : detail?.stat.peakDownAt ?? null;
  return (
    <div className="traffic-summary-peak-row">
      <span className="traffic-summary-peak-label">
        {direction === "up" ? t("traffic.up") : t("traffic.down")}
      </span>
      <span className="traffic-summary-peak-main">
        <strong>{detail ? formatByteRateLabel(value) : "—"}</strong>
        <small>
          {detail && value > 0 ? `${detail.node.name} · ${formatPeakTime(timeMs, value)}` : t("traffic.noPeak")}
        </small>
      </span>
    </div>
  );
}

const NODE_CHART_RANGES = [
  { label: "range.h1", hours: 1 },
  { label: "range.h2", hours: 2 },
  { label: "range.h3", hours: 3 },
  { label: "range.h7", hours: 7 },
  { label: "range.d1", hours: 24 },
  { label: "range.d3", hours: 72 },
  { label: "range.d7", hours: 168 },
  { label: "range.d14", hours: 336 },
] as const;

const NODE_CHART_HOURS_TIERS = [1, 6, 12, 24, 48, 96, 168, 336];

function tierForSpan(spanMs: number): number {
  const elapsed = Math.max(1, Math.ceil(spanMs / 3_600_000));
  return NODE_CHART_HOURS_TIERS.find((hours) => hours >= elapsed) ?? 336;
}

/**
 * 节点图（双 Y 轴：左=当日流量累计，右=网速）。
 * 范围联动：1h/2h/3h/7h/1天/3天/7天 快捷档，或日期选择起始日（窗口到当前时刻；
 * 后端只保留 7 天，更早的日期只有保留期内的数据）。未登录限 24 小时。
 */
function TrafficSamplePanel({ uuid, live }: { uuid: string; live: { up: number; down: number } | null }) {
  const { t } = useLanguage();
  const { data: me } = useAuth();
  const [rangeHours, setRangeHours] = useState<number>(24);
  const [customDate, setCustomDate] = useState<string | null>(null);
  // 窗口锚点只在用户换范围/日期/手动刷新时更新：查询键稳定，图表不因页面每秒重渲而重建。
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const customStartMs = customDate ? new Date(`${customDate}T00:00:00`).getTime() : null;
  const startMs = customStartMs ?? anchorMs - rangeHours * 3_600_000;
  const hours = tierForSpan(anchorMs - startMs);
  const retentionMs = 14 * DAY_MS;
  const allowed = hours <= 24 || me?.logged_in === true;
  const samplesQuery = useQuery({
    queryKey: ["traffic-node-chart", uuid, startMs],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getLoadRecords(uuid, hours, { signal }).then((data) =>
        buildTodayTrafficRecordSamples(data.records, startMs, anchorMs),
      ),
    staleTime: 60_000,
    retry: 1,
    enabled: allowed,
  });
  const selectRange = (nextHours: number) => {
    setRangeHours(nextHours);
    setCustomDate(null);
    setAnchorMs(Date.now());
  };
  const selectDate = (value: string) => {
    setCustomDate(value || null);
    setAnchorMs(Date.now());
  };
  const refreshChart = () => {
    clearHistoryCache();
    setAnchorMs(Date.now());
    void samplesQuery.refetch();
  };
  const samples = samplesQuery.data ?? [];
  const hasSamples = samples.length > 0;
  const beyondRetention = customStartMs != null && anchorMs - customStartMs > retentionMs;

  return (
    <section className="panel" aria-label={t("traffic.nodeChartTitle")} style={{ marginTop: 8 }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <strong style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 13 }}>{t("traffic.chartTitle")}</strong>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)" }}>
            {hasSamples ? `${samples.length} ${t("common.samples")} · ${t("traffic.estimate")}` : t("traffic.waiting")}
          </span>
          <button type="button" className="cost-summary-action" onClick={refreshChart} disabled={samplesQuery.isFetching} aria-busy={samplesQuery.isFetching} title={t("traffic.refetch")}>
            ⟳ {t("common.refresh")}
          </button>
        </span>
      </header>
      <div className="tab-bar node-chart-ranges" role="group" aria-label={t("traffic.range")}>
        {NODE_CHART_RANGES.map((range) => (
          <button
            key={range.hours}
            type="button"
            className={clsx("tab-btn", customDate == null && rangeHours === range.hours && "active")}
            aria-pressed={customDate == null && rangeHours === range.hours}
            onClick={() => selectRange(range.hours)}
          >
            {t(range.label as I18nKey)}
          </button>
        ))}
      </div>
      <label className="node-chart-date">
        <span>{t("traffic.startDate")}</span>
        <NieRDatePicker
          value={customDate != null ? fromDateInputValue(customDate) : localDayMs(anchorMs)}
          min={anchorMs - retentionMs}
          max={anchorMs}
          onChange={(ms) => selectDate(ms != null ? pickerToDateInput(ms) : "")}
          onClear={() => selectDate("")}
          ariaLabel={t("traffic.startDate")}
        />
        {beyondRetention && <em>{t("traffic.retention")}</em>}
      </label>
      {!allowed ? (
        <div style={{ color: "var(--fg-mid)", textAlign: "center", padding: "20px 0" }}>
          查看超过 1 天的历史需要登录
        </div>
      ) : samplesQuery.isPending ? (
        <div style={{ padding: "20px 0", textAlign: "center" }}><Spinner size={18} /></div>
      ) : samplesQuery.isError ? (
        <div style={{ color: "var(--fg-mid)", textAlign: "center", padding: "20px 0" }}>
          节点图加载失败{" "}
          <button type="button" onClick={() => void samplesQuery.refetch()}>{t("common.retry")}</button>
        </div>
      ) : !hasSamples ? (
        <div style={{ color: "var(--fg-mid)", textAlign: "center", padding: "20px 0" }}>
          该时间范围内暂无采样数据
        </div>
      ) : (
        <Suspense fallback={<div style={{ padding: "20px 0", textAlign: "center" }}><Spinner size={18} /></div>}>
          <TrafficRateChart samples={samples} live={live} />
        </Suspense>
      )}
    </section>
  );
}

function TrafficDetailToggle({ expanded, onClick }: { expanded: boolean; controlsId: string; onClick: () => void }) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onClick}>
      详情 <span aria-hidden>{expanded ? "▼" : "◀"}</span>
    </button>
  );
}

export function Traffic() {
  const [expandedUuids, setExpandedUuids] = useState<Set<string>>(new Set());
  const toggleExpanded = (uuid: string) => {
    setExpandedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sortField, setSortField] = useState<TrafficSortField>("total");
  const [sortDirection, setSortDirection] = useState<TrafficSortDirection>("desc");
  const now = useMinuteClock();
  // 空闲预取节点图分块：首次点「详情」只显示图表区域加载，不因下载代码而整页闪动。
  useEffect(() => {
    const idle: (cb: () => void, opts?: { timeout: number }) => number =
      (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback ??
      ((cb) => window.setTimeout(cb, 1500));
    const cancel: (handle: number) => void =
      (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback ??
      ((handle) => window.clearTimeout(handle));
    const handle = idle(() => {
      void import("@/components/traffic/TrafficRateChart");
    }, { timeout: 2000 });
    return () => cancel(handle);
  }, []);
  const { t } = useLanguage();
  const { data: me } = useAuth();
  const isMobileLayout = useMediaQuery(TRAFFIC_MOBILE_QUERY);
  const nodes = useVisibleNodes();
  const summaries = useHomeNodeSummaries();
  const uuids = useMemo(() => nodes.map((node) => node.uuid), [nodes]);
  // 实时网速（来自 WebSocket 的当前速率），与历史积分数据并行展示。
  const liveByUuid = useMemo(() => {
    const map = new Map<string, { up: number; down: number }>();
    for (const summary of summaries) {
      map.set(summary.uuid, { up: summary.netUp || 0, down: summary.netDown || 0 });
    }
    return map;
  }, [summaries]);
  // 往期日期：登录站长 13 天（14 天保留）；未登录访客 1 天（后端给 24 小时历史）。
  // 登录态尚未返回时不提前禁用，避免页面刚打开时日历短暂锁死。
  const maxDayOffset = me == null ? 13 : me.logged_in ? 13 : 1;
  const todayStartMs = localDayStart(now);
  // 往期记录通过日历选择：解析选中日期，越界（未来/超出上限）时收敛到允许范围。
  const selectedStartMs = selectedDate ? new Date(`${selectedDate}T00:00:00`).getTime() : todayStartMs;
  const rawOffset = Number.isFinite(selectedStartMs)
    ? Math.round((todayStartMs - selectedStartMs) / DAY_MS)
    : 0;
  const effectiveOffset = Math.max(0, Math.min(rawOffset, maxDayOffset));

  // 访客（已确认未登录）选往期时改用滚动最近 24 小时：后端匿名上限 24h，
  // 按整天窗口会请求 48h 档位被拒绝，整页报错。
  const isRolling24h = me != null && me.logged_in !== true && effectiveOffset > 0;
  const dayStartMs = isRolling24h ? now - DAY_MS : todayStartMs - effectiveOffset * DAY_MS;
  const dayEndMs = isRolling24h ? now : dayStartMs + DAY_MS;

  // 初始只取汇总（summary 模式跳过样本构建），展开某台节点时再按需拉明细。
  const todayQuery = useTodayTrafficStats(uuids, now, "summary");
  // 往期：逐节点拉对应档位历史，按当天窗口积分（与今日同一套口径）。
  const hours = isRolling24h ? 24 : hoursTierForRange(dayStartMs, dayEndMs);
  const pastQueries = useQueries({
    queries: uuids.map((uuid) => ({
      queryKey: ["traffic-day", uuid, dayStartMs],
      queryFn: ({ signal }: { signal: AbortSignal }) => getLoadRecords(uuid, hours, { signal }),
      enabled: effectiveOffset > 0,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });
  const pastData = useMemo(() => {
    if (effectiveOffset === 0) return null;
    const rows: TodayTrafficStat[] = [];
    uuids.forEach((uuid, index) => {
      const records = pastQueries[index]?.data?.records ?? [];
      rows.push(summarizeTodayTrafficRecords(uuid, records, dayStartMs, dayEndMs));
    });
    return { rows, rangeStartMs: dayStartMs, rangeEndMs: dayEndMs };
  }, [dayEndMs, dayStartMs, effectiveOffset, pastQueries, uuids]);

  const data = effectiveOffset === 0 ? todayQuery.data : pastData;
  const isPending = effectiveOffset === 0 ? todayQuery.isPending : pastQueries.some((query) => query.isPending);
  const isError = effectiveOffset === 0 ? todayQuery.isError : pastQueries.some((query) => query.isError);
  const isFetching = effectiveOffset === 0 ? todayQuery.isFetching : pastQueries.some((query) => query.isFetching);
  const refetch = () => {
    clearHistoryCache();
    if (effectiveOffset === 0) void todayQuery.refetch();
    else for (const query of pastQueries) void query.refetch();
  };

  const details = useMemo<TrafficDetail[]>(() => {
    const stats = new Map((data?.rows ?? []).map((row) => [row.uuid, row] as const));
    const base = nodes.map((node) => {
      const stat = stats.get(node.uuid) ?? {
        uuid: node.uuid, trafficUp: 0, trafficDown: 0, peakUp: 0, peakUpAt: null, peakDown: 0, peakDownAt: null, sampleCount: 0, hasSamples: false,
      };
      return { node, stat, total: stat.trafficUp + stat.trafficDown };
    });
    const direction = sortDirection === "asc" ? 1 : -1;
    base.sort((left, right) => {
      if (left.stat.hasSamples !== right.stat.hasSamples) return left.stat.hasSamples ? -1 : 1;
      if (sortField === "name") {
        return left.node.name.localeCompare(right.node.name, "zh-CN") * direction || left.node.weight - right.node.weight;
      }
      const a = sortDetailValue(left, sortField) as number;
      const b = sortDetailValue(right, sortField) as number;
      if (a !== b) return (a - b) * direction;
      return left.node.weight - right.node.weight;
    });
    return base;
  }, [data?.rows, nodes, sortDirection, sortField]);

  const { sampledDetails, totalUp, totalDown, peakUp, peakDown } = useMemo(() => {
    const sampled = details.filter((detail) => detail.stat.hasSamples);
    return {
      sampledDetails: sampled,
      totalUp: sampled.reduce((sum, detail) => sum + detail.stat.trafficUp, 0),
      totalDown: sampled.reduce((sum, detail) => sum + detail.stat.trafficDown, 0),
      peakUp: sampled.reduce<TrafficDetail | null>((best, detail) => (!best || detail.stat.peakUp > best.stat.peakUp ? detail : best), null),
      peakDown: sampled.reduce<TrafficDetail | null>((best, detail) => (!best || detail.stat.peakDown > best.stat.peakDown ? detail : best), null),
    };
  }, [details]);
  const updatedAt = data?.rangeEndMs ?? now;
  const { liveTotalUp, liveTotalDown } = useMemo(() => {
    let up = 0;
    let down = 0;
    for (const live of liveByUuid.values()) {
      up += live.up;
      down += live.down;
    }
    return { liveTotalUp: up, liveTotalDown: down };
  }, [liveByUuid]);
  // 跨节点求和每秒会变好几次，按 1 秒节拍统一换一次（与首页实时带宽同口径）。
  const pacedLive = usePacedRate(liveTotalUp, liveTotalDown);

  const handleSort = (field: TrafficSortField) => {
    if (field === sortField) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection(NATURAL_DIRECTION[field]);
    }
  };
  const directionIcon = sortDirection === "asc" ? "▲" : "▼";

  return (
    <div>
      <div className="page-sticky-bar traffic-topbar">
        <Link className="button" to="/">{t("common.back")}</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <NieRDatePicker
            value={dayStartMs}
            min={todayStartMs - maxDayOffset * DAY_MS}
            max={todayStartMs}
            onChange={(ms) => setSelectedDate(ms != null ? toDateInputValue(ms) : null)}
            ariaLabel={t("traffic.date")}
          />
          <TrafficSortControl field={sortField} direction={sortDirection} onSelect={handleSort} />
          <button type="button" onClick={refetch} disabled={isFetching || nodes.length === 0} aria-busy={isFetching} title={t("common.refresh")}>
            ⟳ {t("common.refresh")}
          </button>
        </div>
      </div>

      <h1 className="bracket-header">{t("title.traffic")}</h1>

      {nodes.length === 0 ? (
        <div className="center-box" style={{ minHeight: "40vh" }}>
          <span style={{ color: "var(--fg-mid)" }}>{t("common.nodata")}</span>
        </div>
      ) : isPending ? (
        <div className="center-box" style={{ minHeight: "40vh" }}>
          <Spinner size={24} />
        </div>
      ) : isError ? (
        <div className="banner error" role="alert">
          &gt; ERROR :: {t("traffic.statsError")}
          <div style={{ marginTop: 8 }}><button type="button" onClick={refetch}>{t("common.retry")}</button></div>
        </div>
      ) : (
        <>
          <div className="traffic-summary-grid">
            <div className="panel inverse panel-corners traffic-summary-card">
              <div className="traffic-summary-head">
                <span>{isRolling24h ? t("traffic.last24h") : t("traffic.today")}</span>
                <span>{!isRolling24h && DAY_FORMATTER.format(dayStartMs)}</span>
              </div>
              {isRolling24h && (
                <p style={{ margin: "0 0 8px", fontSize: 11, opacity: 0.75 }}>
                  {t("traffic.needLogin")}
                </p>
              )}
              <strong className="traffic-summary-total">
                {sampledDetails.length > 0 ? formatBytes(totalUp + totalDown) : "—"}
              </strong>
              <div className="traffic-summary-directions">
                <span>↑ {formatBytes(totalUp)}</span>
                <span>↓ {formatBytes(totalDown)}</span>
              </div>
              <div className="traffic-summary-directions" style={{ marginTop: 6, borderTop: "1px solid rgba(216,209,187,0.15)", paddingTop: 6 }}>
                <span style={{ color: speedRateColor("MB/s") }}>{t("common.realtime")} ↑ {formatByteRateLabel(pacedLive.up)}</span>
                <span style={{ color: speedRateColor("MB/s") }}>↓ {formatByteRateLabel(pacedLive.down)}</span>
              </div>
            </div>

            <div className="panel inverse panel-corners traffic-summary-card">
              <div className="traffic-summary-head">
                <span>{t("traffic.peak")}</span>
                <span>{t("traffic.statTo")} {TIME_FORMATTER.format(updatedAt)}</span>
              </div>
              <div className="traffic-summary-peak-list">
                <PeakSummaryRow direction="up" detail={peakUp} />
                <PeakSummaryRow direction="down" detail={peakDown} />
              </div>
            </div>
          </div>

          <div className="assets-section-head">
            <span className="assets-eyebrow">{t("traffic.nodes")}</span>
            <span className="assets-count">{details.length}</span>
            <span className="traffic-sample-note">{t("traffic.peakNote")}</span>
          </div>

          {!isMobileLayout ? (
            <div className="panel assets-table-wrap">
              <table className="monitor assets-table">
                <thead>
                  <tr>
                    {TRAFFIC_TABLE_COLUMNS.map((column) => (
                      <th key={column.field} data-numeric={column.numeric || undefined} aria-sort={sortField === column.field ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}>
                        <button type="button" onClick={() => handleSort(column.field)} data-active={sortField === column.field}>
                          {t(column.label)}{sortField === column.field && ` ${directionIcon}`}
                        </button>
                      </th>
                    ))}
                    <th data-numeric>{t("traffic.columnLive")}</th>
                    <th data-action>{t("traffic.columnAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map(({ node, stat, total }) => {
                    const expanded = expandedUuids.has(node.uuid);
                    const detailId = `traffic-detail-${node.uuid}`;
                    return (
                      <Fragment key={node.uuid}>
                        <tr>
                          <td>
                            <Link to={`/server/${encodeURIComponent(node.uuid)}`} className="assets-node-link" title={node.name}>
                              <Flag region={node.region} size={12} />
                              <span>{node.name}</span>
                            </Link>
                          </td>
                          <td data-numeric data-strong>
                            {stat.hasSamples ? (
                              <span className="traffic-volume-value">
                                <strong>{formatBytes(total)}</strong>
                                <small>↑ {formatBytes(stat.trafficUp)} · ↓ {formatBytes(stat.trafficDown)}</small>
                              </span>
                            ) : (
                              <span className="traffic-no-data">{t("common.noData")}</span>
                            )}
                          </td>
                          <td data-numeric>{stat.hasSamples ? <PeakValue value={stat.peakUp} timeMs={stat.peakUpAt} /> : "—"}</td>
                          <td data-numeric>{stat.hasSamples ? <PeakValue value={stat.peakDown} timeMs={stat.peakDownAt} /> : "—"}</td>
                          <td data-numeric>
                            <span className="node-list-stack" style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ color: speedRateColor("MB/s") }}>↑ {formatByteRateLabel(liveByUuid.get(node.uuid)?.up)}</span>
                              <span style={{ color: speedRateColor("MB/s") }}>↓ {formatByteRateLabel(liveByUuid.get(node.uuid)?.down)}</span>
                            </span>
                          </td>
                          <td data-action>
                            <TrafficDetailToggle expanded={expanded} controlsId={detailId} onClick={() => toggleExpanded(node.uuid)} />
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={6}><TrafficSamplePanel uuid={node.uuid} live={liveByUuid.get(node.uuid) ?? null} /></td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="assets-card-list">
              {details.map(({ node, stat, total }) => {
                const expanded = expandedUuids.has(node.uuid);
                const detailId = `traffic-mobile-detail-${node.uuid}`;
                return (
                  <div className="panel" key={node.uuid}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Link to={`/server/${encodeURIComponent(node.uuid)}`} className="assets-node-link">
                        <Flag region={node.region} size={12} />
                        <span>{node.name}</span>
                      </Link>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <strong style={{ fontFamily: "var(--font-mono)" }}>{stat.hasSamples ? formatBytes(total) : t("common.noData")}</strong>
                        <TrafficDetailToggle expanded={expanded} controlsId={detailId} onClick={() => toggleExpanded(node.uuid)} />
                      </div>
                    </div>
                    {stat.hasSamples && (
                      <>
                        <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 6 }}>
                          <span>↑ {formatBytes(stat.trafficUp)}</span>
                          <span>↓ {formatBytes(stat.trafficDown)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 2, color: "var(--fg-mid)" }}>
                          <span>{t("common.realtime")} ↑ {formatByteRateLabel(liveByUuid.get(node.uuid)?.up)}</span>
                          <span>↓ {formatByteRateLabel(liveByUuid.get(node.uuid)?.down)}</span>
                        </div>
                        <dl className="kv" style={{ marginTop: 8, gridTemplateColumns: "120px 1fr" }}>
                          <dt>{t("traffic.columnPeakUp")}</dt>
                          <dd><PeakValue value={stat.peakUp} timeMs={stat.peakUpAt} /></dd>
                          <dt>{t("traffic.columnPeakDown")}</dt>
                          <dd><PeakValue value={stat.peakDown} timeMs={stat.peakDownAt} /></dd>
                        </dl>
                      </>
                    )}
                    {expanded && <TrafficSamplePanel uuid={node.uuid} live={liveByUuid.get(node.uuid) ?? null} />}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
