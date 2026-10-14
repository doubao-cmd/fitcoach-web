/**
 * 数据桥接层 —— 手机端 → Web 端 的数据转换
 *
 * 手机端导出 JSON 格式见 FitCoach/src/utils/storage.js 的 exportAllAsJson()
 * Web 端页面用 getActiveData() 读取，自动切换 mock 或手机真实数据
 */
import {
  statCards as mockStatCards,
  trendData as mockTrendData,
  weeklyMinutesData as mockWeeklyMinutesData,
  exerciseDistributionData as mockExerciseDistributionData,
  leaderboardData as mockLeaderboardData,
  allStudents as mockAllStudents,
  heatmapData as mockHeatmapData,
  courses as mockCourses,
  recentSessions as mockRecentSessions,
  statTrends as mockStatTrends,
  statSparks as mockStatSparks,
  accuracyRadar as mockAccuracyRadar,
  streakBoard as mockStreakBoard,
  weeklyGoals as mockWeeklyGoals,
  activityFeed as mockActivityFeed,
  techStatus as mockTechStatus,
} from './mock';

const STORAGE_KEY = 'fitcoach_web_import';

// ============ 类型 ============
interface MobileSession {
  id: string;
  courseId: string;
  courseName: string;
  emoji: string;
  duration: number;
  reps: number;
  /** 计量方式：默认按次数，平板支撑为保持秒数 */
  metric?: 'reps' | 'seconds';
  avgAccuracy: number;
  aiScore: number;
  date: string;
  history?: number[];
}

interface MobileExport {
  __type: 'fitcoach-mobile-export';
  __version: number;
  exportAt: string;
  sessions: MobileSession[];
}

// ============ 从 localStorage 读 / 写 ============
export function loadImportedData(): MobileExport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveImportedData(data: MobileExport) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearImportedData() {
  localStorage.removeItem(STORAGE_KEY);
}

// ============ 解析手机端 JSON ============
export function parseMobileJson(text: string): MobileExport {
  const parsed = JSON.parse(text);
  if (parsed.__type !== 'fitcoach-mobile-export') {
    throw new Error('文件格式不对，需要手机端导出的 fitcoach-data-*.json');
  }
  return parsed as MobileExport;
}

// ============ 转换为 Web 端各模块需要的数据格式 ============
export function convertToWebData(mobile: MobileExport) {
  const sessions = mobile.sessions || [];

  // 统计卡片
  const totalMinutes = Math.round(sessions.reduce((s, x) => s + x.duration, 0) / 60);
  const avgAccuracy = sessions.length > 0
    ? +(sessions.reduce((s, x) => s + x.avgAccuracy, 0) / sessions.length).toFixed(1)
    : 0;

  const statCards = {
    totalStudents: 1, // 单人 demo
    activeToday: sessions.length,
    totalSessions: sessions.length,
    totalMinutes,
    avgAccuracy,
    completionRate: 100,
  };

  // 最近 7 天训练量
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekly = new Array(7).fill(null).map((_, i) => ({ day: dayNames[i], minutes: 0, sessions: 0 }));
  sessions.forEach((s) => {
    // 解析手机端 date 格式："2026/10/12 23:20:15" 或 "2026-10-12 23:20:15"
    const d = new Date(s.date.replace(/\//g, '-'));
    if (isNaN(d.getTime())) return;
    const idx = d.getDay();
    weekly[idx].minutes += Math.round(s.duration / 60);
    weekly[idx].sessions += 1;
  });

  // 动作分布
  const distMap: Record<string, { name: string; value: number; emoji: string }> = {};
  sessions.forEach((s) => {
    if (!distMap[s.courseName]) {
      distMap[s.courseName] = { name: s.courseName, value: 0, emoji: s.emoji };
    }
    distMap[s.courseName].value += 1;
  });
  const colors = ['#4A90E2', '#FF6B6B', '#52C41A', '#FAAD14', '#9254DE', '#F759AB'];
  const exerciseDistributionData = Object.values(distMap).map((item, i) => ({
    name: item.name,
    value: item.value,
    color: colors[i % colors.length],
  }));

  // 排行榜（单人 demo，只有一个学员）
  const totalDuration = sessions.reduce((s, x) => s + x.duration, 0);
  const avgScore = sessions.length > 0
    ? +(sessions.reduce((s, x) => s + x.aiScore, 0) / sessions.length).toFixed(1)
    : 0;
  const leaderboardData = [
    {
      id: 'me',
      name: '我（手机端学员）',
      avatar: '🧑',
      totalSessions: sessions.length,
      totalDuration,
      avgScore,
      joinedAt: sessions.length > 0 ? sessions[sessions.length - 1].date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      lastActiveAt: sessions.length > 0 ? sessions[0].date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: 'active' as const,
    },
  ];
  const allStudents = leaderboardData;

  // 最近训练列表（Web 端的 TrainingSession 格式）
  const recentSessions = sessions.slice(0, 10).map((s) => ({
    id: s.id,
    studentId: 'me',
    studentName: '我（手机端学员）',
    date: s.date,
    duration: s.duration,
    score: s.aiScore,
    exercises: [
      {
        type: s.courseId,
        emoji: s.emoji,
        count: s.reps,
        unit: (s.metric === 'seconds' ? 'seconds' : 'reps') as 'reps' | 'seconds',
        avgAccuracy: s.avgAccuracy,
        history: s.history,
        issues: s.aiScore < 3.5 ? ['动作准确度偏低，建议放慢速度'] : [],
      },
    ],
  }));

  // 趋势数据（最近 30 天，从手机 session 生成）
  const trendData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dayStr = `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
    const matches = sessions.filter((s) => s.date.includes(`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`) ||
                                         s.date.includes(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`));
    const minutes = Math.round(matches.reduce((s, x) => s + x.duration, 0) / 60);
    return { date: dayStr, minutes, sessions: matches.length };
  });

  // 热力图（简化：全部堆在手机 session 的时段）
  const heatmapData: [number, number, number][] = [];
  sessions.forEach((s) => {
    const m = s.date.match(/(\d{1,2}):/);
    if (!m) return;
    const hour = parseInt(m[1], 10);
    const dow = new Date(s.date.replace(/\//g, '-')).getDay();
    heatmapData.push([hour, dow, Math.max(5, s.reps)]);
  });
  // 如果没有数据，给一些零值
  if (heatmapData.length === 0) {
    heatmapData.push([19, new Date().getDay(), 10]);
  }

  // 各动作平均标准度（雷达图）：从真实 session 聚合，缺失动作不造数据
  const radarMap: Record<string, { sum: number; n: number }> = {};
  sessions.forEach((s) => {
    const key = s.courseName.replace(/^标准/, '');
    (radarMap[key] ||= { sum: 0, n: 0 });
    radarMap[key].sum += s.avgAccuracy;
    radarMap[key].n += 1;
  });
  const accuracyRadar = Object.entries(radarMap).map(([name, v]) => ({
    name, value: Math.round(v.sum / v.n),
  }));

  // 动态流：由真实记录生成
  const activityFeed = sessions.slice(0, 6).map((s, i) => ({
    id: s.id,
    name: '我',
    avatar: '🧑',
    action: `完成${s.courseName.replace(/^标准/, '')} ${s.reps}${s.metric === 'seconds' ? ' 秒' : ' 个'} · 标准度 ${s.avgAccuracy}%`,
    accent: (['green', 'blue', 'purple', 'orange'] as const)[i % 4],
    time: i === 0 ? '刚刚' : `${i + 1} 条记录前`,
  }));

  // 本周目标（真实本周数据 vs 固定目标）
  const weekMinutes = weekly.reduce((a, w) => a + w.minutes, 0);
  const weekReps = sessions.reduce((a, s) => a + (s.metric === 'seconds' ? 0 : s.reps), 0);
  const weeklyGoals = {
    minutes: { done: weekMinutes, goal: 150 },
    reps: { done: weekReps, goal: 200 },
    calories: mockWeeklyGoals.calories,
  };

  return {
    statCards,
    statTrends: {} as Record<string, { text: string; up: boolean }>,
    statSparks: {} as Record<string, number[]>,
    trendData,
    weeklyMinutesData: weekly,
    exerciseDistributionData,
    leaderboardData,
    allStudents,
    heatmapData,
    recentSessions,
    courses: mockCourses, // 动作库保持不变
    accuracyRadar,
    streakBoard: [{ name: '我（手机端学员）', avatar: '🧑', streak: 1 }, ...mockStreakBoard.slice(0, 4)],
    weeklyGoals,
    activityFeed: activityFeed.length >= 3 ? activityFeed : [...activityFeed, ...mockActivityFeed].slice(0, 8),
    techStatus: mockTechStatus,
    isImported: true as const,
  };
}

// ============ 统一入口 —— 有导入数据用导入的，没有用 mock ============
export function getActiveData() {
  const imported = loadImportedData();
  if (imported) {
    try {
      return convertToWebData(imported);
    } catch {
      // 转换失败回退到 mock
    }
  }
  return {
    statCards: mockStatCards,
    statTrends: mockStatTrends,
    statSparks: mockStatSparks,
    trendData: mockTrendData,
    weeklyMinutesData: mockWeeklyMinutesData,
    exerciseDistributionData: mockExerciseDistributionData,
    leaderboardData: mockLeaderboardData,
    allStudents: mockAllStudents,
    heatmapData: mockHeatmapData,
    courses: mockCourses,
    recentSessions: mockRecentSessions,
    accuracyRadar: mockAccuracyRadar,
    streakBoard: mockStreakBoard,
    weeklyGoals: mockWeeklyGoals,
    activityFeed: mockActivityFeed,
    techStatus: mockTechStatus,
    isImported: false as const,
  };
}

// ============ 供 UI 调用 ============
export function useMobileImport() {
  const imported = loadImportedData();
  return {
    hasImport: !!imported,
    importAt: imported?.exportAt,
    count: imported?.sessions?.length ?? 0,
  };
}

// ============ 学员详情辅助函数（替换 mock.ts 里的同名函数） ============
export function getStudentById(id: string) {
  return getActiveData().allStudents.find((s) => s.id === id);
}

// 确定性伪随机（同 id 每次一致）
function seeded(studentId: string) {
  const seed = Array.from(studentId).reduce((a, c) => a + c.charCodeAt(0), 7);
  return (i: number, salt = 0) => {
    const x = Math.sin(seed * 13.7 + i * 7.31 + salt * 3.17) * 43758.5453;
    return x - Math.floor(x);
  };
}

// 学员练习动作池（确定性）
const STUDENT_EX_POOL = [
  { type: 'squat', emoji: '🏋️', name: '深蹲' },
  { type: 'pushup', emoji: '💪', name: '俯卧撑' },
  { type: 'plank', emoji: '🧘', name: '平板支撑', unit: 'seconds' as const },
  { type: 'jumping_jack', emoji: '🤸', name: '开合跳' },
];

export function getStudentSessions(studentId: string) {
  const data = getActiveData();
  const real = data.recentSessions.filter((s) => s.studentId === studentId);
  const stu = data.allStudents.find((s) => s.id === studentId);
  // 真实记录足够（≥3 条）直接用；否则按学员水平确定性补足演示历史
  if (real.length >= 3 || !stu) return real;
  const rand = seeded(studentId);
  const baseAcc = Math.round(stu.avgScore * 20); // 评分→标准度基线
  const want = Math.max(3, Math.min(7, Math.round(stu.totalSessions / 4)));
  const made = Array.from({ length: want }, (_, i) => {
    const ex = STUDENT_EX_POOL[Math.floor(rand(i, 1) * STUDENT_EX_POOL.length)];
    const count = ex.unit === 'seconds' ? 20 + Math.floor(rand(i, 2) * 40) : 8 + Math.floor(rand(i, 2) * 24);
    const acc = Math.max(62, Math.min(99, baseAcc + Math.round((rand(i, 3) - 0.4) * 12)));
    const d = new Date();
    d.setDate(d.getDate() - (i * 2 + Math.floor(rand(i, 4) * 2)));
    d.setHours(17 + Math.floor(rand(i, 5) * 4), Math.floor(rand(i, 6) * 60), 0, 0);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const history = Array.from({ length: Math.min(count, 14) }, (_, k) =>
      Math.max(60, Math.min(100, acc + Math.round((rand(k, 7 + i) - 0.5) * 14))));
    return {
      id: `${studentId}-gen-${i}`,
      studentId,
      studentName: stu.name,
      date,
      duration: 420 + Math.floor(rand(i, 8) * 1200),
      score: Number((acc / 20).toFixed(1)),
      exercises: [{ type: ex.type, emoji: ex.emoji, count, unit: ex.unit, avgAccuracy: acc, history, issues: acc < 80 ? ['动作准确度偏低，建议放慢速度'] : [] }],
    };
  });
  return [...real, ...made];
}

// 学员徽章（11 枚，确定性解锁）
export interface BadgeInfo { emoji: string; name: string; desc: string; unlocked: boolean }
export function getStudentBadges(studentId: string): BadgeInfo[] {
  const rand = seeded(studentId);
  const stu = getStudentById(studentId);
  const sessions = getStudentSessions(studentId);
  const maxReps = Math.max(0, ...sessions.flatMap((s) => s.exercises.map((e) => e.count)));
  const bestAcc = Math.max(0, ...sessions.flatMap((s) => s.exercises.map((e) => e.avgAccuracy)));
  const defs: Omit<BadgeInfo, 'unlocked'>[] = [
    { emoji: '🎬', name: '初次训练', desc: '完成第一次训练' },
    { emoji: '🔥', name: '连续 7 天', desc: '连续打卡 7 天' },
    { emoji: '💯', name: '百日坚持', desc: '累计训练 100 次' },
    { emoji: '🏋️', name: '深蹲达人', desc: '深蹲累计 300 个' },
    { emoji: '💪', name: '俯卧撑高手', desc: '单次俯卧撑 20 个' },
    { emoji: '🧘', name: '平板 60 秒', desc: '平板支撑单次 60 秒' },
    { emoji: '🤸', name: '开合跳王', desc: '开合跳单次 50 个' },
    { emoji: '⭐', name: '完美动作', desc: '单次标准度 95%+' },
    { emoji: '🌅', name: '晨练者', desc: '早上 8 点前训练' },
    { emoji: '🦉', name: '夜猫子', desc: '晚上 10 点后训练' },
    { emoji: '🏆', name: '周冠军', desc: '登顶周排行榜' },
  ];
  const unlocked = [
    sessions.length > 0,
    (stu?.totalSessions ?? 0) >= 10 || rand(0, 9) > 0.5,
    (stu?.totalSessions ?? 0) >= 100,
    (stu?.totalSessions ?? 0) >= 12,
    maxReps >= 20,
    maxReps >= 60,
    maxReps >= 50,
    bestAcc >= 95,
    rand(1, 9) > 0.55,
    rand(2, 9) > 0.4,
    (stu?.totalSessions ?? 0) >= 25 && rand(3, 9) > 0.4,
  ];
  return defs.map((b, i) => ({ ...b, unlocked: unlocked[i] }));
}

// 学员个人训练热力图（近 7 天 × 时段，确定性）
export function getStudentHeatmap(studentId: string): [number, number, number][] {
  const rand = seeded(studentId);
  const out: [number, number, number][] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (const hour of [7, 8, 12, 18, 19, 20, 21]) {
      const v = rand(dow * 10 + hour, 11);
      if (v > 0.35) out.push([hour, dow, Math.round(v * 40)]);
    }
  }
  return out;
}

// 学员动作偏好（训练记录聚合）
export function getStudentExerciseDist(studentId: string) {
  const sessions = getStudentSessions(studentId);
  const map = new Map<string, { value: number; emoji: string }>();
  sessions.forEach((s) => s.exercises.forEach((e) => {
    const name = STUDENT_EX_POOL.find((x) => x.type === e.type)?.name ?? e.type;
    const cur = map.get(name) ?? { value: 0, emoji: e.emoji };
    cur.value += 1;
    map.set(name, cur);
  }));
  const colors = ['#4A90E2', '#FF6B6B', '#52C41A', '#FAAD14'];
  return Array.from(map.entries()).map(([name, v], i) => ({ name, ...v, color: colors[i % colors.length] }));
}

export function getStudentTrend(studentId: string) {
  // 确定性伪随机：同一学员每次刷新数据一致（不能用 Math.random，否则演示时曲线乱跳）
  const rand = seeded(studentId);
  return Array.from({ length: 14 }, (_, i) => ({
    day: `${i + 1}`,
    // 从约 3.4 缓慢爬升到接近 5 的进步曲线
    score: Number(Math.min(5, 3.4 + i * 0.09 + rand(i) * 0.5).toFixed(2)),
    sessions: rand(i + 100) > 0.45 ? 1 : 0,
  }));
}
