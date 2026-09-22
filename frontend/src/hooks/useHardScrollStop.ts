import { RefObject, useEffect } from "react";

/** Hard stop at scroll edges — prevents rubber-band overscroll on nested scroll areas (iOS). */
export function useHardScrollStop(ref: RefObject<HTMLElement | null>, axis: "x" | "y" | "both" = "y") {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let lastTouchX = 0;
    let lastTouchY = 0;

    const onTouchStart = (event: TouchEvent) => {
      lastTouchX = event.touches[0]?.clientX ?? 0;
      lastTouchY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touchX = event.touches[0]?.clientX ?? lastTouchX;
      const touchY = event.touches[0]?.clientY ?? lastTouchY;
      const deltaX = touchX - lastTouchX;
      const deltaY = touchY - lastTouchY;
      lastTouchX = touchX;
      lastTouchY = touchY;

      const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = element;
      const maxScrollY = scrollHeight - clientHeight;
      const maxScrollX = scrollWidth - clientWidth;
      let block = false;

      if ((axis === "y" || axis === "both") && deltaY !== 0 && maxScrollY > 0) {
        if ((scrollTop <= 0 && deltaY > 0) || (scrollTop >= maxScrollY - 1 && deltaY < 0)) {
          block = true;
        }
      }

      if ((axis === "x" || axis === "both") && deltaX !== 0 && maxScrollX > 0) {
        if ((scrollLeft <= 0 && deltaX > 0) || (scrollLeft >= maxScrollX - 1 && deltaX < 0)) {
          block = true;
        }
      }

      if (block) event.preventDefault();
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
    };
  }, [axis, ref]);
}
