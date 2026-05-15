import {
  ThunderboltOutlined,
  PictureOutlined,
  AudioOutlined,
  NumberOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  ModalForm,
  ProFormDatePicker,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
} from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import {
  Button,
  Col,
  Input,
  Modal,
  Pagination,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import AuthModal from '@/components/AuthModal';
import PublicLayout from '@/layouts/PublicLayout';
import { bannerApi, systemApi, tokenApi } from '@/services/api';
import HeroCarousel from './HeroCarousel';

const { Paragraph } = Typography;

const providerLabel: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  google: 'Google',
  azure: 'Azure OpenAI',
  kimi: 'Kimi (Moonshot)',
  'kimi-code': 'Kimi Code',
  moonshot: 'Moonshot AI',
  deepseek: 'DeepSeek',
  glm: 'GLM (Zhipu)',
  'glm-code': 'GLM Code',
  zai: 'Z.AI',
  qwen: 'Qwen',
  dashscope: '阿里通义千问',
  xiaomi: '小米 MiMo',
  grok: 'Grok',
  doubao: 'Doubao',
  kling: 'Kling',
  vidu: 'Vidu',
  llama: 'Llama',
  custom: '自定义',
};

const typeLabel: Record<string, { text: string; icon: React.ReactNode }> = {
  chat: { text: '对话', icon: <FileTextOutlined /> },
  image: { text: '文生图', icon: <PictureOutlined /> },
  video: { text: '视频生成', icon: <VideoCameraOutlined /> },
  embedding: { text: '向量', icon: <NumberOutlined /> },
  audio: { text: '音频', icon: <AudioOutlined /> },
  rerank: { text: '重排序', icon: <ThunderboltOutlined /> },
};

// 厂商官方 logo:走 lobehub 的纯静态 SVG 包,通过 unpkg CDN 直接 <img> 引用,
// 不引入 npm 依赖,避开了之前 @lobehub/icons React 组件包对 React 19 `use`
// export 的依赖(在 React 18 项目里会导致生产构建失败)。
// 没有官方 logo 的 provider(xiaomi/custom 等)走下方 providerInitialColor 兜底。
const providerIconSlug: Record<string, string> = {
  openai: 'openai',
  anthropic: 'claude-color',
  gemini: 'gemini-color',
  google: 'google-color',
  azure: 'azure-color',
  deepseek: 'deepseek-color',
  glm: 'chatglm-color',
  'glm-code': 'chatglm-color',
  zai: 'chatglm-color',
  qwen: 'qwen-color',
  dashscope: 'qwen-color',
  grok: 'grok',
  doubao: 'doubao-color',
  kling: 'kling-color',
  llama: 'metaai-color',
};

// lobehub 没有官方 logo,或者官方 logo 是白色填充 (在白底 chip 上不可见,
// 比如 kimi-color) 的厂商,放在 /public/providers/ 下做品牌色 SVG 兜底。
const providerLocalIcon: Record<string, string> = {
  vidu: '/providers/vidu.svg',
  xiaomi: '/providers/xiaomi.svg',
  kimi: '/providers/kimi.svg',
  'kimi-code': '/providers/kimi.svg',
  moonshot: '/providers/kimi.svg',
};

const LOBEHUB_ICON_BASE =
  'https://unpkg.com/@lobehub/icons-static-svg@1/icons';

// 厂商首字母彩色圆,作为 logo 加载失败 / 没有官方 logo 时的兜底。
const providerInitialColor = (p: string) => {
  const palette = [
    '#4F46E5',
    '#0EA5E9',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#F97316',
  ];
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

const ProviderLogo: React.FC<{ provider: string; size: number }> = ({
  provider,
  size,
}) => {
  const slug = providerIconSlug[provider];
  const localIcon = providerLocalIcon[provider];
  const [broken, setBroken] = useState(false);
  const src = !broken && slug
    ? `${LOBEHUB_ICON_BASE}/${slug}.svg`
    : localIcon;
  if (src) {
    return (
      <img
        className="provider-logo-img"
        src={src}
        alt={provider}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="provider-logo-fallback"
      style={{
        width: size,
        height: size,
        background: providerInitialColor(provider),
        fontSize: Math.max(10, Math.round(size * 0.45)),
      }}
    >
      {(provider || '?').slice(0, 1).toUpperCase()}
    </span>
  );
};

// 把 max_tokens 数字格式化为 "128K" / "1M" 之类
const fmtCtx = (n?: number) => {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
};

// 把价格字符串简化:去掉多余 0
const fmtPrice = (s: string) => {
  const n = Number(s);
  if (!isFinite(n)) return `$${s}`;
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
};

export default function Home() {
  const { initialState } = useModel('@@initialState');
  const user = initialState?.currentUser;
  const site = useSiteInfo();

  const [list, setList] = useState<API.PublicModel[]>([]);
  const [banners, setBanners] = useState<API.Banner[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('__all__');
  const [providerFilter, setProviderFilter] = useState<string>('__all__');
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState(1);
  // 2 列 × 2 行 = 4,加上 hero + 过滤栏 + 分页条刚好一屏内,不必滚太多
  const [pageSize, setPageSize] = useState(4);
  const [pickedModel, setPickedModel] = useState<API.PublicModel | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  useEffect(() => {
    setLoading(true);
    systemApi.models().then((res) => {
      setList((res.data as API.PublicModel[]) || []);
      setLoading(false);
    });
    // banners 失败不阻塞首页 —— 拉到则展示,拉不到则右侧塌掉走单列布局
    bannerApi
      .list()
      .then((res) => {
        if (res.code === 0) setBanners((res.data as API.Banner[]) || []);
      })
      .catch(() => {});
  }, []);

  const { types, providers } = useMemo(() => {
    const t = new Set<string>();
    const p = new Set<string>();
    for (const m of list) {
      if (m.type) t.add(m.type);
      if (m.provider_type) p.add(m.provider_type);
    }
    return {
      types: Array.from(t),
      providers: Array.from(p),
    };
  }, [list]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return list.filter((m) => {
      if (typeFilter !== '__all__' && m.type !== typeFilter) return false;
      if (providerFilter !== '__all__' && m.provider_type !== providerFilter)
        return false;
      if (kw) {
        const hay = `${m.name ?? ''} ${m.display_name ?? ''} ${
          providerLabel[m.provider_type] ?? m.provider_type ?? ''
        }`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [list, typeFilter, providerFilter, keyword]);

  // 筛选/搜索变化时回到第 1 页,避免停留在已经不存在的页码上
  useEffect(() => {
    setPage(1);
  }, [typeFilter, providerFilter, keyword]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  // 推荐模型:优先取带 `recommended` 标签的;若没有则降级取带 `new` 标签;
  // 都没有时直接取列表前 4 个(后端通常按 sort 字段排过序了)。最多展示 4 张。
  const recommended = useMemo(() => {
    const tagged = list.filter((m) => m.tags?.includes('recommended'));
    if (tagged.length >= 4) return tagged.slice(0, 4);
    const news = list.filter((m) => m.tags?.includes('new'));
    const merged = [...tagged];
    for (const m of news) {
      if (merged.length >= 4) break;
      if (!merged.find((x) => x.id === m.id)) merged.push(m);
    }
    for (const m of list) {
      if (merged.length >= 4) break;
      if (!merged.find((x) => x.id === m.id)) merged.push(m);
    }
    return merged.slice(0, 4);
  }, [list]);

  // quickCreateKey —— "极简生成 Key" 流程:不再弹表单让用户填名字/有效期/额度,
  // 直接用模型名做 Key 名、不限额度、无有效期,拿到 key 后弹结果框让用户复制。
  //
  // 仍然保留了下方的详细 ModalForm 代码(formOpen 状态 + JSX),主要是为了:
  //   - 产品后续如果想把"有效期 / 额度"再加回来,不用从 git 历史里翻
  //   - 控制台 /console/tokens 页面的创建逻辑独立,那边是完整表单,不受此改动影响
  // 当前没有入口触发 formOpen=true,详细表单实际不会显示。
  const quickCreateKey = async (row: API.PublicModel) => {
    const hide = message.loading('正在生成 Key...', 0);
    try {
      const res = await tokenApi.create({
        name: row.display_name || row.name,
        allowed_models: [row.name],
        unlimited_quota: true,
        // 不传 expires_at → 永久有效;不传 quota_limit → 由 unlimited_quota 覆盖
      });
      hide();
      if (res.code === 0 && res.data) {
        Modal.success({
          title: 'Key 创建成功',
          width: 560,
          content: (
            <div>
              <div style={{ marginBottom: 10, color: '#555' }}>
                已为模型{' '}
                <Tooltip title="点击复制模型 ID">
                  <Tag
                    color="blue"
                    style={{ cursor: 'pointer' }}
                    onClick={() => copyId(row.name)}
                  >
                    {row.name}
                  </Tag>
                </Tooltip>{' '}
                生成一个不限额度、永久有效的 Key:
              </div>
              <Paragraph copyable code style={{ marginBottom: 8 }}>
                {res.data.key}
              </Paragraph>
              <div style={{ color: '#888', fontSize: 12 }}>
                请妥善保存,关闭后将不会再完整显示。可在控制台「API Key」页调整
                允许的模型范围、设置有效期或消耗上限。
              </div>
            </div>
          ),
        });
      } else {
        message.error((res as any)?.message || '创建失败');
      }
    } catch (e: any) {
      hide();
      message.error(e?.message || '创建失败');
    }
  };

  const handleGenerate = (row: API.PublicModel) => {
    // 未登录:先记住选中的模型,登录/注册成功后在 AuthModal.onSuccess 里继续走 quickCreateKey
    setPickedModel(row);
    if (!user) {
      setAuthTab('login');
      setAuthOpen(true);
      return;
    }
    quickCreateKey(row);
  };

  const copyId = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      message.success(`已复制:${name}`);
    } catch {
      message.error('复制失败,请手动选中');
    }
  };

  const renderFilter = (
    label: string,
    current: string,
    setter: (v: string) => void,
    options: { value: string; label: string; icon?: React.ReactNode }[],
  ) => (
    <div className="model-filter-row">
      <span className="model-filter-label">{label}</span>
      <div className="model-filter-chips">
        <Tag.CheckableTag
          className="model-chip"
          checked={current === '__all__'}
          onChange={() => setter('__all__')}
        >
          全部
        </Tag.CheckableTag>
        {options.map((opt) => (
          <Tag.CheckableTag
            key={opt.value}
            className="model-chip"
            checked={current === opt.value}
            onChange={() => setter(opt.value)}
          >
            {opt.icon ? (
              <span className="model-chip-inner">
                <span className="model-chip-icon">{opt.icon}</span>
                {opt.label}
              </span>
            ) : (
              opt.label
            )}
          </Tag.CheckableTag>
        ))}
      </div>
    </div>
  );

  return (
    <PublicLayout>
      {/* Hero —— 有 banner 时整块铺满背景轮播;无 banner 时退回纯文案居中。 */}
      <section
        className={
          'hero home-hero' + (banners.length > 0 ? ' home-hero--with-banner' : '')
        }
      >
        {banners.length > 0 && <HeroCarousel banners={banners} />}
        <div
          className={
            'hero-inner' +
            (banners.length === 0 ? ' hero-inner--solo' : ' hero-inner--banner')
          }
        >
          <div className="hero-left">
            <h1 className="hero-title">
              一次接入,<br />
              <span className="hero-highlight">所有主流 AI 模型</span>
            </h1>
            <p className="hero-sub">
              {site.name} 提供 OpenAI 兼容的统一 API,聚合 OpenAI / Anthropic / Gemini /
              国内厂商等模型;支持多币种计费、流式转发、细粒度成本控制。
            </p>
            {!user && (
              <div className="hero-cta">
                {site.register_enabled && (
                  <Button
                    type="primary"
                    size="large"
                    onClick={() => history.push('/auth/register')}
                  >
                    免费注册
                  </Button>
                )}
                <Button
                  size="large"
                  type={site.register_enabled ? 'default' : 'primary'}
                  onClick={() => history.push('/auth/login')}
                >
                  {site.register_enabled ? '已有账号,登录' : '登录'}
                </Button>
              </div>
            )}
            <div className="hero-badges">
              <div>
                <span className="b-num">20+</span>内置模型
              </div>
              <div>
                <span className="b-num">7+</span>主流厂商
              </div>
              <div>
                <span className="b-num">5+</span>支持币种
              </div>
              <div>
                <span className="b-num">99.9%</span>可用性目标
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 推荐模型 —— 从全部模型里挑前 4 个(带 recommended/new 标签优先),做轻量横向展示 */}
      {!loading && recommended.length > 0 && (
        <section className="featured-section">
          <div className="featured-head">
            <Typography.Title level={3} style={{ margin: 0 }}>
              推荐模型
            </Typography.Title>
            <span className="featured-sub">主流厂商旗舰,即点即用</span>
          </div>
          <Row gutter={[16, 16]}>
            {recommended.map((m) => {
              const t = typeLabel[m.type];
              return (
                <Col key={m.id} xs={24} sm={12} md={12} lg={6}>
                  <div className="featured-card" onClick={() => handleGenerate(m)}>
                    <div className="featured-card-top">
                      <div className="model-icon-wrap">
                        <ProviderLogo provider={m.provider_type} size={26} />
                      </div>
                      <div className="featured-card-titles">
                        <div className="featured-card-name">
                          {m.display_name || m.name}
                        </div>
                        <div className="featured-card-provider">
                          {providerLabel[m.provider_type] ?? m.provider_type}
                        </div>
                      </div>
                    </div>
                    <div className="featured-card-meta">
                      <span>
                        {t?.icon} {t?.text ?? m.type}
                      </span>
                      <span>{fmtCtx(m.max_tokens)} 上下文</span>
                    </div>
                    <div className="featured-card-foot">
                      <span className="featured-price">
                        {fmtPrice(m.input_price)}
                        <em> / M in</em>
                      </span>
                      <Button type="primary" size="small">
                        生成 Key
                      </Button>
                    </div>
                  </div>
                </Col>
              );
            })}
          </Row>
        </section>
      )}

      {/* 定价 + 选模型直出 Key */}
      <section id="pricing" className="pricing-page">
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          选择模型,立即生成 API Key
        </Typography.Title>
        <Paragraph type="secondary" style={{ fontSize: 15 }}>
          按 token 计费,价格跟随上游厂商。生成的 Key 默认只能调用当前所选模型,
          登录后可到控制台追加其他模型、设置有效期与消耗上限。
        </Paragraph>

        {/* 过滤栏 */}
        <div className="model-filter-bar">
          <div className="model-filter-row">
            <span className="model-filter-label">搜索</span>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="按模型名、显示名或厂商搜索,如 kimi、claude、gpt-4"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ maxWidth: 480 }}
            />
          </div>
          {renderFilter(
            '类型',
            typeFilter,
            setTypeFilter,
            types.map((t) => ({
              value: t,
              label: typeLabel[t]?.text ?? t,
              icon: typeLabel[t]?.icon,
            })),
          )}
          {renderFilter(
            '供应商',
            providerFilter,
            setProviderFilter,
            providers.map((p) => ({
              value: p,
              label: providerLabel[p] ?? p,
              icon: <ProviderLogo provider={p} size={14} />,
            })),
          )}
        </div>

        {/* 模型卡片网格 */}
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
            暂无匹配模型
          </div>
        ) : (
          <Row gutter={[20, 20]} style={{ marginTop: 8 }}>
            {paged.map((m) => {
              const t = typeLabel[m.type];
              return (
                <Col key={m.id} xs={24} md={12} xl={12}>
                  <div className="model-card">
                    <div className="model-card-header">
                      <div className="model-icon-wrap">
                        <ProviderLogo provider={m.provider_type} size={28} />
                      </div>
                      <div className="model-card-title">
                        <div className="model-card-name">
                          {m.display_name || m.name}
                          {m.tags?.includes('new') && (
                            <Tag color="cyan" style={{ marginLeft: 8 }}>
                              New
                            </Tag>
                          )}
                          {m.tags?.includes('free') && (
                            <Tag color="green" style={{ marginLeft: 4 }}>
                              免费
                            </Tag>
                          )}
                        </div>
                        <div className="model-card-sub">{m.name}</div>
                      </div>
                    </div>

                    <div className="model-card-metrics">
                      <div className="metric">
                        <div className="metric-k">输入</div>
                        <div className="metric-v">
                          {fmtPrice(m.input_price)}
                          <span className="metric-unit"> / M Tokens</span>
                        </div>
                      </div>
                      <div className="metric">
                        <div className="metric-k">输出</div>
                        <div className="metric-v">
                          {fmtPrice(m.output_price)}
                          <span className="metric-unit"> / M Tokens</span>
                        </div>
                      </div>
                      <div className="metric">
                        <div className="metric-k">上下文</div>
                        <div className="metric-v">{fmtCtx(m.max_tokens)}</div>
                      </div>
                      <div className="metric">
                        <div className="metric-k">类型</div>
                        <div className="metric-v">
                          <Space size={4}>
                            {t?.icon}
                            <span>{t?.text ?? m.type}</span>
                          </Space>
                        </div>
                      </div>
                    </div>

                    <div className="model-card-footer">
                      <span className="model-card-provider">
                        {providerLabel[m.provider_type] ?? m.provider_type}
                      </span>
                      <Button
                        type="primary"
                        onClick={() => handleGenerate(m)}
                      >
                        生成 Key
                      </Button>
                    </div>
                  </div>
                </Col>
              );
            })}
          </Row>
        )}

        {!loading && filtered.length > pageSize && (
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Pagination
              current={page}
              pageSize={pageSize}
              total={filtered.length}
              showSizeChanger
              pageSizeOptions={[4, 8, 12, 24]}
              showTotal={(total) => `共 ${total} 个模型`}
              onChange={(p, s) => {
                setPage(p);
                if (s !== pageSize) setPageSize(s);
              }}
            />
          </div>
        )}

        <Paragraph
          type="secondary"
          style={{ marginTop: 24, fontSize: 13 }}
        >
          * 实际扣费可能因渠道覆盖价或用户分组倍率而不同;注册登录后可在控制台查看你的实际倍率。
        </Paragraph>
      </section>

      {/* 生成 Key · 详细表单(保留版)
          —— 目前首页的"生成 Key"按钮走的是 quickCreateKey 极简流程,不会把 formOpen
             置 true,所以下面这段 ModalForm 是编译进来但不显示。
          —— 若后续产品想把"名称/有效期/额度"再加回首页,删掉 quickCreateKey 的调用
             改回 setFormOpen(true) 就能瞬间复用,不需要再重写字段和提交逻辑。 */}
      <ModalForm
        title={
          pickedModel
            ? `生成 Key · ${pickedModel.display_name || pickedModel.name}`
            : '生成 Key'
        }
        open={formOpen}
        width={520}
        modalProps={{
          destroyOnClose: true,
          onCancel: () => setFormOpen(false),
        }}
        initialValues={{ unlimited_quota: false, quota_limit: 0 }}
        onFinish={async (values: any) => {
          if (!pickedModel) return false;
          const res = await tokenApi.create({
            name: values.name,
            allowed_models: [pickedModel.name],
            expires_at: values.expires_at
              ? dayjs(values.expires_at).toISOString()
              : undefined,
            quota_limit: values.quota_limit ?? 0,
            unlimited_quota: values.unlimited_quota ?? false,
          });
          if (res.code === 0 && res.data) {
            setFormOpen(false);
            Modal.success({
              title: 'Key 创建成功',
              width: 560,
              content: (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    请妥善保存,关闭后将不会再完整显示:
                  </div>
                  <Paragraph copyable code>
                    {res.data.key}
                  </Paragraph>
                  <div style={{ color: '#666', fontSize: 13, marginTop: 8 }}>
                    此 Key 当前仅允许调用{' '}
                    <Tooltip title="点击复制模型 ID">
                      <Tag
                        style={{ cursor: 'pointer' }}
                        onClick={() => copyId(pickedModel.name)}
                      >
                        {pickedModel.name}
                      </Tag>
                    </Tooltip>
                    ,可在控制台"API Key"扩充模型范围。
                  </div>
                </div>
              ),
            });
            return true;
          }
          message.error((res as any)?.message || '创建失败');
          return false;
        }}
      >
        <Space size={4} wrap style={{ marginBottom: 12 }}>
          <span style={{ color: '#666' }}>将生成一个仅限调用以下模型的 Key:</span>
          {pickedModel && (
            <Tooltip title="点击复制模型 ID">
              <Tag
                color="blue"
                style={{ cursor: 'pointer' }}
                onClick={() => copyId(pickedModel.name)}
              >
                {pickedModel.name}
              </Tag>
            </Tooltip>
          )}
        </Space>
        <ProFormText
          name="name"
          label="名称"
          placeholder="例如:glm-prod / 测试用"
          rules={[{ required: true }]}
        />
        <ProFormSelect
          label="限制模型(已锁定)"
          fieldProps={{
            value: pickedModel ? [pickedModel.name] : [],
            mode: 'multiple',
            disabled: true,
          }}
        />
        <ProFormDatePicker
          name="expires_at"
          label="有效期(可选)"
          fieldProps={{ showTime: true, style: { width: '100%' } }}
        />
        <ProFormSwitch name="unlimited_quota" label="不限额度" />
        <ProFormDigit name="quota_limit" label="Quota 上限(0 = 不限)" min={0} />
      </ModalForm>

      {/* 未登录用户点"生成 Key"时弹出,登录/注册成功后直接把之前选中的模型带入生成 Key 流程 */}
      <AuthModal
        open={authOpen}
        defaultTab={authTab}
        title="登录以生成 API Key"
        description={
          pickedModel
            ? `登录后将直接为你生成 ${pickedModel.display_name || pickedModel.name} 的 Key。`
            : '登录后即可继续刚才的操作。'
        }
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          // 登录/注册完成:继续用户原来的"生成 Key"意图,直接走极简流程
          setAuthOpen(false);
          if (pickedModel) quickCreateKey(pickedModel);
        }}
      />
    </PublicLayout>
  );
}
