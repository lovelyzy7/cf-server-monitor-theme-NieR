import { translate, useLanguage } from "@/hooks/useLanguage";
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
  { value: 0, label: translate("colors.grayBlack"), title: translate("colors.current") },
  { value: 60, label: translate("colors.deep"), title: translate("colors.keepBlue") },
  { value: 100, label: translate("colors.pure"), title: translate("colors.pureDesc") },
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
  const { t } = useLanguage();
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
    <div className="metric-color-picker" role="group" aria-label={t("shell.colors")} hidden={hidden}>
      <div className="metric-color-picker-head">
        {!canSaveToBackend && <span>{t("colors.custom")}</span>}
        <div className="metric-color-head-actions">
          {canSaveToBackend && (
            <button
              type="button"
              className="metric-color-save-backend"
              onClick={() => void saveToBackend()}
              disabled={savingToBackend}
              title={t("colors.saveSiteHint")}
            >
              {savingToBackend ? <Spinner size={12} /> : <span aria-hidden>⇧</span>}
              <span>{savingToBackend ? t("manage.saving") : t("manage.saveSite")}</span>
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
            {t("colors.resetAll")}
          </button>
        </div>
      </div>
      {backendSaveState && (
        <div className={backendSaveState.kind === "ok" ? "metric-color-notice" : "metric-color-error"}>
          {backendSaveState.text}
        </div>
      )}
      {saveError && <div className="metric-color-error">{t("manage.saveFail")}（{t("manage.loginExpired")}）</div>}
      <div className="metric-color-group">
        <div className="metric-color-group-title">{t("colors.darkBg")}</div>
        <div className="dark-depth-control">
          <div className="dark-depth-presets" role="group" aria-label={t("colors.depth")}>
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
              <span>{t("colors.blackness")}</span>
              <output>{darkDepth}%</output>
            </span>
            <input type="range" min="0" max="100" step="1" value={darkDepth} aria-label={t("colors.blackness")} onChange={(event) => setDarkDepth(Number(event.target.value))} />
          </label>
          {resolvedAppearance !== "dark" && <p className="dark-depth-hint">{t("colors.darkHint")}</p>}
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
                    aria-label={t("colors.colorFor").replace("{label}", label)}
                    title={t("colors.pick")}
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
                    aria-label={t("colors.restoreFor").replace("{label}", label)}
                    title={t("colors.restore")}
                  >
                    <span aria-hidden>↺</span>
                  </button>
                  {open && (
                    <div className="metric-color-popover" role="group" aria-label={t("colors.pickFor").replace("{label}", label)}>
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
                          aria-label={t("colors.hexFor").replace("{label}", label)}
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
