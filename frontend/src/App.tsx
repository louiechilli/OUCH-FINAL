import { useState } from "react";
import Home from "./pages/Home";
import LoginScreen from "./pages/LoginScreen";
import SettingsPage from "./pages/SettingsPage";
import BookingsPage from "./pages/BookingsPage";
import ClientsPage from "./pages/ClientsPage";
import CalendarPage from "./pages/CalendarPage";
import PortalPage, { getPortalTokenFromPath } from "./pages/PortalPage";
import PinSetupScreen from "./pages/PinSetupScreen";
import PinLockScreen from "./pages/PinLockScreen";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useIdleLock } from "./auth/useIdleLock";
import { useLockLandscape } from "./hooks/useLockLandscape";
import { useBlockSwipeNavigation } from "./hooks/useBlockSwipeNavigation";
import { usePushNotifications } from "./hooks/usePushNotifications";
import PushEnableBanner from "./components/PushEnableBanner";
import { ConnectivityProvider } from "./connectivity/ConnectivityContext";
import OfflineBanner from "./connectivity/OfflineBanner";

function AuthGate() {
  const { phase, lock, fetchWithAuth } = useAuth();
  const push = usePushNotifications(fetchWithAuth, phase === "unlocked");
  const [route, setRoute] = useState<"home" | "settings" | "bookings" | "clients" | "calendar">("home");

  useIdleLock(phase === "unlocked", lock);

  if (phase === "loading") return <div className="auth-screen" />;
  if (phase === "login") return <LoginScreen />;
  if (phase === "pin-setup") return <PinSetupScreen />;
  if (phase === "locked") return <PinLockScreen />;

  if (route === "settings") {
    return (
      <>
        <PushEnableBanner push={push} />
        <SettingsPage onBack={() => setRoute("home")} />
      </>
    );
  }

  if (route === "bookings") {
    return (
      <>
        <PushEnableBanner push={push} />
        <BookingsPage onBack={() => setRoute("home")} />
      </>
    );
  }

  if (route === "clients") {
    return (
      <>
        <PushEnableBanner push={push} />
        <ClientsPage onBack={() => setRoute("home")} />
      </>
    );
  }

  if (route === "calendar") {
    return (
      <>
        <PushEnableBanner push={push} />
        <CalendarPage onBack={() => setRoute("home")} />
      </>
    );
  }

  return (
    <>
      <PushEnableBanner push={push} />
      <Home
        onOpenSettings={() => setRoute("settings")}
        onOpenBookings={() => setRoute("bookings")}
        onOpenClients={() => setRoute("clients")}
        onOpenCalendar={() => setRoute("calendar")}
      />
    </>
  );
}

function StaffShell() {
  useLockLandscape();
  useBlockSwipeNavigation();

  return (
    <ConnectivityProvider>
      <OfflineBanner />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ConnectivityProvider>
  );
}

function App() {
  const portalToken = getPortalTokenFromPath();
  if (portalToken) {
    return <PortalPage token={portalToken} />;
  }

  return <StaffShell />;
}

export default App;
