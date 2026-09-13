import { clsx } from "clsx";

interface MetricBarProps {
  label: string;
  percent: number;
  colorVar: string;
  valueText?: string;
}

/** NieR 直角指标条：标签 + 进度 + 数值（等宽）。 */
export function MetricBar({ label, percent, colorVar, valueText }: MetricBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className="metric-bar">
        <span
          className="metric-bar-fill"
          style={{ width: `${clamped}%`, ["--metric-color" as string]: `var(${colorVar})` }}
        />
      </span>
      <span className={clsx("metric-value")}>{valueText ?? `${Math.round(clamped)}%`}</span>
    </div>
  );
}
