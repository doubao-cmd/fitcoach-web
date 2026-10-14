export default function Loading() {
  return (
    <div className="p-4 sm:p-6 space-y-5 animate-pulse">
      <div className="h-28 rounded-2xl bg-gradient-to-r from-slate-200 to-slate-100" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white shadow-sm" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 rounded-xl bg-white shadow-sm" />
        <div className="h-72 rounded-xl bg-white shadow-sm" />
      </div>
      <p className="text-center text-xs text-gray-400 pt-2">FitCoach 加载中…</p>
    </div>
  );
}
