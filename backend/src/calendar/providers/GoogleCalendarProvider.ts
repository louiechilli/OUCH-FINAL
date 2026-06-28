import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import type {
  CalendarChangesPage,
  CalendarEvent,
  CalendarEventInput,
  CalendarProvider,
  WatchChannel,
} from "../CalendarProvider";

// Auth model: a single Google Cloud service account, with each artist
// SHARING their personal Google Calendar with that service account's email
// (Settings > "Share with specific people" > Make changes to events). No
// domain-wide delegation or per-artist OAuth consent screen needed — the
// service account just needs to be a guest with write access on each
// calendar referenced by artists.google_calendar_id.
function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }
  return JSON.parse(raw);
}

function toEventResource(input: CalendarEventInput): calendar_v3.Schema$Event {
  return {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startsAt.toISOString() },
    end: { dateTime: input.endsAt.toISOString() },
    extendedProperties: { private: input.metadata },
  };
}

function fromEventResource(event: calendar_v3.Schema$Event): CalendarEvent | null {
  if (!event.id) return null;

  const startsAt = event.start?.dateTime ?? event.start?.date;
  const endsAt = event.end?.dateTime ?? event.end?.date;
  if (!startsAt || !endsAt) return null;

  return {
    id: event.id,
    summary: event.summary ?? undefined,
    description: event.description ?? undefined,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    status: (event.status as CalendarEvent["status"]) ?? "confirmed",
    metadata: event.extendedProperties?.private ?? {},
  };
}

export class GoogleCalendarProvider implements CalendarProvider {
  private calendar: calendar_v3.Calendar;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: loadCredentials(),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async createEvent(calendarId: string, input: CalendarEventInput): Promise<CalendarEvent> {
    const { data } = await this.calendar.events.insert({
      calendarId,
      requestBody: toEventResource(input),
    });
    const event = fromEventResource(data);
    if (!event) throw new Error("Google Calendar returned an unparsable event");
    return event;
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    input: CalendarEventInput
  ): Promise<CalendarEvent> {
    const { data } = await this.calendar.events.update({
      calendarId,
      eventId,
      requestBody: toEventResource(input),
    });
    const event = fromEventResource(data);
    if (!event) throw new Error("Google Calendar returned an unparsable event");
    return event;
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      await this.calendar.events.delete({ calendarId, eventId });
    } catch (err: unknown) {
      // Already gone — fine, that's the end state we wanted anyway.
      const status = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
      if (status !== 404 && status !== 410) throw err;
    }
  }

  async listChanges(calendarId: string, syncToken?: string): Promise<CalendarChangesPage> {
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    try {
      do {
        const { data } = await this.calendar.events.list({
          calendarId,
          syncToken,
          pageToken,
          showDeleted: true,
          singleEvents: true,
          // Initial backfill only needs to know about anything from now on —
          // we don't care about block-outs in the past.
          timeMin: syncToken ? undefined : new Date().toISOString(),
          maxResults: 250,
        });

        for (const raw of data.items ?? []) {
          const event = fromEventResource(raw);
          if (event) events.push(event);
        }

        pageToken = data.nextPageToken ?? undefined;
        if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
      } while (pageToken);
    } catch (err: unknown) {
      const status = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
      if (status === 410) {
        return { events: [], syncTokenExpired: true };
      }
      throw err;
    }

    return { events, nextSyncToken };
  }

  async watch(
    calendarId: string,
    channelId: string,
    webhookUrl: string,
    channelToken: string
  ): Promise<WatchChannel> {
    const { data } = await this.calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: channelToken,
      },
    });

    return {
      channelId,
      resourceId: data.resourceId ?? "",
      expiresAt: data.expiration ? new Date(Number(data.expiration)) : null,
    };
  }

  async stopWatch(channelId: string, resourceId: string): Promise<void> {
    try {
      await this.calendar.channels.stop({
        requestBody: { id: channelId, resourceId },
      });
    } catch (err: unknown) {
      const status = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
      if (status !== 404 && status !== 410) throw err;
    }
  }
}
