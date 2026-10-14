'use client';

import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES, type KArticle } from '@/lib/knowledge';

export default function KnowledgePage() {
  const [cat, setCat] = useState('全部');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<KArticle | null>(null);

  const list = useMemo(() => KNOWLEDGE_ARTICLES.filter((a) =>
    (cat === '全部' || a.category === cat) &&
    (!q || a.title.includes(q) || a.summary.includes(q) || a.sections.some((s) => s.body.join('').includes(q))),
  ), [cat, q]);

  const catCount = (c: string) => c === '全部' ? KNOWLEDGE_ARTICLES.length : KNOWLEDGE_ARTICLES.filter((a) => a.category === c).length;

  return (
    <div className="space-y-5">
      <PageHeader icon="📚" title="健身知识中心" subtitle="体智融合：把体育科学常识和 AI 动作识别结合起来，练得科学、练得安全" />

      {/* 搜索 + 分类 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索知识点，如「深蹲」「蛋白质」「膝盖」…"
          className="w-full bg-gray-50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-blue-200"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {KNOWLEDGE_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                cat === c ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              {c} <span className={cat === c ? 'text-blue-100' : 'text-gray-400'}>{catCount(c)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 文章卡 */}
      {list.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400 text-sm">没有找到相关内容，换个关键词试试</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((a) => (
            <button
              key={a.id}
              onClick={() => setOpen(a)}
              className="text-left bg-white rounded-2xl shadow-sm p-5 card-hover flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl">{a.icon}</span>
                <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">{a.category}</span>
              </div>
              <h3 className="text-sm font-bold text-gray-800 leading-6">{a.title}</h3>
              <p className="text-[11px] text-gray-400 leading-5 mt-1.5 flex-1">{a.summary}</p>
              <p className="text-[10px] text-gray-300 mt-3">阅读约 {a.readMin} 分钟 · 点击查看 →</p>
            </button>
          ))}
        </div>
      )}

      {/* 详情弹层 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4" onClick={() => setOpen(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={open.title}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aurora px-6 py-6 text-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <span className="text-3xl relative z-10">{open.icon}</span>
                <div className="relative z-10">
                  <p className="text-[10px] font-bold text-blue-100">{open.category} · 约 {open.readMin} 分钟</p>
                  <h2 className="text-base font-black leading-6">{open.title}</h2>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {open.sections.map((s, i) => (
                <div key={i}>
                  <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-blue-500 to-indigo-500" />
                    {s.h}
                  </h3>
                  <ul className="space-y-1.5">
                    {s.body.map((b, j) => (
                      <li key={j} className="text-[12px] text-gray-600 leading-6 flex gap-2">
                        <span className="text-blue-400 shrink-0">•</span>{b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button
                onClick={() => setOpen(null)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 transition-opacity"
              >
                知道了，去训练
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
