'use client';

import { useEffect, useState } from 'react';
import { SW_UPDATE_EVENT } from './RegisterSW';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'fitcoach_pwa_install_dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** 「添加到桌面/主屏幕」安装引导（Chromium 系），已忽略 30 天内不再打扰 */
function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < 30 * 24 * 3600 * 1000) return;
    } catch {}

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      try { window.localStorage.removeItem(DISMISS_KEY); } catch {}
    };
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === 'dismissed') dismiss();
    else setDeferred(null);
  };

  if (!deferred) return null;

  return (
    <div className="fixed z-50 bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-[22rem] animate-fade-up">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-4 flex items-center gap-3">
        <span className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-blue-700 to-teal-700 text-white text-xl flex items-center justify-center">
          🏋️
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">安装 FitCoach 到桌面</p>
          <p className="text-[11px] text-gray-500 leading-snug">独立窗口启动、离线也能练，浏览器里不再有地址栏</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={install}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors active:scale-95"
          >
            安装
          </button>
          <button
            onClick={dismiss}
            className="px-3.5 py-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            以后再说
          </button>
        </div>
      </div>
    </div>
  );
}

/** Service Worker 发现新版本时的更新提示条 */
function UpdateToast() {
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      setReg((e as CustomEvent<ServiceWorkerRegistration>).detail);
    };
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);

  const doRefresh = () => {
    if (!reg?.waiting) {
      window.location.reload();
      return;
    }
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    try { reg.waiting.postMessage('SKIP_WAITING'); } catch { window.location.reload(); }
    // 兜底：极少数情况下 controllerchange 不触发
    setTimeout(reload, 1500);
  };

  if (!reg) return null;

  return (
    <div className="fixed z-50 top-4 left-1/2 -translate-x-1/2 px-4 w-full max-w-md animate-fade-up">
      <div className="glass-dark rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 text-white">
        <span className="text-lg shrink-0">✨</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">发现新版本</p>
          <p className="text-[11px] text-white/70">刷新后即可使用最新功能</p>
        </div>
        <button
          onClick={doRefresh}
          className="shrink-0 px-3.5 py-1.5 rounded-lg bg-white text-blue-700 text-xs font-bold hover:bg-blue-50 transition-colors active:scale-95"
        >
          立即刷新
        </button>
        <button
          onClick={() => setReg(null)}
          className="shrink-0 w-7 h-7 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm"
          aria-label="稍后更新"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function PwaPrompts() {
  return (
    <>
      <UpdateToast />
      <InstallPrompt />
    </>
  );
}
