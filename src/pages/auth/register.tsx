import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { history, Link, useSearchParams } from '@umijs/max';
import { Button, Result, message } from 'antd';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { authApi } from '@/services/api';
import { safeRedirect } from '@/utils/auth';

export default function Register() {
  const [params] = useSearchParams();
  const target = safeRedirect(params.get('redirect'));
  const site = useSiteInfo();

  // register.enabled=false 时整页禁用,而不是渲染表单 ——
  // 让用户清楚是"暂不开放",而不是以为表单坏了。
  if (!site.register_enabled) {
    return (
      <div style={{ paddingTop: 80, minHeight: '100vh', background: '#f5f6fa' }}>
        <Result
          status="info"
          title="注册暂未开放"
          subTitle={`${site.name} 当前关闭了新用户自助注册,如需账号请联系管理员。`}
          extra={
            <>
              <Button type="primary" onClick={() => history.push('/auth/login')}>
                去登录
              </Button>
              <Button onClick={() => history.push('/')}>返回首页</Button>
            </>
          }
        />
      </div>
    );
  }

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
        subTitle="注册新账户"
        submitter={{ searchConfig: { submitText: '创建账户并登录' } }}
        onFinish={async (values: any) => {
          const reg = await authApi.register({
            username: values.username,
            email: values.email,
            password: values.password,
            invite_code: values.invite_code,
          });
          if (reg.code !== 0) return false;

          // 自动登录
          const login = await authApi.login({
            email: values.email,
            password: values.password,
          });
          if (login.code !== 0 || !login.data) {
            message.success('注册成功，请登录');
            history.push(`/auth/login?redirect=${encodeURIComponent(target)}`);
            return true;
          }

          localStorage.setItem('token', login.data.token);
          if ((login.data as any).refresh_token) {
            localStorage.setItem('refresh_token', (login.data as any).refresh_token);
          }
          message.success('注册成功，已为你登录');
          // 同 login.tsx：硬跳转，避免 initialState race
          window.location.replace(target);
          return true;
        }}
      >
        <ProFormText
          name="username"
          placeholder="用户名（2-32 位，支持中英文、数字、下划线、短横）"
          rules={[{ required: true, message: '请输入用户名' }]}
        />
        <ProFormText
          name="email"
          placeholder="邮箱（用于登录）"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        />
        <ProFormText.Password
          name="password"
          placeholder="密码（至少 6 位）"
          rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}
        />
        <ProFormText name="invite_code" placeholder="邀请码（可选）" />
        <div style={{ marginBottom: 24, textAlign: 'right' }}>
          <Link
            to={`/auth/login${
              params.get('redirect') ? `?redirect=${params.get('redirect')}` : ''
            }`}
          >
            已有账号，去登录
          </Link>
        </div>
      </LoginForm>
    </div>
  );
}
