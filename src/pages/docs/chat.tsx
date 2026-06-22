import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocChat() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  const intl = useIntl();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.chat.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.chat.intro1' },
          { name: site.name },
        )}{' '}
        <code>/v1/chat/completions</code>{' '}
        {intl.formatMessage({ id: 'docs.chat.intro2' })}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.chat.requestHeading' })}</h2>
      <p>
        <code>POST {API_BASE}/chat/completions</code>
      </p>

      <h3>{intl.formatMessage({ id: 'docs.chat.bodyFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.chat.colField' })}
              </th>
              <th style={{ width: 100 }}>
                {intl.formatMessage({ id: 'docs.chat.colType' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.chat.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.chat.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.fieldModel1' })}{' '}
                <code>gpt-4o-mini</code>、<code>claude-3-5-sonnet</code>、
                <code>deepseek-chat</code>。
                {intl.formatMessage({ id: 'docs.chat.fieldModel2' })}{' '}
                <Link to="/docs/models">
                  {intl.formatMessage({ id: 'docs.chat.modelListLink' })}
                </Link>
                。
              </td>
            </tr>
            <tr>
              <td>
                <code>messages</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.chat.required' })}
                </div>
              </td>
              <td>array</td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.fieldMessages1' })}
                <code>{'{role, content}'}</code>。
                {intl.formatMessage({ id: 'docs.chat.fieldMessages2' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>stream</code>
              </td>
              <td>boolean</td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.fieldStream1' })}{' '}
                <code>false</code>
                {intl.formatMessage({ id: 'docs.chat.fieldStream2' })}{' '}
                <Link to="/docs/streaming">
                  {intl.formatMessage({ id: 'docs.chat.streamingLink' })}
                </Link>{' '}
                {intl.formatMessage({ id: 'docs.chat.fieldStream3' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>temperature</code>
              </td>
              <td>number</td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.fieldTemperature1' })}
                <code>0 ~ 2</code>
                {intl.formatMessage({ id: 'docs.chat.fieldTemperature2' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>top_p</code>
              </td>
              <td>number</td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.fieldTopP1' })}
                <code>0 ~ 1</code>
                {intl.formatMessage({ id: 'docs.chat.fieldTopP2' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>max_tokens</code>
              </td>
              <td>integer</td>
              <td>{intl.formatMessage({ id: 'docs.chat.fieldMaxTokens' })}</td>
            </tr>
            <tr>
              <td>
                <code>stop</code>
              </td>
              <td>string / array</td>
              <td>{intl.formatMessage({ id: 'docs.chat.fieldStop' })}</td>
            </tr>
            <tr>
              <td>
                <code>presence_penalty</code>
              </td>
              <td>number</td>
              <td>
                <code>-2 ~ 2</code>
                {intl.formatMessage({ id: 'docs.chat.fieldPresencePenalty' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>frequency_penalty</code>
              </td>
              <td>number</td>
              <td>
                <code>-2 ~ 2</code>
                {intl.formatMessage({ id: 'docs.chat.fieldFrequencyPenalty' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>tools</code>
              </td>
              <td>array</td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.fieldTools1' })}{' '}
                <Link to="/docs/models">
                  {intl.formatMessage({ id: 'docs.chat.modelListLink' })}
                </Link>
                。
              </td>
            </tr>
            <tr>
              <td>
                <code>tool_choice</code>
              </td>
              <td>string / object</td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.fieldToolChoice' })}
                <code>auto</code> / <code>none</code> /{' '}
                {intl.formatMessage({ id: 'docs.chat.fieldToolChoiceSpecify' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>response_format</code>
              </td>
              <td>object</td>
              <td>
                <code>{'{ type: "json_object" }'}</code>{' '}
                {intl.formatMessage({ id: 'docs.chat.fieldResponseFormat' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>user</code>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.chat.fieldUser' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{intl.formatMessage({ id: 'docs.chat.rolesHeading' })}</h3>
      <ul>
        <li>
          <code>system</code> ——{' '}
          {intl.formatMessage({ id: 'docs.chat.roleSystem' })}
        </li>
        <li>
          <code>user</code> —— {intl.formatMessage({ id: 'docs.chat.roleUser' })}
        </li>
        <li>
          <code>assistant</code> ——{' '}
          {intl.formatMessage({ id: 'docs.chat.roleAssistant' })}
        </li>
        <li>
          <code>tool</code> —— {intl.formatMessage({ id: 'docs.chat.roleTool1' })}
          <code>tool_call_id</code>。
        </li>
      </ul>

      <h2 id="vision">{intl.formatMessage({ id: 'docs.chat.visionHeading' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.chat.vision1' })}
        <code>messages[].content</code>{' '}
        {intl.formatMessage({ id: 'docs.chat.vision2' })}{' '}
        <strong>{intl.formatMessage({ id: 'docs.chat.visionArray' })}</strong>{' '}
        {intl.formatMessage({ id: 'docs.chat.vision3' })}{' '}
        <strong>HTTP URL</strong>{' '}
        {intl.formatMessage({ id: 'docs.chat.visionOr' })}{' '}
        <strong>
          {intl.formatMessage({ id: 'docs.chat.visionDataUrl' })}
        </strong>
        。
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "${intl.formatMessage({ id: 'docs.chat.exVisionPrompt' })}" },
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
    { "type": "text", "text": "${intl.formatMessage({ id: 'docs.chat.exVisionOcrPrompt' })}" },
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
          <strong>
            {intl.formatMessage({ id: 'docs.chat.visionUrlOrBase64' })}
          </strong>
          {intl.formatMessage({ id: 'docs.chat.visionUrlOrBase64Desc' })}
        </li>
        <li>
          <strong>{intl.formatMessage({ id: 'docs.chat.visionMulti' })}</strong>
          {intl.formatMessage({ id: 'docs.chat.visionMultiDesc1' })}
          <code>messages[]</code>
          {intl.formatMessage({ id: 'docs.chat.visionMultiDesc2' })}
        </li>
        <li>
          <strong>
            {intl.formatMessage({ id: 'docs.chat.visionBilling' })}
          </strong>
          {intl.formatMessage({ id: 'docs.chat.visionBillingDesc1' })}
          <code>usage</code>
          {intl.formatMessage({ id: 'docs.chat.visionBillingDesc2' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.chat.visionImageGen1' })}{' '}
          <Link to="/docs/images">
            {intl.formatMessage({ id: 'docs.chat.imageGenLink' })}
          </Link>{' '}
          {intl.formatMessage({ id: 'docs.chat.visionImageGen2' })}
          (<code>/v1/images/generations</code>)
          {intl.formatMessage({ id: 'docs.chat.visionImageGen3' })}
        </li>
      </ul>

      <h2>{intl.formatMessage({ id: 'docs.chat.requestExampleHeading' })}</h2>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "${intl.formatMessage({ id: 'docs.chat.exSystemPrompt' })}"},
      {"role": "user", "content": "${intl.formatMessage({ id: 'docs.chat.exUserPrompt' })}"}
    ],
    "temperature": 0.2,
    "max_tokens": 256
  }'`}
      />

      <h2>{intl.formatMessage({ id: 'docs.chat.responseHeading' })}</h2>
      <p>{intl.formatMessage({ id: 'docs.chat.responseIntro' })}</p>
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
              <th style={{ width: 220 }}>
                {intl.formatMessage({ id: 'docs.chat.colField' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.chat.colMeaning' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>id</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.chat.respId' })}</td>
            </tr>
            <tr>
              <td>
                <code>model</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.chat.respModel' })}</td>
            </tr>
            <tr>
              <td>
                <code>choices[].message.content</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.chat.respContent' })}</td>
            </tr>
            <tr>
              <td>
                <code>choices[].finish_reason</code>
              </td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.respFinishReason' })}
                <code>stop</code>
                {intl.formatMessage({ id: 'docs.chat.respFinishStop' })}/{' '}
                <code>length</code>
                {intl.formatMessage({ id: 'docs.chat.respFinishLength' })}/{' '}
                <code>tool_calls</code>
                {intl.formatMessage({ id: 'docs.chat.respFinishToolCalls' })}/{' '}
                <code>content_filter</code>
                {intl.formatMessage({ id: 'docs.chat.respFinishContentFilter' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>usage.prompt_tokens</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.chat.respPromptTokens' })}</td>
            </tr>
            <tr>
              <td>
                <code>usage.completion_tokens</code>
              </td>
              <td>
                {intl.formatMessage({ id: 'docs.chat.respCompletionTokens' })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.chat.multiTurnTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.chat.multiTurn1' },
            { name: site.name },
          )}{' '}
          <code>messages</code>{' '}
          {intl.formatMessage({ id: 'docs.chat.multiTurn2' })}
        </p>
      </Callout>
    </>
  );
}
