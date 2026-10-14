'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { TRAINING_PLANS } from '@/lib/trainingPlans';
import { POSE_EXERCISES } from '@/lib/pose/geometry';
import { WORKOUT_PLANS } from '@/lib/workouts';

const exMap = Object.fromEntries(POSE_EXERCISES.map((e) => [e.id, e]));
const workoutMap = Object.fromEntries(WORKOUT_PLANS.map((w) => [w.id, w]));

export default function PlansPage() {
  const [planId, setPlanId] = useState(TRAINING_PLANS[0].id);
  const plan = TRAINING_PLANS.find((p) => p.id === planId)!;

  return (
    <div className="space-y-5">
      <PageHeader
        icon="🗓️"
        title="训练计划库"
        subtitle="按周期科学安排训练与休息，点任意一天即可开练（AI 实时计数/纠错）"
        actions={
          <Link href="/pose" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200">
            🤖 自由开练
          </Link>
        }
      />

      {/* 计划选择 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TRAINING_PLANS.map((p) => {
          const active = p.id === planId;
          return (
            <button
              key={p.id}
              onClick={() => setPlanId(p.id)}
              className={`text-left rounded-2xl p-5 transition-all active:scale-[0.99] ${
                active ? `bg-gradient-to-br ${p.gradient} text-white shadow-lg` : 'bg-white shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{p.emoji}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>{p.level}</span>
              </div>
              <h3 className={`text-base font-black mt-3 ${active ? 'text-white' : 'text-gray-800'}`}>{p.name}</h3>
              <p className={`text-xs mt-1 leading-5 ${active ? 'text-white/90' : 'text-gray-500'}`}>{p.desc}</p>
              <div className={`flex gap-3 mt-3 text-[11px] font-semibold ${active ? 'text-white/90' : 'text-gray-400'}`}>
                <span>🔁 {p.cycle}</span>
                <span>⏱ {p.minutes}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 计划信息条 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs">
        <span className="text-gray-500">👤 适合：<b className="text-gray-700">{plan.suitable}</b></span>
        <span className="text-gray-500">📅 每周训练 <b className="text-gray-700">{plan.daysPerWeek}</b> 天</span>
        {plan.loopNote && <span className="text-orange-500 font-semibold">💡 {plan.loopNote}</span>}
      </div>

      {/* 一周日程 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {plan.days.map((d) => {
          const isWorkoutDay = !d.rest;
          const firstHref = d.workoutId
            ? `/pose?workout=${d.workoutId}`
            : d.items.length
              ? `/pose?exercise=${d.items[0].id}`
              : '/plans';
          return (
            <div
              key={d.day}
              className={`rounded-2xl p-4 shadow-sm flex flex-col ${
                d.rest ? 'bg-slate-50 border border-dashed border-slate-200' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                    d.rest ? 'bg-slate-200 text-slate-500' : `bg-gradient-to-br ${plan.gradient} text-white`
                  }`}>
                    {d.day}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-gray-800 leading-tight">{d.title}</p>
                    <p className="text-[10px] text-gray-400">{d.rest ? '恢复日' : d.focus}</p>
                  </div>
                </div>
              </div>

              {d.rest ? (
                <p className="text-[11px] text-gray-400 leading-5 flex-1">🛌 {d.tip}</p>
              ) : (
                <ul className="space-y-1.5 flex-1">
                  {d.workoutId && (
                    <li className="text-[10px] font-bold text-orange-500 bg-orange-50 rounded-md px-2 py-1">
                      🎯 跟练课程：{workoutMap[d.workoutId]?.emoji} {workoutMap[d.workoutId]?.name}
                    </li>
                  )}
                  {d.items.map((it, i) => {
                    const ex = exMap[it.id];
                    return (
                      <li key={i} className="flex items-center gap-2 text-[11px] text-gray-600">
                        <span>{ex?.emoji ?? '🏋️'}</span>
                        <span className="flex-1">{ex?.name ?? it.id}</span>
                        <span className="font-bold text-gray-700 tabular-nums">
                          {it.sets} 组 × {it.goal}{it.id === 'c3' ? '秒' : '个'}
                        </span>
                      </li>
                    );
                  })}
                  {d.tip && <li className="text-[10px] text-gray-400 pt-0.5">💡 {d.tip}</li>}
                </ul>
              )}

              {isWorkoutDay && (
                <Link
                  href={firstHref}
                  className={`mt-3 block text-center py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${plan.gradient} hover:opacity-90 transition-opacity active:scale-95`}
                >
                  {d.workoutId ? '🎬 开始跟练课程' : '▶ 开始今日训练'}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-gray-400 pt-2">
        训练前后请查看 <Link href="/knowledge" className="text-blue-500 font-semibold">健身知识</Link> 中的热身与拉伸指导；可用 <Link href="/assessment" className="text-blue-500 font-semibold">体能自测</Link> 记录身体数据
      </p>
    </div>
  );
}
