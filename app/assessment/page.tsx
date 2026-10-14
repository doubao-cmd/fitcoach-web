'use client';

import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';

// 中国成人 BMI 标准（WG/T 428-2013）
const BMI_BANDS = [
  { max: 18.5, label: '偏瘦', color: 'text-sky-600', bg: 'bg-sky-500', advice: '建议在力量训练基础上适当增加热量与蛋白质摄入，增重而非减脂' },
  { max: 24, label: '正常', color: 'text-emerald-600', bg: 'bg-emerald-500', advice: '体重范围健康，重点通过训练提升力量、心肺与体态' },
  { max: 28, label: '超重', color: 'text-amber-600', bg: 'bg-amber-500', advice: '建议以有氧+力量结合制造温和热量缺口，每周训练 4-5 次' },
  { max: 99, label: '肥胖', color: 'text-red-600', bg: 'bg-red-500', advice: '建议从低冲击训练（快走、深蹲、平板）开始，循序渐进并控制饮食' },
];

const ACTIVITY = [
  { id: 1.2, label: '久坐', desc: '几乎不运动' },
  { id: 1.375, label: '轻度活动', desc: '每周 1-3 次' },
  { id: 1.55, label: '中度活动', desc: '每周 3-5 次' },
  { id: 1.725, label: '高度活动', desc: '每周 6-7 次' },
];

export default function AssessmentPage() {
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(62);
  const [age, setAge] = useState(20);
  const [activity, setActivity] = useState(1.375);

  const result = useMemo(() => {
    const h = height / 100;
    const bmi = weight / (h * h);
    // Mifflin-St Jeor 基础代谢公式
    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
    const tdee = bmr * activity;
    return {
      bmi,
      band: BMI_BANDS.find((b) => bmi < b.max) ?? BMI_BANDS[BMI_BANDS.length - 1],
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      lose: Math.round(tdee - 400),
      keep: Math.round(tdee),
      gain: Math.round(tdee + 350),
      // 蛋白质建议（g/天）：1.6-2.0 g/kg
      protein: [Math.round(weight * 1.6), Math.round(weight * 2.0)],
      water: Math.round(weight * 35),
    };
  }, [sex, height, weight, age, activity]);

  const bmiPct = Math.min(100, Math.max(4, ((result.bmi - 15) / (32 - 15)) * 100));

  const numInput = (label: string, value: number, set: (n: number) => void, unit: string, min: number, max: number, step = 1) => (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="flex-1 accent-blue-600"
        />
        <div className="w-20 shrink-0 flex items-center bg-gray-50 rounded-lg px-2 py-1.5">
          <input
            type="number" min={min} max={max} step={step} value={value}
            onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
            className="w-full bg-transparent text-sm font-bold text-gray-800 outline-none text-right"
          />
          <span className="text-[10px] text-gray-400 ml-1">{unit}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader icon="📐" title="体能自测" subtitle="基于体育科学常用公式估算 BMI、基础代谢与每日能量需求（结果仅供参考，不替代医学建议）" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 输入 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-500">性别</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {([['male', '♂ 男生'], ['female', '♀ 女生']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setSex(id)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                    sex === id ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {numInput('身高', height, setHeight, 'cm', 140, 210)}
          {numInput('体重', weight, setWeight, 'kg', 35, 150)}
          {numInput('年龄', age, setAge, '岁', 14, 80)}
          <div>
            <label className="text-xs font-semibold text-gray-500">日常活动量</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ACTIVITY.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActivity(a.id)}
                  className={`px-3 py-2 rounded-xl text-left transition-all active:scale-95 ${
                    activity === a.id ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span className="block text-xs font-bold">{a.label}</span>
                  <span className={`block text-[10px] ${activity === a.id ? 'text-blue-100' : 'text-gray-400'}`}>{a.desc}（×{a.id}）</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 结果 */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-gray-400 font-semibold">BMI 体质指数</p>
                <p className={`text-4xl font-black tabular-nums ${result.band.color}`}>{result.bmi.toFixed(1)}</p>
              </div>
              <span className={`text-sm font-black px-3 py-1 rounded-full ${result.band.color} bg-gray-50`}>{result.band.label}</span>
            </div>
            {/* 分段条 */}
            <div className="relative mt-4 h-2.5 rounded-full overflow-hidden flex">
              <div className="bg-sky-400" style={{ width: '21%' }} />
              <div className="bg-emerald-400" style={{ width: '31%' }} />
              <div className="bg-amber-400" style={{ width: '23%' }} />
              <div className="bg-red-400 flex-1" />
            </div>
            <div className="relative h-4 mt-1">
              <div className="absolute -translate-x-1/2 transition-all" style={{ left: `${bmiPct}%` }}>
                <span className="block text-[9px] text-gray-400 -translate-x-1/2">▲</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 leading-5 mt-1">📋 {result.band.advice}</p>
            <div className="flex justify-between text-[9px] text-gray-400 mt-1">
              <span>15</span><span>18.5</span><span>24</span><span>28</span><span>32+</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white">
              <p className="text-[11px] text-indigo-100 font-semibold">基础代谢 BMR</p>
              <p className="text-3xl font-black tabular-nums mt-1">{result.bmr}</p>
              <p className="text-[10px] text-indigo-100 mt-0.5">千卡 / 天（静卧消耗）</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-5 text-white">
              <p className="text-[11px] text-orange-100 font-semibold">每日总消耗 TDEE</p>
              <p className="text-3xl font-black tabular-nums mt-1">{result.tdee}</p>
              <p className="text-[10px] text-orange-100 mt-0.5">千卡 / 天（含活动）</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-xs font-bold text-gray-700 mb-3">🎯 按目标设定每日摄入</p>
            <div className="space-y-2">
              {[
                { label: '减脂（-400 kcal）', val: result.lose, color: 'text-amber-600' },
                { label: '维持体重', val: result.keep, color: 'text-emerald-600' },
                { label: '增肌（+350 kcal）', val: result.gain, color: 'text-blue-600' },
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                  <span className="text-xs text-gray-600">{t.label}</span>
                  <span className={`text-sm font-black tabular-nums ${t.color}`}>{t.val} 千卡</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="bg-purple-50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-purple-400 font-semibold">建议蛋白质</p>
                <p className="text-sm font-black text-purple-600 tabular-nums">{result.protein[0]}-{result.protein[1]} g/天</p>
              </div>
              <div className="bg-cyan-50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-cyan-400 font-semibold">建议饮水量</p>
                <p className="text-sm font-black text-cyan-600 tabular-nums">{result.water} ml/天</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
