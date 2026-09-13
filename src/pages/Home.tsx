import { clsx } from "clsx";
import { NodeCardHost } from "@/components/node/NodeCard";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { useNodeMetrics, useNodeMeta, useAllNodeMeta, useHomeNodeSummaries } from "@/hooks/useNode";
import { useViewMode } from "@/hooks/useViewMode";
import { useLanguage } from "@/hooks/useLanguage";
import { formatByteRateLabel, formatBytes, formatExpireDays } from "@/utils/format";

function Overview({ online, total }: { online: number; total: number }) {
  const summaries = useHomeNodeSummaries();
  const speedDown = summaries.reduce((s, n) => s + (n.netDown || 0), 0);
  const speedUp = summaries.reduce((s, n) => s + (n.netUp || 0), 0);
  const offline = Math.max(0, total - online);

  return (
    <div className="panel inverse panel-corners" style={{ marginTop: 16 }}>
      <div className="overview-panel">
        <div className="overview-cell">
          <div className="k">ONLINE</div>
          <div className="v">{online}</div>
        </div>
        <div className="overview-cell">
          <div className="k">OFFLINE</div>
          <div className="v">{offline}</div>
        </div>
        <div className="overview-cell">
          <div className="k">TOTAL</div>
          <div className="v">{total}</div>
        </div>
        <div className="overview-cell">
          <div className="k">↓ IN</div>
          <div className="v" style={{ fontSize: 18 }}>{formatByteRateLabel(speedDown)}</div>
        </div>
        <div className="overview-cell">
          <div className="k">↑ OUT</div>
          <div className="v" style={{ fontSize: 18 }}>{formatByteRateLabel(speedUp)}</div>
        </div>
      </div>
    </div>
  );
}

function ListRow({ uuid }: { uuid: string }) {
  const node = useNodeMetaOrNull(uuid);
  const metrics = useNodeMetrics(uuid);
  if (!node) return null;
  const expiry = formatExpireDays(node.expired_at);
  return (
    <tr>
      <td>
        <span className="node-card-name" style={{ fontSize: 13 }}>
          <Flag region={node.region} size={12} />
          <span>{node.name}</span>
          <OsLogo value={node.os} size={15} />
        </span>
      </td>
      <td>{metrics?.online ? <span className="status-pill online">ONLINE</span> : <span className="status-pill offline">OFFLINE</span>}</td>
      <td data-numeric>{metrics ? `${Math.round(metrics.cpuPct)}%` : "—"}</td>
      <td data-numeric>{metrics ? `${Math.round(metrics.ramPct)}%` : "—"}</td>
      <td data-numeric>{formatByteRateLabel(metrics?.netDown)}</td>
      <td data-numeric>{formatByteRateLabel(metrics?.netUp)}</td>
      <td data-numeric>{expiry.value}{expiry.unit}</td>
    </tr>
  );
}

function useNodeMetaOrNull(uuid: string) {
  return useNodeMeta(uuid);
}

export function Home() {
  const nodes = useAllNodeMeta();
  const summaries = useHomeNodeSummaries();
  const { mode } = useViewMode();
  const { t } = useLanguage();
  const online = summaries.filter((s) => s.online).length;
  const total = summaries.length;

  if (nodes.length === 0) {
    return (
      <div className="center-box">
        <span className="nie-spinner is-lg" aria-hidden />
        <span style={{ color: "var(--fg-mid)" }}>{t("status.pending")}</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="bracket-header">{t("title.status")}</h1>
      <Overview online={online} total={total} />

      {mode === "list" ? (
        <div className="panel" style={{ marginTop: 16, overflowX: "auto" }}>
          <table className="monitor">
            <thead>
              <tr>
                <th>节点</th>
                <th>状态</th>
                <th data-numeric>CPU</th>
                <th data-numeric>内存</th>
                <th data-numeric>↓ 下行</th>
                <th data-numeric>↑ 上行</th>
                <th data-numeric>到期</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <ListRow key={node.uuid} uuid={node.uuid} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={clsx("node-grid", mode === "compact" && "is-compact", mode === "mini" && "is-mini")}>
          {nodes.map((node) =>
            mode === "mini" ? (
              <MiniCard key={node.uuid} uuid={node.uuid} />
            ) : (
              <NodeCardHost key={node.uuid} node={node} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function MiniCard({ uuid }: { uuid: string }) {
  const node = useNodeMetaOrNull(uuid);
  const metrics = useNodeMetrics(uuid);
  if (!node) return null;
  return (
    <NodeCardMini node={node} metrics={metrics} />
  );
}

function NodeCardMini({ node, metrics }: { node: import("@/types/cfsm").NodeInfo; metrics: import("@/types/cfsm").NodeMetrics | undefined }) {
  return (
    <div className="node-card" style={{ padding: "12px 14px" }}>
      <div className="node-card-head">
        <span className="node-card-name" style={{ fontSize: 13 }}>
          <Flag region={node.region} size={12} />
          <span className="name">{node.name}</span>
        </span>
        {metrics?.online ? <span className="status-pill online">ON</span> : <span className="status-pill offline">OFF</span>}
      </div>
      <dl className="kv" style={{ fontSize: 11 }}>
        <dt>CPU</dt>
        <dd>{metrics ? `${Math.round(metrics.cpuPct)}%` : "—"}</dd>
        <dt>内存</dt>
        <dd>{metrics ? `${formatBytes(metrics.ramUsed)}` : "—"}</dd>
        <dt>网络</dt>
        <dd>{formatByteRateLabel(metrics?.netDown)}</dd>
      </dl>
    </div>
  );
}
