import { useEffect } from "react";

const STORAGE_KEY = "tssdeals_last_click";

export interface PendingClick {
  dealId: string;
  sourceId?: string;
  clickedAt: string;
}

export function storePendingClick(dealId: string, sourceId?: string) {
  try {
    const payload: PendingClick = { dealId, sourceId, clickedAt: new Date().toISOString() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function useReturnTracking() {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const pending: PendingClick = JSON.parse(raw);
      sessionStorage.removeItem(STORAGE_KEY);

      const clickedAt = new Date(pending.clickedAt);
      const now = new Date();
      const minutesAway = Math.round((now.getTime() - clickedAt.getTime()) / 60000);

      if (minutesAway < 0 || minutesAway > 180) return;

      fetch(`/api/deals/${pending.dealId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesAway }),
      }).catch(() => {});
    } catch {}
  }, []);
}
