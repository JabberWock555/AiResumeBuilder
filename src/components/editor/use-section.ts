"use client";

import { useCallback } from "react";
import { blankEntry, blankSection, type ResumeContent, type Section, type SectionType } from "@/lib/resume/schema";
import { useEditor } from "./context";

type EntryOf<T extends SectionType> = Extract<Section, { type: T }>["entries"][number];
type AnyEntry = { id: string; bullets?: { id: string; text: string }[] } & Record<string, unknown>;

/** Read and edit one section's entries. Creates the section if it's missing. */
export function useSection<T extends SectionType>(type: T) {
  const { content, setContent } = useEditor();
  const section = content.sections.find((s) => s.type === type) as Extract<Section, { type: T }> | undefined;
  const entries = (section?.entries ?? []) as EntryOf<T>[];

  // Internally entries are plain records; the typed API is the return value.
  const edit = useCallback(
    (fn: (entries: AnyEntry[]) => AnyEntry[]) =>
      setContent((c: ResumeContent) => {
        const has = c.sections.some((s) => s.type === type);
        const sections = has ? c.sections : [...c.sections, blankSection(type)];
        return {
          ...c,
          sections: sections.map((s) => (s.type === type ? ({ ...s, entries: fn(s.entries as unknown as AnyEntry[]) } as unknown as Section) : s)),
        };
      }),
    [setContent, type],
  );

  return {
    section,
    entries,
    update: (id: string, patch: Partial<EntryOf<T>>) => edit((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    add: () => {
      const e = blankEntry(type) as unknown as AnyEntry;
      edit((es) => [...es, e]);
      return e.id;
    },
    remove: (id: string) => edit((es) => es.filter((e) => e.id !== id)),
    duplicate: (id: string) =>
      edit((es) => {
        const i = es.findIndex((e) => e.id === id);
        if (i < 0) return es;
        const copy = structuredClone(es[i]);
        copy.id = `${copy.id}_c${Date.now().toString(36)}`;
        if (copy.bullets) copy.bullets = copy.bullets.map((b, n) => ({ ...b, id: `${copy.id}_b${n}` }));
        return [...es.slice(0, i + 1), copy, ...es.slice(i + 1)];
      }),
    move: (from: number, to: number) =>
      edit((es) => {
        const next = es.slice();
        const [it] = next.splice(from, 1);
        next.splice(to, 0, it);
        return next;
      }),
    rename: (title: string) =>
      setContent((c) => ({ ...c, sections: c.sections.map((s) => (s.type === type ? { ...s, title: title || undefined } : s)) })),
  };
}
