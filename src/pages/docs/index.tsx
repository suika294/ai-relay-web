import { Alert, Typography } from 'antd';
import PublicLayout from '@/layouts/PublicLayout';

const { Paragraph } = Typography;

export default function Docs() {
  return (
    <PublicLayout>
      <div className="docs-page">
        <h1>快速开始</h1>
        <Alert
          message="AI Relay 对外暴露 OpenAI 兼容接口，几乎所有 OpenAI SDK / 第三方客户端都能直接使用，只需把 base_url 指向本服务。"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <h2>1. 注册并创建 API Key</h2>
        <p>注册账户后进入"控制台 → API Key"页面，点击"新建 Token"即可得到 <code>sk-...</code> 格式的密钥。</p>

        <h2>2. 发起请求（curl）</h2>
        <Paragraph copyable>
          <pre>{`curl -N http://localhost:8080/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"你好"}],
    "stream": true
  }'`}</pre>
        </Paragraph>

        <h2>3. OpenAI Python SDK</h2>
        <Paragraph copyable>
          <pre>{`from openai import OpenAI

client = OpenAI(
    api_key="sk-your-key",
    base_url="http://localhost:8080/v1",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`}</pre>
        </Paragraph>

        <h2>4. Node / TypeScript</h2>
        <Paragraph copyable>
          <pre>{`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-key',
  baseURL: 'http://localhost:8080/v1',
});

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: '你好' }],
});
console.log(resp.choices[0].message.content);`}</pre>
        </Paragraph>

        <h2>5. 流式响应</h2>
        <p>在请求 body 中加上 <code>"stream": true</code>，服务端会以标准 SSE 协议逐块返回：</p>
        <Paragraph copyable>
          <pre>{`data: {"choices":[{"delta":{"content":"你"}}]}
data: {"choices":[{"delta":{"content":"好"}}]}
data: [DONE]`}</pre>
        </Paragraph>

        <h2>支持的接口</h2>
        <ul>
          <li><code>POST /v1/chat/completions</code> — Chat（含流式）</li>
          <li><code>POST /v1/embeddings</code> — 文本嵌入（开发中）</li>
          <li><code>POST /v1/images/generations</code> — 图像生成（开发中）</li>
          <li><code>GET /v1/models</code> — 可用模型列表</li>
        </ul>

        <h2>可用模型</h2>
        <p>参见 <a href="/pricing">定价页</a>，或调用 <code>GET /v1/models</code>。</p>

        <h2>支持</h2>
        <p>遇到问题？查看 <a href="/pricing">定价</a> 或在控制台"使用日志"页面排查每次请求的详情。</p>
      </div>
    </PublicLayout>
  );
}
