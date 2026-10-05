"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Popover, Select as RSelect } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn, focusRing } from "@/lib/cn";
import { useFieldControl } from "./field";

export type Option = { value: string; label: string };

const trigger =
  "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border-input bg-surface px-3 text-left text-base text-text " +
  "data-[placeholder]:text-text-muted disabled:opacity-50 " +
  focusRing;

const menu =
  "z-30 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-pop " +
  "data-[state=open]:animate-pop-in";

const item =
  "relative flex min-h-10 cursor-default items-center rounded-sm py-2 pr-8 pl-3 text-base text-text outline-none select-none " +
  "data-[highlighted]:bg-surface-muted data-[disabled]:opacity-50";

/** Short fixed lists: experience level, font, sort. Keyboard and type-ahead from Radix. */
export function Select({
  options,
  placeholder = "Select…",
  className,
  id,
  ...props
}: React.ComponentProps<typeof RSelect.Root> & {
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const a11y = useFieldControl(id);
  return (
    <RSelect.Root {...props}>
      <RSelect.Trigger {...a11y} className={cn(trigger, className)}>
        <span className="min-w-0 flex-1 truncate">
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon>
          <ChevronDown aria-hidden className="size-4 text-text-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={4} className={menu}>
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item key={o.value} value={o.value} className={item}>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="absolute right-2.5">
                  <Check aria-hidden className="size-4" />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/**
 * Long searchable lists (country, state). Type to filter, arrows move,
 * Enter picks, Escape closes and keeps the old value.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Search…",
  emptyText = "No matches",
  id,
  className,
}: {
  options: Option[];
  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);
  const a11y = useFieldControl(id);
  // ids must not contain spaces, so use the option's position, not its value
  const optionId = (o: Option) => `${listId}-o${options.indexOf(o)}`;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(q));
    const contains = options.filter(
      (o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q),
    );
    return [...starts, ...contains];
  }, [options, query]);

  function choose(o: Option) {
    onValueChange(o.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[active]) {
      e.preventDefault();
      choose(filtered[active]);
    }
    requestAnimationFrame(() =>
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" }),
    );
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(Math.max(0, options.findIndex((x) => x.value === value)));
        }
      }}
    >
      <Popover.Trigger
        {...a11y}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(trigger, !selected && "text-text-muted", className)}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-30 w-(--radix-popover-trigger-width) min-w-56 rounded-md border border-border bg-surface p-1 shadow-pop data-[state=open]:animate-pop-in"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-controls={listId}
            aria-activedescendant={filtered[active] ? optionId(filtered[active]) : undefined}
            className="mb-1 h-10 w-full rounded-sm border border-border bg-surface px-3 text-base text-text outline-none placeholder:text-text-muted focus:border-focus"
          />
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={optionId(o)}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className="relative flex min-h-10 cursor-default items-center rounded-sm py-2 pr-8 pl-3 text-base text-text data-[active=true]:bg-surface-muted"
              >
                {o.label}
                {o.value === value && <Check aria-hidden className="absolute right-2.5 size-4" />}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
