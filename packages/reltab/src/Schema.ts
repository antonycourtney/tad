import _ = require("lodash");
import { ColumnType } from "./ColumnType";
import { SQLDialect, ensureDialectColumnType } from "./dialect";
import { dialects } from "./dialectRegistry";

export type NumericSummaryStats = {
  statsType: "numeric";
  min: number | null;
  max: number | null;
  approxUnique: number | null;
  count: number;
  pctNull: number | null;
};

export type TextSummaryStats = {
  statsType: "text";
  min: number | null;
  max: number | null;
  approxUnique: number | null;
  count: number;
  pctNull: number | null;
};

// metadata for a single column:
export type ColumnMetadata = {
  displayName: string;
  columnType: string; // full sql type name, e.g. "VARCHAR(255)"
  columnTypeBaseName?: string; // base type name, e.g. "VARCHAR", "DECIMAL", etc.
  columnStats?: NumericSummaryStats | TextSummaryStats;
};

export type ColumnMetaMap = {
  [colId: string]: ColumnMetadata;
};

const validateColumnMetadata = (dialect: SQLDialect, cmap: ColumnMetaMap) => {
  for (let [colId, cmd] of Object.entries(cmap)) {
    ensureDialectColumnType(dialect, cmd.columnType);
  }
};

class SchemaError {
  message: string;
  rest: Array<any>;

  constructor(message: string, ...rest: Array<any>) {
    this.message = message;
    this.rest = rest;
  }
}

interface SchemaJSON {
  dialect: string;
  columns: string[];
  columnMetadata: ColumnMetaMap;
}

export class Schema {
  dialect: SQLDialect;
  columnMetadata: ColumnMetaMap;
  columns: Array<string>;
  columnIndices: {
    [colId: string]: number;
  };
  _sortedColumns: Array<string> | undefined | null;

  constructor(
    dialect: SQLDialect,
    columns: Array<string>,
    columnMetadata: ColumnMetaMap
  ) {
    this.dialect = dialect;
    this.columns = columns.slice();
    this.columnMetadata = columnMetadata;
    validateColumnMetadata(dialect, columnMetadata);
    this._sortedColumns = null;
    var columnIndices: { [colId: string]: number } = {};

    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      columnIndices[col] = i;
    }

    this.columnIndices = columnIndices;
  }

  columnType(colId: string): ColumnType {
    const cmd = this.columnMetadata[colId];
    if (cmd == null) {
      throw new Error(`Schema.columnType: unknown column '${colId}'`);
    }
    const columnTypeName = cmd.columnTypeBaseName ?? cmd.columnType;
    return this.dialect.columnTypes[columnTypeName];
  }

  displayName(colId: string): string {
    const md = this.columnMetadata[colId];
    const dn = (md && md.displayName) || colId;
    return dn;
  }

  columnStats(colId: string): NumericSummaryStats | TextSummaryStats | null {
    const md = this.columnMetadata[colId];
    return md ? md.columnStats || null : null;
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

      var colType = this.columnMetadata[colId].columnType;
      var bColType = sb.columnMetadata[bColId].columnType;

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
  }

  // Construct a row map with keys being column ids:
  rowMapFromRow(rowArray: Array<any>): Object {
    var columnIds = this.columns;
    var rowMap: { [cid: string]: any } = {};

    for (var col = 0; col < rowArray.length; col++) {
      rowMap[columnIds[col]] = rowArray[col];
    }

    return rowMap;
  }

  // calculate extension of this schema (as in extend query):
  extend(colId: string, columnMetadata: ColumnMetadata): Schema {
    var outCols = this.columns.concat([colId]);
    let cMap: { [cid: string]: ColumnMetadata } = {};
    cMap[colId] = columnMetadata;

    var outMetadata = _.extend(cMap, this.columnMetadata);

    var outSchema = new Schema(this.dialect, outCols, outMetadata);
    return outSchema;
  }

  // returned an array of column ids in locale-sorted order
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

  toJSON(): SchemaJSON {
    return {
      dialect: this.dialect.dialectName,
      columns: this.columns,
      columnMetadata: this.columnMetadata,
    };
  }

  static fromJSON(json: SchemaJSON | string): Schema {
    if (typeof json === "string") {
      return JSON.parse(json, Schema.reviver);
    } else {
      const dialect = dialects[json.dialect];
      let schema = new Schema(dialect, json.columns, json.columnMetadata);
      return schema;
    }
  }

  static reviver(key: string, value: any): any {
    return key === "" ? Schema.fromJSON(value) : value;
  }
}
