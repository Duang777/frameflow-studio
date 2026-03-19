import { failure, success } from "../response.js";
import { generateImage, generateOne, generateVideo, isApiKeyConfigured, normalizeBatchSeeds } from "../services/mediaService.js";

export function registerMediaRoutes(app) {
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
}

function ensureApiKey(res) {
  if (isApiKeyConfigured()) {
    return true;
  }
  res.status(500).json(failure("服务端未配置 GEMINI_API_KEY。请在 .env 中设置后重启。", 500));
  return false;
}
