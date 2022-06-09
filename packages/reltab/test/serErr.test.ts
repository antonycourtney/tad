import { serializeError, deserializeError } from "../src/remote/errorUtils";

test("basic error serialization", () => {
  const err = new Error("Badness");

  console.log("err: ", err);
  const s = JSON.stringify({ err });
  console.log("JSON-ified error: ", s);

  const s2 = JSON.stringify({ err: serializeError(err) });
  console.log("serialized error: ", s2);

  const jsonObj = JSON.parse(s2);
  const e2 = deserializeError(jsonObj.err);

  console.log("de-serialized Error: ", e2);
});
