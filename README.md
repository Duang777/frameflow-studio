# Frameflow Studio

<p align="center">
  <a href="https://github.com/Duang777/frameflow-studio/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-1A1A1A.svg"></a>
  <a href="https://github.com/Duang777/frameflow-studio/actions/workflows/ci.yml"><img alt="Build" src="https://github.com/Duang777/frameflow-studio/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-D4AF37.svg">
</p>

<p align="center">
  <strong>From one seed idea to production-ready storyboards, visuals, and sequence videos.</strong><br/>
  <strong>从一句镜头种子，快速推进到可执行分镜、分镜图与串联成片。</strong>
</p>

---

## 中文介绍

### 项目定位

**Frameflow Studio** 是一个面向导演、编剧、广告创意和短视频团队的分镜工作台。  
它强调“创意到执行”的完整链路，而不是单点文本生成：

- 生成分镜：文本/图片 seed 一键拓展多条可拍分镜
- 继续生产：单条出图、单条视频、多条串联成片
- 组织与复盘：项目/章节管理、任务队列、历史恢复、批量工作流
- 长期可维护：前后端分离 + API 代理 + SQLite 持久化

### 界面预览

Frameflow Studio 采用「主入口页 + 生产工作台」双层结构：先明确创作路径，再进入高频生产与迭代。

<table>
  <tr>
    <td width="50%">
      <strong>主入口页</strong><br/>
      明确价值、流程与进入路径，降低首次使用门槛。<br/><br/>
      <img alt="Frameflow Main Entrance" src="docs/screenshots/main-entrance.png" />
    </td>
    <td width="50%">
      <strong>Studio 工作台</strong><br/>
      面向生产：输入、拓展、筛选、出图、成片、队列与历史协同。<br/><br/>
      <img alt="Frameflow Studio Workspace" src="docs/screenshots/studio-overview.png" />
    </td>
  </tr>
</table>

### 核心能力

- 分镜拓展：`6/8/10` 条可配置输出
- 模式库：广告片 / 剧情片 / 短视频 / B-roll
- 单条再生成（Remix）与快速迭代
- 单分镜生图 / 生视频（支持失败重试）
- 串联成片（Video Composer）：
  - 镜头顺序编辑、恢复原顺序
  - 图像参与策略 `all | keyframes | first_last | text_only`
  - 配置摘要、历史一键套用、失败重试
- Workflow Hub 弹窗中心：`Batch / Queue / History / Advanced`
- URL 状态记忆：队列筛选与 Hub Tab 刷新后保留
- 项目级持久化：`sequence_videos` 按项目/章节存储

### 技术架构

- 前端：React 19 + Vite + Tailwind CSS
- 后端：Node.js + Express（代理模型请求，保护 API Key）
- 存储：SQLite（`server/data/storyboard.sqlite`）

核心数据表：
- `projects`
- `chapters`
- `shots`
- `shot_images`
- `shot_videos`
- `sequence_videos`
- `history_entries`

### 快速开始

1. 安装依赖

```bash
npm install
```

2. 复制环境变量

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

3. 最小配置

```env
GEMINI_API_KEY=your_api_key
```

4. 启动

```bash
npm run dev
```

默认地址：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`
- Studio：`http://localhost:5173/studio`

5. 健康检查

访问 `http://localhost:8787/api/health`

---

## English

### Overview

**Frameflow Studio** is an editorial-grade storyboard production workspace for creators who need more than text generation.

It helps teams move from idea to execution:

- Expand a text/image seed into structured shot candidates
- Generate per-shot images and videos
- Compose multiple shots into one continuous sequence video
- Operate with project/chapter organization, queue tracking, and recoverable history

### Key Features

- Storyboard expansion with configurable shot count (`6/8/10`)
- Preset mode library (Ad / Drama / Short Video / B-roll)
- Shot-level remix and rapid iteration
- Shot image and shot video generation with retry
- Sequence Video Composer:
  - shot ordering, remove, restore original order
  - reference image policy (`all`, `keyframes`, `first_last`, `text_only`)
  - reusable config presets and history replay
- Workflow Hub modal (`Batch / Queue / History / Advanced`)
- URL state memory for queue filter and hub tab
- Project-scoped persistence for sequence video history (`sequence_videos`)

### Tech Stack

- Frontend: React 19 + Vite + Tailwind CSS
- Backend: Node.js + Express API proxy
- Storage: SQLite

### API Highlights

- `GET /api/health`
- `GET /api/modes`
- `GET /api/workspace/bootstrap`
- `POST /api/tasks/expand`
- `POST /api/tasks/generate-image`
- `POST /api/tasks/generate-video`
- `GET /api/projects/:projectId/chapters/:chapterId/sequence-videos`
- `POST /api/projects/:projectId/chapters/:chapterId/sequence-videos`
- `DELETE /api/projects/:projectId/chapters/:chapterId/sequence-videos/:id`

---

## Repository Structure

```text
.
├─ src/
│  ├─ components/
│  ├─ pages/
│  ├─ services/
│  └─ lib/
├─ server/
│  ├─ index.js
│  ├─ taskManager.js
│  ├─ historyStore.js
│  ├─ projectStore.js
│  ├─ modes.js
│  └─ utils.js
├─ docs/
│  └─ screenshots/
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ .env.example
├─ LICENSE
└─ README.md
```

---

## Scripts

- `npm run dev` : run client + server in development
- `npm run dev:client` : run frontend only
- `npm run dev:server` : run backend only
- `npm run build` : build frontend
- `npm run preview` : preview build output
- `npm run start` : start backend in production mode

---

## Roadmap

- Redis-backed queue for multi-instance reliability
- Team collaboration and user-level permissions
- Object storage integration for generated media assets
- Richer storyboard grammar and reusable prompt packs

---

## License

MIT License. See [LICENSE](LICENSE).
