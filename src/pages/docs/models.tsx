import { Link } from '@umijs/max';
import { API_BASE, Callout, CodeBlock } from './_shared';

export default function DocModels() {
  return (
    <>
      <h1>模型列表</h1>
      <p>
        模桥已聚合 OpenAI、Anthropic、Google Gemini、DeepSeek、Qwen、GLM、
        Moonshot 等多家厂商的主流模型。可以通过{' '}
        <Link to="/#pricing">首页定价</Link>{' '}
        浏览全部模型与价格,或调用 <code>/v1/models</code> 接口拉取。
      </p>

      <h2>查询所有可调模型</h2>
      <p>
        <code>GET {API_BASE}/models</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/models \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>响应示例:</p>
      <CodeBlock
        lang="json"
        code={`{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 1715000000,
      "owned_by": "openai"
    },
    {
      "id": "claude-3-5-sonnet",
      "object": "model",
      "created": 1716000000,
      "owned_by": "anthropic"
    },
    {
      "id": "deepseek-chat",
      "object": "model",
      "created": 1717000000,
      "owned_by": "deepseek"
    }
  ]
}`}
      />

      <Callout type="info" title="返回的是『当前 Key 可调用』的模型">
        <p style={{ margin: 0 }}>
          如果在创建 Key 时勾选了「限制模型」,这里只会列出被允许的那几个模型。
          想看平台上的全量模型,直接到{' '}
          <Link to="/#pricing">首页定价</Link>。
        </p>
      </Callout>

      <h2>模型 ID 命名规则</h2>
      <ul>
        <li>
          上游厂商已经公布的官方模型,模桥保留原 ID,例如{' '}
          <code>gpt-4o-mini</code>、<code>claude-3-5-sonnet</code>、
          <code>deepseek-chat</code>、<code>qwen-max</code>。
        </li>
        <li>
          少数情况下,同名模型在不同上游之间有差异,模桥会在 ID 后加后缀区分,
          例如 <code>kimi-code</code>、<code>glm-code</code>。
        </li>
        <li>
          ID 大小写敏感,请求时按返回里的字面写法填入 <code>model</code> 字段。
        </li>
      </ul>

      <h2>模型类型</h2>
      <p>模桥按用途把模型分为以下几类:</p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 140 }}>类型</th>
              <th style={{ width: 240 }}>对应接口</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>chat</code>
              </td>
              <td>
                <code>/v1/chat/completions</code>
              </td>
              <td>
                通用对话模型,主力。详见{' '}
                <Link to="/docs/chat">对话 Chat</Link>。
              </td>
            </tr>
            <tr>
              <td>
                <code>image</code>
              </td>
              <td>
                <code>/v1/images/generations</code>
              </td>
              <td>
                文生图模型,详见{' '}
                <Link to="/docs/images">图像生成</Link>。
              </td>
            </tr>
            <tr>
              <td>
                <code>video</code>
              </td>
              <td>
                <code>/v1/videos/generations</code>
              </td>
              <td>
                视频生成模型,具体参数请联系客服 / 控制台 Playground。
              </td>
            </tr>
            <tr>
              <td>
                <code>embedding</code>
              </td>
              <td>
                <code>/v1/embeddings</code>
              </td>
              <td>
                向量化模型,详见{' '}
                <Link to="/docs/embeddings">向量 Embeddings</Link>。
              </td>
            </tr>
            <tr>
              <td>
                <code>audio</code>
              </td>
              <td>
                <code>/v1/audio/*</code>
              </td>
              <td>语音转写 / 合成,接口对齐 OpenAI 同名端点。</td>
            </tr>
            <tr>
              <td>
                <code>rerank</code>
              </td>
              <td>
                <code>/v1/rerank</code>
              </td>
              <td>检索重排,搜索 / RAG 链路常用。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>选型建议</h2>
      <ul>
        <li>
          <strong>追求性价比</strong>:Google <code>gemini-1.5-flash</code>、
          OpenAI <code>gpt-4o-mini</code>、DeepSeek <code>deepseek-chat</code>。
        </li>
        <li>
          <strong>追求质量</strong>:Anthropic <code>claude-3-5-sonnet</code>、
          OpenAI <code>gpt-4o</code> / <code>o1</code> 系列。
        </li>
        <li>
          <strong>长文本</strong>:首选 Anthropic Claude 全系(200K)、
          Kimi、Gemini。
        </li>
        <li>
          <strong>代码场景</strong>:<code>kimi-code</code>、
          <code>glm-code</code>、<code>claude-3-5-sonnet</code>。
        </li>
        <li>
          <strong>中文敏感场景</strong>:Qwen / GLM / Moonshot 国产模型,
          在中文表达和合规上更稳。
        </li>
      </ul>
      <p>
        想看具体输入价 / 输出价 / 上下文长度,可以到{' '}
        <Link to="/#pricing">首页定价</Link> 直接对照。
      </p>
    </>
  );
}
