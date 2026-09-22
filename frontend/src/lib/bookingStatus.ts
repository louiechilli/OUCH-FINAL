export type BookingStatus = "booked" | "done" | "cancelled";

export const BOOKING_STATUSES: BookingStatus[] = ["booked", "done", "cancelled"];

export function bookingStatusLabel(status: string): string {
  if (status === "done") return "Done";
  if (status === "cancelled") return "Cancelled";
  if (status === "booked") return "Booked";
  // Legacy values from before migration
  if (status === "completed") return "Done";
  if (status === "confirmed" || status === "pending" || status === "rescheduled") return "Booked";
  if (status === "no_show") return "Cancelled";
  return "Booked";
}

export function isActiveBookingStatus(status: string): boolean {
  return status === "booked" || status === "pending" || status === "confirmed" || status === "rescheduled";
}

export function isTerminalBookingStatus(status: string): boolean {
  return status === "done" || status === "cancelled" || status === "completed" || status === "no_show";
}
