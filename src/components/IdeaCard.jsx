import { buildIdeaCopyText } from "../lib/formatters";

export function IdeaCard({
  idea,
  index,
  onCopy,
  onRemix,
  onGenerateImage,
  onDownloadImage,
  onFavorite,
  favorite,
  selected,
  onToggleSelect,
  imageState,
}) {
  const imageStatus = imageState?.status || "idle";
  const canDownloadImage = imageStatus === "success" && Boolean(imageState?.url);

  return (
    <article
      className={`group card-luxe motion-rise min-w-0 p-4 md:p-5 ${selected ? "border-atelier-accent bg-atelier-muted/45 shadow-[0_14px_30px_rgba(0,0,0,0.09)]" : ""}`}
      style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
    >
      <header className="mb-3 flex items-start justify-between gap-3 border-b border-atelier-fg/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`inline-flex min-h-7 min-w-7 items-center justify-center border text-[10px] uppercase tracking-[0.2em] transition-colors duration-500 ${
              selected
                ? "border-atelier-accent bg-atelier-accent text-atelier-inverse"
                : "border-atelier-fg/25 text-atelier-subtle hover:border-atelier-accent hover:text-atelier-accent"
            }`}
            onClick={onToggleSelect}
            title="选择卡片（按住 Shift 可范围选择）"
          >
            {selected ? "✓" : "选"}
          </button>
          <p className="text-[10px] uppercase tracking-[0.22em] text-atelier-subtle">#{index + 1}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">
          <button type="button" className="underline-reveal transition-colors duration-500 hover:text-atelier-accent" onClick={() => onCopy(buildIdeaCopyText(idea, index))}>复制</button>
          <button type="button" className="underline-reveal transition-colors duration-500 hover:text-atelier-accent" onClick={() => onRemix(index)}>再生成</button>
          <button
            type="button"
            className="underline-reveal transition-colors duration-500 hover:text-atelier-accent disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => onGenerateImage?.(index)}
            disabled={imageStatus === "loading"}
          >
            {imageStatus === "loading" ? "生成中" : imageStatus === "success" ? "重绘图" : "生成图"}
          </button>
          {canDownloadImage && (
            <button type="button" className="underline-reveal transition-colors duration-500 hover:text-atelier-accent" onClick={() => onDownloadImage?.(index)}>
              下载图
            </button>
          )}
          <button
            type="button"
            className={`underline-reveal transition-colors duration-500 ${favorite ? "text-atelier-accent" : "hover:text-atelier-accent"}`}
            onClick={() => onFavorite(index)}
          >
            {favorite ? "已收藏" : "收藏"}
          </button>
        </div>
      </header>

      {(imageStatus === "loading" || imageStatus === "success" || imageStatus === "error") && (
        <div className="mb-4 border-t border-atelier-fg/10 pt-3">
          {imageStatus === "loading" && (
            <div className="relative aspect-[16/9] overflow-hidden border border-atelier-fg/15 bg-atelier-muted/45">
              <div className="absolute inset-0 animate-pulseSoft bg-gradient-to-r from-atelier-muted/20 via-white/20 to-atelier-muted/20" />
              <p className="absolute bottom-2 left-2 text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">Rendering Frame</p>
            </div>
          )}

          {imageStatus === "success" && (
            <figure className="group/image">
              <div className="relative aspect-[16/9] overflow-hidden border border-atelier-fg/15 shadow-[0_4px_18px_rgba(0,0,0,0.08)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
                <img
                  src={imageState?.url}
                  alt={`分镜图 #${index + 1}`}
                  className="h-full w-full object-cover grayscale transition-all duration-[1700ms] ease-out group-hover/image:scale-[1.03] group-hover/image:grayscale-0"
                />
              </div>
              <figcaption className="mt-2 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                {imageState?.model ? `Model · ${imageState.model}` : "Storyboard Frame"}
              </figcaption>
            </figure>
          )}

          {imageStatus === "error" && (
            <p className="text-xs leading-relaxed text-red-800">{imageState?.error || "出图失败，请稍后重试。"}</p>
          )}
        </div>
      )}

      <h3 className="mb-3 break-words font-display text-3xl font-normal leading-tight text-atelier-fg">{idea.title}</h3>
      <p className="mb-4 break-words text-sm leading-relaxed text-atelier-fg">{idea.scene || "（无画面描述）"}</p>

      <dl className="grid gap-3">
        <MetaRow label="镜头建议" value={idea.camera} />
        <MetaRow label="氛围情绪" value={idea.mood} />
        <MetaRow label="转折亮点" value={idea.twist} />
        <MetaRow label="后续种子" value={idea.seedIdea} />
      </dl>
    </article>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="border-t border-atelier-fg/10 pt-2">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-atelier-subtle">{label}</dt>
      <dd className="mt-1 break-words text-xs leading-relaxed text-atelier-fg">{value || "-"}</dd>
    </div>
  );
}
