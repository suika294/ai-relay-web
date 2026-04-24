import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { billingApi } from '@/services/api';

const typeMap: Record<string, { text: string; color: string }> = {
  recharge: { text: '充值', color: 'green' },
  consume: { text: '消费', color: 'blue' },
  refund: { text: '退款', color: 'orange' },
  redeem: { text: '兑换', color: 'cyan' },
  commission: { text: '返佣', color: 'gold' },
  admin: { text: '管理员调整', color: 'purple' },
};

export default function Records() {
  return (
    <PageContainer title="账单流水">
      <ProTable<API.BillingRecord>
        rowKey="id"
        search={false}
        request={async (params) => {
          const res = await billingApi.records({ page: params.current, size: params.pageSize });
          return {
            data: res.data?.list ?? [],
            total: res.data?.total ?? 0,
            success: res.code === 0,
          };
        }}
        columns={[
          { title: '时间', dataIndex: 'created_at', valueType: 'dateTime' },
          {
            title: '类型',
            dataIndex: 'type',
            render: (_, row) => {
              const m = typeMap[row.type] ?? { text: row.type, color: 'default' };
              return <Tag color={m.color}>{m.text}</Tag>;
            },
          },
          {
            title: 'Quota 变动',
            dataIndex: 'quota_amount',
            render: (v) => {
              const n = Number(v);
              return <span style={{ color: n >= 0 ? '#389e0d' : '#cf1322' }}>{n > 0 ? `+${n}` : n}</span>;
            },
          },
          {
            title: '展示金额',
            render: (_, row) =>
              row.display_amount ? `${row.display_amount} ${row.display_currency}` : `$${row.usd_amount}`,
          },
          { title: '余额（后）', dataIndex: 'balance_quota_after' },
          { title: '支付方式', dataIndex: 'payment_method' },
          { title: '关联', dataIndex: 'ref_id', ellipsis: true },
          { title: '备注', dataIndex: 'remark', ellipsis: true },
        ]}
      />
    </PageContainer>
  );
}
