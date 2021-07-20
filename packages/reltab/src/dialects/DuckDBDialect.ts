import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import { BaseSQLDialect } from "../BaseSQLDialect";

const intCT = new ColumnType("INTEGER", "integer");
const realCT = new ColumnType("REAL", "real");
const textCT = new ColumnType("VARCHAR", "string");

export class DuckDBDialectClass extends BaseSQLDialect {
  private static instance: DuckDBDialectClass;
  readonly dialectName: string = "duckdb";
  readonly requireSubqueryAlias: boolean = true;
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: realCT,
    string: textCT,
    boolean: intCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    INTEGER: intCT,
    BIGINT: intCT,
    REAL: realCT,
    TEXT: textCT,
    VARCHAR: textCT,
  };

  static getInstance(): DuckDBDialectClass {
    if (!DuckDBDialectClass.instance) {
      DuckDBDialectClass.instance = new DuckDBDialectClass();
    }
    return DuckDBDialectClass.instance;
  }
}

export const DuckDBDialect = DuckDBDialectClass.getInstance();
