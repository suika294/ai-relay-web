import {
  ThunderboltOutlined,
  PictureOutlined,
  AudioOutlined,
  NumberOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  Anthropic,
  Azure,
  DeepSeek,
  Doubao,
  Gemini,
  Kimi,
  Moonshot,
  OpenAI,
  Qwen,
  Zhipu,
} from '@lobehub/icons';
import {
  ModalForm,
  ProFormDatePicker,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
} from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import {
  Button,
  Col,
  Modal,
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
import { systemApi, tokenApi } from '@/services/api';

const { Paragraph } = Typography;

const providerLabel: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  google: 'Google',
  azure: 'Azure OpenAI',
  kimi: 'Kimi (Moonshot)',
  moonshot: 'Moonshot AI',
  deepseek: 'DeepSeek',
  glm: 'GLM (Zhipu)',
  zai: 'Z.AI',
  qwen: 'Qwen',
  dashscope: '阿里通义千问',
  grok: 'Grok',
  doubao: 'Doubao',
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

// 把 provider_type 映射到 @lobehub/icons 的 Avatar 组件;未匹配时返回 null,调用方做降级
const providerAvatar = (
  providerType: string,
  size = 36,
): React.ReactNode => {
  const key = (providerType || '').toLowerCase();
  const map: Record<string, any> = {
    openai: OpenAI,
    anthropic: Anthropic,
    gemini: Gemini,
    google: Gemini,
    azure: Azure,
    kimi: Kimi,
    'kimi-code': Kimi,
    moonshot: Moonshot,
    deepseek: DeepSeek,
    glm: Zhipu,
    'glm-code': Zhipu,
    zhipu: Zhipu,
    zai: Zhipu,
    qwen: Qwen,
    dashscope: Qwen,
    doubao: Doubao,
  };
  const Icon = map[key];
  if (!Icon) return null;
  return <Icon.Avatar size={size} />;
};

// 无品牌图标时降级为首字母彩色圆
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

  const [list, setList] = useState<API.PublicModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('__all__');
  const [providerFilter, setProviderFilter] = useState<string>('__all__');
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
    return list.filter((m) => {
      if (typeFilter !== '__all__' && m.type !== typeFilter) return false;
      if (providerFilter !== '__all__' && m.provider_type !== providerFilter)
        return false;
      return true;
    });
  }, [list, typeFilter, providerFilter]);

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
    options: { value: string; label: string }[],
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
            {opt.label}
          </Tag.CheckableTag>
        ))}
      </div>
    </div>
  );

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">
          一次接入,<span className="hero-highlight">所有主流 AI 模型</span>
        </h1>
        <p className="hero-sub">
          AI Relay 提供 OpenAI 兼容的统一 API,聚合 OpenAI / Anthropic / Gemini
          等模型;支持多币种计费、流式转发、细粒度成本控制。
        </p>
        {!user && (
          <div className="hero-cta">
            <Button
              type="primary"
              size="large"
              onClick={() => history.push('/auth/register')}
            >
              免费注册
            </Button>
            <Button size="large" onClick={() => history.push('/auth/login')}>
              已有账号,登录
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
      </section>

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
          {renderFilter(
            '类型',
            typeFilter,
            setTypeFilter,
            types.map((t) => ({
              value: t,
              label: typeLabel[t]?.text ?? t,
            })),
          )}
          {renderFilter(
            '供应商',
            providerFilter,
            setProviderFilter,
            providers.map((p) => ({
              value: p,
              label: providerLabel[p] ?? p,
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
            {filtered.map((m) => {
              const t = typeLabel[m.type];
              return (
                <Col key={m.id} xs={24} md={12} xl={12}>
                  <div className="model-card">
                    <div className="model-card-header">
                      {providerAvatar(m.provider_type, 36) ?? (
                        <div
                          className="model-icon"
                          style={{
                            background: providerInitialColor(m.provider_type),
                          }}
                        >
                          {(m.provider_type || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
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
