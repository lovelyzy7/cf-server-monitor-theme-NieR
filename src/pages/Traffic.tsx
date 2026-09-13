import { Fragment, Suspense, lazy, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flag } from "@/components/ui/Flag";
import { Spinner } from "@/components/ui/Spinner";
import { useMinuteClock } from "@/hooks/useClock";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTodayTrafficStats } from "@/hooks/useTodayTrafficStats";
import { useVisibleNodes } from "@/hooks/useVisibleNodes";
import { useLanguage } from "@/hooks/useLanguage";
import { formatByteRateLabel, formatBytes } from "@/utils/format";
import type { NodeInfo } from "@/types/cfsm";
import type { TodayTrafficSample, TodayTrafficStat } from "@/utils/trafficStats";

const DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" });
const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const TRAFFIC_MOBILE_QUERY = "(max-width: 720px)";

const TrafficRateChart = lazy(() =>
  import("@/components/traffic/TrafficRateChart").then((module) => ({ default: module.TrafficRateChart })),
);

interface TrafficDetail {
  node: NodeInfo;
  stat: TodayTrafficStat;
  total: number;
}

function formatPeakTime(timeMs: number | null, value: number) {
  return timeMs != null && value > 0 ? TIME_FORMATTER.format(timeMs) : "—";
}

function PeakValue({ value, timeMs }: { value: number; timeMs: number | null }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)" }}>
      <strong>{formatByteRateLabel(value)}</strong>
      <small style={{ marginLeft: 6, color: "var(--fg-mid)" }}>{formatPeakTime(timeMs, value)}</small>
    </span>
  );
}

function PeakSummaryRow({ direction, detail }: { direction: "up" | "down"; detail: TrafficDetail | null }) {
  const value = direction === "up" ? detail?.stat.peakUp ?? 0 : detail?.stat.peakDown ?? 0;
  const timeMs = direction === "up" ? detail?.stat.peakUpAt ?? null : detail?.stat.peakDownAt ?? null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ color: "var(--fg-mid)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {direction === "up" ? "↑ 上行" : "↓ 下行"}
      </span>
      <span style={{ fontFamily: "var(--font-mono)" }}>
        <strong>{detail ? formatByteRateLabel(value) : "—"}</strong>
        <small style={{ marginLeft: 6, color: "var(--fg-mid)" }}>
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
    <section id={id} className="panel" aria-label="本日网络上下行明细" style={{ marginTop: 8 }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <strong style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 13 }}>本日网络上下行</strong>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)" }}>{samples.length} 个采样</span>
      </header>
      {samples.length === 0 ? (
        <div style={{ color: "var(--fg-mid)", textAlign: "center", padding: "20px 0" }}>本日暂无速率采样</div>
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
  const now = useMinuteClock();
  const { t } = useLanguage();
  const isMobileLayout = useMediaQuery(TRAFFIC_MOBILE_QUERY);
  const nodes = useVisibleNodes();
  const uuids = useMemo(() => nodes.map((node) => node.uuid), [nodes]);
  const trafficQuery = useTodayTrafficStats(uuids, now);
  const details = useMemo<TrafficDetail[]>(() => {
    const stats = new Map(trafficQuery.data?.rows.map((row) => [row.uuid, row] as const));
    return nodes
      .map((node) => {
        const stat = stats.get(node.uuid) ?? {
          uuid: node.uuid, trafficUp: 0, trafficDown: 0, peakUp: 0, peakUpAt: null, peakDown: 0, peakDownAt: null, sampleCount: 0, hasSamples: false,
        };
        return { node, stat, total: stat.trafficUp + stat.trafficDown };
      })
      .sort(
        (left, right) =>
          Number(right.stat.hasSamples) - Number(left.stat.hasSamples) ||
          right.total - left.total ||
          left.node.weight - right.node.weight,
      );
  }, [nodes, trafficQuery.data?.rows]);
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
  const updatedAt = trafficQuery.data?.rangeEndMs ?? now;

  return (
    <div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link className="button" to="/">{t("common.back")}</Link>
        <button type="button" onClick={() => void trafficQuery.refetch()} disabled={trafficQuery.isFetching || nodes.length === 0} aria-busy={trafficQuery.isFetching} title={t("common.refresh")}>
          ⟳ {t("common.refresh")}
        </button>
      </div>

      <h1 className="bracket-header">{t("title.traffic")}</h1>

      {nodes.length === 0 ? (
        <div className="center-box" style={{ minHeight: "40vh" }}>
          <span style={{ color: "var(--fg-mid)" }}>{t("common.nodata")}</span>
        </div>
      ) : trafficQuery.isPending ? (
        <div className="center-box" style={{ minHeight: "40vh" }}>
          <Spinner size={24} />
        </div>
      ) : trafficQuery.isError ? (
        <div className="banner error" role="alert">
          &gt; ERROR :: 无法读取今日流量统计
          <div style={{ marginTop: 8 }}><button type="button" onClick={() => void trafficQuery.refetch()}>重新加载</button></div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
            <div className="panel inverse panel-corners">
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.8 }}>
                <span>今日流量</span>
                <span>{DAY_FORMATTER.format(now)}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, margin: "8px 0", fontVariantNumeric: "tabular-nums" }}>
                {sampledDetails.length > 0 ? formatBytes(totalUp + totalDown) : "—"}
              </div>
              <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <span>↑ {formatBytes(totalUp)}</span>
                <span>↓ {formatBytes(totalDown)}</span>
              </div>
            </div>

            <div className="panel inverse panel-corners">
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.8 }}>
                <span>今日采样峰值</span>
                <span>统计至 {TIME_FORMATTER.format(updatedAt)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <PeakSummaryRow direction="up" detail={peakUp} />
                <PeakSummaryRow direction="down" detail={peakDown} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 20, marginBottom: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--fg-mid)" }}>节点明细</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)" }}>{details.length} 台</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)" }}>峰值按历史采样计算</span>
          </div>

          {!isMobileLayout ? (
            <div className="panel" style={{ overflowX: "auto" }}>
              <table className="monitor">
                <thead>
                  <tr>
                    <th>节点</th>
                    <th data-numeric>今日流量</th>
                    <th data-numeric>上行峰值</th>
                    <th data-numeric>下行峰值</th>
                    <th data-action>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map(({ node, stat, total }) => {
                    const expanded = expandedUuid === node.uuid;
                    const detailId = `traffic-detail-${node.uuid}`;
                    const samples = trafficQuery.data?.samplesByUuid[node.uuid] ?? [];
                    return (
                      <Fragment key={node.uuid}>
                        <tr>
                          <td>
                            <Link to={`/server/${encodeURIComponent(node.uuid)}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }} title={node.name}>
                              <Flag region={node.region} size={12} />
                              <span>{node.name}</span>
                            </Link>
                          </td>
                          <td data-numeric data-strong>
                            {stat.hasSamples ? (
                              <span style={{ fontFamily: "var(--font-mono)" }}>
                                <strong>{formatBytes(total)}</strong>
                                <small style={{ marginLeft: 6, color: "var(--fg-mid)" }}>↑ {formatBytes(stat.trafficUp)} · ↓ {formatBytes(stat.trafficDown)}</small>
                              </span>
                            ) : (
                              <span style={{ color: "var(--fg-mid)" }}>无数据</span>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {details.map(({ node, stat, total }) => {
                const expanded = expandedUuid === node.uuid;
                const detailId = `traffic-mobile-detail-${node.uuid}`;
                const samples = trafficQuery.data?.samplesByUuid[node.uuid] ?? [];
                return (
                  <div className="panel" key={node.uuid}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Link to={`/server/${encodeURIComponent(node.uuid)}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
