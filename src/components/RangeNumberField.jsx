export function RangeNumberField({
  value,
  min,
  max,
  step = 0.1,
  onChange,
  formatValue,
}) {
  const numericValue = normalizeNumber(value, min, max, min);
  const ratio = ((numericValue - min) / Math.max(0.0001, max - min)) * 100;

  const commit = (next) => {
    const normalized = normalizeNumber(next, min, max, numericValue);
    if (typeof onChange === "function") {
      onChange(normalized);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(event) => commit(event.target.value)}
          className="editor-range w-full"
          style={{ "--range-fill": `${ratio}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">
          {typeof formatValue === "function" ? formatValue(numericValue) : String(numericValue)}
        </div>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(event) => commit(event.target.value)}
          className="w-20 border-b border-atelier-fg/20 bg-transparent py-1 text-right text-xs outline-none transition-colors duration-500 focus:border-atelier-accent"
        />
      </div>
    </div>
  );
}

function normalizeNumber(input, min, max, fallback) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
