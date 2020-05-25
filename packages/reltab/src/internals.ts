/**
 *
 * Common types and functions used across reltab modules, but not intended for re-export.
 *
 *
 */

import {
  ValExp,
  constVal,
  col,
  sqlEscapeString,
  ColumnExtendExp,
} from "./defs";
import { SQLDialect } from "./dialect";

export const valExpToSqlStr = (dialect: SQLDialect, vexp: ValExp): string => {
  let ret: string;
  switch (vexp.expType) {
    case "ConstVal":
      ret =
        vexp.val == null
          ? "null"
          : typeof vexp.val === "string"
          ? sqlEscapeString(vexp.val)
          : vexp.val.toString();
      break;
    case "ColRef":
      ret = dialect.quoteCol(vexp.colName);
      break;
    default:
      const invalid: never = vexp;
      throw new Error(`Unknown value expression expType: ${invalid}`);
  }
  return ret;
};

export const colExtendExpToSqlStr = (
  dialect: SQLDialect,
  cexp: ColumnExtendExp
): string => {
  let ret: string;
  switch (cexp.expType) {
    case "AsString":
      ret = `CAST(${valExpToSqlStr(dialect, cexp.valExp)} AS ${
        dialect.coreColumnTypes.string.sqlTypeName
      })`;
      break;
    default:
      ret = valExpToSqlStr(dialect, cexp);
  }
  return ret;
};

export const deserializeValExp = (js: any): ValExp => {
  // attempt to deal with migration from v0.9 format,
  // where the discriminator was called "expType" instead of "expType"
  // and we used classes rather than tagged unions.
  if (js.hasOwnProperty("expType")) {
    if (js.expType === "ConstVal") {
      return constVal(js.val);
    } else {
      return col(js.colName);
    }
  } else {
    // tagged union format should just serialize as itself
    return js as ValExp;
  }
};

/* An array of strings that will be joined with Array.join('') to
 * form a final result string
 */

export type StringBuffer = string[];
export const ppOut = (dst: StringBuffer, depth: number, str: string): void => {
  const indentStr = "  ".repeat(depth);
  dst.push(indentStr);
  dst.push(str);
};
