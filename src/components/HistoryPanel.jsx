import { formatTime } from "../lib/formatters";

export function HistoryPanel({ history, onRestore, onRemove, onClear }) {
  return (
    <section className="module-block mt-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow-label">History</p>
          <h3 className="module-title mt-2">最近记录</h3>
        </div>
        <button type="button" className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent" onClick={onClear}>
          清空历史
        </button>
      </div>

      {history.length === 0 ? (
        <p className="mt-3 text-sm text-atelier-subtle">暂无历史记录。</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {history.map((item, idx) => (
            <li key={item.id} className="card-luxe grid grid-cols-[1fr_auto] items-center gap-3 p-3" style={{ animationDelay: `${Math.min(idx * 45, 260)}ms` }}>
              <button type="button" className="min-w-0 text-left" onClick={() => onRestore(item.id)}>
                <p className="truncate text-sm text-atelier-fg transition-colors duration-500 hover:text-atelier-accent">{item.seedText || item.imageName || "仅图片输入"}</p>
                <p className="text-xs text-atelier-subtle">{item.modeName} · {item.count} 条 · {formatTime(item.createdAt)}</p>
              </button>
              <button type="button" className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent" onClick={() => onRemove(item.id)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
