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
const LEGACY_DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";
const DEFAULT_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || LEGACY_DEFAULT_MODEL;
const DEFAULT_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || DEFAULT_TEXT_MODEL;
const GEMINI_ENDPOINT = String(process.env.GEMINI_ENDPOINT || "").trim();
const GEMINI_API_KEY_MODE = String(process.env.GEMINI_API_KEY_MODE || "auto")
  .trim()
  .toLowerCase();
const GEMINI_KEY_HEADER = String(process.env.GEMINI_KEY_HEADER || "x-api-key").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 50000);
const IMAGE_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS || Math.max(REQUEST_TIMEOUT_MS, 90000));

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
        endpointConfigured: Boolean(GEMINI_ENDPOINT),
        authMode: resolveAuthMode(GEMINI_API_KEY_MODE, GEMINI_ENDPOINT, GEMINI_API_KEY),
      },
      "service healthy"
    )
  );
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
    textModel: body.textModel,
    imageModel: body.imageModel,
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

