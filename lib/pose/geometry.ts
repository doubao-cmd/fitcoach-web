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
  /** 大臂外展角（侧平举用），其余动作无此字段 */
  armRaise?: number;
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
  /** 另一侧膝关节角（弓步要看双膝） */
  kneeAngleO: number;
  /** 两侧膝角的较小/较大值（弓步：前/后膝都要弯） */
  kneeAngleMin: number;
  kneeAngleMax: number;
  /** 双踝画面距离 / 腿长：弓步的前后大步幅（侧面），站立≈0.2，弓步>0.5 */
  ankleSpanLeg: number;
  /** 左/右膝上抬比例（高抬腿）：站立≈0，大腿抬到水平≈1，无需个人基线 */
  kneeLiftL: number;
  kneeLiftR: number;
  kneeLiftMax: number;
  /** 另一侧肘关节角（弯举可取双臂较小值，支持双臂/交替弯举） */
  elbowOther: number;
  elbowAngleMin: number;
  /** 左/右大臂外展角（侧平举，正面）：手臂下垂≈0，平举≈90，上举≈160 */
  armRaiseL: number;
  armRaiseR: number;
  armRaiseMax: number;
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

/** 大臂外展角（冠状面 2D）：肩→髋方向与肩→肘方向的夹角，手臂下垂≈0、平举≈90 */
function abductionAngle(shoulder: P, elbow: P, hip: P): number {
  const down = { x: hip.x - shoulder.x, y: hip.y - shoulder.y };
  const arm = { x: elbow.x - shoulder.x, y: elbow.y - shoulder.y };
  const md = Math.hypot(down.x, down.y);
  const ma = Math.hypot(arm.x, arm.y);
  if (md < 1e-6 || ma < 1e-6) return 0;
  const cos = (down.x * arm.x + down.y * arm.y) / (md * ma);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
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
  const elbowO = v(lm, side === 'L' ? LM.elbowR : LM.elbowL);
  const wristO = v(lm, side === 'L' ? LM.wristR : LM.wristL);
  const hipO = v(lm, side === 'L' ? LM.hipR : LM.hipL);
  const kneeO = v(lm, side === 'L' ? LM.kneeR : LM.kneeL);
  const ankleL = v(lm, LM.ankleL), ankleR = v(lm, LM.ankleR);
  const ankleO = side === 'L' ? ankleR : ankleL;
  const kneeL = v(lm, LM.kneeL), kneeR = v(lm, LM.kneeR);
  const shoulderL = v(lm, LM.shoulderL), shoulderR = v(lm, LM.shoulderR);
  const elbowL = v(lm, LM.elbowL), elbowR = v(lm, LM.elbowR);
  if (!shoulder || !elbow || !wrist || !hip || !knee || !ankle || !hipO || !kneeO || !ankleL || !ankleR || !shoulderO || !ankleO || !kneeL || !kneeR || !elbowO || !wristO || !shoulderL || !shoulderR || !elbowL || !elbowR) return null;

  const kneeAngle = angleAt(hip, knee, ankle);
  const kneeAngleO = angleAt(hipO, kneeO, ankleO);
  const elbowAngle = angleAt(shoulder, elbow, wrist);
  const elbowOther = angleAt(shoulderO, elbowO, wristO);
  // 侧平举外展角（两侧分别计算，正面冠状面）
  const armRaiseL = abductionAngle(shoulderL, elbowL, v(lm, LM.hipL)!);
  const armRaiseR = abductionAngle(shoulderR, elbowR, v(lm, LM.hipR)!);

  const hipGap = Math.max(dist2d(hip, hipO), 1e-3);
  // 取两侧髋-踝距离的较大值为腿长（高抬腿时支撑直腿最长，最稳）
  const legLen = Math.max(dist2d(hip, ankle), dist2d(hipO, ankleO), 1e-3);
  const hipY = (hip.y + hipO.y) / 2;
  // 膝上抬比例：站立时膝在髋下方约半个腿长（→0），大腿抬到水平膝近髋高（→1）
  const liftOf = (kneeP: P) => Math.max(-0.2, Math.min(1, (hipY - kneeP.y) / legLen + 0.5));
  const kneeLiftL = liftOf(kneeL);
  const kneeLiftR = liftOf(kneeR);
  return {
    side,
    kneeAngle,
    kneeAngleO,
    kneeAngleMin: Math.min(kneeAngle, kneeAngleO),
    kneeAngleMax: Math.max(kneeAngle, kneeAngleO),
    elbowAngle,
    torsoAngle: torsoAngle(shoulder, hip),
    bodyLine: angleAt(shoulder, hip, ankle),
    kneeGapRatio: dist2d(knee, kneeO) / hipGap,
    ankleGapRatio: dist2d(ankleL, ankleR) / hipGap,
    ankleSpanLeg: dist2d(ankleL, ankleR) / legLen,
    armsUp: lm[LM.wristL]!.y < lm[LM.shoulderL]!.y - 0.03 && lm[LM.wristR]!.y < lm[LM.shoulderR]!.y - 0.03,
    hipY,
    legLen,
    plankHipDy: (hip.y - shoulder.y) / Math.max(dist2d(hip, ankle), 1e-3),
    kneeLiftL,
    kneeLiftR,
    kneeLiftMax: Math.max(kneeLiftL, kneeLiftR),
    elbowOther,
    elbowAngleMin: Math.min(elbowAngle, elbowOther),
    armRaiseL,
    armRaiseR,
    armRaiseMax: Math.max(armRaiseL, armRaiseR),
  };
}

// ---------- 动作配置 ----------
export const POSE_EXERCISES = [
  { id: 'c1', name: '标准深蹲', emoji: '🏋️', hint: '推荐侧对摄像头（角度最准），正对也可；全身入镜，下蹲到大腿接近水平' },
  { id: 'c2', name: '俯卧撑', emoji: '💪', hint: '侧对摄像头做俯卧撑，身体保持一条直线' },
  { id: 'c3', name: '平板支撑', emoji: '🧘', hint: '侧对摄像头，前臂（或直臂）撑地，肩-髋-踝成一条直线，尽量久地保持' },
  { id: 'c5', name: '开合跳', emoji: '🤸', hint: '正对摄像头，跳开时双脚打开、双手举过头顶' },
  { id: 'c4', name: '弓步蹲', emoji: '🦵', hint: '侧对摄像头，一腿向前迈一大步下蹲，前膝约 90°、后膝下沉，再蹬回站立' },
  { id: 'c8', name: '高抬腿', emoji: '🏃', hint: '正对摄像头，原地交替把膝盖抬到腰部高度，手臂自然摆动，保持节奏' },
  { id: 'c9', name: '二头弯举', emoji: '🦾', hint: '正对或侧对摄像头均可，大臂贴紧身体，屈肘把哑铃举到肩前，再控制下放' },
  { id: 'c10', name: '侧平举', emoji: '🙆', hint: '正对摄像头，双臂伸直向两侧抬起到大臂与地面平行，再缓慢放回体侧' },
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
  // 弓步：本次动作的最大步幅
  private maxSpan = 0;
  // 高抬腿：左右侧是否已落回（可再次触发）、当前抬升峰值、上次计数时间
  private kneeReadyL = true;
  private kneeReadyR = true;
  private peakLift = 0;
  private lastLiftAt = -REP_COOLDOWN_MS;
  // 侧平举：本次动作最大外展角、抬臂阶段最小肘角（查弯肘借力）
  private maxRaise = 0;
  private minRaiseElbow = 180;

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
    this.maxSpan = 0; this.kneeReadyL = true; this.kneeReadyR = true;
    this.peakLift = 0; this.lastLiftAt = -REP_COOLDOWN_MS;
    this.maxRaise = 0; this.minRaiseElbow = 180;
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
    this.maxSpan = 0; this.kneeReadyL = true; this.kneeReadyR = true; this.peakLift = 0;
    this.maxRaise = 0; this.minRaiseElbow = 180;
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
    if (this.exerciseId === 'c4') return this.lunge(m, nowMs);
    if (this.exerciseId === 'c8') return this.highKnee(m, nowMs);
    if (this.exerciseId === 'c9') return this.bicepCurl(m, nowMs);
    if (this.exerciseId === 'c10') return this.lateralRaise(m, nowMs);
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
    // 完成膝角放宽到 145°（与复位口径对称）：正对镜头透视压缩、未完全锁膝时站直常仅 145~150°，
    // 防双计仍由 COMPLETE_HOLD 持续确认 + 最低幅度门 + 重新武装保证
    const completionPose = knee > 145 && descent < 0.08;
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
    // 完成（并拢）阈值放宽到 1.35，与复位滞回带一致：真实落地双脚自然间距常为 1.28~1.38，
    // <1.25 会漏计；防双计仍要求重新打开(>1.7+举手且持续)再并拢并保持 COMPLETE_HOLD_MS
    const closed = m.ankleGapRatio < 1.35;
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

  // 弓步蹲（侧对镜头）：站立双脚并拢 → 一腿前迈、双膝都屈、步幅大开 → 蹬回站立，计 1 次
  // 与深蹲的区别：弓步【双膝同时屈曲】且【双脚前后大步幅】，用双侧膝角 + 双踝跨度判定
  private static LUNGE_SPAN_DOWN = 0.45;  // 进入：双踝跨度/腿长 > 此值
  private static LUNGE_SPAN_UP = 0.38;   // 完成：双脚收回（站立自然站距≈0.3）
  private static LUNGE_KMIN_DOWN = 115;  // 进入：较弯侧膝角 < 此值
  private static LUNGE_KMAX_DOWN = 140;  // 进入：另一侧膝角也要 < 此值（双膝都屈）
  private static LUNGE_COOLDOWN_MS = 350; // 弓步幅度大、复位武装已防双计，冷却可比深蹲短
  private lunge(m: FrameMetrics, now: number): CounterUpdate {
    const kmin = m.kneeAngleMin;
    const span = m.ankleSpanLeg;
    const downPose = kmin < RepCounter.LUNGE_KMIN_DOWN && m.kneeAngleMax < RepCounter.LUNGE_KMAX_DOWN && span > RepCounter.LUNGE_SPAN_DOWN;
    const upPose = kmin > 145 && span < RepCounter.LUNGE_SPAN_UP;
    if (this.state === 'top') {
      // 重新武装（滞回，与深蹲同思路）：明确下沉才清零，否则满 200ms 武装，900ms 兜底
      if (!this.armed) {
        if (kmin < 125 && span > 0.42) {
          this.rearmSince = 0;
        } else {
          if (!this.rearmSince) this.rearmSince = now;
          if (now - this.rearmSince >= REARM_HOLD_MS) this.armed = true;
        }
        if (!this.armed && now - this.lastRepAt > REARM_FORCE_MS && kmin > 148 && span < 0.36) {
          this.armed = true;
          this.rearmSince = 0;
        }
      }
      if (this.armed && now - this.lastRepAt > RepCounter.LUNGE_COOLDOWN_MS) {
        if (downPose) {
          if (!this.downSince) this.downSince = now;
          if (now - this.downSince >= DOWN_HOLD_MS) {
            this.state = 'bottom';
            this.phaseStart = now;
            this.completeSince = 0;
            this.downSince = 0;
            this.minPrimary = kmin;
            this.maxTorso = m.torsoAngle;
            this.maxSpan = span;
          }
        } else {
          this.downSince = 0;
        }
      }
      if (!this.armed) {
        return { metrics: m, phase: 'top', feedback: '请先双脚并拢站直复位', feedbackLevel: 'warn' };
      }
      return {
        metrics: m, phase: 'top',
        feedback: downPose ? '下沉中…' : '准备，向前迈腿下蹲！',
        feedbackLevel: 'info',
      };
    }

    // bottom：采样最深位
    if (kmin < this.minPrimary) {
      this.minPrimary = kmin;
      this.bottomSnap = { kneeAngle: kmin, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
    }
    this.maxTorso = Math.max(this.maxTorso, m.torsoAngle);
    this.maxSpan = Math.max(this.maxSpan, span);

    // 超过 2s 未回站立（中途放弃/一直保持），作废重来
    if (now - this.phaseStart > 2000 && !upPose) {
      this.state = 'top';
      this.armed = false;
      this.rearmSince = now;
      this.completeSince = 0;
      this.downSince = 0;
      return { metrics: m, phase: 'top', feedback: '请蹬回站立后再做下一个', feedbackLevel: 'warn' };
    }

    if (upPose) {
      if (!this.completeSince) this.completeSince = now;
    } else {
      this.completeSince = 0;
    }
    if (this.completeSince && now - this.completeSince >= COMPLETE_HOLD_MS && now - this.phaseStart >= 300) {
      // 最低幅度门：膝没怎么屈、步幅也小 → 站立调整，不计
      if (this.minPrimary >= 125 && this.maxSpan < 0.55) {
        this.state = 'top';
        this.armed = false;
        this.rearmSince = now;
        this.completeSince = 0;
        this.downSince = 0;
        return { metrics: m, phase: 'top', feedback: '幅度太小未计次，迈大步下蹲', feedbackLevel: 'warn' };
      }
      const issues: string[] = [];
      if (this.minPrimary > 100) issues.push('下蹲再深一些，前膝约 90°');
      if (this.maxSpan < 0.6) issues.push('步子再迈大一点，后膝下沉');
      if (this.maxTorso > 35) issues.push('上身保持直立，不要前倾');
      const rep: RepResult = {
        score: Math.max(60, 100 - issues.length * 15),
        issues,
        durationMs: now - this.phaseStart,
        snap: this.bottomSnap ?? undefined,
      };
      this.state = 'top';
      this.armed = false;
      this.rearmSince = now;
      this.completeSince = 0;
      this.lastRepAt = now;
      this.bottomSnap = null;
      return { metrics: m, phase: 'rep', feedback: issues.length ? `+1 ⚠️ ${issues[0]}` : '+1 弓步标准！', feedbackLevel: issues.length ? 'warn' : 'good', rep };
    }
    return { metrics: m, phase: 'bottom', feedback: '蹬回站立 ↑', feedbackLevel: 'info' };
  }

  // 高抬腿（正对镜头）：原地左右交替把膝盖抬到腰部，每次膝上抬过阈值计 1 次（左右各算一次）
  // 边沿计数：每侧抬过 KNEE_LIFT_HI 计一次，必须先落回 KNEE_LIFT_LO 才能再计，天然去抖
  private static KNEE_LIFT_HI = 0.3;
  private static KNEE_LIFT_LO = 0.16;
  private static LIFT_COOLDOWN_MS = 120;
  private highKnee(m: FrameMetrics, now: number): CounterUpdate {
    if (m.kneeLiftL < RepCounter.KNEE_LIFT_LO) this.kneeReadyL = true;
    if (m.kneeLiftR < RepCounter.KNEE_LIFT_LO) this.kneeReadyR = true;

    let lift = -1;
    if (this.kneeReadyL && m.kneeLiftL > RepCounter.KNEE_LIFT_HI && now - this.lastLiftAt > RepCounter.LIFT_COOLDOWN_MS) lift = m.kneeLiftL;
    else if (this.kneeReadyR && m.kneeLiftR > RepCounter.KNEE_LIFT_HI && now - this.lastLiftAt > RepCounter.LIFT_COOLDOWN_MS) lift = m.kneeLiftR;

    if (lift >= 0) {
      // 该侧已计，落回前不再计；交替一次后 lastLiftAt 提供跨侧冷却
      if (m.kneeLiftL >= m.kneeLiftR) this.kneeReadyL = false; else this.kneeReadyR = false;
      this.lastLiftAt = now;
      this.lastRepAt = now;
      this.peakLift = lift;
      const issues: string[] = [];
      if (lift < 0.4) issues.push('膝盖再抬高到腰部');
      const rep: RepResult = {
        score: Math.max(60, Math.min(100, Math.round(70 + ((lift - 0.3) / 0.2) * 30))),
        issues,
        durationMs: 0,
        snap: { kneeAngle: m.kneeAngleMin, elbowAngle: m.elbowAngle, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine },
      };
      return { metrics: m, phase: 'up', feedback: issues.length ? `+1 ⚠️ ${issues[0]}` : '+1 抬高！', feedbackLevel: issues.length ? 'warn' : 'good', rep };
    }
    return {
      metrics: m, phase: m.kneeLiftMax > RepCounter.KNEE_LIFT_LO ? 'up' : 'idle',
      feedback: m.kneeLiftMax < RepCounter.KNEE_LIFT_LO ? '原地交替抬膝到腰部' : '保持节奏，左右交替',
      feedbackLevel: 'info',
    };
  }

  // 二头弯举（正/侧对均可）：手臂伸直(双臂较小肘角>148) → 屈肘上举(<80) → 下放伸直，计 1 次
  // 用双臂肘角的较小值判定，双臂同步或单臂交替弯举都能计数；防抖结构与深蹲一致
  private static CURL_DOWN = 80;    // 进入：较弯侧肘角 < 此值
  private static CURL_UP = 148;     // 完成：肘角 > 此值（自然微屈 148~155 也认可）
  private bicepCurl(m: FrameMetrics, now: number): CounterUpdate {
    const flex = m.elbowAngleMin;
    if (this.state === 'top') {
      // 重新武装（滞回）：再次屈肘（<85）才清零；其余帧维持计时满 200ms 武装，900ms 兜底
      if (!this.armed) {
        if (flex < 85) {
          this.rearmSince = 0;
        } else {
          if (!this.rearmSince) this.rearmSince = now;
          if (now - this.rearmSince >= REARM_HOLD_MS) this.armed = true;
        }
        if (!this.armed && now - this.lastRepAt > REARM_FORCE_MS && flex > 152) {
          this.armed = true;
          this.rearmSince = 0;
        }
      }
      if (this.armed && now - this.lastRepAt > REP_COOLDOWN_MS) {
        if (flex < RepCounter.CURL_DOWN) {
          if (!this.downSince) this.downSince = now;
          if (now - this.downSince >= DOWN_HOLD_MS) {
            this.state = 'bottom';
            this.phaseStart = now;
            this.completeSince = 0;
            this.downSince = 0;
            this.minElbow = flex; this.maxTorso = m.torsoAngle;
            this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: flex, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
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
        feedback: flex < 95 ? '继续屈肘上举 ↑' : '大臂贴紧身体，屈肘举起',
        feedbackLevel: 'info',
      };
    }

    if (flex < this.minElbow) {
      this.minElbow = flex;
      this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: flex, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine };
    }
    this.maxTorso = Math.max(this.maxTorso, m.torsoAngle);

    // 举着超过 2s 不下放（中途放弃/一直保持），作废重来
    if (now - this.phaseStart > 2000 && flex <= RepCounter.CURL_UP) {
      this.state = 'top';
      this.armed = false;
      this.rearmSince = now;
      this.completeSince = 0;
      this.downSince = 0;
      this.bottomSnap = null;
      return { metrics: m, phase: 'top', feedback: '请下放回原位后再做下一个', feedbackLevel: 'warn' };
    }

    if (flex > RepCounter.CURL_UP) {
      if (!this.completeSince) this.completeSince = now;
    } else {
      this.completeSince = 0;
    }
    if (this.completeSince && now - this.completeSince >= COMPLETE_HOLD_MS && now - this.phaseStart >= 300) {
      // 最低幅度门：进入（<80）但最深未到 74° 属于擦阈值浅屈，中止不计次
      // （74° 以下才计；60~74° 计入但提示"弯举不到位"）
      if (this.minElbow > 74) {
        this.state = 'top';
        this.armed = false;
        this.rearmSince = now;
        this.completeSince = 0;
        this.downSince = 0;
        this.bottomSnap = null;
        return { metrics: m, phase: 'top', feedback: '幅度太小未计次，屈肘举到肩前', feedbackLevel: 'warn' };
      }
      const issues: string[] = [];
      if (this.minElbow > 60) issues.push('弯举不到位，屈肘把重量举到肩前');
      if (this.maxTorso > 30) issues.push('身体不要前后摆动借力');
      const rep: RepResult = {
        score: Math.max(60, 100 - (issues.includes('弯举不到位，屈肘把重量举到肩前') ? 22 : 0) - (issues.includes('身体不要前后摆动借力') ? 14 : 0)),
        issues,
        durationMs: now - this.phaseStart,
        snap: this.bottomSnap ?? undefined,
      };
      this.state = 'top';
      this.armed = false;
      this.rearmSince = now;
      this.completeSince = 0;
      this.downSince = 0;
      this.lastRepAt = now;
      this.bottomSnap = null;
      return { metrics: m, phase: 'rep', feedback: issues.length ? `+1 ⚠️ ${issues[0]}` : '+1 弯举标准！', feedbackLevel: issues.length ? 'warn' : 'good', rep };
    }
    return {
      metrics: m, phase: 'bottom',
      feedback: flex < 60 ? '到位，控制下放 ↓' : '再屈肘，举到肩前',
      feedbackLevel: flex < 60 ? 'good' : 'info',
    };
  }

  // 侧平举（正对镜头）：手臂在体侧(外展<30) → 向两侧抬到大臂水平(>55) → 放回，计 1 次
  // 取双臂外展角的较大值；防抖结构与深蹲一致，另检测弯肘借力与躯干侧倾
  private static RAISE_UP = 55;     // 进入：外展角 > 此值
  private static RAISE_DOWN = 30;   // 完成：外展角 < 此值
  private lateralRaise(m: FrameMetrics, now: number): CounterUpdate {
    const raise = m.armRaiseMax;
    if (this.state === 'top') {
      // 重新武装（滞回）：再次抬臂(>48)才清零；其余帧满 200ms 武装，700ms 兜底
      if (!this.armed) {
        if (raise > 48) {
          this.rearmSince = 0;
        } else {
          if (!this.rearmSince) this.rearmSince = now;
          if (now - this.rearmSince >= REARM_HOLD_MS) this.armed = true;
        }
        if (!this.armed && now - this.lastRepAt > JACK_REARM_FORCE_MS && raise < RepCounter.RAISE_DOWN) {
          this.armed = true;
          this.rearmSince = 0;
        }
      }
      if (this.armed && now - this.lastRepAt > REP_COOLDOWN_MS) {
        if (raise > RepCounter.RAISE_UP) {
          if (!this.downSince) this.downSince = now;
          if (now - this.downSince >= DOWN_HOLD_MS) {
            this.state = 'bottom';
            this.phaseStart = now;
            this.completeSince = 0;
            this.downSince = 0;
            this.maxRaise = raise; this.minRaiseElbow = m.elbowAngleMin; this.maxTorso = m.torsoAngle;
            this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngleMin, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine, armRaise: raise };
          }
        } else {
          this.downSince = 0;
        }
      }
      if (!this.armed) {
        return { metrics: m, phase: 'top', feedback: '请先放下手臂复位', feedbackLevel: 'warn' };
      }
      return {
        metrics: m, phase: 'top',
        feedback: raise > 40 ? '继续抬臂 ↑' : '双臂伸直，向两侧抬起',
        feedbackLevel: 'info',
      };
    }

    if (raise > this.maxRaise) {
      this.maxRaise = raise;
      this.bottomSnap = { kneeAngle: m.kneeAngle, elbowAngle: m.elbowAngleMin, torsoAngle: m.torsoAngle, bodyLine: m.bodyLine, armRaise: raise };
    }
    this.minRaiseElbow = Math.min(this.minRaiseElbow, m.elbowAngleMin);
    this.maxTorso = Math.max(this.maxTorso, m.torsoAngle);

    // 举着超过 2s 不放回（中途放弃/一直保持），作废重来
    if (now - this.phaseStart > 2000 && raise >= RepCounter.RAISE_DOWN) {
      this.state = 'top';
      this.armed = false;
      this.rearmSince = now;
      this.completeSince = 0;
      this.downSince = 0;
      this.bottomSnap = null;
      return { metrics: m, phase: 'top', feedback: '请放下手臂后再做下一次', feedbackLevel: 'warn' };
    }

    if (raise < RepCounter.RAISE_DOWN) {
      if (!this.completeSince) this.completeSince = now;
    } else {
      this.completeSince = 0;
    }
    if (this.completeSince && now - this.completeSince >= COMPLETE_HOLD_MS && now - this.phaseStart >= 200) {
      // 最低幅度门：进入（>55）但最高未到 60° 属于擦阈值摆臂，中止不计次
      // （60° 以上才计；60~72° 计入但提示"再抬高"）
      if (this.maxRaise < 60) {
        this.state = 'top';
        this.armed = false;
        this.rearmSince = now;
        this.completeSince = 0;
        this.downSince = 0;
        this.bottomSnap = null;
        return { metrics: m, phase: 'top', feedback: '幅度太小未计次，抬到大臂与地面平行', feedbackLevel: 'warn' };
      }
      const issues: string[] = [];
      if (this.maxRaise < 72) issues.push('抬臂再高一些，大臂与地面平行');
      if (this.minRaiseElbow < 150) issues.push('手臂伸直，不要弯肘借力');
      if (this.maxTorso > 25) issues.push('身体直立，不要侧倾借力');
      const rep: RepResult = {
        score: Math.max(60, 100 - (issues.includes('抬臂再高一些，大臂与地面平行') ? 18 : 0) - (issues.includes('手臂伸直，不要弯肘借力') ? 12 : 0) - (issues.includes('身体直立，不要侧倾借力') ? 10 : 0)),
        issues,
        durationMs: now - this.phaseStart,
        snap: this.bottomSnap ?? undefined,
      };
      this.state = 'top';
      this.armed = false;
      this.rearmSince = now;
      this.completeSince = 0;
      this.downSince = 0;
      this.lastRepAt = now;
      this.bottomSnap = null;
      return { metrics: m, phase: 'rep', feedback: issues.length ? `+1 ⚠️ ${issues[0]}` : '+1 平举标准！', feedbackLevel: issues.length ? 'warn' : 'good', rep };
    }
    return {
      metrics: m, phase: 'bottom',
      feedback: raise < 72 ? '再抬高，大臂接近水平' : '到位，控制下放 ↓',
      feedbackLevel: raise < 72 ? 'info' : 'good',
    };
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
