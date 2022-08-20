import { Schema } from "./Schema";
import { Scalar } from "./defs";

export type TableInfo = {
  // tableName: string;
  schema: Schema;
};
export type TableInfoMap = {
  [tableName: string]: TableInfo;
};

export type Row = {
  [columnId: string]: Scalar;
};

export class TableRep {
  schema: Schema;
  rowData: Array<Row>;

  constructor(schema: Schema, rowData: Array<Row>) {
    this.schema = schema;
    this.rowData = rowData;
  }

  getRow(row: number): Row {
    return this.rowData[row];
  }

  getColumn(columnId: string): Array<any> {
    const idx = this.schema.columnIndex(columnId);

    if (idx === undefined) {
      throw new Error('TableRep.getColumn: no such column "' + columnId + '"');
    }

    return this.rowData.map((r) => r[columnId]);
  }
}
