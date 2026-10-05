# Recon map: Rezi (web)

Scope: the core loop of an AI resume builder. Create or import a resume, edit it
section by section with AI writing help and live feedback, tailor it to a job
description, check a resume score, choose a template, and export. Free and Pro
billing limits included. Cover letters, the AI chat agent, job search, interview
practice, paid human review, mobile and enterprise are phase 2 (rows in
`features.csv`, marked should or could).
For: a product to sell (assumed, change if wrong)
Date: 2026-10-05 (app version shown in the footer: 4.6.1)

Method, in two passes:
1. **Public pages**: marketing site, 15 help docs, pricing, changelog, terms,
   free tools.
2. **The user's own free account**, driven by hand in the browser at human
   speed. One test resume was created with made-up details ("Alex Morgan",
   Product Designer, a made-up company and job ad). 2 of the 10 free AI
   generations were used. Nothing was bought, downloaded or shared. The
   hiring-partner sharing question was answered "Not now".

The editor was seen at a ~800px window width, which shows Rezi's tablet layout
(hamburger menu, bottom action bar). The desktop layout (fixed left sidebar)
comes from the user's screenshots A01-A05. The desktop editor, with the preview
beside the form, was **not** seen. See "Gaps".

Terms note: Rezi's Terms of Use forbid copying source materials and decompiling
or reverse-engineering the software. Nothing here does either: no code, bundles
or network calls were read or saved. The terms have no clause against building
a competing product. Their copy, template designs, sample resumes and brand
stay theirs.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | **the user's own account** | https://app.rezi.ai | driven end to end, 2026-10-05 |
| 2 | help center index | https://www.rezi.ai/rezi-docs | 55 guides |
| 3 | create resume | https://www.rezi.ai/rezi-docs/create-resume | 4 ways to start |
| 4 | Rezi Score | https://www.rezi.ai/rezi-docs/the-rezi-score-explained | 1-100, 5 categories, bands |
| 5 | real-time analysis | https://www.rezi.ai/rezi-docs/real-time-content-analysis-explained | "23 checkpoints" |
| 6 | keyword targeting | https://www.rezi.ai/rezi-docs/ai-keyword-targeting-explained | generate a bullet per keyword |
| 7 | finish up tab | https://www.rezi.ai/rezi-docs/the-finish-up-tab | preview, templates, adjustments |
| 8 | AI bullet points | https://www.rezi.ai/rezi-docs/ai-bullet-points | standard vs quantified |
| 9 | AI resume agent | https://www.rezi.ai/rezi-docs/ai-resume-agent | chat, 3 starter prompts |
| 10 | download | https://www.rezi.ai/rezi-docs/download-resume | PDF, DOCX, Google Drive |
| 11 | subscription plans | https://www.rezi.ai/rezi-docs/rezi-subscription-plans-explained | plan limits, Stripe |
| 12 | experience level | https://www.rezi.ai/rezi-docs/how-to-set-resume-experience-level | level definitions |
| 13 | skills explorer | https://www.rezi.ai/rezi-docs/ai-skills-explorer | category + description → skills |
| 14 | job search | https://www.rezi.ai/rezi-docs/job-search | filters, tracker stages |
| 15 | cover letter | https://www.rezi.ai/rezi-docs/ai-cover-letter-generator-explained | linked to a resume |
| 16 | AI interview: pace | https://www.rezi.ai/rezi-docs/ai-interview-practice-pace | 5 speech metrics |
| 17 | pricing | https://www.rezi.ai/pricing | full comparison table |
| 18 | changelog | https://www.rezi.ai/rezi-changelog | Jul-Sep 2026 |
| 19 | terms | https://www.rezi.ai/legal | no reverse engineering |
| 20 | marketing home | https://www.rezi.ai/ | Build / Score / Target |
| 21 | free ATS checker | https://www.rezi.ai/tools/resume-checker | lead magnet |

Reference screenshots:
- `replica/screens/app/` A01-A05: sign up, onboarding question, offer popup,
  empty dashboard, create-resume form (desktop, from the user).
- `replica/screens/` P01-P05: public pages at 1440x900.

## Core loop

A job seeker turns their experience into an ATS-friendly resume tailored to a
specific job ad, watches a 0-100 score climb, and exports a PDF. Users pay when
they want a second resume, more than 3 downloads, DOCX, more than 10 AI
generations, the locked feedback checks, the hidden keywords, Pro templates or
Pro sections.

Positioning, in their words: **Build → Score → Target**.

## Screens

All rows were observed in the app unless marked † (from docs only).

### Public and auth

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing | `/` (www) | convert | mega-menu nav, hero + upload, stats, Build/Score/Target tabs, template carousel, tools grid, pricing, FAQ | filled |
| S02 | Pricing | `/pricing` (www) | plan choice | Free / Pro $29 / Enterprise $99 per 200 users + Lifetime $149, comparison table | filled |
| S03 | Free ATS checker | `/tools/resume-checker` (www) | lead magnet, no account | dropzone (PDF/DOCX ≤5MB), JD box, Scan | empty |
| S04 | Template gallery | `/resume-templates` (www) | SEO, pick before sign-up | Simple / Modern / Creative / Compact filter | filled |
| S05 | Sign up | `app/signup` | create account | **split layout**: form left (Google, Apple, OR, email, password, Sign Up), product mock right; dark | filled (A01) |
| S06 | Log in | `app/login` | sign in | centred card: Google, Apple, email, password, Forgot password, Sign In, terms line | filled |

### First session

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S07 | Onboarding Q1 | `?onboarding=intent` | segment the user | "What is your biggest challenge today?": create quickly / not confident / better design / don't know which jobs; "Close and go to dashboard" | seen (A02) |
| S08 | Onboarding Q2 | `?onboarding=intent-jobsearch` | job-search stage | "Have you already found jobs you want to apply for?": one specific job / many jobs / still looking / not applying yet; Return link | seen |
| S09 | Onboarding Q3 | `?onboarding=intent-jobsearch-hiring` | opt-in to recruiters | "Get matched with our hiring partners?": Share my resumes / Not now; privacy note "details stay private until you approve a match" | seen |
| S10 | Discount offer | `?onboarding=...-promotion` | convert on day 1 | "You've Unlocked 55% OFF Rezi Pro", personal coupon code, **3-hour countdown**, Claim button, X; then a **sticky top banner** with the same countdown on every page | seen (A03) |

### Dashboard and account

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S11 | Dashboard | `/dashboard/resumes` | manage documents | **sidebar**: Create New Resume, My Dashboard, AI Resume Agent (NEW), AI Interview (NEW), Job Search, Sample Library, Review My Resume, Swipe for Mobile (NEW), Get Extension, Try MCP (PRO), **usage box** (Resumes 0/1, AI Generations 0/10, Upgrade). **Top**: doc-type tabs Resumes / Cover Letters / Resignation Letters, Upgrade, bell, avatar. **Body**: 3 promo cards, Resumes panel with sort (Created), grid/list toggle, dashed "Click to create new resume or drop a resume here" card, **Add Section** (user folders) | empty (A04), tablet layout |
| S12 | Create resume form | modal from S11 | start a resume | Resume name* (placeholder "First Last Name - Job Title"), Experience select (Internship, Entry, Associate, Junior, Mid-Senior, Director, Executive). **After a level is picked**: collapsible Import existing resume (PDF/DOCX + LinkedIn extension hint) and Language. "Target your resume" switch (off by default) → Job title, Company name, Job description. Footer: Cancel / Use AI Resume Agent / **Create Resume** | filled (A05 + driven) |
| S13 | Account menu | avatar | account shortcuts | email, "Free Plan · Upgrade", Account, Suggest Feature, User Guides, Theme ›, Log out | seen |
| S14 | Account settings | `/dashboard/profile/account` | settings | tabs Account / Notifications / Matching / Billing. Account: app language, Partner Affiliate Code + Apply, Request email change (shows "Signed in with google.com"), Manage Billing (Stripe portal), Delete Account (red) | seen |
| S15 | Notification settings | `/dashboard/profile/notifications` | preferences | toggles: job offers, in-app, emails, community updates, news and special offers | seen |
| S16 | Matching preferences | `/dashboard/profile/matching` | job-match profile | roles (11 families), work mode (onsite / hybrid / remote), location, min pay ($100k+ … $200k+), experience, job-search status (active / passive / not looking) | seen |
| S17 | Upgrade modal | sidebar Upgrade | sell Pro | benefits list; **prices in local currency** with a currency switcher (₹ INR seen); Monthly (save 30%), Quarterly (save 55%, cheapest per month), Lifetime one-off; Continue → Stripe; "Recruiter, educator, or career coach? Check out Rezi Enterprise" | seen |

### Editor

Route pattern: `/dashboard/resume/:id/:tab`. The top bar holds a **resume
switcher** dropdown (resume name) and section tabs: Contact, Experience,
Education, Skills, Summary, **…** (more sections), Finish Up & Preview, AI
Cover Letter. On the tablet layout a bottom bar shows the live **Rezi score**
gauge, **Add new** and **Sort**. A live preview of the whole resume is in the
DOM next to the form (shown side by side on desktop, not seen). Every edit
autosaves ("Changes saved" toast), and a **Version History (beta)** list keeps
timestamped snapshots.

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S18 | Contact | `/contact` | identity | Full name, Email, Phone, LinkedIn URL (fixed `linkedin.com/in/` prefix), Personal website, Country and State (searchable selects, each with a "Show on resume" switch), Save Basic Info | empty, filled, saved |
| S19 | Experience | `/experience` | jobs + bullets | collapsible entry card (title = role, subtitle = company and dates, ⋯ menu, drag handle). **Labels personalise** as you type ("Where was Brightline Studio located?"). Role, Company* ("Is this correct? Confirm for better AI results"), date range (month grid with year arrows, future months disabled, end date has a "Currently work here" switch → "Present"), Location, bullet editor with tip "Aim for a balanced mix of descriptive and key number bullet points", **AI button** with credit counter (states: "AI writer not ready" → "Suggest bullet" → "Complete bullet" ▾ "Complete bullet with key numbers" → "Apply suggestion" / "AI writer generate"), Save to Experience List, **Improvements** panel | empty, filled, AI suggestion shown, saved |
| S20 | Education | `/education` | degree | Degree and major*, Institution, Location, Year, Minor, GPA, open field for extra info | empty |
| S21 | Skills | `/skills` | skills | one box per group, format "Category: skill, skill", AI Skills Explorer button, Save to Skills List | empty, filled |
| S22 | Summary | `/summary` | summary | textarea, "from resume" switch, Save Summary Info; **AI Summary Writer** card with Position highlight* and Skills highlight* (pre-filled from the resume), Generate | empty, filled |
| S23 | More sections menu | "…" tab | add optional sections | checkboxes: Project, Certifications, Coursework, Involvement; **Academic ›** Awards & Honors (PRO), Publications (PRO); **Other ›** References (PRO), Military Service (PRO), Agents (PRO) | seen |
| S24 | Finish Up & Preview | `/finish-up` | review and export | paged preview (matched keywords highlighted in teal), **AI Keyword Targeting** panel, bottom bar: Rezi score / Adjustments / Template / Download | filled |
| S25 | Score report | sheet from S24 | explain the score | gauge 0-100 (red / orange / green, label "Needs improvement"), **How You Compare** histogram with your bar marked, **Improvements** with 5 category tabs each scored (Content, Format, Optimization, Best Practices, Application Ready); each issue has a severity icon, an explanation, and a link to the entry (e.g. "UX Designer"); Pro checks locked | seen, all 5 tabs |
| S26 | Keyword Targeting | panel in S24 | match the JD | matched list with green ticks; missing list; **6 more missing keywords shown as scrambled text with a PRO tag**; a one-at-a-time card "Is this missing keyword relevant to your experience? [keyword] Yes – add bullet point / No"; after Yes: target role picker, Accept and Next / Rewrite Bullet / Skip; Update Job Description | seen, used once |
| S27 | Adjustments | sheet from S24 | formatting | Auto-adjust, Icons, Profile picture, Font (Merriweather, Source Sans Pro, Calibri, Times New Roman, …), Font size (− 9 +), Sections spacing, Section divider, Indent, Text color, Accent color, View as pages | seen |
| S28 | Template picker | full-screen sheet from S24 | change design | filter: All, Saved, Recent, Recommended (8), by format Simple / Modern / Creative / Compact; cards preview a **sample person's** resume, not yours; badges CURRENT / PRO, Preview; lazy-loaded (Rezi Standard, Rezi Compact PRO, Rezi Modern PRO first) | seen |
| S29 | Download | sheet from S24 | export | Download PDF, Download .DOCX, Save to Drive, "Downloads left: 3" | seen (not used) |

### Phase 2 areas (landing states only)

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S30 | AI Resume Agent | `/dashboard/agent/new` | chat | New Chat, Recent Chats, prompt "How can AI Resume Agent help…?", starters: Improve my Rezi score / Target my resume / Find a job that matches my profile | empty |
| S31 | Job search | `/dashboard/job-search` | find jobs | tabs All / Saved / Matched / Applied / Interviewing / Rejected (counts), Filter, sort Best Match; results **pre-filled from the resume title, location from the visitor's country, not the resume**; each card: Target Resume, Add to Saved, Change status | filled |
| S32 | AI interview | `/dashboard/video-interviews` | mock interviews | tabs Recent / Recommended, New AI Interview, empty state "No recent interviews yet" | empty |
| S33 | Sample library | `/dashboard/samples/library` | example resumes | All / Saved, categories: Pro, Business, Programming, Engineering, Marketing, Design, Student, Medical, Finance, Education, Legal, Other | filled |
| S34 | Human review order | `/dashboard/review/new` | paid review | tabs Review Options / My Reviews; resume select; turnaround priced **per word** (12 hours $22.54 at $0.23/word "Fastest", 1 day $18.62, 2 days $14.70, "See all (3)"); notes for reviewer; "Preserve resume formatting"; Continue; FAQ | filled |
| S35 | Cover letter editor † | editor tab "AI Cover Letter" | cover letters | Contact / Content tabs, linked resume, AI write | not opened |
| S36 | Import resume † | S12 upload | parse a file | PDF/DOCX upload → draft | not tried (needs a file) |

## Flows

```
F01 New user builds a first resume and exports it          (observed, except the final download)
    S05 -> S07 -> S08 -> S09 -> S10 (close) -> S11 -> S12 -> S18 -> S19 -> S21 -> S22 -> S24 -> S29
    clicks: onboarding 4 (3 answers + close offer), create form ~4 (open, level, target switch,
            Create), contact 3 (2 selects + save), one job ~6 (dates 4, save 1, tab 1),
            skills 2, summary 2, finish 1, download 2  ->  ~24 clicks plus typing for a
            one-job resume. Number to beat.
    edge: onboarding answer buttons ignore clicks at some window sizes (seen); unknown
          editor route loops (seen); AI summary needs a field hidden behind a button at
          ~800px (seen); quota of 3 downloads

F02 Import an existing resume                               (not tried)
    S11 drop file on dashboard, or S12 import -> draft -> fix in S18..S22

F03 Tailor a resume to a job                                (observed)
    S12 target switch + JD -> edit -> S24 keyword card -> Yes -> pick role -> Accept and Next
    -> keyword moves to matched, score 54 -> 59, next keyword offered
    clicks: 2 per keyword
    edge: Free shows 2 of 8 missing keywords; the rest are scrambled behind PRO;
          **the generated bullet invented facts** ("over 18 months", "three mobile product
          teams", "40% reduction in rework") that the user never entered

F04 Raise the score                                         (observed)
    S19 Improvements panel (live, per entry) or S25 report -> click entry link -> fix
    score went 26 -> 33 -> 37 -> 44 -> 49 -> 54 -> 59 as sections were filled
    edge: Optimization showed 100 / "Looks great!" while 6 keywords were still missing

F05 Change the look                                         (observed, no changes made)
    S24 -> S28 pick (Pro locked) -> S27 font, size, spacing, colours, Auto-adjust

F06 Upgrade                                                 (observed up to Continue)
    S10 offer, sticky banner, sidebar Upgrade, PRO locks everywhere -> S17 -> Stripe

F07 Anonymous ATS check (lead magnet)                       (public page only)
    S03 upload + JD -> report -> sign up

F08 Manage resumes                                          (partly seen)
    S11 sort, grid/list, folders via Add Section, ⋯ menu per card (rename, duplicate, delete †)

F09 Cancel or change billing                                (seen up to the button)
    S14 Manage Billing -> Stripe Customer Portal

F10 Order a human review                                    (seen up to Continue)
    S34 pick resume, turnaround, notes -> Continue -> payment
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary (lavender filled, uppercase), secondary (outline), danger (red outline), ghost link, split button with ▾ | default, hover, disabled ("AI writer not ready"), loading | all |
| App sidebar | full (desktop), drawer (tablet) | active item, NEW / PRO badges | dashboard, editor |
| Usage meter | resumes x/y, AI generations x/y | free, near limit | sidebar |
| Countdown banner | sticky top, dismissible | ticking | all app pages |
| Modal / sheet | centred modal, bottom sheet (tablet), full-screen sheet | open, closed | S10, S12, S17, S25-S29 |
| Onboarding question card | single choice list + Return + Close | default, selected | S07-S09 |
| Segmented tabs | doc types, settings, section tabs | active | S11, S14, editor |
| Text input | with uppercase label, personalised label, fixed prefix (LinkedIn) | empty, focus (lavender ring), filled, invalid ("Please fill out this field") | forms |
| Searchable select | country, state, experience, font | open, filtered | S12, S18, S27 |
| Month-year picker | start, end with "Currently work here" switch | future months disabled | S19 |
| Switch | target resume, show on resume, from resume, view as pages | on, off | many |
| Entry card | collapsible, ⋯ menu, drag handle | collapsed, open | S19-S21 |
| Bullet editor | rich text, auto "•", inline red underline on issues, inline AI suggestion in accent colour | typing, flagged, suggestion | S19 |
| AI button | with credit counter, mode dropdown | not ready, ready, generating, apply | S19, S22, S26 |
| Improvement item | error (red ✕), warning (amber !), locked (🔒 PRO), passed ("N best practices applied", expandable) | collapsed, expanded | S19, S25 |
| Score gauge | small ring (bottom bar), large semicircle | red < ~50, amber, green | editor, S25 |
| Category score ring | 5 small rings | per score colour | S25 |
| Histogram | your bar highlighted | — | S25 |
| Keyword row | matched (green tick), missing (empty dot), locked (scrambled text + PRO) | — | S26 |
| Template card | preview with sample data, CURRENT / PRO badge, Preview | loading skeleton | S28 |
| Stepper (number) | − value + | — | S27 |
| Toast | "Changes saved" | auto-dismiss | editor |
| Plan option card | radio, strike-through price, SAVE % pill | selected | S17 |
| Chat launcher | Intercom bubble bottom right | — | all app |

## Inferred data model

```
User          id, email, auth_provider (google | apple | password), app_language, theme,
              plan (free | pro | lifetime), affiliate_code, onboarding (intent,
              job_search_stage, hiring_opt_in), created_at
              evidence: S13, S14, S07-S09         confidence: high

Subscription  id, user_id, stripe_customer_id, interval (month | quarter | lifetime),
              currency, coupon, status, current_period_end
              evidence: S17 (INR, 3 intervals), S10 coupon, S14 Stripe portal
              confidence: high

Usage         user_id, resumes_used, resumes_limit (1), ai_generations_used,
              ai_generations_limit (10), downloads_left (3)
              evidence: sidebar meter, S19 counter 10 -> 9, S29 "Downloads left: 3"
              confidence: high (whether AI credits reset monthly: unknown)

Promotion     user_id, coupon_code, discount_pct (55), expires_at (signup + 3h)
              evidence: S10 + banner                 confidence: high

Folder        id, user_id, name, collapsed, position
              evidence: "Add Section" + "KEEP" group in A01      confidence: medium

Resume        id, user_id, folder_id, name, experience_level (7), language, template_id,
              settings json (font, font_size, section_spacing, divider, indent, icons,
              photo, text_color, accent_color, view_as_pages),
              enabled_sections[], created_at, updated_at
              evidence: S12, S23, S27, sort by Created       confidence: high

TargetJob     resume_id, title, company, description, keywords json
              (term, status matched | missing | dismissed, locked)
              evidence: S12, S26 (No / Skip remembered, next keyword offered)
              confidence: high

Contact       resume_id, full_name, email, phone, linkedin_handle, website,
              country, show_country, state, show_state
              evidence: S18                          confidence: high

Entry         id, resume_id, section_type (experience | education | skills | project |
              certification | coursework | involvement | awards | publications |
              references | military | agents), position, fields json, bullets text[],
              company_confirmed bool
              evidence: S19-S23, drag handle, "Confirm for better AI results"
              confidence: high (one table vs per-section tables is a guess)

Summary       resume_id, text, from_resume bool      evidence: S22    confidence: high

ResumeVersion id, resume_id, snapshot json, created_at
              evidence: "Version History beta" list with timestamps     confidence: medium

ScoreReport   computed, likely not stored: total, per-category scores, checks[]
              (id, category, severity error | warning | pass, locked_pro, entry_id, message)
              evidence: S19 panel, S25                confidence: medium

Phase 2: CoverLetter, ResignationLetter, AgentChat, Job + JobApplication (status saved |
matched | applied | interviewing | rejected), MatchingPreferences (S16), Interview,
ReviewOrder (resume_id, turnaround, word_count, price, notes, preserve_format, status)
```

Relationships: User 1-1 Subscription, User 1-1 Usage, User 1-n Folder,
Folder 1-n Resume, Resume 1-0..1 TargetJob, Resume 1-1 Contact, Resume 1-n
Entry, Resume 1-1 Summary, Resume 1-n ResumeVersion.

## The scoring rules (observed)

Shown live per experience entry in the Improvements panel, and summed into 5
categories on the report. Wording here is ours, not theirs.

| check | category | severity seen | free? | rule as shown |
| --- | --- | --- | --- | --- |
| Punctuated bullet points | Content | error | yes | capital first letter, ends with a period; names the bullet |
| Weak bullet points | Content | error / warning | yes | weak verb such as "was"; suggests an action verb |
| Personal pronouns | Content | — | **PRO** | "I", "my" … |
| Buzzwords | Content | — | **PRO** | |
| Passive voice | Content | — | **PRO** | |
| Filler words | Content | — | **PRO** | |
| Wordy content | Content | — | **PRO** | |
| Number of bullet points | Content / Format | warning / error | yes | 3-6 per experience |
| Quantified bullet points | Content | warning | yes | a metric in each bullet where possible |
| Page length | Format | error | yes | flagged at 0.33 page; one full page expected |
| Word count | Best Practices | warning | yes | 400-800 words |
| Keyword match | Optimization | — | yes | showed 100 with keywords still missing |
| Application ready | Application Ready | warning | yes | "not ready", upsells the human review |

Observed category scores on the test resume: Content 50, Format 42,
Optimization 100, Best Practices 85, Application Ready 54, total 54.

## What we saw that a clone can beat

Put these in front of `/replica-entrepreneur`, which checks them against real
user reviews.

1. **The AI invents facts.** The keyword bullet claimed "18 months", "three
   teams" and "a 40% reduction" for a job started 19 months before and with no
   numbers given. A resume with made-up metrics is risky for the user.
   Clone: ask for the real number, or leave a visible `[X%]` placeholder.
2. **"Complete bullet" kept the weak verb.** It finished "I was responsible
   for…" but left the pronoun and "was" that its own checker flags.
3. **The score contradicts itself.** Optimization said 100 / "Looks great!"
   while 6 job keywords were still missing.
4. **Paywalls are everywhere at once.** A 3-hour countdown banner on every
   page, 5 locked feedback checks, scrambled locked keywords, 5 locked
   sections, 1 resume, 3 downloads, 10 AI uses.
5. **Responsive bugs at ~800px**: answer buttons ignored clicks at one size,
   the page slid sideways after an AI suggestion, and the AI Summary's
   required field was hidden behind the Save button, so it couldn't run.
6. **An unknown editor route loops**, appending `/contact` endlessly.
7. **Job search ignores the resume's location** (New York) and uses the
   visitor's country.
8. **Template previews show a sample person**, not your resume.
9. **Contact location switches are on but the location doesn't show** in the
   default template header (seen once, could be the template).

## Feature matrix

See `features.csv`. Must: 27, should: 22, could: 17, skip: 7.

## Out of scope (cannot or should not be cloned)

- **Their job database** ("+2M jobs from career pages"). Needs our own feed
  or a licensed API.
- **LinkedIn import through a Chrome extension** that reads profile pages.
  LinkedIn's terms forbid scraping. Import LinkedIn's own PDF export instead.
- **Auto-apply on Greenhouse and Lever** (from the changelog).
- **Their proof**: "4.5M users", "62% interview rate", Forbes, testimonials.
- **Their content**: template designs, the sample library, example resumes,
  help docs, placeholder copy (including their founder as the placeholder
  person).
- **Human review service** as software. It needs paid reviewers.
- **Hiring-partner matching** (S09, S16). It is a two-sided marketplace, not a
  feature.
- **Partner deals**: enterprise commission, ChatGPT / Claude / Codex apps, MCP.

## Size

Screens 36 (S01-S36; 29 in the core slice), flows 10, entities 13 core + 7
phase 2.

Hard parts:
1. **PDF and DOCX output** that matches the preview, with a real text layer,
   page breaks, "view as pages" and Auto-adjust.
2. **The live scoring engine**: about 13 visible checks plus hidden ones, run
   on every keystroke, per entry and per category, kept consistent with keyword
   matching (Rezi's isn't).
3. **AI writing that doesn't make things up**: completion, quantified
   variants, summary, keyword bullets, with credit metering.
4. **Resume import** (PDF / DOCX → structured entries).
5. Version history and autosave without losing edits.

Size: core slice **M** (a few weeks). The whole product is **L to XL**.

## Gaps

- ~~The desktop editor layout~~ Seen during `/replica-design` at 1440px: a
  70px icon rail replaces the sidebar; a 308px left column holds a preview
  thumbnail, the score card ("Your Rezi Score") and the entry list with each
  entry's checks under it, plus a "Sort by date" switch; the form card (910px,
  padding 24, radius 8) is on the right. The dashboard sidebar is 280px.
- Import from a file (needs a sample PDF from you).
- Whether the 10 AI generations reset monthly, and what happens at 0.
- What a free user sees on DOCX, Drive and a 4th download (not clicked; it would
  download a file).
- The AI Skills Explorer (the button didn't open at this width) and the cover
  letter editor.
