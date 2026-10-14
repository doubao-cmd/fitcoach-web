'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { PoseLandmarker as PoseLandmarkerType, NormalizedLandmark } from '@mediapipe/tasks-vision';
import {
  POSE_EXERCISES,
  RepCounter,
  PlankDetector,
  type PoseExerciseId,
  type RepResult,
  type FrameMetrics,
  type PlankUpdate,
  LM,
} from '@/lib/pose/geometry';
import { BODY_CONNECTIONS, BODY_LANDMARK_INDICES, VISIBILITY_MIN } from '@/lib/pose/skeleton';
import { LandmarkSmoother } from '@/lib/pose/oneEuro';
import { loadImportedData, saveImportedData } from '@/lib/bridge';
import { courses } from '@/lib/mock';
import { recordWorkout, getStreak, getWeekDots, getDay, dateKey } from '@/lib/checkin';
import { WORKOUT_PLANS, type WorkoutPlan } from '@/lib/workouts';
import PoseGuide from '@/components/PoseGuide';

type ModelTier = 'lite' | 'full' | 'heavy';
const MODEL_FILE: Record<ModelTier, string> = {
  lite: '/mediapipe/models/pose_landmarker_lite.task',
  full: '/mediapipe/models/pose_landmarker_full.task',
  heavy: '/mediapipe/models/pose_landmarker_heavy.task',
};
// 记忆用户选择的识别精度档位（答辩常用 heavy，下次进入自动恢复）
const MODEL_TIER_KEY = 'fitcoach_model_tier_v1';
const TIER_LABEL: Record<ModelTier, string> = { lite: '流畅', full: '均衡', heavy: '精准' };
const MODEL_SIZE: Record<ModelTier, number> = { lite: 6, full: 9, heavy: 29 };
function readSavedTier(): ModelTier {
  if (typeof window === 'undefined') return 'full';
  try {
    const v = window.localStorage.getItem(MODEL_TIER_KEY);
    return v === 'lite' || v === 'full' || v === 'heavy' ? v : 'full';
  } catch {
    return 'full';
  }
}

// ---------- 离线模型缓存（由 Service Worker 写入 Cache Storage） ----------
// 现代浏览器走 SIMD 版 WASM；与 FilesetResolver.forVisionTasks('/mediapipe/wasm') 实际加载一致
const WASM_RUNTIME = ['/mediapipe/wasm/vision_wasm_internal.js', '/mediapipe/wasm/vision_wasm_internal.wasm'];
async function cacheHasUrl(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const keys = await caches.keys();
    for (const k of keys) {
      const cache = await caches.open(k);
      if (await cache.match(url)) return true;
    }
  } catch {}
  return false;
}
// 流式下载并回报整体进度；响应经 Service Worker 时会被自动写入缓存
async function prefetchFiles(urls: string[], onProgress: (frac: number, mb: number, totalMb: number) => void): Promise<void> {
  let bytesTotal = 0;
  let bytesDone = 0;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败：${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    bytesTotal += len;
    if (!res.body) {
      await res.arrayBuffer();
      bytesDone += len;
      onProgress(1, bytesDone / 1048576, bytesTotal / 1048576);
      continue;
    }
    const reader = res.body.getReader();
    let fileDone = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      fileDone += value.byteLength;
      onProgress(bytesTotal ? (bytesDone + fileDone) / bytesTotal : 0, (bytesDone + fileDone) / 1048576, bytesTotal / 1048576);
    }
    bytesDone += len || fileDone;
  }
  onProgress(1, bytesDone / 1048576, bytesTotal / 1048576);
}

type AppStatus = 'idle' | 'loading' | 'ready' | 'error';

// ---------- 站位自检向导（纯函数） ----------
type GuideCheck = { key: string; label: string; ok: boolean; soft?: boolean; detail: string };
const SIDE_VIEW_EXERCISES: PoseExerciseId[] = ['c2', 'c3', 'c4'];

function buildGuideChecks(lm: NormalizedLandmark[] | undefined, luma: number, exId: PoseExerciseId): GuideCheck[] {
  const inB = (p: NormalizedLandmark | undefined) => !!p && (p.visibility ?? 1) > 0.45 && p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.99;
  const core = [11, 12, 23, 24, 25, 26, 27, 28];
  const coreOk = !!lm && core.every((i) => inB(lm[i]));
  const nose = lm?.[0];
  const ankleMaxY = lm ? Math.max(lm[27]?.y ?? 0, lm[28]?.y ?? 0) : 0;

  let body: GuideCheck;
  if (!lm || core.some((i) => (lm[i]?.visibility ?? 0) < 0.45)) {
    body = { key: 'body', label: '全身入镜', ok: false, detail: '未检测到完整人体，请退后让头到脚都入镜' };
  } else if (nose && nose.y > 0.32) {
    body = { key: 'body', label: '全身入镜', ok: false, detail: '头部太靠下，后退一步或抬高摄像头' };
  } else if (ankleMaxY < 0.66) {
    body = { key: 'body', label: '全身入镜', ok: false, detail: '看不到脚，后退一步直到双脚入镜' };
  } else if (!coreOk) {
    body = { key: 'body', label: '全身入镜', ok: false, detail: '有关键点移出画面边缘，调整站位' };
  } else {
    body = { key: 'body', label: '全身入镜', ok: true, detail: '头、躯干、双脚完整入镜' };
  }

  const hRatio = nose ? ankleMaxY - nose.y : 0;
  let dist: GuideCheck;
  if (!coreOk) dist = { key: 'dist', label: '距离适中', ok: false, detail: '待检测到人体' };
  else if (hRatio > 0.95) dist = { key: 'dist', label: '距离适中', ok: false, detail: '离镜头太近，后退约半步' };
  else if (hRatio < 0.55) dist = { key: 'dist', label: '距离适中', ok: false, detail: '离镜头太远，靠近一步' };
  else dist = { key: 'dist', label: '距离适中', ok: true, detail: `人物占画面 ${Math.round(hRatio * 100)}%，距离合适` };

  const hipMidX = lm ? (lm[23]!.x + lm[24]!.x) / 2 : 0.5;
  const off = Math.abs(hipMidX - 0.5);
  const center: GuideCheck = !coreOk
    ? { key: 'center', label: '水平居中', ok: false, detail: '待检测到人体' }
    : off > 0.2
      ? { key: 'center', label: '水平居中', ok: false, detail: '偏离画面中央，往中间站一步' }
      : { key: 'center', label: '水平居中', ok: true, detail: '位于画面中央' };

  let light: GuideCheck;
  if (luma < 0) light = { key: 'light', label: '光线充足', ok: true, detail: '无法读取画面亮度' };
  else if (luma < 55) light = { key: 'light', label: '光线充足', ok: false, detail: '画面太暗，开灯或面向窗户（顺光）' };
  else if (luma > 235) light = { key: 'light', label: '光线充足', ok: false, detail: '画面过曝，避免强光直射摄像头' };
  else light = { key: 'light', label: '光线充足', ok: true, detail: `亮度 ${Math.round(luma)}，光线良好` };

  const wantSide = SIDE_VIEW_EXERCISES.includes(exId);
  const shDx = lm ? Math.abs(lm[11]!.x - lm[12]!.x) : 0;
  let view: GuideCheck;
  if (!coreOk) {
    view = { key: 'view', label: '机位朝向', ok: false, soft: true, detail: wantSide ? '推荐侧对摄像头' : '推荐正对摄像头' };
  } else if (shDx > 0.12) {
    view = { key: 'view', label: '机位朝向', ok: !wantSide, soft: true, detail: wantSide ? '检测到正面，建议侧对镜头（关键角度更准）' : '正对镜头 ✓' };
  } else if (shDx < 0.085) {
    view = { key: 'view', label: '机位朝向', ok: wantSide, soft: true, detail: wantSide ? '侧面朝向 ✓' : '检测到侧面，建议正对镜头' };
  } else {
    view = { key: 'view', label: '机位朝向', ok: true, soft: true, detail: '斜侧 45°，可进一步调整到推荐机位' };
  }

  return [body, dist, center, light, view];
}

function sampleBrightness(video: HTMLVideoElement, canvas: HTMLCanvasElement | null): { value: number; canvas: HTMLCanvasElement | null } {
  try {
    const c = canvas ?? document.createElement('canvas');
    c.width = 40; c.height = 30;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { value: -1, canvas: c };
    ctx.drawImage(video, 0, 0, 40, 30);
    const d = ctx.getImageData(0, 0, 40, 30).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return { value: sum / (d.length / 4), canvas: c };
  } catch {
    return { value: -1, canvas };
  }
}


const exById = (id: PoseExerciseId) => POSE_EXERCISES.find((e) => e.id === id)!;

// 各动作画面下方展示的实时指标（只显示与当前动作相关的，避免开合跳时一堆无关角度）
type LiveMetric = {
  label: string;
  view: (m: FrameMetrics) => { text: string; good: boolean | null };
};
const LIVE_METRICS: Record<PoseExerciseId, LiveMetric[]> = {
  c1: [
    { label: '膝关节角', view: (m) => ({ text: `${Math.round(m.kneeAngle)}°`, good: m.kneeAngle > 160 || m.kneeAngle < 112 }) },
    { label: '躯干倾斜', view: (m) => ({ text: `${Math.round(m.torsoAngle)}°`, good: m.torsoAngle <= 45 }) },
    { label: '双膝/髋宽', view: (m) => ({ text: m.kneeGapRatio.toFixed(2), good: null }) },
    { label: '身体直线', view: (m) => ({ text: `${Math.round(m.bodyLine)}°`, good: null }) },
  ],
  c2: [
    { label: '肘关节角', view: (m) => ({ text: `${Math.round(m.elbowAngle)}°`, good: m.elbowAngle > 160 || m.elbowAngle < 105 }) },
    { label: '身体直线', view: (m) => ({ text: `${Math.round(m.bodyLine)}°`, good: m.bodyLine >= 155 }) },
    { label: '躯干倾斜', view: (m) => ({ text: `${Math.round(m.torsoAngle)}°`, good: m.torsoAngle <= 20 }) },
    { label: '膝关节角', view: (m) => ({ text: `${Math.round(m.kneeAngle)}°`, good: null }) },
  ],
  c5: [
    { label: '开脚幅度', view: (m) => ({ text: `${m.ankleGapRatio.toFixed(2)}×`, good: m.ankleGapRatio > 1.7 || m.ankleGapRatio < 1.25 }) },
    { label: '双手上举', view: (m) => ({ text: m.armsUp ? '✓ 已举' : '✗ 未举', good: m.armsUp }) },
    { label: '膝关节角', view: (m) => ({ text: `${Math.round(m.kneeAngle)}°`, good: null }) },
    { label: '躯干倾斜', view: (m) => ({ text: `${Math.round(m.torsoAngle)}°`, good: m.torsoAngle <= 20 }) },
  ],
  c4: [
    { label: '前/深膝角', view: (m) => ({ text: `${Math.round(m.kneeAngleMin)}°`, good: m.kneeAngleMin < 115 || m.kneeAngleMin > 145 }) },
    { label: '后腿膝角', view: (m) => ({ text: `${Math.round(m.kneeAngleMax)}°`, good: m.kneeAngleMax < 140 || m.kneeAngleMax > 145 }) },
    { label: '步幅/腿长', view: (m) => ({ text: m.ankleSpanLeg.toFixed(2), good: m.ankleSpanLeg > 0.45 || m.ankleSpanLeg < 0.32 }) },
    { label: '躯干倾斜', view: (m) => ({ text: `${Math.round(m.torsoAngle)}°`, good: m.torsoAngle <= 35 }) },
  ],
  c8: [
    { label: '膝抬升高度', view: (m) => ({ text: `${Math.round(m.kneeLiftMax * 100)}%`, good: m.kneeLiftMax > 0.3 }) },
    { label: '左膝', view: (m) => ({ text: `${Math.round(m.kneeLiftL * 100)}%`, good: m.kneeLiftL > 0.3 }) },
    { label: '右膝', view: (m) => ({ text: `${Math.round(m.kneeLiftR * 100)}%`, good: m.kneeLiftR > 0.3 }) },
    { label: '躯干倾斜', view: (m) => ({ text: `${Math.round(m.torsoAngle)}°`, good: m.torsoAngle <= 20 }) },
  ],
  c3: [
    { label: '身体直线', view: (m) => ({ text: `${Math.round(m.bodyLine)}°`, good: m.bodyLine >= 155 }) },
    {
      label: '髋部位置',
      view: (m) => (Math.abs(m.plankHipDy) < 0.14
        ? { text: '平直', good: true }
        : m.plankHipDy > 0 ? { text: '↓塌腰', good: false } : { text: '↑撅臀', good: false }),
    },
    { label: '肘关节角', view: (m) => ({ text: `${Math.round(m.elbowAngle)}°`, good: null }) },
    { label: '躯干水平', view: (m) => ({ text: `${Math.round(Math.abs(90 - m.torsoAngle))}°偏差`, good: Math.abs(90 - m.torsoAngle) <= 28 }) },
  ],
};

type RepLogItem = {
  n: number; time: string; exerciseId: PoseExerciseId; exerciseName: string;
  score: number; issues: string;
  kneeAngle: number | ''; elbowAngle: number | ''; torsoAngle: number | ''; bodyLine: number | '';
};

export default function PosePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerType | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelTierRef = useRef<ModelTier>(readSavedTier());
  const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother(33, 0.9, 0.03));
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const counterRef = useRef<RepCounter>(new RepCounter('c1'));
  // 平板支撑是计时型动作，使用独立检测器（不影响三个计次动作的状态机）
  const plankRef = useRef<PlankDetector>(new PlankDetector());
  const runningRef = useRef(false);
  const exerciseRef = useRef<PoseExerciseId>('c1');
  const lastUiPushRef = useRef(0);
  const poseClassRef = useRef<{ POSE_CONNECTIONS: { start: number; end: number }[] } | null>(null);

  const [status, setStatus] = useState<AppStatus>('idle');
  const [loadingText, setLoadingText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [aspect, setAspect] = useState(4 / 3);

  const [exerciseId, setExerciseId] = useState<PoseExerciseId>('c1');
  const [running, setRunning] = useState(false);
  const [reps, setReps] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{ text: string; level: 'info' | 'good' | 'warn' }>({ text: '点击「开启摄像头」开始', level: 'info' });
  const [liveMetrics, setLiveMetrics] = useState<FrameMetrics | null>(null);
  const [repFlash, setRepFlash] = useState(0);
  const [saved, setSaved] = useState(false);
  // 目标个数：0 = 自由训练
  const [goal, setGoal] = useState(10);
  const goalRef = useRef(10);
  const repsRef = useRef(0);
  // 完成提示保持到的时间戳（期间不被"再低一点"等过程提示打断）
  const holdUntilRef = useRef(0);
  const [repToast, setRepToast] = useState<{ n: number; score: number; issues: string[] } | null>(null);
  const [goalDone, setGoalDone] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 逐次动作记录（供准确率实验导出）
  const [repLog, setRepLog] = useState<RepLogItem[]>([]);
  const repLogRef = useRef<RepLogItem[]>([]);
  // 平板支撑实时状态与已完成段评分（≥3s 的段）
  const [plank, setPlank] = useState<PlankUpdate | null>(null);
  const [plankSegScores, setPlankSegScores] = useState<number[]>([]);
  const plankSegScoresRef = useRef<number[]>([]);
  const plankGoalHitRef = useRef(false);
  const lastPlankSpeakRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  // 实时性能 HUD：FPS / 推理耗时（EMA）
  const [hud, setHud] = useState({ fps: 0, inferMs: 0 });
  const fpsEmaRef = useRef(0);
  const inferEmaRef = useRef(0);
  const lastHudPushRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  // 实时角度波形采样（最近 ~10 秒）
  const waveRef = useRef<{ t: number; v: number }[]>([]);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // 训练总结弹窗
  const [summary, setSummary] = useState<null | {
    count: number; unit: string; duration: number; avg: number; scores: number[];
  }>(null);
  // 打卡刷新刻度
  const [checkinTick, setCheckinTick] = useState(0);
  const checkin = useMemo(() => {
    void checkinTick;
    return {
      streak: getStreak(),
      week: getWeekDots(),
      today: getDay(dateKey()),
    };
  }, [checkinTick]);
  // 训练前倒计时
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- 摄像头站位自检向导 ----------
  const [guide, setGuide] = useState<GuideCheck[] | null>(null);
  const [guideBlocked, setGuideBlocked] = useState(false);
  const guideRef = useRef<GuideCheck[] | null>(null);
  const lastGuidePushRef = useRef(0);
  const guideCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // 课程开练（明确意图）跳过门控；用户也可手动忽略
  const bypassGuideRef = useRef(false);

  // ---------- 跟练课程编排 ----------
  type StageResult = { name: string; emoji: string; value: number; unit: string; avg: number };
  const workoutRef = useRef<{ plan: WorkoutPlan; index: number } | null>(null);
  const stageResultsRef = useRef<StageResult[]>([]);
  // 阶段完成回调（用 ref 供检测循环调用，避免闭包陈旧）
  const stageCompleteRef = useRef<() => void>(() => {});
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [workoutStage, setWorkoutStage] = useState<{ plan: WorkoutPlan; index: number } | null>(null);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [workoutSummary, setWorkoutSummary] = useState<null | { planId: string; planName: string; results: StageResult[]; totalMin: number }>(null);
  // 语音开关
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  // 是否已有过训练（用于区分首次倒计时 / 继续）
  const startedOnceRef = useRef(false);

  const speak = useCallback((text: string) => {
    if (!soundOnRef.current) return;
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1.1;
      window.speechSynthesis.speak(u);
    } catch { /* 无语音引擎时静默 */ }
  }, []);

  const toggleSound = () => {
    setSoundOn((v) => {
      const next = !v;
      soundOnRef.current = next;
      if (!next && typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      return next;
    });
  };

  // ---------- 骨架绘制（镜像，与前置摄像头画面一致） ----------
  const drawPose = useCallback((lm: NormalizedLandmark[] | null, metrics: FrameMetrics | null) => {
    const canvas = canvasRef.current;
    const poseClass = poseClassRef.current;
    if (!canvas || !poseClass) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!lm) return;

    void poseClass;
    const visible = (i: number) => (lm[i]?.visibility ?? 1) >= VISIBILITY_MIN;
    const px = (i: number) => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H });
    ctx.lineCap = 'round';

    // 躯干/四肢连线（健身专用骨架，不含面部、手指）
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#22d3ee';
    ctx.shadowColor = 'rgba(34,211,238,0.55)';
    ctx.shadowBlur = 7;
    for (const [s, e] of BODY_CONNECTIONS) {
      if (!visible(s) || !visible(e)) continue;
      const a = px(s);
      const b = px(e);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // 头部：鼻子单点 + 连接双肩中点（不再画整张脸一堆点）
    if (visible(0) && visible(LM.shoulderL) && visible(LM.shoulderR)) {
      const ls = px(LM.shoulderL);
      const rs = px(LM.shoulderR);
      const neck = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
      const nose = px(0);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(neck.x, neck.y);
      ctx.lineTo(nose.x, nose.y);
      ctx.stroke();
    }
    // 关键点（仅身体点 + 可见点）
    ctx.shadowBlur = 0;
    for (const i of BODY_LANDMARK_INDICES) {
      if (!visible(i)) continue;
      const p = px(i);
      const joints = [LM.kneeL, LM.kneeR, LM.elbowL, LM.elbowR, LM.hipL, LM.hipR, LM.shoulderL, LM.shoulderR];
      const isJoint = (joints as number[]).includes(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 6 : isJoint ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = i === 0 ? '#7c3aed' : '#0e7490';
      ctx.stroke();
    }
    // 主动作角度标注（按动作切换：深蹲膝角 / 俯卧撑肘角 / 开合跳开脚幅度）
    if (metrics) {
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';

      if (exerciseRef.current === 'c5') {
        // 开合跳：在双脚之间标注开脚幅度（双踝间距 / 双髋间距）
        const la = px(LM.ankleL);
        const ra = px(LM.ankleR);
        const cx = (la.x + ra.x) / 2;
        const cy = Math.min(la.y, ra.y) - 30;
        const ratio = metrics.ankleGapRatio;
        const opened = ratio > 1.7 && metrics.armsUp;
        const closed = ratio < 1.25;
        const text = `${ratio.toFixed(2)}×`;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = opened || closed ? 'rgba(16,185,129,0.92)' : 'rgba(245,158,11,0.92)';
        ctx.beginPath();
        ctx.roundRect(cx - tw / 2 - 10, cy - 26, tw + 20, 34, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, cx, cy - 2);
        return;
      }

      // 高抬腿：在抬得更高的膝点标注抬升百分比
      if (exerciseRef.current === 'c8') {
        const useL = metrics.kneeLiftL >= metrics.kneeLiftR;
        const lift = useL ? metrics.kneeLiftL : metrics.kneeLiftR;
        const jointPx = px(useL ? LM.kneeL : LM.kneeR);
        const text = `${Math.round(lift * 100)}%`;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = lift > 0.3 ? 'rgba(16,185,129,0.92)' : 'rgba(245,158,11,0.92)';
        ctx.beginPath();
        ctx.roundRect(jointPx.x - tw / 2 - 10, jointPx.y - 46, tw + 20, 34, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, jointPx.x, jointPx.y - 22);
        return;
      }

      // 弓步蹲：在弯得更深的膝点标注前膝角
      if (exerciseRef.current === 'c4') {
        const sideIsDeeper = metrics.kneeAngle <= metrics.kneeAngleO;
        const deeperKnee = sideIsDeeper
          ? (metrics.side === 'L' ? LM.kneeL : LM.kneeR)
          : (metrics.side === 'L' ? LM.kneeR : LM.kneeL);
        const angle = metrics.kneeAngleMin;
        const jointPx = px(deeperKnee);
        const good = angle < 115 || angle > 145;
        const text = `${Math.round(angle)}°`;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = good ? 'rgba(16,185,129,0.92)' : 'rgba(245,158,11,0.92)';
        ctx.beginPath();
        ctx.roundRect(jointPx.x - tw / 2 - 10, jointPx.y - 46, tw + 20, 34, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, jointPx.x, jointPx.y - 22);
        return;
      }

      const side = metrics.side === 'L'
        ? { knee: LM.kneeL, elbow: LM.elbowL, hip: LM.hipL }
        : { knee: LM.kneeR, elbow: LM.elbowR, hip: LM.hipR };
      // 平板支撑：髋点标注肩-髋-踝身体直线角度
      const angle = exerciseRef.current === 'c1' ? metrics.kneeAngle
        : exerciseRef.current === 'c3' ? metrics.bodyLine : metrics.elbowAngle;
      const jointPx = px(
        exerciseRef.current === 'c1' ? side.knee : exerciseRef.current === 'c3' ? side.hip : side.elbow,
      );
      const good = exerciseRef.current === 'c1'
        ? angle > 160 || angle < 115
        : exerciseRef.current === 'c3'
          ? angle >= 155
          : angle > 160 || angle < 105;
      const text = `${Math.round(angle)}°`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = good ? 'rgba(16,185,129,0.92)' : 'rgba(245,158,11,0.92)';
      ctx.beginPath();
      ctx.roundRect(jointPx.x - tw / 2 - 10, jointPx.y - 46, tw + 20, 34, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, jointPx.x, jointPx.y - 22);
    }
  }, []);

  // ---------- 实时角度波形（最近 10 秒主动作指标） ----------
  const waveRange: Record<PoseExerciseId, { lo: number; hi: number; thr: number; label: string }> = {
    c1: { lo: 60, hi: 180, thr: 112, label: '膝角°' },
    c2: { lo: 60, hi: 180, thr: 105, label: '肘角°' },
    c3: { lo: 130, hi: 180, thr: 155, label: '身体直线°' },
    c5: { lo: 0.8, hi: 2.2, thr: 1.7, label: '开脚幅度×' },
    c4: { lo: 60, hi: 180, thr: 115, label: '前膝角°' },
    c8: { lo: 0, hi: 0.6, thr: 0.3, label: '膝抬升×' },
  };
  const pushWave = useCallback((m: FrameMetrics | null, now: number) => {
    if (!m) return;
    const id = exerciseRef.current;
    const v = id === 'c1' ? m.kneeAngle
      : id === 'c2' ? m.elbowAngle
      : id === 'c3' ? m.bodyLine
      : id === 'c4' ? m.kneeAngleMin
      : id === 'c8' ? m.kneeLiftMax
      : m.ankleGapRatio;
    const buf = waveRef.current;
    buf.push({ t: now, v });
    while (buf.length && now - buf[0].t > 10000) buf.shift();
    const cv = waveCanvasRef.current;
    if (!cv) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const { lo, hi, thr } = waveRange[id];
    const yOf = (val: number) => 6 + (1 - Math.max(0, Math.min(1, (val - lo) / (hi - lo)))) * (H - 12);
    // 阈值虚线
    ctx.strokeStyle = 'rgba(245,158,11,0.5)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yOf(thr)); ctx.lineTo(W, yOf(thr)); ctx.stroke();
    ctx.setLineDash([]);
    if (buf.length < 2) return;
    const xOf = (i: number) => (i / Math.max(1, buf.length - 1)) * W;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2f6df0';
    ctx.beginPath();
    buf.forEach((p, i) => { i === 0 ? ctx.moveTo(xOf(i), yOf(p.v)) : ctx.lineTo(xOf(i), yOf(p.v)); });
    ctx.stroke();
    const last = buf[buf.length - 1];
    ctx.fillStyle = '#2f6df0';
    ctx.beginPath(); ctx.arc(W - 2, yOf(last.v), 3, 0, Math.PI * 2); ctx.fill();
  }, []);

  // ---------- 平板支撑帧处理（计时型，独立于计次状态机） ----------
  const handlePlank = useCallback((pu: PlankUpdate, now: number) => {
    // 一段结束（≥3s）：收段分、写逐次 CSV 记录、语音播报
    if (pu.segment) {
      const seg = pu.segment;
      plankSegScoresRef.current = [...plankSegScoresRef.current, seg.score];
      setPlankSegScores(plankSegScoresRef.current);
      const item: RepLogItem = {
        n: repLogRef.current.length + 1,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        exerciseId: 'c3',
        exerciseName: exById('c3').name,
        score: seg.score,
        issues: seg.issues.join('；'),
        kneeAngle: Math.round(seg.snap.kneeAngle),
        elbowAngle: Math.round(seg.snap.elbowAngle),
        torsoAngle: Math.round(seg.snap.torsoAngle),
        bodyLine: Math.round(seg.snap.bodyLine),
      };
      repLogRef.current = [...repLogRef.current, item];
      setRepLog(repLogRef.current);
      speak(`本段保持${Math.round(seg.goodMs / 1000)}秒`);
    }
    setFeedback((f) => (f.text === pu.feedback ? f : { text: pu.feedback, level: pu.feedbackLevel }));
    // 过程纠错语音：同类提示 2.5s 内不重复（避免每秒唠叨）
    if (pu.feedbackLevel === 'warn') {
      const ls = lastPlankSpeakRef.current;
      if (pu.feedback !== ls.text && now - ls.at > 2500) {
        lastPlankSpeakRef.current = { text: pu.feedback, at: now };
        speak(pu.feedback);
      }
    }
    if (now - lastUiPushRef.current > 120) {
      lastUiPushRef.current = now;
      setPlank(pu);
      setLiveMetrics(pu.metrics);
    }
    // 按秒达标：课程流转或自由训练暂停
    if (goalRef.current > 0 && pu.totalGoodMs >= goalRef.current * 1000 && !plankGoalHitRef.current) {
      plankGoalHitRef.current = true;
      if (workoutRef.current) {
        stageCompleteRef.current();
      } else {
        runningRef.current = false;
        setRunning(false);
        setGoalDone(true);
        speak('目标达成，太棒了');
      }
    }
  }, [speak]);

  // ---------- 检测主循环 ----------
  const loop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (video && landmarker && video.readyState >= 2) {
      const canvas = canvasRef.current;
      if (canvas && video.videoWidth && canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        setAspect(video.videoWidth / video.videoHeight);
      }
      const now = performance.now();
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        // 性能采样：帧率 + 单帧推理耗时（EMA）
        if (lastFrameAtRef.current) {
          const instFps = 1000 / Math.max(1, now - lastFrameAtRef.current);
          fpsEmaRef.current = fpsEmaRef.current ? fpsEmaRef.current * 0.9 + instFps * 0.1 : instFps;
        }
        lastFrameAtRef.current = now;
        const t0 = performance.now();
        const result = landmarker.detectForVideo(video, now);
        const instMs = performance.now() - t0;
        inferEmaRef.current = inferEmaRef.current ? inferEmaRef.current * 0.9 + instMs * 0.1 : instMs;
        if (now - lastHudPushRef.current > 500) {
          lastHudPushRef.current = now;
          setHud({ fps: Math.round(fpsEmaRef.current), inferMs: Math.round(inferEmaRef.current) });
        }
        const rawLm: NormalizedLandmark[] | undefined = result.landmarks?.[0];

        // 站位自检向导（未开始/暂停时也持续刷新，约 2.5Hz）
        if (now - lastGuidePushRef.current > 400) {
          lastGuidePushRef.current = now;
          const sampled = sampleBrightness(video, guideCanvasRef.current);
          guideCanvasRef.current = sampled.canvas;
          const checks = buildGuideChecks(rawLm && rawLm.length >= 29 ? rawLm : undefined, sampled.value, exerciseRef.current);
          guideRef.current = checks;
          setGuide(checks);
          if (checks.every((c) => c.ok || c.soft)) setGuideBlocked(false);
        }

        if (rawLm && rawLm.length >= 29) {
          // One Euro 时序滤波（静止去抖、快速动作低延迟）
          const lm = smootherRef.current.filter(rawLm as unknown as Parameters<LandmarkSmoother['filter']>[0], now) as unknown as NormalizedLandmark[];
          if (runningRef.current) {
            if (exerciseRef.current === 'c3') {
              // 平板支撑：计时型检测器
              const pu = plankRef.current.update(lm, now);
              handlePlank(pu, now);
              drawPose(lm, pu.metrics);
              pushWave(pu.metrics, now);
            } else {
            // 只有训练中才驱动状态机计次
            const upd = counterRef.current.update(lm, now);
            if (upd.rep) {
              const n = repsRef.current + 1;
              repsRef.current = n;
              setReps(n);
              setScores((s) => [...s, upd.rep!.score]);
              setRepFlash(Date.now());
              // 完成提示保持 1.1 秒，期间过程提示让位
              holdUntilRef.current = now + 1100;
              setRepToast({ n, score: upd.rep.score, issues: upd.rep.issues });
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              toastTimerRef.current = setTimeout(() => setRepToast(null), 1100);
              setFeedback({
                text: upd.rep.issues.length ? `+1 ⚠️ ${upd.rep.issues[0]}` : `+1 第 ${n} 个完成，动作标准！`,
                level: upd.rep.issues.length ? 'warn' : 'good',
              });
              // 语音播报
              const ex = exById(exerciseRef.current);
              if (upd.rep.issues.length) {
                speak(`第${n}个，${upd.rep.issues[0]}`);
              } else if (n <= 3 || n % 5 === 0) {
                speak(n <= 3 ? `${n}` : `已完成${n}个`);
              }
              // 逐次记录（含最低点角度快照）
              const snap = upd.rep.snap;
              const item: RepLogItem = {
                n,
                time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                exerciseId: exerciseRef.current,
                exerciseName: ex.name,
                score: upd.rep.score,
                issues: upd.rep.issues.join('；'),
                kneeAngle: snap ? Math.round(snap.kneeAngle) : '',
                elbowAngle: snap ? Math.round(snap.elbowAngle) : '',
                torsoAngle: snap ? Math.round(snap.torsoAngle) : '',
                bodyLine: snap ? Math.round(snap.bodyLine) : '',
              };
              repLogRef.current = [...repLogRef.current, item];
              setRepLog(repLogRef.current);
              // 达标：跟练课程自动进入休息/下一阶段；自由训练则暂停
              if (goalRef.current > 0 && n >= goalRef.current) {
                if (workoutRef.current) {
                  stageCompleteRef.current();
                } else {
                  runningRef.current = false;
                  setRunning(false);
                  setGoalDone(true);
                  speak('目标达成，太棒了');
                }
              }
            } else if (now > holdUntilRef.current) {
              // 完成提示展示期间不刷过程文字，避免"站起来马上说蹲得不够低"
              setFeedback({ text: upd.feedback, level: upd.feedbackLevel });
            }
            if (now - lastUiPushRef.current > 120) {
              lastUiPushRef.current = now;
              setLiveMetrics(upd.metrics);
            }
            drawPose(lm, upd.metrics);
            pushWave(upd.metrics, now);
            }
          } else {
            // 未开始：只画骨架，不计数
            drawPose(lm, null);
          }
        } else {
          // 丢帧/无人：重置滤波器，避免重新入镜时关键点"飞"过去
          smootherRef.current.reset();
          if (runningRef.current) {
            if (exerciseRef.current === 'c3') {
              handlePlank(plankRef.current.update(undefined, now), now);
            } else {
              const upd = counterRef.current.update(undefined, now);
              setFeedback((f) => (f.text === upd.feedback ? f : { text: upd.feedback, level: upd.feedbackLevel }));
            }
          }
          setLiveMetrics(null);
          drawPose(null, null);
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [drawPose, handlePlank, pushWave]);

  // ---------- 加载指定档位模型 ----------
  const createLandmarker = useCallback(async (tier: ModelTier) => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');
    setLoadingText(`正在加载 ${TIER_LABEL[tier]} 模型（约 ${MODEL_SIZE[tier]}MB，本地托管）…`);
    const options = {
      baseOptions: {
        modelAssetPath: MODEL_FILE[tier],
        delegate: 'GPU' as const,
      },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    };
    try {
      return await vision.PoseLandmarker.createFromOptions(fileset, options);
    } catch {
      // GPU 不支持时回退 CPU
      return await vision.PoseLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    }
  }, []);

  // ---------- 切换模型档位（摄像头保持开启） ----------
  const [switchingModel, setSwitchingModel] = useState(false);
  const [modelTier, setModelTier] = useState<ModelTier>(readSavedTier);
  const switchModelTier = useCallback(async (tier: ModelTier) => {
    if (tier === modelTierRef.current || switchingModel) return;
    setSwitchingModel(true);
    try {
      const old = landmarkerRef.current;
      const next = await createLandmarker(tier);
      landmarkerRef.current = next;
      modelTierRef.current = tier;
      setModelTier(tier);
      try { window.localStorage.setItem(MODEL_TIER_KEY, tier); } catch {}
      smootherRef.current.reset();
      try { old?.close(); } catch {}
      setFeedback({ text: `已切换为${TIER_LABEL[tier]}模式`, level: 'info' });
      const vision = await import('@mediapipe/tasks-vision');
      poseClassRef.current = vision.PoseLandmarker;
    } catch (err) {
      setFeedback({ text: `模型切换失败：${err instanceof Error ? err.message : String(err)}`, level: 'warn' });
    } finally {
      setSwitchingModel(false);
    }
  }, [createLandmarker, switchingModel]);

  // ---------- 离线模型缓存状态与预下载 ----------
  const [offlineReady, setOfflineReady] = useState({ wasm: false, model: false });
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const [dlMeta, setDlMeta] = useState({ mb: 0, totalMb: 0 });
  const refreshOffline = useCallback(async () => {
    const [wasmAll, modelHit] = await Promise.all([
      Promise.all(WASM_RUNTIME.map((u) => cacheHasUrl(u))).then((rs) => rs.every(Boolean)),
      cacheHasUrl(MODEL_FILE[modelTierRef.current]),
    ]);
    setOfflineReady({ wasm: wasmAll, model: modelHit });
  }, []);
  useEffect(() => {
    refreshOffline();
  }, [refreshOffline, modelTier]);

  const prefetchOffline = useCallback(async () => {
    if (dlProgress !== null) return;
    const targets = [
      ...(offlineReady.wasm ? [] : WASM_RUNTIME),
      ...(offlineReady.model ? [] : [MODEL_FILE[modelTierRef.current]]),
    ];
    if (targets.length === 0) return;
    setDlProgress(0);
    setDlMeta({ mb: 0, totalMb: 0 });
    try {
      await prefetchFiles(targets, (frac, mb, totalMb) => {
        setDlProgress(frac);
        setDlMeta({ mb, totalMb });
      });
      // 等 Service Worker 完成 cache 写入后再刷新状态
      await new Promise((r) => setTimeout(r, 400));
      setFeedback({ text: '离线模型已预下载，断网也能开练', level: 'info' });
    } catch (err) {
      setFeedback({ text: `预下载失败：${err instanceof Error ? err.message : String(err)}`, level: 'warn' });
    } finally {
      setDlProgress(null);
      refreshOffline();
    }
  }, [dlProgress, offlineReady, refreshOffline]);

  // ---------- 开启/重开摄像头（模型只加载一次，重试时复用） ----------
  const startCamera = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    const hadModel = !!landmarkerRef.current;
    let landmarker: PoseLandmarkerType | null = null;
    try {
      // 1. 模型（档位取上次选择，无记忆时默认均衡档 full）
      if (!landmarkerRef.current) {
        landmarker = await createLandmarker(modelTierRef.current);
        landmarkerRef.current = landmarker;
        const vision = await import('@mediapipe/tasks-vision');
        poseClassRef.current = vision.PoseLandmarker;
      }

      // 2. 请求摄像头
      setLoadingText('正在请求摄像头权限…');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;

      // 用户从浏览器侧手动关闭摄像头时，给出可恢复的提示
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          if (streamRef.current === stream) {
            streamRef.current = null;
            runningRef.current = false;
            setRunning(false);
            setErrorMsg('摄像头已被关闭，点下方按钮可重新开启（训练数据保留在本页）。');
            setStatus('error');
          }
        });
      });

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      setStatus('ready');
      setFeedback({ text: '摄像头就绪，选择动作后点「开始训练」', level: 'info' });
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      // 只有本次新建的模型才释放；之前已加载的模型保留以便重试
      if (!hadModel) {
        landmarker?.close();
        landmarkerRef.current = null;
        poseClassRef.current = null;
      }
      setErrorMsg(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? '摄像头权限被拒绝，请在浏览器地址栏左侧允许摄像头后重试。'
          : err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')
            ? '没有检测到可用摄像头，请确认设备摄像头正常后重试。'
            : `初始化失败：${err instanceof Error ? err.message : String(err)}。建议使用 Chrome/Edge，并通过 HTTPS 或 localhost 访问（摄像头需要安全上下文）。`
      );
      setStatus('error');
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }, [loop]);

  // ---------- 清理 ----------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  // ---------- 计时器 ----------
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  // ---------- URL 预选动作：/pose?exercise=c3&goal=30 ----------
  const pendingWorkoutRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const ex = q.get('exercise');
    if (ex && POSE_EXERCISES.some((e) => e.id === ex) && ex !== exerciseId) {
      switchExercise(ex as PoseExerciseId);
    }
    const w = q.get('workout');
    if (w && WORKOUT_PLANS.some((p) => p.id === w)) pendingWorkoutRef.current = w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 摄像头就绪后自动开启 URL 指定的跟练课程：/pose?workout=w1
  useEffect(() => {
    if (status === 'ready' && pendingWorkoutRef.current) {
      const wid = pendingWorkoutRef.current;
      pendingWorkoutRef.current = null;
      const plan = WORKOUT_PLANS.find((p) => p.id === wid);
      if (plan) beginWorkout(plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ---------- 交互 ----------
  const switchExercise = (id: PoseExerciseId) => {
    setExerciseId(id);
    exerciseRef.current = id;
    counterRef.current = new RepCounter(id);
    setReps(0);
    repsRef.current = 0;
    setScores([]);
    setLiveMetrics(null);
    setSaved(false);
    setRepToast(null);
    setGoalDone(false);
    holdUntilRef.current = 0;
    repLogRef.current = [];
    setRepLog([]);
    // 平板支撑计时状态复位；目标单位随动作切换（计次=个 / 平板=秒）
    plankRef.current.reset();
    setPlank(null);
    plankSegScoresRef.current = [];
    setPlankSegScores([]);
    plankGoalHitRef.current = false;
    lastPlankSpeakRef.current = { text: '', at: 0 };
    waveRef.current = [];
    const gDefault = id === 'c3' ? 30 : 10;
    setGoal(gDefault);
    goalRef.current = gDefault;
    setCountdown(null);
    startedOnceRef.current = false;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setFeedback({ text: exById(id).hint, level: 'info' });
  };

  // 导出逐次动作 CSV（准确率实验用，UTF-8 BOM，Excel 直接打开）
  const exportRepCsv = () => {
    if (repLogRef.current.length === 0) return;
    const header = ['序号', '时刻', '动作', '系统标准度', '系统检出问题', '膝角(°)', '肘角(°)', '躯干角(°)', '身体直线(°)'];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = repLogRef.current.map((r) =>
      [r.n, r.time, r.exerciseName, r.score, r.issues || '标准', r.kneeAngle, r.elbowAngle, r.torsoAngle, r.bodyLine].map(esc).join(','),
    );
    const csv = '﻿' + [header.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitcoach-reps-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const changeGoal = (g: number) => {
    setGoal(g);
    goalRef.current = g;
    setGoalDone(false);
    plankGoalHitRef.current = false;
  };

  const actuallyStart = () => {
    runningRef.current = true;
    setRunning(true);
    setSaved(false);
    setGoalDone(false);
    startedOnceRef.current = true;
    setFeedback({ text: '开始！注意动作标准', level: 'good' });
    speak('开始');
  };

  const handleStartPause = () => {
    if (running) {
      runningRef.current = false;
      setRunning(false);
      setFeedback({ text: '⏸ 已暂停', level: 'warn' });
      return;
    }
    // 暂停后继续：不再倒计时；每组第一次开始走 3-2-1
    if (startedOnceRef.current || repsRef.current > 0) {
      actuallyStart();
      return;
    }
    // 站位自检门控：关键项未通过时先引导调整（课程开练/手动忽略除外）
    if (!bypassGuideRef.current) {
      const hardFail = guideRef.current?.find((c) => !c.ok && !c.soft);
      if (hardFail) {
        setGuideBlocked(true);
        setFeedback({ text: `🧭 ${hardFail.detail}`, level: 'warn' });
        speak(hardFail.detail);
        return;
      }
    }
    setFeedback({ text: exerciseId === 'c3' ? '请侧身对镜头，前臂或直臂撑地' : '请站直，全身入镜', level: 'info' });
    let n = 3;
    setCountdown(n);
    speak(String(n));
    countdownTimerRef.current = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
        speak(String(n));
      } else {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCountdown(null);
        actuallyStart();
      }
    }, 1000);
  };

  const resetSession = () => {
    runningRef.current = false;
    setRunning(false);
    setReps(0);
    repsRef.current = 0;
    setScores([]);
    setElapsed(0);
    setLiveMetrics(null);
    setSaved(false);
    setRepToast(null);
    setGoalDone(false);
    holdUntilRef.current = 0;
    repLogRef.current = [];
    setRepLog([]);
    setCountdown(null);
    startedOnceRef.current = false;
    bypassGuideRef.current = false;
    setGuideBlocked(false);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    counterRef.current = new RepCounter(exerciseId);
    plankRef.current.reset();
    setPlank(null);
    plankSegScoresRef.current = [];
    setPlankSegScores([]);
    plankGoalHitRef.current = false;
    lastPlankSpeakRef.current = { text: '', at: 0 };
    waveRef.current = [];
    setFeedback({ text: exById(exerciseId).hint, level: 'info' });
  };

  // ---------- 跟练课程编排 ----------
  const clearRestTimer = () => {
    if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
  };

  const applyStage = (i: number, autostart: boolean) => {
    const w = workoutRef.current;
    if (!w) return;
    const st = w.plan.stages[i];
    w.index = i;
    switchExercise(st.exerciseId);
    goalRef.current = st.goal;
    setGoal(st.goal);
    setWorkoutStage({ plan: w.plan, index: i });
    setRestLeft(null);
    if (autostart) {
      // 后续阶段不再走 3-2-1，短暂停顿后直接开始
      setTimeout(() => {
        if (workoutRef.current) {
          actuallyStart();
          speak(`下一个，${exById(st.exerciseId).name}`);
        }
      }, 400);
    }
  };

  const completeStage = () => {
    const w = workoutRef.current;
    if (!w) return;
    const st = w.plan.stages[w.index];
    const isPlank = st.exerciseId === 'c3';
    const value = isPlank ? Math.round(plankRef.current.getTotalGoodMs() / 1000) : repsRef.current;
    const scoreArr = isPlank ? plankSegScoresRef.current : repLogRef.current.map((r) => r.score);
    const avg = scoreArr.length ? Math.round(scoreArr.reduce((a, b) => a + b, 0) / scoreArr.length) : 0;
    const ex = exById(st.exerciseId);
    stageResultsRef.current.push({ name: ex.name, emoji: ex.emoji, value, unit: isPlank ? '秒' : '个', avg });
    runningRef.current = false;
    setRunning(false);
    setGoalDone(false);

    const next = w.index + 1;
    if (next >= w.plan.stages.length) {
      // 整套完成
      const results = [...stageResultsRef.current];
      const totalMin = Math.max(1, Math.round(elapsed / 60));
      const repsTotal = results.filter((r) => r.unit === '个').reduce((s, r) => s + r.value, 0);
      const secTotal = results.filter((r) => r.unit === '秒').reduce((s, r) => s + r.value, 0);
      recordWorkout({ reps: repsTotal, seconds: secTotal, minutes: totalMin });
      setCheckinTick((t) => t + 1);
      setWorkoutSummary({ planId: w.plan.id, planName: w.plan.name, results, totalMin });
      clearRestTimer();
      workoutRef.current = null;
      setWorkoutStage(null);
      setRestLeft(null);
      speak('课程全部完成，太棒了');
      return;
    }

    const restSec = st.restAfter ?? 0;
    if (restSec > 0) {
      speak(`休息${restSec}秒`);
      let left = restSec;
      setRestLeft(left);
      clearRestTimer();
      restTimerRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearRestTimer();
          setRestLeft(null);
          applyStage(next, true);
        } else {
          setRestLeft(left);
          if (left <= 3) speak(String(left));
        }
      }, 1000);
    } else {
      applyStage(next, true);
    }
  };
  // 每次渲染刷新为最新闭包（检测循环通过 ref 调用，避免陈旧状态）
  stageCompleteRef.current = completeStage;

  const beginWorkout = (plan: WorkoutPlan) => {
    if (status !== 'ready') return;
    bypassGuideRef.current = true; // 课程为明确意图（含3-2-1调整时间），不阻断开练
    clearRestTimer();
    stageResultsRef.current = [];
    setWorkoutSummary(null);
    setElapsed(0);
    workoutRef.current = { plan, index: 0 };
    applyStage(0, false);
    // 首阶段走 3-2-1 倒计时
    setTimeout(() => handleStartPause(), 0);
  };

  const skipRest = () => {
    const w = workoutRef.current;
    if (!w || restLeft === null) return;
    clearRestTimer();
    setRestLeft(null);
    applyStage(w.index + 1, true);
  };

  const exitWorkout = () => {
    clearRestTimer();
    runningRef.current = false;
    setRunning(false);
    workoutRef.current = null;
    setWorkoutStage(null);
    setRestLeft(null);
    resetSession();
  };

  // 完成并写入后台数据（与手机端导出 JSON 同一套格式）
  const finishAndSave = () => {
    const ex = exById(exerciseId);

    // 平板支撑：计的是合格保持秒数，不是次数
    if (exerciseId === 'c3') {
      const goodSec = Math.round(plankRef.current.getTotalGoodMs() / 1000);
      if (goodSec < 3) {
        alert('还没有检测到有效保持（至少 3 秒），侧身撑好再结束吧～');
        return;
      }
      runningRef.current = false;
      setRunning(false);
      const segAvg = plankSegScoresRef.current.length
        ? plankSegScoresRef.current.reduce((a, b) => a + b, 0) / plankSegScoresRef.current.length
        : (plank?.avgQuality ?? 80);
      const avgAccuracy = Math.round(plank?.phase === 'hold' && plank.avgQuality
        ? (segAvg * 0.4 + plank.avgQuality * 0.6)
        : segAvg);
      const aiScore = Number(Math.max(1, Math.min(5, avgAccuracy / 20)).toFixed(1));
      const session = {
        id: `pose-${Date.now()}`,
        courseId: ex.id,
        courseName: ex.name,
        emoji: ex.emoji,
        duration: elapsed,
        reps: goodSec,
        metric: 'seconds' as const,
        avgAccuracy,
        aiScore,
        date: new Date().toLocaleString('zh-CN'),
        history: plankSegScoresRef.current,
      };
      const existing = loadImportedData();
      const exp = existing ?? {
        __type: 'fitcoach-mobile-export' as const,
        __version: 1,
        exportAt: new Date().toISOString(),
        sessions: [],
      };
      saveImportedData({ ...exp, sessions: [session, ...(exp.sessions ?? [])] });
      recordWorkout({ seconds: goodSec, minutes: Math.round(elapsed / 60) });
      setCheckinTick((t) => t + 1);
      setSaved(true);
      setSummary({ count: goodSec, unit: '秒', duration: elapsed, avg: avgAccuracy, scores: plankSegScoresRef.current });
      setFeedback({ text: `✅ 已保存！累计保持 ${goodSec} 秒，平均标准度 ${avgAccuracy}%`, level: 'good' });
      return;
    }

    if (reps === 0) {
      alert('还没有检测到完整动作，先做几个再结束吧～');
      return;
    }
    runningRef.current = false;
    setRunning(false);
    const avgAccuracy = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const aiScore = Number(Math.max(1, Math.min(5, avgAccuracy / 20)).toFixed(1));
    const session = {
      id: `pose-${Date.now()}`,
      courseId: ex.id,
      courseName: ex.name,
      emoji: ex.emoji,
      duration: elapsed,
      reps,
      avgAccuracy,
      aiScore,
      date: new Date().toLocaleString('zh-CN'),
      history: scores,
    };
    const existing = loadImportedData();
    const exp = existing ?? {
      __type: 'fitcoach-mobile-export' as const,
      __version: 1,
      exportAt: new Date().toISOString(),
      sessions: [],
    };
    saveImportedData({ ...exp, sessions: [session, ...(exp.sessions ?? [])] });
    recordWorkout({ reps, minutes: Math.round(elapsed / 60) });
    setCheckinTick((t) => t + 1);
    setSaved(true);
    setSummary({ count: reps, unit: '个', duration: elapsed, avg: avgAccuracy, scores });
    setFeedback({ text: `✅ 已保存！平均标准度 ${avgAccuracy}%`, level: 'good' });
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // ---- 平板支撑（计时型）派生显示值 ----
  const isPlank = exerciseId === 'c3';
  const plankGoodSec = Math.round((plank?.totalGoodMs ?? 0) / 1000);
  const pMm = String(Math.floor(plankGoodSec / 60)).padStart(2, '0');
  const pSs = String(plankGoodSec % 60).padStart(2, '0');
  // 当前动作的教学要点（与动作库数据同源）
  const activeCourse = courses.find((c) => c.id === exerciseId);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* 标题 */}
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          🤖 AI 姿态识别 <span className="gradient-text">·</span>
          <span className="text-sm font-normal text-gray-400">MediaPipe 33 关键点实时评估</span>
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">纯浏览器端推理，视频画面不上传服务器 · 自动计次 + 关节角度纠错</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ===== 左侧：摄像头画面 ===== */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 rounded-2xl shadow-lg overflow-hidden relative animate-fade-up">
            <div className="relative w-full bg-black" style={{ aspectRatio: status === 'ready' ? `${aspect}` : '4 / 3' }}>
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover -scale-x-100"
              />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

              {/* 反馈气泡（完成提示展示期间让位给中央大字） */}
              {status === 'ready' && !repToast && (
                <div
                  key={feedback.text + repFlash}
                  className={`absolute top-4 left-1/2 -translate-x-1/2 glass-dark text-white text-sm font-semibold px-5 py-2.5 rounded-full animate-fade-up whitespace-nowrap ${
                    feedback.level === 'good' ? 'shadow-lg shadow-emerald-500/30' : feedback.level === 'warn' ? 'shadow-lg shadow-amber-500/30' : ''
                  }`}
                  style={
                    feedback.level === 'good'
                      ? { background: 'rgba(6,95,70,0.72)' }
                      : feedback.level === 'warn'
                        ? { background: 'rgba(146,64,14,0.72)' }
                        : undefined
                  }
                >
                  {feedback.text}
                </div>
              )}

              {/* 语音开关 */}
              {status === 'ready' && (
                <button
                  onClick={toggleSound}
                  className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full glass-dark text-lg flex items-center justify-center active:scale-95"
                  title={soundOn ? '关闭语音' : '开启语音'}
                >
                  {soundOn ? '🔊' : '🔇'}
                </button>
              )}

              {/* 性能 HUD：模型档位 / 帧率 / 推理耗时 */}
              {status === 'ready' && (
                <div className="absolute top-4 left-4 z-10 glass-dark rounded-lg px-2.5 py-1.5 text-white text-[10px] leading-4 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${hud.fps >= 24 ? 'bg-emerald-400' : hud.fps >= 15 ? 'bg-amber-400' : 'bg-red-400'}`} />
                    <span className="font-bold">{TIER_LABEL[modelTier]}模型</span>
                  </div>
                  <div className="text-slate-300">{hud.fps} FPS · {hud.inferMs}ms/帧 · 33点</div>
                </div>
              )}

              {/* 模型切换中 */}
              {status === 'ready' && switchingModel && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
                  <div className="bg-slate-900/90 text-white px-7 py-5 rounded-2xl text-center">
                    <p className="text-lg font-bold">正在切换识别模型…</p>
                    <p className="text-xs text-slate-300 mt-1">首次加载该档位需要几秒</p>
                  </div>
                </div>
              )}

              {/* 3-2-1 倒计时 */}
              {status === 'ready' && countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                  <div className="text-center">
                    <p className="text-white text-8xl font-black">{countdown}</p>
                    <p className="text-white/90 text-base mt-3">{isPlank ? '请侧身对镜头，前臂或直臂撑地' : '请站直，全身入镜'}</p>
                  </div>
                </div>
              )}

              {/* 完成一个动作的中央大字提示 */}
              {status === 'ready' && repToast && (
                <div key={repToast.n + '-' + repFlash} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className={`px-8 py-5 rounded-3xl text-center animate-fade-up ${
                      repToast.issues.length ? 'bg-amber-500/90' : 'bg-emerald-500/90'
                    } shadow-2xl`}
                  >
                    <p className="text-white text-4xl font-black">{repToast.issues.length ? '⚠️' : '✓'}</p>
                    <p className="text-white text-xl font-black mt-1">第 {repToast.n} 个完成</p>
                    <p className="text-white/95 text-sm font-bold mt-0.5">标准度 {repToast.score} 分</p>
                    {repToast.issues.length > 0 && (
                      <p className="text-amber-50 text-xs mt-1 max-w-[220px]">{repToast.issues[0]}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 达标横幅 */}
              {status === 'ready' && goalDone && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-teal-500 text-white text-sm font-bold px-6 py-2.5 rounded-full shadow-xl animate-fade-up whitespace-nowrap">
                  🎉 目标 {goal} {isPlank ? '秒' : '个'}达成！点右侧「完成并保存」记录成绩
                </div>
              )}

              {/* 跟练课程：阶段进度条 */}
              {status === 'ready' && workoutStage && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 glass-dark rounded-full px-4 py-1.5 text-white text-xs font-bold whitespace-nowrap flex items-center gap-2">
                  <span>{workoutStage.plan.emoji} {workoutStage.plan.name}</span>
                  <span className="text-slate-300">第 {workoutStage.index + 1}/{workoutStage.plan.stages.length} 组</span>
                  <span className="text-emerald-300">{exById(workoutStage.plan.stages[workoutStage.index].exerciseId).name}</span>
                </div>
              )}

              {/* 跟练课程：组间休息遮罩 */}
              {status === 'ready' && restLeft !== null && workoutStage && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
                  <div className="bg-slate-900/90 rounded-3xl px-10 py-8 text-center text-white shadow-2xl">
                    <p className="text-sm text-slate-300 font-semibold">组间休息</p>
                    <p className="text-7xl font-black tabular-nums my-2">{restLeft}</p>
                    <p className="text-sm mb-5">
                      下一个：{exById(workoutStage.plan.stages[workoutStage.index + 1]?.exerciseId ?? 'c1').emoji}{' '}
                      {exById(workoutStage.plan.stages[workoutStage.index + 1]?.exerciseId ?? 'c1').name}
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button onClick={skipRest} className="px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-sm font-bold active:scale-95">跳过休息</button>
                      <button onClick={exitWorkout} className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-bold active:scale-95">退出课程</button>
                    </div>
                  </div>
                </div>
              )}

              {/* 站位自检状态条（未开始时底部居中提示） */}
              {status === 'ready' && guide && !running && !startedOnceRef.current && countdown === null && restLeft === null && !workoutStage && (() => {
                const hard = guide.filter((c) => !c.soft);
                const fail = hard.find((c) => !c.ok);
                if (fail) {
                  return (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-dark text-amber-200 text-xs font-semibold px-4 py-2 rounded-full whitespace-nowrap pointer-events-none">
                      🧭 {fail.detail}
                    </div>
                  );
                }
                return (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600/85 text-white text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap pointer-events-none shadow-lg">
                    ✓ 站位自检通过，点右侧「开始训练」
                  </div>
                );
              })()}

              {/* 计次 / 计时 / 目标 */}
              {status === 'ready' && (
                <div className="absolute bottom-4 left-4 glass-dark rounded-xl px-4 py-2 text-white min-w-[110px]">
                  <p className="text-[10px] text-slate-300">
                    {goal > 0 ? `目标 ${goal} ${isPlank ? '秒' : '个'}` : isPlank ? '自由保持' : '自由训练'}
                  </p>
                  <p className={`font-bold leading-tight ${isPlank ? 'text-2xl tabular-nums' : 'text-3xl'}`}>
                    {isPlank ? `${pMm}:${pSs}` : reps}
                    {goal > 0 && <span className="text-base text-slate-400 font-semibold"> / {goal}{isPlank ? '秒' : ''}</span>}
                  </p>
                  {goal > 0 && (
                    <div className="mt-1 h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full transition-all duration-300"
                        style={{ width: isPlank
                          ? `${Math.min(100, (plankGoodSec / goal) * 100)}%`
                          : `${Math.min(100, (reps / goal) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 未开启遮罩 */}
              {status !== 'ready' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 aurora">
                  {status === 'idle' && (
                    <>
                      <span className="text-6xl mb-4 relative z-10">🤸</span>
                      <h2 className="text-white text-lg font-bold relative z-10">浏览器端实时 AI 私教</h2>
                      <p className="text-blue-100/90 text-xs mt-2 max-w-sm relative z-10 leading-5">
                        调用摄像头后，MediaPipe Pose 在本机推理出 33 个人体关键点，
                        通过关节角度算法实时判断深蹲 / 俯卧撑 / 平板支撑 / 开合跳的动作质量，自动计次或计时。
                      </p>
                      <button
                        onClick={startCamera}
                        className="relative z-10 mt-6 px-7 py-3 bg-white text-blue-700 font-bold rounded-xl hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-xl"
                      >
                        🎥 开启摄像头开始识别
                      </button>
                    </>
                  )}
                  {status === 'loading' && (
                    <div className="relative z-10">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-white/30 border-t-white animate-spin" />
                      <p className="text-white text-sm">{loadingText}</p>
                    </div>
                  )}
                  {status === 'error' && (
                    <div className="relative z-10">
                      <span className="text-5xl mb-3 block">📷</span>
                      <p className="text-white text-sm max-w-md leading-6">{errorMsg}</p>
                      <button
                        onClick={startCamera}
                        className="mt-5 px-6 py-2.5 bg-white text-blue-700 font-semibold rounded-xl hover:-translate-y-0.5 transition-all"
                      >
                        重新开启摄像头
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 实时角度指标条（按动作展示相关指标） */}
          {status === 'ready' && (
            <div className="grid grid-cols-4 gap-3 mt-3">
              {LIVE_METRICS[exerciseId].map((m) => {
                const cur = liveMetrics ? m.view(liveMetrics) : null;
                return (
                  <div key={m.label} className="bg-white rounded-xl shadow-sm p-3 text-center card-hover">
                    <p className="text-[10px] text-gray-400 mb-1">{m.label}</p>
                    <p
                      className={`text-lg font-bold ${
                        cur?.good === true ? 'text-emerald-600' : cur?.good === false ? 'text-amber-600' : 'text-gray-800'
                      }`}
                    >
                      {cur ? cur.text : '--'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== 右侧：控制面板 ===== */}
        <div className="space-y-4">
          {/* 站位自检向导 */}
          {status === 'ready' && guide && (() => {
            const hard = guide.filter((c) => !c.soft);
            const allPass = hard.every((c) => c.ok);
            const passCount = hard.filter((c) => c.ok).length;
            return (
              <div className={`rounded-2xl shadow-sm p-5 border transition-colors ${allPass ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-transparent'}`}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-gray-800">🧭 站位自检</h2>
                  <span className={`text-[11px] font-bold ${allPass ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {allPass ? '✓ 全部通过，可以开始' : `${passCount}/${hard.length} 项通过`}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">按提示调整站位，识别会明显更准</p>
                <ul className="space-y-2">
                  {guide.map((c) => (
                    <li key={c.key} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0">
                        {c.ok ? <span className="text-emerald-500">✓</span> : c.soft ? <span className="text-amber-400">!</span> : <span className="text-red-400">✗</span>}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-gray-700 leading-4">
                          {c.label}{c.soft && <span className="text-[9px] text-gray-400 font-normal ml-1">建议</span>}
                        </p>
                        <p className={`text-[10px] leading-4 ${c.ok ? 'text-gray-400' : c.soft ? 'text-amber-500' : 'text-red-500'}`}>{c.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {guideBlocked && !allPass && (
                  <button
                    onClick={() => { bypassGuideRef.current = true; setGuideBlocked(false); handleStartPause(); }}
                    className="mt-3 w-full py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-600 underline underline-offset-2"
                  >
                    环境受限？忽略自检，直接开始
                  </button>
                )}
              </div>
            );
          })()}

          {/* 识别模型档位 */}
          <div className="bg-white rounded-2xl shadow-sm p-5 card-hover">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-gray-800">识别精度</h2>
              <span className="text-[11px] text-gray-400">BlazePose 33 关键点 · 本地推理</span>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">均衡/精准档关键点更稳、抖动更小；低端电脑卡顿可切流畅档</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'lite', label: '流畅', sub: '6MB' },
                { id: 'full', label: '均衡', sub: '9MB' },
                { id: 'heavy', label: '精准', sub: '29MB' },
              ] as { id: ModelTier; label: string; sub: string }[]).map((m) => (
                <button
                  key={m.id}
                  disabled={status !== 'ready' || switchingModel}
                  onClick={() => switchModelTier(m.id)}
                  className={`py-2 rounded-xl text-center transition-all active:scale-95 disabled:opacity-50 ${
                    modelTier === m.id
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600'
                  }`}
                >
                  <span className="block text-xs font-bold">{m.label}</span>
                  <span className={`block text-[10px] ${modelTier === m.id ? 'text-violet-100' : 'text-gray-400'}`}>{m.sub}</span>
                </button>
              ))}
            </div>

            {/* 离线模型预下载：答辩场地网络不稳时提前缓存，断网仍可识别 */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-gray-600">📦 离线可用</span>
                <span className="text-[10px] text-gray-400">
                  内核 {offlineReady.wasm ? '✓' : '—'} · 当前档位 {offlineReady.model ? '✓' : '—'}
                </span>
              </div>
              {offlineReady.wasm && offlineReady.model ? (
                <p className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                  ✓「{TIER_LABEL[modelTier]}」档已离线缓存，断网也能开练
                </p>
              ) : dlProgress !== null ? (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                    <span className="font-semibold text-violet-600">正在预下载离线模型…</span>
                    <span>
                      {dlMeta.mb.toFixed(1)}/{dlMeta.totalMb.toFixed(0)}MB · {Math.round(dlProgress * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-violet-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-200"
                      style={{ width: `${Math.round(dlProgress * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={prefetchOffline}
                  disabled={status === 'loading'}
                  className="w-full py-2 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-[11px] font-bold transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  ⬇ 预下载「{TIER_LABEL[modelTier]}」离线包（约 {MODEL_SIZE[modelTier] + (offlineReady.wasm ? 0 : 13)}MB）
                </button>
              )}
            </div>
          </div>

          {/* 跟练课程 */}
          <div className="bg-white rounded-2xl shadow-sm p-5 card-hover">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-gray-800">🎯 跟练课程</h2>
              <span className="text-[11px] text-gray-400">自动切换 · 组间休息</span>
            </div>
            {!workoutStage ? (
              <>
                <p className="text-[11px] text-gray-400 mb-3">{status === 'ready' ? '选一套课程，跟着节奏练完全程' : '开启摄像头后即可开始课程'}</p>
                <div className="space-y-2">
                  {WORKOUT_PLANS.map((p) => (
                    <button
                      key={p.id}
                      disabled={status !== 'ready'}
                      onClick={() => beginWorkout(p)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left bg-gradient-to-r from-orange-50 to-amber-50 ring-1 ring-orange-100 hover:ring-orange-300 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <span className="text-2xl">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800">{p.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{p.desc}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-bold">{p.level}</span>
                        <span className="block text-[10px] text-gray-400 mt-1">{p.stages.length} 组 · {p.estMinutes}分</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-800">{workoutStage.plan.emoji} {workoutStage.plan.name}</p>
                  <button onClick={exitWorkout} className="text-[11px] text-red-500 font-semibold hover:underline">退出课程</button>
                </div>
                <ol className="space-y-1.5">
                  {workoutStage.plan.stages.map((s, i) => {
                    const ex = exById(s.exerciseId);
                    const done = i < workoutStage.index;
                    const cur = i === workoutStage.index;
                    return (
                      <li key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                        cur ? 'bg-blue-600 text-white font-bold' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'
                      }`}>
                        <span className="w-4 text-center">{done ? '✓' : i + 1}</span>
                        <span className="flex-1">{ex.emoji} {ex.name}</span>
                        <span className={cur ? 'text-blue-100' : 'text-gray-400'}>{s.goal}{s.exerciseId === 'c3' ? '秒' : '个'}</span>
                        {i < workoutStage.plan.stages.length - 1 && <span className={cur ? 'text-blue-100' : 'text-gray-300'}>·休{s.restAfter}s</span>}
                      </li>
                    );
                  })}
                </ol>
                {restLeft === null && (
                  <p className="text-[11px] text-gray-400 mt-2 text-center">完成当前目标自动进入下一动作</p>
                )}
              </div>
            )}
          </div>

          {/* 动作选择 */}
          <div className="bg-white rounded-2xl shadow-sm p-5 card-hover">
            <h2 className="text-sm font-bold text-gray-800 mb-3">选择训练动作{workoutStage && <span className="text-[11px] text-orange-500 font-normal ml-2">课程进行中已锁定</span>}</h2>
            <div className="space-y-2">
              {POSE_EXERCISES.map((ex) => (
                <button
                  key={ex.id}
                  disabled={status !== 'ready' || running || !!workoutStage}
                  onClick={() => switchExercise(ex.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                    exerciseId === ex.id
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200'
                      : 'bg-gray-50 text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  <span className="text-2xl">{ex.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold">{ex.name}</p>
                    <p className={`text-[11px] ${exerciseId === ex.id ? 'text-blue-100' : 'text-gray-400'}`}>{ex.hint}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 动作要点教学卡 */}
          {activeCourse && (
            <div className="bg-white rounded-2xl shadow-sm p-5 card-hover animate-fade-up" key={exerciseId}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-800">📖 动作要点 · {activeCourse.name}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  activeCourse.difficulty === '入门' ? 'bg-green-100 text-green-700'
                    : activeCourse.difficulty === '进阶' ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                }`}>{activeCourse.difficulty}</span>
              </div>
              <ul className="space-y-1.5 mb-3">
                {activeCourse.points.map((p, i) => (
                  <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1.5 leading-4">
                    <span className="text-blue-500 font-bold">{i + 1}.</span><span>{p}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1 pt-2.5 border-t border-gray-100">
                {activeCourse.targetMuscles.map((m) => (
                  <span key={m} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{m}</span>
                ))}
                <span className="text-[10px] text-gray-400 ml-auto self-center">🔥 {activeCourse.calories} kcal</span>
              </div>
            </div>
          )}

          {/* 动作骨架示范 */}
          <PoseGuide exerciseId={exerciseId} />

          {/* 目标 + 数据卡 */}
          <div className="bg-white rounded-2xl shadow-sm p-5 card-hover">
            {/* 目标选择：计次动作为「个」，平板支撑为「秒」 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-gray-800">训练目标</h2>
                {goal > 0 && (
                  <span className={`text-xs font-bold ${
                    (isPlank ? plankGoodSec : reps) >= goal ? 'text-emerald-500' : 'text-blue-500'
                  }`}>
                    {(isPlank ? plankGoodSec : reps) >= goal
                      ? '已达成 🎉'
                      : `还差 ${goal - (isPlank ? plankGoodSec : reps)} ${isPlank ? '秒' : '个'}`}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                {(isPlank ? [20, 30, 45, 60, 0] : [5, 10, 15, 20, 0]).map((g) => (
                  <button
                    key={g}
                    disabled={running || !!workoutStage}
                    onClick={() => changeGoal(g)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                      goal === g
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    {g === 0 ? '自由' : `${g}${isPlank ? '秒' : '个'}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-px bg-gray-100 mb-4" />
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400">{isPlank ? '本组用时' : '训练时长'}</p>
                <p className="text-3xl font-bold text-gray-800 tabular-nums">{mm}:{ss}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">{isPlank ? '保持合格时长' : '平均标准度'}</p>
                {isPlank ? (
                  <p className="text-3xl font-bold text-gray-800 tabular-nums">
                    {pMm}:<span className="text-3xl">{pSs}</span>
                  </p>
                ) : (
                  <p className={`text-3xl font-bold ${avg == null ? 'text-gray-300' : avg >= 85 ? 'text-emerald-500' : avg >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                    {avg == null ? '--' : avg}<span className="text-sm">%</span>
                  </p>
                )}
              </div>
            </div>

            {/* 最近评分：计次动作=每个动作分；平板=每段分；平板另显示实时平均 */}
            {isPlank ? (
              (plankSegScores.length > 0 || (plank?.phase === 'hold' && plank.avgQuality)) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-4 max-h-20 overflow-auto">
                  {plank?.phase === 'hold' && plank.avgQuality > 0 && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ring-1 ${
                      plank.avgQuality >= 85 ? 'bg-emerald-50 text-emerald-600 ring-emerald-200'
                        : plank.avgQuality >= 70 ? 'bg-amber-50 text-amber-600 ring-amber-200'
                        : 'bg-red-50 text-red-600 ring-red-200'
                    }`}>
                      本段 {plank.avgQuality}
                    </span>
                  )}
                  {plankSegScores.slice(-11).map((s, i) => (
                    <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      s >= 85 ? 'bg-emerald-50 text-emerald-600' : s >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                    }`}>
                      段{s}
                    </span>
                  ))}
                </div>
              )
            ) : scores.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4 max-h-20 overflow-auto">
                {scores.slice(-12).map((s, i) => (
                  <span
                    key={i}
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      s >= 85 ? 'bg-emerald-50 text-emerald-600' : s >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {status === 'ready' && (
              <div className="space-y-2">
                {workoutStage ? (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={handleStartPause}
                        disabled={restLeft !== null}
                        className="flex-1 py-3 rounded-xl font-bold text-white transition-all active:scale-95 disabled:opacity-50 bg-amber-500 hover:bg-amber-600"
                      >
                        {running ? '⏸ 暂停课程' : restLeft !== null ? '组间休息中…' : '▶ 继续'}
                      </button>
                      <button
                        onClick={exitWorkout}
                        className="px-4 py-3 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-900 transition-all active:scale-95"
                      >
                        退出
                      </button>
                    </div>
                    {restLeft !== null && (
                      <button onClick={skipRest} className="w-full py-2 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                        ⏭ 跳过休息，立即开始下一动作
                      </button>
                    )}
                  </>
                ) : (
                <>
                <div className="flex gap-2">
                  <button
                    onClick={handleStartPause}
                    className={`flex-1 py-3 rounded-xl font-bold text-white transition-all active:scale-95 ${
                      running ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'
                    }`}
                  >
                    {running ? '⏸ 暂停'
                      : reps > 0 || elapsed > 0 || (isPlank && plankGoodSec > 0) ? '▶ 继续'
                      : isPlank ? '▶ 开始保持' : '▶ 开始训练'}
                  </button>
                  <button
                    onClick={finishAndSave}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-900 transition-all active:scale-95"
                  >
                    ✓ 完成并保存
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={resetSession} className="flex-1 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors text-left">
                    ↺ 重新开始本组
                  </button>
                  {repLog.length > 0 && (
                    <button
                      onClick={exportRepCsv}
                      className="px-3 py-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                      title="导出每个动作的系统评分与最低点角度，用于准确率实验"
                    >
                      📥 逐次数据 CSV
                    </button>
                  )}
                </div>
                {saved && (
                  <Link
                    href="/"
                    className="block text-center py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-90 transition-opacity"
                  >
                    📊 去数据大屏查看本次记录 →
                  </Link>
                )}
                </>
                )}
              </div>
            )}
          </div>

          {/* 今日打卡 / 周期目标 */}
          <div className="bg-white rounded-2xl shadow-sm p-5 card-hover">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-800">🔥 每日打卡</h2>
              <span className={`text-xs font-bold ${checkin.streak > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                连续 {checkin.streak} 天
              </span>
            </div>
            <div className="flex items-center justify-between mb-3">
              {['一', '二', '三', '四', '五', '六', '日'].map((w, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    checkin.week[i] ? 'bg-gradient-to-br from-orange-400 to-red-400 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>{w}</span>
                </div>
              ))}
            </div>
            {checkin.today ? (
              <div className="rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-2.5 flex items-center justify-between">
                <span>✅ 今日已打卡</span>
                <span>{checkin.today.sessions} 组 · {checkin.today.minutes} 分钟{checkin.today.reps > 0 ? ` · ${checkin.today.reps} 个` : ''}{checkin.today.seconds > 0 ? ` · ${checkin.today.seconds} 秒平板` : ''}</span>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 text-gray-400 text-xs px-3 py-2.5 text-center">
                完成一次训练并点「✓ 完成并保存」即打卡
              </div>
            )}
          </div>

          {/* 实时角度波形 */}
          {status === 'ready' && (
            <div className="bg-white rounded-2xl shadow-sm p-5 card-hover">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-gray-800">〰️ 实时角度波形</h2>
                <span className="text-[10px] text-gray-400">{waveRange[exerciseId].label} · 近 10 秒 · 虚线为达标线</span>
              </div>
              <canvas ref={waveCanvasRef} width={300} height={72} className="w-full h-[72px] rounded-lg bg-slate-50" />
            </div>
          )}

          {/* 算法说明（答辩用） */}
          <div className="bg-white rounded-2xl shadow-sm p-5 card-hover">
            <h2 className="text-sm font-bold text-gray-800 mb-2">🧮 评估原理</h2>
            <ul className="text-[11px] text-gray-500 space-y-1.5 leading-5">
              <li>① <b>33 关键点</b>：MediaPipe BlazePose（流畅/均衡/精准三档可切，GPU/CPU 自适应）</li>
              <li>② <b>关节角度</b>：向量点积计算髋-膝-踝 / 肩-肘-腕夹角</li>
              <li>③ <b>状态机计次</b>：角度越过阈值并回位才算 1 次，带滞回防抖</li>
              <li>④ <b>质量扣分</b>：蹲深不足 -22、躯干前倾 -16、膝盖内扣 -10 等</li>
              <li>⑤ <b>数据闭环</b>：保存后进入数据大屏 / 训练记录 / 排行榜统计</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ===== 训练总结弹窗 ===== */}
      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4" onClick={() => setSummary(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aurora px-6 py-7 text-center text-white relative">
              <p className="text-5xl relative z-10 mb-2">🎉</p>
              <h2 className="text-xl font-black relative z-10">训练完成！</h2>
              <p className="text-xs text-blue-100 relative z-10 mt-1">{exById(exerciseId).name}</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-3 text-center mb-5">
                <div className="bg-blue-50 rounded-xl py-3">
                  <p className="text-xl font-black text-blue-600 tabular-nums">{summary.count}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{summary.unit}</p>
                </div>
                <div className="bg-purple-50 rounded-xl py-3">
                  <p className="text-xl font-black text-purple-600 tabular-nums">
                    {String(Math.floor(summary.duration / 60)).padStart(2, '0')}:{String(summary.duration % 60).padStart(2, '0')}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">用时</p>
                </div>
                <div className={`${summary.avg >= 85 ? 'bg-emerald-50' : summary.avg >= 70 ? 'bg-amber-50' : 'bg-red-50'} rounded-xl py-3`}>
                  <p className={`text-xl font-black tabular-nums ${summary.avg >= 85 ? 'text-emerald-600' : summary.avg >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                    {summary.avg}<span className="text-xs">%</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">平均标准度</p>
                </div>
              </div>

              {summary.scores.length > 0 && (
                <div className="mb-5">
                  <p className="text-[11px] font-semibold text-gray-500 mb-2">
                    {isPlank ? '各段标准度' : '逐次标准度'}（{summary.scores.length} 条）
                  </p>
                  <div className="flex items-end gap-1 h-16">
                    {summary.scores.slice(-24).map((s, i) => (
                      <div key={i} className="flex-1 flex flex-col justify-end h-full">
                        <div
                          className={`rounded-t ${s >= 85 ? 'bg-emerald-400' : s >= 70 ? 'bg-amber-400' : 'bg-red-400'} transition-all`}
                          style={{ height: `${Math.max(6, s)}%` }}
                          title={`${s}分`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-center text-[11px] text-gray-400 mb-4">
                {summary.avg >= 90 ? '🏅 动作非常标准，继续保持！' : summary.avg >= 75 ? '💪 整体不错，注意 AI 提示的细节' : '🌱 放慢节奏，先把动作做标准'}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => { resetSession(); setSummary(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  🔁 再来一组
                </button>
                <Link
                  href="/"
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white text-center bg-slate-800 hover:bg-slate-900 transition-colors"
                >
                  📊 查看数据
                </Link>
                <button
                  onClick={() => setSummary(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 跟练课程整套总结弹窗 ===== */}
      {workoutSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4" onClick={() => setWorkoutSummary(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="aurora px-6 py-7 text-center text-white">
              <p className="text-5xl mb-2 relative z-10">🏆</p>
              <h2 className="text-xl font-black relative z-10">课程完成！</h2>
              <p className="text-xs text-blue-100 mt-1 relative z-10">{workoutSummary.planName} · {workoutSummary.totalMin} 分钟 · 已打卡</p>
            </div>
            <div className="p-6">
              <div className="space-y-2 mb-5">
                {workoutSummary.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                    <span className="text-lg">{r.emoji}</span>
                    <span className="flex-1 text-sm font-semibold text-gray-700">{r.name}</span>
                    <span className="text-sm font-black text-blue-600 tabular-nums">{r.value}<span className="text-[10px] text-gray-400 ml-0.5">{r.unit}</span></span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.avg >= 85 ? 'bg-emerald-100 text-emerald-700' : r.avg >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {r.avg || '--'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-center text-[11px] text-gray-400 mb-4">
                {(() => {
                  const a = workoutSummary.results.reduce((s, r) => s + r.avg, 0) / Math.max(1, workoutSummary.results.length);
                  return a >= 90 ? '🏅 整套动作都很标准，状态出色！' : a >= 75 ? '💪 完成得不错，注意 AI 提示的细节' : '🌱 下次放慢节奏，把每个动作做标准';
                })()}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const p = WORKOUT_PLANS.find((x) => x.id === workoutSummary.planId);
                    setWorkoutSummary(null);
                    if (p) resetSession(), beginWorkout(p);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  🔁 再练一次
                </button>
                <Link href="/" className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white text-center bg-slate-800 hover:bg-slate-900 transition-colors">
                  📊 查看数据
                </Link>
                <button onClick={() => { resetSession(); setWorkoutSummary(null); }} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
