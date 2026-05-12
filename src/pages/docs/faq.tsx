import { Link } from '@umijs/max';
import { Collapse } from 'antd';
import { Callout } from './_shared';

export default function DocFaq() {
  const items = [
    {
      key: 'q-openai-compat',
      label: '模桥跟 OpenAI 是什么关系?',
      children: (
        <p>
          模桥是一个统一的 API 中转/聚合服务,自身不训练模型 ——
          所有调用都会按你请求里的 <code>model</code> 字段转发给对应上游
          (OpenAI、Anthropic、Google、DeepSeek、Qwen、GLM 等),
          并把响应原样回传给你。协议层完全兼容 OpenAI,所以可以直接用 OpenAI 官方 SDK。
        </p>
      ),
    },
    {
      key: 'q-billing',
      label: '怎么计费?为什么余额扣得跟我预期不一样?',
      children: (
        <>
          <p>
            按本次请求的 token 用量 ×{' '}
            <Link to="/#pricing">定价</Link>{' '}
            里展示的输入价 / 输出价之和扣款。token 数以上游返回的{' '}
            <code>usage</code> 为准,会在响应体里看到。
          </p>
          <p>常见的「扣多扣少」原因:</p>
          <ul>
            <li>请求里 system / 多轮历史 / few-shot 例子都算输入 token。</li>
            <li>
              开启 <code>stream</code> 后,输入按提示词全部计算,输出按实际生成长度。
            </li>
            <li>
              你的用户分组可能配置了倍率(例如 1.2x),实际扣款 = 定价 × 倍率。
            </li>
            <li>
              管理员可能为某条渠道覆盖了价格,以「实际扣款」为准。
            </li>
          </ul>
          <p>
            想看本次请求的实际扣款,请到{' '}
            <Link to="/console/logs/usage">控制台 → 日志</Link>。
          </p>
        </>
      ),
    },
    {
      key: 'q-data',
      label: '我的对话数据会被存下来吗?会被用于训练吗?',
      children: (
        <>
          <p>
            模桥会在「日志」中保留请求/响应的元数据(请求 ID、模型 ID、token 用量、
            状态码、耗时等)用于计费与排障;请求体 / 响应体明文是否落库取决于
            管理员配置,可按账户级别开关。
          </p>
          <p>
            上游厂商对训练数据的政策由它们自己决定 —— 例如 OpenAI 走 API 的请求
            默认不被用于训练,而部分国产厂商默认会用于模型改进,接入前请阅读
            对应上游的隐私政策。
          </p>
        </>
      ),
    },
    {
      key: 'q-streaming-cut',
      label: '流式响应中途断开了,会被扣费吗?',
      children: (
        <>
          <p>
            会。SSE 是长连接,客户端断开后模桥仍会等待上游把当前 token 流跑完,
            按上游返回的最终 <code>usage</code> 扣费 —— 这是为了和上游的实际计费保持一致。
          </p>
          <p>
            如果你的业务需要支持「取消」,推荐:
          </p>
          <ul>
            <li>
              客户端层面立刻停止读取流,UX 上当作"取消"即可。
            </li>
            <li>
              控制成本的关键是 <code>max_tokens</code> —— 它能限制单次输出上限。
            </li>
          </ul>
        </>
      ),
    },
    {
      key: 'q-region',
      label: '不同地区的网络问题怎么办?',
      children: (
        <p>
          模桥在出口侧已对接多个上游线路,理论上你只需要保证从你的客户端
          能稳定连到模桥本身即可。如果在国内访问海外模型(OpenAI / Anthropic)
          出现高延迟,推荐:在国内云上部署你的业务,通过国内出口访问模桥。
        </p>
      ),
    },
    {
      key: 'q-supports',
      label: '支持函数调用 / Tool Use / JSON 模式吗?',
      children: (
        <>
          <p>
            支持。<code>tools</code> / <code>tool_choice</code> /{' '}
            <code>response_format</code> 字段全部按 OpenAI 协议透传,
            上游模型支持就直接生效。常见组合:
          </p>
          <ul>
            <li>
              OpenAI <code>gpt-4o</code> 系列 —— 完整支持 tools + JSON 模式。
            </li>
            <li>
              Anthropic Claude 3 系列 —— 完整支持 tools(经过协议适配)。
            </li>
            <li>
              DeepSeek / Qwen / GLM 主力模型 —— 大多支持 tools,具体看上游模型卡。
            </li>
          </ul>
        </>
      ),
    },
    {
      key: 'q-org',
      label: '能开发票 / 企业账户吗?',
      children: (
        <p>
          可以。请到{' '}
          <Link to="/console/billing/records">控制台 → 账单</Link>{' '}
          页申请发票,或在{' '}
          <Link to="/console/settings">个人设置</Link>{' '}
          中切换为企业账户。如需团队成员协作、SSO、按部门分账等高级特性,
          请联系管理员申请企业版。
        </p>
      ),
    },
    {
      key: 'q-incident',
      label: '请求一直失败 / 怀疑模桥侧故障,怎么办?',
      children: (
        <>
          <p>排查顺序:</p>
          <ol>
            <li>
              先看返回的 HTTP 状态码与错误 message,对照{' '}
              <Link to="/docs/errors">错误码</Link>。
            </li>
            <li>
              到{' '}
              <Link to="/console/logs/usage">控制台 → 日志</Link>{' '}
              查最近的请求,如果有响应体可以看上游原文。
            </li>
            <li>
              换一个同类型模型试一下 —— 排除单一上游问题。
            </li>
            <li>
              仍无法解决,把响应里的 <code>id</code> 发给管理员/客服。
            </li>
          </ol>
        </>
      ),
    },
  ];

  return (
    <>
      <h1>常见问题</h1>
      <p>把高频问题整理在一起,先在这里找一遍,再去翻其它文档。</p>

      <Collapse
        items={items}
        defaultActiveKey={['q-openai-compat']}
        bordered={false}
        style={{ background: 'transparent', marginTop: 20 }}
      />

      <Callout type="info" title="没找到答案?">
        <p style={{ margin: 0 }}>
          可以先翻{' '}
          <Link to="/docs/quick-start">快速开始</Link>、
          <Link to="/docs/errors">错误码</Link>{' '}
          ;若是计费/账户问题,到{' '}
          <Link to="/console/billing/records">账单</Link> 或联系管理员。
        </p>
      </Callout>
    </>
  );
}
