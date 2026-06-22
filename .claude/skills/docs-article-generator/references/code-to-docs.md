# Code → Docs Mapping

How to turn an AL code change into a complete, user-facing documentation article. This file is
the generator's *delta* — it does not repeat house style (that lives in
`../docs-writer/references/style-guide.md`).

## Table of contents
- [1. Reconstruct the complete feature flow (LSP-first)](#1-reconstruct-the-complete-feature-flow-lsp-first)
- [2. Map AL symbols to user-facing text](#2-map-al-symbols-to-user-facing-text)
- [3. Change-type → article-type heuristics](#3-change-type--article-type-heuristics)
- [4. Decide: article vs changelog vs nothing](#4-decide-article-vs-changelog-vs-nothing)
- [5. File placement and toc.txt](#5-file-placement-and-toctxt)

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

## 3. Change-type → article-type heuristics

| Code change | Likely article type | Notes |
|-------------|---------------------|-------|
| New setup page / new fields on a setup page | **Setup/How-to** | "Setting up [feature]..." with `## To configure` |
| New wizard / NavigatePage | **Setup/How-to** | Walk the wizard steps; pair with `assisted-setup-wizard` |
| New feature concept / new module area | **Conceptual** | "[Feature] in Continia Banking" — what/why/how |
| New bank auth codeunit / bank enablement | **Bank onboarding** | Requirements + credential table + `## To establish...` |
| New enum statuses / state machine change | Update **Conceptual** status table | Render values *italic* |
| New action on an existing page | Update the existing How-to article | Usually an edit, not a new file |
| Pure bug fix, no user-visible change | **Changelog entry** | See section 4 — do not invent an article |

A substantial feature often needs a Conceptual article *and* one or more Setup/How-to articles
linked from an Overview. Prefer splitting over a single mixed page.

## 4. Decide: article vs changelog vs nothing

Before drafting, classify the change honestly:

- **Doc-worthy feature/behavior** (new capability, new setup, changed user workflow) → draft a
  complete new article (the default output of this skill).
- **Pure bug fix / internal refactor** with no user-visible change → there is nothing to
  document as an article. Say so explicitly and recommend a **changelog entry** instead
  (Functional Area + business-focused description + 5-digit work-item ID, per the changelog
  template in the style guide). Do not pad an article to justify the skill.
- **Enhancement to an existing documented feature** → recommend editing the existing article
  (find it via the docs set) rather than creating a near-duplicate new file; only create a new
  file if the enhancement is genuinely a new sub-topic.

State the classification and reasoning to the user before producing the file.

## 5. File placement and toc.txt

- Mirror the docs site structure under
  `C:\GeneralDev\continia.docs.articles\en-us\Continia Banking\`. Place the file in the folder
  whose siblings cover the same feature area (read 2-3 siblings for tone and placement).
- Filename: human-readable, matching the article title's intent (e.g.
  `Setting up direct debit.md`). Match the casing/spacing convention of existing siblings.
- Each folder has a `toc.txt` (`filename.md | Display Name`). Provide the exact line to add and
  its position (order = navigation order); do not silently leave the new article out of the TOC.
- The `id` (`CB-###`) must be unique across the whole docs set — ask the user for it; do not
  guess. Optionally grep the docs set for the proposed id to confirm it is free.
