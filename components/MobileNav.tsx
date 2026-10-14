'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: '数据大屏', icon: '📊' },
  { href: '/pose', label: 'AI 识别', icon: '🤖' },
  { href: '/courses', label: '动作库', icon: '🏋️' },
  { href: '/sessions', label: '训练记录', icon: '📝' },
  { href: '/students', label: '学员', icon: '👥' },
  { href: '/leaderboard', label: '排行榜', icon: '🏆' },
  { href: '/report', label: '周报', icon: '📄' },
];

/** 小屏顶部导航（md 以下显示，替代侧边栏） */
export default function MobileNav() {
  const pathname = usePathname();
  return (
    <header className="md:hidden sticky top-0 z-40 bg-slate-900 text-white">
      <div className="px-4 pt-3 pb-1 text-sm font-bold flex items-center gap-2">
        <span>🏋️</span>
        <span className="gradient-text-light">FitCoach</span>
      </div>
      <nav className="flex gap-1 px-2 pb-2 overflow-x-auto">
        {navItems.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors ${
                active ? 'bg-blue-600 font-semibold' : 'text-slate-300 bg-slate-800'
              }`}
            >
              {item.icon} {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
