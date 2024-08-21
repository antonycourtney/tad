export interface CellClickData {
  readonly value: any;
  readonly cell: { readonly row: number; readonly col: number };
  readonly column: {
    readonly displayName: string;
    readonly columnType: string;
    readonly columnId: string;
  };
}
