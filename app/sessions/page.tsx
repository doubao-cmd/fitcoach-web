'use client';
import { useMemo, useState } from 'react';
import { getActiveData } from '@/lib/bridge';
import Reveal from '@/components/Reveal';
import PageHeader from '@/components/PageHeader';
import Sparkline from '@/components/Sparkline';

// 动作类型 → 筛选分类
const TYPE_MAP: Record<string, string> = {
  squat: '深蹲', c1: '深蹲',
  pushup: '俯卧撑', c2: '俯卧撑',
  plank: '平板支撑', c3: '平板支撑',
  jumping_jack: '开合跳', c5: '开合跳',
  burpee: '波比跳',
};

function groupOf(dateStr: string): string {
  const d = new Date(dateStr.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return '更早';
  const today = new Date();
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(today) - dayStart(d)) / 86400000);
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays >= 2 && dayStart(today) - dayStart(d) < 7 * 86400000 - 1) return '本周';
  return '更早';
}
const GROUP_ORDER = ['今天', '昨天', '本周', '更早'];

export default function SessionsPage() {
  const d = getActiveData();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('全部');

  const typeChips = useMemo(() => {
    const set = new Set<string>();
    d.recentSessions.forEach((s) => s.exercises.forEach((e) => set.add(TYPE_MAP[e.type] ?? e.type)));
    return ['全部', ...Array.from(set)];
  }, [d.recentSessions]);

  const filtered = useMemo(() => {
    return d.recentSessions.filter((s) => {
      if (keyword && !s.studentName.includes(keyword.trim())) return false;
      if (typeFilter !== '全部' && !s.exercises.some((e) => (TYPE_MAP[e.type] ?? e.type) === typeFilter)) return false;
      return true;
    });
  }, [d.recentSessions, keyword, typeFilter]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    filtered.forEach((s) => {
      const g = groupOf(s.date);
      (m.get(g) ?? m.set(g, []).get(g)!).push(s);
    });
    return m;
  }, [filtered]);

  const totalMinutes = Math.round(filtered.reduce((a, s) => a + s.duration, 0) / 60);
  const avgAcc = filtered.length
    ? Math.round(filtered.reduce((a, s) => a + s.exercises.reduce((x, e) => x + e.avgAccuracy, 0) / s.exercises.length, 0) / filtered.length)
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="训练记录"
        icon="📝"
        subtitle="学员每一次训练的完整明细与 AI 识别结果 · 点击展开逐次标准度"
      />

      {/* 汇总条 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '训练组数', value: filtered.length, unit: '组', color: 'text-blue-600', bg: 'bg-blue-50', icon: '🎯' },
          { label: '累计时长', value: totalMinutes, unit: '分钟', color: 'text-purple-600', bg: 'bg-purple-50', icon: '⏱️' },
          { label: '平均标准度', value: avgAcc, unit: '%', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: '⭐' },
        ].map((x) => (
          <div key={x.label} className={`${x.bg} rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-up`}>
            <span className="text-2xl">{x.icon}</span>
            <div>
              <p className={`text-lg font-black ${x.color} tabular-nums`}>{x.value}<span className="text-xs font-normal text-gray-400 ml-1">{x.unit}</span></p>
              <p className="text-[10px] text-gray-500">{x.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 筛选器 */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="🔍 搜索学员姓名"
          className="px-3.5 py-2 rounded-lg text-xs bg-white border border-gray-200 focus:border-blue-400 focus:outline-none w-full sm:w-56"
        />
        <div className="flex gap-1.5 flex-wrap">
          {typeChips.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                typeFilter === t ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 时间线分组 */}
      {filtered.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-3">📭</p>
          <p className="text-sm">没有符合条件的训练记录</p>
        </div>
      )}
      {GROUP_ORDER.filter((g) => groups.has(g)).map((g) => (
        <div key={g}>
          <div className="flex items-center gap-2 mb-2.5">
            <h3 className="text-xs font-bold text-gray-700 bg-white px-2.5 py-1 rounded-full shadow-sm">{g}</h3>
            <span className="text-[10px] text-gray-400">{groups.get(g)!.length} 组</span>
            <span className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="space-y-3">
            {groups.get(g)!.map((s, i) => {
              const open = expanded === s.id;
              return (
                <Reveal key={s.id} delay={Math.min(i, 6) * 40}>
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden card-hover">
                    <button
                      onClick={() => setExpanded(open ? null : s.id)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-blue-50/40 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xl shrink-0">
                          {d.allStudents.find((st) => st.id === s.studentId)?.avatar ?? '🧑'}
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-gray-800">{s.studentName} 的训练</p>
                          <p className="text-xs text-gray-500">{s.date} · {Math.round(s.duration / 60)} 分钟 · {s.exercises.length} 个动作</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold text-yellow-600">⭐ {s.score}</span>
                        <span className={`text-gray-400 text-xs transition-transform duration-300 ${open ? 'rotate-90' : ''}`}>▶</span>
                      </div>
                    </button>
                    <div className={`acc-panel ${open ? 'open' : ''}`}>
                      <div>
                        <div className="px-5 pb-4 border-t border-gray-100">
                          <div className="pt-4 space-y-3">
                            {s.exercises.map((e, j) => (
                              <div key={j} className="bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2 gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xl">{e.emoji}</span>
                                    <span className="font-medium text-gray-800 capitalize">{TYPE_MAP[e.type] ?? e.type}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm shrink-0">
                                    <span className="text-gray-600">{e.count} {e.unit === 'seconds' ? '秒' : '次'}</span>
                                    <span className={`font-semibold ${e.avgAccuracy >= 90 ? 'text-green-600' : e.avgAccuracy >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>准确度 {e.avgAccuracy}%</span>
                                  </div>
                                </div>
                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                                  <div
                                    className={`h-full rounded-full transition-[width] duration-700 ${e.avgAccuracy >= 90 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : e.avgAccuracy >= 80 ? 'bg-gradient-to-r from-yellow-400 to-amber-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}
                                    style={{ width: open ? `${e.avgAccuracy}%` : '0%' }}
                                  />
                                </div>
                                {e.history && e.history.length > 1 && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] text-gray-400 shrink-0">逐次标准度</span>
                                    <Sparkline
                                      data={e.history}
                                      width={220}
                                      height={26}
                                      color={e.avgAccuracy >= 85 ? '#10b981' : e.avgAccuracy >= 70 ? '#f59e0b' : '#ef4444'}
                                    />
                                    <span className="text-[10px] text-gray-400 ml-auto shrink-0">{e.history.length} 个</span>
                                  </div>
                                )}
                                {e.issues.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">{e.issues.map((issue, k) => (<span key={k} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded">⚠️ {issue}</span>))}</div>
                                ) : (<span className="text-xs text-green-600">✓ 动作标准</span>)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
