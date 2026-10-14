import type { PoseExerciseId } from '@/lib/pose/geometry';

/** 跟练课程：动作阶段（goal：c3 平板为秒，其余为个数）+ 组间休息 */
export interface WorkoutStage {
  exerciseId: PoseExerciseId;
  goal: number;
  /** 完成本阶段后休息秒数（最后一阶段可不填） */
  restAfter?: number;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  emoji: string;
  level: '入门' | '进阶' | '困难';
  estMinutes: number;
  desc: string;
  stages: WorkoutStage[];
}

export const WORKOUT_PLANS: WorkoutPlan[] = [
  {
    id: 'w1',
    name: '宿舍全身燃脂',
    emoji: '🔥',
    level: '入门',
    estMinutes: 8,
    desc: '下肢+心肺+核心，零器械一套到位',
    stages: [
      { exerciseId: 'c1', goal: 15, restAfter: 30 },
      { exerciseId: 'c4', goal: 12, restAfter: 30 },
      { exerciseId: 'c8', goal: 40, restAfter: 25 },
      { exerciseId: 'c5', goal: 30, restAfter: 30 },
      { exerciseId: 'c3', goal: 30 },
    ],
  },
  {
    id: 'w2',
    name: '下肢力量强化',
    emoji: '🦵',
    level: '进阶',
    estMinutes: 10,
    desc: '深蹲弓步超级组，榨干腿部力量',
    stages: [
      { exerciseId: 'c1', goal: 20, restAfter: 40 },
      { exerciseId: 'c4', goal: 16, restAfter: 40 },
      { exerciseId: 'c1', goal: 15, restAfter: 40 },
      { exerciseId: 'c4', goal: 12, restAfter: 45 },
      { exerciseId: 'c3', goal: 45 },
    ],
  },
  {
    id: 'w3',
    name: '胸臂核心循环',
    emoji: '💪',
    level: '困难',
    estMinutes: 9,
    desc: '俯卧撑与平板交替，推力与核心双杀',
    stages: [
      { exerciseId: 'c2', goal: 8, restAfter: 30 },
      { exerciseId: 'c3', goal: 30, restAfter: 30 },
      { exerciseId: 'c2', goal: 10, restAfter: 30 },
      { exerciseId: 'c3', goal: 40, restAfter: 30 },
      { exerciseId: 'c2', goal: 12, restAfter: 40 },
      { exerciseId: 'c3', goal: 45 },
    ],
  },
];
