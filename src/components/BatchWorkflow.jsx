export function BatchWorkflow({
  batchText,
  setBatchText,
  batchCount,
  onRun,
  running,
  batchResults,
  onUseResult,
  onCopySeed,
  onCopyResult,
  onExportResult,
}) {
  const successCount = batchResults.filter((item) => !item.error).length;

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
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-atelier-fg/15 pb-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">批量结果</span>
            <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">总数 {batchResults.length}</span>
            <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">成功 {successCount}</span>
            <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">失败 {batchResults.length - successCount}</span>
          </div>

          <div className="mt-3 grid gap-3">
            {batchResults.map((result, index) => {
              const hasError = Boolean(result.error);
              const expansions = Array.isArray(result.expansions) ? result.expansions : [];
              const topTitle = expansions[0]?.title || "无结果";

              return (
                <article
                  key={`${result.seed}-${index}`}
                  className="group card-luxe relative p-3 md:p-4"
                  style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-atelier-accent/45 opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

                  <div className="flex flex-wrap items-center gap-2 border-b border-atelier-fg/10 pb-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">任务 #{index + 1}</span>
                    <span
                      className={`border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${
                        hasError
                          ? "border-red-800/30 text-red-800"
                          : "border-atelier-fg/15 text-atelier-subtle"
                      }`}
                    >
                      {hasError ? "失败" : `成功 · ${expansions.length} 条`}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-atelier-fg">{result.seed}</p>

                  {hasError ? (
                    <p className="mt-2 text-xs text-red-800">{result.error}</p>
                  ) : (
                    <div className="mt-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">首条结果</p>
                      <p className="mt-1 truncate text-sm text-atelier-fg">{topTitle}</p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3 border-t border-atelier-fg/10 pt-2 opacity-85 transition-opacity duration-500 group-hover:opacity-100">
                    <ActionButton onClick={() => onCopySeed?.(result.seed)}>复制 Seed</ActionButton>
                    {!hasError && <ActionButton onClick={() => onUseResult?.(result, index)}>载入画布</ActionButton>}
                    {!hasError && <ActionButton onClick={() => onCopyResult?.(result, index)}>复制结果</ActionButton>}
                    {!hasError && <ActionButton onClick={() => onExportResult?.(result, index)}>导出</ActionButton>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function ActionButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent"
    >
      {children}
    </button>
  );
}
