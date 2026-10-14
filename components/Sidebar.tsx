'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: '数据大屏', icon: '📊' },
  { href: '/pose', label: 'AI 识别', icon: '🤖' },
  { href: '/plans', label: '训练计划', icon: '🗓️' },
  { href: '/courses', label: '动作库', icon: '🏋️' },
  { href: '/knowledge', label: '健身知识', icon: '📚' },
  { href: '/assessment', label: '体能自测', icon: '📐' },
  { href: '/sessions', label: '训练记录', icon: '📝' },
  { href: '/students', label: '学员管理', icon: '👥' },
  { href: '/leaderboard', label: '排行榜', icon: '🏆' },
  { href: '/report', label: '训练周报', icon: '📄' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-56 bg-slate-900 text-white flex-col shrink-0 relative">
      {/* 侧边栏顶部氛围光 */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-blue-600/25 to-transparent pointer-events-none" />
      <div className="p-5 border-b border-slate-700/70 relative">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span className="text-xl">🏋️</span>
          <span className="gradient-text-light">FitCoach</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">AI 体感健身 · 教练管理后台</p>
      </div>
      <nav className="flex-1 py-3 relative" aria-label="主导航">
        {navItems.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`nav-link flex items-center gap-3 px-5 py-2.5 text-sm ${
                active
                  ? 'active bg-gradient-to-r from-blue-600/90 to-indigo-600/80 font-semibold text-white shadow-lg shadow-blue-900/40'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:translate-x-1'
              } transition-all duration-200`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-700/70">
        <div className="rounded-lg bg-slate-800/70 px-3 py-2.5">
          <p className="text-xs text-slate-400">v0.3.0 · 大创项目</p>
          <p className="text-[10px] text-slate-500 mt-0.5">AI + 体感的宿舍健身私教</p>
        </div>
      </div>
    </aside>
  );
}
