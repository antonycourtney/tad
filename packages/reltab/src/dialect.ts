/**
 * Definitions and interface for metadata and generation of various SQL dialects
 */

export interface SQLDialect {
  stringType: string; // name of the string type: "TEXT" for SQLite, "STRING" for BigQuery,...
}
