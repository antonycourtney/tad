import { SQLDialect } from "../dialect";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";

const intCT = new ColumnType("integer", true, false, "sum");
const realCT = new ColumnType("real", true, false, "sum");
const textCT = new ColumnType("text", false, true, "uniq");
const boolCT = new ColumnType("boolean", false, false, "uniq");

export class SQLiteDialect implements SQLDialect {
  private static instance: SQLiteDialect;
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: realCT,
    string: textCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    boolean: boolCT,
    integer: intCT,
    real: realCT,
    string: textCT,
    text: textCT,
  };

  quoteCol(cid: string): string {
    return '"' + cid + '"';
  }

  ppAggNull(aggStr: string, subExpStr: string, expType: ColumnType): string {
    return "null";
  }

  static getInstance(): SQLiteDialect {
    if (!SQLiteDialect.instance) {
      SQLiteDialect.instance = new SQLiteDialect();
    }
    return SQLiteDialect.instance;
  }
}
