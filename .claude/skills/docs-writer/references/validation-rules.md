# Continia Banking Docs — Validation Rules

Canonical, actionable pass/fail rules derived from `style-guide.md`. This is the single spec
consumed by both the `docs-validator` lint script (`scripts/lint_article.py`) and Claude's
judgment pass. When the style guide changes, update this file so the two stay in sync.

Each rule has:
- an **ID** (stable, referenced in validator output),
- a **severity**: `BLOCKING` (must fix), `WARNING` (should fix), `INFO` (consider),
- an **enforcement**: `[script]` (deterministically checkable) or `[judgment]` (Claude reads and decides).

The lint script implements every `[script]` rule below and nothing else. Everything tagged
`[judgment]` is checked by the validator skill's reading pass, not the script.

---

## A. Frontmatter

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| FM01 | Article starts with a YAML frontmatter block delimited by `---` on its own first line and a closing `---`. | BLOCKING | [script] |
| FM02 | Frontmatter contains all five keys: `title`, `description`, `date`, `id`, `lang`. | BLOCKING | [script] |
| FM03 | `date` matches `DD-MM-YYYY` (e.g. `18-03-2026`). | BLOCKING | [script] |
| FM04 | `id` matches `CB-` followed by digits (e.g. `CB-130`). | BLOCKING | [script] |
| FM05 | `lang` is exactly `en`. | BLOCKING | [script] |
| FM06 | `description` is 1-2 sentences and starts with "Learn how to..." or plainly describes the article's scope. | WARNING | [judgment] |
| FM07 | `id` is unique across the entire docs set (no other article uses it). | WARNING | [judgment] |

## B. Headings & structure

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| HD01 | Exactly one H1 (`# `) in the document. | BLOCKING | [script] |
| HD02 | The H1 text matches the frontmatter `title` (ignoring a trailing " in Continia Banking" / minor wording). | INFO | [script] |
| HD03 | Procedure section headings use `## To [verb] ...` form. | WARNING | [judgment] |
| HD04 | H3 used sparingly (subsections only), never as the top section level. | INFO | [judgment] |
| HD05 | The chosen article type matches the content (concept vs procedure vs overview etc.). | WARNING | [judgment] |

## C. Voice & tone

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| VT01 | No contractions (e.g. `can't`, `don't`, `won't`, `it's`, `you're`, `isn't`, `doesn't`, `aren't`, `wasn't`, `we'll`, `you'll`). | WARNING | [script] |
| VT02 | Second person ("you"/"your") throughout; not first person or impersonal. | WARNING | [judgment] |
| VT03 | Active voice; imperative verbs for instructions ("Select", "Enter", "Go to"). | WARNING | [judgment] |
| VT04 | Introduction frames business value/context before mechanics. | WARNING | [judgment] |
| VT05 | Professional but approachable; not marketing copy, not overly formal. | INFO | [judgment] |

## D. UI element formatting

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| UI01 | Page names, field names, buttons, actions, FastTab/FactBox/column names are **bold**. | WARNING | [judgment] |
| UI02 | Status/state values are *italic* (e.g. *Valid*, *Pending Approval*, *Ready*). | WARNING | [judgment] |
| UI03 | Product names ("Continia Banking", "Business Central") are plain text, never bold/italic. | INFO | [judgment] |
| UI04 | Navigation uses `**Menu** > **Submenu** > **Action**` breadcrumb form. | INFO | [judgment] |
| UI05 | Opening a page uses the exact pattern `Search ({{search}}) for and select **[Page]**.` | WARNING | [script] |

> UI05 script check: if a line contains "Search" + "for and select" it must contain `({{search}})`.

## E. Callouts

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| CO01 | Every `{% hint style="..." %}` has a matching `{% endhint %}` (balanced). | BLOCKING | [script] |
| CO02 | Hint `style` is one of `info`, `success`, `danger`. | BLOCKING | [script] |
| CO03 | No GitHub-style alerts (`> [!NOTE]`, `> [!IMPORTANT]`, etc.) in new content; use `{% hint %}`. | WARNING | [script] |
| CO04 | Callout content is 1-3 sentences; longer content belongs in body text. | INFO | [judgment] |
| CO05 | Callout style matches intent (info=context, success=tip, danger=warning/constraint). | INFO | [judgment] |

## F. Links & cross-references

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| LK01 | Internal article links use `[text](@CB-###)` form; `###` is digits. Flag `(@CB-)` with no number or malformed `@CB` tokens. | BLOCKING | [script] |
| LK02 | No raw-URL links to pages that are inside the docs set (use `@CB-###` instead). | WARNING | [judgment] |
| LK03 | External links are reserved for out-of-docs targets (bank portals, Microsoft Learn, PartnerZone/Zendesk, PSP docs, standards). | WARNING | [judgment] |
| LK04 | Partner-only resources are flagged as such in the surrounding text. | INFO | [judgment] |
| LK05 | Article ends with a `## Related information` section (except where the type legitimately omits it, e.g. some overviews/changelogs). | INFO | [script] |
| LK06 | Links under Related information are bare `[text](@CB-###)` lines (no bullets). | INFO | [judgment] |

## G. Images & media

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| IM01 | Image paths point under `/images/CB/`. | WARNING | [script] |
| IM02 | Images have meaningful alt text (not empty `![]`). | WARNING | [script] |

## H. Tables (changelog-specific)

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| TB01 | Changelog `ID` column values are 5-digit work-item numbers, not `CB-###`. | WARNING | [judgment] |
| TB02 | Changelog release dates use "Month Day, Year" format, not `DD-MM-YYYY`. | INFO | [judgment] |

## I. Accuracy (anti-hallucination)

The validator checks *truth*, not just format. Auto-generated articles can name a page, field,
or action that does not exist in the product.

| ID | Rule | Severity | Enforcement |
|----|------|----------|-------------|
| AC01 | Every **bold** UI term in the article traces to a real AL `Caption` in the codebase (excluding generic system buttons like OK/Next/Finish and product names). Unmatched terms are surfaced for human verification. | WARNING | [script] |
| AC02 | Every status/state value in *italics* traces to a real enum value caption. | INFO | [judgment] |
| AC03 | Procedures describe the real flow found via LSP (entry point → fields → action → result); no invented steps. | WARNING | [judgment] |

AC01 is implemented by `scripts/check_captions.py` (it needs the AL repo root). Because bolding
is also used for emphasis, AC01 is advisory: it reports unmatched terms rather than hard-failing.

---

## Severity calibration (measured against the corpus)

Severities are tuned to the actual published corpus (run `lint_article.py --summary <docs-root>`),
not just the style guide's ideals, so the validator does not cry wolf:
- BLOCKING rules fire on <2% of files (genuine defects).
- HD02 and LK05 are INFO (they "fail" on ~29% and ~86% of real articles respectively — legitimate
  editorial variation, not defects).
- VT01 (contractions) and CO03 (legacy alerts) stay WARNING: the majority of the corpus complies
  and we want them caught in new content.
Re-measure and re-tune if the corpus conventions shift.

## Script vs judgment summary

The script (`lint_article.py`) is the **authority** for `[script]` rules — when a `[script]`
rule's wording or severity changes here, change the script too, and vice versa. `[script]` rules:
FM01-FM05, HD01, HD02, VT01, UI05, CO01, CO02, CO03, LK01, LK05, IM01, IM02, AC01
(AC01 in `check_captions.py`, the rest in `lint_article.py`).

Everything else is `[judgment]` — the validator skill reads the article and decides, citing the
rule ID in its report.
