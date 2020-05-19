import { SQLDialect } from "../dialect";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import * as log from "loglevel";

const intCT = new ColumnType("INT64", true, false, "sum");
const floatCT = new ColumnType("FLOAT64", true, false, "sum");
const stringCT = new ColumnType("STRING", false, true, "uniq");
const boolCT = new ColumnType("BOOL", false, false, "uniq");

// Construct a ColumnType meta-object for an unknown type name:
const mkGenColumnType = (tnm: string): ColumnType =>
  new ColumnType(tnm, false, false, "null");

export class BigQueryDialect implements SQLDialect {
  private static instance: BigQueryDialect;
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: floatCT,
    string: stringCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    int64: intCT,
    float64: floatCT,
    string: stringCT,
    bool: boolCT,
  };

  quoteCol(cid: string): string {
    return "`" + cid + "`";
  }

  ppAggNull(aggStr: string, subExpStr: string, colType: ColumnType): string {
    return `CAST(null as ${colType.sqlTypeName})`;
  }

  static getInstance(): BigQueryDialect {
    if (!BigQueryDialect.instance) {
      BigQueryDialect.instance = new BigQueryDialect();
    }
    return BigQueryDialect.instance;
  }

  getColumnType(tnm: string): ColumnType {
    let ret = this.columnTypes[tnm] as ColumnType | undefined;
    if (ret == null) {
      // log.debug(
      console.log(
        "no column type found for type name '" + tnm + "' -- adding entry"
      );
      ret = mkGenColumnType(tnm);
      this.columnTypes[tnm] = ret;
      // throw new Error("typeLookup: unknown type name: '" + tnm + "'");
    }
    return ret;
  }
}
