import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  read: boolean;
}

export function useNotifications(pollMs = 60_000) {
  const { fetchWithAuth } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.count ?? 0);
    } catch {
      // ignore polling errors
    }
  }, [fetchWithAuth]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/notifications?limit=50");
      if (!res.ok) throw new Error("Could not load notifications");
      const data = (await res.json()) as Notification[];
      setNotifications(data);
      await refreshUnreadCount();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, refreshUnreadCount]);

  const markRead = useCallback(
    async (id: number) => {
      const res = await fetchWithAuth(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (!res.ok) return;
      const updated = (await res.json()) as Notification;
      setNotifications((current) =>
        current.map((item) => (item.id === id ? updated : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    },
    [fetchWithAuth]
  );

  const markAllRead = useCallback(async () => {
    const res = await fetchWithAuth("/api/notifications/read-all", { method: "POST" });
    if (!res.ok) return;
    setNotifications((current) =>
      current.map((item) => ({ ...item, read: true, readAt: item.readAt ?? new Date().toISOString() }))
    );
    setUnreadCount(0);
  }, [fetchWithAuth]);

  const clearNotificationById = useCallback(
    async (id: number) => {
      const res = await fetchWithAuth(`/api/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) return;

      setNotifications((current) => {
        const removed = current.find((item) => item.id === id);
        if (removed && !removed.read) {
          setUnreadCount((count) => Math.max(0, count - 1));
        }
        return current.filter((item) => item.id !== id);
      });
    },
    [fetchWithAuth]
  );

  const clearAll = useCallback(async () => {
    const res = await fetchWithAuth("/api/notifications", { method: "DELETE" });
    if (!res.ok) return;
    setNotifications([]);
    setUnreadCount(0);
  }, [fetchWithAuth]);

  useEffect(() => {
    void refreshUnreadCount();
    const interval = setInterval(() => void refreshUnreadCount(), pollMs);
    return () => clearInterval(interval);
  }, [refreshUnreadCount, pollMs]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    loadNotifications,
    markRead,
    markAllRead,
    clearNotification: clearNotificationById,
    clearAll,
    refreshUnreadCount,
  };
}
