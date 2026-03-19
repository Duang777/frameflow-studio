import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { getHistoryDbPath } from "./historyStore.js";
import { failure, success } from "./response.js";
import { registerHistoryRoutes } from "./routes/historyRoutes.js";
import { registerMediaRoutes } from "./routes/mediaRoutes.js";
import { registerTaskRoutes } from "./routes/taskRoutes.js";
import { registerWorkspaceRoutes } from "./routes/workspaceRoutes.js";
import { getMediaHealthInfo } from "./services/mediaService.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  const mediaInfo = getMediaHealthInfo();
  res.json(
    success(
      {
        ok: true,
        ...mediaInfo,
        historyDbPath: getHistoryDbPath(),
      },
      "service healthy"
    )
  );
});

registerWorkspaceRoutes(app);
registerHistoryRoutes(app);
registerTaskRoutes(app);
registerMediaRoutes(app);

app.use((error, _req, res, _next) => {
  const statusCode = error?.statusCode || 500;
  res.status(statusCode).json(failure(error?.message || "服务器异常", statusCode));
});

export function createApp() {
  return app;
}

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[server] storyboard proxy listening on http://localhost:${PORT}`);
  });
}
