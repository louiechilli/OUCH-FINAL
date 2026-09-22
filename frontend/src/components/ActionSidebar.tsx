import { useState } from "react";
import NavDrawer from "./NavDrawer";

interface Action {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  accent: "pink" | "blue" | "purple" | "orange";
  adminOnly?: boolean;
}

const baseActions: Action[] = [
  { id: "new-sale", label: "New Sale", icon: "+", accent: "pink" },
  { id: "calendar", label: "Calendar", icon: "CA", accent: "orange" },
  { id: "bookings", label: "Bookings", icon: "BK", accent: "blue" },
  { id: "clients", label: "Clients", icon: "CL", accent: "purple" },
  { id: "catalog", label: "Services", icon: "SV", accent: "blue", adminOnly: true },
];

interface ActionSidebarProps {
  staffName: string;
  onAction?: (id: string) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
  bookingsToday?: number | null;
}

function ActionSidebar({
  staffName,
  onAction,
  onLogout,
  isAdmin = false,
  bookingsToday = null,
}: ActionSidebarProps) {
  const actions = baseActions
    .filter((action) => !action.adminOnly || isAdmin)
    .map((action) =>
      action.id === "bookings" && bookingsToday
        ? { ...action, badge: bookingsToday }
        : action
    );
  const [menuOpen, setMenuOpen] = useState(false);

  function handleNavigate(id: string) {
    setMenuOpen(false);
    onAction?.(id);
  }

  return (
    <div className="sidebar">
      <button className="sidebar__menu" aria-label="Menu" onClick={() => setMenuOpen(true)}>
        <span />
        <span />
        <span />
      </button>

      {menuOpen && (
        <NavDrawer
          staffName={staffName}
          isAdmin={isAdmin}
          onNavigate={handleNavigate}
          onLogout={() => {
            setMenuOpen(false);
            onLogout?.();
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <div className="sidebar__greeting">
        <h1>Hi {staffName}</h1>
        <p>Welcome back to your workspace!</p>
      </div>

      <div className="sidebar__search">
        <span className="sidebar__search-icon">⌕</span>
        <input type="text" placeholder="Search client or booking…" />
      </div>

      <div className="sidebar__actions-header">
        <span>Quick actions</span>
        <span className="sidebar__actions-count">({actions.length})</span>
      </div>

      <div className="actions-grid">
        {actions.map((action) => (
          <button
            key={action.id}
            className="action-tile"
            onClick={() => onAction?.(action.id)}
          >
            <span className={`action-tile__icon action-tile__icon--${action.accent}`}>
              {action.icon}
              {action.badge ? <span className="action-tile__badge">{action.badge}</span> : null}
            </span>
            <span className="action-tile__label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ActionSidebar;
