# Frontend Web — 用户端（面向平台客户）

**两段式** 页面结构：
- **公开落地区**（`/`、`/pricing`、`/docs`、`/auth/*`）— 不需要登录，用来介绍平台、展示定价、提供快速上手文档
- **控制台**（`/console/*`）— 登录后访问，提供 Dashboard / API Key / 使用日志 / 充值 / 账单 / Playground / 设置

所有 `/console/*` 路由由 [`src/wrappers/auth.tsx`](./src/wrappers/auth.tsx) 守卫，未登录自动跳 `/auth/login?redirect=<原路径>`。

## 🧰 技术栈

- **UmiJS Max** v4 — 企业级 React 框架
- **TypeScript**
- **Ant Design** v5 + **Ant Design Pro Components**
- **@ant-design/charts** — 图表
- **dayjs** — 时间处理

## 🚀 启动

### 前置条件
- **Node.js** 20+
- **pnpm**（`brew install pnpm` 或 `npm i -g pnpm`）
- **后端已运行** 于 `:8080`（见 `../backend/README.md`）

### 开发模式
```bash
cd /Users/mac/sub/ai-relay/frontend-web
pnpm install            # 首次或依赖变化时
pnpm dev                # 监听 http://localhost:8000
```

> 开发时 `.umirc.ts` 中 `proxy` 把 `/api` 与 `/v1` 转发到后端 `:8080`，无需 CORS 配置。
> 后端默认 `:8080`；如改了端口，编辑 `.umirc.ts` 的 `proxy.target`。

### 生产构建
```bash
pnpm build              # 输出到 dist/
pnpm preview            # 本地预览构建产物
```

### Docker 镜像
```bash
docker build -t ai-relay-web:latest .
docker run -d -p 8000:80 ai-relay-web:latest
```

## 🧯 常见问题

| 症状 | 原因 | 解决 |
|------|------|------|
| `pnpm: command not found` | 没装 pnpm | `npm i -g pnpm` 或 `brew install pnpm` |
| 页面报 502 / 404 调用后端失败 | 后端未启动 | 启动后端 `:8080`；或检查 `.umirc.ts` proxy.target |
| 控制台 `Failed to fetch /api/v1/...` | 后端 CORS 或鉴权未通过 | 看后端日志；检查 localStorage 的 `token` 是否存在 |
| 修改 `.umirc.ts` 不生效 | dev server 未重启 | `Ctrl+C` 后 `pnpm dev` 再起 |

## 🧭 页面地图

**公开区（无需登录）**
| 路径 | 说明 |
|------|------|
| `/` | 落地页：Hero + 特性 + 定价入口 |
| `/pricing` | 模型价目（拉取 `/api/v1/system/models`） |
| `/docs` | 快速上手文档：curl / Python / Node |
| `/auth/login`、`/auth/register` | 登录 / 注册 |

**控制台（登录后）**
| 路径 | 说明 |
|------|------|
| `/console/dashboard` | 余额 / Quota / 汇率 |
| `/console/tokens` | API Key 管理 |
| `/console/logs` | 使用日志 |
| `/console/billing/recharge` | 充值 + 兑换码 |
| `/console/billing/records` | 账单流水 |
| `/console/playground` | 调试（占位） |
| `/console/settings` | 个人设置 |

## 🗂️ 目录

```
frontend-web/
├── config/                 # Umi 配置（或 .umirc.ts）
├── src/
│   ├── pages/              # 约定式路由
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── tokens/
│   │   ├── logs/
│   │   ├── billing/
│   │   ├── playground/
│   │   └── settings/
│   ├── components/
│   ├── layouts/
│   ├── models/             # Umi Model（全局状态）
│   ├── services/           # API 封装 + 类型
│   │   ├── api.ts
│   │   └── typings.d.ts
│   ├── hooks/
│   ├── utils/
│   ├── access.ts           # 权限
│   └── app.tsx             # 运行时配置
├── mock/
├── .umirc.ts
├── tsconfig.json
├── package.json
└── docs/
```

## 📚 文档
- [开发指南](./docs/development.md)
- [页面地图](./docs/pages.md)
- [状态管理](./docs/state.md)

