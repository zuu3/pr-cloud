import { forwardRef } from "react";

// Toss-style button. Tokens from /DESIGN.md §5 (verified TDS button geometry).
type Variant = "primary" | "weak" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap " +
  "transition-colors outline-none select-none " +
  "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 " +
  "disabled:opacity-40 disabled:pointer-events-none active:translate-y-px";

const sizes: Record<Size, string> = {
  md: "h-10 rounded-lg px-4 text-[15px]",
  lg: "h-12 rounded-2xl px-5 text-[16px]",
};

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  weak: "bg-weak-bg text-weak-fg hover:brightness-95",
  ghost: "bg-transparent text-body hover:bg-surface",
  danger: "bg-transparent text-danger hover:bg-[#fdecee]",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading = false, className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        children
      )}
    </button>
  );
});
