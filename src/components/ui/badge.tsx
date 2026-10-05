import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-surface-muted text-text",
  new: "bg-success-soft text-success",
  pro: "bg-accent-soft text-text",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  ai: "bg-ai-soft text-ai",
} as const;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-pill px-2 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
