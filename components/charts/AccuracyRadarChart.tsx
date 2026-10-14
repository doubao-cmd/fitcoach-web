'use client';
import dynamic from 'next/dynamic';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

/** 各动作平均标准度雷达图 */
export default function AccuracyRadarChart({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) {
    return <div className="h-[240px] flex items-center justify-center text-sm text-gray-400">暂无数据</div>;
  }
  const option = {
    tooltip: {},
    radar: {
      indicator: data.map((d) => ({ name: d.name, max: 100 })),
      radius: '66%',
      axisName: { color: '#64748b', fontSize: 12 },
      splitArea: { areaStyle: { color: ['rgba(47,109,240,0.03)', 'rgba(47,109,240,0.06)'] } },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: data.map((d) => d.value),
            name: '平均标准度',
            areaStyle: { color: 'rgba(47,109,240,0.22)' },
            lineStyle: { color: '#2f6df0', width: 2 },
            itemStyle: { color: '#2f6df0' },
          },
        ],
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 240 }} />;
}
