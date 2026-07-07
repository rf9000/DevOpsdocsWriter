# Supplement to the Style Guide

**Precedence:** `style-guide.md` (the agent-optimized Continia Docs style guide) is the authoritative base. This file adds docs-site **mechanics** and **corpus-derived templates and verbatim examples** on top of it. On any conflict, `style-guide.md` wins — except for items marked **[SITE]**, which describe how the Continia docs pipeline technically works and are authoritative regardless of the base guide.

**Products:** the mechanics below are product-parameterized via the base guide's product prefix table (§1): `[PREFIX]` is `CB` for Continia Banking, `DC` for Document Capture, `EM` for Expense Management, and so on. The templates and verbatim examples come from the Continia Banking corpus (the pipeline's first product); other products follow the same shapes with their own prefix and naming rules (base guide §5.5).

**Corpus caution:** the verbatim examples below are copied from the published corpus. They illustrate *structure and formatting*; some predate the base guide's grammar rules (they may contain "will", "once", or non-clause-first cross-references). When drafting new text, the base guide's grammar and vocabulary rules (§9 there) always win over phrasing seen in a corpus example.

## How this file maps to the base guide's GAP markers

| Base guide gap | Filled by |
|---|---|
| §2.2 procedural verbatim example | [Setup/how-to articles](#setuphow-to-articles) |
| §2.3–2.4 conceptual/overview verbatim example | [Conceptual articles](#conceptual-articles), [Overview articles](#overview-articles) |
| §2.5 reference verbatim example | [Changelog articles](#changelog-articles) (closest reference-type corpus) |
| §2.7 FAQ title pattern + example | [FAQ articles](#faq-articles) — corpus uses "[Topic] FAQ" |
| §4 procedure block verbatim example | [Procedure patterns](#procedure-patterns) |
| §6 callout verbatim example | [Callout placement](#callout-placement-and-length) |
| §7 Related information example | [Related information section](#related-information-section) |
| §8.1 reference table example | [Table patterns](#table-patterns) |
| §11.5 include syntax | [Includes](#includes-site) — the site currently uses `{{include}}` **[SITE]** |
| §2.6 walkthrough example | No walkthrough exists in the corpus yet — follow the base guide's structure if one is needed |

---

## Frontmatter — site specifics

- `id`: `[PREFIX]-###` using the product's prefix from the base guide §1 (e.g. `CB-130` for Continia Banking). Must be unique across that product's documentation set; pick the next unused number. **[SITE]**
- `lang`: always `en` for this pipeline.
- Field order: `title`, `date`, `description`, `id`, `lang`.
- `description` convention in the corpus: starts with "Learn how to..." or plainly states what the article covers ("How to enable...").
- **Use the ` ```meta ` fence, never a `--- ... ---` YAML block.** Older corpus articles still use `---`; they are mid-migration. Reading a sibling for tone does NOT license copying its legacy `---` block or field order. Emitting a `---` block in a new article is a defect, even though the validator currently tolerates `---` during the migration. **[SITE]**

---

## Repo-specific drafting rules

### Proportionality — match the article to the size of the change

The article's length must track the size of what changed, not fill a template. **A small change gets a small article.** When the brief gives a change magnitude (the `docs-article-generator` passes one), let it cap the depth:

| Magnitude | Write |
|-----------|-------|
| **Minor tweak** (a couple of new fields, a toggle) | One tight section: a short intro + a single procedure. No "how it works" explainer, no reference table unless the field list itself needs one, at most one hint. |
| **Workflow improvement** | The changed flow only — do not re-document the surrounding feature. |
| **New feature / module** | Full structure as the feature warrants. |

Anti-filler rules:

- The number of sections should track the number of things the user actually has to **understand or do**. If a section restates the intro or explains mechanics the user does not act on, cut it.
- Do not invent explainer sections, comparison tables, or extra `{% hint %}` boxes to make a thin change look substantial.
- Prefer one precise sentence over a paragraph of generic framing.

### Impact in the introduction — only when sourced

Introductions frame business value (problem solved, when it is useful) **before** mechanics — but only when that value is actually known. The *why/when/before-vs-after* is **not** in the code; it comes from the work item, comments, or PR (the brief supplies it).

- When the impact is sourced, lead with it: the problem, then what the user can now do.
- When it is **not** sourced, keep the intro minimal (what the feature does and where) rather than manufacturing a plausible-sounding rationale. Inventing a "why" is filler and can be wrong.
- Never assert a before/after the brief did not give you. Unknown impact is flagged for a human (the generator surfaces it to the author/SME), not written into the article as fact.

---

## Article templates (from the Banking corpus)

Article-type selection rules live in the base guide (§2). The templates below show how each type is realized in the published corpus (Banking examples; substitute the product's prefix and naming rules for other products). A larger feature often needs more than one article: a conceptual article (what/why) plus one or more setup/how-to articles (configure/use), linked from an overview. When in doubt, split rather than mixing concept and procedure in one page.

### Setup/how-to articles

**Title pattern:** "Setting up [feature] in [Solution name]" or "[Verb]ing [object]" — append the solution name when the topic needs disambiguation, and follow the base guide §5.5 for which solutions keep "Continia" in the title (Continia Banking and Continia Finance always do).

````markdown
```meta
title: Setting up [feature] in [Solution name]
date: DD-MM-YYYY
description: Learn how to configure [feature] in [Solution name].
id: CB-[number]
lang: en
```

# Setting up [feature]

[1-2 paragraph introduction explaining what the feature does and why it matters — see "Impact in the introduction" above.]

{% hint style="info" %}
[Optional: Important prerequisite or contextual information.]
{% endhint %}

## To configure [feature]

[Optional: 1-2 sentence context about when or why to do this.]

1. Search ({{search}}) for and select **[Page Name]**.

2. On the **[FastTab Name]** FastTab, fill in the following fields:
   * **[Field Name]** - [explanation of what to enter and why].
   * **[Field Name]** - [explanation of what to enter and why].

3. On the action bar, click **[Menu]** > **[Action]**.

4. Click **OK** to save the settings.

## To [second task]

[Context paragraph.]

1. [Step 1]
2. [Step 2]

{% hint style="success" %}
[Optional: Best practice tip related to this task.]
{% endhint %}

## Related information

[Related article 1](@CB-###)
[Related article 2](@CB-###)
````

**Verbatim corpus example (from Setting up direct debit):**

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
suggestions when processing direct debits.
```

**Key considerations pattern** — some setup articles open with a "Key considerations" section:

```markdown
## Key considerations

* **Mandatory fields** - fields marked with a red asterisk (*) must be completed to prevent errors.
* **Notifications** - if any settings are missing or incorrect, notifications appear on the reconciliation page.
* **Don't change default rules** - [default rules](@CB-284) can't be deleted, only disabled.
* **Always test a rule** - before using a rule in production, test it first.
```

### Overview articles

Per the base guide (§2.4): write an overview only when the folder is complex enough to need orientation; the ToC entry is named `Overview`, but the article **title never uses the word "Overview"** — use the folder name or "Setting up [solution name]". The corpus structure of an overview is a sectioned link list:

````markdown
```meta
title: [Folder name / Setting up [feature] in [Solution name]]
date: DD-MM-YYYY
description: [Brief description of what this section covers.]
id: CB-[number]
lang: en
```

# [Folder name]

[1-2 sentence intro explaining what this section covers and who it's for.]

## To get started

[Brief intro sentence.]

* [Article title](@CB-###) - [brief description of what that article covers].

## To [verb] [object]

[Brief intro sentence.]

* [Article title](@CB-###) - [description, starts with a lowercase phrase: "overview of...", "step-by-step instructions for...", "guidance on..."].
* [Article title](@CB-###) - [description].
````

**Verbatim corpus example (body structure, from the Payment Reconciliation Journal overview — note its legacy `# Overview` H1 predates the current title rule):**

```markdown
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
```

### Conceptual articles

**Title pattern:** gerund or "Understanding [topic]" per the base guide (§2.1/§2.3), with "in [Solution name]" appended when the topic needs disambiguation. Do not include numbered procedure steps in a conceptual article; link to a separate procedural article instead (numbered lists that enumerate *options or categories* are fine).

````markdown
```meta
title: Understanding [topic] in [Solution name]
date: DD-MM-YYYY
description: [Brief description of the concept.]
id: CB-[number]
lang: en
```

# Understanding [topic]

[1-3 paragraph introduction. Start with the business problem or context.
Explain what the feature achieves. Mention how it differs from or enhances
standard Business Central functionality.]

## [Concept category 1]

[Explanation. Can use numbered lists for options/categories:]

1. **[Option A]** - [description with link to detail article](@CB-###).
2. **[Option B]** - [description with link](@CB-###).

## [Concept category 2]

[Deeper explanation of the feature's mechanics.]

* **[Term]** - [definition/explanation].
* **[Term]** - [definition/explanation].

## Related information

[Related article 1](@CB-###)
[Related article 2](@CB-###)
````

**Verbatim corpus example (from Bank communication):**

```markdown
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
Setup** page. On the **Bank Account Card** page, on the action bar, click
**Related** > **Communication Setup**.
```

### Bank onboarding articles

Article type specific to the Banking product (not in the base guide). **Title pattern:** "Onboarding [Bank Name]" or "Onboarding through [Provider]".

````markdown
```meta
title: Onboarding [Bank Name] for [Solution name]
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

* [Requirement 1 - e.g. agreement type needed]
* [Requirement 2 - e.g. portal access]
* For general setup instructions, see [Setting up bank accounts](@CB-37).

## To [first setup task]

[Context paragraph if needed.]

1. [Step 1]
2. [Step 2]

{% hint style="info" %}
[Bank-specific note or timing information.]
{% endhint %}

## To establish direct communication in [Solution name]

To set up direct communication, you need the following information:

| Item | Description | Location |
| ---- | ----------- | -------- |
| [Credential 1] | [What it is and format] | [Where to obtain it] |
| [Credential 2] | [What it is and format] | [Where to obtain it] |

[Instructions for entering credentials in Business Central.]

## Related information

[Related bank article](@CB-###)
[Setting up bank accounts](@CB-37)
````

### Changelog articles

The base guide defers changelogs to a separate guide that does not exist yet — these corpus rules are the operative spec. **Title pattern:** "Detailed Changelog for [Solution name] [Year] [Release]".

````markdown
```meta
title: Detailed Changelog for [Solution name] [Year] [Release]
date: DD-MM-YYYY
description: Changelog containing an overview of all new updates, features, and hotfixes for [Solution name] [Year] [Release]
id: CB-[number]
lang: en
```

# Detailed changelog for [Solution name] [Year] [Release]

{% hint style="danger" %}
[Solution name] [Year R#] supports the following version of Microsoft Dynamics 365
Business Central: Business Central [Year R#] (v##).
{% endhint %}

{% hint style="success" %}
As a Continia partner, we can notify you of new [Solution name] versions and
service packs whenever we release them. To sign up for this service, go to
[this page](https://continia.zendesk.com/hc/en-us/articles/...) in the Continia
PartnerZone (only available to partners).
{% endhint %}

## [Solution name] [Year R#], Service Pack [#], hotfix [#]

*Release date online: [Month Day, Year]*
*Release date, on-premises: [Month Day, Year or "pending"]*
*[Solution name] version: [X.Y.Z]*

### New or changed functionality

| Functional Area | Description | ID |
| --------------- | ----------- | -- |
| [Area] | [Business-focused description of the change] | [5-digit ID] |

### Bug fixes

| Functional Area | Description | ID |
| --------------- | ----------- | -- |
| [Area] | [Description of what was fixed] | [5-digit ID] |
````

**Key rules for changelogs:**
- Release dates use "Month Day, Year" format (e.g. "March 16, 2026") — consistent with the base guide's body-text date rule, NOT the DD-MM-YYYY frontmatter format.
- Version format: Major.Minor.Patch (e.g. 27.5.4).
- Functional areas are product-specific; the Banking corpus uses "General Application", "Payment Export", "Payment Import", "CSV Import", "Payment Method".
- Descriptions are business-focused, not technical.
- Multi-line descriptions use `<br />` within table cells.
- ID is a 5-digit number.

### FAQ articles

FAQ selection/placement rules live in the base guide (§2.7). Corpus realization — **title pattern:** "[Topic] FAQ":

- Each question is an H2 heading, phrased in natural language (not "Q: ...").
- No "Answer:" prefix — content follows directly, 1-3 paragraphs (or numbered steps if procedural).
- Conversational tone, still professional.
- Link to detailed articles rather than duplicating content.

---

## Procedure patterns

Base rules (context before steps, "To + infinitive" opener, provide the UI path, numbered steps) live in the base guide §4. Corpus specifics:

### Step wording conventions

- Start each step with an action verb: "Search", "Go to", "Select", "Enter", "Click", "On the".
- First step navigating to a page: `Search ({{search}}) for and select **[Page Name]**.`
- Menu actions: `On the action bar, click **[Menu]** > **[Action]**.`
- Field navigation: `Go to the **[Field]** field`.
- Multiple fields: "fill in the following" / "enter the following".
- Buttons: `Click **OK**`, `Click **Next**`.

### Alternative access pattern

When a feature can be reached multiple ways:

```markdown
Search ({{search}}) for and select **Search rules**. Alternatively, on the
**Bank Account Reconciliation** or **Payment Journal Reconciliation** page,
select the bank statement line, and on the action bar, click **Rules** > **Add Search Rule**.
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
8. Click **Finish**. After you set up the bank account, the status in the
   **Bank Accounts** overview is set to *Ready*, and the bank account
   is ready for use.
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

## UI formatting additions

- **Status and state values are italic**: *Valid*, *Pending Approval*, *Ready*, *Imported*. (The base guide has no italics rule; this is the corpus convention.)
- Generic terms stay plain: "field", "page", "option", "column"; product names are plain text (e.g. "Continia Banking", "Business Central").

---

## Callout placement and length

Callout types, semantics, and syntax follow the base guide §6 (four types: `info`, `danger`, `warning`, `success`). Corpus additions:

**Placement:**
- After introduction paragraphs for prerequisites/context.
- Within procedures for step-specific warnings (mind the base guide's indentation rule for callouts inside lists).
- After procedures for tips about the result.

**Length:** keep to 1-3 sentences; if longer, it is probably regular content.

**Verbatim corpus example:**

```markdown
{% hint style="info" %}
In the **Bank Acc. Reconciliation** page, imported descriptions appear in the
**Description** field. In the **Payment Reconciliation Journal**, they appear
in the **Transaction Text** field.
{% endhint %}
```

---

## Links and cross-references — site mechanics

### Internal article links [SITE]

Internal links use the `@[PREFIX]-###` id form (the target article's `id`), never a raw URL or file path:

```markdown
[Setting up bank accounts](@CB-37)
[Payment statuses](@CB-111)
```

Section anchors:

```markdown
[View communication settings](@CB-49#view-communication-settings)
[To request production access](#to-request-production-access)
```

### When to use external vs internal links

**Internal `@[PREFIX]-###` is the default.** Use it for everything inside the product's documentation set. Use an external link only when the target is outside the docs set:

| Use an external link for... | Example |
|-----------------------------|---------|
| Bank / provider developer portals and onboarding pages | `[ABN AMRO Developer Portal](https://developer.abnamro.com/)` |
| Microsoft Business Central / Learn documentation | `[Update currency exchange rates](https://learn.microsoft.com/...) (Microsoft article)` |
| Continia PartnerZone / Zendesk (partner-only resources) | `[this page](https://continia.zendesk.com/hc/...)` — always note "(only available to partners)" |
| Continia marketing / pricing pages | `[Continia Pricing](https://www.continia.com/pricing/)` |
| Payment Service Provider docs | `[Settlement details report](https://docs.adyen.com/...) article on Adyen Docs` |
| Standards bodies / specs / concept references | `[Extended SEPA Character Set](https://www.europeanpaymentscouncil.eu/...)` |

Append "(Microsoft article)" to Microsoft links and flag partner-only resources explicitly (base guide §7.1). Prefer an internal `@[PREFIX]-###` article over an external link whenever the same information exists inside the docs set.

### Cross-reference phrasing

Reference clauses come **before** the instruction (base guide §7.2). Corpus patterns that comply:

```
For more details, see [Link text](@CB-###).
For more information on [topic], read the [Link text](@CB-###) article.
To learn more about [topic], refer to the [Link text](@CB-###) article.
```

### Related information section

Always at the end of the article, before any `<style>` blocks:

```markdown
## Related information

[Article 1](@CB-###)
[Article 2](@CB-###)
[Article 3](@CB-###)
```

Links are separated by line breaks. No bullets. Use the product's own prefix in the targets. (Continia Learn links never go here — base guide §7.1.)

---

## Table patterns

### Two-column field reference table

```markdown
| Field | Description |
| ----- | ----------- |
| CSV Separator | Enter the separator type used in the CSV file. |
| Delimiter | Delimiters are used when field values contain the separator character. |
```

### Three-column credential/info table

```markdown
| Item | Description | Location |
| ---- | ----------- | -------- |
| TLS certificate | .crt file containing the TLS certificate. | Received from the certificate provider. |
| Private key | .txt file containing the private key. | Received from the certificate provider. |
```

### Status/feature table

```markdown
| Status | Description |
| ------ | ----------- |
| Amount Adjusted | The bank has finalized the payment with a different amount. |
| Approved | The payment has been approved by the designated approver. |
```

### Table column width styling [SITE]

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

### Footnotes in tables [SITE]

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

## TOC file format [SITE]

Plain text file named `toc.txt` in each directory. **Format:** `filename | Display Name` (one entry per line):

```
Overview.md | Overview
Setting up payment export.md | Setting up payment export
Managing payments | Managing payments
Payment Approval | Security
```

**Rules:**
- `.md` files include the extension; directories do NOT include an extension.
- Display names can differ from filenames.
- One blank line at end of file.
- Order determines navigation order (sort by whatever order best serves the reader — base guide §2.4).

---

## Images, media, and includes — site specifics

### Images [SITE]

```markdown
![Alt text describing the screenshot](/images/CB/filename.png)
```

Image files live under `/images/[PREFIX]/` — the product's image folder (`/images/CB/` for Banking). Alt text, PNG format, screenshot-avoidance, and filename rules are in the base guide §11.1.

### Video embeds

```markdown
{% embed url="https://player.vimeo.com/video/1060111157?h=..." %}
```

Typically near the top of overview or onboarding articles.

### Includes [SITE]

The docs pipeline currently uses the legacy include directive for shared, reused content blocks; the second argument is the solution name:

```markdown
{{include "template-name" "Banking"}}
```

The base guide §11.5 documents the GitBook `{% file src="..." %}...{% endfile %}` form; that applies after the GitBook migration. Until then, use `{{include}}`.

### Template variables

- `{{search}}` — search icon, used in `Search ({{search}}) for and select ...`.
- `{{checkmark}}` — checkmark symbol, used in capability/feature tables.

(Full icon list in the base guide §11.4.)

---

## Phrasing bank (from the corpus)

Corpus phrasing patterns for common moments (base guide grammar rules win — present tense, no "once" as a time word). Examples are from the Banking corpus; the patterns generalize:

### Descriptive verbs for link descriptions

"overview of..." / "step-by-step instructions for..." / "guidance on..." / "learn how to..." / "describes exactly what..." / "explains how to..."

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
The status is updated to *Sent* for exported payments.
After you set up the bank account, the status is set to *Ready*.
```

### Introduction patterns

**Problem statement (conceptual):**
> Reconciling book entries with bank statements is an essential task in financial management, but it can also be demanding.

**Capability statement (feature):**
> Continia Banking offers multiple options for exchanging financial data between your bank and Business Central.

**Enhancement statement (vs standard BC):**
> Continia Banking enhances the standard direct debit functionality in Business Central by enabling users to view and manage customer direct debit suggestions.

**Scope statement (overview):**
> This overview article guides you to the resources available for using the **Payment Reconciliation Journal**.

**Developer audience statement:**
> This section provides guidance for developers, IT consultants, and technically minded users who want to customize or extend Continia Banking.
