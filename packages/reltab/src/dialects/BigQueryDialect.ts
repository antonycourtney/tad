import { SQLDialect } from "../dialect";

export class BigQueryDialect implements SQLDialect {
  private static instance: BigQueryDialect;
  quoteCol(cid: string): string {
    return "`" + cid + "`";
  }

  static getInstance(): BigQueryDialect {
    if (!BigQueryDialect.instance) {
      BigQueryDialect.instance = new BigQueryDialect();
    }
    return BigQueryDialect.instance;
  }
}
