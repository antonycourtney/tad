import { SQLDialect } from "../dialect";
import { ColumnType } from "../Schema";

export class SQLiteDialect implements SQLDialect {
  private static instance: SQLiteDialect;
  stringType: string = "TEXT";

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
