import { SQLDialect } from "../dialect";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import { BaseSQLDialect } from "../BaseSQLDialect";

const intCT = new ColumnType("INTEGER", "integer");
const realCT = new ColumnType("REAL", "real");
const textCT = new ColumnType("TEXT", "string");

export class SQLiteDialectClass extends BaseSQLDialect {
  private static instance: SQLiteDialectClass;
  readonly dialectName: string = "sqlite";
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: realCT,
    string: textCT,
    boolean: intCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    INTEGER: intCT,
    REAL: realCT,
    TEXT: textCT,
  };

  static getInstance(): SQLiteDialectClass {
    if (!SQLiteDialectClass.instance) {
      SQLiteDialectClass.instance = new SQLiteDialectClass();
    }
    return SQLiteDialectClass.instance;
  }
}

export const SQLiteDialect = SQLiteDialectClass.getInstance();
