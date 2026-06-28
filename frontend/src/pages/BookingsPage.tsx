import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import NewBookingWizard from "./NewBookingWizard";
import ConsentFormPage from "./ConsentFormPage";
import BookingDetailPage from "./BookingDetailPage";
import BookingScheduleMeta from "../components/BookingScheduleMeta";
import BookingActionsBar from "../components/booking/BookingActionsBar";
import BookingStatusPill from "../components/BookingStatusPill";
import { useBookingActionModals } from "../components/booking/useBookingActionModals";
import type { BookingStatus } from "../lib/bookingStatus";
import { studioDateKey } from "../lib/timezone";
import { bookingDotClass, getBookingTiming } from "../lib/bookingTiming";
import { useNow } from "../hooks/useNow";
import ArtistMultiSelect from "../components/ArtistMultiSelect";
import FilterMultiSelect from "../components/FilterMultiSelect";

interface BookingRow {
  id: number;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  total_amount: string;
  balance_due: string;
  client_first_name: string;
  client_last_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_date_of_birth: string | null;
  service_name: string;
  requires_consent_form_id: number | null;
  consent_signed: boolean;
  artist_id: number;
  artist_display_name: string;
}

interface Artist {
  id: number;
  displayName: string;
}

interface BookingsPageProps {
  onBack: () => void;
}

type View = "upcoming" | "past";

const STATUS_FILTER_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const DEFAULT_STATUS_FILTER: BookingStatus[] = ["booked", "cancelled"];

function dayRange(date: Date) {
  const key = studioDateKey(date);
  return { from: `${key}T00:00:00.000Z`, to: `${key}T23:59:59.999Z` };
}

function BookingRowView({
  booking,
  onSignConsent,
  onView,
  onComplete,
  onReschedule,
  onCancel,
  now,
}: {
  booking: BookingRow;
  onSignConsent: (booking: BookingRow) => void;
  onView: (booking: BookingRow) => void;
  onComplete: (booking: BookingRow) => void;
  onReschedule: (booking: BookingRow) => void;
  onCancel: (booking: BookingRow) => void;
  now: Date;
}) {
  const timing = getBookingTiming(booking.starts_at, booking.ends_at, booking.status, now);

  return (
    <div
      className={`booking-row${timing.isOverdue ? " booking-row--overdue" : ""}`}
    >
      <button
        type="button"
        className="booking-row__main"
        onClick={() => onView(booking)}
      >
        <span className={`booking-row__dot ${bookingDotClass(booking.status, timing.isOverdue)}`} />
        <div className="booking-row__info">
          <span className="booking-row__client">
            {booking.client_first_name} {booking.client_last_name}
          </span>
          <span className="booking-row__service">{booking.service_name}</span>
        </div>
        <BookingScheduleMeta
          startsAt={booking.starts_at}
          endsAt={booking.ends_at}
          status={booking.status}
          showDate
          artistName={booking.artist_display_name}
          now={now}
        />
        <span className="booking-row__chevron" aria-hidden="true">
          ›
        </span>
      </button>

      <div className="booking-row__aside">
        <div className="booking-row__badges">
          <BookingStatusPill status={booking.status} />
          {timing.isOverdue && <span className="pill pill--overdue">Overdue</span>}
          {booking.requires_consent_form_id ? (
            booking.consent_signed ? (
              <span className="pill pill--complete">Consent ✓</span>
            ) : (
              <button
                type="button"
                className="booking-row__consent"
                onClick={(e) => {
                  e.stopPropagation();
                  onSignConsent(booking);
                }}
              >
                Get consent
              </button>
            )
          ) : null}
        </div>
        <BookingActionsBar
          variant="list"
          status={booking.status}
          onComplete={() => onComplete(booking)}
          onReschedule={() => onReschedule(booking)}
          onCancel={() => onCancel(booking)}
        />
      </div>
    </div>
  );
}

function BookingSection({
  title,
  bookings,
  emptyLabel,
  onSignConsent,
  onView,
  onComplete,
  onReschedule,
  onCancel,
  now,
}: {
  title: string;
  bookings: BookingRow[] | null;
  emptyLabel: string;
  onSignConsent: (booking: BookingRow) => void;
  onView: (booking: BookingRow) => void;
  onComplete: (booking: BookingRow) => void;
  onReschedule: (booking: BookingRow) => void;
  onCancel: (booking: BookingRow) => void;
  now: Date;
}) {
  return (
    <section className="section">
      <div className="section__header section__header--sticky">
        <h3>{title}</h3>
      </div>
      <div className="section__list">
        {bookings === null && <p className="wizard-loading">Loading…</p>}
        {bookings?.length === 0 && <p className="wizard-empty">{emptyLabel}</p>}
        {bookings?.map((booking) => (
          <BookingRowView
            key={booking.id}
            booking={booking}
            onView={onView}
            onSignConsent={onSignConsent}
            onComplete={onComplete}
            onReschedule={onReschedule}
            onCancel={onCancel}
            now={now}
          />
        ))}
      </div>
    </section>
  );
}

function BookingsPage({ onBack }: BookingsPageProps) {
  const { fetchWithAuth } = useAuth();
  const now = useNow();
  const [view, setView] = useState<View>("upcoming");
  const [statuses, setStatuses] = useState<BookingStatus[]>(DEFAULT_STATUS_FILTER);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistIds, setArtistIds] = useState<number[]>([]);

  const [todaysBookings, setTodaysBookings] = useState<BookingRow[] | null>(null);
  const [tomorrowsBookings, setTomorrowsBookings] = useState<BookingRow[] | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<BookingRow[] | null>(null);
  const [pastBookings, setPastBookings] = useState<BookingRow[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [signingBooking, setSigningBooking] = useState<BookingRow | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<number | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/artists")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Artist[]) => setArtists(data))
      .catch(() => setArtists([]));
  }, [fetchWithAuth]);

  function buildParams(extra: Record<string, string>) {
    const params = new URLSearchParams(extra);
    for (const id of artistIds) {
      params.append("artistId", String(id));
    }
    for (const value of statuses) {
      params.append("status", value);
    }
    return params;
  }

  const loadUpcoming = useCallback(async () => {
    setError(null);
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const dayAfterTomorrow = new Date(now);
      dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);

      const today = dayRange(now);
      const next = dayRange(tomorrow);
      const upcomingFrom = `${studioDateKey(dayAfterTomorrow)}T00:00:00.000Z`;

      const [todayRes, tomorrowRes, upcomingRes] = await Promise.all([
        fetchWithAuth(`/api/bookings?${buildParams({ from: today.from, to: today.to }).toString()}`),
        fetchWithAuth(`/api/bookings?${buildParams({ from: next.from, to: next.to }).toString()}`),
        fetchWithAuth(`/api/bookings?${buildParams({ from: upcomingFrom }).toString()}`),
      ]);
      if (!todayRes.ok || !tomorrowRes.ok || !upcomingRes.ok) throw new Error("Could not load bookings");

      const [todayData, tomorrowData, upcomingData]: [BookingRow[], BookingRow[], BookingRow[]] =
        await Promise.all([todayRes.json(), tomorrowRes.json(), upcomingRes.json()]);

      setTodaysBookings(todayData);
      setTomorrowsBookings(tomorrowData);
      setUpcomingBookings(upcomingData);
    } catch (err) {
      setError((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWithAuth, artistIds, statuses]);

  const loadPast = useCallback(async () => {
    setError(null);
    try {
      const todayKey = studioDateKey(new Date());
      const params = buildParams({ to: `${todayKey}T00:00:00.000Z` });
      const res = await fetchWithAuth(`/api/bookings?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load bookings");
      const data: BookingRow[] = await res.json();
      setPastBookings(data.reverse());
    } catch (err) {
      setError((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWithAuth, artistIds, statuses]);

  useEffect(() => {
    if (view === "upcoming") {
      setTodaysBookings(null);
      setTomorrowsBookings(null);
      setUpcomingBookings(null);
      void loadUpcoming();
    } else {
      setPastBookings(null);
      void loadPast();
    }
  }, [view, loadUpcoming, loadPast]);

  const reload = () => (view === "upcoming" ? loadUpcoming() : loadPast());

  const bookingActions = useBookingActionModals({
    fetchWithAuth,
    onChanged: () => void reload(),
  });

  const actionProps = {
    onComplete: bookingActions.openComplete,
    onReschedule: (booking: BookingRow) => bookingActions.openReschedule(booking.id),
    onCancel: bookingActions.openCancel,
  };

  if (showWizard) {
    return (
      <NewBookingWizard
        onClose={() => setShowWizard(false)}
        onCreated={() => {
          setShowWizard(false);
          void reload();
        }}
      />
    );
  }

  if (signingBooking) {
    return (
      <ConsentFormPage
        booking={{ ...signingBooking, requires_consent_form_id: signingBooking.requires_consent_form_id! }}
        onClose={() => setSigningBooking(null)}
        onSubmitted={() => {
          setSigningBooking(null);
          void reload();
        }}
      />
    );
  }

  if (viewingBookingId !== null) {
    return (
      <BookingDetailPage
        bookingId={viewingBookingId}
        onBack={() => setViewingBookingId(null)}
        onChanged={() => void reload()}
        onSignConsent={() => {
          const booking =
            todaysBookings?.find((b) => b.id === viewingBookingId) ??
            tomorrowsBookings?.find((b) => b.id === viewingBookingId) ??
            upcomingBookings?.find((b) => b.id === viewingBookingId) ??
            pastBookings?.find((b) => b.id === viewingBookingId) ??
            null;
          if (booking) {
            setViewingBookingId(null);
            setSigningBooking(booking);
          }
        }}
      />
    );
  }

  return (
    <div className="bookings-page">
      {bookingActions.modals}
      <header className="bookings-page__header">
        <button type="button" className="settings-page__back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <div className="bookings-page__header-body">
          <div className="bookings-page__header-top">
            <div className="panel-intro__heading">
              <h2>Bookings</h2>
              <p className="panel__subtitle">Today, tomorrow and upcoming, across every artist</p>
            </div>
            <button className="panel__add" aria-label="New booking" onClick={() => setShowWizard(true)}>
              +
            </button>
          </div>

          <div className="permissions-panel__tabs">
            <button
              className={`permissions-panel__tab${view === "upcoming" ? " permissions-panel__tab--active" : ""}`}
              onClick={() => setView("upcoming")}
            >
              Today &amp; upcoming
            </button>
            <button
              className={`permissions-panel__tab${view === "past" ? " permissions-panel__tab--active" : ""}`}
              onClick={() => setView("past")}
            >
              Past
            </button>
          </div>

          <div className="bookings-page__filters">
            <div className="bookings-page__filter-row">
              <span className="bookings-page__filter-label">Status</span>
              <FilterMultiSelect
                options={STATUS_FILTER_OPTIONS}
                selected={statuses}
                onChange={(values) => setStatuses(values as BookingStatus[])}
                emptyLabel="No statuses"
              />
            </div>

            <div className="bookings-page__filter-row">
              <span className="bookings-page__filter-label">Artists</span>
              <ArtistMultiSelect artists={artists} selectedIds={artistIds} onChange={setArtistIds} />
            </div>
          </div>
        </div>
      </header>

      {error && <p className="wizard-error">{error}</p>}

      <div className="panel__scroll">
        {view === "upcoming" ? (
          <>
            <BookingSection
              title="Today"
              bookings={todaysBookings}
              emptyLabel="No bookings today."
              onSignConsent={setSigningBooking}
              onView={(b) => setViewingBookingId(b.id)}
              now={now}
              {...actionProps}
            />
            <BookingSection
              title="Tomorrow"
              bookings={tomorrowsBookings}
              emptyLabel="No bookings tomorrow."
              onSignConsent={setSigningBooking}
              onView={(b) => setViewingBookingId(b.id)}
              now={now}
              {...actionProps}
            />
            <BookingSection
              title="Upcoming"
              bookings={upcomingBookings}
              emptyLabel="Nothing further on the books yet."
              onSignConsent={setSigningBooking}
              onView={(b) => setViewingBookingId(b.id)}
              now={now}
              {...actionProps}
            />
          </>
        ) : (
          <div className="section__list section__list--standalone">
            {pastBookings === null && !error && <p className="wizard-loading">Loading…</p>}
            {pastBookings?.length === 0 && <p className="wizard-empty">No past bookings match these filters.</p>}
            {pastBookings?.map((booking) => (
              <BookingRowView
                key={booking.id}
                booking={booking}
                onSignConsent={setSigningBooking}
                onView={(b) => setViewingBookingId(b.id)}
                now={now}
                {...actionProps}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BookingsPage;
