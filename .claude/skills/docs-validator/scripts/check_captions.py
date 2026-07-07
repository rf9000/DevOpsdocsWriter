#!/usr/bin/env python3
"""Accuracy (anti-hallucination) check for Continia docs — rule AC01.

Extracts every **bold** UI term from a documentation article and checks whether each one
exists as an AL `Caption` somewhere in the codebase. Bold terms that do not match any caption
(and are not generic system buttons or product names) are surfaced for human verification —
they may be hallucinated UI, or simply emphasis. This is advisory: it reports, it does not fail.

Usage:
    python check_captions.py [--al-root <dir>] <article.md> [<article2.md> ...]

--al-root defaults to the current working directory (the AL repo root).
Stdlib only - no third-party dependencies.
"""

import os
import re
import sys

CAPTION_RE = re.compile(r"Caption\s*=\s*'((?:[^']|'')*)'")
BOLD_RE = re.compile(r"\*\*([^*]+?)\*\*")
INLINE_CODE_RE = re.compile(r"`[^`]*`")
SKIP_DIRS = {".alpackages", ".git", "node_modules", ".vscode", "bin", "obj", ".serena"}

# Generic UI that won't appear as an app-specific Caption (standard BC ribbon/system buttons,
# product names, common menu groups). Lowercase.
ALLOWLIST = {
    "ok", "cancel", "yes", "no", "next", "back", "previous", "finish", "close",
    "new", "delete", "edit", "view", "save", "confirm", "apply", "open", "refresh",
    "home", "actions", "related", "navigate", "process", "report", "reports",
    "prepare", "page", "more options", "functions", "show more columns",
    "show fewer columns", "continia banking", "business central", "microsoft dynamics 365",
}


def normalize(text):
    text = text.replace("''", "'").strip()
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def build_caption_index(al_root):
    captions = set()
    for root, dirs, names in os.walk(al_root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            if not name.lower().endswith(".al"):
                continue
            try:
                with open(os.path.join(root, name), "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except OSError:
                continue
            for m in CAPTION_RE.finditer(content):
                captions.add(normalize(m.group(1)))
    return captions


def extract_bold_terms(path):
    """Return list of (term, line_no), skipping frontmatter and code blocks."""
    terms = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
    except OSError as e:
        print(f"  Cannot read {path}: {e}")
        return terms
    in_code = False
    in_fm = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if i == 0 and stripped == "---":
            in_fm = True
            continue
        if in_fm:
            if stripped == "---":
                in_fm = False
            continue
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        clean = INLINE_CODE_RE.sub("", line)
        for m in BOLD_RE.finditer(clean):
            term = m.group(1).strip().rstrip(".:,;")
            # skip template placeholders and obvious non-UI
            if not term or any(c in term for c in "{}[]<>%"):
                continue
            terms.append((term, i + 1))
    return terms


def check(path, captions):
    terms = extract_bold_terms(path)
    seen = {}
    for term, line in terms:
        key = normalize(term)
        if key in ALLOWLIST or key in captions:
            continue
        # allow a bold term that is a substring match of a known caption (e.g. "Direct Debit"
        # appearing within a longer caption) to reduce false positives
        if any(key in cap for cap in captions):
            continue
        seen.setdefault(key, (term, line))
    print(f"\n=== {path} ===")
    if not seen:
        print("  AC01 OK - all bold UI terms match an AL caption (or are generic).")
        return 0
    print(f"  AC01 [VERIFY] {len(seen)} bold term(s) not found as an AL Caption - confirm they")
    print("  are real UI (or intentional emphasis), not hallucinated:")
    for key, (term, line) in sorted(seen.items(), key=lambda kv: kv[1][1]):
        print(f"    L{line}: **{term}**")
    return len(seen)


def main(argv):
    args = argv[1:]
    al_root = os.getcwd()
    if "--al-root" in args:
        idx = args.index("--al-root")
        try:
            al_root = args[idx + 1]
            del args[idx:idx + 2]
        except IndexError:
            print("--al-root requires a directory argument")
            return 2
    if not args:
        print(__doc__)
        return 2
    print(f"Indexing AL captions under: {al_root}")
    captions = build_caption_index(al_root)
    print(f"  {len(captions)} unique captions indexed.")
    if not captions:
        print("  WARNING: no captions found — is --al-root pointing at the AL repo?")
    for path in args:
        check(path, captions)
    print()
    return 0  # advisory: never hard-fail


if __name__ == "__main__":
    sys.exit(main(sys.argv))
