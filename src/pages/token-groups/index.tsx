import {
  DrawerForm,
  ModalForm,
  PageContainer,
  ProFormSwitch,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Form,
  InputNumber,
  Popconfirm,
  Progress,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useRef } from 'react';
import { useIntl } from '@umijs/max';
import { tokenGroupApi } from '@/services/api';
import {
  displayToQuota,
  formatDisplay,
  quotaToDisplay,
  useBalance,
} from '@/hooks/useBalance';

const { Text } = Typography;

// 用户自有 API Key 分组(共享额度池)管理页。
//
// 重要 UX 决策:所有 quota 数字对外都展示成"显示币种"(默认 CNY)。
// 用户填 100 元、看到 1.23 元的消费,而不是 50000000 quota 这种内部数字 —
// 用户不知道 quota_per_usd 换算比,直接给 quota 会算错额度(见用户反馈)。
//
// 实现:
//   * 表单输入显示币种数字 → 提交前用 displayToQuota 转 quota,再交给后端
//   * 列表数字从 quota_used/quota_limit 用 quotaToDisplay 转出再展示
//   * 货币符号取自 balance.display_currency(可能是 CNY/USD/...)
//
// 与管理员后台的"用户分组 /user_groups"(计费 tier:ratio/qpm/bypass_balance)是两个独立概念。

export default function TokenGroupsPage() {
  const intl = useIntl();
  const tableRef = useRef<ActionType>();
  const { balance, refresh: refreshBalance } = useBalance();

  const currency = balance?.display_currency || 'USD';

  return (
    <PageContainer
      title={intl.formatMessage({ id: 'tokenGroups.title' })}
      content={
        <Alert
          type="info"
          showIcon
          message={intl.formatMessage({ id: 'tokenGroups.intro' }, { currency })}
        />
      }
    >
      <ProTable<API.TokenGroup>
        rowKey="id"
        actionRef={tableRef}
        search={false}
        toolBarRender={() => [
          <ModalForm
            key="new"
            title={intl.formatMessage({ id: 'tokenGroups.createTitle' })}
            trigger={
              <Button type="primary">
                {intl.formatMessage({ id: 'tokenGroups.createBtn' })}
              </Button>
            }
            width={480}
            initialValues={{ name: '', quota_limit_display: 0 }}
            onFinish={async (values: any) => {
              const displayAmount = Number(values.quota_limit_display ?? 0);
              if (displayAmount < 0) {
                message.warning(intl.formatMessage({ id: 'tokenGroups.errQuotaNegative' }));
                return false;
              }
              const quota = displayToQuota(displayAmount, balance);
              const res = await tokenGroupApi.create({
                name: values.name,
                quota_limit: quota,
              });
              if (res.code === 0) {
                message.success(intl.formatMessage({ id: 'tokenGroups.msgCreated' }));
                tableRef.current?.reload();
                return true;
              }
              return false;
            }}
          >
            <ProFormText
              name="name"
              label={intl.formatMessage({ id: 'tokenGroups.nameLabel' })}
              placeholder={intl.formatMessage({ id: 'tokenGroups.namePlaceholder' })}
              rules={[{ required: true }]}
            />
            <Form.Item
              name="quota_limit_display"
              label={intl.formatMessage({ id: 'tokenGroups.quotaLimitLabel' }, { currency })}
              tooltip={intl.formatMessage({ id: 'tokenGroups.quotaLimitTooltip' }, { currency })}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </ModalForm>,
        ]}
        request={async () => {
          const res = await tokenGroupApi.list();
          return { data: res.data ?? [], success: res.code === 0 };
        }}
        columns={[
          {
            title: intl.formatMessage({ id: 'tokenGroups.colName' }),
            dataIndex: 'name',
            render: (_, row) =>
              row.name || (
                <Text type="secondary">
                  {intl.formatMessage({ id: 'tokenGroups.unnamed' })}
                </Text>
              ),
          },
          {
            title: intl.formatMessage({ id: 'tokenGroups.colQuota' }, { currency }),
            dataIndex: 'quota_limit',
            render: (_, row) =>
              row.quota_limit > 0 ? (
                formatDisplay(quotaToDisplay(row.quota_limit, balance), balance, false)
              ) : (
                <Tag color="blue">{intl.formatMessage({ id: 'tokenGroups.unlimited' })}</Tag>
              ),
          },
          {
            title: intl.formatMessage({ id: 'tokenGroups.colUsed' }, { currency }),
            dataIndex: 'quota_used',
            render: (_, row) =>
              formatDisplay(quotaToDisplay(row.quota_used, balance), balance, false),
          },
          {
            title: intl.formatMessage({ id: 'tokenGroups.colUsage' }),
            render: (_, row) => {
              if (!row.quota_limit)
                return <Tag>{intl.formatMessage({ id: 'tokenGroups.unlimited' })}</Tag>;
              const pct = Math.min(100, Math.round((row.quota_used / row.quota_limit) * 100));
              const exhausted = row.quota_used >= row.quota_limit;
              return (
                <Progress
                  percent={pct}
                  size="small"
                  status={exhausted ? 'exception' : 'normal'}
                  format={() =>
                    exhausted ? intl.formatMessage({ id: 'tokenGroups.exhausted' }) : `${pct}%`
                  }
                />
              );
            },
          },
          {
            title: intl.formatMessage({ id: 'tokenGroups.colStatus' }),
            dataIndex: 'status',
            valueEnum: {
              1: { text: intl.formatMessage({ id: 'tokenGroups.statusEnabled' }), status: 'Success' },
              0: { text: intl.formatMessage({ id: 'tokenGroups.statusDisabled' }), status: 'Default' },
            },
          },
          {
            title: intl.formatMessage({ id: 'tokenGroups.colCreatedAt' }),
            dataIndex: 'created_at',
            valueType: 'dateTime',
          },
          {
            title: intl.formatMessage({ id: 'tokenGroups.colAction' }),
            valueType: 'option',
            width: 240,
            render: (_, row) => [
              <DrawerForm
                key="edit"
                title={intl.formatMessage(
                  { id: 'tokenGroups.editTitle' },
                  { name: row.name || row.id },
                )}
                trigger={<a>{intl.formatMessage({ id: 'common.edit' })}</a>}
                width={480}
                initialValues={{
                  name: row.name,
                  quota_limit_display: quotaToDisplay(row.quota_limit, balance),
                  status: row.status === 1,
                }}
                onFinish={async (values: any) => {
                  const displayAmount = Number(values.quota_limit_display ?? 0);
                  if (displayAmount < 0) {
                    message.warning(intl.formatMessage({ id: 'tokenGroups.errQuotaNegative' }));
                    return false;
                  }
                  const res = await tokenGroupApi.update(row.id, {
                    name: values.name,
                    quota_limit: displayToQuota(displayAmount, balance),
                    status: values.status ? 1 : 0,
                  });
                  if (res.code === 0) {
                    message.success(intl.formatMessage({ id: 'tokenGroups.msgSaved' }));
                    tableRef.current?.reload();
                    return true;
                  }
                  return false;
                }}
              >
                <ProFormText
                  name="name"
                  label={intl.formatMessage({ id: 'tokenGroups.nameLabel' })}
                  rules={[{ required: true }]}
                />
                <Form.Item
                  name="quota_limit_display"
                  label={intl.formatMessage({ id: 'tokenGroups.quotaLimitLabel' }, { currency })}
                >
                  <InputNumber min={0} step={1} style={{ width: '100%' }} />
                </Form.Item>
                <ProFormSwitch
                  name="status"
                  label={intl.formatMessage({ id: 'tokenGroups.enableLabel' })}
                />
              </DrawerForm>,
              <ModalForm
                key="topup"
                title={intl.formatMessage(
                  { id: 'tokenGroups.topupTitle' },
                  { name: row.name || row.id },
                )}
                trigger={<a>{intl.formatMessage({ id: 'tokenGroups.topupBtn' })}</a>}
                width={440}
                initialValues={{ delta_display: 0, reset_used: false }}
                submitter={{
                  searchConfig: {
                    submitText: intl.formatMessage({ id: 'tokenGroups.execute' }),
                  },
                }}
                onFinish={async (values: any) => {
                  const deltaDisplay = Number(values.delta_display ?? 0);
                  const reset = !!values.reset_used;
                  if (deltaDisplay <= 0 && !reset) {
                    message.warning(intl.formatMessage({ id: 'tokenGroups.errTopupEmpty' }));
                    return false;
                  }
                  if (deltaDisplay < 0) {
                    message.warning(intl.formatMessage({ id: 'tokenGroups.errTopupNegative' }));
                    return false;
                  }
                  const delta = displayToQuota(deltaDisplay, balance);
                  const res = await tokenGroupApi.topup(row.id, {
                    delta_quota: delta,
                    reset_used: reset,
                  });
                  if (res.code === 0) {
                    message.success(intl.formatMessage({ id: 'tokenGroups.msgTopupDone' }));
                    await refreshBalance(); // 续金额本身不动余额,但顺便同步可能变化的汇率/币种
                    tableRef.current?.reload();
                    return true;
                  }
                  return false;
                }}
              >
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={intl.formatMessage({ id: 'tokenGroups.topupAlert' }, { currency })}
                />
                <Form.Item
                  name="delta_display"
                  label={intl.formatMessage({ id: 'tokenGroups.deltaLabel' }, { currency })}
                  tooltip={intl.formatMessage({ id: 'tokenGroups.deltaTooltip' })}
                >
                  <InputNumber min={0} step={1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="reset_used"
                  label={intl.formatMessage({ id: 'tokenGroups.resetUsedLabel' })}
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              </ModalForm>,
              <Popconfirm
                key="del"
                title={intl.formatMessage({ id: 'tokenGroups.deleteTitle' })}
                description={intl.formatMessage({ id: 'tokenGroups.deleteDesc' })}
                onConfirm={async () => {
                  const res = await tokenGroupApi.remove(row.id);
                  if (res.code === 0) {
                    message.success(intl.formatMessage({ id: 'tokenGroups.msgDeleted' }));
                    tableRef.current?.reload();
                  }
                }}
              >
                <a style={{ color: '#cf1322' }}>
                  {intl.formatMessage({ id: 'common.delete' })}
                </a>
              </Popconfirm>,
            ],
          },
        ]}
      />
    </PageContainer>
  );
}
