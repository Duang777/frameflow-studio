import { useCallback } from "react";
import { useLocalStorageState } from "../lib/storage";

const MAX_TASK_RUNS = 20;

export function useTaskQueueState(storageKey = "atelier_task_runs_react") {
  const [taskRuns, setTaskRuns] = useLocalStorageState(storageKey, []);

  const startTaskRun = useCallback(
    ({ type, title, summary, ...meta }) => {
      const now = Date.now();
      const run = {
        id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
        type,
        status: "running",
        progress: 0,
        stageText: "排队中",
        title: String(title || "任务"),
        summary: String(summary || ""),
        startedAt: now,
        durationMs: 0,
        retryPayload: meta.retryPayload || null,
        resultPayload: null,
        ...meta,
      };
      setTaskRuns((prev) => [run, ...(Array.isArray(prev) ? prev : [])].slice(0, MAX_TASK_RUNS));
      return run.id;
    },
    [setTaskRuns]
  );

  const finishTaskRun = useCallback(
    (id, patch) => {
      const taskId = String(id || "").trim();
      if (!taskId) return;
      const now = Date.now();
      setTaskRuns((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item.id === taskId
            ? {
                ...item,
                ...patch,
                finishedAt: now,
                durationMs: Math.max(0, now - Number(item.startedAt || now)),
              }
            : item
        )
      );
    },
    [setTaskRuns]
  );

  const patchTaskRun = useCallback(
    (id, patch) => {
      const taskId = String(id || "").trim();
      if (!taskId) return;
      setTaskRuns((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item.id === taskId
            ? {
                ...item,
                ...patch,
              }
            : item
        )
      );
    },
    [setTaskRuns]
  );

  const removeTaskRun = useCallback((id) => {
    const taskId = String(id || "").trim();
    if (!taskId) return;
    setTaskRuns((prev) => (Array.isArray(prev) ? prev : []).filter((item) => item.id !== taskId));
  }, [setTaskRuns]);

  const clearTaskRuns = useCallback(() => setTaskRuns([]), [setTaskRuns]);

  return {
    taskRuns,
    setTaskRuns,
    startTaskRun,
    finishTaskRun,
    patchTaskRun,
    removeTaskRun,
    clearTaskRuns,
  };
}
