import { SQLDialect } from "./dialect";
import { SQLiteDialect } from "./dialects/SQLiteDialect";
import { DuckDBDialect } from "./dialects/DuckDBDialect";
import { BigQueryDialect } from "./dialects/BigQueryDialect";
import { PrestoDialect } from "./dialects/PrestoDialect";
import { SnowflakeDialect } from "./dialects/SnowflakeDialect";

export const dialects: { [dialectName: string]: SQLDialect } = {
  duckdb: DuckDBDialect,
  sqlite: SQLiteDialect,
  bigquery: BigQueryDialect,
  presto: PrestoDialect,
  snowflake: SnowflakeDialect,
};

export { BigQueryDialect, PrestoDialect, SQLiteDialect, SnowflakeDialect, DuckDBDialect };
