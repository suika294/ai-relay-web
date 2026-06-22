import { ReloadOutlined } from '@ant-design/icons';
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components';
import { Area, Pie } from '@ant-design/charts';
import { Alert, Button, Col, Row, Space, Tag, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { userApi } from '@/services/api';

const { Paragraph } = Typography;

export default function Dashboard() {
  const intl = useIntl();
  const [balance, setBalance] = useState<API.Balance | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);

  const [stats, setStats] = useState<API.UsageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // 避免切到别的标签页又快速回来时重复拉：5s 内的二次 focus 忽略
  const lastLoadAt = useRef(0);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastLoadAt.current < 5000) return;
    lastLoadAt.current = Date.now();
    setBalLoading(true);
    setStatsLoading(true);
    setBalError(null);
    setStatsError(null);

    try {
      const res = await userApi.balance();
      if (res.code === 0 && res.data) {
        setBalance(res.data);
      } else {
        setBalError(res.message || `code=${res.code}`);
      }
    } catch (e: any) {
      setBalError(e?.message || String(e));
    } finally {
      setBalLoading(false);
    }

    try {
      const res = await userApi.stats();
      if (res.code === 0 && res.data) {
        setStats(res.data);
      } else {
        setStatsError(res.message || `code=${res.code}`);
      }
    } catch (e: any) {
      setStatsError(e?.message || String(e));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const onFocus = () => load(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const trendData = (stats?.daily_trend ?? []).map((p: API.DailyPoint) => ({
    day: p.day,
    tokens: Number(p.tokens),
    requests: Number(p.requests),
    cost: Number(p.usd_cost),
  }));
  const modelData = (stats?.by_model ?? []).map((m: API.GroupItem) => ({
    type: m.key || intl.formatMessage({ id: 'dashboard.unknownModel' }),
    value: Number(m.requests),
  }));

  const hasBalance = !!balance;
  const displayCurrency = balance?.display_currency || 'USD';

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'dashboard.title' })}
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={balLoading || statsLoading}
            onClick={() => load(true)}
          >
            {intl.formatMessage({ id: 'dashboard.refresh' })}
          </Button>
        </Space>
      }
    >
      {(balError || statsError) && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={intl.formatMessage(
            { id: 'dashboard.loadFailed' },
            { error: balError || statsError },
          )}
          action={
            <Button size="small" onClick={() => load(true)}>
              {intl.formatMessage({ id: 'dashboard.retry' })}
            </Button>
          }
        />
      )}

      <ProCard gutter={16} wrap loading={balLoading && !hasBalance}>
        <StatisticCard
          colSpan={{ xs: 24, md: 12 }}
          statistic={{
            title: intl.formatMessage(
              { id: 'dashboard.balanceTitle' },
              { currency: displayCurrency },
            ),
            value: hasBalance ? balance!.display_amount : '—',
            suffix: hasBalance ? displayCurrency : '',
            description: hasBalance ? (
              <span style={{ fontSize: 12, color: '#999' }}>
                = {balance!.balance_quota.toLocaleString()}{' '}
                {intl.formatMessage({ id: 'dashboard.quotaInternalUnit' })}
                {balance!.display_currency !== 'USD' && <> · ≈ ${balance!.usd_amount}</>}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#c00' }}>
                {intl.formatMessage({ id: 'dashboard.balanceEmpty' })}
              </span>
            ),
          }}
        />
        <StatisticCard
          colSpan={{ xs: 24, md: 12 }}
          statistic={{
            title: intl.formatMessage(
              { id: 'dashboard.exchangeRateTitle' },
              { currency: displayCurrency },
            ),
            value: balance?.exchange_rate ?? '—',
            description: (
              <span style={{ fontSize: 12, color: '#999' }}>
                1 USD = {balance?.exchange_rate ?? '—'} {displayCurrency}
              </span>
            ),
          }}
        />
      </ProCard>

      <ProCard gutter={16} wrap style={{ marginTop: 16 }} loading={statsLoading && !stats}>
        <StatisticCard
          colSpan={{ xs: 24, md: 8 }}
          statistic={{
            title: intl.formatMessage({ id: 'dashboard.todayRequests' }),
            value: stats?.today.requests ?? 0,
            description: (
              <span style={{ fontSize: 12, color: '#999' }}>
                {intl.formatMessage(
                  { id: 'dashboard.successFailure' },
                  {
                    success: stats?.today.success ?? 0,
                    failure: stats?.today.failure ?? 0,
                  },
                )}
              </span>
            ),
          }}
        />
        <StatisticCard
          colSpan={{ xs: 24, md: 8 }}
          statistic={{
            title: intl.formatMessage({ id: 'dashboard.todayTokens' }),
            value: stats?.today.total_tokens ?? 0,
            description: (
              <span style={{ fontSize: 12, color: '#999' }}>
                ≈ ${stats?.today.usd_cost ?? 0}
              </span>
            ),
          }}
        />
        <StatisticCard
          colSpan={{ xs: 24, md: 8 }}
          statistic={{
            title: intl.formatMessage({ id: 'dashboard.monthTotal' }),
            value: `$${stats?.month.usd_cost ?? 0}`,
            description: (
              <span style={{ fontSize: 12, color: '#999' }}>
                {intl.formatMessage(
                  { id: 'dashboard.tokensCount' },
                  { tokens: stats?.month.total_tokens ?? 0 },
                )}
              </span>
            ),
          }}
        />
      </ProCard>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} md={16}>
          <ProCard
            title={intl.formatMessage({ id: 'dashboard.trendTitle' })}
            loading={statsLoading && !stats}
            bodyStyle={{ padding: 8 }}
          >
            {trendData.length > 0 ? (
              <Area
                autoFit
                height={260}
                data={trendData}
                xField="day"
                yField="tokens"
                shapeField="smooth"
                style={{ fill: 'linear-gradient(-90deg, white 0%, #5b9dff 100%)' }}
              />
            ) : (
              <Alert
                type="info"
                showIcon
                message={intl.formatMessage({ id: 'dashboard.noUsageData' })}
              />
            )}
          </ProCard>
        </Col>
        <Col xs={24} md={8}>
          <ProCard
            title={intl.formatMessage({ id: 'dashboard.modelDistribution' })}
            loading={statsLoading && !stats}
            bodyStyle={{ padding: 8 }}
          >
            {modelData.length > 0 ? (
              <Pie
                autoFit
                height={260}
                data={modelData}
                angleField="value"
                colorField="type"
                radius={0.9}
                innerRadius={0.5}
                legend={{ color: { position: 'bottom' } }}
                label={{ text: 'type', position: 'outside' }}
              />
            ) : (
              <div style={{ padding: 20, color: '#999', textAlign: 'center' }}>
                {intl.formatMessage({ id: 'common.noData' })}
              </div>
            )}
          </ProCard>
        </Col>
      </Row>

      <ProCard title={intl.formatMessage({ id: 'dashboard.usageGuide' })} style={{ marginTop: 16 }}>
        <Alert
          message={
            <>
              {intl.formatMessage({ id: 'dashboard.guideBefore' })}{' '}
              <a href="/console/tokens">API Key</a>{' '}
              {intl.formatMessage({ id: 'dashboard.guideAfter' })}
            </>
          }
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
        />
        <Paragraph copyable code>
          {`curl -N -X POST http://localhost:8080/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"stream":true}'`}
        </Paragraph>
        <div>
          {intl.formatMessage({ id: 'dashboard.availableModels' })}
          <Tag>gpt-4o-mini</Tag>
          <Tag>deepseek-chat</Tag>
          <Tag>glm-4-flash</Tag>
          <Tag>moonshot-v1-8k</Tag>
          {intl.formatMessage({ id: 'dashboard.moreSee' })}{' '}
          <a href="/models">{intl.formatMessage({ id: 'dashboard.modelMarket' })}</a>
        </div>
      </ProCard>
    </PageContainer>
  );
}
