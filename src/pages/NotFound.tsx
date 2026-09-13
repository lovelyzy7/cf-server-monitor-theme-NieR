import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="center-box">
      <div className="bracket-header" style={{ fontSize: 28, letterSpacing: "0.2em" }}>
        404
      </div>
      <p style={{ color: "var(--fg-mid)" }}>页面未找到</p>
      <Link className="button" to="/">
        返回首页
      </Link>
    </div>
  );
}
