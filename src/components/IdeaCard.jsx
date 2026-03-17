import { buildIdeaCopyText } from "../lib/formatters";

export function IdeaCard({ idea, index, onCopy, onRemix, onFavorite, favorite }) {
  return (
    <article
      className="group card-luxe motion-rise min-w-0 p-4 md:p-5"
      style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
    >
      <header className="mb-3 flex items-start justify-between gap-3 border-b border-atelier-fg/10 pb-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-atelier-subtle">#{index + 1}</p>
        <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">
          <button type="button" className="underline-reveal transition-colors duration-500 hover:text-atelier-accent" onClick={() => onCopy(buildIdeaCopyText(idea, index))}>复制</button>
          <button type="button" className="underline-reveal transition-colors duration-500 hover:text-atelier-accent" onClick={() => onRemix(index)}>再生成</button>
          <button
            type="button"
            className={`underline-reveal transition-colors duration-500 ${favorite ? "text-atelier-accent" : "hover:text-atelier-accent"}`}
            onClick={() => onFavorite(index)}
          >
            {favorite ? "已收藏" : "收藏"}
          </button>
        </div>
      </header>

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
