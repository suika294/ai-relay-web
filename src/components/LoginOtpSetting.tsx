// 登录验证码二次验证设置卡片。
// 用户开启后,登录需额外输入发送到邮箱/短信的验证码(后端 login 返回 requires_code_2fa)。
// 短信渠道需用户已绑定手机号,否则后端返回 code!=0。
import { useIntl, useModel } from '@umijs/max';
import { Segmented, Space, Switch, Typography, message } from 'antd';
import { useState } from 'react';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { authApi, userApi } from '@/services/api';

export default function LoginOtpSetting() {
  const intl = useIntl();
  const { initialState, setInitialState } = useModel('@@initialState');
  const u = initialState?.currentUser as API.User | undefined;
  const site = useSiteInfo();
  const [saving, setSaving] = useState(false);

  const enabled = !!u?.login_otp_enabled;
  const channel: 'email' | 'sms' = u?.login_otp_channel === 'sms' ? 'sms' : 'email';
  const smsEnabled = !!site.sms_enabled;
  const hasPhone = !!u?.phone;

  const refresh = async () => {
    const latest = await userApi.profile();
    if (latest.code === 0 && latest.data) {
      await setInitialState((s: any) => ({ ...s, currentUser: latest.data }));
    }
  };

  const save = async (next: { enabled: boolean; channel?: 'email' | 'sms' }) => {
    setSaving(true);
    try {
      const res = await authApi.setLoginOtp(next);
      if (res.code === 0) {
        message.success(intl.formatMessage({ id: 'settings.otp.saved' }));
        await refresh();
      } else {
        message.error(res.message || intl.formatMessage({ id: 'settings.otp.saveFailed' }));
      }
    } catch (e: any) {
      message.error(
        e?.response?.data?.message ||
          e?.message ||
          intl.formatMessage({ id: 'settings.otp.saveFailed' }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space>
        <Switch
          checked={enabled}
          loading={saving}
          onChange={(checked) => save({ enabled: checked, channel })}
        />
        <span>{intl.formatMessage({ id: 'settings.otp.enableSwitch' })}</span>
      </Space>
      <Typography.Text type="secondary">
        {intl.formatMessage({ id: 'settings.otp.enableDesc' })}
      </Typography.Text>
      {enabled && (
        <div>
          <div style={{ marginBottom: 8 }}>
            {intl.formatMessage({ id: 'settings.otp.channelLabel' })}
          </div>
          <Segmented
            value={channel}
            disabled={saving}
            onChange={(v) => save({ enabled: true, channel: v as 'email' | 'sms' })}
            options={[
              { label: intl.formatMessage({ id: 'settings.otp.channelEmail' }), value: 'email' },
              {
                label: intl.formatMessage({ id: 'settings.otp.channelSms' }),
                value: 'sms',
                disabled: !smsEnabled || !hasPhone,
              },
            ]}
          />
          {(!smsEnabled || !hasPhone) && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              {smsEnabled
                ? intl.formatMessage({ id: 'settings.otp.needBindPhone' })
                : intl.formatMessage({ id: 'settings.otp.smsDisabled' })}
            </Typography.Text>
          )}
        </div>
      )}
    </Space>
  );
}
