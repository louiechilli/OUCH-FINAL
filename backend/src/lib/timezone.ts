// Single source of truth for what "wall-clock time" means in this app.
// The studio is physically in the UK, so a booking made for "9am" means
// 9am Europe/London — which is UTC+0 in winter (GMT) and UTC+1 in summer
// (BST). Treating that "9am" as literal UTC (the previous bug) silently
// shifts every booking by the DST offset once it round-trips through
// Google Calendar, which renders times in the calendar's real timezone.
export const STUDIO_TIMEZONE = process.env.STUDIO_TIMEZONE ?? "Europe/London";

/**
 * Converts a wall-clock time in `timeZone` to the correct UTC instant,
 * DST-aware. E.g. zonedTimeToUtc("2026-07-06", 9, 0, "Europe/London")
 * returns the UTC instant for 9am London time on that date (08:00 UTC,
 * since the UK is on BST in July).
 */
export function zonedTimeToUtc(
  dateKey: string,
  hour: number,
  minute: number,
  timeZone: string = STUDIO_TIMEZONE
): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Guess the instant by treating the wall-clock numbers as UTC, then
  // measure how far that guess actually lands from the intended wall-clock
  // time once viewed in the target timezone, and correct by the difference.
  const guess = new Date(`${dateKey}T${pad(hour)}:${pad(minute)}:00.000Z`);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const guessAsZonedWallClock = new Date(
    `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}.000Z`
  );

  const driftMs = guessAsZonedWallClock.getTime() - guess.getTime();
  return new Date(guess.getTime() - driftMs);
}
