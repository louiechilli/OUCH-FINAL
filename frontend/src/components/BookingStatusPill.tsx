import { bookingStatusLabel } from "../lib/bookingStatus";

function BookingStatusPill({ status }: { status: string }) {
  if (status === "done" || status === "completed") {
    return <span className="pill pill--complete">{bookingStatusLabel(status)}</span>;
  }
  if (status === "cancelled" || status === "no_show") {
    return <span className="pill pill--pending">{bookingStatusLabel(status)}</span>;
  }
  return <span className="pill pill--confirmed">{bookingStatusLabel(status)}</span>;
}

export default BookingStatusPill;
