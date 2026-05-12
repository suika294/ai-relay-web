import { Link } from '@umijs/max';
import { API_BASE, Callout, CodeBlock } from './_shared';

export default function DocEmbeddings() {
  return (
    <>
      <h1>向量 Embeddings</h1>
      <p>
        模桥的向量接口与 OpenAI <code>/v1/embeddings</code> 协议一致,
        可以转发至 OpenAI <code>text-embedding-3</code> 系列、BGE、Qwen 等
        多家向量模型,常用于 RAG / 语义搜索 / 推荐 / 聚类等场景。
      </p>

      <h2>请求</h2>
      <p>
        <code>POST {API_BASE}/embeddings</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/embeddings \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-3-small",
    "input": "模桥是一个统一的 AI API 中转服务"
  }'`}
      />

      <h3>请求字段</h3>
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
                向量模型 ID,完整列表见{' '}
                <Link to="/docs/models">模型列表</Link>(<code>embedding</code> 类型)。
              </td>
            </tr>
            <tr>
              <td>
                <code>input</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>string / array</td>
              <td>
                需要向量化的文本。批量传 array 时,每个元素被独立向量化,
                响应里的 <code>data</code> 也按相同顺序返回。
              </td>
            </tr>
            <tr>
              <td>
                <code>dimensions</code>
              </td>
              <td>integer</td>
              <td>
                指定输出维度,仅 OpenAI text-embedding-3 系列支持。
                不传则使用模型默认维度。
              </td>
            </tr>
            <tr>
              <td>
                <code>encoding_format</code>
              </td>
              <td>string</td>
              <td>
                <code>float</code>(默认,返回浮点数组)/{' '}
                <code>base64</code>(返回 base64 编码的二进制,节省带宽)。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>批量请求</h2>
      <p>
        把 <code>input</code> 传成数组,可以一次拿到多条向量,
        相比循环单条调用便宜很多(对计费按总 token 数,但能少摊一次握手成本):
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "text-embedding-3-small",
  "input": [
    "什么是模桥",
    "如何创建 API Key",
    "支持哪些上游厂商"
  ]
}`}
      />

      <h2>响应</h2>
      <CodeBlock
        lang="json"
        code={`{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0123, -0.0456, 0.0789, ...]
    },
    {
      "object": "embedding",
      "index": 1,
      "embedding": [...]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 18,
    "total_tokens": 18
  }
}`}
      />
      <ul>
        <li>
          <code>data[].embedding</code> 是浮点数组,长度等于模型维度(例如
          1536 / 3072)。
        </li>
        <li>
          顺序与请求 <code>input</code> 严格对应,可以通过{' '}
          <code>index</code> 字段再校验。
        </li>
        <li>
          <code>usage.prompt_tokens</code> 用于按输入价计费。
        </li>
      </ul>

      <Callout type="info" title="存储与召回">
        <p style={{ margin: 0 }}>
          向量本身是一段固定长度的浮点数组,可以直接存进 PgVector / Milvus /
          Qdrant 等向量数据库,召回时再调一次相同模型把 query 向量化,
          做余弦 / 内积相似度即可。
        </p>
      </Callout>

      <Callout type="warn" title="维度对齐">
        <p style={{ margin: 0 }}>
          库里存的向量与查询向量必须用 <strong>同一个模型 + 同一个维度</strong>{' '}
          生成,否则相似度计算无意义。切换向量模型通常需要重新向量化全库。
        </p>
      </Callout>
    </>
  );
}
