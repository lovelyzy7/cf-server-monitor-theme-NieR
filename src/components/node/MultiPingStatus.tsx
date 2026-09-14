import { memo, useState } from "react";
import { clsx } from "clsx";
import { useMetricColorsVersion } from "@/hooks/useMetricColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useLanguage } from "@/hooks/useLanguage";
import type { HomepagePingDisplayLine } from "@/types/cfsm";
import { latencyHeatColor, lossHeatColor } from "@/utils/metricTone";
import { HealthBucketTooltip } from "./HealthBucketTooltip";
import { LatencyBars } from "./LatencyBars";
import { PingLineSwitcher } from "./PingLineSwitcher";
import { displayCarrierTaskName } from "@/services/cfsm/mappers";
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
  const { t } = useLanguage();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const latencyColor = latencyHeatColor(line.lastValue);
  const lossColor = lossHeatColor(line.loss);
  const isLoading = line.loadState === "pending";
  const isError = line.loadState === "error";
  const staleError = isError && (line.lastValue != null || line.loss != null);
  const latencyLabel = isLoading && line.lastValue == null ? t("common.loading") : isError && line.lastValue == null ? t("common.failed") : line.lastValue == null ? t("card.noSamples") : `${Math.round(line.lastValue)}ms`;
  const lossLabel = isLoading && line.loss == null ? t("common.loading") : isError && line.loss == null ? t("common.failed") : line.loss == null ? "—" : `${line.loss.toFixed(1)}%`;
  const hoveredBucket = hoveredIndex == null ? null : (line.buckets[hoveredIndex] ?? null);
  const tooltip = hoveredBucket ? formatHealthBucketTooltip(hoveredBucket, metric, t) : null;
  const chartHeight = density === "compact" ? 9 : 11;
  const value = metric === "latency" ? line.lastValue : line.loss;
  const valueColor = metric === "latency" ? latencyColor : lossColor;
  const unit = metric === "latency" ? "ms" : "%";
  const waiting = isLoading && value == null;
  const displayValue = waiting ? "..." : isError && value == null ? "!" : value == null ? "—" : metric === "latency" ? Math.round(value) : value.toFixed(1);

  return (
    <div
      className="multi-ping-metric-row"
      data-nier-suppress-label
      data-load-state={line.loadState ?? "ready"}
      aria-label={`${displayCarrierTaskName(line.taskName, t)} · ${t("ping.latency")} ${latencyLabel} · ${t("ping.loss")} ${lossLabel}${staleError ? ` · ${t("card.homePing.refreshFail")}` : ""}`}
    >
      <div className={clsx("multi-ping-metric-head", metric === "loss" && "is-value-only")}>
        {metric === "latency" && <PingLineSwitcher uuid={uuid} slot={slot} taskName={line.taskName} />}
        {metric === "loss" && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)", letterSpacing: "0.04em" }}>{t("ping.loss")}</span>}
        <strong
          className="multi-ping-value tabular"
          style={{ color: value == null ? "var(--fg-mid)" : valueColor }}
        >
          {displayValue}
          {value != null && <small>{unit}</small>}
        </strong>
      </div>
      <span className="multi-ping-buckets">
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
  const { t } = useLanguage();
  return (
    <div className="multi-ping-metric-column" aria-label={metric === "latency" ? t("ping.latency") : t("ping.loss")}>
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
  const { t } = useLanguage();
  const { resolvedAppearance } = usePreferences();
  const colorsVersion = useMetricColorsVersion();
  const redrawKey = `${resolvedAppearance}:${colorsVersion}`;

  return (
    <div className={clsx("multi-ping-status", className)} role="group" aria-label={t("card.lines")} data-nier-suppress-label>
      <div className="multi-ping-columns">
        <MultiPingMetricColumn uuid={uuid} lines={lines} metric="latency" density={density} redrawKey={redrawKey} />
        <MultiPingMetricColumn uuid={uuid} lines={lines} metric="loss" density={density} redrawKey={redrawKey} />
      </div>
    </div>
  );
});
