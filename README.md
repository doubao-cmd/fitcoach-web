# 🏋️ FitCoach — AI+体感的宿舍健身私教系统（Web 教练后台）

> **在线体验**：<https://fitcoach-web-liart.vercel.app>
>
> 基于 **MediaPipe BlazePose 端侧姿态识别**的 AI 健身私教：浏览器本地推理 33 个人体关键点，实时完成深蹲 / 俯卧撑 / 平板支撑 / 开合跳 / 弓步蹲 / 高抬腿的自动计数（或计时）、姿态偏差纠错与评分，视频数据不出本机。配套数据大屏、动作库、训练记录、学员管理、排行榜与训练周报。

配套的手机端 App（Expo，含加速度计体感计次、7 天训练计划、徽章激励体系）见同项目 `FitCoach/` 目录。

---

## ✨ 功能特性

### 🤖 AI 姿态识别（`/pose`）
- **纯端侧推理**：MediaPipe BlazePose，流畅(6MB)/均衡(9MB)/精准(29MB) 三档模型可切，GPU/CPU 自适应，支持一键导出逐次数据 CSV
- **6 个动作**：标准深蹲、俯卧撑、平板支撑、开合跳、弓步蹲、高抬腿，动作要点与常见错误实时提示
- **六道防抖状态机**：进入/完成时间窗确认、滞回复位、冷却、最低幅度门、丢骨架保护，解决"做一个计两个/卡复位"
- **实时反馈**：画面骨架 + 关节角度标注、实时角度波形、FPS/推理耗时 HUD、文字 + 语音双通道纠错、训练总结报告
- 平板支撑为独立计时检测器：塌腰/撅臀方向识别、断段保护、合格保持时长统计
- 支持 URL 预选动作：`/pose?exercise=c3`

### 📊 教练管理后台
| 页面 | 路由 | 内容 |
|------|------|------|
| 数据大屏 | `/` | KPI 环比卡 + 30 天趋势 + 动作标准度雷达 + 周目标三环 + 连续打卡榜 + 端侧引擎状态 + 实时动态流 + 时段热力图 |
| AI 识别 | `/pose` | 姿态识别训练页（见上） |
| 动作库 | `/courses` | 8 个标准动作、难度/肌群筛选搜索、动作详情弹层（要点/常见错误/呼吸节奏）、一键带参开练 |
| 训练记录 | `/sessions` | 时间线分组、姓名/动作筛选、展开查看逐次标准度折线与 AI 问题标签 |
| 学员管理 | `/students` | 学员表格、连续打卡、个人详情（PR 纪录、进步趋势、动作偏好、热力图、11 枚成就徽章） |
| 排行榜 | `/leaderboard` | 领奖台 + 次数/时长/评分/打卡四维度排名 + 周变化 |
| 训练周报 | `/report` | 周度 KPI、AI 点评、图表汇总，可打印 / 导出 PDF |

手机端可导出训练 JSON，在大屏一键导入，数据即刻汇入全部统计模块。

---

## 🧱 技术栈

- **Next.js 14**（App Router）· **React 18** · **TypeScript**
- **Tailwind CSS 3**（极光/毛玻璃/点阵等自定义设计体系）
- **ECharts**（按需动态加载）+ 自研 SVG 迷你折线/三环/雷达组件
- **MediaPipe Tasks Vision**（`@mediapipe/tasks-vision`），模型与 WASM 全部本地托管于 `public/mediapipe/`
- 纯前端、零后端依赖；Vercel 一键部署，推送 main 自动发布

## 🚀 本地开发

```powershell
npm install
npm run dev      # http://localhost:3000
```

> 摄像头功能需要安全上下文：`localhost` 或 HTTPS 均可，建议使用 Chrome / Edge。

## ✅ 质量保障

- 类型检查：`npx tsc --noEmit`
- 姿态状态机回归测试（**32 个合成运动学场景，无第三方依赖**）：

```powershell
node pose-regression.mts
```

覆盖连续计数、单帧毛刺、快速连做、顶点余动、丢帧恢复、透视压缩、平板塌腰/撅臀/断段、弓步步幅/双膝屈曲、高抬腿左右交替边沿计数等边界场景（共 44 个场景）。

## 📁 目录结构

```
app/                    # App Router 路由页
├── pose/page.tsx       # AI 识别页（检测器分派、HUD、波形、总结弹窗）
├── report/page.tsx     # 训练周报
└── ...
components/             # UI 组件与 ECharts 封装（charts/）
lib/
├── pose/
│   ├── geometry.ts     # 姿态算法：关键点数学 + RepCounter + PlankDetector
│   ├── skeleton.ts     # 骨架连线定义
│   └── oneEuro.ts      # One Euro 关键点滤波
├── mock.ts             # 演示数据
└── bridge.ts           # 手机端 JSON ↔ 后台数据模型转换层
public/mediapipe/       # 三档 .task 模型 + WASM 运行时（本地托管）
pose-regression.mts     # 算法回归测试
```

## 📄 License

MIT（大学生创新训练项目）
