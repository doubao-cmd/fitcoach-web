/**
 * Mock 数据 —— 后续接 Supabase/API 时直接替换
 */

export interface Student {
  id: string;
  name: string;
  avatar: string;
  totalSessions: number;
  totalDuration: number; // 秒
  avgScore: number;
  joinedAt: string;
  lastActiveAt: string;
  status: 'active' | 'inactive';
  /** 连续打卡天数 */
  streak?: number;
  /** 较上周排行榜名次变化（正=上升） */
  rankDelta?: number;
}

export interface Course {
  id: string;
  name: string;
  emoji: string;
  difficulty: '入门' | '进阶' | '困难';
  duration: number; // 秒
  calories: number;
  points: string[]; // 要点
  targetMuscles: string[];
  icon: string;
}

export interface TrainingSession {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  duration: number;
  score: number;
  exercises: ExerciseDetail[];
}

export interface ExerciseDetail {
  type: string;
  emoji: string;
  count: number;
  /** 计量单位：默认次数，平板支撑为保持秒数 */
  unit?: 'reps' | 'seconds';
  avgAccuracy: number;
  /** 逐次标准度（训练记录页画迷你折线用） */
  history?: number[];
  issues: string[]; // AI 识别的问题
}

// ============ 统计卡片 ============
export const statCards = {
  totalStudents: 156,
  activeToday: 23,
  totalSessions: 2348,
  totalMinutes: 68520,
  avgAccuracy: 87.3,
  completionRate: 92.1, // 完成率
};

// KPI 环比（较上周）
export const statTrends: Record<string, { text: string; up: boolean }> = {
  totalStudents: { text: '较上周 +6 人', up: true },
  activeToday: { text: '较昨日 +4 人', up: true },
  totalSessions: { text: '较上周 +8.2%', up: true },
  totalMinutes: { text: '较上周 +5.6%', up: true },
  avgAccuracy: { text: '较上周 +1.2%', up: true },
  completionRate: { text: '较上周 -0.4%', up: false },
};

// KPI 卡角标迷你趋势（最近 8 个点）
export const statSparks: Record<string, number[]> = {
  totalStudents: [132, 138, 141, 145, 148, 151, 154, 156],
  activeToday: [12, 15, 11, 18, 16, 20, 19, 23],
  totalSessions: [1980, 2050, 2110, 2160, 2210, 2260, 2300, 2348],
  totalMinutes: [58200, 60100, 61800, 63500, 65000, 66400, 67500, 68520],
  avgAccuracy: [84.1, 84.8, 85.2, 85.9, 86.1, 86.6, 87.0, 87.3],
  completionRate: [93.2, 92.8, 93.5, 92.6, 92.9, 92.4, 92.5, 92.1],
};

// ============ 趋势数据（最近 30 天） ============
export const trendData = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const base = 40 + Math.sin(i / 5) * 20;
  return {
    date: `10-${String(day).padStart(2, '0')}`,
    minutes: Math.round(base + Math.random() * 30),
    sessions: Math.round(base / 10 + Math.random() * 5),
  };
});

// ============ 本周每日训练量 ============
export const weeklyMinutesData = [
  { day: '周一', minutes: 45, sessions: 12 },
  { day: '周二', minutes: 30, sessions: 8 },
  { day: '周三', minutes: 60, sessions: 15 },
  { day: '周四', minutes: 0, sessions: 0 },
  { day: '周五', minutes: 50, sessions: 14 },
  { day: '周六', minutes: 75, sessions: 20 },
  { day: '周日', minutes: 40, sessions: 11 },
];

// ============ 动作分布 ============
export const exerciseDistributionData = [
  { name: '深蹲', value: 156, color: '#4A90E2' },
  { name: '俯卧撑', value: 98, color: '#FF6B6B' },
  { name: '平板支撑', value: 67, color: '#52C41A' },
];

// ============ 排行榜 Top 10 ============
export const leaderboardData: Student[] = [
  { id: 's1', name: '张伟', avatar: '🧑', totalSessions: 28, totalDuration: 8400, avgScore: 4.6, joinedAt: '2026-09-01', lastActiveAt: '2026-10-12', status: 'active' },
  { id: 's2', name: '李娜', avatar: '👩', totalSessions: 25, totalDuration: 7200, avgScore: 4.4, joinedAt: '2026-09-05', lastActiveAt: '2026-10-12', status: 'active' },
  { id: 's3', name: '王强', avatar: '🧔', totalSessions: 22, totalDuration: 6600, avgScore: 4.3, joinedAt: '2026-09-03', lastActiveAt: '2026-10-11', status: 'active' },
  { id: 's4', name: '赵敏', avatar: '👩‍🦰', totalSessions: 20, totalDuration: 5400, avgScore: 4.1, joinedAt: '2026-09-10', lastActiveAt: '2026-10-12', status: 'active' },
  { id: 's5', name: '刘洋', avatar: '👨', totalSessions: 18, totalDuration: 4800, avgScore: 4.0, joinedAt: '2026-09-08', lastActiveAt: '2026-10-10', status: 'active' },
  { id: 's6', name: '陈静', avatar: '👩‍🦱', totalSessions: 16, totalDuration: 4200, avgScore: 3.9, joinedAt: '2026-09-12', lastActiveAt: '2026-10-11', status: 'active' },
  { id: 's7', name: '杨帆', avatar: '🧑‍🎓', totalSessions: 15, totalDuration: 3900, avgScore: 3.8, joinedAt: '2026-09-15', lastActiveAt: '2026-10-08', status: 'inactive' },
  { id: 's8', name: '黄磊', avatar: '👨‍🦱', totalSessions: 14, totalDuration: 3600, avgScore: 3.7, joinedAt: '2026-09-18', lastActiveAt: '2026-10-12', status: 'active' },
  { id: 's9', name: '周婷', avatar: '👩‍🎓', totalSessions: 12, totalDuration: 3000, avgScore: 3.6, joinedAt: '2026-09-20', lastActiveAt: '2026-10-09', status: 'inactive' },
  { id: 's10', name: '吴磊', avatar: '🧑‍💼', totalSessions: 10, totalDuration: 2400, avgScore: 3.5, joinedAt: '2026-09-22', lastActiveAt: '2026-10-06', status: 'inactive' },
];

// ============ 全部学员（含未上榜的） ============
export const allStudents: Student[] = [
  ...leaderboardData,
  { id: 's11', name: '郑凯', avatar: '👨‍🍳', totalSessions: 8, totalDuration: 1800, avgScore: 3.3, joinedAt: '2026-09-25', lastActiveAt: '2026-10-12', status: 'active' },
  { id: 's12', name: '孙丽', avatar: '👩‍🔬', totalSessions: 7, totalDuration: 1680, avgScore: 3.2, joinedAt: '2026-09-28', lastActiveAt: '2026-10-11', status: 'active' },
  { id: 's13', name: '马超', avatar: '🧑‍🎤', totalSessions: 5, totalDuration: 1200, avgScore: 3.0, joinedAt: '2026-10-01', lastActiveAt: '2026-10-10', status: 'active' },
  { id: 's14', name: '朱琳', avatar: '👩‍🚀', totalSessions: 4, totalDuration: 900, avgScore: 2.9, joinedAt: '2026-10-05', lastActiveAt: '2026-10-12', status: 'active' },
  { id: 's15', name: '胡军', avatar: '🧔‍♂️', totalSessions: 3, totalDuration: 600, avgScore: 2.7, joinedAt: '2026-10-08', lastActiveAt: '2026-10-11', status: 'active' },
];

// ============ 时段热力图 ============
export const heatmapData: [number, number, number][] = [
  [6, 0, 12], [7, 0, 25], [8, 0, 18], [12, 0, 8], [18, 0, 22], [19, 0, 30], [20, 0, 28],
  [6, 1, 10], [7, 1, 20], [12, 1, 6], [18, 1, 18], [19, 1, 26], [20, 1, 24],
  [6, 2, 15], [7, 2, 28], [18, 2, 25], [19, 2, 32], [20, 2, 30],
  [7, 3, 18], [12, 3, 5], [18, 3, 15], [19, 3, 22], [20, 3, 20],
  [6, 4, 14], [7, 4, 22], [18, 4, 28], [19, 4, 35], [20, 4, 32], [21, 4, 20],
  [8, 5, 18], [9, 5, 15], [10, 5, 20], [15, 5, 12], [16, 5, 18], [17, 5, 22], [18, 5, 30], [19, 5, 38], [20, 5, 35],
  [8, 6, 16], [9, 6, 14], [10, 6, 18], [15, 6, 10], [16, 6, 15], [17, 6, 20], [18, 6, 28], [19, 6, 32], [20, 6, 30],
];

// ============ 动作库 ============
export const courses: Course[] = [
  { id: 'c1', name: '标准深蹲', emoji: '🏋️', difficulty: '入门', duration: 300, calories: 80, targetMuscles: ['股四头肌', '臀部', '核心'], points: ['双脚与肩同宽', '膝盖不超过脚尖', '下蹲至大腿平行地面', '保持背部挺直'], icon: '🏋️' },
  { id: 'c2', name: '俯卧撑', emoji: '💪', difficulty: '进阶', duration: 240, calories: 60, targetMuscles: ['胸肌', '三头肌', '肩膀'], points: ['身体呈直线', '下降至胸部接近地面', '推起时手臂完全伸直', '不要塌腰或撅臀'], icon: '💪' },
  { id: 'c3', name: '平板支撑', emoji: '🧘', difficulty: '进阶', duration: 180, calories: 45, targetMuscles: ['核心', '肩膀', '下背部'], points: ['身体从头到脚呈直线', '收紧核心和臀部', '不要下沉臀部', '呼吸均匀'], icon: '🧘' },
  { id: 'c4', name: '弓步蹲', emoji: '🦵', difficulty: '进阶', duration: 240, calories: 70, targetMuscles: ['股四头肌', '腘绳肌', '臀部'], points: ['前后脚距离适中', '前膝垂直地面', '后膝接近地面', '上身保持直立'], icon: '🦵' },
  { id: 'c5', name: '开合跳', emoji: '🤸', difficulty: '入门', duration: 120, calories: 50, targetMuscles: ['全身', '心肺'], points: ['起跳时手臂上举', '落地时屈膝缓冲', '保持节奏稳定', '呼吸协调'], icon: '🤸' },
  { id: 'c6', name: '波比跳', emoji: '🔥', difficulty: '困难', duration: 180, calories: 90, targetMuscles: ['全身', '心肺', '爆发力'], points: ['从站立到俯卧撑到跳跃', '每个动作衔接流畅', '保持核心收紧', '初学者可简化'], icon: '🔥' },
  { id: 'c7', name: '仰卧起坐', emoji: '🛏️', difficulty: '入门', duration: 180, calories: 55, targetMuscles: ['腹肌', '髂腰肌'], points: ['双手交叉胸前或耳边', '用腹部力量起身', '下背部不离地面', '不要用脖子发力'], icon: '🛏️' },
  { id: 'c8', name: '高抬腿', emoji: '🏃', difficulty: '入门', duration: 120, calories: 40, targetMuscles: ['股四头肌', '髋部', '心肺'], points: ['膝盖抬至腰部高度', '手臂自然摆动', '保持快速节奏', '身体微微前倾'], icon: '🏃' },
];

// ============ 训练记录（最新 30 条） ============
export const recentSessions: TrainingSession[] = [
  {
    id: 't1', studentId: 's1', studentName: '张伟', date: '2026-10-12 20:30', duration: 1800, score: 4.6,
    exercises: [
      { type: 'squat', emoji: '🏋️', count: 30, avgAccuracy: 92, issues: ['最后 5 次蹲深不够'], history: [88, 90, 92, 94, 95, 96, 93, 95, 92, 90, 89, 91, 93, 95, 96, 94, 92, 90, 89, 91, 93, 94, 92, 90, 88, 87, 89, 91, 92, 90] },
      { type: 'pushup', emoji: '💪', count: 20, avgAccuracy: 88, issues: [], history: [85, 87, 89, 90, 91, 90, 89, 88, 87, 89, 90, 88, 87, 86, 88, 89, 87, 86, 85, 88] },
      { type: 'plank', emoji: '🧘', count: 3, avgAccuracy: 95, issues: [], unit: 'seconds' },
    ],
  },
  {
    id: 't2', studentId: 's2', studentName: '李娜', date: '2026-10-12 19:15', duration: 1500, score: 4.4,
    exercises: [
      { type: 'squat', emoji: '🏋️', count: 25, avgAccuracy: 90, issues: ['膝盖有内扣倾向'], history: [92, 91, 90, 89, 88, 90, 91, 89, 88, 90, 92, 91, 90, 89, 91, 90, 89, 88, 90, 91, 92, 90, 89, 91, 90] },
      { type: 'pushup', emoji: '💪', count: 15, avgAccuracy: 85, issues: ['手臂展开角度略窄'], history: [84, 86, 85, 87, 86, 85, 84, 86, 85, 87, 86, 85, 84, 86, 85] },
    ],
  },
  {
    id: 't3', studentId: 's3', studentName: '王强', date: '2026-10-12 18:00', duration: 2100, score: 4.3,
    exercises: [
      { type: 'squat', emoji: '🏋️', count: 35, avgAccuracy: 88, issues: [] },
      { type: 'plank', emoji: '🧘', count: 4, avgAccuracy: 90, issues: ['第 3 组臀部略下沉'] },
      { type: 'burpee', emoji: '🔥', count: 12, avgAccuracy: 82, issues: ['起身速度偏慢'] },
    ],
  },
  {
    id: 't4', studentId: 's11', studentName: '郑凯', date: '2026-10-12 17:20', duration: 900, score: 3.5,
    exercises: [
      { type: 'squat', emoji: '🏋️', count: 15, avgAccuracy: 75, issues: ['蹲深不够', '背部略微弯曲'] },
      { type: 'jumping_jack', emoji: '🤸', count: 30, avgAccuracy: 92, issues: [] },
    ],
  },
  {
    id: 't5', studentId: 's4', studentName: '赵敏', date: '2026-10-12 16:45', duration: 1200, score: 4.1,
    exercises: [
      { type: 'pushup', emoji: '💪', count: 18, avgAccuracy: 90, issues: [] },
      { type: 'squat', emoji: '🏋️', count: 22, avgAccuracy: 87, issues: ['下蹲速度不均匀'] },
    ],
  },
  {
    id: 't6', studentId: 's14', studentName: '朱琳', date: '2026-10-12 15:30', duration: 600, score: 3.2,
    exercises: [
      { type: 'squat', emoji: '🏋️', count: 12, avgAccuracy: 72, issues: ['膝盖明显内扣', '背部弯曲'] },
    ],
  },
  {
    id: 't7', studentId: 's5', studentName: '刘洋', date: '2026-10-11 21:00', duration: 1600, score: 4.0,
    exercises: [
      { type: 'squat', emoji: '🏋️', count: 28, avgAccuracy: 86, issues: [] },
      { type: 'plank', emoji: '🧘', count: 3, avgAccuracy: 91, issues: [] },
    ],
  },
];

// ============ 学员个人历史（某个学员的进步数据） ============
export function getStudentById(id: string): Student | undefined {
  return allStudents.find((s) => s.id === id);
}

export function getStudentSessions(studentId: string): TrainingSession[] {
  return recentSessions.filter((s) => s.studentId === studentId);
}

// 某个学员过去 14 天的训练趋势
export function getStudentTrend(studentId: string) {
  // 用固定种子生成稳定数据
  const base = leaderboardData.find((s) => s.id === studentId)?.totalSessions ?? 10;
  return Array.from({ length: 14 }, (_, i) => ({
    day: `${i + 1}`,
    score: 3 + Math.sin(i / 3) * 1 + (base / 10),
    sessions: Math.random() > 0.6 ? 1 : 0,
  }));
}

// ============ 各动作平均标准度（雷达图） ============
export const accuracyRadar = [
  { name: '深蹲', value: 89 },
  { name: '俯卧撑', value: 85 },
  { name: '平板支撑', value: 91 },
  { name: '开合跳', value: 93 },
];

// ============ 连续打卡榜 ============
export const streakBoard = [
  { name: '赵敏', avatar: '👩‍🦰', streak: 21 },
  { name: '张伟', avatar: '🧑', streak: 16 },
  { name: '黄磊', avatar: '👨‍🦱', streak: 12 },
  { name: '李娜', avatar: '👩', streak: 9 },
  { name: '王强', avatar: '🧔', streak: 7 },
];

// 学员附加数据：连续打卡、排行榜较上周名次变化（正=上升）
export const studentExtra: Record<string, { streak: number; rankDelta: number }> = {
  s1: { streak: 16, rankDelta: 1 }, s2: { streak: 9, rankDelta: 0 }, s3: { streak: 7, rankDelta: 2 },
  s4: { streak: 21, rankDelta: -1 }, s5: { streak: 5, rankDelta: 1 }, s6: { streak: 4, rankDelta: 0 },
  s7: { streak: 0, rankDelta: -2 }, s8: { streak: 12, rankDelta: 3 }, s9: { streak: 2, rankDelta: 0 },
  s10: { streak: 0, rankDelta: -1 }, s11: { streak: 3, rankDelta: 1 }, s12: { streak: 6, rankDelta: 0 },
  s13: { streak: 1, rankDelta: 0 }, s14: { streak: 2, rankDelta: 1 }, s15: { streak: 0, rankDelta: 0 },
  me: { streak: 1, rankDelta: 0 },
};

// ============ 本周目标完成度（分钟 / 次数 / 千卡） ============
export const weeklyGoals = {
  minutes: { done: 300, goal: 360 },
  reps: { done: 1820, goal: 2000 },
  calories: { done: 1240, goal: 1500 },
};

// ============ 实时动态流 ============
export interface FeedItem {
  id: string;
  name: string;
  avatar: string;
  action: string;
  accent: 'blue' | 'green' | 'orange' | 'purple';
  time: string;
}
export const activityFeed: FeedItem[] = [
  { id: 'f1', name: '赵敏', avatar: '👩‍🦰', action: '完成深蹲 20 个 · 标准度 96%', accent: 'green', time: '刚刚' },
  { id: 'f2', name: '张伟', avatar: '🧑', action: '完成平板支撑 45 秒 · 标准度 92%', accent: 'purple', time: '3 分钟前' },
  { id: 'f3', name: '李娜', avatar: '👩', action: '俯卧撑组间休息结束，开始第 3 组', accent: 'blue', time: '8 分钟前' },
  { id: 'f4', name: '郑凯', avatar: '👨‍🍳', action: '深蹲被提示「蹲深不足」2 次', accent: 'orange', time: '15 分钟前' },
  { id: 'f5', name: '王强', avatar: '🧔', action: '打破个人纪录：开合跳 60 个', accent: 'green', time: '26 分钟前' },
  { id: 'f6', name: '陈静', avatar: '👩‍🦱', action: '完成今日训练目标，连续打卡 5 天 🔥', accent: 'blue', time: '42 分钟前' },
  { id: 'f7', name: '周婷', avatar: '👩‍🎓', action: '完成开合跳 40 个 · 标准度 88%', accent: 'purple', time: '1 小时前' },
  { id: 'f8', name: '吴磊', avatar: '🧑‍💼', action: '开始 7 天入门计划第 3 天', accent: 'blue', time: '1 小时前' },
];

// ============ 系统技术状态（首页技术展示卡） ============
export const techStatus = [
  { icon: '🔒', label: '纯端侧推理', desc: '视频不出本机' },
  { icon: '🦴', label: '33 关键点', desc: 'BlazePose 实时跟踪' },
  { icon: '🎚️', label: '三档模型', desc: '流畅 / 均衡 / 精准' },
  { icon: '〰️', label: 'One Euro 滤波', desc: '关键点时序去抖' },
  { icon: '🧠', label: '状态机防抖', desc: '滞回 + 时间窗确认' },
  { icon: '🗣️', label: '语音纠错', desc: '实时双渠道反馈' },
];
