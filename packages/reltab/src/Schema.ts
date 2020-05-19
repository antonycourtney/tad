import _ = require("lodash");
import { ColumnType } from "./ColumnType";

// metadata for a single column:

export type ColumnMetadata = {
  displayName: string;
  type: ColumnType;
};

class SchemaError {
  message: string;
  rest: Array<any>;

  constructor(message: string, ...rest: Array<any>) {
    this.message = message;
    this.rest = rest;
  }
}

export type ColumnMetaMap = {
  [colId: string]: ColumnMetadata;
};
export class Schema {
  columnMetadata: ColumnMetaMap;
  columns: Array<string>;
  columnIndices: {
    [colId: string]: number;
  };
  _sortedColumns: Array<string> | undefined | null;

  constructor(columns: Array<string>, columnMetadata: ColumnMetaMap) {
    // TODO: really need to clone these to be safe
    this.columns = columns;
    this.columnMetadata = columnMetadata;
    this._sortedColumns = null;
    var columnIndices: { [colId: string]: number } = {};

    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      columnIndices[col] = i;
    }

    this.columnIndices = columnIndices;
  }

  columnType(colId: string): ColumnType {
    const md = this.columnMetadata[colId];
    return md.type;
  }

  displayName(colId: string): string {
    const md = this.columnMetadata[colId];
    const dn = (md && md.displayName) || colId;
    return dn;
  }

  columnIndex(colId: string): number {
    return this.columnIndices[colId];
  }

  compatCheck(sb: Schema): boolean {
    if (this.columns.length !== sb.columns.length) {
      throw new SchemaError(
        "incompatible schema: columns length mismatch",
        this,
        sb
      );
    }

    for (var i = 0; i < this.columns.length; i++) {
      var colId = this.columns[i];
      var bColId = sb.columns[i];

      if (colId !== bColId) {
        throw new SchemaError(
          "incompatible schema: expected '" +
            colId +
            "', found '" +
            bColId +
            "'",
          this,
          sb
        );
      }

      var colType = this.columnMetadata[colId].type;
      var bColType = sb.columnMetadata[bColId].type;

      if (colType !== bColType) {
        throw new SchemaError(
          "mismatched column types for col '" +
            colId +
            "': " +
            colType +
            ", " +
            bColType,
          this,
          sb
        );
      }
    }

    return true;
  } // Construct a row map with keys being column ids:

  rowMapFromRow(rowArray: Array<any>): Object {
    var columnIds = this.columns;
    var rowMap: { [cid: string]: any } = {};

    for (var col = 0; col < rowArray.length; col++) {
      rowMap[columnIds[col]] = rowArray[col];
    }

    return rowMap;
  } // calculate extension of this schema (as in extend query):

  extend(colId: string, columnMetadata: ColumnMetadata): Schema {
    var outCols = this.columns.concat([colId]);
    let cMap: { [cid: string]: ColumnMetadata } = {};
    cMap[colId] = columnMetadata;

    var outMetadata = _.extend(cMap, this.columnMetadata);

    var outSchema = new Schema(outCols, outMetadata);
    return outSchema;
  } // returned an array of column ids in locale-sorted order
  // cached lazily

  sortedColumns(): Array<string> {
    let sc = this._sortedColumns;

    if (sc == null) {
      sc = this.columns.slice();
      sc.sort((cid1, cid2) =>
        this.displayName(cid1).localeCompare(this.displayName(cid2))
      );
      this._sortedColumns = sc;
    }

    return sc;
  }
}
