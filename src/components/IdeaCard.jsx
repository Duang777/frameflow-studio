import { buildIdeaCopyText } from "../lib/formatters";

export function IdeaCard({
  idea,
  index,
  onCopy,
  onRemix,
  onGenerateImage,
  onDownloadImage,
  onGenerateVideo,
  onDownloadVideo,
  onFavorite,
  favorite,
  selected,
  onToggleSelect,
  imageState,
  videoState,
}) {
  const imageStatus = imageState?.status || "idle";
  const hasRenderableImage = imageStatus === "success" && isRenderableImageUrl(imageState?.url);
  const canDownloadImage = hasRenderableImage;
  const safeVideoState = videoState || { status: "idle", url: "", error: "", model: "" };
  const videoStatus = safeVideoState?.status || "idle";
  const hasRenderableVideo = videoStatus === "success" && isRenderableVideoUrl(safeVideoState?.url);
  const canDownloadVideo = hasRenderableVideo;

  return (
    <article
      data-idea-card-index={index}
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
            className="underline-reveal transition-colors duration-500 hover:text-atelier-accent disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => onGenerateVideo?.(index)}
            disabled={videoStatus === "loading"}
          >
            {videoStatus === "loading" ? "生成视频中" : videoStatus === "success" ? "重生视频" : "生成视频"}
          </button>
          {canDownloadVideo && (
            <button type="button" className="underline-reveal transition-colors duration-500 hover:text-atelier-accent" onClick={() => onDownloadVideo?.(index)}>
              下载视频
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

          {hasRenderableImage && (
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

          {imageStatus === "success" && !hasRenderableImage && (
            <p className="text-xs leading-relaxed text-red-800">
              图片数据无效，请点击“重绘图”重新生成。
            </p>
          )}

          {imageStatus === "error" && (
            <p className="text-xs leading-relaxed text-red-800">{imageState?.error || "出图失败，请稍后重试。"}</p>
          )}
        </div>
      )}

      {(videoStatus === "loading" || videoStatus === "success" || videoStatus === "error") && (
        <div className="mb-4 border-t border-atelier-fg/10 pt-3">
          {videoStatus === "loading" && (
            <div className="relative aspect-video overflow-hidden border border-atelier-fg/15 bg-atelier-muted/45">
              <div className="absolute inset-0 animate-pulseSoft bg-gradient-to-r from-atelier-muted/20 via-white/20 to-atelier-muted/20" />
              <p className="absolute bottom-2 left-2 text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">
                Rendering Motion
              </p>
            </div>
          )}

          {hasRenderableVideo && (
            <figure className="group/video">
              <div className="relative aspect-video overflow-hidden border border-atelier-fg/15 shadow-[0_4px_18px_rgba(0,0,0,0.08)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
                <video
                  src={safeVideoState.url}
                  controls
                  preload="metadata"
                  playsInline
                  className="h-full w-full object-cover grayscale transition-all duration-[1700ms] ease-out group-hover/video:scale-[1.02] group-hover/video:grayscale-0"
                />
              </div>
              <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                <span>{safeVideoState?.model ? `Model · ${safeVideoState.model}` : "Storyboard Motion"}</span>
                {Number(safeVideoState?.durationSeconds) > 0 && <span>{`时长 · ${safeVideoState.durationSeconds}s`}</span>}
              </figcaption>
            </figure>
          )}

          {videoStatus === "success" && !hasRenderableVideo && (
            <p className="text-xs leading-relaxed text-red-800">
              视频数据无效，请点击“重生视频”重新生成。
            </p>
          )}

          {videoStatus === "error" && (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-red-800">{safeVideoState?.error || "视频生成失败，请稍后重试。"}</p>
              <button
                type="button"
                className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent"
                onClick={() => onGenerateVideo?.(index)}
              >
                重试视频任务
              </button>
            </div>
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

function isRenderableImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (value.startsWith("data:image/")) {
    return value.includes(",") && value.length > 64;
  }
  return value.startsWith("http://") || value.startsWith("https://");
}

function isRenderableVideoUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (value.startsWith("data:video/")) {
    return value.includes(",") && value.length > 64;
  }
  return value.startsWith("http://") || value.startsWith("https://");
}

function MetaRow({ label, value }) {
  return (
    <div className="border-t border-atelier-fg/10 pt-2">
      <dt className="text-[10px] uppercase tracking-[0.22em] text-atelier-subtle">{label}</dt>
      <dd className="mt-1 break-words text-xs leading-relaxed text-atelier-fg">{value || "-"}</dd>
    </div>
  );
}
