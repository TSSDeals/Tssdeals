function formatMoney(cents?: number | null, currency?: string | null) {
  if (cents === null || cents === undefined) return "\u2014";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toFixed(0)}`;
  }
}

function formatPercent(percent: unknown) {
  const value = Number(percent);
  if (Number.isNaN(value)) return "\u2014";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function deriveDealCardPricing(deal: any) {
  const suppressUntrustedSavings = deal?.topDealSavingsTrusted === false;
  const percent = suppressUntrustedSavings ? "\u2014" : formatPercent(deal?.percentOff);
  const price = formatMoney(deal?.priceCents, deal?.currency);
  const msrp = formatMoney(deal?.msrpCents, deal?.currency);
  const hasMsrp = !suppressUntrustedSavings && deal?.msrpCents !== null && deal?.msrpCents !== undefined;
  const msrpVerified = Boolean(deal?.msrpVerified);
  const msrpSource = deal?.msrpSource ?? "retailer";
  const hasMfrMsrp =
    !suppressUntrustedSavings &&
    deal?.manufacturerMsrpCents != null &&
    deal.manufacturerMsrpCents > 0;
  const mfrMsrp = hasMfrMsrp ? formatMoney(deal.manufacturerMsrpCents, deal?.currency) : null;
  let mfrPercentOff: string | null = null;
  if (hasMfrMsrp && deal?.priceCents) {
    const discount = ((deal.manufacturerMsrpCents - deal.priceCents) / deal.manufacturerMsrpCents) * 100;
    if (discount > 0) mfrPercentOff = formatPercent(discount.toFixed(3));
  }
  const showDualPricing =
    hasMfrMsrp &&
    hasMsrp &&
    deal?.manufacturerMsrpCents !== deal?.msrpCents;

  return {
    percent,
    price,
    msrp,
    hasMsrp,
    msrpVerified,
    msrpSource,
    hasMfrMsrp,
    mfrMsrp,
    mfrPercentOff,
    showDualPricing,
  };
}
