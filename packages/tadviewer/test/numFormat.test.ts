import { NumFormatOptions } from "../src/NumFormatOptions";
import { TextFormatOptions } from "../src/TextFormatOptions";
import { VIEW_PARAMS_FORMAT_VERSION, ViewParams } from "../src/ViewParams";

// Expected strings below assume a locale with "," for thousands and "." for
// decimals, as in en-US:
const enUSLike = (1234.5).toLocaleString() === "1,234.5";
const localeTest = enUSLike ? test : test.skip;

describe("Automatic number format", () => {
  const fmt = new NumFormatOptions({ formatMethod: "auto" }).getFormatter();

  localeTest("hides floating point noise", () => {
    expect(fmt(0.1 + 0.2)).toBe("0.3");
    expect(fmt(67363037.10000038)).toBe("67,363,037.1");
    expect(fmt(10605059999.999435)).toBe("10,605,060,000");
  });

  localeTest("doesn't pad or truncate decimals", () => {
    expect(fmt(7.9)).toBe("7.9");
    expect(fmt(1.78)).toBe("1.78");
    expect(fmt(0.000123)).toBe("0.000123");
    expect(fmt(-0.5)).toBe("-0.5");
    expect(fmt(0)).toBe("0");
  });

  localeTest("never rounds the integer part", () => {
    expect(fmt(1234567890123.4)).toBe("1,234,567,890,123");
    expect(fmt(BigInt("12345678901234567890"))).toBe(
      "12,345,678,901,234,567,890"
    );
  });

  localeTest("uses scientific notation for extreme magnitudes", () => {
    expect(fmt(1.5e-9)).toBe("1.5E-9");
    expect(fmt(2.5e20)).toBe("2.5E20");
  });

  localeTest("respects the thousands separator option", () => {
    const noCommas = new NumFormatOptions({
      formatMethod: "auto",
      commas: false,
    }).getFormatter();
    expect(noCommas(67363037.10000038)).toBe("67363037.1");
  });

  test("leaves null and non-numeric values alone", () => {
    expect(fmt(null)).toBeNull();
    expect(fmt(undefined)).toBeNull();
    expect(fmt("12.5")).toBe("12.5");
  });

  test("is the default for real columns", () => {
    const vp = new ViewParams();
    expect(vp.defaultFormats.real.formatMethod).toBe("auto");
    expect(vp.defaultFormats.integer.formatMethod).toBe("toLocaleString");
  });
});

// defaultFormats, as saved by Tad with .tad file format version 2:
const v2DefaultFormats = () => ({
  string: { type: "TextFormatOptions", urlsAsHyperlinks: true },
  integer: {
    type: "NumFormatOptions",
    commas: true,
    decimalPlaces: 0,
    exponential: false,
    formatMethod: "toLocaleString",
  },
  real: {
    type: "NumFormatOptions",
    commas: true,
    decimalPlaces: 2,
    exponential: false,
    formatMethod: "toString",
  },
  boolean: {
    type: "NumFormatOptions",
    commas: true,
    decimalPlaces: 0,
    exponential: false,
    formatMethod: "toString",
  },
});

const savedViewParams = (defaultFormats: any, columnFormats: any = {}) => ({
  showRoot: false,
  displayColumns: ["title", "score"],
  vpivots: [],
  sortKey: [],
  openPaths: { _rep: {} },
  aggMap: {},
  defaultFormats,
  columnFormats,
});

describe("loading saved ViewParams", () => {
  test("version 2: the old default real format becomes Automatic", () => {
    const vp = ViewParams.deserialize(savedViewParams(v2DefaultFormats()), 2);
    expect(vp.defaultFormats.real.formatMethod).toBe("auto");
    expect(vp.defaultFormats.integer.formatMethod).toBe("toLocaleString");
  });

  test("version 2: changed real formats are kept", () => {
    const defaultFormats = v2DefaultFormats();
    defaultFormats.real.formatMethod = "toLocaleString";
    defaultFormats.real.decimalPlaces = 4;
    const vp = ViewParams.deserialize(savedViewParams(defaultFormats), 2);
    expect(vp.defaultFormats.real.formatMethod).toBe("toLocaleString");
    expect(vp.defaultFormats.real.decimalPlaces).toBe(4);
  });

  test("version 2: column formats are kept", () => {
    const score = { ...v2DefaultFormats().real, formatMethod: "toString" };
    const vp = ViewParams.deserialize(
      savedViewParams(v2DefaultFormats(), { score }),
      2
    );
    expect(
      (vp.columnFormats.get("score") as NumFormatOptions).formatMethod
    ).toBe("toString");
  });

  test("current version: formats load as saved", () => {
    const vp = ViewParams.deserialize(
      savedViewParams(v2DefaultFormats()),
      VIEW_PARAMS_FORMAT_VERSION
    );
    expect(vp.defaultFormats.real.formatMethod).toBe("toString");
  });

  test("formats saved before formatMethod existed: Custom, or new defaults", () => {
    // As in .tad files saved by Tad before 2025:
    const defaultFormats = {
      text: { urlsAsHyperlinks: false },
      integer: { commas: true, decimalPlaces: 0 },
      real: { commas: true, decimalPlaces: 2 },
      boolean: { commas: true, decimalPlaces: 0 },
    };
    const columnFormats = {
      score: { type: "NumFormatOptions", commas: false, decimalPlaces: 3 },
    };
    const vp = ViewParams.deserialize(
      savedViewParams(defaultFormats, columnFormats),
      1
    );
    // Integers keep their thousands separators (previously lost):
    expect(vp.defaultFormats.integer.formatMethod).toBe("toLocaleString");
    expect(vp.defaultFormats.integer.decimalPlaces).toBe(0);
    // The untouched real default becomes Automatic:
    expect(vp.defaultFormats.real.formatMethod).toBe("auto");
    // Text formats saved under the old "text" kind are used:
    expect(
      (vp.defaultFormats.string as TextFormatOptions).urlsAsHyperlinks
    ).toBe(false);
    // Column formats were Custom formats:
    const score = vp.columnFormats.get("score") as NumFormatOptions;
    expect(score.formatMethod).toBe("toLocaleString");
    expect(score.decimalPlaces).toBe(3);
  });

  test("missing format fields get the defaults for the column kind", () => {
    const vp = ViewParams.deserialize(
      savedViewParams({ integer: { commas: false } }),
      VIEW_PARAMS_FORMAT_VERSION
    );
    expect(vp.defaultFormats.integer.formatMethod).toBe("toLocaleString");
    expect(vp.defaultFormats.integer.decimalPlaces).toBe(0);
    expect(vp.defaultFormats.integer.commas).toBe(false);
    expect(vp.defaultFormats.real.formatMethod).toBe("auto");
  });
});
