/**
 *  Common type definitions used throughout reltab
 */
import { SQLDialect } from "./dialect";
import { SQLiteDialect } from "./dialects/SQLiteDialect";

// Exported so that we can do things like pretty print a FilterExp for
// UI or debugging even when no db connection / preferred dialect
// available
export const defaultDialect = SQLiteDialect;

export type Scalar = number | string | boolean | null;

interface ConstVal {
  expType: "ConstVal";
  val: Scalar;
}
export const constVal = (val: Scalar): ConstVal => ({
  expType: "ConstVal",
  val,
});

interface ColRef {
  expType: "ColRef";
  colName: string;
}
export const col = (colName: string): ColRef => ({
  expType: "ColRef",
  colName,
});

type WindowFn = "row_number";

interface WindowExp {
  expType: "WindowExp";
  fn: WindowFn;
}

export type ValExp = ConstVal | ColRef | WindowExp;

// A text cast operator applied to a ValExp:
interface AsString {
  expType: "AsString";
  valExp: ValExp;
}
export const asString = (valExp: ValExp): AsString => ({
  expType: "AsString",
  valExp,
});

export type ColumnExtendExp = ValExp | AsString;

const escRegEx = /[\0\n\r\b\t'"\x1a]/g;
export const sqlEscapeMbString = (
  inStr: string | undefined | null
): string | undefined | null => {
  return inStr ? sqlEscapeString(inStr) : inStr;
};
export const sqlEscapeString = (inStr: string): string => {
  const outStr = inStr.replace(escRegEx, (s) => {
    switch (s) {
      case "\0":
        return "\\0";

      case "\n":
        return "\\n";

      case "\r":
        return "\\r";

      case "\b":
        return "\\b";

      case "\t":
        return "\\t";

      case "\x1a":
        return "\\Z";

      case "'":
        return "''";

      case '"':
        return '""';

      default:
        return "\\" + s;
    }
  });
  return ["'", outStr, "'"].join("");
};
