# 用户端开发指南

## 启动开发

```bash
pnpm install
pnpm dev
```

## 路由
- 使用 **显式路由**（在 `.umirc.ts` 的 `routes` 配置）
- 新增页面：在 `src/pages/` 下建文件夹和组件，再到 `.umirc.ts` 添加条目

## 请求
- 统一走 `src/services/api.ts` 中的封装
- Token 从 `localStorage` 读取，通过拦截器注入到 `Authorization`

## 状态
- 全局状态：`src/models/*.ts`（`useModel('xxx')` 使用）
- 当前用户：`useModel('@@initialState').initialState?.currentUser`
- 局部状态：组件内 `useState` / `useRequest`

## 权限
- `src/access.ts` 定义权限字段
- 页面/组件用 `access.isLogin` 控制可见性
- 路由级拦截可扩展 `routes` 中的 `access` 字段

## 样式
- Ant Design 主题通过 `config/theme.ts`（按需新增）
- Tailwind 可选：本项目默认只用 antd 体系

## 打包
```bash
pnpm build    # 输出到 dist/
```
