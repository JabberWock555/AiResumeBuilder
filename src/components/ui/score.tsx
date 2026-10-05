"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Circle, Lock, XCircle } from "lucide-react";
import { cn, focusRing } from "@/lib/cn";
import { Badge } from "./badge";

export function band(score: number) {
  if (score >= 80) return { label: "Ready to send", tone: "success" as const, color: "var(--c-success)" };
  if (score >= 50) return { label: "Getting there", tone: "warning" as const, color: "var(--c-warning-fill)" };
  return { label: "Needs work", tone: "danger" as const, color: "var(--c-danger)" };
}

/** Semicircle 0-100 with three bands and a needle. */
export function ScoreGauge({ score, className }: { score: number; className?: string }) {
  const b = band(score);
  const r = 80;
  const arc = (from: number, to: number) => {
    const p = (v: number) => {
      const a = Math.PI * (1 - v / 100);
      return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
    };
    const [x1, y1] = p(from);
    const [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const a = Math.PI * (1 - score / 100);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-valuetext={`${score} out of 100, ${b.label.toLowerCase()}`}
      aria-label="Resume score"
      className={cn("relative w-56", className)}
    >
      <svg viewBox="0 0 200 112" className="w-full" aria-hidden>
        <path d={arc(0, 49)} stroke="var(--c-danger)" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={arc(51, 79)} stroke="var(--c-warning-fill)" strokeWidth="14" fill="none" />
        <path d={arc(81, 100)} stroke="var(--c-success)" strokeWidth="14" fill="none" strokeLinecap="round" />
        <circle cx={100 + r * Math.cos(a)} cy={100 - r * Math.sin(a)} r="9" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="3" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span aria-hidden className="text-2xl text-text tabular-nums">
          {score}
        </span>
        <span aria-hidden className="text-xs text-text-muted">
          {b.label}
        </span>
      </div>
    </div>
  );
}

/** Small circular score for cards and the editor bar. */
export function ScoreRing({ score, size = 40, label = "Resume score" }: { score: number; size?: 32 | 40 | 48; label?: string }) {
  const b = band(score);
  const stroke = size >= 48 ? 4 : 3;
  const rr = size / 2 - stroke;
  const c = 2 * Math.PI * rr;
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-valuetext={`${score} out of 100, ${b.label.toLowerCase()}`}
      aria-label={label}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={rr} stroke="var(--c-border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={rr}
          stroke={b.color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span aria-hidden className={cn("absolute font-semibold text-text tabular-nums", size >= 48 ? "text-sm" : "text-xs")}>
        {score}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------ checks */

export type Severity = "error" | "warning" | "pass" | "locked";

const sev = {
  error: { icon: XCircle, cls: "text-danger", word: "Error" },
  warning: { icon: AlertTriangle, cls: "text-warning", word: "Warning" },
  pass: { icon: Check, cls: "text-success", word: "Done" },
  locked: { icon: Lock, cls: "text-text-muted", word: "Locked" },
};

/** One feedback check. Severity is in the text too, not only the colour. */
export function CheckItem({
  severity,
  title,
  children,
  target,
  onGoTo,
  defaultOpen,
}: {
  severity: Severity;
  title: string;
  children?: React.ReactNode;
  /** Name of the entry this is about, e.g. "UX Designer". */
  target?: string;
  onGoTo?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const S = sev[severity];
  const Icon = S.icon;
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={children ? open : undefined}
        onClick={() => children && setOpen((o) => !o)}
        className={cn("flex w-full items-start gap-3 py-3 text-left", focusRing)}
      >
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", S.cls)} />
        <span className="flex-1 text-sm text-text">
          <span className="sr-only">{S.word}: </span>
          {title}
          {severity === "locked" && (
            <Badge tone="pro" className="ml-2">
              Pro
            </Badge>
          )}
        </span>
        {children && (
          <ChevronDown aria-hidden className={cn("mt-0.5 size-4 text-text-muted transition-transform", open && "rotate-180")} />
        )}
      </button>
      {open && children && (
        <div className="pb-3 pl-7 text-sm text-text-muted">
          {children}
          {target && onGoTo && (
            <button type="button" onClick={onGoTo} className={cn("mt-2 block font-medium text-text underline underline-offset-2", focusRing)}>
              Go to {target}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function CheckList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col", className)}>{children}</ul>;
}

/* ------------------------------------------------------------ keywords */

export type Keyword = { term: string; status: "matched" | "missing" | "dismissed" };

export function KeywordList({ keywords }: { keywords: Keyword[] }) {
  const matched = keywords.filter((k) => k.status === "matched");
  const missing = keywords.filter((k) => k.status !== "matched");
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h4 className="mb-1 text-sm font-semibold text-text">
          In your resume <span className="font-normal text-text-muted">({matched.length} of {keywords.length})</span>
        </h4>
        <ul>
          {matched.map((k) => (
            <li key={k.term} className="flex items-center justify-between py-1.5 text-sm text-text">
              {k.term}
              <Check aria-label="matched" className="size-4 text-success" />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="mb-1 text-sm font-semibold text-text">
          Missing <span className="font-normal text-text-muted">({missing.length})</span>
        </h4>
        <ul>
          {missing.map((k) => (
            <li
              key={k.term}
              className={cn(
                "flex items-center justify-between py-1.5 text-sm",
                k.status === "dismissed" ? "text-text-muted line-through" : "text-text",
              )}
            >
              {k.term}
              {k.status === "dismissed" ? (
                <span className="text-xs no-underline">Not relevant</span>
              ) : (
                <Circle aria-label="missing" className="size-4 text-border-input" />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
