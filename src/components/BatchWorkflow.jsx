export function BatchWorkflow({
  batchText,
  setBatchText,
  batchCount,
  onRun,
  running,
  batchResults,
}) {
  return (
    <section className="module-block mt-0">
      <p className="eyebrow-label">Batch</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="module-title">批量生成工作流</h3>
          <p className="mt-1 text-sm text-atelier-subtle">每行一个分镜种子，适合一次处理多个创意方向。</p>
        </div>
        <button
          type="button"
          disabled={running || batchCount === 0}
          className="min-h-10 border border-atelier-fg px-6 text-[10px] uppercase tracking-[0.2em] transition-colors duration-500 hover:bg-atelier-fg hover:text-atelier-inverse disabled:opacity-50"
          onClick={onRun}
        >
          {running ? "批量处理中" : `批量生成 (${batchCount})`}
        </button>
      </div>

      <textarea
        value={batchText}
        onChange={(event) => setBatchText(event.target.value)}
        placeholder="示例：\n夜市摊位前，主角第一次见到反派。\n办公室电梯门将关闭，角色突然冲出。\n天台逆光，角色递出一张折皱照片。"
        className="mt-4 min-h-36 w-full border border-atelier-fg/15 bg-white/45 p-3 text-sm leading-relaxed text-atelier-fg outline-none transition-colors duration-500 placeholder:font-display placeholder:italic placeholder:text-atelier-subtle focus:border-atelier-accent"
      />

      {batchResults.length > 0 && (
        <div className="mt-4 grid gap-2">
          {batchResults.map((result, index) => (
            <article key={`${result.seed}-${index}`} className="card-luxe p-3" style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">任务 #{index + 1}</p>
              <p className="mt-1 text-sm text-atelier-fg">{result.seed}</p>
              {result.error ? (
                <p className="mt-2 text-xs text-red-800">{result.error}</p>
              ) : (
                <p className="mt-2 text-xs text-atelier-subtle">已生成 {result.expansions?.length || 0} 条</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
