const TASKS = new Map();
const MAX_TASKS = 200;
const FINAL_STATUSES = new Set(["success", "error", "cancelled"]);
const STAGE_CODES = new Set([
  "queued",
  "validating",
  "requesting_model",
  "polling",
  "retrying",
  "parsing_result",
  "completed",
  "failed",
  "cancelled",
  "running",
]);

export function createTask({ type, payload, run }) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const now = Date.now();
  const safeType = String(type || "unknown");
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const initialSummary = buildSummaryFromPayload(safeType, safePayload) || "排队中";

  const task = {
    id,
    type: safeType,
    status: "pending",
    progress: 0,
    stageCode: "queued",
    stage: "queued",
    stageText: "排队中",
    summary: initialSummary,
    payload: safePayload,
    result: null,
    error: "",
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };

  TASKS.set(id, task);
  trimTasks();

  queueMicrotask(async () => {
    const current = TASKS.get(id);
    if (!current || current.status === "cancelled") {
      return;
    }

    patchTask(id, {
      status: "running",
      progress: 5,
      stageCode: "queued",
      stage: "queued",
      stageText: "排队中",
      summary: initialSummary,
    });

    try {
      const result = await run({
        id,
        get: () => TASKS.get(id),
        setProgress: (value) => {
          const progress = Math.max(0, Math.min(100, Number(value) || 0));
          patchTask(id, { progress });
        },
        setStage: (stage, stageText) => {
          const stageCode = normalizeStageCode(stage);
          patchTask(id, {
            stageCode,
            stage: stageCode,
            stageText: String(stageText || ""),
            summary: String(stageText || buildSummaryFromPayload(safeType, safePayload) || "处理中"),
          });
        },
        patch: (partial) => patchTask(id, partial),
        isCancelled: () => TASKS.get(id)?.status === "cancelled",
      });

      const latest = TASKS.get(id);
      if (!latest || latest.status === "cancelled") {
        return;
      }

      patchTask(id, {
        status: "success",
        progress: 100,
        stageCode: "completed",
        stage: "completed",
        stageText: "完成",
        summary: "完成",
        result: result || {},
        finishedAt: Date.now(),
      });
    } catch (error) {
      const latest = TASKS.get(id);
      if (!latest || latest.status === "cancelled") {
        return;
      }

      patchTask(id, {
        status: "error",
        stageCode: "failed",
        stage: "failed",
        stageText: "失败",
        summary: error?.message || "任务失败",
        error: error?.message || "Task failed",
        finishedAt: Date.now(),
      });
    }
  });

  return sanitizeTask(task);
}

export function getTask(taskId) {
  const task = TASKS.get(taskId);
  return task ? sanitizeTask(task) : null;
}

export function cancelTask(taskId) {
  const task = TASKS.get(taskId);
  if (!task) {
    return null;
  }

  if (FINAL_STATUSES.has(task.status)) {
    return sanitizeTask(task);
  }

  patchTask(taskId, {
    status: "cancelled",
    stageCode: "cancelled",
    stage: "cancelled",
    stageText: "已取消",
    summary: "已取消",
    error: "Task cancelled by user",
    finishedAt: Date.now(),
  });
  return sanitizeTask(TASKS.get(taskId));
}

function patchTask(taskId, partial) {
  const current = TASKS.get(taskId);
  if (!current) {
    return;
  }

  const nextStageCode =
    partial && typeof partial === "object" && "stageCode" in partial
      ? normalizeStageCode(partial.stageCode)
      : partial && typeof partial === "object" && "stage" in partial
      ? normalizeStageCode(partial.stage)
      : current.stageCode;

  TASKS.set(taskId, {
    ...current,
    ...partial,
    stageCode: nextStageCode,
    stage: nextStageCode,
    summary:
      String(partial?.summary || "").trim() ||
      (partial?.stageText ? String(partial.stageText).trim() : "") ||
      current.summary ||
      buildSummaryFromPayload(current.type, current.payload),
    updatedAt: Date.now(),
  });
}

function sanitizeTask(task) {
  if (!task) return null;
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    stageCode: task.stageCode || normalizeStageCode(task.stage),
    stage: task.stage,
    stageText: task.stageText,
    summary: task.summary || "",
    payload: task.payload && typeof task.payload === "object" ? task.payload : {},
    retryable: task.status === "error",
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt,
  };
}

function trimTasks() {
  if (TASKS.size <= MAX_TASKS) {
    return;
  }

  const sorted = [...TASKS.values()].sort((a, b) => a.createdAt - b.createdAt);
  const removable = sorted.slice(0, TASKS.size - MAX_TASKS);
  removable.forEach((task) => TASKS.delete(task.id));
}

function normalizeStageCode(input) {
  const stage = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (STAGE_CODES.has(stage)) {
    return stage;
  }
  return "running";
}

function buildSummaryFromPayload(type, payload) {
  const safeType = String(type || "").trim();
  const safePayload = payload && typeof payload === "object" ? payload : {};
  if (safeType === "video" && Number(safePayload.sequenceCount) > 1) {
    const sequenceCount = Number(safePayload.sequenceCount) || 0;
    const policy = String(safePayload.referenceImagePolicy || "all");
    return `串联视频 · 镜头 ${sequenceCount} · 策略 ${policy}`;
  }
  if (safeType === "image") {
    return "分镜出图任务";
  }
  if (safeType === "batch") {
    const count = Number(safePayload.seedsCount) || 0;
    return `批量拓展任务 · ${count} 条种子`;
  }
  if (safeType === "expand") {
    return "分镜拓展任务";
  }
  return "";
}
