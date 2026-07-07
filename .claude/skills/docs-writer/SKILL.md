---
name: docs-writer
description: >-
  Write and edit documentation pages for the Continia docs site (continia.docs.articles).
  Matches the existing technical writer style, voice, structure, and formatting conventions exactly.
  Use when writing a new documentation article, editing or updating an existing docs page,
  creating release notes or changelog entries, writing bank onboarding pages, creating setup or
  how-to guides, writing overview or conceptual articles, writing FAQ entries, or creating TOC files.
  Triggers on docs, documentation, write article, docs page, help article, changelog, release notes,
  onboarding page, docs writer, technical writing.
---

# Continia Documentation Writer

Write documentation that is indistinguishable from what the existing technical writer produces. Write the article to the output directory configured in the docsWriter repo's `.env` (`OUTPUT_DIR`, default `.output`) — in pipeline runs the article is attached to the work item from there, and the run instructions give the exact output path. The published docs set (the repo configured as `DOCS_REPO_PATH` in `.env`) is read-only reference for style, tone, structure, siblings, and id lookup; mirror its site structure in the output. Never hardcode machine-local paths — all paths are controlled from `.env`.

## Workflow

1. **Determine article type** - Identify which template to follow (see Article Types below)
2. **Read existing related articles** - Find 2-3 similar articles in the docs directory for tone/structure reference
3. **Draft content** - Follow `references/style-guide.md` (the authoritative Continia Docs style guide) together with `references/style-guide-supplement.md` (docs-site mechanics, article templates, verbatim corpus examples). On conflict, `style-guide.md` wins — except supplement items marked **[SITE]**, which describe how the docs pipeline technically works
4. **Cross-reference** - Use `[text](@<PREFIX>-ID)` links (the product's id prefix: CB, DC, EM, ...) to connect with existing articles; ask the user for the id if creating a new article
5. **Review** - Verify against the formatting checklist before presenting, then run the `docs-validator` skill

## Related skills

- **`docs-article-generator`** - Use instead of this skill when the starting point is a *code change* (a diff, work item, or feature name). It reconstructs the complete feature flow from the AL codebase via LSP and drafts a complete new article in this style, then validates it.
- **`docs-validator`** - Run after writing or editing any article to validate it against the guidelines. The canonical pass/fail rules live in `references/validation-rules.md` (the single source both this skill and the validator follow).

## Article Types

Determine the article type, then follow that type's template:

| Type | When to use | Key pattern |
|------|-------------|-------------|
| **Setup/How-to** | Step-by-step procedures | `## To [verb]` sections with numbered steps |
| **Overview/Index** | Entry points linking to subtopics | Intro paragraph + bulleted link list |
| **Conceptual** | Explaining features/business context | Problem framing + sections with inline links |
| **Bank onboarding** | Bank-specific setup guides | Requirements + `## To [task]` procedures + credential tables |
| **Changelog** | Release notes per version | H2 per SP/hotfix + feature/bugfix tables |
| **FAQ** | Question-answer format | H2 questions as headings, direct answers |

See `references/style-guide-supplement.md` for complete templates and verbatim examples for each type; general formatting rules live in `references/style-guide.md`.

## Critical Rules (non-negotiable)

### Voice and Tone
- **Second person** ("you", "your") throughout
- **Active voice**, imperative for instructions ("Select", "Enter", "Go to")
- **Professional but approachable** - not marketing, not overly formal
- **Contractions from the valid list are fine** (you'll, won't, it's, can't, don't, ...) - never use invalid ones (there'd, they'd, you'd, it'd, ain't); see the style guide §9.3
- **Benefit-focused introductions** - explain what the user can achieve, not just what exists

### Metadata block (every article)
````
```meta
title: [Descriptive title]
date: DD-MM-YYYY
description: [1-2 sentence summary]
id: [PREFIX]-[number]
lang: en
```
````
- Use the ` ```meta ` fence (GitBook format), **not** `--- ... ---`. Non-negotiable for new content. Older articles still use `---` (mid-migration); write new articles with ` ```meta ` regardless of what a sibling shows — copying a sibling's legacy `---` block is a defect.
- Field order: title, date, description, id, lang
- Date format is DD-MM-YYYY (European)
- The id prefix is the product's (CB, DC, EM, ...); ask the user for the id number if not provided

### Heading Rules
- Single H1 per page, matches frontmatter title
- H2 for major sections
- Procedure sections: `## To [verb] [object]` (e.g., `## To configure direct debit`)
- H3 sparingly for subsections

### UI Element Formatting
- **Bold** for: page names, field names, button labels, action names, FastTab names
- *Italics* for: status/state values (e.g., *Valid*, *Pending Approval*)
- Navigation breadcrumbs: `**Menu** > **Submenu** > **Action**`
- Search pattern: `Search ({{search}}) for and select **[Page Name]**.`

### Links
- Internal: `[Link text](@<PREFIX>-###)` using the target article's `id` (e.g. `@CB-37`)
- Section anchors: `[text](@<PREFIX>-###@section-anchor)` or `[text](#local-anchor)`
- External: standard markdown `[text](https://url)`

### Callout Boxes
```markdown
{% hint style="info" %}
Information the reader should register even when skimming.
{% endhint %}

{% hint style="danger" %}
Crucial ("Important") information the reader needs to succeed.
{% endhint %}

{% hint style="warning" %}
Critical content requiring immediate attention due to risk.
{% endhint %}

{% hint style="success" %}
Optional tip that helps the reader succeed further.
{% endhint %}
```

### Procedures
- Numbered steps (1., 2., 3.)
- Each step starts with an action verb
- Sub-options as bullets: `* **Option Label** - description`
- Field descriptions: `* **Field Name** - explanation of what to enter and why`
- Context paragraph before the numbered list explaining when/why

### Article Footer
End articles with:
```markdown
## Related information

[Related article 1](@<PREFIX>-###)
[Related article 2](@<PREFIX>-###)
```

### TOC Files
Plain text, pipe-delimited:
```
FileName.md | Display Name
FolderName | Display Name
```

## Formatting Checklist

Before presenting any documentation:

- [ ] ` ```meta ` block with all 5 fields (title, date, description, id, lang)
- [ ] Single H1 matching the title
- [ ] Procedure headings use "To [verb]" format
- [ ] UI elements are **bold**, statuses are *italic*
- [ ] Search instructions use `{{search}}` notation
- [ ] Internal links use the `@<PREFIX>-###` format (the product's id prefix)
- [ ] Callout boxes use `{% hint %}` syntax
- [ ] Related information section at the end
- [ ] No invalid contractions (there'd, they'd, you'd, it'd, ain't); valid-list contractions are fine
- [ ] Active voice throughout
- [ ] Introductions frame the business value/context first — but only when it is sourced (from the brief/work item); no invented "why" or before/after
- [ ] Article length is proportional to the change (a minor change is one tight section, not a padded multi-section piece); no filler explainer sections or hints
