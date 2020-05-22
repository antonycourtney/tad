import { SQLDialect } from "../dialect";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import * as log from "loglevel";

const intCT = new ColumnType("INT64", "integer");
const floatCT = new ColumnType("FLOAT64", "real");
const stringCT = new ColumnType("STRING", "string");
const boolCT = new ColumnType("BOOL", "boolean");

const dateCT = new ColumnType("DATE", "date", {
  stringRender: (val: any) => (val == null ? "" : val.value),
});

class BigQueryDialectClass implements SQLDialect {
  private static instance: BigQueryDialectClass;
  readonly dialectName: string = "bigquery";
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: floatCT,
    string: stringCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    INT64: intCT,
    FLOAT64: floatCT,
    STRING: stringCT,
    BOOL: boolCT,
    DATE: dateCT,
  };

  quoteCol(cid: string): string {
    return "`" + cid + "`";
  }

  ppAggNull(aggStr: string, subExpStr: string, colType: ColumnType): string {
    return `CAST(null as ${colType.sqlTypeName})`;
  }

  static getInstance(): BigQueryDialectClass {
    if (!BigQueryDialectClass.instance) {
      BigQueryDialectClass.instance = new BigQueryDialectClass();
    }
    return BigQueryDialectClass.instance;
  }
}

export const BigQueryDialect = BigQueryDialectClass.getInstance();
