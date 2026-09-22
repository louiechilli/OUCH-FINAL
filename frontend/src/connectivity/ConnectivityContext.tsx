import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface ConnectivityContextValue {
  isOnline: boolean;
  reportFailure: () => void;
  reportSuccess: () => void;
}

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Browser online/offline events only reflect the local network link, not
  // whether the backend is actually reachable — so fetch callers also report
  // failures/successes directly to catch a downed server on a live network.
  const reportFailure = useCallback(() => setIsOnline(false), []);
  const reportSuccess = useCallback(() => setIsOnline(true), []);

  return (
    <ConnectivityContext.Provider value={{ isOnline, reportFailure, reportSuccess }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error("useConnectivity must be used within ConnectivityProvider");
  return ctx;
}
