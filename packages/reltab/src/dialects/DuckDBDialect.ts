import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import { BaseSQLDialect } from "../BaseSQLDialect";

const intCT = new ColumnType("INTEGER", "integer");
const realCT = new ColumnType("DOUBLE", "real");
const textCT = new ColumnType("VARCHAR", "string");
const boolCT = new ColumnType("BOOL", "boolean");

const timestampCT = new ColumnType("TIMESTAMP", "timestamp", {
  stringRender: (val: any) => (val == null ? "" : new Date(val).toISOString()),
});

const blobCT = new ColumnType("BLOB", "blob", {
  stringRender: (val: any) => {
    if (val == null) {
      return "";
    }
    if (val instanceof Buffer) {
      return val.toString();
    }
    if (val instanceof Uint8Array) {
      const decoder = new TextDecoder();
      return decoder.decode(val);
    }
    return JSON.stringify(val);
  },
});

export class DuckDBDialectClass extends BaseSQLDialect {
  private static instance: DuckDBDialectClass;
  readonly dialectName: string = "duckdb";
  readonly requireSubqueryAlias: boolean = true;
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: realCT,
    string: textCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    INTEGER: intCT,
    BIGINT: intCT,
    DOUBLE: realCT,
    REAL: realCT,
    FLOAT: realCT,
    TEXT: textCT,
    TIMESTAMP: timestampCT,
    VARCHAR: textCT,
    BOOL: boolCT,
    BOOLEAN: boolCT,
    BLOB: blobCT,
  };

  static getInstance(): DuckDBDialectClass {
    if (!DuckDBDialectClass.instance) {
      DuckDBDialectClass.instance = new DuckDBDialectClass();
    }
    return DuckDBDialectClass.instance;
  }
}

export const DuckDBDialect = DuckDBDialectClass.getInstance();
