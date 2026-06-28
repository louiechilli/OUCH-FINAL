import type { usePushNotifications } from "../hooks/usePushNotifications";

interface Action {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  accent: "pink" | "blue" | "purple" | "orange";
}

const actions: Action[] = [
  { id: "new-sale", label: "New Sale", icon: "+", accent: "pink" },
  { id: "bookings", label: "Bookings", icon: "BK", accent: "blue", badge: 4 },
  { id: "clients", label: "Clients", icon: "CL", accent: "purple" },
  { id: "stock", label: "Stock", icon: "ST", accent: "orange" },
  { id: "reports", label: "Reports", icon: "RP", accent: "blue" },
  { id: "settings", label: "Settings", icon: "•••", accent: "purple" },
];

interface ActionSidebarProps {
  staffName: string;
  onAction?: (id: string) => void;
  push: ReturnType<typeof usePushNotifications>;
}

function ActionSidebar({ staffName, onAction, push }: ActionSidebarProps) {
  return (
    <div className="sidebar">
      <button className="sidebar__menu" aria-label="Menu">
        <span />
        <span />
        <span />
      </button>

      <div className="sidebar__greeting">
        <h1>Hi {staffName}</h1>
        <p>Welcome back to your workspace!</p>
      </div>

      <div className="sidebar__search">
        <span className="sidebar__search-icon">⌕</span>
        <input type="text" placeholder="Search client or booking…" />
      </div>

      {push.status !== "unsupported" && push.status !== "subscribed" && (
        <button
          className="push-banner"
          onClick={push.subscribe}
          disabled={push.status === "subscribing"}
        >
          <span>
            {push.status === "subscribing" && "Enabling notifications…"}
            {push.status === "denied" && "Notifications blocked — check Settings"}
            {push.status === "error" && "Couldn't enable notifications — tap to retry"}
            {push.status === "idle" && "Enable notifications"}
          </span>
        </button>
      )}

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
