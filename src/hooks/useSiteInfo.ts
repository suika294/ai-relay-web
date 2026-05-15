// useSiteInfo —— 任何组件都可以拿到当前站点配置(name / logo /
// register_enabled / version)。底层是 umi 的 initialState,
// 由 src/app.tsx 在启动时拉 /system/info 灌入。
//
// 为什么不直接 useModel('@@initialState'):写起来啰嗦且没有兜底,
// 这里集中提供默认值,后台 / 网络抖动时也能渲染。
import { useModel } from '@umijs/max';

export const DEFAULT_SITE_INFO: API.SiteInfo = {
  name: 'ai-relay',
  logo: '',
  register_enabled: true,
  version: '0.0.1',
  api_base: '',
};

export function useSiteInfo(): API.SiteInfo {
  const { initialState } = useModel('@@initialState') as {
    initialState?: { siteInfo?: API.SiteInfo };
  };
  return initialState?.siteInfo ?? DEFAULT_SITE_INFO;
}
