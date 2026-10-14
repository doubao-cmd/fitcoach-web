import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import ScrollProgress from '@/components/ScrollProgress';

export const metadata: Metadata = {
  title: 'FitCoach 教练管理后台',
  description: 'AI+体感的宿舍健身私教系统 - 数据管理平台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-gray-100 dot-grid">
          <MobileNav />
          <ScrollProgress />
          {children}
        </main>
      </body>
    </html>
  );
}
