import {
  DownloadOutlined,
  HistoryOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Image,
  Input,
  InputNumber,
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
import { systemApi } from '@/services/api';
import { t } from '@/utils/i18n';
import { browserDownloadName, publicMediaURL } from '@/utils/media';
import { apiURL } from '@/utils/request';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';
import ThreeDHistoryDrawer from './ThreeDHistoryDrawer';
import SceneViewer, { classifyThreeDFile, type SceneKind } from './SceneViewer';
import { playgroundUpload } from './upload';

const { TextArea } = Input;
const LS_LAST_TASK = 'playground_3d_last_task_v1';

type ThreeDTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

type ThreeDFile = {
  type?: string;
  url?: string;
  filename?: string;
  preview_image_url?: string;
};

type ThreeDTask = {
  id: string;
  object: string;
  model: string;
  status: ThreeDTaskStatus;
  created_at: number;
  completed_at?: number;
  result_url?: string;
  preview_url?: string;
  files?: ThreeDFile[];
  error?: { code?: string; message?: string };
  usage?: { quota_cost?: number; usd_cost?: string };
};

function extractErrMsg(raw: string, httpStatus: number): string {
  if (!raw) return `HTTP ${httpStatus}`;
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.message || raw.slice(0, 1200);
  } catch {
    return raw.slice(0, 1200);
  }
}

function submitErrMsg(raw: string, httpStatus: number, hasImageInput: boolean): string {
  const msg = extractErrMsg(raw, httpStatus);
  if (hasImageInput && /prompt is required \(or provide image input\)/i.test(msg)) {
    return `${msg}. ${t('playground.threeD.imagesFieldHint')}`;
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

function statusColor(s: string): 'default' | 'processing' | 'success' | 'error' {
  switch (s) {
    case 'queued':
      return 'default';
    case 'running':
      return 'processing';
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

function statusText(s: string): string {
  const m: Record<string, string> = {
    queued: t('playground.threeD.statusQueued'),
    running: t('playground.threeD.statusRunning'),
    succeeded: t('playground.threeD.statusSucceeded'),
    failed: t('playground.threeD.statusFailed'),
  };
  return m[s] || s;
}

function isProModel(model?: string): boolean {
  const m = (model || '').toLowerCase();
  return /pro/.test(m) || m === 'hy-3d-3.0' || m === 'hy-3d-3.1';
}

function isTripoModel(model?: string): boolean {
  return (model || '').toLowerCase().startsWith('tripo/');
}

function isVolcArk3DModel(model?: string): boolean {
  const m = (model || '').toLowerCase();
  return (
    m === 'hyper3d-gen2' ||
    m === 'hitem3d-2.0' ||
    m === 'doubao-seed3d-2-0-260328'
  );
}

function requiresImageInput(model?: string): boolean {
  const m = (model || '').toLowerCase();
  return m === 'hitem3d-2.0' || m === 'doubao-seed3d-2-0-260328';
}

// 混元 3D 世界模型:支持文生/图生场景 + 世界重建(多视角图片组或短视频)。
function isHunyuanWorldModel(model?: string): boolean {
  return (model || '').toLowerCase() === 'hunyuan/3d_2.0';
}

// 世界模型输入文件是否为视频(短视频实景复刻)。
function isVideoFileName(name?: string): boolean {
  const n = (name || '').toLowerCase().split(/[?#]/)[0];
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(n);
}

// 腾讯混元生 3D 进阶能力(3D→3D / 同步转换)。返回 op 标识,非进阶模型返回 ''。
function hunyuanAdvOp(model?: string): string {
  switch ((model || '').toLowerCase()) {
    case 'hy-3d-profile':
      return 'profile';
    case 'hy-3d-texture':
      return 'texture';
    case 'hy-3d-reduceface':
      return 'reduceface';
    case 'hy-3d-part':
      return 'part';
    case 'hy-3d-uv':
      return 'uv';
    case 'hy-3d-motion':
      return 'motion';
    case 'hy-3d-rigging':
      return 'rigging';
    case 'hy-3d-convert':
      return 'convert';
    default:
      return '';
  }
}

// 需要「必填」输入 3D 模型文件的 op(motion 的模型是可选重定向,convert 单独处理)。
const MODEL_FILE_OPS = ['texture', 'reduceface', 'part', 'uv', 'rigging'];

function opAcceptModelExts(op: string): string {
  switch (op) {
    case 'part':
      return '.fbx';
    case 'reduceface':
    case 'texture':
      return '.obj,.glb';
    case 'rigging':
      return '.fbx,.glb';
    default:
      return '.fbx,.obj,.glb,.gltf,.stl'; // uv / motion retarget / convert
  }
}

function inferModelType(name?: string): string {
  const n = (name || '').toLowerCase().split(/[?#]/)[0];
  for (const e of ['fbx', 'obj', 'glb', 'gltf', 'stl']) {
    if (n.endsWith('.' + e)) return e.toUpperCase();
  }
  return '';
}

const PROFILE_TEMPLATES = [
  'basketball', 'badminton', 'pingpong', 'gymnastics', 'pilidance', 'tennis',
  'athletics', 'footballboykicking1', 'footballboykicking2', 'guitar',
  'footballboy', 'skateboard', 'futuresoilder', 'explorer', 'beardollgirl',
  'bibpantsboy', 'womansitpose', 'womanstandpose2', 'mysteriousprincess',
  'manstandpose2',
];

const CONVERT_FORMATS = ['STL', 'USDZ', 'FBX', 'MP4', 'GIF'];

function fixedProVersion(model?: string): string | undefined {
  const m = (model || '').toLowerCase();
  if (m === 'hy-3d-3.0') return '3.0';
  if (m === 'hy-3d-3.1') return '3.1';
  return undefined;
}

function formatOptions(model?: string) {
  if (isTripoModel(model)) {
    return [{ value: 'GLB', label: 'GLB' }];
  }
  const m = (model || '').toLowerCase();
  if (m === 'hyper3d-gen2') {
    return [
      { value: 'glb', label: 'GLB' },
      { value: 'obj', label: 'OBJ' },
      { value: 'usdz', label: 'USDZ' },
      { value: 'fbx', label: 'FBX' },
      { value: 'stl', label: 'STL' },
    ];
  }
  if (m === 'hitem3d-2.0') {
    return [
      { value: 'glb', label: 'GLB' },
      { value: 'obj', label: 'OBJ' },
      { value: 'stl', label: 'STL' },
      { value: 'fbx', label: 'FBX' },
      { value: 'usdz', label: 'USDZ' },
    ];
  }
  if (m === 'doubao-seed3d-2-0-260328') {
    return [
      { value: 'glb', label: 'GLB' },
      { value: 'obj', label: 'OBJ' },
      { value: 'usd', label: 'USD' },
      { value: 'usdz', label: 'USDZ' },
    ];
  }
  if (isProModel(model)) {
    return [
      { value: 'FBX', label: 'FBX' },
      { value: 'USDZ', label: 'USDZ' },
      { value: 'STL', label: 'STL' },
    ];
  }
  return [
    { value: 'GLB', label: 'GLB' },
    { value: 'OBJ', label: 'OBJ' },
    { value: 'FBX', label: 'FBX' },
    { value: 'USDZ', label: 'USDZ' },
    { value: 'STL', label: 'STL' },
    { value: 'MP4', label: t('playground.threeD.formatMp4Preview') },
  ];
}

function fileNameFromURL(raw?: string): string | undefined {
  const url = raw?.trim();
  if (!url) return undefined;
  try {
    const u = new URL(url, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : undefined;
  } catch {
    return undefined;
  }
}

function threeDFileType(file: ThreeDFile, url?: string): string {
  const raw = `${file.type || ''} ${file.filename || ''} ${url || file.url || ''}`.toLowerCase();
  if (/(?:^|\W)zip(?:\W|$)|\.zip(?:[?#]|$)/.test(raw)) return 'ZIP';
  for (const ext of ['glb', 'gltf', 'obj', 'fbx', 'stl', 'usdz', 'usd']) {
    if (new RegExp(`(?:^|\\W)${ext}(?:\\W|$)|\\.${ext}(?:[?#]|$)`).test(raw)) {
      return ext.toUpperCase();
    }
  }
  return file.type || resultFormatFallback(url) || '3D';
}

function resultFormatFallback(url?: string): string | undefined {
  const name = fileNameFromURL(url)?.toLowerCase();
  if (!name) return undefined;
  const ext = name.split('.').pop();
  return ext ? ext.toUpperCase() : undefined;
}

function isZipFile(file: ThreeDFile, url?: string): boolean {
  return threeDFileType(file, url) === 'ZIP';
}

function displayFileName(file: ThreeDFile, url: string, fallback: string): string {
  return file.filename || fileNameFromURL(url) || fallback;
}

export default function ThreeDPanel() {
  const intl = useIntl();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const { apiKey } = usePlaygroundApiKey();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelName, setModelName] = useState<string>();
  // 交互式查看器加载失败时记录该 URL,回退到「预览图 + 下载」兜底。
  const [viewerFailedURL, setViewerFailedURL] = useState<string>();

  const [prompt, setPrompt] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [imageAssetID, setImageAssetID] = useState<number>();
  const [previewURL, setPreviewURL] = useState('');
  // 世界重建(实景复刻)多文件:图片组 / 短视频。ref 用 asset id(优先)或 url。
  const [worldFiles, setWorldFiles] = useState<
    Array<{ id?: number; url?: string; name: string; video: boolean }>
  >([]);
  const [worldUploading, setWorldUploading] = useState(false);
  const [resultFormat, setResultFormat] = useState<string>();
  const [enablePBR, setEnablePBR] = useState(true);
  const [modelVersion, setModelVersion] = useState<string>('3.0');
  const [faceCount, setFaceCount] = useState<number | undefined>(500000);
  const [generateType, setGenerateType] = useState<string | undefined>('Normal');
  const [polygonType, setPolygonType] = useState<string | undefined>();
  const [enableGeometry, setEnableGeometry] = useState(false);

  // 进阶能力(3D→3D / 同步转换)相关入参
  const [inputModelURL, setInputModelURL] = useState('');
  const [inputModelType, setInputModelType] = useState<string>('');
  const [inputModelAssetID, setInputModelAssetID] = useState<number>();
  const [inputModelName, setInputModelName] = useState('');
  const [template, setTemplate] = useState<string>();
  const [faceLevel, setFaceLevel] = useState<string>();
  const [reducePolygonType, setReducePolygonType] = useState<string>();
  const [motionType, setMotionType] = useState<number | undefined>();
  const [duration, setDuration] = useState<number | undefined>(5);
  const [enableMesh, setEnableMesh] = useState(true);
  const [enableRewrite, setEnableRewrite] = useState(false);
  const [enableDurationEst, setEnableDurationEst] = useState(false);
  const [convertFormat, setConvertFormat] = useState<string>('STL');
  const [uploadingModel, setUploadingModel] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<ThreeDTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === '3d' && m.enabled !== false)
        .map((m) => ({
          value: m.name,
          label: m.display_name ? `${m.display_name}` : m.name,
        }));
      setModels(list);
      if (list.length > 0) {
        setModelName((prev) => prev ?? list[0].value);
      }
    });
    const saved = localStorage.getItem(LS_LAST_TASK);
    if (saved) {
      try {
        const t = JSON.parse(saved) as ThreeDTask;
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

  useEffect(() => {
    const opts = formatOptions(modelName);
    setResultFormat((prev) => (prev && opts.some((x) => x.value === prev) ? prev : opts[0]?.value));
    setWorldFiles([]); // 切换模型清空世界重建文件列表
  }, [modelName]);

  const pro = isProModel(modelName);
  const tripo = isTripoModel(modelName);
  const volc3d = isVolcArk3DModel(modelName);
  const worldModel = isHunyuanWorldModel(modelName);
  const worldHasFiles = worldModel && worldFiles.length > 0;
  const imageRequired = requiresImageInput(modelName);
  const proVersion = fixedProVersion(modelName) || modelVersion;
  const hasImageInput = !!imageURL.trim() || !!imageAssetID;

  // 进阶能力派生标记
  const advOp = hunyuanAdvOp(modelName);
  const isAdv = advOp !== '';
  const isConvert = advOp === 'convert';
  const isProfile = advOp === 'profile';
  const isMotion = advOp === 'motion';
  const isTexture = advOp === 'texture';
  const needModelFile = MODEL_FILE_OPS.includes(advOp) || isConvert; // 必填模型文件
  const acceptModelFile = needModelFile || isMotion; // motion 模型可选
  // 世界模型用多文件上传器(见下)替代单图输入,故这里排除。
  const showImageInput = (!isAdv || isProfile || isTexture) && !worldModel;
  const showPrompt = !isAdv || isTexture || isMotion;
  const hasModelFileInput = !!inputModelURL.trim() || !!inputModelAssetID;

  const modelUploadProps: UploadProps = {
    accept: opAcceptModelExts(advOp),
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploadingModel(true);
      try {
        const f = file as File;
        const { id } = await playgroundUpload(f, apiKey, {
          module: 'model3d',
          purpose: '3d_input',
        });
        setInputModelAssetID(id);
        setInputModelURL('');
        setInputModelName(f.name);
        setInputModelType(inferModelType(f.name));
        message.success(intl.formatMessage({ id: 'playground.threeD.inputModelUploaded' }));
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.threeD.uploadFailed' }));
        onError?.(e);
      } finally {
        setUploadingModel(false);
      }
    },
  };

  const clearInputModel = () => {
    setInputModelURL('');
    setInputModelAssetID(undefined);
    setInputModelName('');
    setInputModelType('');
  };

  const uploadProps: UploadProps = {
    accept: 'image/*',
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.threeD.uploadImageOnly' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploading(true);
      try {
        const f = file as File;
        const { url, id } = await playgroundUpload(f, apiKey, {
          module: 'model3d',
          purpose: '3d_input',
        });
        setImageAssetID(id);
        setImageURL('');
        if (!isVolcArk3DModel(modelName)) setPrompt('');
        setPreviewURL(url);
        message.success(intl.formatMessage({ id: 'playground.threeD.inputImageUploaded' }));
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.threeD.uploadFailed' }));
        onError?.(e);
      } finally {
        setUploading(false);
      }
    },
  };

  // 世界重建多文件上传:接受图片 + 短视频,多选,逐个转存后追加到 worldFiles。
  const worldUploadProps: UploadProps = {
    accept: 'image/*,video/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      const ok = (file.type || '').startsWith('image/') || (file.type || '').startsWith('video/');
      if (!ok) {
        message.warning(intl.formatMessage({ id: 'playground.threeD.uploadImageOnly' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setWorldUploading(true);
      try {
        const f = file as File;
        const video = (f.type || '').startsWith('video/') || isVideoFileName(f.name);
        const { url, id } = await playgroundUpload(f, apiKey, {
          module: 'model3d',
          purpose: '3d_input',
        });
        setWorldFiles((prev) => [...prev, { id, url, name: f.name, video }]);
        // 世界模型允许 prompt + 文件并存(实景复刻可带文字引导),不清空 prompt。
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.threeD.uploadFailed' }));
        onError?.(e);
      } finally {
        setWorldUploading(false);
      }
    },
  };

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
    if (!apiKey) return;
    if (!auto) setPolling(true);
    try {
      const res = await fetch(apiURL(`/v1/3d/generations/${id}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const msg = extractErrMsg(text, res.status);
        if (auto && isTransientPollError(res.status, msg)) {
          setErrMsg(`${intl.formatMessage({ id: 'playground.threeD.autoRefreshFailed' })}: ${msg}`);
          schedulePoll(id);
          return;
        }
        setErrMsg(msg);
        return;
      }
      const t = JSON.parse(text) as ThreeDTask;
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
        setErrMsg(`${intl.formatMessage({ id: 'playground.threeD.autoRefreshFailed' })}: ${msg}`);
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.threeD.selectModelWarn' }));
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));

    // 按能力做必填校验
    if (isConvert) {
      if (!hasModelFileInput) return message.warning(intl.formatMessage({ id: 'playground.threeD.needModelFileWarn' }));
      if (!convertFormat) return message.warning(intl.formatMessage({ id: 'playground.threeD.needConvertFormatWarn' }));
    } else if (isProfile) {
      if (!hasImageInput && !template) return message.warning(intl.formatMessage({ id: 'playground.threeD.profileNeedInputWarn' }));
    } else if (isMotion) {
      if (!prompt.trim()) return message.warning(intl.formatMessage({ id: 'playground.threeD.motionNeedPromptWarn' }));
    } else if (needModelFile) {
      if (!hasModelFileInput) return message.warning(intl.formatMessage({ id: 'playground.threeD.needModelFileWarn' }));
      if (isTexture && prompt.trim() && hasImageInput)
        return message.warning(intl.formatMessage({ id: 'playground.threeD.promptImageExclusiveWarn' }));
    } else {
      // 世界模型:prompt(文生)、单/多图或短视频(图生/实景复刻)任一即可,且允许 prompt+文件并存。
      if (!prompt.trim() && !hasImageInput && !worldHasFiles)
        return message.warning(intl.formatMessage({ id: 'playground.threeD.promptOrImageWarn' }));
      if (imageRequired && !hasImageInput)
        return message.warning(intl.formatMessage({ id: 'playground.threeD.modelRequiresImageWarn' }, { model: modelName }));
      if (prompt.trim() && hasImageInput && !volc3d)
        return message.warning(intl.formatMessage({ id: 'playground.threeD.promptImageExclusiveWarn' }));
    }

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      // 同步格式转换:单独端点,直接返回结果,不轮询
      if (isConvert) {
        const body: any = { model: modelName, format: convertFormat };
        if (inputModelAssetID) body.file_asset_id = inputModelAssetID;
        else body.file_url = inputModelURL.trim();
        const res = await fetch(apiURL('/v1/3d/convert'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        if (!res.ok) {
          setErrMsg(extractErrMsg(text, res.status));
          return;
        }
        const d = JSON.parse(text) as { result_url?: string; usage?: ThreeDTask['usage'] };
        const now = Math.floor(Date.now() / 1000);
        setTask({
          id: `convert-${now}`,
          object: '3d.convert',
          model: modelName,
          status: 'succeeded',
          created_at: now,
          completed_at: now,
          result_url: d.result_url,
          usage: d.usage,
        });
        return;
      }

      const body: any = { model: modelName };
      // 输入 3D 模型文件(3D→3D 能力 + motion 可选重定向)
      if (acceptModelFile && hasModelFileInput) {
        if (inputModelAssetID) {
          body.input_model_asset_id = inputModelAssetID;
        } else {
          body.input_model_url = inputModelURL.trim();
          if (inputModelType) body.input_model_type = inputModelType;
        }
      }
      // 世界重建(实景复刻):多文件(图片组 / 短视频)全部进 images
      if (worldModel && worldFiles.length) {
        body.images = worldFiles.map((f) => f.id ?? f.url).filter(Boolean);
      }
      // 输入图(legacy / profile / texture)
      else if (imageAssetID) body.images = [imageAssetID];
      else if (imageURL.trim()) body.images = [imageURL.trim()];
      // 提示词
      const wantPrompt =
        (!isAdv && (!hasImageInput || volc3d)) || isMotion || (isTexture && !hasImageInput);
      if (wantPrompt && prompt.trim()) body.prompt = prompt.trim();

      // 能力专属参数
      const params: any = {};
      if (worldModel) {
        // 世界模型:输出格式由 SceneType 决定,不下发 result_format/enable_pbr 等。
      } else if (!isAdv) {
        body.result_format = resultFormat;
        body.enable_pbr = enablePBR;
        if (pro) {
          if (proVersion) body.model_version = proVersion;
          if (faceCount) body.face_count = faceCount;
          if (generateType) body.generate_type = generateType;
          if (polygonType) body.polygon_type = polygonType;
        } else if (!tripo && enableGeometry) {
          body.enable_geometry = true;
        }
      } else if (isProfile) {
        if (template) params.template = template;
      } else if (isTexture) {
        body.enable_pbr = enablePBR;
        if (modelVersion) params.model_version = modelVersion;
      } else if (advOp === 'reduceface') {
        if (reducePolygonType) params.polygon_type = reducePolygonType;
        if (faceLevel) params.face_level = faceLevel;
      } else if (advOp === 'part') {
        params.model_version = '1.5';
      } else if (isMotion) {
        if (duration) params.duration = duration;
        params.enable_mesh = enableMesh;
        if (enableRewrite) params.enable_rewrite = true;
        if (enableDurationEst) params.enable_duration_est = true;
      } else if (advOp === 'rigging') {
        if (motionType) params.motion_type = motionType;
      }
      if (Object.keys(params).length) body.parameters = params;

      const res = await fetch(apiURL('/v1/3d/generations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        setErrMsg(submitErrMsg(text, res.status, hasImageInput));
        return;
      }
      const t = JSON.parse(text) as ThreeDTask;
      setTask(t);
      if (t.status === 'queued' || t.status === 'running') {
        startTimer(t.created_at);
        schedulePoll(t.id, 3000);
      }
    } catch (e: any) {
      setErrMsg(String(e?.message || e));
    } finally {
      setSubmitting(false);
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

  const clearImage = () => {
    setImageURL('');
    setImageAssetID(undefined);
    setPreviewURL('');
  };

  const isInFlight = task && (task.status === 'queued' || task.status === 'running');
  const elapsedText = `${(elapsedMs / 1000).toFixed(1)}s`;
  const finalLatency =
    task?.completed_at && task?.created_at ? `${task.completed_at - task.created_at}s` : undefined;
  const resultURL = publicMediaURL(task?.result_url || task?.files?.find((f) => f.url)?.url);
  const taskPreviewURL = publicMediaURL(
    task?.preview_url || task?.files?.find((f) => f.preview_image_url)?.preview_image_url,
  );
  const files = (task?.files || []).reduce<Array<{ file: ThreeDFile; url: string; index: number }>>(
    (acc, file, index) => {
      const url = publicMediaURL(file.url);
      if (url) acc.push({ file, url, index });
      return acc;
    },
    [],
  );
  // 挑一个可交互内嵌渲染的产物:高斯泼溅 > mesh > 全景视频。
  const sceneItem: { url: string; kind: SceneKind } | null = (() => {
    const priority: SceneKind[] = ['splat', 'mesh', 'panorama-video'];
    for (const want of priority) {
      for (const { file, url } of files) {
        if (classifyThreeDFile(file.type, url) === want) return { url, kind: want };
      }
    }
    return null;
  })();

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.threeD.title' })}</span>}
          extra={
            <Space size={10}>
              <Button
                size="small"
                type="text"
                icon={<HistoryOutlined />}
                onClick={() => setHistoryOpen(true)}
              >
                {intl.formatMessage({ id: 'playground.video.history' })}
              </Button>
              <span style={{ color: '#888', fontSize: 12 }}>
                POST {isConvert ? '/v1/3d/convert' : '/v1/3d/generations'}
              </span>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.modelLabel' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.threeD.selectModelPlaceholder' })}
                options={models}
                value={modelName}
                onChange={setModelName}
                showSearch
                optionFilterProp="label"
                disabled={!!isInFlight || submitting}
              />
            </div>
            <ApiKeyField />
            {showImageInput && (
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.imageLabel' })}</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder={intl.formatMessage({ id: 'playground.threeD.imageUrlPlaceholder' })}
                  value={imageURL}
                  onChange={(e) => {
                    setImageURL(e.target.value);
                    setImageAssetID(undefined);
                    if (e.target.value.trim() && !isVolcArk3DModel(modelName)) setPrompt('');
                    setPreviewURL('');
                  }}
                  allowClear
                  disabled={!!isInFlight || submitting}
                />
                <Button onClick={clearImage} disabled={!!isInFlight || submitting}>
                  {intl.formatMessage({ id: 'playground.threeD.clear' })}
                </Button>
              </Space.Compact>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Upload {...uploadProps} disabled={!!isInFlight || submitting}>
                  <Button
                    icon={<UploadOutlined />}
                    loading={uploading}
                    disabled={!!isInFlight || submitting}
                  >
                    {intl.formatMessage({ id: 'playground.threeD.uploadInputImage' })}
                  </Button>
                </Upload>
                {imageAssetID && <Tag color="blue">asset #{imageAssetID}</Tag>}
              </div>
              {(previewURL || imageURL) && (
                <div style={{ marginTop: 10 }}>
                  <Image
                    src={previewURL || imageURL}
                    width={120}
                    height={120}
                    style={{ objectFit: 'cover', borderRadius: 8 }}
                  />
                </div>
              )}
            </div>
            )}
            {worldModel && (
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.worldFilesLabel' })}</div>
              <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                {intl.formatMessage({ id: 'playground.threeD.worldFilesHint' })}
              </div>
              <Upload {...worldUploadProps} disabled={!!isInFlight || submitting}>
                <Button icon={<UploadOutlined />} loading={worldUploading} disabled={!!isInFlight || submitting}>
                  {intl.formatMessage({ id: 'playground.threeD.uploadWorldFiles' })}
                </Button>
              </Upload>
              {worldFiles.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {worldFiles.map((f, i) => (
                    <div key={`${f.id ?? f.url}-${i}`} style={{ width: 96 }}>
                      <div style={{ position: 'relative' }}>
                        {f.video ? (
                          <div
                            style={{
                              width: 96,
                              height: 96,
                              borderRadius: 8,
                              background: '#f0f0f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Tag color="purple" style={{ margin: 0 }}>
                              {intl.formatMessage({ id: 'playground.threeD.videoTag' })}
                            </Tag>
                          </div>
                        ) : (
                          <Image
                            src={f.url}
                            width={96}
                            height={96}
                            style={{ objectFit: 'cover', borderRadius: 8 }}
                          />
                        )}
                        <Button
                          size="small"
                          type="text"
                          danger
                          disabled={!!isInFlight || submitting}
                          onClick={() => setWorldFiles((prev) => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,255,255,0.85)' }}
                        >
                          ×
                        </Button>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#999',
                          marginTop: 2,
                          maxWidth: 96,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={f.name}
                      >
                        {f.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
            {acceptModelFile && (
            <div>
              <div style={labelStyle}>
                {intl.formatMessage({ id: 'playground.threeD.inputModelLabel' })}
                {isMotion && (
                  <span style={{ color: '#999', fontWeight: 400 }}>
                    {' '}
                    {intl.formatMessage({ id: 'playground.threeD.optionalSuffix' })}
                  </span>
                )}
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder={intl.formatMessage({ id: 'playground.threeD.inputModelUrlPlaceholder' })}
                  value={inputModelURL}
                  onChange={(e) => {
                    setInputModelURL(e.target.value);
                    setInputModelAssetID(undefined);
                    setInputModelName('');
                    setInputModelType(inferModelType(e.target.value));
                  }}
                  allowClear
                  disabled={!!isInFlight || submitting}
                />
                <Button onClick={clearInputModel} disabled={!!isInFlight || submitting}>
                  {intl.formatMessage({ id: 'playground.threeD.clear' })}
                </Button>
              </Space.Compact>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Upload {...modelUploadProps} disabled={!!isInFlight || submitting}>
                  <Button icon={<UploadOutlined />} loading={uploadingModel} disabled={!!isInFlight || submitting}>
                    {intl.formatMessage({ id: 'playground.threeD.uploadInputModel' })}
                  </Button>
                </Upload>
                {inputModelAssetID && <Tag color="green">asset #{inputModelAssetID}</Tag>}
                {inputModelName && (
                  <code style={{ fontSize: 12, color: '#555', wordBreak: 'break-all' }}>{inputModelName}</code>
                )}
                <Select
                  style={{ width: 110 }}
                  value={inputModelType || undefined}
                  placeholder={intl.formatMessage({ id: 'playground.threeD.modelTypePlaceholder' })}
                  onChange={setInputModelType}
                  options={['FBX', 'OBJ', 'GLB', 'GLTF', 'STL'].map((x) => ({ value: x, label: x }))}
                  disabled={!!isInFlight || submitting}
                  allowClear
                />
              </div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
                {intl.formatMessage({ id: `playground.threeD.modelHint_${advOp}` })}
              </div>
            </div>
            )}
            {showPrompt && (
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.promptLabel' })}</div>
              <TextArea
                placeholder={
                  pro || tripo
                    ? intl.formatMessage({ id: 'playground.threeD.promptPlaceholder1024' })
                    : intl.formatMessage({ id: 'playground.threeD.promptPlaceholderRapid' })
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoSize={{ minRows: 4, maxRows: 8 }}
                disabled={!!isInFlight || submitting || (hasImageInput && !volc3d)}
              />
              {hasImageInput && !volc3d && (
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {intl.formatMessage({ id: 'playground.threeD.imageTo3DHint' })}
                </div>
              )}
            </div>
            )}
            {!isAdv && !worldModel && (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.outputFormat' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={resultFormat}
                  options={formatOptions(modelName)}
                  onChange={setResultFormat}
                  disabled={!!isInFlight || submitting}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.pbrMaterial' })}</div>
                <Checkbox
                  checked={enablePBR}
                  onChange={(e) => setEnablePBR(e.target.checked)}
                  disabled={!!isInFlight || submitting}
                >
                  {intl.formatMessage({ id: 'playground.threeD.enable' })}
                </Checkbox>
              </div>
            </div>
            )}
            {isConvert && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.convertFormat' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={convertFormat}
                  onChange={setConvertFormat}
                  options={CONVERT_FORMATS.map((x) => ({ value: x, label: x }))}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            )}
            {isTexture && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.pbrMaterial' })}</div>
                <Checkbox
                  checked={enablePBR}
                  onChange={(e) => setEnablePBR(e.target.checked)}
                  disabled={!!isInFlight || submitting}
                >
                  {intl.formatMessage({ id: 'playground.threeD.enable' })}
                </Checkbox>
              </div>
            )}
            {pro ? (
              <>
                <div style={{ display: 'flex', gap: 12 }}>
                  {!fixedProVersion(modelName) && (
                    <div style={{ flex: 1 }}>
                      <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.proModelVersion' })}</div>
                      <Select
                        style={{ width: '100%' }}
                        value={modelVersion}
                        onChange={setModelVersion}
                        options={[
                          { value: '3.0', label: '3.0' },
                          { value: '3.1', label: '3.1' },
                        ]}
                        disabled={!!isInFlight || submitting}
                      />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.faceCount' })}</div>
                    <InputNumber
                      min={3000}
                      max={1500000}
                      step={1000}
                      value={faceCount}
                      onChange={(v) => setFaceCount(v ?? undefined)}
                      style={{ width: '100%' }}
                      disabled={!!isInFlight || submitting}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.generateType' })}</div>
                    <Select
                      style={{ width: '100%' }}
                      value={generateType}
                      onChange={setGenerateType}
                      options={[
                        { value: 'Normal', label: 'Normal' },
                        { value: 'LowPoly', label: 'LowPoly' },
                        { value: 'Geometry', label: 'Geometry' },
                        { value: 'Sketch', label: 'Sketch' },
                      ]}
                      disabled={!!isInFlight || submitting}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.polygonType' })}</div>
                    <Select
                      allowClear
                      style={{ width: '100%' }}
                      value={polygonType}
                      onChange={setPolygonType}
                      options={[
                        { value: 'triangle', label: 'triangle' },
                        { value: 'quadrilateral', label: 'quadrilateral' },
                      ]}
                      disabled={!!isInFlight || submitting || generateType !== 'LowPoly'}
                    />
                  </div>
                </div>
              </>
            ) : (!isAdv && !tripo) ? (
              <Checkbox
                checked={enableGeometry}
                onChange={(e) => setEnableGeometry(e.target.checked)}
                disabled={!!isInFlight || submitting}
              >
                {intl.formatMessage({ id: 'playground.threeD.rapidWhiteModel' })}
              </Checkbox>
            ) : null}
            {isProfile && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.template' })}</div>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  value={template}
                  onChange={setTemplate}
                  placeholder={intl.formatMessage({ id: 'playground.threeD.templatePlaceholder' })}
                  options={PROFILE_TEMPLATES.map((x) => ({ value: x, label: x }))}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            )}
            {isTexture && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.textureVersion' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={modelVersion}
                  onChange={setModelVersion}
                  options={[
                    { value: '3.0', label: '3.0' },
                    { value: '3.1', label: '3.1' },
                  ]}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            )}
            {advOp === 'reduceface' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.polygonType' })}</div>
                  <Select
                    allowClear
                    style={{ width: '100%' }}
                    value={reducePolygonType}
                    onChange={setReducePolygonType}
                    options={[
                      { value: 'triangle', label: 'triangle' },
                      { value: 'quadrilateral', label: 'quadrilateral' },
                    ]}
                    disabled={!!isInFlight || submitting}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.faceLevel' })}</div>
                  <Select
                    allowClear
                    style={{ width: '100%' }}
                    value={faceLevel}
                    onChange={setFaceLevel}
                    options={['high', 'medium', 'low'].map((x) => ({ value: x, label: x }))}
                    disabled={!!isInFlight || submitting}
                  />
                </div>
              </div>
            )}
            {isMotion && (
              <>
                <div>
                  <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.duration' })}</div>
                  <InputNumber
                    min={1}
                    max={12}
                    value={duration}
                    onChange={(v) => setDuration(v ?? undefined)}
                    style={{ width: '100%' }}
                    disabled={!!isInFlight || submitting}
                  />
                </div>
                <Space size="large" wrap>
                  <Checkbox checked={enableMesh} onChange={(e) => setEnableMesh(e.target.checked)} disabled={!!isInFlight || submitting}>
                    {intl.formatMessage({ id: 'playground.threeD.enableMesh' })}
                  </Checkbox>
                  <Checkbox checked={enableRewrite} onChange={(e) => setEnableRewrite(e.target.checked)} disabled={!!isInFlight || submitting}>
                    {intl.formatMessage({ id: 'playground.threeD.enableRewrite' })}
                  </Checkbox>
                  <Checkbox checked={enableDurationEst} onChange={(e) => setEnableDurationEst(e.target.checked)} disabled={!!isInFlight || submitting}>
                    {intl.formatMessage({ id: 'playground.threeD.enableDurationEst' })}
                  </Checkbox>
                </Space>
              </>
            )}
            {advOp === 'rigging' && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.threeD.motionType' })}</div>
                <InputNumber
                  min={1}
                  max={48}
                  value={motionType}
                  onChange={(v) => setMotionType(v ?? undefined)}
                  style={{ width: '100%' }}
                  placeholder={intl.formatMessage({ id: 'playground.threeD.motionTypePlaceholder' })}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            )}
            <Button
              type="primary"
              size="large"
              block
              icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
              onClick={submit}
              loading={submitting}
              disabled={
                !modelName ||
                !apiKey ||
                !!isInFlight ||
                (isConvert
                  ? !(hasModelFileInput && !!convertFormat)
                  : isProfile
                    ? !(hasImageInput || !!template)
                    : isMotion
                      ? !prompt.trim()
                      : needModelFile
                        ? !hasModelFileInput
                        : !prompt.trim() && !hasImageInput)
              }
            >
              {submitting
                ? intl.formatMessage({ id: 'playground.threeD.submitting' })
                : isInFlight
                  ? intl.formatMessage({ id: 'playground.threeD.taskInProgress' }, { elapsed: elapsedText })
                  : intl.formatMessage({ id: 'playground.threeD.submitTask' })}
            </Button>
          </Space>
        </Card>

        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={intl.formatMessage({ id: 'playground.threeD.taskProgress' })}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <Button
                    size="small"
                    icon={<ReloadOutlined spin={polling} />}
                    onClick={() => fetchOnce(task.id)}
                  >
                    {intl.formatMessage({ id: 'playground.threeD.refresh' })}
                  </Button>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.threeD.clear' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.threeD.emptyDesc' })}</span>} />
            </div>
          )}
          {errMsg && !task && (
            <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.threeD.submitFailed' })} description={errMsg} />
          )}
          {task && (
            <div>
              <div style={taskMetaStyle}>
                <div>
                  <code style={{ fontSize: 12, color: '#555' }}>{task.id}</code>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{task.model}</div>
                </div>
                <Tag color={statusColor(task.status)} style={{ margin: 0 }}>
                  {statusText(task.status)}
                </Tag>
              </div>
              {errMsg && isInFlight && (
                <Alert
                  type="warning"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.threeD.refreshTempFailed' })}
                  description={errMsg}
                  style={{ marginBottom: 14 }}
                />
              )}
              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} size="large" />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.threeD.queuedHint' })
                      : intl.formatMessage({ id: 'playground.threeD.generatingHint' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage({ id: 'playground.threeD.elapsedPrefix' })} <b>{elapsedText}</b>{' '}
                    {intl.formatMessage({ id: 'playground.threeD.autoRefreshSuffix' })}
                  </div>
                </div>
              )}
              {task.status === 'succeeded' && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    ✓ {intl.formatMessage({ id: 'playground.threeD.generateDone' })}
                    {finalLatency
                      ? ` · ${intl.formatMessage({ id: 'playground.threeD.latency' }, { latency: finalLatency })}`
                      : ''}
                    {task.usage?.usd_cost ? ` · $${task.usage.usd_cost}` : ''}
                  </div>
                  {sceneItem && viewerFailedURL !== sceneItem.url ? (
                    <SceneViewer
                      key={sceneItem.url}
                      url={sceneItem.url}
                      kind={sceneItem.kind}
                      loadingText={intl.formatMessage({ id: 'playground.threeD.sceneLoading' })}
                      onError={() => setViewerFailedURL(sceneItem.url)}
                    />
                  ) : (
                    taskPreviewURL && (
                      <Image
                        src={taskPreviewURL}
                        width="100%"
                        style={{ maxHeight: 320, objectFit: 'contain', borderRadius: 10, background: '#fafafa' }}
                      />
                    )
                  )}
                  {files.length > 0 ? (
                    <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
                      {files.map(({ file, url, index }) => {
                        const fileType = threeDFileType(file, url);
                        const fileName = displayFileName(file, url, `3d-${task.id}-${index + 1}`);
                        const zip = isZipFile(file, url);
                        return (
                          <div key={`${url}-${index}`} style={fileRowStyle}>
                            <div style={{ minWidth: 0 }}>
                              <Tag style={{ marginRight: 8 }}>
                                {fileType}
                              </Tag>
                              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                                {fileName}
                              </code>
                              {zip && (
                                <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
                                  {intl.formatMessage({ id: 'playground.threeD.zipHint' })}
                                </div>
                              )}
                            </div>
                            <a
                              href={url}
                              download={browserDownloadName(url, fileName)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.threeD.download' })}</Button>
                            </a>
                          </div>
                        );
                      })}
                    </Space>
                  ) : resultURL ? (
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <a href={resultURL} download={browserDownloadName(resultURL, `3d-${task.id}`)} target="_blank" rel="noreferrer">
                        <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.threeD.download3dFile' })}</Button>
                      </a>
                    </div>
                  ) : (
                    <Alert type="info" showIcon message={intl.formatMessage({ id: 'playground.threeD.waitingFileUrl' })} />
                  )}
                </div>
              )}
              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.threeD.generateFailed' })}
                  description={
                    task.error?.code
                      ? intl.formatMessage({ id: 'playground.threeD.errorCode' }, { code: task.error.code })
                      : undefined
                  }
                />
              )}
              {errMsg && !isInFlight && (
                <Alert
                  type="error"
                  showIcon
                  closable
                  message={errMsg}
                  onClose={() => setErrMsg(null)}
                  style={{ marginTop: 12 }}
                />
              )}
            </div>
          )}
        </Card>
      </div>

      <div style={hintStyle}>
        {intl.formatMessage({ id: 'playground.threeD.footerHint' })}
      </div>

      <ThreeDHistoryDrawer
        open={historyOpen}
        apiKey={apiKey}
        onClose={() => setHistoryOpen(false)}
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

const taskMetaStyle: React.CSSProperties = {
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
};

const fileRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 8,
  background: '#fafafa',
};

const hintStyle: React.CSSProperties = {
  marginTop: 20,
  padding: '10px 14px',
  background: '#fafbfc',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 8,
  fontSize: 12,
  color: '#666',
};
