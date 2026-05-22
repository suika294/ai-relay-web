import { history, Link, useSearchParams } from '@umijs/max';
import { Button, Result } from 'antd';
import { useEffect } from 'react';
import { useAuthModal } from '@/components/AuthModalProvider';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import PublicLayout from '@/layouts/PublicLayout';
import { safeRedirect } from '@/utils/auth';

export default function Register() {
  return (
    <PublicLayout>
      <RegisterContent />
    </PublicLayout>
  );
}

function RegisterContent() {
  const [params] = useSearchParams();
  const site = useSiteInfo();
  const { openAuthModal } = useAuthModal();
  const target = safeRedirect(params.get('redirect'));

  useEffect(() => {
    if (!site.register_enabled) return;
    openAuthModal({
      defaultTab: 'register',
      onSuccess: () => history.replace(target),
    });
  }, [openAuthModal, site.register_enabled, target]);

  if (!site.register_enabled) {
    return (
      <Result
        status="info"
        title="注册暂未开放"
        subTitle={`${site.name} 当前关闭了新用户自助注册,如需账号请联系管理员。`}
        extra={[
          <Button
            key="login"
            type="primary"
            onClick={() =>
              openAuthModal({
                defaultTab: 'login',
                onSuccess: () => history.replace(target),
              })
            }
          >
            去登录
          </Button>,
          <Link key="home" to="/">
            返回首页
          </Link>,
        ]}
        style={{ padding: '96px 24px' }}
      />
    );
  }

  return (
    <Result
      status="info"
      title="请在弹窗中注册"
      subTitle="产品注册入口已调整为弹窗形式。"
      extra={[
        <Button
          key="register"
          type="primary"
          onClick={() =>
            openAuthModal({
              defaultTab: 'register',
              onSuccess: () => history.replace(target),
            })
          }
        >
          打开注册弹窗
        </Button>,
        <Link key="home" to="/">
          返回首页
        </Link>,
      ]}
      style={{ padding: '96px 24px' }}
    />
  );
}
