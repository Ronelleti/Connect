// Small fetch wrapper for the browser: JSON in, JSON out, errors as messages.
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
  error: string | null;
  details: { errors?: { message: string }[]; warnings?: { message: string; code: string }[] } | null;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      data: data as T,
      error: response.ok ? null : ((data as { error?: string }).error ?? "הפעולה נכשלה."),
      details: response.ok ? null : ((data as { details?: ApiResult<T>["details"] }).details ?? null)
    };
  } catch {
    return { ok: false, status: 0, data: {} as T, error: "אין חיבור לשרת. נסו שוב.", details: null };
  }
}
