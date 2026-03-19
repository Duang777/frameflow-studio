export const QUEUE_FILTER_MODES = {
  all: true,
  running: true,
  failed: true,
};

export const WORKFLOW_HUB_TABS = {
  batch: true,
  queue: true,
  history: true,
  advanced: true,
};

export const IDEA_MEDIA_FILTER_IDS = new Set(["all", "with_image", "with_video", "no_media"]);

export function normalizeQueueFilter(value) {
  const mode = String(value || "").toLowerCase();
  return QUEUE_FILTER_MODES[mode] ? mode : "all";
}

export function normalizeWorkflowHubTab(value) {
  const mode = String(value || "").toLowerCase();
  return WORKFLOW_HUB_TABS[mode] ? mode : "batch";
}

export function normalizeIdeaMediaFilter(value) {
  const mode = String(value || "").toLowerCase();
  return IDEA_MEDIA_FILTER_IDS.has(mode) ? mode : "all";
}

export function normalizeReferenceImagePolicyValue(value) {
  const safe = String(value || "")
    .trim()
    .toLowerCase();
  if (safe === "all" || safe === "keyframes" || safe === "first_last" || safe === "text_only") {
    return safe;
  }
  return "all";
}

export function formatReferenceImagePolicyLabel(value) {
  const safe = normalizeReferenceImagePolicyValue(value);
  if (safe === "all") return "全部图参";
  if (safe === "keyframes") return "关键帧";
  if (safe === "first_last") return "首尾帧";
  return "仅文本";
}

export function splitImageReference(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return { dataUrl: "", url: "" };
  }
  if (value.startsWith("data:image/")) {
    return { dataUrl: value, url: "" };
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { dataUrl: "", url: value };
  }
  return { dataUrl: "", url: "" };
}

export function applyReferencePolicyToSequenceIdeas(sequenceIdeas, policy) {
  const sequence = Array.isArray(sequenceIdeas) ? sequenceIdeas : [];
  const safePolicy = normalizeReferenceImagePolicyValue(policy);
  if (sequence.length === 0) {
    return [];
  }

  if (safePolicy === "all") {
    return sequence.map((shot) => ({ ...shot }));
  }

  if (safePolicy === "text_only") {
    return sequence.map((shot) => ({
      ...shot,
      referenceImageDataUrl: "",
      referenceImageUrl: "",
    }));
  }

  const keepIndexes = new Set();
  if (safePolicy === "first_last") {
    keepIndexes.add(0);
    keepIndexes.add(sequence.length - 1);
  } else if (safePolicy === "keyframes") {
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

export function countSequenceReferenceImages(sequenceIdeas) {
  const sequence = Array.isArray(sequenceIdeas) ? sequenceIdeas : [];
  return sequence.filter((shot) => {
    const dataUrl = String(shot?.referenceImageDataUrl || "").trim();
    const url = String(shot?.referenceImageUrl || "").trim();
    return Boolean(dataUrl || url);
  }).length;
}

export function formatTaskStageSummary(task) {
  const stageText = String(task?.stageText || "").trim();
  const progress = Number(task?.progress);
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
  if (stageText) {
    return `${stageText} · ${safeProgress}%`;
  }
  return `任务进度 ${safeProgress}%`;
}

export function isIdeaImageReady(idea) {
  const status = String(idea?.generatedImage?.status || "").trim().toLowerCase();
  const url = String(idea?.generatedImage?.url || "").trim();
  return status === "success" && Boolean(url);
}

export function isIdeaVideoReady(idea) {
  const status = String(idea?.generatedVideo?.status || "").trim().toLowerCase();
  const url = String(idea?.generatedVideo?.url || "").trim();
  return status === "success" && Boolean(url);
}
