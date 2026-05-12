import { Link } from '@umijs/max';
import { Callout, CodeBlock } from './_shared';

export default function DocRateLimits() {
  return (
    <>
      <h1>限速</h1>
      <p>
        为了保护上游稳定性、避免单一用户挤占资源,模桥在多个维度上做了限速。
        本页帮你理解触发原因、读懂返回头、设计合理的退避策略。
      </p>

      <h2>限速维度</h2>
      <ul>
        <li>
          <strong>RPM</strong>(Requests Per Minute):每分钟可发起的请求总数。
        </li>
        <li>
          <strong>TPM</strong>(Tokens Per Minute):每分钟可消耗的总 token 数
          (输入 + 输出之和)。
        </li>
        <li>
          <strong>并发数</strong>:同一时刻在途请求的最大数量。
        </li>
        <li>
          <strong>上游侧限速</strong>:上游厂商对模桥账户做的限速,
          会被透传回来,具体阈值因模型而异。
        </li>
      </ul>

      <Callout type="info" title="同时在 Key 和账户级生效">
        <p style={{ margin: 0 }}>
          限速按「Key 级」和「账户级」两层结算 —— 任一一层达到上限都会触发{' '}
          <code>429</code>。可以在「<Link to="/console/tokens">API Key</Link>」
          页面为每把 Key 单独设置上限,把高风险业务隔离开。
        </p>
      </Callout>

      <h2>触发表现</h2>
      <p>触发限速时返回 <code>429 Too Many Requests</code> + 标准错误体:</p>
      <CodeBlock
        lang="json"
        code={`{
  "error": {
    "message": "Rate limit reached for gpt-4o-mini, please retry in 12.4s",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}`}
      />
      <p>同时响应头里会带上有用的提示字段:</p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 260 }}>响应头</th>
              <th>含义</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>x-ratelimit-limit-requests</code>
              </td>
              <td>当前窗口允许的最大请求数</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-remaining-requests</code>
              </td>
              <td>本窗口剩余请求数</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-reset-requests</code>
              </td>
              <td>本窗口剩余多久重置(秒)</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-limit-tokens</code>
              </td>
              <td>当前窗口允许消耗的最大 token 数</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-remaining-tokens</code>
              </td>
              <td>剩余 token 数</td>
            </tr>
            <tr>
              <td>
                <code>retry-after</code>
              </td>
              <td>建议多少秒后再重试,符合 RFC 7231</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>推荐的退避策略</h2>
      <p>遇到 <code>429</code> 时,优先按下面顺序处理:</p>
      <ol>
        <li>
          看响应头 <code>retry-after</code> 或错误 message 里的{' '}
          <em>retry in Ns</em>,严格等够再发。
        </li>
        <li>
          没有指示秒数时,用<strong>指数退避 + 抖动</strong>:
          <code>delay = min(2 ** attempt, 30) + random(0, 1)</code>,
          最多重试 5 次。
        </li>
        <li>
          重试仍失败 → 降级到同类型的另一款模型,或排队后台处理。
        </li>
      </ol>

      <CodeBlock
        lang="python"
        code={`import time, random
from openai import OpenAI, RateLimitError

client = OpenAI(api_key="sk-your-key", base_url="http://localhost:8080/v1")

def call_with_retry(**kwargs):
    for attempt in range(5):
        try:
            return client.chat.completions.create(**kwargs)
        except RateLimitError as e:
            # 优先按响应里的 retry_after
            wait = getattr(e, "retry_after", None) or min(2 ** attempt, 30)
            time.sleep(wait + random.random())
    raise RuntimeError("rate-limited after 5 retries")`}
      />

      <h2>调高你的额度</h2>
      <ul>
        <li>
          单 Key 的 <code>quota_limit</code> 在{' '}
          <Link to="/console/tokens">API Key</Link>{' '}
          页可以直接调,改大即可。
        </li>
        <li>
          账户级 RPM / TPM 由分组策略决定,如需更大额度,联系管理员调整你的用户分组。
        </li>
        <li>
          高并发业务建议「多 Key + 客户端轮询」分摊压力,避免单 Key 打满。
        </li>
      </ul>

      <Callout type="warn" title="不要无脑高并发重试">
        <p style={{ margin: 0 }}>
          429 之后立刻无延迟重试只会被继续 429,反而让恢复变慢。
          上面给的退避策略是最低保障,建议生产环境用任务队列(BullMQ / Celery)
          做削峰。
        </p>
      </Callout>
    </>
  );
}
