import { RefObject, useEffect, useRef } from "react";
import { clampCalendarHourHeight } from "../lib/calendarUtils";

function touchDistance(touches: TouchList) {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function useCalendarPinchZoom(
  containerRef: RefObject<HTMLElement | null>,
  hourHeight: number,
  onHourHeightChange: (height: number) => void,
  enabled = true
) {
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;

  const pinchRef = useRef<{ startDistance: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const element = containerRef.current;
    if (!element) return;

    const setHeightFromRatio = (ratio: number) => {
      onHourHeightChange(clampCalendarHourHeight(pinchRef.current!.startHeight * ratio));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinchRef.current = {
          startDistance: touchDistance(event.touches),
          startHeight: hourHeightRef.current,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinchRef.current || event.touches.length !== 2) return;
      event.preventDefault();
      const distance = touchDistance(event.touches);
      if (pinchRef.current.startDistance <= 0) return;
      setHeightFromRatio(distance / pinchRef.current.startDistance);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = -event.deltaY * 0.08;
      onHourHeightChange(clampCalendarHourHeight(hourHeightRef.current + delta));
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
      element.removeEventListener("wheel", onWheel);
    };
  }, [containerRef, enabled, onHourHeightChange]);
}
