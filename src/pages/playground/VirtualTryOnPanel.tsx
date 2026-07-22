import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HistoryOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SendOutlined,
  SkinOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Image,
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
import { t } from '@/utils/i18n';
import { systemApi } from '@/services/api';
import { browserDownloadName, publicMediaURL } from '@/utils/media';
import { apiURL } from '@/utils/request';
import ApiKeyField from './ApiKeyField';
import MediaHistoryDrawer from './MediaHistoryDrawer';
import { usePlaygroundApiKey } from './apiKeyStore';
import { playgroundUpload } from './upload';

const LS_LAST_TASK = 'playground_virtual_tryon_last_task_v2';

function extractErrMsg(raw: string, httpStatus: number): string {
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.message || raw.slice(0, 500);
  } catch {
    return raw ? raw.slice(0, 500) : `HTTP ${httpStatus}`;
  }
}

// isSupportedTryOnImage 判定上传文件是否为腾讯换装稳定支持的图片格式(JPG/PNG/WEBP/BMP)。
// HEIC/AVIF/TIFF/GIF 等先拦下,提示用户转成 JPG/PNG。
function isSupportedTryOnImage(file: { name?: string; type?: string }): boolean {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  const badExt = ['.heic', '.heif', '.avif', '.tif', '.tiff', '.gif'];
  if (badExt.some((e) => name.endsWith(e))) return false;
  const okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
  // file.type 为空时(部分浏览器对 HEIC 不给 MIME)只靠扩展名兜底:必须是已知良好扩展名。
  if (!type) {
    return ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].some((e) => name.endsWith(e));
  }
  return okTypes.includes(type);
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

type TryOnImage = { uid: string; url: string; name: string; assetId?: number };

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
    queued: t('playground.virtualTryOn.statusQueued'),
    running: t('playground.virtualTryOn.statusRunning'),
    succeeded: t('playground.virtualTryOn.statusSucceeded'),
    failed: t('playground.virtualTryOn.statusFailed'),
    canceled: t('playground.virtualTryOn.statusCanceled'),
  };
  return m[s] || s;
}

export default function VirtualTryOnPanel() {
  const intl = useIntl();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const { apiKey } = usePlaygroundApiKey();
  const [modelName, setModelName] = useState<string>();
  const [human, setHuman] = useState<TryOnImage | null>(null);
  const [cloth, setCloth] = useState<TryOnImage | null>(null); // 上衣
  const [clothLower, setClothLower] = useState<TryOnImage | null>(null); // 下装
  const [clothDress, setClothDress] = useState<TryOnImage | null>(null); // 连衣裙(与上衣/下装互斥)
  const hasUpperLower = !!cloth || !!clothLower;
  const hasDress = !!clothDress;

  const [submitting, setSubmitting] = useState(false);
  const [uploadingHuman, setUploadingHuman] = useState(false);
  const [uploadingCloth, setUploadingCloth] = useState(false);
  const [uploadingClothLower, setUploadingClothLower] = useState(false);
  const [uploadingClothDress, setUploadingClothDress] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    systemApi.models().then((res) => {
      // 换装走腾讯云 aiart ChangeClothes(同步图片任务),按模型名过滤,避免误选其它图片厂商。
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'image' && m.enabled !== false && /change-clothes/i.test(m.name))
        .map((m) => ({ value: m.name, label: m.display_name || m.name }));
      setModels(list);
      if (list.length > 0) setModelName((prev) => prev ?? list[0].value);
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

  const makeUploadProps = (
    setImage: (img: TryOnImage | null) => void,
    setUploading: (b: boolean) => void,
    label: string,
  ): UploadProps => ({
    accept: '.jpg,.jpeg,.png,.webp,.bmp,image/jpeg,image/png,image/webp,image/bmp',
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.virtualTryOn.uploadImageOnly' }));
        return Upload.LIST_IGNORE;
      }
      // 腾讯换装上游只稳定支持 JPG/PNG(及 WEBP/BMP);HEIC/AVIF/TIFF/GIF 等先拦下,
      // 避免传上去再被上游拒。按扩展名 + MIME 双重判断(HEIC 在部分浏览器 file.type 为空)。
      if (!isSupportedTryOnImage(file)) {
        message.warning(intl.formatMessage({ id: 'playground.virtualTryOn.uploadFormatWarn' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploading(true);
      try {
        const f = file as File;
        const { url, id: assetID } = await playgroundUpload(f, apiKey, { module: 'i2v_input', purpose: 'i2v_reference' });
        setImage({ uid: `asset-${assetID}-${Date.now()}`, assetId: assetID, url, name: f.name || label });
        message.success(intl.formatMessage({ id: 'playground.virtualTryOn.imageAdded' }, { label }));
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.virtualTryOn.uploadFailed' }));
        onError?.(e);
      } finally {
        setUploading(false);
      }
    },
  });

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
      const res = await fetch(apiURL(`/v1/images/generations/${id}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const msg = extractErrMsg(text, res.status);
        if (auto && isTransientPollError(res.status, msg)) {
          setErrMsg(intl.formatMessage({ id: 'playground.virtualTryOn.autoRefreshFailed' }, { msg }));
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
        setErrMsg(intl.formatMessage({ id: 'playground.virtualTryOn.autoRefreshFailed' }, { msg }));
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.virtualTryOn.selectModelWarn' }));
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
    if (!human) return message.warning(intl.formatMessage({ id: 'playground.virtualTryOn.uploadHumanWarn' }));
    if (!cloth && !clothLower && !clothDress) return message.warning(intl.formatMessage({ id: 'playground.virtualTryOn.uploadClothWarn' }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      // 换装走图片管线:images[0]=模特图、其后是服装图;clothes_type 由「放了哪个格子」自动推导:
      //   只放上衣 → Upper-body;只放下装 → Lower-body;上衣+下装都放 → Upper-Lower(后端链式两次换装)。
      // image_asset_ids 与 images 同序对齐,便于后端把上传素材转成公网可达 URL。
      let clothesType: string;
      let tiles: TryOnImage[];
      if (clothDress) {
        // 连衣裙单件,与上衣/下装互斥(UI 已禁用对方)。
        clothesType = 'Dress';
        tiles = [human, clothDress];
      } else if (cloth && clothLower) {
        clothesType = 'Upper-Lower';
        tiles = [human, cloth, clothLower];
      } else if (cloth) {
        clothesType = 'Upper-body';
        tiles = [human, cloth];
      } else {
        clothesType = 'Lower-body';
        tiles = [human, clothLower!];
      }
      const body: any = {
        model: modelName,
        images: tiles.map((x) => x.url),
        clothes_type: clothesType,
      };
      const assetIds = tiles.map((x) => x.assetId || 0);
      if (assetIds.some((id) => id > 0)) body.image_asset_ids = assetIds;

      const res = await fetch(apiURL('/v1/images/generations/async'), {
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
      const res = await fetch(apiURL(`/v1/images/generations/${task.id}/cancel`), {
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
    task?.completed_at && task?.created_at ? `${task.completed_at - task.created_at}s` : undefined;
  const resultURL = publicMediaURL(task?.data?.[0]?.url);
  const locked = !!isInFlight || submitting;

  const slot = (
    img: TryOnImage | null,
    setImage: (i: TryOnImage | null) => void,
    uploading: boolean,
    setUploading: (b: boolean) => void,
    label: string,
    extraDisabled = false,
  ) => (
    <div style={{ flex: 1 }}>
      <div style={labelStyle}>{label}</div>
      {img ? (
        <div style={referenceTileStyle}>
          <Image
            src={img.url}
            alt={img.name}
            width={120}
            height={120}
            style={{ objectFit: 'cover', display: 'block' }}
            preview={{ src: img.url }}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setImage(null)}
            disabled={locked}
            style={referenceDeleteStyle}
          />
        </div>
      ) : (
        <Upload {...makeUploadProps(setImage, setUploading, label)} disabled={locked || extraDisabled}>
          <Button icon={<UploadOutlined />} loading={uploading} disabled={locked || extraDisabled} style={{ width: 120, height: 120 }}>
            {intl.formatMessage({ id: 'playground.virtualTryOn.uploadLabel' }, { label })}
          </Button>
        </Upload>
      )}
    </div>
  );

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 人像 + 服装 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <SkinOutlined /> {intl.formatMessage({ id: 'playground.virtualTryOn.title' })}
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
                {intl.formatMessage({ id: 'playground.image.history' })}
              </Button>
              <span style={{ color: '#888', fontSize: 12 }}>POST /v1/images/generations</span>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.virtualTryOn.modelLabel' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.virtualTryOn.modelPlaceholder' })}
                options={models}
                value={modelName}
                onChange={setModelName}
                showSearch
                optionFilterProp="label"
                disabled={locked}
                notFoundContent={intl.formatMessage({ id: 'playground.virtualTryOn.noModelAvailable' })}
              />
            </div>
            <ApiKeyField />
            <div style={{ color: '#888', fontSize: 12, marginTop: -4 }}>
              {intl.formatMessage({ id: 'playground.virtualTryOn.slotsHint' })}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {slot(human, setHuman, uploadingHuman, setUploadingHuman, intl.formatMessage({ id: 'playground.virtualTryOn.humanImage' }))}
              {slot(cloth, setCloth, uploadingCloth, setUploadingCloth, intl.formatMessage({ id: 'playground.virtualTryOn.upperImage' }), hasDress)}
              {slot(clothLower, setClothLower, uploadingClothLower, setUploadingClothLower, intl.formatMessage({ id: 'playground.virtualTryOn.lowerImage' }), hasDress)}
              {slot(clothDress, setClothDress, uploadingClothDress, setUploadingClothDress, intl.formatMessage({ id: 'playground.virtualTryOn.dressImage' }), hasUpperLower)}
            </div>
            <Button
              type="primary"
              size="large"
              block
              icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
              onClick={submit}
              loading={submitting}
              disabled={!modelName || !apiKey || !!isInFlight || !human || (!cloth && !clothLower && !clothDress)}
            >
              {submitting
                ? intl.formatMessage({ id: 'playground.virtualTryOn.submitting' })
                : isInFlight
                ? intl.formatMessage({ id: 'playground.virtualTryOn.taskInProgress' }, { elapsed: elapsedText })
                : intl.formatMessage({ id: 'playground.virtualTryOn.submitBtn' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.virtualTryOn.taskProgress' })}</span>}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <>
                    <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => fetchOnce(task.id)}>
                      {intl.formatMessage({ id: 'playground.virtualTryOn.refresh' })}
                    </Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={cancel}>
                      {intl.formatMessage({ id: 'common.cancel' })}
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.virtualTryOn.clear' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty
                image={<SkinOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.virtualTryOn.emptyDesc' })}</span>}
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.virtualTryOn.submitFailed' })} description={errMsg} style={{ marginTop: 4 }} />
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
                <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.virtualTryOn.refreshFailedTemp' })} description={errMsg} style={{ marginBottom: 14 }} />
              )}

              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} size="large" />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.virtualTryOn.queuedHint' })
                      : intl.formatMessage({ id: 'playground.virtualTryOn.runningHint' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage(
                      { id: 'playground.virtualTryOn.elapsedAutoRefresh' },
                      { elapsed: <b key="e">{elapsedText}</b> },
                    )}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.virtualTryOn.durationHint' })}
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && resultURL && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    ✓ {intl.formatMessage({ id: 'playground.virtualTryOn.generateDone' })}
                    {finalLatency
                      ? ` · ${intl.formatMessage({ id: 'playground.virtualTryOn.latencyLabel' }, { latency: finalLatency })}`
                      : ''}
                  </div>
                  <Image
                    src={resultURL}
                    alt="virtual try-on result"
                    style={{ width: '100%', borderRadius: 10, background: '#000' }}
                    preview={{ src: resultURL }}
                  />
                  <div style={{ marginTop: 10, textAlign: 'right' }}>
                    <a
                      href={resultURL}
                      download={browserDownloadName(resultURL, `tryon-${task.id}.png`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.virtualTryOn.downloadImage' })}</Button>
                    </a>
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && !resultURL && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.virtualTryOn.waitingUrlTitle' })}
                  description={intl.formatMessage({ id: 'playground.virtualTryOn.waitingUrlDesc' })}
                />
              )}

              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.virtualTryOn.generateFailed' })}
                  description={
                    task.error?.code
                      ? intl.formatMessage({ id: 'playground.virtualTryOn.errorCode' }, { code: task.error.code })
                      : undefined
                  }
                />
              )}

              {task.status === 'canceled' && <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.virtualTryOn.taskCanceled' })} />}

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
        💡 {intl.formatMessage({ id: 'playground.virtualTryOn.bottomTip' })}
      </div>

      <MediaHistoryDrawer
        kind="image"
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

const referenceTileStyle: React.CSSProperties = {
  position: 'relative',
  width: 120,
  height: 120,
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
