declare namespace API {
  interface Response<T = any> {
    code: number;
    message: string;
    data?: T;
    trace_id?: string;
  }

  interface User {
    id: number;
    username: string;
    email: string;
    display_name?: string;
    avatar?: string;
    balance_quota: number;
    preferred_currency: string;
    country_code?: string;
    locale?: string;
    group_id?: number;
    role: number;
    invite_code?: string;
    created_at?: string;
  }

  interface Token {
    id: number;
    name: string;
    key: string;
    key_prefix: string;
    status: number;
    quota_used: number;
    quota_limit: number;
    unlimited_quota: boolean;
    allowed_models?: string[] | null;
    expires_at?: string;
    last_used_at?: string;
    created_at: string;
  }

  interface PublicModel {
    id: number;
    name: string;
    display_name?: string;
    type: string;
    provider_type: string;
    input_price: string;
    output_price: string;
    max_tokens: number;
    tags?: string[] | null;
    sort?: number;
    created_at?: string;
  }

  interface UsageLog {
    id: number;
    trace_id?: string;
    model: string;
    channel_id?: number;
    channel_name: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
    quota_cost: number;
    usd_cost: string;
    display_currency: string;
    display_cost: string;
    latency_ms: number;
    first_byte_ms?: number;
    stream?: boolean;
    status: number;
    http_code?: number;
    error_code?: string;
    error_msg?: string;
    created_at: string;
  }

  interface StatsOverview {
    requests: number;
    success: number;
    failure: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    quota_cost: number;
    usd_cost: string;
  }
  interface GroupItem {
    key: string;
    requests: number;
    tokens: number;
    usd_cost: string;
  }
  interface DailyPoint {
    day: string;
    requests: number;
    tokens: number;
    usd_cost: string;
  }
  interface UsageStats {
    today: StatsOverview;
    month: StatsOverview;
    all: StatsOverview;
    by_model: GroupItem[];
    by_channel?: GroupItem[];
    daily_trend: DailyPoint[];
  }

  interface Balance {
    balance_quota: number;
    usd_amount: string;
    display_currency: string;
    display_amount: string;
    exchange_rate: string;
  }

  interface RechargeOrder {
    id: number;
    order_no: string;
    currency: string;
    amount: string;
    usd_amount: string;
    quota_amount: number;
    payment_method: string;
    status: number;
    paid_at?: string;
    created_at: string;
  }

  interface BillingRecord {
    id: number;
    type: string;
    quota_amount: number;
    usd_amount: string;
    display_currency?: string;
    display_amount?: string;
    balance_quota_before: number;
    balance_quota_after: number;
    remark?: string;
    ref_type?: string;
    ref_id?: string;
    payment_method?: string;
    created_at: string;
  }

  // MediaTask 图像/视频任务的扁平视图,后端 VideoTaskView / ImageTaskView 对齐。
  // data[] 对应最终产物:视频时 url = 视频文件,cover_url = 首帧缩略;图像时 url = 图片 URL
  // 或 b64_json 内容,取决于上游。created_at / completed_at 为 unix 秒。
  interface MediaTaskOutput {
    url?: string;
    cover_url?: string;
    b64_json?: string;
  }

  interface MediaTask {
    id: string;
    object: string;
    model: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
    created_at: number;
    completed_at?: number;
    prompt?: string;
    data?: MediaTaskOutput[];
    error?: { code?: string; message: string };
  }
}
