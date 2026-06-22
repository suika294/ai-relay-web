import {
  ApiOutlined,
  DollarOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { history, Link, useIntl } from '@umijs/max';
import { Button, Col, Row, Typography } from 'antd';
import { useAuthModal } from '@/components/AuthModalProvider';
import PublicLayout from '@/layouts/PublicLayout';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { t } from '@/utils/i18n';

const { Paragraph } = Typography;

const features = [
  {
    icon: <ApiOutlined />,
    title: t('landing.featureUnifiedApiTitle'),
    desc: t('landing.featureUnifiedApiDesc'),
  },
  {
    icon: <GlobalOutlined />,
    title: t('landing.featureMultiCurrencyTitle'),
    desc: t('landing.featureMultiCurrencyDesc'),
  },
  {
    icon: <ThunderboltOutlined />,
    title: t('landing.featureStreamingTitle'),
    desc: t('landing.featureStreamingDesc'),
  },
  {
    icon: <DollarOutlined />,
    title: t('landing.featureBillingTitle'),
    desc: t('landing.featureBillingDesc'),
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: t('landing.featureSecurityTitle'),
    desc: t('landing.featureSecurityDesc'),
  },
];

export default function Landing() {
  return (
    <PublicLayout>
      <LandingContent />
    </PublicLayout>
  );
}

function LandingContent() {
  const intl = useIntl();
  const site = useSiteInfo();
  const { openAuthModal } = useAuthModal();
  const openRegister = () =>
    openAuthModal({
      defaultTab: 'register',
      onSuccess: () => history.push('/console/dashboard'),
    });

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">
          {intl.formatMessage({ id: 'landing.heroTitlePrefix' })}
          <span className="hero-highlight">
            {intl.formatMessage({ id: 'landing.heroTitleHighlight' })}
          </span>
        </h1>
        <p className="hero-sub">
          {intl.formatMessage({ id: 'landing.heroSub' }, { name: site.name })}
        </p>
        <div className="hero-cta">
          {site.register_enabled && (
            <Button type="primary" size="large" onClick={openRegister}>
              {intl.formatMessage({ id: 'landing.registerFree' })}
            </Button>
          )}
          <Button size="large" onClick={() => history.push('/pricing-classic')}>
            {intl.formatMessage({ id: 'landing.viewPricing' })}
          </Button>
        </div>
        <div className="hero-badges">
          <div>
            <span className="b-num">20+</span>
            {intl.formatMessage({ id: 'landing.badgeBuiltinModels' })}
          </div>
          <div>
            <span className="b-num">7+</span>
            {intl.formatMessage({ id: 'landing.badgeProviders' })}
          </div>
          <div>
            <span className="b-num">5+</span>
            {intl.formatMessage({ id: 'landing.badgeCurrencies' })}
          </div>
          <div>
            <span className="b-num">99.9%</span>
            {intl.formatMessage({ id: 'landing.badgeAvailability' })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <h2 className="section-title">
          {intl.formatMessage({ id: 'landing.featuresTitle' }, { name: site.name })}
        </h2>
        <p className="section-sub">
          {intl.formatMessage({ id: 'landing.featuresSub' })}
        </p>
        <Row gutter={[24, 24]}>
          {features.map((f) => (
            <Col key={f.title} xs={24} sm={12} md={8}>
              <div className="feature-card">
                <div className="ico">{f.icon}</div>
                <div className="t">{f.title}</div>
                <div className="d">{f.desc}</div>
              </div>
            </Col>
          ))}
        </Row>
      </section>

      {/* Quickstart preview */}
      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">
          {intl.formatMessage({ id: 'landing.quickstartTitle' })}
        </h2>
        <p className="section-sub">
          {intl.formatMessage({ id: 'landing.quickstartSub' }, { name: site.name })}
        </p>
        <Paragraph copyable code style={{ maxWidth: 780, margin: '0 auto', background: '#0f1117', padding: 20, borderRadius: 12, color: '#e7eaf3' }}>
          {`curl -N http://localhost:8080/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"hi"}],"stream":true}'`}
        </Paragraph>
      </section>

      {/* CTA band */}
      <section className="cta-band">
        <h2>{intl.formatMessage({ id: 'landing.ctaTitle' })}</h2>
        <p>{intl.formatMessage({ id: 'landing.ctaSub' })}</p>
        <div className="hero-cta">
          {site.register_enabled && (
            <Button type="primary" size="large" onClick={openRegister}>
              {intl.formatMessage({ id: 'landing.startNow' })}
            </Button>
          )}
          <Button
            size="large"
            ghost
            type={site.register_enabled ? 'default' : 'primary'}
            onClick={() => history.push('/docs')}
          >
            {intl.formatMessage({ id: 'landing.readDocs' })}
          </Button>
        </div>
      </section>
    </>
  );
}
