export function isAuthenticatedGeminiDownloadURL(raw?: string): boolean {
  const url = raw?.trim();
  if (!url) return false;
  try {
    const base =
      typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const u = new URL(url, base);
    return (
      u.hostname === 'generativelanguage.googleapis.com' &&
      u.pathname.includes('/files/') &&
      u.pathname.includes(':download')
    );
  } catch {
    return false;
  }
}

export function publicMediaURL(raw?: string): string | undefined {
  const url = raw?.trim();
  if (!url) return undefined;
  if (isAuthenticatedGeminiDownloadURL(url)) return undefined;
  return url;
}

export function browserDownloadName(
  raw?: string,
  filename?: string,
): string | undefined {
  const name = filename?.trim();
  if (!name) return undefined;
  const url = raw?.trim();
  if (!url) return undefined;
  if (/^(?:data:|blob:)/i.test(url)) return name;
  if (typeof window === 'undefined') return undefined;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin
      ? name
      : undefined;
  } catch {
    return undefined;
  }
}
