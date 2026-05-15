import { DownOutlined, LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { history, Link, useLocation, useModel } from '@umijs/max';
import { Avatar, Button, Dropdown, type MenuProps, Space } from 'antd';
import type { ReactNode } from 'react';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import './public.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { initialState, setInitialState } = useModel('@@initialState');
  const { pathname } = useLocation();
  const user = initialState?.currentUser;
  const site = useSiteInfo();

  const navItems = [
    { to: '/', label: '首页' },
    { to: '/billing', label: '充值' },
    { to: '/docs', label: '文档' },
  ];

  const logout = async () => {
    localStorage.removeItem('token');
    await setInitialState((s: any) => ({ ...s, currentUser: undefined }));
    history.replace('/');
  };

  const userMenu: MenuProps['items'] = [
    {
      key: 'console',
      icon: <UserOutlined />,
      label: '进入控制台',
      onClick: () => history.push('/console/dashboard'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '个人设置',
      onClick: () => history.push('/console/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: logout,
    },
  ];

  return (
    <div className="public-layout">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-logo" aria-label={site.name}>
            {site.logo ? (
              <img
                className="public-logo-icon"
                src={site.logo}
                alt=""
                aria-hidden="true"
              />
            ) : (
              <svg
                className="public-logo-icon"
                viewBox="0 0 64 64"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="public-logo-grad"
                    x1="0"
                    y1="0"
                    x2="64"
                    y2="0"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0" stopColor="#5b9dff" />
                    <stop offset="1" stopColor="#8654ff" />
                  </linearGradient>
                </defs>
                <path
                  d="M 12 46 Q 32 12 52 46"
                  stroke="url(#public-logo-grad)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="12" cy="46" r="6" fill="#5b9dff" />
                <circle cx="52" cy="46" r="6" fill="#8654ff" />
                <circle cx="32" cy="20" r="3.5" fill="#8654ff" />
              </svg>
            )}
            {site.name}
          </Link>
          <nav className="public-nav">
            {navItems.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={pathname === n.to ? 'active' : ''}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Space>
            {user ? (
              <>
                <Button type="primary" onClick={() => history.push('/console/dashboard')}>
                  进入控制台
                </Button>
                <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={['click']}>
                  <Button type="text" style={{ padding: '0 8px' }}>
                    <Space size={6}>
                      <Avatar size={26} icon={<UserOutlined />} />
                      <span style={{ color: '#333', fontSize: 14 }}>
                        {user.display_name || user.username}
                      </span>
                      <DownOutlined style={{ fontSize: 10, color: '#999' }} />
                    </Space>
                  </Button>
                </Dropdown>
              </>
            ) : (
              <>
                <Button type="text" onClick={() => history.push('/auth/login')}>
                  登录
                </Button>
                {site.register_enabled && (
                  <Button type="primary" onClick={() => history.push('/auth/register')}>
                    免费注册
                  </Button>
                )}
              </>
            )}
          </Space>
        </div>
      </header>

      <main className="public-main">{children}</main>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>© {new Date().getFullYear()} {site.name}. 统一 AI API 中转服务。</div>
          <Space size="large">
            {/* 直接用 <Link to="/#pricing"> 会:在非首页点击时只切到 /,因为 React Router
                不会自动把 hash 滚动到目标元素 —— 给用户的感觉就是"白屏没反应"。
                这里改成手动:先导航到 / (如果还不在),再在下一个 tick 滚到 #pricing。 */}
            <a
              href="/#pricing"
              onClick={(e) => {
                e.preventDefault();
                const scrollToPricing = () => {
                  const el = document.getElementById('pricing');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                if (pathname === '/') {
                  scrollToPricing();
                } else {
                  history.push('/');
                  // 等首页组件渲染出 #pricing 区域;100ms 足够覆盖 antd Tag 等异步样式
                  setTimeout(scrollToPricing, 120);
                }
              }}
            >
              定价
            </a>
            <Link to="/docs">文档</Link>
          </Space>
        </div>
      </footer>
    </div>
  );
}
