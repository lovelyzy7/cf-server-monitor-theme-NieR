import { useEffect, useMemo, useRef, useState } from "react";
import UplotReact from "uplot-react";
import type uPlot from "uplot";
import { usePingRecords } from "@/hooks/useRecords";
import { useCarrierNames } from "@/hooks/usePublicConfig";
import { carrierTaskName, displayCarrierTaskName } from "@/services/cfsm/mappers";
import { InstancePanel, InstanceChartLoading } from "./InstancePanel";
import {
  buildChartTooltipHooks,
  colorForSeries,
  createTimeAxisFormatter,
  getAxisColors,
  toChartSeconds,
  useResponsiveChartSize,
  type ChartTooltipState,
} from "./chartShared";
import { ChartTooltip, SwitchToggle } from "./ChartParts";
import { PingLossStrip, type PingLossRow } from "./PingLossStrip";
import {
  cutPeakValues,
  detectTypicalIntervalSeconds,
  downsampleAligned,
  insertMetricGapSentinels,
  smoothByCount,
} from "./chartData";
import { latencyHeatColor, lossHeatColor } from "@/utils/metricTone";
import { useLanguage } from "@/hooks/useLanguage";
import { historyChartRangeSeconds, historyCoverageLabel } from "@/utils/historyRange";
import {
  bucketPingLoss,
  formatPingTooltipValue,
  resolvePingChartInterval,
  resolvePingSampleCounts,
  type PingLossSample,
} from "@/utils/pingMetrics";
import { usePreferences } from "@/hooks/usePreferences";
import type { PingRecord, PingTaskStats } from "@/types/cfsm";
import type { TimedMetricPoint } from "./chartData";

interface WeightedLatency {
  value: number;
  weight: number;
}

function valueAtWeightedIndex(sorted: WeightedLatency[], index: number) {
  let offset = 0;
  for (const sample of sorted) {
    offset += sample.weight;
    if (index < offset) return sample.value;
  }
  return sorted[sorted.length - 1]?.value ?? null;
}

function percentileFromWeighted(sorted: WeightedLatency[], ratio: number) {
  const total = sorted.reduce((sum, sample) => sum + sample.weight, 0);
  if (total <= 0) return null;
  const index = (total - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = valueAtWeightedIndex(sorted, lower);
  const upperValue = valueAtWeightedIndex(sorted, upper);
  if (lowerValue == null || upperValue == null) return null;
  if (lower === upper) return lowerValue;
  const weight = index - lower;
  return lowerValue + (upperValue - lowerValue) * weight;
}

export function summarizePingRecords(records: PingRecord[]) {
  const samples = records.map((record) => ({ record, ...resolvePingSampleCounts(record) }));
  const valid = samples
    .filter(({ record, valid: count }) => record.value >= 0 && count > 0)
    .map(({ record, valid: count }) => ({ value: record.value, weight: count }))
    .sort((a, b) => a.value - b.value);
  const total = samples.reduce((sum, sample) => sum + sample.total, 0);
  const lost = samples.reduce((sum, sample) => sum + sample.lost, 0);
  const validCount = valid.reduce((sum, sample) => sum + sample.weight, 0);

  let latest: number | null = null;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const { record, valid: count } = samples[index];
    if (record.value >= 0 && count > 0) {
      latest = record.value;
      break;
    }
  }

  return {
    latest,
    avg: validCount > 0 ? valid.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / validCount : null,
    min: valid[0]?.value ?? null,
    max: valid[valid.length - 1]?.value ?? null,
    p50: percentileFromWeighted(valid, 0.5),
    p99: percentileFromWeighted(valid, 0.99),
    total,
    lost,
    loss: total > 0 ? (lost / total) * 100 : 0,
  };
}

const EMPTY_PING_STATS: PingTaskStats[] = [];
const MAX_RENDER_POINTS = 160;
const Y_AXIS_SIZE = 64;
const CHART_PADDING_LEFT = 2;
const CHART_PADDING_RIGHT = 14;
const SMOOTH_WINDOW_POINTS = 1;
const SMOOTH_WINDOW_POINTS_PEAK = 13;

export function PingChart({ uuid, hours, active = true }: { uuid: string; hours: number; active?: boolean }) {
  const { t } = useLanguage();
  const { data, isError, isFetching, isLoading, refetch: refetchRecords } = usePingRecords(uuid, hours, active);
  const pingStats = data?.stats ?? EMPTY_PING_STATS;
  const { resolvedAppearance } = usePreferences();
  const { w, h, ref: chartSizeRef } = useResponsiveChartSize("wide");
  const [hiddenTasks, setHiddenTasks] = useState<Set<number>>(new Set());
  const [connectNulls, setConnectNulls] = useState(false);
  const [cutPeak, setCutPeak] = useState(false);
  const [showLoss, setShowLoss] = useState(true);
  const [cursorLeft, setCursorLeft] = useState<number | null>(null);
  const chartRef = useRef<uPlot.AlignedData>([[]]);
  const lossRef = useRef<Array<Array<number | null>>>([]);
  const [tooltip, setTooltip] = useState<ChartTooltipState>({ show: false, left: 0, top: 0, rows: [], time: "" });
  const isDark = resolvedAppearance === "dark";
  const carrierNames = useCarrierNames();
  const tasks = useMemo(
    () => (data?.tasks ?? []).map((task) => ({ ...task, name: carrierTaskName(task.id, carrierNames) })),
    [carrierNames, data],
  );
  const taskLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      const label = displayCarrierTaskName(task.name || `${t("chart.task")} #${task.id}`, t);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return new Map(
      tasks.map((task) => {
        const baseLabel = displayCarrierTaskName(task.name || `${t("chart.task")} #${task.id}`, t);
        const label = (counts.get(baseLabel) ?? 0) > 1 ? `${baseLabel} #${task.id}` : baseLabel;
        return [task.id, label] as const;
      }),
    );
  }, [tasks, t]);
  const taskColors = useMemo(
    () => new Map(tasks.map((task, index) => [task.id, colorForSeries(index, tasks.length)] as const)),
    [tasks],
  );
  const taskKeySet = useMemo(() => new Set(tasks.map((task) => String(task.id))), [tasks]);
  const taskKeys = useMemo(() => tasks.map((task) => String(task.id)), [tasks]);
  const taskIndexById = useMemo(
    () => new Map(tasks.map((task, index) => [task.id, index] as const)),
    [tasks],
  );
  const visibleTasks = useMemo(() => tasks.filter((task) => !hiddenTasks.has(task.id)), [hiddenTasks, tasks]);
  const visibleTaskIds = useMemo(() => new Set(visibleTasks.map((task) => task.id)), [visibleTasks]);

  useEffect(() => {
    setHiddenTasks(new Set());
  }, [uuid]);

  useEffect(() => {
    setHiddenTasks((prev) => {
      const validTaskIds = new Set(tasks.map((task) => task.id));
      const next = new Set([...prev].filter((taskId) => validTaskIds.has(taskId)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const sortedRecords = useMemo(
    () => (data?.records ?? [])
      .map((record) => ({ record, time: toChartSeconds(record.time) }))
      .filter(({ time }) => time > 0)
      .sort((left, right) => left.time - right.time),
    [data],
  );

  const chartBundle = useMemo(() => {
    if (!data?.records.length || !tasks.length) return null;
    const pointMap = new Map<number, TimedMetricPoint>();
    const lossSamples = new Map<string, PingLossSample[]>(taskKeys.map((key) => [key, []]));
    const taskIntervals = tasks
      .map((task) => task.interval)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const detectedInterval = detectTypicalIntervalSeconds(sortedRecords.map(({ time }) => time), 60);
    const fallbackInterval = resolvePingChartInterval(
      data.intervalSeconds,
      taskIntervals.length > 0 ? Math.min(...taskIntervals) : null,
      detectedInterval,
    );
    const tolerance = Math.min(6, Math.max(0.8, fallbackInterval * 0.25));

    let lastAnchor = Number.NEGATIVE_INFINITY;
    for (const { record, time } of sortedRecords) {
      const taskKey = String(record.task_id);
      if (!taskKeySet.has(taskKey)) continue;
      const anchor = time - lastAnchor <= tolerance ? lastAnchor : time;
      if (anchor === time) lastAnchor = time;
      const current = pointMap.get(anchor) ?? { time: anchor };
      current[taskKey] = record.value >= 0 ? record.value : null;
      pointMap.set(anchor, current);
      const counts = resolvePingSampleCounts(record);
      lossSamples.get(taskKey)?.push({ time: anchor, lost: counts.lost, total: counts.total });
    }

    let chartPoints = [...pointMap.values()].sort((a, b) => a.time - b.time);
    if (cutPeak && taskKeys.length > 0) {
      chartPoints = cutPeakValues(chartPoints, taskKeys);
    }
    chartPoints = insertMetricGapSentinels(chartPoints, {
      intervals: new Map(
        tasks.map((task) => [String(task.id), resolvePingChartInterval(data.intervalSeconds, task.interval, fallbackInterval)] as const),
      ),
      defaultInterval: fallbackInterval,
      matchToleranceRatio: 0.25,
    });
    const times = chartPoints.map((point) => point.time);
    const perTask = taskKeys.map((taskKey) => chartPoints.map((point) => point[taskKey]));

    const reduced = downsampleAligned(times, perTask, MAX_RENDER_POINTS, !cutPeak);
    const smoothed = smoothByCount(reduced.perTask, cutPeak ? SMOOTH_WINDOW_POINTS_PEAK : SMOOTH_WINDOW_POINTS);

    return {
      data: [reduced.times, ...smoothed] as uPlot.AlignedData,
      loss: taskKeys.map((key) => bucketPingLoss(lossSamples.get(key) ?? [], reduced.times)),
    };
  }, [cutPeak, data, sortedRecords, taskKeySet, taskKeys, tasks]);

  const chart = chartBundle?.data ?? null;

  const lossRows = useMemo<PingLossRow[]>(() => {
    if (!chartBundle) return [];
    return visibleTasks.map((task) => ({
      id: task.id,
      label: taskLabels.get(task.id) ?? `${t("chart.task")} #${task.id}`,
      loss: chartBundle.loss[taskIndexById.get(task.id) ?? 0] ?? [],
    }));
  }, [chartBundle, taskIndexById, taskLabels, visibleTasks, t]);

  useEffect(() => {
    if (chartBundle) {
      chartRef.current = chartBundle.data;
      lossRef.current = chartBundle.loss;
    }
  }, [chartBundle]);

  const requestedXRange = useMemo(() => historyChartRangeSeconds(data), [data]);
  const coverageMeta = useMemo(() => {
    if (!data) return null;
    const taskIntervals = tasks
      .map((task) => task.interval)
      .filter((value) => Number.isFinite(value) && value > 0);
    return {
      rangeStartMs: data.rangeStartMs,
      rangeEndMs: data.rangeEndMs,
      intervalSeconds: data.intervalSeconds ?? (taskIntervals.length > 0 ? Math.min(...taskIntervals) : undefined),
    };
  }, [data, tasks]);
  const coverageLabel = useMemo(() => {
    const times = chart?.[0];
    if (!times?.length) return null;
    return historyCoverageLabel(coverageMeta, times[0], times[times.length - 1], t);
  }, [chart, coverageMeta, t]);
  const samplingLabel = useMemo(() => {
    if (sortedRecords.length < 2) return null;
    const seconds = detectTypicalIntervalSeconds(sortedRecords.map(({ time }) => time), 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const text = seconds >= 60 ? `${Number((seconds / 60).toFixed(seconds % 60 === 0 ? 0 : 1))} ${t("chart.minutes")}` : `${Math.round(seconds)}s`;
    return t("chart.sampleEvery").replace("{text}", text);
  }, [sortedRecords, t]);
  const panelDescription = [coverageLabel, samplingLabel].filter(Boolean).join(" · ") || undefined;

  const yRange = useMemo<[number | null, number | null]>(() => {
    if (!chart) return [null, null];
    let max = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < tasks.length; index += 1) {
      if (!visibleTaskIds.has(tasks[index].id)) continue;
      const series = chart[index + 1] as Array<number | null | undefined> | undefined;
      if (!series) continue;
      for (const value of series) {
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          if (value > max) max = value;
        }
      }
    }
    if (max === Number.NEGATIVE_INFINITY || max <= 0) return [0, 100];
    return [0, max + Math.max(5, max * 0.12)];
  }, [chart, tasks, visibleTaskIds]);

  const baseOptions = useMemo<Omit<uPlot.Options, "width" | "height"> | null>(() => {
    if (!chart) return null;
    const { grid, text } = getAxisColors(isDark);
    const tooltipHooks = buildChartTooltipHooks({
      dataRef: chartRef,
      rangeHours: hours,
      estimatedWidth: 196,
      setTooltip,
      buildRows: (idx) =>
        visibleTasks
          .map((task) => {
            const taskIndex = taskIndexById.get(task.id) ?? 0;
            const raw = chartRef.current[taskIndex + 1]?.[idx] as number | null | undefined;
            const loss = lossRef.current[taskIndex]?.[idx] ?? null;
            return {
              label: taskLabels.get(task.id) ?? `${t("chart.task")} #${task.id}`,
              raw: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
              loss,
              color: taskColors.get(task.id) ?? colorForSeries(taskIndex, tasks.length),
            };
          })
          .sort((a, b) => {
            if (a.raw == null) return b.raw == null ? 0 : 1;
            if (b.raw == null) return -1;
            return b.raw - a.raw;
          })
          .map(({ label, raw, loss, color }) => ({ label, value: formatPingTooltipValue(raw, loss), color })),
    });
    return {
      padding: [10, CHART_PADDING_RIGHT, 12, CHART_PADDING_LEFT],
      cursor: { drag: { x: true, y: false } },
      legend: { show: false },
      scales: {
        x: requestedXRange ? { time: true, auto: false, range: () => requestedXRange } : { time: true },
        y: { auto: false, range: yRange },
      },
      axes: [
        {
          stroke: text,
          grid: { stroke: grid, width: 1 },
          ticks: { stroke: grid },
          size: 36,
          values: createTimeAxisFormatter(hours),
        },
        {
          stroke: text,
          grid: { stroke: grid, width: 1 },
          ticks: { stroke: grid },
          size: Y_AXIS_SIZE,
          values: (_self, splits) => splits.map((value) => (value === 0 ? "" : `${Math.round(value)} ms`)),
        },
      ],
      series: [
        { label: "time" },
        ...tasks.map((task, index) => ({
          label: taskLabels.get(task.id) ?? `${t("chart.task")} #${task.id}`,
          stroke: taskColors.get(task.id) ?? colorForSeries(index, tasks.length),
          width: 1.7,
          spanGaps: connectNulls,
          show: !hiddenTasks.has(task.id),
          points: { show: false },
        })),
      ],
      hooks: {
        init: [
          (u) => {
            u.root.setAttribute("role", "img");
            u.root.setAttribute("aria-label", t("chart.pingAria").replace("{n}", String(tasks.length)));
          },
          tooltipHooks.onInit,
        ],
        destroy: [tooltipHooks.onDestroy],
        setCursor: [
          tooltipHooks.onSetCursor,
          (u) => {
            const left = u.cursor.left;
            const inside = left != null && left >= 0 && u.cursor.idx != null;
            setCursorLeft(inside ? Math.round(left) : null);
          },
        ],
      },
    };
  }, [chart, connectNulls, hiddenTasks, hours, isDark, requestedXRange, taskColors, taskIndexById, taskLabels, tasks, visibleTasks, yRange, t]);

  const options = useMemo<uPlot.Options | null>(
    () => (baseOptions ? { ...baseOptions, width: w, height: h } : null),
    [baseOptions, w, h],
  );

  const taskStats = useMemo(() => {
    const grouped = new Map<number, PingRecord[]>();
    for (const { record } of sortedRecords) {
      const bucket = grouped.get(record.task_id);
      if (bucket) bucket.push(record);
      else grouped.set(record.task_id, [record]);
    }
    const serverStats = new Map(
      pingStats
        .filter((stat) => !stat.client || stat.client === uuid)
        .map((stat) => [stat.taskId, stat] as const),
    );
    return tasks.map((task, index) => {
      const records = grouped.get(task.id) ?? [];
      const server = serverStats.get(task.id);
      const fallback = server ? null : summarizePingRecords(records);
      const latest = server ? server.latest : fallback?.latest ?? null;
      const avg = server ? server.avg : fallback?.avg ?? null;
      const min = server ? server.min : fallback?.min ?? null;
      const max = server ? server.max : fallback?.max ?? null;
      const p50 = server ? server.p50 : fallback?.p50 ?? null;
      const p99 = server ? server.p99 : fallback?.p99 ?? null;
      const fallbackVolatility = p50 != null && p99 != null ? Math.max(0, p99 - p50) / Math.min(50, Math.max(10, p50)) : null;
      const volatility = server && Number.isFinite(server.p99P50Ratio) ? server.p99P50Ratio : fallbackVolatility;
      const total = server?.total ?? fallback?.total ?? 0;
      const lost = server ? Math.max(0, server.total - server.valid) : fallback?.lost ?? 0;
      const loss = server?.loss ?? (total > 0 ? fallback?.loss ?? 0 : task.loss);
      return { ...task, latest, avg, min, max, p50, p99, volatility, total, lost, loss, color: taskColors.get(task.id) ?? colorForSeries(index, tasks.length) };
    });
  }, [pingStats, sortedRecords, taskColors, tasks, uuid]);

  const refetchAll = () => {
    void refetchRecords();
  };

  const toggleTask = (taskId: number) => {
    setHiddenTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleAll = () => {
    setHiddenTasks((prev) => (prev.size === 0 ? new Set(tasks.map((task) => task.id)) : new Set()));
  };

  if (isLoading) {
    return <InstanceChartLoading title={t("chart.pingTitle")} />;
  }

  if (isError && !data?.records.length) {
    return (
      <InstancePanel title={t("chart.pingTitle")}>
        <div className="instance-empty">
          <span>{t("chart.pingFail")}</span>{" "}
          <button type="button" className="instance-toggle-button" onClick={refetchAll} disabled={isFetching} aria-busy={isFetching}>
            {isFetching ? t("chart.retrying") : t("common.retry")}
          </button>
        </div>
      </InstancePanel>
    );
  }

  if (!data?.records.length) {
    return (
      <InstancePanel title={t("chart.pingTitle")}>
        <div className="instance-empty">{t("chart.pingEmpty")}</div>
      </InstancePanel>
    );
  }

  return (
    <InstancePanel title={t("chart.pingTitle")} description={panelDescription}>
      <div className="instance-ping-toolbar">
        <SwitchToggle label={t("chart.lossBand")} active={showLoss} onToggle={() => setShowLoss((value) => !value)}
          title={t("chart.lossTooltip")} />
        <SwitchToggle label={t("chart.smooth")} active={cutPeak} onToggle={() => setCutPeak((value) => !value)} title={t("chart.smoothTooltip")} />
        <SwitchToggle label={t("chart.spanGaps")} active={connectNulls} onToggle={() => setConnectNulls((value) => !value)}
          title={t("chart.spanTooltip")} />
        <button type="button" className="instance-toggle-button" onClick={toggleAll}>
          {hiddenTasks.size === 0 ? t("chart.hideAll") : t("chart.showAll")}
        </button>
        <button type="button" className="instance-toggle-button" onClick={refetchAll} disabled={isFetching} aria-busy={isFetching}>
          ⟳ {isFetching ? t("chart.refreshing") : isError ? t("chart.refreshFail") : t("common.refresh")}
        </button>
      </div>

      <div className="instance-ping-tasks">
        {taskStats.map((task) => {
          const visible = !hiddenTasks.has(task.id);
          return (
            <button
              key={task.id}
              type="button"
              className="instance-ping-task"
              data-visible={visible ? "true" : "false"}
              onClick={() => toggleTask(task.id)}
              aria-pressed={visible}
              title={[
                taskLabels.get(task.id) ?? `${t("chart.task")} #${task.id}`,
                `${t("common.realtime")} ${task.latest != null ? `${task.latest.toFixed(1)} ms` : "—"} | ${t("chart.avg")} ${task.avg != null ? `${task.avg.toFixed(1)} ms` : "—"} | ${t("ping.loss")} ${task.loss.toFixed(1)}%`,
                `p99 ${task.p99 != null ? `${task.p99.toFixed(0)} ms` : "—"} | ${t("chart.jitter")} ${task.volatility != null ? task.volatility.toFixed(2) : "—"}`,
                `min ${task.min != null ? `${task.min.toFixed(0)} ms` : "—"} | max ${task.max != null ? `${task.max.toFixed(0)} ms` : "—"} | ${t("chart.sampling")} ${task.total ?? 0} | ${t("chart.interval")} ${task.interval}s`,
              ].join("\n")}
              style={{ borderColor: visible ? task.color : "var(--bg-cream-dark)" }}
            >
              <span className="instance-ping-task-dot" style={{ background: task.color }} aria-hidden />
              <span className="instance-ping-task-name">{taskLabels.get(task.id) ?? `${t("chart.task")} #${task.id}`}</span>
              <span className="instance-ping-task-primary" style={{ color: task.latest != null ? latencyHeatColor(task.latest) : "var(--fg-mid)" }}>
                {task.latest != null ? `${task.latest.toFixed(1)} ms` : "—"}
              </span>
              <span className="instance-ping-task-loss" style={{ color: lossHeatColor(task.loss) }}>{task.loss.toFixed(1)}%</span>
            </button>
          );
        })}
      </div>

      {showLoss && chart && lossRows.length > 0 && (
        <div style={{ position: "relative" }}>
          <PingLossStrip
            times={chart[0] as number[]}
            xRange={requestedXRange}
            rows={lossRows}
            chartWidth={w}
            gutter={Y_AXIS_SIZE + CHART_PADDING_LEFT}
            rightPad={CHART_PADDING_RIGHT}
            isDark={isDark}
            cursorLeft={cursorLeft}
          />
        </div>
      )}

      <div ref={chartSizeRef} className="instance-uplot-wrap is-large">
        {chart && options && visibleTasks.length > 0 ? (
          <>
            <UplotReact
              key={`${uuid}-${hours}-${cutPeak ? "smooth" : "raw"}-${connectNulls ? "span" : "gap"}`}
              options={options}
              data={chart}
            />
            <ChartTooltip tooltip={tooltip} />
          </>
        ) : (
          <div className="instance-empty">{t("chart.allHidden")}</div>
        )}
      </div>
    </InstancePanel>
  );
}
