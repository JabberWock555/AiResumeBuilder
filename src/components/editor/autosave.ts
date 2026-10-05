"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { ResumePatch } from "@/server/repo/types";

export type SaveStatus = "saved" | "unsaved" | "saving" | "offline" | "conflict";

/**
 * Debounced autosave with optimistic concurrency. Patches merge while a save
 * is queued; every PATCH carries the revision it was based on, and a 409
 * means another tab changed the resume.
 */
export function useAutosave(resumeId: string, initialRevision: number, delay = 800) {
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
          const r = await api<{ revision: number }>(`/api/resumes/${resumeId}`, {
            method: "PATCH",
            body: { revision: revision.current, ...patch },
          });
          revision.current = r.revision;
          setStatus(pending.current ? "unsaved" : "saved");
        } catch (e) {
          // Put the patch back (newer edits win) so nothing is lost.
          pending.current = { ...patch, ...(pending.current ?? {}) };
          setStatus(e instanceof ApiError && e.status === 409 ? "conflict" : "offline");
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
  }, [resumeId]);

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

  // Retry when the connection comes back.
  useEffect(() => {
    const online = () => pending.current && run().catch(() => {});
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [run]);

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
