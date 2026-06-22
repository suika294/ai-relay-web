import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocAuth() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.auth.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.auth.intro' },
          {
            name: site.name,
            v1: <code>/v1/*</code>,
            bearer: <code>Bearer</code>,
          },
        )}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.auth.requestHeader' })}</h2>
      <CodeBlock
        lang="http"
        code={`Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json`}
      />
      <p>
        {intl.formatMessage(
          { id: 'docs.auth.keyFormat' },
          { sk: <code>sk-</code> },
        )}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.auth.createNewKey' })}</h2>
      <ol>
        <li>
          {intl.formatMessage(
            { id: 'docs.auth.step1' },
            { link: <Link to="/console/tokens">API Key</Link> },
          )}
        </li>
        <li>{intl.formatMessage({ id: 'docs.auth.step2' })}</li>
        <li>{intl.formatMessage({ id: 'docs.auth.step3' })}</li>
        <li>{intl.formatMessage({ id: 'docs.auth.step4' })}</li>
        <li>{intl.formatMessage({ id: 'docs.auth.step5' })}</li>
      </ol>

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.auth.showOnceTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.auth.showOnceDesc' },
            { masked: <code>sk-xxxx...abcd</code> },
          )}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.auth.verifyKey' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.auth.verifyDesc' },
          { models: <code>/v1/models</code> },
        )}
      </p>
      <CodeBlock
        lang="bash"
        code={`curl ${API_BASE}/models \\
  -H "Authorization: Bearer sk-your-key"`}
      />
      <p>{intl.formatMessage({ id: 'docs.auth.verifyResult' })}</p>
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
        {intl.formatMessage(
          { id: 'docs.auth.otherErrors' },
          { link: <Link to="/docs/errors">{intl.formatMessage({ id: 'docs.auth.errorCodes' })}</Link> },
        )}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.auth.bestPractices' })}</h2>
      <ul>
        <li>
          {intl.formatMessage(
            { id: 'docs.auth.practiceNoLeak' },
            { strong: <strong>{intl.formatMessage({ id: 'docs.auth.practiceNoLeakBold' })}</strong> },
          )}
        </li>
        <li>
          {intl.formatMessage(
            { id: 'docs.auth.practicePerUse' },
            {
              prod: <code>web-prod</code>,
              dev: <code>web-dev</code>,
              test: <code>script-test</code>,
            },
          )}
        </li>
        <li>{intl.formatMessage({ id: 'docs.auth.practiceTriple' })}</li>
        <li>{intl.formatMessage({ id: 'docs.auth.practiceMonitor' })}</li>
      </ul>

      <h2>{intl.formatMessage({ id: 'docs.auth.disableRotate' })}</h2>
      <p>
        {intl.formatMessage(
          { id: 'docs.auth.disableRotateDesc' },
          { link: <Link to="/console/tokens">{intl.formatMessage({ id: 'docs.auth.keyListLink' })}</Link> },
        )}
      </p>
    </>
  );
}
