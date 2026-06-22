import { PageContainer, ProCard, ProForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { useIntl, useModel } from '@umijs/max';
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
      <ProCard title={intl.formatMessage({ id: 'settings.loginOtp' })} style={{ marginTop: 16 }}>
        <LoginOtpSetting />
      </ProCard>
    </PageContainer>
  );
}
