import { DownOutlined, LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { history, Link, useLocation, useModel } from '@umijs/max';
import { Avatar, Button, Dropdown, type MenuProps, Space } from 'antd';
import type { ReactNode } from 'react';
import './public.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { initialState, setInitialState } = useModel('@@initialState');
  const { pathname } = useLocation();
  const user = initialState?.currentUser;

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
          <Link to="/" className="public-logo">
            <span className="public-logo-dot" />
            AI Relay
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
                <Button type="primary" onClick={() => history.push('/auth/register')}>
                  免费注册
                </Button>
              </>
            )}
          </Space>
        </div>
      </header>

      <main className="public-main">{children}</main>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>© {new Date().getFullYear()} AI Relay. 统一 AI API 中转服务。</div>
          <Space size="large">
            <Link to="/#pricing">定价</Link>
            <Link to="/docs">文档</Link>
            <a href="https://github.com/" target="_blank" rel="noreferrer">GitHub</a>
          </Space>
        </div>
      </footer>
    </div>
  );
}
