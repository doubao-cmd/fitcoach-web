import type { Metadata, Viewport } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import ScrollProgress from '@/components/ScrollProgress';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  metadataBase: new URL('https://fitcoach-web-liart.vercel.app'),
  title: {
    default: 'FitCoach 教练管理后台 | AI+体感的宿舍健身私教',
    template: '%s · FitCoach',
  },
  description: '基于 MediaPipe 端侧姿态识别的 AI 健身私教系统：深蹲/俯卧撑/平板支撑/开合跳实时计数、姿态纠错与评分，配套数据大屏、训练记录与排行榜。',
  applicationName: 'FitCoach',
  keywords: ['MediaPipe', '姿态识别', 'AI 健身', 'BlazePose', 'Next.js', '宿舍健身', '动作计数'],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FitCoach',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: 'FitCoach',
    title: 'FitCoach · AI+体感的宿舍健身私教系统',
    description: '纯端侧 33 关键点姿态识别，实时动作计数、语音纠错与评分 — 数据大屏 + AI 识别 + 训练周报',
  },
  twitter: { card: 'summary_large_image', title: 'FitCoach · AI 健身私教系统', description: 'MediaPipe 端侧姿态识别 · 实时计数与姿态纠错' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d4ed8',
  viewportFit: 'cover',
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
        <RegisterSW />
      </body>
    </html>
  );
}
