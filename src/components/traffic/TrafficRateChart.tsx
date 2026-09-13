import { useMemo, useRef, useState } from "react";
import UplotReact from "uplot-react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
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
import { formatByteRateLabel, formatBytes } from "@/utils/format";
import type { TodayTrafficSample } from "@/utils/trafficStats";

const UP_COLOR = CHART_PALETTE.cpu;
const DOWN_COLOR = CHART_PALETTE.success;

type TrafficChartMode = "rate" | "total";

function axisRate(value: number) {
  return Number.isFinite(value) && value > 0 ? formatByteRateLabel(value) : "";
}

function axisTotal(value: number) {
  return Number.isFinite(value) && value > 0 ? formatBytes(value) : "";
}

/**
 * 流量节点图。
 * - rate：当日上/下行速率折线；
 * - total：当日流量累计（对同一份采样做梯形积分，纯前端计算，不产生额外请求）。
 */
export function TrafficRateChart({
  samples,
  mode = "rate",
}: {
  samples: TodayTrafficSample[];
  mode?: TrafficChartMode;
}) {
  const { resolvedAppearance } = usePreferences();
  const { w, ref: chartSizeRef } = useResponsiveChartSize("grid");
  const height = w < 560 ? 182 : 220;
  const isTotal = mode === "total";
  const data = useMemo<uPlot.AlignedData>(() => {
    const ordered = [...samples].sort((left, right) => left.timeMs - right.timeMs);
    if (!isTotal) {
      return [
        ordered.map((sample) => sample.timeMs / 1000),
        ordered.map((sample) => sample.up),
        ordered.map((sample) => sample.down),
      ] as uPlot.AlignedData;
    }
    // 累计模式：相邻样本梯形积分，每个时间点显示截至该点的累计流量。
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
    return [times, up, down] as uPlot.AlignedData;
  }, [isTotal, samples]);
  const dataRef = useRef<uPlot.AlignedData>(data);
  dataRef.current = data;
  const [tooltip, setTooltip] = useState<ChartTooltipState>({ show: false, left: 0, top: 0, rows: [], time: "" });
  const tooltipHooks = useMemo(
    () =>
      buildChartTooltipHooks({
        dataRef,
        rangeHours: 24,
        estimatedWidth: 184,
        setTooltip,
        buildRows: (index) => {
          const upValue = Number(dataRef.current[1]?.[index] ?? 0);
          const downValue = Number(dataRef.current[2]?.[index] ?? 0);
          return [
            { label: isTotal ? "累计上行" : "上行", value: isTotal ? formatBytes(upValue) : formatByteRateLabel(upValue), color: UP_COLOR },
            { label: isTotal ? "累计下行" : "下行", value: isTotal ? formatBytes(downValue) : formatByteRateLabel(downValue), color: DOWN_COLOR },
          ];
        },
      }),
    [isTotal],
  );
  const compact = w < 560;
  const baseOptions = useMemo<Omit<uPlot.Options, "width" | "height">>(() => {
    const isDark = resolvedAppearance === "dark";
    const { grid, text } = getAxisColors(isDark);
    return {
      padding: [8, compact ? 18 : 28, 8, compact ? 4 : 6],
      cursor: { drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: true }, y: { auto: true } },
      axes: [
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, size: 36, values: createTimeAxisFormatter(24) },
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, size: compact ? 70 : 82, values: (_self, splits) => splits.map(isTotal ? axisTotal : axisRate) },
      ],
      series: [
        { label: "时间" },
        { label: isTotal ? "累计上行" : "上行", stroke: UP_COLOR, fill: `${UP_COLOR}12`, width: 1.8, points: { show: false } },
        { label: isTotal ? "累计下行" : "下行", stroke: DOWN_COLOR, width: 1.8, points: { show: false } },
      ],
      hooks: {
        init: [
          (plot) => {
            plot.root.setAttribute("role", "img");
            plot.root.setAttribute(
              "aria-label",
              isTotal ? "本日流量累计图（按采样积分估算）" : "本日网络上行与下行速率折线图",
            );
          },
          tooltipHooks.onInit,
        ],
        destroy: [tooltipHooks.onDestroy],
        setCursor: [tooltipHooks.onSetCursor],
      },
    };
  }, [compact, isTotal, resolvedAppearance, tooltipHooks]);
  const options = useMemo<uPlot.Options>(
    () => ({ ...baseOptions, width: w, height }) as uPlot.Options,
    [baseOptions, height, w],
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-mid)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i aria-hidden style={{ width: 10, height: 10, background: UP_COLOR, display: "inline-block" }} />
          {isTotal ? "累计上行" : "上行"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i aria-hidden style={{ width: 10, height: 10, background: DOWN_COLOR, display: "inline-block" }} />
          {isTotal ? "累计下行" : "下行"}
        </span>
      </div>
      <div ref={chartSizeRef} style={{ position: "relative" }}>
        <UplotReact options={options} data={data} />
        <ChartTooltip tooltip={tooltip} />
      </div>
    </div>
  );
}
