import ActionSidebar from "../components/ActionSidebar";
import BookingsPanel from "../components/BookingsPanel";
import CatalogPanel from "../components/CatalogPanel";
import NewBookingWizard from "./NewBookingWizard";
import BookingDetailPage from "./BookingDetailPage";
import ConsentFormPage, { type ConsentFormBooking } from "./ConsentFormPage";
import { useAuth, useIsAdmin } from "../auth/AuthContext";
import { useTodaysBookingsCount } from "../hooks/useTodaysBookingsCount";
import { useState } from "react";
interface HomeProps {
  onOpenSettings: () => void;
  onOpenBookings: () => void;
  onOpenClients: () => void;
  onOpenCalendar: () => void;
}

type HomeView = "bookings" | "catalog" | "new-booking";

function Home({ onOpenSettings, onOpenBookings, onOpenClients, onOpenCalendar }: HomeProps) {
  const { user, logout, fetchWithAuth } = useAuth();
  const isAdmin = useIsAdmin();
  const [view, setView] = useState<HomeView>("bookings");
  const [viewingBookingId, setViewingBookingId] = useState<number | null>(null);
  const [signingBooking, setSigningBooking] = useState<ConsentFormBooking | null>(null);
  const [bookingsRefreshKey, setBookingsRefreshKey] = useState(0);
  const bookingsToday = useTodaysBookingsCount();

  const handleAction = (id: string) => {
    if (id === "settings") {
      onOpenSettings();
      return;
    }
    if (id === "catalog") {
      if (!isAdmin) return;
      setView("catalog");
      return;
    }
    if (id === "new-booking" || id === "new-sale") {
      setView("new-booking");
      return;
    }
    if (id === "bookings") {
      onOpenBookings();
      return;
    }
    if (id === "clients") {
      onOpenClients();
      return;
    }
    if (id === "calendar") {
      onOpenCalendar();
    }
  };

  // Full-screen takeover, no sidebar — the multi-step flow gets the whole
  // screen to itself like a native modal, rather than living inside the
  // bookings panel alongside the persistent nav.
  if (signingBooking) {
    return (
      <ConsentFormPage
        booking={signingBooking}
        onClose={() => setSigningBooking(null)}
        onSubmitted={() => {
          setSigningBooking(null);
          setBookingsRefreshKey((key) => key + 1);
        }}
      />
    );
  }

  if (viewingBookingId !== null) {
    return (
      <BookingDetailPage
        bookingId={viewingBookingId}
        onBack={() => setViewingBookingId(null)}
        onChanged={() => setBookingsRefreshKey((key) => key + 1)}
        onSignConsent={async () => {
          const res = await fetchWithAuth(`/api/bookings/${viewingBookingId}`);
          if (!res.ok) return;
          const booking = await res.json();
          if (!booking.requires_consent_form_id) return;
          setViewingBookingId(null);
          setSigningBooking({
            id: booking.id,
            client_first_name: booking.client_first_name,
            client_last_name: booking.client_last_name,
            client_email: booking.client_email,
            client_phone: booking.client_phone,
            client_date_of_birth: booking.client_date_of_birth,
            artist_display_name: booking.artist_display_name,
            requires_consent_form_id: booking.requires_consent_form_id,
          });
        }}
      />
    );
  }

  if (view === "new-booking") {
    return (
      <NewBookingWizard
        onClose={() => setView("bookings")}
        onCreated={() => setView("bookings")}
      />
    );
  }

  return (
    <div className="home">
      <ActionSidebar
        staffName={user?.name ?? "there"}
        isAdmin={isAdmin}
        onAction={handleAction}
        onLogout={logout}
        bookingsToday={bookingsToday}
      />
      {view === "catalog" && isAdmin ? (
        <CatalogPanel onClose={() => setView("bookings")} />
      ) : (
        <BookingsPanel
          onViewBooking={setViewingBookingId}
          refreshKey={bookingsRefreshKey}
        />
      )}
    </div>
  );
}

export default Home;
