import { request } from '@umijs/max';

export const authApi = {
  login: (data: { email: string; password: string }) =>
    request<API.Response<{ token: string; user: API.User }>>('/api/v1/auth/login', {
      method: 'POST',
      data,
    }),
  register: (data: { username: string; email: string; password: string; invite_code?: string }) =>
    request<API.Response<API.User>>('/api/v1/auth/register', {
      method: 'POST',
      data,
    }),
};

export const userApi = {
  profile: () => request<API.Response<API.User>>('/api/v1/user/profile'),
  updateProfile: (data: Partial<API.User>) =>
    request<API.Response>('/api/v1/user/profile', { method: 'PUT', data }),
  balance: () => request<API.Response<API.Balance>>('/api/v1/user/balance'),
  logs: (params: {
    page?: number;
    size?: number;
    model?: string;
    status?: number;
    since?: string;
    until?: string;
  }) =>
    request<API.Response<{ list: API.UsageLog[]; total: number }>>('/api/v1/user/logs', { params }),
  stats: () => request<API.Response<API.UsageStats>>('/api/v1/user/usage/stats'),
  // 自己的视频/图像任务历史。返回结构对齐 /v1/videos/generations 的 VideoTaskView,
  // 字段 id / status / created_at / completed_at / data[] / error。
  videos: (params: {
    page?: number;
    size?: number;
    status?: string;
    model?: string;
    task_id?: string;
  }) =>
    request<API.Response<{ list: API.MediaTask[]; total: number }>>('/api/v1/user/videos', {
      params,
    }),
  images: (params: {
    page?: number;
    size?: number;
    status?: string;
    model?: string;
    task_id?: string;
  }) =>
    request<API.Response<{ list: API.MediaTask[]; total: number }>>('/api/v1/user/images', {
      params,
    }),
};

export type CreateTokenBody = {
  name: string;
  quota_limit?: number;
  unlimited_quota?: boolean;
  expires_at?: string;
  allowed_models?: string[];
};

export type UpdateTokenBody = {
  name?: string;
  quota_limit?: number;
  unlimited_quota?: boolean;
  expires_at?: string | null; // 空字符串/null 清除过期
  allowed_models?: string[]; // [] 代表清空(不限)
  status?: number;
};

export const tokenApi = {
  list: () => request<API.Response<API.Token[]>>('/api/v1/tokens'),
  create: (data: CreateTokenBody) =>
    request<API.Response<API.Token>>('/api/v1/tokens', { method: 'POST', data }),
  update: (id: number, data: UpdateTokenBody) =>
    request<API.Response>(`/api/v1/tokens/${id}`, { method: 'PUT', data }),
  remove: (id: number) =>
    request<API.Response>(`/api/v1/tokens/${id}`, { method: 'DELETE' }),
};

export const billingApi = {
  createRecharge: (data: { amount: string; currency: string; method: string }) =>
    request<API.Response<{
      order_no: string;
      pay_url?: string;
      qr_code?: string;
      extra?: Record<string, string>;
      quota_amount: number;
      usd_amount: string;
      exchange_rate: string;
    }>>('/api/v1/recharge/orders', { method: 'POST', data }),
  listOrders: (params: { page?: number; size?: number }) =>
    request<API.Response<{ list: API.RechargeOrder[]; total: number }>>('/api/v1/recharge/orders', { params }),
  records: (params: { page?: number; size?: number; type?: string }) =>
    request<API.Response<{ list: API.BillingRecord[]; total: number }>>('/api/v1/billing/records', { params }),
  redeem: (code: string) =>
    request<API.Response<{ quota_amount: number }>>('/api/v1/redemption/redeem', {
      method: 'POST',
      data: { code },
    }),
};

export const systemApi = {
  info: () => request<API.Response>('/api/v1/system/info'),
  currencies: () => request<API.Response<string[]>>('/api/v1/system/currencies'),
  models: () => request<API.Response<any[]>>('/api/v1/system/models'),
};

export const bannerApi = {
  list: () => request<API.Response<API.Banner[]>>('/api/v1/system/banners'),
};

export const assetApi = {
  list: (params: { page?: number; size?: number; module?: string }) =>
    request<API.Response<{ list: API.Asset[]; total: number }>>('/api/v1/assets', {
      params,
    }),
  upload: (file: File, extra?: { module?: string; purpose?: string }) => {
    const fd = new FormData();
    fd.append('file', file);
    if (extra?.module) fd.append('module', extra.module);
    if (extra?.purpose) fd.append('purpose', extra.purpose);
    return request<API.Response<API.Asset>>('/api/v1/assets', {
      method: 'POST',
      data: fd,
      requestType: 'form',
    });
  },
  detail: (id: number) =>
    request<API.Response<{ asset: API.Asset; url: string }>>(`/api/v1/assets/${id}`),
  remove: (id: number) =>
    request<API.Response>(`/api/v1/assets/${id}`, { method: 'DELETE' }),
};
