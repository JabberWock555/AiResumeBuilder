"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/layout";
import { Field, Input } from "@/components/ui/field";
import { Combobox } from "@/components/ui/select";
import { Switch } from "@/components/ui/toggles";
import { countryOptions } from "@/lib/countries";
import type { Contact } from "@/lib/resume/schema";
import { useEditor } from "./context";

export function ContactForm() {
  const { content, setContent } = useEditor();
  const c = content.contact;
  const set = (patch: Partial<Contact>) => setContent((x) => ({ ...x, contact: { ...x.contact, ...patch } }));
  const countries = useMemo(() => countryOptions(), []);
  const emailBad = c.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim());

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl text-text">Contact details</h1>
        <p className="mt-1 text-sm text-text-muted">How employers reach you. Saved as you type.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={c.fullName} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" maxLength={120} />
        </Field>
        <Field label="Email" required error={emailBad ? "Check this email address." : undefined}>
          <Input type="email" value={c.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" maxLength={160} />
        </Field>
        <Field label="Phone" required>
          <Input type="tel" value={c.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" maxLength={40} />
        </Field>
        <Field label="LinkedIn" helper="Just the part after /in/.">
          <Input
            prefix="linkedin.com/in/"
            value={c.linkedin}
            onChange={(e) => set({ linkedin: e.target.value.replace(/^.*linkedin\.com\/in\//i, "").replace(/\/$/, "") })}
            maxLength={100}
          />
        </Field>
        <Field label="Website or portfolio" className="sm:col-span-2">
          <Input value={c.website} onChange={(e) => set({ website: e.target.value })} inputMode="url" placeholder="yourname.com" maxLength={200} />
        </Field>
        <Field label="City">
          <Input value={c.city} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" maxLength={80} />
        </Field>
        <Field
          label="State or region"
          trailing={<Switch label="Show on resume" checked={c.showState} onCheckedChange={(v) => set({ showState: v })} className="text-xs" />}
        >
          <Input value={c.state} onChange={(e) => set({ state: e.target.value })} autoComplete="address-level1" maxLength={80} />
        </Field>
        <Field
          label="Country"
          className="sm:col-span-2"
          trailing={<Switch label="Show on resume" checked={c.showCountry} onCheckedChange={(v) => set({ showCountry: v })} />}
        >
          <Combobox options={countries} value={c.country || null} onValueChange={(v) => set({ country: v })} placeholder="Search countries" />
        </Field>
      </div>
    </Card>
  );
}
