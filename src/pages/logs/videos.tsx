import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Alert, Button, Tag, Typography } from 'antd';
import { DownloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { userApi } from '@/services/api';
import { publicMediaURL } from '@/utils/media';

const { Text, Link } = Typography;

// 状态 → 文案 + Tag 颜色。对齐 VideoPanel 的显示习惯。
const statusMeta: Record<string, { text: string; color: string }> = {
  queued: { text: '排队', color: 'default' },
  running: { text: '生成中', color: 'processing' },
  succeeded: { text: '完成', color: 'success' },
  failed: { text: '失败', color: 'error' },
  canceled: { text: '已取消', color: 'warning' },
};

function durationText(t: API.MediaTask): string {
  if (!t.completed_at || !t.created_at) return '—';
  const s = t.completed_at - t.created_at;
  return `${s}s`;
}

export default function VideoHistory() {
  return (
    <PageContainer
      title="视频生成历史"
      content={
        <Text type="secondary">
          调用 /v1/videos/generations 产生的任务历史。行展开可在线预览视频与下载。
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
            title: '时间',
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
          {
            title: '用时',
            search: false,
            width: 90,
            render: (_, row) => durationText(row),
          },
          {
            title: '产物',
            search: false,
            width: 120,
            render: (_, row) => {
              const url = publicMediaURL(row.data?.[0]?.url);
              if (!url) return '—';
              return (
                <Link href={url} target="_blank" rel="noreferrer">
                  <PlayCircleOutlined /> 查看
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
                        download={`video-${row.id}.mp4`}
                      >
                        下载
                      </Button>
                    </div>
                  </div>
                )}
                {row.status === 'failed' && row.error && (
                  <Alert
                    type="error"
                    showIcon
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
