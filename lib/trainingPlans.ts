import type { PoseExerciseId } from '@/lib/pose/geometry';

/** 训练计划库：多日周期课程，串联 AI 识别动作与跟练课程 */
export interface PlanItem {
  id: PoseExerciseId;
  /** 每组目标（c3 平板为秒，其余为个） */
  goal: number;
  /** 组数 */
  sets: number;
}

export interface PlanDay {
  day: number;
  title: string;
  focus: string;
  items: PlanItem[];
  /** 休息日 */
  rest?: boolean;
  /** 对应 /pose 页的跟练课程 id（workouts.ts） */
  workoutId?: string;
  tip?: string;
}

export interface TrainingPlan {
  id: string;
  name: string;
  emoji: string;
  level: '入门' | '进阶' | '困难';
  cycle: string;
  daysPerWeek: number;
  minutes: string;
  desc: string;
  suitable: string;
  gradient: string;
  /** 日程按 7 天排布，多于一周的计划注明第二周循环加量 */
  loopNote?: string;
  days: PlanDay[];
}

export const TRAINING_PLANS: TrainingPlan[] = [
  {
    id: 'p1',
    name: '7 天宿舍入门',
    emoji: '🌱',
    level: '入门',
    cycle: '7 天 / 周循环',
    daysPerWeek: 5,
    minutes: '每天 15-25 分钟',
    desc: '从零开始建立训练习惯，动作简单、强度温和，宿舍一张瑜伽垫即可完成',
    suitable: '几乎不运动 / 刚开始健身的同学',
    gradient: 'from-emerald-400 to-teal-500',
    days: [
      { day: 1, title: '下肢基础', focus: '臀腿发力感', items: [{ id: 'c1', goal: 12, sets: 2 }, { id: 'c4', goal: 8, sets: 2 }], tip: '先徒手找臀部后坐的感觉' },
      { day: 2, title: '上肢与核心', focus: '推力入门', workoutId: 'w3', items: [{ id: 'c2', goal: 6, sets: 3 }, { id: 'c3', goal: 20, sets: 2 }] },
      { day: 3, title: '主动恢复', focus: '拉伸放松', rest: true, items: [], tip: '散步 15 分钟 + 大腿前侧/后侧、胸肩拉伸' },
      { day: 4, title: '心肺唤醒', focus: '燃脂有氧', workoutId: 'w1', items: [{ id: 'c5', goal: 20, sets: 3 }, { id: 'c8', goal: 30, sets: 2 }] },
      { day: 5, title: '下肢巩固', focus: '臀腿', items: [{ id: 'c1', goal: 15, sets: 3 }, { id: 'c4', goal: 10, sets: 2 }] },
      { day: 6, title: '核心稳定', focus: '平板支撑', items: [{ id: 'c2', goal: 8, sets: 2 }, { id: 'c3', goal: 30, sets: 3 }] },
      { day: 7, title: '完全休息', focus: '恢复', rest: true, items: [], tip: '保证睡眠，肌肉在休息时生长' },
    ],
  },
  {
    id: 'p2',
    name: '14 天燃脂塑形',
    emoji: '🔥',
    level: '进阶',
    cycle: '14 天（两周循环）',
    daysPerWeek: 6,
    minutes: '每天 25-40 分钟',
    desc: '力量与心肺交替的高频循环，第二周所有目标加量约 20%，主打减脂与线条',
    suitable: '有 1-2 个月训练基础、想减脂塑形的同学',
    gradient: 'from-orange-400 to-red-500',
    loopNote: '第 8-14 天重复本周日程，各组目标 ×1.2、组间休息缩短 10 秒',
    days: [
      { day: 1, title: '全身燃脂', focus: '综合有氧', workoutId: 'w1', items: [{ id: 'c1', goal: 15, sets: 1 }, { id: 'c4', goal: 12, sets: 1 }, { id: 'c8', goal: 40, sets: 1 }, { id: 'c5', goal: 30, sets: 1 }, { id: 'c3', goal: 30, sets: 1 }] },
      { day: 2, title: '下肢雕塑', focus: '臀腿', items: [{ id: 'c1', goal: 15, sets: 4 }, { id: 'c4', goal: 12, sets: 3 }] },
      { day: 3, title: '核心与推力', focus: '核心胸臂', items: [{ id: 'c3', goal: 30, sets: 3 }, { id: 'c2', goal: 8, sets: 2 }] },
      { day: 4, title: 'HIIT 高间歇', focus: '心肺爆发', items: [{ id: 'c8', goal: 40, sets: 4 }, { id: 'c5', goal: 30, sets: 3 }], tip: '动作 40 秒 / 休息 20 秒交替' },
      { day: 5, title: '主动恢复', focus: '拉伸+有氧', rest: true, items: [], tip: '慢跑或快走 20 分钟，认真拉伸' },
      { day: 6, title: '胸臂核心循环', focus: '推力+核心', workoutId: 'w3', items: [{ id: 'c2', goal: 10, sets: 3 }, { id: 'c3', goal: 40, sets: 3 }] },
      { day: 7, title: '下肢力量', focus: '臀腿力量', workoutId: 'w2', items: [{ id: 'c1', goal: 20, sets: 3 }, { id: 'c4', goal: 14, sets: 3 }] },
    ],
  },
  {
    id: 'p3',
    name: '力量强化周',
    emoji: '💪',
    level: '困难',
    cycle: '7 天 / 可循环进阶',
    daysPerWeek: 5,
    minutes: '每天 30-45 分钟',
    desc: '以多组多次的力量容量为主，配合核心与心肺辅助，追求动作质量与力量提升',
    suitable: '能标准完成 20 个深蹲、10 个俯卧撑的同学',
    gradient: 'from-indigo-500 to-purple-600',
    days: [
      { day: 1, title: '下肢力量', focus: '深蹲弓步超级组', workoutId: 'w2', items: [{ id: 'c1', goal: 20, sets: 4 }, { id: 'c4', goal: 16, sets: 3 }] },
      { day: 2, title: '推力与核心', focus: '俯卧撑容量', items: [{ id: 'c2', goal: 10, sets: 4 }, { id: 'c3', goal: 40, sets: 3 }] },
      { day: 3, title: '完全休息', focus: '恢复', rest: true, items: [], tip: '可做泡沫轴放松与充分拉伸' },
      { day: 4, title: '腿 + 心肺', focus: '混合代谢', items: [{ id: 'c1', goal: 20, sets: 3 }, { id: 'c4', goal: 16, sets: 3 }, { id: 'c8', goal: 30, sets: 2 }] },
      { day: 5, title: '核心耐力', focus: '平板+推力', items: [{ id: 'c3', goal: 45, sets: 4 }, { id: 'c2', goal: 12, sets: 3 }] },
      { day: 6, title: '全身燃脂收尾', focus: '综合', workoutId: 'w1', items: [{ id: 'c1', goal: 15, sets: 1 }, { id: 'c4', goal: 12, sets: 1 }, { id: 'c8', goal: 40, sets: 1 }, { id: 'c5', goal: 30, sets: 1 }, { id: 'c3', goal: 30, sets: 1 }] },
      { day: 7, title: '完全休息', focus: '恢复', rest: true, items: [], tip: '补充蛋白质与睡眠，准备下一轮' },
    ],
  },
];
