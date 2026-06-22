import type { RequestConfig } from '@umijs/max';
import { message } from 'antd';
import LangSwitch from '@/components/LangSwitch';
import UserMenu from '@/components/UserMenu';
import { t } from '@/utils/i18n';
import { API_BASE_URL, apiURL } from '@/utils/request';

// 站点信息的兜底默认值。后端 /system/info 不可达(网络抖动 / 启动早期)
// 时用它顶上,确保 SPA 首屏不会因为站点名为空而显示成空白标题。
const DEFAULT_SITE_INFO: API.SiteInfo = {
  name: '模桥',
  logo: '/moqiao-logo-black.png',
  register_enabled: true,
  version: '0.0.1',
  api_base: '',
};

async function fetchProfileWithTimeout(token: string, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(apiURL('/api/v1/user/profile'), {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchSiteInfoWithTimeout(ms: number): Promise<API.SiteInfo> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(apiURL('/api/v1/system/info'), { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (body?.code === 0 && body.data) {
      return { ...DEFAULT_SITE_INFO, ...body.data };
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('fetchSiteInfo skipped:', e);
  } finally {
    clearTimeout(t);
  }
  return DEFAULT_SITE_INFO;
}

/**
 * 入口预热：
 *   - 无 token：直接返回空（首屏落地页不需要登录）
 *   - 有 token：尝试拉 profile；3s 超时、401/403/业务错都当作"无效 token"清掉
 *   - 绝对不能在此 throw，否则 React 会挂起空白
 */
export async function getInitialState(): Promise<{
  currentUser?: API.User;
  siteInfo: API.SiteInfo;
  settings?: Record<string, any>;
}> {
  // 站点信息无论登不登录都要拉(决定 logo / 标题 / 注册入口可见性)。
  // 与 profile 并行,不让站点信息阻塞登录态恢复,反之亦然。
  const siteInfoPromise = fetchSiteInfoWithTimeout(3000);

  const token = localStorage.getItem('token');
  let currentUser: API.User | undefined;
  if (token) {
    try {
      const res = await fetchProfileWithTimeout(token, 3000);
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
      } else {
        const body = await res.json().catch(() => null);
        if (body?.code === 0 && body.data) {
          currentUser = body.data;
        } else {
          // 业务错误 / 用户已不存在
          localStorage.removeItem('token');
        }
      }
    } catch (e) {
      // 超时或网络错误：不清 token（避免偶发网络抖动登出）
      // eslint-disable-next-line no-console
      console.warn('getInitialState skipped:', e);
    }
  }

  const siteInfo = await siteInfoPromise;
  // 浏览器标签标题跟着站点名走,后台改名后下次刷新生效。
  if (typeof document !== 'undefined' && siteInfo.name) {
    document.title = siteInfo.name;
  }
  return { currentUser, siteInfo };
}

export const request: RequestConfig = {
  baseURL: API_BASE_URL || undefined,
  timeout: 30000,
  errorConfig: {
    errorHandler(error: any) {
      const data = error?.response?.data;
      // 兼容两种错误形态:
      //   /api/v1/* 后台接口: { code, message, trace_id }
      //   /v1/* 对外 OpenAI 风格:{ error: { message, type, code } }
      const msg =
        data?.error?.message ||
        data?.message ||
        error?.message ||
        t('common.requestFailed');
      message.error(msg);
    },
  },
  requestInterceptors: [
    (url: string, options: any) => {
      const token = localStorage.getItem('token');
      if (token) {
        options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
      }
      return { url, options };
    },
  ],
  responseInterceptors: [
    (response: any) => {
      const data = response.data;
      if (data?.code && data.code !== 0) {
        if (data.code !== 40100 && data.code !== 40300) {
          message.error(data.message || t('common.bizError'));
        }
      }
      return response;
    },
  ],
};

export const layout = ({ initialState }: any) => {
  const user = initialState?.currentUser as API.User | undefined;
  const site = (initialState?.siteInfo as API.SiteInfo | undefined) ?? DEFAULT_SITE_INFO;
  return {
    // logo 后台没配时回落到内置 SVG,避免控制台顶栏空白。
    logo: site.logo || '/moqiao-logo-black.png',
    title: site.name,
    menu: { locale: true },
    // 顶栏右上角：语言切换 + 头像名下拉菜单（返回首页 / 个人设置 / 退出登录）
    actionsRender: () => [<LangSwitch key="lang" />],
    avatarProps: {
      title: user?.display_name || user?.username || t('common.notLoggedIn'),
      size: 'small' as const,
      render: (_: any, dom: any) => <UserMenu>{dom}</UserMenu>,
    },
  };
};
