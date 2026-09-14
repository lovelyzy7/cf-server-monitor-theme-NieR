import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { IpStackBadges } from "./IpStackBadges";
import { HealthBucketTooltip } from "./HealthBucketTooltip";
import { resolveTouchBucketIndex, TOUCH_BUCKET_HOLD_MS } from "./touchBucketPick";
import { useNodeCardModel } from "@/hooks/useNodeCardModel";
import { useNieRHoverLabel } from "@/components/ui/NieRHoverLabel";
import { useLanguage } from "@/hooks/useLanguage";
import { HOMEPAGE_PING_BUCKET_COUNT } from "@/hooks/usePingOverview";
import { speedRateColor } from "@/utils/metricTone";
import { supportsFineHover } from "@/utils/mediaQuery";
import {
  healthBarSlotModel,
  joinTagTitle,
  nodeDetailLinkLabels,
  pingEmptyLabels,
} from "./nodeCardShared";
import { formatHealthBucketTooltip } from "./pingBucketText";
import { formatBytes, type ByteRateDisplay } from "@/utils/format";
import type { NodeInfo, NodeMetrics, PingOverviewItem, PingOverviewBucket } from "@/types/cfsm";

type MiniNode = NodeInfo & NodeMetrics;
type MiniTag = { label: string; color: string };

function MiniHeader({ node, osName }: { node: MiniNode; osName: string }) {
  const { t } = useLanguage();
  const detailLabels = nodeDetailLinkLabels(node.name, osName, t);
  const detailHref = `/server/${encodeURIComponent(node.uuid)}`;
  return (
    <header className="mini-node-header">
      <Flag region={node.region} size={14} />
      <Link to={detailHref} className="mini-node-title">
        {node.name}
      </Link>
      <Link to={detailHref} className="mini-node-os" aria-label={detailLabels.ariaLabel}>
        <OsLogo value={node.os} size={14} />
      </Link>
    </header>
  );
}

function MiniChips({ tags, ipv4, ipv6 }: { tags: MiniTag[]; ipv4?: string | null; ipv6?: string | null }) {
  if (tags.length === 0 && !ipv4 && !ipv6) return null;
  const tagTitle = joinTagTitle(tags);
  return (
    <div className="mini-node-chip-row">
      <IpStackBadges ipv4={ipv4} ipv6={ipv6} />
      {tags.length > 0 && (
        <div className="mini-node-tag-lane" title={tagTitle}>
          {tags.map((tag, index) => (
            <span key={`${tag.label}-${index}`} className="mini-node-tag" data-tag={tag.color}>
              {tag.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type MiniMetricStyle = CSSProperties & { "--mini-metric-fill": string; "--mini-metric-color": string };

function MiniMetricBar({
  icon,
  label,
  valueText,
  unit,
  detail,
  fraction,
  paint,
}: {
  icon: ReactNode;
  label: string;
  valueText: string;
  unit?: string;
  detail?: string;
  fraction: number;
  paint: string;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const fullValue = `${valueText}${unit ?? ""}`;
  const style: MiniMetricStyle = {
    "--mini-metric-fill": `${clamped * 100}%`,
    "--mini-metric-color": paint,
  };
  return (
    <div className="metric-item">
      <div className="mini-metric-head">
        <span className="mini-metric-label">
          {icon}
          {label}
        </span>
        <span className="mini-metric-value tabular" title={`${label} ${fullValue}${detail ? ` · ${detail}` : ""}`}>
          <strong>{valueText}</strong>
          {unit && <small>{unit}</small>}
          {detail && <small className="mini-metric-detail">{detail}</small>}
        </span>
      </div>
      <span className="mini-metric-track" style={style} aria-hidden />
    </div>
  );
}

function MiniVitals({ node, loadFraction }: { node: MiniNode; loadFraction: number }) {
  const { t } = useLanguage();
  return (
    <div className="mini-node-vitals">
      <MiniMetricBar icon={<span aria-hidden>▣</span>} label="CPU" valueText={node.cpuPct.toFixed(node.cpuPct >= 10 ? 0 : 1)} unit="%" detail={`${node.cpu_cores || 0} ${t("common.cores")}`} fraction={node.cpuPct / 100} paint="var(--progress-cpu)" />
      <MiniMetricBar icon={<span aria-hidden>▤</span>} label={t("card.mem")} valueText={node.ramPct.toFixed(node.ramPct >= 10 ? 0 : 1)} unit="%" detail={`${formatBytes(node.ramUsed)} / ${formatBytes(node.ramTotal)}`} fraction={node.ramPct / 100} paint="var(--progress-memory)" />
      <MiniMetricBar icon={<span aria-hidden>▤</span>} label="Swap" valueText={node.swapTotal > 0 ? ((node.swapUsed / node.swapTotal) * 100).toFixed(node.swapUsed / node.swapTotal >= 10 ? 0 : 1) : "0"} unit="%" detail={node.swapTotal > 0 ? `${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}` : t("common.unconfigured")} fraction={node.swapTotal > 0 ? node.swapUsed / node.swapTotal : 0} paint="var(--progress-swap)" />
      <MiniMetricBar icon={<span aria-hidden>◫</span>} label={t("card.disk")} valueText={node.diskPct.toFixed(node.diskPct >= 10 ? 0 : 1)} unit="%" detail={`${formatBytes(node.diskUsed)} / ${formatBytes(node.diskTotal)}`} fraction={node.diskPct / 100} paint="var(--progress-disk)" />
      <MiniMetricBar icon={<span aria-hidden>≋</span>} label={t("card.load")} valueText={node.load1.toFixed(2)} fraction={loadFraction} paint="var(--progress-load)" />
    </div>
  );
}

function MiniFlowRow({
  icon,
  value,
  unit,
  color,
  title,
}: {
  icon: ReactNode;
  value: string;
  unit?: string;
  color?: string;
  title: string;
}) {
  return (
    <span className="mini-node-flow-row" style={color ? { color } : undefined} title={title} aria-label={`${title} ${value}${unit ?? ""}`}>
      <span aria-hidden>{icon}</span>
      <strong className="tabular">
        {value}
        {unit && <small>{unit}</small>}
      </strong>
    </span>
  );
}

function MiniFlow({ node, upRate, downRate }: { node: MiniNode; upRate: ByteRateDisplay; downRate: ByteRateDisplay }) {
  const { t } = useLanguage();
  return (
    <div className="mini-node-flow">
      <div className="mini-node-flow-group" aria-label={t("card.liveRate")}>
        <MiniFlowRow icon="↑" value={upRate.value} unit={upRate.unit} color={speedRateColor(upRate.unit)} title={t("card.liveUp")} />
        <MiniFlowRow icon="↓" value={downRate.value} unit={downRate.unit} color={speedRateColor(downRate.unit)} title={t("card.liveDown")} />
      </div>
      <div className="mini-node-flow-group" aria-label={t("card.totalTraffic")}>
        <MiniFlowRow icon="↑" value={formatBytes(node.trafficUp)} title={t("card.cumUp")} />
        <MiniFlowRow icon="↓" value={formatBytes(node.trafficDown)} title={t("card.cumDown")} />
      </div>
    </div>
  );
}

function MiniHealthBars({ buckets, kind }: { buckets: PingOverviewBucket[]; kind: "latency" | "loss" }) {
  const { t } = useLanguage();
  const width = Math.max(1, buckets.length * 4 - 1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const touchHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredBucket = hoveredIndex == null ? null : (buckets[hoveredIndex] ?? null);
  const tooltip = hoveredBucket ? formatHealthBucketTooltip(hoveredBucket, kind, t) : null;

  useEffect(
    () => () => {
      if (touchHoldTimerRef.current != null) clearTimeout(touchHoldTimerRef.current);
    },
    [],
  );

  const pickIndex = (clientX: number, rect: DOMRect) =>
    setHoveredIndex(resolveTouchBucketIndex(clientX, rect, buckets.length));

  const handleTouchPick = (clientX: number, rect: DOMRect) => {
    pickIndex(clientX, rect);
    if (touchHoldTimerRef.current != null) clearTimeout(touchHoldTimerRef.current);
    touchHoldTimerRef.current = setTimeout(() => {
      touchHoldTimerRef.current = null;
      setHoveredIndex(null);
    }, TOUCH_BUCKET_HOLD_MS);
  };

  return (
    <div className="mini-health-chart-wrap">
      <svg
        className="mini-health-bars"
        viewBox={`0 0 ${width} 16`}
        preserveAspectRatio="none"
        aria-hidden
        onPointerDown={(event) => {
          if (supportsFineHover(event.pointerType)) return;
          handleTouchPick(event.clientX, event.currentTarget.getBoundingClientRect());
        }}
        onPointerMove={(event) => {
          if (!supportsFineHover(event.pointerType)) {
            if (event.buttons !== 0) handleTouchPick(event.clientX, event.currentTarget.getBoundingClientRect());
            return;
          }
          pickIndex(event.clientX, event.currentTarget.getBoundingClientRect());
        }}
        onPointerLeave={() => {
          if (touchHoldTimerRef.current != null) return;
          setHoveredIndex(null);
        }}
      >
        {buckets.map((bucket, index) => {
          const slot = healthBarSlotModel(bucket, kind);
          const barHeight = 16 * slot.heightFraction;
          return (
            <rect
              key={bucket.index}
              x={index * 4}
              y={16 - barHeight}
              width="3"
              height={barHeight}
              rx="0"
              fill={slot.color}
              opacity={slot.alpha}
            />
          );
        })}
      </svg>
      <HealthBucketTooltip text={tooltip} index={hoveredIndex} count={buckets.length} />
    </div>
  );
}

const MiniHealth = memo(function MiniHealth({
  ping,
  pingBuckets,
  latencyColor,
  lossColor,
  hasRealHomepagePingBinding,
  pingLoading,
  pingError,
}: {
  ping: PingOverviewItem;
  pingBuckets: PingOverviewBucket[];
  latencyColor: string;
  lossColor: string;
  hasRealHomepagePingBinding: boolean;
  pingLoading: boolean;
  pingError: boolean;
}) {
  const { t } = useLanguage();
  const { text: emptyText } = pingEmptyLabels(hasRealHomepagePingBinding, t, pingLoading, pingError);
  return (
    <div
      className="mini-node-health"
      data-ping-state={ping.loadState ?? "ready"}
      data-nier-suppress-label
    >
      <div className="mini-node-health-item">
        <div className="mini-node-health-head">
          <span className="mini-node-health-label">
            <span aria-hidden>◔</span>
            {t("ping.latency")}
          </span>
          <strong className="mini-node-health-value tabular" style={{ color: latencyColor }}>
            {ping.lastValue != null ? (
              <>
                {Math.round(ping.lastValue)}
                <small>ms</small>
              </>
            ) : (
              <span className="mini-node-health-empty">{emptyText}</span>
            )}
          </strong>
        </div>
        <MiniHealthBars kind="latency" buckets={pingBuckets} />
      </div>
      <div className="mini-node-health-item">
        <div className="mini-node-health-head">
          <span className="mini-node-health-label">
            <span aria-hidden>⊘</span>
            {t("ping.loss")}
          </span>
          <strong className="mini-node-health-value tabular" style={{ color: lossColor }}>
            {ping.loss != null ? (
              <>
                {ping.loss.toFixed(1)}
                <small>%</small>
              </>
            ) : (
              <span className="mini-node-health-empty">{emptyText}</span>
            )}
          </strong>
        </div>
        <MiniHealthBars kind="loss" buckets={pingBuckets} />
      </div>
    </div>
  );
});

export const MiniNodeCard = memo(function MiniNodeCard({ uuid }: { uuid: string }) {
  const { t } = useLanguage();
  const hoverLabel = useNieRHoverLabel();
  const model = useNodeCardModel(uuid, { pingBucketCount: HOMEPAGE_PING_BUCKET_COUNT });

  if (!model.node) {
    return <article className="mini-node-card" aria-busy style={{ minHeight: 120 }} />;
  }

  const {
    node,
    ping,
    pingBuckets,
    footerTags,
    latencyColor,
    lossColor,
    loadFraction,
    upRate,
    downRate,
    hasRealHomepagePingBinding,
    pingLoading,
    pingError,
    isOffline,
    osName,
  } = model;
  const detailLabels = nodeDetailLinkLabels(node.name, osName, t);

  return (
    <article
      className={clsx("mini-node-card", isOffline && "is-offline")}
      onPointerEnter={(event) => hoverLabel.show(event, detailLabels.title)}
      onPointerMove={hoverLabel.move}
      onPointerLeave={hoverLabel.hide}
    >
      {hoverLabel.node}
      <MiniHeader node={node} osName={osName} />
      <MiniChips tags={footerTags} ipv4={node.ipv4} ipv6={node.ipv6} />
      <MiniVitals node={node} loadFraction={loadFraction} />
      <MiniFlow node={node} upRate={upRate} downRate={downRate} />
      <MiniHealth
        ping={ping}
        pingBuckets={pingBuckets}
        latencyColor={latencyColor}
        lossColor={lossColor}
        hasRealHomepagePingBinding={hasRealHomepagePingBinding}
        pingLoading={pingLoading}
        pingError={pingError}
      />
      <Link
        to={`/server/${encodeURIComponent(uuid)}`}
        className="card-stretched-link"
        aria-label={nodeDetailLinkLabels(node.name, osName, t).ariaLabel}
      />
    </article>
  );
});
