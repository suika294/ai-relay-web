import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocStreaming() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.streaming.title' })}</h1>
      <p>
        {intl.formatMessage({ id: 'docs.streaming.introPrefix' })}{' '}
        <code>"stream": true</code>{' '}
        {intl.formatMessage({ id: 'docs.streaming.introSuffix' }, { name: site.name })}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.streaming.enableTitle' })}</h2>
      <CodeBlock
        lang="bash"
        code={`curl -N ${API_BASE}/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"${intl.formatMessage({ id: 'docs.streaming.examplePromptIntro' }, { name: site.name })}"}],
    "stream": true
  }'`}
      />
      <p>
        <code>-N</code>{' '}
        {intl.formatMessage({ id: 'docs.streaming.curlNDesc' })}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.streaming.sseFormatTitle' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.streaming.sseFormatDescPrefix' })}{' '}
        <code>data:</code>{' '}
        {intl.formatMessage({ id: 'docs.streaming.sseFormatDescSuffix' })}
      </p>
      <CodeBlock
        lang="text"
        code={`data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"content":"${intl.formatMessage({ id: 'docs.streaming.exampleToken1' })}"}}]}

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"content":"${intl.formatMessage({ id: 'docs.streaming.exampleToken2' })}"}}]}

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{"content":"${intl.formatMessage({ id: 'docs.streaming.exampleToken3' })}"}}]}

...

data: {"id":"chatcmpl-x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":18,"total_tokens":30}}

data: [DONE]`}
      />
      <ul>
        <li>
          {intl.formatMessage({ id: 'docs.streaming.bulletDeltaPrefix' })}{' '}
          <code>data:</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.bulletDeltaMid' })}{' '}
          <code>choices[].message</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.bulletDeltaMid2' })}{' '}
          <code>message</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.bulletDeltaMid3' })}{' '}
          <code>delta</code>
          {intl.formatMessage({ id: 'docs.streaming.bulletDeltaSuffix' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.streaming.bulletConcatPrefix' })}{' '}
          <code>delta.content</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.bulletConcatSuffix' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.streaming.bulletDonePrefix' })}{' '}
          <code>[DONE]</code>
          {intl.formatMessage({ id: 'docs.streaming.bulletDoneSuffix' })}
        </li>
        <li>
          <code>usage</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.bulletUsage' })}
        </li>
      </ul>

      <Callout type="info" title={intl.formatMessage({ id: 'docs.streaming.calloutUsageTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.streaming.calloutUsageBodyPrefix' })}{' '}
          <code>usage</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.calloutUsageBodySuffix' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.streaming.clientParseTitle' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.streaming.clientParseDescPrefix' })}{' '}
        <code>for...of</code>{' '}
        {intl.formatMessage({ id: 'docs.streaming.clientParseDescSuffix' })}
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
    messages=[{"role": "user", "content": "${intl.formatMessage({ id: 'docs.streaming.examplePromptJoke' })}"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)
print()  # ${intl.formatMessage({ id: 'docs.streaming.exampleCommentTrailingNewline' })}`,
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
  messages: [{ role: 'user', content: '${intl.formatMessage({ id: 'docs.streaming.examplePromptJoke' })}' }],
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
            label: intl.formatMessage({ id: 'docs.streaming.tabFetchLabel' }),
            lang: 'ts',
            code: `const res = await fetch('${API_BASE}/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-your-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: '${intl.formatMessage({ id: 'docs.streaming.examplePromptJoke' })}' }],
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

  // ${intl.formatMessage({ id: 'docs.streaming.exampleCommentSseSplit' })}
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

      <h2>{intl.formatMessage({ id: 'docs.streaming.pitfallsTitle' })}</h2>
      <Callout type="warn" title={intl.formatMessage({ id: 'docs.streaming.pitfallProxyTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.streaming.pitfallProxyBodyPrefix' }, { name: site.name })}{' '}
          <code>text/event-stream</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.pitfallProxyBodyMid' })}{' '}
          <code>proxy_buffering off;</code>{' '}
          {intl.formatMessage({ id: 'docs.streaming.pitfallProxyBodyAnd' })}{' '}
          <code>proxy_cache off;</code>
          {intl.formatMessage({ id: 'docs.streaming.pitfallProxyBodySuffix' })}
        </p>
      </Callout>

      <Callout type="warn" title={intl.formatMessage({ id: 'docs.streaming.pitfallReadTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.streaming.pitfallReadBodyPrefix' })}{' '}
          <code>[DONE]</code>
          {intl.formatMessage({ id: 'docs.streaming.pitfallReadBodySuffix' }, { name: site.name })}
        </p>
      </Callout>

      <p>
        {intl.formatMessage({ id: 'docs.streaming.footerPrefix' })}{' '}
        <Link to="/console/logs/usage">
          {intl.formatMessage({ id: 'docs.streaming.footerConsoleLogs' })}
        </Link>{' '}
        {intl.formatMessage({ id: 'docs.streaming.footerMid' })}{' '}
        <Link to="/docs/errors">
          {intl.formatMessage({ id: 'docs.streaming.footerErrorCodes' })}
        </Link>
        {intl.formatMessage({ id: 'docs.streaming.footerSuffix' })}
      </p>
    </>
  );
}
