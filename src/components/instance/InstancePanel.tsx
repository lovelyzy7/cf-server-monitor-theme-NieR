import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Spinner } from "@/components/ui/Spinner";

/** 实例详情页的分节面板，NieR 角括号面板。 */
export function InstancePanel({
  title,
  kicker,
  titleAction,
  description,
  aside,
  children,
  className,
}: {
  title: string;
  kicker?: ReactNode;
  titleAction?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("panel panel-corners", className)} style={{ marginTop: 16 }}>
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          {kicker != null && (
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--fg-mid)",
              }}
            >
              {kicker}
            </span>
          )}
          <h2 className="bracket-header" style={{ margin: "4px 0 4px", fontSize: 15 }}>
            {title}
            {titleAction}
          </h2>
          {description != null && (
            <p style={{ margin: 0, color: "var(--fg-mid)", fontSize: 12 }}>{description}</p>
          )}
        </div>
        {aside != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {aside}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

export function InstanceChartLoading({ title }: { title: string }) {
  return (
    <InstancePanel title={title}>
      <div
        style={{
          minHeight: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "var(--fg-mid)",
        }}
        aria-busy
      >
        <Spinner size={22} label="" />
        <span>加载中…</span>
      </div>
    </InstancePanel>
  );
}
