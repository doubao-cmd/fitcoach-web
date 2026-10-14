'use client';

import { useEffect } from 'react';

/**
 * 注册 /sw.js（仅生产环境）。
 * - 首次安装：无旧 SW 控制页面时直接发 SKIP_WAITING 立即激活
 * - 版本升级：新 SW 停在 waiting，派发 window 事件 sw-update-ready，
 *   由 <PwaPrompts/> 弹提示条，用户确认后 postMessage SKIP_WAITING
 * - 页面重新可见时主动检查更新
 */
export const SW_UPDATE_EVENT = 'sw-update-ready';

export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    const notifyWaiting = (reg: ServiceWorkerRegistration) => {
      window.dispatchEvent(new CustomEvent<ServiceWorkerRegistration>(SW_UPDATE_EVENT, { detail: reg }));
    };

    const watchRegistration = (reg: ServiceWorkerRegistration) => {
      // 已有 waiting worker：注册时（更新已随页面下载）或事件中都会出现
      if (reg.waiting) {
        if (navigator.serviceWorker.controller) notifyWaiting(reg);
        else { try { reg.waiting.postMessage('SKIP_WAITING'); } catch {} }
      }
      const onUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (cancelled) return;
          if (installing.state === 'installed') {
            if (navigator.serviceWorker.controller) notifyWaiting(reg);
            else { try { installing.postMessage('SKIP_WAITING'); } catch {} }
          }
        });
      };
      reg.addEventListener('updatefound', onUpdateFound);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
      }
    };

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          if (cancelled) return;
          watchRegistration(reg);
        })
        .catch(() => {
          /* 注册失败不影响正常使用 */
        });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
