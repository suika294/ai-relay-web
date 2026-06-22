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
import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { assetApi, systemApi, tokenApi } from '@/services/api';
import { t } from '@/utils/i18n';
import {
  browserDownloadName,
  isAuthenticatedGeminiDownloadURL,
  publicMediaURL,
} from '@/utils/media';
import { apiURL } from '@/utils/request';
import MediaHistoryDrawer from './MediaHistoryDrawer';

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

type VideoImageRole = 'first_frame' | 'last_frame' | 'reference';

type ReferenceImage = {
  uid: string;
  url: string;
  name: string;
  assetId?: number;
  source: 'upload' | 'url';
  // role:首帧 / 尾帧 / 参考图。提交时按 role 分桶到 first_frame_image /
  // last_frame_image / images 三类字段。
  role: VideoImageRole;
};

const VIDEO_ROLE_OPTIONS: { value: VideoImageRole; label: string }[] = [
  { value: 'first_frame', label: t('playground.video.roleFirstFrame') },
  { value: 'last_frame', label: t('playground.video.roleLastFrame') },
  { value: 'reference', label: t('playground.video.roleReference') },
];

const VIDEO_ROLE_BADGE: Record<VideoImageRole, { text: string; bg: string }> = {
  first_frame: { text: t('playground.video.roleFirstFrame'), bg: 'rgba(22,119,255,0.92)' },
  last_frame: { text: t('playground.video.roleLastFrame'), bg: 'rgba(82,196,26,0.92)' },
  reference: { text: t('playground.video.roleReference'), bg: 'rgba(250,140,22,0.92)' },
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

export default function VideoPanel() {
  const intl = useIntl();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [modelName, setModelName] = useState<string>();
  const [tokenId, setTokenId] = useState<number>();
  const [prompt, setPrompt] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [duration, setDuration] = useState<number | undefined>(5);
  const [resolution, setResolution] = useState<string | undefined>('1080p');

  const [submitting, setSubmitting] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
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
        }));
      setModels(list);
      if (list.length > 0) setModelName((prev) => prev ?? list[0].value);
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

  const selectedToken = tokens.find((t) => t.id === tokenId);
  const tokenAllowsModel =
    !selectedToken?.allowed_models?.length ||
    selectedToken.allowed_models.includes(modelName || '');
  const isSeedanceModel = isDoubaoSeedanceModel(modelName);
  const requiresPublicReferenceURL = isSeedanceModel || isViduModel(modelName);

  // defaultRoleForNew 决定新添加的参考图初始 role:第一张当首帧,第二张当尾帧,
  // 第三张起按"参考",更贴近用户最常见的"首帧/首尾帧/多参考"流程。'auto' 给那些
  // 显式不想标的(legacy 行为)。
  const defaultRoleForNew = (existing: ReferenceImage[]): VideoImageRole => {
    if (!existing.some((x) => x.role === 'first_frame')) return 'first_frame';
    if (!existing.some((x) => x.role === 'last_frame')) return 'last_frame';
    return 'reference';
  };

  const addReferenceURL = () => {
    const url = imageURL.trim();
    if (!url) return message.warning(intl.formatMessage({ id: 'playground.video.warnInputRefUrl' }));
    if (requiresPublicReferenceURL && !isPublicHTTPImageURL(url)) {
      return message.warning(intl.formatMessage({ id: 'playground.video.warnPublicRefUrl' }));
    }
    setReferenceImages((prev) => {
      if (prev.some((x) => x.url === url)) return prev;
      return [
        ...prev,
        {
          uid: `url-${Date.now()}`,
          url,
          name: intl.formatMessage({ id: 'playground.video.externalUrlName' }),
          source: 'url',
          role: defaultRoleForNew(prev),
        },
      ];
    });
    setImageURL('');
  };

  const removeReferenceImage = (uid: string) => {
    setReferenceImages((prev) => prev.filter((x) => x.uid !== uid));
  };

  // 同一时刻最多 1 张首帧 / 1 张尾帧;切换 role 时把冲突的图退回 reference。
  const setReferenceRole = (uid: string, next: VideoImageRole) => {
    setReferenceImages((prev) => {
      const out = prev.map((x) => ({ ...x }));
      const target = out.find((x) => x.uid === uid);
      if (!target) return prev;
      if (next === 'first_frame' || next === 'last_frame') {
        for (const x of out) {
          if (x.uid !== uid && x.role === next) x.role = 'reference';
        }
      }
      target.role = next;
      return out;
    });
  };

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.video.warnUploadImageOnly' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploadingRef(true);
      try {
        const f = file as File;
        const uploaded = await assetApi.upload(f, {
          module: 'i2v_input',
          purpose: 'i2v_reference',
        });
        if (uploaded.code !== 0 || !uploaded.data) {
          throw new Error(uploaded.message || intl.formatMessage({ id: 'playground.video.uploadFailed' }));
        }

        let url = uploaded.data.public_url;
        if (!url) {
          const detail = await assetApi.detail(uploaded.data.id);
          if (detail.code !== 0 || !detail.data?.url) {
            throw new Error(detail.message || intl.formatMessage({ id: 'playground.video.fetchAssetUrlFailed' }));
          }
          url = detail.data.url;
        }
        if (requiresPublicReferenceURL && !isPublicHTTPImageURL(url)) {
          message.warning(intl.formatMessage({ id: 'playground.video.warnUploadNeedPublic' }));
          onSuccess?.(uploaded as any);
          return;
        }

        const assetID = uploaded.data.id;
        const assetFilename = uploaded.data.filename;
        setReferenceImages((prev) => {
          if (prev.some((x) => x.url === url)) return prev;
          const item: ReferenceImage = {
            uid: `asset-${assetID}-${Date.now()}`,
            assetId: assetID,
            url,
            name: f.name || assetFilename || intl.formatMessage({ id: 'playground.video.refImageName' }),
            source: 'upload',
            role: defaultRoleForNew(prev),
          };
          return [...prev, item];
        });
        message.success(intl.formatMessage({ id: 'playground.video.refImageAdded' }));
        onSuccess?.(uploaded as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.video.uploadFailed' }));
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
    if (!task || !selectedToken || !hasPrivateVideoURL(task)) return;
    setErrMsg(intl.formatMessage({ id: 'playground.video.refetchingTransferredUrl' }));
    fetchOnce(task.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.data?.[0]?.url, selectedToken?.id]);

  const submit = async () => {
    if (!prompt.trim()) return message.warning(intl.formatMessage({ id: 'playground.video.warnInputPrompt' }));
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.video.warnSelectModel' }));
    if (!selectedToken) return message.warning(intl.formatMessage({ id: 'playground.video.warnCreateKey' }));
    if (!tokenAllowsModel)
      return message.warning(intl.formatMessage({ id: 'playground.video.warnKeyModelLimit' }, { model: modelName }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = { model: modelName, prompt: prompt.trim() };
      // 合并:referenceImages 已经带 role,再加上手动输入框里那条孤立 URL(默认走 auto)。
      type Bucket = { url: string; assetId: number; role: VideoImageRole };
      const buckets: Bucket[] = referenceImages.map((x) => ({
        url: x.url,
        assetId: x.assetId || 0,
        role: x.role,
      }));
      const manual = imageURL.trim();
      if (manual && !buckets.some((x) => x.url === manual)) {
        buckets.push({ url: manual, assetId: 0, role: defaultRoleForNew(referenceImages) });
      }
      if (requiresPublicReferenceURL) {
        const invalid = buckets.find((b) => !isPublicHTTPImageURL(b.url));
        if (invalid) {
          message.warning(intl.formatMessage({ id: 'playground.video.warnPublicRefUrl' }));
          return;
        }
      }
      const first = buckets.find((b) => b.role === 'first_frame');
      const last = buckets.find((b) => b.role === 'last_frame');
      const references = buckets.filter((b) => b.role === 'reference');
      if (first) {
        body.first_frame_image = first.url;
        if (first.assetId > 0 && !requiresPublicReferenceURL) body.first_frame_asset_id = first.assetId;
      }
      if (last) {
        body.last_frame_image = last.url;
        if (last.assetId > 0 && !requiresPublicReferenceURL) body.last_frame_asset_id = last.assetId;
      }
      if (references.length > 0) {
        body.images = references.map((b) => b.url);
        if (!requiresPublicReferenceURL && references.some((b) => b.assetId > 0)) {
          body.image_asset_ids = references.map((b) => b.assetId);
        }
      }
      if (duration) body.duration = duration;
      if (resolution) body.resolution = resolution;

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
    if (!task || !selectedToken) return;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    try {
      const res = await fetch(apiURL(`/v1/videos/generations/${task.id}/cancel`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${selectedToken.key}` },
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
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.video.apiKeyLabel' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.video.apiKeyPlaceholder' })}
                options={tokens.map((t) => ({
                  value: t.id,
                  label: `${t.name} (${t.key_prefix}***)`,
                }))}
                value={tokenId}
                onChange={setTokenId}
                disabled={!!isInFlight || submitting}
              />
              {selectedToken && !tokenAllowsModel && (
                <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>
                  {intl.formatMessage({ id: 'playground.video.warnKeyModelLimit' }, { model: modelName })}
                </div>
              )}
            </div>
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
                  ]}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.video.refImageLabel' })}</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder={requiresPublicReferenceURL ? intl.formatMessage({ id: 'playground.video.refUrlPlaceholderPublic' }) : intl.formatMessage({ id: 'playground.video.refUrlPlaceholder' })}
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
                  {intl.formatMessage({ id: 'playground.video.addBtn' })}
                </Button>
              </Space.Compact>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Upload {...uploadProps} disabled={!!isInFlight || submitting}>
                  <Button
                    icon={<UploadOutlined />}
                    loading={uploadingRef}
                    disabled={!!isInFlight || submitting}
                  >
                    {intl.formatMessage({ id: 'playground.video.uploadRefBtn' })}
                  </Button>
                </Upload>
                {referenceImages.length > 0 && (
                  <Tag color="blue" style={{ margin: 0 }}>
                    {intl.formatMessage({ id: 'playground.video.imageCount' }, { count: referenceImages.length })}
                  </Tag>
                )}
              </div>
              {referenceImages.length > 0 && (
                <div style={referenceGridStyle}>
                  {referenceImages.map((item) => {
                    const badge = VIDEO_ROLE_BADGE[item.role];
                    return (
                      <div key={item.uid} style={referenceTileStyle}>
                        <Image
                          src={item.url}
                          alt={item.name}
                          width={96}
                          height={96}
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
                        {badge && (
                          <span style={{ ...referenceBadgeStyle, background: badge.bg }}>
                            {badge.text}
                          </span>
                        )}
                        <Select
                          size="small"
                          value={item.role}
                          onChange={(v) => setReferenceRole(item.uid, v as VideoImageRole)}
                          options={VIDEO_ROLE_OPTIONS}
                          disabled={!!isInFlight || submitting}
                          style={referenceRoleSelectStyle}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
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
              disabled={!prompt.trim() || !modelName || !selectedToken || !!isInFlight}
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

const referenceGridStyle: React.CSSProperties = {
  marginTop: 10,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, 96px)',
  gap: 10,
};

const referenceTileStyle: React.CSSProperties = {
  position: 'relative',
  width: 96,
  // 图 96 + select 28(含间距)
  height: 124,
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
  top: 76,
  padding: '1px 5px',
  borderRadius: 4,
  color: '#fff',
  fontSize: 11,
  lineHeight: '16px',
};

const referenceRoleSelectStyle: React.CSSProperties = {
  position: 'absolute',
  left: 4,
  right: 4,
  bottom: 4,
  width: 'calc(100% - 8px)',
};
