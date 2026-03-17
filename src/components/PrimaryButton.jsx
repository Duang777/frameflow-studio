export function PrimaryButton({ children, disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      className="group relative min-h-12 overflow-hidden border border-atelier-fg bg-atelier-fg px-8 text-xs uppercase tracking-button text-atelier-inverse shadow-atelier-button transition-[box-shadow] duration-500 ease-luxury hover:shadow-atelier-button-hover disabled:opacity-50"
      {...props}
    >
      <span className="absolute inset-0 -translate-x-full bg-atelier-accent transition-transform duration-500 ease-luxury group-hover:translate-x-0" aria-hidden="true" />
      <span className="relative z-10">{children}</span>
    </button>
  );
}
