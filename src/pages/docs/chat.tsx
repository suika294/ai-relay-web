import { Link } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocChat() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>对话 Chat Completions</h1>
      <p>
        {site.name}最核心的接口,行为与 OpenAI{' '}
        <code>/v1/chat/completions</code> 完全一致。所有上游厂商
        (Anthropic / Gemini / DeepSeek / Qwen / GLM ...)的对话能力都通过
        这个接口统一暴露。
      </p>

      <h2>请求</h2>
      <p>
        <code>POST {API_BASE}/chat/completions</code>
      </p>

      <h3>请求体字段</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>字段</th>
              <th style={{ width: 100 }}>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>string</td>
              <td>
                模型 ID,例如 <code>gpt-4o-mini</code>、
                <code>claude-3-5-sonnet</code>、<code>deepseek-chat</code>。
                完整列表见{' '}
                <Link to="/docs/models">模型列表</Link>。
              </td>
            </tr>
            <tr>
              <td>
                <code>messages</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>array</td>
              <td>
                按对话顺序排列的消息数组,每条形如
                <code>{'{role, content}'}</code>。role 取值见下方说明。
              </td>
            </tr>
            <tr>
              <td>
                <code>stream</code>
              </td>
              <td>boolean</td>
              <td>
                是否使用流式 SSE 返回,默认 <code>false</code>。开启后请按{' '}
                <Link to="/docs/streaming">流式响应</Link>{' '}
                里的方式解析。
              </td>
            </tr>
            <tr>
              <td>
                <code>temperature</code>
              </td>
              <td>number</td>
              <td>
                采样温度,<code>0 ~ 2</code>。值越高输出越随机,需要稳定结果传 0。
              </td>
            </tr>
            <tr>
              <td>
                <code>top_p</code>
              </td>
              <td>number</td>
              <td>
                核采样阈值,<code>0 ~ 1</code>。一般与 temperature 二选一使用。
              </td>
            </tr>
            <tr>
              <td>
                <code>max_tokens</code>
              </td>
              <td>integer</td>
              <td>本次回复最多生成的 token 数。不传则使用模型默认值。</td>
            </tr>
            <tr>
              <td>
                <code>stop</code>
              </td>
              <td>string / array</td>
              <td>
                遇到这些字符串则提前停止生成,最多 4 个。
              </td>
            </tr>
            <tr>
              <td>
                <code>presence_penalty</code>
              </td>
              <td>number</td>
              <td>
                <code>-2 ~ 2</code>,正值鼓励模型谈论新话题。
              </td>
            </tr>
            <tr>
              <td>
                <code>frequency_penalty</code>
              </td>
              <td>number</td>
              <td>
                <code>-2 ~ 2</code>,正值降低重复用词倾向。
              </td>
            </tr>
            <tr>
              <td>
                <code>tools</code>
              </td>
              <td>array</td>
              <td>
                工具调用(Function Calling)定义,具体格式与 OpenAI
                官方文档相同。仅部分模型支持,详见{' '}
                <Link to="/docs/models">模型列表</Link>。
              </td>
            </tr>
            <tr>
              <td>
                <code>tool_choice</code>
              </td>
              <td>string / object</td>
              <td>
                控制是否调用工具:<code>auto</code> / <code>none</code> / 指定工具。
              </td>
            </tr>
            <tr>
              <td>
                <code>response_format</code>
              </td>
              <td>object</td>
              <td>
                <code>{'{ type: "json_object" }'}</code>{' '}
                强制 JSON 输出,仅部分模型支持。
              </td>
            </tr>
            <tr>
              <td>
                <code>user</code>
              </td>
              <td>string</td>
              <td>
                你侧的最终用户标识,会原样透传到上游,便于风控与审计。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>messages 数组中的 role</h3>
      <ul>
        <li>
          <code>system</code> —— 系统提示词,放在数组首位,用于设定角色、风格、约束。
        </li>
        <li>
          <code>user</code> —— 用户当前发言。
        </li>
        <li>
          <code>assistant</code> —— 模型上一轮回复,多轮对话时把它原样拼回去。
        </li>
        <li>
          <code>tool</code> —— 工具调用的执行结果,需要带上对应的{' '}
          <code>tool_call_id</code>。
        </li>
      </ul>

      <h2 id="vision">图片输入 (Vision)</h2>
      <p>
        支持视觉理解的模型(GPT-4o / Claude 3.5 Sonnet / Gemini 1.5+ / Qwen-VL 等)可在
        <code>messages[].content</code> 里以 <strong>数组</strong> 形式混合文字 + 图片。
        语法与 OpenAI 完全一致,图片可以传 <strong>HTTP URL</strong>{' '}
        或 <strong>data URL (base64 内联)</strong>。
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "这张图里有什么?" },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/photo.jpg"
          }
        }
      ]
    }
  ]
}`}
      />
      <CodeBlock
        lang="json"
        code={`{
  "role": "user",
  "content": [
    { "type": "text", "text": "帮我读一下这张截图里的中文" },
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
      }
    }
  ]
}`}
      />
      <ul>
        <li>
          <strong>URL 与 base64 二选一</strong>:URL 必须公网可达(上游会自行下载);
          base64 适合本地文件 / 隐私图片,但单图建议 ≤ 4MB,超过容易 413 / 超时。
        </li>
        <li>
          <strong>多图</strong>:一个 <code>messages[]</code> 里可以塞多张图;一些模型
          会对总像素 / 总张数有上限,详见上游官方文档。
        </li>
        <li>
          <strong>计费</strong>:图片输入会按"image_input tokens"单独计费,与文本 token
          分开记录在 <code>usage</code> 里。
        </li>
        <li>
          需要"图像生成 / 图生图"的请走 <Link to="/docs/images">图像生成</Link> 接口
          (<code>/v1/images/generations</code>),不要在 chat 里要求模型"生成一张图"。
        </li>
      </ul>

      <h2>请求示例</h2>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "你是一名 SQL 工程师"},
      {"role": "user", "content": "把 users 表里最近 7 天注册的用户挑出来"}
    ],
    "temperature": 0.2,
    "max_tokens": 256
  }'`}
      />

      <h2>响应</h2>
      <p>
        非流式调用一次性返回完整对象,字段与 OpenAI 一致;字段含义对照表:
      </p>
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
        "content": "SELECT * FROM users WHERE created_at >= NOW() - INTERVAL '7 day';"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 36,
    "completion_tokens": 25,
    "total_tokens": 61
  }
}`}
      />

      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>字段</th>
              <th>含义</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>id</code>
              </td>
              <td>本次调用的唯一 ID,排查问题时把它发给客服可以快速定位。</td>
            </tr>
            <tr>
              <td>
                <code>model</code>
              </td>
              <td>实际命中的模型 ID(可能与请求传入的略有差异,例如版本对齐)。</td>
            </tr>
            <tr>
              <td>
                <code>choices[].message.content</code>
              </td>
              <td>模型生成的最终文本。</td>
            </tr>
            <tr>
              <td>
                <code>choices[].finish_reason</code>
              </td>
              <td>
                结束原因:<code>stop</code>(正常)/{' '}
                <code>length</code>(触发 max_tokens)/{' '}
                <code>tool_calls</code>(需调用工具)/{' '}
                <code>content_filter</code>(命中安全)。
              </td>
            </tr>
            <tr>
              <td>
                <code>usage.prompt_tokens</code>
              </td>
              <td>请求消耗的输入 token 数,用于按输入价计费。</td>
            </tr>
            <tr>
              <td>
                <code>usage.completion_tokens</code>
              </td>
              <td>响应消耗的输出 token 数,用于按输出价计费。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout type="info" title="多轮对话">
        <p style={{ margin: 0 }}>
          {site.name}本身不存对话历史 —— 每次请求都把完整 <code>messages</code>{' '}
          发过来,服务端不会自动拼接。所以历史轮数由你侧维护,
          太长可以截断或本地做摘要再发。
        </p>
      </Callout>
    </>
  );
}
