import { Link, useIntl } from '@umijs/max';
import { Collapse } from 'antd';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Callout } from './_shared';

export default function DocFaq() {
  const site = useSiteInfo();
  const intl = useIntl();
  const items = [
    {
      key: 'q-openai-compat',
      label: intl.formatMessage({ id: 'docs.faq.q1.label' }, { name: site.name }),
      children: (
        <p>
          {intl.formatMessage(
            { id: 'docs.faq.q1.p1.pre' },
            { name: site.name },
          )}
          <code>model</code>
          {intl.formatMessage({ id: 'docs.faq.q1.p1.post' })}
        </p>
      ),
    },
    {
      key: 'q-billing',
      label: intl.formatMessage({ id: 'docs.faq.q2.label' }),
      children: (
        <>
          <p>
            {intl.formatMessage({ id: 'docs.faq.q2.p1.pre' })}
            <Link to="/models">
              {intl.formatMessage({ id: 'docs.faq.q2.p1.modelMarket' })}
            </Link>{' '}
            {intl.formatMessage({ id: 'docs.faq.q2.p1.mid' })}
            <code>usage</code>
            {intl.formatMessage({ id: 'docs.faq.q2.p1.post' })}
          </p>
          <p>{intl.formatMessage({ id: 'docs.faq.q2.reasonsTitle' })}</p>
          <ul>
            <li>{intl.formatMessage({ id: 'docs.faq.q2.reason1' })}</li>
            <li>
              {intl.formatMessage({ id: 'docs.faq.q2.reason2.pre' })}
              <code>stream</code>
              {intl.formatMessage({ id: 'docs.faq.q2.reason2.post' })}
            </li>
            <li>{intl.formatMessage({ id: 'docs.faq.q2.reason3' })}</li>
            <li>{intl.formatMessage({ id: 'docs.faq.q2.reason4' })}</li>
          </ul>
          <p>
            {intl.formatMessage({ id: 'docs.faq.q2.seeActual.pre' })}
            <Link to="/console/logs/usage">
              {intl.formatMessage({ id: 'docs.faq.q2.seeActual.link' })}
            </Link>
            {intl.formatMessage({ id: 'docs.faq.q2.seeActual.post' })}
          </p>
        </>
      ),
    },
    {
      key: 'q-data',
      label: intl.formatMessage({ id: 'docs.faq.q3.label' }),
      children: (
        <>
          <p>
            {intl.formatMessage({ id: 'docs.faq.q3.p1' }, { name: site.name })}
          </p>
          <p>{intl.formatMessage({ id: 'docs.faq.q3.p2' })}</p>
        </>
      ),
    },
    {
      key: 'q-streaming-cut',
      label: intl.formatMessage({ id: 'docs.faq.q4.label' }),
      children: (
        <>
          <p>
            {intl.formatMessage(
              { id: 'docs.faq.q4.p1.pre' },
              { name: site.name },
            )}
            <code>usage</code>
            {intl.formatMessage({ id: 'docs.faq.q4.p1.post' })}
          </p>
          <p>{intl.formatMessage({ id: 'docs.faq.q4.p2' })}</p>
          <ul>
            <li>{intl.formatMessage({ id: 'docs.faq.q4.tip1' })}</li>
            <li>
              {intl.formatMessage({ id: 'docs.faq.q4.tip2.pre' })}
              <code>max_tokens</code>
              {intl.formatMessage({ id: 'docs.faq.q4.tip2.post' })}
            </li>
          </ul>
        </>
      ),
    },
    {
      key: 'q-region',
      label: intl.formatMessage({ id: 'docs.faq.q5.label' }),
      children: (
        <p>
          {intl.formatMessage({ id: 'docs.faq.q5.p1' }, { name: site.name })}
        </p>
      ),
    },
    {
      key: 'q-supports',
      label: intl.formatMessage({ id: 'docs.faq.q6.label' }),
      children: (
        <>
          <p>
            {intl.formatMessage({ id: 'docs.faq.q6.p1.pre' })}
            <code>tools</code> / <code>tool_choice</code> /{' '}
            <code>response_format</code>
            {intl.formatMessage({ id: 'docs.faq.q6.p1.post' })}
          </p>
          <ul>
            <li>
              {intl.formatMessage({ id: 'docs.faq.q6.combo1.pre' })}
              <code>gpt-4o</code>
              {intl.formatMessage({ id: 'docs.faq.q6.combo1.post' })}
            </li>
            <li>{intl.formatMessage({ id: 'docs.faq.q6.combo2' })}</li>
            <li>{intl.formatMessage({ id: 'docs.faq.q6.combo3' })}</li>
          </ul>
        </>
      ),
    },
    {
      key: 'q-org',
      label: intl.formatMessage({ id: 'docs.faq.q7.label' }),
      children: (
        <p>
          {intl.formatMessage({ id: 'docs.faq.q7.p1.pre' })}
          <Link to="/console/billing/invoices">
            {intl.formatMessage({ id: 'docs.faq.q7.p1.invoices' })}
          </Link>{' '}
          {intl.formatMessage({ id: 'docs.faq.q7.p1.mid' })}
          <Link to="/console/settings">
            {intl.formatMessage({ id: 'docs.faq.q7.p1.settings' })}
          </Link>{' '}
          {intl.formatMessage({ id: 'docs.faq.q7.p1.post' })}
        </p>
      ),
    },
    {
      key: 'q-incident',
      label: intl.formatMessage({ id: 'docs.faq.q8.label' }, { name: site.name }),
      children: (
        <>
          <p>{intl.formatMessage({ id: 'docs.faq.q8.orderTitle' })}</p>
          <ol>
            <li>
              {intl.formatMessage({ id: 'docs.faq.q8.step1.pre' })}
              <Link to="/docs/errors">
                {intl.formatMessage({ id: 'docs.faq.q8.step1.link' })}
              </Link>
              {intl.formatMessage({ id: 'docs.faq.q8.step1.post' })}
            </li>
            <li>
              {intl.formatMessage({ id: 'docs.faq.q8.step2.pre' })}
              <Link to="/console/logs/usage">
                {intl.formatMessage({ id: 'docs.faq.q8.step2.link' })}
              </Link>{' '}
              {intl.formatMessage({ id: 'docs.faq.q8.step2.post' })}
            </li>
            <li>{intl.formatMessage({ id: 'docs.faq.q8.step3' })}</li>
            <li>
              {intl.formatMessage({ id: 'docs.faq.q8.step4.pre' })}
              <code>id</code>
              {intl.formatMessage({ id: 'docs.faq.q8.step4.post' })}
            </li>
          </ol>
        </>
      ),
    },
  ];

  return (
    <>
      <h1>{intl.formatMessage({ id: 'docs.faq.title' })}</h1>
      <p>{intl.formatMessage({ id: 'docs.faq.intro' })}</p>

      <Collapse
        items={items}
        defaultActiveKey={['q-openai-compat']}
        bordered={false}
        style={{ background: 'transparent', marginTop: 20 }}
      />

      <Callout
        type="info"
        title={intl.formatMessage({ id: 'docs.faq.noAnswer.title' })}
      >
        <p style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'docs.faq.noAnswer.pre' })}
          <Link to="/docs/quick-start">
            {intl.formatMessage({ id: 'docs.faq.noAnswer.quickStart' })}
          </Link>
          {intl.formatMessage({ id: 'docs.faq.noAnswer.mid1' })}
          <Link to="/docs/errors">
            {intl.formatMessage({ id: 'docs.faq.noAnswer.errors' })}
          </Link>{' '}
          {intl.formatMessage({ id: 'docs.faq.noAnswer.mid2' })}
          <Link to="/console/billing/records">
            {intl.formatMessage({ id: 'docs.faq.noAnswer.records' })}
          </Link>{' '}
          {intl.formatMessage({ id: 'docs.faq.noAnswer.post' })}
        </p>
      </Callout>
    </>
  );
}
