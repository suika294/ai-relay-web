// Docs 子页共用的小组件:CodeBlock(带语言标 + 复制按钮)、Callout(提示框)、
// ApiTable(横向滚动表格)、TabbedCode(多语言代码切换)。统一在这里维护,避免每个
// 子页都重写一份样式/复制逻辑。
import { Tabs } from 'antd';
import { useState, type ReactNode } from 'react';

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

// 各子页统一引用同一个 API_BASE,以后切线上域名只改一处。
// 注:模桥前端在 dev 把 /v1 反代到后端 8080;线上部署后,这里替换成实际网关 URL。
export const API_BASE = 'http://localhost:8080/v1';
