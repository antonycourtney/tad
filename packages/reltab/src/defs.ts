/**
 *  Common type definitions used throughout reltab
 */
import { ColumnType } from "./ColumnType";
import { SQLDialect } from "./dialect";
import { SQLiteDialect, SQLiteDialectClass } from "./dialects/SQLiteDialect";

// Exported so that we can do things like pretty print a FilterExp for
// UI or debugging even when no db connection / preferred dialect
// available
export const defaultDialect = SQLiteDialect;

export const getDefaultDialect = (): SQLDialect => {
  return SQLiteDialectClass.getInstance();
};

export type Scalar = bigint | number | string | boolean | null;

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
  tblAlias?: string;
}
export const col = (colName: string, tblAlias?: string): ColRef => ({
  expType: "ColRef",
  colName,
  tblAlias,
});

type WindowFn = "row_number";

interface WindowExp {
  expType: "WindowExp";
  fn: WindowFn;
}

interface CastExp {
  expType: "CastExp";
  subExp: ValExp;
  asType: ColumnType;
}

export const cast = (subExp: ValExp, asType: ColumnType): CastExp => ({
  expType: "CastExp",
  subExp,
  asType,
});

export type BinValOp = "+" | "-" | "*" | "/";

// A binary operator value expression (can appear in a SQL select):
export class BinValExp {
  expType: "BinValExp";
  op: BinValOp;
  lhs: ValExp;
  rhs: ValExp;

  constructor(op: BinValOp, lhs: ValExp, rhs: ValExp) {
    this.expType = "BinValExp";
    this.op = op;
    this.lhs = lhs;
    this.rhs = rhs;
  }

  toSqlStr(dialect: SQLDialect): string {
    return `(${valExpToSqlStr(dialect, this.lhs)} ${this.op} ${valExpToSqlStr(
      dialect,
      this.rhs
    )})`;
  }
}
export const plus = (lhs: ValExp, rhs: ValExp): BinValExp =>
  new BinValExp("+", lhs, rhs);
export const minus = (lhs: ValExp, rhs: ValExp): BinValExp =>
  new BinValExp("-", lhs, rhs);
export const multiply = (lhs: ValExp, rhs: ValExp): BinValExp =>
  new BinValExp("*", lhs, rhs);
export const divide = (lhs: ValExp, rhs: ValExp): BinValExp =>
  new BinValExp("/", lhs, rhs);

export type UnaryValOp = "round" | "floor" | "ceil";

export class UnaryValExp {
  expType: "UnaryValExp";
  op: UnaryValOp;
  arg: ValExp;

  constructor(op: UnaryValOp, arg: ValExp) {
    this.expType = "UnaryValExp";
    this.op = op;
    this.arg = arg;
  }

  toSqlStr(dialect: SQLDialect): string {
    switch (this.op) {
      case "round":
      case "floor":
      case "ceil":
        return `${this.op}(${valExpToSqlStr(dialect, this.arg)})`;
      default:
        const invalid: never = this.op;
        throw new Error(`Unknown unary operator: ${invalid}`);
    }
  }
}
export const round = (arg: ValExp): UnaryValExp =>
  new UnaryValExp("round", arg);
export const floor = (arg: ValExp): UnaryValExp =>
  new UnaryValExp("floor", arg);
export const ceil = (arg: ValExp): UnaryValExp => new UnaryValExp("ceil", arg);

export type ValExp =
  | ConstVal
  | ColRef
  | WindowExp
  | BinValExp
  | UnaryValExp
  | CastExp;

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
      const qCol = dialect.quoteCol(vexp.colName);
      ret = vexp.tblAlias ? `${vexp.tblAlias}.${qCol}` : qCol;
      break;
    case "WindowExp":
      ret = `${vexp.fn}() OVER ()`;
      break;
    case "BinValExp":
      ret = vexp.toSqlStr(dialect);
      break;
    case "UnaryValExp":
      ret = vexp.toSqlStr(dialect);
      break;
    case "CastExp":
      ret = `CAST(${valExpToSqlStr(dialect, vexp.subExp)} AS ${
        vexp.asType.sqlTypeName
      })`;
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
