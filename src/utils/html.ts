const IMG_TAG_RE = /<img\s[^>]*>/gi;

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

const ENTITY_RE = /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g;
const NUMERIC_ENTITY_RE = /&#(\d+);/g;

/**
 * Strip HTML tags, convert block-level elements to newlines, decode entities.
 * Removes <img> tags entirely. Used to turn ADO rich-text fields/comments into
 * clean plain text for the agent prompt.
 */
export function stripHtmlToText(html: string): string {
  let text = html;

  // Remove img tags entirely
  text = text.replace(IMG_TAG_RE, '');

  // Convert list items to bullets (before generic block handling)
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');

  // Convert block-level elements to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n');
  text = text.replace(/<(?:p|div|tr|h[1-6])\b[^>]*>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(ENTITY_RE, (entity) => ENTITY_MAP[entity] ?? entity);
  text = text.replace(NUMERIC_ENTITY_RE, (_, code) =>
    String.fromCharCode(Number(code)),
  );

  // Normalize whitespace: collapse multiple blank lines, trim
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}
