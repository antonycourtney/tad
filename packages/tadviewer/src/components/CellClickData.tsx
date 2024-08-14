export interface CellClickData {
  readonly value: string;
  readonly cell: { readonly row: number; readonly col: number };
  readonly column: {
    readonly displayName: string;
    readonly columnType: string;
  };
}
