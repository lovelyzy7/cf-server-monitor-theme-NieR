import { useSyncExternalStore } from "react";

/**
 * LIST 视图的节点手动拖动顺序（本机持久化）。
 *
 * 仅当首页排序字段为「默认」（后端 weight）时生效；换其它排序字段时
 * 仍按该字段排。未知/已删除的 uuid 会被调用方自然过滤掉。
 */

const STORAGE_KEY = "cfsm-nier:list-node-order";

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

export function getListNodeOrder(): string[] {
  return order;
}

export function setListNodeOrder(next: string[]): void {
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

export function useListNodeOrder(): string[] {
  return useSyncExternalStore(subscribe, getListNodeOrder, getListNodeOrder);
}
