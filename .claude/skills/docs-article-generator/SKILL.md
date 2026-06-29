---
name: docs-article-generator
description: >-
  Generate a complete Continia Banking documentation article from a code change. Given a git
  diff, an Azure DevOps work item, staged changes, or a feature name, it reconstructs the
  COMPLETE feature flow from the AL codebase using LSP (findReferences, incoming/outgoingCalls,
  goToDefinition, documentSymbol, hover) - not just the changed lines - maps AL captions to the
  user-facing UI names, and drafts a full article in house style, then validates it. Use when
  asked to write docs for a new feature, create a docs article from a code change / work item /
  PR, document a feature automatically, auto-generate documentation, or "/docs-from-code".
  For hand-writing without code, use docs-writer; for validation only, use docs-validator.
---

# Continia Banking Docs Article Generator

Produce a complete, publishable documentation article from a code change. The article documents
the **whole feature as the user experiences it**, seeded by (but not limited to) the diff.

This skill is an **orchestrator**, not a second writer. It owns what is unique to the
code→docs path — understanding the change, reconstructing the full feature flow via LSP,
classifying it, and choosing placement — then delegates **drafting to `docs-writer`** and
**validation to `docs-validator`**. This keeps house style in exactly one place.

Output target: `C:\GeneralDev\continia.docs.articles\en-us\Continia Banking\` (mirror the site
structure). The AL→docs mapping and the feature-flow method are in `references/code-to-docs.md`
(read it before starting); house style lives in `../docs-writer/references/style-guide.md` and is
applied by `docs-writer` during drafting.

## Workflow

1. **Gather the change context.** Accept any of:
   - a work item ID (fetch via the FinishWork / Azure DevOps helpers for the description),
   - a git diff or commit/PR range,
   - the default: working-tree + staged changes vs `main`
     (`git diff main...HEAD` plus `git diff` / `git diff --staged`),
   - or an explicit feature name.
   Identify the changed AL objects (pages, tables, codeunits, enums, fields, actions).

2. **Reconstruct the complete feature flow (LSP-first).** Follow
   `references/code-to-docs.md` section 1. Use `documentSymbol` for structure/IDs,
   `findReferences` to find the UI surfaces, `incomingCalls` to reach the user's entry points,
   `outgoingCalls`/`goToDefinition` to reach the effects/results. Layer in the investigation
   skills (`setup-files-investigate`, `bank-communication-operations`, `assisted-setup-wizard`,
   `swagger-api-reader`) for domain context. The result is the end-to-end journey:
   prerequisites → setup/fields → actions → results → related features.

3. **Assess magnitude and impact, then classify → choose the output.**
   First, size the change and gather impact, because both shape what you produce:
   - **Magnitude (`references/code-to-docs.md` section 3).** Decide whether this is a *minor
     tweak*, a *workflow improvement*, a *new feature/module*, or a *technical addition*. The
     magnitude caps the output depth — a couple of new fields is not a full multi-section
     article, and it tilts the new-vs-update call toward a delta update.
   - **Impact brief (`references/code-to-docs.md` section 4).** Answer the seven questions
     (problem solved, before vs. now, when noticed, where in the UI, config needed, etc.) from
     the work item, comments, PR, and code. Confirmed answers frame the intro; answers you
     cannot ground in any source are **not invented** — they become *Context needed from
     author/SME* gaps in the work-item comment.

   Then, per `references/code-to-docs.md` section 6, decide exactly one of three outputs:
   - **New article** (the default for substantial changes) — a doc-worthy feature with no existing
     article, an *uncertain* match, or a genuinely new sub-topic. Scale its depth to the magnitude.
   - **Delta update** — a CONFIDENT match to an existing article that this change extends, **or** a
     minor change with a plausible existing home (§6 "Magnitude tilts the call"). Produce an update
     note targeting that article's existing `CB-###` instead of a near-duplicate (§6 gives the
     confident-vs-uncertain criteria and the delta-note format).
   - **Changelog entry** — a pure bug fix / internal refactor with no user-visible change.
   Match on shared UI captions / the same page or setup object, not title wording. In an
   unattended run, state the classification in the work-item comment (and add a "may overlap
   CB-### — consider merging" note when you fell back to a new article from an uncertain match);
   interactively, state it to the user.

4. **Choose the article type and location.** Use the "Choosing the article type" guide and the
   change-type heuristics. Pick the target folder, read 2-3 sibling articles for tone, and
   locate the folder's `toc.txt`.

5. **Get the article id.** For a **new article**, take the next unused `CB-###` (in an unattended
   run, the highest existing `CB-` number in the docs set + 1; interactively, ask the user). For a
   **delta update**, reuse the existing article's `CB-###` — do not mint a new one. Optionally grep
   the docs set to confirm a new id is unused.

6. **Draft via `docs-writer`.** Do not re-derive house style here — `docs-writer` is the single
   drafting engine. Invoke it with a *feature brief* assembled from the previous steps:
   - the chosen article type and target folder (+ the 2-3 sibling articles read for tone),
   - the **magnitude and depth budget** (§3) so the writer scales the article and does not pad a
     small change into a multi-section piece,
   - the **confirmed impact answers** (§4) so the intro frames problem/when-useful from sourced
     facts — and an explicit note of which impact answers are unknown, so the writer does **not**
     invent them,
   - the `CB-###` id,
   - the reconstructed feature flow (prerequisites → setup/fields → actions → results → related),
   - the caption→UI-name mapping from `references/code-to-docs.md` so it bolds real captions and
     italicizes real statuses (never AL identifiers),
   - candidate `@CB-###` cross-links and any legitimate external links.
   `docs-writer` produces the article file in its own style.

7. **Validate.** For a **new article**, run the `docs-validator` skill on the new file — it runs
   the format lint, the AC01 caption accuracy check (passing this AL repo as `--al-root`), and the
   judgment pass. Fix every BLOCKING finding, resolve any AC01 VERIFY items (confirm each flagged
   term is real UI or correct the article), and address WARNINGs where appropriate; then
   re-validate. For a **delta update** or **changelog entry**, skip the article-structure
   validation (it is not a standalone publishable page) — but still confirm every bold UI term
   traces to a real AL caption (run the AC01 caption check or verify by hand).

8. **Present.** Show the created file path, the exact `toc.txt` line to add (and its position),
   any external links used (with rationale), and the validator verdict. Flag anything that needs
   the user's confirmation (id, placement, screenshots to capture).

## Notes

- Document captions, never AL identifiers (`"CTS-CB ..."`, field numbers, enum ordinals).
- Do not fabricate UI that the code does not produce — every page/field/action/status named must
  trace back to a real caption found via LSP.
- Screenshots: reference `/images/CB/<file>.png` and note to the user which screenshots to
  capture; do not invent image files.
- Keep the canonical rules in `docs-writer`; this skill adds only the code-mapping delta. If
  style guidance seems missing, update `docs-writer`, not this skill.
