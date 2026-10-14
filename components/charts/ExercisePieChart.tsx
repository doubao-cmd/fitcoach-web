'use client';
import dynamic from 'next/dynamic';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });
interface Props { data: { name: string; value: number; color?: string }[]; }
export default function ExercisePieChart({ data }: Props) {
  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} 次 ({d}%)' },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#666' } },
    color: data.map((d) => d.color).filter(Boolean) as string[],
    series: [{
      name: '动作分布', type: 'pie', radius: ['40%', '68%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{d}%', fontSize: 12 }, data,
    }],
  };
  return <ReactECharts option={option} style={{ height: 280 }} />;
}
