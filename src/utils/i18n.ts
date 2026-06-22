import { getIntl } from '@umijs/max';

/**
 * 组件外（逻辑层、模块级常量、message.* / Modal.* / 表单 rules）取翻译用。
 * React 组件内优先用 useIntl() 的 intl.formatMessage，能随语言切换自动重渲。
 *
 * getIntl() 每次按当前 locale 返回 intl 实例，所以运行时调用 t() 总是拿到
 * 当前语言的文案。第二个参数用于占位符插值，如 t('foo.bar', { name }).
 */
export function t(id: string, values?: Record<string, any>): string {
  return getIntl().formatMessage({ id }, values);
}
