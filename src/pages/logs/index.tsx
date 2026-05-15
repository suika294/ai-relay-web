import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { useState } from 'react';
import SummaryBar, { SummaryStat } from '@/components/SummaryBar';
import { userApi } from '@/services/api';

export default function Logs() {
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
      label: '请求数',
      value: summary?.requests ?? 0,
      hint: summary ? `成功 ${summary.success} · 失败 ${summary.failure}` : undefined,
    },
    {
      label: '成功率',
      value: successRate,
      tone:
        summary && summary.requests > 0 && summary.failure / summary.requests > 0.1
          ? 'danger'
          : 'success',
    },
    { label: '总 tokens', value: summary?.total_tokens ?? 0 },
    { label: '平均耗时', value: summary ? `${summary.avg_latency_ms}ms` : '—' },
    { label: 'USD', value: summary ? `$${summary.usd_cost}` : '—' },
  ];

  return (
    <PageContainer title="使用日志">
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
          { title: '时间', dataIndex: 'created_at', valueType: 'dateTime', search: false, width: 170 },
          { title: '模型', dataIndex: 'model' },
          { title: '渠道', dataIndex: 'channel_name', search: false },
          { title: '输入', dataIndex: 'prompt_tokens', search: false },
          { title: '输出', dataIndex: 'completion_tokens', search: false },
          { title: '耗时(ms)', dataIndex: 'latency_ms', search: false },
          { title: 'Quota', dataIndex: 'quota_cost', search: false },
          {
            title: '费用',
            search: false,
            render: (_, row) =>
              row.display_cost ? `${row.display_cost} ${row.display_currency}` : `$${row.usd_cost}`,
          },
          {
            title: '流式',
            dataIndex: 'stream',
            search: false,
            render: (v) => (v ? <Tag color="blue">SSE</Tag> : <Tag>一次</Tag>),
          },
          {
            title: '状态',
            dataIndex: 'status',
            valueEnum: {
              1: { text: '成功', status: 'Success' },
              0: { text: '失败', status: 'Error' },
            },
          },
          { title: '开始时间', dataIndex: 'since', valueType: 'dateTime', hideInTable: true },
          { title: '结束时间', dataIndex: 'until', valueType: 'dateTime', hideInTable: true },
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
