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
import { assetApi, systemApi, tokenApi } from '@/services/api';
import { apiURL } from '@/utils/request';
import MediaHistoryDrawer from './MediaHistoryDrawer';

const { TextArea } = Input;
const LS_LAST_TASK = 'playground_video_last_task_v1';

function extractErrMsg(raw: string, httpStatus: number): string {
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.message || raw.slice(0, 500);
  } catch {
    return raw ? raw.slice(0, 500) : `HTTP ${httpStatus}`;
  }
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

type ReferenceImage = {
  uid: string;
  url: string;
  name: string;
  assetId?: number;
  source: 'upload' | 'url';
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
    queued: '排队中',
    running: '生成中',
    succeeded: '已完成',
    failed: '失败',
    canceled: '已取消',
  };
  return m[s] || s;
}

export default function VideoPanel() {
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

  const referenceURLs = () => {
    const urls = referenceImages.map((x) => x.url).filter(Boolean);
    const manual = imageURL.trim();
    if (manual && !urls.includes(manual)) urls.push(manual);
    return urls;
  };

  const addReferenceURL = () => {
    const url = imageURL.trim();
    if (!url) return message.warning('请输入参考图 URL');
    setReferenceImages((prev) => {
      if (prev.some((x) => x.url === url)) return prev;
      return [
        ...prev,
        {
          uid: `url-${Date.now()}`,
          url,
          name: '外部 URL',
          source: 'url',
        },
      ];
    });
    setImageURL('');
  };

  const removeReferenceImage = (uid: string) => {
    setReferenceImages((prev) => prev.filter((x) => x.uid !== uid));
  };

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning('请上传图片文件');
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
          throw new Error(uploaded.message || '上传失败');
        }

        let url = uploaded.data.public_url;
        if (!url) {
          const detail = await assetApi.detail(uploaded.data.id);
          if (detail.code !== 0 || !detail.data?.url) {
            throw new Error(detail.message || '获取素材 URL 失败');
          }
          url = detail.data.url;
        }

        const item: ReferenceImage = {
          uid: `asset-${uploaded.data.id}-${Date.now()}`,
          assetId: uploaded.data.id,
          url,
          name: f.name || uploaded.data.filename || '参考图',
          source: 'upload',
        };
        setReferenceImages((prev) => {
          if (prev.some((x) => x.url === url)) return prev;
          return [...prev, item];
        });
        message.success('参考图已添加');
        onSuccess?.(uploaded as any);
      } catch (e: any) {
        message.error(e?.message || '上传失败');
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
        setErrMsg(extractErrMsg(text, res.status));
        return;
      }
      const t = JSON.parse(text) as VideoTask;
      setTask(t);
      if (t.status === 'queued' || t.status === 'running') {
        schedulePoll(id);
      } else {
        stopTimer();
      }
    } catch (e: any) {
      setErrMsg(String(e?.message || e));
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!prompt.trim()) return message.warning('请输入提示词');
    if (!modelName) return message.warning('请选择模型');
    if (!selectedToken) return message.warning('请先创建 API Key');
    if (!tokenAllowsModel)
      return message.warning(`当前 Key 限制了可用模型,不包含 ${modelName}`);

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = { model: modelName, prompt: prompt.trim() };
      const refs = referenceURLs();
      if (refs.length === 1) {
        body.image_url = refs[0];
      } else if (refs.length > 1) {
        body.image_url = refs[0];
        body.images = refs;
      }
      const assetIds = referenceImages.map((x) => x.assetId || 0);
      if (assetIds.some((id) => id > 0)) body.image_asset_ids = assetIds;
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
  const videoURL = task?.data?.[0]?.url;

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 提示词 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <VideoCameraOutlined /> 视频生成
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
                历史
              </Button>
              <span style={{ color: '#888', fontSize: 12 }}>
                POST /v1/videos/generations
              </span>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>模型</div>
              <Select
                style={{ width: '100%' }}
                placeholder="选择视频模型"
                options={models}
                value={modelName}
                onChange={setModelName}
                showSearch
                optionFilterProp="label"
                disabled={!!isInFlight || submitting}
              />
            </div>
            <div>
              <div style={labelStyle}>API Key</div>
              <Select
                style={{ width: '100%' }}
                placeholder="选择 API Key"
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
                  当前 Key 限制了可用模型,不包含 {modelName}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>时长</div>
                <InputNumber
                  min={1}
                  max={60}
                  value={duration}
                  onChange={(v) => setDuration(v ?? undefined)}
                  addonAfter="秒"
                  style={{ width: '100%' }}
                  disabled={!!isInFlight || submitting}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>分辨率</div>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="分辨率"
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
              <div style={labelStyle}>参考图(可选,图生视频)</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="https://... 或 data:image/...;base64,..."
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
                  添加
                </Button>
              </Space.Compact>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Upload {...uploadProps} disabled={!!isInFlight || submitting}>
                  <Button
                    icon={<UploadOutlined />}
                    loading={uploadingRef}
                    disabled={!!isInFlight || submitting}
                  >
                    上传参考图
                  </Button>
                </Upload>
                {referenceImages.length > 0 && (
                  <Tag color="blue" style={{ margin: 0 }}>
                    {referenceImages.length} 张
                  </Tag>
                )}
              </div>
              {referenceImages.length > 0 && (
                <div style={referenceGridStyle}>
                  {referenceImages.map((item, idx) => (
                    <div key={item.uid} style={referenceTileStyle}>
                      <Image
                        src={item.url}
                        alt={item.name}
                        width={72}
                        height={72}
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
                      {idx === 0 && <span style={referenceBadgeStyle}>主图</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>提示词</div>
              <TextArea
                placeholder="例如:a cat wearing sunglasses dancing in front of the Eiffel Tower"
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
              {submitting ? '提交中...' : isInFlight ? `任务进行中 · ${elapsedText}` : '提交任务'}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>任务进度</span>}
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
                      刷新
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={cancel}
                    >
                      取消
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    清空
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
                    提交任务后,进度和视频会显示在这里
                  </span>
                }
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert
              type="error"
              showIcon
              message="提交失败"
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

              {/* 进行中:大号 Spin + 实时计时 + 提示 */}
              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin
                    indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />}
                    size="large"
                  />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued' ? '任务已排队,等待上游执行' : '视频正在生成中'}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    已用时 <b>{elapsedText}</b> · 自动每 5 秒刷新
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    视频模型通常 10 秒–数分钟出结果,可离开页面稍后回来
                  </div>
                </div>
              )}

              {/* 成功:视频播放器 + 下载 */}
              {task.status === 'succeeded' && videoURL && (
                <div>
                  <div
                    style={{
                      color: '#52c41a',
                      fontSize: 13,
                      marginBottom: 10,
                    }}
                  >
                    ✓ 生成完成{finalLatency ? ` · 用时 ${finalLatency}` : ''}
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
                      download={`video-${task.id}.mp4`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button icon={<DownloadOutlined />}>下载视频</Button>
                    </a>
                  </div>
                </div>
              )}

              {/* 失败:错误详情 */}
              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || '生成失败'}
                  description={
                    task.error?.code ? `错误码: ${task.error.code}` : undefined
                  }
                />
              )}

              {/* 取消态:简单提示 */}
              {task.status === 'canceled' && (
                <Alert
                  type="warning"
                  showIcon
                  message="任务已取消"
                />
              )}

              {/* 浮于顶部的临时错误(提交后轮询失败等) */}
              {errMsg && (
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
        💡 异步任务接口:提交后立即返回 <code>task_id</code>,页面在后台每 5 秒轮询一次。
        离开页面不会丢 — 回到这里会继续从 localStorage 恢复上次的任务并接着轮询。
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
  gridTemplateColumns: 'repeat(auto-fill, 72px)',
  gap: 8,
};

const referenceTileStyle: React.CSSProperties = {
  position: 'relative',
  width: 72,
  height: 72,
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
  padding: '1px 5px',
  borderRadius: 4,
  background: 'rgba(22,119,255,0.92)',
  color: '#fff',
  fontSize: 11,
  lineHeight: '16px',
};
