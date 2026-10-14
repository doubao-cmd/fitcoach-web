/**
 * RepCounter 防抖回归测试（无第三方依赖，node pose-regression.mts 直接运行）
 *
 * 用正向运动学合成 33 关键点：按目标膝角/肘角/脚踝开合/身体倾角生成二维骨架，
 * 再经与页面一致的归一化映射送入状态机。20fps（每帧 50ms）模拟真实节奏。
 */
import { RepCounter, PlankDetector } from './lib/pose/geometry.ts';
import type { PlankSegment } from './lib/pose/geometry.ts';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// ---------- 合成骨架 ----------
const G = 0.12;   // 双髋间距
const T = 0.30;   // 躯干长
const L = 0.21;   // 大腿=小腿长
const UA = 0.13;  // 上臂
const FA = 0.13;  // 前臂
const DT = 50;    // 20fps

interface PoseOpts { tilt?: number; knee?: number; kneeR?: number; elbow?: number; extra?: number; arms?: 'up' | 'down' | 'ground' | 'curl' | 'raise'; hipDrop?: number; march?: { side: -1 | 1; raise: number }; curl?: number; curlR?: number; abduction?: number; abductionR?: number }
export type Frame = PoseOpts | null;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function buildLandmarks(o: PoseOpts): NormalizedLandmark[] {
  const tilt = ((o.tilt ?? 0) * Math.PI) / 180;
  const kθ = ((o.knee ?? 172) * Math.PI) / 180;
  const eθ = ((o.elbow ?? 172) * Math.PI) / 180;
  const extra = o.extra ?? 0.01;
  const arms = o.arms ?? 'down';
  const march = o.march;
  const kL = o.knee ?? 172;
  const kR = o.kneeR ?? o.knee ?? 172;
  // 高抬腿时摆动腿不决定髋高，用支撑（较直）腿；其余情况双膝对称，取最大不改变旧行为
  const supportK = march ? (march.side === -1 ? kR : kL) : Math.max(kL, kR);

  const ay = 2 * L;                                  // 脚踝 y（地面固定）
  const hy = ay - 2 * L * Math.sin((supportK * Math.PI) / 360); // 髋 y（膝越屈越高）
  const pts: Record<number, { x: number; y: number }> = {};
  const put = (i: number, x: number, y: number) => { pts[i] = { x, y }; };

  for (const sx of [-1, 1]) {
    const tag = sx < 0 ? { hip: 23, knee: 25, ankle: 27, sh: 11, el: 13, wr: 15 }
      : { hip: 24, knee: 26, ankle: 28, sh: 12, el: 14, wr: 16 };
    const hx = sx * G / 2;
    put(tag.hip, hx, hy);
    // 肩
    const shx = hx, shy = hy - T;
    put(tag.sh, shx, shy);

    if (march && march.side === sx) {
      // 高抬腿摆动腿（正面）：膝从站立位上抬到髋高，小腿自然下垂
      const kneeMy = hy + L * (1 - march.raise);
      put(tag.knee, hx, kneeMy);
      put(tag.ankle, hx, kneeMy + L * 0.95);
    } else {
      const kSide = ((sx < 0 ? kL : kR) * Math.PI) / 180;
      const ax = sx * (G / 2 + extra);
      put(tag.ankle, ax, ay);
      // 膝盖在髋-踝中点前方（侧面方向）弯折
      put(tag.knee, (hx + ax) / 2 + L * Math.cos(kSide / 2), (hy + ay) / 2);
    }

    // 上肢专用：弯举屈肘角（左/右可不同，支持单臂交替）、侧平举外展角
    const cθ = ((sx < 0 ? (o.curl ?? 172) : (o.curlR ?? o.curl ?? 172)) * Math.PI) / 180;
    const aθ = ((sx < 0 ? (o.abduction ?? 0) : (o.abductionR ?? o.abduction ?? 0)) * Math.PI) / 180;
    if (arms === 'ground') {
      // 俯卧撑：上臂指向身体前方的地面（世界 -x），屈肘时前臂折向头部（世界 -y）
      const d = Math.PI - eθ;
      put(tag.el, shx - UA, shy);
      put(tag.wr, shx - UA - FA * Math.cos(d), shy - FA * Math.sin(d));
    } else if (arms === 'up') {
      put(tag.el, shx, shy - UA);
      put(tag.wr, shx, shy - UA - FA);
    } else if (arms === 'curl') {
      // 二头弯举：大臂垂直向下不动，前臂向肩前折起（α=π-肘角）
      const alpha = Math.PI - cθ;
      put(tag.el, shx, shy + UA);
      put(tag.wr, shx + sx * FA * Math.sin(alpha), shy + UA + FA * Math.cos(alpha));
    } else if (arms === 'raise') {
      // 侧平举：大臂向两侧外展 aθ，前臂与大臂成直线（肘≈180°）
      const ex = shx + sx * UA * Math.sin(aθ), ey = shy + UA * Math.cos(aθ);
      put(tag.el, ex, ey);
      put(tag.wr, ex + sx * FA * Math.sin(aθ), ey + FA * Math.cos(aθ));
    } else {
      put(tag.el, shx, shy + UA);
      put(tag.wr, shx, shy + UA + FA);
    }
  }

  // 旋转（俯卧撑 tilt=-90）后统一缩放进归一化画面
  const rot = (x: number, y: number) => ({ x: x * Math.cos(tilt) - y * Math.sin(tilt), y: x * Math.sin(tilt) + y * Math.cos(tilt) });
  const r: Record<number, { x: number; y: number }> = {};
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const k of Object.keys(pts)) {
    const p = rot(pts[+k].x, pts[+k].y);
    r[+k] = p;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const s = Math.min(0.84 / (maxX - minX), 0.88 / (maxY - minY));
  const tx = 0.5 - ((minX + maxX) / 2) * s;
  const ty = 0.5 - ((minY + maxY) / 2) * s;

  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 })) as NormalizedLandmark[];
  for (const k of Object.keys(r)) {
    lm[+k] = { x: r[+k].x * s + tx, y: r[+k].y * s + ty, z: 0, visibility: 0.99 };
  }
  // 平板姿态专用：髋点沿屏幕 y 方向下沉(>0 塌腰)/上抬(<0 撅臀)，肩/踝不动
  if (o.hipDrop) {
    lm[23].y += o.hipDrop;
    lm[24].y += o.hipDrop;
  }
  return lm;
}

// ---------- 场景片段 ----------
const stand = (n: number, pose: PoseOpts = {}): Frame[] => Array.from({ length: n }, () => pose);
const lost = (n: number): Frame[] => Array.from({ length: n }, () => null);
const ramp = (from: number, to: number, n: number, extra: PoseOpts = {}): Frame[] =>
  Array.from({ length: n }, (_, i) => ({ ...extra, knee: lerp(from, to, n === 1 ? 0 : i / (n - 1)) }));

const squatRep = (depth = 88, top = 172): Frame[] => [
  ...ramp(top, depth, 10), { knee: depth }, { knee: depth }, ...ramp(depth, top, 10),
];
const pushupRep = (depth = 80, top = 172): Frame[] => {
  const prone = (elbow: number): PoseOpts => ({ tilt: -90, elbow, arms: 'ground' });
  return [
    ...Array.from({ length: 10 }, (_, i) => prone(lerp(top, depth, i / 9))),
    prone(depth), prone(depth),
    ...Array.from({ length: 10 }, (_, i) => prone(lerp(depth, top, i / 9))),
  ];
};
export const jackOpen = (n: number): Frame[] => Array.from({ length: n }, () => ({ extra: 0.07, arms: 'up' }));
export const jackClosed = (n: number): Frame[] => Array.from({ length: n }, () => ({ extra: 0.01, arms: 'down' }));
// 落地没完全并拢（踝距≈1.30 倍髋距，处于 1.25~1.45 滞回缓冲带）
export const jackHalf = (n: number): Frame[] => Array.from({ length: n }, () => ({ extra: 0.018, arms: 'down' }));
// 顶点角度在 lo/hi 之间逐帧波动（模拟真实检测抖动 / 正对镜头透视压缩）
const wobble = (n: number, lo: number, hi: number, extra: PoseOpts = {}): Frame[] =>
  Array.from({ length: n }, (_, i) => ({ ...extra, knee: i % 2 ? lo : hi }));

// 弓步蹲（对称近似：双脚大幅分开 + 双膝屈，对侧面状态机等价于前/后腿弓步）
const lungeRep = (): Frame[] => [
  ...Array.from({ length: 8 }, (_, i) => ({ knee: lerp(172, 95, i / 7), extra: lerp(0.01, 0.09, i / 7) })),
  { knee: 95, extra: 0.09 }, { knee: 95, extra: 0.09 },
  ...Array.from({ length: 8 }, (_, i) => ({ knee: lerp(95, 172, i / 7), extra: lerp(0.09, 0.01, i / 7) })),
];
// 高抬腿：一侧膝上抬 2 帧 + 落回 1 帧（raise≈大腿抬升比例，0.78→lift≈0.39）
const marchStep = (side: -1 | 1): Frame[] => [
  { march: { side, raise: 0.78 } }, { march: { side, raise: 0.78 } }, {},
];
// 二头弯举（双臂）：屈肘 172→depth→172；oneArm 时右臂保持伸直模拟单臂弯举
const curlRep = (depth = 50, oneArm = false): Frame[] => [
  ...Array.from({ length: 10 }, (_, i) => ({ arms: 'curl' as const, curl: lerp(172, depth, i / 9), ...(oneArm ? { curlR: 172 } : {}) })),
  { arms: 'curl', curl: depth, ...(oneArm ? { curlR: 172 } : {}) },
  { arms: 'curl', curl: depth, ...(oneArm ? { curlR: 172 } : {}) },
  ...Array.from({ length: 10 }, (_, i) => ({ arms: 'curl' as const, curl: lerp(depth, 172, i / 9), ...(oneArm ? { curlR: 172 } : {}) })),
];
const curlDown = (n: number, angle: number, oneArm = false): Frame[] =>
  Array.from({ length: n }, () => ({ arms: 'curl' as const, curl: angle, ...(oneArm ? { curlR: 172 } : {}) }));
// 侧平举：外展 0→hi→0
const raiseRep = (hi = 85): Frame[] => [
  ...Array.from({ length: 10 }, (_, i) => ({ arms: 'raise' as const, abduction: lerp(0, hi, i / 9) })),
  { arms: 'raise', abduction: hi }, { arms: 'raise', abduction: hi },
  ...Array.from({ length: 10 }, (_, i) => ({ arms: 'raise' as const, abduction: lerp(hi, 0, i / 9) })),
];
const raiseHold = (n: number, a: number): Frame[] => Array.from({ length: n }, () => ({ arms: 'raise' as const, abduction: a }));

// ---------- 运行器 ----------
function simulate(ex: 'c1' | 'c2' | 'c4' | 'c5' | 'c8' | 'c9' | 'c10', frames: Frame[]) {
  const counter = new RepCounter(ex);
  let reps = 0;
  let lastFeedback = '';
  let now = 0;
  // 起始基线帧（站立/俯卧撑直臂/并拢），校准个人基线
  const init: Frame = ex === 'c2' ? { tilt: -90, elbow: 172, arms: 'ground' } : ex === 'c5' ? { extra: 0.01, arms: 'down' } : {};
  for (let i = 0; i < 10; i++) {
    counter.update(buildLandmarks(init), now);
    now += DT;
  }
  for (const f of frames) {
    const upd = counter.update(f ? buildLandmarks(f) : undefined, now);
    if (upd.rep) reps++;
    lastFeedback = upd.feedback;
    now += DT;
  }
  return { reps, lastFeedback };
}

// ---------- 测试用例 ----------
interface Case { name: string; ex: 'c1' | 'c2' | 'c4' | 'c5' | 'c8' | 'c9' | 'c10'; frames: Frame[]; expect: number }
const cases: Case[] = [
  // ===== 深蹲 =====
  { name: '深蹲 S1 连续 10 个标准动作', ex: 'c1', expect: 10,
    frames: Array.from({ length: 10 }, () => [...squatRep(), ...stand(8)]).flat() },
  { name: '深蹲 S2 顶点单帧膝角毛刺(133°×1帧)', ex: 'c1', expect: 0,
    frames: [...stand(6), { knee: 133 }, ...stand(14)] },
  { name: '深蹲 S3 短暂小幅屈膝(130°×3帧)不计', ex: 'c1', expect: 0,
    frames: [...stand(6), ...stand(3, { knee: 130 }), ...stand(14)] },
  { name: '深蹲 S4 计次后顶点膝角余动(150-160抖动1秒)不双计', ex: 'c1', expect: 1,
    frames: [...squatRep(), ...stand(6), ...Array.from({ length: 20 }, (_, i) => ({ knee: i % 2 ? 152 : 159 }))] },
  { name: '深蹲 S5 底部小反弹后再做一个真动作=2', ex: 'c1', expect: 2,
    frames: [...squatRep(), ...stand(8), ...stand(3, { knee: 130 }), ...stand(10), ...squatRep(), ...stand(8)] },
  { name: '深蹲 S6 快速连续 15 个(约1.1s/个)不漏计', ex: 'c1', expect: 15,
    frames: Array.from({ length: 15 }, () => [...squatRep(), ...stand(6)]).flat() },
  { name: '深蹲 S7 慢速单个(约2.5s)计1次', ex: 'c1', expect: 1,
    frames: [...ramp(172, 88, 20), ...stand(10, { knee: 88 }), ...ramp(88, 172, 20), ...stand(8)] },
  { name: '深蹲 S8 起身时完成姿态闪烁(148毛刺)仍只计1次', ex: 'c1', expect: 1,
    frames: [...ramp(172, 88, 10), { knee: 88 },
      ...ramp(88, 172, 10).map((f, i) => (i === 7 ? { knee: 148 } : f)), ...stand(8)] },
  { name: '深蹲 S9 蹲到一半丢骨架0.8s后站直，再做一个=1', ex: 'c1', expect: 1,
    frames: [...stand(6), ...stand(6, { knee: 90 }), ...lost(16), ...stand(8), ...squatRep(), ...stand(8)] },
  { name: '深蹲 S10 正对镜头站直仅159-163°，连续5个不卡复位', ex: 'c1', expect: 5,
    frames: Array.from({ length: 5 }, () => [...squatRep(88, 160), ...wobble(8, 159, 163)]).flat() },
  { name: '深蹲 S11 计次后顶点150-160°抖动1.5s(旧逻辑永久卡死)，再做1个=2', ex: 'c1', expect: 2,
    frames: [...squatRep(), ...stand(6), ...wobble(30, 150, 160), ...squatRep(), ...stand(8)] },
  { name: '深蹲 S12 无停顿快速连做5个(rep间仅2帧100ms)不漏计', ex: 'c1', expect: 5,
    frames: Array.from({ length: 5 }, () => [...squatRep(), ...stand(2)]).flat() },
  { name: '深蹲 S13 站直角度稳定偏低(仅152°)5个连做不卡复位', ex: 'c1', expect: 5,
    frames: Array.from({ length: 5 }, () => [...squatRep(88, 152), ...stand(10, { knee: 152 })]).flat() },
  { name: '深蹲 S14 站直仅146-149°(旧完成阈值150漏计)，5个不漏', ex: 'c1', expect: 5,
    frames: Array.from({ length: 5 }, () => [...squatRep(88, 146), ...stand(8, { knee: 146 })]).flat() },
  { name: '深蹲 S15 顶点147°较快节奏(约0.3s间隔)5个不双计不漏', ex: 'c1', expect: 5,
    frames: Array.from({ length: 5 }, () => [...squatRep(90, 147), ...stand(6, { knee: 147 })]).flat() },

  // ===== 俯卧撑 =====
  { name: '俯卧撑 P1 连续 10 个标准动作', ex: 'c2', expect: 10,
    frames: Array.from({ length: 10 }, () => [...pushupRep(), ...stand(6, { tilt: -90, elbow: 172, arms: 'ground' })]).flat() },
  { name: '俯卧撑 P2 直臂顶点单帧肘角毛刺(117°×1帧)', ex: 'c2', expect: 0,
    frames: [...stand(6, { tilt: -90, elbow: 172, arms: 'ground' }),
      { tilt: -90, elbow: 117, arms: 'ground' }, ...stand(14, { tilt: -90, elbow: 172, arms: 'ground' })] },
  { name: '俯卧撑 P3 快速屈臂脉动(117°×3帧,<300ms)不计', ex: 'c2', expect: 0,
    frames: [...stand(6, { tilt: -90, elbow: 172, arms: 'ground' }),
      ...stand(3, { tilt: -90, elbow: 117, arms: 'ground' }), ...stand(14, { tilt: -90, elbow: 172, arms: 'ground' })] },
  { name: '俯卧撑 P4 计次后顶点肘角抖动1秒不双计', ex: 'c2', expect: 1,
    frames: [...pushupRep(), ...stand(6, { tilt: -90, elbow: 172, arms: 'ground' }),
      ...Array.from({ length: 20 }, (_, i) => ({ tilt: -90, elbow: i % 2 ? 158 : 164, arms: 'ground' }))] },
  { name: '俯卧撑 P5 直臂顶点仅161-164°(旧阈值165卡死)，连续5个', ex: 'c2', expect: 5,
    frames: Array.from({ length: 5 }, () => [...pushupRep(80, 162), ...stand(6, { tilt: -90, elbow: 162, arms: 'ground' })]).flat() },

  // ===== 开合跳 =====
  { name: '开合跳 J1 连续 10 个', ex: 'c5', expect: 10,
    frames: Array.from({ length: 10 }, () => [...jackClosed(8), ...jackOpen(10), ...jackClosed(8)]).flat() },
  { name: '开合跳 J2 只举手不跳脚不计', ex: 'c5', expect: 0,
    frames: [...jackClosed(6), ...Array.from({ length: 12 }, () => ({ extra: 0.01, arms: 'up' })), ...jackClosed(10)] },
  { name: '开合跳 J3 打开姿态仅2帧(100ms)毛刺不计', ex: 'c5', expect: 0,
    frames: [...jackClosed(6), ...jackOpen(2), ...jackClosed(14)] },
  { name: '开合跳 J5 每次落地2帧小反弹(手还举着)仍只计10', ex: 'c5', expect: 10,
    frames: Array.from({ length: 10 }, () => [...jackClosed(8), ...jackOpen(10), ...jackClosed(3), ...jackOpen(2), ...jackClosed(6)]).flat() },
  { name: '开合跳 J6 假打开2s后并拢算1次，再正常1个=2', ex: 'c5', expect: 2,
    frames: [...jackClosed(6), ...jackOpen(40), ...jackClosed(10), ...jackOpen(10), ...jackClosed(8)] },
  { name: '开合跳 J7 落地没完全并拢(踝比1.30,旧逻辑不复位)，连续5个', ex: 'c5', expect: 5,
    frames: Array.from({ length: 5 }, () => [...jackOpen(10), ...jackClosed(4), ...jackHalf(8)]).flat() },
  { name: '开合跳 J8 落地只到1.30从不<1.25(旧完成阈值漏计)，连续5个', ex: 'c5', expect: 5,
    frames: Array.from({ length: 5 }, () => [...jackClosed(6), ...jackOpen(10), ...jackHalf(10)]).flat() },
  { name: '开合跳 J9 一直站1.30从不跳开不计', ex: 'c5', expect: 0,
    frames: [...jackHalf(30)] },

  // ===== 弓步蹲 =====
  { name: '弓步 L1 连续5个标准(大跨步+双膝屈)', ex: 'c4', expect: 5,
    frames: Array.from({ length: 5 }, () => [...lungeRep(), ...stand(8)]).flat() },
  { name: '弓步 L2 只小幅屈膝120°不迈步不计', ex: 'c4', expect: 0,
    frames: [...stand(6), ...stand(6, { knee: 120, extra: 0.04 }), ...stand(16)] },
  { name: '弓步 L3 大步幅但腿伸直(未屈膝)不计', ex: 'c4', expect: 0,
    frames: [...stand(6), ...stand(6, { knee: 172, extra: 0.1 }), ...stand(16)] },
  { name: '弓步 L4 较快节奏连做5个不漏', ex: 'c4', expect: 5,
    frames: Array.from({ length: 5 }, () => [...lungeRep(), ...stand(4)]).flat() },

  // ===== 高抬腿 =====
  { name: '高抬腿 M1 左右交替10步', ex: 'c8', expect: 10,
    frames: Array.from({ length: 5 }, () => [...marchStep(-1), ...marchStep(1)]).flat() },
  { name: '高抬腿 M2 一直站立不计', ex: 'c8', expect: 0, frames: stand(30) },
  { name: '高抬腿 M3 膝抬不到位(raise0.45)不计', ex: 'c8', expect: 0,
    frames: Array.from({ length: 10 }, () => [{ march: { side: -1, raise: 0.45 } }, { march: { side: 1, raise: 0.45 } }, {}]).flat() },
  { name: '高抬腿 M4 同侧连续抬(每步间落回)可重复计6次', ex: 'c8', expect: 6,
    frames: Array.from({ length: 6 }, () => marchStep(-1)).flat() },

  // ===== 二头弯举 =====
  { name: '弯举 U1 连续10个标准双臂弯举', ex: 'c9', expect: 10,
    frames: Array.from({ length: 10 }, () => [...curlRep(), ...stand(8)]).flat() },
  { name: '弯举 U2 直臂顶点单帧屈肘毛刺(75°×1帧)不计', ex: 'c9', expect: 0,
    frames: [...stand(6), { arms: 'curl', curl: 75 }, ...stand(16)] },
  { name: '弯举 U3 短暂屈肘(90°×6帧)未过进入阈值不计', ex: 'c9', expect: 0,
    frames: [...stand(6), ...curlDown(6, 90), ...stand(14)] },
  { name: '弯举 U4 擦阈值浅屈(77°到底再伸直)被幅度门中止不计', ex: 'c9', expect: 0,
    frames: [...stand(6), ...curlDown(6, 77), ...stand(16)] },
  { name: '弯举 U5 半程弯举(屈到70°)仍计次，连续3个', ex: 'c9', expect: 3,
    frames: Array.from({ length: 3 }, () => [...curlRep(70), ...stand(8)]).flat() },
  { name: '弯举 U6 快速连做8个(约1.3s/个)不漏计', ex: 'c9', expect: 8,
    frames: Array.from({ length: 8 }, () => [...curlRep(), ...stand(4)]).flat() },
  { name: '弯举 U7 单臂弯举5次(另一臂始终伸直)按较弯侧计数', ex: 'c9', expect: 5,
    frames: Array.from({ length: 5 }, () => [...curlRep(50, true), ...stand(8)]).flat() },
  { name: '弯举 U8 计次后顶点肘角余动(150-160抖动1s)不双计', ex: 'c9', expect: 1,
    frames: [...curlRep(), ...stand(6), ...Array.from({ length: 20 }, (_, i) => ({ arms: 'curl' as const, curl: i % 2 ? 150 : 160 }))] },
  { name: '弯举 U9 屈肘举着2s不下放→作废，随后正常1个=1', ex: 'c9', expect: 1,
    frames: [...stand(6), ...curlDown(44, 50), ...stand(8), ...curlRep(), ...stand(8)] },

  // ===== 侧平举 =====
  { name: '侧平举 R1 连续10个标准动作', ex: 'c10', expect: 10,
    frames: Array.from({ length: 10 }, () => [...raiseRep(), ...stand(8)]).flat() },
  { name: '侧平举 R2 只小幅抬到40°(未过进入阈值)不计', ex: 'c10', expect: 0,
    frames: [...stand(6), ...raiseHold(10, 40), ...stand(14)] },
  { name: '侧平举 R3 抬到57°擦阈值(进入但未过60°幅度门)不计', ex: 'c10', expect: 0,
    frames: [...stand(6), ...raiseRep(57), ...stand(10)] },
  { name: '侧平举 R4 单帧抬升毛刺(80°×1帧)不计', ex: 'c10', expect: 0,
    frames: [...stand(6), { arms: 'raise', abduction: 80 }, ...stand(16)] },
  { name: '侧平举 R5 半程抬到65°(计入但提示不到位)连续3个', ex: 'c10', expect: 3,
    frames: Array.from({ length: 3 }, () => [...raiseRep(65), ...stand(8)]).flat() },
  { name: '侧平举 R6 快速连做8个不漏计', ex: 'c10', expect: 8,
    frames: Array.from({ length: 8 }, () => [...raiseRep(), ...stand(4)]).flat() },
  { name: '侧平举 R7 计次后顶点手臂余动(20-30°抖动1s)不双计', ex: 'c10', expect: 1,
    frames: [...raiseRep(), ...stand(6), ...Array.from({ length: 20 }, (_, i) => ({ arms: 'raise' as const, abduction: i % 2 ? 20 : 30 }))] },
  { name: '侧平举 R8 抬到水平保持2s不放→作废不计', ex: 'c10', expect: 0,
    frames: [...stand(6), ...raiseHold(44, 85), ...stand(10)] },
];

// ---------- 平板支撑场景 ----------
// 直臂平板 = 俯卧撑顶部姿态（tilt=-90 俯卧、肘近伸直）；hipDrop>0 塌腰、<0 撅臀
const plankGood = (n: number): Frame[] =>
  Array.from({ length: n }, () => ({ tilt: -90, elbow: 170, arms: 'ground' as const, hipDrop: 0 }));
const plankBad = (n: number, d: number): Frame[] =>
  Array.from({ length: n }, () => ({ tilt: -90, elbow: 170, arms: 'ground' as const, hipDrop: d }));

function simulatePlank(frames: Frame[]) {
  const det = new PlankDetector();
  const segments: PlankSegment[] = [];
  let now = 0;
  let last: ReturnType<PlankDetector['update']> | null = null;
  for (const f of frames) {
    last = det.update(f ? buildLandmarks(f) : undefined, now);
    if (last.segment) segments.push(last.segment);
    now += DT;
  }
  return { totalGoodMs: det.getTotalGoodMs(), segments, last };
}

interface PCase {
  name: string; frames: Frame[];
  goodRange: [number, number]; segments: number; issueIncludes?: string;
}
const plankCases: PCase[] = [
  { name: '平板 PL1 标准直臂保持约 6s', frames: plankGood(120), goodRange: [5700, 6200], segments: 0 },
  { name: '平板 PL2 好4s后严重塌腰→断段1，问题含塌腰',
    frames: [...plankGood(80), ...plankBad(30, 0.16)], goodRange: [3600, 4200], segments: 1, issueIncludes: '塌腰' },
  { name: '平板 PL3 好4s后撅臀抬髋→断段1，问题含撅臀',
    frames: [...plankGood(80), ...plankBad(30, -0.16)], goodRange: [3600, 4200], segments: 1, issueIncludes: '撅臀' },
  { name: '平板 PL4 保持中单帧塌腰毛刺不断段，合格≈5s',
    frames: [...plankGood(60), ...plankBad(1, 0.16), ...plankGood(40)], goodRange: [4700, 5300], segments: 0 },
  { name: '平板 PL5 断段后重新上板，两段合格合计≈7.4s，仅1个≥3s段产出',
    frames: [...plankGood(80), ...plankBad(30, 0.16), ...plankGood(70)], goodRange: [7000, 7700], segments: 1 },
  { name: '平板 PL6 站立乱晃1s不上板，随后保持3s',
    frames: [...stand(20), ...plankGood(60)], goodRange: [2700, 3200], segments: 0 },
  { name: '平板 PL7 轻度变形2s不断段且不计合格时长，合格≈5s',
    frames: [...plankGood(60), ...plankBad(40, 0.105), ...plankGood(40)], goodRange: [4500, 5200], segments: 0 },
  { name: '平板 PL8 保持4s后丢骨架1s(>0.5s)→断段1',
    frames: [...plankGood(80), ...lost(20)], goodRange: [3600, 4200], segments: 1 },
];

// ---------- 执行（仅直接运行时；被 import 时不跑） ----------
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
let pass = 0;
let fail = 0;
for (const c of cases) {
  const { reps, lastFeedback } = simulate(c.ex, c.frames);
  const ok = reps === c.expect;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  => 实际 ${reps} / 期望 ${c.expect}${ok ? '' : `（末提示：${lastFeedback}）`}`);
  ok ? pass++ : fail++;
}
// 平板支撑（计时型）：断言合格保持时长范围、断段数、问题类型
for (const c of plankCases) {
  const { totalGoodMs, segments } = simulatePlank(c.frames);
  const goodMsOk = totalGoodMs >= c.goodRange[0] && totalGoodMs <= c.goodRange[1];
  const segOk = segments.length === c.segments;
  const issueOk = !c.issueIncludes || segments.some((s) => s.issues.join('').includes(c.issueIncludes!));
  const ok = goodMsOk && segOk && issueOk;
  const detail = `合格 ${(totalGoodMs / 1000).toFixed(1)}s[${(c.goodRange[0] / 1000).toFixed(0)}~${(c.goodRange[1] / 1000).toFixed(0)}]，段 ${segments.length}/${c.segments}` +
    (c.issueIncludes ? `，问题「${segments.map((s) => s.issues.join('/')).join('；') || '无'}」` : '');
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  => ${detail}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} 通过 / ${fail} 失败，共 ${cases.length + plankCases.length} 个场景`);
process.exit(fail ? 1 : 0);
}
