import { createHashRouter, Navigate, useParams } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RouteErrorFallback } from "@/components/shell/ErrorBoundary";
import { Home } from "@/pages/Home";

const Instance = lazy(() =>
  import("@/pages/Instance").then((m) => ({ default: m.Instance })),
);
const Traffic = lazy(() =>
  import("@/pages/Traffic").then((m) => ({ default: m.Traffic })),
);
const NotFound = lazy(() =>
  import("@/pages/NotFound").then((m) => ({ default: m.NotFound })),
);

function LoadingFallback() {
  return (
    <div className="center-box">
      <span className="nie-spinner is-lg" aria-hidden />
      <span>LOADING…</span>
    </div>
  );
}

function suspended(page: ReactNode) {
  return <Suspense fallback={<LoadingFallback />}>{page}</Suspense>;
}

/** 兼容早期 `#/instance/:uuid` 链接。 */
function LegacyInstanceRedirect() {
  const { uuid } = useParams<{ uuid: string }>();
  return <Navigate to={`/server/${uuid ?? ""}`} replace />;
}

// CF-Server-Monitor 的主题路由约定是 hash 路由：首页 `/#/`，详情页 `/#/server/:id`。
export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <Home /> },
      { path: "server/:uuid", element: suspended(<Instance />) },
      { path: "instance/:uuid", element: <LegacyInstanceRedirect /> },
      { path: "traffic", element: suspended(<Traffic />) },
      { path: "404", element: suspended(<NotFound />) },
      { path: "*", element: <Navigate to="/404" replace /> },
    ],
  },
]);
