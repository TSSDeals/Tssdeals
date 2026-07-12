
const CJ_COMMISSIONS_URL = "https://commissions.api.cj.com/query";

export interface NetworkReport {
  network: string;
  status: "ok" | "error" | "not_configured";
  error?: string;
  summary: {
    totalCommission: number;
    totalSales: number;
    transactionCount: number;
    pendingCommission: number;
    approvedCommission: number;
    currency: string;
  };
  transactions: NetworkTransaction[];
}

export interface NetworkTransaction {
  id?: string;
  orderId?: string;
  advertiserName?: string;
  status: string;
  commissionAmount: number;
  saleAmount: number;
  currency: string;
  date: string;
  type?: string;
}

export async function fetchCJReport(days: number): Promise<NetworkReport> {
  const token = process.env.CJ_API_TOKEN;
  const cid = process.env.CJ_COMPANY_ID;
  if (!token || !cid) {
    return emptyReport("cj", "not_configured", "CJ_API_TOKEN or CJ_COMPANY_ID not configured");
  }

  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const since = startDate.toISOString();
  const before = endDate.toISOString();

  const query = `{
    publisherCommissions(
      forPublishers: ["${cid}"],
      sinceEventDate: "${since}",
      beforeEventDate: "${before}"
    ) {
      count
      payloadComplete
      records {
        commissionId
        actionStatus
        actionType
        advertiserName
        saleAmountPubCurrency
        pubCommissionAmountPubCurrency
        clickDate
        eventDate
        orderId
      }
    }
  }`;

  try {
    const response = await fetch(CJ_COMMISSIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const text = await response.text();
      return emptyReport("cj", "error", `CJ API ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();

    if (data.errors?.length) {
      return emptyReport("cj", "error", data.errors.map((e: any) => e.message).join("; "));
    }

    const list: any[] = data?.data?.publisherCommissions?.records ?? [];
    const transactions: NetworkTransaction[] = list.map((item: any) => ({
      id: item.commissionId,
      orderId: item.orderId,
      advertiserName: item.advertiserName,
      status: item.actionStatus ?? "UNKNOWN",
      commissionAmount: parseFloat(item.pubCommissionAmountPubCurrency ?? "0"),
      saleAmount: parseFloat(item.saleAmountPubCurrency ?? "0"),
      currency: "USD",
      date: item.eventDate ?? item.clickDate ?? "",
      type: item.actionType,
    }));

    return buildReport("cj", transactions);
  } catch (err: any) {
    return emptyReport("cj", "error", err.message);
  }
}

export async function fetchImpactReport(days: number): Promise<NetworkReport> {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return emptyReport("impact", "not_configured", "IMPACT_ACCOUNT_SID or IMPACT_AUTH_TOKEN not configured");
  }

  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmtImpact = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

  const params = new URLSearchParams({
    ActionDateStart: fmtImpact(startDate),
    ActionDateEnd: fmtImpact(endDate),
    PageSize: "200",
  });

  try {
    const response = await fetch(
      `https://api.impact.com/Mediapartners/${accountSid}/Actions.json?${params}`,
      {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return emptyReport("impact", "error", `Impact API ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const list: any[] = data?.Actions ?? [];

    const transactions: NetworkTransaction[] = list.map((item: any) => ({
      id: item.Id,
      orderId: item.OrderId,
      advertiserName: item.CampaignName ?? item.AdvertiserName,
      status: item.State ?? "UNKNOWN",
      commissionAmount: parseFloat(item.PubCommissionAmount ?? "0"),
      saleAmount: parseFloat(item.SaleAmount ?? "0"),
      currency: item.Currency ?? "USD",
      date: item.ActionDate ?? item.EventDate ?? "",
    }));

    return buildReport("impact", transactions);
  } catch (err: any) {
    return emptyReport("impact", "error", err.message);
  }
}

export async function fetchFanaticsImpactReport(days: number): Promise<NetworkReport> {
  const accountSid = process.env.FANATICS_IMPACT_ACCOUNT_SID;
  const authToken = process.env.FANATICS_IMPACT_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return emptyReport("fanatics-impact", "not_configured", "FANATICS_IMPACT_ACCOUNT_SID or FANATICS_IMPACT_AUTH_TOKEN not configured");
  }

  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmtImpact = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

  const params = new URLSearchParams({
    ActionDateStart: fmtImpact(startDate),
    ActionDateEnd: fmtImpact(endDate),
    PageSize: "200",
  });

  try {
    const response = await fetch(
      `https://api.impact.com/Mediapartners/${accountSid}/Actions.json?${params}`,
      {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return emptyReport("fanatics-impact", "error", `Fanatics/Impact API ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const list: any[] = data?.Actions ?? [];

    const transactions: NetworkTransaction[] = list.map((item: any) => ({
      id: item.Id,
      orderId: item.OrderId,
      advertiserName: item.CampaignName ?? item.AdvertiserName ?? "Fanatics",
      status: item.State ?? "UNKNOWN",
      commissionAmount: parseFloat(item.PubCommissionAmount ?? "0"),
      saleAmount: parseFloat(item.SaleAmount ?? "0"),
      currency: item.Currency ?? "USD",
      date: item.ActionDate ?? item.EventDate ?? "",
    }));

    return buildReport("fanatics-impact", transactions);
  } catch (err: any) {
    return emptyReport("fanatics-impact", "error", err.message);
  }
}

export async function fetchRakutenReport(_days: number): Promise<NetworkReport> {
  return {
    network: "rakuten",
    status: "not_configured",
    error: "Rakuten commission reports require OAuth2 portal access. View your data at ran-reporting.rakutenmarketing.com",
    summary: { totalCommission: 0, totalSales: 0, transactionCount: 0, pendingCommission: 0, approvedCommission: 0, currency: "USD" },
    transactions: [],
  };

  // Placeholder — kept for future implementation if Rakuten provides a REST API token
  const endDate = new Date();
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const params = new URLSearchParams({
    start_date: fmtDate(startDate),
    end_date: fmtDate(endDate),
    network: "1",
  });

  try {
    const response = await fetch(
      `https://api.linksynergy.com/events/publisher/1.0?${params}`,
      { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
      const text = await response.text();
      return emptyReport("rakuten", "error", `Rakuten API ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const list: any[] = Array.isArray(data) ? data : (data?.data ?? data?.commissions ?? data?.response?.data ?? []);

    const transactions: NetworkTransaction[] = list.map((item: any) => ({
      id: item.id ?? item.transactionId,
      orderId: item.orderId ?? item.order_id,
      advertiserName: item.advertiserName ?? item.advertiser_name ?? item.merchantName,
      status: item.status ?? item.commissionStatus ?? "UNKNOWN",
      commissionAmount: parseFloat(item.commissionAmount ?? item.commission ?? "0"),
      saleAmount: parseFloat(item.saleAmount ?? item.orderTotal ?? "0"),
      currency: item.currency ?? "USD",
      date: item.transactionDate ?? item.eventDate ?? item.date ?? "",
    }));

    return buildReport("rakuten", transactions);
  } catch (err: any) {
    return emptyReport("rakuten", "error", err.message);
  }
}

function buildReport(network: string, transactions: NetworkTransaction[]): NetworkReport {
  const approved = transactions.filter((t) =>
    ["APPROVED", "CONFIRMED", "PENDING", "EXTENDED", "LOCKED"].includes(t.status.toUpperCase()),
  );
  const approvedComm = approved.reduce((s, t) => s + t.commissionAmount, 0);
  const pendingComm = transactions
    .filter((t) => t.status.toUpperCase() === "PENDING")
    .reduce((s, t) => s + t.commissionAmount, 0);
  const totalComm = transactions.reduce((s, t) => s + t.commissionAmount, 0);
  const totalSales = transactions.reduce((s, t) => s + t.saleAmount, 0);
  const currency = transactions[0]?.currency ?? "USD";

  return {
    network,
    status: "ok",
    summary: {
      totalCommission: totalComm,
      totalSales,
      transactionCount: transactions.length,
      pendingCommission: pendingComm,
      approvedCommission: approvedComm,
      currency,
    },
    transactions: transactions.slice(0, 100),
  };
}

function emptyReport(network: string, status: "error" | "not_configured", error?: string): NetworkReport {
  return {
    network,
    status,
    error,
    summary: { totalCommission: 0, totalSales: 0, transactionCount: 0, pendingCommission: 0, approvedCommission: 0, currency: "USD" },
    transactions: [],
  };
}

export async function fetchAllAffiliateReports(days: number): Promise<NetworkReport[]> {
  const [cj, impact, fanaticsImpact, rakuten] = await Promise.allSettled([
    fetchCJReport(days),
    fetchImpactReport(days),
    fetchFanaticsImpactReport(days),
    fetchRakutenReport(days),
  ]);

  return [
    cj.status === "fulfilled" ? cj.value : emptyReport("cj", "error", (cj as any).reason?.message),
    impact.status === "fulfilled" ? impact.value : emptyReport("impact", "error", (impact as any).reason?.message),
    fanaticsImpact.status === "fulfilled" ? fanaticsImpact.value : emptyReport("fanatics-impact", "error", (fanaticsImpact as any).reason?.message),
    rakuten.status === "fulfilled" ? rakuten.value : emptyReport("rakuten", "error", (rakuten as any).reason?.message),
  ];
}
