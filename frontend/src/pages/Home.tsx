import ActionSidebar from "../components/ActionSidebar";
import BookingsPanel from "../components/BookingsPanel";
import PermissionsPanel from "../components/PermissionsPanel";
import { useAuth, useIsAdmin } from "../auth/AuthContext";
import type { usePushNotifications } from "../hooks/usePushNotifications";
import { useState } from "react";

interface HomeProps {
  push: ReturnType<typeof usePushNotifications>;
}

type HomeView = "bookings" | "permissions";

function Home({ push }: HomeProps) {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [view, setView] = useState<HomeView>("bookings");

  const handleAction = (id: string) => {
    if (id === "permissions") {
      if (!isAdmin) return;
      setView("permissions");
      return;
    }
    if (id === "bookings") {
      setView("bookings");
    }
  };

  return (
    <div className="home">
      <ActionSidebar
        staffName={user?.name ?? "there"}
        push={push}
        isAdmin={isAdmin}
        onAction={handleAction}
      />
      {view === "permissions" && isAdmin ? (
        <PermissionsPanel onClose={() => setView("bookings")} />
      ) : (
        <BookingsPanel />
      )}
    </div>
  );
}

export default Home;
