import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNow } from "../hooks/useNow";
import BookingDetailPage from "./BookingDetailPage";
import ArtistMultiSelect from "../components/ArtistMultiSelect";
import {
  addDaysToDateKey,
  artistCalendarColor,
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  CALENDAR_HOUR_HEIGHT,
  CalendarView,
  currentTimeIndicator,
  eventSegmentForDay,
  formatDayHeader,
  formatEventTime,
  formatHourLabel,
  formatToolbarTitle,
  monthMatrix,
  parseDateKey,
  shiftAnchor,
  studioDateKey,
  viewFetchRange,
  weekDateKeys,
} from "../lib/calendarUtils";

interface Artist {
  id: number;
  displayName: string;
}

interface CalendarBooking {
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

interface CalendarBlock {
  id: number;
  artist_id: number;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  source: string;
}

interface CalendarPageProps {
  onBack: () => void;
}

const HOUR_ROWS = Array.from(
  { length: CALENDAR_GRID_END_HOUR - CALENDAR_GRID_START_HOUR },
  (_, index) => CALENDAR_GRID_START_HOUR + index
);

function CalendarPage({ onBack }: CalendarPageProps) {
  const { fetchWithAuth } = useAuth();
  const now = useNow(60_000);
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistIds, setArtistIds] = useState<number[]>([]);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const today = studioDateKey(now);

  useEffect(() => {
    fetchWithAuth("/api/artists")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Artist[]) => setArtists(data))
      .catch(() => setArtists([]));
  }, [fetchWithAuth]);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
      setBookings(await bookingsRes.json());
      setBlocks(await blocksRes.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [anchor, artistIds, fetchWithAuth, view]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar, refreshKey]);

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
              <div className="gcal-toolbar__artists">
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

      {error ? <p className="gcal-page__error wizard-error">{error}</p> : null}
      {loading ? <p className="gcal-page__loading">Loading calendar…</p> : null}

      <div className="gcal-layout">
        <aside className="gcal-mini-month" aria-label="Mini calendar">
          <MiniMonth anchor={anchor} today={today} onSelect={(dateKey) => setAnchor(parseDateKey(dateKey))} />
        </aside>

        <div className="gcal-main">
          {view === "week" ? (
            <WeekGrid
              anchor={anchor}
              today={today}
              now={now}
              bookings={bookings}
              blocks={blocks}
              onOpenBooking={setViewingBookingId}
            />
          ) : null}
          {view === "day" ? (
            <DayGrid
              anchor={anchor}
              today={today}
              now={now}
              bookings={bookings}
              blocks={blocks}
              onOpenBooking={setViewingBookingId}
            />
          ) : null}
          {view === "month" ? (
            <MonthGrid
              anchor={anchor}
              today={today}
              bookings={bookings}
              blocks={blocks}
              onSelectDay={(dateKey) => {
                setAnchor(parseDateKey(dateKey));
                setView("day");
              }}
              onOpenBooking={setViewingBookingId}
            />
          ) : null}
        </div>
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

function WeekGrid({
  anchor,
  today,
  now,
  bookings,
  blocks,
  onOpenBooking,
}: {
  anchor: Date;
  today: string;
  now: Date;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  onOpenBooking: (id: number) => void;
}) {
  const days = weekDateKeys(anchor);
  const gridHeight = HOUR_ROWS.length * CALENDAR_HOUR_HEIGHT;

  return (
    <div className="gcal-week">
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

      <div className="gcal-week__scroll">
        <div className="gcal-week__body" style={{ height: gridHeight }}>
          <div className="gcal-week__time-column">
            {HOUR_ROWS.map((hour) => (
              <div key={hour} className="gcal-week__time-label" style={{ height: CALENDAR_HOUR_HEIGHT }}>
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {days.map((dateKey) => (
            <div key={dateKey} className="gcal-week__day-column">
              {HOUR_ROWS.map((hour) => (
                <div key={hour} className="gcal-week__hour-cell" style={{ height: CALENDAR_HOUR_HEIGHT }} />
              ))}

              {blocks.map((block) => {
                const segment = eventSegmentForDay(block.starts_at, block.ends_at, dateKey);
                if (!segment) return null;
                return (
                  <div
                    key={`block-${block.id}-${dateKey}`}
                    className="gcal-event gcal-event--block"
                    style={{ top: segment.top, height: segment.height }}
                    title={block.reason ?? "Blocked"}
                  >
                    <span className="gcal-event__title">{block.reason ?? "Blocked"}</span>
                  </div>
                );
              })}

              {bookings.map((booking) => {
                const segment = eventSegmentForDay(booking.starts_at, booking.ends_at, dateKey);
                if (!segment) return null;
                const color = artistCalendarColor(booking.artist_id);
                const clientName = `${booking.client_first_name} ${booking.client_last_name}`;
                return (
                  <button
                    key={`booking-${booking.id}-${dateKey}`}
                    type="button"
                    className={`gcal-event gcal-event--booking gcal-event--${booking.status}`}
                    style={{
                      top: segment.top,
                      height: segment.height,
                      backgroundColor: color.bg,
                      color: color.text,
                    }}
                    onClick={() => onOpenBooking(booking.id)}
                  >
                    <span className="gcal-event__title">{clientName}</span>
                    {segment.height >= 36 ? (
                      <span className="gcal-event__meta">{booking.service_name}</span>
                    ) : null}
                  </button>
                );
              })}

              {currentTimeIndicator(now, dateKey) !== null ? (
                <div className="gcal-now-line" style={{ top: currentTimeIndicator(now, dateKey)! }}>
                  <span className="gcal-now-line__dot" />
                </div>
              ) : null}
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
  onOpenBooking,
}: {
  anchor: Date;
  today: string;
  now: Date;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  onOpenBooking: (id: number) => void;
}) {
  const dateKey = studioDateKey(anchor);
  const header = formatDayHeader(dateKey, today);
  const gridHeight = HOUR_ROWS.length * CALENDAR_HOUR_HEIGHT;

  return (
    <div className="gcal-day">
      <div className="gcal-day__header">
        <div className={`gcal-day__heading${header.isToday ? " gcal-day__heading--today" : ""}`}>
          <span className="gcal-week__weekday">{header.weekday}</span>
          <span className="gcal-week__daynum">{header.dayNum}</span>
        </div>
      </div>
      <div className="gcal-day__scroll">
        <div className="gcal-day__body" style={{ height: gridHeight }}>
          <div className="gcal-week__time-column">
            {HOUR_ROWS.map((hour) => (
              <div key={hour} className="gcal-week__time-label" style={{ height: CALENDAR_HOUR_HEIGHT }}>
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>
          <div className="gcal-day__column">
            {HOUR_ROWS.map((hour) => (
              <div key={hour} className="gcal-week__hour-cell" style={{ height: CALENDAR_HOUR_HEIGHT }} />
            ))}
            {blocks.map((block) => {
              const segment = eventSegmentForDay(block.starts_at, block.ends_at, dateKey);
              if (!segment) return null;
              return (
                <div
                  key={`block-${block.id}`}
                  className="gcal-event gcal-event--block"
                  style={{ top: segment.top, height: segment.height }}
                >
                  <span className="gcal-event__title">{block.reason ?? "Blocked"}</span>
                  <span className="gcal-event__meta">{formatEventTime(block.starts_at, block.ends_at)}</span>
                </div>
              );
            })}
            {bookings.map((booking) => {
              const segment = eventSegmentForDay(booking.starts_at, booking.ends_at, dateKey);
              if (!segment) return null;
              const color = artistCalendarColor(booking.artist_id);
              const clientName = `${booking.client_first_name} ${booking.client_last_name}`;
              return (
                <button
                  key={booking.id}
                  type="button"
                  className={`gcal-event gcal-event--booking gcal-event--${booking.status}`}
                  style={{
                    top: segment.top,
                    height: segment.height,
                    backgroundColor: color.bg,
                    color: color.text,
                  }}
                  onClick={() => onOpenBooking(booking.id)}
                >
                  <span className="gcal-event__title">{clientName}</span>
                  <span className="gcal-event__meta">{booking.service_name}</span>
                  <span className="gcal-event__meta">{formatEventTime(booking.starts_at, booking.ends_at)}</span>
                  <span className="gcal-event__meta">{booking.artist_display_name}</span>
                </button>
              );
            })}
            {currentTimeIndicator(now, dateKey) !== null ? (
              <div className="gcal-now-line" style={{ top: currentTimeIndicator(now, dateKey)! }}>
                <span className="gcal-now-line__dot" />
              </div>
            ) : null}
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
  onSelectDay,
  onOpenBooking,
}: {
  anchor: Date;
  today: string;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
  onSelectDay: (dateKey: string) => void;
  onOpenBooking: (id: number) => void;
}) {
  const cells = monthMatrix(anchor);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<{ kind: "booking" | "block"; id: number; label: string; bookingId?: number }>>();
    for (const booking of bookings) {
      const key = studioDateKey(new Date(booking.starts_at));
      const list = map.get(key) ?? [];
      list.push({
        kind: "booking",
        id: booking.id,
        bookingId: booking.id,
        label: `${booking.client_first_name} ${booking.client_last_name}`,
      });
      map.set(key, list);
    }
    for (const block of blocks) {
      const key = studioDateKey(new Date(block.starts_at));
      const list = map.get(key) ?? [];
      list.push({ kind: "block", id: block.id, label: block.reason ?? "Blocked" });
      map.set(key, list);
    }
    return map;
  }, [bookings, blocks]);

  return (
    <div className="gcal-month">
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
                {events.slice(0, 3).map((event) =>
                  event.kind === "booking" ? (
                    <span
                      key={`b-${event.id}`}
                      className="gcal-month__chip gcal-month__chip--booking"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenBooking(event.bookingId!);
                      }}
                    >
                      {event.label}
                    </span>
                  ) : (
                    <span key={`k-${event.id}`} className="gcal-month__chip gcal-month__chip--block">
                      {event.label}
                    </span>
                  )
                )}
                {events.length > 3 ? (
                  <span className="gcal-month__more">+{events.length - 3} more</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarPage;
