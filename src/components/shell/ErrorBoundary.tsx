import { Component, useEffect, type ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { readViewModeHint, useViewMode } from "@/hooks/useViewMode";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "页面渲染时发生异常";
}

function safeLocation(): string {
  if (typeof location === "undefined") return "(n/a)";
  const view = /[?&]view=([^&]+)/.exec(location.search || "");
  return `${location.origin}${location.pathname}${view ? `?view=${view[1]}` : ""}`;
}

function buildDiagnostics(error: unknown, mode: string): string {
  const err = error instanceof Error ? error : null;
  return [
    `name: ${err?.name ?? typeof error}`,
    `message: ${getErrorMessage(error)}`,
    `mode: ${mode}`,
    `url: ${safeLocation()}`,
    `ua: ${typeof navigator !== "undefined" ? navigator.userAgent : "(n/a)"}`,
    `stack: ${err?.stack ?? "(none)"}`,
  ].join("\n");
}

async function copyDiagnostics(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // 文本仍保留在页面中，可手动复制。
  }
}

function reloadPage() {
  window.location.reload();
}

function ErrorFallback({
  title = "页面出错了",
  message,
  diagnostics,
}: {
  title?: string;
  message?: string;
  diagnostics?: string;
}) {
  return (
    <div className="center-box" style={{ padding: 24 }}>
      <section className="panel panel-corners" role="alert" style={{ maxWidth: 560, textAlign: "left" }}>
        <h1 className="bracket-header" style={{ marginTop: 0 }}>{title}</h1>
        <p style={{ color: "var(--fg-mid)", margin: "0 0 16px" }}>
          {message || "可以刷新页面，或返回首页重新进入。"}
        </p>
        {diagnostics && (
          <details style={{ fontSize: 12, color: "var(--fg-mid)", marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", userSelect: "none" }}>
              诊断信息（反馈时请一并截图或复制）
            </summary>
            <pre
              style={{
                margin: "8px 0 0",
                maxHeight: "9rem",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                lineHeight: 1.45,
                color: "var(--fg-dark)",
                background: "var(--bg-cream)",
                border: "var(--border-thin)",
                padding: "8px 10px",
                userSelect: "text",
              }}
            >
              {diagnostics}
            </pre>
            <button type="button" onClick={() => void copyDiagnostics(diagnostics)}>
              复制诊断信息
            </button>
          </details>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={reloadPage}>
            [ 刷新 ]
          </button>
          <a className="button" href="#/">返回首页</a>
        </div>
      </section>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(
      "[Nier] render error\n" + buildDiagnostics(error, readViewModeHint()),
      info,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          message={getErrorMessage(this.state.error)}
          diagnostics={buildDiagnostics(this.state.error, readViewModeHint())}
        />
      );
    }
    return this.props.children;
  }
}

export function RouteErrorFallback() {
  const error = useRouteError();
  const { mode, device } = useViewMode();
  const diagnostics = buildDiagnostics(error, `${device}/${mode}`);

  useEffect(() => {
    console.error("[Nier] route error\n" + diagnostics);
  }, [diagnostics]);

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorFallback
        title={`${error.status} ${error.statusText || "路由错误"}`}
        message={typeof error.data === "string" ? error.data : "当前路由加载失败。"}
        diagnostics={diagnostics}
      />
    );
  }

  return <ErrorFallback message={getErrorMessage(error)} diagnostics={diagnostics} />;
}
