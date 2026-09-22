import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { studioDateKey } from "../lib/timezone";
import { useNow } from "../hooks/useNow";
import { useNotifications } from "../hooks/useNotifications";
import { useBookingActionModals } from "./booking/useBookingActionModals";
import ScheduleBookingCard, { type ScheduleBooking } from "./ScheduleBookingCard";
import NotificationsSidebar from "./NotificationsSidebar";

interface BookingsPanelProps {
  onViewBooking?: (id: number) => void;
  refreshKey?: number;
}

function dayRange(date: Date) {
  const start = studioDateKey(date);
  return { from: `${start}T00:00:00.000Z`, to: `${start}T23:59:59.999Z` };
}

function BookingsPanel({ onViewBooking, refreshKey = 0 }: BookingsPanelProps) {
  const { fetchWithAuth } = useAuth();
  const now = useNow();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    error: notificationsError,
    loadNotifications,
    markRead,
    markAllRead,
    clearNotification,
    clearAll,
  } = useNotifications();

  const [todaysBookings, setTodaysBookings] = useState<ScheduleBooking[] | null>(null);
  const [tomorrowsBookings, setTomorrowsBookings] = useState<ScheduleBooking[] | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<ScheduleBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => setReloadToken((token) => token + 1);
  const [reloadToken, setReloadToken] = useState(0);

  const bookingActions = useBookingActionModals({
    fetchWithAuth,
    onChanged: reload,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const meRes = await fetchWithAuth("/api/artists/me");
        if (!meRes.ok) throw new Error("Could not load your artist profile");
        const me = await meRes.json();

        const nowDate = new Date();
        const tomorrow = new Date(nowDate);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const dayAfterTomorrow = new Date(nowDate);
        dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);

        const today = dayRange(nowDate);
        const next = dayRange(tomorrow);
        const upcomingFrom = `${studioDateKey(dayAfterTomorrow)}T00:00:00.000Z`;

        const [todayRes, tomorrowRes, upcomingRes] = await Promise.all([
          fetchWithAuth(`/api/bookings?artistId=${me.id}&from=${today.from}&to=${today.to}`),
          fetchWithAuth(`/api/bookings?artistId=${me.id}&from=${next.from}&to=${next.to}`),
          fetchWithAuth(`/api/bookings?artistId=${me.id}&from=${upcomingFrom}`),
        ]);
        if (!todayRes.ok || !tomorrowRes.ok || !upcomingRes.ok) {
          throw new Error("Could not load bookings");
        }

        const [todayData, tomorrowData, upcomingData]: [ScheduleBooking[], ScheduleBooking[], ScheduleBooking[]] =
          await Promise.all([todayRes.json(), tomorrowRes.json(), upcomingRes.json()]);

        if (cancelled) return;
        setTodaysBookings(todayData.filter((b) => b.status !== "cancelled"));
        setTomorrowsBookings(tomorrowData.filter((b) => b.status !== "cancelled"));
        setUpcomingBookings(upcomingData.filter((b) => b.status !== "cancelled").slice(0, 10));
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth, refreshKey, reloadToken]);

  const handleView = (id: number) => onViewBooking?.(id);

  const revenueToday = (todaysBookings ?? []).reduce((sum, b) => sum + Number(b.total_amount), 0);
  const bookingsCount = todaysBookings?.length ?? 0;
  const avgTicket = bookingsCount > 0 ? revenueToday / bookingsCount : 0;

  return (
    <div className="panel panel--fixed-header">
      {bookingActions.modals}

      <header className="panel-intro">
        <div className="panel-intro__content">
          <div className="panel-intro__heading">
            <h2>Today's Schedule</h2>
            <p className="panel__subtitle">Your day at a glance</p>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-card__label">Revenue today</span>
              <span className="stat-card__value">£{revenueToday.toFixed(0)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Bookings today</span>
              <span className="stat-card__value">{bookingsCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Avg. ticket</span>
              <span className="stat-card__value">£{avgTicket.toFixed(0)}</span>
            </div>
          </div>
        </div>

        <button
          className="panel-intro__action panel__notifications"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          onClick={() => setNotificationsOpen(true)}
        >
          <span className="panel__notifications-icon" aria-hidden="true">
            ◉
          </span>
          {unreadCount > 0 ? (
            <span className="panel__notifications-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
          ) : null}
        </button>
      </header>

      <NotificationsSidebar
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        loading={notificationsLoading}
        error={notificationsError}
        unreadCount={unreadCount}
        onLoad={loadNotifications}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onClear={clearNotification}
        onClearAll={clearAll}
        onViewBooking={onViewBooking}
      />

      {error && <p className="wizard-error">{error}</p>}

      <div className="panel__scroll">
        <section className="section">
          <div className="section__header section__header--sticky">
            <h3>Today</h3>
            <span className="section__count">{bookingsCount || null}</span>
          </div>
          <div className="section__list section__list--schedule">
            {todaysBookings === null && !error && <p className="wizard-loading">Loading…</p>}
            {todaysBookings?.length === 0 && <p className="wizard-empty">No bookings today.</p>}
            {todaysBookings?.map((booking) => (
              <ScheduleBookingCard
                key={booking.id}
                booking={booking}
                now={now}
                onView={handleView}
                onMarkDone={bookingActions.openComplete}
              />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section__header section__header--sticky">
            <h3>Tomorrow</h3>
            <span className="section__count">{tomorrowsBookings?.length || null}</span>
          </div>
          <div className="section__list section__list--schedule">
            {tomorrowsBookings === null && !error && <p className="wizard-loading">Loading…</p>}
            {tomorrowsBookings?.length === 0 && <p className="wizard-empty">No bookings tomorrow.</p>}
            {tomorrowsBookings?.map((booking) => (
              <ScheduleBookingCard
                key={booking.id}
                booking={booking}
                now={now}
                showDate
                onView={handleView}
                onMarkDone={bookingActions.openComplete}
              />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section__header section__header--sticky">
            <h3>Upcoming</h3>
          </div>
          <div className="section__list section__list--schedule">
            {upcomingBookings === null && !error && <p className="wizard-loading">Loading…</p>}
            {upcomingBookings?.length === 0 && <p className="wizard-empty">Nothing on the books yet.</p>}
            {upcomingBookings?.map((booking) => (
              <ScheduleBookingCard
                key={booking.id}
                booking={booking}
                now={now}
                showDate
                onView={handleView}
                onMarkDone={bookingActions.openComplete}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default BookingsPanel;
