import {
  ModalForm,
  ProFormDigit,
  ProFormRadio,
  ProFormSelect,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { GiftOutlined, WalletOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
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
import { useRef, useState } from 'react';
import AuthModal from '@/components/AuthModal';
import PublicLayout from '@/layouts/PublicLayout';
import { billingApi } from '@/services/api';

// 公开页版本的充值/兑换:
//   - 入口在 PublicLayout 顶部导航,未登录时按钮会先弹 AuthModal
//   - 控制台版本仍在 /console/billing/recharge,两者复用同一组接口
//   - 视觉上裹一层 Card 让它在 PublicLayout 的 #fafafa 背景上不"裸奔"
export default function PublicRecharge() {
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
        message.success(`兑换成功,+${res.data.quota_amount} quota`);
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
          充值 · 兑换
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 15, marginBottom: 24 }}>
          支持充值入账和兑换码两种方式增加额度。{user ? '' : '点击下方按钮将先要求登录。'}
        </Typography.Paragraph>

        <Card
          title="充值订单"
          extra={
            <Space>
              <Button type="primary" icon={<WalletOutlined />} onClick={openRecharge}>
                充值
              </Button>
              <Button icon={<GiftOutlined />} onClick={openRedeem}>
                兑换
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
                { title: '订单号', dataIndex: 'order_no', ellipsis: true, copyable: true, width: 260 },
                { title: '金额', render: (_, r) => `${r.amount} ${r.currency}` },
                { title: 'Quota', dataIndex: 'quota_amount' },
                { title: '支付方式', dataIndex: 'payment_method' },
                {
                  title: '状态',
                  dataIndex: 'status',
                  valueEnum: {
                    0: { text: '待支付', status: 'Default' },
                    1: { text: '已支付', status: 'Success' },
                    2: { text: '已退款', status: 'Warning' },
                    3: { text: '已取消', status: 'Default' },
                    4: { text: '失败', status: 'Error' },
                  },
                },
                { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime' },
              ]}
            />
          ) : (
            <div style={{ padding: '36px 0', textAlign: 'center', color: '#999' }}>
              登录后可查看你的充值订单
            </div>
          )}
        </Card>
      </div>

      {/* 充值表单弹窗:登录后才会被打开,所以这里不再做登录判断 */}
      <ModalForm<{ amount: number; currency: string; method: string }>
        title="新建充值订单"
        width={480}
        open={rechargeOpen}
        modalProps={{ destroyOnClose: true, onCancel: () => setRechargeOpen(false) }}
        initialValues={{ amount: 100, currency: 'CNY', method: 'manual' }}
        onFinish={async (values) => {
          const ok = await handlePay(values);
          if (ok) setRechargeOpen(false);
          return ok;
        }}
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
          options={[
            { value: 'manual', label: 'Manual(手动确认)' },
            { value: 'alipay', label: '支付宝' },
            { value: 'wechat', label: '微信' },
            { value: 'stripe', label: 'Stripe' },
          ]}
          rules={[{ required: true }]}
        />
      </ModalForm>

      {/* 兑换码弹窗 */}
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
                const sign = n > 0 ? '+' : '';
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

      {/* 未登录拦截:登录成功后续上原来的意图 */}
      <AuthModal
        open={authOpen}
        defaultTab="login"
        title="登录以继续充值/兑换"
        description="登录后可以发起充值订单和使用兑换码。"
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
