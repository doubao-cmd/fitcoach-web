'use client';
import { useMemo, useState } from 'react';
import { getActiveData } from '@/lib/bridge';
import { studentExtra } from '@/lib/mock';
import Reveal from '@/components/Reveal';
import PageHeader from '@/components/PageHeader';

const medals = ['🥇', '🥈', '🥉'];
const podiumOrder = [
  { dataIndex: 1, card: 'bg-gradient-to-b from-slate-100 to-white ring-1 ring-slate-300', base: 'h-12 bg-gradient-to-b from-slate-300 to-slate-400', avatar: 'text-4xl', lift: 'mt-10' },
  { dataIndex: 0, card: 'bg-gradient-to-b from-amber-50 to-white ring-2 ring-amber-300 gold-glow', base: 'h-16 bg-gradient-to-b from-amber-300 to-amber-500', avatar: 'text-5xl', lift: '' },
  { dataIndex: 2, card: 'bg-gradient-to-b from-orange-100 to-white ring-1 ring-orange-200', base: 'h-8 bg-gradient-to-b from-orange-300 to-orange-400', avatar: 'text-4xl', lift: 'mt-14' },
];

type MetricKey = 'sessions' | 'duration' | 'score' | 'streak';
const METRICS: { key: MetricKey; label: string; unit: string; pick: (s: { totalSessions: number; totalDuration: number; avgScore: number; id: string }) => number }[] = [
  { key: 'sessions', label: '训练次数', unit: '次', pick: (s) => s.totalSessions },
  { key: 'duration', label: '累计时长', unit: '分钟', pick: (s) => Math.round(s.totalDuration / 60) },
  { key: 'score', label: '平均评分', unit: '分', pick: (s) => s.avgScore },
  { key: 'streak', label: '连续打卡', unit: '天', pick: (s) => studentExtra[s.id]?.streak ?? 0 },
];

export default function LeaderboardPage() {
  const d = getActiveData();
  const [metric, setMetric] = useState<MetricKey>('sessions');
  const conf = METRICS.find((m) => m.key === metric)!;

  const ranked = useMemo(() => {
    return [...d.leaderboardData].sort((a, b) => conf.pick(b) - conf.pick(a));
  }, [d.leaderboardData, conf]);

  const myIndex = ranked.findIndex((s) => s.id === 'me');
  const displayVal = (s: (typeof ranked)[number]) => `${conf.pick(s)} ${conf.unit}`;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="排行榜" icon="🏆" subtitle="按不同维度查看学员排名 · 名次每周更新" />

      {/* 维度切换 */}
      <div className="inline-flex bg-white rounded-xl p-1 shadow-sm gap-1 self-start animate-fade-up">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 ${
              metric === m.key ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow' : 'text-gray-500 hover:text-amber-600'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 我的排名 */}
      {myIndex >= 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 px-5 flex items-center gap-4 shadow-lg shadow-blue-200 animate-fade-up">
          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">{myIndex + 1}</span>
          <span className="text-2xl">{ranked[myIndex].avatar}</span>
          <span className="flex-1 text-sm font-semibold">我的排名（手机端数据）</span>
          <span className="text-lg font-black tabular-nums">{displayVal(ranked[myIndex])}</span>
        </div>
      )}

      {/* 领奖台 */}
      <div className="flex items-end justify-center gap-3 sm:gap-5 mb-2">
        {podiumOrder.map((p, vi) => {
          const s = ranked[p.dataIndex];
          if (!s) return null;
          const rank = p.dataIndex + 1;
          const isChamp = rank === 1;
          return (
            <Reveal key={s.id + metric} delay={vi === 1 ? 0 : 120} className={`flex-1 max-w-[280px] w-full ${p.lift}`}>
              <div className="flex flex-col">
                <div className={`rounded-2xl shadow-sm px-3 sm:px-6 pt-5 pb-5 text-center card-hover relative ${p.card}`}>
                  {isChamp && (
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-3xl animate-bounce-slow">👑</span>
                  )}
                  <div className={`${isChamp ? 'animate-bounce-slow' : ''} ${isChamp ? 'text-5xl mb-2' : 'text-4xl mb-1.5'}`}>{medals[rank - 1]}</div>
                  <div className={`${p.avatar} mb-1`}>{s.avatar}</div>
                  <h3 className={`font-bold text-gray-800 ${isChamp ? 'text-lg' : 'text-base'}`}>{s.name}</h3>
                  <p className="text-sm text-primary font-semibold mt-2 tabular-nums">{displayVal(s)}</p>
                </div>
                <div className={`mt-1 rounded-b-xl sm:rounded-b-2xl flex items-center justify-center text-white font-bold ${p.base}`}>
                  <span className={isChamp ? 'text-2xl' : 'text-lg'}>{rank}</span>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      {/* 完整榜单 */}
      <Reveal delay={120}>
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto card-hover">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-5 py-3 font-medium w-20">排名</th>
                <th className="text-left px-5 py-3 font-medium">学员</th>
                <th className="text-right px-5 py-3 font-medium">{conf.label}</th>
                <th className="text-right px-5 py-3 font-medium">周变化</th>
                <th className="text-left px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => {
                const delta = studentExtra[s.id]?.rankDelta ?? 0;
                return (
                  <tr key={s.id} className={`border-t border-gray-100 hover:bg-blue-50/50 transition-colors ${s.id === 'me' ? 'bg-blue-50/70' : ''}`}>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i < 3 ? 'bg-gradient-to-br from-amber-300 to-yellow-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="text-lg">{s.avatar}</span><span className="font-medium text-gray-800">{s.name}</span></div></td>
                    <td className="px-5 py-3 text-right font-semibold text-primary tabular-nums">{displayVal(s)}</td>
                    <td className="px-5 py-3 text-right">
                      {delta > 0
                        ? <span className="text-xs font-bold text-emerald-600">↑ {delta}</span>
                        : delta < 0
                          ? <span className="text-xs font-bold text-red-500">↓ {Math.abs(delta)}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.status === 'active' ? '🟢 活跃' : '⚪ 流失'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
