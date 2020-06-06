import { SQLDialect } from "../dialect";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import * as log from "loglevel";

const intCT = new ColumnType("INT", "integer");
const floatCT = new ColumnType("REAL", "real");
const stringCT = new ColumnType("STRING", "string");
const boolCT = new ColumnType("BOOLEAN", "boolean");

const dateCT = new ColumnType("DATE", "date");
const timestampCT = new ColumnType("TIMESTAMP", "timestamp");

class PrestoDialectClass implements SQLDialect {
  private static instance: PrestoDialectClass;
  readonly dialectName: string = "presto";
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: floatCT,
    string: stringCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    INT: intCT,
    REAL: floatCT,
    STRING: stringCT,
    BOOLEAN: boolCT,
    DATE: dateCT,
    TIMESTAMP: timestampCT,
  };

  quoteCol(cid: string): string {
    return `"${cid}"`;
  }

  ppAggNull(aggStr: string, subExpStr: string, colType: ColumnType): string {
    return `CAST(null as ${colType.sqlTypeName})`;
  }

  static getInstance(): PrestoDialectClass {
    if (!PrestoDialectClass.instance) {
      PrestoDialectClass.instance = new PrestoDialectClass();
    }
    return PrestoDialectClass.instance;
  }
}

export const PrestoDialect = PrestoDialectClass.getInstance();
