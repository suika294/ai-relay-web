import { PageContainer, ProCard, ProForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { message } from 'antd';
import { userApi } from '@/services/api';

export default function Settings() {
  const { initialState, setInitialState } = useModel('@@initialState');
  const u = initialState?.currentUser;

  return (
    <PageContainer title="个人设置">
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
              message.success('已保存');
              const latest = await userApi.profile();
              if (latest.code === 0 && latest.data) {
                await setInitialState((s: any) => ({ ...s, currentUser: latest.data }));
              }
              return true;
            }
            return false;
          }}
        >
          <ProFormText name="display_name" label="昵称" />
          <ProFormText name="email" label="邮箱" />
          <ProFormSelect
            name="preferred_currency"
            label="展示币种"
            options={['USD', 'CNY', 'EUR', 'JPY', 'GBP'].map((c) => ({ value: c, label: c }))}
          />
          <ProFormText name="invite_code" label="我的邀请码" disabled initialValue={u?.invite_code} />
        </ProForm>
      </ProCard>
    </PageContainer>
  );
}
