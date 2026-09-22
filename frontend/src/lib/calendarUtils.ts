import { STUDIO_TIMEZONE, studioDateKey } from "./timezone";

export { studioDateKey };
export type CalendarView = "day" | "week" | "month";

export const CALENDAR_GRID_START_HOUR = 0;
export const CALENDAR_GRID_END_HOUR = 24;
export const CALENDAR_HOUR_HEIGHT = 52;
export const CALENDAR_HOUR_HEIGHT_MIN = 32;
export const CALENDAR_HOUR_HEIGHT_MAX = 104;

export function clampCalendarHourHeight(hourHeight: number) {
  return Math.min(CALENDAR_HOUR_HEIGHT_MAX, Math.max(CALENDAR_HOUR_HEIGHT_MIN, hourHeight));
}

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

const MUTED_ARTIST_OPACITY = 0.15;

function parseHexColor(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function artistCalendarFaded(artistColorHex: string, opacity = MUTED_ARTIST_OPACITY) {
  const { r, g, b } = parseHexColor(artistColorHex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function isMutedCalendarBooking(status: string) {
  return status === "done" || status === "cancelled" || status === "completed";
}

export function calendarEventStyle(
  artistId: number,
  muted: boolean,
  layout?: { top?: number; height?: number }
): Record<string, string | number> {
  const color = artistCalendarColor(artistId);
  const style: Record<string, string | number> = { ...layout };

  if (muted) {
    style.backgroundColor = artistCalendarFaded(color.bg);
    style.color = "#5f6368";
    style.boxShadow = `inset 3px 0 0 ${artistCalendarFaded(color.bg, 0.45)}`;
    return style;
  }

  style.backgroundColor = color.bg;
  style.color = color.text;
  return style;
}

export function calendarChipStyle(artistId: number, muted: boolean) {
  const color = artistCalendarColor(artistId);
  if (muted) {
    return {
      backgroundColor: artistCalendarFaded(color.bg),
      color: "#5f6368",
      boxShadow: `inset 2px 0 0 ${artistCalendarFaded(color.bg, 0.45)}`,
    };
  }
  return {
    backgroundColor: color.bg,
    color: color.text,
  };
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
  gridEndHour = CALENDAR_GRID_END_HOUR,
  hourHeight = CALENDAR_HOUR_HEIGHT
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

  const top = ((visibleStart - gridStart) / 60) * hourHeight;
  const height = Math.max(((visibleEnd - visibleStart) / 60) * hourHeight, 22);
  return { top, height };
}

export function currentTimeIndicator(
  now: Date,
  dayKey: string,
  hourHeight = CALENDAR_HOUR_HEIGHT
) {
  const todayKey = studioDateKey(now);
  if (dayKey !== todayKey) return null;
  const minutes = studioMinutesSinceMidnight(now);
  const gridStart = CALENDAR_GRID_START_HOUR * 60;
  const gridEnd = CALENDAR_GRID_END_HOUR * 60;
  if (minutes < gridStart || minutes > gridEnd) return null;
  return ((minutes - gridStart) / 60) * hourHeight;
}

export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1) {
  const key = studioDateKey(anchor);
  if (view === "day") return parseDateKey(addDaysToDateKey(key, direction));
  if (view === "week") return parseDateKey(addDaysToDateKey(key, direction * 7));
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + direction, 1, 12, 0, 0));
}

export function shiftAnchorBy(view: CalendarView, anchor: Date, offset: number) {
  if (offset === 0) return anchor;
  let next = anchor;
  const step = offset > 0 ? 1 : -1;
  for (let index = 0; index < Math.abs(offset); index += 1) {
    next = shiftAnchor(view, next, step);
  }
  return next;
}

export const CALENDAR_BUFFER_RADIUS = 2;

export function calendarPeriodKey(view: CalendarView, anchor: Date) {
  if (view === "month") return studioDateKey(anchor).slice(0, 7);
  if (view === "week") return startOfWeekDateKey(anchor);
  return studioDateKey(anchor);
}

type CalendarTimedItem = { starts_at: string; ends_at: string };

export function calendarScrollTargetTop(
  bookings: CalendarTimedItem[],
  blocks: CalendarTimedItem[],
  dayKeys: string[],
  now?: Date,
  hourHeight = CALENDAR_HOUR_HEIGHT
) {
  const midpoints: number[] = [];

  const collect = (startsAt: string, endsAt: string) => {
    for (const dayKey of dayKeys) {
      const segment = eventSegmentForDay(startsAt, endsAt, dayKey, CALENDAR_GRID_START_HOUR, CALENDAR_GRID_END_HOUR, hourHeight);
      if (segment) midpoints.push(segment.top + segment.height / 2);
    }
  };

  for (const booking of bookings) collect(booking.starts_at, booking.ends_at);
  for (const block of blocks) collect(block.starts_at, block.ends_at);

  if (midpoints.length > 0) {
    midpoints.sort((a, b) => a - b);
    return midpoints[Math.floor(midpoints.length / 2)];
  }

  if (now) {
    const todayKey = studioDateKey(now);
    if (dayKeys.includes(todayKey)) {
      const indicator = currentTimeIndicator(now, todayKey, hourHeight);
      if (indicator !== null) return indicator;
    }
  }

  return 10 * hourHeight;
}

export function scrollCalendarToTarget(container: HTMLElement, targetTop: number) {
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const centered = targetTop - container.clientHeight / 2;
  container.scrollTop = Math.max(0, Math.min(centered, maxScroll));
}
