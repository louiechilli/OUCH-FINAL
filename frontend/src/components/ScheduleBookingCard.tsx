import {
  formatBookingDayLabel,
  formatBookingEndTime,
  formatBookingStartTime,
  getBookingTiming,
} from "../lib/bookingTiming";
import { isActiveBookingStatus } from "../lib/bookingStatus";
import type { BookingStatus } from "../lib/bookingStatus";

export interface ScheduleBooking {
  id: number;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  total_amount: string;
  balance_due: string;
  client_first_name: string;
  client_last_name: string;
  service_name: string;
}

interface ScheduleBookingCardProps {
  booking: ScheduleBooking;
  now: Date;
  showDate?: boolean;
  onView: (id: number) => void;
  onMarkDone?: (booking: ScheduleBooking) => void;
}

function ScheduleBookingCard({
  booking,
  now,
  showDate = false,
  onView,
  onMarkDone,
}: ScheduleBookingCardProps) {
  const timing = getBookingTiming(booking.starts_at, booking.ends_at, booking.status, now);
  const isBooked = isActiveBookingStatus(booking.status);
  const isDone = booking.status === "done";
  const clientName = `${booking.client_first_name} ${booking.client_last_name}`;

  return (
    <article
      className={[
        "schedule-card",
        timing.isOverdue ? "schedule-card--overdue" : "",
        timing.variant === "in_progress" ? "schedule-card--live" : "",
        isDone ? "schedule-card--done" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button type="button" className="schedule-card__main" onClick={() => onView(booking.id)}>
        <div className="schedule-card__time">
          {showDate && <span className="schedule-card__date">{formatBookingDayLabel(booking.starts_at)}</span>}
          <span className="schedule-card__start">{formatBookingStartTime(booking.starts_at)}</span>
          <span className="schedule-card__end">{formatBookingEndTime(booking.ends_at)}</span>
        </div>

        <div className="schedule-card__body">
          <span className="schedule-card__client">{clientName}</span>
          <span className="schedule-card__service">{booking.service_name}</span>
          {timing.timingLabel && (
            <span className={`schedule-card__timing schedule-card__timing--${timing.variant}`}>
              {timing.isOverdue
                ? timing.timingLabel.replace(" — mark done", "")
                : timing.timingLabel}
            </span>
          )}
          {isDone && <span className="schedule-card__timing schedule-card__timing--terminal">Done</span>}
        </div>
      </button>

      {isBooked && onMarkDone && (
        <div className="schedule-card__actions">
          <button
            type="button"
            className="schedule-card__action schedule-card__action--done"
            onClick={() => onMarkDone(booking)}
          >
            Done
          </button>
        </div>
      )}
    </article>
  );
}

export default ScheduleBookingCard;
