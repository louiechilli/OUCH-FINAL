import { formatBookingSlot, getBookingTiming } from "../lib/bookingTiming";

interface BookingScheduleMetaProps {
  startsAt: string;
  endsAt: string;
  status: string;
  showDate?: boolean;
  artistName?: string;
  now?: Date;
}

function BookingScheduleMeta({
  startsAt,
  endsAt,
  status,
  showDate = false,
  artistName,
  now = new Date(),
}: BookingScheduleMetaProps) {
  const timing = getBookingTiming(startsAt, endsAt, status, now);

  return (
    <div className="booking-row__meta">
      <span className="booking-row__time">{formatBookingSlot(startsAt, endsAt, showDate)}</span>
      {timing.timingLabel && (
        <span
          className={`booking-timing booking-timing--${timing.variant}`}
          role={timing.isOverdue ? "status" : undefined}
        >
          {timing.timingLabel}
        </span>
      )}
      {artistName && <span className="booking-row__artist">{artistName}</span>}
    </div>
  );
}

export default BookingScheduleMeta;
