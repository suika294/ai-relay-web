// VirtualmanPanel —— 数智人 Playground tab(多厂商统一入口)
//
// 一个「数智人」tab,模型下拉按厂商分组,选模型自动切换表单。三家:
//
//   【阿里万相(dashscope_video,单值 DASHSCOPE_API_KEY,北京区)】
//   - wan2.2-s2v          图+音频 → 说话/唱歌/表演(480P/720P)
//   - emo-v1              图+音频 → 悦动人像(ratio 1:1/3:4 + style,音频≤60s,自动跑 detect)
//   - liveportrait        图+长音频(<180s)→ 灵动人像(运动控制,自动跑 detect 闸门)
//   - videoretalk         视频+音频 → 视频换口型(可选指定脸)
//   - wan2.2-animate-move 图+驱动视频 → 动作迁移(mode wan-std/pro)
//   - wan2.2-animate-mix  图+视频 → 视频换人(mode 同上)
//   - emoji-v1            图+driven_id → 动态表情(自动跑 detect)
//
//   【火山即梦(jimeng,AK/SK)】
//   - jimeng-omnihuman-v15      图+音频(<60s)→ 口型+全身动作数字人视频
//   - jimeng-dream-actor-m1     图+模版视频 → 动作模仿(DreamActor-M1,无音频)
//
//   【可灵 Kling(kling / kling-dataeyes)】
//   - kling-v3 / kling-v2-6     图+参考动作视频 → 动作控制(mode std/pro + 保留声音 + 画面取向)
//     (注:官方 motion-control model_name 是 kling-v3 / kling-v2-6;第三方镜像的 kling-v3-0
//      在官方端点报 1201 invalid,勿用。)
//
//   【腾讯数智人(virtualman,AppKey:AccessToken)】
//   - tencent-lipsync-video  视频对口型(公网视频 + 文本/音频,无需租形象)
//   - tencent-lipsync-photo  照片对口型(公网图片 + 文本/音频 + 720P/1080P + 动作 prompt)
//   - tencent-virtualman-broadcast  预训练形象播报(需租 VirtualmanKey)—— 暂隐藏
//
// 全部走 /v1/videos/generations(POST)+ /:id(轮询)+ /:id/cancel(取消),共用一套
// 提交/轮询/上传/结果渲染脚手架;模型下拉决定 build body 与展示哪些输入卡片。

import {
  AudioOutlined,
  DownloadOutlined,
  LoadingOutlined,
  PictureOutlined,
  SendOutlined,
  SmileOutlined,
  UploadOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  InputNumber,
  message,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import { useIntl } from '@umijs/max';
import { useEffect, useMemo, useRef, useState } from 'react';
import { assetApi, systemApi, tokenApi } from '@/services/api';
import { t } from '@/utils/i18n';
import { apiURL } from '@/utils/request';

const { TextArea } = Input;
const LS_LAST_TASK = 'playground_virtualman_last_task_v1';

// 即梦 OmniHuman(火山,无需租模型)
const MODEL_JIMENG_OMNIHUMAN = 'jimeng-omnihuman-v15';
// 腾讯云数智人三档(需在控制台租用预训练形象;broadcast 暂隐藏)
const MODEL_LIPSYNC_VIDEO = 'tencent-lipsync-video';
const MODEL_LIPSYNC_PHOTO = 'tencent-lipsync-photo';
const MODEL_BROADCAST = 'tencent-virtualman-broadcast';
const SHOW_BROADCAST = false;

// 阿里万相数字人家族(dashscope_video)
const WAN_IDS = [
  'wan2.2-s2v',
  'emo-v1',
  'liveportrait',
  'videoretalk',
  'wan2.2-animate-move',
  'wan2.2-animate-mix',
  'emoji-v1',
] as const;
type WanModelID = (typeof WAN_IDS)[number];
const WAN_SET = new Set<string>(WAN_IDS);

const EMOJI_DRIVEN_IDS = [
  'mengwa_kaixin',
  'mengwa_dengyan',
  'dagong_zhuakuang',
  'dagong_wunai',
  'jingdian_tiaopi',
];

// 动作模仿(图 + 参考动作视频 → 驱动视频)。可灵动作控制 + 火山即梦 DreamActor-M1。
// 与万相 animate 同为「图+视频」形态,但走各自 provider,故单列。模型 config 须
// supports_reference_video=true(seed 067/068 已带),否则后端拦掉 reference_video。
// 可灵官方 motion-control 的 model_name:v3 是 `kling-v3`(不是第三方的 kling-v3-0,后者报 1201)、
// v2.6 是 `kling-v2-6`。
const MODEL_KLING_MOTION_V3 = 'kling-v3';
const MODEL_KLING_MOTION_V26 = 'kling-v2-6';
const MODEL_JIMENG_DREAM_ACTOR = 'jimeng-dream-actor-m1';
const KLING_MOTION_SET = new Set<string>([MODEL_KLING_MOTION_V3, MODEL_KLING_MOTION_V26]);
const MOTION_MIMIC_SET = new Set<string>([
  MODEL_KLING_MOTION_V3,
  MODEL_KLING_MOTION_V26,
  MODEL_JIMENG_DREAM_ACTOR,
]);

// 万相各模型的输入能力(驱动展示哪些卡片 + 怎么 build body)
type WanCap = {
  needImage?: boolean;
  needAudio?: boolean;
  needVideo?: boolean;
  s2vRes?: boolean; // 480P/720P
  emoRatio?: boolean; // 1:1 / 3:4 + style_level
  motion?: boolean; // liveportrait 运动控制
  retalk?: boolean; // videoretalk ref_image + options
  mode?: boolean; // animate wan-std/wan-pro + watermark
  drivenId?: boolean; // emoji
};
const WAN_CAPS: Record<WanModelID, WanCap> = {
  'wan2.2-s2v': { needImage: true, needAudio: true, s2vRes: true },
  'emo-v1': { needImage: true, needAudio: true, emoRatio: true },
  liveportrait: { needImage: true, needAudio: true, motion: true },
  videoretalk: { needVideo: true, needAudio: true, retalk: true },
  'wan2.2-animate-move': { needImage: true, needVideo: true, mode: true },
  'wan2.2-animate-mix': { needImage: true, needVideo: true, mode: true },
  'emoji-v1': { needImage: true, drivenId: true },
};

type DriverType = 'Text' | 'OriginalVoice' | 'ModulatedVoice';

// 所有模型元信息(分组 / 标签 / 说明 / 图标)
type MetaEntry = { group: string; label: string; desc: string; icon: any };
const GROUP_WAN = 'playground.virtualman.groupWan';
const GROUP_JIMENG = 'playground.virtualman.groupJimeng';
const GROUP_KLING = 'playground.virtualman.groupKling';
const GROUP_TENCENT = 'playground.virtualman.groupTencent';
const buildMeta = (): Record<string, MetaEntry> => ({
  // 阿里万相
  'wan2.2-s2v': {
    group: t(GROUP_WAN),
    label: t('playground.virtualman.metaS2vLabel'),
    desc: t('playground.virtualman.metaS2vDesc'),
    icon: PictureOutlined,
  },
  'emo-v1': {
    group: t(GROUP_WAN),
    label: t('playground.virtualman.metaEmoLabel'),
    desc: t('playground.virtualman.metaEmoDesc'),
    icon: SmileOutlined,
  },
  liveportrait: {
    group: t(GROUP_WAN),
    label: t('playground.virtualman.metaLiveportraitLabel'),
    desc: t('playground.virtualman.metaLiveportraitDesc'),
    icon: SmileOutlined,
  },
  videoretalk: {
    group: t(GROUP_WAN),
    label: t('playground.virtualman.metaVideoretalkLabel'),
    desc: t('playground.virtualman.metaVideoretalkDesc'),
    icon: VideoCameraOutlined,
  },
  'wan2.2-animate-move': {
    group: t(GROUP_WAN),
    label: t('playground.virtualman.metaAnimateMoveLabel'),
    desc: t('playground.virtualman.metaAnimateMoveDesc'),
    icon: VideoCameraOutlined,
  },
  'wan2.2-animate-mix': {
    group: t(GROUP_WAN),
    label: t('playground.virtualman.metaAnimateMixLabel'),
    desc: t('playground.virtualman.metaAnimateMixDesc'),
    icon: VideoCameraOutlined,
  },
  'emoji-v1': {
    group: t(GROUP_WAN),
    label: t('playground.virtualman.metaEmojiLabel'),
    desc: t('playground.virtualman.metaEmojiDesc'),
    icon: SmileOutlined,
  },
  // 火山即梦
  [MODEL_JIMENG_OMNIHUMAN]: {
    group: t(GROUP_JIMENG),
    label: t('playground.virtualman.metaOmnihumanLabel'),
    desc: t('playground.virtualman.metaOmnihumanDesc'),
    icon: UserOutlined,
  },
  [MODEL_JIMENG_DREAM_ACTOR]: {
    group: t(GROUP_JIMENG),
    label: t('playground.virtualman.metaDreamActorLabel'),
    desc: t('playground.virtualman.metaDreamActorDesc'),
    icon: VideoCameraOutlined,
  },
  // 可灵动作控制
  [MODEL_KLING_MOTION_V3]: {
    group: t(GROUP_KLING),
    label: t('playground.virtualman.metaKlingV3Label'),
    desc: t('playground.virtualman.metaKlingV3Desc'),
    icon: VideoCameraOutlined,
  },
  [MODEL_KLING_MOTION_V26]: {
    group: t(GROUP_KLING),
    label: t('playground.virtualman.metaKlingV26Label'),
    desc: t('playground.virtualman.metaKlingV26Desc'),
    icon: VideoCameraOutlined,
  },
  // 腾讯数智人
  [MODEL_LIPSYNC_VIDEO]: {
    group: t(GROUP_TENCENT),
    label: t('playground.virtualman.metaLipsyncVideoLabel'),
    desc: t('playground.virtualman.metaLipsyncVideoDesc'),
    icon: VideoCameraOutlined,
  },
  [MODEL_LIPSYNC_PHOTO]: {
    group: t(GROUP_TENCENT),
    label: t('playground.virtualman.metaLipsyncPhotoLabel'),
    desc: t('playground.virtualman.metaLipsyncPhotoDesc'),
    icon: PictureOutlined,
  },
  [MODEL_BROADCAST]: {
    group: t(GROUP_TENCENT),
    label: t('playground.virtualman.metaBroadcastLabel'),
    desc: t('playground.virtualman.metaBroadcastDesc'),
    icon: UserOutlined,
  },
});

// 展示顺序(broadcast 受 SHOW_BROADCAST 控制隐藏)
const VISIBLE_IDS: string[] = [
  ...WAN_IDS,
  MODEL_JIMENG_OMNIHUMAN,
  MODEL_JIMENG_DREAM_ACTOR,
  MODEL_KLING_MOTION_V3,
  MODEL_KLING_MOTION_V26,
  MODEL_LIPSYNC_VIDEO,
  MODEL_LIPSYNC_PHOTO,
  ...(SHOW_BROADCAST ? [MODEL_BROADCAST] : []),
];
// 分组展示顺序(用稳定 key 排序,展示名走 META.group)
const GROUP_ORDER = [GROUP_WAN, GROUP_JIMENG, GROUP_KLING, GROUP_TENCENT];

function extractErrMsg(raw: string, httpStatus: number): string {
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.message || raw.slice(0, 800);
  } catch {
    return raw ? raw.slice(0, 800) : `HTTP ${httpStatus}`;
  }
}

function isPublicHTTPURL(u: string): boolean {
  return /^https?:\/\/[^/]+/i.test((u || '').trim());
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

type VideoTask = {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  created_at: number;
  completed_at?: number;
  data?: { url?: string; cover_url?: string; metadata?: any }[];
  error?: { code?: string; message: string };
};

export default function VirtualmanPanel() {
  const intl = useIntl();
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [tokenId, setTokenId] = useState<number | undefined>(undefined);
  const [enabledModels, setEnabledModels] = useState<Set<string>>(new Set());

  const [modelName, setModelName] = useState<string>('wan2.2-s2v');

  // 共用素材输入 —— 当前模型不需要的字段在 build body 时忽略
  const [referenceVideo, setReferenceVideo] = useState('');
  const [firstFrameImage, setFirstFrameImage] = useState('');
  const [inputAudioUrl, setInputAudioUrl] = useState('');
  const [virtualmanKey, setVirtualmanKey] = useState('');

  // 腾讯驱动 + SSML / 音频
  const [driverType, setDriverType] = useState<DriverType>('Text');
  const [prompt, setPrompt] = useState('');
  const [voice, setVoice] = useState('');
  const [speechSpeed, setSpeechSpeed] = useState<number | null>(1.0);
  const [speechVolume, setSpeechVolume] = useState<number | null>(1);
  const [emotionCategory, setEmotionCategory] = useState('');
  const [emotionIntensity, setEmotionIntensity] = useState<number | null>(null);
  const [timbreLanguage, setTimbreLanguage] = useState('');
  // 即梦 / 腾讯 photo 输出分辨率(720/1080)
  const [photoResolution, setPhotoResolution] = useState<'720P' | '1080P'>('1080P');
  const [actionPrompt, setActionPrompt] = useState('');
  const [videoFormat, setVideoFormat] = useState<'TransparentWebm' | 'TransparentMov' | 'Mp4'>('Mp4');

  // 万相专属参数
  const [s2vResolution, setS2vResolution] = useState<'480P' | '720P'>('480P');
  const [emoRatio, setEmoRatio] = useState<'1:1' | '3:4'>('1:1');
  const [styleLevel, setStyleLevel] = useState<'normal' | 'calm' | 'active'>('normal');
  const [animateMode, setAnimateMode] = useState<'wan-std' | 'wan-pro'>('wan-std');
  const [watermark, setWatermark] = useState(false);
  const [drivenId, setDrivenId] = useState<string>(EMOJI_DRIVEN_IDS[0]);
  const [templateId, setTemplateId] = useState<'normal' | 'calm' | 'active'>('normal');
  const [videoFps, setVideoFps] = useState<number | null>(null);
  const [videoExtension, setVideoExtension] = useState(false);
  const [refImageUrl, setRefImageUrl] = useState('');

  // 动作模仿专属(可灵 motion-control)
  const [klingMotionMode, setKlingMotionMode] = useState<'std' | 'pro'>('std');
  const [keepOriginalSound, setKeepOriginalSound] = useState<'yes' | 'no'>('yes');
  const [characterOrientation, setCharacterOrientation] = useState<'video' | 'image'>('video');

  const [uploadingRef, setUploadingRef] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const pollRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    systemApi.models().then((res) => {
      const set = new Set<string>();
      ((res.data as any[]) || []).forEach((m) => {
        if (m.enabled !== false) set.add(m.name);
      });
      setEnabledModels(set);
    });
    tokenApi.list().then((res) => {
      const list = ((res.data as API.Token[]) || []).filter((t) => t.status === 1);
      setTokens(list);
      if (list.length > 0) setTokenId((prev) => prev ?? list[0].id);
    });

    const saved = localStorage.getItem(LS_LAST_TASK);
    if (saved) {
      try {
        const t = JSON.parse(saved) as VideoTask;
        setTask(t);
        if (t.status === 'queued' || t.status === 'running') {
          startTimer(t.created_at);
          schedulePoll(t.id, 3000);
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

  const selectedToken = tokens.find((t) => t.id === tokenId);

  const startTimer = (createdAtSec?: number) => {
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    const baseAt = createdAtSec ? createdAtSec * 1000 : Date.now();
    setElapsedMs(Date.now() - baseAt);
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - baseAt);
    }, 500);
  };
  const stopTimer = () => {
    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const schedulePoll = (id: string, delay = 5000) => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(() => fetchOnce(id, true), delay);
  };

  const fetchOnce = async (id: string, auto = false) => {
    if (!selectedToken) return;
    if (!auto) setPolling(true);
    try {
      const res = await fetch(apiURL(`/v1/videos/generations/${id}`), {
        headers: { Authorization: `Bearer ${selectedToken.key}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const msg = extractErrMsg(text, res.status);
        if (auto && isTransientPollError(res.status, msg)) {
          setErrMsg(intl.formatMessage({ id: 'playground.virtualman.autoRefreshRetry' }, { msg }));
          schedulePoll(id);
          return;
        }
        setErrMsg(msg);
        return;
      }
      const t = JSON.parse(text) as VideoTask;
      setTask(t);
      setErrMsg(null);
      if (t.status === 'queued' || t.status === 'running') schedulePoll(id);
      else stopTimer();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (auto && isTransientPollError(0, msg)) {
        setErrMsg(intl.formatMessage({ id: 'playground.virtualman.autoRefreshRetry' }, { msg }));
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const isWan = WAN_SET.has(modelName);
  const wanCap: WanCap = isWan ? WAN_CAPS[modelName as WanModelID] : {};
  const isMotionMimic = MOTION_MIMIC_SET.has(modelName);
  const isKlingMotion = KLING_MOTION_SET.has(modelName);
  const isJimeng = modelName === MODEL_JIMENG_OMNIHUMAN;
  const isLipsyncVideo = modelName === MODEL_LIPSYNC_VIDEO;
  const isLipsyncPhoto = modelName === MODEL_LIPSYNC_PHOTO;
  const isBroadcast = modelName === MODEL_BROADCAST;
  const isTencent = isLipsyncVideo || isLipsyncPhoto || isBroadcast;

  // 即梦只支持音频驱动;腾讯 broadcast 3 档,免训练系列 2 档。万相/动作模仿无 driver 概念,跳过。
  useEffect(() => {
    if (isWan || isMotionMimic) return;
    if (isJimeng && driverType !== 'OriginalVoice') {
      setDriverType('OriginalVoice');
    } else if (!isJimeng && !isBroadcast && driverType === 'ModulatedVoice') {
      setDriverType('Text');
    }
  }, [modelName, isWan, isJimeng, isBroadcast, driverType]);

  const buildUploadProps = (
    kind: 'image' | 'video' | 'audio',
    onURL?: (url: string) => void,
  ): UploadProps => ({
    accept: kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : 'audio/*',
    showUploadList: false,
    beforeUpload: (file) => {
      const targetPrefix = kind === 'image' ? 'image/' : kind === 'video' ? 'video/' : 'audio/';
      if (file.type && !file.type.startsWith(targetPrefix)) {
        message.warning(
          kind === 'image'
            ? intl.formatMessage({ id: 'playground.virtualman.uploadImageOnly' })
            : kind === 'video'
            ? intl.formatMessage({ id: 'playground.virtualman.uploadVideoOnly' })
            : intl.formatMessage({ id: 'playground.virtualman.uploadAudioOnly' }),
        );
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploadingRef(true);
      try {
        const f = file as File;
        const uploaded = await assetApi.upload(f, {
          module:
            kind === 'image'
              ? 'virtualman_photo'
              : kind === 'video'
              ? 'virtualman_ref_video'
              : 'virtualman_audio',
          purpose: 'virtualman_reference',
        });
        if (uploaded.code !== 0 || !uploaded.data) {
          throw new Error(uploaded.message || intl.formatMessage({ id: 'playground.virtualman.uploadFailed' }));
        }
        let url = uploaded.data.public_url;
        if (!url) {
          const detail = await assetApi.detail(uploaded.data.id);
          if (detail.code !== 0 || !detail.data?.url) {
            throw new Error(detail.message || intl.formatMessage({ id: 'playground.virtualman.fetchAssetUrlFailed' }));
          }
          url = detail.data.url;
        }
        if (!isPublicHTTPURL(url)) {
          message.warning(intl.formatMessage({ id: 'playground.virtualman.needPublicAsset' }));
          onSuccess?.(uploaded as any);
          return;
        }
        if (onURL) onURL(url);
        else if (kind === 'image') setFirstFrameImage(url);
        else if (kind === 'video') setReferenceVideo(url);
        else setInputAudioUrl(url);
        message.success(
          intl.formatMessage(
            { id: 'playground.virtualman.assetUploaded' },
            {
              kind:
                kind === 'image'
                  ? intl.formatMessage({ id: 'playground.virtualman.kindImage' })
                  : kind === 'video'
                  ? intl.formatMessage({ id: 'playground.virtualman.kindVideo' })
                  : intl.formatMessage({ id: 'playground.virtualman.kindAudio' }),
            },
          ),
        );
        onSuccess?.(uploaded as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.virtualman.uploadFailed' }));
        onError?.(e);
      } finally {
        setUploadingRef(false);
      }
    },
  });

  const onSubmit = async () => {
    if (!selectedToken) {
      message.warning(intl.formatMessage({ id: 'playground.virtualman.selectApiKeyFirst' }));
      return;
    }

    // ---- 提交前校验(按模型)----
    if (isWan) {
      if (wanCap.needImage && !isPublicHTTPURL(firstFrameImage)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.needPublicImageUrl' }));
        return;
      }
      if (wanCap.needVideo && !isPublicHTTPURL(referenceVideo)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.needPublicVideoUrl' }));
        return;
      }
      if (wanCap.needAudio && !isPublicHTTPURL(inputAudioUrl)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.needPublicAudioUrl' }));
        return;
      }
      if (wanCap.drivenId && !drivenId.trim()) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.emojiNeedDrivenId' }));
        return;
      }
    } else if (isMotionMimic) {
      if (!isPublicHTTPURL(firstFrameImage)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.motionNeedImageUrl' }));
        return;
      }
      if (!isPublicHTTPURL(referenceVideo)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.motionNeedVideoUrl' }));
        return;
      }
    } else if (isJimeng) {
      if (!isPublicHTTPURL(firstFrameImage)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.jimengNeedImageUrl' }));
        return;
      }
      if (!isPublicHTTPURL(inputAudioUrl)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.jimengNeedAudioUrl' }));
        return;
      }
    } else if (isLipsyncVideo) {
      if (!isPublicHTTPURL(referenceVideo)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.lipsyncVideoNeedUrl' }));
        return;
      }
    } else if (isLipsyncPhoto) {
      if (!isPublicHTTPURL(firstFrameImage)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.lipsyncPhotoNeedUrl' }));
        return;
      }
    } else if (isBroadcast) {
      if (!virtualmanKey.trim()) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.broadcastNeedKey' }));
        return;
      }
    }
    if (isTencent) {
      if (driverType === 'Text' && !prompt.trim()) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.textDriverNeedContent' }));
        return;
      }
      if (driverType === 'Text' && !voice.trim()) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.textDriverNeedTimbre' }));
        return;
      }
      if (
        (driverType === 'OriginalVoice' || driverType === 'ModulatedVoice') &&
        !isPublicHTTPURL(inputAudioUrl)
      ) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.audioDriverNeedUrl' }));
        return;
      }
      if (driverType === 'ModulatedVoice' && !voice.trim()) {
        message.warning(intl.formatMessage({ id: 'playground.virtualman.modulatedNeedTimbre' }));
        return;
      }
    }

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = { model: modelName };

      if (isWan) {
        if (wanCap.needImage) body.first_frame_image = firstFrameImage.trim();
        if (wanCap.needVideo) body.reference_video = referenceVideo.trim();
        if (wanCap.needAudio) body.input_audio_url = inputAudioUrl.trim();
        if (wanCap.s2vRes) body.resolution = s2vResolution;
        if (wanCap.emoRatio) {
          body.aspect_ratio = emoRatio;
          body.style_level = styleLevel;
        }
        if (wanCap.motion) {
          body.template_id = templateId;
          if (videoFps != null) body.video_fps = videoFps;
        }
        if (wanCap.retalk) {
          if (isPublicHTTPURL(refImageUrl)) body.ref_image_url = refImageUrl.trim();
          if (videoExtension) body.video_extension = true;
        }
        if (wanCap.mode) {
          body.mode = animateMode;
          if (watermark) body.watermark = true;
        }
        if (wanCap.drivenId) body.driven_id = drivenId.trim();
      } else if (isMotionMimic) {
        body.first_frame_image = firstFrameImage.trim();
        body.reference_video = referenceVideo.trim();
        if (prompt.trim()) body.prompt = prompt.trim();
        if (isKlingMotion) {
          // 可灵 motion-control 专属(后端从 req.Extra 读)。即梦 DreamActor 只要图+视频。
          body.mode = klingMotionMode; // std / pro
          body.keep_original_sound = keepOriginalSound; // yes / no
          body.character_orientation = characterOrientation; // video / image
        }
      } else if (isJimeng) {
        body.first_frame_image = firstFrameImage.trim();
        body.input_audio_url = inputAudioUrl.trim();
        if (prompt.trim()) body.prompt = prompt.trim();
        body.output_resolution = photoResolution === '1080P' ? 1080 : 720;
      } else {
        if (isLipsyncVideo) body.reference_video = referenceVideo.trim();
        if (isLipsyncPhoto) body.first_frame_image = firstFrameImage.trim();
        if (isBroadcast) body.virtualman_key = virtualmanKey.trim();

        if (driverType === 'Text') {
          body.prompt = prompt.trim();
          body.voice = voice.trim();
          if (speechSpeed != null && speechSpeed !== 1.0) body.speech_speed = speechSpeed;
          if (speechVolume != null && speechVolume !== 1) body.speech_volume = speechVolume;
          if (emotionCategory.trim()) body.emotion_category = emotionCategory.trim();
          if (emotionIntensity != null) body.emotion_intensity = emotionIntensity;
          if (timbreLanguage.trim()) body.timbre_language = timbreLanguage.trim();
        } else if (driverType === 'OriginalVoice') {
          body.input_audio_url = inputAudioUrl.trim();
          if (isBroadcast) body.driver_type = 'OriginalVoice';
        } else if (driverType === 'ModulatedVoice') {
          body.input_audio_url = inputAudioUrl.trim();
          body.driver_type = 'ModulatedVoice';
          body.voice = voice.trim();
        }

        if (isLipsyncPhoto) {
          body.resolution = photoResolution;
          if (actionPrompt.trim()) body.action_prompt = actionPrompt.trim();
        }
        if (isBroadcast && videoFormat) body.video_format = videoFormat;
      }

      const res = await fetch(apiURL('/v1/videos/generations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedToken.key}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        setErrMsg(extractErrMsg(text, res.status));
        return;
      }
      const t = JSON.parse(text) as VideoTask;
      setTask(t);
      startTimer(t.created_at);
      if (t.status === 'queued' || t.status === 'running') schedulePoll(t.id, 3000);
    } catch (e: any) {
      setErrMsg(String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = async () => {
    if (!task || !selectedToken) return;
    try {
      const res = await fetch(apiURL(`/v1/videos/generations/${task.id}/cancel`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${selectedToken.key}` },
      });
      const text = await res.text();
      if (!res.ok) {
        message.error(extractErrMsg(text, res.status));
        return;
      }
      setTask(JSON.parse(text));
      stopTimer();
    } catch (e: any) {
      message.error(String(e?.message || e));
    }
  };

  const onReset = () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();
    localStorage.removeItem(LS_LAST_TASK);
    setTask(null);
    setErrMsg(null);
    setElapsedMs(0);
  };

  const META = useMemo(() => buildMeta(), [intl.locale]);

  // 分组下拉:按厂商分组,带「已 seed / 未 seed」标签
  const modelOptions = useMemo(() => {
    const byGroup: Record<string, { value: string; label: any }[]> = {};
    VISIBLE_IDS.forEach((id) => {
      const meta = META[id];
      if (!meta) return;
      (byGroup[meta.group] ||= []).push({
        value: id,
        label: (
          <span>
            {meta.label}
            <Tag color={enabledModels.has(id) ? 'green' : 'default'} style={{ marginLeft: 8 }}>
              {enabledModels.has(id)
                ? intl.formatMessage({ id: 'playground.virtualman.seeded' })
                : intl.formatMessage({ id: 'playground.virtualman.notSeeded' })}
            </Tag>
          </span>
        ),
      });
    });
    // GROUP_ORDER 为 key,转成展示名后取分组
    return GROUP_ORDER.map((gk) => t(gk))
      .filter((g) => byGroup[g]?.length)
      .map((g) => ({
        label: g,
        options: byGroup[g],
      }));
  }, [enabledModels, META, intl]);

  const currentMeta = META[modelName] ?? META['wan2.2-s2v'];
  const CurrentIcon = currentMeta.icon;

  const elapsedLabel = (() => {
    const sec = Math.floor(elapsedMs / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  })();

  const videoURL = task?.data?.[0]?.url;
  const isTerminal =
    task && (task.status === 'succeeded' || task.status === 'failed' || task.status === 'canceled');

  // 是否展示「人像图」卡片:万相 needImage、即梦、动作模仿、腾讯照片
  const showImageCard = (isWan && wanCap.needImage) || isJimeng || isMotionMimic || isLipsyncPhoto;
  // 是否展示「视频」卡片:万相 needVideo、动作模仿(参考视频)、腾讯视频对口型
  const showVideoCard = (isWan && wanCap.needVideo) || isMotionMimic || isLipsyncVideo;
  // 即梦固定音频卡片;万相 needAudio 卡片;腾讯音频走「驱动方式」卡片内
  const showWanAudioCard = isWan && wanCap.needAudio;

  return (
    <div className="pg-virtualman">
      <Card size="small" className="pg-section">
        <Space wrap size={[16, 12]}>
          <Space>
            <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.apiKeyLabel' })}</span>
            <Select
              style={{ width: 240 }}
              placeholder={intl.formatMessage({ id: 'playground.virtualman.selectApiKey' })}
              value={tokenId}
              onChange={(v) => setTokenId(v)}
              options={tokens.map((tk) => ({ value: tk.id, label: tk.name || `Token #${tk.id}` }))}
            />
          </Space>
          <Space>
            <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.modelLabel' })}</span>
            <Select
              style={{ minWidth: 380 }}
              value={modelName}
              onChange={(v) => setModelName(v as string)}
              options={modelOptions}
            />
          </Space>
        </Space>
        <div className="pg-virtualman-desc">
          <CurrentIcon /> {currentMeta.desc}
        </div>
      </Card>

      {/* 人像图 / 照片(万相 needImage、即梦、腾讯照片) */}
      {showImageCard && (
        <Card
          size="small"
          title={
            isLipsyncPhoto
              ? intl.formatMessage({ id: 'playground.virtualman.cardPhotoTitle' })
              : intl.formatMessage({ id: 'playground.virtualman.cardImageTitle' })
          }
          className="pg-section"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              prefix={<PictureOutlined />}
              placeholder={intl.formatMessage({ id: 'playground.virtualman.imageUrlPlaceholder' })}
              value={firstFrameImage}
              onChange={(e) => setFirstFrameImage(e.target.value)}
            />
            <Upload {...buildUploadProps('image')}>
              <Button icon={uploadingRef ? <LoadingOutlined /> : <UploadOutlined />} disabled={uploadingRef}>
                {intl.formatMessage({ id: 'playground.virtualman.uploadImageBtn' })}
              </Button>
            </Upload>

            {/* 万相 s2v 分辨率 480/720 */}
            {isWan && wanCap.s2vRes && (
              <Space wrap>
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.outputResolution' })}</span>
                <Radio.Group
                  value={s2vResolution}
                  onChange={(e) => setS2vResolution(e.target.value)}
                  optionType="button"
                  options={[
                    { value: '480P', label: intl.formatMessage({ id: 'playground.virtualman.res480Default' }) },
                    { value: '720P', label: '720P' },
                  ]}
                />
              </Space>
            )}
            {/* 万相 emo ratio + style */}
            {isWan && wanCap.emoRatio && (
              <Space wrap>
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.aspectRatio' })}</span>
                <Radio.Group
                  value={emoRatio}
                  onChange={(e) => setEmoRatio(e.target.value)}
                  optionType="button"
                  options={[
                    { value: '1:1', label: intl.formatMessage({ id: 'playground.virtualman.ratioAvatar' }) },
                    { value: '3:4', label: intl.formatMessage({ id: 'playground.virtualman.ratioHalf' }) },
                  ]}
                />
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.styleLabel' })}</span>
                <Radio.Group
                  value={styleLevel}
                  onChange={(e) => setStyleLevel(e.target.value)}
                  optionType="button"
                  options={[
                    { value: 'normal', label: intl.formatMessage({ id: 'playground.virtualman.styleNormal' }) },
                    { value: 'calm', label: intl.formatMessage({ id: 'playground.virtualman.styleCalm' }) },
                    { value: 'active', label: intl.formatMessage({ id: 'playground.virtualman.styleActive' }) },
                  ]}
                />
              </Space>
            )}
            {/* 即梦输出分辨率 720/1080 */}
            {isJimeng && (
              <Space wrap>
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.outputResolution' })}</span>
                <Radio.Group
                  value={photoResolution}
                  onChange={(e) => setPhotoResolution(e.target.value)}
                  optionType="button"
                  options={[
                    { value: '720P', label: intl.formatMessage({ id: 'playground.virtualman.res720Fast' }) },
                    { value: '1080P', label: intl.formatMessage({ id: 'playground.virtualman.res1080Default' }) },
                  ]}
                />
              </Space>
            )}
            {/* 腾讯照片输出分辨率 720/1080 */}
            {isLipsyncPhoto && (
              <Space wrap>
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.outputResolution' })}</span>
                <Radio.Group
                  value={photoResolution}
                  onChange={(e) => setPhotoResolution(e.target.value)}
                  optionType="button"
                  options={[
                    { value: '720P', label: intl.formatMessage({ id: 'playground.virtualman.res720DefaultFast' }) },
                    { value: '1080P', label: intl.formatMessage({ id: 'playground.virtualman.res1080Slower' }) },
                  ]}
                />
              </Space>
            )}
          </Space>
        </Card>
      )}

      {/* 视频(万相 needVideo、腾讯视频对口型) */}
      {showVideoCard && (
        <Card
          size="small"
          title={
            modelName === 'videoretalk'
              ? intl.formatMessage({ id: 'playground.virtualman.cardOriginalVideoTitle' })
              : isLipsyncVideo
              ? intl.formatMessage({ id: 'playground.virtualman.cardTemplateVideoTitle' })
              : isMotionMimic
              ? intl.formatMessage({ id: 'playground.virtualman.cardRefMotionVideoTitle' })
              : intl.formatMessage({ id: 'playground.virtualman.cardDriveVideoTitle' })
          }
          className="pg-section"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              prefix={<VideoCameraOutlined />}
              placeholder={
                isMotionMimic
                  ? intl.formatMessage(
                      { id: 'playground.virtualman.motionVideoPlaceholder' },
                      {
                        duration: isKlingMotion
                          ? intl.formatMessage({ id: 'playground.virtualman.duration3to30' })
                          : intl.formatMessage({ id: 'playground.virtualman.duration2to30' }),
                      },
                    )
                  : intl.formatMessage({ id: 'playground.virtualman.refVideoPlaceholder' })
              }
              value={referenceVideo}
              onChange={(e) => setReferenceVideo(e.target.value)}
            />
            <Upload {...buildUploadProps('video')}>
              <Button icon={uploadingRef ? <LoadingOutlined /> : <UploadOutlined />} disabled={uploadingRef}>
                {intl.formatMessage({ id: 'playground.virtualman.uploadVideoBtn' })}
              </Button>
            </Upload>
          </Space>
        </Card>
      )}

      {/* 动作模仿选项(prompt + 可灵 motion-control 专属参数) */}
      {isMotionMimic && (
        <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.cardMotionOptions' })} className="pg-section">
          <Space direction="vertical" style={{ width: '100%' }} size={[0, 12]}>
            <TextArea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                isKlingMotion
                  ? intl.formatMessage({ id: 'playground.virtualman.motionPromptKling' })
                  : intl.formatMessage({ id: 'playground.virtualman.motionPromptDefault' })
              }
            />
            {isKlingMotion && (
              <>
                <Space wrap>
                  <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.qualityTier' })}</span>
                  <Radio.Group
                    value={klingMotionMode}
                    onChange={(e) => setKlingMotionMode(e.target.value)}
                    optionType="button"
                    options={[
                      { value: 'std', label: intl.formatMessage({ id: 'playground.virtualman.modeStd720' }) },
                      { value: 'pro', label: intl.formatMessage({ id: 'playground.virtualman.modePro1080' }) },
                    ]}
                  />
                </Space>
                <Space wrap>
                  <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.keepOriginalSound' })}</span>
                  <Radio.Group
                    value={keepOriginalSound}
                    onChange={(e) => setKeepOriginalSound(e.target.value)}
                    optionType="button"
                    options={[
                      { value: 'yes', label: intl.formatMessage({ id: 'playground.virtualman.keep' }) },
                      { value: 'no', label: intl.formatMessage({ id: 'playground.virtualman.notKeep' }) },
                    ]}
                  />
                </Space>
                <Space wrap>
                  <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.characterOrientation' })}</span>
                  <Radio.Group
                    value={characterOrientation}
                    onChange={(e) => setCharacterOrientation(e.target.value)}
                    optionType="button"
                    options={[
                      { value: 'video', label: intl.formatMessage({ id: 'playground.virtualman.orientVideo' }) },
                      { value: 'image', label: intl.formatMessage({ id: 'playground.virtualman.orientImage' }) },
                    ]}
                  />
                </Space>
              </>
            )}
          </Space>
        </Card>
      )}

      {/* 即梦驱动音频 */}
      {isJimeng && (
        <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.cardDriveAudio' })} className="pg-section">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              prefix={<AudioOutlined />}
              placeholder={intl.formatMessage({ id: 'playground.virtualman.jimengAudioPlaceholder' })}
              value={inputAudioUrl}
              onChange={(e) => setInputAudioUrl(e.target.value)}
            />
            <Upload {...buildUploadProps('audio')}>
              <Button icon={uploadingRef ? <LoadingOutlined /> : <UploadOutlined />} disabled={uploadingRef}>
                {intl.formatMessage({ id: 'playground.virtualman.uploadAudioBtn' })}
              </Button>
            </Upload>
            <TextArea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={intl.formatMessage({ id: 'playground.virtualman.jimengPromptPlaceholder' })}
            />
          </Space>
        </Card>
      )}

      {/* 万相驱动音频 */}
      {showWanAudioCard && (
        <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.cardDriveAudio' })} className="pg-section">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              prefix={<AudioOutlined />}
              placeholder={
                modelName === 'emo-v1'
                  ? intl.formatMessage({ id: 'playground.virtualman.wanAudioPlaceholder60' })
                  : modelName === 'liveportrait'
                  ? intl.formatMessage({ id: 'playground.virtualman.wanAudioPlaceholder180' })
                  : intl.formatMessage({ id: 'playground.virtualman.wanAudioPlaceholderDefault' })
              }
              value={inputAudioUrl}
              onChange={(e) => setInputAudioUrl(e.target.value)}
            />
            <Upload {...buildUploadProps('audio')}>
              <Button icon={uploadingRef ? <LoadingOutlined /> : <UploadOutlined />} disabled={uploadingRef}>
                {intl.formatMessage({ id: 'playground.virtualman.uploadAudioBtn' })}
              </Button>
            </Upload>
          </Space>
        </Card>
      )}

      {/* 万相 Emoji 模板 */}
      {isWan && wanCap.drivenId && (
        <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.cardEmojiTemplate' })} className="pg-section">
          <Select
            style={{ minWidth: 280 }}
            value={drivenId}
            onChange={(v) => setDrivenId(v)}
            options={EMOJI_DRIVEN_IDS.map((d) => ({ value: d, label: d }))}
            showSearch
            placeholder={intl.formatMessage({ id: 'playground.virtualman.selectEmojiTemplate' })}
          />
        </Card>
      )}

      {/* 万相 Animate 质量档位 */}
      {isWan && wanCap.mode && (
        <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.qualityTierTitle' })} className="pg-section">
          <Space wrap size={[16, 12]}>
            <Radio.Group
              value={animateMode}
              onChange={(e) => setAnimateMode(e.target.value)}
              optionType="button"
              options={[
                { value: 'wan-std', label: intl.formatMessage({ id: 'playground.virtualman.wanStdFast' }) },
                { value: 'wan-pro', label: intl.formatMessage({ id: 'playground.virtualman.wanProQuality' }) },
              ]}
            />
            <Space>
              <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.addWatermark' })}</span>
              <Switch checked={watermark} onChange={setWatermark} />
            </Space>
          </Space>
        </Card>
      )}

      {/* 万相高级选项(liveportrait 运动 / videoretalk) */}
      {isWan && (wanCap.motion || wanCap.retalk) && (
        <Collapse
          ghost
          items={[
            {
              key: 'wan-adv',
              label: intl.formatMessage({ id: 'playground.virtualman.advancedOptions' }),
              children: (
                <Space wrap size={[16, 12]}>
                  {wanCap.motion && (
                    <>
                      <Space>
                        <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.templateLabel' })}</span>
                        <Radio.Group
                          value={templateId}
                          onChange={(e) => setTemplateId(e.target.value)}
                          optionType="button"
                          options={[
                            { value: 'normal', label: intl.formatMessage({ id: 'playground.virtualman.styleNormal' }) },
                            { value: 'calm', label: intl.formatMessage({ id: 'playground.virtualman.templateCalmBroadcast' }) },
                            { value: 'active', label: intl.formatMessage({ id: 'playground.virtualman.templateActiveSing' }) },
                          ]}
                        />
                      </Space>
                      <Space>
                        <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.fpsLabel' })}</span>
                        <InputNumber min={15} max={30} value={videoFps} onChange={(v) => setVideoFps(v)} />
                      </Space>
                    </>
                  )}
                  {wanCap.retalk && (
                    <>
                      <Space direction="vertical">
                        <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.refImageFaceLabel' })}</span>
                        <Input
                          style={{ width: 360 }}
                          placeholder={intl.formatMessage({ id: 'playground.virtualman.refImageFacePlaceholder' })}
                          value={refImageUrl}
                          onChange={(e) => setRefImageUrl(e.target.value)}
                        />
                      </Space>
                      <Space>
                        <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.loopVideoLabel' })}</span>
                        <Switch checked={videoExtension} onChange={setVideoExtension} />
                      </Space>
                    </>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      {/* 腾讯 broadcast 形象 */}
      {isBroadcast && (
        <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.cardBroadcastTitle' })} className="pg-section">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              prefix={<UserOutlined />}
              placeholder={intl.formatMessage({ id: 'playground.virtualman.broadcastKeyPlaceholder' })}
              value={virtualmanKey}
              onChange={(e) => setVirtualmanKey(e.target.value)}
            />
            <Space wrap>
              <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.outputFormat' })}</span>
              <Radio.Group
                value={videoFormat}
                onChange={(e) => setVideoFormat(e.target.value)}
                optionType="button"
                options={[
                  { value: 'Mp4', label: 'Mp4' },
                  { value: 'TransparentWebm', label: intl.formatMessage({ id: 'playground.virtualman.formatWebm' }) },
                  { value: 'TransparentMov', label: intl.formatMessage({ id: 'playground.virtualman.formatMov' }) },
                ]}
              />
            </Space>
          </Space>
        </Card>
      )}

      {/* 腾讯驱动方式 */}
      {isTencent && (
        <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.cardDriverType' })} className="pg-section">
          <Radio.Group
            value={driverType}
            onChange={(e) => setDriverType(e.target.value)}
            optionType="button"
            options={
              isBroadcast
                ? [
                    { value: 'Text', label: intl.formatMessage({ id: 'playground.virtualman.driverText' }) },
                    { value: 'OriginalVoice', label: intl.formatMessage({ id: 'playground.virtualman.driverOriginalVoice' }) },
                    { value: 'ModulatedVoice', label: intl.formatMessage({ id: 'playground.virtualman.driverModulatedVoice' }) },
                  ]
                : [
                    { value: 'Text', label: intl.formatMessage({ id: 'playground.virtualman.driverText' }) },
                    { value: 'OriginalVoice', label: intl.formatMessage({ id: 'playground.virtualman.driverOriginalLip' }) },
                  ]
            }
          />

          {driverType === 'Text' && (
            <div className="pg-virtualman-driver">
              <TextArea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  isBroadcast
                    ? intl.formatMessage({ id: 'playground.virtualman.broadcastTextPlaceholder' })
                    : isLipsyncPhoto
                    ? intl.formatMessage({ id: 'playground.virtualman.photoTextPlaceholder' })
                    : intl.formatMessage({ id: 'playground.virtualman.videoTextPlaceholder' })
                }
              />
              <Space wrap style={{ marginTop: 12 }}>
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.timbreKeyLabel' })}</span>
                <Input
                  placeholder={intl.formatMessage({ id: 'playground.virtualman.timbreKeyPlaceholder' })}
                  style={{ width: 220 }}
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                />
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.speechSpeed' })}</span>
                <InputNumber min={0.5} max={1.5} step={0.1} value={speechSpeed} onChange={(v) => setSpeechSpeed(v)} />
                <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.speechVolume' })}</span>
                <InputNumber min={0} max={10} value={speechVolume} onChange={(v) => setSpeechVolume(v)} />
              </Space>
            </div>
          )}

          {(driverType === 'OriginalVoice' || driverType === 'ModulatedVoice') && (
            <div className="pg-virtualman-driver">
              <Input
                prefix={<AudioOutlined />}
                placeholder={
                  isLipsyncPhoto
                    ? intl.formatMessage({ id: 'playground.virtualman.photoAudioPlaceholder' })
                    : intl.formatMessage({ id: 'playground.virtualman.videoAudioPlaceholder' })
                }
                value={inputAudioUrl}
                onChange={(e) => setInputAudioUrl(e.target.value)}
              />
              {driverType === 'ModulatedVoice' && (
                <Space wrap style={{ marginTop: 12 }}>
                  <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.modulateTargetTimbre' })}</span>
                  <Input
                    placeholder={intl.formatMessage({ id: 'playground.virtualman.modulateTimbrePlaceholder' })}
                    style={{ width: 220 }}
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                  />
                </Space>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 腾讯高级选项 */}
      {isTencent && (
        <Collapse
          ghost
          items={[
            {
              key: 'adv',
              label: intl.formatMessage({ id: 'playground.virtualman.advancedOptionsTencent' }),
              children: (
                <Space wrap size={[16, 12]}>
                  {driverType === 'Text' && (
                    <>
                      <Space>
                        <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.emotionCategory' })}</span>
                        <Input
                          placeholder={intl.formatMessage({ id: 'playground.virtualman.emotionCategoryPlaceholder' })}
                          style={{ width: 200 }}
                          value={emotionCategory}
                          onChange={(e) => setEmotionCategory(e.target.value)}
                        />
                      </Space>
                      <Space>
                        <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.emotionIntensity' })}</span>
                        <InputNumber min={50} max={200} value={emotionIntensity} onChange={(v) => setEmotionIntensity(v)} />
                      </Space>
                      <Space>
                        <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.timbreLanguage' })}</span>
                        <Input
                          placeholder={intl.formatMessage({ id: 'playground.virtualman.timbreLanguagePlaceholder' })}
                          style={{ width: 140 }}
                          value={timbreLanguage}
                          onChange={(e) => setTimbreLanguage(e.target.value)}
                        />
                      </Space>
                    </>
                  )}
                  {isLipsyncPhoto && (
                    <Space>
                      <span className="pg-label">{intl.formatMessage({ id: 'playground.virtualman.actionPromptLabel' })}</span>
                      <Input
                        placeholder={intl.formatMessage({ id: 'playground.virtualman.actionPromptPlaceholder' })}
                        style={{ width: 280 }}
                        value={actionPrompt}
                        onChange={(e) => setActionPrompt(e.target.value)}
                      />
                    </Space>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      <Card size="small" className="pg-section">
        <Space>
          <Button type="primary" icon={<SendOutlined />} loading={submitting} disabled={!selectedToken} onClick={onSubmit}>
            {intl.formatMessage({ id: 'playground.virtualman.submitTask' })}
          </Button>
          {task && !isTerminal && (
            <Button onClick={onCancel} danger>
              {intl.formatMessage({ id: 'common.cancel' })}
            </Button>
          )}
          {task && <Button onClick={onReset}>{intl.formatMessage({ id: 'playground.virtualman.clear' })}</Button>}
          {task && !isTerminal && (
            <span className="pg-virtualman-elapsed">
              <Spin size="small" /> {intl.formatMessage({ id: 'playground.virtualman.elapsed' }, { time: elapsedLabel })}
              {polling ? intl.formatMessage({ id: 'playground.virtualman.refreshing' }) : ''}
            </span>
          )}
        </Space>
      </Card>

      {errMsg && (
        <Alert
          type="error"
          message={intl.formatMessage({ id: 'playground.virtualman.taskError' })}
          description={errMsg}
          showIcon
          style={{ marginTop: 12 }}
        />
      )}

      <Card size="small" title={intl.formatMessage({ id: 'playground.virtualman.resultTitle' })} className="pg-section" style={{ marginTop: 12 }}>
        {!task ? (
          <Empty description={intl.formatMessage({ id: 'playground.virtualman.noTaskYet' })} />
        ) : (
          <div className="pg-virtualman-result">
            <Space wrap>
              <Tag>{intl.formatMessage({ id: 'playground.virtualman.statusTag' }, { status: task.status })}</Tag>
              <Tag>{intl.formatMessage({ id: 'playground.virtualman.modelTag' }, { model: task.model })}</Tag>
              <Tag>{intl.formatMessage({ id: 'playground.virtualman.taskIdTag' }, { id: task.id })}</Tag>
              {task.completed_at && task.created_at ? (
                <Tag color="blue">
                  {intl.formatMessage(
                    { id: 'playground.virtualman.durationTag' },
                    { sec: task.completed_at - task.created_at },
                  )}
                </Tag>
              ) : null}
            </Space>
            {task.status === 'succeeded' && videoURL && (
              <div style={{ marginTop: 12 }}>
                <video src={videoURL} controls style={{ maxWidth: '100%', maxHeight: 540 }} />
                <div style={{ marginTop: 8 }}>
                  <Button icon={<DownloadOutlined />} href={videoURL} target="_blank" download>
                    {intl.formatMessage({ id: 'playground.virtualman.downloadVideo' })}
                  </Button>
                </div>
              </div>
            )}
            {task.status === 'failed' && task.error && (
              <Alert
                type="error"
                style={{ marginTop: 12 }}
                message={task.error.code || 'failed'}
                description={task.error.message}
                showIcon
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
