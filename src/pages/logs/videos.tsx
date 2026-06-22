import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Alert, Button, Tag, Typography } from 'antd';
import { DownloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { t } from '@/utils/i18n';
import { userApi } from '@/services/api';
import { browserDownloadName, publicMediaURL } from '@/utils/media';

const { Text, Link } = Typography;

// 状态 → 文案 + Tag 颜色。对齐 VideoPanel 的显示习惯。
const statusMeta: Record<string, { text: string; color: string }> = {
  queued: { text: t('logs.videos.statusQueued'), color: 'default' },
  running: { text: t('logs.videos.statusRunning'), color: 'processing' },
  succeeded: { text: t('logs.videos.statusSucceeded'), color: 'success' },
  failed: { text: t('logs.videos.statusFailed'), color: 'error' },
  canceled: { text: t('logs.videos.statusCanceled'), color: 'warning' },
};

function durationText(t: API.MediaTask): string {
  if (!t.completed_at || !t.created_at) return '—';
  const s = t.completed_at - t.created_at;
  return `${s}s`;
}

export default function VideoHistory() {
  const intl = useIntl();
  return (
    <PageContainer
      title={intl.formatMessage({ id: 'logs.videos.title' })}
      content={
        <Text type="secondary">
          {intl.formatMessage({ id: 'logs.videos.desc' })}
        </Text>
      }
    >
      <ProTable<API.MediaTask>
        rowKey="id"
        request={async (params) => {
          const res = await userApi.videos({
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
            title: intl.formatMessage({ id: 'logs.videos.colTime' }),
            dataIndex: 'created_at',
            search: false,
            width: 170,
            render: (_, row) =>
              row.created_at ? new Date(row.created_at * 1000).toLocaleString() : '—',
          },
          {
            title: 'Task ID',
            dataIndex: 'task_id',
            width: 230,
            copyable: true,
            render: (_, row) => <code style={{ fontSize: 12 }}>{row.id}</code>,
          },
          { title: intl.formatMessage({ id: 'logs.videos.colModel' }), dataIndex: 'model' },
          {
            title: intl.formatMessage({ id: 'logs.videos.colStatus' }),
            dataIndex: 'status',
            valueEnum: Object.fromEntries(
              Object.entries(statusMeta).map(([k, v]) => [k, { text: v.text }]),
            ),
            render: (_, row) => {
              const m = statusMeta[row.status] || { text: row.status, color: 'default' };
              return <Tag color={m.color}>{m.text}</Tag>;
            },
          },
          {
            title: intl.formatMessage({ id: 'logs.videos.colDuration' }),
            search: false,
            width: 90,
            render: (_, row) => durationText(row),
          },
          {
            title: intl.formatMessage({ id: 'logs.videos.colOutput' }),
            search: false,
            width: 120,
            render: (_, row) => {
              const url = publicMediaURL(row.data?.[0]?.url);
              if (!url) return '—';
              return (
                <Link href={url} target="_blank" rel="noreferrer">
                  <PlayCircleOutlined /> {intl.formatMessage({ id: 'logs.videos.view' })}
                </Link>
              );
            },
          },
        ]}
        expandable={{
          // 只在成功/失败行允许展开详情;排队中的展开无信息
          rowExpandable: (row) =>
            row.status === 'succeeded' ||
            row.status === 'failed' ||
            !!publicMediaURL(row.data?.[0]?.url),
          expandedRowRender: (row) => {
            const url = publicMediaURL(row.data?.[0]?.url);
            const cover = row.data?.[0]?.cover_url;
            return (
              <div style={{ padding: '8px 4px' }}>
                {row.status === 'succeeded' && url && (
                  <div style={{ maxWidth: 520 }}>
                    <video
                      src={url}
                      controls
                      poster={cover}
                      preload="metadata"
                      style={{
                        width: '100%',
                        maxHeight: 320,
                        background: '#000',
                        borderRadius: 8,
                      }}
                    />
                    <div style={{ marginTop: 8 }}>
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        href={url}
                        target="_blank"
                        download={browserDownloadName(
                          url,
                          `video-${row.id}.mp4`,
                        )}
                      >
                        {intl.formatMessage({ id: 'logs.videos.download' })}
                      </Button>
                    </div>
                  </div>
                )}
                {row.status === 'failed' && row.error && (
                  <Alert
                    type="error"
                    showIcon
                    message={row.error.message}
                    description={
                      row.error.code
                        ? intl.formatMessage(
                            { id: 'logs.videos.errorCode' },
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
