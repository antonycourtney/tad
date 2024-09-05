export interface SelectionChangeData {
  readonly selectedGridItems: any[][];
  readonly columns: ColumnData[];
  readonly gridAnchor: Cell;
  readonly gridFocus: Cell;
}

export interface Cell {
  readonly row: number;
  readonly column: number;
}

export interface ColumnData {
  readonly displayName: string;
  readonly columnType: string;
  readonly columnId: string;
}
