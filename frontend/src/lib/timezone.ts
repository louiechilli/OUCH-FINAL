// Mirrors backend/src/lib/timezone.ts — the studio is physically in the UK,
// so booking times are always displayed in Europe/London regardless of the
// viewing device's own clock/timezone setting. Using "UTC" here previously
// caused displayed times to drift from what Google Calendar shows by the
// BST/GMT offset.
export const STUDIO_TIMEZONE = "Europe/London";

/** The YYYY-MM-DD date key for `date` as it reads on a clock in the studio's
 * timezone — not UTC, which can land on the wrong day near midnight BST. */
export function studioDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}
