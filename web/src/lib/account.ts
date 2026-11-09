export function accountName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._-]+/)
    .map((part) => part.replace(/\d+$/g, ""))
    .filter(Boolean);
  if (words.length === 0) return "Account";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The name the person typed (invite or access request) wins; the email is only a fallback. */
export function displayNameOf(
  email: string,
  displayName?: string | null,
): string {
  return displayName?.trim() || accountName(email);
}

export const PROFILE_NAME_EVENT = "envoy:profile-name";

export function announceProfileName(displayName: string | null) {
  window.dispatchEvent(
    new CustomEvent(PROFILE_NAME_EVENT, { detail: displayName }),
  );
}

export function accountInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
