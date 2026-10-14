'use client';

/** 周目标三个环形进度（纯 SVG） */
function Ring({
  value, max, color, label, sub,
}: { value: number; max: number; color: string; label: string; sub: string }) {
  const pct = Math.min(1, max > 0 ? value / max : 0);
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-[84px] h-[84px]">
        <svg width="84" height="84" className="-rotate-90">
          <circle cx="42" cy="42" r={r} fill="none" stroke="#eef2f7" strokeWidth="8" />
          <circle
            cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-gray-800 leading-none">{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <p className="text-[10px] text-gray-400 -mt-1">{sub}</p>
    </div>
  );
}

export default function GoalsRings({
  goals,
}: {
  goals: { minutes: { done: number; goal: number }; reps: { done: number; goal: number }; calories: { done: number; goal: number } };
}) {
  return (
    <div className="flex items-center justify-around pt-1">
      <Ring value={goals.minutes.done} max={goals.minutes.goal} color="#2f6df0" label="时长" sub={`${goals.minutes.done}/${goals.minutes.goal} 分`} />
      <Ring value={goals.reps.done} max={goals.reps.goal} color="#10b981" label="次数" sub={`${goals.reps.done}/${goals.reps.goal} 个`} />
      <Ring value={goals.calories.done} max={goals.calories.goal} color="#f59e0b" label="消耗" sub={`${goals.calories.done}/${goals.calories.goal} 千卡`} />
    </div>
  );
}
