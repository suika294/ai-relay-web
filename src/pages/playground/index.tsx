import {
  AppstoreOutlined,
  AudioOutlined,
  ClearOutlined,
  CloseCircleFilled,
  DeleteOutlined,
  ExperimentOutlined,
  MessageOutlined,
  PaperClipOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
  ShoppingOutlined,
  SkinOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UserOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Link, useIntl, useSearchParams } from '@umijs/max';
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tabs,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { systemApi, tokenApi } from '@/services/api';
import { t } from '@/utils/i18n';
import { apiURL } from '@/utils/request';
import AdOneClickPanel from './AdOneClickPanel';
import EffectsPanel from './EffectsPanel';
import GeneralOneClickPanel from './GeneralOneClickPanel';
import ImagePanel from './ImagePanel';
import MultiframePanel from './MultiframePanel';
import TemplatePanel from './TemplatePanel';
import ThreeDPanel from './ThreeDPanel';
import VideoPanel from './VideoPanel';
import VirtualmanPanel from './VirtualmanPanel';
import VirtualTryOnPanel from './VirtualTryOnPanel';
import VoiceClonePanel from './VoiceClonePanel';
import VoicePanel from './VoicePanel';
import './playground.css';

const { TextArea } = Input;

type Role = 'system' | 'user' | 'assistant' | 'error';
type Msg = {
  role: Role;
  content: string;
  // images 仅 user 携带；存 data URL（base64），发送时按 OpenAI vision 格式拼成
  // content 数组（text + image_url 多段）。空数组与 undefined 等价，发送走纯文本路径。
  images?: string[];
  // hadImages: 持久化到 localStorage 时被剥掉 base64 的标记(避免聊天历史撑爆配额);
  // 仅控制 UI 在重载后显示 "图片未随会话保存" 提示,不影响发送(刷新后无法再用旧图发 i2i)。
  hadImages?: number;
  // model 仅 assistant 与 error 两种消息携带：
  //   - assistant: 上游实际生成这条回复的模型（优先 response.data.model，否则发送时选的）
  //   - error:     失败请求当时尝试的模型，便于定位是谁家返回的错
  // user 不带 model：选模型是侧边设置的事，不是"用户的身份"；历史里不冗余显示。
  model?: string;
  meta?: { code?: number | string; status?: number };
};

// 单张图上限 ~5MB（base64 后膨胀 ~33%，过大会塞爆 localStorage 与上游 token）
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES_PER_MSG = 6;

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// 把一条 user 消息按 OpenAI vision 协议拼成发给上游的 content 字段：
//   - 没图：直接返回 string
//   - 有图：数组 [{type:text}, ...{type:image_url}]
function buildUserContent(text: string, images?: string[]): any {
  if (!images || images.length === 0) return text;
  const parts: any[] = [];
  if (text) parts.push({ type: 'text', text });
  for (const url of images) parts.push({ type: 'image_url', image_url: { url } });
  return parts;
}

// 按模型名前缀推导品牌色 + 单字符 mark。同家子品牌（kimi/moonshot、glm/codegeex）归并。
function modelBrand(name?: string): { color: string; letter: string } {
  if (!name) return { color: '#888', letter: '?' };
  const n = name.toLowerCase();
  if (/^(gpt|o1|o3|chatgpt|text-embedding|dall-e|whisper|tts)/.test(n))
    return { color: '#10a37f', letter: 'G' };
  if (n.startsWith('claude')) return { color: '#d97757', letter: 'A' };
  if (n.startsWith('gemini')) return { color: '#4285f4', letter: 'G' };
  if (n.startsWith('moonshot') || n.startsWith('kimi'))
    return { color: '#111827', letter: 'K' };
  if (n.startsWith('glm') || n.startsWith('codegeex'))
    return { color: '#0ea5e9', letter: 'Z' };
  if (n.startsWith('deepseek')) return { color: '#4d6bfe', letter: 'D' };
  if (n.startsWith('qwen')) return { color: '#615ced', letter: 'Q' };
  if (n.startsWith('mistral')) return { color: '#fa520f', letter: 'M' };
  return { color: '#6b7280', letter: n[0].toUpperCase() };
}

interface Session {
  id: string;
  title: string;
  model?: string;
  system?: string;
  messages: Msg[];
  createdAt: number;
  updatedAt: number;
}

const LS_SESSIONS = 'playground_sessions_v1';
const LS_CURRENT = 'playground_current_session_v1';

function loadSessions(): Session[] {
  try {
    const s = localStorage.getItem(LS_SESSIONS);
    return s ? (JSON.parse(s) as Session[]) : [];
  } catch {
    return [];
  }
}

// 持久化前剥掉 image base64 —— 单张图 ≤5MB × base64 膨胀 33% × 单条最多 6 张 ×
// 50 个会话 ≫ 浏览器 5–10MB 的 localStorage 配额。strippedSessions 只丢图片,文字
// 历史与 hadImages 计数都留下,刷新后 UI 给出"图片未随会话保存"提示;当前会话内
// 还活在内存里的图不受影响。
function stripImagesFromSessions(list: Session[]): Session[] {
  return list.map((s) => ({
    ...s,
    messages: s.messages.map((m) =>
      m.images && m.images.length > 0
        ? { ...m, images: undefined, hadImages: m.images.length }
        : m,
    ),
  }));
}

function saveSessions(list: Session[]) {
  const stripped = stripImagesFromSessions(list.slice(0, 50));
  const tries: Session[][] = [
    stripped,
    stripped.slice(0, 20),
    stripped.slice(0, 5),
    stripped.slice(0, 1),
  ];
  for (const candidate of tries) {
    try {
      localStorage.setItem(LS_SESSIONS, JSON.stringify(candidate));
      return;
    } catch {
      // QuotaExceededError / SecurityError(隐私模式)→ 继续往下尝试更小批量。
      // 不向上抛,避免在 setState updater 里炸断 React 渲染。
    }
  }
  // 全失败:清掉旧值,让下一次 loadSessions 至少能拿到空数组而不是损坏的 JSON。
  try {
    localStorage.removeItem(LS_SESSIONS);
  } catch {
    /* 完全放弃 */
  }
}
function newSession(): Session {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: t('playground.index.newSession'),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}
function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + '…';
}

function ChatPanel() {
  const intl = useIntl();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [tokens, setTokens] = useState<API.Token[]>([]);

  // 配置
  const [modelName, setModelName] = useState<string>();
  const [tokenId, setTokenId] = useState<number>();
  const [system, setSystem] = useState(() =>
    intl.formatMessage({ id: 'playground.index.defaultSystemPrompt' }),
  );
  const [stream, setStream] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  // 会话
  const [sessions, setSessions] = useState<Session[]>(() => {
    const all = loadSessions();
    if (all.length > 0) return all;
    const fresh = newSession();
    saveSessions([fresh]);
    return [fresh];
  });
  const [currentId, setCurrentId] = useState<string>(() => {
    const saved = localStorage.getItem(LS_CURRENT);
    const all = loadSessions();
    if (saved && all.find((s) => s.id === saved)) return saved;
    return all[0]?.id ?? '';
  });

  const current = sessions.find((s) => s.id === currentId) ?? sessions[0];
  const messages = current?.messages ?? [];

  useEffect(() => {
    if (currentId) localStorage.setItem(LS_CURRENT, currentId);
  }, [currentId]);

  // 输入框
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 接收一批图片文件 -> 转 data URL -> 追加到 pendingImages。
  // 在这里做大小/数量校验，给出 message 反馈；不抛错向上。
  const addImages = async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    const remain = MAX_IMAGES_PER_MSG - pendingImages.length;
    if (remain <= 0) {
      message.warning(
        intl.formatMessage(
          { id: 'playground.index.maxImagesPerMsg' },
          { max: MAX_IMAGES_PER_MSG },
        ),
      );
      return;
    }
    const accept = arr.slice(0, remain);
    if (arr.length > remain) {
      message.warning(
        intl.formatMessage(
          { id: 'playground.index.onlyAcceptFirst' },
          { remain, max: MAX_IMAGES_PER_MSG },
        ),
      );
    }
    const urls: string[] = [];
    for (const f of accept) {
      if (f.size > MAX_IMAGE_SIZE) {
        message.warning(
          intl.formatMessage(
            { id: 'playground.index.imageTooLarge' },
            { name: f.name || intl.formatMessage({ id: 'playground.index.image' }) },
          ),
        );
        continue;
      }
      try {
        urls.push(await readFileAsDataURL(f));
      } catch {
        message.error(
          intl.formatMessage(
            { id: 'playground.index.imageReadFailed' },
            { name: f.name || intl.formatMessage({ id: 'playground.index.image' }) },
          ),
        );
      }
    }
    if (urls.length > 0) setPendingImages((prev) => [...prev, ...urls]);
  };

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && f.type.startsWith('image/')) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void addImages(files);
    }
  };

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'chat' && m.enabled !== false)
        .map((m) => ({
          value: m.name,
          label: m.display_name ? `${m.display_name}` : m.name,
        }));
      setModels(list);
      if (list.length > 0) {
        setModelName((prev) => (prev && list.some((m) => m.value === prev) ? prev : list[0].value));
      }
    });
    tokenApi.list().then((res) => {
      const list = (res.data as API.Token[]) || [];
      const active = list.filter((t) => t.status === 1);
      setTokens(active);
      if (active.length > 0) setTokenId((prev) => prev ?? active[0].id);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const selectedToken = tokens.find((t) => t.id === tokenId);

  const updateCurrent = (updater: (s: Session) => Session) => {
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === currentId ? updater(s) : s));
      saveSessions(next);
      return next;
    });
  };

  const appendMessage = (m: Msg) => {
    updateCurrent((s) => {
      const msgs = [...s.messages, m];
      const isFreshTitle =
        s.title === intl.formatMessage({ id: 'playground.index.newSession' }) ||
        !s.title;
      // 文字优先；纯图片消息也给个占位标题，不让侧栏显示"新会话"无法区分
      let title = s.title;
      if (isFreshTitle && m.role === 'user') {
        if (m.content) title = truncate(m.content, 24);
        else if (m.images && m.images.length > 0)
          title = intl.formatMessage(
            { id: 'playground.index.imageTitle' },
            { count: m.images.length },
          );
      }
      return {
        ...s,
        messages: msgs,
        title,
        model: modelName || s.model,
        system,
        updatedAt: Date.now(),
      };
    });
  };

  const replaceLastAssistant = (content: string, modelAt?: string) => {
    updateCurrent((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { role: 'assistant', content, model: modelAt ?? last.model };
      } else {
        msgs.push({ role: 'assistant', content, model: modelAt });
      }
      return { ...s, messages: msgs, updatedAt: Date.now() };
    });
  };

  // 请求失败时移除末尾那个还没填内容的占位 assistant 气泡，避免留个空壳。
  const removePendingAssistant = () => {
    updateCurrent((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant' && !last.content) {
        msgs.pop();
      }
      return { ...s, messages: msgs, updatedAt: Date.now() };
    });
  };

  // typewriter: 非流式响应本地模拟打字效果。
  //   - 每帧 ~20ms 推进若干字符（总帧数目标 ~80 帧，短内容字粒度更细，长内容一次多几个字）
  //   - 监听 AbortSignal：用户点"中断"即刻停止、把已打出的部分留作最终内容
  const typewriter = async (full: string, modelAt: string, signal: AbortSignal) => {
    if (!full) {
      replaceLastAssistant('', modelAt);
      return;
    }
    const targetFrames = 80;
    const step = Math.max(1, Math.ceil(full.length / targetFrames));
    const delay = 20;
    for (let i = step; i < full.length; i += step) {
      if (signal.aborted) {
        replaceLastAssistant(full.slice(0, i), modelAt);
        return;
      }
      replaceLastAssistant(full.slice(0, i), modelAt);
      await new Promise((r) => setTimeout(r, delay));
    }
    replaceLastAssistant(full, modelAt);
  };

  const createSession = () => {
    const s = newSession();
    const next = [s, ...sessions];
    setSessions(next);
    saveSessions(next);
    setCurrentId(s.id);
  };

  const deleteSession = (id: string) => {
    const next = sessions.filter((s) => s.id !== id);
    if (next.length === 0) {
      const fresh = newSession();
      next.push(fresh);
      setCurrentId(fresh.id);
    } else if (currentId === id) {
      setCurrentId(next[0].id);
    }
    setSessions(next);
    saveSessions(next);
  };

  const clearCurrent = () => {
    updateCurrent((s) => ({
      ...s,
      messages: [],
      title: intl.formatMessage({ id: 'playground.index.newSession' }),
      updatedAt: Date.now(),
    }));
  };

  const send = async () => {
    const text = input.trim();
    // 仅图片无文字也允许发送（图生文场景：直接问"这是什么"）
    if (!text && pendingImages.length === 0) return;
    if (!modelName) {
      message.warning(intl.formatMessage({ id: 'playground.index.selectModelFirst' }));
      return;
    }
    if (!selectedToken) {
      message.warning(intl.formatMessage({ id: 'playground.index.createKeyFirst' }));
      return;
    }

    const userMsg: Msg = {
      role: 'user',
      content: text,
      images: pendingImages.length > 0 ? pendingImages : undefined,
    };
    appendMessage(userMsg);
    setInput('');
    setPendingImages([]);
    setLoading(true);

    // 请求发出即占位：content='' 的 assistant 气泡 + 捕获此刻的 model 名。
    // 渲染层会把 content='' + loading 识别为"思考中…"动画；首字节到达就替换进去。
    const sentWith = modelName;
    appendMessage({ role: 'assistant', content: '', model: sentWith });

    // 构造给上游的 messages：过滤 error / 完全空（无文字也无图）的消息
    // user 消息按 vision 协议拼 content（有图就走 parts 数组，否则 string）
    const history = [...messages, userMsg]
      .filter((m) => m.role !== 'error' && (m.content || (m.images && m.images.length > 0)))
      .map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content:
          m.role === 'user' ? buildUserContent(m.content, m.images) : m.content,
      }));

    const body = {
      model: modelName,
      messages: system.trim()
        ? [{ role: 'system' as const, content: system.trim() }, ...history]
        : history,
      stream,
      temperature,
      max_tokens: maxTokens,
    };

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(apiURL('/v1/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedToken.key}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = text.slice(0, 500);
        let errCode: number | string | undefined;
        try {
          const j = JSON.parse(text);
          // /v1/* 已改为 OpenAI 风格 {error:{message,type,code}},同时兼容旧的 {message,code}
          if (j?.error?.message) {
            errMsg = j.error.message;
            errCode = j.error.code;
          } else if (j?.message) {
            errMsg = j.message;
            errCode = j.code;
          }
        } catch {}
        removePendingAssistant();
        appendMessage({
          role: 'error',
          content: errMsg,
          model: modelName,
          meta: { status: res.status, code: errCode },
        });
        return;
      }

      if (stream) {
        // 流式：SSE 分片到达时直接刷新占位气泡内容，自带打字节奏
        await consumeStream(res, (full, modelAt) =>
          replaceLastAssistant(full, modelAt || sentWith),
        );
      } else {
        // 非流式：上游一次返回全量，本地做打字机效果，避免大段内容瞬间糊脸
        const data = await res.json();
        const content =
        data?.choices?.[0]?.message?.content ??
        intl.formatMessage({ id: 'playground.index.noContent' });
        const finalModel = data?.model || sentWith;
        await typewriter(content, finalModel, ctrl.signal);
      }
    } catch (e: any) {
      removePendingAssistant();
      if (e?.name === 'AbortError') {
        appendMessage({
          role: 'error',
          content: intl.formatMessage({ id: 'playground.index.requestAborted' }),
          model: modelName,
        });
      } else {
        appendMessage({ role: 'error', content: String(e?.message || e), model: modelName });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  return (
    <div className="pg-tab-chat">
      <div className="pg-layout">
        {/* 左：会话列表 */}
        <div className="pg-sessions">
          <div className="pg-sessions-header">
            <span>{intl.formatMessage({ id: 'playground.index.sessionRecords' })}</span>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined style={{ color: '#fff' }} />}
              onClick={createSession}
              style={{
                background: '#1677ff',
                borderColor: '#1677ff',
                color: '#fff',
              }}
            >
              {intl.formatMessage({ id: 'common.create' })}
            </Button>
          </div>
          {sessions.length === 0 ? (
            <div className="pg-session-empty">
              {intl.formatMessage({ id: 'playground.index.noSessions' })}
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`pg-session-item ${s.id === currentId ? 'active' : ''}`}
                onClick={() => setCurrentId(s.id)}
              >
                <div className="pg-session-title">
                  {s.title || intl.formatMessage({ id: 'playground.index.untitled' })}
                </div>
                <div className="pg-session-meta">
                  <span>
                    {intl.formatMessage(
                      { id: 'playground.index.messageCount' },
                      { count: s.messages.length },
                    )}
                  </span>
                  <span>
                    {new Date(s.updatedAt).toLocaleString([], {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <Popconfirm
                  title={intl.formatMessage({ id: 'playground.index.deleteSessionConfirm' })}
                  onConfirm={(e) => {
                    e?.stopPropagation?.();
                    deleteSession(s.id);
                  }}
                  onCancel={(e) => e?.stopPropagation?.()}
                >
                  <span
                    className="pg-session-del"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DeleteOutlined />
                  </span>
                </Popconfirm>
              </div>
            ))
          )}
        </div>

        {/* 中：对话 */}
        <div className="pg-chat">
          <div className="pg-msgs" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="pg-msgs-empty">
                <Empty
                  description={intl.formatMessage({
                    id: 'playground.index.startConversation',
                  })}
                />
              </div>
            ) : (
              messages.map((m, i) => {
                // chip/模型名只给 "生成/失败的" 方出现：assistant & error。
                // user 气泡不带 chip——选模型是侧边设置的事，不是"用户的身份"。
                const showBrand = m.role === 'assistant' || m.role === 'error';
                const brand = showBrand && m.model ? modelBrand(m.model) : null;
                const chip = brand && (
                  <span
                    className="pg-model-chip"
                    style={{ background: brand.color }}
                    title={m.model}
                  >
                    {brand.letter}
                  </span>
                );

                if (m.role === 'error') {
                  return (
                    <div key={i} className="pg-bubble pg-bubble-error">
                      <div className="pg-err-title">
                        {chip}
                        <span>
                          {intl.formatMessage({ id: 'playground.index.requestError' })}
                          {m.meta?.status ? ` · HTTP ${m.meta.status}` : ''}
                          {m.meta?.code ? ` · code ${m.meta.code}` : ''}
                          {m.model ? ` · ${m.model}` : ''}
                        </span>
                      </div>
                      {m.content}
                    </div>
                  );
                }

                // 判定 "还在输出中" 的最后一条 assistant：content 非空但仍 loading，尾部显示一个闪烁光标
                const isLastAssistant =
                  m.role === 'assistant' && i === messages.length - 1 && loading;
                const isPending = m.role === 'assistant' && !m.content && loading;
                return (
                  <div key={i} className={`pg-bubble pg-bubble-${m.role}`}>
                    <div className="pg-role-tag">
                      {chip}
                      <span>{m.role === 'assistant' ? m.model || 'assistant' : m.role}</span>
                    </div>
                    {m.role === 'user' && m.images && m.images.length > 0 && (
                      <div className="pg-msg-imgs">
                        {m.images.map((src, k) => (
                          <a
                            key={k}
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className="pg-msg-img"
                          >
                            <img src={src} alt={`img-${k}`} />
                          </a>
                        ))}
                      </div>
                    )}
                    {m.role === 'user' &&
                      !m.images &&
                      typeof m.hadImages === 'number' &&
                      m.hadImages > 0 && (
                        <div className="pg-msg-img-missing">
                          🖼️{' '}
                          {intl.formatMessage(
                            { id: 'playground.index.imagesNotSaved' },
                            { count: m.hadImages },
                          )}
                        </div>
                      )}
                    {isPending ? (
                      <span className="pg-thinking">
                        {intl.formatMessage({ id: 'playground.index.thinking' })}
                        <span className="pg-thinking-dot" />
                        <span className="pg-thinking-dot" />
                        <span className="pg-thinking-dot" />
                      </span>
                    ) : (
                      <>
                        {m.content}
                        {isLastAssistant && m.content && <span className="pg-cursor" />}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="pg-input-bar">
            {pendingImages.length > 0 && (
              <div className="pg-pending-imgs">
                {pendingImages.map((src, k) => (
                  <div key={k} className="pg-pending-img">
                    <img src={src} alt={`pending-${k}`} />
                    <button
                      type="button"
                      className="pg-pending-img-del"
                      onClick={() => removePendingImage(k)}
                      title={intl.formatMessage({ id: 'playground.index.remove' })}
                    >
                      <CloseCircleFilled />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              placeholder={intl.formatMessage({ id: 'playground.index.inputPlaceholder' })}
              autoSize={{ minRows: 2, maxRows: 6 }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (!loading) send();
                }
              }}
              disabled={loading}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                void addImages(e.target.files);
                // 同名文件再次选择也能触发 change
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
            <Space style={{ marginTop: 8, width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Button
                  icon={<ClearOutlined />}
                  onClick={clearCurrent}
                  disabled={messages.length === 0}
                >
                  {intl.formatMessage({ id: 'playground.index.clearCurrent' })}
                </Button>
                <Button
                  icon={<PaperClipOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || pendingImages.length >= MAX_IMAGES_PER_MSG}
                  title={intl.formatMessage({ id: 'playground.index.uploadImageTip' })}
                >
                  {intl.formatMessage({ id: 'playground.index.imageBtn' })}
                </Button>
              </Space>
              {loading ? (
                <Button danger icon={<StopOutlined />} onClick={stop}>
                  {intl.formatMessage({ id: 'playground.index.abort' })}
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={send}
                  disabled={!input.trim() && pendingImages.length === 0}
                >
                  {intl.formatMessage({ id: 'playground.index.send' })}
                </Button>
              )}
            </Space>
          </div>
        </div>

        {/* 右：设置 */}
        <div className="pg-settings">
          <h4>{intl.formatMessage({ id: 'playground.index.settings' })}</h4>
          {tokens.length === 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={
                <span>
                  {intl.formatMessage({ id: 'playground.index.noKeyYet' })}
                  <Link to="/console/tokens">
                    {intl.formatMessage({ id: 'playground.index.goCreate' })}
                  </Link>
                </span>
              }
            />
          )}

          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {intl.formatMessage({ id: 'playground.index.model' })}
              </div>
              <Select
                value={modelName}
                onChange={setModelName}
                options={models}
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                placeholder={intl.formatMessage({ id: 'playground.index.selectModel' })}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#666' }}>API Key</div>
              <Select
                value={tokenId}
                onChange={setTokenId}
                options={tokens.map((tk) => ({
                  value: tk.id,
                  label: `${tk.name || intl.formatMessage({ id: 'playground.index.untitled' })} (${tk.key_prefix}***)`,
                }))}
                style={{ width: '100%' }}
                placeholder={intl.formatMessage({ id: 'playground.index.selectToken' })}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#666' }}>System Prompt</div>
              <TextArea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 6 }}
                placeholder={intl.formatMessage({
                  id: 'playground.index.systemPromptPlaceholder',
                })}
              />
            </div>

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13 }}>
                {intl.formatMessage({ id: 'playground.index.streamOutput' })}
              </span>
              <Switch checked={stream} onChange={setStream} />
            </Space>

            <div>
              <div style={{ fontSize: 12, color: '#666' }}>Temperature</div>
              <InputNumber
                value={temperature}
                onChange={(v) => setTemperature(Number(v) || 0)}
                min={0}
                max={2}
                step={0.1}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#666' }}>Max Tokens</div>
              <InputNumber
                value={maxTokens}
                onChange={(v) => setMaxTokens(Number(v) || 0)}
                min={1}
                max={32000}
                step={128}
                style={{ width: '100%' }}
              />
            </div>
          </Space>
        </div>
      </div>
    </div>
  );
}

// ---------- 外壳:Tabs 切换 Chat / 图像 / 视频 ----------

export default function Playground() {
  const intl = useIntl();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') || 'chat';
  const changeTab = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === 'chat') next.delete('tab');
    else next.set('tab', key);
    setParams(next);
  };

  // 测试期临时全部放开。需要重新隐藏时,把对应 key 填回此集合即可:
  //   ad-one-click / template / virtual-tryon / effects / general-one-click / multiframe
  const HIDDEN_TABS = new Set<string>();
  const tabItems = [
          {
            key: 'chat',
            label: (
              <span>
                <MessageOutlined /> {intl.formatMessage({ id: 'playground.index.tabChat' })}
              </span>
            ),
            children: <ChatPanel />,
          },
          {
            key: 'image',
            label: (
              <span>
                <PictureOutlined /> {intl.formatMessage({ id: 'playground.index.tabImage' })}
              </span>
            ),
            children: <ImagePanel />,
          },
          {
            key: 'video',
            label: (
              <span>
                <VideoCameraOutlined /> {intl.formatMessage({ id: 'playground.index.tabVideo' })}
              </span>
            ),
            children: <VideoPanel />,
          },
          {
            key: 'effects',
            label: (
              <span>
                <ThunderboltOutlined /> {intl.formatMessage({ id: 'playground.index.tabEffects' })}
              </span>
            ),
            children: <EffectsPanel />,
          },
          {
            key: 'multiframe',
            label: (
              <span>
                <VideoCameraAddOutlined />{' '}
                {intl.formatMessage({ id: 'playground.index.tabMultiframe' })}
              </span>
            ),
            children: <MultiframePanel />,
          },
          {
            key: 'template',
            label: (
              <span>
                <AppstoreOutlined /> {intl.formatMessage({ id: 'playground.index.tabTemplate' })}
              </span>
            ),
            children: <TemplatePanel />,
          },
          {
            key: 'ad-one-click',
            label: (
              <span>
                <ShoppingOutlined /> {intl.formatMessage({ id: 'playground.index.tabAdOneClick' })}
              </span>
            ),
            children: <AdOneClickPanel />,
          },
          {
            key: 'general-one-click',
            label: (
              <span>
                <VideoCameraOutlined />{' '}
                {intl.formatMessage({ id: 'playground.index.tabGeneralOneClick' })}
              </span>
            ),
            children: <GeneralOneClickPanel />,
          },
          {
            key: 'virtual-tryon',
            label: (
              <span>
                <SkinOutlined /> {intl.formatMessage({ id: 'playground.index.tabVirtualTryon' })}
              </span>
            ),
            children: <VirtualTryOnPanel />,
          },
          {
            key: '3d',
            label: (
              <span>
                <ExperimentOutlined /> 3D
              </span>
            ),
            children: <ThreeDPanel />,
          },
          {
            key: 'audio',
            label: (
              <span>
                <AudioOutlined /> {intl.formatMessage({ id: 'playground.index.tabAudio' })}
              </span>
            ),
            children: <VoicePanel />,
          },
          {
            key: 'voice-clone',
            label: (
              <span>
                <AudioOutlined /> {intl.formatMessage({ id: 'playground.index.tabVoiceClone' })}
              </span>
            ),
            children: <VoiceClonePanel />,
          },
          {
            key: 'virtualman',
            label: (
              <span>
                <UserOutlined /> {intl.formatMessage({ id: 'playground.index.tabVirtualman' })}
              </span>
            ),
            children: <VirtualmanPanel />,
          },
  ];

  return (
    <PageContainer
      title="Playground"
      subTitle={intl.formatMessage({ id: 'playground.index.subTitle' })}
    >
      <Tabs
        activeKey={activeTab}
        onChange={changeTab}
        items={tabItems.filter((t) => !HIDDEN_TABS.has(t.key))}
      />
    </PageContainer>
  );
}

async function consumeStream(
  res: Response,
  onChunk: (full: string, modelAt?: string) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('no body');
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const obj = JSON.parse(payload);
        if (obj?.error) {
          throw new Error(
            typeof obj.error === 'string' ? obj.error : JSON.stringify(obj.error),
          );
        }
        const delta = obj?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          full += delta;
          onChunk(full, typeof obj?.model === 'string' ? obj.model : undefined);
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes('JSON')) throw e;
      }
    }
  }
}
