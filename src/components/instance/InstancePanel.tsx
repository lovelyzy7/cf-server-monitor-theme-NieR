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
      <header className="instance-panel-header">
        <div className="instance-panel-headings">
          {kicker != null && <span className="instance-panel-kicker">{kicker}</span>}
          <div className="instance-panel-title-row">
            <h2 className="instance-panel-title">{title}</h2>
            {titleAction}
          </div>
          {description != null && <p className="instance-panel-description">{description}</p>}
        </div>
        {aside != null && <div className="instance-panel-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export function InstanceChartLoading({ title }: { title: string }) {
  return (
    <InstancePanel title={title}>
      <div className="instance-chart-loading" aria-busy>
        <Spinner size={22} label="" />
        <span>加载中…</span>
      </div>
    </InstancePanel>
  );
}
