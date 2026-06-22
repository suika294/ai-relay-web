import { LockOutlined, MailOutlined, MobileOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import { history, useIntl, useModel } from '@umijs/max';
import { Button, Form, Input, message, Modal, Segmented, Space } from 'antd';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { authApi } from '@/services/api';
import './AuthModal.css';

const PHONE_RE = /^1[3-9]\d{9}$/;

// 全角转半角 + 去空白:中文输入法下打出的全角数字/空格(如 １３７…、全角空格)看着和半角
// 一模一样,却过不了上面的正则,会被误判成"格式不正确"。输入时先归一化,避免这种假报错。
const toHalfWidth = (s: string) =>
  s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
// 手机号只可能是数字:先全角转半角,再剥掉一切非数字字符(空格、零宽字符、连字符等),
// 彻底避免"看着对却含隐藏字符"导致的格式误判。
const normalizePhone = (s: unknown) => toHalfWidth(String(s ?? '')).replace(/\D/g, '');
const normalizeEmail = (s: unknown) => toHalfWidth(String(s ?? '')).trim();

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;  // 登录/注册完成后的回调(由调用方继续后续动作,比如打开生成 key 弹窗)
  defaultTab?: 'login' | 'register';
  title?: string;
  description?: string;
};

// 对外的轻量级登录/注册弹窗:
//   - 成功后直接更新 initialState.currentUser,不刷新页面,不跳路由
//   - 给首页、公开充值页、控制台登录拦截等流程用,让用户无缝继续原操作
//   - /auth/login、/auth/register 仅保留为兼容入口,实际也复用此弹窗
export default function AuthModal({
  open,
  onClose,
  onSuccess,
  defaultTab = 'login',
  title,
  description,
}: Props) {
  const { setInitialState } = useModel('@@initialState');
  const intl = useIntl();
  const t = (id: string, values?: Record<string, any>) => intl.formatMessage({ id }, values);
  const site = useSiteInfo();
  const [tab, setTab] = useState<'login' | 'register'>(defaultTab);
  const [loginLoading, setLoginLoading] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  const [loginForm] = Form.useForm();
  const [regForm] = Form.useForm();
  const canRegister = site.register_enabled;
  const activeTab = tab === 'register' && canRegister ? 'register' : 'login';
  const activeTabIndex = activeTab === 'register' ? 1 : 0;
  const logoSrc = site.logo || '/moqiao-logo-black.png';

  // 验证码渠道:邮箱/短信。注册时是否需要验证码取决于站点开关。
  const emailEnabled = !!site.email_verify_enabled;
  const smsEnabled = !!site.sms_enabled;
  const verifyRequired = emailEnabled || smsEnabled;
  const bothChannels = emailEnabled && smsEnabled;
  const [regChannel, setRegChannel] = useState<'email' | 'sms'>(
    smsEnabled && !emailEnabled ? 'sms' : 'email',
  );

  // 发送验证码 60s 倒计时。
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startCountdown = (n = 60) => {
    setCountdown(n);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // 登录二次验证(登录验证码)步骤态。
  const [otpStep, setOtpStep] = useState(false);
  const [otpInfo, setOtpInfo] = useState<{ temp_token: string; target_masked?: string }>({
    temp_token: '',
  });
  const [otpForm] = Form.useForm();
  const [otpLoading, setOtpLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab === 'register' && !site.register_enabled ? 'login' : defaultTab);
    setOtpStep(false);
    setRegChannel(smsEnabled && !emailEnabled ? 'sms' : 'email');
  }, [defaultTab, open, site.register_enabled, smsEnabled, emailEnabled]);

  const applyLoginResult = async (token: string, refresh: string | undefined, user: API.User) => {
    localStorage.setItem('token', token);
    if (refresh) localStorage.setItem('refresh_token', refresh);
    // 先关弹窗,再灌 initialState:这样后续因 currentUser 落上引发的
    // 重渲染(LoginGate→Outlet 切换)期间,open 已是 false,LoginGate
    // 即使在 StrictMode 下被双 mount 也会被 provider 的不变式拦住。
    onClose();
    await setInitialState((s: any) => ({ ...s, currentUser: user }));
    await onSuccess?.();
  };

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoginLoading(true);
    try {
      const res = await authApi.login(values);
      if (res.code === 0 && res.data) {
        // 登录验证码二次验证:后端返回 requires_code_2fa,切到验证码步骤。
        if (res.data.requires_code_2fa && res.data.temp_token) {
          setOtpInfo({
            temp_token: res.data.temp_token,
            target_masked: res.data.target_masked,
          });
          setOtpStep(true);
          otpForm.resetFields();
          message.info(t('auth.msg.otpPrompt'));
          return;
        }
        message.success(t('auth.msg.loginSuccess'));
        await applyLoginResult(res.data.token!, res.data.refresh_token, res.data.user!);
      }
      // 登录失败(code!==0 或请求抛错)统一由全局拦截器弹一次错,这里不再重复 toast
    } catch {
      // 错误已由全局 errorHandler 处理
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLoginVerify = async (values: { code: string }) => {
    setOtpLoading(true);
    try {
      const res = await authApi.loginVerifyCode({
        temp_token: otpInfo.temp_token,
        code: values.code,
      });
      if (res.code === 0 && res.data) {
        message.success(t('auth.msg.loginSuccess'));
        await applyLoginResult(res.data.token, res.data.refresh_token, res.data.user);
      }
      // 验证失败统一由全局拦截器弹一次错
    } catch {
      // 错误已由全局 errorHandler 处理
    } finally {
      setOtpLoading(false);
    }
  };

  // 注册:发送验证码(邮箱/短信)。
  const handleSendCode = async () => {
    const channel = bothChannels ? regChannel : smsEnabled ? 'sms' : 'email';
    try {
      const email = regForm.getFieldValue('email');
      const phone = regForm.getFieldValue('phone');
      if (channel === 'email') {
        await regForm.validateFields(['email']);
      } else {
        await regForm.validateFields(['phone']);
      }
      setSending(true);
      const res = await authApi.sendCode({ channel, email, phone });
      if (res.code === 0) {
        message.success(t('auth.msg.codeSent'));
        startCountdown(res.data?.countdown || 60);
      }
      // 发送失败统一由全局拦截器弹一次错
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验未过,字段下方已有内联提示
      // 其余请求错误由全局 errorHandler 处理
    } finally {
      setSending(false);
    }
  };

  const handleRegister = async (values: {
    username: string;
    email: string;
    password: string;
    invite_code?: string;
    phone?: string;
    verify_code?: string;
  }) => {
    setRegLoading(true);
    try {
      const channel = bothChannels ? regChannel : smsEnabled ? 'sms' : 'email';
      const reg = await authApi.register(
        verifyRequired
          ? { ...values, channel, phone: values.phone, verify_code: values.verify_code }
          : values,
      );
      if (reg.code !== 0) {
        return; // 注册失败已由全局拦截器弹错
      }
      // 注册成功后自动登录,和 register.tsx 页面同样的行为
      const login = await authApi.login({
        email: values.email,
        password: values.password,
      });
      if (login.code !== 0 || !login.data || !login.data.token || !login.data.user) {
        message.warning(t('auth.msg.registerNeedLogin'));
        setTab('login');
        loginForm.setFieldsValue({ email: values.email });
        return;
      }
      message.success(t('auth.msg.registerLoggedIn'));
      await applyLoginResult(login.data.token, login.data.refresh_token, login.data.user);
    } catch {
      // 注册请求出错已由全局 errorHandler 处理
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={null}
      footer={null}
      destroyOnClose
      width={960}
      className="auth-modal"
    >
      <div className="auth-modal-shell">
        <div className="auth-modal-aside">
          <div className="auth-modal-aside-content">
            <img className="auth-modal-aside-logo" src={logoSrc} alt={site.name} />
            <p>{t('auth.aside.desc')}</p>
            <div className="auth-modal-status">
              <span />
              {t('auth.aside.status')}
            </div>
          </div>
        </div>

        <div className="auth-modal-inner">
          <div className="auth-modal-brand" aria-label={site.name}>
            <img className="auth-modal-logo" src={logoSrc} alt="" aria-hidden="true" />
          </div>

          <div
            className="auth-modal-tabs"
            style={
              {
                '--auth-active-tab': activeTabIndex,
                '--auth-tab-count': canRegister ? 2 : 1,
              } as CSSProperties
            }
          >
            <button
              type="button"
              className={`auth-modal-tab${activeTab === 'login' ? ' active' : ''}`}
              onClick={() => setTab('login')}
            >
              {t('auth.tab.login')}
            </button>
            {canRegister && (
              <button
                type="button"
                className={`auth-modal-tab${activeTab === 'register' ? ' active' : ''}`}
                onClick={() => setTab('register')}
              >
                {t('auth.tab.register')}
              </button>
            )}
            <span className="auth-modal-tab-slider" aria-hidden="true" />
          </div>

          {(title || description) && (
            <div className="auth-modal-copy">
              {title && <div className="auth-modal-title">{title}</div>}
              {description && <div className="auth-modal-description">{description}</div>}
            </div>
          )}

          <div className="auth-modal-panel">
            {activeTab === 'login' && otpStep ? (
              <Form form={otpForm} layout="vertical" onFinish={handleLoginVerify} requiredMark={false}>
                <div className="auth-modal-copy" style={{ marginBottom: 12 }}>
                  <div className="auth-modal-description">
                    {t('auth.otp.sentTo', {
                      target: otpInfo.target_masked || t('auth.otp.defaultTarget'),
                    })}
                  </div>
                </div>
                <Form.Item
                  name="code"
                  label={t('auth.otp.field')}
                  rules={[{ required: true, message: t('auth.rule.codeRequired') }]}
                >
                  <Input size="large" prefix={<SafetyOutlined />} placeholder={t('auth.otp.placeholder')} />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large" loading={otpLoading}>
                  {t('auth.otp.verify')}
                </Button>
                <Button type="link" block onClick={() => setOtpStep(false)} style={{ marginTop: 8 }}>
                  {t('auth.otp.back')}
                </Button>
              </Form>
            ) : activeTab === 'login' ? (
              <Form
                form={loginForm}
                layout="vertical"
                onFinish={handleLogin}
                requiredMark={false}
              >
                <Form.Item
                  name="email"
                  label={t('auth.field.email')}
                  getValueFromEvent={(e) => normalizeEmail(e.target.value)}
                  rules={[
                    { required: true, message: t('auth.rule.emailRequired') },
                    { type: 'email', message: t('auth.rule.emailInvalid') },
                  ]}
                >
                  <Input size="large" prefix={<MailOutlined />} placeholder="you@example.com" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label={t('auth.field.password')}
                  rules={[{ required: true, message: t('auth.rule.passwordRequired') }]}
                >
                  <Input.Password size="large" prefix={<LockOutlined />} placeholder={t('auth.ph.password')} />
                </Form.Item>
                {site.password_reset_enabled && (
                  <div style={{ textAlign: 'right', marginBottom: 12 }}>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0 }}
                      onClick={() => {
                        onClose();
                        history.push('/auth/forgot-password');
                      }}
                    >
                      {t('auth.btn.forgot')}
                    </Button>
                  </div>
                )}
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={loginLoading}
                >
                  {t('auth.btn.login')}
                </Button>
              </Form>
            ) : (
              <Form
                form={regForm}
                layout="vertical"
                onFinish={handleRegister}
                requiredMark={false}
              >
                <Form.Item
                  name="username"
                  label={t('auth.field.username')}
                  rules={[{ required: true, message: t('auth.rule.usernameRequired') }]}
                >
                  <Input size="large" prefix={<UserOutlined />} placeholder={t('auth.ph.username')} />
                </Form.Item>
                <Form.Item
                  name="email"
                  label={t('auth.field.email')}
                  getValueFromEvent={(e) => normalizeEmail(e.target.value)}
                  rules={[
                    { required: true, message: t('auth.rule.emailRequired') },
                    { type: 'email', message: t('auth.rule.emailInvalid') },
                  ]}
                >
                  <Input size="large" prefix={<MailOutlined />} placeholder="you@example.com" />
                </Form.Item>
                {bothChannels && (
                  <Form.Item label={t('auth.field.verifyMethod')}>
                    <Segmented
                      block
                      value={regChannel}
                      onChange={(v) => setRegChannel(v as 'email' | 'sms')}
                      options={[
                        { label: t('auth.channel.email'), value: 'email' },
                        { label: t('auth.channel.sms'), value: 'sms' },
                      ]}
                    />
                  </Form.Item>
                )}
                {((bothChannels && regChannel === 'sms') || (!bothChannels && smsEnabled)) && (
                  <Form.Item
                    name="phone"
                    label={t('auth.field.phone')}
                    getValueFromEvent={(e) => normalizePhone(e.target.value)}
                    rules={[
                      { required: true, message: t('auth.rule.phoneRequired') },
                      { pattern: PHONE_RE, message: t('auth.rule.phoneInvalid') },
                    ]}
                  >
                    <Input size="large" prefix={<MobileOutlined />} placeholder={t('auth.ph.phone')} />
                  </Form.Item>
                )}
                {verifyRequired && (
                  <Form.Item label={t('auth.field.verifyCode')} required style={{ marginBottom: 0 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item
                        name="verify_code"
                        noStyle
                        rules={[{ required: true, message: t('auth.rule.codeRequired') }]}
                      >
                        <Input size="large" prefix={<SafetyOutlined />} placeholder={t('auth.ph.verifyCode')} />
                      </Form.Item>
                      <Button
                        size="large"
                        onClick={handleSendCode}
                        loading={sending}
                        disabled={countdown > 0}
                        style={{ width: 130 }}
                      >
                        {countdown > 0 ? `${countdown}s` : t('auth.btn.sendCode')}
                      </Button>
                    </Space.Compact>
                  </Form.Item>
                )}
                <Form.Item
                  name="password"
                  label={t('auth.field.password')}
                  rules={[{ required: true, min: 6, message: t('auth.rule.passwordMin6') }]}
                >
                  <Input.Password size="large" prefix={<LockOutlined />} placeholder={t('auth.ph.passwordMin6')} />
                </Form.Item>
                <Form.Item name="invite_code" label={t('auth.field.inviteCode')}>
                  <Input size="large" placeholder={t('auth.ph.inviteOptional')} />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={regLoading}
                >
                  {t('auth.btn.registerLogin')}
                </Button>
              </Form>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
