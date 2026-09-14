import { useSyncExternalStore } from "react";

/**
 * LIST 视图列顺序（本机持久化）。存的是列 key 数组（含节点列 "node"），
 * 未知/已隐藏的 key 由调用方自然过滤。
 */

const STORAGE_KEY = "cfsm-nier:list-column-order";

const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

let order: string[] = read();

function emit() {
  for (const listener of listeners) listener();
}

export function getListColumnOrder(): string[] {
  return order;
}

export function setListColumnOrder(next: string[]): void {
  order = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式写不进去时，本次会话内仍生效。
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useListColumnOrder(): string[] {
  return useSyncExternalStore(subscribe, getListColumnOrder, getListColumnOrder);
}
