import { Link } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocAudio() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>语音 Audio</h1>
      <p>
        {site.name}的语音接口与 OpenAI <code>/v1/audio/*</code> 协议对齐,统一提供
        <strong>语音转文字(ASR)</strong> 与 <strong>文本转语音(TTS)</strong>{' '}
        两类能力,当前由腾讯云语音上游承接。
      </p>

      <Callout type="info" title="路由方式与计费">
        <p style={{ margin: 0 }}>
          语音接口当前按 <code>channel.type</code> 直接路由(不走标准 model→channel
          候选),body / query 的 <code>channel</code> 字段可选点名指定渠道。请求会
          走 <code>APIKeyAuth + RateLimit + QuotaCheck</code> 三件套,但 ASR 同步链路
          v1 暂未接入计费,异步与 TTS 已计费;具体单价详见模型列表里的{' '}
          <code>audio</code> 类型模型。
        </p>
      </Callout>

      <h2 id="asr">语音转文字 (ASR)</h2>
      <p>
        <code>POST {API_BASE}/audio/transcriptions</code> 同步一句话识别 ≤ 60 秒;
        <code>POST {API_BASE}/audio/transcriptions/async</code> + 轮询 <code>GET /:id</code>{' '}
        处理长录音文件(可达数小时)。
      </p>

      <h3>同步请求</h3>
      <p>同时接受 <strong>multipart/form-data</strong>(OpenAI Whisper 习惯,上限 64MB)
        与 <strong>application/json</strong>(URL 或 base64 内联,上限 20MB)两种入参。
      </p>
      <TabbedCode
        snippets={[
          {
            key: 'multipart',
            label: 'multipart (file=@xxx.wav)',
            lang: 'bash',
            code: `curl ${API_BASE}/audio/transcriptions \\
  -H "Authorization: Bearer sk-your-key" \\
  -F "model=asr-16k-zh" \\
  -F "file=@./clip.wav" \\
  -F "response_format=verbose_json"`,
          },
          {
            key: 'json-url',
            label: 'JSON · url',
            lang: 'bash',
            code: `curl ${API_BASE}/audio/transcriptions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "asr-16k-zh",
    "url": "https://example.com/clip.wav",
    "format": "wav",
    "language": "zh"
  }'`,
          },
          {
            key: 'json-b64',
            label: 'JSON · audio_data (base64)',
            lang: 'bash',
            code: `curl ${API_BASE}/audio/transcriptions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "asr-16k-zh",
    "audio_data": "UklGRiQAAABXQVZF...",
    "format": "wav"
  }'`,
          },
        ]}
      />

      <h3>请求字段</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>字段</th>
              <th style={{ width: 100 }}>类型</th>
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
                ASR 模型 ID:同步用 <code>asr-16k-zh</code> / <code>asr-16k-zh-en</code> /{' '}
                <code>asr-16k-en</code> / <code>asr-16k-ja</code> / <code>asr-16k-ko</code> /{' '}
                <code>asr-8k-zh</code>(电话场景);异步录音文件用 <code>asr-recfile-*</code> 系列。
              </td>
            </tr>
            <tr>
              <td>
                <code>file</code>
                <div style={{ color: '#999', fontSize: 12 }}>multipart 时必填</div>
              </td>
              <td>binary</td>
              <td>multipart 上传时直接附文件;<code>format</code> 可从 filename 扩展名兜底推断。</td>
            </tr>
            <tr>
              <td>
                <code>url</code>
              </td>
              <td>string</td>
              <td>JSON 模式下,公网可达的音频文件 URL。与 <code>audio_data</code> 二选一。</td>
            </tr>
            <tr>
              <td>
                <code>audio_data</code>
              </td>
              <td>string</td>
              <td>
                JSON 模式下,base64 编码的音频内容;容忍 <code>data:audio/wav;base64,...</code> 前缀。
                上限 20MB(base64 后),与 <code>url</code> 二选一。
              </td>
            </tr>
            <tr>
              <td>
                <code>format</code>
              </td>
              <td>string</td>
              <td>音频容器格式:<code>wav</code> / <code>mp3</code> / <code>m4a</code> / <code>flac</code> / <code>pcm</code>。</td>
            </tr>
            <tr>
              <td>
                <code>language</code>
              </td>
              <td>string</td>
              <td>语种提示,<code>zh</code> / <code>en</code> / <code>ja</code> / <code>ko</code>。</td>
            </tr>
            <tr>
              <td>
                <code>channel</code>
              </td>
              <td>string</td>
              <td>可选,显式指定渠道名;不传则按 <code>channel.type=asr_tencent</code> 取首个启用渠道。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>响应</h3>
      <CodeBlock
        lang="json"
        code={`{
  "text": "今天天气真不错。",
  "duration_ms": 5240,
  "segments": [
    { "start_ms": 0,    "end_ms": 1820, "text": "今天天气" },
    { "start_ms": 1820, "end_ms": 5240, "text": "真不错。" }
  ],
  "words": [
    { "word": "今天", "start_ms": 0,    "end_ms": 580 },
    { "word": "天气", "start_ms": 580,  "end_ms": 1820 }
  ]
}`}
      />
      <ul>
        <li><code>segments</code>:句级时间戳。</li>
        <li><code>words</code>:字级时间戳,腾讯云 <code>WordInfo=2</code> 自动开启。</li>
        <li><code>duration_ms</code>:音频长度,异步任务计费用 <code>(duration_ms + 999) / 1000</code> 向上取整成秒。</li>
      </ul>

      <h3>异步录音文件识别</h3>
      <p>
        长录音用 <code>/v1/audio/transcriptions/async</code> 提交,立即返回 task id,
        之后用 <code>GET /v1/audio/transcriptions/&#123;id&#125;?channel=xxx</code> 轮询;
        <code>channel</code> 必须与 submit 时一致。
      </p>
      <CodeBlock
        lang="bash"
        code={`# 1. 提交
curl ${API_BASE}/audio/transcriptions/async \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "asr-recfile-zh-general",
    "url": "https://example.com/meeting-1h.mp3",
    "format": "mp3"
  }'
# → { "id": "12345678901", "status": "queued" }

# 2. 轮询(每 5 ~ 10 秒一次,直到 status=succeeded / failed)
curl "${API_BASE}/audio/transcriptions/12345678901" \\
  -H "Authorization: Bearer sk-your-key"`}
      />

      <Callout type="warn" title="异步任务幂等">
        <p style={{ margin: 0 }}>
          异步 Fetch 当前不写 <code>usage_log</code>(轮询会重复触发,缺幂等表防双扣)。
          运营侧若需要按异步任务对账,建议在客户端用 <code>id</code> 自行去重。
        </p>
      </Callout>

      <h2 id="tts">文本转语音 (TTS)</h2>
      <p>
        <code>POST {API_BASE}/audio/speech</code> 与 OpenAI 完全一致:<strong>成功直接
        返回二进制音频流</strong>,响应头 <code>Content-Type: audio/mpeg</code> 等,
        前端可 <code>&lt;audio src=...&gt;</code> 直接播放。长文本 (&gt; 2000 字符) 走异步。
      </p>

      <h3>同步请求</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/audio/speech \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "tencent-tts-standard",
    "input": "你好,${site.name}。",
    "voice": "alloy",
    "response_format": "mp3",
    "speed": 1.0
  }' --output hello.mp3`}
      />

      <h3>请求字段</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>字段</th>
              <th style={{ width: 100 }}>类型</th>
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
                TTS 模型 ID:<code>tencent-tts-standard</code>(标准音质) /{' '}
                <code>tencent-tts-premium</code>(精品音质,价高约 1.6×) /{' '}
                <code>tencent-tts-hunyuan-lite</code>(混元大模型语音)。
              </td>
            </tr>
            <tr>
              <td>
                <code>input</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>string</td>
              <td>
                合成文本。同步接口上限 2000 字符;超过请走异步。1 个中文字符 = 1 token,
                按字符数(<code>per_token</code> 模式)计费。
              </td>
            </tr>
            <tr>
              <td>
                <code>voice</code>
              </td>
              <td>string</td>
              <td>
                兼容腾讯云数字 ID(例如 <code>101001</code>)与 OpenAI 风格逻辑名:<br />
                <code>alloy</code> → 101001 智瑜 · <code>echo</code> → 101002 智聆 ·{' '}
                <code>fable</code> → 101003 智美 · <code>shimmer</code> → 101005 智莉。
              </td>
            </tr>
            <tr>
              <td>
                <code>response_format</code>
              </td>
              <td>string</td>
              <td>
                输出容器:<code>mp3</code>(默认)/ <code>wav</code> / <code>pcm</code> /{' '}
                <code>opus</code> / <code>aac</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>speed</code>
              </td>
              <td>number</td>
              <td>
                语速,OpenAI 风格 <code>0.25 ~ 4.0</code>;后端自动映射到腾讯云{' '}
                <code>-2 ~ 2</code> 整数档。
              </td>
            </tr>
            <tr>
              <td>
                <code>channel</code>
              </td>
              <td>string</td>
              <td>可选,显式指定渠道(默认按 <code>channel.type=tts_tencent</code> 取首个启用)。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>异步长文本</h3>
      <p>
        异步接口 <code>POST /v1/audio/speech/async</code> 单次最多 10 万字符,返回 task id,
        通过 <code>GET /v1/audio/speech/&#123;id&#125;?channel=xxx</code> 轮询;成功后
        响应里的 <code>url</code> 是平台 <code>/v1/cdn/:slug</code> 永久代理 URL,可直接
        给浏览器 <code>&lt;audio&gt;</code> 或前端下载。
      </p>

      <Callout type="info" title="为什么 TTS 走 per_token 不是 per_char">
        <p style={{ margin: 0 }}>
          后端把 1 字符 = 1 token 复用进既有 <code>per_token</code> 计费模式
          (<code>PromptTokens = CharCount</code>),避免新增 <code>per_char</code> 模式
          让定价配置变复杂。对应价目详见模型表里的 <code>tencent-tts-*</code> 行。
        </p>
      </Callout>

      <h2>使用日志与文本审计</h2>
      <p>
        <code>usage_logs.extra</code> 列会回填 ASR 的 <code>transcribe_text</code> +{' '}
        <code>segments</code> + <code>words</code>,TTS 的 <code>prompt_text</code>{' '}
        (合成原文);受 <code>usage_log_text</code> 配置控制(默认开 + 32KB 截断 +{' '}
        base64 脱敏),管理员可在后台开关。结合{' '}
        <Link to="/docs/errors">错误码</Link> 与 trace_id,所有上游往返都可回溯。
      </p>
    </>
  );
}
