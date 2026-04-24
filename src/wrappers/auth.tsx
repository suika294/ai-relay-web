import { Navigate, Outlet, useLocation, useModel } from '@umijs/max';

/**
 * 未登录访问 /console/* 时跳到 /auth/login，并把原路径塞到 ?redirect= 以便登录后回跳。
 */
export default function AuthWrapper() {
  const { initialState } = useModel('@@initialState');
  const location = useLocation();

  if (!initialState?.currentUser) {
    const target = `/auth/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
