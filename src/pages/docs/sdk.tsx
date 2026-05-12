import { Link } from '@umijs/max';
import { API_BASE, Callout, CodeBlock, TabbedCode } from './_shared';

export default function DocSdk() {
  return (
    <>
      <h1>SDK 接入</h1>
      <p>
        模桥兼容 OpenAI 协议,所以你可以直接使用各语言的 OpenAI 官方/社区 SDK
        —— 不需要安装模桥的专属 SDK,只需要把 SDK 的 <code>base_url</code>{' '}
        指向 <code>{API_BASE}</code> 即可。
      </p>

      <Callout type="info" title="同样的写法适用于">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>OpenAI 官方 SDK(Python / Node / Go / Java / .NET)</li>
          <li>LangChain、LlamaIndex、Vercel AI SDK 等基于 OpenAI 的框架</li>
          <li>Continue / Cline / Cursor / Cherry Studio 等支持 OpenAI 协议的客户端</li>
          <li>任何能改 base_url 的 OpenAI 兼容工具</li>
        </ul>
      </Callout>

      <h2>Python</h2>
      <p>
        使用 OpenAI 官方 <code>openai</code> 包(<code>{'>='}1.0</code>),
        先安装:
      </p>
      <CodeBlock lang="bash" code={`pip install openai`} />
      <CodeBlock
        lang="python"
        code={`from openai import OpenAI

client = OpenAI(
    api_key="sk-your-key",
    base_url="${API_BASE}",
)

# 非流式
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)

# 流式
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

      <h2>Go / Java / 其它语言</h2>
      <p>各家 SDK 的配置方式几乎一致 —— 改两个字段:</p>

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

      <h2>第三方客户端</h2>
      <p>
        几乎所有桌面 / Web 端 AI 客户端都支持「自定义 OpenAI 接口」,
        配置三个字段就能用:
      </p>

      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th>字段</th>
              <th>值</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>API Base / Endpoint</td>
              <td>
                <code>{API_BASE}</code>
              </td>
              <td>客户端里有时叫「自定义 API 地址」/「Custom URL」</td>
            </tr>
            <tr>
              <td>API Key</td>
              <td>
                <code>sk-your-key</code>
              </td>
              <td>填入模桥控制台生成的 Key</td>
            </tr>
            <tr>
              <td>Model</td>
              <td>
                <code>gpt-4o-mini</code> 等
              </td>
              <td>
                可调模型完整列表见{' '}
                <Link to="/docs/models">模型列表</Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout type="success" title="客户端示例">
        <p style={{ margin: 0 }}>
          Cherry Studio / Chatbox / Open WebUI / Cursor / Cline / Continue
          等都已经验证可直接使用 —— 都是「OpenAI 兼容,改 base_url」。
        </p>
      </Callout>

      <h2>HTTP 直调(不用 SDK)</h2>
      <p>
        如果你的环境装不了 SDK,直接 HTTP 也可以,参考{' '}
        <Link to="/docs/chat">对话 Chat</Link> 页里的 curl 示例,
        几乎任何语言的标准 HTTP 客户端都能跑。
      </p>
    </>
  );
}
