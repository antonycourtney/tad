import { SQLDialect } from "./dialect";
import { SQLiteDialect } from "./dialects/SQLiteDialect";
import { BigQueryDialect } from "./dialects/BigQueryDialect";
import { PrestoDialect } from "./dialects/PrestoDialect";

export const dialects: { [dialectName: string]: SQLDialect } = {
  sqlite: SQLiteDialect,
  bigquery: BigQueryDialect,
  presto: PrestoDialect,
};

export { BigQueryDialect, PrestoDialect, SQLiteDialect };
