import { history, Link, useIntl, useSearchParams } from '@umijs/max';
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
  const intl = useIntl();
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
      title={intl.formatMessage({ id: 'auth.page.login.title' })}
      subTitle={intl.formatMessage({ id: 'auth.page.login.subTitle' })}
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
          {intl.formatMessage({ id: 'auth.page.login.openLoginModalBtn' })}
        </Button>,
        <Link key="home" to="/">
          {intl.formatMessage({ id: 'auth.page.login.backHome' })}
        </Link>,
      ]}
      style={{ padding: '96px 24px' }}
    />
  );
}
