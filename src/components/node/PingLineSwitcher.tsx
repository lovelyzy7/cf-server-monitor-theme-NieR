import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  useAvailablePingTaskIds,
  useNodePingLineOverrides,
} from "@/hooks/usePingOverview";
import { useCarrierNames } from "@/hooks/usePublicConfig";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { CARRIER_TASKS, carrierTaskName } from "@/services/cfsm/mappers";
import { setPingLineOverrides } from "@/services/pingLineOverrideStore";
import {
  EMPTY_PING_LINE_OVERRIDES,
  nodePingLineOverrides,
  resolveNodePingLineTaskIds,
  switchPingLine,
} from "@/utils/pingLineOverrides";

const PANEL_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;

/**
 * 多线路卡片上的线路名：点开给这台节点的这一行换一条线路。
 * 换的先存本机（pingLineOverrideStore）；换线路本身不发任何请求。
 */
export function PingLineSwitcher({ uuid, slot, taskName }: { uuid: string; slot: number; taskName: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="multi-ping-name"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${taskName}，切换这一行的线路`}
        title="切换线路"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {taskName}
      </button>
      {open && <PingLineMenu id={panelId} uuid={uuid} slot={slot} triggerRef={triggerRef} onClose={close} />}
    </>
  );
}

function PingLineMenu({
  id,
  uuid,
  slot,
  triggerRef,
  onClose,
}: {
  id: string;
  uuid: string;
  slot: number;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { homepageMultiPingTaskIds, homepagePingLineOverrides } = useThemeSettings();
  const overrides = useNodePingLineOverrides(uuid);
  const available = useAvailablePingTaskIds(uuid);
  const carrierNames = useCarrierNames();
  const nodeDefault = resolveNodePingLineTaskIds(
    homepageMultiPingTaskIds,
    nodePingLineOverrides(homepagePingLineOverrides, uuid),
  );
  const displayed = resolveNodePingLineTaskIds(nodeDefault, overrides);
  const currentTaskId = displayed[slot];
  const options = CARRIER_TASKS.filter(
    (task) => available.includes(task.id) || displayed.includes(task.id),
  ).map((task) => task.id);
  const customized = displayed !== nodeDefault;

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const anchor = trigger.getBoundingClientRect();
    panel.style.maxHeight = "";
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const roomBelow = window.innerHeight - anchor.bottom - PANEL_GAP_PX - VIEWPORT_MARGIN_PX;
    const roomAbove = anchor.top - PANEL_GAP_PX - VIEWPORT_MARGIN_PX;
    const above = height > roomBelow && roomAbove > roomBelow;
    const room = Math.max(0, above ? roomAbove : roomBelow);
    const shownHeight = Math.min(height, room);
    const maxLeft = document.documentElement.clientWidth - width - VIEWPORT_MARGIN_PX;
    panel.style.maxHeight = `${room}px`;
    panel.style.top = `${above ? anchor.top - PANEL_GAP_PX - shownHeight : anchor.bottom + PANEL_GAP_PX}px`;
    panel.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(anchor.left, maxLeft))}px`;
  }, [customized, options.length, triggerRef]);

  useEffect(() => {
    const panel = panelRef.current;
    const initial = panel?.querySelector<HTMLButtonElement>("[data-active='true']") ?? panel?.querySelector<HTMLButtonElement>("button");
    initial?.focus({ preventScroll: true });

    const isInside = (target: EventTarget | null) =>
      target instanceof Node && (panel?.contains(target) === true || triggerRef.current?.contains(target) === true);
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) onClose(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(true);
    };
    const onScroll = (event: Event) => {
      if (!isInside(event.target)) onClose(false);
    };
    const onResize = () => onClose(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose, triggerRef]);

  const select = (taskId: number) => {
    setPingLineOverrides(uuid, switchPingLine(nodeDefault, overrides, slot, taskId));
    onClose(true);
  };

  const reset = () => {
    setPingLineOverrides(uuid, EMPTY_PING_LINE_OVERRIDES);
    onClose(true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      onClose(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowUp" ? (current <= 0 ? items.length : current) - 1 : (current + 1) % items.length;
    items[next]?.focus();
  };

  const itemStyle: React.CSSProperties = {
    background: "transparent",
  };

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      className="ping-line-menu"
      role="group"
      aria-label="切换线路"
      onKeyDown={handleKeyDown}
    >
      {options.map((taskId) => {
        const active = taskId === currentTaskId;
        const swaps = !active && displayed.includes(taskId);
        return (
          <button
            key={taskId}
            type="button"
            className="ping-line-menu-item"
            data-active={active ? "true" : "false"}
            aria-current={active ? "true" : undefined}
            onClick={() => select(taskId)}
            style={active ? itemStyle : undefined}
          >
            <span className="ping-line-menu-label">{carrierTaskName(taskId, carrierNames)}</span>
            {swaps && <span className="ping-line-menu-hint">互换</span>}
            {active && <span aria-hidden>✓</span>}
          </button>
        );
      })}
      {customized && (
        <>
          <div className="ping-line-menu-divider" role="separator" />
          <button type="button" className="ping-line-menu-item" title="这台节点的线路恢复成站点设置" onClick={reset}>
            <span aria-hidden>↺</span>
            <span className="ping-line-menu-label">恢复默认</span>
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
