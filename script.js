const STORAGE_KEYS = {
  settings: "atelier_settings_v2",
  history: "atelier_history_v2",
  favorites: "atelier_favorites_v2",
};

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_HISTORY = 18;
const REQUEST_TIMEOUT_MS = 50000;
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='1125' viewBox='0 0 900 1125'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%23ebe5de'/%3E%3Cstop offset='1' stop-color='%23d7cfc3'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='900' height='1125'/%3E%3Cg fill='none' stroke='%231a1a1a' stroke-opacity='.25'%3E%3Cpath d='M100 250h700M100 500h700M100 750h700'/%3E%3Cpath d='M200 150v820M450 150v820M700 150v820'/%3E%3C/g%3E%3Ctext x='86' y='940' font-family='serif' font-size='62' fill='%231a1a1a' fill-opacity='.8'%3EStoryboard / Input Canvas%3C/text%3E%3C/svg%3E";

const DEFAULT_PROMPT = `你是资深分镜导演与镜头设计顾问。

目标：基于“输入文本 + 输入图片(可选)”生成 {{count}} 条分镜拓展方向。
输出语言：简体中文。

必须输出 JSON，禁止 Markdown。格式：
{
  "expansions": [
    {
      "title": "标题",
      "scene": "2-3句画面描述，强调动作、场景元素和叙事信息",
      "camera": "镜头运动、景别或机位建议",
      "mood": "氛围与情绪",
      "twist": "亮点反转或冲突信息",
      "seedIdea": "继续扩写成连续镜头的方向"
    }
  ]
}

约束：
1) expansions 数量必须等于 {{count}}。
2) 保持与输入核心主题相关，避免重复。
3) 每条都有明确差异：至少在时间、空间、叙事视角、冲突类型、节奏其中两项上不同。
4) 兼顾“可拍摄性”和“脑洞感”。`;

const STYLE_HINTS = {
  cinematic: "偏电影感：强调景别变化、调度与光影层次。",
  suspense: "偏悬疑推进：加强线索埋设、信息差与不确定性。",
  poetic: "偏诗意氛围：使用意象与留白构建情绪流。",
  comedic: "偏反差喜剧：加入意外节奏和反差笑点。",
  wild: "偏超现实：允许大胆跳跃，但保留叙事可读性。",
};

const state = {
  settings: {
    apiKey: "",
    model: "gemini-2.0-flash",
    styleBias: "cinematic",
    ideaCount: 8,
    temperature: 1,
    topP: 0.9,
    logicPrompt: DEFAULT_PROMPT,
  },
  seedText: "",
  imagePart: null,
  imageDataUrl: "",
  imageName: "",
  ideas: [],
  history: [],
  favorites: {},
  pendingController: null,
  isLoading: false,
  abortReason: "",
  lastGenerateContext: null,
};

const els = {
  form: document.getElementById("expanderForm"),
  seedText: document.getElementById("seedText"),
  seedCount: document.getElementById("seedCount"),
  imageInput: document.getElementById("imageInput"),
  imageHint: document.getElementById("imageHint"),
  imagePreview: document.getElementById("imagePreview"),
  imageCaption: document.getElementById("imageCaption"),
  styleBias: document.getElementById("styleBias"),
  ideaCount: document.getElementById("ideaCount"),
  temperature: document.getElementById("temperature"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  topP: document.getElementById("topP"),
  logicPrompt: document.getElementById("logicPrompt"),
  generateBtn: document.getElementById("generateBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  statusBadge: document.getElementById("statusBadge"),
  statusText: document.getElementById("statusText"),
  emptyState: document.getElementById("emptyState"),
  resultGrid: document.getElementById("resultGrid"),
  copyAllBtn: document.getElementById("copyAllBtn"),
  exportMdBtn: document.getElementById("exportMdBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  clearResultBtn: document.getElementById("clearResultBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  historyList: document.getElementById("historyList"),
  ideaCardTpl: document.getElementById("ideaCardTpl"),
  historyItemTpl: document.getElementById("historyItemTpl"),
};

bootstrap();

function bootstrap() {
  hydrateStorage();
  hydrateInputs();
  bindEvents();
  renderPreviewImage();
  renderIdeas();
  renderHistory();
  updateSeedCount();
  updateToolbarState();
  setStatus("idle", "待命中", "输入分镜后点击“拓展分镜”。");
}

function hydrateStorage() {
  try {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "null");
    if (settings && typeof settings === "object") {
      state.settings = {
        ...state.settings,
        ...settings,
      };
      state.settings.ideaCount = sanitizeInt(state.settings.ideaCount, 8, 6, 10);
      state.settings.temperature = sanitizeFloat(state.settings.temperature, 1, 0, 2);
      state.settings.topP = sanitizeFloat(state.settings.topP, 0.9, 0, 1);
    }

    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || "[]");
    if (Array.isArray(history)) {
      state.history = history.slice(0, MAX_HISTORY);
    }

    const favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || "{}");
    if (favorites && typeof favorites === "object") {
      state.favorites = favorites;
    }
  } catch {
    state.history = [];
    state.favorites = {};
  }
}

function hydrateInputs() {
  els.apiKey.value = state.settings.apiKey;
  els.model.value = state.settings.model;
  els.styleBias.value = state.settings.styleBias;
  els.ideaCount.value = String(state.settings.ideaCount);
  els.temperature.value = String(state.settings.temperature);
  els.topP.value = String(state.settings.topP);
  els.logicPrompt.value = state.settings.logicPrompt || DEFAULT_PROMPT;
  els.seedText.value = state.seedText;
}

function bindEvents() {
  els.form.addEventListener("submit", onGenerate);
  els.seedText.addEventListener("input", () => {
    state.seedText = els.seedText.value;
    updateSeedCount();
  });
  els.imageInput.addEventListener("change", onImagePicked);
  els.cancelBtn.addEventListener("click", cancelPending);

  els.copyAllBtn.addEventListener("click", copyAllIdeas);
  els.exportMdBtn.addEventListener("click", () => exportIdeas("md"));
  els.exportJsonBtn.addEventListener("click", () => exportIdeas("json"));
  els.clearResultBtn.addEventListener("click", clearResults);
  els.clearHistoryBtn.addEventListener("click", clearHistory);

  els.resultGrid.addEventListener("click", onCardActionClick);
  els.historyList.addEventListener("click", onHistoryActionClick);

  [els.apiKey, els.model, els.styleBias, els.ideaCount, els.temperature, els.topP, els.logicPrompt].forEach((input) => {
    input.addEventListener("input", persistSettingsFromInputs);
    input.addEventListener("change", persistSettingsFromInputs);
  });

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      els.generateBtn.click();
    }
  });

  window.addEventListener("online", () => {
    if (!state.isLoading) {
      setStatus("idle", "待命中", "网络已恢复，可继续生成。");
    }
  });

  window.addEventListener("offline", () => {
    setStatus("error", "离线模式", "网络已断开，无法访问 Gemini API。", true);
  });
}

function persistSettingsFromInputs() {
  state.settings.apiKey = els.apiKey.value.trim();
  state.settings.model = els.model.value.trim() || "gemini-2.0-flash";
  state.settings.styleBias = els.styleBias.value;
  state.settings.ideaCount = sanitizeInt(els.ideaCount.value, 8, 6, 10);
  state.settings.temperature = sanitizeFloat(els.temperature.value, 1, 0, 2);
  state.settings.topP = sanitizeFloat(els.topP.value, 0.9, 0, 1);
  state.settings.logicPrompt = els.logicPrompt.value.trim() || DEFAULT_PROMPT;
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
}

async function onImagePicked(event) {
  const file = event.target.files?.[0];
  if (!file) {
    resetImageInput();
    return;
  }

  if (!file.type.startsWith("image/")) {
    resetImageInput();
    setStatus("error", "图片格式不支持", "请选择 JPG / PNG / WEBP 图像文件。", true);
    return;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    resetImageInput();
    setStatus("error", "图片过大", "当前限制为 8MB，请压缩后重试。", true);
    return;
  }

  try {
    const dataUrl = await readAsDataUrl(file);
    const base64 = getBase64FromDataUrl(dataUrl);
    state.imagePart = {
      inline_data: {
        mime_type: file.type,
        data: base64,
      },
    };
    state.imageDataUrl = dataUrl;
    state.imageName = file.name;

    els.imageHint.textContent = `已选择：${file.name}`;
    renderPreviewImage();
    setStatus("idle", "图片已就绪", "已附加图片输入。你可以直接生成。", false);
  } catch (error) {
    resetImageInput();
    setStatus("error", "图片读取失败", error.message || "文件读取异常。", true);
  }
}

async function onGenerate(event) {
  event.preventDefault();
  if (state.isLoading) {
    return;
  }

  persistSettingsFromInputs();
  state.seedText = els.seedText.value.trim();

  if (!state.settings.apiKey) {
    setStatus("error", "缺少 API Key", "请填写 Gemini API Key 后重试。", true);
    els.apiKey.focus();
    return;
  }

  if (!state.seedText && !state.imagePart) {
    setStatus("error", "缺少输入内容", "至少提供文字或图片中的一项。", true);
    els.seedText.focus();
    return;
  }

  if (!navigator.onLine) {
    setStatus("error", "离线模式", "当前无网络连接，无法请求 Gemini。", true);
    return;
  }

  const prompt = composePrompt();
  const targetCount = state.settings.ideaCount;

  state.lastGenerateContext = {
    seedText: state.seedText,
    styleBias: state.settings.styleBias,
    prompt,
  };

  setLoading(true);
  renderSkeleton(targetCount);
  setStatus("loading", "生成中", "Gemini 正在展开分镜分支，请稍候。", false);

  const controller = new AbortController();
  state.pendingController = controller;
  const timeoutTimer = setTimeout(() => {
    state.abortReason = "timeout";
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const payload = await requestExpansions({
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      prompt,
      imagePart: state.imagePart,
      temperature: state.settings.temperature,
      topP: state.settings.topP,
      signal: controller.signal,
    });

    const normalized = normalizeExpansions(payload);
    const expanded = ensureCount(normalized, targetCount, state.seedText);

    state.ideas = expanded;
    renderIdeas();
    pushHistory();
    setStatus(
      "success",
      "生成完成",
      `本次已生成 ${expanded.length} 条分镜方向（风格：${labelByStyle(state.settings.styleBias)}）。`,
      false
    );
  } catch (error) {
    const userMessage = formatError(error);
    renderIdeas();
    setStatus("error", "生成失败", userMessage, true);
  } finally {
    clearTimeout(timeoutTimer);
    state.pendingController = null;
    state.abortReason = "";
    setLoading(false);
  }
}

function cancelPending() {
  if (state.pendingController) {
    state.abortReason = "manual";
    state.pendingController.abort();
  }
}

function composePrompt() {
  const template = state.settings.logicPrompt || DEFAULT_PROMPT;
  const withCount = template.replaceAll("{{count}}", String(state.settings.ideaCount));
  const styleHint = STYLE_HINTS[state.settings.styleBias] || STYLE_HINTS.cinematic;

  const sourceText = state.seedText || "（用户未提供文本，仅有图片参考）";
  const imageHint = state.imageName ? `已附加图片：${state.imageName}` : "未附加图片";

  return [
    withCount,
    "",
    `风格偏好：${styleHint}`,
    `输入文本：${sourceText}`,
    `图片状态：${imageHint}`,
  ].join("\n");
}

async function requestExpansions({ apiKey, model, prompt, imagePart, temperature, topP, signal }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts = [{ text: prompt }];
  if (imagePart) {
    parts.push(imagePart);
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature,
          topP,
        },
      }),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    throw new Error("网络请求失败，请确认网络或代理设置。", { cause: error });
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const backendMessage = body?.error?.message || `HTTP ${response.status}`;
    const mapped = mapApiError(response.status, backendMessage);
    throw new Error(mapped);
  }

  const text = extractText(body);
  if (!text) {
    throw new Error("模型未返回有效文本。请尝试更换模型或降低温度。");
  }

  return parsePossibleJson(text);
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

  const textPart = parts.find((part) => typeof part?.text === "string");
  return textPart?.text?.trim() || "";
}

function parsePossibleJson(rawText) {
  const cleaned = stripCodeFence(rawText);
  const attempts = [cleaned, extractJsonObject(cleaned), extractJsonArray(cleaned)].filter(Boolean);

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  throw new Error("模型输出无法解析为 JSON，请调整 Prompt 或重试。");
}

function stripCodeFence(text) {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return text.slice(start, end + 1);
}

function extractJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return text.slice(start, end + 1);
}

function normalizeExpansions(payload) {
  const arrayLike =
    (Array.isArray(payload) && payload) ||
    (Array.isArray(payload?.expansions) && payload.expansions) ||
    (Array.isArray(payload?.ideas) && payload.ideas) ||
    [];

  const unique = new Map();

  arrayLike.forEach((item, index) => {
    const normalized = {
      title: cleanText(item?.title || item?.name || `分镜方向 ${index + 1}`),
      scene: cleanText(item?.scene || item?.description || item?.visual),
      camera: cleanText(item?.camera || item?.shot || item?.lens),
      mood: cleanText(item?.mood || item?.emotion || item?.tone),
      twist: cleanText(item?.twist || item?.hook || item?.conflict),
      seedIdea: cleanText(item?.seedIdea || item?.nextStep || item?.continuation),
    };

    if (!normalized.scene && !normalized.twist && !normalized.seedIdea) {
      return;
    }

    const dedupeKey = `${normalized.title}|${normalized.scene}`;
    if (!unique.has(dedupeKey)) {
      unique.set(dedupeKey, normalized);
    }
  });

  return [...unique.values()];
}

function ensureCount(list, count, seedText) {
  const target = sanitizeInt(count, 8, 6, 10);
  const filled = [...list.slice(0, target)];

  while (filled.length < target) {
    const i = filled.length + 1;
    filled.push({
      title: `补充分镜 ${i}`,
      scene: `围绕“${seedText || "上传分镜图片"}”改写叙事条件：替换时空背景或角色动机，让场景出现新的冲突重心。`,
      camera: "建议使用先静后动的镜头组织，形成节奏反差。",
      mood: "保持主题一致，同时引入次级情绪。",
      twist: "在结尾加入改变观众理解的视觉信息。",
      seedIdea: "可继续拆为 3-5 个连续镜头，形成 mini-sequence。",
    });
  }

  return filled;
}

function renderIdeas() {
  els.resultGrid.innerHTML = "";
  const hasIdeas = state.ideas.length > 0;
  els.emptyState.hidden = hasIdeas;

  if (!hasIdeas) {
    updateToolbarState();
    return;
  }

  state.ideas.forEach((idea, index) => {
    const fragment = els.ideaCardTpl.content.cloneNode(true);
    const article = fragment.querySelector(".idea-card");

    article.dataset.index = String(index);
    fragment.querySelector(".idea-index").textContent = `#${index + 1}`;
    fragment.querySelector(".idea-title").textContent = idea.title;
    fragment.querySelector(".idea-scene").textContent = idea.scene || "（无画面描述）";
    fragment.querySelector(".idea-camera").textContent = idea.camera || "自由镜头组织";
    fragment.querySelector(".idea-mood").textContent = idea.mood || "按项目风格补齐";
    fragment.querySelector(".idea-twist").textContent = idea.twist || "补充意外信息点";
    fragment.querySelector(".idea-seed").textContent = idea.seedIdea || "继续扩写连续镜头";

    const favBtn = fragment.querySelector('[data-action="favorite"]');
    const favKey = ideaKey(idea);
    const isFavorite = Boolean(state.favorites[favKey]);
    favBtn.classList.toggle("is-favorite", isFavorite);
    favBtn.textContent = isFavorite ? "已收藏" : "收藏";

    els.resultGrid.appendChild(fragment);
  });

  updateToolbarState();
}

function renderSkeleton(count) {
  els.emptyState.hidden = true;
  els.resultGrid.innerHTML = "";

  for (let i = 0; i < count; i += 1) {
    const box = document.createElement("article");
    box.className = "skeleton";
    box.innerHTML = "<div></div><div></div><div></div>";
    els.resultGrid.appendChild(box);
  }
}

function onCardActionClick(event) {
  const actionBtn = event.target.closest(".card-action");
  if (!actionBtn) {
    return;
  }

  const card = actionBtn.closest(".idea-card");
  const index = Number(card?.dataset.index ?? -1);
  if (!Number.isInteger(index) || index < 0 || index >= state.ideas.length) {
    return;
  }

  const action = actionBtn.dataset.action;
  if (action === "copy") {
    copySingleIdea(index);
    return;
  }

  if (action === "favorite") {
    toggleFavorite(index);
    return;
  }

  if (action === "remix") {
    remixIdea(index);
  }
}

async function copySingleIdea(index) {
  const idea = state.ideas[index];
  const text = ideaToText(idea, index + 1);

  try {
    await navigator.clipboard.writeText(text);
    setStatus("success", "已复制", `第 ${index + 1} 条分镜已复制到剪贴板。`, false);
  } catch {
    setStatus("error", "复制失败", "浏览器未允许剪贴板写入。", true);
  }
}

function toggleFavorite(index) {
  const idea = state.ideas[index];
  const key = ideaKey(idea);
  if (state.favorites[key]) {
    delete state.favorites[key];
  } else {
    state.favorites[key] = {
      title: idea.title,
      savedAt: Date.now(),
    };
  }
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
  renderIdeas();
}

async function remixIdea(index) {
  if (state.isLoading) {
    return;
  }

  if (!state.settings.apiKey) {
    setStatus("error", "缺少 API Key", "请先填写 API Key。", true);
    return;
  }

  const source = state.ideas[index];
  const remixPrompt = [
    "你是分镜导演助手。",
    "请基于给定分镜，输出一个替代版本，保持主题相关但角度明显不同。",
    "必须返回 JSON：{\"expansions\":[{title,scene,camera,mood,twist,seedIdea}]}",
    "只返回 1 条。",
    `原分镜：${JSON.stringify(source, null, 0)}`,
    `全局主题：${state.lastGenerateContext?.seedText || state.seedText || ""}`,
  ].join("\n");

  setLoading(true);
  setStatus("loading", "再生成中", `正在重写第 ${index + 1} 条分镜。`, false);

  const controller = new AbortController();
  state.pendingController = controller;
  const timeoutTimer = setTimeout(() => {
    state.abortReason = "timeout";
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const payload = await requestExpansions({
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      prompt: remixPrompt,
      imagePart: state.imagePart,
      temperature: state.settings.temperature,
      topP: state.settings.topP,
      signal: controller.signal,
    });

    const next = normalizeExpansions(payload)[0];
    if (!next) {
      throw new Error("再生成返回为空，请重试。");
    }

    state.ideas[index] = next;
    renderIdeas();
    setStatus("success", "再生成完成", `第 ${index + 1} 条已更新。`, false);
  } catch (error) {
    setStatus("error", "再生成失败", formatError(error), true);
  } finally {
    clearTimeout(timeoutTimer);
    state.pendingController = null;
    state.abortReason = "";
    setLoading(false);
  }
}

async function copyAllIdeas() {
  if (!state.ideas.length) {
    setStatus("error", "无可复制内容", "请先生成分镜结果。", true);
    return;
  }

  const payload = state.ideas.map((idea, i) => ideaToText(idea, i + 1)).join("\n\n");

  try {
    await navigator.clipboard.writeText(payload);
    setStatus("success", "复制完成", "已复制全部分镜。", false);
  } catch {
    setStatus("error", "复制失败", "浏览器未允许剪贴板写入。", true);
  }
}

function exportIdeas(type) {
  if (!state.ideas.length) {
    setStatus("error", "无可导出内容", "请先生成分镜结果。", true);
    return;
  }

  const stamp = new Date();
  const filenameBase = `storyboard-expansion-${formatFileDate(stamp)}`;

  if (type === "json") {
    const payload = {
      generatedAt: stamp.toISOString(),
      seedText: state.seedText,
      imageName: state.imageName,
      styleBias: state.settings.styleBias,
      ideas: state.ideas,
    };
    downloadBlob(`${filenameBase}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setStatus("success", "导出完成", "JSON 文件已下载。", false);
    return;
  }

  const markdown = [
    "# Storyboard Expansions",
    "",
    `- 生成时间：${formatTime(stamp)}`,
    `- 风格：${labelByStyle(state.settings.styleBias)}`,
    `- 文本输入：${state.seedText || "(无)"}`,
    `- 图片输入：${state.imageName || "(无)"}`,
    "",
    ...state.ideas.map((idea, i) => {
      return [
        `## #${i + 1} ${idea.title}`,
        "",
        `- 画面：${idea.scene || "-"}`,
        `- 镜头：${idea.camera || "-"}`,
        `- 情绪：${idea.mood || "-"}`,
        `- 转折：${idea.twist || "-"}`,
        `- 延展：${idea.seedIdea || "-"}`,
        "",
      ].join("\n");
    }),
  ].join("\n");

  downloadBlob(`${filenameBase}.md`, markdown, "text/markdown;charset=utf-8");
  setStatus("success", "导出完成", "Markdown 文件已下载。", false);
}

function clearResults() {
  state.ideas = [];
  renderIdeas();
  setStatus("idle", "已清空", "结果区已清空。", false);
}

function pushHistory() {
  const item = {
    id: String(Date.now()),
    createdAt: Date.now(),
    seedText: state.seedText,
    imageName: state.imageName,
    styleBias: state.settings.styleBias,
    count: state.ideas.length,
    ideas: state.ideas,
  };

  state.history = [item, ...state.history].slice(0, MAX_HISTORY);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  els.historyList.innerHTML = "";

  if (!state.history.length) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = '<span class="history-meta">暂无历史记录。</span>';
    els.historyList.appendChild(li);
    return;
  }

  state.history.forEach((item) => {
    const fragment = els.historyItemTpl.content.cloneNode(true);
    const li = fragment.querySelector(".history-item");
    const main = fragment.querySelector(".history-main");

    li.dataset.id = item.id;
    main.dataset.action = "restore";

    fragment.querySelector(".history-title").textContent = item.seedText || item.imageName || "仅图片输入";
    fragment.querySelector(".history-meta").textContent = `${labelByStyle(item.styleBias)} · ${item.count} 条 · ${formatTime(item.createdAt)}`;

    const remove = fragment.querySelector(".history-remove");
    remove.dataset.action = "remove";

    els.historyList.appendChild(fragment);
  });
}

function onHistoryActionClick(event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }

  const itemNode = target.closest(".history-item");
  const id = itemNode?.dataset.id;
  if (!id) {
    return;
  }

  const action = target.dataset.action;
  if (action === "remove") {
    state.history = state.history.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
    renderHistory();
    return;
  }

  const record = state.history.find((item) => item.id === id);
  if (!record) {
    return;
  }

  state.seedText = record.seedText || "";
  els.seedText.value = state.seedText;
  updateSeedCount();
  state.ideas = Array.isArray(record.ideas) ? record.ideas : [];
  renderIdeas();

  setStatus("success", "历史已恢复", `已恢复 ${formatTime(record.createdAt)} 的生成结果。`, false);
}

function clearHistory() {
  state.history = [];
  localStorage.removeItem(STORAGE_KEYS.history);
  renderHistory();
  setStatus("idle", "历史已清空", "本地历史记录已删除。", false);
}

function renderPreviewImage() {
  els.imagePreview.src = state.imageDataUrl || PLACEHOLDER_IMAGE;
  els.imageCaption.textContent = state.imageName
    ? `已附图：${state.imageName}`
    : "未上传图片，当前将仅根据文本生成。";
}

function resetImageInput() {
  state.imagePart = null;
  state.imageDataUrl = "";
  state.imageName = "";
  els.imageInput.value = "";
  els.imageHint.textContent = "支持 JPG / PNG / WEBP，最大 8MB。";
  renderPreviewImage();
}

function updateSeedCount() {
  const count = els.seedText.value.length;
  els.seedCount.textContent = `${count} / 1200`;
}

function setLoading(loading) {
  state.isLoading = loading;
  els.generateBtn.disabled = loading;
  els.cancelBtn.disabled = !loading;
  const label = els.generateBtn.querySelector(".label");
  if (label) {
    label.textContent = loading ? "生成中" : "拓展分镜";
  }
}

function setStatus(type, badgeText, detailText, isError) {
  els.statusBadge.className = `status status-${type}`;
  els.statusBadge.textContent = badgeText;
  els.statusText.textContent = detailText;
  els.statusText.style.color = isError ? "#7f2d2d" : "";
}

function updateToolbarState() {
  const disabled = state.ideas.length === 0;
  [els.copyAllBtn, els.exportMdBtn, els.exportJsonBtn, els.clearResultBtn].forEach((btn) => {
    btn.disabled = disabled;
  });
}

function mapApiError(status, message) {
  if (status === 400) {
    return `请求参数无效：${message}`;
  }

  if (status === 401 || status === 403) {
    return `鉴权失败：请检查 API Key 或模型权限。(${message})`;
  }

  if (status === 404) {
    return `模型不存在或接口地址错误：${message}`;
  }

  if (status === 429) {
    return "请求过于频繁，已触发限流。请稍后再试。";
  }

  if (status >= 500) {
    return "Gemini 服务暂时不可用，请稍后重试。";
  }

  return `请求失败：${message}`;
}

function formatError(error) {
  if (error?.name === "AbortError") {
    if (state.abortReason === "timeout" || String(error?.message).toLowerCase().includes("timeout")) {
      return "请求超时（50 秒）。可减少输入长度或稍后重试。";
    }
    return "请求已取消。";
  }

  const message = error?.message || "未知错误";
  return message;
}

function ideaToText(idea, index) {
  return [
    `#${index} ${idea.title}`,
    `画面：${idea.scene || "-"}`,
    `镜头：${idea.camera || "-"}`,
    `情绪：${idea.mood || "-"}`,
    `转折：${idea.twist || "-"}`,
    `延展：${idea.seedIdea || "-"}`,
  ].join("\n");
}

function ideaKey(idea) {
  return `${idea.title}__${idea.scene}`.slice(0, 260);
}

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

function getBase64FromDataUrl(dataUrl) {
  return dataUrl.split(",")[1] || "";
}

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value), 10);
  if (Number.isNaN(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function sanitizeFloat(value, fallback, min, max) {
  const num = Number.parseFloat(String(value));
  if (Number.isNaN(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function labelByStyle(style) {
  const map = {
    cinematic: "电影感叙事",
    suspense: "悬疑推进",
    poetic: "诗意氛围",
    comedic: "反差喜剧",
    wild: "超现实脑洞",
  };

  return map[style] || style;
}

function formatTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}-${h}${mm}`;
}
