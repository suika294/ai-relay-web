import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HistoryOutlined,
  LoadingOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
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
import { assetApi, systemApi, tokenApi } from '@/services/api';
import { apiURL } from '@/utils/request';
import MediaHistoryDrawer from './MediaHistoryDrawer';

const { TextArea } = Input;
const LS_LAST_TASK = 'playground_image_last_task_v1';

// 错误响应里挖 message:
//   1) JSON {error:{message}} / {message} → 直接用
//   2) Nginx/反代返回 HTML 504/502 → 解析 <title>/<h1> 拼友好文案,而不是吐 4KB padding
//   3) 兜底 raw 截到 4000 字符(老逻辑 500 太短,Nginx 错误页结尾必被吃成 ...)
function extractErrMsg(raw: string, httpStatus: number): string {
  if (!raw) return `HTTP ${httpStatus}`;
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    return friendlyImageError(parseHTMLError(trimmed, httpStatus));
  }
  let msg = '';
  try {
    const j = JSON.parse(trimmed);
    msg = j?.error?.message || j?.message || trimmed.slice(0, 4000);
  } catch {
    msg = trimmed.slice(0, 4000);
  }
  return friendlyImageError(msg);
}

function parseHTMLError(html: string, httpStatus: number): string {
  // <title>504 Gateway Time-out</title> / <h1>504 Gateway Time-out</h1>
  const title = /<title>([^<]+)<\/title>/i.exec(html)?.[1]?.trim();
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)?.[1]?.trim();
  const headline = title || h1 || `HTTP ${httpStatus}`;
  if (/504|gateway time-?out/i.test(headline)) {
    return `${headline} · 反向代理上游超时(Nginx 默认 60s)。图像模型在大参考图场景下经常超过此阈值,本页已改异步轮询;若仍超时,请检查 Nginx proxy_read_timeout 或后端到上游链路。`;
  }
  if (/502|bad gateway/i.test(headline)) {
    return `${headline} · 反向代理连不上后端。请确认 backend 服务存活,或后端/上游连接是否被中断。`;
  }
  if (/503|service unavailable/i.test(headline)) {
    return `${headline} · 后端临时不可用。请稍后重试。`;
  }
  return headline;
}

function friendlyImageError(msg: string): string {
  // OpenAI gpt-image 多参考图,某张文件被拒
  if (/invalid_image_file|Invalid image file or mode/i.test(msg)) {
    return [
      '上游报参考图无效。常见原因:① 该图实际格式 / 颜色模式不被模型接受(CMYK JPEG、动图、超大尺寸);② 同时传了 image_url 顶层字段和 images 数组造成重复或顺序错乱。',
      '建议先逐张试,只留一张参考图复现一下;OpenAI 报的 image N 是 1-based 索引,可按当前参考图列表的顺序定位。',
      `原始错误: ${msg}`,
    ].join('\n\n');
  }
  // Gemini 拒绝出图(本轮 backend 已把上游 text/finishReason 拼进来)
  if (/no_image_data|response contained no image data/i.test(msg)) {
    return [
      'Gemini 返回了非图像响应。常见原因:① 安全策略拒绝(地缘 / 人物 / 政治意涵的提示常触发);② 模型路径走成了 chat-only;③ 上游有降级。',
      `原始错误: ${msg}`,
    ].join('\n\n');
  }
  if (/trying to proxy|econnrefused|econnreset|socket hang up/i.test(msg)) {
    return [
      '前端开发代理暂时连不上后端。自动刷新会继续重试;如果一直出现,请确认后端服务已启动。',
      `原始错误: ${msg}`,
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

type ImageTask = {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  created_at: number;
  completed_at?: number;
  prompt?: string;
  data?: { url?: string; revised_prompt?: string }[];
  error?: { code?: string; message: string };
};

type ReferenceImage = {
  uid: string;
  url: string;
  name: string;
  assetId?: number;
  source: 'upload' | 'url';
};

const SIZE_OPTIONS = [
  { value: '512x512', label: '512 × 512' },
  { value: '1024x1024', label: '1024 × 1024' },
  { value: '1024x1792', label: '1024 × 1792(竖)' },
  { value: '1792x1024', label: '1792 × 1024(横)' },
];

// 跟后端 imageRefMaxBytes 对齐(25MB)。上传前本地先拦一次,省一次往返。
const IMAGE_REF_MAX_BYTES = 25 * 1024 * 1024;

// probeUploadedImage 用浏览器自己的解码器验证文件:
//   1. 类型是 image/*
//   2. 大小 ≤ 25MB
//   3. 真的能被 createImageBitmap / Image() 解出来(顺便拿尺寸)
// 任一失败拒绝并把错误信息给到 UI,这样比"传上去 → 30s 后上游 invalid_image_file"快得多。
async function probeUploadedImage(
  file: File,
): Promise<{ ok: true; width: number; height: number } | { ok: false; error: string }> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: `MIME 是 ${file.type || '未知'},不是 image/*` };
  }
  if (file.size > IMAGE_REF_MAX_BYTES) {
    return {
      ok: false,
      error: `文件 ${(file.size / 1024 / 1024).toFixed(1)} MB,超过 ${IMAGE_REF_MAX_BYTES / 1024 / 1024} MB 上限`,
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new window.Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () =>
          reject(
            new Error(
              '浏览器无法解码这张图(可能是 CMYK JPEG、损坏文件、或不是真正的图片)',
            ),
          );
        img.src = url;
      },
    );
    if (dims.width <= 0 || dims.height <= 0) {
      return { ok: false, error: '解码出的尺寸为 0,图片无效' };
    }
    return { ok: true, width: dims.width, height: dims.height };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    URL.revokeObjectURL(url);
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
    queued: '排队中',
    running: '生成中',
    succeeded: '已完成',
    failed: '失败',
    canceled: '已取消',
  };
  return m[s] || s;
}

export default function ImagePanel() {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [modelName, setModelName] = useState<string>();
  const [tokenId, setTokenId] = useState<number>();
  const [prompt, setPrompt] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [size, setSize] = useState<string | undefined>('1024x1024');
  const [n, setN] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<ImageTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'image' && m.enabled !== false)
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
        const t = JSON.parse(saved) as ImageTask;
        setTask(t);
        if (t.status === 'queued' || t.status === 'running') {
          startTimer(t.created_at);
          schedulePoll(t.id, 1500);
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
        // 上传前的本地预检 — 拦 CMYK JPEG / 损坏文件 / 超 25MB,
        // 避免传到后端再 HEAD 一次 / 上游再报 invalid_image_file。
        const probe = await probeUploadedImage(f);
        if (!probe.ok) {
          throw new Error(`参考图被拒:${probe.error}`);
        }
        const uploaded = await assetApi.upload(f, {
          module: 'image',
          purpose: 'image_reference',
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
    }, 200);
  };
  const stopTimer = () => {
    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const schedulePoll = (id: string, delay = 2000) => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(() => fetchOnce(id, true), delay);
  };

  const fetchOnce = async (id: string, auto = false) => {
    if (!selectedToken) return;
    if (!auto) setPolling(true);
    try {
      const res = await fetch(apiURL(`/v1/images/generations/${id}`), {
        headers: { Authorization: `Bearer ${selectedToken.key}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const msg = extractErrMsg(text, res.status);
        if (auto && isTransientPollError(res.status, msg)) {
          setErrMsg(`自动刷新暂时失败,稍后继续重试: ${msg}`);
          schedulePoll(id, 3000);
          return;
        }
        setErrMsg(msg);
        return;
      }
      const t = JSON.parse(text) as ImageTask;
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
        setErrMsg(`自动刷新暂时失败,稍后继续重试: ${msg}`);
        schedulePoll(id, 3000);
        return;
      }
      setErrMsg(msg);
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
      const body: any = {
        model: modelName,
        prompt: prompt.trim(),
        n,
        size,
      };
      const refs = referenceURLs();
      if (refs.length > 0) {
        body.images = refs;
        const assetIds = refs.map((u) => referenceImages.find((x) => x.url === u)?.assetId || 0);
        if (assetIds.some((id) => id > 0)) body.image_asset_ids = assetIds;
      }

      const res = await fetch(apiURL('/v1/images/generations/async'), {
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
      const t = JSON.parse(text) as ImageTask;
      setTask(t);
      if (t.status === 'queued' || t.status === 'running') {
        startTimer(t.created_at);
        schedulePoll(t.id, 1500);
      } else {
        stopTimer();
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
      const res = await fetch(apiURL(`/v1/images/generations/${task.id}/cancel`), {
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
  const items = task?.status === 'succeeded' ? task.data || [] : [];

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 提示词 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <PictureOutlined /> 图像生成
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
                POST /v1/images/generations/async
              </span>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>模型</div>
              <Select
                style={{ width: '100%' }}
                placeholder="选择图像模型"
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
                <div style={labelStyle}>尺寸</div>
                <Select
                  style={{ width: '100%' }}
                  value={size}
                  onChange={setSize}
                  options={SIZE_OPTIONS}
                  disabled={!!isInFlight || submitting}
                />
              </div>
              <div style={{ width: 120 }}>
                <div style={labelStyle}>张数</div>
                <Select
                  style={{ width: '100%' }}
                  value={n}
                  onChange={setN}
                  options={[1, 2, 3, 4].map((v) => ({ value: v, label: `${v} 张` }))}
                  disabled={!!isInFlight || submitting}
                />
              </div>
            </div>
            <div>
              <div style={labelStyle}>参考图(可选,图生图)</div>
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
                placeholder="例如:a watercolor painting of a cat flying over Shanghai at night"
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
                ? '提交中...'
                : isInFlight
                ? `任务进行中 · ${elapsedText}`
                : '生成图片'}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>预览</span>}
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
                image={<PictureOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={
                  <span style={{ color: '#999' }}>
                    输入提示词后点击"生成图片",结果会显示在这里
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
              description={
                <pre style={errPreStyle}>{errMsg}</pre>
              }
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
                  message="刷新暂时失败"
                  description={<pre style={errPreStyle}>{errMsg}</pre>}
                  style={{ marginBottom: 14 }}
                />
              )}

              {/* 进行中 */}
              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin
                    indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />}
                    size="large"
                  />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued' ? '任务已排队,等待上游执行' : '图像生成中'}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    已用时 <b>{elapsedText}</b> · 自动每 2 秒刷新
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    图像模型通常 3–30 秒出结果,带参考图可能更久;可离开页面稍后回来
                  </div>
                </div>
              )}

              {/* 成功 */}
              {task.status === 'succeeded' && items.length > 0 && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 12 }}>
                    ✓ 生成完成
                    {finalLatency ? ` · 用时 ${finalLatency}` : ''} · 共 {items.length} 张
                  </div>
                  <Space wrap size="middle">
                    {items.map((it, i) => {
                      const src = it.url || '';
                      if (!src) return null;
                      return (
                        <div
                          key={i}
                          style={{
                            border: '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: '#fafafa',
                          }}
                        >
                          <Image
                            src={src}
                            alt={`generated-${i}`}
                            style={{
                              maxWidth: 320,
                              maxHeight: 320,
                              display: 'block',
                            }}
                          />
                          <div
                            style={{
                              padding: '6px 10px',
                              fontSize: 12,
                              color: '#666',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span>图片 #{i + 1}</span>
                            <a
                              href={src}
                              download={`image-${task.id}-${i}.png`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#1677ff' }}
                            >
                              <DownloadOutlined /> 下载
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </Space>
                </div>
              )}

              {task.status === 'succeeded' && items.length === 0 && (
                <Alert
                  type="info"
                  showIcon
                  message="任务已完成,但后端尚未返回可访问 URL"
                  description="请稍后手动刷新一次。"
                />
              )}

              {/* 失败 */}
              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={
                    <span style={{ fontWeight: 500 }}>
                      {task.error?.code ? `${task.error.code} · ` : ''}生成失败
                    </span>
                  }
                  description={
                    <pre style={errPreStyle}>
                      {friendlyImageError(task.error?.message || '')}
                    </pre>
                  }
                />
              )}

              {task.status === 'canceled' && (
                <Alert type="warning" showIcon message="任务已取消" />
              )}

              {/* 非进行中的临时刷新报错 */}
              {errMsg && !isInFlight && (
                <Alert
                  type="error"
                  showIcon
                  closable
                  message={<pre style={errPreStyle}>{errMsg}</pre>}
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
        💡 异步任务接口 <code>/v1/images/generations/async</code>:提交后立即返回 <code>task_id</code>,
        页面每 2 秒轮询一次,可离开后回来续看。同步 <code>/v1/images/generations</code> 仍保留供 SDK 直连(无需轮询)。
      </div>

      <MediaHistoryDrawer
        kind="image"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onReuse={(t) => {
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

const errPreStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.6,
};
