import { apiBase as apiUrl } from "./apiBase";
import { authHeader } from "./auth";

export type UserRole = "admin" | "member";
export type UserStatus = "active" | "pending" | "suspended";

export const DOMAIN_QUOTA_OPTIONS = [1, 2, 5, 10] as const;

export type ConsoleUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  /** Max sending domains; null = unlimited. */
  domainQuota: number | null;
  dailyQuota: number | null;
  monthlyQuota: number | null;
  apiKeysEnabled: boolean;
  invitedAt: string;
  expiresAt: string | null;
};

export type InviteDraft = {
  email: string;
  name: string;
  role: UserRole;
  domainQuota: number | null;
  dailyQuota: number | null;
  monthlyQuota: number | null;
  apiKeysEnabled: boolean;
  expiresInHours: number;
};

type ApiUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "user";
  status: UserStatus;
  max_domains: number | null;
  daily_send_quota: number | null;
  monthly_send_quota: number | null;
  can_create_api_keys: boolean;
  invite_token_expires_at: string | null;
  created_at: string;
};

type InviteResponse = {
  email: string;
  invite_token: string;
  expires_at: string;
};

function apiRole(role: UserRole): "admin" | "user" {
  return role === "admin" ? "admin" : "user";
}

function toConsoleUser(row: ApiUser): ConsoleUser {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role: row.role === "admin" ? "admin" : "member",
    status: row.status,
    domainQuota: row.max_domains,
    dailyQuota: row.daily_send_quota,
    monthlyQuota: row.monthly_send_quota,
    apiKeysEnabled: row.can_create_api_keys,
    invitedAt: row.created_at,
    expiresAt: row.invite_token_expires_at,
  };
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as { msg?: string };
      if (typeof first.msg === "string") return first.msg;
    }
  } catch {
    /* réponse non JSON */
  }
  return fallback;
}

export async function fetchUsers(): Promise<ConsoleUser[]> {
  const response = await fetch(`${apiUrl()}/api/v1/auth/users`, { headers: authHeader() });
  if (!response.ok) throw new Error(await readApiError(response, "Could not load users."));
  const rows = (await response.json()) as ApiUser[];
  return rows.map(toConsoleUser);
}

export async function sendInvite(input: InviteDraft): Promise<{ email: string }> {
  const response = await fetch(`${apiUrl()}/api/v1/auth/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({
      email: input.email,
      display_name: input.name,
      role: apiRole(input.role),
      max_domains: input.domainQuota,
      daily_send_quota: input.dailyQuota,
      monthly_send_quota: input.monthlyQuota,
      can_create_api_keys: input.apiKeysEnabled,
      invite_expires_hours: input.expiresInHours,
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Could not send the invite."));
  const body = (await response.json()) as InviteResponse;
  return { email: body.email };
}

export async function updateUser(user: ConsoleUser, draft: InviteDraft): Promise<void> {
  const response = await fetch(`${apiUrl()}/api/v1/auth/users/${user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({
      role: apiRole(draft.role),
      status: user.status,
      display_name: draft.name,
      max_domains: draft.domainQuota,
      daily_send_quota: draft.dailyQuota,
      monthly_send_quota: draft.monthlyQuota,
      can_create_api_keys: draft.apiKeysEnabled,
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Could not update this user."));
}

export async function setUserStatus(user: ConsoleUser, status: UserStatus): Promise<void> {
  const response = await fetch(`${apiUrl()}/api/v1/auth/users/${user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({
      role: apiRole(user.role),
      status,
      display_name: user.name,
      max_domains: user.domainQuota,
      daily_send_quota: user.dailyQuota,
      monthly_send_quota: user.monthlyQuota,
      can_create_api_keys: user.apiKeysEnabled,
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Could not update this user."));
}

export async function revokeUserInvite(id: string): Promise<void> {
  const response = await fetch(`${apiUrl()}/api/v1/auth/users/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!response.ok) throw new Error(await readApiError(response, "Could not revoke this invite."));
}
