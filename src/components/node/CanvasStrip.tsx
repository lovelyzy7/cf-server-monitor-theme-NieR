import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { supportsFineHover } from "@/utils/mediaQuery";
import { TOUCH_BUCKET_HOLD_MS } from "./touchBucketPick";

export interface CanvasStripInteraction {
  hoverIndex: number | null;
  hoverProgress: number;
}

interface CanvasStripProps {
  className?: string;
  height: number;
  redrawKey?: string | number;
  draw: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    interaction: CanvasStripInteraction,
  ) => void;
  getHoverIndex?: (offsetX: number, width: number) => number | null;
  onHoverIndex?: (index: number | null) => void;
}

type WidthListener = (width: number) => void;
type VisibilityListener = (visible: boolean) => void;

const observedWidths = new Map<Element, WidthListener>();
const fallbackResizeListeners = new Set<() => void>();
let sharedResizeObserver: ResizeObserver | null = null;
let fallbackResizeListening = false;
const observedVisibility = new Map<Element, VisibilityListener>();
let sharedIntersectionObserver: IntersectionObserver | null = null;

function normalizeWidth(width: number) {
  return Number.isFinite(width) && width > 0 ? Math.round(width * 100) / 100 : 0;
}

function subscribeToWidth(element: HTMLElement, listener: WidthListener) {
  if (typeof ResizeObserver !== "undefined") {
    sharedResizeObserver ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        observedWidths.get(entry.target)?.(normalizeWidth(entry.contentRect.width));
      }
    });
    observedWidths.set(element, listener);
    sharedResizeObserver.observe(element);
    return () => {
      observedWidths.delete(element);
      sharedResizeObserver?.unobserve(element);
      if (observedWidths.size === 0) {
        sharedResizeObserver?.disconnect();
        sharedResizeObserver = null;
      }
    };
  }

  const update = () => listener(normalizeWidth(element.getBoundingClientRect().width));
  fallbackResizeListeners.add(update);
  if (!fallbackResizeListening) {
    fallbackResizeListening = true;
    window.addEventListener("resize", notifyFallbackResizeListeners);
  }
  return () => {
    fallbackResizeListeners.delete(update);
    if (fallbackResizeListeners.size === 0 && fallbackResizeListening) {
      fallbackResizeListening = false;
      window.removeEventListener("resize", notifyFallbackResizeListeners);
    }
  };
}

function notifyFallbackResizeListeners() {
  for (const listener of fallbackResizeListeners) listener();
}

function subscribeToVisibility(element: HTMLElement, listener: VisibilityListener) {
  if (typeof IntersectionObserver === "undefined") {
    listener(true);
    return () => undefined;
  }
  sharedIntersectionObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        observedVisibility.get(entry.target)?.(entry.isIntersecting);
      }
    },
    { rootMargin: "160px 0px" },
  );
  observedVisibility.set(element, listener);
  sharedIntersectionObserver.observe(element);
  return () => {
    observedVisibility.delete(element);
    sharedIntersectionObserver?.unobserve(element);
    if (observedVisibility.size === 0) {
      sharedIntersectionObserver?.disconnect();
      sharedIntersectionObserver = null;
    }
  };
}

const dprListeners = new Set<() => void>();
let dprQuery: MediaQueryList | null = null;

function currentDpr() {
  if (typeof window === "undefined") return 1;
  const value = window.devicePixelRatio;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function handleDprChange() {
  dprQuery?.removeEventListener("change", handleDprChange);
  bindDprQuery();
  for (const listener of dprListeners) listener();
}

function bindDprQuery() {
  dprQuery = window.matchMedia(`(resolution: ${currentDpr()}dppx)`);
  dprQuery.addEventListener("change", handleDprChange);
}

function subscribeToDpr(listener: () => void) {
  dprListeners.add(listener);
  if (dprListeners.size === 1) bindDprQuery();
  return () => {
    dprListeners.delete(listener);
    if (dprListeners.size === 0) {
      dprQuery?.removeEventListener("change", handleDprChange);
      dprQuery = null;
    }
  };
}

export function CanvasStrip({
  className,
  height,
  redrawKey,
  draw,
  getHoverIndex,
  onHoverIndex,
}: CanvasStripProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastHoverIndexRef = useRef<number | null>(null);
  const hoverAnimationFrameRef = useRef<number | null>(null);
  const touchPointerRef = useRef<number | null>(null);
  const touchPickedRef = useRef(false);
  const touchHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionRef = useRef<CanvasStripInteraction>({ hoverIndex: null, hoverProgress: 0 });
  const [interaction, setInteraction] = useState<CanvasStripInteraction>(interactionRef.current);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const dpr = useSyncExternalStore(subscribeToDpr, currentDpr, () => 1);

  const commitInteraction = (next: CanvasStripInteraction) => {
    interactionRef.current = next;
    setInteraction(next);
  };

  const animateHover = (hoverIndex: number | null, target: 0 | 1) => {
    if (hoverAnimationFrameRef.current != null) {
      cancelAnimationFrame(hoverAnimationFrameRef.current);
      hoverAnimationFrameRef.current = null;
    }
    const current = interactionRef.current;
    const startProgress = current.hoverProgress;
    const start = performance.now();
    const duration = 150 * Math.abs(target - startProgress);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || duration <= 0) {
      commitInteraction({ hoverIndex: target === 0 ? null : hoverIndex, hoverProgress: target });
      return;
    }
    commitInteraction({ hoverIndex, hoverProgress: startProgress });
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const hoverProgress = startProgress + (target - startProgress) * eased;
      const done = elapsed >= 1;
      commitInteraction({
        hoverIndex: done && target === 0 ? null : hoverIndex,
        hoverProgress: done ? target : hoverProgress,
      });
      hoverAnimationFrameRef.current = done ? null : requestAnimationFrame(tick);
    };
    hoverAnimationFrameRef.current = requestAnimationFrame(tick);
  };

  useEffect(
    () => () => {
      if (hoverAnimationFrameRef.current != null) cancelAnimationFrame(hoverAnimationFrameRef.current);
      if (touchHoldTimerRef.current != null) clearTimeout(touchHoldTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateWidth = (nextWidth: number) => {
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    };
    const unsubscribeWidth = subscribeToWidth(canvas, updateWidth);
    const unsubscribeVisibility = subscribeToVisibility(canvas, setVisible);
    const rect = canvas.getBoundingClientRect();
    updateWidth(normalizeWidth(rect.width));
    if (typeof IntersectionObserver !== "undefined") {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.bottom >= -160 && rect.top <= viewportHeight + 160) setVisible(true);
    }
    return () => {
      unsubscribeWidth();
      unsubscribeVisibility();
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || width <= 0) return;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height, interaction);
  }, [dpr, draw, height, interaction, redrawKey, visible, width]);

  const clearTouchHoldTimer = () => {
    if (touchHoldTimerRef.current == null) return;
    clearTimeout(touchHoldTimerRef.current);
    touchHoldTimerRef.current = null;
  };

  const handlePointerLeave = () => {
    if (lastHoverIndexRef.current === null) return;
    const previous = lastHoverIndexRef.current;
    lastHoverIndexRef.current = null;
    animateHover(previous, 0);
    onHoverIndex?.(null);
  };

  const selectIndex = (next: number | null) => {
    if (next === lastHoverIndexRef.current) return;
    lastHoverIndexRef.current = next;
    animateHover(next, next == null ? 0 : 1);
    onHoverIndex?.(next);
  };

  const resolveTouchIndex = (event: PointerEvent<HTMLCanvasElement>): number | null => {
    if (!getHoverIndex || width <= 0) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return getHoverIndex(event.clientX - rect.left, width);
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (supportsFineHover(event.pointerType)) return;
    clearTouchHoldTimer();
    touchPointerRef.current = event.pointerId;
    touchPickedRef.current = true;
    selectIndex(resolveTouchIndex(event));
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 捕获不到就退化成「只认按下那一下」。
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!supportsFineHover(event.pointerType)) {
      if (touchPointerRef.current === event.pointerId) selectIndex(resolveTouchIndex(event));
      return;
    }
    if (!getHoverIndex || width <= 0) return;
    selectIndex(getHoverIndex(event.nativeEvent.offsetX, width));
  };

  const endTouch = (event: PointerEvent<HTMLCanvasElement>, keep: boolean) => {
    if (touchPointerRef.current !== event.pointerId) return;
    touchPointerRef.current = null;
    if (!keep) {
      touchPickedRef.current = false;
      handlePointerLeave();
      return;
    }
    clearTouchHoldTimer();
    touchHoldTimerRef.current = setTimeout(() => {
      touchHoldTimerRef.current = null;
      handlePointerLeave();
    }, TOUCH_BUCKET_HOLD_MS);
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height }}
      aria-hidden
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => endTouch(event, true)}
      onClick={(event) => {
        if (!touchPickedRef.current) return;
        touchPickedRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={(event) => endTouch(event, false)}
      onPointerLeave={() => {
        if (touchPointerRef.current != null || touchHoldTimerRef.current != null) return;
        handlePointerLeave();
      }}
    />
  );
}
