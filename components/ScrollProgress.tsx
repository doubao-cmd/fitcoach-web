'use client';

import { useEffect, useState } from 'react';

/**
 * 顶部滚动进度条（监听 <main> 滚动容器）
 * 对应 HTML 效果手册「顶部进度条」
 */
export default function ScrollProgress() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const scroller = document.querySelector('main');
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = scroller.scrollHeight - scroller.clientHeight;
        setWidth(max > 0 ? (scroller.scrollTop / max) * 100 : 0);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="sticky top-0 left-0 right-0 h-[3px] z-50 bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-400 transition-[width] duration-150 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
