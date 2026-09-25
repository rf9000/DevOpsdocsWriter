/**
 * Product registry: maps Azure DevOps area-path segments to the product's docs
 * home(s) (folders under `<DOCS_REPO_PATH>/en-us/`, each with its article-id
 * prefix) and the key of its AL source repo.
 *
 * Stable facts of the docs site (folder names and prefixes verified against
 * continia.docs.articles); machine-specific paths stay in `.env`
 * (`TARGET_REPO_PATH_<REPOKEY>`). Adding a product = one entry here plus its
 * env var.
 */

/** One folder in the docs set a product's articles can live in. */
export interface DocsHome {
  /**
   * The folder under `<DOCS_REPO_PATH>/en-us/`, spelled exactly as it is on
   * disk. The docs site is mid-migration to GitBook, so the products already
   * synced from there use kebab-case folders while the rest keep the older
   * title-case ones — the container host is Linux, so the casing and the
   * hyphens both matter.
   */
  docsFolder: string;
  /** The article-id prefix used in that folder (e.g. `CB-130`). */
  prefix: string;
}

export interface ProductInfo {
  /** The area-path segment that identifies the product in Azure DevOps. */
  areaName: string;
  /** The solution's full name, as used in prompts and work-item comments. */
  name: string;
  /**
   * Candidate docs homes, in tie-break order. Exactly one for every product but
   * Continia Delivery Network, whose eDocuments content was folded into mirrored
   * subfolders of Document Capture and Document Output. Prefixes are unique
   * within a product — the classifier derives an article's home from its id.
   */
  homes: readonly DocsHome[];
  /**
   * Key for `TARGET_REPO_PATH_<REPOKEY>`, the product's AL source repo. Equal to
   * `homes[0].prefix` for single-home products; Delivery Network reuses the DC
   * and DO docs folders but has a source repo of its own, so it needs its own
   * key.
   */
  repoKey: string;
}

/** Keyed by the ADO area-path segment name. */
export const PRODUCTS: ReadonlyMap<string, ProductInfo> = new Map(
  [
    ...(
      [
        ['Continia Banking', 'Continia Banking', 'continia-banking', 'CB'],
        ['Document Capture', 'Continia Document Capture', 'continia-document-capture', 'DC'],
        ['Expense Management', 'Continia Expense Management', 'continia-expense-management', 'EM'],
        ['Payment Management', 'Continia Payment Management', 'Continia Payment Management', 'PM'],
        ['Collection Management', 'Continia Collection Management', 'Continia Collection Management', 'CM'],
        ['Document Output', 'Continia Document Output', 'continia-document-output', 'DO'],
        ['Continia Finance', 'Continia Finance', 'continia-finance', 'CF'],
        ['OPplus', 'Continia OPplus', 'Continia OPplus', 'COPP'],
        ['Continia Sustainability', 'Continia Sustainability', 'Continia Sustainability', 'CS'],
      ] as const
    ).map(([areaName, name, docsFolder, prefix]): [string, ProductInfo] => [
      areaName,
      { areaName, name, homes: [{ docsFolder, prefix }], repoKey: prefix },
    ]),
    [
      'Continia eDocuments',
      {
        areaName: 'Continia eDocuments', // the ADO area segment
        name: 'Continia Delivery Network', // the product name used in prompts and comments
        repoKey: 'CDN',
        homes: [
          { docsFolder: 'continia-document-capture', prefix: 'DC' },
          { docsFolder: 'continia-document-output', prefix: 'DO' },
        ],
      },
    ] as [string, ProductInfo],
  ],
);

/**
 * Resolve a work item's area path (e.g. `Continia Software\Continia Banking\
 * Banking Connectivity`) to a product. Segments are scanned left to right and
 * the first mapped segment wins, so nested product areas and variants like
 * `Continia Online\Continia Banking` both resolve. Returns undefined for
 * non-product areas (`Continia Core`, `InHouse`, ...).
 */
export function resolveProduct(areaPath: string): ProductInfo | undefined {
  for (const segment of areaPath.split('\\')) {
    const product = PRODUCTS.get(segment.trim());
    if (product) return product;
  }
  return undefined;
}
