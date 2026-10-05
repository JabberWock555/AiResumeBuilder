"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  Mic,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Combobox, Select } from "@/components/ui/select";
import { Checkbox, RadioCard, RadioCardGroup, Switch } from "@/components/ui/toggles";
import { SectionNav, SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogTrigger,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  SheetContent,
  Tooltip,
  TooltipProvider,
  ToastProvider,
  useToast,
} from "@/components/ui/overlays";
import { CheckItem, CheckList, KeywordList, ScoreGauge, ScoreRing } from "@/components/ui/score";
import { Avatar, Banner, Card, EmptyState, SidebarNav, Skeleton, Stepper, UsageMeter } from "@/components/ui/layout";
import {
  AiButton,
  BulletEditor,
  EntryCard,
  MonthYearPicker,
  TemplateCard,
  formatYM,
  type Bullet,
  type YearMonth,
} from "@/components/ui/editor";
import { cn } from "@/lib/cn";

const ROLES = [
  "bg", "surface", "surface-muted", "border", "border-input", "text", "text-muted",
  "accent", "accent-hover", "accent-soft", "on-accent", "focus", "ai", "ai-soft", "highlight",
  "danger", "danger-soft", "warning", "warning-soft", "warning-fill", "success", "success-soft",
];

const TYPE = [
  ["display", "text-display"],
  ["2xl", "text-2xl"],
  ["xl", "text-xl"],
  ["lg", "text-lg"],
  ["base", "text-base"],
  ["sm", "text-sm"],
  ["xs", "text-xs"],
] as const;

const LEVELS = [
  { value: "internship", label: "Internship" },
  { value: "entry", label: "Entry level" },
  { value: "associate", label: "Associate" },
  { value: "junior", label: "Junior" },
  { value: "mid_senior", label: "Mid–senior" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive" },
];

const COUNTRIES = [
  "Australia", "Brazil", "Canada", "France", "Germany", "India", "Ireland", "Japan", "Mexico",
  "Netherlands", "New Zealand", "Nigeria", "Singapore", "South Africa", "Spain", "United Arab Emirates",
  "United Kingdom", "United States",
].map((c) => ({ value: c, label: c }));

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t border-border py-10">
      <h2 id={`${id}-h`} className="mb-6 text-xl text-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-6">
      <span className="w-40 shrink-0 text-xs text-text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

type Theme = "system" | "light" | "dark";

// The theme lives on <html data-theme>, set before paint by the root layout.
// Read it as an external store so the server render ("system") and the
// client agree without a setState-in-effect.
function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const readTheme = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? "system";

function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  function pick(t: Theme) {
    const el = document.documentElement;
    if (t === "system") delete el.dataset.theme;
    else el.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
  }
  return (
    <SegmentedControl
      aria-label="Theme"
      value={theme}
      onValueChange={(v) => pick(v as Theme)}
      options={[
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
}

function MiniResume({ variant }: { variant: "standard" | "compact" | "modern" }) {
  return (
    <div className="flex h-full flex-col gap-1.5 bg-paper p-3 text-[5px] leading-[7px] text-ink" aria-hidden>
      <div className={cn("font-bold", variant === "modern" ? "text-left text-[9px] leading-[10px]" : "text-center text-[8px] leading-[10px]")}>
        Jordan Lee
      </div>
      <div className={variant === "modern" ? "" : "text-center"}>jordan@example.com · (555) 010-0000</div>
      {["Summary", "Experience", "Education", "Skills"].map((h) => (
        <div key={h} className="flex flex-col gap-0.5">
          <div className={cn("font-bold uppercase", variant === "compact" ? "" : "border-b border-paper-rule pb-px")}>{h}</div>
          <div className="h-1 w-full rounded-[1px] bg-paper-muted" />
          <div className="h-1 w-5/6 rounded-[1px] bg-paper-muted" />
          {variant !== "compact" && <div className="h-1 w-4/6 rounded-[1px] bg-paper-muted" />}
        </div>
      ))}
    </div>
  );
}

function Demo() {
  const toast = useToast();
  const [level, setLevel] = useState<string>();
  const [country, setCountry] = useState<string | null>("United States");
  const [target, setTarget] = useState(true);
  const [plan, setPlan] = useState("quarter");
  const [start, setStart] = useState<YearMonth | "present" | null>({ year: 2024, month: 3 });
  const [end, setEnd] = useState<YearMonth | "present" | null>("present");
  const [fontSize, setFontSize] = useState(10);
  const [confirm, setConfirm] = useState(false);
  const [aiState, setAiState] = useState<"ready" | "generating">("ready");
  const [suggestion, setSuggestion] = useState<{ bulletId: string; text: string } | null>(null);
  const [saved, setSaved] = useState<string[]>(["standard"]);
  const [tpl, setTpl] = useState("standard");
  const [sections, setSections] = useState({ projects: true, certifications: false, coursework: false });
  const idc = useRef(10);
  const newId = () => `b${idc.current++}`;
  const [bullets, setBullets] = useState<Bullet[]>([
    { id: "b1", text: "i was responsible for the mobile app redesign" },
    { id: "b2", text: "Ran 14 usability sessions and cut checkout drop-off by [number]%." },
  ]);
  const [entries, setEntries] = useState([
    { id: "e1", title: "Product Designer", subtitle: "Harbor Health · Mar 2024 – Present" },
    { id: "e2", title: "UX Designer", subtitle: "Northwind Labs · Jun 2022 – Feb 2024" },
    { id: "e3", title: "Design Intern", subtitle: "Brightline Studio · Jun 2021 – Aug 2021" },
  ]);
  const move = (from: number, to: number) =>
    setEntries((xs) => {
      const next = xs.slice();
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });

  function runAi() {
    setAiState("generating");
    setTimeout(() => {
      setAiState("ready");
      setSuggestion({
        bulletId: "b1",
        text: "Led the mobile app redesign with two engineers, shipping a new onboarding flow that raised week-one retention by [number]%.",
      });
    }, 1200);
  }

  return (
    <main className="mx-auto max-w-(--layout-content-max) px-4 pb-24 md:px-6">
      <header className="flex flex-col gap-4 py-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-text-muted">Resume builder</p>
          <h1 className="text-2xl text-text">Design system</h1>
          <p className="mt-2 max-w-xl text-base text-text-muted">
            Every shared component in each of its states. Colours come from{" "}
            <code className="rounded-sm bg-surface-muted px-1 font-mono text-sm">replica/design/tokens.json</code>; the accent is a
            neutral placeholder until the brand is chosen.
          </p>
        </div>
        <ThemeSwitch />
      </header>

      <Section id="colour" title="Colour roles">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ROLES.map((r) => (
            <li key={r} className="overflow-hidden rounded-md border border-border bg-surface">
              <div className="h-14 border-b border-border" style={{ background: `var(--c-${r})` }} />
              <div className="px-2.5 py-2 text-xs text-text">{r}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Type">
        <div className="flex flex-col gap-3">
          {TYPE.map(([name, cls]) => (
            <div key={name} className="flex items-baseline gap-6">
              <span className="w-16 shrink-0 text-xs text-text-muted">{name}</span>
              <span className={cn(cls, "text-text")}>Land the interview you want</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <Row label="Variants">
          <Button>Create resume</Button>
          <Button variant="secondary">Preview</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">
            <Trash2 aria-hidden className="size-4" /> Delete
          </Button>
          <Button variant="ai">
            <Sparkles aria-hidden className="size-4" /> Suggest with AI
          </Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="sm" variant="secondary" iconOnly aria-label="More">
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
          <Button variant="secondary" iconOnly aria-label="Add">
            <Plus aria-hidden className="size-4" />
          </Button>
        </Row>
        <Row label="States">
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" loading>
            Exporting
          </Button>
        </Row>
      </Section>

      <Section id="badges" title="Badges">
        <Row label="Tones">
          <Badge>Draft</Badge>
          <Badge tone="new">New</Badge>
          <Badge tone="pro">Pro</Badge>
          <Badge tone="warning">2 warnings</Badge>
          <Badge tone="danger">1 error</Badge>
          <Badge tone="ai">AI</Badge>
        </Row>
      </Section>

      <Section id="fields" title="Fields">
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Resume name" required helper="Only you see this name.">
            <Input placeholder="Jordan Lee – Product Designer" />
          </Field>
          <Field label="Email" error="Enter an email address like name@example.com">
            <Input type="email" defaultValue="jordan@" />
          </Field>
          <Field label="LinkedIn">
            <Input prefix="linkedin.com/in/" placeholder="your-name" />
          </Field>
          <Field label="Company" helper="Disabled until a role is added.">
            <Input disabled placeholder="Company name" />
          </Field>
          <Field label="Job description" helper="Paste the whole ad. We pick out the keywords." className="md:col-span-2">
            <Textarea placeholder="Paste the job ad here" />
          </Field>
        </div>
      </Section>

      <Section id="selects" title="Selects">
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Experience level">
            <Select options={LEVELS} value={level} onValueChange={setLevel} placeholder="Choose a level" />
          </Field>
          <Field label="Country" trailing={<Switch label="Show on resume" defaultChecked />}>
            <Combobox options={COUNTRIES} value={country} onValueChange={setCountry} placeholder="Search countries" />
          </Field>
        </div>
      </Section>

      <Section id="toggles" title="Switches, checkboxes, plan cards">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Switch label="Tailor to a job ad" checked={target} onCheckedChange={setTarget} className="justify-between" />
            <Switch label="Show on resume" defaultChecked className="justify-between" />
            <Switch label="Disabled" disabled className="justify-between" />
            <Checkbox label="Projects" checked={sections.projects} onCheckedChange={(c) => setSections((s) => ({ ...s, projects: !!c }))} />
            <Checkbox label="Certifications" checked={sections.certifications} onCheckedChange={(c) => setSections((s) => ({ ...s, certifications: !!c }))} />
            <Checkbox label="Coursework" checked={sections.coursework} onCheckedChange={(c) => setSections((s) => ({ ...s, coursework: !!c }))} />
          </div>
          <RadioCardGroup value={plan} onValueChange={setPlan} aria-label="Billing plan">
            <RadioCard value="month" title="Monthly" description="Cancel any time" aside={<b>$19 / mo</b>} />
            <RadioCard
              value="quarter"
              title="Every 3 months"
              description="Billed $45 every 3 months"
              badge={<Badge tone="new">Save 21%</Badge>}
              aside={<b>$15 / mo</b>}
            />
            <RadioCard value="lifetime" title="Lifetime" description="Pay once" aside={<b>$99</b>} />
          </RadioCardGroup>
        </div>
        <p className="mt-3 text-xs text-text-muted">Prices are placeholders for the layout, not a pricing decision.</p>
      </Section>

      <Section id="tabs" title="Tabs and section navigation">
        <Tabs defaultValue="resumes">
          <TabsList aria-label="Documents">
            <TabsTrigger value="resumes">Resumes</TabsTrigger>
            <TabsTrigger value="letters">Cover letters</TabsTrigger>
            <TabsTrigger value="resignation">Resignation letters</TabsTrigger>
          </TabsList>
          <TabsContent value="resumes" className="pt-3 text-sm text-text-muted">
            Your resumes appear here.
          </TabsContent>
          <TabsContent value="letters" className="pt-3 text-sm text-text-muted">
            Your cover letters appear here.
          </TabsContent>
          <TabsContent value="resignation" className="pt-3 text-sm text-text-muted">
            Your resignation letters appear here.
          </TabsContent>
        </Tabs>
        <div className="mt-6 max-w-full">
          <SectionNav
            current="#experience"
            items={[
              { href: "#contact", label: "Contact" },
              { href: "#experience", label: "Experience", status: "error" },
              { href: "#education", label: "Education" },
              { href: "#skills", label: "Skills", status: "warning" },
              { href: "#summary", label: "Summary" },
              { href: "#finish", label: "Finish and download" },
            ]}
          />
        </div>
      </Section>

      <Section id="entries" title="Entry cards, dates and bullets">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col gap-3">
            {entries.map((e, i) => (
              <EntryCard
                key={e.id}
                title={e.title}
                subtitle={e.subtitle}
                index={i}
                count={entries.length}
                onMove={move}
                onDuplicate={() => toast({ tone: "info", title: `Duplicated ${e.title}` })}
                onDelete={() => setConfirm(true)}
              >
                <p className="text-sm text-text-muted">The entry’s form goes here.</p>
              </EntryCard>
            ))}
          </div>
          <Card className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Started">
                <MonthYearPicker label="Start date" value={start} onChange={setStart} />
              </Field>
              <Field
                label="Ended"
                error={
                  start && start !== "present" && end && end !== "present" && (end.year < start.year || (end.year === start.year && end.month < start.month))
                    ? "The end date is before the start date"
                    : undefined
                }
              >
                <MonthYearPicker
                  label="End date"
                  value={end}
                  onChange={setEnd}
                  allowPresent
                  min={start && start !== "present" ? start : null}
                />
              </Field>
            </div>
            <p className="text-xs text-text-muted" aria-live="polite">
              Shown as: {formatYM(start)} – {formatYM(end) || "…"}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-text">What you did</span>
                <AiButton
                  credits={7}
                  state={aiState}
                  onRun={runAi}
                  modes={[
                    { label: "Add a number to it", onSelect: runAi },
                    { label: "Rewrite it", onSelect: runAi },
                  ]}
                />
              </div>
              <BulletEditor
                bullets={bullets}
                onChange={setBullets}
                newId={newId}
                issues={[
                  { bulletId: "b1", severity: "error", message: "Start with a capital letter and end with a full stop." },
                  { bulletId: "b1", severity: "warning", message: "“was responsible for” is weak. Start with what you did: led, built, cut." },
                ]}
                suggestion={suggestion}
                onApplySuggestion={() => {
                  if (!suggestion) return;
                  setBullets((bs) => bs.map((b) => (b.id === suggestion.bulletId ? { ...b, text: suggestion.text } : b)));
                  setSuggestion(null);
                }}
                onDismissSuggestion={() => setSuggestion(null)}
              />
            </div>
            <div className="flex items-center gap-3">
              <AiButton credits={0} state="not-ready" notReadyReason="Add the role and company first" onRun={() => {}} />
              <span className="text-xs text-text-muted">Not-ready state, with the reason in a tooltip</span>
            </div>
          </Card>
        </div>
      </Section>

      <Section id="feedback" title="Score, checks and keywords">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="flex flex-col items-center gap-4">
            <ScoreGauge score={54} />
            <div className="flex items-center gap-4">
              <ScoreRing score={32} size={32} />
              <ScoreRing score={68} size={40} />
              <ScoreRing score={91} size={48} />
            </div>
          </Card>
          <Card>
            <h3 className="mb-1 text-base font-semibold text-text">Improvements</h3>
            <CheckList>
              <CheckItem severity="error" title="Weak opening words" target="Product Designer" onGoTo={() => {}} defaultOpen>
                One bullet starts with “was responsible for”. Start with what you did.
              </CheckItem>
              <CheckItem severity="warning" title="Add numbers where you can" target="UX Designer" onGoTo={() => {}}>
                2 of 5 bullets have a figure. Real numbers only.
              </CheckItem>
              <CheckItem severity="warning" title="Bullets per role">
                Aim for 3 to 6 for each role. Design Intern has 1.
              </CheckItem>
              <CheckItem severity="pass" title="No personal pronouns" />
              <CheckItem severity="pass" title="Consistent date format" />
            </CheckList>
          </Card>
          <Card>
            <h3 className="mb-3 text-base font-semibold text-text">Job keywords</h3>
            <KeywordList
              keywords={[
                { term: "Figma", status: "matched" },
                { term: "User research", status: "matched" },
                { term: "Usability testing", status: "matched" },
                { term: "Design systems", status: "missing" },
                { term: "Accessibility (WCAG)", status: "missing" },
                { term: "A/B testing", status: "dismissed" },
              ]}
            />
          </Card>
        </div>
      </Section>

      <Section id="overlays" title="Dialogs, sheets, menus, toasts, tooltips">
        <Row label="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">New resume</Button>
            </DialogTrigger>
            <DialogContent
              title="New resume"
              description="Start from scratch or bring an existing file."
              footer={
                <>
                  <Button variant="ghost">Cancel</Button>
                  <Button>Create</Button>
                </>
              }
            >
              <div className="flex flex-col gap-4">
                <Field label="Resume name" required>
                  <Input placeholder="Jordan Lee – Product Designer" />
                </Field>
                <Field label="Experience level">
                  <Select options={LEVELS} placeholder="Choose a level" />
                </Field>
                <Switch label="Tailor to a job ad" className="justify-between" />
              </div>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Score report (sheet)</Button>
            </DialogTrigger>
            <SheetContent title="Resume score" description="What’s helping and what to fix next.">
              <div className="flex flex-col items-center gap-6">
                <ScoreGauge score={72} />
                <CheckList className="w-full">
                  <CheckItem severity="warning" title="Resume fills 0.4 of a page">
                    One full page reads as complete for most roles.
                  </CheckItem>
                  <CheckItem severity="pass" title="Bullets end with a full stop" />
                </CheckList>
              </div>
            </SheetContent>
          </Dialog>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Delete resume
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="Delete “Jordan Lee – Product Designer”?"
            description="The resume, its versions and its job ad are removed."
            confirmLabel="Delete resume"
            onConfirm={() => {
              setConfirm(false);
              toast({ tone: "success", title: "Resume deleted" });
            }}
          />
        </Row>
        <Row label="Menu">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary">Add a section</Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuLabel>Optional sections</MenuLabel>
              <MenuCheckboxItem checked={sections.projects} onCheckedChange={(c) => setSections((s) => ({ ...s, projects: c }))}>
                Projects
              </MenuCheckboxItem>
              <MenuCheckboxItem checked={sections.certifications} onCheckedChange={(c) => setSections((s) => ({ ...s, certifications: c }))}>
                Certifications
              </MenuCheckboxItem>
              <MenuSeparator />
              <MenuSub>
                <MenuSubTrigger>Academic</MenuSubTrigger>
                <MenuSubContent>
                  <MenuItem>Awards</MenuItem>
                  <MenuItem>Publications</MenuItem>
                </MenuSubContent>
              </MenuSub>
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar name="Jordan Lee" /> Account
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>jordan@example.com</MenuLabel>
              <MenuItem>
                <User aria-hidden className="size-4" /> Account
              </MenuItem>
              <MenuItem>
                <Settings aria-hidden className="size-4" /> Settings
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive>Log out</MenuItem>
            </MenuContent>
          </Menu>
        </Row>
        <Row label="Toast">
          <Button variant="secondary" onClick={() => toast({ tone: "success", title: "Saved" })}>
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ tone: "error", title: "Couldn't save. Check your connection.", action: { label: "Retry", onClick: () => {} } })}
          >
            Error toast
          </Button>
        </Row>
        <Row label="Tooltip">
          <Tooltip content="Search your resumes">
            <Button variant="secondary" iconOnly aria-label="Search">
              <Search aria-hidden className="size-4" />
            </Button>
          </Tooltip>
        </Row>
      </Section>

      <Section id="navigation" title="Navigation and banners">
        <div className="flex flex-col gap-6">
          <Banner tone="promo" action={<Button size="sm" variant="secondary">See plans</Button>}>
            Pro unlocks unlimited resumes and Word downloads.
          </Banner>
          <Banner tone="warning" dismissible={false}>
            You’re offline. Changes are saved on this device and sync when you’re back.
          </Banner>
          <div className="flex h-[560px] overflow-hidden rounded-lg border border-border">
            <SidebarNav
              landmark={false}
              current="/app"
              primary={
                <Button className="w-full">
                  <Plus aria-hidden className="size-4" /> New resume
                </Button>
              }
              items={[
                { href: "/app", label: "Resumes", icon: LayoutDashboard },
                { href: "/app/letters", label: "Cover letters", icon: FileText },
                { href: "/app/jobs", label: "Job tracker", icon: Briefcase, badge: <Badge tone="new">New</Badge> },
                { href: "/app/interview", label: "Interview practice", icon: Mic },
                { href: "/app/settings", label: "Settings", icon: Settings },
              ]}
              footer={
                <UsageMeter
                  rows={[
                    { label: "Resumes", used: 1, max: 1 },
                    { label: "AI suggestions", used: 3, max: 10 },
                    { label: "Downloads", used: 1, max: 3 },
                  ]}
                />
              }
            />
            <SidebarNav
              landmark={false}
              rail
              current="/app"
              items={[
                { href: "/app", label: "Resumes", icon: LayoutDashboard },
                { href: "/app/letters", label: "Cover letters", icon: FileText },
                { href: "/app/jobs", label: "Job tracker", icon: Briefcase },
                { href: "/app/settings", label: "Settings", icon: Settings },
              ]}
            />
            <div className="flex-1 bg-bg p-6 text-sm text-text-muted">Page content</div>
          </div>
        </div>
      </Section>

      <Section id="templates" title="Templates and formatting">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(["standard", "compact", "modern"] as const).map((v) => (
              <TemplateCard
                key={v}
                name={v[0].toUpperCase() + v.slice(1)}
                selected={tpl === v}
                locked={v === "modern"}
                favourite={saved.includes(v)}
                onSelect={() => setTpl(v)}
                onToggleFavourite={() => setSaved((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
              >
                <MiniResume variant={v} />
              </TemplateCard>
            ))}
          </div>
          <Card className="flex flex-col gap-4">
            <Stepper label="Font size" value={fontSize} onChange={setFontSize} min={8} max={12} step={0.5} unit="pt" />
            <Stepper label="Section spacing" value={3} onChange={() => {}} min={0} max={6} />
            <Switch label="Show page breaks" defaultChecked className="justify-between" />
          </Card>
        </div>
      </Section>

      <Section id="empty" title="Empty, loading, avatar">
        <div className="grid gap-6 md:grid-cols-2">
          <EmptyState
            icon={FileText}
            title="No resumes yet"
            body="Start one from scratch or drop an existing PDF or Word file here."
            action={<Button>New resume</Button>}
          />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-32 w-full" />
            <div className="flex items-center gap-3">
              <Avatar name="Jordan Lee" />
              <Avatar name="Sam Okafor" size={40} />
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}

export function DesignSystem() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <Demo />
      </ToastProvider>
    </TooltipProvider>
  );
}
