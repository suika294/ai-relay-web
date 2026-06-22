import { SearchOutlined } from '@ant-design/icons';
import { useIntl, useSearchParams } from '@umijs/max';
import { Button, Col, Input, Pagination, Row, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import PublicLayout from '@/layouts/PublicLayout';
import { systemApi } from '@/services/api';
import {
  ProviderLogo,
  fmtCtx,
  fmtPrice,
  providerLabel,
  typeLabel,
  useQuickKey,
} from './_shared';

const { Paragraph } = Typography;

// 测试期临时全部放开。需要重新隐藏时,把模型名填回此集合即可:
//   vidu-ad-one-click / vidu-template / vidu-general-one-click / kolors-virtual-try-on-v1-5
const HIDDEN_MODELS = new Set<string>();

export default function ModelsMarket() {
  const intl = useIntl();
  const { handleGenerate, modals } = useQuickKey();
  const [params, setParams] = useSearchParams();

  const [list, setList] = useState<API.PublicModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilterState] = useState<string>(
    params.get('type') || '__all__',
  );
  const [providerFilter, setProviderFilterState] = useState<string>(
    params.get('provider') || '__all__',
  );
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState(1);
  // 默认每页 6 个:3 列 × 2 行,加上过滤栏 + 分页条刚好一屏内,不必滚太多
  const [pageSize, setPageSize] = useState(6);

  useEffect(() => {
    setLoading(true);
    systemApi.models().then((res) => {
      setList(
        ((res.data as API.PublicModel[]) || []).filter(
          (m) => !HIDDEN_MODELS.has(m.name),
        ),
      );
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setTypeFilterState(params.get('type') || '__all__');
    setProviderFilterState(params.get('provider') || '__all__');
  }, [params]);

  const updateFilterParam = (key: 'type' | 'provider', value: string) => {
    const next = new URLSearchParams(params);
    if (value === '__all__') next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const setTypeFilter = (value: string) => updateFilterParam('type', value);
  const setProviderFilter = (value: string) =>
    updateFilterParam('provider', value);

  const { types, providers, typeCounts, providerCounts } = useMemo(() => {
    const t = new Set<string>();
    const p = new Set<string>();
    // 侧边栏每项右侧的数量徽标:基于完整 list 的总数(不随另一维度交叉过滤),与图一一致
    const tc: Record<string, number> = {};
    const pc: Record<string, number> = {};
    for (const m of list) {
      if (m.type) {
        t.add(m.type);
        tc[m.type] = (tc[m.type] ?? 0) + 1;
      }
      if (m.provider_type) {
        p.add(m.provider_type);
        pc[m.provider_type] = (pc[m.provider_type] ?? 0) + 1;
      }
    }
    return {
      types: Array.from(t),
      providers: Array.from(p),
      typeCounts: tc,
      providerCounts: pc,
    };
  }, [list]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return list.filter((m) => {
      if (typeFilter !== '__all__' && m.type !== typeFilter) return false;
      if (providerFilter !== '__all__' && m.provider_type !== providerFilter)
        return false;
      if (kw) {
        const hay = `${m.name ?? ''} ${m.display_name ?? ''} ${
          providerLabel[m.provider_type] ?? m.provider_type ?? ''
        }`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [list, typeFilter, providerFilter, keyword]);

  // 筛选/搜索变化时回到第 1 页,避免停留在已经不存在的页码上
  useEffect(() => {
    setPage(1);
  }, [typeFilter, providerFilter, keyword]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  // 左侧筛选侧边栏的一个分组:竖向列表,每行 图标/logo + 标签 + 右侧数量徽标,选中行高亮。
  const renderSidebarFilter = (
    label: string,
    current: string,
    setter: (v: string) => void,
    options: {
      value: string;
      label: string;
      icon?: React.ReactNode;
      count?: number;
    }[],
    totalCount: number,
  ) => (
    <div className="model-filter-group">
      <div className="model-filter-group-title">{label}</div>
      <ul className="model-filter-list">
        <li>
          <button
            type="button"
            className={`model-filter-item ${
              current === '__all__' ? 'is-active' : ''
            }`}
            onClick={() => setter('__all__')}
          >
            <span className="model-filter-item-label">
              {intl.formatMessage({ id: 'modelMarket.index.filterAll' })}
            </span>
            <span className="model-filter-count">{totalCount}</span>
          </button>
        </li>
        {options.map((opt) => (
          <li key={opt.value}>
            <button
              type="button"
              className={`model-filter-item ${
                current === opt.value ? 'is-active' : ''
              }`}
              onClick={() => setter(opt.value)}
            >
              <span className="model-filter-item-label">
                {opt.icon && (
                  <span className="model-filter-item-icon">{opt.icon}</span>
                )}
                <span className="model-filter-item-text">{opt.label}</span>
              </span>
              {typeof opt.count === 'number' && (
                <span className="model-filter-count">{opt.count}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <PublicLayout>
      {/* 模型广场 + 选模型直出 Key */}
      <section id="models" className="pricing-page model-market-section">
        <span
          id="pricing"
          className="model-market-legacy-anchor"
          aria-hidden="true"
        />
        <Typography.Title level={2} style={{ marginBottom: 8 }}>
          {intl.formatMessage({ id: 'modelMarket.index.title' })}
        </Typography.Title>
        <Paragraph type="secondary" style={{ fontSize: 15 }}>
          {intl.formatMessage({ id: 'modelMarket.index.subtitle' })}
        </Paragraph>

        <div className="model-market-layout">
          {/* 左侧筛选侧边栏:sticky,滚动时停在悬浮导航下方,不再被顶部导航遮挡 */}
          <aside className="model-filter-sidebar">
            {renderSidebarFilter(
              intl.formatMessage({ id: 'modelMarket.index.filterType' }),
              typeFilter,
              setTypeFilter,
              types.map((t) => ({
                value: t,
                label: typeLabel[t]?.text ?? t,
                icon: typeLabel[t]?.icon,
                count: typeCounts[t],
              })),
              list.length,
            )}
            {renderSidebarFilter(
              intl.formatMessage({ id: 'modelMarket.index.filterProvider' }),
              providerFilter,
              setProviderFilter,
              providers.map((p) => ({
                value: p,
                label: providerLabel[p] ?? p,
                icon: <ProviderLogo provider={p} size={16} />,
                count: providerCounts[p],
              })),
              list.length,
            )}
          </aside>

          {/* 右侧内容区:顶部工具条(数量 + 搜索)+ 卡片网格 + 分页 */}
          <div className="model-market-main">
            <div className="model-market-toolbar">
              <span className="model-market-count">
                {intl.formatMessage(
                  { id: 'modelMarket.index.countLabel' },
                  { count: <strong key="c">{filtered.length}</strong> },
                )}
              </span>
              <Input
                allowClear
                className="model-market-search"
                prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                placeholder={intl.formatMessage({
                  id: 'modelMarket.index.searchPlaceholder',
                })}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            {/* 模型卡片网格 */}
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
                {intl.formatMessage({ id: 'common.loading' })}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
                {intl.formatMessage({ id: 'modelMarket.index.emptyMatch' })}
              </div>
            ) : (
              <Row gutter={[20, 20]}>
                {paged.map((m) => {
                  const t = typeLabel[m.type];
                  return (
                    <Col key={m.id} xs={24} md={12} xxl={8}>
                      <div className="model-card">
                        <div className="model-card-header">
                          <div className="model-icon-wrap">
                            <ProviderLogo
                              provider={m.provider_type}
                              size={28}
                            />
                          </div>
                          <div className="model-card-title">
                            <div className="model-card-name">
                              {m.display_name || m.name}
                              {m.tags?.includes('new') && (
                                <Tag color="default" style={{ marginLeft: 8 }}>
                                  New
                                </Tag>
                              )}
                              {m.tags?.includes('free') && (
                                <Tag color="default" style={{ marginLeft: 4 }}>
                                  {intl.formatMessage({
                                    id: 'modelMarket.index.tagFree',
                                  })}
                                </Tag>
                              )}
                            </div>
                            <div className="model-card-sub">{m.name}</div>
                          </div>
                          {(t || m.type) && (
                            <span
                              className="model-type-chip"
                              title={t?.text ?? m.type}
                            >
                              {t?.icon}
                              <span>{t?.text ?? m.type}</span>
                            </span>
                          )}
                        </div>

                        <div className="model-card-metrics">
                          <div className="metric">
                            <div className="metric-k">
                              {intl.formatMessage({
                                id: 'modelMarket.index.metricInput',
                              })}
                            </div>
                            <div className="metric-v">
                              {fmtPrice(m.input_price)}
                              <span className="metric-unit"> / M Tokens</span>
                            </div>
                          </div>
                          <div className="metric">
                            <div className="metric-k">
                              {intl.formatMessage({
                                id: 'modelMarket.index.metricOutput',
                              })}
                            </div>
                            <div className="metric-v">
                              {fmtPrice(m.output_price)}
                              <span className="metric-unit"> / M Tokens</span>
                            </div>
                          </div>
                          <div className="metric">
                            <div className="metric-k">
                              {intl.formatMessage({
                                id: 'modelMarket.index.metricContext',
                              })}
                            </div>
                            <div className="metric-v">
                              {fmtCtx(m.max_tokens)}
                            </div>
                          </div>
                        </div>

                        <div className="model-card-footer">
                          <span className="model-card-provider">
                            {providerLabel[m.provider_type] ?? m.provider_type}
                          </span>
                          <Button
                            type="primary"
                            onClick={() => handleGenerate(m)}
                          >
                            {intl.formatMessage({
                              id: 'modelMarket.index.generateKey',
                            })}
                          </Button>
                        </div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            )}

            {!loading && filtered.length > pageSize && (
              <div
                style={{
                  marginTop: 28,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={filtered.length}
                  showSizeChanger
                  pageSizeOptions={[6, 12, 24]}
                  showTotal={(total) =>
                    intl.formatMessage(
                      { id: 'modelMarket.index.paginationTotal' },
                      { total },
                    )
                  }
                  onChange={(p, s) => {
                    setPage(p);
                    if (s !== pageSize) setPageSize(s);
                  }}
                />
              </div>
            )}

            <Paragraph type="secondary" style={{ marginTop: 24, fontSize: 13 }}>
              {intl.formatMessage({ id: 'modelMarket.index.priceFootnote' })}
            </Paragraph>
          </div>
        </div>
      </section>

      {/* 选模型直出 Key 的弹窗 */}
      {modals}
    </PublicLayout>
  );
}
