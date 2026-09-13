import type { ChartTooltipState } from "./chartShared";

/** uPlot 悬停提示，NieR 反色面板风格。 */
export function ChartTooltip({ tooltip }: { tooltip: ChartTooltipState }) {
  if (!tooltip.show) return null;
  return (
    <div
      aria-hidden="true"
      className="instance-chart-tooltip"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      <div className="instance-chart-tooltip-time">{tooltip.time}</div>
      {tooltip.rows.map((row, index) => (
        <div key={`${index}-${row.label}`} className="instance-chart-tooltip-row">
          <span
            aria-hidden="true"
            className="instance-chart-tooltip-dot"
            style={{ background: row.color }}
          />
          <span style={{ flex: 1, opacity: 0.85 }}>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function SwitchToggle({
  label,
  active,
  onToggle,
  title,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="instance-toggle-button instance-switch-button"
      data-active={active ? "true" : "false"}
      onClick={onToggle}
      aria-pressed={active}
      title={title}
    >
      <span className="instance-switch-copy">{label}</span>
      <span className="instance-switch-track" aria-hidden>
        <span className="instance-switch-thumb" />
      </span>
    </button>
  );
}
