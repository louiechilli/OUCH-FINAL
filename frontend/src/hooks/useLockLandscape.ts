import { useEffect } from "react";

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

/**
 * Attempts a true OS-level landscape lock (only honoured by Safari/Chrome
 * when running as an installed, fullscreen PWA — silently no-ops otherwise).
 */
export function useLockLandscape() {
  useEffect(() => {
    const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
    orientation?.lock?.("landscape").catch(() => {
      // not supported outside fullscreen/installed PWA contexts
    });
  }, []);
}
