'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getActiveData } from '@/lib/bridge';
import type { Course } from '@/lib/mock';
import Reveal from '@/components/Reveal';
import PageHeader from '@/components/PageHeader';

const difficultyColors: Record<string, string> = { 入门: 'bg-green-100 text-green-700', 进阶: 'bg-yellow-100 text-yellow-700', 困难: 'bg-red-100 text-red-700' };

// 每个动作一张渐变封面色，避免页面单调
const coverGradients = [
  'from-blue-100 to-indigo-100',
  'from-emerald-100 to-teal-100',
  'from-orange-100 to-amber-100',
  'from-purple-100 to-fuchsia-100',
  'from-rose-100 to-pink-100',
  'from-cyan-100 to-sky-100',
];

// AI 识别支持的动作 id（与 pose 页 POSE_EXERCISES 对应）
const AI_SUPPORTED = ['c1', 'c2', 'c3', 'c5', 'c4', 'c8', 'c9', 'c10'];

// 常见错误与呼吸节奏（详情弹层用）
const COURSE_TIPS: Record<string, { mistakes: string[]; breath: string }> = {
  c1: { mistakes: ['膝盖内扣、与脚尖方向不一致', '下蹲时弯腰驼背、重心前倾', '膝盖过度超过脚尖', '下蹲幅度不足，大腿未到水平'], breath: '下蹲吸气，站起呼气' },
  c2: { mistakes: ['塌腰或撅臀，核心未收紧', '手肘外展过大伤肩', '下放幅度不足', '推起时手臂没完全伸直'], breath: '下降吸气，推起呼气' },
  c3: { mistakes: ['塌腰下沉，腰椎受压', '撅臀抬髋，身体未成直线', '耸肩、头部过度仰起', '憋气导致疲劳加快'], breath: '保持均匀深呼吸，不要憋气' },
  c5: { mistakes: ['双脚开合幅度太小', '双手没有举过头顶', '落地时膝盖伸直不缓冲', '节奏忽快忽慢'], breath: '配合跳跃自然呼吸' },
  c4: { mistakes: ['步幅太小，前膝压力过大', '前膝超过脚尖或内扣', '上身前倾、含胸', '后膝没有充分下沉'], breath: '下蹲吸气，蹬起呼气' },
  c8: { mistakes: ['膝盖抬不到腰部高度', '弯腰驼背、身体后仰借力', '落地太重、脚掌砸地', '左右节奏不均匀'], breath: '保持均匀快速呼吸，不要憋气' },
  c9: { mistakes: ['大臂离开身体、肘部前后晃动', '借身体摆动甩起重量', '下放时没有控制、直接坠臂', '弯举不到位，前臂未到垂直以上'], breath: '举起呼气，下放吸气' },
  c10: { mistakes: ['抬臂时耸肩、斜方肌代偿', '肘关节弯曲借力', '抬得过高超过肩部', '躯干侧倾、腰部反弓借力'], breath: '上抬呼气，还原吸气' },
};
const DEFAULT_TIPS = { mistakes: ['保持核心稳定', '动作全程有控制', '出现疼痛立即停止'], breath: '发力时呼气，还原时吸气' };

export default function CoursesPage() {
  const d = getActiveData();
  const [filter, setFilter] = useState<string>('全部');
  const [muscle, setMuscle] = useState<string>('全部');
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<Course | null>(null);

  const muscles = useMemo(() => ['全部', ...Array.from(new Set(d.courses.flatMap((c) => c.targetMuscles)))], [d.courses]);

  const filtered = d.courses.filter((c) =>
    (filter === '全部' || c.difficulty === filter) &&
    (muscle === '全部' || c.targetMuscles.includes(muscle)) &&
    (!keyword || c.name.includes(keyword.trim())),
  );

  const muscleCount = muscles.length - 1;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="动作库" icon="🏋️"
        subtitle={`${d.courses.length} 个标准动作 · 覆盖 ${muscleCount} 个肌群 · AI 识别支持的动作可一键开练`}
        actions={
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="🔍 搜索动作"
            className="px-3.5 py-2 rounded-lg text-xs bg-white border border-gray-200 focus:border-blue-400 focus:outline-none w-44"
          />
        } />

      {/* 统计条 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '标准动作', value: d.courses.length, unit: '个', icon: '📚', bg: 'bg-blue-50', color: 'text-blue-600' },
          { label: '覆盖肌群', value: muscleCount, unit: '个', icon: '💪', bg: 'bg-rose-50', color: 'text-rose-600' },
          { label: 'AI 可识别', value: AI_SUPPORTED.filter((id) => d.courses.some((c) => c.id === id)).length, unit: '个', icon: '🤖', bg: 'bg-emerald-50', color: 'text-emerald-600' },
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

      {/* 筛选 */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap">
          {['全部', '入门', '进阶', '困难'].map((lv) => (
            <button
              key={lv}
              onClick={() => setFilter(lv)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 active:scale-95 ${
                filter === lv
                  ? 'bg-primary text-white shadow-md shadow-blue-200'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 hover:-translate-y-0.5'
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {muscles.map((m) => (
            <button key={m} onClick={() => setMuscle(m)}
              className={`px-2.5 py-1 text-[11px] rounded-full transition-all ${muscle === m ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-teal-300'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((c, i) => {
          const supported = AI_SUPPORTED.includes(c.id);
          return (
            <Reveal key={c.id} delay={(i % 3) * 80} className="h-full">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden card-hover h-full flex flex-col">
                <div className={`zoom-wrap h-36 bg-gradient-to-br ${coverGradients[d.courses.findIndex((x) => x.id === c.id) % coverGradients.length]} flex items-center justify-center relative`}>
                  <span className="zoom-emoji text-7xl inline-block">{c.emoji}</span>
                  {supported && (
                    <span className="absolute top-2.5 left-2.5 text-[10px] font-bold bg-white/85 text-blue-600 px-2 py-0.5 rounded-full">🤖 AI 可识别</span>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-gray-800">{c.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${difficultyColors[c.difficulty]}`}>{c.difficulty}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 mb-3">
                    <span>⏱️ {Math.round(c.duration / 60)} 分钟</span>
                    <span>🔥 {c.calories} kcal</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">AI 识别要点：</p>
                  <ul className="space-y-1 mb-3">
                    {c.points.slice(0, 3).map((p, j) => (
                      <li key={j} className="text-xs text-gray-500 flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">•</span><span>{p}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {c.targetMuscles.map((m) => (
                        <span key={m} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{m}</span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDetail(c)}
                        className="flex-1 text-xs font-semibold py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                        📖 动作详情
                      </button>
                      {supported ? (
                        <Link href={`/pose?exercise=${c.id}`}
                          className="flex-1 text-center text-xs font-bold py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 transition-opacity">
                          🤖 开始训练
                        </Link>
                      ) : (
                        <span className="flex-1 text-center text-xs py-2 rounded-lg bg-gray-50 text-gray-300 cursor-not-allowed">
                          敬请期待
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-3">🔍</p>
          <p className="text-sm">没有找到匹配的动作</p>
        </div>
      )}

      {/* ===== 动作详情弹层 ===== */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4" onClick={() => setDetail(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${detail.name}动作详情`}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-up max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`bg-gradient-to-br ${coverGradients[d.courses.findIndex((x) => x.id === detail.id) % coverGradients.length]} px-6 py-8 text-center relative`}>
              <button onClick={() => setDetail(null)} aria-label="关闭动作详情" className="absolute top-3 right-4 w-9 h-9 text-2xl text-gray-500 hover:text-gray-800">×</button>
              <span className="text-6xl">{detail.emoji}</span>
              <h2 className="text-xl font-black text-gray-800 mt-2">{detail.name}</h2>
              <div className="flex items-center justify-center gap-3 mt-2 text-xs text-gray-600">
                <span className={`px-2 py-0.5 rounded-full ${difficultyColors[detail.difficulty]}`}>{detail.difficulty}</span>
                <span>⏱️ {Math.round(detail.duration / 60)} 分钟</span>
                <span>🔥 {detail.calories} kcal</span>
              </div>
            </div>
            <div className="p-6 overflow-auto space-y-5">
              <section>
                <h3 className="text-sm font-bold text-gray-800 mb-2">✅ 标准动作要点</h3>
                <ul className="space-y-1.5">
                  {detail.points.map((p, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-2 leading-5">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>{p}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="text-sm font-bold text-gray-800 mb-2">⚠️ 常见错误</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(COURSE_TIPS[detail.id]?.mistakes ?? DEFAULT_TIPS.mistakes).map((m) => (
                    <span key={m} className="text-xs bg-red-50 text-red-600 px-2.5 py-1 rounded-full">{m}</span>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-sm font-bold text-gray-800 mb-2">🫁 呼吸节奏</h3>
                <p className="text-xs text-gray-600 bg-teal-50 text-teal-700 rounded-lg px-3 py-2">{COURSE_TIPS[detail.id]?.breath ?? DEFAULT_TIPS.breath}</p>
              </section>
              <section>
                <h3 className="text-sm font-bold text-gray-800 mb-2">💪 目标肌群</h3>
                <div className="flex flex-wrap gap-1.5">
                  {detail.targetMuscles.map((m) => (
                    <span key={m} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{m}</span>
                  ))}
                </div>
              </section>
              {AI_SUPPORTED.includes(detail.id) && (
                <Link href={`/pose?exercise=${detail.id}`}
                  className="block text-center w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 transition-opacity">
                  🤖 用 AI 实时指导开始训练
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
