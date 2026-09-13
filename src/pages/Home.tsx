import { lazy, Suspense } from "react";
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
