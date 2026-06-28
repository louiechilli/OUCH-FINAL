import { STUDIO_TIMEZONE } from "./timezone";

export type BookingTimingVariant = "terminal" | "overdue" | "in_progress" | "upcoming";

export interface BookingTiming {
  slotLabel: string;
  timingLabel: string | null;
  isOverdue: boolean;
  variant: BookingTimingVariant;
}

const TERMINAL_STATUSES = new Set(["done", "cancelled", "completed", "no_show"]);

const timeOpts: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: STUDIO_TIMEZONE,
};

const dateOpts: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  timeZone: STUDIO_TIMEZONE,
};

export function formatDurationMs(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatBookingStartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, timeOpts);
}

export function formatBookingEndTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, timeOpts);
}

export function formatBookingDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: STUDIO_TIMEZONE,
  });
}

export function formatBookingSlot(startsAt: string, endsAt: string, showDate = false): string {
  const start = new Date(startsAt).toLocaleTimeString(undefined, timeOpts);
  const end = new Date(endsAt).toLocaleTimeString(undefined, timeOpts);
  const slot = `${start} – ${end}`;
  if (!showDate) return slot;
  const day = new Date(startsAt).toLocaleDateString(undefined, dateOpts);
  return `${day} · ${slot}`;
}

export function getBookingTiming(
  startsAt: string,
  endsAt: string,
  status: string,
  now: Date = new Date()
): BookingTiming {
  const slotLabel = formatBookingSlot(startsAt, endsAt);
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (TERMINAL_STATUSES.has(status)) {
    return { slotLabel, timingLabel: null, isOverdue: false, variant: "terminal" };
  }

  if (now > end) {
    return {
      slotLabel,
      timingLabel: `Overdue by ${formatDurationMs(now.getTime() - end.getTime())} — mark done`,
      isOverdue: true,
      variant: "overdue",
    };
  }

  if (now >= start) {
    return {
      slotLabel,
      timingLabel: `${formatDurationMs(end.getTime() - now.getTime())} left in slot`,
      isOverdue: false,
      variant: "in_progress",
    };
  }

  return {
    slotLabel,
    timingLabel: `Starts in ${formatDurationMs(start.getTime() - now.getTime())}`,
    isOverdue: false,
    variant: "upcoming",
  };
}

export function bookingDotClass(status: string, isOverdue: boolean): string {
  if (isOverdue) return "booking-row__dot--overdue";
  if (status === "done" || status === "completed") return "booking-row__dot--complete";
  if (status === "cancelled" || status === "no_show") return "booking-row__dot--pending";
  return "booking-row__dot--confirmed";
}
