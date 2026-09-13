import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { MetricBar } from "@/components/node/MetricBar";
import { LoadChart } from "@/components/instance/LoadChart";
import { PingChart } from "@/components/instance/PingChart";
import { InstanceSwitcher } from "@/components/instance/InstanceSwitcher";
import {
  buildLoadTimeRangeOptions,
  buildPingTimeRangeOptions,
} from "@/components/instance/chartShared";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useNodeMeta, useNodeMetrics, useRealtimeFocus, useNodeStoreStatus } from "@/hooks/useNode";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { ANONYMOUS_MAX_HISTORY_HOURS } from "@/services/api";
import { formatBytes, formatByteRateLabel, formatUptimeDays } from "@/utils/format";
import { clsx } from "clsx";

const DEFAULT_PING_HOURS = 1;
const MAX_HISTORY_HOURS = 336;
type TimeRangeOption = ReturnType<typeof buildLoadTimeRangeOptions>[number];

function RangeSelector({ ranges, value, onChange }: { ranges: TimeRangeOption[]; value: number; onChange: (value: number) => void }) {
  return (
    <div className="tab-bar" style={{ margin: "8px 0 0" }}>
      {ranges.map((range) => (
        <button
          key={range.value}
          type="button"
          className={clsx("tab-btn", value === range.value && "active")}
          aria-pressed={value === range.value}
          onClick={() => onChange(range.value)}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

export function Instance() {
  const { uuid } = useParams<{ uuid: string }>();
  const { data: me } = useAuth();
  const themeSettings = useThemeSettings();
  const meta = useNodeMeta(uuid ?? "");
  const metrics = useNodeMetrics(uuid ?? "", Boolean(uuid));
  const storeStatus = useNodeStoreStatus(Boolean(uuid));
  useRealtimeFocus(uuid);
  const { t } = useLanguage();
  const [chartType, setChartType] = useState<"load" | "ping">("load");
  const [loadHours, setLoadHours] = useState(0);
  const [pingHours, setPingHours] = useState(DEFAULT_PING_HOURS);
  const chartControlsRef = useRef<HTMLDivElement | null>(null);

  const maxHistoryHours = me?.logged_in ? MAX_HISTORY_HOURS : ANONYMOUS_MAX_HISTORY_HOURS;

  const loadRanges = useMemo(() => buildLoadTimeRangeOptions(maxHistoryHours), [maxHistoryHours]);
  const pingRanges = useMemo(() => buildPingTimeRangeOptions(maxHistoryHours), [maxHistoryHours]);
  const showPingChart = themeSettings.isReady && themeSettings.showPingChart;

  useEffect(() => {
    if (!loadRanges.some((range) => range.value === loadHours)) {
      setLoadHours(loadRanges[0]?.value ?? 0);
    }
  }, [loadHours, loadRanges]);

  useEffect(() => {
    if (!pingRanges.some((range) => range.value === pingHours)) {
      setPingHours(pingRanges.find((range) => range.value === DEFAULT_PING_HOURS)?.value ?? pingRanges[0]?.value ?? DEFAULT_PING_HOURS);
    }
  }, [pingHours, pingRanges]);

  useEffect(() => {
    if (!showPingChart && chartType === "ping") {
      setChartType("load");
    }
  }, [chartType, showPingChart]);

  if (!uuid) return null;

  if (!meta) {
    const message = storeStatus.hydrated
      ? "找不到这个实例，它可能已被删除或链接无效。"
      : storeStatus.nodeInfoError
        ? "节点列表加载失败，系统正在自动重试。"
        : null;
    return (
      <div className="center-box">
        <Link className="instance-page-back" to="/">{t("common.back")}</Link>
        <p style={{ color: "var(--fg-mid)" }}>{message ?? t("common.loading")}</p>
      </div>
    );
  }

  const uptime = metrics && metrics.uptime > 0 ? formatUptimeDays(metrics.uptime) : null;
  const online = metrics?.online;

  return (
    <div className="instance-page">
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link className="instance-page-back" to="/">{t("common.back")}</Link>
        <InstanceSwitcher currentUuid={uuid} />
      </div>

      <h1 className="bracket-header">
        {meta.name}
        {online === true ? <span className="status-pill online">ONLINE</span> : online === false ? <span className="status-pill offline">OFFLINE</span> : null}
      </h1>

      <div className="panel panel-corners">
        <dl className="kv">
          <dt>地区</dt>
          <dd><Flag region={meta.region} size={12} /> {meta.region || "—"}</dd>
          <dt>分组</dt>
          <dd>{meta.group || "—"}</dd>
          <dt>系统</dt>
          <dd><OsLogo value={meta.os} size={14} /> {meta.os || "—"}</dd>
          <dt>内核</dt>
          <dd>{meta.kernel_version || "—"}</dd>
          <dt>CPU</dt>
          <dd>{meta.cpu_name || "—"}{meta.cpu_cores ? ` × ${meta.cpu_cores}` : ""}</dd>
          <dt>架构</dt>
          <dd>{meta.arch || "—"}</dd>
          <dt>GPU</dt>
          <dd>{meta.gpu_name || "—"}</dd>
          <dt>IPv4 / IPv6</dt>
          <dd>{meta.ipv4 ? "v4 ✓" : "v4 ✗"} / {meta.ipv6 ? "v6 ✓" : "v6 ✗"}</dd>
          {meta.agent_version && (
            <>
              <dt>Agent</dt>
              <dd>{meta.agent_version}</dd>
            </>
          )}
          {uptime && (
            <>
              <dt>运行时间</dt>
              <dd>{uptime.value} {uptime.unit}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MetricBar label="CPU" percent={metrics?.cpuPct ?? 0} colorVar="--progress-cpu" valueText={metrics ? `${Math.round(metrics.cpuPct)}%` : undefined} />
          <MetricBar label="内存" percent={metrics?.ramPct ?? 0} colorVar="--progress-memory" valueText={metrics ? `${formatBytes(metrics.ramUsed)} / ${formatBytes(metrics.ramTotal)}` : undefined} />
          <MetricBar label="Swap" percent={metrics && metrics.swapTotal > 0 ? (metrics.swapUsed / metrics.swapTotal) * 100 : 0} colorVar="--progress-swap" />
          <MetricBar label="磁盘" percent={metrics?.diskPct ?? 0} colorVar="--progress-disk" valueText={metrics ? `${formatBytes(metrics.diskUsed)} / ${formatBytes(metrics.diskTotal)}` : undefined} />
        </div>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>↓ 下行</dt>
          <dd>{formatByteRateLabel(metrics?.netDown)}</dd>
          <dt>↑ 上行</dt>
          <dd>{formatByteRateLabel(metrics?.netUp)}</dd>
          <dt>负载</dt>
          <dd>{metrics ? `${metrics.load1.toFixed(2)} / ${metrics.load5.toFixed(2)} / ${metrics.load15.toFixed(2)}` : "—"}</dd>
          <dt>连接数</dt>
          <dd>{metrics ? `TCP ${metrics.connectionsTcp} · UDP ${metrics.connectionsUdp}` : "—"}</dd>
          <dt>进程</dt>
          <dd>{metrics?.process ?? "—"}</dd>
        </dl>
      </div>

      <div ref={chartControlsRef} style={{ marginTop: 16 }}>
        <div className="tab-bar">
          <button type="button" className={clsx("tab-btn", chartType === "load" && "active")} aria-pressed={chartType === "load"} onClick={() => startTransition(() => setChartType("load"))}>
            负载
          </button>
          {showPingChart && (
            <button type="button" className={clsx("tab-btn", chartType === "ping" && "active")} aria-pressed={chartType === "ping"} onClick={() => startTransition(() => setChartType("ping"))}>
              Ping
            </button>
          )}
        </div>
        {chartType === "load" && <RangeSelector ranges={loadRanges} value={loadHours} onChange={(value) => startTransition(() => setLoadHours(value))} />}
        {chartType === "ping" && showPingChart && <RangeSelector ranges={pingRanges} value={pingHours} onChange={(value) => startTransition(() => setPingHours(value))} />}
      </div>

      {chartType === "load" ? (
        <LoadChart uuid={uuid} hours={loadHours} active={chartType === "load"} />
      ) : showPingChart ? (
        <PingChart uuid={uuid} hours={pingHours} active={chartType === "ping"} />
      ) : null}
    </div>
  );
}
