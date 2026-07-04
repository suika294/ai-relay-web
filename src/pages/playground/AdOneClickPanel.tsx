import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SendOutlined,
  ShoppingOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Image,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Spin,
  Switch,
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
import { playgroundUpload } from './upload';

const LS_LAST_TASK = 'playground_ad_one_click_last_task_v1';

// 走 /ent/v2/ad-one-click 的专用虚拟模型(后端 090 迁移种子)。该端点不收 model,
// 这个模型仅作路由/计费句柄。
const AD_MODEL = 'vidu-ad-one-click';

const { TextArea } = Input;

const MAX_IMAGES = 7;
const MIN_DURATION = 8;
const MAX_DURATION = 60;

function extractErrMsg(raw: string, httpStatus: number): string {
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.message || raw.slice(0, 500);
  } catch {
    return raw ? raw.slice(0, 500) : `HTTP ${httpStatus}`;
  }
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

type AdImage = { uid: string; url: string; name: string; assetId?: number };

// 子任务树(GET /v1/videos/ad-one-click/:id/subtasks 的上游原样透传)。
type SubRecord = {
  id: string;
  type?: string;
  prompt?: string;
  state?: string;
  err_code?: string;
  creation_url?: string;
};
type Storyboard = { stroyboard_id?: number; storyboard_id?: number; records?: SubRecord[] };
type SubtaskTree = {
  id?: string;
  state?: string;
  data_records?: {
    storyboards?: Storyboard[];
    narration_records?: SubRecord[];
    bgm_records?: SubRecord[];
    completed_creation_records?: any[];
  };
};

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
    queued: t('playground.adOneClick.statusQueued'),
    running: t('playground.adOneClick.statusRunning'),
    succeeded: t('playground.adOneClick.statusSucceeded'),
    failed: t('playground.adOneClick.statusFailed'),
    canceled: t('playground.adOneClick.statusCanceled'),
  };
  return m[s] || s;
}

export default function AdOneClickPanel() {
  const intl = useIntl();
  const [hasModel, setHasModel] = useState<boolean>(true);
  const { apiKey } = usePlaygroundApiKey();
  const [images, setImages] = useState<AdImage[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [duration, setDuration] = useState<number>(15);
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [language, setLanguage] = useState<string>('zh');
  const [creative, setCreative] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 后期编辑:原始成片 id(edit/compose/subtasks 都基于它)+ 子任务树 + 编辑/合成产生的子任务。
  const [mainTaskId, setMainTaskId] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<SubtaskTree | null>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [editType, setEditType] = useState<string>('generate_video');
  const [editIndex, setEditIndex] = useState<number>(0);
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [child, setChild] = useState<VideoTask | null>(null);
  const [posting, setPosting] = useState(false);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const childPollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = (res.data as any[]) || [];
      setHasModel(list.some((m) => m.name === AD_MODEL && m.enabled !== false));
    });

    const saved = localStorage.getItem(LS_LAST_TASK);
    if (saved) {
      try {
        const t = JSON.parse(saved) as VideoTask;
        setTask(t);
        setMainTaskId(t.id);
        if (t.status === 'queued' || t.status === 'running') {
          startTimer(t.created_at);
          schedulePoll(t.id, 3000);
        }
      } catch {}
    }
    return () => {
      if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
      if (pollRef.current) window.clearTimeout(pollRef.current);
      if (childPollRef.current) window.clearTimeout(childPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (task) localStorage.setItem(LS_LAST_TASK, JSON.stringify(task));
  }, [task]);

  const removeImage = (uid: string) => setImages((prev) => prev.filter((x) => x.uid !== uid));

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.adOneClick.uploadImageOnly' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      if (images.length >= MAX_IMAGES) {
        message.warning(intl.formatMessage({ id: 'playground.adOneClick.maxImages' }, { max: MAX_IMAGES }));
        onSuccess?.({} as any);
        return;
      }
      setUploading(true);
      try {
        const f = file as File;
        const { url, id } = await playgroundUpload(f, apiKey, { module: 'i2v_input', purpose: 'i2v_reference' });
        const assetID = id;
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES || prev.some((x) => x.url === url)) return prev;
          return [
            ...prev,
            { uid: `asset-${assetID}-${Date.now()}`, assetId: assetID, url: url, name: f.name || intl.formatMessage({ id: 'playground.adOneClick.imageDefaultName' }) },
          ];
        });
        message.success(intl.formatMessage({ id: 'playground.adOneClick.imageAdded' }));
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.adOneClick.uploadFailed' }));
        onError?.(e);
      } finally {
        setUploading(false);
      }
    },
  };

  const startTimer = (createdAtSec?: number) => {
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    const baseAt = createdAtSec ? createdAtSec * 1000 : Date.now();
    setElapsedMs(Date.now() - baseAt);
    elapsedTimerRef.current = window.setInterval(() => setElapsedMs(Date.now() - baseAt), 500);
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
          setErrMsg(intl.formatMessage({ id: 'playground.adOneClick.autoRefreshFailed' }, { msg }));
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
        setErrMsg(intl.formatMessage({ id: 'playground.adOneClick.autoRefreshFailed' }, { msg }));
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  // 轮询编辑/合成产生的子任务(独立于主成片)。
  const fetchChild = async (id: string) => {
    if (!apiKey) return;
    try {
      const res = await fetch(apiURL(`/v1/videos/generations/${id}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        if (childPollRef.current) window.clearTimeout(childPollRef.current);
        childPollRef.current = window.setTimeout(() => fetchChild(id), 5000);
        return;
      }
      const t = JSON.parse(text) as VideoTask;
      setChild(t);
      if (t.status === 'queued' || t.status === 'running') {
        if (childPollRef.current) window.clearTimeout(childPollRef.current);
        childPollRef.current = window.setTimeout(() => fetchChild(id), 5000);
      }
    } catch {
      if (childPollRef.current) window.clearTimeout(childPollRef.current);
      childPollRef.current = window.setTimeout(() => fetchChild(id), 5000);
    }
  };

  const submit = async () => {
    if (!hasModel) return message.warning(intl.formatMessage({ id: 'playground.adOneClick.modelNotFoundWarn' }, { model: AD_MODEL }));
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
    if (images.length === 0) return message.warning(intl.formatMessage({ id: 'playground.adOneClick.uploadAtLeastOne' }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    setMainTaskId(null);
    setSubtasks(null);
    setChild(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = {
        model: AD_MODEL,
        images: images.map((x) => x.url),
        duration,
        aspect_ratio: aspectRatio,
        language,
      };
      if (prompt.trim()) body.prompt = prompt.trim();
      if (creative) body.creative = true;

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
      setMainTaskId(t.id);
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
    if (childPollRef.current) window.clearTimeout(childPollRef.current);
    setTask(null);
    setMainTaskId(null);
    setSubtasks(null);
    setChild(null);
    setErrMsg(null);
    setElapsedMs(0);
    localStorage.removeItem(LS_LAST_TASK);
  };

  const loadSubtasks = async () => {
    if (!mainTaskId || !apiKey) return;
    setLoadingSubs(true);
    try {
      const res = await fetch(apiURL(`/v1/videos/ad-one-click/${mainTaskId}/subtasks`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        message.error(extractErrMsg(text, res.status));
        return;
      }
      setSubtasks(JSON.parse(text) as SubtaskTree);
    } catch (e: any) {
      message.error(String(e?.message || e));
    } finally {
      setLoadingSubs(false);
    }
  };

  const submitEdit = async () => {
    if (!mainTaskId || !apiKey) return;
    if (!editPrompt.trim()) return message.warning(intl.formatMessage({ id: 'playground.adOneClick.editPromptRequired' }));
    setPosting(true);
    try {
      const body: any = { type: editType, prompt: editPrompt.trim() };
      if (editType === 'generate_video') body.storyboard_video_index = editIndex;
      const res = await fetch(apiURL(`/v1/videos/ad-one-click/${mainTaskId}/edit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        message.error(extractErrMsg(text, res.status));
        return;
      }
      const t = JSON.parse(text) as VideoTask;
      setChild(t);
      message.success(intl.formatMessage({ id: 'playground.adOneClick.editSubmitted' }));
      if (t.status === 'queued' || t.status === 'running') fetchChild(t.id);
    } catch (e: any) {
      message.error(String(e?.message || e));
    } finally {
      setPosting(false);
    }
  };

  const isInFlight = task && (task.status === 'queued' || task.status === 'running');
  const elapsedText = (elapsedMs / 1000).toFixed(1) + 's';
  const finalLatency =
    task?.completed_at && task?.created_at ? `${task.completed_at - task.created_at}s` : undefined;
  const videoURL = publicMediaURL(task?.data?.[0]?.url);
  const childURL = publicMediaURL(child?.data?.[0]?.url);
  const locked = !!isInFlight || submitting;
  const succeeded = task?.status === 'succeeded';

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 商品图 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <ShoppingOutlined /> {intl.formatMessage({ id: 'playground.adOneClick.title' })}
            </span>
          }
          extra={<span style={{ color: '#888', fontSize: 12 }}>POST /v1/videos/generations</span>}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {!hasModel && (
              <Alert
                type="warning"
                showIcon
                message={intl.formatMessage({ id: 'playground.adOneClick.modelNotFound' }, { model: AD_MODEL })}
                description={intl.formatMessage({ id: 'playground.adOneClick.modelNotFoundDesc' })}
              />
            )}
            <ApiKeyField />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.adOneClick.durationLabel' })}</div>
                <InputNumber
                  style={{ width: '100%' }}
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  value={duration}
                  onChange={(v) => setDuration(v ?? 15)}
                  disabled={locked}
                />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.adOneClick.aspectRatioLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  options={[
                    { value: '16:9', label: intl.formatMessage({ id: 'playground.adOneClick.aspect169' }) },
                    { value: '9:16', label: intl.formatMessage({ id: 'playground.adOneClick.aspect916' }) },
                    { value: '1:1', label: intl.formatMessage({ id: 'playground.adOneClick.aspect11' }) },
                  ]}
                  disabled={locked}
                />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.adOneClick.languageLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: 'zh', label: intl.formatMessage({ id: 'playground.adOneClick.langZh' }) },
                    { value: 'en', label: 'English' },
                  ]}
                  disabled={locked}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#555' }}>{intl.formatMessage({ id: 'playground.adOneClick.creativeLabel' })}</span>
              <Switch checked={creative} onChange={setCreative} disabled={locked} />
              <span style={{ fontSize: 12, color: '#888' }}>
                {intl.formatMessage({ id: 'playground.adOneClick.creativeHint' })}
              </span>
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.adOneClick.promptLabel' })}</div>
              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={intl.formatMessage({ id: 'playground.adOneClick.promptPlaceholder' })}
                autoSize={{ minRows: 2, maxRows: 4 }}
                disabled={locked}
                maxLength={2000}
              />
            </div>
            <div>
              <div style={labelStyle}>
                {intl.formatMessage({ id: 'playground.adOneClick.productImagesLabel' }, { count: images.length, max: MAX_IMAGES })}
                <span style={{ color: '#888', fontWeight: 400 }}> {intl.formatMessage({ id: 'playground.adOneClick.firstImageHint' })}</span>
              </div>
              <Upload {...uploadProps} disabled={locked || images.length >= MAX_IMAGES}>
                <Button icon={<UploadOutlined />} loading={uploading} disabled={locked || images.length >= MAX_IMAGES}>
                  {intl.formatMessage({ id: 'playground.adOneClick.uploadImageBtn' })}
                </Button>
              </Upload>
              {images.length > 0 && (
                <div style={referenceGridStyle}>
                  {images.map((item, idx) => (
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
                        onClick={() => removeImage(item.uid)}
                        disabled={locked}
                        style={referenceDeleteStyle}
                      />
                      <span style={referenceBadgeStyle}>{idx + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="primary"
              size="large"
              block
              icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
              onClick={submit}
              loading={submitting}
              disabled={!hasModel || !apiKey || !!isInFlight || images.length === 0}
            >
              {submitting
                ? intl.formatMessage({ id: 'playground.adOneClick.submitting' })
                : isInFlight
                ? intl.formatMessage({ id: 'playground.adOneClick.taskInProgress' }, { elapsed: elapsedText })
                : intl.formatMessage({ id: 'playground.adOneClick.submitBtn' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.adOneClick.taskProgress' })}</span>}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <>
                    <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => fetchOnce(task.id)}>
                      {intl.formatMessage({ id: 'playground.adOneClick.refreshBtn' })}
                    </Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={cancel}>
                      {intl.formatMessage({ id: 'playground.adOneClick.cancelBtn' })}
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.adOneClick.clearBtn' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty
                image={<ShoppingOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.adOneClick.emptyHint' })}</span>}
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.adOneClick.submitFailed' })} description={errMsg} style={{ marginTop: 4 }} />
          )}

          {task && (
            <div>
              <div style={taskHeaderStyle}>
                <div>
                  <code style={{ fontSize: 12, color: '#555' }}>{task.id}</code>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{task.model}</div>
                </div>
                <Tag color={statusColor(task.status) as any} style={{ margin: 0 }}>
                  {statusText(task.status)}
                </Tag>
              </div>

              {errMsg && isInFlight && (
                <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.adOneClick.refreshTempFailed' })} description={errMsg} style={{ marginBottom: 14 }} />
              )}

              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} size="large" />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.adOneClick.queuedHint' })
                      : intl.formatMessage({ id: 'playground.adOneClick.runningHint' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage(
                      { id: 'playground.adOneClick.elapsedAutoRefresh' },
                      { elapsed: <b key="e">{elapsedText}</b> },
                    )}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.adOneClick.longTaskHint' })}
                  </div>
                </div>
              )}

              {succeeded && videoURL && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    ✓ {finalLatency
                      ? intl.formatMessage({ id: 'playground.adOneClick.doneWithLatency' }, { latency: finalLatency })
                      : intl.formatMessage({ id: 'playground.adOneClick.done' })}
                  </div>
                  <video
                    key={videoURL}
                    src={videoURL}
                    controls
                    autoPlay
                    style={{ width: '100%', borderRadius: 10, background: '#000' }}
                  />
                  <div style={{ marginTop: 10, textAlign: 'right' }}>
                    <a
                      href={videoURL}
                      download={browserDownloadName(videoURL, `ad-${task.id}.mp4`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.adOneClick.downloadVideo' })}</Button>
                    </a>
                  </div>
                </div>
              )}

              {succeeded && !videoURL && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.adOneClick.waitingUrl' })}
                  description={intl.formatMessage({ id: 'playground.adOneClick.waitingUrlDesc' })}
                />
              )}

              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.adOneClick.genFailed' })}
                  description={task.error?.code ? intl.formatMessage({ id: 'playground.adOneClick.errorCode' }, { code: task.error.code }) : undefined}
                />
              )}

              {task.status === 'canceled' && <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.adOneClick.taskCanceled' })} />}

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

      {/* 后期编辑:成片完成后才出现 */}
      {succeeded && mainTaskId && (
        <Card style={{ marginTop: 20 }} title={<span>{intl.formatMessage({ id: 'playground.adOneClick.postEditTitle' })}</span>}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Button onClick={loadSubtasks} loading={loadingSubs} icon={<ReloadOutlined />}>
                {intl.formatMessage({ id: 'playground.adOneClick.viewSubtasks' })}
              </Button>
            </div>
            {subtasks && (
              <div style={{ fontSize: 13 }}>
                {(subtasks.data_records?.storyboards || []).map((sb, i) => {
                  const sid = sb.stroyboard_id ?? sb.storyboard_id ?? i;
                  return (
                    <div key={i} style={subRowStyle}>
                      <b>{intl.formatMessage({ id: 'playground.adOneClick.storyboardTag' }, { id: sid })}</b>
                      {(sb.records || []).map((r) => (
                        <div key={r.id} style={{ marginLeft: 12, color: '#666' }}>
                          <code style={{ fontSize: 11 }}>{r.id}</code> · {statusText(stateToStatus(r.state))}
                          {r.prompt ? ` · ${r.prompt.slice(0, 40)}` : ''}
                          {r.creation_url ? (
                            <a href={publicMediaURL(r.creation_url)} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                              {intl.formatMessage({ id: 'playground.adOneClick.preview' })}
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {(subtasks.data_records?.narration_records || []).map((r) => (
                  <div key={r.id} style={subRowStyle}>
                    <b>{intl.formatMessage({ id: 'playground.adOneClick.narration' })}</b> <code style={{ fontSize: 11 }}>{r.id}</code> · {r.prompt?.slice(0, 60)}
                  </div>
                ))}
                {(subtasks.data_records?.bgm_records || []).map((r) => (
                  <div key={r.id} style={subRowStyle}>
                    <b>BGM</b> <code style={{ fontSize: 11 }}>{r.id}</code> · {r.prompt?.slice(0, 60)}
                  </div>
                ))}
              </div>
            )}

            <Divider style={{ margin: '4px 0' }} />

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ width: 160 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.adOneClick.editTargetLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={editType}
                  onChange={setEditType}
                  options={[
                    { value: 'generate_video', label: intl.formatMessage({ id: 'playground.adOneClick.editTargetVideo' }) },
                    { value: 'generate_narration', label: intl.formatMessage({ id: 'playground.adOneClick.editTargetNarration' }) },
                    { value: 'generate_bgm', label: intl.formatMessage({ id: 'playground.adOneClick.editTargetBgm' }) },
                  ]}
                />
              </div>
              {editType === 'generate_video' && (
                <div style={{ width: 120 }}>
                  <div style={labelStyle}>{intl.formatMessage({ id: 'playground.adOneClick.storyboardIndexLabel' })}</div>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    value={editIndex}
                    onChange={(v) => setEditIndex(v ?? 0)}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.adOneClick.newPromptLabel' })}</div>
                <Input
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder={intl.formatMessage({ id: 'playground.adOneClick.newPromptPlaceholder' })}
                />
              </div>
              <Button type="primary" onClick={submitEdit} loading={posting}>
                {intl.formatMessage({ id: 'playground.adOneClick.submitEditBtn' })}
              </Button>
            </div>

            {child && (
              <Alert
                type={child.status === 'failed' ? 'error' : 'info'}
                showIcon
                message={
                  <span>
                    {intl.formatMessage({ id: 'playground.adOneClick.editSubtask' })} <code>{child.id}</code> · {statusText(child.status)}
                  </span>
                }
                description={
                  childURL ? (
                    <video src={childURL} controls style={{ width: '100%', maxWidth: 360, marginTop: 8, borderRadius: 8 }} />
                  ) : child.status === 'queued' || child.status === 'running' ? (
                    intl.formatMessage({ id: 'playground.adOneClick.childGenerating' })
                  ) : (
                    child.error?.message
                  )
                }
              />
            )}
          </Space>
        </Card>
      )}

      <div style={tipBoxStyle}>
        💡 {intl.formatMessage({ id: 'playground.adOneClick.tipBox' }, { min: MIN_DURATION, max: MAX_DURATION })}
      </div>
    </div>
  );
}

function stateToStatus(s?: string): string {
  switch ((s || '').toLowerCase()) {
    case 'created':
    case 'queueing':
      return 'queued';
    case 'processing':
      return 'running';
    case 'success':
      return 'succeeded';
    case 'failed':
      return 'failed';
    default:
      return s || '';
  }
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

const taskHeaderStyle: React.CSSProperties = {
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

const subRowStyle: React.CSSProperties = {
  padding: '6px 0',
  borderBottom: '1px solid rgba(0,0,0,0.04)',
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
  height: 96,
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
  padding: '1px 6px',
  borderRadius: 4,
  color: '#fff',
  fontSize: 11,
  lineHeight: '16px',
  background: 'rgba(22,119,255,0.92)',
};

const tipBoxStyle: React.CSSProperties = {
  marginTop: 20,
  padding: '10px 14px',
  background: '#fafbfc',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 8,
  fontSize: 12,
  color: '#666',
};
