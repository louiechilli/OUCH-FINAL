import { useEffect } from "react";

const EDGE_ZONE_PX = 24;

/**
 * Kiosk lockdown: stops the OS/browser swipe-back-to-previous-page gesture so
 * the only way out of a screen is the app's own breadcrumbs/menu/back buttons.
 *
 * `overscroll-behavior` in global.css already blocks Chrome/Android's
 * overscroll-navigation swipe. Safari's edge-swipe-back is a separate system
 * gesture recognizer that isn't covered by overscroll-behavior, so it needs
 * its own touch-edge guard. The history trap is a last-resort net in case a
 * swipe still slips through and triggers an actual back navigation.
 */
export function useBlockSwipeNavigation() {
  useEffect(() => {
    const blockEdgeSwipe = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (touch.clientX <= EDGE_ZONE_PX || touch.clientX >= window.innerWidth - EDGE_ZONE_PX) {
        e.preventDefault();
      }
    };

    document.addEventListener("touchstart", blockEdgeSwipe, { passive: false });
    document.addEventListener("touchmove", blockEdgeSwipe, { passive: false });

    const guardState = { swipeGuard: true };
    history.pushState(guardState, "");

    const onPopState = () => {
      history.pushState(guardState, "");
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("touchstart", blockEdgeSwipe);
      document.removeEventListener("touchmove", blockEdgeSwipe);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
}
