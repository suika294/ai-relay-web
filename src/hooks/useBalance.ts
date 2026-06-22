// useBalance —— 取当前用户的余额 + 汇率信息,供任何页面共享。
//
// 设计:
//   * 模块级 Promise 缓存:同一个 SPA 生命周期内 GET /api/v1/user/balance 只发一次,
//     多个组件 mount 时都拿同一个值。token_groups / tokens 这两个页面要做
//     quota ↔ CNY 换算,频繁切换不应反复打接口。
//   * 提供 refresh():充值 / 续金额后调一下强制重拉。
//   * 提供 quotaToDisplay / displayToQuota 两个纯函数,避免每个页面各自手算。
//
// 不放到 initialState 里:initialState 由 app.tsx 在登录前就跑,
// 而 balance 需要登录态;放在按需 hook 里更干净。

import { useCallback, useEffect, useState } from 'react';
import { userApi } from '@/services/api';

let cached: API.Balance | null = null;
let pending: Promise<API.Balance | null> | null = null;

async function fetchBalance(force = false): Promise<API.Balance | null> {
  if (!force && cached) return cached;
  if (!force && pending) return pending;
  pending = userApi
    .balance()
    .then((res) => {
      if (res.code === 0 && res.data) {
        cached = res.data;
        return cached;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useBalance() {
  const [balance, setBalance] = useState<API.Balance | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    if (cached) {
      setBalance(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBalance().then((b) => {
      if (active) {
        setBalance(b);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const b = await fetchBalance(true);
    setBalance(b);
    setLoading(false);
    return b;
  }, []);

  return { balance, loading, refresh };
}

// quotaToDisplay 把内部 quota 单位换算成用户偏好币种(默认 CNY)的金额数字。
// 公式:quota / quota_per_usd * exchange_rate。
// balance 缺失时回退到 0(调用方应在 balance 加载完再展示)。
export function quotaToDisplay(quota: number, balance: API.Balance | null): number {
  if (!balance || !balance.quota_per_usd) return 0;
  const usd = quota / balance.quota_per_usd;
  const rate = Number(balance.exchange_rate) || 1;
  return usd * rate;
}

// displayToQuota 用户填的"100 元"换回内部 quota 单位,作为 token_group.quota_limit 入参。
// 公式:display / exchange_rate * quota_per_usd,向上取整保证用户填的金额至少能覆盖。
// balance 缺失时返回 0(调用方应禁用提交按钮)。
export function displayToQuota(display: number, balance: API.Balance | null): number {
  if (!balance || !balance.quota_per_usd) return 0;
  const rate = Number(balance.exchange_rate) || 1;
  if (rate <= 0) return 0;
  const usd = display / rate;
  return Math.ceil(usd * balance.quota_per_usd);
}

// formatDisplay 统一 "数字 + 币种" 的展示形式,2 位小数。
// 调用方可以传 alwaysShowCurrency=false 在表格列里省掉重复后缀。
export function formatDisplay(
  amountDisplay: number,
  balance: API.Balance | null,
  alwaysShowCurrency = true,
): string {
  const v = amountDisplay.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!alwaysShowCurrency || !balance) return v;
  return `${v} ${balance.display_currency || 'USD'}`;
}
