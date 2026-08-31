import { forwardRef } from "react";

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <div className="relative inline-block">
      <select
        ref={ref}
        className={`h-11 w-full appearance-none rounded-xl border border-border bg-surface pl-3.5 pr-9 text-[15px] text-foreground outline-none transition-colors focus:border-primary focus:bg-canvas disabled:opacity-50 ${className}`}
        {...rest}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  );
});
