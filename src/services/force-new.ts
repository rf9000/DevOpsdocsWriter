import type { OutputKind } from '../types/index.ts';
import type { ClassificationCandidate, DocsClassification } from './classifier.ts';

/** How the user asked for a new article: a work-item comment or the force tag. */
export type ForceNewSource = 'comment' | 'tag';

/** Record of an override: what forced it and what the classifier had decided. */
export interface ForcedNew {
  by: ForceNewSource;
  /** The classifier's own kind, before the override. */
  from: OutputKind;
  /** The article the classifier wanted to update (when `from` is `update`). */
  target?: string;
}

/**
 * The comment marker, as a whole token: not part of a longer hashtag or word
 * (`#new-article-ideas`, `foo#new-article`, `##new-article` do not count).
 * docsWriter's own comments must never contain this literal text, or they
 * would force every later run of the item.
 */
const MARKER_RE = /(?<![\w#])#new-article(?![\w-])/i;

/**
 * Whether the work item asks for a new article regardless of the classifier's
 * decision. `tags` is the raw `System.Tags` value (`"a; b; c"`). The tag wins
 * when both are present — it is the more deliberate, one-shot signal.
 */
export function detectForceNew(
  comments: readonly string[],
  tags: string,
  forceTag: string,
): ForceNewSource | undefined {
  const wanted = forceTag.trim().toLowerCase();
  if (wanted && tags.split(';').some((t) => t.trim().toLowerCase() === wanted)) return 'tag';
  if (comments.some((c) => MARKER_RE.test(c))) return 'comment';
  return undefined;
}

/**
 * Take the force out of any marker in text docsWriter is about to post (drops
 * the `#`). The agents see the user's comments and may quote them; an echoed
 * marker in docsWriter's own comment would keep forcing the item after the
 * user deleted theirs.
 */
export function neutralizeMarker(text: string): string {
  return text.replace(new RegExp(MARKER_RE.source, 'gi'), (match) => match.slice(1));
}

/**
 * Turn the classifier's decision into a new article when the user forced one.
 * The classifier still ran, so its findings are kept: the docs home stays (for
 * an update, the home of the article it would have updated) and that article
 * becomes the first candidate, so the human still sees it. A decision that is
 * already `newfeature` is returned untouched, with no `forced` record.
 */
export function applyForceNew(
  c: DocsClassification,
  by: ForceNewSource | undefined,
): DocsClassification {
  if (!by || c.kind === 'newfeature') return c;

  const { target, targetFile, ...rest } = c;
  let candidates: ClassificationCandidate[] = c.candidates;
  if (c.kind === 'update' && target) {
    candidates = [
      {
        id: target,
        file: targetFile ?? '',
        docsFolder: c.docsFolder,
        reason: "The classifier's update target",
      },
      ...c.candidates.filter((x) => x.id !== target),
    ];
  }

  return {
    ...rest,
    kind: 'newfeature',
    candidates,
    forced: { by, from: c.kind, ...(target ? { target } : {}) },
  };
}

/**
 * Markdown addendum for the work-item comment: says the new article was forced
 * and what the classifier would have done instead. Built in code so it is
 * guaranteed present — and guaranteed free of the comment marker.
 */
export function forcedNote(c: DocsClassification, forceTag: string): string {
  if (!c.forced) return '';
  const source =
    c.forced.by === 'tag' ? `the \`${forceTag}\` tag` : 'a work-item comment';
  const otherwise =
    c.forced.from === 'update'
      ? `updated ${c.forced.target ?? 'an existing article'}`
      : 'written a changelog entry';
  return `\n\n**New article forced** — requested by ${source}. The classifier would otherwise have ${otherwise}.`;
}
