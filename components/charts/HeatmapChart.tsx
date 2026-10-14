'use client';
import dynamic from 'next/dynamic';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });
interface Props { data: [number, number, number][]; }
const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export default function HeatmapChart({ data }: Props) {
  const option = {
    tooltip: { position: 'top', formatter: (params: any) => { const [hour, day, count] = params.data; return `${days[day]} ${hour}:00<br/>训练 ${count} 次`; } },
    grid: { left: 55, right: 30, top: 10, bottom: 55 },
    xAxis: { type: 'category', data: hours, splitArea: { show: true }, axisLabel: { color: '#999', interval: 2 } },
    yAxis: { type: 'category', data: days, splitArea: { show: true }, axisLabel: { color: '#666' } },
    visualMap: { min: 0, max: 40, calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: ['#ebedf0', '#c6e48b', '#7bc96f', '#49af50', '#196127'] },
      textStyle: { color: '#666', fontSize: 11 } },
    series: [{ type: 'heatmap', data, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' } } }],
  };
  return <ReactECharts option={option} style={{ height: 320 }} />;
}
