'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dot-grid p-6">
      <div className="bg-white rounded-3xl shadow-sm p-10 max-w-md w-full text-center animate-fade-up">
        <p className="text-6xl mb-4">😵‍💫</p>
        <h1 className="text-xl font-black text-gray-800">页面出了点问题</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">刷新一下通常就能恢复，你的训练数据保存在本地，不会丢失。</p>
        <div className="flex gap-2 justify-center">
          <button onClick={reset}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 transition-opacity">
            🔄 重试
          </button>
        </div>
      </div>
    </div>
  );
}
