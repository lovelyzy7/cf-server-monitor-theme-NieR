import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/Spinner";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { getSiteConfig } from "@/services/api";
import { getTurnstileVerified, setTurnstileToken } from "@/services/cfsm/config";

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile 脚本加载失败"));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export function TurnstileGate() {
  const { data: config } = usePublicConfig();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const needsVerification =
    config?.turnstile_enabled === true &&
    config.verified !== true &&
    !getTurnstileVerified() &&
    Boolean(config.turnstile_site_key);

  const submitToken = useCallback(
    async (token: string) => {
      setVerifying(true);
      setError(null);
      try {
        setTurnstileToken(token);
        await getSiteConfig();
        if (!getTurnstileVerified()) {
          throw new Error("验证未通过，请重试");
        }
        await queryClient.invalidateQueries();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "验证失败");
      } finally {
        setVerifying(false);
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!needsVerification || !config) return;

    let cancelled = false;
    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: config.turnstile_site_key,
          theme: "auto",
          callback: (token) => {
            void submitToken(token);
          },
          "error-callback": () => setError("人机验证组件加载失败"),
          "expired-callback": () => setError("验证已过期，请重新完成验证"),
        });
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "验证组件加载失败");
        }
      });

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // 组件已被卸载时忽略。
        }
      }
    };
  }, [config, needsVerification, submitToken]);

  if (!needsVerification) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(20,18,14,0.55)",
      }}
    >
      <div className="panel panel-corners" style={{ width: "min(24rem, 90vw)" }}>
        <h1 className="bracket-header" style={{ marginTop: 0 }}>
          身份验证
        </h1>
        <p style={{ color: "var(--fg-mid)", fontSize: 13, margin: "0 0 16px" }}>
          本站开启了 Cloudflare Turnstile 验证，通过后即可查看节点数据。
        </p>
        <div ref={containerRef} />
        {verifying && <Spinner size={18} />}
        {error && (
          <p role="alert" style={{ fontSize: 12, color: "var(--danger)", marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
