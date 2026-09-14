import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 延迟柱悬浮提示：portal 到 body、按柱位固定定位。
 * 不再受卡片 overflow 裁剪（末尾几根柱的提示框不会被卡片边框遮住）。
 */
export function HealthBucketTooltip({
  text,
  index,
  count,
}: {
  text: string | null;
  index: number | null;
  count: number;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const parent = anchorRef.current?.parentElement;
    if (!text || index == null || count <= 0 || !parent) {
      setBox(null);
      return;
    }
    const rect = parent.getBoundingClientRect();
    const ratio = (index + 0.5) / count;
    setBox({ left: rect.left + rect.width * ratio, top: rect.top - 8 });
  }, [text, index, count]);

  return (
    <>
      <span ref={anchorRef} style={{ display: "none" }} aria-hidden />
      {box && text && index != null && count > 0
        ? createPortal(
            <span
              role="status"
              className="node-health-hover-tooltip is-fixed"
              style={{ left: box.left, top: box.top }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
