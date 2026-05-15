import { Link } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocVectorDB() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>向量数据库 VectorDB</h1>
      <p>
        {site.name}的向量数据库接口覆盖 <strong>upsert / search / delete</strong> 三个
        运行时数据面动作,当前由腾讯云向量数据库(<code>channel.type=tcvector</code>)
        承接。collection / database 的 schema 管理仍保留在上游控制台。
      </p>

      <Callout type="info" title="与 /v1/embeddings 的关系">
        <p style={{ margin: 0 }}>
          {site.name}本身仍是统一 OpenAI 风格转发,<Link to="/docs/embeddings">向量化</Link>
          请走 <code>/v1/embeddings</code>;本接口是 <em>已经有向量后</em> 的存储与检索,
          解决「自建一台 Milvus / PgVector 太重」的场景。两个接口可以来自不同上游
          (例如向量化用 OpenAI,存储检索用腾讯云)。
        </p>
      </Callout>

      <h2>请求路由</h2>
      <ul>
        <li>统一前缀 <code>{API_BASE}/vectordb/</code>,鉴权与 chat / embeddings 一致(<code>Authorization: Bearer sk-...</code>)。</li>
        <li>按 <code>channel.type</code> 直接路由,body 内 <code>channel</code> 字段可显式点名指定具体渠道。</li>
        <li>腾讯云向量库走独立 Bearer Token 鉴权({site.name}内部用 <code>account + api_key</code>{' '}
          组合签发,调用方只需用 <code>sk-...</code>),不要把腾讯云的 api_key 直接发给本接口。</li>
      </ul>

      <h2 id="upsert">upsert · 写入 / 更新</h2>
      <p><code>POST {API_BASE}/vectordb/upsert</code></p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/vectordb/upsert \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "database": "rag",
    "collection": "docs",
    "build_index": true,
    "documents": [
      {
        "id": "doc-001",
        "vector": [0.0123, -0.0456, 0.0789, ...],
        "text": "向量数据库快速入门",
        "fields": { "lang": "zh", "category": "tutorial" }
      }
    ]
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
                <code>database</code> / <code>collection</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>string</td>
              <td>命名空间 + 集合名。collection 需要先在腾讯云控制台创建并指定维度。</td>
            </tr>
            <tr>
              <td>
                <code>documents</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>array</td>
              <td>
                文档数组,每条:<code>id</code>(主键,upsert 语义)、<code>vector</code>(浮点
                数组,维度必须与 collection 一致)、<code>text</code>(原文,可选)、
                <code>fields</code>(过滤字段,任意 K-V,用于后续 filter 条件)。
              </td>
            </tr>
            <tr>
              <td>
                <code>build_index</code>
              </td>
              <td>boolean</td>
              <td>是否在 upsert 后立即触发建索引;否则按上游策略后台异步建。</td>
            </tr>
            <tr>
              <td>
                <code>channel</code>
              </td>
              <td>string</td>
              <td>可选,显式指定渠道名。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="search">search · 相似度检索</h2>
      <p>
        <code>POST {API_BASE}/vectordb/search</code> · <strong>vector 与 text 二选一</strong>:
        <code>vector</code> 走原生 ANN 检索;<code>text</code> 借助上游内置 embedding
        自动向量化(免你侧再发一次 <code>/v1/embeddings</code>,但与你存储时的向量化模型
        可能不同,首选 vector 模式)。
      </p>
      <TabbedCode
        snippets={[
          {
            key: 'vector',
            label: 'vector 模式',
            lang: 'bash',
            code: `curl ${API_BASE}/vectordb/search \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "database": "rag",
    "collection": "docs",
    "vector": [0.0123, -0.0456, 0.0789, ...],
    "limit": 5,
    "filter": "lang = \\"zh\\" AND category in (\\"tutorial\\", \\"faq\\")",
    "output_fields": ["text", "lang", "category"]
  }'`,
          },
          {
            key: 'text',
            label: 'text 模式 (上游自动向量化)',
            lang: 'bash',
            code: `curl ${API_BASE}/vectordb/search \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "database": "rag",
    "collection": "docs",
    "text": "向量数据库怎么入门",
    "limit": 5
  }'`,
          },
        ]}
      />

      <h3>响应</h3>
      <CodeBlock
        lang="json"
        code={`{
  "documents": [
    {
      "id": "doc-001",
      "score": 0.9123,
      "text": "向量数据库快速入门",
      "lang": "zh",
      "category": "tutorial"
    },
    { "id": "doc-008", "score": 0.8742, ... }
  ]
}`}
      />
      <p style={{ color: '#666' }}>
        上游原生响应是 <code>documents[[hit]]</code> 嵌套数组(对应每个 query 一组命中),
        {site.name}扁平化为第一组返回,与单 query 检索场景对齐。
      </p>

      <h3>filter 语法</h3>
      <p>遵循腾讯云向量库标准过滤语法(SQL-like):</p>
      <ul>
        <li>等值:<code>lang = "zh"</code>;不等:<code>category != "draft"</code></li>
        <li>枚举:<code>category in ("tutorial", "faq")</code></li>
        <li>布尔组合:<code>AND</code> / <code>OR</code> / 括号嵌套</li>
        <li>数字比较:<code>score &gt;= 80</code> / <code>updated_at &gt; 1730000000</code></li>
      </ul>

      <h2 id="delete">delete · 删除</h2>
      <p>
        <code>POST {API_BASE}/vectordb/delete</code> · <strong>ids 与 filter 二选一</strong>。
      </p>
      <TabbedCode
        snippets={[
          {
            key: 'by-ids',
            label: '按 ids 删除',
            lang: 'bash',
            code: `curl ${API_BASE}/vectordb/delete \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "database": "rag",
    "collection": "docs",
    "ids": ["doc-001", "doc-008"]
  }'`,
          },
          {
            key: 'by-filter',
            label: '按 filter 批量删除',
            lang: 'bash',
            code: `curl ${API_BASE}/vectordb/delete \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "database": "rag",
    "collection": "docs",
    "filter": "category = \\"draft\\" AND updated_at < 1700000000"
  }'`,
          },
        ]}
      />

      <Callout type="warn" title="按 filter 删除是物理操作">
        <p style={{ margin: 0 }}>
          没有软删 / 撤回机制 —— 写错 filter(例如忘了加 <code>AND category=</code>)
          会清空整个 collection。生产环境强烈建议先用同一份 filter 跑一次 search
          确认命中范围,再走 delete。
        </p>
      </Callout>

      <h2>计费</h2>
      <p>
        当前 v1 暂未接入计费,upsert / search / delete 调用不写 <code>usage_logs</code>,
        但仍占用 API Key 的 RPM/TPM 限速额度。配额拉满 / 接入 billing 的进度可参考
        <Link to="/docs/faq">常见问题</Link>。
      </p>
    </>
  );
}
