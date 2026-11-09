import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";
import {
  type InviteDraft,
  type IssuedInvite,
  readApiError,
  toIssuedInvite,
} from "./users";

export type AccessRequestStatus = "pending" | "accepted" | "declined";

export type AccessRequestItem = {
  id: string;
  fullName: string;
  email: string;
  organization: string;
  volume: string;
  useCase: string;
  status: AccessRequestStatus;
  createdAt: string;
  decidedAt: string | null;
};

type ApiAccessRequest = {
  id: string;
  full_name: string;
  email: string;
  organization: string;
  volume: string;
  use_case: string;
  status: AccessRequestStatus;
  created_at: string;
  decided_at: string | null;
};

export const VOLUME_LABELS: Record<string, string> = {
  "<10k": "Under 10k / month",
  "10k-100k": "10k–100k / month",
  "100k-1M": "100k–1M / month",
  "1M+": "Over 1M / month",
};

function toItem(row: ApiAccessRequest): AccessRequestItem {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    organization: row.organization,
    volume: row.volume,
    useCase: row.use_case,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export async function fetchAccessRequests(): Promise<AccessRequestItem[]> {
  const response = await fetch(`${apiUrl()}/api/v1/access-requests`, {
    headers: authHeader(),
  });
  if (!response.ok)
    throw new Error(
      await readApiError(response, "Could not load access requests."),
    );
  return ((await response.json()) as ApiAccessRequest[]).map(toItem);
}

export async function acceptAccessRequest(
  id: string,
  draft: InviteDraft,
): Promise<IssuedInvite> {
  const response = await fetch(
    `${apiUrl()}/api/v1/access-requests/${id}/accept`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({
        role: draft.role === "admin" ? "admin" : "user",
        max_domains: draft.domainQuota,
        daily_send_quota: draft.dailyQuota,
        monthly_send_quota: draft.monthlyQuota,
        can_create_api_keys: draft.apiKeysEnabled,
        invite_expires_hours: draft.expiresInHours,
        provider: draft.provider,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      await readApiError(response, "Could not accept this request."),
    );
  return toIssuedInvite(await response.json());
}

export async function declineAccessRequest(
  id: string,
  notify: boolean,
): Promise<void> {
  const response = await fetch(
    `${apiUrl()}/api/v1/access-requests/${id}/decline`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ notify }),
    },
  );
  if (!response.ok)
    throw new Error(
      await readApiError(response, "Could not decline this request."),
    );
}
