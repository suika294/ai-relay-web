import { Link, useIntl } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout, CodeBlock, useApiBase } from './_shared';

export default function DocRateLimits() {
  const intl = useIntl();
  const site = useSiteInfo();
  const API_BASE = useApiBase();
  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.rateLimits.title' })}</h1>
      <p>
        {intl.formatMessage(
          { id: 'docs.rateLimits.intro' },
          { name: site.name },
        )}
      </p>

      <h2>{intl.formatMessage({ id: 'docs.rateLimits.dimensionsHeading' })}</h2>
      <ul>
        <li>
          <strong>RPM</strong>
          {intl.formatMessage({ id: 'docs.rateLimits.dimRpm' })}
        </li>
        <li>
          <strong>TPM</strong>
          {intl.formatMessage({ id: 'docs.rateLimits.dimTpm' })}
        </li>
        <li>
          <strong>{intl.formatMessage({ id: 'docs.rateLimits.dimConcurrencyLabel' })}</strong>
          {intl.formatMessage({ id: 'docs.rateLimits.dimConcurrency' })}
        </li>
        <li>
          <strong>{intl.formatMessage({ id: 'docs.rateLimits.dimUpstreamLabel' })}</strong>
          {intl.formatMessage(
            { id: 'docs.rateLimits.dimUpstream' },
            { name: site.name },
          )}
        </li>
      </ul>

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.rateLimits.calloutBothTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.rateLimits.calloutBothPart1' })}{' '}
          <code>429</code>
          {intl.formatMessage({ id: 'docs.rateLimits.calloutBothPart2' })}
          <Link to="/console/tokens">API Key</Link>
          {intl.formatMessage({ id: 'docs.rateLimits.calloutBothPart3' })}
        </p>
      </Callout>

      <h2>{intl.formatMessage({ id: 'docs.rateLimits.triggerHeading' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.rateLimits.triggerIntroPart1' })}{' '}
        <code>429 Too Many Requests</code>
        {intl.formatMessage({ id: 'docs.rateLimits.triggerIntroPart2' })}
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "error": {
    "message": "Rate limit reached for gpt-4o-mini, please retry in 12.4s",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}`}
      />
      <p>{intl.formatMessage({ id: 'docs.rateLimits.headersIntro' })}</p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 260 }}>
                {intl.formatMessage({ id: 'docs.rateLimits.thHeader' })}
              </th>
              <th>{intl.formatMessage({ id: 'docs.rateLimits.thMeaning' })}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>x-ratelimit-limit-requests</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.rateLimits.hdrLimitRequests' })}</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-remaining-requests</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.rateLimits.hdrRemainingRequests' })}</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-reset-requests</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.rateLimits.hdrResetRequests' })}</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-limit-tokens</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.rateLimits.hdrLimitTokens' })}</td>
            </tr>
            <tr>
              <td>
                <code>x-ratelimit-remaining-tokens</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.rateLimits.hdrRemainingTokens' })}</td>
            </tr>
            <tr>
              <td>
                <code>retry-after</code>
              </td>
              <td>{intl.formatMessage({ id: 'docs.rateLimits.hdrRetryAfter' })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>{intl.formatMessage({ id: 'docs.rateLimits.backoffHeading' })}</h2>
      <p>
        {intl.formatMessage({ id: 'docs.rateLimits.backoffIntroPart1' })}{' '}
        <code>429</code>
        {intl.formatMessage({ id: 'docs.rateLimits.backoffIntroPart2' })}
      </p>
      <ol>
        <li>
          {intl.formatMessage({ id: 'docs.rateLimits.backoffStep1Part1' })}{' '}
          <code>retry-after</code>
          {intl.formatMessage({ id: 'docs.rateLimits.backoffStep1Part2' })}{' '}
          <em>retry in Ns</em>
          {intl.formatMessage({ id: 'docs.rateLimits.backoffStep1Part3' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.rateLimits.backoffStep2Part1' })}
          <strong>{intl.formatMessage({ id: 'docs.rateLimits.backoffStep2Strong' })}</strong>
          {intl.formatMessage({ id: 'docs.rateLimits.backoffStep2Part2' })}
          <code>delay = min(2 ** attempt, 30) + random(0, 1)</code>
          {intl.formatMessage({ id: 'docs.rateLimits.backoffStep2Part3' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.rateLimits.backoffStep3' })}
        </li>
      </ol>

      <CodeBlock
        lang="python"
        code={`import time, random
from openai import OpenAI, RateLimitError

client = OpenAI(api_key="sk-your-key", base_url="${API_BASE}")

def call_with_retry(**kwargs):
    for attempt in range(5):
        try:
            return client.chat.completions.create(**kwargs)
        except RateLimitError as e:
            # ${intl.formatMessage({ id: 'docs.rateLimits.codeCommentPreferRetryAfter' })}
            wait = getattr(e, "retry_after", None) or min(2 ** attempt, 30)
            time.sleep(wait + random.random())
    raise RuntimeError("rate-limited after 5 retries")`}
      />

      <h2>{intl.formatMessage({ id: 'docs.rateLimits.quotaHeading' })}</h2>
      <ul>
        <li>
          {intl.formatMessage({ id: 'docs.rateLimits.quotaKeyPart1' })}{' '}
          <code>quota_limit</code>
          {intl.formatMessage({ id: 'docs.rateLimits.quotaKeyPart2' })}{' '}
          <Link to="/console/tokens">API Key</Link>{' '}
          {intl.formatMessage({ id: 'docs.rateLimits.quotaKeyPart3' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.rateLimits.quotaAccount' })}
        </li>
        <li>
          {intl.formatMessage({ id: 'docs.rateLimits.quotaConcurrency' })}
        </li>
      </ul>

      <Callout
        type="warn"
        title={intl.formatMessage({ id: 'docs.rateLimits.calloutWarnTitle' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.rateLimits.calloutWarnBody' })}
        </p>
      </Callout>
    </>
  );
}
