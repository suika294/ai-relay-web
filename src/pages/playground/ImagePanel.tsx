import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HistoryOutlined,
  LoadingOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Image,
  Input,
  message,
  Select,
  Space,
  Spin,
  Tag,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import { useIntl } from '@umijs/max';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/utils/i18n';
import { systemApi } from '@/services/api';
import { browserDownloadName } from '@/utils/media';
import { apiURL } from '@/utils/request';
import MediaHistoryDrawer from './MediaHistoryDrawer';
import ApiKeyField from './ApiKeyField';
import SceneViewer from './SceneViewer';
import { usePlaygroundApiKey } from './apiKeyStore';
import { playgroundUpload } from './upload';

const { TextArea } = Input;
const LS_LAST_TASK = 'playground_image_last_task_v1';

// 错误响应里挖 message:
//   1) JSON {error:{message}} / {message} → 直接用
//   2) Nginx/反代返回 HTML 504/502 → 解析 <title>/<h1> 拼友好文案,而不是吐 4KB padding
//   3) 兜底 raw 截到 4000 字符(老逻辑 500 太短,Nginx 错误页结尾必被吃成 ...)
function extractErrMsg(raw: string, httpStatus: number): string {
  if (!raw) return `HTTP ${httpStatus}`;
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    return friendlyImageError(parseHTMLError(trimmed, httpStatus));
  }
  let msg = '';
  try {
    const j = JSON.parse(trimmed);
    msg = j?.error?.message || j?.message || trimmed.slice(0, 4000);
  } catch {
    msg = trimmed.slice(0, 4000);
  }
  return friendlyImageError(msg);
}

function parseHTMLError(html: string, httpStatus: number): string {
  // <title>504 Gateway Time-out</title> / <h1>504 Gateway Time-out</h1>
  const title = /<title>([^<]+)<\/title>/i.exec(html)?.[1]?.trim();
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)?.[1]?.trim();
  const headline = title || h1 || `HTTP ${httpStatus}`;
  if (/504|gateway time-?out/i.test(headline)) {
    return `${headline} · ${t('playground.image.err504')}`;
  }
  if (/502|bad gateway/i.test(headline)) {
    return `${headline} · ${t('playground.image.err502')}`;
  }
  if (/503|service unavailable/i.test(headline)) {
    return `${headline} · ${t('playground.image.err503')}`;
  }
  return headline;
}

function friendlyImageError(msg: string): string {
  // OpenAI gpt-image 多参考图,某张文件被拒
  if (/invalid_image_file|Invalid image file or mode/i.test(msg)) {
    return [
      t('playground.image.errInvalidImage1'),
      t('playground.image.errInvalidImage2'),
      t('playground.image.errRaw', { msg }),
    ].join('\n\n');
  }
  // Gemini 拒绝出图(本轮 backend 已把上游 text/finishReason 拼进来)
  if (/no_image_data|response contained no image data/i.test(msg)) {
    return [
      t('playground.image.errNoImageData'),
      t('playground.image.errRaw', { msg }),
    ].join('\n\n');
  }
  if (/trying to proxy|econnrefused|econnreset|socket hang up/i.test(msg)) {
    return [
      t('playground.image.errProxy'),
      t('playground.image.errRaw', { msg }),
    ].join('\n\n');
  }
  return msg;
}

function isTransientPollError(status: number, msg: string): boolean {
  return (
    status === 0 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /trying to proxy|failed to fetch|networkerror|load failed|econnrefused|econnreset|socket hang up/i.test(
      msg,
    )
  );
}

type ImageTask = {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  created_at: number;
  completed_at?: number;
  prompt?: string;
  data?: { url?: string; revised_prompt?: string }[];
  error?: { code?: string; message: string };
};

type ReferenceImage = {
  uid: string;
  url: string;
  name: string;
  assetId?: number;
  source: 'upload' | 'url';
};

// 控件清单按模型 family 切分。识别规则要跟后端 internal/provider/image_size.go 的
// imageModelFamily 严格对齐 —— 同一个模型名两边必须落到同一族,否则前端给的合法值
// 后端会再 clamp 一次,审计日志和上游收到的不一致。
type ImageFamily =
  | 'gpt-image-2'
  | 'gpt-image-1'
  | 'dalle-3'
  | 'dalle-2'
  | 'imagen'
  | 'gemini-image'
  | 'seedream-3'
  | 'seedream-4-plus'
  | 'cogview'
  | 'unknown';

// 与后端 imageModelFamily 一一对应。识别顺序敏感:
//   - "gpt-image-2" 必须先于 "gpt-image" 判
//   - "imagen" 必须先于 "gemini"+"image" 判(否则 imagen-3 会被吃成 gemini-image)
function imageModelFamily(model?: string | null): ImageFamily {
  const m = (model || '').toLowerCase().trim();
  if (!m) return 'unknown';
  if (m.includes('gpt-image-2')) return 'gpt-image-2';
  if (m.includes('gpt-image')) return 'gpt-image-1';
  if (m.includes('dall-e-3') || m.includes('dalle-3')) return 'dalle-3';
  if (m.includes('dall-e-2') || m.includes('dalle-2')) return 'dalle-2';
  if (m.includes('imagen')) return 'imagen';
  if (m.includes('gemini') && m.includes('image')) return 'gemini-image';
  if (m.includes('seedream-3') || m.includes('seedream3')) return 'seedream-3';
  if (
    m.includes('seedream-4') ||
    m.includes('seedream4') ||
    m.includes('seedream-5') ||
    m.includes('seedream5')
  )
    return 'seedream-4-plus';
  if (m.includes('cogview')) return 'cogview';
  return 'unknown';
}

type SelectOpt = { value: string; label: string };

type ControlsConfig = {
  // size 选项;空数组表示该 family 不接 size 字段(Imagen / Gemini Image 用 aspectRatio + imageSize)
  sizeOpts: SelectOpt[];
  defaultSize?: string;
  qualityOpts?: SelectOpt[];
  defaultQuality?: string;
  aspectOpts?: SelectOpt[];
  defaultAspect?: string;
  // K 档(1K/2K/4K 或 512):走 image_size 字段,Gemini 家族专用
  imageSizeOpts?: SelectOpt[];
  defaultImageSize?: string;
  styleOpts?: SelectOpt[];
  defaultStyle?: string;
};

// Seedream 4+ 上游要求总像素 ≥ 3,686,400(= 2560×1440)。下面 7 档都在合法窗口
// 内,1920×1920 = 3,686,400 是踩着下限的方图,适合不想被纵横裁切的素材。
const seedream4PlusControls: ControlsConfig = {
  sizeOpts: [
    { value: '2048x2048', label: t('playground.image.sizeSd4_2048SquareDefault') },
    { value: '2560x1440', label: t('playground.image.sizeSd4_2560Land2K') },
    { value: '1440x2560', label: t('playground.image.sizeSd4_1440Port2K') },
    { value: '1920x1920', label: t('playground.image.sizeSd4_1920SquareMin') },
    { value: '3840x2160', label: t('playground.image.sizeSd4_3840Land4K') },
    { value: '2160x3840', label: t('playground.image.sizeSd4_2160Port4K') },
    { value: '4096x4096', label: t('playground.image.sizeSd4_4096Square4K') },
  ],
  defaultSize: '2048x2048',
};

const seedream3Controls: ControlsConfig = {
  sizeOpts: [
    { value: '512x512', label: '512 × 512' },
    { value: '1024x1024', label: t('playground.image.size1024Default') },
    { value: '2048x2048', label: '2048 × 2048' },
    { value: '1920x1080', label: t('playground.image.size1920Land') },
    { value: '1080x1920', label: t('playground.image.size1080Port') },
  ],
  defaultSize: '1024x1024',
};

const dalle3Controls: ControlsConfig = {
  sizeOpts: [
    { value: '1024x1024', label: t('playground.image.size1024Default') },
    { value: '1792x1024', label: t('playground.image.size1792Land') },
    { value: '1024x1792', label: t('playground.image.size1792Port') },
  ],
  defaultSize: '1024x1024',
  qualityOpts: [
    { value: 'standard', label: t('playground.image.qualityStandard') },
    { value: 'hd', label: t('playground.image.qualityHd') },
  ],
  styleOpts: [
    { value: 'vivid', label: t('playground.image.styleVivid') },
    { value: 'natural', label: t('playground.image.styleNatural') },
  ],
};

const dalle2Controls: ControlsConfig = {
  sizeOpts: [
    { value: '256x256', label: '256 × 256' },
    { value: '512x512', label: '512 × 512' },
    { value: '1024x1024', label: t('playground.image.size1024Default') },
  ],
  defaultSize: '1024x1024',
};

const gptImage1Controls: ControlsConfig = {
  sizeOpts: [
    { value: '1024x1024', label: t('playground.image.size1024Default') },
    { value: '1536x1024', label: t('playground.image.size1536Land') },
    { value: '1024x1536', label: t('playground.image.size1536Port') },
    { value: 'auto', label: t('playground.image.sizeAuto') },
  ],
  defaultSize: '1024x1024',
  qualityOpts: [
    { value: 'auto', label: t('playground.image.qualityAuto') },
    { value: 'low', label: t('playground.image.qualityLow') },
    { value: 'medium', label: t('playground.image.qualityMedium') },
    { value: 'high', label: t('playground.image.qualityHigh') },
  ],
};

// gpt-image-2 接受任意满足约束的 WxH。这里挑常见 1K/2K/4K 预设,后端 clamp 会处理边界。
const gptImage2Controls: ControlsConfig = {
  sizeOpts: [
    { value: '1024x1024', label: t('playground.image.size1024Default') },
    { value: '2048x2048', label: t('playground.image.size2048Square2K') },
    { value: '2048x1152', label: t('playground.image.size2048Land2K') },
    { value: '1152x2048', label: t('playground.image.size2048Port2K') },
    { value: '3840x2160', label: t('playground.image.size3840Land4K') },
    { value: '2160x3840', label: t('playground.image.size3840Port4K') },
    { value: 'auto', label: t('playground.image.sizeAuto') },
  ],
  defaultSize: '1024x1024',
  defaultQuality: 'medium',
  qualityOpts: [
    { value: 'auto', label: t('playground.image.qualityAuto') },
    { value: 'low', label: t('playground.image.qualityLow') },
    { value: 'medium', label: t('playground.image.qualityMedium') },
    { value: 'high', label: t('playground.image.qualityHigh') },
  ],
};

const imagenControls: ControlsConfig = {
  sizeOpts: [], // Imagen 不接 size,用 aspectRatio + imageSize 组合
  aspectOpts: [
    { value: '1:1', label: t('playground.image.aspect11Square') },
    { value: '4:3', label: t('playground.image.aspect43Land') },
    { value: '3:4', label: t('playground.image.aspect34Port') },
    { value: '16:9', label: t('playground.image.aspect169WideLand') },
    { value: '9:16', label: t('playground.image.aspect916WidePort') },
  ],
  defaultAspect: '1:1',
  imageSizeOpts: [
    { value: '1K', label: t('playground.image.tier1KDefault') },
    { value: '2K', label: '2K' },
  ],
  defaultImageSize: '1K',
};

const geminiImageControls: ControlsConfig = {
  sizeOpts: [],
  aspectOpts: [
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
    { value: '2:3', label: '2:3' },
    { value: '3:2', label: '3:2' },
    { value: '4:5', label: '4:5' },
    { value: '5:4', label: '5:4' },
    { value: '21:9', label: '21:9' },
  ],
  defaultAspect: '1:1',
  imageSizeOpts: [
    { value: '512', label: '512' },
    { value: '1K', label: t('playground.image.tier1KDefault') },
    { value: '2K', label: '2K' },
    { value: '4K', label: '4K' },
  ],
  defaultImageSize: '1K',
};

const cogviewControls: ControlsConfig = {
  sizeOpts: [
    { value: '512x512', label: '512 × 512' },
    { value: '1024x1024', label: t('playground.image.size1024Default') },
    { value: '2048x2048', label: '2048 × 2048' },
    { value: '1440x720', label: '1440 × 720' },
    { value: '720x1440', label: '720 × 1440' },
  ],
  defaultSize: '1024x1024',
};

// 未识别族 —— 保留旧默认值,后端归一化兜底
const unknownControls: ControlsConfig = {
  sizeOpts: [
    { value: '512x512', label: '512 × 512' },
    { value: '1024x1024', label: '1024 × 1024' },
    { value: '1024x1792', label: t('playground.image.size1792Port') },
    { value: '1792x1024', label: t('playground.image.size1792Land') },
  ],
  defaultSize: '1024x1024',
};

const CONTROLS_BY_FAMILY: Record<ImageFamily, ControlsConfig> = {
  'gpt-image-2': gptImage2Controls,
  'gpt-image-1': gptImage1Controls,
  'dalle-3': dalle3Controls,
  'dalle-2': dalle2Controls,
  'imagen': imagenControls,
  'gemini-image': geminiImageControls,
  'seedream-3': seedream3Controls,
  'seedream-4-plus': seedream4PlusControls,
  'cogview': cogviewControls,
  'unknown': unknownControls,
};

// 跟后端 imageRefMaxBytes 对齐(25MB)。上传前本地先拦一次,省一次往返。
const IMAGE_REF_MAX_BYTES = 25 * 1024 * 1024;

// probeUploadedImage 用浏览器自己的解码器验证文件:
//   1. 类型是 image/*
//   2. 大小 ≤ 25MB
//   3. 真的能被 createImageBitmap / Image() 解出来(顺便拿尺寸)
// 任一失败拒绝并把错误信息给到 UI,这样比"传上去 → 30s 后上游 invalid_image_file"快得多。
async function probeUploadedImage(
  file: File,
): Promise<{ ok: true; width: number; height: number } | { ok: false; error: string }> {
  if (!file.type.startsWith('image/')) {
    return {
      ok: false,
      error: t('playground.image.probeBadMime', {
        mime: file.type || t('playground.image.unknown'),
      }),
    };
  }
  if (file.size > IMAGE_REF_MAX_BYTES) {
    return {
      ok: false,
      error: t('playground.image.probeTooLarge', {
        size: (file.size / 1024 / 1024).toFixed(1),
        max: IMAGE_REF_MAX_BYTES / 1024 / 1024,
      }),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new window.Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () =>
          reject(new Error(t('playground.image.probeDecodeFail')));
        img.src = url;
      },
    );
    if (dims.width <= 0 || dims.height <= 0) {
      return { ok: false, error: t('playground.image.probeZeroDim') };
    }
    return { ok: true, width: dims.width, height: dims.height };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function statusColor(s: string): 'default' | 'processing' | 'success' | 'error' | 'warning' {
  switch (s) {
    case 'queued':
      return 'default';
    case 'running':
      return 'processing';
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    case 'canceled':
      return 'warning';
    default:
      return 'default';
  }
}

function statusText(s: string): string {
  const m: Record<string, string> = {
    queued: t('playground.image.statusQueued'),
    running: t('playground.image.statusRunning'),
    succeeded: t('playground.image.statusSucceeded'),
    failed: t('playground.image.statusFailed'),
    canceled: t('playground.image.statusCanceled'),
  };
  return m[s] || s;
}

export default function ImagePanel() {
  const intl = useIntl();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  // 360 全景查看器加载失败时记录该 URL,回退到扁平 <Image>。
  const [panoViewerFailedURL, setPanoViewerFailedURL] = useState<string>();
  const { apiKey } = usePlaygroundApiKey();
  const [modelName, setModelName] = useState<string>();
  const [prompt, setPrompt] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [size, setSize] = useState<string | undefined>('1024x1024');
  const [quality, setQuality] = useState<string | undefined>(undefined);
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [aspectRatio, setAspectRatio] = useState<string | undefined>(undefined);
  const [imageSizeTier, setImageSizeTier] = useState<string | undefined>(undefined);
  const [n, setN] = useState(1);

  // 当前模型对应的控件配置:决定下面 size / quality / aspect / imageSize / style
  // 哪些 Select 出现、各自选项是什么。这里以 modelName 为唯一输入,纯派生。
  const controls = CONTROLS_BY_FAMILY[imageModelFamily(modelName)];

  const [submitting, setSubmitting] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<ImageTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'image' && m.enabled !== false)
        .map((m) => ({
          value: m.name,
          label: m.display_name ? `${m.display_name}` : m.name,
        }));
      setModels(list);
      if (list.length > 0) setModelName((prev) => prev ?? list[0].value);
    });

    const saved = localStorage.getItem(LS_LAST_TASK);
    if (saved) {
      try {
        const t = JSON.parse(saved) as ImageTask;
        setTask(t);
        if (t.status === 'queued' || t.status === 'running') {
          startTimer(t.created_at);
          schedulePoll(t.id, 1500);
        }
      } catch {}
    }
    return () => {
      if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (task) localStorage.setItem(LS_LAST_TASK, JSON.stringify(task));
  }, [task]);

  // 切模型时把 size / quality / aspect / imageSize / style 重置到目标 family 的默认值。
  // 用 modelName 派生 family 而不是直接订阅 controls,避免 controls 引用每次渲染都新建造成
  // effect 抖动死循环。空 family 不进来,等用户选完模型再走一次。
  useEffect(() => {
    if (!modelName) return;
    const c = CONTROLS_BY_FAMILY[imageModelFamily(modelName)];
    // size:落到当前 family 的合法选项里;若 family 不接 size(Imagen/Gemini)则清空
    if (c.sizeOpts.length === 0) {
      setSize(undefined);
    } else {
      setSize((prev) =>
        prev && c.sizeOpts.some((o) => o.value === prev) ? prev : c.defaultSize,
      );
    }
    // 其余字段:family 不支持就清空(避免把 vivid 发给 Seedream),支持但当前值不在选项里就给默认
    const reconcile = (
      value: string | undefined,
      opts: SelectOpt[] | undefined,
      def: string | undefined,
    ): string | undefined => {
      if (!opts || opts.length === 0) return undefined;
      if (value && opts.some((o) => o.value === value)) return value;
      return def;
    };
    setQuality((prev) => reconcile(prev, c.qualityOpts, c.defaultQuality));
    setStyle((prev) => reconcile(prev, c.styleOpts, c.defaultStyle));
    setAspectRatio((prev) => reconcile(prev, c.aspectOpts, c.defaultAspect));
    setImageSizeTier((prev) => reconcile(prev, c.imageSizeOpts, c.defaultImageSize));
  }, [modelName]);

  const referenceURLs = () => {
    const urls = referenceImages.map((x) => x.url).filter(Boolean);
    const manual = imageURL.trim();
    if (manual && !urls.includes(manual)) urls.push(manual);
    return urls;
  };

  const addReferenceURL = () => {
    const url = imageURL.trim();
    if (!url) return message.warning(intl.formatMessage({ id: 'playground.image.warnRefUrl' }));
    setReferenceImages((prev) => {
      if (prev.some((x) => x.url === url)) return prev;
      return [
        ...prev,
        {
          uid: `url-${Date.now()}`,
          url,
          name: intl.formatMessage({ id: 'playground.image.externalUrl' }),
          source: 'url',
        },
      ];
    });
    setImageURL('');
  };

  const removeReferenceImage = (uid: string) => {
    setReferenceImages((prev) => prev.filter((x) => x.uid !== uid));
  };

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.image.warnUploadImageFile' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploadingRef(true);
      try {
        const f = file as File;
        // 上传前的本地预检 — 拦 CMYK JPEG / 损坏文件 / 超 25MB,
        // 避免传到后端再 HEAD 一次 / 上游再报 invalid_image_file。
        const probe = await probeUploadedImage(f);
        if (!probe.ok) {
          throw new Error(
            intl.formatMessage({ id: 'playground.image.refRejected' }, { error: probe.error }),
          );
        }
        const { url, id } = await playgroundUpload(f, apiKey, {
          module: 'image',
          purpose: 'image_reference',
        });

        const item: ReferenceImage = {
          uid: `asset-${id}-${Date.now()}`,
          assetId: id,
          url,
          name: f.name || intl.formatMessage({ id: 'playground.image.refImage' }),
          source: 'upload',
        };
        setReferenceImages((prev) => {
          if (prev.some((x) => x.url === url)) return prev;
          return [...prev, item];
        });
        message.success(intl.formatMessage({ id: 'playground.image.refAdded' }));
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.image.uploadFailed' }));
        onError?.(e);
      } finally {
        setUploadingRef(false);
      }
    },
  };

  const startTimer = (createdAtSec?: number) => {
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    const baseAt = createdAtSec ? createdAtSec * 1000 : Date.now();
    setElapsedMs(Date.now() - baseAt);
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - baseAt);
    }, 200);
  };
  const stopTimer = () => {
    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const schedulePoll = (id: string, delay = 2000) => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(() => fetchOnce(id, true), delay);
  };

  const fetchOnce = async (id: string, auto = false) => {
    if (!apiKey) return;
    if (!auto) setPolling(true);
    try {
      const res = await fetch(apiURL(`/v1/images/generations/${id}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const msg = extractErrMsg(text, res.status);
        if (auto && isTransientPollError(res.status, msg)) {
          setErrMsg(intl.formatMessage({ id: 'playground.image.autoRefreshFailed' }, { msg }));
          schedulePoll(id, 3000);
          return;
        }
        setErrMsg(msg);
        return;
      }
      const t = JSON.parse(text) as ImageTask;
      setTask(t);
      setErrMsg(null);
      if (t.status === 'queued' || t.status === 'running') {
        schedulePoll(id);
      } else {
        stopTimer();
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (auto && isTransientPollError(0, msg)) {
        setErrMsg(intl.formatMessage({ id: 'playground.image.autoRefreshFailed' }, { msg }));
        schedulePoll(id, 3000);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!prompt.trim()) return message.warning(intl.formatMessage({ id: 'playground.image.warnPrompt' }));
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.image.warnModel' }));
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      // 只下发当前 family 实际支持的字段,避免把 vivid 发给 Seedream 这种情况。
      // 模型推断和后端 imageModelFamily 对齐;后端还会再 NormalizeImageRequestSize 兜一次。
      const body: any = {
        model: modelName,
        prompt: prompt.trim(),
        n,
      };
      if (size) body.size = size;
      if (quality) body.quality = quality;
      if (style) body.style = style;
      if (aspectRatio) body.aspect_ratio = aspectRatio;
      if (imageSizeTier) body.image_size = imageSizeTier;
      const refs = referenceURLs();
      if (refs.length > 0) {
        body.images = refs;
        const assetIds = refs.map((u) => referenceImages.find((x) => x.url === u)?.assetId || 0);
        if (assetIds.some((id) => id > 0)) body.image_asset_ids = assetIds;
      }

      const res = await fetch(apiURL('/v1/images/generations/async'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        setErrMsg(extractErrMsg(text, res.status));
        return;
      }
      const t = JSON.parse(text) as ImageTask;
      setTask(t);
      if (t.status === 'queued' || t.status === 'running') {
        startTimer(t.created_at);
        schedulePoll(t.id, 1500);
      } else {
        stopTimer();
      }
    } catch (e: any) {
      setErrMsg(String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!task || !apiKey) return;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    try {
      const res = await fetch(apiURL(`/v1/images/generations/${task.id}/cancel`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        setErrMsg(extractErrMsg(text, res.status));
        return;
      }
      setTask(JSON.parse(text));
      stopTimer();
    } catch (e: any) {
      setErrMsg(String(e?.message || e));
    }
  };

  const reset = () => {
    stopTimer();
    if (pollRef.current) window.clearTimeout(pollRef.current);
    setTask(null);
    setErrMsg(null);
    setElapsedMs(0);
    localStorage.removeItem(LS_LAST_TASK);
  };

  const isInFlight = task && (task.status === 'queued' || task.status === 'running');
  const elapsedText = (elapsedMs / 1000).toFixed(1) + 's';
  const finalLatency =
    task?.completed_at && task?.created_at
      ? `${task.completed_at - task.created_at}s`
      : undefined;
  const items = task?.status === 'succeeded' ? task.data || [] : [];
  // 混元 360 全景图(Hunyuan/3d_panorama):结果是等距柱状全景,用 SceneViewer 的球体模式看。
  const isPanorama = /3d_panorama|panorama|全景/i.test(modelName || '');

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 提示词 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <PictureOutlined /> {intl.formatMessage({ id: 'playground.image.title' })}
            </span>
          }
          extra={
            <Space size={10}>
              <Button
                size="small"
                type="text"
                icon={<HistoryOutlined />}
                onClick={() => setHistoryOpen(true)}
              >
                {intl.formatMessage({ id: 'playground.image.history' })}
              </Button>
              <span style={{ color: '#888', fontSize: 12 }}>
                POST /v1/images/generations/async
              </span>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.model' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.image.selectModelPlaceholder' })}
                options={models}
                value={modelName}
                onChange={setModelName}
                showSearch
                optionFilterProp="label"
                disabled={!!isInFlight || submitting}
              />
            </div>
            <ApiKeyField />
            <div style={{ display: 'flex', gap: 12 }}>
              {controls.sizeOpts.length > 0 && (
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.size' })}</div>
                  <Select
                    style={{ width: '100%' }}
                    value={size}
                    onChange={setSize}
                    options={controls.sizeOpts}
                    disabled={!!isInFlight || submitting}
                  />
                </div>
              )}
              <div style={{ width: controls.sizeOpts.length > 0 ? 120 : '100%' }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.count' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={n}
                  onChange={setN}
                  options={[1, 2, 3, 4].map((v) => ({
                    value: v,
                    label: intl.formatMessage({ id: 'playground.image.countN' }, { n: v }),
                  }))}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            </div>
            {(controls.aspectOpts || controls.imageSizeOpts) && (
              <div style={{ display: 'flex', gap: 12 }}>
                {controls.aspectOpts && (
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.aspectRatio' })}</div>
                    <Select
                      style={{ width: '100%' }}
                      value={aspectRatio}
                      onChange={setAspectRatio}
                      options={controls.aspectOpts}
                      allowClear
                      placeholder={intl.formatMessage({ id: 'playground.image.useUpstreamDefault' })}
                      disabled={!!isInFlight || submitting}
                    />
                  </div>
                )}
                {controls.imageSizeOpts && (
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.imageSizeTier' })}</div>
                    <Select
                      style={{ width: '100%' }}
                      value={imageSizeTier}
                      onChange={setImageSizeTier}
                      options={controls.imageSizeOpts}
                      allowClear
                      placeholder={intl.formatMessage({ id: 'playground.image.useUpstreamDefault' })}
                      disabled={!!isInFlight || submitting}
                    />
                  </div>
                )}
              </div>
            )}
            {(controls.qualityOpts || controls.styleOpts) && (
              <div style={{ display: 'flex', gap: 12 }}>
                {controls.qualityOpts && (
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.quality' })}</div>
                    <Select
                      style={{ width: '100%' }}
                      value={quality}
                      onChange={setQuality}
                      options={controls.qualityOpts}
                      allowClear
                      placeholder={intl.formatMessage({ id: 'playground.image.useUpstreamDefault' })}
                      disabled={!!isInFlight || submitting}
                    />
                  </div>
                )}
                {controls.styleOpts && (
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.style' })}</div>
                    <Select
                      style={{ width: '100%' }}
                      value={style}
                      onChange={setStyle}
                      options={controls.styleOpts}
                      allowClear
                      placeholder={intl.formatMessage({ id: 'playground.image.useUpstreamDefault' })}
                      disabled={!!isInFlight || submitting}
                    />
                  </div>
                )}
              </div>
            )}
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.refImageLabel' })}</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder={intl.formatMessage({ id: 'playground.image.refUrlPlaceholder' })}
                  value={imageURL}
                  onChange={(e) => setImageURL(e.target.value)}
                  allowClear
                  disabled={!!isInFlight || submitting}
                  onPressEnter={addReferenceURL}
                />
                <Button
                  icon={<PlusOutlined />}
                  onClick={addReferenceURL}
                  disabled={!!isInFlight || submitting || !imageURL.trim()}
                >
                  {intl.formatMessage({ id: 'playground.image.add' })}
                </Button>
              </Space.Compact>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Upload {...uploadProps} disabled={!!isInFlight || submitting}>
                  <Button
                    icon={<UploadOutlined />}
                    loading={uploadingRef}
                    disabled={!!isInFlight || submitting}
                  >
                    {intl.formatMessage({ id: 'playground.image.uploadRef' })}
                  </Button>
                </Upload>
                {referenceImages.length > 0 && (
                  <Tag color="blue" style={{ margin: 0 }}>
                    {intl.formatMessage({ id: 'playground.image.countImages' }, { n: referenceImages.length })}
                  </Tag>
                )}
              </div>
              {referenceImages.length > 0 && (
                <div style={referenceGridStyle}>
                  {referenceImages.map((item, idx) => (
                    <div key={item.uid} style={referenceTileStyle}>
                      <Image
                        src={item.url}
                        alt={item.name}
                        width={72}
                        height={72}
                        style={{ objectFit: 'cover', display: 'block' }}
                        preview={{ src: item.url }}
                      />
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeReferenceImage(item.uid)}
                        disabled={!!isInFlight || submitting}
                        style={referenceDeleteStyle}
                      />
                      {idx === 0 && (
                        <span style={referenceBadgeStyle}>
                          {intl.formatMessage({ id: 'playground.image.mainImage' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.image.prompt' })}</div>
              <TextArea
                placeholder={intl.formatMessage({ id: 'playground.image.promptPlaceholder' })}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoSize={{ minRows: 4, maxRows: 8 }}
                disabled={!!isInFlight || submitting}
              />
            </div>
            <Button
              type="primary"
              size="large"
              block
              icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
              onClick={submit}
              loading={submitting}
              disabled={!prompt.trim() || !modelName || !apiKey || !!isInFlight}
            >
              {submitting
                ? intl.formatMessage({ id: 'playground.image.submitting' })
                : isInFlight
                ? intl.formatMessage({ id: 'playground.image.taskInProgress' }, { elapsed: elapsedText })
                : intl.formatMessage({ id: 'playground.image.generateBtn' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.image.preview' })}</span>}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <>
                    <Button
                      size="small"
                      icon={<ReloadOutlined spin={polling} />}
                      onClick={() => fetchOnce(task.id)}
                    >
                      {intl.formatMessage({ id: 'playground.image.refresh' })}
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={cancel}
                    >
                      {intl.formatMessage({ id: 'common.cancel' })}
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.image.clear' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty
                image={<PictureOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={
                  <span style={{ color: '#999' }}>
                    {intl.formatMessage({ id: 'playground.image.emptyHint' })}
                  </span>
                }
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert
              type="error"
              showIcon
              message={intl.formatMessage({ id: 'playground.image.submitFailed' })}
              description={
                <pre style={errPreStyle}>{errMsg}</pre>
              }
              style={{ marginTop: 4 }}
            />
          )}

          {task && (
            <div>
              {/* 任务元信息 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: '#fafbfc',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 8,
                  marginBottom: 14,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <code style={{ fontSize: 12, color: '#555' }}>{task.id}</code>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {task.model}
                  </div>
                </div>
                <Tag color={statusColor(task.status) as any} style={{ margin: 0 }}>
                  {statusText(task.status)}
                </Tag>
              </div>

              {errMsg && isInFlight && (
                <Alert
                  type="warning"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.image.refreshTempFailed' })}
                  description={<pre style={errPreStyle}>{errMsg}</pre>}
                  style={{ marginBottom: 14 }}
                />
              )}

              {/* 进行中 */}
              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin
                    indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />}
                    size="large"
                  />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.image.queuedHint' })
                      : intl.formatMessage({ id: 'playground.image.generatingHint' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage(
                      { id: 'playground.image.elapsedAutoRefresh' },
                      { elapsed: <b key="e">{elapsedText}</b> },
                    )}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.image.latencyHint' })}
                  </div>
                </div>
              )}

              {/* 成功 */}
              {task.status === 'succeeded' && items.length > 0 && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 12 }}>
                    ✓ {intl.formatMessage({ id: 'playground.image.doneTitle' })}
                    {finalLatency
                      ? intl.formatMessage({ id: 'playground.image.doneLatency' }, { latency: finalLatency })
                      : ''}{' '}
                    {intl.formatMessage({ id: 'playground.image.doneCount' }, { n: items.length })}
                  </div>
                  <Space wrap size="middle" style={isPanorama ? { width: '100%' } : undefined}>
                    {items.map((it, i) => {
                      const src = it.url || '';
                      if (!src) return null;
                      const showPano = isPanorama && panoViewerFailedURL !== src;
                      return (
                        <div
                          key={i}
                          style={{
                            border: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: '#fafafa',
                            width: showPano ? '100%' : undefined,
                          }}
                        >
                          {showPano ? (
                            <SceneViewer
                              key={src}
                              url={src}
                              kind="panorama-image"
                              loadingText={intl.formatMessage({ id: 'playground.threeD.sceneLoading' })}
                              onError={() => setPanoViewerFailedURL(src)}
                            />
                          ) : (
                            <Image
                              src={src}
                              alt={`generated-${i}`}
                              style={{
                                maxWidth: 320,
                                maxHeight: 320,
                                display: 'block',
                              }}
                            />
                          )}
                          <div
                            style={{
                              padding: '6px 10px',
                              fontSize: 12,
                              color: '#666',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span>{intl.formatMessage({ id: 'playground.image.imageNo' }, { n: i + 1 })}</span>
                            <a
                              href={src}
                              download={browserDownloadName(
                                src,
                                `image-${task.id}-${i}.png`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#1677ff' }}
                            >
                              <DownloadOutlined /> {intl.formatMessage({ id: 'playground.image.download' })}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </Space>
                </div>
              )}

              {task.status === 'succeeded' && items.length === 0 && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.image.doneNoUrlTitle' })}
                  description={intl.formatMessage({ id: 'playground.image.doneNoUrlDesc' })}
                />
              )}

              {/* 失败 */}
              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={
                    <span style={{ fontWeight: 500 }}>
                      {task.error?.code ? `${task.error.code} · ` : ''}
                      {intl.formatMessage({ id: 'playground.image.generateFailed' })}
                    </span>
                  }
                  description={
                    <pre style={errPreStyle}>
                      {friendlyImageError(task.error?.message || '')}
                    </pre>
                  }
                />
              )}

              {task.status === 'canceled' && (
                <Alert
                  type="warning"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.image.taskCanceled' })}
                />
              )}

              {/* 非进行中的临时刷新报错 */}
              {errMsg && !isInFlight && (
                <Alert
                  type="error"
                  showIcon
                  closable
                  message={<pre style={errPreStyle}>{errMsg}</pre>}
                  onClose={() => setErrMsg(null)}
                  style={{ marginTop: 12 }}
                />
              )}
            </div>
          )}
        </Card>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: '10px 14px',
          background: '#fafbfc',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 8,
          fontSize: 12,
          color: '#666',
        }}
      >
        💡{' '}
        {intl.formatMessage(
          { id: 'playground.image.asyncBanner' },
          {
            asyncApi: <code key="a">/v1/images/generations/async</code>,
            taskId: <code key="t">task_id</code>,
            syncApi: <code key="s">/v1/images/generations</code>,
          },
        )}
      </div>

      <MediaHistoryDrawer
        kind="image"
        open={historyOpen}
        apiKey={apiKey}
        onClose={() => setHistoryOpen(false)}
        onReuse={(t) => {
          if (t.prompt) setPrompt(t.prompt);
          setHistoryOpen(false);
        }}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#555',
  marginBottom: 6,
  fontWeight: 500,
};

const placeholderWrap: React.CSSProperties = {
  minHeight: 280,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
};

const referenceGridStyle: React.CSSProperties = {
  marginTop: 10,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, 72px)',
  gap: 8,
};

const referenceTileStyle: React.CSSProperties = {
  position: 'relative',
  width: 72,
  height: 72,
  borderRadius: 8,
  overflow: 'hidden',
  border: '1px solid rgba(0,0,0,0.08)',
  background: '#fafafa',
};

const referenceDeleteStyle: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  width: 24,
  height: 24,
  padding: 0,
  background: 'rgba(255,255,255,0.88)',
};

const referenceBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  left: 4,
  bottom: 4,
  padding: '1px 5px',
  borderRadius: 4,
  background: 'rgba(22,119,255,0.92)',
  color: '#fff',
  fontSize: 11,
  lineHeight: '16px',
};

const errPreStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.6,
};
