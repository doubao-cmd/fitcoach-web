import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dot-grid p-6">
      <div className="bg-white rounded-3xl shadow-sm p-10 max-w-md w-full text-center animate-fade-up">
        <p className="text-6xl mb-4">🤔</p>
        <h1 className="text-2xl font-black text-gray-800">404</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">这个页面不存在，可能链接已失效或地址输入有误。</p>
        <Link href="/"
          className="inline-block px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 transition-opacity">
          🏠 返回数据大屏
        </Link>
      </div>
    </div>
  );
}
