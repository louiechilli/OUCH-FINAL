import { useEffect, useRef } from "react";
import { getRemainingIdleMs, IDLE_TIMEOUT_MS, recordActivity } from "./activity";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

export function useIdleLock(active: boolean, onIdle: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!active) return;

    function scheduleIdleCheck() {
      if (timerRef.current) clearTimeout(timerRef.current);
      const remaining = getRemainingIdleMs();
      if (remaining <= 0) {
        onIdleRef.current();
        return;
      }
      timerRef.current = setTimeout(() => onIdleRef.current(), remaining);
    }

    function resetTimer() {
      recordActivity();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onIdleRef.current(), IDLE_TIMEOUT_MS);
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      scheduleIdleCheck();
    }

    scheduleIdleCheck();

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer));
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active]);
}
