import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { useState } from 'react';
import SummaryBar, { SummaryStat } from '@/components/SummaryBar';
import { billingApi } from '@/services/api';

const typeMap: Record<string, { text: string; color: string }> = {
  recharge: { text: '充值', color: 'green' },
  consume: { text: '消费', color: 'blue' },
  refund: { text: '退款', color: 'orange' },
  redeem: { text: '兑换', color: 'cyan' },
  commission: { text: '返佣', color: 'gold' },
  admin: { text: '管理员调整', color: 'purple' },
};

// 按 type 渲染 SummaryBar 的一格:label 用中文,value 是带符号的 quota 数字,
// 正数绿色(充值/兑换/返佣)、负数红色(消费/退款负值),hint 显示笔数。
// 后端 SUM(quota_amount) 自带符号,所以这里只看符号 tone,不用按 type 硬编码。
function buildRecordStats(s: API.RecordsSummary | null): SummaryStat[] {
  if (!s) {
    return [{ label: '总笔数', value: 0 }];
  }
  // 类型展示顺序固定(避免数据库 GROUP BY 顺序抖动让 UI 闪),与 typeMap 一致
  const order = ['recharge', 'consume', 'refund', 'redeem', 'commission', 'admin'];
  const byType = new Map(s.by_type.map((it) => [it.type, it]));
  const stats: SummaryStat[] = [{ label: '总笔数', value: s.total }];
  for (const t of order) {
    const it = byType.get(t);
    if (!it) continue;
    const m = typeMap[t] ?? { text: t, color: 'default' };
    const q = it.quota_total;
    const sign = q > 0 ? '+' : '';
    stats.push({
      label: m.text,
      value: `${sign}${q.toLocaleString()}`,
      hint: `${it.count} 笔`,
      tone: q > 0 ? 'success' : q < 0 ? 'danger' : 'default',
    });
  }
  // 兜底:出现 order 之外的 type(后端将来加新枚举),也显示出来
  for (const it of s.by_type) {
    if (order.includes(it.type)) continue;
    const q = it.quota_total;
    const sign = q > 0 ? '+' : '';
    stats.push({
      label: it.type,
      value: `${sign}${q.toLocaleString()}`,
      hint: `${it.count} 笔`,
      tone: q > 0 ? 'success' : q < 0 ? 'danger' : 'default',
    });
  }
  return stats;
}

export default function Records() {
  const [summary, setSummary] = useState<API.RecordsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  return (
    <PageContainer title="账单流水">
      <SummaryBar stats={buildRecordStats(summary)} loading={summaryLoading && !summary} />
      <ProTable<API.BillingRecord>
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        request={async (params) => {
          const filters = {
            page: params.current,
            size: params.pageSize,
            type: params.type,
            since: params.since,
            until: params.until,
          };
          setSummaryLoading(true);
          const [listRes, sumRes] = await Promise.all([
            billingApi.records(filters),
            billingApi
              .recordsSummary({ type: filters.type, since: filters.since, until: filters.until })
              .catch(() => null),
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
          { title: '时间', dataIndex: 'created_at', valueType: 'dateTime', search: false },
          {
            title: '类型',
            dataIndex: 'type',
            valueEnum: Object.fromEntries(
              Object.entries(typeMap).map(([k, v]) => [k, { text: v.text }]),
            ),
            render: (_, row) => {
              const m = typeMap[row.type] ?? { text: row.type, color: 'default' };
              return <Tag color={m.color}>{m.text}</Tag>;
            },
          },
          {
            title: 'Quota 变动',
            dataIndex: 'quota_amount',
            search: false,
            render: (v) => {
              const n = Number(v);
              return (
                <span style={{ color: n >= 0 ? '#389e0d' : '#cf1322' }}>
                  {n > 0 ? `+${n}` : n}
                </span>
              );
            },
          },
          {
            title: '展示金额',
            search: false,
            render: (_, row) =>
              row.display_amount ? `${row.display_amount} ${row.display_currency}` : `$${row.usd_amount}`,
          },
          { title: '余额（后）', dataIndex: 'balance_quota_after', search: false },
          { title: '支付方式', dataIndex: 'payment_method', search: false },
          { title: '关联', dataIndex: 'ref_id', ellipsis: true, search: false },
          { title: '备注', dataIndex: 'remark', ellipsis: true, search: false },
          { title: '开始时间', dataIndex: 'since', valueType: 'dateTime', hideInTable: true },
          { title: '结束时间', dataIndex: 'until', valueType: 'dateTime', hideInTable: true },
        ]}
      />
    </PageContainer>
  );
}
