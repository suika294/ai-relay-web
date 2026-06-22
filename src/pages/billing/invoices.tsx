import {
  ModalForm,
  PageContainer,
  ProFormRadio,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import { Alert, Button, Drawer, Form, Popconfirm, Tag, Transfer, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { t } from '@/utils/i18n';
import { invoiceApi, type ApplyInvoiceBody } from '@/services/api';

// 与后端 model.InvoiceStatus* 对齐。
const statusMap: Record<number, { text: string; color: string }> = {
  0: { text: t('billing.invoices.statusPending'), color: 'gold' },
  1: { text: t('billing.invoices.statusIssued'), color: 'green' },
  2: { text: t('billing.invoices.statusRejected'), color: 'red' },
  3: { text: t('billing.invoices.statusVoided'), color: 'default' },
};

// 申请发票:基于 eligible_orders 多选 + 抬头表单。
// pdf_available=false 时仍允许提交 —— admin 端会看到状态 pending,装好字体后审核通过即可。
function ApplyInvoiceModal({ onDone }: { onDone: () => void }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<API.RechargeOrder[]>([]);
  const [pdfAvailable, setPdfAvailable] = useState<boolean | null>(null);
  const [titleType, setTitleType] = useState<'personal' | 'company'>('personal');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    invoiceApi.eligibleOrders().then((res) => {
      if (res.code !== 0 || !res.data) {
        message.error(res.message || intl.formatMessage({ id: 'billing.invoices.loadOrdersFailed' }));
        return;
      }
      setOrders(res.data.list ?? []);
      setPdfAvailable(res.data.pdf_available);
    });
  }, [open]);

  return (
    <ModalForm<ApplyInvoiceBody & { _selected: string[] }>
      title={intl.formatMessage({ id: 'billing.invoices.applyTitle' })}
      trigger={<Button type="primary">{intl.formatMessage({ id: 'billing.invoices.applyBtn' })}</Button>}
      open={open}
      onOpenChange={setOpen}
      width={680}
      modalProps={{ destroyOnClose: true }}
      initialValues={{ title_type: 'personal' }}
      onFinish={async (values) => {
        if (!selected.length) {
          message.warning(intl.formatMessage({ id: 'billing.invoices.selectAtLeastOne' }));
          return false;
        }
        if (values.title_type === 'company' && !values.tax_no?.trim()) {
          message.warning(intl.formatMessage({ id: 'billing.invoices.taxNoRequired' }));
          return false;
        }
        const res = await invoiceApi.apply({
          title_type: values.title_type,
          title: values.title,
          tax_no: values.tax_no,
          email: values.email,
          bank_name: values.bank_name,
          bank_account: values.bank_account,
          address: values.address,
          phone: values.phone,
          remark: values.remark,
          order_ids: selected.map((s) => Number(s)),
        });
        if (res.code !== 0) {
          message.error(res.message || intl.formatMessage({ id: 'billing.invoices.applyFailed' }));
          return false;
        }
        message.success(intl.formatMessage({ id: 'billing.invoices.applySubmitted' }));
        setSelected([]);
        onDone();
        return true;
      }}
    >
      {pdfAvailable === false && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={intl.formatMessage({ id: 'billing.invoices.fontNotInstalled' })}
        />
      )}
      <Form.Item label={intl.formatMessage({ id: 'billing.invoices.selectOrders' })} required style={{ marginBottom: 16 }}>
        <Transfer
          dataSource={orders.map((o) => ({
            key: String(o.id),
            title: `${o.order_no}  ·  USD ${o.usd_amount}`,
            description: o.paid_at ?? o.created_at,
          }))}
          targetKeys={selected}
          onChange={(keys) => setSelected(keys as string[])}
          render={(item) => (
            <span>
              {item.title}
              <br />
              <span style={{ color: '#999', fontSize: 12 }}>{item.description}</span>
            </span>
          )}
          titles={[
            intl.formatMessage({ id: 'billing.invoices.eligibleOrders' }),
            intl.formatMessage({ id: 'billing.invoices.mergeInvoice' }),
          ]}
          listStyle={{ width: 280, height: 220 }}
        />
      </Form.Item>

      <ProFormRadio.Group
        name="title_type"
        label={intl.formatMessage({ id: 'billing.invoices.titleType' })}
        options={[
          { label: intl.formatMessage({ id: 'billing.invoices.personal' }), value: 'personal' },
          { label: intl.formatMessage({ id: 'billing.invoices.company' }), value: 'company' },
        ]}
        fieldProps={{ onChange: (e) => setTitleType(e.target.value) }}
      />
      <ProFormText
        name="title"
        label={intl.formatMessage({ id: 'billing.invoices.title' })}
        rules={[{ required: true }]}
        placeholder={intl.formatMessage({ id: 'billing.invoices.titlePlaceholder' })}
      />
      {titleType === 'company' && (
        <>
          <ProFormText name="tax_no" label={intl.formatMessage({ id: 'billing.invoices.taxNo' })} rules={[{ required: true }]} />
          <ProFormText name="bank_name" label={intl.formatMessage({ id: 'billing.invoices.bankName' })} />
          <ProFormText name="bank_account" label={intl.formatMessage({ id: 'billing.invoices.bankAccount' })} />
        </>
      )}
      <ProFormText name="email" label={intl.formatMessage({ id: 'billing.invoices.email' })} />
      <ProFormText name="phone" label={intl.formatMessage({ id: 'billing.invoices.phone' })} />
      <ProFormText name="address" label={intl.formatMessage({ id: 'billing.invoices.address' })} />
      <ProFormTextArea name="remark" label={intl.formatMessage({ id: 'billing.invoices.remark' })} fieldProps={{ rows: 2 }} />
    </ModalForm>
  );
}

function InvoiceDetailDrawer({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
}) {
  const intl = useIntl();
  const [detail, setDetail] = useState<API.InvoiceDetail | null>(null);
  useEffect(() => {
    if (id == null) {
      setDetail(null);
      return;
    }
    invoiceApi.detail(id).then((res) => {
      if (res.code === 0 && res.data) setDetail(res.data);
    });
  }, [id]);
  if (id == null) return null;
  return (
    <Drawer title={intl.formatMessage({ id: 'billing.invoices.detailTitle' })} open={id != null} onClose={onClose} width={520}>
      {!detail ? (
        intl.formatMessage({ id: 'common.loading' })
      ) : (
        <>
          <p>
            <b>{intl.formatMessage({ id: 'billing.invoices.invoiceNoLabel' })}</b> {detail.invoice.invoice_no || '—'}
          </p>
          <p>
            <b>{intl.formatMessage({ id: 'billing.invoices.statusLabel' })}</b>{' '}
            <Tag color={statusMap[detail.invoice.status]?.color}>
              {statusMap[detail.invoice.status]?.text ?? detail.invoice.status}
            </Tag>
          </p>
          <p>
            <b>{intl.formatMessage({ id: 'billing.invoices.titleLabel' })}</b> {detail.invoice.title}（
            {detail.invoice.title_type === 'company'
              ? intl.formatMessage({ id: 'billing.invoices.company' })
              : intl.formatMessage({ id: 'billing.invoices.personal' })}
            ）
          </p>
          {detail.invoice.tax_no && (
            <p>
              <b>{intl.formatMessage({ id: 'billing.invoices.taxNoLabel' })}</b> {detail.invoice.tax_no}
            </p>
          )}
          {detail.invoice.email && (
            <p>
              <b>{intl.formatMessage({ id: 'billing.invoices.emailLabel' })}</b> {detail.invoice.email}
            </p>
          )}
          <p>
            <b>{intl.formatMessage({ id: 'billing.invoices.totalLabel' })}</b> USD {detail.invoice.usd_amount}
          </p>
          {detail.invoice.admin_remark && (
            <p>
              <b>{intl.formatMessage({ id: 'billing.invoices.adminRemarkLabel' })}</b> {detail.invoice.admin_remark}
            </p>
          )}
          {detail.invoice.pdf_url && (
            <p>
              <a href={detail.invoice.pdf_url} target="_blank" rel="noreferrer">
                {intl.formatMessage({ id: 'billing.invoices.downloadPdf' })}
              </a>
            </p>
          )}
          <h4 style={{ marginTop: 16 }}>{intl.formatMessage({ id: 'billing.invoices.relatedOrders' })}</h4>
          <ul>
            {detail.orders.map((o) => (
              <li key={o.id}>
                {o.order_no} — USD {o.usd_amount}（{o.paid_at ?? o.created_at}）
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
}

export default function Invoices() {
  const intl = useIntl();
  const ref = useRef<ActionType>();
  const [detailId, setDetailId] = useState<number | null>(null);
  return (
    <PageContainer title={intl.formatMessage({ id: 'billing.invoices.pageTitle' })}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={intl.formatMessage({ id: 'billing.invoices.receiptNotice' })}
      />
      <ProTable<API.Invoice>
        rowKey="id"
        actionRef={ref}
        search={{ labelWidth: 'auto' }}
        toolBarRender={() => [<ApplyInvoiceModal key="apply" onDone={() => ref.current?.reload()} />]}
        request={async (params) => {
          const res = await invoiceApi.list({
            page: params.current,
            size: params.pageSize,
            status: params.status !== undefined ? Number(params.status) : undefined,
            since: params.since,
            until: params.until,
          });
          return {
            data: res.data?.list ?? [],
            total: res.data?.total ?? 0,
            success: res.code === 0,
          };
        }}
        columns={[
          { title: intl.formatMessage({ id: 'billing.invoices.colInvoiceNo' }), dataIndex: 'invoice_no', search: false },
          {
            title: intl.formatMessage({ id: 'billing.invoices.colStatus' }),
            dataIndex: 'status',
            valueEnum: Object.fromEntries(
              Object.entries(statusMap).map(([k, v]) => [k, { text: v.text }]),
            ),
            render: (_, r) => (
              <Tag color={statusMap[r.status]?.color}>{statusMap[r.status]?.text ?? r.status}</Tag>
            ),
          },
          { title: intl.formatMessage({ id: 'billing.invoices.colTitle' }), dataIndex: 'title', search: false },
          {
            title: intl.formatMessage({ id: 'billing.invoices.colType' }),
            search: false,
            render: (_, r) =>
              r.title_type === 'company'
                ? intl.formatMessage({ id: 'billing.invoices.company' })
                : intl.formatMessage({ id: 'billing.invoices.personal' }),
          },
          { title: intl.formatMessage({ id: 'billing.invoices.colAmount' }), dataIndex: 'usd_amount', search: false },
          { title: intl.formatMessage({ id: 'billing.invoices.colCreatedAt' }), dataIndex: 'created_at', valueType: 'dateTime', search: false },
          { title: intl.formatMessage({ id: 'billing.invoices.colSince' }), dataIndex: 'since', valueType: 'dateTime', hideInTable: true },
          { title: intl.formatMessage({ id: 'billing.invoices.colUntil' }), dataIndex: 'until', valueType: 'dateTime', hideInTable: true },
          {
            title: intl.formatMessage({ id: 'billing.invoices.colOption' }),
            valueType: 'option',
            render: (_, r) => {
              const actions: JSX.Element[] = [
                <a key="detail" onClick={() => setDetailId(r.id)}>
                  {intl.formatMessage({ id: 'billing.invoices.detail' })}
                </a>,
              ];
              if (r.status === 1 && r.pdf_url) {
                actions.push(
                  <a key="pdf" href={r.pdf_url} target="_blank" rel="noreferrer">
                    {intl.formatMessage({ id: 'billing.invoices.downloadPdf' })}
                  </a>,
                );
              }
              if (r.status === 0) {
                actions.push(
                  <Popconfirm
                    key="cancel"
                    title={intl.formatMessage({ id: 'billing.invoices.cancelConfirm' })}
                    onConfirm={async () => {
                      const res = await invoiceApi.cancel(r.id);
                      if (res.code === 0) {
                        message.success(intl.formatMessage({ id: 'billing.invoices.cancelled' }));
                        ref.current?.reload();
                      } else {
                        message.error(res.message || intl.formatMessage({ id: 'billing.invoices.cancelFailed' }));
                      }
                    }}
                  >
                    <a style={{ color: '#cf1322' }}>{intl.formatMessage({ id: 'billing.invoices.cancel' })}</a>
                  </Popconfirm>,
                );
              }
              return actions;
            },
          },
        ]}
      />
      <InvoiceDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </PageContainer>
  );
}
