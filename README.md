# Frameflow Studio

<p align="center">
  <a href="https://github.com/Duang777/frameflow-studio/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-1A1A1A.svg"></a>
  <a href="https://github.com/Duang777/frameflow-studio/actions/workflows/ci.yml"><img alt="Build" src="https://github.com/Duang777/frameflow-studio/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-D4AF37.svg">
</p>

<p align="center">
  从一句镜头种子，快速推进到可执行分镜、分镜图与串联成片。
</p>

<p align="center">
  中文 | <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#demo">Demo</a> · <a href="#roadmap">Roadmap</a>
</p>

---

## 项目简介

**Frameflow Studio** 是一个面向导演、编剧、广告创意和短视频团队的分镜工作台。  
它强调“创意到执行”的完整链路，而不是单点文本生成：

- 输入 seed（文本/图片）快速拓展可拍分镜
- 对分镜继续出图、出视频、串联成片
- 用项目/章节、队列和历史把生产流程稳定下来

### 适用人群（Who is this for）

- 需要把抽象创意快速落到镜头级表达的导演与编剧。  
- 追求高复用提案流程的广告、品牌与短视频创作团队。  
- 需要“生成 + 管理 + 回放”闭环能力的 AI 内容生产者。

---

## Demo

<table>
  <tr>
    <td width="50%">
      <strong>主入口页</strong><br/>
      先明确流程，再进入执行。
      <br/><br/>
      <img alt="Frameflow Main Entrance" src="docs/screenshots/main-entrance.png" />
    </td>
    <td width="50%">
      <strong>Studio 工作台</strong><br/>
      输入、拓展、筛选、出图、成片、队列、历史一体化。
      <br/><br/>
      <img alt="Frameflow Studio Workspace" src="docs/screenshots/studio-overview.png" />
    </td>
  </tr>
</table>

---

## 核心能力

- 分镜拓展：`6/8/10` 条可配置输出
- 模式库：广告片 / 剧情片 / 短视频 / B-roll
- 单条再生成（Remix）与快速迭代
- 单分镜生图 / 生视频（支持失败重试）
- 串联成片（Video Composer）：
  - 镜头顺序编辑、恢复原顺序
  - 图像参与策略 `all | keyframes | first_last | text_only`
  - 配置摘要、历史一键套用、失败重试
- Workflow Hub：`Batch / Queue / History / Advanced`
- URL 状态记忆：队列筛选与 Hub Tab 刷新后保留
- 项目级持久化：`sequence_videos` 按项目/章节存储

---

## 技术架构

- 前端：React 19 + Vite + Tailwind CSS
- 后端：Node.js + Express（代理模型请求，保护 API Key）
- 存储：SQLite（`server/data/storyboard.sqlite`）

核心数据表：`projects` / `chapters` / `shots` / `shot_images` / `shot_videos` / `sequence_videos` / `history_entries`

---

## Quick Start

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

最小配置：

```env
GEMINI_API_KEY=your_api_key
```

推荐配置：

```env
GEMINI_TEXT_MODEL=gemini-2.5-flash-image
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
GEMINI_VIDEO_MODEL=gemini-2.5-flash-image
GEMINI_IMAGE_TIMEOUT_MS=90000
GEMINI_VIDEO_TIMEOUT_MS=90000
GEMINI_VIDEO_POLL_INTERVAL_MS=2500
GEMINI_VIDEO_MAX_WAIT_MS=300000
```

### 3) 启动开发环境

```bash
npm run dev
```

默认地址：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`
- Studio：`http://localhost:5173/studio`

### 4) 健康检查

访问 `http://localhost:8787/api/health`

---

## API 摘要

### 基础接口

| Method | Endpoint | 说明 |
|---|---|---|
| GET | `/api/health` | 服务健康检查 |
| GET | `/api/modes` | 模式库列表 |
| GET | `/api/workspace/bootstrap` | 默认工作区（项目+章节） |

### 项目与章节

| Method | Endpoint | 说明 |
|---|---|---|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 创建项目 |
| PATCH | `/api/projects/:projectId` | 更新项目 |
| DELETE | `/api/projects/:projectId` | 删除项目（保底一个） |
| GET | `/api/projects/:projectId/chapters` | 章节列表 |
| POST | `/api/projects/:projectId/chapters` | 创建章节 |
| PATCH | `/api/projects/:projectId/chapters/:chapterId` | 更新章节 |
| DELETE | `/api/projects/:projectId/chapters/:chapterId` | 删除章节（保底一个） |

### 分镜与媒体

| Method | Endpoint | 说明 |
|---|---|---|
| GET | `/api/projects/:projectId/chapters/:chapterId/shots` | 获取章节分镜 |
| PUT | `/api/projects/:projectId/chapters/:chapterId/shots` | 替换章节分镜 |
| PATCH | `/api/projects/:projectId/chapters/:chapterId/shots/:shotIndex/image` | 更新单条分镜图 |
| PATCH | `/api/projects/:projectId/chapters/:chapterId/shots/:shotIndex/video` | 更新单条分镜视频 |

### 串联视频历史

| Method | Endpoint | 说明 |
|---|---|---|
| GET | `/api/projects/:projectId/chapters/:chapterId/sequence-videos` | 获取串联历史 |
| POST | `/api/projects/:projectId/chapters/:chapterId/sequence-videos` | 新增/覆盖历史（upsert） |
| DELETE | `/api/projects/:projectId/chapters/:chapterId/sequence-videos/:id` | 删除历史 |

### 异步任务

| Method | Endpoint | 说明 |
|---|---|---|
| POST | `/api/tasks/expand` | 创建拓展任务 |
| POST | `/api/tasks/batch-expand` | 创建批量拓展任务 |
| POST | `/api/tasks/generate-image` | 创建分镜出图任务 |
| POST | `/api/tasks/generate-video` | 创建视频任务（单条/串联） |
| GET | `/api/tasks/:taskId` | 查询任务状态 |
| POST | `/api/tasks/:taskId/cancel` | 取消任务 |

---

## Roadmap

- Redis 任务队列（多实例与稳定性）
- 用户体系与团队协作空间
- 对象存储（图片/视频与 DB 解耦）
- 更完整的模板库与镜头语法库

---

## License

MIT License. See [LICENSE](LICENSE).
