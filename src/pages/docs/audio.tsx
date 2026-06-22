import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocAudio() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  const code = (c: any) => <code>{c}</code>;
  const strong = (c: any) => <strong>{c}</strong>;
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.audio.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.audio.intro' },
          { name: site.name, code, strong },
        )}
      </p>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.audio.calloutRoutingTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.audio.calloutRoutingBody' },
            { code },
          )}
        </p>
      </Callout>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.audio.calloutIngestTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.audio.calloutIngestBody' },
            { code, strong },
          )}
        </p>
      </Callout>

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.audio.calloutPollModelTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.audio.calloutPollModelBody' },
            { code, strong },
          )}
        </p>
      </Callout>

      <h2 id="asr">{intl.formatMessage({ id: 'docs.audio.asrHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.audio.asrIntro' },
          { base: API_BASE, code },
        )}
      </p>

      <h3>{intl.formatMessage({ id: 'docs.audio.syncRequestHeading' })}</h3>
      <p>
        {intl.formatMessage(
          { id: 'docs.audio.asrSyncDesc' },
          { code, strong },
        )}
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

      <h3>{intl.formatMessage({ id: 'docs.audio.requestFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.audio.colField' })}
              </th>
              <th style={{ width: 100 }}>
                {intl.formatMessage({ id: 'docs.audio.colType' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.audio.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.audio.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.asrFieldModelDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>file</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.audio.requiredMultipart' })}
                </div>
              </td>
              <td>binary</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.asrFieldFileDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>url</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.asrFieldUrlDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>audio_data</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.asrFieldAudioDataDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>format</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.asrFieldFormatDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>language</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.asrFieldLanguageDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>channel</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.asrFieldChannelDesc' },
                  { code },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{intl.formatMessage({ id: 'docs.audio.responseHeading' })}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "text": "${intl.formatMessage({ id: 'docs.audio.respExampleText' })}",
  "duration_ms": 5240,
  "segments": [
    { "start_ms": 0,    "end_ms": 1820, "text": "${intl.formatMessage({ id: 'docs.audio.respExampleSeg1' })}" },
    { "start_ms": 1820, "end_ms": 5240, "text": "${intl.formatMessage({ id: 'docs.audio.respExampleSeg2' })}" }
  ],
  "words": [
    { "word": "${intl.formatMessage({ id: 'docs.audio.respExampleWord1' })}", "start_ms": 0,    "end_ms": 580 },
    { "word": "${intl.formatMessage({ id: 'docs.audio.respExampleWord2' })}", "start_ms": 580,  "end_ms": 1820 }
  ]
}`}
      />
      <ul>
        <li>
          {intl.formatMessage(
            { id: 'docs.audio.respSegmentsDesc' },
            { code },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.audio.respWordsDesc' },
            { code },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.audio.respDurationDesc' },
            { code },
          )}
        </li>
      </ul>

      <h3>{intl.formatMessage({ id: 'docs.audio.asyncAsrHeading' })}</h3>
      <p>
        {intl.formatMessage(
          { id: 'docs.audio.asyncAsrDesc' },
          { code },
        )}
      </p>
      <CodeBlock
        lang="bash"
        code={`# ${intl.formatMessage({ id: 'docs.audio.asyncExampleComment1' })}
curl ${API_BASE}/audio/transcriptions/async \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "asr-recfile-zh-general",
    "url": "https://example.com/meeting-1h.mp3",
    "format": "mp3"
  }'
# → { "id": "12345678901", "status": "queued" }

# ${intl.formatMessage({ id: 'docs.audio.asyncExampleComment2' })}
curl "${API_BASE}/audio/transcriptions/12345678901" \\
  -H "Authorization: Bearer sk-your-key"`}
      />

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.audio.calloutAsyncIdempotentTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.audio.calloutAsyncIdempotentBody' },
            { code },
          )}
        </p>
      </Callout>

      <h2 id="tts">{intl.formatMessage({ id: 'docs.audio.ttsHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.audio.ttsIntro' },
          { base: API_BASE, code, strong },
        )}
      </p>

      <h3>{intl.formatMessage({ id: 'docs.audio.syncRequestHeading' })}</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/audio/speech \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "tencent-tts-standard",
    "input": "${intl.formatMessage({ id: 'docs.audio.ttsExampleInput' }, { name: site.name })}",
    "voice": "alloy",
    "response_format": "mp3",
    "speed": 1.0
  }' --output hello.mp3`}
      />

      <h3>{intl.formatMessage({ id: 'docs.audio.requestFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.audio.colField' })}
              </th>
              <th style={{ width: 100 }}>
                {intl.formatMessage({ id: 'docs.audio.colType' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.audio.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.audio.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.ttsFieldModelDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>input</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.audio.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.ttsFieldInputDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>voice</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.ttsFieldVoiceDesc' },
                  { code, br: () => <br /> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>language</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.ttsFieldLanguageDesc' },
                  { code },
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
                  { id: 'docs.audio.ttsFieldResponseFormatDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>speed</code>
              </td>
              <td>number</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.ttsFieldSpeedDesc' },
                  { code },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>channel</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.audio.ttsFieldChannelDesc' },
                  { code },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{intl.formatMessage({ id: 'docs.audio.asyncTtsHeading' })}</h3>
      <p>
        {intl.formatMessage(
          { id: 'docs.audio.asyncTtsDesc' },
          { code },
        )}
      </p>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.audio.calloutKlingTtsTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.audio.calloutKlingTtsBody' },
            { code, strong },
          )}
        </p>
      </Callout>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.audio.calloutPerTokenTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.audio.calloutPerTokenBody' },
            { code },
          )}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.audio.auditHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.audio.auditDesc' },
          {
            code,
            link: (c: any) => <Link to="/docs/errors">{c}</Link>,
          },
        )}
      </p>
    </>
  );
}
