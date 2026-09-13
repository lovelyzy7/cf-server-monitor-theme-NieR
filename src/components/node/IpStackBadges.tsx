/** V4/V6 双栈标识：只亮「有/无」标签，不渲染 IP 本身。 */
export function IpStackBadges({
  ipv4,
  ipv6,
}: {
  ipv4?: string | null;
  ipv6?: string | null;
}) {
  if (!ipv4 && !ipv6) return null;
  return (
    <>
      {ipv4 ? <span className="ip-stack-badge">V4</span> : null}
      {ipv6 ? <span className="ip-stack-badge">V6</span> : null}
    </>
  );
}
