/**
 * Canvas 颜色解析工具。
 *
 * 从 LuminaPlus 的 `components/node/CanvasStrip.tsx` 抽出 —— canvas 的颜色解析器不认
 * color-mix()/calc()，这里借 DOM 的 color 属性让 CSS 引擎算成 rgb；本主题的 NieR 配色
 * 直接给 hex，理论上用不到这些兜底，但自定义配色（useMetricColors）仍会写入任意 CSS 色，
 * 因此完整保留这条解析链。
 */

const cssColorCache = new Map<string, string>();
let cssColorCacheKey: string | null = null;
let colorValidationContext: CanvasRenderingContext2D | null | undefined;

/** 首帧 / 样式未就绪时的回退色，与 automata.css 的 NieR token 保持同值。 */
const CANVAS_COLOR_FALLBACKS = {
  light: {
    "--progress-bg": "#b8b099",
    "--progress-cpu": "#8a5a2b",
    "--progress-memory": "#6b4c2a",
    "--progress-disk": "#8a1414",
    "--progress-network": "#3a4d24",
    "--progress-load": "#57523f",
    "--progress-swap": "#4f4a35",
    "--traffic-up": "#2c2922",
    "--traffic-down": "#57523f",
    "--speed-idle": "#3a4d24",
    "--speed-low": "#a1762b",
    "--speed-high": "#8a5a2b",
    "--speed-max": "#6b0a0a",
    "--status-success": "#3a4d24",
    "--status-warning": "#a1762b",
    "--status-error": "#6b0a0a",
    "--status-info": "#57523f",
    "--status-online": "#3a4d24",
    "--status-offline": "#6b0a0a",
    "--text-tertiary": "#57523f",
  },
  dark: {
    "--progress-bg": "#3a362c",
    "--progress-cpu": "#c99a6b",
    "--progress-memory": "#b08a6b",
    "--progress-disk": "#c96a5a",
    "--progress-network": "#7a9a5b",
    "--progress-load": "#b8b099",
    "--progress-swap": "#9a9178",
    "--traffic-up": "#d8d1bb",
    "--traffic-down": "#b8b099",
    "--speed-idle": "#7a9a5b",
    "--speed-low": "#c9a24a",
    "--speed-high": "#c98a4a",
    "--speed-max": "#c96a5a",
    "--status-success": "#7a9a5b",
    "--status-warning": "#c9a24a",
    "--status-error": "#c96a5a",
    "--status-info": "#b8b099",
    "--status-online": "#7a9a5b",
    "--status-offline": "#c96a5a",
    "--text-tertiary": "#8f8871",
  },
} as const;

function extractCssVarName(color: string): string | null {
  return color.match(/^var\((--[^),\s]+)/)?.[1] ?? null;
}

function fallbackCanvasColor(varName: string | null): string {
  if (!varName) return "#000000";
  const appearance = document.documentElement.dataset.appearance === "dark" ? "dark" : "light";
  return CANVAS_COLOR_FALLBACKS[appearance][
    varName as keyof (typeof CANVAS_COLOR_FALLBACKS)["light"]
  ] ?? "#000000";
}

// 自定义配色不改变 appearance，需要显式失效。
export function clearCssColorCache() {
  cssColorCache.clear();
  cssColorCacheKey = null;
}

function resolveCssColor(color: string): string {
  const varName = extractCssVarName(color);
  if (!varName) return color;

  const appearance = document.documentElement.dataset.appearance ?? "";
  if (appearance !== cssColorCacheKey) {
    cssColorCacheKey = appearance;
    cssColorCache.clear();
  }

  const cached = cssColorCache.get(varName);
  if (cached !== undefined) return cached || color;

  const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (resolved) cssColorCache.set(varName, resolved);
  return resolved || color;
}

let cssEngineProbe: HTMLElement | null = null;
const cssEngineColorCache = new Map<string, string | null>();

function resolveWithCssEngine(value: string): string | null {
  if (typeof document === "undefined") return null;
  const cached = cssEngineColorCache.get(value);
  if (cached !== undefined) return cached;
  if (!cssEngineProbe) {
    cssEngineProbe = document.createElement("span");
    cssEngineProbe.style.display = "none";
    document.documentElement.appendChild(cssEngineProbe);
  }
  cssEngineProbe.style.color = "";
  cssEngineProbe.style.color = value;
  const resolved = cssEngineProbe.style.color
    ? getComputedStyle(cssEngineProbe).color.trim() || null
    : null;
  cssEngineColorCache.set(value, resolved);
  return resolved;
}

function canUseCanvasColor(color: string): boolean {
  if (typeof document === "undefined") return true;
  try {
    if (colorValidationContext === undefined) {
      colorValidationContext = document.createElement("canvas").getContext("2d");
    }
    const ctx = colorValidationContext;
    if (!ctx) return true;

    ctx.fillStyle = "#000001";
    ctx.fillStyle = color;
    if (ctx.fillStyle !== "#000001") return true;

    ctx.fillStyle = "#000002";
    ctx.fillStyle = color;
    return ctx.fillStyle !== "#000002";
  } catch {
    return false;
  }
}

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value);
  if (short) {
    return {
      r: parseInt(`${short[1]}${short[1]}`, 16),
      g: parseInt(`${short[2]}${short[2]}`, 16),
      b: parseInt(`${short[3]}${short[3]}`, 16),
    };
  }
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (full) {
    return {
      r: parseInt(full[1], 16),
      g: parseInt(full[2], 16),
      b: parseInt(full[3], 16),
    };
  }
  return null;
}

/** Canvas 兼容旧 WebKit：用通道插值代替 color-mix()。 */
export function mixSrgbTowardWhite(baseColor: string, baseWeight: number): string {
  const rgb = parseHexColor(baseColor);
  if (!rgb) return baseColor;
  const w = Math.max(0, Math.min(1, baseWeight));
  const channel = (value: number) => Math.round(value * w + 255 * (1 - w));
  return `rgb(${channel(rgb.r)}, ${channel(rgb.g)}, ${channel(rgb.b)})`;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sat = Math.max(0, Math.min(1, s / 100));
  const lig = Math.max(0, Math.min(1, l / 100));
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lig - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** 统一解析并校验 Canvas 颜色，不支持时回退到主题色。 */
export function safeCanvasColor(color: string): string {
  const varName = extractCssVarName(color);
  let value = (varName ? resolveCssColor(color) : color).trim();
  if (!value || /^var\(/i.test(value)) {
    return fallbackCanvasColor(varName);
  }
  if (/color-mix\(|calc\(/i.test(value)) {
    const resolved = resolveWithCssEngine(value);
    if (!resolved) return fallbackCanvasColor(varName);
    value = resolved;
  }

  const hsl = /^hsla?\(([^)]+)\)$/i.exec(value);
  if (hsl) {
    const parts = hsl[1]
      .replace(/\//g, " ")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((part) => parseFloat(part));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      const { r, g, b } = hslToRgb(parts[0], parts[1], parts[2]);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  if (!canUseCanvasColor(value)) return fallbackCanvasColor(varName);
  return value;
}

export function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.fillRect(x, y, width, height);
}

/** 直角矩形（NieR 风格去掉了 LuminaPlus 的圆角）；保留 name 以兼容旧调用。 */
export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  _radius: number,
) {
  void _radius;
  ctx.fillRect(x, y, width, height);
}
