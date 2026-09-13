import { useVersionInfo } from "@/hooks/useVersionInfo";
import { formatVersionLabel } from "@/utils/versionCompare";
import { THEME_DISPLAY_NAME, THEME_REPO_URL } from "@/utils/themeMeta";

const BACKEND_REPO_URL = "https://github.com/huilang-me/CF-Server-Monitor";

/**
 * 站点页脚：NieR 的「传输结束」行 + 后端/主题署名（各带版本号悬停提示）。
 * 主题规范要求必须展示 `Powered by CF-Server-Monitor` 并链接到后端仓库。
 */
export function SiteFooter() {
  const { backend, theme } = useVersionInfo();
  return (
    <footer className="site-footer">
      <div>End of transmission // Glory to mankind</div>
      <div style={{ marginTop: 6, letterSpacing: "0.08em", textTransform: "none" }}>
        Powered by{" "}
        <a
          className="site-footer-link"
          href={BACKEND_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={backend.current ? formatVersionLabel(backend.current) : undefined}
        >
          CF-Server-Monitor
        </a>
        {backend.update && (
          <a
            className="site-footer-update"
            href={BACKEND_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={`${formatVersionLabel(backend.current ?? "")} → ${formatVersionLabel(backend.update)}`}
          >
            新版 {formatVersionLabel(backend.update)}
          </a>
        )}
        <span aria-hidden> · </span>
        Theme by{" "}
        <a
          className="site-footer-link"
          href={THEME_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={theme.current ? formatVersionLabel(theme.current) : undefined}
        >
          {THEME_DISPLAY_NAME}
        </a>
        {theme.update && (
          <a
            className="site-footer-update"
            href={THEME_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={`${formatVersionLabel(theme.current ?? "")} → ${formatVersionLabel(theme.update)}`}
          >
            新版 {formatVersionLabel(theme.update)}
          </a>
        )}
      </div>
    </footer>
  );
}
