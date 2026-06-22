import { DownOutlined, LogoutOutlined, MenuOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { history, Link, useIntl, useLocation, useModel } from '@umijs/max';
import { Avatar, Button, Dropdown, type MenuProps, Space } from 'antd';
import type { ReactNode } from 'react';
import { AuthModalProvider, useAuthModal } from '@/components/AuthModalProvider';
import LangSwitch from '@/components/LangSwitch';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import './public.css';

export default function PublicLayout({
  children,
  hideFooter,
}: {
  children: ReactNode;
  hideFooter?: boolean;
}) {
  return (
    <AuthModalProvider>
      <PublicLayoutInner hideFooter={hideFooter}>{children}</PublicLayoutInner>
    </AuthModalProvider>
  );
}

function PublicLayoutInner({
  children,
  hideFooter,
}: {
  children: ReactNode;
  hideFooter?: boolean;
}) {
  const { initialState, setInitialState } = useModel('@@initialState');
  const { pathname } = useLocation();
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const user = initialState?.currentUser;
  const site = useSiteInfo();
  const { openAuthModal } = useAuthModal();
  const logoSrc = site.logo || '/moqiao-logo-black.png';

  const navItems = [
    { to: '/', label: t('layout.nav.home'), exact: true },
    { to: '/models', label: t('layout.nav.models') },
    { to: '/billing', label: t('layout.nav.recharge') },
    { to: '/docs', label: t('layout.nav.docs') },
  ];

  const mobileNavMenu: MenuProps['items'] = navItems.map((n) => ({
    key: n.to,
    label: n.label,
    onClick: () => history.push(n.to),
  }));

  const logout = async () => {
    localStorage.removeItem('token');
    await setInitialState((s: any) => ({ ...s, currentUser: undefined }));
    history.replace('/');
  };

  const userMenu: MenuProps['items'] = [
    {
      key: 'console',
      icon: <UserOutlined />,
      label: t('layout.user.console'),
      onClick: () => history.push('/console/dashboard'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('layout.user.settings'),
      onClick: () => history.push('/console/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('layout.user.logout'),
      danger: true,
      onClick: logout,
    },
  ];

  return (
    <div className="public-layout">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-logo" aria-label={site.name}>
            <img
              className="public-logo-icon"
              src={logoSrc}
              alt=""
              aria-hidden="true"
            />
          </Link>
          <nav className="public-nav">
            {navItems.map((n) => {
              const active = n.exact ? pathname === '/' : pathname.startsWith(n.to.split('#')[0]);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={active ? 'active' : ''}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <Dropdown
            menu={{ items: mobileNavMenu, selectedKeys: [navItems.find((n) => (n.exact ? pathname === '/' : pathname.startsWith(n.to.split('#')[0])))?.to ?? ''] }}
            placement="bottomLeft"
            trigger={['click']}
            overlayClassName="public-nav-menu-overlay"
          >
            <Button
              type="text"
              className="public-nav-trigger"
              icon={<MenuOutlined />}
              aria-label={t('layout.nav.menu')}
            />
          </Dropdown>
          <Space>
            <LangSwitch />
            {user ? (
              <>
                <Button type="primary" onClick={() => history.push('/console/dashboard')}>
                  {t('layout.btn.console')}
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
                <Button
                  type="text"
                  onClick={() =>
                    openAuthModal({
                      defaultTab: 'login',
                      onSuccess: () => history.push('/console/dashboard'),
                    })
                  }
                >
                  {t('layout.btn.login')}
                </Button>
                {site.register_enabled && (
                  <Button
                    type="primary"
                    onClick={() =>
                      openAuthModal({
                        defaultTab: 'register',
                        onSuccess: () => history.push('/console/dashboard'),
                      })
                    }
                  >
                    {t('layout.btn.register')}
                  </Button>
                )}
              </>
            )}
          </Space>
        </div>
      </header>

      <main className="public-main">{children}</main>

      {!hideFooter && (
        <footer className="public-footer">
          <div className="public-footer-inner">
            <div>© {new Date().getFullYear()} {site.name}. {t('layout.footer.slogan')}</div>
            <Space size="large">
              <Link to="/models">{t('layout.nav.models')}</Link>
              <Link to="/billing">{t('layout.nav.recharge')}</Link>
              <Link to="/docs">{t('layout.nav.docs')}</Link>
            </Space>
          </div>
        </footer>
      )}
    </div>
  );
}
