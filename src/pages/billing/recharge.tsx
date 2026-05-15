import {
  ModalForm,
  PageContainer,
  ProCard,
  ProFormDigit,
  ProFormRadio,
  ProFormSelect,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { GiftOutlined, WalletOutlined } from '@ant-design/icons';
import {
  Button,
  Descriptions,
  Divider,
  Input,
  message,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useRef, useState } from 'react';
import SummaryBar, { SummaryStat } from '@/components/SummaryBar';
import { billingApi } from '@/services/api';

export default function Recharge() {
  const orderRef = useRef<ActionType>();

  // 订单 SummaryBar:与 ProTable 同源时间窗,每次 request 时与 listOrders 并行调。
  const [summary, setSummary] = useState<API.OrderSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const summaryStats: SummaryStat[] = [
    {
      label: '总订单',
      value: summary?.total ?? 0,
      hint: summary ? `待支付 ${summary.pending} · 已退款 ${summary.refunded}` : undefined,
    },
    {
      label: '已支付',
      value: summary?.paid ?? 0,
      tone: 'success',
    },
    {
      label: '失败 / 取消',
      value: summary ? summary.failed + summary.canceled : 0,
      tone: summary && summary.failed + summary.canceled > 0 ? 'danger' : 'default',
    },
    { label: '已支付 USD', value: summary ? `$${summary.paid_usd}` : '—' },
    { label: '已支付 Quota', value: summary?.paid_quota ?? 0 },
  ];

  // ---- 充值（走 ModalForm）----
  const handlePay = async (values: { amount: number; currency: string; method: string }) => {
    const res = await billingApi.createRecharge({
      amount: String(values.amount),
      currency: values.currency,
      method: values.method,
    });
    if (res.code !== 0 || !res.data) return false;
    if (res.data.pay_url) {
      window.open(res.data.pay_url, '_blank');
    } else {
      Modal.info({
        title: '订单已创建',
        width: 520,
        content: (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="订单号">{res.data.order_no}</Descriptions.Item>
            <Descriptions.Item label="折合 USD">${res.data.usd_amount}</Descriptions.Item>
            <Descriptions.Item label="折算 Quota">{res.data.quota_amount}</Descriptions.Item>
            <Descriptions.Item label="汇率">{res.data.exchange_rate}</Descriptions.Item>
            {values.method === 'manual' && (
              <Descriptions.Item label="提示">等待管理员手动确认入账</Descriptions.Item>
            )}
          </Descriptions>
        ),
      });
    }
    orderRef.current?.reload();
    return true;
  };

  // ---- 兑换弹窗（自管 state，因为要塞输入框 + 历史表，不适合 ModalForm）----
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const redeemTableRef = useRef<ActionType>();

  const submitRedeem = async () => {
    const c = code.trim();
    if (!c) {
      message.warning('请输入兑换码');
      return;
    }
    setRedeeming(true);
    try {
      const res = await billingApi.redeem(c);
      if (res.code === 0 && res.data) {
        message.success(`兑换成功，+${res.data.quota_amount} quota`);
        setCode('');
        redeemTableRef.current?.reload();
      }
    } finally {
      setRedeeming(false);
    }
  };

  const headerActions = (
    <Space>
      <ModalForm<{ amount: number; currency: string; method: string }>
        title="新建充值订单"
        width={480}
        trigger={
          <Button type="primary" icon={<WalletOutlined />}>
            充值
          </Button>
        }
        modalProps={{ destroyOnClose: true }}
        initialValues={{ amount: 100, currency: 'CNY', method: 'manual' }}
        onFinish={handlePay}
      >
        <ProFormDigit
          name="amount"
          label="金额"
          min={0.01}
          fieldProps={{ step: 10 }}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="currency"
          label="币种"
          options={['USD', 'CNY', 'EUR', 'JPY', 'GBP'].map((c) => ({ value: c, label: c }))}
          rules={[{ required: true }]}
        />
        <ProFormRadio.Group
          name="method"
          label="支付方式"
          // Stripe 后端尚未实现(internal/pkg/payment/stripe.go 直接 not implemented),
          // UI 暂不暴露,避免用户选了 Stripe 走到 502。后端补齐后再加回选项。
          options={[
            { value: 'manual', label: 'Manual（手动确认）' },
            { value: 'alipay', label: '支付宝' },
            { value: 'wechat', label: '微信' },
          ]}
          rules={[{ required: true }]}
        />
      </ModalForm>
      <Button icon={<GiftOutlined />} onClick={() => setRedeemOpen(true)}>
        兑换
      </Button>
    </Space>
  );

  return (
    <PageContainer ghost header={{ title: '' }}>
      <SummaryBar stats={summaryStats} loading={summaryLoading && !summary} />
      <ProCard
        title="充值订单"
        extra={headerActions}
        headerBordered
        bodyStyle={{ padding: 0 }}
      >
        <ProTable<API.RechargeOrder>
          rowKey="id"
          actionRef={orderRef}
          search={{ labelWidth: 'auto' }}
          ghost
          request={async (params) => {
            const filters = {
              page: params.current,
              size: params.pageSize,
              since: params.since,
              until: params.until,
            };
            setSummaryLoading(true);
            const [listRes, sumRes] = await Promise.all([
              billingApi.listOrders(filters),
              billingApi.ordersSummary({ since: filters.since, until: filters.until }).catch(
                () => null,
              ),
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
              title: '订单号',
              dataIndex: 'order_no',
              ellipsis: true,
              copyable: true,
              width: 260,
              search: false,
            },
            { title: '金额', search: false, render: (_, r) => `${r.amount} ${r.currency}` },
            { title: 'Quota', dataIndex: 'quota_amount', search: false },
            { title: '支付方式', dataIndex: 'payment_method', search: false },
            {
              title: '状态',
              dataIndex: 'status',
              search: false,
              valueEnum: {
                0: { text: '待支付', status: 'Default' },
                1: { text: '已支付', status: 'Success' },
                2: { text: '已退款', status: 'Warning' },
                3: { text: '已取消', status: 'Default' },
                4: { text: '失败', status: 'Error' },
              },
            },
            { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', search: false },
            { title: '开始时间', dataIndex: 'since', valueType: 'dateTime', hideInTable: true },
            { title: '结束时间', dataIndex: 'until', valueType: 'dateTime', hideInTable: true },
          ]}
        />
      </ProCard>

      {/* 兑换弹窗：顶部输入 + 提交；下面是历史列表（首次打开懒加载） */}
      <Modal
        title={
          <Space>
            <GiftOutlined />
            <span>兑换码</span>
          </Space>
        }
        open={redeemOpen}
        onCancel={() => setRedeemOpen(false)}
        footer={null}
        width={640}
        destroyOnHidden
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="粘贴客服或邀请人给你的兑换码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onPressEnter={submitRedeem}
            size="large"
            allowClear
          />
          <Button
            type="primary"
            size="large"
            loading={redeeming}
            onClick={submitRedeem}
          >
            立即兑换
          </Button>
        </Space.Compact>

        <Divider orientation="left" plain style={{ marginTop: 20 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            兑换历史
          </Typography.Text>
        </Divider>

        <ProTable<API.BillingRecord>
          rowKey="id"
          actionRef={redeemTableRef}
          search={false}
          options={false}
          ghost
          size="small"
          request={async (params) => {
            const res = await billingApi.records({
              page: params.current,
              size: params.pageSize,
              type: 'redeem',
            });
            return {
              data: res.data?.list ?? [],
              total: res.data?.total ?? 0,
              success: res.code === 0,
            };
          }}
          columns={[
            {
              title: '兑换码',
              dataIndex: 'ref_id',
              copyable: true,
              ellipsis: true,
              render: (_, r) => (r.ref_id ? <Tag color="cyan">{r.ref_id}</Tag> : '-'),
            },
            {
              title: '增加 Quota',
              dataIndex: 'quota_amount',
              render: (_, r) => {
                const n = Number(r.quota_amount) || 0;
                const color = n > 0 ? '#389e0d' : n < 0 ? '#cf1322' : undefined;
                const sign = n > 0 ? '+' : ''; // 负数本身带 '-'，不用再拼
                return (
                  <span style={{ color }}>
                    {sign}
                    {n.toLocaleString()}
                  </span>
                );
              },
            },
            { title: '时间', dataIndex: 'created_at', valueType: 'dateTime' },
          ]}
          pagination={{ pageSize: 5, showSizeChanger: false, simple: true }}
        />
      </Modal>
    </PageContainer>
  );
}
