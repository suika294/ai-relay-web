import { useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

// Vidu S1 实时数字人互动文档页（内测）。与 async「数智人」视频生成文档（digital-human.tsx）
// 是两回事：这里是实时、可交互、双向感知的流式数字人。
//
// 文案走 T(id, zhDefault)：中文来自默认值（永不显示裸 id），英文由 docs.gen.ts 的
// docs.dhLive.* 键覆盖；代码/JSON 语言中立，直接用 CodeBlock。
export default function DocDigitalHumanLive() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  const T = (id: string, dm: string, values?: Record<string, any>) =>
    intl.formatMessage({ id: `docs.dhLive.${id}`, defaultMessage: dm }, values);

  return (
    <>
      <h1>{T('title', 'Vidu S1 实时数字人互动')}</h1>
      <p>
        {T(
          'intro',
          '{name} 代理接入了生数科技 Vidu S1 流式视频数字人：可实时交互、会表演、双向感知。平台负责隐藏上游 Token（WebSocket 走服务端代理）并按时长计费，你只需用一把 sk- 密钥即可跑通。',
          { name: site.name },
        )}
      </p>

      <Callout type="warn" title={T('betaTitle', '内测能力')}>
        <p style={{ margin: 0 }}>
          {T('betaDesc', '该能力处于内测阶段，需使用已开通 live 的渠道密钥。video 模式必然会遇到 NOT_READY（正常现象），必须实现重试。')}
        </p>
      </Callout>

      {/* ---------------- 接入流程 ---------------- */}
      <h2 id="flow">{T('flowHeading', '接入流程（6 步）')}</h2>
      <CodeBlock
        lang="text"
        code={`1. POST /v1/live/sessions          创建会话 → 拿 live_id + 阿里云 RTC 凭证
2. 用 rtc 凭证加入阿里云 ARTC 频道    推麦克风(+摄像头)、订阅数字人音视频
3. 连 WS /v1/live/ws?live_id=..      发 conn_init「我准备好了」
4. 收 conn_init_ack success:true     数字人上线，开始互动
5. 互动中：文字 / 心跳 / 处理被踢下线
6. 挂断 → GET /v1/live/sessions/:id  查计费时长 billed_seconds`}
      />

      <h3>{T('overviewHeading', '接口总览')}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>{T('colMethod', '方法')}</th>
              <th style={{ width: 260 }}>{T('colPath', '路径')}</th>
              <th>{T('colUse', '用途')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>POST</code></td>
              <td><code>/v1/live/sessions</code></td>
              <td>{T('useCreate', '创建数字人会话')}</td>
            </tr>
            <tr>
              <td><code>GET</code></td>
              <td><code>/v1/live/sessions/:id</code></td>
              <td>{T('useGet', '查询会话状态 + 计费时长')}</td>
            </tr>
            <tr>
              <td><code>WS</code></td>
              <td><code>/v1/live/ws?live_id=</code></td>
              <td>{T('useWs', '控制信令（开始 / 文字 / 挂断）')}</td>
            </tr>
            <tr>
              <td><code>GET</code></td>
              <td><code>/v1/live/voices</code></td>
              <td>{T('useVoices', '音色列表（系统 + 自定义克隆）')}</td>
            </tr>
            <tr>
              <td><code>POST</code></td>
              <td><code>/v1/live/voices/clone</code></td>
              <td>{T('useClone', '音色克隆')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------------- 创建会话 ---------------- */}
      <h2 id="create">{T('createHeading', '第一步 · 创建会话')}</h2>
      <p>
        <code>POST {API_BASE}/live/sessions</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/live/sessions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "call_mode": "video",
    "avatar": {
      "persona": "你是一个友好的客服，请自然地与用户实时互动",
      "image_uri": "https://your-avatar.png",
      "name": "小美",
      "voice": "Tina"
    }
  }'`}
      />

      <h3>{T('reqFieldsHeading', '请求字段')}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 170 }}>{T('colField', '字段')}</th>
              <th style={{ width: 90 }}>{T('colRequired', '必填')}</th>
              <th>{T('colDesc', '说明')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>call_mode</code></td>
              <td>{T('yes', '是')}</td>
              <td>{T('fCallMode', 'audio（纯语音）| video（音视频）')}</td>
            </tr>
            <tr>
              <td><code>avatar.persona</code></td>
              <td>{T('yes', '是')}</td>
              <td>{T('fPersona', '数字人人设，不限字符数，见下方「人设模板」')}</td>
            </tr>
            <tr>
              <td><code>avatar.image_uri</code></td>
              <td>{T('yes', '是')}</td>
              <td>{T('fImage', '形象图片，支持 URL 或 base64（data:image/png;base64,…）。单人图，PNG/JPG/JPEG/WEBP')}</td>
            </tr>
            <tr>
              <td><code>avatar.name</code></td>
              <td>{T('no', '否')}</td>
              <td>{T('fName', '数字人名字，建议 20 字符内')}</td>
            </tr>
            <tr>
              <td><code>avatar.voice</code></td>
              <td>{T('no', '否')}</td>
              <td>{T('fVoice', '音色，留空用默认 Tina。见 /v1/live/voices')}</td>
            </tr>
            <tr>
              <td><code>channel</code></td>
              <td>{T('no', '否')}</td>
              <td>{T('fChannel', '多个 vidu 渠道并存时点名，一般留空')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{T('respHeading', '响应')}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "live": {
    "id": "123456789",          // 房间 ID，后续步骤都要用，务必保存
    "status": "waiting",         // 此时数字人还没准备好
    "live_duration": 600,        // 本次会话最大时长（秒），最大 600
    "call_mode": "video"
  },
  "rtc": {
    "app_id": "xxxx",
    "channel_id": "live-user-123456789",
    "user_id": "live-user-1001-123456789",
    "token": "base64-token...",  // 进阿里云 RTC 房间的凭证（可安全下发前端）
    "token_expire_at": "1750003600"
  }
}`}
      />

      {/* ---------------- 控制通道 WS ---------------- */}
      <h2 id="ws">{T('wsHeading', '第二步 · 控制通道 WebSocket')}</h2>
      <p>{T('wsIntro', 'WebSocket 是一条持续保持的控制通道。平台把「浏览器 ↔ 平台」桥接到「平台 ↔ Vidu」上游，上游 Token 由平台注入，不下发前端。')}</p>
      <Callout type="info" title={T('wsAuthTitle', '鉴权')}>
        <p style={{ margin: 0 }}>
          {T('wsAuthDesc', '浏览器 WebSocket 无法设置请求头，密钥通过 query 传：')}
          <code>?live_id=..&authorization=sk-your-key</code>
        </p>
      </Callout>
      <p>
        <code>{`WS ${API_BASE.replace(/^http/, 'ws')}/live/ws?live_id=123456789&authorization=sk-your-key`}</code>
      </p>

      <h3>{T('connInitHeading', '连接后立刻发 conn_init')}</h3>
      <CodeBlock
        lang="json"
        code={`{ "type": 1, "live_id": "123456789", "seq_id": 1, "payload": { "conn_init": { "version": 1 } } }`}
      />
      <h3>{T('ackHeading', '等待数字人就绪')}</h3>
      <CodeBlock
        lang="json"
        code={`// ✅ 就绪：可以开始互动
{ "type": 2, "payload": { "conn_init_ack": { "success": true } } }

// ⏳ 未就绪（video 模式常见）：关闭连接，指数退避（2→4→8s）重连后重发 conn_init
{ "type": 2, "payload": { "conn_init_ack": { "success": false, "error_code": "NOT_READY" } } }

// ❌ 初始化彻底失败：需重新创建会话
{ "type": 2, "payload": { "conn_init_ack": { "success": false, "error_code": "LIVE_CONN_INIT_FAILED" } } }`}
      />

      <h3>{T('textHeading', '文字互动 / 心跳')}</h3>
      <CodeBlock
        lang="json"
        code={`// 发送文字（音频/音视频模式均支持）
{ "type": 99, "payload": { "text_msg": { "content": "你好" } } }`}
      />
      <p>{T('heartbeat', '服务端每 5s ping，客户端需 15s 内有任意消息。平台代理已自动维持心跳（gorilla 自动回 pong）。')}</p>

      <h3>{T('hangupHeading', '第三步 · 挂断 / 被踢下线')}</h3>
      <CodeBlock
        lang="json"
        code={`// 主动挂断
{ "type": 5, "live_id": "123456789", "seq_id": 2, "payload": { "hangup": { "hangup_reason": "user_end" } } }

// 被服务器强制断开（必须监听）
{ "type": 6, "payload": { "hangup": { "hangup_reason": "timeout" } } }`}
      />
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>hangup_reason</th>
              <th>{T('colScene', '触发场景')}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code>user_end</code></td><td>{T('hrUserEnd', '用户主动断开')}</td></tr>
            <tr><td><code>timeout</code></td><td>{T('hrTimeout', '会话超时')}</td></tr>
            <tr><td><code>audit_violation</code></td><td>{T('hrAudit', '触发风控断开')}</td></tr>
            <tr><td><code>credit_insufficient</code></td><td>{T('hrCredit', '积分不足')}</td></tr>
            <tr><td><code>sip_closed / provider_closed</code></td><td>{T('hrProvider', 'SIP / provider 侧关闭')}</td></tr>
          </tbody>
        </table>
      </div>

      {/* ---------------- RTC ---------------- */}
      <h2 id="rtc">{T('rtcHeading', '接入阿里云 RTC（音视频）')}</h2>
      <p>{T('rtcIntro', '数字人的视频和声音通过阿里云 ARTC 实时音视频通道传输，需单独集成阿里云 ARTC Web SDK（npm 包 aliyun-rtc-sdk）。用创建会话拿到的 rtc.token / rtc.user_id 加入频道，推本地麦克风（数字人才能听到你），video 模式再推摄像头，并订阅数字人音视频。')}</p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 140 }}>{T('colRole', '角色')}</th>
              <th>{T('colUid', 'RTC 频道内 userID 格式')}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>{T('roleYou', '你（用户）')}</td><td><code>live-user-{'{creatorID}'}-{'{liveID}'}</code></td></tr>
            <tr><td>{T('roleBot', '数字人')}</td><td><code>live-bot-{'{creatorID}'}-{'{liveID}'}</code></td></tr>
            <tr><td>{T('roleVideo', '视频推流')}</td><td><code>live-video-push-{'{creatorID}'}-{'{liveID}'}</code></td></tr>
          </tbody>
        </table>
      </div>
      <Callout type="info">
        <p style={{ margin: 0 }}>
          {T('rtcPlayground', '嫌 RTC 集成麻烦？直接用 ')}
          <a href="/playground" target="_blank" rel="noreferrer">Playground → {T('tabName', '数字人互动')}</a>
          {T('rtcPlayground2', ' 面板：已内置阿里云 ARTC（npm 包 aliyun-rtc-sdk 本地打包，免 CDN）、会话创建、WS 信令、文字互动与计费展示，可一键联调。')}
        </p>
      </Callout>

      {/* ---------------- 音色 ---------------- */}
      <h2 id="voices">{T('voicesHeading', '音色：列表 / 克隆')}</h2>
      <CodeBlock
        lang="bash"
        code={`# 列出可选音色（系统预制 + 自定义克隆）
curl ${API_BASE}/live/voices -H "Authorization: Bearer sk-your-key"

# 克隆音色（每次 899 积分，前 10 次免费）
curl ${API_BASE}/live/voices/clone \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{ "audio_url": "https://your-sample.mp3", "voice": "myvoice01", "language": "zh" }'`}
      />

      {/* ---------------- 计费 ---------------- */}
      <h2 id="billing">{T('billingHeading', '查询会话 · 计费')}</h2>
      <p>
        <code>GET {API_BASE}/live/sessions/:id</code>
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "live": {
    "id": "969824102288199680",
    "status": "ended",          // ended 表示已结束
    "call_mode": "video",
    "live_duration": 600,
    "billed_seconds": 18,        // 计费时长（秒），从数字人 on_live 开始算
    "credits_cost": 27
  }
}`}
      />
      <Callout type="info" title={T('billingTitle', '计费规则')}>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{T('billing1', '计费从数字人上线（conn_init_ack success:true）开始，按会话时长计。')}</li>
          <li>{T('billing2', '时长按 2 秒粒度向上取整（11 秒按 12 秒计）。音频与视频模式价格相同。')}</li>
          <li>{T('billing3', '平台在 WebSocket 会话结束时按 billed_seconds 一次性从你的余额扣费（单价见控制台模型 vidu-s1）。')}</li>
          <li>{T('billing4', '单次会话最长 600 秒，达上限服务端主动关闭。')}</li>
        </ul>
      </Callout>

      {/* ---------------- 人设模板 ---------------- */}
      <h2 id="persona">{T('personaHeading', '人设模板')}</h2>
      <p>{T('personaIntro', 'persona 决定数字人「是谁、什么性格、怎么说话」。推荐分模块描述，越具体形象越稳定：')}</p>
      <CodeBlock
        lang="markdown"
        code={`## 姓名
林小满
## 年龄
24
## 身份
你是用户的生活陪伴者，像住在屏幕里的朋友，说话平等、不居高临下，不是客服。
## 性格
温和、稳定、有点小俏皮。开心不聒噪，安慰不煽情。
## 外貌特征
（从头到脚描述：脸型五官 / 发型发色 / 身形 / 穿着 / 标志性细节）
## 与用户关系
（关系类型 + 情感浓度 + 互相称呼）
## 回复习惯
语气温柔，爱用「呀」「呢」这类语气词，很少说重话。`}
      />
    </>
  );
}
