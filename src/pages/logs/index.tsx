import { PageContainer, ProTable } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import { Tag } from 'antd';
import { useState } from 'react';
import SummaryBar, { SummaryStat } from '@/components/SummaryBar';
import { userApi } from '@/services/api';

export default function Logs() {
  const intl = useIntl();
  // summary 跟随 ProTable 每次 request 一起刷新。loading 用独立 state 而不是复用 ProTable 的,
  // 避免引入 actionRef + onLoad 把 request 拆成两半(与 admin UsageLogTable 同一做法)。
  const [summary, setSummary] = useState<API.UsageLogSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const successRate =
    summary && summary.requests > 0
      ? `${((summary.success / summary.requests) * 100).toFixed(1)}%`
      : '—';
  const stats: SummaryStat[] = [
    {
      label: intl.formatMessage({ id: 'logs.index.statRequests' }),
      value: summary?.requests ?? 0,
      hint: summary
        ? intl.formatMessage(
            { id: 'logs.index.statRequestsHint' },
            { success: summary.success, failure: summary.failure },
          )
        : undefined,
    },
    {
      label: intl.formatMessage({ id: 'logs.index.statSuccessRate' }),
      value: successRate,
      tone:
        summary && summary.requests > 0 && summary.failure / summary.requests > 0.1
          ? 'danger'
          : 'success',
    },
    { label: intl.formatMessage({ id: 'logs.index.statTotalTokens' }), value: summary?.total_tokens ?? 0 },
    { label: intl.formatMessage({ id: 'logs.index.statAvgLatency' }), value: summary ? `${summary.avg_latency_ms}ms` : '—' },
    { label: intl.formatMessage({ id: 'logs.index.statUsd' }), value: summary ? `$${summary.usd_cost}` : '—' },
  ];

  return (
    <PageContainer title={intl.formatMessage({ id: 'logs.index.title' })}>
      <SummaryBar stats={stats} loading={summaryLoading && !summary} />
      <ProTable<API.UsageLog>
        rowKey="id"
        request={async (params) => {
          const filters = {
            page: params.current,
            size: params.pageSize,
            model: params.model,
            status: params.status,
            since: params.since,
            until: params.until,
          };
          setSummaryLoading(true);
          const [listRes, sumRes] = await Promise.all([
            userApi.logs(filters),
            userApi.logsSummary(filters).catch(() => null),
          ]);
          setSummaryLoading(false);
          if (sumRes?.code === 0 && sumRes.data) setSummary(sumRes.data);
          return {
            data: listRes.data?.list ?? [],
            total: listRes.data?.total ?? 0,
            success: listRes.code === 0,
          };
        }}
        columns={[
          { title: intl.formatMessage({ id: 'logs.index.colTime' }), dataIndex: 'created_at', valueType: 'dateTime', search: false, width: 170 },
          {
            title: intl.formatMessage({ id: 'logs.index.colTokenKey' }),
            dataIndex: 'token_key',
            search: false,
            render: (_, row) => row.token_key || (row.token_id ? `#${row.token_id}` : '-'),
          },
          { title: intl.formatMessage({ id: 'logs.index.colModel' }), dataIndex: 'model' },
          { title: intl.formatMessage({ id: 'logs.index.colChannel' }), dataIndex: 'channel_name', search: false },
          { title: intl.formatMessage({ id: 'logs.index.colInput' }), dataIndex: 'prompt_tokens', search: false },
          { title: intl.formatMessage({ id: 'logs.index.colOutput' }), dataIndex: 'completion_tokens', search: false },
          { title: intl.formatMessage({ id: 'logs.index.colLatency' }), dataIndex: 'latency_ms', search: false },
          { title: 'Quota', dataIndex: 'quota_cost', search: false },
          {
            title: intl.formatMessage({ id: 'logs.index.colCost' }),
            search: false,
            render: (_, row) =>
              row.display_cost ? `${row.display_cost} ${row.display_currency}` : `$${row.usd_cost}`,
          },
          {
            title: intl.formatMessage({ id: 'logs.index.colStream' }),
            dataIndex: 'stream',
            search: false,
            render: (v) => (v ? <Tag color="blue">SSE</Tag> : <Tag>{intl.formatMessage({ id: 'logs.index.streamOnce' })}</Tag>),
          },
          {
            title: intl.formatMessage({ id: 'logs.index.colStatus' }),
            dataIndex: 'status',
            valueEnum: {
              1: { text: intl.formatMessage({ id: 'logs.index.statusSuccess' }), status: 'Success' },
              0: { text: intl.formatMessage({ id: 'logs.index.statusFailure' }), status: 'Error' },
            },
          },
          { title: intl.formatMessage({ id: 'logs.index.colSince' }), dataIndex: 'since', valueType: 'dateTime', hideInTable: true },
          { title: intl.formatMessage({ id: 'logs.index.colUntil' }), dataIndex: 'until', valueType: 'dateTime', hideInTable: true },
        ]}
        expandable={{
          expandedRowRender: (row) => (
            <div style={{ fontSize: 12, color: '#666' }}>
              <div>trace_id: {row.trace_id || '-'}</div>
              {row.error_msg && (
                <div style={{ color: '#cf1322' }}>error: {row.error_msg}</div>
              )}
            </div>
          ),
        }}
      />
    </PageContainer>
  );
}
