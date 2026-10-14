'use client';

import Link from 'next/link';

/** 统一页头：标题 + 副标题 + 右侧操作区 */
export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** 页头快捷操作按钮 */
export function HeaderButton({
  href,
  onClick,
  icon,
  children,
  primary = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const cls = `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
    primary
      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200 hover:opacity-90'
      : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
  }`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        <span>{icon}</span>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      <span>{icon}</span>
      {children}
    </button>
  );
}
