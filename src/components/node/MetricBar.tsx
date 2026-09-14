import { clsx } from "clsx";

interface MetricBarProps {
  label: string;
  percent: number;
  colorVar: string;
  valueText?: string;
  /** 第二行的具体配置（如 3.2 GB / 8 GB），单独一行、小字号。 */
  detailText?: string;
}

/** NieR 直角指标条：标签 + 进度 + 数值（等宽）；detailText 时数值两行显示。 */
export function MetricBar({ label, percent, colorVar, valueText, detailText }: MetricBarProps) {
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
      <span className={clsx("metric-value", detailText && "has-detail")}>
        <strong>{valueText ?? `${Math.round(clamped)}%`}</strong>
        {detailText && <small>{detailText}</small>}
      </span>
    </div>
  );
}
