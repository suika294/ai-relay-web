import { Input } from 'antd';
import { useIntl } from '@umijs/max';
import { usePlaygroundApiKey } from './apiKeyStore';

// 各面板右侧设置区「API Key」输入块的统一替换件:从原来的「下拉选择已有密钥」
// 改成「手动填写」。密码态显示(避免肩窥),值走共享 store,所有面板/刷新都同步。
export default function ApiKeyField() {
  const intl = useIntl();
  const { apiKey, setApiKey } = usePlaygroundApiKey();
  return (
    <div>
      <div style={{ fontSize: 12, color: '#666' }}>API Key</div>
      <Input.Password
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value.trim())}
        placeholder={intl.formatMessage({ id: 'playground.index.apiKeyPlaceholder' })}
        autoComplete="off"
        allowClear
      />
    </div>
  );
}
