const LAST_ACTIVITY_KEY = "epos_last_activity";

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function recordActivity() {
  sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function getRemainingIdleMs(): number {
  const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
  if (!raw) return 0;
  return Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - Number(raw)));
}

export function shouldRequirePin(): boolean {
  return getRemainingIdleMs() <= 0;
}
