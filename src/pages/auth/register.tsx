import { history, Link, useIntl, useSearchParams } from '@umijs/max';
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
  const intl = useIntl();
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
        title={intl.formatMessage({ id: 'auth.page.register.closedTitle' })}
        subTitle={intl.formatMessage(
          { id: 'auth.page.register.closedSubTitle' },
          { name: site.name },
        )}
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
            {intl.formatMessage({ id: 'auth.page.register.goLoginBtn' })}
          </Button>,
          <Link key="home" to="/">
            {intl.formatMessage({ id: 'auth.page.register.backHomeBtn' })}
          </Link>,
        ]}
        style={{ padding: '96px 24px' }}
      />
    );
  }

  return (
    <Result
      status="info"
      title={intl.formatMessage({ id: 'auth.page.register.modalTitle' })}
      subTitle={intl.formatMessage({ id: 'auth.page.register.modalSubTitle' })}
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
          {intl.formatMessage({ id: 'auth.page.register.openModalBtn' })}
        </Button>,
        <Link key="home" to="/">
          {intl.formatMessage({ id: 'auth.page.register.backHomeBtn' })}
        </Link>,
      ]}
      style={{ padding: '96px 24px' }}
    />
  );
}
