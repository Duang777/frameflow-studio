import { useMemo } from "react";
import { formatTime } from "../lib/formatters";
import { StatusBadge } from "./StatusBadge";

const TASK_STATUS_MAP = {
  pending: { badgeState: "idle", badgeText: "Queued" },
  running: { badgeState: "loading", badgeText: "Running" },
  success: { badgeState: "success", badgeText: "Done" },
  error: { badgeState: "error", badgeText: "Failed" },
  cancelled: { badgeState: "idle", badgeText: "Canceled" },
};

const TYPE_LABEL_MAP = {
  expand: "Expand",
  remix: "Remix",
  batch: "Batch",
  image: "Image",
};

const FILTER_OPTIONS = {
  all: true,
  running: true,
  failed: true,
};

export function TaskQueuePanel({ runs, onClear, onRemove, filterMode = "all", onFilterChange }) {
  const safeFilterMode = FILTER_OPTIONS[filterMode] ? filterMode : "all";

  const filteredRuns = useMemo(() => {
    if (safeFilterMode === "running") {
      return runs.filter((run) => run.status === "running" || run.status === "pending");
    }
    if (safeFilterMode === "failed") {
      return runs.filter((run) => run.status === "error");
    }
    return runs;
  }, [safeFilterMode, runs]);

  const runningCount = useMemo(
    () => runs.filter((run) => run.status === "running" || run.status === "pending").length,
    [runs]
  );
  const failedCount = useMemo(() => runs.filter((run) => run.status === "error").length, [runs]);

  return (
    <section className="module-block mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow-label">Tasks</p>
          <h3 className="module-title mt-2">Task Queue</h3>
        </div>
        <button
          type="button"
          className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent"
          onClick={onClear}
          disabled={runs.length === 0}
        >
          Clear Tasks
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <QueueFilterButton
          active={safeFilterMode === "all"}
          label={`全部 ${runs.length}`}
          onClick={() => onFilterChange?.("all")}
        />
        <QueueFilterButton
          active={safeFilterMode === "running"}
          label={`运行中 ${runningCount}`}
          onClick={() => onFilterChange?.("running")}
        />
        <QueueFilterButton
          active={safeFilterMode === "failed"}
          label={`失败 ${failedCount}`}
          onClick={() => onFilterChange?.("failed")}
        />
      </div>

      {filteredRuns.length === 0 ? (
        <p className="mt-3 text-sm text-atelier-subtle">
          {runs.length === 0 ? "No tasks yet." : "No tasks match the current filter."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {filteredRuns.map((run, idx) => {
            const statusMeta = TASK_STATUS_MAP[run.status] || {
              badgeState: "idle",
              badgeText: run.status || "Unknown",
            };
            const duration = formatDuration(run.durationMs);
            const progress = normalizeProgress(run.progress);
            const stageText = String(run.stageText || "").trim();
            return (
              <li
                key={run.id}
                className="card-luxe grid grid-cols-[1fr_auto] items-start gap-3 p-3"
                style={{ animationDelay: `${Math.min(idx * 45, 260)}ms` }}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                      {TYPE_LABEL_MAP[run.type] || run.type || "Task"}
                    </span>
                    <StatusBadge state={statusMeta.badgeState} text={statusMeta.badgeText} />
                    <span className="text-xs text-atelier-subtle">{formatTime(run.startedAt)}</span>
                    {duration && <span className="text-xs text-atelier-subtle">Duration {duration}</span>}
                    <span className="text-xs text-atelier-subtle">{progress}%</span>
                  </div>
                  {stageText && <p className="mt-1 text-xs text-atelier-subtle">{stageText}</p>}
                  <p className="mt-1 truncate text-sm text-atelier-fg">{run.title}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden border border-atelier-fg/10 bg-white/40">
                    <span
                      className="block h-full bg-atelier-accent transition-[width] duration-700 ease-out"
                      style={{ width: `${progress}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-1 text-xs text-atelier-subtle">{run.summary || "Processing..."}</p>
                </div>
                <button
                  type="button"
                  className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent"
                  onClick={() => onRemove(run.id)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatDuration(input) {
  const ms = Number(input);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function normalizeProgress(input) {
  const value = Number(input);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function QueueFilterButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors duration-500 ${
        active
          ? "border-atelier-accent bg-atelier-accent text-atelier-inverse"
          : "border-atelier-fg/20 text-atelier-subtle hover:border-atelier-accent hover:text-atelier-accent"
      }`}
    >
      {label}
    </button>
  );
}
