# Continia Documentation Style Guide (Agent Reference)

This file is a small, valid stand-in for the upstream style guide. Tests edit it to build damaged variants.

## Table of contents

1. [Frontmatter](#1-frontmatter)
2. [Procedures](#2-procedures)
3. [Links](#3-links)

---

## 1. Frontmatter

Every article starts with a filename line and a `meta` block.

**Example:**

````
basic-concepts

```meta
title: Basic concepts
date: [dd-mm-yyyy]
id: EM-###
lang: en
```

# Basic concepts
````

## 2. Procedures

Number every step. Start each step with an imperative verb.

| Situation | Rule |
|---|---|
| One step | Use a sentence, not a list. |
| Several steps | Use a numbered list. |

## 3. Links

Link to other articles with the article id.

```
@[EM-123]
```

End of guide.
