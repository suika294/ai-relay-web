import { Table, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { systemApi } from '@/services/api';
import PublicLayout from '@/layouts/PublicLayout';

const { Title, Paragraph } = Typography;

type PublicModel = {
  id: number;
  name: string;
  display_name?: string;
  type: string;
  provider_type: string;
  input_price: string;
  output_price: string;
  max_tokens: number;
};

const providerLabel: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  azure: 'Azure OpenAI',
  kimi: 'Kimi (Moonshot)',
  deepseek: 'DeepSeek',
  glm: 'GLM (Zhipu)',
  xiaomi: '小米 MiMo',
  custom: 'Custom',
};

export default function Pricing() {
  const [list, setList] = useState<PublicModel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    systemApi.models().then((res) => {
      setList((res.data as any) || []);
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, PublicModel[]>();
    for (const it of list) {
      const k = it.provider_type || 'custom';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return m;
  }, [list]);

  const tabs = Array.from(grouped.entries()).map(([k, items]) => ({
    key: k,
    label: providerLabel[k] ?? k,
    children: (
      <Table
        rowKey="id"
        pagination={false}
        loading={loading}
        dataSource={items}
        columns={[
          {
            title: '模型',
            dataIndex: 'name',
            render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.display_name || r.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{r.name}</div>
              </div>
            ),
          },
          {
            title: '类型',
            dataIndex: 'type',
            width: 110,
            render: (v) => <Tag>{v}</Tag>,
          },
          {
            title: '输入价 (USD / 1M tokens)',
            dataIndex: 'input_price',
            align: 'right' as const,
            render: (v) => `$${v}`,
          },
          {
            title: '输出价 (USD / 1M tokens)',
            dataIndex: 'output_price',
            align: 'right' as const,
            render: (v) => `$${v}`,
          },
          {
            title: '上下文',
            dataIndex: 'max_tokens',
            align: 'right' as const,
            width: 120,
            render: (v) => `${v?.toLocaleString?.() ?? v} tokens`,
          },
        ]}
      />
    ),
  }));

  return (
    <PublicLayout>
      <div className="pricing-page">
        <Title level={1} style={{ marginBottom: 12 }}>
          定价
        </Title>
        <Paragraph type="secondary" style={{ fontSize: 16 }}>
          采用 token 按量计费，价格跟随上游厂商。管理员可为渠道设置覆盖价、为用户分组设置倍率。
        </Paragraph>

        <Tabs items={tabs} defaultActiveKey={tabs[0]?.key} style={{ marginTop: 24 }} />

        <Paragraph type="secondary" style={{ marginTop: 24, fontSize: 13 }}>
          * 以上为默认价目，实际扣费可能因渠道覆盖价或用户分组倍率而不同；注册登录后可在控制台查看你的实际倍率。
        </Paragraph>
      </div>
    </PublicLayout>
  );
}
