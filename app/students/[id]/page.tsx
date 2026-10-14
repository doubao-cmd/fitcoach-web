'use client';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  getStudentById, getStudentSessions, getStudentTrend,
  getStudentBadges, getStudentHeatmap, getStudentExerciseDist,
} from '@/lib/bridge';
import { studentExtra } from '@/lib/mock';
import Reveal from '@/components/Reveal';
import Sparkline from '@/components/Sparkline';
import ExercisePieChart from '@/components/charts/ExercisePieChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function StudentDetailPage({ params }: { params: { id: string } }) {
  const student = getStudentById(params.id);
  if (!student) return notFound();
  const sessions = getStudentSessions(params.id);
  const trend = getStudentTrend(params.id);
  const badges = getStudentBadges(params.id);
  const heat = getStudentHeatmap(params.id);
  const dist = getStudentExerciseDist(params.id);
  const extra = studentExtra[params.id];

  // 个人纪录
  const bestReps = sessions.reduce((m, s) =>
    Math.max(m, ...s.exercises.map((e) => (e.unit === 'seconds' ? 0 : e.count))), 0);
  const bestPlank = sessions.reduce((m, s) =>
    Math.max(m, ...s.exercises.map((e) => (e.unit === 'seconds' ? e.count : 0))), 0);
  const bestAcc = sessions.reduce((m, s) =>
    Math.max(m, ...s.exercises.map((e) => e.avgAccuracy)), 0);
  const longestMin = sessions.reduce((m, s) => Math.max(m, Math.round(s.duration / 60)), 0);

  const option = {
    tooltip: { trigger: 'axis' }, grid: { left: 35, right: 20, top: 10, bottom: 25 },
    xAxis: { type: 'category', data: trend.map((t) => t.day), axisLabel: { color: '#999' } },
    yAxis: { type: 'value', min: 0, max: 5, axisLabel: { color: '#999' } },
    series: [{ type: 'line', smooth: true, data: trend.map((t) => t.score), itemStyle: { color: '#4A90E2' }, areaStyle: { color: 'rgba(74,144,226,0.15)' } }],
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Link href="/students" className="inline-block text-sm text-primary hover:underline animate-fade-up">← 返回学员列表</Link>

      <Reveal>
        <div className="aurora rounded-2xl shadow-lg p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6 text-white">
          <div className="relative z-10 w-20 h-20 rounded-full bg-white/20 glass flex items-center justify-center text-5xl shrink-0">
            {student.avatar}
          </div>
          <div className="flex-1 relative z-10">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{student.name}</h1>
              {(extra?.streak ?? 0) > 0 && (
                <span className="text-xs bg-orange-500/90 px-2 py-0.5 rounded-full font-bold">🔥 连续 {extra.streak} 天</span>
              )}
            </div>
            <p className="text-sm text-blue-100/90 mt-1">加入时间 {student.joinedAt} · 最近活跃 {student.lastActiveAt}</p>
            <div className="flex gap-5 mt-3 text-sm flex-wrap">
              <span className="text-blue-100">训练 <b className="text-white text-base">{student.totalSessions}</b> 次</span>
              <span className="text-blue-100">累计 <b className="text-white text-base">{Math.round(student.totalDuration / 60)}</b> 分钟</span>
              <span className="text-blue-100">平均评分 <b className="text-amber-300 text-base">⭐ {student.avgScore}</b></span>
            </div>
          </div>
          <span className="relative z-10 text-sm px-3 py-1 rounded-full glass text-white">{student.status === 'active' ? '🟢 活跃学员' : '⚪ 已流失'}</span>
        </div>
      </Reveal>

      {/* PR 个人纪录 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '单组最高次数', value: bestReps, unit: '个', icon: '🏋️', bg: 'bg-blue-50', color: 'text-blue-600' },
          { label: '最长平板支撑', value: bestPlank, unit: '秒', icon: '🧘', bg: 'bg-violet-50', color: 'text-violet-600' },
          { label: '最高标准度', value: bestAcc, unit: '%', icon: '⭐', icon2: '', bg: 'bg-amber-50', color: 'text-amber-600' },
          { label: '最长训练时长', value: longestMin, unit: '分钟', icon: '⏱️', bg: 'bg-emerald-50', color: 'text-emerald-600' },
        ].map((pr, i) => (
          <Reveal key={pr.label} delay={i * 70}>
            <div className="bg-white rounded-xl shadow-sm p-4 card-hover">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-gray-400">{pr.label}</p>
                <span className="text-lg">{pr.icon}</span>
              </div>
              <p className={`text-2xl font-black ${pr.color} tabular-nums`}>{pr.value || '--'}<span className="text-xs font-normal text-gray-400 ml-1">{pr.unit}</span></p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Reveal>
          <div className="bg-white rounded-xl shadow-sm p-5 h-full card-hover">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">📈 评分进步趋势（近 14 天）</h2>
            <ReactECharts option={option} style={{ height: 260 }} />
          </div>
        </Reveal>
        <Reveal delay={90}>
          <div className="bg-white rounded-xl shadow-sm p-5 h-full card-hover">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">🥧 动作偏好</h2>
            {dist.length > 0
              ? <ExercisePieChart data={dist} />
              : <p className="text-sm text-gray-400 text-center py-16">暂无训练记录</p>}
          </div>
        </Reveal>
      </div>

      {/* 热力图 + 徽章墙 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Reveal className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm p-5 h-full card-hover">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">🕐 个人训练时段热力图（近 7 天）</h2>
            <HeatmapChart data={heat} />
          </div>
        </Reveal>
        <Reveal delay={90}>
          <div className="bg-white rounded-xl shadow-sm p-5 h-full card-hover">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">🎖️ 成就徽章</h2>
            <p className="text-[11px] text-gray-400 mb-3">已解锁 {badges.filter((b) => b.unlocked).length}/{badges.length}</p>
            <div className="grid grid-cols-4 gap-2">
              {badges.map((b) => (
                <div key={b.name} title={`${b.name}：${b.desc}`}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 text-center p-1 ${b.unlocked ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <span className={`text-xl ${b.unlocked ? '' : 'grayscale opacity-30'}`}>{b.unlocked ? b.emoji : '🔒'}</span>
                  <span className={`text-[9px] leading-tight ${b.unlocked ? 'text-amber-700' : 'text-gray-400'}`}>{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      {/* 训练历史 */}
      <Reveal>
        <div className="bg-white rounded-xl shadow-sm p-5 card-hover">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">📝 训练历史（{sessions.length}）</h2>
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p className="text-sm">该学员还没有训练记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s, i) => (
                <div key={s.id}
                  className="border border-gray-100 rounded-lg p-3 hover:border-blue-200 hover:bg-blue-50/40 transition-all animate-fade-up"
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400">{s.date} · {Math.round(s.duration / 60)} 分钟</span>
                    <span className="text-sm font-semibold text-yellow-600">⭐ {s.score}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.exercises.map((e, j) => (
                      <div key={j} className="flex items-center gap-2 bg-blue-50/70 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs text-blue-700 whitespace-nowrap">{e.emoji} {e.count}{e.unit === 'seconds' ? '秒' : '次'} · {e.avgAccuracy}%</span>
                        {e.history && e.history.length > 1 && (
                          <Sparkline data={e.history} width={70} height={20}
                            color={e.avgAccuracy >= 85 ? '#10b981' : e.avgAccuracy >= 70 ? '#f59e0b' : '#ef4444'} fill={false} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
