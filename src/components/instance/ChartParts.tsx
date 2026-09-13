import type { ChartTooltipState } from "./chartShared";

/** uPlot 悬停提示，NieR 反色面板风格。 */
export function ChartTooltip({ tooltip }: { tooltip: ChartTooltipState }) {
  if (!tooltip.show) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: tooltip.left,
        top: tooltip.top,
        zIndex: 20,
        minWidth: 168,
        background: "var(--panel-inverse-bg)",
        color: "var(--panel-inverse-fg)",
        border: "2px solid var(--accent)",
        padding: "8px 10px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        boxShadow: "3px 3px 0 rgba(0,0,0,0.3)",
        pointerEvents: "none",
      }}
    >
      <div style={{ borderBottom: "1px solid var(--bg-cream-dark)", marginBottom: 6, paddingBottom: 4, opacity: 0.85 }}>
        {tooltip.time}
      </div>
      {tooltip.rows.map((row, index) => (
        <div
          key={`${index}-${row.label}`}
          style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.5 }}
        >
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, background: row.color, flexShrink: 0 }}
          />
          <span style={{ opacity: 0.8, flex: 1 }}>{row.label}</span>
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
      onClick={onToggle}
      aria-pressed={active}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        color: "var(--fg-dark)",
        border: "1px solid var(--accent)",
        padding: "4px 10px",
        fontSize: 11,
        letterSpacing: "0.08em",
        cursor: "var(--cur-pointer)",
        fontFamily: "inherit",
      }}
    >
      <span>{label}</span>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 22,
          height: 12,
          border: "1px solid var(--accent)",
          background: active ? "var(--accent)" : "transparent",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: active ? 11 : 1,
            width: 8,
            height: 8,
            background: active ? "var(--panel-inverse-fg)" : "var(--accent)",
            transition: "left 80ms",
          }}
        />
      </span>
    </button>
  );
}
