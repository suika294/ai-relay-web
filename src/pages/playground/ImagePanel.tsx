import {
  DownloadOutlined,
  HistoryOutlined,
  LoadingOutlined,
  PictureOutlined,
  SendOutlined,
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
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { systemApi, tokenApi } from '@/services/api';
import MediaHistoryDrawer from './MediaHistoryDrawer';

const { TextArea } = Input;

// 错误响应里挖 message(兼容 /v1 新 OpenAI 外壳 {error:{message}} 与旧 {message})
function extractErrMsg(raw: string, httpStatus: number): string {
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.message || raw.slice(0, 500);
  } catch {
    return raw ? raw.slice(0, 500) : `HTTP ${httpStatus}`;
  }
}

type ImageItem = { url?: string; b64_json?: string };

const SIZE_OPTIONS = [
  { value: '512x512', label: '512 × 512' },
  { value: '1024x1024', label: '1024 × 1024' },
  { value: '1024x1792', label: '1024 × 1792(竖)' },
  { value: '1792x1024', label: '1792 × 1024(横)' },
];

export default function ImagePanel() {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [modelName, setModelName] = useState<string>();
  const [tokenId, setTokenId] = useState<number>();
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<string | undefined>('1024x1024');
  const [n, setN] = useState(1);

  // 状态机:idle → loading → success | error,每次提交重置
  type Phase = 'idle' | 'loading' | 'success' | 'error';
  const [phase, setPhase] = useState<Phase>('idle');
  const [items, setItems] = useState<ImageItem[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // 计时器:loading 时每 100ms tick 一次,进度条用这个驱动
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const startAtRef = useRef<number>(0);

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
    return () => {
      if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const selectedToken = tokens.find((t) => t.id === tokenId);
  const tokenAllowsModel =
    !selectedToken?.allowed_models?.length ||
    selectedToken.allowed_models.includes(modelName || '');

  const startTimer = () => {
    startAtRef.current = Date.now();
    setElapsedMs(0);
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startAtRef.current);
    }, 100);
  };
  const stopTimer = () => {
    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const submit = async () => {
    if (!prompt.trim()) return message.warning('请输入提示词');
    if (!modelName) return message.warning('请选择模型');
    if (!selectedToken) return message.warning('请先创建 API Key');
    if (!tokenAllowsModel)
      return message.warning(`当前 Key 限制了可用模型,不包含 ${modelName}`);

    setPhase('loading');
    setItems([]);
    setErrMsg(null);
    startTimer();

    try {
      const res = await fetch('/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedToken.key}`,
        },
        body: JSON.stringify({
          model: modelName,
          prompt: prompt.trim(),
          n,
          size,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        setErrMsg(extractErrMsg(text, res.status));
        setPhase('error');
        return;
      }
      const data = JSON.parse(text);
      setItems((data?.data as ImageItem[]) || []);
      setPhase('success');
    } catch (e: any) {
      setErrMsg(String(e?.message || e));
      setPhase('error');
    } finally {
      stopTimer();
    }
  };

  const reset = () => {
    setPhase('idle');
    setItems([]);
    setErrMsg(null);
    setElapsedMs(0);
  };

  const elapsedText = (elapsedMs / 1000).toFixed(1) + 's';

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
                POST /v1/images/generations
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
                disabled={phase === 'loading'}
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
                disabled={phase === 'loading'}
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
                  disabled={phase === 'loading'}
                />
              </div>
              <div style={{ width: 120 }}>
                <div style={labelStyle}>张数</div>
                <Select
                  style={{ width: '100%' }}
                  value={n}
                  onChange={setN}
                  options={[1, 2, 3, 4].map((v) => ({ value: v, label: `${v} 张` }))}
                  disabled={phase === 'loading'}
                />
              </div>
            </div>
            <div>
              <div style={labelStyle}>提示词</div>
              <TextArea
                placeholder="例如:a watercolor painting of a cat flying over Shanghai at night"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoSize={{ minRows: 4, maxRows: 8 }}
                disabled={phase === 'loading'}
              />
            </div>
            <Button
              type="primary"
              size="large"
              block
              icon={phase === 'loading' ? <LoadingOutlined /> : <SendOutlined />}
              onClick={submit}
              loading={phase === 'loading'}
              disabled={!prompt.trim() || !modelName || !selectedToken}
            >
              {phase === 'loading' ? `生成中 · ${elapsedText}` : '生成图片'}
            </Button>
          </Space>
        </Card>

        {/* 右侧:结果预览 */}
        <Card
          style={{ flex: '1 1 440px', minWidth: 360 }}
          title={<span>预览</span>}
          extra={
            phase === 'success' || phase === 'error' ? (
              <Button size="small" onClick={reset}>
                清空
              </Button>
            ) : null
          }
        >
          {phase === 'idle' && (
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

          {phase === 'loading' && (
            <div style={placeholderWrap}>
              <Spin
                indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />}
                size="large"
              />
              <div style={{ marginTop: 18, color: '#555', fontWeight: 500 }}>
                正在生成图片...
              </div>
              <div style={{ marginTop: 6, color: '#888', fontSize: 13 }}>
                已用时 <b>{elapsedText}</b> ·{' '}
                {modelName && <Tag color="blue">{modelName}</Tag>}
              </div>
              <div style={{ marginTop: 16, color: '#bbb', fontSize: 12 }}>
                图像模型通常 3–15 秒返回,请稍候
              </div>
            </div>
          )}

          {phase === 'error' && errMsg && (
            <Alert
              type="error"
              showIcon
              message="生成失败"
              description={errMsg}
              style={{ marginTop: 4 }}
            />
          )}

          {phase === 'success' && items.length > 0 && (
            <div>
              <div
                style={{
                  color: '#52c41a',
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                ✓ 生成完成 · 用时 {elapsedText} · 共 {items.length} 张
              </div>
              <Space wrap size="middle">
                {items.map((it, i) => {
                  const src =
                    it.url ||
                    (it.b64_json ? `data:image/png;base64,${it.b64_json}` : '');
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
                          download={`image-${Date.now()}-${i}.png`}
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
        💡 这里的请求完全等同于第三方用 <code>openai</code> SDK 直接调我们的
        <code> /v1/images/generations</code>,走的也是你自己选择的 API Key。测试通过就等于生产通过。
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
