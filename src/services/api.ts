import { request } from '@umijs/max';

// 登录响应:要么正常返回 token+user,要么返回二次验证(登录验证码)挑战。
// 调用方需检测 data.requires_code_2fa。
type LoginResult = {
  token?: string;
  refresh_token?: string;
  user?: API.User;
  requires_code_2fa?: boolean;
  temp_token?: string;
  channel?: 'email' | 'sms';
  target_masked?: string;
};

export const authApi = {
  login: (data: { email: string; password: string }) =>
    request<API.Response<LoginResult>>('/api/v1/auth/login', {
      method: 'POST',
      data,
    }),
  register: (data: {
    username: string;
    email: string;
    password: string;
    invite_code?: string;
    channel?: 'email' | 'sms';
    phone?: string;
    verify_code?: string;
  }) =>
    request<API.Response<API.User>>('/api/v1/auth/register', {
      method: 'POST',
      data,
    }),
  // 注册前发送验证码(邮箱/短信)。后端校验邮箱未占用 / 手机号格式。
  sendCode: (data: { channel: 'email' | 'sms'; email?: string; phone?: string }) =>
    request<API.Response<{ channel: string; countdown: number }>>('/api/v1/auth/send-code', {
      method: 'POST',
      data,
    }),
  // 登录二次验证:用 login 返回的 temp_token + 用户输入的验证码换取正式 token。
  loginVerifyCode: (data: { temp_token: string; code: string }) =>
    request<API.Response<{ token: string; refresh_token?: string; user: API.User }>>(
      '/api/v1/auth/login/verify-code',
      { method: 'POST', data },
    ),
  // 找回密码:发码(防枚举,始终成功)。
  forgotPassword: (data: { email: string; channel: 'email' | 'sms' }) =>
    request<API.Response<{ countdown: number }>>('/api/v1/auth/forgot-password', {
      method: 'POST',
      data,
    }),
  resetPassword: (data: {
    email: string;
    channel: 'email' | 'sms';
    code: string;
    new_password: string;
  }) =>
    request<API.Response<{ message: string }>>('/api/v1/auth/reset-password', {
      method: 'POST',
      data,
    }),
  // 登录验证码二次验证开关(用户已登录)。sms 需用户已绑定手机号。
  setLoginOtp: (data: { enabled: boolean; channel?: 'email' | 'sms' }) =>
    request<API.Response<API.User>>('/api/v1/auth/login-otp', { method: 'PUT', data }),
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
  // logsSummary 与 logs 同源筛选(model/status/since/until),返回 AdminSummary 形状。
  // 给日志页头部 SummaryBar 用,每次 ProTable request 时与 logs 并行调。
  logsSummary: (params: {
    page?: number;
    size?: number;
    model?: string;
    status?: number;
    since?: string;
    until?: string;
  }) =>
    request<API.Response<API.UsageLogSummary>>('/api/v1/user/logs/summary', { params }),
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
  // 归组:不传不改;传 number 设为该组;clear_token_group=true 解绑。
  token_group_id?: number;
  clear_token_group?: boolean;
};

export const tokenApi = {
  list: () => request<API.Response<API.Token[]>>('/api/v1/tokens'),
  create: (data: CreateTokenBody) =>
    request<API.Response<API.Token>>('/api/v1/tokens', { method: 'POST', data }),
  update: (id: number, data: UpdateTokenBody) =>
    request<API.Response>(`/api/v1/tokens/${id}`, { method: 'PUT', data }),
  remove: (id: number) =>
    request<API.Response>(`/api/v1/tokens/${id}`, { method: 'DELETE' }),
  attachGroup: (id: number, tokenGroupId: number | null) =>
    request<API.Response>(`/api/v1/tokens/${id}/attach_group`, {
      method: 'POST',
      data: { token_group_id: tokenGroupId },
    }),
};

export type CreateTokenGroupBody = {
  name: string;
  quota_limit: number; // 0 = 不限
};

export type UpdateTokenGroupBody = {
  name?: string;
  quota_limit?: number;
  status?: number;
};

export type TopupTokenGroupBody = {
  delta_quota: number; // >= 0;0 表示不加额度
  reset_used: boolean; // true = 把 quota_used 归零
};

// 用户自有 API Key 共享额度池。
// 与 admin /user_groups(管理员计费 tier:ratio/qpm/bypass_balance)完全不同 — 这里是用户侧自管。
export const tokenGroupApi = {
  list: () => request<API.Response<API.TokenGroup[]>>('/api/v1/token_groups'),
  create: (data: CreateTokenGroupBody) =>
    request<API.Response<API.TokenGroup>>('/api/v1/token_groups', { method: 'POST', data }),
  update: (id: number, data: UpdateTokenGroupBody) =>
    request<API.Response>(`/api/v1/token_groups/${id}`, { method: 'PUT', data }),
  remove: (id: number) =>
    request<API.Response>(`/api/v1/token_groups/${id}`, { method: 'DELETE' }),
  topup: (id: number, data: TopupTokenGroupBody) =>
    request<API.Response<API.TokenGroup>>(`/api/v1/token_groups/${id}/topup`, {
      method: 'POST',
      data,
    }),
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
  listOrders: (params: { page?: number; size?: number; since?: string; until?: string }) =>
    request<API.Response<{ list: API.RechargeOrder[]; total: number }>>('/api/v1/recharge/orders', { params }),
  // queryOrderStatus 主动向上游查单:已支付则即时入账,返回最新订单。二维码弹窗轮询用。
  queryOrderStatus: (orderNo: string) =>
    request<API.Response<API.RechargeOrder>>(`/api/v1/recharge/order_status/${orderNo}`),
  // ordersSummary 与 listOrders 同源时间窗,返回订单状态分布 + 已支付累计。
  ordersSummary: (params: { since?: string; until?: string }) =>
    request<API.Response<API.OrderSummary>>('/api/v1/recharge/orders/summary', { params }),
  records: (params: { page?: number; size?: number; type?: string; since?: string; until?: string }) =>
    request<API.Response<{ list: API.BillingRecord[]; total: number }>>('/api/v1/billing/records', { params }),
  // recordsSummary 与 records 同源过滤,返回 by_type 分组的笔数 + quota/usd 净变动。
  recordsSummary: (params: { type?: string; since?: string; until?: string }) =>
    request<API.Response<API.RecordsSummary>>('/api/v1/billing/records/summary', { params }),
  redeem: (code: string) =>
    request<API.Response<{ quota_amount: number }>>('/api/v1/redemption/redeem', {
      method: 'POST',
      data: { code },
    }),
};

// 发票:用户对自己「已支付且未挂在 pending/issued 发票」的订单合并申请,
// admin 审核通过后系统自动生成 PDF。详见后端 router.go /api/v1/invoices/*。
export type ApplyInvoiceBody = {
  title_type: 'personal' | 'company';
  title: string;
  tax_no?: string;
  email?: string;
  bank_name?: string;
  bank_account?: string;
  address?: string;
  phone?: string;
  remark?: string;
  order_ids: number[];
};

export const invoiceApi = {
  eligibleOrders: () =>
    request<API.Response<API.InvoiceEligibleResp>>('/api/v1/invoices/eligible_orders'),
  list: (params: { page?: number; size?: number; status?: number; since?: string; until?: string }) =>
    request<API.Response<{ list: API.Invoice[]; total: number }>>('/api/v1/invoices', { params }),
  detail: (id: number) =>
    request<API.Response<API.InvoiceDetail>>(`/api/v1/invoices/${id}`),
  apply: (data: ApplyInvoiceBody) =>
    request<API.Response<API.Invoice>>('/api/v1/invoices', { method: 'POST', data }),
  cancel: (id: number) =>
    request<API.Response>(`/api/v1/invoices/${id}/cancel`, { method: 'POST' }),
};

export const systemApi = {
  info: () => request<API.Response<API.SiteInfo>>('/api/v1/system/info'),
  currencies: () => request<API.Response<string[]>>('/api/v1/system/currencies'),
  models: () => request<API.Response<any[]>>('/api/v1/system/models'),
};

export const bannerApi = {
  list: () => request<API.Response<API.Banner[]>>('/api/v1/system/banners'),
};

export const showcaseApi = {
  list: () => request<API.Response<API.Showcase[]>>('/api/v1/system/showcases'),
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
