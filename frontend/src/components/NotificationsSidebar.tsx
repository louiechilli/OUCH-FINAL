import { useEffect } from "react";
import type { Notification } from "../hooks/useNotifications";

interface NotificationsSidebarProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  onLoad: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onClear: (id: number) => void;
  onClearAll: () => void;
  onViewBooking?: (id: number) => void;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function notificationIcon(type: string) {
  if (type === "payment_received") return "£";
  if (type === "booking_cancelled") return "✕";
  if (type === "booking_done") return "✓";
  if (type === "booking_rescheduled") return "↻";
  if (type === "booking_created") return "+";
  if (type === "booking_confirmed" || type === "booking_updated") return "✓";
  if (type === "client_message") return "◉";
  if (type === "client_media") return "▣";
  return "◷";
}

function NotificationsSidebar({
  open,
  onClose,
  notifications,
  loading,
  error,
  unreadCount,
  onLoad,
  onMarkRead,
  onMarkAllRead,
  onClear,
  onClearAll,
  onViewBooking,
}: NotificationsSidebarProps) {
  useEffect(() => {
    if (open) onLoad();
  }, [open, onLoad]);

  if (!open) return null;

  const handleClick = (notification: Notification) => {
    if (!notification.read) {
      void onMarkRead(notification.id);
    }

    const bookingId = notification.metadata?.bookingId;
    if (typeof bookingId === "number") {
      onClose();
      onViewBooking?.(bookingId);
    }
  };

  const hasNotifications = notifications.length > 0;

  return (
    <div className="notifications-sidebar-overlay" onClick={onClose}>
      <aside className="notifications-sidebar" onClick={(event) => event.stopPropagation()}>
        <header className="notifications-sidebar__header">
          <div>
            <h2>Notifications</h2>
            {unreadCount > 0 ? (
              <p className="notifications-sidebar__subtitle">{unreadCount} unread</p>
            ) : (
              <p className="notifications-sidebar__subtitle">You're all caught up</p>
            )}
          </div>
          <button className="notifications-sidebar__close" onClick={onClose} aria-label="Close notifications">
            ×
          </button>
        </header>

        {hasNotifications ? (
          <div className="notifications-sidebar__actions">
            {unreadCount > 0 ? (
              <button type="button" className="notifications-sidebar__action" onClick={() => void onMarkAllRead()}>
                Mark all as read
              </button>
            ) : null}
            <button type="button" className="notifications-sidebar__action" onClick={() => void onClearAll()}>
              Clear all
            </button>
          </div>
        ) : null}

        <div className="notifications-sidebar__list">
          {loading && notifications.length === 0 && (
            <p className="notifications-sidebar__empty">Loading…</p>
          )}
          {error && <p className="wizard-error">{error}</p>}
          {!loading && !error && notifications.length === 0 && (
            <p className="notifications-sidebar__empty">No notifications yet.</p>
          )}
          {notifications.map((notification) => (
            <div key={notification.id} className="notification-item-wrap">
              <button
                type="button"
                className={`notification-item${notification.read ? "" : " notification-item--unread"}`}
                onClick={() => handleClick(notification)}
              >
                <span className="notification-item__icon">{notificationIcon(notification.type)}</span>
                <span className="notification-item__content">
                  <span className="notification-item__title">{notification.title}</span>
                  <span className="notification-item__body">{notification.body}</span>
                  <span className="notification-item__time">{formatWhen(notification.createdAt)}</span>
                </span>
                {!notification.read && <span className="notification-item__dot" aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="notification-item__clear"
                aria-label="Clear notification"
                onClick={() => void onClear(notification.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default NotificationsSidebar;
