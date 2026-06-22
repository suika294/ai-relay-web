import { PageContainer, ProTable } from '@ant-design/pro-components';
import { DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Image, Space, Tag, Typography } from 'antd';
import { useIntl } from '@umijs/max';
import { userApi } from '@/services/api';
import { t } from '@/utils/i18n';
import { browserDownloadName } from '@/utils/media';

const { Text } = Typography;

const statusMeta: Record<string, { text: string; color: string }> = {
  queued: { text: t('logs.images.statusQueued'), color: 'default' },
  running: { text: t('logs.images.statusRunning'), color: 'processing' },
  succeeded: { text: t('logs.images.statusSucceeded'), color: 'success' },
  failed: { text: t('logs.images.statusFailed'), color: 'error' },
  canceled: { text: t('logs.images.statusCanceled'), color: 'warning' },
};

// 从 data[0] 里挖出可用于渲染 <img src> 的值。url / b64_json 两种模式并存。
function imageSrc(row: API.MediaTask): string | undefined {
  const d = row.data?.[0];
  if (!d) return undefined;
  if (d.url) return d.url;
  if (d.b64_json) return `data:image/png;base64,${d.b64_json}`;
  return undefined;
}

export default function ImageHistory() {
  const intl = useIntl();
  return (
    <PageContainer
      title={intl.formatMessage({ id: 'logs.images.title' })}
      content={
        <Text type="secondary">
          {intl.formatMessage({ id: 'logs.images.subtitle' })}
        </Text>
      }
    >
      <ProTable<API.MediaTask>
        rowKey="id"
        request={async (params) => {
          const res = await userApi.images({
            page: params.current,
            size: params.pageSize,
            status: params.status,
            model: params.model,
            task_id: params.task_id || undefined,
          });
          return {
            data: res.data?.list ?? [],
            total: res.data?.total ?? 0,
            success: res.code === 0,
          };
        }}
        columns={[
          {
            title: intl.formatMessage({ id: 'logs.images.colTime' }),
            dataIndex: 'created_at',
            search: false,
            width: 170,
            render: (_, row) =>
              row.created_at ? new Date(row.created_at * 1000).toLocaleString() : '—',
          },
          {
            title: intl.formatMessage({ id: 'logs.images.colPreview' }),
            search: false,
            width: 96,
            render: (_, row) => {
              const src = imageSrc(row);
              if (!src) return '—';
              return (
                <Image
                  src={src}
                  width={64}
                  height={64}
                  style={{ objectFit: 'cover', borderRadius: 6 }}
                  placeholder
                />
              );
            },
          },
          {
            title: 'Task ID',
            dataIndex: 'task_id',
            width: 220,
            copyable: true,
            render: (_, row) => <code style={{ fontSize: 12 }}>{row.id}</code>,
          },
          { title: intl.formatMessage({ id: 'logs.images.colModel' }), dataIndex: 'model' },
          {
            title: intl.formatMessage({ id: 'logs.images.colStatus' }),
            dataIndex: 'status',
            valueEnum: Object.fromEntries(
              Object.entries(statusMeta).map(([k, v]) => [k, { text: v.text }]),
            ),
            render: (_, row) => {
              const m = statusMeta[row.status] || { text: row.status, color: 'default' };
              return <Tag color={m.color}>{m.text}</Tag>;
            },
          },
        ]}
        expandable={{
          rowExpandable: (row) =>
            row.status === 'failed' || !!imageSrc(row),
          expandedRowRender: (row) => {
            const src = imageSrc(row);
            return (
              <div style={{ padding: '6px 4px' }}>
                {src && (
                  <Space direction="vertical" size="small">
                    <Image
                      src={src}
                      style={{ maxHeight: 420, borderRadius: 8 }}
                    />
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      href={src}
                      target="_blank"
                      download={browserDownloadName(
                        src,
                        `image-${row.id}.png`,
                      )}
                    >
                      {intl.formatMessage({ id: 'logs.images.downloadBtn' })}
                    </Button>
                  </Space>
                )}
                {row.status === 'failed' && row.error && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginTop: 10 }}
                    message={row.error.message}
                    description={
                      row.error.code
                        ? intl.formatMessage(
                            { id: 'logs.images.errorCode' },
                            { code: row.error.code },
                          )
                        : undefined
                    }
                  />
                )}
              </div>
            );
          },
        }}
      />
    </PageContainer>
  );
}
