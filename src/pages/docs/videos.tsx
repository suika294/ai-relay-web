import { Link } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocVideos() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>视频生成</h1>
      <p>
        {site.name}已聚合 Google Veo、Doubao Seedance、Kling(可灵)、Vidu 等主流视频
        模型,统一通过 OpenAI 风格的 <code>/v1/videos/generations</code>{' '}
        异步任务接口暴露:你 <strong>提交</strong> 一个任务拿到 <code>task_id</code>,
        然后 <strong>轮询</strong> 直到任务进入终态(<code>succeeded</code> /
        <code>failed</code> / <code>canceled</code>),
        成功时拿到可下载的视频 URL。
      </p>

      <Callout type="info" title="视频生成是异步任务">
        <p style={{ margin: 0 }}>
          视频模型生成时间从十几秒到几分钟不等,所以接口设计成<strong>提交 + 轮询</strong>两步,
          不像 chat 那样一次性返回。生成成功后,{site.name}会把上游临时 URL 转存到自家
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
                <code>first_frame_image</code>
              </td>
              <td>string</td>
              <td>
                <strong>首帧图。</strong>i2v 最常用的字段。可以是公网{' '}
                <code>http(s)://</code> URL 或 <code>data:image/...;base64,...</code>(Doubao
                Seedance 只接受公网 URL)。
                {site.name}按 provider 路由:Doubao → <code>role=first_frame</code>、
                Vidu → <code>/img2video</code>、Kling Omni → <code>type=first_frame</code>、
                Kling I2V → <code>image</code>、Veo → <code>instance.image</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>last_frame_image</code>
              </td>
              <td>string</td>
              <td>
                尾帧图。和 <code>first_frame_image</code> 一起传就是<strong>首尾帧驱动</strong>:
                Vidu 自动走 <code>/start-end2video</code>、Doubao 上双 role、Kling Omni 出{' '}
                <code>end_frame</code>、Kling I2V 出 <code>image_tail</code>、Veo 出{' '}
                <code>instance.lastFrame</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>images</code>
              </td>
              <td>array</td>
              <td>
                <strong>多图参考 / 角色融合。</strong>每项是 URL 或 data URL,Doubao 仅公网 URL。
                Vidu 自动走 <code>/reference2video</code>、Doubao 全部 <code>role=reference_image</code>、
                Veo 走 <code>instance.referenceImages</code>(最多 3 张)。
                <strong>2026-05 之后语义严格为"参考图"</strong>,单张图不再当首帧 ——
                要做首帧驱动请用 <code>first_frame_image</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>first_frame_asset_id</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  + <code>last_frame_asset_id</code>
                </div>
                <div style={{ color: '#999', fontSize: 12 }}>
                  + <code>image_asset_ids</code>
                </div>
              </td>
              <td>integer / array</td>
              <td>
                上面三个 URL 字段对应的<strong>平台素材 ID</strong>,适合本地/私有图不方便外网
                访问的场景。{site.name}从 storage 直读原图,按 provider 转 base64 /
                data URL / 公网 URL 注入。<code>image_asset_ids</code> 按位对齐到{' '}
                <code>images</code>,<code>0</code> 表示该位是外部 URL。
              </td>
            </tr>
            <tr>
              <td>
                <code>reference_video</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  + <code>reference_video_asset_id</code>
                </div>
              </td>
              <td>string / integer</td>
              <td>
                <strong>参考视频。</strong>用作视频续写 / 风格迁移 / 角色一致性的输入视频。
                可以是公网 <code>http(s)://</code> 视频 URL,或上传到平台后的{' '}
                <code>reference_video_asset_id</code>(content-type 必须以{' '}
                <code>video/</code> 开头,大小上限 500MB)。
                <strong>仅在 model 声明 <code>supports_reference_video</code> 能力时可用</strong>;
                未声明的模型传该字段会直接返回 400。视频体积大,
                <strong>不接受 base64 / data URL 内联</strong>。
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

      <Callout type="info" title="图片入参的三类语义">
        <p style={{ margin: 0 }}>
          视频图片输入按语义分三类:<strong>首帧 / 尾帧 / 参考图</strong>,{site.name}按 provider
          自动路由到对应端点或 role,你不再需要关心"传 1 张图是不是首帧"、"传 2 张图怎么变首尾帧"。
          老字段 <code>image_url</code> / <code>reference_images</code> /{' '}
          <code>reference_asset_ids</code> 仍兼容(JSON 解析阶段自动迁移),但建议直接用新协议字段。
        </p>
      </Callout>

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
      <p>
        <strong>首帧驱动</strong> —— 单张参考图当作视频起始帧:
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v3-omni",
  "prompt": "镜头慢慢推近,主角抬起手",
  "duration": 5,
  "first_frame_image": "https://example.com/portrait.jpg"
}`}
      />
      <p>
        <strong>首尾帧驱动</strong> —— 首帧 + 尾帧,模型补完中间过渡(Vidu 自动走{' '}
        <code>/start-end2video</code>、Doubao 双 role、Kling I2V 走 image+image_tail):
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "viduq3-turbo",
  "prompt": "在两帧之间补完稳定的过渡运动",
  "duration": 5,
  "first_frame_image": "https://example.com/start.png",
  "last_frame_image":  "https://example.com/end.png"
}`}
      />
      <p>
        <strong>多图参考 / 角色融合</strong> —— 把若干参考图喂给模型,生成时让画面融合
        这些主体 / 场景 / 道具(Vidu 自动走 <code>/reference2video</code>、Kling Omni 多
        reference、Doubao reference_image role):
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v3-omni",
  "prompt": "主角穿着道具中的银色外套,出现在场景图的屋顶上,缓慢走向镜头",
  "duration": 5,
  "images": [
    "https://example.com/character.png",
    "https://example.com/scene.png",
    "https://example.com/outfit.png"
  ]
}`}
      />

      <Callout type="info" title="参考图来源建议">
        <p style={{ margin: 0 }}>
          公网可达的 HTTP(S) URL 最稳;{site.name}会优先透传 URL,避免大体积 base64 上行慢。
          本地 / 私有 / 不公开的图建议先用{' '}
          <Link to="/docs/sdk">/v1/files</Link>{' '}
          上传,再用 <code>first_frame_asset_id</code> /{' '}
          <code>last_frame_asset_id</code> / <code>image_asset_ids</code> 引用 ——
          比 base64 内联更高效,也能复用历史素材。Doubao Seedance 只接受公网 URL,
          这条路径会由 {site.name} 自动 sweeper 转存为公网 URL 后再交给上游。
        </p>
      </Callout>

      <h2>视频参考(reference_video)</h2>
      <p>
        部分模型支持<strong>以视频为输入</strong>的生成模式 —— 视频续写、风格迁移、
        角色一致性等。统一通过 <code>reference_video</code>(公网 URL)或{' '}
        <code>reference_video_asset_id</code>(平台素材 ID)提交,后端按 provider 路由到
        对应上游端点。
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "viduq1",
  "prompt": "在原视频结尾基础上,镜头继续推进,主角抬手指向远方",
  "duration": 5,
  "reference_video": "https://example.com/clip.mp4"
}`}
      />
      <p>
        平台素材形式(推荐;{site.name}会签发可被上游下载的临时 URL):
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v1-6",
  "prompt": "保持原片风格,延长 5 秒",
  "reference_video_asset_id": 987
}`}
      />
      <Callout type="warn" title="能力门禁">
        <p style={{ margin: 0 }}>
          <code>reference_video</code> 只在 model 声明 <code>supports_reference_video</code>{' '}
          能力时才被接受;未声明的模型(如 <code>viduq3-turbo</code>、<code>kling-v3-omni</code>)
          传该字段会立即返回 <code>400</code>。已开启支持的型号见
          <Link to="/docs/models">模型列表</Link>。
          视频体积通常较大,<strong>不接受 base64 / data URL 内联</strong>,
          仅支持公网 URL 或 asset_id 两种形态;asset 大小上限 500MB。
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
                已声明 <code>supports_reference_video</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>veo-3.0/3.1-generate-preview</code>
              </td>
              <td>
                Google Veo,质量第一梯队;支持文生视频 + 图生视频(inlineData /
                referenceImages)。默认 8s,部分时长需要预览/正式分级 access。
                已声明 <code>supports_reference_video</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>kling-v3-omni</code>
              </td>
              <td>
                可灵 V3 Omni,**走单独的 omni-video 端点**,{site.name}已自动路由。支持多参考图
                (image_list),适合复杂分镜场景。omni 输入语义不同,
                <strong>不接受 <code>reference_video</code></strong>。
              </td>
            </tr>
            <tr>
              <td>
                <code>kling-v1 / kling-v1-6</code>
              </td>
              <td>
                可灵 V1 系列 t2v / i2v 模型;按 mode(std / pro / master)分档计费。
                已声明 <code>supports_reference_video</code>(走上游 video-extend)。
              </td>
            </tr>
            <tr>
              <td>
                <code>viduq1 / vidu1.5 / vidu2.0</code>
              </td>
              <td>
                Vidu 经典系列,支持文生 / 图生 / 视频续写(<code>/extend2video</code>);
                已声明 <code>supports_reference_video</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>viduq3-turbo</code>
              </td>
              <td>
                Vidu Q3 Turbo,主打速度,适合短视频快速生成;支持多图参考。
                上游不支持 extend,<strong>不接受 <code>reference_video</code></strong>。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>常见错误</h2>
      <ul>
        <li>
          <strong><code>image_url is not valid</code></strong> —— 上游下载不到参考图。
          检查 <code>first_frame_image</code> / <code>last_frame_image</code> /{' '}
          <code>images</code> 里的 URL 是否公网可达,或改用对应的{' '}
          <code>*_asset_id</code> / <code>image_asset_ids</code> 走平台素材。
        </li>
        <li>
          <strong><code>model "..." does not support reference_video</code></strong> —— 当前
          model 没有声明 <code>supports_reference_video</code> 能力,但请求里带了{' '}
          <code>reference_video</code> / <code>reference_video_asset_id</code>。
          换一个声明支持的模型,或去掉该字段。
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
          <strong>返回 URL 过期</strong> —— {site.name}转存后的 URL 一般 7 天内有效;
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
