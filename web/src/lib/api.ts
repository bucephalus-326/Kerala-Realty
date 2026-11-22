/** Small JSON client for the API (proxied at /api). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
      // Writes always send JSON (the API's CSRF guard requires it).
      body: method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
    });
  } catch {
    throw new ApiError(0, "offline", "Can't reach the server. Check your connection and try again.");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? "Something went wrong", e.fields);
  }
  return data as T;
}

export type Role = "buyer" | "nri" | "owner" | "agent" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  verification: "not_required" | "pending" | "verified" | "rejected";
  company: string | null;
  preferences: { currency: "INR" | "AED" | "USD" | "QAR"; timeZone: string; country?: string };
  saved: string[];
}

export interface Session {
  user: User;
  permissions: string[];
}

export interface Visit {
  id: string;
  listingId: string;
  listing: { title: string; locality: string; image?: string } | null;
  mode: "in_person" | "video";
  status: "requested" | "confirmed" | "cancelled" | "completed";
  note: string | null;
  slot: string;
  timeZone: string;
  local: string;
  ist: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  buyer: "Buyer / Renter",
  nri: "NRI Buyer",
  owner: "Property Owner",
  agent: "Agent / Builder",
  admin: "Admin",
};

/** Upload a file as the raw request body (see the API's upload CSRF rule). */
export async function uploadFile<T>(path: string, file: Blob, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-KR-Upload": "1", ...headers },
      body: file,
    });
  } catch {
    throw new ApiError(0, "offline", "Upload failed. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Upload failed", data?.error?.fields);
  return data as T;
}
