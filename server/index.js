import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { failure, success } from "./response.js";
import { cancelTask, createTask, getTask } from "./taskManager.js";
import { ensureIdeaCount, normalizeIdeas, parseJsonText } from "./utils.js";
import { getModeById, STORYBOARD_MODES, STYLE_HINTS } from "./modes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 50000);

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  res.json(success({ ok: true, hasApiKey: Boolean(GEMINI_API_KEY), defaultModel: DEFAULT_MODEL }, "service healthy"));
});

app.get("/api/modes", (_req, res) => {
  res.json(success({ modes: STORYBOARD_MODES }, "modes fetched"));
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
  return {
    modeId: body.modeId,
    styleBias: body.styleBias,
    ideaCount: body.ideaCount,
    model: body.model,
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
  const model = sanitizeModel(input?.model) || DEFAULT_MODEL;
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

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  onStage("requesting_model", "请求模型", 38);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

