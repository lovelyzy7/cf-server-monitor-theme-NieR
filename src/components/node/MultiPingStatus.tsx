import { memo, useState } from "react";
import { clsx } from "clsx";
import { useMetricColorsVersion } from "@/hooks/useMetricColors";
import { usePreferences } from "@/hooks/usePreferences";
import type { HomepagePingDisplayLine } from "@/types/cfsm";
import { latencyHeatColor, lossHeatColor } from "@/utils/metricTone";
import { HealthBucketTooltip } from "./HealthBucketTooltip";
import { LatencyBars } from "./LatencyBars";
import { PingLineSwitcher } from "./PingLineSwitcher";
import { QualityBars } from "./QualityBars";
import { formatHealthBucketTooltip } from "./pingBucketText";

type MultiPingStatusDensity = "large" | "compact";
type MultiPingMetric = "latency" | "loss";

const MultiPingMetricRow = memo(function MultiPingMetricRow({
  uuid, slot, line, metric, density, redrawKey,
}: {
  uuid: string;
  slot: number;
  line: HomepagePingDisplayLine;
  metric: MultiPingMetric;
  density: MultiPingStatusDensity;
  redrawKey: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const latencyColor = latencyHeatColor(line.lastValue);
  const lossColor = lossHeatColor(line.loss);
  const isLoading = line.loadState === "pending";
  const isError = line.loadState === "error";
  const staleError = isError && (line.lastValue != null || line.loss != null);
  const latencyLabel = isLoading && line.lastValue == null ? "加载中" : isError && line.lastValue == null ? "加载失败" : line.lastValue == null ? "无样本" : `${Math.round(line.lastValue)}ms`;
  const lossLabel = isLoading && line.loss == null ? "加载中" : isError && line.loss == null ? "加载失败" : line.loss == null ? "—" : `${line.loss.toFixed(1)}%`;
  const hoveredBucket = hoveredIndex == null ? null : (line.buckets[hoveredIndex] ?? null);
  const tooltip = hoveredBucket ? formatHealthBucketTooltip(hoveredBucket, metric) : null;
  const chartHeight = density === "compact" ? 9 : 11;
  const value = metric === "latency" ? line.lastValue : line.loss;
  const valueColor = metric === "latency" ? latencyColor : lossColor;
  const unit = metric === "latency" ? "ms" : "%";
  const waiting = isLoading && value == null;
  const displayValue = waiting ? "..." : isError && value == null ? "!" : value == null ? "—" : metric === "latency" ? Math.round(value) : value.toFixed(1);

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 18 }}
      title={`${line.taskName} · 延迟 ${latencyLabel} · 丢包 ${lossLabel}${staleError ? " · 刷新失败，显示上次数据" : ""}`}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, width: 92, flexShrink: 0, justifyContent: "space-between" }}>
        {metric === "latency" && <PingLineSwitcher uuid={uuid} slot={slot} taskName={line.taskName} />}
        {metric === "loss" && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.04em" }}>丢包</span>}
        <strong
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            color: value == null ? "var(--fg-mid)" : valueColor,
          }}
        >
          {displayValue}
          {value != null && <small style={{ fontSize: 10, opacity: 0.7 }}>{unit}</small>}
        </strong>
      </div>
      <span style={{ flex: 1, position: "relative" }}>
        {metric === "latency" ? (
          <LatencyBars buckets={line.buckets} redrawKey={redrawKey} height={chartHeight} onHoverIndex={setHoveredIndex} />
        ) : (
          <QualityBars buckets={line.buckets} redrawKey={redrawKey} height={chartHeight} onHoverIndex={setHoveredIndex} />
        )}
        <HealthBucketTooltip text={tooltip} index={hoveredIndex} count={line.buckets.length} />
      </span>
    </div>
  );
});

const MultiPingMetricColumn = memo(function MultiPingMetricColumn({
  uuid, lines, metric, density, redrawKey,
}: {
  uuid: string;
  lines: HomepagePingDisplayLine[];
  metric: MultiPingMetric;
  density: MultiPingStatusDensity;
  redrawKey: string;
}) {
  return (
    <div aria-label={metric === "latency" ? "延迟" : "丢包"} style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
      {lines.map((line, slot) => (
        <MultiPingMetricRow key={slot} uuid={uuid} slot={slot} line={line} metric={metric} density={density} redrawKey={redrawKey} />
      ))}
    </div>
  );
});

export const MultiPingStatus = memo(function MultiPingStatus({
  uuid, lines, density, className,
}: {
  uuid: string;
  lines: HomepagePingDisplayLine[];
  density: MultiPingStatusDensity;
  className?: string;
}) {
  const { resolvedAppearance } = usePreferences();
  const colorsVersion = useMetricColorsVersion();
  const redrawKey = `${resolvedAppearance}:${colorsVersion}`;

  return (
    <div className={clsx("multi-ping-status", className)} role="group" aria-label="各线路延迟与丢包" style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <MultiPingMetricColumn uuid={uuid} lines={lines} metric="latency" density={density} redrawKey={redrawKey} />
        <MultiPingMetricColumn uuid={uuid} lines={lines} metric="loss" density={density} redrawKey={redrawKey} />
      </div>
    </div>
  );
});
