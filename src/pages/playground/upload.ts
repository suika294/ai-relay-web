import { apiURL } from '@/utils/request';

// Playground 公开版的参考图上传:走 sk- key 鉴权的 POST /v1/assets(后端 RelayUploadAsset),
// 不再用 assetApi.upload(那走登录态 JWT,未登录运营会 401)。
//
// 后端返回 {code, data:{asset, url}}:url 已是可公开访问的内容链(本地存储拼 /v1/cdn 永久链
// 或签名的 /api/v1/assets/:id/content),直接喂给上游,无需再调需登录的 detail 接口。
export async function playgroundUpload(
  file: File,
  apiKey: string,
  extra?: { module?: string; purpose?: string },
): Promise<{ url: string; id: number }> {
  const fd = new FormData();
  fd.append('file', file);
  if (extra?.module) fd.append('module', extra.module);
  if (extra?.purpose) fd.append('purpose', extra.purpose);

  const res = await fetch(apiURL('/v1/assets'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 错误体 */
  }
  if (!res.ok || !body || body.code !== 0 || !body.data?.url) {
    const msg =
      body?.error?.message || body?.message || `upload failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return { url: body.data.url, id: body.data.asset?.id };
}
