'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';
import Reveal from '@/components/Reveal';
import WeeklyMinutesChart from '@/components/charts/WeeklyMinutesChart';
import ExercisePieChart from '@/components/charts/ExercisePieChart';
import LeaderboardBarChart from '@/components/charts/LeaderboardBarChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
import TrendLineChart from '@/components/charts/TrendLineChart';
import AccuracyRadarChart from '@/components/charts/AccuracyRadarChart';
import GoalsRings from '@/components/GoalsRings';
import CheckinCalendar from '@/components/CheckinCalendar';
import { getActiveData, parseMobileJson, saveImportedData, clearImportedData, loadImportedData } from '@/lib/bridge';
import { downloadBackup, parseWebBackup, restoreWebBackup, describeBackup } from '@/lib/backup';

const feedDot: Record<string, string> = {
  blue: 'bg-blue-500', green: 'bg-emerald-500', orange: 'bg-amber-500', purple: 'bg-violet-500',
};

function Card({ title, icon, sub, children, className = '' }: {
  title: string; icon: string; sub?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <Reveal className={className}>
      <div className="bg-white rounded-xl shadow-sm p-5 h-full card-hover flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">{icon} {title}</h2>
          {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </Reveal>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(() => getActiveData());
  const [hasImport, setHasImport] = useState(() => !!loadImportedData());
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // 导入后强制刷新
  useEffect(() => {
    setData(getActiveData());
    setHasImport(!!loadImportedData());
  }, [hasImport]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseMobileJson(text);
      saveImportedData(parsed);
      setFileName(file.name);
      setHasImport(true);
      alert(`✅ 导入成功！已加载 ${parsed.sessions?.length ?? 0} 条手机端训练记录，页面将自动刷新。`);
    } catch (err) {
      alert('❌ 导入失败：' + (err as Error).message);
    }
    // 重置 input 让同样文件能再次选
    e.target.value = '';
  };

  const handleClear = () => {
    if (!confirm('确定要清除导入的手机数据吗？将恢复为 mock 演示数据。')) return;
    clearImportedData();
    setFileName(null);
    setHasImport(false);
  };

  const handleRefresh = () => {
    setData(getActiveData());
  };

  // 全量备份恢复（跨电脑/浏览器迁移，整体覆盖训练记录与打卡数据）
  const handleBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const backup = parseWebBackup(await file.text());
      const d = describeBackup(backup);
      if (!confirm(`将用该备份覆盖本机数据：\n训练记录 ${d.sessions} 条、打卡 ${d.checkinDays} 天${d.hasPref ? '、模型偏好' : ''}\n导出时间：${backup.exportAt}\n\n确定恢复吗？`)) {
        e.target.value = '';
        return;
      }
      const n = restoreWebBackup(backup);
      alert(`✅ 已恢复 ${n} 项数据，页面即将刷新。`);
      window.location.reload();
    } catch (err) {
      alert('❌ 恢复失败：' + (err as Error).message);
    }
    e.target.value = '';
  };

  const t = data.statTrends ?? {};
  const sparks = data.statSparks ?? {};

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ===== Hero 极光横幅 ===== */}
      <div className="aurora rounded-2xl p-6 text-white shadow-xl shadow-indigo-900/20 animate-fade-up">
        <div className="relative z-10 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium glass rounded-full px-3 py-1 mb-3">
              ⚡ AI + 体感的宿舍健身私教
            </span>
            <h1 className="text-2xl font-bold tracking-wide">数据大屏</h1>
            <p className="text-xs text-blue-100/90 mt-1.5">
              {hasImport
                ? `📱 手机端数据 · 共 ${data.statCards.totalSessions} 条记录${fileName ? ` · ${fileName}` : ''}`
                : '实时掌握学员训练情况 · 当前使用演示数据'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href="/pose"
              className="px-4 py-2 bg-gradient-to-r from-emerald-400 to-teal-400 text-emerald-950 text-sm font-bold rounded-lg hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-lg"
            >
              🤖 开始 AI 识别
            </Link>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="选择手机端导出的训练数据 JSON 文件"
            />
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleBackupFile}
              className="hidden"
              aria-label="选择本系统导出的备份 JSON 文件以恢复数据"
            />
            <button
              onClick={downloadBackup}
              className="glass w-9 h-9 rounded-lg text-white text-sm hover:bg-white/25 transition-colors"
              title="备份全部数据（训练记录+打卡）为 JSON 文件"
              aria-label="备份全部数据为 JSON 文件"
            >
              💾
            </button>
            <button
              onClick={() => backupInputRef.current?.click()}
              className="glass w-9 h-9 rounded-lg text-white text-sm hover:bg-white/25 transition-colors"
              title="从备份 JSON 恢复数据（覆盖本机数据）"
              aria-label="从备份文件恢复数据"
            >
              ♻️
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-white text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-50 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-lg shadow-blue-950/30"
            >
              📂 导入手机数据
            </button>
            {hasImport && (
              <>
                <button
                  onClick={handleRefresh}
                  className="glass w-9 h-9 rounded-lg text-white text-sm hover:bg-white/25 transition-colors"
                  title="刷新数据"
                  aria-label="刷新导入的数据"
                >
                  🔄
                </button>
                <button
                  onClick={handleClear}
                  className="glass w-9 h-9 rounded-lg text-white text-sm hover:bg-red-500/40 transition-colors"
                  title="清除导入数据"
                  aria-label="清除已导入的数据"
                >
                  🗑️
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="总学员数" value={data.statCards.totalStudents} unit="人" icon="👥" delay={0}
          trend={t.totalStudents?.text} trendUp={t.totalStudents?.up ?? true} spark={sparks.totalStudents} href="/students" />
        <StatCard title="今日活跃" value={data.statCards.activeToday} unit="人" icon="🔥" color="bg-orange-50" delay={70}
          trend={t.activeToday?.text} trendUp={t.activeToday?.up ?? true} spark={sparks.activeToday} />
        <StatCard title="总训练次数" value={data.statCards.totalSessions} unit="次" icon="🎯" color="bg-green-50" delay={140}
          trend={t.totalSessions?.text} trendUp={t.totalSessions?.up ?? true} spark={sparks.totalSessions} href="/sessions" />
        <StatCard title="累计时长" value={Math.round(data.statCards.totalMinutes / 60)} unit="小时" icon="⏱️" color="bg-purple-50" delay={210}
          trend={t.totalMinutes?.text} trendUp={t.totalMinutes?.up ?? true} spark={sparks.totalMinutes} />
        <StatCard title="平均准确度" value={data.statCards.avgAccuracy} unit="%" icon="⭐" color="bg-yellow-50" delay={280} decimals={1}
          trend={t.avgAccuracy?.text} trendUp={t.avgAccuracy?.up ?? true} spark={sparks.avgAccuracy} />
        <StatCard title="训练完成率" value={data.statCards.completionRate} unit="%" icon="✅" color="bg-cyan-50" delay={350} decimals={1}
          trend={t.completionRate?.text} trendUp={t.completionRate?.up ?? true} spark={sparks.completionRate} />
      </div>

      {/* ===== Bento 第一行：趋势 + 雷达 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="近 30 天训练趋势" icon="📈" className="lg:col-span-2">
          <TrendLineChart data={data.trendData} />
        </Card>
        <Card title="动作标准度画像" icon="🎯" sub="按动作均值">
          <AccuracyRadarChart data={data.accuracyRadar} />
        </Card>
      </div>

      {/* ===== Bento 第二行：动作分布 + 周目标环 + 打卡榜 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="动作类型分布" icon="🥧">
          <ExercisePieChart data={data.exerciseDistributionData} />
        </Card>
        <Card title="本周目标" icon="🌀" sub={`${new Date().getMonth() + 1}月第${Math.ceil(new Date().getDate() / 7)}周`}>
          <div className="h-full flex items-center">
            <GoalsRings goals={data.weeklyGoals} />
          </div>
        </Card>
        <Card title="连续打卡榜" icon="🔥" sub="近 30 天">
          <div className="space-y-2.5">
            {data.streakBoard.map((s, i) => (
              <Link key={s.name + i} href="/leaderboard"
                className="flex items-center gap-3 py-1 px-1 rounded-lg hover:bg-blue-50/60 transition-colors">
                <span className={`w-5 text-center text-xs font-black ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'}`}>
                  {i + 1}
                </span>
                <span className="text-lg">{s.avatar}</span>
                <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                <span className="text-sm font-bold text-orange-500 tabular-nums">{s.streak} 天</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* ===== Bento 第三行：排行榜 + 技术状态 + 动态流 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="训练次数排行 Top 10" icon="🏆">
          <LeaderboardBarChart
            data={data.leaderboardData.map((s) => ({ name: s.name, totalSessions: s.totalSessions }))}
          />
        </Card>
        <Card title="端侧 AI 引擎" icon="🧠" sub="视频不出本机">
          <div className="grid grid-cols-2 gap-2">
            {data.techStatus.map((x) => (
              <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 hover:border-blue-200 hover:bg-blue-50/40 transition-colors">
                <p className="text-base mb-0.5">{x.icon}</p>
                <p className="text-[11px] font-bold text-gray-800 leading-tight">{x.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{x.desc}</p>
              </div>
            ))}
          </div>
          <Link href="/pose" className="mt-3 block text-center text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg py-2 transition-colors">
            立即体验识别引擎 →
          </Link>
        </Card>
        <Card title="实时训练动态" icon="📡" sub="Live">
          <div className="relative h-full">
            <span className="absolute -top-0.5 right-0 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <div className="space-y-3 max-h-[252px] overflow-auto pr-1">
              {data.activityFeed.map((f) => (
                <div key={f.id} className="flex gap-2.5">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${feedDot[f.accent] ?? feedDot.blue}`} />
                  <div className="min-w-0">
                    <p className="text-xs leading-5 text-gray-700">
                      <b>{f.name}</b> {f.action}
                    </p>
                    <p className="text-[10px] text-gray-400">{f.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ===== Bento 第四行：周训练量 + 热力图 + 打卡日历 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="本周每日训练量" icon="📊">
          <WeeklyMinutesChart data={data.weeklyMinutesData} />
        </Card>
        <Card title="训练时段分布热力图" icon="🕐">
          <HeatmapChart data={data.heatmapData} />
        </Card>
        <Card title="每日打卡" icon="🔥" sub="完成保存即打卡">
          <div className="h-full flex items-center">
            <CheckinCalendar />
          </div>
        </Card>
      </div>

      {/* ===== 最新训练（全宽双列） ===== */}
      <Card title="最新训练记录" icon="📝" className=""
        sub={<Link href="/sessions" className="text-blue-500 font-normal hover:underline">查看全部 →</Link>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {data.recentSessions.slice(0, 7).map((s, i) => (
            <Link
              href="/sessions"
              key={s.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-blue-50/70 hover:translate-x-1 transition-all animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{data.leaderboardData.find((l) => l.id === s.studentId)?.avatar || '🧑'}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.studentName}</p>
                  <p className="text-xs text-gray-400">{s.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{Math.round(s.duration / 60)} 分钟</span>
                <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-yellow-600">
                  ⭐ {s.score}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
