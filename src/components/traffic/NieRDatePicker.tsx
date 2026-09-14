import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { useLanguage } from "@/hooks/useLanguage";

/** 本地时区的当天 0 点毫秒。 */
export function localDayMs(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function toDateInputValue(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromDateInputValue(value: string): number | null {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
}

/** 周一为起始的星期表头（与网格对齐）。 */
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const PANEL_ESTIMATE_HEIGHT = 320;

/**
 * 内置日历弹窗（替换原生 input[type=date]），NieR 风格：
 * 直角厚边框 + 硬阴影 + 角标 + 等宽字体。周一起始，今天描边，
 * 选中反色，越界禁用；点外部/滚动/缩放/Esc 关闭。
 */
export function NieRDatePicker({
  value,
  onChange,
  min,
  max,
  label,
  ariaLabel,
  onClear,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  label?: string;
  ariaLabel?: string;
  onClear?: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const [viewYear, setViewYear] = useState(() => (value != null ? new Date(value).getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (value != null ? new Date(value).getMonth() : new Date().getMonth()));

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        // 打开时把视图月同步到当前值，并计算面板位置（底部放不下就翻到上方）。
        const base = value != null ? new Date(value) : new Date();
        setViewYear(base.getFullYear());
        setViewMonth(base.getMonth());
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
          const left = Math.min(rect.left, Math.max(8, window.innerWidth - 280));
          const flipUp = rect.bottom + PANEL_ESTIMATE_HEIGHT > window.innerHeight - 8;
          setPanelPos({
            left,
            top: flipUp ? Math.max(8, rect.top - PANEL_ESTIMATE_HEIGHT) : rect.bottom + 8,
          });
        }
      }
      return next;
    });
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      // 面板 portal 到 body，点面板内部不能当作外部点击。
      if (target?.closest?.(".nier-date-panel")) return;
      if (!rootRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // 面板真实高度出来后校正位置（估算高度与实际不符时上下翻转/贴边）。
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = panel.getBoundingClientRect().height;
    const flipUp = rect.bottom + height + 8 > window.innerHeight - 8;
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - 280));
    setPanelPos({
      left,
      top: flipUp ? Math.max(8, rect.top - height - 8) : rect.bottom + 8,
    });
  }, [open]);

  const today = localDayMs(Date.now());
  const minDay = min != null ? localDayMs(min) : null;
  const maxDay = max != null ? localDayMs(max) : null;

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = (first.getDay() + 6) % 7; // 周一起始
    const cells: Array<number | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    const count = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let day = 1; day <= count; day += 1) cells.push(new Date(viewYear, viewMonth, day).getTime());
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const changeMonth = useCallback((delta: number) => {
    setViewMonth((current) => {
      const next = new Date(viewYear, current + delta, 1);
      setViewYear(next.getFullYear());
      return next.getMonth();
    });
  }, [viewYear]);

  const pick = (ms: number) => {
    onChange(ms);
    setOpen(false);
  };

  const jumpToday = () => {
    if ((minDay != null && today < minDay) || (maxDay != null && today > maxDay)) return;
    pick(today);
  };

  const display = value != null ? toDateInputValue(value) : (label ?? t("traffic.date"));

  const panel = open && panelPos
    ? createPortal(
        <div
          id={panelId}
          ref={panelRef}
          className="nier-date-panel"
          role="dialog"
          aria-label={ariaLabel ?? label ?? t("traffic.date")}
          style={{ left: panelPos.left, top: panelPos.top }}
        >
          <div className="nier-date-head">
            <button type="button" className="nier-date-nav" aria-label={t("date.prevMonth")} onClick={() => changeMonth(-1)}>
              ‹
            </button>
            <span className="nier-date-title tabular">
              {viewYear}-{String(viewMonth + 1).padStart(2, "0")}
            </span>
            <button type="button" className="nier-date-nav" aria-label={t("date.nextMonth")} onClick={() => changeMonth(1)}>
              ›
            </button>
          </div>
          <div className="nier-date-week">
            {WEEKDAY_KEYS.map((key) => (
              <span key={key}>{t(`date.${key}` as "date.mon")}</span>
            ))}
          </div>
          <div className="nier-date-grid">
            {days.map((ms, index) =>
              ms == null ? (
                <span key={`empty-${index}`} className="nier-date-day is-empty" />
              ) : (
                <button
                  key={ms}
                  type="button"
                  className={clsx(
                    "nier-date-day",
                    value != null && ms === localDayMs(value) && "is-selected",
                    ms === today && "is-today",
                  )}
                  disabled={(minDay != null && ms < minDay) || (maxDay != null && ms > maxDay)}
                  onClick={() => pick(ms)}
                >
                  {new Date(ms).getDate()}
                </button>
              ),
            )}
          </div>
          <div className="nier-date-foot">
            <button type="button" className="nier-date-today" onClick={jumpToday}>
              {t("date.today")}
            </button>
            {onClear && (
              <button type="button" className="nier-date-clear" onClick={() => { onClear(); setOpen(false); }}>
                {t("date.clear")}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="nier-date-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="nier-date-trigger tabular"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        {display}
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {panel}
    </div>
  );
}
