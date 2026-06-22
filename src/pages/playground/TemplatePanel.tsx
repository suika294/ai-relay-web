import {
  AppstoreOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LoadingOutlined,
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
  Switch,
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

const LS_LAST_TASK = 'playground_template_last_task_v1';

// 走 /ent/v2/template 的专用虚拟模型(后端 089 迁移种子)。模版端点不收 model,
// 这个模型仅作路由/计费句柄。
const TEMPLATE_MODEL = 'vidu-template';

const { TextArea } = Input;

// 常用场景模版预设(均为已核实的真实模版 ID)。Vidu 模版库有 100+ 个且持续新增,这里只列
// 一批常用项;完整清单见官网「场景示例中心」,任何未列出的模版用下方「自定义模版 ID」输入即可。
// count 仅作软提示(建议张数),后端不按模版名强制图片数。
type TemplateDef = { value: string; label: string; count: 1 | 2 };
const TEMPLATE_PRESETS: TemplateDef[] = [
  { value: 'hugging', label: `${t('playground.template.presetHugging')} · hugging`, count: 2 },
  { value: 'french_kiss', label: `${t('playground.template.presetFrenchKiss')} · french_kiss`, count: 2 },
  { value: 'exotic_princess', label: `${t('playground.template.presetExoticPrincess')} · exotic_princess`, count: 1 },
  { value: 'beast_companion', label: `${t('playground.template.presetBeastCompanion')} · beast_companion`, count: 1 },
  { value: 'subject_3', label: `${t('playground.template.presetSubject3')} · subject_3`, count: 1 },
  { value: 'pubg_winner_hit', label: `${t('playground.template.presetPubgWinnerHit')} · pubg_winner_hit`, count: 1 },
  { value: 'simpsons_comic', label: `${t('playground.template.presetSimpsonsComic')} · simpsons_comic`, count: 1 },
  { value: 'ghibli', label: `${t('playground.template.presetGhibli')} · ghibli`, count: 1 },
  { value: 'minecraft', label: `${t('playground.template.presetMinecraft')} · minecraft`, count: 1 },
  { value: 'shake_it_down', label: `${t('playground.template.presetShakeItDown')} · shake_it_down`, count: 1 },
  { value: 'fairy_me', label: `${t('playground.template.presetFairyMe')} · fairy_me`, count: 1 },
  { value: 'love_story', label: `${t('playground.template.presetLoveStory')} · love_story`, count: 2 },
];

// Vidu 官网「场景示例中心」—— 完整模版清单与示例。
const TEMPLATE_GALLERY_URL = 'https://platform.vidu.cn/docs/templates';

// exotic_princess 专属 area 可选项(默认 auto)。
const AREA_OPTIONS = [
  'auto', 'denmark', 'uk', 'africa', 'china', 'mexico', 'switzerland',
  'russia', 'italy', 'korea', 'thailand', 'india', 'japan',
];
// beast_companion 专属 beast 可选项(默认 auto)。
const BEAST_OPTIONS = ['auto', 'bear', 'tiger', 'elk', 'snake', 'lion', 'wolf'];

const MAX_IMAGES = 3;

function presetDef(value?: string): TemplateDef | undefined {
  return TEMPLATE_PRESETS.find((t) => t.value === value);
}

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

type TemplateImage = { uid: string; url: string; name: string; assetId?: number };

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
    queued: t('playground.template.statusQueued'),
    running: t('playground.template.statusRunning'),
    succeeded: t('playground.template.statusSucceeded'),
    failed: t('playground.template.statusFailed'),
    canceled: t('playground.template.statusCanceled'),
  };
  return m[s] || s;
}

export default function TemplatePanel() {
  const intl = useIntl();
  const [hasModel, setHasModel] = useState<boolean>(true);
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [tokenId, setTokenId] = useState<number>();
  const [preset, setPreset] = useState<string>('hugging');
  const [customTemplate, setCustomTemplate] = useState<string>('');
  const [images, setImages] = useState<TemplateImage[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [bgm, setBgm] = useState<boolean>(false);
  const [area, setArea] = useState<string>('auto');
  const [beast, setBeast] = useState<string>('auto');

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  // 实际生效的模版 ID:自定义优先,否则用预设。
  const effectiveTemplate = customTemplate.trim() || preset;
  const def = presetDef(preset);
  const isExoticPrincess = effectiveTemplate === 'exotic_princess';
  const isBeastCompanion = effectiveTemplate === 'beast_companion';

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = (res.data as any[]) || [];
      setHasModel(list.some((m) => m.name === TEMPLATE_MODEL && m.enabled !== false));
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
    selectedToken.allowed_models.includes(TEMPLATE_MODEL);

  const removeImage = (uid: string) => setImages((prev) => prev.filter((x) => x.uid !== uid));

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.template.uploadImageOnly' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      if (images.length >= MAX_IMAGES) {
        message.warning(intl.formatMessage({ id: 'playground.template.maxImages' }, { max: MAX_IMAGES }));
        onSuccess?.({} as any);
        return;
      }
      setUploading(true);
      try {
        const f = file as File;
        const uploaded = await assetApi.upload(f, { module: 'i2v_input', purpose: 'i2v_reference' });
        if (uploaded.code !== 0 || !uploaded.data) {
          throw new Error(uploaded.message || intl.formatMessage({ id: 'playground.template.uploadFailed' }));
        }
        let url = uploaded.data.public_url;
        if (!url) {
          const detail = await assetApi.detail(uploaded.data.id);
          if (detail.code !== 0 || !detail.data?.url) {
            throw new Error(detail.message || intl.formatMessage({ id: 'playground.template.getAssetUrlFailed' }));
          }
          url = detail.data.url;
        }
        const assetID = uploaded.data.id;
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES || prev.some((x) => x.url === url)) return prev;
          return [
            ...prev,
            { uid: `asset-${assetID}-${Date.now()}`, assetId: assetID, url: url!, name: f.name || intl.formatMessage({ id: 'playground.template.imageDefaultName' }) },
          ];
        });
        message.success(intl.formatMessage({ id: 'playground.template.imageAdded' }));
        onSuccess?.(uploaded as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.template.uploadFailed' }));
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
          setErrMsg(intl.formatMessage({ id: 'playground.template.autoRefreshRetry' }, { msg }));
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
        setErrMsg(intl.formatMessage({ id: 'playground.template.autoRefreshRetry' }, { msg }));
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!hasModel) return message.warning(intl.formatMessage({ id: 'playground.template.modelNotFoundWarn' }, { model: TEMPLATE_MODEL }));
    if (!selectedToken) return message.warning(intl.formatMessage({ id: 'playground.template.createKeyFirst' }));
    if (!tokenAllowsModel) return message.warning(intl.formatMessage({ id: 'playground.template.keyModelRestricted' }, { model: TEMPLATE_MODEL }));
    if (!effectiveTemplate) return message.warning(intl.formatMessage({ id: 'playground.template.selectTemplateWarn' }));
    if (images.length === 0) return message.warning(intl.formatMessage({ id: 'playground.template.uploadAtLeastOne' }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = {
        model: TEMPLATE_MODEL,
        template: effectiveTemplate,
        images: images.map((x) => x.url),
        aspect_ratio: aspectRatio,
      };
      if (prompt.trim()) body.prompt = prompt.trim();
      if (bgm) body.bgm = true;
      if (isExoticPrincess && area !== 'auto') body.area = area;
      if (isBeastCompanion && beast !== 'auto') body.beast = beast;

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
  const recommendCount = def?.count;

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 模版 + 图片 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <AppstoreOutlined /> {intl.formatMessage({ id: 'playground.template.title' })}
            </span>
          }
          extra={<span style={{ color: '#888', fontSize: 12 }}>POST /v1/videos/generations</span>}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {!hasModel && (
              <Alert
                type="warning"
                showIcon
                message={intl.formatMessage({ id: 'playground.template.modelNotFound' }, { model: TEMPLATE_MODEL })}
                description={intl.formatMessage({ id: 'playground.template.modelNotFoundDesc' })}
              />
            )}
            <div>
              <div style={labelStyle}>API Key</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.template.selectApiKey' })}
                options={tokens.map((t) => ({ value: t.id, label: `${t.name} (${t.key_prefix}***)` }))}
                value={tokenId}
                onChange={setTokenId}
                disabled={locked}
              />
              {selectedToken && !tokenAllowsModel && (
                <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4 }}>
                  {intl.formatMessage({ id: 'playground.template.keyModelRestricted' }, { model: TEMPLATE_MODEL })}
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.template.sceneTemplate' })}</div>
              <Select
                style={{ width: '100%' }}
                options={TEMPLATE_PRESETS.map((t) => ({ value: t.value, label: t.label }))}
                value={preset}
                onChange={setPreset}
                disabled={locked}
                showSearch
                optionFilterProp="label"
              />
              <Input
                style={{ marginTop: 8 }}
                placeholder={intl.formatMessage({ id: 'playground.template.customTemplatePlaceholder' })}
                value={customTemplate}
                onChange={(e) => setCustomTemplate(e.target.value)}
                disabled={locked}
                allowClear
              />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                {intl.formatMessage({ id: 'playground.template.galleryHintPrefix' })}{' '}
                <a href={TEMPLATE_GALLERY_URL} target="_blank" rel="noreferrer">
                  {intl.formatMessage({ id: 'playground.template.galleryCenter' })}
                </a>
                {intl.formatMessage({ id: 'playground.template.galleryHintSuffix' })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.template.aspectRatio' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  options={[
                    { value: '16:9', label: intl.formatMessage({ id: 'playground.template.aspect169' }) },
                    { value: '9:16', label: intl.formatMessage({ id: 'playground.template.aspect916' }) },
                  ]}
                  disabled={locked}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <Space>
                  <span style={{ fontSize: 13, color: '#555' }}>{intl.formatMessage({ id: 'playground.template.bgm' })}</span>
                  <Switch checked={bgm} onChange={setBgm} disabled={locked} />
                </Space>
              </div>
            </div>
            {isExoticPrincess && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.template.areaLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={area}
                  onChange={setArea}
                  options={AREA_OPTIONS.map((a) => ({ value: a, label: a }))}
                  disabled={locked}
                  showSearch
                />
              </div>
            )}
            {isBeastCompanion && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.template.beastLabel' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={beast}
                  onChange={setBeast}
                  options={BEAST_OPTIONS.map((b) => ({ value: b, label: b }))}
                  disabled={locked}
                  showSearch
                />
              </div>
            )}
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.template.promptLabel' })}</div>
              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={intl.formatMessage({ id: 'playground.template.promptPlaceholder' })}
                autoSize={{ minRows: 2, maxRows: 4 }}
                disabled={locked}
                maxLength={2000}
              />
            </div>
            <div>
              <div style={labelStyle}>
                {intl.formatMessage({ id: 'playground.template.imagesLabel' }, { count: images.length, max: MAX_IMAGES })}
                {recommendCount && (
                  <span style={{ color: '#888', fontWeight: 400 }}>
                    {' '}
                    {intl.formatMessage({ id: 'playground.template.recommendCount' }, { count: recommendCount })}
                    {recommendCount === 2 ? intl.formatMessage({ id: 'playground.template.duoHint' }) : ''}
                  </span>
                )}
              </div>
              <Upload {...uploadProps} disabled={locked || images.length >= MAX_IMAGES}>
                <Button icon={<UploadOutlined />} loading={uploading} disabled={locked || images.length >= MAX_IMAGES}>
                  {intl.formatMessage({ id: 'playground.template.uploadImage' })}
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
                ? intl.formatMessage({ id: 'playground.template.submitting' })
                : isInFlight
                ? intl.formatMessage({ id: 'playground.template.taskInProgress' }, { elapsed: elapsedText })
                : intl.formatMessage({ id: 'playground.template.generateBtn' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.template.taskProgress' })}</span>}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <>
                    <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => fetchOnce(task.id)}>
                      {intl.formatMessage({ id: 'playground.template.refresh' })}
                    </Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={cancel}>
                      {intl.formatMessage({ id: 'playground.template.cancelBtn' })}
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.template.clear' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty
                image={<AppstoreOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.template.emptyHint' })}</span>}
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.template.submitFailed' })} description={errMsg} style={{ marginTop: 4 }} />
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
                <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.template.refreshTempFailed' })} description={errMsg} style={{ marginBottom: 14 }} />
              )}

              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} size="large" />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.template.queuedHint' })
                      : intl.formatMessage({ id: 'playground.template.generatingHint' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage(
                      { id: 'playground.template.elapsedHint' },
                      { elapsed: <b key="e">{elapsedText}</b> },
                    )}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.template.durationHint' })}
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && videoURL && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    ✓ {intl.formatMessage({ id: 'playground.template.generateDone' })}
                    {finalLatency ? intl.formatMessage({ id: 'playground.template.latencySuffix' }, { latency: finalLatency }) : ''}
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
                      download={browserDownloadName(videoURL, `template-${task.id}.mp4`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button icon={<DownloadOutlined />}>{intl.formatMessage({ id: 'playground.template.downloadVideo' })}</Button>
                    </a>
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && !videoURL && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.template.videoDoneWaitUrl' })}
                  description={intl.formatMessage({ id: 'playground.template.videoDoneWaitUrlDesc' })}
                />
              )}

              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.template.generateFailed' })}
                  description={task.error?.code ? intl.formatMessage({ id: 'playground.template.errorCode' }, { code: task.error.code }) : undefined}
                />
              )}

              {task.status === 'canceled' && <Alert type="warning" showIcon message={intl.formatMessage({ id: 'playground.template.taskCanceled' })} />}

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
        💡 {intl.formatMessage({ id: 'playground.template.footerPrefix' })}{' '}
        <a href={TEMPLATE_GALLERY_URL} target="_blank" rel="noreferrer">
          {intl.formatMessage({ id: 'playground.template.galleryCenter' })}
        </a>
        {intl.formatMessage({ id: 'playground.template.footerSuffix' })}
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
