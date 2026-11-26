/*
 * The filter bar's chips, and converting them to and from the view's
 * FilterExp (src/filterChips.ts).
 */
import {
  and,
  BinRelExp,
  col,
  constVal,
  DuckDBDialect,
  FilterExp,
  Schema,
  SubExp,
  UnaryRelExp,
} from "reltab";
import {
  Chip,
  chipSummary,
  chipsToFilterExp,
  ChipFilter,
  filterExpToChips,
  isActive,
  newChip,
  RangeChip,
  TextChip,
} from "../src/filterChips";

const schema = new Schema(DuckDBDialect, ["region", "qty", "note"], {
  region: { displayName: "Region", columnType: "VARCHAR" },
  qty: { displayName: "Quantity", columnType: "INTEGER" },
  note: { displayName: "Note", columnType: "VARCHAR" },
});

const sql = (fe: FilterExp) => fe.toSqlWhere(DuckDBDialect);
const bin = (op: any, c: string, v: any) => new BinRelExp(op, col(c), constVal(v));
const un = (op: any, c: string) => new UnaryRelExp(op, col(c));

const text = (props: Partial<TextChip>): TextChip => ({
  ...(newChip("region", schema.columnType("region")) as TextChip),
  ...props,
});
const range = (props: Partial<RangeChip>): RangeChip => ({
  ...(newChip("qty", schema.columnType("qty")) as RangeChip),
  ...props,
});

const filterSql = (chips: Chip[], match: "AND" | "OR" = "AND") =>
  sql(chipsToFilterExp({ match, chips }));

/** Save the chips, load them back, and check they're the same. */
const roundTrip = (chips: Chip[], match: "AND" | "OR" = "AND") => {
  const fe = chipsToFilterExp({ match, chips });
  // As saved in a .tad file:
  const loaded = FilterExp.deserialize(JSON.parse(JSON.stringify(fe)));
  return filterExpToChips(loaded, schema);
};

describe("new chips", () => {
  test("text columns pick values, number columns take a range", () => {
    expect(newChip("region", schema.columnType("region")).kind).toBe("text");
    expect(newChip("qty", schema.columnType("qty")).kind).toBe("range");
  });
  test("aren't active until set, and aren't saved", () => {
    const chips = [text({}), range({})];
    expect(chips.map(isActive)).toEqual([false, false]);
    expect(chipsToFilterExp({ match: "AND", chips }).opArgs).toEqual([]);
  });
});

describe("pick values", () => {
  test("only these", () => {
    expect(filterSql([text({ mode: "include", values: ["N", "S"] })])).toBe(
      `"region" IN ('N', 'S')`
    );
  });
  test("only these, and NULL", () => {
    expect(filterSql([text({ mode: "include", values: ["N", null] })])).toBe(
      `("region" IN ('N') OR "region" is null)`
    );
  });
  test("only NULL", () => {
    expect(filterSql([text({ mode: "include", values: [null] })])).toBe(`"region" is null`);
  });
  test("only these, with nothing ticked, matches nothing", () => {
    expect(filterSql([text({ mode: "include", values: [] })])).toBe("1=0");
  });
  test("all but these keeps NULLs", () => {
    expect(filterSql([text({ mode: "exclude", values: ["N"] })])).toBe(
      `("region" NOT IN ('N') OR "region" is null)`
    );
  });
  test("all but these and NULL", () => {
    expect(filterSql([text({ mode: "exclude", values: ["N", null] })])).toBe(
      `"region" NOT IN ('N')`
    );
  });
  test("all but NULL", () => {
    expect(filterSql([text({ mode: "exclude", values: [null] })])).toBe(
      `"region" is not null`
    );
  });
});

describe("match text", () => {
  test("positive matches drop NULLs", () => {
    expect(filterSql([text({ op: "match", matchOp: "contains", text: " ab " })])).toBe(
      `"region" ILIKE '%ab%'`
    );
  });
  test("or keep them", () => {
    expect(
      filterSql([text({ op: "match", matchOp: "begins", text: "ab", keepNull: true })])
    ).toBe(`("region" ILIKE 'ab%' OR "region" is null)`);
  });
  test("negative matches", () => {
    expect(
      filterSql([text({ op: "match", matchOp: "notends", text: "ab", keepNull: true })])
    ).toBe(`("region" NOT ILIKE '%ab' OR "region" is null)`);
    expect(filterSql([text({ op: "match", matchOp: "notends", text: "ab" })])).toBe(
      `"region" NOT ILIKE '%ab'`
    );
  });
  test("with no text, isn't active", () => {
    expect(isActive(text({ op: "match", text: "  " }))).toBe(false);
  });
});

describe("number ranges", () => {
  test("between", () => {
    expect(filterSql([range({ min: 1, max: 9 })])).toBe(`("qty">=1 AND "qty"<=9)`);
    expect(filterSql([range({ min: 1 })])).toBe(`"qty">=1`);
    expect(filterSql([range({ max: 9 })])).toBe(`"qty"<=9`);
    expect(filterSql([range({ min: 3, max: 3 })])).toBe(`"qty"=3`);
  });
  test("between, or NULL", () => {
    expect(filterSql([range({ min: 1, max: 9, keepNull: true })])).toBe(
      `(("qty">=1 AND "qty"<=9) OR "qty" is null)`
    );
  });
  test("outside", () => {
    expect(filterSql([range({ op: "outside", min: 1, max: 9 })])).toBe(
      `("qty"<1 OR "qty">9)`
    );
    expect(filterSql([range({ op: "outside", min: 1, max: 9, keepNull: true })])).toBe(
      `("qty"<1 OR "qty">9 OR "qty" is null)`
    );
    expect(filterSql([range({ op: "outside", min: 3, max: 3 })])).toBe(`"qty"<>3`);
  });
  test("NULL or not", () => {
    expect(filterSql([range({ op: "null" })])).toBe(`"qty" is null`);
    expect(filterSql([range({ op: "notnull" })])).toBe(`"qty" is not null`);
  });
});

test("chips combine with All or Any", () => {
  const chips = [text({ mode: "include", values: ["N"] }), range({ min: 5 })];
  expect(filterSql(chips, "AND")).toBe(`"region" IN ('N') AND "qty">=5`);
  expect(filterSql(chips, "OR")).toBe(`"region" IN ('N') OR "qty">=5`);
});

describe("saving and loading", () => {
  const cases: [string, Chip][] = [
    ["only these", text({ mode: "include", values: ["N", "S"] })],
    ["only these and NULL", text({ mode: "include", values: ["N", null] })],
    ["only NULL", text({ mode: "include", values: [null] })],
    ["nothing", text({ mode: "include", values: [] })],
    ["all but", text({ mode: "exclude", values: ["N"] })],
    ["all but, and NULL", text({ mode: "exclude", values: ["N", null] })],
    ["all but NULL", text({ mode: "exclude", values: [null] })],
    ["contains", text({ op: "match", matchOp: "contains", text: "x" })],
    ["contains, or NULL", text({ op: "match", matchOp: "contains", text: "x", keepNull: true })],
    ["doesn't start with", text({ op: "match", matchOp: "notbegins", text: "x", keepNull: true })],
    ["doesn't start with, not NULL", text({ op: "match", matchOp: "notbegins", text: "x" })],
    ["between", range({ min: 1, max: 9 })],
    ["at least", range({ min: 1 })],
    ["at most, or NULL", range({ max: 9, keepNull: true })],
    ["equal", range({ min: 3, max: 3 })],
    ["outside", range({ op: "outside", min: 1, max: 9, keepNull: true })],
    ["outside, not NULL", range({ op: "outside", min: 1, max: 9 })],
    ["not equal", range({ op: "outside", min: 3, max: 3 })],
    ["below", range({ op: "outside", min: 3, keepNull: true })],
    ["NULL", range({ op: "null" })],
    ["not NULL", range({ op: "notnull" })],
  ];
  for (const [name, chip] of cases) {
    test(name, () => {
      expect(roundTrip([chip]).chips).toEqual([chip]);
    });
  }

  test("several chips, with Any", () => {
    const chips = [text({ mode: "exclude", values: ["N"] }), range({ min: 5 })];
    expect(roundTrip(chips, "OR")).toEqual({ match: "OR", chips });
  });
});

describe("loading filters from older versions of Tad", () => {
  const load = (op: "AND" | "OR", opArgs: SubExp[]) =>
    filterExpToChips(new FilterExp(op, opArgs), schema).chips;

  test("NOT IN and <> on text also excluded NULLs", () => {
    expect(load("AND", [bin("NOTIN", "region", ["N"])])).toEqual([
      text({ mode: "exclude", values: ["N", null] }),
    ]);
    expect(load("AND", [bin("NEQ", "region", "N")])).toEqual([
      text({ mode: "exclude", values: ["N", null] }),
    ]);
  });

  test("= on text is a value", () => {
    expect(load("AND", [bin("EQ", "region", "N")])).toEqual([
      text({ mode: "include", values: ["N"] }),
    ]);
  });

  test("= one value or another is a list of values", () => {
    const either = new FilterExp("OR", [bin("EQ", "region", "N"), bin("IN", "region", ["S", "N"])]);
    expect(load("AND", [either])).toEqual([text({ mode: "include", values: ["N", "S"] })]);
  });

  test("text NULL checks", () => {
    expect(load("AND", [un("ISNULL", "note")])).toEqual([
      { ...text({ mode: "include", values: [null] }), column: "note" },
    ]);
  });

  test("a histogram brush (≥ and ≤ in an All filter) is one range", () => {
    expect(
      load("AND", [bin("EQ", "region", "N"), bin("GE", "qty", 2), bin("LE", "qty", 8)])
    ).toEqual([text({ mode: "include", values: ["N"] }), range({ min: 2, max: 8 })]);
  });

  test("but not in an Any filter", () => {
    expect(load("OR", [bin("GE", "qty", 2), bin("LE", "qty", 8)])).toEqual([
      range({ min: 2 }),
      range({ max: 8 }),
    ]);
  });

  test("> and < on numbers are open-ended ranges", () => {
    const chips = load("AND", [bin("GT", "qty", 2), bin("LT", "qty", 9)]);
    expect(chips).toEqual([
      range({ op: "outside", max: 2 }),
      range({ op: "outside", min: 9 }),
    ]);
    expect(chips.map((c) => chipSummary(c))).toEqual(["> 2, not NULL", "< 9, not NULL"]);
    expect(sql(chipsToFilterExp({ match: "AND", chips }))).toBe(`"qty">2 AND "qty"<9`);
  });

  test("conditions no chip can edit are fixed", () => {
    const textGe = bin("GE", "region", "C");
    const twoCols = new FilterExp("OR", [bin("EQ", "region", "N"), bin("EQ", "note", "x")]);
    const chips = load("AND", [textGe, twoCols]);
    expect(chips).toEqual([
      { kind: "fixed", column: "region", exp: textGe },
      { kind: "fixed", column: null, exp: twoCols },
    ]);
    // ...and are saved unchanged:
    expect(sql(chipsToFilterExp({ match: "AND", chips }))).toBe(
      sql(new FilterExp("AND", [textGe, twoCols]))
    );
  });

  test("conditions on columns that aren't in the table are fixed", () => {
    const exp = bin("EQ", "gone", "x");
    expect(load("AND", [exp])).toEqual([{ kind: "fixed", column: "gone", exp }]);
  });
});

describe("what chips say", () => {
  const says = (chip: Chip) => chipSummary(chip);
  test("pick values", () => {
    expect(says(text({ mode: "exclude", values: [] }))).toBe("all");
    expect(says(text({ mode: "exclude", values: ["N", "S"] }))).toBe("all but N, S");
    expect(says(text({ mode: "exclude", values: ["N", "S", "E"] }))).toBe("all but 3 values");
    expect(says(text({ mode: "include", values: ["N", null] }))).toBe("N, NULL");
    expect(says(text({ mode: "include", values: [] }))).toBe("none");
  });
  test("match text mentions NULLs only when not the default", () => {
    expect(says(text({ op: "match", matchOp: "contains", text: "x" }))).toBe("contains “x”");
    expect(says(text({ op: "match", matchOp: "contains", text: "x", keepNull: true }))).toBe(
      "contains “x” or NULL"
    );
    expect(says(text({ op: "match", matchOp: "notcontains", text: "x", keepNull: true }))).toBe(
      "doesn't contain “x”"
    );
    expect(says(text({ op: "match", matchOp: "notcontains", text: "x" }))).toBe(
      "doesn't contain “x”, not NULL"
    );
  });
  test("ranges", () => {
    const fmt = (n: number) => n.toLocaleString("en-US");
    expect(chipSummary(range({ min: 1000, max: 2000 }), fmt)).toBe("1,000 – 2,000");
    expect(says(range({ min: 3 }))).toBe("≥ 3");
    expect(says(range({ max: 3, keepNull: true }))).toBe("≤ 3 or NULL");
    expect(says(range({ op: "outside", min: 3, max: 6 }))).toBe("not 3 – 6, not NULL");
    expect(says(range({ op: "outside", min: 3, max: 6, keepNull: true }))).toBe("not 3 – 6");
    expect(says(range({ op: "outside", min: 3, max: 3, keepNull: true }))).toBe("≠ 3");
    expect(says(range({ op: "null" }))).toBe("is NULL");
  });
  test("fixed chips", () => {
    expect(chipSummary({ kind: "fixed", column: "region", exp: bin("GE", "region", "C") })).toBe(
      ">= 'C'"
    );
    expect(chipSummary({ kind: "fixed", column: "region", exp: bin("LT", "region", "C") })).toBe(
      "< 'C'"
    );
  });
});

test("an empty filter has no chips", () => {
  expect(filterExpToChips(and(), schema)).toEqual({ match: "AND", chips: [] } as ChipFilter);
});
