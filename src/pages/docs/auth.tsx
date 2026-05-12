import { Link } from '@umijs/max';
import { API_BASE, Callout, CodeBlock } from './_shared';

export default function DocAuth() {
  return (
    <>
      <h1>认证</h1>
      <p>
        模桥所有 <code>/v1/*</code> 接口均需要鉴权,使用标准的 <code>Bearer</code>{' '}
        Token 方式。一个账户可以创建多把 Key,每把 Key 可以独立绑定模型范围、
        消耗上限和有效期。
      </p>

      <h2>请求头</h2>
      <CodeBlock
        lang="http"
        code={`Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json`}
      />
      <p>
        Key 的格式固定为 <code>sk-</code> 前缀 + 一段随机字符串,
        与 OpenAI 官方格式一致,所以使用 OpenAI SDK 时无需做任何特殊适配。
      </p>

      <h2>创建一把新 Key</h2>
      <ol>
        <li>
          登录后进入「控制台 →{' '}
          <Link to="/console/tokens">API Key</Link>」
        </li>
        <li>点击「新建 Token」,填写名称(便于自己识别用途)</li>
        <li>
          可选:勾选「限制模型」把这把 Key 限定为只能调用其中几个模型
        </li>
        <li>
          可选:设置「有效期」和「消耗上限」,例如给协作方一把
          7 天 / 上限 $10 的临时 Key
        </li>
        <li>点击「创建」,在弹出的对话框里复制完整 Key</li>
      </ol>

      <Callout type="warn" title="只显示一次">
        <p style={{ margin: 0 }}>
          完整 Key 仅在创建弹窗中出现一次,关闭后列表里只能看到形如{' '}
          <code>sk-xxxx...abcd</code> 的脱敏值,系统侧也不会再保留明文。
          如果丢失,删除旧 Key 重新创建即可,不会丢失计费历史。
        </p>
      </Callout>

      <h2>验证 Key 是否生效</h2>
      <p>
        最快的办法是请求一次 <code>/v1/models</code>,它只校验鉴权、不消耗 token:
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/models \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>正常会返回当前 Key 可以调用的模型列表;鉴权失败会返回:</p>
      <CodeBlock
        lang="json"
        code={`{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}`}
      />
      <p>
        其它鉴权相关的错误码完整含义见 <Link to="/docs/errors">错误码</Link>。
      </p>

      <h2>Key 的最佳实践</h2>
      <ul>
        <li>
          <strong>不要把 Key 写进前端代码、Git 仓库、公开文档。</strong>{' '}
          一旦泄露,任何拿到 Key 的人都能直接消耗你账户的余额。
        </li>
        <li>
          为不同用途各开一把 Key —— 比如{' '}
          <code>web-prod</code> / <code>web-dev</code> /{' '}
          <code>script-test</code>,出问题时只需要禁用单把 Key,不影响其它业务。
        </li>
        <li>
          高敏感场景结合「限制模型」+「消耗上限」+「有效期」三件套,
          把单把 Key 的爆炸半径压到最小。
        </li>
        <li>
          监控 → 控制台「日志」页可以按 Key 查看调用记录;发现异常调用立即
          删除对应 Key。
        </li>
      </ul>

      <h2>禁用与轮换</h2>
      <p>
        在 <Link to="/console/tokens">API Key 列表</Link>{' '}
        里可以随时删除一把 Key,删除后该 Key 立即失效,正在进行的请求会被中断。
        建议把 Key 当作密码定期轮换:新 Key 灰度生效 → 切流量 → 删除旧 Key。
      </p>
    </>
  );
}
