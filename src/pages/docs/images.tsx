import { Link } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocImages() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>图像生成</h1>
      <p>
        {site.name}的图像接口与 OpenAI <code>/v1/images/generations</code>{' '}
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
                输出分辨率,<code>宽x高</code> 像素,如 <code>1024x1024</code>、
                {' '}<code>1792x1024</code>(横)、<code>2048x2048</code>。
                可选值取决于上游模型 —— 各家约束差别很大(见下方表格)。
                平台对常见 / 错误尺寸做了自动归一化,但**建议直接传该模型的合法值**,
                以免被自动改写后比例不符预期。
              </td>
            </tr>
            <tr>
              <td>
                <code>quality</code>
              </td>
              <td>string</td>
              <td>
                影响价格与生成时长。DALL-E 3:<code>standard</code> / <code>hd</code>;
                {' '}GPT-Image-1 / GPT-Image-2:<code>auto</code> / <code>low</code> /{' '}
                <code>medium</code> / <code>high</code>。其它模型一般忽略此字段。
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
                <code>aspect_ratio</code>
              </td>
              <td>string</td>
              <td>
                宽高比,Gemini / Imagen 家族用 —— 如 <code>1:1</code>、<code>16:9</code>、
                {' '}<code>9:16</code>、<code>4:3</code>。Imagen 仅接受 5 种,Gemini Image 接受 10 种。
              </td>
            </tr>
            <tr>
              <td>
                <code>image_size</code>
              </td>
              <td>string</td>
              <td>
                分辨率档,Gemini / Imagen 家族用 —— Imagen:<code>1K</code> / <code>2K</code>;
                {' '}Gemini Image(Nano Banana 等):<code>512</code> / <code>1K</code> /{' '}
                <code>2K</code> / <code>4K</code>。**K 必须大写**。
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

      <h3>各模型族系参数约束</h3>
      <p style={{ color: '#555', fontSize: 14, margin: '8px 0 12px' }}>
        平台在请求入口对 <code>size</code> / <code>aspect_ratio</code> /{' '}
        <code>image_size</code> 做归一化:落在合法窗口外的值会被夹位或就近映射,
        所以即使传错也不会直接 400。下表是各家上游真实接受的范围,**直接按这个传可以避免被悄悄改写**。
      </p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>模型族系</th>
              <th>size</th>
              <th>其它字段</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>dall-e-3</code>
              </td>
              <td>
                <code>1024x1024</code> / <code>1792x1024</code> /{' '}
                <code>1024x1792</code>
              </td>
              <td>
                <code>quality</code>:standard / hd;<code>style</code>:vivid / natural
              </td>
            </tr>
            <tr>
              <td>
                <code>dall-e-2</code>
              </td>
              <td>
                <code>256x256</code> / <code>512x512</code> /{' '}
                <code>1024x1024</code>
              </td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <code>gpt-image-1</code>
              </td>
              <td>
                <code>1024x1024</code> / <code>1536x1024</code> /{' '}
                <code>1024x1536</code> / <code>auto</code>
              </td>
              <td>
                <code>quality</code>:auto / low / medium / high
              </td>
            </tr>
            <tr>
              <td>
                <code>gpt-image-2</code>
              </td>
              <td>
                任意 <code>WxH</code>:长边 ≤ 3840,边长 16 的倍数,长:短 ≤ 3:1,
                总像素 ∈ [655K, 8.29M];也接 <code>auto</code>
              </td>
              <td>
                <code>quality</code>:auto / low / medium / high
              </td>
            </tr>
            <tr>
              <td>
                <code>imagen-*</code>
              </td>
              <td>不接 <code>size</code>(用下面两个字段)</td>
              <td>
                <code>aspect_ratio</code>:1:1 / 4:3 / 3:4 / 16:9 / 9:16;
                {' '}<code>image_size</code>:1K / 2K
              </td>
            </tr>
            <tr>
              <td>
                <code>gemini-*-image-*</code>(Nano Banana 等)
              </td>
              <td>不接 <code>size</code></td>
              <td>
                <code>aspect_ratio</code>:1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 2:3 / 3:2 / 4:5 / 5:4 / 21:9;
                {' '}<code>image_size</code>:512 / 1K / 2K / 4K
              </td>
            </tr>
            <tr>
              <td>
                <code>doubao-seedream-3-*</code>
              </td>
              <td>
                任意 <code>WxH</code>,边长 ∈ [512, 2048],无对齐 / 比例限制
              </td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <code>doubao-seedream-4-*</code> /{' '}
                <code>doubao-seedream-5-*</code>
              </td>
              <td>
                任意 <code>WxH</code>,**总像素 ≥ 3,686,400**(= 2560×1440),单边 ≤ 4096。
                推荐传 <code>2048x2048</code> / <code>2560x1440</code> /{' '}
                <code>3840x2160</code> / <code>4096x4096</code> 等。
              </td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <code>cogview-*</code>
              </td>
              <td>
                任意 <code>WxH</code>,经验夹位 [512, 2048]
              </td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout type="warn" title="Seedream 4/5 的最小像素约束">
        <p style={{ margin: 0 }}>
          Seedream 4.0 / 4.5 / 5.0 / 5.0-lite 上游硬要求 <strong>总像素 ≥ 3,686,400</strong>,
          低于此值会被拒(
          <code>image size must be at least 3686400 pixels</code>)。
          平台会自动把 <code>1024x1024</code>、<code>1792x1024</code> 这类小图等比放大到刚好越过下限,
          但比例不变 —— 也就是说**你传 1792×1024 实际下发的可能是 ~2540×1452**。
          想要精确控制输出尺寸,直接传 2K 以上的合法值。
        </p>
      </Callout>

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
          <code>url</code> 是平台转存后的媒体地址,可直接放到浏览器{' '}
          <code>&lt;img&gt;</code> 或前端 <code>fetch(url).blob()</code> 使用。
          平台自带 <code>/v1/cdn/...</code> 地址默认允许任意站点跨域读取,无需单独配置你的前端域名。
        </li>
        <li>
          同一个 <code>url</code> 可以预览也可以下载:放进{' '}
          <code>&lt;img&gt;</code> 会预览,放进普通下载链接或用{' '}
          <code>fetch(url).blob()</code> 会按文件下载。
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
