export interface SelectionChangeData {
  readonly value: any;
  readonly column: {
    readonly displayName: string;
    readonly columnType: string;
    readonly columnId: string;
  };
  readonly anchor: {
    readonly row: number;
    readonly column: number;
  };
  readonly focus: {
    readonly row: number;
    readonly column: number;
  };
}
