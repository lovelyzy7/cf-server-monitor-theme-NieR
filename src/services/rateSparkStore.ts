import { useEffect, useSyncExternalStore } from "react";

/**
 * COMPACT 累计流量曲线的实时网速样本缓冲。
 *
 * 按节点记录最近一段时间的上/下行速率（bytes/s），相邻样本至少隔
 * {@link MIN_GAP_MS}，最多保留 {@link MAX_SAMPLES} 个（约 2 分钟）。
 * 所有卡片共享同一份缓冲：同一节点只会攒一份。
 */

export interface RateSparkSample {
  t: number;
  up: number;
  down: number;
}

const MAX_SAMPLES = 24;
const MIN_GAP_MS = 3_000;

const buffers = new Map<string, RateSparkSample[]>();
const listeners = new Set<() => void>();
const EMPTY: RateSparkSample[] = [];

function emit() {
  for (const listener of listeners) listener();
}

export function pushRateSparkSample(uuid: string, up: number, down: number, now = Date.now()): void {
  const arr = buffers.get(uuid) ?? [];
  const last = arr[arr.length - 1];
  if (last && now - last.t < MIN_GAP_MS) return;
  const next = [...arr, { t: now, up, down }];
  buffers.set(uuid, next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next);
  emit();
}

export function getRateSparkSamples(uuid: string): RateSparkSample[] {
  return buffers.get(uuid) ?? EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 返回该节点最近的实时网速样本，并在 up/down 变化时把新样本压进缓冲。
 * 快照是共享数组引用，push 时整体替换，保证 useSyncExternalStore 稳定。
 */
export function useRateSparkSamples(uuid: string, up: number | null, down: number | null): RateSparkSample[] {
  useEffect(() => {
    if (up == null || down == null || !Number.isFinite(up) || !Number.isFinite(down)) return;
    pushRateSparkSample(uuid, up, down);
  }, [uuid, up, down]);

  return useSyncExternalStore(
    subscribe,
    () => buffers.get(uuid) ?? EMPTY,
    () => buffers.get(uuid) ?? EMPTY,
  );
}
