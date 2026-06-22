import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocModels() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.models.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.models.introPrefix' },
          { name: site.name },
        )}{' '}
        <Link to="/models">
          {intl.formatMessage({ id: 'docs.models.modelMarket' })}
        </Link>{' '}
        {intl.formatMessage({ id: 'docs.models.introSuffix' })}{' '}
        <code>/v1/models</code>{' '}
        {intl.formatMessage({ id: 'docs.models.introSuffix2' })}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.models.queryAllTitle' })}</h2>
      <p>
        <code>GET {API_BASE}/models</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/models \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>{intl.formatMessage({ id: 'docs.models.responseExample' })}</p>
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

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.models.calloutTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.models.calloutBody' })}{' '}
          <Link to="/models">
            {intl.formatMessage({ id: 'docs.models.modelMarket' })}
          </Link>
          {intl.formatMessage({ id: 'docs.models.calloutBodyEnd' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.models.namingTitle' })}</h2>
      <ul>
        <li>
          {intl.formatMessage(
            { id: 'docs.models.namingRule1Prefix' },
            { name: site.name },
          )}{' '}
          <code>gpt-4o-mini</code>、<code>claude-3-5-sonnet</code>、
          <code>deepseek-chat</code>、<code>qwen-max</code>。
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.models.namingRule2Prefix' },
            { name: site.name },
          )}{' '}
          <code>kimi-code</code>、<code>glm-code</code>。
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.models.namingRule3Prefix' })}{' '}
          <code>model</code>{' '}
          {intl.formatMessage({ id: 'docs.models.namingRule3Suffix' })}
        </li>
      </ul>

      <h2>{intl.formatMessage({ id: 'docs.models.typesTitle' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.models.typesIntro' },
          { name: site.name },
        )}
      </p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 140 }}>
                {intl.formatMessage({ id: 'docs.models.colType' })}
              </th>
              <th style={{ width: 240 }}>
                {intl.formatMessage({ id: 'docs.models.colEndpoint' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.models.colDesc' })}</th>
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
                {intl.formatMessage({ id: 'docs.models.typeChatDesc' })}{' '}
                <Link to="/docs/chat">
                  {intl.formatMessage({ id: 'docs.models.linkChat' })}
                </Link>
                。
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
                {intl.formatMessage({ id: 'docs.models.typeImageDesc' })}{' '}
                <Link to="/docs/images">
                  {intl.formatMessage({ id: 'docs.models.linkImage' })}
                </Link>
                。
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
                {intl.formatMessage({ id: 'docs.models.typeVideoDesc' })}{' '}
                <Link to="/docs/videos">
                  {intl.formatMessage({ id: 'docs.models.linkVideo' })}
                </Link>
                。
              </td>
            </tr>
            <tr>
              <td>
                <code>3d</code>
              </td>
              <td>
                <code>/v1/3d/generations</code>
              </td>
              <td>
                {intl.formatMessage({ id: 'docs.models.type3dDesc' })}{' '}
                <Link to="/docs/3d">
                  {intl.formatMessage({ id: 'docs.models.link3d' })}
                </Link>
                。
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
                {intl.formatMessage({ id: 'docs.models.typeEmbeddingDesc' })}{' '}
                <Link to="/docs/embeddings">
                  {intl.formatMessage({ id: 'docs.models.linkEmbedding' })}
                </Link>
                。
              </td>
            </tr>
            <tr>
              <td>
                <code>audio</code>
              </td>
              <td>
                <code>/v1/audio/transcriptions</code> ·{' '}
                <code>/v1/audio/speech</code>
              </td>
              <td>
                {intl.formatMessage({ id: 'docs.models.typeAudioDesc' })}{' '}
                <Link to="/docs/audio">
                  {intl.formatMessage({ id: 'docs.models.linkAudio' })}
                </Link>
                。
              </td>
            </tr>
            <tr>
              <td>
                <code>rerank</code>
              </td>
              <td>
                <code>/v1/rerank</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.models.typeRerankDesc' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{intl.formatMessage({ id: 'docs.models.recommendTitle' })}</h2>
      <ul>
        <li>
          <strong>
            {intl.formatMessage({ id: 'docs.models.recValueLabel' })}
          </strong>
          :Google <code>gemini-1.5-flash</code>、 OpenAI{' '}
          <code>gpt-4o-mini</code>、DeepSeek <code>deepseek-chat</code>。
        </li>
        <li>
          <strong>
            {intl.formatMessage({ id: 'docs.models.recQualityLabel' })}
          </strong>
          :Anthropic <code>claude-3-5-sonnet</code>、 OpenAI{' '}
          <code>gpt-4o</code> / <code>o1</code>{' '}
          {intl.formatMessage({ id: 'docs.models.recQualitySeries' })}
        </li>
        <li>
          <strong>
            {intl.formatMessage({ id: 'docs.models.recLongTextLabel' })}
          </strong>
          :{intl.formatMessage({ id: 'docs.models.recLongTextDesc' })}
        </li>
        <li>
          <strong>
            {intl.formatMessage({ id: 'docs.models.recCodeLabel' })}
          </strong>
          :<code>kimi-code</code>、<code>glm-code</code>、
          <code>claude-3-5-sonnet</code>。
        </li>
        <li>
          <strong>
            {intl.formatMessage({ id: 'docs.models.recChineseLabel' })}
          </strong>
          :{intl.formatMessage({ id: 'docs.models.recChineseDesc' })}
        </li>
      </ul>
      <p>
        {intl.formatMessage({ id: 'docs.models.compareIntro' })}{' '}
        <Link to="/models">
          {intl.formatMessage({ id: 'docs.models.modelMarket' })}
        </Link>{' '}
        {intl.formatMessage({ id: 'docs.models.compareSuffix' })}
      </p>
    </>
  );
}
