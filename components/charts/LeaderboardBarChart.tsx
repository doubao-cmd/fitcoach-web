'use client';
import dynamic from 'next/dynamic';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });
interface Props { data: { name: string; totalSessions: number }[]; }
export default function LeaderboardBarChart({ data }: Props) {
  const reversed = [...data].reverse();
  const option = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 60, right: 30, top: 10, bottom: 25 },
    xAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#999' } },
    yAxis: { type: 'category', data: reversed.map((d) => d.name), axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666' } },
    series: [{ type: 'bar', data: reversed.map((d) => d.totalSessions), itemStyle: { color: '#4A90E2', borderRadius: [0, 3, 3, 0] }, barWidth: 14 }],
  };
  return <ReactECharts option={option} style={{ height: 340 }} />;
}
