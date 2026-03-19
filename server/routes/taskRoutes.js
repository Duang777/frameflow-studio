import { failure, success } from "../response.js";
import { cancelTask, createTask, getTask } from "../taskManager.js";
import {
  calcBatchProgress,
  generateImage,
  generateOne,
  generateVideo,
  hasImageSeed,
  hasVideoSeed,
  isApiKeyConfigured,
  normalizeBatchSeeds,
  sanitizeTaskPayload,
} from "../services/mediaService.js";

export function registerTaskRoutes(app) {
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
}

function ensureApiKey(res) {
  if (isApiKeyConfigured()) {
    return true;
  }
  res.status(500).json(failure("服务端未配置 GEMINI_API_KEY。请在 .env 中设置后重启。", 500));
  return false;
}
