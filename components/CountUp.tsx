'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** 目标值 */
  end: number;
  /** 动画时长 ms */
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

/**
 * 数字滚动计数：进入视口后从 0 跑到目标值
 * 对应 HTML 效果手册「数字滚动计数」
 */
export default function CountUp({ end, duration = 1100, decimals = 0, suffix = '', prefix = '', className }: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(end * eased);
        if (p < 1) requestAnimationFrame(tick);
        else setValue(end);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [end, duration]);

  const formatted = value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
