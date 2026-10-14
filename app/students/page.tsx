import Link from 'next/link';
import { getActiveData } from '@/lib/bridge';
import { studentExtra } from '@/lib/mock';
import Reveal from '@/components/Reveal';
import PageHeader from '@/components/PageHeader';

export default function StudentsPage() {
  const d = getActiveData();
  const activeCount = d.allStudents.filter((s) => s.status === 'active').length;
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="学员管理" icon="👥"
        subtitle={`共 ${d.allStudents.length} 名学员 · ${activeCount} 人活跃 · 点击行查看详情`}
        actions={<span className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-500">🏫 宿舍健身教学班</span>} />
      <Reveal>
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto card-hover">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-5 py-3 font-medium">学员</th>
                <th className="text-left px-5 py-3 font-medium">连续打卡</th>
                <th className="text-left px-5 py-3 font-medium">状态</th>
                <th className="text-left px-5 py-3 font-medium">加入时间</th>
                <th className="text-right px-5 py-3 font-medium">训练次数</th>
                <th className="text-right px-5 py-3 font-medium">总时长</th>
                <th className="text-right px-5 py-3 font-medium">平均评分</th>
                <th className="text-left px-5 py-3 font-medium">最近活跃</th>
              </tr>
            </thead>
            <tbody>
              {d.allStudents.map((s) => (
                <Link href={`/students/${s.id}`} key={s.id} className="contents">
                  <tr className="border-t border-gray-100 hover:bg-blue-50/60 transition-colors cursor-pointer group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl transition-transform duration-200 group-hover:scale-125">{s.avatar}</span>
                        <span className="font-medium text-gray-800">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {(studentExtra[s.id]?.streak ?? 0) > 0
                        ? <span className="text-xs font-bold text-orange-500">🔥 {studentExtra[s.id].streak} 天</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.status === 'active' ? '🟢 活跃' : '⚪ 流失'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{s.joinedAt}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-800">{s.totalSessions}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{Math.round(s.totalDuration / 60)} 分钟</td>
                    <td className="px-5 py-3 text-right"><span className="text-yellow-600 font-semibold">⭐ {s.avgScore}</span></td>
                    <td className="px-5 py-3 text-gray-500">{s.lastActiveAt}</td>
                  </tr>
                </Link>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
