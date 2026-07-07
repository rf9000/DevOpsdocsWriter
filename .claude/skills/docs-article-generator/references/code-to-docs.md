# Code → Docs Mapping

How to turn an AL code change into a complete, user-facing documentation article. This file is
the generator's *delta* — it does not repeat house style (that lives in
`../docs-writer/references/style-guide.md`, the authoritative base, plus
`../docs-writer/references/style-guide-supplement.md` for docs-site mechanics and templates).

## Table of contents
- [1. Reconstruct the complete feature flow (LSP-first)](#1-reconstruct-the-complete-feature-flow-lsp-first)
- [2. Map AL symbols to user-facing text](#2-map-al-symbols-to-user-facing-text)
- [3. Change magnitude → output depth (proportionality)](#3-change-magnitude--output-depth-proportionality)
- [4. Impact brief — the seven questions](#4-impact-brief--the-seven-questions)
- [5. Change-type → article-type heuristics](#5-change-type--article-type-heuristics)
- [6. Decide the output: new article, delta update, or changelog](#6-decide-the-output-new-article-delta-update-or-changelog)
- [7. File placement and toc.txt](#7-file-placement-and-toctxt)

---

## 1. Reconstruct the complete feature flow (LSP-first)

The diff is only the entry point. Document the *whole feature* as a user experiences it. Drive
the investigation with LSP, not text search (text search is the fallback). The user explicitly
wants LSP used to find references and navigate the code flow.

Starting from each changed object/procedure/field:

| Goal | LSP operation |
|------|---------------|
| Find every place the changed symbol is used | `findReferences` |
| Trace who triggers it (entry points, UI actions) | `incomingCalls` (chain upward) |
| Trace what it does downstream | `outgoingCalls` (chain to the leaves) |
| Follow into related objects | `goToDefinition` |
| Read object IDs, fields, actions, enum values | `documentSymbol` |
| Read captions, field types, procedure signatures | `hover` |

Workflow:
1. `documentSymbol` on each changed file to see structure and object IDs.
2. `findReferences` on the changed table fields / procedures / page controls to find the pages
   and codeunits that surface them to the user.
3. `incomingCalls` upward until you reach a page action, wizard step, or job-queue entry — that
   is the user's entry point and where the article's procedure starts.
4. `outgoingCalls` / `goToDefinition` to follow the flow to its effects (statuses set, files
   produced, records updated) — that is the article's "expected result".
5. Combine with the investigation skills for domain context:
   `setup-files-investigate` (bank/payment-method/feature config),
   `bank-communication-operations`, `assisted-setup-wizard`, `swagger-api-reader`.
   Use `Serena` when LSP returns nothing (missing symbols/deps).

Goal: a complete journey — prerequisites → setup page(s) and fields → the action(s) the user
takes → what happens → related features — so the article is complete, not diff-shaped.

## 2. Map AL symbols to user-facing text

Documentation never names AL objects/fields by their object name — it uses the **Caption** the
user sees. Read captions via `hover` / `documentSymbol`.

| AL symbol | Docs rendering | Style rule |
|-----------|----------------|------------|
| Page `Caption` | The page name | **bold**: `**Banking Export Setup**` |
| Field `Caption` | The field name | **bold**: `**Default Template Name**` |
| Action `Caption` | Button / menu action | **bold**: `**Send Approval Request**` |
| Action groups → action | Navigation breadcrumb | `**Related** > **Communication Setup**` |
| Enum value `Caption` | Status / state value | *italic*: `*Valid*`, `*Pending Approval*` |
| FastTab (`group` caption) | FastTab name | **bold**: `**Direct Debit** FastTab` |

Rules:
- Use the caption text, never the AL identifier (`"CTS-CB ..."`, field numbers, enum ordinals).
- If a field has no caption, it inherits its name — but confirm what actually shows in the UI.
- Field descriptions in procedures come from the field's purpose (Tooltip/ToolTip if present),
  written as `* **Field Name** - [what to enter and why].`
- Page-open steps use the page caption: `Search ({{search}}) for and select **[Caption]**.`

## 3. Change magnitude → output depth (proportionality)

The size of the *output* must match the size of the *change*. A two-field addition does not earn
a full multi-section How-to with a priority-hierarchy explainer, reference tables, and several
hints — padding a small change into a big article produces text that "sounds fine without really
saying much." Before choosing the article type, assess the change **magnitude** and let it cap
the depth.

| Magnitude | What it looks like | Default output | Depth budget |
|-----------|--------------------|----------------|--------------|
| **Minor tweak** | A couple of new fields, a new toggle/option, a renamed action, a small behavior change on an existing page | **Prefer a delta update** to the existing article (see §6). If a new article is genuinely warranted (no existing home), keep it to **one tight section** — intro + a single `## To ...` procedure. | 1 procedure, ≤1 hint, no explainer/hierarchy sections, no reference tables unless the field list itself needs one |
| **Workflow improvement** | A changed or extended user workflow on an already-documented feature (new step, new branch, new action that changes how the task is done) | Delta update if it extends a documented flow; otherwise a focused article centered on the changed flow | The changed flow only — do not re-document the whole surrounding feature |
| **New feature / module** | A genuinely new capability, setup page, wizard, or module area with no existing article | Full article (today's default), optionally split into Conceptual + How-to per §5 | Full structure as the feature warrants |
| **Technical addition** | Dev-facing change with no user-visible UI (API, event, refactor) | Changelog entry or a short developer note — not a user article | Minimal; see §6 `changelog` |

Rule of thumb: **the number of sections should track the number of things the user actually has
to understand or do.** When in doubt, write less and flag the gap (§4) rather than inventing
scaffolding to fill an article.

## 4. Impact brief — the seven questions

The AL code tells you **what** the feature does and **where** it appears. It does **not** tell you
**why** it matters or **when** it is useful — that lives in the developer's head, the work item,
and the PR. Before drafting, answer these seven questions from the work item description,
comments, linked PRs, and the code:

1. **What type of change is this?** (new functionality / workflow improvement / minor tweak /
   technical addition) — this drives the magnitude call in §3.
2. **What problem does this solve?**
3. **What can the user do now that they could not before?**
4. **When will the user notice this change?** (a concrete scenario)
5. **What did the system do before vs. now?**
6. **Where does this appear in the UI?** (page/field/action captions — from the code)
7. **Is this something users need to configure?**

How to use the answers:

- **Confirmed answers feed the work.** Q1 sets the magnitude; Q6 comes from the captions you
  mapped in §2; Q2/Q3/Q4/Q5/Q7, *where sourced from the work item or PR*, frame the article's
  intro (problem first, then capability) and decide whether a configuration procedure is needed.
- **Do not invent impact.** If an answer is not grounded in the work item, comments, PR, or code,
  **do not manufacture a plausible "why."** Leave it out of the article and surface it as a gap
  in the work-item comment under **Context needed from author/SME** (the unattended prompt
  defines this block). Unknown impact is a question for a human, never filler.
- A *minor* magnitude with weak Q2–Q5 answers is a strong signal for a delta update or a very
  short article — not a padded one.

## 5. Change-type → article-type heuristics

| Code change | Likely article type | Notes |
|-------------|---------------------|-------|
| New setup page / new fields on a setup page | **Setup/How-to** | "Setting up [feature]..." with `## To configure` |
| New wizard / NavigatePage | **Setup/How-to** | Walk the wizard steps; pair with `assisted-setup-wizard` |
| New feature concept / new module area | **Conceptual** | "[Feature] in [Solution name]" — what/why/how |
| New bank auth codeunit / bank enablement | **Bank onboarding** | Requirements + credential table + `## To establish...` |
| New enum statuses / state machine change | Update **Conceptual** status table | Render values *italic* |
| New action on an existing page | Update the existing How-to article | Usually an edit, not a new file |
| Pure bug fix, no user-visible change | **Changelog entry** | See section 6 — do not invent an article |

A substantial feature often needs a Conceptual article *and* one or more Setup/How-to articles
linked from an Overview. Prefer splitting over a single mixed page.

## 6. Decide the output: new article, delta update, or changelog

Before drafting, classify the change honestly. The output is exactly one of three kinds —
`newfeature`, `update`, or `changelog`:

- **`newfeature`** — a doc-worthy feature/behavior (new capability, new setup, changed user
  workflow) with **no existing article**, an **uncertain** match, or a genuinely new sub-topic →
  draft a complete new article (the default). Take the next unused `<PREFIX>-###`. Scale its depth to
  the magnitude (§3): a *minor* change that still has no existing home is a one-section article,
  not a full multi-section build-up.
- **`update`** — an enhancement to an **already-documented** feature, where you have a
  **confident** match (see criteria below) → produce a **delta update note** targeting the
  existing article's `<PREFIX>-###` id, instead of a near-duplicate new file. Do **not** mint a new id.
- **`changelog`** — a pure bug fix / internal refactor with **no user-visible change** → there is
  nothing to document as an article. Recommend a **changelog entry** instead (Functional Area +
  business-focused description + 5-digit work-item ID, per the changelog template in the style
  guide). Do not pad an article to justify the skill.

### Finding the existing article (match on captions, not titles)

Reconstruct the feature's user-facing UI captions from the changed AL objects (section 2), then
search the docs set for an article that documents that same surface. Anchor the match on **shared
UI captions / the same page or setup object** — e.g. the article documents the exact page caption
or setup page your changed AL objects belong to — **not** on title-word similarity.

| Signal | Confidence |
|--------|-----------|
| An article documents the same page/setup object and the bold captions your change touches | **Confident** → `update` |
| The change extends what an article already covers (new action on a documented page, new field/column on a documented page, new status in a documented state table) | **Confident** → `update` |
| Several candidate articles could plausibly own it, and at least one documents the page/setup object the changed UI lives on | Still **Confident** → `update` — the ambiguity decides only *which* article to target (see tie-break below), never the kind |
| Several candidate articles touch the area, but **none** documents the changed page/setup object itself | **Uncertain** → `newfeature`, flag overlap |
| An article only mentions the area tangentially / in passing | **Uncertain** → `newfeature`, flag overlap |
| The match rests on title wording rather than shared captions/objects | **Uncertain** → `newfeature`, flag overlap |
| The change introduces a genuinely new sub-topic: a **new** page, setup object, or workflow that no article documents | `newfeature` (new file), cross-link the existing article |

**New UI on a documented page is always an `update`.** If the change adds fields, columns, or
actions to a page or setup object that an existing article documents, classify `update` — even
when the capability feels new, and even when several articles plausibly cover the area. The
"new sub-topic" row applies only to a new page/object/workflow, never to new UI elements on a
documented page. **Tie-break for the target:** prefer the article that documents the page the
new UI lives on; name the runner-up candidate in the work-item comment
(`also relates to <PREFIX>-###`) so a human can move the content if the editorial home is wrong.

**Magnitude tilts the call.** Small changes rarely deserve a brand-new article. When the
magnitude (§3) is a **minor tweak** *and* a plausible existing article documents the same
page/setup object, lean to `update` even on a **moderately-confident** match — a delta note
against the existing article beats a near-empty new file. The default in the table above
("uncertain → new article") is calibrated for *substantial* changes; for a minor change, invert
it. Reserve a new article for a minor change only when there is genuinely no existing home for it.

When you fall back to `newfeature` from an **uncertain** match, name the most likely existing
article so a human can decide: add `may overlap <PREFIX>-### — consider merging instead` to the
work-item comment.

### Delta update note format

A delta note is **not** a standalone publishable page: it has no `meta` frontmatter, no article
id of its own, and is **exempt from the article-structure validation**. Its reader is a human
technical writer, so it must be instantly recognizable as *instructions for updating an existing
article* — never mistakable for a small article. The scaffold below is **mandatory**: the
`# Update to ...` H1, the banner blockquote, the `Target file:`/`Work item:` lines, and the three
sections. Proportionality (§3) caps the *content of the Suggested edits*, never the scaffold.
It tells the writer exactly what to change in the existing article, in house style, so fragments
paste straight in. Still obey "code wins": every bold UI term must trace to a real AL caption.

```
# Update to CB-142 — Payment approval

> **This is an update to an existing article, not a standalone page.** Apply the edits
> below to the published article **CB-142**.

Target file: en-us\<Solution name>\Payments\Approving payments.md
Work item: <work-item id> | PR: <PR id, when linked>

## What changed
<1-2 sentences: the new/changed capability, in user terms>

## Suggested edits
- **Add** after the "Approve a single payment" section:
  ### Approve several payments at once
  <house-style prose for the new section — real bold captions, italic statuses>
- **Update** the "<existing section>" section: <what to add/revise and why>
- **New UI elements:** **Approve selected** (action), **Selected Count** (field)
- **New steps:**
  1. <step>
  2. <step>

## Points to verify before publishing
- <any inferred behavior / unverified caption / scope gap>
```

State the classification and reasoning (in the work-item comment for unattended runs) before
producing the file.

## 7. File placement and toc.txt

- Mirror the docs site structure of the published docs set — the repo configured as
  `DOCS_REPO_PATH` in the docsWriter `.env` (e.g. `<DOCS_REPO_PATH>\en-us\<Solution name>\`).
  Place the file in the folder whose siblings cover the same feature area (read 2-3 siblings
  for tone and placement).
- Filename: human-readable, matching the article title's intent (e.g.
  `Setting up direct debit.md`). Match the casing/spacing convention of existing siblings.
- Each folder has a `toc.txt` (`filename.md | Display Name`). Provide the exact line to add and
  its position (order = navigation order); do not silently leave the new article out of the TOC.
- The `id` (`<PREFIX>-###`, using the product's prefix) must be unique across the product's docs set — ask the user for it; do not
  guess. Optionally grep the docs set for the proposed id to confirm it is free.
