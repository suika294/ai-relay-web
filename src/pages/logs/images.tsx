import { PageContainer, ProTable } from '@ant-design/pro-components';
import { DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Image, Space, Tag, Typography } from 'antd';
import { userApi } from '@/services/api';
import { browserDownloadName } from '@/utils/media';

const { Text } = Typography;

const statusMeta: Record<string, { text: string; color: string }> = {
  queued: { text: '排队', color: 'default' },
  running: { text: '生成中', color: 'processing' },
  succeeded: { text: '完成', color: 'success' },
  failed: { text: '失败', color: 'error' },
  canceled: { text: '已取消', color: 'warning' },
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
  return (
    <PageContainer
      title="图像生成历史"
      content={
        <Text type="secondary">
          调用 /v1/images/generations 的产物记录。同步接口的历史由后端在响应成功后补写。
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
            title: '时间',
            dataIndex: 'created_at',
            search: false,
            width: 170,
            render: (_, row) =>
              row.created_at ? new Date(row.created_at * 1000).toLocaleString() : '—',
          },
          {
            title: '预览',
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
          { title: '模型', dataIndex: 'model' },
          {
            title: '状态',
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
                      下载
                    </Button>
                  </Space>
                )}
                {row.status === 'failed' && row.error && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginTop: 10 }}
                    message={row.error.message}
                    description={row.error.code ? `错误码: ${row.error.code}` : undefined}
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
