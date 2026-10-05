"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ResumeContent, ResumeSettings, TemplateId } from "@/lib/resume/schema";
import { cn } from "@/lib/cn";
import { PAGE, ResumeDocument } from "./resume-document";

/**
 * A resume page scaled down to fit its container's width. Used for the live
 * preview and thumbnails. `clip` limits it to the first page (thumbnails).
 */
export function ScaledPage({
  content,
  settings,
  templateId,
  highlight,
  clip,
  pageBreaks,
  onPages,
  className,
  label,
}: {
  content: ResumeContent;
  settings: ResumeSettings;
  templateId: TemplateId;
  highlight?: string[];
  clip?: boolean;
  pageBreaks?: boolean;
  onPages?: (n: number) => void;
  className?: string;
  /** Accessible name; thumbnails are decorative and pass none. */
  label?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [height, setHeight] = useState(0);
  const [w, h] = PAGE[settings.pageSize].px;

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const s = o.clientWidth / w;
      setScale(s);
      setHeight(i.scrollHeight);
      onPages?.(Math.max(1, Math.ceil((i.scrollHeight - 2) / h)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [w, h, onPages]);

  const pages = Math.max(1, Math.ceil((height - 2) / h));
  const shownHeight = clip ? h : pages * h;

  return (
    <div
      ref={outer}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ height: scale ? shownHeight * scale : undefined, aspectRatio: scale ? undefined : `${w} / ${h}` }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div ref={inner} className="absolute top-0 left-0 origin-top-left" style={{ width: w, transform: `scale(${scale || 0.0001})` }}>
        <ResumeDocument content={content} settings={settings} templateId={templateId} highlight={highlight} className="min-h-0" />
        {pageBreaks &&
          !clip &&
          Array.from({ length: pages - 1 }, (_, n) => (
            <div key={n} className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-warning-fill" style={{ top: (n + 1) * h }}>
              <span className="absolute -top-6 right-2 rounded-sm bg-warning-soft px-2 text-sm text-warning">Page {n + 2}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
