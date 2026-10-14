'use client';
import { getActiveData } from '@/lib/bridge';
import PageHeader from '@/components/PageHeader';
import WeeklyMinutesChart from '@/components/charts/WeeklyMinutesChart';
import ExercisePieChart from '@/components/charts/ExercisePieChart';
import HeatmapChart from '@/components/charts/HeatmapChart';

export default function ReportPage() {
  const d = getActiveData();

  const week = d.weeklyMinutesData;
  const weekMinutes = week.reduce((a, x) => a + x.minutes, 0);
  const weekSessions = week.reduce((a, x) => a + x.sessions, 0);
  const activeDays = week.filter((x) => x.sessions > 0).length;
  const accVals = d.recentSessions.flatMap((s) => s.exercises.map((e) => e.avgAccuracy));
  const avgAcc = accVals.length ? Math.round(accVals.reduce((a, b) => a + b, 0) / accVals.length) : 0;
  const totalReps = d.recentSessions
    .flatMap((s) => s.exercises.map((e) => (e.unit === 'seconds' ? 0 : e.count)))
    .reduce((a, b) => a + b, 0);
  const estKcal = Math.round(weekMinutes * 6.5);
  const bestDay = [...week].sort((a, b) => b.minutes - a.minutes)[0];
  const favExercise = [...d.exerciseDistributionData].sort((a, b) => b.value - a.value)[0];
  const top3 = d.leaderboardData.slice(0, 3);

  const kpis = [
    { label: '训练组数', value: weekSessions, unit: '组', icon: '🎯' },
    { label: '训练时长', value: weekMinutes, unit: '分钟', icon: '⏱️' },
    { label: '动作总数', value: totalReps, unit: '个', icon: '🏋️' },
    { label: '平均标准度', value: avgAcc, unit: '%', icon: '⭐' },
    { label: '打卡天数', value: activeDays, unit: '/7 天', icon: '🔥' },
    { label: '估算消耗', value: estKcal, unit: '千卡', icon: '🔥' },
  ];

  const comments = [
    activeDays >= 5 ? '本周训练非常自律，打卡超过 5 天，保持这个节奏！' : activeDays >= 3 ? '本周保持了规律训练，试着把打卡提升到 5 天。' : '本周训练天数偏少，建议从每天 10 分钟的入门计划开始。',
    bestDay && bestDay.minutes > 0 ? `训练最投入的是${bestDay.day}（${bestDay.minutes} 分钟），可把高强度日固定在状态最好的时段。` : '本周还没有训练记录，先从一个深蹲组开始吧。',
    favExercise ? `最常练的动作是「${favExercise.name}」，注意均衡发展，${favExercise.name === '深蹲' ? '可加入俯卧撑与平板支撑平衡上下肢。' : '可加入深蹲强化下肢力量。'}` : '',
    avgAcc >= 90 ? '动作标准度优秀，AI 纠错提示很少触发，可以挑战更高难度档位。' : avgAcc >= 80 ? '动作标准度良好，重点改进 AI 提示最多的细节即可。' : '标准度还有提升空间，建议放慢速度、对照动作要点练习。',
  ].filter(Boolean);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="本周训练报告" icon="📄"
        subtitle={`${d.isImported ? '手机端真实数据' : '演示数据'} · 生成于 ${new Date().toLocaleDateString('zh-CN')}`}
        actions={
          <button onClick={() => window.print()}
            className="print-hide inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200 hover:opacity-90 active:scale-95 transition-all">
            🖨️ 打印 / 导出 PDF
          </button>
        } />

      {/* 报告封面条 */}
      <div className="aurora rounded-2xl p-6 text-white animate-fade-up">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-blue-100">FitCoach AI 健身私教 · 周报</p>
            <h2 className="text-2xl font-black mt-1">本周累计运动 {weekMinutes} 分钟</h2>
            <p className="text-xs text-blue-100 mt-1">打卡 {activeDays} 天 · {weekSessions} 组训练 · 平均标准度 {avgAcc}%</p>
          </div>
          <span className="text-5xl">🏅</span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <div key={k.label} className="bg-white rounded-xl shadow-sm p-4 card-hover animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <p className="text-lg mb-1">{k.icon}</p>
            <p className="text-xl font-black text-gray-800 tabular-nums">{k.value}<span className="text-[10px] font-normal text-gray-400 ml-1">{k.unit}</span></p>
            <p className="text-[10px] text-gray-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* 亮点点评 */}
      <div className="bg-white rounded-xl shadow-sm p-5 card-hover">
        <h2 className="text-sm font-bold text-gray-800 mb-3">💡 AI 本周点评</h2>
        <ul className="space-y-2">
          {comments.map((c, i) => (
            <li key={i} className="text-xs text-gray-600 flex items-start gap-2 leading-5">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>{c}
            </li>
          ))}
        </ul>
      </div>

      {/* 图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 card-hover">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">📊 本周每日训练量</h2>
          <WeeklyMinutesChart data={week} />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 card-hover">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">🥧 动作类型分布</h2>
          <ExercisePieChart data={d.exerciseDistributionData} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 card-hover lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">🕐 训练时段分布</h2>
          <HeatmapChart data={d.heatmapData} />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 card-hover">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">🏆 本周训练之星</h2>
          <div className="space-y-3">
            {top3.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <span>{['🥇', '🥈', '🥉'][i]}</span>
                <span className="text-xl">{s.avatar}</span>
                <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                <span className="text-sm font-bold text-blue-600 tabular-nums">{s.totalSessions} 次</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-gray-400 pb-4">FitCoach · AI+体感的宿舍健身私教系统 · 报告数据由端侧姿态识别自动采集</p>
    </div>
  );
}
