// SummaryBar 给 logs / 充值订单 / 账单流水 三页的列表头部显示一行 mini 统计 —
// 数字跟随当前 ProTable 筛选条件实时刷新。设计与 admin LogSummaryBar 一致:
//
//   - 不用 antd 的 <Statistic>:它默认是大字号 + 块状结构,占垂直空间太多;手写一行
//     inline 元素,xs 下自动换行。
//   - tone:default/success/danger,给数字一抹绿/红(常见于"成功率""失败""消费"),
//     其它默认黑色 — 不再多色。
//   - loading 时数字位替换为 Skeleton,别人一看就知道在拉。
//   - hint 字段塞在数字下面一行(小字灰色),用于次级补充信息(如"成功 1200 · 失败 34")。
//
// admin 那边叫 LogSummaryBar,这里改名 SummaryBar 是因为本组件不再局限于日志页 —
// 账单流水、充值订单也用它,改名避免误导。

import { Card, Skeleton, Typography } from 'antd';

const { Text } = Typography;

export interface SummaryStat {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'success' | 'danger';
}

export interface SummaryBarProps {
  stats: SummaryStat[];
  loading?: boolean;
}

const toneColor: Record<NonNullable<SummaryStat['tone']>, string> = {
  default: 'inherit',
  success: '#389e0d',
  danger: '#cf1322',
};

export default function SummaryBar({ stats, loading }: SummaryBarProps) {
  return (
    <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: '10px 16px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px 32px',
          alignItems: 'flex-start',
        }}
      >
        {stats.map((s) => (
          <div key={s.label} style={{ minWidth: 100 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {s.label}
            </Text>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: toneColor[s.tone ?? 'default'],
                lineHeight: '24px',
                marginTop: 2,
              }}
            >
              {loading ? (
                <Skeleton.Button active size="small" style={{ width: 60, height: 20 }} />
              ) : (
                s.value
              )}
            </div>
            {s.hint && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {s.hint}
              </Text>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
