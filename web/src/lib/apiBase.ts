/** Base URL of the Envoy API, without a trailing slash.

Empty means the current origin. That is the Vercel services deployment,
where `/api` is routed to the API service on the same domain. Set
`VITE_API_URL` only when the API is served from another origin.
*/
export function apiBase(): string {
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}
