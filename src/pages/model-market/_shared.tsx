import {
  AudioOutlined,
  FileTextOutlined,
  NumberOutlined,
  PictureOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  ModalForm,
  ProFormDatePicker,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
} from '@ant-design/pro-components';
import { history, useIntl, useModel } from '@umijs/max';
import { Modal, Space, Tag, Tooltip, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import AuthModal from '@/components/AuthModal';
import { tokenApi } from '@/services/api';
import { t } from '@/utils/i18n';

const { Paragraph } = Typography;

export const providerLabel: Record<string, string> = {
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
  dashscope: t('modelMarket.shared.providerDashscope'),
  xiaomi: t('modelMarket.shared.providerXiaomi'),
  grok: 'Grok',
  doubao: 'Doubao',
  kling: 'Kling',
  vidu: 'Vidu',
  llama: 'Llama',
  custom: t('modelMarket.shared.providerCustom'),
};

export const typeLabel: Record<string, { text: string; icon: React.ReactNode }> =
  {
    chat: { text: t('modelMarket.shared.typeChat'), icon: <FileTextOutlined /> },
    image: {
      text: t('modelMarket.shared.typeImage'),
      icon: <PictureOutlined />,
    },
    video: {
      text: t('modelMarket.shared.typeVideo'),
      icon: <VideoCameraOutlined />,
    },
    embedding: {
      text: t('modelMarket.shared.typeEmbedding'),
      icon: <NumberOutlined />,
    },
    audio: { text: t('modelMarket.shared.typeAudio'), icon: <AudioOutlined /> },
    // 045 seed 的语音模型用了细分 type(audio.transcribe / audio.speech),
    // 不在表里会兜底显示原始英文串,这里补中文标签(筛选 chip + 卡片右上角都用同一份)。
    'audio.transcribe': {
      text: t('modelMarket.shared.typeAudioTranscribe'),
      icon: <AudioOutlined />,
    },
    'audio.speech': {
      text: t('modelMarket.shared.typeAudioSpeech'),
      icon: <SoundOutlined />,
    },
    'audio.speech.clone': {
      text: t('modelMarket.shared.typeAudioSpeechClone'),
      icon: <AudioOutlined />,
    },
    'audio.realtime': {
      text: t('modelMarket.shared.typeAudioRealtime'),
      icon: <AudioOutlined />,
    },
    rerank: {
      text: t('modelMarket.shared.typeRerank'),
      icon: <ThunderboltOutlined />,
    },
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

const LOBEHUB_ICON_BASE = 'https://unpkg.com/@lobehub/icons-static-svg@1/icons';

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

export const ProviderLogo: React.FC<{ provider: string; size: number }> = ({
  provider,
  size,
}) => {
  const slug = providerIconSlug[provider];
  const localIcon = providerLocalIcon[provider];
  const [broken, setBroken] = useState(false);
  const src = !broken && slug ? `${LOBEHUB_ICON_BASE}/${slug}.svg` : localIcon;
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
export const fmtCtx = (n?: number) => {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
};

// 把价格字符串简化:去掉多余 0
export const fmtPrice = (s: string) => {
  const n = Number(s);
  if (!isFinite(n)) return `$${s}`;
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
};

// featuredPrice —— 给卡片算「代表价 + 正确单位」。
// 视频/图片等媒体模型按 per_second / per_image 计费,legacy 的 input_price=0,
// 直接显示 "$0 / M in" 会让人误以为免费。这里读结构化 pricing(后端 /api/v1/models
// 已下发 pricing JSONB),按 mode 取代表价并给出对应单位:
//   per_token  → input_per_1m(或首档 tier) / M in
//   per_second → default_price→最小 variant→unit_price / sec
//   per_image  → 同上 / image …… 其余 mode 类推
// pricing 缺失或无 mode(纯 legacy token 模型)时回退到 input_price / M in。
type PricingCfg = {
  mode?: string;
  input_per_1m?: number | string;
  unit_price?: number | string;
  default_price?: number | string;
  variants?: { price?: number | string }[];
  tiers?: { input_per_1m?: number | string }[];
};

const PRICING_UNIT: Record<string, string> = {
  per_token: ' / M in',
  per_second: ' / sec',
  per_image: ' / image',
  per_video: ' / video',
  per_minute: ' / min',
  per_hour: ' / hour',
  per_page: ' / page',
  per_request: ' / req',
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

// 按量计费(per_second/per_image/...)的代表价:优先 default_price,
// 否则取最小的 variant 价(「起步价」),再否则 unit_price。
const repUnitPrice = (pc: PricingCfg): number => {
  if (toNum(pc.default_price) > 0) return toNum(pc.default_price);
  const variantPrices = (pc.variants ?? [])
    .map((v) => toNum(v.price))
    .filter((n) => n > 0);
  if (variantPrices.length) return Math.min(...variantPrices);
  return toNum(pc.unit_price);
};

export const featuredPrice = (
  m: API.PublicModel,
): { text: string; unit: string } => {
  const pc = (m as { pricing?: PricingCfg }).pricing;
  const mode = pc?.mode;
  if (pc && mode && PRICING_UNIT[mode]) {
    let value: number;
    if (mode === 'per_token') {
      value = toNum(pc.input_per_1m);
      if (value === 0 && pc.tiers?.length) value = toNum(pc.tiers[0].input_per_1m);
    } else {
      value = repUnitPrice(pc);
    }
    return { text: fmtPrice(String(value)), unit: PRICING_UNIT[mode] };
  }
  // 纯 legacy token 模型:沿用 input_price / M in
  return { text: fmtPrice(m.input_price), unit: ' / M in' };
};

// useQuickKey —— 把首页 / 模型广场共用的"选模型直出 Key"流程收进一个 hook。
// 调用方拿到 handleGenerate(点卡片上的"生成 Key")和 modals(挂到页面末尾的弹窗)即可。
//
// "极简生成 Key" 流程:不弹表单填名字/有效期/额度,直接用模型名做 Key 名、
// 不限额度、无有效期,拿到 key 后弹结果框让用户复制。
//
// 仍保留了详细 ModalForm(formOpen 状态 + JSX),当前没有入口触发 formOpen=true,
// 详细表单实际不会显示 —— 留着是为了产品后续想把"名称/有效期/额度"加回来时直接复用。
export function useQuickKey() {
  const intl = useIntl();
  const { initialState } = useModel('@@initialState');
  const user = initialState?.currentUser;
  const [pickedModel, setPickedModel] = useState<API.PublicModel | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  const copyId = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      message.success(intl.formatMessage({ id: 'modelMarket.shared.copied' }, { name }));
    } catch {
      message.error(intl.formatMessage({ id: 'modelMarket.shared.copyFailed' }));
    }
  };

  const quickCreateKey = async (row: API.PublicModel) => {
    const hide = message.loading(
      intl.formatMessage({ id: 'modelMarket.shared.generatingKey' }),
      0,
    );
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
          title: intl.formatMessage({ id: 'modelMarket.shared.keyCreatedTitle' }),
          width: 560,
          content: (
            <div>
              <div style={{ marginBottom: 10, color: '#555' }}>
                {intl.formatMessage({ id: 'modelMarket.shared.keyCreatedPrefix' })}{' '}
                <Tooltip
                  title={intl.formatMessage({
                    id: 'modelMarket.shared.clickCopyModelId',
                  })}
                >
                  <Tag
                    color="blue"
                    style={{ cursor: 'pointer' }}
                    onClick={() => copyId(row.name)}
                  >
                    {row.name}
                  </Tag>
                </Tooltip>{' '}
                {intl.formatMessage({ id: 'modelMarket.shared.keyCreatedSuffix' })}
              </div>
              <Paragraph copyable code style={{ marginBottom: 8 }}>
                {res.data.key}
              </Paragraph>
              <div style={{ color: '#888', fontSize: 12 }}>
                {intl.formatMessage({ id: 'modelMarket.shared.keyCreatedHint' })}
              </div>
            </div>
          ),
        });
      } else {
        message.error(
          (res as any)?.message ||
            intl.formatMessage({ id: 'modelMarket.shared.createFailed' }),
        );
      }
    } catch (e: any) {
      hide();
      message.error(
        e?.message ||
          intl.formatMessage({ id: 'modelMarket.shared.createFailed' }),
      );
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

  const modals = (
    <>
      {/* 生成 Key · 详细表单(保留版)—— 当前走 quickCreateKey 极简流程,formOpen 不会置 true,所以不显示 */}
      <ModalForm
        title={
          pickedModel
            ? `${intl.formatMessage({
                id: 'modelMarket.shared.generateKey',
              })} · ${pickedModel.display_name || pickedModel.name}`
            : intl.formatMessage({ id: 'modelMarket.shared.generateKey' })
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
              title: intl.formatMessage({
                id: 'modelMarket.shared.keyCreatedTitle',
              }),
              width: 560,
              content: (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    {intl.formatMessage({
                      id: 'modelMarket.shared.keySaveHint',
                    })}
                  </div>
                  <Paragraph copyable code>
                    {res.data.key}
                  </Paragraph>
                  <div style={{ color: '#666', fontSize: 13, marginTop: 8 }}>
                    {intl.formatMessage({
                      id: 'modelMarket.shared.keyScopePrefix',
                    })}{' '}
                    <Tooltip
                      title={intl.formatMessage({
                        id: 'modelMarket.shared.clickCopyModelId',
                      })}
                    >
                      <Tag
                        style={{ cursor: 'pointer' }}
                        onClick={() => copyId(pickedModel.name)}
                      >
                        {pickedModel.name}
                      </Tag>
                    </Tooltip>
                    {intl.formatMessage({
                      id: 'modelMarket.shared.keyScopeSuffix',
                    })}
                  </div>
                </div>
              ),
            });
            return true;
          }
          message.error(
            (res as any)?.message ||
              intl.formatMessage({ id: 'modelMarket.shared.createFailed' }),
          );
          return false;
        }}
      >
        <Space size={4} wrap style={{ marginBottom: 12 }}>
          <span style={{ color: '#666' }}>
            {intl.formatMessage({ id: 'modelMarket.shared.willGenerateKey' })}
          </span>
          {pickedModel && (
            <Tooltip
              title={intl.formatMessage({
                id: 'modelMarket.shared.clickCopyModelId',
              })}
            >
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
          label={intl.formatMessage({ id: 'modelMarket.shared.nameLabel' })}
          placeholder={intl.formatMessage({
            id: 'modelMarket.shared.namePlaceholder',
          })}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          label={intl.formatMessage({
            id: 'modelMarket.shared.limitModelLabel',
          })}
          fieldProps={{
            value: pickedModel ? [pickedModel.name] : [],
            mode: 'multiple',
            disabled: true,
          }}
        />
        <ProFormDatePicker
          name="expires_at"
          label={intl.formatMessage({ id: 'modelMarket.shared.expiresLabel' })}
          fieldProps={{ showTime: true, style: { width: '100%' } }}
        />
        <ProFormSwitch
          name="unlimited_quota"
          label={intl.formatMessage({
            id: 'modelMarket.shared.unlimitedQuotaLabel',
          })}
        />
        <ProFormDigit
          name="quota_limit"
          label={intl.formatMessage({ id: 'modelMarket.shared.quotaLimitLabel' })}
          min={0}
        />
      </ModalForm>

      {/* 未登录用户点"生成 Key"时弹出,登录/注册成功后直接把之前选中的模型带入生成 Key 流程 */}
      <AuthModal
        open={authOpen}
        defaultTab={authTab}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          if (pickedModel) {
            quickCreateKey(pickedModel);
          } else {
            history.push('/console/dashboard');
          }
        }}
      />
    </>
  );

  return { handleGenerate, copyId, modals };
}
