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

  interface Banner {
    id: number;
    image_url: string;
    title: string;
    subtitle: string;
    link_url: string;
    sort_order: number;
    enabled: boolean;
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

  // —— 列表页头部摘要条 SummaryBar 用 ——

  // UsageLogSummary 对齐后端 repository.AdminSummary,/api/v1/user/logs/summary 返回。
  interface UsageLogSummary {
    requests: number;
    success: number;
    failure: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    avg_latency_ms: number;
    usd_cost: string;
  }

  // OrderSummary 对齐后端 repository.OrderSummary,/api/v1/recharge/orders/summary。
  interface OrderSummary {
    total: number;
    paid: number;
    pending: number;
    refunded: number;
    canceled: number;
    failed: number;
    paid_quota: number;
    paid_usd: string;
  }

  // RecordsSummary 按 type 分组的账单流水汇总,/api/v1/billing/records/summary。
  interface RecordsSummaryItem {
    type: string;
    count: number;
    quota_total: number;
    usd_total: string;
  }
  interface RecordsSummary {
    total: number;
    by_type: RecordsSummaryItem[];
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
  // data[] 对应最终产物:视频时 url = 后端已转存的可访问视频文件,
  // cover_url = 首帧缩略;图像时 url = 图片 URL 或 b64_json 内容,取决于上游。
  // created_at / completed_at 为 unix 秒。
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

  // 站点信息(GET /system/info),启动时拉一次,驱动浏览器标题、
  // 顶栏 logo/名称、注册入口等。后端从 system_configs 读出。
  interface SiteInfo {
    name: string;
    logo: string;
    register_enabled: boolean;
    version: string;
    // 管理员在后台配置的 API base_url(留空代表"按当前域名兜底",
    // 由前端 useApiBase hook 决定最终值)。
    api_base: string;
  }

  // 我的素材
  interface Asset {
    id: number;
    owner_type: string;
    owner_id: number;
    module: string;
    source: string;
    driver: string;
    bucket: string;
    object_key: string;
    content_type?: string;
    size_bytes: number;
    etag?: string;
    filename?: string;
    public_url?: string;
    purpose?: string;
    created_at: string;
  }
}
