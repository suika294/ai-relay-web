// ThreeDHistoryDrawer —— 3D 生成面板专用「历史记录」抽屉。
//
// 为什么不复用 MediaHistoryDrawer:3D 任务的数据形态(result_url / preview_url / files[])
// 与图像/视频的 MediaTask(data[].url)差异大 —— 3D 没有内嵌 3D viewer,只用 preview_url
// 当封面缩略图,产物是一组可下载的模型文件(GLB/OBJ/FBX/ZIP 等)。单开一个组件,避免把
// 这些 3D 专属渲染塞进共享抽屉、污染既有 image/video 路径。
//
// 数据源:GET /v1/3d/generations?page=&size=(APIKeyAuth,按 sk- key 隔离),响应
// 形如 API.Response<{ list: ThreeDHistoryTask[]; total: number }>,与视频/图像历史一致。
import { useEffect, useState } from 'react';
import { useIntl } from '@umijs/max';
import { Alert, Button, Drawer, Empty, Image, List, Spin, Tag, Typography } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiURL } from '@/utils/request';
import { browserDownloadName, publicMediaURL } from '@/utils/media';

const { Text } = Typography;

const PAGE_SIZE = 10;

// 与后端 ThreeDTaskView 对齐(service/three_d_service.go)。
interface ThreeDHistoryFile {
  type?: string;
  url?: string;
  filename?: string;
  preview_image_url?: string;
}
interface ThreeDHistoryTask {
  id: string;
  object: string;
  model: string;
  status: string;
  created_at: number;
  completed_at?: number;
  result_url?: string;
  preview_url?: string;
  files?: ThreeDHistoryFile[];
  error?: { code?: string; message?: string };
}

const statusMeta: Record<string, { key: string; color: string }> = {
  queued: { key: 'playground.mediaHistory.statusQueued', color: 'default' },
  running: { key: 'playground.mediaHistory.statusRunning', color: 'processing' },
  succeeded: { key: 'playground.mediaHistory.statusSucceeded', color: 'success' },
  failed: { key: 'playground.mediaHistory.statusFailed', color: 'error' },
};

function relTime(intl: ReturnType<typeof useIntl>, unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return intl.formatMessage({ id: 'playground.mediaHistory.timeJustNow' });
  if (diff < 3600)
    return intl.formatMessage(
      { id: 'playground.mediaHistory.timeMinutesAgo' },
      { n: Math.floor(diff / 60) },
    );
  if (diff < 86400)
    return intl.formatMessage(
      { id: 'playground.mediaHistory.timeHoursAgo' },
      { n: Math.floor(diff / 3600) },
    );
  const d = new Date(unixSec * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

// 从 file/type/url 推断文件类型标签,逻辑对齐 ThreeDPanel.threeDFileType 的简化版。
function fileTypeLabel(file: ThreeDHistoryFile): string {
  const raw = `${file.type || ''} ${file.filename || ''} ${file.url || ''}`.toLowerCase();
  if (/\.zip(?:[?#]|$)|(?:^|\W)zip(?:\W|$)/.test(raw)) return 'ZIP';
  for (const ext of ['glb', 'gltf', 'obj', 'fbx', 'stl', 'usdz', 'usd', 'mp4', 'gif']) {
    if (new RegExp(`\\.${ext}(?:[?#]|$)|(?:^|\\W)${ext}(?:\\W|$)`).test(raw)) return ext.toUpperCase();
  }
  return file.type || '3D';
}

function fileNameFallback(file: ThreeDHistoryFile, idx: number): string {
  if (file.filename) return file.filename;
  try {
    const u = new URL(file.url || '');
    const last = u.pathname.split('/').pop();
    if (last) return decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  return `3d-file-${idx + 1}`;
}

export interface ThreeDHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  // 公开 Playground 用 sk- key 拉历史(不依赖登录态)。没有 key 时抽屉提示先填 key,不发请求。
  apiKey?: string;
}

export default function ThreeDHistoryDrawer({ open, onClose, apiKey }: ThreeDHistoryDrawerProps) {
  const intl = useIntl();
  const [list, setList] = useState<ThreeDHistoryTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setList([]);
    setPage(1);
    setTotal(0);
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apiKey]);

  const loadPage = async (p: number, replace: boolean) => {
    if (!apiKey) {
      setList([]);
      setTotal(0);
      setErr(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const resp = await fetch(apiURL(`/v1/3d/generations?page=${p}&size=${PAGE_SIZE}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const res = (await resp.json()) as API.Response<{ list: ThreeDHistoryTask[]; total: number }>;
      if (res.code !== 0) {
        setErr(res.message || intl.formatMessage({ id: 'playground.mediaHistory.loadFailed' }));
        return;
      }
      const items = res.data?.list ?? [];
      setTotal(res.data?.total ?? 0);
      setList((prev) => (replace ? items : [...prev, ...items]));
      setPage(p);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const canLoadMore = list.length < total;

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{intl.formatMessage({ id: 'playground.mediaHistory.title3D' })}</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            {intl.formatMessage({ id: 'playground.mediaHistory.totalCount' }, { total })}
          </Text>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => loadPage(1, true)}
            loading={loading && list.length === 0}
            style={{ marginLeft: 'auto' }}
          >
            {intl.formatMessage({ id: 'playground.mediaHistory.refresh' })}
          </Button>
        </div>
      }
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
      bodyStyle={{ padding: '8px 12px' }}
    >
      {err && (
        <Alert
          type="error"
          showIcon
          closable
          message={err}
          onClose={() => setErr(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      {list.length === 0 && !loading && !err && (
        <Empty
          description={
            <Text type="secondary">
              {intl.formatMessage({ id: 'playground.mediaHistory.empty' })}
            </Text>
          }
        />
      )}

      <List
        dataSource={list}
        locale={{ emptyText: <span /> }}
        renderItem={(task) => <HistoryRow key={task.id} task={task} intl={intl} />}
      />

      {canLoadMore && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Button onClick={() => loadPage(page + 1, false)} loading={loading} size="small">
            {intl.formatMessage({ id: 'playground.mediaHistory.loadMore' })}
          </Button>
        </div>
      )}
      {loading && list.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function HistoryRow({
  task,
  intl,
}: {
  task: ThreeDHistoryTask;
  intl: ReturnType<typeof useIntl>;
}) {
  const cover = publicMediaURL(task.preview_url || task.files?.find((f) => f.preview_image_url)?.preview_image_url || '');
  const files = (task.files || []).filter((f) => f.url);
  const m = statusMeta[task.status] || { key: '', color: 'default' };
  const statusLabel = m.key ? intl.formatMessage({ id: m.key }) : task.status;

  return (
    <div style={{ padding: '10px 8px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* 缩略图 / 占位 */}
        <div
          style={{
            width: 88,
            height: 88,
            flex: '0 0 88px',
            borderRadius: 8,
            background: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {cover ? (
            <Image
              src={cover}
              width={88}
              height={88}
              style={{ objectFit: 'cover' }}
              preview={{ mask: intl.formatMessage({ id: 'playground.mediaHistory.preview' }) }}
            />
          ) : (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {task.status === 'failed'
                ? intl.formatMessage({ id: 'playground.mediaHistory.statusFailed' })
                : intl.formatMessage({ id: 'playground.mediaHistory.noOutput' })}
            </Text>
          )}
        </div>

        {/* 信息列 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <Tag color={m.color} style={{ margin: 0 }}>
              {statusLabel}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {relTime(intl, task.created_at)}
            </Text>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>{task.model}</div>
          {task.status === 'failed' && task.error?.message && (
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: '#cf1322',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={task.error.message}
            >
              {task.error.message}
            </div>
          )}

          {/* 产物文件下载 */}
          {files.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {files.map((f, idx) => {
                const url = publicMediaURL(f.url || '');
                const name = fileNameFallback(f, idx);
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag style={{ margin: 0 }}>{fileTypeLabel(f)}</Tag>
                    <Button
                      size="small"
                      type="link"
                      icon={<DownloadOutlined />}
                      href={url}
                      target="_blank"
                      download={browserDownloadName(url, name)}
                      style={{ padding: 0 }}
                    >
                      {intl.formatMessage({ id: 'playground.mediaHistory.download' })}
                    </Button>
                    <Text type="secondary" ellipsis style={{ fontSize: 11 }} title={name}>
                      {name}
                    </Text>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
