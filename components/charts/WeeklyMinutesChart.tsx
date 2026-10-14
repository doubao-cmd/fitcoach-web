'use client';
import dynamic from 'next/dynamic';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });
interface Props { data: { day: string; minutes: number; sessions: number }[]; }
export default function WeeklyMinutesChart({ data }: Props) {
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['训练时长(分钟)', '训练次数'], top: 0, right: 10, textStyle: { color: '#666' } },
    grid: { left: 45, right: 45, top: 35, bottom: 25 },
    xAxis: { type: 'category', data: data.map((d) => d.day), axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#666' } },
    yAxis: [
      { type: 'value', name: '分钟', position: 'left', axisLine: { show: false }, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#999' } },
      { type: 'value', name: '次数', position: 'right', axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: '#999' } },
    ],
    series: [
      { name: '训练时长(分钟)', type: 'bar', data: data.map((d) => d.minutes), itemStyle: { color: '#4A90E2', borderRadius: [4, 4, 0, 0] }, barWidth: '45%' },
      { name: '训练次数', type: 'line', yAxisIndex: 1, data: data.map((d) => d.sessions), itemStyle: { color: '#FF6B6B' }, smooth: true, symbol: 'circle', symbolSize: 6 },
    ],
  };
  return <ReactECharts option={option} style={{ height: 280 }} />;
}
