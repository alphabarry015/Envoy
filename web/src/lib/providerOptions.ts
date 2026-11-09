export const PROVIDER_OPTIONS = [
  { id: "ses", label: "Amazon SES" },
  { id: "resend", label: "Resend" },
  { id: "brevo", label: "Brevo" },
  { id: "mailtrap", label: "Mailtrap" },
] as const;

export type ProviderId = (typeof PROVIDER_OPTIONS)[number]["id"];

export function providerLabel(id: string | null | undefined): string {
  if (!id) return "Auto";
  const match = PROVIDER_OPTIONS.find((item) => item.id === id);
  return match?.label ?? id;
}
