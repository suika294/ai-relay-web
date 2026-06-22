import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocSdk() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.sdk.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.sdk.intro' },
          { name: site.name, base: <code key="base">{API_BASE}</code> },
        )}
      </p>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.sdk.appliesTitle' })}
      >
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{intl.formatMessage({ id: 'docs.sdk.appliesOfficial' })}</li>
          <li>{intl.formatMessage({ id: 'docs.sdk.appliesFrameworks' })}</li>
          <li>{intl.formatMessage({ id: 'docs.sdk.appliesClients' })}</li>
          <li>{intl.formatMessage({ id: 'docs.sdk.appliesAny' })}</li>
        </ul>
      </Callout>

      <h2>Python</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.sdk.pythonIntro' },
          {
            pkg: <code key="pkg">openai</code>,
            ver: <code key="ver">{'>='}1.0</code>,
          },
        )}
      </p>
      <CodeBlock lang="bash" code={`pip install openai`} />
      <CodeBlock
        lang="python"
        code={`from openai import OpenAI

client = OpenAI(
    api_key="sk-your-key",
    base_url="${API_BASE}",
)

# ${intl.formatMessage({ id: 'docs.sdk.codeNonStream' })}
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)

# ${intl.formatMessage({ id: 'docs.sdk.codeStream' })}
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)`}
      />

      <h2>Node / TypeScript</h2>
      <CodeBlock lang="bash" code={`npm i openai`} />
      <CodeBlock
        lang="ts"
        code={`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-key',
  baseURL: '${API_BASE}',
});

const stream = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}`}
      />

      <h2>{intl.formatMessage({ id: 'docs.sdk.otherLangsTitle' })}</h2>
      <p>{intl.formatMessage({ id: 'docs.sdk.otherLangsDesc' })}</p>

      <TabbedCode
        snippets={[
          {
            key: 'go',
            label: 'Go (openai-go)',
            lang: 'go',
            code: `package main

import (
    "context"
    "fmt"

    "github.com/openai/openai-go"
    "github.com/openai/openai-go/option"
)

func main() {
    client := openai.NewClient(
        option.WithAPIKey("sk-your-key"),
        option.WithBaseURL("${API_BASE}"),
    )

    resp, err := client.Chat.Completions.New(context.Background(),
        openai.ChatCompletionNewParams{
            Model: openai.F("gpt-4o-mini"),
            Messages: openai.F([]openai.ChatCompletionMessageParamUnion{
                openai.UserMessage("Hello"),
            }),
        })
    if err != nil { panic(err) }
    fmt.Println(resp.Choices[0].Message.Content)
}`,
          },
          {
            key: 'java',
            label: 'Java (openai-java)',
            lang: 'java',
            code: `import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.chat.completions.ChatCompletion;
import com.openai.models.chat.completions.ChatCompletionCreateParams;

OpenAIClient client = OpenAIOkHttpClient.builder()
    .apiKey("sk-your-key")
    .baseUrl("${API_BASE}")
    .build();

ChatCompletion completion = client.chat().completions().create(
    ChatCompletionCreateParams.builder()
        .model("gpt-4o-mini")
        .addUserMessage("Hello")
        .build()
);
System.out.println(completion.choices().get(0).message().content().get());`,
          },
          {
            key: 'csharp',
            label: 'C# / .NET',
            lang: 'csharp',
            code: `using OpenAI;
using OpenAI.Chat;
using System.ClientModel;

var client = new ChatClient(
    model: "gpt-4o-mini",
    credential: new ApiKeyCredential("sk-your-key"),
    options: new OpenAIClientOptions {
        Endpoint = new Uri("${API_BASE}"),
    }
);

ChatCompletion completion = client.CompleteChat("Hello");
Console.WriteLine(completion.Content[0].Text);`,
          },
        ]}
      />

      <h2>{intl.formatMessage({ id: 'docs.sdk.thirdPartyTitle' })}</h2>
      <p>{intl.formatMessage({ id: 'docs.sdk.thirdPartyDesc' })}</p>

      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{intl.formatMessage({ id: 'docs.sdk.colField' })}</th>
              <th>{intl.formatMessage({ id: 'docs.sdk.colValue' })}</th>
              <th>{intl.formatMessage({ id: 'docs.sdk.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>API Base / Endpoint</td>
              <td>
                <code>{API_BASE}</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.sdk.rowBaseDesc' })}</td>
            </tr>
            <tr>
              <td>API Key</td>
              <td>
                <code>sk-your-key</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.sdk.rowKeyDesc' },
                  { name: site.name },
                )}
              </td>
            </tr>
            <tr>
              <td>Model</td>
              <td>
                <code>gpt-4o-mini</code>{' '}
                {intl.formatMessage({ id: 'docs.sdk.rowModelEtc' })}
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.sdk.rowModelDesc' },
                  {
                    link: (
                      <Link key="link" to="/docs/models">
                        {intl.formatMessage({ id: 'docs.sdk.modelListLink' })}
                      </Link>
                    ),
                  },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout
        type="success"
        title={intl.formatMessage({ id: 'docs.sdk.clientExampleTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.sdk.clientExampleDesc' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.sdk.httpTitle' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.sdk.httpDesc' },
          {
            link: (
              <Link key="link" to="/docs/chat">
                {intl.formatMessage({ id: 'docs.sdk.chatLink' })}
              </Link>
            ),
          },
        )}
      </p>
    </>
  );
}
