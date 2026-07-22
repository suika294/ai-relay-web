import {
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  HistoryOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SendOutlined,
  ThunderboltOutlined,
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
import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { t } from '@/utils/i18n';
import { systemApi } from '@/services/api';
import { browserDownloadName, publicMediaURL } from '@/utils/media';
import { apiURL } from '@/utils/request';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';
import MediaHistoryDrawer from './MediaHistoryDrawer';
import { playgroundUpload } from './upload';

const LS_LAST_TASK = 'playground_effects_last_task_v1';

// 可灵开发者 API 完整特效清单(与官方 ComfyUI SDK 写死的 effect_scene 列表一致 ——
// 开发者 API 没有「特效目录」端点,官方自己也是硬编码这份清单)。count=2 的是双人
// 特效(input.images,需 2 张含人脸的人像,第 1 张在左、第 2 张在右),其余皆单图
// (input.image,1 张)。后端按图片数量自动判定形态,任意 effect_scene 都能转发。
type EffectDef = { value: string; count: 1 | 2 };

// 双人特效(需 2 图)。注意 fight 官方仅支持 kling-v1-6,后端已强制覆盖 model_name。
const DUAL_SCENES = new Set(['hug', 'kiss', 'heart_gesture', 'fight']);

// 官方完整 effect_scene 清单(顺序沿用官方 SDK)。注意 let's_ride 用的是弯引号 ’(U+2019),
// 必须与上游一致。
const EFFECT_SCENES: string[] = [
  'baseball', 'inner_voice', 'a_list_look', 'memory_alive', 'trampoline', 'trampoline_night',
  'pucker_up', 'guess_what', 'feed_mooncake', 'rampage_ape', 'flyer', 'dishwasher',
  'pet_chinese_opera', 'magic_fireball', 'gallery_ring', 'pet_moto_rider', 'muscle_pet',
  'squeeze_scream', 'pet_delivery', 'running_man', 'disappear', 'mythic_style', 'steampunk',
  'c4d_cartoon', '3d_cartoon_1', '3d_cartoon_2', 'eagle_snatch', 'hug_from_past', 'firework',
  'media_interview', 'pet_lion', 'pet_chef', 'santa_gifts', 'santa_hug', 'girlfriend', 'boyfriend',
  'heart_gesture_1', 'pet_wizard', 'smoke_smoke', 'thumbs_up', 'instant_kid', 'dollar_rain',
  'cry_cry', 'building_collapse', 'gun_shot', 'mushroom', 'double_gun', 'pet_warrior',
  'lightning_power', 'jesus_hug', 'shark_alert', 'long_hair', 'lie_flat', 'polar_bear_hug',
  'brown_bear_hug', 'jazz_jazz', 'office_escape_plow', 'fly_fly', 'watermelon_bomb', 'pet_dance',
  'boss_coming', 'wool_curly', 'pet_bee', 'marry_me', 'swing_swing', 'day_to_night', 'piggy_morph',
  'wig_out', 'car_explosion', 'ski_ski', 'tiger_hug', 'siblings', 'construction_worker',
  'let’s_ride', 'snatched', 'magic_broom', 'felt_felt', 'jumpdrop', 'celebration', 'splashsplash',
  'surfsurf', 'fairy_wing', 'angel_wing', 'dark_wing', 'skateskate', 'plushcut', 'jelly_press',
  'jelly_slice', 'jelly_squish', 'jelly_jiggle', 'pixelpixel', 'yearbook', 'instant_film',
  'anime_figure', 'rocketrocket', 'bloombloom', 'dizzydizzy', 'fuzzyfuzzy', 'squish', 'expansion',
  'hug', 'kiss', 'heart_gesture', 'fight',
];

// 常用特效的中文名(只覆盖一部分,其余按 effect_scene 原名展示)。
// 用函数返回,确保切换语言时实时取最新文案。
const EFFECT_LABEL_KEYS: Record<string, string> = {
  squish: 'playground.effects.label.squish',
  expansion: 'playground.effects.label.expansion',
  fuzzyfuzzy: 'playground.effects.label.fuzzyfuzzy',
  bloombloom: 'playground.effects.label.bloombloom',
  dizzydizzy: 'playground.effects.label.dizzydizzy',
  hug: 'playground.effects.label.hug',
  kiss: 'playground.effects.label.kiss',
  heart_gesture: 'playground.effects.label.heartGesture',
  fight: 'playground.effects.label.fight',
  rocketrocket: 'playground.effects.label.rocketrocket',
  pixelpixel: 'playground.effects.label.pixelpixel',
  yearbook: 'playground.effects.label.yearbook',
  anime_figure: 'playground.effects.label.animeFigure',
  instant_film: 'playground.effects.label.instantFilm',
  jelly_squish: 'playground.effects.label.jellySquish',
  firework: 'playground.effects.label.firework',
  dollar_rain: 'playground.effects.label.dollarRain',
  marry_me: 'playground.effects.label.marryMe',
  day_to_night: 'playground.effects.label.dayToNight',
  long_hair: 'playground.effects.label.longHair',
  cry_cry: 'playground.effects.label.cryCry',
  thumbs_up: 'playground.effects.label.thumbsUp',
};

function sceneCount(scene: string): 1 | 2 {
  return DUAL_SCENES.has(scene) ? 2 : 1;
}

function sceneLabel(scene: string): string {
  const key = EFFECT_LABEL_KEYS[scene];
  const human = scene.replace(/_/g, ' ');
  return key ? `${t(key)} · ${scene}` : human;
}

const EFFECT_OPTIONS = () => [
  {
    label: t('playground.effects.group.dual'),
    options: EFFECT_SCENES.filter((s) => DUAL_SCENES.has(s)).map((s) => ({ value: s, label: sceneLabel(s) })),
  },
  {
    label: t('playground.effects.group.single', {
      count: EFFECT_SCENES.filter((s) => !DUAL_SCENES.has(s)).length,
    }),
    options: EFFECT_SCENES.filter((s) => !DUAL_SCENES.has(s)).map((s) => ({ value: s, label: sceneLabel(s) })),
  },
];

function effectDef(scene?: string): EffectDef {
  const value = scene && EFFECT_SCENES.includes(scene) ? scene : 'squish';
  return { value, count: sceneCount(value) };
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

type EffectImage = { uid: string; url: string; name: string; assetId?: number };

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
    queued: t('playground.effects.status.queued'),
    running: t('playground.effects.status.running'),
    succeeded: t('playground.effects.status.succeeded'),
    failed: t('playground.effects.status.failed'),
    canceled: t('playground.effects.status.canceled'),
  };
  return m[s] || s;
}

export default function EffectsPanel() {
  const intl = useIntl();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const { apiKey } = usePlaygroundApiKey();
  const [modelName, setModelName] = useState<string>();
  const [effectScene, setEffectScene] = useState<string>('squish');
  const [images, setImages] = useState<EffectImage[]>([]);
  const [duration, setDuration] = useState<number>(5);
  const [mode, setMode] = useState<string>('std');

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<VideoTask | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  const def = effectDef(effectScene);
  const isDual = def.count === 2;

  useEffect(() => {
    systemApi.models().then((res) => {
      // 视频特效仅可灵支持,按模型名过滤,避免误选其它视频厂商提交后报错。
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'video' && m.enabled !== false && /kling/i.test(m.name))
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

  // 切换特效时,若新特效需要的图片更少,裁掉多余的图(单图特效只留第一张)。
  useEffect(() => {
    setImages((prev) => (prev.length > def.count ? prev.slice(0, def.count) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectScene]);

  const removeImage = (uid: string) => setImages((prev) => prev.filter((x) => x.uid !== uid));

  const uploadProps: UploadProps = {
    accept: 'image/*',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.warning(intl.formatMessage({ id: 'playground.effects.upload.imageOnly' }));
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      if (images.length >= def.count) {
        message.warning(intl.formatMessage({ id: 'playground.effects.upload.maxImages' }, { count: def.count }));
        onSuccess?.({} as any);
        return;
      }
      setUploading(true);
      try {
        const f = file as File;
        const { url, id: assetID } = await playgroundUpload(f, apiKey, { module: 'i2v_input', purpose: 'i2v_reference' });
        setImages((prev) => {
          if (prev.length >= def.count || prev.some((x) => x.url === url)) return prev;
          return [
            ...prev,
            {
              uid: `asset-${assetID}-${Date.now()}`,
              assetId: assetID,
              url,
              name: f.name || intl.formatMessage({ id: 'playground.effects.portrait' }),
            },
          ];
        });
        message.success(intl.formatMessage({ id: 'playground.effects.upload.added' }));
        onSuccess?.({} as any);
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.effects.upload.failed' }));
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
          setErrMsg(intl.formatMessage({ id: 'playground.effects.poll.transientFail' }, { msg }));
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
        setErrMsg(intl.formatMessage({ id: 'playground.effects.poll.transientFail' }, { msg }));
        schedulePoll(id);
        return;
      }
      setErrMsg(msg);
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.effects.warn.selectModel' }));
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
    if (images.length !== def.count) {
      return message.warning(
        intl.formatMessage(
          { id: 'playground.effects.warn.needPortraits' },
          { scene: sceneLabel(effectScene), count: def.count, current: images.length },
        ),
      );
    }

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);
    stopTimer();

    try {
      const body: any = {
        task_type: 'effects',
        model: modelName,
        effect_scene: effectScene,
        images: images.map((x) => x.url),
        duration,
      };
      if (isDual) body.mode = mode;

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
    task?.completed_at && task?.created_at ? `${task.completed_at - task.created_at}s` : undefined;
  const videoURL = publicMediaURL(task?.data?.[0]?.url);
  const locked = !!isInFlight || submitting;

  return (
    <div style={{ padding: '8px 8px 32px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 左侧:参数 + 特效 + 人像 + 提交 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={
            <span>
              <ThunderboltOutlined /> {intl.formatMessage({ id: 'playground.effects.title' })}
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
              <span style={{ color: '#888', fontSize: 12 }}>POST /v1/videos/generations</span>
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div style={labelStyle}>{intl.formatMessage({ id: 'playground.effects.field.model' })}</div>
              <Select
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.effects.placeholder.model' })}
                options={models}
                value={modelName}
                onChange={setModelName}
                showSearch
                optionFilterProp="label"
                disabled={locked}
                notFoundContent={intl.formatMessage({ id: 'playground.effects.notFound.model' })}
              />
            </div>
            <ApiKeyField />
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.effects.field.effect' })}</div>
                <Select
                  style={{ width: '100%' }}
                  options={EFFECT_OPTIONS()}
                  value={effectScene}
                  onChange={setEffectScene}
                  disabled={locked}
                  showSearch
                  optionFilterProp="label"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.effects.field.duration' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={duration}
                  onChange={setDuration}
                  options={[
                    { value: 5, label: intl.formatMessage({ id: 'playground.effects.duration.5s' }) },
                    { value: 10, label: intl.formatMessage({ id: 'playground.effects.duration.10s' }) },
                  ]}
                  disabled={locked}
                />
              </div>
            </div>
            {isDual && (
              <div>
                <div style={labelStyle}>{intl.formatMessage({ id: 'playground.effects.field.mode' })}</div>
                <Select
                  style={{ width: '100%' }}
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'std', label: intl.formatMessage({ id: 'playground.effects.mode.std' }) },
                    { value: 'pro', label: intl.formatMessage({ id: 'playground.effects.mode.pro' }) },
                  ]}
                  disabled={locked}
                />
              </div>
            )}
            <div>
              <div style={labelStyle}>
                {intl.formatMessage(
                  { id: 'playground.effects.field.portraits' },
                  { current: images.length, count: def.count },
                )}
                {isDual && (
                  <span style={{ color: '#888', fontWeight: 400 }}>
                    {' '}
                    {intl.formatMessage({ id: 'playground.effects.portraitOrder' })}
                  </span>
                )}
              </div>
              <Upload {...uploadProps} disabled={locked || images.length >= def.count}>
                <Button icon={<UploadOutlined />} loading={uploading} disabled={locked || images.length >= def.count}>
                  {intl.formatMessage({ id: 'playground.effects.uploadPortrait' })}
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
                      {isDual && (
                        <span style={referenceBadgeStyle}>
                          {idx === 0
                            ? intl.formatMessage({ id: 'playground.effects.badge.left' })
                            : intl.formatMessage({ id: 'playground.effects.badge.right' })}
                        </span>
                      )}
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
              disabled={!modelName || !apiKey || !!isInFlight || images.length !== def.count}
            >
              {submitting
                ? intl.formatMessage({ id: 'playground.effects.btn.submitting' })
                : isInFlight
                  ? intl.formatMessage({ id: 'playground.effects.btn.inFlight' }, { elapsed: elapsedText })
                  : intl.formatMessage({ id: 'playground.effects.btn.generate' })}
            </Button>
          </Space>
        </Card>

        {/* 右侧:任务进度 + 结果 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>{intl.formatMessage({ id: 'playground.effects.taskProgress' })}</span>}
          extra={
            task ? (
              <Space size="small">
                {isInFlight && (
                  <>
                    <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => fetchOnce(task.id)}>
                      {intl.formatMessage({ id: 'playground.effects.btn.refresh' })}
                    </Button>
                    <Button size="small" danger icon={<CloseCircleOutlined />} onClick={cancel}>
                      {intl.formatMessage({ id: 'common.cancel' })}
                    </Button>
                  </>
                )}
                {!isInFlight && (
                  <Button size="small" onClick={reset}>
                    {intl.formatMessage({ id: 'playground.effects.btn.clear' })}
                  </Button>
                )}
              </Space>
            ) : null
          }
        >
          {!task && !errMsg && (
            <div style={placeholderWrap}>
              <Empty
                image={<ThunderboltOutlined style={{ fontSize: 48, color: '#ccc' }} />}
                imageStyle={{ height: 60 }}
                description={
                  <span style={{ color: '#999' }}>
                    {intl.formatMessage({ id: 'playground.effects.empty.desc' })}
                  </span>
                }
              />
            </div>
          )}

          {errMsg && !task && (
            <Alert
              type="error"
              showIcon
              message={intl.formatMessage({ id: 'playground.effects.alert.submitFailed' })}
              description={errMsg}
              style={{ marginTop: 4 }}
            />
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
                <Alert
                  type="warning"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.effects.alert.refreshFailed' })}
                  description={errMsg}
                  style={{ marginBottom: 14 }}
                />
              )}

              {isInFlight && (
                <div style={placeholderWrap}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} size="large" />
                  <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                    {task.status === 'queued'
                      ? intl.formatMessage({ id: 'playground.effects.progress.queued' })
                      : intl.formatMessage({ id: 'playground.effects.progress.running' })}
                  </div>
                  <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                    {intl.formatMessage(
                      { id: 'playground.effects.progress.elapsed' },
                      { elapsed: <b key="e">{elapsedText}</b> },
                    )}
                  </div>
                  <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                    {intl.formatMessage({ id: 'playground.effects.progress.hint' })}
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && videoURL && (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    {finalLatency
                      ? intl.formatMessage(
                          { id: 'playground.effects.result.doneWithLatency' },
                          { latency: finalLatency },
                        )
                      : intl.formatMessage({ id: 'playground.effects.result.done' })}
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
                      download={browserDownloadName(videoURL, `effect-${task.id}.mp4`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button icon={<DownloadOutlined />}>
                        {intl.formatMessage({ id: 'playground.effects.btn.download' })}
                      </Button>
                    </a>
                  </div>
                </div>
              )}

              {task.status === 'succeeded' && !videoURL && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.effects.result.waitingUrl' })}
                  description={intl.formatMessage({ id: 'playground.effects.result.waitingUrlDesc' })}
                />
              )}

              {task.status === 'failed' && (
                <Alert
                  type="error"
                  showIcon
                  message={task.error?.message || intl.formatMessage({ id: 'playground.effects.result.failed' })}
                  description={
                    task.error?.code
                      ? intl.formatMessage({ id: 'playground.effects.result.errorCode' }, { code: task.error.code })
                      : undefined
                  }
                />
              )}

              {task.status === 'canceled' && (
                <Alert
                  type="warning"
                  showIcon
                  message={intl.formatMessage({ id: 'playground.effects.result.canceled' })}
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
        {intl.formatMessage({ id: 'playground.effects.footer' }, { count: EFFECT_SCENES.length })}
      </div>

      <MediaHistoryDrawer
        kind="video"
        taskType="effects"
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
