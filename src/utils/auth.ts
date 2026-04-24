// safeRedirect 把 ?redirect= 规范化为一个可用的跳转目标：
//   - 空或明显异常 → /console/dashboard（登录后默认落点）
//   - 绝对 URL / 协议跳转（http://, //evil.com, javascript:）→ 视为不可信，fallback
//   - 指向登录/注册自身 → fallback 到首页 "/"，避免"登录成功却回到登录页"的循环
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return '/console/dashboard';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // ignore
  }
  // 必须是站内同源相对路径
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/console/dashboard';
  if (/^\/(auth\/login|auth\/register)(\?|$|#)/.test(decoded)) return '/';
  return decoded;
}
