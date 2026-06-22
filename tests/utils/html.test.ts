import { describe, test, expect } from 'bun:test';
import { markdownToHtml } from '../../src/utils/html.ts';

describe('markdownToHtml', () => {
  test('renders headings, bold and inline code as HTML, not literal Markdown', () => {
    const html = markdownToHtml('## Verdict\n\n**PASS** with `CB-3631`.');
    expect(html).toContain('<h2');
    expect(html).toContain('<strong>PASS</strong>');
    expect(html).toContain('<code>CB-3631</code>');
    // none of the raw Markdown tokens survive
    expect(html).not.toContain('## ');
    expect(html).not.toContain('**PASS**');
  });

  test('renders fenced code blocks as <pre><code> instead of literal ``` fences', () => {
    const html = markdownToHtml('```\nsome code\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code>');
    expect(html).not.toContain('```');
  });

  test('renders thematic breaks (---) as <hr>', () => {
    const html = markdownToHtml('above\n\n---\n\nbelow');
    expect(html).toContain('<hr');
    expect(html).not.toMatch(/^---$/m);
  });
});
