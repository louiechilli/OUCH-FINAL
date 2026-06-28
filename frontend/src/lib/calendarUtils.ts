import { STUDIO_TIMEZONE, studioDateKey } from "./timezone";

export { studioDateKey };
export type CalendarView = "day" | "week" | "month";

export const CALENDAR_GRID_START_HOUR = 6;
export const CALENDAR_GRID_END_HOUR = 21;
export const CALENDAR_HOUR_HEIGHT = 52;

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ARTIST_COLORS = [
  { bg: "#7986CB", text: "#fff" },
  { bg: "#33B679", text: "#fff" },
  { bg: "#8E24AA", text: "#fff" },
  { bg: "#E67C73", text: "#fff" },
  { bg: "#F6BF26", text: "#1a1a1a" },
  { bg: "#F4511E", text: "#fff" },
  { bg: "#039BE5", text: "#fff" },
  { bg: "#616161", text: "#fff" },
];

export function artistCalendarColor(artistId: number) {
  return ARTIST_COLORS[Math.abs(artistId) % ARTIST_COLORS.length];
}

export function studioMinutesSinceMidnight(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return studioDateKey(date);
}

export function startOfWeekDateKey(date: Date) {
  const key = studioDateKey(date);
  const weekday = weekdayIndexForDateKey(key);
  return addDaysToDateKey(key, -weekday);
}

export function weekdayIndexForDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIMEZONE,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[weekday] ?? 0;
}

export function weekDateKeys(anchor: Date) {
  const start = startOfWeekDateKey(anchor);
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(start, index));
}

export function monthMatrix(anchor: Date) {
  const anchorKey = studioDateKey(anchor);
  const [year, month] = anchorKey.split("-").map(Number);
  const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const leading = weekdayIndexForDateKey(firstOfMonth);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: Array<{ dateKey: string; inMonth: boolean }> = [];
  for (let index = 0; index < leading; index += 1) {
    cells.push({ dateKey: addDaysToDateKey(firstOfMonth, index - leading), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ dateKey, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const lastKey = cells[cells.length - 1]?.dateKey ?? firstOfMonth;
    cells.push({ dateKey: addDaysToDateKey(lastKey, 1), inMonth: false });
  }
  while (cells.length < 42) {
    const lastKey = cells[cells.length - 1]?.dateKey ?? firstOfMonth;
    cells.push({ dateKey: addDaysToDateKey(lastKey, 1), inMonth: false });
  }
  return cells;
}

export function dayRangeIso(dateKey: string) {
  return {
    from: `${dateKey}T00:00:00.000Z`,
    to: `${dateKey}T23:59:59.999Z`,
  };
}

export function viewFetchRange(view: CalendarView, anchor: Date) {
  if (view === "day") {
    const key = studioDateKey(anchor);
    return dayRangeIso(key);
  }
  if (view === "week") {
    const keys = weekDateKeys(anchor);
    return {
      from: `${keys[0]}T00:00:00.000Z`,
      to: `${keys[6]}T23:59:59.999Z`,
    };
  }
  const matrix = monthMatrix(anchor);
  return {
    from: `${matrix[0].dateKey}T00:00:00.000Z`,
    to: `${matrix[matrix.length - 1].dateKey}T23:59:59.999Z`,
  };
}

export function formatDayHeader(dateKey: string, todayKey: string) {
  const date = parseDateKey(dateKey);
  const weekday = WEEKDAY_SHORT[weekdayIndexForDateKey(dateKey)];
  const dayNum = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIMEZONE,
    day: "numeric",
  }).format(date);
  return { weekday, dayNum, isToday: dateKey === todayKey };
}

export function formatToolbarTitle(view: CalendarView, anchor: Date) {
  if (view === "day") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: STUDIO_TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(anchor);
  }
  if (view === "week") {
    const keys = weekDateKeys(anchor);
    const start = parseDateKey(keys[0]);
    const end = parseDateKey(keys[6]);
    const sameMonth = keys[0].slice(0, 7) === keys[6].slice(0, 7);
    const startLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: STUDIO_TIMEZONE,
      day: "numeric",
      month: "short",
    }).format(start);
    const endLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: STUDIO_TIMEZONE,
      day: "numeric",
      month: sameMonth ? undefined : "short",
      year: "numeric",
    }).format(end);
    return `${startLabel} – ${endLabel}`;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(anchor);
}

export function formatEventTime(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function formatHourLabel(hour: number) {
  if (hour === 0 || hour === 24) return "12 am";
  if (hour < 12) return `${hour} am`;
  if (hour === 12) return "12 pm";
  return `${hour - 12} pm`;
}

export function eventSegmentForDay(
  startsAt: string,
  endsAt: string,
  dayKey: string,
  gridStartHour = CALENDAR_GRID_START_HOUR,
  gridEndHour = CALENDAR_GRID_END_HOUR
) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;

  const startKey = studioDateKey(start);
  const endKey = studioDateKey(end);
  if (dayKey < startKey || dayKey > endKey) return null;

  const clipStart = dayKey === startKey ? studioMinutesSinceMidnight(start) : 0;
  const clipEnd = dayKey === endKey ? studioMinutesSinceMidnight(end) : 24 * 60;
  const gridStart = gridStartHour * 60;
  const gridEnd = gridEndHour * 60;
  const visibleStart = Math.max(clipStart, gridStart);
  const visibleEnd = Math.min(clipEnd, gridEnd);
  if (visibleEnd <= visibleStart) return null;

  const top = ((visibleStart - gridStart) / 60) * CALENDAR_HOUR_HEIGHT;
  const height = Math.max(((visibleEnd - visibleStart) / 60) * CALENDAR_HOUR_HEIGHT, 22);
  return { top, height };
}

export function currentTimeIndicator(now: Date, dayKey: string) {
  const todayKey = studioDateKey(now);
  if (dayKey !== todayKey) return null;
  const minutes = studioMinutesSinceMidnight(now);
  const gridStart = CALENDAR_GRID_START_HOUR * 60;
  const gridEnd = CALENDAR_GRID_END_HOUR * 60;
  if (minutes < gridStart || minutes > gridEnd) return null;
  return ((minutes - gridStart) / 60) * CALENDAR_HOUR_HEIGHT;
}

export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1) {
  const key = studioDateKey(anchor);
  if (view === "day") return parseDateKey(addDaysToDateKey(key, direction));
  if (view === "week") return parseDateKey(addDaysToDateKey(key, direction * 7));
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + direction, 1, 12, 0, 0));
}
