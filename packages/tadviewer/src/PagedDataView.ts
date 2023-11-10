import * as reltab from "reltab";
/*
 * a variant on SimpleDataView that maintains a total row count
 * and a contiguous subset of rows (a viewport) starting from
 * some offset
 */

// Note: This doesn't explicitly include the '_path' or "_sortVal_X_Y" columns
export interface DataRow {
  _isLeaf: boolean;
  _depth: number;
  _pivot: string;
  _isOpen: boolean;
  [columnId: string]: reltab.Scalar;
}

export class PagedDataView {
  schema: reltab.Schema;
  totalRowCount: number;
  offset: number;
  rawData: Array<DataRow>;

  constructor(
    schema: reltab.Schema,
    totalRowCount: number,
    offset: number,
    items: Array<DataRow>
  ) {
    this.schema = schema;
    this.totalRowCount = totalRowCount;
    this.offset = offset;
    this.rawData = items; // console.log('PagedDataView: trc: ', totalRowCount, ', offset: ', offset)
  } // Unfortunately ambiguous method name comes from SlickGrid

  getLength(): number {
    return this.totalRowCount;
  }

  getOffset(): number {
    return this.offset;
  }

  getItemCount(): number {
    return this.rawData.length;
  }

  getItem(index: number): DataRow | null {
    let ret = null;
    const itemIndex = index - this.offset;

    if (itemIndex >= 0 && itemIndex < this.rawData.length) {
      ret = this.rawData[itemIndex];
    } // console.log('getItem(', index, ') ==> itemIndex: ', itemIndex, ', ret: ', ret)

    return ret;
  }

  getItemMetadata(index: number): any {
    let ret: any = {};
    const item = this.getItem(index);

    if (item && !item._isLeaf) {
      ret.cssClasses = "grid-aggregate-row";
    }

    return ret;
  }
}
