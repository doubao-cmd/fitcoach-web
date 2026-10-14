'use client';

import type { PoseExerciseId } from '@/lib/pose/geometry';

/** 火柴人关键点（侧/正面简笔） */
interface Stick {
  head: [number, number];
  shoulder: [number, number];
  hip: [number, number];
  elbowL: [number, number]; wristL: [number, number];
  elbowR: [number, number]; wristR: [number, number];
  kneeL: [number, number]; ankleL: [number, number];
  kneeR: [number, number]; ankleR: [number, number];
  headR?: number;
}

function Figure({ p, color, ground = 82 }: { p: Stick; color: string; ground?: number }) {
  const line = { stroke: color, strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none' };
  const seg = (a: [number, number], b: [number, number]) => (
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...line} />
  );
  return (
    <svg viewBox="0 0 120 92" className="w-full h-auto">
      <line x1="4" y1={ground} x2="116" y2={ground} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 3" />
      {/* 手臂 */}
      {seg(p.shoulder, p.elbowL)}{seg(p.elbowL, p.wristL)}
      {seg(p.shoulder, p.elbowR)}{seg(p.elbowR, p.wristR)}
      {/* 躯干 */}
      {seg(p.shoulder, p.hip)}
      {/* 腿 */}
      {seg(p.hip, p.kneeL)}{seg(p.kneeL, p.ankleL)}
      {seg(p.hip, p.kneeR)}{seg(p.kneeR, p.ankleR)}
      {/* 头 */}
      <circle cx={p.head[0]} cy={p.head[1]} r={p.headR ?? 6} {...line} fill="#fff" />
    </svg>
  );
}

// ---- 各动作的准备位 / 到位位骨架 ----
const POSES: Record<PoseExerciseId, { start?: Stick; end: Stick; endLabel: string }> = {
  c1: {
    start: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      elbowL: [55, 36], wristL: [52, 48], elbowR: [65, 36], wristR: [68, 48],
      kneeL: [60, 64], ankleL: [60, 80], kneeR: [60, 64], ankleR: [60, 80],
    },
    end: {
      head: [68, 24], shoulder: [66, 34], hip: [52, 50],
      elbowL: [58, 40], wristL: [50, 42], elbowR: [72, 40], wristR: [64, 42],
      kneeL: [46, 66], ankleL: [50, 80], kneeR: [46, 66], ankleR: [50, 80],
    },
    endLabel: '大腿接近水平',
  },
  c2: {
    start: {
      head: [18, 28], shoulder: [28, 32], hip: [64, 34],
      elbowL: [28, 50], wristL: [28, 66], elbowR: [28, 50], wristR: [28, 66],
      kneeL: [84, 36], ankleL: [98, 38], kneeR: [84, 36], ankleR: [98, 38],
    },
    end: {
      head: [18, 40], shoulder: [30, 44], hip: [66, 44],
      elbowL: [38, 52], wristL: [36, 66], elbowR: [38, 52], wristR: [36, 66],
      kneeL: [86, 46], ankleR: [100, 48], kneeR: [86, 46], ankleL: [100, 48],
    },
    endLabel: '胸部接近地面',
  },
  c3: {
    end: {
      head: [18, 38], shoulder: [30, 40], hip: [66, 40],
      elbowL: [28, 58], wristL: [42, 64], elbowR: [28, 58], wristR: [42, 64],
      kneeL: [86, 42], ankleL: [100, 44], kneeR: [86, 42], ankleR: [100, 44],
    },
    endLabel: '肩-髋-踝一条直线',
  },
  c5: {
    start: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      elbowL: [56, 36], wristL: [54, 46], elbowR: [64, 36], wristR: [66, 46],
      kneeL: [60, 64], ankleL: [58, 80], kneeR: [60, 64], ankleR: [62, 80],
    },
    end: {
      head: [60, 14], shoulder: [60, 26], hip: [60, 48],
      elbowL: [50, 22], wristL: [40, 12], elbowR: [70, 22], wristR: [80, 12],
      kneeL: [52, 64], ankleL: [42, 80], kneeR: [68, 64], ankleR: [78, 80],
    },
    endLabel: '脚打开、手举过头顶',
  },
  c4: {
    start: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      elbowL: [55, 36], wristL: [53, 46], elbowR: [65, 36], wristR: [67, 46],
      kneeL: [60, 64], ankleL: [58, 80], kneeR: [60, 64], ankleR: [62, 80],
    },
    end: {
      head: [58, 14], shoulder: [58, 26], hip: [58, 46],
      // 双手叉腰
      elbowL: [50, 34], wristL: [54, 44], elbowR: [66, 34], wristR: [62, 44],
      // 前腿：大腿水平前伸、小腿竖直；后腿：屈膝下沉
      kneeL: [80, 46], ankleL: [80, 79], kneeR: [40, 58], ankleR: [34, 79],
    },
    endLabel: '前膝约90°、后膝下沉',
  },
  c8: {
    start: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      elbowL: [56, 36], wristL: [54, 46], elbowR: [64, 36], wristR: [66, 46],
      kneeL: [60, 64], ankleL: [58, 80], kneeR: [60, 64], ankleR: [62, 80],
    },
    end: {
      head: [60, 14], shoulder: [60, 26], hip: [60, 48],
      // 手臂前后摆动
      elbowL: [52, 30], wristL: [46, 18], elbowR: [68, 38], wristR: [72, 50],
      // 一腿屈膝抬到腰部，另一腿直立支撑
      kneeL: [42, 46], ankleL: [47, 65], kneeR: [63, 64], ankleR: [63, 80],
    },
    endLabel: '膝盖抬到腰部高度',
  },
  c9: {
    start: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      elbowL: [55, 36], wristL: [55, 48], elbowR: [65, 36], wristR: [65, 48],
      kneeL: [60, 64], ankleL: [58, 80], kneeR: [60, 64], ankleR: [62, 80],
    },
    end: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      // 屈肘把前臂举到肩前，大臂不动
      elbowL: [55, 36], wristL: [53, 24], elbowR: [65, 36], wristR: [67, 24],
      kneeL: [60, 64], ankleL: [58, 80], kneeR: [60, 64], ankleR: [62, 80],
    },
    endLabel: '屈肘举到肩前',
  },
  c10: {
    start: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      elbowL: [55, 36], wristL: [55, 48], elbowR: [65, 36], wristR: [65, 48],
      kneeL: [60, 64], ankleL: [58, 80], kneeR: [60, 64], ankleR: [62, 80],
    },
    end: {
      head: [60, 14], shoulder: [60, 24], hip: [60, 48],
      // 双臂向两侧抬到水平，手肘不弯
      elbowL: [43, 24], wristL: [29, 24], elbowR: [77, 24], wristR: [91, 24],
      kneeL: [60, 64], ankleL: [58, 80], kneeR: [60, 64], ankleR: [62, 80],
    },
    endLabel: '大臂与地面平行',
  },
};

const STEPS: Record<PoseExerciseId, string[]> = {
  c1: ['双脚与肩同宽、脚尖朝前', '臀部后坐下蹲，膝盖与脚尖同向', '大腿接近水平后蹬地站起'],
  c2: ['双手略宽于肩撑地，身体成直线', '收紧核心，屈肘下降至胸接近地面', '胸部发力推起至手臂伸直'],
  c3: ['前臂（或直臂）撑地，肘在肩下方', '收紧核心与臀部，肩-髋-踝成直线', '颈部自然延伸，保持均匀呼吸'],
  c5: ['双脚并拢、双手放体侧站立', '跳起双脚打开同时双手上举过头', '轻落地缓冲，跳回并拢姿势'],
  c4: ['站直，一腿向前迈一大步', '下蹲至前膝约 90°、后膝接近地面', '上身直立，前脚跟发力蹬回站立'],
  c8: ['身体直立、核心微收，原地站立', '左右交替把膝盖抬到腰部高度', '手臂自然前后摆动，前脚掌柔和落地'],
  c9: ['大臂贴紧身体两侧，不要前后晃动', '屈肘把重量举到肩前，顶峰收缩', '控制速度下放，手臂接近伸直但不锁死'],
  c10: ['双手持重量放于体侧，手臂伸直', '向两侧抬臂至大臂与地面平行', '缓慢放回，全程不要耸肩或弯肘借力'],
};

export default function PoseGuide({ exerciseId }: { exerciseId: PoseExerciseId }) {
  const pose = POSES[exerciseId];
  const steps = STEPS[exerciseId];
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 card-hover animate-fade-up" key={exerciseId}>
      <h2 className="text-sm font-bold text-gray-800 mb-3">🧍 动作示范</h2>
      <div className={`grid ${pose.start ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mb-3`}>
        {pose.start && (
          <div className="rounded-xl bg-slate-50 p-2">
            <Figure p={pose.start} color="#64748b" />
            <p className="text-center text-[10px] text-gray-400 font-semibold">准备位</p>
          </div>
        )}
        <div className="rounded-xl bg-emerald-50/60 p-2">
          <Figure p={pose.end} color="#059669" />
          <p className="text-center text-[10px] text-emerald-600 font-semibold">{pose.endLabel}</p>
        </div>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1.5 leading-4">
            <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
