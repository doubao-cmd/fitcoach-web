'use client';

import { useEffect } from 'react';

/**
 * 注册 /sw.js（仅生产环境）。
 * 新版本激活后若此前已受 SW 控制，自动刷新一次，避免新旧 chunk 混用。
 */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let refreshing = false;
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 注册失败不影响正常使用 */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
