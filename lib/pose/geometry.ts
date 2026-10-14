/**
 * MediaPipe Pose 姿态评估纯算法库
 *
 * MediaPipe Pose Landmarker 输出 33 个归一化关键点（x/y 为画面比例，y 向下为正），
 * 本模块只做数学计算，不依赖 DOM，方便单测与复用。
 *
 * 关键点编号：
 *   11/12 左右肩 · 13/14 左右肘 · 15/16 左右腕
 *   23/24 左右髋 · 25/26 左右膝 · 27/28 左右踝
 */
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export const LM = {
  shoulderL: 11, shoulderR: 12,
  elbowL: 13, elbowR: 14,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
} as const;

export type Side = 'L' | 'R';

export interface AngleSnapshot {
  kneeAngle: number;
  elbowAngle: number;
  torsoAngle: number;
  bodyLine: number;
}

export interface RepResult {
  /** 单次得分 60-100 */
  score: number;
  /** 本次动作检测到的问题（空数组 = 标准） */
  issues: string[];
  durationMs: number;
  /** 动作最低点（最深位）的关节角度快照，供准确率实验导出 */
  snap?: AngleSnapshot;
}

export interface FrameMetrics {
  side: Side;
  /** 膝关节角（髋-膝-踝），深蹲用 */
  kneeAngle: number;
  /** 肘关节角（肩-肘-腕），俯卧撑用 */
  elbowAngle: number;
  /** 躯干与竖直方向夹角（度），衡量上身前倾/背部姿态 */
  torsoAngle: number;
  /** 身体直线角度（肩-髋-踝），俯卧撑用 */
  bodyLine: number;
  /** 双膝间距 / 双髋间距，检测膝盖内扣 */
  kneeGapRatio: number;
  /** 双踝间距 / 双髋间距，开合跳用 */
  ankleGapRatio: number;
  /** 双手是否上举过肩，开合跳用 */
  armsUp: boolean;
  /** 双髋中点的归一化 y（画面中向下为正），深蹲深度用 */
  hipY: number;
  /** 选中侧髋-踝的画面距离，作为个人腿长基线，深蹲深度用 */
  legLen: number;
  /** (髋y-肩y)/腿长：平板支撑区分撅臀抬髋(负)与塌腰沉髋(正)，水平时≈0 */
  plankHipDy: number;
}

export interface CounterUpdate {
  metrics: FrameMetrics | null;
  phase: string;
  feedback: string;
  feedbackLevel: 'info' | 'good' | 'warn';
  /** 本次 update 是否完成了一次计数 */
  rep?: RepResult;
}

// ---------- 基础数学 ----------
interface P { x: number; y: number; z: number }

const v = (lm: NormalizedLandmark[] | undefined, i: number): P | null => {
  const p = lm?.[i];
  if (!p) return null;
  return { x: p.x, y: p.y, z: p.z ?? 0 };
};

/** 计算 b 点处的夹角 ∠abc（度，0-180） */
export function angleAt(a: P, b: P, c: P): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const m1 = Math.hypot(v1.x, v1.y, v1.z);
  const m2 = Math.hypot(v2.x, v2.y, v2.z);
  if (m1 < 1e-6 || m2 < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function dist2d(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 躯干（髋→肩）与竖直向上方向的夹角 */
export function torsoAngle(shoulder: P, hip: P): number {
  const up = { x: 0, y: -1 };
  const vec = { x: shoulder.x - hip.x, y: shoulder.y - hip.y };
  const dot = vec.x * up.x + vec.y * up.y;
  const m = Math.hypot(vec.x, vec.y);
  if (m < 1e-6) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

// ---------- 选边：取可见度更高的一侧 ----------
function pickSide(lm: NormalizedLandmark[]): Side {
  const idxL = [LM.shoulderL, LM.elbowL, LM.wristL, LM.hipL, LM.kneeL, LM.ankleL];
  const idxR = [LM.shoulderR, LM.elbowR, LM.wristR, LM.hipR, LM.kneeR, LM.ankleR];
  const score = (arr: number[]) =>
    arr.reduce((s, i) => s + (lm[i]?.visibility ?? 1), 0);
  return score(idxL) >= score(idxR) ? 'L' : 'R';
}

function metricsOf(lm: NormalizedLandmark[]): FrameMetrics | null {
  const side = pickSide(lm);
  const s = side === 'L'
    ? { shoulder: LM.shoulderL, elbow: LM.elbowL, wrist: LM.wristL, hip: LM.hipL, knee: LM.kneeL, ankle: LM.ankleL }
    : { shoulder: LM.shoulderR, elbow: LM.elbowR, wrist: LM.wristR, hip: LM.hipR, knee: LM.kneeR, ankle: LM.ankleR };

  const shoulder = v(lm, s.shoulder), elbow = v(lm, s.elbow), wrist = v(lm, s.wrist);
  const hip = v(lm, s.hip), knee = v(lm, s.knee), ankle = v(lm, s.ankle);
  const shoulderO = v(lm, side === 'L' ? LM.shoulderR : LM.shoulderL);
  const hipO = v(lm, side === 'L' ? LM.hipR : LM.hipL);
  const kneeO = v(lm, side === 'L' ? LM.kneeR : LM.kneeL);
  const ankleL = v(lm, LM.ankleL), ankleR = v(lm, LM.ankleR);
  if (!shoulder || !elbow || !wrist || !hip || !knee || !ankle || !hipO || !kneeO || !ankleL || !ankleR || !shoulderO) return null;

  const kneeAngle = angleAt(hip, knee, ankle);
  const elbowAngle = angleAt(shoulder, elbow, wrist);

  const hipGap = Math.max(dist2d(hip, hipO), 1e-3);
  return {
    side,
    kneeAngle,
    elbowAngle,
    torsoAngle: torsoAngle(shoulder, hip),
    bodyLine: angleAt(shoulder, hip, ankle),
    kneeGapRatio: dist2d(knee, kneeO) / hipGap,
    ankleGapRatio: dist2d(ankleL, ankleR) / hipGap,
    armsUp: lm[LM.wristL]!.y < lm[LM.shoulderL]!.y - 0.03 && lm[LM.wristR]!.y < lm[LM.shoulderR]!.y - 0.03,
    hipY: (hip.y + hipO.y) / 2,
    legLen: Math.max(dist2d(hip, ankle), 1e-3),
    plankHipDy: (hip.y - shoulder.y) / Math.max(dist2d(hip, ankle), 1e-3),
  };
}

// ---------- 动作配置 ----------
export const POSE_EXERCISES = [
  { id: 'c1', name: '标准深蹲', emoji: '🏋️', hint: '推荐侧对摄像头（角度最准），正对也可；全身入镜，下蹲到大腿接近水平' },
  { id: 'c2', name: '俯卧撑', emoji: '💪', hint: '侧对摄像头做俯卧撑，身体保持一条直线' },
  { id: 'c3', name: '平板支撑', emoji: '🧘', hint: '侧对摄像头，前臂（或直臂）撑地，肩-髋-踝成一条直线，尽量久地保持' },
  { id: 'c5', name: '开合跳', emoji: '🤸', hint: '正对摄像头，跳开时双脚打开、双手举过头顶' },
] as const;

export type PoseExerciseId = (typeof POSE_EXERCISES)[number]['id'];

// ---------- 计数状态机 ----------
// 防抖设计（共六道保险，解决"做一个计两个"）：
//  1. 进入确认窗——下蹲/屈臂姿态必须【持续 DOWN_HOLD_MS】才开启一次动作，
//     顶点单帧膝角/髋高毛刺无法进入 bottom，杜绝"站着没动却被静默补计一次"
//  2. armed 门控——每次计数后必须重新看到【严格复位姿态并持续 REARM_HOLD_MS】才能开始下一次
//     （顶点余动、最低点停顿时的调整无法开启新动作）
//  3. 完成确认窗——回位姿态必须【持续 COMPLETE_HOLD_MS】才计数，单帧毛刺忽略
//  4. 600ms 计数冷却 + 最短动作时长 300ms，双重保险
//  5. 开合跳"打开"姿态也需保持 OPEN_HOLD_MS 才算真打开（防手臂挥动误触）
//  6. 丢骨架超过 ~0.5s 静默作废当前未完成动作；膝盖内扣相对个人站立膝宽判定
//  另：蹲类动作设最低幅度门，顶点附近的小幅屈膝（既没到膝角阈值也没有明显屈髋）
//      即使被缓慢做出也不计次，返回"幅度太小"提示。
const REP_COOLDOWN_MS = 600;
const COMPLETE_HOLD_MS = 120; // 完成姿态需持续
const REARM_HOLD_MS = 200;    // 复位姿态需持续才重新武装
const REARM_FORCE_MS = 900;   // 计数后超过此时长且当前基本复位，兜底武装（防止角度偏低时永久卡住）
const JACK_REARM_FORCE_MS = 700;
const OPEN_HOLD_MS = 100;     // 开合跳打开姿态需持续
const DOWN_HOLD_MS = 90;      // 进入下蹲/屈臂姿态需持续（约 2 帧 @20fps）
const LOSE_GRACE_TICKS = 15;

export class RepCounter {
  private state: 'top' | 'bottom' | 'closed' | 'open' = 'top';
  private armed = true;
  private phaseStart = 0;
  // bottom 阶段记录到的最差姿态
  private minPrimary = 180;
  private maxTorso = 0;
  private minKneeGap = 99;
  private minElbow = 180;
  private minBodyLine = 180;
  // 站立时的双膝/双髋间距基线（EMA），用于相对判定膝盖内扣
  private topKneeGap = 1;
  // 站立时髋高与腿长基线，用于臀部下降幅度判深度（正对镜头时膝角会被透视压缩）
  private standHipY = 0;
  private standLegLen = 0;
  private maxDescent = 0;
  // 最深位关键点快照
  private bottomSnap: AngleSnapshot | null = null;
  private lastRepAt = -REP_COOLDOWN_MS;
  private noPoseTicks = 0;
  // 时间窗确认：完成候选起始时刻、重新武装候选起始时刻、开合跳打开候选时刻、进入下姿态候选时刻
  private completeSince = 0;
  private rearmSince = 0;
  private openSince = 0;
  private downSince = 0;

  private exerciseId: PoseExerciseId;

  constructor(exerciseId: PoseExerciseId) {
    this.exerciseId = exerciseId;
    this.reset();
  }

  reset() {
    this.state = this.exerciseId === 'c5' ? 'closed' : 'top';
    this.armed = true;
    this.phaseStart = 0;
    this.minPrimary = 180; this.maxTorso = 0; this.minKneeGap = 99;
    this.minElbow = 180; this.minBodyLine = 180;
    this.standHipY = 0; this.standLegLen = 0; this.maxDescent = 0;
    this.bottomSnap = null;
    this.lastRepAt = -REP_COOLDOWN_MS; this.noPoseTicks = 0;
    this.completeSince = 0; this.rearmSince = 0; this.openSince = 0; this.downSince = 0;
  }

  // 长时间丢失骨架：回到复位态并解除武装，等看到完整复位姿态再重新计
  private cancelInProgress() {
    this.state = this.exerciseId === 'c5' ? 'closed' : 'top';
    this.armed = false;
    this.phaseStart = 0;
    this.minPrimary = 180; this.maxTorso = 0; this.minKneeGap = 99;
    this.minElbow = 180; this.minBodyLine = 180; this.maxDescent = 0;
    this.bottomSnap = null;
    this.completeSince = 0; this.rearmSince = 0; this.openSince = 0; this.downSince = 0;
  }

  update(lm: NormalizedLandmark[] | undefined, nowMs: number): CounterUpdate {
    if (!lm || lm.length < 29) {
      if (++this.noPoseTicks > LOSE_GRACE_TICKS) this.cancelInProgress();
      return { metrics: null, phase: 'lost', feedback: '请让全身进入画面', feedbackLevel: 'warn' };
    }
    const m = metricsOf(lm);
    if (!m) {
      if (++this.noPoseTicks > LOSE_GRACE_TICKS) this.cancelInProgress();
      return { metrics: null, phase: 'lost', feedback: '关键点被遮挡，请调整角度', feedbackLevel: 'warn' };
    }
    this.noPoseTicks = 0;
    const { kneeAngle: knee, elbowAngle: elbow } = m;

    if (this.exerciseId === 'c1') return this.squat(m, knee, nowMs);
    if (this.exerciseId === 'c2') return this.pushup(m, elbow, nowMs);
    return this.jumpingJack(m, nowMs);
  }

  // 深蹲：站直(膝>160) → 下蹲 → 站起，计 1 次
  // 深度双判据（正对镜头时矢状面膝角会被透视压缩，单用膝角会误判蹲深不足）：
  //   A 膝角 <112°（侧面最准）  B 臀部下降 >20% 站立腿长（正面对解透视压缩）
  private squat(m: FrameMetrics, knee: number, now: number): CounterUpdate {
    const descent = this.standLegLen > 0 ? Math.max(0, (m.hipY - this.standHipY) / this.standLegLen) : 0;
    const deepEnough = knee < 112 || descent >= 0.2;
    // 站立时更新个人基线：膝宽（内扣判定）、髋高与腿长（深度判定）
    // 仅在已武装时更新，避免计数后未复位期间的姿态漂移污染基线
    if (this.state === 'top' && this.armed && knee > 155) {
      this.topKneeGap = this.topKneeGap === 1 ? m.kneeGapRatio : this.topKneeGap * 0.95 + m.kneeGapRatio * 0.05;
      if (this.standLegLen === 0) {
        this.standHipY = m.hipY; this.standLegLen = m.legLen;
      } else {
        this.standHipY = this.standHipY * 0.95 + m.hipY * 0.05;
        this.standLegLen = this.standLegLen * 0.95 + m.legLen * 0.05;
      }
    }
    if (this.state === 'top') {
      // 重新武装（滞回设计，解决"站直了却一直提示没站直"）：
      //  明确开始下一次下蹲（knee<135 或 descent>0.1，与进入阈值一致）才清零计时；
      //  其余帧——包括完全站直与顶点附近的自然微屈——都维持计时，满 200ms 即武装
      //  （武装后仍有 90ms 进入确认 + 600ms 冷却兜底，顶点余动不会双计）
      //  兜底：计数超过 900ms 且当前基本站直（knee>150），直接武装（正对镜头透视压缩时站直也可能只有 150-160）
      if (!this.armed) {
        if (knee < 135 || descent > 0.1) {
          this.rearmSince = 0;
        } else {
          if (!this.rearmSince) this.rearmSince = now;
          if (now - this.rearmSince >= REARM_HOLD_MS) this.armed = true;
        }
        if (!this.armed && now - this.lastRepAt > REARM_FORCE_MS && knee > 150 && descent < 0.06) {
          this.armed = true;
          this.rearmSince = 0;
        }
      }
      // 进入下蹲：膝角明显弯曲 或 臀部明显下降，且姿态需【持续】DOWN_HOLD_MS
      // （顶点单帧毛刺只持续 1 帧，无法开启动作，更不会在 300ms 后被静默补计）
      const entering = knee < 135 || descent > 0.1;
      if (this.armed && now - this.lastRepAt > REP_COOLDOWN_MS) {
        if (entering) {
          if (!this.downSince) this.downSince = now;
          if (now - this.downSince >= DOWN_HOLD_MS) {
            this.state = 'bottom';
            this.phaseStart = now;
            this.completeSince = 0;
            this.downSince = 0;
            this.minPrimary = knee; this.maxTorso = m.torsoAngle; this.minKneeGap = m.kneeGapRatio;
            this.maxDescent = descent;
          }
        } else {
          this.downSince = 0;
        }
      }
      if (!this.armed) {
        return { metrics: m, phase: 'top', feedback: '请先站直复位，再开始下一个', feedbackLevel: 'warn' };
      }
      return {
        metrics: m, phase: 'top',
        feedback: knee < 140 || descent > 0.08 ? '继续下蹲 ↓' : '准备，下蹲！',
        feedbackLevel: 'info',
      };
    }
    // bottom 中持续采样最差值
    if (knee < this.minPrimary) {
      this.minPrimary = knee;
      this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
    }
    this.maxTorso = Math.max(this.maxTorso, m.torsoAngle);
    this.minKneeGap = Math.min(this.minKneeGap, m.kneeGapRatio);
    this.maxDescent = Math.max(this.maxDescent, descent);

    // 回到站立：完成姿态必须【持续】COMPLETE_HOLD_MS，单帧毛刺不计数
    const completionPose = knee > 150 && descent < 0.05;
    if (completionPose) {
      if (!this.completeSince) this.completeSince = now;
    } else {
      this.completeSince = 0;
    }
    if (this.completeSince && now - this.completeSince >= COMPLETE_HOLD_MS && now - this.phaseStart >= 300) {
      // 最低幅度门：顶点附近的缓慢小幅屈膝（膝角没压到 129 以下、臀部下降也不足 12% 腿长）
      // 属于站立调整而非一次深蹲，静默中止不计次
      if (this.minPrimary >= 129 && this.maxDescent < 0.12) {
        this.state = 'top';
        this.armed = false;
        this.rearmSince = now;
        this.completeSince = 0;
        this.downSince = 0;
        this.bottomSnap = null;
        return { metrics: m, phase: 'top', feedback: '幅度太小未计次，请站直后重新下蹲', feedbackLevel: 'warn' };
      }
      const issues: string[] = [];
      // 双判据都不达标才算蹲深不足
      if (this.minPrimary > 112 && this.maxDescent < 0.2) issues.push('蹲深不足，大腿未到水平');
      if (this.maxTorso > 50) issues.push('上身前倾过大，挺直背部');
      // 相对个人站立膝宽收窄 28% 以上才算内扣，避免窄站距误报
      if (this.minKneeGap < this.topKneeGap * 0.72) issues.push('膝盖内扣，与脚尖同向');
      const rep: RepResult = {
        score: Math.max(60, 100 - (issues.includes('蹲深不足，大腿未到水平') ? 22 : 0) - (issues.includes('上身前倾过大，挺直背部') ? 16 : 0) - (issues.includes('膝盖内扣，与脚尖同向') ? 10 : 0)),
        issues,
        durationMs: now - this.phaseStart,
        snap: this.bottomSnap ?? undefined,
      };
      this.state = 'top';
      this.armed = false; // 基本站直持续 200ms（或 900ms 兜底）后重新武装
      this.rearmSince = now;
      this.completeSince = 0;
      this.downSince = 0;
      this.lastRepAt = now;
      this.bottomSnap = null;
      return { metrics: m, phase: 'rep', feedback: issues.length ? `+1 ⚠️ ${issues[0]}` : '+1 动作标准！', feedbackLevel: issues.length ? 'warn' : 'good', rep };
    }
    const depthHint = deepEnough ? '到位，发力起身 ↑' : '再低一点，大腿接近水平';
    return { metrics: m, phase: 'bottom', feedback: depthHint, feedbackLevel: deepEnough ? 'good' : 'info' };
  }

  // 俯卧撑：手臂伸直(肘>160) → 屈臂(肘<120，深度由扣分阈值判定) → 推起，计 1 次
  private pushup(m: FrameMetrics, elbow: number, now: number): CounterUpdate {
    if (this.state === 'top') {
      // 重新武装（滞回）：elbow<120（真的又屈臂，与进入阈值一致）才清零；其余帧
      // （含直臂顶点的自然微屈）都维持计时，满 200ms 武装；900ms 兜底：elbow>155 直接武装
      if (!this.armed) {
        if (elbow < 120) {
          this.rearmSince = 0;
        } else {
          if (!this.rearmSince) this.rearmSince = now;
          if (now - this.rearmSince >= REARM_HOLD_MS) this.armed = true;
        }
        if (!this.armed && now - this.lastRepAt > REARM_FORCE_MS && elbow > 155) {
          this.armed = true;
          this.rearmSince = 0;
        }
      }
      // 屈臂进入也需持续 DOWN_HOLD_MS，顶点肘角单帧抖动不开启动作
      if (this.armed && now - this.lastRepAt > REP_COOLDOWN_MS) {
        if (elbow < 120) {
          if (!this.downSince) this.downSince = now;
          if (now - this.downSince >= DOWN_HOLD_MS) {
            this.state = 'bottom';
            this.phaseStart = now;
            this.completeSince = 0;
            this.downSince = 0;
            this.minElbow = elbow; this.minBodyLine = m.bodyLine;
            this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
          }
        } else {
          this.downSince = 0;
        }
      }
      if (!this.armed) {
        return { metrics: m, phase: 'top', feedback: '请先伸直手臂复位', feedbackLevel: 'warn' };
      }
      return {
        metrics: m, phase: 'top',
        feedback: m.bodyLine < 155 ? '核心收紧，身体成直线' : '准备，屈臂下降 ↓',
        feedbackLevel: m.bodyLine < 155 ? 'warn' : 'info',
      };
    }
    if (elbow < this.minElbow) {
      this.minElbow = elbow;
      this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
    }
    this.minBodyLine = Math.min(this.minBodyLine, m.bodyLine);

    // 推起到位需持续 COMPLETE_HOLD_MS，顶点手臂抖动不双计
    if (elbow > 160) {
      if (!this.completeSince) this.completeSince = now;
    } else {
      this.completeSince = 0;
    }
    if (this.completeSince && now - this.completeSince >= COMPLETE_HOLD_MS && now - this.phaseStart >= 300) {
      // 最低幅度门：肘角没压到 115° 以下属于直臂状态的小幅抖动，中止不计次
      if (this.minElbow > 114) {
        this.state = 'top';
        this.armed = false;
        this.rearmSince = now;
        this.completeSince = 0;
        this.downSince = 0;
        this.bottomSnap = null;
        return { metrics: m, phase: 'top', feedback: '幅度太小未计次，请伸直手臂后重新下降', feedbackLevel: 'warn' };
      }
      const issues: string[] = [];
      if (this.minElbow > 105) issues.push('下放幅度不够，胸部贴近地面');
      if (this.minBodyLine < 155) issues.push('塌腰或撅臀，保持身体一条直线');
      const rep: RepResult = {
        score: Math.max(60, 100 - (issues.includes('下放幅度不够，胸部贴近地面') ? 22 : 0) - (issues.includes('塌腰或撅臀，保持身体一条直线') ? 18 : 0)),
        issues,
        durationMs: now - this.phaseStart,
        snap: this.bottomSnap ?? undefined,
      };
      this.state = 'top';
      this.armed = false; // 手臂基本伸直持续 200ms（或 900ms 兜底）后重新武装
      this.rearmSince = now;
      this.completeSince = 0;
      this.downSince = 0;
      this.lastRepAt = now;
      this.bottomSnap = null;
      return { metrics: m, phase: 'rep', feedback: issues.length ? `+1 ⚠️ ${issues[0]}` : '+1 动作标准！', feedbackLevel: issues.length ? 'warn' : 'good', rep };
    }
    return {
      metrics: m, phase: 'bottom',
      feedback: elbow < 90 ? '到位，推起 ↑' : '继续下降，胸部接近地面',
      feedbackLevel: elbow < 90 ? 'good' : 'info',
    };
  }

  // 开合跳节奏快，复位确认比力量动作短
  private static JACK_REARM_MS = 150;

  // 开合跳：并拢(closed) → 打开(open, 踝距>1.7倍髋距且双手上举) → 并拢，计 1 次
  private jumpingJack(m: FrameMetrics, now: number): CounterUpdate {
    const open = m.ankleGapRatio > 1.7 && m.armsUp;
    const closed = m.ankleGapRatio < 1.25;
    if (this.state === 'closed') {
      // 重新武装（滞回）：踝距>1.45（真的跳开）才清零；其余帧（含 1.25~1.45 落地半拢
      // 缓冲带）都维持计时，满 150ms 武装；700ms 兜底：踝距<1.35 直接武装
      if (!this.armed) {
        if (m.ankleGapRatio > 1.45) {
          this.rearmSince = 0;
        } else {
          if (!this.rearmSince) this.rearmSince = now;
          if (now - this.rearmSince >= RepCounter.JACK_REARM_MS) this.armed = true;
        }
        if (!this.armed && now - this.lastRepAt > JACK_REARM_FORCE_MS && m.ankleGapRatio < 1.35) {
          this.armed = true;
          this.rearmSince = 0;
        }
      }
      // "打开"姿态需持续 OPEN_HOLD_MS 才认可（手臂挥过半途、单帧误触不计数）
      if (open) {
        if (!this.openSince) this.openSince = now;
        if (this.armed && now - this.lastRepAt > REP_COOLDOWN_MS && now - this.openSince >= OPEN_HOLD_MS) {
          this.state = 'open';
          this.phaseStart = now;
          this.completeSince = 0;
          this.minPrimary = m.ankleGapRatio;
          this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
        }
      } else {
        this.openSince = 0;
      }
      if (!this.armed) {
        return { metrics: m, phase: 'closed', feedback: '请先双脚并拢复位', feedbackLevel: 'warn' };
      }
      return {
        metrics: m, phase: 'closed',
        feedback: m.ankleGapRatio < 1.25 ? '准备，跳开！' : '手臂举过头顶 ✋',
        feedbackLevel: 'info',
      };
    }
    if (m.ankleGapRatio > this.minPrimary) {
      this.minPrimary = m.ankleGapRatio;
      this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
    }
    // 打开后超过 1.5s 没并拢（假打开/中途放弃），作废重来
    if (now - this.phaseStart > 1500 && !closed) {
      this.state = 'closed';
      this.armed = true;
      this.completeSince = 0;
      this.openSince = 0;
      return { metrics: m, phase: 'closed', feedback: '请双脚并拢后重新跳开', feedbackLevel: 'warn' };
    }
    // 并拢需持续 COMPLETE_HOLD_MS 才计数，落地小跳调整不双计
    if (closed) {
      if (!this.completeSince) this.completeSince = now;
    } else {
      this.completeSince = 0;
    }
    if (this.completeSince && now - this.completeSince >= COMPLETE_HOLD_MS && now - this.phaseStart >= 200) {
      const issues: string[] = [];
      if (this.minPrimary < 1.55) issues.push('双脚开合幅度再大一些');
      const rep: RepResult = {
        score: Math.max(60, 100 - (issues.length ? 18 : 0)),
        issues,
        durationMs: now - this.phaseStart,
        snap: this.bottomSnap ?? undefined,
      };
      this.state = 'closed';
      this.armed = false; // 并拢站稳 150ms 才重新武装
      this.rearmSince = now;
      this.openSince = 0;
      this.completeSince = 0;
      this.lastRepAt = now;
      this.bottomSnap = null;
      return { metrics: m, phase: 'rep', feedback: issues.length ? `+1 ⚠️ ${issues[0]}` : '+1 节奏很好！', feedbackLevel: issues.length ? 'warn' : 'good', rep };
    }
    return { metrics: m, phase: 'open', feedback: '并拢收回 ↓', feedbackLevel: 'info' };
  }
}

// ---------- 平板支撑：计时型检测器（与计次状态机独立，互不影响） ----------
// 视角：侧对摄像头（与俯卧撑相同）。判定肩-髋-踝是否成直线 + 躯干是否水平。
// 模型：合格姿态持续 PLANK_ENTER_MS 才"上板"开始计时；明显变形/起身持续
//       PLANK_BREAK_MS 才结束本段（单帧毛刺、短暂调整不断段）；合格秒数累计。
const PLANK_LINE_GOOD = 155;   // 肩-髋-踝夹角 ≥ 此值视为身体成直线（与俯卧撑口径一致）
const PLANK_LINE_SOFT = 145;   // 145~155 为轻度变形（提示但计时继续），<145 为明显变形
const PLANK_TORSO_DELTA = 28;  // 躯干与水平面夹角允许偏差（torsoAngle≈90，即 62~118）
const PLANK_ENTER_MS = 300;    // 合格姿态持续多久才上板
const PLANK_BREAK_MS = 700;    // 明显变形持续多久断段
const PLANK_MIN_SEG_MS = 3000; // 不足 3 秒的段不产出记录
const PLANK_HIPDY = 0.14;      // |髋-肩高差|/腿长超此值才区分塌腰/撅臀方向

export interface PlankSegment {
  durationMs: number;
  goodMs: number;
  score: number;
  issues: string[];
  snap: AngleSnapshot;
}

export interface PlankUpdate {
  metrics: FrameMetrics | null;
  phase: 'lost' | 'idle' | 'hold';
  holding: boolean;     // 是否在一段平板支撑中（含轻度变形调整）
  tickGood: boolean;    // 本帧姿态是否合格
  segMs: number;        // 当前段已持续
  segGoodMs: number;    // 当前段合格累计
  totalGoodMs: number;  // 含已结束段的全部合格保持时长
  quality: number;      // 本帧实时质量 60-100
  avgQuality: number;   // 当前段实时质量平均
  issues: string[];
  feedback: string;
  feedbackLevel: 'info' | 'good' | 'warn';
  /** 仅在一段刚结束时出现（≥3s 的段才有） */
  segment?: PlankSegment;
}

export class PlankDetector {
  private state: 'idle' | 'hold' = 'idle';
  private enterAccum = 0;   // idle 下合格姿态连续累计
  private breakAccum = 0;   // hold 下明显变形连续累计
  private segStart = 0;
  private segGoodMs = 0;
  private totalGoodMs = 0;
  private badMs = 0;        // 段内明显变形累计（评分用）
  private minLine = 180;
  private worstDy = 0;      // 段内最大|高差|及符号（定塌腰/撅臀方向）
  private snap: AngleSnapshot | null = null;
  private lastNow = 0;
  private noPoseTicks = 0;
  private qualSum = 0;      // 段内质量按 dt 加权累计
  private qualMs = 0;

  reset() {
    this.state = 'idle';
    this.enterAccum = 0; this.breakAccum = 0; this.segStart = 0;
    this.segGoodMs = 0; this.badMs = 0;
    this.minLine = 180; this.worstDy = 0; this.snap = null;
    this.lastNow = 0; this.noPoseTicks = 0;
    this.qualSum = 0; this.qualMs = 0;
  }

  /** 全部合格保持时长（含正在进行的段），页面达标判定用 */
  getTotalGoodMs() {
    return this.totalGoodMs + (this.state === 'hold' ? this.segGoodMs : 0);
  }

  private static qualityOf(m: FrameMetrics): number {
    const line = m.bodyLine;
    if (line >= PLANK_LINE_GOOD) return Math.min(100, Math.round(88 + (line - PLANK_LINE_GOOD) * 0.5));
    if (line >= PLANK_LINE_SOFT) return Math.round(70 + (line - PLANK_LINE_SOFT) * 1.2);
    return 60;
  }

  private static issuesOf(m: FrameMetrics, line: number): string[] {
    if (line >= PLANK_LINE_GOOD) return [];
    if (Math.abs(m.torsoAngle - 90) > PLANK_TORSO_DELTA) return ['身体未水平，侧对摄像头、收紧核心'];
    if (m.plankHipDy > PLANK_HIPDY) return ['塌腰下沉，收紧核心把髋顶起'];
    if (m.plankHipDy < -PLANK_HIPDY) return ['撅臀抬髋，把髋放回肩踝连线'];
    return ['肩髋踝未成一条直线，收紧核心'];
  }

  private snapshot(m: FrameMetrics): AngleSnapshot {
    return { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
  }

  private endSegment(now: number): PlankSegment | undefined {
    const durationMs = now - this.segStart;
    const issues: string[] = [];
    if (this.minLine < PLANK_LINE_GOOD) {
      issues.push(this.worstDy > 0 ? '塌腰下沉，收紧核心把髋顶起' : '撅臀抬髋，把髋放回肩踝连线');
    }
    const badRatio = durationMs > 0 ? this.badMs / durationMs : 0;
    const score = Math.max(60, Math.min(100, Math.round(100 - badRatio * 45 - (issues.length ? 14 : 0))));
    const seg: PlankSegment | undefined =
      durationMs >= PLANK_MIN_SEG_MS && this.snap
        ? { durationMs, goodMs: this.segGoodMs, score, issues, snap: this.snap }
        : undefined;
    this.totalGoodMs += this.segGoodMs;
    this.state = 'idle';
    this.enterAccum = 0; this.breakAccum = 0;
    this.segGoodMs = 0; this.badMs = 0;
    this.minLine = 180; this.worstDy = 0; this.snap = null;
    this.qualSum = 0; this.qualMs = 0;
    return seg;
  }

  update(lm: NormalizedLandmark[] | undefined, nowMs: number): PlankUpdate {
    const dt = this.lastNow ? Math.max(0, Math.min(200, nowMs - this.lastNow)) : 0;
    this.lastNow = nowMs;

    const lost = (): PlankUpdate => ({
      metrics: null, phase: this.state, holding: this.state === 'hold', tickGood: false,
      segMs: this.state === 'hold' ? nowMs - this.segStart : 0,
      segGoodMs: this.segGoodMs, totalGoodMs: this.getTotalGoodMs(),
      quality: 60, avgQuality: this.qualMs ? Math.round(this.qualSum / this.qualMs) : 0,
      issues: [], feedback: '请让全身（侧面）进入画面', feedbackLevel: 'warn',
    });

    if (!lm || lm.length < 29) {
      if (++this.noPoseTicks > LOSE_GRACE_TICKS && this.state === 'hold') {
        const segment = this.endSegment(nowMs);
        return { ...lost(), phase: 'idle', holding: false, segMs: 0, totalGoodMs: this.totalGoodMs, segment,
          feedback: segment ? '本段结束，重新侧对镜头上板' : '关键点丢失，请重新入镜' };
      }
      return lost();
    }
    const m = metricsOf(lm);
    if (!m) {
      if (++this.noPoseTicks > LOSE_GRACE_TICKS && this.state === 'hold') {
        const segment = this.endSegment(nowMs);
        return { ...lost(), phase: 'idle', holding: false, segMs: 0, totalGoodMs: this.totalGoodMs, segment,
          feedback: segment ? '本段结束，关键点被遮挡' : '关键点被遮挡，请调整角度' };
      }
      return lost();
    }
    this.noPoseTicks = 0;

    const horizontal = Math.abs(m.torsoAngle - 90) <= PLANK_TORSO_DELTA;
    const good = m.bodyLine >= PLANK_LINE_GOOD && horizontal;
    const soft = m.bodyLine >= PLANK_LINE_SOFT && horizontal;
    const quality = PlankDetector.qualityOf(m);

    // ---------- idle：等合格姿态连续保持后上板 ----------
    if (this.state === 'idle') {
      this.enterAccum = good ? this.enterAccum + dt : 0;
      if (good && this.enterAccum >= PLANK_ENTER_MS) {
        this.state = 'hold';
        this.segStart = nowMs - this.enterAccum; // 确认期本身也算保持
        this.segGoodMs = this.enterAccum;
        this.badMs = 0; this.breakAccum = 0;
        this.minLine = m.bodyLine; this.worstDy = 0;
        this.snap = this.snapshot(m);
        this.qualSum = quality * this.enterAccum; this.qualMs = this.enterAccum;
        return {
          metrics: m, phase: 'hold', holding: true, tickGood: true,
          segMs: nowMs - this.segStart, segGoodMs: this.segGoodMs, totalGoodMs: this.getTotalGoodMs(),
          quality, avgQuality: quality, issues: [],
          feedback: '保持住，注意呼吸', feedbackLevel: 'good',
        };
      }
      // 引导提示：按最主要问题给出
      const guide = !horizontal ? '侧身对镜头，前臂或直臂撑地'
        : m.bodyLine < PLANK_LINE_SOFT ? (PlankDetector.issuesOf(m, m.bodyLine)[0])
        : '摆好平板姿势，肩髋踝成直线';
      return {
        metrics: m, phase: 'idle', holding: false, tickGood: false,
        segMs: 0, segGoodMs: 0, totalGoodMs: this.totalGoodMs,
        quality, avgQuality: 0, issues: good ? [] : PlankDetector.issuesOf(m, m.bodyLine),
        feedback: guide, feedbackLevel: good ? 'info' : 'warn',
      };
    }

    // ---------- hold：段内采样 ----------
    if (m.bodyLine < this.minLine) { this.minLine = m.bodyLine; this.snap = this.snapshot(m); }
    if (Math.abs(m.plankHipDy) > Math.abs(this.worstDy)) this.worstDy = m.plankHipDy;
    this.qualSum += quality * dt; this.qualMs += dt;

    if (good) {
      this.segGoodMs += dt;
      this.breakAccum = 0;
      return this.holdView(nowMs, m, quality, true, '保持住，注意呼吸', 'good', []);
    }
    if (soft) {
      // 轻度变形：计时继续但不累计合格时长，提示调整
      this.breakAccum = 0;
      const issues = PlankDetector.issuesOf(m, m.bodyLine);
      return this.holdView(nowMs, m, quality, false, issues[0], 'warn', issues);
    }
    // 明显变形/起身：累计断段计时
    this.badMs += dt;
    this.breakAccum += dt;
    const issues = PlankDetector.issuesOf(m, m.bodyLine);
    if (this.breakAccum >= PLANK_BREAK_MS) {
      const segment = this.endSegment(nowMs);
      return {
        metrics: m, phase: 'idle', holding: false, tickGood: false,
        segMs: 0, segGoodMs: 0, totalGoodMs: this.totalGoodMs,
        quality, avgQuality: 0, issues,
        feedback: segment ? `本段结束，保持了 ${Math.round(segment.goodMs / 1000)} 秒` : '姿势未保持住，重新上板',
        feedbackLevel: 'warn', segment,
      };
    }
    return this.holdView(nowMs, m, quality, false, issues[0] + '（否则本段结束）', 'warn', issues);
  }

  private holdView(
    now: number, m: FrameMetrics, quality: number, tickGood: boolean,
    feedback: string, level: 'good' | 'warn', issues: string[],
  ): PlankUpdate {
    return {
      metrics: m, phase: 'hold', holding: true, tickGood,
      segMs: now - this.segStart,
      segGoodMs: this.segGoodMs, totalGoodMs: this.getTotalGoodMs(),
      quality, avgQuality: this.qualMs ? Math.round(this.qualSum / this.qualMs) : quality,
      issues, feedback, feedbackLevel: level,
    };
  }
}
