# Continia Documentation Style Guide (Agent Reference)

This file is a machine-optimized reference for the Continia docsWriter agent. It is generated from the human-written Continia Docs style guide and re-compiles the same rules as deterministic instructions, so the agent can apply them without judgment calls. The human guide is the source of truth for style. Scope: Docs articles for all Continia products. Changelogs and UI copy have dedicated style guides that are not part of this file.

Rule keywords: "Use X" and "Do not use Y" are mandatory. "Exception" states the only condition that overrides a rule. Examples labeled **Example:** are illustrative. No example in this file is quoted from published articles.

<!-- GAP: the human guide states that dedicated style guides exist for changelogs and UI copy; neither was supplied, and the "Detailed changelog" section of the human guide contains only placeholder text -->

## Table of contents

1. [Frontmatter and file structure](#1-frontmatter-and-file-structure)
2. [Choosing the article type and applying its template](#2-choosing-the-article-type-and-applying-its-template)
3. [Introductions, goals, examples, and scenarios](#3-introductions-goals-examples-and-scenarios)
4. [Writing procedures](#4-writing-procedures)
5. [Formatting references to the UI](#5-formatting-references-to-the-ui)
6. [Callouts](#6-callouts)
7. [Links and cross-references](#7-links-and-cross-references)
8. [Tables, lists, footnotes, and HTML](#8-tables-lists-footnotes-and-html)
9. [Vocabulary, grammar, and phrasing](#9-vocabulary-grammar-and-phrasing)
10. [Sentence-pattern library](#10-sentence-pattern-library)
11. [Images, media, icons, files, and variables](#11-images-media-icons-files-and-variables)

---

## 1. Frontmatter and file structure

### 1.1 File skeleton

Emit every article in this order.

````markdown
---
vars:
  [variable_name]: [variable value]
---
# [filename-in-lowercase-with-hyphens]

```meta
title: [metadata title]
date: [dd-mm-yyyy]
description: [one short sentence]
id: [PREFIX]-###
lang: en
```

## [Article title in sentence case]

[Introduction]

### [First-level heading]

#### [Second-level heading or procedure heading]
````

Rules:

1. Emit the `vars` block (the `---` YAML block) only when the article includes reusable content that needs a variable (see section 11.7). Otherwise omit it. When present, it goes above the filename line.
2. The filename line is an h1, in lowercase, with hyphens instead of spaces. It sits above the meta block.
3. The meta block uses a fence labeled `meta`.
4. The article title is an h2.
5. Use h3 for first-level headings and h4 for headings nested under an h3.
6. Do not skip heading levels.

<!-- CONFLICT: human guide gives two heading conventions (Typora/markdown source: filename h1, title h2, headings h3-h4; GitBook UI: filename as title, title h1, headings h2-h3); the agent writes markdown files, so the Typora/markdown-source convention is applied - human review needed -->

**Example:**

```markdown
# basic-concepts-in-expense-management

## Basic concepts in Expense Management
### Working with documents
#### To import a document
```

### 1.2 Titles and headings

| Rule | Instruction | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Case | Use sentence case for the title and every heading. Proper nouns and UI names keep their own capitalization. | Understanding data responsibility in Continia Banking | Understanding Data Responsibility In Continia Banking |
| Procedure headings | Start with "To" plus a verb. | To apply entries for a customer association | Applying entries |
| Metadata title | Make it identical to the article title. Exception: append "in [solution name]" to the metadata title when the article title does not name the solution. | Title: Enhanced line recognition. Metadata title: Enhanced line recognition in Document Capture | Metadata title unrelated to the article title |
| Shared titles | If the same title applies to other solutions, include "in [solution name]" in the article title and the metadata title. | Requesting events and external functions in Continia Expense Management | Requesting events and external functions |
| "Continia" in titles | Default: omit "Continia" before the solution name. Exception: always write Continia Banking, Continia Finance, and Continia Delivery Network in full. Add "Continia" to other names only when the title stays short. | Enhanced line recognition in Document Capture | n/a |

<!-- GAP: human guide says to add "Continia" in titles "when there is enough space" without giving a length threshold -->

<!-- CONFLICT: human guide says in one place the metadata title "may" add "in [solution name]" and in another that a shared title "includes" the solution name; both are applied as separate conditions above - human review needed -->

### 1.3 Metadata fields

| Field | Rule | Example |
|---|---|---|
| `title` | Sentence case. See 1.2. | Requesting events and external functions in Continia Expense Management |
| `date` | Date the article was last updated and published. Format dd-mm-yyyy. This is the only place where this date format is used. | 31-12-2025 |
| `description` | One short sentence stating what the article is about. The first-mention full-name rule (section 9.4) does not apply here. | How to request external functionality and events that are currently missing. |
| `id` | `[PREFIX]-###`, uppercase prefix. See 1.4. | CB-123 |
| `lang` | Two-letter language code: Danish `da`, English `en`, German `de`. Use `en` for English articles. | en |

<!-- GAP: the human guide gives one description example only; the per-type description patterns in section 2 are derived from it and from each type's purpose -->

### 1.4 IDs and product prefixes

Rules:

1. Every article has an ID in its meta block.
2. IDs are sequential per product: the next article takes the next number (DO-145 follows DO-144; EM-76 follows EM-75).
3. Use the ID supplied in the task input. Do not invent an ID. If none is supplied, leave `[PREFIX]-###` unchanged and flag it for a human.
4. IDs are uppercase in the meta block (`CB-123`) and lowercase in permalinks (`cb-134`).

<!-- GAP: the human guide says IDs come from the Article IDs sheet / Docs Dashboard, which the agent cannot read; confirm how the next ID is supplied to the agent -->

| Product | ID prefix | Permalink solution code | Example ID |
|---|---|---|---|
| Continia Document Capture | DC | `dc` | DC-262 |
| Continia Expense Management | EM | `em` | EM-262 |
| Continia Banking | CB | `cb` | CB-123 |
| Continia Finance | CF | <!-- GAP: permalink code and ID prefix for Continia Finance are not given in the human guide; CF is its abbreviation --> | n/a |
| Continia Document Output | DO | `do` | DO-262 |
| Continia Payment Management | PM | `pm` | PM-38 |
| Continia OPplus | COPP | `copp` | COPP-501 |
| Continia Collection Management | CM | `cm` | CM-1 |
| Continia Delivery Network | not given | not given | n/a |

<!-- GAP: ID prefix and permalink code for Continia Delivery Network and for modules (Continia Payment Approval) are not given in the human guide -->

---

## 2. Choosing the article type and applying its template

### 2.1 Decision table

| Situation | Article type | Title pattern | Title example |
|---|---|---|---|
| Reader must perform a task or achieve a business goal | Procedural | Gerund (-ing) of the task verb + object | Adding a payment service provider |
| Reader needs background, why, core principles, mental models | Conceptual | Gerund: "Understanding [concept]" or "Working with [concept]" | Working with payment service providers; Understanding Continia Core |
| Topmost article of a folder whose content is complex enough to need orientation | Overview (a conceptual article) | Name of the folder or an alternative. Never the word "Overview". | Setting up [solution name] |
| Reader needs a list of functions, properties, definitions, or specifications | Reference | Starts with a noun | Billing, consumption, and transactions |
| Several sequential, interdependent tasks achieve one broader goal | Walkthrough | `Walkthrough: [task in gerund form]` | Walkthrough: Setting up a new approval workflow |
| Frequently asked question with a detailed answer | FAQ | <!-- GAP: the human guide gives no title pattern for FAQ articles --> | n/a |
| Several related tasks that do not depend on each other | Procedural article with one `To ...` heading per task (not a walkthrough) | Gerund | Adding a payment service provider |
| Folder holds one standalone concept | No overview article | n/a | n/a |

<!-- CONFLICT: human guide gives the same title pattern ('ing' form) for procedural and conceptual articles; applied distinction: procedural = gerund of the action the reader performs, conceptual = "Understanding" or "Working with" - human review needed -->

Title rules:

- Do not put the article type in a label; express it through the title pattern.
- Reference titles starting with "The" or with a product name are valid when the next word is a noun (Continia Finance permissions; The Payment Management fields on the Vendor Card).

### 2.2 Procedural template

````markdown
# [filename]

```meta
title: [Gerund + object]
date: [dd-mm-yyyy]
description: How to [verb] [object].
id: [PREFIX]-###
lang: en
```

## [Gerund + object]

[Introduction: context and goal of the procedure, and why the reader performs it.]

### To [verb] [object]

To [verb] [object, reworded so it does not copy the heading]:

1. Search (<i class="fa-magnifying-glass">:magnifying-glass:</i>) for and select **[Page or list name]**.
2. On the **[FastTab name]** FastTab, in the **[Field name]** field, select [value].
3. [One action per step.]

### Related information

[Links to related articles.]
````

<!-- GAP: the human guide mentions a Related information section but does not define its heading level or format; h3 and a link list are assumed -->

Type rules: follow section 3 for the introduction and section 4 for the steps. When describing product functionality, write a procedure that shows what the reader uses the functionality for. Do not write a list of product features.

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.3 Conceptual template

````markdown
# [filename]

```meta
title: Understanding [concept]
date: [dd-mm-yyyy]
description: [One short sentence on what the concept is and why it matters.]
id: [PREFIX]-###
lang: en
```

## Understanding [concept]

[Introduction: what the concept is and why the reader finds the functionality useful.]

### [Core principle or mental model]

[Theoretical background in short paragraphs.]

### Related information

[Links to the procedural articles that apply the concept.]
````

Type rules: explain why the functionality is useful, then give the theoretical background, core principles, and mental models. Link to procedural articles instead of embedding step-by-step procedures.

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.4 Overview template

````markdown
# [filename]

```meta
title: [Name of the folder or alternative, without the word "Overview"]
date: [dd-mm-yyyy]
description: [One short sentence on what the folder covers.]
id: [PREFIX]-###
lang: en
```

## [Name of the folder or alternative]

[Introduction: orientation for the folder.]

### [Core concept, capability, or feature]

[Short description.] For more information, see [dedicated article title].
````

Type rules:

- Create an overview only when the folder content is complex enough to need orientation. Skip it for standalone, single-concept folders.
- The entry name in the table of contents (SUMMARY.md) is `Overview`.
- The title never contains the word "Overview". Use the folder name or an alternative (Setting up [solution name]; Continia Banking Import).
- Do not add a table that links to every article in the folder. Describe core concepts, capabilities, and features, and link to the dedicated article for each.

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.5 Reference template

````markdown
# [filename]

```meta
title: [Noun-led title]
date: [dd-mm-yyyy]
description: [One short sentence on what the reference lists.]
id: [PREFIX]-###
lang: en
```

## [Noun-led title]

The following table describes [what the table lists].

| [Column 1] | [Column 2] | [Column 3] |
|---|---|---|
| [Item] | [Detail] | [Detail] |
````

Type rules:

- Present detailed facts or specifications as a table or bulleted list. Use a table for more than five items or for comparisons (section 8.1).
- Release plan articles (title: `Release plan for [solution name]`): describe each update with a noun phrase or an -ing phrase so the sentence never becomes outdated. For every released feature, add a link to the article that describes it as the last line of that feature's body text.

**Example:**

```markdown
* Support for direct communication with [bank or service name]
* Displaying embedded PDF files in the Document Viewer

To learn more about the [Feature name] feature, see [article title].
```

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.6 Walkthrough template

````markdown
# [filename]

```meta
title: Walkthrough: [Task in gerund form]
date: [dd-mm-yyyy]
description: [One short sentence on the overall process.]
id: [PREFIX]-###
lang: en
```

## Walkthrough: [Task in gerund form]

[Short introduction: briefly outline the included procedures, state what the customer achieves, and state why it matters. Put scenario-based context here.]

* [Procedure 1 title]
* [Procedure 2 title]
* [Procedure 3 title]

### [Task 1 title]

[Introduction: what the task is and why it is needed.]

1. [One action per step.]
2. [One action per step.]

[Optional example after a relevant step. Keep examples separate from the numbered steps.]

### [Task 2 title]

[Introduction.]

1. [One action per step.]
````

Type rules:

- Use a walkthrough only for tasks that are sequential and contribute to one broader goal. If the tasks are related but not dependent on each other, write a procedural article with multiple headings.
- Use a walkthrough when the customer needs an end-to-end understanding, when multiple steps depend on each other to achieve a complete outcome, or when showing the why behind each step reinforces learning.
- List the procedures as bullets in the order they appear.
- Each task has a heading, an introduction (what and why), and numbered steps with one action each.

Decision for walkthroughs with five or more procedures:

| Situation | Use |
|---|---|
| Default | Group the procedures under subheadings |
| The process splits into self-contained stages | Break the content into multiple walkthroughs that reference each other |
| A procedure is reusable outside this walkthrough | Convert it into a standalone topic and link to it from a "related tasks" section |

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.7 FAQ template

````markdown
# [filename]

```meta
title: [FAQ title]
date: [dd-mm-yyyy]
description: [One short sentence on the questions covered.]
id: [PREFIX]-###
lang: en
```

## [FAQ title]

[Introduction: state the topic the questions cover.]

### [Theme]

#### [Question]

[Concise answer.] For more information, see [main article title].
````

<!-- GAP: the human guide gives no title pattern or heading structure for FAQ articles; the skeleton above is minimal and derived from the FAQ rules -->

Type rules:

| Situation | Action |
|---|---|
| Question is asked often and answered easily | Include it in an FAQ |
| Question is complex | Write a dedicated article instead of an FAQ entry |
| Error is caused by a customer action | Address it in the FAQ |
| Error is caused by a bug | Do not address it in the FAQ; it is reported through the existing support channels |

- Group questions by theme. Give a concise answer to each and link to the relevant main article.
- Link every question to an existing article. Do not include outdated information.
- Position the FAQ article last in its dedicated folder. Write more main articles than FAQ articles.
- Place the **Troubleshooting** and **FAQs** folders under the **Getting Started** section.
- Reference FAQ articles: `https://learn.microsoft.com/en-us/dynamics365/business-central/ui-search-filter-faq` (Microsoft) and `https://staging-docs.continia.com/en-us/continia-payment-management/business-functionality/reconciling-bank-accounts/reconciliation-faq` (Payment Management).

<!-- GAP: no verbatim example available — supply from corpus -->

---

## 3. Introductions, goals, examples, and scenarios

### 3.1 Introduction rules

| Rule | Instruction | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| State the goal | Open every article with its goal and its key learning points before any procedure. | "You can specify how to import bank account statements on the bank account card." | Starting directly with step 1 |
| Provide context | Put a context-and-goal introduction before the steps of every procedure. Readers skip sections, so the introduction carries the value. | An introduction paragraph, then `To ...:` | Heading, then numbered list |
| Never pre-announce | Do not mention a feature that is not yet developed or released. Exception: roadmap articles (Release plan). | "Support for direct communication with Eika" in a Release plan only | Mentioning an unreleased feature in a procedural article |
| Link instead of mentioning | When an existing article covers the content, link to it. Do not restate it. | "For more information, see Software lifecycle policy." | Copying the policy text |
| Conditional before instruction | Put the conditional clause before the instruction. | "For more information, see Software lifecycle policy." | "See Software lifecycle policy for more information." |
| Less is more | Delete adverbs, adjectives, and extra sections that the meaning does not need. | "Select the bank." | "Simply select the appropriate bank." |

### 3.2 Examples versus scenarios

| Content | Scope | Use it for | Pattern |
|---|---|---|---|
| Example | Narrow. One task or procedure. | Illustrating how to use one feature or function | Introduce with "For example," or "This is useful if, for example,". |
| Scenario | Broad. End-to-end use case with multiple steps, features, or user roles. | Showing how a customer achieves a broader goal | Name it as a scenario: Advanced approval scenarios; Four-eye approval scenarios |

**Example:**

```markdown
Occasionally, you may need to cancel all or part of an invoice that has already been issued. For example, a customer returned an item, or you made a mistake on the invoice and want to refund the customer the excessive amount.
```

Rules:

- Add an example or scenario when the concept is too complex to describe without one.
- In walkthroughs, put scenario-based context in the introduction and optionally as examples after relevant steps. Keep it separate from the procedural instructions.

### 3.3 Continia Learn

| Situation | Action |
|---|---|
| The Learn team covers the topic | Link from the article to the Learn module or lesson. |
| Where the link goes | Use an in-sentence, descriptive link. Never add it under **Related information**. |

**Example:**

```markdown
For more information on this, including a practical scenario, see the [Continia Learn](https://learn.continia.com/) unit on [delegating expense user tasks](https://learn.continia.com/module/set-up-users-in-EM/delegate-expense-user-tasks).
```

---

## 4. Writing procedures

### 4.1 Rules

| Rule | Instruction | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Introduction | Before the steps, write an introduction stating the context and goal. | See the example in 4.2 | Heading followed directly by steps |
| Lead-in sentence | Introduce the steps with a "To + infinitive" sentence or fragment ending with a colon. Reword it so it does not copy the heading. | "To select the bank account statement import method:" | Repeating the heading verbatim |
| Provide the path | Name the location of every field or element, not only the action. | "In the **Import Payments** dialog box, in the **PSP Agreement** field, select the PSP agreement you want to import payments for." | "Select the PSP agreement." |
| Numbered list | Always number the steps. Limit a procedure to 9 steps; split longer tasks into two procedures under separate `To ...` headings. | `1.` `2.` `3.` | A bulleted list of steps |
| Single step | Use one bullet, not a numbered list. | `* Click **OK**.` | `1. Click **OK**.` |
| One action per step | Describe one action in each step. | "Click **Apply**." | "Click **Apply**, then close the page and reopen it." |
| Menu paths | Abbreviate simple sequences with `>`. Put a space before and after each `>`. Do not bold the `>`. Do not use `>` for paths in a folder structure. | "Click **Accounts** > **Other accounts** > **Add an account**." | "Click **Accounts >Other accounts**" |
| Search opener | When a Business Central procedure starts by opening a page or list, write the Search pattern (section 10) as step 1. | "Search (<i class="fa-magnifying-glass">:magnifying-glass:</i>) for and select **Bank Account**." | "Go to Bank Account." |

### 4.2 Complete procedure block

**Example:**

````markdown
You can specify how to import bank account statements on the bank account card. Indicating whether to import for reconciliation and when to start the reconciliation determines how the statement is imported and handled in the Job Queue.

To select the bank account statement import method:

1. Search (<i class="fa-magnifying-glass">:magnifying-glass:</i>) for and select **Bank Account**.
2. Click a bank to open the **Bank** card.
3. On the **[FastTab name]** FastTab, in the **[Field name]** field, select [value].
````

<!-- GAP: no verbatim example available — supply from corpus -->

---

## 5. Formatting references to the UI

### 5.1 What gets bold

| Element | Format | Example |
|---|---|---|
| Names of pages, lists, cards, captions, cues, fields, buttons, and actions | Bold the unique name. Leave the generic type word ("page", "card", "FastTab", "dialog box", "window") plain. | On the **Import Payments** page; open the **Bank** card |
| From and To when they name a UI element | Bold | In the **From** field |
| Non-unique pages: FactBox, FastTab, document journal, document card | Plain, not bold, when written as the generic term | Open the document card. |
| Capitalization | Copy the capitalization of the UI label. | **Document Capture Setup**; **Posting Reconciliation Job Queue Setup**; **Expense Reminder Code** |
| UI label in all caps | Write it in sentence case, bold. Never write all caps. | **Document categories** (UI shows DOCUMENT CATEGORIES) |
| Codes (exception to the all-caps rule) | Keep the capitals. Bold a code when it is a UI value the reader selects or clicks. | Click the **PURCHASE** code. EMPL-RECON |
| Keyboard keys | `<kbd>` tags | Press <kbd>Enter</kbd> |
| Icons | HTML icon code (section 11.4) | <i class="fa-gear">:gear:</i> |
| `>` in menu paths | Plain | **Accounts** > **Other accounts** |
| Product and solution names | Plain (not UI elements) | Continia Document Capture |

<!-- CONFLICT: human guide says "use sentence case" for UI elements but also "follow the UI" and shows title-case examples; applied: copy the UI capitalization, convert only all-caps labels to sentence case - human review needed -->

<!-- CONFLICT: human guide says UI elements (including "cards") are bold but also that non-unique pages such as "document card" are not; applied: bold the unique name, leave the generic type word plain - human review needed -->

Rule for undocumented UI: if a feature has no tooltip, or the tooltip is unclear, write a short description of the UI element and add an example.

### 5.2 Interaction verbs

| Situation | Verb | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Button, link, or single UI element with a mouse or trackpad | click | Click **OK**. Click **Apply**. | Press **OK**. |
| Pick from a list, menu, or group of options | select | Select **Open in new tab**. Select a preset. | Click a preset from the list. |
| Decide between alternatives | choose | Choose your installation method. | Select your installation method. |
| Touch or stylus on a mobile device (Expense Management mobile app) | tap | Tap **Settings**. Tap **Notifications** to view updates. | Click **Settings** in the mobile app. |
| Type into a field | enter | In the search box, enter [text]. | Type in the search box. |
| Toggle | enable or disable | To keep all applied filters, enable the **Pass all filters** toggle. | Toggle **Pass all filters**. |
| Checkbox | select or clear | Select the **[Name]** checkbox. Clear the **[Name]** checkbox. | Check, tick, or deselect the checkbox. |

Rules:

- "Checkbox" is one word.
- Do not use "toggle" as a verb.
- Default verb for desktop and laptop UI interactions: click.
- Exception: Expense Management documentation of the Continia Expense Mobile App uses "tap".

### 5.3 Prepositions: in versus on

| UI container | Preposition | ✅ Correct |
|---|---|---|
| Field, box (any element where the reader enters data) | in | In the search box, enter [text]. |
| Window | in | In the **[Name]** window |
| Dialog box | in | In the **Save As** dialog box |
| Dropdown menu | in | In the **[Name]** dropdown menu |
| FactBox pane, FactBox | in | In the **[Name]** FactBox |
| Cue, cue group, action tiles | in | In the **[Name]** cue group |
| Action menu | in | In the **[Name]** action menu |
| FastTab | on | On the **[Name]** FastTab |
| Page | on | On the **[Name]** page |
| Card | on | On the **[Name]** card |
| Action bar | on | On the action bar |
| Toolbar, tab, taskbar, ruler, desktop, network, hardware platform, the Web | on | On the **Standard** toolbar |

<!-- CONFLICT: human guide says "on" for menus but also "in the dropdown menu" and "in" for action menu; applied: dropdown menu and action menu use "in", other menus use "on" - human review needed -->

<!-- CONFLICT: human guide says "in the Save As dialog box" but also shows "On the Import Payments dialog"; applied: dialog boxes use "in" - human review needed -->

### 5.4 Business Central element names

| Name | Description | Preposition |
|---|---|---|
| FastTab | Sections on task pages that collapse and expand. | on |
| FactBox pane | The section that appears when users click the i at the top right corner of a page. | in |
| FactBox | The individual elements in the FactBox pane with the grey background color. | in |
| Cue / Cue group / Action tiles | The elements on the Role Center page. | in |
| action bar | The section directly below the page or card title, where the action menus are. | on |
| action menu | The individual menus within the action bar. | in |

Write "action bar" and "action menu" in lowercase. Write "FastTab" and "FactBox" with the internal capital.

---

## 6. Callouts

### 6.1 Type selection

| Type | Alias | Use when | Syntax |
|---|---|---|---|
| `info` | Note | The information is something users take into account even when skimming | `{% hint style="info" %}` ... `{% endhint %}` |
| `danger` | Important | The information is crucial for users to succeed | `{% hint style="danger" %}` ... `{% endhint %}` |
| `warning` | none | The content demands immediate attention because of potential risks | `{% hint style="warning" %}` ... `{% endhint %}` |
| `success` | Tip | The information is optional and helps the user be more successful | `{% hint style="success" %}` ... `{% endhint %}` |

**Example:**

```markdown
{% hint style="info" %}
[Callout text.]
{% endhint %}
```

### 6.2 Rules

1. Use callouts sparingly so they keep their impact.
2. Do not place two or more callouts of the same type next to each other. Adjacent callouts must differ in type.
3. When stacking callouts, put an empty line between the end of the top callout and the start of the next.
4. Do not put tables, procedures, bullet points, or images inside a callout. Place them outside, so they do not distract from the main point.
5. When a callout sits inside an ordered or unordered list, put an empty line between the list item and the callout, and indent the callout to the list item's text. Wrong indentation breaks the numbering.

**Example:**

```markdown
1. First step.
2. Second step.

   {% hint style="info" %}
   [Callout text.]
   {% endhint %}
3. Third step.
```

<!-- CONFLICT: human guide says to avoid lists inside callouts, yet its considerations show lists inside callouts and contradict themselves on whether an ordered list inside an unordered list renders; applied: no lists inside callouts - human review needed -->

<!-- GAP: no verbatim example available — supply from corpus -->

---

## 7. Links and cross-references

### 7.1 Link form decision table

| Target | Link form | Suffix after the link | Example |
|---|---|---|---|
| Continia Docs article | Descriptive text naming the article | none | For more information, see [article title]. |
| Microsoft article | Descriptive text | `(Microsoft article)` | For more information, see [article title] (Microsoft article). |
| PDF document | Descriptive text | `(PDF)` | For more information, see [document name] (PDF). |
| GitBook documentation | Descriptive text | `(GitBook Docs)` | See [Reusable content] (GitBook Docs). |
| Other external page or non-webpage medium | Descriptive text | State the source or medium in parentheses | See [title] ([source or medium]). |
| Continia Learn module or lesson | In-sentence descriptive link | none | See section 3.3. Never under **Related information**. |

Rules:

- Never write "You can read more about this here" or "click here". Write "For more information, see [name of the article]."
- When linking to an article whose name exists in more than one solution, link to the article in the correct solution.
- Link to an existing article instead of restating its content.

<!-- GAP: the human guide does not specify the markdown link target syntax for internal articles (relative path, extension) -->

### 7.2 SUMMARY.md (table of contents)

- Within a summary file, never link to an article outside the summary's parent folder.
- Sort entries in the order that fits the folder: country lists alphabetically; **Getting Started** entries in the order in which each process is followed; any other folder in the order the reader works through it.
- The entry name for an overview article is `Overview`.

### 7.3 Permalinks

Syntax: `http://go.continia.com/docs/[language code]/[solution code]/linkid=[article ID]`

- `[language code]`: `en-us` for English articles.
- `[solution code]` and `[article ID]`: lowercase, from the table in section 1.4.

**Example:**

```
http://go.continia.com/docs/en-us/[solution code]/linkid=[solution code]-###
```

| Product | Permalink example |
|---|---|
| CB | `http://go.continia.com/docs/en-us/cb/linkid=cb-134` |
| CM | `http://go.continia.com/docs/en-us/cm/linkid=cm-1` |
| DC | `http://go.continia.com/docs/en-us/dc/linkid=dc-38` |
| DO | `http://go.continia.com/docs/en-us/do/linkid=do-58` |
| EM | `http://go.continia.com/docs/en-us/em/linkid=em-38` |
| OPplus | `http://go.continia.com/docs/en-us/copp/linkid=copp-501` |
| PM | `http://go.continia.com/docs/en-us/pm/linkid=pm-38` |

### 7.4 Related information section

Put links to related Docs articles under **Related information**. Do not put Continia Learn links there. Footnotes belong directly under their list or table (section 8.4), never in this section.

<!-- GAP: no verbatim example available — supply from corpus -->

---

## 8. Tables, lists, footnotes, and HTML

### 8.1 List form decision table

| Situation | Use | Example |
|---|---|---|
| Three items or fewer, non-sequential, in running text | Comma-separated list. Use the Oxford comma for three items. | "raindrops on roses, whiskers on kittens, and bright copper kettles" |
| Steps that must be taken in a specific order (any number) | Ordered list | Installation steps, setup tasks |
| Four or five non-sequential items: actions, features, options, capabilities | Unordered list | **Show File** - opens the related document using your default application. |
| More than five items, or items that need comparing | Table | Reference overviews, configuration options, UI actions |

<!-- CONFLICT: human guide says "use tables when the number of items in an unordered list is four or greater" in one place and "more than five items" in another; applied: more than five (four or five items stay in an unordered list) - human review needed -->

### 8.2 Punctuation

| Item type | Rule | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Bullet that is a complete sentence | End with a period | * Open the card. | * Open the card |
| Bullet that is a phrase or term-description fragment | No period | * **Show File** - opens the related document | * **Show File** - opens the related document. |
| Mixed in one list | Never mix. Punctuate all items or none. | n/a | One item with a period, others without |

Term-description items use the pattern `* **[Term]** - [description in lowercase].` with a spaced hyphen.

<!-- CONFLICT: human guide says "use en dashes" for dashes, but its own term-description list examples use a spaced hyphen as separator; applied: spaced hyphen for term-description items, en dash for dashes in prose - human review needed -->

### 8.3 Tables

- Introduce a table with: `The following table describes [what the table lists].`
- Abbreviations (PM, DC, BC) are allowed inside table cells only.
- Do not put tables inside callouts.

<!-- GAP: no verbatim example available — supply from corpus -->

### 8.4 Footnotes

Use footnotes in tables or lists to add information while keeping the table free of clutter. Use the HTML approach.

````markdown
* An item with a footnote <sup><a class="footnote-ref" href="#fn-1">1</a></sup>
* Another item with a footnote <sup><a class="footnote-ref" href="#fn-2">2</a></sup>

```html
<div class="footnotes">
<ol>
<li id="fn-1"><p>This is the footnote of the first item.</p></li>
<li id="fn-2"><p>This is the footnote of the second item.</p></li>
</ol>
</div>
```
````

Rules:

1. Put the footnote `div` inside a code block.
2. Place that code block directly below the list or table that holds the footnote links.
3. Always close the `div` tag at the end of the block.

### 8.5 HTML in articles

When an article needs HTML (for example, filters for complex tables), wrap every HTML entry in its own `html` code block. Put the non-HTML content between the blocks.

````markdown
```html
<div
  data-alphabetical-sort
  data-filters='[
    {"type": "search", "col": 1, "label": "{dictionary.tableFilters.countryTable.search}", "classNames": "full-width"}
  ]'
>
```

[Non-HTML content, for example a table.]

```html
</div>
```
````

---

## 9. Vocabulary, grammar, and phrasing

### 9.1 Core writing rules

| Rule | Instruction | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Language | Write American English. For a term in doubt, follow Merriam-Webster. | website | web site |
| Voice | Use the active voice. | "Continia assigns the code." | "The code is assigned by Continia." |
| Person | Use the second person ("you"). Do not use "we". | "You can select a bank." | "We can select a bank." |
| Terminology | Use one term for one concept. Align with Microsoft Business Central terminology. Where Microsoft and this guide disagree, follow this guide. | n/a | Two terms for one concept |
| Audience | Write for non-native English speakers. Use plain, direct sentences. Do not use flowery or unclear wording. | "Select the bank." | "Peruse the available banking institutions." |
| Tense | Use the present tense. Do not use "will" or "would". | "When enabled, Continia automatically assigns..." | "When enabled, Continia will automatically assign..." |
| Pronouns | Repeat the noun instead of replacing it with a pronoun. | "By connecting your data to the correct emission type, you can enrich your data." | "...you can enrich it." |
| Exclamation marks | Do not use them. | "Save the file." | "Save the file!" |
| Redundant words | Delete "(in order) to", "whether (or not)", and "(you can) select" where the shorter form keeps the meaning. | "To save, click **OK**." | "In order to save, click **OK**." |
| Pleonasms | Do not write "create new", "specify exactly", "add additional", or "and then". | "Create a template." | "Create a new template." |
| Adverbs | Do not write "easily", "just", "quickly", "simply", and similar adverbs. | "Click **OK**." | "Simply click **OK**." |
| Latin | Do not use Latin abbreviations (e.g., i.e., et al., etc.). Write "for example", "that is", and "and so on". Exception: when an abbreviation is unavoidable, follow it with a colon, not a comma. | "for example, a customer returned an item" | "e.g., a customer returned an item" |
| Commas | Use the Oxford comma in non-bulleted lists of three or more items. | "A, B, and C" | "A, B and C" |
| Dashes | Do not use em dashes (—). If a dash is needed, use an en dash (–). Restructure the sentence in preference to using a dash. | "Link to the article – do not repeat it." | "Link to the article — do not repeat it." |
| Plurals | Do not add "(s)" to show singular or plural. Use "one or more" when both must be stated. | "Your Continia solutions"; "To add one or more rows or columns to a table" | "Your Continia solution(s)" |
| Capitalization | Write all proper nouns in title case. | Continia Document Capture | continia document capture |

### 9.2 Contractions

Use the valid contractions. Do not use the invalid ones. A contraction in neither list follows the same default: it is allowed.

| Valid contractions | Invalid contractions |
|---|---|
| You'll | There'd |
| Won't | They'd |
| It's | You'd |
| Can't | It'd |
| It'll | Ain't |
| You're | |
| That's | |
| Aren't | |
| Hasn't | |
| Doesn't | |
| Haven't | |
| Don't | |

### 9.3 Numbers and dates

| Situation | Rule | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Whole numbers zero through ten | Spell out | non-zero possibility; three options | 3 options |
| 11 or greater | Numerals | 12 days | twelve days |
| One item in a list needs a numeral | Use numerals for every item in that list | 9 ladies dancing, 10 lords a-leaping, 11 pipers piping | nine ladies dancing, 10 lords a-leaping, 11 pipers piping |
| Two numbers for different things appear together | Numeral for one, spelled out for the other | six 80-liter tanks | 6 80-liter tanks |
| Sentence start | Never start with a numeral. Spell it out or reword. | "Twelve days remain." | "12 days remain." |
| Date in body text | Month day, year | July 4, 1776 | 4/7/1776 |
| Date in the meta block | dd-mm-yyyy | 31-12-2025 | July 31, 2025 |

For number cases not listed here, follow [Numbers](https://learn.microsoft.com/en-us/style-guide/numbers) (Microsoft article).

### 9.4 Product, version, and technology names

#### Solution naming

Rules:

- On the first mention in the body of the article, use the full name (first-mention column). The first-mention rule does not apply to the title, metadata title, or metadata description.
- After the first mention, use the second-mention form.
- Exception: Continia Banking, Continia Finance, and Continia Delivery Network are always written in full.
- Use abbreviations only inside table cells. Never use them in running text.
- Never alter a solution name.
- Write environment terms (cloud, online, on-premises) in sentence case.

<!-- CONFLICT: human guide's prose says only Continia Banking and Continia Finance are always written in full, but its table also shows Continia Delivery Network with no short second mention; applied: all three are always written in full - human review needed -->

| Product | 1st mention | 2nd mention | Abbreviation (table cells only) |
|---|---|---|---|
| Solution | Continia Document Capture | Document Capture | DC |
| Solution | Continia Expense Management | Expense Management | EM |
| Solution | Continia Banking | Continia Banking | CB |
| Solution | Continia Finance | Continia Finance | CF |
| Solution | Continia Document Output | Document Output | DO |
| Solution | Continia Payment Management | Payment Management | PM |
| Solution | Continia OPplus | OPplus | OPplus |
| Solution | Continia Collection Management | Collection Management | CM |
| Solution | Continia Delivery Network | Continia Delivery Network | CDN |
| Module | Continia Payment Approval | Payment Approval | none |

#### Referring to versions of Continia solutions

| Situation | Pattern | Example |
|---|---|---|
| 1st mention | `[Full solution name] [year] R[n] (v[nn])` | Continia Document Capture 2025 R2 (v27) |
| 2nd mention, release | `[Short solution name] [year] R[n]` | Document Capture 2025 R2 |
| 2nd mention, service pack | `[Short solution name] [year] R[n] Service Pack [n]` | Document Capture 2025 R1 Service Pack 2 |
| 2nd mention, hotfix | `[Short solution name] [year] R[n] Service Pack [n], hotfix [n]` | Document Capture 2025 R1 Service Pack 2, hotfix 3 |

#### Business Central

Continia documentation targets the latest Business Central version. Write "Business Central". Do not write "NAV" or "Business Central/NAV". Exception: write NAV only when the content is relevant solely to a NAV installation (for example, when updating an old version).

| 1st mention | 2nd mention | Abbreviation (table cells only) |
|---|---|---|
| Microsoft Dynamics 365 Business Central | Business Central | BC |
| Microsoft Dynamics NAV | Dynamics NAV | NAV |

Referring to BC versions:

| Marketing | Long name | Short name (menu) |
|---|---|---|
| Dynamics NAV | Microsoft Dynamics NAV | Dynamics NAV |
| NAV2013 | Microsoft Dynamics NAV 2013 (version 7) | NAV2013 (version 7) |
| NAV2015 | Microsoft Dynamics NAV 2015 (version 8) | NAV2015 (version 8) |
| NAV2016 | Microsoft Dynamics NAV 2016 (version 9) | NAV2016 (version 9) |
| NAV2017 | Microsoft Dynamics NAV 2017 (version 10) | NAV2017 (version 10) |
| NAV2018 | Microsoft Dynamics NAV 2018 (version 11) | NAV2018 (version 11) |
| NAV2019 | Microsoft Dynamics NAV 2019 (version 12) | NAV2019 (version 12) |
| BC13 | Microsoft Dynamics 365 Business Central 2018 release wave 2 (BC v13) | BC v13 (BC 2018 wave 2) |
| BC14 | Microsoft Dynamics 365 Business Central 2019 release wave 1 (BC v14) | BC v14 (BC 2019 wave 1) |
| BC15 | Microsoft Dynamics 365 Business Central 2019 release wave 2 (BC v15) | BC v15 (BC 2019 wave 2) |
| BC16 | Microsoft Dynamics 365 Business Central 2020 release wave 1 (BC v16) | BC v16 (BC 2020 wave 1) |
| BC17 | Microsoft Dynamics 365 Business Central 2020 release wave 2 (BC v17) | BC v17 (BC 2020 wave 2) |

#### Continia Expense Mobile App

| Rule | Instruction | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Name | The mobile app for Expense Users is "Continia Expense Mobile App". | Continia Expense Mobile App | Continia Expense App |
| Drop "Continia" | After the first mention on a page or article, drop "Continia". | Expense Mobile App | n/a |
| Keep "Mobile" | Never drop "Mobile". The short form would be confused with the EM app for Business Central. | Expense Mobile App | Expense App |
| Case | Capitalize every word. | Continia Expense Mobile App | Continia expense mobile app |

#### Peppol

- Write "Peppol". Do not capitalize every letter.
- The network name is "Peppol eDelivery Network".
- Peppol standards are written like "Peppol BIS3".

### 9.5 Miscellaneous terms

| Use | Do not use | Rule |
|---|---|---|
| eBilling, eDocument, eInvoicing, eOrder | e-Billing, E-Document | No hyphen. Lowercase "e" followed by an uppercase letter. |
| email | e-mail | |
| ID | id, Id | |
| postal code | postcode, post code | |
| once | n/a | Do not use "once" as a synonym for "when" or "after". |
| on premises | n/a | Use without hyphen as an adverb: "Business Central on premises is also a digital bookkeeping system"; "If you're using OCR on premises". |
| on-premises | n/a | Use with hyphen as an adjective: "If you choose on-premises OCR"; "For the on-premises version". Always use the hyphenated form in article titles. |
| import ... from ... into ... | n/a | One imports something from somewhere and into somewhere else. |
| log in to | log into | One logs in to something. |

---

## 10. Sentence-pattern library

Lift these patterns verbatim and replace the bracketed slots.

| Purpose | Pattern |
|---|---|
| Cross-reference, default | `For more information, see [article title].` |
| Cross-reference, alternative | `For more information, see the [article name] article.` |
| Cross-reference to Microsoft | `For more information, see [article title] (Microsoft article).` |
| Cross-reference to a PDF | `For more information, see [document name] (PDF).` |
| Learn reference | `For more information on this, including a practical scenario, see the [Continia Learn](https://learn.continia.com/) unit on [topic](https://learn.continia.com/module/[module]/[lesson]).` |
| Release plan feature link | `To learn more about the [feature name] feature, see [article title].` |
| Table introduction | `The following table describes [what the table lists].` |
| Procedure lead-in | `To [verb] [object]:` |
| Search opener | `Search (<i class="fa-magnifying-glass">:magnifying-glass:</i>) for and select **[Page or list name]**.` |
| Location phrases | `In the **[Name]** window`, `on the **[Name]** FastTab`, `on the **[Name]** page`, `on the **[Name]** card`, `in the **[Name]** dropdown menu` |
| Action bar path | `On the action bar, click **[UI element]** > **[another UI element]**.` |
| Menu path | `Click **[A]** > **[B]** > **[C]**.` |
| Field entry | `In the **[Dialog name]** dialog box, in the **[Field name]** field, select [value].` |
| Icon as the clicked element | `Click <i class="fa-ellipsis-vertical">:ellipsis-vertical:</i> > **Edit** to open the template card.` |
| Toggle | `To keep all applied filters, enable the **Pass all filters** toggle.` |
| Checkbox | `Select the **[Name]** checkbox.` or `Clear the **[Name]** checkbox.` |
| Mobile app | `Tap **[Name]**.` |
| Key press | `Press <kbd>Enter</kbd>.` |
| Optional plural | `To add one or more rows or columns to a table, ...` |
| Present-tense behavior | `When enabled, Continia automatically assigns ...` |
| Example lead-in | `For example, [specific case].` |

---

## 11. Images, media, icons, files, and variables

### 11.1 Images

Syntax:

```markdown
![Alt text](https://xaznkhxfsb.cloudimg.io/Docs/[Filename].png)
```

| Rule | Instruction | ✅ Correct | ❌ Incorrect |
|---|---|---|---|
| Need | Include a screenshot only when the article cannot be understood without it. Screenshots reduce maintainability. | n/a | A screenshot for every step |
| Role | Support the text. Never replace it. | n/a | An image that carries the instruction alone |
| Format | Use PNG. | `.png` | `.jpg` for screenshots |
| Alt text | Always provide alt text. | `![Sales orders list](...)` | `![](...)` |
| Filename | Separate words with hyphens and include a timestamp. | Sales-orders-outstanding-orders-20230601.png | Sales orders.png |
| CDN case | The CDN is case-sensitive. Write the URL with the exact filename case. | `https://xaznkhxfsb.cloudimg.io/Docs/Moon.jpg` | `https://xaznkhxfsb.cloudimg.io/Docs/Moon.JPG`; `https://xaznkhxfsb.cloudimg.io/docs/moon.jpg` |
| URL suffix | Remove everything after the file extension. | `.../Scenario%20flow%20diagram.png` | `.../Scenario%20flow%20diagram.png?vh=ae4f3d` |

Linking an image to itself requires HTML instead of Markdown.

<!-- GAP: the human guide does not supply the HTML syntax for an image that links to itself -->

### 11.2 Videos

Syntax:

```liquid
{% embed url="https://player.vimeo.com/video/[video ID]?h=[hash]" %}
```

Rule: keep the `?h=[hash]` parameter and remove every parameter after it.

**Example:** enter `https://player.vimeo.com/video/1235085959?h=762ac8ea2a`, not `https://player.vimeo.com/video/1235085959?h=762ac8ea2a&badge=0&autopause=0&player_id=0&app_id=58479`.

<!-- CONFLICT: human guide says to strip the suffix from video URLs, but its markdown example keeps &amp;badge=0 and other parameters; applied: strip the suffix - human review needed -->

### 11.3 StoryLane walkthroughs

```liquid
{% StoryLaneEmbed url="https://app.storylane.io/share/[share ID]" %}
```

StoryLane walkthroughs are interactive embeds. They are not the "Walkthrough" article type (section 2.6).

### 11.4 Icons

Insert an icon by writing its code inline. Use only these codes.

| Icon | Code |
|---|---|
| Checkmark | `<i class="fa-check">:check:</i>` |
| Search | `<i class="fa-magnifying-glass">:magnifying-glass:</i>` |
| Settings | `<i class="fa-gear">:gear:</i>` |
| Three-dot menu (vertical ellipsis, kebab menu) | `<i class="fa-ellipsis-vertical">:ellipsis-vertical:</i>` |
| Three-dot menu (horizontal ellipsis, meatballs menu) | `<i class="fa-ellipsis">:ellipsis:</i>` |
| X mark | `<i class="fa-xmark">:xmark:</i>` |
| Back button | `<i class="fa-arrow-left">:arrow-left:</i>` |
| Menu (burger menu) | `<i class="fa-bars">:bars:</i>` |
| Keyboard key (see 5.1) | `<kbd>[Key]</kbd>` |

Parentheses rule:

| Situation | Format | Example |
|---|---|---|
| The icon is not the element being referred to directly (it illustrates a function) | Put the icon in parentheses | Search (<i class="fa-magnifying-glass">:magnifying-glass:</i>) for and select **Continia Solution Management**. |
| The icon is the element the reader clicks | No parentheses | Click <i class="fa-ellipsis-vertical">:ellipsis-vertical:</i> > **Edit** to open the template card. |

### 11.5 Files

Make a file available for download by adding this line at the bottom of the article:

```markdown
{% file src="../assets/[your_file].[your_file_extension]" %}
```

### 11.6 Reusable content (includes)

- Reference reusable content with the include path ending in `/.gitbook/includes/[name-of-include]`. Prefix the path with one `../` for each folder level between the `en-us` root and the article file. An article at `en-us/Continia Document Capture/Setting up Document Capture/Setting up general business functionality/Setting up job queues.md` needs three `../`.
- Name reusable-content files in lowercase, with hyphens instead of spaces.
- In reusable-content files, write every heading one level deeper than the level it needs (a heading meant as H2 is written as H3). This workaround stays until GitBook fixes its heading handling.

<!-- GAP: the human guide says to "use the syntax from the example below" for adding reusable content in Typora, but the example is missing; the exact include statement is unknown -->

### 11.7 Variables

When reusable content points to a variable (for example, the product title), define the variable in the article's `vars` block above the filename line.

**Example:**

```yaml
---
vars:
  product_title: Document Output
---
```
