#!/usr/bin/env python3
"""Deterministic linter for Continia documentation articles.

Implements the [script] rules from
.claude/skills/docs-writer/references/validation-rules.md

Usage:
    python lint_article.py <article.md> [<article2.md> ...]

Exit code: 0 if no BLOCKING findings across all files, 1 otherwise.
Stdlib only - no third-party dependencies.
"""

import os
import re
import sys

# (rule_id, severity, line_no, message)
BLOCKING = "BLOCKING"
WARNING = "WARNING"
INFO = "INFO"

# Only the style guide's invalid list is banned (§9.3); valid contractions
# (you'll, won't, it's, can't, don't, ...) are allowed.
INVALID_CONTRACTIONS = ["there'd", "they'd", "you'd", "it'd", "ain't"]
CONTRACTION_RE = re.compile(
    r"\b(" + "|".join(re.escape(c).replace("'", "[’']") for c in INVALID_CONTRACTIONS) + r")\b",
    re.IGNORECASE,
)
EM_DASH_RE = re.compile(r"—")
LATIN_ABBR_RE = re.compile(r"\b(e\.g\.|i\.e\.|etc\.|et al\.)", re.IGNORECASE)
# '!' in body text, excluding image syntax (![alt]) and GH alerts (> [!NOTE], caught by CO03)
EXCLAMATION_RE = re.compile(r"!(?!\[)")
PLURAL_S_RE = re.compile(r"\w\(s\)")

LINK_RE = re.compile(r"(!?)\[([^\]]*)\]\(([^)]+)\)")
IMG_EXT_RE = re.compile(r"\.(png|jpe?g|gif|svg|webp)(\?.*)?$", re.IGNORECASE)
# Internal article links: @<PREFIX>-### where <PREFIX> is the product's id
# prefix (CB, DC, EM, COPP, ...), optionally with a section anchor.
VALID_ID_LINK_RE = re.compile(r"^@[A-Z][A-Za-z0-9]*-\d+(@[\w-]+|#[\w-]+)?$")
# Article ids: <PREFIX>-### (e.g. CB-130, DC-178, COPP-04).
VALID_ID_RE = re.compile(r"^[A-Z][A-Za-z0-9]*-\d+$")
HINT_OPEN_RE = re.compile(r"\{%\s*hint\s+style=\"([^\"]*)\"\s*%\}")
HINT_OPEN_ANY_RE = re.compile(r"\{%\s*hint\b")
HINT_CLOSE_RE = re.compile(r"\{%\s*endhint\s*%\}")
GH_ALERT_RE = re.compile(r"^\s*>\s*\[!(NOTE|IMPORTANT|WARNING|TIP|CAUTION)\]")
VALID_HINT_STYLES = {"info", "success", "danger", "warning"}


# Product-name tails a title may add over the H1 (e.g. "... in Continia Banking",
# "... in Document Capture"); stripped before the HD02 comparison.
PRODUCT_TITLE_TAIL_RE = re.compile(
    r"\s+in (continia [\w ]+|document capture|expense management|payment management"
    r"|collection management|document output)$"
)


def normalize_title(text):
    text = text.lower().strip()
    text = PRODUCT_TITLE_TAIL_RE.sub("", text)
    text = re.sub(r"[^\w\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_frontmatter(lines):
    """Return (dict, end_line_index) or (None, -1) if no metadata block.

    Accepts the GitBook fenced form (```meta ... ```) and the legacy YAML form
    (--- ... ---). Both coexist while the corpus migrates to GitBook, so either
    delimiter is valid; new articles use ```meta.
    """
    if not lines:
        return None, -1
    first = lines[0].strip()
    if first == "---":
        is_closing = lambda s: s == "---"
    elif re.match(r"^`{3,}\s*meta\s*$", first):
        is_closing = lambda s: s.startswith("```")
    else:
        return None, -1
    fm = {}
    for i in range(1, len(lines)):
        if is_closing(lines[i].strip()):
            return fm, i
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", lines[i])
        if m:
            fm[m.group(1).strip()] = m.group(2).strip()
    return None, -1  # no closing fence


def lint(path):
    findings = []

    def add(rule, sev, line, msg):
        findings.append((rule, sev, line, msg))

    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        return [("IO", BLOCKING, 0, f"Cannot read file: {e}")]

    lines = text.splitlines()

    # ---- A. Frontmatter ----
    fm, fm_end = parse_frontmatter(lines)
    if fm is None:
        add("FM01", BLOCKING, 1, "Missing metadata block (```meta ... ``` or --- ... ---) at top of file.")
        fm = {}
    else:
        required = ["title", "description", "date", "id", "lang"]
        for key in required:
            if key not in fm:
                add("FM02", BLOCKING, 1, f"Frontmatter missing required key '{key}'.")
        if "date" in fm and not re.match(r"^\d{2}-\d{2}-\d{4}$", fm["date"]):
            add("FM03", BLOCKING, 1, f"date '{fm['date']}' is not DD-MM-YYYY.")
        if "id" in fm and not VALID_ID_RE.match(fm["id"]):
            add("FM04", BLOCKING, 1, f"id '{fm['id']}' is not in <PREFIX>-### form (e.g. CB-130, DC-178).")
        if "lang" in fm and fm["lang"] != "en":
            add("FM05", BLOCKING, 1, f"lang '{fm['lang']}' must be 'en'.")

    # body offset: lines after frontmatter
    body_start = fm_end + 1 if fm_end >= 0 else 0

    # IM01: the product's image folder, derived from the article's own id prefix
    # (id CB-130 -> /images/CB/, id DC-178 -> /images/DC/). None (generic
    # /images/ check) when the id is absent or malformed.
    article_id = fm.get("id", "")
    expected_image_dir = (
        f"/images/{article_id.split('-')[0]}/" if VALID_ID_RE.match(article_id) else None
    )

    # ---- B. Headings ----
    h1_lines = []
    for idx in range(body_start, len(lines)):
        if re.match(r"^#\s+\S", lines[idx]):
            h1_lines.append((idx + 1, lines[idx].lstrip("#").strip()))
    if len(h1_lines) == 0:
        add("HD01", BLOCKING, 1, "No H1 (# ) heading found.")
    elif len(h1_lines) > 1:
        nums = ", ".join(str(n) for n, _ in h1_lines)
        add("HD01", BLOCKING, h1_lines[1][0], f"Multiple H1 headings (lines {nums}); only one allowed.")
    if h1_lines and "title" in fm:
        if normalize_title(h1_lines[0][1]) != normalize_title(fm["title"]):
            # INFO, not WARNING: titles legitimately rephrase the H1 (e.g. "Introducing X"
            # vs "X in Continia Banking") in ~29% of the corpus.
            add("HD02", INFO, h1_lines[0][0],
                f"H1 '{h1_lines[0][1]}' does not match frontmatter title '{fm['title']}'.")

    # ---- Callout balance (whole doc) ----
    hint_open = 0
    hint_close = 0
    in_code = False
    for idx in range(len(lines)):
        line = lines[idx]
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        n = idx + 1
        # C. callouts
        if HINT_OPEN_ANY_RE.search(line):
            hint_open += 1
            m = HINT_OPEN_RE.search(line)
            if m:
                if m.group(1) not in VALID_HINT_STYLES:
                    add("CO02", BLOCKING, n, f"Hint style '{m.group(1)}' invalid (use info/success/danger/warning).")
            else:
                add("CO02", BLOCKING, n, "Malformed hint tag; expected {% hint style=\"info|success|danger|warning\" %}.")
        if HINT_CLOSE_RE.search(line):
            hint_close += 1
        if GH_ALERT_RE.match(line):
            add("CO03", WARNING, n, "GitHub-style alert (> [!...]); use {% hint %} instead.")

        # C (tone). VT01 invalid contractions
        for m in CONTRACTION_RE.finditer(line):
            add("VT01", WARNING, n, f"Invalid contraction '{m.group(0)}'; rephrase (valid-list contractions are fine).")

        # VT06 em dashes
        if EM_DASH_RE.search(line):
            add("VT06", WARNING, n, "Em dash (—) found; use an en dash (–) or restructure the sentence.")

        # VT07 Latin abbreviations
        for m in LATIN_ABBR_RE.finditer(line):
            add("VT07", WARNING, n, f"Latin abbreviation '{m.group(0)}' found; restructure the sentence instead.")

        # VT08 exclamation marks (image syntax excluded; GH alerts handled by CO03)
        if not GH_ALERT_RE.match(line) and EXCLAMATION_RE.search(line):
            add("VT08", WARNING, n, "Exclamation mark in body text; never use exclamation marks.")

        # VT09 "(s)" plural suffix
        if PLURAL_S_RE.search(line):
            add("VT09", WARNING, n, "'(s)' plural suffix found; use the plural or 'one or more'.")

        # UI05 search pattern
        if "for and select" in line and "Search" in line and "{{search}}" not in line:
            add("UI05", WARNING, n, "Page-open step should use 'Search ({{search}}) for and select'.")

        # F. links & G. images
        for lm in LINK_RE.finditer(line):
            is_img = lm.group(1) == "!"
            label = lm.group(2)
            target = lm.group(3).strip()
            if is_img:
                if IMG_EXT_RE.search(target) and not target.lower().startswith("http"):
                    if expected_image_dir and expected_image_dir not in target:
                        add("IM01", WARNING, n, f"Image '{target}' is not under {expected_image_dir}.")
                    elif not expected_image_dir and "/images/" not in target:
                        add("IM01", WARNING, n, f"Image '{target}' is not under /images/.")
                if label.strip() == "":
                    add("IM02", WARNING, n, "Image has empty alt text.")
            else:
                if target.startswith("@") and not VALID_ID_LINK_RE.match(target):
                    add("LK01", BLOCKING, n, f"Malformed internal link target '{target}' (expected @<PREFIX>-### or @<PREFIX>-###@anchor / @<PREFIX>-####anchor).")

    if hint_open != hint_close:
        add("CO01", BLOCKING, 0, f"Unbalanced hints: {hint_open} {{% hint %}} vs {hint_close} {{% endhint %}}.")

    # ---- LK05 Related information ----
    # INFO, not WARNING: ~86% of the published corpus omits this section, so it is a
    # suggestion (cross-linking is encouraged) rather than a defect.
    if not re.search(r"(?im)^##\s+Related information\s*$", text):
        add("LK05", INFO, 0, "Consider adding a '## Related information' section with @CB-### links.")

    return findings


def report(path, findings):
    order = {BLOCKING: 0, WARNING: 1, INFO: 2}
    findings = sorted(findings, key=lambda f: (order.get(f[1], 9), f[2]))
    counts = {BLOCKING: 0, WARNING: 0, INFO: 0}
    print(f"\n=== {path} ===")
    if not findings:
        print("  OK - no findings.")
        return 0
    for rule, sev, line, msg in findings:
        counts[sev] = counts.get(sev, 0) + 1
        loc = f"L{line}" if line else "--"
        print(f"  [{sev:8}] {loc:>5}  {rule}: {msg}")
    print(f"  -> {counts[BLOCKING]} blocking, {counts[WARNING]} warning, {counts[INFO]} info")
    return counts[BLOCKING]


def collect_files(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            for root, _dirs, names in os.walk(p):
                for name in names:
                    if name.lower().endswith(".md"):
                        files.append(os.path.join(root, name))
        else:
            files.append(p)
    return files


def summary(files):
    """Aggregate findings by rule across all files (corpus calibration)."""
    by_rule = {}  # rule -> [severity, count, set(files)]
    for path in files:
        for rule, sev, _line, _msg in lint(path):
            entry = by_rule.setdefault(rule, [sev, 0, set()])
            entry[1] += 1
            entry[2].add(path)
    total = len(files)
    print(f"\nCorpus summary over {total} file(s):\n")
    print(f"  {'RULE':6} {'SEV':9} {'HITS':>6} {'FILES':>6}  {'%FILES':>7}")
    order = {BLOCKING: 0, WARNING: 1, INFO: 2}
    for rule in sorted(by_rule, key=lambda r: (order.get(by_rule[r][0], 9), -len(by_rule[r][2]))):
        sev, hits, fset = by_rule[rule]
        pct = (100.0 * len(fset) / total) if total else 0.0
        print(f"  {rule:6} {sev:9} {hits:6d} {len(fset):6d}  {pct:6.1f}%")
    print()
    return 0


def main(argv):
    args = argv[1:]
    do_summary = False
    if "--summary" in args:
        do_summary = True
        args = [a for a in args if a != "--summary"]
    if not args:
        print(__doc__)
        return 2
    files = collect_files(args)
    if do_summary:
        return summary(files)
    total_blocking = 0
    for path in files:
        findings = lint(path)
        total_blocking += report(path, findings)
    print()
    return 1 if total_blocking else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
