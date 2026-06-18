# ED-Jumper Frontend

ED-Jumper 的前端界面，基于 React + Vite 构建，部署于 Cloudflare Pages。

提供跳转落地页、用户认证、链接分发管理与管理员控制台等完整功能。

## 快速开始

将本仓库连接到你的 Cloudflare Pages，构建预设选择 React(Vite)

## 环境变量

在 Cloudflare Pages 或本地 `.env` 文件中配置环境变量：

```
VITE_API_BASE_URL=https://api.xxx.your.domain
VITE_PASSWORD_CACHE_KEY=请修改为长且随机的字符串
VITE_TOKEN_KEY=请修改为长且随机的字符串
VITE_EXPIRES_KEY=请修改为长且随机的字符串
```

## 功能

- **跳转落地页**（`/` 或任意自定义路径）：显示跳转信息、密码验证、分发所有者信息
- **用户认证**（`/auth`）：注册与登录，支持密码缓存
- **管理控制台**（`/manage`）：普通用户管理自己的分发与个人信息；管理员管理全部分发与用户权限
- 用户头像由用户自行填写图片链接，预设了一个自建的推荐图床：<https://imghub.ed-builder.top> ，您可以自己在前端修改头像 URL 来使用其他图床，或修改前端源代码换成你喜欢的图床。

## 相关项目

- [ED-Jumper API](https://github.com/ED-Builder/ED-Jumper-API) — 后端 API 服务

## 技术栈

- React 18
- TypeScript
- Vite
- Cloudflare Pages