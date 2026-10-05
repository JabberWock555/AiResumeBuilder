"use client";

import { useId } from "react";
import { Checkbox as RCheckbox, RadioGroup, Switch as RSwitch } from "radix-ui";
import { Check } from "lucide-react";
import { cn, focusRing } from "@/lib/cn";

/** Label on the left, switch on the right; the whole row is clickable. */
export function Switch({
  label,
  hideLabel,
  className,
  ...props
}: React.ComponentProps<typeof RSwitch.Root> & { label: string; hideLabel?: boolean }) {
  const id = useId();
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <label htmlFor={id} className={cn("text-sm text-text", hideLabel && "sr-only")}>
        {label}
      </label>
      <RSwitch.Root
        id={id}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill border border-border-input bg-surface-muted",
          "after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']",
          "transition-colors duration-(--motion-fast) data-[state=checked]:border-accent data-[state=checked]:bg-accent",
          "disabled:opacity-50",
          focusRing,
        )}
        {...props}
      >
        <RSwitch.Thumb
          className={cn(
            "block size-3.5 translate-x-0.5 rounded-pill bg-text-muted shadow-card",
            "transition-transform duration-(--motion-fast) data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-on-accent",
          )}
        />
      </RSwitch.Root>
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: React.ComponentProps<typeof RCheckbox.Root> & { label: React.ReactNode }) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <RCheckbox.Root
        id={id}
        className={cn(
          "relative flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-input bg-surface",
          "after:absolute after:-inset-2.5 after:content-['']",
          "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-on-accent",
          "disabled:opacity-50",
          focusRing,
        )}
        {...props}
      >
        <RCheckbox.Indicator>
          <Check aria-hidden className="size-3.5" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <label htmlFor={id} className="text-sm text-text">
        {label}
      </label>
    </div>
  );
}

export const RadioCardGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroup.Root>) => (
  <RadioGroup.Root className={cn("flex flex-col gap-3", className)} {...props} />
);

/** A selectable card, e.g. a billing plan. */
export function RadioCard({
  title,
  description,
  aside,
  badge,
  className,
  ...props
}: React.ComponentProps<typeof RadioGroup.Item> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <RadioGroup.Item
      className={cn(
        "group relative flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-left",
        "hover:bg-surface-muted data-[state=checked]:border-accent data-[state=checked]:shadow-[0_0_0_1px_var(--c-accent)]",
        focusRing,
        className,
      )}
      {...props}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-pill border border-border-input group-data-[state=checked]:border-accent">
        <RadioGroup.Indicator className="size-2.5 rounded-pill bg-accent" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-base font-semibold text-text">
          {title}
          {badge}
        </span>
        {description && <span className="text-sm text-text-muted">{description}</span>}
      </span>
      {aside && <span className="text-right text-sm text-text">{aside}</span>}
    </RadioGroup.Item>
  );
}
