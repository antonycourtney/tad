import * as Immutable from "immutable";
import * as _ from "lodash";
import { Path, PathTree } from "aggtree";
import { QueryExp, ColumnType } from "reltab"; // eslint-disable-line
import * as reltab from "reltab"; // eslint-disable-line

import { TextFormatOptions } from "./TextFormatOptions";
import { NumFormatOptions } from "./NumFormatOptions";
import {
  CellFormatter,
  ClickHandler,
  ClickHandlerAppContext,
  FormatOptions,
} from "./FormatOptions";

/**
 * Immutable representation of user-configurable view parameters
 *
 */

type AggMap = {
  [cid: string]: reltab.AggFn;
};

type FormatsMap = Immutable.Map<string, FormatOptions>; // deserialize a formatter by examining its type member:

const deserializeFormatOptions = (
  jsObj: any
): FormatOptions | undefined | null => {
  let ret;

  if (jsObj.type === "TextFormatOptions") {
    ret = new TextFormatOptions(jsObj);
  } else if (jsObj.type === "NumFormatOptions") {
    ret = new NumFormatOptions(jsObj);
  } else {
    console.error("could not deserialize FormatOptions: ", jsObj);
    ret = null;
  }

  return ret;
};

// formatting defaults, keyed by column type:
export interface FormatDefaultsProps {
  [index: string]: FormatOptions; // index is really ColumnKind
  string: TextFormatOptions;
  integer: NumFormatOptions;
  real: NumFormatOptions;
  boolean: NumFormatOptions;
}

const defaultFormatDefaultProps: FormatDefaultsProps = {
  string: new TextFormatOptions(),
  integer: new NumFormatOptions({
    decimalPlaces: 0,
    formatMethod: "toLocaleString",
  }),
  real: new NumFormatOptions({
    formatMethod: "auto",
  }),
  boolean: new NumFormatOptions({
    decimalPlaces: 0,
  }), // for now...
};

// Saved formats may lack fields (e.g. if saved by an older version of Tad).
// Missing fields get the default format for the column kind, rather than the
// generic NumFormatOptions / TextFormatOptions defaults.
const withKindDefaults = (kindDefault: FormatOptions, saved: any): any => ({
  ...(kindDefault as any).toJS(),
  ...(saved ?? {}),
});

class FormatDefaults extends Immutable.Record(defaultFormatDefaultProps) {
  static deserialize(jsObj: any) {
    const d = defaultFormatDefaultProps;
    const initMap = {
      string: new TextFormatOptions(withKindDefaults(d.string, jsObj?.string)),
      integer: new NumFormatOptions(withKindDefaults(d.integer, jsObj?.integer)),
      real: new NumFormatOptions(withKindDefaults(d.real, jsObj?.real)),
      boolean: new NumFormatOptions(withKindDefaults(d.boolean, jsObj?.boolean)),
    };
    return new FormatDefaults(initMap);
  }
}

/**
 * The .tad file format version in which the saved form of ViewParams last
 * changed. ViewParams saved in earlier versions are migrated when loaded (see
 * migrateSavedViewParams). tad-app's TAD_FILE_FORMAT_VERSION (in
 * src/openParams.ts), which it writes in saved files, must be at least this.
 *
 * 3: "auto" number format for real columns.
 * 4: filters can be nested (a FilterExp's opArgs can include FilterExps),
 *    which earlier versions of Tad can't load.
 */
export const VIEW_PARAMS_FORMAT_VERSION = 4;

// The built-in default format for real (floating point) columns before
// version 3: "toString", or no formatMethod at all in files saved before
// NumFormatOptions had one.
const isOldRealDefault = (f: any): boolean =>
  f != null &&
  (f.formatMethod === undefined || f.formatMethod === "toString") &&
  f.commas !== false &&
  f.decimalPlaces === 2 &&
  !f.exponential;

// Number formats saved before NumFormatOptions had a formatMethod were
// formatted with toLocaleString (i.e. what is now "Custom"):
const migrateNumFormat = (f: any): any =>
  f != null && f.formatMethod === undefined
    ? { ...f, formatMethod: "toLocaleString" }
    : f;

/**
 * Migrate ViewParams (in serialized form) saved in .tad file format version
 * `fileFormatVersion` to the current form.
 */
export function migrateSavedViewParams(js: any, fileFormatVersion: number): any {
  // Version 4 added nested filters, which needs no migration.
  return fileFormatVersion < 3 ? migrateFormatsToV3(js) : js;
}

/** Number and text formats saved before version 3. */
function migrateFormatsToV3(js: any): any {
  const defaultFormats = { ...(js.defaultFormats ?? {}) };
  // Version 3 changed the default format for real columns to "auto"; files
  // that still have the previous default get the new one:
  if (isOldRealDefault(defaultFormats.real)) {
    defaultFormats.real = { ...defaultFormats.real, formatMethod: "auto" };
  }
  for (const kind of ["integer", "real", "boolean"]) {
    if (defaultFormats[kind] !== undefined) {
      defaultFormats[kind] = migrateNumFormat(defaultFormats[kind]);
    }
  }
  // Older files have text formats under the "text" column kind:
  if (defaultFormats.string === undefined && defaultFormats.text !== undefined) {
    defaultFormats.string = defaultFormats.text;
  }
  delete defaultFormats.text;
  const columnFormats = _.mapValues(js.columnFormats ?? {}, (f: any) =>
    f?.type === "NumFormatOptions" ? migrateNumFormat(f) : f
  );
  return { ...js, defaultFormats, columnFormats };
}

export interface ViewParamsProps {
  showRoot: boolean;
  showColumnHistograms: boolean;
  displayColumns: Array<string>; // array of column ids to display, in order

  vpivots: Array<string>; // array of columns to pivot

  pivotLeafColumn: string | undefined | null;
  sortKey: Array<[string, boolean]>;
  openPaths: PathTree;
  aggMap: AggMap;
  defaultFormats: FormatDefaults;
  columnFormats: FormatsMap;
  showHiddenCols: boolean;
  filterExp: reltab.FilterExp; // toggle element membership in array:
}

const defaultViewParamsProps: ViewParamsProps = {
  showRoot: false,
  showColumnHistograms: false,
  displayColumns: [],
  vpivots: [],
  pivotLeafColumn: null,
  sortKey: [],
  openPaths: new PathTree(),
  aggMap: {},
  // overrides of agg fns
  defaultFormats: new FormatDefaults(),
  columnFormats: Immutable.Map<string, FormatOptions>(),
  showHiddenCols: false,
  filterExp: new reltab.FilterExp(),
};

const defaultCellFormatter =
  (ct: ColumnType): CellFormatter =>
  (val?: any): string => {
    return ct.stringRender(val);
  };

const defaultClickHandler = (
  appContext: ClickHandlerAppContext,
  row: number,
  column: number,
  val: any
) => {};

export class ViewParams
  extends Immutable.Record(defaultViewParamsProps)
  implements ViewParamsProps
{
  public readonly showRoot!: boolean;
  public readonly showColumnHistograms!: boolean;
  public readonly displayColumns!: Array<string>; // array of column ids to display, in order

  public readonly vpivots!: Array<string>; // array of columns to pivot

  public readonly pivotLeafColumn!: string | undefined | null;
  public readonly sortKey!: Array<[string, boolean]>;
  public readonly openPaths!: PathTree;
  public readonly aggMap!: AggMap;
  public readonly defaultFormats!: FormatDefaults;
  public readonly columnFormats!: FormatsMap;
  public readonly showHiddenCols!: boolean;
  public readonly filterExp!: reltab.FilterExp; // toggle element membership in array:

  toggleArrElem(propName: string, cid: string): ViewParams {
    const arr = this.get(propName as keyof ViewParamsProps) as any[];
    const idx = arr.indexOf(cid);
    let nextArr;

    if (idx === -1) {
      // not shown, so add it:
      nextArr = arr.concat([cid]);
    } else {
      // otherwise remove it:
      nextArr = arr.slice();
      nextArr.splice(idx, 1);
    }

    return this.set(propName as keyof ViewParamsProps, nextArr) as ViewParams;
  }

  toggleShown(cid: string): ViewParams {
    return this.toggleArrElem("displayColumns", cid);
  }

  togglePivot(cid: string): ViewParams {
    const oldPivots = this.vpivots;
    return this.toggleArrElem("vpivots", cid).trimOpenPaths(oldPivots);
  }

  setVPivots(newPivots: Array<string>): ViewParams {
    const oldPivots = this.vpivots;
    return (this.set("vpivots", newPivots) as ViewParams).trimOpenPaths(
      oldPivots
    );
  }
  /*
   * after updating vpivots, trim openPaths
   */

  trimOpenPaths(oldPivots: Array<string>): ViewParams {
    const matchDepth = _.findIndex(
      _.zip(this.vpivots, oldPivots),
      ([p1, p2]) => p1 !== p2
    );

    return this.set(
      "openPaths",
      this.openPaths.trimToDepth(matchDepth)
    ) as ViewParams;
  }

  toggleSort(cid: string): ViewParams {
    const arr = this.sortKey;
    const idx = arr.findIndex((entry) => entry[0] === cid);
    let nextArr;

    if (idx === -1) {
      // not shown, so add it:
      nextArr = arr.concat([[cid, true]]);
    } else {
      // otherwise remove it:
      nextArr = arr.slice();
      nextArr.splice(idx, 1);
    }

    return this.set("sortKey", nextArr) as ViewParams;
  }

  setSortDir(cid: string, asc: boolean): ViewParams {
    const arr = this.sortKey;
    const idx = arr.findIndex((entry) => entry[0] === cid);
    let nextArr: [string, boolean][];

    if (idx === -1) {
      console.warn("viewParam.setSortDir: called for non-sort col ", cid);
      return this;
    } else {
      // otherwise remove it:
      nextArr = arr.slice();
      nextArr[idx] = [cid, asc];
    }

    return this.set("sortKey", nextArr!) as ViewParams;
  }

  openPath(path: Path): ViewParams {
    return this.set("openPaths", this.openPaths.open(path)) as ViewParams;
  }

  closePath(path: Path): ViewParams {
    return this.set("openPaths", this.openPaths.close(path)) as ViewParams;
  }

  getAggFn(schema: reltab.Schema, cid: string): reltab.AggFn {
    let aggFn = this.aggMap[cid];

    if (aggFn == null) {
      aggFn = reltab.defaultAggFn(schema.columnType(cid));
    }

    return aggFn;
  }

  setAggFn(cid: string, cidAgg: reltab.AggFn): ViewParams {
    let nextAggMap: AggMap = {};
    Object.assign(nextAggMap, this.aggMap);
    nextAggMap[cid] = cidAgg;
    return this.set("aggMap", nextAggMap) as ViewParams;
  }

  getColumnFormat(schema: reltab.Schema, cid: string): FormatOptions {
    let formatOpts: FormatOptions | undefined = this.columnFormats.get(cid);

    if (formatOpts == null) {
      formatOpts = this.defaultFormats.get(
        schema.columnType(cid).kind
      ) as FormatOptions;
    }

    return formatOpts;
  }

  getColumnFormatter(schema: reltab.Schema, cid: string): CellFormatter {
    const cf = this.getColumnFormat(schema, cid);
    const ct = schema.columnType(cid);
    const ff: CellFormatter =
      cf != null ? cf.getFormatter() : defaultCellFormatter(ct);
    return ff;
  }

  getColumnClassName(schema: reltab.Schema, cid: string): string | null {
    const cf = this.getColumnFormat(schema, cid);
    return cf?.getClassName();
  }

  getClickHandler(schema: reltab.Schema, cid: string): ClickHandler {
    const cf = this.getColumnFormat(schema, cid);
    return cf?.getClickHandler() ?? defaultClickHandler;
  }

  setColumnFormat(cid: string, opts: any): ViewParams {
    const nextFmts = this.columnFormats.set(cid, opts);
    return this.set("columnFormats", nextFmts) as ViewParams;
  }

  /** The column goes back to the default format for its type. */
  clearColumnFormat(cid: string): ViewParams {
    return this.set("columnFormats", this.columnFormats.delete(cid)) as ViewParams;
  }

  /**
   * Deserialize ViewParams saved in .tad file format version
   * `fileFormatVersion` (by default, the current version).
   */
  static deserialize(
    savedJS: any,
    fileFormatVersion: number = VIEW_PARAMS_FORMAT_VERSION
  ): ViewParams {
    const js = migrateSavedViewParams(savedJS, fileFormatVersion);
    const { defaultFormats, openPaths, filterExp, columnFormats, ...rest } = js;
    const defaultFormatsObj = FormatDefaults.deserialize(defaultFormats);
    const openPathsObj = new PathTree(openPaths._rep);
    let filterExpObj;

    if (filterExp) {
      filterExpObj = reltab.FilterExp.deserialize(filterExp);
    } else {
      filterExpObj = new reltab.FilterExp();
    }

    const deserColumnFormats = _.mapValues(
      columnFormats,
      deserializeFormatOptions
    ); // drop column formats that we couldn't deserialize;
    // prevents us from falling over on older, malformed
    // saved per-column format options.

    const deserColumnFormatsNN = _.pickBy(deserColumnFormats);

    let columnFormatsMap = Immutable.Map(deserColumnFormatsNN);
    const baseVP = new ViewParams(rest);
    const retVP = baseVP
      .set("defaultFormats", defaultFormatsObj)
      .set("openPaths", openPathsObj)
      .set("filterExp", filterExpObj)
      .set("columnFormats", columnFormatsMap as FormatsMap);
    return retVP as ViewParams;
  }
}
