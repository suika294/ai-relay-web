// Docs 子页共用的小组件:CodeBlock(带语言标 + 复制按钮)、Callout(提示框)、
// ApiTable(横向滚动表格)、TabbedCode(多语言代码切换)。统一在这里维护,避免每个
// 子页都重写一份样式/复制逻辑。
import { Tabs } from 'antd';
import { useState, type ReactNode } from 'react';
import { useSiteInfo } from '@/hooks/useSiteInfo';

export function CodeBlock({
  lang,
  code,
}: {
  lang?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 用户没授权剪贴板就静默失败,反正下面 pre 里全文都看得到 */
    }
  };
  return (
    <div className={`code-block${lang ? ' has-lang' : ''}`}>
      {lang && <span className="code-block-lang">{lang}</span>}
      <button
        type="button"
        className={`code-block-copy${copied ? ' copied' : ''}`}
        onClick={onCopy}
      >
        {copied ? '已复制' : '复制'}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Callout({
  type = 'info',
  title,
  children,
}: {
  type?: 'info' | 'warn' | 'success' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const iconMap: Record<string, string> = {
    info: 'i',
    warn: '!',
    success: '✓',
    danger: '×',
  };
  return (
    <div className={`docs-callout docs-callout-${type}`}>
      <span className="docs-callout-icon" aria-hidden>
        {iconMap[type]}
      </span>
      <div>
        {title && (
          <p style={{ fontWeight: 600, marginBottom: 4 }}>{title}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export function ApiTable({ children }: { children: ReactNode }) {
  return <div className="docs-table-wrap">{children}</div>;
}

/**
 * 多语言代码切换。snippets: [{ key, label, lang, code }]
 */
export function TabbedCode({
  snippets,
}: {
  snippets: { key: string; label: string; lang?: string; code: string }[];
}) {
  return (
    <div className="docs-tabs">
      <Tabs
        items={snippets.map((s) => ({
          key: s.key,
          label: s.label,
          children: <CodeBlock lang={s.lang} code={s.code} />,
        }))}
      />
    </div>
  );
}

// useApiBase —— 文档示例里展示的 API base_url。优先级:
//   1. 后台 system_configs.site.api_base(管理员显式覆盖,改完即时生效)
//   2. 构建时注入的 UMI_APP_API_BASE_URL(部署时按真实网关域名配置,见 .umirc.ts)
//   3. 当前页面 origin(用户在浏览器看到什么域名,文档里就给什么域名,
//      避免出现误导性的 localhost:8080)
// 三档之间都自动去掉末尾的 / 后再拼 /v1,保证 curl 复制粘贴能直接跑。
//
// 注:这里必须是 hook 而不是 const —— const 在模块加载时求值,那时 siteInfo
// 还没拉回来;hook 每次渲染读 initialState,后台改完刷新页面就能看到。
export function useApiBase(): string {
  const site = useSiteInfo();
  if (site.api_base) return site.api_base.replace(/\/+$/, '') + '/v1';
  const fromEnv = process.env.UMI_APP_API_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '') + '/v1';
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + '/v1';
  }
  return '/v1';
}
