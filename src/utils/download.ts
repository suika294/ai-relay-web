import { message } from 'antd';
import { t } from '@/utils/i18n';
import { apiURL } from '@/utils/request';

// downloadCSV 拉一个需要登录鉴权的用户端 CSV 导出端点,把响应 blob 化后触发浏览器下载。
//
// 为什么不用 <a href> / window.open:那样浏览器走 GET 但带不上 Authorization header,
// 后端 UserAuth 直接 401。所以用 fetch + Authorization + blob。
//
// params 里 undefined / 空串 / null 的字段会被剔除,只把列表页当前生效的筛选条件拼进 query,
// 保证“导出 = 当前筛选下的全部匹配行”。与管理后台 utils/download.ts 同款思路,
// 区别只在 token 取用户端 localStorage('token') 且 URL 走 apiURL()。
export async function downloadCSV(
  path: string,
  params: Record<string, any> = {},
): Promise<void> {
  const token = localStorage.getItem('token') || '';
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  });
  const sep = path.includes('?') ? '&' : '?';
  const url = apiURL(qs.toString() ? `${path}${sep}${qs}` : path);

  const hide = message.loading(t('common.exporting'), 0);
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try {
        const j = await resp.json();
        if (j?.message) detail = j.message;
      } catch {
        /* 非 JSON 响应,保留 HTTP 状态码 */
      }
      message.error(t('common.exportFailed', { detail }));
      return;
    }
    const blob = await resp.blob();
    // 从 Content-Disposition 里取后端给的文件名(带时间戳);取不到再退回 path 末段。
    const cd = resp.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    const filename = m?.[1] || `${path.split('/').pop() || 'export'}.csv`;

    const objURL = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objURL), 10_000);
    message.success(t('common.exportSuccess'));
  } catch (e) {
    message.error(t('common.exportFailed', { detail: (e as Error).message }));
  } finally {
    hide();
  }
}
