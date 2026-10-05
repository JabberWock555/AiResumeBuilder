"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { Dialog as RDialog, DropdownMenu, Toast, Tooltip as RTooltip } from "radix-ui";
import { CheckCircle2, ChevronRight, Info, X, XCircle } from "lucide-react";
import { cn, focusRing } from "@/lib/cn";
import { Button } from "./button";

/* ---------------------------------------------------------------- Dialog */

const scrim =
  "fixed inset-0 z-50 bg-scrim/60 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out";

function CloseX() {
  return (
    <RDialog.Close asChild>
      <Button variant="ghost" size="sm" iconOnly aria-label="Close" className="absolute top-3 right-3">
        <X aria-hidden className="size-4" />
      </Button>
    </RDialog.Close>
  );
}

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export function DialogContent({
  title,
  description,
  footer,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof RDialog.Content>, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className={scrim} />
      <RDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-lg border border-border bg-surface shadow-modal data-[state=open]:animate-pop-in focus:outline-none",
          className,
        )}
        {...props}
      >
        <div className="border-b border-border px-6 pt-5 pb-4 pr-14">
          <RDialog.Title className="text-lg text-text">{title}</RDialog.Title>
          {description ? (
            <RDialog.Description className="mt-1 text-sm text-text-muted">{description}</RDialog.Description>
          ) : (
            <RDialog.Description className="sr-only">{title}</RDialog.Description>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>
        )}
        <CloseX />
      </RDialog.Content>
    </RDialog.Portal>
  );
}

/** Right-hand panel on desktop, bottom sheet on phones. */
export function SheetContent({
  title,
  description,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof RDialog.Content>, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className={scrim} />
      <RDialog.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-modal focus:outline-none",
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg data-[state=open]:animate-sheet-in-bottom",
          "md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[480px] md:rounded-none md:rounded-l-lg md:data-[state=open]:animate-sheet-in-right",
          className,
        )}
        {...props}
      >
        <div className="border-b border-border px-6 pt-5 pb-4 pr-14">
          <RDialog.Title className="text-lg text-text">{title}</RDialog.Title>
          <RDialog.Description className={description ? "mt-1 text-sm text-text-muted" : "sr-only"}>
            {description ?? title}
          </RDialog.Description>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <CloseX />
      </RDialog.Content>
    </RDialog.Portal>
  );
}

/** Destructive confirmation. Names the thing; focus starts on Cancel. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  // Opened from code, not a Trigger, so remember who had focus and give it back.
  const opener = useRef<HTMLElement | null>(null);
  // Layout effects run before Radix's focus effect moves focus into the dialog.
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        className="max-w-[440px]"
        onCloseAutoFocus={(e) => {
          if (opener.current?.isConnected) {
            e.preventDefault();
            opener.current.focus();
          }
        }}
        footer={
          <>
            <RDialog.Close asChild>
              <Button variant="secondary" autoFocus>
                Cancel
              </Button>
            </RDialog.Close>
            <Button variant="danger" loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">This can’t be undone.</p>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Menu */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuSub = DropdownMenu.Sub;

const menuBox =
  "z-30 min-w-48 rounded-md border border-border bg-surface p-1 shadow-pop data-[state=open]:animate-pop-in";
const menuItem =
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-sm px-2.5 text-sm text-text outline-none select-none " +
  "data-[highlighted]:bg-surface-muted data-[disabled]:opacity-50";

export function MenuContent({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={4} align="end" className={cn(menuBox, className)} {...props} />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  destructive,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return <DropdownMenu.Item className={cn(menuItem, destructive && "text-danger", className)} {...props} />;
}

export function MenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(menuItem, "pl-8 relative", className)} {...props}>
      <DropdownMenu.ItemIndicator className="absolute left-2.5">
        <CheckCircle2 aria-hidden className="size-4" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof DropdownMenu.SubTrigger>) {
  return (
    <DropdownMenu.SubTrigger className={cn(menuItem, "data-[state=open]:bg-surface-muted", className)} {...props}>
      {children}
      <ChevronRight aria-hidden className="ml-auto size-4 text-text-muted" />
    </DropdownMenu.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownMenu.SubContent>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent sideOffset={4} className={cn(menuBox, className)} {...props} />
    </DropdownMenu.Portal>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn("px-2.5 py-1.5 text-xs text-text-muted", className)} {...props} />;
}

/* ---------------------------------------------------------------- Tooltip */

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <RTooltip.Provider delayDuration={300}>{children}</RTooltip.Provider>;
}

export function Tooltip({
  content,
  side = "top",
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-70 max-w-64 rounded-sm bg-accent px-2.5 py-1.5 text-xs text-on-accent shadow-pop data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/* ---------------------------------------------------------------- Toast */

type ToastItem = {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  action?: { label: string; onClick: () => void };
};
const ToastCtx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const toneIcon = {
  success: <CheckCircle2 aria-hidden className="size-4 text-success" />,
  error: <XCircle aria-hidden className="size-4 text-danger" />,
  info: <Info aria-hidden className="size-4 text-text-muted" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    setItems((xs) => [...xs.slice(-2), { ...t, id: Date.now() + Math.random() }]);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      <Toast.Provider swipeDirection="down">
        {children}
        {items.map((t) => (
          <Toast.Root
            key={t.id}
            type={t.tone === "error" ? "foreground" : "background"}
            duration={t.tone === "error" ? Infinity : 4000}
            onOpenChange={(o) => !o && setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text shadow-pop data-[state=open]:animate-pop-in data-[state=closed]:animate-fade-out"
          >
            {toneIcon[t.tone]}
            <Toast.Title className="flex-1">{t.title}</Toast.Title>
            {t.action && (
              <Toast.Action altText={t.action.label} asChild>
                <Button size="sm" variant="secondary" onClick={t.action.onClick}>
                  {t.action.label}
                </Button>
              </Toast.Action>
            )}
            <Toast.Close aria-label="Dismiss" className={cn("rounded-sm p-1 text-text-muted hover:text-text", focusRing)}>
              <X aria-hidden className="size-4" />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-4 left-1/2 z-60 flex w-[calc(100vw-32px)] max-w-md -translate-x-1/2 flex-col gap-2 outline-none" />
      </Toast.Provider>
    </ToastCtx.Provider>
  );
}
