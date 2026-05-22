import { history, Link, useSearchParams } from '@umijs/max';
import { Button, Result } from 'antd';
import { useEffect } from 'react';
import { useAuthModal } from '@/components/AuthModalProvider';
import PublicLayout from '@/layouts/PublicLayout';
import { safeRedirect } from '@/utils/auth';

export default function Login() {
  return (
    <PublicLayout>
      <LoginContent />
    </PublicLayout>
  );
}

function LoginContent() {
  const [params] = useSearchParams();
  const { openAuthModal } = useAuthModal();
  const target = safeRedirect(params.get('redirect'));

  useEffect(() => {
    openAuthModal({
      defaultTab: 'login',
      onSuccess: () => history.replace(target),
    });
  }, [openAuthModal, target]);

  return (
    <Result
      status="info"
      title="请在弹窗中登录"
      subTitle="产品登录入口已调整为弹窗形式。"
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
          打开登录弹窗
        </Button>,
        <Link key="home" to="/">
          返回首页
        </Link>,
      ]}
      style={{ padding: '96px 24px' }}
    />
  );
}
