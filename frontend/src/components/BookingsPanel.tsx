import type { Booking } from "../data/mock";
import { todaysBookings, upcomingBookings, todaysStats } from "../data/mock";

function StatusPill({ status }: { status: Booking["status"] }) {
  if (status === "complete") return <span className="pill pill--complete">Complete</span>;
  if (status === "confirmed") return <span className="pill pill--confirmed">Confirmed</span>;
  return <span className="pill pill--pending">Pending</span>;
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <div className="booking-row">
      <span className={`booking-row__dot booking-row__dot--${booking.status}`} />
      <div className="booking-row__info">
        <span className="booking-row__client">{booking.client}</span>
        <span className="booking-row__service">{booking.service}</span>
      </div>
      <div className="booking-row__meta">
        <span className="booking-row__time">{booking.time}</span>
        <span className="booking-row__artist">{booking.artist}</span>
      </div>
      <StatusPill status={booking.status} />
    </div>
  );
}

function BookingsPanel() {
  return (
    <div className="panel">
      <div className="panel__header">
        <div>
          <h2>Today's Schedule</h2>
          <p className="panel__subtitle">Bookings, walk-ins and consults</p>
        </div>
        <button className="panel__add" aria-label="Add booking">
          +
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-card__label">Revenue today</span>
          <span className="stat-card__value">£{todaysStats.revenue}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Bookings today</span>
          <span className="stat-card__value">{todaysStats.bookingsCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Avg. ticket</span>
          <span className="stat-card__value">£{todaysStats.avgTicket}</span>
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3>Today</h3>
          <span className="section__more">•••</span>
        </div>
        <div className="section__list">
          {todaysBookings.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__header">
          <h3>Upcoming</h3>
          <span className="section__more">•••</span>
        </div>
        <div className="section__list">
          {upcomingBookings.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default BookingsPanel;
