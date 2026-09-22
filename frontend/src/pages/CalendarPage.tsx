import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { useNow } from "../hooks/useNow";
import { useCalendarPinchZoom } from "../hooks/useCalendarPinchZoom";
import { useHardScrollStop } from "../hooks/useHardScrollStop";
import { useSharedTimedScroll, resetSharedTimedScroll } from "../hooks/useSharedTimedScroll";
import {
  CalendarBlock,
  CalendarBooking,
  CalendarPeriodPage,
  useCalendarPeriodBuffer,
} from "../hooks/useCalendarPeriod";
import BookingDetailPage from "./BookingDetailPage";
import ArtistMultiSelect from "../components/ArtistMultiSelect";
import CalendarArtistToggles from "../components/CalendarArtistToggles";
import {
  addDaysToDateKey,
  calendarChipStyle,
  calendarEventStyle,
  calendarPeriodKey,
  calendarScrollTargetTop,
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  CALENDAR_HOUR_HEIGHT,
  clampCalendarHourHeight,
  CalendarView,
  currentTimeIndicator,
  eventSegmentForDay,
  formatDayHeader,
  formatEventTime,
  formatHourLabel,
  formatToolbarTitle,
  isMutedCalendarBooking,
  monthMatrix,
  parseDateKey,
  shiftAnchor,
  studioDateKey,
  weekDateKeys,
} from "../lib/calendarUtils";
import {
  layoutOverlappingTimedEvents,
  timedEventPositionStyle,
  type TimedLayoutInput,
} from "../lib/calendarEventLayout";

interface CalendarPageProps {
  onBack: () => void;
}

interface Artist {
  id: number;
  displayName: string;
}

const HOUR_ROWS = Array.from(
  { length: CALENDAR_GRID_END_HOUR - CALENDAR_GRID_START_HOUR },
  (_, index) => CALENDAR_GRID_START_HOUR + index
);

const WEEK_SKELETON_EVENTS = [
  [
    { top: 156, height: 52 },
    { top: 364, height: 78 },
  ],
  [{ top: 208, height: 104 }],
  [
    { top: 104, height: 52 },
    { top: 468, height: 52 },
  ],
  [{ top: 260, height: 130 }],
  [
    { top: 312, height: 52 },
    { top: 520, height: 78 },
  ],
  [{ top: 180, height: 78 }],
  [{ top: 416, height: 104 }],
];

const DAY_SKELETON_EVENTS = [
  { top: 156, height: 78 },
  { top: 364, height: 52 },
  { top: 520, height: 104 },
];

function EventSkeletons({ items }: { items: Array<{ top: number; height: number }> }) {
  return (
    <>
      {items.map((item, index) => (
        <div
          key={index}
          className="gcal-skeleton gcal-skeleton--event"
          style={{ top: item.top, height: item.height }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function scaleSkeletonItems(items: Array<{ top: number; height: number }>, hourHeight: number) {
  const scale = hourHeight / CALENDAR_HOUR_HEIGHT;
  return items.map((item) => ({
    top: item.top * scale,
    height: item.height * scale,
  }));
}

function shouldShowTimedSkeleton(
  loading: boolean,
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
  instantRender = false
) {
  if (instantRender) return false;
  return loading && bookings.length === 0 && blocks.length === 0;
}

function useTimedScrollTarget(
  instantRender: boolean,
  loading: boolean,
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
  dayKeys: string[],
  now: Date,
  hourHeight: number,
  isCenterPage: boolean
) {
  const dayKeysKey = dayKeys.join(",");
  return useMemo(() => {
    if (!isCenterPage) return null;
    if (shouldShowTimedSkeleton(loading, bookings, blocks, instantRender)) return null;
    return calendarScrollTargetTop(bookings, blocks, dayKeys, now, hourHeight);
  }, [instantRender, isCenterPage, loading, bookings, blocks, dayKeysKey, now, hourHeight]);
}

function CalendarPage({ onBack }: CalendarPageProps) {
  const { fetchWithAuth } = useAuth();
  const now = useNow(60_000);
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistIds, setArtistIds] = useState<number[]>([]);
  const [viewingBookingId, setViewingBookingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const [hourHeight, setHourHeightState] = useState(() => {
    const saved = sessionStorage.getItem("gcal-hour-height");
    if (!saved) return CALENDAR_HOUR_HEIGHT;
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? clampCalendarHourHeight(parsed) : CALENDAR_HOUR_HEIGHT;
  });

  const setHourHeight = useCallback((height: number) => {
    const clamped = clampCalendarHourHeight(height);
    setHourHeightState(clamped);
    sessionStorage.setItem("gcal-hour-height", String(clamped));
  }, []);

  useHardScrollStop(sidebarRef, "y");

  const today = studioDateKey(now);

  useEffect(() => {
    fetchWithAuth("/api/artists")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Artist[]) => {
        setArtists(data);
        setArtistIds((prev) => (prev.length === 0 ? data.map((artist) => artist.id) : prev));
      })
      .catch(() => setArtists([]));
  }, [fetchWithAuth]);

  const { pages, centerIndex, current } = useCalendarPeriodBuffer(
    view,
    anchor,
    artistIds,
    fetchWithAuth,
    refreshKey
  );

  const title = useMemo(() => formatToolbarTitle(view, anchor), [anchor, view]);

  if (viewingBookingId !== null) {
    return (
      <BookingDetailPage
        bookingId={viewingBookingId}
        onBack={() => setViewingBookingId(null)}
        onChanged={() => {
          setRefreshKey((key) => key + 1);
        }}
        onSignConsent={() => setViewingBookingId(null)}
      />
    );
  }

  return (
    <div className="gcal-page">
      <header className="gcal-page__header">
        <button type="button" className="settings-page__back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <div className="gcal-page__header-body">
          <div className="gcal-toolbar">
            <div className="gcal-toolbar__left">
              <button type="button" className="gcal-toolbar__today" onClick={() => setAnchor(new Date())}>
                Today
              </button>
              <div className="gcal-toolbar__nav">
                <button
                  type="button"
                  className="gcal-toolbar__nav-btn"
                  aria-label="Previous"
                  onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="gcal-toolbar__nav-btn"
                  aria-label="Next"
                  onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
                >
                  ›
                </button>
              </div>
              <h2 className="gcal-toolbar__title">{title}</h2>
            </div>

            <div className="gcal-toolbar__right">
              <div className="gcal-toolbar__artists gcal-toolbar__artists--mobile">
                <ArtistMultiSelect artists={artists} selectedIds={artistIds} onChange={setArtistIds} />
              </div>
              <div className="gcal-view-switch" role="tablist" aria-label="Calendar view">
                {(["day", "week", "month"] as CalendarView[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    className={`gcal-view-switch__btn${view === option ? " gcal-view-switch__btn--active" : ""}`}
                    onClick={() => setView(option)}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {current.error ? <p className="gcal-page__error wizard-error">{current.error}</p> : null}

      <div className="gcal-layout">
        <aside className="gcal-sidebar" aria-label="Calendar sidebar" ref={sidebarRef}>
          <div className="gcal-mini-month">
            <MiniMonth anchor={anchor} today={today} onSelect={(dateKey) => setAnchor(parseDateKey(dateKey))} />
          </div>
          <CalendarArtistToggles
            artists={artists}
            selectedIds={artistIds}
            onChange={setArtistIds}
            loading={artists.length === 0}
          />
        </aside>

        <div className="gcal-main">
          <CalendarPager
            view={view}
            anchor={anchor}
            pages={pages}
            centerIndex={centerIndex}
            today={today}
            now={now}
            onOpenBooking={setViewingBookingId}
            onSelectDay={(dateKey) => {
              setAnchor(parseDateKey(dateKey));
              setView("day");
            }}
            setAnchor={setAnchor}
            hourHeight={hourHeight}
            setHourHeight={setHourHeight}
          />
        </div>
      </div>
    </div>
  );
}

function CalendarPager({
  view,
  anchor,
  pages,
  centerIndex,
  today,
  now,
  setAnchor,
  onOpenBooking,
  onSelectDay,
  hourHeight,
  setHourHeight,
}: {
  view: CalendarView;
  anchor: Date;
  pages: CalendarPeriodPage[];
  centerIndex: number;
  today: string;
  now: Date;
  setAnchor: (date: Date) => void;
  onOpenBooking: (id: number) => void;
  onSelectDay: (dateKey: string) => void;
  hourHeight: number;
  setHourHeight: (height: number) => void;
}) {
  const pagerRef = useRef<HTMLDivElement>(null);
  const settlingRef = useRef(false);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const setAnchorRef = useRef(setAnchor);
  setAnchorRef.current = setAnchor;
  useHardScrollStop(pagerRef, "x");

  const syncPagerToCenter = () => {
    const el = pagerRef.current;
    if (!el || el.clientWidth <= 0) return;
    el.style.scrollSnapType = "none";
    el.scrollLeft = centerIndex * el.clientWidth;
    el.style.scrollSnapType = "";
  };

  useLayoutEffect(() => {
    const el = pagerRef.current;
    if (!el) return;

    const setCenter = () => {
      if (el.clientWidth <= 0) {
        requestAnimationFrame(setCenter);
        return;
      }
      el.scrollLeft = centerIndex * el.clientWidth;
    };

    setCenter();
  }, []);

  const anchorPeriodKey = calendarPeriodKey(view, anchor);

  useLayoutEffect(() => {
    resetSharedTimedScroll();
    syncPagerToCenter();
  }, [view, anchorPeriodKey]);

  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;

    let timeout: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      if (settlingRef.current) return;
      const pageWidth = el.clientWidth;
      if (pageWidth <= 0) return;

      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (settlingRef.current) return;
        const page = Math.round(el.scrollLeft / pageWidth);
        if (page === centerIndex) return;

        const target = pagesRef.current[page];
        if (!target) return;

        settlingRef.current = true;
        flushSync(() => {
          setAnchorRef.current(target.anchor);
        });
        syncPagerToCenter();
        requestAnimationFrame(() => {
          settlingRef.current = false;
        });
      }, 80);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(timeout);
    };
  }, [centerIndex]);

  const renderView = (page: CalendarPeriodPage, slotIndex: number) => {
    const isCenterPage = slotIndex === centerIndex;
    if (view === "week") {
      return (
        <WeekGrid
          anchor={page.anchor}
          today={today}
          now={now}
          bookings={page.bookings}
          blocks={page.blocks}
          loading={page.loading}
          hourHeight={hourHeight}
          setHourHeight={setHourHeight}
          onOpenBooking={onOpenBooking}
          instantRender
          isCenterPage={isCenterPage}
        />
      );
    }
    if (view === "day") {
      return (
        <DayGrid
          anchor={page.anchor}
          today={today}
          now={now}
          bookings={page.bookings}
          blocks={page.blocks}
          loading={page.loading}
          hourHeight={hourHeight}
          setHourHeight={setHourHeight}
          onOpenBooking={onOpenBooking}
          instantRender
          isCenterPage={isCenterPage}
        />
      );
    }
    return (
      <MonthGrid
        anchor={page.anchor}
        today={today}
        bookings={page.bookings}
        blocks={page.blocks}
        loading={page.loading}
        onSelectDay={onSelectDay}
        onOpenBooking={onOpenBooking}
        instantRender
      />
    );
  };

  return (
    <div className="gcal-pager" ref={pagerRef}>
      <div className="gcal-pager__track">
        {pages.map((page, index) => (
          <div key={`gcal-pager-slot-${index}`} className="gcal-pager__page">
            {renderView(page, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMonth({
  anchor,
  today,
  onSelect,
}: {
  anchor: Date;
  today: string;
  onSelect: (dateKey: string) => void;
}) {
  const anchorKey = studioDateKey(anchor);
  const [year, month] = anchorKey.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    month: "long",
    year: "numeric",
  }).format(parseDateKey(`${year}-${String(month).padStart(2, "0")}-01`));
  const cells = monthMatrix(anchor);

  return (
    <div className="gcal-mini-month__panel">
      <div className="gcal-mini-month__title">{monthLabel}</div>
      <div className="gcal-mini-month__weekdays">
        {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="gcal-mini-month__grid">
        {cells.map((cell) => (
          <button
            key={cell.dateKey}
            type="button"
            className={[
              "gcal-mini-month__day",
              !cell.inMonth ? "gcal-mini-month__day--muted" : "",
              cell.dateKey === today ? "gcal-mini-month__day--today" : "",
              cell.dateKey === anchorKey ? "gcal-mini-month__day--selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(cell.dateKey)}
          >
            {Number(cell.dateKey.slice(-2))}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildDayTimedLayouts(
  dateKey: string,
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
  hourHeight: number
) {
  const items: TimedLayoutInput[] = [];

  for (const block of blocks) {
    const segment = eventSegmentForDay(
      block.starts_at,
      block.ends_at,
      dateKey,
      CALENDAR_GRID_START_HOUR,
      CALENDAR_GRID_END_HOUR,
      hourHeight
    );
    if (segment) items.push({ id: `block-${block.id}`, top: segment.top, height: segment.height });
  }

  for (const booking of bookings) {
    const segment = eventSegmentForDay(
      booking.starts_at,
      booking.ends_at,
      dateKey,
      CALENDAR_GRID_START_HOUR,
      CALENDAR_GRID_END_HOUR,
      hourHeight
    );
    if (segment) items.push({ id: `booking-${booking.id}`, top: segment.top, height: segment.height });
  }

  return layoutOverlappingTimedEvents(items);
}

function DayTimedEvents({
  dateKey,
  bookings,
  blocks,
  hourHeight,
  onOpenBooking,
  detailed = false,
}: {
  dateKey: string;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  hourHeight: number;
  onOpenBooking: (id: number) => void;
  detailed?: boolean;
}) {
  const layouts = useMemo(
    () => buildDayTimedLayouts(dateKey, bookings, blocks, hourHeight),
    [blocks, bookings, dateKey, hourHeight]
  );

  return (
    <>
      {blocks.map((block) => {
        const layout = layouts.get(`block-${block.id}`);
        if (!layout) return null;
        return (
          <div
            key={`block-${block.id}-${dateKey}`}
            className="gcal-event gcal-event--block"
            style={{
              ...calendarEventStyle(block.artist_id, true),
              ...timedEventPositionStyle(layout),
            }}
            title={block.reason ?? "Blocked"}
          >
            <span className="gcal-event__title">{block.reason ?? "Blocked"}</span>
            {detailed ? (
              <span className="gcal-event__meta">{formatEventTime(block.starts_at, block.ends_at)}</span>
            ) : null}
          </div>
        );
      })}

      {bookings.map((booking) => {
        const layout = layouts.get(`booking-${booking.id}`);
        if (!layout) return null;
        const muted = isMutedCalendarBooking(booking.status);
        const clientName = `${booking.client_first_name} ${booking.client_last_name}`;
        return (
          <button
            key={`booking-${booking.id}-${dateKey}`}
            type="button"
            className={`gcal-event gcal-event--booking gcal-event--${booking.status}`}
            style={{
              ...calendarEventStyle(booking.artist_id, muted),
              ...timedEventPositionStyle(layout),
            }}
            onClick={() => onOpenBooking(booking.id)}
          >
            <span className="gcal-event__title">{clientName}</span>
            {detailed ? (
              <>
                <span className="gcal-event__meta">{booking.service_name}</span>
                <span className="gcal-event__meta">{formatEventTime(booking.starts_at, booking.ends_at)}</span>
                <span className="gcal-event__meta">{booking.artist_display_name}</span>
              </>
            ) : layout.height >= 36 ? (
              <span className="gcal-event__meta">{booking.service_name}</span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

function WeekGrid({
  anchor,
  today,
  now,
  bookings,
  blocks,
  loading,
  hourHeight,
  setHourHeight,
  onOpenBooking,
  instantRender = false,
  isCenterPage = false,
}: {
  anchor: Date;
  today: string;
  now: Date;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  loading: boolean;
  hourHeight: number;
  setHourHeight: (height: number) => void;
  onOpenBooking: (id: number) => void;
  instantRender?: boolean;
  isCenterPage?: boolean;
}) {
  const days = weekDateKeys(anchor);
  const gridHeight = HOUR_ROWS.length * hourHeight;
  const showSkeleton = shouldShowTimedSkeleton(loading, bookings, blocks, instantRender);
  const autoScrollTarget = useTimedScrollTarget(
    instantRender,
    loading,
    bookings,
    blocks,
    days,
    now,
    hourHeight,
    isCenterPage
  );
  const scrollRef = useSharedTimedScroll(hourHeight, autoScrollTarget);
  useCalendarPinchZoom(scrollRef, hourHeight, setHourHeight);
  useHardScrollStop(scrollRef, "y");
  const gridStyle = { "--gcal-hour-height": `${hourHeight}px` } as CSSProperties;

  return (
    <div className="gcal-week" aria-busy={showSkeleton}>
      <div className="gcal-week__header">
        <div className="gcal-week__time-gutter" />
        {days.map((dateKey) => {
          const header = formatDayHeader(dateKey, today);
          return (
            <div
              key={dateKey}
              className={`gcal-week__day-header${header.isToday ? " gcal-week__day-header--today" : ""}`}
            >
              <span className="gcal-week__weekday">{header.weekday}</span>
              <span className="gcal-week__daynum">{header.dayNum}</span>
            </div>
          );
        })}
      </div>

      <div className="gcal-week__scroll gcal-week__scroll--zoomable" ref={scrollRef} style={gridStyle}>
        <div className="gcal-week__body" style={{ height: gridHeight }}>
          <div className="gcal-week__time-column">
            {HOUR_ROWS.map((hour) => (
              <div key={hour} className="gcal-week__time-label" style={{ height: hourHeight }}>
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {days.map((dateKey, columnIndex) => (
            <div key={dateKey} className="gcal-week__day-column">
              {HOUR_ROWS.map((hour) => (
                <div key={hour} className="gcal-week__hour-cell" style={{ height: hourHeight }} />
              ))}

              {showSkeleton ? (
                <EventSkeletons
                  items={scaleSkeletonItems(WEEK_SKELETON_EVENTS[columnIndex] ?? WEEK_SKELETON_EVENTS[0], hourHeight)}
                />
              ) : (
                <>
              <DayTimedEvents
                dateKey={dateKey}
                bookings={bookings}
                blocks={blocks}
                hourHeight={hourHeight}
                onOpenBooking={onOpenBooking}
              />

              {currentTimeIndicator(now, dateKey, hourHeight) !== null ? (
                <div className="gcal-now-line" style={{ top: currentTimeIndicator(now, dateKey, hourHeight)! }}>
                  <span className="gcal-now-line__dot" />
                </div>
              ) : null}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayGrid({
  anchor,
  today,
  now,
  bookings,
  blocks,
  loading,
  hourHeight,
  setHourHeight,
  onOpenBooking,
  instantRender = false,
  isCenterPage = false,
}: {
  anchor: Date;
  today: string;
  now: Date;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  loading: boolean;
  hourHeight: number;
  setHourHeight: (height: number) => void;
  onOpenBooking: (id: number) => void;
  instantRender?: boolean;
  isCenterPage?: boolean;
}) {
  const dateKey = studioDateKey(anchor);
  const header = formatDayHeader(dateKey, today);
  const gridHeight = HOUR_ROWS.length * hourHeight;
  const showSkeleton = shouldShowTimedSkeleton(loading, bookings, blocks, instantRender);
  const autoScrollTarget = useTimedScrollTarget(
    instantRender,
    loading,
    bookings,
    blocks,
    [dateKey],
    now,
    hourHeight,
    isCenterPage
  );
  const scrollRef = useSharedTimedScroll(hourHeight, autoScrollTarget);
  useCalendarPinchZoom(scrollRef, hourHeight, setHourHeight);
  useHardScrollStop(scrollRef, "y");
  const gridStyle = { "--gcal-hour-height": `${hourHeight}px` } as CSSProperties;

  return (
    <div className="gcal-day" aria-busy={showSkeleton}>
      <div className="gcal-day__header">
        <div className={`gcal-day__heading${header.isToday ? " gcal-day__heading--today" : ""}`}>
          <span className="gcal-week__weekday">{header.weekday}</span>
          <span className="gcal-week__daynum">{header.dayNum}</span>
        </div>
      </div>
      <div className="gcal-day__scroll gcal-day__scroll--zoomable" ref={scrollRef} style={gridStyle}>
        <div className="gcal-day__body" style={{ height: gridHeight }}>
          <div className="gcal-week__time-column">
            {HOUR_ROWS.map((hour) => (
              <div key={hour} className="gcal-week__time-label" style={{ height: hourHeight }}>
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>
          <div className="gcal-day__column">
            {HOUR_ROWS.map((hour) => (
              <div key={hour} className="gcal-week__hour-cell" style={{ height: hourHeight }} />
            ))}
            {showSkeleton ? (
              <EventSkeletons items={scaleSkeletonItems(DAY_SKELETON_EVENTS, hourHeight)} />
            ) : (
              <>
            <DayTimedEvents
              dateKey={dateKey}
              bookings={bookings}
              blocks={blocks}
              hourHeight={hourHeight}
              onOpenBooking={onOpenBooking}
              detailed
            />
            {currentTimeIndicator(now, dateKey, hourHeight) !== null ? (
              <div className="gcal-now-line" style={{ top: currentTimeIndicator(now, dateKey, hourHeight)! }}>
                <span className="gcal-now-line__dot" />
              </div>
            ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  anchor,
  today,
  bookings,
  blocks,
  loading,
  onSelectDay,
  onOpenBooking,
  instantRender = false,
}: {
  anchor: Date;
  today: string;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  loading: boolean;
  onSelectDay: (dateKey: string) => void;
  onOpenBooking: (id: number) => void;
  instantRender?: boolean;
}) {
  const cells = monthMatrix(anchor);
  const scrollRef = useRef<HTMLDivElement>(null);
  useHardScrollStop(scrollRef, "y");
  const showSkeleton = shouldShowTimedSkeleton(loading, bookings, blocks, instantRender);

  const eventsByDay = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        kind: "booking" | "block";
        id: number;
        label: string;
        artistId: number;
        muted: boolean;
        bookingId?: number;
      }>
    >();
    for (const booking of bookings) {
      const key = studioDateKey(new Date(booking.starts_at));
      const list = map.get(key) ?? [];
      list.push({
        kind: "booking",
        id: booking.id,
        bookingId: booking.id,
        artistId: booking.artist_id,
        muted: isMutedCalendarBooking(booking.status),
        label: `${booking.client_first_name} ${booking.client_last_name}`,
      });
      map.set(key, list);
    }
    for (const block of blocks) {
      const key = studioDateKey(new Date(block.starts_at));
      const list = map.get(key) ?? [];
      list.push({
        kind: "block",
        id: block.id,
        artistId: block.artist_id,
        muted: true,
        label: block.reason ?? "Blocked",
      });
      map.set(key, list);
    }
    return map;
  }, [bookings, blocks]);

  return (
    <div className="gcal-month" aria-busy={showSkeleton} ref={scrollRef}>
      <div className="gcal-month__weekdays">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="gcal-month__grid">
        {cells.map((cell) => {
          const events = eventsByDay.get(cell.dateKey) ?? [];
          return (
            <button
              key={cell.dateKey}
              type="button"
              className={[
                "gcal-month__cell",
                !cell.inMonth ? "gcal-month__cell--muted" : "",
                cell.dateKey === today ? "gcal-month__cell--today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDay(cell.dateKey)}
            >
              <span className="gcal-month__date">{Number(cell.dateKey.slice(-2))}</span>
              <div className="gcal-month__events">
                {showSkeleton ? (
                  <>
                    <div className="gcal-skeleton gcal-skeleton--chip" aria-hidden="true" />
                    {(Number(cell.dateKey.slice(-2)) + cell.dateKey.charCodeAt(8)) % 3 !== 0 ? (
                      <div className="gcal-skeleton gcal-skeleton--chip gcal-skeleton--chip-short" aria-hidden="true" />
                    ) : null}
                  </>
                ) : (
                  <>
                {events.slice(0, 3).map((event) =>
                  event.kind === "booking" ? (
                    <span
                      key={`b-${event.id}`}
                      className="gcal-month__chip gcal-month__chip--booking"
                      style={calendarChipStyle(event.artistId, event.muted)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenBooking(event.bookingId!);
                      }}
                    >
                      {event.label}
                    </span>
                  ) : (
                    <span
                      key={`k-${event.id}`}
                      className="gcal-month__chip gcal-month__chip--block"
                      style={calendarChipStyle(event.artistId, true)}
                    >
                      {event.label}
                    </span>
                  )
                )}
                {events.length > 3 ? (
                  <span className="gcal-month__more">+{events.length - 3} more</span>
                ) : null}
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarPage;
