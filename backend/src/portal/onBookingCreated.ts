import { createPortalToken } from "./tokens";
import { sendBookingConfirmationSms } from "./sms";

export async function setupClientPortalForBooking(bookingId: number) {
  const portalToken = await createPortalToken(bookingId);
  try {
    await sendBookingConfirmationSms(bookingId, portalToken);
  } catch (err) {
    console.error(`Failed to send booking confirmation SMS for #${bookingId}`, err);
  }
  return portalToken;
}
