/** Server-side calls to the API (from server components), with the proxy secret and a timeout. */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

export function apiFetch(path: string, init: RequestInit & { next?: { revalidate?: number } } = {}, timeoutMs = 8000) {
  const headers = new Headers(init.headers);
  if (process.env.PROXY_SECRET) headers.set("x-kr-proxy", process.env.PROXY_SECRET);
  // A sleeping free-tier API can take ~50 s to wake; give up early and let the page fall back.
  return fetch(`${API_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}
