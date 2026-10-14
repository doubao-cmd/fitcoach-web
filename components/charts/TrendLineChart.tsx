'use client';
import dynamic from 'next/dynamic';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });
interface Props { data: { date: string; minutes: number; sessions: number }[]; }
export default function TrendLineChart({ data }: Props) {
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['训练时长', '训练次数'], top: 0, right: 10, textStyle: { color: '#666' } },
    grid: { left: 45, right: 45, top: 35, bottom: 25 },
    xAxis: { type: 'category', boundaryGap: false, data: data.map((d) => d.date), axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#999', interval: 3 } },
    yAxis: [
      { type: 'value', name: '分钟', position: 'left', axisLine: { show: false }, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#999' } },
      { type: 'value', name: '次数', position: 'right', axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: '#999' } },
    ],
    series: [
      { name: '训练时长', type: 'line', smooth: true, data: data.map((d) => d.minutes),
        lineStyle: { color: '#4A90E2', width: 2 }, itemStyle: { color: '#4A90E2' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(74,144,226,0.35)' }, { offset: 1, color: 'rgba(74,144,226,0.02)' }] } } },
      { name: '训练次数', type: 'line', yAxisIndex: 1, smooth: true, data: data.map((d) => d.sessions), lineStyle: { color: '#FF6B6B', width: 2 }, itemStyle: { color: '#FF6B6B' } },
    ],
  };
  return <ReactECharts option={option} style={{ height: 260 }} />;
}
