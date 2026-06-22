import { HomeOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { history, useIntl, useModel } from '@umijs/max';
import { Dropdown, type MenuProps } from 'antd';
import type { ReactNode } from 'react';

/**
 * 控制台顶栏右上角头像下拉菜单
 *   - 返回首页（/）
 *   - 个人设置（/console/settings）
 *   - 退出登录 → 清 token + initialState + 跳 /
 */
export default function UserMenu({ children }: { children: ReactNode }) {
  const intl = useIntl();
  const { setInitialState } = useModel('@@initialState');

  const logout = async () => {
    localStorage.removeItem('token');
    await setInitialState((s: any) => ({ ...s, currentUser: undefined }));
    history.push('/');
  };

  const items: MenuProps['items'] = [
    {
      key: 'home',
      icon: <HomeOutlined />,
      label: intl.formatMessage({ id: 'layout.userMenu.home' }),
      onClick: () => history.push('/'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: intl.formatMessage({ id: 'layout.userMenu.settings' }),
      onClick: () => history.push('/console/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: intl.formatMessage({ id: 'layout.userMenu.logout' }),
      danger: true,
      onClick: logout,
    },
  ];

  return (
    <Dropdown menu={{ items }} placement="bottomRight" trigger={['click']}>
      <span style={{ cursor: 'pointer' }}>{children}</span>
    </Dropdown>
  );
}
