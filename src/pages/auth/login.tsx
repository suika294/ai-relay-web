import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { Link, useSearchParams } from '@umijs/max';
import { Alert, message } from 'antd';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { authApi } from '@/services/api';
import { safeRedirect } from '@/utils/auth';

export default function Login() {
  const [params] = useSearchParams();
  const target = safeRedirect(params.get('redirect'));
  const showRedirectHint = !!params.get('redirect') && !target.startsWith('/auth/');
  const site = useSiteInfo();

  return (
    <div style={{ paddingTop: 80, minHeight: '100vh', background: '#f5f6fa' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link to="/" style={{ color: '#111', fontSize: 18, fontWeight: 600 }}>
          ← 返回首页
        </Link>
      </div>
      <LoginForm
        logo={<img src={site.logo || '/logo.svg'} alt={site.name} />}
        title={site.name}
        subTitle="使用邮箱登录"
        message={
          showRedirectHint ? (
            <Alert
              type="info"
              showIcon
              message="登录后将回到你刚才的页面"
              style={{ marginBottom: 16 }}
            />
          ) : null
        }
        onFinish={async (values: any) => {
          const res = await authApi.login(values);
          if (res.code === 0 && res.data) {
            localStorage.setItem('token', res.data.token);
            if ((res.data as any).refresh_token) {
              localStorage.setItem('refresh_token', (res.data as any).refresh_token);
            }
            message.success('登录成功');
            // 用硬跳转避免 React 异步 setInitialState 与 auth wrapper 的 race：
            // getInitialState() 会在新页面加载时用 token 重新拉 profile，再让 wrapper 放行。
            window.location.replace(target);
            return true;
          }
          return false;
        }}
      >
        <ProFormText
          name="email"
          fieldProps={{ size: 'large', prefix: <MailOutlined /> }}
          placeholder="邮箱"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
          placeholder="密码"
          rules={[{ required: true, message: '请输入密码' }]}
        />
        {site.register_enabled && (
          <div style={{ marginBottom: 24, textAlign: 'right' }}>
            <Link
              to={`/auth/register${
                params.get('redirect') ? `?redirect=${params.get('redirect')}` : ''
              }`}
            >
              注册账号
            </Link>
          </div>
        )}
      </LoginForm>
    </div>
  );
}
