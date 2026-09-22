import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Count of today's non-cancelled bookings across every artist, for the sidebar badge. */
export function useTodaysBookingsCount() {
  const { fetchWithAuth } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const todayKey = toDateKey(new Date());
        const res = await fetchWithAuth(
          `/api/bookings?from=${todayKey}T00:00:00.000Z&to=${todayKey}T23:59:59.999Z`
        );
        if (!res.ok) return;
        const rows: Array<{ status: string }> = await res.json();
        if (!cancelled) setCount(rows.filter((b) => b.status !== "cancelled").length);
      } catch {
        // leave count as-is — the badge just won't update this cycle
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth]);

  return count;
}
