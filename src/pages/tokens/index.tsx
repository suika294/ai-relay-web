import {
  DrawerForm,
  ModalForm,
  PageContainer,
  ProFormDatePicker,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { Button, Form, InputNumber, message, Modal, Popconfirm, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link, useIntl } from '@umijs/max';
import { useEffect, useRef, useState } from 'react';
import { systemApi, tokenApi, tokenGroupApi } from '@/services/api';
import { displayToQuota, formatDisplay, quotaToDisplay, useBalance } from '@/hooks/useBalance';

const { Paragraph } = Typography;

export default function Tokens() {
  const intl = useIntl();
  const tableRef = useRef<ActionType>();
  const [modelOptions, setModelOptions] = useState<{ label: string; value: string }[]>([]);
  const [groups, setGroups] = useState<API.TokenGroup[]>([]);
  const { balance } = useBalance();
  const currency = balance?.display_currency || 'USD';

  // 把分组列表带入 ctx,用于"分组"列展示组名/状态以及编辑表单的下拉项。
  // 单独维护(不放到 ProTable params 里)是因为表格行的"操作 → 编辑"的
  // initialValues 在 render 时就要拿到 select options。
  const loadGroups = () => {
    tokenGroupApi.list().then((res) => {
      if (res.code === 0) setGroups((res.data as API.TokenGroup[]) || []);
    });
  };

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = (res.data as API.PublicModel[]) || [];
      setModelOptions(
        list.map((m) => ({
          label: m.display_name ? `${m.display_name} (${m.name})` : m.name,
          value: m.name,
        })),
      );
    });
    loadGroups();
  }, []);

  // 下拉项里显示"组名 (已用/上限) 币种",方便用户直观看到要挂入的组余量。
  const groupOptions = groups.map((g) => {
    const used = formatDisplay(quotaToDisplay(g.quota_used, balance), balance, false);
    const limit = g.quota_limit
      ? formatDisplay(quotaToDisplay(g.quota_limit, balance), balance, false)
      : intl.formatMessage({ id: 'tokens.unlimited' });
    return {
      label: `${g.name || `#${g.id}`} (${used}/${limit} ${currency})`,
      value: g.id,
      disabled: g.status !== 1,
    };
  });

  const showCreatedKey = (key: string) => {
    Modal.success({
      title: intl.formatMessage({ id: 'tokens.createdTitle' }),
      width: 520,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>
            {intl.formatMessage({ id: 'tokens.createdHint' })}
          </div>
          <Paragraph copyable code>
            {key}
          </Paragraph>
        </div>
      ),
    });
  };

  return (
    <PageContainer title={intl.formatMessage({ id: 'tokens.title' })}>
      <ProTable<API.Token>
        rowKey="id"
        actionRef={tableRef}
        search={false}
        toolBarRender={() => [
          <Link key="groups" to="/console/token-groups">
            <Button>{intl.formatMessage({ id: 'tokens.manageGroups' })}</Button>
          </Link>,
          <ModalForm
            key="new"
            title={intl.formatMessage({ id: 'tokens.createTitle' })}
            trigger={
              <Button type="primary">{intl.formatMessage({ id: 'tokens.createBtn' })}</Button>
            }
            width={520}
            initialValues={{ unlimited_quota: false, quota_limit_display: 0 }}
            onFinish={async (values: any) => {
              // 表单里收的是显示币种(默认 CNY)的数字,后端要 quota 单位 — 提交前换算。
              const displayLimit = Number(values.quota_limit_display ?? 0);
              const createRes = await tokenApi.create({
                name: values.name,
                quota_limit: displayToQuota(displayLimit, balance),
                unlimited_quota: values.unlimited_quota ?? false,
                expires_at: values.expires_at
                  ? dayjs(values.expires_at).toISOString()
                  : undefined,
                allowed_models: values.allowed_models ?? [],
              });
              if (createRes.code !== 0 || !createRes.data) return false;
              // 创建接口不接受 token_group_id(避免与现有 schema 耦合);
              // 创建后单独调 attach_group 把新 token 挂到选定分组。
              if (values.token_group_id) {
                const att = await tokenApi.attachGroup(createRes.data.id, values.token_group_id);
                if (att.code !== 0) {
                  // 不阻断:token 已经创建并能用,只是没挂进组,提示用户后续手动归组。
                  message.warning(intl.formatMessage({ id: 'tokens.attachGroupFailed' }));
                }
              }
              message.success(intl.formatMessage({ id: 'tokens.createdSuccess' }));
              showCreatedKey(createRes.data.key);
              tableRef.current?.reload();
              return true;
            }}
          >
            <ProFormText
              name="name"
              label={intl.formatMessage({ id: 'tokens.fieldName' })}
              placeholder={intl.formatMessage({ id: 'tokens.namePlaceholder' })}
              rules={[{ required: true }]}
            />
            <ProFormSelect
              name="allowed_models"
              label={intl.formatMessage({ id: 'tokens.allowedModelsCreate' })}
              mode="multiple"
              options={modelOptions}
              showSearch
              placeholder={intl.formatMessage({ id: 'tokens.allowedModelsPlaceholder' })}
            />
            <ProFormSelect
              name="token_group_id"
              label={intl.formatMessage({ id: 'tokens.groupCreate' })}
              options={groupOptions}
              placeholder={intl.formatMessage({ id: 'tokens.groupPlaceholder' })}
              fieldProps={{ allowClear: true }}
            />
            <ProFormDatePicker
              name="expires_at"
              label={intl.formatMessage({ id: 'tokens.expiresCreate' })}
              fieldProps={{ showTime: true, style: { width: '100%' } }}
            />
            <ProFormSwitch
              name="unlimited_quota"
              label={intl.formatMessage({ id: 'tokens.unlimitedQuota' })}
            />
            <Form.Item
              name="quota_limit_display"
              label={intl.formatMessage({ id: 'tokens.quotaLimitLabel' }, { currency })}
              tooltip={intl.formatMessage({ id: 'tokens.quotaLimitTooltip' }, { currency })}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </ModalForm>,
        ]}
        request={async () => {
          const res = await tokenApi.list();
          return { data: res.data ?? [], success: res.code === 0 };
        }}
        columns={[
          { title: intl.formatMessage({ id: 'tokens.colName' }), dataIndex: 'name' },
          {
            title: 'Key',
            dataIndex: 'key_prefix',
            render: (v) => <Tag>{`${v}***`}</Tag>,
          },
          {
            title: intl.formatMessage({ id: 'tokens.colAllowedModels' }),
            dataIndex: 'allowed_models',
            render: (_, row) => {
              const list = row.allowed_models ?? [];
              if (!list.length) return <Tag>{intl.formatMessage({ id: 'tokens.all' })}</Tag>;
              return list.map((m) => <Tag key={m}>{m}</Tag>);
            },
          },
          {
            title: intl.formatMessage({ id: 'tokens.colGroup' }),
            dataIndex: 'token_group_id',
            render: (_, row) => {
              if (!row.token_group_id)
                return <Tag>{intl.formatMessage({ id: 'tokens.standalone' })}</Tag>;
              const g = groups.find((x) => x.id === row.token_group_id);
              if (!g) return <Tag color="warning">#{row.token_group_id}</Tag>;
              const exhausted = g.quota_limit > 0 && g.quota_used >= g.quota_limit;
              const color = g.status !== 1 ? 'default' : exhausted ? 'red' : 'green';
              const used = formatDisplay(quotaToDisplay(g.quota_used, balance), balance, false);
              const limit = g.quota_limit
                ? formatDisplay(quotaToDisplay(g.quota_limit, balance), balance, false)
                : intl.formatMessage({ id: 'tokens.unlimited' });
              return (
                <Tag color={color}>
                  {g.name || `#${g.id}`}
                  {' '}{used}/{limit} {currency}
                </Tag>
              );
            },
          },
          {
            title: intl.formatMessage({ id: 'tokens.colUsed' }, { currency }),
            dataIndex: 'quota_used',
            render: (_, row) =>
              formatDisplay(quotaToDisplay(row.quota_used, balance), balance, false),
          },
          {
            title: intl.formatMessage({ id: 'tokens.colQuota' }, { currency }),
            dataIndex: 'quota_limit',
            render: (_, row) =>
              row.unlimited_quota || !row.quota_limit
                ? intl.formatMessage({ id: 'tokens.unlimitedValue' })
                : formatDisplay(quotaToDisplay(row.quota_limit, balance), balance, false),
          },
          {
            title: intl.formatMessage({ id: 'tokens.colExpires' }),
            dataIndex: 'expires_at',
            render: (v) => {
              if (!v) return '—';
              const d = dayjs(v as string);
              const expired = d.isBefore(dayjs());
              return (
                <span style={{ color: expired ? '#cf1322' : undefined }}>
                  {d.format('YYYY-MM-DD HH:mm')}
                  {expired ? intl.formatMessage({ id: 'tokens.expiredSuffix' }) : ''}
                </span>
              );
            },
          },
          {
            title: intl.formatMessage({ id: 'tokens.colStatus' }),
            dataIndex: 'status',
            valueEnum: {
              1: { text: intl.formatMessage({ id: 'tokens.statusEnabled' }), status: 'Success' },
              0: { text: intl.formatMessage({ id: 'tokens.statusDisabled' }), status: 'Default' },
              2: { text: intl.formatMessage({ id: 'tokens.statusExpired' }), status: 'Warning' },
              3: { text: intl.formatMessage({ id: 'tokens.statusExhausted' }), status: 'Error' },
            },
          },
          {
            title: intl.formatMessage({ id: 'tokens.colCreatedAt' }),
            dataIndex: 'created_at',
            valueType: 'dateTime',
          },
          {
            title: intl.formatMessage({ id: 'tokens.colActions' }),
            valueType: 'option',
            width: 140,
            render: (_, row) => [
              <DrawerForm
                key="edit"
                title={intl.formatMessage({ id: 'tokens.editTitle' }, { name: row.name })}
                trigger={<a>{intl.formatMessage({ id: 'tokens.editBtn' })}</a>}
                width={480}
                initialValues={{
                  name: row.name,
                  allowed_models: row.allowed_models ?? [],
                  expires_at: row.expires_at ? dayjs(row.expires_at) : undefined,
                  quota_limit_display: quotaToDisplay(row.quota_limit, balance),
                  unlimited_quota: row.unlimited_quota,
                  status: row.status === 1,
                  token_group_id: row.token_group_id ?? undefined,
                }}
                onFinish={async (values: any) => {
                  // 归组语义:
                  //   有值 → token_group_id = 那个 id
                  //   清空(undefined/null)→ clear_token_group = true(后端 sentinel)
                  // 等价于专用 attach_group 接口,但保留在 PUT /tokens/:id 内可批量同时改其他字段。
                  const prevGid = row.token_group_id ?? null;
                  const nextGid = values.token_group_id ?? null;
                  const groupChanged = prevGid !== nextGid;
                  const displayLimit = Number(values.quota_limit_display ?? 0);
                  const res = await tokenApi.update(row.id, {
                    name: values.name,
                    allowed_models: values.allowed_models ?? [],
                    expires_at: values.expires_at
                      ? dayjs(values.expires_at).toISOString()
                      : '',
                    quota_limit: displayToQuota(displayLimit, balance),
                    unlimited_quota: values.unlimited_quota,
                    status: values.status ? 1 : 0,
                    ...(groupChanged
                      ? nextGid == null
                        ? { clear_token_group: true }
                        : { token_group_id: nextGid }
                      : {}),
                  });
                  if (res.code === 0) {
                    message.success(intl.formatMessage({ id: 'tokens.savedSuccess' }));
                    tableRef.current?.reload();
                    return true;
                  }
                  return false;
                }}
              >
                <ProFormText
                  name="name"
                  label={intl.formatMessage({ id: 'tokens.fieldName' })}
                  rules={[{ required: true }]}
                />
                <ProFormSelect
                  name="allowed_models"
                  label={intl.formatMessage({ id: 'tokens.allowedModelsEdit' })}
                  mode="multiple"
                  options={modelOptions}
                  showSearch
                />
                <ProFormSelect
                  name="token_group_id"
                  label={intl.formatMessage({ id: 'tokens.groupEdit' })}
                  options={groupOptions}
                  fieldProps={{ allowClear: true }}
                />
                <ProFormDatePicker
                  name="expires_at"
                  label={intl.formatMessage({ id: 'tokens.expiresEdit' })}
                  fieldProps={{ showTime: true, style: { width: '100%' }, allowClear: true }}
                />
                <ProFormSwitch
                  name="unlimited_quota"
                  label={intl.formatMessage({ id: 'tokens.unlimitedQuota' })}
                />
                <Form.Item
                  name="quota_limit_display"
                  label={intl.formatMessage({ id: 'tokens.quotaLimitLabel' }, { currency })}
                >
                  <InputNumber min={0} step={1} style={{ width: '100%' }} />
                </Form.Item>
                <ProFormSwitch
                  name="status"
                  label={intl.formatMessage({ id: 'tokens.fieldEnable' })}
                />
              </DrawerForm>,
              <Popconfirm
                key="del"
                title={intl.formatMessage({ id: 'tokens.deleteConfirm' })}
                onConfirm={async () => {
                  const res = await tokenApi.remove(row.id);
                  if (res.code === 0) {
                    message.success(intl.formatMessage({ id: 'tokens.deletedSuccess' }));
                    tableRef.current?.reload();
                  }
                }}
              >
                <a style={{ color: '#cf1322' }}>
                  {intl.formatMessage({ id: 'tokens.deleteBtn' })}
                </a>
              </Popconfirm>,
            ],
          },
        ]}
      />
    </PageContainer>
  );
}
