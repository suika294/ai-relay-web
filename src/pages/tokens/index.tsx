import {
  DrawerForm,
  ModalForm,
  PageContainer,
  ProFormDatePicker,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { Button, message, Modal, Popconfirm, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { systemApi, tokenApi } from '@/services/api';

const { Paragraph } = Typography;

export default function Tokens() {
  const tableRef = useRef<ActionType>();
  const [modelOptions, setModelOptions] = useState<{ label: string; value: string }[]>([]);

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
  }, []);

  const showCreatedKey = (key: string) => {
    Modal.success({
      title: 'Token 创建成功',
      width: 520,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>请妥善保存,关闭后此 Key 将不会再完整显示:</div>
          <Paragraph copyable code>
            {key}
          </Paragraph>
        </div>
      ),
    });
  };

  return (
    <PageContainer title="API Key 管理">
      <ProTable<API.Token>
        rowKey="id"
        actionRef={tableRef}
        search={false}
        toolBarRender={() => [
          <ModalForm
            key="new"
            title="新建 API Token"
            trigger={<Button type="primary">新建 Token</Button>}
            width={520}
            initialValues={{ unlimited_quota: false, quota_limit: 0 }}
            onFinish={async (values: any) => {
              const res = await tokenApi.create({
                name: values.name,
                quota_limit: values.quota_limit ?? 0,
                unlimited_quota: values.unlimited_quota ?? false,
                expires_at: values.expires_at
                  ? dayjs(values.expires_at).toISOString()
                  : undefined,
                allowed_models: values.allowed_models ?? [],
              });
              if (res.code === 0 && res.data) {
                message.success('创建成功');
                showCreatedKey(res.data.key);
                tableRef.current?.reload();
                return true;
              }
              return false;
            }}
          >
            <ProFormText
              name="name"
              label="名称"
              placeholder="例如:production"
              rules={[{ required: true }]}
            />
            <ProFormSelect
              name="allowed_models"
              label="限制模型(留空 = 不限,可在稍后编辑扩充)"
              mode="multiple"
              options={modelOptions}
              showSearch
              placeholder="不选则此 Key 可调用全部已启用模型"
            />
            <ProFormDatePicker
              name="expires_at"
              label="有效期(可选,过期后自动拒绝)"
              fieldProps={{ showTime: true, style: { width: '100%' } }}
            />
            <ProFormSwitch name="unlimited_quota" label="不限额度" />
            <ProFormDigit name="quota_limit" label="Quota 上限(0 = 不限)" min={0} />
          </ModalForm>,
        ]}
        request={async () => {
          const res = await tokenApi.list();
          return { data: res.data ?? [], success: res.code === 0 };
        }}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: 'Key',
            dataIndex: 'key_prefix',
            render: (v) => <Tag>{`${v}***`}</Tag>,
          },
          {
            title: '限制模型',
            dataIndex: 'allowed_models',
            render: (_, row) => {
              const list = row.allowed_models ?? [];
              if (!list.length) return <Tag>全部</Tag>;
              return list.map((m) => <Tag key={m}>{m}</Tag>);
            },
          },
          { title: '已用', dataIndex: 'quota_used' },
          {
            title: '额度',
            dataIndex: 'quota_limit',
            render: (_, row) => (row.unlimited_quota ? '无限' : row.quota_limit || '无限'),
          },
          {
            title: '有效期',
            dataIndex: 'expires_at',
            render: (v) => {
              if (!v) return '—';
              const d = dayjs(v as string);
              const expired = d.isBefore(dayjs());
              return (
                <span style={{ color: expired ? '#cf1322' : undefined }}>
                  {d.format('YYYY-MM-DD HH:mm')}
                  {expired ? '(已过期)' : ''}
                </span>
              );
            },
          },
          {
            title: '状态',
            dataIndex: 'status',
            valueEnum: {
              1: { text: '启用', status: 'Success' },
              0: { text: '禁用', status: 'Default' },
              2: { text: '过期', status: 'Warning' },
              3: { text: '耗尽', status: 'Error' },
            },
          },
          { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime' },
          {
            title: '操作',
            valueType: 'option',
            width: 140,
            render: (_, row) => [
              <DrawerForm
                key="edit"
                title={`编辑 ${row.name}`}
                trigger={<a>编辑</a>}
                width={480}
                initialValues={{
                  name: row.name,
                  allowed_models: row.allowed_models ?? [],
                  expires_at: row.expires_at ? dayjs(row.expires_at) : undefined,
                  quota_limit: row.quota_limit,
                  unlimited_quota: row.unlimited_quota,
                  status: row.status === 1,
                }}
                onFinish={async (values: any) => {
                  const res = await tokenApi.update(row.id, {
                    name: values.name,
                    allowed_models: values.allowed_models ?? [],
                    expires_at: values.expires_at
                      ? dayjs(values.expires_at).toISOString()
                      : '',
                    quota_limit: values.quota_limit,
                    unlimited_quota: values.unlimited_quota,
                    status: values.status ? 1 : 0,
                  });
                  if (res.code === 0) {
                    message.success('已保存');
                    tableRef.current?.reload();
                    return true;
                  }
                  return false;
                }}
              >
                <ProFormText name="name" label="名称" rules={[{ required: true }]} />
                <ProFormSelect
                  name="allowed_models"
                  label="限制模型(留空 = 不限)"
                  mode="multiple"
                  options={modelOptions}
                  showSearch
                />
                <ProFormDatePicker
                  name="expires_at"
                  label="有效期(清空表示永不过期)"
                  fieldProps={{ showTime: true, style: { width: '100%' }, allowClear: true }}
                />
                <ProFormSwitch name="unlimited_quota" label="不限额度" />
                <ProFormDigit name="quota_limit" label="Quota 上限(0 = 不限)" min={0} />
                <ProFormSwitch name="status" label="启用" />
              </DrawerForm>,
              <Popconfirm
                key="del"
                title="确认删除?"
                onConfirm={async () => {
                  const res = await tokenApi.remove(row.id);
                  if (res.code === 0) {
                    message.success('已删除');
                    tableRef.current?.reload();
                  }
                }}
              >
                <a style={{ color: '#cf1322' }}>删除</a>
              </Popconfirm>,
            ],
          },
        ]}
      />
    </PageContainer>
  );
}
