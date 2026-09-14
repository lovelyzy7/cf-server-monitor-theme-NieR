import { memo, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { useNodeCardModel } from "@/hooks/useNodeCardModel";
import { HOMEPAGE_PING_BUCKET_COUNT } from "@/hooks/usePingOverview";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { formatBytes } from "@/utils/format";
import { speedRateColor, speedRateColorFromBytes } from "@/utils/metricTone";
import { supportsFineHover } from "@/utils/mediaQuery";
import { formatHealthBucketTooltip } from "./pingBucketText";
import { resolveTouchBucketIndex, TOUCH_BUCKET_HOLD_MS } from "./touchBucketPick";
import { MultiPingStatus } from "./MultiPingStatus";
import {
  formatCompactPercent,
  formatCompactUptime,
  healthBarSlotModel,
  joinTagTitle,
  nodeDetailLinkLabels,
  pingEmptyLabels,
  TRAFFIC_SLIVER_RATIO,
} from "./nodeCardShared";
import { IpStackBadges } from "./IpStackBadges";
import type {
  NodeInfo,
  NodeMetrics,
  PingOverviewBucket,
  PingOverviewItem,
  TrafficTrendSample,
} from "@/types/cfsm";
import type { ByteRateDisplay } from "@/utils/format";
import type { TrafficDisplay } from "@/utils/traffic";

const TRAFFIC_DOT_COUNT = 16;

type CompactNode = NodeInfo & NodeMetrics;
type CompactTag = { label: string; color: string };

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function CompactGauge({
  icon,
  label,
  value,
  detail,
  color,
  fraction,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  color: string;
  fraction: number;
}) {
  const style = {
    "--compact-gauge-color": color,
    "--compact-gauge-fill": `${clamp01(fraction) * 100}%`,
  } as CSSProperties;

  return (
    <div className="compact-node-gauge" style={style} title={detail ? `${label} ${value} · ${detail}` : `${label} ${value}`}>
      <div className="compact-node-gauge-head">
        <span className="compact-node-gauge-label">
          {icon}
          <span>{label}</span>
        </span>
        <strong className="tabular">{detail ? `${value} · ${detail}` : value}</strong>
      </div>
      <span className="compact-node-gauge-track" aria-hidden />
    </div>
  );
}

function CompactInfoTile({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  const style = { "--compact-info-color": color } as CSSProperties;
  return (
    <div className="compact-node-info-tile" style={style} aria-label={label}>
      <span className="compact-node-info-content">{children}</span>
    </div>
  );
}

function CompactTrafficPulse({ up, down }: { up: TrafficTrendSample[]; down: TrafficTrendSample[] }) {
  const upSelected = up.slice(-TRAFFIC_DOT_COUNT);
  const downSelected = down.slice(-TRAFFIC_DOT_COUNT);
  const upPadding = Math.max(0, TRAFFIC_DOT_COUNT - upSelected.length);
  const downPadding = Math.max(0, TRAFFIC_DOT_COUNT - downSelected.length);

  return (
    <span className="compact-node-traffic-pulse" aria-hidden>
      {Array.from({ length: TRAFFIC_DOT_COUNT }, (_, index) => {
        const upSample = index < upPadding ? null : upSelected[index - upPadding];
        const downSample = index < downPadding ? null : downSelected[index - downPadding];
        const upValue = upSample?.value ?? 0;
        const downValue = downSample?.value ?? 0;
        const active = upValue > 0 || downValue > 0;
        const level = Math.max(upSample?.level ?? 0, downSample?.level ?? 0);
        const style = {
          "--compact-traffic-dot-color": active
            ? speedRateColorFromBytes(Math.max(upValue, downValue))
            : "var(--progress-bg)",
          "--compact-traffic-dot-scale": active ? `${0.68 + level * 0.62}` : "0.48",
          opacity: active ? 0.5 + level * 0.42 : 0.38,
        } as CSSProperties;

        return <span key={index} data-active={active ? "true" : "false"} style={style} />;
      })}
    </span>
  );
}

function CompactInfoRow({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: ReactNode;
  label?: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  const style = color ? ({ "--compact-info-row-color": color } as CSSProperties) : undefined;

  return (
    <span className="compact-node-info-row" style={style}>
      <span className="compact-node-info-row-label">
        {icon}
        {label && <span>{label}</span>}
      </span>
      <strong className="compact-node-info-row-value tabular">
        {value}
        {unit && <small>{unit}</small>}
      </strong>
    </span>
  );
}

function HealthBars({ buckets, kind }: { buckets: PingOverviewBucket[]; kind: "latency" | "loss" }) {
  const bars = buckets.slice(-HOMEPAGE_PING_BUCKET_COUNT);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const activeIndex = hoveredIndex ?? selectedIndex;
  const activeBucket = activeIndex == null ? null : bars[activeIndex] ?? null;
  const activeTooltip = activeBucket ? formatHealthBucketTooltip(activeBucket, kind) : null;
  const activeLeft =
    activeIndex == null || bars.length === 0
      ? "50%"
      : `clamp(42px, ${((activeIndex + 0.5) / bars.length) * 100}%, calc(100% - 42px))`;

  const selectIndex = (next: number) => {
    if (bars.length === 0) return;
    setSelectedIndex(Math.max(0, Math.min(bars.length - 1, next)));
  };

  useEffect(
    () => () => {
      if (touchHoldTimerRef.current != null) clearTimeout(touchHoldTimerRef.current);
    },
    [],
  );

  const handleTouchPick = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = resolveTouchBucketIndex(clientX, rect, bars.length);
    if (next == null) return;
    selectIndex(next);
    if (touchHoldTimerRef.current != null) clearTimeout(touchHoldTimerRef.current);
    touchHoldTimerRef.current = setTimeout(() => {
      touchHoldTimerRef.current = null;
      setSelectedIndex(null);
    }, TOUCH_BUCKET_HOLD_MS);
  };

  return (
    <div
      ref={containerRef}
      className="compact-node-health-bars"
      data-kind={kind}
      style={{ "--compact-health-tooltip-x": activeLeft } as CSSProperties}
      tabIndex={0}
      role="group"
      aria-label={`${kind === "latency" ? "延迟" : "丢包"}历史${activeTooltip ? `，${activeTooltip}` : ""}，使用左右方向键查看`}
      onFocus={() => {
        if (!supportsFineHover()) return;
        if (selectedIndex == null) selectIndex(bars.length - 1);
      }}
      onBlur={() => {
        setHoveredIndex(null);
        setSelectedIndex(null);
      }}
      onPointerDown={(event) => {
        if (supportsFineHover(event.pointerType)) return;
        handleTouchPick(event.clientX);
      }}
      onPointerMove={(event) => {
        if (supportsFineHover(event.pointerType) || event.buttons === 0) return;
        handleTouchPick(event.clientX);
      }}
      onKeyDown={(event) => {
        const current = selectedIndex ?? bars.length - 1;
        if (event.key === "ArrowLeft") selectIndex(current - 1);
        else if (event.key === "ArrowRight") selectIndex(current + 1);
        else if (event.key === "Home") selectIndex(0);
        else if (event.key === "End") selectIndex(bars.length - 1);
        else return;
        event.preventDefault();
      }}
    >
      {activeTooltip && (
        <span className="compact-node-health-tooltip" role="status">
          {activeTooltip}
        </span>
      )}
      {bars.map((bucket, index) => {
        const slot = healthBarSlotModel(bucket, kind);
        const style = {
          "--compact-health-height": `${slot.heightFraction * 100}%`,
          "--compact-health-color": slot.color,
          opacity: slot.alpha,
        } as CSSProperties;

        return (
          <span
            key={`${bucket.index}-${index}`}
            className="compact-node-health-bar"
            style={style}
            data-selected={selectedIndex === index ? "true" : "false"}
            aria-hidden="true"
            onPointerEnter={(event) => {
              if (supportsFineHover(event.pointerType)) setHoveredIndex(index);
            }}
            onPointerLeave={() => setHoveredIndex(null)}
            onClick={() => {
              if (!supportsFineHover()) return;
              containerRef.current?.focus({ preventScroll: true });
              setSelectedIndex(index);
            }}
          />
        );
      })}
    </div>
  );
}

function CompactHealthItem({
  icon,
  label,
  value,
  unit,
  color,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="compact-node-health-item">
      <div className="compact-node-health-head">
        <span className="compact-node-health-label">
          {icon}
          {label}
        </span>
        <strong className="compact-node-health-value tabular" style={{ color }}>
          {value}
          {unit && <small>{unit}</small>}
        </strong>
      </div>
      {children}
    </div>
  );
}

function CompactNodeHeader({ node, osName }: { node: CompactNode; osName: string }) {
  const detailLabels = nodeDetailLinkLabels(node.name, osName);
  return (
    <header className="compact-node-header">
      <div className="compact-node-title-wrap">
        <div className="compact-node-title-row">
          <Flag region={node.region} size={15} />
          <Link to={`/server/${encodeURIComponent(node.uuid)}`} className="compact-node-title" title={node.name}>
            {node.name}
          </Link>
        </div>
      </div>
      <div className="compact-node-actions">
        <Link to={`/server/${encodeURIComponent(node.uuid)}`} className="compact-node-detail-link" title={detailLabels.title} aria-label={detailLabels.ariaLabel}>
          <OsLogo value={node.os} size={15} />
        </Link>
      </div>
    </header>
  );
}

function CompactNodeChips({ subtitle, tags, ipv4, ipv6 }: { subtitle: string; tags: CompactTag[]; ipv4?: string | null; ipv6?: string | null }) {
  const tagTitle = joinTagTitle(tags);
  return (
    <div className="compact-node-chip-row">
      {subtitle && (
        <span className="compact-node-subtitle" title={subtitle}>
          {subtitle}
        </span>
      )}
      <IpStackBadges ipv4={ipv4} ipv6={ipv6} />
      {tags.length > 0 && (
        <div className="compact-node-tag-lane" title={tagTitle}>
          {tags.map((tag, index) => (
            <span key={`${tag.label}-${index}`} className="compact-node-tag" data-tag={tag.color}>
              {tag.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactNodeVitals({ node, loadFraction }: { node: CompactNode; loadFraction: number }) {
  return (
    <div className="compact-node-vitals">
      <CompactGauge icon={<span aria-hidden>▣</span>} label="CPU" value={formatCompactPercent(node.cpuPct)} detail={`${node.cpu_cores || 0} 核`} fraction={node.cpuPct / 100} color="var(--progress-cpu)" />
      <CompactGauge icon={<span aria-hidden>▤</span>} label="内存" value={formatCompactPercent(node.ramPct)} detail={`${formatBytes(node.ramUsed)} / ${formatBytes(node.ramTotal)}`} fraction={node.ramPct / 100} color="var(--progress-memory)" />
      <CompactGauge icon={<span aria-hidden>▤</span>} label="Swap" value={node.swapTotal > 0 ? formatCompactPercent((node.swapUsed / node.swapTotal) * 100) : "0%"} detail={node.swapTotal > 0 ? `${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}` : "未配置"} fraction={node.swapTotal > 0 ? node.swapUsed / node.swapTotal : 0} color="var(--progress-swap)" />
      <CompactGauge icon={<span aria-hidden>◫</span>} label="磁盘" value={formatCompactPercent(node.diskPct)} detail={`${formatBytes(node.diskUsed)} / ${formatBytes(node.diskTotal)}`} fraction={node.diskPct / 100} color="var(--progress-disk)" />
      <CompactGauge icon={<span aria-hidden>≋</span>} label="负载" value={node.load1.toFixed(2)} detail={`${node.load5.toFixed(2)} / ${node.load15.toFixed(2)}`} fraction={loadFraction} color="var(--progress-load)" />
    </div>
  );
}

function CompactNodeInfoStrip({
  node,
  trafficTrend,
  upRate,
  downRate,
  showTrafficTotal,
  showConnections,
}: {
  node: CompactNode;
  trafficTrend: { up: TrafficTrendSample[]; down: TrafficTrendSample[] };
  upRate: ByteRateDisplay;
  downRate: ByteRateDisplay;
  showTrafficTotal: boolean;
  showConnections: boolean;
}) {
  const infoTileCount = 1 + (showTrafficTotal ? 1 : 0) + (showConnections ? 1 : 0);

  return (
    <div className="compact-node-info-strip" style={{ "--compact-info-columns": infoTileCount } as CSSProperties}>
      <CompactInfoTile label="实时速率" color="var(--progress-cpu)">
        <CompactInfoRow icon={<span aria-hidden>↑</span>} value={upRate.value} unit={upRate.unit} color={speedRateColor(upRate.unit)} />
        <CompactInfoRow icon={<span aria-hidden>↓</span>} value={downRate.value} unit={downRate.unit} color={speedRateColor(downRate.unit)} />
        <CompactTrafficPulse up={trafficTrend.up} down={trafficTrend.down} />
      </CompactInfoTile>
      {showTrafficTotal && (
        <CompactInfoTile label="累计流量" color="var(--fg-dark)">
          <CompactInfoRow icon={<span aria-hidden aria-label="上行">↑</span>} value={formatBytes(node.trafficUp)} />
          <CompactInfoRow icon={<span aria-hidden aria-label="下行">↓</span>} value={formatBytes(node.trafficDown)} />
        </CompactInfoTile>
      )}
      {showConnections && (
        <CompactInfoTile label="连接数" color="var(--progress-network)">
          <CompactInfoRow icon={<span aria-hidden>≋</span>} label="TCP" value={node.connectionsTcp.toLocaleString()} color="var(--progress-network)" />
          <CompactInfoRow icon={<span aria-hidden>≋</span>} label="UDP" value={node.connectionsUdp.toLocaleString()} />
        </CompactInfoTile>
      )}
    </div>
  );
}

function CompactTrafficBar({ traffic, uptimeLabel }: { traffic: TrafficDisplay; uptimeLabel: string }) {
  const fillFraction =
    traffic.fraction > 0
      ? Math.max(clamp01(traffic.fraction), TRAFFIC_SLIVER_RATIO / 18)
      : 0;
  const style = {
    "--compact-gauge-color": traffic.color,
    "--compact-gauge-fill": `${fillFraction * 100}%`,
  } as CSSProperties;

  return (
    <div className="compact-node-traffic" style={style} title={`流量 · ${traffic.typeLabel} · ${traffic.detail}${uptimeLabel ? ` · ${uptimeLabel}` : ""}`}>
      {uptimeLabel ? (
        <div className="compact-node-traffic-body has-uptime">
          <span className="compact-node-traffic-label">
            <span aria-hidden>▤</span>
            <span>流量</span>
          </span>
          <span className="compact-node-gauge-track" aria-hidden />
          <span className="compact-node-traffic-uptime">{uptimeLabel}</span>
          <span className="compact-node-traffic-value">{traffic.detail}</span>
        </div>
      ) : (
        <div className="compact-node-traffic-body">
          <div className="compact-node-traffic-head">
            <span className="compact-node-traffic-label">
              <span aria-hidden>▤</span>
              <span>流量</span>
            </span>
            <span className="compact-node-traffic-value">{traffic.detail}</span>
          </div>
          <span className="compact-node-gauge-track" aria-hidden />
        </div>
      )}
    </div>
  );
}

const CompactNodeHealth = memo(function CompactNodeHealth({
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
  const { text: emptyText } = pingEmptyLabels(hasRealHomepagePingBinding, pingLoading, pingError);
  return (
    <div
      className="compact-node-bottom"
      data-ping-state={ping.loadState ?? "ready"}
      title={pingError && (ping.lastValue != null || ping.loss != null) ? "首页 Ping 刷新失败，显示上次数据" : undefined}
    >
      <CompactHealthItem icon={<span aria-hidden>◔</span>} label="延迟" value={ping.lastValue != null ? Math.round(ping.lastValue).toString() : emptyText} unit={ping.lastValue != null ? "ms" : undefined} color={latencyColor}>
        <HealthBars buckets={pingBuckets} kind="latency" />
      </CompactHealthItem>
      <CompactHealthItem icon={<span aria-hidden>⊘</span>} label="丢包" value={ping.loss != null ? ping.loss.toFixed(1) : emptyText} unit={ping.loss != null ? "%" : undefined} color={lossColor}>
        <HealthBars buckets={pingBuckets} kind="loss" />
      </CompactHealthItem>
    </div>
  );
});

export const CompactNodeCard = memo(function CompactNodeCard({ uuid }: { uuid: string }) {
  const model = useNodeCardModel(uuid, {
    pingBucketCount: HOMEPAGE_PING_BUCKET_COUNT,
    includeMultiPing: true,
  });
  const themeSettings = useThemeSettings();

  if (!model.node) {
    return <div className="compact-node-card" aria-busy style={{ minHeight: 120 }} />;
  }

  const {
    node,
    traffic,
    trafficTrend,
    ping,
    pingBuckets,
    homepagePingLines,
    compactFooterTags: footerTags,
    subtitle,
    upRate,
    downRate,
    isOffline,
    latencyColor,
    lossColor,
    loadFraction,
    hasRealHomepagePingBinding,
    pingLoading,
    pingError,
    osName,
  } = model;
  const showTrafficTotal = themeSettings.isReady && themeSettings.compactShowTrafficTotal;
  const showUptime = themeSettings.isReady && themeSettings.compactShowUptime;
  const showConnections = themeSettings.isReady && themeSettings.showConnections;
  const uptimeLabel = showUptime && !isOffline ? formatCompactUptime(node.uptime) : "";

  return (
    <article className={clsx("compact-node-card", isOffline && "is-offline")}>
      <CompactNodeHeader node={node} osName={osName} />
      <CompactNodeChips subtitle={subtitle} tags={footerTags} ipv4={node.ipv4} ipv6={node.ipv6} />
      <CompactNodeVitals node={node} loadFraction={loadFraction} />
      <CompactNodeInfoStrip
        node={node}
        trafficTrend={trafficTrend}
        upRate={upRate}
        downRate={downRate}
        showTrafficTotal={showTrafficTotal}
        showConnections={showConnections}
      />
      <CompactTrafficBar traffic={traffic} uptimeLabel={uptimeLabel} />
      {homepagePingLines.length > 0 ? (
        <MultiPingStatus uuid={uuid} lines={homepagePingLines} density="compact" className="compact-node-bottom" />
      ) : (
        <CompactNodeHealth
          ping={ping}
          pingBuckets={pingBuckets}
          latencyColor={latencyColor}
          lossColor={lossColor}
          hasRealHomepagePingBinding={hasRealHomepagePingBinding}
          pingLoading={pingLoading}
          pingError={pingError}
        />
      )}
      <Link
        to={`/server/${encodeURIComponent(uuid)}`}
        className="card-stretched-link"
        aria-label={nodeDetailLinkLabels(node.name, osName).ariaLabel}
        title={nodeDetailLinkLabels(node.name, osName).title}
      />
    </article>
  );
});
