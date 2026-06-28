import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

interface Permission {
  id: number;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

interface PermissionGroup {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  permissions: Permission[];
}

interface PermissionUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  permissionIds: number[];
}

interface PermissionsPanelProps {
  onClose: () => void;
}

function PermissionsPanel({ onClose }: PermissionsPanelProps) {
  const { fetchWithAuth, user } = useAuth();
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [users, setUsers] = useState<PermissionUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [draftPermissionIds, setDraftPermissionIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"assign" | "schema">("assign");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schemaRes, usersRes] = await Promise.all([
        fetchWithAuth("/api/admin/permissions/schema"),
        fetchWithAuth("/api/admin/permissions/users"),
      ]);

      if (schemaRes.status === 403 || usersRes.status === 403) {
        setError("Admin access required");
        return;
      }
      if (!schemaRes.ok || !usersRes.ok) {
        setError("Could not load permissions");
        return;
      }

      const schema = await schemaRes.json();
      const usersData = await usersRes.json();
      setGroups(schema.groups);
      setUsers(usersData.users);

      const firstNonAdmin = usersData.users.find((u: PermissionUser) => !u.isAdmin);
      const initialUser = firstNonAdmin ?? usersData.users[0] ?? null;
      if (initialUser) {
        setSelectedUserId(initialUser.id);
        setDraftPermissionIds(initialUser.permissionIds);
      }
    } catch {
      setError("Could not load permissions");
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    if (user?.isAdmin !== true) return;
    void loadData();
  }, [loadData, user?.isAdmin]);

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const handleSelectUser = (userId: number) => {
    const next = users.find((u) => u.id === userId);
    setSelectedUserId(userId);
    setDraftPermissionIds(next?.permissionIds ?? []);
  };

  const togglePermission = (permissionId: number) => {
    setDraftPermissionIds((current) =>
      current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId]
    );
  };

  const toggleGroup = (group: PermissionGroup) => {
    const groupIds = group.permissions.map((p) => p.id);
    const allSelected = groupIds.every((id) => draftPermissionIds.includes(id));
    if (allSelected) {
      setDraftPermissionIds((current) => current.filter((id) => !groupIds.includes(id)));
    } else {
      setDraftPermissionIds((current) => [...new Set([...current, ...groupIds])]);
    }
  };

  const handleSave = async () => {
    if (!selectedUserId || selectedUser?.isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/admin/permissions/users/${selectedUserId}`, {
        method: "PUT",
        body: JSON.stringify({ permissionIds: draftPermissionIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save permissions");
        return;
      }
      setUsers((current) =>
        current.map((u) =>
          u.id === selectedUserId ? { ...u, permissionIds: [...draftPermissionIds] } : u
        )
      );
    } catch {
      setError("Could not save permissions");
    } finally {
      setSaving(false);
    }
  };

  if (user?.isAdmin !== true) {
    return (
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Access denied</h2>
            <p className="panel__subtitle">Admin access is required to manage permissions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel permissions-panel">
      <div className="panel__header">
        <div>
          <h2>Permissions</h2>
          <p className="panel__subtitle">Manage grouped access for staff accounts</p>
        </div>
        <button className="permissions-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="permissions-panel__tabs">
        <button
          className={`permissions-panel__tab${activeTab === "assign" ? " permissions-panel__tab--active" : ""}`}
          onClick={() => setActiveTab("assign")}
        >
          Assign to users
        </button>
        <button
          className={`permissions-panel__tab${activeTab === "schema" ? " permissions-panel__tab--active" : ""}`}
          onClick={() => setActiveTab("schema")}
        >
          Permission groups
        </button>
      </div>

      {error ? <p className="permissions-panel__error">{error}</p> : null}

      {loading ? (
        <p className="permissions-panel__loading">Loading…</p>
      ) : activeTab === "schema" ? (
        <div className="permissions-schema">
          {groups.map((group) => (
            <div key={group.id} className="permissions-group">
              <div className="permissions-group__header">
                <h3>{group.name}</h3>
                <span className="permissions-group__slug">{group.slug}</span>
              </div>
              {group.description ? (
                <p className="permissions-group__description">{group.description}</p>
              ) : null}
              <ul className="permissions-group__list">
                {group.permissions.map((perm) => (
                  <li key={perm.id} className="permissions-item">
                    <span className="permissions-item__name">{perm.name}</span>
                    <code className="permissions-item__key">{perm.key}</code>
                    {perm.description ? (
                      <span className="permissions-item__description">{perm.description}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="permissions-assign">
          <div className="permissions-assign__users">
            <h3>Staff</h3>
            <ul>
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    className={`permissions-user${selectedUserId === u.id ? " permissions-user--selected" : ""}`}
                    onClick={() => handleSelectUser(u.id)}
                  >
                    <span className="permissions-user__name">{u.name}</span>
                    <span className="permissions-user__email">{u.email}</span>
                    {u.isAdmin ? <span className="permissions-user__badge">Admin</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="permissions-assign__groups">
            {selectedUser?.isAdmin ? (
              <p className="permissions-panel__note">
                Admins have full access to all features. Granular permissions apply to non-admin
                accounts only.
              </p>
            ) : (
              <>
                {groups.map((group) => {
                  const groupIds = group.permissions.map((p) => p.id);
                  const selectedCount = groupIds.filter((id) =>
                    draftPermissionIds.includes(id)
                  ).length;
                  const allSelected =
                    groupIds.length > 0 && selectedCount === groupIds.length;

                  return (
                    <div key={group.id} className="permissions-group permissions-group--editable">
                      <label className="permissions-group__toggle">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleGroup(group)}
                        />
                        <span className="permissions-group__toggle-label">
                          <strong>{group.name}</strong>
                          <span>
                            {selectedCount}/{group.permissions.length}
                          </span>
                        </span>
                      </label>
                      <ul className="permissions-group__checks">
                        {group.permissions.map((perm) => (
                          <li key={perm.id}>
                            <label className="permissions-check">
                              <input
                                type="checkbox"
                                checked={draftPermissionIds.includes(perm.id)}
                                onChange={() => togglePermission(perm.id)}
                              />
                              <span>
                                <span className="permissions-check__name">{perm.name}</span>
                                <code className="permissions-check__key">{perm.key}</code>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                <button
                  className="permissions-panel__save"
                  onClick={() => void handleSave()}
                  disabled={saving || !selectedUserId}
                >
                  {saving ? "Saving…" : "Save permissions"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PermissionsPanel;
