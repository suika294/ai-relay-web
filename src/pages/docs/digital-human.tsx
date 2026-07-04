import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocDigitalHuman() {
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  const intl = useIntl();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.digitalHuman.title' })}</h1>
      <p>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro1' })}
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.introPortrait' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro2' })}
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.introVideo' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro3' })}
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.introAudio' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro4' })}
        {intl.formatMessage({ id: 'docs.digitalHuman.introAggregated' }, { name: site.name })}
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.introVendors' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro5' })}
        <code>/v1/videos/generations</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro6' })}
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.introSubmit' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro7' })} <code>task_id</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro8' })}
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.introPoll' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.intro9' })}{' '}
        <code>succeeded</code> {intl.formatMessage({ id: 'docs.digitalHuman.intro10' })}
      </p>

      <Callout type="info" title={intl.formatMessage({ id: 'docs.digitalHuman.calloutNoPromptTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.digitalHuman.noPrompt1' })}
          <strong>{intl.formatMessage({ id: 'docs.digitalHuman.noPromptMaterial' })}</strong>
          {intl.formatMessage({ id: 'docs.digitalHuman.noPrompt2' })}
          <strong>
            {intl.formatMessage({ id: 'docs.digitalHuman.noPromptNo' })} <code>prompt</code>
          </strong>
          {intl.formatMessage({ id: 'docs.digitalHuman.noPrompt3' })}
          {intl.formatMessage({ id: 'docs.digitalHuman.noPrompt4' })}{' '}
          <Link to="/docs/videos">{intl.formatMessage({ id: 'docs.digitalHuman.videosLink' })}</Link>
          {intl.formatMessage({ id: 'docs.digitalHuman.noPrompt5' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.digitalHuman.submitHeading' })}</h2>
      <p>
        <code>POST {API_BASE}/videos/generations</code>{' '}
        {intl.formatMessage({ id: 'docs.digitalHuman.submitIntro' })}
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/videos/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "wan2.2-s2v",
    "first_frame_image": "https://example.com/portrait.jpg",
    "input_audio_url": "https://example.com/speech.mp3",
    "resolution": "480P"
  }'`}
      />
      <p>
        {intl.formatMessage({ id: 'docs.digitalHuman.afterSubmit1' })} <code>id</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.afterSubmit2' })} <code>task_id</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.afterSubmit3' })}{' '}
        <code>GET {API_BASE}/videos/generations/:task_id</code>{' '}
        {intl.formatMessage({ id: 'docs.digitalHuman.afterSubmit4' })}{' '}
        <code>succeeded</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.afterSubmit5' })}
        <code>data[0].url</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.afterSubmit6' })}{' '}
        <Link to="/docs/videos">
          {intl.formatMessage({ id: 'docs.digitalHuman.pollCodeLink' })}
        </Link>
        {intl.formatMessage({ id: 'docs.digitalHuman.afterSubmit7' })}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.digitalHuman.paramsHeading' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.digitalHuman.paramsIntro1' })} <code>first_frame_image</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.paramsIntroPortrait' })} <code>reference_video</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.paramsIntroVideo' })}
        {intl.formatMessage({ id: 'docs.digitalHuman.paramsIntro2' })} <code>http(s)://</code>
        {intl.formatMessage({ id: 'docs.digitalHuman.paramsIntro3' })}
      </p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{intl.formatMessage({ id: 'docs.digitalHuman.colField' })}</th>
              <th style={{ width: 130 }}>{intl.formatMessage({ id: 'docs.digitalHuman.colUsedFor' })}</th>
              <th>{intl.formatMessage({ id: 'docs.digitalHuman.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>input_audio_url</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.useLipsync' })}</td>
              <td>
                <strong>{intl.formatMessage({ id: 'docs.digitalHuman.audioDriveLabel' })}</strong>
                {intl.formatMessage({ id: 'docs.digitalHuman.audioDriveDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>resolution</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.useS2vTencentPhoto' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.resolutionDesc1' })} <code>480P</code> /{' '}
                <code>720P</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.resolutionDesc2' })}{' '}
                <code>720P</code> / <code>1080P</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.resolutionDesc3' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>aspect_ratio</code> + <code>style_level</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.useWanEmo' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.emoDesc1' })} <code>1:1</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.emoDescAvatar' })} <code>3:4</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.emoDescHalf' })}{' '}
                <code>normal</code> / <code>calm</code> / <code>active</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.emoDescEnd' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>mode</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.useWanAnimate' })}</td>
              <td>
                <code>wan-std</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.modeFast' })} <code>wan-pro</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.modeQuality' })}
                <strong>{intl.formatMessage({ id: 'docs.digitalHuman.required' })}</strong>
                {intl.formatMessage({ id: 'docs.digitalHuman.period' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>driven_id</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.useWanEmoji' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.drivenIdDesc' })} <code>mengwa_kaixin</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.period' })}
                <strong>{intl.formatMessage({ id: 'docs.digitalHuman.required' })}</strong>
                {intl.formatMessage({ id: 'docs.digitalHuman.period' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>ref_image_url</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.useWanVideoRetalk' })}</td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.refImageDesc' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{intl.formatMessage({ id: 'docs.digitalHuman.examplesHeading' })}</h2>
      <p>
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.exVideoRetalk' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.colon' })}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "videoretalk",
  "reference_video": "https://example.com/clip.mp4",
  "input_audio_url": "https://example.com/new_audio.mp3"
}`}
      />
      <p>
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.exMotionTransfer' })}</strong>{' '}
        {intl.formatMessage({ id: 'docs.digitalHuman.exMotionTransferDesc' })}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "wan2.2-animate-move",
  "first_frame_image": "https://example.com/person.jpg",
  "reference_video": "https://example.com/drive.mp4",
  "mode": "wan-std"
}`}
      />
      <p>
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.exDynamicEmoji' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.colon' })}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "emoji-v1",
  "first_frame_image": "https://example.com/face.jpg",
  "driven_id": "mengwa_kaixin"
}`}
      />
      <p>
        <strong>{intl.formatMessage({ id: 'docs.digitalHuman.exOmniHuman' })}</strong>
        {intl.formatMessage({ id: 'docs.digitalHuman.colon' })}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "jimeng-omnihuman-v15",
  "first_frame_image": "https://example.com/portrait.jpg",
  "input_audio_url": "https://example.com/speech.mp3",
  "prompt": "${intl.formatMessage({ id: 'docs.digitalHuman.exOmniHumanPrompt' })}",
  "output_resolution": 1080
}`}
      />

      <h2>{intl.formatMessage({ id: 'docs.digitalHuman.modelQuickRefHeading' })}</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{intl.formatMessage({ id: 'docs.digitalHuman.colModel' })}</th>
              <th style={{ width: 150 }}>{intl.formatMessage({ id: 'docs.digitalHuman.colInput' })}</th>
              <th>{intl.formatMessage({ id: 'docs.digitalHuman.colParamsDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>wan2.2-s2v</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorWan' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImageAudio' })}</td>
              <td>
                <code>resolution</code> 480P/720P
                {intl.formatMessage({ id: 'docs.digitalHuman.s2vDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>emo-v1</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorWan' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImageAudio60' })}</td>
              <td>
                <code>aspect_ratio</code> 1:1/3:4 · <code>style_level</code>{' '}
                normal/calm/active
                {intl.formatMessage({ id: 'docs.digitalHuman.emoModelDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>liveportrait</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorWan' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImageLongAudio' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.optional' })} <code>template_id</code> /{' '}
                <code>eye_move_freq</code> / <code>mouth_move_strength</code>{' '}
                {intl.formatMessage({ id: 'docs.digitalHuman.liveportraitDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>videoretalk</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorWan' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inVideoAudio' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.videoRetalkDesc1' })} <code>ref_image_url</code>{' '}
                {intl.formatMessage({ id: 'docs.digitalHuman.videoRetalkDesc2' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>wan2.2-animate-move</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorWan' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImageDriveVideo' })}</td>
              <td>
                <code>mode</code> wan-std/wan-pro(
                <strong>{intl.formatMessage({ id: 'docs.digitalHuman.required' })}</strong>
                {intl.formatMessage({ id: 'docs.digitalHuman.rparenPeriod' })}
                {intl.formatMessage({ id: 'docs.digitalHuman.animateMoveDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>wan2.2-animate-mix</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorWan' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImageVideo' })}</td>
              <td>
                <code>mode</code> wan-std/wan-pro
                {intl.formatMessage({ id: 'docs.digitalHuman.animateMixDesc' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>emoji-v1</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorWan' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImage' })}</td>
              <td>
                <code>driven_id</code>{' '}
                {intl.formatMessage({ id: 'docs.digitalHuman.emojiModelDesc1' })}
                <strong>{intl.formatMessage({ id: 'docs.digitalHuman.required' })}</strong>
                {intl.formatMessage({ id: 'docs.digitalHuman.emojiModelDesc2' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>jimeng-omnihuman-v15</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorJimeng' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImageAudioLt60' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.omniDesc1' })} <code>prompt</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.omniDesc2' })} <code>output_resolution</code>{' '}
                720/1080
                {intl.formatMessage({ id: 'docs.digitalHuman.period' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>tencent-lipsync-video</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorTencent' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inVideoTextAudio' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.tencentVideoDesc1' })} <code>prompt</code>
                (SSML)+ <code>voice</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.tencentVideoDesc2' })}{' '}
                <code>input_audio_url</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.tencentVideoDesc3' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>tencent-lipsync-photo</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.digitalHuman.vendorTencent' })}
                </div>
              </td>
              <td>{intl.formatMessage({ id: 'docs.digitalHuman.inImageTextAudio' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.digitalHuman.tencentPhotoDesc1' })}
                <code>resolution</code> 720P/1080P ·{' '}
                {intl.formatMessage({ id: 'docs.digitalHuman.tencentPhotoDesc2' })} <code>action_prompt</code>
                {intl.formatMessage({ id: 'docs.digitalHuman.tencentPhotoDesc3' })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout type="info" title={intl.formatMessage({ id: 'docs.digitalHuman.calloutTryTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.digitalHuman.try1' })}{' '}
          <Link to="/playground">
            {intl.formatMessage({ id: 'docs.digitalHuman.tryPlaygroundLink' })}
          </Link>{' '}
          {intl.formatMessage({ id: 'docs.digitalHuman.try2' })}
          {intl.formatMessage({ id: 'docs.digitalHuman.try3' })}
          <strong>{intl.formatMessage({ id: 'docs.digitalHuman.tryPublicUrl' })}</strong>
          {intl.formatMessage({ id: 'docs.digitalHuman.try4' })}{' '}
          <Link to="/docs/sdk">/v1/files</Link>{' '}
          {intl.formatMessage({ id: 'docs.digitalHuman.try5' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.digitalHuman.errorsHeading' })}</h2>
      <ul>
        <li>
          <strong>
            <code>prompt is required</code>
          </strong>{' '}
          {intl.formatMessage({ id: 'docs.digitalHuman.err1Desc1' })}
          {intl.formatMessage({ id: 'docs.digitalHuman.err1Desc2' })} <code>first_frame_image</code> /{' '}
          <code>reference_video</code> / <code>input_audio_url</code> / <code>driven_id</code>
          {intl.formatMessage({ id: 'docs.digitalHuman.period' })}
        </li>
        <li>
          <strong>{intl.formatMessage({ id: 'docs.digitalHuman.err2Title' })}</strong>{' '}
          {intl.formatMessage({ id: 'docs.digitalHuman.err2Desc1' })}{' '}
          <Link to="/docs/sdk">/v1/files</Link>{' '}
          {intl.formatMessage({ id: 'docs.digitalHuman.err2Desc2' })}
        </li>
        <li>
          <strong>
            <code>Invalid API-key provided</code>
          </strong>{' '}
          {intl.formatMessage({ id: 'docs.digitalHuman.err3Desc1' })}
          <strong>{intl.formatMessage({ id: 'docs.digitalHuman.err3Beijing' })}</strong>
          {intl.formatMessage({ id: 'docs.digitalHuman.err3Desc2' })}
        </li>
        <li>
          <strong>{intl.formatMessage({ id: 'docs.digitalHuman.err4Title' })}</strong>
          {intl.formatMessage({ id: 'docs.digitalHuman.err4Desc' })}
        </li>
      </ul>
      <p>
        {intl.formatMessage({ id: 'docs.digitalHuman.footer1' })}{' '}
        <Link to="/docs/videos">{intl.formatMessage({ id: 'docs.digitalHuman.videosLink' })}</Link>{' '}
        {intl.formatMessage({ id: 'docs.digitalHuman.footerAnd' })}{' '}
        <Link to="/docs/errors">{intl.formatMessage({ id: 'docs.digitalHuman.errorsLink' })}</Link>
        {intl.formatMessage({ id: 'docs.digitalHuman.footer2' })}{' '}
        <Link to="/console/logs/videos">
          {intl.formatMessage({ id: 'docs.digitalHuman.videoHistoryLink' })}
        </Link>{' '}
        {intl.formatMessage({ id: 'docs.digitalHuman.footer3' })}
      </p>
    </>
  );
}
