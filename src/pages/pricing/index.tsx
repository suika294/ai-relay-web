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
import { history, useModel } from '@umijs/max';
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
  dashscope: '阿里通义千问',
  xiaomi: '小米 MiMo',
  grok: 'Grok',
  doubao: 'Doubao',
  kling: 'Kling',
  vidu: 'Vidu',
  llama: 'Llama',
  custom: 'Custom',
};

const typeMeta: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  chat: { label: '对话大模型', icon: <FileTextOutlined />, tone: 'blue' },
  image: { label: '文生图', icon: <PictureOutlined />, tone: 'indigo' },
  video: { label: 'AI 视频', icon: <VideoCameraOutlined />, tone: 'amber' },
  audio: { label: '语音合成', icon: <AudioOutlined />, tone: 'green' },
  embedding: { label: '向量模型', icon: <BookOutlined />, tone: 'purple' },
  rerank: { label: '重排序', icon: <ThunderboltOutlined />, tone: 'orange' },
};

const featuredTags: Record<string, { label: string; tone: string }> = {
  recommended: { label: '热门', tone: 'red' },
  new: { label: '高速', tone: 'emerald' },
  free: { label: '免费', tone: 'green' },
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
      message.success(`已复制:${name}`);
    } catch {
      message.error('复制失败,请手动复制');
    }
  };

  const renderTag = (tag: string) => {
    const preset = featuredTags[tag];
    if (!preset) return null;
    return (
      <span key={tag} className={`market-tag market-tag--${preset.tone}`}>
        {preset.label}
      </span>
    );
  };

  return (
    <div className="model-market-page">
      <header className="market-hero">
        <Title level={1}>模型广场</Title>
        <Paragraph>
          发现并无缝集成顶尖 AI 模型，连接您的工作流。
        </Paragraph>
      </header>

      <section className="market-filter-panel">
        <Input
          className="market-search"
          size="large"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索模型 (例如 GPT-4, Claude)..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <div className="market-chip-scroll">
          <button
            className={`market-filter-chip ${typeFilter === '__all__' ? 'is-active' : ''}`}
            onClick={() => setTypeFilter('__all__')}
            type="button"
          >
            全部模型
          </button>
          {typeOptions.map((type) => (
            <button
              key={type}
              className={`market-filter-chip ${typeFilter === type ? 'is-active' : ''}`}
              onClick={() => setTypeFilter(type)}
              type="button"
            >
              {typeMeta[type]?.label ?? type}
            </button>
          ))}
        </div>

        <button className="market-sort-button" type="button">
          排序方式
          <DownOutlined />
        </button>
      </section>

      <Spin spinning={loading}>
        {visibleModels.length > 0 ? (
          <section className="market-grid">
            {visibleModels.map((m) => {
              const meta = typeMeta[m.type] ?? {
                label: m.type || '模型',
                icon: <ThunderboltOutlined />,
                tone: 'gray',
              };
              const provider = providerLabel[m.provider_type] ?? m.provider_type;
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
                      aria-label="收藏模型"
                    >
                      <StarOutlined />
                    </button>
                  </div>

                  <div className="market-tags">
                    {(m.tags ?? []).map(renderTag)}
                    <span className={`market-tag market-tag--${meta.tone}`}>
                      {meta.label}
                    </span>
                  </div>

                  <p className="market-card-desc">
                    {provider} 模型，支持通过 OpenAI 兼容接口接入，适用于生产工作流与快速原型验证。
                  </p>

                  <div className="market-metrics">
                    <div>
                      <span>最大上下文</span>
                      <strong>{fmtCtx(m.max_tokens)}</strong>
                    </div>
                    <div>
                      <span>计费单价 (百万输入/输出)</span>
                      <strong>
                        {fmtMoney(m.input_price)} / {fmtMoney(m.output_price)}
                      </strong>
                    </div>
                  </div>

                  <div className="market-card-actions">
                    <Button type="primary" onClick={handleUse}>
                      立即使用
                    </Button>
                    <Button onClick={() => copyModelName(m.name)}>
                      详情
                    </Button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <Empty
            className="market-empty"
            description={loading ? '正在加载模型...' : '暂无匹配模型'}
          />
        )}
      </Spin>

      {filtered.length > visibleCount && (
        <div className="market-load-more">
          <Button
            size="large"
            onClick={() => setVisibleCount((n) => n + 9)}
          >
            加载更多模型
          </Button>
        </div>
      )}
    </div>
  );
}
