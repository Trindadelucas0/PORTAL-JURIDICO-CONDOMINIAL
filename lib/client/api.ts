export async function api<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: Record<string, number> }> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error || {};
    const error = new Error(err.message || "Falha na requisição") as Error & {
      status: number;
      code?: string;
    };
    error.status = res.status;
    error.code = err.code;
    throw error;
  }
  return json;
}
