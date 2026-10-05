"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EntryCard } from "@/components/ui/editor";
import type { EducationEntry, SimpleEntry, SkillsEntry } from "@/lib/resume/schema";
import { useSection } from "./use-section";

const yearValue = (v: string) => {
  const n = Number(v.replace(/\D/g, "").slice(0, 4));
  return n >= 1950 && n <= 2100 ? n : null;
};

function YearInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [raw, setRaw] = useState(value ? String(value) : "");
  const bad = raw.length > 0 && yearValue(raw) === null;
  return (
    <Input
      inputMode="numeric"
      value={raw}
      maxLength={4}
      aria-invalid={bad || undefined}
      placeholder="2024"
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(yearValue(e.target.value));
      }}
    />
  );
}

function Heading({ title, intro }: { title: string; intro: string }) {
  return (
    <div>
      <h1 className="text-xl text-text">{title}</h1>
      <p className="mt-1 text-sm text-text-muted">{intro}</p>
    </div>
  );
}

export function EducationForm() {
  const { entries, update, add, remove, move } = useSection("education");
  return (
    <div className="flex flex-col gap-4">
      <Heading title="Education" intro="Your highest qualification first. Leave out school once you have a degree." />
      {entries.length === 0 && <Card className="text-sm text-text-muted">Nothing here yet.</Card>}
      {(entries as EducationEntry[]).map((e, i) => (
        <EntryCard
          key={e.id}
          title={e.degree || "New qualification"}
          subtitle={[e.institution, e.year].filter(Boolean).join(" · ")}
          index={i}
          count={entries.length}
          onMove={move}
          onDelete={() => remove(e.id)}
          defaultOpen={entries.length === 1 || !e.degree}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Degree or qualification" className="sm:col-span-2" helper="Include the subject, e.g. “BSc, Computer Science”.">
              <Input value={e.degree} onChange={(x) => update(e.id, { degree: x.target.value })} maxLength={160} />
            </Field>
            <Field label="School, college or university">
              <Input value={e.institution} onChange={(x) => update(e.id, { institution: x.target.value })} maxLength={160} />
            </Field>
            <Field label="Location">
              <Input value={e.location} onChange={(x) => update(e.id, { location: x.target.value })} maxLength={120} />
            </Field>
            <Field label="Year finished" helper="Or the year you expect to.">
              <YearInput value={e.year} onChange={(v) => update(e.id, { year: v })} />
            </Field>
            <Field label="GPA" helper="Only if it helps (3.5 or higher).">
              <Input value={e.gpa} onChange={(x) => update(e.id, { gpa: x.target.value })} maxLength={20} />
            </Field>
            <Field label="Minor">
              <Input value={e.minor} onChange={(x) => update(e.id, { minor: x.target.value })} maxLength={120} />
            </Field>
            <Field label="Anything else" className="sm:col-span-2" helper="Honours, thesis, relevant modules.">
              <Textarea value={e.extra} onChange={(x) => update(e.id, { extra: x.target.value })} maxLength={600} />
            </Field>
          </div>
        </EntryCard>
      ))}
      <Button variant="secondary" className="self-start" onClick={add}>
        <Plus aria-hidden className="size-4" /> Add a qualification
      </Button>
    </div>
  );
}

function SkillItems({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [raw, setRaw] = useState(value.join(", "));
  return (
    <Input
      value={raw}
      placeholder="Figma, Prototyping, User research"
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(
          e.target.value
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 40),
        );
      }}
    />
  );
}

export function SkillsForm() {
  const { entries, update, add, remove, move } = useSection("skills");
  return (
    <div className="flex flex-col gap-4">
      <Heading title="Skills" intro="Group them so they’re quick to scan. Use the job ad’s words for the same skills." />
      {(entries as SkillsEntry[]).map((e, i) => (
        <EntryCard
          key={e.id}
          title={e.category || "New group"}
          subtitle={e.items.length ? `${e.items.length} skill${e.items.length > 1 ? "s" : ""}` : undefined}
          index={i}
          count={entries.length}
          onMove={move}
          onDelete={() => remove(e.id)}
          defaultOpen
        >
          <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
            <Field label="Group name" helper="e.g. Tools, Languages, Methods.">
              <Input value={e.category} onChange={(x) => update(e.id, { category: x.target.value })} maxLength={60} />
            </Field>
            <Field label="Skills" helper="Separate with commas.">
              <SkillItems value={e.items} onChange={(items) => update(e.id, { items })} />
            </Field>
          </div>
        </EntryCard>
      ))}
      <Button variant="secondary" className="self-start" onClick={add}>
        <Plus aria-hidden className="size-4" /> Add a group
      </Button>
    </div>
  );
}

export function SimpleForm({ type }: { type: "certifications" | "coursework" }) {
  const { entries, update, add, remove, move } = useSection(type);
  const c =
    type === "certifications"
      ? { title: "Certifications", intro: "Licences and certificates, with who issued them.", name: "Certification", issuer: "Issued by", add: "Add a certification" }
      : { title: "Coursework", intro: "Courses that matter for the job you want.", name: "Course", issuer: "School or platform", add: "Add a course" };
  return (
    <div className="flex flex-col gap-4">
      <Heading title={c.title} intro={c.intro} />
      {(entries as SimpleEntry[]).map((e, i) => (
        <EntryCard
          key={e.id}
          title={e.name || `New ${c.name.toLowerCase()}`}
          subtitle={[e.issuer, e.year].filter(Boolean).join(" · ")}
          index={i}
          count={entries.length}
          onMove={move}
          onDelete={() => remove(e.id)}
          defaultOpen={entries.length === 1 || !e.name}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={c.name}>
              <Input value={e.name} onChange={(x) => update(e.id, { name: x.target.value })} maxLength={160} />
            </Field>
            <Field label={c.issuer}>
              <Input value={e.issuer} onChange={(x) => update(e.id, { issuer: x.target.value })} maxLength={160} />
            </Field>
            <Field label="Year">
              <YearInput value={e.year} onChange={(v) => update(e.id, { year: v })} />
            </Field>
            <Field label="Detail" helper="Optional: an ID, grade or what it covered.">
              <Input value={e.detail} onChange={(x) => update(e.id, { detail: x.target.value })} maxLength={600} />
            </Field>
          </div>
        </EntryCard>
      ))}
      <Button variant="secondary" className="self-start" onClick={add}>
        <Plus aria-hidden className="size-4" /> {c.add}
      </Button>
    </div>
  );
}
