import Home from "./pages/Home";
import LoginScreen from "./pages/LoginScreen";
import PinSetupScreen from "./pages/PinSetupScreen";
import PinLockScreen from "./pages/PinLockScreen";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useIdleLock } from "./auth/useIdleLock";
import { useLockLandscape } from "./hooks/useLockLandscape";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { ConnectivityProvider } from "./connectivity/ConnectivityContext";
import OfflineBanner from "./connectivity/OfflineBanner";

function AuthGate() {
  const { phase, lock } = useAuth();
  const push = usePushNotifications();

  useIdleLock(phase === "unlocked", lock);

  if (phase === "loading") return <div className="auth-screen" />;
  if (phase === "login") return <LoginScreen />;
  if (phase === "pin-setup") return <PinSetupScreen />;
  if (phase === "locked") return <PinLockScreen />;

  return <Home push={push} />;
}

function App() {
  useLockLandscape();

  return (
    <ConnectivityProvider>
      <OfflineBanner />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ConnectivityProvider>
  );
}

export default App;
