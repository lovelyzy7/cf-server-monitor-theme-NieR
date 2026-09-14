import { useLanguage } from "@/hooks/useLanguage";
import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BackgroundLayer } from "./BackgroundLayer";
import { TerminalBar } from "./TerminalBar";
import { TurnstileGate } from "./TurnstileGate";
import { SiteFooter } from "./Footer";
import { RealtimeSessionPrompt } from "./RealtimeSessionPrompt";
import { useAppearance } from "@/hooks/useAppearance";
import { useAuth } from "@/hooks/useAuth";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useSiteMetadata } from "@/hooks/useSiteMetadata";
import { useMetricColorsSync } from "@/hooks/useMetricColors";
import { useNodeStoreStatus } from "@/hooks/useNode";
import { usePingHistoryRefresh } from "@/hooks/usePingHistoryRefresh";
import { getAdminUrl } from "@/services/cfsm/config";
import { clearHistoryCache } from "@/services/api";
import { Spinner } from "@/components/ui/Spinner";

export function AppShell() {
  useAppearance();
  useSiteMetadata();
  useMetricColorsSync();
  const headRef = useRef<HTMLDivElement | null>(null);

  // 顶部导航区（终端栏 + 主导航）常驻顶部：量出高度供页面吸顶条使用。
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty("--app-head-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { pathname, search } = useLocation();
  const publicConfig = usePublicConfig();
  const auth = useAuth();
  const pingRefresh = usePingHistoryRefresh();
  const queryClient = useQueryClient();
  const normalizedPath = (pathname.replace(/\/+$/, "") || "/").toLowerCase();
  // 切换页面回到顶部（hash 路由不会自动滚动）。
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [normalizedPath, search]);
  // 浏览器前进/后退：软刷新——清空查询缓存并回顶，不整页重载。
  // 整页 reload 会误伤正常导航（某些浏览器/环境对同文档 hash 导航也发 popstate，
  // 导致第一次打开详情页闪动刷新）。
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // bfcache 恢复：软刷新即可重新拉取数据。
        queryClient.clear();
        clearHistoryCache();
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };
    const onPopState = () => {
      queryClient.clear();
      clearHistoryCache();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
    };
  }, [queryClient]);
  const isDataRoute =
    normalizedPath === "/" ||
    normalizedPath === "/traffic" ||
    normalizedPath.startsWith("/server/");
  const isCheckingAccess =
    isDataRoute &&
    (publicConfig.isPending ||
      (publicConfig.data?.private_site === true && auth.isPending));
  const accessError = isDataRoute && publicConfig.isError && !publicConfig.data;
  const isPrivateVisitor =
    isDataRoute &&
    publicConfig.data?.private_site === true &&
    !auth.isPending &&
    auth.data?.logged_in !== true;
  const isHomeDashboard =
    normalizedPath === "/" && new URLSearchParams(search).get("view") !== "theme-manage";
  const canHydrateHome =
    isHomeDashboard && !isCheckingAccess && !accessError && !isPrivateVisitor;
  const homeStoreStatus = useNodeStoreStatus(canHydrateHome);
  const isCheckingHomeData =
    canHydrateHome && !homeStoreStatus.hydrated && !homeStoreStatus.nodeInfoError;
  const isCheckingShell = isCheckingAccess || isCheckingHomeData;

  return (
    <>
      <BackgroundLayer />
      <div className="app-head" ref={headRef}>
        <TerminalBar pingRefresh={pingRefresh} />
      </div>
      <TurnstileGate />
      <main className="app-main">
        {isCheckingShell ? (
          <div className="center-box">
            <Spinner size={24} />
          </div>
        ) : accessError ? (
          <AccessError onRetry={() => void publicConfig.refetch()} />
        ) : isPrivateVisitor ? (
          <PrivateSiteGate />
        ) : (
          <Outlet />
        )}
      </main>
      <SiteFooter />
      <RealtimeSessionPrompt />
    </>
  );
}

function AccessError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="center-box">
      <div>
        <div className="bracket-header">{t("shell.accessError")}</div>
        <p style={{ color: "var(--fg-mid)" }}>{t("shell.accessErrorSub")}</p>
      </div>
      <button type="button" onClick={onRetry}>
        [ {t("common.retry")} ]
      </button>
    </div>
  );
}

function PrivateSiteGate() {
  const { t } = useLanguage();
  return (
    <div className="center-box">
      <div className="panel inverse panel-corners" style={{ maxWidth: 420, padding: "24px 32px" }}>
        <div className="bracket-header" style={{ marginTop: 0 }}>
          {t("shell.private")}
        </div>
        <p style={{ margin: "0 0 16px" }}>{t("shell.privateSub")}</p>
        <a className="button" href={getAdminUrl()}>
          {t("shell.gotoLogin")}
        </a>
      </div>
    </div>
  );
}
