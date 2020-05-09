import * as sqlite3 from "sqlite3";
import * as reltab from "reltab";
import * as aggtree from "../src/aggtree";
import { PathTree } from "../src/PathTree";
import * as reltabSqlite from "reltab-sqlite";
import { textSpanContainsPosition, textSpanContainsTextSpan } from "typescript";
import { delimiter } from "path";
import * as log from "loglevel";
import * as util from "./testUtils";

test("basic pathTree", () => {
  const pt0 = new PathTree();

  const pt1 = pt0.open(["foo", "bar", "baz"]);

  console.log("pt1: ", pt1._rep);

  const pt2 = pt1.open(["foo", "bar", "blech"]).open(["a", "b", "c"]);

  console.log("pt2: ", pt2._rep);

  for (let path of pt2.iter()) {
    console.log(path);
  }

  const pt2Paths = Array.from(pt2.iter());
  console.log("pt2Paths: ", pt2Paths);
  expect(pt2Paths).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Array [
        "foo",
        "bar",
      ],
      Array [
        "foo",
        "bar",
        "baz",
      ],
      Array [
        "foo",
        "bar",
        "blech",
      ],
      Array [
        "a",
      ],
      Array [
        "a",
        "b",
      ],
      Array [
        "a",
        "b",
        "c",
      ],
    ]
  `);
});
