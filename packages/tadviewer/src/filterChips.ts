/*
 * The filter bar's chips, and converting between them and the view's
 * FilterExp (see doc/ui-todo.md, "Saved views and reltab").
 *
 * A filter is a list of chips combined with All (AND) or Any (OR). Each chip
 * is one condition on one column, saved as one of the FilterExp's opArgs:
 * either a single condition, or a nested FilterExp when it takes more than
 * one (e.g. "all but these values, or NULL").
 *
 * NULLs: negative conditions ("all but", "doesn't contain", "not between")
 * keep rows with no value by default, and positive ones drop them. Either can
 * be changed per chip.
 */
import {
  BinRelExp,
  BinRelOp,
  ColumnType,
  colIsNumeric,
  col,
  constVal,
  FilterExp,
  Schema,
  SubExp,
  UnaryRelExp,
  opDisplayName,
} from "reltab";

export type MatchOp =
  | "contains"
  | "notcontains"
  | "begins"
  | "notbegins"
  | "ends"
  | "notends";

export type RangeOp = "between" | "outside" | "null" | "notnull";

/** A text (or other non-numeric) column: pick values, or match text. */
export interface TextChip {
  kind: "text";
  column: string;
  op: "pick" | "match";
  // Pick values. The values listed are the exceptions: "Only these"
  // (include) keeps just the listed values, "All but" (exclude) keeps all
  // others. null stands for rows with no value.
  mode: "include" | "exclude";
  values: (string | null)[];
  // Match text (ignoring case):
  matchOp: MatchOp;
  text: string;
  keepNull: boolean;
}

/** A number column: a range, or NULL or not. Bounds are inclusive. */
export interface RangeChip {
  kind: "range";
  column: string;
  op: RangeOp;
  min: number | null;
  max: number | null;
  keepNull: boolean;
}

/**
 * A condition the filter bar can show but not edit, e.g. a text comparison
 * (region ≥ 'C') from an older saved view. It can be removed.
 */
export interface FixedChip {
  kind: "fixed";
  column: string | null;
  exp: SubExp;
}

export type Chip = TextChip | RangeChip | FixedChip;

export type Match = "AND" | "OR";

export interface ChipFilter {
  match: Match;
  chips: Chip[];
}

export const isNegativeMatch = (op: MatchOp): boolean => op.startsWith("not");

/** A new chip for a column: "all values" for text, "any value" for numbers. */
export function newChip(column: string, ct: ColumnType): TextChip | RangeChip {
  return colIsNumeric(ct)
    ? { kind: "range", column, op: "between", min: null, max: null, keepNull: false }
    : {
        kind: "text",
        column,
        op: "pick",
        mode: "exclude",
        values: [],
        matchOp: "contains",
        text: "",
        keepNull: false,
      };
}

/** Whether a chip filters anything (a new chip doesn't, until it's set). */
export function isActive(chip: Chip): boolean {
  switch (chip.kind) {
    case "fixed":
      return true;
    case "range":
      return (
        chip.op === "null" || chip.op === "notnull" || chip.min !== null || chip.max !== null
      );
    case "text":
      return chip.op === "match"
        ? chip.text.trim() !== ""
        : chip.mode === "include" || chip.values.length > 0;
  }
}

// --- chips to FilterExp ---

const bin = (op: BinRelOp, column: string, val: any) =>
  new BinRelExp(op, col(column), constVal(val));
const isNullExp = (column: string) => new UnaryRelExp("ISNULL", col(column));
const notNullExp = (column: string) => new UnaryRelExp("NOTNULL", col(column));

/** One or more conditions joined by op, as a single SubExp. */
const joined = (op: Match, parts: SubExp[]): SubExp =>
  parts.length === 1 ? parts[0] : new FilterExp(op, parts);

/** exp, or NULL: flattening exp if it's already an OR. */
const orNull = (exp: SubExp, column: string): SubExp =>
  exp instanceof FilterExp && exp.op === "OR"
    ? new FilterExp("OR", [...exp.opArgs, isNullExp(column)])
    : new FilterExp("OR", [exp, isNullExp(column)]);

/** The condition a chip saves as (null if it isn't active). */
export function chipToSubExp(chip: Chip): SubExp | null {
  if (!isActive(chip)) {
    return null;
  }
  switch (chip.kind) {
    case "fixed":
      return chip.exp;
    case "text":
      return chip.op === "pick" ? pickToSubExp(chip) : matchToSubExp(chip);
    case "range":
      return rangeToSubExp(chip);
  }
}

function pickToSubExp(chip: TextChip): SubExp {
  const { column, values } = chip;
  const hasNull = values.includes(null);
  const nonNull = values.filter((v) => v !== null) as string[];
  if (chip.mode === "include") {
    if (nonNull.length === 0) {
      // Only NULL, or nothing (which IN with no values matches):
      return hasNull ? isNullExp(column) : bin("IN", column, []);
    }
    const inExp = bin("IN", column, nonNull);
    return hasNull ? orNull(inExp, column) : inExp;
  }
  // All but: NOT IN drops NULLs, so add them back unless they're excluded.
  if (nonNull.length === 0) {
    return notNullExp(column);
  }
  const notIn = bin("NOTIN", column, nonNull);
  return hasNull ? notIn : orNull(notIn, column);
}

function matchToSubExp(chip: TextChip): SubExp {
  // Both the positive and negative (NOT ILIKE) forms drop NULLs:
  const exp = bin(chip.matchOp.toUpperCase() as BinRelOp, chip.column, chip.text.trim());
  return chip.keepNull ? orNull(exp, chip.column) : exp;
}

function rangeToSubExp(chip: RangeChip): SubExp {
  const { column, min, max } = chip;
  if (chip.op === "null") {
    return isNullExp(column);
  }
  if (chip.op === "notnull") {
    return notNullExp(column);
  }
  let exp: SubExp;
  if (chip.op === "between") {
    exp =
      min !== null && min === max
        ? bin("EQ", column, min)
        : joined("AND", [
            ...(min !== null ? [bin("GE", column, min)] : []),
            ...(max !== null ? [bin("LE", column, max)] : []),
          ]);
  } else {
    exp =
      min !== null && min === max
        ? bin("NEQ", column, min)
        : joined("OR", [
            ...(min !== null ? [bin("LT", column, min)] : []),
            ...(max !== null ? [bin("GT", column, max)] : []),
          ]);
  }
  return chip.keepNull ? orNull(exp, column) : exp;
}

/** The view's FilterExp for the chips (leaving out chips that aren't set). */
export function chipsToFilterExp(filter: ChipFilter): FilterExp {
  const opArgs = filter.chips.map(chipToSubExp).filter((e) => e !== null) as SubExp[];
  return new FilterExp(filter.match, opArgs);
}

// --- FilterExp to chips ---

/** The column a condition is on, if it's a simple condition on a column. */
const relColumn = (exp: SubExp): string | null => {
  if (exp instanceof BinRelExp) {
    return exp.lhs.expType === "ColRef" && exp.rhs.expType === "ConstVal"
      ? exp.lhs.colName
      : null;
  }
  if (exp instanceof UnaryRelExp) {
    return exp.arg.expType === "ColRef" ? exp.arg.colName : null;
  }
  return null;
};

/** The single column all of exp's conditions are on, if there is one. */
export function expColumn(exp: SubExp): string | null {
  if (exp instanceof FilterExp) {
    const cols = new Set(exp.opArgs.map(expColumn));
    return cols.size === 1 ? [...cols][0] : null;
  }
  return relColumn(exp);
}

const constOf = (exp: BinRelExp): any => (exp.rhs as any).val;
const isNumberValue = (v: any): v is number => typeof v === "number" && Number.isFinite(v);

const textChip = (column: string, props: Partial<TextChip>): TextChip => ({
  kind: "text",
  column,
  op: "pick",
  mode: "exclude",
  values: [],
  matchOp: "contains",
  text: "",
  keepNull: false,
  ...props,
});

const rangeChip = (column: string, props: Partial<RangeChip>): RangeChip => ({
  kind: "range",
  column,
  op: "between",
  min: null,
  max: null,
  keepNull: false,
  ...props,
});

const MATCH_OPS = new Set(["CONTAINS", "NOTCONTAINS", "BEGINS", "NOTBEGINS", "ENDS", "NOTENDS"]);

/** A chip for a single condition, if one can show it. */
function relToChip(exp: SubExp, numeric: boolean): TextChip | RangeChip | null {
  const column = relColumn(exp);
  if (column === null) {
    return null;
  }
  if (exp instanceof UnaryRelExp) {
    if (numeric) {
      return rangeChip(column, { op: exp.op === "ISNULL" ? "null" : "notnull" });
    }
    return exp.op === "ISNULL"
      ? textChip(column, { mode: "include", values: [null] })
      : textChip(column, { mode: "exclude", values: [null] });
  }
  const e = exp as BinRelExp;
  const v = constOf(e);
  if (numeric) {
    if (!isNumberValue(v)) {
      return null;
    }
    switch (e.op) {
      case "EQ":
        return rangeChip(column, { min: v, max: v });
      case "NEQ":
        return rangeChip(column, { op: "outside", min: v, max: v });
      case "GE":
        return rangeChip(column, { min: v });
      case "LE":
        return rangeChip(column, { max: v });
      // < and > are outside a range open at one end (and drop NULLs):
      case "LT":
        return rangeChip(column, { op: "outside", min: v });
      case "GT":
        return rangeChip(column, { op: "outside", max: v });
      default:
        return null;
    }
  }
  switch (e.op) {
    case "IN":
      return Array.isArray(v) ? textChip(column, { mode: "include", values: v.map(String) }) : null;
    case "NOTIN":
      // Plain NOT IN drops NULLs too:
      return Array.isArray(v)
        ? textChip(column, { mode: "exclude", values: [...v.map(String), null] })
        : null;
    case "EQ":
      return v === null ? null : textChip(column, { mode: "include", values: [String(v)] });
    case "NEQ":
      return v === null ? null : textChip(column, { mode: "exclude", values: [String(v), null] });
    default:
      if (MATCH_OPS.has(e.op) && typeof v === "string") {
        return textChip(column, { op: "match", matchOp: e.op.toLowerCase() as MatchOp, text: v });
      }
      return null;
  }
}

/** A chip for an opArg of the view's filter, if one other than fixed fits. */
function subExpToChip(exp: SubExp, schema: Schema): TextChip | RangeChip | null {
  const column = expColumn(exp);
  if (column === null || schema.columnMetadata[column] === undefined) {
    return null;
  }
  const numeric = colIsNumeric(schema.columnType(column));
  if (!(exp instanceof FilterExp)) {
    return relToChip(exp, numeric);
  }
  const args = exp.opArgs;
  if (exp.op === "OR") {
    // "..., or NULL":
    const nullIdx = args.findIndex((a) => a instanceof UnaryRelExp && a.op === "ISNULL");
    if (nullIdx >= 0 && args.length > 1) {
      const rest = args.filter((_, i) => i !== nullIdx);
      const chip = subExpToChip(joined("OR", rest), schema);
      return chip && withNulls(chip);
    }
    // Several values ("= a OR = b", as the old filter editor saved them):
    if (!numeric) {
      const picks = args.map((a) => (a instanceof FilterExp ? null : relToChip(a, false)));
      if (picks.every((c) => c?.kind === "text" && c.op === "pick" && c.mode === "include")) {
        const values = picks.flatMap((c) => (c as TextChip).values);
        return textChip(column, { mode: "include", values: [...new Set(values)] });
      }
    }
    // Outside a range:
    if (numeric && args.length === 2) {
      const [lo, hi] = args;
      if (
        lo instanceof BinRelExp &&
        hi instanceof BinRelExp &&
        lo.op === "LT" &&
        hi.op === "GT" &&
        isNumberValue(constOf(lo)) &&
        isNumberValue(constOf(hi))
      ) {
        return rangeChip(column, { op: "outside", min: constOf(lo), max: constOf(hi) });
      }
    }
    return null;
  }
  // AND: a range.
  if (numeric && args.length === 2) {
    const [lo, hi] = args.map((a) => relToChip(a, true));
    if (lo && hi && lo.kind === "range" && hi.kind === "range") {
      const merged = mergeRanges(lo, hi);
      if (merged) {
        return merged;
      }
    }
  }
  return args.length === 1 ? subExpToChip(args[0], schema) : null;
}

/** The chip, also keeping rows with no value (if it can say so). */
function withNulls(chip: TextChip | RangeChip): TextChip | RangeChip | null {
  if (chip.kind === "range") {
    return chip.op === "between" || chip.op === "outside" ? { ...chip, keepNull: true } : null;
  }
  if (chip.op === "match") {
    return { ...chip, keepNull: true };
  }
  return chip.mode === "include"
    ? { ...chip, values: [...chip.values, null] }
    : { ...chip, values: chip.values.filter((v) => v !== null) };
}

/** "≥ a" and "≤ b" as one "a – b" range, if that's what they are. */
function mergeRanges(a: RangeChip, b: RangeChip): RangeChip | null {
  const isMin = (c: RangeChip) => c.op === "between" && c.min !== null && c.max === null;
  const isMax = (c: RangeChip) => c.op === "between" && c.max !== null && c.min === null;
  if (a.column !== b.column || a.keepNull || b.keepNull) {
    return null;
  }
  if (isMin(a) && isMax(b)) {
    return { ...a, max: b.max };
  }
  if (isMax(a) && isMin(b)) {
    return { ...b, max: a.max };
  }
  return null;
}

/**
 * The chips for the view's filter. Conditions that no chip can show become
 * fixed (read-only) chips. In an All filter, a ≥ and a ≤ on the same column
 * (as older versions of Tad saved a histogram brush) become one range.
 */
export function filterExpToChips(fe: FilterExp, schema: Schema): ChipFilter {
  const chips: Chip[] = fe.opArgs.map(
    (exp) => subExpToChip(exp, schema) ?? { kind: "fixed", column: expColumn(exp), exp }
  );
  if (fe.op === "AND") {
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        const a = chips[i];
        const b = chips[j];
        if (a.kind === "range" && b.kind === "range") {
          const merged = mergeRanges(a, b);
          if (merged) {
            chips[i] = merged;
            chips.splice(j, 1);
            break;
          }
        }
      }
    }
  }
  return { match: fe.op, chips };
}

// --- what a chip says ---

const MATCH_LABEL: Record<MatchOp, string> = {
  contains: "contains",
  notcontains: "doesn't contain",
  begins: "starts with",
  notbegins: "doesn't start with",
  ends: "ends with",
  notends: "doesn't end with",
};
export const matchLabel = (op: MatchOp): string => MATCH_LABEL[op];

/** The columns a view's filter has conditions on. */
export function filteredColumns(fe: FilterExp | null | undefined, schema: Schema): string[] {
  if (!fe) {
    return [];
  }
  try {
    const columns = filterExpToChips(fe, schema).chips.map((c) => c.column);
    return Array.from(new Set(columns.filter((c): c is string => c != null)));
  } catch {
    return [];
  }
}

const valueLabel = (v: string | null) => (v === null ? "NULL" : v);
const listSummary = (vals: (string | null)[]) =>
  vals.length <= 2 ? vals.map(valueLabel).join(", ") : `${vals.length} values`;

// The chip only mentions NULLs when they're not handled the default way.
const nullSuffix = (keepNull: boolean, negative: boolean) =>
  keepNull === negative ? "" : keepNull ? " or NULL" : ", not NULL";

/**
 * What a chip says after its column name, e.g. "all but North, South",
 * "≥ 15", "doesn't contain “x”, not NULL". fmt formats a number for the
 * column.
 */
export function chipSummary(chip: Chip, fmt: (n: number) => string = String): string {
  switch (chip.kind) {
    case "fixed":
      return fixedSummary(chip.exp, fmt);
    case "text":
      if (chip.op === "match") {
        const text = chip.text.trim();
        return text === ""
          ? "all"
          : `${MATCH_LABEL[chip.matchOp]} “${text}”` +
              nullSuffix(chip.keepNull, isNegativeMatch(chip.matchOp));
      }
      if (chip.mode === "exclude") {
        return chip.values.length ? "all but " + listSummary(chip.values) : "all";
      }
      return chip.values.length ? listSummary(chip.values) : "none";
    case "range": {
      if (chip.op === "null") {
        return "is NULL";
      }
      if (chip.op === "notnull") {
        return "is not NULL";
      }
      const a = chip.min === null ? null : fmt(chip.min);
      const b = chip.max === null ? null : fmt(chip.max);
      if (a === null && b === null) {
        return "all";
      }
      const outside = chip.op === "outside";
      let s: string;
      if (outside) {
        s = a !== null && b !== null ? (a === b ? `≠ ${a}` : `not ${a} – ${b}`) : a !== null ? `< ${a}` : `> ${b}`;
      } else {
        s = a !== null && b !== null ? (a === b ? `= ${a}` : `${a} – ${b}`) : a !== null ? `≥ ${a}` : `≤ ${b}`;
      }
      return s + nullSuffix(chip.keepNull, outside);
    }
  }
}

/** A fixed chip's condition, after the column name if it's on one column. */
function fixedSummary(exp: SubExp, fmt: (n: number) => string): string {
  const lit = (v: any) => (typeof v === "number" ? fmt(v) : `'${v}'`);
  if (exp instanceof BinRelExp && relColumn(exp) !== null) {
    const v = constOf(exp);
    return `${opDisplayName(exp.op).trim()} ${Array.isArray(v) ? v.map(lit).join(", ") : lit(v)}`;
  }
  if (exp instanceof UnaryRelExp && relColumn(exp) !== null) {
    return exp.op === "ISNULL" ? "is NULL" : "is not NULL";
  }
  if (exp instanceof FilterExp) {
    const parts = exp.opArgs.map((a) => fixedSummary(a, fmt));
    return parts.join(exp.op === "AND" ? " and " : " or ");
  }
  return "(condition)";
}
