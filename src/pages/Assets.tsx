import { useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Flag } from "@/components/ui/Flag";
import { Spinner } from "@/components/ui/Spinner";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useHourlyClock } from "@/hooks/useClock";
import { useVisibleNodes } from "@/hooks/useVisibleNodes";
import { useLanguage } from "@/hooks/useLanguage";
import { calculateCostSummary, formatCnyMoney, formatSignedCny, getExchangeRates } from "@/utils/cost";
import { formatBillingCycle } from "@/utils/billing";
import { getExpireDaysRemaining, LONG_TERM_EXPIRE_DAYS } from "@/utils/format";
import { getRenewalReminders } from "@/utils/renewalReminder";

type AssetDetail = ReturnType<typeof calculateCostSummary>["details"][number];
type AssetsSortField = "weight" | "price" | "remaining" | "premium" | "premiumMonthly" | "expiry";
type AssetsSortDirection = "asc" | "desc";

const NATURAL_DIRECTION: Record<AssetsSortField, AssetsSortDirection> = {
  weight: "asc", price: "desc", remaining: "desc", premium: "desc", premiumMonthly: "desc", expiry: "asc",
};

const TABLE_COLUMNS: Array<{ field: AssetsSortField; label: string; numeric?: boolean }> = [
  { field: "weight", label: "节点" },
  { field: "price", label: "价格", numeric: true },
  { field: "remaining", label: "剩余价值", numeric: true },
  { field: "premium", label: "溢价", numeric: true },
  { field: "premiumMonthly", label: "溢价月摊", numeric: true },
  { field: "expiry", label: "到期", numeric: true },
];

const MOBILE_SORT_OPTIONS: Array<{ field: AssetsSortField; label: string }> = [
  { field: "weight", label: "权重" },
  { field: "price", label: "价格" },
  { field: "premium", label: "溢价" },
  { field: "expiry", label: "到期" },
];

const ASSETS_MOBILE_QUERY = "(max-width: 720px)";
const EMPTY_RATES: Record<string, number> = {};

function sortValue(detail: AssetDetail, field: AssetsSortField): number {
  switch (field) {
    case "price": return detail.priceCny;
    case "remaining": return detail.remainingCny;
    case "premium": return detail.premiumCny;
    case "premiumMonthly": return detail.premiumMonthlyCny;
    case "expiry": {
      const days = getExpireDaysRemaining(detail.expiredAt);
      return days == null ? Number.POSITIVE_INFINITY : days;
    }
    default: return detail.weight;
  }
}

function formatCostExpiry(expiredAt: string) {
  const days = getExpireDaysRemaining(expiredAt);
  if (days == null) return "到期未知";
  if (days > LONG_TERM_EXPIRE_DAYS) return "长期";
  if (days < 0) return "已过期";
  if (days === 0) return "今日到期";
  return `${days} 天后到期`;
}

function premiumTone(value: number) {
  if (value > 0) return "var(--status-error)";
  if (value < 0) return "var(--status-success)";
  return "var(--fg-mid)";
}

function assetsRenewalTone(daysRemaining: number): "critical" | "warning" {
  return daysRemaining <= 3 ? "critical" : "warning";
}

function assetsRenewalLabel(daysRemaining: number) {
  return daysRemaining < 0 ? "已过期" : "即将到期";
}

function HeroMoney({ value }: { value: number | null }) {
  if (value == null) return <span className="assets-hero-value is-pending">计算中</span>;
  const [int, frac = "00"] = formatCnyMoney(value).replace("¥", "").trim().split(".");
  return (
    <span className="assets-hero-value">
      <span className="assets-hero-currency">¥</span>
      {int}
      <span className="assets-hero-frac">.{frac}</span>
    </span>
  );
}

export function Assets() {
  const [sortField, setSortField] = useState<AssetsSortField>("weight");
  const [sortDirection, setSortDirection] = useState<AssetsSortDirection>("asc");
  const isMobileLayout = useMediaQuery(ASSETS_MOBILE_QUERY);
  const now = useHourlyClock();
  const { t } = useLanguage();
  const themeSettings = useThemeSettings();
  const forceRateRefresh = useRef(false);
  const nodes = useVisibleNodes();
  const renewalReminders = useMemo(() => getRenewalReminders(nodes, now), [nodes, now]);
  const renewalByUuid = useMemo(() => new Map(renewalReminders.map((item) => [item.uuid, item])), [renewalReminders]);
  const rateQuery = useQuery({
    queryKey: ["cost-rates", themeSettings.costRateApiUrl],
    queryFn: ({ signal }) => {
      const ignoreCache = forceRateRefresh.current;
      forceRateRefresh.current = false;
      return getExchangeRates(themeSettings.costRateApiUrl, { signal, ignoreCache });
    },
    staleTime: 60 * 60 * 1000,
    enabled: themeSettings.isReady && nodes.length > 0,
    retry: 1,
  });
  const ratesFetching = rateQuery.fetchStatus === "fetching" && !rateQuery.data;
  const rates = rateQuery.data?.rates ?? (ratesFetching ? null : EMPTY_RATES);
  const summary = useMemo(
    () => rates
      ? calculateCostSummary(nodes, themeSettings.costIgnoredNodes, rates, themeSettings.costPremiums, now)
      : null,
    [nodes, now, themeSettings.costIgnoredNodes, themeSettings.costPremiums, rates],
  );
  const detailRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const rows = (summary?.details ?? []).map((detail) => ({ detail, key: sortValue(detail, sortField) }));
    rows.sort((a, b) => {
      if (a.detail.counted !== b.detail.counted) return a.detail.counted ? -1 : 1;
      return (a.key - b.key) * direction || a.detail.name.localeCompare(b.detail.name, "zh-CN");
    });
    return rows.map(({ detail }) => detail);
  }, [sortDirection, sortField, summary]);
  const exchangeRateRows = useMemo(() => {
    if (!rateQuery.data?.rates.CNY) return [];
    const rates = rateQuery.data.rates;
    return ["USD", "HKD", "EUR", "GBP", "JPY"]
      .map((code) => (rates[code] ? { code, value: rates.CNY / rates[code] } : null))
      .filter((item): item is { code: string; value: number } => Boolean(item));
  }, [rateQuery.data]);

  const handleSort = (field: AssetsSortField) => {
    if (field === sortField) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection(NATURAL_DIRECTION[field]); }
  };

  if (!themeSettings.isReady) {
    return <div className="center-box"><Spinner size={24} /></div>;
  }

  if (!themeSettings.showCostSummary && !themeSettings.showCostSummaryFloatingButton) {
    return <Navigate to="/" replace />;
  }

  const hasPremium = summary?.details.some((detail) => detail.premiumCny !== 0) ?? false;
  const ledgerRows: Array<{ label: string; value: string; tone?: string; title?: string }> = [
    { label: "年化总支出", value: summary ? formatCnyMoney(summary.totalCny) : "--" },
    { label: "月均支出", value: summary ? formatCnyMoney(summary.monthlyCny) : "--" },
    ...(summary != null && hasPremium
      ? [{ label: "溢价盈亏", value: formatSignedCny(summary.premiumTotalCny), tone: premiumTone(summary.premiumTotalCny), title: "所有节点「收购溢价」的加总（正数=溢价多花钱，负数=折价少花钱）" }]
      : []),
    ...(summary != null && summary.premiumMonthlyTotalCny !== 0
      ? [{ label: "真实月均", value: formatCnyMoney(summary.effectiveMonthlyCny), title: "月均支出 + 溢价月摊，仅作参考" }]
      : []),
    ...(summary != null && hasPremium
      ? [{ label: "实际剩余价值", value: formatCnyMoney(summary.actualRemainingCny), title: "剩余价值 + 尚未摊销的溢价" }]
      : []),
  ];

  const directionIcon = sortDirection === "asc" ? "▲" : "▼";

  return (
    <div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link className="button" to="/">{t("common.back")}</Link>
        <button type="button" onClick={() => { forceRateRefresh.current = true; void rateQuery.refetch(); }} disabled={rateQuery.isFetching} aria-busy={rateQuery.isFetching} title={t("common.refresh")}>
          ⟳ {t("common.refresh")}
        </button>
      </div>

      <h1 className="bracket-header">{t("title.assets")}</h1>

      {nodes.length === 0 ? (
        <div className="center-box" style={{ minHeight: "40vh" }}>
          <span style={{ color: "var(--fg-mid)" }}>{t("common.nodata")}</span>
        </div>
      ) : (
        <>
          <div className="panel inverse panel-corners assets-hero" style={{ marginTop: 16, position: "relative" }}>
            <span className="assets-hero-mark" aria-hidden>¥</span>
            <div className="assets-hero-main">
              <span className="assets-eyebrow" title="按各节点账单价格折算的剩余价值，不含收购溢价">
                剩余价值
              </span>
              <div><HeroMoney value={summary ? summary.remainingCny : null} /></div>
            </div>
            <dl className="assets-ledger">
              {ledgerRows.map((row) => (
                <div className="assets-ledger-row" key={row.label} title={row.title}>
                  <dt>{row.label}</dt>
                  <dd style={row.tone ? { color: row.tone } : undefined}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="assets-section-head">
            <span className="assets-eyebrow">明细</span>
            <span className="assets-count">{detailRows.length} 台</span>
            {renewalReminders.length > 0 && (
              <span className="assets-renewal-inline">◆ {renewalReminders.length} 台临期</span>
            )}
            {isMobileLayout && (
              <span className="cost-summary-sort-tabs" role="group" aria-label="排序字段">
                {MOBILE_SORT_OPTIONS.map((option) => (
                  <button key={option.field} type="button" className="cost-summary-sort-tab" data-active={sortField === option.field} onClick={() => handleSort(option.field)}>
                    {option.label}
                  </button>
                ))}
                <button type="button" className="cost-summary-action is-direction" onClick={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}>
                  {directionIcon}
                </button>
              </span>
            )}
          </div>

          {summary ? (
            <>
              {!isMobileLayout ? (
                <div className="panel assets-table-wrap">
                  <table className="monitor assets-table">
                    <thead>
                      <tr>
                        {TABLE_COLUMNS.map((column) => (
                          <th key={column.field} data-numeric={column.numeric || undefined} aria-sort={sortField === column.field ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}>
                            <button type="button" onClick={() => handleSort(column.field)} data-active={sortField === column.field}>
                              {column.label}{sortField === column.field && ` ${directionIcon}`}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((detail) => {
                        const reminder = renewalByUuid.get(detail.uuid);
                        const renewalTone = reminder ? assetsRenewalTone(reminder.daysRemaining) : undefined;
                        const renewalLabel = reminder ? assetsRenewalLabel(reminder.daysRemaining) : undefined;
                        return (
                          <tr key={detail.uuid} data-counted={detail.counted}>
                            <td>
                              <Link to={`/server/${encodeURIComponent(detail.uuid)}`} className="assets-node-link" title={detail.name}>
                                <Flag region={detail.region} size={12} />
                                <span>{detail.name}</span>
                              </Link>
                            </td>
                            <td data-numeric>
                              {detail.counted ? `${formatCnyMoney(detail.priceCny)}/${formatBillingCycle(detail.billingCycleDays)}` : <span className="assets-note-chip">{detail.note}</span>}
                            </td>
                            <td data-numeric data-strong>{detail.counted ? formatCnyMoney(detail.remainingCny) : "—"}</td>
                            <td data-numeric>
                              {detail.premiumCny !== 0 ? <span style={{ color: premiumTone(detail.premiumCny) }}>{formatSignedCny(detail.premiumCny)}</span> : "—"}
                            </td>
                            <td data-numeric>
                              {detail.premiumCny !== 0 && detail.amortMonths != null ? (
                                <span title={`摊销 ${Math.round(detail.amortMonths)} 个月`}>{formatSignedCny(detail.premiumMonthlyCny)}/月</span>
                              ) : "—"}
                            </td>
                            <td data-numeric>
                              {reminder ? (
                                <span className="assets-expiry-reminder" data-tone={renewalTone}>
                                  {formatCostExpiry(detail.expiredAt)} <small>{renewalLabel}</small>
                                </span>
                              ) : formatCostExpiry(detail.expiredAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="assets-card-list">
                  {detailRows.map((detail) => {
                    const reminder = renewalByUuid.get(detail.uuid);
                    const renewalTone = reminder ? assetsRenewalTone(reminder.daysRemaining) : undefined;
                    const renewalLabel = reminder ? assetsRenewalLabel(reminder.daysRemaining) : undefined;
                    const priceLabel = detail.note || `${formatCnyMoney(detail.priceCny)}/${formatBillingCycle(detail.billingCycleDays)}`;
                    return (
                      <div className="panel cost-summary-detail-item" key={detail.uuid} data-counted={detail.counted} data-renewal-tone={renewalTone} title={detail.name}>
                        <div className="cost-summary-detail-head">
                          <Link to={`/server/${encodeURIComponent(detail.uuid)}`} className="cost-summary-detail-name">
                            <Flag region={detail.region} size={12} />
                            <span className="cost-summary-detail-title">{detail.name}</span>
                          </Link>
                          <strong style={{ fontFamily: "var(--font-mono)" }} title="剩余价值">{detail.counted ? formatCnyMoney(detail.remainingCny) : "—"}</strong>
                        </div>
                        <div className="cost-summary-detail-meta">
                          <span className="cost-summary-price-chip">{priceLabel}</span>
                          {detail.premiumCny !== 0 && (
                            <span className="cost-summary-premium-chip" style={{ "--cost-premium-color": premiumTone(detail.premiumCny) } as React.CSSProperties} title="收购溢价">
                              {formatSignedCny(detail.premiumCny)} 溢价
                            </span>
                          )}
                          {detail.premiumCny !== 0 && detail.amortMonths != null && (
                            <span className="cost-summary-premium-chip" title="溢价月摊">
                              月摊 {formatSignedCny(detail.premiumMonthlyCny)} · 摊 {Math.round(detail.amortMonths)} 月
                            </span>
                          )}
                          <span className="cost-summary-expire-label" data-tone={renewalTone}>
                            {formatCostExpiry(detail.expiredAt)}
                            {renewalLabel && <small>{renewalLabel}</small>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="cost-summary-empty">
              {ratesFetching ? "费用明细加载中" : "汇率获取失败，点击右上角刷新重试"}
            </div>
          )}

          <details className="panel cost-summary-rate-details" style={{ marginTop: 16 }}>
            <summary>
              <span style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12 }}>汇率</span>{" "}
              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginLeft: 8 }}>
                {exchangeRateRows.length > 0 ? exchangeRateRows.slice(0, 3).map((item) => `${item.code} ${formatCnyMoney(item.value)}`).join(" · ") : "暂无汇率"}
              </strong>
            </summary>
            {exchangeRateRows.length > 0 ? (
              <div className="cost-summary-rate-list">
                {exchangeRateRows.map((item) => (
                  <div className="cost-summary-rate-item" key={item.code}>
                    <span>1 {item.code}</span>
                    <strong>{formatCnyMoney(item.value)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cost-summary-empty" style={{ padding: "8px 0" }}>暂无可用汇率</div>
            )}
          </details>
        </>
      )}
    </div>
  );
}
