/**
 * Definitions and interface for metadata and generation of various SQL dialects
 */

export interface SQLDialect {
  quoteCol(cid: string): string;
}
