import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { failure, success } from "./response.js";
import { cancelTask, createTask, getTask } from "./taskManager.js";
import {
  clearHistory,
  getHistoryById,
  getHistoryDbPath,
  listHistory,
  removeHistory,
  updateHistoryIdeaImage,
  updateHistoryIdeaVideo,
  updateHistoryIdeas,
  upsertHistory,
} from "./historyStore.js";
import {
  createChapter,
  createProject,
  deleteChapterSequenceVideo,
  deleteChapter,
  deleteProject,
  getChapterShots,
  getWorkspaceBootstrap,
  listChapterSequenceVideos,
  listChapters,
  listProjects,
  replaceChapterShots,
  upsertChapterSequenceVideo,
  updateChapter,
  updateProject,
  updateChapterShotImage,
  updateChapterShotVideo,
} from "./projectStore.js";
import { ensureIdeaCount, normalizeIdeas, parseJsonText } from "./utils.js";
import { getModeById, STORYBOARD_MODES, STYLE_HINTS } from "./modes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const LEGACY_DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";
const DEFAULT_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || LEGACY_DEFAULT_MODEL;
const DEFAULT_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || DEFAULT_TEXT_MODEL;
const DEFAULT_VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || DEFAULT_IMAGE_MODEL;
const GEMINI_ENDPOINT = String(process.env.GEMINI_ENDPOINT || "").trim();
const GEMINI_VIDEO_ENDPOINT = String(process.env.GEMINI_VIDEO_ENDPOINT || "").trim();
const GEMINI_VIDEO_OPERATION_ENDPOINT = String(process.env.GEMINI_VIDEO_OPERATION_ENDPOINT || "").trim();
const GEMINI_API_KEY_MODE = String(process.env.GEMINI_API_KEY_MODE || "auto")
  .trim()
  .toLowerCase();
const GEMINI_KEY_HEADER = String(process.env.GEMINI_KEY_HEADER || "x-api-key").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 50000);
const IMAGE_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS || Math.max(REQUEST_TIMEOUT_MS, 90000));
const VIDEO_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_VIDEO_TIMEOUT_MS || Math.max(REQUEST_TIMEOUT_MS, 90000));
const VIDEO_POLL_INTERVAL_MS = Number(process.env.GEMINI_VIDEO_POLL_INTERVAL_MS || 2500);
const VIDEO_MAX_WAIT_MS = Number(process.env.GEMINI_VIDEO_MAX_WAIT_MS || 5 * 60 * 1000);

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  res.json(
    success(
      {
        ok: true,
        hasApiKey: Boolean(GEMINI_API_KEY),
        defaultTextModel: DEFAULT_TEXT_MODEL,
        defaultImageModel: DEFAULT_IMAGE_MODEL,
        defaultVideoModel: DEFAULT_VIDEO_MODEL,
        historyDbPath: getHistoryDbPath(),
        endpointConfigured: Boolean(GEMINI_ENDPOINT),
        videoEndpointConfigured: Boolean(resolveVideoEndpointTemplate()),
        authMode: resolveAuthMode(GEMINI_API_KEY_MODE, GEMINI_ENDPOINT, GEMINI_API_KEY),
      },
      "service healthy"
    )
  );
});

app.get("/api/modes", (_req, res) => {
  res.json(success({ modes: STORYBOARD_MODES }, "modes fetched"));
});

app.get("/api/workspace/bootstrap", (_req, res) => {
  const data = getWorkspaceBootstrap();
  res.json(success(data, "workspace bootstrap fetched"));
});

app.get("/api/projects", (req, res) => {
  const limit = Number(req.query?.limit) || 100;
  const items = listProjects(limit);
  res.json(success({ items }, "projects fetched"));
});

app.post("/api/projects", (req, res) => {
  const body = req.body || {};
  const item = createProject({
    name: body.name,
    description: body.description,
  });
  res.status(201).json(success({ item }, "project created"));
});

app.patch("/api/projects/:projectId", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  if (!projectId) {
    res.status(400).json(failure("projectId 不能为空。", 400));
    return;
  }

  const item = updateProject(projectId, {
    name: req.body?.name,
    description: req.body?.description,
  });
  if (!item) {
    res.status(404).json(failure("项目不存在。", 404));
    return;
  }

  res.json(success({ item }, "project updated"));
});

app.delete("/api/projects/:projectId", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  if (!projectId) {
    res.status(400).json(failure("projectId 不能为空。", 400));
    return;
  }

  const result = deleteProject(projectId);
  if (!result?.ok) {
    if (result?.reason === "not_found") {
      res.status(404).json(failure("项目不存在。", 404));
      return;
    }
    if (result?.reason === "last_project") {
      res.status(409).json(failure("至少保留一个项目，无法删除最后一个项目。", 409));
      return;
    }
    res.status(400).json(failure("项目删除失败。", 400));
    return;
  }

  res.json(success(result, "project deleted"));
});

app.get("/api/projects/:projectId/chapters", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  if (!projectId) {
    res.status(400).json(failure("projectId 不能为空。", 400));
    return;
  }
  const limit = Number(req.query?.limit) || 200;
  const items = listChapters(projectId, limit);
  res.json(success({ items }, "chapters fetched"));
});

app.post("/api/projects/:projectId/chapters", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  if (!projectId) {
    res.status(400).json(failure("projectId 不能为空。", 400));
    return;
  }

  const item = createChapter(projectId, {
    title: req.body?.title,
  });
  if (!item) {
    res.status(404).json(failure("项目不存在。", 404));
    return;
  }

  res.status(201).json(success({ item }, "chapter created"));
});

app.patch("/api/projects/:projectId/chapters/:chapterId", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }

  const item = updateChapter(projectId, chapterId, {
    title: req.body?.title,
  });
  if (!item) {
    res.status(404).json(failure("章节不存在。", 404));
    return;
  }

  res.json(success({ item }, "chapter updated"));
});

app.delete("/api/projects/:projectId/chapters/:chapterId", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }

  const result = deleteChapter(projectId, chapterId);
  if (!result?.ok) {
    if (result?.reason === "not_found") {
      res.status(404).json(failure("章节不存在。", 404));
      return;
    }
    if (result?.reason === "last_chapter") {
      res.status(409).json(failure("至少保留一个章节，无法删除最后一个章节。", 409));
      return;
    }
    res.status(400).json(failure("章节删除失败。", 400));
    return;
  }

  res.json(success(result, "chapter deleted"));
});

app.get("/api/projects/:projectId/chapters/:chapterId/shots", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }

  const ideas = getChapterShots(projectId, chapterId);
  if (ideas === null) {
    res.status(404).json(failure("章节不存在。", 404));
    return;
  }

  res.json(success({ ideas, count: ideas.length }, "chapter shots fetched"));
});

app.put("/api/projects/:projectId/chapters/:chapterId/shots", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  const ideas = Array.isArray(req.body?.ideas) ? req.body.ideas : [];
  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }

  const result = replaceChapterShots(projectId, chapterId, ideas);
  if (!result) {
    res.status(404).json(failure("章节不存在。", 404));
    return;
  }

  res.json(success({ ...result }, "chapter shots replaced"));
});

app.patch("/api/projects/:projectId/chapters/:chapterId/shots/:shotIndex/image", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  const shotIndex = Number(req.params.shotIndex);
  const generatedImage = req.body?.generatedImage;

  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }
  if (!Number.isInteger(shotIndex) || shotIndex < 0) {
    res.status(400).json(failure("shotIndex 必须是 >= 0 的整数。", 400));
    return;
  }
  if (!generatedImage || typeof generatedImage !== "object") {
    res.status(400).json(failure("generatedImage 不能为空。", 400));
    return;
  }

  const ok = updateChapterShotImage(projectId, chapterId, shotIndex, generatedImage);
  if (!ok) {
    res.status(404).json(failure("章节或分镜不存在。", 404));
    return;
  }

  res.json(success({ projectId, chapterId, shotIndex }, "chapter shot image updated"));
});

app.patch("/api/projects/:projectId/chapters/:chapterId/shots/:shotIndex/video", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  const shotIndex = Number(req.params.shotIndex);
  const generatedVideo = req.body?.generatedVideo;

  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }
  if (!Number.isInteger(shotIndex) || shotIndex < 0) {
    res.status(400).json(failure("shotIndex 必须是 >= 0 的整数。", 400));
    return;
  }
  if (!generatedVideo || typeof generatedVideo !== "object") {
    res.status(400).json(failure("generatedVideo 不能为空。", 400));
    return;
  }

  const ok = updateChapterShotVideo(projectId, chapterId, shotIndex, generatedVideo);
  if (!ok) {
    res.status(404).json(failure("章节或分镜不存在。", 404));
    return;
  }

  res.json(success({ projectId, chapterId, shotIndex }, "chapter shot video updated"));
});

app.get("/api/projects/:projectId/chapters/:chapterId/sequence-videos", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }

  const limit = Number(req.query?.limit) || 60;
  const items = listChapterSequenceVideos(projectId, chapterId, limit);
  if (items === null) {
    res.status(404).json(failure("章节不存在。", 404));
    return;
  }

  res.json(success({ items }, "sequence videos fetched"));
});

app.post("/api/projects/:projectId/chapters/:chapterId/sequence-videos", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  if (!projectId || !chapterId) {
    res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
    return;
  }

  const item = upsertChapterSequenceVideo(projectId, chapterId, req.body || {});
  if (!item) {
    res.status(404).json(failure("章节不存在。", 404));
    return;
  }

  res.status(201).json(success({ item }, "sequence video saved"));
});

app.delete("/api/projects/:projectId/chapters/:chapterId/sequence-videos/:id", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const chapterId = String(req.params.chapterId || "").trim();
  const id = String(req.params.id || "").trim();
  if (!projectId || !chapterId || !id) {
    res.status(400).json(failure("projectId、chapterId 或 id 不能为空。", 400));
    return;
  }

  const result = deleteChapterSequenceVideo(projectId, chapterId, id);
  if (!result?.ok) {
    if (result?.reason === "chapter_not_found") {
      res.status(404).json(failure("章节不存在。", 404));
      return;
    }
    if (result?.reason === "not_found") {
      res.status(404).json(failure("串联视频历史不存在。", 404));
      return;
    }
    res.status(400).json(failure("删除失败。", 400));
    return;
  }

  res.json(success({ id: result.id }, "sequence video removed"));
});

app.get("/api/history", (req, res) => {
  const limit = Number(req.query?.limit) || 30;
  const items = listHistory(limit);
  res.json(success({ items }, "history fetched"));
});

app.get("/api/history/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json(failure("history id 不能为空。", 400));
    return;
  }
  const item = getHistoryById(id);
  if (!item) {
    res.status(404).json(failure("历史记录不存在。", 404));
    return;
  }
  res.json(success({ item }, "history fetched"));
});

app.post("/api/history", (req, res) => {
  const body = req.body || {};
  const ideas = Array.isArray(body?.ideas) ? body.ideas : [];
  if (ideas.length === 0) {
    res.status(400).json(failure("history ideas 不能为空。", 400));
    return;
  }

  const saved = upsertHistory({
    id: body.id,
    createdAt: body.createdAt,
    updatedAt: Date.now(),
    seedText: body.seedText,
    imageName: body.imageName,
    modeId: body.modeId,
    modeName: body.modeName,
    styleBias: body.styleBias,
    styleName: body.styleName,
    ideas,
  });
  res.json(success({ item: saved }, "history saved"));
});

app.patch("/api/history/:id/ideas", (req, res) => {
  const id = String(req.params.id || "").trim();
  const ideas = Array.isArray(req.body?.ideas) ? req.body.ideas : [];
  if (!id) {
    res.status(400).json(failure("history id 不能为空。", 400));
    return;
  }
  if (ideas.length === 0) {
    res.status(400).json(failure("ideas 不能为空。", 400));
    return;
  }

  const ok = updateHistoryIdeas(id, ideas);
  if (!ok) {
    res.status(404).json(failure("历史记录不存在。", 404));
    return;
  }

  res.json(success({ id, count: ideas.length }, "history ideas updated"));
});

app.patch("/api/history/:id/idea-image", (req, res) => {
  const id = String(req.params.id || "").trim();
  const index = Number(req.body?.index);
  const generatedImage = req.body?.generatedImage;
  if (!id) {
    res.status(400).json(failure("history id 不能为空。", 400));
    return;
  }
  if (!Number.isInteger(index) || index < 0) {
    res.status(400).json(failure("index 必须是 >= 0 的整数。", 400));
    return;
  }
  if (!generatedImage || typeof generatedImage !== "object") {
    res.status(400).json(failure("generatedImage 不能为空。", 400));
    return;
  }

  const ok = updateHistoryIdeaImage(id, index, generatedImage);
  if (!ok) {
    res.status(404).json(failure("历史记录或分镜索引不存在。", 404));
    return;
  }

  res.json(success({ id, index }, "history idea image updated"));
});

app.patch("/api/history/:id/idea-video", (req, res) => {
  const id = String(req.params.id || "").trim();
  const index = Number(req.body?.index);
  const generatedVideo = req.body?.generatedVideo;
  if (!id) {
    res.status(400).json(failure("history id 不能为空。", 400));
    return;
  }
  if (!Number.isInteger(index) || index < 0) {
    res.status(400).json(failure("index 必须是 >= 0 的整数。", 400));
    return;
  }
  if (!generatedVideo || typeof generatedVideo !== "object") {
    res.status(400).json(failure("generatedVideo 不能为空。", 400));
    return;
  }

  const ok = updateHistoryIdeaVideo(id, index, generatedVideo);
  if (!ok) {
    res.status(404).json(failure("历史记录或分镜索引不存在。", 404));
    return;
  }

  res.json(success({ id, index }, "history idea video updated"));
});

app.delete("/api/history/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json(failure("history id 不能为空。", 400));
    return;
  }
  const ok = removeHistory(id);
  if (!ok) {
    res.status(404).json(failure("历史记录不存在。", 404));
    return;
  }
  res.json(success({ id }, "history removed"));
});

app.delete("/api/history", (_req, res) => {
  clearHistory();
  res.json(success({ ok: true }, "history cleared"));
});

app.post("/api/tasks/expand", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  const input = req.body || {};
  if (!String(input?.seedText || "").trim() && !String(input?.imageDataUrl || "").trim()) {
    res.status(400).json(failure("请至少提供文本或图片输入。", 400));
    return;
  }

  const task = createTask({
    type: "expand",
    payload: sanitizeTaskPayload(input),
    run: async (ctx) => {
      ctx.setProgress(5);
      ctx.setStage("queued", "排队中");
      const result = await generateOne(input, {
        onStage: (stage, stageText, progress) => {
          if (ctx.isCancelled()) return;
          if (typeof progress === "number") {
            ctx.setProgress(progress);
          }
          ctx.setStage(stage, stageText);
        },
      });
      if (ctx.isCancelled()) return {};
      ctx.setProgress(100);
      ctx.setStage("completed", "完成");
      return result;
    },
  });

  res.status(202).json(success({ task }, "task created"));
});

app.post("/api/tasks/batch-expand", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  const seeds = normalizeBatchSeeds(req.body?.seeds);
  if (seeds.length === 0) {
    res.status(400).json(failure("请提供至少一个有效 seed。", 400));
    return;
  }

  const input = req.body || {};
  const task = createTask({
    type: "batch",
    payload: {
      ...sanitizeTaskPayload(input),
      seedsCount: seeds.length,
    },
    run: async (ctx) => {
      const shared = {
        ...input,
        imageDataUrl: "",
      };
      const results = [];
      ctx.setProgress(5);
      ctx.setStage("queued", "排队中");

      for (let index = 0; index < seeds.length; index += 1) {
        if (ctx.isCancelled()) {
          break;
        }

        const seed = seeds[index];
        try {
          const output = await generateOne(
            { ...shared, seedText: seed },
            {
              onStage: (stage, stageText, stageProgress) => {
                const overall = calcBatchProgress(index, seeds.length, stageProgress);
                ctx.setProgress(overall);
                ctx.setStage(stage, `${stageText}（${index + 1}/${seeds.length}）`);
              },
            }
          );
          results.push({ seed, expansions: output.expansions });
        } catch (error) {
          results.push({ seed, error: error.message || "生成失败" });
        }

        const progress = calcBatchProgress(index + 1, seeds.length, 0);
        ctx.setProgress(progress);
      }

      if (!ctx.isCancelled()) {
        ctx.setStage("completed", "完成");
      }
      return { results };
    },
  });

  res.status(202).json(success({ task }, "task created"));
});

app.post("/api/tasks/generate-image", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  const input = req.body || {};
  if (!hasImageSeed(input)) {
    res.status(400).json(failure("请至少提供一条分镜内容作为出图输入。", 400));
    return;
  }

  const task = createTask({
    type: "image",
    payload: sanitizeTaskPayload(input),
    run: async (ctx) => {
      ctx.setProgress(5);
      ctx.setStage("queued", "排队中");
      const result = await generateImage(input, {
        onStage: (stage, stageText, progress) => {
          if (ctx.isCancelled()) return;
          if (typeof progress === "number") {
            ctx.setProgress(progress);
          }
          ctx.setStage(stage, stageText);
        },
      });

      if (ctx.isCancelled()) return {};
      ctx.setProgress(100);
      ctx.setStage("completed", "完成");
      return result;
    },
  });

  res.status(202).json(success({ task }, "task created"));
});

app.post("/api/tasks/generate-video", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  const input = req.body || {};
  if (!hasVideoSeed(input)) {
    res.status(400).json(failure("请至少提供一条分镜或参考图作为生成视频输入。", 400));
    return;
  }

  const task = createTask({
    type: "video",
    payload: sanitizeTaskPayload(input),
    run: async (ctx) => {
      ctx.setProgress(5);
      ctx.setStage("queued", "排队中");
      const result = await generateVideo(input, {
        onStage: (stage, stageText, progress) => {
          if (ctx.isCancelled()) return;
          if (typeof progress === "number") {
            ctx.setProgress(progress);
          }
          ctx.setStage(stage, stageText);
        },
      });

      if (ctx.isCancelled()) return {};
      ctx.setProgress(100);
      ctx.setStage("completed", "完成");
      return result;
    },
  });

  res.status(202).json(success({ task }, "task created"));
});

app.get("/api/tasks/:taskId", (req, res) => {
  const task = getTask(String(req.params.taskId || "").trim());
  if (!task) {
    res.status(404).json(failure("任务不存在。", 404));
    return;
  }
  res.json(success({ task }, "task fetched"));
});

app.post("/api/tasks/:taskId/cancel", (req, res) => {
  const task = cancelTask(String(req.params.taskId || "").trim());
  if (!task) {
    res.status(404).json(failure("任务不存在。", 404));
    return;
  }
  res.json(success({ task }, "task cancelled"));
});

app.post("/api/expand", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  try {
    const result = await generateOne(req.body);
    res.json(success(result, "expand completed"));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json(failure(error.message || "生成失败", statusCode));
  }
});

app.post("/api/batch-expand", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  const seeds = normalizeBatchSeeds(req.body?.seeds);

  if (seeds.length === 0) {
    res.status(400).json(failure("请提供至少一个有效 seed。", 400));
    return;
  }

  const shared = {
    ...req.body,
    imageDataUrl: "",
  };

  const results = [];

  for (const seed of seeds) {
    try {
      const output = await generateOne({ ...shared, seedText: seed });
      results.push({ seed, expansions: output.expansions });
    } catch (error) {
      results.push({ seed, error: error.message || "生成失败" });
    }
  }

  res.json(success({ results }, "batch expand completed"));
});

app.post("/api/generate-image", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  try {
    const result = await generateImage(req.body);
    res.json(success(result, "image generated"));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json(failure(error.message || "生成失败", statusCode));
  }
});

app.post("/api/generate-video", async (req, res) => {
  if (!ensureApiKey(res)) {
    return;
  }

  try {
    const result = await generateVideo(req.body);
    res.json(success(result, "video generated"));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json(failure(error.message || "视频生成失败", statusCode));
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error?.statusCode || 500;
  res.status(statusCode).json(failure(error?.message || "服务器异常", statusCode));
});

app.listen(PORT, () => {
  console.log(`[server] storyboard proxy listening on http://localhost:${PORT}`);
});

function ensureApiKey(res) {
  if (GEMINI_API_KEY) {
    return true;
  }
  res.status(500).json(failure("服务端未配置 GEMINI_API_KEY。请在 .env 中设置后重启。", 500));
  return false;
}

function normalizeBatchSeeds(input) {
  return Array.isArray(input)
    ? input.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
    : [];
}

function sanitizeTaskPayload(input) {
  const body = input && typeof input === "object" ? input : {};
  const sequenceCount = Array.isArray(body.storyboardSequence) ? body.storyboardSequence.length : 0;
  return {
    modeId: body.modeId,
    styleBias: body.styleBias,
    ideaCount: body.ideaCount,
    model: body.model,
    textModel: body.textModel,
    imageModel: body.imageModel,
    videoModel: body.videoModel,
    aspectRatio: body.aspectRatio,
    durationSeconds: body.durationSeconds,
    transitionStyle: body.transitionStyle,
    referenceImagePolicy: body.referenceImagePolicy,
    sequenceCount,
  };
}

function calcBatchProgress(completedSeeds, totalSeeds, innerProgress = 0) {
  const total = Math.max(1, Number(totalSeeds) || 1);
  const completed = Math.max(0, Number(completedSeeds) || 0);
  const inner = Math.max(0, Math.min(100, Number(innerProgress) || 0)) / 100;
  const value = ((completed + inner) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function generateOne(input, options = {}) {
  const onStage = typeof options?.onStage === "function" ? options.onStage : () => {};

  const seedText = String(input?.seedText || "").trim();
  const imageDataUrl = String(input?.imageDataUrl || "").trim();
  const styleBias = String(input?.styleBias || "cinematic");
  const modeId = String(input?.modeId || "ad-film");
  const ideaCount = clampInt(input?.ideaCount, 8, 1, 12);
  const temperature = clampFloat(input?.temperature, 1, 0, 2);
  const topP = clampFloat(input?.topP, 0.9, 0, 1);
  const model = sanitizeModel(input?.model || input?.textModel) || DEFAULT_TEXT_MODEL;
  const promptTemplate = String(input?.promptTemplate || "");

  if (!seedText && !imageDataUrl) {
    const error = new Error("至少提供文本或图片输入。\n");
    error.statusCode = 400;
    throw error;
  }

  onStage("validating", "校验输入", 12);

  const mode = getModeById(modeId);
  const styleHint = STYLE_HINTS[styleBias] || STYLE_HINTS.cinematic;

  const prompt = buildPrompt({
    promptTemplate,
    ideaCount,
    seedText,
    imageProvided: Boolean(imageDataUrl),
    styleHint,
    mode,
  });

  const parts = [{ text: prompt }];
  const imagePart = parseImagePart(imageDataUrl);
  if (imagePart) {
    parts.push(imagePart);
  }

  const geminiPayload = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature,
      topP,
    },
  };

  const authMode = resolveAuthMode(GEMINI_API_KEY_MODE, GEMINI_ENDPOINT, GEMINI_API_KEY);
  const endpoint = buildGeminiEndpoint({
    endpointTemplate: GEMINI_ENDPOINT,
    model,
    apiKey: GEMINI_API_KEY,
    authMode,
  });
  const headers = buildGeminiHeaders({
    apiKey: GEMINI_API_KEY,
    authMode,
    keyHeader: GEMINI_KEY_HEADER,
  });
  onStage("requesting_model", "请求模型", 38);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(geminiPayload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      const timeoutError = new Error(`请求超时（>${REQUEST_TIMEOUT_MS / 1000}s），请重试。`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    const networkError = new Error("请求 Gemini 失败，请检查网络或代理设置。", { cause: error });
    networkError.statusCode = 502;
    throw networkError;
  }

  clearTimeout(timeout);
  onStage("parsing_result", "解析结果", 76);

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    const mapped = mapGeminiError(response.status, detail);
    const apiError = new Error(mapped);
    apiError.statusCode = response.status;
    throw apiError;
  }

  const text = extractText(body);
  if (!text) {
    const invalid = new Error("模型未返回可解析文本。请重试或切换模型。");
    invalid.statusCode = 502;
    throw invalid;
  }

  const parsed = parseJsonText(text);
  const normalized = normalizeIdeas(parsed);
  const expansions = ensureIdeaCount(normalized, ideaCount, seedText);
  onStage("completed", "完成", 100);

  return {
    expansions,
    meta: {
      modeId: mode.id,
      modeName: mode.name,
      styleBias,
      model,
      ideaCount,
    },
  };
}

async function generateImage(input, options = {}) {
  const onStage = typeof options?.onStage === "function" ? options.onStage : () => {};
  const idea = input?.idea && typeof input.idea === "object" ? input.idea : {};
  const seedText = String(input?.seedText || "").trim();
  const styleBias = String(input?.styleBias || "cinematic");
  const modeId = String(input?.modeId || "ad-film");
  const model = sanitizeModel(input?.imageModel || input?.model) || DEFAULT_IMAGE_MODEL;
  const mode = getModeById(modeId);
  const styleHint = STYLE_HINTS[styleBias] || STYLE_HINTS.cinematic;

  const imagePrompt = buildImagePrompt({
    idea,
    seedText,
    styleHint,
    mode,
  });

  if (!imagePrompt.trim()) {
    const error = new Error("缺少可用于出图的分镜内容。");
    error.statusCode = 400;
    throw error;
  }

  onStage("validating", "校验输入", 15);

  const geminiPayload = {
    contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  const authMode = resolveAuthMode(GEMINI_API_KEY_MODE, GEMINI_ENDPOINT, GEMINI_API_KEY);
  const endpoint = buildGeminiEndpoint({
    endpointTemplate: GEMINI_ENDPOINT,
    model,
    apiKey: GEMINI_API_KEY,
    authMode,
  });
  const headers = buildGeminiHeaders({
    apiKey: GEMINI_API_KEY,
    authMode,
    keyHeader: GEMINI_KEY_HEADER,
  });

  const requestOnce = async (payload, stageProgress) => {
    onStage("requesting_model", "请求模型", stageProgress);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        const timeoutError = new Error(`请求超时（>${IMAGE_REQUEST_TIMEOUT_MS / 1000}s），请重试。`);
        timeoutError.statusCode = 504;
        throw timeoutError;
      }

      const networkError = new Error("请求 Gemini 失败，请检查网络或代理设置。", { cause: error });
      networkError.statusCode = 502;
      throw networkError;
    }

    clearTimeout(timeout);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body?.error?.message || `HTTP ${response.status}`;
      const mapped = mapGeminiError(response.status, detail);
      const apiError = new Error(mapped);
      apiError.statusCode = response.status;
      throw apiError;
    }
    return body;
  };

  let body = await requestOnce(geminiPayload, 45);
  let generatedImage = extractGeneratedImage(body);

  if (!generatedImage?.dataUrl && isNoImageResponse(body)) {
    const fallbackPayload = {
      contents: [{ role: "user", parts: [{ text: buildFallbackImagePrompt({ idea, seedText, mode, styleHint }) }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    };
    onStage("retrying", "重试出图", 66);
    body = await requestOnce(fallbackPayload, 70);
    generatedImage = extractGeneratedImage(body);
  }

  onStage("parsing_result", "解析结果", 88);
  if (!generatedImage?.dataUrl) {
    const detail = summarizeCandidateParts(body);
    const invalid = new Error(`模型未返回图片。请检查出图模型是否支持 IMAGE 输出。${detail ? `（${detail}）` : ""}`);
    invalid.statusCode = 502;
    throw invalid;
  }

  onStage("completed", "完成", 100);
  return {
    imageDataUrl: generatedImage.dataUrl,
    mimeType: generatedImage.mimeType,
    model,
    prompt: imagePrompt,
  };
}

async function generateVideo(input, options = {}) {
  const onStage = typeof options?.onStage === "function" ? options.onStage : () => {};
  const idea = input?.idea && typeof input.idea === "object" ? input.idea : {};
  const storyboardSequence = normalizeStoryboardSequence(input?.storyboardSequence);
  const seedText = String(input?.seedText || "").trim();
  const styleBias = String(input?.styleBias || "cinematic");
  const modeId = String(input?.modeId || "ad-film");
  const model = sanitizeModel(input?.videoModel || input?.model) || DEFAULT_VIDEO_MODEL;
  const aspectRatio = sanitizeAspectRatio(input?.aspectRatio || "16:9");
  const durationSeconds = clampInt(input?.durationSeconds, 5, 2, 12);
  const negativePrompt = String(input?.negativePrompt || "").trim();
  const continuityNote = String(input?.continuityNote || "").trim();
  const transitionStyle = String(input?.transitionStyle || "match-cut").trim();
  const referenceImagePolicy = sanitizeReferenceImagePolicy(input?.referenceImagePolicy || "all");
  const sequencePromptTemplate = String(input?.sequencePromptTemplate || "").trim();
  const referenceImageDataUrl = String(input?.imageDataUrl || "").trim();
  const referenceImageUrl = String(input?.imageUrl || "").trim();
  const sequenceWithPolicy = applyReferenceImagePolicy(storyboardSequence, referenceImagePolicy);
  const sequenceReferenceImages = collectSequenceReferenceImages(sequenceWithPolicy);
  const mergedReferenceImageDataUrls = dedupeStrings([
    referenceImageDataUrl,
    ...sequenceReferenceImages.dataUrls,
  ]);
  const mergedReferenceImageUrls = dedupeStrings([referenceImageUrl, ...sequenceReferenceImages.urls]);

  const mode = getModeById(modeId);
  const styleHint = STYLE_HINTS[styleBias] || STYLE_HINTS.cinematic;
  const videoPrompt = buildVideoPrompt({
    idea,
    seedText,
    styleHint,
    mode,
    aspectRatio,
    durationSeconds,
    negativePrompt,
    referenceImageUrl: mergedReferenceImageUrls[0] || "",
    referenceImageUrls: mergedReferenceImageUrls,
    referenceImageDataUrlCount: mergedReferenceImageDataUrls.length,
    continuityNote,
    transitionStyle,
    referenceImagePolicy,
    sequencePromptTemplate,
    storyboardSequence: sequenceWithPolicy,
  });

  if (!videoPrompt.trim()) {
    const error = new Error("缺少可用于生成视频的分镜内容。");
    error.statusCode = 400;
    throw error;
  }

  onStage("validating", "校验输入", 12);

  const authMode = resolveAuthMode(GEMINI_API_KEY_MODE, GEMINI_ENDPOINT, GEMINI_API_KEY);
  const endpointTemplate = resolveVideoEndpointTemplate();
  const endpoint = buildGeminiEndpoint({
    endpointTemplate,
    model,
    apiKey: GEMINI_API_KEY,
    authMode,
  });
  const headers = buildGeminiHeaders({
    apiKey: GEMINI_API_KEY,
    authMode,
    keyHeader: GEMINI_KEY_HEADER,
  });

  const payloadCandidates = buildVideoPayloadCandidates({
    videoPrompt,
    aspectRatio,
    durationSeconds,
    negativePrompt,
    referenceImageDataUrl: mergedReferenceImageDataUrls[0] || "",
    referenceImageUrl: mergedReferenceImageUrls[0] || "",
    referenceImageDataUrls: mergedReferenceImageDataUrls,
    referenceImageUrls: mergedReferenceImageUrls,
  });

  onStage("requesting_model", "提交视频任务", 28);

  let createBody = null;
  let lastError = null;
  for (let index = 0; index < payloadCandidates.length; index += 1) {
    const payload = payloadCandidates[index];
    try {
      createBody = await requestGeminiJson({
        endpoint,
        headers,
        payload,
        timeoutMs: VIDEO_REQUEST_TIMEOUT_MS,
      });
      if (createBody) {
        break;
      }
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 400 || statusCode === 404 || statusCode === 415) {
        continue;
      }
      throw error;
    }
  }

  if (!createBody) {
    throw lastError || new Error("视频任务创建失败，请检查模型与接口配置。");
  }

  const directVideo = extractGeneratedVideo(createBody);
  if (directVideo?.url) {
    onStage("completed", "完成", 100);
    return {
      videoUrl: directVideo.url,
      mimeType: directVideo.mimeType,
      model,
      prompt: videoPrompt,
      durationSeconds,
      aspectRatio,
    };
  }

  const operationRef = resolveVideoOperationRef(createBody, endpoint, authMode);
  if (!operationRef?.pollUrl) {
    const detail = summarizeVideoResponse(createBody);
    const error = new Error(`模型未返回可用视频或可轮询任务。${detail ? `（${detail}）` : ""}`);
    error.statusCode = 502;
    throw error;
  }

  onStage("polling", "等待视频任务完成", 52);
  const finalBody = await pollVideoOperation(operationRef, {
    headers,
    authMode,
    apiKey: GEMINI_API_KEY,
    onTick: (progress) => {
      onStage("polling", "等待视频任务完成", progress);
    },
  });

  onStage("parsing_result", "解析结果", 90);
  const generatedVideo = extractGeneratedVideo(finalBody);
  if (!generatedVideo?.url) {
    const detail = summarizeVideoResponse(finalBody);
    const error = new Error(`视频任务已完成，但未返回可用视频地址。${detail ? `（${detail}）` : ""}`);
    error.statusCode = 502;
    throw error;
  }

  onStage("completed", "完成", 100);
  return {
    videoUrl: generatedVideo.url,
    mimeType: generatedVideo.mimeType,
    model,
    prompt: videoPrompt,
    durationSeconds,
    aspectRatio,
  };
}

function resolveVideoEndpointTemplate() {
  if (GEMINI_VIDEO_ENDPOINT) {
    return GEMINI_VIDEO_ENDPOINT;
  }
  if (GEMINI_ENDPOINT && GEMINI_ENDPOINT.includes(":generateContent")) {
    return GEMINI_ENDPOINT.replace(":generateContent", ":generateVideos");
  }
  return "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateVideos";
}

function buildVideoPayloadCandidates({
  videoPrompt,
  aspectRatio,
  durationSeconds,
  negativePrompt,
  referenceImageDataUrl,
  referenceImageUrl,
  referenceImageDataUrls,
  referenceImageUrls,
}) {
  const dataUrlCandidates = dedupeStrings([...(Array.isArray(referenceImageDataUrls) ? referenceImageDataUrls : []), referenceImageDataUrl]);
  const urlCandidates = dedupeStrings([...(Array.isArray(referenceImageUrls) ? referenceImageUrls : []), referenceImageUrl]);
  const imageParts = dataUrlCandidates
    .slice(0, 8)
    .map((dataUrl) => parseImagePart(dataUrl))
    .filter(Boolean);

  const referenceLines = [];
  if (urlCandidates.length > 0) {
    referenceLines.push(`参考图 URL：${urlCandidates.join(" , ")}`);
  }
  if (imageParts.length > 0) {
    referenceLines.push(`参考图数量（内联）：${imageParts.length}`);
  }
  const promptWithReference = referenceLines.length > 0 ? `${videoPrompt}\n${referenceLines.join("\n")}` : videoPrompt;

  const candidateA = {
    prompt: {
      text: promptWithReference,
    },
    generationConfig: {
      aspectRatio,
      durationSeconds,
      negativePrompt,
    },
  };

  const candidateBParts = [{ text: promptWithReference }];
  candidateBParts.push(...imageParts);
  const candidateB = {
    contents: [{ role: "user", parts: candidateBParts }],
    generationConfig: {
      responseModalities: ["VIDEO"],
      aspectRatio,
      durationSeconds,
      negativePrompt,
    },
  };

  const candidateC = {
    instances: [
      {
        prompt: promptWithReference,
        aspectRatio,
        durationSeconds,
      },
    ],
  };

  return [candidateA, candidateB, candidateC];
}

async function requestGeminiJson({ endpoint, headers, payload, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || REQUEST_TIMEOUT_MS));

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      const timeoutError = new Error(`请求超时（>${Math.round((Number(timeoutMs) || 0) / 1000)}s），请重试。`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    const networkError = new Error("请求 Gemini 失败，请检查网络或代理设置。", { cause: error });
    networkError.statusCode = 502;
    throw networkError;
  }

  clearTimeout(timeout);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    const mapped = mapGeminiError(response.status, detail);
    const apiError = new Error(mapped);
    apiError.statusCode = response.status;
    throw apiError;
  }
  return body;
}

function resolveVideoOperationRef(body, createEndpoint, authMode) {
  const operationName = String(
    body?.name || body?.operation?.name || body?.operationId || body?.id || body?.jobId || ""
  ).trim();
  if (!operationName) {
    return null;
  }

  const pollUrl = buildVideoOperationPollUrl({
    operationName,
    createEndpoint,
    authMode,
    apiKey: GEMINI_API_KEY,
    operationEndpointTemplate: GEMINI_VIDEO_OPERATION_ENDPOINT,
  });
  if (!pollUrl) {
    return null;
  }
  return {
    operationName,
    pollUrl,
  };
}

function buildVideoOperationPollUrl({
  operationName,
  createEndpoint,
  authMode,
  apiKey,
  operationEndpointTemplate,
}) {
  const safeName = String(operationName || "").trim();
  if (!safeName) {
    return "";
  }

  let rawUrl = "";
  if (String(operationEndpointTemplate || "").trim()) {
    const encodedOperation = encodeOperationPath(safeName);
    rawUrl = operationEndpointTemplate.includes("{operation}")
      ? operationEndpointTemplate.replaceAll("{operation}", encodedOperation)
      : operationEndpointTemplate;
  } else if (/^https?:\/\//i.test(safeName)) {
    rawUrl = safeName;
  } else {
    const origin = new URL(createEndpoint).origin;
    if (safeName.startsWith("/")) {
      rawUrl = `${origin}${safeName}`;
    } else if (safeName.startsWith("operations/")) {
      rawUrl = `${origin}/v1beta/${safeName}`;
    } else if (safeName.includes("/operations/")) {
      rawUrl = `${origin}/${safeName.replace(/^\/+/, "")}`;
    } else {
      rawUrl = `${origin}/v1beta/operations/${safeName}`;
    }
  }

  return appendApiKeyToUrl(rawUrl, apiKey, authMode);
}

async function pollVideoOperation(operationRef, options = {}) {
  const pollInterval = Math.max(1000, Number(VIDEO_POLL_INTERVAL_MS) || 2500);
  const maxWaitMs = Math.max(15_000, Number(VIDEO_MAX_WAIT_MS) || 300_000);
  const startedAt = Date.now();

  let attempt = 0;
  while (Date.now() - startedAt <= maxWaitMs) {
    attempt += 1;
    const progress = Math.min(88, 52 + Math.round(((Date.now() - startedAt) / maxWaitMs) * 36));
    if (typeof options?.onTick === "function") {
      options.onTick(progress, attempt);
    }

    const body = await fetchOperationJson(operationRef.pollUrl, {
      headers: options.headers,
      timeoutMs: VIDEO_REQUEST_TIMEOUT_MS,
    });
    if (isOperationFailed(body)) {
      const detail = String(body?.error?.message || body?.error?.status || "视频任务失败");
      const error = new Error(detail);
      error.statusCode = 502;
      throw error;
    }

    const done = isOperationDone(body);
    if (done) {
      return body?.response || body;
    }

    const directVideo = extractGeneratedVideo(body);
    if (directVideo?.url) {
      return body;
    }

    await delay(pollInterval);
  }

  const timeoutError = new Error(`视频任务轮询超时（>${Math.round(maxWaitMs / 1000)}s），请稍后重试。`);
  timeoutError.statusCode = 504;
  throw timeoutError;
}

async function fetchOperationJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1000, Number(options?.timeoutMs) || REQUEST_TIMEOUT_MS)
  );

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: options?.headers || {},
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      const timeoutError = new Error("轮询超时，请稍后重试。");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    const networkError = new Error("读取视频任务状态失败，请检查网络连接。", { cause: error });
    networkError.statusCode = 502;
    throw networkError;
  }

  clearTimeout(timeout);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    const mapped = mapGeminiError(response.status, detail);
    const error = new Error(mapped);
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

function extractGeneratedVideo(body) {
  const directUrl = String(body?.videoUrl || body?.video_url || body?.url || "").trim();
  if (directUrl) {
    return {
      url: directUrl,
      mimeType: String(body?.mimeType || body?.mime_type || "").trim() || "video/mp4",
    };
  }

  const generatedVideos = Array.isArray(body?.generatedVideos)
    ? body.generatedVideos
    : Array.isArray(body?.response?.generatedVideos)
    ? body.response.generatedVideos
    : [];
  for (const item of generatedVideos) {
    const video = item?.video || item;
    const uri = String(video?.uri || video?.url || "").trim();
    if (uri) {
      return {
        url: uri,
        mimeType: String(video?.mimeType || video?.mime_type || "").trim() || "video/mp4",
      };
    }
    const data = String(video?.data || video?.bytesBase64Encoded || "").trim();
    if (data) {
      const mimeType = String(video?.mimeType || video?.mime_type || "video/mp4").trim();
      return {
        url: `data:${mimeType};base64,${data}`,
        mimeType,
      };
    }
  }

  const candidates = Array.isArray(body?.candidates)
    ? body.candidates
    : Array.isArray(body?.response?.candidates)
    ? body.response.candidates
    : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      const data = String(inlineData?.data || part?.data || "").trim();
      const mimeType = String(inlineData?.mimeType || inlineData?.mime_type || "").trim();
      if (data && mimeType.startsWith("video/")) {
        return {
          url: `data:${mimeType};base64,${data}`,
          mimeType,
        };
      }
    }
  }

  return null;
}

function summarizeVideoResponse(body) {
  const errorText = String(body?.error?.message || body?.error?.status || "").trim();
  if (errorText) {
    return errorText;
  }
  const done = isOperationDone(body);
  const hasOperation = Boolean(body?.name || body?.operation?.name || body?.id || body?.jobId);
  if (done && !extractGeneratedVideo(body)) {
    return "任务状态为完成，但无视频输出";
  }
  if (hasOperation) {
    return "已返回任务 ID，但未拿到视频结果";
  }
  const finishReason = String(body?.candidates?.[0]?.finishReason || "").trim();
  if (finishReason) {
    return `finishReason=${finishReason}`;
  }
  return "";
}

function buildPrompt({ promptTemplate, ideaCount, seedText, imageProvided, styleHint, mode }) {
  const fallbackTemplate = `你是资深分镜导演与镜头设计顾问。
目标：输出 {{count}} 条分镜拓展方向。
返回 JSON 格式：{\"expansions\":[{title,scene,camera,mood,twist,seedIdea}]}`;

  const template = (promptTemplate || fallbackTemplate).replaceAll("{{count}}", String(ideaCount));
  const source = seedText || "（用户仅提供图片）";

  return [
    template,
    "",
    `模式：${mode.name}`,
    `模式要求：${mode.promptAddon}`,
    `风格倾向：${styleHint}`,
    `文本输入：${source}`,
    `图片输入：${imageProvided ? "已提供" : "未提供"}`,
  ].join("\n");
}

function buildImagePrompt({ idea, seedText, styleHint, mode }) {
  const title = cleanText(idea?.title);
  const scene = cleanText(idea?.scene);
  const camera = cleanText(idea?.camera);
  const mood = cleanText(idea?.mood);
  const twist = cleanText(idea?.twist);
  const source = cleanText(seedText);

  return [
    "你是一名电影分镜概念美术师。请根据以下描述生成一张高质量电影分镜图。",
    "要求：真实电影质感、明确主次关系、构图清晰、可用于前期提案。",
    "风格：不要出现水印、文字、Logo、字幕。",
    "",
    `模式：${mode.name}`,
    `风格倾向：${styleHint}`,
    source ? `原始种子：${source}` : "",
    title ? `分镜标题：${title}` : "",
    scene ? `画面描述：${scene}` : "",
    camera ? `镜头语言：${camera}` : "",
    mood ? `氛围情绪：${mood}` : "",
    twist ? `转折亮点：${twist}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFallbackImagePrompt({ idea, seedText, mode, styleHint }) {
  const title = cleanText(idea?.title);
  const scene = cleanText(idea?.scene);
  const camera = cleanText(idea?.camera);
  const mood = cleanText(idea?.mood);
  const source = cleanText(seedText);

  return [
    "Create ONE cinematic storyboard frame as an image only.",
    "No text, no subtitle, no logo, no watermark.",
    `Mode: ${mode.name}`,
    `Style bias: ${styleHint}`,
    source ? `Seed: ${source}` : "",
    title ? `Title: ${title}` : "",
    scene ? `Scene: ${scene}` : "",
    camera ? `Camera: ${camera}` : "",
    mood ? `Mood: ${mood}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildVideoPrompt({
  idea,
  seedText,
  styleHint,
  mode,
  aspectRatio,
  durationSeconds,
  negativePrompt,
  referenceImageUrl,
  referenceImageUrls,
  referenceImageDataUrlCount,
  continuityNote,
  transitionStyle,
  referenceImagePolicy,
  sequencePromptTemplate,
  storyboardSequence,
}) {
  const sequence = Array.isArray(storyboardSequence) ? storyboardSequence : [];
  if (sequence.length > 0) {
    const shotsText = sequence
      .map((shot, index) => {
        const title = cleanText(shot?.title);
        const scene = cleanText(shot?.scene);
        const camera = cleanText(shot?.camera);
        const mood = cleanText(shot?.mood);
        const twist = cleanText(shot?.twist);
        const seedIdea = cleanText(shot?.seedIdea);
        const parts = [
          `镜头 ${index + 1}:`,
          title ? `标题=${title}` : "",
          scene ? `画面=${scene}` : "",
          camera ? `镜头=${camera}` : "",
          mood ? `情绪=${mood}` : "",
          twist ? `转折=${twist}` : "",
          seedIdea ? `后续=${seedIdea}` : "",
        ].filter(Boolean);
        return parts.join(" | ");
      })
      .join("\n");

    const fallbackTemplate = [
      "你是一名电影导演与剪辑师。请把下面多条分镜串联为一条连续视频，镜头间必须环环相扣。",
      "要求：角色与场景保持连贯，镜头衔接自然，时间线连续，避免跳轴与突兀切换。",
      "输出：仅生成一条完整视频，不要文字水印，不要字幕。",
      "",
      "模式：{{modeName}}",
      "风格倾向：{{styleHint}}",
      "画幅比例：{{aspectRatio}}",
      "目标时长：约 {{durationSeconds}} 秒",
      "过渡风格：{{transitionStyle}}",
      "图像参与策略：{{referencePolicy}}",
      "连续性要求：{{continuityNote}}",
      "原始种子：{{seedText}}",
      "分镜链路（按顺序）：",
      "{{shots}}",
      "{{referenceImagesLine}}",
      "{{referenceImageLine}}",
      "{{negativePromptLine}}",
    ].join("\n");

    const referenceUrls = Array.isArray(referenceImageUrls) ? referenceImageUrls : [];
    const referenceImagesLine =
      referenceUrls.length > 0
        ? `参考图集合：${referenceUrls.join(" , ")}`
        : Number(referenceImageDataUrlCount) > 0
        ? `参考图集合：共 ${Number(referenceImageDataUrlCount)} 张内联图片`
        : "";

    const template = sequencePromptTemplate || fallbackTemplate;
    return template
      .replaceAll("{{modeName}}", mode.name)
      .replaceAll("{{styleHint}}", styleHint)
      .replaceAll("{{aspectRatio}}", aspectRatio)
      .replaceAll("{{durationSeconds}}", String(durationSeconds))
      .replaceAll("{{transitionStyle}}", transitionStyle || "match-cut")
      .replaceAll("{{referencePolicy}}", mapReferencePolicyLabel(referenceImagePolicy))
      .replaceAll("{{continuityNote}}", continuityNote || "角色、服装、时间与空间连续")
      .replaceAll("{{seedText}}", cleanText(seedText) || "（未提供）")
      .replaceAll("{{shots}}", shotsText || "（未提供分镜详情）")
      .replaceAll("{{referenceImagesLine}}", referenceImagesLine)
      .replaceAll("{{referenceImageLine}}", referenceImageUrl ? `参考图：${referenceImageUrl}` : "")
      .replaceAll("{{negativePromptLine}}", negativePrompt ? `禁止项：${negativePrompt}` : "")
      .trim();
  }

  const title = cleanText(idea?.title);
  const scene = cleanText(idea?.scene);
  const camera = cleanText(idea?.camera);
  const mood = cleanText(idea?.mood);
  const twist = cleanText(idea?.twist);
  const source = cleanText(seedText);

  return [
    "你是一名影视分镜导演。请将以下分镜生成一段单镜头短视频。",
    "要求：镜头运动稳定、主体清晰、电影感光影、无字幕无水印。",
    "",
    `模式：${mode.name}`,
    `风格倾向：${styleHint}`,
    `画幅比例：${aspectRatio}`,
    `时长：约 ${durationSeconds} 秒`,
    `图像参与策略：${mapReferencePolicyLabel(referenceImagePolicy)}`,
    source ? `原始种子：${source}` : "",
    title ? `分镜标题：${title}` : "",
    scene ? `画面描述：${scene}` : "",
    camera ? `镜头语言：${camera}` : "",
    mood ? `氛围情绪：${mood}` : "",
    twist ? `转折亮点：${twist}` : "",
    referenceImageUrl ? `参考图：${referenceImageUrl}` : "",
    negativePrompt ? `禁止项：${negativePrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseImagePart(dataUrl) {
  if (!dataUrl.startsWith("data:image/")) {
    return null;
  }

  const [header, data] = dataUrl.split(",");
  if (!data) {
    return null;
  }

  const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/);
  if (!mimeMatch) {
    return null;
  }

  return {
    inline_data: {
      mime_type: mimeMatch[1],
      data,
    },
  };
}

function extractGeneratedImage(body) {
  const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      const data = String(inlineData?.data || part?.data || "").trim();
      if (data) {
        const mimeType = String(inlineData?.mimeType || inlineData?.mime_type || "image/png").trim();
        return {
          dataUrl: `data:${mimeType};base64,${data}`,
          mimeType,
        };
      }
    }
  }

  return null;
}

function isNoImageResponse(body) {
  const reason = String(body?.candidates?.[0]?.finishReason || "").trim().toUpperCase();
  return reason === "NO_IMAGE";
}

function summarizeCandidateParts(body) {
  const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  const blockReason = String(body?.promptFeedback?.blockReason || "").trim();
  const firstFinishReason = String(candidates?.[0]?.finishReason || "").trim();
  const hint = [blockReason ? `blockReason=${blockReason}` : "", firstFinishReason ? `finishReason=${firstFinishReason}` : ""]
    .filter(Boolean)
    .join(", ");

  if (candidates.length === 0) {
    return hint ? `响应中无 candidates, ${hint}` : "响应中无 candidates";
  }

  const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : [];
  if (parts.length === 0) {
    return hint ? `candidates 无 parts, ${hint}` : "candidates 无 parts";
  }

  const labels = parts.map((part) => {
    const flags = [];
    if (part?.inlineData) flags.push("inlineData");
    if (part?.inline_data) flags.push("inline_data");
    if (typeof part?.text === "string") flags.push("text");
    if (part?.data) flags.push("data");
    return flags.join("+") || "unknown";
  });

  return hint ? `parts: ${labels.join(",")}, ${hint}` : `parts: ${labels.join(",")}`;
}

function extractText(body) {
  const candidates = body?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  const part = parts.find((item) => typeof item?.text === "string");
  return part?.text?.trim() || "";
}

function mapGeminiError(status, detail) {
  if (status === 400) return `请求参数错误：${detail}`;
  if (status === 401 || status === 403) return `鉴权失败，请检查 GEMINI_API_KEY 或模型权限：${detail}`;
  if (status === 404) return `模型不存在或接口地址错误：${detail}`;
  if (status === 429) return "请求过于频繁，触发限流。请稍后重试。";
  if (status >= 500) return "Gemini 服务暂时不可用，请稍后重试。";
  return `Gemini 请求失败：${detail}`;
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value, fallback, min, max) {
  const n = Number.parseFloat(String(value));
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeModel(value) {
  const model = String(value || "").trim();
  if (!model) return "";
  return model.slice(0, 100);
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeStoryboardSequence(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .slice(0, 24)
    .map((item) => ({
      title: cleanText(item?.title),
      scene: cleanText(item?.scene),
      camera: cleanText(item?.camera),
      mood: cleanText(item?.mood),
      twist: cleanText(item?.twist),
      seedIdea: cleanText(item?.seedIdea),
      referenceImageDataUrl: sanitizeReferenceImageDataUrl(item?.referenceImageDataUrl),
      referenceImageUrl: sanitizeReferenceImageUrl(item?.referenceImageUrl),
    }))
    .filter(
      (item) =>
        item.title ||
        item.scene ||
        item.camera ||
        item.mood ||
        item.twist ||
        item.seedIdea ||
        item.referenceImageDataUrl ||
        item.referenceImageUrl
    );
}

function sanitizeReferenceImagePolicy(input) {
  const safe = String(input || "")
    .trim()
    .toLowerCase();
  if (safe === "all" || safe === "keyframes" || safe === "first_last" || safe === "text_only") {
    return safe;
  }
  return "all";
}

function applyReferenceImagePolicy(storyboardSequence, inputPolicy) {
  const policy = sanitizeReferenceImagePolicy(inputPolicy);
  const sequence = Array.isArray(storyboardSequence) ? storyboardSequence : [];
  if (sequence.length === 0) {
    return [];
  }

  if (policy === "all") {
    return sequence.map((shot) => ({ ...shot }));
  }
  if (policy === "text_only") {
    return sequence.map((shot) => ({
      ...shot,
      referenceImageDataUrl: "",
      referenceImageUrl: "",
    }));
  }

  const keepIndexes = new Set();
  if (policy === "first_last") {
    keepIndexes.add(0);
    keepIndexes.add(sequence.length - 1);
  } else if (policy === "keyframes") {
    keepIndexes.add(0);
    keepIndexes.add(Math.floor((sequence.length - 1) / 2));
    keepIndexes.add(sequence.length - 1);
  }

  return sequence.map((shot, index) => {
    if (keepIndexes.has(index)) {
      return { ...shot };
    }
    return {
      ...shot,
      referenceImageDataUrl: "",
      referenceImageUrl: "",
    };
  });
}

function mapReferencePolicyLabel(inputPolicy) {
  const policy = sanitizeReferenceImagePolicy(inputPolicy);
  if (policy === "keyframes") return "关键帧三张";
  if (policy === "first_last") return "首尾两张";
  if (policy === "text_only") return "仅文本";
  return "全部镜头图";
}

function hasImageSeed(input) {
  const idea = input?.idea && typeof input.idea === "object" ? input.idea : {};
  return Boolean(
    String(idea?.title || "").trim() ||
      String(idea?.scene || "").trim() ||
      String(idea?.camera || "").trim() ||
      String(idea?.mood || "").trim() ||
      String(idea?.twist || "").trim() ||
      String(input?.seedText || "").trim()
  );
}

function resolveAuthMode(rawMode, endpointTemplate, apiKey) {
  const mode = String(rawMode || "").trim().toLowerCase();
  if (mode === "query" || mode === "bearer" || mode === "header" || mode === "none") {
    return mode;
  }

  if (!apiKey) {
    return "none";
  }

  if (!endpointTemplate || /generativelanguage\.googleapis\.com/i.test(endpointTemplate)) {
    return "query";
  }

  if (String(apiKey).startsWith("sk-")) {
    return "bearer";
  }

  return "query";
}

function buildGeminiEndpoint({ endpointTemplate, model, apiKey, authMode }) {
  const fallback = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const endpoint = endpointTemplate
    ? endpointTemplate.includes("{model}")
      ? endpointTemplate.replaceAll("{model}", encodeURIComponent(model))
      : endpointTemplate
    : fallback;

  if (authMode !== "query" || !apiKey) {
    return endpoint;
  }

  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function buildGeminiHeaders({ apiKey, authMode, keyHeader }) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (!apiKey || authMode === "none" || authMode === "query") {
    return headers;
  }

  if (authMode === "bearer") {
    headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  headers[keyHeader || "x-api-key"] = apiKey;
  return headers;
}

function appendApiKeyToUrl(rawUrl, apiKey, authMode) {
  const safeUrl = String(rawUrl || "").trim();
  if (!safeUrl) return "";
  if (authMode !== "query" || !apiKey) {
    return safeUrl;
  }
  try {
    const url = new URL(safeUrl);
    if (!url.searchParams.get("key")) {
      url.searchParams.set("key", apiKey);
    }
    return url.toString();
  } catch {
    return safeUrl;
  }
}

function encodeOperationPath(value) {
  return String(value || "")
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function hasVideoSeed(input) {
  const body = input && typeof input === "object" ? input : {};
  const idea = body?.idea && typeof body.idea === "object" ? body.idea : {};
  const sequence = normalizeStoryboardSequence(body?.storyboardSequence);
  return Boolean(
    String(idea?.title || "").trim() ||
      String(idea?.scene || "").trim() ||
      String(idea?.camera || "").trim() ||
      String(idea?.mood || "").trim() ||
      String(idea?.twist || "").trim() ||
      sequence.length > 0 ||
      String(body?.seedText || "").trim() ||
      String(body?.imageDataUrl || "").trim() ||
      String(body?.imageUrl || "").trim()
  );
}

function sanitizeReferenceImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    return raw.slice(0, 3000);
  }
  return "";
}

function sanitizeReferenceImageDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("data:image/")) {
    return "";
  }
  return raw.slice(0, 15_000_000);
}

function dedupeStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const safe = String(value || "").trim();
    if (!safe || seen.has(safe)) {
      continue;
    }
    seen.add(safe);
    out.push(safe);
  }
  return out;
}

function collectSequenceReferenceImages(storyboardSequence) {
  const sequence = Array.isArray(storyboardSequence) ? storyboardSequence : [];
  const dataUrls = [];
  const urls = [];
  for (const shot of sequence) {
    const dataUrl = sanitizeReferenceImageDataUrl(shot?.referenceImageDataUrl);
    const url = sanitizeReferenceImageUrl(shot?.referenceImageUrl);
    if (dataUrl) {
      dataUrls.push(dataUrl);
    }
    if (url) {
      urls.push(url);
    }
  }
  return {
    dataUrls: dedupeStrings(dataUrls),
    urls: dedupeStrings(urls),
  };
}

function sanitizeAspectRatio(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (!raw) return "16:9";
  const safe = raw.replace(/[^\d:/]/g, "");
  const allowed = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21", "2:3", "3:2"]);
  if (allowed.has(safe)) return safe;

  const match = safe.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return "16:9";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "16:9";
  }
  return `${width}:${height}`;
}

function isOperationDone(body) {
  if (!body || typeof body !== "object") {
    return false;
  }
  if (body.done === true) {
    return true;
  }

  const status = String(
    body?.status || body?.state || body?.operation?.status || body?.metadata?.state || ""
  )
    .trim()
    .toLowerCase();

  if (["done", "completed", "complete", "succeeded", "success", "finished"].includes(status)) {
    return true;
  }
  if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
    return true;
  }
  return false;
}

function isOperationFailed(body) {
  if (!body || typeof body !== "object") {
    return false;
  }
  if (body.error) {
    return true;
  }
  const status = String(
    body?.status || body?.state || body?.operation?.status || body?.metadata?.state || ""
  )
    .trim()
    .toLowerCase();
  return ["failed", "error", "cancelled", "canceled"].includes(status);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

