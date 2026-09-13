import { Outlet, useLocation } from "react-router-dom";
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
import { Spinner } from "@/components/ui/Spinner";

export function AppShell() {
  useAppearance();
  useSiteMetadata();
  useMetricColorsSync();
  const { pathname, search } = useLocation();
  const publicConfig = usePublicConfig();
  const auth = useAuth();
  const pingRefresh = usePingHistoryRefresh();
  const normalizedPath = (pathname.replace(/\/+$/, "") || "/").toLowerCase();
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
      <TerminalBar pingRefresh={pingRefresh} />
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
  return (
    <div className="center-box">
      <div>
        <div className="bracket-header">无法读取站点配置</div>
        <p style={{ color: "var(--fg-mid)" }}>请检查网络后重试。</p>
      </div>
      <button type="button" onClick={onRetry}>
        [ 重试 ]
      </button>
    </div>
  );
}

function PrivateSiteGate() {
  return (
    <div className="center-box">
      <div className="panel inverse panel-corners" style={{ maxWidth: 420, padding: "24px 32px" }}>
        <div className="bracket-header" style={{ marginTop: 0 }}>
          访问受限
        </div>
        <p style={{ margin: "0 0 16px" }}>站点已设为私有，登录后即可查看节点数据。</p>
        <a className="button" href={getAdminUrl()}>
          前往登录
        </a>
      </div>
    </div>
  );
}
