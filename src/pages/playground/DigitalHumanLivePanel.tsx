import {
  AudioOutlined,
  LoadingOutlined,
  SendOutlined,
  UploadOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Input,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Upload,
  message,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { apiURL } from '@/utils/request';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';
import { playgroundUpload } from './upload';

// DigitalHumanLivePanel —— Vidu S1 实时数字人互动(内测)Playground 联调面板。
//
// 端到端链路(见后端 handler/relay_live*.go）：
//   1. POST /v1/live/sessions           创建会话，拿 RTC 凭证 + live_id
//   2. 阿里云 ARTC Web SDK 加入频道       推麦克风(+摄像头)、订阅数字人音视频（best-effort）
//   3. WS /v1/live/ws?live_id=..         控制通道：发 conn_init，处理 conn_init_ack / hangup
//   4. 文字 type:99 互动；type:6 被踢下线
//   5. 挂断 type:5 → GET /v1/live/sessions/:id 看计费时长
//
// RTC 视频渲染依赖阿里云 ARTC Web SDK（npm 包 aliyun-rtc-sdk，本地打包，运行时动态 import
// 懒加载成独立 chunk —— 不再依赖第三方 CDN，避免 CDN 下线导致音视频不可用）。SDK 不可用时
// 自动降级为「纯信令 + 文字」联调 —— 会话创建、conn_init、文字互动、计费仍可完整测试。

type LiveStatus =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'on_live'
  | 'ending'
  | 'ended'
  | 'error';

type RtcMode = 'off' | 'connecting' | 'live' | 'unsupported';

interface VoiceItem {
  voice: string;
  display_name?: string;
  description?: string;
  system?: boolean;
}

interface LiveSessionResp {
  live: { id: string; status: string; live_duration: number; call_mode: string };
  rtc: {
    app_id: string;
    channel_id: string;
    user_id: string;
    token: string;
    token_expire_at: string;
  };
}

interface ChatLine {
  who: 'user' | 'system';
  text: string;
  ts: number;
}

// 人设模板预设（文档「推荐的人设模板」精简示例）。
const PERSONA_PRESETS: { label: string; value: string }[] = [
  {
    label: '甜甜客服 Tina',
    value:
      '## 姓名\n甜甜 Tina\n## 身份\n你是一个友好的智能客服，温柔耐心地帮用户解决问题。\n## 性格\n温柔、稳定、有点小俏皮。\n## 回复习惯\n语气亲切，先共情再给方案，不说重话。',
  },
  {
    label: '邻家妹妹 晚柠',
    value:
      '## 姓名\n苏晚柠\n## 年龄\n20\n## 身份\n从小一起长大的邻家妹妹，软甜治愈，和你处于暧昧萌芽期。\n## 性格\n软甜温顺，细腻害羞。\n## 回复习惯\n声线清甜细软，嘴上嘴硬，话里藏着在意。',
  },
  {
    label: '学霸学长 知珩',
    value:
      '## 姓名\n沈知珩\n## 年龄\n20\n## 身份\n物理系大三学长，冷静理智、外冷内热的清冷学长。\n## 性格\n冷静理智，细腻隐忍。\n## 回复习惯\n语调平缓偏低，先理性拆解问题，再温柔安抚。',
  },
];

let dhSeq = 0;
const nextSeq = () => (dhSeq += 1);

export default function DigitalHumanLivePanel() {
  const intl = useIntl();
  const { apiKey } = usePlaygroundApiKey();
  // 组件内本地文案助手：默认中文，缺 gen key 时也不至于显示裸 id；英文由 gen key 覆盖。
  const L = (id: string, dm: string, values?: Record<string, any>) =>
    intl.formatMessage({ id: `playground.dhLive.${id}`, defaultMessage: dm }, values);

  // ---- 表单 ----
  const [callMode, setCallMode] = useState<'video' | 'audio'>('video');
  const [persona, setPersona] = useState(PERSONA_PRESETS[0].value);
  const [imageUri, setImageUri] = useState('');
  const [avatarName, setAvatarName] = useState('');
  const [voice, setVoice] = useState('');
  const [channelName, setChannelName] = useState('');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ---- 会话状态 ----
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [rtcMode, setRtcMode] = useState<RtcMode>('off');
  // 浏览器自动播放被拦截时置真，舞台叠「点击播放」浮层（用户点一下 SDK 即恢复播放）。
  const [needTapToPlay, setNeedTapToPlay] = useState(false);
  const [liveId, setLiveId] = useState('');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [billing, setBilling] = useState<{ billed?: number; credits?: number } | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [textInput, setTextInput] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const engineRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const retryRef = useRef(0);
  const closingRef = useRef(false); // 主动挂断/卸载中，抑制自动重连
  const sessionRef = useRef<LiveSessionResp | null>(null);

  const pushLine = (who: ChatLine['who'], text: string) =>
    setChat((c) => [...c, { who, text, ts: Date.now() }].slice(-200));

  // 拉音色（系统 + 自定义）
  const loadVoices = async () => {
    if (!apiKey) return;
    setVoicesLoading(true);
    try {
      const res = await fetch(apiURL('/v1/live/voices'), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await res.json();
      const list: VoiceItem[] = body?.data || [];
      setVoices(list);
    } catch {
      /* 忽略：音色可留空走默认 Tina */
    } finally {
      setVoicesLoading(false);
    }
  };

  useEffect(() => {
    loadVoices();
    return () => cleanup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const voiceOptions = useMemo(() => {
    const sys = voices.filter((v) => v.system !== false);
    const custom = voices.filter((v) => v.system === false);
    const grp = (label: string, arr: VoiceItem[]) => ({
      label,
      options: arr.map((v) => ({
        value: v.voice,
        label: v.display_name ? `${v.display_name}` : v.voice,
      })),
    });
    const out: any[] = [];
    if (sys.length) out.push(grp(L('voiceSystem', '系统音色'), sys));
    if (custom.length) out.push(grp(L('voiceCustom', '自定义克隆'), custom));
    return out;
  }, [voices]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 生命周期 ----------
  const cleanup = (leaveMsg: boolean) => {
    closingRef.current = true;
    try {
      wsRef.current?.close();
    } catch {
      /* noop */
    }
    wsRef.current = null;
    try {
      const eng = engineRef.current;
      if (eng) {
        eng.leaveChannel?.();
        eng.destroy?.();
      }
    } catch {
      /* noop */
    }
    engineRef.current = null;
    setRtcMode('off');
    setNeedTapToPlay(false);
    if (leaveMsg) pushLine('system', L('sysLeft', '已离开频道'));
  };

  // 上传参考图
  const doUpload = async (file: File) => {
    if (!apiKey) {
      message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
      return false;
    }
    setUploading(true);
    try {
      const { url } = await playgroundUpload(file, apiKey, { module: 'live', purpose: 'avatar' });
      setImageUri(url);
      message.success(L('uploadOk', '形象图已上传'));
    } catch (e: any) {
      message.error(e?.message || L('uploadFail', '上传失败'));
    } finally {
      setUploading(false);
    }
    return false;
  };

  // ---------- 开始互动 ----------
  const start = async () => {
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
    if (!persona.trim()) return message.warning(L('personaRequired', '请填写人设 persona'));
    if (!imageUri.trim()) return message.warning(L('imageRequired', '请填写或上传形象图片'));

    setErrMsg(null);
    setBilling(null);
    setChat([]);
    setStatus('creating');
    closingRef.current = false;
    retryRef.current = 0;

    let session: LiveSessionResp;
    try {
      const res = await fetch(apiURL('/v1/live/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          call_mode: callMode,
          avatar: {
            persona: persona.trim(),
            image_uri: imageUri.trim(),
            name: avatarName.trim(),
            voice: voice.trim(),
          },
          channel: channelName.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message || body?.message || `HTTP ${res.status}`);
      }
      session = body as LiveSessionResp;
    } catch (e: any) {
      setStatus('error');
      setErrMsg(e?.message || L('createFail', '创建会话失败'));
      return;
    }

    sessionRef.current = session;
    setLiveId(session.live.id);
    setStatus('waiting');
    pushLine('system', L('sysCreated', '会话已创建 · live_id={id}', { id: session.live.id }));

    // RTC（best-effort）+ WS 信令并行。
    joinRTC(session).catch(() => setRtcMode('unsupported'));
    connectWS(session.live.id);
  };

  // ---------- WS 控制通道 ----------
  const connectWS = (id: string) => {
    if (closingRef.current) return;
    const u = new URL(apiURL('/v1/live/ws'), window.location.origin);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('live_id', id);
    if (channelName.trim()) u.searchParams.set('channel', channelName.trim());
    u.searchParams.set('authorization', apiKey);

    let ws: WebSocket;
    try {
      ws = new WebSocket(u.toString());
    } catch (e: any) {
      setStatus('error');
      setErrMsg(String(e?.message || e));
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 1,
          live_id: id,
          seq_id: nextSeq(),
          payload: { conn_init: { version: 1 } },
        }),
      );
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      handleWSMessage(id, msg);
    };

    ws.onerror = () => {
      if (closingRef.current) return;
      pushLine('system', L('sysWsError', 'WS 连接出错'));
    };

    ws.onclose = () => {
      if (closingRef.current) return;
      // on_live 中被动断开：视为结束（type:6 已处理过则不覆盖）。
      if (status === 'on_live') {
        setStatus('ended');
        fetchBilling(id);
      }
    };
  };

  const handleWSMessage = (id: string, msg: any) => {
    // 平台代理透传上游帧 + 自身错误帧（{type:'error'}）。
    if (msg?.type === 'error') {
      setErrMsg(msg.message || 'stream error');
      setStatus('error');
      return;
    }
    switch (msg?.type) {
      case 2: {
        const ack = msg?.payload?.conn_init_ack;
        if (ack?.success) {
          retryRef.current = 0;
          setStatus('on_live');
          pushLine('system', L('sysOnLive', '数字人已上线，可以开始互动'));
        } else if (ack?.error_code === 'NOT_READY') {
          // video 模式常见：退避重连。
          scheduleReconnect(id);
        } else {
          setStatus('error');
          setErrMsg(L('initFailed', '初始化失败（{code}），请重新创建会话', { code: ack?.error_code || 'unknown' }));
        }
        return;
      }
      case 6: {
        const reason = msg?.payload?.hangup?.hangup_reason || 'unknown';
        pushLine('system', L('sysHangup', '被结束：{reason}', { reason }));
        setStatus('ended');
        fetchBilling(id);
        cleanup(false);
        return;
      }
      default: {
        // 其它上游帧（AI 文本/状态等）：尽量展示 text，便于调试。
        const content =
          msg?.payload?.text_msg?.content ||
          msg?.payload?.ai_text?.content ||
          msg?.payload?.subtitle?.content;
        if (content) pushLine('system', String(content));
      }
    }
  };

  const scheduleReconnect = (id: string) => {
    try {
      wsRef.current?.close();
    } catch {
      /* noop */
    }
    wsRef.current = null;
    const n = retryRef.current;
    if (n >= 5) {
      setStatus('error');
      setErrMsg(L('notReadyGiveUp', '数字人多次未就绪，请稍后重试或重建会话'));
      return;
    }
    retryRef.current = n + 1;
    const delay = Math.min(8000, 2000 * Math.pow(2, n)); // 2→4→8s
    pushLine('system', L('sysRetry', '数字人未就绪，{delay}s 后重连（第 {n} 次）', { delay: delay / 1000, n: n + 1 }));
    window.setTimeout(() => {
      if (!closingRef.current) connectWS(id);
    }, delay);
  };

  const sendText = () => {
    const content = textInput.trim();
    if (!content) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return message.warning(L('notConnected', '控制通道未连接'));
    }
    ws.send(JSON.stringify({ type: 99, payload: { text_msg: { content } } }));
    pushLine('user', content);
    setTextInput('');
  };

  // ---------- 挂断 ----------
  const hangup = async () => {
    const id = liveId;
    const ws = wsRef.current;
    setStatus('ending');
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 5,
            live_id: id,
            seq_id: nextSeq(),
            payload: { hangup: { hangup_reason: 'user_end' } },
          }),
        );
      }
    } catch {
      /* noop */
    }
    cleanup(true);
    setStatus('ended');
    if (id) fetchBilling(id);
  };

  const fetchBilling = async (id: string) => {
    if (!apiKey || !id) return;
    try {
      const res = await fetch(apiURL(`/v1/live/sessions/${encodeURIComponent(id)}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await res.json();
      const live = body?.live;
      if (live) setBilling({ billed: live.billed_seconds, credits: live.credits_cost });
    } catch {
      /* noop */
    }
  };

  // ---------- 阿里云 RTC（best-effort，aliyun-rtc-sdk 7.x） ----------
  // 入会写法严格对齐 Vidu 官方《实时数字人互动 API 接入指南》：
  //   joinChannel(rtc.token, rtc.user_id) → publishLocalAudioStream(true)
  //   → video 模式 publishLocalVideoStream(true) → 订阅数字人音视频渲染。
  // 默认自动订阅频道内其他用户流，数字人（唯一远端）流到达即渲染；音频由 SDK 自动播放。
  const joinRTC = async (session: LiveSessionResp) => {
    setRtcMode('connecting');
    setNeedTapToPlay(false);
    const mod = await loadAliRtcSdk();
    if (!mod) {
      setRtcMode('unsupported');
      pushLine('system', L('rtcUnsupported', 'RTC SDK 不可用，降级为纯信令+文字联调'));
      return;
    }
    // 枚举值优先从模块读取，缺失回退到稳定字面量（Camera=1 / Subscribed=3）。
    const AliRtcEngine = mod.default || mod.AliRtcEngine;
    const CAMERA = mod.AliRtcVideoTrack?.AliRtcVideoTrackCamera ?? 1;
    const SUBSCRIBED = mod.AliRtcSubscribeState?.AliRtcStateSubscribed ?? 3;
    try {
      const engine = AliRtcEngine.getInstance();
      engineRef.current = engine;

      const myUid = session.rtc.user_id;
      let bound = false;
      // 把某个远端用户（数字人）的相机流绑定到舞台 <video>。用「任意非自己的远端用户」策略，
      // 规避 web/app 端数字人 uid 格式差异（live-bot / live-video-push 视模式而定）。
      const bindRemote = (uid: string) => {
        if (bound || uid === myUid || !videoRef.current) return;
        try {
          engine.setRemoteViewConfig(videoRef.current, uid, CAMERA);
          bound = true;
        } catch {
          /* noop：绑定失败不致命，音频仍自动播放 */
        }
      };

      engine.on?.('remoteTrackAvailableNotify', (uid: string, _audio: any, video: any) => {
        if (video) bindRemote(uid);
      });
      engine.on?.('videoSubscribeStateChanged', (uid: string, _old: any, newState: any) => {
        if (newState === SUBSCRIBED && uid !== myUid) {
          bindRemote(uid);
          setRtcMode('live');
        }
      });
      // 浏览器自动播放策略：远端音/视频被拦截 → 提示用户点击一下即恢复。
      engine.on?.('remoteAudioAutoPlayFail', () => setNeedTapToPlay(true));
      engine.on?.('remoteVideoAutoPlayFail', () => setNeedTapToPlay(true));
      engine.on?.('occurError', (err: any) =>
        pushLine('system', L('rtcError', 'RTC 异常：{msg}', { msg: String(err?.message || err?.reason || err) })),
      );
      engine.on?.('bye', () => setRtcMode('off'));

      // 入会是唯一必需步骤：成功即算 RTC 连上，数字人画面/声音随订阅到达渲染。
      await engine.joinChannel(session.rtc.token, session.rtc.user_id);
      setRtcMode('live');
      pushLine('system', L('rtcLive', 'RTC 已连接（正在订阅数字人音视频）'));

      // 推本地麦克风/摄像头是 best-effort：设备读不出（NotReadableError：无设备/被占用/
      // 未授权）不该拖垮整个会话 —— 仍可看到数字人并用文字互动，只是数字人"听不到"你说话。
      try {
        await engine.publishLocalAudioStream(true);
        if (callMode === 'video') {
          await engine.publishLocalVideoStream(true);
        }
      } catch (pubErr: any) {
        pushLine(
          'system',
          L('rtcPublishFail', '麦克风/摄像头不可用（{msg}）——数字人听不到你，但可正常观看并用文字互动', {
            msg: String(pubErr?.message || pubErr?.reason || pubErr),
          }),
        );
      }
    } catch (e: any) {
      setRtcMode('unsupported');
      pushLine('system', L('rtcFail', 'RTC 接入失败，降级为纯信令+文字：{msg}', { msg: String(e?.message || e) }));
    }
  };

  // 用户点击舞台恢复被浏览器拦截的自动播放（SDK 在用户手势后会自动重试）。
  const resumePlay = () => {
    setNeedTapToPlay(false);
    videoRef.current?.play?.().catch(() => {});
  };

  // ---------- 渲染 ----------
  const busy = status === 'creating';
  const running = status === 'waiting' || status === 'on_live' || status === 'ending';
  const statusTag = renderStatusTag(status, rtcMode, L);

  return (
    <div className="pg-voice-grid">
      {/* 左：配置 */}
      <Card
        className="pg-voice-card"
        title={
          <span>
            <UserOutlined /> {L('cardTitle', 'Vidu S1 数字人互动')}
          </span>
        }
        extra={<span className="pg-voice-path">POST /v1/live/sessions · WS /v1/live/ws</span>}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <ApiKeyField />

          <div>
            <div className="pg-voice-label">{L('modeLabel', '交互方式')}</div>
            <Segmented
              value={callMode}
              onChange={(v) => setCallMode(v as any)}
              disabled={running}
              options={[
                { label: L('modeVideo', '音视频'), value: 'video', icon: <VideoCameraOutlined /> },
                { label: L('modeAudio', '纯语音'), value: 'audio', icon: <AudioOutlined /> },
              ]}
            />
          </div>

          <div>
            <div className="pg-voice-label">
              {L('personaLabel', '人设 persona')}
              <span style={{ marginLeft: 8 }}>
                {PERSONA_PRESETS.map((p) => (
                  <Tag
                    key={p.label}
                    color="blue"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setPersona(p.value)}
                  >
                    {p.label}
                  </Tag>
                ))}
              </span>
            </div>
            <Input.TextArea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              autoSize={{ minRows: 4, maxRows: 10 }}
              placeholder={L('personaPh', '描述数字人是谁、性格、说话风格…')}
            />
          </div>

          <div>
            <div className="pg-voice-label">{L('imageLabel', '形象图片（URL 或上传）')}</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={imageUri}
                onChange={(e) => setImageUri(e.target.value)}
                placeholder="https://…/avatar.png"
              />
              <Upload showUploadList={false} beforeUpload={(f) => doUpload(f as File)} accept="image/*">
                <Button icon={uploading ? <LoadingOutlined /> : <UploadOutlined />}>
                  {L('upload', '上传')}
                </Button>
              </Upload>
            </Space.Compact>
            {imageUri && (
              <img
                src={imageUri}
                alt="avatar"
                style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, objectFit: 'cover' }}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="pg-voice-label">{L('nameLabel', '名字（可选）')}</div>
              <Input value={avatarName} onChange={(e) => setAvatarName(e.target.value)} placeholder="小美" />
            </div>
            <div style={{ flex: 1 }}>
              <div className="pg-voice-label">
                {L('voiceLabel', '音色')}
                {voicesLoading && <Spin size="small" style={{ marginLeft: 6 }} />}
              </div>
              <Select
                style={{ width: '100%' }}
                allowClear
                showSearch
                value={voice || undefined}
                onChange={(v) => setVoice(v || '')}
                placeholder={L('voicePh', '默认 Tina')}
                options={voiceOptions}
                optionFilterProp="label"
              />
            </div>
          </div>

          <div>
            <div className="pg-voice-label">
              <Tooltip title={L('channelHint', '多个 vidu 渠道并存时点名，一般留空')}>
                {L('channelLabel', '渠道（可选）')}
              </Tooltip>
            </div>
            <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="" />
          </div>

          <Space>
            {!running ? (
              <Button type="primary" loading={busy} onClick={start} icon={<VideoCameraOutlined />}>
                {L('start', '开始互动')}
              </Button>
            ) : (
              <Button danger loading={status === 'ending'} onClick={hangup}>
                {L('hangup', '挂断')}
              </Button>
            )}
            {statusTag}
          </Space>

          {errMsg && <Alert type="error" showIcon message={errMsg} />}
        </Space>
      </Card>

      {/* 右：舞台 + 文字互动 */}
      <Card
        className="pg-voice-card"
        title={<span>{L('stageTitle', '互动舞台')}</span>}
        extra={liveId ? <span className="pg-voice-path">live_id: {liveId}</span> : null}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '3 / 4',
              maxHeight: 420,
              background: '#111',
              borderRadius: 12,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* 数字人相机流由 SDK 通过 setRemoteViewConfig 渲染进此 <video>；
                音频由 SDK 内部自动播放。audio 模式隐藏画面，只听声音。 */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: callMode === 'video' ? 'block' : 'none' }}
            />
            {rtcMode !== 'live' && (
              <div style={{ position: 'absolute', color: '#aaa', fontSize: 13, textAlign: 'center', padding: 16 }}>
                {rtcMode === 'connecting'
                  ? L('rtcConnecting', '正在连接实时音视频…')
                  : rtcMode === 'unsupported'
                  ? L('rtcFallbackHint', '实时音视频不可用 · 纯信令+文字联调中')
                  : L('stageIdle', '开始互动后，数字人画面/声音在此呈现')}
              </div>
            )}
            {rtcMode === 'live' && callMode === 'audio' && !needTapToPlay && (
              <div style={{ position: 'absolute', color: '#aaa', fontSize: 13, textAlign: 'center', padding: 16 }}>
                {L('audioLive', '纯语音互动中 · 数字人声音已接入')}
              </div>
            )}
            {needTapToPlay && (
              <div
                onClick={resumePlay}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.45)',
                  cursor: 'pointer',
                }}
              >
                <Button type="primary" size="large" onClick={resumePlay}>
                  {L('tapToPlay', '点击播放数字人音视频')}
                </Button>
              </div>
            )}
          </div>

          {billing && (
            <Alert
              type="info"
              showIcon
              message={L('billingMsg', '本次计费时长 {billed}s · 上游积分 {credits}', {
                billed: billing.billed ?? 0,
                credits: billing.credits ?? 0,
              })}
            />
          )}

          <div
            style={{
              height: 200,
              overflowY: 'auto',
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              padding: 8,
              background: '#fafafa',
            }}
          >
            {chat.length === 0 ? (
              <div style={{ color: '#bbb', fontSize: 12 }}>{L('chatEmpty', '互动记录会显示在这里')}</div>
            ) : (
              chat.map((line, i) => (
                <div key={i} style={{ marginBottom: 6, fontSize: 13 }}>
                  <Tag color={line.who === 'user' ? 'green' : 'default'}>
                    {line.who === 'user' ? L('me', '我') : L('sys', '系统')}
                  </Tag>
                  <span>{line.text}</span>
                </div>
              ))
            )}
          </div>

          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onPressEnter={sendText}
              disabled={status !== 'on_live'}
              placeholder={
                status === 'on_live'
                  ? L('textPh', '输入文字与数字人对话…')
                  : L('textDisabled', '数字人上线后可发送文字')
              }
            />
            <Button type="primary" icon={<SendOutlined />} disabled={status !== 'on_live'} onClick={sendText}>
              {L('send', '发送')}
            </Button>
          </Space.Compact>
        </Space>
      </Card>
    </div>
  );
}

function renderStatusTag(status: LiveStatus, rtc: RtcMode, L: (id: string, dm: string) => string) {
  const map: Record<LiveStatus, { color: string; text: string }> = {
    idle: { color: 'default', text: L('stIdle', '未开始') },
    creating: { color: 'processing', text: L('stCreating', '创建中') },
    waiting: { color: 'warning', text: L('stWaiting', '等待数字人就绪') },
    on_live: { color: 'success', text: L('stOnLive', '互动中') },
    ending: { color: 'processing', text: L('stEnding', '结束中') },
    ended: { color: 'default', text: L('stEnded', '已结束') },
    error: { color: 'error', text: L('stError', '出错') },
  };
  const s = map[status];
  return (
    <Space size={4}>
      <Tag color={s.color}>{s.text}</Tag>
      {rtc === 'live' && <Tag color="blue">RTC</Tag>}
      {rtc === 'unsupported' && <Tag color="default">{L('rtcOff', '信令模式')}</Tag>}
    </Space>
  );
}

// loadAliRtcSdk 动态 import 阿里云 ARTC Web SDK 模块（含引擎类 + 枚举）；失败返回 null
// （面板自动降级）。动态 import 让 SDK 落在独立 async chunk，只有真正开始互动时才加载。
let aliRtcLoading: Promise<any> | null = null;
async function loadAliRtcSdk(): Promise<any> {
  if (aliRtcLoading) return aliRtcLoading;
  aliRtcLoading = import('aliyun-rtc-sdk')
    .then((mod: any) => ((mod?.default || mod?.AliRtcEngine) ? mod : null))
    .catch(() => {
      aliRtcLoading = null; // 允许下次重试
      return null;
    });
  return aliRtcLoading;
}
