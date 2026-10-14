'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f0f2f5' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 40, maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>😵‍💫</div>
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>应用出现严重错误</h1>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>请刷新页面重试。</p>
            <button onClick={reset}
              style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              🔄 重试
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
