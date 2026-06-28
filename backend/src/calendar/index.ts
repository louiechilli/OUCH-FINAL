import type { CalendarProvider } from "./CalendarProvider";
import { GoogleCalendarProvider } from "./providers/GoogleCalendarProvider";

let provider: CalendarProvider | null = null;

// Lazily constructed so the app can boot (and every unrelated route can
// work) even before GOOGLE_SERVICE_ACCOUNT_KEY is configured — the error
// only surfaces when something actually tries to touch a calendar.
export function getCalendarProvider(): CalendarProvider {
  if (!provider) {
    provider = new GoogleCalendarProvider();
  }
  return provider;
}

export type { CalendarProvider, CalendarEvent, CalendarEventInput } from "./CalendarProvider";
