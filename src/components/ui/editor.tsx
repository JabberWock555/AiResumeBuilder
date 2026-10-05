"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Collapsible, Popover } from "radix-ui";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Heart,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn, focusRing } from "@/lib/cn";
import { Button } from "./button";
import { Badge } from "./badge";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tooltip } from "./overlays";
import { Switch } from "./toggles";
import { useFieldControl } from "./field";

/* ------------------------------------------------------------ EntryCard */

/**
 * One collapsible entry (a job, a degree, a skills group). Reorder by
 * keyboard on the handle (Space to pick up, arrows to move, Space to drop) or
 * from the ⋯ menu. Mouse dragging is added in /replica-build with dnd-kit.
 */
export function EntryCard({
  title,
  subtitle,
  index,
  count,
  onMove,
  onDuplicate,
  onDelete,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [grabbed, setGrabbed] = useState(false);
  const [announce, setAnnounce] = useState("");

  function onHandleKey(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setGrabbed((g) => !g);
      setAnnounce(grabbed ? `Dropped ${title} at position ${index + 1} of ${count}` : `Picked up ${title}. Use arrow keys to move.`);
    } else if (grabbed && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = e.key === "ArrowUp" ? index - 1 : index + 1;
      if (to < 0 || to >= count) return;
      onMove(index, to);
      setAnnounce(`Moved to position ${to + 1} of ${count}`);
    } else if (e.key === "Escape" && grabbed) {
      setGrabbed(false);
      setAnnounce("Move cancelled");
    }
  }

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "min-w-0 rounded-lg border bg-surface shadow-card transition-shadow",
        grabbed ? "border-focus shadow-pop" : "border-border",
      )}
    >
      <div className="flex items-center gap-1 py-2 pr-2 pl-1">
        <button
          type="button"
          aria-label={`Reorder ${title}`}
          aria-pressed={grabbed}
          aria-describedby={`${title}-reorder-help`}
          onKeyDown={onHandleKey}
          onBlur={() => setGrabbed(false)}
          className={cn("flex h-10 w-7 cursor-grab items-center justify-center rounded-sm text-text-muted hover:text-text", focusRing)}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
        <span id={`${title}-reorder-help`} className="sr-only">
          Press Space to pick up, arrow keys to move, Space to drop.
        </span>
        <Collapsible.Trigger className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-sm py-1 text-left", focusRing)}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-text">{title || "Untitled"}</span>
            {subtitle && <span className="block truncate text-sm text-text-muted">{subtitle}</span>}
          </span>
          <ChevronDown aria-hidden className={cn("size-4 text-text-muted transition-transform", open && "rotate-180")} />
        </Collapsible.Trigger>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="md" iconOnly aria-label={`Actions for ${title}`}>
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem disabled={index === 0} onSelect={() => onMove(index, index - 1)}>
              <ArrowUp aria-hidden className="size-4" /> Move up
            </MenuItem>
            <MenuItem disabled={index === count - 1} onSelect={() => onMove(index, index + 1)}>
              <ArrowDown aria-hidden className="size-4" /> Move down
            </MenuItem>
            {onDuplicate && (
              <MenuItem onSelect={onDuplicate}>
                <Copy aria-hidden className="size-4" /> Duplicate
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem destructive onSelect={onDelete}>
              <Trash2 aria-hidden className="size-4" /> Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <Collapsible.Content className="border-t border-border p-4 md:p-6">{children}</Collapsible.Content>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </Collapsible.Root>
  );
}

/* ------------------------------------------------------------ MonthYearPicker */

export type YearMonth = { year: number; month: number };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatYM(v: YearMonth | "present" | null) {
  if (v === "present") return "Present";
  if (!v) return "";
  return `${MONTHS[v.month - 1]} ${v.year}`;
}

/** Month + year only (resumes don't need days). Future months are disabled. */
export function MonthYearPicker({
  label,
  value,
  onChange,
  allowPresent,
  min,
  invalid,
}: {
  label: string;
  value: YearMonth | "present" | null;
  onChange: (v: YearMonth | "present" | null) => void;
  allowPresent?: boolean;
  min?: YearMonth | null;
  invalid?: boolean;
}) {
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const [year, setYear] = useState(value && value !== "present" ? value.year : today.year);
  const [open, setOpen] = useState(false);
  const a11y = useFieldControl();
  const before = (a: YearMonth, b: YearMonth) => a.year < b.year || (a.year === b.year && a.month < b.month);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        {...a11y}
        aria-label={`${label}: ${formatYM(value) || "not set"}`}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex h-11 w-full items-center rounded-md border bg-surface px-3 text-left text-base",
          invalid ? "border-danger" : "border-border-input",
          value ? "text-text" : "text-text-muted",
          focusRing,
        )}
      >
        {formatYM(value) || label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-30 w-72 rounded-md border border-border bg-surface p-3 shadow-pop data-[state=open]:animate-pop-in"
        >
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="sm" iconOnly aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <span className="text-sm font-semibold text-text tabular-nums" aria-live="polite">
              {year}
            </span>
            <Button variant="ghost" size="sm" iconOnly aria-label="Next year" disabled={year >= today.year} onClick={() => setYear((y) => y + 1)}>
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Months in ${year}`}>
            {MONTHS.map((m, i) => {
              const ym = { year, month: i + 1 };
              const future = before(today, ym);
              const tooEarly = min ? before(ym, min) : false;
              const selected = value !== "present" && value?.year === year && value.month === i + 1;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={future || tooEarly}
                  aria-pressed={selected}
                  aria-label={`${MONTHS_LONG[i]} ${year}`}
                  onClick={() => {
                    onChange(ym);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-9 rounded-sm text-sm",
                    selected ? "bg-accent text-on-accent" : "text-text hover:bg-surface-muted",
                    "disabled:pointer-events-none disabled:text-text-muted disabled:opacity-50",
                    focusRing,
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {allowPresent && (
            <div className="mt-3 border-t border-border pt-3">
              <Switch
                label="I work here now"
                checked={value === "present"}
                onCheckedChange={(c) => {
                  onChange(c ? "present" : null);
                  if (c) setOpen(false);
                }}
                className="w-full justify-between"
              />
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ------------------------------------------------------------ AI split button */

export function AiButton({
  credits,
  state,
  notReadyReason,
  onRun,
  modes,
}: {
  credits: number | null;
  state: "not-ready" | "ready" | "generating";
  notReadyReason?: string;
  onRun: () => void;
  modes?: { label: string; onSelect: () => void }[];
}) {
  const main = (
    <Button
      variant="ai"
      size="sm"
      loading={state === "generating"}
      disabled={state === "not-ready"}
      onClick={onRun}
      className={modes ? "rounded-r-none" : undefined}
    >
      {state !== "generating" && <Sparkles aria-hidden className="size-4" />}
      {state === "generating" ? "Writing…" : "Suggest with AI"}
    </Button>
  );
  return (
    <div className="flex items-center gap-2">
      {credits !== null && (
        <span className="text-xs text-text-muted tabular-nums" aria-label={`${credits} AI credits left`}>
          {credits} left
        </span>
      )}
      <div className="flex">
        {state === "not-ready" && notReadyReason ? (
          <Tooltip content={notReadyReason}>
            <span tabIndex={0} className={cn("rounded-md", focusRing)}>
              {main}
            </span>
          </Tooltip>
        ) : (
          main
        )}
        {modes && (
          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="ai"
                size="sm"
                iconOnly
                aria-label="More AI options"
                disabled={state !== "ready"}
                className="rounded-l-none border-l border-surface"
              >
                <ChevronDown aria-hidden className="size-4" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {modes.map((m) => (
                <MenuItem key={m.label} onSelect={m.onSelect}>
                  {m.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ BulletEditor */

export type Bullet = { id: string; text: string };
export type BulletIssue = { bulletId: string; message: string; severity: "error" | "warning" };
const PLACEHOLDER = /\[[^\]]{1,24}\]/g;

/**
 * Bullet rows. Enter adds a row, Backspace in an empty row removes it.
 * An AI suggestion shows under its row until applied or dismissed.
 * Bracketed placeholders like [number] mark facts the user still has to fill in.
 */
export function BulletEditor({
  bullets,
  onChange,
  issues = [],
  suggestion,
  onApplySuggestion,
  onDismissSuggestion,
  onFocusBullet,
  newId,
}: {
  onFocusBullet?: (id: string) => void;
  bullets: Bullet[];
  onChange: (b: Bullet[]) => void;
  issues?: BulletIssue[];
  suggestion?: { bulletId: string; text: string } | null;
  onApplySuggestion?: () => void;
  onDismissSuggestion?: () => void;
  newId: () => string;
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusRow = (id: string, atEnd = true) => {
    const el = refs.current.get(id);
    if (!el) return;
    el.focus();
    if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
  };
  /** Change rows and move focus in the same tick, so fast typing never lands in the old row. */
  const changeAndFocus = (next: Bullet[], id: string) => {
    flushSync(() => onChange(next));
    focusRow(id);
  };

  function update(i: number, text: string) {
    const next = bullets.slice();
    next[i] = { ...next[i], text };
    onChange(next);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const b = { id: newId(), text: "" };
      const next = bullets.slice();
      next.splice(i + 1, 0, b);
      changeAndFocus(next, b.id);
    } else if (e.key === "Backspace" && bullets[i].text === "" && bullets.length > 1) {
      e.preventDefault();
      const prev = bullets[i - 1] ?? bullets[i + 1];
      changeAndFocus(bullets.filter((_, j) => j !== i), prev.id);
    } else if (e.key === "Tab" && suggestion?.bulletId === bullets[i].id && onApplySuggestion && !e.shiftKey) {
      e.preventDefault();
      onApplySuggestion();
    } else if (e.key === "Escape" && suggestion && onDismissSuggestion) {
      onDismissSuggestion();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {bullets.map((b, i) => {
          const rowIssues = issues.filter((x) => x.bulletId === b.id);
          const holes = b.text.match(PLACEHOLDER) ?? [];
          const sug = suggestion?.bulletId === b.id ? suggestion.text : null;
          const descId = `${b.id}-desc`;
          return (
            <li key={b.id} className="flex flex-col gap-1">
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md border bg-surface px-3 py-2",
                  "focus-within:border-focus focus-within:shadow-[0_0_0_1px_var(--c-focus)]",
                  rowIssues.some((x) => x.severity === "error") ? "border-danger" : "border-border-input",
                )}
              >
                <span aria-hidden className="pt-0.5 text-text-muted select-none">
                  •
                </span>
                <textarea
                  ref={(el) => {
                    if (el) refs.current.set(b.id, el);
                    else refs.current.delete(b.id);
                  }}
                  value={b.text}
                  rows={1}
                  aria-label={`Bullet ${i + 1} of ${bullets.length}`}
                  aria-describedby={rowIssues.length || holes.length || sug ? descId : undefined}
                  placeholder={i === 0 ? "What you did, and what changed because of it" : "Another result"}
                  onChange={(e) => update(i, e.target.value)}
                  onKeyDown={(e) => onKey(e, i)}
                  onFocus={() => onFocusBullet?.(b.id)}
                  className="field-sizing-content min-h-6 flex-1 resize-none bg-transparent text-base text-text outline-none placeholder:text-text-muted"
                />
              </div>
              <div id={descId} className="flex flex-col gap-1 pl-5">
                {rowIssues.map((x) => (
                  <p key={x.message} className={cn("text-xs", x.severity === "error" ? "text-danger" : "text-warning")}>
                    {x.severity === "error" ? "Error: " : "Tip: "}
                    {x.message}
                  </p>
                ))}
                {holes.length > 0 && (
                  <p className="text-xs text-warning">
                    Fill in{" "}
                    {holes.map((h) => (
                      <mark key={h} className="mr-1 rounded-sm bg-warning-soft px-1 text-warning">
                        {h}
                      </mark>
                    ))}
                    with your real figure, or remove it.
                  </p>
                )}
                {sug && (
                  <div className="flex flex-col gap-2 rounded-md bg-ai-soft p-3" aria-live="polite">
                    <p className="text-sm text-ai">
                      <span className="sr-only">AI suggestion: </span>
                      {sug}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={onApplySuggestion}>
                        Use this <kbd className="text-xs opacity-70">Tab</kbd>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={onDismissSuggestion}>
                        <X aria-hidden className="size-4" /> Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => {
          const b = { id: newId(), text: "" };
          changeAndFocus([...bullets, b], b.id);
        }}
      >
        <Plus aria-hidden className="size-4" /> Add bullet
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------ TemplateCard */

export function TemplateCard({
  name,
  selected,
  locked,
  favourite,
  onSelect,
  onToggleFavourite,
  children,
}: {
  name: string;
  selected?: boolean;
  locked?: boolean;
  favourite?: boolean;
  onSelect: () => void;
  onToggleFavourite?: () => void;
  /** A small render of the user's own resume in this template. */
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${name}${locked ? ", Pro template" : ""}${selected ? ", current" : ""}`}
        onClick={onSelect}
        className={cn(
          "aspect-[1/1.294] overflow-hidden rounded-md border bg-surface text-left shadow-card",
          selected ? "border-accent shadow-[0_0_0_1px_var(--c-accent)]" : "border-border hover:border-border-input",
          focusRing,
        )}
      >
        {children}
      </button>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-text">{name}</span>
        {selected && <Badge>Current</Badge>}
        {locked && <Badge tone="pro">Pro</Badge>}
        {onToggleFavourite && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={favourite ? `Remove ${name} from saved` : `Save ${name}`}
            aria-pressed={favourite}
            onClick={onToggleFavourite}
          >
            <Heart aria-hidden className={cn("size-4", favourite && "fill-current text-danger")} />
          </Button>
        )}
      </div>
    </div>
  );
}
