import { Link } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocStreaming() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>流式响应</h1>
      <p>
        给请求加上 <code>"stream": true</code> 即可让{site.name}以标准
        Server-Sent Events(SSE)协议逐 token 推送。所有兼容 OpenAI
        协议的客户端都能识别这种格式,无需额外适配。
      </p>

      <h2>开启方式</h2>
      <CodeBlock
        lang="bash"
        code={`curl -N ${API_BASE}/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"用一句话介绍${site.name}"}],
    "stream": true
  }'`}
      />
      <p>
        <code>-N</code> 让 curl 不缓冲,这样你能在终端看到 token 一个个吐出。
      </p>

      <h2>SSE 报文格式</h2>
      <p>每个事件以 <code>data:</code> 开头,空行表示一条事件结束:</p>
      <CodeBlock
        lang="text"
        code={`data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"content":"模"}}]}

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"content":"桥"}}]}

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"content":"是"}}]}

...

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":18,"total_tokens":30}}

data: [DONE]`}
      />
      <ul>
        <li>
          每条 <code>data:</code> 后面是一段 JSON,字段结构与非流式响应中的
          <code>choices[].message</code> 相同,只是把 <code>message</code>{' '}
          换成 <code>delta</code>。
        </li>
        <li>
          把所有 <code>delta.content</code> 拼接起来就是最终文本。
        </li>
        <li>
          最后一条事件是字符串字面量 <code>[DONE]</code>,客户端读到后关闭连接即可。
        </li>
        <li>
          <code>usage</code> 字段通常出现在倒数第二条事件里。
        </li>
      </ul>

      <Callout type="info" title="为什么收到的 usage 在最后">
        <p style={{ margin: 0 }}>
          流式协议下,直到模型停止生成才能准确统计输出 token 数,
          所以 <code>usage</code> 只会在结束帧出现一次。
        </p>
      </Callout>

      <h2>客户端解析</h2>
      <p>
        所有 OpenAI SDK 都已经把 SSE 解析封装好,直接 <code>for...of</code>{' '}
        / 迭代器消费即可:
      </p>

      <TabbedCode
        snippets={[
          {
            key: 'python',
            label: 'Python',
            lang: 'python',
            code: `from openai import OpenAI

client = OpenAI(api_key="sk-your-key", base_url="${API_BASE}")

stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "讲个笑话"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)
print()  # 收尾换行`,
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

const stream = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: '讲个笑话' }],
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
}
process.stdout.write('\\n');`,
          },
          {
            key: 'fetch',
            label: '原生 fetch (浏览器)',
            lang: 'ts',
            code: `const res = await fetch('${API_BASE}/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-your-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: '讲个笑话' }],
    stream: true,
  }),
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  // SSE 事件以空行分隔
  const events = buffer.split('\\n\\n');
  buffer = events.pop() ?? '';

  for (const evt of events) {
    const line = evt.split('\\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const data = line.slice(6);
    if (data === '[DONE]') return;
    const json = JSON.parse(data);
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) console.log(delta);
  }
}`,
          },
        ]}
      />

      <h2>常见坑</h2>
      <Callout type="warn" title="反向代理把流缓冲了">
        <p style={{ margin: 0 }}>
          如果你在 Nginx / 负载均衡 / Cloudflare 后面接{site.name},需要确认它们
          对 <code>text/event-stream</code> 不做缓冲。Nginx 至少要加{' '}
          <code>proxy_buffering off;</code>{' '}和{' '}
          <code>proxy_cache off;</code>,否则会出现「等很久,然后一次性吐出全部」的现象。
        </p>
      </Callout>

      <Callout type="warn" title="客户端要持续读">
        <p style={{ margin: 0 }}>
          流式请求是长连接,客户端必须持续读取直到 <code>[DONE]</code>。
          如果中途断开连接,{site.name}会继续向上游发送(直到上游结束)
          以避免计费遗漏,所以「断开 ≠ 停止扣费」,需要注意。
        </p>
      </Callout>

      <p>
        若收到的 SSE 在中途被截断或出现非法 JSON,请到{' '}
        <Link to="/console/logs/usage">控制台日志</Link>{' '}
        查看请求 ID 对应的上游响应,或者参考{' '}
        <Link to="/docs/errors">错误码</Link>。
      </p>
    </>
  );
}
