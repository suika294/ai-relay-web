import {
  AudioOutlined,
  BookOutlined,
  DownOutlined,
  FileTextOutlined,
  PictureOutlined,
  SearchOutlined,
  StarOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { history, useIntl, useModel } from '@umijs/max';
import { Button, Empty, Input, Spin, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useAuthModal } from '@/components/AuthModalProvider';
import PublicLayout from '@/layouts/PublicLayout';
import { systemApi } from '@/services/api';

const { Title, Paragraph } = Typography;

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
  dashscope: 'Alibaba Tongyi Qianwen',
  xiaomi: 'Xiaomi MiMo',
  grok: 'Grok',
  doubao: 'Doubao',
  kling: 'Kling',
  vidu: 'Vidu',
  llama: 'Llama',
  custom: 'Custom',
};

const typeMeta: Record<string, { labelKey: string; icon: React.ReactNode; tone: string }> = {
  chat: { labelKey: 'pricing.typeChat', icon: <FileTextOutlined />, tone: 'blue' },
  image: { labelKey: 'pricing.typeImage', icon: <PictureOutlined />, tone: 'indigo' },
  video: { labelKey: 'pricing.typeVideo', icon: <VideoCameraOutlined />, tone: 'amber' },
  audio: { labelKey: 'pricing.typeAudio', icon: <AudioOutlined />, tone: 'green' },
  embedding: { labelKey: 'pricing.typeEmbedding', icon: <BookOutlined />, tone: 'purple' },
  rerank: { labelKey: 'pricing.typeRerank', icon: <ThunderboltOutlined />, tone: 'orange' },
};

const featuredTags: Record<string, { labelKey: string; tone: string }> = {
  recommended: { labelKey: 'pricing.tagRecommended', tone: 'red' },
  new: { labelKey: 'pricing.tagFast', tone: 'emerald' },
  free: { labelKey: 'pricing.tagFree', tone: 'green' },
};

const fmtCtx = (n?: number) => {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M t`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K t`;
  return `${n} t`;
};

const fmtMoney = (v?: string) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return `$${v}`;
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
};

// 分时段定价(DeepSeek V4 起):顶层 input_price / output_price 是**高峰价**,
// 空闲价存在 pricing.schedule.off_peak 里,只在这里展示 —— 卡片主价保持展示高峰价,
// 用户实付永远 ≤ 展示价。没配 schedule 的模型完全不渲染这一行。
type PricingSchedule = {
  tz?: string;
  peak_windows?: { from?: string; to?: string }[];
  off_peak?: { input_per_1m?: number | string; output_per_1m?: number | string };
};

const offPeakInfo = (m: API.PublicModel) => {
  const sc = (m as { pricing?: { schedule?: PricingSchedule } }).pricing?.schedule;
  const off = sc?.off_peak;
  const windows = sc?.peak_windows ?? [];
  if (!off || windows.length === 0) return null;
  // off_peak 允许只覆盖部分字段,未覆盖的回落顶层价(与后端 computePerToken 一致)
  const input = off.input_per_1m ?? m.input_price;
  const output = off.output_per_1m ?? m.output_price;
  return {
    price: `${fmtMoney(String(input))} / ${fmtMoney(String(output))}`,
    windows: windows
      .filter((w) => w.from && w.to)
      .map((w) => `${w.from}-${w.to}`)
      .join('、'),
  };
};

const modelVersion = (name: string) => {
  const parts = name.split('/');
  const last = parts[parts.length - 1] || name;
  const match = last.match(/(?:^|[-_])((?:v?\d[\w.-]*|preview|latest|turbo|flash|pro))$/i);
  return match?.[1] ?? (last.length > 18 ? last.slice(0, 18) : last);
};

export default function Pricing() {
  return (
    <PublicLayout>
      <PricingContent />
    </PublicLayout>
  );
}

function PricingContent() {
  const intl = useIntl();
  const { initialState } = useModel('@@initialState');
  const { openAuthModal } = useAuthModal();
  const [list, setList] = useState<API.PublicModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('__all__');
  const [visibleCount, setVisibleCount] = useState(9);

  useEffect(() => {
    setLoading(true);
    systemApi
      .models()
      .then((res) => {
        setList((res.data as API.PublicModel[]) || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setVisibleCount(9);
  }, [keyword, typeFilter]);

  const typeOptions = useMemo(() => {
    const found = new Set(list.map((m) => m.type).filter(Boolean));
    const preferred = ['chat', 'image', 'video', 'audio'];
    const rest = Array.from(found).filter((t) => !preferred.includes(t));
    return [...preferred.filter((t) => found.has(t)), ...rest];
  }, [list]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return list.filter((m) => {
      if (typeFilter !== '__all__' && m.type !== typeFilter) return false;
      if (!kw) return true;
      const hay = `${m.name ?? ''} ${m.display_name ?? ''} ${m.provider_type ?? ''} ${
        providerLabel[m.provider_type] ?? ''
      }`.toLowerCase();
      return hay.includes(kw);
    });
  }, [list, keyword, typeFilter]);

  const visibleModels = filtered.slice(0, visibleCount);

  const handleUse = () => {
    if (initialState?.currentUser) {
      history.push('/console/tokens');
      return;
    }
    openAuthModal({
      defaultTab: 'register',
      onSuccess: () => history.push('/console/tokens'),
    });
  };

  const copyModelName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      message.success(intl.formatMessage({ id: 'pricing.copied' }, { name }));
    } catch {
      message.error(intl.formatMessage({ id: 'pricing.copyFailed' }));
    }
  };

  const renderTag = (tag: string) => {
    const preset = featuredTags[tag];
    if (!preset) return null;
    return (
      <span key={tag} className={`market-tag market-tag--${preset.tone}`}>
        {intl.formatMessage({ id: preset.labelKey })}
      </span>
    );
  };

  return (
    <div className="model-market-page">
      <header className="market-hero">
        <Title level={1}>{intl.formatMessage({ id: 'pricing.title' })}</Title>
        <Paragraph>{intl.formatMessage({ id: 'pricing.subtitle' })}</Paragraph>
      </header>

      <section className="market-filter-panel">
        <Input
          className="market-search"
          size="large"
          allowClear
          prefix={<SearchOutlined />}
          placeholder={intl.formatMessage({ id: 'pricing.searchPlaceholder' })}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <div className="market-chip-scroll">
          <button
            className={`market-filter-chip ${typeFilter === '__all__' ? 'is-active' : ''}`}
            onClick={() => setTypeFilter('__all__')}
            type="button"
          >
            {intl.formatMessage({ id: 'pricing.allModels' })}
          </button>
          {typeOptions.map((type) => (
            <button
              key={type}
              className={`market-filter-chip ${typeFilter === type ? 'is-active' : ''}`}
              onClick={() => setTypeFilter(type)}
              type="button"
            >
              {typeMeta[type] ? intl.formatMessage({ id: typeMeta[type].labelKey }) : type}
            </button>
          ))}
        </div>

        <button className="market-sort-button" type="button">
          {intl.formatMessage({ id: 'pricing.sortBy' })}
          <DownOutlined />
        </button>
      </section>

      <Spin spinning={loading}>
        {visibleModels.length > 0 ? (
          <section className="market-grid">
            {visibleModels.map((m) => {
              const meta = typeMeta[m.type] ?? {
                labelKey: '',
                icon: <ThunderboltOutlined />,
                tone: 'gray',
              };
              const metaLabel = meta.labelKey
                ? intl.formatMessage({ id: meta.labelKey })
                : m.type || intl.formatMessage({ id: 'pricing.modelFallback' });
              const provider = providerLabel[m.provider_type] ?? m.provider_type;
              const offPeak = offPeakInfo(m);
              return (
                <article className="market-card" key={m.id}>
                  <div className="market-card-head">
                    <div className="market-title-group">
                      <span className="market-model-icon">
                        {meta.icon}
                      </span>
                      <div className="market-model-title">
                        <h3>{m.display_name || m.name}</h3>
                        <button
                          type="button"
                          onClick={() => copyModelName(m.name)}
                        >
                          {modelVersion(m.name)}
                        </button>
                      </div>
                    </div>
                    <button
                      className="market-bookmark"
                      type="button"
                      aria-label={intl.formatMessage({ id: 'pricing.bookmarkAria' })}
                    >
                      <StarOutlined />
                    </button>
                  </div>

                  <div className="market-tags">
                    {(m.tags ?? []).map(renderTag)}
                    <span className={`market-tag market-tag--${meta.tone}`}>
                      {metaLabel}
                    </span>
                  </div>

                  <p className="market-card-desc">
                    {intl.formatMessage({ id: 'pricing.cardDesc' }, { provider })}
                  </p>

                  <div className="market-metrics">
                    <div>
                      <span>{intl.formatMessage({ id: 'pricing.maxContext' })}</span>
                      <strong>{fmtCtx(m.max_tokens)}</strong>
                    </div>
                    <div>
                      <span>{intl.formatMessage({ id: 'pricing.priceLabel' })}</span>
                      <strong>
                        {fmtMoney(m.input_price)} / {fmtMoney(m.output_price)}
                      </strong>
                    </div>
                    {offPeak && (
                      <div>
                        <span>{intl.formatMessage({ id: 'pricing.offPeakPrice' })}</span>
                        <strong>{offPeak.price}</strong>
                      </div>
                    )}
                  </div>

                  {offPeak && (
                    <p className="market-card-desc">
                      {intl.formatMessage(
                        { id: 'pricing.timeWindowHint' },
                        { windows: offPeak.windows },
                      )}
                    </p>
                  )}

                  <div className="market-card-actions">
                    <Button type="primary" onClick={handleUse}>
                      {intl.formatMessage({ id: 'pricing.useNow' })}
                    </Button>
                    <Button onClick={() => copyModelName(m.name)}>
                      {intl.formatMessage({ id: 'pricing.details' })}
                    </Button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <Empty
            className="market-empty"
            description={
              loading
                ? intl.formatMessage({ id: 'pricing.loadingModels' })
                : intl.formatMessage({ id: 'pricing.noMatch' })
            }
          />
        )}
      </Spin>

      {filtered.length > visibleCount && (
        <div className="market-load-more">
          <Button
            size="large"
            onClick={() => setVisibleCount((n) => n + 9)}
          >
            {intl.formatMessage({ id: 'pricing.loadMore' })}
          </Button>
        </div>
      )}
    </div>
  );
}
