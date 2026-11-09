const CODE_LENGTH = 16;

/** Types as XXXX-XXXX-XXXX-XXXX: uppercase, dashes added automatically. Longer legacy tokens are left as pasted. */
export function formatInviteCode(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9]/g, "");
  if (compact.length > CODE_LENGTH) return value.trim();
  return (compact.toUpperCase().match(/.{1,4}/g) ?? []).join("-");
}
