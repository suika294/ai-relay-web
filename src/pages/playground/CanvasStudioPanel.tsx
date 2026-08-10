import {
  AppstoreOutlined,
  AudioOutlined,
  BgColorsOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  ColumnWidthOutlined,
  ControlOutlined,
  CopyOutlined,
  CustomerServiceOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExpandOutlined,
  ExperimentOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  KeyOutlined,
  LogoutOutlined,
  MessageOutlined,
  FolderAddOutlined,
  PictureOutlined,
  PlusOutlined,
  ShoppingOutlined,
  SkinOutlined,
  SmileOutlined,
  SoundOutlined,
  RedoOutlined,
  SnippetsOutlined,
  ThunderboltOutlined,
  UndoOutlined,
  UploadOutlined,
  UserOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { Input, message, Modal, Select } from 'antd';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
type MediaSnapshot = {
  images?: string[];
  videoUrl?: string;
  audioUrl?: string;
  model3dUrl?: string;
  mediaItems?: NodeMediaItem[];
};
type NodeMediaItem = { url: string; kind: MediaKind; name?: string };
type GenerationBatch = MediaSnapshot & {
  id: string;
  createdAt: number;
  prompt?: string;
  kind?: string;
};
type CanvasMaterial = {
  nodeId: string;
  name: string;
  url: string;
  referenceUrl?: string;
  category: 'Image' | 'Video' | 'Audio' | 'Model';
  sourceType?: 'image' | 'video' | 'audio' | 'material';
};
type StoredCanvasMaterial = {
  id: string;
  kind: 'canvas' | 'aigc';
  name: string;
  content_type?: string;
  url: string;
  asset_id: number;
  upstream_asset_id?: string;
};

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
    { value: '3', label: '3s' }, { value: '4', label: '4s' }, { value: '5', label: '5s' }, { value: '6', label: '6s' },
    { value: '8', label: '8s' }, { value: '10', label: '10s' }, { value: '12', label: '12s' }, { value: '15', label: '15s' },
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
const tryOnRoles = (data: any): string[] => {
  switch (clothesType(data)) {
    case 'Lower-body': return ['模特图', '下装图'];
    case 'Dress': return ['模特图', '连衣裙图'];
    case 'Upper-Lower': return ['模特图', '上衣图', '下装图'];
    default: return ['模特图', '上衣图'];
  }
};

// 一键成片(Vidu 固定虚拟模型):上传 1–7 张图 → 整片视频。
const AD_ASPECT: ModelOpt[] = [EMO('16:9', '16:9'), EMO('9:16', '9:16'), EMO('1:1', '1:1')];
const AD_LANG: ModelOpt[] = [EMO('zh', '中文'), EMO('en', 'English')];
const AD_DURATION: ModelOpt[] = ['8', '15', '30', '45', '60'].map((v) => EMO(v, `${v}s`));
const GEN_ASPECT: ModelOpt[] = [EMO('16:9', '16:9'), EMO('9:16', '9:16'), EMO('1:1', '1:1'), EMO('4:3', '4:3'), EMO('3:4', '3:4')];
const GEN_DURATION: ModelOpt[] = ['5', '10', '15', '30', '60', '120'].map((v) => EMO(v, `${v}s`));
// 数智人(image + 驱动音频 → 说话视频):覆盖 OmniHuman / Wan(emo/liveportrait) / 腾讯 lipsync-photo 等音频驱动型。
const VM_RESOLUTION: ModelOpt[] = [EMO('720P', '720P'), EMO('1080P', '1080P')];
const VM_WAN_RESOLUTION: ModelOpt[] = [EMO('480P', '480P'), EMO('720P', '720P')];

// ============ 3D 操作(混元 3D 全家桶)============
// 3D 模型分两类:图/文 → 3D(基础生成),以及以「一个已有 3D 文件」为主入参的 3D→3D 操作
// (纹理/减面/拆件/UV/绑骨蒙皮/动作/格式转换)。口径与独立 3D 面板 ThreeDPanel 保持一致。
type ThreeDOp = 'gen' | 'profile' | 'texture' | 'reduceface' | 'part' | 'uv' | 'motion' | 'rigging' | 'convert';
function threeDOpOf(model?: string): ThreeDOp {
  const m = (model || '').toLowerCase();
  if (m.includes('profile')) return 'profile';
  if (m.includes('texture')) return 'texture';
  if (m.includes('reduceface') || m.includes('reduce-face') || m.includes('topology')) return 'reduceface';
  if (m.includes('part')) return 'part';
  if (m.includes('convert')) return 'convert';
  if (m.includes('motion')) return 'motion';
  if (m.includes('rig')) return 'rigging';
  if (m.includes('uv')) return 'uv';
  return 'gen';
}
// 必须要有输入 3D 文件的 op(motion 的模型是可选的动作重定向对象,不强制)。
const THREED_NEEDS_MODEL: ThreeDOp[] = ['texture', 'reduceface', 'part', 'uv', 'rigging', 'convert'];
// 各 op 上游能接受的模型格式(腾讯侧限制,和 ThreeDPanel 的 opAcceptModelExts 一致)。
function threeDAcceptExts(op: ThreeDOp): string[] {
  switch (op) {
    case 'part':
      return ['fbx'];
    case 'reduceface':
    case 'texture':
      return ['obj', 'glb'];
    case 'rigging':
      return ['fbx', 'glb'];
    default:
      return ['fbx', 'obj', 'glb', 'gltf', 'stl'];
  }
}
// 从 URL/文件名推腾讯要的 InputModelType(FBX/OBJ/GLB/GLTF/STL)。
function threeDModelType(url?: string): string {
  const u = (url || '').toLowerCase().split(/[?#]/)[0];
  for (const e of ['glb', 'gltf', 'obj', 'fbx', 'stl']) {
    if (u.endsWith('.' + e)) return e.toUpperCase();
  }
  return '';
}
const THREED_ON_OFF: ModelOpt[] = [EMO('on', '开'), EMO('off', '关')];
const THREED_TEXTURE_VER: ModelOpt[] = [EMO('3.0', '3.0'), EMO('3.1', '3.1')];
const THREED_POLYGON: ModelOpt[] = [EMO('', '默认'), EMO('triangle', '三角面'), EMO('quadrilateral', '四边面')];
const THREED_FACE_LEVEL: ModelOpt[] = [EMO('', '默认'), EMO('high', '高'), EMO('medium', '中'), EMO('low', '低')];
const THREED_CONVERT_FMT: ModelOpt[] = ['STL', 'USDZ', 'FBX', 'MP4', 'GIF'].map((v) => EMO(v, v));
const THREED_MOTION_DURATION: ModelOpt[] = ['3', '5', '8', '10', '12'].map((v) => EMO(v, `${v}s`));
// 绑骨蒙皮的预置动作编号(腾讯 motion_type 1–48),留空=只绑骨不套动作。
const THREED_MOTION_TYPE: ModelOpt[] = [EMO('', '仅绑骨')].concat(
  Array.from({ length: 48 }, (_, i) => EMO(String(i + 1), `动作 ${i + 1}`)),
);
const THREED_PROFILE_TEMPLATE: ModelOpt[] = [EMO('', '不用模板')].concat(
  ['basketball', 'badminton', 'pingpong', 'gymnastics', 'pilidance', 'tennis', 'athletics',
    'footballboykicking1', 'footballboykicking2', 'guitar', 'footballboy', 'skateboard',
    'futuresoilder', 'explorer', 'beardollgirl', 'bibpantsboy', 'womansitpose',
    'womanstandpose2', 'mysteriousprincess', 'manstandpose2'].map((v) => EMO(v, v)),
);

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
  // 同步 JSON(如 3D 格式转换):POST path → json,直接从响应里取结果 URL,不轮询
  | { transport: 'syncJSON'; path: string; body: Record<string, unknown>; extract: (r: any) => string[] }
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
  refsHint?: string | ((data: any) => string); // 无参考图时的提示文案(覆盖默认「首帧 / 加参考图」);3D 按 op 变
  audioHint?: string; // 需要音频时的提示文案
  showCount?: boolean; // 图片张数控件
  stylePresets?: boolean; // 风格预设按钮
  promptPlaceholder: string;
  // models3d:上游/自身带进来的 3D 模型文件 URL(3D→3D 操作的主入参)
  validate: (a: { prompt: string; refs: string[]; audio: string[]; models3d: string[]; data: any }) => string | null; // 返回错误提示或 null
  params: (data: any, models: ModelInfo[]) => ParamDef[]; // 动态参数药丸
  defaults: (models: ModelInfo[]) => Record<string, unknown>; // 选中该能力时的初始设置
  onModelChange: (v: string, models: ModelInfo[]) => Record<string, unknown>; // 换模型时的设置补丁
  request: (a: { model: string; prompt: string; refs: string[]; audio: string[]; models3d: string[]; data: any }) => CapRequest;
};

// 结果 URL(s) → 节点数据补丁(按输出媒体类型落到不同字段)
function applyOutput(output: CapOutput, urls: string[]): Record<string, unknown> {
  if (output === 'image') return { images: urls };
  if (output === 'video') return { videoUrl: urls[0] };
  if (output === 'model3d') {
    // 3D 侧也能产出非模型结果:格式转换可以转 MP4/GIF,基础生成也支持 MP4 预览。
    // 只在后缀明确是视频/图片时改落点,其余(含无后缀的签名 URL)一律当模型交给 SceneViewer。
    const u = (urls[0] || '').toLowerCase().split(/[?#]/)[0];
    if (/\.(mp4|webm|mov)$/.test(u)) return { videoUrl: urls[0] };
    if (/\.(gif|png|jpe?g|webp)$/.test(u)) return { images: [urls[0]] };
    return { model3dUrl: urls[0] };
  }
  return { audioUrl: urls[0] };
}

function outputSnapshot(output: CapOutput, urls: string[]): MediaSnapshot {
  return {
    images: [],
    videoUrl: undefined,
    audioUrl: undefined,
    model3dUrl: undefined,
    mediaItems: undefined,
    ...applyOutput(output, urls),
  };
}

// 输入缩略图行的手动排序:节点 data.inputOrder 存的是用户拖出来的 URL 次序。
// 只重排「在 inputOrder 里出现过」的项,其余项留在原来的槽位不动 —— 这样 fileInfosFor 里
// 「已登记素材优先」之类的既有规则不会被一次拖拽打乱,新连进来的输入也不会被挤到末尾。
function applyInputOrder<T>(items: T[], order: string[] | undefined, urlOf: (it: T) => string): T[] {
  if (!order?.length || items.length < 2) return items;
  const rank = new Map(order.map((u, i) => [u, i]));
  const movable = items.filter((it) => rank.has(urlOf(it)));
  if (movable.length < 2) return items;
  movable.sort((a, b) => (rank.get(urlOf(a)) as number) - (rank.get(urlOf(b)) as number));
  let k = 0;
  return items.map((it) => (rank.has(urlOf(it)) ? movable[k++] : it));
}

// 通用视频节点的首/尾帧指派:composer 缩略图上点角标标记,存进 data.frameRole(URL → 角色)。
// 没标过就沿用老语义「排在第一位的图 = 首帧」,所以旧文档行为不变。
// 'ref' 是「显式指定当普通参考图」,和「没指派过」不是一回事:单图没指派时默认按首帧驱动,
// 指成 'ref' 才能让它纯做风格参考(走 images[],不进 first_frame_image)。
type FrameRole = 'first' | 'last' | 'ref';
const frameRolesOf = (data: any): Record<string, FrameRole> => (data?.frameRole || {}) as Record<string, FrameRole>;
// refs 进来时已按 inputOrder 排好,这里只解析角色。
// 指派过就严格照指派来:点哪张只改哪张,绝不给没指派的图自动补角色 —— 否则「标了尾帧,另一张
// 莫名其妙变成首帧」。没指派过时才走老语义:单图=首帧;多图整批当参考(Seedance 等上游禁止
// 首/尾帧与 reference images 混传,runGenerator 本来也会把 file_infos 全压成 Reference)。
function resolveFrames(refs: string[], data: any) {
  const roles = frameRolesOf(data);
  const explicit = refs.some((u) => roles[u]);
  if (explicit) {
    return { first: refs.find((u) => roles[u] === 'first'), last: refs.find((u) => roles[u] === 'last'), explicit: true };
  }
  return { first: refs.length === 1 ? refs[0] : undefined, last: undefined, explicit: false };
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
    request: ({ model, prompt, refs, data }) => {
      // 首/尾帧:composer 上点角标指派,没指派就沿用「第一张=首帧」。Seedance 禁止首/尾帧与
      // reference images 混传,所以这里只发首尾两张,其余图交给 file_infos(见 runGenerator)。
      const { first, last } = resolveFrames(refs, data);
      return {
        transport: 'async' as const, path: '/v1/videos/generations', pollBase: '/v1/videos/generations/',
        body: {
          model, prompt,
          duration: Number(data.duration || 5), resolution: data.resolution || '1080p',
          aspect_ratio: data.vAspect || '16:9', audio: (data.audioOn || 'on') === 'on',
          ...(first ? { first_frame_image: first } : {}),
          ...(last ? { last_frame_image: last } : {}),
          // 多图又没指派首/尾帧:整批当 reference images 发(纯 images 不触发上游的混传限制),
          // 别让图悄悄丢掉 —— 想要首尾帧驱动的话点角标指派即可。
          ...(!first && !last && refs.length ? { images: refs } : {}),
        },
        extract: (t: any) => (t?.data?.[0]?.url ? [t.data[0].url] : []),
      };
    },
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
      body: { model, images: refs.slice(0, tryOnRoles(data).length), clothes_type: clothesType(data) },
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
    // 收窄到 body 已核实的音频驱动型:万相 S2V、OmniHuman、腾讯 lipsync-photo。
    id: 'virtualman', label: '数智人', icon: <UserOutlined />, output: 'video', modelType: 'video',
    modelFilter: (m) => /wan2\.2-s2v|omnihuman|lipsync-photo/i.test(m.value),
    usesRefs: true, usesPrompt: false, usesAudio: true,
    refsHint: '本节点图/上游图=头像',
    audioHint: '上游需连一个音频/TTS 节点作驱动音频',
    promptPlaceholder: '',
    validate: ({ refs, audio }) => {
      if (!refs.length) return '需要 1 张头像图(本节点或上游图片节点)';
      if (!audio.length) return '需要驱动音频:上游连一个音频/TTS 节点';
      return null;
    },
    params: (data) => [{
      icon: <ExpandOutlined />, label: '清晰度', field: 'vmRes',
      opts: /wan2\.2-s2v/i.test(String(data.model || '')) ? VM_WAN_RESOLUTION : VM_RESOLUTION,
      def: /wan2\.2-s2v/i.test(String(data.model || '')) ? '480P' : '720P',
    }],
    defaults: (models) => {
      const model = models[0]?.value;
      return { model, vmRes: /wan2\.2-s2v/i.test(String(model || '')) ? '480P' : '720P' };
    },
    onModelChange: (v) => ({ model: v, vmRes: /wan2\.2-s2v/i.test(v) ? '480P' : '720P' }),
    request: ({ model, refs, audio, data }) => {
      const res = String(data.vmRes || '720p');
      const body: Record<string, unknown> = {
        model, task_type: 'virtualman', first_frame_image: refs[0], input_audio_url: audio[0],
      };
      if (/omnihuman/i.test(model)) body.output_resolution = res.toUpperCase() === '1080P' ? 1080 : 720;
      else body.resolution = res.toUpperCase(); // Wan / 腾讯 lipsync-photo 走字符串清晰度
      return { transport: 'async', path: '/v1/videos/generations', pollBase: '/v1/videos/generations/', body,
        extract: (t) => (t?.data?.[0]?.url ? [t.data[0].url] : []) };
    },
  },
  {
    // 3D:两类。① 图/文 → 3D(基础生成);② 3D→3D 操作 —— 纹理 / 减面 / 拆件 / UV /
    // 绑骨蒙皮 / 动作 / 格式转换,主入参是上游节点的 model3dUrl(上传的或前一步生成的)。
    // 走哪一类由选中的模型决定(threeDOpOf),结果统一落 model3dUrl 交给 SceneViewer。
    id: '3d', label: '3D', icon: <ExperimentOutlined />, output: 'model3d', modelType: '3d',
    usesRefs: true,
    refsHint: (d) => {
      const op = threeDOpOf(d?.model);
      if (THREED_NEEDS_MODEL.includes(op)) return `上游连一个 ${threeDAcceptExts(op).join('/').toUpperCase()} 模型节点`;
      if (op === 'motion') return '文生动作;可选连一个模型节点做动作重定向';
      return '连接/加 1 张图(图生 3D;留空则纯文生 3D)';
    },
    promptPlaceholder: '文生 3D 描述(有图可空;纹理/动作也吃描述)…',
    validate: ({ prompt, refs, models3d, data }) => {
      const op = threeDOpOf(data?.model);
      if (THREED_NEEDS_MODEL.includes(op)) {
        const exts = threeDAcceptExts(op);
        if (!models3d.length) return `该操作需要一个输入 3D 模型:上游连一个 ${exts.join('/').toUpperCase()} 节点(上传或上一步生成的)`;
        const ext = threeDModelType(models3d[0]).toLowerCase();
        if (ext && !exts.includes(ext)) return `该操作只接受 ${exts.join('/').toUpperCase()},当前上游是 ${ext.toUpperCase()}`;
        return null;
      }
      if (op === 'motion') return prompt ? null : '填写动作描述';
      if (op === 'profile') return prompt || refs.length || data?.profileTemplate ? null : '填写描述、加 1 张图或选一个动作模板';
      return prompt || refs.length ? null : '填写描述或加 1 张图';
    },
    params: (d) => {
      switch (threeDOpOf(d?.model)) {
        case 'texture':
          return [
            { icon: <BgColorsOutlined />, label: 'PBR', field: 'enablePBR', opts: THREED_ON_OFF, def: 'on' },
            { icon: <ControlOutlined />, label: '版本', field: 'textureVersion', opts: THREED_TEXTURE_VER, def: '3.0' },
          ];
        case 'reduceface':
          return [
            { icon: <AppstoreOutlined />, label: '面型', field: 'polygonType', opts: THREED_POLYGON, def: '' },
            { icon: <ControlOutlined />, label: '精度', field: 'faceLevel', opts: THREED_FACE_LEVEL, def: '' },
          ];
        case 'rigging':
          return [{ icon: <UserOutlined />, label: '动作', field: 'motionType', opts: THREED_MOTION_TYPE, def: '' }];
        case 'motion':
          return [
            { icon: <ClockCircleOutlined />, label: '时长', field: 'motionDuration', opts: THREED_MOTION_DURATION, def: '5' },
            { icon: <AppstoreOutlined />, label: '带网格', field: 'enableMesh', opts: THREED_ON_OFF, def: 'on' },
          ];
        case 'convert':
          return [{ icon: <ControlOutlined />, label: '转为', field: 'convertFormat', opts: THREED_CONVERT_FMT, def: 'STL' }];
        case 'profile':
          return [{ icon: <UserOutlined />, label: '模板', field: 'profileTemplate', opts: THREED_PROFILE_TEMPLATE, def: '' }];
        default:
          return [];
      }
    },
    defaults: (models) => ({ model: models[0]?.value }),
    onModelChange: (v) => ({ model: v }),
    request: ({ model, prompt, refs, models3d, data }) => {
      const op = threeDOpOf(model);
      const inputModel = models3d[0];
      // 格式转换是同步端点,body 口径也不同(file_url + format),单独出。
      if (op === 'convert') {
        return {
          transport: 'syncJSON', path: '/v1/3d/convert',
          body: { model, file_url: inputModel, format: data?.convertFormat || 'STL' },
          extract: (r) => (r?.result_url ? [r.result_url] : []),
        };
      }
      const body: Record<string, unknown> = { model };
      const params: Record<string, unknown> = {};
      if (inputModel && (THREED_NEEDS_MODEL.includes(op) || op === 'motion')) {
        body.input_model_url = inputModel;
        const t = threeDModelType(inputModel);
        if (t) body.input_model_type = t;
      }
      switch (op) {
        case 'texture':
          body.enable_pbr = data?.enablePBR !== 'off';
          if (data?.textureVersion) params.model_version = data.textureVersion;
          if (refs.length) body.images = [refs[0]];
          break;
        case 'reduceface':
          if (data?.polygonType) params.polygon_type = data.polygonType;
          if (data?.faceLevel) params.face_level = data.faceLevel;
          break;
        case 'part':
          params.model_version = '1.5';
          break;
        case 'rigging':
          if (data?.motionType) params.motion_type = Number(data.motionType);
          break;
        case 'motion':
          params.duration = Number(data?.motionDuration || 5);
          params.enable_mesh = data?.enableMesh !== 'off';
          break;
        case 'profile':
          if (data?.profileTemplate) params.template = data.profileTemplate;
          if (refs.length) body.images = [refs[0]];
          break;
        default:
          // 基础生成:图生 3D / 文生 3D,维持原有最小口径
          if (refs.length) body.images = [refs[0]];
          break;
      }
      // 只有吃描述的 op 才发 prompt:减面/UV/拆件/绑骨蒙皮是纯几何操作,腾讯侧没有这个字段;
      // 纹理有参考图时也以图为准(和 ThreeDPanel 的 wantPrompt 口径一致)。
      const wantsPrompt = op === 'gen' || op === 'motion' || op === 'profile' || (op === 'texture' && !refs.length);
      if (prompt && wantsPrompt) body.prompt = prompt;
      if (Object.keys(params).length) body.parameters = params;
      return {
        transport: 'async', path: '/v1/3d/generations', pollBase: '/v1/3d/generations/', body,
        extract: (t) => {
          const u = t?.result_url || (t?.files || []).find((f: any) => f.url)?.url;
          return u ? [u] : [];
        },
      };
    },
  },
];
const capById = (id?: string): Capability => CAPABILITIES.find((c) => c.id === id) || CAPABILITIES[0];
const COMPOSER_GROUPS = [
  { id: 'prompt', label: '提示词', icon: <EditOutlined />, caps: [] },
  { id: 'image', label: '图像', icon: <PictureOutlined />, caps: ['image'] },
  { id: 'video', label: '视频', icon: <VideoCameraOutlined />, caps: ['video', 'effects', 'multiframe'] },
  { id: 'audio', label: '音频', icon: <CustomerServiceOutlined />, caps: ['audio'] },
  { id: 'digital-human', label: '数字人', icon: <UserOutlined />, caps: ['virtualman'] },
  { id: 'aigc', label: 'AIGC素材', icon: <AppstoreOutlined />, caps: ['template', 'tryon', 'ad', 'oneclick'] },
  { id: '3d', label: '3D', icon: <ExperimentOutlined />, caps: ['3d'] },
];
const composerGroupFor = (capId: string) => COMPOSER_GROUPS.find((g) => g.caps.includes(capId)) || COMPOSER_GROUPS[1];
// 老画布允许在同一个结果节点上跨类型切换，可能留下“视频内容 + kind=3d”这类脏状态。
// 已有媒体是节点最可靠的类型事实；只有空节点才继续采用 kind 配置。
function capabilityForNode(data: Record<string, any>): Capability {
  const configured = capById(data.kind);
  if (data.videoUrl && configured.output !== 'video') return capById('video');
  if (data.audioUrl && configured.output !== 'audio') return capById('audio');
  if (data.model3dUrl && configured.output !== 'model3d') return capById('3d');
  return configured;
}
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
  downloadMedia: (url: string, category: CanvasMaterial['category']) => void;
  convertToMaterial: (id: string) => void;
  runLLM: (id: string, model: string, mode: string) => void;
  runClone: (id: string, args: CloneArgs) => void;
  openLive: (id: string) => void;
  runMaterial: (id: string, args: MaterialArgs) => void;
  startLiveness: (id: string) => void;
  openNodeCreate: (id: string, side: 'left' | 'right', anchor: HTMLElement) => void;
  selectBatch: (id: string, index: number) => void;
  expandPromptNode: (id: string) => void;
};
const CanvasCtx = createContext<Ctx>({} as Ctx);

// 节点内可滚动区(长文本框 / 缩略图网格 / 报错详情):内容溢出时挂上 React Flow 的 nowheel,
// 滚轮滚内容而不是缩放画布;没溢出就不挂,滚轮照旧交给画布,不至于「滚不动也缩不了」。
function useWheelScroll<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const el = ref.current;
    setScrollable(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [dep]);
  return [ref, scrollable ? ' nowheel' : ''] as const;
}

function NodePorts({ id }: { id: string }) {
  const { openNodeCreate } = useContext(CanvasCtx);
  const open = (side: 'left' | 'right') => (e: ReactMouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    openNodeCreate(id, side, e.currentTarget);
  };
  return (
    <>
      <Handle type="target" position={Position.Left} className="node-combined-port" title="在左侧添加节点" onClick={open('left')}>
        <PlusOutlined />
      </Handle>
      <Handle type="source" position={Position.Right} className="node-combined-port" title="在右侧添加空节点，并连接当前结果" onClick={open('right')}>
        <PlusOutlined />
      </Handle>
    </>
  );
}

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
const COMPOSER_W = 640;

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

// 媒体归类:优先看 MIME,拿不到 type 时按文件名/URL 扩展名兜底 —— .glb/.spz 这类 3D 文件
// 浏览器基本给不出 MIME(空或 application/octet-stream),只能靠后缀。上传节点与素材库共用,
// 避免两处口径漂移。
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|flv|wmv|mpe?g|ts)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|opus|wma|amr|aiff?)(\?|#|$)/i;
const MODEL3D_EXT = /\.(glb|gltf|ply|spz|splat|ksplat|obj|fbx|usdz?|stl|3mf)(\?|#|$)/i;
type MediaKind = 'image' | 'video' | 'audio' | 'model3d';
function mediaKindOf(contentType?: string, nameOrURL?: string): MediaKind {
  const ct = (contentType || '').toLowerCase();
  const name = nameOrURL || '';
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('audio/')) return 'audio';
  if (ct.startsWith('model/') || ct.startsWith('application/vnd.usdz') || ct.startsWith('application/vnd.autodesk.fbx')) return 'model3d';
  if (ct.startsWith('image/')) return 'image';
  if (VIDEO_EXT.test(name)) return 'video';
  if (AUDIO_EXT.test(name)) return 'audio';
  if (MODEL3D_EXT.test(name)) return 'model3d';
  return 'image';
}
// 当前密钥的打码展示:留头留尾,中间打码,足够辨认是哪一把又不至于被肩窥抄走。
function maskKey(k: string): string {
  if (!k) return '未设置';
  if (k.length <= 12) return `${k.slice(0, 4)}****`;
  return `${k.slice(0, 7)}****${k.slice(-4)}`;
}

// 文件选择框的 accept:3D 没有可靠的通配 MIME,必须把后缀逐个列出来。
const UPLOAD_ACCEPT = 'image/*,video/*,audio/*,model/*,.glb,.gltf,.ply,.spz,.splat,.ksplat,.obj,.fbx,.usdz,.stl,.3mf';

// ============ 图片节点(上传 / 生成落图) ============
function ImageNode({ id, data }: NodeProps) {
  const { updateNodeData, selectNode, deleteNode, uploadAsset, runState, openPreview, downloadMedia, openNodeCreate, selectBatch } = useContext(CanvasCtx);
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [v3dFail, setV3dFail] = useState(false);
  const [gridRef, gridWheelCls] = useWheelScroll<HTMLDivElement>(data.images);
  const [errRef, errWheelCls] = useWheelScroll<HTMLSpanElement>(runState[id]?.error);
  const images: string[] = data.images || [];
  const videoUrl: string | undefined = data.videoUrl;
  const audioUrl: string | undefined = data.audioUrl;
  const model3dUrl: string | undefined = data.model3dUrl;
  const mediaItems: NodeMediaItem[] = data.mediaItems || [];
  const run = runState[id];
  const hasImg = images.length > 0;
  const hasContent = mediaItems.length > 0 || hasImg || !!videoUrl || !!audioUrl || !!model3dUrl;
  const primaryUrl = videoUrl || audioUrl || model3dUrl || images[0];
  const mediaCategory: CanvasMaterial['category'] = videoUrl ? 'Video' : audioUrl ? 'Audio' : model3dUrl ? 'Model' : 'Image';
  const scene3dKind = model3dUrl ? classifyThreeDFile(undefined, model3dUrl) : null;
  // 生成节点标记 + 它对应的提示词/能力 —— 用来在图上标注「这是什么、由哪句提示词生成」,
  // 也用来区分「生成结果节点」和「纯上传节点」(结果没出来时不该退化成上传空框)。
  const isResult = !!data.isResult;
  const batches: GenerationBatch[] = data.generationBatches || [];
  const activeBatch = Math.min(Number(data.activeBatch || 0), Math.max(0, batches.length - 1));
  const genCap = isResult ? capById(data.genKind || data.kind) : null; // 仅用于「结果待生成」占位的图标

  // 生成计时:running 期间每 200ms 刷新已用秒数
  useEffect(() => {
    if (run?.status !== 'running' || !run.startedAt) return undefined;
    const start = run.startedAt;
    setElapsed((Date.now() - start) / 1000);
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(t);
  }, [run?.status, run?.startedAt]);

  const putMany = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const uploaded = await Promise.all(files.map(async (file) => {
      const url = await uploadAsset(file);
      return url ? { url, kind: mediaKindOf(file.type, file.name), name: file.name } as NodeMediaItem : null;
    }));
    const nextItems = uploaded.filter(Boolean) as NodeMediaItem[];
    if (!nextItems.length) return;
    const legacyItems: NodeMediaItem[] = mediaItems.length ? mediaItems : [
      ...images.map((url) => ({ url, kind: 'image' as const })),
      ...(videoUrl ? [{ url: videoUrl, kind: 'video' as const }] : []),
      ...(audioUrl ? [{ url: audioUrl, kind: 'audio' as const }] : []),
      ...(model3dUrl ? [{ url: model3dUrl, kind: 'model3d' as const }] : []),
    ];
    const allItems = [...legacyItems, ...nextItems];
    const imageURLs = allItems.filter((item) => item.kind === 'image').map((item) => item.url);
    updateNodeData(id, {
      mediaItems: allItems,
      images: imageURLs,
      videoUrl: allItems.find((item) => item.kind === 'video')?.url,
      audioUrl: allItems.find((item) => item.kind === 'audio')?.url,
      model3dUrl: allItems.find((item) => item.kind === 'model3d')?.url,
    });
  }, [id, mediaItems, images, videoUrl, audioUrl, model3dUrl, updateNodeData, uploadAsset]);

  return (
    <div
      className={`sc-node sc-image ${hasContent ? 'sc-has' : 'sc-empty'}`}
      data-canvas-media-node={hasContent ? id : undefined}
      onPointerDownCapture={() => selectNode(id)}
    >
      <NodePorts id={id} />
      {mediaItems.length > 1 ? (
        <div className="media-album nodrag">
          {mediaItems.map((item, index) => (
            <button
              type="button"
              className="media-album-item"
              key={`${item.url}_${index}`}
              title={item.name || `素材 ${index + 1}`}
              onClick={() => item.kind === 'image' && openPreview(mediaItems.filter((m) => m.kind === 'image').map((m) => m.url), mediaItems.filter((m) => m.kind === 'image').findIndex((m) => m.url === item.url))}
            >
              {item.kind === 'image' ? <img src={item.url} alt={item.name || ''} />
                : item.kind === 'video' ? <video src={item.url} muted preload="metadata" />
                : item.kind === 'audio' ? <CustomerServiceOutlined />
                : <ExperimentOutlined />}
              <span>{index + 1}</span>
            </button>
          ))}
          <div className="media-album-count">{mediaItems.length} 个素材</div>
        </div>
      ) : videoUrl ? (
        <div className="media-card">
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
          <div className={`thumb-grid nodrag${gridWheelCls}`} ref={gridRef}>
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
            <span className={`node-error-msg${errWheelCls}`} ref={errRef}>{run.error || '未知错误'}</span>
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
                putMany(Array.from(e.dataTransfer.files || []));
              }}
            >
              <UploadOutlined />
              <span>上传图片/视频/音频/3D 模型,或选中后在下方生成</span>
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
        {primaryUrl && (
          <button
            className="mini-x mini-view nodrag"
            title="下载文件"
            aria-label="下载文件"
            onClick={(e) => {
              e.stopPropagation();
              downloadMedia(primaryUrl, mediaCategory);
            }}
          >
            <DownloadOutlined />
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
      {isResult && batches.length > 0 && (
        <div className="node-batch-bar nodrag">
          <div className="batch-switcher" aria-label="生成批次">
            <button
              type="button"
              disabled={activeBatch <= 0}
              aria-label="上一批结果"
              onClick={(e) => { e.stopPropagation(); selectBatch(id, activeBatch - 1); }}
            >‹</button>
            <span>批次 {activeBatch + 1} / {batches.length}</span>
            <button
              type="button"
              disabled={activeBatch >= batches.length - 1}
              aria-label="下一批结果"
              onClick={(e) => { e.stopPropagation(); selectBatch(id, activeBatch + 1); }}
            >›</button>
          </div>
          <button
            type="button"
            className="add-next-step"
            title="在右侧添加空节点，并连接当前选中的结果"
            onClick={(e) => { e.stopPropagation(); openNodeCreate(id, 'right', e.currentTarget); }}
          >
            <PlusOutlined /> 添加节点
          </button>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          putMany(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ============ 提示词节点(可选 LLM 变换:文本→文本,喂给下游生成节点) ============
function PromptNode({ id, data }: NodeProps) {
  const { updateNodeData, deleteNode, chatModels, runLLM, runState, expandPromptNode } = useContext(CanvasCtx);
  const running = runState[id]?.status === 'running';
  const failed = runState[id]?.status === 'failed';
  const model = data.chatModel || chatModels[0]?.value;
  const mode = data.llmMode || 'expand';
  const [textRef, wheelCls] = useWheelScroll<HTMLTextAreaElement>(data.text);
  return (
    <div className="sc-node sc-prompt">
      <NodePorts id={id} />
      <div className="prompt-node-card">
        <textarea
          ref={textRef}
          className={`prompt-node-text nodrag${wheelCls}`}
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
          <button className="pn-expand" type="button" title="展开成大窗口编辑" onClick={() => expandPromptNode(id)}>
            <FullscreenOutlined />
          </button>
        </div>
        {failed && <div className="pn-error nodrag">{runState[id]?.error || 'LLM 处理失败'}</div>}
      </div>
      <div className="floating-node-actions">
        <button className="mini-x nodrag" title="删除节点" onClick={() => deleteNode(id)}>
          <CloseOutlined />
        </button>
      </div>
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
      <NodePorts id={id} />
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
    </div>
  );
}

// ============ 直播台节点(启动/会话:收头像/人设/音色 → 浮层里跑数字人直播) ============
function LiveNode({ id, data }: NodeProps) {
  const { updateNodeData, deleteNode, openLive, liveVoices } = useContext(CanvasCtx);
  const sysVoices = liveVoices.filter((v) => v.system !== false);
  const customVoices = liveVoices.filter((v) => v.system === false);
  const [personaRef, personaWheelCls] = useWheelScroll<HTMLTextAreaElement>(data.persona);
  return (
    <div className="sc-node sc-live">
      <NodePorts id={id} />
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
          ref={personaRef}
          className={`live-persona${personaWheelCls}`}
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
      <NodePorts id={id} />
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
    </div>
  );
}

const nodeTypes = { image: ImageNode, prompt: PromptNode, clone: CloneNode, live: LiveNode, material: MaterialNode };

const CREATE_CARDS: { id: string; type: string; capabilityId?: string; label: string; sub: string; icon: JSX.Element }[] = [
  { id: 'prompt', type: 'prompt', label: '提示词', sub: '手写文本 / AI 扩写，连接到生成节点', icon: <EditOutlined /> },
  { id: 'image', type: 'image', capabilityId: 'image', label: '图像', sub: '生成或编辑图片，支持参考图', icon: <PictureOutlined /> },
  { id: 'video', type: 'image', capabilityId: 'video', label: '视频', sub: '文生视频或用图片生成视频', icon: <VideoCameraOutlined /> },
  { id: 'audio', type: 'image', capabilityId: 'audio', label: '音频', sub: '文本转语音，选择音色与语气', icon: <CustomerServiceOutlined /> },
  { id: 'digital-human', type: 'image', capabilityId: 'virtualman', label: '数字人', sub: '头像与音频驱动数字人口播', icon: <UserOutlined /> },
  { id: 'aigc-material', type: 'material', label: 'AIGC素材', sub: '上传媒体并登记为可复用素材', icon: <AppstoreOutlined /> },
  { id: '3d', type: 'image', capabilityId: '3d', label: '3D', sub: '通过文字、图片或模型生成 3D', icon: <ExperimentOutlined /> },
];

// smart-pill + smart-popover 参数控件(纯 CSS hover 展开,对齐参考 smart-canvas 的 .smart-control)
function PillSelect({
  icon,
  typeLabel,
  value,
  options,
  onChange,
  customSeconds = false,
}: {
  icon: JSX.Element;
  typeLabel: string;
  value?: string;
  options: ModelOpt[];
  onChange: (v: string) => void;
  customSeconds?: boolean;
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
          <span className="size-picker-value">{cur?.label ?? (customSeconds && value ? `${value}s` : '默认')}</span>
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
        {customSeconds && (
          <label className="duration-custom">
            <span>自定义</span>
            <input
              key={value}
              type="number"
              min={1}
              max={60}
              step={1}
              defaultValue={value || '5'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              onBlur={(e) => {
                const seconds = Math.max(1, Math.min(60, Math.round(Number(e.currentTarget.value) || 5)));
                e.currentTarget.value = String(seconds);
                onChange(String(seconds));
              }}
              aria-label="自定义视频时长（秒）"
            />
            <b>s</b>
          </label>
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

// 光标前的 "@xxx" 片段,没有就返回 null(null = 不展开候选菜单)
function mentionQueryAt(value: string, caret: number): string | null {
  const match = value.slice(0, caret).match(/@([^@\s]*)$/);
  return match ? match[1] : null;
}

// 把 @素材 写进提示词,并同步 mentionMaterials / refs。
// 已由上游连线带进来的图(derivedRefs)不再塞进手动 refs,否则输入区会重复出现同一张缩略图。
function applyMention(
  prompt: string,
  caret: number,
  m: CanvasMaterial,
  mentionMaterials: CanvasMaterial[],
  refs: string[],
  derivedRefs: string[],
): Record<string, unknown> {
  const before = prompt.slice(0, caret).replace(/@[^@\s]*$/, `@${m.name} `);
  return {
    prompt: before + prompt.slice(caret),
    mentionMaterials: [...mentionMaterials.filter((x) => x.nodeId !== m.nodeId), m],
    refs: m.category === 'Image' && !derivedRefs.includes(m.url) ? Array.from(new Set([...refs, m.url])) : refs,
  };
}

const MATERIAL_KIND_LABEL: Record<string, string> = { Image: '图片', Video: '视频', Audio: '音频', Model: '3D' };

function materialIcon(m: CanvasMaterial) {
  if (m.sourceType === 'material') return <AppstoreOutlined />;
  if (m.category === 'Image') return <PictureOutlined />;
  if (m.category === 'Video') return <VideoCameraOutlined />;
  return <CustomerServiceOutlined />;
}

// @ 候选菜单(生成栏和展开大窗共用)
function MentionMenu({
  query,
  materials,
  className,
  onPick,
}: {
  query: string;
  materials: CanvasMaterial[];
  className?: string;
  onPick: (m: CanvasMaterial) => void;
}) {
  const hits = materials.filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className={`material-mention-menu${className ? ` ${className}` : ''}`}>
      {hits.slice(0, 8).map((m) => (
        <button key={m.nodeId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(m)}>
          {materialIcon(m)}
          <span>{m.name}</span>
          <small>{m.sourceType === 'material' ? '素材' : MATERIAL_KIND_LABEL[m.category] || m.category}</small>
        </button>
      ))}
      {hits.length === 0 && <div className="material-mention-empty">没有匹配的已连接输入</div>}
    </div>
  );
}

// ============ composer 生成栏(独立组件,useViewport 跟随选中节点,不随视口重渲染整棵画布) ============
function Composer({
  anchor,
  modelsByType,
  running,
  derivedRefs,
  derivedAudio,
  derivedVideo,
  derivedModel3d,
  upstreamPrompt,
  onPatch,
  onRun,
  onAddRef,
  materials,
  onExpandPrompt,
  onAddPrompt,
}: {
  anchor: RFNode | null;
  modelsByType: ModelsByType;
  running: boolean;
  derivedRefs: string[];
  derivedAudio: string[];
  derivedVideo: string[];
  derivedModel3d: string[];
  upstreamPrompt: string;
  onPatch: (patch: Record<string, unknown>) => void;
  onRun: () => void;
  onAddRef: (file: File) => void;
  materials: CanvasMaterial[];
  onExpandPrompt: () => void;
  onAddPrompt: () => void;
}) {
  const vp = useViewport();
  const refInput = useRef<HTMLInputElement>(null);
  const promptSelection = useRef({ start: 0, end: 0 });
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const anchorId = anchor?.id;
  // 换选中节点时停掉正在试听的音频,免得声音跟着跑到别的节点上
  useEffect(() => {
    audioEl.current?.pause();
    setPlayingAudio(null);
  }, [anchorId]);
  if (!anchor) return <div className="composer" />;

  const d = anchor.data || {};
  const cap = capById(d.kind);
  const activeGroup = composerGroupFor(cap.id);
  const models = modelsForCap(cap, modelsByType);
  const w = anchor.width || 240;
  const h = anchor.height || 160;
  const left = anchor.position.x * vp.zoom + vp.x + (w * vp.zoom) / 2 - COMPOSER_W / 2;
  const top = (anchor.position.y + h) * vp.zoom + vp.y + 14;

  const manualRefs: string[] = d.refs || [];
  // 上游连线已经带进来的图不再重复展示一遍(老文档里 @素材 可能已写进 refs),
  // 展示顺序与真正下发的参考图顺序(derived 在前、manual 去重在后)保持一致。
  const extraRefs = manualRefs
    .map((url, index) => ({ url, index }))
    .filter((it) => !derivedRefs.includes(it.url));
  const paramDefs = cap.params(d, models);
  const n: number = d.count || 1;
  const refRoles = cap.id === 'tryon' ? tryOnRoles(d) : [];
  const populatedRefCount = derivedRefs.length + extraRefs.length;
  // 图片 / 视频 / 音频共用一条缩略图,视频音频不再各自占一整行。
  // 节点自身的视频/音频结果在节点卡片上已经能看能播,这里只展示上游连进来的,不重复占位。
  const upstreamVideo = derivedVideo.filter((u) => u !== d.videoUrl);
  const upstreamAudio = derivedAudio.filter((u) => u !== d.audioUrl);
  // 3D→3D 操作的输入模型:节点自身的模型在卡片上已经能看,这里只显示上游连进来的。
  const upstreamModel3d = cap.output === 'model3d' ? derivedModel3d.filter((u) => u !== d.model3dUrl) : [];
  const refsHintText = typeof cap.refsHint === 'function' ? cap.refsHint(d) : cap.refsHint;
  const threeDNeedsModel = cap.output === 'model3d' && THREED_NEEDS_MODEL.includes(threeDOpOf(d.model));
  const noImageThumb = populatedRefCount === 0;
  const noThumbs = noImageThumb && upstreamVideo.length + upstreamAudio.length + upstreamModel3d.length === 0 && !cap.usesAudio;
  const showThumbRow = cap.usesRefs || cap.usesAudio || upstreamAudio.length > 0 || upstreamVideo.length > 0 || upstreamModel3d.length > 0;

  // 输入缩略图合成一条可拖拽排序的列表。顺序是有语义的(首帧、换装的模特/上衣/下装、
  // 多帧关键帧次序),所以拖完写回 data.inputOrder,runGenerator 用同一个 applyInputOrder 下发。
  type ThumbItem = { url: string; kind: 'image' | 'video' | 'audio' | 'model3d'; manualIndex?: number };
  const baseThumbs: ThumbItem[] = [
    ...(cap.usesRefs ? derivedRefs.map((url) => ({ url, kind: 'image' as const })) : []),
    ...(cap.usesRefs ? extraRefs.map((r) => ({ url: r.url, kind: 'image' as const, manualIndex: r.index })) : []),
    ...upstreamVideo.map((url) => ({ url, kind: 'video' as const })),
    ...upstreamAudio.map((url) => ({ url, kind: 'audio' as const })),
    ...upstreamModel3d.map((url) => ({ url, kind: 'model3d' as const })),
  ];
  const thumbs = applyInputOrder(baseThumbs, d.inputOrder as string[], (it) => it.url);
  // 换装的「模特图 / 上衣图」角标跟位置走,不跟图走:拖到第一位的那张就是模特图。
  const thumbRoles = new Map<string, string>();
  let imageSeq = 0;
  for (const it of thumbs) {
    if (it.kind !== 'image') continue;
    if (refRoles[imageSeq]) thumbRoles.set(it.url, refRoles[imageSeq]);
    imageSeq += 1;
  }
  // 通用视频节点:每张图可点角标指派「首帧 / 尾帧 / 参考」。不点就是老语义 —— 第一张作首帧。
  const framePicker = cap.id === 'video';
  const frameRoles = frameRolesOf(d);
  const frameImages = thumbs.filter((it) => it.kind === 'image').map((it) => it.url);
  const resolvedFrames = resolveFrames(frameImages, d);
  const frameLabelOf = (url: string) =>
    url === resolvedFrames.first ? '首帧' : url === resolvedFrames.last ? '尾帧' : '参考';
  // 点一下轮换:首帧 → 尾帧 → 参考 → 首帧…… 三态都是显式的,从当前显示的角色往下推,
  // 所以单图(默认显示首帧)点一下就能走到尾帧、再一下走到参考。首/尾帧各只能有一张,
  // 被抢时原来那张让回参考;参考不唯一,不做抢占。
  const cycleFrameRole = (url: string) => {
    const shown: FrameRole = frameRoles[url]
      || (url === resolvedFrames.first ? 'first' : url === resolvedFrames.last ? 'last' : 'ref');
    const next: FrameRole = shown === 'first' ? 'last' : shown === 'last' ? 'ref' : 'first';
    const roles: Record<string, FrameRole> = {};
    for (const [k, v] of Object.entries(frameRoles)) {
      if (k !== url && !(next !== 'ref' && v === next)) roles[k] = v;
    }
    roles[url] = next;
    onPatch({ frameRole: roles });
  };
  const moveThumb = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const urls = thumbs.map((t) => t.url);
    const [moved] = urls.splice(from, 1);
    urls.splice(to, 0, moved);
    onPatch({ inputOrder: urls });
  };
  // 拖拽 props 直接挂在缩略块本身,不额外包一层容器(包一层会破坏这行的 flex 布局)
  const dragProps = (i: number) => ({
    draggable: thumbs.length > 1,
    'data-drag': dragFrom === i ? 'src' : dragOver === i ? 'over' : undefined,
    onDragStart: (e: ReactDragEvent) => {
      setDragFrom(i);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i)); // Firefox 不 setData 不会启动拖拽
    },
    onDragOver: (e: ReactDragEvent) => {
      if (dragFrom === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOver !== i) setDragOver(i);
    },
    onDrop: (e: ReactDragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragFrom !== null) moveThumb(dragFrom, i);
      setDragFrom(null);
      setDragOver(null);
    },
    onDragEnd: () => {
      setDragFrom(null);
      setDragOver(null);
    },
  });
  const toggleAudio = (url: string) => {
    const el = audioEl.current;
    if (!el) return;
    if (playingAudio === url) {
      el.pause();
      setPlayingAudio(null);
      return;
    }
    el.src = url;
    el.currentTime = 0;
    el.play().then(() => setPlayingAudio(url)).catch(() => setPlayingAudio(null));
  };
  const emotionRanges = (d.emotionRanges || []) as EmotionRange[];
  const emotionChunks = cap.id === 'audio' && emotionRanges.length ? buildEmotionChunks(d.prompt || '', emotionRanges) : [];

  return (
    <div className="composer open" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="composer-card">
        <div className="composer-head">
          <div className="composer-head-left">
            <div className="kind-toggle">
              {COMPOSER_GROUPS.map((group) => (
                <button key={group.id} type="button" className={activeGroup.id === group.id ? 'active' : ''} onClick={() => {
                  if (group.id === 'prompt') return onAddPrompt();
                  const next = capById(group.caps[0]);
                  onPatch(capDefault(next, modelsForCap(next, modelsByType)));
                }}>
                  {group.icon}<span>{group.label}</span>
                </button>
              ))}
            </div>
          </div>
          <span className="composer-head-hint">模桥</span>
        </div>

        {showThumbRow && (
          <div className="input-thumbs-row has-items">
            <div className={`input-thumb-list${noThumbs ? ' empty' : ''}`}>
              {/* 图片 / 视频 / 音频 / 3D 模型混在一条,拖动可改顺序(顺序决定首帧、换装角色等语义) */}
              {thumbs.map((it, i) =>
                it.kind === 'image' ? (
                  <div
                    className={`input-thumb${it.manualIndex === undefined ? ' input-self' : ''}`}
                    key={`i${it.url}`}
                    title={`${it.manualIndex === undefined ? '来自节点自身 / 上游' : '手动添加'}${thumbs.length > 1 ? '(可拖动排序)' : ''}`}
                    {...dragProps(i)}
                  >
                    <img src={it.url} alt="" draggable={false} />
                    {framePicker ? (
                      <button
                        type="button"
                        className={`input-thumb-role frame-pick${it.url === resolvedFrames.first || it.url === resolvedFrames.last ? ' set' : ''}`}
                        title="点击切换这张图的用途:首帧 → 尾帧 → 参考"
                        onClick={() => cycleFrameRole(it.url)}
                      >
                        {frameLabelOf(it.url)}
                      </button>
                    ) : thumbRoles.get(it.url) ? (
                      <span className="input-thumb-role">{thumbRoles.get(it.url)}</span>
                    ) : null}
                    {it.manualIndex !== undefined && (
                      <button
                        className="input-thumb-remove"
                        title="移除参考图"
                        onClick={() => onPatch({ refs: manualRefs.filter((_, j) => j !== it.manualIndex) })}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : it.kind === 'video' ? (
                  /* 参考视频:同样走缩略图,悬停播放首几秒,不再单独占一整行 */
                  <div
                    className="input-thumb input-self thumb-media"
                    key={`v${it.url}`}
                    title={`参考视频(悬停预览${thumbs.length > 1 ? ',可拖动排序' : ''})`}
                    onMouseEnter={(e) => {
                      const v = e.currentTarget.querySelector('video');
                      if (v) v.play().catch(() => undefined);
                    }}
                    onMouseLeave={(e) => {
                      const v = e.currentTarget.querySelector('video');
                      if (v) {
                        v.pause();
                        v.currentTime = 0;
                      }
                    }}
                    {...dragProps(i)}
                  >
                    <video src={`${it.url}#t=0.1`} muted loop playsInline preload="metadata" draggable={false} />
                    <span className="input-thumb-tag">
                      <VideoCameraOutlined />
                    </span>
                  </div>
                ) : it.kind === 'audio' ? (
                  /* 音频没有画面,整块就是一个麦克风按钮:点一下试听(图标变跳动音波),再点停 */
                  <button
                    type="button"
                    className={`input-thumb input-self thumb-media thumb-audio${playingAudio === it.url ? ' playing' : ''}`}
                    key={`a${it.url}`}
                    title={`${cap.usesAudio ? '驱动' : '参考'}音频(点击${playingAudio === it.url ? '停止' : '试听'}${thumbs.length > 1 ? ',可拖动排序' : ''})`}
                    onClick={() => toggleAudio(it.url)}
                    {...dragProps(i)}
                  >
                    {playingAudio === it.url ? (
                      <span className="audio-wave" aria-label="播放中">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <AudioOutlined />
                    )}
                  </button>
                ) : (
                  /* 3D→3D 的输入模型:纹理/减面/绑骨蒙皮等以它为主入参 */
                  <div
                    className="input-thumb input-self thumb-media thumb-model3d"
                    key={`m${it.url}`}
                    title={`输入 3D 模型 ${threeDModelType(it.url) || ''}`}
                    {...dragProps(i)}
                  >
                    <ExperimentOutlined />
                    <span className="input-thumb-tag">{threeDModelType(it.url) || '3D'}</span>
                  </div>
                ),
              )}
              {cap.usesAudio && upstreamAudio.length === 0 && (
                <div className="input-thumb-slot" title={cap.audioHint || '上游连一个音频/TTS 节点作驱动音频'}>
                  <AudioOutlined />
                  <span>驱动音频</span>
                </div>
              )}
              {threeDNeedsModel && upstreamModel3d.length === 0 && (
                <div className="input-thumb-slot" title={refsHintText}>
                  <ExperimentOutlined />
                  <span>输入模型</span>
                </div>
              )}
              {cap.usesRefs && refRoles.slice(populatedRefCount).map((role) => (
                <button className="input-role-slot" type="button" key={role} onClick={() => refInput.current?.click()}>
                  <PlusOutlined />
                  <span>{role}</span>
                </button>
              ))}
              {cap.usesRefs && noImageThumb && refRoles.length === 0 && (
                <span className="input-thumb-count">
                  {refsHintText
                    || (upstreamVideo.length || upstreamAudio.length
                      ? '可继续加图片参考'
                      : cap.output === 'video'
                        ? '连接/加图片作首帧(可空,纯文生视频)'
                        : '连接素材或点右侧＋加参考图')}
                </span>
              )}
              {/* 有图时才提示角标怎么用 —— 空态提示上面已经占了,这条只在看得见缩略图时出现 */}
              {framePicker && !noImageThumb && (
                <span className="input-thumb-count">点图上角标可指定首帧 / 尾帧</span>
              )}
            </div>
            <audio ref={audioEl} style={{ display: 'none' }} onEnded={() => setPlayingAudio(null)} />
            {cap.usesRefs && (
              <>
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
              </>
            )}
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
          <div className="prompt-tools">
            {!!String(d.prompt || '').length && <span className="prompt-count">{String(d.prompt).length} 字</span>}
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
            <button className="prompt-expand-btn" type="button" title="展开成大窗口编辑" onClick={onExpandPrompt}>
              <FullscreenOutlined />
              <span>展开</span>
            </button>
          </div>
          <textarea
            className="prompt-input"
            value={d.prompt || ''}
            onChange={(e) => {
              const value = e.target.value;
              promptSelection.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
              setMentionQuery(mentionQueryAt(value, e.target.selectionStart));
              onPatch({ prompt: value, ...(cap.id === 'audio' ? { emotionRanges: [] } : {}) });
            }}
            onSelect={(e) => {
              promptSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
            }}
            placeholder={cap.promptPlaceholder}
          />
          {mentionQuery !== null && (
            <MentionMenu
              query={mentionQuery}
              materials={materials}
              onPick={(m) => {
                const value = String(d.prompt || '');
                onPatch(
                  applyMention(
                    value,
                    promptSelection.current.end || value.length,
                    m,
                    (d.mentionMaterials || []) as CanvasMaterial[],
                    (d.refs || []) as string[],
                    derivedRefs,
                  ),
                );
                setMentionQuery(null);
              }}
            />
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
            {activeGroup.caps.length > 1 && (
              <PillSelect
                icon={activeGroup.icon}
                typeLabel="能力"
                value={cap.id}
                options={activeGroup.caps.map((id) => ({ value: id, label: capById(id).label }))}
                onChange={(id) => {
                  const next = capById(id);
                  onPatch(capDefault(next, modelsForCap(next, modelsByType)));
                }}
              />
            )}
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
                customSeconds={cap.id === 'video' && p.field === 'duration'}
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
            {running ? '生成中' : d.isResult ? '重新运行' : '运行'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 提示词展开大窗(视频类提示词很长,小框里不好写) ============
function PromptModal({
  capLabel,
  placeholder,
  isAudio,
  prompt,
  mentionMaterials,
  refs,
  derivedRefs,
  materials,
  onPatch,
  onClose,
}: {
  capLabel: string;
  placeholder?: string;
  isAudio: boolean;
  prompt: string;
  mentionMaterials: CanvasMaterial[];
  refs: string[];
  derivedRefs: string[];
  materials: CanvasMaterial[];
  onPatch: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef(prompt.length);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (mentionQuery !== null) setMentionQuery(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mentionQuery, onClose]);

  return (
    <div className="prompt-modal" onMouseDown={onClose}>
      <div className="prompt-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="prompt-modal-head">
          <span className="prompt-modal-title">提示词 · {capLabel}</span>
          <span className="prompt-modal-count">{prompt.length} 字</span>
          <button className="prompt-modal-close" type="button" title="收起 (Esc)" onClick={onClose}>
            <FullscreenExitOutlined />
          </button>
        </div>
        <div className="prompt-modal-body">
          <textarea
            ref={areaRef}
            className="prompt-modal-input"
            value={prompt}
            onChange={(e) => {
              const value = e.target.value;
              caretRef.current = e.target.selectionStart;
              setMentionQuery(mentionQueryAt(value, e.target.selectionStart));
              onPatch({ prompt: value, ...(isAudio ? { emotionRanges: [] } : {}) });
            }}
            onSelect={(e) => {
              caretRef.current = e.currentTarget.selectionEnd;
            }}
            placeholder={placeholder}
          />
          {mentionQuery !== null && (
            <MentionMenu
              query={mentionQuery}
              materials={materials}
              className="in-modal"
              onPick={(m) => {
                onPatch(applyMention(prompt, caretRef.current || prompt.length, m, mentionMaterials, refs, derivedRefs));
                setMentionQuery(null);
                areaRef.current?.focus();
              }}
            />
          )}
        </div>
        <div className="prompt-modal-foot">
          <span>输入 @ 可引用已连接的素材 / 图片 / 视频 · 编辑实时保存</span>
          <button className="prompt-modal-done" type="button" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 提示词节点的展开大窗(纯文本,不带 @素材;节点小框写长文太挤) ============
function PromptNodeModal({ text, onChange, onClose }: { text: string; onChange: (v: string) => void; onClose: () => void }) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="prompt-modal" onMouseDown={onClose}>
      <div className="prompt-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="prompt-modal-head">
          <span className="prompt-modal-title">提示词节点</span>
          <span className="prompt-modal-count">{text.length} 字</span>
          <button className="prompt-modal-close" type="button" title="收起 (Esc)" onClick={onClose}>
            <FullscreenExitOutlined />
          </button>
        </div>
        <div className="prompt-modal-body">
          <textarea
            ref={areaRef}
            className="prompt-modal-input"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder="提示词…(连到图片节点上游作 prompt;也可用节点上的 AI 扩写/精炼)"
          />
        </div>
        <div className="prompt-modal-foot">
          <span>编辑实时保存 · 可在节点上用 AI 扩写/精炼</span>
          <button className="prompt-modal-done" type="button" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

type DocMeta = { id: number; title: string; icon: string };
type MenuState = {
  x: number;
  y: number;
  spawnX?: number;
  spawnY?: number;
  source?: string | null;
  target?: string | null;
  side?: 'left' | 'right';
  title?: string;
  mode?: 'commands' | 'create';
};
type GraphSnapshot = { nodes: RFNode[]; edges: RFEdge[] };
type MediaMenuState = { x: number; y: number; nodeId: string };

function CanvasInner() {
  const { apiKey, setApiKey } = usePlaygroundApiKey();
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [modelsByType, setModelsByType] = useState<ModelsByType>({});
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [docId, setDocId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [runState, setRunState] = useState<Record<string, RunInfo>>({});
  const [connecting, setConnecting] = useState(false);
  const [saveHint, setSaveHint] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [, setHistoryTick] = useState(0);
  const [mediaMenu, setMediaMenu] = useState<MediaMenuState | null>(null);
  const [materialLibraryOpen, setMaterialLibraryOpen] = useState(false);
  const [storedMaterials, setStoredMaterials] = useState<StoredCanvasMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [preview, setPreview] = useState<{ images: string[]; index: number } | null>(null);
  // 记节点 id 而不是布尔:切走选中节点时大窗自动关掉,不会串到别的节点上
  const [promptExpanded, setPromptExpanded] = useState<string | null>(null);
  const [promptNodeExpanded, setPromptNodeExpanded] = useState<string | null>(null); // 提示词节点的大窗
  const [liveSeed, setLiveSeed] = useState<DhLiveSeed | null>(null);
  const [liveVoices, setLiveVoices] = useState<LiveVoice[]>([]);
  const [loadTick, setLoadTick] = useState(0); // 文档载入完成计数,触发续轮询扫描
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [canvasPanelOpen, setCanvasPanelOpen] = useState(false);
  const [fabPos, setFabPos] = useState({ x: 24, y: 260 });
  const [fabDocked, setFabDocked] = useState<'left' | 'right' | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const rootRef = useRef<HTMLDivElement>(null);
  const contextUploadRef = useRef<HTMLInputElement>(null);
  const contextSpawnRef = useRef({ x: 0, y: 0 });
  const historyRef = useRef<GraphSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const applyingHistoryRef = useRef(false);
  const activeDownloadsRef = useRef(new Set<string>());
  const loadingRef = useRef(true);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const connectingRef = useRef<string | null>(null);
  const connectingSideRef = useRef<'source' | 'target'>('source');
  const menuRef = useRef<HTMLDivElement>(null);
  const fabDragRef = useRef<{ pointerId: number; sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean } | null>(null);
  const pollRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // 画布历史忽略 selected / measured 等 ReactFlow 运行态，只记录可持久化的业务图。
  useEffect(() => {
    if (loadingRef.current || applyingHistoryRef.current) return undefined;
    const t = setTimeout(() => {
      const snapshot: GraphSnapshot = {
        nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data } as RFNode)),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle, data }) => ({ id, source, target, sourceHandle, targetHandle, data } as RFEdge)),
      };
      const signature = JSON.stringify(snapshot);
      const current = historyRef.current[historyIndexRef.current];
      if (current && JSON.stringify(current) === signature) return;
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1).concat(snapshot).slice(-60);
      historyIndexRef.current = historyRef.current.length - 1;
      setHistoryTick((n) => n + 1);
    }, 250);
    return () => clearTimeout(t);
  }, [nodes, edges, loadTick]);
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

  // 全屏期间浏览器只渲染 .cs-root 子树,挂在 body 上的 toast 会看不见(生成失败提示也在里面),
  // 所以把 message 容器临时改挂到画布根节点上,退出全屏再还回 body。
  useEffect(() => {
    message.config({ getContainer: () => (isFullscreen && rootRef.current) || document.body });
    return () => message.config({ getContainer: () => document.body });
  }, [isFullscreen]);

  // 换 key / 退出:画布是整页铺满(还能全屏)的,没有这个入口就只能切到别的 Tab 才能改 key。
  // 切 key 前先停掉自动保存和轮询 —— 旧文档属于旧 key,拿新 key 去 PUT 只会 404。
  const quitCurrentDoc = useCallback(() => {
    loadingRef.current = true;
    Object.values(pollRef.current).forEach((t) => clearTimeout(t));
    pollRef.current = {};
    setDocId(null);
    setDocs([]);
    setNodes([]);
    setEdges([]);
    setRunState({});
    setKeyPanelOpen(false);
  }, [setNodes, setEdges]);

  const switchKey = useCallback(() => {
    const next = keyDraft.trim();
    if (!next) return void message.warning('先填入新的 API Key');
    if (next === apiKey) return void setKeyPanelOpen(false);
    quitCurrentDoc();
    setApiKey(next); // apiKey 变化会重新拉画布列表并打开第一张
    setKeyDraft('');
    message.success('已切换密钥');
  }, [keyDraft, apiKey, quitCurrentDoc, setApiKey]);

  const signOutKey = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    quitCurrentDoc();
    setKeyDraft('');
    setApiKey(''); // 清空后回到「填入 API Key 使用画布」
  }, [quitCurrentDoc, setApiKey]);

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

  const sendCanvasChat = useCallback(async () => {
    const content = chatDraft.trim();
    const model = chatModel || modelsByType.chat?.[0]?.value;
    if (!content || chatSending) return;
    if (!model) return void message.warning('没有可用的对话模型');
    const nextMessages = [...chatMessages, { role: 'user' as const, content }];
    setChatMessages(nextMessages);
    setChatDraft('');
    setChatSending(true);
    try {
      const r = await authFetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: nextMessages, stream: false }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error?.message || body?.message || `HTTP ${r.status}`);
      const answer = body?.choices?.[0]?.message?.content || '';
      setChatMessages((items) => [...items, { role: 'assistant', content: answer || '未返回内容' }]);
    } catch (err: any) {
      message.error(`对话失败：${err?.message || String(err)}`);
    } finally {
      setChatSending(false);
    }
  }, [chatDraft, chatModel, chatMessages, chatSending, modelsByType.chat, authFetch]);

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
      historyRef.current = [];
      historyIndexRef.current = -1;
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

  // 删除当前画布(后端软删)。已上传/生成的素材归 user 不归画布,不跟着删,
  // 别的画布里引用同一批素材的节点不受影响。
  const deleteDoc = useCallback(() => {
    if (!docId) return;
    const id = docId;
    const cur = docs.find((d) => d.id === id);
    Modal.confirm({
      title: '删除这个画布?',
      content: `「${cur?.title || '未命名画布'}」的节点和连线会一起删除,已生成的素材保留在素材库里。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      // 全屏时浏览器只渲染 .cs-root 子树,挂到 body 的弹窗会整个看不见
      getContainer: () => rootRef.current || document.body,
      onOk: async () => {
        // 先掐掉自动保存和轮询:否则删完这一拍的防抖保存会 PUT 回一个已删的文档
        loadingRef.current = true;
        Object.values(pollRef.current).forEach((t) => clearTimeout(t));
        pollRef.current = {};
        try {
          const r = await authFetch(`/v1/canvas/documents/${id}`, { method: 'DELETE' });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}) as any);
            throw new Error(j?.message || `HTTP ${r.status}`);
          }
        } catch (e: any) {
          loadingRef.current = false;
          message.error(e?.message || '删除失败');
          return;
        }
        setDocId(null);
        try {
          const list = await loadList();
          const next = list.find((d) => d.id !== id);
          if (next) await openDoc(next.id); // 切到剩下的第一个
          else await createDoc(); // 一个都不剩:直接开一张空画布,不留白屏
        } catch {
          loadingRef.current = false;
        }
        message.success('画布已删除');
      },
    });
  }, [docId, docs, authFetch, loadList, openDoc, createDoc]);

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

  const onFabPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    fabDragRef.current = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, ox: fabPos.x, oy: fabPos.y, x: fabPos.x, y: fabPos.y, moved: false };
    setFabDocked(null);
  }, [fabPos]);
  const onFabPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = fabDragRef.current;
    const root = rootRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !root) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      setFabOpen(false);
      setCanvasPanelOpen(false);
    }
    if (!drag.moved) return;
    const rect = root.getBoundingClientRect();
    drag.x = Math.max(0, Math.min(drag.ox + dx, rect.width - 56));
    drag.y = Math.max(8, Math.min(drag.oy + dy, rect.height - 64));
    setFabPos({ x: drag.x, y: drag.y });
  }, []);
  const onFabPointerUp = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = fabDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    fabDragRef.current = null;
    if (!drag.moved) {
      setCanvasPanelOpen(false);
      setFabOpen((v) => !v);
      return;
    }
    const width = rootRef.current?.getBoundingClientRect().width || 0;
    if (drag.x <= 42) {
      setFabDocked('left');
      setFabPos({ x: -8, y: drag.y });
    } else if (width && drag.x >= width - 98) {
      setFabDocked('right');
      setFabPos({ x: width - 48, y: drag.y });
    }
  }, []);

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
  const selectBatch = useCallback((id: string, index: number) => {
    setNodes((nds) => nds.map((nd) => {
      if (nd.id !== id) return nd;
      const batches = (nd.data?.generationBatches || []) as GenerationBatch[];
      const batch = batches[index];
      if (!batch) return nd;
      return {
        ...nd,
        data: {
          ...nd.data,
          ...outputSnapshot(batch.videoUrl ? 'video' : batch.audioUrl ? 'audio' : batch.model3dUrl ? 'model3d' : 'image',
            batch.images || [batch.videoUrl || batch.audioUrl || batch.model3dUrl || ''].filter(Boolean)),
          activeBatch: index,
        },
      };
    }));
  }, [setNodes]);
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
    (type: string, screenX: number, screenY: number, source: string | null, capabilityId?: string, target?: string | null) => {
      const pos = rf.screenToFlowPosition({ x: screenX, y: screenY });
      const id = `${type}_${Date.now().toString(36)}`;
      const data =
        type === 'image'
          ? (() => {
              const cap = capById(capabilityId || 'image');
              return { images: [], prompt: '', ...capDefault(cap, modelsForCap(cap, modelsByType)) };
            })()
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
      if (target) setEdges((eds) => addEdge({ source: id, target } as Connection, eds));
      return id;
    },
    [rf, modelsByType, setNodes, setEdges],
  );

  const applyHistory = useCallback((offset: -1 | 1) => {
    const nextIndex = historyIndexRef.current + offset;
    const snapshot = historyRef.current[nextIndex];
    if (!snapshot) return;
    applyingHistoryRef.current = true;
    historyIndexRef.current = nextIndex;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setHistoryTick((n) => n + 1);
    requestAnimationFrame(() => { applyingHistoryRef.current = false; });
    setMenu(null);
  }, [setNodes, setEdges]);

  const openNodeCreate = useCallback((id: string, side: 'left' | 'right', anchor: HTMLElement) => {
    const nodeEl = anchor.closest('.react-flow__node') as HTMLElement | null;
    const rect = nodeEl?.getBoundingClientRect() || anchor.getBoundingClientRect();
    spawnNode(
      'image',
      side === 'right' ? rect.right + 150 : rect.left - 390,
      rect.top + Math.min(rect.height / 2, 100),
      side === 'right' ? id : null,
      'image',
      side === 'left' ? id : null,
    );
    setMenu(null);
    setMediaMenu(null);
  }, [spawnNode]);

  const addNodeCenter = useCallback(
    (type: string, capabilityId?: string) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const off = (nodesRef.current.length % 6) * 26;
      spawnNode(type, rect.left + rect.width / 2 + off, rect.top + rect.height / 3 + off, null, capabilityId);
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
    const own: string[] = self?.data?.taskInputs?.images || self?.data?.images || [];
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    const cap = capById(self?.data?.kind);
    if (cap.combineRefs) {
      const connected: string[] = [];
      for (const sourceId of upIds) {
        const nd = nodesRef.current.find((candidate) => candidate.id === sourceId);
        if (nd?.type === 'material' && nd.data?.srcUrl && nd.data?.assetType === 'Image') connected.push(String(nd.data.srcUrl));
        if (nd?.type === 'image' && Array.isArray(nd.data?.images)) connected.push(...nd.data.images);
      }
      return Array.from(new Set([...own, ...connected]));
    }
    const up: string[] = [];
    // edges 的数组顺序就是接线建立顺序；每个源节点内部继续保持自身素材顺序。
    for (const sourceId of upIds) {
      const nd = nodesRef.current.find((candidate) => candidate.id === sourceId);
      if (nd?.type === 'material' && nd.data?.srcUrl && nd.data?.assetType === 'Image') up.push(String(nd.data.srcUrl));
      if (nd?.type === 'image' && Array.isArray(nd.data?.images)) up.push(...nd.data.images);
    }
    // 单主体能力(图片/视频/特效/3D/数智人):有自身图就只用自身,否则回退上游 —— 不把祖先图也当参考
    return own.length ? Array.from(new Set(own)) : Array.from(new Set(up));
  }, []);

  // 腾讯云图等支持统一多媒体参考的 provider 使用完整 file_infos；素材登记节点的
  // AssetId 必须以 asset:// 传递，不能退化成普通图片 URL，否则真人素材身份会丢失。
  const fileInfosFor = useCallback((nodeId: string): Record<string, string>[] => {
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    const infos: Record<string, string>[] = [];
    let hasFirstFrame = false;
    // 节点自身媒体在前；所有上游严格按入边建立顺序收集，不再按 nodes 顺序或素材类型重排。
    const orderedNodes = [nodesRef.current.find((nd) => nd.id === nodeId), ...upIds.map((id) => nodesRef.current.find((nd) => nd.id === id))]
      .filter(Boolean) as RFNode[];
    for (const nd of orderedNodes) {
      if (nd.type === 'material') {
        if (!nd.data?.assetId) continue;
        const category = String(nd.data.assetType || 'Image');
        const assetId = String(nd.data.assetId);
        infos.push({
          Type: 'Url', Category: category, Url: assetId.startsWith('asset://') ? assetId : `asset://${assetId}`,
          Usage: category === 'Image' && !hasFirstFrame ? 'FirstFrame' : 'Reference',
        });
        if (category === 'Image') hasFirstFrame = true;
        continue;
      }
      const media = nd.id === nodeId && nd.data?.taskInputs ? nd.data.taskInputs : nd.data;
      if (nd.type === 'image' && Array.isArray(media?.images)) {
        for (const url of media.images) {
          infos.push({ Type: 'Url', Category: 'Image', Url: String(url), Usage: hasFirstFrame ? 'Reference' : 'FirstFrame' });
          hasFirstFrame = true;
        }
      }
      const album = (media?.mediaItems || []) as NodeMediaItem[];
      if (album.length) {
        for (const item of album) {
          if (item.kind === 'image') continue;
          infos.push({ Type: 'Url', Category: item.kind === 'video' ? 'Video' : item.kind === 'audio' ? 'Audio' : 'Model', Url: item.url, Usage: 'Reference' });
        }
      } else {
        if (media?.audioUrl) infos.push({ Type: 'Url', Category: 'Audio', Url: String(media.audioUrl), Usage: 'Reference' });
        if (media?.videoUrl) infos.push({ Type: 'Url', Category: 'Video', Url: String(media.videoUrl), Usage: 'Reference' });
      }
    }
    const self = nodesRef.current.find((nd) => nd.id === nodeId);
    for (const material of ((self?.data?.mentionMaterials || []) as CanvasMaterial[])) {
      const refURL = material.referenceUrl || material.url;
      if (material.category === 'Model' || infos.some((info) => info.Url === refURL || info.Url === material.url)) continue;
      infos.push({ Type: 'Url', Category: material.category, Url: refURL, Usage: 'Reference' });
    }
    return infos;
  }, []);

  const upstreamPrompt = useCallback((nodeId: string): string => {
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    return upIds
      .map((id) => nodesRef.current.find((nd) => nd.id === id))
      .filter((nd) => nd?.type === 'prompt')
      .map((nd) => nd?.data?.text)
      .filter(Boolean)
      .join('\n')
      .trim();
  }, []);

  // 驱动音频 = 节点自身 audioUrl + 上游节点 audioUrl(数智人用:上游接一个音频/TTS 节点)
  const audioRefsFor = useCallback((nodeId: string): string[] => {
    const self = nodesRef.current.find((nd) => nd.id === nodeId);
    const ownAudio = self?.data?.taskInputs ? self.data.taskInputs.audioUrl : self?.data?.audioUrl;
    const ownAlbum = (self?.data?.taskInputs?.mediaItems || self?.data?.mediaItems || []) as NodeMediaItem[];
    const own: string[] = ownAlbum.length ? ownAlbum.filter((m) => m.kind === 'audio').map((m) => m.url) : ownAudio ? [ownAudio] : [];
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    const up: string[] = [];
    for (const sourceId of upIds) {
      const nd = nodesRef.current.find((candidate) => candidate.id === sourceId);
      if (!nd) continue;
      const album = (nd.data?.mediaItems || []) as NodeMediaItem[];
      if (album.length) up.push(...album.filter((m) => m.kind === 'audio').map((m) => m.url));
      else if (nd.data?.audioUrl) up.push(nd.data.audioUrl);
    }
    return Array.from(new Set([...own, ...up]));
  }, []);

  // 参考视频 = 节点自身 videoUrl + 上游视频结果。是否能消费由模型
  // supports_reference_video 能力和 provider 在后端共同校验。
  const videoRefsFor = useCallback((nodeId: string): string[] => {
    const self = nodesRef.current.find((nd) => nd.id === nodeId);
    const ownVideo = self?.data?.taskInputs ? self.data.taskInputs.videoUrl : self?.data?.videoUrl;
    const ownAlbum = (self?.data?.taskInputs?.mediaItems || self?.data?.mediaItems || []) as NodeMediaItem[];
    const own: string[] = ownAlbum.length ? ownAlbum.filter((m) => m.kind === 'video').map((m) => m.url) : ownVideo ? [String(ownVideo)] : [];
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    const up = upIds
      .map((id) => nodesRef.current.find((nd) => nd.id === id))
      .filter(Boolean)
      .flatMap((nd) => {
        const album = (nd?.data?.mediaItems || []) as NodeMediaItem[];
        return album.length ? album.filter((m) => m.kind === 'video').map((m) => m.url) : nd?.data?.videoUrl ? [String(nd.data.videoUrl)] : [];
      });
    return Array.from(new Set([...own, ...up]));
  }, []);

  // 输入 3D 模型 = 节点自身 model3dUrl + 上游 3D 节点。3D→3D 操作(纹理/减面/绑骨蒙皮…)
  // 的主入参就是它:既可以是上传节点拖进来的 .glb/.fbx,也可以是上一步生成出来的模型。
  const model3dRefsFor = useCallback((nodeId: string): string[] => {
    const self = nodesRef.current.find((nd) => nd.id === nodeId);
    const ownModel = self?.data?.taskInputs ? self.data.taskInputs.model3dUrl : self?.data?.model3dUrl;
    const ownAlbum = (self?.data?.taskInputs?.mediaItems || self?.data?.mediaItems || []) as NodeMediaItem[];
    const own: string[] = ownAlbum.length ? ownAlbum.filter((m) => m.kind === 'model3d').map((m) => m.url) : ownModel ? [String(ownModel)] : [];
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    const up = upIds
      .map((id) => nodesRef.current.find((nd) => nd.id === id))
      .filter(Boolean)
      .flatMap((nd) => {
        const album = (nd?.data?.mediaItems || []) as NodeMediaItem[];
        return album.length ? album.filter((m) => m.kind === 'model3d').map((m) => m.url) : nd?.data?.model3dUrl ? [String(nd.data.model3dUrl)] : [];
      });
    return Array.from(new Set([...own, ...up]));
  }, []);

  // 上游音色克隆节点的 voice_id(TTS 节点自动复用克隆音色);取最近一个 ready 的
  const cloneVoiceFor = useCallback((nodeId: string): string => {
    const upIds = edgesRef.current.filter((e) => e.target === nodeId).map((e) => e.source);
    for (const sourceId of upIds) {
      const nd = nodesRef.current.find((candidate) => candidate.id === sourceId);
      if (nd?.type === 'clone' && nd.data?.voiceId) return String(nd.data.voiceId);
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

  const commitGeneration = useCallback((targetId: string, output: CapOutput, urls: string[]) => {
    setNodes((nds) => nds.map((nd) => {
      if (nd.id !== targetId) return nd;
      const current = (nd.data?.generationBatches || []) as GenerationBatch[];
      const snapshot = outputSnapshot(output, urls);
      const batch: GenerationBatch = {
        ...snapshot,
        id: `batch_${Date.now().toString(36)}`,
        createdAt: Date.now(),
        prompt: String(nd.data?.genPrompt || ''),
        kind: String(nd.data?.genKind || nd.data?.kind || ''),
      };
      const generationBatches = [...current, batch];
      return { ...nd, data: { ...nd.data, ...snapshot, generationBatches, activeBatch: generationBatches.length - 1, pendingTask: null } };
    }));
  }, [setNodes]);

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
        const uploaded = manualUrl ? null : await playgroundUpload(args.file as File, apiKey, { module: 'aigc_material' });
        const fileUrl = manualUrl || uploaded?.url;
        if (!fileUrl) throw new Error('上传失败');
        updateNodeData(id, { srcUrl: fileUrl, matStatus: 'registering' });
        const r = await authFetch('/v1/aigc/materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_real_person: args.isRealPerson, group_id: args.groupId || '', asset_type: args.assetType,
            file_url: fileUrl, sample_asset_id: uploaded?.id || 0, asset_name: args.name.trim() || args.assetType,
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
      // composer 里拖出来的输入顺序(data.inputOrder)在这里生效 —— 拖第一位的图就是首帧 / 模特图
      const inputOrder = (node.data?.inputOrder as string[]) || [];
      const refs = cap.usesRefs
        ? applyInputOrder(
            Array.from(new Set([...refThumbsFor(anchorId), ...((node.data?.refs as string[]) || [])])),
            inputOrder,
            (u) => u,
          )
        : [];
      const audio = cap.usesAudio || cap.output === 'video' ? applyInputOrder(audioRefsFor(anchorId), inputOrder, (u) => u) : [];
      const models3d = cap.output === 'model3d' ? applyInputOrder(model3dRefsFor(anchorId), inputOrder, (u) => u) : [];
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

      const err = cap.validate({ prompt, refs, audio, models3d, data });
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

      const req = cap.request({ model, prompt, refs, audio, models3d, data });
      // file_infos 也跟着排。登记素材请求使用 asset://，面板缩略图使用 srcUrl，先映射到同一排序键。
      const materialOrderKeys = new Map<string, string>();
      for (const edge of edgesRef.current.filter((e) => e.target === anchorId)) {
        const source = nodesRef.current.find((nd) => nd.id === edge.source);
        if (source?.type !== 'material' || !source.data?.assetId || !source.data?.srcUrl) continue;
        const assetId = String(source.data.assetId);
        materialOrderKeys.set(assetId.startsWith('asset://') ? assetId : `asset://${assetId}`, String(source.data.srcUrl));
      }
      const fileInfos = cap.output === 'video'
        ? applyInputOrder(fileInfosFor(anchorId), inputOrder, (i) => materialOrderKeys.get(i.Url) || i.Url)
        : [];
      if (fileInfos.length > 0) {
        // 用户在 composer 上点过角标指派首/尾帧时,以指派为准 —— 不能再退化成纯 Reference,
        // 否则「这张当首帧、那张当尾帧」的意图会被抹掉。图片按角色标 Usage,音视频仍是 Reference。
        // 只有通用视频能力认这份指派;特效/多帧/模板等有自己的图序语义,别被残留的 frameRole 带偏。
        const { first, last, explicit } = cap.id === 'video'
          ? resolveFrames(refs, node.data)
          : { first: undefined, last: undefined, explicit: false };
        const thumbKey = (info: Record<string, string>) => materialOrderKeys.get(info.Url) || info.Url;
        // Seedance 等上游禁止 FirstFrame/LastFrame 与 Reference media 混用。
        // 单图保持首帧驱动；多图或带音视频时统一切到纯 Reference 模式。
        const referenceMode = fileInfos.length > 1 || fileInfos.some((info) => info.Category !== 'Image');
        if (explicit) {
          req.body.file_infos = fileInfos.map((info) => {
            if (info.Category !== 'Image') return { ...info, Usage: 'Reference' };
            const key = thumbKey(info);
            return { ...info, Usage: key === first ? 'FirstFrame' : key === last ? 'LastFrame' : 'Reference' };
          });
        } else if (referenceMode) {
          req.body.file_infos = fileInfos.map((info) => ({ ...info, Usage: 'Reference' }));
          delete req.body.first_frame_image;
          delete req.body.last_frame_image;
        } else {
          req.body.file_infos = fileInfos;
        }
      }

      // 运行只在当前任务节点内新增结果批次；画布拓扑只由节点两侧的“下一步”入口改变。
      const hasOwn =
        (node.data?.images || []).length > 0 || !!node.data?.videoUrl || !!node.data?.audioUrl || !!node.data?.model3dUrl;
      const targetId = anchorId;
      const taskInputs = node.data?.taskInputs || {
        images: node.data?.images || [], videoUrl: node.data?.videoUrl,
        audioUrl: node.data?.audioUrl, model3dUrl: node.data?.model3dUrl, mediaItems: node.data?.mediaItems || [],
      };
      const legacyBatches: GenerationBatch[] = node.data?.generationBatches || [];
      const generationBatches = legacyBatches.length === 0 && node.data?.isResult && hasOwn
        ? [{
            images: node.data?.images || [], videoUrl: node.data?.videoUrl,
            audioUrl: node.data?.audioUrl, model3dUrl: node.data?.model3dUrl,
            id: `batch_legacy_${Date.now().toString(36)}`, createdAt: Date.now(),
            prompt: String(node.data?.genPrompt || ''), kind: String(node.data?.genKind || node.data?.kind || ''),
          }]
        : legacyBatches;
      updateNodeData(targetId, { isResult: true, genKind: cap.id, genPrompt: prompt, taskInputs, generationBatches });

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
            commitGeneration(targetId, cap.output, [url]);
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
          commitGeneration(targetId, cap.output, [url]);
          clearRun(targetId);
          return;
        }

        if (req.transport === 'syncJSON') {
          // 同步 JSON(3D 格式转换):一次请求直接拿结果 URL,没有 task id 可轮询
          const r = await authFetch(req.path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
          });
          const j = await r.json().catch(() => ({}) as any);
          if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
          const urls = req.extract(j);
          if (!urls.length) throw new Error('上游未返回结果');
          commitGeneration(targetId, cap.output, urls);
          clearRun(targetId);
          return;
        }

        // 异步任务:提交 → (queued/running) 轮询 → succeeded 用 cap.extract 取结果 → 落节点
        const extract = req.extract;
        const pollBase = req.pollBase;
        const done = (task: any) => {
          const urls = extract(task);
          if (!urls.length) return markFailed(targetId, '上游未返回结果');
          commitGeneration(targetId, cap.output, urls);
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
    [authFetch, upstreamPrompt, refThumbsFor, audioRefsFor, model3dRefsFor, fileInfosFor, cloneVoiceFor, pollTask, updateNodeData, uploadAsset, markFailed, clearRun, commitGeneration],
  );

  // 续轮询:节点带 pendingTask(上游 task 未回)时,用其 kind 重建 extract 继续轮询到落节点。
  const resumeTask = useCallback(
    (nd: RFNode) => {
      const pt = nd.data?.pendingTask as { taskId?: string; pollBase?: string } | undefined;
      if (!pt?.taskId || !pt?.pollBase) return;
      const cap = capById(nd.data?.kind);
      const req = cap.request({ model: nd.data?.model || '', prompt: '', refs: [], audio: [], models3d: [], data: nd.data || {} });
      if (req.transport !== 'async') return;
      const extract = req.extract;
      const finish = (task: any) => {
        const urls = extract(task);
        if (!urls.length) return markFailed(nd.id, '上游未返回结果');
        commitGeneration(nd.id, cap.output, urls);
        clearRun(nd.id);
      };
      setRunState((s) => ({ ...s, [nd.id]: { status: 'running', startedAt: Date.now() } }));
      pollTask(nd.id, `${pt.pollBase}${pt.taskId}`, finish);
    },
    [pollTask, markFailed, updateNodeData, clearRun, commitGeneration],
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
      const mediaNode = el.closest<HTMLElement>('[data-canvas-media-node]');
      if (mediaNode?.dataset.canvasMediaNode) {
        const rect = root.getBoundingClientRect();
        setMenu(null);
        setMediaMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, nodeId: mediaNode.dataset.canvasMediaNode });
        return;
      }
      setMediaMenu(null);
      if (el.closest('.react-flow__node, .react-flow__minimap, .react-flow__controls')) {
        setMenu(null);
        return;
      }
      setMenu({ x: e.clientX, y: e.clientY, spawnX: e.clientX, spawnY: e.clientY, source: null, mode: 'commands' });
    };
    document.addEventListener('contextmenu', handler, true);
    return () => document.removeEventListener('contextmenu', handler, true);
  }, []);

  const onConnectStart = useCallback((_: unknown, p: { nodeId: string | null; handleType: string | null }) => {
    connectingRef.current = p.nodeId;
    // 左侧是 target 口:从它拖出来的新节点应当是上游(新 → 当前),不能反向连。
    connectingSideRef.current = p.handleType === 'target' ? 'target' : 'source';
    setConnecting(true);
  }, []);
  // 注意:这里不能再用 ReactFlow 的 onPaneClick 关菜单 —— 拖线松手时 pane 会收到同一次交互的 click
  // (按下在端口、抬起在画布,公共祖先正是 pane),会把下面刚打开的创建菜单立刻清掉。点空白关菜单
  // 交给 document 上的 pointerdown 捕获监听,时机更早也更统一。
  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.classList?.contains('react-flow__pane')) {
        const cx = (e as MouseEvent).clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX;
        const cy = (e as MouseEvent).clientY ?? (e as TouchEvent).changedTouches?.[0]?.clientY;
        const from = connectingRef.current;
        const fromTarget = connectingSideRef.current === 'target';
        // 拖线到空白和节点侧边加号保持一致:先选类型,再在松手处创建并自动连线。
        setMenu({
          x: cx,
          y: cy,
          spawnX: cx,
          spawnY: cy,
          source: fromTarget ? null : from || null,
          target: fromTarget ? from || null : null,
          title: from ? (fromTarget ? '新节点 → 当前节点' : '当前节点 → 新节点') : undefined,
          mode: 'create',
        });
      }
      connectingRef.current = null;
      connectingSideRef.current = 'source';
      setConnecting(false);
    },
    [],
  );

  const addUploadedFiles = useCallback(async (files: File[], x: number, y: number) => {
    const uploaded = await Promise.all(files.map(async (file) => {
      const url = await uploadAsset(file);
      return url ? { url, kind: mediaKindOf(file.type, file.name), name: file.name } as NodeMediaItem : null;
    }));
    const mediaItems = uploaded.filter(Boolean) as NodeMediaItem[];
    if (!mediaItems.length) return;
    const firstKind = mediaItems[0].kind;
    const id = spawnNode('image', x, y, null, firstKind === 'video' ? 'video' : firstKind === 'audio' ? 'audio' : firstKind === 'model3d' ? '3d' : 'image');
    updateNodeData(id, {
      mediaItems,
      images: mediaItems.filter((item) => item.kind === 'image').map((item) => item.url),
      videoUrl: mediaItems.find((item) => item.kind === 'video')?.url,
      audioUrl: mediaItems.find((item) => item.kind === 'audio')?.url,
      model3dUrl: mediaItems.find((item) => item.kind === 'model3d')?.url,
    });
  }, [spawnNode, updateNodeData, uploadAsset]);

  const pasteAtMenu = useCallback(async () => {
    if (!menu) return;
    const x = menu.spawnX ?? menu.x;
    const y = menu.spawnY ?? menu.y;
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => /^(image|video|audio)\//.test(t));
        if (type) files.push(new File([await item.getType(type)], `clipboard.${type.split('/')[1] || 'png'}`, { type }));
      }
      if (files.length) await addUploadedFiles(files, x, y);
      else {
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) throw new Error('剪贴板为空');
        if (/^https?:\/\//i.test(text) && mediaKindOf('', text) !== 'image') {
          const kind = mediaKindOf('', text);
          const id = spawnNode('image', x, y, null, kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : kind === 'model3d' ? '3d' : 'image');
          updateNodeData(id, kind === 'video' ? { videoUrl: text } : kind === 'audio' ? { audioUrl: text } : kind === 'model3d' ? { model3dUrl: text } : { images: [text] });
        } else if (/^https?:\/\//i.test(text)) {
          const id = spawnNode('image', x, y, null, 'image');
          updateNodeData(id, { images: [text] });
        } else {
          const id = spawnNode('prompt', x, y, null);
          updateNodeData(id, { text });
        }
      }
    } catch (e: any) {
      message.warning(e?.message || '无法读取剪贴板，请允许浏览器访问');
    }
    setMenu(null);
  }, [menu, addUploadedFiles, spawnNode, updateNodeData]);

  const pickCreate = useCallback(
    (type: string, capabilityId?: string) => {
      if (!menu) return;
      spawnNode(type, menu.spawnX ?? menu.x, menu.spawnY ?? menu.y, menu.source || null, capabilityId, menu.target || null);
      setMenu(null);
    },
    [menu, spawnNode],
  );

  // 菜单贴着松手点/右键点弹出,靠近画布右下角时会溢出视口 —— 渲染后量一次实际尺寸再往回收。
  const [menuShift, setMenuShift] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!menu) {
      setMenuShift({ x: 0, y: 0 });
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuShift({
      x: Math.min(0, window.innerWidth - 12 - (menu.x + r.width)),
      y: Math.min(0, window.innerHeight - 12 - (menu.y + r.height)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu && !mediaMenu) return undefined;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.create-menu, .node-context-menu')) return;
      setMenu(null);
      setMediaMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setMediaMenu(null); }
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, mediaMenu]);

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

  const fetchCanvasMediaResponse = useCallback(async (url: string, filename: string): Promise<Response> => {
    const response = await authFetch('/v1/canvas/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, filename }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message || body?.error?.message || `下载失败 (HTTP ${response.status})`);
    }
    return response;
  }, [authFetch]);

  const fetchCanvasMedia = useCallback(async (url: string, filename: string): Promise<Blob> => {
    const response = await fetchCanvasMediaResponse(url, filename);
    return response.blob();
  }, [fetchCanvasMediaResponse]);

  const downloadMedia = useCallback(async (url: string, category: CanvasMaterial['category']) => {
    // 3D 模型没有固定后缀,取 URL 上的真实后缀;一律 .bin 的话下下来本地打不开。
    const urlExt = (url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
    const ext = category === 'Image' ? 'png' : category === 'Video' ? 'mp4' : category === 'Audio' ? 'mp3' : urlExt || 'bin';
    const fallbackName = `canvas-${Date.now()}.${ext}`;
    if (activeDownloadsRef.current.has(url)) {
      message.info('这个文件正在下载');
      return;
    }
    activeDownloadsRef.current.add(url);
    const messageKey = `canvas-download-${Date.now()}`;
    try {
      const picker = (window as any).showSaveFilePicker as ((options: any) => Promise<any>) | undefined;
      let fileHandle: any;
      if (picker) {
        fileHandle = await picker({ suggestedName: fallbackName });
      }

      message.loading({ content: '正在下载…', duration: 0, key: messageKey });
      const response = await fetchCanvasMediaResponse(url, fallbackName);

      // Chromium 系浏览器可直接把响应流写入磁盘，避免大视频完整堆在内存里。
      if (fileHandle && response.body) {
        const writable = await fileHandle.createWritable();
        const total = Number(response.headers.get('Content-Length')) || 0;
        let received = 0;
        let lastProgressAt = 0;
        const progressStream = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            received += chunk.byteLength;
            const now = Date.now();
            if (now - lastProgressAt >= 250 || (total > 0 && received >= total)) {
              lastProgressAt = now;
              const receivedMB = (received / 1024 / 1024).toFixed(1);
              const progress = total > 0
                ? ` ${Math.min(100, Math.round((received / total) * 100))}%`
                : ` ${receivedMB} MB`;
              message.loading({ content: `正在下载…${progress}`, duration: 0, key: messageKey });
            }
            controller.enqueue(chunk);
          },
        });
        await response.body.pipeThrough(progressStream).pipeTo(writable);
      } else {
        // Safari / Firefox 兼容路径：仍使用 Blob，但保留统一的错误处理和重复点击保护。
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fallbackName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      message.success({ content: '下载完成', key: messageKey });
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        message.error({ content: e?.message || '下载失败', key: messageKey });
      } else {
        message.destroy(messageKey);
      }
    } finally {
      activeDownloadsRef.current.delete(url);
    }
  }, [fetchCanvasMediaResponse]);

  const convertToMaterial = useCallback(async (id: string) => {
    const node = nodesRef.current.find((nd) => nd.id === id);
    if (!node) return;
    const category: CanvasMaterial['category'] = node.data?.videoUrl ? 'Video' : node.data?.audioUrl ? 'Audio' : node.data?.model3dUrl ? 'Model' : 'Image';
    const url = String(node.data?.videoUrl || node.data?.audioUrl || node.data?.model3dUrl || node.data?.images?.[0] || '');
    if (!url) return;
    const suggested = String(node.data?.materialName || node.data?.genPrompt || `${category} 素材`).trim().slice(0, 24);
    const name = window.prompt('素材名称', suggested) || '';
    if (!name.trim()) return;
    const hide = message.loading('正在转为素材…', 0);
    try {
      const ext = category === 'Image' ? 'png' : category === 'Video' ? 'mp4' : category === 'Audio' ? 'mp3' : 'bin';
      const blob = await fetchCanvasMedia(url, `canvas-material.${ext}`);
      const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'canvas-material';
      const uploaded = await playgroundUpload(new File([blob], `${safeName}.${ext}`, { type: blob.type }), apiKey, {
        module: 'canvas', purpose: 'material',
      });
      updateNodeData(id, { materialName: name.trim(), materialUrl: uploaded.url, materialAssetId: uploaded.id });
      message.success(`已转为素材「${name.trim()}」，提示词输入 @ 可引用`);
    } catch (e: any) {
      message.error(e?.message || '转为素材失败');
    } finally {
      hide();
    }
  }, [apiKey, fetchCanvasMedia, updateNodeData]);

  const loadStoredMaterials = useCallback(async () => {
    setMaterialsLoading(true);
    try {
      const r = await authFetch('/v1/canvas/materials?size=100');
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
      setStoredMaterials(j?.data?.list || []);
    } catch (e: any) {
      message.error(e?.message || '素材库加载失败');
    } finally {
      setMaterialsLoading(false);
    }
  }, [authFetch]);

  const openMaterialLibrary = useCallback(() => {
    setMaterialLibraryOpen(true);
    loadStoredMaterials();
  }, [loadStoredMaterials]);

  const addStoredMaterial = useCallback((item: StoredCanvasMaterial) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const kind = mediaKindOf(item.content_type, item.url);
    const id = `image_${Date.now().toString(36)}`;
    const media = kind === 'video' ? { videoUrl: item.url }
      : kind === 'audio' ? { audioUrl: item.url }
      : kind === 'model3d' ? { model3dUrl: item.url }
      : { images: [item.url] };
    setNodes((nds) => nds.map((nd) => ({ ...nd, selected: false })).concat({
      id, type: 'image', position: pos, selected: true,
      data: { ...capDefault(capById('image'), modelsForCap(capById('image'), modelsByType)), ...media, materialAssetId: item.asset_id, assetId: item.upstream_asset_id || '', materialName: item.name || '素材', materialUrl: item.url },
    }));
    setMaterialLibraryOpen(false);
    message.success('素材已加入当前画布');
  }, [rf, setNodes, modelsByType]);

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
  // @ 候选只取当前生成框直接连接的上游节点。连接关系决定作用域，类型可以是
  // 普通图片、视频、音频或已登记素材；右键“转为素材”不是使用 @ 的前置条件。
  const upstreamIds = new Set(anchor ? edges.filter((e) => e.target === anchor.id).map((e) => e.source) : []);
  const materials: CanvasMaterial[] = [];
  for (const nd of nodes) {
    if (!upstreamIds.has(nd.id)) continue;
    if (nd.type === 'material' && nd.data?.matStatus === 'ready' && nd.data?.srcUrl) {
      const category = String(nd.data.assetType || 'Image') as CanvasMaterial['category'];
      materials.push({
        nodeId: nd.id,
        name: String(nd.data.name || nd.data.assetId || '素材'),
        url: String(nd.data.srcUrl),
        referenceUrl: nd.data.assetId ? `asset://${String(nd.data.assetId).replace(/^asset:\/\//, '')}` : undefined,
        category,
        sourceType: 'material',
      });
      continue;
    }
    const label = String(nd.data?.materialName || nd.data?.genPrompt || '').trim();
    ((nd.data?.images || []) as string[]).forEach((url, index) => materials.push({
      nodeId: `${nd.id}:image:${index}`,
      name: label ? `${label.slice(0, 18)}${(nd.data?.images || []).length > 1 ? ` ${index + 1}` : ''}` : `图片 ${materials.filter((m) => m.category === 'Image').length + 1}`,
      url: String(url), category: 'Image', sourceType: 'image',
    }));
    if (nd.data?.videoUrl) materials.push({
      nodeId: `${nd.id}:video`, name: label ? label.slice(0, 18) : `视频 ${materials.filter((m) => m.category === 'Video').length + 1}`,
      url: String(nd.data.videoUrl), category: 'Video', sourceType: 'video',
    });
    if (nd.data?.audioUrl) materials.push({
      nodeId: `${nd.id}:audio`, name: label ? label.slice(0, 18) : `音频 ${materials.filter((m) => m.category === 'Audio').length + 1}`,
      url: String(nd.data.audioUrl), category: 'Audio', sourceType: 'audio',
    });
  }
  const mediaMenuNode = mediaMenu ? nodes.find((nd) => nd.id === mediaMenu.nodeId) : undefined;
  const mediaMenuURL = mediaMenuNode
    ? String(mediaMenuNode.data?.videoUrl || mediaMenuNode.data?.audioUrl || mediaMenuNode.data?.model3dUrl || mediaMenuNode.data?.images?.[0] || '')
    : '';
  const mediaMenuCategory: CanvasMaterial['category'] = mediaMenuNode?.data?.videoUrl
    ? 'Video' : mediaMenuNode?.data?.audioUrl ? 'Audio' : mediaMenuNode?.data?.model3dUrl ? 'Model' : 'Image';

  return (
    <CanvasCtx.Provider
      value={{
        runState, chatModels: modelsByType.chat || [], liveVoices, updateNodeData, selectNode, deleteNode, uploadAsset, openPreview,
        downloadMedia, convertToMaterial,
        runLLM, runClone, openLive, runMaterial, startLiveness, openNodeCreate, selectBatch,
        expandPromptNode: setPromptNodeExpanded,
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
            nodeTypes={nodeTypes}
            deleteKeyCode={['Delete', 'Backspace']}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>

          {!connecting && (
            <Composer
              anchor={anchor}
              modelsByType={modelsByType}
              running={!!(anchor && runState[anchor.id]?.status === 'running')}
              derivedRefs={anchor ? refThumbsFor(anchor.id) : []}
              derivedAudio={anchor ? audioRefsFor(anchor.id) : []}
              derivedVideo={anchor ? videoRefsFor(anchor.id) : []}
              derivedModel3d={anchor ? model3dRefsFor(anchor.id) : []}
              upstreamPrompt={anchor ? upstreamPrompt(anchor.id) : ''}
              onPatch={(patch) => anchor && updateNodeData(anchor.id, patch)}
              onRun={() => anchor && runGenerator(anchor.id)}
              onAddRef={(file) => anchor && addAnchorRef(anchor.id, file)}
              materials={materials}
              onExpandPrompt={() => anchor && setPromptExpanded(anchor.id)}
              onAddPrompt={() => {
                if (!anchor) return;
                const screen = rf.flowToScreenPosition({ x: anchor.position.x - 320, y: anchor.position.y });
                spawnNode('prompt', screen.x, screen.y, null, undefined, anchor.id);
              }}
            />
          )}
        </div>

        <div className={`canvas-fab-dock${fabOpen ? ' open' : ''}${fabDocked ? ` docked ${fabDocked}` : ''}`} style={{ left: fabPos.x, top: fabPos.y }}>
          <button className="canvas-fab-item fab-add" type="button" title="添加节点" onClick={() => {
            addNodeCenter('image', 'image');
            setMenu(null);
            setFabOpen(false);
          }}><PlusOutlined /><span>添加节点</span></button>
          <button className="canvas-fab-item fab-library" type="button" title="素材库" onClick={() => { openMaterialLibrary(); setFabOpen(false); }}>
            <AppstoreOutlined /><span>素材库</span>
          </button>
          <button className="canvas-fab-item fab-chat" type="button" title="对话" onClick={() => {
            setChatOpen(true);
            setFabOpen(false);
          }}><MessageOutlined /><span>对话</span></button>
          <button className="canvas-fab-item fab-canvas" type="button" title="画布" onClick={() => {
            setCanvasPanelOpen((v) => !v);
            setFabOpen(false);
          }}>
            <PictureOutlined /><span>画布</span>
          </button>
          <button className="canvas-fab-item fab-key" type="button" title={`密钥 ${maskKey(apiKey)}`} onClick={() => {
            setKeyDraft(''); setKeyPanelOpen((v) => !v); setFabOpen(false);
          }}><KeyOutlined /><span>密钥</span></button>
          <button className="canvas-fab-item fab-full" type="button" title={isFullscreen ? '退出全屏' : '全屏'} onClick={() => { toggleFullscreen(); setFabOpen(false); }}>
            {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}<span>全屏</span>
          </button>
          <button className="canvas-fab-main" type="button" title="拖动可移动，点击展开" onPointerDown={onFabPointerDown} onPointerMove={onFabPointerMove} onPointerUp={onFabPointerUp}>
            <AppstoreOutlined />
          </button>
        </div>

        {canvasPanelOpen && (
          <div className="canvas-switch-panel" style={{ left: Math.min(fabPos.x + 72, 300), top: Math.max(12, fabPos.y - 70) }}>
            <div className="canvas-switch-head"><span>{currentIcon}</span><strong>画布</strong><small>{saveHint}</small><button onClick={() => setCanvasPanelOpen(false)}><CloseOutlined /></button></div>
            <input className="canvas-switch-title" value={title} onChange={(e) => rename(e.target.value)} placeholder="未命名画布" />
            <Select className="canvas-switch-select" value={docId || undefined} onChange={openDoc} placeholder="切换画布"
              options={docs.map((d) => ({ value: d.id, label: `${d.icon || '🎨'} ${d.title || '未命名'}` }))}
              getPopupContainer={() => rootRef.current || document.body} />
            <div className="canvas-switch-actions">
              <button className="primary" onClick={createDoc}><PlusOutlined /> 新建画布</button>
              <button className="danger" onClick={deleteDoc} disabled={!docId}><DeleteOutlined /> 删除</button>
            </div>
            <span className="canvas-switch-count">{nodes.length} 个节点</span>
          </div>
        )}

        {chatOpen && (
          <section className="canvas-chat-window">
            <header className="canvas-chat-head">
              <MessageOutlined />
              <strong>画布对话</strong>
              <Select
                size="small"
                value={chatModel || modelsByType.chat?.[0]?.value}
                onChange={setChatModel}
                options={(modelsByType.chat || []).map((m) => ({ value: m.value, label: m.label }))}
                placeholder="选择模型"
                getPopupContainer={() => rootRef.current || document.body}
              />
              <button type="button" title="关闭" onClick={() => setChatOpen(false)}><CloseOutlined /></button>
            </header>
            <div className="canvas-chat-messages">
              {chatMessages.length === 0 && <div className="canvas-chat-empty">开始一个画布内会话</div>}
              {chatMessages.map((item, index) => (
                <div className={`canvas-chat-line ${item.role}`} key={index}>{item.content}</div>
              ))}
              {chatSending && <div className="canvas-chat-line assistant pending">正在思考…</div>}
            </div>
            <footer className="canvas-chat-compose">
              <textarea value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder="输入消息…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCanvasChat(); } }} />
              <button type="button" onClick={sendCanvasChat} disabled={chatSending || !chatDraft.trim()}>
                <ThunderboltOutlined /> 发送
              </button>
            </footer>
          </section>
        )}

        {keyPanelOpen && (
          <div className="canvas-key-panel">
            <div className="canvas-material-library-head">
              <strong>API Key</strong>
              <button title="关闭" onClick={() => setKeyPanelOpen(false)}><CloseOutlined /></button>
            </div>
            <div className="canvas-key-body">
              <div className="canvas-key-current">
                <span>当前</span>
                <code>{maskKey(apiKey)}</code>
              </div>
              <Input.Password
                size="small"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value.trim())}
                onPressEnter={switchKey}
                placeholder="换成另一把 sk-…"
                autoComplete="off"
                allowClear
              />
              <div className="canvas-key-actions">
                <button className="canvas-key-btn primary" type="button" onClick={switchKey} disabled={!keyDraft.trim()}>
                  切换
                </button>
                <button className="canvas-key-btn" type="button" onClick={signOutKey}>
                  <LogoutOutlined />
                  退出
                </button>
              </div>
              <p className="canvas-key-tip">退出会清掉本机保存的密钥,画布内容留在服务端,换回同一把 key 就能继续。</p>
            </div>
          </div>
        )}

        {materialLibraryOpen && (
          <div className="canvas-material-library">
            <div className="canvas-material-library-head">
              <strong>素材库</strong>
              <button title="关闭" onClick={() => setMaterialLibraryOpen(false)}><CloseOutlined /></button>
            </div>
            <div className="canvas-material-library-body">
              {materialsLoading ? (
                <div className="canvas-material-empty">加载中…</div>
              ) : storedMaterials.length ? storedMaterials.map((item) => {
                const kind = mediaKindOf(item.content_type, item.url);
                return (
                  <button className="canvas-material-item" key={item.id} onClick={() => addStoredMaterial(item)}>
                    <span className="canvas-material-preview">
                      {kind === 'image' ? <img src={item.url} alt="" />
                        : kind === 'video' ? <video src={item.url} muted />
                        : kind === 'model3d' ? <ExperimentOutlined />
                        : <CustomerServiceOutlined />}
                    </span>
                    <span className="canvas-material-name">{item.name || `素材 ${item.asset_id}`}</span>
                    <span className="canvas-material-type">{kind === 'video' ? '视频' : kind === 'audio' ? '音频' : kind === 'model3d' ? '3D' : '图片'}</span>
                  </button>
                );
              }) : (
                <div className="canvas-material-empty">暂无已转化素材</div>
              )}
            </div>
          </div>
        )}

        {menu && (
          <div
            ref={menuRef}
            className={`create-menu open${menu.mode === 'commands' ? ' canvas-command-menu' : ''}`}
            style={{ left: menu.x + menuShift.x, top: menu.y + menuShift.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {menu.mode === 'commands' ? (
              <div className="canvas-command-list">
                <button onClick={() => {
                  contextSpawnRef.current = { x: menu.spawnX ?? menu.x, y: menu.spawnY ?? menu.y };
                  contextUploadRef.current?.click();
                  setMenu(null);
                }}><UploadOutlined /><span>上传</span></button>
                <button onClick={() => { openMaterialLibrary(); setMenu(null); }}><AppstoreOutlined /><span>素材库</span></button>
                <div className="command-separator" />
                <button onClick={() => setMenu({ ...menu, mode: 'create' })}><PlusOutlined /><span>添加节点</span><small>›</small></button>
                <div className="command-separator" />
                <button disabled={historyIndexRef.current <= 0} onClick={() => applyHistory(-1)}><UndoOutlined /><span>撤销</span><kbd>⌘Z</kbd></button>
                <button disabled={historyIndexRef.current >= historyRef.current.length - 1} onClick={() => applyHistory(1)}><RedoOutlined /><span>重做</span><kbd>⇧⌘Z</kbd></button>
                <button onClick={pasteAtMenu}><SnippetsOutlined /><span>粘贴</span><kbd>⌘V</kbd></button>
              </div>
            ) : (
              <>
                {(menu.title || menu.side) && (
                  <div className="create-menu-title">
                    {menu.title || `在${menu.side === 'left' ? '左' : '右'}侧添加节点`}
                  </div>
                )}
                <div className="create-menu-grid">
                  {CREATE_CARDS.map((m) => (
                    <button key={m.id} className="create-card" onClick={() => pickCreate(m.type, m.capabilityId)}>
                      <span className="create-card-icon">{m.icon}</span>
                      <span>
                        <div className="create-card-title">{m.label}</div>
                        <div className="create-card-sub">{m.sub}</div>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <input
          ref={contextUploadRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) addUploadedFiles(files, contextSpawnRef.current.x, contextSpawnRef.current.y);
            e.target.value = '';
          }}
        />

        {mediaMenu && mediaMenuNode && mediaMenuURL && (
          <div
            className="node-context-menu canvas-media-context-menu"
            style={{ left: mediaMenu.x, top: mediaMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button onClick={() => { downloadMedia(mediaMenuURL, mediaMenuCategory); setMediaMenu(null); }}>
              <DownloadOutlined /> 下载文件
            </button>
            <button
              disabled={!!mediaMenuNode.data?.materialAssetId}
              onClick={() => { convertToMaterial(mediaMenuNode.id); setMediaMenu(null); }}
            >
              <FolderAddOutlined /> {mediaMenuNode.data?.materialAssetId ? '已转为素材' : '转为素材'}
            </button>
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

        {anchor && promptExpanded === anchor.id && (
          <PromptModal
            capLabel={capById(anchor.data?.kind).label}
            placeholder={capById(anchor.data?.kind).promptPlaceholder}
            isAudio={capById(anchor.data?.kind).id === 'audio'}
            prompt={String(anchor.data?.prompt || '')}
            mentionMaterials={(anchor.data?.mentionMaterials || []) as CanvasMaterial[]}
            refs={(anchor.data?.refs || []) as string[]}
            derivedRefs={refThumbsFor(anchor.id)}
            materials={materials}
            onPatch={(patch) => updateNodeData(anchor.id, patch)}
            onClose={() => setPromptExpanded(null)}
          />
        )}

        {(() => {
          // 提示词节点大窗:节点被删/切走时自动失效,不串到别的节点
          const pn = promptNodeExpanded ? nodes.find((n) => n.id === promptNodeExpanded && n.type === 'prompt') : null;
          if (!pn) return null;
          return (
            <PromptNodeModal
              text={String(pn.data?.text || '')}
              onChange={(v) => updateNodeData(pn.id, { text: v })}
              onClose={() => setPromptNodeExpanded(null)}
            />
          );
        })()}

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
