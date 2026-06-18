import { useEffect, useState } from "react";
import { requestJson } from "../api";
import { sha256Hex } from "../crypto";
import { saveAuth } from "../session";

type AuthMode = "login" | "register" | "admin";

type AuthResponse = {
  success: boolean;
  token?: string;
  expiresAt?: number;
  reason?: string;
  role?: string;
  permissionKey?: string;
  permissionLabel?: string;
  note?: string | null;
  eventId?: number | null;
};

type ModalState = {
  title: "403" | "200";
  subtitle: string;
  permissionLabel: string;
  note: string | null;
  eventId: number | null;
};

export default function Auth({ mode = "login" }: { mode?: AuthMode }) {
  const [currentMode, setCurrentMode] = useState<AuthMode>(mode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("https://imghub.ed-builder.top");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);


  const submit = async () => {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const passwordHash = await sha256Hex(password);
      let endpoint: string;
      let body: any;

      if (currentMode === "admin") {
        endpoint = "/admin/login";
        body = { passwordHash };
      } else {
        endpoint = currentMode === "register" ? "/auth/register" : "/auth/login";
        body =
          currentMode === "register"
            ? { username: username.trim(), passwordHash, avatarUrl: avatarUrl.trim() }
            : { username: username.trim(), passwordHash };
      }

      const { status, data } = await requestJson<AuthResponse>(endpoint, {
        method: "POST",
        body
      });
      setLoading(false);
      if (!data.success || !data.token || !data.expiresAt) {
        if (data.permissionLabel) {
          setModal({
            title: "403",
            subtitle: "ED-Jumper-API 拒绝了此次操作",
            permissionLabel: data.permissionLabel,
            note: data.note ?? null,
            eventId: data.eventId ?? null
          });
        } else {
          setError(data.reason ?? "操作失败");
        }
        return;
      }
      saveAuth(data.token, data.expiresAt);
      setInfo(currentMode === "register" ? "注册成功，请等待跳转" : "登录成功，请等待跳转");
      window.location.href = "/manage";
    } catch {
      setLoading(false);
      setError("请求失败，请稍后再试");
    }
  };

  const switchMode = (next: AuthMode) => {
    setCurrentMode(next);
    setError("");
    setInfo("");
  };

  const closeModal = async () => {
    if (modal?.eventId && modal.title === "200") {
      try {
        await requestJson<{ success: boolean }>(`/me/notifications/${modal.eventId}/ack`, {
          method: "POST"
        });
      } catch {
        // Ignore errors
      }
    }
    setModal(null);
  };

  return (
    <div className="app">
      <div className="center">
        <div className="card auth-card">
          <div className="stack">
            {currentMode === "admin" ? (
              <div className="hint">管理员登录</div>
            ) : (
              <>
                <div className="auth-tabs">
                  <button className={currentMode === "login" ? "tab active" : "tab"} onClick={() => switchMode("login")}>登录</button>
                  <button className={currentMode === "register" ? "tab active" : "tab"} onClick={() => switchMode("register")}>注册</button>
                </div>
                <div className="hint">你的账号默认拥有登录鉴权、创建分发、验证分发和更改个人信息权限。</div>
              </>
            )}
            {currentMode !== "admin" && (
              <input
                placeholder={currentMode === "register" ? "用户名" : "用户名"}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            )}
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {currentMode === "register" ? (
              <>
                <input
                  placeholder="头像图片链接（你可以尝试在 https://imghub.ed-builder.top 上传你的图片并复制链接）"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                />
                <div className="hint">建议使用图片直链，注册后也可以在个人资料里自由修改。</div>
              </>
            ) : null}
            <button onClick={submit} disabled={loading || (currentMode !== "admin" && !username.trim()) || !password}>
              {currentMode === "register" ? "注册账号" : currentMode === "admin" ? "管理员登录" : "登录账号"}
            </button>
            {error ? <div className="error">{error}</div> : null}
            {info ? <div className="hint">{info}</div> : null}
            <div className="auth-links">
              <a href="/manage">返回管理页</a>
              <a href="/">返回首页</a>
            </div>
          </div>
        </div>
      </div>
      {modal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-shell" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{modal.title}</div>
            <div className="modal-subtitle">{modal.subtitle}</div>
            <div className="modal-reason">原因</div>
            <ul>
              <li>你的【{modal.permissionLabel}】权限已{modal.title === "403" ? "被撤销" : "被成功校验"}</li>
              {modal.note ? <li>{modal.note}</li> : null}
            </ul>
            <div className="modal-footer-text">若你认为这是错误，请联系管理员</div>
            <button onClick={closeModal}>确定</button>
          </div>
        </div>
      ) : null}
      <footer className="footer">Designed with love by ED_Builder | 测试通过后将会开源，敬请期待</footer>
    </div>
  );
}
