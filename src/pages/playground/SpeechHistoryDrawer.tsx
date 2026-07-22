// SpeechHistoryDrawer —— 语音面板(TTS 合成 / ASR 识别)专用「历史记录」抽屉。
//
// 为什么单开:语音任务形态(TTS 出音频 output_audio_url、ASR 出文本 output_text)与图像/
// 视频的 MediaTask 完全不同 —— TTS 条目内嵌 <audio> 播放器,ASR 条目展示识别文本。单开
// 组件避免把这些塞进共享的 MediaHistoryDrawer,守住既有 image/video 路径不变。
//
// 数据源:GET /v1/audio/speech/history(TTS)或 /v1/audio/transcriptions/history(ASR),
// APIKeyAuth 按 sk- key 隔离,响应 API.Response<{ list: SpeechHistoryTask[]; total: number }>。
// 仅收录**异步**提交的任务(同步即时结果不落库)。
import { useEffect, useState } from 'react';
import { useIntl } from '@umijs/max';
import { Alert, Button, Drawer, Empty, List, Spin, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiURL } from '@/utils/request';
import { publicMediaURL } from '@/utils/media';

const { Text, Paragraph } = Typography;

const PAGE_SIZE = 10;

// 与后端 SpeechTaskView 对齐(service/speech_task_persist.go)。
interface SpeechHistoryTask {
  id: string;
  object: string;
  kind: 'tts' | 'asr';
  status: string;
  model: string;
  created_at: number;
  completed_at?: number;
  input_text?: string;
  input_audio_url?: string;
  output_audio_url?: string;
  output_text?: string;
  char_count?: number;
  duration_ms?: number;
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

export interface SpeechHistoryDrawerProps {
  kind: 'tts' | 'asr';
  open: boolean;
  onClose: () => void;
  apiKey?: string;
}

export default function SpeechHistoryDrawer({ kind, open, onClose, apiKey }: SpeechHistoryDrawerProps) {
  const intl = useIntl();
  const [list, setList] = useState<SpeechHistoryTask[]>([]);
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
  }, [open, kind, apiKey]);

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
      const path =
        kind === 'tts' ? '/v1/audio/speech/history' : '/v1/audio/transcriptions/history';
      const resp = await fetch(apiURL(`${path}?page=${p}&size=${PAGE_SIZE}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const res = (await resp.json()) as API.Response<{ list: SpeechHistoryTask[]; total: number }>;
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
  const titleKey =
    kind === 'tts' ? 'playground.mediaHistory.titleTTS' : 'playground.mediaHistory.titleASR';

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{intl.formatMessage({ id: titleKey })}</span>
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
  task: SpeechHistoryTask;
  intl: ReturnType<typeof useIntl>;
}) {
  const m = statusMeta[task.status] || { key: '', color: 'default' };
  const statusLabel = m.key ? intl.formatMessage({ id: m.key }) : task.status;
  const audioURL = task.output_audio_url ? publicMediaURL(task.output_audio_url) : '';

  return (
    <div style={{ padding: '10px 8px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <Tag color={m.color} style={{ margin: 0 }}>
          {statusLabel}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {relTime(intl, task.created_at)}
        </Text>
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>{task.model}</div>

      {/* TTS:输入原文 + 音频播放 */}
      {task.kind === 'tts' && (
        <>
          {task.input_text && (
            <Paragraph
              type="secondary"
              ellipsis={{ rows: 2 }}
              style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}
              title={task.input_text}
            >
              {intl.formatMessage({ id: 'playground.mediaHistory.inputText' })}: {task.input_text}
            </Paragraph>
          )}
          {audioURL ? (
            <audio controls preload="none" src={audioURL} style={{ width: '100%', marginTop: 6 }} />
          ) : (
            task.status === 'succeeded' && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#999' }}>
                {intl.formatMessage({ id: 'playground.mediaHistory.noAudio' })}
              </div>
            )
          )}
        </>
      )}

      {/* ASR:识别结果文本 */}
      {task.kind === 'asr' && task.output_text && (
        <Paragraph
          copyable
          ellipsis={{ rows: 4, expandable: true, symbol: intl.formatMessage({ id: 'playground.mediaHistory.preview' }) }}
          style={{ marginTop: 6, marginBottom: 0, fontSize: 13 }}
        >
          {task.output_text}
        </Paragraph>
      )}

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
    </div>
  );
}
