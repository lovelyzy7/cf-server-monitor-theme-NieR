import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { usePreferences } from "@/hooks/usePreferences";
import {
  METRIC_COLOR_GROUPS,
  METRIC_COLOR_META,
  readEffectiveColors,
  useMetricColorsEditor,
  type MetricColorKey,
} from "@/hooks/useMetricColors";

const DARK_DEPTH_PRESETS = [
  { value: 0, label: "灰黑", title: "当前默认色" },
  { value: 60, label: "深黑", title: "保留少量蓝灰层次" },
  { value: 100, label: "纯黑", title: "纯黑画布，卡片保留层级" },
] as const;

const ICONS: Record<MetricColorKey, string> = {
  cpu: "▣",
  memory: "▤",
  disk: "◫",
  load: "≋",
  swap: "▤",
  speedIdle: "↑",
  speedLow: "↑",
  speedHigh: "↑",
  speedMax: "↑",
  trafficUp: "↑",
  trafficDown: "↓",
};

/** 内置色板：NieR 主色 + 常用强调色，取代浏览器原生取色器。 */
const PRESET_COLORS = [
  "#2c2922", "#57523f", "#4f4a35", "#6b4c2a", "#8a5a2b", "#a1762b",
  "#1a1814", "#3a4d24", "#7a9a5b", "#86a762", "#3a6b4f", "#2c5a6b",
  "#8a1414", "#6b0a0a", "#cf7160", "#e28773", "#d2924e", "#d2ab4e",
  "#c99a6b", "#b08a6b", "#9a9178", "#c0b896", "#c2b95e", "#e6dfc9",
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function MetricColorPicker({ hidden = false }: { hidden?: boolean }) {
  const {
    colors,
    darkDepth,
    setColor,
    resetColor,
    setDarkDepth,
    resetAll,
    hasLocalOverrides,
    saveError,
    canSaveToBackend,
    savingToBackend,
    backendSaveState,
    saveToBackend,
  } = useMetricColorsEditor();
  const { resolvedAppearance } = usePreferences();

  const [base, setBase] = useState(readEffectiveColors);
  useEffect(() => setBase(readEffectiveColors()), [resolvedAppearance]);
  const refreshBase = useCallback(() => setBase(readEffectiveColors()), []);

  const valueOf = useCallback(
    (key: MetricColorKey) => colors[key] ?? base[key],
    [colors, base],
  );

  // 内置取色弹层：每行一个，展开后显示预设色板 + HEX 输入。
  const [activeKey, setActiveKey] = useState<MetricColorKey | null>(null);
  const [hexDraft, setHexDraft] = useState("");
  const togglePicker = (key: MetricColorKey) => {
    if (activeKey === key) {
      setActiveKey(null);
      return;
    }
    setActiveKey(key);
    setHexDraft(valueOf(key));
  };
  const commitHex = (key: MetricColorKey, value: string) => {
    setHexDraft(value);
    if (HEX_PATTERN.test(value.trim())) {
      setColor(key, value.trim().toLowerCase());
    }
  };

  return (
    <div className="metric-color-picker" role="group" aria-label="卡片配色" hidden={hidden}>
      <div className="metric-color-picker-head">
        {!canSaveToBackend && <span>配色自定义</span>}
        <div className="metric-color-head-actions">
          {canSaveToBackend && (
            <button
              type="button"
              className="metric-color-save-backend"
              onClick={() => void saveToBackend()}
              disabled={savingToBackend}
              title="把当前配色（连同其它本机设置）写到后端，成为所有设备与访客的默认值"
            >
              {savingToBackend ? <Spinner size={12} /> : <span aria-hidden>⇧</span>}
              <span>{savingToBackend ? "保存中" : "保存到后端"}</span>
            </button>
          )}
          <button
            type="button"
            className="metric-color-reset-all"
            onClick={() => {
              resetAll();
              refreshBase();
            }}
            disabled={!hasLocalOverrides}
          >
            全部重置
          </button>
        </div>
      </div>
      {backendSaveState && (
        <div className={backendSaveState.kind === "ok" ? "metric-color-notice" : "metric-color-error"}>
          {backendSaveState.text}
        </div>
      )}
      {saveError && <div className="metric-color-error">保存失败（请确认已登录管理员）</div>}
      <div className="metric-color-group">
        <div className="metric-color-group-title">暗色背景</div>
        <div className="dark-depth-control">
          <div className="dark-depth-presets" role="group" aria-label="暗色深度预设">
            {DARK_DEPTH_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className="dark-depth-preset"
                data-active={darkDepth === preset.value ? "true" : "false"}
                data-depth={preset.value}
                aria-pressed={darkDepth === preset.value}
                title={preset.title}
                onClick={() => setDarkDepth(preset.value)}
              >
                <span className="dark-depth-preset-swatch" aria-hidden />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
          <label className="dark-depth-range">
            <span className="dark-depth-range-head">
              <span>黑色程度</span>
              <output>{darkDepth}%</output>
            </span>
            <input type="range" min="0" max="100" step="1" value={darkDepth} aria-label="黑色程度" onChange={(event) => setDarkDepth(Number(event.target.value))} />
          </label>
          {resolvedAppearance !== "dark" && <p className="dark-depth-hint">切换到深色模式后查看实际效果</p>}
        </div>
      </div>
      {METRIC_COLOR_GROUPS.map((group) => (
        <div className="metric-color-group" key={group.id}>
          <div className="metric-color-group-title">{group.label}</div>
          <div className="metric-color-list">
            {METRIC_COLOR_META.filter((item) => item.group === group.id).map(({ key, label }) => {
              const overridden = colors[key] != null;
              const open = activeKey === key;
              const current = valueOf(key);
              return (
                <div className="metric-color-row" key={key}>
                  <span aria-hidden>{ICONS[key]}</span>
                  <span className="metric-color-name">{label}</span>
                  <button
                    type="button"
                    className="metric-color-swatch"
                    style={{ background: current }}
                    aria-expanded={open}
                    aria-label={`${label} 颜色`}
                    title="选择颜色"
                    onClick={() => togglePicker(key)}
                  >
                    <span className="metric-color-swatch-arrow" aria-hidden>▾</span>
                  </button>
                  <button
                    type="button"
                    className="metric-color-reset"
                    onClick={() => {
                      resetColor(key);
                      refreshBase();
                    }}
                    disabled={!overridden}
                    aria-label={`恢复 ${label} 默认色`}
                    title="恢复默认"
                  >
                    <span aria-hidden>↺</span>
                  </button>
                  {open && (
                    <div className="metric-color-popover" role="group" aria-label={`${label} 颜色选择`}>
                      <div className="metric-color-presets">
                        {PRESET_COLORS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className="metric-color-preset"
                            style={{ background: preset }}
                            data-active={current.toLowerCase() === preset.toLowerCase() ? "true" : "false"}
                            aria-label={preset}
                            title={preset}
                            onClick={() => {
                              setColor(key, preset);
                              setHexDraft(preset);
                            }}
                          />
                        ))}
                      </div>
                      <label className="metric-color-hex">
                        <span>HEX</span>
                        <input
                          type="text"
                          value={hexDraft}
                          onChange={(event) => commitHex(key, event.target.value)}
                          onBlur={() => setHexDraft(valueOf(key))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") setHexDraft(valueOf(key));
                          }}
                          aria-label={`${label} 十六进制颜色`}
                          spellCheck={false}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
