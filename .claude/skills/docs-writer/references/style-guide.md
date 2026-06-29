# Continia Banking Documentation Style Guide

Complete reference for writing documentation that matches the existing Continia Banking docs. This file contains detailed templates, verbatim examples, and formatting rules organized by article type.

## Table of Contents

- [1. Frontmatter Reference](#1-frontmatter-reference)
- [2. Article Type Templates](#2-article-type-templates)
  - [2.1 Setup/How-to Articles](#21-setuphow-to-articles)
  - [2.2 Overview/Index Articles](#22-overviewindex-articles)
  - [2.3 Conceptual Articles](#23-conceptual-articles)
  - [2.4 Bank Onboarding Articles](#24-bank-onboarding-articles)
  - [2.5 Changelog Articles](#25-changelog-articles)
  - [2.6 FAQ Articles](#26-faq-articles)
- [3. UI Element Formatting](#3-ui-element-formatting)
- [4. Procedure Writing](#4-procedure-writing)
- [5. Callout Boxes](#5-callout-boxes)
- [6. Links and Cross-References](#6-links-and-cross-references)
- [7. Tables](#7-tables)
- [8. Vocabulary and Phrasing](#8-vocabulary-and-phrasing)
- [9. TOC File Format](#9-toc-file-format)
- [10. Sentence Patterns](#10-sentence-patterns)
- [11. Images, Media, and Template Variables](#11-images-media-and-template-variables)

---

## 1. Frontmatter Reference

Every documentation article starts with a fenced **`meta`** block (the GitBook format the docs site is moving to):

````
```meta
title: Setting up direct debit in Continia Banking
date: 18-03-2026
description: Learn how to configure and manage direct debit in Continia Banking.
id: CB-130
lang: en
```
````

**Field rules:**
- Use the ` ```meta ` … ` ``` ` fence, **not** a `--- ... ---` YAML block. This is non-negotiable for new content. Older articles in the corpus still use `---`; they are mid-migration. Write new articles with ` ```meta ` **regardless of what a sibling shows** — reading a sibling for tone does NOT license copying its legacy `---` block or its field order. Emitting a `--- ... ---` block (or the wrong field order) in a new article is a defect, even though the validator currently tolerates `---` during the migration.
- Field order: `title`, `date`, `description`, `id`, `lang`.
- `title`: Descriptive, action-oriented. For setup articles: "Setting up [feature] in Continia Banking". For conceptual: "[Feature] in Continia Banking".
- `date`: DD-MM-YYYY format (European). Use today's date for new articles.
- `description`: 1-2 sentences. Starts with "Learn how to..." or plainly describes what the article covers (e.g. "How to enable...").
- `id`: Format `CB-###`. Must be unique across the entire documentation set.
- `lang`: Always `en`.

---

## 2. Article Type Templates

### Choosing the article type

Pick the type from what the reader needs to *do*, not from the code that changed:

| If the article's job is to... | Use type | Title pattern |
|-------------------------------|----------|---------------|
| Walk the user through configuring or performing a task | **Setup/How-to** | "Setting up [feature] in Continia Banking" / "[Action] in Continia Banking" |
| Be a landing page that routes to sub-articles | **Overview/Index** | "Overview" / "[Topic] overview" |
| Explain what a feature is, why it exists, and how it works | **Conceptual** | "[Topic] in Continia Banking" / "Introducing [feature]" |
| Get a specific bank/provider connected | **Bank onboarding** | "Onboarding [Bank]" / "Onboarding through [Provider]" |
| List per-version changes | **Changelog** | "Detailed Changelog for Continia Banking [Year] [Release]" |
| Answer recurring user questions | **FAQ** | "[Topic] FAQ" |

A larger feature often needs more than one: a **Conceptual** article (what/why) plus one or
more **Setup/How-to** articles (configure/use), linked from an **Overview**. When in doubt,
split rather than mixing concept and procedure in one page.

### Proportionality — match the article to the size of the change

The article's length must track the size of what changed, not fill a template. **A small change
gets a small article.** When the brief gives you a change magnitude (the `docs-article-generator`
passes one), let it cap the depth:

| Magnitude | Write |
|-----------|-------|
| **Minor tweak** (a couple of new fields, a toggle) | One tight section: a short intro + a single `## To ...` procedure. No "how it works"/priority-hierarchy explainer, no reference table unless the field list itself needs one, at most one hint. |
| **Workflow improvement** | The changed flow only — do not re-document the surrounding feature. |
| **New feature / module** | Full structure as the feature warrants. |

Anti-filler rules:

- The number of sections should track the number of things the user actually has to **understand
  or do**. If a section restates the intro or explains mechanics the user does not act on, cut it.
- Do not invent explainer sections, comparison tables, or extra `{% hint %}` boxes to make a
  thin change look substantial. Padding produces text that "sounds fine without really saying
  much" — the opposite of useful.
- Prefer one precise sentence over a paragraph of generic framing.

### Impact in the introduction — only when sourced

Introductions frame business value (problem solved, when it is useful) **before** mechanics — but
only when that value is actually known. The *why/when/before-vs-after* is **not** in the code; it
comes from the work item, comments, or PR (the brief supplies it).

- When the impact is sourced, lead with it: the problem, then what the user can now do.
- When it is **not** sourced, keep the intro minimal (what the feature does and where) rather than
  manufacturing a plausible-sounding rationale. Inventing a "why" is filler and can be wrong.
- Never assert a before/after the brief did not give you. Unknown impact is flagged for a human
  (the generator surfaces it to the author/SME), not written into the article as fact.

### 2.1 Setup/How-to Articles

**Title pattern:** "Setting up [feature] in Continia Banking" or "[Action] in Continia Banking"

**Template:**

````markdown
```meta
title: Setting up [feature] in Continia Banking
date: DD-MM-YYYY
description: Learn how to configure [feature] in Continia Banking.
id: CB-[number]
lang: en
```

# Setting up [feature]

[1-2 paragraph introduction explaining what the feature does and why it matters. Frame in terms of business value.]

{% hint style="info" %}
[Optional: Important prerequisite or contextual information.]
{% endhint %}

## To configure [feature]

[Optional: 1-2 sentence context about when or why to do this.]

1. Search ({{search}}) for and select **[Page Name]**.

2. On the **[FastTab Name]** FastTab, fill in the following fields:
   * **[Field Name]** - [explanation of what to enter and why].
   * **[Field Name]** - [explanation of what to enter and why].

3. On the action bar, select **[Menu]** > **[Action]**.

4. Click **OK** to save the settings.

## To [second task]

[Context paragraph.]

1. [Step 1]
2. [Step 2]
3. [Step 3]

{% hint style="success" %}
[Optional: Best practice tip related to this task.]
{% endhint %}

## Related information

[Related article 1](@CB-###)
[Related article 2](@CB-###)
```
````

**Verbatim example (from Setting up direct debit):**

```markdown
# Setting up direct debit

Continia Banking enhances the standard direct debit functionality in Business Central
by enabling users to view and manage customer direct debit suggestions. This allows
you to track collections transferred from the customer's bank account to yours.

{% hint style="info" %}
Direct debit availability can vary by bank. In the [banks overview page](@CB-79),
a blank entry in the **Direct Debit** column means direct debit isn't supported,
**Manual** indicates it's available via manual file upload, and **Direct** means
both manual upload and direct processing are supported.
{% endhint %}

## To configure direct debit

Before creating a direct debit payment suggestion, you need to enable the feature
and configure the default settings.

1. Search ({{search}}) for and select **Banking Export Setup**.

2. On the **Direct Debit** FastTab, from the **Default Template Name** and
**Default Batch Name** fields, select the templates you want to use for direct
debit. These fields specify the default template and batch names for payment
suggestions when processing direct debits. Once enabled, the system will
prefill related fields during payment processing.
```

### Key Considerations Pattern

Some setup articles open with a "Key considerations" section:

```markdown
## Key considerations

* **Mandatory fields** - fields marked with a red asterisk (*) must be completed to prevent errors.
* **Notifications** - if any settings are missing or incorrect, notifications will appear on the reconciliation page.
* **Don't change default rules** - [default rules](@CB-284) can't be deleted, only disabled.
* **Always test a rule** - before using a rule in production, test it first.
```

---

### 2.2 Overview/Index Articles

**Title pattern:** "Overview" or "[Topic] overview"

**Template:**

````markdown
```meta
title: [Section name] overview
date: DD-MM-YYYY
description: [Brief overview of what this section covers.]
id: CB-[number]
lang: en
```

# Overview

[1-2 sentence intro explaining what this section covers and who it's for.]

## To get started

[Brief intro sentence.]

* [Article title](@CB-###) - [brief description of what that article covers].
* [Article title](@CB-###) - [brief description].

## To [verb] [object]

[Brief intro sentence.]

* [Article title](@CB-###) - [description, starts with lowercase verb: "overview of...", "step-by-step instructions for...", "guidance on..."].
* [Article title](@CB-###) - [description].

## To [verb] [object]

* [Article title](@CB-###) - [description].
```
````

**Verbatim example (from Payment Reconciliation Journal Overview):**

```markdown
# Overview

This overview article guides you to the resources available for using the
**Payment Reconciliation Journal**.

## To get started

To begin using the Payment Reconciliation Journal, see:

* [Introducing the Payment Reconciliation Journal](@CB-106) - overview of
  the general functionality.

## To import payments

Import external payment data into the journal:

* [Importing payments into the Payment Reconciliation Journal](@CB-163) -
  step-by-step instructions for importing payments.

## To process payments

* [Working in the Payment Reconciliation Journal](@CB-26) - guidance on
  processing and reviewing payments.
```

---

### 2.3 Conceptual Articles

**Title pattern:** "[Feature/Topic] in Continia Banking" or "Introducing [feature]"

**Template:**

````markdown
```meta
title: [Topic] in Continia Banking
date: DD-MM-YYYY
description: [Brief description of the concept.]
id: CB-[number]
lang: en
```

# [Topic] in Continia Banking

[1-3 paragraph introduction. Start with the business problem or context.
Explain what the feature achieves. Mention how it differs from or enhances
standard Business Central functionality.]

## [Concept category 1]

[Explanation of the concept. Can use numbered lists for options/categories:]

1. **[Option A]** - [description with link to detail article](@CB-###).
2. **[Option B]** - [description with link](@CB-###).

## [Concept category 2]

[Deeper explanation of the feature's mechanics.]

### [Sub-concept]

[Details, can include bullet lists for technical details:]

* **[Term]** - [definition/explanation].
* **[Term]** - [definition/explanation].

## Related information

[Related article 1](@CB-###)
[Related article 2](@CB-###)
```
````

**Verbatim example (from Bank communication):**

```markdown
# Bank communication in Continia Banking

Continia Banking offers multiple options for exchanging financial data between
your bank and Business Central. The best method depends on your bank's integration
options and your organization's requirements. You can choose from four connection types:

1. Direct communication via Continia integration
2. Direct communication via third party
3. Azure Blob storage integration
4. Manual file exchange
```

**Typical workflow pattern (within conceptual articles):**

```markdown
### Typical workflow

1. Create and prepare payment suggestions in the payment journal.
2. Send payment data directly to your bank from Business Central.
3. The bank processes the transactions.
4. Status updates are automatically imported back into Business Central.
5. If errors occur, correct them and resend the file as needed.

### Configuration

You can manage communication settings on the **Bank Account Communication
Setup** page. On the **Bank Account Card** page, on the action bar, select
**Related** > **Communication Setup**.
```

---

### 2.4 Bank Onboarding Articles

**Title pattern:** "Onboarding [Bank Name]" or "Onboarding through [Provider]"

**Template:**

````markdown
```meta
title: Onboarding [Bank Name] for Continia Banking
date: DD-MM-YYYY
description: Information about [Bank Name] and how to set up direct communication.
id: CB-[number]
lang: en
```

# Onboarding [Bank Name]

[1-2 sentence intro about what this article covers.]

[Optional: Cross-reference to alternative methods.]

[Optional: Bank-specific limitations paragraph.]

## Requirements

* [Requirement 1 - e.g., agreement type needed]
* [Requirement 2 - e.g., portal access]
* See [Setting up bank accounts](@CB-37) for general setup instructions.

## To [first setup task]

[Context paragraph if needed.]

1. [Step 1]
2. [Step 2]
3. [Step 3]

{% hint style="info" %}
[Bank-specific note or timing information.]
{% endhint %}

## To establish direct communication in Continia Banking

To set up direct communication, you need the following information:

| Item | Description | Location |
| ---- | ----------- | -------- |
| [Credential 1] | [What it is and format] | [Where to obtain it] |
| [Credential 2] | [What it is and format] | [Where to obtain it] |

[Instructions for entering credentials in Business Central.]

## Related information

[Related bank article](@CB-###)
[Setting up bank accounts](@CB-37)
```
````

---

### 2.5 Changelog Articles

**Title pattern:** "Detailed Changelog for Continia Banking [Year] [Release]"

**Template:**

````markdown
```meta
title: Detailed Changelog for Continia Banking [Year] [Release]
date: DD-MM-YYYY
description: Changelog containing an overview of all new updates, features, and hotfixes for Continia Banking [Year] [Release]
id: CB-[number]
lang: en
```

# Detailed changelog for Continia Banking [Year] [Release]

{% hint style="danger" %}
Continia Banking [Year R#] supports the following version of Microsoft Dynamics 365
Business Central: Business Central [Year R#] (v##).
{% endhint %}

{% hint style="success" %}
As a Continia partner, we can notify you of new Continia Banking versions and
service packs whenever we release them. To sign up for this service, go to
[this page](https://continia.zendesk.com/hc/en-us/articles/...) in the Continia
PartnerZone (only available to partners).
{% endhint %}

## Continia Banking [Year R#], Service Pack [#], hotfix [#]

*Release date online: [Month Day, Year]*
*Release date, on-premises: [Month Day, Year or "pending"]*
*Continia Banking version: [X.Y.Z]*

### New or changed functionality

| Functional Area | Description | ID |
| --------------- | ----------- | -- |
| [Area] | [Business-focused description of the change] | [5-digit ID] |

### Bug fixes

| Functional Area | Description | ID |
| --------------- | ----------- | -- |
| [Area] | [Description of what was fixed] | [5-digit ID] |

## Continia Banking [Year R#], Service Pack [#]

[Repeat pattern for each SP/hotfix...]
```
````

**Key rules for changelogs:**
- Release dates use "Month Day, Year" format (e.g., "March 16, 2026") - NOT the DD-MM-YYYY frontmatter format
- Version format: Major.Minor.Patch (e.g., 27.5.4)
- Functional areas: "General Application", "Payment Export", "Payment Import", "CSV Import", "Payment Method"
- Descriptions are business-focused, not technical
- Multi-line descriptions use `<br />` within table cells
- ID is a 5-digit number

---

### 2.6 FAQ Articles

**Title pattern:** "[Topic] FAQ" or "Frequently asked questions"

**Template:**

````markdown
```meta
title: [Topic] FAQ
date: DD-MM-YYYY
description: Find answers to frequently asked questions about [topic].
id: CB-[number]
lang: en
```

# [Topic] FAQ

[1-2 sentence intro explaining what this FAQ covers.]

## [Question in natural language?]

[Direct answer, 1-3 paragraphs. Link to related articles where appropriate.]

## [Another question?]

[Answer. Can include numbered steps if procedural:]

1. [Step 1]
2. [Step 2]
3. [Step 3]
```
````

**Key rules for FAQs:**
- Each question is an H2 heading
- Questions are natural language (not "Q: ...")
- No "Answer:" prefix - content follows directly
- Conversational tone, still professional
- Link to detailed articles rather than duplicating content

---

## 3. UI Element Formatting

### What gets bold

| Element | Format | Example |
|---------|--------|---------|
| Page names | **Bold** | `**Payment Journals**` |
| Field names | **Bold** | `**Batch Name**` |
| Button labels | **Bold** | `**OK**`, `**Next**`, `**Finish**` |
| Action names | **Bold** | `**Export/Send Payments**` |
| FastTab names | **Bold** | `**Direct Debit** FastTab` |
| Column names | **Bold** | `**Banking Export Journal** column` |
| Menu items | **Bold** | `**Home** > **Post** > **Post**` |
| FactBox names | **Bold** | `**Line Information** FactBox` |

### What gets italic

| Element | Format | Example |
|---------|--------|---------|
| Status values | *Italic* | `*Valid*`, `*Pending Approval*` |
| State values | *Italic* | `*Ready*`, `*Imported*` |

### What gets neither

- Generic terms: "field", "page", "option", "column"
- Descriptive text and explanations
- Product names (written in plain text: "Continia Banking", "Business Central")

### Navigation breadcrumbs

Format: `**Menu** > **Submenu** > **Action**`

Examples:
- `select **Home** > **Suggest Vendor/Customer/Employee Payments**`
- `click **Prepare** > **Send Approval Request**`
- `select **Related** > **Communication Setup**`
- `click **Actions** > **Functions** > **Delete and set as Imported**`
- `click **Page** > **Show More Columns** or **Show Fewer Columns**`

### Search pattern

Always use this exact pattern:
```
Search ({{search}}) for and select **[Page Name]**.
```

The `{{search}}` renders as a search icon in the final docs.

---

## 4. Procedure Writing

### Step format

```markdown
## To [verb] [object]

[1-2 sentence context: when/why to do this, prerequisites, or links to related articles.]

1. Search ({{search}}) for and select **[Page Name]**.

2. Go to the **[Field Name]** field, select the three dots, and on the **[Page Name]** page, select a [item].

3. On the action bar, select **[Menu]** > **[Action]**.

4. On the **[Form Name]** form, fill in the following:
   * **[Field Name]** - [explanation].
   * **[Field Name]** - [explanation].

5. Click **OK** to [complete the action].
```

### Step wording conventions

- Start each step with an action verb: "Search", "Go to", "Select", "Enter", "Click", "On the"
- Use "Search ({{search}}) for and select" for the first step when navigating to a page
- Use "On the action bar, select" for menu actions
- Use "Go to the **[Field]** field" for field navigation
- Use "Fill in the following" or "enter the following" for multiple fields
- Use "Click **OK**" or "Click **Next**" for button actions

### Alternative access pattern

When a feature can be accessed multiple ways:
```markdown
Search ({{search}}) for and select **Search rules**. Alternatively, on the
**Bank Account Reconciliation** or **Payment Journal Reconciliation** page,
select the bank statement line, and on the action bar, select **Rules** > **Add Search Rule**.
```

### Conditional steps

```markdown
5. If the newly selected bank system supports payment methods that are already
   handled by another active system, the wizard displays the **Resolve Payment
   Method Conflicts** page. If this page does not appear, no overlaps were
   detected, and you can continue to the next step.
```

### Expected results

State the outcome at the end of a procedure:
```markdown
8. Click **Finish**. After you've set up the bank account, the status in the
   **Bank Accounts** overview will be set to *Ready*, and the bank account
   will be ready for use.
```

### Sub-options format

When a step has multiple choices:
```markdown
3. Go to the **Communication type** columns, select one of the following options,
   and click **Next**:
   * **Direct** - select this option for automated communication with Continia's
     online solution as intermediary.
   * **Manual** - select this option if you prefer to manually upload and
     download payment files.
   * **Storage Account** - select this option if your bank delivers statements
     to an Azure Blob storage account.
```

---

## 5. Callout Boxes

### Info (blue) - additional context

```markdown
{% hint style="info" %}
In the **Bank Acc. Reconciliation** page, imported descriptions appear in the
**Description** field. In the **Payment Reconciliation Journal**, they appear
in the **Transaction Text** field.
{% endhint %}
```

### Success (green) - tips and recommendations

```markdown
{% hint style="success" %}
Consider using the Bookkeeper role for an overview of the most important
Continia Banking features. With this role assigned, the Role Center view
contains most tasks for handling day-to-day financial tasks.
{% endhint %}
```

### Danger (red) - warnings and constraints

```markdown
{% hint style="danger" %}
You cannot add lines to a batch after sending an approval request until the
batch is approved and posted.
{% endhint %}
```

### When to use each

- **info**: Clarifications, alternative behavior, prerequisite context
- **success**: Best practices, recommended approaches, subscription info
- **danger**: Critical constraints, breaking changes, version compatibility warnings

### Placement rules
- After introduction paragraphs for prerequisites/context
- Within procedures for step-specific warnings
- After procedures for tips about the result
- Keep to 1-3 sentences; if longer, it's probably regular content

### Canonical syntax

Always use `{% hint style="..." %}`. A few older articles use GitHub-style alerts
(`> [!NOTE]`, `> [!IMPORTANT]`); do **not** introduce these in new content — they are legacy
and `{% hint %}` is the house standard.

---

## 6. Links and Cross-References

### Internal article links

```markdown
[Setting up bank accounts](@CB-37)
[Payment statuses](@CB-111)
[The advanced payment suggestion option](@CB-145)
```

### Section anchor links

```markdown
[View communication settings](@CB-49#view-communication-settings)
[To request production access](#to-request-production-access)
```

### External links

```markdown
[Continia PartnerZone](https://partnerzone.continia.com/)
[ABN AMRO Developer Portal](https://developer.abnamro.com/)
```

### When to use external vs internal links

**Internal `@CB-###` is the default.** Use it for everything that lives inside the Continia
Banking documentation set. Never link to another doc article with a raw URL.

**Use an external link only when the target is outside the docs set.** Typical, legitimate cases:

| Use an external link for... | Example |
|-----------------------------|---------|
| Bank / provider developer portals and onboarding pages | `[ABN AMRO Developer Portal](https://developer.abnamro.com/)`, `[Danske Bank Erhverv website](https://danskebank.dk/erhverv)` |
| Microsoft Business Central / Learn documentation | `[Update currency exchange rates (Microsoft article)](https://learn.microsoft.com/...)` |
| Continia PartnerZone / Zendesk (partner-only resources) | `[this page](https://continia.zendesk.com/hc/...)` — always note "(only available to partners)" |
| Continia marketing / pricing pages | `[Continia Pricing](https://www.continia.com/pricing/)` |
| Payment Service Provider docs | `[Settlement details report](https://docs.adyen.com/...) article on Adyen Docs` |
| Standards bodies / specs / concept references | `[Extended SEPA Character Set](https://www.europeanpaymentscouncil.eu/...)` |

Phrase Microsoft links with the "(Microsoft article)" suffix in the link text. Flag
partner-only resources explicitly. Prefer an internal `@CB-###` article over an external link
whenever the same information exists inside the docs set.

### Cross-reference phrasing

Use these patterns to introduce links:

```
For more details, see [Link text](@CB-###).
For more information on [topic], read the [Link text](@CB-###) article.
To learn more about [topic], refer to the [Link text](@CB-###) article.
See [Link text](@CB-###) for more information.
```

### Related information section

Always at the end, before any `<style>` blocks:

```markdown
## Related information

[Article 1](@CB-###)
[Article 2](@CB-###)
[Article 3](@CB-###)
```

Links are separated by line breaks (two trailing spaces or blank lines). No bullets.

---

## 7. Tables

### Two-column field reference table

```markdown
| Field | Description |
| ----- | ----------- |
| CSV Separator | Enter the separator type used in the CSV file. |
| Delimiter | Delimiters are used when field values contain the separator character. |
| Date Format | Enter the date format used in the CSV file. |
```

### Three-column credential/info table

```markdown
| Item | Description | Location |
| ---- | ----------- | -------- |
| TLS certificate | .crt file containing the TLS certificate. | Received from the certificate provider. |
| Private key | .txt file containing the private key. | Received from the certificate provider. |
```

### Changelog table

```markdown
| Functional Area | Description | ID |
| --------------- | ----------- | -- |
| General Application | Scanning for unverified bank accounts is now significantly faster. | 75520 |
| Payment Export | Fixed an issue where payment files were not exported correctly. | 74625 |
```

### Status/feature table

```markdown
| Status | Description |
| ------ | ----------- |
| Amount Adjusted | The bank has finalized the payment with a different amount. |
| Approved | The payment has been approved by the designated approver. |
| Exported to file | Payment exported manually; final status for manual communication. |
```

### Table column width styling

Add at the bottom of the article when tables need column width control:

```html
<style>
 .content table tr td:nth-child(1) {
 width: 220px;
 }
 .content table tr td:nth-child(2) {
 width: 580px;
 }
</style>
```

### Footnotes in tables

```markdown
| File format<a href="#footnote-1"><sup>1</sup></a> | Used for |
| --- | --- |
| ISO PAIN.001 | Sending payments from the **Payment Journal**. |

<small style>
<div class="footnotes">
  <hr />
  <ol>
    <li id="footnote-1">Footnote text here.</li>
  </ol>
</div>
</small>
```

---

## 8. Vocabulary and Phrasing

### Action verbs for instructions

| Verb | When to use |
|------|-------------|
| Search | Opening a page via search: `Search ({{search}}) for and select` |
| Select | Choosing an item from a list or dropdown |
| Click | Pressing a button: `Click **OK**`, `Click **Next**` |
| Enter | Typing a value into a field |
| Go to | Navigating to a specific field or page section |
| Fill in | Completing multiple fields |
| On the action bar, select | Accessing menu actions |

### Descriptive verbs for link descriptions

- "overview of..." / "general overview of..."
- "step-by-step instructions for..."
- "guidance on..."
- "learn how to..."
- "describes exactly what..."
- "explains how to..."

### Prerequisite phrasing

```
The lines must have the status *Valid* before you can send them for approval.
You can only send or export payment lines with the status *Valid* or *Approved*.
Before creating a direct debit payment suggestion, you need to enable the feature.
```

### Conditional phrasing

```
Depending on your bank, additional steps may be required.
If a bank statement imports but does not appear, the account may not match.
Optionally, you can use templates to save specific filter settings.
```

### Consequence/result phrasing

```
The line status changes to *Pending Approval*.
The status will be updated to *Sent* for exported payments.
After you've set up the bank account, the status will be set to *Ready*.
```

### Include directives

For shared content blocks:
```
{{include "template-name" "Banking"}}
```

### Template variables

- `{{search}}` - renders as search icon
- `{{checkmark}}` - renders as a checkmark symbol in tables

---

## 9. TOC File Format

Plain text file named `toc.txt` in each directory.

**Format:** `filename | Display Name` (one entry per line)

```
Overview.md | Overview
Setting up payment export.md | Setting up payment export
Managing payments | Managing payments
Payment Approval | Security
```

**Rules:**
- `.md` files include the extension
- Directories do NOT include an extension
- Display names can differ from filenames
- One blank line at end of file
- Order determines navigation order

---

## 10. Sentence Patterns

### Introduction patterns

**Problem statement (for conceptual articles):**
> Reconciling book entries with bank statements is an essential task in financial management, but it can also be demanding.

**Capability statement (for feature articles):**
> Continia Banking offers multiple options for exchanging financial data between your bank and Business Central.

**Enhancement statement (comparing to standard BC):**
> Continia Banking enhances the standard direct debit functionality in Business Central by enabling users to view and manage customer direct debit suggestions.

**Scope statement (for overview/index):**
> This overview article guides you to the resources available for using the **Payment Reconciliation Journal**.

**Developer audience statement:**
> This section provides guidance for developers, IT consultants, and technically minded users who want to customize or extend Continia Banking.

### Closing/transition patterns

> For more details, see [article](@CB-###).
> To learn more about [topic], refer to the [article](@CB-###) article.
> Once enabled, the system will prefill related fields during payment processing.
> This action can be reversed on the **Bank Transactions** page.

---

## 11. Images, Media, and Template Variables

### Screenshots and images

```markdown
![Alt text describing the screenshot](/images/CB/filename.png)
```

- Image files live under `/images/CB/` (the Continia Banking image folder).
- Always provide meaningful alt text.
- Reference UI icons inline with template variables, not images, where one exists
  (e.g. `{{search}}` for the search icon).

### Video embeds

```markdown
{% embed url="https://player.vimeo.com/video/1060111157?h=..." %}
```

Use for walkthrough/overview videos, typically near the top of overview or onboarding articles.

### Template variables

- `{{search}}` - renders as the search icon, used in `Search ({{search}}) for and select ...`.
- `{{checkmark}}` - renders as a checkmark symbol, used in capability/feature tables.

### Include directives

For shared, reused content blocks:

```markdown
{{include "template-name" "Banking"}}
```
