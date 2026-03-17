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
- 导出：Markdown / JSON
- 批量生成：每行一个 seed，后端顺序处理并回传每条结果
- 后端代理：前端不再暴露 `GEMINI_API_KEY`

## 项目结构

- `src/`：React 前端
  - `components/`：UI 组件
  - `lib/`：模式、导出、存储等工具
- `server/`：Express API 代理
  - `index.js`：接口入口
  - `modes.js`：模式库与风格映射
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
- `POST /api/expand`：单条生成
- `POST /api/batch-expand`：批量生成

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
