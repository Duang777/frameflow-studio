# Storyboard Atelier (React + Tailwind + Gemini Proxy)

这是一个全栈分镜拓展工具，包含：

- 前端：React + Tailwind（Luxury / Editorial 设计系统）
- 后端：Express 代理 Gemini API（保护 API Key）
- 模式库：广告片 / 剧情片 / 短视频 / B-roll
- 批量工作流：多 seed 一次性生成

## 功能清单

- 单条生成：文本 + 图片输入，生成 6/8/10 条分镜
- 单条再生成：对某条结果快速 remix
- 收藏与历史：本地收藏、历史恢复、删除、清空
- 结果区进阶交互：多选、范围选择（Shift）、批量复制/收藏/删除
- 结果筛选：全部 / 仅收藏 / 未收藏
- 任务队列：展示拓展/再生成/批量任务的状态、耗时和摘要
- 导出：Markdown / JSON
- 批量生成：每行一个 seed，后端顺序处理并回传每条结果
- 后端代理：前端不再暴露 `GEMINI_API_KEY`

## 项目结构

- `src/`：React 前端
  - `components/`：UI 组件
  - `lib/`：模式、导出、存储等工具
  - `services/`：API 客户端与业务接口封装
- `server/`：Express API 代理
  - `index.js`：接口入口
  - `modes.js`：模式库与风格映射
  - `response.js`：统一响应结构工具
  - `taskManager.js`：内存任务管理（创建/查询/取消）
  - `utils.js`：模型输出解析与补全

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

然后在 `.env` 中填写真实 `GEMINI_API_KEY`。

3. 启动开发环境（前后端一起）

```bash
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`
- 路由入口：
  - `http://localhost:5173/` 主页面（Landing）
  - `http://localhost:5173/studio` 分镜工作台（Studio）

4. 生产构建前端

```bash
npm run build
```

## API 说明

- `GET /api/health`：健康检查
- `GET /api/modes`：模式库列表
- `POST /api/tasks/expand`：创建单条拓展任务（异步）
- `POST /api/tasks/batch-expand`：创建批量拓展任务（异步）
- `GET /api/tasks/:taskId`：查询任务状态与结果
- `POST /api/tasks/:taskId/cancel`：取消任务
- `POST /api/expand`：单条生成
- `POST /api/batch-expand`：批量生成

### 统一响应结构

所有接口统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

- 成功：`HTTP 200 / 202`，`code = 0`
- 失败：`HTTP >= 400`，`code = HTTP 状态码`，错误信息在 `message`

### 任务状态字段

- `pending`：已创建，等待执行
- `running`：执行中
- `success`：执行成功，可从 `data.task.result` 读取结果
- `error`：执行失败，可从 `data.task.error` 读取原因
- `cancelled`：已取消

### 快捷键

- `Ctrl/Cmd + Enter`：提交生成
- `Ctrl/Cmd + A`：全选当前筛选结果
- `Ctrl/Cmd + C`：复制当前所选
- `Esc`：清除选择
- `Delete / Backspace`：删除所选
- `← / →`：在可见结果中切换选中项

### `/api/expand` 请求示例

```json
{
  "seedText": "雨夜街角，角色停下脚步",
  "imageDataUrl": "data:image/png;base64,...",
  "modeId": "drama",
  "styleBias": "cinematic",
  "ideaCount": 8,
  "temperature": 1,
  "topP": 0.9,
  "model": "gemini-2.0-flash",
  "promptTemplate": "..."
}
```

## 维护建议

- 统一修改设计 token：`tailwind.config.js`
- 增加新模式：`src/lib/modes.js` 与 `server/modes.js`
- 若要多人协作部署：在服务端增加鉴权、速率限制与日志追踪
