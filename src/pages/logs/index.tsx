import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { userApi } from '@/services/api';

export default function Logs() {
  return (
    <PageContainer title="使用日志">
      <ProTable<API.UsageLog>
        rowKey="id"
        request={async (params) => {
          const res = await userApi.logs({
            page: params.current,
            size: params.pageSize,
            model: params.model,
            status: params.status,
            since: params.since,
            until: params.until,
          });
          return {
            data: res.data?.list ?? [],
            total: res.data?.total ?? 0,
            success: res.code === 0,
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
