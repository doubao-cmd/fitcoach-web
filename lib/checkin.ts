/**
 * 每日打卡（浏览器本地持久化）
 * key 格式 YYYY-MM-DD → 当天训练汇总；手机端数据与 Web 训练保存共用此记录。
 */

export interface CheckinDay {
  sessions: number; // 保存训练次数（组）
  reps: number;     // 计次动作总个数
  seconds: number;  // 平板支撑总秒数
  minutes: number;  // 训练总分钟
}

type CheckinMap = Record<string, CheckinDay>;

const KEY = 'fitcoach_checkin_v1';

export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(): CheckinMap {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as CheckinMap;
  } catch {
    return {};
  }
}

function save(map: CheckinMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* 存储不可用时静默忽略（隐私模式等） */
  }
}

/** 记录一次完成的训练（点「完成并保存」时调用） */
export function recordWorkout(w: { reps?: number; seconds?: number; minutes?: number }): CheckinDay {
  const map = load();
  const k = dateKey();
  const cur: CheckinDay = map[k] ?? { sessions: 0, reps: 0, seconds: 0, minutes: 0 };
  cur.sessions += 1;
  cur.reps += w.reps ?? 0;
  cur.seconds += w.seconds ?? 0;
  cur.minutes += w.minutes ?? 0;
  map[k] = cur;
  save(map);
  return cur;
}

export function getDay(key: string): CheckinDay | undefined {
  return load()[key];
}

/** 连续打卡天数（今天还没练则从昨天往回数，不断 streak 显示） */
export function getStreak(map: CheckinMap = load()): number {
  let streak = 0;
  const cursor = new Date();
  if (!map[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1); // 今天未打卡不打断
  while (map[dateKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface CalendarCell {
  key: string;
  day: number;
  inMonth: boolean;
  data?: CheckinDay;
  /** 0 无 1~3 强度（按当天组数） */
  level: 0 | 1 | 2 | 3;
}

/** 生成最近 n 周（含本周）的打卡日历，周一开头 */
export function getCalendar(weeks = 5, map: CheckinMap = load()): CalendarCell[] {
  const today = new Date();
  const end = new Date(today);
  // 回到本周一
  end.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weeks * 7 - 1);
  const start = new Date(end);
  start.setDate(end.getDate() - (weeks * 7 - 1));
  const cells: CalendarCell[] = [];
  const month = today.getMonth();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dateKey(d);
    const data = map[k];
    cells.push({
      key: k,
      day: d.getDate(),
      inMonth: d.getMonth() === month || new Date(start).getMonth() === month,
      data,
      level: data ? (data.sessions >= 3 ? 3 : data.sessions === 2 ? 2 : 1) : 0,
    });
  }
  return cells;
}

/** 最近 7 天打卡标记（周一到今天） */
export function getWeekDots(map: CheckinMap = load()): boolean[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return !!map[dateKey(d)];
  });
}
