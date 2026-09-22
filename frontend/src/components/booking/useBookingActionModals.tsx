import { useState } from "react";
import CancelBookingModal from "./CancelBookingModal";
import CompleteBookingModal from "./CompleteBookingModal";
import RescheduleWizard from "../../pages/RescheduleWizard";

export interface BookingActionTarget {
  id: number;
  status: string;
  client_first_name: string;
  client_last_name: string;
  balance_due?: string;
}

interface UseBookingActionModalsOptions {
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
  onChanged: () => void;
}

export function useBookingActionModals({ fetchWithAuth, onChanged }: UseBookingActionModalsOptions) {
  const [cancelTarget, setCancelTarget] = useState<BookingActionTarget | null>(null);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [completeTarget, setCompleteTarget] = useState<BookingActionTarget | null>(null);

  async function patchBooking(id: number, body: Record<string, unknown>) {
    const res = await fetchWithAuth(`/api/bookings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Could not update booking");
    }
    onChanged();
  }

  const modals = (
    <>
      {cancelTarget && (
        <CancelBookingModal
          clientName={`${cancelTarget.client_first_name} ${cancelTarget.client_last_name}`}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (cancellationReason) => {
            await patchBooking(cancelTarget.id, { status: "cancelled", cancellationReason });
          }}
        />
      )}

      {completeTarget && (
        <CompleteBookingModal
          booking={completeTarget}
          fetchWithAuth={fetchWithAuth}
          onClose={() => setCompleteTarget(null)}
          onComplete={async () => {
            await patchBooking(completeTarget.id, { status: "done" });
          }}
        />
      )}

      {rescheduleId !== null && (
        <RescheduleWizard
          bookingId={rescheduleId}
          onClose={() => setRescheduleId(null)}
          onRescheduled={() => {
            setRescheduleId(null);
            onChanged();
          }}
        />
      )}
    </>
  );

  return {
    modals,
    openCancel: (booking: BookingActionTarget) => setCancelTarget(booking),
    openReschedule: (bookingId: number) => setRescheduleId(bookingId),
    openComplete: (booking: BookingActionTarget) => setCompleteTarget(booking),
  };
}
