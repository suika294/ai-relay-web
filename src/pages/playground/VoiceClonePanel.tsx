// Playground「我的克隆音色」面板(统一表单版)。
//
// 设计:**所有厂商共用同一套字段**,不再随厂商增删 ——
//   名称* / Voice ID(选填,留空自动生成)/ 试听文本(选填)/ 描述 / 语言 / 样本音频*。
// 试听统一:填了试听文本就返试听音频。原生支持的厂商(vidu/minimax)上游直接返;其余厂商
// 后端用该厂商 TTS 合成(可灵无 TTS 暂不出试听)。prefix/target_model 等厂商专属参数后端取默认。
//
// 功能:列表 / 上传(multipart,file 走后端 OSS 转存)/ 试听 demo / 删除 / 非终态自动轮询。

import { Alert, Button, Card, Empty, Form, Input, Popconfirm, Radio, Select, Space, Spin, Table, Tag, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useIntl } from '@umijs/max';

import { tokenApi } from '@/services/api';
import { apiURL } from '@/utils/request';
import { t } from '@/utils/i18n';

const LS_PROVIDER = 'playground_voice_clone_provider_v1';

type ProviderType = 'volc_speech' | 'elevenlabs' | 'vidu' | 'dashscope_speech' | 'kling' | 'tencent_voice_clone' | 'minimax';

interface ProviderMeta {
  label: string;
  // voiceIdRule:用户填了 Voice ID 时的校验规则(留空一律放行,后端自动生成)。
  voiceIdRule: 'volc' | 'custom' | null;
  voiceIdHint: string;
  // voiceIdDisabled:该厂商完全忽略用户填的 voice_id(如可灵以 task_id 句柄管理,成品 voice_id
  // 由上游生成、就绪后自动回填),置灰输入框避免「填了却被忽略」的困惑。
  voiceIdDisabled?: boolean;
  note: string;
}

// voice_id 自定义命名约束(vidu / minimax 同款,与后端校验对齐)。
function validateCustomVoiceID(id: string): string | null {
  if (id.length < 8 || id.length > 256) return t('playground.voiceClone.vidLenErr');
  if (!/^[A-Za-z]/.test(id)) return t('playground.voiceClone.vidFirstCharErr');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return t('playground.voiceClone.vidCharsetErr');
  if (/[-_]$/.test(id)) return t('playground.voiceClone.vidTailErr');
  return null;
}

const PROVIDERS: Record<ProviderType, ProviderMeta> = {
  volc_speech: {
    label: t('playground.voiceClone.providerVolc'),
    voiceIdRule: 'volc',
    voiceIdHint: t('playground.voiceClone.hintVolc'),
    note: t('playground.voiceClone.noteVolc'),
  },
  elevenlabs: {
    label: 'ElevenLabs',
    voiceIdRule: null,
    voiceIdHint: t('playground.voiceClone.hintElevenlabs'),
    note: t('playground.voiceClone.noteElevenlabs'),
  },
  vidu: {
    label: 'Vidu',
    voiceIdRule: 'custom',
    voiceIdHint: t('playground.voiceClone.hintCustom'),
    note: t('playground.voiceClone.noteVidu'),
  },
  dashscope_speech: {
    label: t('playground.voiceClone.providerDashscope'),
    voiceIdRule: null,
    voiceIdHint: t('playground.voiceClone.hintDashscope'),
    note: t('playground.voiceClone.noteDashscope'),
  },
  kling: {
    label: t('playground.voiceClone.providerKling'),
    voiceIdRule: null,
    voiceIdDisabled: true,
    voiceIdHint: t('playground.voiceClone.hintKling'),
    note: t('playground.voiceClone.noteKling'),
  },
  tencent_voice_clone: {
    label: t('playground.voiceClone.providerTencent'),
    voiceIdRule: null,
    voiceIdHint: t('playground.voiceClone.hintTencent'),
    note: t('playground.voiceClone.noteTencent'),
  },
  minimax: {
    label: 'MiniMax',
    voiceIdRule: 'custom',
    voiceIdHint: t('playground.voiceClone.hintCustom'),
    note: t('playground.voiceClone.noteMinimax'),
  },
};

interface VoiceClone {
  id: number;
  user_id: number;
  channel_id: number;
  provider_type: ProviderType;
  voice_id: string;
  display_name: string;
  description?: string;
  status: 'queued' | 'training' | 'ready' | 'failed' | 'not_found';
  demo_audio_url?: string;
  audio_format?: string;
  language?: string;
  error_msg?: string;
  sample_asset_id?: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'default',
  training: 'processing',
  ready: 'success',
  failed: 'error',
  not_found: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  queued: t('playground.voiceClone.statusQueued'),
  training: t('playground.voiceClone.statusTraining'),
  ready: t('playground.voiceClone.statusReady'),
  failed: t('playground.voiceClone.statusFailed'),
  not_found: t('playground.voiceClone.statusNotFound'),
};

export default function VoiceClonePanel() {
  const intl = useIntl();
  const [tokens, setTokens] = useState<API.Token[]>([]);
  const [tokenId, setTokenId] = useState<number | undefined>();
  const [provider, setProvider] = useState<ProviderType>(() => (localStorage.getItem(LS_PROVIDER) as ProviderType) || 'vidu');
  const [list, setList] = useState<VoiceClone[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voiceID, setVoiceID] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('zh');
  const [text, setText] = useState('');
  const fileRef = useRef<File | null>(null);
  const pollRef = useRef<number | null>(null);

  const meta = PROVIDERS[provider];
  const selectedToken = useMemo(() => tokens.find((t) => t.id === tokenId), [tokens, tokenId]);

  useEffect(() => {
    localStorage.setItem(LS_PROVIDER, provider);
  }, [provider]);

  useEffect(() => {
    tokenApi.list().then((res) => {
      const ts = ((res.data as API.Token[]) || []).filter((t) => t.status === 1);
      setTokens(ts);
      if (ts.length > 0) setTokenId((prev) => prev ?? ts[0].id);
    });
  }, []);

  const fetchList = useCallback(async () => {
    if (!selectedToken) return;
    setLoading(true);
    try {
      const res = await fetch(apiURL('/v1/audio/voice_clones'), {
        headers: { Authorization: `Bearer ${selectedToken.key}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      setList((body?.data as VoiceClone[]) || []);
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.voiceClone.loadListFailed' }));
    } finally {
      setLoading(false);
    }
  }, [selectedToken]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 非终态行自动轮询:每 10s 查一次 ?refresh=true,直到全部终态或离开页面
  const schedulePoll = useCallback(() => {
    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    const hasNonTerminal = list.some((v) => v.status === 'queued' || v.status === 'training');
    if (!hasNonTerminal || !selectedToken) return;
    pollRef.current = window.setTimeout(async () => {
      const targets = list.filter((v) => v.status === 'queued' || v.status === 'training');
      const updates = await Promise.all(
        targets.map(async (v) => {
          try {
            const r = await fetch(apiURL(`/v1/audio/voice_clones/${v.id}?refresh=true`), {
              headers: { Authorization: `Bearer ${selectedToken.key}` },
            });
            if (!r.ok) return null;
            return (await r.json()) as VoiceClone;
          } catch {
            return null;
          }
        }),
      );
      setList((prev) => {
        const map = new Map(prev.map((v) => [v.id, v]));
        updates.forEach((u) => {
          if (u) map.set(u.id, u);
        });
        return Array.from(map.values()).sort((a, b) => b.id - a.id);
      });
    }, 10000);
  }, [list, selectedToken]);

  useEffect(() => {
    schedulePoll();
    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [schedulePoll]);

  // 提交前本地校验(与后端规则对齐)。返回错误文案或 null。
  const validate = (): string | null => {
    if (!selectedToken) return intl.formatMessage({ id: 'playground.voiceClone.valNoToken' });
    if (!name.trim()) return intl.formatMessage({ id: 'playground.voiceClone.valNoName' });
    if (!fileRef.current) return intl.formatMessage({ id: 'playground.voiceClone.valNoFile' });
    const v = voiceID.trim();
    if (v) {
      if (meta.voiceIdRule === 'volc' && !v.startsWith('S_')) {
        return intl.formatMessage({ id: 'playground.voiceClone.valVolcPrefix' });
      }
      if (meta.voiceIdRule === 'custom') {
        const err = validateCustomVoiceID(v);
        if (err) return err;
      }
    } else if (meta.voiceIdRule === 'volc') {
      return intl.formatMessage({ id: 'playground.voiceClone.valVolcRequired' });
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      message.warning(err);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('provider_type', provider);
      form.append('name', name.trim());
      if (description.trim()) form.append('description', description.trim());
      if (voiceID.trim()) form.append('voice_id', voiceID.trim());
      if (language.trim()) form.append('language', language.trim());
      if (text.trim()) form.append('text', text.trim());
      form.append('file', fileRef.current as File);

      const res = await fetch(apiURL('/v1/audio/voice_clones'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${selectedToken!.key}` },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      message.success(intl.formatMessage({ id: 'playground.voiceClone.uploadSuccess' }));
      setVoiceID('');
      setName('');
      setDescription('');
      setText('');
      fileRef.current = null;
      fetchList();
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.voiceClone.uploadFailed' }));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!selectedToken) return;
    try {
      const res = await fetch(apiURL(`/v1/audio/voice_clones/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${selectedToken.key}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      message.success(intl.formatMessage({ id: 'playground.voiceClone.deleteSuccess' }));
      fetchList();
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.voiceClone.deleteFailed' }));
    }
  };

  const handleManualRefresh = async (id: number) => {
    if (!selectedToken) return;
    try {
      const res = await fetch(apiURL(`/v1/audio/voice_clones/${id}/refresh`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${selectedToken.key}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as VoiceClone;
      setList((prev) => prev.map((v) => (v.id === id ? updated : v)));
      message.success(intl.formatMessage({ id: 'playground.voiceClone.refreshSuccess' }));
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.voiceClone.refreshFailed' }));
    }
  };

  const uploadProps: UploadProps = {
    multiple: false,
    maxCount: 1,
    accept: '.wav,.mp3,.m4a,.aac,.ogg,.flac,audio/*',
    beforeUpload: (file) => {
      fileRef.current = file;
      return false; // 阻止 antd 自带上传,handleSubmit 里走 fetch + multipart
    },
    onRemove: () => {
      fileRef.current = null;
    },
  };

  return (
    <div className="pg-voice-clone">
      {/* Token 选择 + provider 切换 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <span>{intl.formatMessage({ id: 'playground.voiceClone.apiTokenLabel' })}</span>
          <Select style={{ width: 220 }} placeholder={intl.formatMessage({ id: 'playground.voiceClone.selectTokenPlaceholder' })} value={tokenId} onChange={setTokenId} options={tokens.map((tk) => ({ value: tk.id, label: tk.name }))} />
          <span style={{ marginLeft: 16 }}>{intl.formatMessage({ id: 'playground.voiceClone.providerLabel' })}</span>
          <Radio.Group
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            optionType="button"
            options={(Object.keys(PROVIDERS) as ProviderType[]).map((p) => ({
              value: p,
              label: PROVIDERS[p].label,
            }))}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchList} loading={loading}>
            {intl.formatMessage({ id: 'playground.voiceClone.refreshBtn' })}
          </Button>
        </Space>
      </Card>

      {/* 上传表单(所有厂商统一字段) */}
      <Card size="small" title={intl.formatMessage({ id: 'playground.voiceClone.uploadCardTitle' })} style={{ marginBottom: 12 }}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={meta.note} />
        <Form layout="vertical">
          <Form.Item label={intl.formatMessage({ id: 'playground.voiceClone.nameLabel' })} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={intl.formatMessage({ id: 'playground.voiceClone.namePlaceholder' })} maxLength={50} />
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.voiceClone.voiceIdLabel' })} extra={meta.voiceIdHint}>
            <Input value={meta.voiceIdDisabled ? '' : voiceID} onChange={(e) => setVoiceID(e.target.value)} disabled={meta.voiceIdDisabled} placeholder={meta.voiceIdDisabled ? intl.formatMessage({ id: 'playground.voiceClone.voiceIdPlaceholderKling' }) : intl.formatMessage({ id: 'playground.voiceClone.voiceIdPlaceholder' })} />
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.voiceClone.demoTextLabel' })} extra={intl.formatMessage({ id: 'playground.voiceClone.demoTextExtra' })}>
            <Input.TextArea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={intl.formatMessage({ id: 'playground.voiceClone.demoTextPlaceholder' })} maxLength={1000} />
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.voiceClone.descLabel' })}>
            <Input.TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={intl.formatMessage({ id: 'playground.voiceClone.descPlaceholder' })} maxLength={200} />
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.voiceClone.langLabel' })}>
            <Select
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'zh', label: intl.formatMessage({ id: 'playground.voiceClone.langZh' }) },
                { value: 'en', label: intl.formatMessage({ id: 'playground.voiceClone.langEn' }) },
                { value: 'ja', label: intl.formatMessage({ id: 'playground.voiceClone.langJa' }) },
                { value: 'ko', label: intl.formatMessage({ id: 'playground.voiceClone.langKo' }) },
              ]}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.voiceClone.sampleLabel' })}>
            <Upload {...uploadProps}>
              <Button icon={<CloudUploadOutlined />}>{intl.formatMessage({ id: 'playground.voiceClone.chooseFileBtn' })}</Button>
            </Upload>
            <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>{intl.formatMessage({ id: 'playground.voiceClone.sampleHint' })}</div>
          </Form.Item>
          <Button type="primary" onClick={handleSubmit} loading={uploading}>
            {intl.formatMessage({ id: 'playground.voiceClone.submitBtn' })}
          </Button>
        </Form>
      </Card>

      {/* 列表 */}
      <Card size="small" title={intl.formatMessage({ id: 'playground.voiceClone.listCardTitle' }, { count: list.length })}>
        {loading && list.length === 0 ? (
          <Spin />
        ) : list.length === 0 ? (
          <Empty description={intl.formatMessage({ id: 'playground.voiceClone.emptyDesc' })} />
        ) : (
          <Table<VoiceClone>
            rowKey="id"
            dataSource={list}
            pagination={false}
            size="small"
            columns={[
              {
                title: intl.formatMessage({ id: 'playground.voiceClone.colProvider' }),
                dataIndex: 'provider_type',
                render: (v) => <Tag>{PROVIDERS[v as ProviderType]?.label || v}</Tag>,
                width: 120,
              },
              {
                title: 'Voice ID',
                dataIndex: 'voice_id',
                render: (v) => <code style={{ fontSize: 12 }}>{v}</code>,
                ellipsis: true,
              },
              { title: intl.formatMessage({ id: 'playground.voiceClone.colName' }), dataIndex: 'display_name', ellipsis: true },
              {
                title: intl.formatMessage({ id: 'playground.voiceClone.colStatus' }),
                dataIndex: 'status',
                render: (s, row) => (
                  <Space size={4}>
                    <Tag color={STATUS_COLOR[s] || 'default'}>{STATUS_LABEL[s] || s}</Tag>
                    {row.error_msg && (
                      <span title={row.error_msg} style={{ color: '#cf1322', fontSize: 12 }}>
                        ⚠
                      </span>
                    )}
                  </Space>
                ),
                width: 110,
              },
              {
                title: intl.formatMessage({ id: 'playground.voiceClone.colDemo' }),
                dataIndex: 'demo_audio_url',
                render: (url) =>
                  url ? (
                    <audio controls src={url} style={{ height: 28 }}>
                      {intl.formatMessage({ id: 'playground.voiceClone.audioUnsupported' })}
                    </audio>
                  ) : (
                    <span style={{ color: '#999' }}>—</span>
                  ),
                width: 220,
              },
              {
                title: intl.formatMessage({ id: 'playground.voiceClone.colCreatedAt' }),
                dataIndex: 'created_at',
                render: (createdAt) => new Date(createdAt).toLocaleString(),
                width: 160,
              },
              {
                title: intl.formatMessage({ id: 'playground.voiceClone.colAction' }),
                key: 'action',
                render: (_, row) => (
                  <Space size={4}>
                    {/* 刷新始终可点:后端 /refresh 强制无视终态同步。可灵「可用」行靠它把
                        task_id 句柄解析成真实成品 voice_id(并消除误导性 ⚠)。 */}
                    <Button size="small" type="link" icon={<ReloadOutlined />} onClick={() => handleManualRefresh(row.id)}>
                      {intl.formatMessage({ id: 'playground.voiceClone.refreshBtn' })}
                    </Button>
                    <Popconfirm title={intl.formatMessage({ id: 'playground.voiceClone.deleteConfirmTitle' })} description={intl.formatMessage({ id: 'playground.voiceClone.deleteConfirmDesc' })} onConfirm={() => handleDelete(row.id)}>
                      <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                        {intl.formatMessage({ id: 'common.delete' })}
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
                width: 140,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
