import { translate } from "@/hooks/useLanguage";
import { useMemo, useRef, useState } from "react";
import UplotReact from "uplot-react";
import type uPlot from "uplot";
import { ChartTooltip } from "@/components/instance/ChartParts";
import {
  buildChartTooltipHooks,
  CHART_PALETTE,
  createTimeAxisFormatter,
  getAxisColors,
  useResponsiveChartSize,
  type ChartTooltipState,
} from "@/components/instance/chartShared";
import { usePreferences } from "@/hooks/usePreferences";
import { mixSrgbTowardWhite } from "@/utils/canvasColor";
import { formatByteRateLabel, formatBytes } from "@/utils/format";
import type { TodayTrafficSample } from "@/utils/trafficStats";

const UP_COLOR = CHART_PALETTE.cpu;
const DOWN_COLOR = CHART_PALETTE.success;
// 速率线用同色系浅色虚线，与累计实线区分。
const UP_RATE_COLOR = mixSrgbTowardWhite(UP_COLOR, 0.55);
const DOWN_RATE_COLOR = mixSrgbTowardWhite(DOWN_COLOR, 0.55);

function axisTotal(value: number) {
  return Number.isFinite(value) && value > 0 ? formatBytes(value) : "";
}

function axisRate(value: number) {
  return Number.isFinite(value) && value > 0 ? formatByteRateLabel(value) : "";
}

/**
 * 节点双 Y 轴图：
 * - 左 Y 轴：当日流量（累计，字节）—— 累计上行/下行实线；
 * - 右 Y 轴：网速（字节/秒）—— 上行/下行速率虚线。
 * 累计由速率采样做梯形积分得到（纯前端计算）。
 */
export function TrafficRateChart({
  samples,
  live,
}: {
  samples: TodayTrafficSample[];
  live: { up: number; down: number } | null;
}) {
  const { resolvedAppearance } = usePreferences();
  const { w, ref: chartSizeRef } = useResponsiveChartSize("grid");
  const height = w < 560 ? 200 : 240;
  const data = useMemo<uPlot.AlignedData>(() => {
    const ordered = [...samples].sort((left, right) => left.timeMs - right.timeMs);
    if (live) {
      ordered.push({ timeMs: Date.now(), up: live.up, down: live.down });
    }
    const times = ordered.map((sample) => sample.timeMs / 1000);
    const up: number[] = [];
    const down: number[] = [];
    let cumUp = 0;
    let cumDown = 0;
    ordered.forEach((sample, index) => {
      if (index > 0) {
        const previous = ordered[index - 1]!;
        const dt = Math.max(0, (sample.timeMs - previous.timeMs) / 1000);
        cumUp += ((previous.up + sample.up) / 2) * dt;
        cumDown += ((previous.down + sample.down) / 2) * dt;
      }
      up.push(cumUp);
      down.push(cumDown);
    });
    return [
      times,
      up,
      down,
      ordered.map((sample) => sample.up),
      ordered.map((sample) => sample.down),
    ] as uPlot.AlignedData;
  }, [live, samples]);
  const dataRef = useRef<uPlot.AlignedData>(data);
  dataRef.current = data;
  const [tooltip, setTooltip] = useState<ChartTooltipState>({ show: false, left: 0, top: 0, rows: [], time: "" });
  const tooltipHooks = useMemo(
    () =>
      buildChartTooltipHooks({
        dataRef,
        rangeHours: 24,
        estimatedWidth: 196,
        setTooltip,
        buildRows: (index) => [
          { label: translate("traffic.cumUp"), value: formatBytes(Number(dataRef.current[1]?.[index] ?? 0)), color: UP_COLOR },
          { label: translate("traffic.cumDown"), value: formatBytes(Number(dataRef.current[2]?.[index] ?? 0)), color: DOWN_COLOR },
          { label: translate("traffic.rateUp"), value: formatByteRateLabel(Number(dataRef.current[3]?.[index] ?? 0)), color: UP_RATE_COLOR },
          { label: translate("traffic.rateDown"), value: formatByteRateLabel(Number(dataRef.current[4]?.[index] ?? 0)), color: DOWN_RATE_COLOR },
        ],
      }),
    [],
  );
  const compact = w < 560;
  const baseOptions = useMemo<Omit<uPlot.Options, "width" | "height">>(() => {
    const isDark = resolvedAppearance === "dark";
    const { grid, text } = getAxisColors(isDark);
    return {
      padding: [8, compact ? 8 : 10, 8, compact ? 4 : 6],
      cursor: { drag: { x: false, y: false } },
      legend: { show: false },
      scales: {
        x: { time: true },
        y: { auto: true },
        y2: { auto: true },
      },
      axes: [
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, size: 36, values: createTimeAxisFormatter(24) },
        { scale: "y", stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, size: compact ? 62 : 74, values: (_self, splits) => splits.map(axisTotal) },
        { scale: "y2", side: 1, stroke: text, grid: { show: false }, ticks: { stroke: text }, size: compact ? 62 : 74, values: (_self, splits) => splits.map(axisRate) },
      ],
      series: [
        { label: translate("traffic.time") },
        { label: translate("traffic.cumUp"), scale: "y", stroke: UP_COLOR, width: 1.9, points: { show: false } },
        { label: translate("traffic.cumDown"), scale: "y", stroke: DOWN_COLOR, width: 1.9, points: { show: false } },
        { label: translate("traffic.rateUp"), scale: "y2", stroke: UP_RATE_COLOR, width: 1.1, dash: [6, 4], points: { show: false } },
        { label: translate("traffic.rateDown"), scale: "y2", stroke: DOWN_RATE_COLOR, width: 1.1, dash: [6, 4], points: { show: false } },
      ],
      hooks: {
        init: [
          (plot) => {
            plot.root.setAttribute("role", "img");
            plot.root.setAttribute("aria-label", translate("traffic.chartAria"));
          },
          tooltipHooks.onInit,
        ],
        destroy: [tooltipHooks.onDestroy],
        setCursor: [tooltipHooks.onSetCursor],
      },
    };
  }, [compact, resolvedAppearance, tooltipHooks]);
  const options = useMemo<uPlot.Options>(
    () => ({ ...baseOptions, width: w, height }) as uPlot.Options,
    [baseOptions, height, w],
  );

  const legend = [
    { label: translate("traffic.cumUp"), color: UP_COLOR },
    { label: translate("traffic.cumDown"), color: DOWN_COLOR },
    { label: translate("traffic.rateUp"), color: UP_RATE_COLOR },
    { label: translate("traffic.rateDown"), color: DOWN_RATE_COLOR },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)" }}>
        {legend.map((item) => (
          <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <i aria-hidden style={{ width: 10, height: 10, background: item.color, display: "inline-block" }} />
            {item.label}
          </span>
        ))}
      </div>
      <div ref={chartSizeRef} style={{ position: "relative" }}>
        <UplotReact options={options} data={data} />
        <ChartTooltip tooltip={tooltip} />
      </div>
    </div>
  );
}
