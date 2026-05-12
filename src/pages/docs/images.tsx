import { Link } from '@umijs/max';
import { API_BASE, Callout, CodeBlock } from './_shared';

export default function DocImages() {
  return (
    <>
      <h1>图像生成</h1>
      <p>
        模桥的图像接口与 OpenAI <code>/v1/images/generations</code>{' '}
        协议保持一致,可以转发至 DALL-E、Stable Diffusion、Kling、Vidu 以及其它
        在控制台启用的图像模型。
      </p>

      <h2>请求</h2>
      <p>
        <code>POST {API_BASE}/images/generations</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/images/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "dall-e-3",
    "prompt": "一只穿西装的柴犬,在东京涩谷十字路口指挥交通,赛博朋克风格",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url"
  }'`}
      />

      <h3>主要字段</h3>
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
                图像模型 ID,例如 <code>dall-e-3</code>、
                <code>kling-image</code>。完整列表见{' '}
                <Link to="/docs/models">模型列表</Link>(<code>image</code> 类型)。
              </td>
            </tr>
            <tr>
              <td>
                <code>prompt</code>
                <div style={{ color: '#999', fontSize: 12 }}>必填</div>
              </td>
              <td>string</td>
              <td>提示词,直接传中文 / 英文皆可,具体长度限制由上游模型决定。</td>
            </tr>
            <tr>
              <td>
                <code>n</code>
              </td>
              <td>integer</td>
              <td>一次生成几张,默认 1。某些模型固定为 1。</td>
            </tr>
            <tr>
              <td>
                <code>size</code>
              </td>
              <td>string</td>
              <td>
                输出分辨率,常见值:<code>1024x1024</code>、{' '}
                <code>1024x1792</code>(竖)、<code>1792x1024</code>(横)。
                可选值取决于上游模型。
              </td>
            </tr>
            <tr>
              <td>
                <code>quality</code>
              </td>
              <td>string</td>
              <td>
                <code>standard</code> / <code>hd</code>,影响价格与生成时长,仅 DALL-E 3 支持。
              </td>
            </tr>
            <tr>
              <td>
                <code>style</code>
              </td>
              <td>string</td>
              <td>
                <code>vivid</code> / <code>natural</code>,仅 DALL-E 3 支持。
              </td>
            </tr>
            <tr>
              <td>
                <code>response_format</code>
              </td>
              <td>string</td>
              <td>
                <code>url</code>(默认,返回临时下载链接)/{' '}
                <code>b64_json</code>(返回 base64,适合服务端直接落盘)。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>响应</h2>
      <CodeBlock
        lang="json"
        code={`{
  "created": 1730000000,
  "data": [
    {
      "url": "https://images.example.com/xxxxxxxx.png",
      "revised_prompt": "A Shibainu wearing a suit standing at Shibuya crossing..."
    }
  ]
}`}
      />
      <ul>
        <li>
          <code>url</code> 是一个临时链接,有效期一般为 1 小时,需要长期保存请尽快下载。
        </li>
        <li>
          <code>revised_prompt</code> 是上游对原 prompt 的「安全/重写」后的结果
          (DALL-E 3 会这样做),仅作参考。
        </li>
        <li>
          若你传了 <code>"response_format": "b64_json"</code>,则字段变成{' '}
          <code>b64_json</code>(标准 base64,可直接 <code>atob</code> 解码)。
        </li>
      </ul>

      <Callout type="info" title="历史记录与重新预览">
        <p style={{ margin: 0 }}>
          所有生成结果都会在 <Link to="/console/logs/images">控制台 → 图像历史</Link>{' '}
          里保留,方便回看;如果临时 URL 已过期,可以从历史里下载原图。
        </p>
      </Callout>

      <h2>视频生成</h2>
      <p>
        视频模型(Kling、Vidu 等)走 <code>/v1/videos/generations</code>{' '}
        类似的请求结构,但参数细节因厂商差异较大,推荐先在{' '}
        <Link to="/console/playground">控制台 Playground</Link>{' '}
        里调通后再接入业务代码。
      </p>
    </>
  );
}
