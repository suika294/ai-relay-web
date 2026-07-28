import { defineConfig } from '@umijs/max';

const apiBaseUrl =
  process.env.UMI_APP_API_BASE_URL || '';
const devProxyTarget = process.env.UMI_DEV_PROXY_TARGET || 'http://localhost:8080';

export default defineConfig({
  title: '模桥',
  define: {
    'process.env.UMI_APP_API_BASE_URL': apiBaseUrl,
  },
  antd: { dark: false },
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: '模桥 控制台',
    locale: true,
  },
  locale: {
    default: 'zh-CN',
    antd: true,
    baseNavigator: true,
  },
  npmClient: 'pnpm',
  hash: true,
  // Wrap each minified async chunk in an IIFE so esbuild's per-chunk helper
  // shims (e.g. `Eg`) don't collide across chunks — fixes the esbuildHelperChecker
  // "Found conflicts in esbuild helpers" build failure.
  esbuildMinifyIIFE: true,
  routes: [
    // ========= 公开页（不走 ProLayout） =========
    { path: '/', component: './home', layout: false },
    { path: '/landing-classic', component: './landing', layout: false },
    { path: '/models', component: './model-market', layout: false },
    { path: '/pricing', component: './model-market', layout: false },
    { path: '/pricing-classic', component: './pricing', layout: false },
    // 文档:多路由 + 侧边栏。父级 DocsLayout 用 <Outlet/> 渲染子页内容,
    // 各子页就是普通 React 组件,只关心自身的正文。
    {
      path: '/docs',
      component: '@/layouts/DocsLayout',
      layout: false,
      routes: [
        { path: '/docs', redirect: '/docs/quick-start' },
        { path: '/docs/quick-start', component: './docs/quick-start' },
        { path: '/docs/auth', component: './docs/auth' },
        { path: '/docs/sdk', component: './docs/sdk' },
        { path: '/docs/chat', component: './docs/chat' },
        { path: '/docs/streaming', component: './docs/streaming' },
        { path: '/docs/models', component: './docs/models' },
        { path: '/docs/images', component: './docs/images' },
        { path: '/docs/videos', component: './docs/videos' },
        { path: '/docs/templates', component: './docs/templates' },
        { path: '/docs/3d', component: './docs/3d' },
        { path: '/docs/digital-human', component: './docs/digital-human' },
        { path: '/docs/digital-human-live', component: './docs/digital-human-live' },
        { path: '/docs/audio', component: './docs/audio' },
        { path: '/docs/embeddings', component: './docs/embeddings' },
        { path: '/docs/vectordb', component: './docs/vectordb' },
        { path: '/docs/errors', component: './docs/errors' },
        { path: '/docs/rate-limits', component: './docs/rate-limits' },
        { path: '/docs/faq', component: './docs/faq' },
      ],
    },
    { path: '/billing', component: './billing/public-recharge', layout: false },
    // Playground:公开在线调试,挂在首页公开导航(文档中心旁),无需登录。
    // 自带 PublicLayout(组件内包裹),密钥改为手动填写,不再进控制台。
    { path: '/playground', component: './playground', layout: false },
    { path: '/canvas', component: './canvas', layout: false },
    { path: '/auth/login', component: './auth/login', layout: false },
    { path: '/auth/register', component: './auth/register', layout: false },
    { path: '/auth/forgot-password', component: './auth/forgot-password', layout: false },

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
    {
      name: 'Key 分组',
      path: '/console/token-groups',
      component: './token-groups',
      icon: 'AppstoreOutlined',
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
      name: '发票',
      path: '/console/billing/invoices',
      component: './billing/invoices',
      icon: 'FileDoneOutlined',
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
      // ws: true 让 WebSocket 升级(/v1/audio/speech/ws 流式 TTS、/v1/live/ws)也走代理到后端;
      // 缺了它 WS 握手会停在 dev server(:8000)不转发,前端表现为「连上但无任何帧」。
      ws: true,
    },
  },
});
