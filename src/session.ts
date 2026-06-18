const TOKEN_KEY =
  (import.meta.env.VITE_TOKEN_KEY as string | undefined) ??
  "ouibhdg8y2o0bg0e0gf8vi2e8ybeg";
const EXPIRES_KEY =
  (import.meta.env.VITE_EXPIRES_KEY as string | undefined) ??
  "098g243bn0f8ib21987369ug";

export function loadAuth(): { token: string | null; expiresAt: number | null } {
  if (typeof localStorage === "undefined") {
   return { token: null, expiresAt: null };
  }
  const token = localStorage.getItem(TOKEN_KEY);
  const expiresRaw = localStorage.getItem(EXPIRES_KEY);
  const expiresAt = expiresRaw ? Number(expiresRaw) : null;
  if (!token || !expiresAt) {
   return { token: null, expiresAt: null };
  }
  if (Date.now() / 1000 > expiresAt) {
   clearAuth();
   return { token: null, expiresAt: null };
  }
  return { token, expiresAt };
}

export function saveAuth(token: string, expiresAt: number) {
  if (typeof localStorage === "undefined") {
   return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRES_KEY, String(expiresAt));
}

export function clearAuth() {
  if (typeof localStorage === "undefined") {
   return;
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

