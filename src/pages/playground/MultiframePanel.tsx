import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
  VideoCameraAddOutlined,
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
import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { assetApi, systemApi, tokenApi } from '@/services/api';
import { browserDownloadName, publicMediaURL } from '@/utils/media';
import { apiURL } from '@/utils/request';
import { t } from '@/utils/i18n';

const LS_LAST_TASK = 'playground_multiframe_last_task_v1';

const MIN_KEYFRAMES = 2;
const MAX_KEYFRAMES = 9;
const DURATION_OPTIONS = [2, 3, 4, 5, 6, 7].map((v) => ({
  value: v,
  label: t('playground.multiframe.durationSec', { n: v }),
}));
const RESOLUTION_OPTIONS = [
  { value: '540p', label: '540p' },
  { value: '720p', label: t('playground.multiframe.resolution720pDefault') },
  { value: '1080p', label: '1080p' },
];

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

type FrameImage = { url: string; name: string; assetId?: number } | null;
type Keyframe = { uid: string; image: FrameImage; prompt: string; duration: number };

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
    queued: t('playground.multiframe.statusQueued'),
    running: t('playground.multiframe.statusRunning'),
    succeeded: t('playground.multiframe.statusSucceeded'),
    failed: t('playground.multiframe.statusFailed'),
    canceled: t('playground.multiframe.statusCanceled'),
  };
  return m[s] || s;
}

let kfSeq = 0;
function newKeyframe(): Keyframe {
  kfSeq += 1;
  return { uid: `kf-${kfSeq}-${Date.now()}`, image: null, prompt: '', duration: 5 };
}

export default function MultiframePanel() {
  const intl = useIntl();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [modelName, setModelName] = useState<string>();
  const [tokenId, setTokenId] = useState<number>();
  const [resolution, setResolution] = useState<string>('720p');
  const [startImage, setStartImage] = useState<FrameImage>(null);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([newKeyframe(), newKeyframe()]);

  const [submitting, setSubmitting] = useState(false);
  const [startUploading, setStartUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      // 智能多帧仅 Vidu Q2(viduq2-turbo / viduq2-pro)支持。
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'video' && m.enabled !== false && /viduq2/i.test(m.name))
        .map((m) => ({ value: m.name, label: m.display_name || m.name }));
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

  // 上传一张图,返回 {url, assetId}。复用 EffectsPanel 的上传逻辑(public_url 优先,缺失再查详情)。
  const uploadImage = async (file: File): Promise<{ url: string; assetId: number }> => {
    const uploaded = await assetApi.upload(file, { module: 'i2v_input', purpose: 'i2v_reference' });
    if (uploaded.code !== 0 || !uploaded.data) {
      throw new Error(uploaded.message || intl.formatMessage({ id: 'playground.multiframe.uploadFailed' }));
    }
    let url = uploaded.data.public_url;
    if (!url) {
      const detail = await assetApi.detail(uploaded.data.id);
      if (detail.code !== 0 || !detail.data?.url) {
        throw new Error(detail.message || intl.formatMessage({ id: 'playground.multiframe.fetchAssetUrlFailed' }));
      }
      url = detail.data.url;
    }
    return { url: url!, assetId: uploaded.data.id };
  };

  const startUploadProps: UploadProps = {
    accept: 'image/*',
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.multiframe.warnUploadImageFile' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setStartUploading(true);
      try {
        const f = file as File;
        const { url, assetId } = await uploadImage(f);
        setStartImage({ url, assetId, name: f.name || intl.formatMessage({ id: 'playground.multiframe.startFrameName' }) });
        message.success(intl.formatMessage({ id: 'playground.multiframe.startFrameSet' }));
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.multiframe.uploadFailed' }));
        onError?.(e);
      } finally {
        setStartUploading(false);
      }
    },
  };

  const uploadKeyframeImage = async (uid: string, f: File) => {
    try {
      const { url, assetId } = await uploadImage(f);
      setKeyframes((prev) =>
        prev.map((k) => (k.uid === uid ? { ...k, image: { url, assetId, name: f.name || intl.formatMessage({ id: 'playground.multiframe.keyframeName' }) } } : k)),
      );
      message.success(intl.formatMessage({ id: 'playground.multiframe.keyframeImageSet' }));
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.multiframe.uploadFailed' }));
    }
  };

  const addKeyframe = () => {
    setKeyframes((prev) => (prev.length >= MAX_KEYFRAMES ? prev : [...prev, newKeyframe()]));
  };
  const removeKeyframe = (uid: string) => {
    setKeyframes((prev) => (prev.length <= MIN_KEYFRAMES ? prev : prev.filter((k) => k.uid !== uid)));
  };
  const patchKeyframe = (uid: string, patch: Partial<Keyframe>) => {
    setKeyframes((prev) => prev.map((k) => (k.uid === uid ? { ...k, ...patch } : k)));
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
          setErrMsg(intl.formatMessage({ id: 'playground.multiframe.autoRefreshTempFail' }, { msg }));
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
        setErrMsg(intl.formatMessage({ id: 'playground.multiframe.autoRefreshTempFail' }, { msg }));
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.multiframe.warnSelectModel' }));
    if (!selectedToken) return message.warning(intl.formatMessage({ id: 'playground.multiframe.warnCreateApiKey' }));
    if (!tokenAllowsModel)
      return message.warning(intl.formatMessage({ id: 'playground.multiframe.warnKeyModelLimited' }, { model: modelName }));
    if (!startImage) return message.warning(intl.formatMessage({ id: 'playground.multiframe.warnUploadStartFrame' }));
    if (keyframes.length < MIN_KEYFRAMES)
      return message.warning(intl.formatMessage({ id: 'playground.multiframe.warnMinKeyframes' }, { min: MIN_KEYFRAMES }));
    if (keyframes.some((k) => !k.image))
      return message.warning(intl.formatMessage({ id: 'playground.multiframe.warnEachKeyframeImage' }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = {
        model: modelName,
        first_frame_image: startImage.url,
        image_settings: keyframes.map((k) => ({
          prompt: k.prompt || undefined,
          key_image: k.image!.url,
          duration: k.duration,
        })),
        resolution,
      };

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
    task?.completed_at && task?.created_at ? `${task.completed_at - task.created_at}s` : undefined;
  const videoURL = publicMediaURL(task?.data?.[0]?.url);
  const locked = !!isInFlight || submitting;
  const totalDuration = keyframes.reduce((sum, k) => sum + (k.duration || 0), 0);
  const canSubmit =
    !!modelName && !!selectedToken && !!startImage && keyframes.every((k) => !!k.image) && !isInFlight;

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 首帧 + 关键帧 + 提交 */}
        <Card
          style={{ flex: '1 1 480px', minWidth: 380 }}
          title={
            <span>
              <VideoCameraAddOutlined /> {intl.formatMessage({ id: 'playground.multiframe.title' })}
            </span>
          }
          extra={<span style={{ color: '#888', fontSize: 12 }}>POST /v1/videos/generations</span>}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.multiframe.modelLabel' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.multiframe.modelPlaceholder' })}
                options={models}
                value={modelName}
                onChange={setModelName}
                showSearch
                optionFilterProp="label"
                disabled={locked}
                notFoundContent={intl.formatMessage({ id: 'playground.multiframe.modelNotFound' })}
              />
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.multiframe.apiKeyLabel' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.multiframe.apiKeyPlaceholder' })}
                options={tokens.map((tk) => ({ value: tk.id, label: `${tk.name} (${tk.key_prefix}***)` }))}
                value={tokenId}
                onChange={setTokenId}
                disabled={locked}
              />
              {selectedToken && !tokenAllowsModel && (
                <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>
                  {intl.formatMessage({ id: 'playground.multiframe.keyModelLimitedInline' }, { model: modelName })}
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.multiframe.resolutionLabel' })}</div>
              <Select
                style={{ width: '100%' }}
                value={resolution}
                onChange={setResolution}
                options={RESOLUTION_OPTIONS}
                disabled={locked}
              />
            </div>

            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.multiframe.startFrameLabel' })}</div>
              <Upload {...startUploadProps} disabled={locked}>
                <Button icon={<UploadOutlined />} loading={startUploading} disabled={locked}>
                  {startImage
                    ? intl.formatMessage({ id: 'playground.multiframe.reuploadStartFrame' })
                    : intl.formatMessage({ id: 'playground.multiframe.uploadStartFrame' })}
                </Button>
              </Upload>
              {startImage && (
                <div style={referenceGridStyle}>
                  <div style={referenceTileStyle}>
                    <Image
                      src={startImage.url}
                      alt={startImage.name}
                      width={96}
                      height={96}
                      style={{ objectFit: 'cover', display: 'block' }}
                      preview={{ src: startImage.url }}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setStartImage(null)}
                      disabled={locked}
                      style={referenceDeleteStyle}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {intl.formatMessage(
                    { id: 'playground.multiframe.keyframesSummary' },
                    { count: keyframes.length, max: MAX_KEYFRAMES, total: totalDuration },
                  )}
                </span>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={addKeyframe}
                  disabled={locked || keyframes.length >= MAX_KEYFRAMES}
                >
                  {intl.formatMessage({ id: 'playground.multiframe.addKeyframe' })}
                </Button>
              </div>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {keyframes.map((k, idx) => (
                  <div key={k.uid} style={keyframeCardStyle}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={keyframeTileStyle}>
                        {k.image ? (
                          <Image
                            src={k.image.url}
                            alt={k.image.name}
                            width={84}
                            height={84}
                            style={{ objectFit: 'cover', display: 'block', borderRadius: 6 }}
                            preview={{ src: k.image.url }}
                          />
                        ) : (
                          <Upload
                            accept="image/*"
                            showUploadList={false}
                            disabled={locked}
                            beforeUpload={(file) => {
                              if (file.type && !file.type.startsWith('image/')) {
                                message.warning(intl.formatMessage({ id: 'playground.multiframe.warnUploadImageFile' }));
                                return Upload.LIST_IGNORE;
                              }
                              return true;
                            }}
                            customRequest={({ file, onSuccess }) => {
                              uploadKeyframeImage(k.uid, file as File).finally(() => onSuccess?.({} as any));
                            }}
                          >
                            <div style={keyframeUploadStyle}>
                              <UploadOutlined />
                              <span style={{ fontSize: 11, marginTop: 4 }}>
                                {intl.formatMessage({ id: 'playground.multiframe.uploadImageTile' })}
                              </span>
                            </div>
                          </Upload>
                        )}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color="blue" style={{ margin: 0 }}>
                            {intl.formatMessage({ id: 'playground.multiframe.frameTag' }, { n: idx + 1 })}
                          </Tag>
                          <Select
                            size="small"
                            style={{ width: 100 }}
                            value={k.duration}
                            onChange={(v) => patchKeyframe(k.uid, { duration: v })}
                            options={DURATION_OPTIONS}
                            disabled={locked}
                          />
                          {k.image && (
                            <Button
                              size="small"
                              type="text"
                              onClick={() => patchKeyframe(k.uid, { image: null })}
                              disabled={locked}
                            >
                              {intl.formatMessage({ id: 'playground.multiframe.changeImage' })}
                            </Button>
                          )}
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => removeKeyframe(k.uid)}
                            disabled={locked || keyframes.length <= MIN_KEYFRAMES}
                            style={{ marginLeft: 'auto' }}
                          />
                        </div>
                        <Input.TextArea
                          placeholder={intl.formatMessage({ id: 'playground.multiframe.keyframePromptPlaceholder' })}
                          value={k.prompt}
                          onChange={(e) => patchKeyframe(k.uid, { prompt: e.target.value })}
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          disabled={locked}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </Space>
            </div>

            <Button
              type="primary"
              size="large"
              block
              icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
              onClick={submit}
              loading={submitting}
              disabled={!canSubmit}
            >
              {submitting
                ? intl.formatMessage({ id: 'playground.multiframe.submitting' })
                : isInFlight
                  ? intl.formatMessage({ id: 'playground.multiframe.taskInFlight' }, { elapsed: elapsedText })
                  : intl.formatMessage({ id: 'playground.multiframe.generateVideo' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.multiframe.taskProgress' })}</span>}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <>
                    <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => fetchOnce(task.id)}>
                      {intl.formatMessage({ id: 'playground.multiframe.refresh' })}
                    </Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={cancel}>
                      {intl.formatMessage({ id: 'playground.multiframe.cancel' })}
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.multiframe.clear' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty
                image={<VideoCameraAddOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.multiframe.emptyHint' })}</span>}
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.multiframe.submitFailed' })} description={errMsg} style={{ marginTop: 4 }} />
          )}

          {task && (
            <div>
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
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{task.model}</div>
                </div>
                <Tag color={statusColor(task.status) as any} style={{ margin: 0 }}>
                  {statusText(task.status)}
                </Tag>
              </div>

              {errMsg && isInFlight && (
                <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.multiframe.refreshTempFail' })} description={errMsg} style={{ marginBottom: 14 }} />
              )}

              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} size="large" />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.multiframe.queuedWaitUpstream' })
                      : intl.formatMessage({ id: 'playground.multiframe.generatingVideo' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage({ id: 'playground.multiframe.elapsedAutoRefresh' })}
                    <b>{elapsedText}</b>
                    {intl.formatMessage({ id: 'playground.multiframe.autoRefreshEvery5s' })}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.multiframe.usuallyTakesSeconds' })}
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && videoURL && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    {finalLatency
                      ? intl.formatMessage({ id: 'playground.multiframe.generateDoneWithLatency' }, { latency: finalLatency })
                      : intl.formatMessage({ id: 'playground.multiframe.generateDone' })}
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
                      download={browserDownloadName(videoURL, `multiframe-${task.id}.mp4`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.multiframe.downloadVideo' })}</Button>
                    </a>
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && !videoURL && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.multiframe.waitingBackendUrl' })}
                  description={intl.formatMessage({ id: 'playground.multiframe.waitingBackendUrlDesc' })}
                />
              )}

              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.multiframe.generateFailed' })}
                  description={task.error?.code ? intl.formatMessage({ id: 'playground.multiframe.errorCode' }, { code: task.error.code }) : undefined}
                />
              )}

              {task.status === 'canceled' && <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.multiframe.taskCanceled' })} />}

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
        {intl.formatMessage(
          { id: 'playground.multiframe.tipFooter' },
          { min: MIN_KEYFRAMES, max: MAX_KEYFRAMES },
        )}
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

const keyframeCardStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.08)',
  background: '#fff',
};

const keyframeTileStyle: React.CSSProperties = {
  width: 84,
  height: 84,
  flex: '0 0 84px',
};

const keyframeUploadStyle: React.CSSProperties = {
  width: 84,
  height: 84,
  borderRadius: 6,
  border: '1px dashed rgba(0,0,0,0.18)',
  background: '#fafafa',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#999',
  cursor: 'pointer',
};
