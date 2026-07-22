import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useIntl, useSearchParams } from '@umijs/max';
import { Button, Result, Spin } from 'antd';
import { apiURL } from '@/utils/request';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';

// 无限画布 tab:向后端要一个当前令牌专属的画布容器(POST /v1/canvas/session),
// 拿到 URL 后用 iframe 嵌入。令牌只用于鉴权 + 后端 seed 进容器,浏览器侧不透传给 iframe。
// 浮动「退出/新标签」小胶囊按钮样式(叠在全屏 iframe 之上)。
const pill: CSSProperties = {
  padding: '5px 14px',
  borderRadius: 16,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(4px)',
  fontSize: 12,
  lineHeight: '18px',
  color: '#333',
  cursor: 'pointer',
  textDecoration: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
  whiteSpace: 'nowrap',
};

// 折叠态的小圆钮(平时只露这个,不挡画布 UI)。
const round: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 20,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(255,255,255,0.9)',
  backdropFilter: 'blur(4px)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
  cursor: 'pointer',
  fontSize: 18,
  color: '#666',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

export default function CanvasPanel() {
  const intl = useIntl();
  const { apiKey } = usePlaygroundApiKey();
  const [params, setParams] = useSearchParams();
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0); // 变化即强制 iframe 重挂(重连/换 URL 时刷新)
  const [menuOpen, setMenuOpen] = useState(false); // 右下角控制钮是否展开

  // 退出全屏画布:清掉 ?tab=canvas 回到默认(对话)tab,本面板所在 tab 隐藏 → 全屏 iframe 随之消失。
  const exit = () => {
    const next = new URLSearchParams(params);
    next.delete('tab');
    setParams(next);
  };

  const open = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiURL('/v1/canvas/session'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = await res.json().catch(() => ({}));
      const url = json?.data?.url;
      if (!res.ok || json?.code !== 0 || !url) {
        throw new Error(json?.message || json?.error?.message || `HTTP ${res.status}`);
      }
      setSrc(url);
      setReloadKey((k) => k + 1); // 强制 iframe 重挂,救活可能已断的旧连接
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  // 心跳:定期过后端 POST session 刷新容器 lastSeen。
  // dev 下 iframe 直连容器、用户流量不经后端,不刷新会被空闲回收(reaper)误停;
  // 顺带若容器已被停,后端会自动 docker start 救活。4 分钟 << 30 分钟空闲阈值。
  const keepAlive = useCallback(async () => {
    if (!apiKey) return;
    try {
      await fetch(apiURL('/v1/canvas/session'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      // 忽略,下次心跳重试
    }
  }, [apiKey]);

  // 面板仅在切到该 tab 时挂载(= 用户意图使用画布),挂载即拉起容器。
  useEffect(() => {
    if (apiKey && !src && !loading && !error) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // src 就绪后启动心跳。
  useEffect(() => {
    if (!src || !apiKey) return undefined;
    const t = setInterval(keepAlive, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [src, apiKey, keepAlive]);

  if (!apiKey) {
    return (
      <div style={{ maxWidth: 420, margin: '48px auto' }}>
        <p style={{ color: '#666', marginBottom: 12 }}>
          {intl.formatMessage({ id: 'playground.index.canvasNeedKey' })}
        </p>
        <ApiKeyField />
      </div>
    );
  }

  if (error) {
    return (
      <Result
        status="warning"
        title={intl.formatMessage({ id: 'playground.index.canvasError' })}
        subTitle={error}
        extra={
          <Button type="primary" onClick={open}>
            {intl.formatMessage({ id: 'playground.index.canvasRetry' })}
          </Button>
        }
      />
    );
  }

  if (loading || !src) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#666' }}>
          {intl.formatMessage({ id: 'playground.index.canvasLoading' })}
        </div>
      </div>
    );
  }

  // 全屏铺满视口:position:fixed 覆盖整屏。切到别的 tab 时,本面板所在 tab 容器 display:none,
  // 其内 fixed 元素随之隐藏,不会残留遮挡。
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff' }}>
      <iframe
        key={reloadKey}
        src={src}
        title="canvas"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        allow="clipboard-read; clipboard-write"
      />
      {/* 右下角折叠控制:平时只有一个小圆钮,点开才展开,避免遮挡画布自身工具栏 */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        {menuOpen && (
          <>
            <span role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} style={pill}>
              {intl.formatMessage({ id: 'playground.index.canvasReconnect' })}
            </span>
            <a href={src} target="_blank" rel="noreferrer" style={pill}>
              {intl.formatMessage({ id: 'playground.index.canvasOpenNewTab' })}
            </a>
            <span role="button" tabIndex={0} onClick={exit} onKeyDown={(e) => e.key === 'Enter' && exit()} style={pill}>
              {intl.formatMessage({ id: 'playground.index.canvasExit' })}
            </span>
          </>
        )}
        <span
          role="button"
          tabIndex={0}
          title={intl.formatMessage({ id: 'playground.index.canvasMenu' })}
          onClick={() => setMenuOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Enter' && setMenuOpen((v) => !v)}
          style={round}
        >
          {menuOpen ? '×' : '⋯'}
        </span>
      </div>
    </div>
  );
}
