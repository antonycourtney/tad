import { SQLDialect } from "../dialect";
import { ColumnType } from "../Schema";

export class BigQueryDialect implements SQLDialect {
  private static instance: BigQueryDialect;
  stringType: string = "STRING";

  quoteCol(cid: string): string {
    return "`" + cid + "`";
  }

  ppAggNull(aggStr: string, subExpStr: string, colType: ColumnType): string {
    return `CAST(null as ${colType.toUpperCase()})`;
  }

  static getInstance(): BigQueryDialect {
    if (!BigQueryDialect.instance) {
      BigQueryDialect.instance = new BigQueryDialect();
    }
    return BigQueryDialect.instance;
  }
}
