import * as reltab from "../src/reltab";

test("t0 - basic table query rep", () => {
  const q0 = reltab.tableQuery("barttest");

  console.log("q0: ", q0);
});
