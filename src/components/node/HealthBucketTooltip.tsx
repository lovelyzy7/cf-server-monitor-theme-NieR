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
      className="node-health-hover-tooltip"
      style={{ "--node-health-tooltip-x": `clamp(42px, ${position}%, calc(100% - 42px))` } as React.CSSProperties}
    >
      {text}
    </span>
  );
}
