import { PageContainer, ProCard, ProForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { history, useIntl, useModel } from '@umijs/max';
import { message } from 'antd';
import LoginOtpSetting from '@/components/LoginOtpSetting';
import { userApi } from '@/services/api';

export default function Settings() {
  const intl = useIntl();
  const { initialState, setInitialState } = useModel('@@initialState');
  const u = initialState?.currentUser;

  return (
    <PageContainer title={intl.formatMessage({ id: 'settings.title' })}>
      <ProCard>
        <ProForm
          initialValues={{
            display_name: u?.display_name,
            email: u?.email,
            preferred_currency: u?.preferred_currency,
          }}
          onFinish={async (values) => {
            const res = await userApi.updateProfile(values);
            if (res.code === 0) {
              message.success(intl.formatMessage({ id: 'settings.saved' }));
              const latest = await userApi.profile();
              if (latest.code === 0 && latest.data) {
                await setInitialState((s: any) => ({ ...s, currentUser: latest.data }));
              }
              return true;
            }
            return false;
          }}
        >
          <ProFormText name="display_name" label={intl.formatMessage({ id: 'settings.displayName' })} />
          <ProFormText name="email" label={intl.formatMessage({ id: 'settings.email' })} />
          <ProFormSelect
            name="preferred_currency"
            label={intl.formatMessage({ id: 'settings.preferredCurrency' })}
            options={['USD', 'CNY', 'EUR', 'JPY', 'GBP'].map((c) => ({ value: c, label: c }))}
          />
          <ProFormText
            name="invite_code"
            label={intl.formatMessage({ id: 'settings.inviteCode' })}
            disabled
            initialValue={u?.invite_code}
          />
        </ProForm>
      </ProCard>
      <ProCard title={intl.formatMessage({ id: 'settings.password' })} style={{ marginTop: 16 }}>
        <ProForm
          submitter={{
            searchConfig: { submitText: intl.formatMessage({ id: 'settings.password.submit' }) },
            render: (_, dom) => dom[1],
          }}
          onFinish={async (values) => {
            if (values.new_password !== values.confirm_password) {
              message.error(intl.formatMessage({ id: 'settings.password.mismatch' }));
              return false;
            }
            const res = await userApi.changePassword({
              old_password: values.old_password,
              new_password: values.new_password,
            });
            if (res.code === 0) {
              // 改密后服务端已踢下线，本地清登录态并跳回首页重新登录。
              message.success(intl.formatMessage({ id: 'settings.password.savedRelogin' }));
              localStorage.removeItem('token');
              localStorage.removeItem('refresh_token');
              await setInitialState((s: any) => ({ ...s, currentUser: undefined }));
              setTimeout(() => history.push('/'), 1200);
              return true;
            }
            return false;
          }}
        >
          <ProFormText.Password
            name="old_password"
            label={intl.formatMessage({ id: 'settings.password.old' })}
            rules={[{ required: true }]}
          />
          <ProFormText.Password
            name="new_password"
            label={intl.formatMessage({ id: 'settings.password.new' })}
            rules={[{ required: true }, { min: 6, message: intl.formatMessage({ id: 'settings.password.tooShort' }) }]}
          />
          <ProFormText.Password
            name="confirm_password"
            label={intl.formatMessage({ id: 'settings.password.confirm' })}
            rules={[{ required: true }]}
          />
        </ProForm>
      </ProCard>
      <ProCard title={intl.formatMessage({ id: 'settings.loginOtp' })} style={{ marginTop: 16 }}>
        <LoginOtpSetting />
      </ProCard>
    </PageContainer>
  );
}
