import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocThreeD() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();

  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.threeD.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.threeD.intro1' },
          { name: site.name },
        )}{' '}
        <code>/v1/3d/generations</code>{' '}
        {intl.formatMessage({ id: 'docs.threeD.intro2' })} <code>task_id</code>{' '}
        {intl.formatMessage({ id: 'docs.threeD.intro3' })}{' '}
        <code>GLB</code>、<code>OBJ</code>、<code>FBX</code>、<code>USDZ</code>、
        <code>STL</code> {intl.formatMessage({ id: 'docs.threeD.intro4' })}
      </p>

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.threeD.inputModeTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.threeD.inputModeP1' })}{' '}
          <code>prompt</code> {intl.formatMessage({ id: 'docs.threeD.inputModeP2' })}{' '}
          <code>images</code> {intl.formatMessage({ id: 'docs.threeD.inputModeP3' })}{' '}
          <code>hyper3d-gen2</code> / <code>hitem3d-2.0</code>{' '}
          {intl.formatMessage({ id: 'docs.threeD.inputModeP4' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.threeD.modelsHeading' })}</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>
                {intl.formatMessage({ id: 'docs.threeD.colModelId' })}
              </th>
              <th style={{ width: 160 }}>
                {intl.formatMessage({ id: 'docs.threeD.colCapability' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.threeD.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>hy-3d-3.0</code>
              </td>
              <td>Pro</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelHy30Desc1' })}{' '}
                <code>HY-3D-3.0</code>
                {intl.formatMessage({ id: 'docs.threeD.modelHy30Desc2' })}{' '}
                <code>FBX</code>、<code>USDZ</code>、<code>STL</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>hy-3d-3.1</code>
              </td>
              <td>Pro</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelHy31Desc1' })}{' '}
                <code>HY-3D-3.1</code>
                {intl.formatMessage({ id: 'docs.threeD.modelHy31Desc2' })}{' '}
                <code>Model</code> {intl.formatMessage({ id: 'docs.threeD.modelHy31Desc3' })}{' '}
                <code>3.1</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>hy-3d-express</code>
              </td>
              <td>Express / Rapid</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelExpressDesc1' })}{' '}
                <code>HY-3D-Express</code>
                {intl.formatMessage({ id: 'docs.threeD.modelExpressDesc2' })}{' '}
                <code>OBJ</code>、<code>GLB</code>、<code>STL</code>、
                <code>USDZ</code>、<code>FBX</code>、<code>MP4</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>Tripo/Tripo-H3.1</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.threeD.capTripoHigh' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelTripoHDesc' })}{' '}
                <code>GLB</code> {intl.formatMessage({ id: 'docs.threeD.modelTripoModelPreview' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>Tripo/Tripo-P1.0</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.threeD.capTripoPro' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelTripoPDesc' })}{' '}
                <code>GLB</code> {intl.formatMessage({ id: 'docs.threeD.modelTripoModelPreview' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>hyper3d-gen2</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.threeD.capHyper3d' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelHyper3dDesc' })}{' '}
                <code>GLB</code>、<code>OBJ</code>、<code>USDZ</code>、
                <code>FBX</code>、<code>STL</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>hitem3d-2.0</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.threeD.capHitem3d' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelHitem3dDesc' })}{' '}
                <code>OBJ</code>、<code>GLB</code>、<code>STL</code>、
                <code>FBX</code>、<code>USDZ</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>doubao-seed3d-2-0-260328</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.threeD.capSeed3d' })}</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.modelSeed3dDesc' })}{' '}
                <code>GLB</code>、<code>OBJ</code>、<code>USD</code>、
                <code>USDZ</code>。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{intl.formatMessage({ id: 'docs.threeD.submitHeading' })}</h2>
      <p>
        <code>POST {API_BASE}/3d/generations</code>
      </p>

      <h3>{intl.formatMessage({ id: 'docs.threeD.textTo3dHeading' })}</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/3d/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "hy-3d-3.1",
    "prompt": "${intl.formatMessage({ id: 'docs.threeD.examplePromptMechCat' })}",
    "result_format": "FBX"
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.threeD.imageTo3dHeading' })}</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/3d/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "hy-3d-3.1",
    "images": [123],
    "result_format": "FBX"
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.threeD.tripoTextHeading' })}</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/3d/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "Tripo/Tripo-H3.1",
    "prompt": "${intl.formatMessage({ id: 'docs.threeD.examplePromptCuteCat' })}",
    "parameters": {
      "pbr": true,
      "texture_quality": "standard",
      "geometry_quality": "ultra"
    }
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.threeD.tripoMultiHeading' })}</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/3d/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "Tripo/Tripo-P1.0",
    "images": [
      "https://example.com/front.png",
      "https://example.com/left.png",
      "https://example.com/back.png",
      "https://example.com/right.png"
    ],
    "parameters": {
      "pbr": true,
      "texture": true
    }
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.threeD.hyper3dHeading' })}</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/3d/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "hyper3d-gen2",
    "images": [123],
    "prompt": "full-body hard-surface sci-fi robot",
    "result_format": "glb",
    "parameters": {
      "material": "PBR",
      "mesh_mode": "Raw",
      "quality_override": 500000,
      "hd_texture": true
    }
  }'`}
      />

      <h3>{intl.formatMessage({ id: 'docs.threeD.seed3dHeading' })}</h3>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/3d/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seed3d-2-0-260328",
    "images": ["https://example.com/object.png"],
    "result_format": "glb",
    "parameters": {
      "subdivisionlevel": "medium"
    }
  }'`}
      />

      <p>
        {intl.formatMessage({ id: 'docs.threeD.localUploadTip1' })}{' '}
        <code>{'images: [123]'}</code>
        {intl.formatMessage({ id: 'docs.threeD.localUploadTip2' })}
      </p>

      <h3>{intl.formatMessage({ id: 'docs.threeD.requestFieldsHeading' })}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 190 }}>
                {intl.formatMessage({ id: 'docs.threeD.colField' })}
              </th>
              <th style={{ width: 110 }}>
                {intl.formatMessage({ id: 'docs.threeD.colType' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.threeD.colDesc' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>model</code>
                <div style={{ color: '#999', fontSize: 12 }}>
                  {intl.formatMessage({ id: 'docs.threeD.required' })}
                </div>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.fieldModelDesc1' })}{' '}
                <code>hy-3d-3.0</code>、<code>hy-3d-3.1</code>、
                <code>hy-3d-express</code>、<code>Tripo/Tripo-H3.1</code>、
                <code>Tripo/Tripo-P1.0</code>、<code>hyper3d-gen2</code>、
                <code>hitem3d-2.0</code>、<code>doubao-seed3d-2-0-260328</code>。
                {intl.formatMessage({ id: 'docs.threeD.fieldModelDesc2' })}{' '}
                <Link to="/docs/models">
                  {intl.formatMessage({ id: 'docs.threeD.modelListLink' })}
                </Link>
                {intl.formatMessage(
                  { id: 'docs.threeD.fieldModelDesc3' },
                  { type: '3d' },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>prompt</code>
              </td>
              <td>string</td>
              <td>{intl.formatMessage({ id: 'docs.threeD.fieldPromptDesc' })}</td>
            </tr>
            <tr>
              <td>
                <code>images</code>
              </td>
              <td>array</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.fieldImagesDesc1' })}
                <code>data:image/...;base64,...</code>
                {intl.formatMessage({ id: 'docs.threeD.fieldImagesDesc2' })}
              </td>
            </tr>
            <tr>
              <td>
                <code>result_format</code>
              </td>
              <td>string</td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.fieldResultFormatDesc1' })}
                <code>FBX</code> / <code>USDZ</code> / <code>STL</code>;{' '}
                {intl.formatMessage({ id: 'docs.threeD.fieldResultFormatExpress' })}
                <code>OBJ</code> / <code>GLB</code> / <code>STL</code> /{' '}
                <code>USDZ</code> / <code>FBX</code> / <code>MP4</code>;{' '}
                {intl.formatMessage({ id: 'docs.threeD.fieldResultFormatTripo' })}{' '}
                <code>GLB</code>;{' '}
                {intl.formatMessage({ id: 'docs.threeD.fieldResultFormatVolc' })}{' '}
                <code>glb</code> / <code>obj</code> / <code>usd</code> /{' '}
                <code>usdz</code> / <code>fbx</code> / <code>stl</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>enable_pbr</code>
              </td>
              <td>boolean</td>
              <td>{intl.formatMessage({ id: 'docs.threeD.fieldEnablePbrDesc' })}</td>
            </tr>
            <tr>
              <td>
                <code>parameters</code>
              </td>
              <td>object</td>
              <td>{intl.formatMessage({ id: 'docs.threeD.fieldParametersDesc' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          {intl.formatMessage({ id: 'docs.threeD.parametersDetailSummary' })}
        </summary>
        <div className="docs-table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 190 }}>
                  {intl.formatMessage({ id: 'docs.threeD.colParam' })}
                </th>
                <th style={{ width: 170 }}>
                  {intl.formatMessage({ id: 'docs.threeD.colApplicableModel' })}
                </th>
                <th style={{ width: 180 }}>
                  {intl.formatMessage({ id: 'docs.threeD.colAllowedValues' })}
                </th>
                <th>{intl.formatMessage({ id: 'docs.threeD.colEffect' })}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>face_count</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyTencentPro' })}</td>
                <td>{intl.formatMessage({ id: 'docs.threeD.valInteger' })}</td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramFaceCountDesc1' })}{' '}
                  <code>3000</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramFaceCountDesc2' })}{' '}
                  <code>1500000</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramFaceCountDesc3' })}{' '}
                  <code>500000</code>。
                </td>
              </tr>
              <tr>
                <td>
                  <code>generate_type</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyTencentPro' })}</td>
                <td>
                  <code>Normal</code> / <code>LowPoly</code> /{' '}
                  <code>Geometry</code> / <code>Sketch</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramGenerateTypeDesc1' })}
                  <code>Normal</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramGenerateTypeDesc2' })}
                  <code>LowPoly</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramGenerateTypeDesc3' })}
                  <code>Geometry</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramGenerateTypeDesc4' })}
                  <code>Sketch</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramGenerateTypeDesc5' })}
                </td>
              </tr>
              <tr>
                <td>
                  <code>polygon_type</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.applyTencentProLowPolyPre' })}{' '}
                  <code>generate_type=LowPoly</code>
                </td>
                <td>
                  <code>triangle</code> / <code>quadrilateral</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramPolygonTypeDesc1' })}
                  <code>triangle</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramPolygonTypeDesc2' })}
                  <code>quadrilateral</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramPolygonTypeDesc3' })}
                </td>
              </tr>
              <tr>
                <td>
                  <code>enable_geometry</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyTencentExpress' })}</td>
                <td>
                  <code>true</code> / <code>false</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramEnableGeometryDesc1' })}{' '}
                  <code>true</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramEnableGeometryDesc2' })}
                </td>
              </tr>
              <tr>
                <td>
                  <code>texture_quality</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyAliTripo' })}</td>
                <td>
                  <code>standard</code> / <code>detailed</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureQualityDesc1' })}
                  <code>standard</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureQualityDesc2' })}
                  <code>detailed</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureQualityDesc3' })}
                </td>
              </tr>
              <tr>
                <td>
                  <code>geometry_quality</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.applyAliPre' })}{' '}
                  <code>Tripo/Tripo-H3.1</code>
                </td>
                <td>
                  <code>standard</code> / <code>ultra</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramGeometryQualityDesc1' })}
                  <code>standard</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramGeometryQualityDesc2' })}
                  <code>ultra</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramGeometryQualityDesc3' })}
                </td>
              </tr>
              <tr>
                <td>
                  <code>pbr</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyAliTripo' })}</td>
                <td>
                  <code>true</code> / <code>false</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramPbrDesc1' })}{' '}
                  <code>true</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramPbrDesc2' })}{' '}
                  <code>true</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramPbrDesc3' })}{' '}
                  <code>pbr_model_url</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramPbrDesc4' })}{' '}
                  <code>pbr</code> {intl.formatMessage({ id: 'docs.threeD.and' })}{' '}
                  <code>texture</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramPbrDesc5' })}{' '}
                  <code>false</code>。
                </td>
              </tr>
              <tr>
                <td>
                  <code>texture</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyAliTripo' })}</td>
                <td>
                  <code>true</code> / <code>false</code>
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureDesc1' })}{' '}
                  <code>true</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureDesc2' })}{' '}
                  <code>false</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureDesc3' })}{' '}
                  <code>pbr</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureDesc4' })}{' '}
                  <code>false</code>
                  {intl.formatMessage({ id: 'docs.threeD.paramTextureDesc5' })}{' '}
                  <code>base_model_url</code>。
                </td>
              </tr>
              <tr>
                <td>
                  <code>material</code> / <code>mesh_mode</code> /{' '}
                  <code>quality_override</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyVolcYingmou' })}</td>
                <td>
                  <code>PBR</code> / <code>Shaded</code> / <code>All</code> /{' '}
                  <code>None</code>; <code>Raw</code> / <code>Quad</code>;{' '}
                  {intl.formatMessage({ id: 'docs.threeD.valNumber' })}
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramMaterialDesc1' })}
                  <code>--mesh_mode Raw</code>。
                </td>
              </tr>
              <tr>
                <td>
                  <code>addons</code> / <code>hd_texture</code> /{' '}
                  <code>use_original_alpha</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyVolcYingmou' })}</td>
                <td>
                  <code>HighPack</code>; boolean
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.paramAddonsDesc' })}</td>
              </tr>
              <tr>
                <td>
                  <code>resolution</code> / <code>face</code> /{' '}
                  <code>request_type</code> / <code>multi_images_bit</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyVolcShumei' })}</td>
                <td>
                  <code>1536</code> / <code>1536pro</code>;{' '}
                  {intl.formatMessage({ id: 'docs.threeD.valInteger' })};{' '}
                  <code>1</code> / <code>3</code>;{' '}
                  {intl.formatMessage({ id: 'docs.threeD.valBitmapString' })}
                </td>
                <td>
                  {intl.formatMessage({ id: 'docs.threeD.paramResolutionDesc1' })}
                  <code>result_format</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramResolutionDesc2' })}{' '}
                  <code>fileformat</code>{' '}
                  {intl.formatMessage({ id: 'docs.threeD.paramResolutionDesc3' })}
                </td>
              </tr>
              <tr>
                <td>
                  <code>subdivisionlevel</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.applyVolcSeed3d' })}</td>
                <td>
                  <code>high</code> / <code>medium</code> / <code>low</code>
                </td>
                <td>{intl.formatMessage({ id: 'docs.threeD.paramSubdivisionDesc' })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <h3>{intl.formatMessage({ id: 'docs.threeD.submitResponseHeading' })}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "id": "3d-4f8d7c2a...",
  "object": "3d.generation",
  "status": "queued",
  "model": "hy-3d-3.1",
  "created_at": 1760000000
}`}
      />

      <h2>{intl.formatMessage({ id: 'docs.threeD.pollHeading' })}</h2>
      <p>
        <code>GET {API_BASE}/3d/generations/:task_id</code>
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/3d/generations/3d-4f8d7c2a... \\
  -H "Authorization: Bearer sk-your-key"`}
      />

      <h3>{intl.formatMessage({ id: 'docs.threeD.successResponseHeading' })}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "id": "3d-4f8d7c2a...",
  "object": "3d.generation",
  "status": "succeeded",
  "model": "hy-3d-3.1",
  "created_at": 1760000000,
  "completed_at": 1760000090,
  "preview_url": "https://cdn.example.com/model3d/preview.png",
  "files": [
    {
      "type": "FBX",
      "url": "https://cdn.example.com/model3d/result.fbx",
      "preview_image_url": "https://cdn.example.com/model3d/preview.png"
    }
  ],
  "usage": {
    "quota_cost": 3000,
    "usd_cost": "0.300000"
  }
}`}
      />

      <h3>{intl.formatMessage({ id: 'docs.threeD.failedResponseHeading' })}</h3>
      <CodeBlock
        lang="json"
        code={`{
  "id": "3d-4f8d7c2a...",
  "object": "3d.generation",
  "status": "failed",
  "model": "hy-3d-3.1",
  "error": {
    "code": "InvalidParameter.InvalidParameter",
    "message": "prompt and image input cannot be used together"
  }
}`}
      />

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.threeD.transferTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.threeD.transferBody1' },
            { name: site.name },
          )}{' '}
          <code>files[].url</code>{' '}
          {intl.formatMessage({ id: 'docs.threeD.transferBody2' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.threeD.commonErrorsHeading' })}</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 240 }}>
                {intl.formatMessage({ id: 'docs.threeD.colError' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.threeD.colHandling' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>prompt and image input cannot be used together</code>
              </td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.errPromptImage1' })}{' '}
                <code>prompt</code>{' '}
                {intl.formatMessage({ id: 'docs.threeD.errPromptImage2' })}{' '}
                <code>hyper3d-gen2</code> {intl.formatMessage({ id: 'docs.threeD.or' })}{' '}
                <code>hitem3d-2.0</code>。
              </td>
            </tr>
            <tr>
              <td>
                <code>model_not_found</code> / <code>no available channel</code>
              </td>
              <td>
                {intl.formatMessage({ id: 'docs.threeD.errModelNotFound1' })}{' '}
                <code>hunyuan3d</code>、<code>dashscope_3d</code>{' '}
                {intl.formatMessage({ id: 'docs.threeD.or' })} <code>doubao</code>{' '}
                {intl.formatMessage({ id: 'docs.threeD.errModelNotFound2' })}
              </td>
            </tr>
            <tr>
              <td>{intl.formatMessage({ id: 'docs.threeD.errImageDownload' })}</td>
              <td>{intl.formatMessage({ id: 'docs.threeD.errImageDownloadHandling' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        {intl.formatMessage({ id: 'docs.threeD.playgroundTip1' })}{' '}
        <Link to="/console/playground">Playground</Link>{' '}
        {intl.formatMessage({ id: 'docs.threeD.playgroundTip2' })}
      </p>
    </>
  );
}
