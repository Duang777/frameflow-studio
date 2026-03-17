export function normalizeIdeas(payload) {
  const raw =
    (Array.isArray(payload) && payload) ||
    (Array.isArray(payload?.expansions) && payload.expansions) ||
    (Array.isArray(payload?.ideas) && payload.ideas) ||
    [];

  const deduped = new Map();

  raw.forEach((item, index) => {
    const normalized = {
      title: clean(item?.title || item?.name || `分镜方向 ${index + 1}`),
      scene: clean(item?.scene || item?.description || item?.visual),
      camera: clean(item?.camera || item?.shot || item?.lens),
      mood: clean(item?.mood || item?.emotion || item?.tone),
      twist: clean(item?.twist || item?.hook || item?.conflict),
      seedIdea: clean(item?.seedIdea || item?.nextStep || item?.continuation),
    };

    if (!normalized.scene && !normalized.twist && !normalized.seedIdea) {
      return;
    }

    const key = `${normalized.title}|${normalized.scene}`;
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  });

  return [...deduped.values()];
}

export function ensureIdeaCount(ideas, count, seedText) {
  const target = clampInt(count, 8, 1, 12);
  const result = [...ideas.slice(0, target)];

  while (result.length < target) {
    const idx = result.length + 1;
    result.push({
      title: `补充分镜 ${idx}`,
      scene: `围绕“${seedText || "输入分镜"}”改变时空或叙事顺序，形成新的冲突焦点。`,
      camera: "建议先稳定构图再切入运动镜头，制造节奏对比。",
      mood: "在原情绪基础上增加次级情绪层。",
      twist: "结尾加入重新定义前文的视觉信息。",
      seedIdea: "可继续拆成3-5个连续镜头形成片段。",
    });
  }

  return result;
}

export function parseJsonText(text) {
  const cleaned = stripFence(text);
  const candidates = [cleaned, extractBlock(cleaned, "{", "}"), extractBlock(cleaned, "[", "]")].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }

  throw new Error("模型输出无法解析为 JSON。");
}

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stripFence(text) {
  return String(text).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function extractBlock(text, startChar, endChar) {
  const start = text.indexOf(startChar);
  const end = text.lastIndexOf(endChar);
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return text.slice(start, end + 1);
}

function clampInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value), 10);
  if (Number.isNaN(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}
