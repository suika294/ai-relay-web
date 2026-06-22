/**
 * 我的素材 —— 用户视角的资产库:列出本人 owner_type=user 的所有 assets,
 * 支持上传 / 预览 / 复制 URL / 删除。
 *
 * 上传后默认 module=asset。如需作为图生图参考图,可手动复制返回 URL 后填到 playground。
 */
import { assetApi } from '@/services/api';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { useIntl } from '@umijs/max';
import {
  Button,
  Image,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import { useRef } from 'react';

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const moduleColors: Record<string, string> = {
  asset: 'default',
  image: 'green',
  video: 'magenta',
  cover: 'cyan',
  i2v_input: 'orange',
  file: 'geekblue',
};

export default function UserAssetsPage() {
  const intl = useIntl();
  const tableRef = useRef<ActionType>();

  const previewAsset = async (id: number) => {
    const r = await assetApi.detail(id);
    if (r.code !== 0 || !r.data) {
      message.error(r.message || intl.formatMessage({ id: 'assets.fetchFailed' }));
      return;
    }
    const { url, asset } = r.data;
    if (asset.content_type?.startsWith('image/')) {
      Modal.info({
        title: asset.filename || asset.object_key,
        width: 800,
        content: (
          <div>
            <Image src={url} style={{ maxWidth: '100%' }} />
            <div style={{ marginTop: 12 }}>
              <Button
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  message.success(intl.formatMessage({ id: 'assets.urlCopied' }));
                }}
              >
                {intl.formatMessage({ id: 'assets.copyUrl' })}
              </Button>
              <Button
                size="small"
                href={url}
                target="_blank"
                style={{ marginLeft: 8 }}
              >
                {intl.formatMessage({ id: 'assets.download' })}
              </Button>
            </div>
          </div>
        ),
      });
    } else if (asset.content_type?.startsWith('video/')) {
      Modal.info({
        title: asset.filename || asset.object_key,
        width: 900,
        content: (
          <div>
            <video src={url} controls style={{ width: '100%' }} />
            <div style={{ marginTop: 12 }}>
              <Button size="small" href={url} target="_blank">
                {intl.formatMessage({ id: 'assets.download' })}
              </Button>
            </div>
          </div>
        ),
      });
    } else {
      window.open(url, '_blank');
    }
  };

  const uploadProps: UploadProps = {
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const r = await assetApi.upload(file as File);
        if (r.code === 0) {
          message.success(intl.formatMessage({ id: 'assets.uploadSuccess' }));
          onSuccess?.(r);
          tableRef.current?.reload();
        } else {
          message.error(r.message || intl.formatMessage({ id: 'assets.uploadFailed' }));
          onError?.(new Error(r.message));
        }
      } catch (e: any) {
        message.error(e?.message || intl.formatMessage({ id: 'assets.uploadError' }));
        onError?.(e);
      }
    },
  };

  const columns: ProColumns<API.Asset>[] = [
    { title: 'ID', dataIndex: 'id', width: 80, hideInSearch: true },
    {
      title: intl.formatMessage({ id: 'assets.colType' }),
      dataIndex: 'module',
      width: 100,
      valueEnum: {
        asset: { text: intl.formatMessage({ id: 'assets.typeGeneral' }) },
        image: { text: intl.formatMessage({ id: 'assets.typeImage' }) },
        video: { text: intl.formatMessage({ id: 'assets.typeVideo' }) },
        cover: { text: intl.formatMessage({ id: 'assets.typeCover' }) },
        i2v_input: { text: intl.formatMessage({ id: 'assets.typeI2vInput' }) },
        file: { text: intl.formatMessage({ id: 'assets.typeFile' }) },
      },
      render: (_, r) => <Tag color={moduleColors[r.module]}>{r.module}</Tag>,
    },
    {
      title: intl.formatMessage({ id: 'assets.colFile' }),
      dataIndex: 'filename',
      ellipsis: true,
      hideInSearch: true,
      render: (_, r) => r.filename || <span style={{ color: '#999' }}>{r.object_key}</span>,
    },
    {
      title: intl.formatMessage({ id: 'assets.colSize' }),
      dataIndex: 'size_bytes',
      width: 100,
      hideInSearch: true,
      render: (_, r) => formatBytes(r.size_bytes),
    },
    {
      title: 'Content-Type',
      dataIndex: 'content_type',
      width: 150,
      hideInSearch: true,
    },
    {
      title: intl.formatMessage({ id: 'assets.colCreatedAt' }),
      dataIndex: 'created_at',
      width: 170,
      valueType: 'dateTime',
      hideInSearch: true,
    },
    {
      title: intl.formatMessage({ id: 'assets.colAction' }),
      width: 180,
      hideInSearch: true,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          <a onClick={() => previewAsset(r.id)}>{intl.formatMessage({ id: 'assets.preview' })}</a>
          <Popconfirm
            title={intl.formatMessage({ id: 'assets.deleteConfirmTitle' })}
            description={intl.formatMessage({ id: 'assets.deleteConfirmDesc' })}
            onConfirm={async () => {
              const res = await assetApi.remove(r.id);
              if (res.code === 0) {
                message.success(intl.formatMessage({ id: 'assets.deleted' }));
                tableRef.current?.reload();
              } else {
                message.error(res.message || intl.formatMessage({ id: 'assets.deleteFailed' }));
              }
            }}
          >
            <a style={{ color: '#cf1322' }}>{intl.formatMessage({ id: 'assets.delete' })}</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      header={{
        title: intl.formatMessage({ id: 'assets.title' }),
        subTitle: intl.formatMessage({ id: 'assets.subTitle' }),
      }}
    >
      <ProTable<API.Asset>
        actionRef={tableRef}
        rowKey="id"
        columns={columns}
        scroll={{ x: 900 }}
        toolBarRender={() => [
          <Upload key="upload" {...uploadProps}>
            <Button type="primary">{intl.formatMessage({ id: 'assets.uploadBtn' })}</Button>
          </Upload>,
        ]}
        request={async (params) => {
          const r = await assetApi.list({
            page: params.current,
            size: params.pageSize,
            module: params.module,
          });
          return {
            data: r.data?.list ?? [],
            total: r.data?.total ?? 0,
            success: r.code === 0,
          };
        }}
      />
    </PageContainer>
  );
}
