import { PageContainer, ProTable } from '@ant-design/pro-components';
import { DownloadOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { t } from '@/utils/i18n';
import SummaryBar, { SummaryStat } from '@/components/SummaryBar';
import { billingApi } from '@/services/api';
import { downloadCSV } from '@/utils/download';

const typeMap: Record<string, { text: string; color: string }> = {
  recharge: { text: t('billing.records.typeRecharge'), color: 'green' },
  consume: { text: t('billing.records.typeConsume'), color: 'blue' },
  refund: { text: t('billing.records.typeRefund'), color: 'orange' },
  redeem: { text: t('billing.records.typeRedeem'), color: 'cyan' },
  commission: { text: t('billing.records.typeCommission'), color: 'gold' },
  admin: { text: t('billing.records.typeAdmin'), color: 'purple' },
};

// 按 type 渲染 SummaryBar 的一格:label 用中文,value 是带符号的 quota 数字,
// 正数绿色(充值/兑换/返佣)、负数红色(消费/退款负值),hint 显示笔数。
// 后端 SUM(quota_amount) 自带符号,所以这里只看符号 tone,不用按 type 硬编码。
function buildRecordStats(s: API.RecordsSummary | null): SummaryStat[] {
  if (!s) {
    return [{ label: t('billing.records.totalCount'), value: 0 }];
  }
  // 类型展示顺序固定(避免数据库 GROUP BY 顺序抖动让 UI 闪),与 typeMap 一致
  const order = ['recharge', 'consume', 'refund', 'redeem', 'commission', 'admin'];
  // by_type 可能为 null(后端无记录时 GROUP BY 出 0 行,JSON 序列化成 null)
  const byTypeList = s.by_type ?? [];
  const byType = new Map(byTypeList.map((it) => [it.type, it]));
  const stats: SummaryStat[] = [{ label: t('billing.records.totalCount'), value: s.total }];
  for (const t2 of order) {
    const it = byType.get(t2);
    if (!it) continue;
    const m = typeMap[t2] ?? { text: t2, color: 'default' };
    const q = it.quota_total;
    const sign = q > 0 ? '+' : '';
    stats.push({
      label: m.text,
      value: `${sign}${q.toLocaleString()}`,
      hint: t('billing.records.countSuffix', { count: it.count }),
      tone: q > 0 ? 'success' : q < 0 ? 'danger' : 'default',
    });
  }
  // 兜底:出现 order 之外的 type(后端将来加新枚举),也显示出来
  for (const it of byTypeList) {
    if (order.includes(it.type)) continue;
    const q = it.quota_total;
    const sign = q > 0 ? '+' : '';
    stats.push({
      label: it.type,
      value: `${sign}${q.toLocaleString()}`,
      hint: t('billing.records.countSuffix', { count: it.count }),
      tone: q > 0 ? 'success' : q < 0 ? 'danger' : 'default',
    });
  }
  return stats;
}

export default function Records() {
  const intl = useIntl();
  const [summary, setSummary] = useState<API.RecordsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  // 记住列表当前生效的筛选(类型 + 时间窗),导出按钮据此导出"当前筛选"的全部流水。
  const lastFilters = useRef<Record<string, any>>({});

  return (
    <PageContainer title={intl.formatMessage({ id: 'billing.records.title' })}>
      <SummaryBar stats={buildRecordStats(summary)} loading={summaryLoading && !summary} />
      <ProTable<API.BillingRecord>
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        toolBarRender={() => [
          <Button
            key="export"
            icon={<DownloadOutlined />}
            onClick={() => downloadCSV('/api/v1/user/billing/records/export', lastFilters.current)}
          >
            {intl.formatMessage({ id: 'common.exportCsv' })}
          </Button>,
        ]}
        request={async (params) => {
          const filters = {
            page: params.current,
            size: params.pageSize,
            type: params.type,
            since: params.since,
            until: params.until,
          };
          lastFilters.current = filters;
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
          {
            title: intl.formatMessage({ id: 'billing.records.colTime' }),
            dataIndex: 'created_at',
            valueType: 'dateTime',
            search: false,
          },
          {
            title: intl.formatMessage({ id: 'billing.records.colType' }),
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
            title: intl.formatMessage({ id: 'billing.records.colQuotaChange' }),
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
            title: intl.formatMessage({ id: 'billing.records.colDisplayAmount' }),
            search: false,
            render: (_, row) =>
              row.display_amount ? `${row.display_amount} ${row.display_currency}` : `$${row.usd_amount}`,
          },
          {
            title: intl.formatMessage({ id: 'billing.records.colBalanceAfter' }),
            dataIndex: 'balance_quota_after',
            search: false,
          },
          {
            title: intl.formatMessage({ id: 'billing.records.colPaymentMethod' }),
            dataIndex: 'payment_method',
            search: false,
          },
          {
            title: intl.formatMessage({ id: 'billing.records.colRef' }),
            dataIndex: 'ref_id',
            ellipsis: true,
            search: false,
          },
          {
            title: intl.formatMessage({ id: 'billing.records.colRemark' }),
            dataIndex: 'remark',
            ellipsis: true,
            search: false,
          },
          {
            title: intl.formatMessage({ id: 'billing.records.colSince' }),
            dataIndex: 'since',
            valueType: 'dateTime',
            hideInTable: true,
          },
          {
            title: intl.formatMessage({ id: 'billing.records.colUntil' }),
            dataIndex: 'until',
            valueType: 'dateTime',
            hideInTable: true,
          },
        ]}
      />
    </PageContainer>
  );
}
