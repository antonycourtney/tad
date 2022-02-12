import * as Immutable from "immutable";
import * as _ from "lodash";
import { Path, PathTree } from "aggtree";
import { QueryExp, ColumnType } from "reltab"; // eslint-disable-line
import * as reltab from "reltab"; // eslint-disable-line

import { TextFormatOptions } from "./TextFormatOptions";
import { NumFormatOptions } from "./NumFormatOptions";

/**
 * Immutable representation of user-configurable view parameters
 *
 */

type AggMap = {
  [cid: string]: reltab.AggFn;
};

export type FormatOptions = TextFormatOptions | NumFormatOptions;
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
  }),
  real: new NumFormatOptions(),
  boolean: new NumFormatOptions({
    decimalPlaces: 0,
  }), // for now...
};

class FormatDefaults extends Immutable.Record(defaultFormatDefaultProps) {
  static deserialize(jsObj: any) {
    const initMap = {
      string: new TextFormatOptions(jsObj["string"]),
      integer: new NumFormatOptions(jsObj["integer"]),
      real: new NumFormatOptions(jsObj["real"]),
      boolean: new NumFormatOptions(jsObj["boolean"]),
    };
    return new FormatDefaults(initMap);
  }
}

export interface ViewParamsProps {
  showRoot: boolean;
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

export type CellFormatter = (val?: any) => string | undefined | null;

const defaultCellFormatter =
  (ct: ColumnType): CellFormatter =>
  (val?: any): string => {
    return ct.stringRender(val);
  };

export class ViewParams
  extends Immutable.Record(defaultViewParamsProps)
  implements ViewParamsProps
{
  public readonly showRoot!: boolean;
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

  setColumnFormat(cid: string, opts: any): ViewParams {
    const nextFmts = this.columnFormats.set(cid, opts);
    return this.set("columnFormats", nextFmts) as ViewParams;
  }

  static deserialize(js: any): ViewParams {
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
