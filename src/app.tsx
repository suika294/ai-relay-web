import type { RequestConfig } from '@umijs/max';
import { message } from 'antd';
import UserMenu from '@/components/UserMenu';

async function fetchProfileWithTimeout(token: string, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch('/api/v1/user/profile', {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 入口预热：
 *   - 无 token：直接返回空（首屏落地页不需要登录）
 *   - 有 token：尝试拉 profile；3s 超时、401/403/业务错都当作"无效 token"清掉
 *   - 绝对不能在此 throw，否则 React 会挂起空白
 */
export async function getInitialState(): Promise<{
  currentUser?: API.User;
  settings?: Record<string, any>;
}> {
  const token = localStorage.getItem('token');
  if (!token) return {};
  try {
    const res = await fetchProfileWithTimeout(token, 3000);
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      return {};
    }
    const body = await res.json().catch(() => null);
    if (body?.code === 0 && body.data) return { currentUser: body.data };
    // 业务错误 / 用户已不存在
    localStorage.removeItem('token');
  } catch (e) {
    // 超时或网络错误：不清 token（避免偶发网络抖动登出）
    // eslint-disable-next-line no-console
    console.warn('getInitialState skipped:', e);
  }
  return {};
}

export const request: RequestConfig = {
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
        '请求失败';
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
          message.error(data.message || '业务错误');
        }
      }
      return response;
    },
  ],
};

export const layout = ({ initialState }: any) => {
  const user = initialState?.currentUser as API.User | undefined;
  return {
    logo: '/logo.svg',
    menu: { locale: false },
    // 顶栏右上角：头像名 + 下拉菜单（返回首页 / 个人设置 / 退出登录）
    avatarProps: {
      title: user?.display_name || user?.username || '未登录',
      size: 'small' as const,
      render: (_: any, dom: any) => <UserMenu>{dom}</UserMenu>,
    },
  };
};
