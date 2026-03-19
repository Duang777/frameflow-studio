import { IdeaCard } from "../IdeaCard";
import { StatusBadge } from "../StatusBadge";

export function ResultCanvas({
  resultsAnchorRef,
  status,
  activeMode,
  activeStyleLabel,
  settings,
  textModelValue,
  imageModelValue,
  videoModelValue,
  filterModes,
  filterMode,
  onChangeFilterMode,
  ideaMediaFilters,
  ideaMediaFilter,
  onChangeIdeaMediaFilter,
  normalizeIdeaMediaFilter,
  ideaSearchText,
  onChangeIdeaSearchText,
  visibleEntries,
  selectedVisibleCount,
  loading,
  ideas,
  selectedIdeaIndexes,
  onCopyAll,
  onExportMarkdown,
  onExportJson,
  onSelectAllVisible,
  onClearSelection,
  onBatchGenerateSelectedImages,
  batchImageRunning,
  anyImageLoading,
  onOpenWorkflowHub,
  onCopySingle,
  onRemixOne,
  onGenerateIdeaImage,
  onDownloadIdeaImage,
  onGenerateIdeaVideo,
  onDownloadIdeaVideo,
  onToggleFavorite,
  onToggleSelectIdea,
}) {
  return (
    <section className="workbench-panel motion-rise motion-rise-delay-2 relative">
      <div ref={resultsAnchorRef} className="absolute -top-2 left-0 h-px w-px" aria-hidden="true" />
      <p className="vertical-tag right-[-22px] top-5 hidden lg:block">Results / Edition</p>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-atelier-fg/15 pb-4">
        <div>
          <p className="flex items-center gap-3 text-[10px] uppercase tracking-editorial text-atelier-subtle">
            <span className="h-px w-10 bg-atelier-fg" />
            Output
          </p>
          <h2 className="mt-3 font-display text-5xl font-normal leading-[0.95]">拓展结果画布</h2>
        </div>
        <div className="status-console max-w-sm">
          <StatusBadge state={status.kind} text={status.badge} />
          <p className="mt-2 text-sm text-atelier-subtle">{status.text}</p>
        </div>
      </header>

      <section className="module-block mt-4">
        <div className="flex flex-wrap gap-2">
          <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
            模式 · {activeMode.name}
          </span>
          <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
            风格 · {activeStyleLabel}
          </span>
          <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
            条数 · {settings.ideaCount}
          </span>
          <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
            文本模型 · {textModelValue}
          </span>
          <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
            出图模型 · {imageModelValue}
          </span>
          <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
            视频模型 · {videoModelValue}
          </span>
        </div>
      </section>

      <div className="toolbar-shelf mt-4 flex flex-wrap items-center gap-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">筛选</p>
        {filterModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChangeFilterMode(mode.id)}
            className={`border px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors duration-500 ${
              filterMode === mode.id
                ? "border-atelier-accent bg-atelier-accent text-atelier-inverse"
                : "border-atelier-fg/20 text-atelier-subtle hover:border-atelier-accent hover:text-atelier-accent"
            }`}
          >
            {mode.label}
          </button>
        ))}
        <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
          可见 {visibleEntries.length}
        </span>
        <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
          已选 {selectedVisibleCount}
        </span>
        <span className="mx-1 h-4 w-px bg-atelier-fg/20" aria-hidden="true" />
        {ideaMediaFilters.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChangeIdeaMediaFilter(mode.id)}
            className={`border px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors duration-500 ${
              normalizeIdeaMediaFilter(ideaMediaFilter) === mode.id
                ? "border-atelier-accent bg-atelier-accent text-atelier-inverse"
                : "border-atelier-fg/20 text-atelier-subtle hover:border-atelier-accent hover:text-atelier-accent"
            }`}
          >
            {mode.label}
          </button>
        ))}
        <label className="ml-auto flex min-w-[220px] items-center gap-2 border-b border-atelier-fg/20 px-1 py-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">检索</span>
          <input
            type="text"
            value={ideaSearchText}
            onChange={(event) => onChangeIdeaSearchText(event.target.value)}
            className="w-full bg-transparent text-xs text-atelier-fg outline-none placeholder:italic placeholder:text-atelier-subtle"
            placeholder="标题 / 场景 / 摄影 / 情绪"
          />
        </label>
      </div>

      <div className="toolbar-shelf mt-2 flex flex-wrap gap-4">
        <ToolbarButton onClick={onCopyAll} disabled={ideas.length === 0}>
          复制全部
        </ToolbarButton>
        <ToolbarButton onClick={onExportMarkdown} disabled={ideas.length === 0}>
          导出 Markdown
        </ToolbarButton>
        <ToolbarButton onClick={onExportJson} disabled={ideas.length === 0}>
          导出 JSON
        </ToolbarButton>
        <ToolbarButton onClick={onSelectAllVisible} disabled={visibleEntries.length === 0}>
          全选可见
        </ToolbarButton>
        <ToolbarButton onClick={onClearSelection} disabled={selectedIdeaIndexes.length === 0}>
          清除选择
        </ToolbarButton>
        <ToolbarButton
          onClick={onBatchGenerateSelectedImages}
          disabled={selectedIdeaIndexes.length === 0 || batchImageRunning || anyImageLoading}
        >
          {batchImageRunning ? "出图中" : "所选出图"}
        </ToolbarButton>
        <ToolbarButton onClick={onOpenWorkflowHub}>更多操作</ToolbarButton>
      </div>

      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {Array.from({ length: Number(settings.ideaCount) }).map((_, idx) => (
            <article key={idx} className="animate-pulseSoft border-t border-atelier-fg/10 pt-4">
              <div className="h-3 w-16 bg-atelier-fg/10" />
              <div className="mt-3 h-6 w-3/4 bg-atelier-fg/10" />
              <div className="mt-2 h-3 w-full bg-atelier-fg/10" />
              <div className="mt-2 h-3 w-2/3 bg-atelier-fg/10" />
            </article>
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <section className="result-empty mt-6">
          <h3 className="font-display text-3xl font-normal">尚未生成</h3>
          <p className="mt-2 max-w-2xl text-sm text-atelier-subtle">
            从一个镜头起步，扩展成可拍摄、可重组、可继续写成完整分镜脚本的一组方向。
          </p>
        </section>
      ) : visibleEntries.length === 0 ? (
        <section className="result-empty mt-6">
          <h3 className="font-display text-3xl font-normal">当前筛选无结果</h3>
          <p className="mt-2 max-w-2xl text-sm text-atelier-subtle">可切回“全部”或调整收藏状态查看对应分镜。</p>
        </section>
      ) : (
        <section className="mt-6 grid gap-5 md:grid-cols-2">
          {visibleEntries.map(({ idea, index, favorite }) => (
            <IdeaCard
              key={`${idea?.title || "idea"}-${index}`}
              idea={idea}
              index={index}
              onCopy={onCopySingle}
              onRemix={onRemixOne}
              onGenerateImage={onGenerateIdeaImage}
              onDownloadImage={onDownloadIdeaImage}
              onGenerateVideo={onGenerateIdeaVideo}
              onDownloadVideo={onDownloadIdeaVideo}
              onFavorite={onToggleFavorite}
              favorite={favorite}
              selected={selectedIdeaIndexes.includes(index)}
              onToggleSelect={(event) => onToggleSelectIdea(index, event.shiftKey)}
              imageState={idea.generatedImage}
              videoState={idea.generatedVideo}
            />
          ))}
        </section>
      )}
    </section>
  );
}

function ToolbarButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent disabled:opacity-45"
    >
      {children}
    </button>
  );
}
