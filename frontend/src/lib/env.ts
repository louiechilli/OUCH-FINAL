function parseEnvFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

/** When true, staff must enable push notifications before using the app. */
export const notificationsRequired = parseEnvFlag(
  import.meta.env.VITE_NOTIFICATIONS_REQUIRED,
  true
);
