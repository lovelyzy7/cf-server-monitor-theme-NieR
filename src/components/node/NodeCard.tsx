import { useState } from "react";
import { Link } from "react-router-dom";
import { useNodeCardModel } from "@/hooks/useNodeCardModel";
import { useNodeMeta } from "@/hooks/useNode";
import { useLanguage } from "@/hooks/useLanguage";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { MetricBar } from "./MetricBar";
import { LatencyBars } from "./LatencyBars";
import { QualityBars } from "./QualityBars";
import { MultiPingStatus } from "./MultiPingStatus";
import { formatHealthBucketTooltip } from "./pingBucketText";
import { formatBytes, formatByteRateLabel, trimFixed } from "@/utils/format";
import { formatBillingCycle } from "@/utils/billing";
import type { NodeInfo } from "@/types/cfsm";

function StatusPill({ online }: { online: boolean | null }) {
  if (online === null) return <span className="status-pill">--</span>;
  return online ? <span className="status-pill online">ONLINE</span> : <span className="status-pill offline">OFFLINE</span>;
}

export function NodeCardHost({ node }: { node: NodeInfo }) {
  const model = useNodeCardModel(node.uuid);
  return <NodeCard node={node} model={model} />;
}

/** 供 NodeGrid 使用的 uuid 版入口。 */
export function NodeCardUuid({ uuid }: { uuid: string }) {
  const node = useNodeMeta(uuid);
  if (!node) return null;
  return <NodeCardHost node={node} />;
}

type CardModel = ReturnType<typeof useNodeCardModel>;
type FullCardModel = Extract<CardModel, { node: NonNullable<CardModel["node"]> }>;

export function NodeCard({ node, model }: { node: NodeInfo; model: CardModel }) {
  const [hoverLatency, setHoverLatency] = useState<number | null>(null);
  const [hoverLoss, setHoverLoss] = useState<number | null>(null);
  const { t } = useLanguage();

  if (!model.node) {
    return (
      <div className="node-card" style={{ minHeight: 120 }}>
        <div className="node-card-head">
          <span className="node-card-name">
            <Flag region={node.region} size={14} />
            <span className="name">{node.name}</span>
          </span>
          <StatusPill online={null} />
        </div>
      </div>
    );
  }
  const m = model as FullCardModel;
  const merged = m.node;
  const online = merged.online === true ? true : merged.online === false ? false : null;
  const uptime = m.uptime;

  return (
    <Link to={`/server/${encodeURIComponent(node.uuid)}`} className="node-card" style={{ display: "block" }}>
      <div className="node-card-head">
        <span className="node-card-name">
          <Flag region={node.region} size={14} />
          <span className="name">{node.name}</span>
          <OsLogo value={node.os} size={16} />
        </span>
        <StatusPill online={online} />
      </div>

      <div className="node-card-sub" style={{ marginBottom: 10 }}>
        {node.group && <span>{node.group} · </span>}
        <span>{node.region || "—"}</span>
        {node.price !== 0 && (
          <span>{" "}· {node.price === -1 ? "免费" : `${node.currency || "¥"}${node.price}/${formatBillingCycle(node.billing_cycle)}`}</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <MetricBar label="CPU" percent={merged?.cpuPct ?? 0} colorVar="--progress-cpu" />
        <MetricBar label="MEM" percent={merged?.ramPct ?? 0} colorVar="--progress-memory"
          valueText={merged ? `${formatBytes(merged.ramUsed)} / ${formatBytes(merged.ramTotal)}` : undefined} />
        <MetricBar label="SWAP" percent={merged && merged.swapTotal > 0 ? (merged.swapUsed / merged.swapTotal) * 100 : 0} colorVar="--progress-swap"
          valueText={merged && merged.swapTotal > 0 ? `${formatBytes(merged.swapUsed)} / ${formatBytes(merged.swapTotal)}` : undefined} />
        <MetricBar label="DISK" percent={merged?.diskPct ?? 0} colorVar="--progress-disk" />
      </div>

      {m.shouldRenderPingBars && (
        m.homepagePingLines.length > 0 ? (
          <MultiPingStatus uuid={node.uuid} lines={m.homepagePingLines} density="large" />
        ) : m.pingBuckets.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span className="metric-label" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-mid)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t("ping.latency")}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-dark)" }}>
              {m.ping.lastValue != null ? `${trimFixed(m.ping.lastValue, 1)} ms` : "—"}
            </span>
          </div>
          <div style={{ position: "relative" }}>
            <LatencyBars buckets={m.pingBuckets} onHoverIndex={setHoverLatency} />
            {hoverLatency != null && m.pingBuckets[hoverLatency] && (
              <span
                style={{
                  position: "absolute", top: -20, left: `${(hoverLatency / m.pingBuckets.length) * 100}%`,
                  transform: "translateX(-50%)", background: "var(--panel-inverse-bg)", color: "var(--panel-inverse-fg)",
                  border: "1px solid var(--accent)", padding: "2px 6px", fontFamily: "var(--font-mono)", fontSize: 10,
                  whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5,
                }}
              >
                {formatHealthBucketTooltip(m.pingBuckets[hoverLatency], "latency")}
              </span>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "4px 0" }}>
            <span className="metric-label" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-mid)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t("ping.loss")}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: m.lossColor }}>
              {m.ping.loss != null ? `${trimFixed(m.ping.loss, 1)}%` : "—"}
            </span>
          </div>
          <div style={{ position: "relative" }}>
            <QualityBars buckets={m.pingBuckets} onHoverIndex={setHoverLoss} />
            {hoverLoss != null && m.pingBuckets[hoverLoss] && (
              <span
                style={{
                  position: "absolute", top: -20, left: `${(hoverLoss / m.pingBuckets.length) * 100}%`,
                  transform: "translateX(-50%)", background: "var(--panel-inverse-bg)", color: "var(--panel-inverse-fg)",
                  border: "1px solid var(--accent)", padding: "2px 6px", fontFamily: "var(--font-mono)", fontSize: 10,
                  whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5,
                }}
              >
                {formatHealthBucketTooltip(m.pingBuckets[hoverLoss], "loss")}
              </span>
            )}
          </div>
        </div>
        ) : null
      )}

      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>{t("card.down")}</dt>
        <dd>{formatByteRateLabel(merged?.netDown)}</dd>
        <dt>{t("card.up")}</dt>
        <dd>{formatByteRateLabel(merged?.netUp)}</dd>
        {m.traffic && (
          <>
            <dt>{t("card.traffic")}</dt>
            <dd>{m.traffic.detail}</dd>
          </>
        )}
        {uptime && (
          <>
            <dt>{t("card.uptime")}</dt>
            <dd>{uptime.value} {uptime.unit}</dd>
          </>
        )}
      </dl>
    </Link>
  );
}
