// Playground「AIGC 素材」面板(腾讯云 VOD AIGC 真人 / 非真人素材)。
//
// 真人素材:发起活体认证 → 在 H5 完成扫脸 → 查结果拿 group_id → 建素材。
// 非真人素材:免活体,直接建素材(group_id 留空自动生成)。
// 产物拿到腾讯 AssetId,可在「视频」面板选素材引用(asset://<AssetId>)生视频(豆包 VS)。
//
// 全程走 sk-xxx 打 /v1/aigc/*,与后端 relay 端点对齐。

import { Alert, Button, Card, Empty, Form, Input, Popconfirm, Radio, Select, Space, Spin, Table, Tag, Typography, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useIntl } from '@umijs/max';

import { apiURL } from '@/utils/request';
import { t } from '@/utils/i18n';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';
import { playgroundUpload } from './upload';

type AssetType = 'Image' | 'Video' | 'Audio';

interface AigcMaterial {
  id: number;
  is_real_person: boolean;
  group_id: string;
  asset_type: string;
  display_name?: string;
  upstream_task_id?: string;
  upstream_asset_id?: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  error_msg?: string;
  created_at: string;
}

interface LivenessSession {
  id: number;
  h5_link?: string;
  status: 'pending' | 'done' | 'failed';
  group_id?: string;
  error_msg?: string;
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'default',
  processing: 'processing',
  ready: 'success',
  failed: 'error',
};

export default function AigcMaterialPanel() {
  const intl = useIntl();
  const { apiKey } = usePlaygroundApiKey();

  // 活体
  const [liveness, setLiveness] = useState<LivenessSession | null>(null);
  const [livenessLoading, setLivenessLoading] = useState(false);

  // 创建素材表单
  const [isRealPerson, setIsRealPerson] = useState(false);
  const [groupID, setGroupID] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('Image');
  const [fileURL, setFileURL] = useState('');
  const [assetName, setAssetName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<File | null>(null);

  // 列表
  const [list, setList] = useState<AigcMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  const statusLabel = (s: string) =>
    intl.formatMessage({ id: `playground.aigcMaterial.status_${s}`, defaultMessage: s });

  // ---------- 列表 ----------
  const fetchList = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const res = await fetch(apiURL('/v1/aigc/materials'), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      setList((body?.data as AigcMaterial[]) || []);
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.aigcMaterial.loadListFailed' }));
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 非终态自动轮询(queued/processing),每 10s 查 ?refresh=true
  const schedulePoll = useCallback(() => {
    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    const hasNonTerminal = list.some((v) => v.status === 'queued' || v.status === 'processing');
    if (!hasNonTerminal || !apiKey) return;
    pollRef.current = window.setTimeout(async () => {
      const targets = list.filter((v) => v.status === 'queued' || v.status === 'processing');
      const updates = await Promise.all(
        targets.map(async (v) => {
          try {
            const r = await fetch(apiURL(`/v1/aigc/materials/${v.id}?refresh=true`), {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (!r.ok) return null;
            return (await r.json()) as AigcMaterial;
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
  }, [list, apiKey]);

  useEffect(() => {
    schedulePoll();
    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [schedulePoll]);

  // ---------- 活体 ----------
  const startLiveness = async () => {
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
    setLivenessLoading(true);
    try {
      const res = await fetch(apiURL('/v1/aigc/liveness'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: '{}',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      setLiveness(body as LivenessSession);
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.aigcMaterial.livenessFailed' }));
    } finally {
      setLivenessLoading(false);
    }
  };

  const checkLiveness = async () => {
    if (!apiKey || !liveness) return;
    setLivenessLoading(true);
    try {
      const res = await fetch(apiURL(`/v1/aigc/liveness/${liveness.id}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      const s = body as LivenessSession;
      setLiveness(s);
      if (s.status === 'done' && s.group_id) {
        setIsRealPerson(true);
        setGroupID(s.group_id);
        message.success(intl.formatMessage({ id: 'playground.aigcMaterial.livenessDone' }));
      }
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.aigcMaterial.livenessFailed' }));
    } finally {
      setLivenessLoading(false);
    }
  };

  // ---------- 上传媒体 ----------
  const uploadProps: UploadProps = {
    multiple: false,
    maxCount: 1,
    showUploadList: { showRemoveIcon: true },
    beforeUpload: async (file) => {
      fileRef.current = file;
      if (!apiKey) {
        message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
        return false;
      }
      setUploading(true);
      try {
        const { url } = await playgroundUpload(file, apiKey, { module: 'aigc_material' });
        setFileURL(url);
        message.success(intl.formatMessage({ id: 'playground.aigcMaterial.uploadOk' }));
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'playground.aigcMaterial.uploadFailed' }));
      } finally {
        setUploading(false);
      }
      return false; // 阻止 antd 自带上传
    },
    onRemove: () => {
      fileRef.current = null;
    },
  };

  // ---------- 创建素材 ----------
  const handleCreate = async () => {
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));
    if (isRealPerson && !groupID.trim()) {
      return message.warning(intl.formatMessage({ id: 'playground.aigcMaterial.valNoGroup' }));
    }
    if (!fileURL.trim()) {
      return message.warning(intl.formatMessage({ id: 'playground.aigcMaterial.valNoFile' }));
    }
    setSubmitting(true);
    try {
      const res = await fetch(apiURL('/v1/aigc/materials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          is_real_person: isRealPerson,
          group_id: groupID.trim(),
          asset_type: assetType,
          file_url: fileURL.trim(),
          asset_name: assetName.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      message.success(intl.formatMessage({ id: 'playground.aigcMaterial.createOk' }));
      setFileURL('');
      setAssetName('');
      fileRef.current = null;
      fetchList();
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.aigcMaterial.createFailed' }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!apiKey) return;
    try {
      const res = await fetch(apiURL(`/v1/aigc/materials/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      message.success(intl.formatMessage({ id: 'playground.aigcMaterial.deleteOk' }));
      fetchList();
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.aigcMaterial.deleteFailed' }));
    }
  };

  const handleRefreshOne = async (id: number) => {
    if (!apiKey) return;
    try {
      const res = await fetch(apiURL(`/v1/aigc/materials/${id}?refresh=true`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as AigcMaterial;
      setList((prev) => prev.map((v) => (v.id === id ? updated : v)));
    } catch (e: any) {
      message.error(e?.message || intl.formatMessage({ id: 'playground.aigcMaterial.refreshFailed' }));
    }
  };

  return (
    <div className="pg-aigc-material">
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap align="end">
          <ApiKeyField />
          <Button icon={<ReloadOutlined />} onClick={fetchList} loading={loading}>
            {intl.formatMessage({ id: 'playground.aigcMaterial.refreshBtn' })}
          </Button>
        </Space>
      </Card>

      {/* 活体认证(真人素材前置) */}
      <Card size="small" title={intl.formatMessage({ id: 'playground.aigcMaterial.livenessCardTitle' })} style={{ marginBottom: 12 }}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={intl.formatMessage({ id: 'playground.aigcMaterial.livenessNote' })} />
        <Space wrap>
          <Button type="primary" onClick={startLiveness} loading={livenessLoading}>
            {intl.formatMessage({ id: 'playground.aigcMaterial.startLivenessBtn' })}
          </Button>
          {liveness?.h5_link && (
            <Typography.Link href={liveness.h5_link} target="_blank" rel="noreferrer">
              {intl.formatMessage({ id: 'playground.aigcMaterial.openH5Btn' })}
            </Typography.Link>
          )}
          {liveness && (
            <Button onClick={checkLiveness} loading={livenessLoading}>
              {intl.formatMessage({ id: 'playground.aigcMaterial.checkLivenessBtn' })}
            </Button>
          )}
          {liveness && (
            <Space size={4}>
              <span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.aigcMaterial.livenessStatusLabel' })}</span>
              <Tag color={liveness.status === 'done' ? 'success' : liveness.status === 'failed' ? 'error' : 'processing'}>
                {liveness.status}
              </Tag>
              {liveness.group_id && <code style={{ fontSize: 12 }}>{liveness.group_id}</code>}
            </Space>
          )}
        </Space>
      </Card>

      {/* 创建素材 */}
      <Card size="small" title={intl.formatMessage({ id: 'playground.aigcMaterial.createCardTitle' })} style={{ marginBottom: 12 }}>
        <Form layout="vertical">
          <Form.Item label={intl.formatMessage({ id: 'playground.aigcMaterial.isRealPersonLabel' })}>
            <Radio.Group
              value={isRealPerson}
              onChange={(e) => setIsRealPerson(e.target.value)}
              optionType="button"
              options={[
                { value: false, label: intl.formatMessage({ id: 'playground.aigcMaterial.nonRealPerson' }) },
                { value: true, label: intl.formatMessage({ id: 'playground.aigcMaterial.realPerson' }) },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="GroupId"
            required={isRealPerson}
            extra={intl.formatMessage({ id: isRealPerson ? 'playground.aigcMaterial.groupIdExtraReal' : 'playground.aigcMaterial.groupIdExtraNonReal' })}
          >
            <Input
              value={groupID}
              onChange={(e) => setGroupID(e.target.value)}
              placeholder={intl.formatMessage({ id: isRealPerson ? 'playground.aigcMaterial.groupIdPhReal' : 'playground.aigcMaterial.groupIdPhNonReal' })}
            />
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.aigcMaterial.assetTypeLabel' })}>
            <Select
              value={assetType}
              onChange={(v) => setAssetType(v)}
              style={{ width: 200 }}
              options={[
                { value: 'Image', label: 'Image' },
                { value: 'Video', label: 'Video' },
                { value: 'Audio', label: 'Audio' },
              ]}
            />
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.aigcMaterial.mediaLabel' })} extra={intl.formatMessage({ id: 'playground.aigcMaterial.mediaExtra' })}>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={fileURL} onChange={(e) => setFileURL(e.target.value)} placeholder={intl.formatMessage({ id: 'playground.aigcMaterial.fileUrlPh' })} />
              <Upload {...uploadProps}>
                <Button icon={<CloudUploadOutlined />} loading={uploading}>
                  {intl.formatMessage({ id: 'playground.aigcMaterial.chooseFileBtn' })}
                </Button>
              </Upload>
            </Space.Compact>
          </Form.Item>
          <Form.Item label={intl.formatMessage({ id: 'playground.aigcMaterial.assetNameLabel' })}>
            <Input value={assetName} onChange={(e) => setAssetName(e.target.value)} maxLength={50} style={{ maxWidth: 320 }} />
          </Form.Item>
          <Button type="primary" onClick={handleCreate} loading={submitting}>
            {intl.formatMessage({ id: 'playground.aigcMaterial.submitBtn' })}
          </Button>
        </Form>
      </Card>

      {/* 列表 */}
      <Card size="small" title={intl.formatMessage({ id: 'playground.aigcMaterial.listCardTitle' }, { count: list.length })}>
        {loading && list.length === 0 ? (
          <Spin />
        ) : list.length === 0 ? (
          <Empty description={intl.formatMessage({ id: 'playground.aigcMaterial.emptyDesc' })} />
        ) : (
          <Table<AigcMaterial>
            rowKey="id"
            dataSource={list}
            pagination={false}
            size="small"
            columns={[
              {
                title: intl.formatMessage({ id: 'playground.aigcMaterial.colType' }),
                dataIndex: 'is_real_person',
                render: (v) => <Tag color={v ? 'gold' : 'default'}>{intl.formatMessage({ id: v ? 'playground.aigcMaterial.realPerson' : 'playground.aigcMaterial.nonRealPerson' })}</Tag>,
                width: 90,
              },
              { title: intl.formatMessage({ id: 'playground.aigcMaterial.colAssetType' }), dataIndex: 'asset_type', width: 80 },
              {
                title: intl.formatMessage({ id: 'playground.aigcMaterial.colStatus' }),
                dataIndex: 'status',
                render: (s, row) => (
                  <Space size={4}>
                    <Tag color={STATUS_COLOR[s] || 'default'}>{statusLabel(s)}</Tag>
                    {row.error_msg && (
                      <span title={row.error_msg} style={{ color: '#cf1322', fontSize: 12 }}>⚠</span>
                    )}
                  </Space>
                ),
                width: 110,
              },
              {
                title: 'AssetId',
                dataIndex: 'upstream_asset_id',
                render: (v) => (v ? <Typography.Text code copyable style={{ fontSize: 12 }}>{v}</Typography.Text> : <span style={{ color: '#999' }}>—</span>),
                ellipsis: true,
              },
              {
                title: intl.formatMessage({ id: 'playground.aigcMaterial.colCreatedAt' }),
                dataIndex: 'created_at',
                render: (createdAt) => new Date(createdAt).toLocaleString(),
                width: 160,
              },
              {
                title: intl.formatMessage({ id: 'playground.aigcMaterial.colAction' }),
                key: 'action',
                render: (_, row) => (
                  <Space size={4}>
                    <Button size="small" type="link" icon={<ReloadOutlined />} onClick={() => handleRefreshOne(row.id)}>
                      {intl.formatMessage({ id: 'playground.aigcMaterial.refreshBtn' })}
                    </Button>
                    <Popconfirm title={intl.formatMessage({ id: 'playground.aigcMaterial.deleteConfirm' })} onConfirm={() => handleDelete(row.id)}>
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
