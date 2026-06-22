import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocEmbeddings() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.embeddings.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.embeddings.intro' },
          { name: site.name },
        )}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.embeddings.requestHeading' })}</h2>
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
    "input": "${intl.formatMessage({ id: 'docs.embeddings.curlInput' }, { name: site.name })}"
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.embeddings.requestFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.embeddings.colField' })}
              </th>
              <th style={{ width: 100 }}>
                {intl.formatMessage({ id: 'docs.embeddings.colType' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.embeddings.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.embeddings.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage({ id: 'docs.embeddings.modelDescPrefix' })}{' '}
                <Link to="/docs/models">
                  {intl.formatMessage({ id: 'docs.embeddings.modelListLink' })}
                </Link>
                {intl.formatMessage({ id: 'docs.embeddings.modelDescSuffix' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>input</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.embeddings.required' })}
                </div>
              </td>
              <td>string / array</td>
              <td>
                {intl.formatMessage({ id: 'docs.embeddings.inputDescPrefix' })}{' '}
                <code>data</code>{' '}
                {intl.formatMessage({ id: 'docs.embeddings.inputDescSuffix' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>dimensions</code>
              </td>
              <td>integer</td>
              <td>
                {intl.formatMessage({ id: 'docs.embeddings.dimensionsDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>encoding_format</code>
              </td>
              <td>string</td>
              <td>
                <code>float</code>
                {intl.formatMessage({ id: 'docs.embeddings.encodingFloat' })}{' '}
                <code>base64</code>
                {intl.formatMessage({ id: 'docs.embeddings.encodingBase64' })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{intl.formatMessage({ id: 'docs.embeddings.batchHeading' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.embeddings.batchDescPrefix' })}{' '}
        <code>input</code>{' '}
        {intl.formatMessage({ id: 'docs.embeddings.batchDescSuffix' })}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "text-embedding-3-small",
  "input": [
    "${intl.formatMessage({ id: 'docs.embeddings.batchInput1' }, { name: site.name })}",
    "${intl.formatMessage({ id: 'docs.embeddings.batchInput2' })}",
    "${intl.formatMessage({ id: 'docs.embeddings.batchInput3' })}"
  ]
}`}
      />

      <h2>{intl.formatMessage({ id: 'docs.embeddings.responseHeading' })}</h2>
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
          <code>data[].embedding</code>{' '}
          {intl.formatMessage({ id: 'docs.embeddings.respEmbedding' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.embeddings.respOrderPrefix' })}{' '}
          <code>input</code>{' '}
          {intl.formatMessage({ id: 'docs.embeddings.respOrderMid' })}{' '}
          <code>index</code>{' '}
          {intl.formatMessage({ id: 'docs.embeddings.respOrderSuffix' })}
        </li>
        <li>
          <code>usage.prompt_tokens</code>{' '}
          {intl.formatMessage({ id: 'docs.embeddings.respUsage' })}
        </li>
      </ul>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.embeddings.calloutStoreTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.embeddings.calloutStoreBody' })}
        </p>
      </Callout>

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.embeddings.calloutDimTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.embeddings.calloutDimBodyPrefix' })}{' '}
          <strong>
            {intl.formatMessage({ id: 'docs.embeddings.calloutDimBodyStrong' })}
          </strong>{' '}
          {intl.formatMessage({ id: 'docs.embeddings.calloutDimBodySuffix' })}
        </p>
      </Callout>
    </>
  );
}
