import { useEffect, useRef } from "react";
import { lossHeatColor } from "@/utils/metricTone";

/**
 * Ping 图下方的丢包色带（NieR 直角版）。
 *
 * 放在折线图上方，每条线路一行，横轴与主图严格对齐：整条色带的宽度直接取主图 canvas 的宽度，
 * 左边留出与 Y 轴刻度同宽的槽位放线路名，右边留出与主图相同的内边距。
 *
 * 色阶与首页卡片共用 lossHeatColor（0% 绿 → 20%+ 红）。
 * 没有采样的时段不画，露出底色轨道 —— 掉线和「丢包 0%」必须看得出区别。
 */

const ROW_HEIGHT = 6;

export interface PingLossRow {
  id: number;
  label: string;
  /** 与 times 等长；null = 该时段没有采样。 */
  loss: Array<number | null>;
}

export function PingLossStrip({
  times,
  xRange,
  rows,
  chartWidth,
  gutter,
  rightPad,
  isDark,
  cursorLeft,
}: {
  times: number[];
  xRange: [number, number] | null;
  rows: PingLossRow[];
  chartWidth: number;
  gutter: number;
  rightPad: number;
  isDark: boolean;
  cursorLeft: number | null;
}) {
  const trackWidth = Math.max(0, chartWidth - gutter - rightPad);
  if (rows.length === 0 || times.length === 0 || trackWidth <= 0) return null;

  return (
    <div style={{ width: chartWidth, margin: "0 0 4px" }}>
      {cursorLeft != null && cursorLeft <= trackWidth && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: gutter + cursorLeft,
            width: 1,
            height: rows.length * (ROW_HEIGHT + 2),
            background: "var(--accent)",
            pointerEvents: "none",
          }}
        />
      )}
      {rows.map((row) => (
        <div key={row.id} style={{ display: "flex", alignItems: "center", height: ROW_HEIGHT + 2 }}>
          <span
            style={{
              width: gutter,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-mid)",
              letterSpacing: "0.05em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.label}
          </span>
          <LossRowCanvas
            times={times}
            loss={row.loss}
            xRange={xRange}
            width={trackWidth}
            isDark={isDark}
            label={row.label}
          />
        </div>
      ))}
    </div>
  );
}

function LossRowCanvas({
  times,
  loss,
  xRange,
  width,
  isDark,
  label,
}: {
  times: number[];
  loss: Array<number | null>;
  xRange: [number, number] | null;
  width: number;
  isDark: boolean;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.round(ROW_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, ROW_HEIGHT);

    // 轨道底色：没有采样的时段就露出它，和「丢包 0%」的绿块区分开。
    ctx.fillStyle = isDark ? "rgba(216, 209, 187, 0.10)" : "rgba(26, 24, 20, 0.10)";
    ctx.fillRect(0, 0, width, ROW_HEIGHT);

    const [t0, t1] = xRange ?? [times[0], times[times.length - 1]];
    const span = t1 - t0;
    if (!(span > 0)) {
      const only = loss.find((value) => value != null);
      if (only != null) {
        ctx.fillStyle = lossHeatColor(only);
        ctx.fillRect(0, 0, width, ROW_HEIGHT);
      }
      return;
    }
    const toX = (time: number) => ((time - t0) / span) * width;

    for (let index = 0; index < times.length; index += 1) {
      const value = loss[index];
      if (value == null) continue;
      const prev = times[index - 1] ?? times[index] - (times[index + 1] - times[index] || 0);
      const next = times[index + 1] ?? times[index] + (times[index] - times[index - 1] || 0);
      const left = Math.max(0, toX((prev + times[index]) / 2));
      const right = Math.min(width, toX((times[index] + next) / 2));
      const barWidth = Math.max(1, right - left);
      if (right <= 0 || left >= width) continue;
      ctx.fillStyle = lossHeatColor(value);
      ctx.fillRect(left, 0, barWidth, ROW_HEIGHT);
    }
  }, [isDark, loss, times, width, xRange]);

  const measured = loss.filter((value): value is number => value != null);
  const average =
    measured.length > 0
      ? measured.reduce((sum, value) => sum + value, 0) / measured.length
      : null;

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`${label} 丢包${average == null ? "无数据" : ` 平均 ${average.toFixed(1)}%`}`}
      style={{ width, height: ROW_HEIGHT, display: "block" }}
    />
  );
}
