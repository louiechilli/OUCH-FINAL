// Connector interface — see PATTERNS.md. Google is the only implementation
// today, but every call site in this app talks to this interface, not to
// googleapis directly, so a future provider swap (or a mock for tests) only
// means writing a new file in ./providers, not touching booking/block logic.

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  // Stamped onto the remote event (Google's extendedProperties.private) so
  // that when it comes back through a webhook we can recognise it as ours
  // instead of mistaking our own write for an external change.
  metadata: Record<string, string>;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  status: "confirmed" | "cancelled" | "tentative";
  metadata: Record<string, string>;
}

export interface CalendarChangesPage {
  events: CalendarEvent[];
  nextSyncToken?: string;
  /** Set when Google invalidates the previous sync token and a full resync is required. */
  syncTokenExpired?: boolean;
}

export interface WatchChannel {
  channelId: string;
  resourceId: string;
  expiresAt: Date | null;
}

export interface CalendarProvider {
  createEvent(calendarId: string, input: CalendarEventInput): Promise<CalendarEvent>;
  updateEvent(calendarId: string, eventId: string, input: CalendarEventInput): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;

  /**
   * Incremental sync. Omit syncToken for an initial full backfill. Always
   * check `syncTokenExpired` on the result — Google invalidates tokens
   * occasionally and callers must fall back to a full resync.
   */
  listChanges(calendarId: string, syncToken?: string): Promise<CalendarChangesPage>;

  /** Registers a push-notification channel; Google calls webhookUrl on changes. */
  watch(calendarId: string, channelId: string, webhookUrl: string, channelToken: string): Promise<WatchChannel>;
  stopWatch(channelId: string, resourceId: string): Promise<void>;
}
