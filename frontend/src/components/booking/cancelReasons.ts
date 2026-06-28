export const CANCEL_REASONS = [
  { id: "client_requested", label: "Client requested cancellation" },
  { id: "client_unavailable", label: "Client unavailable" },
  { id: "artist_unavailable", label: "Artist unavailable" },
  { id: "duplicate", label: "Duplicate booking" },
  { id: "no_show", label: "No-show" },
  { id: "other", label: "Other (specify below)" },
  { id: "none", label: "No reason" },
] as const;

export function resolveCancelReason(selectedId: string, customText: string): string | null {
  if (selectedId === "none") return null;
  if (selectedId === "other") {
    const trimmed = customText.trim();
    return trimmed || "Other";
  }
  const preset = CANCEL_REASONS.find((reason) => reason.id === selectedId);
  return preset?.label ?? null;
}
