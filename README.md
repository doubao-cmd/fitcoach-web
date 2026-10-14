# 🏋️ FitCoach Web — 教练管理后台

> FitCoach 教练端 | Next.js 14 + Tailwind CSS + ECharts
> 和手机端 FitCoach（Expo）配套的 Web 管理平台

## 🖥️ 页面一览

| 页面 | 路由 | 功能 |
|------|------|------|
| 📊 数据大屏 | `/` | 6 个统计卡片 + 30 天趋势折线图 + 周训练量 + 动作分布饼图 + Top10 排行榜 + 时段热力图 + 最新训练列表 |
| 🏋️ 动作库 | `/courses` | 8 个标准动作卡片 + 难度筛选 + AI 识别要点 + 目标肌群 |
| 📝 训练记录 | `/sessions` | 完整训练列表 + 展开查看每次训练的动作明细 + AI 问题反馈 |
| 👥 学员管理 | `/students` | 全部学员表格 + 活跃/流失状态 + 点击进入个人详情 |
| 👤 学员详情 | `/students/[id]` | 个人信息 + 评分进步趋势 + 历史训练 |
| 🏆 排行榜 | `/leaderboard` | Top 3 奖牌突出展示 + 完整排行榜 |

## 🚀 快速开始

```powershell
# 1. 进入项目
cd "C:\Users\cc\Desktop\FitCoach-Web"

# 2. 安装依赖（只需跑一次）
npm install

# 3. 启动开发服务器
npm run dev
```

浏览器打开 **http://localhost:3000**

## 📁 项目结构

```
FitCoach-Web/
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # 根布局（Sidebar + 内容）
│   ├── globals.css                # Tailwind 入口
│   ├── page.tsx                   # 数据大屏 /
│   ├── courses/page.tsx           # 动作库 /courses
│   ├── sessions/page.tsx          # 训练记录 /sessions
│   ├── students/
│   │   ├── page.tsx               # 学员管理 /students
│   │   └── [id]/page.tsx          # 学员详情 /students/:id
│   └── leaderboard/page.tsx       # 排行榜 /leaderboard
├── components/
│   ├── Sidebar.tsx                # 侧边栏导航
│   ├── StatCard.tsx               # 统计卡片
│   └── charts/                    # ECharts 图表（ssr:false）
│       ├── TrendLineChart.tsx     # 趋势折线图
│       ├── WeeklyMinutesChart.tsx # 周训练量
│       ├── ExercisePieChart.tsx   # 动作分布饼图
│       ├── LeaderboardBarChart.tsx# 排行榜条形图
│       └── HeatmapChart.tsx       # 时段热力图
├── lib/
│   └── mock.ts                    # Mock 数据（后续接真实 API）
├── public/                        # 静态资源
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json
```

## 📜 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 localhost:3000 |
| `npm run build` | 构建生产版本 |
| `npm start` | 运行生产版本 |
| `npm run lint` | 代码检查 |

## 🔌 后续接真实数据

所有数据集中在 `lib/mock.ts`，后续接入数据库时：

```
FitCoach 手机 App  →  训练数据上传  →  Supabase / 自建后端  →  FitCoach-Web
```

## 📄 License

MIT
