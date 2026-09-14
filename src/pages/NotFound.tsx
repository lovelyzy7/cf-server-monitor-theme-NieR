import { useLanguage } from "@/hooks/useLanguage";
import { Link } from "react-router-dom";

export function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="center-box">
      <div className="bracket-header" style={{ fontSize: 28, letterSpacing: "0.2em" }}>
        404
      </div>
      <p style={{ color: "var(--fg-mid)" }}>{t("notfound.title")}</p>
      <Link className="button" to="/">
        {t("common.backHome")}
      </Link>
    </div>
  );
}
