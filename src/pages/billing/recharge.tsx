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
import { DownloadOutlined, GiftOutlined, WalletOutlined } from '@ant-design/icons';
import {
  Button,
  Descriptions,
  Divider,
  Input,
  message,
  Modal,
  QRCode,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import SummaryBar, { SummaryStat } from '@/components/SummaryBar';
import { billingApi } from '@/services/api';
import { downloadCSV } from '@/utils/download';

export default function Recharge() {
  const intl = useIntl();
  const orderRef = useRef<ActionType>();
  // 记住订单列表当前生效的筛选(时间窗),导出按钮据此导出"当前筛选"的全部订单。
  const lastOrderFilters = useRef<Record<string, any>>({});

  // 订单 SummaryBar:与 ProTable 同源时间窗,每次 request 时与 listOrders 并行调。
  const [summary, setSummary] = useState<API.OrderSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const summaryStats: SummaryStat[] = [
    {
      label: intl.formatMessage({ id: 'billing.recharge.summary.total' }),
      value: summary?.total ?? 0,
      hint: summary
        ? intl.formatMessage(
            { id: 'billing.recharge.summary.totalHint' },
            { pending: summary.pending, refunded: summary.refunded },
          )
        : undefined,
    },
    {
      label: intl.formatMessage({ id: 'billing.recharge.summary.paid' }),
      value: summary?.paid ?? 0,
      tone: 'success',
    },
    {
      label: intl.formatMessage({ id: 'billing.recharge.summary.failedCanceled' }),
      value: summary ? summary.failed + summary.canceled : 0,
      tone: summary && summary.failed + summary.canceled > 0 ? 'danger' : 'default',
    },
    { label: intl.formatMessage({ id: 'billing.recharge.summary.paidUsd' }), value: summary ? `$${summary.paid_usd}` : '—' },
    { label: intl.formatMessage({ id: 'billing.recharge.summary.paidQuota' }), value: summary?.paid_quota ?? 0 },
  ];

  // ---- 微信扫码弹窗（受控，便于轮询查单后自动关闭）----
  type WxPay = {
    qr: string;
    order: { order_no: string; usd_amount: string; quota_amount: number };
  };
  const [wxPay, setWxPay] = useState<WxPay | null>(null);

  // 弹窗打开后轮询查单：上游确认已支付(status===1)就自动关窗 + 刷新列表。
  // 不依赖异步回调，本地无公网回调也能确认。组件卸载 / 关窗时清掉定时器。
  useEffect(() => {
    if (!wxPay) return;
    const orderNo = wxPay.order.order_no;
    const timer = setInterval(async () => {
      try {
        const r = await billingApi.queryOrderStatus(orderNo);
        if (r.code === 0 && r.data?.status === 1) {
          clearInterval(timer);
          setWxPay(null);
          message.success(intl.formatMessage({ id: 'billing.recharge.paySuccessToast' }));
          orderRef.current?.reload();
        }
      } catch {
        // 查单偶发失败不打断轮询，下个 tick 再试
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [wxPay]);

  // ---- 充值（走 ModalForm）----
  const handlePay = async (values: { amount: number; currency: string; method: string }) => {
    const res = await billingApi.createRecharge({
      amount: String(values.amount),
      currency: values.currency,
      method: values.method,
    });
    if (res.code !== 0 || !res.data) return false;
    if (res.data.pay_url) {
      // 支付宝 PC 网页:直接跳上游收银台
      window.open(res.data.pay_url, '_blank');
    } else if (res.data.qr_code) {
      // 微信 Native:qr_code 是 weixin:// 深链,渲染成二维码 + 轮询查单（见 wxPay 弹窗）
      setWxPay({
        qr: res.data.qr_code,
        order: {
          order_no: res.data.order_no,
          usd_amount: res.data.usd_amount,
          quota_amount: res.data.quota_amount,
        },
      });
    } else {
      Modal.info({
        title: intl.formatMessage({ id: 'billing.recharge.orderCreatedTitle' }),
        width: 520,
        content: (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.orderNo' })}>{res.data.order_no}</Descriptions.Item>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.usd' })}>${res.data.usd_amount}</Descriptions.Item>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.quota' })}>{res.data.quota_amount}</Descriptions.Item>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.exchangeRate' })}>{res.data.exchange_rate}</Descriptions.Item>
            {values.method === 'manual' && (
              <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.note' })}>{intl.formatMessage({ id: 'billing.recharge.manualConfirmNote' })}</Descriptions.Item>
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
      message.warning(intl.formatMessage({ id: 'billing.recharge.redeemEmptyWarning' }));
      return;
    }
    setRedeeming(true);
    try {
      const res = await billingApi.redeem(c);
      if (res.code === 0 && res.data) {
        message.success(intl.formatMessage({ id: 'billing.recharge.redeemSuccessToast' }, { amount: res.data.quota_amount }));
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
        title={intl.formatMessage({ id: 'billing.recharge.newOrderTitle' })}
        width={480}
        trigger={
          <Button type="primary" icon={<WalletOutlined />}>
            {intl.formatMessage({ id: 'billing.recharge.rechargeBtn' })}
          </Button>
        }
        modalProps={{ destroyOnClose: true }}
        initialValues={{ amount: 100, currency: 'CNY', method: 'wechat' }}
        onFinish={handlePay}
      >
        <ProFormDigit
          name="amount"
          label={intl.formatMessage({ id: 'billing.recharge.field.amount' })}
          min={0.01}
          fieldProps={{ step: 10 }}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="currency"
          label={intl.formatMessage({ id: 'billing.recharge.field.currency' })}
          options={['USD', 'CNY', 'EUR', 'JPY', 'GBP'].map((c) => ({ value: c, label: c }))}
          rules={[{ required: true }]}
        />
        <ProFormRadio.Group
          name="method"
          label={intl.formatMessage({ id: 'billing.recharge.field.method' })}
          // Stripe 后端尚未实现(internal/pkg/payment/stripe.go 直接 not implemented),
          // UI 暂不暴露,避免用户选了 Stripe 走到 502。后端补齐后再加回选项。
          // 目前开放微信 / 支付宝,Manual 先隐藏(需要时把下面一项加回即可)。
          options={[
            // { value: 'manual', label: 'Manual（手动确认）' },
            { value: 'alipay', label: intl.formatMessage({ id: 'billing.recharge.method.alipay' }) },
            { value: 'wechat', label: intl.formatMessage({ id: 'billing.recharge.method.wechat' }) },
          ]}
          rules={[{ required: true }]}
        />
      </ModalForm>
      <Button icon={<GiftOutlined />} onClick={() => setRedeemOpen(true)}>
        {intl.formatMessage({ id: 'billing.recharge.redeemBtn' })}
      </Button>
    </Space>
  );

  return (
    <PageContainer ghost header={{ title: '' }}>
      <SummaryBar stats={summaryStats} loading={summaryLoading && !summary} />
      <ProCard
        title={intl.formatMessage({ id: 'billing.recharge.ordersCardTitle' })}
        extra={headerActions}
        headerBordered
        bodyStyle={{ padding: 0 }}
      >
        <ProTable<API.RechargeOrder>
          rowKey="id"
          actionRef={orderRef}
          search={{ labelWidth: 'auto' }}
          ghost
          toolBarRender={() => [
            <Button
              key="export"
              icon={<DownloadOutlined />}
              onClick={() => downloadCSV('/api/v1/user/recharge/orders/export', lastOrderFilters.current)}
            >
              {intl.formatMessage({ id: 'common.exportCsv' })}
            </Button>,
          ]}
          request={async (params) => {
            const filters = {
              page: params.current,
              size: params.pageSize,
              since: params.since,
              until: params.until,
            };
            lastOrderFilters.current = filters;
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
              title: intl.formatMessage({ id: 'billing.recharge.col.orderNo' }),
              dataIndex: 'order_no',
              ellipsis: true,
              copyable: true,
              width: 260,
              search: false,
            },
            { title: intl.formatMessage({ id: 'billing.recharge.col.amount' }), search: false, render: (_, r) => `${r.amount} ${r.currency}` },
            { title: intl.formatMessage({ id: 'billing.recharge.col.quota' }), dataIndex: 'quota_amount', search: false },
            { title: intl.formatMessage({ id: 'billing.recharge.col.method' }), dataIndex: 'payment_method', search: false },
            {
              title: intl.formatMessage({ id: 'billing.recharge.col.status' }),
              dataIndex: 'status',
              search: false,
              valueEnum: {
                0: { text: intl.formatMessage({ id: 'billing.recharge.status.pending' }), status: 'Default' },
                1: { text: intl.formatMessage({ id: 'billing.recharge.status.paid' }), status: 'Success' },
                2: { text: intl.formatMessage({ id: 'billing.recharge.status.refunded' }), status: 'Warning' },
                3: { text: intl.formatMessage({ id: 'billing.recharge.status.canceled' }), status: 'Default' },
                4: { text: intl.formatMessage({ id: 'billing.recharge.status.failed' }), status: 'Error' },
              },
            },
            { title: intl.formatMessage({ id: 'billing.recharge.col.createdAt' }), dataIndex: 'created_at', valueType: 'dateTime', search: false },
            { title: intl.formatMessage({ id: 'billing.recharge.col.since' }), dataIndex: 'since', valueType: 'dateTime', hideInTable: true },
            { title: intl.formatMessage({ id: 'billing.recharge.col.until' }), dataIndex: 'until', valueType: 'dateTime', hideInTable: true },
          ]}
        />
      </ProCard>

      {/* 微信扫码支付弹窗：渲染二维码 + 后台轮询查单，付款后自动关闭 */}
      <Modal
        title={intl.formatMessage({ id: 'billing.recharge.wxModalTitle' })}
        open={!!wxPay}
        onCancel={() => setWxPay(null)}
        footer={null}
        width={420}
        destroyOnHidden
      >
        {wxPay && (
          <Space direction="vertical" align="center" style={{ width: '100%' }}>
            <QRCode value={wxPay.qr} size={200} />
            <Space size={6}>
              <Spin size="small" />
              <Typography.Text type="secondary">
                {intl.formatMessage({ id: 'billing.recharge.wxScanHint' })}
              </Typography.Text>
            </Space>
            <Descriptions column={1} size="small" bordered style={{ width: '100%' }}>
              <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.orderNo' })}>{wxPay.order.order_no}</Descriptions.Item>
              <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.usd' })}>${wxPay.order.usd_amount}</Descriptions.Item>
              <Descriptions.Item label={intl.formatMessage({ id: 'billing.recharge.field.quota' })}>{wxPay.order.quota_amount}</Descriptions.Item>
            </Descriptions>
          </Space>
        )}
      </Modal>

      {/* 兑换弹窗：顶部输入 + 提交；下面是历史列表（首次打开懒加载） */}
      <Modal
        title={
          <Space>
            <GiftOutlined />
            <span>{intl.formatMessage({ id: 'billing.recharge.redeemModalTitle' })}</span>
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
            placeholder={intl.formatMessage({ id: 'billing.recharge.redeemInputPlaceholder' })}
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
            {intl.formatMessage({ id: 'billing.recharge.redeemNowBtn' })}
          </Button>
        </Space.Compact>

        <Divider orientation="left" plain style={{ marginTop: 20 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {intl.formatMessage({ id: 'billing.recharge.redeemHistory' })}
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
              title: intl.formatMessage({ id: 'billing.recharge.col.redeemCode' }),
              dataIndex: 'ref_id',
              copyable: true,
              ellipsis: true,
              render: (_, r) => (r.ref_id ? <Tag color="cyan">{r.ref_id}</Tag> : '-'),
            },
            {
              title: intl.formatMessage({ id: 'billing.recharge.col.addedQuota' }),
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
            { title: intl.formatMessage({ id: 'billing.recharge.col.time' }), dataIndex: 'created_at', valueType: 'dateTime' },
          ]}
          pagination={{ pageSize: 5, showSizeChanger: false, simple: true }}
        />
      </Modal>
    </PageContainer>
  );
}
