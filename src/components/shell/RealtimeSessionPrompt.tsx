import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import {
  getStoreStatusSnapshot,
  resumeRealtimeSession,
  setRealtimeSessionLimitMinutes,
  subscribeStoreStatus,
} from "@/services/wsStore";

/**
 * 「实时连接已达到时限」提示（后台 `frontend_ws_timeout_minutes`）。
 * 到点断开、问用户是否继续都是前端的事；点「关闭」保持断开，不静默重连。
 * 不做成模态：提示出现时人多半不在屏幕前，挡住页面没有意义。
 */
export function RealtimeSessionPrompt() {
  const { data: config } = usePublicConfig();
  const minutes = config?.frontendWsTimeoutMinutes ?? 0;
  const titleId = useId();
  const status = useSyncExternalStore(
    subscribeStoreStatus,
    getStoreStatusSnapshot,
    getStoreStatusSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setRealtimeSessionLimitMinutes(minutes);
  }, [minutes]);

  useEffect(() => {
    if (!status.realtimeSessionExpired) setDismissed(false);
  }, [status.realtimeSessionExpired]);

  if (!status.realtimeSessionExpired || dismissed) return null;

  return (
    <section
      className="banner realtime-session-prompt"
      aria-labelledby={titleId}
      aria-live="polite"
    >
      <div className="realtime-session-prompt-body">
        <strong id={titleId}>&gt; 实时连接已达到时限并断开</strong>
        <p>
          {minutes > 0 ? `站点限制单次实时连接 ${minutes} 分钟，` : ""}页面停在断开前的数据。
        </p>
      </div>
      <div className="realtime-session-prompt-actions">
        <button type="button" onClick={() => setDismissed(true)}>
          关闭
        </button>
        <button type="button" onClick={resumeRealtimeSession}>
          继续接收
        </button>
      </div>
    </section>
  );
}
