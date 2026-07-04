import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocImages() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.images.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.images.intro' },
          {
            name: site.name,
            code: (c: any) => <code>{c}</code>,
          },
        )}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.images.requestHeading' })}</h2>
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
    "prompt": "${intl.formatMessage({ id: 'docs.images.examplePrompt' })}",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url"
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.images.mainFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.images.colField' })}
              </th>
              <th style={{ width: 100 }}>
                {intl.formatMessage({ id: 'docs.images.colType' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.images.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.images.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.fieldModelDesc' },
                  {
                    code: (c: any) => <code>{c}</code>,
                    link: (c: any) => <Link to="/docs/models">{c}</Link>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>prompt</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.images.required' })}
                </div>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.images.fieldPromptDesc' })}</td>
            </tr>
            <tr>
              <td>
                <code>n</code>
              </td>
              <td>integer</td>
              <td>{intl.formatMessage({ id: 'docs.images.fieldNDesc' })}</td>
            </tr>
            <tr>
              <td>
                <code>size</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.fieldSizeDesc' },
                  {
                    code: (c: any) => <code>{c}</code>,
                    strong: (c: any) => <strong>{c}</strong>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>quality</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.fieldQualityDesc' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>style</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.fieldStyleDesc' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>aspect_ratio</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.fieldAspectRatioDesc' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>image_size</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.fieldImageSizeDesc' },
                  {
                    code: (c: any) => <code>{c}</code>,
                    strong: (c: any) => <strong>{c}</strong>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>response_format</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.fieldResponseFormatDesc' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{intl.formatMessage({ id: 'docs.images.modelConstraintsHeading' })}</h3>
      <p style={{ color: '#555', fontSize: 14, margin: '8px 0 12px' }}>
        {intl.formatMessage(
          { id: 'docs.images.modelConstraintsIntro' },
          {
            code: (c: any) => <code>{c}</code>,
            strong: (c: any) => <strong>{c}</strong>,
          },
        )}
      </p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.images.colModelFamily' })}
              </th>
              <th>size</th>
              <th>{intl.formatMessage({ id: 'docs.images.colOtherFields' })}</th>
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
                {intl.formatMessage(
                  { id: 'docs.images.gptImage2Size' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
              <td>
                <code>quality</code>:auto / low / medium / high
              </td>
            </tr>
            <tr>
              <td>
                <code>imagen-*</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.imagenSize' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
              <td>
                <code>aspect_ratio</code>:1:1 / 4:3 / 3:4 / 16:9 / 9:16;
                {' '}<code>image_size</code>:1K / 2K
              </td>
            </tr>
            <tr>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.geminiImageFamily' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.geminiNoSize' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
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
                {intl.formatMessage(
                  { id: 'docs.images.seedream3Size' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <code>doubao-seedream-4-*</code> /{' '}
                <code>doubao-seedream-5-*</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.seedream45Size' },
                  {
                    code: (c: any) => <code>{c}</code>,
                    strong: (c: any) => <strong>{c}</strong>,
                  },
                )}
              </td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <code>cogview-*</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.images.cogviewSize' },
                  { code: (c: any) => <code>{c}</code> },
                )}
              </td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.images.seedreamCalloutTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.images.seedreamCalloutBody' },
            {
              code: (c: any) => <code>{c}</code>,
              strong: (c: any) => <strong>{c}</strong>,
            },
          )}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.images.responseHeading' })}</h2>
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
          {intl.formatMessage(
            { id: 'docs.images.respUrlDesc' },
            { code: (c: any) => <code>{c}</code> },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.images.respPreviewDesc' },
            { code: (c: any) => <code>{c}</code> },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.images.respRevisedPromptDesc' },
            { code: (c: any) => <code>{c}</code> },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.images.respB64Desc' },
            { code: (c: any) => <code>{c}</code> },
          )}
        </li>
      </ul>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.images.historyCalloutTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.images.historyCalloutBody' },
            { link: (c: any) => <Link to="/console/logs/images">{c}</Link> },
          )}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.images.videoHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.images.videoDesc' },
          {
            code: (c: any) => <code>{c}</code>,
            link: (c: any) => <Link to="/playground">{c}</Link>,
          },
        )}
      </p>
    </>
  );
}
