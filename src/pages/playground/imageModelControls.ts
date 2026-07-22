// 图像模型参数控件配置 —— 从 ImagePanel.tsx 抽出供画布 generator 节点复用。
// 识别规则严格对齐后端 internal/provider/image_size.go 的 imageModelFamily,
// 两边同一模型名必须落到同一族,否则前端给的值后端会再 clamp,审计与上游不一致。
// (本文件为画布新增,ImagePanel 保留自带一份,互不影响。)
import { t } from '@/utils/i18n';

export type SelectOpt = { value: string; label: string };

export type ImageFamily =
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

export type ControlsConfig = {
  sizeOpts: SelectOpt[];
  defaultSize?: string;
  qualityOpts?: SelectOpt[];
  defaultQuality?: string;
  aspectOpts?: SelectOpt[];
  defaultAspect?: string;
  imageSizeOpts?: SelectOpt[];
  defaultImageSize?: string;
  styleOpts?: SelectOpt[];
  defaultStyle?: string;
};

// 识别顺序敏感:gpt-image-2 先于 gpt-image;imagen 先于 gemini+image。
export function imageModelFamily(model?: string | null): ImageFamily {
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
  sizeOpts: [],
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

const unknownControls: ControlsConfig = {
  sizeOpts: [
    { value: '512x512', label: '512 × 512' },
    { value: '1024x1024', label: '1024 × 1024' },
    { value: '1024x1792', label: t('playground.image.size1792Port') },
    { value: '1792x1024', label: t('playground.image.size1792Land') },
  ],
  defaultSize: '1024x1024',
};

export const CONTROLS_BY_FAMILY: Record<ImageFamily, ControlsConfig> = {
  'gpt-image-2': gptImage2Controls,
  'gpt-image-1': gptImage1Controls,
  'dalle-3': dalle3Controls,
  'dalle-2': dalle2Controls,
  imagen: imagenControls,
  'gemini-image': geminiImageControls,
  'seedream-3': seedream3Controls,
  'seedream-4-plus': seedream4PlusControls,
  cogview: cogviewControls,
  unknown: unknownControls,
};

export function controlsForModel(model?: string | null): ControlsConfig {
  return CONTROLS_BY_FAMILY[imageModelFamily(model)];
}

// 把画布 generator 节点的参数按 family 归一到合法值,返回下发给
// /v1/images/generations(/async) 的请求体片段(不含 model/prompt/n/images)。
export function buildImageParams(model: string, p: {
  size?: string;
  quality?: string;
  style?: string;
  aspectRatio?: string;
  imageSize?: string;
}): Record<string, unknown> {
  const c = controlsForModel(model);
  const out: Record<string, unknown> = {};
  const pick = (v: string | undefined, opts: SelectOpt[] | undefined) =>
    v && opts && opts.some((o) => o.value === v) ? v : undefined;
  const size = c.sizeOpts.length ? pick(p.size, c.sizeOpts) ?? c.defaultSize : undefined;
  if (size) out.size = size;
  const quality = pick(p.quality, c.qualityOpts);
  if (quality) out.quality = quality;
  const style = pick(p.style, c.styleOpts);
  if (style) out.style = style;
  const aspect = pick(p.aspectRatio, c.aspectOpts);
  if (aspect) out.aspect_ratio = aspect;
  const imageSize = pick(p.imageSize, c.imageSizeOpts);
  if (imageSize) out.image_size = imageSize;
  return out;
}
