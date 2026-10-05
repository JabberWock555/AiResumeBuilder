"use client";

import Link from "next/link";
import { RadioGroup, Tabs as RTabs } from "radix-ui";
import { cn, focusRing } from "@/lib/cn";

/** Segmented tabs for switching views in place (document types, settings). */
export const Tabs = RTabs.Root;
export const TabsContent = RTabs.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof RTabs.List>) {
  return (
    <RTabs.List
      className={cn("inline-flex h-10 items-center gap-1 rounded-md bg-surface-muted p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-text-muted",
        "hover:text-text data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-card",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

/**
 * The editor's section tabs. Each section is its own URL, so these are links
 * in a nav with aria-current, not an ARIA tablist. Scrolls sideways on small
 * screens instead of overflowing the page.
 */
export function SectionNav({
  items,
  current,
  label = "Resume sections",
  className,
}: {
  items: { href: string; label: string; status?: "error" | "warning" | null }[];
  current: string;
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className="flex snap-x gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {items.map((it) => {
          const active = it.href === current;
          return (
            <li key={it.href} className="snap-start">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap",
                  active ? "text-text" : "text-text-muted hover:text-text",
                  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-pill",
                  active ? "after:bg-accent" : "after:bg-transparent",
                  focusRing,
                )}
              >
                {it.label}
                {it.status && (
                  <span
                    className={cn("size-1.5 rounded-pill", it.status === "error" ? "bg-danger" : "bg-warning-fill")}
                    aria-label={it.status === "error" ? "has errors" : "has warnings"}
                    role="img"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Pick one of a few values in place (theme, view mode). A radio group, not tabs. */
export function SegmentedControl({
  options,
  className,
  ...props
}: React.ComponentProps<typeof RadioGroup.Root> & { options: { value: string; label: string }[] }) {
  return (
    <RadioGroup.Root
      orientation="horizontal"
      className={cn("inline-flex h-10 items-center gap-1 rounded-md bg-surface-muted p-1", className)}
      {...props}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "inline-flex h-8 items-center rounded-sm px-3 text-sm font-medium text-text-muted",
            "hover:text-text data-[state=checked]:bg-surface data-[state=checked]:text-text data-[state=checked]:shadow-card",
            focusRing,
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
