import {
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
import { assetApi, systemApi, tokenApi } from '@/services/api';
import { t } from '@/utils/i18n';
import { browserDownloadName, publicMediaURL } from '@/utils/media';
import { apiURL } from '@/utils/request';

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
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [modelName, setModelName] = useState<string>();
  const [tokenId, setTokenId] = useState<number>();

  const [prompt, setPrompt] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [imageAssetID, setImageAssetID] = useState<number>();
  const [previewURL, setPreviewURL] = useState('');
  const [resultFormat, setResultFormat] = useState<string>();
  const [enablePBR, setEnablePBR] = useState(true);
  const [modelVersion, setModelVersion] = useState<string>('3.0');
  const [faceCount, setFaceCount] = useState<number | undefined>(500000);
  const [generateType, setGenerateType] = useState<string | undefined>('Normal');
  const [polygonType, setPolygonType] = useState<string | undefined>();
  const [enableGeometry, setEnableGeometry] = useState(false);

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
    tokenApi.list().then((res) => {
      const list = ((res.data as API.Token[]) || []).filter((t) => t.status === 1);
      setTokens(list);
      if (list.length > 0) setTokenId((prev) => prev ?? list[0].id);
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
  }, [modelName]);

  const selectedToken = tokens.find((t) => t.id === tokenId);
  const tokenAllowsModel =
    !selectedToken?.allowed_models?.length ||
    selectedToken.allowed_models.includes(modelName || '');
  const pro = isProModel(modelName);
  const tripo = isTripoModel(modelName);
  const volc3d = isVolcArk3DModel(modelName);
  const imageRequired = requiresImageInput(modelName);
  const proVersion = fixedProVersion(modelName) || modelVersion;
  const hasImageInput = !!imageURL.trim() || !!imageAssetID;

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
        const uploaded = await assetApi.upload(f, {
          module: 'model3d',
          purpose: '3d_input',
        });
        if (uploaded.code !== 0 || !uploaded.data) {
          throw new Error(uploaded.message || intl.formatMessage({ id: 'playground.threeD.uploadFailed' }));
        }
        let url = uploaded.data.public_url;
        if (!url) {
          const detail = await assetApi.detail(uploaded.data.id);
          if (detail.code !== 0 || !detail.data?.url) {
            throw new Error(detail.message || intl.formatMessage({ id: 'playground.threeD.getAssetUrlFailed' }));
          }
          url = detail.data.url;
        }
        setImageAssetID(uploaded.data.id);
        setImageURL('');
        if (!isVolcArk3DModel(modelName)) setPrompt('');
        setPreviewURL(url);
        message.success(intl.formatMessage({ id: 'playground.threeD.inputImageUploaded' }));
        onSuccess?.(uploaded as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.threeD.uploadFailed' }));
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
      const res = await fetch(apiURL(`/v1/3d/generations/${id}`), {
        headers: { Authorization: `Bearer ${selectedToken.key}` },
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
    if (!selectedToken) return message.warning(intl.formatMessage({ id: 'playground.threeD.createKeyWarn' }));
    if (!prompt.trim() && !hasImageInput)
      return message.warning(intl.formatMessage({ id: 'playground.threeD.promptOrImageWarn' }));
    if (imageRequired && !hasImageInput)
      return message.warning(intl.formatMessage({ id: 'playground.threeD.modelRequiresImageWarn' }, { model: modelName }));
    if (prompt.trim() && hasImageInput && !volc3d)
      return message.warning(intl.formatMessage({ id: 'playground.threeD.promptImageExclusiveWarn' }));
    if (!tokenAllowsModel)
      return message.warning(intl.formatMessage({ id: 'playground.threeD.keyModelRestrictedWarn' }, { model: modelName }));

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = {
        model: modelName,
        result_format: resultFormat,
        enable_pbr: enablePBR,
      };
      if (!hasImageInput || volc3d) {
        body.prompt = prompt.trim();
      }
      if (imageAssetID) {
        body.images = [imageAssetID];
      } else if (imageURL.trim()) {
        body.images = [imageURL.trim()];
      }
      if (pro) {
        if (proVersion) body.model_version = proVersion;
        if (faceCount) body.face_count = faceCount;
        if (generateType) body.generate_type = generateType;
        if (polygonType) body.polygon_type = polygonType;
      } else if (!tripo && enableGeometry) {
        body.enable_geometry = true;
      }

      const res = await fetch(apiURL('/v1/3d/generations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedToken.key}`,
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

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.threeD.title' })}</span>}
          extra={<span style={{ color: '#888', fontSize: 12 }}>POST /v1/3d/generations</span>}
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
            <div>
              <div style={labelStyle}>API Key</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.threeD.selectKeyPlaceholder' })}
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
                  {intl.formatMessage({ id: 'playground.threeD.keyModelRestrictedWarn' }, { model: modelName })}
                </div>
              )}
            </div>
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
            ) : !tripo ? (
              <Checkbox
                checked={enableGeometry}
                onChange={(e) => setEnableGeometry(e.target.checked)}
                disabled={!!isInFlight || submitting}
              >
                {intl.formatMessage({ id: 'playground.threeD.rapidWhiteModel' })}
              </Checkbox>
            ) : null}
            <Button
              type="primary"
              size="large"
              block
              icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
              onClick={submit}
              loading={submitting}
              disabled={!modelName || !selectedToken || !!isInFlight || (!prompt.trim() && !hasImageInput)}
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
                  {taskPreviewURL && (
                    <Image
                      src={taskPreviewURL}
                      width="100%"
                      style={{ maxHeight: 320, objectFit: 'contain', borderRadius: 10, background: '#fafafa' }}
                    />
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
