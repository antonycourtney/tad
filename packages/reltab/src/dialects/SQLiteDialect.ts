import { SQLDialect } from "../dialect";

export class SQLiteDialect implements SQLDialect {
  private static instance: SQLiteDialect;
  stringType: string = "TEXT";

  quoteCol(cid: string): string {
    return '"' + cid + '"';
  }

  static getInstance(): SQLiteDialect {
    if (!SQLiteDialect.instance) {
      SQLiteDialect.instance = new SQLiteDialect();
    }
    return SQLiteDialect.instance;
  }
}
