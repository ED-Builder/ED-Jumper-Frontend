import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../api";
import { sha256Hex } from "../crypto";
import { clearAuth, loadAuth } from "../session";

type PermissionState = {
  enabled: boolean;
  note: string | null;
};

type Permissions = {
  login: PermissionState;
  create: PermissionState;
  verify: PermissionState;
  profile: PermissionState;
};

type Notification = {
  id: number;
  user_id: number;
  permission_key: "login" | "create" | "verify" | "profile";
  permission_label: string;
  granted: number;
  note: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
};

type LinkItem = {
  id: number;
  path: string;
  url: string;
  hasPassword: boolean;
  ownerUserId: number | null;
  createdByAdmin: boolean;
  selfVerified: boolean;
  moderatorVerified: boolean;
  visibility: "moderator" | "verified" | "unknown";
  owner: { id: number; username: string; avatarUrl: string } | null;
  createdAt: string;
  updatedAt: string;
};

type UserItem = {
  id: number;
  username: string;
  avatarUrl: string;
  permissions: Permissions;
  linkCount: number;
  createdAt: string;
  updatedAt: string;
};

type MeResponse = {
  success: boolean;
  kind?: "admin" | "user";
  user?: { id: number; username: string; avatarUrl: string };
  permissions?: Permissions;
  pendingNotifications?: Notification[];
  ownedLinks?: LinkItem[];
  reason?: string;
};

type UsersResponse = {
  success: boolean;
  users: UserItem[];
  reason?: string;
};

type AdminLinksResponse = {
  success: boolean;
  links: LinkItem[];
  reason?: string;
};

type UserLinksResponse = {
  success: boolean;
  links: LinkItem[];
  user?: { id: number; username: string; avatarUrl: string };
  reason?: string;
};

type SimpleResponse = {
  success: boolean;
  reason?: string;
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

type LinkFormState = {
  id: number | null;
  path: string;
  url: string;
  password: string;
  removePassword: boolean;
  selfVerified: boolean;
  moderatorVerified: boolean;
};

type UserFormState = {
  id: number | null;
  username: string;
  avatarUrl: string;
  password: string;
  permissions: {
    login: boolean;
    create: boolean;
    verify: boolean;
    profile: boolean;
  };
  note: string;
};

type SessionState = {
  token: string | null;
  expiresAt: number | null;
};

const PERMISSION_LABELS = {
  login: "登录鉴权",
  create: "创建分发",
  verify: "验证分发",
  profile: "更改个人信息"
} as const;

const INITIAL_LINK_FORM: LinkFormState = {
  id: null,
  path: "",
  url: "",
  password: "",
  removePassword: false,
  selfVerified: false,
  moderatorVerified: false
};

const INITIAL_USER_FORM: UserFormState = {
  id: null,
  username: "",
  avatarUrl: "",
  password: "",
  permissions: {
    login: true,
    create: true,
    verify: true,
    profile: true
  },
  note: ""
};

function colorFor(enabled: boolean): string {
  return enabled ? "#52c41a" : "#e74c3c";
}

function iconInfo(visibility: LinkItem["visibility"]) {
  if (visibility === "moderator") {
    return { icon: "/moderator.svg", text: "这是由管理员分发或已被管理员验证的链接，管理员对此负责" };
  }
  if (visibility === "verified") {
    return { icon: "/verified.svg", text: "该用户已自行验证此分发，若发现风险请及时向管理员举报！" };
  }
  return { icon: "/unknown.svg", text: "该链接未被验证，请检验安全性" };
}

function normalizePath(input: string) {
  return input.trim().replace(/^\/+|\/+$/g, "");
}

function validatePath(input: string): string | null {
  const normalized = normalizePath(input);
  if (!normalized) {
    return "路径不能为空";
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    return "路径只能包含字母、数字、-、_";
  }
  const reserved = new Set(["manage", "admin", "api", "auth", "login", "register", "assets", "static", "favicon.ico", "robots.txt"]);
  if (reserved.has(normalized.toLowerCase())) {
    return "该路径被保留，请换一个";
  }
  return null;
}

function normalizePermissions(next: UserFormState["permissions"]): UserFormState["permissions"] {
  const result = { ...next };
  if (!result.login) {
    result.create = false;
    result.verify = false;
    result.profile = false;
  }
  if (!result.create) {
    result.verify = false;
  }
  if (result.create || result.verify || result.profile) {
    result.login = true;
  }
  if (result.verify) {
    result.create = true;
    result.login = true;
  }
  if (result.profile) {
    result.login = true;
  }
  return result;
}

function permissionDisplay(userPermissions: Permissions | UserFormState["permissions"]) {
  return [
    { key: "login", enabled: userPermissions.login.enabled ?? userPermissions.login, note: userPermissions.login.note ?? null },
    { key: "create", enabled: userPermissions.create.enabled ?? userPermissions.create, note: userPermissions.create.note ?? null },
    { key: "verify", enabled: userPermissions.verify.enabled ?? userPermissions.verify, note: userPermissions.verify.note ?? null },
    { key: "profile", enabled: userPermissions.profile.enabled ?? userPermissions.profile, note: userPermissions.profile.note ?? null }
  ] as const;
}

function emptySession(): SessionState {
  return { token: loadAuth().token, expiresAt: loadAuth().expiresAt };
}

export default function Manage() {
  const [session, setSession] = useState<SessionState>(emptySession());
  const [me, setMe] = useState<MeResponse | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [globalLinks, setGlobalLinks] = useState<LinkItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [selectedUserLinks, setSelectedUserLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);

  const [profileUsername, setProfileUsername] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profilePassword, setProfilePassword] = useState("");

  const [linkForm, setLinkForm] = useState<LinkFormState>(INITIAL_LINK_FORM);
  const [userForm, setUserForm] = useState<UserFormState>(INITIAL_USER_FORM);

  const meKind = me?.kind ?? null;
  const currentUser = me?.user ?? null;
  const currentPermissions = me?.permissions ?? null;
  const pendingNotifications = me?.pendingNotifications ?? [];
  const ownedLinks = me?.ownedLinks ?? [];

  const canManageUserLinks = Boolean(currentPermissions?.create?.enabled);
  const canEditProfile = Boolean(currentPermissions?.profile?.enabled);

  useEffect(() => {
    if (!session.token) {
      setMe(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { status, data } = await requestJson<MeResponse>("/me", {
          method: "GET",
          token: session.token ?? undefined
        });
        if (cancelled) {
          return;
        }
        setLoading(false);
        if (status === 401 || !data.success) {
          clearAuth();
          setSession({ token: null, expiresAt: null });
          setMe(null);
          setError(data.reason ?? "登录已失效");
          return;
        }
        setMe(data);
        if (data.kind === "user" && data.user) {
          setProfileUsername(data.user.username);
          setProfileAvatarUrl(data.user.avatarUrl);
        }
        if (data.pendingNotifications && data.pendingNotifications.length > 0 && !modal) {
          const first = data.pendingNotifications[0];
          setModal({
            title: first.granted ? "200" : "403",
            subtitle: first.granted ? "ED-Jumper-API 已放行此次操作" : "ED-Jumper-API 拒绝了此次操作",
            permissionLabel: first.permission_label,
            note: first.note,
            eventId: first.id
          });
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError("加载失败");
        }
      }
    };
    load().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.token]);

  useEffect(() => {
    if (!session.token || meKind !== "admin") {
      setUsers([]);
      setGlobalLinks([]);
      return;
    }
    let cancelled = false;
    const loadAdminData = async () => {
      try {
        const [usersRes, linksRes] = await Promise.all([
          requestJson<UsersResponse>("/admin/users", { method: "GET", token: session.token ?? undefined }),
          requestJson<AdminLinksResponse>("/admin/links", { method: "GET", token: session.token ?? undefined })
        ]);
        if (cancelled) {
          return;
        }
        if (usersRes.status === 200 && usersRes.data.success) {
          setUsers(usersRes.data.users);
        }
        if (linksRes.status === 200 && linksRes.data.success) {
          setGlobalLinks(linksRes.data.links);
        }
      } catch {
        if (!cancelled) {
          setError("加载管理数据失败");
        }
      }
    };
    loadAdminData().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.token, meKind]);

  useEffect(() => {
    if (!selectedUser || !session.token || meKind !== "admin") {
      setSelectedUserLinks([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await requestJson<UserLinksResponse>(`/admin/users/${selectedUser.id}/links`, {
          method: "GET",
          token: session.token ?? undefined
        });
        if (!cancelled && data.success) {
          setSelectedUserLinks(data.links);
        }
      } catch {
        if (!cancelled) {
          setError("加载分发列表失败");
        }
      }
    };
    load().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedUser, session.token, meKind]);

  useEffect(() => {
    if (modal) {
      return;
    }
    if (pendingNotifications.length > 0) {
      const first = pendingNotifications[0];
      setModal({
        title: first.granted ? "200" : "403",
        subtitle: first.granted ? "ED-Jumper-API 已放行此次操作" : "ED-Jumper-API 拒绝了此次操作",
        permissionLabel: first.permission_label,
        note: first.note,
        eventId: first.id
      });
    }
  }, [pendingNotifications, modal]);

  const sessionRefresh = async () => {
    if (!session.token) {
      return;
    }
    const { status, data } = await requestJson<MeResponse>("/me", {
      method: "GET",
      token: session.token
    });
    if (status === 200 && data.success) {
      setMe(data);
    }
  };

  const ensureSession = () => {
    if (!session.token) {
      return false;
    }
    return true;
  };

  const openApiModal = (data: SimpleResponse) => {
    if (!data.permissionLabel) {
      return;
    }
    setModal({
      title: data.reason === "Permission Denied" ? "403" : "200",
      subtitle: data.reason === "Permission Denied" ? "ED-Jumper-API 拒绝了此次操作" : "ED-Jumper-API 已放行此次操作",
      permissionLabel: data.permissionLabel,
      note: data.note ?? null,
      eventId: data.eventId ?? null
    });
  };

  const closeModal = async () => {
    if (modal?.eventId && session.token) {
      await requestJson<{ success: boolean }>(`/me/notifications/${modal.eventId}/ack`, {
        method: "POST",
        token: session.token
      }).catch(() => undefined);
      await sessionRefresh().catch(() => undefined);
    }
    setModal(null);
  };

  const submitProfile = async () => {
    if (!session.token || !currentPermissions?.profile?.enabled) {
      setModal({
        title: "403",
        subtitle: "ED-Jumper-API 拒绝了此次操作",
        permissionLabel: PERMISSION_LABELS.profile,
        note: currentPermissions?.profile?.note ?? null,
        eventId: null
      });
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const payload: Record<string, string> = {};
      if (profileUsername.trim() !== currentUser?.username) {
        payload.username = profileUsername.trim();
      }
      if (profileAvatarUrl.trim() !== currentUser?.avatarUrl) {
        payload.avatarUrl = profileAvatarUrl.trim();
      }
      if (profilePassword.trim()) {
        payload.passwordHash = await sha256Hex(profilePassword.trim());
      }
      const { status, data } = await requestJson<SimpleResponse & { user?: unknown }>("/me/profile", {
        method: "PUT",
        token: session.token,
        body: payload
      });
      setLoading(false);
      if (status === 403 || !data.success) {
        if (status === 403) {
          openApiModal(data);
        } else {
          setError(data.reason ?? "更新失败");
        }
        return;
      }
      setInfo("个人信息已更新");
      setProfilePassword("");
      await sessionRefresh().catch(() => undefined);
    } catch {
      setLoading(false);
      setError("更新失败");
    }
  };

  const saveLink = async () => {
    if (!session.token) {
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const pathError = validatePath(linkForm.path);
      if (pathError) {
        setLoading(false);
        setError(pathError);
        return;
      }
      if (!linkForm.url.trim()) {
        setLoading(false);
        setError("URL 不能为空");
        return;
      }
      const payload: Record<string, unknown> = {
        path: normalizePath(linkForm.path),
        url: linkForm.url.trim(),
        selfVerified: linkForm.selfVerified
      };
      if (linkForm.removePassword) {
        payload.password = "";
      } else if (linkForm.password.trim()) {
        payload.password = await sha256Hex(linkForm.password.trim());
      }
      if (meKind === "admin") {
        payload.moderatorVerified = linkForm.moderatorVerified;
      }
      const endpoint = linkForm.id === null ? (meKind === "admin" ? "/admin/links" : "/user/links") : meKind === "admin" ? `/admin/links/${linkForm.id}` : `/user/links/${linkForm.id}`;
      const method = linkForm.id === null ? "POST" : "PUT";
      const { status, data } = await requestJson<SimpleResponse>(endpoint, {
        method,
        token: session.token,
        body: payload
      });
      setLoading(false);
      if (status === 403 || !data.success) {
        if (status === 403) {
          openApiModal(data);
        } else {
          setError(data.reason ?? "保存失败");
        }
        return;
      }
      setLinkForm(INITIAL_LINK_FORM);
      setInfo(linkForm.id === null ? "创建成功" : "更新成功");
      await sessionRefresh().catch(() => undefined);
      if (meKind === "admin" && selectedUser) {
        const { data: selected } = await requestJson<UserLinksResponse>(`/admin/users/${selectedUser.id}/links`, {
          method: "GET",
          token: session.token
        });
        if (selected.success) {
          setSelectedUserLinks(selected.links);
        }
      }
    } catch {
      setLoading(false);
      setError("保存失败");
    }
  };

  const editLink = (item: LinkItem) => {
    setLinkForm({
      id: item.id,
      path: item.path,
      url: item.url,
      password: "",
      removePassword: false,
      selfVerified: item.selfVerified,
      moderatorVerified: item.moderatorVerified
    });
  };

  const deleteLink = async (id: number) => {
    if (!session.token) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const endpoint = meKind === "admin" ? `/admin/links/${id}` : `/user/links/${id}`;
      const { status, data } = await requestJson<SimpleResponse>(endpoint, {
        method: "DELETE",
        token: session.token
      });
      setLoading(false);
      if (status === 403 || !data.success) {
        if (status === 403) {
          openApiModal(data);
        } else {
          setError(data.reason ?? "删除失败");
        }
        return;
      }
      setInfo("删除成功");
      await sessionRefresh().catch(() => undefined);
      if (meKind === "admin" && selectedUser) {
        const { data: selected } = await requestJson<UserLinksResponse>(`/admin/users/${selectedUser.id}/links`, {
          method: "GET",
          token: session.token
        });
        if (selected.success) {
          setSelectedUserLinks(selected.links);
        }
      }
    } catch {
      setLoading(false);
      setError("删除失败");
    }
  };

  const verifyLink = async (id: number, moderatorVerified: boolean) => {
    if (!session.token) {
      return;
    }
    const { status, data } = await requestJson<SimpleResponse>(
      meKind === "admin" ? `/admin/links/${id}` : `/user/links/${id}`,
      {
        method: "PUT",
        token: session.token,
        body: meKind === "admin" ? { moderatorVerified } : { selfVerified: moderatorVerified }
      }
    );
    if (status === 403 || !data.success) {
      if (status === 403) {
        openApiModal(data);
      } else {
        setError(data.reason ?? "更新失败");
      }
      return;
    }
    setInfo(moderatorVerified ? "已验证" : "已取消验证");
    await sessionRefresh().catch(() => undefined);
    if (meKind === "admin" && selectedUser) {
      const { data: selected } = await requestJson<UserLinksResponse>(`/admin/users/${selectedUser.id}/links`, {
        method: "GET",
        token: session.token
      });
      if (selected.success) {
        setSelectedUserLinks(selected.links);
      }
    }
  };

  const selectUser = async (user: UserItem) => {
    setSelectedUser(user);
    setUserForm({
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      password: "",
      permissions: {
        login: user.permissions.login.enabled,
        create: user.permissions.create.enabled,
        verify: user.permissions.verify.enabled,
        profile: user.permissions.profile.enabled
      },
      note: ""
    });
  };

  const updateUserPermissionsLocal = (key: keyof UserFormState["permissions"], checked: boolean) => {
    setUserForm((prev) => {
      const next = { ...prev.permissions, [key]: checked };
      const normalized = normalizePermissions(next);
      return { ...prev, permissions: normalized };
    });
  };

  const saveUser = async () => {
    if (!session.token || meKind !== "admin" || !userForm.id) {
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const payload: Record<string, unknown> = {
        username: userForm.username.trim(),
        avatarUrl: userForm.avatarUrl.trim(),
        canLogin: userForm.permissions.login,
        canCreate: userForm.permissions.create,
        canVerify: userForm.permissions.verify,
        canProfile: userForm.permissions.profile,
        note: userForm.note.trim()
      };
      if (userForm.password.trim()) {
        payload.passwordHash = await sha256Hex(userForm.password.trim());
      }
      const { status, data } = await requestJson<SimpleResponse>(`/admin/users/${userForm.id}`, {
        method: "PUT",
        token: session.token,
        body: payload
      });
      setLoading(false);
      if (status === 403 || !data.success) {
        if (status === 403) {
          openApiModal(data);
        } else {
          setError(data.reason ?? "更新失败");
        }
        return;
      }
      setInfo("用户信息已更新");
      await sessionRefresh().catch(() => undefined);
      const usersRes = await requestJson<UsersResponse>("/admin/users", { method: "GET", token: session.token });
      if (usersRes.data.success) {
        setUsers(usersRes.data.users);
      }
    } catch {
      setLoading(false);
      setError("更新失败");
    }
  };

  const userPermissionLine = useMemo(() => {
    if (!currentPermissions) {
      return [];
    }
    return permissionDisplay(currentPermissions);
  }, [currentPermissions]);

  if (!session.token) {
    return (
      <div className="app">
        <div className="center">
          <div className="card auth-card">
            <div className="stack">
              <div className="title-small">欢迎回来</div>
              <div className="hint">这里是管理入口。普通账号请先去注册/登录页完成账号创建或登录。</div>
              <div className="auth-links">
                <a href="/auth">前往注册 / 登录</a>
                <a href="/">返回首页</a>
              </div>
            </div>
          </div>
        </div>
        <footer className="footer">Designed with love by ED_Builder | <a href="https://github.com/ED-Builder/ED-Jumper-Frontend">Frontend</a> and <a href="https://github.com/ED-Builder/ED-Jumper-API">API</a> Open Sourced under MIT License</footer>
      </div>
    );
  }

  return (
    <div className="app">
      {(error || info) && (
        <div className={`status-banner ${info ? 'success' : 'error'}`}>
          {error || info}
        </div>
      )}
      <div className="panel">
        <div className="card">
          <div className="row">
            <div>
              <h2>{meKind === "admin" ? "管理员控制台" : "个人控制台"}</h2>
              <div className="hint">
                {meKind === "admin"
                  ? "管理员可以管理普通用户、修改权限和处理所有分发。"
                  : "普通账号可以管理自己的资料与分发，并根据权限状态执行操作。"}
              </div>
            </div>
            <button
              className="small"
              onClick={() => {
                clearAuth();
                setSession({ token: null, expiresAt: null });
                setMe(null);
              }}
            >
              退出登录
            </button>
          </div>
        </div>

        {meKind === "user" && currentUser ? (
          <>
            <div className="card">
              <div className="stack">
                <div className="section-title">个人资料</div>
                <div className="profile-card">
                  <img className="avatar large" src={currentUser.avatarUrl} alt={currentUser.username} />
                  <div>
                    <div className="profile-name">{currentUser.username} #UID {currentUser.id}</div>
                    <div className="hint">头像链接：{currentUser.avatarUrl}</div>
                  </div>
                </div>
                <div className="row">
                  <input placeholder="用户名" value={profileUsername} onChange={(e) => setProfileUsername(e.target.value)} />
                  <input placeholder="头像链接" value={profileAvatarUrl} onChange={(e) => setProfileAvatarUrl(e.target.value)} />
                </div>
                <input type="password" placeholder="新密码（留空不修改）" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} />
                <div className="permission-grid compact">
                  {userPermissionLine.map((item) => (
                    <label key={item.key} className="permission-cell">
                     <span style={{ color: colorFor(item.enabled) }}>{PERMISSION_LABELS[item.key as keyof typeof PERMISSION_LABELS]}：{item.enabled ? "授予" : "取消"}</span>
                      {item.note ? <small className="hint">{item.note}</small> : <small className="hint">&nbsp;</small>}
                    </label>
                  ))}
                </div>
                <div className="hint">推荐头像图床：<a href="https://imghub.ed-builder.top">https://imghub.ed-builder.top</a></div>
                <div className="row">
                  <button onClick={submitProfile} disabled={loading}>
                    保存个人资料
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="stack">
                <div className="section-title">创建 / 编辑分发</div>
                <div className="row">
                  <input placeholder="路径" value={linkForm.path} onChange={(e) => setLinkForm((prev) => ({ ...prev, path: e.target.value }))} />
                  <input placeholder="跳转 URL" value={linkForm.url} onChange={(e) => setLinkForm((prev) => ({ ...prev, url: e.target.value }))} />
                </div>
                <div className="row">
                  <input
                    type="password"
                    placeholder={linkForm.id === null ? "跳转密码（可留空）" : "新密码（留空不修改）"}
                    value={linkForm.password}
                    onChange={(e) => setLinkForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                  <label className="checkbox small">
                    <input
                      type="checkbox"
                      checked={linkForm.selfVerified}
                      onChange={(e) => setLinkForm((prev) => ({ ...prev, selfVerified: e.target.checked }))}
                    />
                    自行验证此分发
                  </label>
                  {linkForm.id !== null ? (
                    <label className="checkbox small">
                      <input
                        type="checkbox"
                        checked={linkForm.removePassword}
                        onChange={(e) => setLinkForm((prev) => ({ ...prev, removePassword: e.target.checked }))}
                      />
                      取消密码
                    </label>
                  ) : null}
                </div>
                <div className="row">
                  <button onClick={saveLink} disabled={loading}>
                    {linkForm.id === null ? "创建分发" : "保存分发"}
                  </button>
                  {linkForm.id !== null ? (
                    <button className="link-button" onClick={() => setLinkForm(INITIAL_LINK_FORM)}>
                      取消编辑
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="stack">
                <div className="section-title">我的分发</div>
                {ownedLinks.length === 0 ? <div className="hint">暂无分发</div> : null}
                {ownedLinks.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>路径</th>
                        <th>链接</th>
                        <th>验证状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownedLinks.map((item) => {
                        const icon = iconInfo(item.visibility);
                        return (
                          <tr key={item.id}>
                            <td>{item.id}</td>
                            <td>{item.path}</td>
                            <td>{item.url}</td>
                            <td>
                              <div className="link-verify-cell">
                                <img src={icon.icon} alt={icon.text} className="verify-img-large" title={icon.text} />
                              </div>
                            </td>
                            <td className="row action-row">
                              <button className="link-button" onClick={() => editLink(item)}>编辑</button>
                              <button className="link-button" onClick={() => deleteLink(item.id)}>删除</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {meKind === "admin" ? (
          <>
            <div className="card">
              <div className="stack">
                <div className="section-title">用户管理</div>
                {users.length === 0 ? <div className="hint">暂无普通用户</div> : null}
                {users.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>UID</th>
                        <th>头像</th>
                        <th>用户名</th>
                        <th>权限</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td><img className="avatar" src={user.avatarUrl} alt={user.username} /></td>
                          <td>{user.username}</td>
                          <td>
                            <div className="permission-inline">
                              {permissionDisplay(user.permissions).map((item) => (
                                <span key={item.key} style={{ color: colorFor(item.enabled) }}>
                                  {PERMISSION_LABELS[item.key as keyof typeof PERMISSION_LABELS]}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="row action-row">
                            <button className="link-button" onClick={() => selectUser(user)}>修改用户信息</button>
                            <button className="link-button" onClick={() => selectUser(user)}>查看分发列表</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </div>

            {selectedUser ? (
              <div className="card">
                <div className="stack">
                  <div className="section-title">编辑用户 #{selectedUser.id}</div>
                  <div className="profile-card">
                    <img className="avatar large" src={userForm.avatarUrl || selectedUser.avatarUrl} alt={selectedUser.username} />
                    <div>
                      <div className="profile-name">{selectedUser.username} #UID {selectedUser.id}</div>
                      <div className="hint">该用户注册头像可自由修改。</div>
                    </div>
                  </div>
                  <div className="row">
                    <input placeholder="用户名" value={userForm.username} onChange={(e) => setUserForm((prev) => ({ ...prev, username: e.target.value }))} />
                    <input placeholder="头像链接" value={userForm.avatarUrl} onChange={(e) => setUserForm((prev) => ({ ...prev, avatarUrl: e.target.value }))} />
                  </div>
                  <input type="password" placeholder="新密码（留空不修改）" value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} />
                  <div className="permission-grid">
                    {(["login", "create", "verify", "profile"] as const).map((key) => (
                      <label key={key} className="permission-cell">
                        <input
                          type="checkbox"
                          checked={userForm.permissions[key]}
                          onChange={(e) => updateUserPermissionsLocal(key, e.target.checked)}
                        />
                        <span style={{ color: colorFor(userForm.permissions[key]) }}>
                          {PERMISSION_LABELS[key]}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="hint">权限共存：取消登录鉴权会同时取消其余三项；取消创建分发会同时取消验证分发。</div>
                  <input placeholder="附加文本（会显示给普通用户）" value={userForm.note} onChange={(e) => setUserForm((prev) => ({ ...prev, note: e.target.value }))} />
                  <div className="row">
                    <button onClick={saveUser} disabled={loading}>保存用户信息</button>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedUser ? (
              <div className="card">
                <div className="stack">
                  <div className="section-title">该用户的分发列表</div>
                  {selectedUserLinks.length === 0 ? <div className="hint">暂无分发</div> : null}
                  {selectedUserLinks.length > 0 ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>路径</th>
                          <th>链接</th>
                          <th>验证状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUserLinks.map((item) => {
                          const icon = iconInfo(item.visibility);
                          return (
                            <tr key={item.id}>
                              <td>{item.id}</td>
                              <td>{item.path}</td>
                              <td>{item.url}</td>
                              <td>
                                <div className="link-verify-cell">
                                  <img src={icon.icon} alt={icon.text} className="verify-img-large" title={icon.text} />
                                </div>
                              </td>
                              <td className="row action-row">
                                <button className="link-button" onClick={() => deleteLink(item.id)}>删除</button>
                                <button className="link-button" onClick={() => editLink(item)}>编辑</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="stack">
                <div className="section-title">创建 / 编辑分发</div>
                <div className="row">
                  <input placeholder="路径" value={linkForm.path} onChange={(e) => setLinkForm((prev) => ({ ...prev, path: e.target.value }))} />
                  <input placeholder="跳转 URL" value={linkForm.url} onChange={(e) => setLinkForm((prev) => ({ ...prev, url: e.target.value }))} />
                </div>
                <div className="row">
                  <input
                    type="password"
                    placeholder={linkForm.id === null ? "跳转密码（可留空）" : "新密码（留空不修改）"}
                    value={linkForm.password}
                    onChange={(e) => setLinkForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                  {meKind === "admin" && linkForm.id !== null ? (
                    <>
                      <label className="checkbox small">
                        <input
                          type="checkbox"
                          checked={linkForm.selfVerified}
                          onChange={(e) => setLinkForm((prev) => ({ ...prev, selfVerified: e.target.checked }))}
                        />
                        自行验证此分发
                      </label>
                      <label className="checkbox small">
                        <input
                          type="checkbox"
                          checked={linkForm.moderatorVerified}
                          onChange={(e) => setLinkForm((prev) => ({ ...prev, moderatorVerified: e.target.checked }))}
                        />
                        管理员验证此分发
                      </label>
                    </>
                  ) : meKind !== "admin" ? (
                    <label className="checkbox small">
                      <input
                        type="checkbox"
                        checked={linkForm.selfVerified}
                        onChange={(e) => setLinkForm((prev) => ({ ...prev, selfVerified: e.target.checked }))}
                      />
                      自行验证此分发
                    </label>
                  ) : null}
                  {linkForm.id !== null ? (
                    <label className="checkbox small">
                      <input
                        type="checkbox"
                        checked={linkForm.removePassword}
                        onChange={(e) => setLinkForm((prev) => ({ ...prev, removePassword: e.target.checked }))}
                      />
                      取消密码
                    </label>
                  ) : null}
                </div>
                <div className="row">
                  <button onClick={saveLink} disabled={loading}>
                    {linkForm.id === null ? "创建分发" : "保存分发"}
                  </button>
                  {linkForm.id !== null ? (
                    <button className="link-button" onClick={() => setLinkForm(INITIAL_LINK_FORM)}>
                      取消编辑
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="stack">
                <div className="section-title">所有分发</div>
                {globalLinks.length === 0 ? <div className="hint">暂无分发</div> : null}
                {globalLinks.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>拥有者</th>
                        <th>路径</th>
                        <th>链接</th>
                        <th>验证状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalLinks.map((item) => {
                        const icon = iconInfo(item.visibility);
                        return (
                          <tr key={item.id}>
                            <td>{item.id}</td>
                            <td>{item.createdByAdmin ? "管理员分发" : (item.owner ? `${item.owner.username} #${item.owner.id}` : "未知")}</td>
                            <td>{item.path}</td>
                            <td>{item.url}</td>
                            <td>
                              <div className="link-verify-cell">
                                <img src={icon.icon} alt={icon.text} className="verify-img-large" title={icon.text} />
                              </div>
                            </td>
                            <td className="row action-row">
                              <button className="link-button" onClick={() => editLink(item)}>编辑</button>
                              <button className="link-button" onClick={() => deleteLink(item.id)}>删除</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {modal ? (
        <div className="modal-backdrop">
          <div className="modal-shell">
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

      <footer className="footer">Designed with love by ED_Builder | <a href="https://github.com/ED-Builder/ED-Jumper-Frontend">Frontend</a> and <a href="https://github.com/ED-Builder/ED-Jumper-API">API</a> Open Sourced under MIT License</footer>
    </div>
  );
}
