import { Link } from '@umijs/max';
import { Callout, CodeBlock } from './_shared';

export default function DocErrors() {
  return (
    <>
      <h1>错误码</h1>
      <p>
        模桥沿用 OpenAI 风格的错误返回 —— HTTP 状态码 + JSON 错误体。
        本页列出所有可能遇到的错误码、原因和处置建议。
      </p>

      <h2>错误返回结构</h2>
      <CodeBlock
        lang="json"
        code={`{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": "invalid_api_key",
    "param": null
  }
}`}
      />
      <ul>
        <li>
          <code>message</code> 人类可读的错误描述。
        </li>
        <li>
          <code>type</code> 错误大类,例如{' '}
          <code>authentication_error</code> / <code>invalid_request_error</code> /
          <code>rate_limit_error</code>。
        </li>
        <li>
          <code>code</code> 细分错误码,程序逻辑判断用。
        </li>
        <li>
          <code>param</code> 出问题的字段名(如果是请求体校验错误)。
        </li>
      </ul>

      <h2>HTTP 状态码速查</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 110 }}>状态码</th>
              <th style={{ width: 160 }}>含义</th>
              <th>常见原因 / 处置</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>400</strong>
              </td>
              <td>请求格式错误</td>
              <td>
                请求体不是合法 JSON,或必填字段缺失。
                按错误 <code>message</code> 修改请求,再次发起即可。
              </td>
            </tr>
            <tr>
              <td>
                <strong>401</strong>
              </td>
              <td>未授权 / Key 无效</td>
              <td>
                没传 <code>Authorization</code>,或 Key 拼错 / 已被删除。
                检查 Key,或到{' '}
                <Link to="/console/tokens">API Key</Link> 重新生成。
              </td>
            </tr>
            <tr>
              <td>
                <strong>402</strong>
              </td>
              <td>余额不足</td>
              <td>
                账户余额或本 Key 配额已耗尽。前往{' '}
                <Link to="/billing">充值</Link> 或调高 Key 的{' '}
                <code>quota_limit</code>。
              </td>
            </tr>
            <tr>
              <td>
                <strong>403</strong>
              </td>
              <td>权限不足</td>
              <td>
                当前 Key 没有调用该模型的权限(被「限制模型」拦截)。
                到 API Key 页编辑允许的模型范围。
              </td>
            </tr>
            <tr>
              <td>
                <strong>404</strong>
              </td>
              <td>资源不存在</td>
              <td>
                URL 拼错(例如把 <code>/v1/chat/completions</code> 写成{' '}
                <code>/v1/chat/completion</code>),或者请求的{' '}
                <code>model</code> ID 平台不存在 / 当前已下线。
              </td>
            </tr>
            <tr>
              <td>
                <strong>422</strong>
              </td>
              <td>参数错误</td>
              <td>
                请求体 schema 合法但具体值越界,例如{' '}
                <code>temperature: 5</code>(应在 0~2)、
                <code>max_tokens</code> 超过模型上限。
              </td>
            </tr>
            <tr>
              <td>
                <strong>429</strong>
              </td>
              <td>触发限速</td>
              <td>
                请求过快(超过 RPM)或并发过高(超过 TPM)。
                建议加退避(exponential backoff)重试,详见{' '}
                <Link to="/docs/rate-limits">限速</Link>。
              </td>
            </tr>
            <tr>
              <td>
                <strong>500</strong>
              </td>
              <td>服务内部错误</td>
              <td>
                模桥侧异常。请稍后重试,若持续出现,带上响应里的{' '}
                <code>id</code> 联系客服。
              </td>
            </tr>
            <tr>
              <td>
                <strong>502</strong>
              </td>
              <td>上游错误</td>
              <td>
                上游厂商返回了异常响应。可换一个同类型模型先继续业务,
                或重试。
              </td>
            </tr>
            <tr>
              <td>
                <strong>503</strong>
              </td>
              <td>上游忙</td>
              <td>
                上游厂商当前负载过高 / 临时不可用,稍后重试通常即可恢复。
              </td>
            </tr>
            <tr>
              <td>
                <strong>504</strong>
              </td>
              <td>上游超时</td>
              <td>
                上游响应超时。可适当减小 <code>max_tokens</code> 或切到响应更快的模型。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>常见细分 code</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>error.code</th>
              <th>含义</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>invalid_api_key</code>
              </td>
              <td>Key 不存在或已被删除。</td>
            </tr>
            <tr>
              <td>
                <code>insufficient_quota</code>
              </td>
              <td>余额或 Key 配额耗尽。</td>
            </tr>
            <tr>
              <td>
                <code>model_not_found</code>
              </td>
              <td>请求里 <code>model</code> ID 错误或当前未启用。</td>
            </tr>
            <tr>
              <td>
                <code>model_not_allowed</code>
              </td>
              <td>当前 Key 不在允许列表里。</td>
            </tr>
            <tr>
              <td>
                <code>context_length_exceeded</code>
              </td>
              <td>消息总 token 数超过模型上下文上限。</td>
            </tr>
            <tr>
              <td>
                <code>rate_limit_exceeded</code>
              </td>
              <td>触发 RPM/TPM 限速。</td>
            </tr>
            <tr>
              <td>
                <code>upstream_error</code>
              </td>
              <td>上游厂商返回了错误,具体见 <code>message</code>。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>建议的重试策略</h2>
      <Callout type="info" title="哪些错误可以重试">
        <p style={{ margin: 0 }}>
          <strong>可重试</strong>:429 / 500 / 502 / 503 / 504。建议指数退避
          (1s → 2s → 4s → 8s),最多 5 次。
          <br />
          <strong>不应重试</strong>:400 / 401 / 402 / 403 / 404 / 422 ——
          这些是请求/配置问题,无脑重试只是浪费资源,先按 message 修了再说。
        </p>
      </Callout>

      <p>
        每次调用还能在{' '}
        <Link to="/console/logs/usage">控制台 → 日志</Link>{' '}
        里查到完整的请求 ID、上游响应原文,排查上游异常很有用。
      </p>
    </>
  );
}
