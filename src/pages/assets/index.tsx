/**
 * 我的素材 —— 用户视角的资产库:列出本人 owner_type=user 的所有 assets,
 * 支持上传 / 预览 / 复制 URL / 删除。
 *
 * 上传后默认 module=asset。如需作为图生图参考图,可手动复制返回 URL 后填到 playground。
 */
import { assetApi } from '@/services/api';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
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
  const tableRef = useRef<ActionType>();

  const previewAsset = async (id: number) => {
    const r = await assetApi.detail(id);
    if (r.code !== 0 || !r.data) {
      message.error(r.message || '获取失败');
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
                  message.success('URL 已复制');
                }}
              >
                复制 URL
              </Button>
            </div>
          </div>
        ),
      });
    } else if (asset.content_type?.startsWith('video/')) {
      Modal.info({
        title: asset.filename || asset.object_key,
        width: 900,
        content: <video src={url} controls style={{ width: '100%' }} />,
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
          message.success('上传成功');
          onSuccess?.(r);
          tableRef.current?.reload();
        } else {
          message.error(r.message || '上传失败');
          onError?.(new Error(r.message));
        }
      } catch (e: any) {
        message.error(e?.message || '上传异常');
        onError?.(e);
      }
    },
  };

  const columns: ProColumns<API.Asset>[] = [
    { title: 'ID', dataIndex: 'id', width: 80, hideInSearch: true },
    {
      title: '类型',
      dataIndex: 'module',
      width: 100,
      valueEnum: {
        asset: { text: '通用' },
        image: { text: '图片' },
        video: { text: '视频' },
        cover: { text: '封面' },
        i2v_input: { text: 'i2v 输入' },
        file: { text: '文件' },
      },
      render: (_, r) => <Tag color={moduleColors[r.module]}>{r.module}</Tag>,
    },
    {
      title: '文件',
      dataIndex: 'filename',
      ellipsis: true,
      hideInSearch: true,
      render: (_, r) => r.filename || <span style={{ color: '#999' }}>{r.object_key}</span>,
    },
    {
      title: '大小',
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
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      valueType: 'dateTime',
      hideInSearch: true,
    },
    {
      title: '操作',
      width: 180,
      hideInSearch: true,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          <a onClick={() => previewAsset(r.id)}>预览</a>
          <Popconfirm
            title="确认删除该素材?"
            description="物理对象会异步删除"
            onConfirm={async () => {
              const res = await assetApi.remove(r.id);
              if (res.code === 0) {
                message.success('已删除');
                tableRef.current?.reload();
              } else {
                message.error(res.message || '删除失败');
              }
            }}
          >
            <a style={{ color: '#cf1322' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      header={{
        title: '我的素材',
        subTitle: '上传 / 管理你的图片、视频和文件',
      }}
    >
      <ProTable<API.Asset>
        actionRef={tableRef}
        rowKey="id"
        columns={columns}
        scroll={{ x: 900 }}
        toolBarRender={() => [
          <Upload key="upload" {...uploadProps}>
            <Button type="primary">上传素材</Button>
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
