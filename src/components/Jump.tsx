import { useEffect, useState } from "react";
import { requestJson } from "../api";
import { sha256Hex } from "../crypto";

type LinkOwner = { id: number; username: string; avatarUrl: string } | null;

type CheckResponse = {
  success: boolean;
  url?: string;
  requiresPassword?: boolean;
  visibility?: "moderator" | "verified" | "unknown";
  owner?: LinkOwner;
  reason?: string;
};

const PASSWORD_CACHE_KEY =
  (import.meta.env.VITE_PASSWORD_CACHE_KEY as string | undefined) ??
  "ed_jumper_password_cache";
const PASSWORD_CACHE_TTL_MS = 15 * 60 * 1000;

type PasswordCacheEntry = {
  hash: string;
  expiresAt: number;
};

type PasswordCache = Record<string, PasswordCacheEntry>;

function loadPasswordCache(): PasswordCache {
  try {
    const raw = localStorage.getItem(PASSWORD_CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as PasswordCache;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const now = Date.now();
    const cleaned: PasswordCache = {};
    Object.entries(parsed).forEach(([key, entry]) => {
      if (entry && typeof entry.hash === "string" && typeof entry.expiresAt === "number" && entry.expiresAt > now) {
        cleaned[key] = entry;
      }
    });
    return cleaned;
  } catch {
    return {};
  }
}

function savePasswordCache(cache: PasswordCache) {
  try {
    localStorage.setItem(PASSWORD_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function getCachedHash(path: string): string | null {
  const cache = loadPasswordCache();
  const entry = cache[path];
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    delete cache[path];
    savePasswordCache(cache);
    return null;
  }
  return entry.hash;
}

function storeCachedHash(path: string, hash: string) {
  const cache = loadPasswordCache();
  cache[path] = { hash, expiresAt: Date.now() + PASSWORD_CACHE_TTL_MS };
  savePasswordCache(cache);
}

function clearCachedHash(path: string) {
  const cache = loadPasswordCache();
  if (cache[path]) {
    delete cache[path];
    savePasswordCache(cache);
  }
}

function iconInfo(visibility: CheckResponse["visibility"]) {
  if (visibility === "moderator") {
    return { icon: "/moderator.svg", text: "这是由管理员分发或已被管理员验证的链接，管理员对此负责" };
  }
  if (visibility === "verified") {
    return { icon: "/verified.svg", text: "该用户已自行验证此分发，若发现风险请及时向管理员举报！" };
  }
  return { icon: "/unknown.svg", text: "该链接未被验证，请检验安全性" };
}

export default function Jump({ path }: { path: string }) {
  const [status, setStatus] = useState<"loading" | "password" | "notfound" | "error">("loading");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [response, setResponse] = useState<CheckResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setMessage("");
    setPassword("");
    setRemember(false);
    setResponse(null);

    const cachedHash = getCachedHash(path);
    const run = async () => {
      const { data } = await requestJson<CheckResponse>("/check", {
        method: "POST",
        body: { path, password: cachedHash ?? "" }
      });
      if (cancelled) {
        return;
      }
      setResponse(data);
      if (data.success && data.url) {
        if (cachedHash) {
          window.location.replace(data.url);
          return;
        }
        setStatus("password");
        setMessage("");
        return;
      }
      if (data.reason === "Invalid Password") {
        if (cachedHash) {
          clearCachedHash(path);
          setMessage("密码已过期，请重新输入");
        } else {
          setMessage("请输入跳转密码");
        }
        setStatus("password");
        return;
      }
      if (data.reason === "Not Found") {
        setStatus("notfound");
        return;
      }
      setStatus("error");
      setMessage("请求失败，请稍后再试");
    };

    run().catch(() => {
      if (!cancelled) {
        setStatus("error");
        setMessage("请求失败，请稍后再试");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

  const submitPassword = async () => {
    try {
      setStatus("loading");
      setMessage("");
      const hash = await sha256Hex(password.trim());
      const { data } = await requestJson<CheckResponse>("/check", {
        method: "POST",
        body: { path, password: hash }
      });
      setResponse(data);
      if (data.success && data.url) {
        if (remember) {
          storeCachedHash(path, hash);
        } else {
          clearCachedHash(path);
        }
        window.location.replace(data.url);
        return;
      }
      if (data.reason === "Invalid Password") {
        setStatus("password");
        setMessage("密码错误，请重试");
        return;
      }
      if (data.reason === "Not Found") {
        setStatus("notfound");
        return;
      }
      setStatus("error");
      setMessage("请求失败，请稍后再试");
    } catch {
      setStatus("error");
      setMessage("请求失败，请稍后再试");
    }
  };

  if (status === "loading") {
    return (
      <div className="app">
        <div className="center">正在跳转...</div>
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="app">
        <div className="center">404：路径不存在</div>
      </div>
    );
  }

  if (status === "password") {
    const info = iconInfo(response?.visibility ?? "unknown");
    const owner = response?.owner;
    return (
      <div className="app">
        <div className="center">
          <div className="card jump-card">
            <div className="stack">
              <div className="jump-banner">
                <img src={info.icon} alt={response?.visibility ?? "unknown"} className="verify-img" />
                <span>{info.text}</span>
              </div>
              {owner ? (
                <div className="owner-line">
                  <img className="avatar large" src={owner.avatarUrl} alt={owner.username} />
                  <span>{owner.username} #UID {owner.id}</span>
                </div>
              ) : null}
              <div>{message || "请输入跳转密码"}</div>
              <input
                type="password"
                placeholder="请输入跳转密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                记住密码（15 分钟）
              </label>
              <button onClick={submitPassword}>确认跳转</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="center">{message || "请求失败，请稍后再试"}</div>
    </div>
  );
}




