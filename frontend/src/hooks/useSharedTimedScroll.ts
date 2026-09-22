import { useEffect, useLayoutEffect, useRef } from "react";
import { scrollCalendarToTarget } from "../lib/calendarUtils";

let sharedTimedScrollTop = 0;
let sharedTimedHourHeight = 0;
let hasAutoScrolledTimed = false;
const scrollListeners = new Set<() => void>();

function notifyTimedScrollSync() {
  for (const listener of scrollListeners) {
    listener();
  }
}

export function resetSharedTimedScroll() {
  sharedTimedScrollTop = 0;
  sharedTimedHourHeight = 0;
  hasAutoScrolledTimed = false;
  notifyTimedScrollSync();
}

export function useSharedTimedScroll(hourHeight: number, autoScrollTarget: number | null) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  useLayoutEffect(() => {
    if (sharedTimedHourHeight > 0 && sharedTimedHourHeight !== hourHeight) {
      const scale = hourHeight / sharedTimedHourHeight;
      sharedTimedScrollTop *= scale;
      notifyTimedScrollSync();
    }
    sharedTimedHourHeight = hourHeight;
  }, [hourHeight]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const applySharedScroll = () => {
      if (!scrollRef.current) return;
      syncingRef.current = true;
      scrollRef.current.scrollTop = sharedTimedScrollTop;
      syncingRef.current = false;
    };

    scrollListeners.add(applySharedScroll);
    applySharedScroll();

    const onScroll = () => {
      if (syncingRef.current) return;
      sharedTimedScrollTop = el.scrollTop;
      notifyTimedScrollSync();
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      scrollListeners.delete(applySharedScroll);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (hasAutoScrolledTimed || autoScrollTarget == null) return;
    const el = scrollRef.current;
    if (!el) return;

    hasAutoScrolledTimed = true;
    sharedTimedScrollTop = autoScrollTarget;
    notifyTimedScrollSync();
    const frame = requestAnimationFrame(() => {
      scrollCalendarToTarget(el, autoScrollTarget);
      sharedTimedScrollTop = el.scrollTop;
      notifyTimedScrollSync();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoScrollTarget]);

  return scrollRef;
}
