/** NieR 风格加载指示：旋转方框（直角，炭黑边框）。 */
export function Spinner({ size = 20, label = "加载中" }: { size?: number; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className="nie-spinner"
      style={{ width: size, height: size }}
    />
  );
}
