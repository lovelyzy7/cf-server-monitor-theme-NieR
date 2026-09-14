import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 替换浏览器原生 title 提示的 NieR 悬浮标签：跟随鼠标、直角厚边框、
 * 硬阴影 + 四角角标。用在卡片「系统名 · 查看详情」这类整卡提示上。
 */
export function useNieRHoverLabel() {
  const [state, setState] = useState<{ x: number; y: number; text: string } | null>(null);

  const show = useCallback((event: { clientX: number; clientY: number }, text: string) => {
    if (!text) return;
    setState({ x: event.clientX + 16, y: event.clientY + 18, text });
  }, []);

  const move = useCallback((event: { clientX: number; clientY: number }) => {
    setState((prev) => (prev ? { ...prev, x: event.clientX + 16, y: event.clientY + 18 } : prev));
  }, []);

  const hide = useCallback(() => setState(null), []);

  const node = state
    ? createPortal(
        <div className="nier-hover-label" role="tooltip" style={{ left: state.x, top: state.y }}>
          {state.text}
        </div>,
        document.body,
      )
    : null;

  return { show, move, hide, node };
}
