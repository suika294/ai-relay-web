export const API_BASE_URL = (process.env.UMI_APP_API_BASE_URL || '').replace(/\/+$/, '');

export function apiURL(path: string): string {
  if (!API_BASE_URL || /^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
