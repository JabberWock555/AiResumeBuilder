"use client";

import { createContext, useContext } from "react";
import type { ResumeContent, ResumeSettings, TemplateId } from "@/lib/resume/schema";
import type { ScoreReport } from "@/lib/score";
import type { TargetJob, Usage } from "@/server/repo/types";

export type EditorCtx = {
  resumeId: string;
  name: string;
  experienceLevel: string;
  content: ResumeContent;
  settings: ResumeSettings;
  templateId: TemplateId;
  target: TargetJob | null;
  report: ScoreReport;
  usage: Usage;
  credits: number | null;
  setContent: (fn: (c: ResumeContent) => ResumeContent) => void;
  setSettings: (fn: (s: ResumeSettings) => ResumeSettings) => void;
  setTemplate: (t: TemplateId) => void;
  setTarget: (t: TargetJob | null) => void;
  setCredits: (n: number | null) => void;
  /** Save everything now; resolves with the saved revision. */
  flush: () => Promise<number>;
  /** Show the right message for an API error (upgrade dialog for limits). */
  fail: (e: unknown) => void;
};

export const EditorContext = createContext<EditorCtx | null>(null);

export function useEditor() {
  const c = useContext(EditorContext);
  if (!c) throw new Error("useEditor outside the editor");
  return c;
}
