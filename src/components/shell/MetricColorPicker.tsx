import { translate, useLanguage } from "@/hooks/useLanguage";
import { useCallback, useEffect, useRef, useState } from "react";
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

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const value = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())?.[1] ?? "2c2922";
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

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
    setHsv(hexToHsv(valueOf(key)));
  };
  const commitHex = useCallback((key: MetricColorKey, value: string) => {
    setHexDraft(value);
    if (HEX_PATTERN.test(value.trim())) {
      setColor(key, value.trim().toLowerCase());
    }
  }, [setColor]);

  // 自定义拖动取色：饱和度/明度方块 + 色相条。
  const [hsv, setHsv] = useState(() => hexToHsv("#2c2922"));
  const [dragTarget, setDragTarget] = useState<"sv" | "hue" | null>(null);
  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);

  const pickFromSv = useCallback((key: MetricColorKey, event: { clientX: number; clientY: number }) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setHsv((prev) => {
      const next = { ...prev, s, v };
      commitHex(key, hsvToHex(next.h, next.s, next.v));
      return next;
    });
  }, [commitHex]);

  const pickFromHue = useCallback((key: MetricColorKey, event: { clientX: number }) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const h = Math.max(0, Math.min(360, ((event.clientX - rect.left) / rect.width) * 360));
    setHsv((prev) => {
      const next = { ...prev, h };
      commitHex(key, hsvToHex(next.h, next.s, next.v));
      return next;
    });
  }, [commitHex]);

  useEffect(() => {
    if (!dragTarget || !activeKey) return;
    const onMove = (event: PointerEvent) => {
      if (dragTarget === "sv") pickFromSv(activeKey, event);
      else pickFromHue(activeKey, event);
    };
    const onUp = () => setDragTarget(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragTarget, activeKey, pickFromSv, pickFromHue]);

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
                      <div className="metric-color-drag" aria-label={t("colors.dragPick")}>
                        <div
                          ref={svRef}
                          className="metric-color-sv"
                          style={{
                            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
                          }}
                          onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDragTarget("sv");
                            pickFromSv(key, event);
                          }}
                        >
                          <span
                            className="metric-color-sv-thumb"
                            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv.h, hsv.s, hsv.v) }}
                          />
                        </div>
                        <div
                          ref={hueRef}
                          className="metric-color-hue"
                          onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDragTarget("hue");
                            pickFromHue(key, event);
                          }}
                        >
                          <span className="metric-color-hue-thumb" style={{ left: `${hsv.h / 3.6}%`, background: `hsl(${hsv.h}, 100%, 50%)` }} />
                        </div>
                      </div>
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
                              setHsv(hexToHsv(preset));
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
