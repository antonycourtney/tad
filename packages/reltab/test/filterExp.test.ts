/*
 * Filter expressions: the SQL they generate, and saving and loading them
 * (as views in .tad files do, through JSON).
 */
import * as reltab from "../src/reltab";
import {
  BinRelExp,
  FilterExp,
  SubExp,
  UnaryRelExp,
  and,
  col,
  constVal,
  or,
} from "../src/reltab";

const dialect = reltab.SQLiteDialect;
const sql = (fe: FilterExp) => fe.toSqlWhere(dialect);

const bin = (op: reltab.BinRelOp, cid: string, val: any) =>
  new BinRelExp(op, col(cid), constVal(val));
const un = (op: reltab.UnaryRelOp, cid: string) => new UnaryRelExp(op, col(cid));

/** Save and load, as a .tad file does. */
const roundTrip = (fe: FilterExp): FilterExp =>
  FilterExp.deserialize(JSON.parse(JSON.stringify(fe)));

describe("SQL for each operator", () => {
  const cases: [SubExp, string][] = [
    [bin("EQ", "n", 3), `"n"=3`],
    [bin("NEQ", "n", 3), `"n"<>3`],
    [bin("GE", "n", 3), `"n">=3`],
    [bin("LT", "n", 3.5), `"n"<3.5`],
    [bin("EQ", "s", "it's"), `"s"='it''s'`],
    [bin("IN", "s", ["a", "b"]), `"s" IN ('a', 'b')`],
    [bin("NOTIN", "s", ["a"]), `"s" NOT IN ('a')`],
    [bin("CONTAINS", "s", "ab"), `"s" ILIKE '%ab%'`],
    [bin("NOTCONTAINS", "s", "ab"), `"s" NOT ILIKE '%ab%'`],
    [bin("BEGINS", "s", "ab"), `"s" ILIKE 'ab%'`],
    [bin("NOTENDS", "s", "ab"), `"s" NOT ILIKE '%ab'`],
    [un("ISNULL", "s"), `"s" is null`],
    [un("NOTNULL", "s"), `"s" is not null`],
  ];
  for (const [exp, expected] of cases) {
    test(`${exp.op}`, () => {
      expect(sql(new FilterExp("AND", [exp]))).toBe(expected);
    });
  }

  // `IN ()` isn't valid SQL. An empty IN list matches nothing, and an empty
  // NOT IN list matches everything (including NULLs, as no value is excluded).
  test("IN with no values matches nothing", () => {
    expect(sql(new FilterExp("AND", [bin("IN", "s", [])]))).toBe("1=0");
  });
  test("NOT IN with no values matches everything", () => {
    expect(sql(new FilterExp("AND", [bin("NOTIN", "s", [])]))).toBe("1=1");
  });
});

describe("combining conditions", () => {
  test("AND and OR", () => {
    expect(sql(and().ge(col("n"), constVal(1)).le(col("n"), constVal(9)))).toBe(
      `"n">=1 AND "n"<=9`
    );
    expect(sql(or().isNull(col("n")).gt(col("n"), constVal(9)))).toBe(
      `"n" is null OR "n">9`
    );
  });

  test("nested filters are parenthesized", () => {
    // "all but a and b, keeping NULLs", and a range:
    const fe = new FilterExp("AND", [
      new FilterExp("OR", [bin("NOTIN", "s", ["a", "b"]), un("ISNULL", "s")]),
      new FilterExp("AND", [bin("GE", "n", 1), bin("LE", "n", 9)]),
    ]);
    expect(sql(fe)).toBe(
      `("s" NOT IN ('a', 'b') OR "s" is null) AND ("n">=1 AND "n"<=9)`
    );
  });
});

describe("saving and loading", () => {
  test("a flat filter", () => {
    const fe = and()
      .eq(col("s"), constVal("x"))
      .isNull(col("t"))
      .contains(col("u"), constVal("y"));
    const loaded = roundTrip(fe);
    expect(loaded).toBeInstanceOf(FilterExp);
    expect(sql(loaded)).toBe(sql(fe));
  });

  test("an IN list", () => {
    const fe = new FilterExp("OR", [bin("IN", "s", ["a", "b"])]);
    expect(sql(roundTrip(fe))).toBe(sql(fe));
  });

  test("nested filters", () => {
    const fe = new FilterExp("OR", [
      new FilterExp("OR", [bin("NOTIN", "s", ["a"]), un("ISNULL", "s")]),
      new FilterExp("AND", [
        bin("GE", "n", 1),
        new FilterExp("OR", [bin("LT", "m", 0), bin("GT", "m", 5)]),
      ]),
    ]);
    const loaded = roundTrip(fe);
    expect(sql(loaded)).toBe(sql(fe));
    const first = loaded.opArgs[0] as FilterExp;
    expect(first).toBeInstanceOf(FilterExp);
    expect(first.opArgs[1]).toBeInstanceOf(UnaryRelExp);
  });
});
