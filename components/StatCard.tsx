'use client';

import Link from 'next/link';
import CountUp from './CountUp';
import Sparkline from './Sparkline';

interface Props {
  title: string;
  value: number | string;
  unit?: string;
  icon: string;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  delay?: number;
  decimals?: number;
  /** 角标迷你趋势 */
  spark?: number[];
  /** 点击跳转 */
  href?: string;
}

export default function StatCard({ title, value, unit, icon, trend, trendUp = true, color = 'bg-blue-50', delay = 0, decimals = 0, spark, href }: Props) {
  const inner = (
    <div
      className={`card-hover animate-fade-up bg-white rounded-xl shadow-sm p-5 flex items-center justify-between group relative overflow-hidden ${href ? 'cursor-pointer' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* 顶部渐变光带，hover 时显现 */}
      <span className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="min-w-0">
        <p className="text-sm text-gray-500 mb-1.5">{title}</p>
        <p className="text-2xl font-bold text-gray-800">
          {typeof value === 'number' ? (
            <CountUp end={value} decimals={decimals} />
          ) : (
            value
          )}
          {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
        </p>
        {trend && (
          <p className={`text-xs mt-1.5 flex items-center gap-1 ${trendUp ? 'text-green-500' : 'text-red-500'}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${trendUp ? 'bg-green-500' : 'bg-red-500'}`} />
            {trend}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center text-xl group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300`}>
          {icon}
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} />}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
