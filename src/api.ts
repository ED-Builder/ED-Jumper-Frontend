export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/g, "") ??
  "https://api.xxx.your.domain";

export async function requestJson<T>(
  path: string,
  options?: RequestInit & { body?: unknown; token?: string }
): Promise<{ status: number; data: T }> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  if (options?.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, data };
}
