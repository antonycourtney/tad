import { SQLDialect } from "../dialect";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import * as log from "loglevel";
import { BaseSQLDialect } from "../BaseSQLDialect";

const numberCT = new ColumnType("NUMBER", "integer");
const floatCT = new ColumnType("FLOAT", "real");
const stringCT = new ColumnType("VARCHAR", "string");
const boolCT = new ColumnType("BOOLEAN", "boolean");

const dateCT = new ColumnType("DATE", "date");
const timestampCT = new ColumnType("TIMESTAMP_NTZ", "timestamp");

class SnowflakeDialectClass extends BaseSQLDialect {
  private static instance: SnowflakeDialectClass;
  readonly dialectName: string = "snowflake";
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: numberCT,
    real: floatCT,
    string: stringCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    NUMBER: numberCT,
    FLOAT: floatCT,
    STRING: stringCT,
    VARCHAR: stringCT,
    BOOL: boolCT,
    DATE: dateCT,
    TIMESTAMP: timestampCT,
  };

  quoteCol(cid: string): string {
    return '"' + cid + '"';
  }

  ppAggNull(aggStr: string, subExpStr: string, colType: ColumnType): string {
    return `CAST(null as ${colType.sqlTypeName})`;
  }

  static getInstance(): SnowflakeDialectClass {
    if (!SnowflakeDialectClass.instance) {
      SnowflakeDialectClass.instance = new SnowflakeDialectClass();
    }
    return SnowflakeDialectClass.instance;
  }
}

export const SnowflakeDialect = SnowflakeDialectClass.getInstance();
