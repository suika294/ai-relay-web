// Playground 公开版的「手动填写 API Key」共享状态。
//
// 为什么不用各面板各自的 state:Playground 外壳把所有面板(对话/图像/视频/…)同时挂载在一组
// Tabs 里,用户在任意一个 Tab 填了 key,切到别的 Tab 应当还在。所以用一个模块级的小 store +
// useSyncExternalStore,让所有面板订阅同一个值、实时同步;并落 localStorage,刷新后保留。
//
// 注意:这把 key 是用户(运营)从管理员手里拿到的 sk- 明文,直接作为 Bearer 调 /v1/*。
// 不再走 tokenApi.list()(那需要登录态、且会暴露账号下所有 key 列表)。
import { useSyncExternalStore } from 'react';

const LS_KEY = 'playground_api_key';

let current = readInitial();
const listeners = new Set<() => void>();

function readInitial(): string {
  try {
    return localStorage.getItem(LS_KEY) || '';
  } catch {
    return '';
  }
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): string {
  return current;
}

function setApiKey(next: string) {
  current = next;
  try {
    if (next) localStorage.setItem(LS_KEY, next);
    else localStorage.removeItem(LS_KEY);
  } catch {
    // 隐私模式 / 配额满:仅内存态可用,不向上抛
  }
  emit();
}

// 跨标签页同步(另一个标签改了 key 也跟随)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY) {
      current = e.newValue || '';
      emit();
    }
  });
}

export function usePlaygroundApiKey(): {
  apiKey: string;
  setApiKey: (v: string) => void;
} {
  const apiKey = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { apiKey, setApiKey };
}
