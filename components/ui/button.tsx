import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:   "bg-navy-900 text-white hover:bg-navy-800 disabled:opacity-50",
  secondary: "border border-border bg-paper text-ink hover:bg-navy-50 disabled:opacity-50",
  danger:    "bg-danger text-white hover:opacity-90 disabled:opacity-50",
  ghost:     "text-ink-muted hover:bg-navy-50 hover:text-ink disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-2 text-sm",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props }, ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
});

export default Button;
