import type { BookingStatus } from "../../lib/bookingStatus";

interface BookingActionsBarProps {
  status: BookingStatus | string;
  variant?: "default" | "list";
  onComplete?: () => void;
  onReschedule?: () => void;
  onCancel?: () => void;
}

function BookingActionsBar({
  status,
  variant = "default",
  onComplete,
  onReschedule,
  onCancel,
}: BookingActionsBarProps) {
  const isBooked =
    status === "booked" || status === "pending" || status === "confirmed" || status === "rescheduled";
  if (!isBooked) return null;

  const className =
    variant === "list" ? "booking-actions booking-actions--list" : "booking-actions";

  return (
    <div className={className} onClick={(e) => e.stopPropagation()} role="toolbar" aria-label="Booking actions">
      {onComplete && (
        <button type="button" className="booking-actions__btn booking-actions__btn--done" onClick={onComplete}>
          {variant === "list" ? "Done" : "Mark done"}
        </button>
      )}
      {onReschedule && (
        <button type="button" className="booking-actions__btn booking-actions__btn--move" onClick={onReschedule}>
          {variant === "list" ? "Move" : "Reschedule"}
        </button>
      )}
      {onCancel && (
        <button type="button" className="booking-actions__btn booking-actions__btn--cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

export default BookingActionsBar;
