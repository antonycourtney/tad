import { SQLDialect } from "./dialect";
import { SQLiteDialect } from "./dialects/SQLiteDialect";
import { BigQueryDialect } from "./dialects/BigQueryDialect";

export const dialects: { [dialectName: string]: SQLDialect } = {
  sqlite: SQLiteDialect,
  bigquery: BigQueryDialect,
};
