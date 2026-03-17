export function StatusBadge({ state, text }) {
  const classMap = {
    idle: "border-atelier-fg/20 text-atelier-subtle",
    loading: "animate-pulseSoft border-atelier-accent text-atelier-fg",
    success: "border-atelier-fg text-atelier-fg",
    error: "border-red-800/40 text-red-800",
  };

  return (
    <span className={`inline-flex border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${classMap[state] || classMap.idle}`}>
      {text}
    </span>
  );
}
