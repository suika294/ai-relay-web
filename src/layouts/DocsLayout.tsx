import { MenuOutlined, RightOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation } from '@umijs/max';
import { Button, Drawer } from 'antd';
import { useEffect, useState } from 'react';
import PublicLayout from './PublicLayout';
import './docs.css';

type DocLink = { to: string; label: string };
type DocGroup = { key: string; label: string; links: DocLink[] };

export const docsGroups: DocGroup[] = [
  {
    key: 'start',
    label: '快速开始',
    links: [
      { to: '/docs/quick-start', label: '首次调用' },
      { to: '/docs/auth', label: '认证' },
      { to: '/docs/sdk', label: 'SDK 接入' },
    ],
  },
  {
    key: 'api',
    label: 'API 文档',
    links: [
      { to: '/docs/chat', label: '对话 Chat' },
      { to: '/docs/streaming', label: '流式响应' },
      { to: '/docs/models', label: '模型列表' },
      { to: '/docs/images', label: '图像生成' },
      { to: '/docs/videos', label: '视频生成' },
      { to: '/docs/audio', label: '语音 Audio' },
      { to: '/docs/embeddings', label: '向量 Embeddings' },
      { to: '/docs/vectordb', label: '向量数据库' },
    ],
  },
  {
    key: 'reference',
    label: '参考',
    links: [
      { to: '/docs/errors', label: '错误码' },
      { to: '/docs/rate-limits', label: '限速' },
    ],
  },
  {
    key: 'help',
    label: '帮助',
    links: [{ to: '/docs/faq', label: '常见问题' }],
  },
];

// 把所有 link 拍平,方便上下篇导航
const flatLinks: DocLink[] = docsGroups.flatMap((g) => g.links);

function SideNav({ pathname, onPick }: { pathname: string; onPick?: () => void }) {
  return (
    <nav className="docs-side-nav" aria-label="文档导航">
      {docsGroups.map((g) => (
        <div key={g.key} className="docs-side-group">
          <div className="docs-side-group-title">{g.label}</div>
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
                    {l.label}
                  </Link>
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
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 每次切换路由时:
  //   1. 关掉移动端的抽屉
  //   2. 滚动正文区回到顶部 —— 不然从长页(比如错误码)跳到短页,会停在中间
  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

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
          <SideNav pathname={pathname} />
        </aside>

        <div className="docs-main-wrap">
          <div className="docs-mobile-bar">
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
            >
              目录
            </Button>
            {currentGroup && currentLink && (
              <div className="docs-breadcrumb">
                <span>{currentGroup.label}</span>
                <RightOutlined />
                <span className="docs-breadcrumb-current">
                  {currentLink.label}
                </span>
              </div>
            )}
          </div>

          {currentGroup && currentLink && (
            <div className="docs-breadcrumb docs-breadcrumb-desktop">
              <span>文档</span>
              <RightOutlined />
              <span>{currentGroup.label}</span>
              <RightOutlined />
              <span className="docs-breadcrumb-current">
                {currentLink.label}
              </span>
            </div>
          )}

          <article className="docs-article">
            <Outlet />
          </article>

          {(prev || next) && (
            <div className="docs-pager">
              {prev ? (
                <Link to={prev.to} className="docs-pager-card docs-pager-prev">
                  <span className="docs-pager-k">← 上一篇</span>
                  <span className="docs-pager-v">{prev.label}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link to={next.to} className="docs-pager-card docs-pager-next">
                  <span className="docs-pager-k">下一篇 →</span>
                  <span className="docs-pager-v">{next.label}</span>
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </div>
      </div>

      <Drawer
        title="文档目录"
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={280}
      >
        <SideNav pathname={pathname} onPick={() => setDrawerOpen(false)} />
      </Drawer>
    </PublicLayout>
  );
}
