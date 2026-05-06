import { defineConfig } from '@umijs/max';

const apiBaseUrl =
  process.env.UMI_APP_API_BASE_URL ||
  (process.env.NODE_ENV === 'production' ? 'http://aihub.dok.top' : '');
const devProxyTarget = process.env.UMI_DEV_PROXY_TARGET || 'http://localhost:8080';

export default defineConfig({
  title: 'AI Relay',
  define: {
    'process.env.UMI_APP_API_BASE_URL': apiBaseUrl,
  },
  antd: { dark: false },
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: 'AI Relay 控制台',
    locale: true,
  },
  locale: {
    default: 'zh-CN',
    antd: true,
    baseNavigator: true,
  },
  npmClient: 'pnpm',
  hash: true,
  routes: [
    // ========= 公开页（不走 ProLayout） =========
    { path: '/', component: './home', layout: false },
    { path: '/landing-classic', component: './landing', layout: false },
    { path: '/pricing-classic', component: './pricing', layout: false },
    { path: '/docs', component: './docs', layout: false },
    { path: '/billing', component: './billing/public-recharge', layout: false },
    { path: '/auth/login', component: './auth/login', layout: false },
    { path: '/auth/register', component: './auth/register', layout: false },

    // ========= 控制台（默认 ProLayout + 登录保护） =========
    { path: '/console', redirect: '/console/dashboard' },
    {
      name: '总览',
      path: '/console/dashboard',
      component: './dashboard',
      icon: 'DashboardOutlined',
      wrappers: ['@/wrappers/auth'],
    },
    {
      name: 'API Key',
      path: '/console/tokens',
      component: './tokens',
      icon: 'KeyOutlined',
      wrappers: ['@/wrappers/auth'],
    },
    // 日志:侧边栏只剩"使用日志"一项,直接提到一级,不再套父菜单。
    // 图像历史 / 视频历史路由保留但 hideInMenu,旧收藏 / 外部链接仍能落地。
    { path: '/console/logs', redirect: '/console/logs/usage' },
    {
      name: '日志',
      path: '/console/logs/usage',
      component: './logs',
      icon: 'HistoryOutlined',
      wrappers: ['@/wrappers/auth'],
    },
    {
      name: '图像历史',
      path: '/console/logs/images',
      component: './logs/images',
      wrappers: ['@/wrappers/auth'],
      hideInMenu: true,
    },
    {
      name: '视频历史',
      path: '/console/logs/videos',
      component: './logs/videos',
      wrappers: ['@/wrappers/auth'],
      hideInMenu: true,
    },
    {
      name: '充值',
      path: '/console/billing/recharge',
      component: './billing/recharge',
      icon: 'WalletOutlined',
      wrappers: ['@/wrappers/auth'],
    },
    {
      name: '账单',
      path: '/console/billing/records',
      component: './billing/records',
      icon: 'FileTextOutlined',
      wrappers: ['@/wrappers/auth'],
    },
    {
      name: 'Playground',
      path: '/console/playground',
      component: './playground',
      icon: 'ExperimentOutlined',
      wrappers: ['@/wrappers/auth'],
    },
    {
      name: '我的素材',
      path: '/console/assets',
      component: './assets',
      icon: 'FolderOutlined',
      wrappers: ['@/wrappers/auth'],
    },
    {
      name: '个人设置',
      path: '/console/settings',
      component: './settings',
      icon: 'SettingOutlined',
      wrappers: ['@/wrappers/auth'],
    },
  ],
  proxy: {
    '/api': {
      target: devProxyTarget,
      changeOrigin: true,
    },
    '/v1': {
      target: devProxyTarget,
      changeOrigin: true,
    },
  },
});
