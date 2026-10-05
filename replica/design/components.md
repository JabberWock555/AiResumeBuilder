# Components

Specs for every repeated UI part in `recon.md`, built once in `src/components/ui`
and shown together on the `/design` page. Tokens are role names from
`tokens.json`; utilities are the Tailwind names they generate (`bg-surface`,
`text-text-muted`, `rounded-md`). No raw colours or pixel values in components.

Base: Radix primitives (`radix-ui`) for anything with focus management or
keyboard rules (dialog, sheet, menu, select, tabs, switch, checkbox, radio,
popover, tooltip, toast, collapsible). Icons: Lucide (ISC licence).

Rules for every component:
- Focus is always visible: a 2px `focus` ring with a 2px offset, on
  `:focus-visible` only.
- Hit targets are at least 40×40 (32 allowed for dense toolbar icons with
  spacing around them).
- Disabled things say why, in a tooltip or helper text, when the reason isn't
  obvious ("Add a role first to use the AI writer").
- Motion uses `motion-base` and is off under `prefers-reduced-motion`.
- Copy is sentence case. Labels are not uppercase.

---

```
Button
  variants  primary (accent), secondary (surface + border), ghost, danger, ai
  sizes     sm 32, md 40, lg 48 (height); icon-only square of the same sizes
  states    default, hover (accent-hover / surface-muted), active (translate 0, darker),
            focus-visible, disabled (50% opacity, no pointer), loading (spinner + label kept)
  tokens    primary: bg accent, text on-accent; secondary: bg surface, border border, text text;
            ghost: text text, hover bg surface-muted; danger: text danger, border danger,
            hover bg danger-soft; ai: bg ai-soft, text ai
            radius md, text sm/600, gap 8, padding-x 16 (md)
  a11y      real <button>; loading sets aria-busy and keeps the label; icon-only needs aria-label
  used on   all
```

```
SplitButton (the AI writer button)
  parts     main Button (ai) + chevron Button opening a DropdownMenu of modes
  states    not ready (disabled, tooltip says what's missing), ready, generating
            (spinner, "Writing…"), suggestion shown (main becomes "Apply suggestion")
  extra     credit counter before it: sparkle icon + number, aria-label "8 AI credits left"
  a11y      the chevron has aria-label "More AI options"; menu is a Radix DropdownMenu
  used on   S19, S22
```

```
Input / Textarea / Field
  parts     Label (text sm/500), control, helper (text xs, text-muted), error (text xs, danger)
  sizes     input height 44; textarea min 3 rows, auto-grows
  states    empty (placeholder text-muted), focus (border focus + ring), filled,
            invalid (border danger, error text, aria-invalid), disabled (bg surface-muted),
            read-only
  variants  with prefix (fixed "linkedin.com/in/"), with trailing icon/button
  tokens    bg surface, border border-input 1px, radius md, text base
  a11y      label tied with htmlFor; helper and error via aria-describedby; error announced
            (role=alert only on submit, not on every keystroke)
  used on   S05, S06, S12, S18-S22, S14
```

```
Select (short fixed lists) and Combobox (long searchable lists)
  Select    Radix Select: experience level, font, sort. Type-ahead, arrow keys, Esc closes.
  Combobox  input + listbox in a Popover: country, state. Filters as you type; arrow keys move
            aria-activedescendant; Enter selects; Esc closes and restores the value.
  states    closed, open, highlighted option, selected (check icon), empty results ("No matches")
  tokens    trigger like Input; menu bg surface, shadow pop, radius md, option hover surface-muted
  used on   S12, S18, S27, S11 sort
```

```
Switch
  states    off (track border-input), on (track accent), focus, disabled
  tokens    track 36×20, thumb surface; label sits left, switch right, whole row clickable
  a11y      Radix Switch (role=switch, aria-checked); label is the accessible name
  used on   S12 target your resume, S18 show on resume, S19 currently work here, S22, S27
```

```
Checkbox and RadioGroup
  Checkbox  optional-section menu (S23), template filters
  RadioCard plan options (S17): card with radio, title, price, strike-through old price,
            "Save 30%" Badge; selected = 2px accent border
  a11y      Radix Checkbox / RadioGroup; arrow keys move between radio cards
```

```
Tabs (segmented)
  variants  segmented (pill track bg surface-muted, active bg surface + shadow card),
            underline (section tabs in the editor, scrolls horizontally with fade edges)
  states    default, hover, active (aria-selected), focus, with badge (count or warning dot)
  a11y      Radix Tabs; arrow keys move, Home/End jump. Editor section tabs are links
            (each tab is a URL), so they use a nav list with aria-current, not role=tablist
  used on   S11 doc types, S14 settings, S18-S24 editor sections
```

```
Card and EntryCard
  Card      bg surface, border border, radius lg, padding 24 (16 below md), shadow card
  EntryCard collapsible card for one experience/education/skills entry:
            header = title (role) + subtitle (company, dates) + drag handle + ⋯ menu + chevron
            states: collapsed, open, dragging (shadow pop, slight scale), keyboard-moving
  a11y      Radix Collapsible; header button has aria-expanded; drag handle also works with
            keyboard (Space to pick up, arrows to move, Space to drop, live region announces
            "Moved to position 2 of 4"); ⋯ menu has Move up / Move down / Duplicate / Delete
  used on   S11, S19-S21, S24
```

```
MonthYearPicker
  parts     two triggers (start, end) showing "Mar 2024 – Present"; Popover with year
            arrows and a 3×4 month grid; end picker has a "Currently work here" Switch
  states    empty, open, selected month, future months disabled, end before start (error)
  a11y      grid of buttons with aria-label "March 2024"; arrow keys move; year buttons labelled
  used on   S19, S20
```

```
BulletEditor
  parts     list of bullet rows (textarea each, auto-grow), add row on Enter, delete row on
            Backspace in an empty row, drag to reorder, issue underline on flagged text
  inline AI suggestion text in ai colour after the cursor; Tab or "Apply" accepts, Esc dismisses
  placeholders  [number] tokens the AI leaves for missing facts: highlighted with
            warning-soft, focusable, must be filled before the bullet is "done"
  a11y      each row labelled "Bullet 2 of 4"; suggestion is announced politely; flagged text
            has an explanation reachable by keyboard (not only a hover)
  used on   S19
```

```
CheckItem (one feedback check)
  severity  error (danger icon X), warning (warning icon !), pass (success check),
            locked (lock icon + Pro badge, if we keep any Pro checks)
  parts     title, explanation (expands), "Go to" link naming the entry ("UX Designer")
  a11y      list of buttons with aria-expanded; severity is in text, not colour only
            ("Error: Weak bullet points")
  used on   S19 Improvements panel, S25 report, S03 ATS checker
```

```
ScoreGauge and ScoreRing
  Gauge     semicircle 0-100, three bands (danger <50, warning-fill 50-79, success 80+),
            needle; number text 2xl, band label below ("Needs work", "Good", "Ready")
  Ring      small circular progress with the number inside; sizes 32, 48
  a11y      role=meter with aria-valuenow/min/max and aria-valuetext "54 out of 100, needs work"
  used on   S11 card, S19 bottom bar, S25
```

```
KeywordList
  rows      matched (success check), missing (empty circle), dismissed (struck, text-muted)
  card      one-at-a-time question: keyword chip + "Add a bullet" (primary) / "Not relevant"
            (secondary); after generating: role picker Select + Accept / Rewrite / Skip
  a11y      list with counts in the heading ("Matched 4 of 9"); status in text
  used on   S24, S26
```

```
Badge
  variants  neutral (surface-muted / text), new (success-soft / success), pro (accent-soft / text),
            warning, danger, ai
  tokens    text xs/600, radius pill, padding 2×8
  used on   S11 sidebar, S17 savings, S23, S28
```

```
Dialog, Sheet and ConfirmDialog
  Dialog    centred, max-width 560, radius lg, shadow modal, scrim 60% opacity
  Sheet     side (right, 480 wide) on desktop, bottom on mobile; used for score report,
            adjustments, templates, download
  Confirm   destructive confirm: names the thing ("Delete 'Alex Morgan – Designer'?"),
            danger button, default focus on Cancel
  a11y      Radix Dialog: focus trapped, Esc closes, focus returns to the trigger,
            title is aria-labelledby; no auto-opening sales dialogs over work in progress
  used on   S12, S17, S25-S29, deletes
```

```
DropdownMenu
  items     icon + label, destructive item in danger, separators, submenu (›)
  a11y      Radix DropdownMenu: arrows, type-ahead, Esc, submenus with →
  used on   S13 account menu, entry ⋯ menu, S23 optional sections
```

```
Toast
  variants  success ("Saved"), error (with Retry), info
  placement bottom centre, stacks up to 3, 4s (errors stay until dismissed)
  a11y      Radix Toast in a polite region; errors use assertive
  used on   editor autosave, exports, billing
```

```
Tooltip
  for       icon-only buttons, disabled reasons, truncated names
  a11y      Radix Tooltip, opens on hover and focus, never holds the only copy of key info
```

```
SidebarNav and Rail
  Sidebar   264 wide: brand slot, primary "New resume" button, nav items (icon + label,
            active = surface-muted + text), usage meter pinned to the bottom
  Rail      64 wide icon-only version in the editor, tooltips on hover/focus
  Mobile    below lg: top bar with menu button opening the sidebar as a left Sheet
  a11y      <nav aria-label="Main">, aria-current="page" on the active item
  used on   S11, S14, S18-S29
```

```
UsageMeter
  rows      label + "1 of 1" + thin progress bar (accent, danger when at the limit)
  a11y      progress with aria-valuetext "1 of 1 resumes used"
  used on   S11 sidebar
```

```
Banner
  variants  info, warning, promo (dismissible, remembers dismissal), offline
  rule      never covers content; no countdown timers
  used on   app top
```

```
Stepper (number input)
  parts     − value + ; min/max; holds on press repeat
  a11y      role=spinbutton semantics via <input type=number> with labelled buttons
  used on   S27 font size, spacing
```

```
TemplateCard
  parts     preview of **the user's own resume** in that template (Rezi shows a sample person),
            name, badges (Current, Pro), favourite toggle
  states    loading (Skeleton), selected (2px accent border), locked
  used on   S04, S28
```

```
EmptyState and Skeleton
  Empty     icon, one-line title, one helpful sentence, one primary action
  Skeleton  surface-muted blocks with a slow shimmer (off under reduced motion)
  used on   S11 no resumes, S31-S32, every list while loading
```

```
Avatar
  initials on accent-soft, sizes 32/40; image when the user has one
  used on   S11 header, S13
```

---

## Built and checked (2026-10-05)

Code: `src/components/ui/` (button, badge, field, select, toggles, tabs,
overlays, score, layout, editor), shown on `/design`
(`src/app/design/design-system.tsx`). Run `npm run dev` and open
http://localhost:3000/design.

Tokens: `replica/design/tokens.json` → `npm run tokens` regenerates
`src/styles/tokens.css` + `tailwind-theme.css` and runs the contrast check.
Tailwind's own palette is switched off, so only role colours exist.

Checks run on `/design`:
- WCAG contrast: 59 token pairs, 0 failing AA (light and dark).
- axe-core 4.10: 0 violations in light and in dark, and 0 inside the open
  dialog, sheet and confirm dialog.
- Keyboard: dialogs trap focus, close on Escape and return focus to the opener
  (also for the code-opened confirm); entry cards reorder with Space + arrows
  and announce the new position; the country combobox filters, moves with
  arrows and picks with Enter.
- 375px wide: no horizontal page overflow; switches and checkboxes have a 40px
  hit area.
- `tsc`, ESLint and `next build` pass.

Screenshots: `design-page-light.png`, `design-page-dark.png` (1280 wide).

Not built yet, on purpose: mouse drag-and-drop for entries (dnd-kit in
`/replica-build`), the score histogram (needs real users), rich-text bullets
(rows are plain textareas; issues and placeholders show under the row).
