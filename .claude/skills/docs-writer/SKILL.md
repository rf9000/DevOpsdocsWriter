---
name: docs-writer
description: >-
  Write and edit documentation pages for Continia Banking docs site (continia.docs.articles).
  Matches the existing technical writer style, voice, structure, and formatting conventions exactly.
  Use when writing a new documentation article, editing or updating an existing docs page,
  creating release notes or changelog entries, writing bank onboarding pages, creating setup or
  how-to guides, writing overview or conceptual articles, writing FAQ entries, or creating TOC files.
  Triggers on docs, documentation, write article, docs page, help article, changelog, release notes,
  onboarding page, docs writer, technical writing.
---

# Continia Banking Documentation Writer

Write documentation that is indistinguishable from what the existing technical writer produces. All output goes to `C:\GeneralDev\AL\Continia Banking Master\Continia Banking\docs\`. Create subdirectories as needed to mirror the docs site structure. Reference articles for style/tone are at `C:\GeneralDev\continia.docs.articles\en-us\Continia Banking\`.

## Workflow

1. **Determine article type** - Identify which template to follow (see Article Types below)
2. **Read existing related articles** - Find 2-3 similar articles in the docs directory for tone/structure reference
3. **Draft content** - Follow the style guide in `references/style-guide.md` exactly
4. **Cross-reference** - Use `[text](@CB-ID)` links to connect with existing articles; ask the user for the CB-ID if creating a new article
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

See `references/style-guide.md` for complete templates, formatting rules, and verbatim examples for each type.

## Critical Rules (non-negotiable)

### Voice and Tone
- **Second person** ("you", "your") throughout
- **Active voice**, imperative for instructions ("Select", "Enter", "Go to")
- **Professional but approachable** - not marketing, not overly formal
- **No contractions** - use "cannot" not "can't", "do not" not "don't"
- **Benefit-focused introductions** - explain what the user can achieve, not just what exists

### Frontmatter (every article)
```yaml
---
title: [Descriptive title]
description: [1-2 sentence summary]
date: DD-MM-YYYY
id: CB-[number]
lang: en
---
```
- Date format is DD-MM-YYYY (European)
- Ask the user for the CB-ID number if not provided

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
- Internal: `[Link text](@CB-###)` using the target article's `id`
- Section anchors: `[text](@CB-###@section-anchor)` or `[text](#local-anchor)`
- External: standard markdown `[text](https://url)`

### Callout Boxes
```markdown
{% hint style="info" %}
Informational context or clarification.
{% endhint %}

{% hint style="success" %}
Best practice tip or recommendation.
{% endhint %}

{% hint style="danger" %}
Critical warning or constraint.
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

[Related article 1](@CB-###)
[Related article 2](@CB-###)
```

### TOC Files
Plain text, pipe-delimited:
```
FileName.md | Display Name
FolderName | Display Name
```

## Formatting Checklist

Before presenting any documentation:

- [ ] YAML frontmatter with all 5 fields (title, description, date, id, lang)
- [ ] Single H1 matching the title
- [ ] Procedure headings use "To [verb]" format
- [ ] UI elements are **bold**, statuses are *italic*
- [ ] Search instructions use `{{search}}` notation
- [ ] Internal links use `@CB-###` format
- [ ] Callout boxes use `{% hint %}` syntax
- [ ] Related information section at the end
- [ ] No contractions
- [ ] Active voice throughout
- [ ] Introductions frame the business value/context first
