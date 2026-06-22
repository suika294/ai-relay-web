import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock } from './_shared';

export default function DocErrors() {
  const intl = useIntl();
  const site = useSiteInfo();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.errors.title' })}</h1>
      <p>
        {intl.formatMessage({ id: 'docs.errors.intro' }, { name: site.name })}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.errors.structureHeading' })}</h2>
      <CodeBlock
        lang="json"
        code={`{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": "invalid_api_key",
    "param": null
  }
}`}
      />
      <ul>
        <li>
          <code>message</code> {intl.formatMessage({ id: 'docs.errors.fieldMessage' })}
        </li>
        <li>
          <code>type</code>{' '}
          {intl.formatMessage(
            { id: 'docs.errors.fieldType' },
            {
              t1: <code>authentication_error</code>,
              t2: <code>invalid_request_error</code>,
              t3: <code>rate_limit_error</code>,
            },
          )}
        </li>
        <li>
          <code>code</code> {intl.formatMessage({ id: 'docs.errors.fieldCode' })}
        </li>
        <li>
          <code>param</code> {intl.formatMessage({ id: 'docs.errors.fieldParam' })}
        </li>
      </ul>

      <h2>{intl.formatMessage({ id: 'docs.errors.httpHeading' })}</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 110 }}>{intl.formatMessage({ id: 'docs.errors.colStatus' })}</th>
              <th style={{ width: 160 }}>{intl.formatMessage({ id: 'docs.errors.colMeaning' })}</th>
              <th>{intl.formatMessage({ id: 'docs.errors.colCauseAction' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>400</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s400Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s400Action' },
                  { message: <code>message</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <strong>401</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s401Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s401Action' },
                  {
                    auth: <code>Authorization</code>,
                    link: <Link to="/console/tokens">API Key</Link>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <strong>402</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s402Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s402Action' },
                  {
                    link: <Link to="/billing">{intl.formatMessage({ id: 'docs.errors.recharge' })}</Link>,
                    quota: <code>quota_limit</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <strong>403</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s403Meaning' })}</td>
              <td>{intl.formatMessage({ id: 'docs.errors.s403Action' })}</td>
            </tr>
            <tr>
              <td>
                <strong>404</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s404Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s404Action' },
                  {
                    right: <code>/v1/chat/completions</code>,
                    wrong: <code>/v1/chat/completion</code>,
                    model: <code>model</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <strong>422</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s422Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s422Action' },
                  {
                    temp: <code>temperature: 5</code>,
                    maxTokens: <code>max_tokens</code>,
                  },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <strong>429</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s429Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s429Action' },
                  { link: <Link to="/docs/rate-limits">{intl.formatMessage({ id: 'docs.errors.rateLimit' })}</Link> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <strong>500</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s500Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s500Action' },
                  { name: site.name, id: <code>id</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <strong>502</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s502Meaning' })}</td>
              <td>{intl.formatMessage({ id: 'docs.errors.s502Action' })}</td>
            </tr>
            <tr>
              <td>
                <strong>503</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s503Meaning' })}</td>
              <td>{intl.formatMessage({ id: 'docs.errors.s503Action' })}</td>
            </tr>
            <tr>
              <td>
                <strong>504</strong>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.s504Meaning' })}</td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.s504Action' },
                  { maxTokens: <code>max_tokens</code> },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{intl.formatMessage({ id: 'docs.errors.codesHeading' })}</h2>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>error.code</th>
              <th>{intl.formatMessage({ id: 'docs.errors.colMeaning' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>invalid_api_key</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.codeInvalidApiKey' })}</td>
            </tr>
            <tr>
              <td>
                <code>insufficient_quota</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.codeInsufficientQuota' })}</td>
            </tr>
            <tr>
              <td>
                <code>model_not_found</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.codeModelNotFound' },
                  { model: <code>model</code> },
                )}
              </td>
            </tr>
            <tr>
              <td>
                <code>model_not_allowed</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.codeModelNotAllowed' })}</td>
            </tr>
            <tr>
              <td>
                <code>context_length_exceeded</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.codeContextLengthExceeded' })}</td>
            </tr>
            <tr>
              <td>
                <code>rate_limit_exceeded</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.errors.codeRateLimitExceeded' })}</td>
            </tr>
            <tr>
              <td>
                <code>upstream_error</code>
              </td>
              <td>
                {intl.formatMessage(
                  { id: 'docs.errors.codeUpstreamError' },
                  { message: <code>message</code> },
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{intl.formatMessage({ id: 'docs.errors.retryHeading' })}</h2>
      <Callout type="info" title={intl.formatMessage({ id: 'docs.errors.retryCalloutTitle' })}>
        <p style={{ margin: 0 }}>
          {intl.formatMessage(
            { id: 'docs.errors.retryCalloutDesc' },
            {
              retryable: <strong>{intl.formatMessage({ id: 'docs.errors.retryable' })}</strong>,
              notRetryable: <strong>{intl.formatMessage({ id: 'docs.errors.notRetryable' })}</strong>,
              br: <br />,
            },
          )}
        </p>
      </Callout>

      <p>
        {intl.formatMessage(
          { id: 'docs.errors.logsHint' },
          { link: <Link to="/console/logs/usage">{intl.formatMessage({ id: 'docs.errors.consoleLogs' })}</Link> },
        )}
      </p>
    </>
  );
}
