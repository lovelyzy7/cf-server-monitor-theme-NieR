import { useEffect, useId, useRef, useState } from "react";
import {
  HOME_SORT_FIELDS,
  HOME_SORT_FIELD_LABELS,
  type HomeSortDirection,
  type HomeSortField,
} from "@/utils/homeSort";
import type { HomeSortControlState } from "@/hooks/useHomeSort";

// 方向箭头：↑ 升序 / ↓ 降序。
function SortIcon({ direction }: { direction: HomeSortDirection }) {
  return <span aria-hidden>{direction === "asc" ? "↑" : "↓"}</span>;
}

export function HomeSortControl({ state }: { state: HomeSortControlState }) {
  const { field, direction, setField, toggleDirection } = state;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const select = (next: HomeSortField) => {
    if (next === field) toggleDirection();
    else setField(next);
  };

  return (
    <div className="home-sort" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="home-sort-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`排序方式，当前${HOME_SORT_FIELD_LABELS[field]}${direction === "asc" ? "升序" : "降序"}`}
        title={`排序：${HOME_SORT_FIELD_LABELS[field]}（${direction === "asc" ? "升序" : "降序"}）`}
        onClick={() => setOpen((value) => !value)}
      >
        <SortIcon direction={direction} />
        <span>{HOME_SORT_FIELD_LABELS[field]}</span>
      </button>
      {open && (
        <div id={panelId} className="home-sort-panel" role="group" aria-label="排序方式">
          {HOME_SORT_FIELDS.map((option) => {
            const active = option === field;
            return (
              <button
                key={option}
                type="button"
                aria-current={active ? "true" : undefined}
                data-active={active ? "true" : "false"}
                className="home-sort-item"
                onClick={() => select(option)}
              >
                <span className="home-sort-item-label">{HOME_SORT_FIELD_LABELS[option]}</span>
                {active && <SortIcon direction={direction} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
