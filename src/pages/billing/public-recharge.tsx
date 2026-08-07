import {
  ModalForm,
  ProFormDigit,
  ProFormRadio,
  ProFormSelect,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { GiftOutlined, WalletOutlined } from '@ant-design/icons';
import { useIntl, useModel } from '@umijs/max';
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Input,
  message,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import AuthModal from '@/components/AuthModal';
import PublicLayout from '@/layouts/PublicLayout';
import { billingApi } from '@/services/api';

// 公开页版本的充值/兑换:
//   - 入口在 PublicLayout 顶部导航,未登录时按钮会先弹 AuthModal
//   - 控制台版本仍在 /console/billing/recharge,两者复用同一组接口
//   - 视觉上裹一层 Card 让它在 PublicLayout 的 #fafafa 背景上不"裸奔"
export default function PublicRecharge() {
  const intl = useIntl();
  const { initialState } = useModel('@@initialState');
  const user = initialState?.currentUser;

  const orderRef = useRef<ActionType>();
  const redeemTableRef = useRef<ActionType>();

  // 未登录时点充值/兑换:先弹登录,登录成功后用 pendingAction 续上原来的动作
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'recharge' | 'redeem' | null>(null);

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const requireLogin = (action: 'recharge' | 'redeem') => {
    if (!user) {
      setPendingAction(action);
      setAuthOpen(true);
      return false;
    }
    return true;
  };

  const openRecharge = () => {
    if (requireLogin('recharge')) setRechargeOpen(true);
  };
  const openRedeem = () => {
    if (requireLogin('redeem')) setRedeemOpen(true);
  };

  // 支付宝跳走后主动轮询查单：notify_url 不可达时订单只靠回调会永远 pending。
  // （控制台版 /console/billing/recharge 同款逻辑，那边还额外处理 return_url 回跳。）
  const [watchOrder, setWatchOrder] = useState<string | null>(null);
  useEffect(() => {
    if (!watchOrder) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        clearInterval(timer);
        setWatchOrder(null);
        return;
      }
      if (document.visibilityState === 'hidden') return;
      try {
        const r = await billingApi.queryOrderStatus(watchOrder);
        if (r.code === 0 && r.data?.status === 1) {
          clearInterval(timer);
          setWatchOrder(null);
          message.success(intl.formatMessage({ id: 'billing.recharge.paySuccessToast' }));
          orderRef.current?.reload();
        }
      } catch {
        // 查单偶发失败不打断轮询，下个 tick 再试
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [watchOrder]);

  const handlePay = async (values: { amount: number; currency: string; method: string }) => {
    const res = await billingApi.createRecharge({
      amount: String(values.amount),
      currency: values.currency,
      method: values.method,
    });
    if (res.code !== 0 || !res.data) return false;
    if (res.data.pay_url) {
      setWatchOrder(res.data.order_no);
      window.open(res.data.pay_url, '_blank');
    } else {
      Modal.info({
        title: intl.formatMessage({ id: 'billing.publicRecharge.orderCreated' }),
        width: 520,
        content: (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.publicRecharge.orderNo' })}>{res.data.order_no}</Descriptions.Item>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.publicRecharge.usdEquivalent' })}>${res.data.usd_amount}</Descriptions.Item>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.publicRecharge.quotaEquivalent' })}>{res.data.quota_amount}</Descriptions.Item>
            <Descriptions.Item label={intl.formatMessage({ id: 'billing.publicRecharge.exchangeRate' })}>{res.data.exchange_rate}</Descriptions.Item>
            {values.method === 'manual' && (
              <Descriptions.Item label={intl.formatMessage({ id: 'billing.publicRecharge.tipLabel' })}>{intl.formatMessage({ id: 'billing.publicRecharge.manualConfirmTip' })}</Descriptions.Item>
            )}
          </Descriptions>
        ),
      });
    }
    orderRef.current?.reload();
    return true;
  };

  const submitRedeem = async () => {
    const c = code.trim();
    if (!c) {
      message.warning(intl.formatMessage({ id: 'billing.publicRecharge.codeRequired' }));
      return;
    }
    setRedeeming(true);
    try {
      const res = await billingApi.redeem(c);
      if (res.code === 0 && res.data) {
        message.success(intl.formatMessage({ id: 'billing.publicRecharge.redeemSuccess' }, { quota: res.data.quota_amount }));
        setCode('');
        redeemTableRef.current?.reload();
      }
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <PublicLayout>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 80px' }}>
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          {intl.formatMessage({ id: 'billing.publicRecharge.title' })}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 15, marginBottom: 24 }}>
          {intl.formatMessage({ id: 'billing.publicRecharge.subtitle' })}{user ? '' : intl.formatMessage({ id: 'billing.publicRecharge.loginHint' })}
        </Typography.Paragraph>

        <Card
          title={intl.formatMessage({ id: 'billing.publicRecharge.rechargeOrders' })}
          extra={
            <Space>
              <Button type="primary" icon={<WalletOutlined />} onClick={openRecharge}>
                {intl.formatMessage({ id: 'billing.publicRecharge.rechargeBtn' })}
              </Button>
              <Button icon={<GiftOutlined />} onClick={openRedeem}>
                {intl.formatMessage({ id: 'billing.publicRecharge.redeemBtn' })}
              </Button>
            </Space>
          }
        >
          {user ? (
            <ProTable<API.RechargeOrder>
              rowKey="id"
              actionRef={orderRef}
              search={false}
              ghost
              request={async (params) => {
                const res = await billingApi.listOrders({
                  page: params.current,
                  size: params.pageSize,
                });
                return {
                  data: res.data?.list ?? [],
                  total: res.data?.total ?? 0,
                  success: res.code === 0,
                };
              }}
              columns={[
                { title: intl.formatMessage({ id: 'billing.publicRecharge.orderNo' }), dataIndex: 'order_no', ellipsis: true, copyable: true, width: 260 },
                { title: intl.formatMessage({ id: 'billing.publicRecharge.amount' }), render: (_, r) => `${r.amount} ${r.currency}` },
                { title: 'Quota', dataIndex: 'quota_amount' },
                { title: intl.formatMessage({ id: 'billing.publicRecharge.paymentMethod' }), dataIndex: 'payment_method' },
                {
                  title: intl.formatMessage({ id: 'billing.publicRecharge.status' }),
                  dataIndex: 'status',
                  valueEnum: {
                    0: { text: intl.formatMessage({ id: 'billing.publicRecharge.statusUnpaid' }), status: 'Default' },
                    1: { text: intl.formatMessage({ id: 'billing.publicRecharge.statusPaid' }), status: 'Success' },
                    2: { text: intl.formatMessage({ id: 'billing.publicRecharge.statusRefunded' }), status: 'Warning' },
                    3: { text: intl.formatMessage({ id: 'billing.publicRecharge.statusCancelled' }), status: 'Default' },
                    4: { text: intl.formatMessage({ id: 'billing.publicRecharge.statusFailed' }), status: 'Error' },
                  },
                },
                { title: intl.formatMessage({ id: 'billing.publicRecharge.createdAt' }), dataIndex: 'created_at', valueType: 'dateTime' },
              ]}
            />
          ) : (
            <div style={{ padding: '36px 0', textAlign: 'center', color: '#999' }}>
              {intl.formatMessage({ id: 'billing.publicRecharge.loginToView' })}
            </div>
          )}
        </Card>
      </div>

      {/* 充值表单弹窗:登录后才会被打开,所以这里不再做登录判断 */}
      <ModalForm<{ amount: number; currency: string; method: string }>
        title={intl.formatMessage({ id: 'billing.publicRecharge.newOrderTitle' })}
        width={480}
        open={rechargeOpen}
        modalProps={{ destroyOnClose: true, onCancel: () => setRechargeOpen(false) }}
        initialValues={{ amount: 100, currency: 'CNY', method: 'wechat' }}
        onFinish={async (values) => {
          const ok = await handlePay(values);
          if (ok) setRechargeOpen(false);
          return ok;
        }}
      >
        <ProFormDigit
          name="amount"
          label={intl.formatMessage({ id: 'billing.publicRecharge.amount' })}
          min={0.01}
          fieldProps={{ step: 10 }}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="currency"
          label={intl.formatMessage({ id: 'billing.publicRecharge.currency' })}
          options={['USD', 'CNY', 'EUR', 'JPY', 'GBP'].map((c) => ({ value: c, label: c }))}
          rules={[{ required: true }]}
        />
        <ProFormRadio.Group
          name="method"
          label={intl.formatMessage({ id: 'billing.publicRecharge.paymentMethod' })}
          // Stripe 后端尚未实现(internal/pkg/payment/stripe.go 直接 not implemented),
          // UI 暂不暴露,避免用户选了 Stripe 走到 502。后端补齐后再加回选项。
          // 目前开放微信 / 支付宝,Manual 先隐藏(需要时把下面一项加回即可)。
          options={[
            // { value: 'manual', label: 'Manual(手动确认)' },
            { value: 'alipay', label: intl.formatMessage({ id: 'billing.publicRecharge.methodAlipay' }) },
            { value: 'wechat', label: intl.formatMessage({ id: 'billing.publicRecharge.methodWechat' }) },
          ]}
          rules={[{ required: true }]}
        />
      </ModalForm>

      {/* 兑换码弹窗 */}
      <Modal
        title={
          <Space>
            <GiftOutlined />
            <span>{intl.formatMessage({ id: 'billing.publicRecharge.redeemCode' })}</span>
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
            placeholder={intl.formatMessage({ id: 'billing.publicRecharge.codePlaceholder' })}
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
            {intl.formatMessage({ id: 'billing.publicRecharge.redeemNow' })}
          </Button>
        </Space.Compact>

        <Divider orientation="left" plain style={{ marginTop: 20 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {intl.formatMessage({ id: 'billing.publicRecharge.redeemHistory' })}
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
              title: intl.formatMessage({ id: 'billing.publicRecharge.redeemCode' }),
              dataIndex: 'ref_id',
              copyable: true,
              ellipsis: true,
              render: (_, r) => (r.ref_id ? <Tag color="cyan">{r.ref_id}</Tag> : '-'),
            },
            {
              title: intl.formatMessage({ id: 'billing.publicRecharge.quotaAdded' }),
              dataIndex: 'quota_amount',
              render: (_, r) => {
                const n = Number(r.quota_amount) || 0;
                const color = n > 0 ? '#389e0d' : n < 0 ? '#cf1322' : undefined;
                const sign = n > 0 ? '+' : '';
                return (
                  <span style={{ color }}>
                    {sign}
                    {n.toLocaleString()}
                  </span>
                );
              },
            },
            { title: intl.formatMessage({ id: 'billing.publicRecharge.time' }), dataIndex: 'created_at', valueType: 'dateTime' },
          ]}
          pagination={{ pageSize: 5, showSizeChanger: false, simple: true }}
        />
      </Modal>

      {/* 未登录拦截:登录成功后续上原来的意图 */}
      <AuthModal
        open={authOpen}
        defaultTab="login"
        onClose={() => {
          setAuthOpen(false);
          setPendingAction(null);
        }}
        onSuccess={() => {
          setAuthOpen(false);
          if (pendingAction === 'recharge') setRechargeOpen(true);
          if (pendingAction === 'redeem') setRedeemOpen(true);
          setPendingAction(null);
        }}
      />
    </PublicLayout>
  );
}
