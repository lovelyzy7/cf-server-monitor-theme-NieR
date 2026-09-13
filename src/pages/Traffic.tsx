import { Fragment, Suspense, lazy, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { Spinner } from "@/components/ui/Spinner";
import { useMinuteClock } from "@/hooks/useClock";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTodayTrafficStats } from "@/hooks/useTodayTrafficStats";
import { useVisibleNodes } from "@/hooks/useVisibleNodes";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { getLoadRecords } from "@/services/api";
import { formatByteRateLabel, formatBytes } from "@/utils/format";
import {
  buildTodayTrafficRecordSamples,
  summarizeTodayTrafficRecords,
  type TodayTrafficSample,
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

const TRAFFIC_TABLE_COLUMNS: Array<{ field: TrafficSortField; label: string; numeric?: boolean }> = [
  { field: "name", label: "节点" },
  { field: "total", label: "当日流量", numeric: true },
  { field: "peakUp", label: "上行峰值", numeric: true },
  { field: "peakDown", label: "下行峰值", numeric: true },
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
  const tiers = [24, 48, 96, 168];
  return tiers.find((hours) => hours >= elapsedHours) ?? 168;
}

function sortDetailValue(detail: TrafficDetail, field: TrafficSortField): number | string {
  switch (field) {
    case "name": return detail.node.name;
    case "total": return detail.total;
    case "peakUp": return detail.stat.peakUp;
    case "peakDown": return detail.stat.peakDown;
  }
}

function formatPeakTime(timeMs: number | null, value: number) {
  return timeMs != null && value > 0 ? TIME_FORMATTER.format(timeMs) : "—";
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
  const value = direction === "up" ? detail?.stat.peakUp ?? 0 : detail?.stat.peakDown ?? 0;
  const timeMs = direction === "up" ? detail?.stat.peakUpAt ?? null : detail?.stat.peakDownAt ?? null;
  return (
    <div className="traffic-summary-peak-row">
      <span className="traffic-summary-peak-label">
        {direction === "up" ? "↑ 上行" : "↓ 下行"}
      </span>
      <span className="traffic-summary-peak-main">
        <strong>{detail ? formatByteRateLabel(value) : "—"}</strong>
        <small>
          {detail && value > 0 ? `${detail.node.name} · ${formatPeakTime(timeMs, value)}` : "暂无峰值"}
        </small>
      </span>
    </div>
  );
}

function TrafficDetailToggle({ expanded, onClick }: { expanded: boolean; controlsId: string; onClick: () => void }) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onClick}>
      详情 <span aria-hidden>▾</span>
    </button>
  );
}

function TrafficSampleChart({ id, samples }: { id: string; samples: TodayTrafficSample[] }) {
  return (
    <section id={id} className="panel" aria-label="网络上下行明细" style={{ marginTop: 8 }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <strong style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 13 }}>当日网络上下行</strong>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)" }}>{samples.length} 个采样</span>
      </header>
      {samples.length === 0 ? (
        <div style={{ color: "var(--fg-mid)", textAlign: "center", padding: "20px 0" }}>当日暂无速率采样</div>
      ) : (
        <Suspense fallback={<div style={{ padding: "20px 0", textAlign: "center" }}><Spinner size={18} /></div>}>
          <TrafficRateChart samples={samples} />
        </Suspense>
      )}
    </section>
  );
}

export function Traffic() {
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [sortField, setSortField] = useState<TrafficSortField>("total");
  const [sortDirection, setSortDirection] = useState<TrafficSortDirection>("desc");
  const now = useMinuteClock();
  const { t } = useLanguage();
  const { data: me } = useAuth();
  const isMobileLayout = useMediaQuery(TRAFFIC_MOBILE_QUERY);
  const nodes = useVisibleNodes();
  const uuids = useMemo(() => nodes.map((node) => node.uuid), [nodes]);
  // 未登录访客查不了超过 24 小时的历史，往期只给登录用户。
  const maxDayOffset = me?.logged_in ? 6 : 0;
  const effectiveOffset = Math.min(dayOffset, maxDayOffset);

  const dayStartMs = localDayStart(now) - effectiveOffset * DAY_MS;
  const dayEndMs = dayStartMs + DAY_MS;

  const todayQuery = useTodayTrafficStats(uuids, now);
  // 往期：逐节点拉对应档位历史，按当天窗口积分（与今日同一套口径）。
  const hours = hoursTierForRange(dayStartMs, dayEndMs);
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
    const samplesByUuid: Record<string, TodayTrafficSample[]> = {};
    uuids.forEach((uuid, index) => {
      const records = pastQueries[index]?.data?.records ?? [];
      rows.push(summarizeTodayTrafficRecords(uuid, records, dayStartMs, dayEndMs));
      samplesByUuid[uuid] = buildTodayTrafficRecordSamples(records, dayStartMs, dayEndMs);
    });
    return { rows, samplesByUuid, rangeStartMs: dayStartMs, rangeEndMs: dayEndMs };
  }, [dayEndMs, dayStartMs, effectiveOffset, pastQueries, uuids]);

  const data = effectiveOffset === 0 ? todayQuery.data : pastData;
  const isPending = effectiveOffset === 0 ? todayQuery.isPending : pastQueries.some((query) => query.isPending);
  const isError = effectiveOffset === 0 ? todayQuery.isError : pastQueries.some((query) => query.isError);
  const isFetching = effectiveOffset === 0 ? todayQuery.isFetching : pastQueries.some((query) => query.isFetching);
  const refetch = () => {
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
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link className="button" to="/">{t("common.back")}</Link>
        <button type="button" onClick={refetch} disabled={isFetching || nodes.length === 0} aria-busy={isFetching} title={t("common.refresh")}>
          ⟳ {t("common.refresh")}
        </button>
      </div>

      <h1 className="bracket-header">{t("title.traffic")}</h1>

      <div className="tab-bar" style={{ marginTop: 8 }}>
        {Array.from({ length: maxDayOffset + 1 }, (_, offset) => (
          <button
            key={offset}
            type="button"
            className={clsx("tab-btn", effectiveOffset === offset && "active")}
            aria-pressed={effectiveOffset === offset}
            onClick={() => setDayOffset(offset)}
          >
            {offset === 0 ? "今天" : offset === 1 ? "昨天" : `${offset} 天前`}
          </button>
        ))}
      </div>

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
          &gt; ERROR :: 无法读取流量统计
          <div style={{ marginTop: 8 }}><button type="button" onClick={refetch}>{t("common.retry")}</button></div>
        </div>
      ) : (
        <>
          <div className="traffic-summary-grid">
            <div className="panel inverse panel-corners traffic-summary-card">
              <div className="traffic-summary-head">
                <span>当日流量</span>
                <span>{DAY_FORMATTER.format(dayStartMs)}</span>
              </div>
              <strong className="traffic-summary-total">
                {sampledDetails.length > 0 ? formatBytes(totalUp + totalDown) : "—"}
              </strong>
              <div className="traffic-summary-directions">
                <span>↑ {formatBytes(totalUp)}</span>
                <span>↓ {formatBytes(totalDown)}</span>
              </div>
            </div>

            <div className="panel inverse panel-corners traffic-summary-card">
              <div className="traffic-summary-head">
                <span>当日采样峰值</span>
                <span>统计至 {TIME_FORMATTER.format(updatedAt)}</span>
              </div>
              <div className="traffic-summary-peak-list">
                <PeakSummaryRow direction="up" detail={peakUp} />
                <PeakSummaryRow direction="down" detail={peakDown} />
              </div>
            </div>
          </div>

          <div className="assets-section-head">
            <span className="assets-eyebrow">节点明细</span>
            <span className="assets-count">{details.length} 台</span>
            <span className="traffic-sample-note">峰值按历史采样计算</span>
          </div>

          {!isMobileLayout ? (
            <div className="panel assets-table-wrap">
              <table className="monitor assets-table">
                <thead>
                  <tr>
                    {TRAFFIC_TABLE_COLUMNS.map((column) => (
                      <th key={column.field} data-numeric={column.numeric || undefined} aria-sort={sortField === column.field ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}>
                        <button type="button" onClick={() => handleSort(column.field)} data-active={sortField === column.field}>
                          {column.label}{sortField === column.field && ` ${directionIcon}`}
                        </button>
                      </th>
                    ))}
                    <th data-action>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map(({ node, stat, total }) => {
                    const expanded = expandedUuid === node.uuid;
                    const detailId = `traffic-detail-${node.uuid}`;
                    const samples = (effectiveOffset === 0 ? todayQuery.data?.samplesByUuid : pastData?.samplesByUuid)?.[node.uuid] ?? [];
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
                              <span className="traffic-no-data">无数据</span>
                            )}
                          </td>
                          <td data-numeric>{stat.hasSamples ? <PeakValue value={stat.peakUp} timeMs={stat.peakUpAt} /> : "—"}</td>
                          <td data-numeric>{stat.hasSamples ? <PeakValue value={stat.peakDown} timeMs={stat.peakDownAt} /> : "—"}</td>
                          <td data-action>
                            <TrafficDetailToggle expanded={expanded} controlsId={detailId} onClick={() => setExpandedUuid(expanded ? null : node.uuid)} />
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={5}><TrafficSampleChart id={detailId} samples={samples} /></td>
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
                const expanded = expandedUuid === node.uuid;
                const detailId = `traffic-mobile-detail-${node.uuid}`;
                const samples = (effectiveOffset === 0 ? todayQuery.data?.samplesByUuid : pastData?.samplesByUuid)?.[node.uuid] ?? [];
                return (
                  <div className="panel" key={node.uuid}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Link to={`/server/${encodeURIComponent(node.uuid)}`} className="assets-node-link">
                        <Flag region={node.region} size={12} />
                        <span>{node.name}</span>
                      </Link>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <strong style={{ fontFamily: "var(--font-mono)" }}>{stat.hasSamples ? formatBytes(total) : "无数据"}</strong>
                        <TrafficDetailToggle expanded={expanded} controlsId={detailId} onClick={() => setExpandedUuid(expanded ? null : node.uuid)} />
                      </div>
                    </div>
                    {stat.hasSamples && (
                      <>
                        <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 6 }}>
                          <span>↑ {formatBytes(stat.trafficUp)}</span>
                          <span>↓ {formatBytes(stat.trafficDown)}</span>
                        </div>
                        <dl className="kv" style={{ marginTop: 8, gridTemplateColumns: "120px 1fr" }}>
                          <dt>上行峰值</dt>
                          <dd><PeakValue value={stat.peakUp} timeMs={stat.peakUpAt} /></dd>
                          <dt>下行峰值</dt>
                          <dd><PeakValue value={stat.peakDown} timeMs={stat.peakDownAt} /></dd>
                        </dl>
                      </>
                    )}
                    {expanded && <TrafficSampleChart id={detailId} samples={samples} />}
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
