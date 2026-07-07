# Continia Documentation Style Guide (Agent Reference)

This file is a machine-optimized style reference for the Continia docsWriter agent. It is generated from the human-written Continia Docs style guide and re-compiled so that every stylistic decision is expressed as a directive: one rule, one default, one exception condition, paired with a compliance example. Use this file, not the human guide, as the operative reference when drafting or editing Continia documentation articles.

## Table of contents

1. [Frontmatter and metadata](#1-frontmatter-and-metadata)
2. [Choosing and structuring an article type](#2-choosing-and-structuring-an-article-type)
3. [Writing introductions, examples, and scenarios](#3-writing-introductions-examples-and-scenarios)
4. [Writing procedures](#4-writing-procedures)
5. [Formatting UI and product references](#5-formatting-ui-and-product-references)
6. [Callouts](#6-callouts)
7. [Links and cross-references](#7-links-and-cross-references)
8. [Tables and lists](#8-tables-and-lists)
9. [Vocabulary, grammar, and phrasing](#9-vocabulary-grammar-and-phrasing)
10. [Sentence-pattern library](#10-sentence-pattern-library)
11. [Images, media, and template variables](#11-images-media-and-template-variables)

---

## 1. Frontmatter and metadata

Every article starts with a `meta` fence containing five fields.

````markdown
```meta
title: [Title, sentence case]
date: [dd-mm-yyyy]
description: [One sentence describing what the article covers]
id: [PREFIX]-[###]
lang: [en|da|de]
```
````

**Field rules:**

- `title` — Sentence case. Must be nearly identical to the visible `# H1` title. Exception: append "in [Solution name]" to the metadata title (and optionally the visible title) when the topic is shared across multiple solutions and needs disambiguation.
  **Example:** `Enhanced line recognition in Document Capture`
- `date` — Format `dd-mm-yyyy`. This is the only place `dd-mm-yyyy` is used. Never use this format in body text (see [Section 9](#9-vocabulary-grammar-and-phrasing) for body-text date format).
- `description` — One short sentence stating what the article is about. Do not use the abbreviated solution name here; if a solution is named, use the full first-mention form.
  **Example:** `How to request external functionality and events that are currently missing.`
- `id` — Format `[PREFIX]-[###]`, where `[PREFIX]` is the product prefix (table below) and `[###]` is a sequential number. Assign the next unused number for that product's prefix. Never reuse or skip a number in a product's sequence.
- `lang` — Two-letter code: `en` (English), `da` (Danish), `de` (German).

### Product prefix table

| Product | Prefix | Permalink solution code |
|---|---|---|
| Continia Document Capture | DC | `dc` |
| Continia Expense Management | EM | `em` |
| Continia Banking | CB | `cb` |
| Continia Finance | CF | <!-- GAP: permalink solution code for Continia Finance not specified in the human guide --> |
| Continia Document Output | DO | `do` |
| Continia Payment Management | PM | `pm` |
| Continia OPplus | OPplus | `copp` |
| Continia Collection Management | CM | `cm` |

### Permalinks

Permalink syntax:

```
http://go.continia.com/docs/[language code]/[solution code]/linkid=[prefix-lowercase]-[article ID number]
```

**Example:** `http://go.continia.com/docs/en-us/cb/linkid=cb-134`

Permalinks are generated from the `id` metadata field and are consumed by Business Central, Continia Learn, and Marketing. Always populate `id` so a permalink can be derived.

---

## 2. Choosing and structuring an article type

### 2.1 Article type decision table

| Situation | Article type | Title pattern | Example |
|---|---|---|---|
| Reader must perform a task or reach a specific goal | Procedural | `[Verb]ing [object]` | Adding a payment service provider |
| Reader needs background, principles, or a mental model, with or without an accompanying procedure | Conceptual | `[Verb]ing [object]` or `Understanding [topic]` | Working with payment service providers; Understanding Continia Core |
| Article is the topmost/orientation article of a complex folder | Overview (conceptual subtype) | Do not use the word "Overview." Use the folder name or "Setting up [solution name]" | Setting up Continia Banking |
| Reader needs a list of facts, fields, specs, or definitions | Reference | Noun phrase, no verb | Billing, consumption, and transactions |
| Reader must complete a sequence of interdependent procedures toward one broader goal | Walkthrough | `Walkthrough: [task in gerund form]` | Walkthrough: Setting up a new approval workflow |
| Reader has a specific, frequently recurring question | FAQ | Topic/question phrasing consistent with the folder theme | <!-- GAP: no explicit FAQ title pattern given in the human guide --> |

Do not pre-announce unreleased features in any article type. Exception: roadmap articles, which exist specifically to describe planned features.

### 2.2 Procedural articles

Use this skeleton. Detailed procedure-writing rules are in [Section 4](#4-writing-procedures).

```markdown
# [Verbing object]

[Context paragraph: what the functionality is for and why it matters]

To [do the task]:

1. [Step]
2. [Step]
```

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.3 Conceptual articles

Title starts with a gerund or "Understanding": `Working with payment service providers`, `Understanding Continia Core`. Content explains why the functionality is useful and provides the background, principles, and mental models needed before the reader attempts a procedure. Do not include numbered steps in a conceptual article; if steps are needed, write a separate procedural article and link to it.

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.4 Overview articles (conceptual subtype)

- Default: skip the overview article for a standalone, single-concept folder. Write one only when the folder's content is complex enough to require orientation.
- ToC entry name: `Overview`.
- Title: never use the word "Overview." Use the folder name or "Setting up [solution name]."
- Content: describe core concepts, capabilities, and features, each linking to its dedicated article. Do not add a table that links to every article in the folder.
- Sort ToC entries by whatever order best serves the reader for that folder (for example, alphabetical for country lists, process order for "Getting Started" entries).

### 2.5 Reference articles

Title is a noun phrase: `Billing, consumption, and transactions`. Content is typically a table or bulleted list of facts or specifications.

For release-plan style reference entries:
- Describe each update with a noun phrase or gerund, not a full sentence, so the entry does not become outdated. **Example:** `Support for direct communication with Eika`; `Displaying embedded PDF files in the Document Viewer`.
- For every released feature, link to the article that describes it, as the last line of that entry's body text. **Example:** `To learn more about the Payment Approval feature, see Setting up payment approval.`

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.6 Walkthrough articles

Use a walkthrough only when the tasks are sequential and interdependent toward one broader goal. If tasks are related but not dependent on each other, write a procedural article with multiple headings instead.

Walkthroughs are correct when:
- The reader needs an end-to-end understanding of a process.
- Multiple steps depend on one another to reach the outcome.
- Explaining the "why" behind each step reinforces learning.

Title: `Walkthrough: [task in gerund form]`.

Structure:
1. Short introduction: what the walkthrough covers and why it matters.
2. Each procedure listed as its own heading, in the order it must be performed. Each procedure follows standard procedural structure (heading, context introduction, numbered steps — see [Section 4](#4-writing-procedures)).
3. Scenario-based context goes only in the introduction, or as an example after a relevant step. Never mix scenario narrative into the numbered steps themselves.

If the walkthrough has 5 or more procedures, do one of the following:
- Group procedures under subheadings.
- Split into multiple walkthroughs that link to each other.
- Convert some procedures into standalone topics, linked from a "Related tasks" section.

<!-- GAP: no verbatim example available — supply from corpus -->

### 2.7 FAQ articles

- Include a question only if it is both frequent and easy to answer. If the answer is complex, write a dedicated article and link to it instead.
- Distinguish customer-caused errors (eligible for FAQ) from bugs (route to support channels, never document as an FAQ answer).
- Link each question to an existing article whenever one exists. If no article exists, do not invent one on the spot — flag the gap.
- Group FAQ entries by theme. Place the FAQ article last within its folder.
- Default: a folder should contain more main articles than FAQ entries. Do not use an FAQ article as a substitute for real documentation.
- Place `Troubleshooting` and `FAQs` folders under `Getting Started`.

<!-- GAP: no verbatim example available — supply from corpus -->

---

## 3. Writing introductions, examples, and scenarios

- **Never pre-announce.** Do not mention a feature that has not been developed or released. Exception: roadmap articles.
- **State the goal first.** Before any procedure or deep explanation, state the article's goal and key learning points.
- **Examples** illustrate a single, narrow task or function. Use them to clarify one specific behavior.
  **Example:** "You can differentiate the posting of your expense type based on expense user, expense user group, or country (for example, if applying a different VAT or sales tax for specific countries)."
- **Scenarios** are broad, end-to-end use cases spanning multiple steps, features, or user roles. Title scenario subsections descriptively.
  **Example:** "Advanced approval scenarios," "Four-eye approval scenarios."
- **Continia Learn.** If a topic is already covered by a Continia Learn module or lesson, link to it instead of duplicating the explanation. Use an in-sentence descriptive link — never place the Learn link under a "Related information" section.
  **Example:** "For more information on this, including a practical scenario, see the [Continia Learn](https://learn.continia.com/) unit on [delegating expense user tasks](https://learn.continia.com/module/set-up-users-in-EM/delegate-expense-user-tasks)."

---

## 4. Writing procedures

- **Provide context before steps.** Open with a short paragraph stating what the feature does and why the reader would use it. This is where the article adds value beyond a bare step list.
  **Example:**
  > You can specify how to import bank account statements on the bank account card. Indicating whether to import for reconciliation and when to start the reconciliation determines how the statement is imported and handled in the Job Queue.
- **"To + infinitive" opener.** Introduce the numbered steps with a sentence or fragment ending in a colon. Do not copy the header title verbatim.
  **Example:** `To select the bank account statement import method:`
- **Provide the path.** State where the reader is in the UI, not only what to click. Name the containing element (dialog box, FastTab, field), not just the target.
  **Example:** "On the **Import Payments** dialog, in the **PSP Agreement** field, select the PSP agreement you want to import payments for."
- **Numbered lists.** Always number procedure steps. Default: 9 steps or fewer per procedure. If a procedure has only one step, use a single bullet, not a numbered list of one.
- **Menu paths (sequences).** Abbreviate a simple UI sequence with right-angle brackets: one space before and after each bracket; do not bold the bracket itself. Do not use brackets for a folder-path sequence.
  **Example:** `Click **Accounts** > **Other accounts** > **Add an account**.`
  ❌ `Click **Accounts**>**Other accounts**>**Add an account**.` (no spaces around bracket)
  ❌ `Click **Accounts > Other accounts > Add an account**.` (bracket bolded)

<!-- GAP: no verbatim example available — supply from corpus -->

---

## 5. Formatting UI and product references

### 5.1 What gets bold

| Element | Formatting | Example |
|---|---|---|
| Unique UI element (page, list, card, field, dialog box title, cue, dropdown item, FactBox instance) | Bold, sentence case | **Bank Account** card; **Document Capture Setup** |
| Generic/non-unique container term (FastTab, FactBox, document journal, document card, used as a generic noun) | Not bold, lowercase | on the **Bank Account** FastTab (only "Bank Account" is bold) |
| `From` / `To` field labels | Bold | In the **From** field |
| UI element that appears in all caps in the product itself | Bold, sentence case (never reproduce all caps) | **Purchase**, not **PURCHASE** |
| Codes (proper identifiers, not display labels) | Bold, keep all caps | Click the **PURCHASE** code; **EMPL-RECON** |

### 5.2 Interaction verb decision table

| Situation | Verb | Example |
|---|---|---|
| Desktop/laptop interaction with a button, link, or single element | click | Click **OK**. |
| Picking from a list, menu, or group of options | select | Select **Open in new tab**. |
| Reader must decide between alternatives (emphasizes the decision, not the pick) | choose | Choose your installation method. |
| Touch/stylus interaction on mobile — used throughout Expense Management mobile-app documentation | tap | Tap **Settings**. |
| Toggle control | enable / disable + toggle name — never use "toggle" as a verb | Enable the **Pass all filters** toggle. |
| Checkbox | select / clear — never "check," "tick," or "deselect" | Select the **Pass all filters** checkbox. |
| Opening the BC Search function at the start of a procedure | fixed pattern: `Search ({{search}}) for and select **[Page]**.` | Search ({{search}}) for and select **Bank Account**. |

Default interaction verb across Continia Docs is **click** (audience works primarily on laptops/desktops). Exception: Expense Management documentation for the mobile app uses **tap** instead of **click** throughout.

### 5.3 Preposition decision table (on vs. in)

| Container | Preposition | Example |
|---|---|---|
| Menu, tab, toolbar, taskbar, ruler, desktop, network, hardware platform, the Web, action bar, FastTab | on | on the **Standard** toolbar; on the **Bank Account** FastTab |
| Field requiring data entry, dialog box, FactBox, FactBox pane, cue/cue group/action tile, action menu | in | in the **Save As** dialog box; in the **PSP Agreement** field |

### 5.4 Business Central UI element names

| Name (EN-US) | Description | Preposition |
|---|---|---|
| FastTab | Collapsible/expandable sections on task pages | on |
| FactBox pane | Section that appears when the reader clicks the "i" at the top-right of a page | in |
| FactBox | Individual elements in the FactBox pane with the grey background | in |
| Cue / Cue group / Action tiles | Elements on the Role Center page | in |
| action bar | Section directly below the page/card title, containing action menus | on |
| action menu | Individual menu within the action bar | in |

### 5.5 Solution and module naming

| Product | 1st mention | 2nd mention | Abbreviation |
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
| Module | Continia Payment Approval | Payment Approval | — |

Rules:
- Use the full name on first mention in the body of the article (not in the title, metadata title, or metadata description). Use the short form after that.
- Exception: **Continia Banking** and **Continia Finance** are always written in full — they have no shortened second-mention form.
- Use abbreviations (PM, DC, EM, etc.) only inside tables. Avoid abbreviations in running text.
- Solution names are proper nouns: never translate them and never otherwise alter them. Module names (for example, Payment Approval) are translated.
- When referring to a specific environment (cloud, online, on-premises), write it in sentence case.
- Default: do not prefix an article title with "Continia." Exception: solutions that require the full name on every mention (Continia Banking, Continia Finance) keep "Continia" in the title too.

### 5.6 Referring to versions of Continia solutions

| 1st mention | 2nd mention |
|---|---|
| Continia Document Capture 2025 R2 (v27) | Document Capture 2025 R2 |
| | Document Capture 2025 R1 Service Pack 2 |
| | Document Capture 2025 R1 Service Pack 2, hotfix 3 |

### 5.7 Business Central and Dynamics NAV

Default: refer to **Business Central**, never NAV or "Business Central/NAV." Exception: documentation that is exclusively relevant to a NAV installation (for example, instructions for updating an old version).

| 1st mention | 2nd mention | Abbreviation |
|---|---|---|
| Microsoft Dynamics 365 Business Central | Business Central | BC |
| Microsoft Dynamics NAV | Dynamics NAV | NAV |

### 5.8 Referring to BC/NAV versions

| Marketing name | Long name | Short name (menu) |
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

### 5.9 Continia Expense Mobile App

- Full name: **Continia Expense Mobile App**.
- After the first mention on a page, drop "Continia": **Expense Mobile App**.
- Never drop "Mobile" — omitting it risks confusion with the EM app for Business Central.
- Title case every word: **Continia Expense Mobile App**, not "Continia Expense mobile app."

### 5.10 Peppol

- Write **Peppol**, not "PEPPOL" — do not capitalize every letter.
- The network's full name is **Peppol eDelivery Network**.
- Peppol standards are formatted like this: **Peppol BIS3**.

---

## 6. Callouts

### 6.1 Callout type decision table

| Type | Color (light/dark) | Use when | Syntax |
|---|---|---|---|
| Info (a.k.a. Note) | Purple | Information the reader should register even when skimming | `{% hint style="info" %}` … `{% endhint %}` |
| Important (a.k.a. Danger) | Blue | Crucial information the reader needs to succeed | `{% hint style="danger" %}` … `{% endhint %}` |
| Warning | Yellow | Critical content requiring immediate attention due to risk | `{% hint style="warning" %}` … `{% endhint %}` |
| Success (a.k.a. Tip) | Green | Optional information that helps the reader succeed further | `{% hint style="success" %}` … `{% endhint %}` |

### 6.2 Rules

- Use callouts sparingly so they retain impact.
- Do not place two callouts of the **same** type back to back. Different types may be stacked; leave one blank line between the end of the first callout and the start of the next.
  **Example:**
  ```
  {% hint style="success" %}
  Does this work?
  {% endhint %}

  {% hint style="info" %}
  Yes, it does.
  {% endhint %}
  ```
- Default: do not put tables, procedures, bulleted/numbered lists, or images inside a callout. Show that content elsewhere in the article instead, so it does not distract from the callout's single point.
- When a callout appears between items of an ordered or unordered list, add a blank line between the list item and the callout, and match the callout's indentation to the list item's content — otherwise the numbering breaks.
  **Example:**
  ```
  1. First step.

  2. Second step.

     {% hint style="info" %}
     The indentation and numbering work fine.
     {% endhint %}

  3. Third step.
  ```

<!-- CONFLICT: the human guide gives contradictory claims about nesting an ordered list inside an unordered list (and vice versa) inside a callout — one passage says this combination "didn't use to work, but now it does," implying both nestings are now supported, while the main best-practice rule says to avoid nested lists in callouts entirely. Rule 6.2's "no lists inside callouts" default is kept as authoritative; the nested-list capability is not relied upon. Human review needed if a nested list inside a callout is ever required. -->

<!-- GAP: no verbatim example available — supply from corpus (hint/callout block) -->

---

## 7. Links and cross-references

### 7.1 Link form decision table

| Situation | Form | Example |
|---|---|---|
| Referencing another Continia Docs article | `For more information, see the [Article name] article.` | For more information, see the Bank reconciliation article. |
| Referencing external Microsoft documentation | Append `(Microsoft article)` | For more information, see [Numbers](https://learn.microsoft.com/en-us/style-guide/numbers) (Microsoft article). |
| Referencing a PDF document | Append `(PDF)` | For more information, see [Setup guide] (PDF). |
| Referencing a Continia Learn module/lesson | In-sentence descriptive link; never under "Related information" | For more information on this, including a practical scenario, see the [Continia Learn](https://learn.continia.com/) unit on [delegating expense user tasks](https://learn.continia.com/module/set-up-users-in-EM/delegate-expense-user-tasks). |
| Content already documented elsewhere | Link to it instead of repeating it | — |

### 7.2 Rules

- **Always use descriptive link text.** Never write "click here" or "read more here."
  ✅ "For more information, see [name of the article]."
  ❌ "You can read more about this here."
- **Place conditional/reference clauses before the instruction they support, not after.**
  ✅ "For more information, see Software lifecycle policy."
  ❌ "See Software lifecycle policy for more information."
- **Link instead of repeating content.** If an existing article already covers the content needed, link to it rather than restating it — this improves consistency and maintainability.
- **Repeat the noun instead of using a pronoun** when referring back to something named earlier in the sentence.
  ✅ "By connecting your data to the correct emission type, you can enrich your data."
  ❌ "By connecting your data to the correct emission type, you can enrich it."

<!-- GAP: no verbatim example available — supply from corpus (Related information section) -->

---

## 8. Tables and lists

### 8.1 List form decision table

| Element | Use when | Example |
|---|---|---|
| Comma-separated list | 3 or fewer items in running text | "Features include A, B, and C." |
| Ordered list (1, 2, 3) | Steps that must happen in a specific order | Installation steps, setup tasks |
| Unordered list (•) | Non-sequential items: features, options, capabilities | Button descriptions, settings options |
| Table | More than 5 items, or comparing items | Reference overviews, configuration options, UI actions |

<!-- GAP: no verbatim example available — supply from corpus (reference table) -->

### 8.2 Punctuation

- Use the Oxford comma in comma-separated lists of 3 or more items.
  **Example:** "raindrops on roses, whiskers on kittens, and bright copper kettles."
- Bulleted **sentences** (complete sentences) get end punctuation.
- Bulleted **phrases** (fragments) do not get end punctuation.
- Within one list, be consistent: if one bullet is punctuated, punctuate all of them.

---

## 9. Vocabulary, grammar, and phrasing

### 9.1 General writing style

- **US English.** Refer to [Merriam-Webster](https://www.merriam-webster.com/) when a term is ambiguous.
- **Active voice by default.** Use passive voice only when the actor is unknown or irrelevant to the reader.
- **Second person.** Use "you," never "we."
- **One term per concept.** Use the same term consistently for the same concept. Align terminology with Microsoft Business Central documentation. If this guide and Microsoft disagree, this guide's term wins.
- **Write for a global audience.** Avoid flowery or unclear phrasing — many readers are not native English speakers, and ambiguity causes real mistakes.
- **Less is more.** If a sentence is clear without an adverb, adjective, or extra section, remove it.
- **Repeat nouns, avoid pronouns**, when the reference could be ambiguous (see [7.2](#72-rules)).
- **Never start a sentence with a numeral** (see [9.4](#94-numbers)).

### 9.2 Grammar

- **Present tense.** Avoid "will" and "would."
  ✅ "When enabled, Continia automatically assigns…"
  ❌ "When enabled, Continia will automatically assign…"
- **No Latin abbreviations** (e.g., i.e., etc., et al.). Restructure the sentence instead. Exception: if one must be used, follow it with a colon, not a comma.
- **Dashes.** Do not use em dashes (—). If a dash is needed, use an en dash (–). Prefer restructuring the sentence over using a dash at all.

### 9.3 Contractions

Use contractions from the valid list by default. Never use a contraction from the invalid list.

**Valid:** You'll, Won't, It's, Can't, It'll, You're, That's, Aren't, Hasn't, Doesn't, Haven't, Don't

**Invalid:** There'd, They'd, You'd, It'd, Ain't

### 9.4 Numbers

| Rule | Example |
|---|---|
| Spell out whole numbers zero through ten | "non-zero possibility"; "three options" |
| Use numerals for 11 and greater | "12 days of Christmas" |
| If one item in a list needs a numeral, use numerals for every item in that list | "9 ladies dancing, 10 lords a-leaping, 11 pipers piping" |
| If two numbers referring to different things appear together, use a numeral for one and spell out the other, regardless of the general rule | "six 80-liter tanks" |
| Never start a sentence with a numeral | — |

For more number-related guidelines, see [Numbers](https://learn.microsoft.com/en-us/style-guide/numbers) (Microsoft article).

### 9.5 Dates

Body text uses the American date format: Month Day, Year. **Example:** "July 4, 1776." Exception: the `date` field in metadata uses `dd-mm-yyyy` (see [Section 1](#1-frontmatter-and-metadata)).

### 9.6 Plurals

Do not append "(s)" to indicate a term may be singular or plural — it complicates localization.
✅ "Your Continia solutions"
❌ "Your Continia solution(s)"

If both singular and plural must be indicated explicitly, use "one or more."
**Example:** "To add one or more rows or columns to a table…"

### 9.7 Redundancy

**Filler words to drop:**

| Redundant phrase | Preferred |
|---|---|
| (in order) to | to |
| whether (or not) | whether |
| (you can) select | select |

**Pleonasms to avoid:** "create new" → "create"; "specify exactly" → "specify"; "add additional" → "add".

**Adverbs to avoid:** "easily," "just," "quickly," "simply." Remove them if the sentence is clear without them.

**Exclamation marks:** never use them.

**All caps:** never reproduce a UI element's all-caps styling in text — convert to sentence case. Exception: codes (for example, `EMPL-RECON`, `PURCHASE`), which keep their all-caps form (see [5.1](#51-what-gets-bold)).

### 9.8 Miscellaneous terms

| Term | Rule |
|---|---|
| eBilling, eDocument, eInvoicing, eOrder | No hyphen; lowercase "e" followed by an uppercase letter |
| email | Not "e-mail," unless the target localization language uses the hyphen |
| ID | Not "id" or "Id," unless the target localization language spells it differently |
| once | Never use as a synonym for "when" or "after" |
| on premises / on-premises | Without hyphen = adverb ("Business Central on premises is also a digital bookkeeping system"). With hyphen = adjective ("If you choose on-premises OCR"). In article titles, always use the hyphenated form for consistency. |
| postal code | Use "postal code," not "postcode" or "post code" |
| into / in to | Import data **from** somewhere **into** somewhere else. Log **in to** something (two words). |

---

## 10. Sentence-pattern library

Copy-paste patterns for common article moments.

- Cross-reference to another article:
  `For more information, see the [article name] article.`
- Introducing a reference table:
  `The following table describes…`
- Naming a UI container in a sentence:
  `In the [**UI element**] window, on the [**UI element**] FastTab, on the [**UI element**] page, on the [**UI element**] card, in the [**UI element**] dropdown menu.`
- Action bar sequence:
  `On the action bar, click [**UI element**] > [**another UI element**].`
- Procedure opener using Search:
  `Search ({{search}}) for and select **[Page]**.`
- Menu path / sequence:
  `**A** > **B** > **C**` (space before and after each bracket; bracket itself is never bold)
- Procedure introductory sentence:
  `To [do the task]:`
- Icon used inline (always parenthesized):
  `Search ({{search}}) for and select **Continia Solution Management**.`
- Toggle instruction:
  `To keep all applied filters, enable the **Pass all filters** toggle.`
- Continia Learn cross-reference:
  `For more information on this, including a practical scenario, see the [Continia Learn](https://learn.continia.com/) unit on [delegating expense user tasks](https://learn.continia.com/module/set-up-users-in-EM/delegate-expense-user-tasks).`

---

## 11. Images, media, and template variables

### 11.1 Images

Two ways to add an image; both support alt text, but only HTML lets the image link to itself.

**Markdown:**
```
![The Moon](https://xaznkhxfsb.cloudimg.io/Docs/Moon.jpg)
```

**HTML (self-linking):**
```
<a href="/images/DC/eDocuments/eDocuments advanced ordering - scenario A.jpg" target="_blank"> <img src="/images/DC/eDocuments/eDocuments advanced ordering - scenario A.jpg" alt="eDocuments advanced ordering - scenario A"> </a>
```

**Rules:**
- The CDN is case-sensitive. Image URLs must match the exact filename case as stored.
  ✅ `https://xaznkhxfsb.cloudimg.io/Docs/Moon.jpg`
  ❌ `https://xaznkhxfsb.cloudimg.io/Docs/Moon.JPG` / `https://xaznkhxfsb.cloudimg.io/docs/moon.jpg`
- Default: avoid screenshots — they reduce long-term maintainability. Exception: use a screenshot when it is genuinely necessary to understand the information.
- Images support the text; they never replace it.
- Format: PNG.
- Always provide alt text (accessibility and fallback if the image fails to load).
- Filename: hyphenate words and include a timestamp.
  **Example:** `Sales-orders-outstanding-orders-20230601.png`

### 11.2 Videos

```
{% embed url="https://player.vimeo.com/video/[video-id]?h=[hash]&badge=0&autopause=0&player_id=0&app_id=[app-id]" %}
```

### 11.3 Walkthrough embeds (Storylane)

```
<script async src="https://js.storylane.io/js/v2/storylane.js"></script>

<div style="width:100%;aspect-ratio:16/9;">
  <iframe
    src="https://app.storylane.io/demo/[demo-id]?embed=popup"
    style="width:100%;height:100%;border:0;border-radius:10px;"
    allowfullscreen
  ></iframe>
</div>
```

### 11.4 Icons

Insert an icon by name inside double curly brackets. When used inline in a sentence, always enclose the icon in parentheses.

- Checkmark — `{{checkmark}}`
- Cross — `{{cross}}`
- Horizontal dots (more information) — `{{horizontal-dots}}`
- Search — `{{search}}`
- Settings — `{{settings}}`
- Vertical dots (more information) — `{{vertical-dots}}`

**Example:** `Search ({{search}}) for and select **Continia Solution Management**.`

### 11.5 Reusable content (includes)

To reference an existing reusable content block (an include) in an article body, use:

```
{% file src="[relative path to include, e.g. ../../.gitbook/includes/name-of-include]" %}[display text]{% endfile %}
```

The number of `../` segments depends on how many folder levels separate the current article from the includes folder — adjust it to match the article's actual location.

<!-- GAP: the human guide illustrates this syntax with a screenshot rather than text; the pattern above is inferred from the guide's own use of `{% file src="..." %}...{% endfile %}` elsewhere in its text. Confirm against a real corpus example if available. -->

---

**Conversion report**

- **Dropped content:**
  - Human guide's own frontmatter/title/date/version and opening self-description paragraph ("This style guide is a reference tool for technical writers and translators…") — meta-commentary about the guide itself, not a documentation rule.
  - Reference to "There's a dedicated style guide for changelogs" — points to a separate document not supplied as input; out of scope for this converter run.
  - Info hint "If you encounter a case that has yet to be covered by this style guide, discuss it with the other technical writers…" — team-process content.
  - "For titles, only add 'Continia' before the solution name when there is enough space." — subjective, non-deterministic judgment call with no measurable threshold; replaced with the deterministic default in 5.5 ("do not include 'Continia' unless the solution requires the full name on every mention").
  - "To create reusable content in GitBook" (12-step procedure), "To edit reusable content in GitBook," and "To add reusable content in GitBook" (block-insertion menu steps) — authoring-tool (GitBook UI) workflows; human input mechanics (hovering, clicking, six-dot menu, merging).
  - `<kbd>Alt</kbd> + 0150` instruction for typing an en dash — keyboard/input mechanic; the underlying rule ("use en dash, never em dash") is retained in 9.2.
  - `<kbd>Esc</kbd>` select-all instruction inside the GitBook reusable-content procedure — human input mechanic, dropped with its parent procedure.
  - Localization/Marketing-involvement consideration for graphics ("before adding graphics, consider the need to localize them… does it require Marketing's involvement?") — team-process/localization-mechanics content that does not constrain the English markdown the agent writes.
  - Article-IDs spreadsheet lookup mechanics ("choose the next ID in line from the Article IDs spreadsheet… select the sheet for the relevant product") — team-process bookkeeping; the underlying rule (IDs are sequential per product prefix) is retained in Section 1.
  - FAQ "Regular updates" bullet (removing outdated questions, adding new ones over time) — ongoing editorial-maintenance workflow, not a single-article writing directive.
  - Illustrative "see also" pointers to specific real published examples: Microsoft's UI search-filter FAQ page, PM's reconciliation FAQ and troubleshooting/FAQ folder examples, and the "live example" test article link under Callouts — human-reader pointers to existing docs, not actionable rules for the agent.
  - "Detailed changelog for [product name]: Lorem ipsum dolor sit amet." under Reference article guidelines — unfinished placeholder stub in the source, contains no rule content.

- **Regenerated vs. preserved:** not applicable — no `EXISTING_AGENT_GUIDE` was supplied, so the entire file was generated fresh from `HUMAN_GUIDE`. No merge was performed.

- **Conflicts:**
  - `<!-- CONFLICT -->` in Section 6.2: the human guide's Callouts/Considerations subsection gives contradictory claims about whether ordered-list-inside-unordered-list and unordered-list-inside-ordered-list nesting works inside a callout ("It didn't use to work, but now it does" vs. the general best practice to avoid lists in callouts). Resolved by keeping the "no lists inside callouts" default as authoritative; flagged for human review.

- **Gaps:**
  - `<!-- GAP -->` in Section 1: permalink solution code for Continia Finance (CF) is not listed among the given permalink examples (cb, cm, dc, do, em, copp, pm).
  - `<!-- GAP -->` in Section 2.1: no explicit FAQ article title pattern is given in the human guide.
  - `<!-- GAP -->` in Sections 2.2, 2.3/2.4 (implied), 2.5, 2.6, 2.7: no verbatim example available for procedural, conceptual/overview, reference, walkthrough, and FAQ article types (no `DOCS_CORPUS` supplied).
  - `<!-- GAP -->` in Section 4: no verbatim example available for a real procedure block.
  - `<!-- GAP -->` in Section 6: no verbatim example available for a real hint/callout block.
  - `<!-- GAP -->` in Section 7: no verbatim example available for a real "Related information" section.
  - `<!-- GAP -->` in Section 8.1: no verbatim example available for a real reference table.
  - `<!-- GAP -->` in Section 11.5: the human guide's reusable-content include syntax was shown only as a screenshot image, not as text; the syntax given here is inferred from the guide's own use of `{% file src="..." %}...{% endfile %}` in its introductory paragraph. Confirm against real source files if a corpus becomes available.

- **Source defects fixed:**
  - Removed a duplicated rule: "Repeating a noun is preferable to replacing it with a pronoun" appeared twice in the General Guidelines list (once run into the end of the "Write conditional clauses before instructions" bullet, once as its own bullet). Kept one copy, in Section 7.2, and separated it cleanly from the conditional-clause rule (Section 7.2/9.1).
  - Corrected "ﬁ" ligature OCR/encoding artifacts throughout the rewritten prose (e.g., "deﬁnitions" → "definitions," "speciﬁc" → "specific," "ﬁle" → "file," "workﬂow" → "workflow").
  - Repaired line-wrapped/broken URLs encountered in dropped illustrative examples (spaces inside "continia-payment- management," "getting- started," and "ui- search-filter-faq"); since the surrounding content was dropped as non-actionable reference pointers (see Dropped content), the corrected URLs were not carried into the output, but the defect is logged here per the sanitize requirement.

- **Corpus discrepancies:** not applicable — no `DOCS_CORPUS` was supplied for this run.