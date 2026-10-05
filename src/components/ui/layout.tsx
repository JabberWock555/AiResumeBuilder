"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { cn, focusRing } from "@/lib/cn";
import { Button } from "./button";
import { Tooltip } from "./overlays";

/* ------------------------------------------------------------ Card */

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-border bg-surface p-4 shadow-card md:p-6", className)} {...props} />;
}

/* ------------------------------------------------------------ Sidebar */

export type NavItem = { href: string; label: string; icon: React.ElementType; badge?: React.ReactNode };

export function SidebarNav({
  items,
  current,
  rail = false,
  footer,
  primary,
  label = "Main",
  landmark = true,
}: {
  items: NavItem[];
  /** Accessible name of the nav. Must be unique on the page. */
  label?: string;
  /** false renders plain divs, for previews inside another page. */
  landmark?: boolean;
  current: string;
  /** Icon-only 64px version used in the editor. */
  rail?: boolean;
  footer?: React.ReactNode;
  primary?: React.ReactNode;
}) {
  const Aside = landmark ? "aside" : "div";
  const Nav = landmark ? "nav" : "div";
  return (
    <Aside
      className={cn(
        "flex h-full flex-col gap-4 border-r border-border bg-surface py-4",
        rail ? "w-(--layout-rail) items-center px-2" : "w-(--layout-sidebar) px-3",
      )}
    >
      <div className={cn("flex h-8 items-center text-lg text-text", rail ? "justify-center" : "px-2")}>
        <span className="flex size-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-on-accent" aria-label="Home">
          R
        </span>
      </div>
      {primary}
      <Nav aria-label={landmark ? label : undefined} className="flex flex-1 flex-col">
        <ul className="flex flex-col gap-0.5">
          {items.map((it) => {
            const active = it.href === current;
            const Icon = it.icon;
            const link = (
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                aria-label={rail ? it.label : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md text-sm font-medium",
                  rail ? "w-10 justify-center" : "px-2.5",
                  active ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text",
                  focusRing,
                )}
              >
                <Icon aria-hidden className="size-4.5 shrink-0" />
                {!rail && <span className="flex-1 truncate">{it.label}</span>}
                {!rail && it.badge}
              </Link>
            );
            return <li key={it.href}>{rail ? <Tooltip content={it.label} side="right">{link}</Tooltip> : link}</li>;
          })}
        </ul>
      </Nav>
      {footer}
    </Aside>
  );
}

/* ------------------------------------------------------------ Usage meter */

export function UsageMeter({ rows }: { rows: { label: string; used: number; max: number | null }[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-muted p-3">
      {rows.map((r) => {
        const full = r.max !== null && r.used >= r.max;
        const pct = r.max ? Math.min(100, (r.used / r.max) * 100) : 0;
        return (
          <div key={r.label} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">{r.label}</span>
              <span className={cn("font-semibold tabular-nums", full ? "text-danger" : "text-text")}>
                {r.max === null ? "Unlimited" : `${r.used} of ${r.max}`}
              </span>
            </div>
            {r.max !== null && (
              <div
                role="progressbar"
                aria-label={r.label}
                aria-valuemin={0}
                aria-valuemax={r.max}
                aria-valuenow={r.used}
                aria-valuetext={`${r.used} of ${r.max} ${r.label.toLowerCase()} used`}
                className="h-1 overflow-hidden rounded-pill bg-border"
              >
                <div className={cn("h-full rounded-pill", full ? "bg-danger" : "bg-accent")} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Banner */

const bannerTones = {
  info: "bg-surface-muted text-text",
  warning: "bg-warning-soft text-warning",
  promo: "bg-ai-soft text-ai",
} as const;

/** Thin message bar at the top of the app. No countdowns. */
export function Banner({
  tone = "info",
  children,
  action,
  dismissible = true,
}: {
  tone?: keyof typeof bannerTones;
  children: React.ReactNode;
  action?: React.ReactNode;
  dismissible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="status" className={cn("flex min-h-11 items-center gap-3 px-4 text-sm", bannerTones[tone])}>
      <p className="flex-1">{children}</p>
      {action}
      {dismissible && (
        <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss message" onClick={() => setOpen(false)} className="text-current">
          <X aria-hidden className="size-4" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Stepper */

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10));
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text" id={labelId}>
        {label}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" iconOnly aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
          <Minus aria-hidden className="size-4" />
        </Button>
        <input
          type="number"
          aria-labelledby={labelId}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className={cn("h-8 w-12 rounded-sm bg-transparent text-center text-sm text-text tabular-nums [appearance:textfield]", focusRing)}
        />
        <Button variant="secondary" size="sm" iconOnly aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
          <Plus aria-hidden className="size-4" />
        </Button>
        {unit && <span className="w-5 text-xs text-text-muted">{unit}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Empty, Skeleton, Avatar */

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-input px-6 py-10 text-center">
      <Icon aria-hidden className="size-8 text-text-muted" />
      <div>
        <p className="text-base font-semibold text-text">{title}</p>
        <p className="mt-1 max-w-xs text-sm text-text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-surface-muted bg-[linear-gradient(90deg,transparent,var(--c-border),transparent)] bg-size-[200%_100%] animate-shimmer",
        className,
      )}
    />
  );
}

export function Avatar({ name, size = 32, decorative }: { name: string; size?: 32 | 40; decorative?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill bg-accent-soft font-semibold text-text",
        size === 40 ? "size-10 text-sm" : "size-8 text-xs",
      )}
    >
      {initials}
    </span>
  );
}
