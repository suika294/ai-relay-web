import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, TabbedCode, useApiBase } from './_shared';

export default function DocVideos() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.videos.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.intro' },
          {
            name: site.name,
            endpoint: <code>/v1/videos/generations</code>,
            submit: <strong>{intl.formatMessage({ id: 'docs.videos.submitVerb' })}</strong>,
            taskId: <code>task_id</code>,
            poll: <strong>{intl.formatMessage({ id: 'docs.videos.pollVerb' })}</strong>,
            succeeded: <code>succeeded</code>,
            failed: <code>failed</code>,
            canceled: <code>canceled</code>,
          },
        )}
      </p>

      <Callout type="info" title={intl.formatMessage({ id: 'docs.videos.asyncCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.asyncCalloutDesc' },
            {
              name: site.name,
              strong: <strong>{intl.formatMessage({ id: 'docs.videos.submitAndPoll' })}</strong>,
            },
          )}
        </p>
      </Callout>

      <h2 id="submit">{intl.formatMessage({ id: 'docs.videos.submitHeading' })}</h2>
      <p>
        <code>POST {API_BASE}/videos/generations</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/videos/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedance-2-0-260128",
    "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptShibaTraffic' })}",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.videos.requestFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{intl.formatMessage({ id: 'docs.videos.colField' })}</th>
              <th style={{ width: 110 }}>{intl.formatMessage({ id: 'docs.videos.colType' })}</th>
              <th>{intl.formatMessage({ id: 'docs.videos.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldModelDesc' },
                  {
                    m1: <code>doubao-seedance-2-0-260128</code>,
                    m2: <code>veo-3.1-generate-preview</code>,
                    m3: <code>kling-v3-omni</code>,
                    m4: <code>viduq3-turbo</code>,
                    link: <Link to="/docs/models">{intl.formatMessage({ id: 'docs.videos.modelListLink' })}</Link>,
                    video: <code>video</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>prompt</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.videos.fieldPromptDesc' })}</td>
            </tr>
            <tr>
              <td>
                <code>duration</code>
              </td>
              <td>integer</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldDurationDesc' },
                  { v1: <code>5</code>, v2: <code>8</code>, v3: <code>10</code> },
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
                  { id: 'docs.videos.fieldAspectRatioDesc' },
                  {
                    r1: <code>16:9</code>,
                    r2: <code>9:16</code>,
                    r3: <code>1:1</code>,
                    ratio: <code>ratio</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>resolution</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldResolutionDesc' },
                  {
                    r1: <code>720p</code>,
                    r2: <code>1080p</code>,
                    aspect: <code>aspect_ratio</code>,
                    resolution: <code>resolution</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>first_frame_image</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldFirstFrameDesc' },
                  {
                    name: site.name,
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.firstFrameImage' })}</strong>,
                    http: <code>http(s)://</code>,
                    data: <code>data:image/...;base64,...</code>,
                    role1: <code>role=first_frame</code>,
                    ep1: <code>/img2video</code>,
                    role2: <code>type=first_frame</code>,
                    role3: <code>image</code>,
                    role4: <code>instance.image</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>last_frame_image</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldLastFrameDesc' },
                  {
                    firstFrame: <code>first_frame_image</code>,
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.startEndDriven' })}</strong>,
                    ep1: <code>/start-end2video</code>,
                    ep2: <code>end_frame</code>,
                    ep3: <code>image_tail</code>,
                    ep4: <code>instance.lastFrame</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>images</code>
              </td>
              <td>array</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldImagesDesc' },
                  {
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.multiImageRef' })}</strong>,
                    ep1: <code>/reference2video</code>,
                    ep2: <code>role=reference_image</code>,
                    ep3: <code>instance.referenceImages</code>,
                    note: (
                      <strong>{intl.formatMessage({ id: 'docs.videos.imagesSemanticNote' })}</strong>
                    ),
                    firstFrame: <code>first_frame_image</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>first_frame_asset_id</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  + <code>last_frame_asset_id</code>
                </div>
                <div style={{ color: '#999', fontSize: 12 }}>
                  + <code>image_asset_ids</code>
                </div>
              </td>
              <td>integer / array</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldAssetIdsDesc' },
                  {
                    name: site.name,
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.platformAssetId' })}</strong>,
                    imageAssetIds: <code>image_asset_ids</code>,
                    images: <code>images</code>,
                    zero: <code>0</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>reference_video</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  + <code>reference_video_asset_id</code>
                </div>
              </td>
              <td>string / integer</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.fieldReferenceVideoDesc' },
                  {
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.referenceVideo' })}</strong>,
                    http: <code>http(s)://</code>,
                    assetId: <code>reference_video_asset_id</code>,
                    videoPrefix: <code>video/</code>,
                    capStrong: (
                      <strong>
                        {intl.formatMessage(
                          { id: 'docs.videos.onlyWhenSupports' },
                          { cap: <code>supports_reference_video</code> },
                        )}
                      </strong>
                    ),
                    noBase64: (
                      <strong>{intl.formatMessage({ id: 'docs.videos.noBase64Inline' })}</strong>
                    ),
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>user</code>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.videos.fieldUserDesc' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout type="info" title={intl.formatMessage({ id: 'docs.videos.imageInputCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.imageInputCalloutDesc' },
            {
              name: site.name,
              strong: (
                <strong>{intl.formatMessage({ id: 'docs.videos.threeSemantics' })}</strong>
              ),
              f1: <code>image_url</code>,
              f2: <code>reference_images</code>,
              f3: <code>reference_asset_ids</code>,
            },
          )}
        </p>
      </Callout>

      <h3>{intl.formatMessage({ id: 'docs.videos.submitResponseHeading' })}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "id": "vgen-x7k3p2m...",
  "object": "video.task",
  "status": "queued",
  "model": "doubao-seedance-2-0-260128",
  "created": 1730000000
}`}
      />
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.submitResponseDesc' },
          {
            id: <code>id</code>,
            taskId: <code>task_id</code>,
            status: <code>status</code>,
            queued: <code>queued</code>,
            running: <code>running</code>,
            succeeded: <code>succeeded</code>,
            failed: <code>failed</code>,
            canceled: <code>canceled</code>,
          },
        )}
      </p>

      <h2 id="poll">{intl.formatMessage({ id: 'docs.videos.pollHeading' })}</h2>
      <p>
        <code>GET {API_BASE}/videos/generations/:task_id</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/videos/generations/vgen-x7k3p2m... \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.pollDesc' },
          { status: <code>status</code> },
        )}
      </p>
      <CodeBlock
        lang="json"
        code={`// ${intl.formatMessage({ id: 'docs.videos.exampleCommentRunning' })}
{
  "id": "vgen-x7k3p2m...",
  "status": "running",
  "model": "doubao-seedance-2-0-260128"
}

// ${intl.formatMessage({ id: 'docs.videos.exampleCommentSucceeded' })}
{
  "id": "vgen-x7k3p2m...",
  "status": "succeeded",
  "model": "doubao-seedance-2-0-260128",
  "data": [
    {
      "url": "https://oss.example.com/video/xxx.mp4",
      "duration": 5,
      "resolution": "1280x720"
    }
  ],
  "usage": {
    "total_tokens": 0
  }
}

// ${intl.formatMessage({ id: 'docs.videos.exampleCommentFailed' })}
{
  "id": "vgen-x7k3p2m...",
  "status": "failed",
  "error": {
    "code": "upstream_error",
    "message": "image_url is not valid"
  }
}`}
      />

      <Callout type="warn" title={intl.formatMessage({ id: 'docs.videos.pollRateCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.pollRateCalloutDesc' },
            {
              initial: <code>3~5s</code>,
              backoff: <code>10s</code>,
              link: <Link to="/docs/rate-limits">{intl.formatMessage({ id: 'docs.videos.rateLimitLink' })}</Link>,
            },
          )}
        </p>
      </Callout>

      <h3>{intl.formatMessage({ id: 'docs.videos.fullPollExampleHeading' })}</h3>
      <TabbedCode
        snippets={[
          {
            key: 'python',
            label: 'Python',
            lang: 'python',
            code: `import time, requests

API_BASE = "${API_BASE}"
KEY = "sk-your-key"
HEADERS = {"Authorization": f"Bearer {KEY}"}

# ${intl.formatMessage({ id: 'docs.videos.exampleCommentSubmit' })}
res = requests.post(
    f"{API_BASE}/videos/generations",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "model": "doubao-seedance-2-0-260128",
        "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptShiba' })}",
        "duration": 5,
        "aspect_ratio": "16:9",
    },
)
task_id = res.json()["id"]
print("submitted:", task_id)

# ${intl.formatMessage({ id: 'docs.videos.exampleCommentPoll' })}
interval = 3
while True:
    time.sleep(interval)
    r = requests.get(f"{API_BASE}/videos/generations/{task_id}", headers=HEADERS).json()
    status = r["status"]
    print("status:", status)
    if status == "succeeded":
        print("video url:", r["data"][0]["url"])
        break
    if status in ("failed", "canceled"):
        print("error:", r.get("error"))
        break
    interval = min(interval + 1, 10)  # ${intl.formatMessage({ id: 'docs.videos.exampleCommentBackoff' })}`,
          },
          {
            key: 'node',
            label: 'Node / TypeScript',
            lang: 'ts',
            code: `const API_BASE = '${API_BASE}';
const KEY = 'sk-your-key';
const headers = { Authorization: \`Bearer \${KEY}\` };

// ${intl.formatMessage({ id: 'docs.videos.exampleCommentSubmit' })}
const submit = await fetch(\`\${API_BASE}/videos/generations\`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'doubao-seedance-2-0-260128',
    prompt: '${intl.formatMessage({ id: 'docs.videos.examplePromptShiba' })}',
    duration: 5,
    aspect_ratio: '16:9',
  }),
}).then((r) => r.json());
const taskId = submit.id;

// ${intl.formatMessage({ id: 'docs.videos.exampleCommentPoll' })}
let interval = 3000;
while (true) {
  await new Promise((r) => setTimeout(r, interval));
  const r = await fetch(\`\${API_BASE}/videos/generations/\${taskId}\`, { headers }).then((r) => r.json());
  if (r.status === 'succeeded') {
    console.log('video url:', r.data[0].url);
    break;
  }
  if (r.status === 'failed' || r.status === 'canceled') {
    console.log('error:', r.error);
    break;
  }
  interval = Math.min(interval + 1000, 10000);
}`,
          },
        ]}
      />

      <h2>{intl.formatMessage({ id: 'docs.videos.cancelHeading' })}</h2>
      <p>
        <code>POST {API_BASE}/videos/generations/:task_id/cancel</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl -X POST ${API_BASE}/videos/generations/vgen-x7k3p2m.../cancel \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.cancelDesc' },
          {
            queued: <code>queued</code>,
            running: <code>running</code>,
            strong: <strong>{intl.formatMessage({ id: 'docs.videos.cancelNotFree' })}</strong>,
          },
        )}
      </p>

      <h2 id="i2v">{intl.formatMessage({ id: 'docs.videos.i2vHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.i2vFirstFrameDesc' },
          { strong: <strong>{intl.formatMessage({ id: 'docs.videos.firstFrameDriven' })}</strong> },
        )}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v3-omni",
  "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptPushInRaiseHand' })}",
  "duration": 5,
  "first_frame_image": "https://example.com/portrait.jpg"
}`}
      />
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.i2vStartEndDesc' },
          {
            strong: <strong>{intl.formatMessage({ id: 'docs.videos.startEndDriven' })}</strong>,
            ep: <code>/start-end2video</code>,
          },
        )}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "viduq3-turbo",
  "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptTransition' })}",
  "duration": 5,
  "first_frame_image": "https://example.com/start.png",
  "last_frame_image":  "https://example.com/end.png"
}`}
      />
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.i2vMultiImageDesc' },
          { strong: <strong>{intl.formatMessage({ id: 'docs.videos.multiImageRef' })}</strong>, ep: <code>/reference2video</code> },
        )}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v3-omni",
  "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptSilverCoat' })}",
  "duration": 5,
  "images": [
    "https://example.com/character.png",
    "https://example.com/scene.png",
    "https://example.com/outfit.png"
  ]
}`}
      />

      <Callout type="info" title={intl.formatMessage({ id: 'docs.videos.refSourceCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.refSourceCalloutDesc' },
            {
              name: site.name,
              link: <Link to="/docs/sdk">/v1/files</Link>,
              f1: <code>first_frame_asset_id</code>,
              f2: <code>last_frame_asset_id</code>,
              f3: <code>image_asset_ids</code>,
            },
          )}
        </p>
      </Callout>

      <h2 id="reference-video">{intl.formatMessage({ id: 'docs.videos.refVideoHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.refVideoDesc' },
          {
            strong: <strong>{intl.formatMessage({ id: 'docs.videos.videoAsInput' })}</strong>,
            f1: <code>reference_video</code>,
            f2: <code>reference_video_asset_id</code>,
          },
        )}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "viduq1",
  "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptExtendClip' })}",
  "duration": 5,
  "reference_video": "https://example.com/clip.mp4"
}`}
      />
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.refVideoAssetDesc' },
          { name: site.name },
        )}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "kling-v1-6",
  "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptKeepStyleExtend' })}",
  "reference_video_asset_id": 987
}`}
      />
      <Callout type="warn" title={intl.formatMessage({ id: 'docs.videos.capabilityGateCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.capabilityGateCalloutDesc' },
            {
              f1: <code>reference_video</code>,
              cap: <code>supports_reference_video</code>,
              m1: <code>viduq3-turbo</code>,
              m2: <code>kling-v3-omni</code>,
              code400: <code>400</code>,
              link: <Link to="/docs/models">{intl.formatMessage({ id: 'docs.videos.modelListLink' })}</Link>,
              strong: <strong>{intl.formatMessage({ id: 'docs.videos.noBase64Inline' })}</strong>,
            },
          )}
        </p>
      </Callout>
      <Callout type="info" title={intl.formatMessage({ id: 'docs.videos.openaiAliasCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.openaiAliasCalloutDesc' },
            {
              f1: <code>input_video</code>,
              f2: <code>input_reference</code>,
              ref: <code>reference_video</code>,
              first: <code>first_frame_image</code>,
            },
          )}
        </p>
      </Callout>

      <h2 id="multiframe">{intl.formatMessage({ id: 'docs.videos.multiframeHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.multiframeDesc' },
          {
            strong1: <strong>{intl.formatMessage({ id: 'docs.videos.viduQ2Exclusive' })}</strong>,
            strong2: <strong>{intl.formatMessage({ id: 'docs.videos.twoToNineKeyframes' })}</strong>,
            strong3: <strong>{intl.formatMessage({ id: 'docs.videos.perframePromptDuration' })}</strong>,
            m1: <code>viduq2-turbo</code>,
            m2: <code>viduq2-pro</code>,
          },
        )}
      </p>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.multiframeUsage' },
          {
            name: site.name,
            f1: <code>first_frame_image</code>,
            f2: <code>image_settings</code>,
          },
        )}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "model": "viduq2-turbo",
  "first_frame_image": "https://example.com/start.jpg",
  "image_settings": [
    {
      "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptPushInTurn' })}",
      "key_image": "https://example.com/frame1.jpg",
      "duration": 5
    },
    {
      "prompt": "${intl.formatMessage({ id: 'docs.videos.examplePromptRaiseHandLight' })}",
      "key_image": "https://example.com/frame2.jpg",
      "duration": 3
    }
  ],
  "resolution": "1080p"
}`}
      />
      <h3>{intl.formatMessage({ id: 'docs.videos.multiframeFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{intl.formatMessage({ id: 'docs.videos.colField' })}</th>
              <th style={{ width: 110 }}>{intl.formatMessage({ id: 'docs.videos.colType' })}</th>
              <th>{intl.formatMessage({ id: 'docs.videos.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>first_frame_image</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.mfFirstFrameDesc' },
                  {
                    startImage: <code>start_image</code>,
                    http: <code>http(s)://</code>,
                    data: <code>data:image/...;base64,...</code>,
                    assetId: <code>first_frame_asset_id</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>image_settings</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>array</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.mfImageSettingsDesc' },
                  { strong: <strong>{intl.formatMessage({ id: 'docs.videos.twoToNine' })}</strong> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                ↳ <code>key_image</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.videos.mfKeyImageDesc' })}</td>
            </tr>
            <tr>
              <td>
                ↳ <code>prompt</code>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.videos.mfPromptDesc' })}</td>
            </tr>
            <tr>
              <td>
                ↳ <code>duration</code>
              </td>
              <td>integer</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.mfDurationDesc' },
                  { range: <code>2~7</code>, def: <code>5</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>resolution</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.mfResolutionDesc' },
                  {
                    r1: <code>540p</code>,
                    r2: <code>720p</code>,
                    r3: <code>1080p</code>,
                    def: <code>720p</code>,
                  },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout type="info" title={intl.formatMessage({ id: 'docs.videos.mfBillingCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.mfBillingCalloutDesc' },
            {
              strong: (
                <strong>
                  {intl.formatMessage(
                    { id: 'docs.videos.mfTotalDuration' },
                    { f: <code>image_settings</code>, d: <code>duration</code> },
                  )}
                </strong>
              ),
              prompt: <code>prompt</code>,
              duration: <code>duration</code>,
              link: <Link to="/playground?tab=multiframe">{intl.formatMessage({ id: 'docs.videos.playgroundMultiframeLink' })}</Link>,
            },
          )}
        </p>
      </Callout>

      <h2 id="models">{intl.formatMessage({ id: 'docs.videos.modelsDiffHeading' })}</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>{intl.formatMessage({ id: 'docs.videos.colModel' })}</th>
              <th>{intl.formatMessage({ id: 'docs.videos.colCapability' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>doubao-seedance-2-0-*</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelDoubaoDesc' },
                  {
                    r1: <code>16:9</code>,
                    r2: <code>9:16</code>,
                    cap: <code>supports_reference_video</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>veo-3.0/3.1-generate-preview</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelVeoDesc' },
                  { cap: <code>supports_reference_video</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>kling-v3-omni</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelKlingOmniDesc' },
                  {
                    name: site.name,
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.noReferenceVideo' })}</strong>,
                    f: <code>reference_video</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>kling-v1 / kling-v1-6</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelKlingV1Desc' },
                  { cap: <code>supports_reference_video</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>viduq1 / vidu1.5 / vidu2.0</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelViduClassicDesc' },
                  { ep: <code>/extend2video</code>, cap: <code>supports_reference_video</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>viduq3-turbo</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelViduQ3Desc' },
                  {
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.noReferenceVideo' })}</strong>,
                    f: <code>reference_video</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>viduq2-turbo / viduq2-pro</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelViduQ2Desc' },
                  {
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.smartMultiframe' })}</strong>,
                    anchor: <a href="#multiframe">{intl.formatMessage({ id: 'docs.videos.multiframeAnchorText' })}</a>,
                    pro: <code>pro</code>,
                    turbo: <code>turbo</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>vidu-template</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelViduTemplateDesc' },
                  {
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.sceneTemplate' })}</strong>,
                    link: <Link to="/docs/templates">{intl.formatMessage({ id: 'docs.videos.sceneEffectLink' })}</Link>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>kling-v1-6 / kling-v1-5 / kling-v1</code>
                <div style={{ color: '#999', fontSize: 12 }}>+ effect_scene</div>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.modelKlingEffectDesc' },
                  {
                    strong: <strong>{intl.formatMessage({ id: 'docs.videos.videoEffect' })}</strong>,
                    link: <Link to="/docs/templates">{intl.formatMessage({ id: 'docs.videos.sceneEffectLink' })}</Link>,
                  },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="virtual-tryon">{intl.formatMessage({ id: 'docs.videos.tryonHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.tryonDesc' },
          {
            kolors: <strong>{intl.formatMessage({ id: 'docs.videos.kolorsTryon' })}</strong>,
            portrait: <strong>{intl.formatMessage({ id: 'docs.videos.portraitImage' })}</strong>,
            cloth: <strong>{intl.formatMessage({ id: 'docs.videos.clothImage' })}</strong>,
            model: <code>kolors-virtual-try-on-v1-5</code>,
            noPrompt: <strong>{intl.formatMessage({ id: 'docs.videos.noPromptNeeded' })}</strong>,
            endpoint: <code>{`${API_BASE}/videos/generations`}</code>,
            data: <code>data[0].url</code>,
            link: <Link to="/playground?tab=virtual-tryon">{intl.formatMessage({ id: 'docs.videos.playgroundTryonLink' })}</Link>,
          },
        )}
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/videos/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kolors-virtual-try-on-v1-5",
    "first_frame_image": "https://your-cdn.com/human.jpg",
    "cloth_image": "https://your-cdn.com/cloth.jpg"
  }'`}
      />
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>{intl.formatMessage({ id: 'docs.videos.colField' })}</th>
              <th style={{ width: 110 }}>{intl.formatMessage({ id: 'docs.videos.colType' })}</th>
              <th>{intl.formatMessage({ id: 'docs.videos.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.tryonFieldModelDesc' },
                  { model: <code>kolors-virtual-try-on-v1-5</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>first_frame_image</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.tryonFieldHumanDesc' },
                  { strong: <strong>{intl.formatMessage({ id: 'docs.videos.portraitImage' })}</strong> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>cloth_image</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.videos.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.videos.tryonFieldClothDesc' },
                  { strong: <strong>{intl.formatMessage({ id: 'docs.videos.clothImage' })}</strong> },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Callout type="info" title={intl.formatMessage({ id: 'docs.videos.tryonResultCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.videos.tryonResultCalloutDesc' },
            {
              name: site.name,
              succeeded: <code>succeeded</code>,
              data: <code>data[0].url</code>,
            },
          )}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.videos.digitalHumanHeading' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.digitalHumanDesc' },
          {
            prompt: <code>prompt</code>,
            link: <Link to="/docs/digital-human">{intl.formatMessage({ id: 'docs.videos.digitalHumanLink' })}</Link>,
          },
        )}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.videos.commonErrorsHeading' })}</h2>
      <ul>
        <li>
          {intl.formatMessage(
            { id: 'docs.videos.errImageUrl' },
            {
              err: (
                <strong>
                  <code>image_url is not valid</code>
                </strong>
              ),
              f1: <code>first_frame_image</code>,
              f2: <code>last_frame_image</code>,
              f3: <code>images</code>,
              a1: <code>*_asset_id</code>,
              a2: <code>image_asset_ids</code>,
            },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.videos.errNoRefVideo' },
            {
              err: (
                <strong>
                  <code>model "..." does not support reference_video</code>
                </strong>
              ),
              cap: <code>supports_reference_video</code>,
              f1: <code>reference_video</code>,
              f2: <code>reference_video_asset_id</code>,
            },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.videos.errInsufficientQuota' },
            {
              err: (
                <strong>
                  <code>insufficient_quota</code>
                </strong>
              ),
              link: <Link to="/billing">{intl.formatMessage({ id: 'docs.videos.rechargeLink' })}</Link>,
            },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.videos.errLongQueued' },
            {
              strong: (
                <strong>
                  {intl.formatMessage(
                    { id: 'docs.videos.taskLongQueued' },
                    { queued: <code>queued</code> },
                  )}
                </strong>
              ),
            },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.videos.errUrlExpired' },
            {
              strong: <strong>{intl.formatMessage({ id: 'docs.videos.urlExpired' })}</strong>,
              name: site.name,
            },
          )}
        </li>
      </ul>
      <p>
        {intl.formatMessage(
          { id: 'docs.videos.errorFooter' },
          {
            link1: <Link to="/docs/errors">{intl.formatMessage({ id: 'docs.videos.errorCodeLink' })}</Link>,
            link2: <Link to="/console/logs/videos">{intl.formatMessage({ id: 'docs.videos.videoHistoryLink' })}</Link>,
          },
        )}
      </p>
    </>
  );
}
