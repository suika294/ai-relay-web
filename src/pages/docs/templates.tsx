import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock } from './_shared';

export default function DocTemplates() {
  const site = useSiteInfo();
  const intl = useIntl();
  const f = (id: string, values?: Record<string, any>) =>
    intl.formatMessage({ id }, values);
  return (
    <>
      <h1>{f('docs.templates.title')}</h1>
      <p>
        {f('docs.templates.intro1', { name: site.name })}{' '}
        <code>/v1/videos/generations</code> {f('docs.templates.intro2')}
        <Link to="/docs/videos">{f('docs.templates.videoGenLink')}</Link>
        {f('docs.templates.intro3')}<strong>{f('docs.templates.intro3Strong')}</strong>
        {f('docs.templates.intro4')}
      </p>
      <ul>
        <li>
          <strong>{f('docs.templates.viduTemplateName')}</strong>(<code>template</code>):
          {f('docs.templates.viduTemplateDesc')} <code>vidu-template</code>。
        </li>
        <li>
          <strong>{f('docs.templates.klingEffectName')}</strong>(<code>effect_scene</code>):
          {f('docs.templates.klingEffectDesc')} <code>kling-v1-6</code>)。
        </li>
      </ul>
      <p>
        {f('docs.templates.routeNote1', { name: site.name })} <code>template</code>{' '}
        {f('docs.templates.routeNote2')} <code>effect_scene</code>{' '}
        {f('docs.templates.routeNote3')}
      </p>

      {/* ==================== Vidu 模版 ==================== */}
      <h2 id="vidu-template">{f('docs.templates.viduSectionTitle')}</h2>
      <p>
        {f('docs.templates.viduP1Pre')}<strong>{f('docs.templates.viduP1Strong')}</strong>
        {f('docs.templates.viduP1Mid1')} <code>hugging</code>、{f('docs.templates.viduP1Kiss')}{' '}
        <code>french_kiss</code>、{f('docs.templates.viduP1Princess')} <code>exotic_princess</code>、
        {f('docs.templates.viduP1Beast')}{' '}
        <code>beast_companion</code> {f('docs.templates.viduP1Mid2')}{' '}
        <a href="https://platform.vidu.cn/docs/templates" target="_blank" rel="noreferrer">
          {f('docs.templates.viduExampleCenter')}
        </a>{' '}
        {f('docs.templates.viduP1Mid3')} <code>vidu-template</code>
        {f('docs.templates.viduP1Mid4', { name: site.name })}
        {f('docs.templates.viduP1Mid5')} <code>template</code> + <code>images</code>{' '}
        {f('docs.templates.viduP1End')}
      </p>

      <h3>{f('docs.templates.submitExample')}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "model": "vidu-template",
  "template": "hugging",
  "images": [
    "https://example.com/a.jpg",
    "https://example.com/b.jpg"
  ],
  "prompt": "${f('docs.templates.examplePromptVidu')}",
  "aspect_ratio": "16:9"
}`}
      />

      <h3>{f('docs.templates.templateFields')}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{f('docs.templates.thField')}</th>
              <th style={{ width: 110 }}>{f('docs.templates.thType')}</th>
              <th>{f('docs.templates.thDesc')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>{f('docs.templates.required')}</div>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.viduModelDesc1')} <code>vidu-template</code>。
                {f('docs.templates.viduModelDesc2')}
              </td>
            </tr>
            <tr>
              <td>
                <code>template</code>
                <div style={{ color: '#999', fontSize: 12 }}>{f('docs.templates.required')}</div>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.viduTemplateFieldDesc')} <code>hugging</code> / <code>french_kiss</code> /{' '}
                <code>exotic_princess</code> / <code>beast_companion</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>images</code>
                <div style={{ color: '#999', fontSize: 12 }}>{f('docs.templates.required')}</div>
              </td>
              <td>array</td>
              <td>
                {f('docs.templates.viduImagesDesc1')} <code>http(s)://</code> URL {f('docs.templates.orWord')}{' '}
                <code>data:image/...;base64,...</code>。
                {f('docs.templates.viduImagesDesc2')}
              </td>
            </tr>
            <tr>
              <td>
                <code>prompt</code>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.viduPromptDesc')}<code>subject_3</code> / <code>pubg_winner_hit</code>{' '}
                {f('docs.templates.viduPromptDescEnd')}
              </td>
            </tr>
            <tr>
              <td>
                <code>aspect_ratio</code>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.optional')}<code>16:9</code> / <code>9:16</code>，
                {f('docs.templates.defaultWord')} <code>16:9</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>area</code>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.viduAreaDesc1')} <code>exotic_princess</code>{' '}
                {f('docs.templates.viduAreaDesc2')} <code>japan</code> /{' '}
                <code>korea</code>，{f('docs.templates.defaultWord')} <code>auto</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>beast</code>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.viduBeastDesc1')} <code>beast_companion</code>{' '}
                {f('docs.templates.viduBeastDesc2')} <code>tiger</code> /{' '}
                <code>wolf</code>，{f('docs.templates.defaultWord')} <code>auto</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>bgm</code>
              </td>
              <td>bool</td>
              <td>
                {f('docs.templates.optional')}<code>true</code> {f('docs.templates.viduBgmDesc')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ==================== 可灵特效 ==================== */}
      <h2 id="kling-effects">{f('docs.templates.klingSectionTitle')}</h2>
      <p>
        {f('docs.templates.klingP1Pre')}<strong>{f('docs.templates.klingP1Strong')}</strong>
        {f('docs.templates.klingP1Squish')} <code>squish</code>、{f('docs.templates.klingP1Expansion')}{' '}
        <code>expansion</code>、{f('docs.templates.klingP1Hug')} <code>hug</code>、
        {f('docs.templates.klingP1Kiss')} <code>kiss</code>、{f('docs.templates.klingP1Heart')}{' '}
        <code>heart_gesture</code>、{f('docs.templates.klingP1Fight')} <code>fight</code>{' '}
        {f('docs.templates.klingP1Mid1')} <code>/v1/videos/generations</code>，
        {f('docs.templates.klingP1Mid2')}{' '}
        <code>effect_scene</code> + <code>images</code> {f('docs.templates.klingP1Mid3', { name: site.name })}{' '}
        <code>effect_scene</code>{' '}
        {f('docs.templates.klingP1End')}
      </p>
      <p>
        {f('docs.templates.klingP2Pre')}<strong>{f('docs.templates.klingP2Strong')}</strong>
        {f('docs.templates.klingP2End')}
      </p>
      <ul>
        <li>
          <strong>{f('docs.templates.klingSingleName')}</strong>({f('docs.templates.klingSingleNote')})：
          <code>squish</code> / <code>expansion</code> /{' '}
          <code>fuzzyfuzzy</code> / <code>bloombloom</code> / <code>dizzydizzy</code> /{' '}
          <code>rocketrocket</code> / <code>yearbook</code> {f('docs.templates.klingSingleDesc')}
        </li>
        <li>
          <strong>{f('docs.templates.klingDualName')}</strong>({f('docs.templates.klingDualNote')})：
          <code>hug</code> /{' '}
          <code>kiss</code> / <code>heart_gesture</code> / <code>fight</code>。
        </li>
      </ul>

      <h3>{f('docs.templates.submitExampleSingle')}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v1-6",
  "effect_scene": "squish",
  "images": ["https://example.com/portrait.jpg"],
  "duration": 5
}`}
      />

      <h3>{f('docs.templates.submitExampleDual')}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v1-6",
  "effect_scene": "hug",
  "images": [
    "https://example.com/left.jpg",
    "https://example.com/right.jpg"
  ],
  "mode": "pro",
  "duration": 5
}`}
      />

      <h3>{f('docs.templates.effectFields')}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{f('docs.templates.thField')}</th>
              <th style={{ width: 110 }}>{f('docs.templates.thType')}</th>
              <th>{f('docs.templates.thDesc')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>{f('docs.templates.required')}</div>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.klingModelDesc1')} <code>kling-v1-6</code> / <code>kling-v1-5</code> /{' '}
                <code>kling-v1</code>，{f('docs.templates.klingModelDesc2')} <code>model_name</code>{' '}
                {f('docs.templates.klingModelDesc3')}<code>fight</code>{' '}
                {f('docs.templates.klingModelDesc4')} <code>kling-v1-6</code>
                {f('docs.templates.klingModelDesc5')}
              </td>
            </tr>
            <tr>
              <td>
                <code>effect_scene</code>
                <div style={{ color: '#999', fontSize: 12 }}>{f('docs.templates.required')}</div>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.klingEffectFieldDesc1')} <code>squish</code> / <code>expansion</code> / <code>hug</code> /{' '}
                <code>kiss</code> / <code>heart_gesture</code> / <code>fight</code>{' '}
                {f('docs.templates.klingEffectFieldDesc2')}
              </td>
            </tr>
            <tr>
              <td>
                <code>images</code>
                <div style={{ color: '#999', fontSize: 12 }}>{f('docs.templates.required')}</div>
              </td>
              <td>array</td>
              <td>
                {f('docs.templates.klingImagesDesc1')} <code>http(s)://</code> URL {f('docs.templates.orWord')}{' '}
                <code>data:image/...;base64,...</code>。
                {f('docs.templates.klingImagesDesc2')}<code>hug</code> / <code>kiss</code> /{' '}
                <code>heart_gesture</code> / <code>fight</code>{f('docs.templates.klingImagesDesc3')}
              </td>
            </tr>
            <tr>
              <td>
                <code>duration</code>
              </td>
              <td>int</td>
              <td>
                {f('docs.templates.optional')}{f('docs.templates.klingDurationDesc')}<code>5</code>{' '}
                {f('docs.templates.orWord')} <code>10</code>，{f('docs.templates.defaultWord')} <code>5</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>mode</code>
              </td>
              <td>string</td>
              <td>
                {f('docs.templates.optional')}{f('docs.templates.klingModeDesc')} <code>std</code>
                ({f('docs.templates.klingModeStd')}) / <code>pro</code>({f('docs.templates.klingModePro')})。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout type="info" title={f('docs.templates.calloutTitle')}>
        <p style={{ margin: 0 }}>
          {f('docs.templates.calloutPre')}<strong>{f('docs.templates.calloutStrong')}</strong>
          {f('docs.templates.calloutMid')}
          <Link to="/playground?tab=template">{f('docs.templates.calloutViduLink')}</Link>{' '}
          {f('docs.templates.orWord')} <Link to="/playground?tab=effects">{f('docs.templates.calloutEffectLink')}</Link>
          {f('docs.templates.calloutEnd')}
        </p>
      </Callout>

      {/* ==================== Vidu 电商一键成片 ==================== */}
      <h2 id="vidu-ad-one-click">{f('docs.templates.adSectionTitle')}</h2>
      <p>
        {f('docs.templates.adP1Pre')}<strong>{f('docs.templates.adP1Strong')}</strong>
        {f('docs.templates.adP1Mid1')}{' '}
        <code>vidu-ad-one-click</code>{f('docs.templates.adP1Mid2', { name: site.name })}{' '}
        <code>/v1/videos/generations</code> {f('docs.templates.adP1End')}
      </p>

      <h3>{f('docs.templates.submitExample')}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "model": "vidu-ad-one-click",
  "images": [
    "https://example.com/product-front.jpg",
    "https://example.com/product-side.jpg"
  ],
  "prompt": "${f('docs.templates.examplePromptAd')}",
  "duration": 15,
  "aspect_ratio": "16:9",
  "language": "zh",
  "creative": false
}`}
      />
      <p>
        {f('docs.templates.adFieldsLabel')}<code>images</code> {f('docs.templates.adFieldsImages')}
        <code>duration</code> {f('docs.templates.adFieldsDuration')}<code>aspect_ratio</code>{' '}
        {f('docs.templates.adFieldsAspectPre')} <code>1:1</code> /{' '}
        <code>16:9</code> / <code>9:16</code>；<code>language</code> {f('docs.templates.adFieldsLangPre')}{' '}
        <code>zh</code> / <code>en</code>；
        <code>creative</code> {f('docs.templates.adFieldsCreativePre')} <code>true</code>{' '}
        {f('docs.templates.adFieldsCreativeMid')} <code>false</code>{f('docs.templates.adFieldsCreativeEnd')}
        {f('docs.templates.adFieldsPoll')} <code>GET /v1/videos/generations/{'{'}id{'}'}</code>{' '}
        {f('docs.templates.pollSuffix')}
      </p>

      <h3>{f('docs.templates.adEditTitle')}</h3>
      <p>{f('docs.templates.adEditIntro')}</p>
      <ul>
        <li>
          <code>GET /v1/videos/ad-one-click/{'{'}id{'}'}/subtasks</code> — {f('docs.templates.adSubtasksDesc')}
        </li>
        <li>
          <code>POST /v1/videos/ad-one-click/{'{'}id{'}'}/edit</code> — {f('docs.templates.adEditDesc1')}{' '}
          <code>{'{ type, storyboard_video_index?, prompt }'}</code>，<code>type</code>{' '}
          {f('docs.templates.adEditDesc2')}{' '}
          <code>generate_video</code> / <code>generate_narration</code> / <code>generate_bgm</code>；
          {f('docs.templates.adEditDesc3')} <code>storyboard_video_index</code>{f('docs.templates.adEditDesc4')}
        </li>
        <li>
          <code>POST /v1/videos/ad-one-click/{'{'}id{'}'}/compose</code> — {f('docs.templates.adComposeDesc')}{' '}
          <code>{'{ video_task_ids, bgm_task_id?, narration_task_id? }'}</code>。
        </li>
      </ul>
      <p>
        {f('docs.templates.adPlaygroundPre')}<Link to="/playground?tab=ad-one-click">{f('docs.templates.adPlaygroundLink')}</Link>。
      </p>

      {/* ==================== Vidu 通用一键成片 ==================== */}
      <h2 id="vidu-general-one-click">{f('docs.templates.generalSectionTitle')}</h2>
      <p>
        {f('docs.templates.generalP1Pre')}<strong>{f('docs.templates.generalP1Strong')}</strong>
        {f('docs.templates.generalP1Mid1')}{' '}
        <code>vidu-general-one-click</code>{f('docs.templates.generalP1Mid2', { name: site.name })}{' '}
        <code>/v1/videos/generations</code> {f('docs.templates.generalP1End')}
      </p>

      <h3>{f('docs.templates.submitExample')}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "model": "vidu-general-one-click",
  "images": [
    "https://example.com/a.jpg",
    "https://example.com/b.jpg"
  ],
  "prompt": "${f('docs.templates.examplePromptGeneral')}",
  "duration": 15,
  "aspect_ratio": "16:9"
}`}
      />
      <p>
        {f('docs.templates.generalFieldsLabel')}<code>images</code> {f('docs.templates.generalFieldsImages')}
        <code>prompt</code> {f('docs.templates.generalFieldsPrompt')}
        <code>duration</code> {f('docs.templates.generalFieldsDuration')}<code>aspect_ratio</code>{' '}
        {f('docs.templates.adFieldsAspectPre')} <code>1:1</code> /{' '}
        <code>16:9</code> / <code>9:16</code> / <code>4:3</code> / <code>3:4</code>，
        {f('docs.templates.defaultWord')} <code>16:9</code>。
        {f('docs.templates.adFieldsPoll')} <code>GET /v1/videos/generations/{'{'}id{'}'}</code>{' '}
        {f('docs.templates.pollSuffix')}
      </p>

      <h3>{f('docs.templates.generalEditTitle')}</h3>
      <p>{f('docs.templates.generalEditIntro')}</p>
      <ul>
        <li>
          <code>GET /v1/videos/general-one-click/{'{'}id{'}'}/status</code> — {f('docs.templates.generalStatusDesc1')}{' '}
          <code>job_records</code> {f('docs.templates.generalStatusDesc2')}
        </li>
        <li>
          <code>POST /v1/videos/general-one-click/{'{'}id{'}'}/edit</code> — {f('docs.templates.generalEditDesc1')}{' '}
          <code>{'{ job_id, prompt }'}</code>，<code>job_id</code> {f('docs.templates.generalEditDesc2')} <code>job_records</code> {f('docs.templates.generalEditDesc3')}
        </li>
        <li>
          <code>POST /v1/videos/general-one-click/{'{'}id{'}'}/compose</code> — {f('docs.templates.generalComposeDesc')}{' '}
          <code>{'{ job_ids }'}</code>。
        </li>
      </ul>
      <p>
        {f('docs.templates.generalPlaygroundPre')}<Link to="/playground?tab=general-one-click">{f('docs.templates.generalPlaygroundLink')}</Link>。
      </p>
    </>
  );
}
