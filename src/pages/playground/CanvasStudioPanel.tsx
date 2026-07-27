import {
  AppstoreOutlined,
  BgColorsOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  ColumnWidthOutlined,
  ControlOutlined,
  CopyOutlined,
  CustomerServiceOutlined,
  EditOutlined,
  ExpandOutlined,
  ExperimentOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PictureOutlined,
  PlusOutlined,
  ShoppingOutlined,
  SkinOutlined,
  SmileOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  UserOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { message, Select } from 'antd';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
} from 'reactflow';
import type { Connection, Edge as RFEdge, Node as RFNode, NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { systemApi } from '@/services/api';
import { apiURL } from '@/utils/request';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';
import { buildImageParams, controlsForModel } from './imageModelControls';
import SceneViewer, { classifyThreeDFile } from './SceneViewer';
import DigitalHumanLivePanel, { type DhLiveSeed, PERSONA_PRESETS } from './DigitalHumanLivePanel';
import {
  addEmotionRange,
  buildEmotionChunks,
  chunksForSynthesis,
  decodeToBuffer,
  encodeWAV,
  mergeAudioBuffers,
  SEG_GAP_MS,
  type EmotionChunk,
  type EmotionRange,
} from './VoicePanel';
import { playgroundUpload } from './upload';
import './CanvasStudioPanel.css';

// 自研 React 画布,对齐无限画布 smart-canvas 的 composer 生成模型:
//   - 节点只有「上传(image)」「提示词(prompt)」两类(生成结果 = 新的 image 节点)。
//   - 生成参数收敛到一条跟随「选中的图片节点」浮动的 composer 生成栏(模型/参数/提示词/运行)。
//   - 选中节点自身图 + 上游 image 节点图 → 参考图;上游 prompt 节点文本 → prompt 前缀。
//   - 运行走模桥 /v1/images/generations/async(已计费)+ 轮询;空节点就地填图,已有图则右侧新建节点并连线。
// 右键用 document 捕获阶段拦截(react-flow 冒泡层会吞掉),弹卡片式新建菜单。文档存 /v1/canvas/documents。

type ModelOpt = { value: string; label: string };
type ModelInfo = { value: string; label: string; providerType?: string };
type VoiceProvider = 'tencent' | 'openai' | 'minimax' | 'dashscope' | 'kling';
type ModelsByType = Record<string, ModelInfo[]>; // 按 systemApi.models 的 type 分组
type RunInfo = { status: 'running' | 'failed'; error?: string; startedAt?: number };

// 后端 ai_models.provider_type → TTS 音色/语气 provider(对齐 VoicePanel modelProviderTypeToVoiceProvider)
function voiceProviderOf(providerType?: string): VoiceProvider {
  switch ((providerType || '').toLowerCase()) {
    case 'openai':
      return 'openai';
    case 'minimax':
      return 'minimax';
    case 'dashscope_speech':
      return 'dashscope';
    case 'kling':
      return 'kling';
    default:
      return 'tencent';
  }
}

// 视频 / 音频参数选项(通用常用值;后端会按模型再校验)
const VIDEO_PARAMS = [
  { icon: <ClockCircleOutlined />, label: '时长', field: 'duration', opts: [
    { value: '3', label: '3s' }, { value: '5', label: '5s' }, { value: '8', label: '8s' }, { value: '10', label: '10s' },
  ], def: '5' },
  { icon: <ExpandOutlined />, label: '清晰度', field: 'resolution', opts: [
    { value: '480p', label: '480p' }, { value: '720p', label: '720p' }, { value: '1080p', label: '1080p' },
  ], def: '1080p' },
  { icon: <ColumnWidthOutlined />, label: '比例', field: 'vAspect', opts: [
    { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' },
  ], def: '16:9' },
  { icon: <SoundOutlined />, label: '声音', field: 'audioOn', opts: [
    { value: 'on', label: '有声' }, { value: 'off', label: '无声' },
  ], def: 'on' },
];
// 各家 TTS 音色候选(精简代表集;完整目录仍在专门的「语音」面板)。value 必须是上游真实 voice_id。
const VOICE_SETS: Record<VoiceProvider, ModelOpt[]> = {
  openai: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
  minimax: [
    { value: 'English_Insightful_Speaker', label: 'Insightful(英)' },
    { value: 'Chinese (Mandarin)_Lyrical_Voice', label: '抒情女声(中)' },
    { value: 'Chinese (Mandarin)_HK_Flight_Attendant', label: '空姐(中)' },
    { value: 'English_Graceful_Lady', label: 'Graceful(英)' },
    { value: 'English_Persuasive_Man', label: 'Persuasive(英)' },
    { value: 'Cantonese_GentleLady', label: '温柔女声(粤)' },
  ],
  tencent: [
    { value: 'alloy', label: 'Alloy' },
    { value: 'echo', label: 'Echo' },
    { value: '101001', label: '智瑜(女)' },
    { value: '101002', label: '智聆(女)' },
    { value: '101003', label: '智美(女)' },
    { value: '101004', label: '智云(男)' },
  ],
  dashscope: [
    { value: 'longxiaochun_v2', label: '龙小春' },
    { value: 'longwan_v2', label: '龙婉' },
    { value: 'longcheng_v2', label: '龙橙' },
    { value: 'longhua_v2', label: '龙华' },
  ],
  kling: [
    { value: 'genshin_vindi2', label: '阳光少年' },
    { value: 'zhinen_xuesheng', label: '知性学生' },
    { value: 'ai_shatang', label: '沙糖' },
    { value: 'genshin_klee2', label: '可莉' },
  ],
};
const DEFAULT_VOICE: Record<VoiceProvider, string> = {
  openai: 'alloy',
  minimax: 'English_Insightful_Speaker',
  tencent: 'alloy',
  dashscope: 'longxiaochun_v2',
  kling: 'genshin_vindi2',
};
// 语气 emotion_category:各家取值不同(minimax fearful / tencent fear …),按 provider 出。仅 minimax/tencent 真生效。
const EMO = (value: string, label: string): ModelOpt => ({ value, label });
const EMOTION_SETS: Record<VoiceProvider, ModelOpt[]> = {
  minimax: [EMO('neutral', '中性'), EMO('happy', '开心'), EMO('sad', '悲伤'), EMO('angry', '愤怒'), EMO('fearful', '害怕'), EMO('disgusted', '厌恶'), EMO('surprised', '惊讶'), EMO('calm', '平静')],
  tencent: [EMO('neutral', '中性'), EMO('happy', '开心'), EMO('sad', '悲伤'), EMO('angry', '愤怒'), EMO('fear', '害怕'), EMO('amaze', '惊讶'), EMO('disgusted', '厌恶'), EMO('peaceful', '平静'), EMO('exciting', '兴奋')],
  openai: [EMO('neutral', '中性'), EMO('happy', '开心'), EMO('sad', '悲伤'), EMO('angry', '愤怒')],
  dashscope: [EMO('neutral', '中性'), EMO('happy', '开心'), EMO('sad', '悲伤'), EMO('angry', '愤怒')],
  kling: [EMO('neutral', '中性'), EMO('happy', '开心'), EMO('sad', '悲伤'), EMO('angry', '愤怒')],
};
const SPEED_OPTS: ModelOpt[] = [EMO('0.75', '0.75x'), EMO('1', '1x'), EMO('1.25', '1.25x'), EMO('1.5', '1.5x')];
const emotionSupported = (vp: VoiceProvider) => vp === 'minimax' || vp === 'tencent';

// 特效(Kling)—— 对齐 EffectsPanel:effect_scene 一份硬编码目录(官方无目录端点),
// 双人特效(hug/kiss/heart_gesture/fight)需 2 张图(第一张=左、第二张=右),其余 1 张;label 未映射的按下划线转空格显示。
const DUAL_SCENES = new Set(['hug', 'kiss', 'heart_gesture', 'fight']);
const EFFECT_VALUES: string[] = [
  'squish', 'expansion', 'fuzzyfuzzy', 'bloombloom', 'dizzydizzy', 'jelly_squish', 'jelly_press', 'jelly_slice', 'jelly_jiggle',
  'anime_figure', 'yearbook', 'instant_film', 'pixelpixel', 'rocketrocket', 'firework', 'dollar_rain', 'marry_me', 'day_to_night',
  'long_hair', 'cry_cry', 'thumbs_up', 'smoke_smoke', 'lightning_power', 'mythic_style', 'steampunk', 'c4d_cartoon',
  '3d_cartoon_1', '3d_cartoon_2', 'plushcut', 'wig_out', 'wool_curly', 'felt_felt', 'jumpdrop', 'celebration', 'splashsplash',
  'surfsurf', 'skateskate', 'ski_ski', 'fairy_wing', 'angel_wing', 'dark_wing', 'baseball', 'inner_voice', 'a_list_look',
  'memory_alive', 'trampoline', 'trampoline_night', 'pucker_up', 'guess_what', 'feed_mooncake', 'rampage_ape', 'flyer',
  'dishwasher', 'magic_fireball', 'gallery_ring', 'squeeze_scream', 'running_man', 'disappear', 'eagle_snatch', 'hug_from_past',
  'media_interview', 'santa_gifts', 'santa_hug', 'girlfriend', 'boyfriend', 'heart_gesture_1', 'instant_kid', 'building_collapse',
  'gun_shot', 'mushroom', 'double_gun', 'jesus_hug', 'shark_alert', 'lie_flat', 'polar_bear_hug', 'brown_bear_hug', 'jazz_jazz',
  'office_escape_plow', 'fly_fly', 'watermelon_bomb', 'boss_coming', 'swing_swing', 'piggy_morph', 'car_explosion', 'siblings',
  'construction_worker', 'let’s_ride', 'snatched', 'magic_broom', 'tiger_hug',
  'pet_chinese_opera', 'pet_moto_rider', 'muscle_pet', 'pet_delivery', 'pet_lion', 'pet_chef', 'pet_wizard', 'pet_warrior',
  'pet_dance', 'pet_bee',
  'hug', 'kiss', 'heart_gesture', 'fight',
];
const EFFECT_ZH: Record<string, string> = {
  squish: '挤压', expansion: '膨胀', fuzzyfuzzy: '毛绒绒', bloombloom: '绽放', dizzydizzy: '眩晕', jelly_squish: '果冻挤压',
  anime_figure: '手办化', yearbook: '毕业照', instant_film: '拍立得', pixelpixel: '像素化', rocketrocket: '火箭', firework: '烟花',
  dollar_rain: '钞票雨', marry_me: '求婚', day_to_night: '日转夜', long_hair: '长发', cry_cry: '哭泣', thumbs_up: '点赞',
  hug: '拥抱', kiss: '亲吻', heart_gesture: '比心', fight: '对战',
};
const EFFECT_SCENES: ModelOpt[] = EFFECT_VALUES.map((v) => ({ value: v, label: EFFECT_ZH[v] || v.replace(/_/g, ' ') }));
const EFFECT_DURATION: ModelOpt[] = [EMO('5', '5s'), EMO('10', '10s')];
const EFFECT_MODE: ModelOpt[] = [EMO('std', '标准'), EMO('pro', '高质')];
const effectScene = (data: any): string => String(data.effect_scene || 'squish');

// 多帧(Vidu Q2):起始帧 + 关键帧序列 → 视频。画布扁平版:节点自身图=起始帧,上游图=关键帧,统一时长/prompt;逐帧控制留待专门节点。
const MF_RESOLUTION: ModelOpt[] = [EMO('540p', '540p'), EMO('720p', '720p'), EMO('1080p', '1080p')];
const MF_DURATION: ModelOpt[] = ['2', '3', '4', '5', '6', '7'].map((v) => EMO(v, `${v}s/帧`));
// 模板(Vidu):固定虚拟模型 vidu-template,template 选预设。
const TEMPLATE_PRESETS: ModelOpt[] = [
  EMO('hugging', '拥抱'), EMO('french_kiss', '法式热吻'), EMO('love_story', '恋爱故事'), EMO('exotic_princess', '异域公主'),
  EMO('beast_companion', '神兽伙伴'), EMO('subject_3', '科目三'), EMO('pubg_winner_hit', '吃鸡'), EMO('simpsons_comic', '辛普森'),
  EMO('ghibli', '吉卜力'), EMO('minecraft', '我的世界'), EMO('shake_it_down', '甩起来'), EMO('fairy_me', '精灵化'),
];
const TEMPLATE_ASPECT: ModelOpt[] = [EMO('16:9', '16:9'), EMO('9:16', '9:16')];
const TEMPLATE_BGM: ModelOpt[] = [EMO('off', '无'), EMO('on', '有')];
// 换装(腾讯 aiart change-clothes):images=[人物, 衣服…] 位置化,clothes_type 指明部位。
const CLOTHES_TYPE: ModelOpt[] = [EMO('Upper-body', '上装'), EMO('Lower-body', '下装'), EMO('Dress', '连衣裙'), EMO('Upper-Lower', '上+下')];
const clothesType = (data: any): string => String(data.clothes_type || 'Upper-body');

// 一键成片(Vidu 固定虚拟模型):上传 1–7 张图 → 整片视频。
const AD_ASPECT: ModelOpt[] = [EMO('16:9', '16:9'), EMO('9:16', '9:16'), EMO('1:1', '1:1')];
const AD_LANG: ModelOpt[] = [EMO('zh', '中文'), EMO('en', 'English')];
const AD_DURATION: ModelOpt[] = ['8', '15', '30', '45', '60'].map((v) => EMO(v, `${v}s`));
const GEN_ASPECT: ModelOpt[] = [EMO('16:9', '16:9'), EMO('9:16', '9:16'), EMO('1:1', '1:1'), EMO('4:3', '4:3'), EMO('3:4', '3:4')];
const GEN_DURATION: ModelOpt[] = ['5', '10', '15', '30', '60', '120'].map((v) => EMO(v, `${v}s`));
// 数智人(image + 驱动音频 → 说话视频):覆盖 OmniHuman / Wan(emo/liveportrait) / 腾讯 lipsync-photo 等音频驱动型。
const VM_RESOLUTION: ModelOpt[] = [EMO('720p', '720p'), EMO('1080p', '1080p')];

// ============ 能力注册表 ============
// 画布的每一种生成能力(图片/视频/音频/…后续换装/特效/3D)都是一条声明式配置:
// 声明「用哪种模型、要不要参考图、参数怎么出、走哪个端点、结果落成什么」。
// Composer 的顶部切换、参数区,以及 runGenerator 全部由这张表驱动 —— 新增一个能力 = 加一条,不改骨架。
type ParamDef = { icon: JSX.Element; label: string; field: string; opts: ModelOpt[]; def?: string };
type CapRequest =
  // 异步任务:POST path → task,queued/running 轮询 pollBase+id,succeeded 用 extract 取结果 URL
  | { transport: 'async'; path: string; body: Record<string, unknown>; pollBase: string; extract: (t: any) => string[] }
  // 同步二进制(如 TTS):POST path → blob,上传拿持久 URL
  | { transport: 'syncBinary'; path: string; body: Record<string, unknown>; filename: string }
  // 分段 TTS:每段可带独立语气,全部返回后在浏览器拼成一条 WAV。
  | { transport: 'segmentedAudio'; path: string; body: Record<string, unknown>; chunks: EmotionChunk[]; filename: string };
type CapOutput = 'image' | 'video' | 'audio' | 'model3d';
type Capability = {
  id: string; // 也是节点 data.kind
  label: string;
  icon: JSX.Element;
  output: CapOutput; // 结果落到 images[] / videoUrl / audioUrl / model3dUrl,决定节点渲染
  modelType: string; // systemApi.models 的 type 过滤键(image / video / audio.speech / 3d / …)
  modelFilter?: (m: ModelInfo) => boolean; // 在 modelType 内再收窄(如特效仅 kling、换装仅 change-clothes)
  usesRefs: boolean; // 是否显示输入参考图行(并把参考图带进请求)
  combineRefs?: boolean; // 多输入能力(换装=人+衣、多帧/模板/成片=多图):自身图 + 上游图 合并;
  // 默认(单主体:图片/视频/特效/3D/数智人)= 有自身图就只用自身,否则回退上游,不叠加祖先图
  usesPrompt?: boolean; // 是否显示提示词框(默认显示;特效等纯图驱动置 false)
  usesAudio?: boolean; // 是否需要上游音频节点作驱动音频(数智人)
  refsHint?: string; // 无参考图时的提示文案(覆盖默认「首帧 / 加参考图」)
  audioHint?: string; // 需要音频时的提示文案
  showCount?: boolean; // 图片张数控件
  stylePresets?: boolean; // 风格预设按钮
  promptPlaceholder: string;
  validate: (a: { prompt: string; refs: string[]; audio: string[]; data: any }) => string | null; // 返回错误提示或 null
  params: (data: any, models: ModelInfo[]) => ParamDef[]; // 动态参数药丸
  defaults: (models: ModelInfo[]) => Record<string, unknown>; // 选中该能力时的初始设置
  onModelChange: (v: string, models: ModelInfo[]) => Record<string, unknown>; // 换模型时的设置补丁
  request: (a: { model: string; prompt: string; refs: string[]; audio: string[]; data: any }) => CapRequest;
};

// 结果 URL(s) → 节点数据补丁(按输出媒体类型落到不同字段)
function applyOutput(output: CapOutput, urls: string[]): Record<string, unknown> {
  if (output === 'image') return { images: urls };
  if (output === 'video') return { videoUrl: urls[0] };
  if (output === 'model3d') return { model3dUrl: urls[0] };
  return { audioUrl: urls[0] };
}

// 只读取媒体 metadata，不下载完整文件。浏览器无法解析时返回 null，交给上游继续校验。
function audioDurationSeconds(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    audio.src = url;
  });
}

const CAPABILITIES: Capability[] = [
  {
    id: 'image', label: '图片', icon: <PictureOutlined />, output: 'image', modelType: 'image',
    usesRefs: true, showCount: true, stylePresets: true, promptPlaceholder: '描述你想生成或编辑的图片…',
    validate: ({ prompt }) => (prompt ? null : '填写提示词'),
    params: (data) => {
      const c = controlsForModel(data.model);
      return (
        [
          { icon: <ExpandOutlined />, label: '尺寸', field: 'size', opts: c.sizeOpts, def: c.defaultSize },
          { icon: <ColumnWidthOutlined />, label: '比例', field: 'aspectRatio', opts: c.aspectOpts, def: c.defaultAspect },
          { icon: <ExpandOutlined />, label: '档位', field: 'imageSize', opts: c.imageSizeOpts, def: c.defaultImageSize },
          { icon: <ControlOutlined />, label: '质量', field: 'quality', opts: c.qualityOpts, def: c.defaultQuality },
          { icon: <BgColorsOutlined />, label: '风格', field: 'style', opts: c.styleOpts, def: c.defaultStyle },
        ] as ParamDef[]
      ).filter((p) => p.opts && p.opts.length);
    },
    defaults: (models) => ({ model: models[0]?.value, count: 1, ...defaultParams(models[0]?.value) }),
    onModelChange: (v) => ({ model: v, ...defaultParams(v) }),
    request: ({ model, prompt, refs, data }) => ({
      transport: 'async', path: '/v1/images/generations/async', pollBase: '/v1/images/generations/',
      body: {
        model, prompt, n: data.count || 1,
        ...buildImageParams(model, { size: data.size, quality: data.quality, style: data.style, aspectRatio: data.aspectRatio, imageSize: data.imageSize }),
        ...(refs.length ? { images: refs } : {}),
      },
      extract: (t) => (t.data || []).map((x: any) => x.url || (x.b64_json ? `data:image/png;base64,${x.b64_json}` : '')).filter(Boolean),
    }),
  },
  {
    id: 'video', label: '视频', icon: <VideoCameraOutlined />, output: 'video', modelType: 'video',
    usesRefs: true, promptPlaceholder: '描述视频内容(有参考图则以其为首帧)…',
    validate: ({ prompt, refs }) => (prompt || refs.length ? null : '填写提示词或加参考图'),
    params: () => VIDEO_PARAMS as ParamDef[],
    defaults: (models) => ({ model: models[0]?.value, duration: '5', resolution: '1080p', vAspect: '16:9', audioOn: 'on' }),
    onModelChange: (v) => ({ model: v }),
    request: ({ model, prompt, refs, data }) => ({
      transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/',
      body: {
        model, prompt,
        duration: Number(data.duration || 5), resolution: data.resolution || '1080p',
        aspect_ratio: data.vAspect || '16:9', audio: (data.audioOn || 'on') === 'on',
        // 通用视频节点采用首帧驱动。Seedance 禁止首/尾帧与 reference images 混传。
        ...(refs.length ? { first_frame_image: refs[0] } : {}),
      },
      extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []),
    }),
  },
  {
    id: 'audio', label: '音频', icon: <CustomerServiceOutlined />, output: 'audio', modelType: 'audio.speech',
    usesRefs: false, promptPlaceholder: '输入要合成语音的文本…',
    validate: ({ prompt }) => (prompt ? null : '输入要合成语音的文本'),
    params: (data, models) => {
      const vp = voiceProviderOf(models.find((m) => m.value === data.model)?.providerType);
      return [
        { icon: <SoundOutlined />, label: '音色', field: 'voice', opts: VOICE_SETS[vp], def: DEFAULT_VOICE[vp] },
        ...(emotionSupported(vp) ? [{ icon: <SmileOutlined />, label: '语气', field: 'emotion', opts: EMOTION_SETS[vp], def: 'neutral' }] : []),
        { icon: <ThunderboltOutlined />, label: '语速', field: 'speed', opts: SPEED_OPTS, def: '1' },
      ];
    },
    defaults: (models) => {
      const vp = voiceProviderOf(models[0]?.providerType);
      return { model: models[0]?.value, voice: DEFAULT_VOICE[vp], emotion: 'neutral', speed: '1' };
    },
    onModelChange: (v, models) => {
      const vp = voiceProviderOf(models.find((m) => m.value === v)?.providerType);
      return { model: v, voice: DEFAULT_VOICE[vp], emotion: 'neutral' };
    },
    request: ({ model, prompt, data }) => {
      const ranges = (data.emotionRanges || []) as EmotionRange[];
      const chunks = chunksForSynthesis(buildEmotionChunks(prompt, ranges));
      const body = { model, input: prompt, voice: data.voice || 'alloy', response_format: 'mp3', speed: Number(data.speed || 1), emotion_category: data.emotion || 'neutral' };
      return ranges.length
        ? { transport: 'segmentedAudio' as const, path: '/v1/audio/speech', filename: 'speech.wav', body, chunks }
        : { transport: 'syncBinary' as const, path: '/v1/audio/speech', filename: 'speech.mp3', body };
    },
  },
  {
    // 特效:Kling 视频特效(effect_scene 目录),纯图驱动无 prompt。双人特效需 2 张图(左/右)。
    id: 'effects', label: '特效', icon: <ThunderboltOutlined />, output: 'video', modelType: 'video',
    modelFilter: (m) => /kling/i.test(m.value), usesRefs: true, usesPrompt: false,
    refsHint: '连接/加 1 张图(拥抱/亲吻/比心/对战 双人特效需 2 张:左、右)',
    promptPlaceholder: '',
    validate: ({ refs, data }) => {
      const need = DUAL_SCENES.has(effectScene(data)) ? 2 : 1;
      if (refs.length !== need) return need === 2 ? '双人特效需要 2 张图(第一张=左、第二张=右)' : '该特效需要 1 张参考图';
      return null;
    },
    params: (data) => [
      { icon: <ThunderboltOutlined />, label: '特效', field: 'effect_scene', opts: EFFECT_SCENES, def: 'squish' },
      { icon: <ClockCircleOutlined />, label: '时长', field: 'duration', opts: EFFECT_DURATION, def: '5' },
      ...(DUAL_SCENES.has(effectScene(data)) ? [{ icon: <ControlOutlined />, label: '模式', field: 'mode', opts: EFFECT_MODE, def: 'std' }] : []),
    ],
    defaults: (models) => ({ model: models[0]?.value, effect_scene: 'squish', duration: '5', mode: 'std' }),
    onModelChange: (v) => ({ model: v }),
    request: ({ model, refs, data }) => ({
      transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/',
      body: {
        task_type: 'effects', model, effect_scene: effectScene(data), images: refs, duration: Number(data.duration || 5),
        ...(DUAL_SCENES.has(effectScene(data)) ? { mode: data.mode || 'std' } : {}),
      },
      extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []),
    }),
  },
  {
    // 多帧:Vidu Q2 关键帧插值。节点自身图=起始帧,上游图=关键帧(≥2),统一时长,composer 提示词应用到每帧。
    id: 'multiframe', label: '多帧', icon: <VideoCameraAddOutlined />, output: 'video', modelType: 'video',
    modelFilter: (m) => /viduq2/i.test(m.value), usesRefs: true, combineRefs: true,
    refsHint: '本节点图=起始帧,连接上游图=关键帧(共需 ≥3 张,关键帧 2–9)',
    promptPlaceholder: '整体运动/风格描述(应用到每帧,可空)…',
    validate: ({ refs }) => (refs.length >= 3 ? null : '多帧需要 ≥3 张图:起始帧 + 至少 2 个关键帧'),
    params: () => [
      { icon: <ExpandOutlined />, label: '清晰度', field: 'resolution', opts: MF_RESOLUTION, def: '720p' },
      { icon: <ClockCircleOutlined />, label: '每帧时长', field: 'mfDuration', opts: MF_DURATION, def: '5' },
    ],
    defaults: (models) => ({ model: models[0]?.value, resolution: '720p', mfDuration: '5' }),
    onModelChange: (v) => ({ model: v }),
    request: ({ model, prompt, refs, data }) => ({
      transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/',
      body: {
        model, task_type: 'multiframe',
        first_frame_image: refs[0],
        image_settings: refs.slice(1).map((u) => ({ key_image: u, duration: Number(data.mfDuration || 5), ...(prompt ? { prompt } : {}) })),
        resolution: data.resolution || '720p',
      },
      extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []),
    }),
  },
  {
    // 模板:Vidu 场景特效模板。固定虚拟模型 vidu-template(仅路由/计费),template 选预设,主体图 1–3 张。
    id: 'template', label: '模板', icon: <AppstoreOutlined />, output: 'video', modelType: 'video',
    modelFilter: (m) => m.value === 'vidu-template', usesRefs: true, combineRefs: true,
    refsHint: '连接/加 1–3 张主体图',
    promptPlaceholder: '补充描述(可空)…',
    validate: ({ refs }) => (refs.length >= 1 ? null : '模板需要至少 1 张主体图'),
    params: () => [
      { icon: <AppstoreOutlined />, label: '模板', field: 'template', opts: TEMPLATE_PRESETS, def: 'hugging' },
      { icon: <ColumnWidthOutlined />, label: '比例', field: 'tAspect', opts: TEMPLATE_ASPECT, def: '16:9' },
      { icon: <SoundOutlined />, label: '配乐', field: 'bgm', opts: TEMPLATE_BGM, def: 'off' },
    ],
    defaults: () => ({ model: 'vidu-template', template: 'hugging', tAspect: '16:9', bgm: 'off' }),
    onModelChange: () => ({ model: 'vidu-template' }),
    request: ({ prompt, refs, data }) => ({
      transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/',
      body: {
        model: 'vidu-template', task_type: 'template', template: data.template || 'hugging',
        images: refs, aspect_ratio: data.tAspect || '16:9',
        ...(prompt ? { prompt } : {}), ...((data.bgm || 'off') === 'on' ? { bgm: true } : {}),
      },
      extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []),
    }),
  },
  {
    // 换装:腾讯 aiart change-clothes。节点自身图=人物,上游图=衣服;clothes_type 指明部位(Upper-Lower 需人物+上装+下装)。
    id: 'tryon', label: '换装', icon: <SkinOutlined />, output: 'image', modelType: 'image',
    modelFilter: (m) => /change-clothes/i.test(m.value), usesRefs: true, usesPrompt: false, combineRefs: true,
    refsHint: '本节点图=人物,连接上游图=衣服(上/下/连衣裙;上+下需依次连 上装、下装)',
    promptPlaceholder: '',
    validate: ({ refs, data }) => {
      const need = clothesType(data) === 'Upper-Lower' ? 3 : 2;
      if (refs.length < need) return need === 3 ? '上+下换装需要 人物 + 上装 + 下装 共 3 张' : '换装需要 人物图 + 衣服图 共 2 张';
      return null;
    },
    params: () => [{ icon: <SkinOutlined />, label: '部位', field: 'clothes_type', opts: CLOTHES_TYPE, def: 'Upper-body' }],
    defaults: (models) => ({ model: models[0]?.value, clothes_type: 'Upper-body' }),
    onModelChange: (v) => ({ model: v }),
    request: ({ model, refs, data }) => ({
      transport: 'async', path: '/v1/images/generations/async', pollBase: '/v1/images/generations/',
      body: { model, images: refs, clothes_type: clothesType(data) },
      extract: (t) => (t?.data || []).map((x: any) => x.url || '').filter(Boolean),
    }),
  },
  {
    // 广告一键成片:Vidu 电商整片。1–7 张商品图 + 可选文案 → 整片视频(脚本/分镜/配音服务端完成)。
    id: 'ad', label: '广告成片', icon: <ShoppingOutlined />, output: 'video', modelType: 'video',
    modelFilter: (m) => m.value === 'vidu-ad-one-click', usesRefs: true, combineRefs: true,
    refsHint: '连接/加 1–7 张商品图',
    promptPlaceholder: '商品/广告文案(可空)…',
    validate: ({ refs }) => (refs.length >= 1 ? null : '至少 1 张商品图'),
    params: () => [
      { icon: <ColumnWidthOutlined />, label: '比例', field: 'tAspect', opts: AD_ASPECT, def: '16:9' },
      { icon: <ClockCircleOutlined />, label: '时长', field: 'adDuration', opts: AD_DURATION, def: '15' },
      { icon: <EditOutlined />, label: '语言', field: 'adLang', opts: AD_LANG, def: 'zh' },
      { icon: <BulbOutlined />, label: '创意', field: 'creative', opts: [EMO('off', '关'), EMO('on', '开')], def: 'off' },
    ],
    defaults: () => ({ model: 'vidu-ad-one-click', tAspect: '16:9', adDuration: '15', adLang: 'zh', creative: 'off' }),
    onModelChange: () => ({ model: 'vidu-ad-one-click' }),
    request: ({ prompt, refs, data }) => ({
      transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/',
      body: {
        model: 'vidu-ad-one-click', task_type: 'ad_one_click', images: refs,
        duration: Number(data.adDuration || 15), aspect_ratio: data.tAspect || '16:9', language: data.adLang || 'zh',
        ...(prompt ? { prompt } : {}), ...((data.creative || 'off') === 'on' ? { creative: true } : {}),
      },
      extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []),
    }),
  },
  {
    // 通用一键成片:Vidu 通用整片。1–7 张图 + 可选描述 → 整片视频。
    id: 'oneclick', label: '通用成片', icon: <VideoCameraOutlined />, output: 'video', modelType: 'video',
    modelFilter: (m) => m.value === 'vidu-general-one-click', usesRefs: true, combineRefs: true,
    refsHint: '连接/加 1–7 张图',
    promptPlaceholder: '整片描述(可空)…',
    validate: ({ refs }) => (refs.length >= 1 ? null : '至少 1 张图'),
    params: () => [
      { icon: <ColumnWidthOutlined />, label: '比例', field: 'tAspect', opts: GEN_ASPECT, def: '16:9' },
      { icon: <ClockCircleOutlined />, label: '时长', field: 'genDuration', opts: GEN_DURATION, def: '15' },
    ],
    defaults: () => ({ model: 'vidu-general-one-click', tAspect: '16:9', genDuration: '15' }),
    onModelChange: () => ({ model: 'vidu-general-one-click' }),
    request: ({ prompt, refs, data }) => ({
      transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/',
      body: {
        model: 'vidu-general-one-click', task_type: 'general_one_click', images: refs,
        duration: Number(data.genDuration || 15), aspect_ratio: data.tAspect || '16:9',
        ...(prompt ? { prompt } : {}),
      },
      extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []),
    }),
  },
  {
    // 数智人:头像图 + 驱动音频 → 说话视频。音频来自上游音频/TTS 节点(input_audio_url)。
    // 收窄到 body 已核实的音频驱动型:OmniHuman(output_resolution 数值)、腾讯 lipsync-photo(resolution 字符串)。
    // (万相 emo-v1/liveportrait 需 aspect_ratio+style_level,参数不同,后续单独接。)
    id: 'virtualman', label: '数智人', icon: <UserOutlined />, output: 'video', modelType: 'video',
    modelFilter: (m) => /omnihuman|lipsync-photo/i.test(m.value),
    usesRefs: true, usesPrompt: false, usesAudio: true,
    refsHint: '本节点图/上游图=头像',
    audioHint: '上游需连一个音频/TTS 节点作驱动音频',
    promptPlaceholder: '',
    validate: ({ refs, audio }) => {
      if (!refs.length) return '需要 1 张头像图(本节点或上游图片节点)';
      if (!audio.length) return '需要驱动音频:上游连一个音频/TTS 节点';
      return null;
    },
    params: () => [{ icon: <ExpandOutlined />, label: '清晰度', field: 'vmRes', opts: VM_RESOLUTION, def: '720p' }],
    defaults: (models) => ({ model: models[0]?.value, vmRes: '720p' }),
    onModelChange: (v) => ({ model: v }),
    request: ({ model, refs, audio, data }) => {
      const res = String(data.vmRes || '720p');
      const body: Record<string, unknown> = {
        model, task_type: 'virtualman', first_frame_image: refs[0], input_audio_url: audio[0],
      };
      if (/omnihuman/i.test(model)) body.output_resolution = res === '1080p' ? 1080 : 720;
      else body.resolution = res; // Wan / 腾讯 lipsync-photo 走字符串清晰度
      return { transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/', body,
        extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []) };
    },
  },
  {
    // 3D:图生 3D / 文生 3D → glb/splat 模型。结果落 model3dUrl,节点内 three.js SceneViewer 查看。
    id: '3d', label: '3D', icon: <ExperimentOutlined />, output: 'model3d', modelType: '3d',
    usesRefs: true, refsHint: '连接/加 1 张图(图生 3D;留空则纯文生 3D)',
    promptPlaceholder: '文生 3D 描述(有图可空)…',
    validate: ({ prompt, refs }) => (prompt || refs.length ? null : '填写描述或加 1 张图'),
    params: () => [],
    defaults: (models) => ({ model: models[0]?.value }),
    onModelChange: (v) => ({ model: v }),
    request: ({ model, prompt, refs }) => ({
      transport: 'async', path: '/v1/3d/generations', pollBase: '/v1/3d/generations/',
      body: { model, ...(refs.length ? { images: [refs[0]] } : {}), ...(prompt ? { prompt } : {}) },
      extract: (t) => {
        const u = t?.result_url || (t?.files || []).find((f: any) => f.url)?.url;
        return u ? [u] : [];
      },
    }),
  },
];
const capById = (id?: string): Capability => CAPABILITIES.find((c) => c.id === id) || CAPABILITIES[0];
// 在能力的 modelType 内应用 modelFilter,得到该能力可用的模型列表
function modelsForCap(cap: Capability, byType: ModelsByType): ModelInfo[] {
  const list = byType[cap.modelType] || [];
  return cap.modelFilter ? list.filter(cap.modelFilter) : list;
}
// 选中某能力时的完整初始设置(kind + 该能力默认参数)
function capDefault(cap: Capability, models: ModelInfo[]): Record<string, unknown> {
  return { kind: cap.id, ...cap.defaults(models) };
}

type CloneArgs = { provider: string; name: string; file: File; demoText: string; language: string; voiceId: string; description: string };
type MaterialArgs = { file: File | null; fileUrl: string; assetType: string; isRealPerson: boolean; name: string; groupId: string };
type LiveVoice = { voice: string; display_name?: string; description?: string; system?: boolean };
type Ctx = {
  runState: Record<string, RunInfo>;
  chatModels: ModelInfo[];
  liveVoices: LiveVoice[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  selectNode: (id: string) => void;
  deleteNode: (id: string) => void;
  uploadAsset: (file: File) => Promise<string | null>;
  openPreview: (images: string[], index?: number) => void;
  runLLM: (id: string, model: string, mode: string) => void;
  runClone: (id: string, args: CloneArgs) => void;
  openLive: (id: string) => void;
  runMaterial: (id: string, args: MaterialArgs) => void;
  startLiveness: (id: string) => void;
};
const CanvasCtx = createContext<Ctx>({} as Ctx);

const MATERIAL_ASSET_TYPE: ModelOpt[] = [EMO('Image', '图片'), EMO('Video', '视频'), EMO('Audio', '音频')];

// 音色克隆 provider(对齐 VoiceClonePanel 的 PROVIDERS;vidu/minimax 上游原生返回试听)
const CLONE_PROVIDERS: ModelOpt[] = [
  { value: 'minimax', label: 'MiniMax' },
  { value: 'vidu', label: 'Vidu' },
  { value: 'volc_speech', label: '火山语音' },
  { value: 'dashscope_speech', label: '通义(Dashscope)' },
  { value: 'tencent_voice_clone', label: '腾讯' },
  { value: 'kling', label: '可灵' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
];
const CLONE_LANG: ModelOpt[] = [EMO('zh', '中文'), EMO('en', 'English'), EMO('ja', '日本語'), EMO('ko', '한국어')];

// 提示词节点的 LLM 变换模式(变换节点:文本进 → 文本出,喂给下游生成节点)
const LLM_MODES: { value: string; label: string; system: string }[] = [
  { value: 'expand', label: '扩写', system: '你是提示词工程师。把输入改写成用于文生图/文生视频的详细中文画面描述,涵盖主体、动作、场景、光线、镜头、风格。只输出提示词本身,不要任何解释或前后缀。' },
  { value: 'refine', label: '精炼', system: '精炼下面的提示词,去掉冗余、保留画面关键信息,使其更适合图像/视频生成。只输出结果本身。' },
  { value: 'en', label: '译英', system: 'Translate the input into a single concise English prompt suitable for image/video generation. Output only the prompt, no quotes or explanation.' },
];
const llmModeSystem = (mode?: string) => LLM_MODES.find((m) => m.value === mode)?.system || LLM_MODES[0].system;

const KNOWN_TYPES = new Set(['image', 'prompt', 'clone', 'live', 'material']);
const COMPOSER_W = 520;

// 复制文本:优先剪贴板 API(localhost/https 可用),否则 textarea + execCommand 兜底;都给 toast 反馈
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    message.success('报错已复制');
  } catch {
    message.error('复制失败,请手动选中文字复制');
  }
}

function defaultParams(model?: string) {
  const c = controlsForModel(model);
  return {
    size: c.defaultSize,
    aspectRatio: c.defaultAspect,
    imageSize: c.defaultImageSize,
    quality: c.defaultQuality ?? c.qualityOpts?.[0]?.value,
    style: c.defaultStyle ?? c.styleOpts?.[0]?.value,
  };
}

// ============ 图片节点(上传 / 生成落图) ============
function ImageNode({ id, data }: NodeProps) {
  const { updateNodeData, selectNode, deleteNode, uploadAsset, runState, openPreview } = useContext(CanvasCtx);
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [v3dFail, setV3dFail] = useState(false);
  const images: string[] = data.images || [];
  const videoUrl: string | undefined = data.videoUrl;
  const audioUrl: string | undefined = data.audioUrl;
  const model3dUrl: string | undefined = data.model3dUrl;
  const run = runState[id];
  const hasImg = images.length > 0;
  const hasContent = hasImg || !!videoUrl || !!audioUrl || !!model3dUrl;
  const scene3dKind = model3dUrl ? classifyThreeDFile(undefined, model3dUrl) : null;
  // 生成节点标记 + 它对应的提示词/能力 —— 用来在图上标注「这是什么、由哪句提示词生成」,
  // 也用来区分「生成结果节点」和「纯上传节点」(结果没出来时不该退化成上传空框)。
  const isResult = !!data.isResult;
  const genCap = isResult ? capById(data.genKind || data.kind) : null; // 仅用于「结果待生成」占位的图标

  // 生成计时:running 期间每 200ms 刷新已用秒数
  useEffect(() => {
    if (run?.status !== 'running' || !run.startedAt) return undefined;
    const start = run.startedAt;
    setElapsed((Date.now() - start) / 1000);
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(t);
  }, [run?.status, run?.startedAt]);

  const put = useCallback(
    async (f?: File | null) => {
      if (!f) return;
      const url = await uploadAsset(f);
      if (url) updateNodeData(id, { images: [...(data.images || []), url] });
    },
    [uploadAsset, updateNodeData, id, data.images],
  );

  return (
    <div
      className={`sc-node sc-image ${hasContent ? 'sc-has' : 'sc-empty'}`}
      onPointerDownCapture={() => selectNode(id)}
    >
      <Handle type="target" position={Position.Left} />
      {videoUrl ? (
        <div className="media-card nodrag">
          <video src={videoUrl} controls playsInline />
        </div>
      ) : audioUrl ? (
        <div className="audio-card nodrag">
          <CustomerServiceOutlined />
          <audio src={audioUrl} controls />
        </div>
      ) : model3dUrl ? (
        <div className="media-card model3d-card nodrag">
          {scene3dKind && !v3dFail ? (
            <SceneViewer url={model3dUrl} kind={scene3dKind} height={200} onError={() => setV3dFail(true)} />
          ) : (
            <div className="model3d-fallback">
              <ExperimentOutlined />
              <span>3D 模型已生成</span>
              <a href={model3dUrl} target="_blank" rel="noreferrer" download>
                下载模型
              </a>
            </div>
          )}
        </div>
      ) : hasImg ? (
        images.length === 1 ? (
          <div className="image-wrap">
            <img src={images[0]} alt="" />
          </div>
        ) : (
          <div className="thumb-grid nodrag">
            {images.map((u, i) => (
              <div className="thumb-item" key={i}>
                <img src={u} alt="" />
              </div>
            ))}
          </div>
        )
      ) : run?.status === 'running' ? (
        <div className="loading-cell" />
      ) : run?.status === 'failed' ? (
        <div className="node-body">
          <div className="node-error nodrag">
            <span className="node-error-title">
              <CloseCircleOutlined /> 生成失败
            </span>
            <span className="node-error-msg">{run.error || '未知错误'}</span>
            <button className="node-error-copy" onClick={() => copyText(run.error || '')}>
              复制报错
            </button>
          </div>
        </div>
      ) : isResult ? (
        // 生成结果节点(结果没出来/丢失):显示待生成态 + 提示词,别退化成上传空框
        <div className="node-body">
          <div className="node-pending nodrag">
            <span className="node-pending-title">{genCap?.icon} 结果待生成</span>
            <span className="node-pending-hint">选中本节点后,在下方点运行重试</span>
          </div>
        </div>
      ) : (
        <>
          <div className="node-head">
            <span className="node-title">上传</span>
          </div>
          <div className="node-body">
            <div
              className={`node-drop nodrag${over ? ' drag-over' : ''}`}
              onClick={() => ref.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                put(e.dataTransfer.files?.[0]);
              }}
            >
              <UploadOutlined />
              <span>上传图片,或选中后在下方生成</span>
            </div>
          </div>
        </>
      )}
      <div className="floating-node-actions">
        {hasImg && (
          <button className="mini-x mini-view nodrag" title="查看大图" onClick={() => openPreview(images, 0)}>
            <FullscreenOutlined />
          </button>
        )}
        <button className="mini-x nodrag" title="删除节点" onClick={() => deleteNode(id)}>
          <CloseOutlined />
        </button>
      </div>
      {run?.status === 'running' && (
        <span className="run-time-pill">
          <span className="dot" />
          生成中 {elapsed < 100 ? elapsed.toFixed(1) : Math.round(elapsed)}s
        </span>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => put(e.target.files?.[0])}
      />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ============ 提示词节点(可选 LLM 变换:文本→文本,喂给下游生成节点) ============
function PromptNode({ id, data }: NodeProps) {
  const { updateNodeData, deleteNode, chatModels, runLLM, runState } = useContext(CanvasCtx);
  const running = runState[id]?.status === 'running';
  const failed = runState[id]?.status === 'failed';
  const model = data.chatModel || chatModels[0]?.value;
  const mode = data.llmMode || 'expand';
  return (
    <div className="sc-node sc-prompt">
      <Handle type="target" position={Position.Left} />
      <div className="prompt-node-card">
        <textarea
          className="prompt-node-text nodrag"
          value={data.text || ''}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="提示词…(连到图片节点上游作 prompt;也可用下方 AI 扩写/精炼)"
        />
        <div className="prompt-node-tools nodrag">
          <select
            className="pn-select"
            value={model}
            onChange={(e) => updateNodeData(id, { chatModel: e.target.value })}
            title="对话模型"
            disabled={running || !chatModels.length}
          >
            {chatModels.length ? (
              chatModels.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))
            ) : (
              <option>无对话模型</option>
            )}
          </select>
          <select
            className="pn-select pn-mode"
            value={mode}
            onChange={(e) => updateNodeData(id, { llmMode: e.target.value })}
            title="变换方式"
            disabled={running}
          >
            {LLM_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            className="pn-run"
            disabled={running || !chatModels.length}
            onClick={() => model && runLLM(id, model, mode)}
            title="用 LLM 处理本节点文本(含上游文本)"
          >
            <ThunderboltOutlined />
            {running ? '处理中' : 'AI'}
          </button>
        </div>
        {failed && <div className="pn-error nodrag">{runState[id]?.error || 'LLM 处理失败'}</div>}
      </div>
      <div className="floating-node-actions">
        <button className="mini-x nodrag" title="删除节点" onClick={() => deleteNode(id)}>
          <CloseOutlined />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ============ 音色克隆节点(句柄生产:样本音频 → voice_id + 试听音频,下游 TTS 复用) ============
function CloneNode({ id, data }: NodeProps) {
  const { updateNodeData, deleteNode, runClone, runState } = useContext(CanvasCtx);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const running = runState[id]?.status === 'running';
  const failed = runState[id]?.status === 'failed';
  const provider = data.provider || 'minimax';
  const voiceId: string | undefined = data.voiceId;
  const demoUrl: string | undefined = data.demoAudioUrl;

  return (
    <div className="sc-node sc-clone">
      <Handle type="target" position={Position.Left} />
      <div className="clone-card nodrag">
        <div className="clone-title">
          <CustomerServiceOutlined /> 音色克隆
        </div>
        {voiceId ? (
          <>
            <div className="clone-voiceid" title={voiceId}>
              voice_id:<b>{voiceId}</b>
            </div>
            {demoUrl && <audio src={demoUrl} controls />}
            <button className="clone-reset" onClick={() => updateNodeData(id, { voiceId: undefined, demoAudioUrl: undefined, cloneStatus: '' })}>
              重新克隆
            </button>
          </>
        ) : (
          <>
            <div className="node-field-row">
              <select className="pn-select" value={provider} onChange={(e) => updateNodeData(id, { provider: e.target.value })} disabled={running} title="厂商">
                {CLONE_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select className="pn-select pn-mode" value={data.language || 'zh'} onChange={(e) => updateNodeData(id, { language: e.target.value })} disabled={running} title="语言">
                {CLONE_LANG.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="clone-input"
              value={data.name || ''}
              onChange={(e) => updateNodeData(id, { name: e.target.value })}
              placeholder="音色名称(必填)"
              disabled={running}
            />
            <input
              className="clone-input"
              value={data.voiceIdInput || ''}
              onChange={(e) => updateNodeData(id, { voiceIdInput: e.target.value })}
              placeholder="自定义 voice_id(可空,留空自动生成)"
              disabled={running}
            />
            <input
              className="clone-input"
              value={data.description || ''}
              onChange={(e) => updateNodeData(id, { description: e.target.value })}
              placeholder="描述(可空)"
              disabled={running}
            />
            <button className="clone-file" onClick={() => fileRef.current?.click()} disabled={running}>
              <UploadOutlined /> {file ? file.name : '选音频样本(必填)'}
            </button>
            <input
              className="clone-input"
              value={data.demoText || ''}
              onChange={(e) => updateNodeData(id, { demoText: e.target.value })}
              placeholder="试听文本(填了返试听音频)"
              disabled={running}
            />
            <button
              className="pn-run clone-run"
              disabled={running}
              onClick={() =>
                file &&
                runClone(id, {
                  provider, name: data.name || '', file, demoText: data.demoText || '',
                  language: data.language || 'zh', voiceId: String(data.voiceIdInput || ''), description: String(data.description || ''),
                })
              }
            >
              <ThunderboltOutlined />
              {running ? (data.cloneStatus === 'training' ? '训练中' : '提交中') : '克隆'}
            </button>
            {failed && <div className="pn-error">{runState[id]?.error || '克隆失败'}</div>}
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                e.currentTarget.value = '';
              }}
            />
          </>
        )}
      </div>
      <div className="floating-node-actions">
        <button className="mini-x nodrag" title="删除节点" onClick={() => deleteNode(id)}>
          <CloseOutlined />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ============ 直播台节点(启动/会话:收头像/人设/音色 → 浮层里跑数字人直播) ============
function LiveNode({ id, data }: NodeProps) {
  const { updateNodeData, deleteNode, openLive, liveVoices } = useContext(CanvasCtx);
  const sysVoices = liveVoices.filter((v) => v.system !== false);
  const customVoices = liveVoices.filter((v) => v.system === false);
  return (
    <div className="sc-node sc-live">
      <Handle type="target" position={Position.Left} />
      <div className="live-card nodrag">
        <div className="clone-title">
          <VideoCameraOutlined /> 数字人直播
        </div>
        <div className="node-field-row">
          <div className="material-row live-mode">
            {(['video', 'audio'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={(data.callMode || 'video') === m ? 'active' : ''}
                onClick={() => updateNodeData(id, { callMode: m })}
              >
                {m === 'video' ? '视频通话' : '语音通话'}
              </button>
            ))}
          </div>
        </div>
        <select
          className="pn-select"
          value=""
          onChange={(e) => e.target.value && updateNodeData(id, { persona: e.target.value })}
          title="人设预设"
        >
          <option value="">选人设预设…</option>
          {PERSONA_PRESETS.map((p) => (
            <option key={p.label} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <textarea
          className="live-persona"
          value={data.persona || ''}
          onChange={(e) => updateNodeData(id, { persona: e.target.value })}
          placeholder="人设(可空,也可连上游提示词节点)…"
        />
        <input
          className="clone-input"
          value={data.avatarName || ''}
          onChange={(e) => updateNodeData(id, { avatarName: e.target.value })}
          placeholder="形象名称(可空)"
        />
        <select
          className="pn-select"
          value={data.voice || ''}
          onChange={(e) => updateNodeData(id, { voice: e.target.value })}
          title="音色(上游克隆音色优先)"
        >
          <option value="">默认音色(或用上游克隆)</option>
          {sysVoices.length > 0 && (
            <optgroup label="系统音色">
              {sysVoices.map((v) => (
                <option key={v.voice} value={v.voice}>
                  {v.display_name || v.voice}
                </option>
              ))}
            </optgroup>
          )}
          {customVoices.length > 0 && (
            <optgroup label="自定义克隆">
              {customVoices.map((v) => (
                <option key={v.voice} value={v.voice}>
                  {v.display_name || v.voice}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <input
          className="clone-input"
          value={data.channelName || ''}
          onChange={(e) => updateNodeData(id, { channelName: e.target.value })}
          placeholder="频道名(可空)"
        />
        <div className="live-hint">头像取上游/本节点图 · 音色取上游克隆节点 · 其余可在直播页调整</div>
        <button className="pn-run live-run" onClick={() => openLive(id)}>
          <VideoCameraOutlined /> 开始直播
        </button>
      </div>
      <div className="floating-node-actions">
        <button className="mini-x nodrag" title="删除节点" onClick={() => deleteNode(id)}>
          <CloseOutlined />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ============ 素材登记节点(句柄生产:上传媒体 → Tencent AssetId;支持真人活体检测) ============
function MaterialNode({ id, data }: NodeProps) {
  const { updateNodeData, deleteNode, runMaterial, startLiveness, runState } = useContext(CanvasCtx);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // 中文输入法组字期间不要更新 React Flow 的 nodes，否则受控 value 回写会中断 composition。
  const [nameDraft, setNameDraft] = useState(() => String(data.name || ''));
  const [urlDraft, setUrlDraft] = useState(() => String(data.fileUrl || ''));
  const [groupDraft, setGroupDraft] = useState(() => String(data.groupId || ''));
  const running = runState[id]?.status === 'running';
  const failed = runState[id]?.status === 'failed';
  const assetType = data.assetType || 'Image';
  const isReal = !!data.isRealPerson;
  const assetId: string | undefined = data.assetId;
  const srcUrl: string | undefined = data.srcUrl;

  useEffect(() => setNameDraft(String(data.name || '')), [data.name]);
  useEffect(() => setUrlDraft(String(data.fileUrl || '')), [data.fileUrl]);
  useEffect(() => setGroupDraft(String(data.groupId || '')), [data.groupId]);

  return (
    <div className="sc-node sc-material">
      <Handle type="target" position={Position.Left} />
      <div className="clone-card">
        <div className="clone-title material-drag-handle">
          <AppstoreOutlined /> 素材登记
        </div>
        <div className="material-controls nodrag">
        {assetId ? (
          <>
            {srcUrl && assetType === 'Image' && <img className="material-src" src={srcUrl} alt="" />}
            {srcUrl && assetType === 'Video' && <video className="material-src" src={srcUrl} controls />}
            {srcUrl && assetType === 'Audio' && <audio src={srcUrl} controls />}
            <div className="clone-voiceid" title={assetId}>
              AssetId:<b>{assetId}</b>
            </div>
            <button className="clone-reset" onClick={() => updateNodeData(id, { assetId: undefined, srcUrl: undefined, matStatus: '' })}>
              重新登记
            </button>
          </>
        ) : (
          <>
            <div className="material-row">
              {MATERIAL_ASSET_TYPE.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={assetType === o.value ? 'active' : ''}
                  onClick={() => updateNodeData(id, { assetType: o.value })}
                  disabled={running}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="material-check">
              <input type="checkbox" checked={isReal} onChange={(e) => updateNodeData(id, { isRealPerson: e.target.checked })} disabled={running} />
              真人素材(需活体检测)
            </label>
            {isReal && (
              <>
                <button className="clone-file" onClick={() => startLiveness(id)} disabled={running}>
                  {data.groupId ? '重做活体检测' : '活体检测(开 H5)'}
                </button>
                <input
                  className="clone-input"
                  value={groupDraft}
                  onChange={(e) => setGroupDraft(e.target.value)}
                  onBlur={() => updateNodeData(id, { groupId: groupDraft })}
                  onCompositionEnd={(e) => updateNodeData(id, { groupId: e.currentTarget.value })}
                  placeholder="group_id(活体后自动填,可手改)"
                  disabled={running}
                />
              </>
            )}
            <input
              className="clone-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => updateNodeData(id, { name: nameDraft })}
              onCompositionEnd={(e) => updateNodeData(id, { name: e.currentTarget.value })}
              placeholder="素材名称"
              disabled={running}
            />
            <button className="clone-file" onClick={() => fileRef.current?.click()} disabled={running}>
              <UploadOutlined /> {file ? file.name : '选媒体文件(或填下方 URL)'}
            </button>
            <input
              className="clone-input"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => updateNodeData(id, { fileUrl: urlDraft })}
              onCompositionEnd={(e) => updateNodeData(id, { fileUrl: e.currentTarget.value })}
              placeholder="或直接填媒体 URL"
              disabled={running}
            />
            <button
              className="pn-run clone-run"
              disabled={running}
              onClick={() =>
                (file || urlDraft.trim()) &&
                runMaterial(id, {
                  file, fileUrl: urlDraft, assetType, isRealPerson: isReal,
                  name: nameDraft, groupId: groupDraft,
                })
              }
            >
              <ThunderboltOutlined />
              {running ? '登记中' : '登记'}
            </button>
            {failed && <div className="pn-error">{runState[id]?.error || '登记失败'}</div>}
            <input
              ref={fileRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                e.currentTarget.value = '';
              }}
            />
          </>
        )}
        </div>
      </div>
      <div className="floating-node-actions">
        <button className="mini-x nodrag" title="删除节点" onClick={() => deleteNode(id)}>
          <CloseOutlined />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { image: ImageNode, prompt: PromptNode, clone: CloneNode, live: LiveNode, material: MaterialNode };

const CREATE_CARDS: { type: string; label: string; sub: string; icon: JSX.Element }[] = [
  { type: 'image', label: '上传', sub: '导入图片,或作为文生图/改图的落点', icon: <PictureOutlined /> },
  { type: 'prompt', label: '提示词', sub: '手写文本 / AI 扩写,连到生成节点当 prompt', icon: <EditOutlined /> },
  { type: 'clone', label: '音色克隆', sub: '样本音频→voice_id,下游 TTS 自动复用', icon: <CustomerServiceOutlined /> },
  { type: 'live', label: '数字人直播', sub: '拼头像/人设/音色,浮层里实时直播', icon: <VideoCameraOutlined /> },
  { type: 'material', label: '素材登记', sub: '上传媒体→Tencent AssetId(可真人)', icon: <AppstoreOutlined /> },
];

// smart-pill + smart-popover 参数控件(纯 CSS hover 展开,对齐参考 smart-canvas 的 .smart-control)
function PillSelect({
  icon,
  typeLabel,
  value,
  options,
  onChange,
}: {
  icon: JSX.Element;
  typeLabel: string;
  value?: string;
  options: ModelOpt[];
  onChange: (v: string) => void;
}) {
  const cur = options.find((o) => o.value === value);
  // 短标签(尺寸比例/语气/清晰度…)用网格分段;长标签(模型/音色)用竖排列表
  const seg = options.length <= 9 && options.every((o) => (o.label || '').length <= 4);
  return (
    <div className="smart-control">
      <button className="smart-pill size-picker-pill" type="button">
        {icon}
        <span className="size-picker-label">
          <span className="size-picker-type">{typeLabel}</span>
          <span className="size-picker-dot" />
          <span className="size-picker-value">{cur?.label ?? '默认'}</span>
        </span>
      </button>
      <div className="smart-popover">
        <div className="smart-popover-title">{typeLabel}</div>
        {seg ? (
          <div className="seg-row">
            {options.map((o) => (
              <button key={o.value} type="button" className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="model-list">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`direct-option ${o.value === value ? 'active' : ''}`}
                onClick={() => onChange(o.value)}
              >
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CountPill({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="smart-control">
      <button className="smart-pill" type="button">
        <CopyOutlined />
        <span>{value} 张</span>
      </button>
      <div className="smart-popover compact-popover">
        <div className="smart-popover-title">数量</div>
        <div className="count-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((nn) => (
            <button key={nn} type="button" className={`count-cell ${nn === value ? 'active' : ''}`} onClick={() => onChange(nn)}>
              {nn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const STYLE_PRESETS = ['绘铅', '油画', '水彩', '3D 渲染', '赛博朋克', '写实摄影', '动漫', '极简线稿'];

// ============ composer 生成栏(独立组件,useViewport 跟随选中节点,不随视口重渲染整棵画布) ============
function Composer({
  anchor,
  modelsByType,
  running,
  derivedRefs,
  derivedAudio,
  derivedVideo,
  upstreamPrompt,
  onPatch,
  onRun,
  onAddRef,
}: {
  anchor: RFNode | null;
  modelsByType: ModelsByType;
  running: boolean;
  derivedRefs: string[];
  derivedAudio: string[];
  derivedVideo: string[];
  upstreamPrompt: string;
  onPatch: (patch: Record<string, unknown>) => void;
  onRun: () => void;
  onAddRef: (file: File) => void;
}) {
  const vp = useViewport();
  const refInput = useRef<HTMLInputElement>(null);
  const promptSelection = useRef({ start: 0, end: 0 });
  if (!anchor) return <div className="composer" />;

  const d = anchor.data || {};
  const cap = capById(d.kind); // 当前能力(注册表驱动)
  const models = modelsForCap(cap, modelsByType);
  const w = anchor.width || 240;
  const h = anchor.height || 160;
  const left = anchor.position.x * vp.zoom + vp.x + (w * vp.zoom) / 2 - COMPOSER_W / 2;
  const top = (anchor.position.y + h) * vp.zoom + vp.y + 14;

  const manualRefs: string[] = d.refs || [];
  const paramDefs = cap.params(d, models);
  const n: number = d.count || 1;
  const noThumbs = derivedRefs.length + manualRefs.length === 0;
  const emotionRanges = (d.emotionRanges || []) as EmotionRange[];
  const emotionChunks = cap.id === 'audio' && emotionRanges.length ? buildEmotionChunks(d.prompt || '', emotionRanges) : [];

  return (
    <div className="composer open" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="composer-card">
        <div className="composer-head">
          <div className="composer-head-left">
            <div className="kind-toggle">
              {CAPABILITIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cap.id === c.id ? 'active' : ''}
                  onClick={() => onPatch(capDefault(c, modelsForCap(c, modelsByType)))}
                >
                  {c.icon}
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
          <span className="composer-head-hint">模桥</span>
        </div>

        {cap.usesRefs && (
          <div className="input-thumbs-row has-items">
            <div className={`input-thumb-list${noThumbs ? ' empty' : ''}`}>
              {derivedRefs.map((u, i) => (
                <div className="input-thumb input-self" key={`d${i}`} title="来自节点自身 / 上游">
                  <img src={u} alt="" />
                </div>
              ))}
              {manualRefs.map((u, i) => (
                <div className="input-thumb" key={`m${i}`}>
                  <img src={u} alt="" />
                  <button
                    className="input-thumb-remove"
                    title="移除参考图"
                    onClick={() => onPatch({ refs: manualRefs.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              {noThumbs && (
                <span className="input-thumb-count">
                  {derivedVideo.length
                    ? '已使用参考视频，可继续添加图片参考'
                    : cap.refsHint || (cap.output === 'video' ? '连接/加图片作首帧(可空,纯文生视频)' : '连接素材或点右侧＋加参考图')}
                </span>
              )}
            </div>
            <div className="input-thumb-actions">
              <button className="input-thumb-add" title="添加参考图" onClick={() => refInput.current?.click()}>
                <PlusOutlined />
              </button>
            </div>
            <input
              ref={refInput}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAddRef(f);
                e.currentTarget.value = '';
              }}
            />
          </div>
        )}

        {(cap.usesAudio || derivedAudio.length > 0) && (
          <div className={`audio-input-row${derivedAudio.length ? ' has-audio' : ''}`}>
            <CustomerServiceOutlined />
            <span>
              {derivedAudio.length
                ? `已连接${cap.usesAudio ? '驱动' : '参考'}音频 ×${derivedAudio.length}`
                : cap.audioHint || '上游连一个音频/TTS 节点作驱动音频'}
            </span>
          </div>
        )}

        {derivedVideo.length > 0 && (
          <div className="audio-input-row video-reference-row has-audio">
            <VideoCameraOutlined />
            <span>已连接参考视频 ×{derivedVideo.length}</span>
          </div>
        )}

        {upstreamPrompt && (
          <div className="input-prompt-preview has-text">
            <span className="input-prompt-preview-label">上游提示词</span>
            <span className="input-prompt-preview-text">{upstreamPrompt}</span>
          </div>
        )}

        {cap.usesPrompt !== false && (
        <div className="prompt-row">
          <textarea
            className="prompt-input"
            value={d.prompt || ''}
            onChange={(e) => onPatch({ prompt: e.target.value, ...(cap.id === 'audio' ? { emotionRanges: [] } : {}) })}
            onSelect={(e) => {
              promptSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
            }}
            placeholder={cap.promptPlaceholder}
          />
          {cap.stylePresets && (
            <div className="smart-control composer-template">
              <button className="composer-template-btn" type="button" title="风格预设">
                <BulbOutlined />
              </button>
              <div className="smart-popover template-popover">
                <div className="smart-popover-title">风格预设(追加到提示词)</div>
                <div className="template-grid">
                  {STYLE_PRESETS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onPatch({ prompt: (d.prompt ? `${d.prompt}，` : '') + `${s}风格` })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {emotionChunks.length > 0 && (
          <div className="emotion-preview" aria-label="分段语气预览">
            {emotionChunks.map((chunk, i) => (
              <span key={`${i}-${chunk.emotion}`} className={chunk.emotion ? 'tagged' : ''} title={chunk.emotion || undefined}>
                {chunk.text}
              </span>
            ))}
          </div>
        )}

        <div className="param-row">
          <div className="dynamic-params">
            <PillSelect
              icon={<AppstoreOutlined />}
              typeLabel="模型"
              value={d.model}
              options={models}
              onChange={(v) => onPatch(cap.onModelChange(v, models))}
            />
            {paramDefs.map((p) => (
              <PillSelect
                key={p.field}
                icon={p.icon}
                typeLabel={p.label}
                value={(d as Record<string, string>)[p.field] ?? p.def}
                options={p.opts}
                onChange={(v) => {
                  if (cap.id === 'audio' && p.field === 'emotion' && promptSelection.current.start < promptSelection.current.end) {
                    onPatch({
                      emotionRanges: addEmotionRange(
                        emotionRanges,
                        promptSelection.current.start,
                        promptSelection.current.end,
                        v,
                        Date.now(),
                      ),
                    });
                    return;
                  }
                  onPatch({ [p.field]: v });
                }}
              />
            ))}
            {cap.showCount && <CountPill value={n} onChange={(v) => onPatch({ count: v })} />}
          </div>
        </div>

        <div className="composer-actions">
          <button className="run-btn" disabled={running} onClick={onRun}>
            <ThunderboltOutlined />
            {running ? '生成中' : '运行'}
          </button>
        </div>
      </div>
    </div>
  );
}

type DocMeta = { id: number; title: string; icon: string };
type MenuState = { x: number; y: number; source?: string | null };

function CanvasInner() {
  const { apiKey } = usePlaygroundApiKey();
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [modelsByType, setModelsByType] = useState<ModelsByType>({});
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [docId, setDocId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [runState, setRunState] = useState<Record<string, RunInfo>>({});
  const [saveHint, setSaveHint] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [preview, setPreview] = useState<{ images: string[]; index: number } | null>(null);
  const [liveSeed, setLiveSeed] = useState<DhLiveSeed | null>(null);
  const [liveVoices, setLiveVoices] = useState<LiveVoice[]>([]);
  const [loadTick, setLoadTick] = useState(0); // 文档载入完成计数,触发续轮询扫描
  const [isFullscreen, setIsFullscreen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(true);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const connectingRef = useRef<string | null>(null);
  const pollRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(
    () => () => {
      Object.values(pollRef.current).forEach((t) => clearTimeout(t));
    },
    [],
  );

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch (err: any) {
      message.error(`无法切换全屏:${err?.message || String(err)}`);
    }
  }, []);

  const authFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(apiURL(path), {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, ...(init?.headers || {}) },
      }),
    [apiKey],
  );

  useEffect(() => {
    systemApi.models().then((res) => {
      const all = ((res.data as any[]) || []).filter((m) => m.enabled !== false);
      // 按 type 分组成 ModelInfo(带 provider_type,供音频 voice/emotion 推断);能力表按 modelType 取用
      const byType: ModelsByType = {};
      for (const m of all) {
        const type = String(m.type || '').toLowerCase();
        (byType[type] = byType[type] || []).push({
          value: m.name,
          label: m.display_name || m.name,
          providerType: m.provider_type,
        });
      }
      setModelsByType(byType);
    });
  }, []);

  // 直播音色列表(系统 + 自定义克隆),供「直播台节点」音色下拉
  useEffect(() => {
    if (!apiKey) return;
    authFetch('/v1/live/voices')
      .then((r) => r.json())
      .then((j) => setLiveVoices((j?.data as LiveVoice[]) || []))
      .catch(() => setLiveVoices([]));
  }, [apiKey, authFetch]);

  const loadList = useCallback(async () => {
    const r = await authFetch('/v1/canvas/documents');
    const j = await r.json();
    const list: DocMeta[] = j?.data?.documents || [];
    setDocs(list);
    return list;
  }, [authFetch]);

  const openDoc = useCallback(
    async (id: number) => {
      loadingRef.current = true;
      Object.values(pollRef.current).forEach((t) => clearTimeout(t));
      pollRef.current = {};
      const r = await authFetch(`/v1/canvas/documents/${id}`);
      const j = await r.json();
      const row = j?.data || {};
      const g = row.graph || {};
      // 兼容旧文档:丢弃已废弃的 generator/output 节点及其边
      const loadedNodes = (g.nodes || []).filter((nd: RFNode) => KNOWN_TYPES.has(nd.type || ''));
      const keep = new Set(loadedNodes.map((nd: RFNode) => nd.id));
      const loadedEdges = (g.edges || []).filter((e: any) => keep.has(e.source) && keep.has(e.target));
      // 回填:生成产生的结果节点(flow 边落点)补上 isResult/genKind/genPrompt,
      // 让旧文档的结果节点也显示能力/提示词标注,且结果缺失时不退化成上传空框。
      // genKind 优先从实际产物类型反推(旧节点的 data.kind 可能被 composer 切换污染)。
      const inferGenKind = (d: any): string =>
        d?.genKind || (d?.videoUrl ? 'video' : d?.audioUrl ? 'audio' : d?.model3dUrl ? '3d' : d?.images?.length ? 'image' : d?.kind || 'image');
      const flowTargets = new Set(loadedEdges.filter((e: any) => e.data?.kind === 'flow').map((e: any) => e.target));
      const markedNodes = loadedNodes.map((nd: RFNode) =>
        flowTargets.has(nd.id) && !nd.data?.isResult
          ? {
              ...nd,
              data: {
                ...nd.data,
                isResult: true,
                genKind: inferGenKind(nd.data),
                genPrompt: nd.data?.genPrompt || nd.data?.prompt || '',
              },
            }
          : nd,
      );
      setNodes(markedNodes);
      setEdges(loadedEdges);
      setTitle(row.title || '');
      setDocId(id);
      setRunState({});
      setTimeout(() => {
        if (g.viewport) rf.setViewport(g.viewport);
        else rf.fitView({ padding: 0.2 });
        loadingRef.current = false;
        setLoadTick((n) => n + 1); // 触发续轮询 effect(loadingRef 是 ref,置回不会自动重跑)
      }, 60);
    },
    [authFetch, setNodes, setEdges, rf],
  );

  const createDoc = useCallback(async () => {
    const r = await authFetch('/v1/canvas/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '未命名画布', icon: '🎨', graph: { nodes: [], edges: [] } }),
    });
    const j = await r.json();
    const id = j?.data?.id;
    await loadList();
    if (id) await openDoc(id);
  }, [authFetch, loadList, openDoc]);

  useEffect(() => {
    if (!apiKey) return;
    (async () => {
      const list = await loadList();
      if (list.length) await openDoc(list[0].id);
      else await createDoc();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // 自动保存(nodes/edges/viewport + title)
  useEffect(() => {
    if (loadingRef.current || !docId) return undefined;
    const t = setTimeout(async () => {
      setSaveHint('保存中…');
      try {
        await authFetch(`/v1/canvas/documents/${docId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            graph: { nodes: nodesRef.current, edges: edgesRef.current, viewport: rf.getViewport() },
          }),
        });
        setSaveHint('已保存');
      } catch {
        setSaveHint('保存失败');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, title, docId, authFetch, rf]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);
  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      setNodes((nds) => nds.map((nd) => (nd.id === id ? { ...nd, data: { ...nd.data, ...patch } } : nd))),
    [setNodes],
  );
  const selectNode = useCallback(
    (id: string) => setNodes((nds) => nds.map((nd) => ({ ...nd, selected: nd.id === id }))),
    [setNodes],
  );
  const deleteNode = useCallback(
    (id: string) => {
      if (pollRef.current[id]) {
        clearTimeout(pollRef.current[id]);
        delete pollRef.current[id];
      }
      setNodes((nds) => nds.filter((nd) => nd.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setRunState((r) => {
        const { [id]: _drop, ...rest } = r;
        return rest;
      });
    },
    [setNodes, setEdges],
  );

  const rename = useCallback(
    (v: string) => {
      setTitle(v);
      if (docId) setDocs((ds) => ds.map((d) => (d.id === docId ? { ...d, title: v } : d)));
    },
    [docId],
  );

  // 新建节点(可选连线),新节点自动独占选中 → composer 立即浮现
  const spawnNode = useCallback(
    (type: string, screenX: number, screenY: number, source: string | null) => {
      const pos = rf.screenToFlowPosition({ x: screenX, y: screenY });
      const id = `${type}_${Date.now().toString(36)}`;
      const data =
        type === 'image'
          ? { images: [], prompt: '', ...capDefault(capById('image'), modelsForCap(capById('image'), modelsByType)) }
          : type === 'clone'
          ? { provider: 'minimax', name: '', demoText: '', language: 'zh', voiceIdInput: '', description: '', cloneStatus: '' }
          : type === 'live'
          ? { persona: '', callMode: 'video', avatarName: '', channelName: '' }
          : type === 'material'
          ? { assetType: 'Image', isRealPerson: false, name: '', fileUrl: '', groupId: '', matStatus: '' }
          : { text: '' };
      setNodes((nds) =>
        nds.map((nd) => ({ ...nd, selected: false })).concat({ id, type, position: pos, data, selected: true }),
      );
      if (source) setEdges((eds) => addEdge({ source, target: id } as Connection, eds));
    },
    [rf, modelsByType, setNodes, setEdges],
  );

  const addNodeCenter = useCallback(
    (type: string) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const off = (nodesRef.current.length % 6) * 26;
      spawnNode(type, rect.left + rect.width / 2 + off, rect.top + rect.height / 3 + off, null);
    },
    [spawnNode],
  );

  const uploadAsset = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await authFetch(`/v1/canvas/documents/${docId || 0}/assets`, { method: 'POST', body: fd });
        const j = await r.json();
        return j?.data?.url || null;
      } catch {
        message.error('上传失败');
        return null;
      }
    },
    [authFetch, docId],
  );

  // composer 手动加参考图:上传后追加到锚节点 data.refs
  const addAnchorRef = useCallback(
    async (anchorId: string, file: File) => {
      const url = await uploadAsset(file);
      if (!url) return;
      const cur = (nodesRef.current.find((nd) => nd.id === anchorId)?.data?.refs as string[]) || [];
      updateNodeData(anchorId, { refs: [...cur, url] });
    },
    [uploadAsset, updateNodeData],
  );

  // 参考图 = 节点自身图 + 上游已登记素材/普通 image 节点图(去重)。
  // 已登记素材优先，避免后接的普通图片抢占 first_frame_image。
  const refThumbsFor = useCallback((nodeId: string): string[] => {
    const self = nodesRef.current.find((nd) => nd.id === nodeId);
    const own: string[] = self?.data?.images || [];
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    const registered: string[] = [];
    const up: string[] = [];
    for (const nd of nodesRef.current) {
      if (upIds.includes(nd.id) && nd.type === 'material' && nd.data?.srcUrl && nd.data?.assetType === 'Image') {
        registered.push(String(nd.data.srcUrl));
      }
      if (upIds.includes(nd.id) && nd.type === 'image' && Array.isArray(nd.data?.images)) up.push(...nd.data.images);
    }
    const cap = capById(self?.data?.kind);
    // 多输入能力(换装/多帧/模板/成片):自身 + 上游 合并;
    // 单主体能力(图片/视频/特效/3D/数智人):有自身图就只用自身,否则回退上游 —— 不把祖先图也当参考
    if (cap.combineRefs) return Array.from(new Set([...own, ...registered, ...up]));
    return own.length ? Array.from(new Set(own)) : Array.from(new Set([...registered, ...up]));
  }, []);

  // 腾讯云图等支持统一多媒体参考的 provider 使用完整 file_infos；素材登记节点的
  // AssetId 必须以 asset:// 传递，不能退化成普通图片 URL，否则真人素材身份会丢失。
  const fileInfosFor = useCallback((nodeId: string): Record<string, string>[] => {
    const upIds = new Set(edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source));
    const infos: Record<string, string>[] = [];
    let hasFirstFrame = false;
    // 第一遍固定收登记素材，优先级不受节点创建顺序影响。
    for (const nd of nodesRef.current) {
      if (!upIds.has(nd.id) || nd.type !== 'material' || !nd.data?.assetId) continue;
      const category = String(nd.data.assetType || 'Image');
      const assetId = String(nd.data.assetId);
      infos.push({
        Type: 'Url', Category: category, Url: assetId.startsWith('asset://') ? assetId : `asset://${assetId}`,
        Usage: category === 'Image' && !hasFirstFrame ? 'FirstFrame' : 'Reference',
      });
      if (category === 'Image') hasFirstFrame = true;
    }
    // 第二遍收节点自身和普通上游媒体；已登记素材已占首帧时，普通图片只作 Reference。
    // 自身媒体很重要：选中一个已有视频结果再次运行，就是视频生视频。
    for (const nd of nodesRef.current) {
      if ((nd.id !== nodeId && !upIds.has(nd.id)) || nd.type === 'material') continue;
      if (nd.type === 'image' && Array.isArray(nd.data?.images)) {
        for (const url of nd.data.images) {
          infos.push({ Type: 'Url', Category: 'Image', Url: String(url), Usage: hasFirstFrame ? 'Reference' : 'FirstFrame' });
          hasFirstFrame = true;
        }
      }
      if (nd.data?.audioUrl) infos.push({ Type: 'Url', Category: 'Audio', Url: String(nd.data.audioUrl), Usage: 'Reference' });
      if (nd.data?.videoUrl) infos.push({ Type: 'Url', Category: 'Video', Url: String(nd.data.videoUrl), Usage: 'Reference' });
    }
    return infos;
  }, []);

  const upstreamPrompt = useCallback((nodeId: string): string => {
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    return nodesRef.current
      .filter((nd) => upIds.includes(nd.id) && nd.type === 'prompt')
      .map((nd) => nd.data?.text)
      .filter(Boolean)
      .join('\n')
      .trim();
  }, []);

  // 驱动音频 = 节点自身 audioUrl + 上游节点 audioUrl(数智人用:上游接一个音频/TTS 节点)
  const audioRefsFor = useCallback((nodeId: string): string[] => {
    const self = nodesRef.current.find((nd) => nd.id === nodeId);
    const own: string[] = self?.data?.audioUrl ? [self.data.audioUrl] : [];
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    const up: string[] = [];
    for (const nd of nodesRef.current) {
      if (upIds.includes(nd.id) && nd.data?.audioUrl) up.push(nd.data.audioUrl);
    }
    return Array.from(new Set([...own, ...up]));
  }, []);

  // 参考视频 = 节点自身 videoUrl + 上游视频结果。是否能消费由模型
  // supports_reference_video 能力和 provider 在后端共同校验。
  const videoRefsFor = useCallback((nodeId: string): string[] => {
    const self = nodesRef.current.find((nd) => nd.id === nodeId);
    const own: string[] = self?.data?.videoUrl ? [String(self.data.videoUrl)] : [];
    const upIds = new Set(edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source));
    const up = nodesRef.current
      .filter((nd) => upIds.has(nd.id) && nd.data?.videoUrl)
      .map((nd) => String(nd.data.videoUrl));
    return Array.from(new Set([...own, ...up]));
  }, []);

  // 上游音色克隆节点的 voice_id(TTS 节点自动复用克隆音色);取最近一个 ready 的
  const cloneVoiceFor = useCallback((nodeId: string): string => {
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    for (const nd of nodesRef.current) {
      if (upIds.includes(nd.id) && nd.type === 'clone' && nd.data?.voiceId) return String(nd.data.voiceId);
    }
    return '';
  }, []);

  // 置失败态并弹 toast —— 失败原因要能立刻看到,别只藏在节点角标 tooltip 里
  const markFailed = useCallback((targetId: string, msg: string) => {
    setRunState((s) => ({ ...s, [targetId]: { status: 'failed', error: msg } }));
    message.error({ content: '生成失败:' + msg, duration: 8 });
    // eslint-disable-next-line no-console
    console.error('[canvas] 生成失败', targetId, msg);
  }, []);

  const clearRun = useCallback((targetId: string) => {
    setRunState((s) => {
      const { [targetId]: _drop, ...rest } = s;
      return rest;
    });
  }, []);

  // LLM 变换节点:把节点文本(含上游文本)按模式送 /v1/chat/completions,结果回填 text
  const runLLM = useCallback(
    async (id: string, model: string, mode: string) => {
      const node = nodesRef.current.find((nd) => nd.id === id);
      if (!node) return;
      const src = [upstreamPrompt(id), node.data?.text].filter(Boolean).join('\n').trim();
      if (!src) return void message.warning('先写点文本或连上游文本');
      if (!model) return void message.warning('没有可用的对话模型');
      setRunState((s) => ({ ...s, [id]: { status: 'running', startedAt: Date.now() } }));
      try {
        const r = await authFetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: 'system', content: llmModeSystem(mode) },
              { role: 'user', content: src },
            ],
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
        const out = String(j?.choices?.[0]?.message?.content || '').trim();
        if (!out) throw new Error('模型未返回内容');
        updateNodeData(id, { text: out });
        clearRun(id);
      } catch (e: any) {
        markFailed(id, e?.message || String(e));
      }
    },
    [authFetch, upstreamPrompt, updateNodeData, markFailed, clearRun],
  );

  // 音色克隆:multipart 提交样本 → 轮询到 ready(vidu/minimax 可能即时返回)→ 存 voice_id + 试听音频
  const runClone = useCallback(
    async (id: string, args: CloneArgs) => {
      if (!args.file) return void message.warning('先选一段音频样本');
      if (!args.name.trim()) return void message.warning('填个音色名称');
      setRunState((s) => ({ ...s, [id]: { status: 'running', startedAt: Date.now() } }));
      updateNodeData(id, { cloneStatus: 'submitting', provider: args.provider });
      const applyReady = (row: any) => {
        updateNodeData(id, {
          voiceId: row.voice_id, demoAudioUrl: row.demo_audio_url, cloneStatus: 'ready', provider: row.provider_type || args.provider,
        });
        clearRun(id);
      };
      try {
        const fd = new FormData();
        fd.append('provider_type', args.provider);
        fd.append('name', args.name.trim());
        if (args.description.trim()) fd.append('description', args.description.trim());
        if (args.voiceId.trim()) fd.append('voice_id', args.voiceId.trim());
        if (args.language.trim()) fd.append('language', args.language.trim());
        if (args.demoText.trim()) fd.append('text', args.demoText.trim());
        fd.append('file', args.file);
        const r = await authFetch('/v1/audio/voice_clones', { method: 'POST', body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
        const rec = j?.data || j;
        if (rec.status === 'ready') return applyReady(rec);
        updateNodeData(id, { cloneStatus: 'training' });
        const tick = async () => {
          try {
            const rr = await authFetch(`/v1/audio/voice_clones/${rec.id}?refresh=true`);
            const jj = await rr.json();
            const row = jj?.data || jj;
            if (row.status === 'queued' || row.status === 'training') {
              pollRef.current[id] = setTimeout(tick, 3000);
              return;
            }
            delete pollRef.current[id];
            if (row.status === 'ready') applyReady(row);
            else markFailed(id, row.error_msg || `克隆${row.status}`);
          } catch (e: any) {
            delete pollRef.current[id];
            markFailed(id, e?.message || String(e));
          }
        };
        pollRef.current[id] = setTimeout(tick, 3000);
      } catch (e: any) {
        markFailed(id, e?.message || String(e));
      }
    },
    [authFetch, updateNodeData, markFailed, clearRun],
  );

  // 直播台节点:从画布收齐 头像/人设/音色,预填进浮层里的 DigitalHumanLivePanel 直接开播
  const openLive = useCallback(
    (id: string) => {
      const node = nodesRef.current.find((nd) => nd.id === id);
      const imageUri = refThumbsFor(id)[0] || '';
      // 上游克隆音色优先,其次节点手选的系统音色
      const voice = cloneVoiceFor(id) || String(node?.data?.voice || '');
      const persona = [String(node?.data?.persona || '').trim(), upstreamPrompt(id)].filter(Boolean).join('\n').trim();
      setLiveSeed({
        persona, imageUri, voice,
        avatarName: String(node?.data?.avatarName || ''),
        callMode: node?.data?.callMode === 'audio' ? 'audio' : 'video',
        channelName: String(node?.data?.channelName || ''),
      });
    },
    [refThumbsFor, cloneVoiceFor, upstreamPrompt],
  );

  // 素材登记:上传媒体拿 file_url → POST /v1/aigc/materials → 轮询 ready 出 upstream_asset_id
  const runMaterial = useCallback(
    async (id: string, args: MaterialArgs) => {
      const manualUrl = args.fileUrl.trim();
      if (!args.file && !manualUrl) return void message.warning('先选媒体文件或填 URL');
      if (args.isRealPerson && !args.groupId) return void message.warning('真人素材需先过活体检测(或填 group_id)');
      setRunState((s) => ({ ...s, [id]: { status: 'running', startedAt: Date.now() } }));
      updateNodeData(id, { matStatus: manualUrl ? 'registering' : 'uploading' });
      try {
        // 传了文件就上传拿 URL,否则直接用手填的 URL
        const fileUrl = manualUrl || (await playgroundUpload(args.file as File, apiKey, { module: 'aigc_material' }))?.url;
        if (!fileUrl) throw new Error('上传失败');
        updateNodeData(id, { srcUrl: fileUrl, matStatus: 'registering' });
        const r = await authFetch('/v1/aigc/materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_real_person: args.isRealPerson, group_id: args.groupId || '', asset_type: args.assetType,
            file_url: fileUrl, asset_name: args.name.trim() || args.assetType,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
        const rec = j?.data || j;
        const ready = (row: any) => {
          updateNodeData(id, { assetId: row.upstream_asset_id, matStatus: 'ready' });
          clearRun(id);
        };
        if (rec.status === 'ready' && rec.upstream_asset_id) return ready(rec);
        const tick = async () => {
          try {
            const rr = await authFetch(`/v1/aigc/materials/${rec.id}?refresh=true`);
            const jj = await rr.json();
            const row = jj?.data || jj;
            if (row.status === 'queued' || row.status === 'processing') {
              pollRef.current[id] = setTimeout(tick, 3000);
              return;
            }
            delete pollRef.current[id];
            if (row.status === 'ready') ready(row);
            else markFailed(id, row.error_msg || `登记${row.status}`);
          } catch (e: any) {
            delete pollRef.current[id];
            markFailed(id, e?.message || String(e));
          }
        };
        pollRef.current[id] = setTimeout(tick, 3000);
      } catch (e: any) {
        markFailed(id, e?.message || String(e));
      }
    },
    [apiKey, authFetch, updateNodeData, markFailed, clearRun],
  );

  // 活体检测:开 H5 链接,轮询到 done 回填 group_id(真人素材前置)
  const startLiveness = useCallback(
    async (id: string) => {
      try {
        const r = await authFetch('/v1/aigc/liveness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
        const liv = j?.data || j;
        if (liv.h5_link) window.open(liv.h5_link, '_blank', 'noopener');
        else throw new Error('未返回活体检测链接');
        message.info('已打开活体检测页,完成后自动回填');
        const tick = async () => {
          try {
            const rr = await authFetch(`/v1/aigc/liveness/${liv.id}`);
            const jj = await rr.json();
            const row = jj?.data || jj;
            if (row.status === 'pending') {
              pollRef.current[`liveness_${id}`] = setTimeout(tick, 3000);
              return;
            }
            delete pollRef.current[`liveness_${id}`];
            if (row.status === 'done' && row.group_id) {
              updateNodeData(id, { groupId: row.group_id, isRealPerson: true });
              message.success('活体检测通过');
            } else message.error('活体检测未通过');
          } catch {
            delete pollRef.current[`liveness_${id}`];
          }
        };
        pollRef.current[`liveness_${id}`] = setTimeout(tick, 3000);
      } catch (e: any) {
        message.error('活体检测发起失败:' + (e?.message || String(e)));
      }
    },
    [authFetch, updateNodeData],
  );

  // 通用异步轮询:轮 fetchPath,succeeded 交给 onSucceed,其它置失败
  // 通用异步轮询:轮 fetchPath,succeeded 交给 onSucceed;终态清掉节点上的 pendingTask(续轮询标记)。
  // 瞬时网络/网关错误重试若干次而非立刻判死 —— 长视频任务(几十分钟)最怕被一次抖动误杀。
  const pollTask = useCallback(
    (targetId: string, fetchPath: string, onSucceed: (t: any) => void) => {
      let errs = 0;
      const tick = async () => {
        try {
          const r = await authFetch(fetchPath);
          const t = await r.json();
          if (!r.ok) throw new Error(t?.error?.message || `HTTP ${r.status}`);
          errs = 0;
          if (t.status === 'queued' || t.status === 'running') {
            pollRef.current[targetId] = setTimeout(tick, 2500);
            return;
          }
          delete pollRef.current[targetId];
          updateNodeData(targetId, { pendingTask: null });
          if (t.status === 'succeeded') onSucceed(t);
          else markFailed(targetId, t?.error?.message || `任务${t.status}`);
        } catch (e: any) {
          errs += 1;
          if (errs <= 6) {
            pollRef.current[targetId] = setTimeout(tick, 4000);
            return;
          }
          delete pollRef.current[targetId];
          updateNodeData(targetId, { pendingTask: null });
          markFailed(targetId, e?.message || String(e));
        }
      };
      pollRef.current[targetId] = setTimeout(tick, 1500);
    },
    [authFetch, markFailed, updateNodeData],
  );

  const runGenerator = useCallback(
    async (anchorId: string) => {
      const node = nodesRef.current.find((nd) => nd.id === anchorId);
      if (!node) return;
      const cap = capById(node.data?.kind); // 能力表驱动:输入校验 / 请求 / 落点全走 cap
      const model = node.data?.model;
      if (!model) {
        message.warning('先选一个模型');
        return;
      }
      const inheritedPrompt = upstreamPrompt(anchorId).trim();
      const ownPrompt = String(node.data?.prompt || '').trim();
      const prompt = [inheritedPrompt, ownPrompt].filter(Boolean).join('\n');
      const refs = cap.usesRefs
        ? Array.from(new Set([...refThumbsFor(anchorId), ...((node.data?.refs as string[]) || [])]))
        : [];
      const audio = cap.usesAudio || cap.output === 'video' ? audioRefsFor(anchorId) : [];
      // 音频节点若上游连了音色克隆节点,自动用克隆出的 voice_id(覆盖手选音色)
      const cloneVoice = cap.output === 'audio' ? cloneVoiceFor(anchorId) : '';
      let data = cloneVoice ? { ...node.data, voice: cloneVoice } : node.data || {};
      // textarea 选区基于本节点文本；若前面拼了上游提示词，提交前平移语气区间。
      if (cap.id === 'audio' && inheritedPrompt && Array.isArray(data.emotionRanges)) {
        const offset = inheritedPrompt.length + 1;
        data = {
          ...data,
          emotionRanges: (data.emotionRanges as EmotionRange[]).map((range) => ({
            ...range,
            start: range.start + offset,
            end: range.end + offset,
          })),
        };
      }

      const err = cap.validate({ prompt, refs, audio, data });
      if (err) return void message.warning(err);

      if (cap.output === 'video' && /doubao-seedance-2-0/i.test(model) && audio.length > 0) {
        const durations = await Promise.all(audio.map(audioDurationSeconds));
        const tooShort = durations.findIndex((seconds) => seconds != null && seconds < 1.8);
        if (tooShort >= 0) {
          message.warning(
            `Seedance 2.0 的参考音频至少需要 1.8 秒；第 ${tooShort + 1} 条只有 ${durations[tooShort]!.toFixed(2)} 秒，请换用或生成更长音频。`,
          );
          return;
        }
      }

      const req = cap.request({ model, prompt, refs, audio, data });
      const fileInfos = cap.output === 'video' ? fileInfosFor(anchorId) : [];
      if (fileInfos.length > 0) {
        // Seedance 等上游禁止 FirstFrame/LastFrame 与 Reference media 混用。
        // 单图保持首帧驱动；多图或带音视频时统一切到纯 Reference 模式。
        const referenceMode = fileInfos.length > 1 || fileInfos.some((info) => info.Category !== 'Image');
        if (referenceMode) {
          req.body.file_infos = fileInfos.map((info) => ({ ...info, Usage: 'Reference' }));
          delete req.body.first_frame_image;
          delete req.body.last_frame_image;
        } else {
          req.body.file_infos = fileInfos;
        }
      }

      // 落点:节点已有产出 → 右侧新建节点承接(带上生成设置,清空输出);否则就地
      const hasOwn =
        (node.data?.images || []).length > 0 || !!node.data?.videoUrl || !!node.data?.audioUrl || !!node.data?.model3dUrl;
      let targetId = anchorId;
      if (hasOwn) {
        targetId = `${cap.id}_${Date.now().toString(36)}`;
        setNodes((nds) =>
          nds
            .map((nd) => ({ ...nd, selected: false }))
            .concat({
              id: targetId,
              type: 'image',
              position: { x: node.position.x + 320, y: node.position.y },
              // 结果节点:清空产出,标记 isResult + 记下生成时能力/提示词(供节点标注 / 区分上传节点;
              // genKind 固定为生成那一刻的能力,不随后续 composer 切换改变)
              data: {
                ...node.data, images: [], videoUrl: undefined, audioUrl: undefined, model3dUrl: undefined,
                refs: [], isResult: true, genKind: cap.id, genPrompt: prompt, pendingTask: undefined,
              },
              selected: true,
            }),
        );
        setEdges((eds) =>
          addEdge({ id: `flow_${targetId}`, source: anchorId, target: targetId, data: { kind: 'flow' } } as RFEdge, eds),
        );
      } else {
        // 就地生成:把这个空节点本身转成结果节点(标注生成时能力/提示词)
        updateNodeData(targetId, { isResult: true, genKind: cap.id, genPrompt: prompt });
      }

      if (pollRef.current[targetId]) clearTimeout(pollRef.current[targetId]);
      setRunState((s) => ({ ...s, [targetId]: { status: 'running', startedAt: Date.now() } }));

      try {
        if (req.transport === 'segmentedAudio') {
          const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
          const audioContext: AudioContext = new AudioContextCtor();
          try {
            const buffers: AudioBuffer[] = [];
            for (let i = 0; i < req.chunks.length; i++) {
              const chunk = req.chunks[i];
              const body = {
                ...req.body,
                input: chunk.text,
                response_format: 'wav',
                ...(chunk.emotion ? { emotion_category: chunk.emotion } : {}),
              };
              const r = await authFetch(req.path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              if (!r.ok) {
                const j = await r.json().catch(() => ({}) as any);
                throw new Error(`第 ${i + 1} 段生成失败: ${j?.error?.message || `HTTP ${r.status}`}`);
              }
              buffers.push(await decodeToBuffer(audioContext, await r.blob()));
            }
            const blob = encodeWAV(mergeAudioBuffers(audioContext, buffers, SEG_GAP_MS));
            const url = await uploadAsset(new File([blob], req.filename, { type: 'audio/wav' }));
            if (!url) throw new Error('分段语音结果保存失败');
            updateNodeData(targetId, applyOutput(cap.output, [url]));
            clearRun(targetId);
            return;
          } finally {
            await audioContext.close().catch(() => undefined);
          }
        }

        if (req.transport === 'syncBinary') {
          // 同步二进制(TTS):POST → blob → 传素材拿持久 URL(规避各家 async 支持不一)
          const r = await authFetch(req.path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}) as any);
            throw new Error(j?.error?.message || `HTTP ${r.status}`);
          }
          const blob = await r.blob();
          const url = await uploadAsset(new File([blob], req.filename, { type: blob.type || 'application/octet-stream' }));
          if (!url) throw new Error('结果保存失败');
          updateNodeData(targetId, applyOutput(cap.output, [url]));
          clearRun(targetId);
          return;
        }

        // 异步任务:提交 → (queued/running) 轮询 → succeeded 用 cap.extract 取结果 → 落节点
        const extract = req.extract;
        const pollBase = req.pollBase;
        const done = (task: any) => {
          const urls = extract(task);
          if (!urls.length) return markFailed(targetId, '上游未返回结果');
          updateNodeData(targetId, { ...applyOutput(cap.output, urls), pendingTask: null });
          clearRun(targetId);
        };
        const r = await authFetch(req.path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
        });
        const t = await r.json();
        if (!r.ok) throw new Error(t?.error?.message || t?.message || `HTTP ${r.status}`);
        if (t.status === 'queued' || t.status === 'running') {
          // 把上游 task id 落到节点上 —— 刷新/重开画布/切文档后能续轮询,长任务不丢
          updateNodeData(targetId, { pendingTask: { taskId: t.id, pollBase } });
          pollTask(targetId, `${pollBase}${t.id}`, done);
        } else if (t.status === 'succeeded') done(t);
        else throw new Error(t?.error?.message || `任务${t.status}`);
      } catch (e: any) {
        markFailed(targetId, e?.message || String(e));
      }
    },
    [authFetch, upstreamPrompt, refThumbsFor, audioRefsFor, fileInfosFor, cloneVoiceFor, pollTask, updateNodeData, uploadAsset, markFailed, clearRun, setNodes, setEdges],
  );

  // 续轮询:节点带 pendingTask(上游 task 未回)时,用其 kind 重建 extract 继续轮询到落节点。
  const resumeTask = useCallback(
    (nd: RFNode) => {
      const pt = nd.data?.pendingTask as { taskId?: string; pollBase?: string } | undefined;
      if (!pt?.taskId || !pt?.pollBase) return;
      const cap = capById(nd.data?.kind);
      const req = cap.request({ model: nd.data?.model || '', prompt: '', refs: [], audio: [], data: nd.data || {} });
      if (req.transport !== 'async') return;
      const extract = req.extract;
      const finish = (task: any) => {
        const urls = extract(task);
        if (!urls.length) return markFailed(nd.id, '上游未返回结果');
        updateNodeData(nd.id, { ...applyOutput(cap.output, urls), pendingTask: null });
        clearRun(nd.id);
      };
      setRunState((s) => ({ ...s, [nd.id]: { status: 'running', startedAt: Date.now() } }));
      pollTask(nd.id, `${pt.pollBase}${pt.taskId}`, finish);
    },
    [pollTask, markFailed, updateNodeData, clearRun],
  );

  // 画布载入完成后,扫描仍带 pendingTask 且未在轮询的节点,自动续上(刷新/切文档/切标签后恢复长任务)
  useEffect(() => {
    if (loadingRef.current) return;
    for (const nd of nodes) {
      if (nd.data?.pendingTask?.taskId && !pollRef.current[nd.id] && runState[nd.id]?.status !== 'running') {
        resumeTask(nd);
      }
    }
  }, [nodes, runState, resumeTask, loadTick]);

  // 右键:document 捕获阶段拦截 → 卡片式新建菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const root = rootRef.current;
      const el = e.target as HTMLElement;
      if (!root || !root.contains(el)) return;
      if (el.closest('input, textarea, .ant-select-dropdown, .composer, .cs-topbar')) return;
      e.preventDefault();
      e.stopPropagation();
      if (el.closest('.react-flow__node, .react-flow__minimap, .react-flow__controls')) {
        setMenu(null);
        return;
      }
      setMenu({ x: e.clientX, y: e.clientY, source: null });
    };
    document.addEventListener('contextmenu', handler, true);
    return () => document.removeEventListener('contextmenu', handler, true);
  }, []);

  const onConnectStart = useCallback((_: unknown, p: { nodeId: string | null }) => {
    connectingRef.current = p.nodeId;
  }, []);
  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.classList?.contains('react-flow__pane')) {
        const cx = (e as MouseEvent).clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX;
        const cy = (e as MouseEvent).clientY ?? (e as TouchEvent).changedTouches?.[0]?.clientY;
        const source = connectingRef.current;
        // 从节点手柄拖到空白 → 直接建「图片生成」节点(连源、选中),composer 立即浮现、源图作参考;
        // 空白处拖出(无源)→ 才弹新建菜单让用户挑类型。
        // 延后一帧建节点:避开 react-flow 连线结束时对选中态的清理,否则新节点会被取消选中、composer 不浮现。
        if (source) setTimeout(() => spawnNode('image', cx, cy, source), 0);
        else setMenu({ x: cx, y: cy, source: null });
      }
      connectingRef.current = null;
    },
    [spawnNode],
  );

  const pickCreate = useCallback(
    (type: string) => {
      if (!menu) return;
      spawnNode(type, menu.x, menu.y, menu.source || null);
      setMenu(null);
    },
    [menu, spawnNode],
  );

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // 页内大图预览(弹窗,不开新标签):Esc 关闭,←/→ 多图切换
  const openPreview = useCallback((imgs: string[], index = 0) => {
    if (imgs.length) setPreview({ images: imgs, index });
  }, []);
  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
      else if (e.key === 'ArrowLeft')
        setPreview((p) => (p ? { ...p, index: (p.index - 1 + p.images.length) % p.images.length } : p));
      else if (e.key === 'ArrowRight')
        setPreview((p) => (p ? { ...p, index: (p.index + 1) % p.images.length } : p));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  if (!apiKey) {
    return (
      <div style={{ maxWidth: 420, margin: '48px auto' }}>
        <p style={{ color: '#666', marginBottom: 12 }}>填入 API Key 使用画布</p>
        <ApiKeyField />
      </div>
    );
  }

  const currentIcon = docs.find((d) => d.id === docId)?.icon || '🎨';
  const selImages = nodes.filter((nd) => nd.selected && nd.type === 'image');
  const anchor = selImages.length === 1 ? selImages[0] : null;

  return (
    <CanvasCtx.Provider
      value={{
        runState, chatModels: modelsByType.chat || [], liveVoices, updateNodeData, selectNode, deleteNode, uploadAsset, openPreview,
        runLLM, runClone, openLive, runMaterial, startLiveness,
      }}
    >
      <div className="cs-root" ref={rootRef}>
        <div className="cs-stage">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onPaneClick={() => setMenu(null)}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Delete', 'Backspace']}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>

          <Composer
            anchor={anchor}
            modelsByType={modelsByType}
            running={!!(anchor && runState[anchor.id]?.status === 'running')}
            derivedRefs={anchor ? refThumbsFor(anchor.id) : []}
            derivedAudio={anchor ? audioRefsFor(anchor.id) : []}
            derivedVideo={anchor ? videoRefsFor(anchor.id) : []}
            upstreamPrompt={anchor ? upstreamPrompt(anchor.id) : ''}
            onPatch={(patch) => anchor && updateNodeData(anchor.id, patch)}
            onRun={() => anchor && runGenerator(anchor.id)}
            onAddRef={(file) => anchor && addAnchorRef(anchor.id, file)}
          />
        </div>

        <div className="cs-topbar">
          <div className="cs-panel cs-nav">
            <span style={{ fontSize: 18, lineHeight: 1 }}>{currentIcon}</span>
            <div className="cs-nav-meta">
              <input
                className="cs-title-input"
                value={title}
                onChange={(e) => rename(e.target.value)}
                placeholder="未命名画布"
              />
              <span className="cs-time">{nodes.length} 个节点</span>
            </div>
            <Select
              className="cs-nav-doc"
              size="small"
              value={docId || undefined}
              onChange={openDoc}
              placeholder="切换画布"
              options={docs.map((d) => ({ value: d.id, label: `${d.icon || '🎨'} ${d.title || '未命名'}` }))}
            />
          </div>

          <div className="cs-panel cs-toolbar">
            <div className="cs-toolbar-items">
              <button className="cs-tool-btn primary" onClick={createDoc}>
                <PlusOutlined />
                新画布
              </button>
              <button className="cs-tool-btn" onClick={() => addNodeCenter('image')}>
                <PictureOutlined />
                上传
              </button>
              <button className="cs-tool-btn" onClick={() => addNodeCenter('prompt')}>
                <EditOutlined />
                提示词
              </button>
              <button className="cs-tool-btn" onClick={() => addNodeCenter('clone')}>
                <CustomerServiceOutlined />
                音色
              </button>
              <button className="cs-tool-btn" onClick={() => addNodeCenter('live')}>
                <VideoCameraOutlined />
                直播
              </button>
              <button
                className="cs-tool-btn cs-fullscreen-btn"
                onClick={toggleFullscreen}
                title={isFullscreen ? '退出全屏 (Esc)' : '全屏使用'}
                aria-label={isFullscreen ? '退出全屏' : '全屏使用'}
              >
                {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              </button>
            </div>
            <span className="cs-save">{saveHint}</span>
          </div>
        </div>

        {menu && (
          <div
            className="create-menu open"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="create-menu-grid">
              {CREATE_CARDS.map((m) => (
                <button key={m.type} className="create-card" onClick={() => pickCreate(m.type)}>
                  <span className="create-card-icon">{m.icon}</span>
                  <span>
                    <div className="create-card-title">{m.label}</div>
                    <div className="create-card-sub">{m.sub}</div>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {liveSeed && (
          <div className="cs-live-overlay">
            <div className="cs-live-head">
              <span>数字人直播(画布已预填 头像/人设/音色)</span>
              <button className="cs-live-close" title="关闭" onClick={() => setLiveSeed(null)}>
                <CloseOutlined /> 关闭
              </button>
            </div>
            <div className="cs-live-body">
              <DigitalHumanLivePanel seed={liveSeed} />
            </div>
          </div>
        )}

        {preview && (
          <div className="cs-lightbox" onMouseDown={() => setPreview(null)}>
            <button className="cs-lightbox-close" title="关闭 (Esc)" onClick={() => setPreview(null)}>
              <CloseOutlined />
            </button>
            {preview.images.length > 1 && (
              <button
                className="cs-lightbox-nav prev"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setPreview((p) => (p ? { ...p, index: (p.index - 1 + p.images.length) % p.images.length } : p));
                }}
              >
                ‹
              </button>
            )}
            <img
              className="cs-lightbox-img"
              src={preview.images[preview.index]}
              alt=""
              onMouseDown={(e) => e.stopPropagation()}
            />
            {preview.images.length > 1 && (
              <button
                className="cs-lightbox-nav next"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setPreview((p) => (p ? { ...p, index: (p.index + 1) % p.images.length } : p));
                }}
              >
                ›
              </button>
            )}
            {preview.images.length > 1 && (
              <div className="cs-lightbox-count">
                {preview.index + 1} / {preview.images.length}
              </div>
            )}
          </div>
        )}
      </div>
    </CanvasCtx.Provider>
  );
}

export default function CanvasStudioPanel() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
