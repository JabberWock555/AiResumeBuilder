import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";
import { cn, focusRing } from "@/lib/cn";

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-text border border-border hover:bg-surface-muted",
  ghost: "text-text hover:bg-surface-muted",
  danger: "bg-surface text-danger border border-danger hover:bg-danger-soft",
  ai: "bg-ai-soft text-ai hover:brightness-95",
} as const;

const sizes = {
  sm: "h-8 px-3 gap-1.5 text-sm",
  md: "h-10 px-4 gap-2 text-sm",
  lg: "h-12 px-5 gap-2 text-base",
} as const;

const iconSizes = { sm: "size-8", md: "size-10", lg: "size-12" } as const;

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  /** Square button for a single icon. Needs aria-label. */
  iconOnly?: boolean;
  asChild?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  iconOnly = false,
  asChild = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (props.type ?? "button")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap select-none",
        "transition-[background-color,filter,box-shadow] duration-(--motion-fast)",
        "disabled:pointer-events-none disabled:opacity-50",
        focusRing,
        variants[variant],
        iconOnly ? cn(iconSizes[size], "p-0") : sizes[size],
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}
