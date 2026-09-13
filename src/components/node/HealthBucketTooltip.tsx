export function HealthBucketTooltip({
  text,
  index,
  count,
}: {
  text: string | null;
  index: number | null;
  count: number;
}) {
  if (!text || index == null || count <= 0) return null;

  const position = ((index + 0.5) / count) * 100;

  return (
    <span
      role="status"
      style={{
        position: "absolute",
        left: `clamp(42px, ${position}%, calc(100% - 42px))`,
        transform: "translateX(-50%)",
        top: -18,
        background: "var(--panel-inverse-bg)",
        color: "var(--panel-inverse-fg)",
        border: "1px solid var(--accent)",
        padding: "1px 6px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 6,
      }}
    >
      {text}
    </span>
  );
}
