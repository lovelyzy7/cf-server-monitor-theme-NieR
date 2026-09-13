import { lazy, Suspense, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { NodeGrid } from "@/components/node/NodeGrid";
import { useLanguage } from "@/hooks/useLanguage";
import { Spinner } from "@/components/ui/Spinner";

const ThemeManage = lazy(() =>
  import("@/pages/ThemeManage").then((module) => ({ default: module.ThemeManage })),
);

export function Home() {
  const [searchParams] = useSearchParams();
  const isThemeManageView = searchParams.get("view") === "theme-manage";
  const { t } = useLanguage();

  // 空闲时预取详情页与流量页分块：第一次打开实例详情不再因下载代码而闪动。
  useEffect(() => {
    const idle: (cb: () => void, opts?: { timeout: number }) => number =
      (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback ??
      ((cb) => window.setTimeout(cb, 1500));
    const cancel: (handle: number) => void =
      (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback ??
      ((handle) => window.clearTimeout(handle));
    const handle = idle(() => {
      void import("@/pages/Instance");
      void import("@/pages/Traffic");
    }, { timeout: 2000 });
    return () => cancel(handle);
  }, []);

  if (isThemeManageView) {
    return (
      <Suspense
        fallback={
          <div className="center-box">
            <Spinner size={24} />
          </div>
        }
      >
        <ThemeManage />
      </Suspense>
    );
  }

  return (
    <div>
      <h1 className="bracket-header">{t("title.status")}</h1>
      <NodeGrid />
    </div>
  );
}
