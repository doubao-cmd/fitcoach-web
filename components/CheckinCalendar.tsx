'use client';

import { useEffect, useState } from 'react';
import { getCalendar, type CalendarCell } from '@/lib/checkin';

// 演示用确定性打卡图案（无真实记录时展示，让大屏不空）
function demoCalendar(): CalendarCell[] {
  return getCalendar(5).map((c, i) => {
    const v = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r = Math.abs(v);
    const level = (r > 0.62 ? 3 : r > 0.42 ? 2 : r > 0.28 ? 1 : 0) as 0 | 1 | 2 | 3;
    return { ...c, level, data: level ? { sessions: level, reps: level * 12, seconds: 0, minutes: level * 12 } : undefined };
  });
}

const LEVEL_CLS = ['bg-slate-100', 'bg-orange-200', 'bg-orange-400', 'bg-orange-600'];

export default function CheckinCalendar() {
  const [cells, setCells] = useState<CalendarCell[]>([]);
  const [isReal, setIsReal] = useState(false);

  useEffect(() => {
    const real = getCalendar(5);
    const hasReal = real.some((c) => c.level > 0);
    setCells(hasReal ? real : demoCalendar());
    setIsReal(hasReal);
  }, []);

  const weeks = cells.reduce<CalendarCell[][]>((acc, c, i) => {
    (acc[Math.floor(i / 7)] ||= []).push(c);
    return acc;
  }, []);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="contents">
            {week.map((c) => (
              <div
                key={c.key}
                title={`${c.key}${c.data ? `：${c.data.sessions} 组 · ${c.data.minutes} 分钟` : '：未训练'}`}
                className={`aspect-square rounded ${LEVEL_CLS[c.level]} ${c.inMonth ? '' : 'opacity-40'} hover:ring-2 ring-orange-300 transition-all cursor-default`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-[10px] text-gray-400">
        <span>{isReal ? '近 5 周真实打卡' : '近 5 周（演示数据）'} · 周一至周日</span>
        <span className="flex items-center gap-1">
          少
          {[0, 1, 2, 3].map((l) => <span key={l} className={`w-2.5 h-2.5 rounded-sm ${LEVEL_CLS[l]}`} />)}
          多
        </span>
      </div>
    </div>
  );
}
