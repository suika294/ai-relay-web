import { LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';
import { Link, useIntl } from '@umijs/max';
import { Button, Card, Form, Input, Result, Segmented, Space, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import PublicLayout from '@/layouts/PublicLayout';
import { authApi } from '@/services/api';

export default function ForgotPassword() {
  return (
    <PublicLayout>
      <ForgotPasswordContent />
    </PublicLayout>
  );
}

function ForgotPasswordContent() {
  const intl = useIntl();
  const site = useSiteInfo();
  const [form] = Form.useForm();
  const smsEnabled = !!site.sms_enabled;
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const [countdown, setCountdown] = useState(0);
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

  const sendCode = async () => {
    try {
      await form.validateFields(['email']);
      const email = form.getFieldValue('email');
      setSending(true);
      const res = await authApi.forgotPassword({ email, channel });
      if (res.code === 0) {
        message.success(intl.formatMessage({ id: 'auth.page.forgot.codeSent' }));
        startCountdown(res.data?.countdown || 60);
      } else {
        message.error((res as any).message || intl.formatMessage({ id: 'auth.page.forgot.sendFailed' }));
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || e?.message || intl.formatMessage({ id: 'auth.page.forgot.sendFailed' }));
    } finally {
      setSending(false);
    }
  };

  const onFinish = async (values: { email: string; code: string; new_password: string }) => {
    setSubmitting(true);
    try {
      const res = await authApi.resetPassword({
        email: values.email,
        channel,
        code: values.code,
        new_password: values.new_password,
      });
      if (res.code === 0) {
        setDone(true);
      } else {
        message.error((res as any).message || intl.formatMessage({ id: 'auth.page.forgot.resetFailed' }));
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || intl.formatMessage({ id: 'auth.page.forgot.resetFailed' }));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{ maxWidth: 480, margin: '64px auto', padding: '0 24px' }}>
        <Card>
          <Result
            status="success"
            title={intl.formatMessage({ id: 'auth.page.forgot.doneTitle' })}
            subTitle={intl.formatMessage({ id: 'auth.page.forgot.doneSubTitle' })}
            extra={[
              <Link key="login" to="/auth/login">
                <Button type="primary">{intl.formatMessage({ id: 'auth.page.forgot.goLogin' })}</Button>
              </Link>,
            ]}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '64px auto', padding: '0 24px' }}>
      <Card title={intl.formatMessage({ id: 'auth.page.forgot.title' })}>
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="email"
            label={intl.formatMessage({ id: 'auth.page.forgot.emailLabel' })}
            rules={[
              { required: true, message: intl.formatMessage({ id: 'auth.page.forgot.emailRequired' }) },
              { type: 'email', message: intl.formatMessage({ id: 'auth.page.forgot.emailInvalid' }) },
            ]}
          >
            <Input size="large" prefix={<MailOutlined />} placeholder="you@example.com" />
          </Form.Item>
          {smsEnabled && (
            <Form.Item label={intl.formatMessage({ id: 'auth.page.forgot.channelLabel' })}>
              <Segmented
                block
                value={channel}
                onChange={(v) => setChannel(v as 'email' | 'sms')}
                options={[
                  { label: intl.formatMessage({ id: 'auth.page.forgot.channelEmail' }), value: 'email' },
                  { label: intl.formatMessage({ id: 'auth.page.forgot.channelSms' }), value: 'sms' },
                ]}
              />
            </Form.Item>
          )}
          <Form.Item label={intl.formatMessage({ id: 'auth.page.forgot.codeLabel' })} required style={{ marginBottom: 24 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item
                name="code"
                noStyle
                rules={[{ required: true, message: intl.formatMessage({ id: 'auth.page.forgot.codeRequired' }) }]}
              >
                <Input size="large" prefix={<SafetyOutlined />} placeholder={intl.formatMessage({ id: 'auth.page.forgot.codePlaceholder' })} />
              </Form.Item>
              <Button
                size="large"
                onClick={sendCode}
                loading={sending}
                disabled={countdown > 0}
                style={{ width: 130 }}
              >
                {countdown > 0 ? `${countdown}s` : intl.formatMessage({ id: 'auth.page.forgot.sendCode' })}
              </Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item
            name="new_password"
            label={intl.formatMessage({ id: 'auth.page.forgot.newPasswordLabel' })}
            rules={[{ required: true, min: 6, message: intl.formatMessage({ id: 'auth.page.forgot.passwordMin' }) }]}
          >
            <Input.Password size="large" prefix={<LockOutlined />} placeholder={intl.formatMessage({ id: 'auth.page.forgot.newPasswordPlaceholder' })} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            {intl.formatMessage({ id: 'auth.page.forgot.title' })}
          </Button>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Link to="/auth/login">{intl.formatMessage({ id: 'auth.page.forgot.backToLogin' })}</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
