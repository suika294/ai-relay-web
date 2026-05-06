import {
  ClearOutlined,
  DeleteOutlined,
  MessageOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { Link } from '@umijs/max';
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
import { apiURL } from '@/utils/request';
import ImagePanel from './ImagePanel';
import VideoPanel from './VideoPanel';
import './playground.css';

const { TextArea } = Input;

type Role = 'system' | 'user' | 'assistant' | 'error';
type Msg = {
  role: Role;
  content: string;
  // model 仅 assistant 与 error 两种消息携带：
  //   - assistant: 上游实际生成这条回复的模型（优先 response.data.model，否则发送时选的）
  //   - error:     失败请求当时尝试的模型，便于定位是谁家返回的错
  // user 不带 model：选模型是侧边设置的事，不是"用户的身份"；历史里不冗余显示。
  model?: string;
  meta?: { code?: number | string; status?: number };
};

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
    return { color: '#0ea5e9', letter: '智' };
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
function saveSessions(list: Session[]) {
  localStorage.setItem(LS_SESSIONS, JSON.stringify(list.slice(0, 50)));
}
function newSession(): Session {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: '新会话',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}
function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + '…';
}

function ChatPanel() {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [tokens, setTokens] = useState<API.Token[]>([]);

  // 配置
  const [modelName, setModelName] = useState<string>();
  const [tokenId, setTokenId] = useState<number>();
  const [system, setSystem] = useState('你是一个乐于助人的助手。');
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
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      return {
        ...s,
        messages: msgs,
        title:
          (s.title === '新会话' || !s.title) && m.role === 'user'
            ? truncate(m.content, 24)
            : s.title,
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
    updateCurrent((s) => ({ ...s, messages: [], title: '新会话', updatedAt: Date.now() }));
  };

  const send = async () => {
    if (!input.trim()) return;
    if (!modelName) {
      message.warning('请选择模型');
      return;
    }
    if (!selectedToken) {
      message.warning('请先创建 API Key');
      return;
    }

    const userMsg: Msg = { role: 'user', content: input.trim() };
    appendMessage(userMsg);
    setInput('');
    setLoading(true);

    // 请求发出即占位：content='' 的 assistant 气泡 + 捕获此刻的 model 名。
    // 渲染层会把 content='' + loading 识别为"思考中…"动画；首字节到达就替换进去。
    const sentWith = modelName;
    appendMessage({ role: 'assistant', content: '', model: sentWith });

    // 构造给上游的 messages：过滤 error / 空占位，映射 role 类型
    const history = [...messages, userMsg]
      .filter((m) => m.role !== 'error' && m.content)
      .map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }));

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
        const content = data?.choices?.[0]?.message?.content ?? '(无内容)';
        const finalModel = data?.model || sentWith;
        await typewriter(content, finalModel, ctrl.signal);
      }
    } catch (e: any) {
      removePendingAssistant();
      if (e?.name === 'AbortError') {
        appendMessage({ role: 'error', content: '已中断本次请求', model: modelName });
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
            <span>会话记录</span>
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
              新建
            </Button>
          </div>
          {sessions.length === 0 ? (
            <div className="pg-session-empty">暂无会话</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`pg-session-item ${s.id === currentId ? 'active' : ''}`}
                onClick={() => setCurrentId(s.id)}
              >
                <div className="pg-session-title">{s.title || '未命名'}</div>
                <div className="pg-session-meta">
                  <span>{s.messages.length} 条</span>
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
                  title="删除此会话？"
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
                <Empty description="发一条消息开始对话" />
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
                          请求出错
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
                    {isPending ? (
                      <span className="pg-thinking">
                        思考中
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
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息；Ctrl/Cmd + Enter 发送"
              autoSize={{ minRows: 2, maxRows: 6 }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (!loading) send();
                }
              }}
              disabled={loading}
            />
            <Space style={{ marginTop: 8, width: '100%', justifyContent: 'space-between' }}>
              <Button
                icon={<ClearOutlined />}
                onClick={clearCurrent}
                disabled={messages.length === 0}
              >
                清空当前
              </Button>
              {loading ? (
                <Button danger icon={<StopOutlined />} onClick={stop}>
                  中断
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={send}
                  disabled={!input.trim()}
                >
                  发送
                </Button>
              )}
            </Space>
          </div>
        </div>

        {/* 右：设置 */}
        <div className="pg-settings">
          <h4>设置</h4>
          {tokens.length === 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={
                <span>
                  还没有可用的 API Key。<Link to="/console/tokens">去创建</Link>
                </span>
              }
            />
          )}

          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <div style={{ fontSize: 12, color: '#666' }}>模型</div>
              <Select
                value={modelName}
                onChange={setModelName}
                options={models}
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                placeholder="选择模型"
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#666' }}>API Key</div>
              <Select
                value={tokenId}
                onChange={setTokenId}
                options={tokens.map((t) => ({
                  value: t.id,
                  label: `${t.name || '未命名'} (${t.key_prefix}***)`,
                }))}
                style={{ width: '100%' }}
                placeholder="选择 Token"
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#666' }}>System Prompt</div>
              <TextArea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 6 }}
                placeholder="可选；为空则不发送"
              />
            </div>

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13 }}>流式输出</span>
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
  return (
    <PageContainer
      title="Playground"
      subTitle="在线调试对话 / 图像 / 视频 API(走你自己的 Key,请求和第三方集成完全一致)"
    >
      <Tabs
        defaultActiveKey="chat"
        items={[
          {
            key: 'chat',
            label: (
              <span>
                <MessageOutlined /> 对话
              </span>
            ),
            children: <ChatPanel />,
          },
          {
            key: 'image',
            label: (
              <span>
                <PictureOutlined /> 图像
              </span>
            ),
            children: <ImagePanel />,
          },
          {
            key: 'video',
            label: (
              <span>
                <VideoCameraOutlined /> 视频
              </span>
            ),
            children: <VideoPanel />,
          },
        ]}
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
