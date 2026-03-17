import { formatTime } from "../lib/formatters";
import { StatusBadge } from "./StatusBadge";

const TASK_STATUS_MAP = {
  running: { badgeState: "loading", badgeText: "Running" },
  success: { badgeState: "success", badgeText: "Done" },
  error: { badgeState: "error", badgeText: "Failed" },
  cancelled: { badgeState: "idle", badgeText: "Canceled" },
};

const TYPE_LABEL_MAP = {
  expand: "Expand",
  remix: "Remix",
  batch: "Batch",
};

export function TaskQueuePanel({ runs, onClear, onRemove }) {
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

      {runs.length === 0 ? (
        <p className="mt-3 text-sm text-atelier-subtle">No tasks yet.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {runs.map((run, idx) => {
            const statusMeta = TASK_STATUS_MAP[run.status] || {
              badgeState: "idle",
              badgeText: run.status || "Unknown",
            };
            const duration = formatDuration(run.durationMs);
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
                  </div>
                  <p className="mt-2 truncate text-sm text-atelier-fg">{run.title}</p>
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
