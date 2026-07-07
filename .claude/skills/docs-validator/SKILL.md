---
name: docs-validator
description: >-
  Validate a Continia documentation article against the house guidelines and report
  violations. Runs a deterministic lint script (frontmatter, date/id format, single H1, balanced
  {% hint %} blocks, @[PREFIX]-### link form, invalid contractions, em dashes, Latin abbreviations,
  Related information, image paths), an
  accuracy/anti-hallucination check (bold UI terms must trace to real AL captions), plus a
  judgment pass for tone, structure, UI-element formatting, and link appropriateness. Use when
  asked to validate docs, check an article against guidelines, lint docs, review a docs page for
  compliance, or "/validate-docs". Run automatically after writing or editing any docs article.
---

# Continia Documentation Validator

Validate one or more documentation articles against the canonical guidelines and produce a
grouped, line-referenced report. The single source of rules is
`../docs-writer/references/validation-rules.md`. Do not invent rules — every finding must cite a
rule ID from that file.

## Workflow

1. **Locate the article(s)** - Resolve the target `.md` file path(s). If the user did not name a
   file, ask which article to validate (or validate the most recently written/edited one).

2. **Run the lint script** (the deterministic `[script]` rules):
   ```bash
   python ".claude/skills/docs-validator/scripts/lint_article.py" "<path-to-article.md>"
   ```
   The script checks: FM01-FM05 (frontmatter), HD01-HD02 (H1), VT01 (invalid contractions),
   VT06-VT09 (em dashes, Latin abbreviations, exclamation marks, "(s)" plurals),
   UI05 (search pattern), CO01-CO03 (hints), LK01/LK05 (links), IM01-IM02 (images).
   It exits non-zero when there are BLOCKING findings.

3. **Run the accuracy check** (rule AC01 — anti-hallucination):
   ```bash
   python ".claude/skills/docs-validator/scripts/check_captions.py" --al-root "<AL repo root>" "<path-to-article.md>"
   ```
   It indexes every AL `Caption` in the codebase and lists **bold** terms in the article that do
   not match one. Treat each as VERIFY: confirm the page/field/action genuinely exists (it may
   live in a dependency, have a slightly different caption, or be intentional emphasis). This
   catches invented UI that the format lint would happily pass. The `--al-root` is the AL solution
   root (e.g. the product's AL working dir), not the docs repo.

4. **Run the judgment pass** - Read the article and check the `[judgment]` rules from
   `../docs-writer/references/validation-rules.md` that the script cannot enforce:
   - **FM06/FM07** - description quality, id uniqueness (grep the docs set for the id).
   - **HD03-HD05** - "To [verb]" procedure headings, H3 discipline, article type fits content.
   - **VT02-VT05** - second person, active voice, business-value intro, professional tone.
   - **UI01-UI04** - bold UI elements, italic statuses, plain product names, breadcrumbs.
   - **CO04-CO05** - callout length and style-vs-intent.
   - **LK02-LK04/LK06** - no raw URLs to in-docs pages, external links only for out-of-docs
     targets, partner-only flagged, Related-information formatting.
   - **TB01-TB02** - changelog ID/date formats (only for changelog articles).
   - **AC02-AC03** - italic statuses trace to real enum captions; procedures match the real LSP flow.

5. **Merge and report** - Combine script + judgment findings into one report grouped by severity:
   ```
   BLOCKING (must fix before publishing)
     Lxx  <RULE>: <what's wrong>  ->  <concrete fix>
   WARNING (should fix)
     ...
   INFO (consider)
     ...
   ```
   Always give a concrete fix, not just the violation. End with a one-line verdict:
   `PASS` (no blocking, no warnings), `PASS WITH WARNINGS`, or `FAIL` (any blocking).

## Notes

- The lint script is stdlib-only Python; no install needed. If `python` is not on PATH, try
  `py` (Windows launcher).
- To validate several files at once, pass multiple paths to the script.
- Keep the script and `validation-rules.md` in sync: if a `[script]` rule changes in the rules
  file, update `scripts/lint_article.py` to match (the rules file is authoritative).
- This skill only validates. To draft from a code change, use `docs-article-generator`; to write
  or edit by hand, use `docs-writer`.
