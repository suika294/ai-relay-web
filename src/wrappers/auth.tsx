import { history, Outlet, useLocation, useModel } from '@umijs/max';
import { Button, Result } from 'antd';
import { useEffect } from 'react';
import { AuthModalProvider, useAuthModal } from '@/components/AuthModalProvider';

/**
 * 未登录访问 /console/* 时弹出登录/注册弹窗；登录成功后停留在原 URL 并放行。
 */
export default function AuthWrapper() {
  return (
    <AuthModalProvider>
      <AuthWrapperInner />
    </AuthModalProvider>
  );
}

function AuthWrapperInner() {
  const { initialState } = useModel('@@initialState');
  const location = useLocation();
  const { openAuthModal } = useAuthModal();

  if (!initialState?.currentUser) {
    const target = location.pathname + location.search;
    return <LoginGate target={target} openAuthModal={openAuthModal} />;
  }
  return <Outlet />;
}

function LoginGate({
  target,
  openAuthModal,
}: {
  target: string;
  openAuthModal: ReturnType<typeof useAuthModal>['openAuthModal'];
}) {
  useEffect(() => {
    openAuthModal({
      defaultTab: 'login',
      onSuccess: () => history.replace(target),
    });
  }, [openAuthModal, target]);

  return (
    <Result
      status="info"
      title="请先登录"
      subTitle="登录后即可继续访问控制台。"
      extra={
        <Button
          type="primary"
          onClick={() =>
            openAuthModal({
              defaultTab: 'login',
              onSuccess: () => history.replace(target),
            })
          }
        >
          打开登录弹窗
        </Button>
      }
      style={{ paddingTop: 96 }}
    />
  );
}
