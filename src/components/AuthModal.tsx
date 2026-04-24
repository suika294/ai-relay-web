import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { Button, Form, Input, message, Modal, Tabs } from 'antd';
import { useState } from 'react';
import { authApi } from '@/services/api';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;  // 登录/注册完成后的回调(由调用方继续后续动作,比如打开生成 key 弹窗)
  defaultTab?: 'login' | 'register';
  title?: string;
  description?: string;
};

// 对外的轻量级登录/注册弹窗:
//   - 成功后直接更新 initialState.currentUser,不刷新页面,不跳路由
//   - 主要给首页这种"操作被登录拦截"的流程用,让用户无缝继续原操作
//   - 独立于 /auth/login、/auth/register 页面,两套代码但是各自简单
export default function AuthModal({
  open,
  onClose,
  onSuccess,
  defaultTab = 'login',
  title = '登录以继续',
  description,
}: Props) {
  const { setInitialState } = useModel('@@initialState');
  const [tab, setTab] = useState<'login' | 'register'>(defaultTab);
  const [loginLoading, setLoginLoading] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  const [loginForm] = Form.useForm();
  const [regForm] = Form.useForm();

  const applyLoginResult = async (token: string, refresh: string | undefined, user: API.User) => {
    localStorage.setItem('token', token);
    if (refresh) localStorage.setItem('refresh_token', refresh);
    await setInitialState((s: any) => ({ ...s, currentUser: user }));
    onClose();
    onSuccess();
  };

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoginLoading(true);
    try {
      const res = await authApi.login(values);
      if (res.code === 0 && res.data) {
        message.success('登录成功');
        await applyLoginResult(
          res.data.token,
          (res.data as any).refresh_token,
          res.data.user,
        );
      } else {
        message.error((res as any).message || '登录失败');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (values: {
    username: string;
    email: string;
    password: string;
    invite_code?: string;
  }) => {
    setRegLoading(true);
    try {
      const reg = await authApi.register(values);
      if (reg.code !== 0) {
        message.error((reg as any).message || '注册失败');
        return;
      }
      // 注册成功后自动登录,和 register.tsx 页面同样的行为
      const login = await authApi.login({
        email: values.email,
        password: values.password,
      });
      if (login.code !== 0 || !login.data) {
        message.warning('注册成功,请在登录页登录');
        setTab('login');
        loginForm.setFieldsValue({ email: values.email });
        return;
      }
      message.success('注册成功,已为你登录');
      await applyLoginResult(
        login.data.token,
        (login.data as any).refresh_token,
        login.data.user,
      );
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '注册失败');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      footer={null}
      destroyOnClose
      width={420}
    >
      {description && (
        <div style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
          {description}
        </div>
      )}
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'login' | 'register')}
        items={[
          {
            key: 'login',
            label: '登录',
            children: (
              <Form
                form={loginForm}
                layout="vertical"
                onFinish={handleLogin}
                requiredMark={false}
              >
                <Form.Item
                  name="email"
                  label="邮箱"
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '邮箱格式不正确' },
                  ]}
                >
                  <Input size="large" prefix={<MailOutlined />} placeholder="you@example.com" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password size="large" prefix={<LockOutlined />} placeholder="密码" />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={loginLoading}
                >
                  登录
                </Button>
              </Form>
            ),
          },
          {
            key: 'register',
            label: '注册',
            children: (
              <Form
                form={regForm}
                layout="vertical"
                onFinish={handleRegister}
                requiredMark={false}
              >
                <Form.Item
                  name="username"
                  label="用户名"
                  rules={[{ required: true, message: '请输入用户名' }]}
                >
                  <Input size="large" prefix={<UserOutlined />} placeholder="2-32 位" />
                </Form.Item>
                <Form.Item
                  name="email"
                  label="邮箱"
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '邮箱格式不正确' },
                  ]}
                >
                  <Input size="large" prefix={<MailOutlined />} placeholder="you@example.com" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}
                >
                  <Input.Password size="large" prefix={<LockOutlined />} placeholder="密码,至少 6 位" />
                </Form.Item>
                <Form.Item name="invite_code" label="邀请码(可选)">
                  <Input size="large" placeholder="没有可不填" />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={regLoading}
                >
                  注册并登录
                </Button>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
