/**
 * One Euro Filter —— 关键点时序低通滤波
 *
 * 经典论文实现（Casiez et al., CHI 2012）：低速时强平滑、高速时低延迟，
 * 正好解决"静止时关键点一直抖、快速动作又不能拖影"的矛盾。
 * 对每个关键点的 x/y 各自维护一个滤波器实例。
 */

class LowPass {
  private y: number | null = null;
  push(x: number, alpha: number): number {
    if (this.y === null) this.y = x;
    else this.y = alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  last(): number | null {
    return this.y;
  }
}

class OneEuroAxis {
  private xFilter = new LowPass();
  private dxFilter = new LowPass();
  constructor(
    private minCutoff = 1.0, // Hz，越小越平滑（静止去抖更强）
    private beta = 0.02,       // 速度系数，越大快速运动延迟越小
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** t 单位毫秒 */
  filter(x: number, t: number, prevT: number | null): number {
    if (prevT === null) {
      this.xFilter.push(x, 1);
      return x;
    }
    const dt = Math.max((t - prevT) / 1000, 1e-4);
    const prevX = this.xFilter.last();
    const dx = prevX === null ? 0 : (x - prevX) / dt;
    const edx = this.dxFilter.push(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.push(x, this.alpha(cutoff, dt));
  }
}

export interface FilterablePoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** 一组关键点（如 33 个）的批量滤波器，按 index 对齐 */
export class LandmarkSmoother {
  private xs: OneEuroAxis[];
  private ys: OneEuroAxis[];
  private prevT: number | null = null;

  constructor(
    private count = 33,
    private minCutoff = 1.0,
    private beta = 0.02,
  ) {
    this.xs = Array.from({ length: count }, () => new OneEuroAxis(minCutoff, beta));
    this.ys = Array.from({ length: count }, () => new OneEuroAxis(minCutoff, beta));
  }

  /** 丢帧后重置，避免旧状态污染 */
  reset() {
    this.prevT = null;
    this.xs = Array.from({ length: this.count }, () => new OneEuroAxis(this.minCutoff, this.beta));
    this.ys = Array.from({ length: this.count }, () => new OneEuroAxis(this.minCutoff, this.beta));
  }

  /** 返回平滑后的新数组（不改原数组），t 用 performance.now() */
  filter(points: FilterablePoint[], t: number): FilterablePoint[] {
    const out = points.map((p, i) => ({
      x: this.xs[i].filter(p.x, t, this.prevT),
      y: this.ys[i].filter(p.y, t, this.prevT),
      z: p.z,
      visibility: p.visibility,
    }));
    this.prevT = t;
    return out;
  }
}
