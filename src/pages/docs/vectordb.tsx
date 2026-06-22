import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocVectorDB() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.vectordb.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.vectordb.introPrefix' },
          { name: site.name },
        )}{' '}
        <strong>upsert / search / delete</strong>{' '}
        {intl.formatMessage({ id: 'docs.vectordb.introMid' })}
        (<code>channel.type=tcvector</code>)
        {intl.formatMessage({ id: 'docs.vectordb.introSuffix' })}
      </p>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.vectordb.calloutEmbedTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.vectordb.calloutEmbedPrefix' },
            { name: site.name },
          )}
          <Link to="/docs/embeddings">
            {intl.formatMessage({ id: 'docs.vectordb.calloutEmbedLink' })}
          </Link>
          {intl.formatMessage({ id: 'docs.vectordb.calloutEmbedMid' })}{' '}
          <code>/v1/embeddings</code>;
          {intl.formatMessage({ id: 'docs.vectordb.calloutEmbedAfterPath' })}{' '}
          <em>{intl.formatMessage({ id: 'docs.vectordb.calloutEmbedEm' })}</em>{' '}
          {intl.formatMessage({ id: 'docs.vectordb.calloutEmbedSuffix' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.vectordb.routeHeading' })}</h2>
      <ul>
        <li>
          {intl.formatMessage({ id: 'docs.vectordb.routePrefixLabel' })}{' '}
          <code>{API_BASE}/vectordb/</code>
          {intl.formatMessage({ id: 'docs.vectordb.routePrefixDesc' })}(
          <code>Authorization: Bearer sk-...</code>)。
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.vectordb.routeByTypePrefix' })}{' '}
          <code>channel.type</code>{' '}
          {intl.formatMessage({ id: 'docs.vectordb.routeByTypeMid' })}{' '}
          <code>channel</code>{' '}
          {intl.formatMessage({ id: 'docs.vectordb.routeByTypeSuffix' })}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.vectordb.routeTokenPrefix' },
            { name: site.name },
          )}{' '}
          <code>account + api_key</code>{' '}
          {intl.formatMessage({ id: 'docs.vectordb.routeTokenMid' })}{' '}
          <code>sk-...</code>)
          {intl.formatMessage({ id: 'docs.vectordb.routeTokenSuffix' })}
        </li>
      </ul>

      <h2 id="upsert">
        {intl.formatMessage({ id: 'docs.vectordb.upsertHeading' })}
      </h2>
      <p>
        <code>POST {API_BASE}/vectordb/upsert</code>
      </p>
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
        "text": "${intl.formatMessage({ id: 'docs.vectordb.sampleDocText' })}",
        "fields": { "lang": "zh", "category": "tutorial" }
      }
    ]
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.vectordb.requestFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.vectordb.colField' })}
              </th>
              <th style={{ width: 100 }}>
                {intl.formatMessage({ id: 'docs.vectordb.colType' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.vectordb.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>database</code> / <code>collection</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.vectordb.required' })}
                </div>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.vectordb.dbCollDesc' })}</td>
            </tr>
            <tr>
              <td>
                <code>documents</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.vectordb.required' })}
                </div>
              </td>
              <td>array</td>
              <td>
                {intl.formatMessage({ id: 'docs.vectordb.documentsDescPrefix' })}
                <code>id</code>
                {intl.formatMessage({ id: 'docs.vectordb.documentsDescId' })}
                <code>vector</code>
                {intl.formatMessage({ id: 'docs.vectordb.documentsDescVector' })}
                <code>text</code>
                {intl.formatMessage({ id: 'docs.vectordb.documentsDescText' })}
                <code>fields</code>
                {intl.formatMessage({
                  id: 'docs.vectordb.documentsDescFields',
                })}
              </td>
            </tr>
            <tr>
              <td>
                <code>build_index</code>
              </td>
              <td>boolean</td>
              <td>
                {intl.formatMessage({ id: 'docs.vectordb.buildIndexDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>channel</code>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.vectordb.channelDesc' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="search">
        {intl.formatMessage({ id: 'docs.vectordb.searchHeading' })}
      </h2>
      <p>
        <code>POST {API_BASE}/vectordb/search</code> ·{' '}
        <strong>
          {intl.formatMessage({ id: 'docs.vectordb.searchEitherOr' })}
        </strong>
        :<code>vector</code>
        {intl.formatMessage({ id: 'docs.vectordb.searchVectorDesc' })}
        <code>text</code>
        {intl.formatMessage({ id: 'docs.vectordb.searchTextDescPrefix' })}
        <code>/v1/embeddings</code>
        {intl.formatMessage({ id: 'docs.vectordb.searchTextDescSuffix' })}
      </p>
      <TabbedCode
        snippets={[
          {
            key: 'vector',
            label: intl.formatMessage({ id: 'docs.vectordb.tabVectorMode' }),
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
            label: intl.formatMessage({ id: 'docs.vectordb.tabTextMode' }),
            lang: 'bash',
            code: `curl ${API_BASE}/vectordb/search \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "database": "rag",
    "collection": "docs",
    "text": "${intl.formatMessage({ id: 'docs.vectordb.sampleQueryText' })}",
    "limit": 5
  }'`,
          },
        ]}
      />

      <h3>{intl.formatMessage({ id: 'docs.vectordb.responseHeading' })}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "documents": [
    {
      "id": "doc-001",
      "score": 0.9123,
      "text": "${intl.formatMessage({ id: 'docs.vectordb.sampleDocText' })}",
      "lang": "zh",
      "category": "tutorial"
    },
    { "id": "doc-008", "score": 0.8742, ... }
  ]
}`}
      />
      <p style={{ color: '#666' }}>
        {intl.formatMessage({ id: 'docs.vectordb.respNotePrefix' })}{' '}
        <code>documents[[hit]]</code>
        {intl.formatMessage(
          { id: 'docs.vectordb.respNoteSuffix' },
          { name: site.name },
        )}
      </p>

      <h3>{intl.formatMessage({ id: 'docs.vectordb.filterSyntaxHeading' })}</h3>
      <p>{intl.formatMessage({ id: 'docs.vectordb.filterSyntaxIntro' })}</p>
      <ul>
        <li>
          {intl.formatMessage({ id: 'docs.vectordb.filterEq' })}
          <code>lang = "zh"</code>
          {intl.formatMessage({ id: 'docs.vectordb.filterNeq' })}
          <code>category != "draft"</code>
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.vectordb.filterEnum' })}
          <code>category in ("tutorial", "faq")</code>
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.vectordb.filterBool' })}
          <code>AND</code> / <code>OR</code>{' '}
          {intl.formatMessage({ id: 'docs.vectordb.filterBoolSuffix' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.vectordb.filterNum' })}
          <code>score &gt;= 80</code> /{' '}
          <code>updated_at &gt; 1730000000</code>
        </li>
      </ul>

      <h2 id="delete">
        {intl.formatMessage({ id: 'docs.vectordb.deleteHeading' })}
      </h2>
      <p>
        <code>POST {API_BASE}/vectordb/delete</code> ·{' '}
        <strong>
          {intl.formatMessage({ id: 'docs.vectordb.deleteEitherOr' })}
        </strong>
        。
      </p>
      <TabbedCode
        snippets={[
          {
            key: 'by-ids',
            label: intl.formatMessage({ id: 'docs.vectordb.tabByIds' }),
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
            label: intl.formatMessage({ id: 'docs.vectordb.tabByFilter' }),
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

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.vectordb.calloutDeleteTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.vectordb.calloutDeletePrefix' })}
          <code>AND category=</code>
          {intl.formatMessage({ id: 'docs.vectordb.calloutDeleteSuffix' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.vectordb.billingHeading' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.vectordb.billingPrefix' })}
        <code>usage_logs</code>
        {intl.formatMessage({ id: 'docs.vectordb.billingMid' })}
        <Link to="/docs/faq">
          {intl.formatMessage({ id: 'docs.vectordb.billingFaqLink' })}
        </Link>
        {intl.formatMessage({ id: 'docs.vectordb.billingSuffix' })}
      </p>
    </>
  );
}
