import { Link } from '@umijs/max';
import { API_BASE, Callout, CodeBlock, TabbedCode } from './_shared';

export default function DocVideos() {
  return (
    <>
      <h1>视频生成</h1>
      <p>
        模桥已聚合 Google Veo、Doubao Seedance、Kling(可灵)、Vidu 等主流视频
        模型,统一通过 OpenAI 风格的 <code>/v1/videos/generations</code>{' '}
        异步任务接口暴露:你 <strong>提交</strong> 一个任务拿到 <code>task_id</code>,
        然后 <strong>轮询</strong> 直到任务进入终态(<code>succeeded</code> /
        <code>failed</code> / <code>canceled</code>),
        成功时拿到可下载的视频 URL。
      </p>

      <Callout type="info" title="视频生成是异步任务">
        <p style={{ margin: 0 }}>
          视频模型生成时间从十几秒到几分钟不等,所以接口设计成<strong>提交 + 轮询</strong>两步,
          不像 chat 那样一次性返回。生成成功后,模桥会把上游临时 URL 转存到自家
          storage,返回的 URL 一般可在 7 天内访问。
        </p>
      </Callout>

      <h2>1. 提交任务</h2>
      <p>
        <code>POST {API_BASE}/videos/generations</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/videos/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedance-2-0-260128",
    "prompt": "一只穿西装的柴犬在东京涩谷十字路口指挥交通,赛博朋克风格",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'`}
      />

      <h3>请求字段</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>字段</th>
              <th style={{ width: 110 }}>类型</th>
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
                视频模型 ID,例如 <code>doubao-seedance-2-0-260128</code>、
                <code>veo-3.1-generate-preview</code>、
                <code>kling-v3-omni</code>、<code>viduq3-turbo</code>。
                完整列表见 <Link to="/docs/models">模型列表</Link>(<code>video</code> 类型)。
              </td>
            </tr>
            <tr>
              <td>
                <code>prompt</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>string</td>
              <td>
                提示词,描述要生成的视频。中文 / 英文皆可,具体长度限制由上游模型决定。
              </td>
            </tr>
            <tr>
              <td>
                <code>duration</code>
              </td>
              <td>integer</td>
              <td>
                视频时长(秒),常见 <code>5</code> / <code>8</code> / <code>10</code>。
                可选值取决于上游模型,缺省一般是 5s。
              </td>
            </tr>
            <tr>
              <td>
                <code>aspect_ratio</code>
              </td>
              <td>string</td>
              <td>
                画幅比例,常见 <code>16:9</code>(横)/ <code>9:16</code>(竖)/{' '}
                <code>1:1</code>(方)。Veo 的 <code>ratio</code>{' '}
                字段会被自动映射到这个字段。
              </td>
            </tr>
            <tr>
              <td>
                <code>resolution</code>
              </td>
              <td>string</td>
              <td>
                分辨率,例如 <code>720p</code> / <code>1080p</code>;
                部分模型只接受 <code>aspect_ratio</code> 不接受 <code>resolution</code>,
                按错误提示调整即可。
              </td>
            </tr>
            <tr>
              <td>
                <code>image_url</code>
              </td>
              <td>string</td>
              <td>
                图生视频(i2v)时的参考图 URL,需要公网可达。传 <code>http(s)://</code> 链接、
                <code>data:image/...;base64,...</code> 或裸 base64 均可,模桥会按上游要求
                自动转换。
              </td>
            </tr>
            <tr>
              <td>
                <code>images</code>
              </td>
              <td>array</td>
              <td>
                多图参考(Vidu / Kling V3 Omni 等支持),每个元素跟{' '}
                <code>image_url</code> 同样的格式。顺序敏感:首图通常作主参考。
              </td>
            </tr>
            <tr>
              <td>
                <code>image_asset_ids</code>
              </td>
              <td>array</td>
              <td>
                通过 <code>/v1/files</code> 或控制台上传过的素材 ID,模桥从 storage 直读
                原图后转交上游,适合本地/私有图片不方便外网访问的场景。可与{' '}
                <code>image_url</code> 混用,顺序对齐。
              </td>
            </tr>
            <tr>
              <td>
                <code>last_frame</code>
              </td>
              <td>string</td>
              <td>
                可选,首尾帧模式下的尾帧参考图(部分模型支持)。
              </td>
            </tr>
            <tr>
              <td>
                <code>user</code>
              </td>
              <td>string</td>
              <td>你侧的最终用户标识,原样透传上游用于风控与审计。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>提交响应</h3>
      <CodeBlock
        lang="json"
        code={`{
  "id": "vgen-x7k3p2m...",
  "object": "video.task",
  "status": "queued",
  "model": "doubao-seedance-2-0-260128",
  "created": 1730000000
}`}
      />
      <p>
        提交成功立即返回 <code>id</code>,这是后续轮询用的 <code>task_id</code>。
        刚提交时 <code>status</code> 一般是 <code>queued</code>,稍后变成{' '}
        <code>running</code>,最终进入 <code>succeeded</code> / <code>failed</code> /
        <code>canceled</code>。
      </p>

      <h2>2. 轮询任务状态</h2>
      <p>
        <code>GET {API_BASE}/videos/generations/:task_id</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/videos/generations/vgen-x7k3p2m... \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>响应里 <code>status</code> 进入终态时,字段差异如下:</p>
      <CodeBlock
        lang="json"
        code={`// 进行中
{
  "id": "vgen-x7k3p2m...",
  "status": "running",
  "model": "doubao-seedance-2-0-260128"
}

// 成功
{
  "id": "vgen-x7k3p2m...",
  "status": "succeeded",
  "model": "doubao-seedance-2-0-260128",
  "data": [
    {
      "url": "https://oss.example.com/video/xxx.mp4",
      "duration": 5,
      "resolution": "1280x720"
    }
  ],
  "usage": {
    "total_tokens": 0
  }
}

// 失败
{
  "id": "vgen-x7k3p2m...",
  "status": "failed",
  "error": {
    "code": "upstream_error",
    "message": "image_url is not valid"
  }
}`}
      />

      <Callout type="warn" title="轮询频率">
        <p style={{ margin: 0 }}>
          建议初始 <code>3~5s</code> 一次,30s 后退到 <code>10s</code> 一次。
          不要 1s 高频轮询 —— 既容易触发 <Link to="/docs/rate-limits">限速</Link>,
          也不会让上游更快完成。
        </p>
      </Callout>

      <h3>完整轮询代码示例</h3>
      <TabbedCode
        snippets={[
          {
            key: 'python',
            label: 'Python',
            lang: 'python',
            code: `import time, requests

API_BASE = "${API_BASE}"
KEY = "sk-your-key"
HEADERS = {"Authorization": f"Bearer {KEY}"}

# 1. 提交
res = requests.post(
    f"{API_BASE}/videos/generations",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "model": "doubao-seedance-2-0-260128",
        "prompt": "一只穿西装的柴犬指挥交通",
        "duration": 5,
        "aspect_ratio": "16:9",
    },
)
task_id = res.json()["id"]
print("submitted:", task_id)

# 2. 轮询
interval = 3
while True:
    time.sleep(interval)
    r = requests.get(f"{API_BASE}/videos/generations/{task_id}", headers=HEADERS).json()
    status = r["status"]
    print("status:", status)
    if status == "succeeded":
        print("video url:", r["data"][0]["url"])
        break
    if status in ("failed", "canceled"):
        print("error:", r.get("error"))
        break
    interval = min(interval + 1, 10)  # 慢慢退避到 10s`,
          },
          {
            key: 'node',
            label: 'Node / TypeScript',
            lang: 'ts',
            code: `const API_BASE = '${API_BASE}';
const KEY = 'sk-your-key';
const headers = { Authorization: \`Bearer \${KEY}\` };

// 1. 提交
const submit = await fetch(\`\${API_BASE}/videos/generations\`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'doubao-seedance-2-0-260128',
    prompt: '一只穿西装的柴犬指挥交通',
    duration: 5,
    aspect_ratio: '16:9',
  }),
}).then((r) => r.json());
const taskId = submit.id;

// 2. 轮询
let interval = 3000;
while (true) {
  await new Promise((r) => setTimeout(r, interval));
  const r = await fetch(\`\${API_BASE}/videos/generations/\${taskId}\`, { headers }).then((r) => r.json());
  if (r.status === 'succeeded') {
    console.log('video url:', r.data[0].url);
    break;
  }
  if (r.status === 'failed' || r.status === 'canceled') {
    console.log('error:', r.error);
    break;
  }
  interval = Math.min(interval + 1000, 10000);
}`,
          },
        ]}
      />

      <h2>3. 取消任务</h2>
      <p>
        <code>POST {API_BASE}/videos/generations/:task_id/cancel</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl -X POST ${API_BASE}/videos/generations/vgen-x7k3p2m.../cancel \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>
        终态任务无法取消(会直接返当前状态);仍在 <code>queued</code> /
        <code>running</code> 时调用会尝试通知上游中断。
        <strong>取消不保证免费</strong> —— 若上游已经完成生成,仍按完成计费。
      </p>

      <h2>图生视频(i2v)</h2>
      <p>把参考图通过 <code>image_url</code> 或 <code>images</code> 传入即可:</p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v3-omni",
  "prompt": "镜头慢慢推近,主角抬起手",
  "duration": 5,
  "image_url": "https://example.com/portrait.jpg"
}`}
      />
      <p>
        多图参考(Vidu 多图、Kling V3 Omni 等)用 <code>images</code> 数组:
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "viduq3-turbo",
  "prompt": "两个角色对话",
  "duration": 5,
  "images": [
    "https://example.com/character1.png",
    "https://example.com/character2.png"
  ]
}`}
      />

      <Callout type="info" title="参考图来源建议">
        <p style={{ margin: 0 }}>
          公网可达的 HTTP(S) URL 最稳;模桥会优先透传 URL,避免大体积 base64 上行慢。
          本地 / 私有 / 不公开的图建议先用{' '}
          <Link to="/docs/sdk">/v1/files</Link>{' '}
          上传,再用 <code>image_asset_ids</code> 引用 —— 比 base64 内联更高效,
          也能复用历史素材。
        </p>
      </Callout>

      <h2>各模型差异速查</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>模型</th>
              <th>能力 / 特点</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>doubao-seedance-2-0-*</code>
              </td>
              <td>
                字节跳动 Seedance,支持文生视频 + 图生视频,质量稳定,中文 prompt 友好。
                支持 5s / 10s,常见 <code>16:9</code> / <code>9:16</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>veo-3.1-generate-preview</code>
              </td>
              <td>
                Google Veo 3.1,质量第一梯队;支持文生视频 + 图生视频(inlineData /
                referenceImages)。默认 8s,部分时长需要预览/正式分级 access。
              </td>
            </tr>
            <tr>
              <td>
                <code>kling-v3-omni</code>
              </td>
              <td>
                可灵 V3 Omni,**走单独的 omni-video 端点**,模桥已自动路由。支持多参考图
                (image_list),适合复杂分镜场景。
              </td>
            </tr>
            <tr>
              <td>
                <code>kling-v1 / v2 / pro / std / master</code>
              </td>
              <td>
                可灵传统 t2v / i2v 模型,按 mode(std / pro / master)分档计费。
              </td>
            </tr>
            <tr>
              <td>
                <code>viduq3-turbo</code>
              </td>
              <td>
                Vidu Q3 Turbo,主打速度,适合短视频快速生成;支持多图参考。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>常见错误</h2>
      <ul>
        <li>
          <strong><code>image_url is not valid</code></strong> —— 上游下载不到参考图。
          检查 URL 是否公网可达,或换用 <code>image_asset_ids</code>。
        </li>
        <li>
          <strong><code>insufficient_quota</code></strong> —— 视频单价较高(5s 视频通常 0.2~1 USD),
          扣款时余额不够。前往 <Link to="/billing">充值</Link>。
        </li>
        <li>
          <strong>任务长时间 <code>queued</code></strong> —— 通常是上游排队。
          1 分钟以上没动可以取消重试,或换一个同类型模型。
        </li>
        <li>
          <strong>返回 URL 过期</strong> —— 模桥转存后的 URL 一般 7 天内有效;
          长期保存请尽快下载到自家存储。
        </li>
      </ul>
      <p>
        完整错误码与 HTTP 状态对照见 <Link to="/docs/errors">错误码</Link>;
        历史任务可在{' '}
        <Link to="/console/logs/videos">控制台 → 视频历史</Link>{' '}
        查到,失败任务也会列出,方便对账。
      </p>
    </>
  );
}
