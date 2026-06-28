interface NavItem {
  id: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const WORKSPACE_ITEMS: NavItem[] = [
  { id: "bookings", label: "Dashboard", icon: "⌂" },
  { id: "new-booking", label: "New Booking", icon: "+" },
  { id: "clients", label: "Clients", icon: "◔" },
  { id: "stock", label: "Stock", icon: "▭" },
  { id: "reports", label: "Reports", icon: "▲" },
];

const ACCOUNT_ITEMS: NavItem[] = [
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "payment-terminal", label: "Payment terminal", icon: "¤", adminOnly: true },
  { id: "testing", label: "Testing", icon: "⚗", adminOnly: true },
  { id: "artists", label: "Artists", icon: "★", adminOnly: true },
  { id: "permissions", label: "Permissions", icon: "⚷", adminOnly: true },
];

interface NavDrawerProps {
  staffName: string;
  isAdmin: boolean;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  onClose: () => void;
}

function NavDrawer({ staffName, isAdmin, onNavigate, onLogout, onClose }: NavDrawerProps) {
  return (
    <div className="nav-drawer-overlay" onClick={onClose}>
      <div className="nav-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="nav-drawer__header">
          <span className="nav-drawer__greeting">Hi {staffName}</span>
          <button className="nav-drawer__close" onClick={onClose} aria-label="Close menu">
            ×
          </button>
        </div>

        <div className="nav-drawer__section">
          <span className="nav-drawer__section-title">Workspace</span>
          {WORKSPACE_ITEMS.map((item) => (
            <button key={item.id} className="nav-drawer__item" onClick={() => onNavigate(item.id)}>
              <span className="nav-drawer__item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="nav-drawer__section">
          <span className="nav-drawer__section-title">Account</span>
          {ACCOUNT_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <button key={item.id} className="nav-drawer__item" onClick={() => onNavigate(item.id)}>
              <span className="nav-drawer__item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <button className="nav-drawer__item nav-drawer__item--danger" onClick={onLogout}>
            <span className="nav-drawer__item-icon">⏻</span>
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default NavDrawer;
