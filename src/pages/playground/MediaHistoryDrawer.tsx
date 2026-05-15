// MediaHistoryDrawer —— 图像/视频两个 Playground 面板共用的"历史记录"抽屉。
//
// 为什么放在这里而不是通用 components 目录:
//   这个组件的 UX 是贴着 Playground 的使用场景设计的(粗粒度分页、偏小的预览大小、
//   点一行就直接在抽屉里展开大图/视频),不适合作为通用组件推广。放在 pages/playground
//   下跟两个消费方就近,重构时一起改。
//
// 为什么不用 ProTable:
//   ProTable 有 search/toolbar/pagination 一整套 header,抽屉里窄、高度也有限,
//   自己手写 List + "加载更多"按钮反而更合适。
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Image,
  List,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  DownloadOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { userApi } from '@/services/api';
import { browserDownloadName, publicMediaURL } from '@/utils/media';

const { Text } = Typography;

const PAGE_SIZE = 10;

const statusMeta: Record<string, { text: string; color: string }> = {
  queued: { text: '排队', color: 'default' },
  running: { text: '生成中', color: 'processing' },
  succeeded: { text: '完成', color: 'success' },
  failed: { text: '失败', color: 'error' },
  canceled: { text: '已取消', color: 'warning' },
};

// 从 data[0] 里挖出 <img>/<video> 可直接用的资源地址。
// 图像有 url + b64_json 两种模式;视频只有 url(上游 CDN)。
function primaryURL(t: API.MediaTask): string | undefined {
  const d = t.data?.[0];
  if (!d) return undefined;
  if (d.url) return publicMediaURL(d.url);
  if (d.b64_json) return `data:image/png;base64,${d.b64_json}`;
  return undefined;
}

// 简短的 "xx 前" / "HH:mm" 时间标签。列表只求辨识,不必精确。
function relTime(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  const d = new Date(unixSec * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface MediaHistoryDrawerProps {
  kind: 'image' | 'video';
  open: boolean;
  onClose: () => void;
  // 通知父组件"重新把这条的 prompt 填回输入框" —— 回头可再生一张
  onReuse?: (task: API.MediaTask) => void;
}

export default function MediaHistoryDrawer({
  kind,
  open,
  onClose,
  onReuse,
}: MediaHistoryDrawerProps) {
  const [list, setList] = useState<API.MediaTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 每次打开抽屉、或切换 kind,都从第一页重新加载。关闭不清数据,下次打开更快。
  useEffect(() => {
    if (!open) return;
    setList([]);
    setPage(1);
    setTotal(0);
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const loadPage = async (p: number, replace: boolean) => {
    setLoading(true);
    setErr(null);
    try {
      const fn = kind === 'image' ? userApi.images : userApi.videos;
      const res = await fn({ page: p, size: PAGE_SIZE });
      if (res.code !== 0) {
        setErr(res.message || '加载失败');
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
  const title = kind === 'image' ? '图像历史' : '视频历史';

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{title}</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            共 {total} 条
          </Text>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => loadPage(1, true)}
            loading={loading && list.length === 0}
            style={{ marginLeft: 'auto' }}
          >
            刷新
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
        <Empty description={<Text type="secondary">暂无历史记录</Text>} />
      )}

      <List
        dataSource={list}
        locale={{ emptyText: <span /> }}
        renderItem={(t) => (
          <HistoryRow key={t.id} task={t} kind={kind} onReuse={onReuse} />
        )}
      />

      {canLoadMore && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Button
            onClick={() => loadPage(page + 1, false)}
            loading={loading}
            size="small"
          >
            加载更多
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

// 单条记录渲染 —— 抽成子组件,因为行内的 [展开详情] 需要自己维护 open 状态。
function HistoryRow({
  task,
  kind,
  onReuse,
}: {
  task: API.MediaTask;
  kind: 'image' | 'video';
  onReuse?: (task: API.MediaTask) => void;
}) {
  const src = primaryURL(task);
  const m = statusMeta[task.status] || { text: task.status, color: 'default' };

  return (
    <div
      style={{
        padding: '10px 8px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
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
          {kind === 'image' && src && (
            <Image
              src={src}
              width={88}
              height={88}
              style={{ objectFit: 'cover' }}
              preview={{ mask: '预览' }}
            />
          )}
          {kind === 'video' && src && (
            <video
              src={src}
              poster={task.data?.[0]?.cover_url}
              muted
              preload="metadata"
              style={{ width: 88, height: 88, objectFit: 'cover' }}
            />
          )}
          {!src && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {task.status === 'failed' ? '失败' : '无产物'}
            </Text>
          )}
        </div>

        {/* 信息列 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Tag color={m.color} style={{ margin: 0 }}>
              {m.text}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {relTime(task.created_at)}
            </Text>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: '#666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
            title={task.prompt}
          >
            {task.prompt || <Text type="secondary">(无提示词)</Text>}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>
            {task.model}
          </div>
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

          {/* 行尾操作栏 */}
          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            {src && kind === 'video' && (
              <Button
                size="small"
                type="link"
                icon={<PlayCircleOutlined />}
                href={src}
                target="_blank"
                rel="noreferrer"
              >
                播放
              </Button>
            )}
            {src && (
              (() => {
                const filename =
                  kind === 'video' ? `video-${task.id}.mp4` : `image-${task.id}.png`;
                return (
                  <Button
                    size="small"
                    type="link"
                    icon={<DownloadOutlined />}
                    href={src}
                    target="_blank"
                    download={browserDownloadName(src, filename)}
                  >
                    下载
                  </Button>
                );
              })()
            )}
            {task.prompt && onReuse && (
              <Button size="small" type="link" onClick={() => onReuse(task)}>
                重用提示词
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
