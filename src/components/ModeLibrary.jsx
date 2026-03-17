export function ModeLibrary({ modes, activeModeId, onSelect }) {
  return (
    <section className="module-block">
      <p className="eyebrow-label">Mode Library</p>
      <h3 className="module-title mt-2">分镜模式库</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {modes.map((mode) => {
          const active = mode.id === activeModeId;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.id)}
              className={`card-luxe px-3 py-3 text-left ${active ? "border-atelier-accent bg-atelier-muted/45" : ""}`}
            >
              <p className="font-display text-xl">{mode.name}</p>
              <p className="text-[11px] uppercase tracking-editorial text-atelier-subtle">{mode.subtitle}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
