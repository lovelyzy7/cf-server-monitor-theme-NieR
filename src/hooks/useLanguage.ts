import { useCallback, useSyncExternalStore } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "cfsm-nier:lang";

const STRINGS = {
  zh: {
    "nav.status": "状态",
    "nav.assets": "资产",
    "nav.traffic": "流量",
    "nav.settings": "设置",
    "nav.admin": "后台",
    "title.status": "系统状态",
    "title.traffic": "今日流量",
    "title.assets": "资产统计",
    "title.settings": "主题设置",
    "common.back": "← 返回",
    "common.backHome": "← 返回首页",
    "common.loading": "加载中…",
    "common.refresh": "刷新",
    "common.retry": "重试",
    "common.nodata": "暂无节点数据",
    "ping.latency": "延迟",
    "ping.loss": "丢包",
    "card.down": "↓ 下行",
    "card.up": "↑ 上行",
    "card.traffic": "流量",
    "card.uptime": "运行",
    "card.expire": "到期",
    "card.free": "免费",
    "status.online": "ONLINE",
    "status.offline": "OFFLINE",
    "status.pending": "等待后端推送…",
    "footer.tagline": "End of transmission // Glory to mankind",
  },
  en: {
    "nav.status": "Status",
    "nav.assets": "Assets",
    "nav.traffic": "Traffic",
    "nav.settings": "Settings",
    "nav.admin": "Admin",
    "title.status": "System Status",
    "title.traffic": "Today's Traffic",
    "title.assets": "Asset Summary",
    "title.settings": "Theme Settings",
    "common.back": "← Back",
    "common.backHome": "← Back to Home",
    "common.loading": "Loading…",
    "common.refresh": "Refresh",
    "common.retry": "Retry",
    "common.nodata": "No nodes yet",
    "ping.latency": "Latency",
    "ping.loss": "Loss",
    "card.down": "↓ Down",
    "card.up": "↑ Up",
    "card.traffic": "Traffic",
    "card.uptime": "Uptime",
    "card.expire": "Expiry",
    "card.free": "Free",
    "status.online": "ONLINE",
    "status.offline": "OFFLINE",
    "status.pending": "Waiting for backend…",
    "footer.tagline": "End of transmission // Glory to mankind",
  },
} as const;

export type I18nKey = keyof (typeof STRINGS)["zh"];

function readStoredLang(): Lang {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

let lang: Lang = readStoredLang();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return lang;
}

function emit() {
  for (const listener of listeners) listener();
}

export function setLang(next: Lang) {
  if (lang === next) return;
  lang = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 隐私模式写不进去时，本次会话内仍生效。
  }
  emit();
}

export function getLang(): Lang {
  return lang;
}

/** 语言切换 + 翻译函数。默认 zh，用户可切到 en；持久化在 localStorage。 */
export function useLanguage() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback((next: Lang) => setLang(next), []);
  const t = useCallback(
    (key: I18nKey) => STRINGS[current][key] ?? STRINGS.zh[key] ?? key,
    [current],
  );
  return { lang: current, setLang: set, t };
}
