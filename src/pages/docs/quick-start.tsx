import { history, Link, useIntl } from '@umijs/max';
import { Button } from 'antd';
import { useAuthModal } from '@/components/AuthModalProvider';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function QuickStart() {
  const intl = useIntl();
  const site = useSiteInfo();
  const { openAuthModal } = useAuthModal();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.quickStart.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.quickStart.intro' },
          { name: site.name },
        )}
        <code>base_url</code>{' '}
        {intl.formatMessage(
          { id: 'docs.quickStart.introTail' },
          { name: site.name },
        )}
      </p>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.quickStart.goalTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.quickStart.goalDesc' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.quickStart.step1Title' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.quickStart.step1GoTo' })}{' '}
        {site.register_enabled ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() =>
              openAuthModal({
                defaultTab: 'register',
                onSuccess: () => history.push('/console/tokens'),
              })
            }
          >
            {intl.formatMessage({ id: 'docs.quickStart.freeRegister' })}
          </Button>
        ) : (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() =>
              openAuthModal({
                defaultTab: 'login',
                onSuccess: () => history.push('/console/tokens'),
              })
            }
          >
            {intl.formatMessage({ id: 'docs.quickStart.login' })}
          </Button>
        )}
        {intl.formatMessage({ id: 'docs.quickStart.step1AfterLogin' })}
        <Link to="/">
          {intl.formatMessage({ id: 'docs.quickStart.homepage' })}
        </Link>
        {intl.formatMessage({ id: 'docs.quickStart.step1Homepage' })}
      </p>

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.quickStart.saveKeyTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.quickStart.saveKeyDesc' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.quickStart.step2Title' })}</h2>
      <ul>
        <li>
          {intl.formatMessage({ id: 'docs.quickStart.apiBaseLabel' })}
          <code>{API_BASE}</code>
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.quickStart.authLabel' })}{' '}
          <code>Authorization: Bearer sk-your-key</code>
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.quickStart.contentTypeLabel' })}
          <code>application/json</code>
        </li>
        <li>{intl.formatMessage({ id: 'docs.quickStart.encodingLabel' })}</li>
      </ul>

      <h2>{intl.formatMessage({ id: 'docs.quickStart.step3Title' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.quickStart.step3Desc1' })}{' '}
        <code>/chat/completions</code>
        {intl.formatMessage({ id: 'docs.quickStart.step3Desc2' })}{' '}
        <code>sk-your-key</code>
        {intl.formatMessage({ id: 'docs.quickStart.step3Desc3' })}
      </p>

      <TabbedCode
        snippets={[
          {
            key: 'curl',
            label: 'cURL',
            lang: 'bash',
            code: `curl ${API_BASE}/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "${intl.formatMessage({ id: 'docs.quickStart.sampleSystemPrompt' })}"},
      {"role": "user", "content": "${intl.formatMessage({ id: 'docs.quickStart.sampleUserPrompt' }, { name: site.name })}"}
    ]
  }'`,
          },
          {
            key: 'python',
            label: 'Python (OpenAI SDK)',
            lang: 'python',
            code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-key",
    base_url="${API_BASE}",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "${intl.formatMessage({ id: 'docs.quickStart.sampleSystemPrompt' })}"},
        {"role": "user", "content": "${intl.formatMessage({ id: 'docs.quickStart.sampleUserPrompt' }, { name: site.name })}"},
    ],
)
print(resp.choices[0].message.content)`,
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

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: '${intl.formatMessage({ id: 'docs.quickStart.sampleSystemPrompt' })}' },
    { role: 'user', content: '${intl.formatMessage({ id: 'docs.quickStart.sampleUserPrompt' }, { name: site.name })}' },
  ],
});
console.log(resp.choices[0].message.content);`,
          },
        ]}
      />

      <h2>{intl.formatMessage({ id: 'docs.quickStart.step4Title' })}</h2>
      <p>{intl.formatMessage({ id: 'docs.quickStart.step4Desc' })}</p>
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
        "content": "${intl.formatMessage({ id: 'docs.quickStart.sampleAssistantContent' }, { name: site.name })}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 42,
    "total_tokens": 70
  }
}`}
      />
      <p>
        {intl.formatMessage({ id: 'docs.quickStart.usageNote1' })}{' '}
        <code>usage</code>
        {intl.formatMessage({ id: 'docs.quickStart.usageNote2' })}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.quickStart.step5Title' })}</h2>
      <ul>
        <li>
          {intl.formatMessage({ id: 'docs.quickStart.nextStreaming' })}{' '}
          <Link to="/docs/streaming">
            {intl.formatMessage({ id: 'docs.quickStart.nextStreamingLink' })}
          </Link>
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.quickStart.nextModels' })}{' '}
          <Link to="/docs/models">
            {intl.formatMessage({ id: 'docs.quickStart.nextModelsLink' })}
          </Link>{' '}
          {intl.formatMessage({ id: 'docs.quickStart.nextModelsAnd' })}{' '}
          <Link to="/models">
            {intl.formatMessage({ id: 'docs.quickStart.nextModelsMarket' })}
          </Link>
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.quickStart.nextErrors' })}{' '}
          <Link to="/docs/errors">
            {intl.formatMessage({ id: 'docs.quickStart.nextErrorsLink' })}
          </Link>
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.quickStart.nextSdk' })}{' '}
          <Link to="/docs/sdk">
            {intl.formatMessage({ id: 'docs.quickStart.nextSdkLink' })}
          </Link>
        </li>
      </ul>
    </>
  );
}
