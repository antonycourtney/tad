import { AggFn, numericAggFns, basicAggFns } from "./AggFn";
import { defaultDialect } from "./defs";

export class ColumnType {
  readonly sqlTypeName: string;
  readonly isNumeric: boolean;
  readonly isString: boolean;
  readonly defaultAggFn: AggFn;

  constructor(
    sqlTypeName: string,
    isNumeric: boolean,
    isString: boolean,
    defaultAggFn: AggFn
  ) {
    this.sqlTypeName = sqlTypeName;
    this.isNumeric = isNumeric;
    this.isString = isString;
    this.defaultAggFn = defaultAggFn;
  }
}

export interface CoreColumnTypes {
  integer: ColumnType;
  real: ColumnType;
  string: ColumnType;
  boolean: ColumnType;
}

export const aggFns = (ct: ColumnType): AggFn[] => {
  if (ct.isNumeric) {
    return numericAggFns;
  }
  return basicAggFns;
};

export type ColumnTypeMap = { [tname: string]: ColumnType };
