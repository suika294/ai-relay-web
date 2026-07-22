import { MenuOutlined, RightOutlined } from '@ant-design/icons';
import { Link, Outlet, useIntl, useLocation } from '@umijs/max';
import { Button, Drawer } from 'antd';
import { useEffect, useState } from 'react';
import { AuthModalProvider } from '@/components/AuthModalProvider';
import PublicLayout from './PublicLayout';
import './docs.css';

// children:页内章节锚点(二级导航)。仅在该页为当前页时展开,点击平滑跳到对应
// <h2 id="..."> 锚点。anchor 是不带 # 的 id。labelKey 是 i18n key,渲染时再解析。
type DocSubLink = { anchor: string; labelKey: string };
type DocLink = { to: string; labelKey: string; children?: DocSubLink[] };
type DocGroup = { key: string; labelKey: string; links: DocLink[] };

export const docsGroups: DocGroup[] = [
  {
    key: 'start',
    labelKey: 'layout.docs.group.start',
    links: [
      { to: '/docs/quick-start', labelKey: 'layout.docs.link.quickStart' },
      { to: '/docs/auth', labelKey: 'layout.docs.link.auth' },
      { to: '/docs/sdk', labelKey: 'layout.docs.link.sdk' },
    ],
  },
  {
    key: 'api',
    labelKey: 'layout.docs.group.api',
    links: [
      { to: '/docs/chat', labelKey: 'layout.docs.link.chat' },
      { to: '/docs/streaming', labelKey: 'layout.docs.link.streaming' },
      { to: '/docs/models', labelKey: 'layout.docs.link.models' },
      { to: '/docs/images', labelKey: 'layout.docs.link.images' },
      {
        to: '/docs/videos',
        labelKey: 'layout.docs.link.videos',
        children: [
          { anchor: 'submit', labelKey: 'layout.docs.sub.submit' },
          { anchor: 'poll', labelKey: 'layout.docs.sub.poll' },
          { anchor: 'i2v', labelKey: 'layout.docs.sub.i2v' },
          { anchor: 'reference-video', labelKey: 'layout.docs.sub.referenceVideo' },
          { anchor: 'multiframe', labelKey: 'layout.docs.sub.multiframe' },
          { anchor: 'virtual-tryon', labelKey: 'layout.docs.sub.virtualTryon' },
          { anchor: 'models', labelKey: 'layout.docs.sub.models' },
        ],
      },
      { to: '/docs/templates', labelKey: 'layout.docs.link.templates' },
      { to: '/docs/3d', labelKey: 'layout.docs.link.3d' },
      { to: '/docs/digital-human', labelKey: 'layout.docs.link.digitalHuman' },
      {
        to: '/docs/digital-human-live',
        labelKey: 'layout.docs.link.digitalHumanLive',
        children: [
          { anchor: 'flow', labelKey: 'layout.docs.sub.dhFlow' },
          { anchor: 'create', labelKey: 'layout.docs.sub.dhCreate' },
          { anchor: 'ws', labelKey: 'layout.docs.sub.dhWs' },
          { anchor: 'rtc', labelKey: 'layout.docs.sub.dhRtc' },
          { anchor: 'voices', labelKey: 'layout.docs.sub.dhVoices' },
          { anchor: 'billing', labelKey: 'layout.docs.sub.dhBilling' },
          { anchor: 'persona', labelKey: 'layout.docs.sub.dhPersona' },
        ],
      },
      { to: '/docs/audio', labelKey: 'layout.docs.link.audio' },
      { to: '/docs/embeddings', labelKey: 'layout.docs.link.embeddings' },
      { to: '/docs/vectordb', labelKey: 'layout.docs.link.vectordb' },
    ],
  },
  {
    key: 'reference',
    labelKey: 'layout.docs.group.reference',
    links: [
      { to: '/docs/errors', labelKey: 'layout.docs.link.errors' },
      { to: '/docs/rate-limits', labelKey: 'layout.docs.link.rateLimits' },
    ],
  },
  {
    key: 'help',
    labelKey: 'layout.docs.group.help',
    links: [{ to: '/docs/faq', labelKey: 'layout.docs.link.faq' }],
  },
];

// 把所有 link 拍平,方便上下篇导航
const flatLinks: DocLink[] = docsGroups.flatMap((g) => g.links);

function SideNav({
  pathname,
  hash,
  onPick,
}: {
  pathname: string;
  hash: string;
  onPick?: () => void;
}) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  return (
    <nav className="docs-side-nav" aria-label={t('layout.docs.sideNavAria')}>
      {docsGroups.map((g) => (
        <div key={g.key} className="docs-side-group">
          <div className="docs-side-group-title">{t(g.labelKey)}</div>
          <ul>
            {g.links.map((l) => {
              const active = pathname === l.to;
              return (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className={active ? 'active' : ''}
                    onClick={onPick}
                  >
                    {t(l.labelKey)}
                  </Link>
                  {active && l.children && l.children.length > 0 && (
                    <ul className="docs-side-sublist">
                      {l.children.map((c) => (
                        <li key={c.anchor}>
                          <Link
                            to={`${l.to}#${c.anchor}`}
                            className={hash === `#${c.anchor}` ? 'active' : ''}
                            onClick={onPick}
                          >
                            {t(c.labelKey)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function DocsLayout() {
  const { pathname, hash } = useLocation();
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 每次切换路由 / 锚点时:
  //   1. 关掉移动端的抽屉
  //   2. 带 #anchor 时滚到对应章节(scroll-margin-top 让出 sticky header 高度);
  //      否则滚回顶部 —— 不然从长页(比如错误码)跳到短页会停在中间
  useEffect(() => {
    setDrawerOpen(false);
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      // 等正文渲染完再定位锚点(切页时 DOM 尚未挂载)
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [pathname, hash]);

  // 上一页 / 下一页
  const idx = flatLinks.findIndex((l) => l.to === pathname);
  const prev = idx > 0 ? flatLinks[idx - 1] : null;
  const next = idx >= 0 && idx < flatLinks.length - 1 ? flatLinks[idx + 1] : null;

  // 面包屑: 找到当前所属分组
  const currentGroup = docsGroups.find((g) =>
    g.links.some((l) => l.to === pathname),
  );
  const currentLink = flatLinks.find((l) => l.to === pathname);

  return (
    <PublicLayout>
      <div className="docs-shell">
        <aside className="docs-side">
          <SideNav pathname={pathname} hash={hash} />
        </aside>

        <div className="docs-main-wrap">
          <div className="docs-mobile-bar">
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
            >
              {t('layout.docs.toc')}
            </Button>
            {currentGroup && currentLink && (
              <div className="docs-breadcrumb">
                <span>{t(currentGroup.labelKey)}</span>
                <RightOutlined />
                <span className="docs-breadcrumb-current">
                  {t(currentLink.labelKey)}
                </span>
              </div>
            )}
          </div>

          {currentGroup && currentLink && (
            <div className="docs-breadcrumb docs-breadcrumb-desktop">
              <span>{t('layout.docs.breadcrumbRoot')}</span>
              <RightOutlined />
              <span>{t(currentGroup.labelKey)}</span>
              <RightOutlined />
              <span className="docs-breadcrumb-current">
                {t(currentLink.labelKey)}
              </span>
            </div>
          )}

          <AuthModalProvider>
            <article className="docs-article">
              <Outlet />
            </article>
          </AuthModalProvider>

          {(prev || next) && (
            <div className="docs-pager">
              {prev ? (
                <Link to={prev.to} className="docs-pager-card docs-pager-prev">
                  <span className="docs-pager-k">{t('layout.docs.prev')}</span>
                  <span className="docs-pager-v">{t(prev.labelKey)}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link to={next.to} className="docs-pager-card docs-pager-next">
                  <span className="docs-pager-k">{t('layout.docs.next')}</span>
                  <span className="docs-pager-v">{t(next.labelKey)}</span>
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </div>
      </div>

      <Drawer
        title={t('layout.docs.drawerTitle')}
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={280}
      >
        <SideNav pathname={pathname} hash={hash} onPick={() => setDrawerOpen(false)} />
      </Drawer>
    </PublicLayout>
  );
}
