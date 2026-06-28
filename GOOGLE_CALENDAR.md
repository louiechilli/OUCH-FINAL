# Google Calendar integration setup

Google Calendar is the source of truth for bookings. The backend syncs in
both directions:

- **Out**: creating/updating/cancelling a booking or block-out pushes an
  event to the artist's Google Calendar.
- **In**: Google sends a push notification on any change to that calendar
  (the artist editing/deleting an event, or adding a new one directly) and
  the backend pulls and reconciles it. Anything that shows up with no
  matching booking/block is treated as a block-out.

## 1. Create a service account

1. In Google Cloud Console, create (or reuse) a project, enable the
   **Google Calendar API**.
2. Create a **Service Account**, no domain-wide delegation needed.
3. Create a JSON key for it and download it.
4. Set the whole JSON as `GOOGLE_SERVICE_ACCOUNT_KEY` in
   [docker-compose.yml](docker-compose.yml) (as a one-line string).

## 2. Share each artist's calendar with the service account

No OAuth consent screen, no domain-wide delegation — the artist just shares
their calendar with the service account like they'd share it with a
colleague:

1. Artist opens Google Calendar → their calendar's settings → **Share with
   specific people**.
2. Add the service account's email (looks like
   `something@project-id.iam.gserviceaccount.com`, found in the JSON key as
   `client_email`).
3. Permission level: **Make changes to events**.
4. Put that calendar's ID (Settings → "Integrate calendar" → Calendar ID,
   usually the artist's email for their primary calendar) into
   `artists.google_calendar_id` for that artist.

## 3. Expose a public HTTPS webhook URL

Google's push notifications require a publicly reachable HTTPS URL — it
cannot call back to `localhost`. Set `PUBLIC_BASE_URL` in
[docker-compose.yml](docker-compose.yml) to wherever this backend is
reachable from the internet (e.g. via the Cloudflare/ngrok tunnel already
used for `dev.ouch.chillingworths.co.uk`). The backend calls
`${PUBLIC_BASE_URL}/api/calendar/webhook`.

## 4. Start watching

Once both env vars are set and an artist has `google_calendar_id` filled in,
restart the backend — it automatically starts a watch channel for every
active artist with a calendar configured, and renews channels nearing
expiry every hour. To do it manually for one artist (e.g. after setting up
a new artist without restarting):

```
POST /api/calendar/artists/:artistId/watch     (admin only)
DELETE /api/calendar/artists/:artistId/watch   (admin only)
POST /api/calendar/artists/:artistId/sync      (admin only — manual pull, ?full=true forces a full resync)
```

## Notes / limits

- Pricing (`hourly_rate_snapshot`, `subtotal_amount`, `total_amount`,
  `deposit_amount`) is **never** changed by a calendar-driven sync — only
  `starts_at`/`ends_at`/duration. Editing the time of a booking directly in
  Google Calendar reschedules it; it does not change what's owed. Use the
  booking API (`PATCH /api/bookings/:id`) if the price itself needs to
  change.
- A booking/block whose artist has no `google_calendar_id`, or while
  `GOOGLE_SERVICE_ACCOUNT_KEY`/`PUBLIC_BASE_URL` aren't set, is still saved
  locally — the calendar push is best-effort and never blocks taking a
  booking. The response includes `calendarSyncError` when this happens.
- Google watch channels expire (a few weeks at most); the hourly renewal
  job re-watches anything expiring within 24 hours. There's no "renew" API
  call in Google's Calendar API — a fresh watch is created each time.
