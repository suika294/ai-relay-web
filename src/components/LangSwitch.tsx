import { GlobalOutlined } from '@ant-design/icons';
import { getLocale, setLocale } from '@umijs/max';
import { Dropdown, type MenuProps } from 'antd';

/**
 * 中/EN 语言切换器。用 umi 的 getLocale/setLocale，setLocale(lang, false)
 * 只触发重渲不整页刷新；选择会持久化到 localStorage(umi_locale)，刷新后保持。
 *
 * 公开页头部 / DocsLayout / 控制台 ProLayout 右上角(actionsRender) 共用此组件。
 */
const LOCALES: { key: string; label: string; short: string }[] = [
  { key: 'zh-CN', label: '简体中文', short: '中' },
  { key: 'en-US', label: 'English', short: 'EN' },
];

export default function LangSwitch({ size = 14 }: { size?: number }) {
  const current = getLocale();

  const items: MenuProps['items'] = LOCALES.map((l) => ({
    key: l.key,
    label: l.label,
  }));

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key !== getLocale()) {
      setLocale(key, false);
    }
  };

  const currentShort = LOCALES.find((l) => l.key === current)?.short ?? '中';

  return (
    <Dropdown
      menu={{ items, selectedKeys: [current], onClick }}
      placement="bottomRight"
      trigger={['click']}
    >
      <span
        role="button"
        tabIndex={0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          fontSize: size,
          color: 'inherit',
          padding: '0 4px',
        }}
      >
        <GlobalOutlined style={{ fontSize: size }} />
        {currentShort}
      </span>
    </Dropdown>
  );
}
