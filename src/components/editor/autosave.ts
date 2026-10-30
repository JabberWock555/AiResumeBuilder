"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { ResumePatch } from "@/server/repo/types";

export type SaveStatus = "saved" | "unsaved" | "saving" | "offline" | "conflict" | "signed_out";

// Edits that couldn't be saved are kept on this device until they are, so
// closing the tab while offline (or a crash) doesn't lose them.
type Draft = { baseRevision: number; patch: ResumePatch; at: string };
const draftKey = (resumeId: string) => `resume-draft:${resumeId}`;

function writeDraft(resumeId: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(draftKey(resumeId), JSON.stringify(d));
    else localStorage.removeItem(draftKey(resumeId));
  } catch {
    // Storage full or blocked (private mode): nothing more we can do here.
  }
}

/**
 * Takes the unsaved edits kept on this device, if any. They come back only if
 * the saved resume hasn't changed since; otherwise the newer saved copy wins.
 */
export function takeDraft(resumeId: string, serverRevision: number): { patch: ResumePatch; at: string } | "stale" | null {
  let d: Draft | null = null;
  try {
    d = JSON.parse(localStorage.getItem(draftKey(resumeId)) ?? "null");
  } catch {}
  if (!d?.patch) return null;
  if (d.baseRevision !== serverRevision) {
    writeDraft(resumeId, null);
    return "stale";
  }
  return { patch: d.patch, at: d.at };
}

/**
 * Debounced autosave with optimistic concurrency. Patches merge while a save
 * is queued; every PATCH carries the revision it was based on, and a 409
 * means another tab changed the resume.
 */
/**
 * `resumeId` names the document (and its on-device draft). `url` is where it
 * saves: a resume by default, or "/api/profile" for the saved profile.
 */
export function useAutosave(resumeId: string, initialRevision: number, delay = 800, url = `/api/resumes/${resumeId}`) {
  const revision = useRef(initialRevision);
  const pending = useRef<ResumePatch | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");

  // Saves whatever is pending, one request at a time, until nothing is left.
  const run = useCallback(async (): Promise<void> => {
    for (;;) {
      if (inflight.current) await inflight.current;
      const patch = pending.current;
      if (!patch) return;
      pending.current = null;
      setStatus("saving");
      const p = (async () => {
        try {
          const r = await api<{ revision: number }>(url, {
            method: "PATCH",
            body: { revision: revision.current, ...patch },
          });
          revision.current = r.revision;
          if (!pending.current) writeDraft(resumeId, null);
          setStatus(pending.current ? "unsaved" : "saved");
        } catch (e) {
          // Put the patch back (newer edits win) so nothing is lost, here and on disk.
          pending.current = { ...patch, ...(pending.current ?? {}) };
          writeDraft(resumeId, { baseRevision: revision.current, patch: pending.current, at: new Date().toISOString() });
          setStatus(
            e instanceof ApiError && e.status === 409 ? "conflict" : e instanceof ApiError && e.status === 401 ? "signed_out" : "offline",
          );
          throw e;
        }
      })();
      inflight.current = p.catch(() => {});
      try {
        await p;
      } finally {
        inflight.current = null;
      }
    }
  }, [resumeId, url]);

  const queue = useCallback(
    (patch: ResumePatch) => {
      pending.current = { ...(pending.current ?? {}), ...patch };
      setStatus((s) => (s === "conflict" ? s : "unsaved"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => run().catch(() => {}), delay);
    },
    [run, delay],
  );

  /** Save now and resolve with the saved revision. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await run();
    if (inflight.current) await inflight.current;
    return revision.current;
  }, [run]);

  /** After a conflict: keep this tab's version, based on the server's revision. */
  const overwrite = useCallback(
    async (serverRevision: number) => {
      revision.current = serverRevision;
      setStatus("unsaved");
      await run();
    },
    [run],
  );

  // Retry when the connection comes back, or when the tab is shown again
  // (the user may have logged back in from another tab).
  useEffect(() => {
    const retry = () => pending.current && !document.hidden && run().catch(() => {});
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("focus", retry);
    };
  }, [run]);

  // Keep what's still unsaved on this device when the tab goes away.
  useEffect(() => {
    const keep = () => {
      if (pending.current) writeDraft(resumeId, { baseRevision: revision.current, patch: pending.current, at: new Date().toISOString() });
    };
    window.addEventListener("pagehide", keep);
    return () => window.removeEventListener("pagehide", keep);
  }, [resumeId]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (pending.current || inflight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  return { status, queue, flush, overwrite, revision };
}
