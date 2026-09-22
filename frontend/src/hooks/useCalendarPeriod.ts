import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  calendarPeriodKey,
  CALENDAR_BUFFER_RADIUS,
  CalendarView,
  shiftAnchorBy,
  viewFetchRange,
} from "../lib/calendarUtils";

export interface CalendarBooking {
  id: number;
  artist_id: number;
  status: string;
  starts_at: string;
  ends_at: string;
  client_first_name: string;
  client_last_name: string;
  service_name: string;
  artist_display_name: string;
}

export interface CalendarBlock {
  id: number;
  artist_id: number;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  source: string;
}

export type CalendarPeriodPage = {
  anchor: Date;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  /** True only when there is no data to render yet. */
  loading: boolean;
  error: string | null;
};

type FetchWithAuth = (url: string, init?: RequestInit) => Promise<Response>;

type PeriodCacheEntry = {
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
};

function periodCacheKey(view: CalendarView, anchor: Date, artistFilterKey: string) {
  return `${calendarPeriodKey(view, anchor)}|${view}|${artistFilterKey}`;
}

async function fetchCalendarPeriod(
  view: CalendarView,
  anchor: Date,
  artistIds: number[],
  fetchWithAuth: FetchWithAuth
) {
  const range = viewFetchRange(view, anchor);
  const bookingParams = new URLSearchParams({ from: range.from, to: range.to });
  const blockParams = new URLSearchParams({ from: range.from, to: range.to });
  for (const id of artistIds) {
    bookingParams.append("artistId", String(id));
    blockParams.append("artistId", String(id));
  }
  bookingParams.append("status", "booked");
  bookingParams.append("status", "done");

  const [bookingsRes, blocksRes] = await Promise.all([
    fetchWithAuth(`/api/bookings?${bookingParams.toString()}`),
    fetchWithAuth(`/api/blocks?${blockParams.toString()}`),
  ]);
  if (!bookingsRes.ok || !blocksRes.ok) throw new Error("Could not load calendar");

  return {
    bookings: (await bookingsRes.json()) as CalendarBooking[],
    blocks: (await blocksRes.json()) as CalendarBlock[],
  };
}

function emptyPage(anchor: Date): CalendarPeriodPage {
  return { anchor, bookings: [], blocks: [], loading: false, error: null };
}

function pageFromCache(anchor: Date, cached: PeriodCacheEntry): CalendarPeriodPage {
  return { anchor, ...cached, loading: false, error: null };
}

function hasPeriodData(page: CalendarPeriodPage) {
  return page.bookings.length > 0 || page.blocks.length > 0;
}

export function useCalendarPeriodBuffer(
  view: CalendarView,
  anchor: Date,
  artistIds: number[],
  fetchWithAuth: FetchWithAuth,
  refreshKey: number,
  radius = CALENDAR_BUFFER_RADIUS
) {
  const centerIndex = radius;
  const offsets = useMemo(() => Array.from({ length: radius * 2 + 1 }, (_, index) => index - radius), [radius]);
  const anchors = useMemo(
    () => offsets.map((offset) => shiftAnchorBy(view, anchor, offset)),
    [anchor, offsets, view]
  );
  const anchorKeys = useMemo(
    () => anchors.map((periodAnchor) => calendarPeriodKey(view, periodAnchor)).join("|"),
    [anchors, view]
  );

  const artistFilterKey = artistIds.join(",");
  const cacheRef = useRef<Map<string, PeriodCacheEntry>>(new Map());
  const [pages, setPages] = useState<CalendarPeriodPage[]>(() =>
    anchors.map((periodAnchor) => emptyPage(periodAnchor))
  );

  useLayoutEffect(() => {
    setPages((prev) =>
      anchors.map((periodAnchor) => {
        const cacheKey = periodCacheKey(view, periodAnchor, artistFilterKey);
        const cached = cacheRef.current.get(cacheKey);
        if (cached) return pageFromCache(periodAnchor, cached);

        const periodId = calendarPeriodKey(view, periodAnchor);
        const existing = prev.find((page) => calendarPeriodKey(view, page.anchor) === periodId);
        if (existing) {
          return { ...existing, anchor: periodAnchor, loading: false, error: null };
        }

        return emptyPage(periodAnchor);
      })
    );
  }, [anchorKeys, anchors, artistFilterKey, view]);

  useEffect(() => {
    if (refreshKey > 0) {
      for (const periodAnchor of anchors) {
        cacheRef.current.delete(periodCacheKey(view, periodAnchor, artistFilterKey));
      }
    }
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;

    anchors.forEach((periodAnchor, index) => {
      const cacheKey = periodCacheKey(view, periodAnchor, artistFilterKey);

      void (async () => {
        try {
          const data = await fetchCalendarPeriod(view, periodAnchor, artistIds, fetchWithAuth);
          if (cancelled) return;
          cacheRef.current.set(cacheKey, data);
          setPages((current) => {
            const next = [...current];
            const page = next[index];
            if (!page || calendarPeriodKey(view, page.anchor) !== calendarPeriodKey(view, periodAnchor)) {
              return current;
            }
            next[index] = { anchor: periodAnchor, ...data, loading: false, error: null };
            return next;
          });
        } catch (err) {
          if (cancelled) return;
          setPages((current) => {
            const next = [...current];
            const page = next[index];
            if (!page || calendarPeriodKey(view, page.anchor) !== calendarPeriodKey(view, periodAnchor)) {
              return current;
            }
            if (hasPeriodData(page)) {
              next[index] = { ...page, loading: false, error: (err as Error).message };
              return next;
            }
            next[index] = {
              anchor: periodAnchor,
              bookings: [],
              blocks: [],
              loading: false,
              error: (err as Error).message,
            };
            return next;
          });
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [anchorKeys, anchors, artistFilterKey, artistIds, fetchWithAuth, refreshKey, view]);

  useEffect(() => {
    let cancelled = false;
    const prefetchOffsets = [-radius - 1, radius + 1];

    for (const offset of prefetchOffsets) {
      const periodAnchor = shiftAnchorBy(view, anchor, offset);
      const cacheKey = periodCacheKey(view, periodAnchor, artistFilterKey);
      if (cacheRef.current.has(cacheKey)) continue;

      void (async () => {
        try {
          const data = await fetchCalendarPeriod(view, periodAnchor, artistIds, fetchWithAuth);
          if (cancelled) return;
          cacheRef.current.set(cacheKey, data);
        } catch {
          // Prefetch failures are silent; the visible window fetch handles errors.
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [anchor, anchorKeys, artistFilterKey, artistIds, fetchWithAuth, radius, refreshKey, view]);

  const current = pages[centerIndex] ?? emptyPage(anchor);

  return { pages, centerIndex, current };
}
