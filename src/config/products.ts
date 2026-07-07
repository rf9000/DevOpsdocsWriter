/**
 * Product registry: maps Azure DevOps area-path segments to the product's docs
 * folder (under `<DOCS_REPO_PATH>/en-us/`) and its article-id prefix.
 *
 * Stable facts of the docs site (folder names and prefixes verified against
 * continia.docs.articles); machine-specific paths stay in `.env`
 * (`TARGET_REPO_PATH_<PREFIX>`). Adding a product = one entry here plus its
 * env var.
 */
export interface ProductInfo {
  /** The area-path segment that identifies the product in Azure DevOps. */
  areaName: string;
  /** The product's folder under `<DOCS_REPO_PATH>/en-us/`. */
  docsFolder: string;
  /** The article-id prefix used in that folder (e.g. `CB-130`). */
  prefix: string;
}

/** Keyed by the ADO area-path segment name. */
export const PRODUCTS: ReadonlyMap<string, ProductInfo> = new Map(
  (
    [
      ['Continia Banking', 'Continia Banking', 'CB'],
      ['Document Capture', 'Continia Document Capture', 'DC'],
      ['Expense Management', 'Continia Expense Management', 'EM'],
      ['Payment Management', 'Continia Payment Management', 'PM'],
      ['Collection Management', 'Continia Collection Management', 'CM'],
      ['Document Output', 'Continia Document Output', 'DO'],
      ['Continia Finance', 'Continia Finance', 'CF'],
      ['OPplus', 'Continia OPplus', 'COPP'],
      ['Continia Sustainability', 'Continia Sustainability', 'CS'],
    ] as const
  ).map(([areaName, docsFolder, prefix]) => [
    areaName,
    { areaName, docsFolder, prefix },
  ]),
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
