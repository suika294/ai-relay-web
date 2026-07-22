import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HistoryOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Spin,
  Tag,
  Upload,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { systemApi } from '@/services/api';
import { t } from '@/utils/i18n';
import {
  browserDownloadName,
  isAuthenticatedGeminiDownloadURL,
  publicMediaURL,
} from '@/utils/media';
import { apiURL } from '@/utils/request';
import MediaHistoryDrawer from './MediaHistoryDrawer';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';
import { playgroundUpload } from './upload';

const { TextArea } = Input;
const LS_LAST_TASK = 'playground_video_last_task_v1';

function extractErrMsg(raw: string, httpStatus: number): string {
  let msg = '';
  try {
    const j = JSON.parse(raw);
    msg = j?.error?.message || j?.message || raw.slice(0, 500);
  } catch {
    msg = raw ? raw.slice(0, 500) : `HTTP ${httpStatus}`;
  }
  return friendlyVideoError(msg);
}

function friendlyVideoError(msg: string): string {
  if (/invalid_image_url|Doubao Seedance requires .*publicly reachable/i.test(msg)) {
    return [
      t('playground.video.errSeedancePublicUrl'),
      t('playground.video.errSeedancePublicUrlHint'),
      t('playground.video.errRawError', { msg }),
    ].join('\n\n');
  }
  if (/ModelNotOpen|has not activated the model/i.test(msg)) {
    return [
      t('playground.video.errModelNotOpen'),
      t('playground.video.errRawError', { msg }),
    ].join('\n\n');
  }
  if (/gemini (veo )?image .*fetch status=404/i.test(msg)) {
    return [
      t('playground.video.errRefUrl404'),
      t('playground.video.errRawError', { msg }),
    ].join('\n\n');
  }
  if (/trying to proxy|econnrefused|econnreset|socket hang up/i.test(msg)) {
    return [
      t('playground.video.errDevProxy'),
      t('playground.video.errRawError', { msg }),
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

function hasPrivateVideoURL(t?: VideoTask | null): boolean {
  return isAuthenticatedGeminiDownloadURL(t?.data?.[0]?.url);
}

function isDoubaoSeedanceModel(model?: string): boolean {
  return /doubao-seedance/i.test(model || '');
}

function isViduModel(model?: string): boolean {
  return /vidu/i.test(model || '');
}

function isPlaceholderHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  return (
    normalized === 'example.com' ||
    normalized === 'example.org' ||
    normalized === 'example.net' ||
    normalized === 'your-domain.com' ||
    normalized.endsWith('.example.com') ||
    normalized.endsWith('.example.org') ||
    normalized.endsWith('.example.net') ||
    normalized.endsWith('.your-domain.com') ||
    normalized.endsWith('.example')
  );
}

function isPublicHTTPImageURL(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
    if (isPlaceholderHost(host)) return false;
    const parts = host.split('.').map((x) => Number(x));
    if (parts.length === 4 && parts.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) {
      const [a, b] = parts;
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
    }
    return true;
  } catch {
    return false;
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
    queued: t('playground.video.statusQueued'),
    running: t('playground.video.statusRunning'),
    succeeded: t('playground.video.statusSucceeded'),
    failed: t('playground.video.statusFailed'),
    canceled: t('playground.video.statusCanceled'),
  };
  return m[s] || s;
}

// VideoRefEntry —— 统一参考列表的一条:Category(Image/Video/Audio)× 来源(真人素材 asset:// / 上传 / URL)
// × Usage(首帧/尾帧/参考)。这是视频生成唯一的参考入口 —— 提交时同时产出 typed 字段(通用,喂所有上游)
// 与顶层 file_infos(完整,喂腾讯云图 VS + 后端翻译层)。
type VideoRefEntry = {
  id: string;
  category: 'Image' | 'Video' | 'Audio';
  usage: 'Reference' | 'FirstFrame' | 'LastFrame';
  source: 'material' | 'url';
  assetId?: string; // source=material 时的 upstream_asset_id(asset-xxx,真人素材)
  url?: string; // source=url 时的公网 URL(上传回填或手填)
  name?: string; // 展示名(上传文件名)
  uploading?: boolean;
};

let videoRefSeq = 0;
const newVideoRefId = () => `ref-${++videoRefSeq}`;

export default function VideoPanel() {
  const intl = useIntl();
  const [models, setModels] = useState<
    { value: string; label: string; supportsReferenceVideo: boolean }[]
  >([]);
  const { apiKey } = usePlaygroundApiKey();
  const [modelName, setModelName] = useState<string>();
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<number | undefined>(5);
  const [resolution, setResolution] = useState<string | undefined>('1080p');
  // 画面比例 / 有声无声:默认 undefined = 不指定(不发,保持各模型默认);只在用户选了才进 body。
  const [aspectRatio, setAspectRatio] = useState<string | undefined>(undefined);
  const [audio, setAudio] = useState<'on' | 'off' | undefined>(undefined);
  // 统一参考列表:N 条参考,每条 Category(图/视频/音频)× 来源(真人素材 asset:// / 上传 / URL)× Usage(首帧/尾帧/参考)。
  // 提交时同时产出 typed 字段(通用)与顶层 file_infos(完整)。prompt 即文本参考 —— 文/图/音/视频四类可两两组合。
  const [materials, setMaterials] = useState<
    { id: number; asset_type: string; upstream_asset_id: string; display_name?: string; is_real_person: boolean }[]
  >([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [refEntries, setRefEntries] = useState<VideoRefEntry[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'video' && m.enabled !== false)
        .map((m) => ({
          value: m.name,
          label: m.display_name ? `${m.display_name}` : m.name,
          // config.supports_reference_video → 只有声明了才把视频参考写进 typed reference_video(否则后端 400)。
          supportsReferenceVideo: !!m.config?.supports_reference_video,
        }));
      setModels(list);
      if (list.length > 0) setModelName((prev) => prev ?? list[0].value);
    });

    const saved = localStorage.getItem(LS_LAST_TASK);
    if (saved) {
      try {
        const t = JSON.parse(saved) as VideoTask;
        setTask(t);
        // (素材列表在独立 effect 里按 apiKey 拉取)
        // 恢复的任务若非终态,继续轮询
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

  // 拉取当前 key 下 ready 的 AIGC 素材,供「引用素材」下拉选(只有有 AssetId 的才能引用)。
  const fetchMaterials = useCallback(async () => {
    if (!apiKey) {
      setMaterials([]);
      return;
    }
    setMaterialsLoading(true);
    try {
      const res = await fetch(apiURL('/v1/aigc/materials'), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      const ready = ((body?.data as any[]) || []).filter(
        (m) => m.status === 'ready' && m.upstream_asset_id,
      );
      setMaterials(ready);
    } catch {
      /* 忽略:素材引用是可选增强 */
    } finally {
      setMaterialsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // ---- AIGC 多参考行操作 ----
  const addRefEntry = () =>
    setRefEntries((p) => [...p, { id: newVideoRefId(), category: 'Image', usage: 'Reference', source: 'material' }]);
  const removeRefEntry = (id: string) => setRefEntries((p) => p.filter((e) => e.id !== id));
  const patchRefEntry = (id: string, patch: Partial<VideoRefEntry>) =>
    setRefEntries((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const uploadRefEntryFile = async (id: string, file: File) => {
    if (!apiKey) {
      message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
      return;
    }
    patchRefEntry(id, { uploading: true });
    try {
      const { url } = await playgroundUpload(file, apiKey, { module: 'video_ref' });
      patchRefEntry(id, { url, uploading: false });
    } catch (e: any) {
      patchRefEntry(id, { uploading: false });
      message.error(e?.message || 'upload failed');
    }
  };
  // 按 MIME/扩展名推断参考类型,批量上传时用。
  const inferRefCategory = (file: File): 'Image' | 'Video' | 'Audio' => {
    const t = (file.type || '').toLowerCase();
    if (t.startsWith('image/')) return 'Image';
    if (t.startsWith('video/')) return 'Video';
    if (t.startsWith('audio/')) return 'Audio';
    const n = file.name.toLowerCase();
    if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(n)) return 'Video';
    if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(n)) return 'Audio';
    return 'Image';
  };
  // 上传一个文件 → 按类型自动建一条参考行。批量上传时 antd beforeUpload 每个文件回调一次,
  // 于是「一次选 3 视频 + 5 音频」→ 8 次调用 → 8 条行,类型自动分好。
  const addUploadedRefFile = async (file: File) => {
    if (!apiKey) {
      message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
      return;
    }
    const id = newVideoRefId();
    const category = inferRefCategory(file);
    setRefEntries((p) => [...p, { id, category, usage: 'Reference', source: 'url', uploading: true }]);
    try {
      const { url } = await playgroundUpload(file, apiKey, { module: 'video_ref' });
      patchRefEntry(id, { url, uploading: false });
    } catch (e: any) {
      patchRefEntry(id, { uploading: false });
      message.error(e?.message || 'upload failed');
    }
  };

  // 当前模型是否声明支持视频生视频(supports_reference_video)。用于:只有支持时才把视频参考写进
  // typed reference_video —— 否则后端能力门槛会 400;不支持的模型视频参考只进 file_infos(路由到
  // 腾讯云图 VS 时消费,路由到其它上游时后端诚实丢弃)。
  const supportsRefVideo = !!models.find((m) => m.value === modelName)?.supportsReferenceVideo;

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
      const res = await fetch(apiURL(`/v1/videos/generations/${id}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const msg = extractErrMsg(text, res.status);
        if (auto && isTransientPollError(res.status, msg)) {
          setErrMsg(intl.formatMessage({ id: 'playground.video.autoRefreshRetry' }, { msg }));
          schedulePoll(id);
          return;
        }
        setErrMsg(msg);
        return;
      }
      const t = JSON.parse(text) as VideoTask;
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
        setErrMsg(intl.formatMessage({ id: 'playground.video.autoRefreshRetry' }, { msg }));
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  useEffect(() => {
    if (!task || !apiKey || !hasPrivateVideoURL(task)) return;
    setErrMsg(intl.formatMessage({ id: 'playground.video.refetchingTransferredUrl' }));
    fetchOnce(task.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.data?.[0]?.url, apiKey]);

  const submit = async () => {
    if (!prompt.trim()) return message.warning(intl.formatMessage({ id: 'playground.video.warnInputPrompt' }));
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.video.warnSelectModel' }));
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = { model: modelName, prompt: prompt.trim() };
      // 统一参考列表 → 同时产出两份:
      //   1) typed 字段(first_frame_image / last_frame_image / images[] / reference_video):所有上游通用,
      //      后端各 provider 都消费;但只收「公网 URL(非 asset://)」的条目 —— asset:// 只有腾讯云图认,
      //      放进 typed 会喂坏火山/Vidu/Kling。视频参考只在模型声明 supports_reference_video 时才进 typed,
      //      否则会被后端能力门槛 400。
      //   2) 顶层 file_infos(全量,含 asset:// 真人素材、音频、多视频):喂腾讯云图 VS override + 后端翻译层。
      //      后端把 file_infos 按目标上游翻译成它认得的字段(见 video_reference_distribute.go)。
      const entryURL = (e: VideoRefEntry) =>
        e.source === 'material' ? (e.assetId ? `asset://${e.assetId}` : '') : (e.url || '').trim();

      // ---- typed:只用公网 URL 条目 ----
      const publicEntries = refEntries
        .map((e) => ({ e, u: entryURL(e) }))
        .filter(({ u }) => u && !u.toLowerCase().startsWith('asset://'));
      const firstImg = publicEntries.find(({ e }) => e.category === 'Image' && e.usage === 'FirstFrame');
      const lastImg = publicEntries.find(({ e }) => e.category === 'Image' && e.usage === 'LastFrame');
      const refImgs = publicEntries.filter(({ e }) => e.category === 'Image' && e.usage === 'Reference');
      const firstVid = publicEntries.find(({ e }) => e.category === 'Video');
      if (firstImg) body.first_frame_image = firstImg.u;
      if (lastImg) body.last_frame_image = lastImg.u;
      if (refImgs.length > 0) body.images = refImgs.map(({ u }) => u);
      // 视频:仅当模型声明支持时才进 typed(否则只靠下方 file_infos → 腾讯云图 VS 消费 / 其它上游后端丢弃)。
      if (firstVid && supportsRefVideo) body.reference_video = firstVid.u;

      // ---- file_infos:全量(含 asset:// / 音频 / 多视频)----
      const fileInfos = refEntries
        .map((e) => {
          const url = entryURL(e);
          return url ? { Type: 'Url', Category: e.category, Url: url, Usage: e.usage } : null;
        })
        .filter(Boolean);
      if (fileInfos.length > 0) body.file_infos = fileInfos;

      if (duration) body.duration = duration;
      if (resolution) body.resolution = resolution;
      if (aspectRatio) body.aspect_ratio = aspectRatio;
      if (audio === 'on') body.audio = true;
      else if (audio === 'off') body.audio = false;

      const res = await fetch(apiURL('/v1/videos/generations'), {
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
      const t = JSON.parse(text) as VideoTask;
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

  const cancel = async () => {
    if (!task || !apiKey) return;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    try {
      const res = await fetch(apiURL(`/v1/videos/generations/${task.id}/cancel`), {
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
  const videoURL = publicMediaURL(task?.data?.[0]?.url);

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 提示词 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <VideoCameraOutlined /> {intl.formatMessage({ id: 'playground.video.title' })}
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
                {intl.formatMessage({ id: 'playground.video.history' })}
              </Button>
              <span style={{ color: '#888', fontSize: 12 }}>
                POST /v1/videos/generations
              </span>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.video.modelLabel' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.video.modelPlaceholder' })}
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
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.video.durationLabel' })}</div>
                <InputNumber
                  min={1}
                  max={60}
                  value={duration}
                  onChange={(v) => setDuration(v ?? undefined)}
                  addonAfter={intl.formatMessage({ id: 'playground.video.durationUnit' })}
                  style={{ width: '100%' }}
                  disabled={!!isInFlight || submitting}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.video.resolutionLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder={intl.formatMessage({ id: 'playground.video.resolutionLabel' })}
                  value={resolution}
                  onChange={setResolution}
                  options={[
                    { value: '480p', label: '480p' },
                    { value: '720p', label: '720p' },
                    { value: '1080p', label: '1080p' },
                    { value: '2k', label: '2K' },
                    { value: '4k', label: '4K' },
                  ]}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.video.aspectRatioLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder={intl.formatMessage({ id: 'playground.video.unset' })}
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  options={['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map((r) => ({ value: r, label: r }))}
                  disabled={!!isInFlight || submitting}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>
                  {intl.formatMessage({ id: 'playground.video.audioLabel' })}
                  <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>
                    {intl.formatMessage({ id: 'playground.video.audioHint' })}
                  </span>
                </div>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder={intl.formatMessage({ id: 'playground.video.unset' })}
                  value={audio}
                  onChange={(v) => setAudio(v as 'on' | 'off' | undefined)}
                  options={[
                    { value: 'on', label: intl.formatMessage({ id: 'playground.video.audioOn' }) },
                    { value: 'off', label: intl.formatMessage({ id: 'playground.video.audioOff' }) },
                  ]}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            </div>
            {/* 统一参考列表:视频生成唯一的参考入口。图/视频/音频任意多条 × 上传/URL/真人素材 × Usage(首帧/尾帧/参考)。
                提交时同时产出 typed 字段(通用)与 file_infos(完整),后端按目标上游翻译分派。 */}
            <div>
              <div style={labelStyle}>
                {intl.formatMessage({ id: 'playground.video.refCombineLabel' })}
                <Button
                  type="link"
                  size="small"
                  icon={<ReloadOutlined spin={materialsLoading} />}
                  onClick={fetchMaterials}
                  style={{ paddingInline: 4 }}
                >
                  {intl.formatMessage({ id: 'playground.video.materialRefresh' })}
                </Button>
              </div>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
                {intl.formatMessage({ id: 'playground.video.refCombineHint' })}
              </div>
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                {refEntries.map((e) => (
                  <Space.Compact key={e.id} style={{ width: '100%' }}>
                    <Select
                      value={e.category}
                      style={{ width: 92 }}
                      disabled={!!isInFlight || submitting}
                      onChange={(v) => patchRefEntry(e.id, { category: v })}
                      options={[
                        { value: 'Image', label: 'Image' },
                        { value: 'Video', label: 'Video' },
                        { value: 'Audio', label: 'Audio' },
                      ]}
                    />
                    <Select
                      value={e.source}
                      style={{ width: 104 }}
                      disabled={!!isInFlight || submitting}
                      onChange={(v) => patchRefEntry(e.id, { source: v })}
                      options={[
                        { value: 'material', label: intl.formatMessage({ id: 'playground.video.refSourceMaterial' }) },
                        { value: 'url', label: intl.formatMessage({ id: 'playground.video.refSourceUrl' }) },
                      ]}
                    />
                    {e.source === 'material' ? (
                      <Select
                        style={{ flex: 1 }}
                        allowClear
                        disabled={!!isInFlight || submitting}
                        placeholder={intl.formatMessage({ id: 'playground.video.refPickMaterial' })}
                        value={e.assetId}
                        onChange={(v) => patchRefEntry(e.id, { assetId: v })}
                        options={materials
                          .filter((m) => m.asset_type === e.category)
                          .map((m) => ({
                            value: m.upstream_asset_id,
                            label: `${m.is_real_person ? '👤 ' : ''}${m.display_name || m.upstream_asset_id}`,
                          }))}
                      />
                    ) : (
                      <>
                        <Input
                          style={{ flex: 1 }}
                          disabled={!!isInFlight || submitting}
                          placeholder={intl.formatMessage({ id: 'playground.video.refUrlPh' })}
                          value={e.url}
                          onChange={(ev) => patchRefEntry(e.id, { url: ev.target.value })}
                        />
                        <Upload
                          showUploadList={false}
                          beforeUpload={(f) => {
                            uploadRefEntryFile(e.id, f);
                            return false;
                          }}
                        >
                          <Button icon={<UploadOutlined />} loading={e.uploading} disabled={!!isInFlight || submitting} />
                        </Upload>
                      </>
                    )}
                    <Select
                      value={e.usage}
                      style={{ width: 108 }}
                      disabled={!!isInFlight || submitting}
                      onChange={(v) => patchRefEntry(e.id, { usage: v })}
                      options={[
                        { value: 'Reference', label: intl.formatMessage({ id: 'playground.video.refUsageReference' }) },
                        { value: 'FirstFrame', label: intl.formatMessage({ id: 'playground.video.refUsageFirstFrame' }) },
                        { value: 'LastFrame', label: intl.formatMessage({ id: 'playground.video.refUsageLastFrame' }) },
                      ]}
                    />
                    <Button icon={<DeleteOutlined />} onClick={() => removeRefEntry(e.id)} disabled={!!isInFlight || submitting} />
                  </Space.Compact>
                ))}
                <Space wrap>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={addRefEntry} disabled={!!isInFlight || submitting}>
                    {intl.formatMessage({ id: 'playground.video.refAddBtn' })}
                  </Button>
                  <Upload
                    multiple
                    showUploadList={false}
                    beforeUpload={(file) => {
                      addUploadedRefFile(file as File);
                      return false;
                    }}
                  >
                    <Button icon={<UploadOutlined />} disabled={!!isInFlight || submitting}>
                      {intl.formatMessage({ id: 'playground.video.refBatchUpload' })}
                    </Button>
                  </Upload>
                </Space>
              </Space>
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.video.promptLabel' })}</div>
              <TextArea
                placeholder={intl.formatMessage({ id: 'playground.video.promptPlaceholder' })}
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
                ? intl.formatMessage({ id: 'playground.video.submitting' })
                : isInFlight
                ? intl.formatMessage({ id: 'playground.video.taskInProgress' }, { elapsed: elapsedText })
                : intl.formatMessage({ id: 'playground.video.submitBtn' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.video.taskProgress' })}</span>}
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
                      {intl.formatMessage({ id: 'playground.video.refreshBtn' })}
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
                    {intl.formatMessage({ id: 'playground.video.clearBtn' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty
                image={<VideoCameraOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={
                  <span style={{ color: '#999' }}>
                    {intl.formatMessage({ id: 'playground.video.emptyHint' })}
                  </span>
                }
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert
              type="error"
              showIcon
              message={intl.formatMessage({ id: 'playground.video.submitFailed' })}
              description={errMsg}
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
                  message={intl.formatMessage({ id: 'playground.video.refreshTempFailed' })}
                  description={errMsg}
                  style={{ marginBottom: 14 }}
                />
              )}

              {/* 进行中:大号 Spin + 实时计时 + 提示 */}
              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin
                    indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />}
                    size="large"
                  />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.video.statusQueuedHint' })
                      : intl.formatMessage({ id: 'playground.video.statusRunningHint' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage(
                      { id: 'playground.video.elapsedAutoRefresh' },
                      { elapsed: <b key="e">{elapsedText}</b> },
                    )}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.video.modelTimeHint' })}
                  </div>
                </div>
              )}

              {/* 成功:视频播放器 + 下载 */}
              {task.status === 'succeeded' && videoURL && (
                (() => {
                  return (
                    <div>
                      <div
                        style={{
                          color: '#52c41a',
                          fontSize: 13,
                          marginBottom: 10,
                        }}
                      >
                        ✓ {intl.formatMessage({ id: 'playground.video.generated' })}
                        {finalLatency
                          ? intl.formatMessage(
                              { id: 'playground.video.generatedLatency' },
                              { latency: finalLatency },
                            )
                          : ''}
                      </div>
                      <video
                        key={videoURL}
                        src={videoURL}
                        controls
                        autoPlay
                        style={{
                          width: '100%',
                          borderRadius: 10,
                          background: '#000',
                        }}
                      />
                      <div style={{ marginTop: 10, textAlign: 'right' }}>
                        <a
                          href={videoURL}
                          download={browserDownloadName(
                            videoURL,
                            `video-${task.id}.mp4`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.video.downloadBtn' })}</Button>
                        </a>
                      </div>
                    </div>
                  );
                })()
              )}

              {task.status === 'succeeded' && !videoURL && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.video.waitingBackendUrl' })}
                  description={intl.formatMessage({ id: 'playground.video.waitingBackendUrlDesc' })}
                />
              )}

              {/* 失败:错误详情 */}
              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.video.generateFailed' })}
                  description={
                    task.error?.code
                      ? intl.formatMessage({ id: 'playground.video.errorCode' }, { code: task.error.code })
                      : undefined
                  }
                />
              )}

              {/* 取消态:简单提示 */}
              {task.status === 'canceled' && (
                <Alert
                  type="warning"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.video.taskCanceled' })}
                />
              )}

              {/* 非进行中时保留手动刷新/取消等错误提示 */}
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
          { id: 'playground.video.footerHint' },
          { taskId: <code key="t">task_id</code> },
        )}
      </div>

      <MediaHistoryDrawer
        kind="video"
        open={historyOpen}
        apiKey={apiKey}
        onClose={() => setHistoryOpen(false)}
        onReuse={(t) => {
          // 把历史任务的提示词填回来,不自动改模型/参数,避免覆盖用户的当前设置
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

