import { useEffect, useMemo, useRef, useState } from "react";

export function EditorialSelect({ value, onChange, options, placeholder = "请选择" }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const normalizedOptions = useMemo(
    () =>
      (options || []).map((item) => ({
        value: String(item.value),
        label: item.label,
      })),
    [options]
  );

  const selected = normalizedOptions.find((item) => item.value === String(value));

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const commitValue = (nextValue) => {
    setOpen(false);
    if (typeof onChange === "function") {
      onChange(nextValue);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`group flex w-full items-center justify-between border-b bg-transparent py-2 text-sm outline-none transition-colors duration-500 ${
          open ? "border-atelier-accent" : "border-atelier-fg/20 hover:border-atelier-fg/40"
        }`}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-left text-atelier-fg">{selected?.label || placeholder}</span>
        <span className={`ml-3 inline-flex h-4 w-4 items-center justify-center transition-transform duration-500 ${open ? "rotate-180 text-atelier-accent" : "text-atelier-subtle"}`}>
          <ChevronDown />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 border border-atelier-fg/20 bg-atelier-bg/95 shadow-[0_10px_24px_rgba(0,0,0,0.08)] backdrop-blur-[1px]">
          <ul role="listbox" className="max-h-56 overflow-auto">
            {normalizedOptions.map((item) => {
              const active = item.value === String(value);
              return (
                <li key={item.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => commitValue(item.value)}
                    className={`w-full border-t px-3 py-2 text-left text-sm leading-relaxed transition-colors duration-500 first:border-t-0 ${
                      active
                        ? "border-atelier-fg/20 bg-atelier-muted/55 text-atelier-fg"
                        : "border-atelier-fg/10 text-atelier-fg hover:bg-white/75 hover:text-atelier-accent"
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}
