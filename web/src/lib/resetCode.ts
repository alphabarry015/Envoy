/** Types as 123-456: digits only, the dash is added automatically. */
export function formatResetCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
}

export function isCompleteResetCode(value: string): boolean {
  return value.replace(/\D/g, "").length === 6;
}
