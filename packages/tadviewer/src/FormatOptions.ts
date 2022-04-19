export type CellFormatter = (val?: any) => string | undefined | null;

export interface ClickHandlerAppContext {
  openURL: (url: string) => void;
}

export type ClickHandler = (
  appContext: ClickHandlerAppContext,
  row: number,
  column: number,
  val: any
) => void;

export interface FormatOptions {
  getFormatter(): CellFormatter;
  getClickHandler(): ClickHandler | null;
}
