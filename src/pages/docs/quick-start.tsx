import { history, Link } from '@umijs/max';
import { Button } from 'antd';
import { useAuthModal } from '@/components/AuthModalProvider';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function QuickStart() {
  const site = useSiteInfo();
  const { openAuthModal } = useAuthModal();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>快速开始</h1>
      <p>
        {site.name}对外暴露与 OpenAI 完全兼容的 HTTP API,几乎所有支持
        OpenAI 协议的 SDK / 第三方客户端都能直接接入,只需把 <code>base_url</code>{' '}
        指向本服务,并使用{site.name}签发的 API Key。
      </p>

      <Callout type="info" title="本页目标">
        <p style={{ margin: 0 }}>
          在 5 分钟内完成:注册账号 → 生成 API Key → 用 curl 或 SDK 发起第一次请求 → 拿到模型回复。
        </p>
      </Callout>

      <h2>1. 创建账户并生成 API Key</h2>
      <p>
        前往{' '}
        {site.register_enabled ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() =>
              openAuthModal({
                defaultTab: 'register',
                onSuccess: () => history.push('/console/tokens'),
              })
            }
          >
            免费注册
          </Button>
        ) : (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() =>
              openAuthModal({
                defaultTab: 'login',
                onSuccess: () => history.push('/console/tokens'),
              })
            }
          >
            登录
          </Button>
        )}
        ,登录后进入「控制台 → API
        Key」页,点击「新建 Token」即可拿到以 <code>sk-</code> 开头的密钥。
        也可以回到 <Link to="/">首页</Link>,在「选择模型,立即生成 API
        Key」区域直接为某个模型一键生成 Key。
      </p>

      <Callout type="warn" title="妥善保存 Key">
        <p style={{ margin: 0 }}>
          完整 Key 仅在创建时显示一次,关闭对话框后将只保留前缀,无法再次查看。
          建议立刻把 Key 存入你的密钥管理器(1Password / Bitwarden / .env 文件)。
        </p>
      </Callout>

      <h2>2. 请求基础信息</h2>
      <ul>
        <li>
          API Base:<code>{API_BASE}</code>
        </li>
        <li>
          认证方式:HTTP 头 <code>Authorization: Bearer sk-your-key</code>
        </li>
        <li>
          内容类型:<code>application/json</code>
        </li>
        <li>
          编码:统一 UTF-8,中文 / Emoji 直接传明文即可
        </li>
      </ul>

      <h2>3. 发起第一次请求</h2>
      <p>
        最简单的方式是用 curl 调一次 <code>/chat/completions</code>。
        把下面的 <code>sk-your-key</code> 换成你刚生成的 Key:
      </p>

      <TabbedCode
        snippets={[
          {
            key: 'curl',
            label: 'cURL',
            lang: 'bash',
            code: `curl ${API_BASE}/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "你是一名简洁的中文助手"},
      {"role": "user", "content": "用一句话介绍${site.name}"}
    ]
  }'`,
          },
          {
            key: 'python',
            label: 'Python (OpenAI SDK)',
            lang: 'python',
            code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-key",
    base_url="${API_BASE}",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "你是一名简洁的中文助手"},
        {"role": "user", "content": "用一句话介绍${site.name}"},
    ],
)
print(resp.choices[0].message.content)`,
          },
          {
            key: 'node',
            label: 'Node / TypeScript',
            lang: 'ts',
            code: `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-key',
  baseURL: '${API_BASE}',
});

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: '你是一名简洁的中文助手' },
    { role: 'user', content: '用一句话介绍${site.name}' },
  ],
});
console.log(resp.choices[0].message.content);`,
          },
        ]}
      />

      <h2>4. 解析返回</h2>
      <p>非流式返回的结构与 OpenAI 完全一致,关心的字段通常只有这些:</p>
      <CodeBlock
        lang="json"
        code={`{
  "id": "chatcmpl-xxxxxxx",
  "object": "chat.completion",
  "created": 1730000000,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "${site.name}是一个统一的 AI API 中转服务……"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 42,
    "total_tokens": 70
  }
}`}
      />
      <p>
        其中 <code>usage</code> 字段会作为本次扣费依据,可以在控制台「日志」页查到
        每次调用的实际 token 消耗与扣款金额。
      </p>

      <h2>5. 下一步</h2>
      <ul>
        <li>
          需要流式输出 → 看 <Link to="/docs/streaming">流式响应</Link>
        </li>
        <li>
          想换一个模型 → 看 <Link to="/docs/models">模型列表</Link> 与{' '}
          <Link to="/#pricing">定价</Link>
        </li>
        <li>
          调用失败拿到了状态码 → 看 <Link to="/docs/errors">错误码</Link>
        </li>
        <li>
          想接 Python / Node 之外的语言 → 看 <Link to="/docs/sdk">SDK 接入</Link>
        </li>
      </ul>
    </>
  );
}
