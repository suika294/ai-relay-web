import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
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
import { browserDownloadName, publicMediaURL } from '@/utils/media';
import { apiURL } from '@/utils/request';

const LS_LAST_TASK = 'playground_general_one_click_last_task_v1';

// 走 /ent/v2/one-click/general_one_click 的专用虚拟模型(后端 092 迁移种子)。该端点不收 model,
// 这个模型仅作路由/计费句柄。
const GENERAL_MODEL = 'vidu-general-one-click';

const { TextArea } = Input;

const MAX_IMAGES = 7;
const MIN_DURATION = 1;
const MAX_DURATION = 180;

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

type GenImage = { uid: string; url: string; name: string; assetId?: number };

// 子任务树(GET /v1/videos/general-one-click/:id/status 的上游原样透传)。
type SubJob = {
  id: string;
  type?: string;
  state?: string;
  signed_url?: string;
  mv_generate_video_input?: { prompt?: string };
};
type JobRecord = { type?: string; index?: number; jobs?: SubJob[] };
type StatusTree = { id?: string; state?: string; signed_url?: string; job_records?: JobRecord[] };

// latestJob 取一个分镜记录的最新一次生成(jobs 末元素 = 最近编辑历史)。
function latestJob(rec: JobRecord): SubJob | undefined {
  const jobs = rec.jobs || [];
  return jobs.length ? jobs[jobs.length - 1] : undefined;
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
    queued: t('playground.generalOneClick.statusQueued'),
    running: t('playground.generalOneClick.statusRunning'),
    succeeded: t('playground.generalOneClick.statusSucceeded'),
    failed: t('playground.generalOneClick.statusFailed'),
    canceled: t('playground.generalOneClick.statusCanceled'),
  };
  return m[s] || s;
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

export default function GeneralOneClickPanel() {
  const intl = useIntl();
  const [hasModel, setHasModel] = useState<boolean>(true);
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [tokenId, setTokenId] = useState<number>();
  const [images, setImages] = useState<GenImage[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [duration, setDuration] = useState<number>(15);
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 后期编辑:成片 id + 子任务树 + 选中的编辑/合成项 + 产生的子任务。
  const [mainTaskId, setMainTaskId] = useState<string | null>(null);
  const [statusTree, setStatusTree] = useState<StatusTree | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [editJobId, setEditJobId] = useState<string>('');
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [composeIds, setComposeIds] = useState<string[]>([]);
  const [child, setChild] = useState<VideoTask | null>(null);
  const [posting, setPosting] = useState(false);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const childPollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = (res.data as any[]) || [];
      setHasModel(list.some((m) => m.name === GENERAL_MODEL && m.enabled !== false));
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

  const selectedToken = tokens.find((t) => t.id === tokenId);
  const tokenAllowsModel =
    !selectedToken?.allowed_models?.length || selectedToken.allowed_models.includes(GENERAL_MODEL);

  const removeImage = (uid: string) => setImages((prev) => prev.filter((x) => x.uid !== uid));

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.generalOneClick.uploadImageOnly' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      if (images.length >= MAX_IMAGES) {
        message.warning(intl.formatMessage({ id: 'playground.generalOneClick.maxImagesHint' }, { max: MAX_IMAGES }));
        onSuccess?.({} as any);
        return;
      }
      setUploading(true);
      try {
        const f = file as File;
        const uploaded = await assetApi.upload(f, { module: 'i2v_input', purpose: 'i2v_reference' });
        if (uploaded.code !== 0 || !uploaded.data) {
          throw new Error(uploaded.message || intl.formatMessage({ id: 'playground.generalOneClick.uploadFailed' }));
        }
        let url = uploaded.data.public_url;
        if (!url) {
          const detail = await assetApi.detail(uploaded.data.id);
          if (detail.code !== 0 || !detail.data?.url) {
            throw new Error(detail.message || intl.formatMessage({ id: 'playground.generalOneClick.fetchAssetUrlFailed' }));
          }
          url = detail.data.url;
        }
        const assetID = uploaded.data.id;
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES || prev.some((x) => x.url === url)) return prev;
          return [
            ...prev,
            { uid: `asset-${assetID}-${Date.now()}`, assetId: assetID, url: url!, name: f.name || intl.formatMessage({ id: 'playground.generalOneClick.defaultImageName' }) },
          ];
        });
        message.success(intl.formatMessage({ id: 'playground.generalOneClick.imageAdded' }));
        onSuccess?.(uploaded as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.generalOneClick.uploadFailed' }));
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
          setErrMsg(intl.formatMessage({ id: 'playground.generalOneClick.autoRefreshTransientFail' }, { msg }));
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
        setErrMsg(intl.formatMessage({ id: 'playground.generalOneClick.autoRefreshTransientFail' }, { msg }));
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
    if (!selectedToken) return;
    try {
      const res = await fetch(apiURL(`/v1/videos/generations/${id}`), {
        headers: { Authorization: `Bearer ${selectedToken.key}` },
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
    if (!hasModel)
      return message.warning(
        intl.formatMessage({ id: 'playground.generalOneClick.modelNotFoundWarn' }, { model: GENERAL_MODEL }),
      );
    if (!selectedToken)
      return message.warning(intl.formatMessage({ id: 'playground.generalOneClick.createKeyFirst' }));
    if (!tokenAllowsModel)
      return message.warning(
        intl.formatMessage({ id: 'playground.generalOneClick.keyModelRestricted' }, { model: GENERAL_MODEL }),
      );
    if (images.length === 0)
      return message.warning(intl.formatMessage({ id: 'playground.generalOneClick.uploadAtLeastOne' }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    setMainTaskId(null);
    setStatusTree(null);
    setChild(null);
    setComposeIds([]);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = {
        model: GENERAL_MODEL,
        images: images.map((x) => x.url),
        duration,
        aspect_ratio: aspectRatio,
      };
      if (prompt.trim()) body.prompt = prompt.trim();

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
    if (childPollRef.current) window.clearTimeout(childPollRef.current);
    setTask(null);
    setMainTaskId(null);
    setStatusTree(null);
    setChild(null);
    setComposeIds([]);
    setErrMsg(null);
    setElapsedMs(0);
    localStorage.removeItem(LS_LAST_TASK);
  };

  const loadStatus = async () => {
    if (!mainTaskId || !selectedToken) return;
    setLoadingStatus(true);
    try {
      const res = await fetch(apiURL(`/v1/videos/general-one-click/${mainTaskId}/status`), {
        headers: { Authorization: `Bearer ${selectedToken.key}` },
      });
      const text = await res.text();
      if (!res.ok) {
        message.error(extractErrMsg(text, res.status));
        return;
      }
      setStatusTree(JSON.parse(text) as StatusTree);
    } catch (e: any) {
      message.error(String(e?.message || e));
    } finally {
      setLoadingStatus(false);
    }
  };

  const submitEdit = async () => {
    if (!mainTaskId || !selectedToken) return;
    if (!editJobId)
      return message.warning(intl.formatMessage({ id: 'playground.generalOneClick.selectStoryboardFirst' }));
    if (!editPrompt.trim())
      return message.warning(intl.formatMessage({ id: 'playground.generalOneClick.fillNewPrompt' }));
    setPosting(true);
    try {
      const res = await fetch(apiURL(`/v1/videos/general-one-click/${mainTaskId}/edit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${selectedToken.key}` },
        body: JSON.stringify({ job_id: editJobId, prompt: editPrompt.trim() }),
      });
      const text = await res.text();
      if (!res.ok) {
        message.error(extractErrMsg(text, res.status));
        return;
      }
      const t = JSON.parse(text) as VideoTask;
      setChild(t);
      message.success(intl.formatMessage({ id: 'playground.generalOneClick.editSubmitted' }));
      if (t.status === 'queued' || t.status === 'running') fetchChild(t.id);
    } catch (e: any) {
      message.error(String(e?.message || e));
    } finally {
      setPosting(false);
    }
  };

  const submitCompose = async () => {
    if (!mainTaskId || !selectedToken) return;
    if (composeIds.length === 0)
      return message.warning(intl.formatMessage({ id: 'playground.generalOneClick.checkComposeStoryboards' }));
    setPosting(true);
    try {
      const res = await fetch(apiURL(`/v1/videos/general-one-click/${mainTaskId}/compose`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${selectedToken.key}` },
        body: JSON.stringify({ job_ids: composeIds }),
      });
      const text = await res.text();
      if (!res.ok) {
        message.error(extractErrMsg(text, res.status));
        return;
      }
      const t = JSON.parse(text) as VideoTask;
      setChild(t);
      message.success(intl.formatMessage({ id: 'playground.generalOneClick.composeSubmitted' }));
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

  // 从 job_records 抽出分镜列表(只看 generate_video 类记录的最新一次生成)。
  const storyboards = (statusTree?.job_records || [])
    .filter((r) => r.type === 'generate_video')
    .map((r) => ({ index: r.index ?? 0, job: latestJob(r) }))
    .filter((x) => !!x.job) as { index: number; job: SubJob }[];

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 图片 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <VideoCameraOutlined /> {intl.formatMessage({ id: 'playground.generalOneClick.title' })}
            </span>
          }
          extra={<span style={{ color: '#888', fontSize: 12 }}>POST /v1/videos/generations</span>}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {!hasModel && (
              <Alert
                type="warning"
                showIcon
                message={intl.formatMessage({ id: 'playground.generalOneClick.modelNotFoundAlertMsg' }, { model: GENERAL_MODEL })}
                description={intl.formatMessage({ id: 'playground.generalOneClick.modelNotFoundAlertDesc' })}
              />
            )}
            <div>
              <div style={labelStyle}>API Key</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.generalOneClick.selectApiKey' })}
                options={tokens.map((t) => ({ value: t.id, label: `${t.name} (${t.key_prefix}***)` }))}
                value={tokenId}
                onChange={setTokenId}
                disabled={locked}
              />
              {selectedToken && !tokenAllowsModel && (
                <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>
                  {intl.formatMessage({ id: 'playground.generalOneClick.keyModelRestrictedInline' }, { model: GENERAL_MODEL })}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.generalOneClick.durationLabel' })}</div>
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
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.generalOneClick.aspectRatioLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  options={[
                    { value: '16:9', label: intl.formatMessage({ id: 'playground.generalOneClick.aspect169' }) },
                    { value: '9:16', label: intl.formatMessage({ id: 'playground.generalOneClick.aspect916' }) },
                    { value: '1:1', label: intl.formatMessage({ id: 'playground.generalOneClick.aspect11' }) },
                    { value: '4:3', label: '4:3' },
                    { value: '3:4', label: '3:4' },
                  ]}
                  disabled={locked}
                />
              </div>
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.generalOneClick.promptLabel' })}</div>
              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={intl.formatMessage({ id: 'playground.generalOneClick.promptPlaceholder' })}
                autoSize={{ minRows: 2, maxRows: 4 }}
                disabled={locked}
                maxLength={3000}
              />
            </div>
            <div>
              <div style={labelStyle}>
                {intl.formatMessage({ id: 'playground.generalOneClick.imagesLabel' }, { count: images.length, max: MAX_IMAGES })}
                <span style={{ color: '#888', fontWeight: 400 }}>{intl.formatMessage({ id: 'playground.generalOneClick.imagesHint' })}</span>
              </div>
              <Upload {...uploadProps} disabled={locked || images.length >= MAX_IMAGES}>
                <Button icon={<UploadOutlined />} loading={uploading} disabled={locked || images.length >= MAX_IMAGES}>
                  {intl.formatMessage({ id: 'playground.generalOneClick.uploadImageBtn' })}
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
              disabled={!hasModel || !selectedToken || !!isInFlight || images.length === 0}
            >
              {submitting
                ? intl.formatMessage({ id: 'playground.generalOneClick.submitting' })
                : isInFlight
                ? intl.formatMessage({ id: 'playground.generalOneClick.taskInFlight' }, { elapsed: elapsedText })
                : intl.formatMessage({ id: 'playground.generalOneClick.generateBtn' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.generalOneClick.taskProgress' })}</span>}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <>
                    <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => fetchOnce(task.id)}>
                      {intl.formatMessage({ id: 'playground.generalOneClick.refresh' })}
                    </Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={cancel}>
                      {intl.formatMessage({ id: 'playground.generalOneClick.cancel' })}
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.generalOneClick.clear' })}
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
                description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.generalOneClick.emptyHint' })}</span>}
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.generalOneClick.submitFailed' })} description={errMsg} style={{ marginTop: 4 }} />
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
                <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.generalOneClick.refreshTransientFailTitle' })} description={errMsg} style={{ marginBottom: 14 }} />
              )}

              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} size="large" />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.generalOneClick.taskQueuedDesc' })
                      : intl.formatMessage({ id: 'playground.generalOneClick.taskRunningDesc' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage({ id: 'playground.generalOneClick.elapsedAutoRefresh' })} <b>{elapsedText}</b>{intl.formatMessage({ id: 'playground.generalOneClick.autoRefreshEvery5s' })}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.generalOneClick.multiSceneHint' })}
                  </div>
                </div>
              )}

              {succeeded && videoURL && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    {finalLatency
                      ? intl.formatMessage({ id: 'playground.generalOneClick.generateDoneLatency' }, { latency: finalLatency })
                      : intl.formatMessage({ id: 'playground.generalOneClick.generateDone' })}
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
                      download={browserDownloadName(videoURL, `oneclick-${task.id}.mp4`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.generalOneClick.downloadVideo' })}</Button>
                    </a>
                  </div>
                </div>
              )}

              {succeeded && !videoURL && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.generalOneClick.waitingUrlMsg' })}
                  description={intl.formatMessage({ id: 'playground.generalOneClick.waitingUrlDesc' })}
                />
              )}

              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.generalOneClick.generateFailed' })}
                  description={task.error?.code ? intl.formatMessage({ id: 'playground.generalOneClick.errorCode' }, { code: task.error.code }) : undefined}
                />
              )}

              {task.status === 'canceled' && <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.generalOneClick.taskCanceled' })} />}

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
        <Card style={{ marginTop: 20 }} title={<span>{intl.formatMessage({ id: 'playground.generalOneClick.postEditTitle' })}</span>}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Button onClick={loadStatus} loading={loadingStatus} icon={<ReloadOutlined />}>
                {intl.formatMessage({ id: 'playground.generalOneClick.viewStoryboards' })}
              </Button>
            </div>
            {storyboards.length > 0 && (
              <div style={{ fontSize: 13 }}>
                {storyboards.map(({ index, job }) => (
                  <div key={job.id} style={subRowStyle}>
                    <Checkbox
                      checked={composeIds.includes(job.id)}
                      onChange={(e) =>
                        setComposeIds((prev) =>
                          e.target.checked ? [...prev, job.id] : prev.filter((x) => x !== job.id),
                        )
                      }
                    >
                      <b>{intl.formatMessage({ id: 'playground.generalOneClick.storyboardNo' }, { index })}</b>
                    </Checkbox>
                    <div style={{ marginLeft: 24, color: '#666' }}>
                      <code style={{ fontSize: 11 }}>{job.id}</code> · {statusText(stateToStatus(job.state))}
                      {job.mv_generate_video_input?.prompt
                        ? ` · ${job.mv_generate_video_input.prompt.slice(0, 40)}`
                        : ''}
                      {job.signed_url ? (
                        <a href={publicMediaURL(job.signed_url)} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                          {intl.formatMessage({ id: 'playground.generalOneClick.preview' })}
                        </a>
                      ) : null}
                      <Button
                        size="small"
                        type="link"
                        onClick={() => setEditJobId(job.id)}
                        style={{ padding: '0 6px' }}
                      >
                        {intl.formatMessage({ id: 'playground.generalOneClick.selectEdit' })}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Divider style={{ margin: '4px 0' }} />

            {/* 编辑单分镜 */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ width: 220 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.generalOneClick.editJobIdLabel' })}</div>
                <Input
                  value={editJobId}
                  onChange={(e) => setEditJobId(e.target.value)}
                  placeholder={intl.formatMessage({ id: 'playground.generalOneClick.editJobIdPlaceholder' })}
                />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.generalOneClick.newPromptLabel' })}</div>
                <Input
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder={intl.formatMessage({ id: 'playground.generalOneClick.newPromptPlaceholder' })}
                />
              </div>
              <Button type="primary" onClick={submitEdit} loading={posting}>
                {intl.formatMessage({ id: 'playground.generalOneClick.submitEdit' })}
              </Button>
            </div>

            {/* 重新合成 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#555' }}>
                {intl.formatMessage({ id: 'playground.generalOneClick.composeSelectedCount' }, { count: composeIds.length })}
              </span>
              <Button onClick={submitCompose} loading={posting} disabled={composeIds.length === 0}>
                {intl.formatMessage({ id: 'playground.generalOneClick.composeBtn' })}
              </Button>
            </div>

            {child && (
              <Alert
                type={child.status === 'failed' ? 'error' : 'info'}
                showIcon
                message={
                  <span>
                    {intl.formatMessage({ id: 'playground.generalOneClick.childTaskPrefix' })} <code>{child.id}</code> · {statusText(child.status)}
                  </span>
                }
                description={
                  childURL ? (
                    <video src={childURL} controls style={{ width: '100%', maxWidth: 360, marginTop: 8, borderRadius: 8 }} />
                  ) : child.status === 'queued' || child.status === 'running' ? (
                    intl.formatMessage({ id: 'playground.generalOneClick.childGeneratingDesc' })
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
        {intl.formatMessage({ id: 'playground.generalOneClick.tipBox' }, { min: MIN_DURATION, max: MAX_DURATION })}
      </div>
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
