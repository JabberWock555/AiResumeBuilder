"use client";

import { createContext, useContext, useId } from "react";
import { cn } from "@/lib/cn";

type FieldCtx = { id: string; helperId: string; errorId: string; invalid: boolean; hasHelper: boolean };
const Ctx = createContext<FieldCtx | null>(null);

export function useField() {
  return useContext(Ctx);
}

/** id + aria wiring for a custom control inside <Field>. */
export function useFieldControl(id?: string) {
  const ctx = useContext(Ctx);
  if (!ctx) return { id };
  return {
    id: id ?? ctx.id,
    "aria-invalid": ctx.invalid || undefined,
    "aria-describedby": describedBy(ctx),
  };
}

function describedBy(ctx: FieldCtx, extra?: string) {
  const own = ctx.invalid ? ctx.errorId : ctx.hasHelper ? ctx.helperId : undefined;
  return [extra, own].filter(Boolean).join(" ") || undefined;
}

/**
 * Label + control + helper + error, wired together with ids so screen readers
 * read the label, the helper and the error with the control.
 */
export function Field({
  label,
  helper,
  error,
  required,
  trailing,
  className,
  children,
}: {
  label: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Something on the label row's right, like a "Show on resume" switch. */
  trailing?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const ctx = { id, helperId: `${id}-help`, errorId: `${id}-err`, invalid: !!error, hasHelper: !!helper };
  return (
    <Ctx.Provider value={ctx}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className="flex min-h-5 items-center justify-between gap-3">
          <label htmlFor={id} className="text-sm font-medium text-text">
            {label}
            {required && (
              <span className="text-text-muted" aria-hidden>
                {" "}
                *
              </span>
            )}
          </label>
          {trailing}
        </div>
        {children}
        {helper && !error && (
          <p id={ctx.helperId} className="text-xs text-text-muted">
            {helper}
          </p>
        )}
        {error && (
          <p id={ctx.errorId} className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Ctx.Provider>
  );
}

const box =
  "w-full rounded-md border bg-surface text-base text-text placeholder:text-text-muted " +
  "transition-[border-color,box-shadow] duration-(--motion-fast) " +
  "focus-within:border-focus focus-within:shadow-[0_0_0_1px_var(--c-focus)] " +
  "has-[:disabled]:bg-surface-muted has-[:disabled]:opacity-70";

function controlProps(ctx: FieldCtx | null, props: { id?: string; "aria-describedby"?: string }) {
  if (!ctx) return {};
  return {
    id: props.id ?? ctx.id,
    "aria-invalid": ctx.invalid || undefined,
    "aria-describedby": describedBy(ctx, props["aria-describedby"]),
  };
}

export function Input({
  prefix,
  suffix,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "prefix"> & {
  /** Fixed text before the value, e.g. "linkedin.com/in/". */
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  const ctx = useField();
  return (
    <div
      className={cn(
        box,
        "flex h-11 items-center",
        ctx?.invalid ? "border-danger" : "border-border-input",
        className,
      )}
    >
      {prefix && <span className="pl-3 text-base text-text-muted select-none">{prefix}</span>}
      <input
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-muted",
          prefix ? "pl-0.5" : "pl-3",
          suffix ? "pr-1" : "pr-3",
        )}
        {...props}
        {...controlProps(ctx, props)}
      />
      {suffix && <span className="flex items-center pr-1.5">{suffix}</span>}
    </div>
  );
}

export function Textarea({
  className,
  footer,
  ...props
}: React.ComponentProps<"textarea"> & { footer?: React.ReactNode }) {
  const ctx = useField();
  return (
    <div className={cn(box, ctx?.invalid ? "border-danger" : "border-border-input", className)}>
      <textarea
        rows={3}
        className="field-sizing-content block min-h-24 w-full resize-none bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-text-muted"
        {...props}
        {...controlProps(ctx, props)}
      />
      {footer && <div className="flex items-center justify-end gap-2 px-2 pb-2">{footer}</div>}
    </div>
  );
}
