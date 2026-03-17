const TASKS = new Map();
const MAX_TASKS = 200;

export function createTask({ type, payload, run }) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const now = Date.now();
  const task = {
    id,
    type: String(type || "unknown"),
    status: "pending",
    progress: 0,
    payload: payload || {},
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

    patchTask(id, { status: "running", progress: 5 });

    try {
      const result = await run({
        id,
        get: () => TASKS.get(id),
        setProgress: (value) => {
          const progress = Math.max(0, Math.min(100, Number(value) || 0));
          patchTask(id, { progress });
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

  if (["success", "error", "cancelled"].includes(task.status)) {
    return sanitizeTask(task);
  }

  patchTask(taskId, {
    status: "cancelled",
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

  TASKS.set(taskId, {
    ...current,
    ...partial,
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
